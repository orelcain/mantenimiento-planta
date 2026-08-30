import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  ChevronDown,
  CornerUpLeft,
  RotateCcw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../services/firebase'
import { setDoc as trackedSetDoc } from '../services/firestoreTracked'
import { getCurrentUser } from '../services/auth'
import { logger } from '@/lib/logger'
import { semanaDeApertura } from './calendario/semanaDeApertura'
import { RuedaVentanas } from '@/components/calendario/RuedaVentanas'


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
  // Los reducidos son horarios propios, no «el normal menos N horas»: el de tarde
  // de la planta empieza más tarde (19:00), y restarle horas al final nunca lo daba.
  diaRedInicio: string
  diaRedFin: string
  tardeRedInicio: string
  tardeRedFin: string
  nocheRedInicio: string
  nocheRedFin: string
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
  autoLegalWeek: boolean
  workDaysPerWeek: number
  expectedFromPlannedDays: boolean
  toleranceHours: number
  useFixedDaily: boolean
  holidayAsNonWorking: boolean
  holidayBusinessDaysOnly: boolean
}

const WEEKDAY_HEADER = new Set(['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'])
const META_COLS = ['TURNO', 'Área', 'CeCo', 'Cargo', 'DIRECCIÓN', 'RUT', 'Personal']
const META_COL_WIDTHS = [56, 80, 100, 108, 98, 100, 220]
const HIDEABLE_COLS = new Set([2, 3, 4, 5]) // CeCo, Cargo, DIRECCIÓN, RUT
const MOBILE_ALWAYS_HIDDEN = new Set([1]) // Área - ocultar automáticamente en móvil
const CALENDAR_FIRESTORE_PATH = ['calendario_mantencion_state', 'current'] as const

type TabId = 'edicion' | 'plantillas' | 'tecnicos' | 'control'
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
const CONTROL_CLASS = 'h-8 rounded-ctl border border-border bg-background px-2 text-xs text-foreground [color-scheme:dark]'

function defaultHoursConfig(): HoursConfig {
  return {
    workHours: 8,
    breakHours: 0.5,
    expectedWeek: 44,
    autoLegalWeek: true,
    workDaysPerWeek: 6,
    expectedFromPlannedDays: true,
    toleranceHours: 0.5,
    useFixedDaily: true,
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
    diaRedInicio: '08:00',
    diaRedFin: '13:00',
    tardeRedInicio: '19:00',
    tardeRedFin: '00:00',
    nocheRedInicio: '00:00',
    nocheRedFin: '05:00',
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

/**
 * Ventana absoluta de un turno, en minutos desde la medianoche del día de la etiqueta.
 * Un turno que cierra a las 00:00 (o antes de su inicio) termina al día siguiente.
 */
function shiftWindow(shiftText: string): { start: number; end: number } | null {
  const r = parseTimeRange(shiftText)
  if (!r) return null
  const start = hhmmToMinutes(r.start)
  let end = hhmmToMinutes(r.end)
  if (start === null || end === null) return null
  if (end <= start) end += 24 * 60
  return { start, end }
}

/** Horas de descanso entre el fin de un turno y el inicio del siguiente. */
function restHoursBetween(prevDayIndex: number, prevShift: string, nextDayIndex: number, nextShift: string): number | null {
  const a = shiftWindow(prevShift)
  const b = shiftWindow(nextShift)
  if (!a || !b) return null
  const minutes = (nextDayIndex * 24 * 60 + b.start) - (prevDayIndex * 24 * 60 + a.end)
  return minutes / 60
}

/** Semáforo del descanso: <11 h es ilegal, <16 h es el mínimo de un turno seguido. */
function restTone(hours: number): 'malo' | 'justo' | 'ok' {
  if (hours < 11) return 'malo'
  if (hours < 16) return 'justo'
  return 'ok'
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
  /** La plantilla base se descarga sola. Si falla, no hay calendario: ahí y solo
   *  ahí aparece el cargador manual, que es el único rescate. */
  const [plantillaBaseFallo, setPlantillaBaseFallo] = useState(false)
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

  // Agrupado por turno de entrada: es el orden en que se lee la planilla en planta
  // (A, B, C y el fijo al final). El botón del encabezado vuelve al orden del Excel.
  const [sortByTurno, setSortByTurno] = useState(true)
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
    const valid: TabId[] = ['edicion', 'plantillas', 'tecnicos', 'control']
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

  // Vista del módulo. Va aparte de `activeTab` a propósito: las pestañas de
  // arriba solo existen en escritorio, y la rueda tiene que abrirse también en
  // el teléfono, que es donde se mira en planta.
  const [vistaModulo, setVistaModulo] = useState<'turnos' | 'rueda'>(
    () => (searchParams.get('vista') === 'rueda' ? 'rueda' : 'turnos'),
  )
  useEffect(() => {
    const actual = searchParams.get('vista')
    const deseada = vistaModulo === 'rueda' ? 'rueda' : null
    if (actual === deseada) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (deseada) next.set('vista', deseada)
      else next.delete('vista')
      return next
    }, { replace: true })
  }, [vistaModulo, searchParams, setSearchParams])

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
      autoLegalWeek: stored.autoLegalWeek !== false,
      workDaysPerWeek: Math.max(1, Math.min(7, Math.floor(toNumberOr(stored.workDaysPerWeek, 6)))),
      expectedFromPlannedDays: stored.expectedFromPlannedDays !== false,
      toleranceHours: toNumberOr(stored.toleranceHours, 0.5),
      useFixedDaily: stored.useFixedDaily !== false,
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
  /**
   * Lo último que quedó guardado (serializado), para no volver a escribirlo.
   *
   * El efecto de autosave depende de la IDENTIDAD de `dayCols`/`techRows`, no
   * de su contenido: al terminar de hidratar desde Firestore esas referencias
   * cambian y disparaban un `setDoc` completo del estado. Resultado: ABRIR la
   * planilla la "guardaba" —con `reason: 'state-change'` y el uid de quien
   * miraba— aunque nadie hubiera tocado nada. Se comprobó el 24-08: entrar a
   * la página dejó `updatedAt` un minuto después, sin ninguna edición.
   */
  const lastSyncedPayloadRef = useRef<string | null>(null)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncSeqRef = useRef(0)
  const shiftStyleSamplesRef = useRef<ShiftStyleSamples>({})
  const undoStackRef = useRef<CalendarSnapshot[]>([])
  const redoStackRef = useRef<CalendarSnapshot[]>([])
  const undoRef = useRef<() => void>(() => {})
  const redoRef = useRef<() => void>(() => {})
  const [historyVersion, setHistoryVersion] = useState(0)
  const [todayTick, setTodayTick] = useState(() => Date.now())
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768 || (window.innerWidth < 1100 && window.innerHeight < 500))
  const [isLandscape, setIsLandscape] = useState(() => window.innerHeight < 500 && (window.innerWidth < 768 || window.innerWidth < 1100))
  /** Salida de emergencia de la puerta de rotacion: si el tecnico no puede girar, igual entra. */
  const [verEnVertical, setVerEnVertical] = useState(false)

  const shortcuts = useMemo(() => {
    const dia = `${shiftConfig.diaInicio} - ${shiftConfig.diaFin}`
    const tarde = `${shiftConfig.tardeInicio} - ${shiftConfig.tardeFin}`
    const noche = `${shiftConfig.nocheInicio} - ${shiftConfig.nocheFin}`
    const libre = shiftConfig.libreLabel || 'LIBRE'
    const diaReducido = `${shiftConfig.diaRedInicio} - ${shiftConfig.diaRedFin}`
    const tardeReducido = `${shiftConfig.tardeRedInicio} - ${shiftConfig.tardeRedFin}`
    const nocheReducido = `${shiftConfig.nocheRedInicio} - ${shiftConfig.nocheRedFin}`

    return { dia, tarde, noche, libre, diaReducido, tardeReducido, nocheReducido }
  }, [shiftConfig])

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
        const ruta = 'templates/calendario-mantencion-base.xlsx'
        const url = `${import.meta.env.BASE_URL}${ruta}`
        const response = await fetch(url)
        if (!response.ok) throw new Error(`el servidor respondió ${response.status}`)
        const buffer = await response.arrayBuffer()
        // Si el archivo no está, el servidor devuelve el index.html de la app —con
        // estado 200— y XLSX intenta leer ese HTML como Excel: de ahí salía el
        // «Invalid HTML: could not find <table>». Un .xlsx es un ZIP y empieza con «PK».
        const firma = new Uint8Array(buffer.slice(0, 2))
        if (firma[0] !== 0x50 || firma[1] !== 0x4b) {
          throw new Error(`el archivo ${ruta} no está en el servidor`)
        }
        const loaded = XLSX.read(buffer, { cellDates: true, cellStyles: true })
        loadWorkbookRef.current(loaded, 'calendario-mantencion-base.xlsx')
        setPlantillaBaseFallo(false)
      } catch (error) {
        setPlantillaBaseFallo(true)
        setStatus(`No se pudo cargar la plantilla base: ${error instanceof Error ? error.message : 'error desconocido'}. Carga un Excel a mano para poder exportar y extender.`)
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
    // Sin la semana de hoy, la MÁS CERCANA — no la primera del archivo. Con la
    // planilla terminada en junio, abría en la semana del 01/03: seis meses
    // atrás y catorce clicks de "›" para llegar a lo último cargado.
    const cercana = semanaDeApertura(Object.keys(weeks), preferred)
    if (cercana) setSelectedWeek(cercana)
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

    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
        setStatus(`Calendario cargado desde la copia de este equipo: no se pudo leer la versión del servidor. Puede estar desactualizado.`)
      } else {
        setStatus(`Plantilla cargada, pero sin poder leer el servidor y sin copia en este equipo: el calendario puede estar vacío.`)
      }
      logger.error('No se pudo hidratar calendario desde Firebase', error instanceof Error ? error : new Error(String(error)))
    } finally {
      isHydratingRemoteRef.current = false
      hasLoadedCalendarRef.current = true
    }
  }

  /** El estado tal como se guarda. Se usa para escribir y para comparar. */
  const buildLocalPayload = useCallback((): PersistedCalendarState => {
    return {
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
  }, [dayCols, hoursConfig, originalFilename, shiftConfig, techRows])

  const syncCalendarToFirebase = useCallback(async (reason: string): Promise<void> => {
    const mySeq = ++syncSeqRef.current
    try {
      setSyncState('saving')
      setSyncErrorText('')
      const currentUser = getCurrentUser()
      const localPayload = buildLocalPayload()
      safeStorageSet(CALENDAR_LOCAL_CACHE_KEY, localPayload)

      // Nada cambió de verdad: no se escribe (ni se ensucia el "quién editó").
      const serializado = JSON.stringify(localPayload)
      if (lastSyncedPayloadRef.current === serializado) {
        if (syncSeqRef.current === mySeq) setSyncState('idle')
        return
      }

      const payload = {
        ...localPayload,
        reason,
        updatedAt: serverTimestamp(),
        updatedAtClient: Date.now(),
        updatedBy: currentUser?.uid ?? 'anon',
      }
      await trackedSetDoc(doc(db, CALENDAR_FIRESTORE_PATH[0], CALENDAR_FIRESTORE_PATH[1]), payload, { merge: true })
      lastSyncedPayloadRef.current = serializado
      if (syncSeqRef.current !== mySeq) return
      setLastSyncAt(new Date())
      setSyncState('synced')
    } catch (error) {
      if (syncSeqRef.current !== mySeq) return
      setSyncState('error')
      setSyncErrorText(error instanceof Error ? error.message : 'Error desconocido')
      // No se sabe la causa: puede ser señal, permisos o Firebase caído. Lo que
      // importa primero es que el trabajo no se perdió.
      setStatus(navigator.onLine
        ? `Tus cambios quedaron guardados en este equipo, pero no se pudieron subir: ${error instanceof Error ? error.message : 'error desconocido'}.`
        : 'Sin conexión. Tus cambios quedaron guardados en este equipo y se subirán cuando vuelva la señal.')
    }
  }, [buildLocalPayload])

  useEffect(() => {
    if (!hasLoadedCalendarRef.current || isHydratingRemoteRef.current) return
    /* Primer disparo después de hidratar: no es una edición, es el cambio de
       identidad de `dayCols`. Se toma como línea base y no se escribe. */
    if (lastSyncedPayloadRef.current === null) {
      lastSyncedPayloadRef.current = JSON.stringify(buildLocalPayload())
      setSyncState('idle')
      return
    }
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    setSyncState('saving')
    syncTimerRef.current = setTimeout(() => {
      void syncCalendarToFirebase('state-change')
    }, 200)
  }, [dayCols, syncCalendarToFirebase, buildLocalPayload])

  const syncIndicator = useMemo(() => {
    if (syncState === 'saving') return { label: 'Guardando…', className: 'bg-amber-500/[0.15] text-ink-warn border-amber-500/[0.25]' }
    if (syncState === 'synced') return { label: `Sincronizado${lastSyncAt ? ` ${lastSyncAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}`, className: 'bg-emerald-500/[0.15] text-ink-ok border-emerald-500/[0.25]' }
    if (syncState === 'error') return { label: `Sin subir${syncErrorText ? `: ${syncErrorText}` : ''}`, className: 'bg-red-500/[0.15] text-ink-crit border-red-500/[0.25]' }
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
      ...shiftConfig,
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

  /** Cuántas horas menos dura un turno reducido que el normal de su banda. */
  function reductionHoursForShift(shiftText: string): number {
    const t = parseTimeRange(shiftText)
    if (!t) return 0
    const dur = rangeDurationMinutes(t.start, t.end)
    if (dur === null) return 0
    const normal = t.start === shiftConfig.diaRedInicio ? rangeDurationMinutes(shiftConfig.diaInicio, shiftConfig.diaFin)
      : t.start === shiftConfig.tardeRedInicio ? rangeDurationMinutes(shiftConfig.tardeInicio, shiftConfig.tardeFin)
      : rangeDurationMinutes(shiftConfig.nocheInicio, shiftConfig.nocheFin)
    if (normal === null) return 0
    return Math.max(0, (normal - dur) / 60)
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

  /** Un turno es reducido si coincide con uno de los tres horarios reducidos. */
  function isReducedShift(shiftText: string): boolean {
    const text = shiftText.trim()
    if (!text) return false
    if (text.toUpperCase().includes('[RED]')) return true
    const t = parseTimeRange(text)
    if (!t) return false
    const reducidos: Array<[string, string]> = [
      [shiftConfig.diaRedInicio, shiftConfig.diaRedFin],
      [shiftConfig.tardeRedInicio, shiftConfig.tardeRedFin],
      [shiftConfig.nocheRedInicio, shiftConfig.nocheRedFin],
    ]
    return reducidos.some(([a, b]) => t.start === a && t.end === b)
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

  /** Filas en el orden de la planilla, o agrupadas por turno si el usuario lo pide. */
  const displayTechRows = useMemo(() => {
    if (!sortByTurno) return techRows
    return techRows.slice().sort((a, b) => {
      const ta = (a.turno || '~').trim().toUpperCase()
      const tb = (b.turno || '~').trim().toUpperCase()
      if (ta !== tb) return ta.localeCompare(tb)
      return a.name.localeCompare(b.name)
    })
  }, [techRows, sortByTurno])

  /**
   * Descanso antes de cada turno: horas entre el fin del turno trabajado anterior
   * y el inicio de este. Clave `r-c`. Sirve para cazar vueltas cortas de un vistazo.
   */
  const restByCell = useMemo(() => {
    const map = new Map<string, number>()
    for (const tech of techRows) {
      let prevIdx: number | null = null
      let prevShift = ''
      dayCols.forEach((d, idx) => {
        const value = tech.shifts[d.c] || ''
        if (!shiftWindow(value)) return
        if (prevIdx !== null) {
          const h = restHoursBetween(prevIdx, prevShift, idx, value)
          if (h !== null) map.set(`${tech.r}-${d.c}`, h)
        }
        prevIdx = idx
        prevShift = value
      })
    }
    return map
  }, [techRows, dayCols])

  /** Horas trabajadas por técnico en cada semana ISO visible. Clave `r-semana`. */
  const weekHoursByCell = useMemo(() => {
    const map = new Map<string, number>()
    for (const tech of techRows) {
      dayCols.forEach((d) => {
        if (!d.dateObj) return
        const key = `${tech.r}-${isoWeekKey(d.dateObj)}`
        map.set(key, (map.get(key) || 0) + workedHoursForShift(tech.shifts[d.c] || ''))
      })
    }
    return map
    // workedHoursForShift se recrea en cada render; sus entradas reales son hoursConfig y shiftConfig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techRows, dayCols, hoursConfig, shiftConfig])

  /** Para cada columna que abre semana, la clave ISO de esa semana. */
  function weekKeyAt(index: number): string | null {
    const d = dayCols[index]?.dateObj
    return d ? isoWeekKey(d) : null
  }

  /**
   * Qué se va a exportar realmente. Decía «1 días» sin decir de qué: quien elige
   * «Mes actual» a fin de mes se llevaba un día sin enterarse.
   */
  const resumenExport = useMemo(() => {
    const cols = selectedExportCols()
    const n = cols.length
    const primera = cols[0]?.dateRaw ?? ''
    const ultima = cols[n - 1]?.dateRaw ?? ''
    const etiqueta = n === 0 ? 'sin días' : n === 1 ? '1 día' : `${n} días`
    const detalle = n === 0
      ? 'El alcance elegido no tiene ningún día en la planilla.'
      : `Se exportarán ${etiqueta}: del ${primera} al ${ultima}.`
    // Un alcance de mes o «todo» con menos de una semana casi siempre significa
    // que la planilla todavía no cubre ese período.
    const escaso = n < 7 && (exportScope === 'month' || exportScope === 'months' || exportScope === 'all')
    return { etiqueta, detalle: escaso ? detalle + ' La planilla apenas cubre ese período.' : detalle, escaso }
    // selectedExportCols se recrea en cada render; sus entradas reales son las de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayCols, exportScope, exportSpanCount, selectedMonth, selectedWeek])

  /**
   * Vacaciones y feriados ocupan cuatro columnas que están en «–» cuando no hay
   * ninguno cargado. Se muestran solo si el período visible tiene alguno.
   */
  const hayAusencias = useMemo(() => {
    const cols = [...weekDays, ...monthDays]
    return techRows.some((t) => cols.some((d) => {
      const v = t.shifts[d.c] || ''
      return isVacationShift(v) || isHolidayShift(v)
    }))
    // isVacationShift/isHolidayShift se recrean por render; dependen de hoursConfig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techRows, weekDays, monthDays, hoursConfig])

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

    // La semana se compara contra el TOPE LEGAL, que es lo que interesa saber:
    // quién se pasó de las 42 h. El prorrateo por días programados hacía que el
    // que MENOS trabajaba apareciera «más sobre» (37,5 h daba +2,5 contra 35).
    // Solo se prorratea cuando la semana está a medio cargar en la planilla:
    // ahí comparar contra 42 diría «‑19,5 h» de una semana que no ha terminado.
    const semanaCompleta = weekDays.length === 7
    const weekExpectedAdjusted = semanaCompleta
      ? expectedWeekBase
      : (hoursConfig.expectedFromPlannedDays
        ? Math.max(0, weekExpectedDays * legalDailyTarget)
        : Math.max(0, expectedWeekBase * (weekDays.length / 7)))
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
    if (key === 'B') return 'border-amber-500/[0.25] bg-amber-500/[0.15] text-ink-warn'
    if (key === 'C') return 'border-cat-6-tint/[0.25] bg-cat-6-tint/[0.15] text-cat-6-ink'
    return 'border-border bg-muted text-foreground'
  }

  useEffect(() => {
    if (selectedCol === null) return
    const selectedDay = dayCols.find((d) => d.c === selectedCol)
    if (!selectedDay?.dateObj) return
    selectCalendarDate(selectedDay)
  }, [selectedCol, dayCols, selectCalendarDate])



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

    // El sufijo del alcance mentía en la carpeta: un archivo «_mes» podía traer
    // un solo día. Se le agrega el rango real, que no admite interpretación.
    const guion = (raw: string) => raw.replace(/\//g, '-')
    const desde = guion(exportCols[0]?.dateRaw ?? '')
    const hasta = guion(exportCols[exportCols.length - 1]?.dateRaw ?? '')
    const rango = desde && hasta ? (desde === hasta ? `_${desde}` : `_${desde}_a_${hasta}`) : ''
    const outputName = originalFilename.replace(/\.xlsx$/i, '') + `_${suffix}${rango}.xlsx`
    XLSX.writeFile(wbExport, outputName, { bookType: 'xlsx', compression: true })
    const cuantos = exportCols.length === 1 ? '1 día' : `${exportCols.length} días`
    setStatus(`Archivo exportado (${cuantos}): ${outputName}`)
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

  // isReducedShift ya definida arriba (línea ~1286)

  /** Banda del turno a partir de su hora de inicio. Null si es libre/vacaciones/feriado. */
  function bandaDeTurno(shift: string | undefined): 'dia' | 'tarde' | 'noche' | null {
    if (!shift || !isWorkingShift(shift)) return null
    const start = shift.match(/^(\d{1,2}:\d{2})/)?.[1]
    if (!start) return null
    if (start === shiftConfig.nocheInicio) return 'noche'
    if (start === shiftConfig.tardeInicio) return 'tarde'
    if (start === shiftConfig.diaInicio) return 'dia'
    const h = Number(start.split(':')[0])
    if (h < 8) return 'noche'
    if (h < 16) return 'dia'
    return 'tarde'
  }

  /**
   * Turnos por banda en un día. Alimenta el pie de la vista horizontal.
   * `planificado` distingue un día sin cobertura de uno que todavía no se llena:
   * «Extender» crea las columnas con la celda vacía, y pintar eso en rojo sería
   * una alarma falsa sobre días que nadie ha programado aún.
   */
  function dotacionDelDia(c: number): { dia: number; tarde: number; noche: number; planificado: boolean } {
    const r = { dia: 0, tarde: 0, noche: 0, planificado: false }
    for (const t of techRows) {
      const v = t.shifts[c]
      if (v && v.trim() !== '') r.planificado = true
      const b = bandaDeTurno(v)
      if (b) r[b] += 1
    }
    return r
  }

  function shiftTimeCompact(shift: string | undefined): { start: string; end: string } | null {
    if (!shift) return null
    const m = shift.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (!m || !m[1] || !m[2]) return null
    return { start: m[1], end: m[2] }
  }

  /** «08:00 - 16:00» -> «08–16». Conserva los minutos solo cuando no son en punto. */
  function horarioCorto(shift: string | undefined): string | null {
    const t = shiftTimeCompact(shift)
    if (!t) return null
    const corto = (hhmm: string) => (hhmm.endsWith(':00') ? hhmm.slice(0, 2) : hhmm)
    return corto(t.start) + '–' + corto(t.end)
  }

  /**
   * Pide pantalla completa y bloquea la orientación en horizontal.
   * Solo funciona en Android; en iOS la API no existe y la promesa se rechaza,
   * por eso el fallo es silencioso: el usuario gira el teléfono a mano.
   */
  async function girarAHorizontal(): Promise<void> {
    try {
      const raiz = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
      if (!document.fullscreenElement) {
        if (raiz.requestFullscreen) await raiz.requestFullscreen()
        else if (raiz.webkitRequestFullscreen) await raiz.webkitRequestFullscreen()
      }
      const orient = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      if (orient?.lock) await orient.lock('landscape')
    } catch {
      // Sin API (iOS) o sin permiso: queda la invitación a girar a mano.
    }
  }

  /** Día que mira la vista vertical. Arranca en hoy si está en la planilla. */
  const [diaVerticalC, setDiaVerticalC] = useState<number | null>(null)
  const diaActivo = useMemo(() => {
    if (dayCols.length === 0) return null
    if (diaVerticalC !== null) {
      const encontrado = dayCols.find((d) => d.c === diaVerticalC)
      if (encontrado) return encontrado
    }
    return todayDayCol ?? dayCols[0] ?? null
  }, [dayCols, diaVerticalC, todayDayCol])
  const indiceDiaActivo = diaActivo ? dayCols.findIndex((d) => d.c === diaActivo.c) : -1
  const diaAnterior = indiceDiaActivo > 0 ? dayCols[indiceDiaActivo - 1] : null
  const diaSiguiente = indiceDiaActivo >= 0 && indiceDiaActivo < dayCols.length - 1 ? dayCols[indiceDiaActivo + 1] : null
  const esHoy = isSameDate(diaActivo?.dateObj ?? null, todayDayCol?.dateObj ?? null)
  function irADiaRelativo(paso: number): void {
    const destino = paso < 0 ? diaAnterior : diaSiguiente
    if (destino) setDiaVerticalC(destino.c)
  }

  /** Filas de la vista horizontal: siempre agrupadas por turno, con el fijo al final. */
  const horizontalRows = useMemo(() => {
    return techRows.slice().sort((a, b) => {
      const ta = (a.turno || '~').trim().toUpperCase()
      const tb = (b.turno || '~').trim().toUpperCase()
      if (ta !== tb) return ta.localeCompare(tb)
      return a.name.localeCompare(b.name)
    })
  }, [techRows])

  /** Los nombres vienen en mayúsculas desde el Excel; en pantalla se leen mejor capitalizados. */
  function nombreParaMostrar(name: string): string {
    // shortName deja «Jose Chodil M.»; la inicial del segundo apellido es lo que
    // desborda los 132 px de la columna, y no distingue a nadie en un grupo de nueve.
    return shortName(name).replace(/\s+[A-ZÁÉÍÓÚÑ]\.$/i, '')
      .toLocaleLowerCase('es-CL')
      .replace(/(^|[\s'-])([\p{L}])/gu, (_m, sep: string, letra: string) => sep + letra.toLocaleUpperCase('es-CL'))
  }

  /** Color de la celda según la banda. Tokens de la piel, no clases crudas. */
  /**
   * Editor de horario por celda. Los atajos solo producen los turnos estándar y
   * sus reducidos, así que no había forma de escribir un «19:00 - 00:00» —
   * y ese horario es justo el que usa la planta los domingos. Doble clic abre esto.
   */
  const [celdaEditada, setCeldaEditada] = useState<{ r: number; c: number } | null>(null)
  const [horaDesde, setHoraDesde] = useState('')
  const [horaHasta, setHoraHasta] = useState('')

  function abrirEditorDeCelda(tech: TechRow, d: DayCol): void {
    const actual = tech.shifts[d.c] || ''
    const t = shiftTimeCompact(actual)
    setHoraDesde(t?.start || shiftConfig.diaInicio)
    setHoraHasta(t?.end || shiftConfig.diaFin)
    setCeldaEditada({ r: tech.r, c: d.c })
  }

  function guardarEditorDeCelda(): void {
    if (!celdaEditada || !horaDesde || !horaHasta) return
    applyShift(celdaEditada.r, celdaEditada.c, `${horaDesde} - ${horaHasta}`)
    setCeldaEditada(null)
  }

  /** Horas netas del horario que se está escribiendo, para verlas antes de guardar. */
  const horasDelEditor = (() => {
    const a = hhmmToMinutes(horaDesde)
    const b = hhmmToMinutes(horaHasta)
    if (a === null || b === null) return null
    let diff = b - a
    if (diff <= 0) diff += 24 * 60
    return Math.max(0, diff / 60 - hoursConfig.breakHours)
  })()

  /**
   * Qué pasaría si se guarda el horario que se está escribiendo: descanso contra el
   * turno anterior y el siguiente, y horas de esa semana. Avisar antes vale más que
   * corregir después — es el mismo cálculo que ya delata las vueltas cortas en la tabla.
   */
  const avisosDelEditor = useMemo(() => {
    if (!celdaEditada || !horaDesde || !horaHasta) return []
    const nuevo = `${horaDesde} - ${horaHasta}`
    const vent = shiftWindow(nuevo)
    if (!vent) return []
    const idx = dayCols.findIndex((d) => d.c === celdaEditada.c)
    if (idx < 0) return []
    const tech = techRows.find((t) => t.r === celdaEditada.r)
    if (!tech) return []
    const avisos: string[] = []

    // descanso contra el turno trabajado anterior y el siguiente
    const vecino = (paso: number) => {
      for (let i = idx + paso; i >= 0 && i < dayCols.length; i += paso) {
        const col = dayCols[i]
        if (!col) break
        const v = tech.shifts[col.c] || ''
        if (shiftWindow(v)) return { i, v }
      }
      return null
    }
    const antes = vecino(-1)
    const despues = vecino(1)
    if (antes) {
      const h = restHoursBetween(antes.i, antes.v, idx, nuevo)
      if (h !== null && h < 11) avisos.push(`Quedan ${h} h desde el turno anterior (${antes.v}). El mínimo son 11.`)
      else if (h !== null && h < 16) avisos.push(`Quedan ${h} h desde el turno anterior (${antes.v}): es un descanso justo.`)
    }
    if (despues) {
      const h = restHoursBetween(idx, nuevo, despues.i, despues.v)
      if (h !== null && h < 11) avisos.push(`Deja ${h} h hasta el turno siguiente (${despues.v}). El mínimo son 11.`)
      else if (h !== null && h < 16) avisos.push(`Deja ${h} h hasta el turno siguiente (${despues.v}): es un descanso justo.`)
    }

    // horas de la semana con el cambio aplicado
    const semana = dayCols[idx]?.dateObj ? isoWeekKey(dayCols[idx]!.dateObj!) : null
    if (semana) {
      let total = 0
      dayCols.forEach((d) => {
        if (!d.dateObj || isoWeekKey(d.dateObj) !== semana) return
        total += workedHoursForShift(d.c === celdaEditada.c ? nuevo : (tech.shifts[d.c] || ''))
      })
      if (total > expectedWeekBase + 0.01) {
        avisos.push(`Esa semana quedaría en ${total.toFixed(1)} h: ${(total - expectedWeekBase).toFixed(1)} h sobre el tope de ${expectedWeekBase.toFixed(0)}.`)
      }
    }
    return avisos
    // workedHoursForShift se recrea en cada render; sus entradas reales son las de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celdaEditada, horaDesde, horaHasta, dayCols, techRows, hoursConfig, shiftConfig, expectedWeekBase])

  function bandaClase(banda: 'dia' | 'tarde' | 'noche' | null): string {
    if (banda === 'dia') return 'bg-primary/[0.15] text-brand-ink'
    if (banda === 'tarde') return 'bg-cat-4-tint/[0.15] text-cat-4-ink'
    if (banda === 'noche') return 'bg-cat-6-tint/[0.15] text-cat-6-ink'
    return 'bg-muted text-muted-foreground font-medium'
  }

  /** Qué escribir en una celda que no es un turno trabajado. */
  function etiquetaNoLaboral(turno: string): string {
    const t = (turno || '').trim().toUpperCase()
    if (!t) return '—'
    if (t.startsWith('VACAC')) return 'Vac.'
    if (t.startsWith('FERIA')) return 'Feriado'
    if (t.includes('LICENCIA')) return 'Licencia'
    return 'Libre'
  }

  const syncPuntoClase = 'ml-auto h-2 w-2 shrink-0 rounded-full '
    + (syncState === 'saving' ? 'bg-ink-warn' : syncState === 'synced' ? 'bg-ink-ok' : syncState === 'error' ? 'bg-ink-crit' : 'bg-muted-foreground')



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


  const weekKeys = useMemo(() => Object.keys(weeks).sort(), [weeks])
  const currentWeekIdx = useMemo(() => weekKeys.indexOf(selectedWeek), [weekKeys, selectedWeek])
  const prevWeekKey = weekKeys[currentWeekIdx - 1] ?? null
  const nextWeekKey = weekKeys[currentWeekIdx + 1] ?? null
  const todayWeekKey = useMemo(() => isoWeekKey(new Date(todayTick)), [todayTick])
  const isCurrentWeek = selectedWeek === todayWeekKey

  /**
   * La planilla no llega a hoy.
   *
   * Cuando la semana actual no está cargada, el calendario cae en la PRIMERA
   * semana del archivo y la muestra sin decir nada: el 24-08 abría en la
   * semana del 01/03 —seis meses atrás— con pinta de ser la de hoy. El botón
   * "Ir a hoy" solo aparece si esa semana existe, así que en este caso no
   * había ninguna señal.
   */
  const finDePlanilla = useMemo(() => {
    if (weekKeys.length === 0 || weekKeys.includes(todayWeekKey)) return null
    const ultima = dayCols.map((d) => d.dateObj).filter((d): d is Date => !!d).sort((x, y) => x.getTime() - y.getTime()).pop()
    return ultima ? formatDate(ultima) : null
  }, [weekKeys, todayWeekKey, dayCols])

  const mobileWeekLabel = useMemo(() => {
    const parts = selectedWeek.split('-W')
    return parts.length === 2 ? `Sem ${parts[1]} · ${parts[0]}` : (selectedWeek || 'Semana actual')
  }, [selectedWeek])


  const TAB_ITEMS: { id: TabId; label: string }[] = [
    // Aquí no se edita: se exporta y se extiende. La edición es la tabla de abajo.
    { id: 'edicion', label: 'Planilla' },
    // «Turnos» chocaba con la pestaña de módulo del mismo nombre: era «Turnos › Turnos».
    // Aquí se definen las horas de inicio y fin de cada banda, así que es «Horarios».
    { id: 'plantillas', label: 'Horarios' },
    { id: 'tecnicos', label: 'Técnicos' },
    { id: 'control', label: 'Control' },
  ]

  return (
    <div className="h-full min-h-0 flex flex-col gap-2">

      {/* ══════════════════════════════════════════
          Conmutador de vista del módulo
          ══════════════════════════════════════════ */}
      <div className={`shrink-0 gap-1 ${isMobile && isLandscape ? 'hidden' : 'flex'}`} role="tablist" aria-label="Vista del calendario">
        {([['turnos', 'Turnos'], ['rueda', 'Ventanas de intervención']] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={vistaModulo === id}
            onClick={() => setVistaModulo(id)}
            className={`min-h-[44px] rounded-ctl px-3.5 text-footnote font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none ${
              vistaModulo === id
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {vistaModulo === 'rueda' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <RuedaVentanas />
        </div>
      )}

      {/* ══════════════════════════════════════════
          VISTA MÓVIL — lectura de turnos por semana
          ══════════════════════════════════════════ */}
      {/* ══ MÓVIL VERTICAL: puerta de rotación ══
          El calendario es una matriz de 9 técnicos × 7 días: en 375 px no cabe.
          En horizontal sí, con el horario escrito. Se invita a girar, no se obliga:
          en iOS no existe API para forzar la orientación, y con el giro bloqueado
          en los ajustes del teléfono esta pantalla sería un muro. */}
      {vistaModulo === 'turnos' && isMobile && !isLandscape && !verEnVertical && (
        <div className="flex h-[calc(100dvh-9rem)] min-h-0 flex-col items-center justify-center gap-4 px-8 text-center">
          <RotateCcw className="h-14 w-14 text-primary" strokeWidth={1.5} aria-hidden />
          <div className="space-y-1.5">
            <p className="text-headline font-semibold text-foreground">Gira el teléfono</p>
            <p className="text-footnote text-muted-foreground">
              El calendario de turnos se ve completo en horizontal: los siete días con su horario.
            </p>
          </div>
          <button
            onClick={girarAHorizontal}
            className="inline-flex min-h-11 items-center rounded-ctl bg-primary px-5 text-footnote font-semibold text-primary-foreground active:opacity-80 select-none"
          >
            Girar ahora
          </button>
          <button
            onClick={() => setVerEnVertical(true)}
            className="min-h-11 text-footnote font-medium text-primary active:opacity-70 select-none"
          >
            Ver igual en vertical
          </button>
        </div>
      )}

      {/* ══ MÓVIL HORIZONTAL: la matriz completa, con el horario a la vista ══ */}
      {vistaModulo === 'turnos' && isMobile && isLandscape && (
        // Altura atada al viewport: la cadena de h-full está rota más arriba y sin
        // esto el pie de dotación queda bajo el borde de la pantalla.
        <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col gap-1">
          <div className="flex shrink-0 items-center gap-2 px-1">
            <button onClick={() => prevWeekKey && setSelectedWeek(prevWeekKey)} disabled={!prevWeekKey}
              aria-label="Semana anterior"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl border border-border text-muted-foreground disabled:opacity-30 active:bg-muted select-none">‹</button>
            <span className="text-footnote font-semibold text-foreground">{mobileWeekLabel}</span>
            <span className="text-caption text-muted-foreground tabular-nums">
              {weekDays[0] ? formatDate(weekDays[0].dateObj) : '—'}–{weekDays.length > 0 ? formatDate(weekDays[weekDays.length - 1]!.dateObj) : '—'}
            </span>
            {isCurrentWeek
              ? <span className="text-caption text-ink-warn">● hoy</span>
              : weekKeys.includes(todayWeekKey) ? (
                <button onClick={() => setSelectedWeek(todayWeekKey)}
                  className="inline-flex h-6 items-center gap-1 rounded-ctl border border-border px-1.5 text-caption font-medium text-ink-warn active:bg-muted select-none">
                  <CornerUpLeft className="h-3 w-3" />Hoy</button>
              ) : finDePlanilla ? (
                <span className="text-caption text-ink-warn">la planilla llega al {finDePlanilla}</span>
              ) : null}
            <span title={syncIndicator.label} aria-label={syncIndicator.label}
              className={syncPuntoClase}></span>
            <button onClick={() => nextWeekKey && setSelectedWeek(nextWeekKey)} disabled={!nextWeekKey}
              aria-label="Semana siguiente"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-ctl border border-border text-muted-foreground disabled:opacity-30 active:bg-muted select-none">›</button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-card bg-card px-1.5 py-1">
            <table className="w-full table-fixed border-separate border-spacing-y-0.5 tabular-nums">
              <thead>
                <tr>
                  <th className="w-[150px] pb-1 pl-1 text-left text-caption font-semibold text-muted-foreground">Técnico</th>
                  {weekDays.map((d) => (
                    <th key={d.c} className={isSameDate(d.dateObj, todayDayCol?.dateObj ?? null)
                      ? 'pb-1 text-center text-caption font-semibold text-ink-warn'
                      : 'pb-1 text-center text-caption font-semibold text-muted-foreground'}>
                      {d.dayLabel.slice(0, 3)}
                      <span className="block text-caption font-normal opacity-70">{d.dateObj ? d.dateObj.getDate() : ''}</span>
                    </th>
                  ))}
                  <th className="w-[54px] pb-1 pr-1 text-right text-caption font-semibold text-muted-foreground">h·sem</th>
                </tr>
              </thead>
              <tbody>
                {horizontalRows.map((tech) => {
                  const hr = hoursRows.find((h) => h.tech.r === tech.r)
                  const semana = hr?.weekHours ?? 0
                  const sobreTope = semana > expectedWeekBase + 0.01
                  return (
                    <tr key={tech.r}>
                      <td className="max-w-[150px] truncate pl-1 text-caption font-medium text-foreground">
                        <span className={'mr-1.5 inline-block h-4 w-4 rounded-ctl text-center align-[1px] text-caption font-bold leading-4 ' + turnoBadgeClass(tech.turno)}>
                          {tech.turno || '·'}
                        </span>
                        {nombreParaMostrar(tech.name)}
                      </td>
                      {weekDays.map((d) => {
                        const turno = tech.shifts[d.c] || ''
                        const banda = bandaDeTurno(turno)
                        const descanso = restByCell.get(tech.r + '-' + d.c)
                        const corta = descanso !== undefined && descanso < 11
                        return (
                          <td key={d.c} className="px-0.5">
                            <button
                              type="button"
                              onClick={() => abrirEditorDeCelda(tech, d)}
                              className={'relative block h-6 w-full rounded-ctl text-center text-caption font-semibold leading-6 active:opacity-70 ' + bandaClase(banda)}
                            >
                              {banda ? horarioCorto(turno) : etiquetaNoLaboral(turno)}
                              {corta && (
                                <span
                                  title={'Solo ' + descanso + ' h de descanso desde el turno anterior'}
                                  className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-ink-crit text-caption font-bold leading-none text-white"
                                >!</span>
                              )}
                            </button>
                          </td>
                        )
                      })}
                      <td className={sobreTope
                        ? 'pr-1 text-right text-caption font-bold text-ink-warn'
                        : 'pr-1 text-right text-caption font-bold text-foreground'}>
                        {semana > 0 ? semana.toFixed(1) : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Dotación por banda: fuera del scroll, para que nunca quede bajo el borde.
              Misma table-fixed y mismos anchos que la tabla de arriba, así las
              columnas quedan alineadas sin duplicar la lógica de layout. */}
          <table className="w-full shrink-0 table-fixed border-separate border-spacing-0 rounded-card bg-card px-1.5 py-1 tabular-nums">
            <tbody>
              <tr>
                <td className="w-[150px] pl-1 text-caption text-muted-foreground">Día · tarde · noche</td>
                {weekDays.map((d) => {
                  const n = dotacionDelDia(d.c)
                  return (
                    <td key={d.c} className="px-0.5 text-center text-caption font-semibold">
                      {n.planificado ? (
                        <>
                          <span className={n.dia < 2 ? 'text-ink-crit' : 'text-brand-ink'}>{n.dia}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className={n.tarde < 2 ? 'text-ink-crit' : 'text-cat-4-ink'}>{n.tarde}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className={n.noche < 2 ? 'text-ink-crit' : 'text-cat-6-ink'}>{n.noche}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground" title="Día sin planificar todavía">sin planificar</span>
                      )}
                    </td>
                  )
                })}
                <td className="w-[54px]" />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ══ MÓVIL VERTICAL (salida de emergencia) ══
          Para quien no puede girar el teléfono. La matriz no cabe en vertical,
          así que aquí se mira UN día a la vez, agrupado por banda: responde
          «¿quién está en este turno?», que es la pregunta que se hace en planta. */}
      {vistaModulo === 'turnos' && isMobile && !isLandscape && verEnVertical && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="flex shrink-0 items-center gap-2 rounded-card bg-card px-2 py-1.5">
            <button onClick={() => irADiaRelativo(-1)} disabled={!diaAnterior}
              aria-label="Día anterior"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-border text-muted-foreground disabled:opacity-30 active:bg-muted select-none">‹</button>
            <div className="min-w-0 flex-1 text-center">
              <div className="truncate text-footnote font-semibold text-foreground">
                {diaActivo ? `${diaActivo.dayLabel} ${diaActivo.dateObj ? diaActivo.dateObj.getDate() : ''}` : '—'}
                {esHoy && <span className="ml-1.5 text-caption font-normal text-ink-warn">● hoy</span>}
              </div>
              <div className="text-caption text-muted-foreground tabular-nums">
                {diaActivo ? formatDate(diaActivo.dateObj) : ''}
              </div>
            </div>
            <button onClick={() => irADiaRelativo(1)} disabled={!diaSiguiente}
              aria-label="Día siguiente"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ctl border border-border text-muted-foreground disabled:opacity-30 active:bg-muted select-none">›</button>
          </div>

          {diaActivo && (
            <div className="flex shrink-0 gap-1.5">
              {([
                { k: 'dia' as const, label: 'Día', n: dotacionDelDia(diaActivo.c).dia },
                { k: 'tarde' as const, label: 'Tarde', n: dotacionDelDia(diaActivo.c).tarde },
                { k: 'noche' as const, label: 'Noche', n: dotacionDelDia(diaActivo.c).noche },
                { k: null, label: 'Libre', n: techRows.filter((t) => !bandaDeTurno(t.shifts[diaActivo.c])).length },
              ]).map(({ k, label, n }) => (
                <div key={label} className="flex-1 rounded-card bg-card px-1 py-2 text-center">
                  <div className={`text-title3 font-bold tabular-nums ${k && n < 2 && dotacionDelDia(diaActivo.c).planificado ? 'text-ink-crit' : 'text-foreground'}`}>{n}</div>
                  <div className="text-caption text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2 overflow-auto">
            {diaActivo && ([
              { k: 'dia' as const, titulo: 'Día', horario: `${shiftConfig.diaInicio}–${shiftConfig.diaFin}` },
              { k: 'tarde' as const, titulo: 'Tarde', horario: `${shiftConfig.tardeInicio}–${shiftConfig.tardeFin}` },
              { k: 'noche' as const, titulo: 'Noche', horario: `${shiftConfig.nocheInicio}–${shiftConfig.nocheFin}` },
              { k: null, titulo: 'Libres', horario: '' },
            ]).map(({ k, titulo, horario }) => {
              const gente = horizontalRows.filter((t) => bandaDeTurno(t.shifts[diaActivo.c]) === k)
              if (gente.length === 0) return null
              return (
                <section key={titulo}>
                  <h3 className="px-1 pb-1 text-caption font-semibold text-muted-foreground">
                    {titulo}{horario && <span className="ml-1.5 font-normal tabular-nums">{horario}</span>}
                  </h3>
                  <div className="overflow-hidden rounded-card bg-card">
                    {gente.map((tech, i) => {
                      const turno = tech.shifts[diaActivo.c] || ''
                      const hr = hoursRows.find((h) => h.tech.r === tech.r)
                      const semana = hr?.weekHours ?? 0
                      const reducido = k !== null && horarioCorto(turno) !== null
                        && turno.trim() !== `${shiftConfig[k === 'dia' ? 'diaInicio' : k === 'tarde' ? 'tardeInicio' : 'nocheInicio']} - ${shiftConfig[k === 'dia' ? 'diaFin' : k === 'tarde' ? 'tardeFin' : 'nocheFin']}`
                      return (
                        <button
                          type="button"
                          key={tech.r}
                          onClick={() => diaActivo && abrirEditorDeCelda(tech, diaActivo)}
                          className={`flex min-h-11 w-full items-center gap-2.5 px-3 py-2 text-left active:bg-muted ${i > 0 ? 'border-t border-border/40' : ''}`}>
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-ctl text-caption font-bold ${turnoBadgeClass(tech.turno)}`}>
                            {tech.turno || '·'}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-footnote font-medium text-foreground">
                            {nombreParaMostrar(tech.name)}
                          </span>
                          {k !== null && reducido && (
                            <span className="shrink-0 text-caption tabular-nums text-ink-warn">{horarioCorto(turno)}</span>
                          )}
                          <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                            {semana > 0 ? `${semana.toFixed(1)} h` : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <button
            onClick={() => setVerEnVertical(false)}
            className="min-h-11 shrink-0 text-caption font-medium text-primary active:opacity-70 select-none"
          >
            Ver la semana completa en horizontal
          </button>
        </div>
      )}


      {/* ══════════════════════════════════════════
          VISTA DESKTOP — panel de tabs + tabla
          ══════════════════════════════════════════ */}
      {vistaModulo === 'turnos' && !isMobile && <section className="sticky top-0 z-20 rounded-card border bg-card p-2">
        {/* ── Tab bar ── */}
        <div className="flex items-center gap-1 border-b border-border pb-1 mb-2">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                // La barra de estado es feedback de la acción en curso. Arrastrarla a
                // otra pestaña deja mensajes sin contexto («Debes ingresar nombre del
                // técnico.» encima del calendario), y no expiraban nunca.
                if (tab.id !== activeTab) setStatus('')
                setActiveTab(tab.id)
              }}
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
            {plantillaBaseFallo && (
              <div className="grid gap-1.5 rounded-ctl border border-ink-crit/40 p-2">
                <label htmlFor="plantilla-rescate" className="text-xs text-ink-crit">
                  La plantilla base no cargó. Carga un Excel para poder exportar y extender.
                </label>
                <input
                  id="plantilla-rescate"
                  type="file"
                  accept=".xlsx,.xls"
                  className="text-xs"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <label className="text-xs text-muted-foreground">Exportar calendario</label>
              <button className="h-8 rounded-ctl border text-xs" onClick={exportWorkbook}>Exportar</button>
              <div className="grid grid-cols-2 gap-1">
                <button className="h-8 rounded-ctl border text-xs" onClick={() => extendCalendarByDays(28)}>Extender +4 semanas</button>
                <button className="h-8 rounded-ctl border text-xs" onClick={() => extendCalendarByDays(31)}>Extender +1 mes</button>
              </div>
              <div className="grid grid-cols-3 gap-1 text-caption">
                <select className={CONTROL_CLASS + ' h-7'} value={exportScope} onChange={(e) => setExportScope(e.target.value as ExportScope)}>
                  <option value="month">Mes actual</option>
                  <option value="week">Semana actual</option>
                  <option value="months">N meses</option>
                  <option value="weeks">N semanas</option>
                  <option value="all">Todo</option>
                </select>
                <input
                  className={`${CONTROL_CLASS} h-7 ${exportScope === 'weeks' || exportScope === 'months' ? '' : 'invisible'}`}
                  type="number"
                  min={1}
                  max={12}
                  value={exportSpanCount}
                  onChange={(e) => setExportSpanCount(Math.max(1, Math.floor(toNumberOr(e.target.value, exportSpanCount))))}
                  disabled={!(exportScope === 'weeks' || exportScope === 'months')}
                  title="Cantidad para N semanas/N meses"
                />
                <div
                  className={`h-7 rounded-ctl border px-2 flex items-center tabular-nums ${resumenExport.escaso ? 'border-ink-warn/40 text-ink-warn' : 'border-border text-muted-foreground'}`}
                  title={resumenExport.detalle}
                >
                  {resumenExport.etiqueta}
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
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que entra el turno de día" value={shiftConfig.diaInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, diaInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que sale el turno de día" value={shiftConfig.diaFin} onChange={(e) => setShiftConfig((p) => ({ ...p, diaFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center">Tarde</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que entra el turno de tarde" value={shiftConfig.tardeInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, tardeInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que sale el turno de tarde" value={shiftConfig.tardeFin} onChange={(e) => setShiftConfig((p) => ({ ...p, tardeFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center">Noche</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que entra el turno de noche" value={shiftConfig.nocheInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, nocheInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que sale el turno de noche" value={shiftConfig.nocheFin} onChange={(e) => setShiftConfig((p) => ({ ...p, nocheFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center">Libre</label>
            <input
              className={CONTROL_CLASS}
              aria-label="Texto que se escribe en los días libres"
              value={shiftConfig.libreLabel}
              onChange={(e) => setShiftConfig((p) => ({ ...p, libreLabel: e.target.value.toUpperCase() }))}
            />
            <label htmlFor="colacion-h" className="text-muted-foreground self-center" title="Se descuenta de cada turno al calcular las horas trabajadas.">Colación (h)</label>
            <input id="colacion-h" className={CONTROL_CLASS} type="number" min={0} step="0.25" value={hoursConfig.breakHours} onChange={(e) => setHoursConfig((p) => ({ ...p, breakHours: Math.max(0, toNumberOr(e.target.value, p.breakHours)) }))} />
            <p className="col-span-2 self-center text-caption text-muted-foreground">{legalWeekLabel}. El tope se aplica solo.</p>
            <p className="col-span-2 sm:col-span-4 mt-2 text-caption font-semibold text-foreground">Turnos reducidos</p>
            <label className="text-muted-foreground self-center" title="Disponible como botón al tocar una celda.">Día reducido</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que entra el día reducido" value={shiftConfig.diaRedInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, diaRedInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que sale el día reducido" value={shiftConfig.diaRedFin} onChange={(e) => setShiftConfig((p) => ({ ...p, diaRedFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center" title="Disponible como botón al tocar una celda.">Tarde reducida</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que entra la tarde reducida" value={shiftConfig.tardeRedInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, tardeRedInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que sale la tarde reducida" value={shiftConfig.tardeRedFin} onChange={(e) => setShiftConfig((p) => ({ ...p, tardeRedFin: e.target.value }))} />
            </div>
            <label className="text-muted-foreground self-center" title="Disponible como botón al tocar una celda.">Noche reducida</label>
            <div className="flex gap-1">
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que entra la noche reducida" value={shiftConfig.nocheRedInicio} onChange={(e) => setShiftConfig((p) => ({ ...p, nocheRedInicio: e.target.value }))} />
              <input className={CONTROL_CLASS + ' flex-1'} type="time" aria-label="Hora en que sale la noche reducida" value={shiftConfig.nocheRedFin} onChange={(e) => setShiftConfig((p) => ({ ...p, nocheRedFin: e.target.value }))} />
            </div>
            <div className="col-span-2 sm:col-span-4 mt-1 space-y-1 text-caption text-muted-foreground">
              <p>Los cambios se aplican al instante y se guardan solos.</p>
              <p>Para cambiar un turno, toca su celda en el calendario: ahí están estos turnos como botones, y también se puede escribir cualquier otro horario.</p>
            </div>
          </div>
        )}

        {/* ── Tab: Horas ── */}

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
                <label htmlFor="nuevo-tecnico-grupo" className="text-muted-foreground">Grupo/Equipo</label>
                <select id="nuevo-tecnico-grupo" className={CONTROL_CLASS} value={newTechGroup} onChange={(e) => setNewTechGroup(e.target.value)}>
                  {techGroups.map((group) => <option key={group} value={group}>{group}</option>)}
                </select>
              </div>
              <div className="grid gap-1">
                <label className="text-muted-foreground">Área</label>
                <input className={CONTROL_CLASS} value={newTechArea} onChange={(e) => setNewTechArea(e.target.value)} placeholder="Mantención" />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button className="h-8 rounded-ctl border border-border px-3 text-xs text-muted-foreground hover:bg-muted" onClick={handleAddPlaceholders} title="Agrega 6 placeholders: A3/A4, B3/B4, C3/C4">+ Placeholders turno</button>
              <button className="h-8 rounded-ctl bg-primary px-3 text-xs text-primary-foreground" onClick={handleAddTechnician}>Agregar técnico</button>
            </div>

            {/* Cards — móvil */}
            <div className="md:hidden space-y-2">
              {techRows.map((tech) => (
                <div key={tech.r} className="rounded-ctl border border-border bg-muted p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`shrink-0 inline-flex h-6 w-6 items-center justify-center rounded-ctl border text-xs font-bold ${turnoBadgeClass(tech.turno)}`}>
                      {tech.turno || '-'}
                    </span>
                    <span className="text-sm font-medium text-foreground truncate">{tech.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{tech.rut || 'Sin RUT'}</div>
                  <div className="flex gap-2">
                    <div className="flex-1 grid gap-1">
                      <label htmlFor={`grupo-${tech.r}`} className="text-caption text-muted-foreground">Grupo</label>
                      <select
                        id={`grupo-${tech.r}`}
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
                      <label htmlFor={`area-${tech.r}`} className="text-caption text-muted-foreground">Área</label>
                      <input
                        id={`area-${tech.r}`}
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
            <div className="hidden md:block rounded-ctl border overflow-auto">
              <table className="w-full text-caption">
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
                          className={CONTROL_CLASS + ' h-7 text-caption'}
                          aria-label={`Grupo de ${tech.name}`}
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
                          className={CONTROL_CLASS + ' h-7 text-caption'}
                          aria-label={`Área o equipo de ${tech.name}`}
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
                  <span className="text-caption text-muted-foreground">({weekDays.length} días)</span>
                </div>
                <select className={CONTROL_CLASS + ' w-full'} value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}>
                  {Object.entries(weeks).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-full bg-cat-3-tint" />
                  <label className="font-medium text-foreground">Mes</label>
                  <span className={`text-caption ${monthDays.length < 7 ? 'text-ink-warn' : 'text-muted-foreground'}`}>
                    ({monthDays.length === 1 ? '1 día' : `${monthDays.length} días`}{monthDays.length < 7 ? ' en la planilla' : ''})
                  </span>
                </div>
                <select className={CONTROL_CLASS + ' w-full'} value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
                  {Object.entries(months).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
                {monthDays.length < 7 && (
                  <p className="flex items-start gap-1 text-caption text-ink-warn">
                    <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                    <span>El resumen mensual solo cubre lo que hay cargado de este mes, no el mes completo.</span>
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-card border border-border/40 overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-caption border-collapse">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-20 border-b border-r border-border/30 bg-muted px-2 md:px-3 py-2 text-left text-xs font-semibold text-foreground" style={{ minWidth: 140 }}>
                      Técnico
                    </th>
                    <th colSpan={hayAusencias ? 6 : 4} className="border-b border-l border-border/30 bg-primary/[0.15] dark:bg-gradient-to-r dark:from-blue-950/80 dark:to-blue-900/40 px-2 py-1.5 text-center text-caption font-bold tracking-wider text-primary">
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />Resumen Semanal</span>
                    </th>
                    <th colSpan={hayAusencias ? 6 : 4} className="border-b border-l-2 border-border/30 bg-cat-3-tint/[0.15] px-2 py-1.5 text-center text-caption font-bold tracking-wider text-cat-3-ink">
                      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-cat-3-ink" />Resumen Mensual</span>
                    </th>
                    <th rowSpan={2} className="border-b border-l-2 border-border/30 bg-muted px-2 py-1.5 text-center" style={{ minWidth: 44 }} title="Total de días de vacaciones acumulados en todo el calendario">
                      <div className="text-caption font-bold text-foreground">Vac.</div>
                      <div className="text-caption font-normal text-muted-foreground">Acum.</div>
                    </th>
                  </tr>
                  <tr className="bg-muted">
                    <th className="border-l border-border/20 px-1.5 py-1 text-right text-caption font-semibold text-primary/90" title="Horas totales (trabajadas + vacaciones pagadas + feriados pagados) / Horas esperadas según jornada legal">
                      <div>Horas</div><div className="font-normal text-caption text-muted-foreground">Real / Esp</div>
                    </th>
                    <th className="px-1 py-1 text-center text-caption font-semibold text-primary/90" style={{ minWidth: 90 }} title="Diferencia = Horas reales − Horas esperadas del período (prorrateado por días programados). No es el tope legal: para eso, mira si las horas reales salen en ámbar.">Diferencia</th>
                    <th className="px-1 py-1 text-center text-caption font-semibold text-primary/90" title="Días efectivamente trabajados (turnos asignados)">
                      <div>Días</div><div className="font-normal text-caption text-muted-foreground">Trab.</div>
                    </th>
                    <th className="px-1 py-1 text-center text-caption font-semibold text-primary/90" title="Días de descanso / libres (NO incluye vacaciones ni feriados)">
                      <div>Días</div><div className="font-normal text-caption text-muted-foreground">Libres</div>
                    </th>
                    {hayAusencias && (<th className="px-1 py-1 text-center text-caption font-semibold text-primary/90" title="Días de vacaciones (horas pagadas incluidas en Horas Reales)">Vac.</th>)}
                    {hayAusencias && (<th className="px-1 py-1 text-center text-caption font-semibold text-primary/90" title="Días feriados (horas pagadas incluidas en Horas Reales)">Fer.</th>)}
                    <th className="border-l-2 border-border/30 px-1.5 py-1 text-right text-caption font-semibold text-cat-3-ink" title="Horas totales del mes (trabajadas + vacaciones + feriados pagados) / Horas esperadas">
                      <div>Horas</div><div className="font-normal text-caption text-muted-foreground">Real / Esp</div>
                    </th>
                    <th className="px-1 py-1 text-center text-caption font-semibold text-cat-3-ink" style={{ minWidth: 90 }} title="Diferencia mensual = Horas reales − Horas esperadas">Diferencia</th>
                    <th className="px-1 py-1 text-center text-caption font-semibold text-cat-3-ink" title="Días efectivamente trabajados en el mes">
                      <div>Días</div><div className="font-normal text-caption text-muted-foreground">Trab.</div>
                    </th>
                    <th className="px-1 py-1 text-center text-caption font-semibold text-cat-3-ink" title="Días de descanso del mes (NO incluye vacaciones ni feriados)">
                      <div>Días</div><div className="font-normal text-caption text-muted-foreground">Libres</div>
                    </th>
                    {hayAusencias && (<th className="px-1 py-1 text-center text-caption font-semibold text-cat-3-ink" title="Días de vacaciones del mes">Vac.</th>)}
                    {hayAusencias && (<th className="px-1 py-1 text-center text-caption font-semibold text-cat-3-ink" title="Días feriados del mes">Fer.</th>)}
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
                              <span className={`shrink-0 inline-flex h-[18px] w-[18px] items-center justify-center rounded-ctl text-caption font-bold border ${turnoBadgeClass(row.tech.turno)}`}>
                                {row.tech.turno}
                              </span>
                            )}
                            <span className="truncate font-medium text-foreground" title={row.tech.name}>{row.tech.name}</span>
                          </div>
                        </td>
                        <td className="border-l border-border/15 px-1.5 py-1 text-right tabular-nums whitespace-nowrap" title={`Trabajo: ${row.weekWorkedHours.toFixed(1)}h · Vac pagadas: ${row.weekVacationPaidHours.toFixed(1)}h · Fer pagados: ${row.weekHolidayPaidHours.toFixed(1)}h · Colación: ${row.weekBreakHours.toFixed(1)}h`}>
                          <span className={row.weekHours > expectedWeekBase + 0.01 ? 'font-bold text-ink-warn' : 'font-medium text-foreground'}>
                            {row.weekHours.toFixed(1)}
                          </span>
                          <span className="text-muted-foreground mx-0.5">/</span>
                          <span className="text-muted-foreground">{row.weekExpected.toFixed(1)}</span>
                          {row.weekHours > expectedWeekBase + 0.01 && (
                            <span
                              className="ml-1 text-caption font-semibold text-ink-warn"
                              title={`Sobre el tope legal de ${expectedWeekBase.toFixed(0)} h: ${(row.weekHours - expectedWeekBase).toFixed(1)} h extraordinarias`}
                            >
                              +{(row.weekHours - expectedWeekBase).toFixed(1)} extra
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-1" style={{ minWidth: 90 }}>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-[5px] rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${wOver ? 'bg-cat-4-tint' : riskW ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pctW}%` }} />
                            </div>
                            <span className={`shrink-0 inline-block min-w-[38px] rounded-ctl px-1 py-[1px] text-center text-caption tabular-nums font-bold ${wOver ? 'bg-cat-4-tint/[0.15] text-cat-4-ink' : riskW ? 'bg-red-500/[0.15] text-red-400' : row.deltaWeek > 0 ? 'bg-emerald-500/[0.15] text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                              {formatDelta(row.deltaWeek)}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums">
                          <span className={`font-semibold ${row.weekWorkedDays > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{row.weekWorkedDays}</span>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums text-muted-foreground">{row.weekFreeDays > 0 ? row.weekFreeDays : <span className="text-muted-foreground">–</span>}</td>
                        {hayAusencias && (<td className="px-1 py-1 text-center">
                          {row.weekVacationDays > 0
                            ? <span className="inline-block rounded-full border border-primary/[0.25] bg-primary/[0.15] px-1.5 py-[1px] text-caption font-bold tabular-nums text-primary" title={`${row.weekVacationPaidHours.toFixed(1)}h pagadas`}>{row.weekVacationDays}d</span>
                            : <span className="text-muted-foreground">–</span>}
                        </td>)}
                        {hayAusencias && (<td className="px-1 py-1 text-center">
                          {row.weekHolidayDays > 0
                            ? <span className="inline-block rounded-full border border-amber-500/[0.25] bg-amber-500/[0.15] px-1.5 py-[1px] text-caption font-bold tabular-nums text-ink-warn" title={`${row.weekHolidayPaidHours.toFixed(1)}h pagadas`}>{row.weekHolidayDays}d</span>
                            : <span className="text-muted-foreground">–</span>}
                        </td>)}
                        <td className="border-l-2 border-border/25 px-1.5 py-1 text-right tabular-nums whitespace-nowrap" title={`Trabajo: ${row.monthWorkedHours.toFixed(1)}h · Vac pagadas: ${row.monthVacationPaidHours.toFixed(1)}h · Fer pagados: ${row.monthHolidayPaidHours.toFixed(1)}h · Colación: ${row.monthBreakHours.toFixed(1)}h`}>
                          <span className="text-foreground font-medium">{row.monthHours.toFixed(1)}</span>
                          <span className="text-muted-foreground mx-0.5">/</span>
                          <span className="text-muted-foreground">{row.monthExpected.toFixed(1)}</span>
                        </td>
                        <td className="px-1 py-1" style={{ minWidth: 90 }}>
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-[5px] rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${mOver ? 'bg-cat-4-tint' : riskM ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pctM}%` }} />
                            </div>
                            <span className={`shrink-0 inline-block min-w-[38px] rounded-ctl px-1 py-[1px] text-center text-caption tabular-nums font-bold ${mOver ? 'bg-cat-4-tint/[0.15] text-cat-4-ink' : riskM ? 'bg-red-500/[0.15] text-red-400' : row.deltaMonth > 0 ? 'bg-emerald-500/[0.15] text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                              {formatDelta(row.deltaMonth)}
                            </span>
                          </div>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums">
                          <span className={`font-semibold ${row.monthWorkedDays > 0 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{row.monthWorkedDays}</span>
                        </td>
                        <td className="px-1.5 py-1 text-center tabular-nums text-muted-foreground">{row.monthFreeDays > 0 ? row.monthFreeDays : <span className="text-muted-foreground">–</span>}</td>
                        {hayAusencias && (<td className="px-1 py-1 text-center">
                          {row.monthVacationDays > 0
                            ? <span className="inline-block rounded-full border border-primary/[0.25] bg-primary/[0.15] px-1.5 py-[1px] text-caption font-bold tabular-nums text-primary" title={`${row.monthVacationPaidHours.toFixed(1)}h pagadas`}>{row.monthVacationDays}d</span>
                            : <span className="text-muted-foreground">–</span>}
                        </td>)}
                        {hayAusencias && (<td className="px-1 py-1 text-center">
                          {row.monthHolidayDays > 0
                            ? <span className="inline-block rounded-full border border-amber-500/[0.25] bg-amber-500/[0.15] px-1.5 py-[1px] text-caption font-bold tabular-nums text-ink-warn" title={`${row.monthHolidayPaidHours.toFixed(1)}h pagadas`}>{row.monthHolidayDays}d</span>
                            : <span className="text-muted-foreground">–</span>}
                        </td>)}
                        <td className="border-l-2 border-border/25 px-1.5 py-1 text-center tabular-nums">
                          {row.totalVacationDays > 0
                            ? <span className="font-bold text-primary">{row.totalVacationDays}</span>
                            : <span className="text-muted-foreground">0</span>}
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
          <div className={`max-w-[55%] truncate rounded-ctl border px-2 py-0.5 text-caption ${syncIndicator.className}`} title={syncIndicator.label}>
            {syncIndicator.label}
          </div>
        </div>
      </section>}

      {vistaModulo === 'turnos' && !isMobile && <section className="min-h-0 flex-1 rounded-card border bg-card p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Calendario Mantención</div>
          <div className="flex items-center gap-1">
            <button
              className="h-7 rounded-ctl border px-2 text-xs"
              onClick={() => setShowAllCols((p) => !p)}
            >
              {isMobile
                ? (showAllCols ? 'Ocultar meta' : 'Ver meta')
                : (showAllCols ? 'Ocultar CeCo/Cargo/Dirección/RUT' : 'Mostrar CeCo/Cargo/Dirección/RUT')}
            </button>
            <button
              className="h-7 rounded-ctl border px-2 text-xs disabled:opacity-50"
              onClick={scrollToToday}
              disabled={!todayDayCol}
            >
              Ir a hoy
            </button>
          </div>
        </div>
        {!isMobile && <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">Toca una celda para cambiar su turno.</div>
          <div className="flex items-center gap-1" title={`Historial de cambios (actualizado: ${historyVersion})`}>
            <button
              className="shrink-0 rounded-ctl border border-border bg-muted px-2 py-0.5 text-caption text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={undoStackRef.current.length === 0}
              onClick={() => undoRef.current()}
            >
              Deshacer{undoStackRef.current.length > 0 ? ` (${undoStackRef.current.length})` : ''}
            </button>
            <button
              className="shrink-0 rounded-ctl border border-border bg-muted px-2 py-0.5 text-caption text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={redoStackRef.current.length === 0}
              onClick={() => redoRef.current()}
            >
              Rehacer{redoStackRef.current.length > 0 ? ` (${redoStackRef.current.length})` : ''}
            </button>
          </div>
        </div>}
        <div ref={calendarSectionRef}>
        <div ref={calendarScrollRef} className="relative h-[calc(100%-2.5rem)] overflow-auto rounded-ctl border">
          <table className="border-collapse text-caption min-w-max">
            <thead>
              <tr className="bg-muted text-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head1-${META_COLS[gi]}`}
                    className="sticky top-0 z-[60] border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices, effectiveMetaWidths)}px`, minWidth: `${effectiveMetaWidths[gi]}px`, maxWidth: `${effectiveMetaWidths[gi]}px` }}
                  >
                    {gi === 0 ? <span className="text-muted-foreground text-caption tracking-wide">Planta</span> : ''}
                  </th>
                ))}
                {dayCols.map((d, idx) => (
                  <Fragment key={`day-wrap-${d.c}`}>
                  {isWeekStart(idx) ? (
                    <th
                      className="sticky top-0 z-20 border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none"
                      style={{ minWidth: '46px', maxWidth: '46px' }}
                    />
                  ) : null}
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
                      {isWeekStart(idx) ? <span className="rounded-ctl bg-cat-7-tint/[0.15] px-1 text-caption text-cat-7-ink">{weekNumberLabel(d.dateObj)}</span> : null}
                    </div>
                  </th>
                  </Fragment>
                ))}
              </tr>
              <tr className="bg-muted text-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head2-${META_COLS[gi]}`}
                    className="sticky top-[30px] z-[60] border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none text-muted-foreground text-caption tracking-wide"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices, effectiveMetaWidths)}px`, minWidth: `${effectiveMetaWidths[gi]}px`, maxWidth: `${effectiveMetaWidths[gi]}px` }}
                  >
                    {gi === 0 ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 rounded-ctl px-1 hover:bg-muted-foreground/[0.15]"
                        title={sortByTurno ? 'Agrupado por turno (A, B, C y el fijo al final). Click para ver el orden del Excel' : 'Orden del Excel. Click para agrupar por turno'}
                        onClick={() => setSortByTurno((v) => !v)}
                      >
                        {META_COLS[gi]}
                        <ChevronDown className={`h-3 w-3 transition-transform ${sortByTurno ? 'text-primary' : 'opacity-40'}`} />
                      </button>
                    ) : META_COLS[gi]}
                  </th>
                ))}
                {dayCols.map((d, idx) => (
                  <Fragment key={`date-wrap-${d.c}`}>
                  {isWeekStart(idx) ? (
                    <th
                      className="sticky top-[30px] z-20 border border-border !bg-muted bg-opacity-100 px-1 py-1 text-caption text-muted-foreground backdrop-blur-none"
                      style={{ minWidth: '46px', maxWidth: '46px' }}
                      title="Horas trabajadas por el técnico en esta semana"
                    >
                      h/sem
                    </th>
                  ) : null}
                  <th
                    key={`date-${d.c}`}
                    className={`sticky top-[30px] z-20 border border-border !bg-muted bg-opacity-100 px-1 py-1 backdrop-blur-none cursor-pointer text-foreground ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-4 border-b-2 border-amber-500/[0.25] font-semibold text-ink-warn shadow-[inset_0_0_0_1px_rgba(253,224,71,0.4)]' : ''} ${selectedCol === d.c ? 'ring-2 ring-white/80 ring-inset' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-400/60' : ''}`}
                    style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}
                    onClick={() => {
                      setSelectedCol(d.c)
                      selectCalendarDate(d)
                    }}
                  >
                    {formatDate(d.dateObj) || d.dateRaw}
                  </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayTechRows.map((tech, idx) => {
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
                          <span className={`inline-flex min-w-6 justify-center rounded-ctl border px-1.5 py-0.5 text-caption font-semibold ${turnoBadgeClass(String(metaValues[gi] || ''))}`}>
                            {metaValues[gi] || '-'}
                          </span>
                        ) : metaValues[gi]}
                      </td>
                    ))}
                    {dayCols.map((d, idx) => {
                      const value = tech.shifts[d.c] || ''
                      const isSelectedCell = selectedRow === tech.r && selectedCol === d.c
                      const cellStyle = shiftCellStyle(value)
                      const rest = restByCell.get(`${tech.r}-${d.c}`)
                      const tone = rest === undefined ? null : restTone(rest)
                      const wk = isWeekStart(idx) ? weekKeyAt(idx) : null
                      const wkHours = wk ? (weekHoursByCell.get(`${tech.r}-${wk}`) ?? 0) : null
                      const sobreTope = wkHours !== null && wkHours > expectedWeekBase + 0.01
                      return (
                        <Fragment key={`cellwrap-${tech.r}-${d.c}`}>
                        {wk ? (
                          <td
                            className={`border px-0.5 py-1 text-center text-caption font-semibold tabular-nums !bg-card ${sobreTope ? 'text-ink-warn' : 'text-muted-foreground'}`}
                            style={{ minWidth: '46px', maxWidth: '46px' }}
                            title={`${tech.name} · semana ${weekNumberLabel(d.dateObj)}: ${(wkHours ?? 0).toFixed(1)} h trabajadas · objetivo ${expectedWeekBase.toFixed(1)} h${sobreTope ? ` · ${((wkHours ?? 0) - expectedWeekBase).toFixed(1)} h por sobre el tope` : ''}`}
                          >
                            {(wkHours ?? 0) > 0 ? (wkHours ?? 0).toFixed(1) : ''}
                          </td>
                        ) : null}
                        <td
                          key={`shift-${tech.r}-${d.c}`}
                          className={`border px-1 py-1 text-center cursor-pointer ${cellStyle.className} ${isSelectedCell ? 'ring-2 ring-primary ring-inset shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]' : ''} ${selectedCol === d.c ? 'bg-muted-foreground/[0.10]' : ''} ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-4 border-amber-500/[0.25]' : ''} ${isWeekStart(idx) ? 'border-l-2 border-l-cyan-300/80' : ''}`}
                          style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px`, ...cellStyle.style }}
                          title={value || 'Sin turno'}
                          onClick={() => {
                            setSelectedRow(tech.r)
                            setSelectedCol(d.c)
                            selectCalendarDate(d)
                            abrirEditorDeCelda(tech, d)
                          }}
                        >
                          <span className="block leading-tight">{value}</span>
                          {tone && tone !== 'ok' ? (
                            <span
                              className={tone === 'malo'
                                ? 'mt-0.5 flex items-center justify-center gap-0.5 text-caption font-bold leading-none tabular-nums text-ink-crit'
                                : 'mt-0.5 flex items-center justify-center gap-0.5 text-caption leading-none tabular-nums text-ink-warn'}
                              title={tone === 'malo'
                                ? `Vuelta corta: solo ${rest} h de descanso desde el turno anterior, bajo el mínimo de 11 h`
                                : `Descanso justo: ${rest} h desde el turno anterior`}
                            >
                              {tone === 'malo' ? <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden /> : null}
                              {rest}h
                            </span>
                          ) : null}
                        </td>
                        </Fragment>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {/* Dotación por banda: el control de cobertura a la vista, sin abrir nada.
                  El domingo la noche no se cubre por regla de la planta: ahí un 0 no es alerta. */}
              <tr className="border-t-2 border-border">
                <td
                  colSpan={visibleMetaIndices.length}
                  className="sticky left-0 z-[35] !bg-muted px-2 py-1 text-caption font-semibold text-muted-foreground"
                >
                  Día · tarde · noche
                </td>
                {dayCols.map((d, idx) => {
                  const n = dotacionDelDia(d.c)
                  const esDomingo = d.dateObj?.getDay() === 0
                  return (
                    <Fragment key={`cob-${d.c}`}>
                      {isWeekStart(idx) ? <td className="bg-muted" style={{ minWidth: '46px', maxWidth: '46px' }} /> : null}
                      <td className="bg-muted px-0.5 py-1 text-center text-caption font-semibold tabular-nums">
                        {n.planificado ? (
                          <>
                            <span className={n.dia < 2 ? 'text-ink-crit' : 'text-brand-ink'}>{n.dia}</span>
                            <span className="text-muted-foreground"> · </span>
                            <span className={n.tarde < 2 ? 'text-ink-crit' : 'text-cat-4-ink'}>{n.tarde}</span>
                            <span className="text-muted-foreground"> · </span>
                            {esDomingo
                              ? <span className="text-muted-foreground" title="La noche del domingo no se cubre, por regla de la planta.">{n.noche > 0 ? n.noche : '–'}</span>
                              : <span className={n.noche < 2 ? 'text-ink-crit' : 'text-cat-6-ink'}>{n.noche}</span>}
                          </>
                        ) : (
                          <span className="font-normal text-muted-foreground" title="Día sin planificar todavía">—</span>
                        )}
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            </tfoot>
          </table>
        </div>
        </div>
      </section>}

      {/* Editor de horario de una celda (doble clic sobre ella) */}
      {celdaEditada && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-6"
          onClick={() => setCeldaEditada(null)}
        >
          <div className="w-full max-w-xs rounded-card border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-footnote font-semibold text-foreground">Horario de este día</p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {techRows.find((t) => t.r === celdaEditada.r)?.name ?? ''} · {dayLabelByCol(celdaEditada.c)}
            </p>
            {/* Un toque y listo: los turnos de siempre, sin memorizar letras. */}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {([
                { texto: shortcuts.dia, nombre: 'Día', cls: 'bg-primary/[0.15] text-brand-ink' },
                { texto: shortcuts.tarde, nombre: 'Tarde', cls: 'bg-cat-4-tint/[0.15] text-cat-4-ink' },
                { texto: shortcuts.noche, nombre: 'Noche', cls: 'bg-cat-6-tint/[0.15] text-cat-6-ink' },
                { texto: shortcuts.diaReducido, nombre: 'Día corto', cls: 'bg-primary/[0.15] text-brand-ink' },
                { texto: shortcuts.tardeReducido, nombre: 'Tarde corta', cls: 'bg-cat-4-tint/[0.15] text-cat-4-ink' },
                { texto: shortcuts.nocheReducido, nombre: 'Noche corta', cls: 'bg-cat-6-tint/[0.15] text-cat-6-ink' },
                { texto: shortcuts.libre, nombre: 'Libre', cls: 'bg-muted text-muted-foreground' },
                { texto: 'VACACIONES', nombre: 'Vacaciones', cls: 'bg-muted text-muted-foreground' },
                { texto: 'FERIADO', nombre: 'Feriado', cls: 'bg-muted text-muted-foreground' },
              ]).map(({ texto, nombre, cls }) => (
                <button
                  key={nombre}
                  className={`flex min-h-11 flex-col items-center justify-center rounded-ctl px-1 leading-tight active:opacity-70 ${cls}`}
                  onClick={() => {
                    applyShift(celdaEditada.r, celdaEditada.c, texto)
                    setCeldaEditada(null)
                  }}
                >
                  <span className="text-caption font-semibold">{nombre}</span>
                  {/\d/.test(texto) && <span className="text-caption tabular-nums opacity-70">{texto.replace(' - ', '–')}</span>}
                </button>
              ))}
            </div>
            <p className="mt-3 text-caption text-muted-foreground">O escribe otro horario:</p>
            <div className="mt-2 flex items-center gap-2">
              <label className="flex-1 grid gap-1">
                <span className="text-caption text-muted-foreground">Entra</span>
                <input
                  className={CONTROL_CLASS}
                  type="time"
                  value={horaDesde}
                  onChange={(e) => setHoraDesde(e.target.value)}
                />
              </label>
              <label className="flex-1 grid gap-1">
                <span className="text-caption text-muted-foreground">Sale</span>
                <input
                  className={CONTROL_CLASS}
                  type="time"
                  value={horaHasta}
                  onChange={(e) => setHoraHasta(e.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-caption text-muted-foreground tabular-nums">
              {horasDelEditor === null
                ? 'Horario incompleto'
                : `${horasDelEditor.toFixed(1)} h netas, descontando ${hoursConfig.breakHours} h de colación.`}
            </p>
            {avisosDelEditor.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {avisosDelEditor.map((a) => (
                  <li key={a} className={`flex items-start gap-1.5 text-caption ${/mínimo son 11|sobre el tope/.test(a) ? 'text-ink-crit' : 'text-ink-warn'}`}>
                    <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" aria-hidden />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex gap-2">
              <button
                className="h-9 flex-1 rounded-ctl border border-border text-footnote text-muted-foreground"
                onClick={() => setCeldaEditada(null)}
              >
                Cancelar
              </button>
              <button
                className="h-9 flex-1 rounded-ctl bg-primary text-footnote font-semibold text-primary-foreground disabled:opacity-40"
                disabled={horasDelEditor === null || horasDelEditor <= 0}
                onClick={guardarEditorDeCelda}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  )
}
