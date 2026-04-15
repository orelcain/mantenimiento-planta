/**
 * HMI Grader — service de persistencia en Firestore
 *
 * Patrón idéntico a hmiKnuro.ts pero simplificado para el HMI Grader.
 * Persiste el estado visual del simulador del StaticGrader Marelec:
 * - Valores de los 4 indicadores de peso (0.00 kg)
 * - Indicador activo
 * - Log de eventos recientes
 * - Estado de los 12 pockets (futuro: conteo, último evento, etc)
 *
 * Colecciones:
 *  - hmi-grader-config  — estado visual único (doc id: "state")
 *  - hmi-grader-history — historial de eventos (auto-id, opcional para iters futuras)
 *
 * NOTA: por ahora el HMI es standalone (sin postMessage). Este service está
 * preparado para la iter siguiente cuando el HTML dispare eventos hmi:save-state
 * y hmi:load-state al React wrapper.
 */
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
} from '@/services/firestoreTracked'
import { db } from './firebase'

// ── Colecciones ──────────────────────────────────────────────────────────────
const CONFIG_COL  = 'hmi-grader-config'
const HISTORY_COL = 'hmi-grader-history'

// ── Tipos ────────────────────────────────────────────────────────────────────
export interface GraderState {
  /** Valores de los 4 indicadores de peso (claves "1"..."4") */
  indicators: Record<string, string>
  /** Número del indicador activo (1-4) */
  activeIndicator: number
  /** Últimas líneas del log (máx 50) */
  logLines: string[]
  /** Última actualización */
  updatedAt?: Date
  /** Usuario que hizo la última actualización */
  updatedBy?: string
}

export interface GraderHistoryEntry {
  id?: string
  action: 'pocket-click' | 'numpad-input' | 'fkey-press' | 'state-save'
  detail: string
  userId?: string
  userName?: string
  timestamp: Date
}

// ── Estado visual ────────────────────────────────────────────────────────────
/** Obtiene el estado guardado del HMI Grader. Null si no hay estado aún. */
export async function getGraderState(): Promise<GraderState | null> {
  const snap = await getDoc(doc(db, CONFIG_COL, 'state'))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    indicators: (data.indicators as Record<string, string>) ?? { '1': '0.00', '2': '0.00', '3': '0.00', '4': '0.00' },
    activeIndicator: (data.activeIndicator as number) ?? 1,
    logLines: (data.logLines as string[]) ?? [],
    updatedAt: data.updatedAt?.toDate?.() ?? undefined,
    updatedBy: (data.updatedBy as string) ?? undefined,
  }
}

/** Guarda el estado visual del HMI Grader */
export async function saveGraderState(
  state: Omit<GraderState, 'updatedAt'>,
  userId?: string,
): Promise<void> {
  await setDoc(doc(db, CONFIG_COL, 'state'), {
    indicators: state.indicators,
    activeIndicator: state.activeIndicator,
    logLines: state.logLines.slice(-50), // cap a 50 líneas
    updatedAt: serverTimestamp(),
    updatedBy: userId ?? null,
  })
}

/** Reset el estado a valores por defecto (0.00 kg en los 4 indicadores, log vacío) */
export async function resetGraderState(userId?: string): Promise<void> {
  await saveGraderState(
    {
      indicators: { '1': '0.00', '2': '0.00', '3': '0.00', '4': '0.00' },
      activeIndicator: 1,
      logLines: [],
    },
    userId,
  )
}

// ── Historial (opcional, para iters futuras) ────────────────────────────────
/** Agrega una entrada al historial de eventos del HMI Grader */
export async function addGraderHistory(
  entry: Omit<GraderHistoryEntry, 'id' | 'timestamp'>,
): Promise<void> {
  await addDoc(collection(db, HISTORY_COL), {
    ...entry,
    timestamp: serverTimestamp(),
  })
}

/** Obtiene las últimas N entradas del historial */
export async function getGraderHistory(maxEntries = 50): Promise<GraderHistoryEntry[]> {
  const q = query(
    collection(db, HISTORY_COL),
    orderBy('timestamp', 'desc'),
    limit(maxEntries),
  )
  const snap = await getDocs(q)
  const result: GraderHistoryEntry[] = []
  snap.forEach(d => {
    const data = d.data()
    result.push({
      id: d.id,
      action: data.action as GraderHistoryEntry['action'],
      detail: data.detail as string,
      userId: data.userId as string | undefined,
      userName: data.userName as string | undefined,
      timestamp: data.timestamp?.toDate?.() ?? new Date(),
    })
  })
  return result
}
