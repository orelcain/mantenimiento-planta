/**
 * Plantillas base de ETT
 *
 * Punto único de acceso a todas las plantillas disponibles.
 * Usar `ETT_PLANTILLAS` para la lista completa o `getPlantilla(id)`
 * para obtener una plantilla específica por ID.
 */

import type { ETT, ETTPlantilla, ETTPlantillaId } from '@/types'
import { plantillaPaneles } from './plantillaPaneles'
import { plantillaPiping } from './plantillaPiping'
import { plantillaVacia } from './plantillaVacia'

/** Lista ordenada de todas las plantillas disponibles */
export const ETT_PLANTILLAS: ETTPlantilla[] = [
  plantillaPaneles,
  plantillaPiping,
  plantillaVacia,
]

/** Mapa por ID para lookup rápido */
const plantillasPorId = new Map<ETTPlantillaId, ETTPlantilla>(
  ETT_PLANTILLAS.map((p) => [p.id, p]),
)

/**
 * Obtiene una plantilla por su ID.
 * @throws si el ID no existe
 */
export function getPlantilla(id: ETTPlantillaId): ETTPlantilla {
  const plantilla = plantillasPorId.get(id)
  if (!plantilla) {
    throw new Error(`Plantilla ETT no encontrada: ${id}`)
  }
  return plantilla
}

/**
 * Crea una nueva ETT a partir de una plantilla base.
 *
 * Devuelve los campos de negocio del documento (sin id, metadata ni
 * timestamps). El servicio de Firestore se encarga de agregar id, createdAt,
 * updatedAt y createdBy al persistir.
 */
export function nuevaETTDesdePlantilla(
  plantillaId: ETTPlantillaId,
  createdBy: string,
): Omit<ETT, 'id' | 'createdAt' | 'updatedAt'> {
  const plantilla = getPlantilla(plantillaId)
  // Clonado profundo para evitar que el usuario muta los defaults
  const defaults = JSON.parse(
    JSON.stringify(plantilla.defaults),
  ) as typeof plantilla.defaults

  // La fecha se pierde en el JSON.stringify → la reseteamos a ahora
  defaults.cabecera.fecha_requerimiento = new Date()

  return {
    ...defaults,
    estado: 'borrador',
    createdBy,
    origen: plantillaId,
  }
}

// Re-exports
export { plantillaPaneles, plantillaPiping, plantillaVacia }
