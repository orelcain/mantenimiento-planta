/**
 * Correlación de paros Grader ↔ Baaders upstream.
 *
 * Objetivo: cuando el Grader tiene un paro (`Pause`), inferir la causa
 * probable mirando los estados de las Baaders upstream en el mismo
 * rango temporal ±5 min.
 *
 * Hipótesis simple pero efectiva:
 *   Si en ventana [gpause.startAt - 10min, gpause.endAt] las 3 Baaders
 *   estaban en Downtime/Break → probable causa upstream (falta de material).
 *
 * Lógica pura, sin deps externas. Testeable con fixtures.
 */

import type { Pause } from '@/services/grader/types'
import type { UpstreamLineSnapshot, UpstreamMachineState } from './types'
import { isOrganizationalTag } from '@/services/grader/graderPauseTags'

// ============================================================================
// Tipos
// ============================================================================

export type CorrelationKind =
  | 'upstream_global'        // las 3 Baaders paradas antes/durante el paro Grader (causal real)
  | 'upstream_majority'      // 2 de 3 Baaders paradas (causal probable)
  | 'upstream_single'        // 1 Baader parada (podría ser coincidencia)
  | 'coincidental_planned'   // todos los matches Baader son por reasons "planned" (colación,
                              // reunión, etc.) — coincidencia organizacional, NO causal upstream
  | 'no_correlation'         // Baaders corriendo normal — causa interna del Grader

export interface MachineContribution {
  machineid: string
  machineName: string
  stateName: string          // "Micro Detencion" | "Detencion"
  reason: string             // "COLACION" | "Limpieza de Ducto" | ""
  stateStart: Date
  stateEnd: Date
  /** Segundos de overlap con el paro del Grader. */
  overlapSec: number
  /** Delta entre el inicio del state Baader y el inicio del paro Grader (segundos). Negativo = Baader paró antes. */
  leadSec: number
}

export interface PauseCorrelation {
  pauseId: string
  pauseStart: Date
  pauseEnd: Date
  pauseDurSec: number

  kind: CorrelationKind
  /** 0..1 — confianza heurística. */
  confidence: number
  /** Texto humano para mostrar en UI. */
  hypothesis: string
  /** Máquinas upstream que contribuyen a la hipótesis. */
  contributors: MachineContribution[]
}

// ============================================================================
// Helpers
// ============================================================================

/** Calcula segundos de intersección entre dos rangos temporales. */
function overlapSec(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime())
  const end   = Math.min(aEnd.getTime(),   bEnd.getTime())
  return end > start ? Math.floor((end - start) / 1000) : 0
}

/** Estados "de paro" (no uptime). */
function isStopState(state: UpstreamMachineState): boolean {
  return state.type !== 'uptime'
}

// ── Listas de exclusión: paros NO causales upstream ─────────────────────────
//
// Razones "planned" del lado Baader: descansos programados que coinciden por
// turno organizacional con paros del Grader (mismo personal). NO son causa
// upstream real — el Grader hubiera parado igual.
//
// Lista completa derivada de:
//   apps/pwa/src/services/shoplogix/types.ts líneas 49 y 127
//   apps/pwa/src/services/shoplogix/shoplogixDemoData.ts (ejemplos)
//   y observación del CLAUDE.md docs/SHOPLOGIX_API.md
//
const PLANNED_BAADER_REASONS_NORMALIZED = new Set([
  'COLACION',
  'PLANNED DOWNTIME',
  'CAMBIO DE TURNO',
])

/**
 * Determina si un `state.reason` (Baader) corresponde a un paro programado
 * organizacional (colación, reunión, planned downtime).
 *
 * Esos paros NO son causa upstream real — son coincidencia con el horario
 * del personal. Excluirlos previene falsos positivos del tipo "el Grader
 * paró por colación de las 3 Baaders" cuando en realidad el operador del
 * Grader también estaba en colación.
 */
export function isPlannedBaaderReason(reason: string | null | undefined): boolean {
  if (!reason) return false
  const r = reason.trim().toUpperCase()
  if (PLANNED_BAADER_REASONS_NORMALIZED.has(r)) return true
  // Patrones por prefijo: "REUNION INICIO TURNO", "REUNION FIN TURNO", etc.
  if (r.startsWith('REUNION')) return true
  // LIMPIEZA programada (distinguir de "Limpieza de Ducto" que es operacional puntual).
  // Solo "LIMPIEZA" exacto (sin sufijo) cuenta como programado de fin de turno.
  if (r === 'LIMPIEZA') return true
  return false
}

/**
 * Determina si la pausa del Grader es organizacional (no operacional).
 *
 * Reusa la fuente única `isOrganizationalTag` de `graderPauseTags.ts` —
 * mantener la lista en un solo lugar evita inconsistencias entre módulos
 * (ver principios UI/UX en CLAUDE.md).
 */
export function isOrganizationalGraderPause(pause: Pause): boolean {
  return isOrganizationalTag(pause.tag ?? pause.autoTag ?? null)
}

// ============================================================================
// Correlación principal
// ============================================================================

export function correlatePausesWithUpstream(
  pauses: Pause[],
  snapshot: UpstreamLineSnapshot | null | undefined,
  options: {
    /** Ventana de búsqueda antes del inicio del paro Grader (seg). Default 600 (10 min). */
    leadWindowSec?: number
    /** Overlap mínimo para considerar que una Baader "contribuye" (seg). Default 60 (1 min). */
    minOverlapSec?: number
  } = {},
): PauseCorrelation[] {
  const leadWindowSec = options.leadWindowSec ?? 600
  const minOverlapSec = options.minOverlapSec ?? 60

  if (!snapshot || snapshot.machines.length === 0) return []

  const totalMachines = snapshot.machines.length

  return pauses.map(pause => {
    const pauseStart = new Date(pause.startAt)
    const pauseEnd   = new Date(pause.endAt)
    const lookbackStart = new Date(pauseStart.getTime() - leadWindowSec * 1000)

    // Pre-filtro: paros organizacionales del Grader (colación, ejercicios,
    // cambio_lote, limpieza) NO se evalúan como upstream — el operador del
    // Grader también está en break, así que coincidir con paros Baader es
    // organizacional, no causal.
    if (isOrganizationalGraderPause(pause)) {
      const tag = pause.tag ?? pause.autoTag ?? 'organizacional'
      return {
        pauseId: pause.id,
        pauseStart, pauseEnd,
        pauseDurSec: pause.durationSec,
        kind: 'no_correlation' as CorrelationKind,
        confidence: 0,
        hypothesis: `Paro organizacional del Grader (${tag}) — no aplica análisis upstream.`,
        contributors: [],
      }
    }

    const contributors: MachineContribution[] = []

    for (const machine of snapshot.machines) {
      for (const state of machine.states) {
        if (!isStopState(state)) continue
        // Filtro causal: el Baader state debe haber EMPEZADO antes o poco
        // después del inicio del paro Grader. Si empezó >2 min después,
        // no puede ser causa (la causa precede al efecto).
        const leadSec = Math.floor((state.startAt.getTime() - pauseStart.getTime()) / 1000)
        if (leadSec > 120) continue

        const overlap = overlapSec(state.startAt, state.endAt, lookbackStart, pauseEnd)
        if (overlap < minOverlapSec) continue

        contributors.push({
          machineid: machine.machineid,
          machineName: machine.machineName,
          stateName: state.name,
          reason: state.reason,
          stateStart: state.startAt,
          stateEnd: state.endAt,
          overlapSec: overlap,
          leadSec,
        })
      }
    }

    // Agrupamos contribuciones por máquina — nos quedamos con la más prolongada por máquina
    const byMachine = new Map<string, MachineContribution>()
    for (const c of contributors) {
      const existing = byMachine.get(c.machineid)
      if (!existing || c.overlapSec > existing.overlapSec) {
        byMachine.set(c.machineid, c)
      }
    }
    const allTopContributors = Array.from(byMachine.values())
      .sort((a, b) => b.overlapSec - a.overlapSec)

    // Separar contributors operacionales vs planned (colación, reunión, etc.)
    const operationalContribs = allTopContributors.filter(c => !isPlannedBaaderReason(c.reason))
    const plannedContribs     = allTopContributors.filter(c =>  isPlannedBaaderReason(c.reason))

    let kind: CorrelationKind
    let confidence: number
    let hypothesis: string
    let topContributors: MachineContribution[]

    if (allTopContributors.length === 0) {
      kind = 'no_correlation'
      confidence = 0
      hypothesis = 'Upstream corriendo normal — la causa es interna del Grader.'
      topContributors = []
    } else if (operationalContribs.length === 0) {
      // TODOS los matches son planned (colación, reunión) — coincidencia organizacional
      kind = 'coincidental_planned'
      confidence = 0.1
      const reasons = [...new Set(plannedContribs.map(c => c.reason).filter(Boolean))]
      const reasonsText = reasons.length > 0 ? ` (${reasons.join(', ')})` : ''
      hypothesis = `Coincide con paro programado de Baaders${reasonsText} — probable causa organizacional, no upstream.`
      topContributors = plannedContribs
    } else {
      // Hay al menos un contributor operacional — evaluar SOLO esos
      const machinesInvolved = operationalContribs.length
      const fraction = totalMachines > 0 ? machinesInvolved / totalMachines : 0

      if (fraction >= 1) {
        kind = 'upstream_global'
        confidence = 0.9
        const topReasons = [...new Set(operationalContribs.map(c => c.reason).filter(Boolean))]
        const reasonsText = topReasons.length > 0 ? ` (${topReasons.join(', ')})` : ''
        hypothesis = `Las ${totalMachines} Baaders estaban paradas${reasonsText} — el Grader se quedó sin material.`
      } else if (fraction >= 2 / 3) {
        kind = 'upstream_majority'
        confidence = 0.6
        const names = operationalContribs.map(c => c.machineName).join(', ')
        hypothesis = `${machinesInvolved}/${totalMachines} Baaders paradas (${names}) — flujo upstream reducido.`
      } else {
        kind = 'upstream_single'
        confidence = 0.3
        const c = operationalContribs[0]!
        const reasonText = c.reason ? ` (${c.reason})` : ''
        hypothesis = `Solo ${c.machineName} parada${reasonText} — probable coincidencia, verificar.`
      }
      topContributors = operationalContribs
    }

    return {
      pauseId: pause.id,
      pauseStart, pauseEnd,
      pauseDurSec: pause.durationSec,
      kind, confidence, hypothesis,
      contributors: topContributors,
    }
  })
}

/** Kinds que se consideran upstream "real" (causal operacional, no organizacional). */
const REAL_UPSTREAM_KINDS = new Set<CorrelationKind>([
  'upstream_global', 'upstream_majority', 'upstream_single',
])

/** Helper UI: filtra solo correlaciones con causa upstream REAL (excluye no_correlation y coincidental_planned). */
export function upstreamCausedPauses(correlations: PauseCorrelation[]): PauseCorrelation[] {
  return correlations.filter(c => REAL_UPSTREAM_KINDS.has(c.kind))
}

/** Resumen agregado por máquina: para identificar qué Evisceradora atender. */
export interface MachineImpact {
  machineid: string
  machineName: string
  /** Cantidad de paros del Grader donde esta máquina aparece como contributor. */
  pauseCount: number
  /** Suma de overlapSec de esta máquina con los paros del Grader. */
  totalOverlapSec: number
}

/** Helper UI: resumen para header — cuántos paros tuvieron causa upstream + breakdown. */
export function summarizeCorrelations(correlations: PauseCorrelation[]): {
  total: number
  upstreamCaused: number
  upstreamPct: number
  /** Suma de duración (en segundos) de los paros con causa upstream. */
  upstreamCausedDurSec: number
  /** Breakdown por máquina: cuántos paros + segundos de overlap. Ordenado desc por totalOverlapSec. */
  byMachine: MachineImpact[]
} {
  const total = correlations.length
  const upstream = upstreamCausedPauses(correlations)
  const upstreamCaused = upstream.length
  const upstreamCausedDurSec = upstream.reduce((acc, c) => acc + c.pauseDurSec, 0)

  // Agregación por máquina — solo de paros con correlación upstream
  const byMachineMap = new Map<string, MachineImpact>()
  for (const corr of upstream) {
    for (const contrib of (corr.contributors ?? [])) {
      const existing = byMachineMap.get(contrib.machineid)
      if (existing) {
        existing.pauseCount += 1
        existing.totalOverlapSec += contrib.overlapSec
      } else {
        byMachineMap.set(contrib.machineid, {
          machineid: contrib.machineid,
          machineName: contrib.machineName,
          pauseCount: 1,
          totalOverlapSec: contrib.overlapSec,
        })
      }
    }
  }
  const byMachine = [...byMachineMap.values()].sort((a, b) => b.totalOverlapSec - a.totalOverlapSec)

  return {
    total,
    upstreamCaused,
    upstreamPct: total > 0 ? upstreamCaused / total : 0,
    upstreamCausedDurSec,
    byMachine,
  }
}

/** Convierte confidence numérico (0..1) a label textual operacional. */
export function confidenceLabel(confidence: number): { text: 'alta' | 'media' | 'baja'; color: string } {
  if (confidence >= 0.7) return { text: 'alta',  color: 'text-rose-300' }
  if (confidence >= 0.4) return { text: 'media', color: 'text-amber-300' }
  return { text: 'baja', color: 'text-slate-400' }
}
