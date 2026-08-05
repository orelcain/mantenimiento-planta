/**
 * Carga los tramos de producción de los bloques "Unscheduled" de un período,
 * que es lo único que permite repartirlos entre los turnos que les corresponden
 * (ver `graderUnscheduledAttribution` para el porqué).
 *
 * COSTO: 1 query por bloque Unscheduled, y solo por esos. En los meses reales
 * medidos son 2-3 por mes (Yal julio 2026: 3 de 80 docs), así que el mes sigue
 * costando ~5 queries en total. Leer la subcolección de TODOS los turnos, en
 * cambio, costaría una por turno — 80 en ese mismo mes.
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
        if (startAt) out.push({ startAt, cycles })
      }
    })
    return out
  } catch {
    return []
  }
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
