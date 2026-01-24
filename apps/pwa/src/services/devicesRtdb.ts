import {
  onValue,
  ref,
  update,
  remove,
  type DataSnapshot,
} from 'firebase/database'
import { rtdb } from './firebase'

export type DeviceNode = {
  online?: boolean
  lastSeen?: number
  ip?: string
  rssi?: number
  firmwareVersion?: string
  sensorType?: string
  sendInterval?: number
  assignedEquipmentId?: string | null
  assignmentUpdatedAt?: number
  assignmentUpdatedBy?: string
  wifiSsid?: string
  wifiPassword?: string
  apSsid?: string
  apIp?: string
  apPassword?: string
  apEnabled?: boolean
  deviceName?: string
  mdns?: string
  telemetry?: {
    temperatura?: {
      value?: number
      unit?: string
      status?: string
      timestamp?: number
    }
    humedad?: {
      value?: number
      unit?: string
      status?: string
      timestamp?: number
    }
    source?: string
  }
}

export type DeviceRow = DeviceNode & {
  deviceId: string
}

function normalizeTimestamp(value: unknown): number | undefined {
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  // segundos -> ms
  if (n > 0 && n < 1e12) return n * 1000
  return n
}

function normalizeTelemetry(node: DeviceNode['telemetry'] | undefined): DeviceNode['telemetry'] | undefined {
  if (!node) return undefined

  const normalizeValueNode = (v?: { value?: number; unit?: string; status?: string; timestamp?: number }) => {
    if (!v) return undefined
    return {
      ...v,
      // Normalizar por si viene como string o en segundos
      value: v.value != null ? Number(v.value) : v.value,
      timestamp: v.timestamp != null ? normalizeTimestamp(v.timestamp) : v.timestamp,
    }
  }

  return {
    ...node,
    temperatura: normalizeValueNode(node.temperatura),
    humedad: normalizeValueNode(node.humedad),
  }
}

function normalizeNumber(value: unknown): number | undefined {
  const n = Number(value)
  if (!Number.isFinite(n)) return undefined
  return n
}

function snapshotToDevices(snapshot: DataSnapshot): DeviceRow[] {
  const raw = snapshot.val() as Record<string, DeviceNode> | null
  if (!raw) return []

  return Object.entries(raw)
    .map(([deviceId, node]) => ({
      deviceId,
      ...node,
      lastSeen: normalizeTimestamp(node?.lastSeen),
      assignmentUpdatedAt: normalizeTimestamp(node?.assignmentUpdatedAt),
      sendInterval: normalizeNumber(node?.sendInterval),
      telemetry: normalizeTelemetry(node?.telemetry),
    }))
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
}

export function subscribeDevices(
  onData: (devices: DeviceRow[]) => void,
  onError?: (error: unknown) => void
) {
  const r = ref(rtdb, 'devices')
  
  console.log('[devicesRtdb] Iniciando suscripción a devices/')

  const unsubscribe = onValue(
    r,
    (snap) => {
      const devices = snapshotToDevices(snap)
      console.log('[devicesRtdb] Datos recibidos:', devices.length, 'dispositivos')
      onData(devices)
    },
    (err) => {
      console.error('[devicesRtdb] Error suscripción:', err)
      onError?.(err)
    }
  )

  return () => {
    console.log('[devicesRtdb] Desuscribiendo de devices/')
    unsubscribe()
  }
}

export async function assignDeviceToEquipment(params: {
  deviceId: string
  equipmentId: string | null
  userId: string
}) {
  const path = `devices/${params.deviceId}`
  const r = ref(rtdb, path)

  await update(r, {
    assignedEquipmentId: params.equipmentId,
    assignmentUpdatedAt: Date.now(),
    assignmentUpdatedBy: params.userId,
  })
}

/**
 * Elimina un dispositivo de Firebase RTDB.
 * Útil para limpiar dispositivos obsoletos o duplicados.
 */
export async function deleteDevice(deviceId: string): Promise<void> {
  const path = `devices/${deviceId}`
  const r = ref(rtdb, path)
  await remove(r)
  console.log(`[devicesRtdb] Dispositivo eliminado: ${deviceId}`)
}
