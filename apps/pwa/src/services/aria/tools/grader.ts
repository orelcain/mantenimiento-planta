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
  description: 'Devuelve el turno actual según hora local (mañana 06-14, tarde 14-22, noche 22-06)',
  params: [],
  triggers: [
    /\b(turno\s+actual|qu[eé]\s+turno|en\s+qu[eé]\s+turno|hora\s+actual)\b/i,
  ],
  execute: () => {
    const shift = getCurrentShift()
    const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
    return {
      ok: true,
      data: { shift: shift.shift, label: shift.label, range: shift.range, hora },
      summary: `${shift.label} (${shift.range}). Hora actual: ${hora}.`,
      label: 'Turno actual',
    }
  },
})

// ─── shift.today ───────────────────────────────────────────────────────

registerTool({
  name: 'shift.today',
  category: 'shift',
  description:
    'Resumen de todos los turnos cargados hoy: piezas, P0%, throughput (piezas/h), calibre dominante, top causas P0, tiempo muerto',
  params: [],
  triggers: [
    /\b(hoy|d[ií]a\s+actual|del\s+d[ií]a)\b.*\b(turno|p0|piezas?|producci[oó]n|calibre|ciclos?\/?h|throughput|rendimiento|kpi|resumen|c[oó]mo\s+va|c[oó]mo\s+vamos|mttr|tiempo\s+muerto|downtime|pausas?)\b/i,
    /\b(mttr|p0%?|ciclos?\/?h|throughput|calibre\s+dominante|tiempo\s+muerto|downtime|piezas?\/?h)\b.*\b(hoy|d[ií]a)\b/i,
    /\b(c[oó]mo\s+va\s+el\s+turno|c[oó]mo\s+vamos|resumen\s+de\s+hoy|qu[eé]\s+tal\s+(el\s+)?turno|c[oó]mo\s+est[aá]\s+el\s+turno|c[oó]mo\s+anda)\b/i,
  ],
  execute: async () => {
    const today = todayKey()
    const summaries = await listDailySummariesByRange(today, today)
    if (summaries.length === 0) {
      return {
        ok: true,
        data: { date: today, count: 0 },
        summary: `Aún no hay datos de Grader cargados para hoy (${today}). El Excel del turno se carga al cierre, así que es normal si el turno está en curso.`,
        label: 'Turnos hoy',
      }
    }
    const lines = summaries.map(summarizeShift).join('\n\n')
    const totalPieces = summaries.reduce((acc, s) => acc + s.totalPieces, 0)
    const totalP0 = summaries.reduce((acc, s) => acc + s.pointZeroPieces, 0)
    const p0Pct = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
    return {
      ok: true,
      data: { date: today, count: summaries.length, summaries, totalPieces, p0Pct },
      summary: `Turnos cargados hoy (${today}) — ${summaries.length} turno(s), ${fmtNum(totalPieces)} piezas, P0% global ${fmtPct(p0Pct)}:\n\n${lines}`,
      label: 'Turnos hoy',
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
    /\bd[ií]a\s+\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/i,
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

// ─── Inferencia de params adicionales desde texto libre ────────────────

/**
 * Enriquece los params de una tool detectada con info inferida del texto
 * libre del usuario (período, métrica, fecha relativa).
 */
export function inferToolParams(toolName: string, userMessage: string): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (toolName === 'period.summary' || toolName === 'period.best' || toolName === 'period.worst') {
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
    const m = lower.match(/d[ií]a\s+(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/)
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
  return params
}
