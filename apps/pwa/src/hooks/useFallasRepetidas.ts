/**
 * useFallasRepetidas — paros de Mantención del turno que son la vuelta de la
 * misma causa en la misma máquina (ver `services/shoplogix/fallaRepetida.ts`).
 *
 * Para saber si el primer paro del turno es una repetición hay que mirar atrás
 * hasta 8 h de operación, que pueden caer en el turno anterior o en el de
 * antes. Por eso carga los turnos de la planta del día previo y del mismo día
 * anteriores al actual: 1 query de ids + una carga por turno (cada una lee la
 * subcolección de máquinas; los congelados salen del caché local). Sin los
 * previos la card igual funciona, solo que no ve las vueltas que cruzan de
 * turno — y lo dice.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  listShoplogixShiftDocIdsForRange,
  loadShoplogixShift,
  parseShiftDocId,
} from '@/services/shoplogix/shoplogixShift.service'
import {
  episodiosFalla,
  fallasRepetidasDelTurno,
  type GrupoFallaRepetida,
  type MaquinaFalla,
} from '@/services/shoplogix/fallaRepetida'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import { logger } from '@/lib/logger'

/** Días hacia atrás que se leen: 8 h de operación caben de sobra en el turno anterior y el día previo. */
const DIAS_PREVIOS = 1

function restarDias(dateKey: string, dias: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}

export interface FallasRepetidasResult {
  grupos: GrupoFallaRepetida[]
  /** Episodios de falla que empezaron en el turno (repetidos o no). */
  episodiosTurno: number
  /** Turnos previos que se alcanzaron a leer (0 = solo se ve dentro del turno). */
  turnosPrevios: number
  loading: boolean
}

export function useFallasRepetidas(
  plantSlug: PlantSlug,
  machines: ReadonlyArray<UpstreamMachineShift>,
): FallasRepetidasResult {
  const ref = machines[0]
  const dateKey = ref?.dateKey ?? ''
  const shiftId = ref?.shiftId ?? ''
  const [previos, setPrevios] = useState<UpstreamMachineShift[][]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!dateKey || !shiftId) return
    let vivo = true
    setLoading(true)
    setPrevios([])
    const actual = `${dateKey}_${shiftId}`
    ;(async () => {
      const ids = await listShoplogixShiftDocIdsForRange(restarDias(dateKey, DIAS_PREVIOS), dateKey, plantSlug)
      // Todos los turnos del rango anteriores al actual, «Unscheduled» incluido: ahí
      // Shoplogix deja producción fuera de horario, y sus states repetidos se deduplican.
      const anteriores = (ids ?? []).filter((id) => id < actual).sort()
      const cargas = await Promise.all(anteriores.map(async (id) => {
        const p = parseShiftDocId(id)
        if (!p) return null
        try {
          const r = await loadShoplogixShift(p.dateKey, p.shiftId, plantSlug)
          return r.snapshot?.machines ?? null
        } catch (err) {
          logger.warn('[useFallasRepetidas] no se pudo leer el turno previo', { id, err })
          return null
        }
      }))
      if (vivo) setPrevios(cargas.filter((x): x is UpstreamMachineShift[] => x !== null))
    })()
      .catch((err) => logger.warn('[useFallasRepetidas] sin turnos previos', err))
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [plantSlug, dateKey, shiftId])

  return useMemo(() => {
    const porMaquina = new Map<string, MaquinaFalla & { states: UpstreamMachineShift['states'] }>()
    for (const m of [...previos.flat(), ...machines]) {
      const cur = porMaquina.get(m.machineid)
      if (cur) cur.states = [...cur.states, ...m.states]
      else porMaquina.set(m.machineid, { machineid: m.machineid, machineName: m.machineName, states: m.states })
    }
    // El nombre del turno actual manda (los previos pueden traer otro alias).
    for (const m of machines) {
      const cur = porMaquina.get(m.machineid)
      if (cur) cur.machineName = m.machineName
    }
    const eps = episodiosFalla([...porMaquina.values()])
    const desde = new Date(Math.min(...machines.map((m) => (m.scheduledStart ?? m.shiftStart).getTime())))
    const hasta = new Date(Math.max(...machines.map((m) => (m.scheduledEnd ?? m.shiftEnd).getTime())))
    const enTurno = eps.filter((e) => e.startAt >= desde && e.startAt < hasta)
    return {
      grupos: machines.length ? fallasRepetidasDelTurno(eps, desde, hasta) : [],
      episodiosTurno: enTurno.length,
      turnosPrevios: previos.length,
      loading,
    }
  }, [machines, previos, loading])
}
