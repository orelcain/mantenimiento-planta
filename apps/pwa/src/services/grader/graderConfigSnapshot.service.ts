import { doc, collection, getDocs, setDoc, updateDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { GateAssignment } from './types'
import { puertasAdoptadas, reescribirEnTodos } from './graderAdoptarSeteo'

export interface ConfigDiff {
  gateNumber: number
  field: 'assignedCalibre' | 'assignedQuality' | 'assignedConservation' | 'assignedProduct' | 'active'
  before: unknown
  after: unknown
}

export interface GateConfigSnapshot {
  id: string
  shiftDocId: string   // `${dateKey}__${shiftId}`
  at: string           // ISO timestamp del cambio
  changedBy: { uid: string; name: string }
  reason?: string
  gates: GateAssignment[]
  changes: ConfigDiff[]
  synthetic?: boolean  // true si fue inferido por el reclasificador (FASE 26)
}

const SUBCOLLECTION = 'configHistory'

/** Calcula diff entre dos estados completos de gates */
export function computeGatesDiff(before: GateAssignment[], after: GateAssignment[]): ConfigDiff[] {
  const diffs: ConfigDiff[] = []
  const byNumber = new Map(before.map(g => [g.gateNumber, g]))
  for (const next of after) {
    const prev = byNumber.get(next.gateNumber)
    if (!prev) continue
    const fields: Array<keyof GateAssignment> = [
      'assignedCalibre', 'assignedQuality', 'assignedConservation', 'assignedProduct', 'active',
    ]
    for (const f of fields) {
      if (prev[f] !== next[f]) {
        diffs.push({ gateNumber: next.gateNumber, field: f as ConfigDiff['field'], before: prev[f], after: next[f] })
      }
    }
  }
  return diffs
}

/** Lista snapshots de un turno ordenados cronológicamente (asc) */
export async function listSnapshots(shiftDocId: string): Promise<GateConfigSnapshot[]> {
  const ref = collection(db, 'graderShifts', shiftDocId, SUBCOLLECTION)
  const q = query(ref, orderBy('at', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => d.data() as GateConfigSnapshot)
}

export async function getLatestSnapshot(shiftDocId: string): Promise<GateConfigSnapshot | null> {
  const all = await listSnapshots(shiftDocId)
  const last = all[all.length - 1]
  return last ?? null
}

/**
 * Guarda snapshot solo si hay cambios reales respecto al anterior.
 * Retorna null si no hubo cambios (idempotente).
 */
export async function saveConfigSnapshot(
  shiftDocId: string,
  newGates: GateAssignment[],
  user: { uid: string; name: string },
  reason?: string,
): Promise<GateConfigSnapshot | null> {
  const previous = await getLatestSnapshot(shiftDocId)
  const changes = previous ? computeGatesDiff(previous.gates, newGates) : []
  if (previous && changes.length === 0) return null

  const snapshot: GateConfigSnapshot = {
    id: crypto.randomUUID(),
    shiftDocId,
    at: new Date().toISOString(),
    changedBy: user,
    gates: [...newGates],
    changes,
    ...(reason ? { reason } : {}),
  }
  const ref = doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, snapshot.id)
  await setDoc(ref, snapshot)
  return snapshot
}

/**
 * Registrar un cambio que la máquina hizo a una hora dada (detectado en el
 * Excel): el snapshot lleva ese `at`, no "ahora", para que la pureza y las
 * causas P0 juzguen el antes y el después con la config correcta.
 */
export async function saveConfigSnapshotAt(
  shiftDocId: string,
  /** Config vigente a esa hora (de la línea de tiempo), base del diff. */
  baseGates: GateAssignment[],
  newGates: GateAssignment[],
  user: { uid: string; name: string },
  reason: string,
  atIso: string,
): Promise<GateConfigSnapshot> {
  const changes = computeGatesDiff(baseGates, newGates)
  const all = await listSnapshots(shiftDocId)
  // Si el cambio queda ANTES de todos los snapshots, la línea de tiempo perdería
  // la config previa (antes del primero rige gatesUsed, que es la MÁS RECIENTE).
  // Se deja una línea base un minuto antes con la config vigente hasta entonces.
  if (all.length === 0 || atIso < all[0]!.at) {
    const base: GateConfigSnapshot = {
      id: crypto.randomUUID(), shiftDocId, at: new Date(Date.parse(atIso) - 60_000).toISOString(),
      changedBy: user, gates: [...baseGates], changes: [], reason: 'Config inicial (vigente antes del primer cambio registrado)',
    }
    await setDoc(doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, base.id), base)
  }
  const snapshot: GateConfigSnapshot = {
    id: crypto.randomUUID(),
    shiftDocId,
    at: atIso,
    changedBy: user,
    gates: [...newGates],
    changes,
    reason,
  }
  await setDoc(doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, snapshot.id), snapshot)
  // El cambio rige desde esa hora en adelante: los snapshots POSTERIORES que no
  // tocaron esas puertas (el inicial de las 23:38 guardado "ahora", una
  // adopción, otro cambio) tienen que llevarlo también, si no lo pisan.
  // Medido 08-09: registrar G10→8-10 a las 23:30 con el inicial a las 23:38
  // dejaba a G10 en 10-12 otra vez desde las 00:00.
  const tocadas = new Set(changes.map((c) => c.gateNumber))
  if (tocadas.size === 0) return snapshot
  const baseBy = new Map(baseGates.map((g) => [g.gateNumber, g]))
  const nuevoBy = new Map(newGates.map((g) => [g.gateNumber, g]))
  const mismo = (a: GateAssignment | undefined, b: GateAssignment | undefined) =>
    !!a && !!b && a.assignedCalibre === b.assignedCalibre && a.assignedQuality === b.assignedQuality && a.active === b.active
  for (const later of all) {
    if (later.at <= atIso || later.id === snapshot.id) continue
    let cambio = false
    const gates = later.gates.map((g) => {
      if (!tocadas.has(g.gateNumber) || !mismo(g, baseBy.get(g.gateNumber))) return g
      cambio = true
      return { ...g, ...nuevoBy.get(g.gateNumber)! }
    })
    if (cambio) await updateDoc(doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, later.id), { gates })
  }
  return snapshot
}

/**
 * Adoptar lo que la máquina hace: si el último snapshot es el INICIAL (sin
 * cambios manuales) se corrige en su lugar, porque el seteo "siempre fue" el de
 * la máquina y no un cambio a esa hora. Si ya hubo cambios a mano, se agrega un
 * snapshot normal: lo que alguien seteó a propósito no se reescribe.
 */
export async function adoptarSeteoMaquina(
  shiftDocId: string,
  newGates: GateAssignment[],
  user: { uid: string; name: string },
  reason: string,
  opts: {
    /**
     * Turno CERRADO: la máquina tuvo ese programa todo el turno, así que la
     * puerta se reescribe en TODOS los snapshots (un snapshot «ahora» regiría
     * solo desde ahora y dejaría el turno juzgado con el seteo viejo).
     */
    turnoCerrado?: boolean
    /** Config de la que parte `newGates` (para saber qué puertas cambian). */
    baseGates?: GateAssignment[]
  } = {},
): Promise<GateConfigSnapshot | null> {
  const previous = await getLatestSnapshot(shiftDocId)
  if (opts.turnoCerrado && previous) {
    const all = await listSnapshots(shiftDocId)
    const adoptadas = puertasAdoptadas(opts.baseGates ?? previous.gates, newGates)
    if (adoptadas.size === 0) return previous
    for (const r of reescribirEnTodos(all, adoptadas)) {
      if (!r.cambio) continue
      const esUltimo = r.id === previous.id
      await updateDoc(doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, r.id), esUltimo ? { gates: r.gates, reason: `${previous.reason ? previous.reason + ' · ' : ''}${reason}`, changedBy: user } : { gates: r.gates })
    }
    return { ...previous, gates: reescribirEnTodos([previous], adoptadas)[0]!.gates, reason, changedBy: user }
  }
  if (previous && !previous.synthetic && previous.changes.length === 0) {
    const fixed: GateConfigSnapshot = { ...previous, gates: [...newGates], reason, changedBy: user }
    await setDoc(doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, previous.id), fixed)
    return fixed
  }
  return saveConfigSnapshot(shiftDocId, newGates, user, reason)
}

/**
 * Snapshot de tipo "sintético" — escrito por el reclasificador (FASE 26)
 * cuando infiere la config desde los pieceRecords históricos.
 */
export async function saveSyntheticSnapshot(
  shiftDocId: string,
  snapshot: Omit<GateConfigSnapshot, 'id'>,
): Promise<GateConfigSnapshot> {
  const id = crypto.randomUUID()
  const full: GateConfigSnapshot = { ...snapshot, id, synthetic: true }
  const ref = doc(db, 'graderShifts', shiftDocId, SUBCOLLECTION, id)
  await setDoc(ref, full)
  return full
}

/**
 * Devuelve el snapshot vigente en un timestamp dado (el más reciente ≤ ts).
 * Si no hay ninguno, retorna null (caller debe usar config default del summary).
 */
export function getConfigAtTimestamp(
  snapshots: GateConfigSnapshot[],
  ts: string,
): GateConfigSnapshot | null {
  const eligible = snapshots.filter(s => s.at <= ts)
  const last = eligible[eligible.length - 1]
  return last ?? null
}
