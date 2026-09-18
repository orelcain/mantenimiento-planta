import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage'
import { storage } from '@/services/firebase'
import { processImageForUpload } from '@/utils/images/processImage'
import { generateId } from '@/lib/utils'
import type { EtiquetaFoto, FotoEvento } from './bitacora.types'
import { encolarBorrado, purgarBorradosPendientes, quitarBorrado } from './borradosPendientes'

/**
 * Fotos de la bitácora.
 *
 * ⚠ Se suben en JPEG, NO en WebP (el preset general de la app convierte a
 * WebP): Outlook clásico no muestra WebP al pegar el correo y jsPDF tampoco
 * lo acepta en `addImage`. 1600 px y ~350 KB alcanzan de sobra para el correo
 * (se muestra a 300 px) y para ampliar en pantalla.
 *
 * Ruta: `bitacora/{turnoId}/{eventoId}/{archivo}` — 3 segmentos después de
 * `bitacora`, igual que el `match` de storage.rules (contar segmentos: un path
 * que no calza con ninguna regla falla con `storage/unauthorized`).
 */
const OPCIONES = { maxWidth: 1600, maxHeight: 1600, quality: 0.82, targetBytes: 350 * 1024, preferWebP: false }

/**
 * Miniatura para la LISTA. La foto buena pesa ~300 KB y en la fila se pinta a
 * 48 px: un turno de 13 fotos bajaba 3,4 MB por 4G solo para los cuadraditos, y
 * en iPhone se veían rotas (medido el 18-09-2026). A 320 px son ~20 KB cada una.
 *
 * Vive JUNTO a la foto, con el mismo id y el prefijo `t_`: así `miniaturaDe()`
 * la deriva del path y el borrado la arrastra sin que ningún llamador cambie.
 */
const ANCHO_MINIATURA = 320
const CALIDAD_MINIATURA = 0.7
const PREFIJO_MINIATURA = 't_'

/** `bitacora/T/E/abc.jpg` → `bitacora/T/E/t_abc.jpg`. */
export function miniaturaDe(path: string): string {
  const corte = path.lastIndexOf('/')
  return `${path.slice(0, corte + 1)}${PREFIJO_MINIATURA}${path.slice(corte + 1)}`
}

/** Sin `fetch`: la CSP (`connect-src`) no admite URLs `data:`. */
function dataUrlABlob(dataUrl: string): Blob {
  const [cabecera = '', datos = ''] = dataUrl.split(',')
  const tipo = cabecera.match(/^data:([^;]+)/)?.[1] ?? 'image/jpeg'
  const binario = atob(datos)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: tipo })
}

export async function subirFotoBitacora(
  turnoId: string,
  eventoId: string,
  archivo: File,
  etiqueta: EtiquetaFoto,
): Promise<FotoEvento> {
  if (!archivo.type.startsWith('image/')) throw new Error(`"${archivo.name}" no es una imagen.`)
  const procesada = await processImageForUpload(archivo, OPCIONES)
  let blob: Blob = procesada.file
  let ancho = procesada.width
  let alto = procesada.height

  if (procesada.format === 'original' && procesada.width === 0) {
    // El navegador no pudo decodificarla (HEIC de iPhone, RAW…): tampoco la
    // mostraría Outlook ni el PDF. Mejor decirlo ahora que subir algo inservible.
    throw new Error('Formato de foto no compatible. Usa JPG (en iPhone: Ajustes › Cámara › Formatos › Más compatible).')
  }
  if (procesada.file.type === 'image/webp') {
    // `processImageForUpload` devuelve un WebP chico TAL CUAL (idempotencia),
    // aunque se le pida JPEG. Se re-codifica aquí.
    const url = URL.createObjectURL(procesada.file)
    try {
      const jpeg = await cargarFotoComoJpeg(url, OPCIONES.maxWidth, OPCIONES.quality)
      blob = dataUrlABlob(jpeg.dataUrl)
      ancho = jpeg.ancho
      alto = jpeg.alto
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  const tipo = blob.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const path = `bitacora/${turnoId}/${eventoId}/${generateId()}.${tipo === 'image/png' ? 'png' : 'jpg'}`
  const r = storageRef(storage, path)
  await uploadBytes(r, blob, { contentType: tipo })
  const url = await getDownloadURL(r)
  const foto: FotoEvento = { url, path, etiqueta }
  if (ancho > 0 && alto > 0) {
    foto.ancho = ancho
    foto.alto = alto
  }
  // La miniatura es un EXTRA: si falla, la foto ya está subida y la lista cae a
  // la original. Nunca se aborta la subida por no poder achicarla.
  const mini = await subirMiniatura(path, blob).catch(() => null)
  if (mini) {
    foto.thumbUrl = mini.url
    foto.thumbPath = mini.path
  }
  return foto
}

async function subirMiniatura(pathFoto: string, blob: Blob): Promise<{ url: string; path: string }> {
  const objectUrl = URL.createObjectURL(blob)
  try {
    const chica = await cargarFotoComoJpeg(objectUrl, ANCHO_MINIATURA, CALIDAD_MINIATURA)
    const path = miniaturaDe(pathFoto)
    const r = storageRef(storage, path)
    await uploadBytes(r, dataUrlABlob(chica.dataUrl), { contentType: 'image/jpeg' })
    return { url: await getDownloadURL(r), path }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** Borra el objeto; si ya no existía no es un error (el objetivo se cumplió). */
export async function borrarFotoBitacora(path: string): Promise<void> {
  // La miniatura se borra por su cuenta y en silencio: es derivada, y las fotos
  // anteriores al 18-09-2026 no tienen ninguna.
  if (!path.includes(`/${PREFIJO_MINIATURA}`)) {
    void deleteObject(storageRef(storage, miniaturaDe(path))).catch(() => undefined)
  }
  try {
    await deleteObject(storageRef(storage, path))
    quitarBorrado(path)
  } catch (e) {
    if ((e as { code?: string })?.code !== 'storage/object-not-found') throw e
    quitarBorrado(path)
  }
}

/**
 * Borra una foto que YA no tiene dueño (un borrador cancelado, una foto quitada
 * al editar). Si falla —sin señal, que es lo normal en planta— queda anotada
 * para reintentarlo: si no, el archivo se queda pagándose para siempre sin que
 * ningún documento lo mencione.
 */
export async function borrarFotoOEncolar(path: string): Promise<void> {
  try {
    await borrarFotoBitacora(path)
  } catch {
    encolarBorrado(path)
  }
}

/** Vacía la cola de borrados pendientes (al abrir la bitácora y al volver la señal). */
export function purgarFotosPendientes(): Promise<{ borradas: number; pendientes: number }> {
  return purgarBorradosPendientes((path) => borrarFotoBitacora(path))
}

/**
 * Carga una foto para dibujarla en un canvas sin contaminarlo (`crossOrigin`).
 * Si el servidor no autoriza el origen, falla aquí y no al exportar el canvas.
 */
export function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('No se pudo cargar la foto.'))
    el.src = url
  })
}

export interface ImagenCargada {
  dataUrl: string
  ancho: number
  alto: number
}

/**
 * Carga una foto y la re-codifica en JPEG a `anchoMax` (para el PDF y para la
 * copia con fotos incrustadas).
 *
 * Con `<img>` y no con `fetch`: la CSP de la app (index.html) deja `img-src`
 * abierto a `https: data: blob:` pero `connect-src` NO admite `data:`, así que
 * `fetch` de una foto recién elegida fallaba. El endpoint de descarga de
 * Firebase Storage responde `Access-Control-Allow-Origin: *`: con
 * `crossOrigin='anonymous'` el canvas no queda contaminado y `toDataURL` sirve.
 */
export async function cargarFotoComoJpeg(url: string, anchoMax: number, calidad = 0.8): Promise<ImagenCargada> {
  const img = await cargarImagen(url)
  const escala = Math.min(1, anchoMax / img.naturalWidth)
  const ancho = Math.max(1, Math.round(img.naturalWidth * escala))
  const alto = Math.max(1, Math.round(img.naturalHeight * escala))
  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no permitió procesar la foto.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(img, 0, 0, ancho, alto)
  return { dataUrl: canvas.toDataURL('image/jpeg', calidad), ancho, alto }
}
