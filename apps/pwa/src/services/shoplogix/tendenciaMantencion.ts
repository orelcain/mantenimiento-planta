/**
 * tendenciaMantencion.ts — la serie «minutos de falla técnica por turno», por
 * máquina, para el bloque de tendencia de la pestaña Mantención (T1 del mockup
 * 26-08).
 *
 * ⚠ La serie NO es el MTBF: con 0 fallas el MTBF no existe, y agujerearía
 * justo los turnos que son el mérito. En minutos de falla el CERO es dato
 * legítimo — la línea plana en cero ES la evidencia, el pico la anomalía.
 *
 * Solo turnos del MISMO nombre (un nocturno no se compara con un diurno) y
 * carga vía `loadShoplogixShift`, que sirve los turnos congelados desde el
 * caché local (0 reads tras la primera visita).
 */

import { loadShoplogixShift, listShoplogixShiftDocIdsForRange, parseShiftDocId } from './shoplogixShift.service'
import type { PlantSlug } from './shoplogixMachines'
import { kpisDeTurno } from './kpisMantencionTurno'

export interface PuntoTendenciaMantencion {
  dateKey: string
  shiftId: string
  porMaquina: Array<{ name: string; fallaMin: number; eventos: number }>
}

/** Cuántos turnos pide el bloque (y desde cuántos se dibuja la banda, si algún día se agrega). */
export const TURNOS_TENDENCIA = 12

export async function cargarTendenciaMantencion(
  plantSlug: PlantSlug,
  shiftId: string,
  hastaDateKey: string,
  nTurnos = TURNOS_TENDENCIA,
): Promise<PuntoTendenciaMantencion[]> {
  /* 30 días hacia atrás alcanzan de sobra para juntar 12 turnos del mismo
     nombre; más atrás la línea puede haber cambiado de configuración. */
  const desde = new Date(`${hastaDateKey}T12:00:00Z`)
  desde.setUTCDate(desde.getUTCDate() - 30)
  const desdeKey = desde.toISOString().slice(0, 10)

  const ids = await listShoplogixShiftDocIdsForRange(desdeKey, hastaDateKey, plantSlug)
  if (!ids) return []

  const candidatos = ids
    .map(parseShiftDocId)
    .filter((x): x is NonNullable<typeof x> => x != null)
    .filter((x) => x.shiftId === shiftId)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    .slice(-nTurnos)

  const puntos = await Promise.all(candidatos.map(async (c) => {
    const { snapshot } = await loadShoplogixShift(c.dateKey, c.shiftId, plantSlug)
    if (!snapshot) return null
    const k = kpisDeTurno(snapshot)
    if (!k) return null
    return {
      dateKey: c.dateKey,
      shiftId: c.shiftId,
      porMaquina: k.porMaquina.map((x) => ({
        name: x.maquina.machineName,
        fallaMin: x.reparto.falla,
        eventos: x.kpi.eventosFalla.length,
      })),
    }
  }))

  return puntos.filter((p): p is PuntoTendenciaMantencion => p != null)
}
