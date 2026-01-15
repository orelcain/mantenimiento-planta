import { ref, set } from 'firebase/database'
import { rtdb } from './firebase'

export interface ApConfig {
  enabled: boolean
  ssid?: string
  password?: string
}

/**
 * Guarda la configuración del AP de un dispositivo en Firebase.
 * El ESP32 escucha cambios en devices/{deviceId}/apConfig y aplica la configuración.
 */
export async function saveApConfig(deviceId: string, config: ApConfig): Promise<void> {
  const apConfigRef = ref(rtdb, `devices/${deviceId}/apConfig`)
  await set(apConfigRef, config)
}
