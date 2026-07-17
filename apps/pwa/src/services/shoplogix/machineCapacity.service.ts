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
 * Defaults observados por el equipo (configurable por admin):
 *   - Baader 142 modelo antiguo (M1 ambas plantas): 21 piezas/min
 *   - Baader 142 modelo nuevo  (M2, M3):            16 piezas/min
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
 * Velocidades físicas default por posición dentro de la planta (`PLANT_MACHINES`).
 *
 * Las 3 Baader 142 de yal NO son iguales: hay dos versiones.
 *   index 0,1 = Evisceradoras 1 y 2 → modelo NUEVO,   tope 16 pz/min
 *   index 2   = Evisceradora 3      → modelo ANTIGUO, rinde 19 pz/min
 *
 * Coincide con los targets que Shoplogix tiene configurados (16 / 16 / 19),
 * estables en los 96 días de histórico. El mapeo anterior estaba INVERTIDO
 * (daba el modelo antiguo al index 0 = Evisceradora 1) y usaba un nominal de
 * 21 pz/min que ninguna máquina alcanzó jamás.
 */
const DEFAULT_NAMEPLATE_CPM: Record<number, number> = {
  0: 16,
  1: 16,
  2: 19,
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
            : (DEFAULT_NAMEPLATE_CPM[idx] ?? 16),
          updatedAt: d.updatedAt instanceof Timestamp ? d.updatedAt.toDate() : null,
          updatedByEmail: String(d.updatedByEmail ?? ''),
        }
      }
      return {
        machineid: m.machineid,
        machineName: m.name,
        nameplateMaxCpm: DEFAULT_NAMEPLATE_CPM[idx] ?? 16,
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
