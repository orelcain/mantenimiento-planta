/**
 * usePlantKPIs — carga y computa OEE, MTTR y MTBF para una planta.
 *
 * Busca el turno más reciente disponible en Firestore para el plantSlug dado
 * (hoy → ayer → anteayer, hasta encontrar uno con datos).
 * Combina los states de las máquinas Shoplogix con el último Grader summary
 * disponible para calcular el componente de Calidad del OEE.
 *
 * OEE = Disponibilidad × Rendimiento × Calidad
 *   A (Disponibilidad) = shiftRuntime promedio de las 3 Baaders
 *   P (Rendimiento)    = overallRatio promedio (capped a 1.0)
 *   Q (Calidad)        = 1 − P0Pct/100  [solo si graderSummaries aporta el turno]
 *
 * MTTR = media de durationSec de cada evento downtime (en minutos)
 * MTBF = uptimeSec total / n° de eventos downtime (en horas)
 */

import { useEffect, useState } from 'react'
import {
  listShoplogixShiftIdsForDay,
  loadShoplogixShift,
} from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import type { GraderDailySummary } from '@/services/grader/types'

export interface MachineKPI {
  machineid: string
  machineName: string
  /** Disponibilidad: uptime / tiempo productivo (0‒1) */
  availability: number
  /** Rendimiento: ciclos reales / ciclos esperados, capped a 1.0 (0‒1) */
  performance: number
  /** Promedio de duración por evento de paro (minutos) */
  mttrMin: number
  /** Tiempo promedio entre paros (horas) */
  mtbfHours: number
  /** Número de eventos downtime en el turno */
  failureCount: number
  /** Velocidad objetivo de Shoplogix en piezas/min (expectedCycles del primer interval / 5) */
  shoplogixTargetCpm: number | null
}

export interface PlantKPIs {
  /** dateKey del turno base ("YYYY-MM-DD") */
  dateKey: string
  shiftId: string
  /** Disponibilidad media de la línea (0‒1) */
  availability: number
  /** Rendimiento medio de la línea (0‒1, capped) */
  performance: number
  /** Calidad: 1 − P0Pct. null si no hay Grader data para ese turno. */
  quality: number | null
  /** OEE = A × P × Q. null si Q es null. */
  oee: number | null
  /** MTTR promedio de la línea (minutos) */
  mttrMin: number
  /** MTBF promedio de la línea (horas) */
  mtbfHours: number
  /** Total de eventos downtime en toda la línea */
  failureCount: number
  /** Breakdown por máquina */
  machines: MachineKPI[]
}

export interface UsePlantKPIsResult {
  loading: boolean
  error: string | null
  kpis: PlantKPIs | null
}

/** dateKey de hace N días en UTC (sin ajuste TZ — solo para búsqueda de Firestore). */
function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000)
  return d.toISOString().slice(0, 10)
}

function avg(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function computeMachineKPI(m: UpstreamMachineShift): MachineKPI {
  const downtimes = m.states.filter((s) => s.type === 'downtime')
  const uptimeSec = m.shiftRuntimeBreakdown.uptimeSec

  const totalDowntimeSec = downtimes.reduce((a, s) => a + s.durationSec, 0)
  const mttrMin = downtimes.length > 0
    ? totalDowntimeSec / downtimes.length / 60
    : 0

  const mtbfHours = downtimes.length > 0
    ? uptimeSec / downtimes.length / 3600
    : uptimeSec / 3600

  // Velocidad objetivo de Shoplogix: expectedCycles del primer interval / 5 min
  const firstInterval = m.intervals.find((iv) => iv.expectedCycles > 0)
  const shoplogixTargetCpm = firstInterval
    ? firstInterval.expectedCycles / 5
    : null

  return {
    machineid: m.machineid,
    machineName: m.machineName,
    availability: m.shiftRuntime,
    performance: Math.min(1, m.overallRatio),
    mttrMin,
    mtbfHours,
    failureCount: downtimes.length,
    shoplogixTargetCpm,
  }
}

function computeKPIs(
  machines: UpstreamMachineShift[],
  dateKey: string,
  shiftId: string,
  graderSummaries: GraderDailySummary[],
): PlantKPIs {
  const machineKPIs = machines.map(computeMachineKPI)

  const availability = avg(machineKPIs.map((m) => m.availability))
  const performance  = avg(machineKPIs.map((m) => m.performance))

  // Calidad: buscar el Grader summary que coincida con este turno
  const graderSummary = graderSummaries.find(
    (s) => s.dateKey === dateKey && s.shiftId === shiftId,
  )
  const quality: number | null =
    graderSummary && typeof graderSummary.pointZeroPct === 'number'
      ? Math.max(0, Math.min(1, 1 - graderSummary.pointZeroPct / 100))
      : null

  const oee = quality !== null ? availability * performance * quality : null

  return {
    dateKey,
    shiftId,
    availability,
    performance,
    quality,
    oee,
    mttrMin:      avg(machineKPIs.map((m) => m.mttrMin)),
    mtbfHours:    avg(machineKPIs.map((m) => m.mtbfHours)),
    failureCount: machineKPIs.reduce((a, m) => a + m.failureCount, 0),
    machines: machineKPIs,
  }
}

/**
 * @param plantSlug         'chonchi' | 'yal'
 * @param graderSummaries   Array ya cargado en el componente padre (evita fetch doble)
 */
export function usePlantKPIs(
  plantSlug: PlantSlug,
  graderSummaries: GraderDailySummary[],
): UsePlantKPIsResult {
  const [state, setState] = useState<UsePlantKPIsResult>({
    loading: true,
    error: null,
    kpis: null,
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      setState({ loading: true, error: null, kpis: null })

      try {
        // Buscar el turno más reciente CON producción real (hasta 7 días atrás).
        // Si no hay ninguno con runtime > 0, usar el último con datos (planta detenida).
        let dateKey: string | null = null
        let shiftId: string | null = null
        let snapshot: Awaited<ReturnType<typeof loadShoplogixShift>>['snapshot'] = null
        let fallbackDateKey: string | null = null
        let fallbackShiftId: string | null = null
        let fallbackSnapshot: Awaited<ReturnType<typeof loadShoplogixShift>>['snapshot'] = null

        outer: for (let i = 0; i <= 7; i++) {
          const dk = daysAgo(i)
          const ids = await listShoplogixShiftIdsForDay(dk, plantSlug)
          if (cancelled) return
          // Iterar desde el turno más tardío al más temprano del día
          for (const sid of [...ids].reverse()) {
            const res = await loadShoplogixShift(dk, sid, plantSlug)
            if (cancelled) return
            if (!res.snapshot || res.snapshot.machines.length === 0) continue
            // Guardar como fallback el primer turno con datos (aunque runtime=0)
            if (!fallbackSnapshot) {
              fallbackDateKey = dk; fallbackShiftId = sid; fallbackSnapshot = res.snapshot
            }
            const hasActivity = res.snapshot.machines.some((m) => m.shiftRuntime > 0)
            if (hasActivity) {
              dateKey = dk
              shiftId = sid
              snapshot = res.snapshot
              break outer
            }
          }
        }

        // Si no hubo actividad, usar el último turno sincronizado (planta detenida)
        if (!snapshot && fallbackSnapshot) {
          dateKey = fallbackDateKey; shiftId = fallbackShiftId; snapshot = fallbackSnapshot
        }

        if (!dateKey || !shiftId || !snapshot) {
          if (!cancelled) setState({ loading: false, error: null, kpis: null })
          return
        }

        const kpis = computeKPIs(snapshot.machines, dateKey, shiftId, graderSummaries)
        if (!cancelled) setState({ loading: false, error: null, kpis })
      } catch {
        if (!cancelled) {
          setState({ loading: false, error: 'No se pudo cargar los indicadores de rendimiento', kpis: null })
        }
      }
    }

    load()
    return () => { cancelled = true }
  // graderSummaries intencionalmente excluido: llega como prop estable del padre
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantSlug])

  return state
}
