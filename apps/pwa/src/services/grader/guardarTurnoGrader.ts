/**
 * Guardado de un Excel del Grader por turno (día × turno) en Firestore.
 *
 * Es la ÚNICA vía de escritura del Excel. La usan la carga manual (el wizard
 * `AnalisisGraderWizardPage`) y la carga automática de la carpeta de Matrix
 * (`carpetaMatrixVigilante`). Lo que vivía dentro del componente se movió aquí
 * sin cambiar la lógica: recibe todo por parámetro.
 */
import {
  segmentByDayAndShift,
  computeShiftSummary,
  computeTimelineAggregates,
  sortedSegmentEntries,
  dedupePieceRecords,
  dedupeGate0Records,
} from '@/services/grader/graderSegmenter'
import {
  saveDailySummaryBatch,
  savePieceRecordsBatch,
  buildDedupeKey,
  buildDailySummaryId,
  saveTimelineAggregates,
  savePausesAggregates,
  loadPausesAggregates,
  mergeAnnotationsIntoPauses,
  updateDailySummary,
  saveGateObservations,
  listDailySummariesByRange,
  type FirestorePieceRecord,
} from '@/services/grader/graderDailySummary.service'
import { computeGateObservations } from '@/services/grader/graderGateObservations'
import { saveGate0Records } from '@/services/grader/graderGate0Store'
import { listSnapshots, saveConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { configTimelineFromSnapshots, type ConfigTimeline } from '@/services/grader/graderGateObservations'
import { pickUltimoSeteo, elegirSeteoInicial } from '@/services/grader/graderSeteoInicial'
import { detectPauses, collectSortedTimestamps, type PauseDetectionResult } from '@/services/grader/graderPauseDetector'
import type { ParsedMatrixData, GateAssignment, Gate0Record } from '@/services/grader/types'
import { DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { logger } from '@/lib/logger'

/** Segmentos día × turno que salen de un Excel (lo que deriva `derivarSegmentosTurno`). */
export type SegmentosTurno = NonNullable<ReturnType<typeof derivarSegmentosTurno>>

/** Campos del usuario que usa el guardado (uid y nombre para el snapshot de gates). */
export interface UsuarioGuarda {
  id: string
  nombre?: string | null
  apellido?: string | null
  email?: string | null
}

/** Resultado del guardado: qué partes fallaron (solo se llena en modo automático). */
export interface ResultadoGuardado {
  fallos: string[]
}

export interface EntradaGuardarTurno {
  /** manual (default): lanza como antes. automatico: captura los pasos de detalle y los reporta en `fallos`. */
  modo?: 'manual' | 'automatico'
  multiDayInfo: SegmentosTurno
  parsedData: ParsedMatrixData | null
  user: UsuarioGuarda
  gates: GateAssignment[]
  gatesEditadas: boolean
  lineId: PlantLineId
  isClassificationPlant: boolean | undefined
}

/** Turnos (día × turno) que cubre el Excel, o null si no trae registros. Antes vivía en el wizard. */
export function derivarSegmentosTurno(
  parsedData: ParsedMatrixData | null,
  shiftSchedule: Parameters<typeof segmentByDayAndShift>[2],
  slxWindows: Parameters<typeof segmentByDayAndShift>[3],
) {
  if (!parsedData) return null
  const totalRecords = parsedData.pieceRecords.length + parsedData.gate0Records.length
  if (totalRecords === 0) return null
  // Dedupe por si el archivo viene con registros repetidos internamente
  const pieceUnique = dedupePieceRecords(parsedData.pieceRecords).unique
  const gate0Unique = dedupeGate0Records(parsedData.gate0Records).unique
  // Antes esto se llamaba SIN horario: siempre cortaba con día 07-19 /
  // noche 19-07, ignorando la config de la planta y a Shoplogix, así que un
  // turno real (T1 21:30-05:45) nunca calzaba con su tarjeta.
  const segmentMap = segmentByDayAndShift(
    pieceUnique, gate0Unique, shiftSchedule, slxWindows,
    parsedData.notApplicableRecords ?? [],
  )
  const entries = sortedSegmentEntries(segmentMap)
  if (entries.length === 0) return null
  const uniqueDays = new Set(entries.map(([, s]) => s.sessionDate)).size
  const isP0Only = parsedData.pieceRecords.length === 0
  /*
   * `isP0Only` mira el archivo ENTERO, asi que con un pieza a pieza cargado
   * siempre es false — y no cubre el caso real: los dos Excel de un mismo mes
   * no cubren el mismo rango. Medido en julio 2025 (PP 07-01 -> 07-14,
   * P0 07-01 -> 07-30): de los 54 turnos detectados, **37 no tienen ni una
   * pieza**. La barra ofrecia guardar los 54 sin distinguirlos.
   */
  const soloP0 = entries.filter(([, s]) => s.pieceRecords.length === 0).length
  return {
    entries, uniqueDays, totalSegments: entries.length, isP0Only,
    segmentosSoloP0: soloP0,
    segmentosConPiezas: entries.length - soloP0,
  }
}

/** Guarda los turnos en Firestore. Lanza si algo falla; el llamador muestra el error. */
export async function guardarSegmentosTurno(entrada: EntradaGuardarTurno): Promise<ResultadoGuardado> {
  const { multiDayInfo, parsedData, user, gates, gatesEditadas, lineId, isClassificationPlant } = entrada
  const fallos: string[] = []
  // Paso de detalle: en manual lanza igual que antes; en automático registra el fallo y sigue.
  const paso = async (nombre: string, fn: () => Promise<unknown>): Promise<void> => {
    if (entrada.modo !== 'automatico') {
      await fn()
      return
    }
    try {
      await fn()
    } catch (err) {
      fallos.push(`${nombre}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  const batchId = crypto.randomUUID()
  const sourceNames = parsedData?.files.map((f) => f.name) ?? []

  // Cargar PauseDetectorConfig guardada por el admin (M16) para re-detección consistente.
  const moduleCfg = await getModuleRanges(lineId).catch(() => null)
  const pauseDetectorCfg = moduleCfg?.pauseDetectorConfig

  // Calcular summaries + detectar pausas en el mismo pase.
  // Los agregados de pausas (totales) se embeben en el summary para
  // KPIs rápidos; el detalle se guarda en meta/pauses dentro del loop.
  // Para líneas no-default (ej: Yal), los docs se guardan con prefix de plantLineId
  const effectivePlantLineId = lineId !== DEFAULT_PLANT_LINE_ID ? lineId : undefined

  // Config de gates POR TURNO, no la del wizard. Si el turno ya tiene
  // snapshots (alguien cambió una gate desde el detalle antes de cargar el
  // Excel), esa es la config que clasifica las causas P0 y la pureza por
  // puerta; el borrador del wizard puede ser de otro turno o de otro día.
  // Si no tiene, el borrador del wizard pasa a ser su snapshot inicial: así
  // el detalle muestra la config vigente y no detecta "desfase" contra nada.
  // Solo en plantas que clasifican: en Yal las gates no significan nada.
  // Seteo inicial de un turno SIN snapshot: el último conocido de la línea
  // (gatesUsed del turno más reciente, que la página mantiene al día con
  // snapshots y adopciones) y no el borrador del wizard. En la carga
  // parcial del 07-09 Turno 1 el borrador dejó 8 de 12 puertas
  // "seteo ≠ máquina" y 74 piezas de P0 "fuera de calidad" artificiales.
  let ultimoConocido: GateAssignment[] | null = null
  if (isClassificationPlant !== false && !gatesEditadas) {
    try {
      const hoy = new Date()
      const desde = new Date(hoy.getTime() - 21 * 86_400_000)
      const recientes = await listDailySummariesByRange(desde.toISOString().slice(0, 10), hoy.toISOString().slice(0, 10), effectivePlantLineId)
      ultimoConocido = pickUltimoSeteo(recientes)
    } catch (err) {
      logger.warn('No se pudo leer el último seteo conocido', { err: String(err) })
    }
  }
  const seteoInicial = elegirSeteoInicial({ wizardGates: gates, gatesEditadas: gatesEditadas, ultimoConocido })

  const gatesBySegment = new Map<string, GateAssignment[]>()
  // Con más de un snapshot, las piezas de P0 se clasifican con la config
  // vigente a SU hora, no solo con la última.
  const timelineBySegment = new Map<string, ConfigTimeline>()
  if (isClassificationPlant !== false) {
    const userName = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || (user.email ?? '')
    await Promise.all(multiDayInfo.entries.map(async ([key, segment]) => {
      const shiftDocId = `${segment.sessionDate}__${segment.shiftId}`
      try {
        const snaps = await listSnapshots(shiftDocId)
        const latest = snaps[snaps.length - 1]
        if (latest && latest.gates.length > 0) {
          gatesBySegment.set(key, latest.gates)
          timelineBySegment.set(key, configTimelineFromSnapshots(snaps, latest.gates))
          return
        }
        gatesBySegment.set(key, seteoInicial.gates)
        await saveConfigSnapshot(
          shiftDocId, seteoInicial.gates, { uid: user.id, name: userName },
          seteoInicial.origen === 'ultimo-conocido' ? 'Config inicial al cargar el Excel (último seteo conocido de la línea)' : 'Config inicial al cargar el Excel',
        )
      } catch (err) {
        // No es fatal: se clasifica con las gates del wizard, como antes.
        logger.warn('No se pudo resolver la config de gates del turno', { shiftDocId, err: String(err) })
        fallos.push(`configuración de gates ${shiftDocId}: ${String(err)}`)
      }
    }))
  }

  const detectionByKey = new Map<string, PauseDetectionResult>()
  const summaries = multiDayInfo.entries.map(([key, segment]) => {
    // Las causas P0 "fuera de calibre" se juzgan con los rangos configurados
    // en la app (no con las constantes): si el 8-10 termina en 5.000 g, una
    // pieza de 4,8 kg no es "fuera de calibre".
    const rangosLinea = moduleCfg?.customWeightRanges?.length ? moduleCfg.customWeightRanges : undefined
    const raw = computeShiftSummary(segment, batchId, sourceNames, user.id, gatesBySegment.get(key) ?? gates, timelineBySegment.get(key)?.configAt, rangosLinea)
    const tsSorted = collectSortedTimestamps(segment.pieceRecords, segment.gate0Records)
    // Extraer timestamps de cambios de lote para auto-tag 'cambio_lote' (M10)
    const loteChangeTsMs: number[] = []
    let prevLot: string | undefined
    for (const r of segment.pieceRecords) {
      if (r.lot && r.lot !== prevLot && prevLot !== undefined) {
        loteChangeTsMs.push(Date.parse(r.ts))
      }
      if (r.lot) prevLot = r.lot
    }
    const det = detectPauses(tsSorted, raw.shiftId, loteChangeTsMs, pauseDetectorCfg)
    detectionByKey.set(key, det)
    // Sobrescribir id para líneas no-Chonchi (buildDailySummaryId agrega prefix)
    const overrideId = buildDailySummaryId(raw.dateKey, raw.shiftId, effectivePlantLineId)
    return {
      ...raw,
      id: overrideId,
      ...(effectivePlantLineId ? { plantLineId: effectivePlantLineId } : {}),
      totalDeadTimeSec: det.totalDeadTimeSec,
      microDetentionsCount: det.microDetentions.count,
      microDetentionsTotalSec: det.microDetentions.totalSec,
      pausesCount: det.pauses.length,
    }
  })
  await saveDailySummaryBatch(summaries)

  // Guardar pieceRecords en subcollection (dedup automática) + timeline
  // aggregates en sub-collection `meta/timeline` para que el timeline chart
  // se pinte al instante al abrir el turno sin bajar los records crudos.
  // Además guarda el detalle de pausas en `meta/pauses` preservando
  // anotaciones manuales previas (merge por id estable).
  for (const [key, segment] of multiDayInfo.entries) {
    const [dateKey, shiftId] = key.split('|')
    if (!dateKey || !shiftId) continue
    const summaryId = buildDailySummaryId(dateKey, shiftId, effectivePlantLineId)
    // pieceRecords YA incluye gate=0 (ver mergeParsedData). No concatenar
    // gate0Records — eso causaba duplicación: cada pieza gate=0 quedaba
    // guardada 2 veces en Firestore (manifestado en Yal: 7 piezas reales,
    // 14 docs en pieceRecords subcollection).
    const allRecs = segment.pieceRecords
    if (allRecs.length === 0) continue
    const firestoreRecs: FirestorePieceRecord[] = allRecs.map((r) => ({
      ts: r.ts,
      gate: r.gate,
      pieces: r.pieces,
      ...(r.weightKg != null && { weightKg: r.weightKg }),
      ...(r.weightPerPieceGrams != null && { weightPerPieceGrams: r.weightPerPieceGrams }),
      ...(r.quality && { quality: r.quality }),
      ...(r.calibre && { calibre: r.calibre }),
      ...('error' in r && r.error && { error: r.error }),
      ...(r.lot && { lot: r.lot }),
      ...(r.conservation && { conservation: r.conservation }),
      ...(r.product && { product: r.product }),
      dedupeKey: buildDedupeKey(r),
    }))
    await paso(`detalle de piezas ${summaryId}`, () => savePieceRecordsBatch(summaryId, firestoreRecs))

    // Guardar el input de Puerta 0 EXACTO que usó computeShiftSummary para
    // clasificar (el Excel P0 si vino, si no los gate=0 del pieza-a-pieza).
    // Sin esto no se puede recalcular el desglose al cambiar las gates: la
    // columna Error solo existe en el Excel P0 y los pieceRecords no la
    // traen. Ver graderGate0Store.ts.
    const p0Input: Gate0Record[] = segment.gate0Records.length > 0
      ? segment.gate0Records
      : segment.pieceRecords
        .filter((r) => r.gate === 0)
        .map((r) => ({ ...r, gate: 0 as const, error: ('error' in r && r.error) || '' }))
    try {
      await saveGate0Records(summaryId, p0Input)
      await updateDailySummary(summaryId, { gate0RecordsStored: true })
    } catch (err) {
      // No es fatal: el turno queda guardado igual, solo sin recálculo
      // automático (el aviso de config desfasada lo dirá).
      logger.warn('No se pudieron guardar los registros de Puerta 0', { err: String(err) })
      fallos.push(`Puerta 0 ${summaryId}: ${String(err)}`)
    }

    // Pre-computar aggregates por minuto y guardar en sub-collection.
    // Idempotente: se sobrescribe en cada re-upload del mismo turno.
    const aggregates = computeTimelineAggregates(segment.pieceRecords, segment.gate0Records)
    if (aggregates.length > 0) {
      await paso(`timeline ${summaryId}`, () => saveTimelineAggregates(summaryId, aggregates))
    }

    // gateMix v2: lo observado por puerta y bloque, sin juicio, en
    // meta/gateMix. La pureza se deriva al abrir Gates con los snapshots
    // del turno (graderGateObservations.ts). Solo plantas que clasifican.
    if (isClassificationPlant !== false) {
      const obs = computeGateObservations(segment.pieceRecords)
      if (obs) await paso(`observaciones de gates ${summaryId}`, () => saveGateObservations(summaryId, obs))
    }

    // Detalle de pausas (≥5min) + microDetentions.byHour.
    // Merge preserva tag/note/annotatedBy/annotatedAt de anotaciones
    // manuales previas antes de sobrescribir.
    const det = detectionByKey.get(key)
    if (det && (det.pauses.length > 0 || det.microDetentions.count > 0)) {
      const prev = await loadPausesAggregates(summaryId)
      const mergedPauses = prev
        ? mergeAnnotationsIntoPauses(det.pauses, prev.pauses)
        : det.pauses
      await paso(`pausas ${summaryId}`, () => savePausesAggregates(summaryId, mergedPauses, det.microDetentions))
    }
  }

  return { fallos }
}

/** Quita del resultado los segmentos que no pasan `keep` y recalcula sus contadores. */
export function quedarSegmentos(multi: SegmentosTurno, keep: (key: string) => boolean): SegmentosTurno {
  const entries = multi.entries.filter(([key]) => keep(key))
  const soloP0 = entries.filter(([, s]) => s.pieceRecords.length === 0).length
  return {
    ...multi,
    entries,
    totalSegments: entries.length,
    uniqueDays: new Set(entries.map(([, s]) => s.sessionDate)).size,
    segmentosSoloP0: soloP0,
    segmentosConPiezas: entries.length - soloP0,
  }
}

/** Piezas de un segmento (suma de `pieces` de sus registros de pieza). */
export function piezasDeSegmento(seg: { pieceRecords: Array<{ pieces: number }> }): number {
  return seg.pieceRecords.reduce((s, r) => s + r.pieces, 0)
}

export function getDefaultGates(): GateAssignment[] {
  const calibres: Array<{ calibre: import('@/services/grader/types').CalibreRange; quality: import('@/services/grader/types').GraderQuality }> = [
    { calibre: '2-4 lb', quality: 'Grado' },
    { calibre: '4-6 lb', quality: 'Grado' },
    { calibre: '4-6 lb', quality: 'Premium' },
    { calibre: '6-8 lb', quality: 'Grado' },
    { calibre: '6-8 lb', quality: 'Premium' },
    { calibre: '6-8 lb', quality: 'Industrial' },
    { calibre: '8-10 lb', quality: 'Grado' },
    { calibre: '8-10 lb', quality: 'Premium' },
    { calibre: '8-10 lb', quality: 'Industrial' },
    { calibre: '10-12 lb', quality: 'Grado' },
    { calibre: '10-12 lb', quality: 'Premium' },
    { calibre: '10-12 lb', quality: 'D' },
  ]

  return calibres.map((c, i) => ({
    gateNumber: i + 1,
    assignedCalibre: c.calibre,
    assignedQuality: c.quality,
    active: true,
  }))
}
