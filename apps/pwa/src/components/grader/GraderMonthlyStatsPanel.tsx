/**
 * Panel lateral de KPIs mensuales unificado.
 * Layout idéntico para todas las plantas — mismas secciones, mismo orden.
 * Muestra "—" cuando faltan datos (sin Excel Grader o sin Shoplogix).
 */
import { useMemo } from 'react'
import { Card, CardContent } from '@/components/ui'
import { TrendingDown, TrendingUp, AlertTriangle, BarChart3, Sun, Moon, Sunset, Sunrise, Clock } from 'lucide-react'
import type { GraderDailySummary } from '@/services/grader/types'
import { getCauseLabel } from '@/services/grader/graderMatrixP0Causes'
import { p0StatusFromPct, p0StatusColor } from '@/services/grader/graderP0Thresholds'
import { aggregateByShiftDay } from '@/services/grader/graderCalendarAggregation'
import { getShiftMeta } from '@/services/grader/graderShiftDisplay'
import { fmt, fmtDec } from '@/lib/format'
import { fmtSecPanoramic, type SlxMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'
import { ImputacionPeriodCard } from './ImputacionPeriodCard'

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

interface Props {
  currentMonth: Date
  summaries: GraderDailySummary[]
  slxStats?: SlxMonthlyStats | null
  /**
   * Si la planta clasifica (Chonchi) → grid Día/Noche.
   * Si NO clasifica (Yal y similares) → grid T1/T2/T3 (la nomenclatura real
   * que Shoplogix usa para esa planta). Default true para preservar el
   * comportamiento de Chonchi cuando se omita el prop.
   */
  isClassificationPlant?: boolean
}

export function GraderMonthlyStatsPanel({ currentMonth, summaries, slxStats, isClassificationPlant = true }: Props) {
  const monthLabel = `${MONTH_NAMES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`

  const stats = useMemo(() => {
    const valid = summaries.filter(s => s.totalPieces > 0)
    if (valid.length === 0) return null

    const totalPieces   = valid.reduce((s, d) => s + d.totalPieces, 0)
    const totalP0       = valid.reduce((s, d) => s + d.pointZeroPieces, 0)
    const p0Avg         = totalPieces > 0 ? (totalP0 / totalPieces) * 100 : 0
    const totalWeightKg = valid.reduce((s, d) => s + (d.totalWeightKg ?? 0), 0)

    const sorted      = [...valid].sort((a, b) => a.pointZeroPct - b.pointZeroPct)
    const bestSummary = sorted[0]!
    const worstSummary = sorted[sorted.length - 1]!

    const causaMap = new Map<string, number>()
    for (const s of valid) {
      for (const c of s.topP0Causes ?? []) {
        causaMap.set(c.error, (causaMap.get(c.error) ?? 0) + c.pieces)
      }
    }
    const causasRaw = [...causaMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([error, pieces]) => ({
        error,
        pieces,
        // % sobre total piezas → contribución directa al P0% (ej: 1.09% de 2.87%)
        pct: totalPieces > 0 ? (pieces / totalPieces) * 100 : 0,
      }))
    const maxCausaPct = causasRaw[0]?.pct ?? 1
    const causas = causasRaw.map(c => ({ ...c, barPct: maxCausaPct > 0 ? (c.pct / maxCausaPct) * 100 : 0 }))

    // Mismo criterio que el calendario: el turno cuenta en el dia que le
    // asigno Shoplogix, no en el dia fisico en que produjo.
    const calendarAgg = aggregateByShiftDay({ summaries: valid })
    const uniqueDays  = calendarAgg.size
    const startedDays = new Set(valid.map(s => s.dateKey)).size

    const primaryDateKeyBySummary = new Map<string, string>()
    for (const day of calendarAgg.values()) {
      for (const c of day.contributingShifts) {
        if (c.isPrimary) primaryDateKeyBySummary.set(c.summaryId, c.dateKey)
      }
    }
    const enrich = (s: GraderDailySummary) => ({ ...s, primaryDateKey: primaryDateKeyBySummary.get(s.id) ?? s.dateKey })

    const dayShifts   = valid.filter(s => s.shiftId === 'Turno día').length
    const nightShifts = valid.filter(s => s.shiftId === 'Turno noche').length
    const t1Shifts    = valid.filter(s => s.shiftId === 'Turno 1').length
    const t2Shifts    = valid.filter(s => s.shiftId === 'Turno 2').length
    const t3Shifts    = valid.filter(s => s.shiftId === 'Turno 3').length

    return {
      turnos: valid.length, uniqueDays, startedDays,
      dayShifts, nightShifts, t1Shifts, t2Shifts, t3Shifts,
      totalPieces, totalWeightKg, p0Avg, causas,
      best:  enrich(bestSummary),
      worst: enrich(worstSummary),
    }
  }, [summaries])

  const noData = !stats && !slxStats

  if (noData) {
    return (
      <Card className="h-fit">
        <CardContent className="py-10 text-center">
          <BarChart3 className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{monthLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">Sin datos registrados</p>
        </CardContent>
      </Card>
    )
  }

  // Mapeo de shiftId a label vía helper centralizado (getShiftMeta).
  // Soporta legacy ("Turno día/noche") y nuevo formato Yal ("Turno 1/2/3").
  const shortShiftLabel = (shiftId: string) => {
    const meta = getShiftMeta(shiftId)
    // Para T1/T2/T3 mostrar "T1 mañana" etc; para legado solo "Día"/"Noche".
    return meta.period === 'mañana' || meta.period === 'tarde' || meta.period === 'noche'
      ? `${meta.shortLabel} ${meta.period}`
      : meta.shortLabel
  }
  const shiftLabel = (s: GraderDailySummary) => shortShiftLabel(s.shiftId)
  const p0Color    = stats ? p0StatusColor(p0StatusFromPct(stats.p0Avg)) : 'text-muted-foreground'

  // Mejor/Peor: preferir Grader (P0%), fallback Shoplogix (uptime)
  const best = stats
    ? { value: `${fmtDec(stats.best.pointZeroPct, 2)}%`,  metric: 'P0%',   date: `${stats.best.primaryDateKey.slice(5)}  · ${shiftLabel(stats.best)}` }
    : slxStats?.bestShift
      ? { value: `${slxStats.bestShift.uptimePct.toFixed(0)}%`, metric: 'uptime', date: `${slxStats.bestShift.dateKey.slice(5)} · ${shortShiftLabel(slxStats.bestShift.shiftId)}` }
      : null

  const worst = stats
    ? { value: `${fmtDec(stats.worst.pointZeroPct, 2)}%`, metric: 'P0%',   date: `${stats.worst.primaryDateKey.slice(5)} · ${shiftLabel(stats.worst)}` }
    : slxStats?.worstShift
      ? { value: `${slxStats.worstShift.uptimePct.toFixed(0)}%`, metric: 'uptime', date: `${slxStats.worstShift.dateKey.slice(5)} · ${shortShiftLabel(slxStats.worstShift.shiftId)}` }
      : null

  const dayShifts   = stats?.dayShifts   ?? slxStats?.dayShiftsWithData   ?? 0
  const nightShifts = stats?.nightShifts ?? slxStats?.nightShiftsWithData ?? 0
  const daysCount   = stats?.uniqueDays  ?? slxStats?.daysWithData        ?? 0
  const turnosCount = stats?.turnos      ?? slxStats?.turnosWithData      ?? 0
  // T1/T2/T3 counts — Yal-only. Refleja la nomenclatura real de Shoplogix.
  // El Grader (stats) cuenta por shiftId del Excel, que casi nunca usa T1/T2/T3
  // en Yal (suele tener "Turno día"/"Turno noche" del Marelec). Por eso para
  // T1/T2/T3 priorizamos slxStats (Shoplogix = verdad) y solo caemos a stats
  // si Shoplogix está ausente.
  const t1Shifts = slxStats?.t1ShiftsWithData ?? stats?.t1Shifts ?? 0
  const t2Shifts = slxStats?.t2ShiftsWithData ?? stats?.t2Shifts ?? 0
  const t3Shifts = slxStats?.t3ShiftsWithData ?? stats?.t3Shifts ?? 0
  // La grilla T1/T2/T3 solo tiene sentido si la línea usa esa nomenclatura.
  // Filete emite un único "Turno Dia": con la grilla numerada mostraba 0/0/0
  // aunque el mes tuviera turnos con producción. Ahí cae a Día/Noche.
  const useNumberedShiftGrid = t1Shifts + t2Shifts + t3Shifts > 0

  return (
    // top-[4.5rem]: el header global es sticky h-14 (56px) con z-30; si el panel
    // se fija en top-4 (16px) queda DEBAJO del header y sus cards superiores
    // (Mejor/Peor turno) aparecen cortadas al scrollear. 4.5rem = 56px header + 16px gap.
    <div className="space-y-2 lg:sticky lg:top-[4.5rem]">

      {/* ── Header ── */}
      <div>
        <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">Resumen del mes</p>
        <p className="text-sm font-bold leading-tight">{monthLabel}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0">
          {daysCount} días · {turnosCount} turnos
        </p>
      </div>

      {/* ── Fila 1: Grader KPI | Shoplogix KPI ── */}
      <div className="grid grid-cols-2 gap-2">
        {/* Grader */}
        <Card className={stats ? '' : 'opacity-40'}>
          <CardContent className="pt-2 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">P0% promedio</p>
            <p className={`text-xl font-bold leading-none tabular-nums ${p0Color}`}>
              {stats ? `${fmtDec(stats.p0Avg, 2)}%` : '—'}
            </p>
            {stats && (
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                {fmt(stats.totalPieces)} pz
                {stats.totalWeightKg > 0 && <> · {fmtDec(stats.totalWeightKg / 1000, 1)} t</>}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Shoplogix */}
        <Card className={slxStats ? '' : 'opacity-40'}>
          <CardContent className="pt-2 pb-2 px-3">
            <p className="text-[10px] text-muted-foreground mb-0.5">Ciclos Baader</p>
            <p className={`text-xl font-bold leading-none tabular-nums ${slxStats ? 'text-primary' : 'text-muted-foreground'}`}>
              {slxStats
                ? (slxStats.totalCycles >= 1000
                    ? `${(slxStats.totalCycles / 1000).toFixed(1)}k`
                    : slxStats.totalCycles.toLocaleString('es-CL'))
                : '—'}
            </p>
            {slxStats && (
              <p className={`text-[10px] mt-0.5 ${
                slxStats.avgUptimePct >= 70 ? 'text-ink-ok'
                : slxStats.avgUptimePct >= 40 ? 'text-ink-warn' : 'text-cat-5-ink'
              }`}>
                {slxStats.avgUptimePct.toFixed(0)}% uptime
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Fila 2: Mejor / Peor turno ── */}
      <div className="grid grid-cols-2 gap-2">
        <Card className={`border-emerald-500/[0.25] bg-emerald-500/[0.15] ${!best ? 'opacity-40' : ''}`}>
          <CardContent className="pt-1.5 pb-1.5 px-3">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingDown className="w-3 h-3 text-emerald-500" />
              <p className="text-[11px] text-ink-ok font-medium">
                Mejor · {best?.metric ?? '—'}
              </p>
            </div>
            <p className="text-lg font-bold text-ink-ok leading-none tabular-nums">
              {best?.value ?? '—'}
            </p>
            {best && <p className="text-[10px] text-muted-foreground mt-0.5">{best.date}</p>}
          </CardContent>
        </Card>

        <Card className={`border-cat-5-tint/[0.25] bg-cat-5-tint/[0.15] ${!worst ? 'opacity-40' : ''}`}>
          <CardContent className="pt-1.5 pb-1.5 px-3">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-rose-500" />
              <p className="text-[11px] text-cat-5-ink font-medium">
                Peor · {worst?.metric ?? '—'}
              </p>
            </div>
            <p className="text-lg font-bold text-cat-5-ink leading-none tabular-nums">
              {worst?.value ?? '—'}
            </p>
            {worst && <p className="text-[10px] text-muted-foreground mt-0.5">{worst.date}</p>}
          </CardContent>
        </Card>
      </div>

      {/* ── Fila 3: Distribución de turnos —
          Chonchi (clasificadora) → Día / Noche.
          Yal y otras no-clasificadoras → T1 / T2 / T3 (nomenclatura real
          de Shoplogix, sin inventar Día/Noche). */}
      <Card>
        <CardContent className="py-1.5 px-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide text-center mb-1">Turnos</p>
          {isClassificationPlant || !useNumberedShiftGrid ? (
            <div className="flex justify-around text-center">
              <div>
                <p className="text-xl font-bold leading-none tabular-nums">{dayShifts}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Sun className="w-3 h-3 text-amber-500" /> Día
                </p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-xl font-bold leading-none tabular-nums">{nightShifts}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Moon className="w-3 h-3 text-indigo-400" /> Noche
                </p>
              </div>
            </div>
          ) : (
            <div className="flex justify-around text-center">
              <div>
                <p className="text-xl font-bold leading-none tabular-nums">{t1Shifts}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Sunrise className="w-3 h-3 text-amber-400" /> T1
                </p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-xl font-bold leading-none tabular-nums">{t2Shifts}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Sunset className="w-3 h-3 text-orange-400" /> T2
                </p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-xl font-bold leading-none tabular-nums">{t3Shifts}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center justify-center gap-1">
                  <Moon className="w-3 h-3 text-indigo-400" /> T3
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Fila 3.5: Producción fuera de turno configurado ──
          Visibilidad de horas extra productivas: la planta a veces entra
          antes del horario oficial (decisión operacional del día) y esa
          producción se registra en Shoplogix igual, solo sin turno asignado
          ("Unscheduled"). No es un turno (no compite en Mejor/Peor/promedio,
          ver slxMonthlyStats), pero tampoco se esconde — y es la munición
          concreta para pedirle a planta que configure ese turno si el bloque
          se repite seguido. Se oculta si el mes no tuvo nada fuera de turno. */}
      {slxStats && slxStats.unscheduled.cycles > 0 && (
        <Card className="border-muted-foreground/[0.10] bg-muted-foreground/[0.10]">
          <CardContent className="py-1.5 px-4">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Fuera de turno configurado
              </p>
            </div>
            <div className="flex justify-around text-center">
              <div>
                <p className="text-lg font-bold leading-none tabular-nums text-foreground">
                  {slxStats.unscheduled.cycles >= 1000
                    ? `${(slxStats.unscheduled.cycles / 1000).toFixed(1)}k`
                    : slxStats.unscheduled.cycles.toLocaleString('es-CL')}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">ciclos</p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-lg font-bold leading-none tabular-nums text-foreground">
                  {fmtSecPanoramic(slxStats.unscheduled.uptimeSec)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">horas-máquina</p>
              </div>
              <div className="w-px bg-border" />
              <div>
                <p className="text-lg font-bold leading-none tabular-nums text-foreground">
                  {slxStats.unscheduled.daysWithData}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  día{slxStats.unscheduled.daysWithData === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Fila 3.6: Cobertura de imputación del período ──
          Cuánto del tiempo detenido llegó con causal anotada, y si eso está
          mejorando turno a turno. Es el número que la capacitación de
          imputación tiene que mover; sin causal, el tiempo perdido no se le
          puede atribuir a nadie. Se oculta si el período no trae agregados. */}
      {slxStats?.imputacion && (
        <ImputacionPeriodCard imputacion={slxStats.imputacion} />
      )}

      {/* ── Fila 4: Desglose causas P0 (solo si hay Grader) ── */}
      {stats && stats.causas.length > 0 && (
        <Card>
          <CardContent className="py-2 px-3 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Causas P0 del mes
              </p>
              <p className="text-[10px] text-muted-foreground/60 ml-auto tabular-nums">
                {stats.causas.reduce((s, c) => s + c.pieces, 0).toLocaleString('es-CL')} pz P0
              </p>
            </div>
            {stats.causas.map(({ error, pieces, pct, barPct }) => (
              <div key={error} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-medium leading-tight truncate min-w-0">
                    {getCauseLabel(error)}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                    {pieces.toLocaleString('es-CL')} pz · <span className="font-semibold text-foreground">{pct.toFixed(2)}%</span>
                  </span>
                </div>
                <div className="h-1 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500/[0.15] transition-all"
                    style={{ width: `${barPct.toFixed(1)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

    </div>
  )
}
