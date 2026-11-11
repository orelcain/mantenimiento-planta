/**
 * Subida de documentos de equipos (manuales, catálogos, planos de la GEA y otros) desde el panel
 * de administración. Reglas puras, separadas de la página para poder probarlas.
 */

/** Tope por archivo: los catálogos de la GEA llegan a ~100 MB. Storage permite un poco más (101 MB). */
export const LIMITE_ARCHIVO_BYTES = 100 * 1024 * 1024

/** Carpeta de Storage de estos documentos (ver `storage.rules`, solo admin escribe). */
export const CARPETA_DOCUMENTOS = 'documentosEquipos'

/** Nombre apto para una ruta de Storage: sin barras ni caracteres raros, conserva la extensión. */
export function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return limpio || 'archivo'
}

/** Ruta en Storage: por equipo, con marca de tiempo para que dos archivos de igual nombre no se pisen. */
export function rutaDocumento(equipoId: string, nombre: string, ahora: number): string {
  return `${CARPETA_DOCUMENTOS}/${equipoId}/${ahora}_${nombreSeguro(nombre)}`
}

/** Título legible para la lista de manuales: el nombre sin extensión. */
export function tituloDeArchivo(nombre: string): string {
  const sinExt = nombre.replace(/\.[^.]+$/, '').trim()
  return sinExt || nombre
}

export function formatoTamano(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString('es-CL')} KB`
  return `${bytes} B`
}

/** Separa los archivos que se pueden subir de los que pasan el tope (o vienen vacíos). */
export function separarPorTamano<T extends { name: string; size: number }>(archivos: readonly T[]): { validos: T[]; rechazados: Array<{ archivo: T; motivo: string }> } {
  const validos: T[] = []
  const rechazados: Array<{ archivo: T; motivo: string }> = []
  for (const a of archivos) {
    if (a.size <= 0) rechazados.push({ archivo: a, motivo: 'está vacío' })
    else if (a.size > LIMITE_ARCHIVO_BYTES) rechazados.push({ archivo: a, motivo: `pesa ${formatoTamano(a.size)}; el tope es 100 MB` })
    else validos.push(a)
  }
  return { validos, rechazados }
}
