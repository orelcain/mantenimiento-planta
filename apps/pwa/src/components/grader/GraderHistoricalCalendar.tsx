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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
    // Chip atenuado en el día schedule sin actividad real.
    // Color indigo (consistente con el banner del TurnoPage y badge del panel
    // resumen del día) para diferenciarlo de "celda vacía" gris neutro.
    return (
      <div
        key={key}
        title={`Turno ${chip.shiftId.toLowerCase()} programado pero sin actividad este día. Detalle en ${chip.primaryDateKey ?? 'otro día'}.`}
        className="flex items-center justify-between rounded px-1 py-0.5 leading-none bg-indigo-500/15 text-indigo-300 border border-indigo-500/25"
      >
        <span className="text-[8px] font-medium line-through opacity-80">{baseLetter}⌧</span>
        <span className="text-[8px] tabular-nums opacity-90">→ {chip.primaryDateKey?.slice(8) ?? '--'}</span>
      </div>
    )
  }

  if (chip.role === 'secondary') {
    // Chip chico atenuado: % del fragmento (no P0%) para indicar continuidad.
    // OCULTO en mobile (<640px) para reducir densidad — sigue accesible en
    // el panel "Resumen del día" abajo.
    const pct = chip.pctOfShift != null ? Math.round(chip.pctOfShift) : 0
    return (
      <div
        key={key}
        title={`${chip.shiftId} ${chip.shiftDateKey} → este día aportó ${pct}% de la carga (P0% del turno completo: ${p0.toFixed(1)}%)`}
        className={cn(
          'hidden sm:flex items-center justify-between rounded px-1 leading-none opacity-60 hover:opacity-100 transition-opacity',
          colorByP0,
        )}
        style={{ paddingTop: 0, paddingBottom: 0, height: '13px' }}
      >
        <span className="text-[8px] font-medium opacity-80">{label}</span>
        <span className="text-[8px] font-semibold tabular-nums">{pct}%</span>
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
 * Tipo de card según el rol temporal del fragmento en el día calendárico.
 *
 * - `madrugada`: turno noche que arrancó AYER y deja sus piezas en este día (00:00 → endAt).
 *   Render como card completa con icono `🌙→` y badge de orden temporal `1/N`.
 * - `dia`: turno día completo en este día calendárico. Card completa con icono `☀`.
 * - `vespertina`: reservado, actualmente nunca se renderiza — todos los `direction=exits`
 *   se ocultan (aparecen como Madrugada en el día siguiente al deslizar).
 * - `salida`: turno noche programado en este día sin actividad real (ej. Domingos en
 *   Feb 2026). Render como strip compacto que invita a deslizar al primaryDateKey.
 */
type CardKind = 'madrugada' | 'dia' | 'vespertina' | 'salida'

interface EnrichedCardEntry {
  summary: GraderDailySummary
  chip: ShiftChipDescriptor | null
  kind: CardKind
  /** Minutos desde 00:00 del día calendárico — usado para ordenamiento cronológico */
  sortMin: number
  /** Identificador único del fragmento en este día (para sincronizar con timeline #32) */
  fragId: string
}

/** Wall-clock-as-UTC: extrae minutos-del-día (0-1439) desde un ISO. */
function getStartMinutesUTC(iso: string | undefined): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/**
 * Convierte los entries del día calendárico en cards enriquecidas con `kind`
 * temporal y orden cronológico. Filtra TODOS los `direction=exits` no-orphan
 * (aparecen como Madrugada en el día siguiente — máximo 2 cards por día).
 */
function enrichEntriesByKind(
  entries: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>,
): EnrichedCardEntry[] {
  const visible = entries.filter(
    (e) => e.chip?.role === 'orphan-source' || e.chip?.direction !== 'exits',
  )

  return visible
    .map(({ summary, chip }): EnrichedCardEntry => {
      let kind: CardKind
      let sortMin: number
      let fragSuffix: string

      if (chip?.role === 'orphan-source') {
        kind = 'salida'
        sortMin = 99999
        fragSuffix = 'sal'
      } else if (chip?.direction === 'enters') {
        kind = 'madrugada'
        sortMin = 0
        fragSuffix = 'mad'
      } else {
        kind = 'dia'
        sortMin = getStartMinutesUTC(summary.startAt) ?? 9 * 60
        fragSuffix = 'dia'
      }

      return {
        summary,
        chip,
        kind,
        sortMin,
        fragId: `${summary.id}-${fragSuffix}`,
      }
    })
    .sort((a, b) => a.sortMin - b.sortMin)
}

/** Formatea el rango horario del fragmento. Usa wall-clock-as-UTC. */
function formatShiftTimeRange(summary: GraderDailySummary): string {
  const fmt = (iso: string | undefined) =>
    iso
      ? new Date(iso).toLocaleTimeString('es-CL', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'UTC',
        })
      : '?'
  const dayPart = (iso: string | undefined) => (iso ? iso.slice(0, 10).slice(5) : '??')

  const start = fmt(summary.startAt)
  const end = fmt(summary.endAt)
  const startDay = dayPart(summary.startAt)
  const endDay = dayPart(summary.endAt)

  if (startDay === endDay) return `${start} → ${end}`
  return `${startDay} ${start} → ${endDay} ${end}`
}

const KIND_META: Record<CardKind, { icon: string; title: string }> = {
  madrugada:  { icon: '🌙→', title: 'Madrugada' },
  dia:        { icon: '☀',   title: 'Día' },
  vespertina: { icon: '←🌙', title: 'Vespertina' },
  salida:     { icon: '🌙',  title: 'Turno noche' },
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

// ── Paso 3: timeline 24h ──────────────────────────────────────────────────────

interface TimelineBlock {
  leftPct: number
  widthPct: number
  bgClass: string
  label: string
  title: string
  nightSide: 'start' | 'end' | null  // madrugada = start (sin radius izq), vespertina = end (sin radius der)
}

/**
 * Convierte los summaries del día calendario en bloques posicionados en una
 * barra 24h (0 = medianoche, 1 = siguiente medianoche).
 *
 * Los timestamps del Grader son wall-clock-as-UTC, así que se usa getUTC*
 * para recuperar la hora Chile local.
 */
function buildDayTimelineBlocks(
  entries: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>,
): TimelineBlock[] {
  const blocks: TimelineBlock[] = []
  for (const { summary: hist, chip } of entries) {
    if (chip?.role === 'orphan-source') continue
    if (!hist.startAt || !hist.endAt) continue

    const startD = new Date(hist.startAt)
    const endD   = new Date(hist.endAt)
    const direction = chip?.direction ?? 'same'

    // Wall-clock-as-UTC → getUTC* para hora Chile local
    const startMin = startD.getUTCHours() * 60 + startD.getUTCMinutes()
    const endMin   = endD.getUTCHours()   * 60 + endD.getUTCMinutes()

    let startFrac: number, endFrac: number
    if (direction === 'enters') {
      // Madrugada: turno entró de la noche anterior → ocupa 00:00 hasta endAt
      startFrac = 0
      endFrac   = endMin / 1440
    } else if (direction === 'exits') {
      // Vespertina: turno sale hacia el día siguiente → ocupa startAt hasta 24:00
      startFrac = startMin / 1440
      endFrac   = 1
    } else {
      // Turno completo dentro del día calendario
      startFrac = startMin / 1440
      endFrac   = endMin   / 1440
      if (endFrac <= startFrac) endFrac = Math.min(1, startFrac + 0.02)
    }

    const status = p0StatusFromPct(hist.pointZeroPct)
    const bgClass =
      status === 'ok'    ? 'bg-emerald-500/65' :
      status === 'alert' ? 'bg-amber-500/65'   :
                           'bg-rose-500/65'

    const base  = hist.shiftId === 'Turno día' ? 'D' : 'N'
    const label =
      direction === 'enters' ? `→${base}` :
      direction === 'exits'  ? `${base}→` :
      base

    const pad = (n: number) => String(n).padStart(2, '0')
    const ts = `${pad(startD.getUTCHours())}:${pad(startD.getUTCMinutes())}–${pad(endD.getUTCHours())}:${pad(endD.getUTCMinutes())}`
    const pct = chip?.pctOfShift != null ? ` · ${Math.round(chip.pctOfShift)}% en este día` : ''
    blocks.push({
      leftPct:  startFrac * 100,
      widthPct: (endFrac - startFrac) * 100,
      bgClass, label,
      title: `${hist.shiftId} · P0 ${hist.pointZeroPct.toFixed(2)}% · ${ts}${pct}`,
      nightSide: direction === 'enters' ? 'start' : direction === 'exits' ? 'end' : null,
    })
  }
  return blocks
}
// ─────────────────────────────────────────────────────────────────────────────

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
  // Paso 3b — carousel de timelines entre días
  const [carouselX, setCarouselX]     = useState(0)       // px offset durante el drag
  const [carouselAnim, setCarouselAnim] = useState(false)  // CSS transition on/off
  const carouselViewportRef = useRef<HTMLDivElement>(null)
  const carouselDragRef = useRef<{ startX: number; vx: number; lastX: number; lastT: number; navigating: boolean } | null>(null)
  const carouselMomentumRef = useRef<number | null>(null) // rafId de la inercia activa
  const carouselStateRef = useRef<{ sortedDayKeys: string[]; currentIdx: number }>({ sortedDayKeys: [], currentIdx: 0 })
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

  // Días navegables (Paso 2/3): días con actividad real del mes, en orden
  const sortedDayKeys = useMemo(() => [...calendarAgg.keys()].sort(), [calendarAgg])

  const selectedKey = selectedDate ? selectedDate.toISOString().slice(0, 10) : null

  // Sincroniza ref mutable para acceso imperativo dentro del RAF de inercia
  useEffect(() => {
    carouselStateRef.current.sortedDayKeys = sortedDayKeys
    carouselStateRef.current.currentIdx = Math.max(0, sortedDayKeys.indexOf(selectedKey ?? ''))
  }, [sortedDayKeys, selectedKey])

  // Teclado ←/→ para navegar entre días (ignora eventos desde inputs)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]')) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const state = carouselStateRef.current
      const dir = e.key === 'ArrowRight' ? 1 : -1
      const newIdx = state.currentIdx + dir
      if (newIdx < 0 || newIdx >= state.sortedDayKeys.length) return
      e.preventDefault()
      if (carouselMomentumRef.current !== null) {
        cancelAnimationFrame(carouselMomentumRef.current)
        carouselMomentumRef.current = null
      }
      const key = state.sortedDayKeys[newIdx]!
      const d = new Date(`${key}T00:00:00`)
      setSelectedDate(d)
      setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, []) // refs y setters de useState son estables entre renders

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

  // Generalización de summariesForSelectedDay para cualquier clave (slides adyacentes)
  const getSummariesForDay = useCallback(
    (key: string | null): Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }> => {
      if (!key) return []
      const out: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }> = []
      const seen = new Set<string>()
      const dayChips = chipsByDate.get(key) ?? []
      for (const chip of dayChips) {
        if (chip.role === 'orphan-source') continue
        const s = summariesById.get(chip.summaryId)
        if (s && !seen.has(s.id)) { out.push({ summary: s, chip }); seen.add(s.id) }
      }
      for (const s of historicalByDate.get(key) ?? []) {
        if (seen.has(s.id)) continue
        const orphanChip = dayChips.find((c) => c.summaryId === s.id && c.role === 'orphan-source') ?? null
        out.push({ summary: s, chip: orphanChip }); seen.add(s.id)
      }
      return out
    },
    [chipsByDate, historicalByDate, summariesById],
  )

  // Slides adyacentes (Paso 3b): claves y entradas del día anterior y siguiente
  const { prevKey, nextKey, prevEntries, nextEntries } = useMemo(() => {
    const idx = sortedDayKeys.indexOf(selectedKey ?? '')
    const prevKey = idx > 0 ? sortedDayKeys[idx - 1]! : null
    const nextKey = idx < sortedDayKeys.length - 1 ? sortedDayKeys[idx + 1]! : null
    return {
      prevKey,
      nextKey,
      prevEntries:  getSummariesForDay(prevKey),
      nextEntries:  getSummariesForDay(nextKey),
    }
  }, [sortedDayKeys, selectedKey, getSummariesForDay])

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

  /**
   * Render de las cards de un slide del carousel: sub-header agg calendárico +
   * header "📂 X turnos" + grid de cards en orden temporal.
   *
   * Cada slide del carousel renderiza sus PROPIAS cards calculadas con sus
   * propios entries — al deslizar el track horizontal, las cards del slide
   * adyacente entran en pantalla junto con su timeline.
   *
   * `isSelectedSlide` indica si este slide es el día actualmente seleccionado:
   *   - `true`: el ring `selectedHistorical` y el botón D↔N están activos.
   *   - `false`: cards en modo "preview" — sin ring activo, sin botón D↔N.
   */
  const renderSlideCards = (
    slideKey: string | null,
    entries: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>,
    isSelectedSlide: boolean,
  ): JSX.Element | null => {
    if (!slideKey || entries.length === 0) return null
    const enriched = enrichEntriesByKind(entries)
    if (enriched.length === 0) return null
    const visibleCount = enriched.filter((e) => e.kind !== 'salida').length
    const allSalida = enriched.length > 0 && enriched.every((e) => e.kind === 'salida')
    const headerText = allSalida
      ? '📂 Turno noche programado en este día'
      : `📂 ${visibleCount} ${visibleCount === 1 ? 'turno' : 'turnos'} · ordenados por hora de inicio`

    const agg = calendarAgg.get(slideKey)
    let visibleIdx = 0

    return (
      <div className="space-y-2 px-6 pt-3">
        {/* Sub-header con agregado calendárico real del día */}
        {agg && agg.totalPieces > 0 && (() => {
          const status = p0StatusFromPct(agg.pointZeroPct)
          const hours = Math.floor(agg.activeMinutes / 60)
          const mins = agg.activeMinutes % 60
          const nFragments = agg.contributingShifts.length
          return (
            <div
              className={cn(
                'rounded-md border px-3 py-2 flex items-center justify-between gap-3 flex-wrap',
                P0_CARD_CLASS[status],
              )}
              title="Agregado calendárico real del día — suma de fragmentos físicamente procesados aquí"
            >
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Día calendárico</span>
                <span className={cn('text-lg font-bold tabular-nums', p0StatusColor(status))}>
                  {agg.pointZeroPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                <span><strong className="text-foreground">{agg.totalPieces.toLocaleString('es-CL')}</strong> pz</span>
                {agg.totalWeightKg != null && agg.totalWeightKg > 0 && (
                  <span>
                    <strong className="text-foreground">
                      {agg.totalWeightKg >= 1000
                        ? `${(agg.totalWeightKg / 1000).toFixed(1)} t`
                        : `${agg.totalWeightKg.toFixed(0)} kg`}
                    </strong>
                  </span>
                )}
                {agg.activeMinutes > 0 && (
                  <span><strong className="text-foreground">{hours}h {mins}m</strong> activos</span>
                )}
                <span>{nFragments} {nFragments === 1 ? 'fragmento' : 'fragmentos'}</span>
              </div>
            </div>
          )
        })()}

        {/* Header con count y D↔N button (solo en slide seleccionado) */}
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
            <Database className="h-3.5 w-3.5" />
            {headerText}
          </p>
          {isSelectedSlide && (() => {
            const hists = historicalByDate.get(slideKey) ?? []
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

        {/* Grid de cards en orden temporal */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {enriched.map((entry) => {
            const { summary: hist, chip, kind, fragId } = entry
            if (kind !== 'salida') visibleIdx += 1
            const orderText =
              kind === 'salida' || visibleCount <= 1
                ? ''
                : `${visibleIdx}/${visibleCount}`
            const meta =
              kind === 'dia' && hist.shiftId === 'Turno noche'
                ? { icon: '🌙', title: 'Noche' }
                : KIND_META[kind]
            const status = p0StatusFromPct(hist.pointZeroPct)
            const fragPieces = chip?.pieces ?? hist.totalPieces
            const fragP0Pieces = chip?.pointZeroPieces ?? hist.pointZeroPieces
            const fragWeight = chip?.weightKg ?? hist.totalWeightKg
            const isActiveForConfig = isSelectedSlide && selectedHistorical?.id === hist.id
            const navigateToTurno = () =>
              navigate(
                `/analisis-grader/turno/${hist.dateKey}__${encodeURIComponent(hist.shiftId)}`,
              )
            // Click en cuerpo de card: en slide seleccionado alterna selectedHistorical
            // (legacy del wizard); en slides adyacentes navega directo al TurnoPage.
            const onCardClick = isSelectedSlide
              ? () => setSelectedHistorical(isActiveForConfig ? null : hist)
              : navigateToTurno

            // ── Salida (orphan-source): strip compacto que invita a deslizar
            if (kind === 'salida') {
              return (
                <div
                  key={hist.id}
                  data-frag-id={fragId}
                  role="button"
                  tabIndex={0}
                  onClick={navigateToTurno}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigateToTurno()
                    }
                  }}
                  className={cn(
                    'rounded-lg border-l-4 px-3 py-2 cursor-pointer transition-opacity opacity-80 hover:opacity-100 lg:col-span-2',
                    P0_CARD_CLASS[status],
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">{meta.icon}</span>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold leading-tight">
                          {hist.shiftId}
                          <span className="text-muted-foreground"> · </span>
                          <strong>{formatShiftTimeRange(hist)}</strong>
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          Sin actividad real en este día — desliza{' '}
                          <span className="text-foreground">→</span>{' '}
                          para ver datos en {chip?.primaryDateKey ?? 'el siguiente día'}
                        </p>
                      </div>
                    </div>
                    {hist.pointZeroPct > 0 && (
                      <span
                        className={cn(
                          'text-sm font-bold tabular-nums shrink-0',
                          p0StatusColor(status),
                        )}
                      >
                        {hist.pointZeroPct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>
              )
            }

            // ── Card completa (madrugada / día / vespertina)
            return (
              <div
                key={hist.id}
                data-frag-id={fragId}
                role="button"
                tabIndex={0}
                onClick={onCardClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCardClick()
                  }
                }}
                className={cn(
                  'rounded-lg border-2 border-l-4 px-3 py-2.5 space-y-2 cursor-pointer transition-all',
                  P0_CARD_CLASS[status],
                  isActiveForConfig &&
                    'ring-2 ring-emerald-500 ring-offset-1 ring-offset-background',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base leading-none">{meta.icon}</span>
                    <p className="text-sm font-semibold">{meta.title}</p>
                    {orderText && (
                      <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                        {orderText}
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
                  <span
                    className={cn(
                      'text-xl font-bold tabular-nums',
                      p0StatusColor(status),
                    )}
                  >
                    {hist.pointZeroPct}%
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {hist.shiftId}
                  <span className="opacity-60"> · </span>
                  <strong className="text-foreground/90">{formatShiftTimeRange(hist)}</strong>
                  {chip?.pctOfShift != null && chip.pctOfShift < 100 && (
                    <span className="opacity-70"> · {Math.round(chip.pctOfShift)}% del turno aquí</span>
                  )}
                </p>
                {hist.hasPieceData !== undefined && (!hist.hasPieceData || !hist.hasGate0Data) && (
                  <div className="flex flex-wrap gap-1">
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
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="rounded bg-background/60 px-2 py-1">
                    <p className="text-muted-foreground">Piezas</p>
                    <p className="font-semibold tabular-nums">{fragPieces.toLocaleString('es-CL')}</p>
                  </div>
                  <div className="rounded bg-background/60 px-2 py-1">
                    <p className="text-muted-foreground">P0 piezas</p>
                    <p className="font-semibold tabular-nums">{fragP0Pieces.toLocaleString('es-CL')}</p>
                  </div>
                  {fragWeight != null && (
                    <div className="rounded bg-background/60 px-2 py-1">
                      <p className="text-muted-foreground">Peso</p>
                      <p className="font-semibold tabular-nums">
                        {fragWeight >= 1000
                          ? `${(fragWeight / 1000).toFixed(1)} t`
                          : `${fragWeight.toFixed(0)} kg`}
                      </p>
                    </div>
                  )}
                  {(() => {
                    const rate = safeRate(hist)
                    return rate != null ? (
                      <div className="rounded bg-background/60 px-2 py-1">
                        <p className="text-muted-foreground">pz/hora</p>
                        <p className="font-semibold tabular-nums">{rate.toLocaleString('es-CL')}</p>
                      </div>
                    ) : null
                  })()}
                </div>
                {hist.topP0Causes && hist.topP0Causes.length > 0 && (
                  <div className="text-xs space-y-0.5">
                    <p className="text-muted-foreground font-medium">Top causas P0:</p>
                    {hist.topP0Causes.slice(0, 3).map((c, i) => {
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
                      variant="outline"
                      className={cn(
                        'h-7 text-[11px] flex-1 gap-1 border',
                        status === 'critical' && 'bg-red-500/10 text-red-600 hover:bg-red-500/20 border-red-500/30',
                        status === 'alert' && 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 border-amber-500/30',
                        status === 'ok' && 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 border-emerald-500/30',
                      )}
                      onClick={navigateToTurno}
                    >
                      <Eye className="h-3 w-3" />
                      Ver detalle →
                    </Button>
                    {isSelectedSlide && (
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
                    )}
                  </div>
                  {isSelectedSlide && (
                    <QuickGateChangeButton
                      shiftDocId={`${hist.dateKey}__${hist.shiftId}`}
                      variant="compact"
                      className="w-full h-7 text-[11px]"
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Paso 3b: carousel de timelines entre días (Opción C — inercia libre) ────

  function stopCarouselMomentum() {
    if (carouselMomentumRef.current !== null) {
      cancelAnimationFrame(carouselMomentumRef.current)
      carouselMomentumRef.current = null
    }
  }

  function carouselPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button,a,input,select,textarea')) return
    stopCarouselMomentum()
    if (carouselDragRef.current?.navigating) return
    carouselDragRef.current = { startX: e.clientX, vx: 0, lastX: e.clientX, lastT: performance.now(), navigating: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setCarouselAnim(false)
  }

  function carouselPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!carouselDragRef.current || carouselDragRef.current.navigating) return
    const now = performance.now()
    const dt  = now - carouselDragRef.current.lastT
    if (dt > 0) carouselDragRef.current.vx = (e.clientX - carouselDragRef.current.lastX) / dt
    carouselDragRef.current.lastX = e.clientX
    carouselDragRef.current.lastT = now
    const raw = e.clientX - carouselDragRef.current.startX
    const { currentIdx, sortedDayKeys: keys } = carouselStateRef.current
    let x = raw
    if (currentIdx <= 0               && raw > 0) x = Math.sign(raw) * Math.min(Math.abs(raw) * 0.18, 50)
    if (currentIdx >= keys.length - 1 && raw < 0) x = Math.sign(raw) * Math.min(Math.abs(raw) * 0.18, 50)
    setCarouselX(Math.abs(raw) > 6 ? x : 0)
  }

  function carouselPointerUp(_e: React.PointerEvent<HTMLDivElement>) {
    if (!carouselDragRef.current || carouselDragRef.current.navigating) return
    const { vx } = carouselDragRef.current
    carouselDragRef.current = null
    applyCarouselMomentum(vx)
  }

  // Inercia libre con deceleración exponencial (mockup: Math.pow(0.965, dt/16))
  function applyCarouselMomentum(v0: number) {
    stopCarouselMomentum()
    const vpW   = carouselViewportRef.current?.offsetWidth ?? 300
    const state = carouselStateRef.current // referencia al objeto mutable (no copia)

    // Animación suave CSS → día adyacente, luego actualiza React state
    function snapToDay(direction: 1 | -1) {
      const newIdx = state.currentIdx + direction
      const keys   = state.sortedDayKeys
      if (newIdx < 0 || newIdx >= keys.length) { setCarouselAnim(true); setCarouselX(0); return }
      const key = keys[newIdx]!
      state.currentIdx = newIdx
      setCarouselAnim(true)
      setCarouselX(direction < 0 ? vpW : -vpW)
      setTimeout(() => {
        setCarouselAnim(false); setCarouselX(0)
        const d = new Date(`${key}T00:00:00`)
        setSelectedDate(d)
        setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
      }, 330)
    }

    // Velocidad baja → snap suave al día más cercano según posición actual
    if (Math.abs(v0) < 0.15) {
      if      (carouselX < -vpW * 0.25 && state.currentIdx < state.sortedDayKeys.length - 1) snapToDay(1)
      else if (carouselX >  vpW * 0.25 && state.currentIdx > 0)                              snapToDay(-1)
      else { setCarouselAnim(true); setCarouselX(0) }
      return
    }

    // Velocidad alta → inercia libre (Opción C-a)
    let v = v0
    let lastFrameT = performance.now()
    let x = carouselX // captura posición actual al soltar

    function step(t: number) {
      const dt = Math.min(t - lastFrameT, 32)
      lastFrameT = t
      v *= Math.pow(0.965, dt / 16) // fricción ~96.5% por fotograma de 16ms

      if (Math.abs(v) < 0.08) {
        // Inercia agotada → snap al día más cercano
        carouselMomentumRef.current = null
        if      (x < -vpW * 0.35 && state.currentIdx < state.sortedDayKeys.length - 1) snapToDay(1)
        else if (x >  vpW * 0.35 && state.currentIdx > 0)                              snapToDay(-1)
        else { setCarouselAnim(true); setCarouselX(0) }
        return
      }

      x += v * dt

      // Rubber-band en los extremos del mes
      if (state.currentIdx <= 0                               && x > 0) { x = Math.min(x * 0.2, 60); v *= 0.5 }
      if (state.currentIdx >= state.sortedDayKeys.length - 1 && x < 0) { x = Math.max(x * 0.2, -60); v *= 0.5 }

      // Cruce de límite de día: navegar y continuar inercia desde nuevo centro
      if (x <= -vpW && state.currentIdx < state.sortedDayKeys.length - 1) {
        x += vpW
        const newIdx = state.currentIdx + 1
        state.currentIdx = newIdx
        const d = new Date(`${state.sortedDayKeys[newIdx]}T00:00:00`)
        setSelectedDate(d)
        setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
      } else if (x >= vpW && state.currentIdx > 0) {
        x -= vpW
        const newIdx = state.currentIdx - 1
        state.currentIdx = newIdx
        const d = new Date(`${state.sortedDayKeys[newIdx]}T00:00:00`)
        setSelectedDate(d)
        setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
      }

      // Verificar si fue cancelado durante este frame (por nuevo pointerDown)
      if (carouselMomentumRef.current === null) return

      setCarouselX(x)
      carouselMomentumRef.current = requestAnimationFrame(step)
    }

    carouselMomentumRef.current = requestAnimationFrame(step)
  }
  // ─────────────────────────────────────────────────────────────────────────────

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

      <Card
        className="relative touch-pan-y overflow-hidden"
        onPointerDown={carouselPointerDown}
        onPointerMove={carouselPointerMove}
        onPointerUp={carouselPointerUp}
        onPointerCancel={() => { carouselDragRef.current = null; setCarouselX(0); setCarouselAnim(false) }}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">
            {selectedKey ? `Resumen ${selectedKey}` : 'Resumen diario'}
          </CardTitle>
          {/* Flechas de navegación día anterior / siguiente (Paso 2) */}
          {sortedDayKeys.length > 1 && selectedKey && (() => {
            const idx = sortedDayKeys.indexOf(selectedKey)
            const hasPrev = idx > 0
            const hasNext = idx < sortedDayKeys.length - 1
            const goTo = (key: string) => {
              const d = new Date(`${key}T00:00:00`)
              setSelectedDate(d)
              setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
            }
            return (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => hasPrev && goTo(sortedDayKeys[idx - 1]!)}
                  disabled={!hasPrev}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  title={hasPrev ? `Ir a ${sortedDayKeys[idx - 1]}` : 'Primer día'}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                {idx >= 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {idx + 1}/{sortedDayKeys.length}
                  </span>
                )}
                <button
                  onClick={() => hasNext && goTo(sortedDayKeys[idx + 1]!)}
                  disabled={!hasNext}
                  className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                  title={hasNext ? `Ir a ${sortedDayKeys[idx + 1]}` : 'Último día'}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })()}
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
          {/* ── Paso 3b: Carousel de timelines 24h (3 slides: prev · current · next) ── */}
          <div ref={carouselViewportRef} className="overflow-hidden select-none -mx-6 px-0">
            <div
              className="flex"
              style={{
                width: '300%',
                transform: `translateX(calc(-33.333% + ${carouselX}px))`,
                transition: carouselAnim ? 'transform 0.32s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none',
                willChange: 'transform',
              }}
            >
              {([
                { slideKey: prevKey,      entries: prevEntries },
                { slideKey: selectedKey,  entries: summariesForSelectedDay },
                { slideKey: nextKey,      entries: nextEntries },
              ] as const).map(({ slideKey, entries }, si) => {
                const isSelectedSlide = si === 1
                const blocks = slideKey ? buildDayTimelineBlocks(entries as Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>) : []
                return (
                  <div key={slideKey ?? `empty-${si}`} className="min-w-0" style={{ width: '33.333%' }}>
                    {/* Etiqueta de fecha — con padding lateral para alinear con el resto del card */}
                    <div className="flex items-center justify-between mb-0.5 px-6">
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                        {slideKey ? slideKey.slice(5) : '—'}
                      </span>
                    </div>
                    {/* Barra timeline 24h — full-bleed: sin padding lateral ni border-radius */}
                    <div
                      className="relative h-8 overflow-hidden border-y border-border/25 bg-muted/15"
                      title={slideKey ? `Timeline ${slideKey}` : undefined}
                    >
                      {/* Línea de medianoche (00:00) en el borde izquierdo de cada slide */}
                      <div className="absolute inset-y-0 left-0 w-px bg-white/20 z-10 pointer-events-none" />
                      {[3, 6, 9, 12, 15, 18, 21].map(h => (
                        <div key={h} className="absolute top-0 bottom-0 w-px bg-border/25" style={{ left: `${(h / 24) * 100}%` }} />
                      ))}
                      {blocks.map((b, i) => (
                        <div
                          key={i}
                          className={cn(
                            'absolute top-1 bottom-1 flex items-center justify-center',
                            b.bgClass,
                            b.nightSide === null && 'rounded-sm',
                          )}
                          style={{
                            left: `${b.leftPct}%`,
                            width: `max(${b.widthPct}%, 0.8%)`,
                            borderRadius:
                              b.nightSide === 'start' ? '0 3px 3px 0' :
                              b.nightSide === 'end'   ? '3px 0 0 3px' :
                              undefined,
                            backgroundImage:
                              b.nightSide === 'start' ? 'linear-gradient(90deg, rgba(99,102,241,0.55) 0%, transparent 18px)' :
                              b.nightSide === 'end'   ? 'linear-gradient(270deg, rgba(99,102,241,0.55) 0%, transparent 18px)' :
                              undefined,
                          }}
                          title={b.title}
                        >
                          {b.widthPct > 9 && (
                            <span className="text-[9px] font-bold text-white/90 leading-none pointer-events-none">{b.label}</span>
                          )}
                        </div>
                      ))}
                      {[0, 6, 12, 18, 24].map(h => (
                        <span
                          key={h}
                          className="absolute bottom-0.5 text-[7px] text-muted-foreground/50 tabular-nums pointer-events-none"
                          style={{ left: `${(h / 24) * 100}%`, transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)' }}
                        >
                          {h === 0 ? '0h' : `${h}h`}
                        </span>
                      ))}
                    </div>
                    {/* Cards del día (madrugada · día · vespertina) — viajan con el timeline */}
                    {renderSlideCards(
                      slideKey,
                      entries as Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>,
                      isSelectedSlide,
                    )}
                  </div>
                )
              })}
            </div>
          </div>

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
