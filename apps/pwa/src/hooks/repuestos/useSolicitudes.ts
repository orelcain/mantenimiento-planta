/**
 * useSolicitudes — Solicitudes de repuestos (rediseño área-first, Fase 6).
 *
 * Colección Firestore:
 *   solicitudes_repuestos/{id} → codigoSAP, textoBreve, cantidad,
 *     estado (pendiente|aprobada|entregada), solicitadoPor(Nombre), observaciones?, createdAt
 *
 * DOS TIPOS en la misma colección:
 *  - pedido de repuesto (sin `tipo`): pendiente → aprobada → entregada. Descuenta stock al entregar.
 *  - ALTA DE CÓDIGO (`tipo: 'alta_codigo'`, ficha A3C): pide a bodega crear el SAP de un código de
 *    fabricante. Ciclo propio: pendiente → creada | rechazada (→ «volver a solicitar» la reabre). Id fijo
 *    `alta_<CODIGO>`: un código, una alta, sin importar desde qué elemento del plano se pida. NO pasa
 *    por `avanzarEstado` ni descuenta stock.
 *
 * Lista en vivo (onSnapshot) ordenada por fecha desc + alta + avance de estado.
 * Firestore SIN ignoreUndefinedProperties → se stripea `observaciones` si va vacío.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  collection,
  deleteField,
  doc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { registrarAltaConMaestro, type ResultadoMaestro } from '@/services/repuestos/asignarSapMaestro'
import { normCodigo } from '@/utils/repuestos/normCodigo'
import { camposDeTraza } from './trazaDeSolicitud'

export type SolicitudEstado = 'pendiente' | 'aprobada' | 'entregada'
export type AltaEstado = 'pendiente' | 'creada' | 'rechazada'
/** «nuevo» = bodega creó el código; «ya_existia» = Mantención encontró que ya estaba en SAP. */
export type OrigenSap = 'nuevo' | 'ya_existia'

interface SolicitudBase {
  id: string
  codigoSAP: string
  textoBreve: string
  cantidad: number
  solicitadoPor: string
  solicitadoPorNombre: string
  observaciones?: string
  createdAt: Date
}

export interface SolicitudRepuesto extends SolicitudBase {
  /** Los pedidos normales no lo traen (o dicen 'repuesto'). */
  tipo?: 'repuesto'
  estado: SolicitudEstado
  /** Traza de cada paso (ver trazaDeSolicitud). Las solicitudes viejas no la tienen. */
  aprobadaAt?: Date
  aprobadaPor?: string
  entregadaAt?: Date
  entregadaPor?: string
}

/** Pedido a bodega de crear el SAP de un código de fabricante (ver cabecera). */
export interface AltaCodigo extends SolicitudBase {
  tipo: 'alta_codigo'
  estado: AltaEstado
  codigoFabricante: string
  /** `normCodigo(codigoFabricante)`: lo escribe el cliente y la regla ata el id (`alta_<codigoNorm>`) a él. */
  codigoNorm: string
  /** Descripción en alemán del catálogo (lleva la tensión, p. ej.); `textoBreve` es la española. */
  descripcionDe?: string
  fig?: string
  pos?: string
  fuentes: string[]
  nivel: 'pieza' | 'conjunto'
  confianza: string
  planoSlug: string
  /** Máquina activa al pedir («N2»). */
  maquina?: string
  /** Elemento desde el que se pidió. */
  elemento: string
  /** TODOS los elementos del plano que usan ese código (calculado desde partes.json). */
  elementos: string[]
  fotoUrl?: string
  sapCreado?: string
  origenSap?: OrigenSap
  creadaPor?: string
  creadaPorNombre?: string
  creadaAt?: Date
  motivoRechazo?: string
  rechazadaPor?: string
  rechazadaPorNombre?: string
  rechazadaAt?: Date
}

export type SolicitudItem = SolicitudRepuesto | AltaCodigo

export const esAlta = (s: SolicitudItem): s is AltaCodigo => s.tipo === 'alta_codigo'

export interface NuevaSolicitud {
  codigoSAP: string
  textoBreve: string
  cantidad: number
  observaciones?: string
}

/** Lo que arma la ficha para pedir un alta (sin quién ni cuándo: eso lo pone `crearAltaCodigo`). */
export type NuevaAlta = Omit<
  AltaCodigo,
  'id' | 'estado' | 'createdAt' | 'solicitadoPor' | 'solicitadoPorNombre' | 'codigoSAP' | 'sapCreado' | 'origenSap' | 'creadaPor' | 'creadaPorNombre' | 'creadaAt' | 'motivoRechazo' | 'rechazadaPor' | 'rechazadaPorNombre' | 'rechazadaAt'
>

const SOLICITUDES_COL = 'solicitudes_repuestos'

/** Tope de unidades de un alta: lo exige firestore.rules (el pedido normal admite más). */
const MAX_CANTIDAD_ALTA = 999

/** Orden de avance del estado: pendiente → aprobada → entregada. */
export const ESTADO_SIGUIENTE: Record<SolicitudEstado, SolicitudEstado | null> = {
  pendiente: 'aprobada',
  aprobada: 'entregada',
  entregada: null,
}

function tsOpcional(ts: Timestamp | Date | undefined | null): Date | undefined {
  return ts ? tsToDate(ts) : undefined
}

function tsToDate(ts: Timestamp | Date | undefined | null): Date {
  if (!ts) return new Date()
  if (ts instanceof Date) return ts
  if (typeof ts === 'object' && 'toDate' in ts) return ts.toDate()
  return new Date()
}

const txt = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)

/** Un doc de `solicitudes_repuestos` → su forma tipada (pedido normal o alta de código). */
export function docASolicitud(id: string, data: Record<string, unknown>): SolicitudItem {
  const base = {
    id,
    codigoSAP: (data.codigoSAP as string) || '',
    textoBreve: (data.textoBreve as string) || '',
    cantidad: (data.cantidad as number) ?? 0,
    solicitadoPor: (data.solicitadoPor as string) || '',
    solicitadoPorNombre: (data.solicitadoPorNombre as string) || '',
    observaciones: txt(data.observaciones),
    createdAt: tsToDate(data.createdAt as Timestamp),
  }
  if (data.tipo === 'alta_codigo') {
    const e = data.estado
    return {
      ...base,
      tipo: 'alta_codigo',
      estado: e === 'creada' || e === 'rechazada' ? e : 'pendiente',
      codigoFabricante: (data.codigoFabricante as string) || '',
      codigoNorm: txt(data.codigoNorm) ?? normCodigo((data.codigoFabricante as string) || ''),
      descripcionDe: txt(data.descripcionDe),
      fig: txt(data.fig),
      pos: txt(data.pos),
      fuentes: Array.isArray(data.fuentes) ? (data.fuentes as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      nivel: data.nivel === 'conjunto' ? 'conjunto' : 'pieza',
      confianza: (data.confianza as string) || '',
      planoSlug: (data.planoSlug as string) || '',
      maquina: txt(data.maquina),
      elemento: (data.elemento as string) || '',
      elementos: Array.isArray(data.elementos) ? (data.elementos as unknown[]).filter((x): x is string => typeof x === 'string') : [],
      fotoUrl: txt(data.fotoUrl),
      sapCreado: txt(data.sapCreado),
      origenSap: data.origenSap === 'ya_existia' ? 'ya_existia' : data.origenSap === 'nuevo' ? 'nuevo' : undefined,
      creadaPor: txt(data.creadaPor),
      creadaPorNombre: txt(data.creadaPorNombre),
      creadaAt: tsOpcional(data.creadaAt as Timestamp),
      motivoRechazo: txt(data.motivoRechazo),
      rechazadaPor: txt(data.rechazadaPor),
      rechazadaPorNombre: txt(data.rechazadaPorNombre),
      rechazadaAt: tsOpcional(data.rechazadaAt as Timestamp),
    }
  }
  return {
    ...base,
    estado: (data.estado as SolicitudEstado) || 'pendiente',
    aprobadaAt: tsOpcional(data.aprobadaAt as Timestamp),
    aprobadaPor: txt(data.aprobadaPor),
    entregadaAt: tsOpcional(data.entregadaAt as Timestamp),
    entregadaPor: txt(data.entregadaPor),
  }
}

/** Quita los `undefined` (Firestore los rechaza sin ignoreUndefinedProperties). */
function sinUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

export const idDeAlta = (codigoNormalizado: string) => `alta_${codigoNormalizado}`

// ── Altas de código (funciones sueltas: la ficha A3C no escucha toda la colección) ─────────────────

export type ResultadoCrearAlta =
  | { resultado: 'creada' }
  /** Ya había una alta de ese código: se muestra la existente, no se duplica. */
  | { resultado: 'existente'; alta: AltaCodigo }

/**
 * Crea el alta `alta_<CODIGO>` en una transacción: si ya existe (pendiente, creada o rechazada) NO la pisa y
 * devuelve la existente. Para reabrir una rechazada está `reabrirAlta`.
 */
export async function crearAltaCodigo(id: string, data: NuevaAlta, cantidad: number, userId: string, userName: string): Promise<ResultadoCrearAlta> {
  const ref = doc(db, SOLICITUDES_COL, id)
  const payload = sinUndefined({
    ...data,
    tipo: 'alta_codigo' as const,
    codigoSAP: '',
    cantidad: Math.min(MAX_CANTIDAD_ALTA, Math.max(1, Math.round(cantidad || 1))),
    observaciones: data.observaciones?.trim() || undefined,
    estado: 'pendiente' as const,
    solicitadoPor: userId,
    solicitadoPorNombre: userName,
    createdAt: serverTimestamp(),
  })
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) {
      const existente = docASolicitud(snap.id, snap.data())
      if (esAlta(existente)) return { resultado: 'existente' as const, alta: existente }
    }
    tx.set(ref, payload)
    return { resultado: 'creada' as const }
  })
}

/**
 * Bodega registró el SAP: maestro + alta se escriben en UNA transacción (ver `registrarAltaConMaestro`). Si otro
 * operador ya cerró el alta, o el SAP es de otro repuesto, lanza `ErrorAltaSap` y no escribe nada.
 */
export async function registrarAltaCreada(
  alta: Pick<AltaCodigo, 'id'>,
  sap: string,
  origen: OrigenSap,
  userId: string,
  userName: string,
): Promise<ResultadoMaestro> {
  return registrarAltaConMaestro({ altaId: alta.id, sap, origen, userId, userName })
}

export async function rechazarAlta(id: string, motivo: string, userId: string, userName: string): Promise<void> {
  const m = motivo.trim().slice(0, 300)
  if (!m) throw new Error('El motivo es obligatorio.')
  await updateDoc(doc(db, SOLICITUDES_COL, id), {
    estado: 'rechazada',
    motivoRechazo: m,
    rechazadaPor: userId,
    rechazadaPorNombre: userName,
    rechazadaAt: serverTimestamp(),
  })
}

/** «Volver a solicitar»: la rechazada vuelve a pendiente, con quien la pide ahora como solicitante. */
export async function reabrirAlta(
  id: string,
  datos: { cantidad: number; observaciones?: string; fotoUrl?: string },
  userId: string,
  userName: string,
): Promise<void> {
  const obs = datos.observaciones?.trim()
  await updateDoc(doc(db, SOLICITUDES_COL, id), {
    estado: 'pendiente',
    solicitadoPor: userId,
    solicitadoPorNombre: userName,
    cantidad: Math.min(MAX_CANTIDAD_ALTA, Math.max(1, Math.round(datos.cantidad || 1))),
    observaciones: obs ? obs : deleteField(),
    fotoUrl: datos.fotoUrl ? datos.fotoUrl : deleteField(),
    createdAt: serverTimestamp(),
    motivoRechazo: deleteField(),
    rechazadaPor: deleteField(),
    rechazadaPorNombre: deleteField(),
    rechazadaAt: deleteField(),
  })
}

export function useSolicitudes() {
  const [solicitudes, setSolicitudes] = useState<SolicitudItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, SOLICITUDES_COL), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSolicitudes(snap.docs.map((d) => docASolicitud(d.id, d.data())))
        setLoading(false)
      },
      (err) => {
        if (err?.code !== 'permission-denied') {
          logger.error('Error cargando solicitudes', err instanceof Error ? err : new Error(String(err)))
        }
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const crearSolicitud = useCallback(async (data: NuevaSolicitud, userId: string, userName: string) => {
    const payload: Record<string, unknown> = {
      codigoSAP: data.codigoSAP.trim(),
      textoBreve: data.textoBreve || '',
      cantidad: Math.max(1, Math.round(data.cantidad || 1)),
      estado: 'pendiente',
      solicitadoPor: userId,
      solicitadoPorNombre: userName,
      createdAt: serverTimestamp(),
    }
    const obs = data.observaciones?.trim()
    if (obs) payload.observaciones = obs // stripeado si vacío (Firestore sin ignoreUndefinedProperties)
    await addDoc(collection(db, SOLICITUDES_COL), payload)
  }, [])

  const avanzarEstado = useCallback(async (id: string, estado: SolicitudEstado, userId: string, userName: string) => {
    // Antes escribía solo { estado }: «Entregada» sin quién ni cuándo.
    const traza = estado === 'aprobada' || estado === 'entregada'
      ? { ...camposDeTraza(estado, userId, userName), [`${estado}At`]: serverTimestamp() }
      : {}
    await updateDoc(doc(db, SOLICITUDES_COL, id), { estado, ...traza })
  }, [])

  const pendientesCount = useMemo(
    () => solicitudes.filter((s) => s.estado === 'pendiente').length,
    [solicitudes],
  )

  return { solicitudes, loading, pendientesCount, crearSolicitud, avanzarEstado, registrarAltaCreada, rechazarAlta }
}
