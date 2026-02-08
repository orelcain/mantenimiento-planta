import {
  onValue,
  ref,
  query,
  orderByChild,
  limitToLast,
  limitToFirst,
  startAt,
  endAt,
  get,
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

export type SensorReadingRow = SensorReading & {
  id: string
}

// Obtener historial de lecturas (limitado para gráficas)
export async function fetchSensorHistory(
  equipmentId: string,
  startTs: number,
  endTs: number
): Promise<SensorReading[]> {
  try {
    const dbRef = ref(rtdb, `sensors/${equipmentId}/history`)
    // Obtener los datos dentro del rango, asumiendo que el key es el timestamp o que hay un índice por timestamp
    // Si no tienes indice por timestamp, y usas push key, esto puede ser complejo.
    // Asumiremos que se guardan con timestamp como key o que hay un campo timestamp.
    // Para simplificar y dado que esto es demo, consultamos los últimos X y filtramos en cliente si no hay estructura óptima.
    
    // Mejor aproximación si usamos push IDs: orderByChild('timestamp').startAt(startTs).endAt(endTs)
    // Asegurarse de tener reglas de índice en Firebase Realtime Database: ".indexOn": ["timestamp"]
    
    const q = query(
      dbRef,
      orderByChild('timestamp'),
      startAt(startTs),
      endAt(endTs),
      limitToLast(500) // Limite de seguridad
    )

    const snapshot = await get(q)
    if (!snapshot.exists()) return []

    const results: SensorReading[] = []
    snapshot.forEach((child) => {
      const val = child.val()
      if (val && typeof val.timestamp === 'number') {
        results.push({
            timestamp: val.timestamp, // Ya debe venir corregido/absoluto desde backend IoT
            temperature: typeof val.temperature === 'number' ? val.temperature : 0,
            humidity: typeof val.humidity === 'number' ? val.humidity : 0,
            tempStatus: val.tempStatus,
            humStatus: val.humStatus,
            source: val.source
        })
      }
    })

    return results.sort((a, b) => a.timestamp - b.timestamp)
  } catch (error) {
    console.warn('Error fetching sensor history:', error)
    return []
  }
}

const TS_WRAP_MOD = 2 ** 32

function unwrapWrappedMs(tsWrappedMs: number, nowMs: number): number {
  // RTDB puede haber recibido timestamps ms truncados a 32-bit (wrap 2^32).
  // Recuperamos el valor más cercano a `nowMs` sumando múltiplos de 2^32.
  if (!Number.isFinite(tsWrappedMs)) return NaN
  if (!Number.isFinite(nowMs)) return tsWrappedMs

  const k = Math.round((nowMs - tsWrappedMs) / TS_WRAP_MOD)
  const unwrapped = tsWrappedMs + k * TS_WRAP_MOD
  return unwrapped
}

function normalizeTimestamp(value: unknown, nowMs: number = Date.now()): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return NaN

  // Epoch ms suele ser >= 1e12.
  if (n >= 1e12) return n

  if (n <= 0) return NaN

  const nowSec = Math.floor(nowMs / 1000)
  const maxReasonableSec = nowSec + 60 * 60 * 24 * 30 // +30 días

  // Si el número parece "segundos" razonables (cerca de ahora), lo convertimos a ms.
  if (n <= maxReasonableSec) return n * 1000

  // Si cae en el rango 32-bit, puede ser ms truncado; lo "desenvolvemos".
  if (n < TS_WRAP_MOD) return unwrapWrappedMs(n, nowMs)

  // Fallback: tratarlo como segundos.
  return n * 1000
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

function snapshotToReadingRows(snapshot: DataSnapshot): SensorReadingRow[] {
  const raw = snapshot.val() as Record<string, Partial<SensorReading>> | null
  if (!raw) return []

  return Object.entries(raw)
    .map(([id, r]) => ({
      id,
      timestamp: normalizeTimestamp(r.timestamp ?? 0),
      temperature: Number(r.temperature ?? NaN),
      humidity: Number(r.humidity ?? NaN),
      tempStatus: r.tempStatus,
      humStatus: r.humStatus,
      source: r.source,
    }))
    .filter((r) => Number.isFinite(r.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
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

// Lectura única del resumen de sensores para un equipo
export async function fetchSensorSummaryOnce(equipmentId: string): Promise<SensorSummaryNode | null> {
  const path = `sensors/${equipmentId}`
  const r = ref(rtdb, path)
  const snap = await get(r)
  const raw = (snap.val() as SensorSummaryNode | null) ?? null
  return normalizeSummary(raw)
}

// Lectura única de las últimas N lecturas
export async function fetchLastSensorReadings(
  equipmentId: string,
  limitCount: number
): Promise<SensorReading[]> {
  const path = `sensors/${equipmentId}/readings`
  const r = ref(rtdb, path)
  const q = query(r, orderByChild('timestamp'), limitToLast(limitCount))
  const snap = await get(q)
  return snapshotToReadings(snap)
}

export async function fetchSensorReadingsRange(params: {
  equipmentId: string
  fromMs: number
  toMs: number
  limit?: number
}): Promise<SensorReadingRow[]> {
  const limit = params.limit ?? 20_000
  const path = `sensors/${params.equipmentId}/readings`
  const r = ref(rtdb, path)

  // La base puede tener timestamps en ms o en segundos.
  // Además, versiones antiguas del firmware podían truncar ms a 32-bit.
  // Ejecutamos (ms + segundos + wrap32(ms)) y unificamos por id.
  const ranges: Array<{ from: number; to: number }> = [{ from: params.fromMs, to: params.toMs }]

  const fromSec = Math.floor(params.fromMs / 1000)
  const toSec = Math.ceil(params.toMs / 1000)
  if (Number.isFinite(fromSec) && Number.isFinite(toSec) && fromSec > 0 && toSec > 0) {
    ranges.push({ from: fromSec, to: toSec })
  }

  // Wrap 32-bit de ms: query por dominio mod 2^32.
  const mod = TS_WRAP_MOD
  const fromWrap = ((params.fromMs % mod) + mod) % mod
  const toWrap = ((params.toMs % mod) + mod) % mod

  if (Number.isFinite(fromWrap) && Number.isFinite(toWrap)) {
    if (fromWrap <= toWrap) {
      ranges.push({ from: fromWrap, to: toWrap })
    } else {
      // Cruza el borde del wrap
      ranges.push({ from: fromWrap, to: mod - 1 })
      ranges.push({ from: 0, to: toWrap })
    }
  }

  const snaps = await Promise.all(
    ranges.map((range) =>
      get(
        query(
          r,
          orderByChild('timestamp'),
          startAt(range.from),
          endAt(range.to),
          limitToFirst(limit)
        )
      )
    )
  )

  const byId = new Map<string, SensorReadingRow>()
  for (const s of snaps) {
    for (const row of snapshotToReadingRows(s)) {
      byId.set(row.id, row)
    }
  }

  return Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp)
}

export async function fetchSensorReadingsBounds(params: {
  equipmentId: string
}): Promise<{ first: SensorReadingRow | null; last: SensorReadingRow | null }> {
  const path = `sensors/${params.equipmentId}/readings`
  const r = ref(rtdb, path)

  const [firstSnap, lastSnap] = await Promise.all([
    get(query(r, orderByChild('timestamp'), limitToFirst(1))),
    get(query(r, orderByChild('timestamp'), limitToLast(1))),
  ])

  const first = snapshotToReadingRows(firstSnap)[0] ?? null
  const last = snapshotToReadingRows(lastSnap)[0] ?? null
  return { first, last }
}
