import {
  onValue,
  ref,
  query,
  orderByChild,
  limitToLast,
  type DataSnapshot,
} from 'firebase/database'
import { rtdb } from './firebase'

export type SensorValueNode = {
  value?: number
  unit?: string
  status?: string
  timestamp?: number
  source?: string
}

export type SensorSummaryNode = {
  online?: boolean
  lastSeen?: number
  equipmentId?: string
  temperatura?: SensorValueNode
  humedad?: SensorValueNode
}

export type SensorReading = {
  timestamp: number
  temperature: number
  humidity: number
  tempStatus?: string
  humStatus?: string
  source?: string
}

function normalizeTimestamp(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return NaN

  // Si viene en segundos (10 dígitos aprox), convertir a ms.
  // Epoch ms suele ser >= 1e12.
  if (n > 0 && n < 1e12) return n * 1000
  return n
}

function normalizeSummary(summary: SensorSummaryNode | null): SensorSummaryNode | null {
  if (!summary) return null

  const normalizeValueNode = (node?: SensorValueNode): SensorValueNode | undefined => {
    if (!node) return undefined
    return {
      ...node,
      timestamp: node.timestamp != null ? normalizeTimestamp(node.timestamp) : node.timestamp,
    }
  }

  return {
    ...summary,
    lastSeen: summary.lastSeen != null ? normalizeTimestamp(summary.lastSeen) : summary.lastSeen,
    temperatura: normalizeValueNode(summary.temperatura),
    humedad: normalizeValueNode(summary.humedad),
  }
}

function snapshotToReadings(snapshot: DataSnapshot): SensorReading[] {
  const raw = snapshot.val() as Record<string, Partial<SensorReading>> | null
  if (!raw) return []

  const readings: SensorReading[] = Object.values(raw)
    .map((r) => ({
      timestamp: normalizeTimestamp(r.timestamp ?? 0),
      temperature: Number(r.temperature ?? NaN),
      humidity: Number(r.humidity ?? NaN),
      tempStatus: r.tempStatus,
      humStatus: r.humStatus,
      source: r.source,
    }))
    .filter((r) => Number.isFinite(r.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)

  return readings
}

export function subscribeSensorSummary(
  equipmentId: string,
  onData: (data: SensorSummaryNode | null) => void,
  onError?: (error: unknown) => void
) {
  const path = `sensors/${equipmentId}`
  const r = ref(rtdb, path)

  const unsubscribe = onValue(
    r,
    (snap) => {
      onData(normalizeSummary((snap.val() as SensorSummaryNode | null) ?? null))
    },
    (err) => {
      onError?.(err)
    }
  )

  return () => {
    unsubscribe()
  }
}

export function subscribeSensorReadings(
  equipmentId: string,
  limit: number,
  onData: (data: SensorReading[]) => void,
  onError?: (error: unknown) => void
) {
  const path = `sensors/${equipmentId}/readings`
  const r = ref(rtdb, path)
  const q = query(r, orderByChild('timestamp'), limitToLast(limit))

  const unsubscribe = onValue(
    q,
    (snap) => {
      onData(snapshotToReadings(snap))
    },
    (err) => {
      onError?.(err)
    }
  )

  return () => {
    unsubscribe()
  }
}
