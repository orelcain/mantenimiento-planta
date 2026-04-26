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

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui'
import { Upload, Wrench, Clock, X, Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineBucket, MatrixP0Cause, Pause, MicroDetentionsSummary } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import type { FirestorePieceRecord } from '@/services/grader/graderDailySummary.service'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import { MATRIX_P0_CAUSES, parseMatrixErrorString } from '@/services/grader/graderMatrixP0Causes'
import { classifyRecordToMatrix, CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalytics'
import { PauseAnnotationDialog } from './PauseAnnotationDialog'
import { MinuteDetailDialog } from './MinuteDetailDialog'
import type { GateAssignment } from '@/services/grader/types'
import {
  fmtTime,
  CAUSE_HEX,
  computeProductionWindow,
  resolveAxisWindow,
  buildMarkLines,
  buildMarkAreas,
  buildBaaderTimelineMarkers,
} from './shiftTimelineHelpers'
import {
  DEFAULT_P0_ALERT_PCT,
  DEFAULT_P0_CRITICAL_PCT,
  p0StatusFromPct,
  p0StatusHex,
} from '@/services/grader/graderP0Thresholds'
import { useTimelineSyncOptional } from './useTimelineSync'
import { useChartReadyConnect } from './useEChartsConnect'

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
  /** M18 — estado de conectividad del dispositivo, se pasa al diálogo de anotación. */
  isOnline?: boolean
  /** Causas seleccionadas (multi-select) en el P0CausesPanel — filtran el scatter */
  selectedCauses?: Set<MatrixP0Cause>
  /** Callback para limpiar todas las selecciones desde el badge */
  onClearSelectedCauses?: () => void
  /** P0% final del turno (summary.pointZeroPct) — color de línea según verdict */
  summaryP0Pct?: number
  /** Umbrales para semáforo y líneas horizontales (defaults 2% / 3.5%) */
  alertThreshold?: number
  criticalThreshold?: number
  /**
   * Ref que el parent puede pasar para obtener una función que devuelve
   * el data URL (PNG) del chart ECharts en el momento de llamarla.
   * Útil para embeber el gráfico en el PDF de exportación (P2-1).
   */
  chartImageRef?: React.MutableRefObject<(() => string | null) | null>
  /**
   * Snapshot de la línea upstream (3 Evisceradoras Baader). Si está presente
   * y tiene máquinas, el chart agrega un sub-grid debajo del eje X principal
   * con una lane por máquina y bandas de paros (downtime/break/setup) alineadas
   * temporalmente al chart Grader. Permite correlación visual instantánea
   * entre P0% Grader y paros upstream.
   */
  upstreamSnapshot?: UpstreamLineSnapshot | null
  /**
   * Callback opcional: emite el rango temporal actual del zoom del chart.
   * Cuando el usuario hace zoom (slider o preset), se emite `{ startMs, endMs }`
   * con el rango efectivamente visible. Cuando el zoom vuelve a 100%, emite
   * `null`. Permite sincronizar otros paneles (ej. UpstreamMachinesPanel) al
   * mismo rango visible.
   */
  onZoomRangeChange?: (range: { startMs: number; endMs: number } | null) => void
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
  let activeGates: GateConfigSnapshot['gates'] = []
  if (configSnapshots && configSnapshots.length > 0) {
    const eligible = configSnapshots.filter(s => s.at <= piece.ts)
    const snap = eligible[eligible.length - 1] ?? configSnapshots[configSnapshots.length - 1]
    activeGates = snap?.gates ?? []
  }
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
  alertThreshold = DEFAULT_P0_ALERT_PCT,
  criticalThreshold = DEFAULT_P0_CRITICAL_PCT,
  isOnline = true,
  chartImageRef,
  upstreamSnapshot,
  onZoomRangeChange,
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
  const echartsRef = useRef<any>(null)

  // ── Sincronización cross-chart (Fase 1 del Synchronized Timeline) ────────
  const timelineSync = useTimelineSyncOptional()
  const myHoverId = useId()
  const onChartReady = useChartReadyConnect(timelineSync?.connectGroupId ?? '__no-sync__')

  // Exponer función getDataURL al parent para incluir imagen en PDF (P2-1)
  useEffect(() => {
    if (!chartImageRef) return
    chartImageRef.current = () => {
      const instance = echartsRef.current?.getEchartsInstance()
      if (!instance) return null
      return instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#111827' }) as string
    }
    return () => { chartImageRef.current = null }
  }, [chartImageRef])

  const [activeZoom, setActiveZoom] = useState<'10min' | '1h' | 'turno'>('turno')
  const [zoomState, setZoomState] = useState({ start: 0, end: 100 })

  const totalMinutes = useMemo(() => {
    const buckets = timelineBuckets.filter(b => b.pieces > 0)
    if (buckets.length === 0) return 480
    const effectiveStartMs = Date.parse(buckets[0]!.tsMin) - 10 * 60_000
    const effectiveEndMs = Date.parse(buckets[buckets.length - 1]!.tsMin) + 10 * 60_000
    return Math.min(24 * 60, Math.max(1, Math.round((effectiveEndMs - effectiveStartMs) / 60_000)))
  }, [timelineBuckets])

  // ── Ventana de producción real (movida antes de emitZoomRange para evitar
  // TDZ — emitZoomRange filtra por productionWindow para que su rango emitido
  // matchee EXACTAMENTE el axis visible del chartOption). ──────────────────
  const productionWindow = useMemo(
    () => computeProductionWindow(timelineBuckets),
    [timelineBuckets],
  )

  // ── Emite rango temporal del zoom al parent ──────────────────────────────
  // Calcula el rango temporal real (ms) a partir de un % de zoom y propaga a
  // (a) callback prop legacy `onZoomRangeChange` si está, (b) context global
  // `useTimelineSync` si la página está envuelta en TimelineSyncProvider.
  // Síncrono: lo invocan el handler `datazoom` y `handleZoomPreset`.
  //
  // CRÍTICO: el filtrado de buckets DEBE coincidir EXACTAMENTE con el del
  // chartOption (pieces>0 AND dentro de productionWindow). Si difiere,
  // resolveAxisWindow devuelve un effectiveStart/End distinto al axis
  // visible, y el rango emitido al panel queda desplazado (~50min de diff
  // observada con lotes dummy pre-turno). Sin esta consistencia, el slider
  // del Grader desincroniza con los Gantts y barras del panel.
  const emitZoomRange = useCallback((startPct: number, endPct: number) => {
    if (!onZoomRangeChange && !timelineSync) return
    const inProductionWindow = (tsMin: string): boolean => {
      if (!productionWindow) return true
      const ts = Date.parse(tsMin)
      return ts >= productionWindow.startMs && ts <= productionWindow.endMs
    }
    const buckets = timelineBuckets.filter((b) => b.pieces > 0 && inProductionWindow(b.tsMin))
    const emit = (range: { startMs: number; endMs: number } | null) => {
      onZoomRangeChange?.(range)
      timelineSync?.setRange(range)
    }
    if (buckets.length === 0) { emit(null); return }
    // Full zoom (100%): emite null para que el caller use su rango completo
    if (startPct <= 0.5 && endPct >= 99.5) { emit(null); return }
    const axis = resolveAxisWindow(buckets, shiftWindow)
    const spanMs = axis.effectiveEndMs - axis.effectiveStartMs
    // Snap al MINUTO EXACTO: el axis category del Grader usa
    // Math.round(idx_fraccional) sobre slots de 1min cada uno. Si emitimos
    // ms con resolución de segundos, los charts time del panel quedan
    // desfasados por hasta 30s (visible como 1 min en HH:MM). Snap aplica
    // round al índice de minuto antes de convertir a ms — alineación
    // pixel-perfect entre Grader y panel.
    const totalMin = Math.round(spanMs / 60_000)
    const startMinIdx = Math.round((startPct / 100) * totalMin)
    const endMinIdx = Math.round((endPct / 100) * totalMin)
    emit({
      startMs: axis.effectiveStartMs + startMinIdx * 60_000,
      endMs:   axis.effectiveStartMs + endMinIdx * 60_000,
    })
  }, [onZoomRangeChange, timelineSync, timelineBuckets, shiftWindow, productionWindow])

  const handleZoomPreset = useCallback((preset: '10min' | '1h' | 'turno') => {
    setActiveZoom(preset)
    let start = 0
    if (preset === '10min') start = Math.max(0, 100 - Math.round((10 / totalMinutes) * 100))
    else if (preset === '1h') start = Math.max(0, 100 - Math.round((60 / totalMinutes) * 100))
    setZoomState({ start, end: 100 })
    emitZoomRange(start, 100)
  }, [totalMinutes, emitZoomRange])

  // ── Anchor del axis para conversión index↔ms (hover cross-chart) ────────
  // Refleja el effectiveStartMs que produce resolveAxisWindow para el rango
  // visible. Cada slot del axis category representa 1 minuto desde anchor.
  const axisAnchorMs = useMemo(() => {
    const inProductionWindow = (tsMin: string): boolean => {
      if (!productionWindow) return true
      const ts = Date.parse(tsMin)
      return ts >= productionWindow.startMs && ts <= productionWindow.endMs
    }
    const buckets = timelineBuckets.filter((b) => b.pieces > 0 && inProductionWindow(b.tsMin))
    if (buckets.length === 0) return null
    const axis = resolveAxisWindow(buckets, shiftWindow)
    return axis.effectiveStartMs
  }, [timelineBuckets, productionWindow, shiftWindow])

  // ── Publica los lot changes al context (Fase 4c) ─────────────────────────
  // Detecta cambios de lote en los buckets activos y los publica como
  // markLines verticales que el panel upstream proyecta sobre sus charts.
  // Permite ver al instante cómo afectó cada cambio de lote a las Baaders.
  useEffect(() => {
    if (!timelineSync) return
    const inProductionWindow = (tsMin: string): boolean => {
      if (!productionWindow) return true
      const ts = Date.parse(tsMin)
      return ts >= productionWindow.startMs && ts <= productionWindow.endMs
    }
    const buckets = timelineBuckets.filter((b) => b.pieces > 0 && inProductionWindow(b.tsMin))
    const changes: { ms: number; lot: string }[] = []
    for (let i = 1; i < buckets.length; i++) {
      const prev = buckets[i - 1]
      const curr = buckets[i]
      if (prev?.lot && curr?.lot && prev.lot !== curr.lot) {
        changes.push({ ms: Date.parse(curr.tsMin), lot: curr.lot })
      }
    }
    timelineSync.setLotChanges(changes)
  }, [timelineSync, timelineBuckets, productionWindow])

  // ── Hover cross-chart (Fase 4b): mousemove broadcast + listener ─────────
  // Snap al minuto: setHover idempotente skip cuando ms === prev.ms — sin
  // esto, mover el mouse 1px re-renderiza los 7 charts del grupo.
  const onChartMouseMove = useCallback((params: any) => {
    if (!timelineSync || axisAnchorMs == null) return
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    const offsetX = params?.event?.offsetX ?? params?.offsetX
    if (typeof offsetX !== 'number') return
    // Para xAxis category, convertFromPixel devuelve el índice fraccional.
    // Cada índice representa 1 minuto desde axisAnchorMs. Round-down al
    // índice entero más cercano (snap al minuto).
    const idx = inst.convertFromPixel({ xAxisIndex: 0 }, offsetX)
    if (typeof idx !== 'number' || !Number.isFinite(idx)) return
    const minuteIdx = Math.floor(idx)
    const ms = axisAnchorMs + minuteIdx * 60_000
    timelineSync.setHover({ ms, originId: myHoverId })
  }, [timelineSync, myHoverId, axisAnchorMs])

  const onChartMouseOut = useCallback(() => {
    if (timelineSync?.hover?.originId === myHoverId) {
      timelineSync.setHover(null)
    }
  }, [timelineSync, myHoverId])

  // Listener: cuando otro chart del grupo origina hover, dispatchear
  // axisPointer manual sobre este chart para mostrar línea vertical alineada.
  const externalHoverMs = timelineSync?.hover && timelineSync.hover.originId !== myHoverId
    ? timelineSync.hover.ms
    : null
  useEffect(() => {
    const inst = echartsRef.current?.getEchartsInstance?.()
    if (!inst) return
    if (externalHoverMs == null || axisAnchorMs == null) {
      inst.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' })
      inst.dispatchAction({ type: 'hideTip' })
      return
    }
    const idx = (externalHoverMs - axisAnchorMs) / 60_000
    const pixelX = inst.convertToPixel({ xAxisIndex: 0 }, idx)
    if (typeof pixelX !== 'number' || !Number.isFinite(pixelX)) return
    inst.dispatchAction({
      type: 'updateAxisPointer',
      currTrigger: 'mousemove',
      x: pixelX,
      y: 100,
    })
  }, [externalHoverMs, axisAnchorMs])

  const downloadPNG = useCallback(() => {
    const instance = echartsRef.current?.getEchartsInstance()
    if (!instance) return
    const chartUrl = instance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#111827' }) as string

    // ── Metadata para la cabecera ──────────────────────────────────────────
    const dateLabel = shiftDoc?.dateKey
      ? new Date(`${shiftDoc.dateKey}T12:00:00`).toLocaleDateString('es-CL', {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
      : 'Fecha desconocida'
    const shiftLabel = shiftDoc?.shiftId ?? 'Turno'

    // Rango visible: convertir porcentaje de zoom a timestamps reales
    const activeBuckets = timelineBuckets.filter(b => b.pieces > 0)
    let rangeLabel = 'Rango completo'
    if (activeBuckets.length >= 2) {
      const n = activeBuckets.length - 1
      const s = activeBuckets[Math.round((zoomState.start / 100) * n)]
      const e = activeBuckets[Math.min(n, Math.round((zoomState.end / 100) * n))]
      if (s && e) rangeLabel = `${fmtTime(s.tsMin)} → ${fmtTime(e.tsMin)}`
    }

    const isZoomed = zoomState.start > 1 || zoomState.end < 99
    const p0Pct = summaryP0Pct
    const p0Label = p0Pct != null
      ? `P0% ${p0Pct.toFixed(2)}%${isZoomed ? ' (turno completo)' : ''}`
      : null
    // Color del P0% en el header del PNG: usa el helper compartido
    // (consistencia con el resto del módulo). Slate gris si no hay P0% aún.
    const p0Color = p0Pct == null
      ? '#94a3b8'
      : p0StatusHex(p0StatusFromPct(p0Pct, { alert: alertThreshold, critical: criticalThreshold }))

    // ── Componer canvas: cabecera + chart ──────────────────────────────────
    const img = new Image()
    img.onload = () => {
      const W = img.width
      const HEADER_H = Math.round(W * 0.055)   // ~5.5% del ancho → ~88px a 1600px
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = img.height + HEADER_H
      const ctx = canvas.getContext('2d')!

      // Fondo cabecera
      ctx.fillStyle = '#0f172a'
      ctx.fillRect(0, 0, W, HEADER_H)
      // Línea separadora amber
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(0, HEADER_H - 3, W, 3)

      const base = Math.round(W * 0.016)

      // Título principal
      ctx.fillStyle = '#f8fafc'
      ctx.font = `bold ${Math.round(base * 1.15)}px system-ui,sans-serif`
      ctx.fillText(`GRADER Z2 · ${shiftLabel} · ${dateLabel}`, Math.round(W * 0.013), Math.round(HEADER_H * 0.42))

      // Rango visible
      ctx.fillStyle = '#94a3b8'
      ctx.font = `${base}px system-ui,sans-serif`
      ctx.fillText(`Rango: ${rangeLabel}`, Math.round(W * 0.013), Math.round(HEADER_H * 0.76))

      // P0% (alineado a la derecha)
      if (p0Label) {
        ctx.fillStyle = p0Color
        ctx.font = `bold ${Math.round(base * 1.15)}px system-ui,sans-serif`
        ctx.textAlign = 'right'
        ctx.fillText(p0Label, W - Math.round(W * 0.013), Math.round(HEADER_H * 0.58))
        ctx.textAlign = 'left'
      }

      // Chart
      ctx.drawImage(img, 0, HEADER_H)

      const a = document.createElement('a')
      a.href = canvas.toDataURL('image/png')
      a.download = `timeline-${shiftDoc?.id ?? 'turno'}.png`
      a.click()
    }
    img.src = chartUrl
  }, [shiftDoc, timelineBuckets, zoomState, summaryP0Pct, alertThreshold, criticalThreshold])

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
  // (productionWindow se calcula arriba, antes de emitZoomRange, para evitar TDZ.)

  // Emit inicial cuando los buckets cargan: se asegura que el callback reciba
  // el rango actual (null si zoom completo). Re-emite si emitZoomRange cambia
  // (timelineBuckets/shiftWindow), pero sin depender de zoomState (eso lo
  // maneja el handler `datazoom` directo y los presets).
  useEffect(() => {
    emitZoomRange(zoomState.start, zoomState.end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitZoomRange])

  const downloadCSV = useCallback(() => {
    const inWin = (tsMin: string) => {
      if (!productionWindow) return true
      const ts = Date.parse(tsMin)
      return ts >= productionWindow.startMs && ts <= productionWindow.endMs
    }
    // Agrupar por hora (UTC — consistente con fmtTime que usa getUTCHours)
    const buckets = timelineBuckets.filter(b => b.pieces > 0 && inWin(b.tsMin))
    type HourRow = {
      hourLabel: string
      pieces: number; ok: number; p0: number
      weightKgSum: number; weightCount: number
      calibres: Record<string, number>
      pausesSec: number
    }
    const hourMap = new Map<string, HourRow>()
    for (const b of buckets) {
      const d = new Date(b.tsMin)
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const key = `${hh}:00`
      const row = hourMap.get(key) ?? {
        hourLabel: key, pieces: 0, ok: 0, p0: 0,
        weightKgSum: 0, weightCount: 0, calibres: {}, pausesSec: 0,
      }
      row.pieces += b.pieces
      row.ok += b.pieces - b.p0Pieces
      row.p0 += b.p0Pieces
      if (b.weightKg) row.weightKgSum += b.weightKg
      if (b.weightCount) row.weightCount += b.weightCount
      if (b.dominantCalibre) row.calibres[b.dominantCalibre] = (row.calibres[b.dominantCalibre] ?? 0) + b.pieces
      hourMap.set(key, row)
    }

    // Sumar pausas por hora
    for (const pause of (pauses ?? [])) {
      const d = new Date(pause.startAt)
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const key = `${hh}:00`
      const row = hourMap.get(key)
      if (row) row.pausesSec += pause.durationSec
    }

    const SEP = ';'
    const header = ['Hora', 'Piezas totales', 'Piezas OK', 'Piezas P0', 'P0%', 'Peso prom (g)', 'Calibre dominante', 'Tiempo muerto (min)'].join(SEP)
    const rows = [...hourMap.values()].sort((a, b) => a.hourLabel.localeCompare(b.hourLabel)).map(row => {
      const p0Pct = row.pieces > 0 ? ((row.p0 / row.pieces) * 100).toFixed(2) : '0,00'
      const avgG = row.weightCount > 0 ? Math.round((row.weightKgSum / row.weightCount) * 1000) : ''
      const calibre = Object.entries(row.calibres).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
      const pauseMin = row.pausesSec > 0 ? Math.round(row.pausesSec / 60) : ''
      return [row.hourLabel, row.pieces, row.ok, row.p0, p0Pct, avgG, calibre, pauseMin].join(SEP)
    })

    const csv = [header, ...rows].join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `resumen-${shiftDoc?.id ?? 'turno'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [timelineBuckets, productionWindow, pauses, shiftDoc?.id])

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

    // Eje X dinámico: helper puro extraído en M11 (resolveAxisWindow).
    const { lineTimes, axisIndexByLabel } = resolveAxisWindow(buckets, shiftWindow)

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

    // Mark lines y mark areas: helpers puros extraídos en M11.
    const { shiftMarkLines, thresholdLines, uploadLines, actionLines, configChangeLines, lotChangeLines } =
      buildMarkLines(shiftDoc, shiftWindow, configSnapshots, buckets, alertThreshold, criticalThreshold, productionWindow)
    const deadTimeAreas = buildMarkAreas(pauses ?? [], productionWindow)

    // Marcadores Baader — usados SOLO para enriquecer el tooltip del chart
    // con la sección "⚠ Upstream parado". El sub-grid visual fue retirado
    // tras feedback del usuario (no aportaba en el formato compacto). La
    // visualización detallada vive en UpstreamMachinesPanel sincronizado
    // por zoom.
    const baaderMarkers = buildBaaderTimelineMarkers(upstreamSnapshot ?? null, lineTimes, productionWindow)
    const bandsByMinuteLabel = new Map<string, Array<{ machine: string; reason: string; durationMin: number; color: string }>>()
    for (const band of baaderMarkers.bands) {
      const iA = axisIndexByLabel.get(band.tA)
      const iB = axisIndexByLabel.get(band.tB)
      if (iA === undefined || iB === undefined) continue
      const [from, to] = iA <= iB ? [iA, iB] : [iB, iA]
      for (let i = from; i <= to; i++) {
        const label = lineTimes[i]
        if (!label) continue
        if (!bandsByMinuteLabel.has(label)) bandsByMinuteLabel.set(label, [])
        bandsByMinuteLabel.get(label)!.push({
          machine: band.machineName,
          reason: band.reason,
          durationMin: band.durationMin,
          color: band.stroke,
        })
      }
    }

    // Baader stop bands → markArea translúcidas detrás del chart Grader.
    // Una entrada por evento de pausa de cada máquina. El overlap natural entre
    // múltiples máquinas crea un efecto de densidad visual:
    //   1 Baader parada  → ~9% opacidad (violet-500)
    //   2 Baaders paradas → ~18% (overlap natural de dos capas)
    //   3 Baaders paradas → ~27% — zona claramente visible
    // Solo incluimos bandas cuyos extremos existen en el axis actual.
    const baaderBandMarkAreas = baaderMarkers.bands
      .filter(b => b.tA !== b.tB && axisIndexByLabel.has(b.tA) && axisIndexByLabel.has(b.tB))
      .map(b => [
        {
          xAxis: b.tA as string,
          itemStyle: { color: 'rgba(139,92,246,0.09)', borderWidth: 0 },
        },
        { xAxis: b.tB as string },
      ])

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
          const linePt    = arr.find(p => p.seriesType === 'line' && p.seriesName !== '__baader_bands__')
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
          // Upstream: si el minuto cae dentro de bandas Baader, listar las
          // máquinas paradas y la razón. Hace visible la correlación Grader↔
          // Baader desde el tooltip, sin hover separado por banda.
          if (typeof time === 'string' && bandsByMinuteLabel.size > 0) {
            const activeBands = bandsByMinuteLabel.get(time)
            if (activeBands && activeBands.length > 0) {
              lines.push('<span style="color:#94a3b8">⚠ Upstream parado:</span>')
              for (const b of activeBands) {
                lines.push(`&nbsp;&nbsp;<span style="color:${b.color}">▮</span> ${b.machine}: <b>${b.reason}</b> (${b.durationMin}m)`)
              }
            }
          }
          return lines.join('<br/>')
        },
      },
      series: [
        // ── Baader upstream stop bands ────────────────────────────────────────
        // Serie fantasma (z:0, invisible) cuya única misión es hospedar el
        // markArea con las zonas de paros Baader. Se renderiza PRIMERO para
        // quedar detrás de barras y línea P0%. El tooltip la ignora por nombre.
        // Sin esto, las bandas tapan la interactividad de las barras (silent:true).
        ...(baaderBandMarkAreas.length > 0 ? [{
          name: '__baader_bands__',
          type: 'line' as const,
          yAxisIndex: 0,
          data: new Array(lineTimes.length).fill(null) as null[],
          lineStyle: { opacity: 0, width: 0 },
          symbol: 'none',
          silent: true,
          z: 0,
          tooltip: { show: false },
          markArea: {
            silent: true,
            emphasis: { disabled: true },
            data: baaderBandMarkAreas,
          },
        }] : []),
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
  }, [timelineBuckets, shiftDoc, shiftWindow, configSnapshots, causesArr, piecesByCause, scatterAxisShow, gate0Pieces, pauses, productionWindow, bucketByLabel, summaryP0Pct, alertThreshold, criticalThreshold, zoomState, upstreamSnapshot])

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
            onChartReady={onChartReady}
            onEvents={{
              click: handleChartClick,
              mousemove: onChartMouseMove,
              mouseout: onChartMouseOut,
              // Sincroniza el state local + emite rango al parent cuando el
              // usuario arrastra el slider o hace pan/wheel. Lee del state
              // canónico de ECharts (getOption) para evitar payloads parciales.
              datazoom: () => {
                const inst = echartsRef.current?.getEchartsInstance?.()
                if (!inst) return
                const opt = inst.getOption?.()
                const dz = Array.isArray(opt?.dataZoom) ? opt.dataZoom[0] : null
                const s = typeof dz?.start === 'number' ? dz.start : 0
                const e = typeof dz?.end === 'number' ? dz.end : 100
                setZoomState((prev) => (prev.start === s && prev.end === e ? prev : { start: s, end: e }))
                emitZoomRange(s, e)
              },
            }}
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
            isOnline={isOnline}
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
