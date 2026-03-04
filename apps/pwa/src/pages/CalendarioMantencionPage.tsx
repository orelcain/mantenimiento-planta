import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'

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
}

const WEEKDAY_HEADER = new Set(['lunes', 'martes', 'miércoles', 'miercoles', 'jueves', 'viernes', 'sábado', 'sabado', 'domingo'])
const META_COLS = ['TURNO', 'Área', 'CeCo', 'Cargo', 'DIRECCIÓN', 'RUT', 'Personal']
const META_COL_WIDTHS = [56, 80, 100, 108, 98, 100, 220]
const HIDEABLE_COLS = new Set([2, 3, 4, 5]) // CeCo, Cargo, DIRECCIÓN, RUT
const LEGACY_PREVIOUS_DAYS = 7

type TabId = 'edicion' | 'plantillas' | 'horas' | 'tecnicos' | 'control'
const DAY_COL_WIDTH = 88
const HOURS_CONFIG_KEY = 'calendario_mantencion_hours_config_v1'
const SHIFT_CONFIG_KEY = 'calendario_mantencion_shift_config_v1'
const CONTROL_CLASS = 'h-8 rounded border border-border bg-background px-2 text-xs text-foreground [color-scheme:dark]'

function defaultHoursConfig(): HoursConfig {
  return {
    workHours: 8,
    breakHours: 0.5,
    expectedWeek: 45,
    expectedMonth: 180,
    toleranceHours: 0.5,
    useFixedDaily: true,
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
  const [originalFilename, setOriginalFilename] = useState('calendario-mantencion-base.xlsx')

  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [selectedCol, setSelectedCol] = useState<number | null>(null)
  const [selectedShift, setSelectedShift] = useState('')
  const [selectedWeek, setSelectedWeek] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
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

  const [hoursConfig, setHoursConfig] = useState<HoursConfig>(() => {
    const stored = safeStorageGet<HoursConfig>(HOURS_CONFIG_KEY, defaultHoursConfig())
    return {
      workHours: toNumberOr(stored.workHours, 8),
      breakHours: toNumberOr(stored.breakHours, 0.5),
      expectedWeek: toNumberOr(stored.expectedWeek, 45),
      expectedMonth: toNumberOr(stored.expectedMonth, 180),
      toleranceHours: toNumberOr(stored.toleranceHours, 0.5),
      useFixedDaily: stored.useFixedDaily !== false,
    }
  })

  const [shiftConfig, setShiftConfig] = useState<ShiftConfig>(() => {
    const stored = safeStorageGet<ShiftConfig>(SHIFT_CONFIG_KEY, defaultShiftConfig())
    return { ...defaultShiftConfig(), ...stored }
  })

  const loadWorkbookRef = useRef<(workbook: XLSX.WorkBook, filename: string) => void>(() => {})
  const applyShiftRef = useRef<(r: number, c: number, shift: string) => void>(() => {})
  const calendarScrollRef = useRef<HTMLDivElement | null>(null)

  const shortcuts = useMemo(() => {
    const dia = `${shiftConfig.diaInicio} - ${shiftConfig.diaFin}`
    const tarde = `${shiftConfig.tardeInicio} - ${shiftConfig.tardeFin}`
    const noche = `${shiftConfig.nocheInicio} - ${shiftConfig.nocheFin}`
    const libre = shiftConfig.libreLabel || 'LIBRE'
    return { dia, tarde, noche, libre }
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
    if (!selectedWeek) {
      const first = Object.keys(weeks)[0]
      if (first) setSelectedWeek(first)
    }
  }, [weeks, selectedWeek])

  useEffect(() => {
    if (!selectedMonth) {
      const first = Object.keys(months)[0]
      if (first) setSelectedMonth(first)
    }
  }, [months, selectedMonth])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!selectedRow || selectedCol === null) return
      const target = event.target as HTMLElement | null
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return

      const key = event.key.toLowerCase()
      if (!['d', 't', 'n', 'l'].includes(key)) return

      event.preventDefault()
      if (key === 'd') applyShiftRef.current(selectedRow, selectedCol, shortcuts.dia)
      if (key === 't') applyShiftRef.current(selectedRow, selectedCol, shortcuts.tarde)
      if (key === 'n') applyShiftRef.current(selectedRow, selectedCol, shortcuts.noche)
      if (key === 'l') applyShiftRef.current(selectedRow, selectedCol, shortcuts.libre)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedRow, selectedCol, shortcuts])

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
    const cols = normalizeLegacyTemplateDates(colsDetected, horarioSheet)
    const techs = detectTechnicians(horarioSheet, ref, cols)
    const catalog = readTurnosCatalog(workbook)

    setDayCols(cols)
    setTechRows(techs)
    setTurnosCatalog(Array.from(new Set([...catalog, 'LIBRE'])))

    const firstTech = techs[0]
    const firstDay = cols[0]
    if (firstTech) setSelectedRow(firstTech.r)
    if (firstDay) setSelectedCol(firstDay.c)
    if (firstTech && firstDay) setSelectedShift(firstTech.shifts[firstDay.c] || '')

    inferShiftConfig(catalog, techs)
    setStatus(`Plantilla cargada: ${filename}. Técnicos: ${techs.length}. Días: ${cols.length}. Fechas alineadas a calendario actual.`)
  }

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

    const startDate = getChileToday()
    startDate.setDate(startDate.getDate() - LEGACY_PREVIOUS_DAYS)
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

  function setCellValue(r: number, c: number, value: string) {
    if (!ws) return
    const currentRef = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
    if (r > currentRef.e.r || c > currentRef.e.c) {
      const nextRange = {
        s: currentRef.s,
        e: {
          r: Math.max(currentRef.e.r, r),
          c: Math.max(currentRef.e.c, c),
        },
      }
      ws['!ref'] = XLSX.utils.encode_range(nextRange)
    }

    const addr = XLSX.utils.encode_cell({ r, c })
    const current = ws[addr]
    if (!current) ws[addr] = { t: 's', v: value }
    else {
      current.t = 's'
      current.v = value
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

  function classifyShift(value: string): string {
    const v = value.toLowerCase()
    if (!v || v.includes('libre') || v.includes('descanso') || v.includes('vacaciones') || v.includes('licencia')) return 'bg-rose-100 text-rose-900 dark:bg-rose-900/25 dark:text-rose-200'
    if (v.includes(shiftConfig.diaInicio.toLowerCase()) || v.includes('08:00') || v.includes('07:00')) return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/25 dark:text-emerald-200'
    if (v.includes(shiftConfig.tardeInicio.toLowerCase()) || v.includes('16:00') || v.includes('14:00') || v.includes('13:00')) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/25 dark:text-amber-200'
    if (v.includes(shiftConfig.nocheInicio.toLowerCase()) || v.includes('00:00')) return 'bg-sky-100 text-sky-900 dark:bg-sky-900/25 dark:text-sky-200'
    return ''
  }

  function isWorkingShift(shiftText: string): boolean {
    const text = shiftText.trim().toLowerCase()
    if (!text) return false
    return !(text.includes('libre') || text.includes('descanso') || text.includes('vacaciones') || text.includes('licencia'))
  }

  function effectiveDailyHours(): number {
    return Math.max(0, hoursConfig.workHours - hoursConfig.breakHours)
  }

  function workedHoursForShift(shiftText: string): number {
    if (!isWorkingShift(shiftText)) return 0
    if (hoursConfig.useFixedDaily) return effectiveDailyHours()

    const m = shiftText.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
    if (!m) return effectiveDailyHours()
    const start = hhmmToMinutes(m[1] ?? '')
    const end = hhmmToMinutes(m[2] ?? '')
    if (start === null || end === null) return effectiveDailyHours()
    let diff = end - start
    if (diff <= 0) diff += 24 * 60
    return Math.max(0, diff / 60 - hoursConfig.breakHours)
  }

  const visibleMetaIndices = useMemo(() => {
    return META_COLS.map((_, i) => i).filter((i) => showAllCols || !HIDEABLE_COLS.has(i))
  }, [showAllCols])

  const weekDays = dayCols.filter((d) => d.dateObj && isoWeekKey(d.dateObj) === selectedWeek)
  const monthDays = dayCols.filter((d) => d.dateObj && monthKey(d.dateObj) === selectedMonth)
  const hoursRows = techRows.map((t) => {
    const weekHours = weekDays.reduce((sum, d) => sum + workedHoursForShift(t.shifts[d.c] || ''), 0)
    const monthHours = monthDays.reduce((sum, d) => sum + workedHoursForShift(t.shifts[d.c] || ''), 0)
    const deltaWeek = weekHours - hoursConfig.expectedWeek
    const deltaMonth = monthHours - hoursConfig.expectedMonth
    return {
      tech: t,
      weekHours,
      monthHours,
      deltaWeek,
      deltaMonth,
    }
  })

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
      expectedMonth: clampMin(toNumberOr(hoursConfig.expectedMonth, 180), 0),
      toleranceHours: clampMin(toNumberOr(hoursConfig.toleranceHours, 0.5), 0),
    }
    setHoursConfig(next)
    safeStorageSet(HOURS_CONFIG_KEY, next)
    setStatus(`Parámetros aplicados. Horas efectivas por día: ${effectiveDailyHours().toFixed(2)}h`)
  }

  function handleShiftConfigApply() {
    const next = {
      ...shiftConfig,
      libreLabel: (shiftConfig.libreLabel || 'LIBRE').trim().toUpperCase(),
    }
    setShiftConfig(next)
    safeStorageSet(SHIFT_CONFIG_KEY, next)
    setStatus('Plantillas de turno actualizadas. Atajos activos: D=Dia, T=Tarde, N=Noche, L=Libre.')
  }

  function handleFileUpload(file: File | null) {
    if (!file) return
    void file.arrayBuffer().then((data) => {
      const loaded = XLSX.read(data, { cellDates: true, cellStyles: true })
      loadWorkbook(loaded, file.name)
    })
  }

  function exportWorkbook() {
    if (!wb) return
    const outputName = originalFilename.replace(/\.xlsx$/i, '') + '_editado.xlsx'
    XLSX.writeFile(wb, outputName, { bookType: 'xlsx', compression: true })
    setStatus(`Archivo exportado: ${outputName}`)
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
        }
      })
      return { ...t, shifts: nextShifts }
    }))

    setStatus(`Vacaciones aplicadas a ${updated} día(s).`)
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
                {Array.from(new Set([...turnosCatalog, shortcuts.dia, shortcuts.tarde, shortcuts.noche, shortcuts.libre])).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-1">
                <button className="h-8 rounded bg-primary text-primary-foreground text-xs" onClick={handleAssignSelected}>Asignar</button>
                <button className="h-8 rounded border text-xs" onClick={exportWorkbook}>Exportar</button>
              </div>
              <div className="grid grid-cols-4 gap-1 text-[11px]">
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.dia)}>D</button>
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.tarde)}>T</button>
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.noche)}>N</button>
                <button className="h-7 rounded border" onClick={() => selectedRow && selectedCol !== null && applyShift(selectedRow, selectedCol, shortcuts.libre)}>L</button>
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
            <label className="text-muted-foreground self-center">Jornada (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.workHours} onChange={(e) => setHoursConfig((p) => ({ ...p, workHours: toNumberOr(e.target.value, p.workHours) }))} />
            <label className="text-muted-foreground self-center">Colación (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.breakHours} onChange={(e) => setHoursConfig((p) => ({ ...p, breakHours: toNumberOr(e.target.value, p.breakHours) }))} />
            <label className="text-muted-foreground self-center">Esperadas semana</label>
            <input className={CONTROL_CLASS} type="number" step="0.5" value={hoursConfig.expectedWeek} onChange={(e) => setHoursConfig((p) => ({ ...p, expectedWeek: toNumberOr(e.target.value, p.expectedWeek) }))} />
            <label className="text-muted-foreground self-center">Esperadas mes</label>
            <input className={CONTROL_CLASS} type="number" step="0.5" value={hoursConfig.expectedMonth} onChange={(e) => setHoursConfig((p) => ({ ...p, expectedMonth: toNumberOr(e.target.value, p.expectedMonth) }))} />
            <label className="text-muted-foreground self-center">Tolerancia (h)</label>
            <input className={CONTROL_CLASS} type="number" step="0.25" value={hoursConfig.toleranceHours} onChange={(e) => setHoursConfig((p) => ({ ...p, toleranceHours: toNumberOr(e.target.value, p.toleranceHours) }))} />
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={hoursConfig.useFixedDaily} onChange={(e) => setHoursConfig((p) => ({ ...p, useFixedDaily: e.target.checked }))} />
              Horas fijas por día trabajado
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
            <div className="rounded border">
              <table className="w-full text-[11px]">
                <thead className="bg-muted text-foreground sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-1 text-left">Técnico</th>
                    <th className="px-2 py-1 text-right w-16">Sem</th>
                    <th className="px-2 py-1 w-24">Δ Sem</th>
                    <th className="px-2 py-1 text-right w-16">Mes</th>
                    <th className="px-2 py-1 w-24">Δ Mes</th>
                  </tr>
                </thead>
                <tbody>
                  {hoursRows.map((row) => {
                    const pctW = pctBar(row.weekHours, hoursConfig.expectedWeek)
                    const pctM = pctBar(row.monthHours, hoursConfig.expectedMonth)
                    const barColorW = row.deltaWeek >= -hoursConfig.toleranceHours ? 'bg-emerald-500' : 'bg-red-500'
                    const barColorM = row.deltaMonth >= -hoursConfig.toleranceHours ? 'bg-emerald-500' : 'bg-red-500'
                    return (
                      <tr key={row.tech.r} className="border-t border-border hover:bg-muted/40 transition-colors">
                        <td className="px-2 py-1 text-left truncate max-w-[180px]" title={row.tech.name}>{row.tech.name}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.weekHours.toFixed(1)}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${barColorW} transition-all`} style={{ width: `${pctW}%` }} />
                            </div>
                            <span className={`text-[10px] w-8 text-right tabular-nums ${deltaClass(row.deltaWeek)}`}>{formatDelta(row.deltaWeek)}</span>
                          </div>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{row.monthHours.toFixed(1)}</td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${barColorM} transition-all`} style={{ width: `${pctM}%` }} />
                            </div>
                            <span className={`text-[10px] w-8 text-right tabular-nums ${deltaClass(row.deltaMonth)}`}>{formatDelta(row.deltaMonth)}</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-1">{status}</div>
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
        <div className="text-xs text-muted-foreground mb-1">Atajos sobre celda seleccionada: D = Día, T = Tarde, N = Noche, L = Libre.</div>
        <div ref={calendarScrollRef} className="relative h-[calc(100%-2.5rem)] overflow-auto rounded border">
          <table className="border-collapse text-[11px] min-w-max">
            <thead>
              <tr className="bg-primary text-primary-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head1-${META_COLS[gi]}`}
                    className="sticky top-0 z-[50] border border-primary/70 bg-primary px-1 py-1"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices)}px`, minWidth: `${META_COL_WIDTHS[gi]}px`, maxWidth: `${META_COL_WIDTHS[gi]}px` }}
                  >
                    {gi === 0 ? 'PLANTA' : ''}
                  </th>
                ))}
                {dayCols.map((d) => (
                  <th key={`day-${d.c}`} className={`sticky top-0 z-20 border border-primary/70 bg-primary px-1 py-1 ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-2 border-yellow-300' : ''}`} style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}>{d.dayLabel}</th>
                ))}
              </tr>
              <tr className="bg-primary text-primary-foreground">
                {visibleMetaIndices.map((gi, vi) => (
                  <th
                    key={`head2-${META_COLS[gi]}`}
                    className="sticky top-[30px] z-[50] border border-primary/70 bg-primary px-1 py-1"
                    style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices)}px`, minWidth: `${META_COL_WIDTHS[gi]}px`, maxWidth: `${META_COL_WIDTHS[gi]}px` }}
                  >
                    {META_COLS[gi]}
                  </th>
                ))}
                {dayCols.map((d) => (
                  <th key={`date-${d.c}`} className={`sticky top-[30px] z-20 border border-primary/70 bg-primary px-1 py-1 ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-2 border-b-2 border-yellow-300 font-semibold' : ''}`} style={{ minWidth: `${DAY_COL_WIDTH}px`, maxWidth: `${DAY_COL_WIDTH}px` }}>{formatDate(d.dateObj) || d.dateRaw}</th>
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
                        className="sticky z-[35] border bg-card px-1 py-1 text-left truncate text-foreground"
                        style={{ left: `${metaLeftFiltered(vi, visibleMetaIndices)}px`, minWidth: `${META_COL_WIDTHS[gi]}px`, maxWidth: `${META_COL_WIDTHS[gi]}px` }}
                        title={metaValues[gi]}
                      >
                        {metaValues[gi]}
                      </td>
                    ))}
                    {dayCols.map((d) => {
                      const value = tech.shifts[d.c] || ''
                      const isSelectedCell = selectedRow === tech.r && selectedCol === d.c
                      return (
                        <td
                          key={`shift-${tech.r}-${d.c}`}
                          className={`border px-1 py-1 text-center cursor-pointer ${classifyShift(value)} ${isSelectedCell ? 'ring-2 ring-primary ring-inset' : ''} ${isSameDate(d.dateObj, todayDayCol?.dateObj ?? null) ? 'border-x-2 border-yellow-300/80' : ''}`}
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
      </section>
    </div>
  )
}
