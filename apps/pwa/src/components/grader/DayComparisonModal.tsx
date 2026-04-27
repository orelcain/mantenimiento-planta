/**
 * M12 — Modal "Comparación Día vs Noche"
 *
 * Vista split con KPIs side-by-side para comparar el turno de día y el de noche
 * del mismo día calendario. Responde a "¿por qué noche siempre peor?".
 *
 * Renderizado: Dialog liviano — solo usa los GraderDailySummary ya cargados en
 * el calendario (sin fetch adicional). Se abre cuando el panel lateral tiene los
 * dos turnos disponibles.
 *
 * M12 — Sprint 10 backlog (2026-04-22).
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui'
import { Sun, Moon, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCauseLabel } from '@/services/grader/graderMatrixP0Causes'
import type { GraderDailySummary } from '@/services/grader/types'
import { p0StatusFromPct, p0StatusColor } from '@/services/grader/graderP0Thresholds'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60)
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`
  return `${m}m`
}

function fmtDuration(mins?: number): string {
  if (mins == null || mins <= 0) return '—'
  if (mins > 1440) return '? (anómalo)'
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function fmtWeight(kg?: number): string {
  if (kg == null) return '—'
  return kg >= 1000 ? `${(kg / 1000).toFixed(1)} t` : `${kg.toFixed(0)} kg`
}

function fmtRate(hist: GraderDailySummary): string {
  const r = hist.productionRatePerHour
  if (r != null && r > 0) return r.toLocaleString('es-CL') + ' pz/h'
  // fallback: calcular desde totalPieces y durationMinutes
  const dur = hist.durationMinutes
  if (dur == null || dur <= 0) return '—'
  const deadMin = hist.totalDeadTimeSec ? Math.round(hist.totalDeadTimeSec / 60) : 0
  const effectiveMin = Math.max(1, dur - deadMin)
  return Math.round(((hist.totalPieces - hist.pointZeroPieces) / effectiveMin) * 60).toLocaleString('es-CL') + ' pz/h'
}

/** Trend arrow — "lower is better" for P0%, dead time; "higher is better" for throughput */
type Trend = 'better' | 'worse' | 'neutral'

function trend(
  dayVal: number | undefined,
  nightVal: number | undefined,
  lowerIsBetter = true,
): { day: Trend; night: Trend } {
  if (dayVal == null || nightVal == null || dayVal === nightVal) {
    return { day: 'neutral', night: 'neutral' }
  }
  const dayBetter = lowerIsBetter ? dayVal < nightVal : dayVal > nightVal
  return {
    day:   dayBetter ? 'better' : 'worse',
    night: dayBetter ? 'worse'  : 'better',
  }
}

function TrendIcon({ t }: { t: Trend }) {
  if (t === 'better') return <TrendingUp className="h-3 w-3 text-emerald-500 inline-block ml-0.5" />
  if (t === 'worse')  return <TrendingDown className="h-3 w-3 text-red-400 inline-block ml-0.5" />
  return <Minus className="h-3 w-3 text-muted-foreground/50 inline-block ml-0.5" />
}

// ── KPI Row ───────────────────────────────────────────────────────────────────

interface KpiRowProps {
  label: string
  dayValue: React.ReactNode
  nightValue: React.ReactNode
  dayTrend?: Trend
  nightTrend?: Trend
  className?: string
}

function KpiRow({ label, dayValue, nightValue, dayTrend, nightTrend, className }: KpiRowProps) {
  return (
    <div className={cn('grid grid-cols-[1fr_auto_1fr] gap-2 items-start py-2 border-b border-border/40 last:border-0', className)}>
      {/* Day value */}
      <div className="text-right text-sm">
        {dayValue}
        {dayTrend && <TrendIcon t={dayTrend} />}
      </div>
      {/* Label center */}
      <div className="text-center text-[10px] text-muted-foreground whitespace-nowrap px-2 pt-0.5">
        {label}
      </div>
      {/* Night value */}
      <div className="text-left text-sm">
        {nightValue}
        {nightTrend && <TrendIcon t={nightTrend} />}
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DayComparisonModalProps {
  open: boolean
  onClose: () => void
  /** Los dos turnos del día (el componente identifica cuál es día/noche por shiftId) */
  summaries: [GraderDailySummary, GraderDailySummary]
  dateKey: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DayComparisonModal({ open, onClose, summaries, dateKey }: DayComparisonModalProps) {
  // Identificar cuál es día y cuál es noche
  const findShift = (id: string) => summaries.find((s) => s.shiftId === id) ?? summaries[0]
  const dia   = findShift('Turno día')
  const noche = findShift('Turno noche')

  // Trends
  const p0Trend   = trend(dia.pointZeroPct, noche.pointZeroPct, true)
  const rateTrend = trend(dia.productionRatePerHour, noche.productionRatePerHour, false)
  const deadTrend = trend(dia.totalDeadTimeSec, noche.totalDeadTimeSec, true)
  const wgtTrend  = trend(dia.totalWeightKg, noche.totalWeightKg, false)
  const pzTrend   = trend(
    dia.totalPieces - dia.pointZeroPieces,
    noche.totalPieces - noche.pointZeroPieces,
    false,
  )

  // Merge top causes (union of both shifts)
  const allCauses = new Set<string>()
  ;[...(dia.topP0Causes ?? []), ...(noche.topP0Causes ?? [])].forEach((c) => allCauses.add(c.error))

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg w-full">
        <DialogHeader>
          <DialogTitle className="text-base">
            Comparación D ↔ N — {dateKey}
          </DialogTitle>
        </DialogHeader>

        {/* Shift headers */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 mb-1">
          <div className="text-right">
            <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/40 bg-amber-500/10">
              <Sun className="h-3 w-3" /> {dia.shiftId}
            </Badge>
          </div>
          <div className="w-12" /> {/* spacer */}
          <div className="text-left">
            <Badge variant="outline" className="gap-1 text-indigo-400 border-indigo-500/40 bg-indigo-500/10">
              <Moon className="h-3 w-3" /> {noche.shiftId}
            </Badge>
          </div>
        </div>

        {/* ── KPI grid ── */}
        <div>
          {/* P0% — principal */}
          <KpiRow
            label="P0%"
            dayTrend={p0Trend.day}
            nightTrend={p0Trend.night}
            dayValue={
              <span className={cn('text-xl font-bold tabular-nums', p0StatusColor(p0StatusFromPct(dia.pointZeroPct)))}>
                {dia.pointZeroPct}%
              </span>
            }
            nightValue={
              <span className={cn('text-xl font-bold tabular-nums', p0StatusColor(p0StatusFromPct(noche.pointZeroPct)))}>
                {noche.pointZeroPct}%
              </span>
            }
          />

          {/* Piezas clasificadas */}
          <KpiRow
            label="Piezas class."
            dayTrend={pzTrend.day}
            nightTrend={pzTrend.night}
            dayValue={
              <span className="font-semibold tabular-nums">
                {(dia.totalPieces - dia.pointZeroPieces).toLocaleString('es-CL')}
              </span>
            }
            nightValue={
              <span className="font-semibold tabular-nums">
                {(noche.totalPieces - noche.pointZeroPieces).toLocaleString('es-CL')}
              </span>
            }
          />

          {/* Piezas P0 */}
          <KpiRow
            label="Piezas P0"
            dayValue={
              <span className="font-medium tabular-nums text-muted-foreground">
                {dia.pointZeroPieces.toLocaleString('es-CL')}
              </span>
            }
            nightValue={
              <span className="font-medium tabular-nums text-muted-foreground">
                {noche.pointZeroPieces.toLocaleString('es-CL')}
              </span>
            }
          />

          {/* Throughput */}
          <KpiRow
            label="Throughput"
            dayTrend={rateTrend.day}
            nightTrend={rateTrend.night}
            dayValue={<span className="font-semibold tabular-nums text-xs">{fmtRate(dia)}</span>}
            nightValue={<span className="font-semibold tabular-nums text-xs">{fmtRate(noche)}</span>}
          />

          {/* Duración turno */}
          <KpiRow
            label="Duración"
            dayValue={<span className="text-xs tabular-nums">{fmtDuration(dia.durationMinutes)}</span>}
            nightValue={<span className="text-xs tabular-nums">{fmtDuration(noche.durationMinutes)}</span>}
          />

          {/* Tiempo muerto */}
          {(dia.totalDeadTimeSec != null || noche.totalDeadTimeSec != null) && (
            <KpiRow
              label="Tiempo muerto"
              dayTrend={deadTrend.day}
              nightTrend={deadTrend.night}
              dayValue={
                <div className="text-xs">
                  <span className="font-semibold">{dia.totalDeadTimeSec != null ? fmtMin(dia.totalDeadTimeSec) : '—'}</span>
                  {dia.pausesCount != null && dia.pausesCount > 0 && (
                    <span className="text-muted-foreground ml-1">({dia.pausesCount} pausa{dia.pausesCount !== 1 ? 's' : ''})</span>
                  )}
                </div>
              }
              nightValue={
                <div className="text-xs">
                  <span className="font-semibold">{noche.totalDeadTimeSec != null ? fmtMin(noche.totalDeadTimeSec) : '—'}</span>
                  {noche.pausesCount != null && noche.pausesCount > 0 && (
                    <span className="text-muted-foreground ml-1">({noche.pausesCount} pausa{noche.pausesCount !== 1 ? 's' : ''})</span>
                  )}
                </div>
              }
            />
          )}

          {/* Peso total */}
          {(dia.totalWeightKg != null || noche.totalWeightKg != null) && (
            <KpiRow
              label="Peso total"
              dayTrend={wgtTrend.day}
              nightTrend={wgtTrend.night}
              dayValue={<span className="text-xs font-semibold">{fmtWeight(dia.totalWeightKg)}</span>}
              nightValue={<span className="text-xs font-semibold">{fmtWeight(noche.totalWeightKg)}</span>}
            />
          )}

          {/* Peso promedio */}
          {(dia.avgWeightGrams != null || noche.avgWeightGrams != null) && (
            <KpiRow
              label="Peso promedio"
              dayValue={
                <span className="text-xs text-muted-foreground">
                  {dia.avgWeightGrams != null ? `${dia.avgWeightGrams.toFixed(0)} g` : '—'}
                </span>
              }
              nightValue={
                <span className="text-xs text-muted-foreground">
                  {noche.avgWeightGrams != null ? `${noche.avgWeightGrams.toFixed(0)} g` : '—'}
                </span>
              }
            />
          )}

          {/* Calibre dominante */}
          {(dia.calibreDistribution?.length || noche.calibreDistribution?.length) ? (
            <KpiRow
              label="Calibre dom."
              dayValue={
                <span className="text-xs font-medium">
                  {dia.calibreDistribution?.[0]
                    ? `${dia.calibreDistribution[0].calibre} (${dia.calibreDistribution[0].pct.toFixed(0)}%)`
                    : '—'}
                </span>
              }
              nightValue={
                <span className="text-xs font-medium">
                  {noche.calibreDistribution?.[0]
                    ? `${noche.calibreDistribution[0].calibre} (${noche.calibreDistribution[0].pct.toFixed(0)}%)`
                    : '—'}
                </span>
              }
            />
          ) : null}

          {/* Calidad dominante */}
          {(dia.qualityDistribution?.length || noche.qualityDistribution?.length) ? (
            <KpiRow
              label="Calidad dom."
              dayValue={
                <span className="text-xs font-medium">
                  {dia.qualityDistribution?.[0]
                    ? `${dia.qualityDistribution[0].quality} (${dia.qualityDistribution[0].pct.toFixed(0)}%)`
                    : '—'}
                </span>
              }
              nightValue={
                <span className="text-xs font-medium">
                  {noche.qualityDistribution?.[0]
                    ? `${noche.qualityDistribution[0].quality} (${noche.qualityDistribution[0].pct.toFixed(0)}%)`
                    : '—'}
                </span>
              }
            />
          ) : null}

          {/* Lotes procesados */}
          {(dia.lotsInShift != null || noche.lotsInShift != null) && (() => {
            const diaLots   = dia.lotsInShift?.length ?? 0
            const nocheLots = noche.lotsInShift?.length ?? 0
            const lotsTrend = trend(diaLots, nocheLots, false)
            return (
              <KpiRow
                label="Lotes"
                dayTrend={lotsTrend.day}
                nightTrend={lotsTrend.night}
                dayValue={<span className="text-xs font-semibold tabular-nums">{diaLots || '—'}</span>}
                nightValue={<span className="text-xs font-semibold tabular-nums">{nocheLots || '—'}</span>}
              />
            )
          })()}

          {/* Top causa P0 */}
          {(dia.topP0Causes?.length || noche.topP0Causes?.length) ? (() => {
            const diaTop   = dia.topP0Causes?.[0]
            const nocheTop = noche.topP0Causes?.[0]
            const fmtCause = (e: { error: string; pct: number } | undefined) => {
              if (!e) return <span className="text-muted-foreground/50">—</span>
              const label = getCauseLabel(e.error)
              return (
                <span className="text-[10px] font-medium leading-tight" title={label}>
                  {label.length > 16 ? label.slice(0, 15) + '…' : label}
                  <span className="text-muted-foreground ml-0.5">({e.pct.toFixed(0)}%)</span>
                </span>
              )
            }
            return (
              <KpiRow
                label="Top causa P0"
                dayValue={fmtCause(diaTop)}
                nightValue={fmtCause(nocheTop)}
              />
            )
          })() : null}
        </div>

        {/* ── Top causas P0 ── */}
        {allCauses.size > 0 && (
          <div className="pt-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Top causas P0
            </p>
            <div className="space-y-1.5">
              {Array.from(allCauses).map((errorStr) => {
                const diaEntry   = dia.topP0Causes?.find((c) => c.error === errorStr)
                const nocheEntry = noche.topP0Causes?.find((c) => c.error === errorStr)
                const label = getCauseLabel(errorStr)
                const diaPctTotal   = diaEntry   ? (diaEntry.pct   * dia.pointZeroPct)   / 100 : null
                const nochePctTotal = nocheEntry ? (nocheEntry.pct * noche.pointZeroPct) / 100 : null
                const causeP0Trend  = trend(diaPctTotal ?? undefined, nochePctTotal ?? undefined, true)
                return (
                  <div key={errorStr} className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center text-xs">
                    <div className="text-right tabular-nums">
                      {diaPctTotal != null ? (
                        <span className="font-medium">
                          {diaPctTotal.toFixed(2)}%
                          <TrendIcon t={causeP0Trend.day} />
                        </span>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </div>
                    <div className="text-center text-[10px] text-muted-foreground px-2 truncate max-w-[100px]" title={label}>
                      {label}
                    </div>
                    <div className="text-left tabular-nums">
                      {nochePctTotal != null ? (
                        <span className="font-medium">
                          {nochePctTotal.toFixed(2)}%
                          <TrendIcon t={causeP0Trend.night} />
                        </span>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Delta summary ── */}
        {(() => {
          const deltaP0 = (noche.pointZeroPct - dia.pointZeroPct).toFixed(2)
          const sign = noche.pointZeroPct > dia.pointZeroPct ? '+' : ''
          const color = noche.pointZeroPct > dia.pointZeroPct ? 'text-red-500' : 'text-emerald-600'
          return (
            <div className="rounded-lg bg-muted/50 p-2.5 text-center text-[11px] text-muted-foreground">
              Noche vs Día: P0{' '}
              <span className={cn('font-bold', color)}>{sign}{deltaP0}%</span>
              {noche.pointZeroPct > dia.pointZeroPct
                ? ' — la noche tiene más rechazos'
                : noche.pointZeroPct < dia.pointZeroPct
                  ? ' — la noche tiene menos rechazos'
                  : ' — igual P0% en ambos turnos'}
            </div>
          )
        })()}
      </DialogContent>
    </Dialog>
  )
}
