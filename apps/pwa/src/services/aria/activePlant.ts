/**
 * ARIA — Planta activa del tablero.
 *
 * ARIA no hace function-calling real: infiere la planta parseando el texto del
 * usuario. Si el usuario NO nombra la planta (yal/chonchi), antes se asumía
 * SIEMPRE Chonchi → ARIA respondía datos de otra planta que la que el operador
 * está mirando en pantalla.
 *
 * Este módulo cierra ese hueco leyendo la planta ACTIVA desde la URL del board
 * de Análisis de Turno (`?linea=yal-eviscerado`). Es el mismo parámetro que
 * usa AnalisisGraderTurnoPage, así que ARIA "ve" lo mismo que el usuario.
 *
 * Solo aplica en navegador (guard SSR). Fuera del board (sin `?linea=`)
 * devuelve undefined → el llamador mantiene su default histórico.
 */
import { PLANT_LINES, getPlantLineConfig, type PlantLineId } from '@/config/plantLines'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

/** plantLineId activo según `?linea=` de la URL, o undefined fuera del board. */
export function getActivePlantLineId(): PlantLineId | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const linea = new URLSearchParams(window.location.search).get('linea')
    if (!linea) return undefined
    return PLANT_LINES.find((l) => l.id === linea)?.id
  } catch {
    return undefined
  }
}

/** plantSlug (chonchi/yal) de la planta activa, o undefined fuera del board. */
export function getActivePlantSlug(): PlantSlug | undefined {
  const id = getActivePlantLineId()
  return id ? getPlantLineConfig(id).plantSlug : undefined
}
