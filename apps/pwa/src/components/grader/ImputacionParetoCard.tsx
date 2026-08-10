/**
 * ImputacionParetoCard — las pérdidas del turno leídas con el árbol OFICIAL de
 * imputación, el mismo que los supervisores aprenden en la capacitación.
 *
 * Complementa a `LossCascadeCard` sin repetirla: la cascada responde «¿de quién
 * es el tiempo perdido?» (dueño), esta responde «¿de qué TIPO fue?» (categoría)
 * y, sobre todo, «¿se anotó?».
 *
 * Tres piezas:
 *  1. Cobertura de imputación — % del tiempo detenido que llegó con causal. No
 *     mide a Mantención: mide si el turno quedó documentado. Es el número que
 *     la capacitación tiene que mover (Chonchi arrancó en 0%).
 *  2. Pareto por categoría con drill-down. El pareto plano pone COLACION y
 *     LOGICA en la misma lista y la colación siempre gana; agrupado, primero se
 *     ve el tipo y recién al abrir la causal puntual.
 *  3. El árbol completo como referencia, marcando lo que se usó en este turno.
 *
 * Los colores por dueño son los MISMOS que usa la cascada (ámbar externo, rosa
 * mantención, pizarra planificado, violeta sin clasificar): dos códigos de
 * color distintos en la misma pantalla se leen como dos cosas distintas.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ListTree, HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { paretoByCategoria, SIN_CAUSAL, type ParetoCategoria } from '@/services/shoplogix/imputacionPareto'
import { leavesByCategoria, TOTAL_HOJAS_CURSO } from '@/services/shoplogix/imputacionTaxonomy'
import { LOSS_BUCKET_META } from '@/services/shoplogix/lossBuckets'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

function fmtHm(sec: number): string {
  if (sec <= 0) return '0m'
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/** Mismo código de color por dueño que la cascada del turno. */
const BUCKET_BG: Record<string, string> = {
  'planificado':    'bg-muted-foreground/[0.10]',
  'externo':        'bg-amber-500/[0.15]',
  'mantencion':     'bg-cat-5-tint/[0.15]',
  'sin-clasificar': 'bg-cat-6-tint/[0.15]',
}

/**
 * El tono -400 solo tiene contraste sobre fondo oscuro: medido en el navegador,
 * el porcentaje daba 2,1:1 en tema claro (AA pide 4,5:1). La variante -800 para
 * claro es la convención del repo.
 */
const COVERAGE_THEME = (pct: number) =>
  pct >= 90 ? { text: 'text-ink-ok', bar: 'bg-emerald-500/[0.15]', label: 'Documentado' }
  : pct >= 60 ? { text: 'text-ink-warn', bar: 'bg-amber-500/[0.15]', label: 'Parcial' }
  : { text: 'text-cat-5-ink', bar: 'bg-cat-5-tint/[0.15]', label: 'Sin imputar' }

export function ImputacionParetoCard({ machines }: { machines: UpstreamMachineShift[] }) {
  const [expanded, setExpanded] = useState(true)
  const [openCat, setOpenCat] = useState<string | null>(null)
  const [treeOpen, setTreeOpen] = useState(false)

  const pareto = useMemo(
    () => paretoByCategoria(machines.flatMap((m) => m.states)),
    [machines],
  )

  /** Causales del árbol efectivamente usadas en este turno, para marcar el árbol. */
  const usadas = useMemo(() => {
    const s = new Set<string>()
    for (const c of pareto.categorias) {
      if (c.label === SIN_CAUSAL) continue
      for (const causal of c.causales) s.add(causal.label)
    }
    return s
  }, [pareto])

  if (pareto.totalSec <= 0) return null

  const conRegistros = pareto.categorias.filter((c) => c.durationSec > 0)
  const vacias = pareto.categorias.filter((c) => c.durationSec === 0)
  const maxSec = Math.max(...conRegistros.map((c) => c.durationSec), 1)
  const cobertura = pareto.cobertura * 100
  const theme = COVERAGE_THEME(cobertura)
  const sinCausalSec = pareto.totalSec - pareto.imputadoSec

  const renderCategoria = (cat: ParetoCategoria, vacia: boolean) => {
    const isOpen = openCat === cat.key
    return (
      <div key={cat.key}>
        <button
          type="button"
          disabled={vacia}
          onClick={() => setOpenCat((k) => (k === cat.key ? null : cat.key))}
          aria-expanded={isOpen}
          className={cn(
            'w-full grid grid-cols-[minmax(108px,172px)_1fr_auto_14px] items-center gap-2 rounded-ctl px-1.5 py-1 text-left transition-colors',
            vacia ? 'opacity-45 cursor-default' : 'hover:bg-accent',
            isOpen && 'bg-accent',
          )}
          title={vacia ? `Ninguna causal de ${cat.label} se anotó en este turno` : undefined}
        >
          {/* Color explícito, no heredado: dentro de un <button> el color del
              contenedor no llega, y en tema oscuro el nombre quedaba casi negro
              sobre fondo casi negro. Mismo criterio que la cascada del turno. */}
          <span className="text-caption font-medium truncate flex items-center gap-1.5 text-foreground/90">
            {cat.label}
            {!vacia && (
              <span className="text-caption text-muted-foreground tabular-nums">{cat.causales.length}</span>
            )}
          </span>
          <span className="flex h-3.5 rounded-ctl overflow-hidden bg-muted/60" style={{ width: `${(cat.durationSec / maxSec) * 100}%` }}>
            {cat.porDueno.map((d) => (
              <span
                key={d.bucket}
                className={BUCKET_BG[d.bucket] ?? 'bg-muted-foreground/[0.10]'}
                style={{ width: `${(d.durationSec / cat.durationSec) * 100}%` }}
                title={`${LOSS_BUCKET_META[d.bucket as keyof typeof LOSS_BUCKET_META]?.label ?? d.bucket}: ${fmtHm(d.durationSec)}`}
              />
            ))}
          </span>
          <span className="text-right text-caption font-mono tabular-nums shrink-0 text-foreground/85">
            {vacia ? <span className="text-muted-foreground">—</span> : fmtHm(cat.durationSec)}
            {!vacia && (
              <span className="block text-caption text-muted-foreground/60">
                {((cat.durationSec / pareto.totalSec) * 100).toFixed(1)}%
              </span>
            )}
          </span>
          {vacia
            ? <span />
            : isOpen
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
        </button>

        {isOpen && (
          <div className="pl-3 sm:pl-[180px] pr-1 pb-1.5 space-y-0.5">
            {cat.causales.map((c) => (
              <div key={c.label} className="flex items-center gap-2 text-caption border-b border-border/40 last:border-0 py-0.5">
                <span className={cn('w-1.5 h-3 rounded-ctl shrink-0', BUCKET_BG[c.bucket] ?? 'bg-muted-foreground/[0.10]')} />
                <span className="truncate">{c.label}</span>
                {c.ambigua && (
                  <span
                    className="shrink-0 text-caption px-1 rounded-ctl bg-amber-500/[0.15] text-ink-warn border border-amber-500/[0.25]"
                    title="Shoplogix manda la causal sin su categoría, y esta hoja existe en Falla Eléctrica y en Falla Mecánica. Para la cascada da igual (ambas son Mantención); para separar eléctrica de mecánica haría falta que la causal llegue prefijada desde Shoplogix."
                  >
                    ¿eléc. o mec.?
                  </span>
                )}
                <span className="text-caption text-muted-foreground/60 tabular-nums shrink-0">×{c.count}</span>
                <span className="ml-auto font-mono tabular-nums shrink-0">{fmtHm(c.durationSec)}</span>
                <span className="font-mono tabular-nums text-muted-foreground/60 w-12 text-right shrink-0 text-caption">
                  {((c.durationSec / pareto.totalSec) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mb-4 pb-4 border-b border-border/60">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 rounded-ctl border border-primary/[0.25] bg-primary/[0.15] px-3 py-2 hover:bg-primary/[0.15] transition-colors"
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-sky-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-sky-400 shrink-0" />}
        <ListTree className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-footnote font-semibold text-foreground/90">Imputación del turno</span>
        <span className="text-caption text-muted-foreground hidden sm:inline">¿de qué tipo fue el tiempo perdido?</span>
        <span className="ml-auto flex items-center gap-3 text-caption tabular-nums text-foreground/85">
          <span title="Porcentaje del tiempo detenido que llegó con una causal anotada en Shoplogix. No mide a Mantención: mide si el turno quedó documentado.">
            Con causal <b className={cn('text-sm', theme.text)}>{cobertura.toFixed(0)}%</b>
          </span>
        </span>
      </button>

      {/* Cobertura de imputación: la barra es el turno detenido completo. */}
      <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-muted/60" title={`${fmtHm(pareto.imputadoSec)} con causal · ${fmtHm(sinCausalSec)} sin anotar`}>
        <div className={theme.bar} style={{ width: `${cobertura}%` }} />
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
            <span className={cn('px-1.5 py-0.5 rounded-ctl border', theme.text, 'border-current/30')}>{theme.label}</span>
            <span className="tabular-nums">
              <b className="text-foreground/85 font-mono">{fmtHm(pareto.imputadoSec)}</b> con causal
            </span>
            {sinCausalSec > 0 && (
              <span className="tabular-nums">
                <b className="text-foreground/85 font-mono">{fmtHm(sinCausalSec)}</b> sin anotar
              </span>
            )}
            <span className="tabular-nums">de {fmtHm(pareto.totalSec)} detenidos</span>
          </div>

          <div className="space-y-0.5">
            {conRegistros.map((c) => renderCategoria(c, false))}
          </div>

          {vacias.length > 0 && (
            <div className="space-y-0.5">
              <p className="text-caption text-muted-foreground/70 uppercase tracking-wider">
                Sin registros en este turno
              </p>
              {vacias.map((c) => renderCategoria(c, true))}
            </div>
          )}

          {sinCausalSec > 0 && (
            <p className="text-caption text-cat-6-ink">
              ⚠ {fmtHm(sinCausalSec)} de detención llegaron sin causal. Anotarlas en Shoplogix es lo
              único que permite atacar la causa: sin causal, ese tiempo no se puede atribuir a nadie.
            </p>
          )}

          <div>
            <button
              type="button"
              onClick={() => setTreeOpen((v) => !v)}
              className={cn(
                'text-caption px-2 py-0.5 rounded-ctl border transition-colors inline-flex items-center gap-1',
                treeOpen ? 'bg-primary/[0.15] text-sky-400 border-primary/[0.25]' : 'bg-muted text-muted-foreground border-border hover:bg-accent',
              )}
            >
              <HelpCircle className="w-3 h-3" />
              {treeOpen ? 'ocultar' : 'ver'} el árbol completo ({TOTAL_HOJAS_CURSO} causales)
            </button>

            {treeOpen && (
              <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {leavesByCategoria().map((cat) => {
                  const usadasCat = cat.hojas.filter((h) => usadas.has(h.label)).length
                  return (
                    <div key={cat.categoria} className="rounded-ctl border border-border bg-muted/30 px-2 py-1.5">
                      <div className="flex items-center justify-between gap-2 pb-1 mb-1 border-b border-border/60">
                        <span className="text-caption font-semibold truncate">{cat.label}</span>
                        <span className="text-caption text-muted-foreground font-mono tabular-nums shrink-0">
                          {usadasCat}/{cat.hojas.length}
                        </span>
                      </div>
                      {cat.hojas.map((h) => (
                        <div
                          key={h.label}
                          className={cn(
                            'text-caption flex items-center gap-1.5 py-px',
                            usadas.has(h.label) ? 'text-foreground/85' : 'text-muted-foreground/50',
                          )}
                        >
                          <span className={cn('w-1 h-1 rounded-full shrink-0', usadas.has(h.label) ? 'bg-sky-400' : 'bg-muted-foreground/40')} />
                          <span className="truncate">{h.label}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
                <p className="col-span-full text-caption text-muted-foreground/70">
                  En claro, las causales que se usaron en este turno. Las seis que aparecen en
                  Eléctrica y en Mecánica a la vez son las mismas: Shoplogix manda la causal sin su
                  categoría.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
