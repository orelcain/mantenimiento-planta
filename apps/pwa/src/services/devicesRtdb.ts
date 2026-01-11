import {
  onValue,
  ref,
  update,
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
  assignedEquipmentId?: string | null
  assignmentUpdatedAt?: number
  assignmentUpdatedBy?: string
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

function snapshotToDevices(snapshot: DataSnapshot): DeviceRow[] {
  const raw = snapshot.val() as Record<string, DeviceNode> | null
  if (!raw) return []

  return Object.entries(raw)
    .map(([deviceId, node]) => ({
      deviceId,
      ...node,
      lastSeen: normalizeTimestamp(node?.lastSeen),
      assignmentUpdatedAt: normalizeTimestamp(node?.assignmentUpdatedAt),
    }))
    .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
}

export function subscribeDevices(
  onData: (devices: DeviceRow[]) => void,
  onError?: (error: unknown) => void
) {
  const r = ref(rtdb, 'devices')

  const unsubscribe = onValue(
    r,
    (snap) => {
      const devices = snapshotToDevices(snap)
      console.log('[devicesRtdb] Dispositivos detectados:', devices.length, devices)
      onData(devices)
    },
    (err) => {
      console.error('[devicesRtdb] Error:', err)
      onError?.(err)
    }
  )

  return () => {
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
