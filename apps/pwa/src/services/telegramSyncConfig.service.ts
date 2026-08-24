/**
 * telegramSyncConfig.service — doc de control del ciclo Telegram→OneDrive→bandeja.
 *
 * La PWA solo ESCRIBE la intención (modo/periodicidad y orden "sincronizar ahora");
 * quien ejecuta es el agente en el PC de mantención (`_SYNC_TELEGRAM/agente_sync.py`,
 * Task Scheduler cada 15 min), que reporta de vuelta estado/última corrida/ítems.
 * Doc: telegramSync/{plantId} (multi-planta ready, hoy 'chonchi').
 */
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, Timestamp,
  collection, query, orderBy, limit,
} from 'firebase/firestore'
import { db } from '@/services/firebase'

export type TelegramSyncModo = 'manual' | 'diaria' | 'cada4h'

export interface TelegramSyncConfig {
  plantId: string
  modo: TelegramSyncModo
  /** HH:MM local (America/Santiago) para el modo 'diaria'. */
  horaDiaria: string
  ordenPendiente: boolean
  ordenSolicitadaAt: Timestamp | null
  ordenSolicitadaPor: string | null
  // ── escrito por el agente del PC ──
  estado: 'idle' | 'corriendo' | 'ok' | 'error'
  ultimaCorridaAt: Timestamp | null
  ultimaCorridaOk: boolean | null
  itemsNuevos: number | null
  mensajeError: string | null
  /** Heartbeat: última vez que el agente del PC consultó este doc. */
  agenteVistoAt: Timestamp | null
  /**
   * Temas de Telegram que llegaron SIN mapeo y quedaron en `POR CLASIFICAR`.
   *
   * El agente ya los detectaba y los dejaba anotados en un JSON del PC
   * (`_temas_sin_mapeo.json`), que hay que acordarse de abrir: los tres temas
   * del protocolo de la Baader 142 estuvieron ahí 3 días —con el video que
   * sube el turno todos los días— sin que nadie los viera. Ahora el aviso
   * viaja al panel.
   */
  temasSinMapeo: TelegramSyncTemaSinMapeo[]
}

export interface TelegramSyncTemaSinMapeo {
  grupo: string
  tema: string
  /** Cuántos mensajes de ese tema ya cayeron en POR CLASIFICAR. */
  items: number
  destino: string
  /** ISO de cuándo se vio por última vez. */
  visto: string | null
}

const PLANT_ID = 'chonchi'
const REF = () => doc(db, 'telegramSync', PLANT_ID)

export const TELEGRAM_SYNC_DEFAULTS: TelegramSyncConfig = {
  plantId: PLANT_ID,
  modo: 'manual',
  horaDiaria: '07:30',
  ordenPendiente: false,
  ordenSolicitadaAt: null,
  ordenSolicitadaPor: null,
  estado: 'idle',
  ultimaCorridaAt: null,
  ultimaCorridaOk: null,
  itemsNuevos: null,
  mensajeError: null,
  agenteVistoAt: null,
  temasSinMapeo: [],
}

export async function loadTelegramSyncConfig(): Promise<TelegramSyncConfig> {
  const snap = await getDoc(REF())
  if (!snap.exists()) return structuredClone(TELEGRAM_SYNC_DEFAULTS)
  return { ...structuredClone(TELEGRAM_SYNC_DEFAULTS), ...(snap.data() as Partial<TelegramSyncConfig>) }
}

/** Suscripción en vivo: el estado del agente aparece sin recargar. */
export function subscribeTelegramSyncConfig(
  cb: (config: TelegramSyncConfig) => void,
): () => void {
  return onSnapshot(REF(), (snap) => {
    if (!snap.exists()) { cb(structuredClone(TELEGRAM_SYNC_DEFAULTS)); return }
    cb({ ...structuredClone(TELEGRAM_SYNC_DEFAULTS), ...(snap.data() as Partial<TelegramSyncConfig>) })
  })
}

export async function saveTelegramSyncModo(modo: TelegramSyncModo, horaDiaria: string): Promise<void> {
  const snap = await getDoc(REF())
  if (!snap.exists()) {
    await setDoc(REF(), { ...TELEGRAM_SYNC_DEFAULTS, modo, horaDiaria })
    return
  }
  await updateDoc(REF(), { modo, horaDiaria })
}

/** Botón "Sincronizar ahora": deja la orden; el agente la toma en ≤15 min. */
// ── Historial de corridas (subcolección `corridas`; la escribe SOLO el agente) ──

export interface TelegramSyncCorridaTema {
  grupo: string
  tema: string
  nuevos: number
}

export interface TelegramSyncCorrida {
  id: string
  at: Timestamp | null
  ok: boolean
  itemsNuevos: number
  motivo: string | null
  solicitadaPor: string | null
  porTema: TelegramSyncCorridaTema[]
  error: string | null
}

/** Últimas corridas del agente, en vivo (más reciente primero). */
export function subscribeTelegramSyncCorridas(
  max: number,
  cb: (corridas: TelegramSyncCorrida[]) => void,
): () => void {
  const q = query(
    collection(db, 'telegramSync', PLANT_ID, 'corridas'),
    orderBy('at', 'desc'),
    limit(max),
  )
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => {
      const x = d.data()
      return {
        id: d.id,
        at: (x.at as Timestamp | undefined) ?? null,
        ok: Boolean(x.ok),
        itemsNuevos: typeof x.itemsNuevos === 'number' ? x.itemsNuevos : 0,
        motivo: (x.motivo as string | undefined) ?? null,
        solicitadaPor: (x.solicitadaPor as string | undefined) ?? null,
        porTema: Array.isArray(x.porTema) ? (x.porTema as TelegramSyncCorridaTema[]) : [],
        error: (x.error as string | undefined) ?? null,
      }
    }))
  })
}

export async function requestTelegramSyncNow(solicitadoPor: string | null): Promise<void> {
  const snap = await getDoc(REF())
  const orden = {
    ordenPendiente: true,
    ordenSolicitadaAt: serverTimestamp(),
    ordenSolicitadaPor: solicitadoPor,
  }
  if (!snap.exists()) {
    await setDoc(REF(), { ...TELEGRAM_SYNC_DEFAULTS, ...orden })
    return
  }
  await updateDoc(REF(), orden)
}
