/**
 * Service de Shoplogix — lee shifts desde Firestore.
 *
 * Ruta: `shoplogix/{plantSlug}/shifts/{dateKey}_{shiftId}/machines/{machineid}`
 *   plantSlug: 'chonchi' | 'yal'
 *
 * El Cloud Function `shoplogixSyncHttp` / `shoplogixSyncWakeup` escribe acá
 * cada pocos minutos durante horas de turno.
 */

import { collection, getDocs, getDocsFromServer, doc, getDoc, getDocFromServer, Timestamp, onSnapshot, query, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type {
  UpstreamMachineShift,
  UpstreamLineSnapshot,
  UpstreamProductionInterval,
  UpstreamMachineState,
} from './types'
import { buildLineSnapshot } from './shoplogixNormalizer'
import type { PlantSlug } from './shoplogixMachines'

// Firestore devuelve Timestamp — las funciones backend pueden escribir Date
// (Admin SDK los convierte a Timestamp automáticamente). Al leer, siempre es
// Timestamp — convertimos a Date para el schema interno.
type FirestoreData = Record<string, unknown>

function toDateSafe(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate()
  if (v instanceof Date) return v
  if (typeof v === 'string' || typeof v === 'number') return new Date(v)
  return new Date(0)  // fallback — doc corrupto
}

/** Convierte item de comments a string legible (Shoplogix a veces trae objetos). */
function coerceComment(c: unknown): string {
  if (typeof c === 'string') return c
  if (c && typeof c === 'object') {
    // Típicos campos que usa Shoplogix
    const obj = c as Record<string, unknown>
    const text = obj.text ?? obj.comment ?? obj.message ?? obj.body
    if (typeof text === 'string') return text
    return ''  // objeto sin texto útil → omitir
  }
  return ''
}

function deserializeInterval(raw: FirestoreData): UpstreamProductionInterval {
  return {
    startAt: toDateSafe(raw.startAt),
    endAt:   toDateSafe(raw.endAt),
    cycles:         Number(raw.cycles ?? 0),
    expectedCycles: Number(raw.expectedCycles ?? 0),
    total:          Number(raw.total ?? 0),
    expectedTotal:  Number(raw.expectedTotal ?? 0),
    ratio:          Number(raw.ratio ?? 0),
    color:          (raw.color as UpstreamProductionInterval['color']) ?? 'gray',
  }
}

function deserializeState(raw: FirestoreData): UpstreamMachineState {
  return {
    startAt:     toDateSafe(raw.startAt),
    endAt:       toDateSafe(raw.endAt),
    durationSec: Number(raw.durationSec ?? 0),
    type:        (raw.type as UpstreamMachineState['type']) ?? 'downtime',
    name:        String(raw.name ?? ''),
    reason:      String(raw.reason ?? ''),
    color:       String(raw.color ?? '#64748b'),
    isCurrent:   Boolean(raw.isCurrent),
  }
}

function deserializeShift(raw: FirestoreData): UpstreamMachineShift {
  const shiftStart = toDateSafe(raw.shiftStart)
  const shiftEnd   = toDateSafe(raw.shiftEnd)
  const states: UpstreamMachineState[] = Array.isArray(raw.states)
    ? raw.states.map(x => deserializeState(x as FirestoreData))
    : []

  // FIX-ON-READ para data legacy: los turnos sincronizados antes del fix
  // de bounds (PR #50) tienen `intervals[i].startAt` calculado desde
  // `summary.currentShiftStart` que apuntaba al turno EN CURSO al momento
  // del sync (no al consultado), por lo que los intervals quedan dateados
  // en un día distinto al del data real. Si detectamos esto, recomputamos
  // sus timestamps anclados al primer state.
  //
  // CRÍTICO — solo aplicar a docs `legacy`: para docs nuevos (syncDay,
  // scheduleSource='intervals') los timestamps de `intervals[]` ya vienen
  // correctos desde la API (`parseShoplogixTime(raw.start)` en el normalizer).
  // Aplicar el re-anchor a estos docs DESTRUYE timestamps correctos cuando
  // states[0] es un downtime largo que arranca antes del turno (caso real
  // 2026-04-29 T3 Yal: state[0] arranca a las 08:00 Apr-28 = inicio del
  // query window, intervals correctos a las 00:00-07:45 Apr-29 → re-anchor
  // los movía secuencialmente desde 08:00 Apr-28, vaciando el histograma).
  const rawIntervals: UpstreamProductionInterval[] = Array.isArray(raw.intervals)
    ? raw.intervals.map(x => deserializeInterval(x as FirestoreData))
    : []
  const scheduleSource = String(raw.scheduleSource ?? 'legacy') as 'intervals' | 'legacy'
  let intervals = rawIntervals
  if (scheduleSource === 'legacy' && rawIntervals.length > 0 && states.length > 0) {
    const firstStateDay = Math.floor(states[0]!.startAt.getTime() / 86_400_000)
    const firstIvlDay   = Math.floor(rawIntervals[0]!.startAt.getTime() / 86_400_000)
    if (firstStateDay !== firstIvlDay) {
      // ── Capa 3: telemetría FIX-ON-READ ──────────────────────────────────────
      // Cuenta cuántas veces se activa el re-anchor legacy. Si este log deja de
      // aparecer por 30 días → todos los docs legacy ya migraron y el bloque
      // entero puede eliminarse. Filtrar en Datadog/CloudWatch por "[SLX-FIX-ON-READ]".
      console.info(
        `[SLX-FIX-ON-READ] ${String(raw.machineName ?? raw.machineid)} ` +
        `${String(raw.dateKey)} ${String(raw.shiftId)}: re-anclando ` +
        `${rawIntervals.length} intervals (firstState=${states[0]!.startAt.toISOString()} ` +
        `≠ firstIvl=${rawIntervals[0]!.startAt.toISOString()})`,
      )
      // Re-ancla intervals al inicio del primer state (heurística: el primer
      // state usualmente arranca cuando empieza el tracking de producción).
      const intervalMs = rawIntervals.length > 1
        ? Math.max(60_000, rawIntervals[1]!.startAt.getTime() - rawIntervals[0]!.startAt.getTime())
        : 5 * 60_000
      const anchor = states[0]!.startAt.getTime()
      intervals = rawIntervals.map((it, i) => ({
        ...it,
        startAt: new Date(anchor + i * intervalMs),
        endAt:   new Date(anchor + (i + 1) * intervalMs),
      }))
    }
  }

  // Función de detección "Planned Downtime" — igual que en shoplogixNormalizer.ts.
  // type='break' + reason contains 'planned downtime' (case-insensitive).
  const isPlannedDT = (s: UpstreamMachineState) =>
    s.type === 'break' && s.reason.toLowerCase().includes('planned downtime')

  // Si los docs Firestore aún no traen shiftRuntime/breakdown (data legacy),
  // los recomputamos desde states. Si sí traen breakdown, lo completamos con
  // plannedDowntimeSec (campo nuevo que docs legacy no tienen → calcularlo).
  const computeBreakdownFromStates = () => {
    const b = {
      uptimeSec:          states.filter(s => s.type === 'uptime').reduce((a, s) => a + s.durationSec, 0),
      breakSec:           states.filter(s => s.type === 'break' && !isPlannedDT(s)).reduce((a, s) => a + s.durationSec, 0),
      plannedDowntimeSec: states.filter(isPlannedDT).reduce((a, s) => a + s.durationSec, 0),
      downtimeSec:        states.filter(s => s.type === 'downtime').reduce((a, s) => a + s.durationSec, 0),
      setupSec:           states.filter(s => s.type === 'setup').reduce((a, s) => a + s.durationSec, 0),
      totalTrackedSec:    0,
    }
    b.totalTrackedSec = b.uptimeSec + b.breakSec + b.plannedDowntimeSec + b.downtimeSec + b.setupSec
    return b
  }

  const breakdown = raw.shiftRuntimeBreakdown && typeof raw.shiftRuntimeBreakdown === 'object'
    ? (() => {
        const rd = raw.shiftRuntimeBreakdown as FirestoreData
        // plannedDowntimeSec puede faltar en docs legacy → recompútar desde states
        const hasPlannedDT = typeof rd.plannedDowntimeSec === 'number'
        const plannedDowntimeSec = hasPlannedDT
          ? Number(rd.plannedDowntimeSec)
          : states.filter(isPlannedDT).reduce((a, s) => a + s.durationSec, 0)
        const breakSec = hasPlannedDT
          ? Number(rd.breakSec ?? 0)
          : states.filter(s => s.type === 'break' && !isPlannedDT(s)).reduce((a, s) => a + s.durationSec, 0)
        return {
          uptimeSec:          Number(rd.uptimeSec ?? 0),
          breakSec,
          plannedDowntimeSec,
          downtimeSec:        Number(rd.downtimeSec ?? 0),
          setupSec:           Number(rd.setupSec ?? 0),
          totalTrackedSec:    Number(rd.totalTrackedSec ?? 0),
        }
      })()
    : computeBreakdownFromStates()

  // shiftRuntime SIEMPRE se recomputa:
  //   - Los docs legacy usaban `uptime / shiftDuration` (bounds incorrectos).
  //   - Docs intermedios: `uptime / totalTracked` (incluyendo post-shift Planned DT).
  //   - Fórmula correcta: excluir plannedDowntimeSec del denominador.
  const productiveSec = breakdown.totalTrackedSec - breakdown.plannedDowntimeSec
  const shiftRuntime = productiveSec > 0
    ? breakdown.uptimeSec / productiveSec
    : 0

  // scheduledStart/End: horario real del turno derivado de intervals.shift en syncDay.
  // En docs legacy (scheduleSource='legacy') coincide con shiftStart/End (bounds de consulta).
  // En docs nuevos (scheduleSource='intervals') refleja el horario real de Shoplogix.
  const scheduledStart = raw.scheduledStart != null ? toDateSafe(raw.scheduledStart) : shiftStart
  const scheduledEnd   = raw.scheduledEnd   != null ? toDateSafe(raw.scheduledEnd)   : shiftEnd

  // ── Capa 2: validación post-deserialización ──────────────────────────────────
  // Solo para docs nuevos (scheduleSource='intervals') cuyos timestamps ya son
  // correctos desde la API. Si algún interval cae fuera del rango del turno es
  // síntoma de un bug en el normalizer o de un timezone mismatch en Shoplogix.
  // No lanza error — solo loggea para diagnosticar silenciosamente en consola.
  if (scheduleSource === 'intervals' && intervals.length > 0) {
    const CAPA2_TOL_MS = 5 * 60_000
    const winLo = scheduledStart.getTime() - CAPA2_TOL_MS
    const winHi = scheduledEnd.getTime()   + CAPA2_TOL_MS
    const badCount = intervals.filter(iv => {
      const ts = iv.startAt.getTime()
      return ts < winLo || ts > winHi
    }).length
    if (badCount > 0) {
      const firstBad = intervals.find(iv => {
        const ts = iv.startAt.getTime()
        return ts < winLo || ts > winHi
      })
      console.warn(
        `[SLX-QUALITY] ${String(raw.machineName ?? raw.machineid)} ` +
        `${String(raw.shiftId)}: ${badCount}/${intervals.length} intervals fuera de ventana ` +
        `(${scheduledStart.toISOString()}→${scheduledEnd.toISOString()}). ` +
        `Primer fuera: ${firstBad!.startAt.toISOString()}`,
      )
    }
  }

  // dataQualityIssues: escritos por Capa 1 (Cloud Function) cuando detecta
  // intervals fuera de ventana. Propagamos al tipo para que la UI pueda
  // mostrar un badge "⚠ datos parciales" sin hacer un fetch adicional.
  const dataQualityIssues: string[] = Array.isArray(raw.dataQualityIssues)
    ? (raw.dataQualityIssues as unknown[]).filter((x): x is string => typeof x === 'string')
    : []

  return {
    machineid:           String(raw.machineid ?? ''),
    machineName:         String(raw.machineName ?? ''),
    machineType:         (raw.machineType as UpstreamMachineShift['machineType']) ?? 'other',
    dateKey:             String(raw.dateKey ?? ''),
    shiftId:             String(raw.shiftId ?? ''),
    shiftStart,
    shiftEnd,
    scheduledStart,
    scheduledEnd,
    scheduleSource:      String(raw.scheduleSource ?? 'legacy') as 'intervals' | 'legacy',
    totalCycles:         Number(raw.totalCycles ?? 0),
    expectedTotalCycles: Number(raw.expectedTotalCycles ?? 0),
    totalPieces:         Number(raw.totalPieces ?? 0),
    expectedTotalPieces: Number(raw.expectedTotalPieces ?? 0),
    overallRatio:        Number(raw.overallRatio ?? 0),
    actualRuntime:       Number(raw.actualRuntime ?? 0),
    expectedRuntime:     Number(raw.expectedRuntime ?? 0),
    runtimeVariance:     Number(raw.runtimeVariance ?? 0),
    shiftRuntime,
    shiftRuntimeBreakdown: breakdown,
    intervals,
    states,
    threshold:           Number(raw.threshold ?? 15),
    productionUnit:      String(raw.productionUnit ?? ''),
    comments:            Array.isArray(raw.comments) ? raw.comments.map(coerceComment).filter(Boolean) : [],
    source:              'shoplogix',
    sourceVersion:       Number(raw.sourceVersion ?? 1),
    syncedAt:            toDateSafe(raw.syncedAt),
    dataQualityIssues,
  }
}

export interface LoadShoplogixShiftResult {
  snapshot: UpstreamLineSnapshot | null
  syncedAt: Date | null
}

/**
 * Punto de tendencia para un turno histórico de una máquina.
 * Solo los campos necesarios para el gráfico — no carga states/intervals.
 */
export interface MachineTrendPoint {
  dateKey: string
  shiftId: string
  overallRatio: number   // 0..1+  (ritmo vs objetivo)
  shiftRuntime: number   // 0..1   (% uptime del turno productivo)
  totalCycles: number
}

/**
 * Carga tendencia histórica para UNA máquina en los últimos `nDays` turnos
 * del mismo tipo (`shiftId`). Usa reads paralelos — un getDoc por día.
 *
 * Diseñado para carga lazy al expandir una MachineRow:
 *   - Sin onSnapshot (datos históricos son estáticos)
 *   - Documentos faltantes se omiten silenciosamente
 *   - Devuelve array ordenado ascendente por dateKey (más antiguo primero)
 */
export async function loadMachineTrend(
  plantSlug: PlantSlug,
  machineid: string,
  dateKey: string,
  shiftId: string,
  nDays = 7,
): Promise<MachineTrendPoint[]> {
  const points: MachineTrendPoint[] = []
  const promises: Promise<void>[] = []

  for (let i = 0; i < nDays; i++) {
    const d = new Date(`${dateKey}T12:00:00`)
    d.setDate(d.getDate() - i)
    const dk = d.toISOString().slice(0, 10)
    const ref = doc(db, `shoplogix/${plantSlug}/shifts/${dk}_${shiftId}/machines/${machineid}`)
    promises.push(
      getDoc(ref).then(snap => {
        if (!snap.exists()) return
        const raw = snap.data() as FirestoreData
        // Usamos los campos almacenados directamente (sin full-deserialization).
        // shiftRuntime está calculado correctamente en los docs recientes.
        // Para docs muy legacy (pre-fix) el valor puede ser ~0, pero en tendencia
        // es aceptable — aparecerán como puntos bajos y el operador lo notará.
        points.push({
          dateKey: dk,
          shiftId,
          overallRatio: Number(raw.overallRatio ?? 0),
          shiftRuntime: Number(raw.shiftRuntime ?? 0),
          totalCycles:  Number(raw.totalCycles  ?? 0),
        })
      }).catch(() => { /* doc inaccesible — ignorar */ }),
    )
  }

  await Promise.all(promises)
  return points.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

/**
 * Suscripción en tiempo real al snapshot de un turno.
 * Llama a `onUpdate` cada vez que Firestore actualiza las máquinas del turno.
 * Devuelve la función `unsubscribe` para limpiar el listener.
 *
 * Usar en hooks de UI para el turno activo/live; `loadShoplogixShift` sigue
 * siendo adecuado para pre-carga mensual del calendario (datos históricos).
 *
 * @param plantSlug — 'chonchi' (default) | 'yal'
 */
export function subscribeShoplogixShift(
  dateKey: string,
  shiftId: string,
  plantSlug: PlantSlug = 'chonchi',
  onUpdate: (result: LoadShoplogixShiftResult) => void,
): () => void {
  const shiftDocId = `${dateKey}_${shiftId}`
  const machinesRef = collection(db, `shoplogix/${plantSlug}/shifts/${shiftDocId}/machines`)

  return onSnapshot(
    machinesRef,
    (snap) => {
      if (snap.empty) {
        onUpdate({ snapshot: null, syncedAt: null })
        return
      }
      const machines: ReturnType<typeof deserializeShift>[] = snap.docs.map(
        d => deserializeShift(d.data() as FirestoreData),
      )
      machines.sort((a, b) => a.machineName.localeCompare(b.machineName))
      const lineSnapshot = buildLineSnapshot({ dateKey, shiftId, machines })
      // syncedAt desde el primer doc (todas las máquinas se sincronizan juntas)
      const syncedAt = machines[0]?.syncedAt ?? null
      onUpdate({ snapshot: lineSnapshot, syncedAt })
    },
    (_error) => {
      // Error de red o permisos → informar pero no romper la UI
      onUpdate({ snapshot: null, syncedAt: null })
    },
  )
}

/**
 * Carga el snapshot de un turno desde Firestore (las 3 Evisceradoras).
 * Retorna `snapshot: null` si no hay documentos en la colección.
 *
 * @param plantSlug — 'chonchi' (default) | 'yal'
 */
export async function loadShoplogixShift(
  dateKey: string,
  shiftId: string,
  plantSlug: PlantSlug = 'chonchi',
  forceServer = false,
): Promise<LoadShoplogixShiftResult> {
  const shiftDocId = `${dateKey}_${shiftId}`
  const parentRef = doc(db, `shoplogix/${plantSlug}/shifts/${shiftDocId}`)
  const machinesRef = collection(db, `shoplogix/${plantSlug}/shifts/${shiftDocId}/machines`)

  // forceServer=true: bypasea el IndexedDB local cache.
  // Usar solo en recargas puntuales (no en el preloader mensual masivo).
  const fetcher = forceServer
    ? Promise.all([getDocFromServer(parentRef), getDocsFromServer(machinesRef)])
    : Promise.all([getDoc(parentRef),           getDocs(machinesRef)])
  const [parentSnap, machinesSnap] = await fetcher

  if (machinesSnap.empty) {
    return { snapshot: null, syncedAt: null }
  }

  const machines: UpstreamMachineShift[] = []
  machinesSnap.forEach(d => {
    machines.push(deserializeShift(d.data() as FirestoreData))
  })

  // Orden consistente: Evisceradora 1, 2, 3
  machines.sort((a, b) => a.machineName.localeCompare(b.machineName))

  const snapshot = buildLineSnapshot({ dateKey, shiftId, machines })

  const parentData = parentSnap.exists() ? parentSnap.data() : null
  const syncedAt = parentData?.lastSyncAt ? toDateSafe(parentData.lastSyncAt) : null

  return { snapshot, syncedAt }
}

/** Shift IDs que puede devolver Shoplogix — en orden cronológico dentro de un día. */
const CANDIDATE_SHIFT_IDS: string[] = ['Turno 1', 'Turno 2', 'Turno 3', 'Turno día', 'Turno noche']

/**
 * Devuelve los IDs de documentos shift que existen en Firestore para un mes completo.
 *
 * Problema: el CF escribe sólo en `shifts/{id}/machines` (subcolección) sin crear
 * el documento padre. Queries sobre la colección `shifts` devuelven vacío aunque
 * haya datos. Tampoco funciona where(documentId(), '>=' / '<') en subcolecciones.
 *
 * Solución: reutilizar listShoplogixShiftIdsForDay (que lee machines directamente)
 * para todos los días del mes en paralelo real (Promise.all).
 * 30 días × 5 candidatos = 150 reads, pero todos simultáneos → ~400 ms total.
 *
 * Retorna array de doc IDs, ej: ['2026-04-29_Turno 2', '2026-04-30_Turno 2'].
 * Retorna null sólo si hay error de red para que el caller haga fallback.
 */
export async function listShoplogixShiftDocIdsForMonth(
  year: number,
  month: number,   // 0-indexed (0 = enero, 11 = diciembre)
  plantSlug: PlantSlug,
): Promise<string[] | null> {
  try {
    const daysInMonth  = new Date(year, month + 1, 0).getDate()
    const monthPrefix  = `${year}-${String(month + 1).padStart(2, '0')}`

    const perDay = Array.from({ length: daysInMonth }, (_, i) => {
      const dk = `${monthPrefix}-${String(i + 1).padStart(2, '0')}`
      return listShoplogixShiftIdsForDay(dk, plantSlug)
        .then(ids => ids.map(id => `${dk}_${id}`))
        .catch(() => [] as string[])
    })

    const results = await Promise.all(perDay)
    return results.flat()
  } catch {
    return null
  }
}

/**
 * Devuelve los shiftIds disponibles en Firestore para un día dado.
 * Verifica existencia con una lectura de 1 doc por candidato (lecturas en paralelo).
 * Útil para construir navegación prev/next cuando no hay Excel.
 */
export async function listShoplogixShiftIdsForDay(
  dateKey: string,
  plantSlug: PlantSlug = 'chonchi',
): Promise<string[]> {
  const checks = CANDIDATE_SHIFT_IDS.map(async (shiftId) => {
    const ref = collection(db, `shoplogix/${plantSlug}/shifts/${dateKey}_${shiftId}/machines`)
    const snap = await getDocs(query(ref, limit(1))).catch(() => null)
    return snap && !snap.empty ? shiftId : null
  })
  const results = await Promise.all(checks)
  return results.filter((id): id is string => id !== null)
}
