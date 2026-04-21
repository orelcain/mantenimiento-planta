/**
 * Detector de pausas (gaps de no-procesamiento) en el Grader.
 *
 * Clasifica los gaps entre piezas consecutivas en 4 tiers:
 *   - Micro  (60s  ≤ dur <  300s): agregado en `MicroDetentionsSummary`
 *                                   (NO se emite doc individual)
 *   - Pausa  (300s ≤ dur < 1800s): tier 'pausa'  — anotable manualmente
 *   - Larga  (1800 ≤ dur < 3600s): tier 'larga'  — anotable manualmente
 *   - Parada (≥ 3600s):            tier 'parada' — anotable manualmente
 *
 * Auto-tag `colacion`: se asigna cuando el gap cumple AMBAS condiciones:
 *   - Duración entre 45 y 90 min
 *   - El gap SOLAPA con la ventana esperada según turno:
 *       Turno día   → 12:30–14:30 (hora local planta)
 *       Turno noche → 00:30–03:30 (hora local planta, ampliada por colaciones tardías)
 *
 * Criterio "solape" (vs. "centro en ventana"): el gap empieza antes del fin
 * de la ventana Y termina después del inicio. Fix del bug histórico donde
 * colaciones reales que empezaban ≥02:00 caían fuera del centro y no se
 * detectaban (ej. gap 02:31–03:39 en turno noche).
 *
 * IMPORTANTE: los timestamps ISO del sistema llevan sufijo 'Z' pero el parser
 * del Excel Marelec no aplica zona — son hora LOCAL de planta. Por eso acá se
 * usa `getUTCHours/getUTCMinutes` para leer la hora "tal cual" del string.
 */

import type { Pause, PauseTier, MicroDetentionsSummary } from './types'

const MICRO_MIN_SEC = 60    // umbral mínimo para considerar tiempo muerto
const MICRO_MAX_SEC = 300   // < 5 min → micro
const PAUSA_MAX_SEC = 1800  // < 30 min → pausa
const LARGA_MAX_SEC = 3600  // < 60 min → larga

const COLACION_MIN_MIN = 45
const COLACION_MAX_MIN = 90

// Ventanas de colación por turno (minutos del día, en hora local planta).
// Noche ampliada a 03:30 para capturar colaciones tardías (empiezan ≥02:00),
// validado con muestra de 40+ turnos históricos.
const COLACION_WINDOWS: Record<string, { start: number; end: number }> = {
  'Turno día':   { start: 12 * 60 + 30, end: 14 * 60 + 30 },
  'Turno noche': { start:  0 * 60 + 30, end:  3 * 60 + 30 },
}

export interface PauseDetectionResult {
  pauses: Pause[]
  microDetentions: MicroDetentionsSummary
  /** Suma de TODO el tiempo muerto (micro + pausas) en segundos. */
  totalDeadTimeSec: number
}

function tierFor(durSec: number): PauseTier {
  if (durSec < PAUSA_MAX_SEC) return 'pausa'
  if (durSec < LARGA_MAX_SEC) return 'larga'
  return 'parada'
}

function isColacionCandidate(
  startMs: number,
  endMs: number,
  durSec: number,
  shiftId: string,
): boolean {
  const durMin = durSec / 60
  if (durMin < COLACION_MIN_MIN || durMin > COLACION_MAX_MIN) return false
  const window = COLACION_WINDOWS[shiftId]
  if (!window) return false

  // Criterio "solape": el gap [gapStart, gapEnd] se cruza con la ventana
  // esperada [windowStart, windowEnd]. Ambos expresados en minutos del día.
  // Para turno noche la ventana cruza medianoche implícitamente porque los
  // gaps quedan en el mismo día UTC del timestamp — OK mientras no aparezcan
  // colaciones que empiecen antes de medianoche del día calendario (nunca
  // visto en 40+ turnos muestreados).
  const gapStartMin = new Date(startMs).getUTCHours() * 60 + new Date(startMs).getUTCMinutes()
  const gapEndMin = new Date(endMs).getUTCHours() * 60 + new Date(endMs).getUTCMinutes()
  // Si el gap cruza medianoche (gapEnd < gapStart), lo normalizamos sumando 24h.
  const gapEndAdj = gapEndMin < gapStartMin ? gapEndMin + 24 * 60 : gapEndMin
  return gapStartMin <= window.end && gapEndAdj >= window.start
}

function makePauseId(startMs: number, durSec: number): string {
  const d = new Date(startMs)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `p-${hh}${mm}-${Math.round(durSec / 60)}m`
}

/**
 * Detecta pausas ≥1 min a partir de timestamps ordenados ASC.
 *
 * Se espera que `tsSorted` contenga SOLO registros del turno en cuestión
 * (ya segmentado por `segmentByDayAndShift`). Los registros con mismo
 * timestamp no generan gap (orden estable).
 *
 * @param tsSorted  timestamps ISO ordenados ascendentemente (hora local planta con sufijo Z)
 * @param shiftId   'Turno día' | 'Turno noche' (para auto-tag colación)
 */
export function detectPauses(tsSorted: string[], shiftId: string): PauseDetectionResult {
  const pauses: Pause[] = []
  const microByHour: Record<string, number> = {}
  let microCount = 0
  let microTotalSec = 0
  let totalDeadTimeSec = 0

  for (let i = 1; i < tsSorted.length; i++) {
    const prev = tsSorted[i - 1]!
    const curr = tsSorted[i]!
    const prevMs = Date.parse(prev)
    const currMs = Date.parse(curr)
    if (isNaN(prevMs) || isNaN(currMs)) continue
    const gapSec = (currMs - prevMs) / 1000
    if (gapSec < MICRO_MIN_SEC) continue

    totalDeadTimeSec += gapSec

    if (gapSec < MICRO_MAX_SEC) {
      microCount++
      microTotalSec += gapSec
      const hh = String(new Date(prevMs).getUTCHours()).padStart(2, '0')
      microByHour[hh] = (microByHour[hh] ?? 0) + gapSec
      continue
    }

    const tier = tierFor(gapSec)
    const pause: Pause = {
      id: makePauseId(prevMs, gapSec),
      startAt: prev,
      endAt: curr,
      durationSec: Math.round(gapSec),
      tier,
    }
    if (isColacionCandidate(prevMs, currMs, gapSec, shiftId)) {
      pause.autoTag = 'colacion'
    }
    pauses.push(pause)
  }

  microTotalSec = Math.round(microTotalSec)
  totalDeadTimeSec = Math.round(totalDeadTimeSec)
  for (const h of Object.keys(microByHour)) {
    microByHour[h] = Math.round(microByHour[h]!)
  }

  return {
    pauses,
    microDetentions: {
      count: microCount,
      totalSec: microTotalSec,
      byHour: microByHour,
    },
    totalDeadTimeSec,
  }
}

/**
 * Helper: extrae y ordena timestamps de PIEZA_PIEZA + PUERTA_0.
 * Mantener inline acá para que el llamador no tenga que importar el helper.
 */
export function collectSortedTimestamps(
  pieceTs: Array<{ ts?: string }>,
  gate0Ts: Array<{ ts?: string }> = [],
): string[] {
  const out: string[] = []
  for (const r of pieceTs) if (r.ts) out.push(r.ts)
  for (const r of gate0Ts) if (r.ts) out.push(r.ts)
  out.sort()
  return out
}
