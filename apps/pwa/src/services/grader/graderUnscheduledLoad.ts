/**
 * Carga los tramos de producción de los bloques "Unscheduled" de un período,
 * que es lo único que permite repartirlos entre los turnos que les corresponden
 * (ver `graderUnscheduledAttribution` para el porqué).
 *
 * COSTO: 1 query por bloque Unscheduled, y solo por esos. En los meses reales
 * medidos son 2-3 por mes (Yal julio 2026: 3 de 80 docs), así que el mes sigue
 * costando ~5 queries en total. Leer la subcolección de TODOS los turnos, en
 * cambio, costaría una por turno — 80 en ese mismo mes.
 *
 * También carga los minutos que los turnos de ESOS MISMOS días ya tienen
 * contados (`loadCountedKeysForDate`), que es lo que evita sumar dos veces la
 * producción que Shoplogix reporta en los dos lados. Son 1-3 docs extra por día
 * con Unscheduled, no por turno del mes.
 */
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { CycleInterval } from '@/services/grader/graderUnscheduledAttribution'

interface RawInterval {
  startAt?: { toDate?: () => Date; seconds?: number }
  cycles?: number
}

function toDate(ts: RawInterval['startAt']): Date | null {
  if (!ts) return null
  if (typeof ts.toDate === 'function') return ts.toDate()
  if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000)
  return null
}

/**
 * Tramos con producción de un bloque Unscheduled, sumando todas sus máquinas.
 *
 * Devuelve `[]` ante cualquier error: sin tramos no se atribuye nada y el
 * bloque se sigue mostrando aparte, que es el comportamiento honesto — nunca
 * conviene inventar una atribución porque la lectura falló.
 */
export async function loadUnscheduledIntervals(
  dateKey: string,
  plantSlug: PlantSlug,
): Promise<CycleInterval[]> {
  try {
    const ref = collection(db, `shoplogix/${plantSlug}/shifts/${dateKey}_Unscheduled/machines`)
    const snap = await getDocs(ref)
    const out: CycleInterval[] = []
    snap.forEach(doc => {
      const raw = (doc.data() as { intervals?: RawInterval[] }).intervals
      if (!Array.isArray(raw)) return
      for (const iv of raw) {
        const cycles = Number(iv?.cycles ?? 0)
        if (!(cycles > 0)) continue
        const startAt = toDate(iv?.startAt)
        if (startAt) out.push({ startAt, cycles, machineid: doc.id })
      }
    })
    return out
  } catch {
    return []
  }
}

/**
 * Minutos que los turnos de un día YA tienen contados, como claves
 * `machineid|epochMs`.
 *
 * Por qué hace falta: el doc de un turno guarda intervals MÁS ALLÁ de su propio
 * `scheduledEnd`, y Shoplogix repite esos mismos minutos dentro de
 * `Unscheduled`. Verificado el 10-ago-2026 en Filete: los tramos 15:30 y 15:35
 * estaban idénticos en los dos docs (112 piezas). Atribuirlos otra vez los
 * cuenta dos veces en el total del turno y del mes.
 *
 * Se leen solo los turnos de los días que tienen Unscheduled — no los del mes.
 */
export async function loadCountedKeysForDate(
  dateKey: string,
  shiftIds: readonly string[],
  plantSlug: PlantSlug,
): Promise<Set<string>> {
  const keys = new Set<string>()
  await Promise.all(shiftIds.map(async shiftId => {
    try {
      const ref = collection(db, `shoplogix/${plantSlug}/shifts/${dateKey}_${shiftId}/machines`)
      const snap = await getDocs(ref)
      snap.forEach(doc => {
        const raw = (doc.data() as { intervals?: RawInterval[] }).intervals
        if (!Array.isArray(raw)) return
        for (const iv of raw) {
          if (!(Number(iv?.cycles ?? 0) > 0)) continue
          const startAt = toDate(iv?.startAt)
          if (startAt) keys.add(`${doc.id}|${startAt.getTime()}`)
        }
      })
    } catch {
      // Sin las claves de este turno no se deduplica contra él: se prefiere
      // seguir atribuyendo (comportamiento anterior) antes que perder piezas.
    }
  }))
  return keys
}

/** Los tramos de todos los Unscheduled de un período, indexados por su key. */
export async function loadUnscheduledIntervalsForKeys(
  unscheduledKeys: readonly string[],
  plantSlug: PlantSlug,
): Promise<Map<string, CycleInterval[]>> {
  const entries = await Promise.all(
    unscheduledKeys.map(async key => {
      const dateKey = key.slice(0, 10)
      return [key, await loadUnscheduledIntervals(dateKey, plantSlug)] as const
    }),
  )
  return new Map(entries.filter(([, ivs]) => ivs.length > 0))
}
