import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../services/firebase'
import { setDoc as trackedSetDoc } from '../services/firestoreTracked'
import { getCurrentUser } from '../services/auth'

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
  toleranceHours: number
  useFixedDaily: boolean
  dayReductionHours: number
  vacationBusinessDaysOnly: boolean
  holidayAsNonWorking: boolean
  holidayBusinessDaysOnly: boolean
}

const WEEKDAY_HEADER = new Set(['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'])
const META_COLS = ['TURNO', 'Área', 'CeCo', 'Cargo', 'DIRECCIÓN', 'RUT', 'Personal']
const META_COL_WIDTHS = [56, 80, 100, 108, 98, 100, 220]
const HIDEABLE_COLS = new Set([2, 3, 4, 5]) // CeCo, Cargo, DIRECCIÓN, RUT
const CALENDAR_FIRESTORE_PATH = ['calendario_mantencion_state', 'current'] as const

type TabId = 'edicion' | 'plantillas' | 'horas' | 'tecnicos' | 'control'
type SyncState = 'idle' | 'saving' | 'synced' | 'error'
type ControlSortKey = 'name' | 'deltaWeek' | 'deltaMonth' | 'weekHours' | 'monthHours'
type ExportScope = 'all' | 'week' | 'month' | 'weeks' | 'months'

type ShiftStyleSamples = {
  dia?: number
  tarde?: number
  noche?: number
  libre?: number
  vacaciones?: number
  feriado?: number
  diaReducido?: number
  tardeReducido?: number
  nocheReducido?: number
}

type PersistedCalendarState = {
  version: number
  originalFilename?: string
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
const DAY_COL_WIDTH = 88
const HOURS_CONFIG_KEY = 'calendario_mantencion_hours_config_v1'
const SHIFT_CONFIG_KEY = 'calendario_mantencion_shift_config_v1'
const CALENDAR_LOCAL_CACHE_KEY = 'calendario_mantencion_state_local_v1'
const CONTROL_CLASS = 'h-8 rounded border border-border bg-background px-2 text-xs text-foreground [color-scheme:dark]'

function defaultHoursConfig(): HoursConfig {
  return {
    workHours: 8,
    breakHours: 0.5,
    expectedWeek: 45,
    expectedMonth: 180,
    toleranceHours: 0.5,
    useFixedDaily: true,
    dayReductionHours: 1,
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
    if (/^\d+$/.test(value)) return excelSerialToDate(Number(value))
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d
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

function getPlanningMonthStart(): Date {
  const today = getChileToday()
  return new Date(today.getFullYear(), 2, 1)
}

function isInPlanningMonth(date: Date): boolean {
  const start = getPlanningMonthStart()
  return date.getFullYear() === start.getFullYear() && date.getMonth() === start.getMonth()
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

function deltaClass(delta: number): string {
  if (Math.abs(delta) < 0.001) return 'text-muted-foreground font-semibold'
  return delta > 0 ? 'text-emerald-700 dark:text-emerald-300 font-semibold' : 'text-red-700 dark:text-red-300 font-semibold'
}

function formatDelta(delta: number): string {
  if (Math.abs(delta) < 0.001) return '0.0'
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`
}

function metaLeftFiltered(index: number, visibleIndices: number[]): number {
  let total = 0
  for (let i = 0; i < index; i++) {
    const colIndex = visibleIndices[i]
    if (colIndex === undefined) break
    total += META_COL_WIDTHS[colIndex] ?? 90
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
  const [selectedShift, setSelectedShift] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [exportScope, setExportScope] = useState<ExportScope>('month')
  const [exportSpanCount, setExportSpanCount] = useState(2)
  const [showAllCols, setShowAllCols] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('edicion')
  const [newTechName, setNewTechName] = useState('')
  const [newTechRut, setNewTechRut] = useState('')
  const [newTechGroup, setNewTechGroup] = useState('A')
  const [newTechArea, setNewTechArea] = useState('Mantención')
  const [vacationTechRow, setVacationTechRow] = useState<number | null>(null)
  const [vacationStart, setVacationStart] = useState('')
  const [vacationEnd, setVacationEnd] = useState('')
  const [techDrafts, setTechDrafts] = useState<Record<number, { turno: string; area: string }>>({})
  const [controlSortKey, setControlSortKey] = useState<ControlSortKey>('deltaWeek')
  const [controlSortDir, setControlSortDir] = useState<'asc' | 'desc'>('asc')

  const [hoursConfig, setHoursConfig] = useState<HoursConfig>(() => {
    const stored = safeStorageGet<HoursConfig>(HOURS_CONFIG_KEY, defaultHoursConfig())
    return {
      workHours: toNumberOr(stored.workHours, 8),
      breakHours: toNumberOr(stored.breakHours, 0.5),
      expectedWeek: toNumberOr(stored.expectedWeek, 45),
      expectedMonth: toNumberOr(stored.expectedMonth, 180),
      toleranceHours: toNumberOr(stored.toleranceHours, 0.5),
      useFixedDaily: stored.useFixedDaily !== false,
      dayReductionHours: toNumberOr(stored.dayReductionHours, 1),
      vacationBusinessDaysOnly: stored.vacationBusinessDaysOnly !== false,
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
  const shiftStyleSamplesRef = useRef<ShiftStyleSamples>({})
  const [calendarShortcutsActive, setCalendarShortcutsActive] = useState(false)

  const shortcuts = useMemo(() => {
    const dia = `${shiftConfig.diaInicio} - ${shiftConfig.diaFin}`
    const tarde = `${shiftConfig.tardeInicio} - ${shiftConfig.tardeFin}`
    const noche = `${shiftConfig.nocheInicio} - ${shiftConfig.nocheFin}`
    const libre = shiftConfig.libreLabel || 'LIBRE'
    const reductionMinutes = Math.max(0, Math.round(toNumberOr(hoursConfig.dayReductionHours, 1) * 60))
    const normalDuration = rangeDurationMinutes(shiftConfig.diaInicio, shiftConfig.diaFin)
    const dayStartMinutes = hhmmToMinutes(shiftConfig.diaInicio)
    let diaReducido = dia
    if (normalDuration !== null && dayStartMinutes !== null && reductionMinutes > 0 && normalDuration > reductionMinutes) {
      const reducedEnd = minutesToHHMM(dayStartMinutes + (normalDuration - reductionMinutes))
      diaReducido = `${shiftConfig.diaInicio} - ${reducedEnd}`
    }

    const normalNightDuration = rangeDurationMinutes(shiftConfig.nocheInicio, shiftConfig.nocheFin)
    const nightStartMinutes = hhmmToMinutes(shiftConfig.nocheInicio)
    let nocheReducido = noche
    if (normalNightDuration !== null && nightStartMinutes !== null && reductionMinutes > 0 && normalNightDuration > reductionMinutes) {
      const reducedNightEnd = minutesToHHMM(nightStartMinutes + (normalNightDuration - reductionMinutes))
      nocheReducido = `${shiftConfig.nocheInicio} - ${reducedNightEnd}`
    }

    const normalAfternoonDuration = rangeDurationMinutes(shiftConfig.tardeInicio, shiftConfig.tardeFin)
    const afternoonStartMinutes = hhmmToMinutes(shiftConfig.tardeInicio)
    let tardeReducido = tarde
    if (normalAfternoonDuration !== null && afternoonStartMinutes !== null && reductionMinutes > 0 && normalAfternoonDuration > reductionMinutes) {
      const reducedAfternoonEnd = minutesToHHMM(afternoonStartMinutes + (normalAfternoonDuration - reductionMinutes))
      tardeReducido = `${shiftConfig.tardeInicio} - ${reducedAfternoonEnd}`
    }

    return { dia, tarde, noche, libre, diaReducido, tardeReducido, nocheReducido }
  }, [hoursConfig.dayReductionHours, shiftConfig])

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
    const today = getChileToday()
    return dayCols.find((d) => {
      if (!d.dateObj) return false
      return d.dateObj.getFullYear() === today.getFullYear()
        && d.dateObj.getMonth() === today.getMonth()
        && d.dateObj.getDate() === today.getDate()
    })
  }, [dayCols])

  const techGroups = useMemo(() => {
    const groups = Array.from(new Set(techRows.map((t) => t.turno).filter(Boolean)))
    if (groups.length === 0) return ['A', 'B', 'C']
    return groups
  }, [techRows])
  const baseGroupOptions = useMemo(() => Array.from(new Set([...techGroups, 'A', 'B', 'C'])), [techGroups])

  useEffect(() => {
    if (!techGroups.includes(newTechGroup)) {
      setNewTechGroup(techGroups[0] || 'A')
    }
  }, [newTechGroup, techGroups])

  useEffect(() => {
    setTechDrafts((prev) => {
      const next: Record<number, { turno: string; area: string }> = {}
      techRows.forEach((tech) => {
        const existing = prev[tech.r]
        next[tech.r] = {
          turno: existing?.turno ?? tech.turno,
          area: existing?.area ?? tech.area,
        }
      })
      return next
    })
  }, [techRows])

  loadWorkbookRef.current = loadWorkbook
  applyShiftRef.current = applyShift

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
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
      if (!calendarShortcutsActive) return
      if (!selectedRow || selectedCol === null) return
      const target = event.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return

      if (event.ctrlKey || event.altKey || event.metaKey) return

      // Arrow key navigation
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        event.preventDefault()
        if (event.key === 'ArrowRight') {
          const curIdx = dayCols.findIndex((d) => d.c === selectedCol)
          const nextDayCol = curIdx >= 0 ? dayCols[curIdx + 1] : undefined
          if (nextDayCol) {
            setSelectedCol(nextDayCol.c)
            const tech = techRows.find((t) => t.r === selectedRow)
            if (tech) setSelectedShift(tech.shifts[nextDayCol.c] || '')
          }
        } else if (event.key === 'ArrowLeft') {
          const curIdx = dayCols.findIndex((d) => d.c === selectedCol)
          const prevDayCol = curIdx > 0 ? dayCols[curIdx - 1] : undefined
          if (prevDayCol) {
            setSelectedCol(prevDayCol.c)
            const tech = techRows.find((t) => t.r === selectedRow)
            if (tech) setSelectedShift(tech.shifts[prevDayCol.c] || '')
          }
        } else if (event.key === 'ArrowDown') {
          const curRowIdx = techRows.findIndex((t) => t.r === selectedRow)
          const nextRow = curRowIdx >= 0 ? techRows[curRowIdx + 1] : undefined
          if (nextRow) {
            setSelectedRow(nextRow.r)
            setSelectedShift(nextRow.shifts[selectedCol] || '')
          }
        } else if (event.key === 'ArrowUp') {
          const curRowIdx = techRows.findIndex((t) => t.r === selectedRow)
          const prevRow = curRowIdx > 0 ? techRows[curRowIdx - 1] : undefined
          if (prevRow) {
            setSelectedRow(prevRow.r)
            setSelectedShift(prevRow.shifts[selectedCol] || '')
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
    const cols = colsNormalized.filter((col) => {
      if (!col.dateObj) return false
      return isInPlanningMonth(col.dateObj)
    })
    const finalCols = cols.length > 0 ? cols : colsNormalized
    const techs = detectTechnicians(horarioSheet, ref, finalCols)
    const catalog = readTurnosCatalog(workbook)

    setDayCols(finalCols)
    setTechRows(techs)
    setTurnosCatalog(Array.from(new Set([...catalog, 'LIBRE'])))
    inferShiftStyleSamples(horarioSheet, techs, finalCols)

    const firstTech = techs[0]
    const firstDay = finalCols[0]
    if (firstTech) setSelectedRow(firstTech.r)
    if (firstDay) setSelectedCol(firstDay.c)
    if (firstTech && firstDay) setSelectedShift(firstTech.shifts[firstDay.c] || '')

    inferShiftConfig(catalog, techs)
    setStatus(`Plantilla cargada: ${filename}. Técnicos: ${techs.length}. Días: ${cols.length}. Fechas alineadas a calendario actual.`)
    void hydrateCalendarFromFirebase(horarioSheet, filename)
  }

  async function hydrateCalendarFromFirebase(sheet: XLSX.WorkSheet, filename: string): Promise<void> {
    const applyPersistedState = (data: PersistedCalendarState): boolean => {
      const persistedRows = Array.isArray(data.techRows) ? data.techRows : []

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
      console.warn('No se pudo hidratar calendario desde Firebase', error)
    } finally {
      isHydratingRemoteRef.current = false
      hasLoadedCalendarRef.current = true
    }
  }

  const syncCalendarToFirebase = useCallback(async (reason: string): Promise<void> => {
    try {
      setSyncState('saving')
      setSyncErrorText('')
      const currentUser = getCurrentUser()
      const localPayload: PersistedCalendarState = {
        version: 1,
        originalFilename,
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
      setLastSyncAt(new Date())
      setSyncState('synced')
    } catch (error) {
      console.warn('No se pudo sincronizar calendario en Firebase', error)
      setSyncState('error')
      setSyncErrorText(error instanceof Error ? error.message : 'Error desconocido')
      setStatus('Cambios guardados en este navegador, pero sin permisos para sincronizar en Firebase.')
    }
  }, [hoursConfig, originalFilename, shiftConfig, techRows])

  useEffect(() => {
    if (!hasLoadedCalendarRef.current || isHydratingRemoteRef.current) return
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    setSyncState('saving')
    syncTimerRef.current = setTimeout(() => {
      void syncCalendarToFirebase('state-change')
    }, 200)
  }, [dayCols, syncCalendarToFirebase])

  const syncIndicator = useMemo(() => {
    if (syncState === 'saving') return { label: 'Guardando…', className: 'bg-amber-500/15 text-amber-300 border-amber-500/40' }
    if (syncState === 'synced') return { label: `Sincronizado${lastSyncAt ? ` ${lastSyncAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}`, className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' }
    if (syncState === 'error') return { label: `Error de sync${syncErrorText ? `: ${syncErrorText}` : ''}`, className: 'bg-red-500/15 text-red-300 border-red-500/40' }
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
      const dayLabel = String(getCellValue(sheet, 1, c) || '').toLowerCase()
      const dateRaw = getCellValue(sheet, 2, c)
      const dateObj = parseDateFromExcelCell(dateRaw)
      if (WEEKDAY_HEADER.has(dayLabel) || !!dateObj) {
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
    const styleId = c >= 7 ? styleIdForShift(value) : undefined
    if (!current) sheet[addr] = styleId !== undefined ? { t: 's', v: value, s: styleId } : { t: 's', v: value }
    else {
      current.t = 's'
      current.v = value
      if (styleId !== undefined) current.s = styleId
      delete current.w
    }
  }

  function applyShift(r: number, c: number, shift: string) {
    const normalized = shift.trim()
    if (!normalized) return
    setTechRows((prev) => prev.map((t) => (t.r !== r ? t : { ...t, shifts: { ...t.shifts, [c]: normalized } })))
    setCellValue(r, c, normalized)
    setSelectedRow(r)
    setSelectedCol(c)
    setSelectedShift(normalized)
    setStatus(`Turno actualizado (${dayLabelByCol(c)}): ${normalized}`)
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

  function detectShiftStyleKey(value: string): keyof ShiftStyleSamples | null {
    const text = value.trim().toLowerCase()
    if (!text) return null
    if (text.includes('feriado')) return 'feriado'
    if (text.includes('vacaciones')) return 'vacaciones'
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
        const styleId = typeof cell?.s === 'number' ? cell.s : undefined
        if (styleId !== undefined) samples[key] = styleId
      }
    }
    shiftStyleSamplesRef.current = samples
  }

  function styleIdForShift(value: string): number | undefined {
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

  function classifyShift(value: string): string {
    const v = value.toLowerCase()
    const reduced = isReducedShift(value)
    if (v.includes('feriado')) return 'bg-fuchsia-100 text-fuchsia-900 dark:bg-fuchsia-900/25 dark:text-fuchsia-200'
    if (!v || v.includes('libre') || v.includes('descanso') || v.includes('vacaciones') || v.includes('licencia')) return 'bg-rose-100 text-rose-900 dark:bg-rose-900/25 dark:text-rose-200'
    const nocheStart = shiftConfig.nocheInicio.toLowerCase()
    const nocheEnd = shiftConfig.nocheFin.toLowerCase()
    if (v.includes(`${nocheStart} - ${nocheEnd}`) || (v.includes(nocheStart) && v.includes(nocheEnd)) || v.includes('00:00 - 08:00')) {
      return reduced
        ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100'
        : 'bg-sky-200/80 text-sky-900 dark:bg-sky-500/35 dark:text-sky-100'
    }
    if (v.includes(shiftConfig.diaInicio.toLowerCase()) || v.includes('08:00') || v.includes('07:00')) {
      return reduced
        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/15 dark:text-emerald-100'
        : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/25 dark:text-emerald-200'
    }
    if (v.includes(shiftConfig.tardeInicio.toLowerCase()) || v.includes('16:00') || v.includes('14:00') || v.includes('13:00')) {
      return reduced
        ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/15 dark:text-amber-100'
        : 'bg-amber-100 text-amber-900 dark:bg-amber-900/25 dark:text-amber-200'
    }
    if (v.includes('00:00')) {
      return reduced
        ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-100'
        : 'bg-sky-200/80 text-sky-900 dark:bg-sky-500/35 dark:text-sky-100'
    }
    return ''
  }

  function isWorkingShift(shiftText: string): boolean {
    const text = shiftText.trim().toLowerCase()
    if (!text) return false
    return !(text.includes('libre') || text.includes('descanso') || text.includes('vacaciones') || text.includes('licencia') || text.includes('feriado'))
  }

  function isVacationShift(shiftText: string): boolean {
    return shiftText.trim().toLowerCase().includes('vacaciones')
  }

  function isHolidayShift(shiftText: string): boolean {
    return shiftText.trim().toLowerCase().includes('feriado')
  }

  function isBusinessDay(date: Date): boolean {
    const day = date.getDay()
    return day !== 0 && day !== 6
  }

  function effectiveDailyHours(): number {
    return Math.max(0, hoursConfig.workHours - hoursConfig.breakHours)
  }

  function workedHoursForShift(shiftText: string): number {
    if (!isWorkingShift(shiftText)) return 0
    const reduction = isReducedShift(shiftText) ? clampMin(toNumberOr(hoursConfig.dayReductionHours, 1), 0) : 0
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
    const reductionMinutes = Math.max(0, Math.round(toNumberOr(hoursConfig.dayReductionHours, 1) * 60))
    if (shiftDuration === null || reductionMinutes <= 0) return false

    const normalDayDuration = rangeDurationMinutes(shiftConfig.diaInicio, shiftConfig.diaFin)
    const normalAfternoonDuration = rangeDurationMinutes(shiftConfig.tardeInicio, shiftConfig.tardeFin)
    const normalNightDuration = rangeDurationMinutes(shiftConfig.nocheInicio, shiftConfig.nocheFin)

    const matchesReducedRange = (start: string, normalDuration: number | null): boolean => {
      if (normalDuration === null || normalDuration <= reductionMinutes) return false
      return shiftStart === start && shiftDuration === (normalDuration - reductionMinutes)
    }

    return matchesReducedRange(shiftConfig.diaInicio, normalDayDuration)
      || matchesReducedRange(shiftConfig.tardeInicio, normalAfternoonDuration)
      || matchesReducedRange(shiftConfig.nocheInicio, normalNightDuration)
  }

  const visibleMetaIndices = useMemo(() => {
    return META_COLS.map((_, i) => i).filter((i) => showAllCols || !HIDEABLE_COLS.has(i))
  }, [showAllCols])

  const weekDays = dayCols.filter((d) => d.dateObj && isoWeekKey(d.dateObj) === selectedWeek)
  const monthDays = dayCols.filter((d) => d.dateObj && monthKey(d.dateObj) === selectedMonth)
  const effectiveDaily = effectiveDailyHours()
  const monthBusinessDays = monthDays.reduce((sum, d) => (d.dateObj && isBusinessDay(d.dateObj) ? sum + 1 : sum), 0)
  const expectedMonthAutoBase = hoursConfig.expectedWeek * (monthBusinessDays / 5)

  function isWeekStart(index: number): boolean {
    if (index === 0) return true
    const curr = dayCols[index]?.dateObj ?? null
    const prev = dayCols[index - 1]?.dateObj ?? null
    if (!curr || !prev) return false
    return isoWeekKey(curr) !== isoWeekKey(prev)
  }

  const hoursRows = techRows.map((t) => {
    const weekHours = weekDays.reduce((sum, d) => sum + workedHoursForShift(t.shifts[d.c] || ''), 0)
    const monthHours = monthDays.reduce((sum, d) => sum + workedHoursForShift(t.shifts[d.c] || ''), 0)
    const weekWorkedDays = weekDays.reduce((sum, d) => sum + (isWorkingShift(t.shifts[d.c] || '') ? 1 : 0), 0)
    const monthWorkedDays = monthDays.reduce((sum, d) => sum + (isWorkingShift(t.shifts[d.c] || '') ? 1 : 0), 0)
    const weekVacationDays = weekDays.reduce((sum, d) => {
      if (!d.dateObj || !isVacationShift(t.shifts[d.c] || '')) return sum
      if (hoursConfig.vacationBusinessDaysOnly && !isBusinessDay(d.dateObj)) return sum
      return sum + 1
    }, 0)
    const monthVacationDays = monthDays.reduce((sum, d) => {
      if (!d.dateObj || !isVacationShift(t.shifts[d.c] || '')) return sum
      if (hoursConfig.vacationBusinessDaysOnly && !isBusinessDay(d.dateObj)) return sum
      return sum + 1
    }, 0)
    const totalVacationDays = dayCols.reduce((sum, d) => {
      if (!d.dateObj || !isVacationShift(t.shifts[d.c] || '')) return sum
      if (hoursConfig.vacationBusinessDaysOnly && !isBusinessDay(d.dateObj)) return sum
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

    const weekExpectedAdjusted = Math.max(
      0,
      hoursConfig.expectedWeek - (
        (weekVacationDays + (hoursConfig.holidayAsNonWorking ? weekHolidayDays : 0))
        * effectiveDaily
      )
    )
    const monthExpectedAdjusted = Math.max(
      0,
      expectedMonthAutoBase - (
        (monthVacationDays + (hoursConfig.holidayAsNonWorking ? monthHolidayDays : 0))
        * effectiveDaily
      )
    )

    const weekFreeDays = Math.max(0, weekDays.length - weekWorkedDays)
    const monthFreeDays = Math.max(0, monthDays.length - monthWorkedDays)
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
      weekExpected: weekExpectedAdjusted,
      monthExpected: monthExpectedAdjusted,
      weekFreeHours,
      monthFreeHours,
      weekBreakHours,
      monthBreakHours,
      weekVacationDays,
      monthVacationDays,
      weekHolidayDays,
      monthHolidayDays,
      totalVacationDays,
      deltaWeek,
      deltaMonth,
    }
  })

  const controlSummary = useMemo(() => {
    const total = hoursRows.length
    const weekOk = hoursRows.filter((row) => row.deltaWeek >= -hoursConfig.toleranceHours).length
    const monthOk = hoursRows.filter((row) => row.deltaMonth >= -hoursConfig.toleranceHours).length
    const risk = hoursRows.filter((row) => row.deltaWeek < -hoursConfig.toleranceHours || row.deltaMonth < -hoursConfig.toleranceHours).length
    return {
      total,
      weekOk,
      monthOk,
      risk,
    }
  }, [hoursConfig.toleranceHours, hoursRows])

  const sortedHoursRows = useMemo(() => {
    const rows = [...hoursRows]
    rows.sort((a, b) => {
      let cmp = 0
      if (controlSortKey === 'name') cmp = a.tech.name.localeCompare(b.tech.name)
      if (controlSortKey === 'deltaWeek') cmp = a.deltaWeek - b.deltaWeek
      if (controlSortKey === 'deltaMonth') cmp = a.deltaMonth - b.deltaMonth
      if (controlSortKey === 'weekHours') cmp = a.weekHours - b.weekHours
      if (controlSortKey === 'monthHours') cmp = a.monthHours - b.monthHours
      return controlSortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [controlSortDir, controlSortKey, hoursRows])

  function handleAssignSelected() {
    if (!selectedRow || selectedCol === null || !selectedShift) return
    applyShift(selectedRow, selectedCol, selectedShift)
  }

  function handleHoursConfigApply() {
    const next = {
      ...hoursConfig,
      workHours: clampMin(toNumberOr(hoursConfig.workHours, 8), 0),
      breakHours: clampMin(toNumberOr(hoursConfig.breakHours, 0.5), 0),
      expectedWeek: clampMin(toNumberOr(hoursConfig.expectedWeek, 45), 0),
      expectedMonth: clampMin(toNumberOr(expectedMonthAutoBase, 180), 0),
      toleranceHours: clampMin(toNumberOr(hoursConfig.toleranceHours, 0.5), 0),
      dayReductionHours: clampMin(toNumberOr(hoursConfig.dayReductionHours, 1), 0),
      vacationBusinessDaysOnly: hoursConfig.vacationBusinessDaysOnly !== false,
      holidayAsNonWorking: hoursConfig.holidayAsNonWorking !== false,
      holidayBusinessDaysOnly: hoursConfig.holidayBusinessDaysOnly !== false,
    }
    setHoursConfig(next)
    safeStorageSet(HOURS_CONFIG_KEY, next)
    setStatus(`Parámetros aplicados. Horas efectivas por día: ${effectiveDailyHours().toFixed(2)}h. Meta mensual auto: ${expectedMonthAutoBase.toFixed(1)}h`)
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

    setVacationTechRow(nextRow)
    setSelectedRow(nextRow)
    if (todayDayCol) setSelectedCol(todayDayCol.c)
    setNewTechName('')
    setNewTechRut('')
    setStatus(`Técnico agregado: ${name} (Grupo ${newTech.turno}).`) 
  }

  function handleApplyVacation() {
    if (!vacationTechRow || !vacationStart || !vacationEnd) {
      setStatus('Selecciona técnico y rango de vacaciones.')
      return
    }

    const start = new Date(`${vacationStart}T00:00:00`)
    const end = new Date(`${vacationEnd}T00:00:00`)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      setStatus('Rango de vacaciones inválido.')
      return
    }

    const vacationLabel = 'VACACIONES'
    let updated = 0
    let vacationBusinessDays = 0
    setTechRows((prev) => prev.map((t) => {
      if (t.r !== vacationTechRow) return t
      const nextShifts = { ...t.shifts }
      dayCols.forEach((d) => {
        if (!d.dateObj) return
        const current = new Date(d.dateObj.getFullYear(), d.dateObj.getMonth(), d.dateObj.getDate())
        if (current >= start && current <= end) {
          nextShifts[d.c] = vacationLabel
          setCellValue(t.r, d.c, vacationLabel)
          updated += 1
          if (!hoursConfig.vacationBusinessDaysOnly || isBusinessDay(current)) {
            vacationBusinessDays += 1
          }
        }
      })
      return { ...t, shifts: nextShifts }
    }))

    if (hoursConfig.vacationBusinessDaysOnly) {
      setStatus(`Vacaciones aplicadas: ${updated} día(s) marcados, ${vacationBusinessDays} día(s) hábiles contabilizados.`)
    } else {
      setStatus(`Vacaciones aplicadas a ${updated} día(s).`)
    }
  }

  function handleApplyHolidayToDay() {
    if (selectedCol === null) {
      setStatus('Selecciona un día para marcar feriado.')
      return
    }
    const day = dayCols.find((d) => d.c === selectedCol)
    if (!day) {
      setStatus('Día inválido para feriado.')
      return
    }

    const holidayLabel = 'FERIADO'
    setTechRows((prev) => prev.map((tech) => {
      const nextShifts = { ...tech.shifts, [selectedCol]: holidayLabel }
      setCellValue(tech.r, selectedCol, holidayLabel)
      return { ...tech, shifts: nextShifts }
    }))
    setSelectedShift(holidayLabel)
    setStatus(`Feriado aplicado para ${day.dayLabel} ${formatDate(day.dateObj)} en todos los técnicos.`)
  }

  function handleUpdateTechDraft(row: number, nextGroup: string, nextArea: string) {
    setTechDrafts((prev) => ({
      ...prev,
      [row]: {
        turno: nextGroup,
        area: nextArea,
      },
    }))
  }

  function hasTechDraftChanges(): boolean {
    return techRows.some((tech) => {
      const draft = techDrafts[tech.r]
      if (!draft) return false
      return draft.turno !== tech.turno || draft.area !== tech.area
    })
  }

  function handleDiscardTechDrafts() {
    const reset: Record<number, { turno: string; area: string }> = {}
    techRows.forEach((tech) => {
      reset[tech.r] = { turno: tech.turno, area: tech.area }
    })
    setTechDrafts(reset)
    setStatus('Cambios de técnicos descartados.')
  }

  function handleSaveTechDrafts() {
    const updates: Array<{ row: number; turno: string; area: string }> = []
    const updatedRows = techRows.map((tech) => {
      const draft = techDrafts[tech.r]
      if (!draft) return tech

      const nextTurno = (draft.turno || tech.turno).trim().toUpperCase()
      const nextArea = (draft.area || tech.area).trim()
      if (nextTurno === tech.turno && nextArea === tech.area) return tech

      updates.push({ row: tech.r, turno: nextTurno, area: nextArea })
      return {
        ...tech,
        turno: nextTurno,
        area: nextArea,
      }
    })

    if (updates.length === 0) {
      setStatus('No hay cambios de técnicos para guardar.')
      return
    }

    updates.forEach((u) => {
      setCellValue(u.row, 0, u.turno)
      setCellValue(u.row, 1, u.area)
    })

    setTechRows(updatedRows)
    setStatus(`Cambios de técnicos guardados: ${updates.length}.`)
  }

  function scrollToToday() {
    const container = calendarScrollRef.current
    const todayCol = todayDayCol
    if (!container || !todayCol) return

    const dayIndex = dayCols.findIndex((d) => d.c === todayCol.c)
    if (dayIndex < 0) return

    const metaWidth = visibleMetaIndices.reduce((sum, gi) => sum + (META_COL_WIDTHS[gi] || 90), 0)
    const colStart = metaWidth + (dayIndex * DAY_COL_WIDTH)
    const targetLeft = Math.max(0, colStart - ((container.clientWidth - DAY_COL_WIDTH) / 2))

    container.scrollTo({ left: targetLeft, behavior: 'smooth' })
    setSelectedCol(todayCol.c)
    setStatus(`Vista centrada en hoy: ${todayCol.dayLabel} ${formatDate(todayCol.dateObj)}`)
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
      <section className="sticky top-0 z-20 rounded-lg border bg-card p-2">
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
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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
              <label className="text-xs text-muted-foreground">Técnico</label>
              <select
                className={CONTROL_CLASS}
                value={selectedRow ?? ''}
                onChange={(e) => {
                  const row = Number(e.target.value)
                  setSelectedRow(row)
                  if (selectedCol !== null) {
                    const tech = techRows.find((t) => t.r === row)
                    if (tech) setSelectedShift(tech.shifts[selectedCol] || '')
                  }
                }}
              >
                {techRows.map((t) => (
                  <option key={t.r} value={t.r}>{t.name}</option>
                ))}
              </select>
              <label className="text-xs text-muted-foreground">Día</label>
              <select
                className={CONTROL_CLASS}
                value={selectedCol ?? ''}
                onChange={(e) => {
                  const col = Number(e.target.value)
                  setSelectedCol(col)
                  if (selectedRow) {
                    const tech = techRows.find((t) => t.r === selectedRow)
                    if (tech) setSelectedShift(tech.shifts[col] || '')
                  }
                }}
              >
                {dayCols.map((d) => (
                  <option key={d.c} value={d.c}>{`${d.dayLabel} ${formatDate(d.dateObj)}`.trim()}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Turno</label>
              <select className={CONTROL_CLASS} value={selectedShift} onChange={(e) => setSelectedShift(e.target.value)}>
                {Array.from(new Set([...turnosCatalog, shortcuts.dia, shortcuts.tarde, shortcuts.noche, shortcuts.libre, 'VACACIONES', 'FERIADO'])).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-1">
                <button className="h-8 rounded bg-primary text-primary-foreground text-xs" onClick={handleAssignSelected}>Asignar</button>
                <button className="h-8 rounded border text-xs" onClick={exportWorkbook}>Exportar</button>
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
              <div className="grid grid-cols-5 gap-1 text-[11px]">
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.dia)}>D</button>
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.tarde)}>T</button>
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.noche)}>N</button>
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.libre)}>L</button>
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, 'VACACIONES')}>V</button>
              </div>
              <button className="h-7 rounded border text-[11px]" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, 'FERIADO')}>F (celda)</button>
              <button className="h-7 rounded border text-[11px]" onClick={handleApplyHolidayToDay}>Marcar feriado (día)</button>
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
            <label className="text-muted-foreground self-center">Jornada (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.workHours} onChange={(e) => setHoursConfig((p) => ({ ...p, workHours: toNumberOr(e.target.value, p.workHours) }))} />
            <label className="text-muted-foreground self-center">Colación (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.breakHours} onChange={(e) => setHoursConfig((p) => ({ ...p, breakHours: toNumberOr(e.target.value, p.breakHours) }))} />
            <label className="text-muted-foreground self-center">Esperadas semana</label>
            <input className={CONTROL_CLASS} type="number" step="0.5" value={hoursConfig.expectedWeek} onChange={(e) => setHoursConfig((p) => ({ ...p, expectedWeek: toNumberOr(e.target.value, p.expectedWeek) }))} />
            <label className="text-muted-foreground self-center">Esperadas mes (auto)</label>
            <div className={CONTROL_CLASS + ' flex items-center justify-between'}>
              <span className="font-medium tabular-nums">{expectedMonthAutoBase.toFixed(1)} h</span>
              <span className="text-[10px] text-muted-foreground">{monthBusinessDays} días hábiles</span>
            </div>
            <label className="text-muted-foreground self-center">Tolerancia (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.toleranceHours} onChange={(e) => setHoursConfig((p) => ({ ...p, toleranceHours: toNumberOr(e.target.value, p.toleranceHours) }))} />
            <label className="text-muted-foreground self-center">Reducción turno día (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" min="0" value={hoursConfig.dayReductionHours} onChange={(e) => setHoursConfig((p) => ({ ...p, dayReductionHours: toNumberOr(e.target.value, p.dayReductionHours) }))} />
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.useFixedDaily} onChange={(e) => setHoursConfig((p) => ({ ...p, useFixedDaily: e.target.checked }))} />
              Horas fijas por día trabajado
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.vacationBusinessDaysOnly} onChange={(e) => setHoursConfig((p) => ({ ...p, vacationBusinessDaysOnly: e.target.checked }))} />
              Vacaciones contabilizan solo días hábiles
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.holidayAsNonWorking} onChange={(e) => setHoursConfig((p) => ({ ...p, holidayAsNonWorking: e.target.checked }))} />
              Feriados como no hábil en métricas
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.holidayBusinessDaysOnly} onChange={(e) => setHoursConfig((p) => ({ ...p, holidayBusinessDaysOnly: e.target.checked }))} />
              Feriados descuentan solo días hábiles
            </label>
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

            <div className="flex justify-end">
              <button className="h-8 rounded bg-primary px-3 text-xs text-primary-foreground" onClick={handleAddTechnician}>Agregar técnico</button>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                className="h-8 rounded border px-3 text-xs disabled:opacity-50"
                onClick={handleDiscardTechDrafts}
                disabled={!hasTechDraftChanges()}
              >
                Descartar cambios
              </button>
              <button
                className="h-8 rounded bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50"
                onClick={handleSaveTechDrafts}
                disabled={!hasTechDraftChanges()}
              >
                Guardar cambios masivos
              </button>
            </div>

            <div className="rounded border overflow-auto">
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
                    const draft = techDrafts[tech.r] ?? { turno: tech.turno, area: tech.area }
                    return (
                    <tr key={tech.r} className="border-t border-border hover:bg-muted/30">
                      <td className="px-2 py-1">{tech.name}</td>
                      <td className="px-2 py-1">{tech.rut || '-'}</td>
                      <td className="px-2 py-1">
                        <select
                          className={CONTROL_CLASS + ' h-7 text-[11px]'}
                          value={draft.turno || ''}
                          onChange={(e) => handleUpdateTechDraft(tech.r, e.target.value, draft.area)}
                        >
                          {Array.from(new Set([...baseGroupOptions, tech.turno].filter(Boolean))).map((group) => (
                            <option key={group} value={group}>{group}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          className={CONTROL_CLASS + ' h-7 text-[11px]'}
                          value={draft.area || ''}
                          onChange={(e) => handleUpdateTechDraft(tech.r, draft.turno, e.target.value)}
                        />
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs rounded border p-2">
              <div className="grid gap-1 md:col-span-2">
                <label className="text-muted-foreground">Técnico</label>
                <select className={CONTROL_CLASS} value={vacationTechRow ?? ''} onChange={(e) => setVacationTechRow(Number(e.target.value) || null)}>
                  {techRows.map((tech) => <option key={tech.r} value={tech.r}>{tech.name}</option>)}
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-muted-foreground">Vacaciones desde</label>
                <input className={CONTROL_CLASS} type="date" value={vacationStart} onChange={(e) => setVacationStart(e.target.value)} />
              </div>
              <div className="grid gap-1">
                <label className="text-muted-foreground">Vacaciones hasta</label>
                <input className={CONTROL_CLASS} type="date" value={vacationEnd} onChange={(e) => setVacationEnd(e.target.value)} />
              </div>
              <div className="md:col-span-4 flex justify-end">
                <button className="h-8 rounded border px-3 text-xs" onClick={handleApplyVacation}>Aplicar vacaciones</button>
              </div>
              <div className="md:col-span-4 text-[11px] text-muted-foreground">
                {(() => {
                  const selectedTech = techRows.find((tech) => tech.r === vacationTechRow)
                  if (!selectedTech) return 'Selecciona técnico para ver días de vacaciones.'
                  const totalVac = dayCols.reduce((sum, d) => {
                    if (!d.dateObj) return sum
                    const text = selectedTech.shifts[d.c] || ''
                    if (!isVacationShift(text)) return sum
                    if (hoursConfig.vacationBusinessDaysOnly && !isBusinessDay(d.dateObj)) return sum
                    return sum + 1
                  }, 0)
                  return `Vacaciones acumuladas del técnico en calendario: ${totalVac} día(s)${hoursConfig.vacationBusinessDaysOnly ? ' hábiles' : ''}.`
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Control semanal y mensual ── */}
        {activeTab === 'control' && (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-muted-foreground">Semana</label>
                <select className={CONTROL_CLASS + ' w-full mt-0.5'} value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
                  {Object.entries(weeks).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-muted-foreground">Mes</label>
                <select className={CONTROL_CLASS + ' w-full mt-0.5'} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {Object.entries(months).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded border bg-emerald-500/10 border-emerald-500/30 p-2">
                <div className="text-muted-foreground">Cumplen Semana</div>
                <div className="font-semibold tabular-nums">{controlSummary.weekOk} / {controlSummary.total}</div>
              </div>
              <div className="rounded border bg-emerald-500/10 border-emerald-500/30 p-2">
                <div className="text-muted-foreground">Cumplen Mes</div>
                <div className="font-semibold tabular-nums">{controlSummary.monthOk} / {controlSummary.total}</div>
              </div>
              <div className="rounded border bg-red-500/10 border-red-500/30 p-2">
                <div className="text-muted-foreground">En Riesgo</div>
                <div className="font-semibold tabular-nums">{controlSummary.risk}</div>
              </div>
              <div className="rounded border p-2">
                <div className="text-muted-foreground">Tolerancia activa</div>
                <div className="font-semibold tabular-nums">± {hoursConfig.toleranceHours.toFixed(1)} h</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-muted-foreground">Ordenar por</label>
                <select className={CONTROL_CLASS + ' w-full mt-0.5'} value={controlSortKey} onChange={(e) => setControlSortKey(e.target.value as ControlSortKey)}>
                  <option value="deltaWeek">Δ Semana</option>
                  <option value="deltaMonth">Δ Mes</option>
                  <option value="weekHours">Horas Semana</option>
                  <option value="monthHours">Horas Mes</option>
                  <option value="name">Nombre</option>
                </select>
              </div>
              <div>
                <label className="text-muted-foreground">Dirección</label>
                <select className={CONTROL_CLASS + ' w-full mt-0.5'} value={controlSortDir} onChange={(e) => setControlSortDir(e.target.value as 'asc' | 'desc')}>
                  <option value="asc">Ascendente</option>
                  <option value="desc">Descendente</option>
                </select>
              </div>
            </div>
            <div className="rounded border">
              <table className="w-full text-[11px]">
                <thead className="bg-muted text-foreground sticky top-0 z-10">
                  <tr className="border-b border-border/70 bg-muted/60">
                    <th className="px-2 py-1 text-left" colSpan={2}>Técnico</th>
                    <th className="px-2 py-1 text-center" colSpan={6}>Semana</th>
                    <th className="px-2 py-1 text-center" colSpan={7}>Mes</th>
                  </tr>
                  <tr>
                    <th className="px-2 py-1 text-left w-14">Estado</th>
                    <th className="px-2 py-1 text-left">Técnico</th>
                    <th className="px-2 py-1 text-right w-24">Sem (Real/Esp)</th>
                    <th className="px-2 py-1 w-24">Δ Sem</th>
                    <th className="px-2 py-1 text-right w-16">Libres S</th>
                    <th className="px-2 py-1 text-right w-16">Colación S</th>
                    <th className="px-2 py-1 text-right w-16">Vac S</th>
                    <th className="px-2 py-1 text-right w-16">Fer S</th>
                    <th className="px-2 py-1 text-right w-24">Mes (Real/Esp)</th>
                    <th className="px-2 py-1 w-24">Δ Mes</th>
                    <th className="px-2 py-1 text-right w-16">Libres M</th>
                    <th className="px-2 py-1 text-right w-16">Colación M</th>
                    <th className="px-2 py-1 text-right w-16">Vac M</th>
                    <th className="px-2 py-1 text-right w-16">Fer M</th>
                    <th className="px-2 py-1 text-right w-16">Vac Tot</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedHoursRows.map((row) => {
                    const pctW = pctBar(row.weekHours, row.weekExpected)
                    const pctM = pctBar(row.monthHours, row.monthExpected)
                    const barColorW = row.deltaWeek >= -hoursConfig.toleranceHours ? 'bg-emerald-500' : 'bg-red-500'
                    const barColorM = row.deltaMonth >= -hoursConfig.toleranceHours ? 'bg-emerald-500' : 'bg-red-500'
                    const rowRisk = row.deltaWeek < -hoursConfig.toleranceHours || row.deltaMonth < -hoursConfig.toleranceHours
                    return (
                      <tr key={row.tech.r} className={`border-t border-border transition-colors ${rowRisk ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-muted/40'}`}>
                        <td className="px-2 py-1 text-left">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${rowRisk ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                            {rowRisk ? 'Riesgo' : 'OK'}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-left truncate max-w-[180px]" title={row.tech.name}>{row.tech.name}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.weekHours.toFixed(1)} / {row.weekExpected.toFixed(1)}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${barColorW} transition-all`} style={{ width: `${pctW}%` }} />
                            </div>
                            <span className={`text-[10px] w-8 text-right tabular-nums ${deltaClass(row.deltaWeek)}`}>{formatDelta(row.deltaWeek)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.weekFreeHours.toFixed(1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.weekBreakHours.toFixed(1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.weekVacationDays}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.weekHolidayDays}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.monthHours.toFixed(1)} / {row.monthExpected.toFixed(1)}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${barColorM} transition-all`} style={{ width: `${pctM}%` }} />
                            </div>
                            <span className={`text-[10px] w-8 text-right tabular-nums ${deltaClass(row.deltaMonth)}`}>{formatDelta(row.deltaMonth)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.monthFreeHours.toFixed(1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.monthBreakHours.toFixed(1)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.monthVacationDays}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.monthHolidayDays}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.totalVacationDays}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">{status}</div>
          <div className={`max-w-[55%] truncate rounded border px-2 py-0.5 text-[11px] ${syncIndicator.className}`} title={syncIndicator.label}>
            {syncIndicator.label}
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 rounded-lg border bg-card p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Calendario Mantención</div>
          <div className="flex items-center gap-1">
            <button
              className="h-7 rounded border px-2 text-xs"
              onClick={() => setShowAllCols((p) => !p)}
            >
              {showAllCols ? 'Ocultar CeCo/Cargo/Dirección/RUT' : 'Mostrar CeCo/Cargo/Dirección/RUT'}
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
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Atajos (click en calendario para activar): D/T/N/L/V/F = Día/Tarde/Noche/Libre/Vacaciones/Feriado · Shift+D/T/N = Reducido · Flechas ←↑↓→ = Navegar celdas</div>
          <div className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${calendarShortcutsActive ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' : 'border-border bg-muted text-muted-foreground'}`}>
            Atajos: {calendarShortcutsActive ? 'Activos' : 'Inactivos'}
          </div>
        </div>
        <div ref={calendarSectionRef}>
        <div ref={calendarScrollRef} className="relative h-[calc(100%-2.5rem)] overflow-auto rounded border">
          <table className="border-collapse text-[11px] min-w-max">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head1-${META_COLS[gi]}`}
                    className="sticky top-0 z-[60] border border-primary/70 !bg-primary bg-opacity-100 px-1 py-1 backdrop-blur-none"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices)}px`, minWidth: `${META_COL_WIDTHS[gi]}px`, maxWidth: `${META_COL_WIDTHS[gi]}px` }}
                  >
                    {gi === 0 ? 'PLANTA' : ''}
                  </th>
                ))}
                {dayCols.map((d, idx) => (
                  <th key={`day-${d.c}`} className={`sticky top-0 z-20 border border-primary/70 !bg-primary bg-opacity-100 px-1 py-1 backdrop-blur-none ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-2 border-yellow-300' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-300' : ''}`} style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}>
                    <div className="flex items-center justify-between gap-1">
                      <span>{d.dayLabel}</span>
                      {isWeekStart(idx) ? <span className="rounded bg-cyan-100/20 px-1 text-[9px]">{weekNumberLabel(d.dateObj)}</span> : null}
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="bg-primary text-primary-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head2-${META_COLS[gi]}`}
                    className="sticky top-[30px] z-[60] border border-primary/70 !bg-primary bg-opacity-100 px-1 py-1 backdrop-blur-none"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices)}px`, minWidth: `${META_COL_WIDTHS[gi]}px`, maxWidth: `${META_COL_WIDTHS[gi]}px` }}
                  >
                    {META_COLS[gi]}
                  </th>
                ))}
                {dayCols.map((d, idx) => (
                  <th key={`date-${d.c}`} className={`sticky top-[30px] z-20 border border-primary/70 !bg-primary bg-opacity-100 px-1 py-1 backdrop-blur-none ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-2 border-b-2 border-yellow-300 font-semibold' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-300' : ''}`} style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}>{formatDate(d.dateObj) || d.dateRaw}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {techRows.map((tech) => {
                const isSelectedRow = selectedRow === tech.r
                const metaValues = [tech.turno, tech.area, tech.ceco, tech.cargo, tech.direccion, tech.rut, tech.name]
                return (
                  <tr key={tech.r} className={isSelectedRow ? 'outline outline-2 outline-blue-500 -outline-offset-2' : ''}>
                    {visibleMetaIndices.map((gi, vi) => (
                      <td
                        key={`meta-${tech.r}-${gi}`}
                        className="sticky z-[35] border !bg-card bg-opacity-100 px-1 py-1 text-left truncate text-foreground backdrop-blur-none"
                        style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices)}px`, minWidth: `${META_COL_WIDTHS[gi]}px`, maxWidth: `${META_COL_WIDTHS[gi]}px` }}
                        title={metaValues[gi]}
                      >
                        {metaValues[gi]}
                      </td>
                    ))}
                    {dayCols.map((d, idx) => {
                      const value = tech.shifts[d.c] || ''
                      const isSelectedCell = selectedRow === tech.r && selectedCol === d.c
                      return (
                        <td
                          key={`shift-${tech.r}-${d.c}`}
                          className={`border px-1 py-1 text-center cursor-pointer ${classifyShift(value)} ${isSelectedCell ? 'ring-2 ring-primary ring-inset' : ''} ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-2 border-yellow-300/80' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-300/80' : ''}`}
                          style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}
                          title={value}
                          onClick={() => {
                            setSelectedRow(tech.r)
                            setSelectedCol(d.c)
                            setSelectedShift(value)
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
      </section>
    </div>
  )
}
