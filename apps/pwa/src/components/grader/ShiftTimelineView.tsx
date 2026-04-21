/**
 * Visualización del timeline de turno: pulso P0% minuto a minuto,
 * tiempos muertos, cambios de lote, y marcadores de configuración.
 * checkpoints de uploads y acciones marcados como líneas verticales.
 *
 * Cuando el usuario clica una causa del P0CausesPanel, el timeline agrega
 * una capa de scatter points (una por cada pieza gate=0 de esa causa),
 * con peso en Y y color por causa.
 *
 * Usa ECharts (consistente con GraderTimelineChart).
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { Upload, Wrench, Clock, X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineBucket, MatrixP0Cause, Pause, MicroDetentionsSummary } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'
import { MATRIX_P0_CAUSES, parseMatrixErrorString } from '@/services/grader/graderMatrixP0Causes'
import { classifyRecordToMatrix, CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalytics'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'
import { PauseAnnotationDialog } from './PauseAnnotationDialog'
import { MinuteDetailDialog } from './MinuteDetailDialog'
import type { GateAssignment } from '@/services/grader/types'

interface ShiftTimelineViewProps {
  timelineBuckets: TimelineBucket[]
  shiftDoc: GraderShiftDoc | null
  shiftWindow: ShiftTimeWindow
  /** Historial de cambios de config de gates (FASE 27) */
  configSnapshots?: GateConfigSnapshot[]
  /** Piezas gate=0 del turno (enriquecidas con peso+error por P0_EXCEL) */
  gate0Pieces?: FirestorePieceRecord[]
  /**
   * Pausas detectadas (≥5 min) cargadas desde `meta/pauses`.
   * Cada pausa tiene tier, autoTag (solo 'colacion' por ahora) y opcionalmente
   * tag/note manuales. Renderizadas como bandas translúcidas sobre el chart.
   * Turnos legacy sin backfill llegan con array vacío.
   */
  pauses?: Pause[]
  /** Agregado de micro-detenciones (1-5 min) para badge de cobertura. */
  microDetentions?: MicroDetentionsSummary | null
  /**
   * ID del summary al que pertenecen las pausas — requerido para persistir
   * anotaciones via `updatePauseAnnotation`. Si falta, la anotación se
   * deshabilita silenciosamente.
   */
  summaryId?: string
  /**
   * UID del admin activo. Si se provee junto con `summaryId`, clicar una
   * banda de pausa abre el diálogo de clasificación. Si es undefined, las
   * bandas son solo lectura (uso para turnos vistos por operadores sin rol).
   */
  adminUid?: string
  /** Callback invocado tras guardar una anotación — el parent debe recargar pauses. */
  onPauseUpdated?: () => void
  /** Causas seleccionadas (multi-select) en el P0CausesPanel — filtran el scatter */
  selectedCauses?: Set<MatrixP0Cause>
  /** Callback para limpiar todas las selecciones desde el badge */
  onClearSelectedCauses?: () => void
  /** P0% final del turno (summary.pointZeroPct) — color de línea según verdict */
  summaryP0Pct?: number
  /** Umbrales para semáforo y líneas horizontales (defaults 2% / 3.5%) */
  alertThreshold?: number
  criticalThreshold?: number
}

/**
 * Formatea ISO string a HH:MM en HORA LOCAL DE PLANTA.
 *
 * Los timestamps del parser Excel Marelec llevan sufijo `Z` pero representan
 * hora local de la planta (sin conversión). Si usáramos toLocaleTimeString,
 * el navegador los interpretaría como UTC y aplicaría su propio offset
 * (ej. Chile UTC-3 → 07:00 planta se mostraría como "04:00"). Acá leemos
 * getUTCHours/getUTCMinutes para mostrar la hora "tal cual" del string.
 *
 * Los timestamps construidos localmente (shiftWindow.startAt, uploads,
 * actions) sí se convierten a UTC real al hacer toISOString, y al pasarlos
 * por esta función quedarían 3-4 h desplazados. En la práctica no afecta
 * porque las markLines de inicio/fin del turno caen fuera del rango
 * visible del chart (el eje X se recorta al primer/último piece real),
 * y los uploads/actions que se renderizan como markLine también.
 */
function fmtTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Mapeo Tailwind → hex aproximado para ECharts (tailwind se resuelve server-side). */
const CAUSE_HEX: Record<MatrixP0Cause, string> = {
  fuera_de_limites:     '#ef4444', // red-500
  no_leido_fotocelula:  '#f97316', // orange-500
  too_close_too_long:   '#a855f7', // purple-500
  puerta_no_preparada:  '#06b6d4', // cyan-500
  fuera_de_calibre:     '#6366f1', // indigo-500
  fuera_de_calidad:     '#10b981', // emerald-500
  fuera_de_conservacion:'#f59e0b', // amber-500
  fuera_de_producto:    '#92400e', // amber-800
  otro:                 '#71717a', // zinc-500
}

/**
 * Clasifica una pieza gate=0 a su MatrixP0Cause final, usando la config de
 * gates más reciente del turno (la última snapshot disponible, o la única si
 * sólo hay una). Para piezas sin error explícito o con "Fuera de límites" hace
 * descomposición en sub-causa (calidad/calibre/etc.) cuando hay datos por pieza.
 *
 * Si no hay configSnapshots, las sub-causas no se distinguen — el paraguas
 * "Fuera de límites" agrupa todo.
 */
function classifyPiece(piece: FirestorePieceRecord, configSnapshots?: GateConfigSnapshot[]): MatrixP0Cause {
  // Encontrar el snapshot más reciente con at <= piece.ts (o el último si todos son posteriores)
  let activeGates: GateConfigSnapshot['gates'] = []
  if (configSnapshots && configSnapshots.length > 0) {
    const eligible = configSnapshots.filter(s => s.at <= piece.ts)
    const snap = eligible[eligible.length - 1] ?? configSnapshots[configSnapshots.length - 1]
    activeGates = snap?.gates ?? []
  }
  // El record para classifyRecordToMatrix debe verse como Gate0Record
  const gate0Record = {
    ts: piece.ts,
    pieces: piece.pieces,
    weightKg: piece.weightKg,
    weightPerPieceGrams: piece.weightPerPieceGrams,
    quality: piece.quality,
    calibre: piece.calibre,
    error: piece.error ?? '',
  } as Parameters<typeof classifyRecordToMatrix>[0]
  return classifyRecordToMatrix(gate0Record, activeGates, CALIBRE_WEIGHT_RANGES)
}


export function ShiftTimelineView({
  timelineBuckets, shiftDoc, shiftWindow, configSnapshots,
  gate0Pieces, pauses, microDetentions,
  summaryId, adminUid, onPauseUpdated,
  selectedCauses, onClearSelectedCauses,
  summaryP0Pct,
  alertThreshold = 2,
  criticalThreshold = 3.5,
}: ShiftTimelineViewProps) {
  // ── Estado del diálogo de anotación (Fase 3) ──────────────────────────
  const canAnnotate = !!summaryId && !!adminUid
  const [annotationPause, setAnnotationPause] = useState<Pause | null>(null)
  const [annotationOpen, setAnnotationOpen] = useState(false)

  // ── Estado del diálogo de detalle de minuto (Fase 4a) ─────────────────
  const [minuteDetailState, setMinuteDetailState] = useState<{
    open: boolean
    tsMin: string | null
    activeGates: GateAssignment[]
    bucket: TimelineBucket | undefined
  }>({ open: false, tsMin: null, activeGates: [], bucket: undefined })

  // Índice label → TimelineBucket para resolver clicks en barras.
  // El label del axis es `fmtTime(tsMin)` (HH:MM). Se extrae a useMemo
  // externo para que el handler de click pueda usarlo sin re-calcularlo
  // cada render.
  const bucketByLabel = useMemo(() => {
    const m = new Map<string, TimelineBucket>()
    for (const b of timelineBuckets) {
      if (b.pieces > 0) m.set(fmtTime(b.tsMin), b)
    }
    return m
  }, [timelineBuckets])

  // Resuelve qué snapshot de config de gates estaba activo al momento `tsMin`.
  // Reutiliza la lógica que ya aplica `classifyPiece` arriba.
  const resolveActiveGates = useCallback((tsMin: string): GateAssignment[] => {
    if (!configSnapshots || configSnapshots.length === 0) return []
    const eligible = configSnapshots.filter((s) => s.at <= tsMin)
    const snap = eligible.length > 0
      ? eligible[eligible.length - 1]
      : configSnapshots[0]
    return snap?.gates ?? []
  }, [configSnapshots])

  const handleChartClick = useCallback((params: unknown) => {
    const p = params as {
      componentType?: string
      seriesType?: string
      name?: string
      data?: { name?: string }
    }

    // 1) Click en banda de pausa (markArea) → dialog de anotación (Fase 3)
    if (p.componentType === 'markArea') {
      if (!canAnnotate || !pauses || pauses.length === 0) return
      const pauseId = p.name ?? p.data?.name
      if (!pauseId) return
      const pause = pauses.find((x) => x.id === pauseId)
      if (!pause) return
      setAnnotationPause(pause)
      setAnnotationOpen(true)
      return
    }

    // 2) Click en barra stacked (producción o P0/min) → dialog detalle minuto
    if (p.seriesType === 'bar') {
      if (!summaryId) return
      const label = p.name
      if (!label) return
      const bucket = bucketByLabel.get(label)
      if (!bucket) return
      setMinuteDetailState({
        open: true,
        tsMin: bucket.tsMin,
        activeGates: resolveActiveGates(bucket.tsMin),
        bucket,
      })
    }
  }, [canAnnotate, pauses, summaryId, bucketByLabel, resolveActiveGates])
  const causesArr = useMemo(() => [...(selectedCauses ?? new Set<MatrixP0Cause>())], [selectedCauses])
  const hasSelection = causesArr.length > 0

  // ── Export PNG / CSV + selector de rango ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const echartsRef = useRef<any>(null)
  const [activeZoom, setActiveZoom] = useState<'10min' | '1h' | 'turno'>('turno')
  const [zoomState, setZoomState] = useState({ start: 0, end: 100 })

  const totalMinutes = useMemo(() => {
    const buckets = timelineBuckets.filter(b => b.pieces > 0)
    if (buckets.length === 0) return 480
    const effectiveStartMs = Date.parse(buckets[0]!.tsMin) - 10 * 60_000
    const effectiveEndMs = Date.parse(buckets[buckets.length - 1]!.tsMin) + 10 * 60_000
    return Math.min(24 * 60, Math.max(1, Math.round((effectiveEndMs - effectiveStartMs) / 60_000)))
  }, [timelineBuckets])

  const handleZoomPreset = useCallback((preset: '10min' | '1h' | 'turno') => {
    setActiveZoom(preset)
    let start = 0
    if (preset === '10min') start = Math.max(0, 100 - Math.round((10 / totalMinutes) * 100))
    else if (preset === '1h') start = Math.max(0, 100 - Math.round((60 / totalMinutes) * 100))
    setZoomState({ start, end: 100 })
  }, [totalMinutes])

  const downloadPNG = useCallback(() => {
    const url = echartsRef.current?.getEchartsInstance()?.getDataURL({
      type: 'png', pixelRatio: 2, backgroundColor: '#111827',
    }) as string | undefined
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `timeline-${shiftDoc?.id ?? 'turno'}.png`
    a.click()
  }, [shiftDoc?.id])

  // Indexar piezas con peso por su causa clasificada (cliente-side)
  const piecesByCause = useMemo(() => {
    type Point = { time: string; grams: number; ts: string; calibre?: string; quality?: string; error?: string }
    const map = new Map<MatrixP0Cause, Point[]>()
    if (!hasSelection || !gate0Pieces || gate0Pieces.length === 0) return map
    for (const p of gate0Pieces) {
      const grams = p.weightPerPieceGrams ?? (p.weightKg ? p.weightKg * 1000 : 0)
      if (grams <= 0) continue
      const cause = classifyPiece(p, configSnapshots)
      if (!causesArr.includes(cause)) continue
      const pt: Point = { time: fmtTime(p.ts), grams, ts: p.ts, calibre: p.calibre, quality: p.quality, error: p.error }
      if (!map.has(cause)) map.set(cause, [])
      map.get(cause)!.push(pt)
    }
    return map
  }, [causesArr, hasSelection, gate0Pieces, configSnapshots])

  const totalScatterPts = [...piecesByCause.values()].reduce((s, arr) => s + arr.length, 0)
  const scatterAxisShow = totalScatterPts > 0

  // ── Detector de falsos positivos (pre/post-turno) ─────────────────────
  //
  // Problema operativo real: antes y después del turno la máquina registra
  // piezas "espurias" que no son producción: calibración con peso patrón,
  // aseo con agua sobre sensores, contrastación de gates. Se detectan por
  // DOS criterios complementarios:
  //
  //   1. LOTE DUMMY (correlatividad): lote que representa < 1% del turno Y
  //      tiene ≥ 95% de sus piezas en gate=0. Atrapa `1111`, `0000` y
  //      similares dummies sin hardcoded names.
  //
  //   2. DENSIDAD DE PRODUCCIÓN (ventana móvil 5 min): el INICIO real del
  //      turno es la primera ventana de 5 minutos con ≥ 3 minutos activos
  //      y ≥ 20 piezas. Análogamente el FIN. Atrapa piezas de calibración
  //      que usan lote real (720250932 con 8 pzs de prueba → baja densidad
  //      aislada).
  //
  // Los dos criterios se aplican en cadena: primero filtramos dummies,
  // después buscamos densidad sobre los buckets limpios.
  const productionWindow = useMemo(() => {
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
    // Buckets que pasan el filtro de lote (conservador: mantenemos buckets
    // sin lote porque no tenemos señal para descartar).
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

    // Inicio real: primera ventana forward que cumple
    let startBucket = cleanBuckets[0]!
    for (const b of cleanBuckets) {
      if (windowMeetsCriteria(Date.parse(b.tsMin), 1)) { startBucket = b; break }
    }
    // Fin real: última ventana backward que cumple (desde atrás hacia adelante)
    let endBucket = cleanBuckets[cleanBuckets.length - 1]!
    for (let i = cleanBuckets.length - 1; i >= 0; i--) {
      const b = cleanBuckets[i]!
      if (windowMeetsCriteria(Date.parse(b.tsMin), -1)) { endBucket = b; break }
    }

    const startTs = startBucket.tsMin
    const endTs = endBucket.tsMin
    const startMs = Date.parse(startTs)
    const endMs = Date.parse(endTs)
    // Piezas excluidas: todo lo que queda fuera del rango productivo
    // (dummies + piezas pre/post de lote real sin densidad).
    const excludedPieces = timelineBuckets
      .filter((b) => {
        const ts = Date.parse(b.tsMin)
        return ts < startMs || ts > endMs
      })
      .reduce((s, b) => s + b.pieces, 0)
    return { startTs, endTs, startMs, endMs, dummyLots, excludedPieces }
  }, [timelineBuckets])

  const downloadCSV = useCallback(() => {
    const inWin = (tsMin: string) => {
      if (!productionWindow) return true
      const ts = Date.parse(tsMin)
      return ts >= productionWindow.startMs && ts <= productionWindow.endMs
    }
    const buckets = timelineBuckets.filter(b => b.pieces > 0 && inWin(b.tsMin))
    const header = ['Hora', 'Piezas totales', 'Piezas OK', 'Piezas P0', 'P0%', 'Peso prom (g)', 'Calibre', 'Lote'].join(',')
    const rows = buckets.map(b => {
      const p0Pct = b.pieces > 0 ? ((b.p0Pieces / b.pieces) * 100).toFixed(2) : '0.00'
      const avgG = b.weightCount && b.weightCount > 0 && b.weightKg
        ? Math.round((b.weightKg / b.weightCount) * 1000)
        : ''
      return [
        fmtTime(b.tsMin),
        b.pieces,
        b.pieces - b.p0Pieces,
        b.p0Pieces,
        p0Pct,
        avgG,
        b.dominantCalibre ?? '',
        b.lot ?? '',
      ].join(',')
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timeline-${shiftDoc?.id ?? 'turno'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [timelineBuckets, productionWindow, shiftDoc?.id])

  const chartOption = useMemo(() => {
    // Filtrar buckets: solo los del rango productivo real. Los pre/post-turno
    // (calibración/aseo) quedan excluidos del chart — su existencia se
    // comunica via el badge "Pre/post-turno" arriba.
    const inWindow = (tsMin: string): boolean => {
      if (!productionWindow) return true
      const ts = Date.parse(tsMin)
      return ts >= productionWindow.startMs && ts <= productionWindow.endMs
    }
    const buckets = timelineBuckets.filter(b => b.pieces > 0 && inWindow(b.tsMin))
    // P0% acumulado del turno hasta ese minuto inclusive — para línea principal.
    // Termina exactamente en summary.pointZeroPct (promedio ponderado del turno).
    const cumulativeP0Pcts: number[] = []
    // Piezas acumuladas en paralelo — usado para ocultar la línea mientras
    // la muestra es estadísticamente insignificante (evita pico 100% por 1-2
    // piezas de calibración al arranque).
    const cumPiecesByBucket: number[] = []
    let cumPieces = 0, cumP0 = 0
    for (const b of buckets) {
      cumPieces += b.pieces
      cumP0     += b.p0Pieces
      cumulativeP0Pcts.push(cumPieces > 0 ? +((cumP0 / cumPieces) * 100).toFixed(2) : 0)
      cumPiecesByBucket.push(cumPieces)
    }
    // Umbral de masa estadística: la línea P0% solo se dibuja cuando hay
    // ≥ este número de piezas acumuladas. Antes de eso, quedará null
    // (connectNulls hace que la línea arranque limpia en el primer punto
    // significativo, sin el spike artificial del arranque/calibración).
    const P0_LINE_MIN_PIECES = 50

    // Eje X dinámico + proporcional al tiempo real (Fase 2).
    //
    // Dos cambios vs la versión anterior:
    //   1. Arranque: 10 min antes del primer bucket con datos (NO en
    //      shiftWindow.startAt=19:00/07:00 ventana ancha) — evita 2-3 h
    //      vacías al inicio que aplastan la escala visual.
    //   2. Expansión minuto a minuto: el category axis antes solo tenía
    //      slots para minutos con piezas. Entre bucket con data y el
    //      siguiente, un gap de 90 min se renderizaba como 1 slot → las
    //      bandas de pausa se veían como líneas de 4 px. Ahora generamos
    //      un label por CADA minuto del rango, con null en slots sin data.
    //      Los markArea ahora cubren proporcionalmente el tiempo real.
    const firstBucket = buckets[0]
    const lastBucket = buckets[buckets.length - 1]
    const effectiveStartMs = firstBucket
      ? Date.parse(firstBucket.tsMin) - 10 * 60_000
      : Date.parse(shiftWindow.startAt)
    const effectiveEndMs = lastBucket
      ? Date.parse(lastBucket.tsMin) + 10 * 60_000
      : Date.parse(shiftWindow.endAt)

    // Axis expandido minuto a minuto. Cap a 24 h para evitar arrays
    // absurdos si el rango llega corrupto.
    const maxSlots = 24 * 60
    const totalMinutes = Math.min(maxSlots, Math.max(1, Math.round((effectiveEndMs - effectiveStartMs) / 60_000)))
    const lineTimes: string[] = new Array(totalMinutes + 1)
    const axisIndexByLabel = new Map<string, number>()
    for (let i = 0; i <= totalMinutes; i++) {
      const label = fmtTime(new Date(effectiveStartMs + i * 60_000).toISOString())
      lineTimes[i] = label
      axisIndexByLabel.set(label, i)
    }

    // Alinear data al axis expandido. Los slots sin bucket quedan null —
    // connectNulls en la serie line hace que la línea siga conectada.
    const lineValues: (number | null)[] = new Array(lineTimes.length).fill(null)
    const p0PiecesAligned: (number | null)[] = new Array(lineTimes.length).fill(null)
    // Nueva capa (Fase 3): piezas productivas (gate 1-12) por minuto.
    // Junto con p0PiecesAligned forman un stacked bar: parte inferior emerald
    // (ritmo productivo) + parte superior gris (P0). La altura total = piezas
    // totales del minuto → el ojo humano detecta inicio/fin de turno y caídas
    // de ritmo sin calcular nada.
    const productivePiecesAligned: (number | null)[] = new Array(lineTimes.length).fill(null)
    // NO ponemos un 0 sintético inicial: con el umbral de masa estadística,
    // la línea debe arrancar directamente en el primer punto significativo,
    // sin trazo desde "0%" a través de los minutos de calibración.
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]!
      const idx = axisIndexByLabel.get(fmtTime(b.tsMin))
      if (idx === undefined) continue
      const cumHere = cumPiecesByBucket[i] ?? 0
      lineValues[idx] = cumHere >= P0_LINE_MIN_PIECES ? (cumulativeP0Pcts[i] ?? null) : null
      p0PiecesAligned[idx] = b.p0Pieces ?? 0
      productivePiecesAligned[idx] = Math.max(0, (b.pieces ?? 0) - (b.p0Pieces ?? 0))
    }

    // `bucketByLabel` ya está declarado fuera (para uso del click handler).
    // El closure lo captura — no necesitamos redeclararlo acá.

    // Desglose por minuto: cuántas pzs P0 de cada causa hubo en ese minuto.
    // Map<minuteKey, Map<MatrixP0Cause, count>>
    const breakdownByMinute = new Map<string, Map<MatrixP0Cause, number>>()
    if (gate0Pieces && gate0Pieces.length > 0) {
      for (const p of gate0Pieces) {
        const minuteKey = fmtTime(p.ts)
        const cause = parseMatrixErrorString(p.error ?? '')
        if (!breakdownByMinute.has(minuteKey)) breakdownByMinute.set(minuteKey, new Map())
        const m = breakdownByMinute.get(minuteKey)!
        m.set(cause, (m.get(cause) ?? 0) + (p.pieces ?? 1))
      }
    }

    // Color de línea según verdict del turno (mismo semáforo que calendario)
    const lineColor = summaryP0Pct == null
      ? '#ef4444'
      : summaryP0Pct < alertThreshold
        ? '#10b981'  // emerald — bajo el umbral de alerta
        : summaryP0Pct <= criticalThreshold
          ? '#f59e0b'  // amber — entre alerta y crítico
          : '#ef4444'  // red — sobre crítico

    // Markers verticales del turno configurado (inicio + fin)
    const shiftMarkLines = [
      {
        name: `Inicio turno\n${fmtTime(shiftWindow.startAt)}`,
        xAxis: fmtTime(shiftWindow.startAt),
        lineStyle: { color: '#10b981', type: 'solid' as const, width: 1 },
        label: { show: true, formatter: '▶ Inicio', color: '#10b981', fontSize: 9, position: 'insideStartTop' as const },
      },
      {
        name: `Fin turno\n${fmtTime(shiftWindow.endAt)}`,
        xAxis: fmtTime(shiftWindow.endAt),
        lineStyle: { color: '#6b7280', type: 'solid' as const, width: 1 },
        label: { show: true, formatter: '◀ Fin', color: '#6b7280', fontSize: 9, position: 'insideEndTop' as const },
      },
    ]

    // Líneas horizontales en umbrales (visualmente "salud OK / atención / crítico")
    const thresholdLines = [
      {
        yAxis: alertThreshold,
        lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1, opacity: 0.5 },
        // Labels al lado IZQUIERDO (insideStartTop) para no chocar con el
        // título "Pzs/min" y los íconos del toolbox en la esquina derecha.
        // Texto corto sin "alerta/crítico" (el color ya lo dice).
        label: { show: true, formatter: `${alertThreshold}%`, color: '#f59e0b', fontSize: 10, position: 'insideStartTop' as const },
      },
      {
        yAxis: criticalThreshold,
        lineStyle: { color: '#ef4444', type: 'dashed' as const, width: 1, opacity: 0.5 },
        label: { show: true, formatter: `${criticalThreshold}%`, color: '#ef4444', fontSize: 10, position: 'insideStartTop' as const },
      },
    ]

    // Checkpoints como markLine
    const uploadLines = (shiftDoc?.uploads ?? []).map(u => ({
      name: `Upload\n${fmtTime(u.at)}`,
      xAxis: fmtTime(u.at),
      lineStyle: { color: '#3b82f6', type: 'dashed' as const, width: 1.5 },
      label: { show: true, formatter: '↑', color: '#3b82f6', fontSize: 10 },
    }))

    const actionLines = (shiftDoc?.actions ?? []).map(a => ({
      name: `Acción\n${fmtTime(a.at)}`,
      xAxis: fmtTime(a.at),
      lineStyle: { color: '#f59e0b', type: 'dashed' as const, width: 1.5 },
      label: { show: true, formatter: '⚙', color: '#f59e0b', fontSize: 10 },
    }))

    // Markers de cambio de config de gates (FASE 27) — skip primer snapshot (config inicial)
    const configChangeLines = (configSnapshots ?? []).slice(1).map(s => ({
      name: `Config gates\n${fmtTime(s.at)}`,
      xAxis: fmtTime(s.at),
      lineStyle: { color: '#06b6d4', type: 'dashed' as const, width: 1.5 },
      label: { show: true, formatter: '🔧', color: '#06b6d4', fontSize: 10 },
    }))

    // Cambios de lote: cuando el lot dominante cambia entre buckets consecutivos
    // con actividad (pieces > 0). Un cambio de lote puede indicar nueva bandeja.
    const lotChangeLines: object[] = []
    const activeBuckets = buckets  // ya filtrados: pieces > 0
    for (let i = 1; i < activeBuckets.length; i++) {
      const prev = activeBuckets[i - 1]
      const curr = activeBuckets[i]
      if (prev?.lot && curr?.lot && prev.lot !== curr.lot) {
        const t = fmtTime(curr.tsMin)
        lotChangeLines.push({
          name: `Lote ${curr.lot}`,
          xAxis: t,
          lineStyle: { color: '#8b5cf6', type: 'dotted' as const, width: 1.5 },
          label: { show: true, formatter: '📦', color: '#8b5cf6', fontSize: 9, position: 'insideEndBottom' as const },
        })
      }
    }

    // Bandas de tiempo muerto — renderizadas desde `pauses` cargadas de
    // `meta/pauses` (pobladas por Fase 1 backfill). Cada banda lleva
    // `name: p.id` para que el click identifique qué pausa se editó.
    //
    // Filtramos las pausas que caen FUERA del productionWindow: las pausas
    // entre piezas de calibración pre-turno no son pausas operativas reales,
    // son "no hay turno todavía". Mismo para post-turno.
    //
    // Colores:
    //   - Tag efectivo (manual > auto) → color del tag con emoji
    //   - Sin tag → gris tenue con opacidad por tier ("⏸ Xmin", invita a clickear)
    //
    // La opacidad crece con el tier (pausa < larga < parada) para que
    // paradas grandes sin clasificar salten a la vista.
    const pausesInWindow = (pauses ?? []).filter((p) => {
      if (!productionWindow) return true
      const pStart = Date.parse(p.startAt)
      const pEnd = Date.parse(p.endAt)
      // Permisivo: pausa cuyo rango SOLAPA con el productionWindow.
      return pEnd >= productionWindow.startMs && pStart <= productionWindow.endMs
    })
    const deadTimeAreas: Array<[object, object]> = pausesInWindow.map((p) => {
      const tA = fmtTime(p.startAt)
      const tB = fmtTime(p.endAt)
      const durMin = Math.round(p.durationSec / 60)
      const effectiveTag = resolveEffectiveTag(p)

      let areaColor: string
      let labelColor: string
      let labelText: string
      if (effectiveTag) {
        areaColor = effectiveTag.bandFill
        labelColor = effectiveTag.color
        labelText = `${effectiveTag.emoji} ${effectiveTag.label.split(' ')[0]} ${durMin}min`
      } else {
        const opacityByTier = p.tier === 'parada' ? 0.12 : p.tier === 'larga' ? 0.09 : 0.06
        areaColor = `rgba(148,163,184,${opacityByTier})`
        labelColor = '#94a3b8'
        labelText = `⏸ ${durMin}min`
      }
      // Ocultar label en pausas CORTAS SIN CLASIFICAR (<10min). Si el admin
      // clasificó (tag manual) o el detector marcó colación (autoTag), el
      // label se muestra siempre — el esfuerzo de anotar merece ser visible.
      // La banda translúcida sigue ahí para las <10min sin tag, y el click
      // sigue abriendo el diálogo.
      const showLabel = durMin >= 10 || !!effectiveTag
      return [
        {
          name: p.id, // identifica la pausa al clickear (Fase 3)
          xAxis: tA,
          itemStyle: { color: areaColor },
          label: {
            show: showLabel,
            formatter: labelText,
            color: labelColor,
            fontSize: 10,
            position: 'insideTopRight' as const,
          },
        },
        { xAxis: tB },
      ]
    })

    return {
      backgroundColor: 'transparent',
      // Más margen bajo para el slider de zoom
      grid: { left: 40, right: 16, top: 20, bottom: 60 },
      toolbox: {
        right: 10,
        top: 0,
        feature: {
          dataZoom: { yAxisIndex: false, title: { zoom: 'Zoom', back: 'Reset zoom' } },
          restore: { title: 'Resetear' },
          saveAsImage: { type: 'png' as const, pixelRatio: 2, title: 'Guardar PNG', name: 'timeline-grader', backgroundColor: '#111827' },
        },
        iconStyle: { borderColor: '#6b7280' },
        emphasis: { iconStyle: { borderColor: '#f9fafb' } },
      },
      // Zoom: rueda para pan, slider visible, pinch-zoom en móvil
      dataZoom: [
        { type: 'inside', start: zoomState.start, end: zoomState.end, zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false },
        {
          type: 'slider',
          start: zoomState.start,
          end: zoomState.end,
          height: 14,           // antes 18 — más discreto
          bottom: 8,
          backgroundColor: '#111827',
          fillerColor: 'rgba(148,163,184,0.15)',  // gris tenue (antes rojo translúcido)
          borderColor: '#1f2937',
          handleStyle: { color: '#64748b' },
          moveHandleStyle: { color: '#64748b' },
          emphasis: { handleStyle: { color: '#94a3b8' } },
          textStyle: { color: '#6b7280', fontSize: 10 },
        },
      ],
      xAxis: {
        type: 'category' as const,
        // lineTimes: 1 label por minuto (axis expandido minuto a minuto).
        data: lineTimes,
        axisLine: { lineStyle: { color: '#374151' } },
        // Adaptativo al zoom: dejamos que ECharts decida cuántos labels
        // mostrar según el ancho visible post-zoom — `hideOverlap: true` hace
        // que labels que se solapan se escondan. Al hacer zoom la densidad
        // crece naturalmente (más espacio por label → más minutos visibles,
        // llegando hasta minuto a minuto en zoom muy cercano).
        //
        // `interval: 'auto'` pide a ECharts que compute el stride óptimo
        // según el pixel width disponible. Cualquier interval fijo rompe
        // este comportamiento y deja rangos con 0-2 labels al zoom.
        axisLabel: {
          color: '#6b7280',
          fontSize: 11,
          hideOverlap: true,
          interval: 'auto' as const,
        },
      },
      yAxis: [
        (() => {
          // Escala adaptativa tier-based para el P0% acumulado.
          //
          // Referencia: el P0% FINAL del turno (summaryP0Pct si está, sino
          // el último valor acumulado significativo). Esta es la lectura
          // clave del analista — el cierre del turno. El arranque tiene
          // valores altos por bajo volumen y puede salirse del eje; es OK,
          // el foco es la tendencia del turno completo.
          const meaningful = cumulativeP0Pcts.filter((_, i) => (cumPiecesByBucket[i] ?? 0) >= P0_LINE_MIN_PIECES)
          const finalP0 = summaryP0Pct ?? (meaningful.length > 0 ? meaningful[meaningful.length - 1]! : 0)
          const reference = Math.max(finalP0, criticalThreshold)
          // Tiers: cada uno garantiza que la línea real ocupe ~30-60% del
          // eje vertical — no aplastada (<10%) ni fuera de rango (>100%).
          let max: number
          let interval: number
          if (reference <= 2)      { max = 5;   interval = 1 }
          else if (reference <= 5) { max = 10;  interval = 2 }
          else if (reference <= 10){ max = 20;  interval = 5 }
          else if (reference <= 25){ max = 40;  interval = 10 }
          else                     { max = Math.ceil(reference * 1.5 / 10) * 10; interval = Math.ceil(max / 10) }
          return {
            type: 'value' as const,
            name: 'P0%',
            nameTextStyle: { color: '#6b7280', fontSize: 11 },
            axisLabel: { color: '#6b7280', fontSize: 11, formatter: '{value}%' },
            splitLine: { lineStyle: { color: '#1f2937' } },
            min: 0,
            max,
            interval,
          }
        })(),
        {
          // Eje secundario: piezas totales/min (stacked = productivas + P0).
          // Antes marcaba solo P0/min; ahora la altura de la barra refleja el
          // ritmo de producción completo del minuto.
          type: 'value' as const,
          name: 'Pzs/min',
          nameTextStyle: { color: '#6b7280', fontSize: 11 },
          position: 'right' as const,
          axisLabel: { color: '#6b7280', fontSize: 11 },
          splitLine: { show: false },
          min: 0,
        },
        {
          // Eje terciario para scatter del drill-down (peso en gramos)
          type: 'value' as const,
          name: 'Peso (g)',
          nameTextStyle: { color: '#6b7280', fontSize: 10 },
          position: 'right' as const,
          offset: 50,
          axisLabel: { color: '#6b7280', fontSize: 10, formatter: '{value} g' },
          splitLine: { show: false },
          min: 0,
          show: scatterAxisShow,
        },
      ],
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1f2937',
        borderColor: '#374151',
        textStyle: { color: '#f9fafb', fontSize: 11 },
        formatter: (params: unknown[]) => {
          if (!Array.isArray(params) || params.length === 0) return ''
          const arr = params as Array<{ name: string; value: number | [string, number]; seriesName: string; seriesType: string; dataIndex: number; color?: string }>
          const linePt    = arr.find(p => p.seriesType === 'line')
          const barPts    = arr.filter(p => p.seriesType === 'bar')
          const productivePt = barPts.find(p => p.seriesName === 'Pzs productivas/min')
          const p0Pt         = barPts.find(p => p.seriesName === 'Pzs P0/min')
          const scatterPts = arr.filter(p => p.seriesType === 'scatter')
          const time = linePt?.name ?? barPts[0]?.name ?? (Array.isArray(scatterPts[0]?.value) ? scatterPts[0].value[0] : '')
          const lines: string[] = [`<b>${time}</b>`]
          // Acumulado: solo mostrar cuando la línea tiene valor real. Los
          // buckets de arranque/calibración (< P0_LINE_MIN_PIECES) no tienen
          // valor porque el acumulado ahí no es estadísticamente significativo.
          if (linePt && linePt.value != null) {
            lines.push(`<span style="color:${lineColor}">━</span> Acumulado del turno: <b>${linePt.value}%</b>`)
          } else {
            lines.push(`<span style="color:#6b7280">━</span> Acumulado: <em style="color:#6b7280">arranque (sin masa suficiente)</em>`)
          }
          // Pulso del minuto: productivas + P0 = total, más % del minuto
          const productivas = Number(productivePt?.value) || 0
          const p0Min = Number(p0Pt?.value) || 0
          const total = productivas + p0Min
          if (total > 0) {
            const pctMin = ((p0Min / total) * 100).toFixed(1)
            lines.push(`<span style="color:#10b981">▮</span> Este minuto: <b>${total}</b> pzs (<span style="color:#10b981">${productivas}</span> OK + <span style="color:#94a3b8">${p0Min}</span> P0 = <b>${pctMin}%</b>)`)
            // Desglose por causa para este minuto (sólo si hubo P0)
            if (p0Min > 0) {
              const breakdown = breakdownByMinute.get(time)
              if (breakdown && breakdown.size > 0) {
                const sortedCauses = [...breakdown.entries()].sort((a, b) => b[1] - a[1])
                for (const [cause, count] of sortedCauses) {
                  const label = MATRIX_P0_CAUSES[cause]?.label ?? cause
                  const color = CAUSE_HEX[cause] ?? '#94a3b8'
                  lines.push(`&nbsp;&nbsp;<span style="color:${color}">●</span> ${label}: ${count}`)
                }
              }
            }
          }
          // Enriquecer con metadatos del bucket (lote, calibre dominante) si existen.
          // El axis ahora está expandido minuto a minuto; el metaBucket se
          // busca por el label de tiempo del punto hovereado (no por índice).
          const metaBucket = typeof time === 'string' ? bucketByLabel.get(time) : undefined
          if (metaBucket?.lot) {
            lines.push(`<span style="color:#8b5cf6">📦</span> Lote: <b>${metaBucket.lot}</b>`)
          }
          if (metaBucket?.dominantCalibre) {
            lines.push(`<span style="color:#6366f1">📏</span> Calibre: ${metaBucket.dominantCalibre}`)
          }
          for (const sp of scatterPts) {
            const v = Array.isArray(sp.value) ? sp.value[1] : sp.value
            lines.push(`<span style="color:${sp.color}">●</span> ${sp.seriesName}: ${v}g`)
          }
          return lines.join('<br/>')
        },
      },
      series: [
        // Barras tenues — CANTIDAD de pzs P0 por minuto (más intuitivo que %).
        // Eje derecho ("Pzs P0/min"). Tooltip muestra desglose por causa.
        // Las barras incluyen un slot vacío al inicio (sintético) → null.
        // Stacked bars — "pulso de producción" por minuto.
        //   - Segmento inferior: piezas productivas (gate 1-12) en emerald tenue
        //   - Segmento superior: piezas P0 (gate 0) en gris, igual que antes
        // Altura total = pzs totales del minuto. La envolvente marca el ritmo
        // real del turno: ráfagas altas y continuas = producción normal;
        // barras aisladas bajas = calibración/aseo/pruebas.
        {
          name: 'Pzs productivas/min',
          type: 'bar' as const,
          yAxisIndex: 1,
          stack: 'volumen',
          data: productivePiecesAligned,
          itemStyle: { color: 'rgba(16, 185, 129, 0.28)' },  // emerald 28% opacity
          emphasis: { itemStyle: { color: 'rgba(16, 185, 129, 0.55)' } },
          // Ancho adaptativo al zoom: barMaxWidth 12 deja respirar al zoom
          // (antes 4 se veían hilos). barCategoryGap 10% mantiene contraste
          // mínimo entre barras vecinas.
          barMaxWidth: 12,
          barCategoryGap: '10%',
          z: 1,
        },
        {
          name: 'Pzs P0/min',
          type: 'bar' as const,
          yAxisIndex: 1,
          stack: 'volumen',
          data: p0PiecesAligned,
          itemStyle: { color: 'rgba(148, 163, 184, 0.45)' },
          emphasis: { itemStyle: { color: 'rgba(148, 163, 184, 0.75)' } },
          barMaxWidth: 12,
          barCategoryGap: '10%',
          z: 2,
        },
        // Línea principal — P0% acumulado del turno. Color según verdict
        // (verde/amber/rojo) consistente con calendario y panel.
        {
          name: 'P0% acumulado',
          type: 'line' as const,
          yAxisIndex: 0,
          data: lineValues,
          connectNulls: true,  // axis expandido tiene nulls entre minutos con data
          smooth: true,
          lineStyle: { color: lineColor, width: 2.5 },
          // areaStyle removido (Ronda 5): el gradient cubría visualmente las
          // barras bajas (P0/min < P0% acumulado) y el área del line tapaba
          // los clicks. La línea por sí sola comunica el acumulado sin
          // bloquear interacción con las barras stacked debajo.
          symbol: 'none',
          z: 3,
          markLine: {
            silent: false,
            animation: false,
            data: [
              ...uploadLines,
              ...actionLines,
              ...configChangeLines,
              ...lotChangeLines,
              ...shiftMarkLines,
              ...thresholdLines,
            ],
          },
          markArea: deadTimeAreas.length > 0 ? {
            // `silent: false` permite hover highlight + que los clicks emitan
            // eventos (el admin clickea una banda para clasificarla). Cuando
            // el usuario no es admin, el handler igual filtra — el overhead
            // es despreciable.
            silent: false,
            data: deadTimeAreas,
            emphasis: {
              itemStyle: { opacity: 0.85 },
            },
          } : undefined,
        },
        // Una serie scatter por cada causa seleccionada (multi-select)
        ...causesArr.map(cause => {
          const pts = piecesByCause.get(cause) ?? []
          const color = CAUSE_HEX[cause] ?? '#ef4444'
          return {
            name: MATRIX_P0_CAUSES[cause].label,
            type: 'scatter' as const,
            yAxisIndex: 2,  // eje terciario "Peso (g)"
            data: pts.map(p => [p.time, p.grams]),
            symbolSize: 6,
            itemStyle: {
              color,
              opacity: 0.75,
              borderColor: '#1f2937',
              borderWidth: 0.5,
            },
            emphasis: { itemStyle: { opacity: 1, borderWidth: 2, borderColor: '#f9fafb' } },
            z: 5,
          }
        }),
      ],
    }
  }, [timelineBuckets, shiftDoc, shiftWindow, configSnapshots, causesArr, piecesByCause, scatterAxisShow, gate0Pieces, pauses, productionWindow, bucketByLabel, summaryP0Pct, alertThreshold, criticalThreshold, zoomState])

  // ── Cobertura del turno ────────────────────────────────────────────────
  // Mide cuánto del turno está "entendido" (operación + colación + micros
  // automáticas) vs cuánto está sin clasificar (pausas que el detector vio
  // pero ningún admin tipificó). Objetivo visual: acercarse al 100%.
  const coverage = useMemo(() => {
    if (!pauses || pauses.length === 0) return null
    const pausesTotalMin = pauses.reduce((s, p) => s + p.durationSec, 0) / 60
    const unclassifiedMin = pauses
      .filter((p) => !p.autoTag && !p.tag)
      .reduce((s, p) => s + p.durationSec, 0) / 60
    const activeMin = timelineBuckets.filter((b) => b.pieces > 0).length
    const microMin = (microDetentions?.totalSec ?? 0) / 60
    const totalMin = activeMin + pausesTotalMin + microMin
    if (totalMin <= 0) return null
    const categorizedMin = totalMin - unclassifiedMin
    const pct = Math.round((categorizedMin / totalMin) * 100)
    return {
      pct,
      unclassifiedMin: Math.round(unclassifiedMin),
      totalMin: Math.round(totalMin),
    }
  }, [pauses, timelineBuckets, microDetentions])

  // Lista cronológica de checkpoints
  const checkpoints = useMemo(() => {
    const list: Array<{
      kind: 'upload' | 'action'
      at: string
      label: string
      sub: string
      verdict?: string
    }> = []

    for (const u of shiftDoc?.uploads ?? []) {
      const files = [u.files.pp && 'PP', u.files.p0 && 'P0'].filter(Boolean).join(' + ')
      list.push({
        kind: 'upload',
        at: u.at,
        label: `Carga: ${files}`,
        sub: `${u.byName} · ${u.snapshot.totalPieces.toLocaleString('es-CL')} pzas · P0 ${u.snapshot.p0Pct.toFixed(1)}%`,
      })
    }

    for (const a of shiftDoc?.actions ?? []) {
      list.push({
        kind: 'action',
        at: a.at,
        label: a.field,
        sub: `${a.byName}${a.reason ? ` · ${a.reason}` : ''}`,
        verdict: a.outcome?.verdict,
      })
    }

    return list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
  }, [shiftDoc])

  const hasData = timelineBuckets.some(b => b.pieces > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 flex-wrap">
          <Clock className="w-4 h-4" />
          Timeline del turno
          {shiftWindow.status === 'live' && (
            <span className="text-xs font-normal text-red-400 animate-pulse">● en vivo</span>
          )}
          {coverage && (
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium',
                coverage.pct >= 95 && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
                coverage.pct < 95 && coverage.pct >= 85 && 'border-amber-500/40 bg-amber-500/10 text-amber-400',
                coverage.pct < 85 && 'border-orange-500/40 bg-orange-500/10 text-orange-400',
              )}
              title={
                coverage.unclassifiedMin > 0
                  ? `${coverage.unclassifiedMin} min sin clasificar de ${coverage.totalMin} min totales`
                  : `${coverage.totalMin} min totales — todo el tiempo clasificado`
              }
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              Cobertura {coverage.pct}%
              {coverage.unclassifiedMin > 0 && (
                <span className="text-muted-foreground font-normal">· {coverage.unclassifiedMin}m sin tag</span>
              )}
            </span>
          )}
          {productionWindow && productionWindow.excludedPieces > 0 && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-zinc-500/40 bg-zinc-500/10 text-zinc-300 text-[11px] font-medium"
              title={`Calibración/aseo detectado por lotes no-correlativos (ej. 1111). ${productionWindow.excludedPieces} pzs quedaron fuera del eje para mantener el análisis centrado en producción real.`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
              Pre/post-turno: {productionWindow.excludedPieces} pzs
              {productionWindow.dummyLots.size > 0 && (
                <span className="text-muted-foreground font-normal">· {productionWindow.dummyLots.size} lote{productionWindow.dummyLots.size > 1 ? 's' : ''} dummy</span>
              )}
            </span>
          )}
        </CardTitle>
      {hasData && (
        <div className="flex items-center gap-2 px-6 pb-2">
          {/* Presets de zoom */}
          <div className="flex border border-border/40 rounded-md overflow-hidden text-[11px]">
            {(['10min', '1h', 'turno'] as const).map(preset => (
              <button
                key={preset}
                onClick={() => handleZoomPreset(preset)}
                className={cn(
                  'px-2 py-0.5 font-medium transition-colors',
                  activeZoom === preset
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
              >
                {preset === 'turno' ? 'Todo' : preset}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={downloadPNG} title="Exportar imagen PNG">
              <Download className="w-3 h-3" /> PNG
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={downloadCSV} title="Exportar datos CSV (minuto a minuto)">
              <Download className="w-3 h-3" /> CSV
            </Button>
          </div>
        </div>
      )}
      </CardHeader>

      <CardContent className="space-y-4">
        {hasSelection && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/60 bg-muted/30 text-xs flex-wrap">
            <span className="text-muted-foreground shrink-0">Mostrando:</span>
            {causesArr.map(cause => {
              const color = CAUSE_HEX[cause] ?? '#ef4444'
              const label = MATRIX_P0_CAUSES[cause].label
              const count = (piecesByCause.get(cause) ?? []).length
              return (
                <span
                  key={cause}
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium"
                  style={{ borderColor: color + '60', backgroundColor: color + '15', color }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                  <span className="text-muted-foreground/80 font-normal">{count.toLocaleString('es-CL')}</span>
                </span>
              )
            })}
            <span className="text-muted-foreground ml-1">
              · {totalScatterPts.toLocaleString('es-CL')} pzas con peso
            </span>
            {onClearSelectedCauses && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-xs"
                onClick={onClearSelectedCauses}
              >
                <X className="w-3 h-3 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        )}
        {!hasData ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            Sin datos de minuto a minuto para este turno.
          </p>
        ) : (
          <ReactECharts
            ref={echartsRef}
            option={chartOption}
            style={{ height: scatterAxisShow ? 360 : 320 }}
            theme="dark"
            opts={{ renderer: 'canvas' }}
            notMerge={true}
            lazyUpdate={false}
            onEvents={{ click: handleChartClick }}
          />
        )}

        {canAnnotate && annotationPause && (
          <PauseAnnotationDialog
            open={annotationOpen}
            onOpenChange={setAnnotationOpen}
            pause={annotationPause}
            summaryId={summaryId!}
            adminUid={adminUid!}
            onSaved={onPauseUpdated}
          />
        )}

        {summaryId && minuteDetailState.tsMin && (
          <MinuteDetailDialog
            open={minuteDetailState.open}
            onOpenChange={(open) => setMinuteDetailState((prev) => ({ ...prev, open }))}
            summaryId={summaryId}
            tsMin={minuteDetailState.tsMin}
            activeGates={minuteDetailState.activeGates}
            bucket={minuteDetailState.bucket}
          />
        )}

        {/* Checkpoints list */}
        {checkpoints.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Eventos del turno
            </p>
            {checkpoints.map((cp, i) => (
              <div key={i} className="flex items-start gap-2.5 text-xs">
                <span className="shrink-0 mt-0.5">
                  {cp.kind === 'upload'
                    ? <Upload className="w-3.5 h-3.5 text-blue-400" />
                    : <Wrench className="w-3.5 h-3.5 text-amber-400" />}
                </span>
                <span className="text-muted-foreground shrink-0 tabular-nums w-11">
                  {fmtTime(cp.at)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{cp.label}</span>
                  <span className="text-muted-foreground ml-1.5">{cp.sub}</span>
                  {cp.verdict && cp.verdict !== 'insufficient-data' && (
                    <span
                      className={cn('ml-2 font-medium', {
                        'text-emerald-400': cp.verdict === 'improved',
                        'text-red-400': cp.verdict === 'worsened',
                        'text-zinc-400': cp.verdict === 'neutral',
                      })}
                    >
                      {cp.verdict === 'improved' ? '↓ mejoró'
                        : cp.verdict === 'worsened' ? '↑ empeoró'
                        : '→ sin cambio'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mensaje "Sin cargas/acciones" eliminado — la ausencia de la lista
             ya comunica esa información sin ruido visual adicional. */}
      </CardContent>
    </Card>
  )
}
