/**
 * machineCapacity.service.ts — Configuración de velocidad nameplate por máquina.
 *
 * Almacena la capacidad física máxima (nameplate) de cada Baader 142,
 * editable desde el panel admin. Se usa para:
 *   1. Detectar si la velocidad objetivo en Shoplogix (expectedCycles/5min)
 *      supera la capacidad física → ⚠ objetivo sobre-configurado.
 *   2. Calcular el componente de Performance real del OEE si el objetivo
 *      está mal calibrado.
 *
 * Ruta Firestore: shoplogix/{plantSlug}/machineCapacity/{machineid}
 * Acceso: admin-only (reglas Firestore deben permitir write a admins).
 *
 * Defaults observados (configurable por admin) — ver `DEFAULT_NAMEPLATE_CPM`:
 *   - Baader 142 modelo ANTIGUO: 19 piezas/min
 *   - Baader 142 modelo NUEVO:   16 piezas/min
 * ⚠ Cuál es la antigua CAMBIA según la planta: en Yal es la 3, en Chonchi la 1.
 */

import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { PLANT_MACHINES } from '@/services/shoplogix/shoplogixMachines'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

export interface MachineCapacityConfig {
  machineid: string
  machineName: string
  /** Velocidad física máxima de la máquina en piezas/minuto (nameplate del fabricante). */
  nameplateMaxCpm: number
  updatedAt: Date | null
  updatedByEmail: string
}

/**
 * Velocidades físicas default por planta y posición dentro de `PLANT_MACHINES`.
 *
 * Las Baader 142 NO son todas iguales: en cada planta hay una del modelo
 * ANTIGUO (19 pz/min) y las demás del NUEVO (16). ⚠ Pero **NO es la misma
 * posición en las dos plantas**:
 *
 *   yal      → la antigua es la Evisceradora 3  (índice 2)
 *   chonchi  → la antigua es la Evisceradora 1  (índice 0)
 *
 * Antes había un solo mapa por índice, copiado del caso de Yal, y en Chonchi
 * quedaba al revés: le daba 16 pz/min de tope a una máquina cuyo objetivo de
 * Shoplogix es 19, o sea que la app la veía permanentemente "sobre-configurada"
 * y le calculaba mal el Performance. Confirmado por Orel en terreno (12-08) y
 * medido en Firestore sobre 40 turnos por planta: los `targetRate` son
 * chonchi 19/16/16 y yal 16/16/19, estables.
 *
 * Ojo al tocar esto: un override guardado en `machineCapacity` le gana al
 * default. En Chonchi ya existen los tres, cargados a mano, así que el error
 * estaba tapado — pero volvía a aparecer con una máquina nueva o si alguien
 * borraba el override.
 */
const DEFAULT_NAMEPLATE_CPM: Record<PlantSlug, Record<number, number>> = {
  yal:     { 0: 16, 1: 16, 2: 19 },
  chonchi: { 0: 19, 1: 16, 2: 16 },
  filete:  { 0: 16 },
}

/** Tope físico por defecto de la máquina en la posición `idx` de `plantSlug`. */
function defaultNameplate(plantSlug: PlantSlug, idx: number): number {
  return DEFAULT_NAMEPLATE_CPM[plantSlug]?.[idx] ?? 16
}

/** Carga la config de capacidad para todas las máquinas de una planta. */
export async function loadMachineCapacities(
  plantSlug: PlantSlug,
): Promise<MachineCapacityConfig[]> {
  const machines = PLANT_MACHINES[plantSlug]
  return Promise.all(
    machines.map(async (m, idx) => {
      const ref = doc(db, `shoplogix/${plantSlug}/machineCapacity/${m.machineid}`)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        const d = snap.data()
        return {
          machineid: m.machineid,
          machineName: m.name,
          nameplateMaxCpm: typeof d.nameplateMaxCpm === 'number'
            ? d.nameplateMaxCpm
            : defaultNameplate(plantSlug, idx),
          updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
          updatedByEmail: String(d.updatedByEmail ?? ''),
        }
      }
      return {
        machineid: m.machineid,
        machineName: m.name,
        nameplateMaxCpm: defaultNameplate(plantSlug, idx),
        updatedAt: null,
        updatedByEmail: '',
      }
    }),
  )
}

/** Guarda la capacidad nameplate de una máquina. Solo llama desde admin. */
export async function saveMachineCapacity(
  plantSlug: PlantSlug,
  machineid: string,
  nameplateMaxCpm: number,
  updatedByEmail: string,
): Promise<void> {
  if (nameplateMaxCpm <= 0 || !Number.isFinite(nameplateMaxCpm)) {
    throw new Error('nameplateMaxCpm debe ser un número positivo')
  }
  const ref = doc(db, `shoplogix/${plantSlug}/machineCapacity/${machineid}`)
  await setDoc(ref, {
    machineid,
    nameplateMaxCpm,
    updatedAt: Timestamp.now(),
    updatedByEmail,
  }, { merge: true })
}
