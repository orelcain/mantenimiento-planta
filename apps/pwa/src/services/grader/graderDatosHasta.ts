/**
 * Lecturas de Firestore para «Datos del grader hasta» (etapa 0) y la cobertura del
 * turno (etapa 1). Leen `graderDailySummaries`, que exige sesión no anónima: quien
 * llama decide si hay sesión antes de consultar (ver `useSesionFirebase`).
 *
 * Es GLOBAL: sale de Firestore, no de la carpeta local de Matrix, así que da lo
 * mismo en el PC de planta que en cualquier otro.
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db } from '../firebase'
import { listDailySummariesByRange } from './graderDailySummary.service'
import type { GraderDailySummary } from './types'
import { ultimoEndAt } from './graderCobertura'

const COLECCION = 'graderDailySummaries'
const CHONCHI = 'chonchi-eviscerado'

/** Los documentos legacy de Chonchi no traen `plantLineId`. */
function esDeLaLinea(d: Pick<GraderDailySummary, 'plantLineId'>, lineId: string): boolean {
  if (lineId === CHONCHI) return !d.plantLineId || d.plantLineId === CHONCHI
  return d.plantLineId === lineId
}

/**
 * Último `endAt` con piezas de la línea. Una sola consulta por `dateKey` descendente
 * (índice de campo único, automático) y filtro de línea en el cliente.
 */
export async function fetchDatosGraderHasta(lineId: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, COLECCION), orderBy('dateKey', 'desc'), limit(24)))
  const docs = snap.docs.map((d) => d.data() as GraderDailySummary).filter((d) => esDeLaLinea(d, lineId))
  return ultimoEndAt(docs)
}

function sumarDias(dateKey: string, dias: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Resúmenes de la línea entre el día anterior y el siguiente: cubre turnos que cruzan medianoche. */
export async function fetchResumenesAlrededor(lineId: string, dateKey: string): Promise<GraderDailySummary[]> {
  return listDailySummariesByRange(sumarDias(dateKey, -1), sumarDias(dateKey, 1), lineId)
}

export type Sesion = 'cargando' | 'con' | 'sin'

/** Sesión real de Firebase (no la persistida del store): la regla pide `isNotAnonymous`. */
export function useSesionFirebase(): Sesion {
  const [s, setS] = useState<Sesion>(() => (auth.currentUser ? (auth.currentUser.isAnonymous ? 'sin' : 'con') : 'cargando'))
  useEffect(() => onAuthStateChanged(auth, (u) => setS(u && !u.isAnonymous ? 'con' : 'sin')), [])
  return s
}

export type Lectura<T> =
  | { estado: 'cargando' }
  | { estado: 'sin-sesion' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'listo'; valor: T }

function esPermiso(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'permission-denied'
}

/** Lee algo de Firestore solo con sesión; `permission-denied` se trata como sin sesión. */
function useLecturaConSesion<T>(clave: string | null, leer: () => Promise<T>): Lectura<T> {
  const sesion = useSesionFirebase()
  const [r, setR] = useState<Lectura<T>>({ estado: 'cargando' })
  useEffect(() => {
    if (sesion === 'cargando' || clave === null) { setR({ estado: 'cargando' }); return }
    if (sesion === 'sin') { setR({ estado: 'sin-sesion' }); return }
    let vivo = true
    // Al refrescar se conserva lo ya leído: sin parpadeo a «cargando».
    setR((prev) => (prev.estado === 'listo' ? prev : { estado: 'cargando' }))
    leer().then(
      (valor) => { if (vivo) setR({ estado: 'listo', valor }) },
      (e: unknown) => {
        if (!vivo) return
        setR(esPermiso(e) ? { estado: 'sin-sesion' } : { estado: 'error', mensaje: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => { vivo = false }
    // `leer` cambia en cada render; la clave resume sus entradas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion, clave])
  return r
}

/** Etapa 0: hasta cuándo hay datos del grader de la línea. Se refresca cada `refrescoMs`. */
export function useDatosGraderHasta(lineId: string | null, refrescoMs = 5 * 60_000): Lectura<string | null> {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), refrescoMs)
    return () => window.clearInterval(id)
  }, [refrescoMs])
  return useLecturaConSesion(lineId ? `${lineId}|${tick}` : null, () => fetchDatosGraderHasta(lineId!))
}

/** Etapa 1: resúmenes que pueden cruzarse con el turno del día `dateKey`. */
export function useResumenesAlrededor(lineId: string | null, dateKey: string | null, refrescoMs = 5 * 60_000): Lectura<GraderDailySummary[]> {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), refrescoMs)
    return () => window.clearInterval(id)
  }, [refrescoMs])
  return useLecturaConSesion(lineId && dateKey ? `${lineId}|${dateKey}|${tick}` : null, () => fetchResumenesAlrededor(lineId!, dateKey!))
}
