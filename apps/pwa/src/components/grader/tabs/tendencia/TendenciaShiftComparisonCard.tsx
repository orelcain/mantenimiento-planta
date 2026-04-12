/**
 * Card "Comparativa con Turno Hermano" de la tab Tendencia.
 * Muestra delta de P0%, piezas, peso promedio y calibre dominante vs otra sesión.
 * Extraído de GraderTendenciaTab en el refactor iter 19 (P1.8).
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { ArrowRightLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GraderSession } from '@/services/grader/types'
import type { useGraderDashboardAnalytics } from '@/hooks/useGraderDashboardAnalytics'

type DashboardViews = ReturnType<typeof useGraderDashboardAnalytics>

interface Props {
  shiftComparisonView: DashboardViews['shiftComparisonView']
  siblingSessions: GraderSession[]
}

export function TendenciaShiftComparisonCard({ shiftComparisonView, siblingSessions }: Props) {
  if (!shiftComparisonView) return null

  const cmp = shiftComparisonView
  const p0Dir = cmp.delta.p0 > 0 ? 'up' : cmp.delta.p0 < 0 ? 'down' : 'flat'
  const weightDir = cmp.delta.avgWeightPct > 0 ? 'up' : cmp.delta.avgWeightPct < 0 ? 'down' : 'flat'
  // Para P0, subir es malo (rojo), bajar es bueno (verde)
  const p0Color = p0Dir === 'up' ? 'text-red-600 dark:text-red-400' : p0Dir === 'down' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
  const weightColor = weightDir === 'up' ? 'text-blue-600 dark:text-blue-400' : weightDir === 'down' ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
  const P0Icon = p0Dir === 'up' ? TrendingUp : p0Dir === 'down' ? TrendingDown : Minus
  const WeightIcon = weightDir === 'up' ? TrendingUp : weightDir === 'down' ? TrendingDown : Minus

  return (
    <Card className="border-sky-500/40 bg-sky-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-sky-500" />
          Comparativa con Turno Hermano
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {cmp.currentLabel} vs {cmp.siblingLabel} · {cmp.sessionDate ?? 'mismo día'}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* P0 */}
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Punto Cero</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xl font-bold tabular-nums">{cmp.current.p0.toFixed(2)}%</p>
              <P0Icon className={cn('h-4 w-4', p0Color)} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {cmp.siblingLabel}: {cmp.sibling.p0.toFixed(2)}%
            </p>
            <p className={cn('text-[10px] font-medium tabular-nums', p0Color)}>
              Δ {cmp.delta.p0 >= 0 ? '+' : ''}{cmp.delta.p0.toFixed(2)} pp
            </p>
          </div>
          {/* Piezas */}
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Piezas</p>
            <p className="text-xl font-bold tabular-nums">{cmp.current.pieces.toLocaleString('es-CL')}</p>
            <p className="text-[10px] text-muted-foreground">
              {cmp.siblingLabel}: {cmp.sibling.pieces.toLocaleString('es-CL')}
            </p>
            <p className="text-[10px] text-muted-foreground tabular-nums">
              Δ {cmp.delta.pieces >= 0 ? '+' : ''}{cmp.delta.pieces.toLocaleString('es-CL')}
            </p>
          </div>
          {/* Peso promedio */}
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Peso promedio</p>
            <div className="flex items-baseline gap-1.5">
              <p className="text-xl font-bold tabular-nums">{cmp.current.avgWeight.toFixed(0)} g</p>
              <WeightIcon className={cn('h-4 w-4', weightColor)} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {cmp.siblingLabel}: {cmp.sibling.avgWeight.toFixed(0)} g
            </p>
            <p className={cn('text-[10px] font-medium tabular-nums', weightColor)}>
              Δ {cmp.delta.avgWeight >= 0 ? '+' : ''}{cmp.delta.avgWeight.toFixed(0)} g ({cmp.delta.avgWeightPct >= 0 ? '+' : ''}{cmp.delta.avgWeightPct.toFixed(1)}%)
            </p>
          </div>
          {/* Calibre dominante */}
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-background/60 border">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Calibre dominante</p>
            <p className="text-xl font-bold tabular-nums">{cmp.current.calibre}</p>
            <p className="text-[10px] text-muted-foreground">
              {cmp.siblingLabel}: {cmp.sibling.calibre}
            </p>
            {cmp.current.calibre !== cmp.sibling.calibre && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Diferente</p>
            )}
          </div>
        </div>
        {siblingSessions.length > 1 && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Mostrando vs 1 de {siblingSessions.length} sesiones hermanas disponibles.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
