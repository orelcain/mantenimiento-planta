import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import { generateId } from '@/lib/utils'
import type { ParoEtapa } from '@/types'

/**
 * Servicio de paros de etapa (colección plana `paros`). Captura manual de
 * detenciones de las etapas no instrumentadas de la línea, para cuantificar la
 * disponibilidad del área. Ver docs/OEE_AREA_ROADMAP.md (Fase B).
 */

const COLLECTION = 'paros'

function toDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  return new Date()
}

function mapParo(id: string, data: Record<string, unknown>): ParoEtapa {
  return {
    id,
    plantLineId: String(data.plantLineId ?? ''),
    etapa: String(data.etapa ?? ''),
    duracionMin: Number(data.duracionMin) || 0,
    causa: String(data.causa ?? ''),
    fecha: toDate(data.fecha),
    tecnico: data.tecnico as string | undefined,
    shiftId: data.shiftId as string | undefined,
    origen: (data.origen as ParoEtapa['origen']) ?? 'manual',
    stopKey: data.stopKey as string | undefined,
    machineid: data.machineid as string | undefined,
    categoria: data.categoria as ParoEtapa['categoria'],
    createdAt: toDate(data.createdAt),
  }
}

/**
 * Id determinístico de un paro detectado por el sensor. Sirve de doc id, así
 * que re-anotar el mismo paro SOBREESCRIBE en vez de duplicar.
 * Firestore no acepta '/' en un doc id; los espacios del shiftId se normalizan.
 */
export function sensorStopKey(args: {
  plantSlug: string
  dateKey: string
  shiftId: string
  machineid: string
  startAt: Date
}): string {
  const shift = args.shiftId.replace(/[^\w-]+/g, '-')
  return `slx__${args.plantSlug}__${args.dateKey}__${shift}__${args.machineid}__${args.startAt.getTime()}`
}

/**
 * Anota la CAUSA de un paro que el sensor ya midió.
 *
 * Se guarda en `paros` (misma colección que los paros de etapa manuales) con
 * `origen: 'shoplogix'`, porque el objeto es el mismo: un paro con su causa.
 * Lo que cambia es quién lo midió — y ese flag es lo que evita que el OEE de
 * área vuelva a descontar minutos que la Disponibilidad del sensor ya descontó.
 */
export async function annotateSensorStop(args: {
  plantLineId: string
  plantSlug: string
  dateKey: string
  shiftId: string
  machineid: string
  machineName: string
  startAt: Date
  durationMin: number
  causa: string
  categoria: NonNullable<ParoEtapa['categoria']>
  tecnico?: string
}): Promise<string> {
  const stopKey = sensorStopKey(args)
  const payload: Record<string, unknown> = {
    plantLineId: args.plantLineId,
    etapa: args.machineName,
    duracionMin: args.durationMin,
    causa: args.causa,
    categoria: args.categoria,
    fecha: Timestamp.fromDate(args.startAt),
    shiftId: args.shiftId,
    origen: 'shoplogix',
    stopKey,
    machineid: args.machineid,
    createdAt: serverTimestamp(),
  }
  if (args.tecnico) payload.tecnico = args.tecnico
  await setDoc(doc(db, COLLECTION, stopKey), payload)
  return stopKey
}

// Paros de una línea/área (where simple sobre plantLineId → índice de campo único auto).
export async function getParosByPlantLine(plantLineId: string): Promise<ParoEtapa[]> {
  const q = query(collection(db, COLLECTION), where('plantLineId', '==', plantLineId))
  const snap = await getDocs(q)
  const paros = snap.docs.map((d) => mapParo(d.id, d.data() as Record<string, unknown>))
  return paros.sort((a, b) => b.fecha.getTime() - a.fecha.getTime())
}

// Registrar un paro de etapa.
export async function addParo(entry: Omit<ParoEtapa, 'id' | 'createdAt'>): Promise<void> {
  const id = generateId()
  const payload: Record<string, unknown> = {
    plantLineId: entry.plantLineId,
    etapa: entry.etapa,
    duracionMin: entry.duracionMin,
    causa: entry.causa,
    fecha: Timestamp.fromDate(entry.fecha),
    createdAt: serverTimestamp(),
  }
  if (entry.tecnico) payload.tecnico = entry.tecnico
  if (entry.shiftId) payload.shiftId = entry.shiftId
  await setDoc(doc(db, COLLECTION, id), payload)
}

// Eliminar un paro (admin).
export async function deleteParo(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
