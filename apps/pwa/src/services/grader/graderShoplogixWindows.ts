/**
 * Ventanas de turno REALES de Shoplogix para segmentar el Excel del Grader.
 *
 * Regla del módulo: **Shoplogix manda** — tanto el horario del turno como el
 * DÍA al que pertenece. Los schedules declarados en `plantLines.ts` son solo
 * fallback para días sin sincronizar; los horarios los define Shoplogix y
 * cambian (el T2 de Chonchi ha arrancado 09:00 y 08:00; "Turno 1 Lunes" solo
 * existe los lunes).
 *
 * Convención de tiempo: `scheduledStart/End` vienen wall-clock-as-UTC, igual
 * que los timestamps que produce `graderExcelParser` — se comparan directo.
 */

import { listShiftInfosForDay } from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { ShoplogixShiftWindow } from './graderSegmenter'

/**
 * `Unscheduled` NO es un turno: son las horas entre turnos (mantención,
 * limpieza, calibración). Atribuirle producción mentiría sobre la ventana real.
 */
const NOT_A_SHIFT = 'Unscheduled'

/** YYYY-MM-DD desplazado n días, sin depender de la TZ del navegador. */
function shiftDateKey(dateKey: string, days: number): string {
  const t = Date.parse(`${dateKey}T12:00:00.000Z`)
  if (isNaN(t)) return dateKey
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Días a consultar para cubrir un rango de registros.
 *
 * Se agrega el día ANTERIOR al primero: un registro de las 02:00 del día D
 * pertenece al turno noche cuyo `dateKey` es D-1, y ese turno vive en el doc
 * del día anterior. Sin esto la madrugada del primer día se quedaba sin
 * ventana y caía al fallback.
 */
export function dateKeysToQuery(recordDateKeys: readonly string[]): string[] {
  const set = new Set<string>()
  for (const dk of recordDateKeys) {
    if (!dk) continue
    set.add(dk)
    set.add(shiftDateKey(dk, -1))
  }
  return Array.from(set).sort()
}

/**
 * Carga las ventanas de turno reales para los días que toca el Excel.
 *
 * Best-effort: si un día falla o no está sincronizado, simplemente no aporta
 * ventanas y esos registros caen al schedule declarado de la planta. Nunca
 * lanza — no queremos que un problema de red impida analizar un turno.
 */
export async function loadShoplogixShiftWindows(
  recordDateKeys: readonly string[],
  plantSlug: PlantSlug,
): Promise<ShoplogixShiftWindow[]> {
  const days = dateKeysToQuery(recordDateKeys)
  if (days.length === 0) return []

  const perDay = await Promise.all(
    days.map((dk) => listShiftInfosForDay(dk, plantSlug).catch(() => [])),
  )

  const windows: ShoplogixShiftWindow[] = []
  for (const infos of perDay) {
    for (const info of infos) {
      if (info.shiftId === NOT_A_SHIFT) continue
      // Docs legacy sin doc padre no traen horario: no se puede cortar con
      // ellos, y adivinar una ventana sería peor que caer al fallback.
      if (!info.scheduledStart || !info.scheduledEnd) continue
      const startMs = info.scheduledStart.getTime()
      const endMs = info.scheduledEnd.getTime()
      if (!(endMs > startMs)) continue
      windows.push({
        sessionDate: info.dateKey,
        shiftId: info.shiftId,
        startMs,
        endMs,
      })
    }
  }
  return windows
}
