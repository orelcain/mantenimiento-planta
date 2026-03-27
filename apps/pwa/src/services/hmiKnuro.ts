import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  limit,
} from '@/services/firestoreTracked'
import { db } from './firebase'

// ── Colecciones Firestore ────────────────────────────────────────────────────
const PRESETS_COL = 'hmi-knuro-presets'
const HISTORY_COL = 'hmi-knuro-history'
const CONFIG_COL  = 'hmi-knuro-config'

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface HmiPreset {
  name: string
  data: Record<string, string>
  updatedAt: Date
  updatedBy: string
}

export interface HmiHistoryEntry {
  id?: string
  presetName: string
  action: 'save' | 'delete'
  data: Record<string, string> | null
  previousData: Record<string, string> | null
  userId: string
  userName: string
  timestamp: Date
}

// ── Presets ──────────────────────────────────────────────────────────────────
/** Obtiene todos los presets HMI desde Firestore */
export async function getHmiPresets(): Promise<Record<string, Record<string, string>>> {
  const snap = await getDocs(collection(db, PRESETS_COL))
  const result: Record<string, Record<string, string>> = {}
  snap.forEach(d => {
    const data = d.data()
    if (data.name && data.data) result[data.name as string] = data.data as Record<string, string>
  })
  return result
}

/** Guarda o actualiza un preset HMI en Firestore */
export async function saveHmiPreset(
  name: string,
  data: Record<string, string>,
  userId: string,
): Promise<void> {
  await setDoc(doc(db, PRESETS_COL, name), {
    name,
    data,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
  })
}

/** Elimina un preset HMI de Firestore */
export async function deleteHmiPreset(name: string): Promise<void> {
  await deleteDoc(doc(db, PRESETS_COL, name))
}

// ── Preset activo ─────────────────────────────────────────────────────────────
/** Obtiene el nombre del preset actualmente cargado */
export async function getCurrentPreset(): Promise<string | null> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'current'))
  return snap.exists() ? (snap.data().name as string) || null : null
}

/** Guarda el nombre del preset activo */
export async function setCurrentPreset(name: string): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'current'), { name, updatedAt: serverTimestamp() })
}

// ── Referencias de fábrica ────────────────────────────────────────────────────
/** Obtiene los valores de referencia de fábrica editados por el usuario */
export async function getHmiRefs(): Promise<Record<string, string>> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'refs'))
  return snap.exists() ? (snap.data().data as Record<string, string>) || {} : {}
}

/** Guarda los valores de referencia de fábrica */
export async function saveHmiRefs(refs: Record<string, string>): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'refs'), { data: refs, updatedAt: serverTimestamp() })
}

// ── Historial de cambios ──────────────────────────────────────────────────────
/** Registra una entrada en el historial de cambios */
export async function addHmiHistory(
  entry: Omit<HmiHistoryEntry, 'id' | 'timestamp'>,
): Promise<void> {
  await addDoc(collection(db, HISTORY_COL), {
    ...entry,
    timestamp: serverTimestamp(),
  })
}

/** Obtiene el historial de cambios ordenado por fecha descendente */
export async function getHmiHistory(limitCount = 50): Promise<HmiHistoryEntry[]> {
  const q = query(
    collection(db, HISTORY_COL),
    orderBy('timestamp', 'desc'),
    limit(limitCount),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data()
    return {
      id: d.id,
      presetName: data.presetName as string,
      action: data.action as 'save' | 'delete',
      data: (data.data as Record<string, string>) || null,
      previousData: (data.previousData as Record<string, string>) || null,
      userId: data.userId as string,
      userName: data.userName as string,
      timestamp: (data.timestamp as Timestamp)?.toDate() ?? new Date(),
    }
  })
}
