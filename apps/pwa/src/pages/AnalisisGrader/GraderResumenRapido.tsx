/**
 * Resumen ejecutivo del turno Grader.
 *
 * Vista compacta que aparece automáticamente al cargar un Excel.
 * Diseñada para lectura en < 30 segundos: P0%, KPIs clave,
 * top problemas y acciones concretas — sin necesidad de abrir tabs.
 *
 * También incluye el widget de velocidad de cinta para ajuste rápido.
 */

import { useState } from 'react'
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Gauge } from 'lucide-react'
import { Badge, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { DEFAULT_PHYSICAL_CONFIG } from '@/services/grader/graderAnalytics'
import { DEFAULT_P0_ALERT_PCT, DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import type { GraderAnalyticsResult, DeterministicInsight } from '@/services/grader/types'

const BELT_SHORT_NAMES: Record<string, string> = {
  zeta: 'Z-Belt',
  accel1: 'Accel 1',
  accel2: 'Accel 2',
  main: 'Sorting',
}

const BELT_SPEED_RANGES: Record<string, { min: number; max: number }> = {
  zeta:   { min: 0.1, max: 0.8 },
  accel1: { min: 0.5, max: 1.5 },
  accel2: { min: 0.5, max: 1.5 },
  main:   { min: 0.5, max: 1.4 },
}

interface Props {
  analytics: GraderAnalyticsResult
  insights: DeterministicInsight[]
  /** Velocidades actuales de las 4 cintas en m/s (editables inline) */
  effectiveSpeeds: Record<string, number>
  onChangeEffectiveSpeeds: (beltId: string, mps: number) => void
  /** Callback para hacer scroll al dashboard completo */
  onScrollToDashboard: () => void
}

export function GraderResumenRapido({
  analytics,
  insights,
  effectiveSpeeds,
  onChangeEffectiveSpeeds,
  onScrollToDashboard,
}: Props) {
  const [beltSpeedsOpen, setBeltSpeedsOpen] = useState(true)
  const { kpis, config } = analytics
  const belts = analytics.config.physicalConfig?.belts ?? DEFAULT_PHYSICAL_CONFIG.belts
  const p0Pct = kpis.pointZeroPct
  const warnTh = config.errorThresholds?.pointZeroPctWarn ?? DEFAULT_P0_ALERT_PCT
  const critTh = config.errorThresholds?.pointZeroPctCritical ?? DEFAULT_P0_CRITICAL_PCT

  const p0Status: 'ok' | 'warn' | 'critical' =
    p0Pct >= critTh ? 'critical' : p0Pct >= warnTh ? 'warn' : 'ok'

  const criticals = insights.filter((i) => i.severity === 'critical')
  const warns = insights.filter((i) => i.severity === 'warn')

  // Top 3 insights para mostrar en el resumen (críticos primero)
  const topInsights = [...criticals, ...warns].slice(0, 3)

  // Top 3 acciones: primera recomendación de cada insight top
  const topActions = topInsights
    .filter((i) => i.recommendations.length > 0)
    .map((i) => ({ severity: i.severity, action: i.recommendations[0] }))

  // Colores según estado P0
  const borderColor =
    p0Status === 'critical' ? 'border-red-500/[0.25]' :
    p0Status === 'warn'     ? 'border-amber-500/[0.25]' :
                              'border-emerald-500/[0.25]'
  const bgColor =
    p0Status === 'critical' ? 'bg-red-500/[0.08]' :
    p0Status === 'warn'     ? 'bg-amber-500/[0.08]' :
                              'bg-emerald-500/[0.08]'
  const p0Color =
    p0Status === 'critical' ? 'text-red-500' :
    p0Status === 'warn'     ? 'text-amber-500' :
                              'text-emerald-500'

  // Calibre dominante para mostrar contexto rápido
  const dominant = kpis.dominantCalibre

  return (
    <div className={cn('rounded-card border px-4 py-4 space-y-4', borderColor, bgColor)}>

      {/* ─── Encabezado ─── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {p0Status === 'ok'
            ? <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            : <AlertTriangle className={cn('h-4 w-4 shrink-0', p0Color)} />
          }
          <span className="text-sm font-semibold">Resumen del turno</span>
          {criticals.length > 0 && (
            <Badge className="bg-red-500/[0.08] text-red-600 border-red-500/[0.25] text-xs font-medium">
              {criticals.length} crítico{criticals.length > 1 ? 's' : ''}
            </Badge>
          )}
          {warns.length > 0 && (
            <Badge className="bg-amber-500/[0.08] text-amber-600 border-amber-500/[0.25] text-xs font-medium">
              {warns.length} alerta{warns.length > 1 ? 's' : ''}
            </Badge>
          )}
          {p0Status === 'ok' && insights.length === 0 && (
            <Badge className="bg-emerald-500/[0.08] text-emerald-600 border-emerald-500/[0.25] text-xs">
              Todo en orden
            </Badge>
          )}
        </div>
        <button
          type="button"
          onClick={onScrollToDashboard}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          Ver análisis completo
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {/* ─── KPIs en fila ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* P0% — el más importante, grande */}
        <div className="text-center py-1">
          <p className={cn('text-4xl font-bold tabular-nums leading-none', p0Color)}>
            {p0Pct}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">Punto Cero</p>
          <p className="text-xs text-muted-foreground/70">
            umbral {warnTh}% / {critTh}%
          </p>
        </div>

        <div className="text-center py-1">
          <p className="text-2xl font-semibold tabular-nums text-foreground leading-none">
            {kpis.totalPieces.toLocaleString('es-CL')}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Piezas</p>
          {kpis.pointZeroPieces > 0 && (
            <p className="text-xs text-muted-foreground/70">
              {kpis.pointZeroPieces.toLocaleString('es-CL')} en P0
            </p>
          )}
        </div>

        {kpis.totalWeightKg != null ? (
          <div className="text-center py-1">
            <p className="text-2xl font-semibold tabular-nums text-foreground leading-none">
              {kpis.totalWeightKg >= 1000
                ? `${(kpis.totalWeightKg / 1000).toFixed(1)} t`
                : `${kpis.totalWeightKg.toFixed(0)} kg`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Peso clasificado</p>
            {kpis.avgWeightGrams != null && (
              <p className="text-xs text-muted-foreground/70">
                ~{kpis.avgWeightGrams.toFixed(0)} g/pz
              </p>
            )}
          </div>
        ) : null}

        {kpis.productionRatePerHour != null ? (
          <div className="text-center py-1">
            <p className="text-2xl font-semibold tabular-nums text-foreground leading-none">
              {Math.round(kpis.productionRatePerHour).toLocaleString('es-CL')}
            </p>
            <p className="text-xs text-muted-foreground mt-1">pz / hora</p>
            {dominant && (
              <p className="text-xs text-muted-foreground/70">
                {dominant.calibre} {dominant.pct}%
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* ─── Causas P0 en chips ─── */}
      {kpis.topPointZeroErrors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-muted-foreground self-center">Causas P0:</span>
          {kpis.topPointZeroErrors.slice(0, 4).map((e, i) => (
            <span
              key={i}
              className="text-xs bg-background border rounded-full px-2.5 py-0.5 text-muted-foreground"
            >
              {e.error}{' '}
              <span className="font-semibold text-foreground">{e.pct}%</span>
            </span>
          ))}
        </div>
      )}

      {/* ─── Velocidades de cintas ─── */}
      <div className="bg-background border border-border rounded-ctl overflow-hidden">
        <button
          type="button"
          onClick={() => setBeltSpeedsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/30 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium">Velocidades cintas (m/s)</span>
            <span className="text-xs text-muted-foreground/60 hidden sm:inline">
              — leer pantalla Z2 "Velocidad cintas" al inicio del turno
            </span>
          </span>
          {beltSpeedsOpen
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>
        {beltSpeedsOpen && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border-t border-border/40 bg-border/20">
            {belts.map((belt) => {
              const range = BELT_SPEED_RANGES[belt.beltId] ?? { min: 0.1, max: 2.0 }
              const currentMps = effectiveSpeeds[belt.beltId] ?? belt.speedMps
              return (
                <div key={belt.beltId} className="bg-background/80 px-3 py-2 space-y-1">
                  <p className="text-xs font-medium text-foreground truncate">
                    {BELT_SHORT_NAMES[belt.beltId] ?? belt.beltId}
                  </p>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      min={range.min}
                      max={range.max}
                      value={currentMps}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v) && v >= range.min && v <= range.max) {
                          onChangeEffectiveSpeeds(belt.beltId, v)
                        }
                      }}
                      className="h-7 w-16 text-xs font-mono text-center"
                    />
                    <span className="text-xs text-muted-foreground">m/s</span>
                  </div>
                  {belt.z2Units != null && (
                    <p className="text-xs text-muted-foreground/60">Z2: {belt.z2Units}u</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ─── Top problemas + acciones ─── */}
      {topInsights.length > 0 ? (
        <div className="space-y-2 border-t border-border/30 pt-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Problemas detectados
          </p>
          {topInsights.map((insight) => (
            <div
              key={insight.id}
              className={cn(
                'flex items-start gap-2 rounded-ctl px-3 py-2',
                insight.severity === 'critical'
                  ? 'bg-red-500/[0.08] border border-red-500/[0.25]'
                  : 'bg-amber-500/[0.08] border border-amber-500/[0.25]',
              )}
            >
              <AlertTriangle
                className={cn(
                  'h-3.5 w-3.5 shrink-0 mt-0.5',
                  insight.severity === 'critical' ? 'text-red-500' : 'text-amber-500',
                )}
              />
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-xs font-semibold',
                  insight.severity === 'critical'
                    ? 'text-red-600'
                    : 'text-amber-600',
                )}>
                  {insight.title}
                </p>
                {insight.evidence[0] && (
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.evidence[0]}</p>
                )}
              </div>
            </div>
          ))}

          {/* Acciones numeradas */}
          {topActions.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Acciones prioritarias
              </p>
              {topActions.map((a, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className={cn(
                      'shrink-0 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center mt-0.5',
                      a.severity === 'critical'
                        ? 'bg-red-500/[0.08] text-red-600'
                        : 'bg-amber-500/[0.08] text-amber-600',
                    )}
                  >
                    {i + 1}
                  </span>
                  <p className="text-xs text-foreground leading-snug">{a.action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-emerald-600 font-medium text-center py-1">
          Sin alertas activas — operación dentro de parámetros normales.
        </p>
      )}
    </div>
  )
}
