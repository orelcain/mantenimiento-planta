/**
 * Audit trail de cambios en GraderPhysicalConfig.
 *
 * Cada vez que setPhysicalConfig muta un valor relevante, el hook
 * `useConfigChangeLogger` genera un diff mínimo {field, prevValue, nextValue}
 * y persiste un doc en la colección `graderConfigChangeLog`.
 *
 * El log sirve para:
 *   - Ver quién cambió qué y cuándo (auditoría)
 *   - Detectar regresiones ("ayer estaba en 0.7, hoy en 1.2 → ¿quién?")
 *   - Revertir cambios puntuales sin restaurar toda la config
 *
 * NO guarda el objeto completo — sólo el diff. Un cambio como
 * "avgSalmonLengthCm 55 → 60" genera 1 doc, no un snapshot de toda la config.
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from '@/services/firestoreTracked'
import { db } from '../firebase'

const COLLECTION = 'graderConfigChangeLog'

export interface ConfigChangeEntry {
  id: string
  /** Campo modificado, en dot-path: 'avgSalmonLengthCm' | 'belts.main.speedMps' | 'flipperDelayOpenMs' */
  field: string
  /** Valor previo (serializable) */
  prevValue: unknown
  /** Valor nuevo (serializable) */
  nextValue: unknown
  /** Contexto humano opcional: "Aplicado desde TachModal" */
  reason?: string
  /** UID del usuario */
  changedBy: string
  /** ISO timestamp del cambio */
  changedAt: string
}

function newId(): string {
  return `chg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function deepCleanUndefined<T>(value: T): T {
  if (value === undefined) return value
  if (Array.isArray(value)) {
    return value.map((v) => deepCleanUndefined(v)).filter((v) => v !== undefined) as T
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, deepCleanUndefined(v)] as const)
      .filter(([, v]) => v !== undefined)
    return Object.fromEntries(entries) as T
  }
  return value
}

/**
 * Persiste un conjunto de cambios. Si `changes` está vacío, no hace nada.
 * Los cambios se guardan en batch (un doc por cambio) para permitir query
 * granular después (ej: "todos los cambios de avgSalmonLengthCm en el mes").
 */
export async function logConfigChanges(
  changes: Array<Omit<ConfigChangeEntry, 'id' | 'changedAt'>>,
): Promise<ConfigChangeEntry[]> {
  if (changes.length === 0) return []
  const now = new Date().toISOString()
  const saved: ConfigChangeEntry[] = []

  await Promise.all(
    changes.map(async (c) => {
      const entry: ConfigChangeEntry = { ...c, id: newId(), changedAt: now }
      await setDoc(
        doc(db, COLLECTION, entry.id),
        deepCleanUndefined({ ...entry, _createdAt: serverTimestamp() }),
      )
      saved.push(entry)
    }),
  )

  return saved
}

/**
 * Retorna los últimos N cambios registrados (más recientes primero).
 */
export async function listRecentConfigChanges(max = 10): Promise<ConfigChangeEntry[]> {
  const qRef = query(collection(db, COLLECTION), orderBy('changedAt', 'desc'), limit(max))
  const snap = await getDocs(qRef)
  return snap.docs.map((d) => d.data() as ConfigChangeEntry)
}

/**
 * Diff superficial entre dos objetos. Devuelve lista de {field, prev, next}
 * para los primitives y arrays/objetos que cambiaron (no hace recursión profunda
 * para arrays/objetos — los trata como "cambió" si son referencialmente distintos
 * y no deep-equal JSON).
 *
 * Se limita a los campos conocidos de GraderPhysicalConfig que el usuario
 * puede cambiar desde la UI (no se loguea cambios internos como `belts[0].vfd.vfdCurrentHz`
 * que se actualizan automáticamente).
 */
const TRACKED_FIELDS: readonly string[] = [
  // Producto
  'avgSalmonLengthCm',
  'avgSalmonWidthCm',
  'pocketCount',
  'species',
  // Timing flipper SW
  'flipperDelayOpenMs',
  'flipperMinOpenTimeMs',
  'flipperDelayCloseMs',
  'flipperMechanicalResetS',
  'flipperMechanicalMeasuredAt',
  'flipperHeightAboveBeltMm',
  'flipperResetTimeSec',
  'flipperPaddleLengthMm',
  // Gate/batch
  'delayBeforeGateCloseMs',
  'delayGateCloseMs',
  'minGateOpenMs',
  'maxBinWeightG',
  // Z2
  'kFactor',
  'avgFishSpacingOnZetaBeltM',
]

export function diffPhysicalConfig<T extends Record<string, any>>(
  prev: T,
  next: T,
): Array<{ field: string; prevValue: unknown; nextValue: unknown }> {
  const diffs: Array<{ field: string; prevValue: unknown; nextValue: unknown }> = []

  for (const field of TRACKED_FIELDS) {
    const pv = prev[field]
    const nv = next[field]
    if (pv === nv) continue
    // Objeto/array: comparar por JSON (shallow safety)
    if (typeof pv === 'object' || typeof nv === 'object') {
      if (JSON.stringify(pv) !== JSON.stringify(nv)) {
        diffs.push({ field, prevValue: pv, nextValue: nv })
      }
      continue
    }
    diffs.push({ field, prevValue: pv, nextValue: nv })
  }

  // Belts — trackear speedMps y lengthMeters por beltId (sin loguear vfd interno)
  if (Array.isArray(prev.belts) && Array.isArray(next.belts)) {
    for (const nb of next.belts) {
      const pb = prev.belts.find((b: any) => b.beltId === nb.beltId)
      if (!pb) continue
      if (pb.speedMps !== nb.speedMps) {
        diffs.push({
          field: `belts.${nb.beltId}.speedMps`,
          prevValue: pb.speedMps,
          nextValue: nb.speedMps,
        })
      }
      if (pb.lengthMeters !== nb.lengthMeters) {
        diffs.push({
          field: `belts.${nb.beltId}.lengthMeters`,
          prevValue: pb.lengthMeters,
          nextValue: nb.lengthMeters,
        })
      }
      if (pb.calibrationStatus !== nb.calibrationStatus) {
        diffs.push({
          field: `belts.${nb.beltId}.calibrationStatus`,
          prevValue: pb.calibrationStatus,
          nextValue: nb.calibrationStatus,
        })
      }
    }
  }

  // flipperPositions: registrar si cambió alguna distancia (resumido)
  if (Array.isArray(prev.flipperPositions) && Array.isArray(next.flipperPositions)) {
    for (const np of next.flipperPositions) {
      const pp = prev.flipperPositions.find((p: any) => p.gateNumber === np.gateNumber)
      if (!pp) continue
      if (pp.distanceFromSensorMeters !== np.distanceFromSensorMeters) {
        diffs.push({
          field: `flipperPositions.gate${np.gateNumber}.distanceFromSensorMeters`,
          prevValue: pp.distanceFromSensorMeters,
          nextValue: np.distanceFromSensorMeters,
        })
      }
    }
  }

  return diffs
}

/**
 * Etiqueta legible de un campo (para renderizar el historial en UI).
 */
export function labelForField(field: string): string {
  const map: Record<string, string> = {
    avgSalmonLengthCm: 'Largo salmón (cm)',
    avgSalmonWidthCm:  'Ancho salmón (cm)',
    pocketCount:       'Pockets activos',
    species:           'Especie',
    flipperDelayOpenMs: 'Delay apertura flipper (ms)',
    flipperMinOpenTimeMs: 'Tiempo mín. flipper abierto (ms)',
    flipperDelayCloseMs: 'Delay cierre flipper (ms)',
    flipperMechanicalResetS: 'Reset mecánico flipper (s)',
    flipperMechanicalMeasuredAt: 'Fecha medición reset',
    flipperHeightAboveBeltMm: 'Altura paleta (mm)',
    flipperResetTimeSec: 'Reset legacy (s)',
    flipperPaddleLengthMm: 'Largo paleta (mm)',
    delayBeforeGateCloseMs: 'Delay antes cierre gate (ms)',
    delayGateCloseMs: 'Duración cierre gate (ms)',
    minGateOpenMs: 'Mín. gate abierto (ms)',
    maxBinWeightG: 'Peso máx. bin (g)',
    kFactor: 'Factor k Z2',
    avgFishSpacingOnZetaBeltM: 'Espaciado peces Z-belt (m)',
  }
  if (map[field]) return map[field]
  if (field.startsWith('belts.')) {
    const [, beltId, prop] = field.split('.')
    return `${beltId} — ${prop}`
  }
  if (field.startsWith('flipperPositions.')) {
    const match = field.match(/gate(\d+)\.(.+)/)
    if (match) return `Gate ${match[1]} — ${match[2]}`
  }
  return field
}
