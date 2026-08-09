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

/** Hex de cada causa para el ring del checkbox (consistente con scatter del timeline). */
const CAUSE_HEX_BORDERS: Record<MatrixP0Cause, string> = {
  fuera_de_limites:     '#ef4444',
  no_leido_fotocelula:  '#f97316',
  too_close_too_long:   '#a855f7',
  puerta_no_preparada:  '#06b6d4',
  fuera_de_calibre:     '#6366f1',
  fuera_de_calidad:     '#10b981',
  fuera_de_conservacion:'#f59e0b',
  fuera_de_producto:    '#92400e',
  otro:                 '#71717a',
}

const FALLBACK_COLOR = { badge: 'bg-muted-foreground/[0.10] text-zinc-400', bar: 'bg-zinc-500' }
const COLOR_CLASSES: Record<string, { badge: string; bar: string }> = {
  red:     { badge: 'bg-red-500/[0.15] text-red-400',       bar: 'bg-red-500'   },
  orange:  { badge: 'bg-cat-4-tint/[0.15] text-orange-400', bar: 'bg-orange-500'},
  purple:  { badge: 'bg-cat-6-tint/[0.15] text-purple-400', bar: 'bg-purple-500'},
  cyan:    { badge: 'bg-cat-7-tint/[0.15] text-cyan-400',     bar: 'bg-cyan-500'  },
  emerald: { badge: 'bg-emerald-500/[0.15] text-emerald-400', bar: 'bg-emerald-500' },
  amber:   { badge: 'bg-amber-500/[0.15] text-amber-400',   bar: 'bg-amber-500' },
  brown:   { badge: 'bg-amber-500/[0.15] text-amber-600', bar: 'bg-amber-800' },
  blue:    { badge: 'bg-primary/[0.15] text-blue-400',     bar: 'bg-blue-500'  },
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
  /** Causas seleccionadas (multi-select para filtrar timeline). */
  selectedCauses?: Set<MatrixP0Cause>
  /** Toggle add/remove una causa del set seleccionado. */
  onToggleCause?: (cause: MatrixP0Cause) => void
  /**
   * Cuando true (Chonchi), el copy menciona Matrix HMI / unsorted pcs.
   * Cuando false (Yal), copy genérico — Yal no usa HMI Matrix de MS4/12 ni
   * exporta archivo Punto Cero separado: los rechazos vienen embebidos en
   * el mismo Excel PP con `gate=0`.
   */
  isClassificationPlant?: boolean
}

interface CauseRowProps {
  cause: MatrixP0Cause
  stats: PointZeroClassification['byMatrixCause'][MatrixP0Cause]
  totalP0Pct: number
  expanded: boolean
  selected: boolean
  onToggle: () => void
  onSelectChange: () => void
}

function CauseRow({ cause, stats, totalP0Pct, expanded, selected, onToggle, onSelectChange }: CauseRowProps) {
  const def = MATRIX_P0_CAUSES[cause]
  const colors = COLOR_CLASSES[def.color] ?? FALLBACK_COLOR
  const Icon = CAUSE_ICONS[cause]
  const pctOfTotal = (stats.pct * totalP0Pct) / 100
  const hasPieces = stats.pieces > 0

  return (
    <div
      className={cn(
        'border rounded-card overflow-hidden transition-all',
        !hasPieces && 'opacity-40',
        selected && 'ring-2 ring-offset-1 ring-offset-background',
      )}
      style={selected ? { '--tw-ring-color': CAUSE_HEX_BORDERS[cause] ?? '#ef4444' } as React.CSSProperties : undefined}
    >
      <div className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
        {hasPieces && (
          <input
            type="checkbox"
            className="shrink-0 w-3.5 h-3.5 cursor-pointer accent-primary"
            checked={selected}
            onChange={onSelectChange}
            onClick={e => e.stopPropagation()}
            aria-label={`Seleccionar ${def.label} para filtrar timeline`}
          />
        )}
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={onToggle}
          type="button"
        >
          <span className={cn('p-1.5 rounded-ctl', colors.badge)}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm flex items-center gap-1.5 min-w-0">
              <span className="break-words">{def.label}</span>
            </div>
            <div className="text-xs text-muted-foreground break-words line-clamp-2">{def.description}</div>
            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
              <div
                className={cn('h-full rounded-full transition-all', colors.bar)}
                style={{ width: stats.pct > 0 ? `max(2px, ${Math.min(100, stats.pct)}%)` : '0%' }}
              />
            </div>
          </div>
          <div className="text-right shrink-0 min-w-[60px] sm:min-w-[68px]">
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
  selected: boolean
  selectedCauses: Set<MatrixP0Cause>
  onToggle: () => void
  onSelectChange: () => void
  onSelectSubCause: (cause: MatrixP0Cause) => void
}

function UmbrellaCauseRow({
  umbrellaStats, selfStats, derivedStats, totalP0Pct, expanded, selected, selectedCauses, onToggle, onSelectChange, onSelectSubCause,
}: UmbrellaCauseRowProps) {
  const def = MATRIX_P0_CAUSES.fuera_de_limites
  const colors = COLOR_CLASSES[def.color] ?? FALLBACK_COLOR
  const Icon = CAUSE_ICONS.fuera_de_limites
  const pctOfTotal = (umbrellaStats.pct * totalP0Pct) / 100
  const hasPieces = umbrellaStats.pieces > 0

  return (
    <div
      className={cn(
        'border rounded-card overflow-hidden transition-all',
        !hasPieces && 'opacity-40',
        selected && 'ring-2 ring-offset-1 ring-offset-background',
      )}
      style={selected ? { '--tw-ring-color': CAUSE_HEX_BORDERS.fuera_de_limites } as React.CSSProperties : undefined}
    >
      <div className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors">
        {hasPieces && (
          <input
            type="checkbox"
            className="shrink-0 w-3.5 h-3.5 cursor-pointer accent-primary"
            checked={selected}
            onChange={onSelectChange}
            onClick={e => e.stopPropagation()}
            aria-label="Seleccionar Fuera de límites para filtrar timeline"
          />
        )}
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left"
          onClick={onToggle}
          type="button"
        >
          <span className={cn('p-1.5 rounded-ctl', colors.badge)}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="break-words">{def.label}</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-ctl bg-muted font-mono text-muted-foreground shrink-0">
                paraguas · 6 sub
              </span>
            </div>
            <div className="text-xs text-muted-foreground break-words line-clamp-2">{def.description}</div>
            <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden w-full">
              <div
                className={cn('h-full rounded-full transition-all', colors.bar)}
                style={{ width: umbrellaStats.pct > 0 ? `max(2px, ${Math.min(100, umbrellaStats.pct)}%)` : '0%' }}
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
            <SubCauseRow
              cause="fuera_de_limites"
              stats={selfStats}
              totalP0Pct={totalP0Pct}
              isStrict
              selected={selectedCauses.has('fuera_de_limites')}
              onToggle={() => onSelectSubCause('fuera_de_limites')}
            />
            {/* Resto: las 5 derivadas */}
            {derivedStats.map(({ cause, stats }) => (
              <SubCauseRow
                key={cause}
                cause={cause}
                stats={stats}
                totalP0Pct={totalP0Pct}
                selected={selectedCauses.has(cause)}
                onToggle={() => onSelectSubCause(cause)}
              />
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
  cause, stats, totalP0Pct, isStrict = false, selected = false, onToggle,
}: {
  cause: MatrixP0Cause
  stats: PointZeroClassification['byMatrixCause'][MatrixP0Cause]
  totalP0Pct: number
  isStrict?: boolean
  selected?: boolean
  onToggle?: () => void
}) {
  const def = MATRIX_P0_CAUSES[cause]
  const colors = COLOR_CLASSES[def.color] ?? FALLBACK_COLOR
  const Icon = CAUSE_ICONS[cause]
  const hasPieces = stats.pieces > 0
  const pctOfTotal = (stats.pct * totalP0Pct) / 100

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-ctl text-xs transition-all',
        hasPieces ? 'bg-background' : 'opacity-40',
        selected && 'ring-1 ring-offset-1 ring-offset-background',
      )}
      style={selected ? { '--tw-ring-color': CAUSE_HEX_BORDERS[cause] ?? '#ef4444' } as React.CSSProperties : undefined}
    >
      {hasPieces && onToggle && (
        <input
          type="checkbox"
          className="shrink-0 w-3 h-3 cursor-pointer accent-primary"
          checked={selected}
          onChange={onToggle}
          aria-label={`Seleccionar ${def.label} para filtrar timeline`}
        />
      )}
      <span className={cn('p-1 rounded-ctl', colors.badge)}>
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

export function P0CausesPanel({ byMatrixCause, totalP0Pct, unsortedPcs, selectedCauses, onToggleCause, isClassificationPlant = true }: P0CausesPanelProps) {
  const [expanded, setExpanded] = useState<MatrixP0Cause | null>(null)
  const hasCauseData = byMatrixCause != null
  const selSet = selectedCauses ?? new Set<MatrixP0Cause>()

  const toggleExpand = (cause: MatrixP0Cause) => {
    setExpanded(expanded === cause ? null : cause)
  }

  // Copy adaptativo: Chonchi menciona Matrix HMI explícito, Yal genérico.
  const sectionTitle = isClassificationPlant ? 'Vista Matrix oficial' : 'Causas de rechazo'
  const sectionSubtitle = isClassificationPlant ? 'como aparece en el HMI' : 'según Excel pieza a pieza'
  const noDataCopy = isClassificationPlant
    ? <>Sin el archivo <strong>Punto Cero</strong> exportado de Matrix no podemos mostrar las causas. Subilo junto al Excel de Pieza a Pieza para el análisis completo.</>
    : <>Sin causas de rechazo clasificadas para este turno. Verificá que el Excel haya subido correctamente.</>
  const fallbackDescription = isClassificationPlant
    ? 'cargá el Excel P0 para ver las causas'
    : 'sin desglose de causas disponible'

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">¿Por qué hubo P0?</CardTitle>
        <CardDescription>
          {hasCauseData
            ? `${totalP0Pct.toFixed(1)}% de piezas rechazadas — cada causa suma al total`
            : `${totalP0Pct.toFixed(1)}% de piezas rechazadas — ${fallbackDescription}`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!hasCauseData && (
          <div className="text-xs text-muted-foreground bg-muted/40 rounded-ctl p-3">
            {noDataCopy}
          </div>
        )}

        {hasCauseData && (
          <>
            {/* ─── Vista Matrix oficial — 4 filas, paraguas expandible ─ */}
            <section>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <span>{sectionTitle}</span>
                <span className="h-px flex-1 bg-border" />
                <span className="text-[9px] font-normal normal-case tracking-normal">{sectionSubtitle}</span>
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
                    // Si paraguas + derivadas todas en 0, no renderizar la fila
                    // (reduce ruido visual: en Yal típicamente solo 2 de 4
                    // causas oficiales aplican).
                    if (umbrellaPieces === 0) return null
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
                        selected={selSet.has(cause)}
                        selectedCauses={selSet}
                        onToggle={() => toggleExpand(cause)}
                        onSelectChange={() => onToggleCause?.(cause)}
                        onSelectSubCause={(c) => onToggleCause?.(c)}
                      />
                    )
                  }
                  // Filtrar causas oficiales sin piezas
                  if (byMatrixCause[cause].pieces === 0) return null
                  return (
                    <CauseRow
                      key={cause}
                      cause={cause}
                      stats={byMatrixCause[cause]}
                      totalP0Pct={totalP0Pct}
                      expanded={expanded === cause}
                      selected={selSet.has(cause)}
                      onToggle={() => toggleExpand(cause)}
                      onSelectChange={() => onToggleCause?.(cause)}
                    />
                  )
                })}
              </div>
            </section>

            {/* ─── Footer: total unsorted pcs ──────────────────────────── */}
            {typeof unsortedPcs === 'number' && unsortedPcs > 0 && (
              <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                {isClassificationPlant ? (
                  <>
                    Total <span className="font-mono text-muted-foreground/80">unsorted pcs</span> (Matrix):{' '}
                    <span className="font-mono font-medium text-foreground/80">{unsortedPcs.toLocaleString('es-CL')}</span>
                  </>
                ) : (
                  <>
                    Total piezas rechazadas:{' '}
                    <span className="font-mono font-medium text-foreground/80">{unsortedPcs.toLocaleString('es-CL')}</span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
