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
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { animate, stagger } from 'animejs'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, InfoTooltip } from '@/components/ui'
import { ChevronLeft, ChevronRight, Loader2, Clock, Eye, Trash2, AlertTriangle, Sun, Moon, Wrench, Tag, GitCompare, Activity } from 'lucide-react'
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
  buildDailySummaryId,
} from '@/services/grader/graderDailySummary.service'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'
import { parseFile, mergeParsedData } from '@/services/grader/graderExcelParser'
import { getCauseLabel } from '@/services/grader/graderMatrixP0Causes'
import {
  aggregatesFromStates,
  deserializeStateAggregates,
  maintenanceTotalsFromAggregates,
  paretoFromAggregates,
  type StateAggregate,
} from '@/services/grader/shoplogixStateAggregates'
import { resolveMonthShiftKeys } from '@/services/grader/slxMonthResolve'
import { BaaderTrendMultiChart } from '@/components/grader/UpstreamMachinesPanel'
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
import { loadShoplogixShift, listShoplogixShiftDocIdsForMonth, listShoplogixShiftParentsForMonth, subscribeShoplogixShiftAuto, getSlxShiftCandidates } from '@/services/shoplogix/shoplogixShift.service'
import type { MachineTrendPoint, ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'
import type { UpstreamMachineState } from '@/services/shoplogix/types'
import {
  getShiftDisplayDateKey,
  isMidnightShift,
  cfKeysForVisualDay,
  addDaysToDateKey,
  getShiftMeta,
  isSignificantCycleCount,
  isLowActivityCycleCount,
  isUnscheduledShift,
  SLX_LOW_ACTIVITY_THRESHOLD,
} from '@/services/grader/graderShiftDisplay'
import { MachineTrendMiniChart } from './UpstreamMachinesPanel'
import { getPlantLineConfig, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'
import { softenAccentHex } from '@/lib/softenColor'

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
  /**
   * Línea/planta activa. Determina qué datos Shoplogix cargar y si hay
   * datos Grader Excel disponibles.
   * Default: 'chonchi-eviscerado' (comportamiento original).
   */
  plantLineId?: PlantLineId
  /**
   * Emitido cuando cambian las stats mensuales de Shoplogix (mes o datos).
   * Null si no hay datos Shoplogix para el mes visible.
   */
  onSlxMonthStatsLoaded?: (stats: SlxMonthlyStats | null) => void
  /** Notifica al padre cuando el día seleccionado cambia ("YYYY-MM-DD" o null). */
  onDateSelect?: (dateKey: string | null) => void
  /** Si true, divide calendario y resumen en columnas 50/50 en lugar de 2/3-1/3. */
  equalColumns?: boolean
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

/** Vista activa del calendario: qué métrica muestra el valor principal de cada chip */
type CalendarView = 'piezas' | 'p0' | 'uptime'

/**
 * Wrapper tap+hover para chips pequeños del calendario que NO navegan (son
 * puramente informativos — primary/secondary/orphan de `ShiftChip` y el
 * footer "Total del día"). En desktop se abre con hover; en mobile/tablet
 * no hay hover así que se abre con tap (toggle) y se cierra tocando fuera —
 * mismo patrón que `ui/InfoTooltip.tsx`, pero el trigger es el chip entero
 * en vez de un ícono aparte, para no ocupar espacio extra en la celda.
 */
function ChipTooltip({
  content,
  children,
  className,
  hoverOnly = false,
}: {
  content: React.ReactNode
  children: React.ReactNode
  className?: string
  /**
   * true → el click NO togglea el tooltip (para chips que navegan al click:
   * en desktop informa el hover, en mobile el tap ejecuta la navegación).
   */
  hoverOnly?: boolean
}): JSX.Element {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  const position = useCallback(() => {
    const t = triggerRef.current
    const tip = tooltipRef.current
    if (!t || !tip) return
    const r = t.getBoundingClientRect()
    const tr = tip.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const gap = 6
    let top = r.bottom + gap
    if (top + tr.height > vh - 8) top = r.top - tr.height - gap
    const left = Math.min(vw - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2))
    setCoords({ top, left })
  }, [])

  useEffect(() => {
    if (!visible) return
    const raf = requestAnimationFrame(position)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [visible, position])

  useEffect(() => {
    if (!visible) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target)) return
      if (tooltipRef.current?.contains(target)) return
      setVisible(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [visible])

  return (
    <>
      <div
        ref={triggerRef}
        className={className}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={hoverOnly ? undefined : (e) => { e.stopPropagation(); setVisible((v) => !v) }}
      >
        {children}
      </div>
      {visible && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[9999] max-w-[260px] rounded bg-slate-900/95 text-slate-200 text-[10px] leading-[1.5] px-2 py-1.5 shadow-lg border border-slate-600/60 whitespace-pre-line"
          style={{ top: coords.top, left: coords.left }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  )
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
function ShiftChip({
  chip,
  untaggedCount,
  view,
  slxByShift,
}: {
  chip: ShiftChipDescriptor
  untaggedCount: number | null
  view: CalendarView
  slxByShift: Map<string, SlxShiftCache>
}): JSX.Element {
  // Label canónico del turno (D, N, T1, T2, T3, etc.) vía helper centralizado.
  const meta = getShiftMeta(chip.shiftId)
  const label = meta.shortLabel
  const p0 = chip.pointZeroPct
  const colorByP0 = p0 >= DEFAULT_P0_CRITICAL_PCT
    ? 'bg-red-500/18 text-red-600'
    : p0 >= DEFAULT_P0_ALERT_PCT
      ? 'bg-amber-500/18 text-amber-600'
      : 'bg-emerald-500/18 text-emerald-600'

  // Uptime% desde SLX para la vista Uptime (busca new-format primero, luego legacy)
  const slxUptimePct: number | null = (() => {
    const keys = chip.shiftId === 'Turno día'
      ? [`${chip.shiftDateKey}__Turno 2`, `${chip.shiftDateKey}__Turno día`]
      : [`${chip.shiftDateKey}__Turno 3`, `${chip.shiftDateKey}__Turno 1`, `${chip.shiftDateKey}__Turno noche`]
    for (const k of keys) {
      const v = slxByShift.get(k)?.avgShiftRuntime
      if (v != null) return v * 100
    }
    return null
  })()
  const colorByUptime = slxUptimePct == null
    ? 'bg-slate-500/15 text-slate-400'
    : slxUptimePct >= 70 ? 'bg-emerald-500/18 text-emerald-600'
    : slxUptimePct >= 40 ? 'bg-amber-500/18 text-amber-600'
    : 'bg-red-500/18 text-red-600'

  const activeColor = view === 'uptime' ? colorByUptime : colorByP0

  if (chip.role === 'orphan-source') {
    // Turno programado sin actividad real en este día — toda la carga fue al día siguiente.
    // Se muestra como indicador mínimo sin caja, para no ocupar espacio ni confundir.
    const targetDay = chip.primaryDateKey?.slice(8) ?? '--'
    return (
      <ChipTooltip
        content={`${chip.shiftId} sin actividad este día — el turno continuó en día ${targetDay}`}
        className="flex items-center justify-end leading-none opacity-30 cursor-help"
      >
        <span style={{ height: '11px' }} className="flex items-center text-[7px] text-muted-foreground tabular-nums">↷ {targetDay}</span>
      </ChipTooltip>
    )
  }

  if (chip.role === 'secondary') {
    // Turno que CRUZA a mañana: la madrugada del día siguiente tiene la carga real.
    // Se muestra como indicador de "sale hacia mañana" (→) en lugar de valor numérico
    // para no confundirse con P0% o piezas. Oculto en mobile.
    const pct = chip.pctOfShift != null ? Math.round(chip.pctOfShift) : 0
    return (
      <ChipTooltip
        content={`${chip.shiftId} ${chip.shiftDateKey} — solo ${pct}% de la carga fue hoy; el resto continúa mañana como Madrugada (P0% del turno completo: ${p0.toFixed(1)}%)`}
        className={cn(
          'hidden sm:flex items-center justify-between rounded-sm px-1 leading-none opacity-40 hover:opacity-70 transition-opacity border border-dashed cursor-help',
          activeColor,
        )}
      >
        <span style={{ paddingTop: 0, paddingBottom: 0, height: '13px', borderColor: 'currentColor' }} className="flex items-center justify-between w-full">
          <span className="text-[8px] font-medium">{label}</span>
          <span className="text-[8px]">→</span>
        </span>
      </ChipTooltip>
    )
  }

  // role === 'primary' — valor principal según vista
  const chipValue =
    view === 'piezas'
      ? (chip.pieces != null
          ? (chip.pointZeroPieces != null
              ? (chip.pieces - chip.pointZeroPieces).toLocaleString('es-CL')
              : chip.pieces.toLocaleString('es-CL'))
          : '—')
      : view === 'uptime'
        ? (slxUptimePct != null ? `${slxUptimePct.toFixed(0)}%` : '—')
        : `${p0.toFixed(1)}%`

  // Tooltip enriquecido: identifica la fuente (Marelec/Excel), la métrica
  // visible y los valores adicionales relevantes. Importante en plantas
  // mixtas (Yal) donde la celda puede mostrar 2 chips simultáneos:
  // chip Excel arriba (piezas clasificadas Marelec) y chip SLX abajo
  // (ciclos Baader Shoplogix).
  const piecesText = chip.pieces != null ? chip.pieces.toLocaleString('es-CL') : '—'
  const p0Text = `${p0.toFixed(1)}%`
  const uptimeText = slxUptimePct != null ? `${slxUptimePct.toFixed(0)}%` : '—'
  const directionSuffix = chip.direction === 'enters'
    ? ` (madrugada — turno arrancó ${chip.shiftDateKey})`
    : chip.direction === 'exits'
      ? ` (${Math.round(chip.pctOfShift ?? 100)}% de la carga aquí, resto mañana)`
      : ''
  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-semibold text-[11px] text-white">{`${chip.shiftId}${directionSuffix}`}</div>
      <div>{`• ${piecesText} piezas clasificadas (Marelec/Excel)`}</div>
      <div>{`• P0: ${p0Text}`}</div>
      {slxUptimePct != null && <div>{`• Uptime Baader: ${uptimeText} (Shoplogix)`}</div>}
    </div>
  )

  return (
    <ChipTooltip
      content={tooltipContent}
      className={cn('flex items-center justify-between rounded px-1 py-px leading-none cursor-help', activeColor)}
    >
      <span className="text-[8px] font-medium opacity-70">{label}</span>
      <span className="text-[9px] font-bold tabular-nums">{chipValue}</span>
      {untaggedCount !== null && untaggedCount > 0 && (
        <span className="ml-0.5 text-[7px] leading-none px-0.5 rounded bg-amber-500/25 text-amber-600 font-semibold">
          🏷{untaggedCount}
        </span>
      )}
    </ChipTooltip>
  )
}

/**
 * Tipo de card según el shift que representa, anclado al día de INICIO del shift
 * (no al día calendar de las piezas). Cada calendar day muestra hasta 2 cards
 * principales (Día + Noche) + opcional Salida (orphan).
 *
 * - `dia`: Turno día completo (07-19 del día seleccionado). direction='same' + shiftId='Turno día'.
 * - `noche`: Turno noche que ARRANCA este día (19 del día → 07 del siguiente).
 *   Incluye los `exits` (cruza medianoche, lo común) y `same`+shiftId='Turno noche'
 *   (raro, terminó antes de medianoche). El "Madrugada" del día siguiente es la
 *   continuación de este card — se ve en el timeline 24h calendar pero no se
 *   duplica como card separada.
 * - `salida`: turno noche programado en este día sin actividad real (ej. Domingos en
 *   Feb 2026). Strip compacto que invita a deslizar al primaryDateKey.
 *
 * - `madrugada`: cola de turno noche del día anterior (`direction='enters'`). Card completa,
 *   ordenada primera (00:00–06:00). Los datos completos del turno noche se ven aquí.
 * - `salida`: turno noche que ARRANCA en este día y continúa mañana (`direction='exits'`).
 *   Strip compacto que invita a ver el día siguiente donde aparece como Madrugada.
 */
type CardKind = 'madrugada' | 'dia' | 'noche' | 'salida'

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
 * Convierte los entries del día seleccionado en cards anclados al día de INICIO
 * del shift. Filtra:
 *  - `direction='enters'`: madrugada del día actual = continuación del Noche
 *    del día anterior. Pertenece al card de ayer, no al de hoy.
 *
 * Resultado: máximo 2 cards principales por día (Día + Noche) + opcional Salida.
 */
function enrichEntriesByKind(
  entries: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>,
): EnrichedCardEntry[] {
  return entries
    .map(({ summary, chip }): EnrichedCardEntry => {
      let kind: CardKind
      let sortMin: number
      let fragSuffix: string

      if (chip?.role === 'orphan-source') {
        // Turno noche programado sin actividad real aquí (placeholder)
        kind = 'salida'
        sortMin = 99999
        fragSuffix = 'sal'
      } else if (chip?.direction === 'enters') {
        // Cola del turno noche de ayer — se muestra como Madrugada (00:00–endAt)
        kind = 'madrugada'
        sortMin = 0
        fragSuffix = 'mad'
      } else if (chip?.direction === 'exits') {
        // Turno noche que arranca aquí y continúa mañana — strip compacto
        kind = 'salida'
        sortMin = 99999
        fragSuffix = 'sal'
      } else if (
        (chip?.direction === 'same' && summary.shiftId === 'Turno noche') ||
        (!chip && (summary.shiftId === 'Turno noche' || summary.shiftId === 'Turno 3'))
      ) {
        kind = 'noche'
        sortMin = getStartMinutesUTC(summary.startAt) ?? 21 * 60
        fragSuffix = 'noc'
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
          hour12: false,   // 00:00, no "12:00 a. m." (es-CL default es 12h)
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
  madrugada: { icon: '🌙→', title: 'Madrugada' },
  dia:       { icon: '☀',   title: 'Día' },
  noche:     { icon: '🌙',  title: 'Noche' },
  salida:    { icon: '🌙',  title: 'Turno noche' },
}

/** "HH:MM" de un Date wall-clock-as-UTC. */
function fmtWallHHMM(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** "Ahora" en hora Chile expresada como wall-clock-as-UTC (convención del proyecto). */
function chileNowAsWallUTC(): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
}

/**
 * ¿El fin real (effectiveEnd) del turno está CONFIRMADO?
 *
 * Mientras el turno está vivo, effectiveEnd avanza con cada sync (5 min) — el
 * "último pescado" de ahora no es el final del turno. Regla ("10 min de
 * chance" pedidos por Orel, con margen por la cadencia del sync):
 *
 *   confirmado ⇔ el doc dejó de sincronizarse (>30 min UTC real — turno de
 *   otro día) O pasaron ≥12 min de reloj Chile desde el último pescado SIN
 *   que la ventana avanzara (sync sigue corriendo cada 5 min: si no avanzó,
 *   Shoplogix ya anotó el cierre — cuota, planned downtime, etc.).
 *
 * lastSyncAt es UTC real y effectiveEnd wall-clock-as-UTC — NUNCA compararlos
 * entre sí; cada uno contra su propio "ahora".
 */
function isEffectiveEndConfirmed(cache: SlxShiftCache): boolean {
  if (!cache.effectiveEnd) return false
  const syncAgeMs = cache.lastSyncAt ? Date.now() - cache.lastSyncAt.getTime() : Infinity
  if (syncAgeMs > 30 * 60_000) return true
  return chileNowAsWallUTC() - cache.effectiveEnd.getTime() >= 12 * 60_000
}

/**
 * Contenido de tooltip ESTÁNDAR de un turno Shoplogix — mismo formato para los
 * chips por turno y para las secciones del Σ 24h (pedido de Orel 2026-07-21:
 * un solo estilo). Estructura:
 *
 *   T2 · 19.277 ciclos (Shoplogix)
 *   Programado: 14:45 → 00:00      ← plantilla OFICIAL (no crece con el sync)
 *   Real: 15:11 → 23:58 | comprobando…   ← primer→último pescado
 *   Uso máquinas: 7h 23m (84%)      ← tiempo de producción REAL
 *     · Ev 1  2h 27m (83%) …        ← desglose por Baader
 */
function SlxTurnoTooltipBody({
  cache,
  shiftId,
  cycles,
  title,
}: {
  cache: SlxShiftCache | undefined
  shiftId: string
  cycles: number
  title?: string
}): JSX.Element {
  const label = getShiftMeta(shiftId).shortLabel
  const progStart = cache?.officialStart ?? cache?.scheduledStart ?? null
  const progEnd   = cache?.officialEnd   ?? cache?.scheduledEnd   ?? null
  const effStart  = cache?.effectiveStart ?? null
  const effEnd    = cache?.effectiveEnd ?? null
  const endConfirmed = cache ? isEffectiveEndConfirmed(cache) : false

  // Uso por máquina: uptime de cada Baader vs la ventana real del turno.
  const spanSec = effStart && effEnd
    ? Math.max(0, (effEnd.getTime() - effStart.getTime()) / 1000)
    : progStart && progEnd
      ? Math.max(0, (progEnd.getTime() - progStart.getTime()) / 1000)
      : 0
  const machines = (cache?.perMachine ?? []).filter((m) => m.uptimeSec > 0 || m.totalCycles > 0)
  const avgUseSec = machines.length > 0
    ? machines.reduce((a, m) => a + m.uptimeSec, 0) / machines.length
    : 0

  // Texto plano compacto con RESALTADOS tipo destacador de apuntes (pedido
  // Orel): banda translúcida detrás de los datos clave para dirigir la vista.
  // Tonos −50% croma del design system (/antarfood-design-system), nunca los
  // brillantes: success #6c9a8a · warning #ac966e · destructive #b2807f.
  const HL = { ok: '#6c9a8a', mid: '#ac966e', bad: '#b2807f' } as const
  const mark = (hex: string): React.CSSProperties => ({
    backgroundColor: `${hex}38`,
    color: hex,
    borderRadius: '3px',
    padding: '0 3px',
  })
  // Ranking de Baaders por tiempo de uso: mejor→verde, medio→ámbar, peor→rojo.
  const ranked = [...machines].sort((a, b) => b.uptimeSec - a.uptimeSec)
  const rankColor = (machineid: string): string | null => {
    if (ranked.length < 2) return null
    const idx = ranked.findIndex((m) => m.machineid === machineid)
    if (idx === 0) return HL.ok
    if (idx === ranked.length - 1) return HL.bad
    return HL.mid
  }

  const endTxt = !effEnd
    ? 'comprobando…'
    : endConfirmed ? fmtWallHHMM(effEnd) : `${fmtWallHHMM(effEnd)} (comprobando…)`

  return (
    <>
      <div>
        {title ?? (
          <>
            {label} · <span className="font-mono tabular-nums font-semibold" style={mark(HL.ok)}>{cycles.toLocaleString('es-CL')} ciclos</span> (Shoplogix)
          </>
        )}
      </div>
      {progStart && progEnd && (
        <div>{`Programado: ${fmtWallHHMM(progStart)} → ${fmtWallHHMM(progEnd)}`}</div>
      )}
      {effStart && <div>{`Real: ${fmtWallHHMM(effStart)} → ${endTxt}`}</div>}
      {avgUseSec > 0 && (
        <div>{`Uso máquinas: ${fmtSecPanoramic(avgUseSec)}${spanSec > 0 ? ` (${Math.round((avgUseSec / spanSec) * 100)}% del turno real)` : ''}`}</div>
      )}
      {machines.length > 1 && ranked.map((m) => {
        const hex = rankColor(m.machineid)
        const valTxt = `${fmtSecPanoramic(m.uptimeSec)}${spanSec > 0 ? ` (${Math.round((m.uptimeSec / spanSec) * 100)}%)` : ''}`
        return (
          <div key={m.machineid}>
            {`  · ${m.name || m.machineid}: `}
            <span className="font-mono tabular-nums" style={hex ? mark(hex) : undefined}>{valTxt}</span>
          </div>
        )
      })}
    </>
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

/** Formatea segundos en forma compacta. Usado en el panel panorámico mensual
 *  y en GraderMonthlyStatsPanel (contador de horas fuera de turno). */
export function fmtSecPanoramic(sec: number): string {
  if (sec <= 0) return '0s'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`
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
  /** Para click → navigate al TurnoPage (#31) */
  summaryId: string
  dateKey: string
  shiftId: string
  /** Para hover-sync con la card del día (#32). Mismo formato que `EnrichedCardEntry.fragId`. */
  fragId: string
  /** Hora de inicio efectiva del turno (HH:mm) — basada en Shoplogix si disponible */
  startTimeStr: string
  /** Hora de fin efectiva del turno (HH:mm) — basada en Shoplogix si disponible */
  endTimeStr: string
  /** P0% del turno — null para bloques Shoplogix-only (sin Grader) */
  p0Pct: number | null
  /** true → bloque generado desde Shoplogix sin graderDailySummary (Yal sin Excel) */
  isShoplogixOnly?: boolean
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
  slxData?: Map<string, SlxShiftCache>,
  slideKey?: string,  // dateKey del slide — necesario para bloques Shoplogix standalone
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
      startFrac = 0
      endFrac   = endMin / 1440
    } else if (direction === 'exits') {
      startFrac = startMin / 1440
      endFrac   = 1
    } else {
      startFrac = startMin / 1440
      // Turno que termina exactamente al cruzar medianoche (ej. Yal Turno 2
      // con scheduledEnd=00:00 del día siguiente): getUTCHours()*60+getUTCMinutes()
      // da 0, indistinguible de "inicio de día" — sin este chequeo por día
      // calendario completo, el fallback de abajo colapsaba el bloque a un
      // tramo de ~2% de ancho en vez de estirarlo hasta el borde derecho.
      const startDay = Math.floor(startD.getTime() / 86_400_000)
      const endDay   = Math.floor(endD.getTime()   / 86_400_000)
      endFrac = endDay > startDay ? 1 : endMin / 1440
      if (endFrac <= startFrac) endFrac = Math.min(1, startFrac + 0.02)
    }

    // Refinar posición con Shoplogix efectivo (cuando disponible).
    // Esto muestra gaps reales: ej. si Shoplogix dice activo 09:00–17:27
    // pero hist.startAt = 07:00, el bloque D arranca en 09:00 (gap visible).
    //
    // Para cards virtuales (buildSlxVirtualSummaries), `hist.id` viene con el
    // prefijo `slx-virtual:` pero `slxData` (= slxByShift) se llavea por el
    // mapKey `${dateKey}__${shiftId}` SIN ese prefijo — el lookup fallaba
    // siempre para virtuales y el recorte a ventana efectiva nunca corría
    // (bug real: el bloque "Unscheduled" pintaba 04:00→04:00, 24h enteras,
    // en vez de recortarse a su actividad real).
    const SLX_VIRTUAL_PREFIX = 'slx-virtual:'
    const slxLookupKey = hist.id.startsWith(SLX_VIRTUAL_PREFIX) ? hist.id.slice(SLX_VIRTUAL_PREFIX.length) : hist.id
    const slxCacheForBlock = slxData?.get(slxLookupKey)
    if (slxCacheForBlock?.shiftStart && slxCacheForBlock?.shiftEnd && slxCacheForBlock.states.length > 0) {
      const gS = hist.startAt ? new Date(hist.startAt).getTime() : null
      const gE = hist.endAt   ? new Date(hist.endAt).getTime()   : null
      const qS = gS != null ? Math.max(slxCacheForBlock.shiftStart.getTime(), gS) : slxCacheForBlock.shiftStart.getTime()
      const qE = gE != null ? Math.min(slxCacheForBlock.shiftEnd.getTime(),   gE) : slxCacheForBlock.shiftEnd.getTime()
      const eff = computeEffectiveWindow(slxCacheForBlock.states, qS, qE)
      if (eff) {
        const effStart = new Date(eff.startMs)
        const effEnd   = new Date(eff.endMs)
        const effStartMin = effStart.getUTCHours() * 60 + effStart.getUTCMinutes()
        const effEndMin   = effEnd.getUTCHours()   * 60 + effEnd.getUTCMinutes()
        if (direction === 'same') {
          startFrac = effStartMin / 1440
          // Mismo chequeo por día calendario que en el cálculo base: un fin
          // efectivo exactamente a medianoche del día siguiente da effEndMin=0
          // (indistinguible de "inicio de día") si no se compara la fecha completa.
          const effStartDay = Math.floor(effStart.getTime() / 86_400_000)
          const effEndDay   = Math.floor(effEnd.getTime()   / 86_400_000)
          endFrac = effEndDay > effStartDay ? 1 : effEndMin / 1440
        } else if (direction === 'enters') {
          endFrac = Math.min(effEndMin / 1440, 1)
        } else if (direction === 'exits') {
          startFrac = Math.max(effStartMin / 1440, 0)
        }
        if (endFrac <= startFrac) endFrac = Math.min(1, startFrac + 0.02)
      }
    }

    // "Unscheduled" no es un turno real (no tiene P0% ni Excel asociado): el
    // status P0 siempre daba 'ok' (pointZeroPct=0 por defecto) y pintaba el
    // bloque VERDE como si fuera un turno saludable. Se pinta neutro (slate,
    // igual paleta que su SHIFT_META_TABLE) y nunca se calcula P0 sobre él.
    const isUnscheduledBlock = isUnscheduledShift(hist.shiftId)
    const status = isUnscheduledBlock ? null : p0StatusFromPct(hist.pointZeroPct)
    const bgClass = isUnscheduledBlock
      ? 'bg-slate-500/45'
      : status === 'ok'    ? 'bg-emerald-500/65' :
        status === 'alert' ? 'bg-amber-500/65'   :
                             'bg-rose-500/65'

    // Etiqueta del bloque = shiftId real de Shoplogix, no convención
    // inventada (D/N). Para Turno día/noche dejamos D/N por compat con
    // Chonchi; para T1/T2/T3 mostramos el número tal cual. "Unscheduled" usa
    // su shortLabel amigable ("S/T") en vez del string crudo de Shoplogix.
    const base =
      hist.shiftId === 'Turno día'   ? 'D'  :
      hist.shiftId === 'Turno noche' ? 'N'  :
      hist.shiftId === 'Turno 1'     ? 'T1' :
      hist.shiftId === 'Turno 2'     ? 'T2' :
      hist.shiftId === 'Turno 3'     ? 'T3' :
      isUnscheduledBlock             ? getShiftMeta(hist.shiftId).shortLabel :
      hist.shiftId
    const label =
      direction === 'enters' ? `→${base}` :
      direction === 'exits'  ? `${base}→` :
      base

    const pad = (n: number) => String(n).padStart(2, '0')
    // Timestamps efectivos — derivados de startFrac/endFrac (que ya incorporan Shoplogix)
    const fracToHHMM = (frac: number) => {
      const totalMin = Math.round(Math.max(0, Math.min(1, frac)) * 1440)
      return `${pad(Math.floor(totalMin / 60) % 24)}:${pad(totalMin % 60)}`
    }
    const startTimeStr = fracToHHMM(startFrac)
    const endTimeStr   = fracToHHMM(endFrac)
    const ts = `${startTimeStr}–${endTimeStr}`
    const pct = chip?.pctOfShift != null ? ` · ${Math.round(chip.pctOfShift)}% en este día` : ''
    // fragSuffix en paridad con EnrichedCardEntry.fragId para sync hover (#32):
    //   enters → 'mad' (Madrugada card en este día)
    //   exits  → 'sal' (strip compacto en este día)
    //   same noche → 'noc', same día → 'dia'
    const fragSuffix =
      direction === 'enters' ? 'mad' :
      direction === 'exits'  ? 'sal' :
      hist.shiftId === 'Turno noche' ? 'noc' : 'dia'
    blocks.push({
      leftPct:  startFrac * 100,
      widthPct: (endFrac - startFrac) * 100,
      bgClass, label,
      title: isUnscheduledBlock
        ? `${getShiftMeta(hist.shiftId).label} · ${hist.totalPieces.toLocaleString('es-CL')} ciclos · ${ts}${pct}`
        : `${hist.shiftId} · P0 ${hist.pointZeroPct.toFixed(2)}% · ${ts}${pct}`,
      nightSide: direction === 'enters' ? 'start' : direction === 'exits' ? 'end' : null,
      summaryId: hist.id,
      dateKey: hist.dateKey,
      shiftId: hist.shiftId,
      fragId: `${hist.id}-${fragSuffix}`,
      startTimeStr,
      endTimeStr,
      p0Pct: hist.pointZeroPct,
    })
  }
  // ── Shoplogix standalone blocks ────────────────────────────────────────────
  // Cuando no hay ningún graderDailySummary para este slide (p.ej. Yal sin Excel
  // cargado) pero sí hay datos Shoplogix, mostramos la ventana real del turno
  // como bloque neutro (sky/azul, sin P0%, no navegable).
  //
  // Iteramos TODOS los shifts del Map que correspondan a este día, sin hardcodear
  // nombres. Así funciona con Turno 1/2/3 (nuevo syncDay) y Turno día/noche (legado).
  //
  // Usamos scheduledStart/End (horario real derivado de intervals.shift en syncDay).
  // Para docs legacy: scheduledStart/End coinciden con shiftStart/End (bounds de consulta),
  // que pueden ser incorrectos — pero eso ya es dato viejo que se irá reemplazando.
  if (blocks.length === 0 && slideKey && slxData) {
    const pad2 = (n: number) => String(n).padStart(2, '0')
    // Día calendárico: 00:00 → 24:00 del slideKey (alineado con Shoplogix UI).
    // El Turno 3 cuya CF dateKey = slideKey-1 tiene horas reales 00:00-07:45 del
    // slideKey y aparece al inicio del timeline (no al final).
    const dayStartMs = new Date(`${slideKey}T00:00:00Z`).getTime()
    const dayEndMs   = dayStartMs + 86_400_000
    const fracToHHMM = (frac: number) => {
      const d = new Date(dayStartMs + Math.max(0, Math.min(1, frac)) * 86_400_000)
      return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
    }
    const MIN_VALID_TS = 86_400_000

    // Recolectar shifts del DÍA VISUAL slideKey:
    //   - T1, T2, Turno día/noche con dateKey CF = slideKey
    //   - Turno 3 con dateKey CF = slideKey-1 (madrugada del slideKey)
    interface VisualShiftRef { shiftId: string; cfDateKey: string; mapKey: string }
    const visualShifts: VisualShiftRef[] = []
    for (const [mapKey, slx] of slxData.entries()) {
      // Antes filtraba con `=== 0` (cualquier ciclo >0 pasaba): un turno con
      // 1-49 ciclos (ruido — ver SLX_NOISE_THRESHOLD) pintaba igual un bloque
      // de día completo y clicable, mismo problema que en el resto del módulo
      // (Unscheduled con pocos ciclos era el caso más visible, pero el filtro
      // débil aplicaba a cualquier shiftId).
      if (!isSignificantCycleCount(slx.totalCycles)) continue
      const sepIdx = mapKey.indexOf('__')
      if (sepIdx < 0) continue
      const cfDateKey = mapKey.slice(0, sepIdx)
      const shiftId   = mapKey.slice(sepIdx + 2)
      const visualDay = isMidnightShift(shiftId, cfDateKey) ? addDaysToDateKey(cfDateKey, 1) : cfDateKey
      if (visualDay !== slideKey) continue
      visualShifts.push({ shiftId, cfDateKey, mapKey })
    }

    // De-duplicar: si existen docs nuevo formato (Turno 1/2/3) Y legado
    // (Turno día/noche) para el mismo día visual, preferir el nuevo.
    const visualShiftIds = new Set(visualShifts.map(v => v.shiftId))
    // 'Turno 1' cuenta como "día nuevo" además de 'Turno 2': el alias legacy
    // 'Turno día' de Yal resuelve primero a 'Turno 1' (ver getSlxShiftCandidates),
    // así que sin incluirlo un día con solo T1 (madrugada) dejaría pasar el alias.
    const hasNewDay   = visualShiftIds.has('Turno 2') || visualShiftIds.has('Turno 1')
    const hasNewNight = visualShiftIds.has('Turno 1') || visualShiftIds.has('Turno 3')

    // Colores por turno (orden cronológico calendárico):
    const shiftBg: Record<string, string> = {
      'Turno 3':    'bg-teal-500/40',     // 00:00-07:45 madrugada
      'Turno 1':    'bg-indigo-500/40',   // 07:45-14:45 día
      'Turno 2':    'bg-amber-500/40',    // 14:45-00:00 tarde-noche
      'Turno día':  'bg-amber-500/40',    // legado día
      'Turno noche':'bg-indigo-500/40',   // legado noche
    }

    // Recolectar bloques con datos válidos
    const dayShifts: Array<{ shiftId: string; cfDateKey: string; startMs: number; endMs: number; isGhost?: boolean }> = []
    for (const v of visualShifts) {
      // Saltar legado si existe equivalente nuevo
      if (v.shiftId === 'Turno día'   && hasNewDay)   continue
      if (v.shiftId === 'Turno noche' && hasNewNight) continue

      const slx = slxData.get(v.mapKey)
      if (!slx) continue

      // Preferir scheduledStart/End (real de Shoplogix) sobre states
      const ssOk = slx.scheduledStart !== null && (slx.scheduledStart?.getTime() ?? 0) > MIN_VALID_TS
      const seOk = slx.scheduledEnd   !== null && (slx.scheduledEnd?.getTime()   ?? 0) > MIN_VALID_TS
      let startMs: number, endMs: number

      if (ssOk && seOk) {
        startMs = slx.scheduledStart!.getTime()
        endMs   = slx.scheduledEnd!.getTime()
      } else {
        // Fallback: derivar desde states
        if (slx.states.length === 0) continue
        const eff = computeEffectiveWindow(slx.states, dayStartMs, dayEndMs)
        if (!eff) continue
        startMs = eff.startMs
        endMs   = eff.endMs
      }

      dayShifts.push({ shiftId: v.shiftId, cfDateKey: v.cfDateKey, startMs, endMs })
    }

    // Ordenar por inicio
    dayShifts.sort((a, b) => a.startMs - b.startMs)

    // Ghost block: si existen T2 y T3 pero T1 está vacío,
    // añadir un fantasma entre el fin del T3 (madrugada) y el inicio del T2 (tarde).
    const hasTurno2 = dayShifts.some(s => s.shiftId === 'Turno 2')
    const hasTurno1 = dayShifts.some(s => s.shiftId === 'Turno 1')
    if (hasTurno2 && !hasTurno1) {
      const turno2 = dayShifts.find(s => s.shiftId === 'Turno 2')!
      const turno3 = dayShifts.find(s => s.shiftId === 'Turno 3')
      const ghostStart = turno3 ? turno3.endMs : dayStartMs
      if (turno2.startMs - ghostStart > 15 * 60_000) {
        dayShifts.push({
          shiftId: 'Turno 1',
          cfDateKey: slideKey,
          startMs: ghostStart,
          endMs: turno2.startMs,
          isGhost: true,
        })
        dayShifts.sort((a, b) => a.startMs - b.startMs)
      }
    }

    for (const shift of dayShifts) {
      // Clamp al día visible (00:00-24:00)
      const visStart = Math.max(shift.startMs, dayStartMs)
      const visEnd   = Math.min(shift.endMs,   dayEndMs)
      if (visEnd <= visStart) continue

      const startFrac = (visStart - dayStartMs) / 86_400_000
      let endFrac     = (visEnd   - dayStartMs) / 86_400_000
      // Si el turno termina exactamente en medianoche → endFrac = 1
      if (shift.endMs >= dayEndMs - 1) endFrac = 1
      if (endFrac <= startFrac) endFrac = Math.min(1, startFrac + 0.02)

      const label = shift.shiftId

      const ts = `${fracToHHMM(startFrac)}–${fracToHHMM(endFrac)}`
      // Madrugada (T3, Turno noche que arranca a las 0): nightSide='start'
      // Vespertina (T2 que termina en 24): nightSide='end'
      const nightSide: 'start' | 'end' | null =
        shift.shiftId === 'Turno 3' || (shift.shiftId === 'Turno noche' && startFrac === 0)
          ? 'start'
          : (shift.shiftId === 'Turno 2' || shift.shiftId === 'Turno noche') && endFrac >= 0.999
            ? 'end'
            : null

      const baseBg = shiftBg[shift.shiftId] ?? 'bg-sky-500/40'
      const bgClass = shift.isGhost
        ? baseBg.replace('/40', '/15') + ' border border-dashed border-current opacity-60'
        : baseBg

      blocks.push({
        leftPct:      startFrac * 100,
        widthPct:     (endFrac - startFrac) * 100,
        bgClass,
        label,
        title:        shift.isGhost
          ? `${shift.shiftId} · sin datos Shoplogix · ${ts}`
          : `${shift.shiftId} · Shoplogix · ${ts} · sin Excel cargado`,
        nightSide,
        summaryId:    '',
        dateKey:      shift.cfDateKey,  // CF dateKey para navegación correcta
        shiftId:      shift.shiftId,
        fragId:       `${shift.cfDateKey}__${shift.shiftId}-slx`,
        startTimeStr: fracToHHMM(startFrac),
        endTimeStr:   fracToHHMM(endFrac),
        p0Pct:        null,
        isShoplogixOnly: !shift.isGhost,
      })
    }
  }

  return blocks
}
// ─────────────────────────────────────────────────────────────────────────────

// ─ (coverage bar eliminada — detalle Shoplogix disponible en TurnoPage) ──────


/**
 * Retorna el window efectivo de producción (primer/último state operativo)
 * dentro del rango [queryStart, queryEnd], excluyendo 'planned downtime'.
 * Compartido por buildCoverageSegments y buildDayTimelineBlocks.
 */
function computeEffectiveWindow(
  states: UpstreamMachineState[],
  queryStart: number,
  queryEnd: number,
): { startMs: number; endMs: number } | null {
  const operative = states
    .filter((s) => !(s.type === 'break' && (s.reason ?? '').toLowerCase().includes('planned downtime')))
    .map((s) => ({
      start: Math.max(s.startAt.getTime(), queryStart),
      end:   Math.min(s.endAt.getTime(),   queryEnd),
    }))
    .filter((s) => s.end - s.start >= 1000)
    .sort((a, b) => a.start - b.start)
  if (operative.length === 0) return null
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { startMs: operative[0]!.start, endMs: operative[operative.length - 1]!.end }
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve los shifts a mostrar en las cards "Sin Excel" para un día VISUAL,
 * de-duplicando formato legado vs nuevo (Turno 1/2/3 tiene precedencia).
 *
 * Convención calendárica (alineada con Shoplogix UI): el día visual Y muestra
 *   - Turno 3 con dateKey CF = Y-1 (00:00-07:45 del Y, almacenado con dateKey
 *     del día anterior por el Cloud Function — convención "día laboral")
 *   - Turno 1 con dateKey CF = Y   (07:45-14:45 del Y)
 *   - Turno 2 con dateKey CF = Y   (14:45-00:00 del Y)
 *   - Turno día / Turno noche legacy con dateKey CF = Y
 *
 * Orden cronológico calendárico (00:00→24:00 del día visual):
 *   Turno 3 (madrugada) → Turno 1/día → Turno 2/noche
 *
 * Devuelve cada shift junto con su `cfDateKey` (la clave para acceder a
 * `slxByShift`) y el `slxKey` ya armado.
 */
interface SlxDisplayShift {
  shiftId: string
  cfDateKey: string
  slxKey: string
}
function slxDisplayShifts(
  visualDay: string,
  slxByShift: Map<string, { totalCycles?: number }>,
  options?: { isClassificationPlant?: boolean },
): SlxDisplayShift[] {
  const { ownDay, prevDay } = cfKeysForVisualDay(visualDay)
  const collected: SlxDisplayShift[] = []

  // Shifts cuyo dateKey CF == ownDay. Los "Turno 3" de la era legacy
  // (dateKey < cutover 2026-05-01) pertenecen visualmente al día siguiente
  // y se saltan aquí; los nuevos (dateKey = día calendario real) se quedan.
  for (const k of slxByShift.keys()) {
    if (!k.startsWith(`${ownDay}__`)) continue
    const shiftId = k.slice(`${ownDay}__`.length)
    if (isMidnightShift(shiftId, ownDay)) continue
    collected.push({ shiftId, cfDateKey: ownDay, slxKey: k })
  }

  // Turno 3 visual del día Y → dateKey CF = Y-1 (SOLO era legacy pre-cutover)
  const t3Key = `${prevDay}__Turno 3`
  if (isMidnightShift('Turno 3', prevDay) && slxByShift.has(t3Key)) {
    collected.push({ shiftId: 'Turno 3', cfDateKey: prevDay, slxKey: t3Key })
  }

  if (collected.length === 0) return []

  const ids = new Set(collected.map(c => c.shiftId))
  const hasT2    = ids.has('Turno 2')
  const hasT1or3 = ids.has('Turno 1') || ids.has('Turno 3')

  // Para plantas no-clasificadoras (Yal): NUNCA mostrar `Turno día`/`Turno noche`,
  // sin importar lo que tenga Firestore. Esos docs son ruido residual del sync.
  const dropLegacyForNonClassif = options?.isClassificationPlant === false

  const deduped = collected
    .filter(c => !(c.shiftId === 'Turno día'   && (hasT2 || dropLegacyForNonClassif)))
    .filter(c => !(c.shiftId === 'Turno noche' && (hasT1or3 || dropLegacyForNonClassif)))
    // 'Unscheduled' = producción sin turno configurado en Shoplogix: se muestra
    // FIEL solo si es significativa (≥umbral de ruido) — nunca disfrazada.
    .filter(c => c.shiftId !== 'Unscheduled'
      || isSignificantCycleCount(slxByShift.get(c.slxKey)?.totalCycles))

  // Orden calendárico (madrugadas primero, luego día, tarde y noche)
  const ord: Record<string, number> = {
    'Turno 3': 1, 'Turno 1 Lunes': 1,
    'Turno 1': 2, 'Turno día':  2,
    'Turno 2': 3, 'Turno noche': 3,
    'Unscheduled': 8,
  }
  return deduped.sort((a, b) => (ord[a.shiftId] ?? 9) - (ord[b.shiftId] ?? 9))
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

// Cache de Shoplogix por shift (`${dateKey}__${shiftId}`).
// Incluye:
//  - states[] para overlay de pausas (COLACION, MMPP, etc.) sobre el timeline
//  - scheduledStart/End: horario real derivado de intervals.shift en syncDay
//    (para docs legacy = igual a shiftStart/End; para syncDay = real de Shoplogix)
//  - shiftStart/End: mantenidos por backward compat; preferir scheduledStart/End
//  - breakdown (uptime/break/downtime/setup/plannedDowntime sec) para la justificación
interface SlxShiftCache {
  states: UpstreamMachineState[]
  /**
   * ¿`states` (y `perMachine[].states`) reflejan la subcolección `machines`?
   *
   * La vista mensual se arma desde el doc PADRE del turno, que trae agregados
   * pero no los states individuales. Para esos turnos `states` queda vacío y
   * esto en `false`: el timeline usará el horario programado en vez de la
   * ventana efectiva, hasta que se abra ese día y se cargue la subcolección.
   *
   * `true` también en el caché vacío (no hay states que traer) — si no, el
   * effect del día seleccionado reintentaría leer turnos que no existen.
   */
  statesLoaded: boolean
  shiftStart: Date | null
  shiftEnd: Date | null
  /** Horario real del turno según Shoplogix (de intervals.shift en syncDay). */
  scheduledStart: Date | null
  scheduledEnd: Date | null
  /** Fracción uptime real (0-1) calculada por el normalizer Shoplogix — solo máquina 0 */
  shiftRuntime: number
  /** Promedio de shiftRuntime entre todas las máquinas del turno (0-1) */
  avgShiftRuntime: number
  /** Productividad total: ciclos / expectedCycles (0..1+) */
  overallRatio: number
  /** Total ciclos sumados de todas las Baaders del turno */
  totalCycles: number
  /** Suma de uptime de TODAS las máquinas del turno (M0+M1+M2). En contraste,
   *  `breakdown.uptimeSec` es solo de M0. Usado para "horas-máquina procesadas"
   *  del mes, coherente con que `totalCycles` también sume las 3. */
  totalUptimeSecAllMachines: number
  /** Desglose por Baader individual del turno. Necesario para mostrar horas y
   *  paros por máquina (Ev 1 / Ev 2 / Ev 3). Cuando el array tiene 3 entries
   *  son las 3 Baaders en orden de Shoplogix (M0, M1, M2). */
  perMachine: Array<{
    machineid: string
    name: string
    /** Segundos en estado uptime del turno. */
    uptimeSec: number
    /** Total de ciclos (piezas) procesados por esta máquina en el turno. */
    totalCycles: number
    /** Fracción de uptime (0..1) sobre la duración total del turno. */
    shiftRuntime: number
    /** Lista de states (uptime/break/downtime/setup) para esta máquina — usado
     *  para reconstruir el pareto filtrando por máquina. */
    states: UpstreamMachineState[]
    /** Resumen de `states` agrupado por (type, name, reason).
     *
     *  Es lo ÚNICO que la vista MENSUAL necesita de los states: el pareto de
     *  paros y los totales de avería macro/micro. Y a diferencia de `states`,
     *  viaja dentro del doc PADRE del turno — así el mes no obliga a bajar la
     *  subcolección `machines` de cada turno.
     *
     *  Derivarlo de `states` da exactamente los mismos números; verificado sobre
     *  turnos reales en `shoplogixStateAggregates.test.ts`. */
    stateAggregates: StateAggregate[]
  }>
  breakdown: {
    uptimeSec: number
    breakSec: number
    downtimeSec: number
    setupSec: number
    plannedDowntimeSec: number
    totalTrackedSec: number
  } | null
  /**
   * true si `checkShiftReconciliation` (Cloud Function) detectó que Shoplogix
   * cambió los datos de este turno DESPUÉS del brief de fin de turno ya
   * enviado a Telegram — ej. re-etiquetado retroactivo. `reconciliationNote`
   * trae el detalle (antes/después) para el tooltip.
   */
  correctionDetected: boolean
  reconciliationNote: string | null
  /**
   * Ventana efectiva de producción ("primer pescado" → último uptime), del doc
   * padre. Null en docs pre 2026-07-21 o sin producción — degradar a scheduled*.
   */
  effectiveStart: Date | null
  effectiveEnd: Date | null
  /** Horario OFICIAL de la plantilla Shoplogix (ej. 14:45→00:00). A diferencia
   *  de scheduledEnd, NO crece sync a sync en turnos vivos. */
  officialStart: Date | null
  officialEnd: Date | null
  /** Última sync del doc (UTC real) — detecta turno "vivo" para el estado
   *  "comprobando…" del fin real. */
  lastSyncAt: Date | null
}

/**
 * Construye el caché de un turno desde su doc PADRE, sin tocar la subcolección.
 *
 * Es el camino barato de la vista mensual: el doc padre ya viaja en la única
 * query de rango del mes, así que esto cuesta 0 reads adicionales. Trae todo lo
 * que el mes necesita (uptime, ciclos, breakdown, pareto y MTTR vía
 * `stateAggregates`) y deja `states` vacío con `statesLoaded: false`.
 *
 * Solo debe llamarse cuando `parent.hasAggregates` es true.
 */
function buildCacheFromParent(parent: ShoplogixShiftParent): SlxShiftCache {
  const ms = parent.machines
  const m0 = ms[0]
  const totalCycles = ms.reduce((a, m) => a + m.totalCycles, 0)
  const avgShiftRuntime = ms.length > 0
    ? ms.reduce((s, m) => s + m.shiftRuntime, 0) / ms.length
    : 0

  return {
    states: [],
    statesLoaded: false,
    // El padre no guarda los bounds de consulta (shiftStart/End), solo el horario
    // real del turno. Para todo lo que la UI hace con ellos, `scheduled*` sirve.
    shiftStart:     parent.scheduledStart,
    shiftEnd:       parent.scheduledEnd,
    scheduledStart: parent.scheduledStart,
    scheduledEnd:   parent.scheduledEnd,
    shiftRuntime:   m0?.shiftRuntime ?? 0,
    avgShiftRuntime,
    overallRatio:   m0?.overallRatio ?? 0,
    totalCycles,
    totalUptimeSecAllMachines: ms.reduce((a, m) => a + m.uptimeSec, 0),
    perMachine: ms.map((m) => ({
      machineid:       m.machineid,
      name:            m.name,
      uptimeSec:       m.uptimeSec,
      totalCycles:     m.totalCycles,
      shiftRuntime:    m.shiftRuntime,
      states:          [],
      stateAggregates: deserializeStateAggregates(m.stateAggregates),
    })),
    breakdown: m0?.breakdown ?? null,
    correctionDetected: parent.correctionDetected,
    reconciliationNote: parent.reconciliationNote,
    effectiveStart: parent.effectiveStart,
    effectiveEnd:   parent.effectiveEnd,
    officialStart:  parent.officialStart,
    officialEnd:    parent.officialEnd,
    lastSyncAt:     parent.lastSyncAt,
  }
}

/** Stats mensuales Shoplogix — emitidos por `onSlxMonthStatsLoaded` para el panel lateral */
export interface SlxMonthlyStats {
  totalCycles: number
  avgUptimePct: number       // 0-100
  /** Total segundos procesando (uptime) sumados de todos los turnos del mes. */
  totalUptimeSec: number
  /** Desglose por Baader individual del mes: uptime acumulado, ciclos totales,
   *  N° turnos con data y % uptime promedio por máquina. Solo incluye máquinas
   *  con al menos 1 turno significativo del mes. */
  perMachineMonth: Array<{
    machineid: string
    name: string
    uptimeSec: number
    totalCycles: number
    shiftCount: number
    avgUptimePct: number
    /** Avería macro (paros relevantes, sin Micro Detencion): seg acumulados. */
    maintMacroSec: number
    /** Cantidad de eventos macro en el mes (para MTTR = sec/count). */
    maintMacroCount: number
    /** Micro Detencion: seg acumulados (interferencias breves). */
    maintMicroSec: number
    /** Cantidad de eventos Micro Detencion en el mes. */
    maintMicroCount: number
  }>
  turnosWithData: number
  dayShiftsWithData: number
  nightShiftsWithData: number
  /** Yal: turnos T1 (mañana, 07:45-14:45) con datos. Subset de dayShiftsWithData. */
  t1ShiftsWithData?: number
  /** Yal: turnos T2 (tarde, 14:45-00:00) con datos. Subset de dayShiftsWithData. */
  t2ShiftsWithData?: number
  /** Yal: turnos T3 (noche+madrugada, 23:00-07:45) con datos. Igual a nightShiftsWithData en Yal. */
  t3ShiftsWithData?: number
  daysWithData: number
  bestShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
  worstShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
  /**
   * Producción registrada FUERA de cualquier turno configurado en Shoplogix
   * ("Unscheduled") — visibilidad de horas extra productivas: la planta a
   * veces entra antes del horario oficial (decisión operacional del día, no
   * un turno faltante) y esa producción se registra igual, solo sin
   * etiqueta de turno. Se cuenta aparte de bestShift/worstShift/avgUptimePct
   * (que la excluyen, ver PR paquete Unscheduled) — no compite como turno,
   * pero tampoco se esconde.
   */
  unscheduled: {
    cycles: number
    uptimeSec: number
    /** Días del mes con producción SIGNIFICATIVA (≥ SLX_NOISE_THRESHOLD) fuera de turno. */
    daysWithData: number
  }
}

export function GraderHistoricalCalendar({
  onLoadTurno,
  className,
  initialDateKey,
  stacked = false,
  onMonthChange,
  onSummariesLoaded,
  onSlxMonthStatsLoaded,
  onDateSelect,
  plantLineId = DEFAULT_PLANT_LINE_ID,
  equalColumns = false,
}: GraderHistoricalCalendarProps) {
  const navigate = useNavigate()

  // Config de la línea activa: determina plantSlug
  const plantLine = getPlantLineConfig(plantLineId)
  const plantSlug = plantLine.plantSlug
  const [searchParams] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const selectedHistorical = useGraderSelectionStore((s) => s.selectedHistorical)
  const setSelectedHistorical = useGraderSelectionStore((s) => s.setSelectedHistorical)
  // Sync hover bidireccional entre bloques timeline y cards del día (#32).
  // El fragId del bloque timeline coincide con el data-frag-id de la card
  // (ver buildDayTimelineBlocks + EnrichedCardEntry.fragId). Cuando es null,
  // ningún elemento está resaltado.
  const [hoveredFragId, setHoveredFragId] = useState<string | null>(null)
  // Ref al slide central del carousel — se usa para hacer stagger entrance
  // de las cards (anime.js v4) cuando cambia `selectedKey`. Se asigna
  // condicionalmente solo en el slide con `isSelectedSlide === true`.
  const selectedSlideRef = useRef<HTMLDivElement | null>(null)
  // Ref para el contenedor del pareto mensual (animación scaleX)
  const monthParetoRef = useRef<HTMLDivElement>(null)
  const [slxByShift, setSlxByShift] = useState<Map<string, SlxShiftCache>>(new Map())
  // Filtro del pareto mensual: 'all' = todas las Baaders, o un machineid específico.
  const [paretoMachineFilter, setParetoMachineFilter] = useState<string>('all')
  // Filtro "Solo mantención": cuando es true, el pareto solo cuenta states que
  // `isMaintenanceState` considera avería (type='downtime' y reason ∉ lista
  // operacional: FALTA MMPP, CONTRASTACION, CAMBIO LOTE/MMPP, AJUSTE OPERADOR).
  const [paretoMaintOnly, setParetoMaintOnly] = useState<boolean>(false)
  // Toggle: tendencia agregada (1 línea por turno) vs. por máquina (3 líneas
  // de uptime% — una por Baader). Útil para detectar qué Baader cayó qué día.
  const [trendByMachine, setTrendByMachine] = useState<boolean>(false)
  /** Pestaña activa de la Vista panorámica — cada bloque a página completa
   *  en vez de 3 columnas amontonadas (pedido Orel 2026-07-21). */
  const [panoramaTab, setPanoramaTab] = useState<'baader' | 'paros' | 'disponibilidad' | 'tendencia'>('baader')
  // Cache totales Baader por shift — para indicador de "data Grader perdida"
  // (cuando Grader.totalPieces < Baader.totalCycles * 0.95 = >5% loss).
  const [slxTotalsByShift, setSlxTotalsByShift] = useState<Map<string, number>>(new Map())
  // Ref para evitar re-queuing en el pre-cargador mensual de Shoplogix
  const slxMonthQueuedRef = useRef<Set<string>>(new Set())

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
  const [shiftSchedule, setShiftSchedule] = useState(() => plantLine.defaultShiftSchedule ?? DEFAULT_SHIFT_SCHEDULE)
  const [historicalByDate, setHistoricalByDate] = useState<Map<string, GraderDailySummary[]>>(new Map())
  const [allSummariesRaw, setAllSummariesRaw] = useState<GraderDailySummary[]>([])
  // Máximo día visual con registros conocidos — se actualiza al cargar cada mes.
  const [latestRecordKey, setLatestRecordKey] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Counts de cambios manuales de gate por shiftDocId (lazy-loaded al seleccionar un día)
  const [configChangeCounts, setConfigChangeCounts] = useState<Map<string, number>>(new Map())
  // M9 — Filtro "solo turnos con pausas sin anotar"
  const [filterUntagged, setFilterUntagged] = useState(false)
  // Vista del calendario: qué métrica muestra el chip principal
  const [calendarView, setCalendarView] = useState<CalendarView>('piezas')
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
  // El calendario auto-selecciona el último día con datos Grader la primera
  // vez que se monta. Si el usuario clickea otro día → marca `userInteractedRef`
  // y deja de auto-mover. Sin esto, el día seleccionado quedaba en HOY aunque
  // los datos cargados fueran de un día anterior — generaba el bug del
  // "Resumen 2026-05-08" cuando los datos eran del 2026-05-07.
  const autoSelectedRef = useRef(false)
  const userInteractedRef = useRef(false)

  useEffect(() => { onMonthChange?.(currentMonth) }, [currentMonth, onMonthChange])

  // Propaga la fecha seleccionada al padre
  useEffect(() => {
    const dk = selectedDate ? selectedDate.toISOString().slice(0, 10) : null
    onDateSelect?.(dk)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  useEffect(() => {
    setLoading(true)
    setError(null)
    listGraderUploads(plantLineId)
      .then((list) => setUploads(normalizeUploads(list, DEFAULT_SHIFT_SCHEDULE)))
      .catch((err) => setError(err instanceof Error ? err.message : 'Error al cargar uploads'))
      .finally(() => setLoading(false))
  }, [plantLineId])

  useEffect(() => {
    const plantDefault = plantLine.defaultShiftSchedule
    getModuleRanges(plantLineId)
      .then((cfg) => {
        const schedule = normalizeShiftSchedule(cfg?.shiftSchedule, plantDefault)
        setShiftSchedule(schedule)
      })
      .catch(() => {
        setShiftSchedule(plantDefault ?? DEFAULT_SHIFT_SCHEDULE)
      })
  }, [plantLineId, plantLine.defaultShiftSchedule])

  useEffect(() => {
    if (uploads.length === 0) return
    setUploads((prev) => normalizeUploads(prev, shiftSchedule))
  }, [shiftSchedule, uploads.length])

  // Reset de caché Shoplogix al cambiar de planta — evita que datos de Chonchi
  // aparezcan en el timeline de Yal (mismas claves dateKey__shiftId, distinto plantSlug).
  // También resetea el queued-set para que el pre-loader mensual re-cargue los
  // datos de la planta nueva (si no se resetea, las claves quedan marcadas como
  // "ya cargadas" de la planta anterior y el pre-loader las saltea todas).
  useEffect(() => {
    setSlxByShift(new Map())
    setSlxTotalsByShift(new Map())
    slxMonthQueuedRef.current = new Set()
  }, [plantLineId])

  // Cargar summaries históricos para el mes visible
  useEffect(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    listDailySummariesByRange(startDate, endDate, plantLineId)
      .then((list) => {
        // Agrupar por DÍA VISUAL (calendárico). Para Turno 3 (00:00-07:45) cuyo
        // dateKey CF apunta al día anterior, el día visual es dateKey + 1.
        // Para Chonchi (Turno día/noche) se preserva el comportamiento previo
        // porque getShiftDisplayDateKey solo desplaza Turno 3.
        const map = new Map<string, GraderDailySummary[]>()
        for (const s of list) {
          const visualKey = getShiftDisplayDateKey(s.dateKey, s.shiftId)
          const existing = map.get(visualKey) ?? []
          existing.push(s)
          map.set(visualKey, existing)
        }
        setHistoricalByDate(map)
        setAllSummariesRaw(list)
        onSummariesLoaded?.(list)
        // Mantener el máximo día visual conocido (para botón "Último")
        if (map.size > 0) {
          const monthMax = Array.from(map.keys()).sort().slice(-1)[0]!
          setLatestRecordKey((prev) => (!prev || monthMax > prev) ? monthMax : prev)
        }

        // Si el mes actual no tiene datos y no hay initialDateKey, buscar el último mes con datos
        if (list.length === 0 && !effectiveInitialKey && !autoSelectedRef.current) {
          const today = new Date()
          const lookback = `${today.getFullYear() - 1}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
          const lookbackEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
          listDailySummariesByRange(lookback, lookbackEnd, plantLineId)
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
  }, [currentMonth, effectiveInitialKey, plantLineId, onSummariesLoaded])

  useEffect(() => {
    const histKeys = Array.from(historicalByDate.keys()).sort()
    const latestHist = histKeys[histKeys.length - 1]
    const latestUpload = uploads.length > 0
      ? uploads.map((u) => u.sessionDate || toDateKey(u.inferred?.startAt)).filter(Boolean).sort().slice(-1)[0]
      : undefined
    // Fallback: último día con datos Shoplogix significativos (umbral >=50,
    // descarta turnos ruidosos para no auto-seleccionar un día con 4 ciclos).
    const slxDays = [...slxByShift.entries()]
      .filter(([, v]) => isSignificantCycleCount(v.totalCycles))
      .map(([k]) => k.split('__')[0]!)
    slxDays.sort()
    const latestSlx = slxDays[slxDays.length - 1]
    const latest = latestHist ?? latestUpload ?? latestSlx

    // Race condition fix (2026-05-08): el effect corría antes de que la query
    // de historicalByDate terminara. Caía a `latestSlx` (hoy con Shoplogix
    // live) y marcaba autoSelectedRef. Cuando llegaba el summary del 7-may
    // (Grader), no se re-seleccionaba → el usuario veía día 8 con ring pero
    // resumen del 7-may incorrecto.
    //
    // Fix: si llega un latestHist (Grader es prioritario) MÁS RECIENTE que
    // lo que ya está auto-seleccionado, actualizar. Si el usuario YA
    // interactuó (`userInteractedRef`), respetar su selección.
    if (!latest) return
    if (userInteractedRef.current) return

    const latestDate = new Date(`${latest}T00:00:00`)
    const currentSelectedKey = selectedDate?.toISOString().slice(0, 10) ?? ''
    const shouldUpdate = !autoSelectedRef.current
      || (!!latestHist && latestHist > currentSelectedKey)

    if (shouldUpdate) {
      setSelectedDate(latestDate)
      setCurrentMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1))
      autoSelectedRef.current = true
    }
  }, [historicalByDate, uploads, slxByShift, selectedDate])

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

  // Días navegables (Paso 2/3): días con actividad real del mes, en orden.
  // Incluye también días con datos Shoplogix del mes visible cuando no hay
  // summaries Grader — así el carrusel, las flechas ◀▶ y la paginación
  // funcionan para plantas sin Excel cargado (ej. Yal en modo Shoplogix-only).
  const sortedDayKeys = useMemo(() => {
    const keys = new Set([...calendarAgg.keys()])
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    // Solo días con turnos SLX significativos (>=SLX_NOISE_THRESHOLD ciclos).
    // Días que solo tienen ruido no entran al carrusel ni a las flechas ◀▶.
    for (const [cacheKey, cycles] of slxTotalsByShift) {
      if (isSignificantCycleCount(cycles)) {
        const dateKey = cacheKey.split('__')[0] ?? ''
        if (dateKey.startsWith(prefix)) keys.add(dateKey)
      }
    }
    return [...keys].sort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarAgg, slxTotalsByShift, currentMonth])

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

  // Construye "summaries virtuales" desde datos Shoplogix para shifts SIN Excel.
  // Solo aplica a plantas SLX-only (isClassificationPlant === false, ej. Yal).
  // Permite ver el turno en el panel "Resumen del día" aunque el usuario no
  // haya cargado el Excel del Marelec — evita que la card desaparezca cuando
  // existen ciclos Baader medidos por Shoplogix.
  //
  // PRINCIPIO — reflejo puro por horario, no por nombre: antes esta función
  // agrupaba por baldes fijos ("Turno 1"+"Turno 2" = balde "día", "Turno 3"+
  // "Turno noche" = balde "noche") y fusionaba sus ciclos/horario en UNA sola
  // card. Eso se rompe cada vez que Shoplogix renombra un turno recurrente
  // (ya pasó 2 veces: PR #163/#168, y de nuevo con la madrugada de Yal
  // etiquetada "Turno 1" en vez de "Turno 3" — el balde "día" absorbía esa
  // madrugada junto con el Turno 2 real de la tarde, mostrando un rango
  // fusionado 00:00→19:41 que no correspondía a ningún turno real).
  // El nombre que Shoplogix le ponga a un turno no es dato estable — lo único
  // confiable es su horario real (scheduledStart/End). Por eso ahora se crea
  // UNA card por cada shiftId que Shoplogix reporte ese día, con SU PROPIO
  // horario, sin fusionar con ningún otro — el nombre queda solo como etiqueta.
  const buildSlxVirtualSummaries = useCallback(
    (key: string, seenShifts: Set<string>): Array<{ summary: GraderDailySummary; chip: null }> => {
      if (plantLine.isClassificationPlant !== false) return []
      const prefix = `${key}__`

      // Nombres legacy que el loader usa como ALIAS de consulta: cuando la app
      // pide "Turno día"/"Turno noche" en Yal, `getSlxShiftCandidates` resuelve
      // a los datos de un turno numérico real (ej. "Turno 1"). Esos datos quedan
      // guardados en el mapa BAJO LA CLAVE DEL ALIAS además de bajo la clave real
      // → sin deduplicar, el mismo turno físico aparecería 2 veces (bug real
      // 2026-07-08 Yal: "Turno 1" y "Turno día" mostraban idénticos 00:00→07:45).
      const LEGACY_ALIAS = new Set(['Turno día', 'Turno noche'])

      // 1. Recolectar candidatos (una entrada por clave del mapa de este día).
      interface Cand { shiftId: string; mapKey: string; totalCycles: number; c: SlxShiftCache | undefined }
      const cands: Cand[] = []
      for (const [mapKey, totalCycles] of slxTotalsByShift.entries()) {
        if (!mapKey.startsWith(prefix)) continue
        const shiftId = mapKey.slice(prefix.length)
        if (seenShifts.has(shiftId)) continue // ya cubierto por Excel real
        // Filtro de ruido SLX vía helper centralizado: por debajo del umbral
        // SLX_NOISE_THRESHOLD no se crea card virtual (sería ruido visible).
        if (!isSignificantCycleCount(totalCycles)) continue
        cands.push({ shiftId, mapKey, totalCycles, c: slxByShift.get(mapKey) })
      }

      // 2. Deduplicar por HORARIO DE INICIO real (dos turnos físicos distintos
      //    nunca comparten scheduledStart). Ante colisión se prefiere el nombre
      //    REAL de Shoplogix (numérico) sobre el alias legacy — "el horario
      //    manda, el nombre es solo etiqueta". Entradas sin scheduledStart no se
      //    colapsan entre sí (se mantienen por su shiftId único).
      const byStart = new Map<string, Cand>()
      for (const cand of cands) {
        const startKey = cand.c?.scheduledStart ? cand.c.scheduledStart.toISOString() : `no-start:${cand.shiftId}`
        const existing = byStart.get(startKey)
        if (!existing) {
          byStart.set(startKey, cand)
          continue
        }
        // Colisión de horario: preferir el que NO es alias legacy.
        const existingIsAlias = LEGACY_ALIAS.has(existing.shiftId)
        const candIsAlias     = LEGACY_ALIAS.has(cand.shiftId)
        if (existingIsAlias && !candIsAlias) byStart.set(startKey, cand)
        // Si ambos son alias o ambos reales, se conserva el primero (estable).
      }

      const out = [...byStart.values()].map(({ shiftId, mapKey, totalCycles, c }) => ({
        summary: {
          id: `slx-virtual:${mapKey}`,
          dateKey: key,
          shiftId,
          plantLineId,
          totalPieces: totalCycles,
          pointZeroPieces: 0,
          pointZeroPct: 0,
          startAt: c?.scheduledStart?.toISOString(),
          endAt: c?.scheduledEnd?.toISOString(),
          updatedBy: 'shoplogix',
          updatedAt: '',
          isSlxVirtual: true,
          slxUptimeFraction: c?.avgShiftRuntime ?? 0,
        } as GraderDailySummary,
        chip: null as null,
      }))

      // Orden cronológico entre las cards virtuales (el orden de un Map es de
      // inserción, no de horario) — nombres desconocidos/nuevos igual entran
      // en su posición real por hora en vez de caer al final por sorpresa.
      out.sort((a, b) => (a.summary.startAt ?? '').localeCompare(b.summary.startAt ?? ''))
      return out
    },
    [plantLine.isClassificationPlant, plantLineId, slxByShift, slxTotalsByShift],
  )

  // Summaries a mostrar en el panel "Resumen del día" para el día seleccionado.
  // Combina:
  //  - Contribuciones calendáricas reales (chips primary/secondary)
  //  - Summaries con dateKey legacy === selectedKey que no aportan (huérfanos)
  //  - Virtuales SLX para shifts sin Excel (plantas SLX-only)
  // Orden: primary > secondary > orphan-source > virtual; D antes que N dentro de cada rol.
  const summariesForSelectedDay = useMemo(() => {
    if (!selectedKey) return [] as Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>
    const out: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }> = []
    const seen = new Set<string>()
    const seenShifts = new Set<string>()
    const dayChips = chipsByDate.get(selectedKey) ?? []

    // 1. Aportes reales (primary + secondary)
    for (const chip of dayChips) {
      if (chip.role === 'orphan-source') continue
      const s = summariesById.get(chip.summaryId)
      if (s && !seen.has(s.id)) {
        out.push({ summary: s, chip })
        seen.add(s.id)
        seenShifts.add(s.shiftId)
      }
    }
    // 2. Huérfanos: summaries con dateKey legacy === selectedKey sin aporte
    for (const s of historicalByDate.get(selectedKey) ?? []) {
      if (seen.has(s.id)) continue
      const orphanChip = dayChips.find((c) => c.summaryId === s.id && c.role === 'orphan-source') ?? null
      out.push({ summary: s, chip: orphanChip })
      seen.add(s.id)
      seenShifts.add(s.shiftId)
    }
    // 3. Virtuales SLX para turnos sin Excel (Yal y similares)
    for (const v of buildSlxVirtualSummaries(selectedKey, seenShifts)) out.push(v)

    // Ordenamiento determinista (virtuales al final dentro de cada shift)
    const roleOrder: Record<string, number> = { primary: 0, secondary: 1, 'orphan-source': 2 }
    const shiftOrder: Record<string, number> = {
      'Turno día': 0, 'Turno 1': 0, 'Turno 2': 0,
      'Turno noche': 1, 'Turno 3': 1,
    }
    out.sort((a, b) => {
      const aVirt = a.summary.isSlxVirtual ? 1 : 0
      const bVirt = b.summary.isSlxVirtual ? 1 : 0
      const ra = aVirt ? 3 : (roleOrder[a.chip?.role ?? 'primary'] ?? 0)
      const rb = bVirt ? 3 : (roleOrder[b.chip?.role ?? 'primary'] ?? 0)
      if (ra !== rb) return ra - rb
      const sa = shiftOrder[a.summary.shiftId] ?? 9
      const sb = shiftOrder[b.summary.shiftId] ?? 9
      return sa - sb
    })
    return out
  }, [selectedKey, chipsByDate, historicalByDate, summariesById, buildSlxVirtualSummaries])

  // Generalización de summariesForSelectedDay para cualquier clave (slides adyacentes)
  const getSummariesForDay = useCallback(
    (key: string | null): Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }> => {
      if (!key) return []
      const out: Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }> = []
      const seen = new Set<string>()
      const seenShifts = new Set<string>()
      const dayChips = chipsByDate.get(key) ?? []
      for (const chip of dayChips) {
        if (chip.role === 'orphan-source') continue
        const s = summariesById.get(chip.summaryId)
        if (s && !seen.has(s.id)) {
          out.push({ summary: s, chip })
          seen.add(s.id)
          seenShifts.add(s.shiftId)
        }
      }
      for (const s of historicalByDate.get(key) ?? []) {
        if (seen.has(s.id)) continue
        const orphanChip = dayChips.find((c) => c.summaryId === s.id && c.role === 'orphan-source') ?? null
        out.push({ summary: s, chip: orphanChip })
        seen.add(s.id)
        seenShifts.add(s.shiftId)
      }
      for (const v of buildSlxVirtualSummaries(key, seenShifts)) out.push(v)
      return out
    },
    [chipsByDate, historicalByDate, summariesById, buildSlxVirtualSummaries],
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
    const order: Record<string, number> = {
      'Turno día': 0, 'Turno 2': 0,
      'Turno noche': 1, 'Turno 1': 1, 'Turno 3': 1,
    }
    const sorted = [...turnosDelDia].sort((a, b) => (order[a.shiftId] ?? 9) - (order[b.shiftId] ?? 9))
    setSelectedHistorical(sorted[0] ?? null)
  }, [selectedKey, historicalByDate, selectedHistorical, setSelectedHistorical])

  // Stagger entrance de las cards del slide central al cambiar de día.
  // anime.js v4: animate(targets, props) con `delay: stagger(ms)`.
  // Solo afecta al slide central (selectedSlideRef apunta solo allí).
  // Respeta `prefers-reduced-motion` — si el usuario lo pide, saltamos la animación.
  useEffect(() => {
    if (!selectedSlideRef.current) return
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return
    const nodes = selectedSlideRef.current.querySelectorAll<HTMLElement>('[data-card-anim]')
    if (nodes.length === 0) return
    animate(nodes, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 340,
      delay: stagger(60),
      ease: 'outQuad',
    })
  }, [selectedKey, summariesForSelectedDay.length])

  // Sweep izquierda→derecha de la barra unificada Shoplogix al cambiar día.
  // Las bandas tienen transformOrigin='left center' → scaleX de 0 a 1 las "dibuja"
  // en orden cronológico (stagger 12ms entre bandas adyacentes).
  useEffect(() => {
    if (!selectedSlideRef.current) return
    const prefersReducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return
    const nodes = selectedSlideRef.current.querySelectorAll<HTMLElement>('[data-anim-unif]')
    if (nodes.length === 0) return
    animate(nodes, {
      scaleX: [0, 1],
      duration: 450,
      delay: stagger(12),
      ease: 'outExpo',
    })
  }, [selectedKey])

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

  // Lazy-load de Shoplogix states para los shifts del día visual seleccionado.
  // Carga tanto el formato legado (Turno día/noche) como el nuevo (Turno 1/2/3).
  //
  // Convención calendárica (alineada con Shoplogix UI): el día visual
  // selectedKey muestra
  //   - T1, T2, Turno día/noche con dateKey CF = selectedKey
  //   - Turno 3 con dateKey CF = yesterday (la madrugada del selectedKey está
  //     guardada bajo el día anterior por el CF — convención "día laboral").
  //
  // También pre-cargamos `selectedKey__Turno 3` para que cuando el usuario
  // navegue al día siguiente, el chip nocturno aparezca sin spinner.
  useEffect(() => {
    if (!selectedKey) return
    const [y, m, d] = selectedKey.split('-').map(Number) as [number, number, number]
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
    const candidates: Array<{ dateKey: string; shiftId: string }> = [
      // Formato legado (Chonchi histórico)
      { dateKey: yesterday,   shiftId: 'Turno noche' },
      { dateKey: selectedKey, shiftId: 'Turno día' },
      { dateKey: selectedKey, shiftId: 'Turno noche' },
      // Formato nuevo — syncDay (Turno 1/2/3 reales de Shoplogix)
      { dateKey: yesterday,   shiftId: 'Turno 3' },  // madrugada del día visual (CF=ayer)
      { dateKey: selectedKey, shiftId: 'Turno 1' },
      { dateKey: selectedKey, shiftId: 'Turno 2' },
      { dateKey: selectedKey, shiftId: 'Turno 3' },  // pre-fetch: madrugada del día siguiente
    ]
    let cancelled = false
    for (const c of candidates) {
      const key = `${c.dateKey}__${c.shiftId}`
      // `statesLoaded` y no `has(key)`: la pre-carga mensual ya dejó una entrada
      // para este turno, pero construida desde el doc padre y por tanto SIN los
      // states individuales. El timeline del día abierto los necesita para dibujar
      // la ventana efectiva (dónde arrancó y paró de verdad), así que acá sí se
      // baja la subcolección. Es la única lectura de states que hace la vista.
      if (slxByShift.get(key)?.statesLoaded) continue
      loadShoplogixShift(c.dateKey, c.shiftId, plantSlug)
        .then((res) => {
          if (cancelled) return
          const machines = res.snapshot?.machines ?? []
          const m0 = machines[0]
          const states = m0?.states ?? []
          const totalCycles = machines.reduce((a, mc) => a + (mc.totalCycles || 0), 0)
          const avgShiftRuntime = machines.length > 0
            ? machines.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) / machines.length
            : 0
          const totalUptimeSecAllMachines = machines.reduce(
            (s, m) => s + (m.shiftRuntimeBreakdown?.uptimeSec ?? 0), 0,
          )
          const perMachine = machines.map((m) => ({
            machineid:    m.machineid,
            name:         m.machineName,
            uptimeSec:    m.shiftRuntimeBreakdown?.uptimeSec ?? 0,
            totalCycles:  m.totalCycles ?? 0,
            shiftRuntime: m.shiftRuntime ?? 0,
            states:       m.states ?? [],
            stateAggregates: aggregatesFromStates(m.states),
          }))
          const cache: SlxShiftCache = {
            states,
            statesLoaded: true,   // viene de la subcolección `machines`
            shiftStart:     m0?.shiftStart     ?? null,
            shiftEnd:       m0?.shiftEnd       ?? null,
            scheduledStart: m0?.scheduledStart ?? m0?.shiftStart ?? null,
            scheduledEnd:   m0?.scheduledEnd   ?? m0?.shiftEnd   ?? null,
            shiftRuntime:   m0?.shiftRuntime   ?? 0,
            avgShiftRuntime,
            overallRatio:   m0?.overallRatio   ?? 0,
            totalCycles,
            totalUptimeSecAllMachines,
            perMachine,
            breakdown: m0?.shiftRuntimeBreakdown ? {
              uptimeSec:          m0.shiftRuntimeBreakdown.uptimeSec,
              breakSec:           m0.shiftRuntimeBreakdown.breakSec,
              downtimeSec:        m0.shiftRuntimeBreakdown.downtimeSec,
              setupSec:           m0.shiftRuntimeBreakdown.setupSec,
              plannedDowntimeSec: m0.shiftRuntimeBreakdown.plannedDowntimeSec,
              totalTrackedSec:    m0.shiftRuntimeBreakdown.totalTrackedSec,
            } : null,
            // Preservar lo que ya sabíamos por el doc padre (esta carga solo
            // refina `states`, no vuelve a traer flags ni ventana efectiva).
            correctionDetected: slxByShift.get(key)?.correctionDetected ?? false,
            reconciliationNote: slxByShift.get(key)?.reconciliationNote ?? null,
            effectiveStart: slxByShift.get(key)?.effectiveStart ?? null,
            effectiveEnd:   slxByShift.get(key)?.effectiveEnd   ?? null,
            officialStart:  slxByShift.get(key)?.officialStart  ?? null,
            officialEnd:    slxByShift.get(key)?.officialEnd    ?? null,
            lastSyncAt:     slxByShift.get(key)?.lastSyncAt     ?? null,
          }
          setSlxByShift((prev) => new Map(prev).set(key, cache))
          setSlxTotalsByShift((prev) => new Map(prev).set(key, totalCycles))
        })
        .catch(() => {
          if (!cancelled) {
            setSlxByShift((prev) => new Map(prev).set(key, {
              states: [], statesLoaded: true, shiftStart: null, shiftEnd: null,
              scheduledStart: null, scheduledEnd: null,
              shiftRuntime: 0, avgShiftRuntime: 0, overallRatio: 0, totalCycles: 0,
              totalUptimeSecAllMachines: 0,
              perMachine: [],
              breakdown: null,
              correctionDetected: slxByShift.get(key)?.correctionDetected ?? false,
              reconciliationNote: slxByShift.get(key)?.reconciliationNote ?? null,
              effectiveStart: slxByShift.get(key)?.effectiveStart ?? null,
              effectiveEnd:   slxByShift.get(key)?.effectiveEnd   ?? null,
              officialStart:  slxByShift.get(key)?.officialStart  ?? null,
              officialEnd:    slxByShift.get(key)?.officialEnd    ?? null,
              lastSyncAt:     slxByShift.get(key)?.lastSyncAt     ?? null,
            }))
            setSlxTotalsByShift((prev) => new Map(prev).set(key, 0))
          }
        })
    }
    return () => { cancelled = true }
    // plantSlug es derivado de plantLineId; otro effect limpia slxByShift cuando
    // plantLineId cambia (línea ~1007), por lo que no necesitamos plantSlug acá
    // como dep para reactivar la carga — pero sí lo agregamos para callar el
    // warning de exhaustive-deps y mantener correctness si la planta cambia.
  }, [selectedKey, slxByShift, plantSlug])

  // Pre-carga mensual de Shoplogix.
  // Estrategia en 3 fases:
  //   Fase 1 — 1 query de colección para saber qué shifts EXISTEN en el mes.
  //   Fase 2 — Marcar todos los shifts inexistentes como "vacío confirmado" en un
  //            solo batch setState (sin lecturas adicionales).
  //   Fase 3 — Cargar datos reales solo para los shifts que sí existen.
  // Esto reduce de ~150 reads individuales a 1 + n_shifts_con_data (típicamente 3-10).
  useEffect(() => {
    const year       = currentMonth.getFullYear()
    const month      = currentMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    let cancelled    = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    const monthShiftIds = ['Turno día', 'Turno noche', 'Turno 1', 'Turno 2', 'Turno 3']

    const EMPTY_CACHE: SlxShiftCache = {
      // `statesLoaded: true` — un turno vacío confirmado no tiene states que traer.
      // Si fuera false, el effect del día seleccionado reintentaría leerlo cada vez.
      states: [], statesLoaded: true, shiftStart: null, shiftEnd: null,
      scheduledStart: null, scheduledEnd: null,
      shiftRuntime: 0, avgShiftRuntime: 0, overallRatio: 0, totalCycles: 0,
      totalUptimeSecAllMachines: 0,
      perMachine: [],
      breakdown: null,
      correctionDetected: false,
      reconciliationNote: null,
      effectiveStart: null,
      effectiveEnd: null,
      officialStart: null,
      officialEnd: null,
      lastSyncAt: null,
    }

    const loadOne = async (dk: string, shiftId: string, forceServer: boolean): Promise<number> => {
      const key = `${dk}__${shiftId}`
      const allCandidates = [shiftId, ...getSlxShiftCandidates(shiftId, plantSlug).filter(c => c !== shiftId)]

      // Turno nombrado primero; si devuelve 0 ciclos, probar candidatos fallback (e.g. Unscheduled)
      let resolvedRes = await loadShoplogixShift(dk, shiftId, plantSlug, forceServer).catch(() => null)
      if (cancelled) return 0

      if (resolvedRes !== null) {
        const c = (resolvedRes.snapshot?.machines ?? []).reduce((a, m) => a + (m.totalCycles || 0), 0)
        if (c === 0) {
          for (const fb of allCandidates.slice(1)) {
            if (cancelled) return 0
            try {
              const fbRes = await loadShoplogixShift(dk, fb, plantSlug, forceServer)
              const fbC = (fbRes.snapshot?.machines ?? []).reduce((a, m) => a + (m.totalCycles || 0), 0)
              // Unscheduled con <50 ciclos es ruido entre turnos, no producción real.
              // Turnos named (Turno 3*, etc.) aceptan cualquier valor > 0.
              const isValid = fbC > 0 && (fb !== 'Unscheduled' || fbC >= 50)
              if (isValid) { resolvedRes = fbRes; break }
            } catch { /* ignorar, probar siguiente */ }
          }
        }
      }

      if (cancelled) return 0
      if (!resolvedRes) {
        slxMonthQueuedRef.current.delete(key)
        setSlxByShift((prev)       => new Map(prev).set(key, EMPTY_CACHE))
        setSlxTotalsByShift((prev) => new Map(prev).set(key, 0))
        return 0
      }

      const mAll   = resolvedRes.snapshot?.machines ?? []
      const m0     = mAll[0]
      const states = m0?.states ?? []
      const cycles = mAll.reduce((a, mc) => a + (mc.totalCycles || 0), 0)
      const avgShiftRuntime2 = mAll.length > 0
        ? mAll.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) / mAll.length
        : 0
      const totalUptimeSecAllMachines2 = mAll.reduce(
        (s, m) => s + (m.shiftRuntimeBreakdown?.uptimeSec ?? 0), 0,
      )
      const perMachine2 = mAll.map((m) => ({
        stateAggregates: aggregatesFromStates(m.states),
        machineid:    m.machineid,
        name:         m.machineName,
        uptimeSec:    m.shiftRuntimeBreakdown?.uptimeSec ?? 0,
        totalCycles:  m.totalCycles ?? 0,
        shiftRuntime: m.shiftRuntime ?? 0,
        states:       m.states ?? [],
      }))
      const cache: SlxShiftCache = {
        states,
        statesLoaded: true,   // viene de la subcolección `machines`
        shiftStart:     m0?.shiftStart     ?? null,
        shiftEnd:       m0?.shiftEnd       ?? null,
        scheduledStart: m0?.scheduledStart ?? m0?.shiftStart ?? null,
        scheduledEnd:   m0?.scheduledEnd   ?? m0?.shiftEnd   ?? null,
        shiftRuntime:   m0?.shiftRuntime   ?? 0,
        avgShiftRuntime: avgShiftRuntime2,
        overallRatio:   m0?.overallRatio   ?? 0,
        totalCycles:    cycles,
        totalUptimeSecAllMachines: totalUptimeSecAllMachines2,
        perMachine: perMachine2,
        breakdown: m0?.shiftRuntimeBreakdown ? {
          uptimeSec:          m0.shiftRuntimeBreakdown.uptimeSec,
          breakSec:           m0.shiftRuntimeBreakdown.breakSec,
          downtimeSec:        m0.shiftRuntimeBreakdown.downtimeSec,
          setupSec:           m0.shiftRuntimeBreakdown.setupSec,
          plannedDowntimeSec: m0.shiftRuntimeBreakdown.plannedDowntimeSec,
          totalTrackedSec:    m0.shiftRuntimeBreakdown.totalTrackedSec,
        } : null,
        correctionDetected: false,
        reconciliationNote: null,
        effectiveStart: slxByShift.get(key)?.effectiveStart ?? null,
        effectiveEnd:   slxByShift.get(key)?.effectiveEnd   ?? null,
        officialStart:  slxByShift.get(key)?.officialStart  ?? null,
        officialEnd:    slxByShift.get(key)?.officialEnd    ?? null,
        lastSyncAt:     slxByShift.get(key)?.lastSyncAt     ?? null,
      }
      setSlxByShift((prev)       => new Map(prev).set(key, cache))
      setSlxTotalsByShift((prev) => new Map(prev).set(key, cycles))
      return cycles
    }

    /**
     * Fase 1b — resolver turnos desde el doc PADRE, sin leer subcolecciones.
     *
     * El padre ya viene en la query de Fase 1 y (desde `PARENT_SCHEMA_VERSION` 2)
     * trae uptime, ciclos, breakdown y los states agregados: todo lo que la vista
     * mensual necesita. Los turnos que resuelve acá cuestan 0 reads adicionales;
     * el resto (docs de esquema viejo) sigue por el camino con subcolección.
     *
     * Devuelve los doc IDs que quedaron resueltos.
     */
    function resolveFromParents(parents: ShoplogixShiftParent[]): void {
      const keyToParent = resolveMonthShiftKeys(
        parents, monthShiftIds, (base) => getSlxShiftCandidates(base, plantSlug),
      )
      if (keyToParent.size === 0) return

      // Varias claves pueden apuntar al mismo padre (p. ej. `Turno día` y `Turno 2`):
      // construir el caché una sola vez por padre y compartir la referencia.
      const cacheByParent = new Map<ShoplogixShiftParent, SlxShiftCache>()
      const updates = new Map<string, SlxShiftCache>()
      for (const [key, parent] of keyToParent) {
        let cache = cacheByParent.get(parent)
        if (!cache) {
          cache = buildCacheFromParent(parent)
          cacheByParent.set(parent, cache)
        }
        updates.set(key, cache)
      }

      // Marcarlas como ya encoladas para que las fases siguientes no las carguen.
      for (const key of updates.keys()) slxMonthQueuedRef.current.add(key)

      setSlxByShift((prev) => {
        const next = new Map(prev)
        for (const [k, v] of updates) next.set(k, v)
        return next
      })
      setSlxTotalsByShift((prev) => {
        const next = new Map(prev)
        for (const [k, v] of updates) next.set(k, v.totalCycles)
        return next
      })
    }

    async function run() {
      // ── Fase 1: descubrir qué shifts existen en el mes (1 query) ──────────────
      // Trae los docs padre COMPLETOS: los que ya tienen agregados se resuelven
      // sin un solo read más (Fase 1b).
      const parents = await listShoplogixShiftParentsForMonth(year, month, plantSlug)
      if (cancelled) return

      if (parents && parents.length > 0) {
        resolveFromParents(parents)
        if (cancelled) return
      }

      // null = query falló → fallback a cargar todo individualmente
      const existingDocIds = parents
        ? parents.map(p => `${p.dateKey}_${p.shiftId}`)
        : await listShoplogixShiftDocIdsForMonth(year, month, plantSlug)
      if (cancelled) return
      const existingSet = existingDocIds ? new Set(existingDocIds) : null

      // ── Fase 2: clasificar en "vacío confirmado" vs "a cargar" ────────────────
      const emptyKeys: string[] = []
      const toLoad: Array<{ dk: string; dkMs: number; shiftId: string }> = []

      // Nombres REALES fuera de la lista base — Shoplogix inventa variantes
      // ("Turno 1 Lunes") y registra producción sin turno ("Unscheduled").
      // Se cargan bajo su propio key `${dk}__${shiftId}`; sin esto, la Fase 1
      // los descubre pero la Fase 2 los descartaba en silencio y el calendario
      // no los mostraba nunca. Se omiten los que ya cubre algún candidato de
      // la lista base (loadOne los resuelve como fallback del turno nombrado).
      if (existingDocIds) {
        const coveredByBase = new Set(
          monthShiftIds.flatMap(base => getSlxShiftCandidates(base, plantSlug)),
        )
        for (const docId of existingDocIds) {
          const m = docId.match(/^(\d{4}-\d{2}-\d{2})_(.+)$/)
          if (!m) continue
          const dk = m[1]!
          const sid = m[2]!
          if (monthShiftIds.includes(sid) || coveredByBase.has(sid)) continue
          const key = `${dk}__${sid}`
          if (slxMonthQueuedRef.current.has(key)) continue
          slxMonthQueuedRef.current.add(key)
          toLoad.push({ dk, dkMs: new Date(`${dk}T12:00:00`).getTime(), shiftId: sid })
        }
      }

      for (let day = daysInMonth; day >= 1; day--) {   // reverso → días recientes primero
        const dk   = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const dkMs = new Date(`${dk}T12:00:00`).getTime()
        for (const shiftId of monthShiftIds) {
          const key = `${dk}__${shiftId}`
          if (slxMonthQueuedRef.current.has(key)) continue
          slxMonthQueuedRef.current.add(key)

          if (existingSet === null || existingSet.has(`${dk}_${shiftId}`)) {
            toLoad.push({ dk, dkMs, shiftId })
          } else {
            // Verificar si algún candidato fallback existe (e.g. Unscheduled)
            const hasFallback = getSlxShiftCandidates(shiftId, plantSlug)
              .some(c => c !== shiftId && existingSet.has(`${dk}_${c}`))
            if (hasFallback) {
              toLoad.push({ dk, dkMs, shiftId })  // loadOne encontrará el fallback
            } else {
              emptyKeys.push(key)
            }
          }
        }
      }

      // Marcar vacíos en DOS setStates (un render, no 150)
      if (emptyKeys.length > 0 && !cancelled) {
        setSlxByShift(prev => {
          const next = new Map(prev)
          for (const k of emptyKeys) next.set(k, EMPTY_CACHE)
          return next
        })
        setSlxTotalsByShift(prev => {
          const next = new Map(prev)
          for (const k of emptyKeys) next.set(k, 0)
          return next
        })
      }

      if (cancelled) return

      // ── Fase 3: cargar solo los shifts que existen ────────────────────────────
      const staleKeys: string[] = []
      const cutoffMs  = Date.now() - 45 * 86_400_000
      const CONCURRENCY = 15
      let idx = 0

      function launchNext() {
        if (cancelled || idx >= toLoad.length) return
        const { dk, dkMs, shiftId } = toLoad[idx++]!
        loadOne(dk, shiftId, false).then((cycles) => {
          if (!cancelled && (cycles ?? 0) === 0 && dkMs >= cutoffMs) {
            staleKeys.push(`${dk}__${shiftId}`)
          }
          launchNext()
        })
      }
      for (let s = 0; s < Math.min(CONCURRENCY, toLoad.length); s++) launchNext()

      // Reintento servidor para turnos recientes con 0 ciclos (posible cache stale)
      retryTimer = setTimeout(async () => {
        if (cancelled || staleKeys.length === 0) return
        const BATCH = 10
        for (let i = 0; i < staleKeys.length; i += BATCH) {
          if (cancelled) break
          await Promise.all(staleKeys.slice(i, i + BATCH).map(key => {
            const [dk, shiftId] = key.split('__') as [string, string]
            return loadOne(dk, shiftId, true)
          }))
        }
      }, 2000)
    }

    run()
    return () => {
      cancelled = true
      if (retryTimer !== null) clearTimeout(retryTimer)
    }
  }, [currentMonth, plantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listener en tiempo real para el turno activo del mes actual.
  // Detecta cuando Shoplogix empieza a registrar la primera pieza y actualiza el calendario.
  // Solo activo cuando el mes visualizado ES el mes corriente.
  useEffect(() => {
    const now = new Date()
    if (now.getFullYear() !== currentMonth.getFullYear() || now.getMonth() !== currentMonth.getMonth()) return

    const pad = (n: number) => String(n).padStart(2, '0')
    const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    const yest = new Date(now.getTime() - 86_400_000)
    const yesterdayKey = `${yest.getFullYear()}-${pad(yest.getMonth() + 1)}-${pad(yest.getDate())}`

    // Suscribir a los turnos nombrados del día actual y anterior.
    // subscribeShoplogixShiftAuto maneja la cadena de candidatos (Turno 3 → Turno 3* → Unscheduled)
    // automáticamente, así no se necesita suscribir a Unscheduled explícitamente.
    const liveShifts: Array<{ dk: string; shiftId: string }> = [
      { dk: todayKey,     shiftId: 'Turno 1' },
      { dk: todayKey,     shiftId: 'Turno 2' },
      { dk: todayKey,     shiftId: 'Turno 3' },      // Yal: Turno 3* puede quedar bajo hoy si sync corrió de madrugada
      { dk: todayKey,     shiftId: 'Turno día' },
      { dk: yesterdayKey, shiftId: 'Turno 3' },
      { dk: yesterdayKey, shiftId: 'Turno noche' },
    ]

    const unsubs = liveShifts.map(({ dk, shiftId }) => {
      const key = `${dk}__${shiftId}`
      return subscribeShoplogixShiftAuto(dk, shiftId, plantSlug, (result) => {
        const mAll   = result.snapshot?.machines ?? []
        const cycles = mAll.reduce((a, m) => a + (m.totalCycles || 0), 0)
        if (cycles === 0) return

        const m0 = mAll[0]
        const avgShiftRuntime = mAll.length > 0
          ? mAll.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) / mAll.length
          : 0
        const totalUptimeSecAllMachines3 = mAll.reduce(
          (s, m) => s + (m.shiftRuntimeBreakdown?.uptimeSec ?? 0), 0,
        )
        const perMachine3 = mAll.map((m) => ({
          stateAggregates: aggregatesFromStates(m.states),
          machineid:    m.machineid,
          name:         m.machineName,
          uptimeSec:    m.shiftRuntimeBreakdown?.uptimeSec ?? 0,
          totalCycles:  m.totalCycles ?? 0,
          shiftRuntime: m.shiftRuntime ?? 0,
          states:       m.states ?? [],
        }))
        const cache: SlxShiftCache = {
          statesLoaded:   true,   // viene del listener sobre la subcolección
          states:         m0?.states         ?? [],
          shiftStart:     m0?.shiftStart     ?? null,
          shiftEnd:       m0?.shiftEnd       ?? null,
          scheduledStart: m0?.scheduledStart ?? m0?.shiftStart ?? null,
          scheduledEnd:   m0?.scheduledEnd   ?? m0?.shiftEnd   ?? null,
          shiftRuntime:   m0?.shiftRuntime   ?? 0,
          avgShiftRuntime,
          overallRatio:   m0?.overallRatio   ?? 0,
          totalCycles:    cycles,
          totalUptimeSecAllMachines: totalUptimeSecAllMachines3,
          perMachine: perMachine3,
          breakdown: m0?.shiftRuntimeBreakdown ? {
            uptimeSec:          m0.shiftRuntimeBreakdown.uptimeSec,
            breakSec:           m0.shiftRuntimeBreakdown.breakSec,
            downtimeSec:        m0.shiftRuntimeBreakdown.downtimeSec,
            setupSec:           m0.shiftRuntimeBreakdown.setupSec,
            plannedDowntimeSec: m0.shiftRuntimeBreakdown.plannedDowntimeSec,
            totalTrackedSec:    m0.shiftRuntimeBreakdown.totalTrackedSec,
          } : null,
          correctionDetected: slxByShift.get(key)?.correctionDetected ?? false,
          reconciliationNote: slxByShift.get(key)?.reconciliationNote ?? null,
          effectiveStart: slxByShift.get(key)?.effectiveStart ?? null,
          effectiveEnd:   slxByShift.get(key)?.effectiveEnd   ?? null,
          officialStart:  slxByShift.get(key)?.officialStart  ?? null,
          officialEnd:    slxByShift.get(key)?.officialEnd    ?? null,
          lastSyncAt:     slxByShift.get(key)?.lastSyncAt     ?? null,
        }
        setSlxByShift(prev       => new Map(prev).set(key, cache))
        setSlxTotalsByShift(prev => new Map(prev).set(key, cycles))
      })
    })

    return () => { unsubs.forEach(u => u()) }
  }, [currentMonth, plantSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stats mensuales Shoplogix — calcula solo para el mes visible.
  // Se emite via onSlxMonthStatsLoaded para el panel lateral.
  const slxMonthlyStats = useMemo<SlxMonthlyStats | null>(() => {
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    type ShiftEntry = { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number }
    const withData: ShiftEntry[] = []
    let totalCycles = 0
    let sumUptime = 0
    let totalUptimeSec = 0
    // Contador "fuera de turno" (ver SlxMonthlyStats.unscheduled) — visibilidad
    // de horas extra productivas, no ranking.
    let unscheduledCycles = 0
    let unscheduledUptimeSec = 0
    const unscheduledDaySet = new Set<string>()
    // Acumulador por Baader: machineid → uptime + ciclos + counts MTTR macro/micro
    const perMachineAcc = new Map<string, {
      name: string
      uptimeSec: number
      totalCycles: number
      shiftCount: number
      sumUptimePct: number
      maintMacroSec: number
      maintMacroCount: number
      maintMicroSec: number
      maintMicroCount: number
    }>()
    const daySet = new Set<string>()
    // Iterar todos los shifts del mapa (soporta Turno día/noche legado + Turno 1/2/3 nuevo)
    // De-duplicar: si existe nuevo formato significativo, ignorar legado del mismo día.
    // Filtro de ruido vía `isSignificantCycleCount` (umbral SLX_NOISE_THRESHOLD).
    for (const [key, cache] of slxByShift) {
      if (!key.startsWith(prefix)) continue
      if (!isSignificantCycleCount(cache.totalCycles)) continue
      const dk      = key.slice(0, 10)   // 'YYYY-MM-DD'
      const shiftId = key.slice(12)      // 'Turno X' (saltar 'YYYY-MM-DD__')
      // Skip legado si ya existe nuevo formato significativo para ese día
      // El alias legacy 'Turno día' de Yal resuelve PRIMERO a 'Turno 1' y si no
      // a 'Turno 2' (getSlxShiftCandidates). Saltarlo si CUALQUIERA de los dos
      // numéricos ya tiene datos — sin el check de 'Turno 1' se doble-contaba la
      // madrugada en vivo (T1 con ciclos, T2 aún sin arrancar → T1≥50 y T2<50).
      if (shiftId === 'Turno día'   && (isSignificantCycleCount(slxByShift.get(`${dk}__Turno 2`)?.totalCycles)
                                      || isSignificantCycleCount(slxByShift.get(`${dk}__Turno 1`)?.totalCycles))) continue
      if (shiftId === 'Turno noche' && (isSignificantCycleCount(slxByShift.get(`${dk}__Turno 1`)?.totalCycles)
                                      || isSignificantCycleCount(slxByShift.get(`${dk}__Turno 3`)?.totalCycles))) continue
      const uptimePct = cache.avgShiftRuntime * 100
      // "Unscheduled" no es un turno (no tiene ventana programada — igual que
      // Shoplogix trata el tiempo sin turno como "Capacidad no definida",
      // EXCLUIDA antes del cálculo de OEE, confirmado inspeccionando su propia
      // cascada OEE). No entra a `withData` → nunca gana/pierde el ranking de
      // Mejor/Peor turno, ni infla el promedio de uptime, ni cuenta como turno
      // (ni de día ni de noche). Su producción SÍ sigue contando en
      // totalCycles/totalUptimeSec/perMachineMonth de abajo — los ciclos
      // procesados son reales y no se ocultan, solo no compiten como "turno".
      if (!isUnscheduledShift(shiftId)) {
        withData.push({ dateKey: dk, shiftId, uptimePct, totalCycles: cache.totalCycles })
        // sumUptime es el numerador de avgUptimePct (denominador: withData.length)
        // — debe excluir Unscheduled en el MISMO if, si no el promedio queda mal
        // (numerador con más turnos que el denominador).
        sumUptime += uptimePct
      } else {
        unscheduledCycles    += cache.totalCycles
        unscheduledUptimeSec += cache.totalUptimeSecAllMachines ?? 0
        unscheduledDaySet.add(dk)
      }
      totalCycles    += cache.totalCycles
      // Suma de las 3 Baaders (no solo M0), coherente con totalCycles que también
      // suma las 3. Representa horas-máquina totales procesando del mes.
      totalUptimeSec += cache.totalUptimeSecAllMachines ?? 0
      // Agregación por Baader individual del mes (uptime + MTTR macro/micro)
      for (const pm of cache.perMachine ?? []) {
        // Desde los agregados, no desde `states`: mismos números (paridad
        // verificada) y así el mes no depende de la subcolección `machines`.
        const maint = maintenanceTotalsFromAggregates(pm.stateAggregates ?? [])
        const acc = perMachineAcc.get(pm.machineid)
        if (acc) {
          acc.uptimeSec       += pm.uptimeSec
          acc.totalCycles     += pm.totalCycles
          acc.shiftCount      += 1
          acc.sumUptimePct    += pm.shiftRuntime * 100
          acc.maintMacroSec   += maint.macroSec
          acc.maintMacroCount += maint.macroCount
          acc.maintMicroSec   += maint.microSec
          acc.maintMicroCount += maint.microCount
        } else {
          perMachineAcc.set(pm.machineid, {
            name:            pm.name,
            uptimeSec:       pm.uptimeSec,
            totalCycles:     pm.totalCycles,
            shiftCount:      1,
            sumUptimePct:    pm.shiftRuntime * 100,
            maintMacroSec:   maint.macroSec,
            maintMacroCount: maint.macroCount,
            maintMicroSec:   maint.microSec,
            maintMicroCount: maint.microCount,
          })
        }
      }
      daySet.add(dk)
    }
    if (withData.length === 0) return null
    const sorted = [...withData].sort((a, b) => b.uptimePct - a.uptimePct)
    // Convención Yal: T1 (07:45-14:45 mañana) y T2 (14:45-00:00 tarde) son DÍA;
    // T3 (23:00-07:45 noche+madrugada) es NOCHE. Legacy "Turno día"/"Turno noche"
    // mantienen su mapeo. Antes T1 caía erróneamente en noche por descarte.
    const isDayShift = (id: string) =>
      id === 'Turno día' || id === 'Turno 1' || id === 'Turno 2'
    const perMachineMonth = [...perMachineAcc.entries()]
      .map(([machineid, v]) => ({
        machineid,
        name:            v.name,
        uptimeSec:       v.uptimeSec,
        totalCycles:     v.totalCycles,
        shiftCount:      v.shiftCount,
        avgUptimePct:    v.shiftCount > 0 ? v.sumUptimePct / v.shiftCount : 0,
        maintMacroSec:   v.maintMacroSec,
        maintMacroCount: v.maintMacroCount,
        maintMicroSec:   v.maintMicroSec,
        maintMicroCount: v.maintMicroCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))

    return {
      totalCycles,
      avgUptimePct: sumUptime / withData.length,
      totalUptimeSec,
      perMachineMonth,
      turnosWithData: withData.length,
      dayShiftsWithData:   withData.filter(e => isDayShift(e.shiftId)).length,
      nightShiftsWithData: withData.filter(e => !isDayShift(e.shiftId)).length,
      t1ShiftsWithData:    withData.filter(e => e.shiftId === 'Turno 1').length,
      t2ShiftsWithData:    withData.filter(e => e.shiftId === 'Turno 2').length,
      t3ShiftsWithData:    withData.filter(e => e.shiftId === 'Turno 3').length,
      daysWithData: daySet.size,
      bestShift:  sorted[0] ?? null,
      worstShift: sorted[sorted.length - 1] ?? null,
      unscheduled: {
        cycles: unscheduledCycles,
        uptimeSec: unscheduledUptimeSec,
        daysWithData: unscheduledDaySet.size,
      },
    }
  }, [currentMonth, slxByShift])

  // ── Panel panorámico: pareto de causas de paro cross-turno del mes ─────────
  // Agrega todos los estados de tipo 'downtime' de los turnos ya cargados
  // en slxByShift para el mes visible. Usa la primera máquina (m0) por diseño
  // del cache — proxy válido para la vista macro mensual.
  const monthParetoData = useMemo(() => {
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    // Agregados de todos los turnos del mes; el bucketing por razón lo hace
    // `paretoFromAggregates` al final, igual que antes lo hacía este bucle sobre
    // `states[]` (equivalencia verificada en shoplogixStateAggregates.test.ts).
    const monthAggregates: StateAggregate[] = []
    // Filtro de ruido SLX vía helper centralizado: turnos con <SLX_NOISE_THRESHOLD
    // ciclos no aportan al pareto del mes (paros aislados, datos pre-startup).
    for (const [key, cache] of slxByShift) {
      if (!key.startsWith(prefix)) continue
      if (!isSignificantCycleCount(cache.totalCycles)) continue
      const dk      = key.slice(0, 10)
      const shiftId = key.slice(12)
      // Saltar legado si ya existe nuevo formato significativo (igual que slxMonthlyStats)
      // El alias legacy 'Turno día' de Yal resuelve PRIMERO a 'Turno 1' y si no
      // a 'Turno 2' (getSlxShiftCandidates). Saltarlo si CUALQUIERA de los dos
      // numéricos ya tiene datos — sin el check de 'Turno 1' se doble-contaba la
      // madrugada en vivo (T1 con ciclos, T2 aún sin arrancar → T1≥50 y T2<50).
      if (shiftId === 'Turno día'   && (isSignificantCycleCount(slxByShift.get(`${dk}__Turno 2`)?.totalCycles)
                                      || isSignificantCycleCount(slxByShift.get(`${dk}__Turno 1`)?.totalCycles))) continue
      if (shiftId === 'Turno noche' && (isSignificantCycleCount(slxByShift.get(`${dk}__Turno 1`)?.totalCycles)
                                      || isSignificantCycleCount(slxByShift.get(`${dk}__Turno 3`)?.totalCycles))) continue
      // Fuente de agregados según filtro:
      //   - 'all' → suma las 3 Baaders (perMachine.flatMap). Antes usaba
      //     `cache.states` que es SOLO M0 → "Todas" daba lo mismo que "Ev 1".
      //     Bug detectado al hacer click en el filtro.
      //   - machineid específico → solo esa Baader.
      // Fallback a `cache.states` (M0) si perMachine está vacío (caches legacy).
      if (paretoMachineFilter === 'all') {
        const hasPerMachine = (cache.perMachine?.length ?? 0) > 0
        if (hasPerMachine) {
          for (const m of cache.perMachine) monthAggregates.push(...(m.stateAggregates ?? []))
        } else {
          monthAggregates.push(...aggregatesFromStates(cache.states))
        }
      } else {
        const pm = cache.perMachine?.find((m) => m.machineid === paretoMachineFilter)
        if (pm) monthAggregates.push(...(pm.stateAggregates ?? []))
      }
    }
    // Incluye TODAS las paradas (break, downtime, setup) y excluye uptime.
    // `paretoMaintOnly` deja solo las averías (type='downtime' menos los reasons
    // operacionales). El bucket prefiere `reason` (la causa que registró el
    // supervisor) sobre `name` (la categoría genérica de Shoplogix).
    return paretoFromAggregates(monthAggregates, paretoMaintOnly)
  }, [slxByShift, currentMonth, paretoMachineFilter, paretoMaintOnly])

  // ── Panel panorámico: disponibilidad diaria D/N del mes ──────────────────
  const availabilityTrend = useMemo((): Array<{
    dk: string
    day: SlxShiftCache | null
    night: SlxShiftCache | null
    /** shiftId real del slot "día" para mostrar como label (T1/T2/Día según convención). */
    dayShiftId: string | null
    /** shiftId real del slot "noche" (T3/Noche). */
    nightShiftId: string | null
  }> => {
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const prefix     = `${year}-${String(month + 1).padStart(2, '0')}-`
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result: Array<{ dk: string; day: SlxShiftCache | null; night: SlxShiftCache | null; dayShiftId: string | null; nightShiftId: string | null }> = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${prefix}${String(d).padStart(2, '0')}`
      // Slot "día": preferir T2 (tarde Yal), luego Turno día (Chonchi).
      const t2 = slxByShift.get(`${dk}__Turno 2`)
      const legacyDay = slxByShift.get(`${dk}__Turno día`)
      const dayCache = (t2 && (t2.totalCycles ?? 0) > 0) ? t2 : legacyDay ?? null
      const dayShiftId = (t2 && (t2.totalCycles ?? 0) > 0)
        ? 'Turno 2'
        : ((legacyDay?.totalCycles ?? 0) > 0 ? 'Turno día' : null)
      // Slot "noche": mejor entre T1/T3 con datos (más ciclos), fallback Turno noche.
      const candidates: Array<[string, SlxShiftCache | undefined]> = [
        ['Turno 1', slxByShift.get(`${dk}__Turno 1`)],
        ['Turno 3', slxByShift.get(`${dk}__Turno 3`)],
      ]
      const nightChosen = candidates
        .filter((entry): entry is [string, SlxShiftCache] => entry[1] != null && (entry[1].totalCycles ?? 0) > 0)
        .sort((a, b) => (b[1].totalCycles ?? 0) - (a[1].totalCycles ?? 0))[0]
      const legacyNight = slxByShift.get(`${dk}__Turno noche`)
      const nightCache = nightChosen?.[1] ?? legacyNight ?? null
      const nightShiftId = nightChosen?.[0]
        ?? ((legacyNight?.totalCycles ?? 0) > 0 ? 'Turno noche' : null)
      const dayHasData   = (dayCache?.totalCycles   ?? 0) > 0
      const nightHasData = (nightCache?.totalCycles ?? 0) > 0
      if (!dayHasData && !nightHasData) continue
      result.push({
        dk,
        day:   dayHasData   ? dayCache   : null,
        night: nightHasData ? nightCache : null,
        dayShiftId:   dayHasData   ? dayShiftId   : null,
        nightShiftId: nightHasData ? nightShiftId : null,
      })
    }
    return result
  }, [slxByShift, currentMonth])

  // Emite stats mensuales al padre para el panel lateral
  useEffect(() => {
    onSlxMonthStatsLoaded?.(slxMonthlyStats)
  }, [slxMonthlyStats, onSlxMonthStatsLoaded])

  // Anima las barras del pareto mensual cuando los datos llegan o cambian
  useEffect(() => {
    if (!monthParetoRef.current || monthParetoData.length === 0) return
    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return
    const bars = monthParetoRef.current.querySelectorAll<HTMLElement>('[data-month-pareto-bar]')
    if (bars.length === 0) return
    animate(bars, { scaleX: [0, 1], duration: 420, delay: stagger(70), ease: 'outExpo' })
  }, [monthParetoData])

  // Trend points mensuales — derivados de slxByShift ya cargado, sin llamadas extra.
  // Soporta ambos formatos: nuevo (Turno 1/2/3) con precedencia sobre legado (Turno día/noche).
  const monthTrendPoints = useMemo<{ day: MachineTrendPoint[]; night: MachineTrendPoint[] }>(() => {
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    const day: MachineTrendPoint[]   = []
    const night: MachineTrendPoint[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${prefix}${String(d).padStart(2, '0')}`
      // Day: Turno 2 (nuevo) > Turno día (legado). Solo ciclos significativos.
      const dayCache = slxByShift.get(`${dk}__Turno 2`) ?? slxByShift.get(`${dk}__Turno día`) ?? null
      if (dayCache && isSignificantCycleCount(dayCache.totalCycles)) {
        const shiftId = slxByShift.has(`${dk}__Turno 2`) ? 'Turno 2' : 'Turno día'
        day.push({ dateKey: dk, shiftId, overallRatio: dayCache.overallRatio, shiftRuntime: dayCache.avgShiftRuntime, totalCycles: dayCache.totalCycles })
      }
      // Night: el de mayor ciclos entre Turno 1/3 (nuevo) > Turno noche (legado)
      const newNights = (['Turno 1', 'Turno 3'] as string[])
        .map(id => ({ id, c: slxByShift.get(`${dk}__${id}`) ?? null }))
        .filter((x): x is { id: string; c: SlxShiftCache } => x.c !== null && isSignificantCycleCount(x.c.totalCycles))
        .sort((a, b) => b.c.totalCycles - a.c.totalCycles)
      const nightEntry  = newNights[0] ?? null
      const nightCache  = nightEntry?.c ?? slxByShift.get(`${dk}__Turno noche`) ?? null
      const nightShiftId = nightEntry?.id ?? 'Turno noche'
      if (nightCache && isSignificantCycleCount(nightCache.totalCycles)) {
        night.push({ dateKey: dk, shiftId: nightShiftId, overallRatio: nightCache.overallRatio, shiftRuntime: nightCache.avgShiftRuntime, totalCycles: nightCache.totalCycles })
      }
    }
    return { day, night }
  }, [slxByShift, currentMonth])

  // Tendencia por Baader individual (uptime% por máquina por día).
  // Estructura: { day/night → Map<machineid, { name, points: MachineTrendPoint[] }> }
  // Cada punto reutiliza el shape MachineTrendPoint pero su `shiftRuntime`
  // proviene de pm.shiftRuntime (la máquina específica), no del avg agregado.
  // overallRatio queda como el del turno (per-machine no aplica sin expected).
  const monthTrendByMachine = useMemo<{
    day:   Map<string, { name: string; points: MachineTrendPoint[] }>
    night: Map<string, { name: string; points: MachineTrendPoint[] }>
  }>(() => {
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}-`
    const day   = new Map<string, { name: string; points: MachineTrendPoint[] }>()
    const night = new Map<string, { name: string; points: MachineTrendPoint[] }>()
    const pushPm = (
      target: Map<string, { name: string; points: MachineTrendPoint[] }>,
      cache: SlxShiftCache,
      dk: string,
      shiftId: string,
    ) => {
      for (const pm of cache.perMachine ?? []) {
        const entry = target.get(pm.machineid)
        const point: MachineTrendPoint = {
          dateKey:      dk,
          shiftId,
          overallRatio: cache.overallRatio,
          shiftRuntime: pm.shiftRuntime,
          totalCycles:  pm.totalCycles,
        }
        if (entry) entry.points.push(point)
        else target.set(pm.machineid, { name: pm.name, points: [point] })
      }
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${prefix}${String(d).padStart(2, '0')}`
      const dayCache = slxByShift.get(`${dk}__Turno 2`) ?? slxByShift.get(`${dk}__Turno día`) ?? null
      if (dayCache && isSignificantCycleCount(dayCache.totalCycles)) {
        const shiftId = slxByShift.has(`${dk}__Turno 2`) ? 'Turno 2' : 'Turno día'
        pushPm(day, dayCache, dk, shiftId)
      }
      const newNights = (['Turno 1', 'Turno 3'] as string[])
        .map(id => ({ id, c: slxByShift.get(`${dk}__${id}`) ?? null }))
        .filter((x): x is { id: string; c: SlxShiftCache } => x.c !== null && isSignificantCycleCount(x.c.totalCycles))
        .sort((a, b) => b.c.totalCycles - a.c.totalCycles)
      const nightEntry  = newNights[0] ?? null
      const nightCache  = nightEntry?.c ?? slxByShift.get(`${dk}__Turno noche`) ?? null
      const nightShiftId = nightEntry?.id ?? 'Turno noche'
      if (nightCache && isSignificantCycleCount(nightCache.totalCycles)) {
        pushPm(night, nightCache, dk, nightShiftId)
      }
    }
    return { day, night }
  }, [slxByShift, currentMonth])

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
        const cached = await getDailySummary(selectedKey, shiftId, plantLineId)
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
  }, [selectedKey, turnos, summaries, plantLineId])

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  }

  const handleGoToToday = () => {
    const today = new Date()
    setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedDate(today)
  }

  const handleGoToLastRecord = () => {
    if (!latestRecordKey) return
    const d = new Date(`${latestRecordKey}T00:00:00`)
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setSelectedDate(d)
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

    const cached = await getDailySummary(dateKey, shiftId, plantLineId)
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
          plantLineId,
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
    const id = buildDailySummaryId(dateKey, shiftId, plantLineId)
    if (!window.confirm(`¿Eliminar el registro "${shiftId}" del ${dateKey}? Esta acción no se puede deshacer.`)) return
    setDeletingId(id)
    try {
      await deleteDailySummary(dateKey, shiftId, plantLineId)
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
    let visibleIdx = 0

    return (
      <div className="space-y-2 px-6 pt-3">
        {/* Header con count y D↔N button (solo en slide seleccionado) */}
        <div className="flex items-center justify-between">
          <div />
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
            const meta = KIND_META[kind]
            const isVirtual = hist.isSlxVirtual === true
            // "Unscheduled" no es un turno real (nunca tiene Excel/P0%): se
            // distingue de los demás virtuales SLX (turnos nombrados sin Excel,
            // que sí muestran 'ok'/verde por defecto porque no se conoce ningún
            // problema) — Unscheduled directamente no es evaluable como turno.
            const isUnscheduledCard = isVirtual && isUnscheduledShift(hist.shiftId)
            // Virtuals SLX (turnos nombrados): no hay P0% real → 'ok' (emerald)
            // por defecto y se muestra uptime% en su lugar del P0%.
            const status = isVirtual ? 'ok' : p0StatusFromPct(hist.pointZeroPct)
            const fragPieces = chip?.pieces ?? hist.totalPieces
            const fragP0Pieces = chip?.pointZeroPieces ?? hist.pointZeroPieces
            const fragWeight = chip?.weightKg ?? hist.totalWeightKg
            const isActiveForConfig = isSelectedSlide && selectedHistorical?.id === hist.id
            // Cross-ref Baader (Shoplogix): ¿cuántas piezas pasaron upstream?
            // Si Grader < 95% Baader → posible loss. Si Baader=0 (no data) → skip.
            const slxBaader = slxTotalsByShift.get(hist.id) ?? 0
            const baaderLossPct = slxBaader > 0 ? Math.max(0, (slxBaader - hist.totalPieces) / slxBaader * 100) : 0
            const showLossBadge = slxBaader > 100 && baaderLossPct > 5
            // Preservar `?linea=` del calendario al navegar al TurnoPage. Sin
            // esto, click "Ver detalle" desde pestaña Yal cae a chonchi default
            // y el TurnoPage no encuentra el summary Yal (busca con id sin
            // prefix). El bug se manifiesta como "Solo Shoplogix" en el detalle.
            const navTurnoLineaQuery = plantLineId !== DEFAULT_PLANT_LINE_ID
              ? `?linea=${encodeURIComponent(plantLineId)}`
              : ''
            const navigateToTurno = () =>
              navigate(
                `/analisis-grader/turno/${hist.dateKey}__${encodeURIComponent(hist.shiftId)}${navTurnoLineaQuery}`,
              )
            // Click en cuerpo de card: en slide seleccionado alterna selectedHistorical
            // (legacy del wizard); en slides adyacentes navega directo al TurnoPage.
            // Virtuals SLX no se seleccionan en el store (no son persisted) → navegan directo.
            const onCardClick = isVirtual
              ? navigateToTurno
              : isSelectedSlide
                ? () => setSelectedHistorical(isActiveForConfig ? null : hist)
                : navigateToTurno


            // ── Salida (orphan-source): strip compacto que invita a deslizar
            if (kind === 'salida') {
              const isHovered = hoveredFragId === fragId
              return (
                <div
                  key={hist.id}
                  data-frag-id={fragId}
                  data-card-anim
                  role="button"
                  tabIndex={0}
                  onClick={navigateToTurno}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      navigateToTurno()
                    }
                  }}
                  onMouseEnter={() => setHoveredFragId(fragId)}
                  onMouseLeave={() => setHoveredFragId(null)}
                  className={cn(
                    'rounded-lg border-l-4 px-3 py-2 cursor-pointer transition-all opacity-80 hover:opacity-100 lg:col-span-2',
                    P0_CARD_CLASS[status],
                    isHovered && 'ring-2 ring-white/80 ring-offset-1 ring-offset-background',
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
                        {chip?.direction === 'exits' ? (
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            Arranca aquí, continúa mañana — ver datos en{' '}
                            <span className="text-foreground">
                              {chip?.primaryDateKey ?? 'el día siguiente'}
                            </span>
                            {' '}como Madrugada
                          </p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground leading-tight">
                            Sin actividad real en este día — desliza{' '}
                            <span className="text-foreground">→</span>{' '}
                            para ver datos en {chip?.primaryDateKey ?? 'el siguiente día'}
                          </p>
                        )}
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

            // ── Card completa (día / noche)
            const isHovered = hoveredFragId === fragId
            // Card SLX-virtual con ciclos bajo el umbral de operación normal:
            // estilo ámbar dashed + badge advirtiendo. No se filtra la card —
            // la data existe y se muestra; solo se distingue para que el
            // operador NO la lea como producción normal.
            const isLowActivity = isVirtual && isLowActivityCycleCount(fragPieces)
            return (
              <div
                key={hist.id}
                data-frag-id={fragId}
                data-card-anim
                role="button"
                tabIndex={0}
                onClick={onCardClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCardClick()
                  }
                }}
                onMouseEnter={() => setHoveredFragId(fragId)}
                onMouseLeave={() => setHoveredFragId(null)}
                className={cn(
                  'rounded-lg border-2 border-l-4 px-3 py-2.5 space-y-2 cursor-pointer transition-all',
                  isUnscheduledCard
                    ? 'border-slate-500/25 bg-slate-500/5 hover:border-slate-500/40'
                    : isLowActivity
                      ? 'border-dashed border-amber-500/40 bg-amber-500/5'
                      : P0_CARD_CLASS[status],
                  isActiveForConfig &&
                    'ring-2 ring-emerald-500 ring-offset-1 ring-offset-background',
                  isHovered && !isActiveForConfig &&
                    'ring-2 ring-white/80 ring-offset-1 ring-offset-background',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-base leading-none">{meta.icon}</span>
                    <p className="text-sm font-semibold">
                      {/* Yal: usar el shiftId real de Shoplogix (Turno 1/2/3) en
                          lugar de la convención inventada "Día/Noche". Chonchi:
                          KIND_META.title sigue siendo Día/Noche/Madrugada como
                          se ha mostrado siempre. "Unscheduled" es la única
                          excepción: se traduce siempre a su label amigable —
                          antes salía crudo ("Unscheduled") incluso en Yal. */}
                      {isUnscheduledCard
                        ? getShiftMeta(hist.shiftId).label
                        : plantLine.isClassificationPlant === false ? hist.shiftId : meta.title}
                    </p>
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
                    {showLossBadge && !isVirtual && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-rose-500/15 text-rose-600 border border-rose-500/30 font-medium shrink-0"
                        title={`Grader registró ${hist.totalPieces.toLocaleString('es-CL')} piezas. Baader 142 procesó ${slxBaader.toLocaleString('es-CL')} upstream. Posible pérdida de data en este turno (~${baaderLossPct.toFixed(1)}%).`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        −{baaderLossPct.toFixed(0)}% vs Baader
                      </span>
                    )}
                    {isVirtual && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-sky-500/15 text-sky-500 border border-sky-500/30 font-medium shrink-0"
                        title="Sin Excel del Marelec cargado. Datos derivados de Shoplogix (ciclos Baader)."
                      >
                        Solo Shoplogix
                      </span>
                    )}
                    {isLowActivity && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-amber-500/15 text-amber-500 border border-amber-500/30 font-medium shrink-0"
                        title={`Solo ${fragPieces.toLocaleString('es-CL')} ciclos en este turno (menos de ${SLX_LOW_ACTIVITY_THRESHOLD}). Puede ser mantenimiento, limpieza, sensor en vacío o un proceso muy corto. Revisar antes de leerlo como producción normal.`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        Actividad baja
                      </span>
                    )}
                  </div>
                  {isUnscheduledCard ? (
                    // Sin turno no hay "uptime del turno" que mostrar (no hay
                    // ventana programada contra la cual medirlo) — mostrar el
                    // % de uptime acá era el mismo error que "P0 0.00%" del
                    // tooltip del timeline: un número que parece evaluar algo
                    // que en realidad no es evaluable. Se muestran los ciclos
                    // reales (el dato honesto: esa producción SÍ se registró).
                    <span
                      className="text-xl font-bold tabular-nums text-slate-400"
                      title="Sin turno configurado en Shoplogix para esta ventana — no se calcula uptime de turno."
                    >
                      {hist.totalPieces.toLocaleString('es-CL')}
                    </span>
                  ) : isVirtual ? (
                    <span
                      className="text-xl font-bold tabular-nums text-sky-500"
                      title={`Uptime promedio Baader (${((hist.slxUptimeFraction ?? 0) * 100).toFixed(0)}% del turno).`}
                    >
                      {((hist.slxUptimeFraction ?? 0) * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span
                      className={cn(
                        'text-xl font-bold tabular-nums',
                        p0StatusColor(status),
                      )}
                    >
                      {hist.pointZeroPct}%
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-tight">
                  {hist.shiftId}
                  <span className="opacity-60"> · </span>
                  <strong className="text-foreground/90">
                    {formatShiftTimeRange(hist)}
                  </strong>
                  {chip?.pctOfShift != null && chip.pctOfShift < 100 && (
                    <span className="opacity-70"> · {Math.round(chip.pctOfShift)}% del turno aquí</span>
                  )}
                  {isVirtual && (
                    <span className="opacity-70"> · Uptime Baader</span>
                  )}
                </p>
                {!isVirtual && hist.hasPieceData !== undefined && (!hist.hasPieceData || !hist.hasGate0Data) && (
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
                  <div className="rounded bg-background px-2 py-1">
                    <p className="text-muted-foreground">{isVirtual ? 'Ciclos Baader' : 'Piezas'}</p>
                    <p className="font-semibold tabular-nums">{fragPieces.toLocaleString('es-CL')}</p>
                  </div>
                  {!isVirtual && (
                    <div className="rounded bg-background px-2 py-1">
                      <p className="text-muted-foreground">P0 piezas</p>
                      <p className="font-semibold tabular-nums">{fragP0Pieces.toLocaleString('es-CL')}</p>
                    </div>
                  )}
                  {!isVirtual && fragWeight != null && (
                    <div className="rounded bg-background px-2 py-1">
                      <p className="text-muted-foreground">Peso</p>
                      <p className="font-semibold tabular-nums">
                        {fragWeight >= 1000
                          ? `${(fragWeight / 1000).toFixed(1)} t`
                          : `${fragWeight.toFixed(0)} kg`}
                      </p>
                    </div>
                  )}
                  {!isVirtual && (() => {
                    const rate = safeRate(hist)
                    return rate != null ? (
                      <div className="rounded bg-background px-2 py-1">
                        <p className="text-muted-foreground">pz/hora</p>
                        <p className="font-semibold tabular-nums">{rate.toLocaleString('es-CL')}</p>
                      </div>
                    ) : null
                  })()}
                  {isVirtual && (
                    <div className="rounded bg-sky-500/5 border border-sky-500/20 px-2 py-1 col-span-1">
                      <p className="text-muted-foreground">P0%</p>
                      <p className="font-semibold tabular-nums text-muted-foreground/70">
                        — sin Excel
                      </p>
                    </div>
                  )}
                </div>
                {!isVirtual && hist.topP0Causes && hist.topP0Causes.length > 0 && (
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
                    {isSelectedSlide && !isVirtual && (
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
                  {isSelectedSlide && !isVirtual && plantLine.isClassificationPlant !== false && (
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
    <div className={cn(
      stacked
        ? 'flex flex-col gap-4'
        : equalColumns
          ? 'grid grid-cols-1 lg:grid-cols-2 gap-4'
          : 'grid grid-cols-1 lg:grid-cols-3 gap-4',
      className,
    )}>
      <Card className={cn('relative', !stacked && !equalColumns && 'lg:col-span-2')}>
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
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={handleGoToToday}>
                Hoy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
                onClick={handleGoToLastRecord}
                disabled={!latestRecordKey}
                title={latestRecordKey ? `Último registro: ${latestRecordKey}` : 'Cargando...'}
              >
                Último
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Vista: qué métrica muestra el chip principal */}
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              {(['p0', 'piezas', 'uptime'] as CalendarView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setCalendarView(v)}
                  className={cn(
                    'text-[10px] font-semibold px-2 py-1 leading-none transition-colors',
                    calendarView === v
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                >
                  {v === 'p0' ? 'P0%' : v === 'piezas' ? 'Pzs OK' : 'UPT'}
                </button>
              ))}
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
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {dayNames.map((day) => (
              <div key={day} className="text-center text-[11px] font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {days.map((day, index) => {
              if (!day) return <div key={`empty-${index}`} className="h-14" />

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
              // Datos presentes (positivo): si TODOS los turnos del día tienen
              // PP/P0 cargado, mostramos badge verde para que el usuario vea
              // de un vistazo qué días ya están completos vs sólo Shoplogix.
              const hasAllPiece = hasData && dayHistorical.every((s) => s.hasPieceData === true)
              const hasAllGate0 = hasData && dayHistorical.every((s) => s.hasGate0Data === true)
              const isSelected = selectedDate?.toDateString() === day.toDateString()

              // Indicadores Shoplogix para días sin datos Grader (o con datos
              // PARCIALES en plantas no clasificadoras como Yal — el Excel solo
              // cubre 1 turno, los demás turnos del día deben mostrarse via SLX).
              //
              // Convención calendárica: el día visual `dayKey` muestra
              //   - Turno 2 / Turno día con dateKey CF == dayKey (tarde-noche del día)
              //   - Turno 1 con dateKey CF == dayKey (mañana del día)
              //   - Turno 3 con dateKey CF == dayKey-1 (madrugada del día — almacenado
              //     bajo el día anterior por la convención "día laboral" del CF).
              // prevDayKey siempre computado (necesario para badge SLX + chips noche)
              // ── Convención simple Día/Noche para Yal ─────────────────────
              // Yal opera con 2 turnos conceptuales:
              //   • "Turno día" = mañana + tarde (mapea a SLX T1 07:45-15:15
              //     + T2 15:15-00:00 sumados; o legado "Turno día").
              //   • "Turno noche" = noche que arranca a las 23:00 del Y y
              //     cubre la madrugada del Y+1 (mapea a SLX T3 del Y; o
              //     legado "Turno noche").
              // El T3 SLX (23:00→07:45) pertenece al día Y donde ARRANCA, NO
              // al Y+1 donde termina su madrugada. No hay turno "madrugada"
              // separado.
              //
              // Si Excel cargado para un turno del Y, su chip se ve via
              // renderShiftChip arriba — y se oculta el chip SLX equivalente
              // para no duplicar (Excel y SLX miden distinta cosa: Marelec
              // piezas downstream vs Baader cycles upstream del MISMO período).
              const hasExcelDay   = chipsForDay.some(c => c.role === 'primary' && (c.shiftId === 'Turno día' || c.shiftId === 'Turno 1' || c.shiftId === 'Turno 2'))
              const hasExcelNight = chipsForDay.some(c => c.role === 'primary' && (c.shiftId === 'Turno noche' || c.shiftId === 'Turno 3'))
              const showSlx       = !hasData || plantLine.isClassificationPlant === false
              const showSlxDay    = showSlx && !hasExcelDay
              const showSlxNight  = showSlx && !hasExcelNight
              // Para plantas no-clasificadoras (Yal): ignorar docs legacy
              // `Turno día`/`Turno noche` en Firestore — son ruido del sync
              // upstream (la planta opera con T1/T2/T3, no con Día/Noche).
              const useLegacyDayNight = plantLine.isClassificationPlant !== false
              // Dos slots por celda: "día" (arriba) y "noche/madrugada" (abajo).
              //
              // Yal (no-clasificadora): asignar cada turno numérico real a su slot
              // por HORA DE INICIO real (scheduledStart), NO por nombre. Madrugada/
              // noche (start <12:00 o >=20:00) → slot noche; tarde (12:00-20:00) →
              // slot día. Antes se sumaba T1+T2 en el slot día ("mañana+tarde"), y
              // cuando Shoplogix renombró la madrugada de "Turno 3" a "Turno 1" esa
              // madrugada cayó en el slot día y se SUMÓ con el T2 de la tarde → un
              // solo chip (bug 2026-07-08: día 8 mostraba "T2 18.770" = 4.797+13.973
              // en vez de dos chips T1 4.797 + T2 13.973). Bucketear por horario los
              // separa igual que a T2+T3.
              //
              // Chonchi (clasificadora): mantiene el mapeo por nombre (día=T2/legado,
              // noche=T1/T3/legado); sus turnos no cambiaron y sus horarios de noche
              // (21:30) no encajan en la regla de madrugada de Yal.
              const isNonClassifCal = plantLine.isClassificationPlant === false
              let slxDayCycles = 0, slxNightCycles = 0
              let slxDayNav: { cfDateKey: string; shiftId: string } | null = null
              let slxNightNav: { cfDateKey: string; shiftId: string } | null = null
              let slxDayUptimePct = 0, slxNightUptimePct = 0
              if (isNonClassifCal) {
                const hasExcelForShift = (sid: string) =>
                  chipsForDay.some(c => c.role === 'primary' && c.shiftId === sid)
                const dayBucket: Array<{ shiftId: string; cycles: number; uptimePct: number }> = []
                const nightBucket: Array<{ shiftId: string; cycles: number; uptimePct: number }> = []
                if (showSlx) {
                  for (const sid of ['Turno 1', 'Turno 2', 'Turno 3']) {
                    if (hasExcelForShift(sid)) continue  // ya se ve vía chip de Excel
                    const cyc = slxTotalsByShift.get(`${dayKey}__${sid}`) ?? 0
                    if (!(cyc > 0)) continue
                    const cache = slxByShift.get(`${dayKey}__${sid}`)
                    const startHour = cache?.scheduledStart?.getUTCHours() ?? 0
                    const uptimePct = (cache?.avgShiftRuntime ?? 0) * 100
                    const isNightStart = startHour < 12 || startHour >= 20
                    ;(isNightStart ? nightBucket : dayBucket).push({ shiftId: sid, cycles: cyc, uptimePct })
                  }
                }
                // Si más de un turno cae en el mismo slot, mostrar el de más ciclos.
                const pickSlot = (arr: typeof dayBucket) =>
                  arr.slice().sort((a, b) => b.cycles - a.cycles)[0] ?? null
                const dayPick = pickSlot(dayBucket)
                const nightPick = pickSlot(nightBucket)
                slxDayCycles = dayPick?.cycles ?? 0
                slxNightCycles = nightPick?.cycles ?? 0
                slxDayNav = dayPick ? { cfDateKey: dayKey, shiftId: dayPick.shiftId } : null
                slxNightNav = nightPick ? { cfDateKey: dayKey, shiftId: nightPick.shiftId } : null
                slxDayUptimePct = dayPick?.uptimePct ?? 0
                slxNightUptimePct = nightPick?.uptimePct ?? 0
              } else {
                const slxT1Cycles = showSlxDay ? (slxTotalsByShift.get(`${dayKey}__Turno 1`) ?? 0) : 0
                const slxT2Cycles = showSlxDay ? (slxTotalsByShift.get(`${dayKey}__Turno 2`) ?? 0) : 0
                const slxLegDay   = (showSlxDay && useLegacyDayNight) ? (slxTotalsByShift.get(`${dayKey}__Turno día`) ?? 0) : 0
                const slxNewDay   = slxT1Cycles + slxT2Cycles  // Chonchi: T1+T2 = jornada día
                slxDayCycles = slxNewDay > 0 ? slxNewDay : slxLegDay
                slxDayNav = slxT2Cycles >= slxT1Cycles && slxT2Cycles > 0
                  ? { cfDateKey: dayKey, shiftId: 'Turno 2' }
                  : slxT1Cycles > 0 ? { cfDateKey: dayKey, shiftId: 'Turno 1' }
                  : slxLegDay > 0 ? { cfDateKey: dayKey, shiftId: 'Turno día' } : null
                const slxT3Cycles = showSlxNight ? (slxTotalsByShift.get(`${dayKey}__Turno 3`) ?? 0) : 0
                const slxLegNight = (showSlxNight && useLegacyDayNight) ? (slxTotalsByShift.get(`${dayKey}__Turno noche`) ?? 0) : 0
                slxNightCycles = slxT3Cycles > 0 ? slxT3Cycles : slxLegNight
                slxNightNav = slxT3Cycles > 0
                  ? { cfDateKey: dayKey, shiftId: 'Turno 3' }
                  : slxLegNight > 0 ? { cfDateKey: dayKey, shiftId: 'Turno noche' } : null
                const ut1 = slxT1Cycles > 0 ? (slxByShift.get(`${dayKey}__Turno 1`)?.avgShiftRuntime ?? 0) : null
                const ut2 = slxT2Cycles > 0 ? (slxByShift.get(`${dayKey}__Turno 2`)?.avgShiftRuntime ?? 0) : null
                const utLeg = slxLegDay > 0 ? (slxByShift.get(`${dayKey}__Turno día`)?.avgShiftRuntime ?? 0) : null
                const daySamples = [ut1, ut2, utLeg].filter((x): x is number => x !== null)
                slxDayUptimePct = daySamples.length > 0 ? (daySamples.reduce((a, b) => a + b, 0) / daySamples.length) * 100 : 0
                const nightKey = slxT3Cycles > 0 ? `${dayKey}__Turno 3` : `${dayKey}__Turno noche`
                if (slxNightCycles > 0) slxNightUptimePct = (slxByShift.get(nightKey)?.avgShiftRuntime ?? 0) * 100
              }
              // Filtra ruido SLX (turnos con <SLX_NOISE_THRESHOLD ciclos).
              // Centralizado en `isSignificantCycleCount` para garantizar
              // consistencia con chips, stats mensuales, pareto y virtuals.
              const hasSlxDay   = isSignificantCycleCount(slxDayCycles)
              const hasSlxNight = isSignificantCycleCount(slxNightCycles)
              const hasAnySlx   = hasSlxDay || hasSlxNight
              // Badge de fuente: SLX existe si hay ciclos significativos en
              // cualquier turno del día (se verifica independiente de hasData
              // para mostrar badge incluso en días Grader).
              const hasSLXBadge = isSignificantCycleCount(slxTotalsByShift.get(`${dayKey}__Turno 2`))
                || isSignificantCycleCount(slxTotalsByShift.get(`${dayKey}__Turno día`))
                || isSignificantCycleCount(slxTotalsByShift.get(`${dayKey}__Turno 3`))
                || isSignificantCycleCount(slxTotalsByShift.get(`${dayKey}__Turno 1`))
                || isSignificantCycleCount(slxTotalsByShift.get(`${dayKey}__Turno noche`))
              // Día confirmado sin producción: Shoplogix ya fue escaneado y no hay ciclos
              const dayScanned = !hasData && !hasAnySlx && (
                slxByShift.has(`${dayKey}__Turno 2`) ||
                slxByShift.has(`${dayKey}__Turno día`)
              )

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
                /**
                 * Día del calendario como `<div role="button">` (no `<button>`).
                 * El día contiene chips D/N clicables que SON `<button>` reales
                 * (ver más abajo) — HTML inválido tener `<button>` dentro de
                 * `<button>`. Mantenemos accesibilidad con role + tabIndex +
                 * onKeyDown (Enter/Space ejecutan el click).
                 */
                <div
                  key={dayKey}
                  role="button"
                  tabIndex={dimByFilter ? -1 : 0}
                  className={cn(
                    'min-h-[56px] p-1 border rounded-md text-left transition-all flex flex-col gap-px cursor-pointer',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
                    isToday(day) && !isSelected && 'border-primary/60 bg-primary/5',
                    isSelected && 'ring-2 ring-primary border-primary bg-primary/8',
                    !hasData && !hasAnySlx && dayUploads.length === 0 && 'opacity-40',
                    hasData && worstP0 !== null && worstP0 >= DEFAULT_P0_CRITICAL_PCT && 'border-red-400/50 bg-red-500/3',
                    hasData && worstP0 !== null && worstP0 >= DEFAULT_P0_ALERT_PCT && worstP0 < DEFAULT_P0_CRITICAL_PCT && 'border-amber-400/50',
                    hasData && worstP0 !== null && worstP0 < DEFAULT_P0_ALERT_PCT && 'border-emerald-400/40',
                    !hasData && hasAnySlx && 'border-sky-500/30 bg-sky-500/3',
                    dimByFilter && 'opacity-20 pointer-events-none',
                    dayHasUntagged && !isSelected && 'border-amber-400/70 bg-amber-500/5',
                  )}
                  onClick={() => {
                    userInteractedRef.current = true
                    setSelectedDate(day)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      userInteractedRef.current = true
                      setSelectedDate(day)
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'text-xs font-semibold leading-none',
                      isToday(day) && 'text-primary',
                      isSelected && 'text-primary',
                    )}>
                      {day.getDate()}
                    </span>
                    <div className="flex items-center gap-0.5">
                      {!hasData && dayUploads.length > 0 && (
                        <span className="text-[7px] text-muted-foreground leading-none border rounded px-0.5">
                          {dayUploads.length}f
                        </span>
                      )}
                      {/* Dots de fuente de datos: azul=SLX, verde=Grader Excel */}
                      {hasSLXBadge && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-sky-400/70 inline-block shrink-0"
                          title="Shoplogix sincronizado"
                        />
                      )}
                      {hasData && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-400/70 inline-block shrink-0"
                          title="Excel Grader cargado"
                        />
                      )}
                    </div>
                  </div>

                  {/* Per-shift chips (Camino 2-B refinado: primary/secondary/orphan-source) */}
                  {chipsForDay
                    .filter((chip) => chip.role === 'primary')
                    .map((chip) => (
                      <ShiftChip
                        key={`${chip.summaryId}-${chip.role}-${chip.renderInDateKey}`}
                        chip={chip}
                        untaggedCount={filterUntagged ? (untaggedCounts.get(chip.summaryId) ?? null) : null}
                        view={calendarView}
                        slxByShift={slxByShift}
                      />
                    ))}

                  {/* Chips Shoplogix para días sin datos Grader — clicables → TurnoPage.
                      En Yal (plantas no clasificadoras) también mostrar SLX
                      cuando hasData=true — el Excel del turno noche no cubre
                      los demás turnos del día. */}
                  {showSlx && hasAnySlx && (() => {
                    const lineaQ = plantLineId !== DEFAULT_PLANT_LINE_ID
                      ? `?linea=${encodeURIComponent(plantLineId)}`
                      : ''
                    const slxUptimeClass = (upt: number) =>
                      upt >= 70 ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                      : upt >= 40 ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                      : upt > 0  ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                      : 'bg-sky-500/15 text-sky-400 hover:bg-sky-500/25'
                    // "Baja actividad": el turno existe pero los ciclos están
                    // muy por debajo de operación normal — puede ser limpieza,
                    // sensor en vacío, o test. NO se filtra (la data es real)
                    // pero se distingue visualmente con borde punteado ámbar
                    // para que el operador no lo confunda con producción.
                    const isDayLowActivity   = isLowActivityCycleCount(slxDayCycles)
                    const isNightLowActivity = isLowActivityCycleCount(slxNightCycles)
                    const lowActivityClass = 'bg-amber-500/5 text-amber-500/70 hover:bg-amber-500/15 border border-dashed border-amber-500/30'
                    const dayColorClass   = isDayLowActivity   ? lowActivityClass : slxUptimeClass(slxDayUptimePct)
                    const nightColorClass = isNightLowActivity ? lowActivityClass
                      : slxNightUptimePct > 0 ? slxUptimeClass(slxNightUptimePct)
                      : 'bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25'
                    // Valor mostrado según vista
                    const slxDayValue = calendarView === 'uptime'
                      ? (slxDayUptimePct > 0 ? `${slxDayUptimePct.toFixed(0)}%` : '—')
                      : calendarView === 'p0' ? '—'
                      : slxDayCycles.toLocaleString('es-CL')
                    const slxNightValue = calendarView === 'uptime'
                      ? (slxNightUptimePct > 0 ? `${slxNightUptimePct.toFixed(0)}%` : '—')
                      : calendarView === 'p0' ? '—'
                      : slxNightCycles.toLocaleString('es-CL')
                    // Label del chip — en plantas clasificadoras (Chonchi) usa D/N;
                    // en no-clasificadoras (Yal) usa la nomenclatura real del turno
                    // (T1/T2/T3) para no confundir con la convención Día/Noche del
                    // Grader. Si por alguna razón sigue siendo legacy día/noche en
                    // un doc, se respeta el shiftId que tenga.
                    const isNonClassif = plantLine.isClassificationPlant === false
                    const labelFor = (shiftId: string | undefined, fallback: 'D' | 'N'): string => {
                      if (!shiftId) return fallback
                      if (!isNonClassif) return fallback
                      if (shiftId === 'Turno 1') return 'T1'
                      if (shiftId === 'Turno 2') return 'T2'
                      if (shiftId === 'Turno 3') return 'T3'
                      return fallback
                    }
                    const slxDayLabel   = labelFor(slxDayNav?.shiftId, 'D')
                    const slxNightLabel = labelFor(slxNightNav?.shiftId, 'N')
                    // Corrección post-brief detectada por checkShiftReconciliation (Cloud
                    // Function): Shoplogix cambió estos datos DESPUÉS de haberse reportado
                    // por Telegram. Se marca con 🔄 siempre visible (no solo al hover) para
                    // que también se note en mobile sin necesidad de tap.
                    const dayCorrection = slxDayNav
                      ? slxByShift.get(`${slxDayNav.cfDateKey}__${slxDayNav.shiftId}`)
                      : null
                    const nightCorrection = slxNightNav
                      ? slxByShift.get(`${slxNightNav.cfDateKey}__${slxNightNav.shiftId}`)
                      : null
                    return (
                      <>
                        {hasSlxDay && slxDayNav && (
                          <ChipTooltip
                            hoverOnly
                            content={
                              <div className="space-y-1">
                                {isDayLowActivity && (
                                  <div className="text-amber-400">{`⚠ Actividad baja (<${SLX_LOW_ACTIVITY_THRESHOLD} ciclos) — revisar si fue producción real o ruido del sensor`}</div>
                                )}
                                {dayCorrection?.correctionDetected && (
                                  <div className="text-sky-300">{`🔄 Corrección post-brief: ${dayCorrection.reconciliationNote ?? 'los datos cambiaron después de reportados'}`}</div>
                                )}
                                <SlxTurnoTooltipBody cache={dayCorrection ?? undefined} shiftId={slxDayNav.shiftId} cycles={slxDayCycles} />
                                <div className="text-slate-400 text-[9px]">{hasExcelDay ? 'Sin Excel del Marelec — solo conteo upstream' : 'Click para ver detalle Shoplogix'}</div>
                              </div>
                            }
                          >
                            <button
                              className={cn('flex items-center justify-between rounded px-1 py-px leading-none transition-colors w-full', dayColorClass)}
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/analisis-grader/turno/${slxDayNav.cfDateKey}__${encodeURIComponent(slxDayNav.shiftId)}${lineaQ}`)
                              }}
                            >
                              <span className="text-[8px] font-medium opacity-80">{slxDayLabel}</span>
                              <span className="text-[9px] font-bold tabular-nums">{slxDayValue}</span>
                              {dayCorrection?.correctionDetected && <span className="text-[8px]">🔄</span>}
                            </button>
                          </ChipTooltip>
                        )}
                        {hasSlxNight && slxNightNav && (
                          <ChipTooltip
                            hoverOnly
                            content={
                              <div className="space-y-1">
                                {isNightLowActivity && (
                                  <div className="text-amber-400">{`⚠ Actividad baja (<${SLX_LOW_ACTIVITY_THRESHOLD} ciclos) — revisar si fue producción real o ruido del sensor`}</div>
                                )}
                                {nightCorrection?.correctionDetected && (
                                  <div className="text-sky-300">{`🔄 Corrección post-brief: ${nightCorrection.reconciliationNote ?? 'los datos cambiaron después de reportados'}`}</div>
                                )}
                                <SlxTurnoTooltipBody
                                  cache={nightCorrection ?? undefined}
                                  shiftId={slxNightNav.shiftId}
                                  cycles={slxNightCycles}
                                />
                                <div className="text-slate-400 text-[9px]">
                                  {slxNightNav.shiftId === 'Turno 3' ? 'Turno noche — cubre la madrugada. ' : ''}
                                  {hasExcelNight ? 'Sin Excel del Marelec — solo conteo upstream' : 'Click para ver detalle Shoplogix'}
                                </div>
                              </div>
                            }
                          >
                            <button
                              className={cn('flex items-center justify-between rounded px-1 py-px leading-none transition-colors w-full', nightColorClass)}
                              onClick={(e) => {
                                e.stopPropagation()
                                navigate(`/analisis-grader/turno/${slxNightNav.cfDateKey}__${encodeURIComponent(slxNightNav.shiftId)}${lineaQ}`)
                              }}
                            >
                              <span className="text-[8px] font-medium opacity-80">{slxNightLabel}</span>
                              <span className="text-[9px] font-bold tabular-nums">{slxNightValue}</span>
                              {nightCorrection?.correctionDetected && <span className="text-[8px]">🔄</span>}
                            </button>
                          </ChipTooltip>
                        )}
                      </>
                    )
                  })()}

                  {/* Chips placeholder D/N para días sin datos Grader ni SLX productivo — navegan al ready-state.
                      Mobile (<sm): ocultos para reducir ruido visual en el grid; el día sin datos
                      solo muestra el número, lo que permite enfocar la atención en los días con data.
                      Desktop: visibles como atajos directos a TurnoPage en estado vacío. */}
                  {!hasData && !hasAnySlx && dayUploads.length === 0 && (() => {
                    const lineaQ = plantLineId !== DEFAULT_PLANT_LINE_ID
                      ? `?linea=${encodeURIComponent(plantLineId)}`
                      : ''
                    return (
                      <>
                        <button
                          className="hidden sm:flex items-center justify-between rounded px-1 py-px leading-none transition-colors w-full bg-slate-800/40 text-slate-600 hover:bg-slate-700/40 hover:text-slate-400"
                          title={`Ver Turno día ${dayKey} — sin datos registrados`}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/analisis-grader/turno/${dayKey}__${encodeURIComponent('Turno día')}${lineaQ}`)
                          }}
                        >
                          <span className="text-[8px] font-medium">D</span>
                          <span className="text-[9px] opacity-30">—</span>
                        </button>
                        <button
                          className="hidden sm:flex items-center justify-between rounded px-1 py-px leading-none transition-colors w-full bg-slate-800/40 text-slate-600 hover:bg-slate-700/40 hover:text-slate-400"
                          title={`Ver Turno noche ${dayKey} — sin datos registrados`}
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/analisis-grader/turno/${dayKey}__${encodeURIComponent('Turno noche')}${lineaQ}`)
                          }}
                        >
                          <span className="text-[8px] font-medium">N</span>
                          <span className="text-[9px] opacity-30">—</span>
                        </button>
                      </>
                    )
                  })()}

                  {/* Total del día: suma 00:00→24:00 de todos los turnos que aportaron
                      a este día calendario (Excel primary + SLX día/noche mostrados —
                      son mutuamente excluyentes vía hasExcelDay/hasExcelNight, sin doble
                      conteo). Hoy son 2 turnos en Yal, mañana 3 sin tocar este cálculo:
                      simplemente se suman los chips que la celda ya está mostrando. */}
                  {(() => {
                    const excelPieces = chipsForDay
                      .filter((c) => c.role === 'primary')
                      .reduce((sum, c) => sum + (c.pieces ?? 0), 0)
                    const slxOnlyPieces = (hasSlxDay ? slxDayCycles : 0) + (hasSlxNight ? slxNightCycles : 0)
                    const dayTotal = excelPieces + slxOnlyPieces
                    if (dayTotal <= 0) return null
                    // Detalle por turno SLX — mismo texto plano que el tooltip
                    // de cada chip, separado por una línea en blanco.
                    const slxDetail = (nav: { cfDateKey: string; shiftId: string } | null, cycles: number) => {
                      if (!nav || cycles <= 0) return null
                      const cache = slxByShift.get(`${nav.cfDateKey}__${nav.shiftId}`)
                      return (
                        <div key={nav.shiftId} className="mt-1.5">
                          <SlxTurnoTooltipBody cache={cache} shiftId={nav.shiftId} cycles={cycles} />
                        </div>
                      )
                    }
                    return (
                      <ChipTooltip
                        className="mt-auto flex items-center justify-between rounded px-1 py-px leading-none bg-slate-500/10 text-muted-foreground hover:bg-slate-500/20 cursor-help"
                        content={
                          <div>
                            {`Total del día · ${dayKey} · `}
                            <span
                              className="font-mono tabular-nums font-semibold"
                              style={{ backgroundColor: '#6c9a8a38', color: '#6c9a8a', borderRadius: '3px', padding: '0 3px' }}
                            >
                              {dayTotal.toLocaleString('es-CL')}
                            </span>
                            {chipsForDay.filter((c) => c.role === 'primary').map((c) => (
                              <div key={c.summaryId} className="mt-1.5">
                                {`${getShiftMeta(c.shiftId).shortLabel} · ${(c.pieces ?? 0).toLocaleString('es-CL')} piezas (Excel)`}
                              </div>
                            ))}
                            {hasSlxDay && slxDetail(slxDayNav, slxDayCycles)}
                            {hasSlxNight && slxDetail(slxNightNav, slxNightCycles)}
                            <div className="mt-1.5 text-slate-400 text-[9px]">Suma 24h calendario (00:00→00:00). "Real" = primer→último pescado.</div>
                          </div>
                        }
                      >
                        <span className="text-[7px] font-medium opacity-70">Σ 24h</span>
                        <span className="text-[9px] font-bold tabular-nums">{dayTotal.toLocaleString('es-CL')}</span>
                      </ChipTooltip>
                    )
                  })()}

                  {/* Sin proceso: día escaneado por Shoplogix sin producción.
                      Oculto en mobile (ruido visual repetido para días vacíos). */}
                  {dayScanned && (
                    <span className="hidden sm:block text-[8px] text-muted-foreground/40 mt-auto text-center leading-none">
                      sin proceso
                    </span>
                  )}

                  {/* Badges de fuente de datos: rojo = falta, verde = presente.
                      Permite identificar de un vistazo qué días tienen PP/P0
                      Excel cargado vs sólo Shoplogix (sin badges). Si está
                      mixto (algunos turnos tienen PP, otros no), gana el badge
                      de "falta" para que el usuario sepa que hay trabajo pendiente.
                      En plantas no clasificadoras (Yal) NO existe archivo P0
                      separado — los rechazos vienen en el mismo PP con gate=0.
                      El badge P0 confunde porque aparece "verde" sin que se haya
                      cargado nada extra; lo ocultamos. */}
                  {(missingPiece || (plantLine.isClassificationPlant !== false && missingGate0) || hasAllPiece || (plantLine.isClassificationPlant !== false && hasAllGate0)) && (
                    <div className="mt-auto flex gap-0.5">
                      {missingPiece ? (
                        <span title="Falta archivo PIEZA_PIEZA en algún turno" className="text-[7px] leading-3 px-0.5 rounded bg-red-500/20 text-red-600 font-medium">PP</span>
                      ) : hasAllPiece ? (
                        <span title="Todos los turnos tienen PIEZA_PIEZA cargado" className="text-[7px] leading-3 px-0.5 rounded bg-emerald-500/20 text-emerald-500 font-medium">PP</span>
                      ) : null}
                      {plantLine.isClassificationPlant !== false && (
                        missingGate0 ? (
                          <span title="Falta archivo PUERTA_0 en algún turno" className="text-[7px] leading-3 px-0.5 rounded bg-red-500/20 text-red-600 font-medium">P0</span>
                        ) : hasAllGate0 ? (
                          <span title="Todos los turnos tienen PUERTA_0 cargado" className="text-[7px] leading-3 px-0.5 rounded bg-emerald-500/20 text-emerald-500 font-medium">P0</span>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
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
                const blocks = buildDayTimelineBlocks(entries as Array<{ summary: GraderDailySummary; chip: ShiftChipDescriptor | null }>, slxByShift, slideKey ?? undefined)
                // Huecos entre turnos → planned downtime gris, misma altura que los bloques.
                // Se calcula GEOMÉTRICAMENTE desde los bordes de los bloques Grader,
                // sin depender del reason-text de Shoplogix (que varía entre turnos).
                const sortedBlocks = [...blocks].sort((a, b) => a.leftPct - b.leftPct)
                const gapFills: Array<{ leftPct: number; widthPct: number }> = []
                if (sortedBlocks.length > 0) {
                  const first = sortedBlocks[0]!
                  if (first.leftPct > 0.5)
                    gapFills.push({ leftPct: 0, widthPct: first.leftPct })
                  for (let k = 0; k < sortedBlocks.length - 1; k++) {
                    const cur  = sortedBlocks[k]!
                    const nxt  = sortedBlocks[k + 1]!
                    const end  = cur.leftPct + cur.widthPct
                    const next = nxt.leftPct
                    if (next - end > 0.5) gapFills.push({ leftPct: end, widthPct: next - end })
                  }
                  const last    = sortedBlocks[sortedBlocks.length - 1]!
                  const lastEnd = last.leftPct + last.widthPct
                  if (lastEnd < 99.5) gapFills.push({ leftPct: lastEnd, widthPct: 100 - lastEnd })
                }
                return (
                  <div
                    key={slideKey ?? `empty-${si}`}
                    ref={isSelectedSlide ? selectedSlideRef : undefined}
                    className="min-w-0"
                    style={{ width: '33.333%' }}
                  >
                    {/* Etiqueta de fecha — con padding lateral para alinear con el resto del card */}
                    <div className="flex items-center justify-between mb-0.5 px-6">
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                        {slideKey ? slideKey.slice(5) : '—'}
                      </span>
                    </div>
                    {/* ── Barra timeline 24h compacta — 3 capas: bloques Grader / Shoplogix / eje hora ── */}
                    <div
                      className="relative overflow-hidden border-y border-border/25 bg-muted/15"
                      style={{ height: '36px' }}
                      title={slideKey ? `Timeline ${slideKey}` : undefined}
                    >
                      {/* ── Capa 1: grid de horas (compactado, solo ticks principales) ── */}
                      {/* Medianoche */}
                      <div className="absolute inset-y-0 left-0 w-px bg-white/25 z-10 pointer-events-none" />
                      {/* Ticks solo en horas principales (6/12/18) — los intermedios saturan en altura reducida */}
                      {[6, 12, 18].map(h => (
                        <div
                          key={h}
                          className="absolute inset-y-0 w-px bg-white/15 pointer-events-none z-10"
                          style={{ left: `${(h / 24) * 100}%` }}
                        />
                      ))}
                      {/* Labels de hora — zona inferior, más legibles */}
                      {[0, 6, 12, 18, 24].map(h => (
                        <span
                          key={h}
                          className="absolute bottom-0.5 text-[8px] font-medium text-muted-foreground/65 tabular-nums pointer-events-none z-10"
                          style={{
                            left: `${(h / 24) * 100}%`,
                            transform: h === 0 ? 'none' : h === 24 ? 'translateX(-100%)' : 'translateX(-50%)',
                          }}
                        >
                          {h === 0 ? '0h' : `${h}h`}
                        </span>
                      ))}

                      {/* ── Capa 2: huecos entre turnos = planned downtime gris ──
                          Misma posición que Capa 3 (top:3px, bottom:18px) → barra continua.
                          Calculado geométricamente: gaps entre bloques Grader, sin depender
                          del reason-text de Shoplogix. anime.js sweep izquierda→derecha. */}
                      {gapFills.map((gap, i) => (
                        <div
                          key={`gap-${i}`}
                          data-anim-unif=""
                          className="absolute bg-slate-700/50 z-[4] pointer-events-none"
                          style={{
                            left:            `${gap.leftPct}%`,
                            width:           `${gap.widthPct}%`,
                            top:             '2px',
                            bottom:          '11px',
                            transformOrigin: 'left center',
                          }}
                          title="Sin turno activo (paro programado)"
                        />
                      ))}

                      {/* ── Capa 3: bloques del Grader o Shoplogix standalone ── */}
                      {blocks.map((b, i) => {
                        const isHovered = hoveredFragId === b.fragId
                        // Siempre navegamos al TurnoPage. Para bloques SLX-only pasamos
                        // ?linea= para que el TurnoPage cargue el plantSlug correcto y
                        // muestre el panel Shoplogix aunque no haya graderDailySummary.
                        const lineaQuery = plantLineId !== DEFAULT_PLANT_LINE_ID
                          ? `?linea=${encodeURIComponent(plantLineId)}`
                          : ''
                        const navigateToBlockTurno = () => navigate(
                          `/analisis-grader/turno/${b.dateKey}__${encodeURIComponent(b.shiftId)}${lineaQuery}`,
                        )
                        return (
                          <div
                            key={i}
                            data-frag-id={b.fragId}
                            role="button"
                            tabIndex={0}
                            className={cn(
                              'absolute overflow-hidden cursor-pointer transition-all',
                              b.isShoplogixOnly && 'border border-dashed border-sky-400/50',
                              b.bgClass,
                              b.nightSide === null && 'rounded-sm',
                              isHovered && 'ring-2 ring-white/80 ring-offset-1 ring-offset-background z-20',
                            )}
                            style={{
                              left:   `${b.leftPct}%`,
                              width:  `max(${b.widthPct}%, 0.8%)`,
                              top:    '2px',
                              bottom: '11px',
                              borderRadius:
                                b.nightSide === 'start' ? '0 3px 3px 0' :
                                b.nightSide === 'end'   ? '3px 0 0 3px' :
                                undefined,
                              backgroundImage:
                                b.nightSide === 'start' ? 'linear-gradient(90deg, rgba(99,102,241,0.55) 0%, transparent 18px)'
                                : b.nightSide === 'end' ? 'linear-gradient(270deg, rgba(99,102,241,0.55) 0%, transparent 18px)'
                                : undefined,
                            }}
                            title={`${b.title} · click para ver detalle`}
                            onClick={navigateToBlockTurno}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                navigateToBlockTurno()
                              }
                            }}
                            onMouseEnter={() => setHoveredFragId(b.fragId)}
                            onMouseLeave={() => setHoveredFragId(null)}
                          >
                            {b.label && (() => {
                              const totalMin = Math.round((b.widthPct / 100) * 24 * 60)
                              const h = Math.floor(totalMin / 60)
                              const m = totalMin % 60
                              const dur = m === 0 ? `${h}h` : `${h}h ${m}m`
                              return (
                                <span className="absolute inset-x-0.5 top-0.5 text-[7px] font-semibold leading-none truncate text-white/70 pointer-events-none select-none">
                                  {b.label} · {dur}
                                </span>
                              )
                            })()}
                          </div>
                        )
                      })}
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

          {/* Sin uploads ni historial ni aportes calendáricos: placeholders por turno */}
          {selectedKey && selectedUploads.length === 0 && summariesForSelectedDay.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                <Clock className="h-3.5 w-3.5" />
                {plantLine.isClassificationPlant === false
                  ? 'Sin Excel del Marelec cargado todavía'
                  : 'Sin Excel cargado todavía'}
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {/* Chonchi: 2 turnos fijos (día/noche) con slxKey → T2/T1.
                    Otras plantas (Yal): derivados de datos SLX (T3/T1/T2). */}
                {(plantLineId === DEFAULT_PLANT_LINE_ID
                  ? [
                      { shiftId: 'Turno día',   cfDateKey: selectedKey!, slxKey: `${selectedKey}__Turno 2` },
                      { shiftId: 'Turno noche', cfDateKey: selectedKey!, slxKey: `${selectedKey}__Turno 1` },
                    ]
                  : slxDisplayShifts(selectedKey, slxByShift, { isClassificationPlant: plantLine.isClassificationPlant })
                ).map(({ shiftId, cfDateKey, slxKey }) => {
                  // "¿Hay datos Shoplogix para este turno?" — NO se puede preguntar por
                  // `states.length`: los turnos resueltos desde el doc padre traen los
                  // agregados pero no los states individuales. `perMachine` sí está
                  // siempre. Se conserva `states` para turnos con paro total (0 ciclos
                  // pero con downtime registrado), que antes sí se mostraban.
                  const slxForShift = slxByShift.get(slxKey)
                  const hasSlx = !!slxForShift && (
                    slxForShift.totalCycles > 0 ||
                    slxForShift.perMachine.length > 0 ||
                    slxForShift.states.length > 0
                  )
                  const lineaQuery = plantLineId !== DEFAULT_PLANT_LINE_ID
                    ? `?linea=${encodeURIComponent(plantLineId)}`
                    : ''
                  return (
                    <div
                      key={shiftId}
                      className={cn(
                        'rounded-lg border p-2 space-y-1.5',
                        hasSlx
                          ? 'border-sky-500/30 bg-sky-500/3'
                          : 'border-dashed border-muted-foreground/30 bg-background/30',
                      )}
                    >
                      <div className="flex items-center justify-between gap-1 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {(shiftId === 'Turno día' || shiftId === 'Turno 2')
                            ? <Sun className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            : <Moon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />}
                          <p className="text-xs font-medium leading-none">{shiftId}</p>
                          {(() => {
                            const cache = slxByShift.get(slxKey)
                            const ss = cache?.scheduledStart ?? cache?.shiftStart ?? null
                            const se = cache?.scheduledEnd   ?? cache?.shiftEnd   ?? null
                            if (!ss || !se) return null
                            const totalMin = Math.round((se.getTime() - ss.getTime()) / 60_000)
                            if (totalMin <= 0) return null
                            const h = Math.floor(totalMin / 60)
                            const m = totalMin % 60
                            const dur = m === 0 ? `${h}h` : `${h}h ${m}m`
                            return <span className="text-[10px] text-muted-foreground/70 tabular-nums">{dur}</span>
                          })()}
                        </div>
                        {hasSlx && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 font-medium leading-none">
                            Shoplogix
                          </span>
                        )}
                      </div>

                      {/* KPIs Shoplogix cuando hay datos */}
                      {hasSlx && (() => {
                        const cache = slxByShift.get(slxKey)
                        const cycles = slxTotalsByShift.get(slxKey) ?? 0
                        const uptimePct = (cache?.avgShiftRuntime ?? 0) * 100
                        const uptimeColor = uptimePct >= 70 ? 'text-emerald-400' : uptimePct >= 40 ? 'text-amber-400' : 'text-red-400'
                        const uptimeBarColor = uptimePct >= 70 ? 'bg-emerald-500' : uptimePct >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        return (
                          <div className="grid grid-cols-2 gap-1">
                            <div className="rounded bg-muted/40 px-1.5 py-1 text-center">
                              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                                <div className="text-[9px] text-muted-foreground">ciclos</div>
                                <InfoTooltip
                                  text="Piezas totales procesadas por las Baaders durante el turno, según Shoplogix."
                                  iconSize={9}
                                  position="top"
                                />
                              </div>
                              <div className="text-xs font-semibold tabular-nums">
                                {cycles.toLocaleString('es-CL')}
                              </div>
                            </div>
                            <div className="rounded bg-muted/40 px-1.5 py-1 text-center">
                              <div className="flex items-center justify-center gap-0.5 mb-0.5">
                                <div className="text-[9px] text-muted-foreground">uptime</div>
                                <InfoTooltip
                                  text={`% del turno en que las máquinas estuvieron activas.\n\n< 40% crítico · 40–70% bajo · ≥ 70% normal\n\nUn uptime bajo indica paros frecuentes, esperas de materia prima o mantenimiento no planificado.`}
                                  iconSize={9}
                                  position="top"
                                />
                              </div>
                              <div className={cn('text-xs font-semibold tabular-nums', uptimeColor)}>
                                {uptimePct.toFixed(0)}%
                              </div>
                              <div className="h-1 bg-muted/60 rounded-full overflow-hidden mt-1">
                                <div
                                  className={cn('h-full rounded-full transition-all', uptimeBarColor)}
                                  style={{ width: `${Math.min(100, uptimePct).toFixed(1)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })()}

                      {!hasSlx && (
                        <p className="text-[10px] text-muted-foreground leading-snug">
                          Sin registros. Al subir el Excel se cruzarán con tu historial.
                        </p>
                      )}

                      <div className="flex flex-col gap-1">
                        {plantLine.isClassificationPlant !== false && (
                          <QuickGateChangeButton
                            shiftDocId={`${cfDateKey}__${shiftId}`}
                            variant="compact"
                            className="w-full h-6 text-[10px]"
                          />
                        )}
                        {hasSlx && (
                          <button
                            onClick={() => navigate(`/analisis-grader/turno/${cfDateKey}__${encodeURIComponent(shiftId)}${lineaQuery}`)}
                            className="w-full flex items-center justify-center gap-1 h-6 px-2 rounded text-[10px] text-sky-400 border border-sky-500/40 hover:bg-sky-500/10 transition-colors"
                            title="Ver detalle Shoplogix de este turno"
                          >
                            <Activity className="h-3 w-3" />
                            Ver detalle
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
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
                          onClick={() => {
                            const lq = plantLineId !== DEFAULT_PLANT_LINE_ID ? `?linea=${encodeURIComponent(plantLineId)}` : ''
                            navigate(`/analisis-grader/turno/${selectedKey}__${encodeURIComponent(shiftId)}${lq}`)
                          }}
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
                        ? `${new Date(minStart).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })} - ${new Date(maxEnd).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false })}`
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

      {/* ── Panel panorámico mensual (solo en layout no-stacked = landing page) ── */}
      {!stacked && slxMonthlyStats && (
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-sky-400" />
                  Vista panorámica · {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">
                  {slxMonthlyStats.turnosWithData} turnos · {slxMonthlyStats.daysWithData} días con data
                </span>
              </div>
              {/* Pestañas: un bloque a la vez, a página completa — cada uno con
                  espacio para graficarse más grande y explicarse mejor. */}
              <div className="flex flex-wrap gap-1 pt-2">
                {([
                  ['baader', 'Por Baader'],
                  ['paros', 'Top paros'],
                  ['disponibilidad', 'Disponibilidad diaria'],
                  ['tendencia', 'Tendencias'],
                ] as const).map(([id, tabLabel]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPanoramaTab(id)}
                    className={cn(
                      'text-[11px] px-2.5 py-1 rounded-md border transition-colors',
                      panoramaTab === id
                        ? 'bg-primary/15 text-primary border-primary/30 font-medium'
                        : 'bg-muted text-muted-foreground border-border hover:bg-accent',
                    )}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              <div>

                {/* ── Pestaña: rendimiento POR BAADER (desglose por máquina) ──
                    Muestra SOLO lo que el Resumen del mes no tiene: el reparto
                    por cada Evisceradora (horas-máquina, %uptime y MTTR). */}
                {panoramaTab === 'baader' && (
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                    Por Baader · {monthNames[currentMonth.getMonth()]}
                    <InfoTooltip
                      title="Rendimiento por Baader"
                      text="Desglose de cada Evisceradora Baader 142 en el mes: horas-máquina procesando, % uptime y MTTR (macro/micro). Los KPIs agregados del mes (uptime promedio, ciclos, mejor/peor turno) están en el Resumen del mes, arriba — acá no se repiten."
                      iconSize={11}
                    />
                  </p>
                  {/* Horas-máquina totales — ancla de la columna (número único,
                      no está en el panel superior). */}
                  {slxMonthlyStats.totalUptimeSec > 0 && (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold tabular-nums text-foreground/90">
                        {fmtSecPanoramic(slxMonthlyStats.totalUptimeSec)}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        horas-máquina · procesando
                        <InfoTooltip
                          title="Horas-máquina del mes"
                          text="Suma de tiempo procesando de las 3 Baader 142 a lo largo del mes (M0+M1+M2). Si las 3 trabajan 1 hora en paralelo, esto cuenta 3 horas-máquina."
                          formula="∑(uptimeSec de cada Baader) en todos los turnos del mes"
                          example={`${fmtSecPanoramic(slxMonthlyStats.totalUptimeSec)} = capacidad total de procesamiento usada · coherente con ${slxMonthlyStats.totalCycles.toLocaleString('es-CL')} ciclos del mes (suma de las 3 máquinas).`}
                          iconSize={10}
                        />
                      </span>
                    </div>
                  )}
                  {/* Desglose por Baader como TABLA a ancho completo — antes eran
                      chips microscópicos ilegibles ("la data por Baader no se
                      entiende", Orel 2026-07-21). Cada fila: horas procesando,
                      % uptime con barra, ciclos, turnos y MTTR macro/micro. */}
                  {slxMonthlyStats.perMachineMonth.length > 0 && (
                    <div className="space-y-1">
                      <div className="grid grid-cols-[minmax(4rem,1.2fr)_1fr_2fr_1fr_0.7fr_1fr_1fr] gap-2 text-[9px] uppercase tracking-wider text-muted-foreground/70 px-1">
                        <span>Máquina</span>
                        <span className="text-right">Procesando</span>
                        <span>Uptime</span>
                        <span className="text-right">Ciclos</span>
                        <span className="text-right">Turnos</span>
                        <span className="text-right" title="Tiempo promedio de reparación de averías macro (≥5 min) · N° eventos">MTTR mac</span>
                        <span className="text-right" title="Tiempo promedio de las micro-detenciones (<5 min) · N° eventos">MTTR mic</span>
                      </div>
                      {slxMonthlyStats.perMachineMonth.map((pm) => {
                        const shortName = pm.name.replace(/^YAL\s+/i, '').replace(/Evisceradora/i, 'Ev')
                        const uptimeColor =
                          pm.avgUptimePct >= 70 ? 'text-emerald-700 dark:text-emerald-300'
                          : pm.avgUptimePct >= 40 ? 'text-amber-700 dark:text-amber-300'
                          : 'text-rose-700 dark:text-rose-300'
                        const uptimeBarColor =
                          pm.avgUptimePct >= 70 ? 'bg-emerald-500/60'
                          : pm.avgUptimePct >= 40 ? 'bg-amber-500/55'
                          : 'bg-rose-500/55'
                        const mttrMacroSec = pm.maintMacroCount > 0 ? pm.maintMacroSec / pm.maintMacroCount : 0
                        const mttrMicroSec = pm.maintMicroCount > 0 ? pm.maintMicroSec / pm.maintMicroCount : 0
                        const fmtMttr = (sec: number) => {
                          if (sec <= 0) return '—'
                          if (sec < 60) return `${Math.round(sec)}s`
                          const m = Math.floor(sec / 60)
                          const s = Math.round(sec % 60)
                          return s === 0 ? `${m}m` : `${m}m${s}s`
                        }
                        return (
                          <div
                            key={pm.machineid}
                            className="grid grid-cols-[minmax(4rem,1.2fr)_1fr_2fr_1fr_0.7fr_1fr_1fr] gap-2 items-center rounded bg-muted/50 border border-border px-1 py-1.5 text-[11px] tabular-nums"
                          >
                            <span className="font-medium text-foreground/85">{shortName}</span>
                            <span className="text-right text-foreground/80">{fmtSecPanoramic(pm.uptimeSec)}</span>
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className="flex-1 h-2 rounded-full bg-muted/70 overflow-hidden min-w-0">
                                <span className={cn('block h-full rounded-full', uptimeBarColor)} style={{ width: `${Math.min(100, pm.avgUptimePct)}%` }} />
                              </span>
                              <span className={cn('shrink-0 w-8 text-right', uptimeColor)}>{pm.avgUptimePct.toFixed(0)}%</span>
                            </span>
                            <span className="text-right text-foreground/70">{pm.totalCycles.toLocaleString('es-CL')}</span>
                            <span className="text-right text-muted-foreground">{pm.shiftCount}</span>
                            <span className="text-right text-muted-foreground">{fmtMttr(mttrMacroSec)}<span className="text-muted-foreground/50 text-[9px]"> ·{pm.maintMacroCount}</span></span>
                            <span className="text-right text-muted-foreground">{fmtMttr(mttrMicroSec)}<span className="text-muted-foreground/50 text-[9px]"> ·{pm.maintMicroCount}</span></span>
                          </div>
                        )
                      })}
                      <p className="text-[10px] text-muted-foreground/60 pt-1">
                        Uptime = % del tiempo de turno procesando. MTTR mac = promedio de reparación de averías ≥5 min; mic = micro-detenciones (no inflan el MTTR macro).
                      </p>
                    </div>
                  )}
                </div>
                )}

                {/* ── Pestaña: Pareto de paros del mes (upstream Baader) ── */}
                {panoramaTab === 'paros' && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                    Top paros upstream · {monthNames[currentMonth.getMonth()]}
                    <InfoTooltip
                      title="Top paros del mes"
                      text="Todas las causas de detención reportadas por Shoplogix para las Baader 142, agrupadas por la razón específica que registra el supervisor (Colación, MMPP, Paro Programado, Reunión inicio turno, etc.). Filtra por máquina para identificar qué Baader concentra más paros."
                      example="MMPP arriba = falta materia prima. Paro Programado alto = revisar planificación. Click 'Ev 1/2/3' para filtrar por máquina y calcular MTTR específico."
                      iconSize={10}
                    />
                  </p>
                  {/* Toggle: Todas / Ev 1 / Ev 2 / Ev 3.
                      Permite filtrar el pareto por máquina específica, útil para
                      identificar qué Baader tuvo más paros de cada tipo y para
                      separar mantenimiento de otras causas. */}
                  {slxMonthlyStats.perMachineMonth.length > 1 && (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => setParetoMachineFilter('all')}
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded border transition-colors',
                          paretoMachineFilter === 'all'
                            ? 'bg-primary/20 text-primary border-primary/30'
                            : 'bg-muted text-muted-foreground border-border hover:bg-accent',
                        )}
                      >
                        Todas
                      </button>
                      {slxMonthlyStats.perMachineMonth.map((pm) => {
                        const shortName = pm.name.replace(/^YAL\s+/i, '').replace(/Evisceradora/i, 'Ev')
                        const active = paretoMachineFilter === pm.machineid
                        return (
                          <button
                            key={pm.machineid}
                            type="button"
                            onClick={() => setParetoMachineFilter(pm.machineid)}
                            className={cn(
                              'text-[9px] px-1.5 py-0.5 rounded border transition-colors tabular-nums',
                              active
                                ? 'bg-primary/20 text-primary border-primary/30'
                                : 'bg-muted text-muted-foreground border-border hover:bg-accent',
                            )}
                            title={`Filtrar paros solo de ${pm.name}`}
                          >
                            {shortName}
                          </button>
                        )
                      })}
                      {/* Separador visual + toggle Solo mantención */}
                      <span className="w-px bg-border/60 self-stretch mx-0.5" aria-hidden />
                      <button
                        type="button"
                        onClick={() => setParetoMaintOnly((v) => !v)}
                        className={cn(
                          'text-[9px] px-1.5 py-0.5 rounded border transition-colors',
                          paretoMaintOnly
                            ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                            : 'bg-muted text-muted-foreground border-border hover:bg-accent',
                        )}
                        title="Solo paros tipo avería (excluye COLACION, MMPP, CUMPLIMIENTO CUOTA y otros paros operacionales). type='downtime' menos reasons operativos."
                      >
                        {paretoMaintOnly ? '🔧 Solo mantención' : '🔧 Solo mantención'}
                      </button>
                    </div>
                  )}
                  {monthParetoData.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">Sin datos de paros para este mes</p>
                  ) : (
                    <div ref={monthParetoRef} className="space-y-1.5 pt-1">
                      {(() => {
                        const totalSec = monthParetoData.reduce((a, r) => a + r.durationSec, 0)
                        // A página completa: top 12 (antes 7) con etiqueta ancha,
                        // barra más gruesa y N° de eventos visible en la fila.
                        return monthParetoData.slice(0, 12).map((item) => {
                          const pct = totalSec > 0 ? (item.durationSec / totalSec) * 100 : 0
                          return (
                            <div
                              key={item.name}
                              className="flex items-center gap-2 text-[11px]"
                              title={`${item.count} evento${item.count !== 1 ? 's' : ''} · ${fmtSecPanoramic(item.durationSec)} total`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-sm shrink-0 ring-1 ring-black/30"
                                style={{ backgroundColor: softenAccentHex(item.color || '#64748b') }}
                              />
                              <span className="text-foreground/75 truncate shrink-0 w-32 sm:w-44">
                                {item.name || 'Sin categoría'}
                              </span>
                              <div className="flex-1 h-2.5 bg-muted/60 rounded-full overflow-hidden min-w-0">
                                <div
                                  data-month-pareto-bar=""
                                  className="h-full rounded-full opacity-80"
                                  style={{
                                    width:           `${Math.max(pct, 1)}%`,
                                    backgroundColor: softenAccentHex(item.color || '#64748b'),
                                    transformOrigin: 'left center',
                                  }}
                                />
                              </div>
                              <span className="text-muted-foreground/60 tabular-nums shrink-0 w-9 text-right text-[10px]">
                                ×{item.count}
                              </span>
                              <span className="text-muted-foreground tabular-nums shrink-0 w-12 text-right">
                                {fmtSecPanoramic(item.durationSec)}
                              </span>
                              <span className="text-muted-foreground/60 tabular-nums shrink-0 w-8 text-right">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                  {monthParetoData.length > 0 && (
                    <p className="text-[10px] text-muted-foreground/60 pt-1">
                      Cada barra = % del tiempo total detenido del mes que se llevó esa causal. ×N = veces que ocurrió. Estados de paro de la primera Baader por turno.
                    </p>
                  )}
                </div>
                )}

                {/* ── Pestaña: Disponibilidad diaria D/N (stacked bars por día) ── */}
                {panoramaTab === 'disponibilidad' && (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                    Disponibilidad diaria · {monthNames[currentMonth.getMonth()]}
                    <InfoTooltip
                      title="Disponibilidad diaria"
                      text="Una barra apilada por día y por turno (D y N) mostrando cómo se distribuyó el tiempo: Uptime (verde, procesando) · Breaks (ámbar, colación/cambio) · Paro (rojo, falla o falta de MMPP) · Setup (violeta, ajustes)."
                      example="Click en la fecha lleva al detalle del día."
                      iconSize={10}
                    />
                  </p>
                  {availabilityTrend.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">Cargando datos del mes...</p>
                  ) : (
                    <div className="space-y-[3px]">
                      {/* Leyenda compacta */}
                      <div className="flex items-center gap-3 pb-1 text-[9px] text-muted-foreground/70">
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-1.5 rounded-sm bg-emerald-500/70" />
                          Uptime
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-1.5 rounded-sm bg-amber-500/60" />
                          Breaks
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-1.5 rounded-sm bg-rose-500/65" />
                          Paro
                        </div>
                      </div>
                      {/* Filas por día */}
                      {availabilityTrend.map(({ dk, day, night, dayShiftId, nightShiftId }) => {
                        const buildAvailBar = (cache: SlxShiftCache | null) => {
                          if (!cache || !cache.breakdown) {
                            return <div className="flex-1 h-4 rounded-sm bg-muted/20 opacity-40" />
                          }
                          const bd   = cache.breakdown
                          const prod = bd.uptimeSec + bd.breakSec + bd.downtimeSec + bd.setupSec
                          if (prod === 0) return <div className="flex-1 h-4 rounded-sm bg-muted/20 opacity-40" />
                          const up    = (bd.uptimeSec   / prod) * 100
                          const brk   = (bd.breakSec    / prod) * 100
                          const down  = (bd.downtimeSec / prod) * 100
                          const setup = (bd.setupSec    / prod) * 100
                          return (
                            <div
                              className="flex flex-1 h-4 rounded-sm overflow-hidden bg-muted/60"
                              title={`${fmtSecPanoramic(bd.uptimeSec)} uptime (${up.toFixed(0)}%) · ${cache.totalCycles.toLocaleString('es-CL')} ciclos`}
                            >
                              {up    > 0 && <div className="h-full bg-emerald-500/70" style={{ width: `${up}%`    }} />}
                              {brk   > 0 && <div className="h-full bg-amber-500/60"   style={{ width: `${brk}%`   }} />}
                              {down  > 0 && <div className="h-full bg-rose-500/65"    style={{ width: `${down}%`  }} />}
                              {setup > 0 && <div className="h-full bg-violet-500/55"  style={{ width: `${setup}%` }} />}
                            </div>
                          )
                        }
                        const dayUptimeStr   = day   ? `${(day.shiftRuntime   * 100).toFixed(0)}%` : '—'
                        const nightUptimeStr = night ? `${(night.shiftRuntime * 100).toFixed(0)}%` : '—'
                        return (
                          <div key={dk} className="flex items-center gap-1.5 text-[10px]">
                            {/* Fecha clicable → navega al día */}
                            <span
                              className="text-muted-foreground/70 tabular-nums shrink-0 w-8 text-right cursor-pointer hover:text-foreground transition-colors"
                              onClick={() => {
                                const d = new Date(`${dk}T00:00:00`)
                                setSelectedDate(d)
                                setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                              }}
                            >
                              {dk.slice(5)}
                            </span>
                            <span className="text-[8px] text-amber-500/60 shrink-0 w-5 text-center">
                              {dayShiftId === 'Turno 2' ? 'T2'
                                : dayShiftId === 'Turno 1' ? 'T1'
                                : dayShiftId === 'Turno día' ? 'D'
                                : dayShiftId === null ? '—' : 'D'}
                            </span>
                            {buildAvailBar(day)}
                            <span className="text-[8px] text-indigo-400/60 shrink-0 w-5 text-center">
                              {nightShiftId === 'Turno 3' ? 'T3'
                                : nightShiftId === 'Turno 1' ? 'T1'
                                : nightShiftId === 'Turno noche' ? 'N'
                                : nightShiftId === null ? '—' : 'N'}
                            </span>
                            {buildAvailBar(night)}
                            <span className="text-muted-foreground/50 tabular-nums shrink-0 w-14 text-right text-[9px]">
                              {dayUptimeStr}/{nightUptimeStr}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 pt-1">
                    Cada fila = un día; barra izquierda turno de tarde, derecha turno noche. Verde = procesando · ámbar = pausas de personas · rojo = paro · violeta = setup. Click en la fecha abre el día.
                  </p>
                </div>
                )}

              </div>

              {/* ── Pestaña: tendencia Baader por turno (Yal: T2/T3 · Chonchi: Día/Noche) ──
                  Toggle "Por máquina" cambia entre agregado (ritmo+uptime de la línea)
                  y per-machine (3 líneas, uptime% de cada Baader). */}
              {panoramaTab === 'tendencia' && (monthTrendPoints.day.length >= 2 || monthTrendPoints.night.length >= 2) && (() => {
                const isYal = plantLine.isClassificationPlant === false
                const dayLabel   = isYal ? '🌇 Tendencia Baader · Turno 2' : '☀ Tendencia Baader · Turno Día'
                const nightLabel = isYal ? '🌙 Tendencia Baader · Turno 3' : '🌙 Tendencia Baader · Turno Noche'
                // Paleta consistente por Baader (M0 sky, M1 violet, M2 amber).
                const machineColors = ['rgba(56,189,248,0.95)', 'rgba(167,139,250,0.95)', 'rgba(251,191,36,0.95)']
                const toMultiSeries = (
                  byMachine: Map<string, { name: string; points: MachineTrendPoint[] }>,
                ) => [...byMachine.entries()]
                  .sort(([, a], [, b]) => a.name.localeCompare(b.name, 'es'))
                  .map(([, v], idx) => ({
                    name:   v.name.replace(/^YAL\s+/i, '').replace(/Evisceradora/i, 'Ev'),
                    color:  machineColors[idx % machineColors.length] ?? '#94a3b8',
                    points: v.points,
                  }))
                const daySeries   = toMultiSeries(monthTrendByMachine.day)
                const nightSeries = toMultiSeries(monthTrendByMachine.night)
                return (
                <div className="space-y-2">
                  {/* Toggle Por máquina */}
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setTrendByMachine((v) => !v)}
                      className={cn(
                        'text-[9px] px-2 py-0.5 rounded border transition-colors',
                        trendByMachine
                          ? 'bg-primary/15 text-primary border-primary/30'
                          : 'bg-muted text-muted-foreground border-border hover:bg-accent',
                      )}
                      title="Alternar entre tendencia agregada (1 línea: ritmo+uptime de la línea) y por máquina (3 líneas: uptime% de cada Baader)"
                    >
                      {trendByMachine ? '⚙ Por máquina' : '⚙ Agregado'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {monthTrendPoints.day.length >= 2 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                          {dayLabel}
                          <InfoTooltip
                            title={isYal ? 'Tendencia · Ritmo del Turno 2' : 'Tendencia · Ritmo del turno día'}
                            text={trendByMachine
                              ? '% uptime de cada Baader (Ev 1/2/3) a lo largo del mes. Útil para detectar qué máquina cayó en un día específico.'
                              : '% productividad real vs objetivo a lo largo del mes. Un valor de 100% significa que las Baader procesaron exactamente las piezas que Shoplogix esperaba; >100% es sobre-objetivo, <100% es bajo-objetivo.'}
                            formula={trendByMachine
                              ? 'uptime_máquina = tiempo_procesando / duración_turno'
                              : 'Ritmo = ciclos_reales / ciclos_esperados × 100'}
                            example={trendByMachine
                              ? 'Ev 1 al 70% y Ev 3 al 30% el mismo día → Ev 3 tuvo más paros.'
                              : '80% = procesó 4.000 piezas cuando se esperaban 5.000.'}
                            iconSize={10}
                          />
                        </p>
                        {trendByMachine && daySeries.length > 0
                          ? <BaaderTrendMultiChart series={daySeries} />
                          : <MachineTrendMiniChart points={monthTrendPoints.day} />}
                      </div>
                    )}
                    {monthTrendPoints.night.length >= 2 && (
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                          {nightLabel}
                          <InfoTooltip
                            title={isYal ? 'Tendencia · Ritmo del Turno 3' : 'Tendencia · Ritmo del turno noche'}
                            text={trendByMachine
                              ? '% uptime de cada Baader (Ev 1/2/3) a lo largo del mes en el turno noche.'
                              : '% productividad real vs objetivo a lo largo del mes. Mismo cálculo que el de día — compara qué tan cerca del target operaron las Baader.'}
                            formula={trendByMachine
                              ? 'uptime_máquina = tiempo_procesando / duración_turno'
                              : 'Ritmo = ciclos_reales / ciclos_esperados × 100'}
                            iconSize={10}
                          />
                        </p>
                        {trendByMachine && nightSeries.length > 0
                          ? <BaaderTrendMultiChart series={nightSeries} />
                          : <MachineTrendMiniChart points={monthTrendPoints.night} />}
                      </div>
                    )}
                  </div>
                </div>
                )
              })()}

            </CardContent>
          </Card>
        </div>
      )}

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
