import { ref, set, get } from 'firebase/database'
import { rtdb } from './firebase'

/**
 * Guarda el intervalo de lectura de un dispositivo en Firebase.
 * El ESP32 escucha cambios en devices/{deviceId}/sendInterval y aplica la configuración.
 * 
 * @param deviceId - ID del dispositivo
 * @param intervalSeconds - Intervalo en segundos (mínimo 5, máximo 300)
 */
export async function saveSendInterval(deviceId: string, intervalSeconds: number): Promise<void> {
  // Validar rango
  const clampedInterval = Math.max(5, Math.min(300, intervalSeconds))
  
  const intervalRef = ref(rtdb, `devices/${deviceId}/sendInterval`)
  await set(intervalRef, clampedInterval)
  console.log(`[deviceConfigRtdb] Intervalo guardado: ${clampedInterval}s para ${deviceId}`)
}

/**
 * Obtiene el intervalo de lectura configurado para un dispositivo.
 * 
 * @param deviceId - ID del dispositivo
 * @returns Intervalo en segundos o null si no está configurado
 */
export async function getSendInterval(deviceId: string): Promise<number | null> {
  const intervalRef = ref(rtdb, `devices/${deviceId}/sendInterval`)
  const snapshot = await get(intervalRef)
  
  if (snapshot.exists()) {
    return snapshot.val() as number
  }
  return null
}
