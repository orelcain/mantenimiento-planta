/**
 * Lógica pura del espejo del grader: convierte las cadenas que envía el lector del
 * PC de planta (informe «Pieza pieza Grader», 11 celdas + `#n`, unidas por TAB) en
 * piezas, y calcula lo que muestra la tarjeta (piezas, Gate 0, P0 %, horas y la
 * coincidencia del turno de Matrix con el turno que asigna la regla de la app).
 *
 * El turno NO se reimplementa: las piezas se adaptan a `PieceRecord` y se reparten
 * con `segmentByDayAndShift`, la misma función que usa `derivarSegmentosTurno`
 * (guardarTurnoGrader.ts) al cargar el Excel.
 *
 * Convención de hora: la misma del parser del Excel, «wall-clock-as-UTC»
 * (`2026-11-19T00:02:39.000Z` = 00:02:39 de planta). Nada aquí usa la zona del
 * navegador.
 *
 * Contrato de las cadenas: espejo-grader-e1-contrato.md.
 */
import { segmentByDayAndShift, type ShoplogixShiftWindow } from '../graderSegmenter'
import { DEFAULT_SHIFT_SCHEDULE } from '../graderShiftSchedule'
import { normalizeCalibre } from '../graderExcelParser'
import type { CalibreRange, PieceRecord } from '../types'

export interface PiezaEspejo {
  /** Cadena original completa (clave de deduplicación). */
  cadena: string
  /** ISO wall-clock-as-UTC: `YYYY-MM-DDTHH:MM:SS.000Z`. */
  ts: string
  fecha: string
  hora: string
  /** Peso en kg (la celda trae «4,32 kg»). `null` si no se pudo leer. */
  pesoKg: number | null
  cantidad: number
  lote: string
  gate: number
  calidad: string
  conservacion: string
  calibre: CalibreRange
  producto: string
  /** Letra de turno que trae Matrix («A», «B»…); vacío si no viene. */
  turnoMatrix: string
}

const RX_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RX_HORA = /^\d{2}:\d{2}:\d{2}$/
const RX_ENTERO = /^\d+$/
/** 11 celdas del informe `pieza` + el ordinal `#n`. */
const CAMPOS_PIEZA = 12

/** «4,32 kg» → 4.32. Coma decimal; si trae punto de miles («1.234,5 kg») también. */
export function parsearPesoKg(celda: string): number | null {
  const limpio = celda.replace(/kg/i, '').trim()
  if (!limpio) return null
  const normal = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio
  const n = Number(normal)
  return Number.isFinite(n) ? n : null
}

/** Una cadena del contrato → pieza, o `null` si está mal formada (no rompe nunca). */
export function parsearFila(cadena: string): PiezaEspejo | null {
  if (typeof cadena !== 'string') return null
  const partes = cadena.split('\t')
  if (partes.length < CAMPOS_PIEZA) return null
  const c = partes.map((x) => x.trim())
  const fecha = c[0] ?? ''
  const hora = c[1] ?? ''
  if (!RX_FECHA.test(fecha) || !RX_HORA.test(hora)) return null
  // `Number('')` es 0: una celda vacía NO puede pasar por «Gate 0» ni por «0 piezas».
  const celdaCantidad = c[3] ?? ''
  const celdaGate = c[5] ?? ''
  if (!RX_ENTERO.test(celdaCantidad) || !RX_ENTERO.test(celdaGate)) return null
  const cantidad = Number(celdaCantidad)
  const gate = Number(celdaGate)
  const ts = `${fecha}T${hora}.000Z`
  if (Number.isNaN(Date.parse(ts))) return null
  return {
    cadena,
    ts,
    fecha,
    hora,
    pesoKg: parsearPesoKg(c[2] ?? ''),
    cantidad,
    lote: c[4] ?? '',
    gate,
    calidad: c[6] ?? '',
    conservacion: c[7] ?? '',
    calibre: normalizeCalibre(c[8] ?? ''),
    producto: c[9] ?? '',
    turnoMatrix: (c[10] ?? '').toUpperCase().replace(/^TURNO\s*/, ''),
  }
}

/**
 * Deduplica por cadena COMPLETA. El ordinal `#n` va dentro de la cadena: dos filas
 * idénticas en la tabla llegan como `…#0` y `…#1` y cuentan como piezas distintas.
 */
export function deduplicarCadenas(cadenas: readonly string[]): string[] {
  return Array.from(new Set(cadenas))
}

export function ordenarPorHora(piezas: readonly PiezaEspejo[]): PiezaEspejo[] {
  return [...piezas].sort((a, b) => {
    if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1
    return a.cadena < b.cadena ? -1 : a.cadena > b.cadena ? 1 : 0
  })
}

/** Cadenas → piezas únicas, ordenadas por hora. Las mal formadas se cuentan aparte. */
export function parsearFilas(cadenas: readonly string[]): { piezas: PiezaEspejo[]; descartadas: number } {
  const piezas: PiezaEspejo[] = []
  let descartadas = 0
  for (const cad of deduplicarCadenas(cadenas)) {
    const p = parsearFila(cad)
    if (p) piezas.push(p)
    else descartadas++
  }
  return { piezas: ordenarPorHora(piezas), descartadas }
}

/** Piezas contadas por la columna «Cantidad de piezas» (una fila casi siempre vale 1). */
export function contarPiezas(piezas: readonly PiezaEspejo[]): number {
  let n = 0
  for (const p of piezas) n += p.cantidad
  return n
}

export function piezasGate0(piezas: readonly PiezaEspejo[]): number {
  let n = 0
  for (const p of piezas) if (p.gate === 0) n += p.cantidad
  return n
}

/**
 * P0 % = piezas de Gate 0 / piezas totales. Sin ninguna Gate 0 devuelve `null`:
 * todavía no se sabe si el informe las trae (la prueba de vida lo mide), y un
 * 0 % inventado sería mentira.
 */
export function p0Pct(piezas: readonly PiezaEspejo[]): number | null {
  const g0 = piezasGate0(piezas)
  const total = contarPiezas(piezas)
  if (g0 === 0 || total === 0) return null
  return (g0 / total) * 100
}

/** Primera y última pieza, o `null` sin piezas. */
export function primeraYUltima(piezas: readonly PiezaEspejo[]): { primera: PiezaEspejo; ultima: PiezaEspejo } | null {
  if (piezas.length === 0) return null
  const o = ordenarPorHora(piezas)
  const primera = o[0]
  const ultima = o[o.length - 1]
  return primera && ultima ? { primera, ultima } : null
}

/** Adapta una pieza del espejo al tipo que espera el segmentador de la app. */
export function aRegistro(p: PiezaEspejo): PieceRecord {
  return {
    ts: p.ts,
    gate: p.gate,
    pieces: p.cantidad,
    weightKg: p.pesoKg ?? undefined,
    calibre: p.calibre,
    lot: p.lote || undefined,
    product: p.producto || undefined,
    shift: p.turnoMatrix || undefined,
  }
}

const MS_DIA = 86_400_000
const MS_TURNO = 13 * 3_600_000

/** `YYYY-MM-DD` de un instante en convención wall-clock-as-UTC. */
function diaDe(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Fechas (`YYYY-MM-DD`, de planta) que toca un turno: desde el día de `inicio` hasta el
 * día del fin efectivo de la ventana (`fin`, o `inicio` + 13 h igual que `ventanaDelTurno`).
 * Un turno que cruza medianoche incluye el día siguiente.
 */
export function fechasDelTurno(inicio: string | null | undefined, fin: string | null | undefined): string[] {
  const startMs = inicio ? Date.parse(inicio) : NaN
  if (Number.isNaN(startMs)) {
    const out = new Set<string>()
    if (fin && RX_FECHA.test(fin.slice(0, 10))) out.add(fin.slice(0, 10))
    return Array.from(out).sort()
  }
  const finMs = fin ? Date.parse(fin) : NaN
  const endMs = Number.isNaN(finMs) || finMs <= startMs ? startMs + MS_TURNO : finMs
  const out: string[] = []
  const ultimo = Date.parse(`${diaDe(endMs)}T00:00:00.000Z`)
  for (let t = Date.parse(`${diaDe(startMs)}T00:00:00.000Z`); t <= ultimo; t += MS_DIA) out.push(diaDe(t))
  return out
}

/** Ventana del turno que se mira, en la convención del segmentador. */
export function ventanaDelTurno(args: {
  dateKey: string
  inicio: string
  fin: string | null | undefined
  turnoId?: string | null
}): ShoplogixShiftWindow | null {
  const startMs = Date.parse(args.inicio)
  if (Number.isNaN(startMs)) return null
  const finMs = args.fin ? Date.parse(args.fin) : NaN
  return {
    sessionDate: args.dateKey,
    shiftId: args.turnoId || 'Turno en curso',
    startMs,
    endMs: Number.isNaN(finMs) || finMs <= startMs ? startMs + 13 * 3_600_000 : finMs,
  }
}

export interface CoincidenciaTurno {
  /** Letra mayoritaria de Matrix dentro del turno de la app. */
  letra: string
  /** % de piezas (con letra) cuya letra es la mayoritaria. */
  pct: number
}

/** Letra mayoritaria y su participación, ponderada por piezas; `null` sin letras. */
export function coincidenciaDeLetras(registros: readonly PieceRecord[]): CoincidenciaTurno | null {
  const peso = new Map<string, number>()
  let total = 0
  for (const r of registros) {
    if (!r.shift || r.pieces <= 0) continue
    peso.set(r.shift, (peso.get(r.shift) ?? 0) + r.pieces)
    total += r.pieces
  }
  if (total === 0) return null
  let letra = ''
  let max = -1
  for (const [l, w] of peso) {
    if (w > max || (w === max && l < letra)) { letra = l; max = w }
  }
  return { letra, pct: (max / total) * 100 }
}

export interface ResumenEspejo {
  /** Piezas del turno; sin ventana y sin turno asignable, todas las leídas. Con ventana, vacío si no cae nada. */
  piezas: PiezaEspejo[]
  total: number
  gate0: number
  p0: number | null
  /** Hora `HH:MM:SS` de la primera y la última pieza. */
  primera: string | null
  ultima: string | null
  /** Turno que asigna la regla de la app, o `null` si no se pudo asignar. */
  turno: { sessionDate: string; shiftId: string } | null
  coincidencia: CoincidenciaTurno | null
}

/**
 * Reparte las piezas con la regla de producción (`segmentByDayAndShift`) y resume
 * el turno de `ventana`. Sin ventana toma el turno de la última pieza.
 */
export function resumirEspejo(
  piezas: readonly PiezaEspejo[],
  ventana?: ShoplogixShiftWindow | null,
): ResumenEspejo {
  const todas = ordenarPorHora(piezas)
  const deRegistro = new Map<PieceRecord, PiezaEspejo>()
  const registros = todas.map((p) => {
    const r = aRegistro(p)
    deRegistro.set(r, p)
    return r
  })
  const mapa = segmentByDayAndShift(registros, [], DEFAULT_SHIFT_SCHEDULE, ventana ? [ventana] : undefined)

  let clave: string | null = null
  if (ventana) {
    clave = `${ventana.sessionDate}|${ventana.shiftId}`
  } else if (registros.length > 0) {
    const ultima = registros[registros.length - 1]
    for (const [k, s] of mapa) if (ultima && s.pieceRecords.includes(ultima)) clave = k
  }
  const seg = clave ? mapa.get(clave) : undefined
  // Con ventana pedida, el turno es SOLO lo de esa ventana (vacío si no cae nada); el
  // respaldo a todas las piezas vale únicamente cuando no se pidió ventana.
  const base = seg
    ? seg.pieceRecords.map((r) => deRegistro.get(r)!).filter(Boolean)
    : ventana ? [] : todas
  const pu = primeraYUltima(base)
  return {
    piezas: base,
    total: contarPiezas(base),
    gate0: piezasGate0(base),
    p0: p0Pct(base),
    primera: pu ? pu.primera.hora : null,
    ultima: pu ? pu.ultima.hora : null,
    turno: seg ? { sessionDate: seg.sessionDate, shiftId: seg.shiftId } : null,
    coincidencia: coincidenciaDeLetras(seg ? seg.pieceRecords : ventana ? [] : registros),
  }
}

/** `HH:MM:SS` → `HH:MM`. */
export function hhmm(hora: string): string {
  return hora.slice(0, 5)
}

/** Entero con punto de miles siempre (es-CL no agrupa los de 4 cifras: «4812»). */
export function miles(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
