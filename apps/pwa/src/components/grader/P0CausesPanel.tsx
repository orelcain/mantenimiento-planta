/**
 * Panel "¿Por qué hubo P0?" con descomposición jerárquica.
 *
 * Vista unificada de 4 filas oficiales del HMI:
 *  1. Fuera de límites — PARAGUAS EXPANDIBLE (suma fuera_de_limites estricto
 *     + 5 sub-causas derivadas: calibre, calidad, conservación, producto, otro)
 *  2. No leído por fotocélula
 *  3. Too close / Too long
 *  4. Puerta no preparada
 *
 * Al expandir "Fuera de límites" muestra el desglose de las 6 causas que
 * suman al paraguas. Así el usuario ve coherencia matemática:
 * paraguas_pct === sum(sub_causas_pct).
 *
 * Cada causa tiene tooltip con metadata rica (translation, how detected,
 * action, example). Los % primary son del total de piezas (intuitivo).
 */

import { useState } from 'react'
import {
  ChevronDown, Scale, EyeOff, Clock, HelpCircle, SlidersHorizontal,
  Scan, Award, Snowflake, Target,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  MATRIX_P0_CAUSES,
  MATRIX_CAUSE_ORDER_OFFICIAL,
  MATRIX_CAUSE_ORDER_DERIVED,
} from '@/services/grader/graderMatrixP0Causes'
import { CauseTooltip } from './CauseTooltip'
import type { MatrixP0Cause, PointZeroClassification } from '@/services/grader/types'
import type { LucideProps } from 'lucide-react'

type IconComponent = (props: Pick<LucideProps, 'className'>) => JSX.Element

const CAUSE_ICONS: Record<MatrixP0Cause, IconComponent> = {
  fuera_de_limites: ({ className }) => <Scale className={className} />,
  no_leido_fotocelula: ({ className }) => <EyeOff className={className} />,
  too_close_too_long: ({ className }) => <Scan className={className} />,
  puerta_no_preparada: ({ className }) => <Clock className={className} />,
  fuera_de_calibre: ({ className }) => <SlidersHorizontal className={className} />,
  fuera_de_calidad: ({ className }) => <Award className={className} />,
  fuera_de_conservacion: ({ className }) => <Snowflake className={className} />,
  fuera_de_producto: ({ className }) => <Target className={className} />,
  otro: ({ className }) => <HelpCircle className={className} />,
}

const FALLBACK_COLOR = { badge: 'bg-zinc-500/15 text-zinc-400', bar: 'bg-zinc-500' }
const COLOR_CLASSES: Record<string, { badge: string; bar: string }> = {
  red:     { badge: 'bg-red-500/15 text-red-400',       bar: 'bg-red-500'   },
  orange:  { badge: 'bg-orange-500/15 text-orange-400', bar: 'bg-orange-500'},
  purple:  { badge: 'bg-purple-500/15 text-purple-400', bar: 'bg-purple-500'},
  cyan:    { badge: 'bg-cyan-500/15 text-cyan-400',     bar: 'bg-cyan-500'  },
  emerald: { badge: 'bg-emerald-500/15 text-emerald-400', bar: 'bg-emerald-500' },
  amber:   { badge: 'bg-amber-500/15 text-amber-400',   bar: 'bg-amber-500' },
  brown:   { badge: 'bg-amber-900/20 text-amber-700 dark:text-amber-300', bar: 'bg-amber-800' },
  blue:    { badge: 'bg-blue-500/15 text-blue-400',     bar: 'bg-blue-500'  },
  zinc:    FALLBACK_COLOR,
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
  /** Total "unsorted pcs" de Matrix (= totalP0Pieces) — footer informativo */
  unsortedPcs?: number
  onClickCause?: (cause: MatrixP0Cause) => void
  /** Causa activa actualmente resaltada (ej. filtrando el timeline). */
  selectedCause?: MatrixP0Cause | null
}

interface CauseRowProps {
  cause: MatrixP0Cause
  stats: PointZeroClassification['byMatrixCause'][MatrixP0Cause]
  totalP0Pct: number
  expanded: boolean
  onToggle: () => void
}

function CauseRow({ cause, stats, totalP0Pct, expanded, onToggle }: CauseRowProps) {
  const def = MATRIX_P0_CAUSES[cause]
  const colors = COLOR_CLASSES[def.color] ?? FALLBACK_COLOR
  const Icon = CAUSE_ICONS[cause]
  const pctOfTotal = (stats.pct * totalP0Pct) / 100
  const hasPieces = stats.pieces > 0

  return (
    <div className={cn('border rounded-lg overflow-hidden transition-opacity', !hasPieces && 'opacity-40')}>
      <div className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={onToggle}
          type="button"
        >
          <span className={cn('p-1.5 rounded-md', colors.badge)}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
              <span className="truncate">{def.label}</span>
            </div>
            <div className="text-xs text-muted-foreground truncate">{def.description}</div>
            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
              <div
                className={cn('h-full rounded-full transition-all', colors.bar)}
                style={{ width: `${Math.min(100, stats.pct)}%` }}
              />
            </div>
          </div>
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
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', expanded && 'rotate-180')} />
        </button>
        {/* Tooltip info (separado del toggle para no interferir con expand) */}
        <div className="shrink-0">
          <CauseTooltip meta={def} />
        </div>
      </div>
      {expanded && hasPieces && (
        <div className="px-3 pb-3 pt-1 bg-muted/20 border-t space-y-2">
          <p className="text-xs text-muted-foreground italic">{def.actionHint}</p>
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
}

/**
 * Paraguas expandible: suma propio + derivadas. Al expandir muestra cada
 * sub-causa (fuera_de_limites estricto + 5 derivadas) como mini-fila.
 */
interface UmbrellaCauseRowProps {
  umbrellaStats: PointZeroClassification['byMatrixCause'][MatrixP0Cause]
  selfStats: PointZeroClassification['byMatrixCause'][MatrixP0Cause]
  derivedStats: Array<{
    cause: MatrixP0Cause
    stats: PointZeroClassification['byMatrixCause'][MatrixP0Cause]
  }>
  totalP0Pct: number
  expanded: boolean
  onToggle: () => void
}

function UmbrellaCauseRow({
  umbrellaStats, selfStats, derivedStats, totalP0Pct, expanded, onToggle,
}: UmbrellaCauseRowProps) {
  const def = MATRIX_P0_CAUSES.fuera_de_limites
  const colors = COLOR_CLASSES[def.color] ?? FALLBACK_COLOR
  const Icon = CAUSE_ICONS.fuera_de_limites
  const pctOfTotal = (umbrellaStats.pct * totalP0Pct) / 100
  const hasPieces = umbrellaStats.pieces > 0

  return (
    <div className={cn('border rounded-lg overflow-hidden transition-opacity', !hasPieces && 'opacity-40')}>
      <div className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={onToggle}
          type="button"
        >
          <span className={cn('p-1.5 rounded-md', colors.badge)}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
              <span className="truncate">{def.label}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted font-mono text-muted-foreground shrink-0">
                paraguas · 6 sub
              </span>
            </div>
            <div className="text-xs text-muted-foreground truncate">{def.description}</div>
            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
              <div
                className={cn('h-full rounded-full transition-all', colors.bar)}
                style={{ width: `${Math.min(100, umbrellaStats.pct)}%` }}
              />
            </div>
          </div>
          <div className="text-right shrink-0 min-w-[68px]">
            <div className="font-mono font-bold text-sm">
              {pctOfTotal.toFixed(2)}%
              <span className="text-[9px] font-normal text-muted-foreground/80 ml-0.5">total</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {umbrellaStats.pct.toFixed(1)}% del P0
            </div>
            <div className="text-xs text-muted-foreground">{umbrellaStats.pieces.toLocaleString('es-CL')} pzas</div>
          </div>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform shrink-0', expanded && 'rotate-180')} />
        </button>
        <div className="shrink-0">
          <CauseTooltip meta={def} />
        </div>
      </div>
      {expanded && hasPieces && (
        <div className="px-3 pb-3 pt-1 bg-muted/20 border-t space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Desglose — análisis nuestro con config gates
          </p>
          <div className="space-y-1">
            {/* Primera sub-fila: fuera_de_limites estricto (el propio) */}
            <SubCauseRow cause="fuera_de_limites" stats={selfStats} totalP0Pct={totalP0Pct} isStrict />
            {/* Resto: las 5 derivadas */}
            {derivedStats.map(({ cause, stats }) => (
              <SubCauseRow key={cause} cause={cause} stats={stats} totalP0Pct={totalP0Pct} />
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/40">
            El paraguas suma exactamente la suma del desglose.
            Si una causa no se identifica, cae en "Otro".
          </p>
        </div>
      )}
    </div>
  )
}

/** Sub-fila compacta para el desglose del paraguas */
function SubCauseRow({
  cause, stats, totalP0Pct, isStrict = false,
}: {
  cause: MatrixP0Cause
  stats: PointZeroClassification['byMatrixCause'][MatrixP0Cause]
  totalP0Pct: number
  isStrict?: boolean
}) {
  const def = MATRIX_P0_CAUSES[cause]
  const colors = COLOR_CLASSES[def.color] ?? FALLBACK_COLOR
  const Icon = CAUSE_ICONS[cause]
  const hasPieces = stats.pieces > 0
  const pctOfTotal = (stats.pct * totalP0Pct) / 100

  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-opacity',
      hasPieces ? 'bg-background/50' : 'opacity-40',
    )}>
      <span className={cn('p-1 rounded', colors.badge)}>
        <Icon className="w-3 h-3" />
      </span>
      <span className="flex-1 min-w-0 truncate">
        {isStrict ? `${def.label} (estricto)` : def.label}
      </span>
      <div className="text-right shrink-0 font-mono tabular-nums">
        <span className="font-semibold">{pctOfTotal.toFixed(2)}%</span>
        <span className="text-[9px] font-normal text-muted-foreground/80 ml-0.5">total</span>
        <span className="text-muted-foreground ml-2">({stats.pct.toFixed(1)}% del P0)</span>
        <span className="text-muted-foreground ml-2">{stats.pieces.toLocaleString('es-CL')} pzas</span>
      </div>
    </div>
  )
}

export function P0CausesPanel({ byMatrixCause, totalP0Pct, unsortedPcs, onClickCause, selectedCause }: P0CausesPanelProps) {
  const [expanded, setExpanded] = useState<MatrixP0Cause | null>(null)
  const hasCauseData = byMatrixCause != null

  const toggle = (cause: MatrixP0Cause) => {
    setExpanded(expanded === cause ? null : cause)
    onClickCause?.(cause)
  }

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

      <CardContent className="space-y-4">
        {!hasCauseData && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">
            Sin el archivo <strong>Punto Cero</strong> exportado de Matrix no podemos mostrar las causas.
            Subilo junto al Excel de Pieza a Pieza para el análisis completo.
          </div>
        )}

        {hasCauseData && (
          <>
            {/* ─── Vista Matrix oficial — 4 filas, paraguas expandible ─ */}
            <section>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <span>Vista Matrix oficial</span>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-normal normal-case tracking-normal">como aparece en el HMI</span>
              </h3>
              <div className="space-y-2">
                {MATRIX_CAUSE_ORDER_OFFICIAL.map(cause => {
                  // "fuera_de_limites" es paraguas: suma propio + 5 derivadas
                  if (cause === 'fuera_de_limites') {
                    const selfStats = byMatrixCause[cause]
                    const derivedStats = MATRIX_CAUSE_ORDER_DERIVED.map(c => ({
                      cause: c,
                      stats: byMatrixCause[c],
                    }))
                    const umbrellaPieces = selfStats.pieces
                      + derivedStats.reduce((s, d) => s + d.stats.pieces, 0)
                    const umbrellaPct = selfStats.pct
                      + derivedStats.reduce((s, d) => s + d.stats.pct, 0)
                    const umbrellaStats = {
                      ...selfStats,
                      pieces: umbrellaPieces,
                      pct: umbrellaPct,
                    }
                    return (
                      <UmbrellaCauseRow
                        key={cause}
                        umbrellaStats={umbrellaStats}
                        selfStats={selfStats}
                        derivedStats={derivedStats}
                        totalP0Pct={totalP0Pct}
                        expanded={expanded === cause}
                        onToggle={() => toggle(cause)}
                      />
                    )
                  }
                  return (
                    <CauseRow
                      key={cause}
                      cause={cause}
                      stats={byMatrixCause[cause]}
                      totalP0Pct={totalP0Pct}
                      expanded={expanded === cause}
                      onToggle={() => toggle(cause)}
                    />
                  )
                })}
              </div>
            </section>

            {/* ─── Footer: total unsorted pcs ──────────────────────────── */}
            {typeof unsortedPcs === 'number' && unsortedPcs > 0 && (
              <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                Total <span className="font-mono text-muted-foreground/80">unsorted pcs</span> (Matrix):{' '}
                <span className="font-mono font-medium text-foreground/80">{unsortedPcs.toLocaleString('es-CL')}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
