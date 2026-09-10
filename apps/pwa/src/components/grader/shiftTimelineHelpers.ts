/**
 * Helpers puros para ShiftTimelineView.
 *
 * Extraídos del componente para reducir su tamaño (~1268 → ~950 LOC)
 * y permitir tests unitarios sin React.
 *
 * M11 — Refactor ShiftTimelineView (2026-04-22).
 */

import type { TimelineBucket, MatrixP0Cause, Pause } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { SegmentVerdict, VerdictStatus } from '@/services/grader/graderP0Segmentation'
import type { UpstreamLineSnapshot, UpstreamMachineState } from '@/services/shoplogix/types'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'

// ── Formato de hora ───────────────────────────────────────────────────────────

/**
 * Formatea un timestamp a HH:MM en HORA LOCAL DE PLANTA.
 *
 * Acepta tres formas de entrada porque el módulo recibe timestamps de
 * orígenes diversos:
 *   - `string` ISO con sufijo 'Z' (Marelec/Shoplogix; no aplicar TZ)
 *   - `Date` ya parseado (resultado de `new Date(iso)` en otro punto)
 *   - `number` epoch ms (clicks de ECharts, agregaciones, etc.)
 *
 * En todos los casos usa `getUTCHours/Minutes` para leer la hora "tal cual"
 * sin convertir TZ — la convención del módulo es Z-as-wall-clock-local.
 */
export function fmtTime(input: string | Date | number): string {
  const d = input instanceof Date ? input : new Date(input)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

// ── Colores por causa P0 ──────────────────────────────────────────────────────

/** Mapeo Tailwind → hex aproximado para ECharts (tailwind se resuelve server-side). */
export const CAUSE_HEX: Record<MatrixP0Cause, string> = {
  fuera_de_limites:      '#ef4444', // red-500
  no_leido_fotocelula:   '#f97316', // orange-500
  too_close_too_long:    '#a855f7', // purple-500
  puerta_no_preparada:   '#06b6d4', // cyan-500
  fuera_de_calibre:      '#6366f1', // indigo-500
  fuera_de_calidad:      '#10b981', // emerald-500
  fuera_de_conservacion: '#f59e0b', // amber-500
  fuera_de_producto:     '#92400e', // amber-800
  otro:                  '#71717a', // zinc-500
}

// ── Ventana de producción real ────────────────────────────────────────────────

export interface ProductionWindow {
  startTs: string
  endTs: string
  startMs: number
  endMs: number
  dummyLots: Set<string>
  excludedPieces: number
}

/**
 * Detecta el rango de producción REAL del turno descartando:
 *   1. Lotes dummy (< 1% del total Y ≥ 95% en gate=0)
 *   2. Piezas de calibración/aseo pre y post turno (baja densidad)
 *
 * Returns null cuando no hay buckets con actividad.
 */
export function computeProductionWindow(timelineBuckets: TimelineBucket[]): ProductionWindow | null {
  if (timelineBuckets.length === 0) return null

  // Paso 1 — detectar lotes dummy
  const byLot = new Map<string, { pieces: number; p0: number }>()
  let total = 0
  for (const b of timelineBuckets) {
    if (!b.lot) continue
    const entry = byLot.get(b.lot) ?? { pieces: 0, p0: 0 }
    entry.pieces += b.pieces
    entry.p0 += b.p0Pieces ?? 0
    byLot.set(b.lot, entry)
    total += b.pieces
  }
  if (total === 0) return null
  const dummyLots = new Set<string>()
  for (const [lot, entry] of byLot) {
    const pct = (entry.pieces / total) * 100
    const p0Ratio = entry.pieces > 0 ? entry.p0 / entry.pieces : 0
    if (pct < 1 && p0Ratio >= 0.95) dummyLots.add(lot)
  }
  const cleanBuckets = timelineBuckets.filter((b) => {
    if (!b.lot) return b.pieces > 0
    return !dummyLots.has(b.lot) && b.pieces > 0
  })
  if (cleanBuckets.length === 0) return null

  // Paso 2 — búsqueda de densidad (ventana móvil 5 min)
  const WINDOW_MIN = 5
  const MIN_ACTIVE = 3
  const MIN_PIECES = 20
  const bucketByMs = new Map<number, { pieces: number }>()
  for (const b of cleanBuckets) bucketByMs.set(Date.parse(b.tsMin), { pieces: b.pieces })

  const windowMeetsCriteria = (anchorMs: number, direction: 1 | -1): boolean => {
    let active = 0
    let pieces = 0
    for (let i = 0; i < WINDOW_MIN; i++) {
      const b = bucketByMs.get(anchorMs + direction * i * 60_000)
      if (b && b.pieces > 0) { active++; pieces += b.pieces }
    }
    return active >= MIN_ACTIVE && pieces >= MIN_PIECES
  }

  let startBucket = cleanBuckets[0]!
  for (const b of cleanBuckets) {
    if (windowMeetsCriteria(Date.parse(b.tsMin), 1)) { startBucket = b; break }
  }
  let endBucket = cleanBuckets[cleanBuckets.length - 1]!
  for (let i = cleanBuckets.length - 1; i >= 0; i--) {
    const b = cleanBuckets[i]!
    if (windowMeetsCriteria(Date.parse(b.tsMin), -1)) { endBucket = b; break }
  }

  const startTs = startBucket.tsMin
  const endTs = endBucket.tsMin
  const startMs = Date.parse(startTs)
  const endMs = Date.parse(endTs)
  const excludedPieces = timelineBuckets
    .filter((b) => {
      const ts = Date.parse(b.tsMin)
      return ts < startMs || ts > endMs
    })
    .reduce((s, b) => s + b.pieces, 0)
  return { startTs, endTs, startMs, endMs, dummyLots, excludedPieces }
}

// ── Eje X dinámico ────────────────────────────────────────────────────────────

export interface AxisWindow {
  effectiveStartMs: number
  effectiveEndMs: number
  /** Un label por minuto del rango (HH:MM). */
  lineTimes: string[]
  /** label → índice en lineTimes (para alinear data de buckets). */
  axisIndexByLabel: Map<string, number>
}

/**
 * Computa el rango y la serie de labels minuto a minuto para el eje X del chart.
 * El rango arranca `paddingMin` minutos antes del primer bucket y termina
 * `paddingMin` después del último.
 *
 * Padding por defecto: 2 min (antes era 10). Para turnos cortos como Yal
 * (~90 min con colación de 51) un padding de 10 min representaba ~22% del
 * eje vacío en cada extremo. Con 2 min queda visualmente pegado al rango
 * productivo real, sin perder marca para mark-lines de inicio/fin.
 */
export function resolveAxisWindow(
  buckets: TimelineBucket[],
  shiftWindow: ShiftTimeWindow,
  paddingMin: number = 2,
  outerBounds?: { startMs: number; endMs: number } | null,
): AxisWindow {
  const firstBucket = buckets[0]
  const lastBucket = buckets[buckets.length - 1]
  const padMs = paddingMin * 60_000
  let effectiveStartMs = firstBucket
    ? Date.parse(firstBucket.tsMin) - padMs
    : Date.parse(shiftWindow.startAt)
  let effectiveEndMs = lastBucket
    ? Date.parse(lastBucket.tsMin) + padMs
    : Date.parse(shiftWindow.endAt)

  // outerBounds (típicamente rango SLX completo) extiende el eje para que el
  // Grader se vea como una "isla" dentro del turno upstream. El supervisor
  // identifica visualmente la cobertura Grader vs el turno real → señal para
  // subir más Excel parciales.
  if (outerBounds) {
    if (Number.isFinite(outerBounds.startMs)) effectiveStartMs = Math.min(effectiveStartMs, outerBounds.startMs)
    if (Number.isFinite(outerBounds.endMs))   effectiveEndMs   = Math.max(effectiveEndMs, outerBounds.endMs)
  }

  const maxSlots = 24 * 60
  const totalMinutes = Math.min(maxSlots, Math.max(1, Math.round((effectiveEndMs - effectiveStartMs) / 60_000)))
  const lineTimes: string[] = new Array(totalMinutes + 1)
  const axisIndexByLabel = new Map<string, number>()
  for (let i = 0; i <= totalMinutes; i++) {
    const label = fmtTime(new Date(effectiveStartMs + i * 60_000).toISOString())
    lineTimes[i] = label
    axisIndexByLabel.set(label, i)
  }
  return { effectiveStartMs, effectiveEndMs, lineTimes, axisIndexByLabel }
}

// ── Riel de eventos del turno ────────────────────────────────────────────────
//
// A 375 px el área de dibujo mide 278 px para un turno de ~8 h: 0,58 px por
// minuto. Una etiqueta de texto de 40 px ocupa por eso unos 68 minutos de eje, y
// dos eventos separados por menos de una hora se pisaban. Medido el 10-09 sobre
// los turnos con datos completos (julio 2026 en adelante): 7 de 16 tenían al
// menos un choque, el peor con 7.
//
// La salida es un riel de marcadores sin texto: el lienzo dice CUÁNDO y DE QUÉ
// TIPO, la lista de abajo lleva las palabras. El umbral de agrupación se mide en
// píxeles de marcador, no en minutos, así que no puede haber solape por
// construcción y se afloja solo en pantallas anchas.

export type TipoEventoTurno = 'accion' | 'pausa' | 'config' | 'carga' | 'lote'

export interface EventoTurno {
  tipo: TipoEventoTurno
  /** Instante del evento (ms). */
  ms: number
  /** Etiqueta del eje X donde cae (HH:MM). */
  label: string
  /** Título para la lista. */
  titulo: string
  detalle?: string
}

export interface MarcadorRiel {
  /** Se ancla en el PRIMER evento del grupo: el marcador no se mueve al absorber. */
  ms: number
  label: string
  eventos: EventoTurno[]
  tipo: TipoEventoTurno
  glifo: string
}

/** Ancho de la píldora de grupo (26 px) más 4 px de aire. */
export const RIEL_UMBRAL_PX = 30

/**
 * De más a menos importante. La acción de mantención va primera a propósito: es
 * el evento que la pestaña existe para evidenciar. La pausa no gasta color en el
 * riel porque su banda sobre el gráfico ya lleva el del tag.
 */
export const RIEL_PRIORIDAD: readonly TipoEventoTurno[] = ['accion', 'pausa', 'config', 'carga', 'lote']

export const RIEL_GLIFO: Record<TipoEventoTurno, string> = {
  accion: '⚙',
  pausa: '▮',
  config: '◈',
  carga: '↑',
  lote: '◆',
}

/**
 * Agrupa los eventos en marcadores que no se solapan.
 *
 * 1. Los del MISMO MINUTO se fusionan siempre, antes de mirar el espacio: tres
 *    configuraciones seguidas son un acto del operador guardado tres veces
 *    (medido: 63 de 122 turnos con más de un snapshot tienen varios en el mismo
 *    minuto, y en 61 de 66 grupos el contenido es distinto).
 * 2. Después, de izquierda a derecha: si el evento cae a menos de `umbralPx` del
 *    marcador abierto, lo absorbe y el marcador NO se mueve.
 */
export function agruparEventosRiel(
  eventos: readonly EventoTurno[],
  xDe: (ms: number) => number,
  umbralPx: number = RIEL_UMBRAL_PX,
): MarcadorRiel[] {
  if (eventos.length === 0) return []
  const orden = [...eventos].sort((a, b) => a.ms - b.ms)

  // 1. mismo minuto
  const porMinuto: EventoTurno[][] = []
  for (const e of orden) {
    const ultimo = porMinuto[porMinuto.length - 1]
    if (ultimo && Math.floor(ultimo[0]!.ms / 60_000) === Math.floor(e.ms / 60_000)) ultimo.push(e)
    else porMinuto.push([e])
  }

  // 2. distancia en píxeles contra el marcador abierto
  const out: MarcadorRiel[] = []
  let abierto: { x: number; eventos: EventoTurno[] } | null = null
  for (const grupo of porMinuto) {
    const x = xDe(grupo[0]!.ms)
    if (abierto && x - abierto.x < umbralPx) {
      abierto.eventos.push(...grupo)
      continue
    }
    abierto = { x, eventos: [...grupo] }
    out.push({ ms: grupo[0]!.ms, label: grupo[0]!.label, eventos: abierto.eventos, tipo: 'lote', glifo: '' })
  }

  // el glifo del grupo es el del tipo más importante que contiene
  for (const m of out) {
    const tipo = RIEL_PRIORIDAD.find((t) => m.eventos.some((e) => e.tipo === t)) ?? m.eventos[0]!.tipo
    m.tipo = tipo
    m.glifo = RIEL_GLIFO[tipo]
  }
  return out
}

export interface FuentesEventosTurno {
  uploads?: ReadonlyArray<{ at: string; byName?: string; files?: { pp?: unknown; p0?: unknown } }>
  acciones?: ReadonlyArray<{ at: string; field?: string; byName?: string; reason?: string }>
  configs?: ReadonlyArray<{ at: string }>
  buckets?: ReadonlyArray<{ tsMin: string; lot?: string | null }>
  pausas?: ReadonlyArray<{ startAt: string; durationSec?: number; causeTag?: string | null }>
}

/**
 * Los eventos del turno que el riel marca y la lista describe, en un solo lugar
 * para que ambos digan exactamente lo mismo.
 *
 * `dentro` recorta a la ventana que el gráfico dibuja: 258 snapshots de
 * configuración del histórico caen fuera de ella y marcarlos sería marcar algo
 * que no se ve.
 */
export function construirEventosTurno(
  f: FuentesEventosTurno,
  dentro: (ms: number) => boolean,
  fmtLabel: (ms: number) => string,
): EventoTurno[] {
  const out: EventoTurno[] = []
  const add = (tipo: TipoEventoTurno, at: string, titulo: string, detalle?: string) => {
    const ms = Date.parse(at)
    if (!Number.isFinite(ms) || !dentro(ms)) return
    out.push({ tipo, ms, label: fmtLabel(ms), titulo, detalle })
  }

  for (const u of f.uploads ?? []) {
    const archivos = [u.files?.pp && 'PP', u.files?.p0 && 'P0'].filter(Boolean).join(' + ')
    add('carga', u.at, archivos ? `Carga de Excel · ${archivos}` : 'Carga de Excel', u.byName)
  }
  for (const a of f.acciones ?? []) {
    add('accion', a.at, a.field || 'Acción de mantención', [a.byName, a.reason].filter(Boolean).join(' · ') || undefined)
  }
  for (const c of f.configs ?? []) {
    add('config', c.at, 'Cambio de compuertas')
  }
  const buckets = f.buckets ?? []
  for (let i = 1; i < buckets.length; i++) {
    const prev = buckets[i - 1], curr = buckets[i]
    if (prev?.lot && curr?.lot && prev.lot !== curr.lot) {
      add('lote', curr.tsMin, `Cambio de lote · ${curr.lot}`)
    }
  }
  for (const p of f.pausas ?? []) {
    const min = Math.round((p.durationSec ?? 0) / 60)
    if (min < PAUSA_MIN_EVENTO && !p.causeTag) continue
    add('pausa', p.startAt, p.causeTag ? `Pausa · ${p.causeTag}` : 'Pausa', min > 0 ? `${min} min` : undefined)
  }
  return out.sort((a, b) => a.ms - b.ms)
}

/** Bajo estos minutos, una pausa sin causa anotada no llega al riel: es micro-detención. */
export const PAUSA_MIN_EVENTO = 10

/** Color del glifo de cada tipo en el riel (paleta oscura: el chart va en `theme="dark"`). */
export const RIEL_COLOR: Record<TipoEventoTurno, string> = {
  accion: '#FF9F0A',
  pausa: '#9F9FA5',
  config: '#40C8E0',
  carga: '#4CA5FF',
  lote: '#D085F5',
}

/**
 * Marcadores del riel como `markLine` verticales: la línea marca el instante
 * sobre el gráfico y la píldora de arriba lleva el glifo del tipo y, si el
 * marcador agrupa, cuántos eventos trae. Va dentro del canvas a propósito —
 * el PNG se exporta desde ahí y un overlay HTML no saldría.
 */
export function buildRielMarkLines(marcadores: readonly MarcadorRiel[]): object[] {
  return marcadores.map((m) => {
    const color = RIEL_COLOR[m.tipo]
    const n = m.eventos.length
    return {
      name: m.eventos.map((e) => e.titulo).join(' · '),
      xAxis: m.label,
      lineStyle: { color, type: 'dashed' as const, width: 1, opacity: 0.45 },
      label: {
        show: true,
        position: 'insideEndTop' as const,
        distance: 6,
        formatter: n > 1 ? `${m.glifo} ${n}` : m.glifo,
        color,
        fontSize: 11,
        lineHeight: 14,
        padding: [2, 5, 2, 5],
        borderRadius: 4.5,
        backgroundColor: 'rgba(15,23,42,0.92)',
        borderColor: color,
        borderWidth: 1,
      },
    }
  })
}

// ── Mark lines del chart ──────────────────────────────────────────────────────

export interface MarkLinesResult {
  shiftMarkLines: object[]
  thresholdLines: object[]
  uploadLines: object[]
  actionLines: object[]
  configChangeLines: object[]
  lotChangeLines: object[]
}

/**
 * Construye todos los arrays de markLine para el chart de ECharts.
 * Ninguna dependencia de React — pura transformación de datos.
 */
export function buildMarkLines(
  shiftDoc: GraderShiftDoc | null,
  shiftWindow: ShiftTimeWindow,
  configSnapshots: GateConfigSnapshot[] | undefined,
  activeBuckets: TimelineBucket[],
  alertThreshold: number,
  criticalThreshold: number,
  productionWindow?: ProductionWindow | null,
): MarkLinesResult {
  // Inicio: usa productionWindow.startTs (primer minuto con producción real)
  // en lugar de shiftWindow.startAt (horario oficial del schedule). Los
  // timestamps Marelec son wall-clock-as-UTC mientras que shiftWindow
  // convierte hora local Chile a ISO UTC — un gap de 3-4h. Marcar la flecha
  // sobre el primer bucket productivo evita ese desfase y refleja cuándo
  // REALMENTE arrancó la línea.
  const startLabelTs = productionWindow?.startTs ?? shiftWindow.startAt
  const endLabelTs = productionWindow?.endTs ?? shiftWindow.endAt
  const shiftMarkLines = [
    {
      name: `Inicio turno\n${fmtTime(startLabelTs)}`,
      xAxis: fmtTime(startLabelTs),
      lineStyle: { color: '#10b981', type: 'solid' as const, width: 1 },
      label: { show: false },
    },
    {
      name: `Fin turno\n${fmtTime(endLabelTs)}`,
      xAxis: fmtTime(endLabelTs),
      lineStyle: { color: '#6b7280', type: 'solid' as const, width: 1 },
      label: { show: false },
    },
  ]

  const thresholdLines = [
    {
      yAxis: alertThreshold,
      lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1, opacity: 0.5 },
      label: { show: false },
    },
    {
      yAxis: criticalThreshold,
      lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1, opacity: 0.5 },
      label: { show: false },
    },
  ]

  const uploadLines = (shiftDoc?.uploads ?? []).map(u => ({
    name: `Upload\n${fmtTime(u.at)}`,
    xAxis: fmtTime(u.at),
    lineStyle: { color: '#3b82f6', type: 'dashed' as const, width: 1.5 },
    label: { show: false },
  }))

  const actionLines = (shiftDoc?.actions ?? []).map(a => ({
    name: `Acción\n${fmtTime(a.at)}`,
    xAxis: fmtTime(a.at),
    lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1.5 },
    label: { show: false },
  }))

  const configChangeLines = (configSnapshots ?? []).slice(1).map(s => ({
    name: `Config gates\n${fmtTime(s.at)}`,
    xAxis: fmtTime(s.at),
    lineStyle: { color: '#06b6d4', type: 'dashed' as const, width: 1.5 },
    label: { show: false },
  }))

  const lotChangeLines: object[] = []
  /* Dos cambios de lote a pocos minutos apilaban sus etiquetas una encima de
     otra hasta volverlas ilegibles. La línea punteada se dibuja siempre; la
     etiqueta, solo si hay aire desde la anterior. */
  const LOT_LABEL_GAP_MIN = 25
  let ultimaEtiquetaMs: number | null = null
  for (let i = 1; i < activeBuckets.length; i++) {
    const prev = activeBuckets[i - 1]
    const curr = activeBuckets[i]
    if (prev?.lot && curr?.lot && prev.lot !== curr.lot) {
      const currMs = new Date(curr.tsMin).getTime()
      const conAire = ultimaEtiquetaMs == null || currMs - ultimaEtiquetaMs >= LOT_LABEL_GAP_MIN * 60_000
      if (conAire) ultimaEtiquetaMs = currMs
      lotChangeLines.push({
        name: `Cambio a Lote ${curr.lot}`,
        xAxis: fmtTime(curr.tsMin),
        lineStyle: { color: '#8b5cf6', type: 'dotted' as const, width: 1.5 },
        label: {
          show: false,
          // Los últimos 4 dígitos alcanzan para distinguir lotes dentro de un
          // turno; el número entero (9 dígitos) se dibujaba en vertical y tapaba
          // el gráfico. Va abajo porque arriba ya están las bandas de pausa —
          // un cambio de lote suele traer su propia pausa «Cambio N min», y las
          // dos etiquetas caían una encima de la otra. El número completo sigue
          // en el nombre, que es lo que muestra el tooltip.
          formatter: `L ${String(curr.lot).slice(-4)}`,
          color: '#a78bfa',
          fontSize: 11,
          fontWeight: 600 as const,
          position: 'insideEndBottom' as const,
          backgroundColor: 'rgba(139,92,246,0.15)',
          borderColor: 'rgba(139,92,246,0.4)',
          borderWidth: 1,
          borderRadius: 3,
          padding: [2, 4, 2, 4] as [number, number, number, number],
          distance: 2,
        },
      })
    }
  }

  return { shiftMarkLines, thresholdLines, uploadLines, actionLines, configChangeLines, lotChangeLines }
}

// ── Cadencia (pz/min): ritmo típico + mejor sostenida 10min ──────────────────

/** Tamaño de la ventana móvil (en minutos activos) para "máx sostenida". */
const CADENCE_WINDOW_MIN = 10

export interface CadenceStats {
  /** Mediana de pz/min sobre los minutos ACTIVOS (pieces>0) del turno. Null si no hay minutos activos. */
  typicalPzMin: number | null
  /**
   * Mejor promedio móvil de `CADENCE_WINDOW_MIN` minutos activos CONSECUTIVOS
   * (consecutivos en la secuencia de minutos con producción, no en reloj —
   * así una colación en medio del turno no castiga la lectura de "cuánto
   * llegó a rendir de verdad" cuando la máquina SÍ estaba corriendo).
   * Null si el turno tiene menos de `CADENCE_WINDOW_MIN` minutos activos.
   */
  bestSustained10MinPzMin: number | null
}

/**
 * Calcula el ritmo típico (mediana) y la mejor cadencia sostenida (ventana
 * móvil de 10 min) a partir de los buckets YA filtrados a minutos activos
 * del turno visible (mismo filtro `pieces>0` que usa el chart).
 *
 * No usar la media para "típico": los minutos parciales/colación la arrastran
 * hacia abajo y no representa el ritmo real de operación.
 */
export function computeCadenceStats(activeBuckets: TimelineBucket[]): CadenceStats {
  if (activeBuckets.length === 0) return { typicalPzMin: null, bestSustained10MinPzMin: null }

  const piecesPerMin = activeBuckets.map((b) => b.pieces)
  const typicalPzMin = median(piecesPerMin)

  let bestSustained10MinPzMin: number | null = null
  if (piecesPerMin.length >= CADENCE_WINDOW_MIN) {
    let windowSum = 0
    for (let i = 0; i < CADENCE_WINDOW_MIN; i++) windowSum += piecesPerMin[i]!
    let best = windowSum
    for (let i = CADENCE_WINDOW_MIN; i < piecesPerMin.length; i++) {
      windowSum += piecesPerMin[i]! - piecesPerMin[i - CADENCE_WINDOW_MIN]!
      if (windowSum > best) best = windowSum
    }
    bestSustained10MinPzMin = best / CADENCE_WINDOW_MIN
  }

  return { typicalPzMin, bestSustained10MinPzMin }
}

/**
 * Construye el markLine.data (2 líneas horizontales sobre el eje Pzs/min)
 * a partir de `computeCadenceStats`. Sin data suficiente, cada línea se omite
 * individualmente (nunca NaN).
 */
export function buildCadenceMarkLines(stats: CadenceStats): object[] {
  const lines: object[] = []
  if (stats.typicalPzMin != null) {
    const v = Math.round(stats.typicalPzMin)
    lines.push({
      name: 'Ritmo típico',
      yAxis: stats.typicalPzMin,
      lineStyle: { color: '#38bdf8', type: 'dashed' as const, width: 1.5, opacity: 0.8 },
      label: { show: false },
      tooltip: { show: true, formatter: `Ritmo típico: mediana de pz/min en los minutos activos del turno (${v} pz/min).` },
    })
  }
  if (stats.bestSustained10MinPzMin != null) {
    const v = Math.round(stats.bestSustained10MinPzMin)
    lines.push({
      name: 'Máx sostenida (10min)',
      yAxis: stats.bestSustained10MinPzMin,
      lineStyle: { color: '#facc15', type: 'dashed' as const, width: 1.5, opacity: 0.8 },
      label: { show: false },
      tooltip: { show: true, formatter: `Máx sostenida: mejor promedio móvil de 10 min activos del turno — capacidad demostrada (${v} pz/min).` },
    })
  }
  return lines
}

// ── Mark areas (bandas de pausas) ─────────────────────────────────────────────

/**
 * Umbral en minutos a partir del cual una pausa se considera "dominante":
 * su markArea cubre suficiente fracción del timeline como para tapar barras
 * y línea P0% si se renderiza con la opacity normal del tag. A partir de
 * este umbral aplicamos opacity reducida y bordes verticales (markLines)
 * para conservar la indicación temporal sin oclusión visual.
 */
const PAUSE_DOMINANT_THRESHOLD_MIN = 25

/** Reduce la opacity de un color rgba(r,g,b,a) por un factor. */
function dimRgba(rgba: string, factor: number): string {
  const m = rgba.match(/^rgba?\(([^,]+),([^,]+),([^,]+)(?:,([^,]+))?\)$/)
  if (!m) return rgba
  const r = m[1]?.trim()
  const g = m[2]?.trim()
  const b = m[3]?.trim()
  const a = parseFloat(m[4]?.trim() ?? '1')
  return `rgba(${r},${g},${b},${(a * factor).toFixed(3)})`
}

/**
 * Construye el array de markArea data para ECharts a partir de las pausas del turno.
 * Solo incluye pausas que SOLAPAN con el productionWindow (si está definido).
 *
 * Para pausas dominantes (>= 25 min con tag), atenúa la banda al ~30% de su
 * opacity normal — el ojo conserva la pista de "aquí hubo pausa" sin que la
 * banda tape barras y línea P0%. Los bordes nítidos los aporta
 * `buildPauseBoundaryMarkLines` (markLines verticales).
 */
export function buildMarkAreas(
  pauses: Pause[],
  productionWindow: ProductionWindow | null,
): Array<[object, object]> {
  const pausesInWindow = pauses.filter((p) => {
    if (!productionWindow) return true
    const pStart = Date.parse(p.startAt)
    const pEnd = Date.parse(p.endAt)
    return pEnd >= productionWindow.startMs && pStart <= productionWindow.endMs
  })
  return pausesInWindow.map((p) => {
    const tA = fmtTime(p.startAt)
    const tB = fmtTime(p.endAt)
    const durMin = Math.round(p.durationSec / 60)
    const effectiveTag = resolveEffectiveTag(p)
    const rangeAdjusted = !!p.adjustedBy
    const isDominant = durMin >= PAUSE_DOMINANT_THRESHOLD_MIN

    let areaColor: string
    let labelColor: string
    let labelText: string
    if (effectiveTag) {
      // Pausas dominantes: atenuar al 35% para que no tapen el chart.
      // Los markLines verticales aportan bordes nítidos en su lugar.
      areaColor = isDominant ? dimRgba(effectiveTag.bandFill, 0.35) : effectiveTag.bandFill
      labelColor = effectiveTag.color
      labelText = `${effectiveTag.label.split(' ')[0]} ${durMin}min${rangeAdjusted ? ' *' : ''}`
    } else {
      const baseOpacity = p.tier === 'parada' ? 0.12 : p.tier === 'larga' ? 0.09 : 0.06
      const opacity = isDominant ? baseOpacity * 0.4 : baseOpacity
      areaColor = `rgba(148,163,184,${opacity.toFixed(3)})`
      labelColor = '#94a3b8'
      labelText = `${durMin}min${rangeAdjusted ? ' *' : ''}`
    }
    return [
      {
        name: p.id,
        xAxis: tA,
        itemStyle: { color: areaColor },
        // El texto de la banda pasó al riel y a la lista (10-09): con dos pausas
        // cercanas los rótulos se pisaban entre sí y con los del lote.
        label: { show: false, formatter: labelText, color: labelColor, fontSize: 11, position: 'insideTopRight' as const },
      },
      { xAxis: tB },
    ]
  })
}

/**
 * MarkLines verticales en los bordes de pausas dominantes (>= 25 min con
 * tag o cualquier tier 'parada'). Compensa la atenuación de la banda en
 * `buildMarkAreas`: el ojo identifica el inicio/fin del paro nítidamente
 * sin que la banda tape el chart.
 *
 * Genera 2 markLines por pausa dominante (inicio + fin), con color del tag
 * efectivo y opacity moderada.
 */
export function buildPauseBoundaryMarkLines(
  pauses: Pause[],
  productionWindow: ProductionWindow | null,
): object[] {
  const pausesInWindow = pauses.filter((p) => {
    if (!productionWindow) return true
    const pStart = Date.parse(p.startAt)
    const pEnd = Date.parse(p.endAt)
    return pEnd >= productionWindow.startMs && pStart <= productionWindow.endMs
  })
  const lines: object[] = []
  for (const p of pausesInWindow) {
    const durMin = Math.round(p.durationSec / 60)
    const effectiveTag = resolveEffectiveTag(p)
    const isDominant = durMin >= PAUSE_DOMINANT_THRESHOLD_MIN
    if (!isDominant) continue
    const color = effectiveTag?.color ?? (p.tier === 'parada' ? '#94a3b8' : '#cbd5e1')
    lines.push(
      /* Sin `label` explícito, ECharts dibuja el valor del eje sobre la línea:
         estos dos bordes eran los que escribían horas sueltas encima del
         gráfico («01:02», «02:10»), superpuestas entre sí. */
      {
        name: `pause-start-${p.id}`,
        xAxis: fmtTime(p.startAt),
        lineStyle: { color, type: 'dashed' as const, width: 1, opacity: 0.5 },
        symbol: 'none' as const,
        label: { show: false },
      },
      {
        name: `pause-end-${p.id}`,
        xAxis: fmtTime(p.endAt),
        lineStyle: { color, type: 'dashed' as const, width: 1, opacity: 0.5 },
        symbol: 'none' as const,
        label: { show: false },
      },
    )
  }
  return lines
}

// ── Bandas de segmentos por cambio de config ─────────────────────────────────

/**
 * Color de fondo (rgba) de la banda de un segmento, según el verdict del
 * cambio de config que abrió ese segmento.
 *
 * Tintes muy tenues (4-7%) — el objetivo es que el ojo perciba "esto es un
 * segmento distinto" sin tapar barras y línea P0%. Para `insufficient-data`
 * retornamos null → la banda no se pinta (no hay verdict que comunicar).
 *
 * Las opacidades alinean con `verdictColor()` de `graderP0Segmentation`:
 *  - improved → emerald (verde)
 *  - worsened → rose (rojo)
 *  - neutral → slate (gris)
 */
export function verdictBandColor(status: VerdictStatus): string | null {
  switch (status) {
    case 'improved':          return 'rgba(16, 185, 129, 0.07)'  // emerald-500 7%
    case 'worsened':          return 'rgba(244, 63, 94, 0.07)'   // rose-500 7%
    case 'neutral':           return 'rgba(148, 163, 184, 0.04)' // slate-400 4%
    case 'insufficient-data': return null
  }
}

/**
 * Construye los markArea para resaltar los SEGMENTOS del turno entre cambios
 * manuales de config de gates. Cada banda cubre el rango `[snap.at, nextSnap.at)`
 * (o hasta el fin del turno) y se tinta según el verdict del segmento (si lo hay).
 *
 * Útil para que el ojo perciba a qué segmento del timeline corresponde cada
 * P0% antes/después que muestra `GateChangeImpactCard`.
 *
 * Reglas:
 *  - Snapshots `synthetic` se ignoran (representan config inicial inferida).
 *  - Si no hay verdict para el snapshot → no se tinta (puede haberse perdido
 *    timelineBuckets en el Map, mejor no mentir).
 *  - Si el segmento queda fuera de `productionWindow` → se descarta.
 *  - Si `tA === tB` (segmento de duración 0) → se descarta para evitar bandas
 *    invisibles que el tooltip pueda activar accidentalmente.
 *  - Para `insufficient-data` → no se pinta (verdictBandColor retorna null).
 */
export function buildConfigSegmentMarkAreas(
  configSnapshots: GateConfigSnapshot[] | undefined,
  verdicts: Map<string, SegmentVerdict>,
  productionWindow: ProductionWindow | null,
): Array<[object, object]> {
  if (!configSnapshots || configSnapshots.length === 0) return []
  if (!productionWindow) return []

  const manualSnaps = configSnapshots
    .filter((s) => !s.synthetic)
    .sort((a, b) => a.at.localeCompare(b.at))

  if (manualSnaps.length === 0) return []

  const productionEndIso = new Date(productionWindow.endMs).toISOString()
  const result: Array<[object, object]> = []

  for (let i = 0; i < manualSnaps.length; i++) {
    const snap = manualSnaps[i]!
    const verdict = verdicts.get(snap.id)
    if (!verdict) continue

    const color = verdictBandColor(verdict.status)
    if (!color) continue

    const startIso = snap.at
    const endIso = manualSnaps[i + 1]?.at ?? productionEndIso

    const startMs = Date.parse(startIso)
    const endMs = Date.parse(endIso)
    if (endMs < productionWindow.startMs || startMs > productionWindow.endMs) continue

    const tA = fmtTime(startIso)
    const tB = fmtTime(endIso)
    if (tA === tB) continue

    result.push([
      { xAxis: tA, itemStyle: { color, borderWidth: 0 } },
      { xAxis: tB },
    ])
  }

  return result
}

// ── Bandas Baader sobre el sub-grid del timeline Grader ────────────────────────

export interface BaaderLane {
  /** Nombre canónico de la máquina (key del yAxis category, ej: "Evisceradora 1") */
  machineName: string
}

export interface BaaderMarkerBand {
  /** name único para tooltip/click (ej: "E1__1700000000000") */
  name: string
  machineName: string
  /** Etiqueta tA en HH:MM, alineada al lineTimes del axis principal */
  tA: string
  /** Etiqueta tB en HH:MM */
  tB: string
  /** Color de relleno de la banda (con transparencia) */
  fill: string
  /** Color del borde (más sólido) */
  stroke: string
  /** Tipo de estado: downtime/break/setup (uptime se omite — es el fondo) */
  stateType: Exclude<UpstreamMachineState['type'], 'uptime'>
  /** Texto de la razón Shoplogix ("COLACION", "Limpieza ducto", etc.) */
  reason: string
  /** Duración en minutos enteros para tooltip */
  durationMin: number
}

export interface BaaderTimelineMarkers {
  /** Lista ordenada de lanes (orden = orden visual de yAxis: machine[0] arriba) */
  lanes: BaaderLane[]
  /** Bandas a pintar como markArea — la lane se resuelve por machineName */
  bands: BaaderMarkerBand[]
}

/**
 * Construye los marcadores de paros Baader para pintar sobre el timeline del
 * Grader (sub-grid debajo del chart principal).
 *
 * Filtra:
 *   - Estados type === 'uptime' (es el "fondo" — solo importan los paros)
 *   - Bandas fuera de productionWindow (se descartan completas si no solapan)
 *
 * Recorta tA/tB al rango del axis (lineTimes[0] / lineTimes[N-1]) para que
 * markArea no intente pintar fuera del eje category.
 */
export function buildBaaderTimelineMarkers(
  snapshot: UpstreamLineSnapshot | null | undefined,
  lineTimes: string[],
  productionWindow: ProductionWindow | null,
): BaaderTimelineMarkers {
  if (!snapshot || lineTimes.length === 0) {
    return { lanes: [], bands: [] }
  }
  const axisStartLabel = lineTimes[0]!
  const axisEndLabel = lineTimes[lineTimes.length - 1]!
  // Construye Set para O(1) lookup de labels válidos en el axis
  const validLabels = new Set(lineTimes)

  const lanes: BaaderLane[] = snapshot.machines.map((m) => ({
    machineName: m.machineName,
  }))

  const bands: BaaderMarkerBand[] = []
  for (const machine of snapshot.machines) {
    for (const state of machine.states) {
      if (state.type === 'uptime') continue
      const startMs = state.startAt.getTime()
      const endMs = state.endAt.getTime()
      // Filtrar fuera de la production window
      if (productionWindow) {
        if (endMs < productionWindow.startMs) continue
        if (startMs > productionWindow.endMs) continue
      }
      // Recortar a la ventana del axis si la banda excede sus extremos
      const tStartIso = state.startAt.toISOString()
      const tEndIso = state.endAt.toISOString()
      let tA = fmtTime(tStartIso)
      let tB = fmtTime(tEndIso)
      if (!validLabels.has(tA)) tA = axisStartLabel
      if (!validLabels.has(tB)) tB = axisEndLabel
      // Si tA === tB tras recorte (banda colapsada), skip
      if (tA === tB) continue

      // Color: usa el de Shoplogix como base, agrega transparencia para fill
      const baseColor = state.color || '#94a3b8'
      const fill = colorWithAlpha(baseColor, 0.55)
      const stroke = colorWithAlpha(baseColor, 0.9)
      const durationMin = Math.max(1, Math.round(state.durationSec / 60))

      bands.push({
        name: `${machine.machineid}__${startMs}`,
        machineName: machine.machineName,
        tA,
        tB,
        fill,
        stroke,
        stateType: state.type,
        reason: state.reason || state.name || '—',
        durationMin,
      })
    }
  }

  return { lanes, bands }
}

// ── Scatter: correlación Baader ritmo vs Grader P0% ──────────────────────────

/**
 * Punto del scatter de correlación upstream.
 * Un punto = un intervalo de 5 min donde hay datos de AMBOS sistemas.
 */
export interface ScatterPoint {
  /** Timestamp inicio del intervalo (ms UTC — wall-clock Chile) */
  tsMs: number;
  /** Ciclos Baader en el intervalo (0..∞) */
  baaderCycles: number;
  /** Ratio Baader (cycles / expectedCycles, 0..1+) — usado como tamaño del punto */
  baaderRatio: number;
  /** P0% del Grader en el mismo intervalo (0..1) */
  graderP0Pct: number;
  /** Piezas totales del Grader en el intervalo (para ponderar confianza del punto) */
  graderPieces: number;
  /** Color del intervalo Baader ("green"|"yellow"|"red"|"gray") */
  baaderColor: string;
}

export interface ScatterSeriesData {
  machineid: string;
  machineName: string;
  points: ScatterPoint[];
  /** Regresión lineal simple: y = slope * x + intercept (si hay ≥ 3 puntos con datos) */
  regression: { slope: number; intercept: number; r2: number } | null;
}

/**
 * Construye los datos del scatter de correlación entre el ritmo de cada Baader
 * y el P0% del Grader, alineados temporalmente en ventanas de 5 minutos.
 *
 * Convención de timestamps: ambos sistemas usan UTC-as-wall-clock (hora Chile
 * almacenada sin conversión de TZ). La comparación numérica de getTime() es
 * válida porque ambos usan la misma convención.
 *
 * @param snapshot   UpstreamLineSnapshot (las 3 Evisceradoras)
 * @param buckets    TimelineBucket[] por minuto del turno Grader
 */
export function buildScatterData(
  snapshot: UpstreamLineSnapshot,
  buckets: TimelineBucket[],
): ScatterSeriesData[] {
  if (buckets.length === 0 || snapshot.machines.length === 0) return []

  // Pre-index: bucket por timestamp de inicio de minuto (ms) para O(1) lookup
  const bucketByTs = new Map<number, TimelineBucket>()
  for (const b of buckets) {
    const ms = new Date(b.tsMin).getTime()
    bucketByTs.set(ms, b)
  }

  const result: ScatterSeriesData[] = []

  for (const machine of snapshot.machines) {
    const points: ScatterPoint[] = []

    for (const interval of machine.intervals) {
      const startMs = interval.startAt.getTime()
      const endMs   = interval.endAt.getTime()
      const spanMs  = endMs - startMs  // normalmente 300_000 (5 min)

      // Agregar los buckets del Grader que caen dentro del intervalo Baader
      let totalPieces = 0
      let totalP0     = 0

      // Recorre minutos dentro del span del intervalo
      for (let tMs = startMs; tMs < endMs; tMs += 60_000) {
        const b = bucketByTs.get(tMs)
        if (!b) continue
        totalPieces += b.pieces
        totalP0     += b.p0Pieces
      }

      // Solo incluir puntos con ambos sistemas activos
      if (totalPieces < 1) continue

      const graderP0Pct = totalP0 / totalPieces

      points.push({
        tsMs:         startMs,
        baaderCycles: interval.cycles,
        baaderRatio:  interval.ratio,
        graderP0Pct,
        graderPieces: totalPieces,
        baaderColor:  interval.color,
        // Nota: también guardamos spanMs implícitamente via endAt-startAt
        // para normalizar ciclos/min si fuera necesario en el futuro.
      })

      void spanMs  // suprimir warning TS de variable no usada
    }

    // Regresión lineal simple (Ordinary Least Squares)
    // y = graderP0Pct * 100, x = baaderCycles
    const usable = points.filter(p => p.baaderCycles > 0 && p.graderPieces >= 5)
    const regression = usable.length >= 3
      ? (() => {
          const n  = usable.length
          const sx = usable.reduce((a, p) => a + p.baaderCycles, 0)
          const sy = usable.reduce((a, p) => a + p.graderP0Pct * 100, 0)
          const sx2 = usable.reduce((a, p) => a + p.baaderCycles ** 2, 0)
          const sxy = usable.reduce((a, p) => a + p.baaderCycles * p.graderP0Pct * 100, 0)
          const denom = n * sx2 - sx ** 2
          if (denom === 0) return null
          const slope     = (n * sxy - sx * sy) / denom
          const intercept = (sy - slope * sx) / n
          // R² — proporción de varianza explicada
          const yMean = sy / n
          const ssTot  = usable.reduce((a, p) => a + (p.graderP0Pct * 100 - yMean) ** 2, 0)
          const ssRes  = usable.reduce((a, p) => a + (p.graderP0Pct * 100 - (slope * p.baaderCycles + intercept)) ** 2, 0)
          const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
          return { slope, intercept, r2 }
        })()
      : null

    result.push({ machineid: machine.machineid, machineName: machine.machineName, points, regression })
  }

  return result
}

// ── Scatter analytics: zona crítica + mediana + magnitud de pendiente ─────────

/**
 * Filtra puntos "usables" de una serie de scatter — puntos con datos
 * significativos en ambos sistemas. Usado por la regresión y los KPIs.
 */
export function usableScatterPoints(points: ScatterPoint[]): ScatterPoint[] {
  return points.filter(p => p.baaderCycles > 0 && p.graderPieces >= 5)
}

/**
 * Techo del eje Y del scatter, en puntos de P0%, y cuántos puntos quedan por
 * encima.
 *
 * El eje llegaba al P0 más alto del turno, y con eso la nube real —que vive
 * entre 0 y ~6 %— quedaba aplastada contra el piso: medido el 10-09, en 256 de
 * 377 turnos había buckets que estiraban el eje hasta el 100 %. Se corta en el
 * percentil 98 de los puntos usables, nunca por debajo del triple del umbral
 * crítico, y la tarjeta avisa cuántos puntos quedaron fuera: recortar la escala
 * sin decirlo sería esconder los peores tramos.
 */
export function scatterYMax(
  seriesData: ScatterSeriesData[],
  criticalP0Pct: number,
): { max: number; fuera: number } {
  const pcts = seriesData
    .flatMap(s => usableScatterPoints(s.points))
    .map(p => p.graderP0Pct * 100)
    .sort((a, b) => a - b)
  const piso = Math.max(1, criticalP0Pct * 3)
  if (pcts.length === 0) return { max: Math.ceil(piso), fuera: 0 }
  const p98 = pcts[Math.min(pcts.length - 1, Math.floor(pcts.length * 0.98))]!
  const max = Math.ceil(Math.max(piso, p98))
  return { max, fuera: pcts.filter(v => v > max).length }
}

/** Mediana clásica de un array numérico. Vacío → 0. */
export function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

/**
 * Calcula la mediana del ritmo Baader (ciclos/5min) sobre todos los puntos
 * usables de TODAS las máquinas — ritmo "típico" de la línea, no de una máquina aislada.
 */
export function scatterBaaderMedian(seriesData: ScatterSeriesData[]): number {
  const allCycles = seriesData.flatMap(s => usableScatterPoints(s.points).map(p => p.baaderCycles))
  return median(allCycles)
}

/**
 * Cuenta puntos en zona crítica del scatter:
 *   P0% > criticalP0Pct  Y  baaderCycles < baaderMedian
 *
 * Cuadrante inferior-derecho semánticamente: alto P0 + baja producción upstream.
 *
 * @returns { critical, total, pct } — total y % sobre puntos usables
 */
export function scatterCriticalZone(
  seriesData: ScatterSeriesData[],
  criticalP0Pct: number,
  baaderMedian: number,
): { critical: number; total: number; pct: number } {
  let critical = 0
  let total = 0
  seriesData.forEach((s) => {
    usableScatterPoints(s.points).forEach((p) => {
      total++
      if (p.graderP0Pct * 100 > criticalP0Pct && p.baaderCycles < baaderMedian) {
        critical++
      }
    })
  })
  return { critical, total, pct: total > 0 ? (critical / total) * 100 : 0 }
}

/**
 * Pendiente promedio (ponderada por nº puntos) de las regresiones de las series.
 * Convierte la magnitud a "puntos P0% por -10 ciclos/5min" — operacional para
 * el operador en lugar de un slope académico.
 */
/**
 * Piso de R² para que la nube de puntos sostenga una frase sobre la relación
 * entre el ritmo de la línea y el P0. Por debajo, el ritmo explica menos de una
 * décima de la variación: la pendiente es ruido.
 *
 * Medido el 10-09 sobre los 38 turnos: la tarjeta afirmaba una dirección en 25
 * de 28 turnos con datos y en 14 de ellos el R² máximo no llegaba a 0,10; el
 * mayor R² de todo el histórico es 0,22. Además la dirección se daba vuelta
 * entre turnos (17 «más línea, menos P0» contra 8 al revés), que es justo lo
 * que hace el ruido.
 */
export const SCATTER_R2_MIN = 0.1

export function scatterSlopeMagnitude(
  seriesData: ScatterSeriesData[],
): {
  avgSlope: number
  /** Cambio de P0% (en puntos %) cuando el ritmo Baader cae 10 ciclos/5min. Signo positivo = sube P0%. */
  deltaP0_per_minus10cycles: number
  direction: 'neg' | 'pos' | 'flat'
  /** Mayor R² entre las máquinas con regresión utilizable (null si ninguna la tiene). */
  r2Max: number | null
  /** true solo si algún R² llega al piso: sin esto la dirección no se puede afirmar. */
  explica: boolean
} | null {
  const withSlope = seriesData
    .map(s => ({
      slope: s.regression?.slope ?? null,
      r2: s.regression?.r2 ?? null,
      pts: usableScatterPoints(s.points).length,
    }))
    .filter(x => x.slope != null && x.pts >= 3) as { slope: number; r2: number | null; pts: number }[]

  if (withSlope.length === 0) return null
  const totalPts = withSlope.reduce((a, x) => a + x.pts, 0)
  if (totalPts === 0) return null
  const wSum = withSlope.reduce((a, x) => a + x.slope * x.pts, 0)
  const avgSlope = wSum / totalPts
  const deltaP0_per_minus10cycles = -avgSlope * 10
  const r2s = withSlope.map(x => x.r2).filter((r): r is number => r != null)
  const r2Max = r2s.length ? Math.max(...r2s) : null
  return {
    avgSlope,
    deltaP0_per_minus10cycles,
    direction: avgSlope < -0.005 ? 'neg' : avgSlope > 0.005 ? 'pos' : 'flat',
    r2Max,
    explica: r2Max != null && r2Max >= SCATTER_R2_MIN,
  }
}

/** Convierte "#rrggbb" o "rgba(...)" a rgba con alpha custom (best-effort). */
function colorWithAlpha(color: string, alpha: number): string {
  const c = color.trim()
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    let r = 0, g = 0, b = 0
    if (c.length === 7) {
      r = parseInt(c.slice(1, 3), 16)
      g = parseInt(c.slice(3, 5), 16)
      b = parseInt(c.slice(5, 7), 16)
    } else {
      r = parseInt(c[1]! + c[1]!, 16)
      g = parseInt(c[2]! + c[2]!, 16)
      b = parseInt(c[3]! + c[3]!, 16)
    }
    return `rgba(${r},${g},${b},${alpha})`
  }
  // rgba(...) o rgb(...) — devuelve tal cual; el caller absorbe el alpha del original
  return c
}


/**
 * Ventana temporal que dibujan el Gantt y el gráfico de tasa (comparten eje).
 *
 * El ORDEN importa y ya se rompió una vez: el encuadre "solo con proceso" viajaba
 * por `shiftWindow`, que estaba DESPUÉS de los bounds del snapshot, así que el
 * chip cambiaba de estado y el eje no se movía — el botón no hacía nada.
 *
 * Prioridad:
 *   1. zoom activo (context)
 *   2. encuadre explícito en las horas con proceso
 *   3. bounds del snapshot Shoplogix (ventana completa del turno)
 *   4. `shiftWindow` como fallback sin snapshot
 */
export function resolvePanelWindow(args: {
  zoom?: { startMs: number; endMs: number } | null
  framedOnProduction?: boolean
  shiftWindow?: { startAt: string; endAt: string } | null
  snapshotBounds?: { start: Date; end: Date } | null
}): { start: Date; end: Date } | null {
  const { zoom, framedOnProduction, shiftWindow, snapshotBounds } = args

  if (zoom) return { start: new Date(zoom.startMs), end: new Date(zoom.endMs) }

  const fromProp = (() => {
    if (!shiftWindow?.startAt || !shiftWindow?.endAt) return null
    const s = new Date(shiftWindow.startAt)
    const e = new Date(shiftWindow.endAt)
    return isNaN(s.getTime()) || isNaN(e.getTime()) ? null : { start: s, end: e }
  })()

  if (framedOnProduction && fromProp) return fromProp
  if (snapshotBounds?.start && snapshotBounds?.end) return snapshotBounds
  return fromProp
}


/** Cómo se decide el encuadre del eje temporal. */
export type FramingOverride = 'auto' | 'produccion' | 'turno'

/**
 * ¿El eje va acotado a las horas con proceso?
 *
 * `auto` deja decidir a la heurística (acotar solo si la operación ocupa una
 * fracción chica del turno). Los otros dos valores son decisión explícita del
 * usuario y MANDAN sobre la heurística.
 *
 * Regresión que esto evita: antes el estado era un booleano "ver turno completo"
 * y el encuadre siempre pasaba por la heurística, así que en las líneas donde
 * ésta decía que no hacía falta (Yal, Chonchi — su turno sí está acotado) el
 * botón no podía forzar nada y no hacía absolutamente nada.
 */
export function resolveFraming(args: {
  override: FramingOverride
  hasProductionWindow: boolean
  autoDecision: boolean
}): boolean {
  if (!args.hasProductionWindow) return false
  if (args.override === 'produccion') return true
  if (args.override === 'turno') return false
  return args.autoDecision
}
