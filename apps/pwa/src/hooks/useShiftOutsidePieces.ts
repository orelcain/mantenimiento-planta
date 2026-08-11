/**
 * Piezas que la línea hizo FUERA de la ventana del turno, para la vista de turno.
 *
 * Shoplogix cierra el turno a una hora fija y manda la cola al bucket
 * `Unscheduled`: el 10-ago-2026 Filete cerró 15:30 y siguió hasta las 16:27, y
 * el scorecard mostraba 4.410 cuando la jornada habían sido 4.915. El monitor
 * público ya las contaba (`functions/publicMonitor.js`) y la matriz también
 * (`graderUnscheduledAttribution`); esto cierra la tercera superficie, con el
 * MISMO umbral y el mismo dedupe, para que los tres números coincidan.
 *
 * Costo: 1 lectura (la subcolección del `Unscheduled` del día). Los intervals
 * del turno no se leen — ya vienen en el snapshot que la vista tiene cargado.
 */

import { useEffect, useState } from 'react'
import { loadDayShiftWindows, loadUnscheduledIntervals } from '@/services/grader/graderUnscheduledLoad'
import {
  agruparTramos,
  esColaDeEsteTurno,
  intervalKey,
  OUTSIDE_MIN_PIECES,
} from '@/services/grader/graderUnscheduledAttribution'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

export interface ShiftOutsidePieces {
  /** Piezas reales fuera del horario del turno (ya sin repetidas ni ruido). */
  pieces: number
  /** Tramos en que ocurrieron, para poder nombrarlos ("15:40–16:30"). */
  ranges: Array<{ from: Date; to: Date; pieces: number; kind: 'antes' | 'despues' }>
}

const VACIO: ShiftOutsidePieces = { pieces: 0, ranges: [] }

export function useShiftOutsidePieces(
  dateKey: string | null,
  plantSlug: PlantSlug,
  snapshot: UpstreamLineSnapshot | null,
): ShiftOutsidePieces {
  const [out, setOut] = useState<ShiftOutsidePieces>(VACIO)

  // Firma barata del snapshot: cambia cuando llegan piezas nuevas, no en cada render.
  const firma = snapshot
    ? `${snapshot.dateKey}|${snapshot.shiftId}|${snapshot.machines.reduce((a, m) => a + m.totalCycles, 0)}`
    : ''

  useEffect(() => {
    if (!dateKey || !snapshot || snapshot.machines.length === 0) { setOut(VACIO); return }
    let alive = true

    Promise.all([
      loadUnscheduledIntervals(dateKey, plantSlug),
      loadDayShiftWindows(dateKey, plantSlug),
    ]).then(([intervals, ventanasDelDia]) => {
      if (!alive) return

      // Minutos que el turno YA tiene contados. Shoplogix repite algunos en los
      // dos docs (verificado: 15:30 y 15:35 idénticos, 112 piezas), así que sin
      // este dedupe se sumarían dos veces.
      const yaContados = new Set<string>()
      for (const m of snapshot.machines) {
        for (const iv of m.intervals) {
          if (iv.cycles > 0) yaContados.add(`${m.machineid}|${iv.startAt.getTime()}`)
        }
      }

      const inicio = snapshot.machines[0]?.scheduledStart ?? snapshot.machines[0]?.shiftStart
      const fin = snapshot.machines[0]?.scheduledEnd ?? snapshot.machines[0]?.shiftEnd

      // Los OTROS turnos del día compiten por cada tramo: sin esto, este turno
      // se quedaba con TODAS las colas del día. Caso real Chonchi 10-ago: el
      // turno noche sumaba 1.048 pz de las 07:15 —cola del turno que cerró a esa
      // hora— y 269 de las 17:00, y mostraba 13.487 en vez de 12.170.
      const propia = inicio && fin ? { start: inicio, end: fin } : null
      const otras = ventanasDelDia.filter(v => !propia
        || v.start.getTime() !== propia.start.getTime()
        || v.end.getTime() !== propia.end.getTime())

      const candidatos = intervals.filter(iv => {
        if (yaContados.has(intervalKey(iv))) return false
        const t = iv.startAt.getTime()
        // Dentro de la ventana ya está contado por el propio turno.
        if (inicio && fin && t >= inicio.getTime() && t < fin.getTime()) return false
        // Dentro de la de otro turno, lo cuenta ese turno.
        return !otras.some(v => t >= v.start.getTime() && t < v.end.getTime())
      })

      const tramos = agruparTramos(candidatos)
        .filter(t => t.pieces >= OUTSIDE_MIN_PIECES)
        // La pertenencia se decide sobre el TRAMO completo: es la cola de este
        // turno o no lo es, entero (ver `esColaDeEsteTurno`).
        .filter(t => !propia || esColaDeEsteTurno(t, propia, otras))
      setOut({
        pieces: tramos.reduce((a, t) => a + t.pieces, 0),
        ranges: tramos.map(t => {
          const ultimo = t.intervals[t.intervals.length - 1]!
          return {
            from: t.intervals[0]!.startAt,
            // El tramo termina cuando termina su último intervalo (5 min), no
            // cuando empieza: si no, un tramo de un solo intervalo mide 0.
            to: new Date(ultimo.startAt.getTime() + 5 * 60_000),
            pieces: t.pieces,
            kind: inicio && t.start < inicio.getTime() ? 'antes' as const : 'despues' as const,
          }
        }),
      })
    }).catch(() => { if (alive) setOut(VACIO) })

    return () => { alive = false }
    // `firma` resume el snapshot; incluirlo entero re-dispararía la lectura en
    // cada emisión del listener aunque no haya piezas nuevas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, plantSlug, firma])

  return out
}
