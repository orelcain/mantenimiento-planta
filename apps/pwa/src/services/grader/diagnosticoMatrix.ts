/**
 * Diagnóstico Matrix — lógica PURA (sin DOM, sin Firestore, sin escritura).
 *
 * Solo lectura: recorre una carpeta que el usuario eligió, ordena los Excel
 * por fecha de modificación y arma el texto que se copia para Claude. La página
 * `DiagnosticoMatrixPage` solo pone la UI encima de estas funciones.
 *
 * Los tipos de carpeta son un subconjunto estructural de la File System Access
 * API: así el recorrido se prueba con objetos falsos, sin depender de `lib.dom`.
 */
import type { MatrixFileKind, ParsedMatrixData, UploadedMatrixFile } from './types'

export const DIAG_MAX_ENTRADAS = 500
/** Niveles de subcarpeta que se recorren debajo de la raíz elegida. */
export const DIAG_MAX_PROFUNDIDAD = 2
/** Cuántos archivos van en el resumen copiado. */
export const DIAG_TOP_RESUMEN = 20

const EXTENSIONES_EXCEL = ['.xls', '.xlsx', '.csv'] as const

export interface ArchivoHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}

export interface CarpetaHandle {
  kind: 'directory'
  name: string
  values(): AsyncIterable<ArchivoHandle | CarpetaHandle>
}

export interface EntradaArchivo {
  /** Ruta relativa a la carpeta elegida, con "/" (p. ej. "2026/pieza.xlsx"). */
  ruta: string
  nombre: string
  tamano: number
  /** Fecha de modificación en epoch ms. */
  modificado: number
  handle: ArchivoHandle
}

export interface ResultadoListado {
  /** Archivos Excel/CSV, el más nuevo primero. */
  archivos: EntradaArchivo[]
  /** Entradas recorridas (archivos y carpetas), hasta el tope. */
  totalEntradas: number
  /** true si había más entradas que el tope y se dejaron afuera. */
  truncado: boolean
  /** Archivos o subcarpetas que el navegador no dejó leer. */
  elementosNoLeidos: number
}

export function esArchivoExcel(nombre: string): boolean {
  const minusc = nombre.toLowerCase()
  return EXTENSIONES_EXCEL.some((ext) => minusc.endsWith(ext))
}

/** Orden más nuevo primero; a igual fecha, por ruta. No muta la entrada. */
export function ordenarPorFechaDesc<T extends { modificado: number; ruta: string }>(entradas: readonly T[]): T[] {
  return [...entradas].sort((a, b) => b.modificado - a.modificado || a.ruta.localeCompare(b.ruta))
}

/**
 * Recorre la carpeta raíz y sus subcarpetas (hasta `maxProfundidad` niveles) y
 * junta los Excel/CSV. Un error al abrir una subcarpeta o un archivo no corta el
 * recorrido: se cuenta en `elementosNoLeidos`. Un error en la raíz sí se propaga
 * (p. ej. AbortError o SecurityError de Chrome) para que la página lo explique.
 */
export async function listarExcelsEnCarpeta(
  raiz: CarpetaHandle,
  opts: { maxEntradas?: number; maxProfundidad?: number } = {},
): Promise<ResultadoListado> {
  const maxEntradas = opts.maxEntradas ?? DIAG_MAX_ENTRADAS
  const maxProfundidad = opts.maxProfundidad ?? DIAG_MAX_PROFUNDIDAD
  const archivos: EntradaArchivo[] = []
  let total = 0
  let truncado = false
  let noLeidos = 0

  async function recorrer(dir: CarpetaHandle, prefijo: string, profundidad: number): Promise<void> {
    for await (const entrada of dir.values()) {
      if (total >= maxEntradas) {
        truncado = true
        return
      }
      total++
      const ruta = prefijo + entrada.name
      if (entrada.kind === 'directory') {
        if (profundidad < maxProfundidad) {
          try {
            await recorrer(entrada, ruta + '/', profundidad + 1)
          } catch {
            noLeidos++
          }
        }
        continue
      }
      if (!esArchivoExcel(entrada.name)) continue
      try {
        const file = await entrada.getFile()
        archivos.push({ ruta, nombre: entrada.name, tamano: file.size, modificado: file.lastModified, handle: entrada })
      } catch {
        noLeidos++
      }
    }
  }

  await recorrer(raiz, '', 0)
  return { archivos: ordenarPorFechaDesc(archivos), totalEntradas: total, truncado, elementosNoLeidos: noLeidos }
}

/** «hace un momento», «hace 5 min», «hace 2 h», «hace 1 día», «hace 3 días». */
export function formatearHaceX(modificado: number, ahora: number): string {
  const seg = Math.max(0, Math.floor((ahora - modificado) / 1000))
  if (seg < 60) return 'hace un momento'
  const min = Math.floor(seg / 60)
  if (min < 60) return `hace ${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `hace ${horas} h`
  const dias = Math.floor(horas / 24)
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`
}

/** Encabezado del listado: «N archivos Excel · el más nuevo hace X». */
export function tituloListado(cantidad: number, masNuevo: number | null, ahora: number): string {
  if (cantidad === 0 || masNuevo === null) return 'Sin archivos Excel en esta carpeta'
  const sustantivo = cantidad === 1 ? 'archivo Excel' : 'archivos Excel'
  return `${cantidad} ${sustantivo} · el más nuevo ${formatearHaceX(masNuevo, ahora)}`
}

const decimal = (n: number): string => n.toFixed(1).replace('.', ',')

export function formatearTamano(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${decimal(bytes / 1024)} KB`
  return `${decimal(bytes / 1024 / 1024)} MB`
}

/** «dd-mm-aaaa hh:mm» en hora local, sin depender del locale del navegador. */
export function formatearFechaCorta(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function separarMiles(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export const ETIQUETA_TIPO: Record<MatrixFileKind, string> = {
  PIEZA_PIEZA: 'Pieza a pieza',
  PUERTA_0: 'Puerta 0',
  PORC_CALIDAD: 'Porcentaje de calidad',
  TOTALES_PRODUCCION: 'Totales de producción',
  TOTAL_PIEZAS_POR_FOLIO: 'Total de piezas por folio',
  UNKNOWN: 'No reconocido',
}

export interface ResumenAnalisis {
  tipo: string
  /** null = el tipo de archivo no trae registros de piezas: no es 0. */
  piezas: number | null
  /** epoch ms del primer y último registro con fecha válida. */
  desde: number | null
  hasta: number | null
  avisos: string[]
}

/** Saca tipo, piezas y rango de fechas de lo que devuelve `parseFile`. */
export function resumirAnalisis(fileMeta: UploadedMatrixFile, partial: Partial<ParsedMatrixData>): ResumenAnalisis {
  const registros = partial.pieceRecords ?? []
  const piezas = registros.length > 0 ? registros.reduce((s, r) => s + r.pieces, 0) : null
  let desde: number | null = null
  let hasta: number | null = null
  for (const r of registros) {
    const t = Date.parse(r.ts)
    if (Number.isNaN(t)) continue
    if (desde === null || t < desde) desde = t
    if (hasta === null || t > hasta) hasta = t
  }
  return {
    tipo: ETIQUETA_TIPO[fileMeta.kind],
    piezas,
    desde,
    hasta,
    avisos: fileMeta.warnings ?? [],
  }
}

/** «Pieza a pieza · 13.366 piezas · 11-08-2026 06:00 → 11-08-2026 18:00». */
export function formatearResumenAnalisis(r: ResumenAnalisis): string {
  const piezas = r.piezas === null ? 'sin dato de piezas' : `${separarMiles(r.piezas)} piezas`
  const desde = r.desde === null ? 'sin fecha' : formatearFechaCorta(r.desde)
  const hasta = r.hasta === null ? 'sin fecha' : formatearFechaCorta(r.hasta)
  return `${r.tipo} · ${piezas} · ${desde} → ${hasta}`
}

export interface NavegadorInfo {
  navegador: string
  version: string
  sistema: string
}

const PRUEBAS_NAVEGADOR: Array<{ nombre: string; re: RegExp }> = [
  { nombre: 'Edge', re: /Edg(?:e|A|iOS)?\/(\d+(?:\.\d+)*)/ },
  { nombre: 'Opera', re: /OPR\/(\d+(?:\.\d+)*)/ },
  { nombre: 'Firefox', re: /Firefox\/(\d+(?:\.\d+)*)/ },
  { nombre: 'Chrome', re: /Chrome\/(\d+(?:\.\d+)*)/ },
  { nombre: 'Safari', re: /Version\/(\d+(?:\.\d+)*).*Safari/ },
]

function detectarSistema(ua: string): string {
  const win = /Windows NT ([\d.]+)/.exec(ua)
  if (win) return `Windows (NT ${win[1]})`
  if (/Android/.test(ua)) return 'Android'
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS'
  if (/Mac OS X/.test(ua)) return 'macOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Sistema desconocido'
}

/** Lee navegador, versión y sistema del `navigator.userAgent`. */
export function detectarNavegador(ua: string): NavegadorInfo {
  const sistema = detectarSistema(ua)
  for (const { nombre, re } of PRUEBAS_NAVEGADOR) {
    const m = re.exec(ua)
    if (m) return { navegador: nombre, version: m[1] ?? '', sistema }
  }
  return { navegador: 'Navegador desconocido', version: '', sistema }
}

export type ResultadoAnalisisArchivo =
  | { ok: true; nombre: string; resumen: ResumenAnalisis }
  | { ok: false; nombre: string; error: string }

export interface DatosResumen {
  generado: number
  navegador: NavegadorInfo
  online: boolean
  lecturaCarpetas: boolean
  /** Nombre de la carpeta elegida. El navegador no entrega la ruta completa. */
  carpeta: { nombre: string; listado: ResultadoListado } | null
  analisis: ResultadoAnalisisArchivo | null
}

/**
 * Texto plano para pegar en Claude: navegador, carpeta, los 20 más nuevos y el
 * análisis del más nuevo. No incluye contenido de los archivos.
 */
export function armarResumenParaClaude(d: DatosResumen): string {
  const lineas: string[] = []
  lineas.push('Diagnóstico Matrix — resumen para Claude')
  lineas.push(`Generado: ${formatearFechaCorta(d.generado)}`)
  const nav = d.navegador
  lineas.push(
    `Navegador: ${nav.navegador}${nav.version ? ' ' + nav.version : ''} · ${nav.sistema}` +
      ` · en línea: ${d.online ? 'sí' : 'no'} · lee carpetas: ${d.lecturaCarpetas ? 'sí' : 'no'}`,
  )

  if (!d.carpeta) {
    lineas.push('Carpeta elegida: ninguna')
  } else {
    const { nombre, listado } = d.carpeta
    lineas.push(`Carpeta elegida: ${nombre} (el navegador solo entrega el nombre, no la ruta completa)`)
    lineas.push(
      `Excel/CSV encontrados: ${listado.archivos.length} · entradas recorridas: ${listado.totalEntradas}` +
        ` · tope alcanzado: ${listado.truncado ? 'sí' : 'no'} · no leídos: ${listado.elementosNoLeidos}`,
    )
    if (listado.archivos.length > 0) {
      lineas.push(`Los ${Math.min(DIAG_TOP_RESUMEN, listado.archivos.length)} más nuevos:`)
      listado.archivos.slice(0, DIAG_TOP_RESUMEN).forEach((a, i) => {
        lineas.push(`  ${i + 1}. ${a.ruta} · ${formatearTamano(a.tamano)} · ${formatearFechaCorta(a.modificado)}`)
      })
    }
  }

  if (d.analisis) {
    if (d.analisis.ok) {
      lineas.push(`Análisis de ${d.analisis.nombre}: ${formatearResumenAnalisis(d.analisis.resumen)}`)
      for (const aviso of d.analisis.resumen.avisos) lineas.push(`  aviso del parser: ${aviso}`)
    } else {
      lineas.push(`Análisis de ${d.analisis.nombre}: error — ${d.analisis.error}`)
    }
  }

  return lineas.join('\n')
}
