/**
 * ARIA Tools — Grader / Análisis de Turno
 *
 * Expone los KPIs persistidos en `graderDailySummaries` (Firestore) como
 * tools invocables. Sprint 1 — Fase 1 del proyecto "ARIA-JARVIS".
 */
import { registerTool } from './registry'
import { getCurrentShift } from '../../chatbot'
import { listDailySummariesByRange } from '../../grader/graderDailySummary.service'
import type { GraderDailySummary } from '../../grader/types'
import { getLatestTurnoKPIs } from '../../grader/turnoKpis'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import { PLANT_LINES } from '@/config/plantLines'
import { loadShoplogixShift } from '@/services/shoplogix/shoplogixShift.service'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import { computeMachineKPI } from '@/services/grader/plantKpiCompute'
import { isMaintenanceMacro, isMaintenanceMicro } from '@/services/grader/shoplogixMaintenance'
import { getActivePlantLineId, getActivePlantSlug } from '../activePlant'

// ─── Detección de planta desde texto libre ────────────────────────────

/**
 * Mapea menciones de planta en el texto del usuario al `plantLineId`
 * concreto usado por `listDailySummariesByRange`. Conservador: solo
 * dispara si el match es inequívoco (yal/chonchi/principal/filete).
 * Si no hay match, devuelve undefined → la tool usa default global.
 */
export function detectPlantLineId(text: string): string | undefined {
  const lower = text.toLowerCase()
  if (/\b(yal|planta\s+yal)\b/.test(lower)) return 'yal-eviscerado'
  if (/\bfilete\b/.test(lower) && /\b(chonchi|principal|p\.?\s*principal)\b/.test(lower)) {
    return 'chonchi-filete'
  }
  if (/\b(chonchi|p\.?\s*principal|planta\s+principal)\b/.test(lower)) return 'chonchi-eviscerado'
  return undefined
}

function getPlantLabel(plantLineId: string): string {
  return PLANT_LINES.find(p => p.id === plantLineId)?.label || plantLineId
}

// ─── Utilidades fecha ──────────────────────────────────────────────────

function toDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function todayKey(): string {
  return toDateKey(new Date())
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateKey(d)
}

// ─── Utilidades formato ────────────────────────────────────────────────

function fmtNum(n: number | undefined, decimals = 0): string {
  if (n === undefined || n === null || !isFinite(n)) return '—'
  return n.toLocaleString('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function fmtPct(n: number | undefined): string {
  if (n === undefined || n === null || !isFinite(n)) return '—'
  return `${n.toFixed(2)}%`
}

function fmtMin(sec: number | undefined): string {
  if (sec === undefined || sec === null || !isFinite(sec)) return '—'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${m}min`
}

/** Fracción 0–1 → porcentaje con 1 decimal (para OEE/disponibilidad/rendimiento/calidad). */
function fmtFracPct(frac: number | null | undefined): string {
  if (frac === null || frac === undefined || !isFinite(frac)) return '—'
  return `${(frac * 100).toFixed(1)}%`
}

/** Minutos (MTTR) con 1 decimal. */
function fmtMinReliab(min: number | undefined): string {
  if (min === undefined || !isFinite(min) || min <= 0) return '—'
  return `${min.toFixed(1)} min`
}

/** Horas (MTBF) con 1 decimal; <1h se muestra en minutos. */
function fmtHours(h: number | undefined): string {
  if (h === undefined || !isFinite(h) || h <= 0) return '—'
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`
}

// ─── Turno EN VIVO desde Shoplogix (misma fuente que el board Análisis de Turno) ──

/** Candidatos de shiftId que Shoplogix puede usar en un día (orden cronológico). */
const SLX_SHIFT_CANDIDATES = ['Turno 1', 'Turno 2', 'Turno 3', 'Turno día', 'Turno noche', 'Unscheduled']
/** Umbral anti-ruido para el bucket 'Unscheduled' (ciclos sueltos de arranque/parada). */
const UNSCHEDULED_MIN_CYCLES = 50

function snapCycles(s: UpstreamLineSnapshot): number {
  return s.machines.reduce((acc, m) => acc + (m.totalCycles || 0), 0)
}

/**
 * Resuelve y carga el turno EN CURSO (más activo) de una planta para hoy,
 * replicando la lógica de `subscribeShoplogixShiftAuto` del board pero en una
 * sola lectura: prueba todos los candidatos y elige el que está produciendo
 * ahora (o, si ninguno produce, el de más ciclos). Devuelve el mismo snapshot
 * que renderiza el board → los números CUADRAN.
 */
interface LiveShift { snapshot: UpstreamLineSnapshot; syncedAt: Date | null }

async function loadLiveShift(plantSlug: PlantSlug): Promise<LiveShift | null> {
  const dk = todayKey()
  // forceServer=true → lectura fresca del servidor (no caché local), para que
  // "en vivo" sea lo más actual posible dado el sync de Shoplogix (~cada 5 min).
  const results = await Promise.all(
    SLX_SHIFT_CANDIDATES.map(sid =>
      loadShoplogixShift(dk, sid, plantSlug, true).catch(() => ({ snapshot: null, syncedAt: null })),
    ),
  )
  const valid = results.filter((r): r is LiveShift => {
    const s = r.snapshot
    if (!s) return false
    const cyc = snapCycles(s)
    if (cyc <= 0) return false
    if (s.shiftId === 'Unscheduled' && cyc < UNSCHEDULED_MIN_CYCLES) return false
    return true
  })
  if (valid.length === 0) return null
  const producing = valid.filter(r => (r.snapshot.machinesProducing || 0) > 0)
  const pool = producing.length > 0 ? producing : valid
  pool.sort((a, b) => snapCycles(b.snapshot) - snapCycles(a.snapshot))
  return pool[0]!
}

/** Etiqueta legible del turno. 'Unscheduled' de Shoplogix = producción registrada
 * sin turno asignado (fiel al registro; NO se define horario manual). */
function shiftLabel(shiftId: string): string {
  return shiftId === 'Unscheduled' ? 'Sin turno asignado' : shiftId
}

/** Rango horario real del turno (cruza medianoche → muestra día). */
function fmtShiftRange(s: UpstreamLineSnapshot): string {
  const m = s.machines[0]
  const start = m?.scheduledStart ?? m?.shiftStart
  const end = m?.scheduledEnd ?? m?.shiftEnd
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start.getTime()) || isNaN(end.getTime())) return '—'
  const t = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dt = (d: Date) => d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
  return start.toDateString() === end.toDateString() ? `${t(start)}–${t(end)}` : `${dt(start)} → ${dt(end)}`
}

/** Carga TODOS los buckets de turno con producción (>0 ciclos) de una planta/día,
 * incluido 'Unscheduled'. Fiel a lo que Shoplogix registró. */
async function loadAllShiftBuckets(plantSlug: PlantSlug, dk: string): Promise<LiveShift[]> {
  const results = await Promise.all(
    SLX_SHIFT_CANDIDATES.map(sid =>
      loadShoplogixShift(dk, sid, plantSlug, true).catch(() => ({ snapshot: null, syncedAt: null })),
    ),
  )
  return results.filter((r): r is LiveShift => !!r.snapshot && snapCycles(r.snapshot) > 0)
}

/**
 * Formatea el snapshot vivo como NOTAS para que ARIA las interprete (no como
 * respuesta final). Clave de negocio: en eviscerado 1 ciclo del Baader = 1
 * pescado → reportamos ciclos COMO piezas (el campo totalPieces del snapshot
 * está casi vacío y NO es el conteo de pescados). Se omite el conteo
 * instantáneo "produciendo X/N" (es el estado del último instante sincronizado
 * y engaña); en su lugar, uptime por máquina + antigüedad del dato.
 */
function formatLiveShift(s: UpstreamLineSnapshot, syncedAt: Date | null, plantLbl: string): string {
  const piezas = snapCycles(s)
  const cyclesPerMin = s.lineThroughputActual ? s.lineThroughputActual / 60 : 0
  const freshMin = syncedAt ? Math.max(0, Math.round((Date.now() - syncedAt.getTime()) / 60000)) : null
  const lines: string[] = [
    `Turno EN CURSO ${s.shiftId} · ${plantLbl} (${s.dateKey})${freshMin !== null ? ` · dato de Shoplogix de hace ~${freshMin} min` : ''}:`,
    `- Línea: ${fmtNum(piezas)} piezas (= ciclos de eviscerado) · ${fmtNum(cyclesPerMin, 1)} pz/min · disponibilidad de línea ${fmtFracPct(s.lineAvailability)}`,
  ]
  for (const m of s.machines) {
    const microMin = Math.round((m.shiftRuntimeBreakdown?.downtimeSec || 0) / 60)
    lines.push(
      `- ${m.machineName}: ${fmtNum(m.totalCycles)} piezas (${fmtFracPct(m.overallRatio)} del objetivo de ${fmtNum(m.expectedTotalCycles)}) · uptime ${fmtFracPct(m.shiftRuntime)}${microMin > 0 ? ` · ${microMin} min en micro-detención` : ''}`,
    )
  }
  return lines.join('\n')
}

function summarizeShift(s: GraderDailySummary): string {
  const parts: string[] = []
  const tag = s.turnoLabel ? `, ${s.turnoLabel}` : ''
  parts.push(`Turno ${s.shiftId} (${s.dateKey}${tag})${s.plantLineId ? ` · línea ${s.plantLineId}` : ''}`)
  parts.push(`- Piezas: ${fmtNum(s.totalPieces)} (${fmtNum(s.pointZeroPieces)} P0, ${fmtPct(s.pointZeroPct)})`)
  if (s.productionRatePerHour) parts.push(`- Throughput: ${fmtNum(s.productionRatePerHour)} piezas/h`)
  if (s.durationMinutes) parts.push(`- Duración: ${s.durationMinutes} min`)
  if (s.totalDeadTimeSec !== undefined) parts.push(`- Tiempo muerto: ${fmtMin(s.totalDeadTimeSec)}`)
  if (s.calibreDistribution && s.calibreDistribution.length > 0) {
    const top = s.calibreDistribution[0]
    if (top) parts.push(`- Calibre dominante: ${top.calibre} (${fmtPct(top.pct)})`)
  }
  if (s.topP0Causes && s.topP0Causes.length > 0) {
    const top3 = s.topP0Causes
      .slice(0, 3)
      .map(c => `${c.error}: ${fmtNum(c.pieces)} (${fmtPct(c.pct)})`)
      .join(', ')
    parts.push(`- Top causas P0: ${top3}`)
  }
  return parts.join('\n')
}

// ─── shift.current ─────────────────────────────────────────────────────

registerTool({
  name: 'shift.current',
  category: 'shift',
  description:
    'Turno EN CURSO real. Prioriza el turno vivo de Shoplogix (shiftId + horario REALES, que cambian según el día); si no hay dato vivo, cae a la ventana horaria genérica (mañana 06-14, tarde 14-22, noche 22-06). Detecta la planta activa del board (?linea=).',
  params: [
    {
      name: 'plantLineId',
      type: 'string',
      required: false,
      description: 'Planta (yal-eviscerado, chonchi-eviscerado, chonchi-filete)',
    },
  ],
  triggers: [
    /\b(turno\s+actual|qu[eé]\s+turno|en\s+qu[eé]\s+turno|hora\s+actual)\b/i,
  ],
  execute: async (params) => {
    const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    const plantLineId = (params.plantLineId as string | undefined) ?? getActivePlantLineId()
    // Fuente de verdad: el turno EN CURSO que Shoplogix registra (shiftId +
    // horario reales). Los horarios CAMBIAN y el hardcode local los desfasa.
    if (plantLineId) {
      try {
        const slug: PlantSlug =
          (PLANT_LINES.find(p => p.id === plantLineId)?.plantSlug as PlantSlug) || 'chonchi'
        const live = await loadLiveShift(slug)
        if (live) {
          const s = live.snapshot
          const label = shiftLabel(s.shiftId)
          const range = fmtShiftRange(s)
          const plantLbl = getPlantLabel(plantLineId)
          return {
            ok: true,
            data: { shift: s.shiftId, label, range, hora, plantLineId, source: 'shoplogix' },
            summary: `Turno EN CURSO (Shoplogix): ${label}${range !== '—' ? ` (${range})` : ''} · ${plantLbl}. Hora local ${hora}.`,
            label: 'Turno actual',
          }
        }
      } catch { /* sin dato vivo → ventana genérica abajo */ }
    }
    const shift = getCurrentShift()
    return {
      ok: true,
      data: { shift: shift.shift, label: shift.label, range: shift.range, hora, source: 'local' },
      summary: `${shift.label} (${shift.range}). Hora actual: ${hora}. (Ventana horaria genérica — sin turno vivo de Shoplogix confirmado.)`,
      label: 'Turno actual',
    }
  },
})

// ─── shift.today ───────────────────────────────────────────────────────

registerTool({
  name: 'shift.today',
  category: 'shift',
  description:
    'Resumen de todos los turnos cargados hoy: piezas, P0%, throughput (piezas/h), calibre dominante, top causas P0, tiempo muerto. Opcionalmente filtrable por planta (yal/chonchi/filete).',
  params: [
    {
      name: 'plantLineId',
      type: 'string',
      required: false,
      description: 'Filtrar por planta (yal-eviscerado, chonchi-eviscerado, chonchi-filete)',
    },
  ],
  triggers: [
    /\b(hoy|d[ií]a\s+actual|del\s+d[ií]a)\b.*\b(turno|p0|piezas?|producci[oó]n|calibre|ciclos?\/?h|throughput|rendimiento|kpi|resumen|c[oó]mo\s+va|c[oó]mo\s+vamos|mttr|tiempo\s+muerto|downtime|pausas?)\b/i,
    /\b(mttr|p0%?|ciclos?\/?h|throughput|calibre\s+dominante|tiempo\s+muerto|downtime|piezas?\/?h)\b.*\b(hoy|d[ií]a)\b/i,
    /\b(c[oó]mo\s+va\s+el\s+turno|c[oó]mo\s+vamos|resumen\s+de\s+hoy|qu[eé]\s+tal\s+(el\s+)?turno|c[oó]mo\s+est[aá]\s+el\s+turno|c[oó]mo\s+anda)\b/i,
  ],
  execute: async (params) => {
    const today = todayKey()
    const plantLineId = params.plantLineId as string | undefined
    const summaries = await listDailySummariesByRange(today, today, plantLineId)
    const plantSuffix = plantLineId ? ` · ${getPlantLabel(plantLineId)}` : ''
    if (summaries.length === 0) {
      // Fallback: el Excel del Grader se sube al CIERRE, pero Shoplogix ya
      // registró producción hoy. Sumamos TODOS los turnos del día (incluido
      // "sin turno") — NO un solo turno vivo — para que ARIA pueda responder el
      // acumulado del día en curso. Los números cuadran con Análisis de Turno.
      try {
        const slug: PlantSlug = plantLineId
          ? ((PLANT_LINES.find(p => p.id === plantLineId)?.plantSlug as PlantSlug) || 'chonchi')
          : (getActivePlantSlug() || 'chonchi')
        const buckets = await loadAllShiftBuckets(slug, today)
        if (buckets.length > 0) {
          const plantLbl = plantLineId
            ? getPlantLabel(plantLineId)
            : (slug === 'yal' ? 'Planta Yal' : 'Planta Principal (Chonchi)')
          const sorted = [...buckets].sort((a, b) => {
            const sa = a.snapshot.machines[0]?.shiftStart?.getTime() ?? 0
            const sb = b.snapshot.machines[0]?.shiftStart?.getTime() ?? 0
            return sa - sb
          })
          const total = sorted.reduce((acc, b) => acc + snapCycles(b.snapshot), 0)
          const turnos = sorted.map(b => ({
            turno: shiftLabel(b.snapshot.shiftId),
            piezas: snapCycles(b.snapshot),
            rango: fmtShiftRange(b.snapshot),
            enCurso: (b.snapshot.machinesProducing || 0) > 0,
          }))
          const lines = [
            `Aún no se ha subido el Excel del Grader${plantSuffix} (se carga al cierre), pero Shoplogix ya registró producción HOY (${today}) en ${plantLbl}. Acumulado del DÍA COMPLETO (todos los turnos, incluido "sin turno asignado"):`,
            `- TOTAL DÍA: ${fmtNum(total)} piezas (= ciclos de eviscerado)`,
            ...turnos.map(t => `- ${t.turno}${t.rango !== '—' ? ` (${t.rango})` : ''}: ${fmtNum(t.piezas)} piezas${t.enCurso ? ' · ← EN CURSO' : ''}`),
            '',
            '(El P0%/calidad se calcula al cierre, cuando se sube el Excel del Grader.)',
          ]
          return {
            ok: true,
            data: {
              date: today,
              plantLineId,
              source: 'shoplogix-live',
              count: 0,
              liveTotalPieces: total,
              liveTurnos: turnos,
            },
            summary: lines.join('\n'),
            label: `Producción de hoy (Shoplogix)${plantSuffix}`,
          }
        }
      } catch { /* si Shoplogix falla, caemos al mensaje informativo de abajo */ }
      return {
        ok: true,
        data: { date: today, plantLineId, count: 0 },
        summary: `Aún no hay datos de Grader ni de Shoplogix para hoy (${today})${plantSuffix}. El Excel del turno se carga al cierre, así que es normal si el turno recién comienza.`,
        label: `Turnos hoy${plantSuffix}`,
      }
    }
    const lines = summaries.map(summarizeShift).join('\n\n')
    const totalPieces = summaries.reduce((acc, s) => acc + s.totalPieces, 0)
    const totalP0 = summaries.reduce((acc, s) => acc + s.pointZeroPieces, 0)
    const p0Pct = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
    return {
      ok: true,
      data: { date: today, plantLineId, count: summaries.length, summaries, totalPieces, p0Pct },
      summary: `Turnos cargados hoy (${today})${plantSuffix} — ${summaries.length} turno(s), ${fmtNum(totalPieces)} piezas, P0% global ${fmtPct(p0Pct)}:\n\n${lines}`,
      label: `Turnos hoy${plantSuffix}`,
    }
  },
})

// ─── shift.lastByPlant ─────────────────────────────────────────────────

registerTool({
  name: 'shift.lastByPlant',
  category: 'shift',
  description:
    'Devuelve el último turno cerrado de una planta (yal/chonchi/filete), con hora de inicio y cierre. Resuelve preguntas como "¿a qué hora terminó el último turno de Yal?", "¿cuándo cerró Chonchi anoche?".',
  params: [
    {
      name: 'plantLineId',
      type: 'string',
      required: false,
      default: 'chonchi-eviscerado',
      description: 'ID de planta (yal-eviscerado, chonchi-eviscerado, chonchi-filete)',
    },
    { name: 'daysBack', type: 'number', required: false, default: 30, description: 'Buscar dentro de últimos N días' },
  ],
  triggers: [
    /\b(a\s+qu?[eé]\s+)?hora\s+(termin[oó]|cerr[oó]|acab[oó]|finaliz[oó])\b/i,
    /\b[uú]ltimo\s+turno\s+(de|del|en)\b/i,
    /\bcu[aá]ndo\s+(termin[oó]|cerr[oó])\s+(el\s+)?[uú]ltimo\s+turno\b/i,
    /\b[uú]ltima\s+jornada\b/i,
    /\b(termin[oó]|cerr[oó])\s+(yal|chonchi|principal|filete)\b/i,
  ],
  execute: async (params) => {
    const plantLineId = (params.plantLineId as string) || 'chonchi-eviscerado'
    const daysBack = (params.daysBack as number) || 30
    const start = daysAgo(daysBack)
    const end = todayKey()
    const summaries = await listDailySummariesByRange(start, end, plantLineId)
    const plantLabel = getPlantLabel(plantLineId)
    const withEndAt = summaries.filter(s => s.endAt)
    if (withEndAt.length === 0) {
      return {
        ok: true,
        data: { plantLineId, count: 0 },
        summary: `Sin turnos cerrados con timestamp registrados para **${plantLabel}** en los últimos ${daysBack} días. El campo endAt se llena al guardar el turno desde la app — turnos antiguos pueden no tenerlo.`,
        label: `Último turno ${plantLabel}`,
      }
    }
    // Ordenar por endAt descendente (ISO strings ordenables lexicográficamente)
    const sorted = [...withEndAt].sort((a, b) => (b.endAt || '').localeCompare(a.endAt || ''))
    const last = sorted[0]!
    // Humanizar timestamps
    let endHuman = last.endAt || '—'
    let startHuman = last.startAt || '—'
    try {
      if (last.endAt) {
        endHuman = new Date(last.endAt).toLocaleString('es-CL', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        })
      }
      if (last.startAt) {
        startHuman = new Date(last.startAt).toLocaleString('es-CL', {
          day: '2-digit', month: '2-digit',
          hour: '2-digit', minute: '2-digit',
        })
      }
    } catch {
      // mantener strings raw si parse falla
    }
    return {
      ok: true,
      data: { plantLineId, plantLabel, last },
      summary: [
        `Último turno cerrado de **${plantLabel}**:`,
        `- Turno: ${last.shiftId} (${last.dateKey})${last.turnoLabel ? ` · ${last.turnoLabel}` : ''}`,
        `- Inicio: ${startHuman}`,
        `- **Fin: ${endHuman}**`,
        `- Piezas: ${fmtNum(last.totalPieces)} · P0% ${fmtPct(last.pointZeroPct)}`,
        last.durationMinutes ? `- Duración: ${last.durationMinutes} min` : '',
      ].filter(Boolean).join('\n'),
      label: `Último turno ${plantLabel}`,
    }
  },
})

// ─── shift.byDate ──────────────────────────────────────────────────────

registerTool({
  name: 'shift.byDate',
  category: 'shift',
  description:
    'Resumen de turnos en una fecha específica (params: date YYYY-MM-DD). Por defecto: ayer si no se da fecha.',
  params: [
    { name: 'date', type: 'date', required: false, description: 'Fecha YYYY-MM-DD' },
  ],
  triggers: [
    /\b(ayer|anteayer|antier|anoche)\b/i,
    /\bd[ií]a\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/i,
  ],
  execute: async (params) => {
    let date = (params.date as string) || daysAgo(1)
    if (typeof date !== 'string') date = daysAgo(1)
    const summaries = await listDailySummariesByRange(date, date)
    if (summaries.length === 0) {
      return {
        ok: true,
        data: { date, count: 0 },
        summary: `Sin datos cargados para ${date}.`,
        label: `Turnos ${date}`,
      }
    }
    const lines = summaries.map(summarizeShift).join('\n\n')
    return {
      ok: true,
      data: { date, count: summaries.length, summaries },
      summary: `Turnos del ${date}:\n\n${lines}`,
      label: `Turnos ${date}`,
    }
  },
})

// ─── period.summary ────────────────────────────────────────────────────

function detectPeriodFromText(text: string): { label: string; daysBack: number } {
  const lower = text.toLowerCase()
  if (/\b(este\s+mes|del\s+mes|mensual|[uú]ltimo\s+mes)\b/.test(lower)) {
    return { label: 'este mes', daysBack: 30 }
  }
  if (/\b(quincena|quincenal|15\s*d[ií]as?)\b/.test(lower)) {
    return { label: 'últimos 15 días', daysBack: 15 }
  }
  if (/\b(semana|7\s*d[ií]as?|esta\s+semana|[uú]ltima\s+semana|semanal)\b/.test(lower)) {
    return { label: 'esta semana', daysBack: 7 }
  }
  // match explícito "últimos N días"
  const m = lower.match(/[uú]ltimos?\s+(\d+)\s*d[ií]as?/)
  if (m && m[1]) {
    const n = parseInt(m[1], 10)
    if (n > 0 && n < 365) return { label: `últimos ${n} días`, daysBack: n }
  }
  return { label: 'últimos 7 días', daysBack: 7 }
}

registerTool({
  name: 'period.summary',
  category: 'shift',
  description:
    'KPIs agregados de un período (semana/mes): piezas totales, P0% ponderado, throughput promedio, mejor y peor turno',
  params: [
    {
      name: 'daysBack',
      type: 'number',
      required: false,
      description: 'Cantidad de días hacia atrás (7=semana, 30=mes)',
      default: 7,
    },
  ],
  triggers: [
    /\b(esta\s+semana|este\s+mes|mensual|semanal|[uú]ltimos?\s+\d+\s*d[ií]as?|quincena|del\s+mes)\b/i,
  ],
  execute: async (params) => {
    const daysBack = (params.daysBack as number) || 7
    const periodLabel =
      daysBack === 30 ? 'este mes' : daysBack === 7 ? 'esta semana' : `últimos ${daysBack} días`
    const start = daysAgo(daysBack)
    const end = todayKey()
    const summaries = await listDailySummariesByRange(start, end)
    if (summaries.length === 0) {
      return {
        ok: true,
        data: { count: 0, period: periodLabel },
        summary: `Sin datos cargados para ${periodLabel}.`,
        label: periodLabel,
      }
    }
    const totalPieces = summaries.reduce((acc, s) => acc + s.totalPieces, 0)
    const totalP0 = summaries.reduce((acc, s) => acc + s.pointZeroPieces, 0)
    const p0Pct = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
    const sortedByP0 = [...summaries].sort((a, b) => a.pointZeroPct - b.pointZeroPct)
    const best = sortedByP0[0]
    const worst = sortedByP0[sortedByP0.length - 1]
    const ratesWithData = summaries.filter(s => typeof s.productionRatePerHour === 'number')
    const avgRate =
      ratesWithData.length > 0
        ? ratesWithData.reduce((acc, s) => acc + (s.productionRatePerHour || 0), 0) / ratesWithData.length
        : 0
    const lines = [
      `Período: ${periodLabel} (${start} → ${end})`,
      `Turnos analizados: ${summaries.length}`,
      `Piezas totales: ${fmtNum(totalPieces)}`,
      `P0% ponderado: ${fmtPct(p0Pct)}`,
      avgRate > 0 ? `Throughput promedio: ${fmtNum(avgRate)} piezas/h` : '',
      best ? `Mejor turno (menor P0%): ${best.dateKey} ${best.shiftId} — ${fmtPct(best.pointZeroPct)}` : '',
      worst && worst !== best
        ? `Peor turno (mayor P0%): ${worst.dateKey} ${worst.shiftId} — ${fmtPct(worst.pointZeroPct)}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')
    return {
      ok: true,
      data: { period: periodLabel, start, end, count: summaries.length, totalPieces, totalP0, p0Pct, avgRate, best, worst },
      summary: lines,
      label: `Resumen ${periodLabel}`,
    }
  },
})

// ─── period.best / period.worst ────────────────────────────────────────

type Metric = 'p0' | 'throughput' | 'pieces' | 'duration'

function getMetricValue(s: GraderDailySummary, metric: Metric): number {
  switch (metric) {
    case 'p0':
      return s.pointZeroPct
    case 'throughput':
      return s.productionRatePerHour || 0
    case 'pieces':
      return s.totalPieces
    case 'duration':
      return s.durationMinutes || 0
  }
}

function rankByMetric(
  summaries: GraderDailySummary[],
  metric: Metric,
  descending: boolean,
): GraderDailySummary[] {
  return [...summaries].sort((a, b) => {
    const av = getMetricValue(a, metric)
    const bv = getMetricValue(b, metric)
    return descending ? bv - av : av - bv
  })
}

function detectMetricFromText(text: string): Metric {
  const lower = text.toLowerCase()
  if (/\b(throughput|ciclos?\/?h|piezas?\/?h|rate|producci[oó]n\/?h|rendimiento\/?h)\b/.test(lower)) return 'throughput'
  if (/\b(piezas?|cantidad|volumen|m[aá]s\s+producci[oó]n|m[aá]s\s+volumen)\b/.test(lower)) return 'pieces'
  if (/\b(duraci[oó]n|tiempo\s+de\s+turno|horas\s+trabajadas)\b/.test(lower)) return 'duration'
  return 'p0'
}

const METRIC_LABEL: Record<Metric, string> = {
  p0: 'P0%',
  throughput: 'Throughput (piezas/h)',
  pieces: 'Piezas totales',
  duration: 'Duración (min)',
}

function formatMetric(s: GraderDailySummary, metric: Metric): string {
  switch (metric) {
    case 'p0':
      return fmtPct(s.pointZeroPct)
    case 'throughput':
      return `${fmtNum(s.productionRatePerHour)} piezas/h`
    case 'pieces':
      return fmtNum(s.totalPieces)
    case 'duration':
      return `${s.durationMinutes || 0} min`
  }
}

registerTool({
  name: 'period.best',
  category: 'shift',
  description:
    'Top 5 mejores turnos de un período según métrica (p0/throughput/pieces/duration). Default: menor P0%, últimos 7 días.',
  params: [
    {
      name: 'metric',
      type: 'string',
      enum: ['p0', 'throughput', 'pieces', 'duration'],
      required: false,
      default: 'p0',
      description: 'Métrica a rankear',
    },
    { name: 'daysBack', type: 'number', required: false, default: 7, description: 'Días hacia atrás' },
  ],
  triggers: [
    /\b(mejor|m[aá]s\s+alto|menor|m[ií]nimo|m[aá]ximo|top|r[eé]cord|record)\b.*\b(turno|d[ií]a|p0|throughput|piezas?|ciclos?\/?h|producci[oó]n)\b/i,
    /\b(qu[eé]\s+(d[ií]a|turno)\s+(tuvo|fue|hicimos))\b/i,
    /\b(d[ií]a\s+con\s+m[aá]s|turno\s+con\s+m[aá]s)\b/i,
  ],
  execute: async (params) => {
    const metric = (params.metric as Metric) || 'p0'
    const daysBack = (params.daysBack as number) || 7
    const start = daysAgo(daysBack)
    const end = todayKey()
    const summaries = await listDailySummariesByRange(start, end)
    if (summaries.length === 0) {
      return { ok: true, data: { count: 0 }, summary: `Sin datos cargados.`, label: `Mejor ${METRIC_LABEL[metric]}` }
    }
    // p0: menor es mejor → ascending. Resto: mayor es mejor → descending.
    const descending = metric !== 'p0'
    const ranked = rankByMetric(summaries, metric, descending).slice(0, 5)
    const lines = ranked.map((s, i) => `${i + 1}. ${s.dateKey} ${s.shiftId}: ${formatMetric(s, metric)}`).join('\n')
    return {
      ok: true,
      data: { metric, daysBack, top5: ranked },
      summary: `Top 5 por ${METRIC_LABEL[metric]} (${descending ? 'mayor es mejor' : 'menor es mejor'}, período ${daysBack}d):\n${lines}`,
      label: `Mejor ${METRIC_LABEL[metric]}`,
    }
  },
})

registerTool({
  name: 'period.worst',
  category: 'shift',
  description: 'Peores 5 turnos de un período según métrica (p0 más alto, throughput más bajo, etc.)',
  params: [
    {
      name: 'metric',
      type: 'string',
      enum: ['p0', 'throughput', 'pieces', 'duration'],
      required: false,
      default: 'p0',
      description: 'Métrica a rankear',
    },
    { name: 'daysBack', type: 'number', required: false, default: 7, description: 'Días hacia atrás' },
  ],
  triggers: [
    /\b(peor|m[aá]s\s+bajo|p[eé]simo|menos)\b.*\b(turno|d[ií]a|p0|throughput|piezas?|producci[oó]n)\b/i,
    /\b(qu[eé]\s+(d[ií]a|turno))\s+tuvo\s+menos\b/i,
  ],
  execute: async (params) => {
    const metric = (params.metric as Metric) || 'p0'
    const daysBack = (params.daysBack as number) || 7
    const start = daysAgo(daysBack)
    const end = todayKey()
    const summaries = await listDailySummariesByRange(start, end)
    if (summaries.length === 0) {
      return { ok: true, data: { count: 0 }, summary: `Sin datos cargados.`, label: `Peor ${METRIC_LABEL[metric]}` }
    }
    // p0: mayor es peor → descending. Resto: menor es peor → ascending.
    const descending = metric === 'p0'
    const ranked = rankByMetric(summaries, metric, descending).slice(0, 5)
    const lines = ranked.map((s, i) => `${i + 1}. ${s.dateKey} ${s.shiftId}: ${formatMetric(s, metric)}`).join('\n')
    return {
      ok: true,
      data: { metric, daysBack, worst5: ranked },
      summary: `Peores 5 por ${METRIC_LABEL[metric]} (período ${daysBack}d):\n${lines}`,
      label: `Peor ${METRIC_LABEL[metric]}`,
    }
  },
})

// ─── period.kpi ────────────────────────────────────────────────────────

/**
 * Devuelve UN solo KPI agregado del período (vs period.summary que devuelve
 * varios). Útil para preguntas puntuales: "¿P0% del mes?", "¿throughput
 * promedio esta semana?", "¿cuántas piezas llevamos?".
 *
 * Si el período tiene 0 turnos, devuelve mensaje informativo.
 * Si hay turnos, devuelve el valor + breakdown ligero (mejor/peor/promedio).
 */
registerTool({
  name: 'period.kpi',
  category: 'shift',
  description:
    'Devuelve UN KPI específico (p0/throughput/pieces) agregado en un período. Más conciso que period.summary cuando la pregunta es puntual. Filtrable por planta.',
  params: [
    {
      name: 'metric',
      type: 'string',
      enum: ['p0', 'throughput', 'pieces'],
      required: false,
      default: 'p0',
      description: 'KPI a devolver',
    },
    { name: 'daysBack', type: 'number', required: false, default: 7, description: 'Días hacia atrás' },
    {
      name: 'plantLineId',
      type: 'string',
      required: false,
      description: 'Filtrar por planta (yal-eviscerado, chonchi-eviscerado, chonchi-filete)',
    },
  ],
  triggers: [
    /\b(cu[aá]l\s+es\s+(el|la)\s+(p0|throughput|piezas|producci[oó]n|rendimiento)).*\b(mes|semana|d[ií]a|hoy)\b/i,
    /\b(p0%?\s+(del|de\s+(la|el))\s+(mes|semana|d[ií]a))\b/i,
    /\b(throughput\s+(del|de\s+(la|el))\s+(mes|semana|d[ií]a))\b/i,
    /\b(cu[aá]nt[ao]s?\s+(piezas|ciclos)\s+(llevamos|llev[aá]mos|tenemos))\b/i,
  ],
  execute: async (params) => {
    const metric = (params.metric as Metric) || 'p0'
    const daysBack = (params.daysBack as number) || 7
    const plantLineId = params.plantLineId as string | undefined
    const periodLabel =
      daysBack === 30 ? 'este mes' : daysBack === 7 ? 'esta semana' : `últimos ${daysBack} días`
    const plantSuffix = plantLineId ? ` · ${getPlantLabel(plantLineId)}` : ''
    const start = daysAgo(daysBack)
    const end = todayKey()
    const summaries = await listDailySummariesByRange(start, end, plantLineId)
    if (summaries.length === 0) {
      return {
        ok: true,
        data: { metric, daysBack, plantLineId, count: 0 },
        summary: `Sin datos cargados para ${periodLabel}${plantSuffix}.`,
        label: `${METRIC_LABEL[metric]} ${periodLabel}${plantSuffix}`,
      }
    }
    let value: number
    let valueText: string
    if (metric === 'p0') {
      // P0% ponderado por piezas totales
      const totalPieces = summaries.reduce((acc, s) => acc + s.totalPieces, 0)
      const totalP0 = summaries.reduce((acc, s) => acc + s.pointZeroPieces, 0)
      value = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
      valueText = fmtPct(value)
    } else if (metric === 'pieces') {
      value = summaries.reduce((acc, s) => acc + s.totalPieces, 0)
      valueText = fmtNum(value)
    } else {
      // throughput promedio sobre turnos con dato
      const withRate = summaries.filter(s => typeof s.productionRatePerHour === 'number')
      value =
        withRate.length > 0
          ? withRate.reduce((acc, s) => acc + (s.productionRatePerHour || 0), 0) / withRate.length
          : 0
      valueText = `${fmtNum(value)} piezas/h`
    }
    // Best/worst para contexto (siempre por la misma métrica, "best" según semántica de p0 ya)
    const ranked = rankByMetric(summaries, metric, metric !== 'p0')
    const best = ranked[0]
    const worst = ranked[ranked.length - 1]
    const detail: string[] = []
    if (best) detail.push(`mejor turno: ${best.dateKey} ${best.shiftId} (${formatMetric(best, metric)})`)
    if (worst && worst !== best) detail.push(`peor: ${worst.dateKey} ${worst.shiftId} (${formatMetric(worst, metric)})`)
    return {
      ok: true,
      data: { metric, daysBack, plantLineId, value, count: summaries.length, best, worst },
      summary: `${METRIC_LABEL[metric]} ${periodLabel}${plantSuffix}: **${valueText}** (basado en ${summaries.length} turnos)${detail.length ? '\n' + detail.join(' · ') : ''}`,
      label: `${METRIC_LABEL[metric]} ${periodLabel}${plantSuffix}`,
    }
  },
})

// ─── shift.kpis (OEE / disponibilidad / MTTR / MTBF del turno) ─────────

registerTool({
  name: 'shift.kpis',
  category: 'shift',
  description:
    'KPIs de eficiencia y confiabilidad del último turno con actividad: OEE, disponibilidad, rendimiento, calidad, MTTR, MTBF, averías macro y micro-detenciones. Mismos números que el board Análisis de Turno. Por defecto Planta Principal (Chonchi); detecta Yal.',
  params: [
    {
      name: 'plantSlug',
      type: 'string',
      enum: ['chonchi', 'yal'],
      required: false,
      default: 'chonchi',
      description: 'Planta Shoplogix (chonchi = principal, yal)',
    },
  ],
  triggers: [
    /\b(oee|disponibilidad|mttr|mtbf|confiabilidad|aver[ií]as?|micro-?detenci[oó]n|tiempo\s+entre\s+fallas|indicadores\s+de\s+rendimiento|rendimiento\s+de\s+m[aá]quina|eficiencia\s+(del|de\s+(la|el))\s+(turno|planta|l[ií]nea))\b/i,
    /\bc[oó]mo\s+(va|est[aá]|anda)\s+(el\s+)?(oee|la\s+disponibilidad|la\s+confiabilidad|la\s+planta|la\s+l[ií]nea)\b/i,
  ],
  execute: async (params) => {
    const plantSlug: PlantSlug = params.plantSlug === 'yal' ? 'yal' : 'chonchi'
    const plantLabel = plantSlug === 'yal' ? 'Planta Yal' : 'Planta Principal (Chonchi)'
    // Calidad (1−P0%) del Grader. Primero ventana reciente (operación viva, barato);
    // si no hay turno reciente, ampliamos para ubicar el último turno DISPONIBLE.
    let graderSummaries = await listDailySummariesByRange(daysAgo(8), todayKey()).catch(() => [] as GraderDailySummary[])
    let k = await getLatestTurnoKPIs(plantSlug, graderSummaries)
    if (!k) {
      // Sin turno con actividad reciente → ampliar para ubicar el último turno disponible
      // (histórico); allowEmpty para, en último caso, reportar el turno en inicio (0%).
      graderSummaries = await listDailySummariesByRange(daysAgo(210), todayKey()).catch(() => [] as GraderDailySummary[])
      k = await getLatestTurnoKPIs(plantSlug, graderSummaries, true)
    }
    if (!k) {
      return {
        ok: true,
        data: { plantSlug, count: 0 },
        summary: `Aún no hay datos de turno (Shoplogix) para ${plantLabel} en los últimos días. El OEE/disponibilidad/MTTR se calculan cuando se carga el turno; es normal si el turno está en curso o no se ha sincronizado.`,
        label: `KPIs de turno · ${plantLabel}`,
      }
    }
    const oeeNote = k.oee === null ? ' (falta calidad del Grader para cerrar el OEE)' : ''
    const qNote = k.quality === null ? ' (sin datos Grader)' : ''
    const lines = [
      `KPIs del turno ${k.shiftId} (${k.dateKey}) · ${plantLabel} — ${k.machines.length} máquina(s):`,
      `- OEE: ${fmtFracPct(k.oee)}${oeeNote}`,
      `- Disponibilidad: ${fmtFracPct(k.availability)}`,
      `- Rendimiento: ${fmtFracPct(k.performance)}`,
      `- Calidad: ${fmtFracPct(k.quality)}${qNote}`,
      `- MTTR (averías macro): ${fmtMinReliab(k.mttrMin)}`,
      `- MTBF: ${fmtHours(k.mtbfHours)}`,
      `- Averías macro (≥5 min): ${k.failureCount}`,
      `- Micro-detenciones (<5 min): ${k.microCount}${k.microMin > 0 ? ` (${fmtMinReliab(k.microMin)} en total)` : ''}`,
    ]
    return {
      ok: true,
      data: { plantSlug, kpis: k },
      summary: lines.join('\n'),
      label: `KPIs de turno · ${plantLabel}`,
    }
  },
})

// ─── shift.live (producción EN VIVO del turno en curso, desde Shoplogix) ──────

registerTool({
  name: 'shift.live',
  category: 'shift',
  description:
    'Producción EN VIVO del turno en curso desde Shoplogix — lo MISMO que muestra el board Análisis de Turno: piezas/ciclos totales y por cada máquina Baader, velocidad (pz/min), % del objetivo, uptime por máquina, disponibilidad de línea, máquinas produciendo y micro-detenciones. Detecta planta (yal/chonchi). Úsalo para "cuántas piezas llevan", "velocidad de las baader", "cómo va la producción ahora", "en vivo/tiempo real".',
  params: [
    {
      name: 'plantSlug',
      type: 'string',
      enum: ['chonchi', 'yal'],
      required: false,
      default: 'chonchi',
      description: 'Planta Shoplogix (chonchi = principal, yal)',
    },
  ],
  triggers: [
    /\b(cu[aá]nt[ao]s?\s+(piezas|ciclos|pescados))\b/i,
    /\b(velocidad|ritmo|pz\/?min|piezas?\/?min|ciclos?\/?min|throughput\s+actual)\b/i,
    /\b(en\s+vivo|tiempo\s+real|ahora\s+mismo|producci[oó]n\s+(actual|ahora|en\s+vivo|en\s+tiempo\s+real))\b/i,
    /\bc[oó]mo\s+(va|est[aá]|anda)\s+(la\s+)?(producci[oó]n|l[ií]nea|planta)\b/i,
  ],
  execute: async (params) => {
    const plantSlug: PlantSlug = params.plantSlug === 'yal' ? 'yal' : 'chonchi'
    const plantLbl = plantSlug === 'yal' ? 'Planta Yal' : 'Planta Principal (Chonchi)'
    const live = await loadLiveShift(plantSlug)
    if (!live) {
      return {
        ok: true,
        data: { plantSlug, count: 0 },
        summary: `No hay datos vivos de Shoplogix para ${plantLbl} en este momento (turno sin iniciar o sincronización pendiente).`,
        label: `Turno en vivo · ${plantLbl}`,
      }
    }
    const s = live.snapshot
    return {
      ok: true,
      data: {
        plantSlug,
        shiftId: s.shiftId,
        dateKey: s.dateKey,
        syncedAtMinAgo: live.syncedAt ? Math.round((Date.now() - live.syncedAt.getTime()) / 60000) : null,
        piezasLinea: snapCycles(s), // 1 ciclo = 1 pescado
        lineAvailability: s.lineAvailability,
        machines: s.machines.map(m => ({
          name: m.machineName,
          piezas: m.totalCycles,
          objetivo: m.expectedTotalCycles,
          pctObjetivo: m.overallRatio,
          uptime: m.shiftRuntime,
        })),
      },
      summary: formatLiveShift(s, live.syncedAt, plantLbl),
      label: `Turno en vivo · ${plantLbl}`,
    }
  },
})

// ─── shift.dayProduction (registro FIEL de un día: todos los turnos + sin turno) ──

registerTool({
  name: 'shift.dayProduction',
  category: 'shift',
  description:
    'Producción registrada en Shoplogix para una planta en un día (default hoy; entiende "ayer"/"anoche"/"madrugada"), sumando TODOS los turnos INCLUIDO lo "sin turno asignado" (Unscheduled). Fiel al registro directo de Shoplogix — NO impone horarios. Úsalo para "cuánto se registró hoy/anoche en total", "producción de la madrugada", "qué se pasó sin turno", "producción del día completo". Detecta planta (yal/chonchi).',
  params: [
    { name: 'plantSlug', type: 'string', enum: ['chonchi', 'yal'], required: false, default: 'chonchi', description: 'Planta' },
    { name: 'date', type: 'date', required: false, description: 'Fecha YYYY-MM-DD (default hoy)' },
  ],
  triggers: [
    /\b(en\s+total|producci[oó]n\s+total|total\s+del\s+d[ií]a|todos?\s+los\s+turnos|d[ií]a\s+completo)\b/i,
    /\b(anoche|madrugada|de\s+noche|nocturn[ao]|sin\s+turno|unscheduled)\b/i,
    /\bcu[aá]nt[ao]s?\s+(piezas|ciclos)?\s*(se\s+)?(registr|proces|pas|pescamos|pesc[oó])/i,
  ],
  execute: async (params) => {
    const plantSlug: PlantSlug = params.plantSlug === 'yal' ? 'yal' : 'chonchi'
    const plantLbl = plantSlug === 'yal' ? 'Planta Yal' : 'Planta Principal (Chonchi)'
    const dk = (typeof params.date === 'string' && params.date) || todayKey()
    const buckets = await loadAllShiftBuckets(plantSlug, dk)
    if (buckets.length === 0) {
      return {
        ok: true,
        data: { plantSlug, date: dk, count: 0 },
        summary: `No hay producción registrada en Shoplogix para ${plantLbl} el ${dk}.`,
        label: `Producción ${plantLbl} · ${dk}`,
      }
    }
    const sorted = [...buckets].sort((a, b) => {
      const sa = a.snapshot.machines[0]?.shiftStart?.getTime() ?? 0
      const sb = b.snapshot.machines[0]?.shiftStart?.getTime() ?? 0
      return sa - sb
    })
    const total = sorted.reduce((acc, b) => acc + snapCycles(b.snapshot), 0)

    // Tiempos de detención por turno + total del día. Antes esta tool solo
    // sumaba PIEZAS; el operador pregunta también "tiempos del día y del
    // turno del día" y no había ningún dato de duración acá.
    const detencionSecOf = (s: UpstreamLineSnapshot) =>
      s.machines.reduce((acc, m) =>
        acc + m.states.filter(st => st.type === 'downtime').reduce((a, st) => a + (st.durationSec || 0), 0), 0)
    const uptimeSecOf = (s: UpstreamLineSnapshot) =>
      s.machines.reduce((acc, m) => acc + (m.shiftRuntimeBreakdown?.uptimeSec ?? 0), 0)
    const totalDetencionSec = sorted.reduce((acc, b) => acc + detencionSecOf(b.snapshot), 0)

    const lines = [
      `Producción registrada en ${plantLbl} el ${dk} (fiel a Shoplogix, TODOS los turnos):`,
      `- TOTAL: ${fmtNum(total)} piezas · detención total del día ${fmtMin(totalDetencionSec)}`,
    ]
    for (const b of sorted) {
      const s = b.snapshot
      const detSec = detencionSecOf(s)
      lines.push(`- ${shiftLabel(s.shiftId)} (${fmtShiftRange(s)}): ${fmtNum(snapCycles(s))} piezas · detención ${fmtMin(detSec)}`)
    }
    return {
      ok: true,
      data: {
        plantSlug,
        date: dk,
        totalPiezas: total,
        totalDetencionMin: Math.round(totalDetencionSec / 60),
        turnos: sorted.map(b => ({
          turno: shiftLabel(b.snapshot.shiftId),
          piezas: snapCycles(b.snapshot),
          rango: fmtShiftRange(b.snapshot),
          detencionMin: Math.round(detencionSecOf(b.snapshot) / 60),
          uptimeMin: Math.round(uptimeSecOf(b.snapshot) / 60),
        })),
      },
      summary: lines.join('\n'),
      label: `Producción ${plantLbl} · ${dk}`,
    }
  },
})

// ─── shift.stops (por qué está detenida + averías/MTTR + causas, EN VIVO) ──────

/** Un evento de detención individual (una fila por state downtime, no agregado por causa). */
interface StopEvent {
  machineName: string
  startAt: Date
  durationSec: number
  causa: string
  macro: boolean
  micro: boolean
}

/** Extrae cada detención (state.type==='downtime') de un snapshot, evento por evento. */
export function extractStopEvents(s: UpstreamLineSnapshot): StopEvent[] {
  const events: StopEvent[] = []
  for (const m of s.machines) {
    for (const st of m.states) {
      if (st.type !== 'downtime') continue
      events.push({
        machineName: m.machineName,
        startAt: st.startAt,
        durationSec: st.durationSec || 0,
        causa: (st.reason || st.name || 'sin motivo').trim(),
        macro: isMaintenanceMacro(st),
        micro: isMaintenanceMicro(st),
      })
    }
  }
  return events.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
}

const fmtHM = (d: Date) => d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })

registerTool({
  name: 'shift.stops',
  category: 'shift',
  description:
    'Detenciones y confiabilidad desde Shoplogix, cuadra con el board Análisis de Turno: estado ACTUAL de cada Baader (produciendo o detenida y POR QUÉ), averías macro, MTTR, micro-detenciones, el LISTADO de cada detención individual (hora + duración + causa), y el Pareto de causas de parada (energía, atascamiento, ajuste mantención, colación, o "falta de MMPP" si Shoplogix la etiqueta). Por defecto el turno EN CURSO; con fecha (ayer/anoche/una fecha) consulta un turno PASADO. Detecta planta (yal/chonchi). Úsalo para "por qué está detenida/parada la línea", "qué fallas/averías han tenido", "cuánto duró cada detención", "MTTR/confiabilidad", "motivo de las paradas", "cuánto tiempo detenida", "detenciones de ayer/del turno del día".',
  params: [
    { name: 'plantSlug', type: 'string', enum: ['chonchi', 'yal'], required: false, default: 'chonchi', description: 'Planta' },
    { name: 'date', type: 'date', required: false, description: 'Fecha YYYY-MM-DD del turno a consultar (default: turno en curso/hoy)' },
  ],
  triggers: [
    /\bpor\s+qu[eé]\b.*\b(detenid|parad|par[oó]|frenad|fren[oó])/i,
    /\b(fallas?|aver[ií]as?|detenci[oó]n(es)?|paros?|micro-?detenci|mttr|mtbf|confiabilidad)\b/i,
    /\b(motivo|causa|raz[oó]n)\b.*\b(parad|detenci|par[oó]|fren)/i,
    /\b(falta\s+de\s+(mmpp|materia\s+prima)|atascamiento|energ[ií]a)\b/i,
    // "cuánto duró/tiempo" + "cada detención" — cobertura explícita de duración
    // por evento (antes solo se enrutaba por la palabra genérica "detención").
    /\b(cu[aá]nto\s+(tiempo|dur[oó])|duraci[oó]n)\b.*\b(detenci|parad|par[oó]|fren|falla|aver)/i,
    /\bcada\s+(detenci|parad|falla|aver)/i,
  ],
  execute: async (params) => {
    const plantSlug: PlantSlug = params.plantSlug === 'yal' ? 'yal' : 'chonchi'
    const plantLbl = plantSlug === 'yal' ? 'Planta Yal' : 'Planta Principal (Chonchi)'
    const wantsPast = typeof params.date === 'string' && params.date && params.date !== todayKey()

    // Turno EN VIVO (hoy) vs turno PASADO (fecha explícita): distintas fuentes.
    // loadLiveShift resuelve el turno más activo de HOY; para un día pasado no
    // hay "en curso" — se toma el bucket con más ciclos de loadAllShiftBuckets
    // (mismo patrón que shift.dayProduction).
    let live: LiveShift | null
    if (wantsPast) {
      const dk = params.date as string
      const buckets = await loadAllShiftBuckets(plantSlug, dk)
      live = buckets.length > 0
        ? [...buckets].sort((a, b) => snapCycles(b.snapshot) - snapCycles(a.snapshot))[0]!
        : null
    } else {
      live = await loadLiveShift(plantSlug)
    }

    if (!live) {
      const dia = wantsPast ? ` el ${params.date}` : ' en este momento (turno sin iniciar o sync pendiente)'
      return {
        ok: true,
        data: { plantSlug, count: 0 },
        summary: `No hay datos de Shoplogix para ${plantLbl}${dia}.`,
        label: `Detenciones · ${plantLbl}`,
      }
    }
    const s = live.snapshot
    const freshMin = live.syncedAt ? Math.max(0, Math.round((Date.now() - live.syncedAt.getTime()) / 60000)) : null
    // shiftLabel() traduce 'Unscheduled' → 'Sin turno asignado': sin esto, si
    // el bucket con más ciclos del día pasado resultaba ser Unscheduled, ARIA
    // respondía literalmente "turno Unscheduled del 2026-07-05" al usuario.
    const tag = wantsPast ? `${shiftLabel(s.shiftId)} del ${s.dateKey}` : `EN CURSO ${shiftLabel(s.shiftId)}`

    // Estado ACTUAL por máquina (último state = el vigente) — solo tiene
    // sentido para el turno en vivo; en un turno pasado el "último state" es
    // simplemente cómo cerró.
    const ahora = s.machines.map(m => {
      const last = m.states[m.states.length - 1]
      if (!last) return `${m.machineName}: sin datos`
      if (last.type === 'uptime') return `${m.machineName}: produciendo ✅`
      if ((last.name || '').trim() === 'Micro Detencion') return `${m.machineName}: en micro-detención`
      const causa = (last.reason || '').trim()
      return `${m.machineName}: DETENIDA${causa ? ` — ${causa}` : ' (motivo sin registrar)'}`
    })

    // Confiabilidad (MISMAS funciones que el board → cuadra).
    // `map` pasa el índice como 2º arg — envolver para no colarlo como lineCpm.
    const kpis = s.machines.map(m => computeMachineKPI(m))
    const failures = kpis.reduce((a, k) => a + k.failureCount, 0)
    const macroMinTotal = kpis.reduce((a, k) => a + k.mttrMin * k.failureCount, 0)
    const mttr = failures > 0 ? macroMinTotal / failures : 0
    const micro = kpis.reduce((a, k) => a + k.microCount, 0)
    const microMin = kpis.reduce((a, k) => a + k.microMin, 0)

    // LISTADO evento-por-evento (hora + duración + causa) — antes solo se
    // agregaba por causa (Pareto) y no se podía responder "cuánto duró CADA
    // detención". Cada state downtime, ordenado cronológicamente.
    const events = extractStopEvents(s)

    // Pareto por causa (se mantiene para el resumen ejecutivo).
    const stopSec = new Map<string, number>()
    let breakSec = 0
    for (const m of s.machines) {
      for (const st of m.states) {
        if (st.type === 'downtime') {
          const key = (st.reason || st.name || 'sin motivo').trim()
          stopSec.set(key, (stopSec.get(key) || 0) + (st.durationSec || 0))
        } else if (st.type === 'break') {
          breakSec += st.durationSec || 0
        }
      }
    }
    const pareto = [...stopSec.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

    const lines: string[] = [
      `Detenciones y confiabilidad · ${plantLbl} · turno ${tag}${freshMin !== null ? ` (dato de hace ~${freshMin} min)` : ''}:`,
    ]
    if (!wantsPast) lines.push(`- Estado ahora: ${ahora.join(' · ')}`)
    lines.push(`- Averías macro: ${failures} · MTTR ${mttr > 0 ? `${mttr.toFixed(1)} min` : '—'} · Micro-detenciones: ${micro}${microMin > 0 ? ` (${Math.round(microMin)} min)` : ''}`)

    if (events.length) {
      lines.push(`- Detenciones (evento por evento, ${events.length} en total):`)
      // Top 12 por duración para no saturar la respuesta; el dato completo va en `data.eventos`.
      const topEvents = [...events].sort((a, b) => b.durationSec - a.durationSec).slice(0, 12)
      for (const ev of topEvents) {
        const tipo = ev.macro ? ' [avería macro]' : ev.micro ? ' [micro]' : ''
        lines.push(`  · ${fmtHM(ev.startAt)} ${ev.machineName} — ${ev.causa}: ${fmtMin(ev.durationSec)}${tipo}`)
      }
    }
    if (pareto.length) {
      lines.push('- Causas de detención (paros operativos, por tiempo total):')
      for (const [causa, sec] of pareto) lines.push(`  · ${causa}: ${fmtMin(sec)}`)
    }
    if (breakSec > 0) lines.push(`- Pausas programadas (colación/reunión): ${fmtMin(breakSec)}`)

    return {
      ok: true,
      data: {
        plantSlug,
        shiftId: s.shiftId,
        dateKey: s.dateKey,
        estadoActual: wantsPast ? undefined : ahora,
        averiasMacro: failures,
        mttrMin: mttr,
        microCount: micro,
        microMin,
        pausasProgramadasMin: Math.round(breakSec / 60),
        causasDetencion: pareto.map(([causa, sec]) => ({ causa, minutos: Math.round(sec / 60) })),
        eventos: events.map(ev => ({
          maquina: ev.machineName,
          hora: fmtHM(ev.startAt),
          duracionMin: Math.round(ev.durationSec / 60),
          causa: ev.causa,
          macro: ev.macro,
          micro: ev.micro,
        })),
      },
      summary: lines.join('\n'),
      label: `Detenciones · ${plantLbl}`,
    }
  },
})

// ─── Inferencia de params adicionales desde texto libre ────────────────

/**
 * Enriquece los params de una tool detectada con info inferida del texto
 * libre del usuario (período, métrica, fecha relativa).
 */
export function inferToolParams(toolName: string, userMessage: string): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (
    toolName === 'period.summary' ||
    toolName === 'period.best' ||
    toolName === 'period.worst' ||
    toolName === 'period.kpi'
  ) {
    const { daysBack } = detectPeriodFromText(userMessage)
    params.daysBack = daysBack
    if (toolName !== 'period.summary') {
      params.metric = detectMetricFromText(userMessage)
    }
  }
  if (toolName === 'shift.byDate') {
    const lower = userMessage.toLowerCase()
    if (/\b(anteayer|antier)\b/.test(lower)) {
      params.date = daysAgo(2)
    } else if (/\b(ayer|anoche)\b/.test(lower)) {
      params.date = daysAgo(1)
    }
    // patrón "día DD/MM" o "día DD-MM" → calcular del año actual
    const m = lower.match(/d[ií]a\s+(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?/)
    if (m) {
      const day = parseInt(m[1] || '0', 10)
      const month = parseInt(m[2] || '0', 10)
      const yearRaw = m[3] ? parseInt(m[3], 10) : new Date().getFullYear()
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw
      if (day > 0 && month > 0 && month <= 12 && day <= 31) {
        const dStr = String(day).padStart(2, '0')
        const mStr = String(month).padStart(2, '0')
        params.date = `${year}-${mStr}-${dStr}`
      }
    }
  }
  // Detección de planta para tools que aceptan plantLineId.
  // Prioridad: lo que el usuario nombra en el texto > la planta ACTIVA del
  // board (?linea=). Antes, sin mención explícita se asumía siempre Chonchi.
  if (
    toolName === 'shift.today' ||
    toolName === 'shift.current' ||
    toolName === 'shift.lastByPlant' ||
    toolName === 'period.kpi'
  ) {
    const plant = detectPlantLineId(userMessage) ?? getActivePlantLineId()
    if (plant) params.plantLineId = plant
  }
  // shift.kpis, shift.live, shift.dayProduction y shift.stops usan PlantSlug.
  // Texto explícito > planta activa del board.
  if (toolName === 'shift.kpis' || toolName === 'shift.live' || toolName === 'shift.dayProduction' || toolName === 'shift.stops') {
    if (/\b(yal|planta\s+yal)\b/i.test(userMessage)) params.plantSlug = 'yal'
    else if (/\b(chonchi|p\.?\s*principal|planta\s+principal)\b/i.test(userMessage)) params.plantSlug = 'chonchi'
    else {
      const activeSlug = getActivePlantSlug()
      if (activeSlug) params.plantSlug = activeSlug
    }
  }
  // shift.dayProduction / shift.stops: fecha relativa. "anoche"/"madrugada" →
  // ayer (Shoplogix lumpea la producción nocturna que cruza medianoche en el
  // bucket del día que arrancó la ventana, típicamente ayer). "del día" SIN
  // "ayer/anoche" NO cambia la fecha — el default (sin date) ya es hoy/turno
  // en curso, que es lo correcto para "detenciones del día". Antes esto solo
  // aplicaba a shift.dayProduction — shift.stops quedaba siempre en vivo aunque
  // se preguntara "detenciones de ayer".
  if (toolName === 'shift.dayProduction' || toolName === 'shift.stops') {
    const lower = userMessage.toLowerCase()
    if (/\b(anteayer|antier|anteanoche)\b/.test(lower)) params.date = daysAgo(2)
    else if (/\b(ayer|anoche|madrugada|de\s+noche)\b/.test(lower)) params.date = daysAgo(1)
  }
  return params
}
