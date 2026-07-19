/**
 * powerbiExport.service — doc de control del ciclo KPIs → Power BI.
 *
 * La PWA solo ESCRIBE la orden "actualizar ahora"; quien ejecuta es el agente
 * del PC de mantención (`automation/agente_powerbi.py`, Task Scheduler cada
 * 15 min): corre el export de CSVs (solo lectura sobre Firestore), los copia a
 * OneDrive empresa y dispara el refresh del dataset en Power BI Service.
 * Además existe la cadena automática (export c/3h + refresh programado 4×/día),
 * este doc solo cubre las corridas a demanda y su historial.
 * Doc: powerbiExport/{plantId} (multi-planta ready, hoy 'chonchi').
 */
import {
  doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp, Timestamp,
  collection, query, orderBy, limit,
} from 'firebase/firestore'
import { db } from '@/services/firebase'

export interface PowerBIExportConfig {
  plantId: string
  ordenPendiente: boolean
  ordenSolicitadaAt: Timestamp | null
  ordenSolicitadaPor: string | null
  // ── escrito por el agente del PC ──
  estado: 'idle' | 'corriendo' | 'ok' | 'error'
  ultimaCorridaAt: Timestamp | null
  ultimaCorridaOk: boolean | null
  /** Resultado del refresh del dataset en Power BI Service (null = no se intentó). */
  refreshOk: boolean | null
  duracionSeg: number | null
  mensajeError: string | null
  /** Heartbeat: última vez que el agente del PC consultó este doc. */
  agenteVistoAt: Timestamp | null
}

const PLANT_ID = 'chonchi'
const REF = () => doc(db, 'powerbiExport', PLANT_ID)

export const POWERBI_EXPORT_DEFAULTS: PowerBIExportConfig = {
  plantId: PLANT_ID,
  ordenPendiente: false,
  ordenSolicitadaAt: null,
  ordenSolicitadaPor: null,
  estado: 'idle',
  ultimaCorridaAt: null,
  ultimaCorridaOk: null,
  refreshOk: null,
  duracionSeg: null,
  mensajeError: null,
  agenteVistoAt: null,
}

/** Suscripción en vivo: el estado del agente aparece sin recargar. */
export function subscribePowerBIExportConfig(
  cb: (config: PowerBIExportConfig) => void,
): () => void {
  return onSnapshot(REF(), (snap) => {
    if (!snap.exists()) { cb(structuredClone(POWERBI_EXPORT_DEFAULTS)); return }
    cb({ ...structuredClone(POWERBI_EXPORT_DEFAULTS), ...(snap.data() as Partial<PowerBIExportConfig>) })
  })
}

/** Botón "Actualizar ahora": deja la orden; el agente la toma en ≤15 min. */
export async function requestPowerBIExportNow(solicitadoPor: string | null): Promise<void> {
  const snap = await getDoc(REF())
  const orden = {
    ordenPendiente: true,
    ordenSolicitadaAt: serverTimestamp(),
    ordenSolicitadaPor: solicitadoPor,
  }
  if (!snap.exists()) {
    await setDoc(REF(), { ...POWERBI_EXPORT_DEFAULTS, ...orden })
    return
  }
  await updateDoc(REF(), orden)
}

// ── Historial de corridas (subcolección `corridas`; la escribe SOLO el agente) ──

export interface PowerBIExportCorrida {
  id: string
  at: Timestamp | null
  ok: boolean
  refreshOk: boolean | null
  motivo: string | null
  solicitadaPor: string | null
  duracionSeg: number | null
  error: string | null
}

/** Últimas corridas del agente, en vivo (más reciente primero). */
export function subscribePowerBIExportCorridas(
  max: number,
  cb: (corridas: PowerBIExportCorrida[]) => void,
): () => void {
  const q = query(
    collection(db, 'powerbiExport', PLANT_ID, 'corridas'),
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
        refreshOk: typeof x.refreshOk === 'boolean' ? x.refreshOk : null,
        motivo: (x.motivo as string | undefined) ?? null,
        solicitadaPor: (x.solicitadaPor as string | undefined) ?? null,
        duracionSeg: typeof x.duracionSeg === 'number' ? x.duracionSeg : null,
        error: (x.error as string | undefined) ?? null,
      }
    }))
  })
}
