/**
 * Service de Shoplogix — lee shifts desde Firestore.
 *
 * Ruta: `shoplogix/{plantSlug}/shifts/{dateKey}_{shiftId}/machines/{machineid}`
 *   plantSlug: 'chonchi' | 'yal'
 *
 * El Cloud Function `shoplogixSyncHttp` / `shoplogixSyncWakeup` escribe acá
 * cada pocos minutos durante horas de turno.
 */

import { collection, getDocs, getDocsFromServer, doc, getDoc, getDocFromServer, Timestamp, onSnapshot, query, limit, where, documentId } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type {
  UpstreamMachineShift,
  UpstreamLineSnapshot,
  UpstreamProductionInterval,
  UpstreamMachineState,
  UpstreamShiftComment,
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

/**
 * Deserializa un comentario guardado en Firestore a `UpstreamShiftComment`.
 *
 * Dos shapes posibles en docs reales:
 *   - LEGADO (docs sincronizados antes de este fix): string plano, sin
 *     start/end/reason. Se usa el rango del turno (`fallbackStart/End`) como
 *     placeholder — el comentario sigue visible, solo sin correlación a un
 *     state específico (queda "huérfano" al intentar emparejar en la UI).
 *   - NUEVO: objeto normalizado por `normalizeComments` en el sync
 *     (`{key,text,startAt,endAt,reasonField,reasonValue}`, con Dates ya
 *     convertidos por Firestore a Timestamp) o el shape crudo de Shoplogix
 *     si algún doc viejo quedó con el objeto sin procesar.
 */
function deserializeComment(c: unknown, fallbackStart: Date, fallbackEnd: Date): UpstreamShiftComment | null {
  if (typeof c === 'string') {
    const text = c.trim()
    return text ? { key: text, text, startAt: fallbackStart, endAt: fallbackEnd, reasonField: '', reasonValue: '' } : null
  }
  if (!c || typeof c !== 'object') return null
  const obj = c as Record<string, unknown>
  const text = (obj.text ?? obj.comment ?? obj.message ?? obj.body) as string | undefined
  if (typeof text !== 'string' || !text.trim()) return null
  // Campos ya normalizados (startAt/endAt/reasonField/reasonValue) tienen prioridad;
  // si el doc quedó con el shape crudo de Shoplogix (start/end/matchField/matchValue,
  // ej. de un sync intermedio), se leen esos como fallback.
  const startRaw = obj.startAt ?? obj.start
  const endRaw   = obj.endAt   ?? obj.end
  return {
    key: String(obj.key ?? obj.displayId ?? `${text}|${String(startRaw ?? '')}`),
    text,
    startAt: startRaw != null ? toDateSafe(startRaw) : fallbackStart,
    endAt:   endRaw   != null ? toDateSafe(endRaw)   : fallbackEnd,
    reasonField: String(obj.reasonField ?? obj.matchField ?? ''),
    reasonValue: String(obj.reasonValue ?? obj.matchValue ?? ''),
  }
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

/**
 * Rollup oficial de Shoplogix (horario real del turno, especie en curso,
 * target de piezas por máquina), capturado por `fetchOfficialRollup` en
 * `functions/shoplogix/sync.js` — SOLO existe para el turno VIGENTE (nunca en
 * backfill/históricos: no es fiable para reconstrucción, ver comentario en el
 * sync). Mismos campos que consume `turnoBrief.js` para los briefs de Telegram
 * — mantener el cálculo de cumplimiento alineado con `componerBriefFinTurno`
 * (total/targetTotal, umbrales 95/75) para que el número de la UI y el del
 * brief sean siempre el mismo.
 */
export interface ShoplogixOfficialRollup {
  officialSchedule: { start: Date; end: Date } | null
  currentJob: {
    name: string | null
    jobMaxRunRate: number | null
    productionQuantityExpected: number | null
  } | null
  officialTargetsByMachineId: Record<string, number> | null
}

function parseOfficialRollup(data: FirestoreData | null | undefined): ShoplogixOfficialRollup | null {
  if (!data) return null
  const sched = data.officialSchedule as FirestoreData | undefined
  const officialSchedule = sched?.start != null && sched?.end != null
    ? { start: toDateSafe(sched.start), end: toDateSafe(sched.end) }
    : null

  const job = data.currentJob as FirestoreData | undefined
  const currentJob = job
    ? {
        name: typeof job.name === 'string' ? job.name : null,
        jobMaxRunRate: typeof job.jobMaxRunRate === 'number' ? job.jobMaxRunRate : null,
        productionQuantityExpected: typeof job.productionQuantityExpected === 'number' ? job.productionQuantityExpected : null,
      }
    : null

  const targetsRaw = data.officialTargetsByMachineId as FirestoreData | undefined
  const officialTargetsByMachineId = targetsRaw && typeof targetsRaw === 'object'
    ? Object.fromEntries(
        Object.entries(targetsRaw).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
      )
    : null

  if (!officialSchedule && !currentJob && !officialTargetsByMachineId) return null
  return { officialSchedule, currentJob, officialTargetsByMachineId }
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
    comments:            Array.isArray(raw.comments)
      ? raw.comments
          .map(c => deserializeComment(c, scheduledStart, scheduledEnd))
          .filter((c): c is UpstreamShiftComment => c !== null)
      : [],
    source:              'shoplogix',
    sourceVersion:       Number(raw.sourceVersion ?? 1),
    syncedAt:            toDateSafe(raw.syncedAt),
    dataQualityIssues,
  }
}

export interface LoadShoplogixShiftResult {
  snapshot: UpstreamLineSnapshot | null
  syncedAt: Date | null
  /** Rollup oficial del turno vigente (horario/especie/targets). `undefined` en
   *  `loadShoplogixShift` (carga histórica, nunca lo trae) — solo poblado por
   *  `subscribeShoplogixShift`/`subscribeShoplogixShiftAuto`. `null` = turno sin
   *  rollup disponible (histórico, o aún no sincronizado). */
  officialRollup?: ShoplogixOfficialRollup | null
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
  const parentRef = doc(db, `shoplogix/${plantSlug}/shifts/${shiftDocId}`)

  // Dos listeners combinados: la subcolección `machines` (data pesada, ya
  // existía) y el doc padre (liviano, 1 doc — trae officialSchedule/currentJob/
  // officialTargetsByMachineId cuando este es el turno vigente). Se emite un
  // único LoadShoplogixShiftResult cada vez que CUALQUIERA de los dos cambia,
  // una vez que ambos emitieron al menos una vez (evita un primer emit con
  // rollup a medias).
  let machinesResult: { snapshot: UpstreamLineSnapshot | null; syncedAt: Date | null } | null = null
  let officialRollup: ShoplogixOfficialRollup | null = null
  let parentHeard = false

  const emit = () => {
    if (!machinesResult || !parentHeard) return
    onUpdate({ ...machinesResult, officialRollup })
  }

  const unsubMachines = onSnapshot(
    machinesRef,
    (snap) => {
      if (snap.empty) {
        machinesResult = { snapshot: null, syncedAt: null }
        emit()
        return
      }
      const machines: ReturnType<typeof deserializeShift>[] = snap.docs.map(
        d => deserializeShift(d.data() as FirestoreData),
      )
      machines.sort((a, b) => a.machineName.localeCompare(b.machineName))
      const lineSnapshot = buildLineSnapshot({ dateKey, shiftId, machines })
      // syncedAt desde el primer doc (todas las máquinas se sincronizan juntas)
      const syncedAt = machines[0]?.syncedAt ?? null
      machinesResult = { snapshot: lineSnapshot, syncedAt }
      emit()
    },
    (_error) => {
      // Error de red o permisos → informar pero no romper la UI
      machinesResult = { snapshot: null, syncedAt: null }
      emit()
    },
  )

  const unsubParent = onSnapshot(
    parentRef,
    (snap) => {
      officialRollup = parseOfficialRollup(snap.exists() ? (snap.data() as FirestoreData) : null)
      parentHeard = true
      emit()
    },
    (_error) => {
      officialRollup = null
      parentHeard = true
      emit()
    },
  )

  return () => { unsubMachines(); unsubParent() }
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

/**
 * Mapeo de labels del Grader → IDs reales que escribe el CF de Shoplogix,
 * por planta.
 *
 * El CF escribe con los IDs que devuelve la API de Shoplogix. Chonchi usa
 * "Turno día"/"Turno noche" nativos. Yal usa "Turno 1/2/3" + variantes con
 * asterisco para múltiples instancias del mismo turno en un día.
 *
 * Para que el panel de upstream funcione cuando el Grader Excel etiqueta
 * "Turno día"/"Turno noche" en Yal, mapeamos al equivalente Shoplogix por
 * overlap horario. OJO: los horarios REALES los define Shoplogix y CAMBIAN
 * (obs. 2026-07: Yal T2 14:45→00:00 o 16:15→00:00, T3 00:00→06:55; ya no
 * existe T1 en Yal). Este mapa es solo de NOMBRES; los horarios reales vienen
 * de scheduledStart/End en los docs (ver `listShiftInfosForDay`).
 *
 * Fallback `Unscheduled`: cuando Shoplogix no logra atribuir intervals a un
 * turno específico, la producción real cae en intervals "Unscheduled".
 * Caso real Yal: 2,275 cycles diarios estaban en Unscheduled. Sin este
 * fallback, la UI mostraba "Sin datos" aunque hubiera producción.
 */
const SHIFT_CANDIDATES_BY_PLANT: Record<PlantSlug, Record<string, string[]>> = {
  chonchi: {
    // Chonchi: Shoplogix DEJÓ de emitir "Turno día/noche" (verificado en
    // Firestore: desde 2026-05 solo emite "Turno 1" 21:30→05:45,
    // "Turno 2" 09:00→17:15 u 08:00→15:15, y "Turno 1 Lunes" 00:00→~07:00
    // los lunes). El Grader Excel sigue etiquetando día/noche → mapear por
    // solapamiento horario REAL:
    //   "Turno 2" (09:00-17:15) compone el día
    //   "Turno 1" (21:30-05:45) + "Turno 1 Lunes" (madrugada lunes) componen la noche
    'Turno día':   ['Turno día', 'Turno 2', 'Turno 2*'],
    'Turno noche': ['Turno noche', 'Turno 1', 'Turno 1*', 'Turno 1 Lunes'],
    'Turno 1':       ['Turno 1', 'Turno 1*'],
    'Turno 1 Lunes': ['Turno 1 Lunes'],
    'Turno 2':     ['Turno 2', 'Turno 2*'],
    'Turno 3':     ['Turno 3', 'Turno 3*'],
  },
  yal: {
    // Yal: Shoplogix usa Turno 1/2/3, el Grader Excel suele etiquetar día/noche.
    // El listener paralelo elige al primer candidato con producción real (>0 ciclos).
    //
    // NUNCA caer a `Unscheduled` como fallback de un turno nombrado. Verificado
    // 2026-05-13 con screenshots reales: el doc `Unscheduled` representa horas
    // entre turnos (mantenimiento, limpieza, calibración) y NO es un turno real.
    // Disfrazarlo como `Turno 3` o `Turno noche` mentía al operador con datos
    // de otra ventana horaria. Si Shoplogix no sincroniza el T3 real es bug del
    // sync upstream, no se compensa con data espuria.
    'Turno día':   ['Turno día', 'Turno 1', 'Turno 1*', 'Turno 2', 'Turno 2*'],
    'Turno noche': ['Turno noche', 'Turno 3', 'Turno 3*'],
    'Turno 1':     ['Turno 1', 'Turno 1*'],
    'Turno 2':     ['Turno 2', 'Turno 2*'],
    'Turno 3':     ['Turno 3', 'Turno 3*'],
  },
}

export function getSlxShiftCandidates(shiftId: string, plantSlug: PlantSlug = 'chonchi'): string[] {
  return SHIFT_CANDIDATES_BY_PLANT[plantSlug]?.[shiftId] ?? [shiftId]
}

/** @deprecated Usar `getSlxShiftCandidates(shiftId, plantSlug)`. Solo cubre chonchi. */
export const GRADER_TO_SLX_SHIFT_CANDIDATES: Record<string, string[]> = SHIFT_CANDIDATES_BY_PLANT.chonchi

/**
 * Suscripción con fallback automático de shiftId.
 *
 * Intenta candidatos en orden hasta encontrar datos en Firestore.
 * Cuando el primero que tiene datos recibe una actualización, la propaga
 * al caller. Descarta el listener del candidato vacío al pasar al siguiente.
 *
 * Caso de uso principal: el Grader consulta "Turno noche" pero el CF escribe
 * "Turno 3". Esta función prueba ambos y usa el que tenga datos.
 *
 * @returns función unsubscribe (limpia el listener activo en ese momento)
 */
export function subscribeShoplogixShiftAuto(
  dateKey: string,
  shiftId: string,
  plantSlug: PlantSlug = 'chonchi',
  onUpdate: (result: LoadShoplogixShiftResult) => void,
): () => void {
  const candidates = getSlxShiftCandidates(shiftId, plantSlug)
  let active = true

  // Mantener subscripciones a TODOS los candidatos en paralelo. La primera que
  // emita cycles > 0 gana y propaga; si luego cae a 0, también propaga (turno
  // terminado / data borrada). Sólo emitimos `null` final cuando todos los
  // candidatos hayan emitido algo y ninguno tenga data.
  //
  // Histórico: la versión anterior probaba candidatos secuencialmente y
  // desuscribía al primero tras una emisión vacía. Con caché frío de Firestore
  // (deep link recién abierto), `onSnapshot` puede emitir la caché stale primero
  // (ej. 0 cycles) y los datos reales del servidor después — al desuscribir,
  // perdíamos la emisión real y la UI quedaba con "sin datos cargados aún".
  //
  // Caso Yal Turno 3: el wrapper en paralelo permite que "Unscheduled" gane si
  // "Turno 3"/"Turno 3*" están vacíos. Cuando alguno tenga data, ese gana.
  const winner: { idx: number | null } = { idx: null }
  const heard: boolean[] = []
  const unsubs: Array<() => void> = []
  const subscribedIds = new Set<string>()
  // El rollup oficial (horario/especie/targets) puede existir ANTES de que
  // haya piezas producidas (turno recién arrancado, o día sin proceso) — es
  // justo el caso donde más sirve mostrarlo. No depende de qué candidato
  // "gana" por piezas: se guarda apenas algún candidato lo trae, y se
  // reenvía incluso cuando ningún candidato tiene datos reales (línea de
  // abajo), en vez de descartarlo junto con el snapshot vacío.
  let lastRollup: LoadShoplogixShiftResult['officialRollup'] = null

  /**
   * Umbral de validez para fallback `Unscheduled`. Sin esto, días donde la
   * máquina solo está encendida sin asignar a turno (e.g. arranque/parada
   * con 5-20 ciclos sueltos) se mostrarían como Turno 3 madrugada con esos
   * ciclos espurios. Coherente con `loadOne` en GraderHistoricalCalendar.
   */
  const UNSCHEDULED_MIN_CYCLES = 50

  const subscribeCandidate = (candidateId: string) => {
    if (subscribedIds.has(candidateId)) return
    subscribedIds.add(candidateId)
    const idx = heard.length
    heard.push(false)
    const u = subscribeShoplogixShift(dateKey, candidateId, plantSlug, (result) => {
      if (!active) return
      heard[idx] = true
      if (result.officialRollup) lastRollup = result.officialRollup

      const totalCycles = result.snapshot?.machines?.reduce(
        (sum, m) => sum + (m.totalCycles || 0), 0,
      ) ?? 0
      const isUnscheduledNoise = candidateId === 'Unscheduled' && totalCycles < UNSCHEDULED_MIN_CYCLES
      const hasRealData = result.snapshot !== null && totalCycles > 0 && !isUnscheduledNoise

      // Si nadie ha ganado todavía y este candidato trae data → propagar y fijar ganador
      if (winner.idx === null && hasRealData) {
        winner.idx = idx
        onUpdate(result)
        return
      }

      // Si este es el ganador actual, propagar updates (incluso bajadas a 0)
      if (winner.idx === idx) {
        onUpdate(result)
        return
      }

      // Si todos los candidatos ya emitieron y nadie tiene data → emitir null,
      // pero conservando el rollup si algún candidato lo trajo (ver comentario
      // de `lastRollup` arriba).
      if (winner.idx === null && heard.every(Boolean)) {
        onUpdate({ snapshot: null, syncedAt: null, officialRollup: lastRollup })
      }
      // Otros candidatos sin data: silencioso, esperar al ganador o que cambien
    })
    unsubs.push(u)
  }

  candidates.forEach(subscribeCandidate)

  // Descubrimiento dinámico: Shoplogix inventa variantes de nombre que la lista
  // estática no conoce (caso real 2026-07: "Turno 1 Lunes" en chonchi). Sumamos
  // como candidatos los docs del día cuyo nombre EXTIENDE al turno pedido
  // (prefijo estricto) — nunca turnos de otra ventana horaria. Como se agregan
  // después, solo ganan si los candidatos estáticos no traen producción.
  listShiftInfosForDay(dateKey, plantSlug)
    .then((infos) => {
      if (!active) return
      for (const info of infos) {
        if (info.shiftId === 'Unscheduled') continue  // política por planta, ya cubierta arriba
        if (!info.shiftId.startsWith(shiftId)) continue
        subscribeCandidate(info.shiftId)
      }
    })
    .catch(() => { /* descubrimiento es best-effort */ })

  return () => {
    active = false
    unsubs.forEach(u => u())
  }
}

/**
 * Shift IDs conocidos — SOLO para el fallback de sondeo cuando el rango de docs
 * padre no devuelve nada (docs muy viejos, pre-syncDay, sin doc padre).
 * La fuente de verdad de "qué turnos existen" es el descubrimiento dinámico
 * (`listShiftInfosForDay`): los nombres y horarios los define Shoplogix y CAMBIAN
 * (caso real 2026-07: apareció "Turno 1 Lunes" en chonchi).
 */
const FALLBACK_CANDIDATE_SHIFT_IDS: string[] = [
  'Turno 1', 'Turno 1*', 'Turno 1 Lunes', 'Turno 2', 'Turno 2*',
  'Turno 3', 'Turno 3*', 'Turno día', 'Turno noche', 'Unscheduled',
]

/**
 * Info de un turno que EXISTE en Firestore para un día, con su horario REAL
 * (scheduledStart/End derivados de los intervals de Shoplogix por syncDay).
 * Esta es la fuente de verdad de horarios de turno — no los schedules
 * hardcodeados de la app.
 */
// Fin de rango para queries por documentId con prefijo: U+F8FF es el último
// code point privado BMP — ordena después de cualquier nombre de turno real.
const SHIFT_DOC_RANGE_END = String.fromCharCode(0xf8ff)

export interface ShoplogixShiftDayInfo {
  dateKey: string
  shiftId: string
  /** Horario real del turno según Shoplogix (wall-clock-as-UTC). Null en docs legacy sin doc padre. */
  scheduledStart: Date | null
  scheduledEnd: Date | null
  /** Suma de totalCycles del resumen de máquinas del doc padre. Null si el padre no lo trae. */
  totalCycles: number | null
  lastSyncAt: Date | null
}

function parentDocToDayInfo(id: string, data: FirestoreData): ShoplogixShiftDayInfo | null {
  // id = `${dateKey}_${shiftId}` — dateKey son siempre 10 chars YYYY-MM-DD
  const m = id.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/)
  if (!m) return null
  const machines = Array.isArray(data.machines) ? (data.machines as FirestoreData[]) : null
  const totalCycles = machines
    ? machines.reduce((a, x) => a + (typeof x.totalCycles === 'number' ? x.totalCycles : 0), 0)
    : null
  return {
    dateKey: m[1]!,
    shiftId: m[2]!,
    scheduledStart: data.scheduledStart != null ? toDateSafe(data.scheduledStart) : null,
    scheduledEnd:   data.scheduledEnd   != null ? toDateSafe(data.scheduledEnd)   : null,
    totalCycles,
    lastSyncAt:     data.lastSyncAt     != null ? toDateSafe(data.lastSyncAt)     : null,
  }
}

/**
 * DESCUBRIMIENTO DINÁMICO: turnos que existen en Firestore para un día, leyendo
 * los docs padre por rango de documentId. Descubre CUALQUIER nombre de turno que
 * Shoplogix emita (incluye variantes nuevas como "Turno 1 Lunes") y devuelve el
 * horario real de cada uno.
 *
 * Los docs padre existen desde la era syncDay (~2026-04). Para días sin docs
 * padre (data muy vieja) cae al sondeo por candidatos conocidos leyendo la
 * subcolección machines (sin horarios).
 *
 * Orden: por scheduledStart ascendente; los sin horario al final.
 */
export async function listShiftInfosForDay(
  dateKey: string,
  plantSlug: PlantSlug = 'chonchi',
): Promise<ShoplogixShiftDayInfo[]> {
  const shiftsRef = collection(db, `shoplogix/${plantSlug}/shifts`)
  const snap = await getDocs(query(
    shiftsRef,
    where(documentId(), '>=', `${dateKey}_`),
    where(documentId(), '<=', `${dateKey}_` + SHIFT_DOC_RANGE_END),
  )).catch(() => null)

  if (snap && !snap.empty) {
    const infos = snap.docs
      .map(d => parentDocToDayInfo(d.id, d.data() as FirestoreData))
      .filter((x): x is ShoplogixShiftDayInfo => x !== null)
    return infos.sort((a, b) => {
      const ta = a.scheduledStart?.getTime() ?? Number.MAX_SAFE_INTEGER
      const tb = b.scheduledStart?.getTime() ?? Number.MAX_SAFE_INTEGER
      return ta - tb || a.shiftId.localeCompare(b.shiftId)
    })
  }

  // Fallback legacy: sondear candidatos conocidos vía subcolección machines.
  const checks = FALLBACK_CANDIDATE_SHIFT_IDS.map(async (shiftId) => {
    const ref = collection(db, `shoplogix/${plantSlug}/shifts/${dateKey}_${shiftId}/machines`)
    const s = await getDocs(query(ref, limit(1))).catch(() => null)
    return s && !s.empty ? shiftId : null
  })
  const found = (await Promise.all(checks)).filter((id): id is string => id !== null)
  return found.map(shiftId => ({
    dateKey, shiftId,
    scheduledStart: null, scheduledEnd: null,
    totalCycles: null, lastSyncAt: null,
  }))
}

/**
 * Devuelve los IDs de documentos shift que existen en Firestore para un mes completo.
 *
 * Implementación: UNA query de rango sobre los docs padre del mes (el CF syncDay
 * SÍ crea docs padre desde ~2026-04). Fallback al sondeo por día×candidato para
 * data vieja sin docs padre.
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

    const shiftsRef = collection(db, `shoplogix/${plantSlug}/shifts`)
    const snap = await getDocs(query(
      shiftsRef,
      where(documentId(), '>=', `${monthPrefix}-01_`),
      where(documentId(), '<=', `${monthPrefix}-${String(daysInMonth).padStart(2, '0')}_` + SHIFT_DOC_RANGE_END),
    )).catch(() => null)

    if (snap && !snap.empty) {
      return snap.docs.map(d => d.id)
    }

    // Fallback legacy (meses sin docs padre): sondeo por día en paralelo.
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
 * Wrapper de compatibilidad sobre `listShiftInfosForDay` (descubrimiento
 * dinámico) — descubre cualquier nombre de turno que Shoplogix emita.
 */
export async function listShoplogixShiftIdsForDay(
  dateKey: string,
  plantSlug: PlantSlug = 'chonchi',
): Promise<string[]> {
  const infos = await listShiftInfosForDay(dateKey, plantSlug)
  return infos.map(i => i.shiftId)
}
