/**
 * Calendario histórico del Grader reusable.
 *
 * Muestra los `graderDailySummaries` guardados por día y turno con:
 *  - Celdas de mes coloreadas por P0% promedio (verde/amber/rojo)
 *  - Indicadores "Falta PP/P0" por día incompleto
 *  - Panel lateral con KPIs del día seleccionado: piezas, P0%, peso, pz/h, top causas
 *  - Botón "Cargar" que (por defecto) navega al Wizard con autoload del turno
 *
 * Uso:
 *  - En `/analisis-grader/calendario` (página completa con header propio)
 *  - Embebido dentro del Wizard para dar visibilidad del histórico en el home
 *
 * Props:
 *  - `onLoadTurno`: override del comportamiento del botón "Cargar" (útil cuando
 *    ya estamos en el Wizard y queremos actualizar el state en lugar de navegar).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui'
import { ChevronLeft, ChevronRight, Loader2, Clock, Database, Eye, Trash2, AlertTriangle, Sun, Moon, Wrench, Tag, GitCompare } from 'lucide-react'
import { fmt } from '@/lib/format'
import { QuickGateChangeButton } from './QuickGateChangeButton'
import { listSnapshots } from '@/services/grader/graderConfigSnapshot.service'
import { cn } from '@/lib/utils'
import { listGraderUploads } from '@/services/grader/graderUpload.service'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import {
  getDailySummary,
  saveDailySummary,
  deleteDailySummary,
  listDailySummariesByRange,
  loadPausesAggregates,
} from '@/services/grader/graderDailySummary.service'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import { getCauseLabel } from '@/services/grader/graderMatrixP0Causes'
import {
  DEFAULT_SHIFT_SCHEDULE,
  inferShiftIdFromSchedule,
  normalizeShiftSchedule,
} from '@/services/grader/graderShiftSchedule'
import type { GraderUpload, GraderDailySummary } from '@/services/grader/types'
import {
  aggregateByCalendarDay,
  buildShiftChipDescriptors,
  type ShiftChipDescriptor,
} from '@/services/grader/graderCalendarAggregation'
import { DayComparisonModal } from './DayComparisonModal'
import { useAuthStore } from '@/store'
import { useGraderSelectionStore } from '@/store/graderSelectionStore'
import { p0StatusFromPct, p0StatusColor, DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT, type P0Status } from '@/services/grader/graderP0Thresholds'

interface TurnoSummary {
  totalPieces: number
  pointZeroPieces: number
  pointZeroPct: number
  startAt?: string
  endAt?: string
}

interface SummaryState {
  loading: boolean
  error: string | null
  data?: TurnoSummary
  source?: 'cached' | 'computed'
}

interface GraderHistoricalCalendarProps {
  /**
   * Callback invocado cuando el usuario clickea "Cargar" sobre un turno.
   * Si se omite, se navega a `/analisis-grader?date=…&shift=…&autoload=1`
   * (comportamiento default cuando el componente se renderiza en la página
   * dedicada `AnalisisGraderCalendarPage`).
   */
  onLoadTurno?: (dateKey: string, shiftId: string) => void
  /** Clase extra para el contenedor raíz */
  className?: string
  /** Fecha inicial a seleccionar (opcional, ej. de ?goto=YYYY-MM-DD) */
  initialDateKey?: string | null
  /** Si true, apila 1.1 (calendario) arriba y 1.2 (resumen) abajo en lugar del grid lateral */
  stacked?: boolean
  /** Notifica al padre cada vez que el mes visible cambia (ej. al navegar ◀▶). */
  onMonthChange?: (date: Date) => void
  /** Notifica al padre cuando se cargan los summaries del mes visible. */
  onSummariesLoaded?: (list: GraderDailySummary[]) => void
}

const monthNames = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

const P0_CARD_CLASS: Record<P0Status, string> = {
  ok:       'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40',
  alert:    'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50',
  critical: 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50',
}

function toDateKey(iso?: string): string {
  if (!iso) return new Date().toISOString().slice(0, 10)
  return iso.slice(0, 10)
}

/**
 * Renderiza un chip de turno en una celda del calendario según su rol.
 *
 * - `primary`: chip prominente con P0% y label direccional (`D`, `N`, `→N`, `N→`).
 *   Es el "Ver detalle" natural del turno (donde físicamente cargó más).
 * - `secondary`: chip chico/atenuado con `pctOfShift%` (% del turno en este día).
 *   Indica continuidad — el turno también pasó por aquí pero su carga real está en otro día.
 * - `orphan-source`: chip tachado/muy atenuado en el día programado donde el turno
 *   no tuvo actividad real (ej. los 4 domingos de Feb 2026 en Chile).
 */
function renderShiftChip(chip: ShiftChipDescriptor, untaggedCount: number | null): JSX.Element {
  const baseLetter = chip.shiftId === 'Turno día' ? 'D' : 'N'
  const label =
    chip.direction === 'enters' ? `→${baseLetter}` :
    chip.direction === 'exits' ? `${baseLetter}→` :
    baseLetter
  const key = `${chip.summaryId}-${chip.role}-${chip.renderInDateKey}`
  const p0 = chip.pointZeroPct
  const colorByP0 = p0 >= DEFAULT_P0_CRITICAL_PCT
    ? 'bg-red-500/18 text-red-600'
    : p0 >= DEFAULT_P0_ALERT_PCT
      ? 'bg-amber-500/18 text-amber-600'
      : 'bg-emerald-500/18 text-emerald-600'

  if (chip.role === 'orphan-source') {
    // Chip atenuado tachado en el día schedule sin actividad real
    return (
      <div
        key={key}
        title={`Turno ${chip.shiftId.toLowerCase()} programado pero sin actividad este día. Detalle en ${chip.primaryDateKey ?? 'otro día'}.`}
        className="flex items-center justify-between rounded px-1 py-0.5 leading-none bg-neutral-500/10 text-neutral-500"
      >
        <span className="text-[8px] font-medium line-through">{baseLetter}⌧</span>
        <span className="text-[7px] tabular-nums opacity-80">→ {chip.primaryDateKey?.slice(8) ?? '--'}</span>
      </div>
    )
  }

  if (chip.role === 'secondary') {
    // Chip chico atenuado: % del fragmento (no P0%) para indicar continuidad
    const pct = chip.pctOfShift != null ? Math.round(chip.pctOfShift) : 0
    return (
      <div
        key={key}
        title={`${chip.shiftId} ${chip.shiftDateKey} → este día aportó ${pct}% de la carga (P0% del turno completo: ${p0.toFixed(1)}%)`}
        className={cn(
          'flex items-center justify-between rounded px-1 leading-none opacity-60 hover:opacity-100 transition-opacity',
          colorByP0,
        )}
        style={{ paddingTop: 0, paddingBottom: 0, height: '11px' }}
      >
        <span className="text-[7px] font-medium opacity-80">{label}</span>
        <span className="text-[7px] font-semibold tabular-nums">{pct}%</span>
      </div>
    )
  }

  // role === 'primary'
  return (
    <div
      key={key}
      title={chip.direction === 'enters'
        ? `Turno ${chip.shiftId.toLowerCase()} arrancó ${chip.shiftDateKey}, aportó ${Math.round(chip.pctOfShift ?? 100)}% en este día (madrugada).`
        : chip.direction === 'exits'
          ? `Turno ${chip.shiftId.toLowerCase()} arranca este día, ${Math.round(chip.pctOfShift ?? 100)}% de su carga aquí.`
          : `Turno ${chip.shiftId.toLowerCase()} de este día.`}
      className={cn('flex items-center justify-between rounded px-1 py-0.5 leading-none', colorByP0)}
    >
      <span className="text-[8px] font-medium opacity-70">{label}</span>
      <span className="text-[9px] font-bold tabular-nums">{p0.toFixed(1)}%</span>
      {untaggedCount !== null && untaggedCount > 0 && (
        <span className="ml-0.5 text-[7px] leading-none px-0.5 rounded bg-amber-500/25 text-amber-600 font-semibold">
          🏷{untaggedCount}
        </span>
      )}
    </div>
  )
}

/**
 * Card consolidada para un mismo turno-tipo (ej. Turno noche) que recibe
 * múltiples fragmentos en el día calendárico (ej. madrugada del N de ayer +
 * vespertina del N que arranca hoy). Mantiene la mental model "1 día = 1 D + 1 N"
 * agregando los KPIs calendáricos arriba y listando los fragmentos contribuyentes
 * adentro como mini-cards clickeables.
 */
function renderConsolidatedShiftCard(
  shiftId: string,
  entries: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>,
  navigate: (path: string) => void,
): JSX.Element {
  // Calcular agregados calendáricos (solo no-orphan)
  let totalPieces = 0
  let totalP0 = 0
  let totalWeight = 0
  let hasWeight = false
  for (const e of entries) {
    if (e.chip?.role === 'orphan-source') continue
    const pieces = e.chip?.pieces ?? e.summary.totalPieces
    const p0 = e.chip?.pointZeroPieces ?? e.summary.pointZeroPieces
    const wkg = e.chip?.weightKg ?? e.summary.totalWeightKg
    totalPieces += pieces
    totalP0 += p0
    if (wkg != null && wkg > 0) {
      totalWeight += wkg
      hasWeight = true
    }
  }
  const p0Pct = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
  const status = p0StatusFromPct(p0Pct)

  return (
    <div
      key={`consolidated-${shiftId}`}
      className={cn(
        'rounded-lg border px-3 py-2.5 space-y-2',
        P0_CARD_CLASS[status],
      )}
    >
      {/* Header: shiftId + badge "consolidado" + P0% calendárico */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium">{shiftId}</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded border font-medium bg-indigo-500/15 text-indigo-300 border-indigo-500/30">
              {entries.filter((e) => e.chip?.role !== 'orphan-source').length} fragmentos en este día
            </span>
          </div>
        </div>
        <span className={cn('text-lg font-bold tabular-nums', p0StatusColor(status))}>
          {p0Pct.toFixed(2)}%
        </span>
      </div>

      {/* KPIs agregados calendáricos */}
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <div className="rounded bg-background/60 px-2 py-1">
          <p className="text-muted-foreground">Piezas</p>
          <p className="font-semibold">{totalPieces.toLocaleString('es-CL')}</p>
        </div>
        <div className="rounded bg-background/60 px-2 py-1">
          <p className="text-muted-foreground">P0 piezas</p>
          <p className="font-semibold">{totalP0.toLocaleString('es-CL')}</p>
        </div>
        {hasWeight && (
          <div className="rounded bg-background/60 px-2 py-1 col-span-2">
            <p className="text-muted-foreground">Peso</p>
            <p className="font-semibold">
              {totalWeight >= 1000
                ? `${(totalWeight / 1000).toFixed(1)} t`
                : `${totalWeight.toFixed(0)} kg`}
            </p>
          </div>
        )}
      </div>

      {/* Listado de fragmentos contribuyentes */}
      <div className="space-y-1 pt-1.5 border-t border-border/30">
        {entries.map(({ summary: hist, chip }) => {
          const isOrphan = chip?.role === 'orphan-source'
          const dirLabel =
            chip?.direction === 'enters' ? 'Madrugada' :
            chip?.direction === 'exits' ? 'Vespertina' :
            null
          const fragLabel = isOrphan
            ? `Programado ${chip!.shiftDateKey} sin actividad real → detalle en ${chip!.primaryDateKey ?? '—'}`
            : dirLabel != null
              ? `${dirLabel} del turno de ${chip!.shiftDateKey} · ${Math.round(chip!.pctOfShift ?? 100)}% aquí`
              : `Turno completo (${chip?.pctOfShift ?? 100}%)`
          const fragPieces = chip?.pieces ?? hist.totalPieces
          return (
            <button
              key={`${hist.id}-frag`}
              onClick={() => navigate(`/analisis-grader/turno/${hist.dateKey}__${encodeURIComponent(hist.shiftId)}`)}
              className={cn(
                'w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:bg-background/80',
                isOrphan
                  ? 'bg-neutral-500/8 border-neutral-500/20 opacity-70'
                  : 'bg-background/40 border-border/40',
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-[11px] font-medium truncate">{fragLabel}</span>
                <span className={cn('text-xs font-bold tabular-nums shrink-0', p0StatusColor(p0StatusFromPct(hist.pointZeroPct)))}>
                  {hist.pointZeroPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>
                  {isOrphan
                    ? 'Sin piezas atribuidas a este día'
                    : `${fragPieces.toLocaleString('es-CL')} pz`}
                </span>
                <span className="flex items-center gap-1">
                  <Eye className="h-2.5 w-2.5" />
                  Ver detalle
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function getUploadTimestamp(upload: GraderUpload): number {
  const ts = upload.updatedAt || upload.createdAt || upload.fileMeta.parsedAt
  return ts ? new Date(ts).getTime() : 0
}

function getUploadKey(
  upload: GraderUpload,
  schedule: Parameters<typeof inferShiftIdFromSchedule>[1],
): string {
  const dateKey = upload.sessionDate || toDateKey(upload.inferred?.startAt)
  const shiftId = upload.shiftId || inferShiftIdFromSchedule(upload.inferred?.startAt, schedule)
  const shiftKey = shiftId === 'Turno día' ? 'dia' : 'noche'
  return `${dateKey}__${shiftKey}__${upload.fileMeta.kind}`
}

function normalizeUploads(
  list: GraderUpload[],
  schedule: Parameters<typeof inferShiftIdFromSchedule>[1],
): GraderUpload[] {
  const map = new Map<string, GraderUpload>()
  for (const u of list) {
    const key = getUploadKey(u, schedule)
    const existing = map.get(key)
    if (!existing || getUploadTimestamp(u) >= getUploadTimestamp(existing)) {
      map.set(key, u)
    }
  }
  return Array.from(map.values())
}

function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

function getDaysInMonth(date: Date): (Date | null)[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = firstDay.getDay()

  const days: (Date | null)[] = []
  for (let i = 0; i < startDayOfWeek; i += 1) days.push(null)
  for (let i = 1; i <= daysInMonth; i += 1) days.push(new Date(year, month, i))
  return days
}

export function GraderHistoricalCalendar({
  onLoadTurno,
  className,
  initialDateKey,
  stacked = false,
  onMonthChange,
  onSummariesLoaded,
}: GraderHistoricalCalendarProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const selectedHistorical = useGraderSelectionStore((s) => s.selectedHistorical)
  const setSelectedHistorical = useGraderSelectionStore((s) => s.setSelectedHistorical)

  // Si el URL trae ?goto=YYYY-MM-DD úsalo como initialDateKey (prioridad sobre prop)
  const gotoParam = searchParams.get('goto')
  const effectiveInitialKey = gotoParam || initialDateKey || null

  const [currentMonth, setCurrentMonth] = useState(() => {
    if (effectiveInitialKey) {
      const d = new Date(`${effectiveInitialKey}T00:00:00`)
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), 1)
    }
    return new Date()
  })
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    if (effectiveInitialKey) {
      const d = new Date(`${effectiveInitialKey}T00:00:00`)
      if (!isNaN(d.getTime())) return d
    }
    return new Date()
  })
  const [uploads, setUploads] = useState<GraderUpload[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({})
  const [shiftSchedule, setShiftSchedule] = useState(DEFAULT_SHIFT_SCHEDULE)
  const [historicalByDate, setHistoricalByDate] = useState<Map<string, GraderDailySummary[]>>(new Map())
  const [allSummariesRaw, setAllSummariesRaw] = useState<GraderDailySummary[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Counts de cambios manuales de gate por shiftDocId (lazy-loaded al seleccionar un día)
  const [configChangeCounts, setConfigChangeCounts] = useState<Map<string, number>>(new Map())
  // M9 — Filtro "solo turnos con pausas sin anotar"
  const [filterUntagged, setFilterUntagged] = useState(false)
  // M12 — Modal comparación día vs noche
  const [showComparison, setShowComparison] = useState(false)
  // summaryId → cantidad de pausas sin tag (calculado lazy cuando el filtro está activo)
  const [untaggedCounts, setUntaggedCounts] = useState<Map<string, number>>(new Map())
  const [loadingUntagged, setLoadingUntagged] = useState(false)
  const autoSelectedRef = useRef(!!effectiveInitialKey)

  useEffect(() => { onMonthChange?.(currentMonth) }, [currentMonth, onMonthChange])

  useEffect(() => {
    setLoading(true)
    setError(null)
    listGraderUploads()
      .then((list) => setUploads(normalizeUploads(list, DEFAULT_SHIFT_SCHEDULE)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar uploads'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    getModuleRanges()
      .then((cfg) => {
        const schedule = normalizeShiftSchedule(cfg?.shiftSchedule)
        setShiftSchedule(schedule)
      })
      .catch(() => {
        setShiftSchedule(DEFAULT_SHIFT_SCHEDULE)
      })
  }, [])

  useEffect(() => {
    if (uploads.length === 0) return
    setUploads((prev) => normalizeUploads(prev, shiftSchedule))
  }, [shiftSchedule, uploads.length])

  // Cargar summaries históricos para el mes visible
  useEffect(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    listDailySummariesByRange(startDate, endDate)
      .then((list) => {
        const map = new Map<string, GraderDailySummary[]>()
        for (const s of list) {
          const existing = map.get(s.dateKey) ?? []
          existing.push(s)
          map.set(s.dateKey, existing)
        }
        setHistoricalByDate(map)
        setAllSummariesRaw(list)
        onSummariesLoaded?.(list)

        // Si el mes actual no tiene datos y no hay initialDateKey, buscar el último mes con datos
        if (list.length === 0 && !effectiveInitialKey && !autoSelectedRef.current) {
          const today = new Date()
          const lookback = `${today.getFullYear() - 1}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
          const lookbackEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
          listDailySummariesByRange(lookback, lookbackEnd)
            .then((allList) => {
              if (allList.length > 0) {
                const latestKey = allList.map((s) => s.dateKey).sort().slice(-1)[0]
                if (latestKey) {
                  const d = new Date(`${latestKey}T00:00:00`)
                  setSelectedDate(d)
                  setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                }
              }
            })
            .catch(() => {
              /* silent */
            })
        }
      })
      .catch(() => {
        /* silent: historial no crítico */
      })
  }, [currentMonth, effectiveInitialKey])

  useEffect(() => {
    if (autoSelectedRef.current) return
    const histKeys = Array.from(historicalByDate.keys()).sort()
    const latestHist = histKeys[histKeys.length - 1]
    const latestUpload = uploads.length > 0
      ? uploads.map((u) => u.sessionDate || toDateKey(u.inferred?.startAt)).filter(Boolean).sort().slice(-1)[0]
      : undefined
    const latest = latestHist ?? latestUpload
    if (latest) {
      const latestDate = new Date(`${latest}T00:00:00`)
      setSelectedDate(latestDate)
      setCurrentMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1))
      autoSelectedRef.current = true
    }
  }, [historicalByDate, uploads])

  const days = getDaysInMonth(currentMonth)

  const uploadsByDate = useMemo(() => {
    const map = new Map<string, GraderUpload[]>()
    for (const u of uploads) {
      const key = u.sessionDate || toDateKey(u.inferred?.startAt)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(u)
    }
    return map
  }, [uploads])

  // Reagregación calendárico-real (Opción D, sub-paso 3.B):
  // - calendarAgg: piezas/P0% por día calendario REAL (split del turno noche)
  // - chipsByDate: descriptores listos para renderizar (primary/secondary/orphan-source)
  // Permite mostrar el chip del turno donde realmente cargó (no donde inició).
  const summariesById = useMemo(() => {
    const m = new Map<string, GraderDailySummary>()
    for (const s of allSummariesRaw) m.set(s.id, s)
    return m
  }, [allSummariesRaw])

  const calendarAgg = useMemo(() => {
    const valid = allSummariesRaw.filter((s) => s.totalPieces > 0)
    return aggregateByCalendarDay({ summaries: valid })
  }, [allSummariesRaw])

  const chipsByDate = useMemo(
    () => buildShiftChipDescriptors(calendarAgg, summariesById),
    [calendarAgg, summariesById],
  )

  const selectedKey = selectedDate ? selectedDate.toISOString().slice(0, 10) : null

  // Summaries a mostrar en el panel "Resumen del día" para el día seleccionado.
  // Combina:
  //  - Contribuciones calendáricas reales (chips primary/secondary)
  //  - Summaries con dateKey legacy === selectedKey que no aportan (huérfanos)
  // Orden: primary > secondary > orphan-source; D antes que N dentro de cada rol.
  const summariesForSelectedDay = useMemo(() => {
    if (!selectedKey) return [] as Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>
    const out: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }> = []
    const seen = new Set<string>()
    const dayChips = chipsByDate.get(selectedKey) ?? []

    // 1. Aportes reales (primary + secondary)
    for (const chip of dayChips) {
      if (chip.role === 'orphan-source') continue
      const s = summariesById.get(chip.summaryId)
      if (s && !seen.has(s.id)) {
        out.push({ summary: s, chip })
        seen.add(s.id)
      }
    }
    // 2. Huérfanos: summaries con dateKey legacy === selectedKey sin aporte
    for (const s of historicalByDate.get(selectedKey) ?? []) {
      if (seen.has(s.id)) continue
      const orphanChip = dayChips.find((c) => c.summaryId === s.id && c.role === 'orphan-source') ?? null
      out.push({ summary: s, chip: orphanChip })
      seen.add(s.id)
    }
    // Ordenamiento determinista
    const roleOrder: Record<string, number> = { primary: 0, secondary: 1, 'orphan-source': 2 }
    const shiftOrder: Record<string, number> = { 'Turno día': 0, 'Turno noche': 1 }
    out.sort((a, b) => {
      const ra = roleOrder[a.chip?.role ?? 'primary'] ?? 0
      const rb = roleOrder[b.chip?.role ?? 'primary'] ?? 0
      if (ra !== rb) return ra - rb
      const sa = shiftOrder[a.summary.shiftId] ?? 9
      const sb = shiftOrder[b.summary.shiftId] ?? 9
      return sa - sb
    })
    return out
  }, [selectedKey, chipsByDate, historicalByDate, summariesById])

  // Agrupar por shiftId para consolidar cuando un mismo tipo (Turno noche)
  // tiene múltiples fragmentos calendáricos en el día (ej. madrugada del N
  // de ayer + vespertina del N que arranca hoy → 1 sola card consolidada).
  const groupedByShift = useMemo(() => {
    const map = new Map<string, Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>>()
    for (const entry of summariesForSelectedDay) {
      const arr = map.get(entry.summary.shiftId) ?? []
      arr.push(entry)
      map.set(entry.summary.shiftId, arr)
    }
    return map
  }, [summariesForSelectedDay])

  // Auto-selección del turno para el store compartido:
  //   - Cuando cambia el día seleccionado, si la selección actual no pertenece a este día,
  //     elegir el primer turno (día > noche) del día si existe. Si no hay turnos, limpiar.
  useEffect(() => {
    if (!selectedKey) return
    const turnosDelDia = historicalByDate.get(selectedKey) ?? []
    if (turnosDelDia.length === 0) {
      if (selectedHistorical) setSelectedHistorical(null)
      return
    }
    const currentBelongsToDay = selectedHistorical && turnosDelDia.some((t) => t.id === selectedHistorical.id)
    if (currentBelongsToDay) return
    const order: Record<string, number> = { 'Turno día': 0, 'Turno noche': 1 }
    const sorted = [...turnosDelDia].sort((a, b) => (order[a.shiftId] ?? 9) - (order[b.shiftId] ?? 9))
    setSelectedHistorical(sorted[0] ?? null)
  }, [selectedKey, historicalByDate, selectedHistorical, setSelectedHistorical])

  // Lazy-load de cambios manuales de gate para los turnos del día seleccionado.
  // Se dispara al cambiar el día — solo carga si el shiftDocId no está ya en caché.
  useEffect(() => {
    if (!selectedKey) return
    const turnosDelDia = historicalByDate.get(selectedKey) ?? []
    if (turnosDelDia.length === 0) return
    let cancelled = false
    for (const hist of turnosDelDia) {
      if (configChangeCounts.has(hist.id)) continue
      listSnapshots(hist.id)
        .then(snaps => {
          if (cancelled) return
          const count = snaps.filter(s => !s.synthetic && (s.changes?.length ?? 0) > 0).length
          setConfigChangeCounts(prev => new Map(prev).set(hist.id, count))
        })
        .catch(() => {})
    }
    return () => { cancelled = true }
  }, [selectedKey, historicalByDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedUploads = useMemo(() => {
    if (!selectedKey) return []
    return uploadsByDate.get(selectedKey) || []
  }, [selectedKey, uploadsByDate])

  const turnos = useMemo(() => {
    const map = new Map<string, GraderUpload[]>()
    for (const u of selectedUploads) {
      const shift = u.shiftId || inferShiftIdFromSchedule(u.inferred?.startAt, shiftSchedule)
      if (!map.has(shift)) map.set(shift, [])
      map.get(shift)!.push(u)
    }
    return map
  }, [selectedUploads, shiftSchedule])

  useEffect(() => {
    if (!selectedKey) return
    const shifts = Array.from(turnos.keys())
    if (shifts.length === 0) return

    Promise.all(
      shifts.map(async (shiftId) => {
        const key = `${selectedKey}::${shiftId}`
        if (summaries[key]?.data) return
        const cached = await getDailySummary(selectedKey, shiftId)
        if (cached) {
          setSummaries((prev) => ({
            ...prev,
            [key]: {
              loading: false,
              error: null,
              source: 'cached',
              data: {
                totalPieces: cached.totalPieces,
                pointZeroPieces: cached.pointZeroPieces,
                pointZeroPct: cached.pointZeroPct,
                startAt: cached.startAt,
                endAt: cached.endAt,
              },
            },
          }))
        }
      }),
    ).catch(() => {})
  }, [selectedKey, turnos, summaries])

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const handleLoadTurno = (dateKey: string, shiftId: string) => {
    if (onLoadTurno) {
      onLoadTurno(dateKey, shiftId)
    } else {
      navigate(`/analisis-grader/turno/${dateKey}__${encodeURIComponent(shiftId)}`)
    }
  }

  const handleComputeSummary = async (dateKey: string, shiftId: string) => {
    const key = `${dateKey}::${shiftId}`
    if (summaries[key]?.loading) return

    const cached = await getDailySummary(dateKey, shiftId)
    if (cached) {
      setSummaries((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: null,
          source: 'cached',
          data: {
            totalPieces: cached.totalPieces,
            pointZeroPieces: cached.pointZeroPieces,
            pointZeroPct: cached.pointZeroPct,
            startAt: cached.startAt,
            endAt: cached.endAt,
          },
        },
      }))
      return
    }

    setSummaries((prev) => ({
      ...prev,
      [key]: { loading: true, error: null },
    }))

    try {
      const turnoUploads = (uploadsByDate.get(dateKey) || []).filter((u) => {
        const shift = u.shiftId || inferShiftIdFromSchedule(u.inferred?.startAt, shiftSchedule)
        return shift === shiftId
      })

      const parsed: Array<{ fileMeta: any; partialData: any }> = []
      for (const u of turnoUploads) {
        if (!u.fileMeta.downloadURL) continue
        const res = await fetch(u.fileMeta.downloadURL)
        const blob = await res.blob()
        const file = new File([blob], u.fileMeta.name, {
          type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        const result = await parseFile(file)
        parsed.push(result)
      }

      if (parsed.length === 0) {
        setSummaries((prev) => ({
          ...prev,
          [key]: { loading: false, error: 'No hay archivos con URL en Storage.' },
        }))
        return
      }

      const merged = mergeParsedData(parsed)
      const totalPieces = merged.pieceRecords.reduce((sum, r) => sum + r.pieces, 0)
      const pointZeroPieces = merged.gate0Records.reduce((sum, r) => sum + r.pieces, 0)
      const pointZeroPct = totalPieces > 0 ? Math.round((pointZeroPieces / totalPieces) * 10000) / 100 : 0

      if (user) {
        await saveDailySummary({
          dateKey,
          shiftId,
          totalPieces,
          pointZeroPieces,
          pointZeroPct,
          startAt: merged.inferred.startAt,
          endAt: merged.inferred.endAt,
          updatedBy: user.id,
        })
      }

      setSummaries((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: null,
          source: 'computed',
          data: {
            totalPieces,
            pointZeroPieces,
            pointZeroPct,
            startAt: merged.inferred.startAt,
            endAt: merged.inferred.endAt,
          },
        },
      }))
    } catch {
      setSummaries((prev) => ({
        ...prev,
        [key]: { loading: false, error: 'Error al generar resumen.' },
      }))
    }
  }

  const handleDeleteSummary = async (dateKey: string, shiftId: string) => {
    const id = `${dateKey}__${shiftId}`
    if (!window.confirm(`¿Eliminar el registro "${shiftId}" del ${dateKey}? Esta acción no se puede deshacer.`)) return
    setDeletingId(id)
    try {
      await deleteDailySummary(dateKey, shiftId)
      setHistoricalByDate((prev) => {
        const next = new Map(prev)
        const dayList = (next.get(dateKey) ?? []).filter((s) => s.id !== id)
        if (dayList.length > 0) next.set(dateKey, dayList)
        else next.delete(dateKey)
        return next
      })
      // Quitar también la upload correspondiente del state local (evita card huérfana)
      setUploads((prev) => prev.filter((u) => {
        const uDate = u.sessionDate || toDateKey(u.inferred?.startAt)
        const uShift = u.shiftId || inferShiftIdFromSchedule(u.inferred?.startAt, shiftSchedule)
        return !(uDate === dateKey && uShift === shiftId)
      }))
    } catch {
      // silent — retry on next load
    } finally {
      setDeletingId(null)
    }
  }

  // M9 — Carga conteos de pausas sin anotar para el mes visible cuando el filtro está activo.
  // Solo procesa summaries con pausesCount > 0 para minimizar lecturas Firestore.
  useEffect(() => {
    if (!filterUntagged) return
    const summaryList = Array.from(historicalByDate.values()).flat()
    const pending = summaryList.filter(
      (s) => (s.pausesCount ?? 0) > 0 && !untaggedCounts.has(s.id),
    )
    if (pending.length === 0) return
    let cancelled = false
    setLoadingUntagged(true)
    Promise.all(
      pending.map(async (s) => {
        const data = await loadPausesAggregates(s.id)
        const count = data
          ? data.pauses.filter((p) => !resolveEffectiveTag(p)).length
          : 0
        return { id: s.id, count }
      }),
    )
      .then((results) => {
        if (cancelled) return
        setUntaggedCounts((prev) => {
          const next = new Map(prev)
          for (const { id, count } of results) next.set(id, count)
          return next
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingUntagged(false) })
    return () => { cancelled = true }
  }, [filterUntagged, historicalByDate]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Duración defensiva: si durationMinutes > 1440 (>24h, claramente anómalo),
   *  deriva de endAt–startAt y limita a 720 min (12h = turno completo máximo). */
  function safeDisplayMinutes(hist: GraderDailySummary): number | undefined {
    if (hist.durationMinutes == null || hist.durationMinutes <= 0) return undefined
    if (hist.durationMinutes > 1440 && hist.startAt && hist.endAt) {
      const span = Math.round(
        (new Date(hist.endAt).getTime() - new Date(hist.startAt).getTime()) / 60_000,
      )
      if (span > 0 && span <= 1440) return span
      return undefined // span también inválido → no mostrar
    }
    return hist.durationMinutes
  }

  /** Tasa de producción defensiva: recalcula desde piezas / duraciónDisplay. */
  function safeRate(hist: GraderDailySummary): number | undefined {
    const mins = safeDisplayMinutes(hist)
    if (!mins || mins <= 0) return undefined
    return Math.round(hist.totalPieces / (mins / 60))
  }

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className={cn('border-red-300', className)}>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn(stacked ? 'flex flex-col gap-4' : 'grid grid-cols-1 lg:grid-cols-3 gap-4', className)}>
      <Card className={cn('relative', !stacked && 'lg:col-span-2')}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-lg">
              {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
            </CardTitle>
            <Button variant="outline" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {/* M9 — Filtro pausas sin anotar */}
          <Button
            variant={filterUntagged ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'gap-1.5 text-xs',
              filterUntagged && 'bg-amber-500 hover:bg-amber-600 border-amber-500 text-white',
            )}
            onClick={() => setFilterUntagged((v) => !v)}
          >
            {loadingUntagged
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Tag className="h-3.5 w-3.5" />}
            Sin anotar
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="h-20" />

              const dayKey = day.toISOString().slice(0, 10)
              const dayUploads = uploadsByDate.get(dayKey) || []
              const dayHistorical = historicalByDate.get(dayKey) || []
              const chipsForDay = chipsByDate.get(dayKey) ?? []
              // Chips no-orphan = los que aportaron piezas reales este día (primary/secondary)
              const chipsWithPieces = chipsForDay.filter((c) => c.role !== 'orphan-source')
              const hasData = chipsWithPieces.length > 0

              // worstP0: del agregado calendárico real (no del Math.max de summaries legacy).
              // Para el coloreado del borde, usamos el peor P0% entre los turnos que realmente
              // contribuyeron al día (incluye turno entrante de ayer + turnos propios).
              const worstP0 = chipsWithPieces.length > 0
                ? Math.max(...chipsWithPieces.map((c) => c.pointZeroPct))
                : null

              const missingPiece = hasData && dayHistorical.some((s) => s.hasPieceData === false)
              const missingGate0 = hasData && dayHistorical.some((s) => s.hasGate0Data === false)
              const isSelected = selectedDate?.toDateString() === day.toDateString()

              // M9 — un día tiene untagged si algún chip primary/orphan-source del día
              // (no contamos secondary para evitar doble-marcar el mismo summary)
              const dayHasUntagged = filterUntagged && chipsForDay.length > 0
                ? chipsForDay.some(
                    (c) =>
                      (c.role === 'primary' || c.role === 'orphan-source') &&
                      (untaggedCounts.get(c.summaryId) ?? 0) > 0,
                  )
                : false
              const dimByFilter = filterUntagged && chipsForDay.length > 0 && !dayHasUntagged

              return (
                <button
                  key={dayKey}
                  className={cn(
                    'h-24 p-1.5 border rounded-lg text-left transition-all flex flex-col gap-0.5',
                    isToday(day) && !isSelected && 'border-primary/60 bg-primary/5',
                    isSelected && 'ring-2 ring-primary border-primary bg-primary/8',
                    !hasData && dayUploads.length === 0 && 'opacity-40',
                    hasData && worstP0 !== null && worstP0 >= DEFAULT_P0_CRITICAL_PCT && 'border-red-400/50 bg-red-500/3',
                    hasData && worstP0 !== null && worstP0 >= DEFAULT_P0_ALERT_PCT && worstP0 < DEFAULT_P0_CRITICAL_PCT && 'border-amber-400/50',
                    hasData && worstP0 !== null && worstP0 < DEFAULT_P0_ALERT_PCT && 'border-emerald-400/40',
                    dimByFilter && 'opacity-20 pointer-events-none',
                    dayHasUntagged && !isSelected && 'border-amber-400/70 bg-amber-500/5',
                  )}
                  onClick={() => setSelectedDate(day)}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'text-sm font-semibold leading-none',
                      isToday(day) && 'text-primary',
                      isSelected && 'text-primary',
                    )}>
                      {day.getDate()}
                    </span>
                    {!hasData && dayUploads.length > 0 && (
                      <span className="text-[8px] text-muted-foreground leading-none border rounded px-0.5">
                        {dayUploads.length}f
                      </span>
                    )}
                  </div>

                  {/* Per-shift chips (Camino 2-B refinado: primary/secondary/orphan-source) */}
                  {chipsForDay.map((chip) => renderShiftChip(chip, filterUntagged ? (untaggedCounts.get(chip.summaryId) ?? null) : null))}

                  {/* Missing data badges */}
                  {(missingPiece || missingGate0) && (
                    <div className="mt-auto flex gap-0.5">
                      {missingPiece && (
                        <span className="text-[7px] leading-3 px-0.5 rounded bg-red-500/20 text-red-600 font-medium">PP</span>
                      )}
                      {missingGate0 && (
                        <span className="text-[7px] leading-3 px-0.5 rounded bg-red-500/20 text-red-600 font-medium">P0</span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="relative">
        <CardHeader>
          <CardTitle className="text-base">
            {selectedKey ? `Resumen ${selectedKey}` : 'Resumen diario'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Sin uploads ni historial ni aportes calendáricos: placeholders por turno */}
          {selectedKey && selectedUploads.length === 0 && summariesForSelectedDay.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                <Clock className="h-3.5 w-3.5" />
                Sin Excel cargado todavía
              </p>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {(['Turno día', 'Turno noche'] as const).map(shiftId => (
                  <div
                    key={shiftId}
                    className="rounded-lg border border-dashed border-muted-foreground/30 p-3 space-y-2 bg-background/30"
                  >
                    <div className="flex items-center gap-2">
                      {shiftId === 'Turno día'
                        ? <Sun className="h-4 w-4 text-amber-500" />
                        : <Moon className="h-4 w-4 text-indigo-400" />}
                      <p className="text-sm font-medium">{shiftId}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      Sin registros. Podés ir guardando los cambios de gate que reporta control de producción —
                      al subir el Excel se cruzarán con tu historial.
                    </p>
                    <QuickGateChangeButton
                      shiftDocId={`${selectedKey}__${shiftId}`}
                      variant="compact"
                      className="w-full h-7 text-[11px]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* ── Datos históricos (carga masiva) — incluye aportes calendáricos ── */}
          {selectedKey && summariesForSelectedDay.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                  <Database className="h-3.5 w-3.5" />
                  Historial guardado
                </p>
                {/* M12 — Botón comparación D↔N (solo cuando hay ambos turnos) */}
                {(() => {
                  const hists = historicalByDate.get(selectedKey) ?? []
                  const hasDia   = hists.some((h) => h.shiftId === 'Turno día')
                  const hasNoche = hists.some((h) => h.shiftId === 'Turno noche')
                  if (!hasDia || !hasNoche) return null
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 px-2 border-indigo-500/30 text-indigo-500 hover:bg-indigo-500/10"
                      onClick={() => setShowComparison(true)}
                    >
                      <GitCompare className="h-3 w-3" />
                      D↔N
                    </Button>
                  )
                })()}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[...groupedByShift.entries()]
                .sort(([a], [b]) => {
                  const order: Record<string, number> = { 'Turno día': 0, 'Turno noche': 1 }
                  return (order[a] ?? 9) - (order[b] ?? 9)
                })
                .map(([shiftId, entries]) => {
                  const nonOrphan = entries.filter((e) => e.chip?.role !== 'orphan-source')
                  const isMultiple = nonOrphan.length > 1
                  if (isMultiple) {
                    // Card consolidada: agrega fragmentos del mismo turno-tipo
                    return renderConsolidatedShiftCard(shiftId, entries, navigate)
                  }
                  // Card simple (1 fragmento o solo orphans): comportamiento original
                  const { summary: hist, chip } = entries[0]!
                  const isActiveForConfig = selectedHistorical?.id === hist.id
                  // Badge contextual sobre cómo este turno se relaciona con el día seleccionado
                  const contextBadge =
                    chip?.role === 'orphan-source' ? {
                      cls: 'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
                      text: `Sin actividad real este día — detalle en ${chip.primaryDateKey ?? '—'}`,
                    } :
                    chip?.role === 'secondary' ? {
                      cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                      text: chip.direction === 'exits'
                        ? `Vespertina · ${Math.round(chip.pctOfShift ?? 0)}% del turno aquí`
                        : `Madrugada · ${Math.round(chip.pctOfShift ?? 0)}% del turno aquí`,
                    } :
                    chip?.role === 'primary' && chip.direction === 'enters' ? {
                      cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
                      text: `Madrugada · ${Math.round(chip.pctOfShift ?? 100)}% del turno aquí`,
                    } :
                    chip?.role === 'primary' && chip.direction === 'exits' ? {
                      cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
                      text: `Vespertina · ${Math.round(chip.pctOfShift ?? 100)}% del turno aquí`,
                    } : null
                  return (
                  <div
                    key={hist.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedHistorical(isActiveForConfig ? null : hist)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setSelectedHistorical(isActiveForConfig ? null : hist)
                      }
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 space-y-2 cursor-pointer transition-all',
                      P0_CARD_CLASS[p0StatusFromPct(hist.pointZeroPct)],
                      isActiveForConfig && 'ring-2 ring-emerald-500 ring-offset-1 ring-offset-background',
                      chip?.role === 'orphan-source' && 'opacity-70',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium">{hist.shiftId}</p>
                          {contextBadge && (
                            <span className={cn('text-[9px] px-1.5 py-0.5 rounded border font-medium', contextBadge.cls)}>
                              {contextBadge.text}
                            </span>
                          )}
                          {(configChangeCounts.get(hist.id) ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-600 border border-amber-500/30 font-medium shrink-0"
                              title={`${configChangeCounts.get(hist.id)} cambio${configChangeCounts.get(hist.id) === 1 ? '' : 's'} de gate registrado${configChangeCounts.get(hist.id) === 1 ? '' : 's'}`}
                            >
                              <Wrench className="w-2.5 h-2.5" />
                              {configChangeCounts.get(hist.id)}
                            </span>
                          )}
                        </div>
                        {hist.hasPieceData !== undefined && (!hist.hasPieceData || !hist.hasGate0Data) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {!hist.hasPieceData && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 font-medium">
                                Falta PIEZA_PIEZA
                              </span>
                            )}
                            {!hist.hasGate0Data && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 font-medium">
                                Falta PUERTA_0
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={cn(
                        'text-lg font-bold tabular-nums',
                        p0StatusColor(p0StatusFromPct(hist.pointZeroPct)),
                      )}>
                        {hist.pointZeroPct}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <div className="rounded bg-background/60 px-2 py-1">
                        <p className="text-muted-foreground">Piezas</p>
                        <p className="font-semibold">{hist.totalPieces.toLocaleString('es-CL')}</p>
                      </div>
                      <div className="rounded bg-background/60 px-2 py-1">
                        <p className="text-muted-foreground">P0 piezas</p>
                        <p className="font-semibold">{hist.pointZeroPieces.toLocaleString('es-CL')}</p>
                      </div>
                      {hist.totalWeightKg != null && (
                        <div className="rounded bg-background/60 px-2 py-1">
                          <p className="text-muted-foreground">Peso</p>
                          <p className="font-semibold">
                            {hist.totalWeightKg >= 1000
                              ? `${(hist.totalWeightKg / 1000).toFixed(1)} t`
                              : `${hist.totalWeightKg.toFixed(0)} kg`}
                          </p>
                        </div>
                      )}
                      {(() => {
                        const rate = safeRate(hist)
                        return rate != null ? (
                          <div className="rounded bg-background/60 px-2 py-1">
                            <p className="text-muted-foreground">pz/hora</p>
                            <p className="font-semibold">{rate.toLocaleString('es-CL')}</p>
                          </div>
                        ) : null
                      })()}
                    </div>
                    {hist.topP0Causes && hist.topP0Causes.length > 0 && (
                      <div className="text-xs space-y-0.5">
                        <p className="text-muted-foreground font-medium">Top causas P0:</p>
                        {hist.topP0Causes.slice(0, 3).map((c, i) => {
                          // Label bonito Matrix + % del total (intuitivo) en lugar de % del P0
                          const label = getCauseLabel(c.error)
                          const pctOfTotal = (c.pct * hist.pointZeroPct) / 100
                          return (
                            <div key={i} className="flex justify-between gap-2">
                              <span className="text-muted-foreground truncate flex-1">{label}</span>
                              <span className="font-semibold tabular-nums shrink-0">
                                {pctOfTotal.toFixed(2)}%
                                <span className="text-muted-foreground/70 font-normal text-[10px]"> ({c.pct.toFixed(0)}% P0)</span>
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {(() => {
                      const mins = safeDisplayMinutes(hist)
                      const anomalous = hist.durationMinutes != null && hist.durationMinutes > 1440
                      return mins != null && mins > 0 ? (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {Math.floor(mins / 60)}h {mins % 60}m
                          {hist.startAt && ` · ${new Date(hist.startAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}–${hist.endAt ? new Date(hist.endAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '?'}`}
                          {anomalous && <span title="Duración almacenada anómala — se muestra estimación"><AlertTriangle className="h-3 w-3 text-amber-500 ml-1" /></span>}
                        </p>
                      ) : anomalous ? (
                        <p className="text-[10px] text-amber-500 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Duración anómala — registro posiblemente fusionado
                        </p>
                      ) : null
                    })()}
                    <div className="pt-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          className="h-7 text-[11px] flex-1 bg-primary/90 hover:bg-primary text-primary-foreground"
                          onClick={() => navigate(`/analisis-grader/turno/${hist.dateKey}__${encodeURIComponent(hist.shiftId)}`)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Ver detalle
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] text-red-600 hover:text-red-600 border-red-500/30 hover:bg-red-500/10"
                          disabled={deletingId === hist.id}
                          onClick={() => handleDeleteSummary(hist.dateKey, hist.shiftId)}
                        >
                          {deletingId === hist.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Trash2 className="h-3 w-3" />
                          }
                        </Button>
                      </div>
                      <QuickGateChangeButton
                        shiftDocId={`${hist.dateKey}__${hist.shiftId}`}
                        variant="compact"
                        className="w-full h-7 text-[11px]"
                      />
                    </div>
                  </div>
                )})}
              </div>
            </div>
          )}

          {selectedUploads.length > 0 && (() => {
            // Ocultar turnos que ya tienen resumen en historial guardado
            const histShifts = new Set((historicalByDate.get(selectedKey ?? '') ?? []).map((h) => h.shiftId))
            const entries = Array.from(turnos.entries()).filter(([s]) => !histShifts.has(s))
            if (entries.length === 0) return null
            return (
            <div className="space-y-3">
              {entries.map(([shiftId, items]) => {
                const key = `${selectedKey}::${shiftId}`
                const summary = summaries[key]
                const minStart = items
                  .map((i) => i.inferred?.startAt)
                  .filter(Boolean)
                  .sort()[0]
                const maxEnd = items
                  .map((i) => i.inferred?.endAt)
                  .filter(Boolean)
                  .sort()
                  .slice(-1)[0]

                return (
                  <div key={shiftId} className="border border-muted/60 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{shiftId}</p>
                        <p className="text-xs text-muted-foreground">
                          {items.length} archivo(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {summary?.source && (
                          <Badge variant="secondary" className="text-[10px]">
                            {summary.source === 'cached' ? 'Guardado' : 'Calculado'}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/analisis-grader/turno/${selectedKey}__${encodeURIComponent(shiftId)}`)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          Ver detalle
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleLoadTurno(selectedKey!, shiftId)}>
                          Cargar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleComputeSummary(selectedKey!, shiftId)}>
                          Resumen
                        </Button>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {minStart && maxEnd
                        ? `${new Date(minStart).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} - ${new Date(maxEnd).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`
                        : 'Horario no detectado'}
                    </div>

                    {summary?.loading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Calculando resumen...
                      </div>
                    )}
                    {summary?.error && (
                      <div className="text-xs text-destructive">{summary.error}</div>
                    )}
                    {summary?.data && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded bg-muted/40">
                          <div className="text-muted-foreground">Piezas</div>
                          <div className="font-semibold">{fmt(summary.data.totalPieces)}</div>
                        </div>
                        <div className="p-2 rounded bg-muted/40">
                          <div className="text-muted-foreground">P0 %</div>
                          <div className="font-semibold">{summary.data.pointZeroPct}%</div>
                        </div>
                        <div className="p-2 rounded bg-muted/40 col-span-2">
                          <div className="text-muted-foreground">P0 piezas</div>
                          <div className="font-semibold">{fmt(summary.data.pointZeroPieces)}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            )
          })()}
        </CardContent>
      </Card>

      {/* M12 — Modal comparación día vs noche */}
      {showComparison && selectedKey && (() => {
        const hists = historicalByDate.get(selectedKey) ?? []
        const dia   = hists.find((h) => h.shiftId === 'Turno día')
        const noche = hists.find((h) => h.shiftId === 'Turno noche')
        if (!dia || !noche) return null
        return (
          <DayComparisonModal
            open={showComparison}
            onClose={() => setShowComparison(false)}
            summaries={[dia, noche]}
            dateKey={selectedKey}
          />
        )
      })()}
    </div>
  )
}
