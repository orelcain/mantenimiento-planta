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
import { animate, stagger } from 'animejs'
import { Card, CardContent, CardHeader, CardTitle, Button, Badge, InfoTooltip } from '@/components/ui'
import { ChevronLeft, ChevronRight, Loader2, Clock, Database, Eye, Trash2, AlertTriangle, Sun, Moon, Wrench, Tag, GitCompare, Activity, TrendingUp, TrendingDown } from 'lucide-react'
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
import { loadShoplogixShift, listShoplogixShiftDocIdsForMonth } from '@/services/shoplogix/shoplogixShift.service'
import type { MachineTrendPoint } from '@/services/shoplogix/shoplogixShift.service'
import type { UpstreamMachineState } from '@/services/shoplogix/types'
import {
  getShiftDisplayDateKey,
  isMidnightShift,
  cfKeysForVisualDay,
  addDaysToDateKey,
} from '@/services/grader/graderShiftDisplay'
import { MachineTrendMiniChart } from './UpstreamMachinesPanel'
import { getPlantLineConfig, DEFAULT_PLANT_LINE_ID, type PlantLineId } from '@/config/plantLines'

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
        className="flex items-center justify-between rounded px-1 py-px leading-none bg-indigo-500/15 text-indigo-300 border border-indigo-500/25"
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
      className={cn('flex items-center justify-between rounded px-1 py-px leading-none', colorByP0)}
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
        (!chip && summary.shiftId === 'Turno noche')
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

/** Formatea segundos en forma compacta. Usado en el panel panorámico mensual. */
function fmtSecPanoramic(sec: number): string {
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
      endFrac   = endMin   / 1440
      if (endFrac <= startFrac) endFrac = Math.min(1, startFrac + 0.02)
    }

    // Refinar posición con Shoplogix efectivo (cuando disponible).
    // Esto muestra gaps reales: ej. si Shoplogix dice activo 09:00–17:27
    // pero hist.startAt = 07:00, el bloque D arranca en 09:00 (gap visible).
    const slxCacheForBlock = slxData?.get(hist.id)
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
          endFrac   = effEndMin   / 1440
        } else if (direction === 'enters') {
          endFrac = Math.min(effEndMin / 1440, 1)
        } else if (direction === 'exits') {
          startFrac = Math.max(effStartMin / 1440, 0)
        }
        if (endFrac <= startFrac) endFrac = Math.min(1, startFrac + 0.02)
      }
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
      title: `${hist.shiftId} · P0 ${hist.pointZeroPct.toFixed(2)}% · ${ts}${pct}`,
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
      if ((slx.totalCycles ?? 0) === 0) continue
      const sepIdx = mapKey.indexOf('__')
      if (sepIdx < 0) continue
      const cfDateKey = mapKey.slice(0, sepIdx)
      const shiftId   = mapKey.slice(sepIdx + 2)
      const visualDay = isMidnightShift(shiftId) ? addDaysToDateKey(cfDateKey, 1) : cfDateKey
      if (visualDay !== slideKey) continue
      visualShifts.push({ shiftId, cfDateKey, mapKey })
    }

    // De-duplicar: si existen docs nuevo formato (Turno 1/2/3) Y legado
    // (Turno día/noche) para el mismo día visual, preferir el nuevo.
    const visualShiftIds = new Set(visualShifts.map(v => v.shiftId))
    const hasNewDay   = visualShiftIds.has('Turno 2')
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
): SlxDisplayShift[] {
  const { ownDay, prevDay } = cfKeysForVisualDay(visualDay)
  const collected: SlxDisplayShift[] = []

  // Shifts cuyo dateKey CF == ownDay (todos excepto Turno 3, que viene del día anterior).
  for (const k of slxByShift.keys()) {
    if (!k.startsWith(`${ownDay}__`)) continue
    const shiftId = k.slice(`${ownDay}__`.length)
    if (isMidnightShift(shiftId)) continue
    collected.push({ shiftId, cfDateKey: ownDay, slxKey: k })
  }

  // Turno 3 visual del día Y → dateKey CF = Y-1
  const t3Key = `${prevDay}__Turno 3`
  if (slxByShift.has(t3Key)) {
    collected.push({ shiftId: 'Turno 3', cfDateKey: prevDay, slxKey: t3Key })
  }

  if (collected.length === 0) return []

  const ids = new Set(collected.map(c => c.shiftId))
  const hasT2    = ids.has('Turno 2')
  const hasT1or3 = ids.has('Turno 1') || ids.has('Turno 3')
  const deduped = collected
    .filter(c => !(c.shiftId === 'Turno día'   && hasT2))
    .filter(c => !(c.shiftId === 'Turno noche' && hasT1or3))

  // Orden calendárico (Turno 3 madrugada va primero, luego día, luego noche)
  const ord: Record<string, number> = {
    'Turno 3': 1,
    'Turno 1': 2, 'Turno día':  2,
    'Turno 2': 3, 'Turno noche': 3,
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
  breakdown: {
    uptimeSec: number
    breakSec: number
    downtimeSec: number
    setupSec: number
    plannedDowntimeSec: number
    totalTrackedSec: number
  } | null
}

/** Stats mensuales Shoplogix — emitidos por `onSlxMonthStatsLoaded` para el panel lateral */
export interface SlxMonthlyStats {
  totalCycles: number
  avgUptimePct: number       // 0-100
  turnosWithData: number
  dayShiftsWithData: number
  nightShiftsWithData: number
  daysWithData: number
  bestShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
  worstShift: { dateKey: string; shiftId: string; uptimePct: number; totalCycles: number } | null
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

  // Propaga la fecha seleccionada al padre
  useEffect(() => {
    const dk = selectedDate ? selectedDate.toISOString().slice(0, 10) : null
    onDateSelect?.(dk)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate])

  // Los uploads de Firestore (graderUploads) no tienen campo plantLineId todavía —
  // no se pueden filtrar server-side por planta. Para evitar que los uploads de Chonchi
  // contaminen la vista de Yal (auto-nav, chips en celdas), solo los cargamos para
  // la línea por defecto. Al cambiar a Yal se vacían; al volver a Chonchi se recargan.
  useEffect(() => {
    if (plantLineId !== DEFAULT_PLANT_LINE_ID) {
      setUploads([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    listGraderUploads()
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
    if (autoSelectedRef.current) return
    const histKeys = Array.from(historicalByDate.keys()).sort()
    const latestHist = histKeys[histKeys.length - 1]
    const latestUpload = uploads.length > 0
      ? uploads.map((u) => u.sessionDate || toDateKey(u.inferred?.startAt)).filter(Boolean).sort().slice(-1)[0]
      : undefined
    // Fallback: último día con datos Shoplogix (útil cuando no hay Excel, ej. Yal)
    const slxDays = [...slxByShift.entries()]
      .filter(([, v]) => v.totalCycles > 0)
      .map(([k]) => k.split('__')[0]!)
    slxDays.sort()
    const latestSlx = slxDays[slxDays.length - 1]
    const latest = latestHist ?? latestUpload ?? latestSlx
    if (latest) {
      const latestDate = new Date(`${latest}T00:00:00`)
      setSelectedDate(latestDate)
      setCurrentMonth(new Date(latestDate.getFullYear(), latestDate.getMonth(), 1))
      autoSelectedRef.current = true
    }
  }, [historicalByDate, uploads, slxByShift])

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
    for (const [cacheKey, cycles] of slxTotalsByShift) {
      if (cycles > 0) {
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
      if (slxByShift.has(key)) continue
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
          const cache: SlxShiftCache = {
            states,
            shiftStart:     m0?.shiftStart     ?? null,
            shiftEnd:       m0?.shiftEnd       ?? null,
            scheduledStart: m0?.scheduledStart ?? m0?.shiftStart ?? null,
            scheduledEnd:   m0?.scheduledEnd   ?? m0?.shiftEnd   ?? null,
            shiftRuntime:   m0?.shiftRuntime   ?? 0,
            avgShiftRuntime,
            overallRatio:   m0?.overallRatio   ?? 0,
            totalCycles,
            breakdown: m0?.shiftRuntimeBreakdown ? {
              uptimeSec:          m0.shiftRuntimeBreakdown.uptimeSec,
              breakSec:           m0.shiftRuntimeBreakdown.breakSec,
              downtimeSec:        m0.shiftRuntimeBreakdown.downtimeSec,
              setupSec:           m0.shiftRuntimeBreakdown.setupSec,
              plannedDowntimeSec: m0.shiftRuntimeBreakdown.plannedDowntimeSec,
              totalTrackedSec:    m0.shiftRuntimeBreakdown.totalTrackedSec,
            } : null,
          }
          setSlxByShift((prev) => new Map(prev).set(key, cache))
          setSlxTotalsByShift((prev) => new Map(prev).set(key, totalCycles))
        })
        .catch(() => {
          if (!cancelled) {
            setSlxByShift((prev) => new Map(prev).set(key, {
              states: [], shiftStart: null, shiftEnd: null,
              scheduledStart: null, scheduledEnd: null,
              shiftRuntime: 0, avgShiftRuntime: 0, overallRatio: 0, totalCycles: 0, breakdown: null,
            }))
            setSlxTotalsByShift((prev) => new Map(prev).set(key, 0))
          }
        })
    }
    return () => { cancelled = true }
  }, [selectedKey, slxByShift])

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
      states: [], shiftStart: null, shiftEnd: null,
      scheduledStart: null, scheduledEnd: null,
      shiftRuntime: 0, avgShiftRuntime: 0, overallRatio: 0, totalCycles: 0, breakdown: null,
    }

    const loadOne = (dk: string, shiftId: string, forceServer: boolean) => {
      const key = `${dk}__${shiftId}`
      return loadShoplogixShift(dk, shiftId, plantSlug, forceServer)
        .then((res) => {
          if (cancelled) return 0
          const mAll   = res.snapshot?.machines ?? []
          const m0     = mAll[0]
          const states = m0?.states ?? []
          const cycles = mAll.reduce((a, mc) => a + (mc.totalCycles || 0), 0)
          const avgShiftRuntime2 = mAll.length > 0
            ? mAll.reduce((s, m) => s + (m.shiftRuntime ?? 0), 0) / mAll.length
            : 0
          const cache: SlxShiftCache = {
            states,
            shiftStart:     m0?.shiftStart     ?? null,
            shiftEnd:       m0?.shiftEnd       ?? null,
            scheduledStart: m0?.scheduledStart ?? m0?.shiftStart ?? null,
            scheduledEnd:   m0?.scheduledEnd   ?? m0?.shiftEnd   ?? null,
            shiftRuntime:   m0?.shiftRuntime   ?? 0,
            avgShiftRuntime: avgShiftRuntime2,
            overallRatio:   m0?.overallRatio   ?? 0,
            totalCycles:    cycles,
            breakdown: m0?.shiftRuntimeBreakdown ? {
              uptimeSec:          m0.shiftRuntimeBreakdown.uptimeSec,
              breakSec:           m0.shiftRuntimeBreakdown.breakSec,
              downtimeSec:        m0.shiftRuntimeBreakdown.downtimeSec,
              setupSec:           m0.shiftRuntimeBreakdown.setupSec,
              plannedDowntimeSec: m0.shiftRuntimeBreakdown.plannedDowntimeSec,
              totalTrackedSec:    m0.shiftRuntimeBreakdown.totalTrackedSec,
            } : null,
          }
          setSlxByShift((prev)       => new Map(prev).set(key, cache))
          setSlxTotalsByShift((prev) => new Map(prev).set(key, cycles))
          return cycles
        })
        .catch(() => {
          if (!cancelled) {
            slxMonthQueuedRef.current.delete(key)
            setSlxByShift((prev)       => new Map(prev).set(key, EMPTY_CACHE))
            setSlxTotalsByShift((prev) => new Map(prev).set(key, 0))
          }
          return 0
        })
    }

    async function run() {
      // ── Fase 1: descubrir qué shifts existen en el mes (1 query) ──────────────
      const existingDocIds = await listShoplogixShiftDocIdsForMonth(year, month, plantSlug)
      if (cancelled) return
      // null = query falló → fallback a cargar todo individualmente
      const existingSet = existingDocIds ? new Set(existingDocIds) : null

      // ── Fase 2: clasificar en "vacío confirmado" vs "a cargar" ────────────────
      const emptyKeys: string[] = []
      const toLoad: Array<{ dk: string; dkMs: number; shiftId: string }> = []

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
            emptyKeys.push(key)
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
    const daySet = new Set<string>()
    // Iterar todos los shifts del mapa (soporta Turno día/noche legado + Turno 1/2/3 nuevo)
    // De-duplicar: si existe nuevo formato, ignorar legado equivalente del mismo día.
    for (const [key, cache] of slxByShift) {
      if (!key.startsWith(prefix)) continue
      if (cache.totalCycles === 0) continue
      const dk      = key.slice(0, 10)   // 'YYYY-MM-DD'
      const shiftId = key.slice(12)      // 'Turno X' (saltar 'YYYY-MM-DD__')
      // Skip legado si ya existe nuevo formato para ese día
      if (shiftId === 'Turno día'   && (slxByShift.get(`${dk}__Turno 2`)?.totalCycles    ?? 0) > 0) continue
      if (shiftId === 'Turno noche' && ((slxByShift.get(`${dk}__Turno 1`)?.totalCycles   ?? 0) > 0
                                      || (slxByShift.get(`${dk}__Turno 3`)?.totalCycles  ?? 0) > 0)) continue
      const uptimePct = cache.avgShiftRuntime * 100
      withData.push({ dateKey: dk, shiftId, uptimePct, totalCycles: cache.totalCycles })
      totalCycles += cache.totalCycles
      sumUptime   += uptimePct
      daySet.add(dk)
    }
    if (withData.length === 0) return null
    const sorted = [...withData].sort((a, b) => b.uptimePct - a.uptimePct)
    const isDayShift = (id: string) => id === 'Turno día' || id === 'Turno 2'
    return {
      totalCycles,
      avgUptimePct: sumUptime / withData.length,
      turnosWithData: withData.length,
      dayShiftsWithData:   withData.filter(e => isDayShift(e.shiftId)).length,
      nightShiftsWithData: withData.filter(e => !isDayShift(e.shiftId)).length,
      daysWithData: daySet.size,
      bestShift:  sorted[0] ?? null,
      worstShift: sorted[sorted.length - 1] ?? null,
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
    const reasonMap = new Map<string, { durationSec: number; color: string; count: number }>()
    for (const [key, cache] of slxByShift) {
      if (!key.startsWith(prefix)) continue
      const dk      = key.slice(0, 10)
      const shiftId = key.slice(12)
      // Saltar legado si ya existe nuevo formato (igual que slxMonthlyStats)
      if (shiftId === 'Turno día'   && (slxByShift.get(`${dk}__Turno 2`)?.totalCycles    ?? 0) > 0) continue
      if (shiftId === 'Turno noche' && ((slxByShift.get(`${dk}__Turno 1`)?.totalCycles   ?? 0) > 0
                                      || (slxByShift.get(`${dk}__Turno 3`)?.totalCycles  ?? 0) > 0)) continue
      for (const s of cache.states) {
        if (s.type !== 'downtime') continue
        const reason = s.name || s.reason || 'Sin causa'
        const entry  = reasonMap.get(reason)
        if (entry) {
          entry.durationSec += s.durationSec
          entry.count       += 1
        } else {
          reasonMap.set(reason, { durationSec: s.durationSec, color: s.color, count: 1 })
        }
      }
    }
    return [...reasonMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.durationSec - a.durationSec)
  }, [slxByShift, currentMonth])

  // ── Panel panorámico: disponibilidad diaria D/N del mes ──────────────────
  const availabilityTrend = useMemo((): Array<{ dk: string; day: SlxShiftCache | null; night: SlxShiftCache | null }> => {
    const year  = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const prefix     = `${year}-${String(month + 1).padStart(2, '0')}-`
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result: Array<{ dk: string; day: SlxShiftCache | null; night: SlxShiftCache | null }> = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dk = `${prefix}${String(d).padStart(2, '0')}`
      // Nuevo formato tiene precedencia. Fallback a legado solo si no hay dato nuevo.
      const dayCache = slxByShift.get(`${dk}__Turno 2`)
        ?? slxByShift.get(`${dk}__Turno día`)
        ?? null
      const nightCache =
        ([slxByShift.get(`${dk}__Turno 1`), slxByShift.get(`${dk}__Turno 3`)]
            .filter((c): c is SlxShiftCache => c != null && (c.totalCycles ?? 0) > 0)
            .sort((a, b) => (b.totalCycles ?? 0) - (a.totalCycles ?? 0))[0] ?? null)
        ?? slxByShift.get(`${dk}__Turno noche`)
        ?? null
      const dayHasData   = (dayCache?.totalCycles   ?? 0) > 0
      const nightHasData = (nightCache?.totalCycles ?? 0) > 0
      if (!dayHasData && !nightHasData) continue
      result.push({ dk, day: dayHasData ? dayCache : null, night: nightHasData ? nightCache : null })
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
      // Day: Turno 2 (nuevo) > Turno día (legado)
      const dayCache = slxByShift.get(`${dk}__Turno 2`) ?? slxByShift.get(`${dk}__Turno día`) ?? null
      if (dayCache && dayCache.totalCycles > 0) {
        const shiftId = slxByShift.has(`${dk}__Turno 2`) ? 'Turno 2' : 'Turno día'
        day.push({ dateKey: dk, shiftId, overallRatio: dayCache.overallRatio, shiftRuntime: dayCache.avgShiftRuntime, totalCycles: dayCache.totalCycles })
      }
      // Night: el de mayor ciclos entre Turno 1/3 (nuevo) > Turno noche (legado)
      const newNights = (['Turno 1', 'Turno 3'] as string[])
        .map(id => ({ id, c: slxByShift.get(`${dk}__${id}`) ?? null }))
        .filter((x): x is { id: string; c: SlxShiftCache } => x.c !== null && x.c.totalCycles > 0)
        .sort((a, b) => b.c.totalCycles - a.c.totalCycles)
      const nightEntry  = newNights[0] ?? null
      const nightCache  = nightEntry?.c ?? slxByShift.get(`${dk}__Turno noche`) ?? null
      const nightShiftId = nightEntry?.id ?? 'Turno noche'
      if (nightCache && nightCache.totalCycles > 0) {
        night.push({ dateKey: dk, shiftId: nightShiftId, overallRatio: nightCache.overallRatio, shiftRuntime: nightCache.avgShiftRuntime, totalCycles: nightCache.totalCycles })
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
    const allSalida = enriched.length > 0 && enriched.every((e) => e.kind === 'salida')
    const headerText = allSalida
      ? '📂 Turno noche programado en este día'
      : `📂 ${visibleCount} ${visibleCount === 1 ? 'turno' : 'turnos'} · ordenados por hora de inicio`

    const agg = calendarAgg.get(slideKey)
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
            const status = p0StatusFromPct(hist.pointZeroPct)
            const fragPieces = chip?.pieces ?? hist.totalPieces
            const fragP0Pieces = chip?.pointZeroPieces ?? hist.pointZeroPieces
            const fragWeight = chip?.weightKg ?? hist.totalWeightKg
            const isActiveForConfig = isSelectedSlide && selectedHistorical?.id === hist.id
            // Cross-ref Baader (Shoplogix): ¿cuántas piezas pasaron upstream?
            // Si Grader < 95% Baader → posible loss. Si Baader=0 (no data) → skip.
            const slxBaader = slxTotalsByShift.get(hist.id) ?? 0
            const baaderLossPct = slxBaader > 0 ? Math.max(0, (slxBaader - hist.totalPieces) / slxBaader * 100) : 0
            const showLossBadge = slxBaader > 100 && baaderLossPct > 5
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
                  P0_CARD_CLASS[status],
                  isActiveForConfig &&
                    'ring-2 ring-emerald-500 ring-offset-1 ring-offset-background',
                  isHovered && !isActiveForConfig &&
                    'ring-2 ring-white/80 ring-offset-1 ring-offset-background',
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
                    {showLossBadge && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-rose-500/15 text-rose-600 border border-rose-500/30 font-medium shrink-0"
                        title={`Grader registró ${hist.totalPieces.toLocaleString('es-CL')} piezas. Baader 142 procesó ${slxBaader.toLocaleString('es-CL')} upstream. Posible pérdida de data en este turno (~${baaderLossPct.toFixed(1)}%).`}
                      >
                        <AlertTriangle className="w-2.5 h-2.5" />
                        −{baaderLossPct.toFixed(0)}% vs Baader
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
                  <strong className="text-foreground/90">
                    {formatShiftTimeRange(hist)}
                  </strong>
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
              const isSelected = selectedDate?.toDateString() === day.toDateString()

              // Indicadores Shoplogix para días sin datos Grader.
              // Convención calendárica: el día visual `dayKey` muestra
              //   - Turno 2 / Turno día con dateKey CF == dayKey (tarde-noche del día)
              //   - Turno 1 con dateKey CF == dayKey (mañana del día)
              //   - Turno 3 con dateKey CF == dayKey-1 (madrugada del día — almacenado
              //     bajo el día anterior por la convención "día laboral" del CF).
              const prevDayKey = !hasData ? addDaysToDateKey(dayKey, -1) : ''
              const slxNewDay   = !hasData ? (slxTotalsByShift.get(`${dayKey}__Turno 2`) ?? 0) : 0
              const slxLegDay   = !hasData ? (slxTotalsByShift.get(`${dayKey}__Turno día`) ?? 0) : 0
              const slxDayCycles   = slxNewDay > 0 ? slxNewDay : slxLegDay
              const slxNewNight = !hasData ? Math.max(
                slxTotalsByShift.get(`${prevDayKey}__Turno 3`) ?? 0,  // madrugada (T3 CF=día anterior)
                slxTotalsByShift.get(`${dayKey}__Turno 1`)     ?? 0,  // mañana T1 (CF=día visual)
              ) : 0
              const slxLegNight = !hasData ? (slxTotalsByShift.get(`${dayKey}__Turno noche`) ?? 0) : 0
              const slxNightCycles = slxNewNight > 0 ? slxNewNight : slxLegNight
              const hasSlxDay   = slxDayCycles   > 0
              const hasSlxNight = slxNightCycles > 0
              const hasAnySlx   = hasSlxDay || hasSlxNight
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
                <button
                  key={dayKey}
                  className={cn(
                    'min-h-[56px] p-1 border rounded-md text-left transition-all flex flex-col gap-px',
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
                  onClick={() => setSelectedDate(day)}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      'text-xs font-semibold leading-none',
                      isToday(day) && 'text-primary',
                      isSelected && 'text-primary',
                    )}>
                      {day.getDate()}
                    </span>
                    {!hasData && dayUploads.length > 0 && (
                      <span className="text-[7px] text-muted-foreground leading-none border rounded px-0.5">
                        {dayUploads.length}f
                      </span>
                    )}
                  </div>

                  {/* Per-shift chips (Camino 2-B refinado: primary/secondary/orphan-source) */}
                  {chipsForDay.map((chip) => renderShiftChip(chip, filterUntagged ? (untaggedCounts.get(chip.summaryId) ?? null) : null))}

                  {/* Chips Shoplogix para días sin datos Grader */}
                  {!hasData && hasAnySlx && (
                    <>
                      {hasSlxDay && (
                        <div className="flex items-center justify-between rounded px-1 py-px leading-none bg-sky-500/15 text-sky-400">
                          <span className="text-[8px] font-medium opacity-80">D</span>
                          <span className="text-[9px] font-bold tabular-nums">
                            {slxDayCycles >= 1000
                              ? `${(slxDayCycles / 1000).toFixed(1)}k`
                              : String(slxDayCycles)}
                          </span>
                        </div>
                      )}
                      {hasSlxNight && (
                        <div className="flex items-center justify-between rounded px-1 py-px leading-none bg-indigo-500/15 text-indigo-400">
                          <span className="text-[8px] font-medium opacity-80">N</span>
                          <span className="text-[9px] font-bold tabular-nums">
                            {slxNightCycles >= 1000
                              ? `${(slxNightCycles / 1000).toFixed(1)}k`
                              : String(slxNightCycles)}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Sin proceso: día escaneado por Shoplogix sin producción */}
                  {dayScanned && (
                    <span className="text-[8px] text-muted-foreground/40 mt-auto block text-center leading-none">
                      sin proceso
                    </span>
                  )}

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
                    {/* ── Barra timeline 24h — 3 capas: bloques Grader / Shoplogix / eje hora ── */}
                    <div
                      className="relative overflow-hidden border-y border-border/25 bg-muted/15"
                      style={{ height: '56px' }}
                      title={slideKey ? `Timeline ${slideKey}` : undefined}
                    >
                      {/* ── Capa 1: grid de horas ── */}
                      {/* Medianoche */}
                      <div className="absolute inset-y-0 left-0 w-px bg-white/25 z-10 pointer-events-none" />
                      {/* Ticks cada 3h — más claros en las horas principales (6/12/18) */}
                      {[3, 6, 9, 12, 15, 18, 21].map(h => (
                        <div
                          key={h}
                          className={cn(
                            'absolute top-0 pointer-events-none z-10',
                            [6, 12, 18].includes(h)
                              ? 'bottom-0 w-px bg-white/20'
                              : 'bottom-5 w-px bg-border/30',
                          )}
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
                            top:             '3px',
                            bottom:          '18px',
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
                              top:    '3px',
                              bottom: '18px',
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
                Sin Excel cargado todavía
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {/* displayShifts: shifts del día visual (T3 viene del CF=día anterior). */}
                {(slxDisplayShifts(selectedKey, slxByShift)).map(({ shiftId, cfDateKey, slxKey }) => {
                  const hasSlx = (slxByShift.get(slxKey)?.states?.length ?? 0) > 0
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
                        <QuickGateChangeButton
                          shiftDocId={`${cfDateKey}__${shiftId}`}
                          variant="compact"
                          className="w-full h-6 text-[10px]"
                        />
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

      {/* ── Panel panorámico mensual (solo en layout no-stacked = landing page) ── */}
      {!stacked && slxMonthlyStats && (
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="pb-2 pt-4 px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Activity className="h-4 w-4 text-sky-400" />
                  Vista panorámica · {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">
                  {slxMonthlyStats.turnosWithData} turnos · {slxMonthlyStats.daysWithData} días con data
                </span>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* ── Col 1: KPIs mensuales Shoplogix ── */}
                <div className="space-y-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Métricas del mes
                  </p>
                  {/* Avg uptime destacado */}
                  <div className="flex items-baseline gap-2">
                    <span className={cn(
                      'text-3xl font-bold tabular-nums',
                      slxMonthlyStats.avgUptimePct >= 70 ? 'text-emerald-400' :
                      slxMonthlyStats.avgUptimePct >= 40 ? 'text-amber-400' : 'text-rose-400',
                    )}>
                      {slxMonthlyStats.avgUptimePct.toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground">uptime promedio</span>
                  </div>
                  {/* Mini KPIs */}
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded bg-muted/40 px-2 py-1.5">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Ciclos Baader</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {slxMonthlyStats.totalCycles >= 1000
                          ? `${(slxMonthlyStats.totalCycles / 1000).toFixed(1)}k`
                          : slxMonthlyStats.totalCycles.toLocaleString('es-CL')}
                      </p>
                    </div>
                    <div className="rounded bg-muted/40 px-2 py-1.5">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Turnos D/N</p>
                      <p className="text-sm font-semibold tabular-nums">
                        <span className="text-amber-400">{slxMonthlyStats.dayShiftsWithData}</span>
                        <span className="text-muted-foreground mx-0.5">/</span>
                        <span className="text-indigo-400">{slxMonthlyStats.nightShiftsWithData}</span>
                      </p>
                    </div>
                  </div>
                  {/* Mejor turno — fecha mostrada en convención calendárica */}
                  {slxMonthlyStats.bestShift && (
                    <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 space-y-0.5">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <TrendingUp className="h-3 w-3 text-emerald-400" />
                        Mejor turno
                      </div>
                      <p className="text-xs font-semibold text-emerald-400">
                        {getShiftDisplayDateKey(slxMonthlyStats.bestShift.dateKey, slxMonthlyStats.bestShift.shiftId).slice(5)}
                        {' · '}{slxMonthlyStats.bestShift.shiftId === 'Turno día' ? '☀' : '🌙'}
                        {' · '}<span className="font-bold">{slxMonthlyStats.bestShift.uptimePct.toFixed(0)}%</span>
                        <span className="text-muted-foreground font-normal">
                          {' · '}{slxMonthlyStats.bestShift.totalCycles >= 1000
                            ? `${(slxMonthlyStats.bestShift.totalCycles / 1000).toFixed(1)}k`
                            : slxMonthlyStats.bestShift.totalCycles} cic
                        </span>
                      </p>
                    </div>
                  )}
                  {/* Peor turno — fecha mostrada en convención calendárica */}
                  {slxMonthlyStats.worstShift && (
                    <div className="rounded border border-rose-500/20 bg-rose-500/5 px-2.5 py-1.5 space-y-0.5">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <TrendingDown className="h-3 w-3 text-rose-400" />
                        Peor turno
                      </div>
                      <p className="text-xs font-semibold text-rose-400">
                        {getShiftDisplayDateKey(slxMonthlyStats.worstShift.dateKey, slxMonthlyStats.worstShift.shiftId).slice(5)}
                        {' · '}{slxMonthlyStats.worstShift.shiftId === 'Turno día' ? '☀' : '🌙'}
                        {' · '}<span className="font-bold">{slxMonthlyStats.worstShift.uptimePct.toFixed(0)}%</span>
                        <span className="text-muted-foreground font-normal">
                          {' · '}{slxMonthlyStats.worstShift.totalCycles >= 1000
                            ? `${(slxMonthlyStats.worstShift.totalCycles / 1000).toFixed(1)}k`
                            : slxMonthlyStats.worstShift.totalCycles} cic
                        </span>
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Col 2: Pareto de paros del mes (upstream Baader) ── */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Top paros upstream · {monthNames[currentMonth.getMonth()]}
                  </p>
                  {monthParetoData.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">Sin datos de paros para este mes</p>
                  ) : (
                    <div ref={monthParetoRef} className="space-y-[5px] pt-0.5">
                      {(() => {
                        const totalSec = monthParetoData.reduce((a, r) => a + r.durationSec, 0)
                        return monthParetoData.slice(0, 7).map((item) => {
                          const pct = totalSec > 0 ? (item.durationSec / totalSec) * 100 : 0
                          return (
                            <div
                              key={item.name}
                              className="flex items-center gap-1.5 text-[10px]"
                              title={`${item.count} evento${item.count !== 1 ? 's' : ''} · ${fmtSecPanoramic(item.durationSec)} total`}
                            >
                              <span
                                className="w-2 h-2 rounded-sm shrink-0 ring-1 ring-black/30"
                                style={{ backgroundColor: item.color || '#64748b' }}
                              />
                              <span className="text-foreground/70 truncate shrink-0 w-[7.5rem]">
                                {item.name || 'Sin categoría'}
                              </span>
                              <div className="flex-1 h-1.5 bg-muted/60 rounded-full overflow-hidden min-w-0">
                                <div
                                  data-month-pareto-bar=""
                                  className="h-full rounded-full opacity-80"
                                  style={{
                                    width:           `${Math.max(pct, 1)}%`,
                                    backgroundColor: item.color || '#64748b',
                                    transformOrigin: 'left center',
                                  }}
                                />
                              </div>
                              <span className="text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                                {fmtSecPanoramic(item.durationSec)}
                              </span>
                              <span className="text-muted-foreground/60 tabular-nums shrink-0 w-7 text-right">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  )}
                  {monthParetoData.length > 0 && (
                    <p className="text-[9px] text-muted-foreground/40 pt-1">
                      * Estados de paro de la primera Baader 142 por turno
                    </p>
                  )}
                </div>

                {/* ── Col 3: Disponibilidad diaria D/N (stacked bars por día) ── */}
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Disponibilidad diaria · {monthNames[currentMonth.getMonth()]}
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
                      {availabilityTrend.map(({ dk, day, night }) => {
                        const buildAvailBar = (cache: SlxShiftCache | null) => {
                          if (!cache || !cache.breakdown) {
                            return <div className="flex-1 h-3 rounded-sm bg-muted/20 opacity-40" />
                          }
                          const bd   = cache.breakdown
                          const prod = bd.uptimeSec + bd.breakSec + bd.downtimeSec + bd.setupSec
                          if (prod === 0) return <div className="flex-1 h-3 rounded-sm bg-muted/20 opacity-40" />
                          const up    = (bd.uptimeSec   / prod) * 100
                          const brk   = (bd.breakSec    / prod) * 100
                          const down  = (bd.downtimeSec / prod) * 100
                          const setup = (bd.setupSec    / prod) * 100
                          return (
                            <div
                              className="flex flex-1 h-3 rounded-sm overflow-hidden bg-muted/60"
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
                            <span className="text-[8px] text-amber-500/60 shrink-0">D</span>
                            {buildAvailBar(day)}
                            <span className="text-[8px] text-indigo-400/60 shrink-0">N</span>
                            {buildAvailBar(night)}
                            <span className="text-muted-foreground/50 tabular-nums shrink-0 w-14 text-right text-[9px]">
                              {dayUptimeStr}/{nightUptimeStr}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

              </div>

              {/* ── Fila tendencia Baader: Día / Noche (debajo de las 3 cols) ── */}
              {(monthTrendPoints.day.length >= 2 || monthTrendPoints.night.length >= 2) && (
                <div className="col-span-full grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                  {monthTrendPoints.day.length >= 2 && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        ☀ Tendencia Baader · Turno Día
                      </p>
                      <MachineTrendMiniChart points={monthTrendPoints.day} />
                    </div>
                  )}
                  {monthTrendPoints.night.length >= 2 && (
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        🌙 Tendencia Baader · Turno Noche
                      </p>
                      <MachineTrendMiniChart points={monthTrendPoints.night} />
                    </div>
                  )}
                </div>
              )}

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
