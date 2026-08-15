/**
 * pinShiftEnd.ts — fijar a mano la hora de cierre de un turno.
 *
 * El monitor calcula el cierre solo, de la mediana de los turnos anteriores.
 * Eso cubre el caso normal y no hay que mantenerlo. Pero a veces la persona que
 * mira la pantalla SABE algo que el historial todavía no: que hoy se corta
 * antes, que el turno nuevo va hasta tal hora. Este módulo guarda esa decisión
 * con la marca `endPinned`, y el backend la respeta por encima del historial.
 *
 * ⚠ Escribe en `graderModuleConfigs`, no en el doc del monitor: aquél tiene
 * `allow write: if false` en las reglas — NADIE puede tocarlo desde el
 * navegador, y eso no se cambia. Las reglas de `graderModuleConfigs` exigen
 * supervisor, así que la comprobación de rol de la UI no es la única defensa.
 */

import { doc, getDoc, setDoc, serverTimestamp } from '@/services/firestoreTracked'
import { db } from '../firebase'
import type { PlantSlug } from './shoplogixMachines'

const COLLECTION = 'graderModuleConfigs'

/**
 * Cada `plantSlug` del monitor es UNA línea. Mismo mapeo que usa el backend
 * para leer la config: si los dos no coinciden, se guardaría en un documento
 * que nadie lee.
 */
const CONFIG_DOC_ID: Record<string, string> = {
  chonchi: 'global',
  yal: 'yal-eviscerado',
  filete: 'chonchi-filete',
}

/** "Turno Dia" y "Turno día" son el mismo turno. Igual que en el backend. */
function normShiftName(s: string): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export interface ShiftScheduleEntry {
  shiftId: string
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  endPinned?: boolean
  quota?: { value: number; unit: 'kg' | 'pieces' }
}

/**
 * Fija la hora de cierre del turno `shiftName` de una línea.
 *
 * Si el turno no existía en la config lo crea, tomando la hora de inicio del
 * turno real — un turno recién dado de alta por Shoplogix (el segundo de
 * Filete, por ejemplo) no está en ninguna config todavía.
 */
export async function pinShiftEnd(params: {
  plantSlug: PlantSlug | string
  shiftName: string
  endHour: number
  endMinute: number
  /** Inicio real del turno, para crear la entrada si no existía. */
  startAtIso?: string | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Sin config conocida para la planta ${params.plantSlug}`)
  if (!params.shiftName) throw new Error('Falta el nombre del turno')

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const actual: ShiftScheduleEntry[] = Array.isArray(snap.data()?.shiftSchedule)
    ? (snap.data()!.shiftSchedule as ShiftScheduleEntry[])
    : []

  const idx = actual.findIndex((e) => normShiftName(e.shiftId) === normShiftName(params.shiftName))
  const inicio = params.startAtIso ? new Date(params.startAtIso) : null
  // Wall-clock, como el resto del módulo.
  const startHour = idx >= 0 ? actual[idx]!.startHour : (inicio ? inicio.getUTCHours() : 0)
  const startMinute = idx >= 0 ? actual[idx]!.startMinute : (inicio ? inicio.getUTCMinutes() : 0)

  const entrada: ShiftScheduleEntry = {
    ...(idx >= 0 ? actual[idx]! : {}),
    shiftId: idx >= 0 ? actual[idx]!.shiftId : params.shiftName,
    startHour,
    startMinute,
    endHour: params.endHour,
    endMinute: params.endMinute,
    endPinned: true,
  }

  const siguiente = idx >= 0
    ? actual.map((e, i) => (i === idx ? entrada : e))
    : [...actual, entrada]

  await setDoc(ref, { shiftSchedule: siguiente, updatedAt: serverTimestamp() }, { merge: true })
}

/** Quita el pin: el cierre vuelve a salir del historial. */
export async function unpinShiftEnd(params: {
  plantSlug: PlantSlug | string
  shiftName: string
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) return
  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const actual: ShiftScheduleEntry[] = Array.isArray(snap.data()?.shiftSchedule)
    ? (snap.data()!.shiftSchedule as ShiftScheduleEntry[])
    : []
  const siguiente = actual.map((e) =>
    normShiftName(e.shiftId) === normShiftName(params.shiftName) ? { ...e, endPinned: false } : e,
  )
  await setDoc(ref, { shiftSchedule: siguiente, updatedAt: serverTimestamp() }, { merge: true })
}

/**
 * Guarda el set point operacional de la línea, con su fuente.
 *
 * Orel lo midió cronómetro en mano (silletas por minuto en la alimentación) y
 * vivía hardcodeado en el código: parecía dato del PLC. Acá queda CON fecha,
 * método y quién — «la fuente es parte del dato»— y el backend lo publica en
 * el payload del monitor. El máximo funcional NO se edita: sale del manual.
 *
 * El historial se acumula: cada cambio queda, así «¿desde cuándo corre a X?»
 * tiene respuesta sin ir a buscar en git.
 */
export async function setMonitorSetPoint(params: {
  plantSlug: PlantSlug | string
  cpm: number
  metodo: string
  por: string | null
}): Promise<void> {
  const docId = CONFIG_DOC_ID[params.plantSlug]
  if (!docId) throw new Error(`Línea sin config: ${params.plantSlug}`)
  if (!(params.cpm > 0) || params.cpm > 60) throw new Error('Set point fuera de rango')

  const ref = doc(db, COLLECTION, docId)
  const snap = await getDoc(ref)
  const previo = snap.data()?.monitorSetPoint ?? null
  const hoy = new Date()
  const dateKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
  const nuevo = {
    cpm: params.cpm,
    medidoEl: dateKey,
    metodo: params.metodo.trim() || null,
    por: params.por,
  }
  const historial = Array.isArray(snap.data()?.monitorSetPointHistorial)
    ? snap.data()!.monitorSetPointHistorial
    : []
  await setDoc(ref, {
    monitorSetPoint: nuevo,
    monitorSetPointHistorial: [...historial, ...(previo ? [previo] : [])].slice(-20),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}
