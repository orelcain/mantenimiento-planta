import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../services/firebase'
import { setDoc as trackedSetDoc } from '../services/firestoreTracked'
import { getCurrentUser } from '../services/auth'
import { getHmiTooltipPwd } from '../services/hmiKnuro'
import { logger } from '@/lib/logger'

type DayCol = {
  c: number
  dayLabel: string
  dateRaw: string
  dateObj: Date | null
}

type TechRow = {
  r: number
  turno: string
  area: string
  ceco: string
  cargo: string
  direccion: string
  rut: string
  name: string
  shifts: Record<number, string>
}

type ShiftConfig = {
  diaInicio: string
  diaFin: string
  tardeInicio: string
  tardeFin: string
  nocheInicio: string
  nocheFin: string
  libreLabel: string
}

type HoursConfig = {
  workHours: number
  breakHours: number
  expectedWeek: number
  expectedMonth: number
  autoLegalWeek: boolean
  workDaysPerWeek: number
  expectedFromPlannedDays: boolean
  toleranceHours: number
  useFixedDaily: boolean
  dayReductionHours: number
  afternoonReductionHours: number
  nightReductionHours: number
  vacationBusinessDaysOnly: boolean
  holidayAsNonWorking: boolean
  holidayBusinessDaysOnly: boolean
}

const WEEKDAY_HEADER = new Set(['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'])
const META_COLS = ['TURNO', 'Área', 'CeCo', 'Cargo', 'DIRECCIÓN', 'RUT', 'Personal']
const META_COL_WIDTHS = [56, 80, 100, 108, 98, 100, 220]
const HIDEABLE_COLS = new Set([2, 3, 4, 5]) // CeCo, Cargo, DIRECCIÓN, RUT
const MOBILE_ALWAYS_HIDDEN = new Set([1]) // Área - ocultar automáticamente en móvil
const CALENDAR_FIRESTORE_PATH = ['calendario_mantencion_state', 'current'] as const

type TabId = 'edicion' | 'plantillas' | 'horas' | 'tecnicos' | 'control'
type SyncState = 'idle' | 'saving' | 'synced' | 'error'
type ExportScope = 'all' | 'week' | 'month' | 'weeks' | 'months'

type ShiftStyleSamples = {
  dia?: unknown
  tarde?: unknown
  noche?: unknown
  libre?: unknown
  vacaciones?: unknown
  feriado?: unknown
  diaReducido?: unknown
  tardeReducido?: unknown
  nocheReducido?: unknown
}

type PersistedCalendarState = {
  version: number
  originalFilename?: string
  dayCols?: Array<{
    c: number
    dayLabel: string
    dateRaw: string
  }>
  techRows?: Array<{
    r: number
    turno: string
    area: string
    ceco: string
    cargo: string
    direccion: string
    rut: string
    name: string
    shifts: Record<string, string>
  }>
  hoursConfig?: HoursConfig
  shiftConfig?: ShiftConfig
}

type CalendarSnapshot = {
  techRows: TechRow[]
}

const DAY_COL_WIDTH = 88
const HOURS_CONFIG_KEY = 'calendario_mantencion_hours_config_v1'
const SHIFT_CONFIG_KEY = 'calendario_mantencion_shift_config_v1'
const CALENDAR_LOCAL_CACHE_KEY = 'calendario_mantencion_state_local_v1'
const CONTROL_CLASS = 'h-8 rounded border border-border bg-background px-2 text-xs text-foreground [color-scheme:dark]'

function defaultHoursConfig(): HoursConfig {
  return {
    workHours: 8,
    breakHours: 0.5,
    expectedWeek: 44,
    expectedMonth: 180,
    autoLegalWeek: true,
    workDaysPerWeek: 6,
    expectedFromPlannedDays: true,
    toleranceHours: 0.5,
    useFixedDaily: true,
    dayReductionHours: 1,
    afternoonReductionHours: 1,
    nightReductionHours: 1,
    vacationBusinessDaysOnly: true,
    holidayAsNonWorking: true,
    holidayBusinessDaysOnly: true,
  }
}

function defaultShiftConfig(): ShiftConfig {
  return {
    diaInicio: '08:00',
    diaFin: '16:00',
    tardeInicio: '16:00',
    tardeFin: '00:00',
    nocheInicio: '00:00',
    nocheFin: '08:00',
    libreLabel: 'LIBRE',
  }
}

function parseDateFromExcelCell(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'number') return excelSerialToDate(value)
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return null
    if (/^\d+$/.test(text)) return excelSerialToDate(Number(text))

    const ddmmyyyy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (ddmmyyyy) {
      const day = Number(ddmmyyyy[1])
      const month = Number(ddmmyyyy[2])
      const year = Number(ddmmyyyy[3])
      const d = new Date(year, month - 1, day)
      if (d.getFullYear() === year && d.getMonth() === (month - 1) && d.getDate() === day) return d
      return null
    }

    const yyyymmdd = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (yyyymmdd) {
      const year = Number(yyyymmdd[1])
      const month = Number(yyyymmdd[2])
      const day = Number(yyyymmdd[3])
      const d = new Date(year, month - 1, day)
      if (d.getFullYear() === year && d.getMonth() === (month - 1) && d.getDate() === day) return d
      return null
    }
  }
  return null
}

function excelSerialToDate(serial: number): Date {
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  const dateInfo = new Date(utcValue * 1000)
  const fractional = serial - Math.floor(serial) + 1e-7
  let totalSeconds = Math.floor(86400 * fractional)
  const seconds = totalSeconds % 60
  totalSeconds -= seconds
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  dateInfo.setHours(hours, minutes, seconds)
  return dateInfo
}

function formatDate(d: Date | null): string {
  if (!d || Number.isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}/${mm}/${yy}`
}

function parseTimeRange(text: string): { start: string; end: string } | null {
  const m = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
  if (!m) return null
  return { start: m[1] ?? '', end: m[2] ?? '' }
}

function hhmmToMinutes(hhmm: string): number | null {
  const [hRaw, mRaw] = hhmm.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

function minutesToHHMM(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function rangeDurationMinutes(startHHMM: string, endHHMM: string): number | null {
  const start = hhmmToMinutes(startHHMM)
  const end = hhmmToMinutes(endHHMM)
  if (start === null || end === null) return null
  let diff = end - start
  if (diff <= 0) diff += 24 * 60
  return diff
}

function toNumberOr(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function clampMin(value: number, min: number): number {
  return value < min ? min : value
}

function getChileToday(): Date {
  const nowChile = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' }))
  return new Date(nowChile.getFullYear(), nowChile.getMonth(), nowChile.getDate())
}

function getChileLegalWeeklyHours(referenceDate: Date): number {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime()
  const start40h = new Date(2028, 3, 26).getTime()
  const start42h = new Date(2026, 3, 26).getTime()
  const start44h = new Date(2024, 3, 26).getTime()
  if (ref >= start40h) return 40
  if (ref >= start42h) return 42
  if (ref >= start44h) return 44
  return 45
}

function getChileLegalWeeklyLabel(referenceDate: Date): string {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate()).getTime()
  const start40h = new Date(2028, 3, 26).getTime()
  const start42h = new Date(2026, 3, 26).getTime()
  const start44h = new Date(2024, 3, 26).getTime()
  if (ref >= start40h) return 'Tramo legal vigente desde 26-04-2028 (40 h/semana)'
  if (ref >= start42h) return 'Tramo legal vigente desde 26-04-2026 (42 h/semana)'
  if (ref >= start44h) return 'Tramo legal vigente desde 26-04-2024 (44 h/semana)'
  return 'Tramo previo a reducción gradual (45 h/semana)'
}

function getPlanningMonthStart(): Date {
  const today = getChileToday()
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function startOfISOWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  if (dayNum !== 1) d.setUTCDate(d.getUTCDate() - dayNum + 1)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function isSameDate(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function weekNumberLabel(date: Date | null): string {
  if (!date) return ''
  const key = isoWeekKey(date)
  const weekPart = key.split('-W')[1] ?? ''
  return weekPart ? `W${weekPart}` : ''
}

function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.001) return '0.0'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
}

function metaLeftFiltered(index: number, visibleIndices: number[], widths: number[] = META_COL_WIDTHS): number {
  let total = 0
  for (let i = 0; i < index; i++) {
    const colIndex = visibleIndices[i]
    if (colIndex === undefined) break
    total += widths[colIndex] ?? 90
  }
  return total
}

function pctBar(value: number, expected: number): number {
  if (expected <= 0) return 0
  return Math.min(100, Math.max(0, (value / expected) * 100))
}

function safeStorageGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function safeStorageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    return
  }
}

export function CalendarioMantencionPage() {
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null)
  const [ws, setWs] = useState<XLSX.WorkSheet | null>(null)
  const [dayCols, setDayCols] = useState<DayCol[]>([])
  const [techRows, setTechRows] = useState<TechRow[]>([])
  const [turnosCatalog, setTurnosCatalog] = useState<string[]>([])
  const [status, setStatus] = useState('Cargando plantilla base...')
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)
  const [syncErrorText, setSyncErrorText] = useState('')
  const [originalFilename, setOriginalFilename] = useState('calendario-mantencion-base.xlsx')

  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [selectedCol, setSelectedCol] = useState<number | null>(null)
  const [selectedWeek, setSelectedWeek] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [exportScope, setExportScope] = useState<ExportScope>('month')
  const [exportSpanCount, setExportSpanCount] = useState(2)
  const [showAllCols, setShowAllCols] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const fromUrl = searchParams.get('tab')
    const valid: TabId[] = ['edicion', 'plantillas', 'horas', 'tecnicos', 'control']
    return (valid as string[]).includes(fromUrl ?? '') ? (fromUrl as TabId) : 'edicion'
  })

  // Sincronizar tab a URL param (solo navega si el valor realmente difiere; navegar
  // incondicionalmente en cada montaje provocaba un remontaje en bucle de la página).
  useEffect(() => {
    const currentTab = searchParams.get('tab')
    const desiredTab = activeTab && activeTab !== 'edicion' ? activeTab : null
    if (currentTab === desiredTab) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (desiredTab) next.set('tab', desiredTab)
      else next.delete('tab')
      return next
    }, { replace: true })
  }, [activeTab, searchParams, setSearchParams])
  const [newTechName, setNewTechName] = useState('')
  const [newTechRut, setNewTechRut] = useState('')
  const [newTechGroup, setNewTechGroup] = useState('A')
  const [newTechArea, setNewTechArea] = useState('Mantención')

  const [hoursConfig, setHoursConfig] = useState<HoursConfig>(() => {
    const stored = safeStorageGet<HoursConfig>(HOURS_CONFIG_KEY, defaultHoursConfig())
    return {
      workHours: toNumberOr(stored.workHours, 8),
      breakHours: toNumberOr(stored.breakHours, 0.5),
      expectedWeek: toNumberOr(stored.expectedWeek, 44),
      expectedMonth: toNumberOr(stored.expectedMonth, 180),
      autoLegalWeek: stored.autoLegalWeek !== false,
      workDaysPerWeek: Math.max(1, Math.min(7, Math.floor(toNumberOr(stored.workDaysPerWeek, 6)))),
      expectedFromPlannedDays: stored.expectedFromPlannedDays !== false,
      toleranceHours: toNumberOr(stored.toleranceHours, 0.5),
      useFixedDaily: stored.useFixedDaily !== false,
      dayReductionHours: toNumberOr(stored.dayReductionHours, 1),
      afternoonReductionHours: toNumberOr(stored.afternoonReductionHours, 1),
      nightReductionHours: toNumberOr(stored.nightReductionHours, 1),
      vacationBusinessDaysOnly: true,
      holidayAsNonWorking: stored.holidayAsNonWorking !== false,
      holidayBusinessDaysOnly: stored.holidayBusinessDaysOnly !== false,
    }
  })

  const [shiftConfig, setShiftConfig] = useState<ShiftConfig>(() => {
    const stored = safeStorageGet<ShiftConfig>(SHIFT_CONFIG_KEY, defaultShiftConfig())
    return { ...defaultShiftConfig(), ...stored }
  })

  const loadWorkbookRef = useRef<(workbook: XLSX.WorkBook, filename: string) => void>(() => {})
  const applyShiftRef = useRef<(r: number, c: number, shift: string) => void>(() => {})
  const calendarScrollRef = useRef<HTMLDivElement | null>(null)
  const calendarSectionRef = useRef<HTMLDivElement | null>(null)
  const isHydratingRemoteRef = useRef(false)
  const hasLoadedCalendarRef = useRef(false)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncSeqRef = useRef(0)
  const shiftStyleSamplesRef = useRef<ShiftStyleSamples>({})
  const undoStackRef = useRef<CalendarSnapshot[]>([])
  const redoStackRef = useRef<CalendarSnapshot[]>([])
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  const [historyVersion, setHistoryVersion] = useState(0)
  const [calendarShortcutsActive, setCalendarShortcutsActive] = useState(false)
  const [todayTick, setTodayTick] = useState(() => Date.now())
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768 || (window.innerWidth < 1100 && window.innerHeight < 500))
  const [isLandscape, setIsLandscape] = useState(() => window.innerHeight < 500 && (window.innerWidth < 768 || window.innerWidth < 1100))
  const [mobileViewMode, setMobileViewMode] = useState<'badges' | 'times' | 'reduced'>('badges')
  const [mobileEditMode, setMobileEditMode] = useState(false)
  const [mobileEditCell, setMobileEditCell] = useState<{ techR: number; dayC: number } | null>(null)
  const [mobileEditStart, setMobileEditStart] = useState('')
  const [mobileEditEnd, setMobileEditEnd] = useState('')
  const [mobileTappedCell, setMobileTappedCell] = useState<{ techR: number; dayC: number } | null>(null)
  const [mobileAdminGateOpen, setMobileAdminGateOpen] = useState(false)
  const [mobileAdminGateInput, setMobileAdminGateInput] = useState('')
  const [mobileAdminGateError, setMobileAdminGateError] = useState('')
  const touchStartX = useRef<number | null>(null)

  const shortcuts = useMemo(() => {
    const dia = `${shiftConfig.diaInicio} - ${shiftConfig.diaFin}`
    const tarde = `${shiftConfig.tardeInicio} - ${shiftConfig.tardeFin}`
    const noche = `${shiftConfig.nocheInicio} - ${shiftConfig.nocheFin}`
    const libre = shiftConfig.libreLabel || 'LIBRE'
    const reductionMinutesDay = Math.max(0, Math.round(toNumberOr(hoursConfig.dayReductionHours, 1) * 60))
    const reductionMinutesAfternoon = Math.max(0, Math.round(toNumberOr(hoursConfig.afternoonReductionHours, 1) * 60))
    const reductionMinutesNight = Math.max(0, Math.round(toNumberOr(hoursConfig.nightReductionHours, 1) * 60))
    const normalDuration = rangeDurationMinutes(shiftConfig.diaInicio, shiftConfig.diaFin)
    const dayStartMinutes = hhmmToMinutes(shiftConfig.diaInicio)
    let diaReducido = dia
    if (normalDuration !== null && dayStartMinutes !== null && reductionMinutesDay > 0 && normalDuration > reductionMinutesDay) {
      const reducedEnd = minutesToHHMM(dayStartMinutes + (normalDuration - reductionMinutesDay))
      diaReducido = `${shiftConfig.diaInicio} - ${reducedEnd}`
    }

    const normalNightDuration = rangeDurationMinutes(shiftConfig.nocheInicio, shiftConfig.nocheFin)
    const nightStartMinutes = hhmmToMinutes(shiftConfig.nocheInicio)
    let nocheReducido = noche
    if (normalNightDuration !== null && nightStartMinutes !== null && reductionMinutesNight > 0 && normalNightDuration > reductionMinutesNight) {
      const reducedNightEnd = minutesToHHMM(nightStartMinutes + (normalNightDuration - reductionMinutesNight))
      nocheReducido = `${shiftConfig.nocheInicio} - ${reducedNightEnd}`
    }

    const normalAfternoonDuration = rangeDurationMinutes(shiftConfig.tardeInicio, shiftConfig.tardeFin)
    const afternoonStartMinutes = hhmmToMinutes(shiftConfig.tardeInicio)
    let tardeReducido = tarde
    if (normalAfternoonDuration !== null && afternoonStartMinutes !== null && reductionMinutesAfternoon > 0 && normalAfternoonDuration > reductionMinutesAfternoon) {
      const reducedAfternoonEnd = minutesToHHMM(afternoonStartMinutes + (normalAfternoonDuration - reductionMinutesAfternoon))
      tardeReducido = `${shiftConfig.tardeInicio} - ${reducedAfternoonEnd}`
    }

    return { dia, tarde, noche, libre, diaReducido, tardeReducido, nocheReducido }
  }, [hoursConfig.dayReductionHours, hoursConfig.afternoonReductionHours, hoursConfig.nightReductionHours, shiftConfig])

  const weeks = useMemo(() => {
    const map: Record<string, string> = {}
    dayCols.forEach((d) => {
      if (!d.dateObj) return
      const key = isoWeekKey(d.dateObj)
      if (!map[key]) {
        const monday = startOfISOWeek(d.dateObj)
        const sunday = new Date(monday)
        sunday.setDate(sunday.getDate() + 6)
        map[key] = `Semana ${key} (${formatDate(monday)} - ${formatDate(sunday)})`
      }
    })
    return map
  }, [dayCols])

  const months = useMemo(() => {
    const map: Record<string, string> = {}
    dayCols.forEach((d) => {
      if (!d.dateObj) return
      const key = monthKey(d.dateObj)
      if (!map[key]) {
        const label = d.dateObj.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
        map[key] = label.charAt(0).toUpperCase() + label.slice(1)
      }
    })
    return map
  }, [dayCols])

  const todayDayCol = useMemo(() => {
    const today = new Date(todayTick)
    return dayCols.find((d) => {
      if (!d.dateObj) return false
      return d.dateObj.getFullYear() === today.getFullYear()
        && d.dateObj.getMonth() === today.getMonth()
        && d.dateObj.getDate() === today.getDate()
    })
  }, [dayCols, todayTick])

  const techGroups = useMemo(() => {
    const groups = Array.from(new Set(techRows.map((t) => t.turno).filter(Boolean)))
    if (groups.length === 0) return ['A', 'B', 'C']
    return groups
  }, [techRows])
  const baseGroupOptions = useMemo(() => Array.from(new Set([...techGroups, 'A', 'B', 'C'])), [techGroups])

  useEffect(() => {
    const handler = () => {
      const mob = window.innerWidth < 768 || (window.innerWidth < 1100 && window.innerHeight < 500)
      setIsMobile(mob)
      setIsLandscape(mob && window.innerHeight < 500)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  useEffect(() => {
    if (!techGroups.includes(newTechGroup)) {
      setNewTechGroup(techGroups[0] || 'A')
    }
  }, [newTechGroup, techGroups])

  loadWorkbookRef.current = loadWorkbook
  applyShiftRef.current = applyShift
  undoRef.current = undoChange
  redoRef.current = redoChange

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const intervalId = setInterval(() => {
      setTodayTick(Date.now())
    }, 60 * 1000)
    return () => clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const run = async () => {
      try {
        const url = `${import.meta.env.BASE_URL}templates/calendario-mantencion-base.xlsx`
        const response = await fetch(url)
        if (!response.ok) throw new Error('No se pudo cargar plantilla base')
        const buffer = await response.arrayBuffer()
        const loaded = XLSX.read(buffer, { cellDates: true, cellStyles: true })
        loadWorkbookRef.current(loaded, 'calendario-mantencion-base.xlsx')
      } catch (error) {
        setStatus(`Error cargando plantilla: ${error instanceof Error ? error.message : 'desconocido'}`)
      }
    }

    void run()
  }, [])

  useEffect(() => {
    const today = getChileToday()
    const preferred = isoWeekKey(today)
    if (selectedWeek && weeks[selectedWeek]) return
    if (weeks[preferred]) {
      setSelectedWeek(preferred)
      return
    }
    const first = Object.keys(weeks)[0]
    if (first) setSelectedWeek(first)
  }, [weeks, selectedWeek])

  useEffect(() => {
    const today = getChileToday()
    const preferredMonth = monthKey(today)
    if (selectedMonth && months[selectedMonth]) return
    if (months[preferredMonth]) {
      setSelectedMonth(preferredMonth)
      return
    }
    const first = Object.keys(months)[0]
    if (first) setSelectedMonth(first)
  }, [months, selectedMonth])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      const insideCalendar = !!(target && calendarSectionRef.current?.contains(target))
      setCalendarShortcutsActive(insideCalendar)
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editingField = !!(target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable))

      if ((event.ctrlKey || event.metaKey) && !editingField) {
        const key = event.key.toLowerCase()
        if (key === 'z' && event.shiftKey) {
          event.preventDefault()
          redoRef.current()
          return
        }
        if (key === 'z') {
          event.preventDefault()
          undoRef.current()
          return
        }
        if (key === 'y') {
          event.preventDefault()
          redoRef.current()
          return
        }
      }

      if (!calendarShortcutsActive) return
      if (!selectedRow || selectedCol === null) return
      if (editingField) return

      if (event.ctrlKey || event.altKey || event.metaKey) return

      // Arrow key navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        if (event.key === 'ArrowRight') {
          const curIdx = dayCols.findIndex((d) => d.c === selectedCol)
          const nextDayCol = curIdx >= 0 ? dayCols[curIdx + 1] : undefined
          if (nextDayCol) {
            setSelectedCol(nextDayCol.c)
          }
        } else if (event.key === 'ArrowLeft') {
          const curIdx = dayCols.findIndex((d) => d.c === selectedCol)
          const prevDayCol = curIdx > 0 ? dayCols[curIdx - 1] : undefined
          if (prevDayCol) {
            setSelectedCol(prevDayCol.c)
          }
        } else if (event.key === 'ArrowDown') {
          const curRowIdx = techRows.findIndex((t) => t.r === selectedRow)
          const nextRow = curRowIdx >= 0 ? techRows[curRowIdx + 1] : undefined
          if (nextRow) {
            setSelectedRow(nextRow.r)
          }
        } else if (event.key === 'ArrowUp') {
          const curRowIdx = techRows.findIndex((t) => t.r === selectedRow)
          const prevRow = curRowIdx > 0 ? techRows[curRowIdx - 1] : undefined
          if (prevRow) {
            setSelectedRow(prevRow.r)
          }
        }
        return
      }

      const key = event.key.toLowerCase()
      if (event.shiftKey && key === 'd') {
        event.preventDefault()
        applyShiftRef.current(selectedRow, selectedCol, shortcuts.diaReducido)
        return
      }
      if (event.shiftKey && key === 'n') {
        event.preventDefault()
        applyShiftRef.current(selectedRow, selectedCol, shortcuts.nocheReducido)
        return
      }
      if (event.shiftKey && key === 't') {
        event.preventDefault()
        applyShiftRef.current(selectedRow, selectedCol, shortcuts.tardeReducido)
        return
      }
      if (event.shiftKey) return
      if (!['d', 't', 'n', 'l', 'v', 'f'].includes(key)) return

      event.preventDefault()
      if (key === 'd') applyShiftRef.current(selectedRow, selectedCol, shortcuts.dia)
      if (key === 't') applyShiftRef.current(selectedRow, selectedCol, shortcuts.tarde)
      if (key === 'n') applyShiftRef.current(selectedRow, selectedCol, shortcuts.noche)
      if (key === 'l') applyShiftRef.current(selectedRow, selectedCol, shortcuts.libre)
      if (key === 'v') applyShiftRef.current(selectedRow, selectedCol, 'VACACIONES')
      if (key === 'f') applyShiftRef.current(selectedRow, selectedCol, 'FERIADO')
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [calendarShortcutsActive, selectedRow, selectedCol, shortcuts, dayCols, techRows])

  function loadWorkbook(workbook: XLSX.WorkBook, filename: string) {
    const horario = workbook.SheetNames.find((name) => name.toLowerCase() === 'horario') ?? workbook.SheetNames[0]
    if (!horario) {
      setStatus('El archivo Excel no contiene hojas.')
      return
    }
    const horarioSheet = workbook.Sheets[horario]
    if (!horarioSheet) {
      setStatus('No se encontró hoja Horario.')
      return
    }

    setWb(workbook)
    setWs(horarioSheet)
    setOriginalFilename(filename)

    const ref = XLSX.utils.decode_range(horarioSheet['!ref'] || 'A1:A1')
    const colsDetected = detectDayColumns(horarioSheet, ref)
    const colsNormalized = normalizeLegacyTemplateDates(colsDetected, horarioSheet)
    const finalCols = colsNormalized
    const techs = detectTechnicians(horarioSheet, ref, finalCols)
    const catalog = readTurnosCatalog(workbook)

    setDayCols(finalCols)
    setTechRows(techs)
    setTurnosCatalog(Array.from(new Set([...catalog, 'LIBRE'])))
    undoStackRef.current = []
    redoStackRef.current = []
    setHistoryVersion((v) => v + 1)
    inferShiftStyleSamples(horarioSheet, techs, finalCols)

    const firstTech = techs[0]
    const firstDay = finalCols[0]
    if (firstTech) setSelectedRow(firstTech.r)
    if (firstDay) setSelectedCol(firstDay.c)

    inferShiftConfig(catalog, techs)
    setStatus(`Plantilla cargada: ${filename}. Técnicos: ${techs.length}. Días: ${finalCols.length}. Fechas alineadas a calendario actual.`)
    void hydrateCalendarFromFirebase(horarioSheet, filename)
  }

  async function hydrateCalendarFromFirebase(sheet: XLSX.WorkSheet, filename: string): Promise<void> {
    const applyPersistedState = (data: PersistedCalendarState): boolean => {
      const persistedRows = Array.isArray(data.techRows) ? data.techRows : []
      const persistedColsRaw = Array.isArray(data.dayCols) ? data.dayCols : []

      if (data.hoursConfig) setHoursConfig({ ...defaultHoursConfig(), ...data.hoursConfig })
      if (data.shiftConfig) setShiftConfig({ ...defaultShiftConfig(), ...data.shiftConfig })
      if (data.originalFilename) setOriginalFilename(data.originalFilename)

      if (persistedRows.length === 0) return false

      const restored: TechRow[] = persistedRows.map((row) => {
        const shifts: Record<number, string> = {}
        Object.entries(row.shifts || {}).forEach(([k, v]) => {
          const col = Number(k)
          if (!Number.isNaN(col)) shifts[col] = String(v || '')
        })
        return {
          r: Number(row.r),
          turno: String(row.turno || ''),
          area: String(row.area || ''),
          ceco: String(row.ceco || ''),
          cargo: String(row.cargo || ''),
          direccion: String(row.direccion || ''),
          rut: String(row.rut || ''),
          name: String(row.name || ''),
          shifts,
        }
      })

      const persistedCols = persistedColsRaw
        .map((col) => {
          const colIndex = Number(col.c)
          if (Number.isNaN(colIndex) || colIndex < 7) return null
          const parsedDate = parseDateFromExcelCell(col.dateRaw)
          if (!parsedDate || Number.isNaN(parsedDate.getTime())) return null
          const dateObj = parsedDate
          const dayLabel = normalizeWeekdayLabel(dateObj.toLocaleDateString('es-CL', { weekday: 'long' }))
          return {
            c: colIndex,
            dayLabel,
            dateRaw: formatDate(dateObj),
            dateObj,
          }
        })
        .filter((col): col is { c: number; dayLabel: string; dateRaw: string; dateObj: Date } => !!col)
        .map((col): DayCol => ({ ...col }))
        .sort((a, b) => a.c - b.c)

      if (persistedCols.length > 0) {
        persistedCols.forEach((col) => {
          setCellValue(1, col.c, col.dayLabel, sheet)
          setCellValue(2, col.c, col.dateRaw, sheet)
        })
        setDayCols(persistedCols)
      }

      restored.forEach((tech) => {
        setCellValue(tech.r, 0, tech.turno, sheet)
        setCellValue(tech.r, 1, tech.area, sheet)
        setCellValue(tech.r, 2, tech.ceco, sheet)
        setCellValue(tech.r, 3, tech.cargo, sheet)
        setCellValue(tech.r, 4, tech.direccion, sheet)
        setCellValue(tech.r, 5, tech.rut, sheet)
        setCellValue(tech.r, 6, tech.name, sheet)
        Object.entries(tech.shifts).forEach(([col, value]) => {
          setCellValue(tech.r, Number(col), value, sheet)
        })
      })

      setTechRows(restored)
      setSelectedRow(restored[0]?.r ?? null)
      return true
    }

    try {
      isHydratingRemoteRef.current = true
      const snap = await getDoc(doc(db, CALENDAR_FIRESTORE_PATH[0], CALENDAR_FIRESTORE_PATH[1]))
      if (!snap.exists()) {
        const cached = safeStorageGet<PersistedCalendarState | null>(CALENDAR_LOCAL_CACHE_KEY, null)
        if (cached && applyPersistedState(cached)) {
          setStatus(`Plantilla cargada con respaldo local: ${filename}`)
        }
        hasLoadedCalendarRef.current = true
        return
      }

      const data = snap.data() as PersistedCalendarState
      applyPersistedState(data)

      setStatus(`Plantilla cargada y sincronizada desde Firebase: ${filename}`)
    } catch (error) {
      const cached = safeStorageGet<PersistedCalendarState | null>(CALENDAR_LOCAL_CACHE_KEY, null)
      if (cached && applyPersistedState(cached)) {
        setStatus(`Plantilla cargada con respaldo local (sin permisos Firebase): ${filename}`)
      } else {
        setStatus(`Plantilla cargada localmente (sin sync Firebase): ${filename}`)
      }
      logger.error('No se pudo hidratar calendario desde Firebase', error instanceof Error ? error : new Error(String(error)))
    } finally {
      isHydratingRemoteRef.current = false
      hasLoadedCalendarRef.current = true
    }
  }

  const syncCalendarToFirebase = useCallback(async (reason: string): Promise<void> => {
    const mySeq = ++syncSeqRef.current
    try {
      setSyncState('saving')
      setSyncErrorText('')
      const currentUser = getCurrentUser()
      const localPayload: PersistedCalendarState = {
        version: 1,
        originalFilename,
        dayCols: dayCols.map((d) => ({
          c: d.c,
          dayLabel: d.dayLabel,
          dateRaw: d.dateRaw || formatDate(d.dateObj),
        })),
        techRows: techRows.map((t) => ({
          r: t.r,
          turno: t.turno,
          area: t.area,
          ceco: t.ceco,
          cargo: t.cargo,
          direccion: t.direccion,
          rut: t.rut,
          name: t.name,
          shifts: Object.fromEntries(Object.entries(t.shifts).map(([k, v]) => [String(k), v])),
        })),
        hoursConfig,
        shiftConfig,
      }
      safeStorageSet(CALENDAR_LOCAL_CACHE_KEY, localPayload)

      const payload = {
        ...localPayload,
        reason,
        updatedAt: serverTimestamp(),
        updatedAtClient: Date.now(),
        updatedBy: currentUser?.uid ?? 'anon',
      }
      await trackedSetDoc(doc(db, CALENDAR_FIRESTORE_PATH[0], CALENDAR_FIRESTORE_PATH[1]), payload, { merge: true })
      if (syncSeqRef.current !== mySeq) return
      setLastSyncAt(new Date())
      setSyncState('synced')
    } catch (error) {
      if (syncSeqRef.current !== mySeq) return
      setSyncState('error')
      setSyncErrorText(error instanceof Error ? error.message : 'Error desconocido')
      setStatus('Cambios guardados en este navegador, pero sin permisos para sincronizar en Firebase.')
    }
  }, [dayCols, hoursConfig, originalFilename, shiftConfig, techRows])

  useEffect(() => {
    if (!hasLoadedCalendarRef.current || isHydratingRemoteRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    setSyncState('saving')
    syncTimerRef.current = setTimeout(() => {
      void syncCalendarToFirebase('state-change')
    }, 200)
  }, [dayCols, syncCalendarToFirebase])

  const syncIndicator = useMemo(() => {
    if (syncState === 'saving') return { label: 'Guardando…', className: 'bg-amber-500/[0.15] text-amber-600 border-amber-500/[0.25]' }
    if (syncState === 'synced') return { label: `Sincronizado${lastSyncAt ? ` ${lastSyncAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}`, className: 'bg-emerald-500/[0.15] text-emerald-600 border-emerald-500/[0.25]' }
    if (syncState === 'error') return { label: `Error de sync${syncErrorText ? `: ${syncErrorText}` : ''}`, className: 'bg-red-500/[0.15] text-red-600 border-red-500/[0.25]' }
    return { label: 'Sin cambios', className: 'bg-muted text-muted-foreground border-border' }
  }, [lastSyncAt, syncErrorText, syncState])

  function getCellValue(sheet: XLSX.WorkSheet, r: number, c: number): string {
    const addr = XLSX.utils.encode_cell({ r, c })
    const cell = sheet[addr]
    return String(cell ? (cell.w ?? cell.v ?? '') : '').trim()
  }

  function detectDayColumns(sheet: XLSX.WorkSheet, ref: XLSX.Range): DayCol[] {
    const cols: DayCol[] = []
    for (let c = 7; c <= ref.e.c; c++) {
      const dayLabel = String(getCellValue(sheet, 1, c) || '').toLowerCase().trim()
      const dateRaw = getCellValue(sheet, 2, c)
      const dateObj = parseDateFromExcelCell(dateRaw)
      if (WEEKDAY_HEADER.has(dayLabel) && !!dateObj) {
        cols.push({ c, dayLabel: getCellValue(sheet, 1, c), dateRaw, dateObj })
      }
    }
    return cols
  }

  function normalizeLegacyTemplateDates(cols: DayCol[], sheet: XLSX.WorkSheet): DayCol[] {
    const withDates = cols.filter((c) => c.dateObj)
    if (withDates.length === 0) return cols

    const currentYear = getChileToday().getFullYear()
    const hasLegacyYear = withDates.some((c) => {
      const y = c.dateObj?.getFullYear() ?? currentYear
      return y < currentYear - 1 || y === 2001
    })

    if (!hasLegacyYear) return cols

    const startDate = getPlanningMonthStart()
    return cols.map((col, idx) => {
      const d = new Date(startDate)
      d.setDate(startDate.getDate() + idx)

      const dayLabel = normalizeWeekdayLabel(d.toLocaleDateString('es-CL', { weekday: 'long' }))
      const dateRaw = formatDate(d)

      const addr = XLSX.utils.encode_cell({ r: 2, c: col.c })
      sheet[addr] = { t: 'd', v: d, w: dateRaw }

      return {
        ...col,
        dayLabel,
        dateRaw,
        dateObj: d,
      }
    })
  }

  function detectTechnicians(sheet: XLSX.WorkSheet, ref: XLSX.Range, cols: DayCol[]): TechRow[] {
    const rows: TechRow[] = []
    for (let r = 3; r <= ref.e.r; r++) {
      const name = getCellValue(sheet, r, 6)
      if (!name) continue
      const shifts: Record<number, string> = {}
      cols.forEach((d) => {
        shifts[d.c] = getCellValue(sheet, r, d.c)
      })
      rows.push({
        r,
        turno: getCellValue(sheet, r, 0),
        area: getCellValue(sheet, r, 1),
        ceco: getCellValue(sheet, r, 2),
        cargo: getCellValue(sheet, r, 3),
        direccion: getCellValue(sheet, r, 4),
        rut: getCellValue(sheet, r, 5),
        name,
        shifts,
      })
    }
    return rows
  }

  function readTurnosCatalog(workbook: XLSX.WorkBook): string[] {
    const turnosName = workbook.SheetNames.find((name) => name.toLowerCase() === 'turnos')
    if (!turnosName) return ['08:00 - 16:00', '16:00 - 00:00', '00:00 - 08:00', 'LIBRE']
    const tSheet = workbook.Sheets[turnosName]
    if (!tSheet) return ['08:00 - 16:00', '16:00 - 00:00', '00:00 - 08:00', 'LIBRE']
    const ref = XLSX.utils.decode_range(tSheet['!ref'] || 'A1:A1')
    const list: string[] = []
    for (let r = 2; r <= ref.e.r; r++) {
      const desc = getCellValue(tSheet, r, 2)
      if (desc) list.push(desc)
    }
    return list.length ? list : ['08:00 - 16:00', '16:00 - 00:00', '00:00 - 08:00', 'LIBRE']
  }

  function inferShiftConfig(catalog: string[], techs: TechRow[]) {
    const all = [...catalog]
    techs.forEach((t) => Object.values(t.shifts).forEach((s) => all.push(s)))

    const dayGuess = all.find((x) => x.includes('08:00 - 16:00')) || all.find((x) => x.includes('08:00')) || `${shiftConfig.diaInicio} - ${shiftConfig.diaFin}`
    const tardeGuess = all.find((x) => x.includes('16:00 - 00:00')) || all.find((x) => x.includes('16:00')) || `${shiftConfig.tardeInicio} - ${shiftConfig.tardeFin}`
    const nocheGuess = all.find((x) => x.includes('00:00 - 08:00')) || all.find((x) => x.includes('00:00')) || `${shiftConfig.nocheInicio} - ${shiftConfig.nocheFin}`
    const libreGuess = all.find((x) => String(x).toLowerCase().includes('libre')) || shiftConfig.libreLabel || 'LIBRE'

    const d = parseTimeRange(dayGuess)
    const t = parseTimeRange(tardeGuess)
    const n = parseTimeRange(nocheGuess)

    const next: ShiftConfig = {
      diaInicio: d?.start || shiftConfig.diaInicio,
      diaFin: d?.end || shiftConfig.diaFin,
      tardeInicio: t?.start || shiftConfig.tardeInicio,
      tardeFin: t?.end || shiftConfig.tardeFin,
      nocheInicio: n?.start || shiftConfig.nocheInicio,
      nocheFin: n?.end || shiftConfig.nocheFin,
      libreLabel: libreGuess,
    }

    setShiftConfig(next)
    safeStorageSet(SHIFT_CONFIG_KEY, next)
  }

  function setCellValue(r: number, c: number, value: string, targetSheet?: XLSX.WorkSheet) {
    const sheet = targetSheet ?? ws
    if (!sheet) return
    const currentRef = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1')
    if (r > currentRef.e.r || c > currentRef.e.c) {
      const nextRange = {
        s: currentRef.s,
        e: {
          r: Math.max(currentRef.e.r, r),
          c: Math.max(currentRef.e.c, c),
        },
      }
      sheet['!ref'] = XLSX.utils.encode_range(nextRange)
    }

    const addr = XLSX.utils.encode_cell({ r, c })
    const current = sheet[addr]
    const styleSample = c >= 7 ? styleForShift(value) : undefined
    if (!current) sheet[addr] = styleSample !== undefined ? { t: 's', v: value, s: styleSample } : { t: 's', v: value }
    else {
      current.t = 's'
      current.v = value
      if (styleSample !== undefined) current.s = styleSample
      delete current.w
    }
  }

  function snapshotCurrentState(): CalendarSnapshot {
    return {
      techRows: techRows.map((tech) => ({
        ...tech,
        shifts: { ...tech.shifts },
      })),
    }
  }

  function applySnapshot(snapshot: CalendarSnapshot) {
    const nextRows = snapshot.techRows.map((tech) => ({
      ...tech,
      shifts: { ...tech.shifts },
    }))
    setTechRows(nextRows)
    nextRows.forEach((tech) => {
      setCellValue(tech.r, 0, tech.turno)
      setCellValue(tech.r, 1, tech.area)
      dayCols.forEach((d) => {
        setCellValue(tech.r, d.c, tech.shifts[d.c] || '')
      })
    })
  }

  function pushUndoSnapshot() {
    undoStackRef.current.push(snapshotCurrentState())
    if (undoStackRef.current.length > 150) undoStackRef.current.shift()
    redoStackRef.current = []
    setHistoryVersion((v) => v + 1)
  }

  function undoChange() {
    const previous = undoStackRef.current.pop()
    if (!previous) return
    redoStackRef.current.push(snapshotCurrentState())
    applySnapshot(previous)
    setStatus('Deshacer aplicado (Ctrl+Z).')
    setHistoryVersion((v) => v + 1)
  }

  function redoChange() {
    const next = redoStackRef.current.pop()
    if (!next) return
    undoStackRef.current.push(snapshotCurrentState())
    applySnapshot(next)
    setStatus('Rehacer aplicado (Ctrl+Y / Ctrl+Shift+Z).')
    setHistoryVersion((v) => v + 1)
  }

  function applyShift(r: number, c: number, shift: string) {
    const normalized = shift.trim()
    if (!normalized) return
    pushUndoSnapshot()
    setTechRows((prev) => prev.map((t) => (t.r !== r ? t : { ...t, shifts: { ...t.shifts, [c]: normalized } })))
    setCellValue(r, c, normalized)
    setSelectedRow(r)
    setSelectedCol(c)
    setStatus(`Turno actualizado (${dayLabelByCol(c)}): ${normalized}`)
  }

  const selectCalendarDate = useCallback((col: DayCol): void => {
    if (!col.dateObj) return
    const week = isoWeekKey(col.dateObj)
    const month = monthKey(col.dateObj)
    setSelectedWeek(week)
    setSelectedMonth(month)
  }, [])

  function extendCalendarByDays(daysToAdd: number): void {
    if (!ws || dayCols.length === 0 || daysToAdd <= 0) return
    const lastWithDate = [...dayCols].reverse().find((d) => d.dateObj)
    if (!lastWithDate?.dateObj) return

    const lastCol = dayCols.reduce((max, d) => Math.max(max, d.c), 6)
    const nextCols: DayCol[] = []

    for (let offset = 1; offset <= daysToAdd; offset++) {
      const date = new Date(lastWithDate.dateObj)
      date.setDate(lastWithDate.dateObj.getDate() + offset)
      const c = lastCol + offset
      const dayLabel = normalizeWeekdayLabel(date.toLocaleDateString('es-CL', { weekday: 'long' }))
      const dateRaw = formatDate(date)
      nextCols.push({ c, dayLabel, dateRaw, dateObj: date })
      setCellValue(1, c, dayLabel)
      setCellValue(2, c, dateRaw)
    }

    if (nextCols.length === 0) return

    setTechRows((prev) => prev.map((tech) => {
      const shifts = { ...tech.shifts }
      nextCols.forEach((col) => {
        shifts[col.c] = ''
        setCellValue(tech.r, col.c, '')
      })
      return { ...tech, shifts }
    }))

    setDayCols((prev) => [...prev, ...nextCols])
    setStatus(`Calendario extendido: +${daysToAdd} días hasta ${formatDate(nextCols[nextCols.length - 1]?.dateObj ?? null)}.`)
  }

  function dayLabelByCol(c: number): string {
    const d = dayCols.find((x) => x.c === c)
    if (!d) return ''
    return `${d.dayLabel} ${formatDate(d.dateObj)}`.trim()
  }

  function normalizeWeekdayLabel(label: string): string {
    if (!label) return label
    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  function normalizeShiftText(shiftText: string): string {
    return shiftText
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function hasVacationToken(shiftText: string): boolean {
    const text = normalizeShiftText(shiftText)
    if (!text) return false
    return text.startsWith('vac') || text.includes('vacacion')
  }

  function detectShiftStyleKey(value: string): keyof ShiftStyleSamples | null {
    const text = normalizeShiftText(value)
    if (!text) return null
    if (text.includes('feriado')) return 'feriado'
    if (hasVacationToken(value)) return 'vacaciones'
    if (text.includes('libre') || text.includes('descanso') || text.includes('licencia')) return 'libre'
    if (isReducedShift(value)) {
      if (text.includes(shiftConfig.diaInicio.toLowerCase()) || text.includes('08:00') || text.includes('07:00')) return 'diaReducido'
      if (text.includes(shiftConfig.tardeInicio.toLowerCase()) || text.includes('16:00') || text.includes('14:00') || text.includes('13:00')) return 'tardeReducido'
      if (text.includes(shiftConfig.nocheInicio.toLowerCase()) || text.includes('00:00')) return 'nocheReducido'
    }
    if (text.includes(shiftConfig.diaInicio.toLowerCase()) || text.includes('08:00') || text.includes('07:00')) return 'dia'
    if (text.includes(shiftConfig.tardeInicio.toLowerCase()) || text.includes('16:00') || text.includes('14:00') || text.includes('13:00')) return 'tarde'
    if (text.includes(shiftConfig.nocheInicio.toLowerCase()) || text.includes('00:00')) return 'noche'
    return null
  }

  function inferShiftStyleSamples(sheet: XLSX.WorkSheet, techs: TechRow[], cols: DayCol[]): void {
    const samples: ShiftStyleSamples = {}
    for (const tech of techs) {
      for (const d of cols) {
        const value = tech.shifts[d.c] || ''
        const key = detectShiftStyleKey(value)
        if (!key || samples[key] !== undefined) continue
        const addr = XLSX.utils.encode_cell({ r: tech.r, c: d.c })
        const cell = sheet[addr]
        if (cell?.s !== undefined) {
          samples[key] = JSON.parse(JSON.stringify(cell.s))
        }
      }
    }
    shiftStyleSamplesRef.current = samples
  }

  function styleForShift(value: string): unknown | undefined {
    const key = detectShiftStyleKey(value)
    if (!key) return undefined
    const samples = shiftStyleSamplesRef.current
    if (samples[key] !== undefined) return samples[key]
    if (key === 'diaReducido') return samples.dia
    if (key === 'tardeReducido') return samples.tarde
    if (key === 'nocheReducido') return samples.noche
    if (key === 'feriado') return samples.libre
    return undefined
  }

  function shiftCellStyle(value: string): { className: string; style?: React.CSSProperties } {
    const v = normalizeShiftText(value)
    if (!v) return { className: '' }

    // LIBRE / DESCANSO with gray background
    if (v.includes('libre') || v.includes('descanso')) {
      return { className: 'font-medium', style: { backgroundColor: '#D9D9D9', color: '#FF0000' } }
    }

    // FERIADO as red text
    if (v.includes('feriado')) {
      return { className: 'font-medium', style: { color: '#FF0000' } }
    }

    // VACACIONES → Light blue background (Excel match)
    if (hasVacationToken(value)) return { className: 'font-medium', style: { backgroundColor: '#8DB4E2', color: '#000000' } }

    // LICENCIA → Light teal background
    if (v.includes('licencia')) return { className: 'font-medium', style: { backgroundColor: '#B7DEE8', color: '#000000' } }

    // Template colors by shift range
    if (/^(08|07):\d{2}/.test(v)) return { className: 'font-medium', style: { backgroundColor: '#92D050', color: '#000000' } }
    if (/^(16|14|13):\d{2}/.test(v)) return { className: 'font-medium', style: { backgroundColor: '#FFC000', color: '#000000' } }
    if (/^00:\d{2}/.test(v)) return { className: 'font-medium', style: { backgroundColor: '#61CBF4', color: '#000000' } }

    return { className: '' }
  }

  function isWorkingShift(shiftText: string): boolean {
    const text = normalizeShiftText(shiftText)
    if (!text) return false
    return !(text.includes('libre') || text.includes('descanso') || hasVacationToken(shiftText) || text.includes('licencia') || text.includes('feriado'))
  }

  function isVacationShift(shiftText: string): boolean {
    return hasVacationToken(shiftText)
  }

  function isHolidayShift(shiftText: string): boolean {
    return shiftText.trim().toLowerCase().includes('feriado')
  }

  function isBusinessDay(date: Date): boolean {
    const day = date.getDay()
    // 6x1: hábiles = lunes(1) a sábado(6), descanso = domingo(0)
    // 5x2: hábiles = lunes(1) a viernes(5), descanso = sábado(6) y domingo(0)
    if (hoursConfig.workDaysPerWeek >= 6) return day !== 0
    return day !== 0 && day !== 6
  }

  // Vacaciones siempre cuentan en horario administrativo: solo Lun-Vie
  // Independiente de si la jornada laboral es 6x1 o 5x2
  function isVacationBusinessDay(date: Date): boolean {
    const day = date.getDay()
    return day >= 1 && day <= 5 // Lunes(1) a Viernes(5)
  }

  function effectiveDailyHours(): number {
    return Math.max(0, hoursConfig.workHours - hoursConfig.breakHours)
  }

  function reductionHoursForShift(shiftText: string): number {
    const m = shiftText.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (!m) return 0
    const start = m[1] ?? ''
    if (start === shiftConfig.diaInicio) return clampMin(toNumberOr(hoursConfig.dayReductionHours, 1), 0)
    if (start === shiftConfig.tardeInicio) return clampMin(toNumberOr(hoursConfig.afternoonReductionHours, 1), 0)
    if (start === shiftConfig.nocheInicio) return clampMin(toNumberOr(hoursConfig.nightReductionHours, 1), 0)
    return 0
  }

  function workedHoursForShift(shiftText: string): number {
    if (!isWorkingShift(shiftText)) return 0
    const reduction = isReducedShift(shiftText) ? reductionHoursForShift(shiftText) : 0
    if (hoursConfig.useFixedDaily) return Math.max(0, effectiveDailyHours() - reduction)

    const m = shiftText.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (!m) return Math.max(0, effectiveDailyHours() - reduction)
    const start = hhmmToMinutes(m[1] ?? '')
    const end = hhmmToMinutes(m[2] ?? '')
    if (start === null || end === null) return Math.max(0, effectiveDailyHours() - reduction)
    let diff = end - start
    if (diff <= 0) diff += 24 * 60
    return Math.max(0, diff / 60 - hoursConfig.breakHours)
  }

  function isReducedShift(shiftText: string): boolean {
    const text = shiftText.trim()
    if (!text) return false
    if (text.toUpperCase().includes('[RED]')) return true

    const m = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (!m) return false
    const shiftStart = m[1] ?? ''
    const shiftDuration = rangeDurationMinutes(m[1] ?? '', m[2] ?? '')
    if (shiftDuration === null) return false

    const normalDayDuration = rangeDurationMinutes(shiftConfig.diaInicio, shiftConfig.diaFin)
    const normalAfternoonDuration = rangeDurationMinutes(shiftConfig.tardeInicio, shiftConfig.tardeFin)
    const normalNightDuration = rangeDurationMinutes(shiftConfig.nocheInicio, shiftConfig.nocheFin)

    const matchesReducedRange = (start: string, normalDuration: number | null, reductionHours: number): boolean => {
      const reductionMinutes = Math.max(0, Math.round(reductionHours * 60))
      if (normalDuration === null || normalDuration <= reductionMinutes) return false
      return shiftStart === start && shiftDuration === (normalDuration - reductionMinutes)
    }

    return matchesReducedRange(shiftConfig.diaInicio, normalDayDuration, clampMin(toNumberOr(hoursConfig.dayReductionHours, 1), 0))
      || matchesReducedRange(shiftConfig.tardeInicio, normalAfternoonDuration, clampMin(toNumberOr(hoursConfig.afternoonReductionHours, 1), 0))
      || matchesReducedRange(shiftConfig.nocheInicio, normalNightDuration, clampMin(toNumberOr(hoursConfig.nightReductionHours, 1), 0))
  }

  const visibleMetaIndices = useMemo(() => {
    return META_COLS.map((_, i) => i).filter((i) => {
      if (isMobile && MOBILE_ALWAYS_HIDDEN.has(i)) return false
      return showAllCols || !HIDEABLE_COLS.has(i)
    })
  }, [showAllCols, isMobile])

  const effectiveMetaWidths = useMemo(() => {
    if (!isMobile) return META_COL_WIDTHS
    // En móvil reducimos Personal (índice 6) a 140px para dejar espacio a las columnas de días
    return META_COL_WIDTHS.map((w, i) => (i === 6 ? 140 : w))
  }, [isMobile])

  const weekDays = dayCols.filter((d) => d.dateObj && isoWeekKey(d.dateObj) === selectedWeek)
  const monthDays = dayCols.filter((d) => d.dateObj && monthKey(d.dateObj) === selectedMonth)
  const effectiveDaily = effectiveDailyHours()
  const monthCalendarDays = monthDays.length
  const periodReferenceDate = monthDays.find((d) => d.dateObj)?.dateObj || getChileToday()
  const legalWeekByLaw = getChileLegalWeeklyHours(periodReferenceDate)
  const legalWeekLabel = getChileLegalWeeklyLabel(periodReferenceDate)
  const expectedWeekBase = Math.max(0, hoursConfig.autoLegalWeek ? legalWeekByLaw : hoursConfig.expectedWeek)
  const workDaysPerWeekBase = Math.max(1, Math.min(7, Math.floor(toNumberOr(hoursConfig.workDaysPerWeek, 6))))
  const legalDailyTarget = expectedWeekBase / workDaysPerWeekBase
  const expectedMonthAutoBase = expectedWeekBase * (monthCalendarDays / 7)

  function countsAsExpectedShift(shiftText: string): boolean {
    const text = shiftText.trim().toLowerCase()
    if (!text) return false
    if (text.includes('libre') || text.includes('descanso') || text.includes('licencia')) return false
    if (hoursConfig.holidayAsNonWorking && isHolidayShift(shiftText)) return false
    return true
  }

  function isWeekStart(index: number): boolean {
    if (index === 0) return true
    const curr = dayCols[index]?.dateObj ?? null
    const prev = dayCols[index - 1]?.dateObj ?? null
    if (!curr || !prev) return false
    return isoWeekKey(curr) !== isoWeekKey(prev)
  }

  const hoursRows = techRows.map((t) => {
    const weekWorkedHours = weekDays.reduce((sum, d) => sum + workedHoursForShift(t.shifts[d.c] || ''), 0)
    const monthWorkedHours = monthDays.reduce((sum, d) => sum + workedHoursForShift(t.shifts[d.c] || ''), 0)
    const weekWorkedDays = weekDays.reduce((sum, d) => sum + (isWorkingShift(t.shifts[d.c] || '') ? 1 : 0), 0)
    const monthWorkedDays = monthDays.reduce((sum, d) => sum + (isWorkingShift(t.shifts[d.c] || '') ? 1 : 0), 0)
    // Vacaciones: horario administrativo Lun-Vie (independiente de jornada 6x1)
    const weekVacationDays = weekDays.reduce((sum, d) => {
      if (!d.dateObj || !isVacationShift(t.shifts[d.c] || '')) return sum
      if (!isVacationBusinessDay(d.dateObj)) return sum
      return sum + 1
    }, 0)
    const monthVacationDays = monthDays.reduce((sum, d) => {
      if (!d.dateObj || !isVacationShift(t.shifts[d.c] || '')) return sum
      if (!isVacationBusinessDay(d.dateObj)) return sum
      return sum + 1
    }, 0)
    const totalVacationDays = dayCols.reduce((sum, d) => {
      if (!d.dateObj || !isVacationShift(t.shifts[d.c] || '')) return sum
      if (!isVacationBusinessDay(d.dateObj)) return sum
      return sum + 1
    }, 0)
    const weekHolidayDays = weekDays.reduce((sum, d) => {
      if (!d.dateObj || !isHolidayShift(t.shifts[d.c] || '')) return sum
      if (hoursConfig.holidayBusinessDaysOnly && !isBusinessDay(d.dateObj)) return sum
      return sum + 1
    }, 0)
    const monthHolidayDays = monthDays.reduce((sum, d) => {
      if (!d.dateObj || !isHolidayShift(t.shifts[d.c] || '')) return sum
      if (hoursConfig.holidayBusinessDaysOnly && !isBusinessDay(d.dateObj)) return sum
      return sum + 1
    }, 0)

    // Horas vacación = jornada legal semanal ÷ 5 días admin (ej: 44h/5 = 8.8h/día)
    const vacationDailyHours = expectedWeekBase / 5
    const weekVacationPaidHours = weekVacationDays * vacationDailyHours
    const monthVacationPaidHours = monthVacationDays * vacationDailyHours
    const weekHolidayPaidHours = weekHolidayDays * effectiveDaily
    const monthHolidayPaidHours = monthHolidayDays * effectiveDaily

    const weekHours = weekWorkedHours + weekVacationPaidHours + weekHolidayPaidHours
    const monthHours = monthWorkedHours + monthVacationPaidHours + monthHolidayPaidHours

    const weekExpectedDays = weekDays.reduce((sum, d) => sum + (countsAsExpectedShift(t.shifts[d.c] || '') ? 1 : 0), 0)
    const monthExpectedDays = monthDays.reduce((sum, d) => sum + (countsAsExpectedShift(t.shifts[d.c] || '') ? 1 : 0), 0)

    const weekExpectedAdjusted = hoursConfig.expectedFromPlannedDays
      ? Math.max(0, weekExpectedDays * legalDailyTarget)
      : Math.max(0, expectedWeekBase * (weekDays.length / 7))
    const monthExpectedAdjusted = hoursConfig.expectedFromPlannedDays
      ? Math.max(0, monthExpectedDays * legalDailyTarget)
      : Math.max(0, expectedMonthAutoBase)

    const weekFreeDays = Math.max(0, weekDays.length - weekWorkedDays - weekVacationDays - weekHolidayDays)
    const monthFreeDays = Math.max(0, monthDays.length - monthWorkedDays - monthVacationDays - monthHolidayDays)
    const weekBreakHours = weekWorkedDays * hoursConfig.breakHours
    const monthBreakHours = monthWorkedDays * hoursConfig.breakHours
    const weekFreeHours = weekFreeDays * effectiveDaily
    const monthFreeHours = monthFreeDays * effectiveDaily
    const deltaWeek = weekHours - weekExpectedAdjusted
    const deltaMonth = monthHours - monthExpectedAdjusted
    return {
      tech: t,
      weekHours,
      monthHours,
      weekWorkedHours,
      monthWorkedHours,
      weekExpected: weekExpectedAdjusted,
      monthExpected: monthExpectedAdjusted,
      weekWorkedDays,
      monthWorkedDays,
      weekFreeDays,
      monthFreeDays,
      weekFreeHours,
      monthFreeHours,
      weekBreakHours,
      monthBreakHours,
      weekVacationDays,
      monthVacationDays,
      weekHolidayDays,
      monthHolidayDays,
      totalVacationDays,
      weekVacationPaidHours,
      monthVacationPaidHours,
      weekHolidayPaidHours,
      monthHolidayPaidHours,
      deltaWeek,
      deltaMonth,
    }
  })

  const sortedHoursRows = hoursRows

  function turnoBadgeClass(turno: string): string {
    const key = turno.trim().toUpperCase()
    if (key === 'A') return 'border-cat-7-tint/[0.25] bg-cat-7-tint/[0.15] text-cat-7-ink'
    if (key === 'B') return 'border-amber-500/[0.25] bg-amber-500/[0.15] text-amber-600'
    if (key === 'C') return 'border-cat-6-tint/[0.25] bg-cat-6-tint/[0.15] text-cat-6-ink'
    return 'border-border bg-muted text-foreground'
  }

  useEffect(() => {
    if (selectedCol === null) return
    const selectedDay = dayCols.find((d) => d.c === selectedCol)
    if (!selectedDay?.dateObj) return
    selectCalendarDate(selectedDay)
  }, [selectedCol, dayCols, selectCalendarDate])

  function handleHoursConfigApply() {
    const next = {
      ...hoursConfig,
      workHours: clampMin(toNumberOr(hoursConfig.workHours, 8), 0),
      breakHours: clampMin(toNumberOr(hoursConfig.breakHours, 0.5), 0),
      expectedWeek: clampMin(toNumberOr(hoursConfig.expectedWeek, 44), 0),
      expectedMonth: clampMin(toNumberOr(expectedMonthAutoBase, 180), 0),
      autoLegalWeek: hoursConfig.autoLegalWeek !== false,
      workDaysPerWeek: Math.max(1, Math.min(7, Math.floor(toNumberOr(hoursConfig.workDaysPerWeek, 6)))),
      expectedFromPlannedDays: hoursConfig.expectedFromPlannedDays !== false,
      toleranceHours: clampMin(toNumberOr(hoursConfig.toleranceHours, 0.5), 0),
      dayReductionHours: clampMin(toNumberOr(hoursConfig.dayReductionHours, 1), 0),
      afternoonReductionHours: clampMin(toNumberOr(hoursConfig.afternoonReductionHours, 1), 0),
      nightReductionHours: clampMin(toNumberOr(hoursConfig.nightReductionHours, 1), 0),
      vacationBusinessDaysOnly: true,
      holidayAsNonWorking: hoursConfig.holidayAsNonWorking !== false,
      holidayBusinessDaysOnly: hoursConfig.holidayBusinessDaysOnly !== false,
    }
    setHoursConfig(next)
    safeStorageSet(HOURS_CONFIG_KEY, next)
    setStatus(`Parámetros aplicados. Jornada semanal objetivo: ${expectedWeekBase.toFixed(1)}h. Meta mensual auto: ${expectedMonthAutoBase.toFixed(1)}h`)
  }

  function handleShiftConfigApply() {
    const next = {
      ...shiftConfig,
      libreLabel: (shiftConfig.libreLabel || 'LIBRE').trim().toUpperCase(),
    }
    setShiftConfig(next)
    safeStorageSet(SHIFT_CONFIG_KEY, next)
    setStatus('Plantillas de turno actualizadas. Atajos en calendario: D=Dia, T=Tarde, N=Noche, L=Libre, V=Vacaciones, F=Feriado, Shift+D=Dia reducida, Shift+T=Tarde reducida, Shift+N=Noche reducida.')
  }

  function handleFileUpload(file: File | null) {
    if (!file) return
    void file.arrayBuffer().then((data) => {
      const loaded = XLSX.read(data, { cellDates: true, cellStyles: true })
      loadWorkbook(loaded, file.name)
    })
  }

  function selectedExportCols(): DayCol[] {
    if (exportScope === 'all') return [...dayCols]
    if (exportScope === 'week') return dayCols.filter((d) => d.dateObj && isoWeekKey(d.dateObj) === selectedWeek)
    if (exportScope === 'month') return dayCols.filter((d) => d.dateObj && monthKey(d.dateObj) === selectedMonth)

    const count = Math.max(1, Math.floor(exportSpanCount || 1))
    if (exportScope === 'weeks') {
      const weekOrder = Array.from(new Set(dayCols.map((d) => (d.dateObj ? isoWeekKey(d.dateObj) : '')).filter(Boolean)))
      const startIndex = Math.max(0, weekOrder.indexOf(selectedWeek))
      const selectedWeeks = new Set(weekOrder.slice(startIndex, startIndex + count))
      return dayCols.filter((d) => d.dateObj && selectedWeeks.has(isoWeekKey(d.dateObj)))
    }

    const monthOrder = Array.from(new Set(dayCols.map((d) => (d.dateObj ? monthKey(d.dateObj) : '')).filter(Boolean)))
    const startIndex = Math.max(0, monthOrder.indexOf(selectedMonth))
    const selectedMonths = new Set(monthOrder.slice(startIndex, startIndex + count))
    return dayCols.filter((d) => d.dateObj && selectedMonths.has(monthKey(d.dateObj)))
  }

  function buildExportSheet(source: XLSX.WorkSheet, colsToExport: DayCol[]): XLSX.WorkSheet {
    const range = XLSX.utils.decode_range(source['!ref'] || 'A1:A1')
    const keptCols = [...Array.from({ length: 7 }, (_, i) => i), ...colsToExport.map((d) => d.c)]
    const colMap = new Map<number, number>()
    keptCols.forEach((oldCol, index) => colMap.set(oldCol, index))

    const out: XLSX.WorkSheet = {}
    for (let r = 0; r <= range.e.r; r++) {
      keptCols.forEach((oldCol) => {
        const newCol = colMap.get(oldCol)
        if (newCol === undefined) return
        const srcAddr = XLSX.utils.encode_cell({ r, c: oldCol })
        const srcCell = source[srcAddr]
        if (!srcCell) return
        const dstAddr = XLSX.utils.encode_cell({ r, c: newCol })
        out[dstAddr] = { ...srcCell }
      })
    }

    out['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: Math.max(0, keptCols.length - 1) } })
    if (source['!rows']) out['!rows'] = source['!rows']
    if (source['!cols']) {
      out['!cols'] = keptCols.map((oldCol) => {
        const colCfg = source['!cols']?.[oldCol]
        return colCfg ? { ...colCfg } : { wpx: oldCol < 7 ? META_COL_WIDTHS[oldCol] : DAY_COL_WIDTH }
      })
    }

    const merges = source['!merges'] || []
    if (merges.length > 0) {
      const outMerges: XLSX.Range[] = []
      merges.forEach((m) => {
        const overlapCols = keptCols.filter((col) => col >= m.s.c && col <= m.e.c)
        if (overlapCols.length === 0) return
        const firstOverlap = overlapCols[0]
        const lastOverlap = overlapCols[overlapCols.length - 1]
        if (firstOverlap === undefined || lastOverlap === undefined) return
        const startCol = colMap.get(firstOverlap)
        const endCol = colMap.get(lastOverlap)
        if (startCol === undefined || endCol === undefined) return
        outMerges.push({ s: { r: m.s.r, c: startCol }, e: { r: m.e.r, c: endCol } })
      })
      if (outMerges.length > 0) out['!merges'] = outMerges
    }

    return out
  }

  function exportWorkbook() {
    if (!wb) return
    const exportCols = selectedExportCols()
    if (exportCols.length === 0) {
      setStatus('No hay días para el rango de exportación seleccionado.')
      return
    }

    const wbExport = XLSX.utils.book_new()

    // Copy styles & themes from original workbook so exported file preserves cell formatting
    const wbSrc = wb as unknown as Record<string, unknown>
    const wbDst = wbExport as unknown as Record<string, unknown>
    if (wbSrc.Styles) wbDst.Styles = wbSrc.Styles
    if (wbSrc.Themes) wbDst.Themes = wbSrc.Themes

    const horarioName = wb.SheetNames.find((n) => n.toLowerCase() === 'horario') ?? wb.SheetNames[0]
    if (!horarioName) return
    const horarioSheet = wb.Sheets[horarioName]
    if (!horarioSheet) return

    wb.SheetNames.forEach((name) => {
      if (name.toLowerCase() === 'horario') return
      const sheet = wb.Sheets[name]
      if (sheet) XLSX.utils.book_append_sheet(wbExport, { ...sheet }, name)
    })

    XLSX.utils.book_append_sheet(wbExport, buildExportSheet(horarioSheet, exportCols), horarioName)

    const suffix = exportScope === 'all'
      ? 'completo'
      : exportScope === 'week'
        ? 'semana'
        : exportScope === 'month'
          ? 'mes'
          : exportScope === 'weeks'
            ? `${exportSpanCount}semanas`
            : `${exportSpanCount}meses`

    const outputName = originalFilename.replace(/\.xlsx$/i, '') + `_editado_${suffix}.xlsx`
    XLSX.writeFile(wbExport, outputName, { bookType: 'xlsx', compression: true })
    setStatus(`Archivo exportado (${exportCols.length} días): ${outputName}`)
  }

  function handleAddTechnician() {
    const name = newTechName.trim().toUpperCase()
    const rut = newTechRut.trim().toUpperCase()
    if (!name) {
      setStatus('Debes ingresar nombre del técnico.')
      return
    }

    const nextRow = (techRows.reduce((max, t) => Math.max(max, t.r), 2) || 2) + 1
    const shifts: Record<number, string> = {}
    dayCols.forEach((d) => {
      shifts[d.c] = shiftConfig.libreLabel || 'LIBRE'
    })

    const newTech: TechRow = {
      r: nextRow,
      turno: newTechGroup || 'A',
      area: newTechArea || 'Mantención',
      ceco: '',
      cargo: 'TÉCNICO MANTENCIÓN',
      direccion: '',
      rut,
      name,
      shifts,
    }

    setTechRows((prev) => [...prev, newTech])
    setCellValue(nextRow, 0, newTech.turno)
    setCellValue(nextRow, 1, newTech.area)
    setCellValue(nextRow, 2, newTech.ceco)
    setCellValue(nextRow, 3, newTech.cargo)
    setCellValue(nextRow, 4, newTech.direccion)
    setCellValue(nextRow, 5, newTech.rut)
    setCellValue(nextRow, 6, newTech.name)
    dayCols.forEach((d) => setCellValue(nextRow, d.c, shifts[d.c] ?? (shiftConfig.libreLabel || 'LIBRE')))

    if (!turnosCatalog.includes(shiftConfig.libreLabel || 'LIBRE')) {
      setTurnosCatalog((prev) => Array.from(new Set([...prev, shiftConfig.libreLabel || 'LIBRE'])))
    }

    setSelectedRow(nextRow)
    if (todayDayCol) setSelectedCol(todayDayCol.c)
    setNewTechName('')
    setNewTechRut('')
    setStatus(`Técnico agregado: ${name} (Grupo ${newTech.turno}).`) 
  }

  function handleAddPlaceholders() {
    // Detectar cuántos faltan por turno para llegar a 4
    const turnoCount: Record<string, number> = {}
    techRows.forEach((t) => { turnoCount[t.turno.trim().toUpperCase()] = (turnoCount[t.turno.trim().toUpperCase()] || 0) + 1 })
    const placeholders: { turno: string; name: string }[] = []
    for (const turno of ['A', 'B', 'C']) {
      const actual = turnoCount[turno] || 0
      for (let i = actual + 1; i <= 4; i++) {
        placeholders.push({ turno, name: `NUEVO ${turno}${i}, POR ASIGNAR` })
      }
    }
    const libreLabel = shiftConfig.libreLabel || 'LIBRE'
    const baseRow = (techRows.reduce((max, t) => Math.max(max, t.r), 2) || 2) + 1
    const newTechs: TechRow[] = placeholders.map((p, i) => {
      const shifts: Record<number, string> = {}
      dayCols.forEach((d) => { shifts[d.c] = libreLabel })
      return { r: baseRow + i, turno: p.turno, area: 'Mantención', ceco: '', cargo: 'TÉCNICO MANTENCIÓN', direccion: '', rut: '', name: p.name, shifts }
    })
    setTechRows((prev) => {
      // No agregar si ya existen
      const existing = new Set(prev.map((t) => t.name))
      return [...prev, ...newTechs.filter((t) => !existing.has(t.name))]
    })
    newTechs.forEach((tech) => {
      setCellValue(tech.r, 0, tech.turno)
      setCellValue(tech.r, 1, tech.area)
      setCellValue(tech.r, 6, tech.name)
      dayCols.forEach((d) => setCellValue(tech.r, d.c, libreLabel))
    })
    if (placeholders.length === 0) {
      setStatus('Ya hay 4 técnicos por turno, no se agregaron placeholders.')
      return
    }
    setStatus(`${placeholders.length} placeholder(s) agregados: ${placeholders.map(p => p.name.split(',')[0]).join(', ')}.`)
  }

  function handleUpdateTechnicianField(row: number, field: 'turno' | 'area', value: string) {
    const normalizedValue = field === 'turno' ? value.trim().toUpperCase() : value.trim()
    const current = techRows.find((tech) => tech.r === row)
    if (!current) return
    if (current[field] === normalizedValue) return
    pushUndoSnapshot()
    setTechRows((prev) => prev.map((tech) => {
      if (tech.r !== row) return tech
      const next = { ...tech, [field]: normalizedValue }
      if (field === 'turno') setCellValue(row, 0, next.turno)
      if (field === 'area') setCellValue(row, 1, next.area)
      return next
    }))
    setStatus(`Técnico actualizado (${field === 'turno' ? 'grupo' : 'área'}).`)
  }

  function scrollToToday() {
    const container = calendarScrollRef.current
    const todayCol = todayDayCol
    if (!container || !todayCol) return

    const dayIndex = dayCols.findIndex((d) => d.c === todayCol.c)
    if (dayIndex < 0) return

    const metaWidth = visibleMetaIndices.reduce((sum, gi) => sum + (effectiveMetaWidths[gi] || 90), 0)
    const colStart = metaWidth + (dayIndex * DAY_COL_WIDTH)
    const targetLeft = Math.max(0, colStart - ((container.clientWidth - DAY_COL_WIDTH) / 2))

    container.scrollTo({ left: targetLeft, behavior: 'smooth' })
    setSelectedCol(todayCol.c)
    setStatus(`Vista centrada en hoy: ${todayCol.dayLabel} ${formatDate(todayCol.dateObj)}`)
  }

  // ── Helpers vista móvil ──
  function shiftToMobileBadge(shift: string | undefined): { letter: string; cls: string } {
    if (!shift || shift.trim() === '' || shift.trim() === '0') return { letter: '–', cls: 'text-muted-foreground' }
    const s = shift.trim().toUpperCase()
    if (s === 'VACACIONES') return { letter: 'V', cls: 'bg-primary/[0.15] text-primary' }
    if (s === 'FERIADO')    return { letter: 'F', cls: 'bg-amber-500/[0.15] text-amber-600' }
    if (s.includes('LIBRE')) return { letter: 'L', cls: 'bg-muted-foreground/[0.10] text-muted-foreground' }
    // Detectar por hora de inicio (robusto ante turnos reducidos y variantes)
    const startTime = shift.match(/^(\d{1,2}:\d{2})/)?.[1]
    if (startTime) {
      if (startTime === shiftConfig.nocheInicio) return { letter: 'N', cls: 'bg-cat-6-tint/[0.15] text-cat-6-ink' }
      if (startTime === shiftConfig.tardeInicio) return { letter: 'T', cls: 'bg-amber-500/[0.15] text-amber-600' }
      if (startTime === shiftConfig.diaInicio)   return { letter: 'D', cls: 'bg-primary/[0.15] text-primary' }
    }
    return { letter: '·', cls: 'text-muted-foreground' }
  }

  // isReducedShift ya definida arriba (línea ~1286)

  function shiftTimeCompact(shift: string | undefined): { start: string; end: string } | null {
    if (!shift) return null
    const m = shift.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (!m || !m[1] || !m[2]) return null
    return { start: m[1], end: m[2] }
  }

  function openMobileEdit(tech: TechRow, d: DayCol) {
    const shift = tech.shifts[d.c] || ''
    const times = shiftTimeCompact(shift)
    setMobileEditCell({ techR: tech.r, dayC: d.c })
    setMobileEditStart(times?.start || shiftConfig.diaInicio)
    setMobileEditEnd(times?.end || shiftConfig.diaFin)
  }

  function saveMobileEdit() {
    if (!mobileEditCell || !mobileEditStart || !mobileEditEnd) return
    applyShift(mobileEditCell.techR, mobileEditCell.dayC, `${mobileEditStart} - ${mobileEditEnd}`)
    setMobileEditCell(null)
  }

  function shortName(name: string): string {
    // Formato Excel: "APELLIDO1 APELLIDO2, NOMBRE1 NOMBRE2"
    if (name.includes(',')) {
      const [apellidos, nombres] = name.split(',').map((s) => s.trim())
      const aps = (apellidos ?? '').split(/\s+/).filter(Boolean)
      const nms = (nombres ?? '').split(/\s+/).filter(Boolean)
      const primerNombre = nms[0] ?? ''
      const ap1 = aps[0] ?? ''
      const ap2Ini = aps[1] ? ` ${aps[1][0]}.` : ''
      return `${primerNombre} ${ap1}${ap2Ini}`
    }
    // Sin coma: mostrar primeras 2-3 palabras
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length <= 2) return name.trim()
    return `${parts[0]} ${parts[1]} ${parts[2]![0]}.`
  }

  function shortWeekday(date: Date | null): string {
    if (!date) return ''
    return (['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'] as const)[date.getDay()] ?? ''
  }

  const weekKeys = useMemo(() => Object.keys(weeks).sort(), [weeks])
  const currentWeekIdx = useMemo(() => weekKeys.indexOf(selectedWeek), [weekKeys, selectedWeek])
  const prevWeekKey = weekKeys[currentWeekIdx - 1] ?? null
  const nextWeekKey = weekKeys[currentWeekIdx + 1] ?? null
  const todayWeekKey = useMemo(() => isoWeekKey(new Date(todayTick)), [todayTick])
  const isCurrentWeek = selectedWeek === todayWeekKey

  const mobileWeekLabel = useMemo(() => {
    const parts = selectedWeek.split('-W')
    return parts.length === 2 ? `Sem ${parts[1]} · ${parts[0]}` : (selectedWeek || 'Semana actual')
  }, [selectedWeek])

  function handleSwipe(deltaX: number) {
    // deltaX = startX - endX: positivo = dedo movió izquierda = ir a semana siguiente
    if (deltaX > 50 && nextWeekKey) setSelectedWeek(nextWeekKey)
    else if (deltaX < -50 && prevWeekKey) setSelectedWeek(prevWeekKey)
  }

  const TAB_ITEMS: { id: TabId; label: string }[] = [
    { id: 'edicion', label: 'Edición' },
    { id: 'plantillas', label: 'Turnos' },
    { id: 'horas', label: 'Horas' },
    { id: 'tecnicos', label: 'Técnicos' },
    { id: 'control', label: 'Control' },
  ]

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">

      {/* ══════════════════════════════════════════
          VISTA MÓVIL — lectura de turnos por semana
          ══════════════════════════════════════════ */}
      {isMobile && (
        <div className="h-full min-h-0 flex flex-col gap-1">

          {isLandscape ? (
            /* ── LANDSCAPE: una sola fila compacta ── */
            <div className="flex items-center gap-1 rounded-lg border bg-card px-1.5 py-0.5 shrink-0">
              <button onClick={() => prevWeekKey && setSelectedWeek(prevWeekKey)} disabled={!prevWeekKey}
                className="h-6 w-6 shrink-0 flex items-center justify-center rounded border border-border text-sm text-muted-foreground disabled:opacity-30 active:bg-muted select-none">‹</button>
              <div className="text-center min-w-0 flex-1">
                <span className="text-[10px] font-semibold text-foreground">{mobileWeekLabel}</span>
                {isCurrentWeek
                  ? <span className="ml-1 text-[8px] text-yellow-400">● hoy</span>
                  : weekKeys.includes(todayWeekKey) && (
                    <button onClick={() => setSelectedWeek(todayWeekKey)}
                      className="ml-1.5 h-5 px-1.5 text-[9px] font-medium text-amber-600 border border-amber-500/[0.25] rounded bg-amber-500/[0.15] active:bg-amber-500/[0.15] select-none">↩ Ir a hoy</button>
                  )
                }
              </div>
              <button onClick={() => nextWeekKey && setSelectedWeek(nextWeekKey)} disabled={!nextWeekKey}
                className="h-6 w-6 shrink-0 flex items-center justify-center rounded border border-border text-sm text-muted-foreground disabled:opacity-30 active:bg-muted select-none">›</button>
              <div className="w-px h-4 bg-border/50 mx-0.5 shrink-0" />
              {([
                { id: 'badges',  label: 'D/T/N' },
                { id: 'times',   label: 'HH:MM' },
                { id: 'reduced', label: '↓R' },
              ] as const).map(v => (
                <button key={v.id} onClick={() => { setMobileViewMode(v.id); setMobileTappedCell(null) }}
                  className={`h-6 px-2 rounded border text-[10px] font-medium transition-colors select-none ${mobileViewMode === v.id ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-muted-foreground active:bg-muted'}`}>
                  {v.label}</button>
              ))}
              <button
                onClick={() => { if (mobileEditMode) { setMobileEditMode(false); setMobileEditCell(null); setMobileTappedCell(null) } else { setMobileAdminGateInput(''); setMobileAdminGateError(''); setMobileAdminGateOpen(true) } }}
                className={`h-6 px-2 rounded border text-[10px] font-medium transition-colors select-none ${mobileEditMode ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-border text-muted-foreground active:bg-muted'}`}>✏</button>
              <span title={syncIndicator.label} className={`w-1.5 h-1.5 rounded-full shrink-0 ml-0.5 ${syncState === 'saving' ? 'bg-amber-400' : syncState === 'synced' ? 'bg-emerald-400' : syncState === 'error' ? 'bg-red-400' : 'bg-zinc-600'}`} />
            </div>
          ) : (
            /* ── PORTRAIT: dos filas ── */
            <>
              <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2 py-1 shrink-0">
                <button onClick={() => prevWeekKey && setSelectedWeek(prevWeekKey)} disabled={!prevWeekKey}
                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded border border-border text-base text-muted-foreground disabled:opacity-30 active:bg-muted select-none">‹</button>
                <div className="flex-1 text-center min-w-0">
                  <div className="text-[11px] font-semibold text-foreground truncate leading-tight">
                    {mobileWeekLabel}
                    {isCurrentWeek && <span className="ml-1 text-[9px] text-yellow-400 font-normal">● hoy</span>}
                  </div>
                  <div className="text-[9px] text-muted-foreground/70 leading-tight">
                    {weekDays[0] ? formatDate(weekDays[0].dateObj) : '—'}–{weekDays.length > 0 ? formatDate(weekDays[weekDays.length - 1]!.dateObj) : '—'}
                  </div>
                </div>
                {!isCurrentWeek && weekKeys.includes(todayWeekKey) && (
                  <button onClick={() => setSelectedWeek(todayWeekKey)}
                    className="shrink-0 h-6 px-1.5 rounded border border-amber-500/[0.25] bg-amber-500/[0.15] text-[9px] font-medium text-amber-600 active:bg-amber-500/[0.15] select-none">↩ Hoy</button>
                )}
                <span title={syncIndicator.label} className={`w-2 h-2 rounded-full shrink-0 ${syncState === 'saving' ? 'bg-amber-400' : syncState === 'synced' ? 'bg-emerald-400' : syncState === 'error' ? 'bg-red-400' : 'bg-zinc-600'}`} />
                <button onClick={() => nextWeekKey && setSelectedWeek(nextWeekKey)} disabled={!nextWeekKey}
                  className="h-7 w-7 shrink-0 flex items-center justify-center rounded border border-border text-base text-muted-foreground disabled:opacity-30 active:bg-muted select-none">›</button>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {([
                  { id: 'badges',  label: 'D/T/N',   title: 'Vista de letras — tap para ver hora' },
                  { id: 'times',   label: 'HH:MM',   title: 'Muestra el horario de cada turno' },
                  { id: 'reduced', label: '↓Reducc', title: 'Destaca solo los turnos con reducción horaria' },
                ] as const).map(v => (
                  <button key={v.id} title={v.title} onClick={() => { setMobileViewMode(v.id); setMobileTappedCell(null) }}
                    className={`flex-1 h-6 rounded border text-[11px] font-medium transition-colors select-none ${mobileViewMode === v.id ? 'bg-primary border-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground active:bg-muted'}`}>
                    {v.label}</button>
                ))}
                <button
                  onClick={() => { if (mobileEditMode) { setMobileEditMode(false); setMobileEditCell(null); setMobileTappedCell(null) } else { setMobileAdminGateInput(''); setMobileAdminGateError(''); setMobileAdminGateOpen(true) } }}
                  className={`h-6 px-2.5 rounded border text-[11px] font-medium transition-colors select-none ${mobileEditMode ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-border text-muted-foreground hover:text-foreground active:bg-muted'}`}>✏</button>
              </div>
            </>
          )}

          {/* Grilla semanal */}
          <div
            className="flex-1 min-h-0 overflow-auto rounded-lg border bg-card"
            onTouchStart={(e) => { touchStartX.current = e.touches[0]?.clientX ?? null }}
            onTouchEnd={(e) => {
              if (touchStartX.current === null) return
              handleSwipe(touchStartX.current - (e.changedTouches[0]?.clientX ?? touchStartX.current))
              touchStartX.current = null
            }}
          >
            {weekDays.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-xs text-muted-foreground p-6 text-center">
                <span className="text-2xl">📅</span>
                <span>No hay datos cargados.<br/>Usa <strong>"Editar"</strong> para cargar el calendario.</span>
              </div>
            ) : (
              <table className={`border-collapse text-[11px] ${isLandscape ? 'w-full table-fixed' : 'min-w-max'}`}>
                <thead className="sticky top-0 z-[15]">
                  <tr className="bg-muted text-foreground border-b border-border">
                    <th className="sticky left-0 z-[25] bg-muted px-1.5 py-1.5 text-left font-semibold"
                      style={isLandscape ? { width: '25%' } : { width: 110, minWidth: 110, maxWidth: 110 }}>
                      {mobileEditMode ? <span className="text-emerald-600 text-[10px]">✏ Toca un día</span> : <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Técnico</span>}
                    </th>
                    {weekDays.map((d) => {
                      const isT = isSameDate(d.dateObj, todayDayCol?.dateObj ?? null)
                      return (
                        <th key={d.c} className={`px-1 py-1 text-center ${isT ? 'bg-amber-500/[0.15] text-amber-600' : ''}`}
                          style={isLandscape ? undefined : { minWidth: 46 }}>
                          <div className="text-[9px] font-normal text-muted-foreground">{shortWeekday(d.dateObj)}</div>
                          <div className="font-bold leading-tight text-foreground">{d.dateObj?.getDate()}</div>
                        </th>
                      )
                    })}
                    <th className="sticky right-0 z-[25] bg-muted px-1 py-1.5 border-l border-border"
                      style={isLandscape ? { width: '25%' } : { width: 50, minWidth: 50 }}
                      title="Horas trabajadas esta semana · este mes">
                      {isLandscape ? (
                        <div className="flex items-center justify-around text-[8px] font-normal opacity-90 px-1 gap-0.5">
                          <span className="whitespace-nowrap">h·sem</span>
                          <span className="opacity-40">|</span>
                          <span className="whitespace-nowrap opacity-70">h·mes</span>
                        </div>
                      ) : (
                        <div className="text-[9px] font-normal opacity-90 text-right pr-0.5 leading-tight">
                          <div>h.sem</div>
                          <div className="opacity-70">h.mes</div>
                        </div>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {techRows.map((tech, idx) => {
                    const turnoKey = tech.turno.trim().toUpperCase()
                    const nextTurno = techRows[idx + 1]?.turno.trim().toUpperCase()
                    const isLastOfGroup = nextTurno && nextTurno !== turnoKey
                    const rowBg = turnoKey === 'A' ? 'bg-cat-7-tint/[0.15]' : turnoKey === 'B' ? 'bg-amber-500/[0.15]' : turnoKey === 'C' ? 'bg-cat-6-tint/[0.15]' : idx % 2 === 1 ? 'bg-muted' : ''
                    const stickyBg = turnoKey === 'A' ? 'bg-cat-7-tint/[0.15]' : turnoKey === 'B' ? 'bg-amber-500/[0.15]' : turnoKey === 'C' ? 'bg-cat-6-tint/[0.15]' : 'bg-card'
                    const cellPy = isLandscape ? 'py-0' : 'py-1.5'
                    return (
                    <tr key={tech.r} className={`${isLastOfGroup ? 'border-b-2 border-border' : 'border-b border-border/40'} ${rowBg}`}>
                      <td className={`sticky left-0 z-[5] ${stickyBg} border-r border-border/30 px-1.5 ${cellPy}`}
                        style={isLandscape ? { width: '25%' } : { width: 110, minWidth: 110, maxWidth: 110 }}>
                        <div className="flex items-center gap-1.5">
                          <span className={`shrink-0 inline-flex h-5 w-5 items-center justify-center rounded border text-[9px] font-bold ${turnoBadgeClass(tech.turno)}`}>
                            {tech.turno || '·'}
                          </span>
                          <span className="truncate font-medium text-foreground">{shortName(tech.name)}</span>
                        </div>
                      </td>
                      {weekDays.map((d) => {
                        const shift = tech.shifts[d.c]
                        const badge = shiftToMobileBadge(shift)
                        const times = shiftTimeCompact(shift)
                        const isT = isSameDate(d.dateObj, todayDayCol?.dateObj ?? null)
                        const isTapped = mobileTappedCell?.techR === tech.r && mobileTappedCell?.dayC === d.c
                        const isEditing = mobileEditCell?.techR === tech.r && mobileEditCell?.dayC === d.c
                        const isReduced = isReducedShift(shift ?? '')

                        // Ancho de celda: landscape = 100%, portrait = fijo
                        const cellW = isLandscape ? 'w-full' : 'w-10'
                        const cellH = isLandscape ? 'h-6' : 'h-8'

                        // Contenido de la celda según la vista activa
                        let cellContent: ReactNode
                        if (mobileEditMode) {
                          cellContent = (
                            <button
                              onClick={() => openMobileEdit(tech, d)}
                              className={`inline-flex flex-col items-center justify-center ${cellW} ${cellH} rounded border text-[10px] font-bold transition-colors ${
                                isEditing
                                  ? 'border-emerald-400 bg-emerald-500/[0.15] text-emerald-600'
                                  : 'border-dashed border-border/60 hover:border-primary/60 active:bg-muted'
                              } ${badge.cls}`}
                            >
                              {times ? (
                                <>
                                  <span className="text-[8px] leading-none">{times.start}</span>
                                  <span className="text-[8px] leading-none opacity-60">{times.end}</span>
                                </>
                              ) : badge.letter}
                            </button>
                          )
                        } else if (mobileViewMode === 'badges') {
                          if (isLandscape) {
                            // Landscape D/T/N: solo letra, sin hora
                            cellContent = (
                              <span className={`inline-flex items-center justify-center ${cellW} ${cellH} rounded font-bold ${badge.cls}`}>
                                <span className="text-[12px] leading-none">{badge.letter}</span>
                              </span>
                            )
                          } else if (isTapped && times) {
                            // Portrait tapped: muestra hora
                            cellContent = (
                              <button
                                onClick={() => setMobileTappedCell(null)}
                                className={`inline-flex flex-col items-center justify-center ${cellW} ${cellH} rounded bg-muted text-foreground`}
                              >
                                <span className="text-[8px] leading-none">{times.start}</span>
                                <span className="text-[8px] leading-none opacity-70">{times.end}</span>
                              </button>
                            )
                          } else {
                            // Portrait normal: solo letra, tap para ver hora
                            cellContent = (
                              <button
                                onClick={() => times && setMobileTappedCell({ techR: tech.r, dayC: d.c })}
                                className={`inline-flex items-center justify-center ${cellW} ${cellH} rounded font-bold ${badge.cls} ${times ? 'active:opacity-70' : ''}`}
                              >
                                {badge.letter}
                              </button>
                            )
                          }
                        } else if (mobileViewMode === 'times') {
                          // Vista HH:MM — horarios con color de turno
                          cellContent = times ? (
                            <span className={`inline-flex flex-col items-center justify-center ${cellW} ${cellH} rounded ${badge.cls}`}>
                              <span className="text-[9px] font-bold leading-tight">{times.start}</span>
                              <span className="text-[9px] leading-tight opacity-70">{times.end}</span>
                            </span>
                          ) : (
                            <span className={`inline-flex items-center justify-center ${cellW} ${cellH} rounded font-bold ${badge.cls}`}>{badge.letter}</span>
                          )
                        } else {
                          // Vista C — reducidos destacados, normales como letra
                          cellContent = isReduced && times ? (
                            <span className={`inline-flex flex-col items-center justify-center ${cellW} ${cellH} rounded bg-cat-4-tint/[0.15] border border-cat-4-tint/[0.25]`}>
                              <span className="text-[9px] font-semibold text-cat-4-ink leading-tight">{times.start}</span>
                              <span className="text-[9px] text-orange-400/70 leading-tight">{times.end}</span>
                            </span>
                          ) : (
                            <span className={`inline-flex items-center justify-center ${cellW} ${cellH} rounded font-bold ${badge.cls}`}>{badge.letter}</span>
                          )
                        }

                        return (
                          <td key={d.c} className={`${isLandscape ? 'px-1' : 'px-0.5'} ${cellPy} text-center ${isT ? 'bg-amber-500/[0.15]' : ''}`}>
                            {cellContent}
                          </td>
                        )
                      })}
                      {/* Columna de horas sticky derecha */}
                      {(() => {
                        const hr = hoursRows[idx]
                        if (!hr) return null
                        const tol = Math.max(hoursConfig.toleranceHours || 0.5, 0.5)
                        const wDelta = hr.deltaWeek
                        const mDelta = hr.deltaMonth
                        // 4 zonas: sobretiempo | en rango | bajo | muy bajo
                        const wCls = wDelta > tol * 4 ? 'text-orange-400'
                                   : wDelta >= -tol ? 'text-emerald-400'
                                   : wDelta >= -tol * 6 ? 'text-amber-400'
                                   : 'text-red-400'
                        const mCls = mDelta > tol * 16 ? 'text-orange-400'
                                   : mDelta >= -tol * 4 ? 'text-emerald-400'
                                   : mDelta >= -tol * 24 ? 'text-amber-400'
                                   : 'text-red-400'
                        return (
                          <td className={`sticky right-0 z-[5] border-l border-border/30 px-1 ${cellPy} ${stickyBg}`}
                            style={isLandscape ? { width: '25%' } : { width: 50, minWidth: 50 }}>
                            {isLandscape ? (
                              /* Landscape: sem | mes lado a lado */
                              <div className="flex items-center justify-around px-1 h-full gap-1">
                                <div className="flex flex-col items-center">
                                  <span className={`text-[12px] font-bold leading-none ${wCls}`}>{hr.weekHours.toFixed(0)}</span>
                                  <span className="text-[7px] text-muted-foreground/40 leading-tight">h·sem</span>
                                </div>
                                <div className="w-px self-stretch bg-border/30 my-1" />
                                <div className="flex flex-col items-center">
                                  <span className={`text-[12px] font-bold leading-none ${mCls}`}>{hr.monthHours.toFixed(0)}</span>
                                  <span className="text-[7px] text-muted-foreground/40 leading-tight">h·mes</span>
                                </div>
                              </div>
                            ) : (
                              /* Portrait: icono + número compacto */
                              <div className="flex flex-col items-end pr-0.5 leading-none gap-0.5">
                                <div className="flex items-center gap-0.5">
                                  <span className={`text-[8px] ${wCls}`}>{wDelta > tol * 4 ? '⚡' : wDelta >= -tol ? '✓' : wDelta >= -tol * 6 ? '⚠' : '✗'}</span>
                                  <span className={`text-[10px] font-bold ${wCls}`}>{hr.weekHours.toFixed(0)}</span>
                                  <span className="text-[8px] text-muted-foreground/50">h·s</span>
                                </div>
                                <div className="flex items-center gap-0.5">
                                  <span className={`text-[8px] ${mCls}`}>{mDelta > tol * 16 ? '⚡' : mDelta >= -tol * 4 ? '✓' : mDelta >= -tol * 24 ? '⚠' : '✗'}</span>
                                  <span className={`text-[10px] font-bold ${mCls}`}>{hr.monthHours.toFixed(0)}</span>
                                  <span className="text-[8px] text-muted-foreground/50">h·m</span>
                                </div>
                              </div>
                            )}
                          </td>
                        )
                      })()}
                    </tr>
                    )
                  })}
                  {/* Fila resumen: personal trabajando por día */}
                  <tr className="border-t border-border/40 bg-muted">
                    <td className="sticky left-0 z-[5] bg-muted border-r border-border/30 px-1.5 py-1" style={{ minWidth: 110, maxWidth: 110 }}>
                      <span className="text-[9px] text-muted-foreground font-medium">Trabajando</span>
                    </td>
                    {weekDays.map((d) => {
                      const isT = isSameDate(d.dateObj, todayDayCol?.dateObj ?? null)
                      const count = techRows.filter(t => isWorkingShift(t.shifts[d.c] || '')).length
                      const libre = techRows.filter(t => !isWorkingShift(t.shifts[d.c] || '') && !isVacationShift(t.shifts[d.c] || '') && !isHolidayShift(t.shifts[d.c] || '')).length
                      const pct = techRows.length > 0 ? count / techRows.length : 0
                      const countCls = pct >= 0.8 ? 'text-emerald-400' : pct >= 0.5 ? 'text-amber-400' : 'text-red-400'
                      return (
                        <td key={d.c} className={`${isLandscape ? 'px-1' : 'px-0.5'} py-1 text-center ${isT ? 'bg-amber-500/[0.15]' : ''}`}>
                          <span className={`text-[10px] font-bold ${countCls}`}>{count}</span>
                          {isLandscape && libre > 0 && <span className="text-[8px] text-muted-foreground ml-0.5">/{libre}L</span>}
                        </td>
                      )
                    })}
                    <td className="sticky right-0 z-[5] bg-muted border-l border-border/30 px-1 py-1 text-center"
                      style={isLandscape ? { width: '25%' } : { width: 50, minWidth: 50 }}>
                      <span className="text-[9px] text-muted-foreground/50">/{techRows.length}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Leyenda (solo en vista badges) + collapse editar — oculto en landscape */}
          <div className={`shrink-0 space-y-1.5 ${isLandscape ? 'hidden' : ''}`}>
            {mobileViewMode === 'badges' && !mobileEditMode && (
              <div className="flex items-center gap-2 px-1 flex-wrap">
                {([
                  { letter: 'D', cls: 'bg-primary/[0.15] text-primary', label: 'Día' },
                  { letter: 'T', cls: 'bg-amber-500/[0.15] text-amber-600', label: 'Tarde' },
                  { letter: 'N', cls: 'bg-cat-6-tint/[0.15] text-cat-6-ink', label: 'Noche' },
                  { letter: 'L', cls: 'bg-muted-foreground/[0.10] text-muted-foreground', label: 'Libre' },
                  { letter: 'V', cls: 'bg-primary/[0.15] text-primary', label: 'Vac.' },
                ] as const).map(({ letter, cls, label }) => (
                  <div key={letter} className="flex items-center gap-1">
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold ${cls}`}>{letter}</span>
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                  </div>
                ))}
                <span className="text-[10px] text-muted-foreground ml-1">· Tap celda = ver hora</span>
              </div>
            )}
            {mobileViewMode === 'reduced' && !mobileEditMode && (
              <div className="flex items-center gap-2 px-1">
                <span className="inline-flex items-center justify-center h-5 px-1.5 rounded border border-cat-4-tint/[0.25] bg-cat-4-tint/[0.15] text-[9px] text-cat-4-ink">08:00 / 15:00</span>
                <span className="text-[10px] text-muted-foreground">= turno con reducción horaria</span>
              </div>
            )}
            {mobileEditMode && (
              <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] text-emerald-400">✏ Modo edición activo — toca cualquier día para ajustar su horario</span>
              </div>
            )}

            <details className="rounded-lg border bg-card group">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground select-none">
                <span>⚙ Editar calendario</span>
                <span className="text-sm leading-none transition-transform group-open:rotate-180">⌄</span>
              </summary>
              <div className="border-t border-border p-2 space-y-2">
                <div className="text-[11px] text-muted-foreground">Para configurar horarios base, técnicos o exportar Excel, accede desde escritorio o tablet.</div>
                <div className={`rounded border px-2 py-1 text-[11px] ${syncIndicator.className}`}>{syncIndicator.label}</div>
                <div className="text-[10px] text-muted-foreground">{originalFilename}</div>
              </div>
            </details>
          </div>

          {/* Panel de edición de celda (bottom sheet) */}
          {mobileEditMode && mobileEditCell && (
            <div className="fixed bottom-10 left-0 right-0 z-50 bg-card border-t border-primary/40 shadow-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-foreground">
                  {techRows.find(t => t.r === mobileEditCell.techR)?.name?.split(/[\s,]+/)[0] ?? ''}
                  {' · '}
                  {weekDays.find(d => d.c === mobileEditCell.dayC)?.dayLabel ?? ''}
                </div>
                <button onClick={() => setMobileEditCell(null)} className="text-muted-foreground text-sm px-2">✕</button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Hora inicio</label>
                  <input
                    type="time"
                    className="w-full h-10 rounded border border-border bg-background px-2 text-sm text-foreground [color-scheme:dark]"
                    value={mobileEditStart}
                    onChange={(e) => setMobileEditStart(e.target.value)}
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] text-muted-foreground">Hora fin</label>
                  <input
                    type="time"
                    className="w-full h-10 rounded border border-border bg-background px-2 text-sm text-foreground [color-scheme:dark]"
                    value={mobileEditEnd}
                    onChange={(e) => setMobileEditEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveMobileEdit}
                  className="flex-1 h-10 rounded bg-primary text-sm font-medium text-primary-foreground active:opacity-90"
                >Guardar</button>
                <button
                  onClick={() => setMobileEditCell(null)}
                  className="flex-1 h-10 rounded border border-border text-sm text-muted-foreground active:bg-muted"
                >Cancelar</button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Modal: Clave de edición (móvil) ── */}
      {mobileAdminGateOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-xs rounded-xl border border-border bg-card p-5 shadow-2xl">
            <p className="mb-3 text-sm font-semibold text-foreground">Clave de edición</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                const correctPwd = await getHmiTooltipPwd()
                if (mobileAdminGateInput.trim() !== correctPwd) {
                  setMobileAdminGateError('Clave incorrecta')
                  return
                }
                setMobileAdminGateOpen(false)
                setMobileEditMode(true)
                setMobileEditCell(null)
                setMobileTappedCell(null)
              }}
              className="space-y-3"
            >
              <input
                type="password"
                autoFocus
                value={mobileAdminGateInput}
                onChange={(e) => { setMobileAdminGateInput(e.target.value); setMobileAdminGateError('') }}
                placeholder="Ingresa la clave…"
                className="w-full h-10 px-3 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground [color-scheme:dark]"
              />
              {mobileAdminGateError && (
                <p className="text-xs text-destructive">{mobileAdminGateError}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMobileAdminGateOpen(false)}
                  className="flex-1 h-10 rounded border border-border text-sm text-muted-foreground active:bg-muted"
                >Cancelar</button>
                <button
                  type="submit"
                  disabled={!mobileAdminGateInput.trim()}
                  className="flex-1 h-10 rounded bg-primary text-sm font-medium text-primary-foreground disabled:opacity-40 active:opacity-90"
                >Confirmar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          VISTA DESKTOP — panel de tabs + tabla
          ══════════════════════════════════════════ */}
      {!isMobile && <section className="sticky top-0 z-20 rounded-lg border bg-card p-2">
        {/* ── Tab bar ── */}
        <div className="flex items-center gap-1 border-b border-border pb-1 mb-2">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1 rounded-t text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab: Edición ── */}
        {activeTab === 'edicion' && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Plantilla Excel opcional</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                className="text-xs"
                onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Exportar calendario</label>
              <button className="h-8 rounded border text-xs" onClick={exportWorkbook}>Exportar</button>
              <div className="grid grid-cols-2 gap-1">
                <button className="h-8 rounded border text-xs" onClick={() => extendCalendarByDays(28)}>Extender +4 semanas</button>
                <button className="h-8 rounded border text-xs" onClick={() => extendCalendarByDays(31)}>Extender +1 mes</button>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px]">
                <select className={CONTROL_CLASS + ' h-7'} value={exportScope} onChange={(e) => setExportScope(e.target.value as ExportScope)}>
                  <option value="month">Mes actual</option>
                  <option value="week">Semana actual</option>
                  <option value="months">N meses</option>
                  <option value="weeks">N semanas</option>
                  <option value="all">Todo</option>
                </select>
                <input
                  className={CONTROL_CLASS + ' h-7'}
                  type="number"
                  min={1}
                  max={12}
                  value={exportSpanCount}
                  onChange={(e) => setExportSpanCount(Math.max(1, Math.floor(toNumberOr(e.target.value, exportSpanCount))))}
                  disabled={!(exportScope === 'weeks' || exportScope === 'months')}
                  title="Cantidad para N semanas/N meses"
                />
                <div className="h-7 rounded border border-border px-2 flex items-center text-muted-foreground">
                  {selectedExportCols().length} días
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Turnos ── */}
        {activeTab === 'plantillas' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
            <label className="text-muted-foreground self-center">Día</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" value={shiftConfig.diaInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, diaInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" value={shiftConfig.diaFin} onChange={(e) => setShiftConfig((p) => ({ ...p, diaFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center">Tarde</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" value={shiftConfig.tardeInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, tardeInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" value={shiftConfig.tardeFin} onChange={(e) => setShiftConfig((p) => ({ ...p, tardeFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center">Noche</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" value={shiftConfig.nocheInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, nocheInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" value={shiftConfig.nocheFin} onChange={(e) => setShiftConfig((p) => ({ ...p, nocheFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center">Libre</label>
            <input className={CONTROL_CLASS} value={shiftConfig.libreLabel} onChange={(e) => setShiftConfig((p) => ({ ...p, libreLabel: e.target.value }))} />
            <div className="col-span-2 sm:col-span-4">
              <button className="mt-1 h-8 w-full rounded bg-primary text-primary-foreground text-xs" onClick={handleShiftConfigApply}>Aplicar plantillas</button>
            </div>
          </div>
        )}

        {/* ── Tab: Horas ── */}
        {activeTab === 'horas' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
            <label className="text-muted-foreground self-center" title="Horas totales del turno diario (incluye colación).">Jornada total diaria (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.workHours} onChange={(e) => setHoursConfig((p) => ({ ...p, workHours: toNumberOr(e.target.value, p.workHours) }))} />
            <label className="text-muted-foreground self-center" title="Tiempo de colación diario. Se descuenta del cálculo de horas trabajadas.">Colación (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.breakHours} onChange={(e) => setHoursConfig((p) => ({ ...p, breakHours: toNumberOr(e.target.value, p.breakHours) }))} />
            <label className="text-muted-foreground self-center" title="Meta semanal legal. En modo automático usa el tramo vigente en Chile según fecha del período.">Jornada objetivo semanal (h)</label>
            <input
              className={CONTROL_CLASS}
              type="number"
              step="0.5"
              value={hoursConfig.autoLegalWeek ? expectedWeekBase : hoursConfig.expectedWeek}
              disabled={hoursConfig.autoLegalWeek}
              onChange={(e) => setHoursConfig((p) => ({ ...p, expectedWeek: toNumberOr(e.target.value, p.expectedWeek) }))}
            />
            <label className="text-muted-foreground self-center" title="Días de trabajo por ciclo semanal del régimen. Para 6x1 usar 6; para 5x2 usar 5.">Días trabajo/semana</label>
            <select className={CONTROL_CLASS} value={hoursConfig.workDaysPerWeek} onChange={(e) => setHoursConfig((p) => ({ ...p, workDaysPerWeek: Math.max(1, Math.min(7, Math.floor(toNumberOr(e.target.value, p.workDaysPerWeek)))) }))}>
              <option value={6}>6x1 (6 días trabajo)</option>
              <option value={5}>5x2 (5 días trabajo)</option>
              <option value={7}>7x0 (sin libre fijo)</option>
            </select>
            <label className="text-muted-foreground self-center">Esperadas mes (auto)</label>
            <div className={CONTROL_CLASS + ' flex items-center justify-between'}>
              <span className="font-medium tabular-nums">{expectedMonthAutoBase.toFixed(1)} h</span>
              <span className="text-[10px] text-muted-foreground">{monthCalendarDays} días calendario</span>
            </div>
            <label className="text-muted-foreground self-center" title="Margen permitido bajo la meta esperada sin activar alerta visual en Control.">Tolerancia (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.toleranceHours} onChange={(e) => setHoursConfig((p) => ({ ...p, toleranceHours: toNumberOr(e.target.value, p.toleranceHours) }))} />
            <label className="text-muted-foreground self-center" title="Reducción de horas por Ley de 40h para turno día (atajo Shift + D).">Reducción por ley 40h - Día (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" min="0" value={hoursConfig.dayReductionHours} onChange={(e) => setHoursConfig((p) => ({ ...p, dayReductionHours: toNumberOr(e.target.value, p.dayReductionHours) }))} />
            <label className="text-muted-foreground self-center" title="Reducción de horas por Ley de 40h para turno tarde (atajo Shift + T).">Reducción por ley 40h - Tarde (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" min="0" value={hoursConfig.afternoonReductionHours} onChange={(e) => setHoursConfig((p) => ({ ...p, afternoonReductionHours: toNumberOr(e.target.value, p.afternoonReductionHours) }))} />
            <label className="text-muted-foreground self-center" title="Reducción de horas por Ley de 40h para turno noche (atajo Shift + N).">Reducción por ley 40h - Noche (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" min="0" value={hoursConfig.nightReductionHours} onChange={(e) => setHoursConfig((p) => ({ ...p, nightReductionHours: toNumberOr(e.target.value, p.nightReductionHours) }))} />
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.useFixedDaily} onChange={(e) => setHoursConfig((p) => ({ ...p, useFixedDaily: e.target.checked }))} />
              <span title="Activado: cada día trabajado usa Jornada total - Colación. Desactivado: calcula horas desde el rango del turno (hora inicio/fin).">Horas fijas por día trabajado</span>
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.autoLegalWeek} onChange={(e) => setHoursConfig((p) => ({ ...p, autoLegalWeek: e.target.checked }))} />
              <span title="Activado: usa tramo legal chileno según fecha del período (44h hasta 25-04-2026, 42h desde 26-04-2026, 40h desde 26-04-2028).">Usar jornada legal automática de Chile</span>
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.expectedFromPlannedDays} onChange={(e) => setHoursConfig((p) => ({ ...p, expectedFromPlannedDays: e.target.checked }))} />
              <span title="Activado: esperado por técnico según días realmente programados (no LIBRE/descanso/licencia). Desactivado: prorrateo simple por calendario.">Esperado por días programados (recomendado para 6x1)</span>
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked disabled />
              <span title={`Fijo por regla legal interna: vacaciones se contabilizan solo en horario administrativo Lun-Vie. Horas de vacación por día = jornada legal semanal/5 (actual: ${expectedWeekBase}h/sem).`}>
                Vacaciones legales (fijo): solo Lun-Vie
              </span>
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.holidayAsNonWorking} onChange={(e) => setHoursConfig((p) => ({ ...p, holidayAsNonWorking: e.target.checked }))} />
              <span title="Activado: feriado puede tratarse como día no hábil en algunas métricas de meta. Desactivado: se evalúa como día normal.">Feriados como no hábil en métricas</span>
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.holidayBusinessDaysOnly} onChange={(e) => setHoursConfig((p) => ({ ...p, holidayBusinessDaysOnly: e.target.checked }))} />
              <span title="Activado: el feriado solo se considera en días hábiles. Desactivado: se considera sin restricción de día.">Feriados descuentan solo días hábiles</span>
            </label>
            <div className="col-span-2 sm:col-span-4 rounded border border-border/80 bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              Jornada trabajada diaria usada en cálculos = Jornada total diaria - Colación.
            </div>
            <div className="col-span-2 sm:col-span-4 rounded border border-border/80 bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              Jornada objetivo diaria legal = Jornada objetivo semanal / Días trabajo/semana = {expectedWeekBase.toFixed(1)} / {workDaysPerWeekBase} = {legalDailyTarget.toFixed(2)} h.
            </div>
            <div className="col-span-2 sm:col-span-4 rounded border border-border/80 bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {hoursConfig.expectedFromPlannedDays
                ? 'Semanal esperado (por técnico) = Jornada diaria legal × días programados de ese técnico en la semana.'
                : `Semanal esperado (prorrateo) = Jornada semanal legal × (días de la semana visibles / 7). En esta semana: ${expectedWeekBase.toFixed(1)} × (${weekDays.length}/7).`}
            </div>
            <div className="col-span-2 sm:col-span-4 rounded border border-border/80 bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {hoursConfig.expectedFromPlannedDays
                ? 'Mensual esperado (por técnico) = Jornada diaria legal × días programados de ese técnico en el mes.'
                : `Mensual esperado (prorrateo) = Jornada semanal legal × (días calendario del mes / 7). En este período: ${expectedWeekBase.toFixed(1)} × (${monthCalendarDays}/7) = ${expectedMonthAutoBase.toFixed(1)} h.`}
            </div>
            <div className="col-span-2 sm:col-span-4 rounded border border-border/80 bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {legalWeekLabel}
            </div>
            <div className="col-span-2 sm:col-span-4">
              <button className="mt-1 h-8 w-full rounded bg-primary text-primary-foreground text-xs" onClick={handleHoursConfigApply}>Aplicar parámetros</button>
            </div>
          </div>
        )}

        {/* ── Tab: Técnicos ── */}
        {activeTab === 'tecnicos' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
              <div className="grid gap-1">
                <label className="text-muted-foreground">Nombre técnico</label>
                <input className={CONTROL_CLASS} value={newTechName} onChange={(e) => setNewTechName(e.target.value)} placeholder="Nombre completo" />
              </div>
              <div className="grid gap-1">
                <label className="text-muted-foreground">RUT</label>
                <input className={CONTROL_CLASS} value={newTechRut} onChange={(e) => setNewTechRut(e.target.value)} placeholder="12.345.678-9" />
              </div>
              <div className="grid gap-1">
                <label className="text-muted-foreground">Grupo/Equipo</label>
                <select className={CONTROL_CLASS} value={newTechGroup} onChange={(e) => setNewTechGroup(e.target.value)}>
                  {techGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-muted-foreground">Área</label>
                <input className={CONTROL_CLASS} value={newTechArea} onChange={(e) => setNewTechArea(e.target.value)} placeholder="Mantención" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button className="h-8 rounded border border-border px-3 text-xs text-muted-foreground hover:bg-muted" onClick={handleAddPlaceholders} title="Agrega 6 placeholders: A3/A4, B3/B4, C3/C4">+ Placeholders turno</button>
              <button className="h-8 rounded bg-primary px-3 text-xs text-primary-foreground" onClick={handleAddTechnician}>Agregar técnico</button>
            </div>

            {/* Cards — móvil */}
            <div className="md:hidden space-y-2">
              {techRows.map((tech) => (
                <div key={tech.r} className="rounded border border-border bg-muted p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded border text-xs font-bold ${turnoBadgeClass(tech.turno)}`}>
                      {tech.turno || '-'}
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">{tech.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{tech.rut || 'Sin RUT'}</div>
                  <div className="flex gap-2">
                    <div className="flex-1 grid gap-1">
                      <label className="text-[10px] text-muted-foreground">Grupo</label>
                      <select
                        className={CONTROL_CLASS + ' w-full'}
                        value={tech.turno || ''}
                        onChange={(e) => handleUpdateTechnicianField(tech.r, 'turno', e.target.value)}
                      >
                        {Array.from(new Set([...baseGroupOptions, tech.turno].filter(Boolean))).map((group) => (
                          <option key={group} value={group}>{group}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 grid gap-1">
                      <label className="text-[10px] text-muted-foreground">Área</label>
                      <input
                        className={CONTROL_CLASS + ' w-full'}
                        value={tech.area || ''}
                        onChange={(e) => handleUpdateTechnicianField(tech.r, 'area', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla — desktop */}
            <div className="hidden md:block rounded border overflow-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-muted text-foreground">
                  <tr>
                    <th className="px-2 py-1 text-left">Técnico</th>
                    <th className="px-2 py-1 text-left">RUT</th>
                    <th className="px-2 py-1 text-left">Grupo</th>
                    <th className="px-2 py-1 text-left">Área/Equipo</th>
                  </tr>
                </thead>
                <tbody>
                  {techRows.map((tech) => {
                    return (
                    <tr key={tech.r} className="border-t border-border hover:bg-muted">
                      <td className="px-2 py-1">{tech.name}</td>
                      <td className="px-2 py-1">{tech.rut || '-'}</td>
                      <td className="px-2 py-1">
                        <select
                          className={CONTROL_CLASS + ' h-7 text-[11px]'}
                          value={tech.turno || ''}
                          onChange={(e) => handleUpdateTechnicianField(tech.r, 'turno', e.target.value)}
                        >
                          {Array.from(new Set([...baseGroupOptions, tech.turno].filter(Boolean))).map((group) => (
                            <option key={group} value={group}>{group}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={CONTROL_CLASS + ' h-7 text-[11px]'}
                          value={tech.area || ''}
                          onChange={(e) => handleUpdateTechnicianField(tech.r, 'area', e.target.value)}
                        />
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Control semanal y mensual ── */}
        {activeTab === 'control' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  <label className="font-medium text-foreground">Semana</label>
                  <span className="text-[10px] text-muted-foreground">({weekDays.length} días)</span>
                </div>
                <select className={CONTROL_CLASS + ' w-full'} value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
                  {Object.entries(weeks).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
                  <label className="font-medium text-foreground">Mes</label>
                  <span className="text-[10px] text-muted-foreground">({monthDays.length} días)</span>
                </div>
                <select className={CONTROL_CLASS + ' w-full'} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {Object.entries(months).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            </div>
            <div className="rounded-lg border border-border/40 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-20 border-b border-r border-border/30 bg-muted px-2 md:px-3 py-2 text-left text-xs font-semibold text-foreground" style={{ minWidth: 140 }}>
                      Técnico
                    </th>
                    <th colSpan={6} className="border-b border-l border-border/30 bg-primary/[0.15] dark:bg-gradient-to-r dark:from-blue-950/80 dark:to-blue-900/40 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-primary">
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />Resumen Semanal</span>
                    </th>
                    <th colSpan={6} className="border-b border-l-2 border-border/30 bg-cat-3-tint/[0.15] dark:bg-gradient-to-r dark:from-indigo-950/80 dark:to-indigo-900/40 px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-cat-3-ink">
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />Resumen Mensual</span>
                    </th>
                    <th rowSpan={2} className="border-b border-l-2 border-border/30 bg-muted px-2 py-1.5 text-center" style={{ minWidth: 44 }} title="Total de días de vacaciones acumulados en todo el calendario">
                      <div className="text-[10px] font-bold text-foreground">Vac.</div>
                      <div className="text-[9px] font-normal text-muted-foreground">Acum.</div>
                    </th>
                  </tr>
                  <tr className="bg-muted">
                    <th className="border-l border-border/20 px-1.5 py-1 text-right text-[10px] font-semibold text-primary/90" title="Horas totales (trabajadas + vacaciones pagadas + feriados pagados) / Horas esperadas según jornada legal">
                      <div>Horas</div><div className="font-normal text-[9px] text-muted-foreground">Real / Esp</div>
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-primary/90" style={{ minWidth: 90 }} title="Diferencia = Horas reales − Horas esperadas. Verde = cumple, Rojo = déficit">Diferencia</th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-primary/90" title="Días efectivamente trabajados (turnos asignados)">
                      <div>Días</div><div className="font-normal text-[9px] text-muted-foreground">Trab.</div>
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-primary/90" title="Días de descanso / libres (NO incluye vacaciones ni feriados)">
                      <div>Días</div><div className="font-normal text-[9px] text-muted-foreground">Libres</div>
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-primary/90" title="Días de vacaciones (horas pagadas incluidas en Horas Reales)">Vac.</th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-primary/90" title="Días feriados (horas pagadas incluidas en Horas Reales)">Fer.</th>
                    <th className="border-l-2 border-border/30 px-1.5 py-1 text-right text-[10px] font-semibold text-cat-3-ink/90" title="Horas totales del mes (trabajadas + vacaciones + feriados pagados) / Horas esperadas">
                      <div>Horas</div><div className="font-normal text-[9px] text-muted-foreground">Real / Esp</div>
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-cat-3-ink/90" style={{ minWidth: 90 }} title="Diferencia mensual = Horas reales − Horas esperadas">Diferencia</th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-cat-3-ink/90" title="Días efectivamente trabajados en el mes">
                      <div>Días</div><div className="font-normal text-[9px] text-muted-foreground">Trab.</div>
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-cat-3-ink/90" title="Días de descanso del mes (NO incluye vacaciones ni feriados)">
                      <div>Días</div><div className="font-normal text-[9px] text-muted-foreground">Libres</div>
                    </th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-cat-3-ink/90" title="Días de vacaciones del mes">Vac.</th>
                    <th className="px-1 py-1 text-center text-[10px] font-semibold text-cat-3-ink/90" title="Días feriados del mes">Fer.</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoursRows.map((row, idx) => {
                    const pctW = pctBar(row.weekHours, row.weekExpected)
                    const pctM = pctBar(row.monthHours, row.monthExpected)
                    const tolC = Math.max(hoursConfig.toleranceHours || 0.5, 0.5)
                    const wUnder = row.deltaWeek < -tolC
                    const wOver = row.deltaWeek > tolC * 4
                    const mUnder = row.deltaMonth < -tolC * 4
                    const mOver = row.deltaMonth > tolC * 16
                    const riskW = wUnder
                    const riskM = mUnder
                    const isRisk = wUnder || mUnder
                    const isOvertime = wOver || mOver
                    const zebra = idx % 2 === 1 ? 'bg-muted' : ''
                    const rowBg = isRisk ? 'bg-red-500/[0.15] hover:bg-red-500/[0.15] dark:hover:bg-red-500/[0.15]' : isOvertime ? 'bg-cat-4-tint/[0.15] hover:bg-cat-4-tint/[0.15] dark:hover:bg-cat-4-tint/[0.15]' : `${zebra} hover:bg-muted/50`
                    return (
                      <tr key={row.tech.r} className={`border-t border-border/20 transition-colors ${rowBg}`}>
                        <td className="sticky left-0 z-10 border-r border-border/20 bg-inherit px-2 md:px-3 py-1.5" style={{ minWidth: 140, maxWidth: 200 }}>
                          <div className="flex items-center gap-1.5">
                            {row.tech.turno && (
                              <span className={`shrink-0 inline-flex h-[18px] w-[18px] items-center justify-center rounded text-[9px] font-bold border ${turnoBadgeClass(row.tech.turno)}`}>
                                {row.tech.turno}
                              </span>
                            )}
                            <span className="truncate font-medium text-foreground" title={row.tech.name}>{row.tech.name}</span>
                          </div>
                        </td>
                        <td className="border-l border-border/15 px-1.5 py-1 text-right tabular-nums whitespace-nowrap" title={`Trabajo: ${row.weekWorkedHours.toFixed(1)}h · Vac pagadas: ${row.weekVacationPaidHours.toFixed(1)}h · Fer pagados: ${row.weekHolidayPaidHours.toFixed(1)}h · Colación: ${row.weekBreakHours.toFixed(1)}h`}>
                          <span className="text-foreground font-medium">{row.weekHours.toFixed(1)}</span>
                          <span className="text-zinc-600 mx-0.5">/</span>
                          <span className="text-muted-foreground">{row.weekExpected.toFixed(1)}</span>
                        </td>
                        <td className="px-1 py-1" style={{ minWidth: 90 }}>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-[5px] rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${wOver ? 'bg-orange-500' : riskW ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pctW}%` }} />
                            </div>
                            <span className={`shrink-0 inline-block min-w-[38px] rounded-md px-1 py-[1px] text-center text-[10px] tabular-nums font-bold ${wOver ? 'bg-cat-4-tint/[0.15] text-orange-400' : riskW ? 'bg-red-500/[0.15] text-red-400' : row.deltaWeek > 0 ? 'bg-emerald-500/[0.15] text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                              {formatDelta(row.deltaWeek)}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums">
                          <span className={`font-semibold ${row.weekWorkedDays > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>{row.weekWorkedDays}</span>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums text-muted-foreground">{row.weekFreeDays > 0 ? row.weekFreeDays : <span className="text-zinc-700">–</span>}</td>
                        <td className="px-1 py-1 text-center">
                          {row.weekVacationDays > 0
                            ? <span className="inline-block rounded-full border border-primary/[0.25] bg-primary/[0.15] px-1.5 py-[1px] text-[10px] font-bold tabular-nums text-primary" title={`${row.weekVacationPaidHours.toFixed(1)}h pagadas`}>{row.weekVacationDays}d</span>
                            : <span className="text-zinc-700">–</span>}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {row.weekHolidayDays > 0
                            ? <span className="inline-block rounded-full border border-amber-500/[0.25] bg-amber-500/[0.15] px-1.5 py-[1px] text-[10px] font-bold tabular-nums text-amber-600" title={`${row.weekHolidayPaidHours.toFixed(1)}h pagadas`}>{row.weekHolidayDays}d</span>
                            : <span className="text-zinc-700">–</span>}
                        </td>
                        <td className="border-l-2 border-border/25 px-1.5 py-1 text-right tabular-nums whitespace-nowrap" title={`Trabajo: ${row.monthWorkedHours.toFixed(1)}h · Vac pagadas: ${row.monthVacationPaidHours.toFixed(1)}h · Fer pagados: ${row.monthHolidayPaidHours.toFixed(1)}h · Colación: ${row.monthBreakHours.toFixed(1)}h`}>
                          <span className="text-foreground font-medium">{row.monthHours.toFixed(1)}</span>
                          <span className="text-zinc-600 mx-0.5">/</span>
                          <span className="text-muted-foreground">{row.monthExpected.toFixed(1)}</span>
                        </td>
                        <td className="px-1 py-1" style={{ minWidth: 90 }}>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-[5px] rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${mOver ? 'bg-orange-500' : riskM ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pctM}%` }} />
                            </div>
                            <span className={`shrink-0 inline-block min-w-[38px] rounded-md px-1 py-[1px] text-center text-[10px] tabular-nums font-bold ${mOver ? 'bg-cat-4-tint/[0.15] text-orange-400' : riskM ? 'bg-red-500/[0.15] text-red-400' : row.deltaMonth > 0 ? 'bg-emerald-500/[0.15] text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                              {formatDelta(row.deltaMonth)}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums">
                          <span className={`font-semibold ${row.monthWorkedDays > 0 ? 'text-emerald-400' : 'text-zinc-600'}`}>{row.monthWorkedDays}</span>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums text-muted-foreground">{row.monthFreeDays > 0 ? row.monthFreeDays : <span className="text-zinc-700">–</span>}</td>
                        <td className="px-1 py-1 text-center">
                          {row.monthVacationDays > 0
                            ? <span className="inline-block rounded-full border border-primary/[0.25] bg-primary/[0.15] px-1.5 py-[1px] text-[10px] font-bold tabular-nums text-primary" title={`${row.monthVacationPaidHours.toFixed(1)}h pagadas`}>{row.monthVacationDays}d</span>
                            : <span className="text-zinc-700">–</span>}
                        </td>
                        <td className="px-1 py-1 text-center">
                          {row.monthHolidayDays > 0
                            ? <span className="inline-block rounded-full border border-amber-500/[0.25] bg-amber-500/[0.15] px-1.5 py-[1px] text-[10px] font-bold tabular-nums text-amber-600" title={`${row.monthHolidayPaidHours.toFixed(1)}h pagadas`}>{row.monthHolidayDays}d</span>
                            : <span className="text-zinc-700">–</span>}
                        </td>
                        <td className="border-l-2 border-border/25 px-1.5 py-1 text-center tabular-nums">
                          {row.totalVacationDays > 0
                            ? <span className="font-bold text-primary">{row.totalVacationDays}</span>
                            : <span className="text-zinc-600">0</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">{status}</div>
          <div className={`max-w-[55%] truncate rounded border px-2 py-0.5 text-[11px] ${syncIndicator.className}`} title={syncIndicator.label}>
            {syncIndicator.label}
          </div>
        </div>
      </section>}

      {!isMobile && <section className="min-h-0 flex-1 rounded-lg border bg-card p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Calendario Mantención</div>
          <div className="flex items-center gap-1">
            <button
              className="h-7 rounded border px-2 text-xs"
              onClick={() => setShowAllCols((p) => !p)}
            >
              {isMobile
                ? (showAllCols ? 'Ocultar meta' : 'Ver meta')
                : (showAllCols ? 'Ocultar CeCo/Cargo/Dirección/RUT' : 'Mostrar CeCo/Cargo/Dirección/RUT')}
            </button>
            <button
              className="h-7 rounded border px-2 text-xs disabled:opacity-50"
              onClick={scrollToToday}
              disabled={!todayDayCol}
            >
              Ir a hoy
            </button>
          </div>
        </div>
        {!isMobile && <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Atajos (click en calendario para activar): D/T/N/L/V/F = Día/Tarde/Noche/Libre/Vacaciones/Feriado · Shift+D/T/N = Turno reducido · Flechas ←↑↓→ = Navegar · Ctrl+Z = Deshacer · Ctrl+Y / Ctrl+Shift+Z = Rehacer</div>
          <div className="flex items-center gap-1">
            <div className="shrink-0 rounded border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground" title={`Historial de cambios (actualizado: ${historyVersion})`}>
              Undo {undoStackRef.current.length} · Redo {redoStackRef.current.length}
            </div>
            <div className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${calendarShortcutsActive ? 'border-emerald-500/[0.25] bg-emerald-500/[0.15] text-emerald-600' : 'border-border bg-muted text-muted-foreground'}`}>
              Atajos: {calendarShortcutsActive ? 'Activos' : 'Inactivos'}
            </div>
          </div>
        </div>}
        <div ref={calendarSectionRef}>
        <div ref={calendarScrollRef} className="relative h-[calc(100%-2.5rem)] overflow-auto rounded border">
          <table className="border-collapse text-[11px] min-w-max">
            <thead>
              <tr className="bg-muted text-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head1-${META_COLS[gi]}`}
                    className="sticky top-0 z-[60] border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices, effectiveMetaWidths)}px`, minWidth: `${effectiveMetaWidths[gi]}px`, maxWidth: `${effectiveMetaWidths[gi]}px` }}
                  >
                    {gi === 0 ? <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Planta</span> : ''}
                  </th>
                ))}
                {dayCols.map((d, idx) => (
                  <th
                    key={`day-${d.c}`}
                    className={`sticky top-0 z-20 border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none cursor-pointer ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-4 border-amber-500/[0.25] shadow-[inset_0_0_0_1px_rgba(253,224,71,0.4)]' : ''} ${selectedCol === d.c ? 'ring-2 ring-white/80 ring-inset' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-400/60' : ''}`}
                    style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}
                    onClick={() => {
                      setSelectedCol(d.c)
                      selectCalendarDate(d)
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-foreground">{d.dayLabel}</span>
                      {isWeekStart(idx) ? <span className="rounded bg-cat-7-tint/[0.15] px-1 text-[9px] text-cyan-400">{weekNumberLabel(d.dateObj)}</span> : null}
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="bg-muted text-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head2-${META_COLS[gi]}`}
                    className="sticky top-[30px] z-[60] border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none text-muted-foreground text-[10px] uppercase tracking-wide"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices, effectiveMetaWidths)}px`, minWidth: `${effectiveMetaWidths[gi]}px`, maxWidth: `${effectiveMetaWidths[gi]}px` }}
                  >
                    {META_COLS[gi]}
                  </th>
                ))}
                {dayCols.map((d, idx) => (
                  <th
                    key={`date-${d.c}`}
                    className={`sticky top-[30px] z-20 border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none cursor-pointer text-foreground ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-4 border-b-2 border-amber-500/[0.25] font-semibold text-amber-600 shadow-[inset_0_0_0_1px_rgba(253,224,71,0.4)]' : ''} ${selectedCol === d.c ? 'ring-2 ring-white/80 ring-inset' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-400/60' : ''}`}
                    style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}
                    onClick={() => {
                      setSelectedCol(d.c)
                      selectCalendarDate(d)
                    }}
                  >
                    {formatDate(d.dateObj) || d.dateRaw}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {techRows.map((tech, idx) => {
                const isSelectedRow = selectedRow === tech.r
                const metaValues = [tech.turno, tech.area, tech.ceco, tech.cargo, tech.direccion, tech.rut, tech.name]
                const dtk = tech.turno.trim().toUpperCase()
                const dRowBg = dtk === 'A' ? 'bg-cat-7-tint/[0.15]' : dtk === 'B' ? 'bg-amber-500/[0.15]' : dtk === 'C' ? 'bg-cat-6-tint/[0.15]' : idx % 2 === 1 ? 'bg-muted' : ''
                return (
                  <tr key={tech.r} className={`border-b border-border/20 ${dRowBg} ${isSelectedRow ? 'outline outline-2 outline-blue-500 -outline-offset-2' : ''}`}>
                    {visibleMetaIndices.map((gi, vi) => (
                      <td
                        key={`meta-${tech.r}-${gi}`}
                        className="sticky z-[35] border !bg-card bg-opacity-100 px-1 py-1 text-left truncate text-foreground backdrop-blur-none"
                        style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices, effectiveMetaWidths)}px`, minWidth: `${effectiveMetaWidths[gi]}px`, maxWidth: `${effectiveMetaWidths[gi]}px` }}
                        title={metaValues[gi]}
                      >
                        {gi === 0 ? (
                          <span className={`inline-flex min-w-6 justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${turnoBadgeClass(String(metaValues[gi] || ''))}`}>
                            {metaValues[gi] || '-'}
                          </span>
                        ) : metaValues[gi]}
                      </td>
                    ))}
                    {dayCols.map((d, idx) => {
                      const value = tech.shifts[d.c] || ''
                      const isSelectedCell = selectedRow === tech.r && selectedCol === d.c
                      const cellStyle = shiftCellStyle(value)
                      return (
                        <td
                          key={`shift-${tech.r}-${d.c}`}
                          className={`border px-1 py-1 text-center cursor-pointer ${cellStyle.className} ${isSelectedCell ? 'ring-2 ring-primary ring-inset shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]' : ''} ${selectedCol === d.c ? 'bg-muted-foreground/[0.10]' : ''} ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-4 border-amber-500/[0.25]' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-300/80' : ''}`}
                          style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px`, ...cellStyle.style }}
                          title={value}
                          onClick={() => {
                            setSelectedRow(tech.r)
                            setSelectedCol(d.c)
                            selectCalendarDate(d)
                          }}
                        >
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </div>
      </section>}

    </div>
  )
}
