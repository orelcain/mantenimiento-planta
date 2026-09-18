import { ETIQUETA_FOTO } from '@/config/bitacora'
import { tecnicosDelEvento } from './bitacora.types'
import { partesImpacto } from './bitacoraCorreo'
import type { LaminaWhatsapp } from './bitacoraWhatsapp'
import { cargarImagen } from './fotosBitacora'
import { codigoEquipoDe, etiquetaTipo, horarioEvento, lineasRepuestos, tituloDe } from './presentacionEvento'

/**
 * Dibuja una LÁMINA de WhatsApp: una imagen de 1080 px de ancho con las fotos
 * del evento, su hora, equipo, impacto y lo que se hizo (mockup aprobado
 * 16-09-2026). 1080 px es el ancho al que WhatsApp la muestra sin achicarla;
 * el alto sale del contenido (la descripción se corta en 10 líneas y va
 * completa en el mensaje).
 *
 * Fondo blanco en ambos temas: es una imagen, como el papel del correo.
 */

const ANCHO = 1080
const MARGEN = 64
const UTIL = ANCHO - MARGEN * 2
const SEPARACION = 20
const ALTO_ROTULO = 48
const FUENTE = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif'
const MAX_LINEAS_DESCRIPCION = 10

// Mismos colores que el correo: la lámina y el correo son el mismo documento.
const C = {
  fondo: '#FFFFFF',
  tinta: '#1C1C1E',
  sec: '#6E6E71',
  caja: '#EFEFF4',
  linea: '#E5E5EA',
  parada: '#B3261E',
  ventana: '#1E7B34',
  /** Afectó sin detener: ni el rojo de la parada ni el verde de «sin costo». */
  afectado: '#8A5A00',
  pendiente: '#8A5300',
}

const fuente = (peso: number, px: number) => `${peso} ${px}px ${FUENTE}`

type Medir = (texto: string) => number

/** Parte un texto en líneas que caben en `ancho` (respeta los saltos; corta palabras larguísimas). */
export function partirLineas(medir: Medir, texto: string, ancho: number): string[] {
  const lineas: string[] = []
  for (const parrafo of texto.split(/\r?\n/)) {
    const palabras = parrafo.split(/\s+/).filter(Boolean)
    if (!palabras.length) {
      if (lineas.length) lineas.push('')
      continue
    }
    let actual = ''
    for (const original of palabras) {
      let palabra = original
      while (medir(palabra) > ancho && palabra.length > 1) {
        let n = palabra.length - 1
        while (n > 1 && medir(palabra.slice(0, n)) > ancho) n--
        if (actual) lineas.push(actual)
        actual = ''
        lineas.push(palabra.slice(0, n))
        palabra = palabra.slice(n)
      }
      const prueba = actual ? `${actual} ${palabra}` : palabra
      if (medir(prueba) <= ancho) actual = prueba
      else {
        if (actual) lineas.push(actual)
        actual = palabra
      }
    }
    if (actual) lineas.push(actual)
  }
  while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop()
  return lineas
}

/** Deja `max` líneas; si sobró texto, la última termina en «…». */
export function recortarLineas(medir: Medir, lineas: readonly string[], max: number, ancho: number): string[] {
  if (lineas.length <= max) return [...lineas]
  const salida = lineas.slice(0, max)
  let ultima = salida[max - 1] ?? ''
  while (ultima && medir(`${ultima}…`) > ancho) ultima = ultima.slice(0, -1)
  salida[max - 1] = `${ultima.trimEnd()}…`
  return salida
}

export interface Caja {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Dónde va cada foto (1 a 4) dentro del ancho útil. El alto de cada fila
 * incluye el rótulo («Antes», «Después») de abajo.
 */
export function cajasFotos(n: number, ancho = UTIL): { cajas: Caja[]; alto: number } {
  if (n <= 0) return { cajas: [], alto: 0 }
  const columnas = n === 1 ? 1 : n === 3 ? 3 : 2
  const altoFoto = n === 1 ? 760 : n === 2 ? 640 : n === 3 ? 460 : 500
  const w = (ancho - SEPARACION * (columnas - 1)) / columnas
  const filas = Math.ceil(n / columnas)
  const paso = altoFoto + ALTO_ROTULO + SEPARACION
  const cajas = Array.from({ length: n }, (_, i) => ({
    x: (i % columnas) * (w + SEPARACION),
    y: Math.floor(i / columnas) * paso,
    w,
    h: altoFoto,
  }))
  return { cajas, alto: filas * (altoFoto + ALTO_ROTULO) + (filas - 1) * SEPARACION }
}

function rectanguloRedondeado(ctx: CanvasRenderingContext2D, c: Caja, r: number) {
  ctx.beginPath()
  ctx.moveTo(c.x + r, c.y)
  ctx.arcTo(c.x + c.w, c.y, c.x + c.w, c.y + c.h, r)
  ctx.arcTo(c.x + c.w, c.y + c.h, c.x, c.y + c.h, r)
  ctx.arcTo(c.x, c.y + c.h, c.x, c.y, r)
  ctx.arcTo(c.x, c.y, c.x + c.w, c.y, r)
  ctx.closePath()
}

type Imagen = HTMLImageElement | HTMLCanvasElement | ImageBitmap

function tamano(img: Imagen): { w: number; h: number } {
  if (img instanceof HTMLImageElement) return { w: img.naturalWidth, h: img.naturalHeight }
  return { w: img.width, h: img.height }
}

/** Dibuja la lámina. Las fotos que no están en `imagenes` salen como «Foto no disponible». */
export function dibujarLamina(l: LaminaWhatsapp, imagenes: ReadonlyMap<string, Imagen>): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO
  canvas.height = 1
  const medidor = canvas.getContext('2d')
  if (!medidor) throw new Error('El navegador no permitió dibujar la lámina.')
  const medirCon = (f: string): Medir => (t) => {
    medidor.font = f
    return medidor.measureText(t).width
  }

  const e = l.evento
  const F = {
    cabecera: fuente(400, 28),
    titulo: fuente(700, 60),
    subtitulo: fuente(600, 40),
    meta: fuente(400, 34),
    impacto: fuente(600, 34),
    descripcion: fuente(400, 38),
    pie: fuente(400, 28),
    rotulo: fuente(600, 30),
    repuestos: fuente(400, 32),
  }

  // ── Contenido ──
  // «Evento 2 · lámina 2 de 6»: el número del evento en el mensaje y la posición de la lámina.
  const derechaCabecera = [`Evento ${l.numeroEvento}`, l.total > 1 ? `lámina ${l.numero} de ${l.total}` : ''].filter(Boolean).join(' · ')
  const principal = e.equipo?.trim() || etiquetaTipo(e)
  const lineasTitulo = recortarLineas(medirCon(F.titulo), partirLineas(medirCon(F.titulo), principal, UTIL), 2, UTIL)
  const titulo = tituloDe(e)
  const lineasSub = titulo ? recortarLineas(medirCon(F.subtitulo), partirLineas(medirCon(F.subtitulo), titulo, UTIL), 2, UTIL) : []
  const codigo = codigoEquipoDe(e)
  const meta = [
    horarioEvento(e),
    e.equipo?.trim() ? etiquetaTipo(e) : '',
    codigo ? (/^\d+$/.test(codigo) ? `N° ${codigo}` : codigo) : '',
    l.partes > 1 ? `fotos ${l.parte} de ${l.partes}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
  const lineasMeta = meta ? partirLineas(medirCon(F.meta), meta, UTIL) : []
  const impacto = partesImpacto(e).join(' · ')
  const lineasImpacto = impacto ? recortarLineas(medirCon(F.impacto), partirLineas(medirCon(F.impacto), impacto, UTIL), 3, UTIL) : []
  const colorImpacto =
    e.impacto === 'con-parada' ? C.parada
    : e.impacto === 'afecta-sin-detener' ? C.afectado
    : e.impacto === 'en-ventana' ? C.ventana
    : C.sec
  const avisoPendiente = e.pendiente ? 'Pendiente para el turno siguiente' : ''
  // La descripción va en la primera lámina del evento; las siguientes son solo fotos.
  const descripcion = l.parte === 1 ? (e.descripcion ?? '').trim() : ''
  const lineasDesc = descripcion
    ? recortarLineas(medirCon(F.descripcion), partirLineas(medirCon(F.descripcion), descripcion, UTIL), MAX_LINEAS_DESCRIPCION, UTIL)
    : []
  // Repuestos en la primera lámina del evento, bajo la descripción: rótulo y
  // un renglón por repuesto (hasta 5 líneas).
  const lineasRep =
    l.parte === 1 ? recortarLineas(medirCon(F.repuestos), partirLineas(medirCon(F.repuestos), lineasRepuestos(e).join('\n'), UTIL), 5, UTIL) : []
  const anchoPlanta = medirCon(F.pie)(l.planta)
  const anchoPie = UTIL - anchoPlanta - 24
  const lineasPie = recortarLineas(medirCon(F.pie), partirLineas(medirCon(F.pie), tecnicosDelEvento(e).join(' · '), anchoPie), 2, anchoPie)
  const { cajas, alto: altoFotos } = cajasFotos(l.fotos.length)

  // ── Alto ──
  let alto = MARGEN + 36 + 28
  alto += lineasTitulo.length * 70
  if (lineasSub.length) alto += 6 + lineasSub.length * 50
  alto += 14 + lineasMeta.length * 44 + lineasImpacto.length * 44 + (avisoPendiente ? 44 : 0)
  if (cajas.length) alto += 32 + altoFotos
  if (lineasDesc.length) alto += 32 + lineasDesc.length * 52
  if (lineasRep.length) alto += 20 + lineasRep.length * 44
  alto += 40 + Math.max(1, lineasPie.length) * 36 + MARGEN - 8

  canvas.height = Math.ceil(alto)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no permitió dibujar la lámina.')
  ctx.textBaseline = 'top'
  ctx.fillStyle = C.fondo
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const texto = (t: string, x: number, y: number, f: string, color: string, alinear: CanvasTextAlign = 'left') => {
    ctx.font = f
    ctx.fillStyle = color
    ctx.textAlign = alinear
    ctx.fillText(t, x, y)
  }

  // ── Dibujo ──
  let y = MARGEN
  texto(`Bitácora de Mantención · ${l.turnoCorto}`, MARGEN, y, F.cabecera, C.sec)
  if (derechaCabecera) texto(derechaCabecera, ANCHO - MARGEN, y, F.cabecera, C.sec, 'right')
  y += 36 + 28

  for (const linea of lineasTitulo) {
    texto(linea, MARGEN, y, F.titulo, C.tinta)
    y += 70
  }
  if (lineasSub.length) {
    y += 6
    for (const linea of lineasSub) {
      texto(linea, MARGEN, y, F.subtitulo, C.tinta)
      y += 50
    }
  }
  y += 14
  for (const linea of lineasMeta) {
    texto(linea, MARGEN, y, F.meta, C.sec)
    y += 44
  }
  for (const linea of lineasImpacto) {
    texto(linea, MARGEN, y, F.impacto, colorImpacto)
    y += 44
  }
  if (avisoPendiente) {
    texto(avisoPendiente, MARGEN, y, F.impacto, C.pendiente)
    y += 44
  }

  if (cajas.length) {
    y += 32
    cajas.forEach((base, i) => {
      const foto = l.fotos[i]
      if (!foto) return
      const caja: Caja = { ...base, x: base.x + MARGEN, y: base.y + y }
      ctx.save()
      rectanguloRedondeado(ctx, caja, 24)
      ctx.fillStyle = C.caja
      ctx.fill()
      ctx.clip()
      const img = imagenes.get(foto.url)
      const t = img ? tamano(img) : null
      if (img && t && t.w > 0 && t.h > 0) {
        // Completa, sin recortar: la parte importante puede estar en el borde.
        const escala = Math.min(caja.w / t.w, caja.h / t.h)
        const w = t.w * escala
        const h = t.h * escala
        ctx.drawImage(img, caja.x + (caja.w - w) / 2, caja.y + (caja.h - h) / 2, w, h)
      } else {
        ctx.textBaseline = 'middle'
        texto('Foto no disponible', caja.x + caja.w / 2, caja.y + caja.h / 2, F.rotulo, C.sec, 'center')
        ctx.textBaseline = 'top'
      }
      ctx.restore()
      ctx.textBaseline = 'top'
      texto(ETIQUETA_FOTO[foto.etiqueta], caja.x, caja.y + caja.h + 10, F.rotulo, C.sec)
    })
    y += altoFotos
  }

  if (lineasDesc.length) {
    y += 32
    for (const linea of lineasDesc) {
      texto(linea, MARGEN, y, F.descripcion, C.tinta)
      y += 52
    }
  }
  if (lineasRep.length) {
    y += 20
    for (const linea of lineasRep) {
      texto(linea, MARGEN, y, F.repuestos, C.sec)
      y += 44
    }
  }

  y += 24
  ctx.fillStyle = C.linea
  ctx.fillRect(MARGEN, y, UTIL, 2)
  y += 16
  texto(l.planta, ANCHO - MARGEN, y, F.pie, C.sec, 'right')
  for (const linea of lineasPie) {
    texto(linea, MARGEN, y, F.pie, C.sec)
    y += 36
  }
  return canvas
}

export function canvasAPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen.'))), 'image/png')
  })
}

/** Caché de fotos cargadas: la misma foto no se descarga dos veces al redibujar. */
export type CacheImagenes = Map<string, Promise<HTMLImageElement | null>>

/** Carga las fotos de la lámina y la dibuja. `fallidas` = fotos que no se pudieron cargar. */
export async function generarLamina(l: LaminaWhatsapp, cache: CacheImagenes): Promise<{ png: Blob; fallidas: number }> {
  const imagenes = new Map<string, HTMLImageElement>()
  let fallidas = 0
  await Promise.all(
    l.fotos.map(async (f) => {
      let promesa = cache.get(f.url)
      if (!promesa) {
        promesa = cargarImagen(f.url).catch(() => null)
        cache.set(f.url, promesa)
        // Una foto que falló (señal) se vuelve a intentar en el próximo dibujo.
        const url = f.url
        void promesa.then((img) => {
          if (!img) cache.delete(url)
        })
      }
      const img = await promesa
      if (img) imagenes.set(f.url, img)
      else fallidas++
    }),
  )
  return { png: await canvasAPng(dibujarLamina(l, imagenes)), fallidas }
}
