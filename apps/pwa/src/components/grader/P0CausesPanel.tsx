import { useState } from 'react'
import { ChevronDown, Scale, EyeOff, Clock, HelpCircle, SlidersHorizontal } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import { MATRIX_P0_CAUSES } from '@/services/grader/graderMatrixP0Causes'
import type { MatrixP0Cause } from '@/services/grader/types'
import type { PointZeroClassification } from '@/services/grader/types'
import type { LucideProps } from 'lucide-react'

type IconComponent = (props: Pick<LucideProps, 'className'>) => JSX.Element

const CAUSE_ICONS: Record<MatrixP0Cause, IconComponent> = {
  fuera_de_rangos: ({ className }) => <SlidersHorizontal className={className} />,
  fuera_de_limites: ({ className }) => <Scale className={className} />,
  no_leido_fotocelula: ({ className }) => <EyeOff className={className} />,
  puerta_no_preparada: ({ className }) => <Clock className={className} />,
  otro: ({ className }) => <HelpCircle className={className} />,
}

const FALLBACK_COLOR = { badge: 'bg-zinc-500/15 text-zinc-400', bar: 'bg-zinc-500' }
const COLOR_CLASSES: Record<string, { badge: string; bar: string }> = {
  red:    { badge: 'bg-red-500/15 text-red-400',       bar: 'bg-red-500'    },
  orange: { badge: 'bg-orange-500/15 text-orange-400', bar: 'bg-orange-500' },
  amber:  { badge: 'bg-amber-500/15 text-amber-400',   bar: 'bg-amber-500'  },
  blue:   { badge: 'bg-blue-500/15 text-blue-400',     bar: 'bg-blue-500'   },
  zinc:   FALLBACK_COLOR,
}

const SUB_CAUSE_LABELS: Record<string, string> = {
  fuera_de_rango:      'Fuera de rango de calibres',
  fuera_de_limites:    'Fuera de límites dimensionales',
  no_leido_fotocelula: 'No leído por fotocélula',
  too_close_too_long:  'Too close / Too long',
  puerta_no_preparada: 'Puerta no preparada',
  otro:                'Otro / Desconocido',
}

interface P0CausesPanelProps {
  byMatrixCause: PointZeroClassification['byMatrixCause'] | null
  totalP0Pct: number
  onClickCause?: (cause: MatrixP0Cause) => void
}

export function P0CausesPanel({ byMatrixCause, totalP0Pct, onClickCause }: P0CausesPanelProps) {
  const [expanded, setExpanded] = useState<MatrixP0Cause | null>(null)
  const hasCauseData = byMatrixCause != null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">¿Por qué hubo P0?</CardTitle>
        <CardDescription>
          {hasCauseData
            ? `${totalP0Pct.toFixed(1)}% de piezas rechazadas — cada causa suma al total`
            : `${totalP0Pct.toFixed(1)}% de piezas rechazadas — cargá el Excel P0 para ver las causas`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2">
        {!hasCauseData && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
            Sin el archivo <strong>Punto Cero</strong> exportado de Matrix no podemos mostrar las causas.
            Subilo junto al Excel de Pieza a Pieza para el análisis completo.
          </div>
        )}

        {hasCauseData && (Object.keys(MATRIX_P0_CAUSES) as MatrixP0Cause[]).map(cause => {
          const stats = byMatrixCause[cause]
          const def = MATRIX_P0_CAUSES[cause]
          const colors = COLOR_CLASSES[def.color] ?? FALLBACK_COLOR
          const Icon = CAUSE_ICONS[cause]
          const isExpanded = expanded === cause
          // % del total de piezas = % dentro del P0 × P0% / 100
          // Ej: P0=1.9% + fuera_limites=91.8% → 1.74% del total (lo que el operario entiende)
          const pctOfTotal = (stats.pct * totalP0Pct) / 100

          return (
            <div key={cause} className="border rounded-lg overflow-hidden">
              <button
                className="w-full p-3 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left"
                onClick={() => {
                  setExpanded(isExpanded ? null : cause)
                  onClickCause?.(cause)
                }}
              >
                <span className={cn('p-1.5 rounded-md', colors.badge)}>
                  <Icon className="w-4 h-4" />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{def.label}</div>
                  <div className="text-xs text-muted-foreground truncate">{def.description}</div>
                  {/* Barra = proporción dentro del P0 total (permite comparar causas) */}
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
                    <div
                      className={cn('h-full rounded-full transition-all', colors.bar)}
                      style={{ width: `${Math.min(100, stats.pct)}%` }}
                    />
                  </div>
                </div>

                {/* Primary: % del total | Secondary: % dentro del P0 + piezas */}
                <div className="text-right shrink-0 min-w-[68px]">
                  <div className="font-mono font-bold text-sm">
                    {pctOfTotal.toFixed(2)}%
                    <span className="text-[9px] font-normal text-muted-foreground/80 ml-0.5">total</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {stats.pct.toFixed(1)}% del P0
                  </div>
                  <div className="text-xs text-muted-foreground">{stats.pieces.toLocaleString('es-CL')} pzas</div>
                </div>

                <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', isExpanded && 'rotate-180')} />
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 bg-muted/20 border-t space-y-2">
                  <p className="text-xs text-muted-foreground pt-2 italic">{def.defaultActionHint}</p>
                  {stats.subCauses.length > 0 && (
                    <div className="space-y-1">
                      {stats.subCauses.map(sc => (
                        <div key={sc.cause} className="flex justify-between text-xs text-muted-foreground">
                          <span>└─ {SUB_CAUSE_LABELS[sc.cause] ?? sc.cause}</span>
                          <span className="font-mono">{sc.pct.toFixed(1)}% · {sc.pieces.toLocaleString('es-CL')} pzas</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
