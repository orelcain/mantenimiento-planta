/**
 * Segmentador de registros Grader por día y turno.
 *
 * Toma el dump completo de PIEZA_PIEZA + PUERTA_0 (N días de datos)
 * y lo corta en segmentos {sessionDate × shiftId}, respetando
 * el turno de noche que cruza la medianoche.
 *
 * Uso típico (carga masiva histórica):
 *   1. parseFile(file) × N archivos → juntar pieceRecords + gate0Records
 *   2. segmentByDayAndShift(all, schedule) → Map de segmentos
 *   3. computeShiftSummary(segment, ...) por cada segmento → GraderDailySummary[]
 *   4. saveDailySummaryBatch(summaries) → Firestore
 */

import type { PieceRecord, Gate0Record, GraderShiftSchedule, GraderDailySummary, TimelineBucket, GateAssignment } from './types'
import { DEFAULT_SHIFT_SCHEDULE } from './graderShiftSchedule'
import { classifyRecordToMatrix, CALIBRE_WEIGHT_RANGES } from './graderAnalytics'

// ── Helpers ──────────────────────────────────────────────────────────────────

function r(v: number, dec: number): number {
  const f = 10 ** dec
  return Math.round(v * f) / f
}

// ── Tipos internos ────────────────────────────────────────────────────────────

export interface ShiftSegment {
  sessionDate: string      // YYYY-MM-DD (fecha del turno, no del registro)
  shiftId: string
  pieceRecords: PieceRecord[]
  gate0Records: Gate0Record[]
}

type SegmentKey = string  // `${sessionDate}|${shiftId}`

// ── Normalización del turno desde columna Excel ───────────────────────────────

/**
 * Normaliza el valor bruto de la columna "Turno" del Excel a una etiqueta canónica.
 *
 * La planta opera con sólo DOS turnos (no existe "Turno tarde"):
 *   - 'Turno día'   → A, día, ~09:00 a 17:30
 *   - 'Turno noche' → B, noche, ~21:00 a 06:00 (cruza medianoche)
 *
 * Mapeo:
 *   A / Turno A  → Turno día
 *   B / Turno B  → Turno noche
 *   día          → Turno día
 *   noche        → Turno noche
 *   tarde (legacy del iter 8 que tenía el mapeo B→tarde) → Turno noche
 *
 * Si el valor no matchea ninguna variante conocida → devuelve null para que
 * el caller caiga al fallback por timestamp + schedule. Nunca devolvemos el
 * string crudo, porque eso genera duplicación en Firestore (dos docs con
 * IDs distintos apuntando al mismo turno físico).
 */
export function normalizeShiftLabel(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // A / Turno A → Turno día (letra asumida como código de turno)
  if (/^a$/i.test(s) || /^turno\s+a$/i.test(s)) return 'Turno día'

  // B / Turno B → Turno noche (letra asumida como código de turno)
  // NOTA: en iter 8 este mapeaba a 'Turno tarde' por error.
  if (/^b$/i.test(s) || /^turno\s+b$/i.test(s)) return 'Turno noche'

  // Variantes por nombre con acento / sin acento / case-insensitive
  if (/^(turno\s+)?d[ií]a$/i.test(s))   return 'Turno día'
  if (/^(turno\s+)?noche$/i.test(s))    return 'Turno noche'

  // Legacy: 'tarde' / 'Turno tarde' ahora se remapea a noche (compatibilidad
  // con datos ya cargados antes del cambio de convención).
  if (/^(turno\s+)?tarde$/i.test(s))    return 'Turno noche'

  // No matchea → caller debe usar fallback por timestamp
  return null
}

// ── Asignación de turno ───────────────────────────────────────────────────────

/**
 * Dado un ISO timestamp, devuelve el turno que le corresponde y la fecha del turno.
 *
 * El turno de noche (p.ej. 23:00–07:00) cruza la medianoche:
 *   - Un registro a las 02:00 del 2025-12-15 pertenece al turno noche
 *     que EMPEZÓ el 2025-12-14 → sessionDate = '2025-12-14'.
 */
export function assignShiftAndDate(
  ts: string,
  schedule: GraderShiftSchedule[] = DEFAULT_SHIFT_SCHEDULE,
): { shiftId: string; sessionDate: string } {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }

  // CONVENCIÓN wall-clock-as-UTC: el parser guarda "21:30 de planta" como
  // "…T21:30:00.000Z" (ver graderExcelParser.toWallClockIso). Hay que leerlo
  // con getUTC*: con getHours() el navegador aplica el offset local (Chile
  // UTC-4/-3) y las 21:30 se leían como 17:30 → un turno noche 21:30–05:45
  // se partía en 3 pedazos repartidos en 2 días (ver test de regresión).
  const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes()

  for (const shift of schedule) {
    const start = shift.startHour * 60 + shift.startMinute
    const end   = shift.endHour   * 60 + shift.endMinute
    if (start === end) continue

    if (start < end) {
      // Turno normal (mismo día)
      if (minutesOfDay >= start && minutesOfDay < end) {
        return { shiftId: shift.shiftId, sessionDate: ts.slice(0, 10) }
      }
    } else {
      // Turno que cruza medianoche (ej. noche 23:00–07:00)
      if (minutesOfDay >= start) {
        // Parte vespertina (antes de medianoche) → misma fecha del registro
        return { shiftId: shift.shiftId, sessionDate: ts.slice(0, 10) }
      } else if (minutesOfDay < end) {
        // Parte madrugada (después de medianoche) → fecha del día anterior.
        // setUTCDate (no setDate): mezclar mutación local con toISOString()
        // devolvía el día equivocado y mandaba la madrugada a un día aparte.
        const prev = new Date(d)
        prev.setUTCDate(prev.getUTCDate() - 1)
        return { shiftId: shift.shiftId, sessionDate: prev.toISOString().slice(0, 10) }
      }
    }
  }

  return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }
}

// ── Segmentación ──────────────────────────────────────────────────────────────

/**
 * Agrupa todos los registros en segmentos por {sessionDate, shiftId}.
 *
 * Estrategia de segmentación (timestamp-first, iter 18):
 *  1. SIEMPRE usar el timestamp (columna Fecha/Hora del Excel) como fuente
 *     primaria de shift + sessionDate, aplicando el schedule configurado.
 *  2. La columna "Turno" del Excel se IGNORA para segmentación porque:
 *     - Los equipos A/B pueden rotar entre día/noche
 *     - Operarios a veces etiquetan toda la jornada con una sola letra,
 *       creando segmentos ficticios de 20-24h
 *     - El timestamp es 100% confiable y siempre coincide con la realidad
 *
 *  El label A/B sigue disponible en el campo `shift` de los PieceRecord,
 *  por si se quiere analizar performance por equipo (separado del turno).
 *
 *  Los registros sin timestamp válido se descartan.
 */
export function segmentByDayAndShift(
  pieceRecords: PieceRecord[],
  gate0Records: Gate0Record[],
  schedule: GraderShiftSchedule[] = DEFAULT_SHIFT_SCHEDULE,
): Map<SegmentKey, ShiftSegment> {
  const map = new Map<SegmentKey, ShiftSegment>()

  const getOrCreate = (sessionDate: string, shiftId: string): ShiftSegment => {
    const key: SegmentKey = `${sessionDate}|${shiftId}`
    if (!map.has(key)) {
      map.set(key, { sessionDate, shiftId, pieceRecords: [], gate0Records: [] })
    }
    return map.get(key)!
  }

  for (const rec of pieceRecords) {
    if (!rec.ts) continue
    const { sessionDate, shiftId } = assignShiftAndDate(rec.ts, schedule)
    getOrCreate(sessionDate, shiftId).pieceRecords.push(rec)
  }

  for (const rec of gate0Records) {
    if (!rec.ts) continue
    const { sessionDate, shiftId } = assignShiftAndDate(rec.ts, schedule)
    getOrCreate(sessionDate, shiftId).gate0Records.push(rec)
  }

  return map
}

// ── Cómputo de resumen por turno ──────────────────────────────────────────────

/**
 * Calcula un GraderDailySummary ligero a partir de un segmento.
 * No usa computeAnalytics — es O(n) simple, válido para 230k registros totales.
 */
// ── Agregados por minuto para el timeline chart ──────────────────────────────

/**
 * Pre-computa buckets de 1 minuto con todas las señales que el
 * `GraderTimelineChart` necesita para renderizar sus capas (pesos, P0%,
 * errores, producción, gates, cambios de lote) sin bajar los `pieceRecords`
 * crudos de la subcollection.
 *
 * Se llama una sola vez durante `computeShiftSummary` y el resultado queda
 * embebido en el doc `graderDailySummaries/{id}`. El timeline se pinta al
 * instante leyendo solo el summary — sin query extra a Firestore.
 *
 * Filtro de peso por pieza: 200-8000 g (mismo rango que usa el chart para
 * descartar outliers de calibración).
 */
export function computeTimelineAggregates(
  pieceRecords: PieceRecord[],
  gate0Records: Gate0Record[],
): TimelineBucket[] {
  interface Accum {
    pieces: number
    p0Pieces: number
    weightKgSum: number
    weightCount: number
    weights: number[]
    errorCounts: Map<string, number>
    gateCounts: Map<number, number>
    calibres: Map<string, number>
    lots: Map<string, number>
  }

  const buckets = new Map<string, Accum>()

  const truncateToMinute = (ts: string): string => ts.slice(0, 16) + ':00.000Z'

  const getBucket = (tsMin: string): Accum => {
    let b = buckets.get(tsMin)
    if (!b) {
      b = {
        pieces: 0,
        p0Pieces: 0,
        weightKgSum: 0,
        weightCount: 0,
        weights: [],
        errorCounts: new Map(),
        gateCounts: new Map(),
        calibres: new Map(),
        lots: new Map(),
      }
      buckets.set(tsMin, b)
    }
    return b
  }

  // ── PIEZA_PIEZA ──────────────────────────────────────────────────────────
  for (const rec of pieceRecords) {
    if (!rec.ts) continue
    const tsMin = truncateToMinute(rec.ts)
    const b = getBucket(tsMin)
    b.pieces += rec.pieces
    if (rec.gate === 0) {
      b.p0Pieces += rec.pieces
      if (rec.error) {
        b.errorCounts.set(rec.error, (b.errorCounts.get(rec.error) ?? 0) + rec.pieces)
      }
    } else {
      // Gate productivo: acumular peso + gate count
      if (rec.weightKg != null && rec.weightKg > 0) {
        b.weightKgSum += rec.weightKg
      }
      // Peso por pieza en gramos (para min/p50/max del scatter)
      let wGrams = rec.weightPerPieceGrams
      if ((wGrams == null || wGrams <= 0) && rec.weightKg != null && rec.weightKg > 0) {
        wGrams = rec.pieces === 1 ? rec.weightKg * 1000 : (rec.weightKg * 1000) / rec.pieces
      }
      if (wGrams != null && wGrams > 200 && wGrams < 8000) {
        b.weights.push(wGrams)
        b.weightCount += rec.pieces
      }
      b.gateCounts.set(rec.gate, (b.gateCounts.get(rec.gate) ?? 0) + rec.pieces)
    }
    if (rec.calibre) {
      b.calibres.set(rec.calibre, (b.calibres.get(rec.calibre) ?? 0) + rec.pieces)
    }
    if (rec.lot) {
      b.lots.set(rec.lot, (b.lots.get(rec.lot) ?? 0) + rec.pieces)
    }
  }

  // ── PUERTA_0 dedicado (override p0Pieces + errorCounts del minuto) ───────
  // Mismo patrón que hourlyBuckets: si hay gate0Records, son más confiables
  // que los gate=0 de los PIEZA_PIEZA files.
  if (gate0Records.length > 0) {
    // Reset p0Pieces y errorCounts en minutos tocados por gate0Records
    const touched = new Set<string>()
    for (const rec of gate0Records) {
      if (!rec.ts) continue
      touched.add(truncateToMinute(rec.ts))
    }
    for (const tsMin of touched) {
      const b = buckets.get(tsMin)
      if (b) {
        b.p0Pieces = 0
        b.errorCounts.clear()
      }
    }
    // Ahora acumulamos desde gate0Records
    for (const rec of gate0Records) {
      if (!rec.ts) continue
      const tsMin = truncateToMinute(rec.ts)
      const b = getBucket(tsMin)
      b.p0Pieces += rec.pieces
      if (rec.error) {
        b.errorCounts.set(rec.error, (b.errorCounts.get(rec.error) ?? 0) + rec.pieces)
      }
      if (rec.calibre) {
        b.calibres.set(rec.calibre, (b.calibres.get(rec.calibre) ?? 0) + rec.pieces)
      }
      if (rec.lot) {
        b.lots.set(rec.lot, (b.lots.get(rec.lot) ?? 0) + rec.pieces)
      }
    }
  }

  // ── Convertir a TimelineBucket[] ordenado ───────────────────────────────
  const result: TimelineBucket[] = Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([tsMin, b]) => {
      const bucket: TimelineBucket = {
        tsMin,
        pieces: b.pieces,
        p0Pieces: b.p0Pieces,
      }

      if (b.weightKgSum > 0) bucket.weightKg = r(b.weightKgSum, 3)
      if (b.weightCount > 0) bucket.weightCount = b.weightCount

      if (b.weights.length > 0) {
        const sorted = [...b.weights].sort((x, y) => x - y)
        bucket.weightMinGrams = Math.round(sorted[0]!)
        bucket.weightMaxGrams = Math.round(sorted[sorted.length - 1]!)
        bucket.weightP50Grams = Math.round(sorted[Math.floor(sorted.length / 2)]!)
      }

      if (b.errorCounts.size > 0) {
        const ec: Record<string, number> = {}
        for (const [k, v] of b.errorCounts) ec[k] = v
        bucket.errorCounts = ec
      }

      if (b.gateCounts.size > 0) {
        const gc: Record<string, number> = {}
        for (const [k, v] of b.gateCounts) gc[String(k)] = v
        bucket.gateCounts = gc
      }

      // Dominante de calibre
      let maxCalPieces = 0
      for (const [k, v] of b.calibres) {
        if (v > maxCalPieces) {
          maxCalPieces = v
          bucket.dominantCalibre = k
        }
      }

      // Dominante de lote
      let maxLotPieces = 0
      for (const [k, v] of b.lots) {
        if (v > maxLotPieces) {
          maxLotPieces = v
          bucket.lot = k
        }
      }

      return bucket
    })

  return result
}

export function computeShiftSummary(
  segment: ShiftSegment,
  batchUploadId: string,
  sourceFileNames: string[],
  createdBy: string,
  gates?: GateAssignment[],
): GraderDailySummary {
  const { sessionDate, shiftId, pieceRecords, gate0Records } = segment

  // ── Timestamps ──────────────────────────────────────────────────────────────
  const allTs = pieceRecords.map((x) => x.ts).concat(gate0Records.map((x) => x.ts))
    .filter(Boolean)
    .sort()
  const startAt = allTs[0] ?? `${sessionDate}T00:00:00`
  const endAt   = allTs[allTs.length - 1] ?? startAt
  // Duración ACTIVA: cuenta minutos únicos con al menos un registro.
  // Esto excluye automáticamente gaps de colación, paradas y mantenimiento,
  // reflejando el tiempo REAL que la grader estuvo operando.
  const activeMinutesSet = new Set<string>()
  for (const ts of allTs) {
    activeMinutesSet.add(ts.slice(0, 16)) // YYYY-MM-DDTHH:MM
  }
  const durationMinutes = activeMinutesSet.size

  // ── Piezas ─────────────────────────────────────────────────────────────────
  const totalPieces = pieceRecords.reduce((s, rec) => s + rec.pieces, 0)
  const prodRecords = pieceRecords.filter((rec) => rec.gate > 0)
  const prodPieces  = prodRecords.reduce((s, rec) => s + rec.pieces, 0)

  // P0: preferir gate0Records (de PUERTA_0) si hay, sino contar gate=0 en PIEZA_PIEZA
  const pointZeroPieces = gate0Records.length > 0
    ? gate0Records.reduce((s, rec) => s + rec.pieces, 0)
    : pieceRecords.filter((rec) => rec.gate === 0).reduce((s, rec) => s + rec.pieces, 0)
  const pointZeroPct = totalPieces > 0 ? r(pointZeroPieces / totalPieces * 100, 2) : 0

  // ── Peso ───────────────────────────────────────────────────────────────────
  const rawWeightKg = prodRecords.reduce((s, rec) => s + (rec.weightKg ?? 0), 0)
  const totalWeightKg = rawWeightKg > 0 ? r(rawWeightKg, 2) : undefined
  const avgWeightGrams = (totalWeightKg && prodPieces > 0)
    ? r(totalWeightKg * 1000 / prodPieces, 0)
    : undefined

  // ── Tasa de producción ─────────────────────────────────────────────────────
  const productionRatePerHour = (durationMinutes > 0 && prodPieces > 0)
    ? r(prodPieces / (durationMinutes / 60), 0)
    : undefined

  // ── Causas P0 ──────────────────────────────────────────────────────────────
  const p0Source: Gate0Record[] = gate0Records.length > 0
    ? gate0Records
    : (pieceRecords.filter((rec) => rec.gate === 0) as unknown as Gate0Record[])

  const causeMap = new Map<string, number>()
  const activeGates = (gates ?? []).filter(g => g.active)
  for (const rec of p0Source) {
    let causeKey: string
    if (activeGates.length > 0) {
      // Clasificar con la lógica de 9 causas Matrix usando la config de gates activa
      causeKey = classifyRecordToMatrix(
        { ...rec, error: rec.error ?? '', gate: 0 as const },
        activeGates,
        CALIBRE_WEIGHT_RANGES,
      )
    } else {
      causeKey = rec.error || 'Sin causa'
    }
    causeMap.set(causeKey, (causeMap.get(causeKey) ?? 0) + rec.pieces)
  }
  const topP0Causes = Array.from(causeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 9) // hasta 9 causas Matrix
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: r(pieces / (pointZeroPieces || 1) * 100, 1),
    }))

  // ── Distribución por calibre ───────────────────────────────────────────────
  const calibreMap = new Map<string, number>()
  for (const rec of prodRecords) {
    if (rec.calibre) calibreMap.set(rec.calibre, (calibreMap.get(rec.calibre) ?? 0) + rec.pieces)
  }
  const calibreDistribution = Array.from(calibreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([calibre, pieces]) => ({
      calibre,
      pieces,
      pct: r(pieces / (prodPieces || 1) * 100, 1),
    }))

  // ── Distribución por calidad ───────────────────────────────────────────────
  const qualityMap = new Map<string, number>()
  for (const rec of prodRecords) {
    if (rec.quality) qualityMap.set(rec.quality, (qualityMap.get(rec.quality) ?? 0) + rec.pieces)
  }
  const qualityDistribution = Array.from(qualityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([quality, pieces]) => ({
      quality,
      pieces,
      pct: r(pieces / (prodPieces || 1) * 100, 1),
    }))

  // ── Distribución por gate ──────────────────────────────────────────────────
  const gateMap = new Map<number, number>()
  for (const rec of prodRecords) {
    gateMap.set(rec.gate, (gateMap.get(rec.gate) ?? 0) + rec.pieces)
  }
  const gateDistribution = Array.from(gateMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([gate, pieces]) => ({
      gate,
      pieces,
      pct: r(pieces / (prodPieces || 1) * 100, 1),
    }))

  // ── Buckets por hora del día (para drill-down en gráfico de tendencia) ─────
  // Usa getUTCHours porque el parser no aplica timezone — los ts están en
  // hora local del grader, marcados como Z pero sin conversión.
  const hourMap = new Map<number, { total: number; p0: number }>()
  for (const rec of pieceRecords) {
    if (!rec.ts) continue
    const d = new Date(rec.ts)
    if (isNaN(d.getTime())) continue
    const h = d.getUTCHours()
    const b = hourMap.get(h) ?? { total: 0, p0: 0 }
    b.total += rec.pieces
    if (rec.gate === 0) b.p0 += rec.pieces
    hourMap.set(h, b)
  }
  // Si hay PUERTA_0 dedicado, usar sus counts como P0 (más confiables)
  if (gate0Records.length > 0) {
    for (const h of hourMap.keys()) {
      const b = hourMap.get(h)!
      b.p0 = 0 // reset, vamos a recalcular
    }
    for (const rec of gate0Records) {
      if (!rec.ts) continue
      const d = new Date(rec.ts)
      if (isNaN(d.getTime())) continue
      const h = d.getUTCHours()
      const b = hourMap.get(h) ?? { total: 0, p0: 0 }
      b.p0 += rec.pieces
      hourMap.set(h, b)
    }
  }
  const hourlyBuckets = Array.from(hourMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, v]) => ({
      hour,
      totalPieces: v.total,
      p0Pieces: v.p0,
    }))

  // NOTA: Los timelineAggregates NO se computan acá. El wizard los computa
  // por separado llamando `computeTimelineAggregates(pieceRecords, gate0Records)`
  // y los guarda en la sub-collection `graderDailySummaries/{id}/meta/timeline`
  // via `saveTimelineAggregates()`. Esto mantiene el doc del summary pequeño
  // (~5 KB) para que las queries por rango sigan siendo baratas.

  return {
    id: `${sessionDate}__${shiftId}`,
    dateKey: sessionDate,
    shiftId,
    totalPieces,
    pointZeroPieces,
    pointZeroPct,
    startAt,
    endAt,
    durationMinutes,
    totalWeightKg,
    avgWeightGrams,
    productionRatePerHour,
    topP0Causes,
    calibreDistribution,
    qualityDistribution,
    gateDistribution,
    hourlyBuckets,
    sourceFileNames,
    batchUploadId,
    hasPieceData: pieceRecords.length > 0,
    hasGate0Data: gate0Records.length > 0,
    updatedBy: createdBy,
    updatedAt: new Date().toISOString(),
  }
}

// ── Helpers de presentación ───────────────────────────────────────────────────

/** Ordena los segmentos por fecha + turno (día → noche) */
export function sortedSegmentEntries(
  map: Map<string, ShiftSegment>,
): Array<[string, ShiftSegment]> {
  const shiftOrder: Record<string, number> = {
    'Turno día': 0,
    'Turno noche': 1,
    'Sin turno': 2,
  }
  return Array.from(map.entries()).sort(([, a], [, b]) => {
    if (a.sessionDate !== b.sessionDate) return a.sessionDate < b.sessionDate ? -1 : 1
    return (shiftOrder[a.shiftId] ?? 9) - (shiftOrder[b.shiftId] ?? 9)
  })
}

// ── Dedupe de registros ───────────────────────────────────────────────────────

/**
 * Quita registros duplicados entre archivos con rangos de fecha solapados.
 *
 * Contexto: Matrix a veces exporta archivos PP con rangos que se tocan
 * (ej. un archivo cubre 20251231→20260115 y otro 20260115→20260125).
 * El 15 de enero aparece en ambos con exactamente los mismos eventos.
 * Si juntamos ambos sin dedupear → las piezas se duplican y el P0% queda mal.
 *
 * La llave de dedupe usa todos los campos que identifican únicamente un evento
 * de clasificación: `ts + gate + pieces + quality + calibre + weightKg + lot
 * + error + weightPerPieceGrams`. Dos filas con exactamente todos esos campos
 * son el mismo evento físico (re-export de archivos overlapping).
 *
 * Nota: la key fue ampliada para evitar perder piezas reales que colisionan
 * por timestamp-segundo cuando 5-10 piezas/seg pasan en pico (~0.5-0.8% loss).
 * Mantener en sync con graderDailySummary.service.ts:buildDedupeKey y
 * scripts/bulk-upload-piece-records.js:buildDedupeKey.
 */
export function dedupePieceRecords(records: PieceRecord[]): {
  unique: PieceRecord[]
  duplicatesRemoved: number
} {
  const seen = new Set<string>()
  const unique: PieceRecord[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!
    const key = `${r.ts}|${r.gate}|${r.pieces}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}|${r.lot ?? ''}|${r.error ?? ''}|${r.weightPerPieceGrams ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  return { unique, duplicatesRemoved: records.length - unique.length }
}

/**
 * Quita registros duplicados de Gate 0 (archivos de P0 con rangos solapados).
 * Llave: `ts + pieces + error + quality + calibre`.
 */
export function dedupeGate0Records(records: Gate0Record[]): {
  unique: Gate0Record[]
  duplicatesRemoved: number
} {
  const seen = new Set<string>()
  const unique: Gate0Record[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!
    const key = `${r.ts}|${r.pieces}|${r.error ?? ''}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  return { unique, duplicatesRemoved: records.length - unique.length }
}
