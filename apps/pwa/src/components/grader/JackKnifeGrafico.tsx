import { Q } from './jackKnifePresentacion'
import { useMemo } from 'react'
import { calcularLayout } from './jackKnifeLayout'
import { dec1 } from '@/utils/formatoNumeros'
import { SIN_IMPUTAR, type CalculoJK, type PuntoJK } from '@/services/shoplogix/jackKnife'
const COLOR_SIN = 'rgb(var(--cat-6-ink))'

const durS = (m: number) => m >= 90 ? dec1(m/60)+' h' : dec1(m)+' min'
const plural = (n: number, uno: string, varios: string) => n === 1 ? uno : varios
export function JackKnifeGrafico({ calc, ancho = 900, sel = null, fantasmas = [], elegirCausa = () => {}, anillos, lectura = false, enAtacar }: { calc: CalculoJK; ancho?: number; sel?: string | null; fantasmas?: PuntoJK[]; elegirCausa?: (k: string) => void; /** Causas con acción fuerte hecha: se marcan con un aro. */ anillos?: ReadonlySet<string>; /** Modo lectura (piel Apple): sin fondos de cuadrante, puntos neutros salvo «Atacar ahora». */ lectura?: boolean; enAtacar?: ReadonlySet<string> }) {
 const layout = useMemo(() => calc.pts.length ? calcularLayout(calc, ancho, sel, fantasmas) : null, [calc, ancho, sel, fantasmas])
 if (!layout) return <p>Sin detenciones de Mantención con causa en esta ventana.</p>
 // Modo lectura: texto de 13 px reales (el viewBox mide lo mismo que el ancho pintado).
 const txt = lectura ? 'text-footnote' : 'text-caption'
 return (              <svg
                viewBox={`0 0 ${layout.W} ${layout.H}`}
                style={{ height: 'auto' }}
                role="img"
                aria-label="Eventos contra MTTR por causa"
                className="block w-full"
              >
                {!lectura && <>
                <rect x={layout.L} y={layout.T} width={Math.max(0, layout.ux - layout.L)} height={Math.max(0, layout.uy - layout.T)} fill={Q.agu.fill} />
                <rect x={layout.ux} y={layout.T} width={Math.max(0, layout.W - layout.R - layout.ux)} height={Math.max(0, layout.uy - layout.T)} fill={Q.amb.fill} />
                <rect x={layout.L} y={layout.uy} width={Math.max(0, layout.ux - layout.L)} height={Math.max(0, layout.T + layout.ih - layout.uy)} fill={Q.ok.fill} />
                <rect x={layout.ux} y={layout.uy} width={Math.max(0, layout.W - layout.R - layout.ux)} height={Math.max(0, layout.T + layout.ih - layout.uy)} fill={Q.cro.fill} />
                </>}

                {layout.xs.map(({ v, x }) => (
                  <text key={`x${v}`} x={x} y={layout.T + layout.ih + 18} textAnchor="middle" className={`fill-muted-foreground ${txt}`}>
                    {String(v).replace('.', ',')}
                  </text>
                ))}
                {layout.ys.map(({ v, y }) => (
                  <text key={`y${v}`} x={layout.L - 8} y={y + 4} textAnchor="end" className={`fill-muted-foreground ${txt}`}>
                    {String(v).replace('.', ',')}
                  </text>
                ))}
                <text x={layout.L + layout.iw / 2} y={layout.H - 6} textAnchor="middle" className={`fill-muted-foreground ${txt}`}>Eventos en el período</text>
                <text transform={`translate(13 ${layout.T + layout.ih / 2}) rotate(-90)`} textAnchor="middle" className={`fill-muted-foreground ${txt}`}>MTTR (min)</text>
                {lectura && <line x1={layout.L} y1={layout.T + layout.ih} x2={layout.W - layout.R} y2={layout.T + layout.ih} className="stroke-border" />}

                <line x1={layout.ux} y1={layout.T} x2={layout.ux} y2={layout.T + layout.ih} className="stroke-muted-foreground opacity-40" strokeDasharray="4 4" />
                <line x1={layout.L} y1={layout.uy} x2={layout.W - layout.R} y2={layout.uy} className="stroke-muted-foreground opacity-40" strokeDasharray="4 4" />

                {(
                  [
                    ['amb', 'Agudas y crónicas', layout.W - layout.R - 8, layout.T + 18, 'end'],
                    ['agu', 'Agudas', layout.L + 8, layout.T + 18, 'start'],
                    ['ok', 'Bajo control', layout.L + 8, layout.T + layout.ih - 8, 'start'],
                    ['cro', 'Crónicas', layout.W - layout.R - 8, layout.T + layout.ih - 8, 'end'],
                  ] as const
                ).map(([q, t, x, y, an]) => (
                  <text key={q} x={x} y={y} textAnchor={an} className="text-footnote font-semibold" style={{ fill: lectura ? 'rgb(var(--muted-foreground))' : Q[q].ink }}>
                    {t}
                  </text>
                ))}

                {lectura
                  ? <line {...layout.disponibilidad} stroke="rgb(var(--muted-foreground))" strokeOpacity={0.6} />
                  : <line {...layout.disponibilidad} stroke="var(--jk-accent, rgb(var(--accent)))" strokeDasharray="7 5" />}
                <text x={layout.L + 8} y={layout.H - 26} className={`fill-muted-foreground ${txt}`}>línea de disponibilidad · {durS(calc.un * calc.um)} por causa</text>
                {fantasmas.map(p => {
                  const actual = layout.puntos.find(d => d.p.k === p.k)
                  if (!actual) return null
                  const x = layout.sx(p.ev), y = layout.sy(p.mttr)
                  const ang = Math.atan2(actual.y-y, actual.x-x)
                  const tx = actual.x - Math.cos(ang)*(actual.rad+2), ty = actual.y - Math.sin(ang)*(actual.rad+2)
                  return <g key={'antes-'+p.k} stroke="var(--jk-gray, #8E8E93)" fill="var(--jk-gray, #8E8E93)">
                    <circle cx={x} cy={y} r={3} /><line x1={x} y1={y} x2={tx} y2={ty} strokeWidth={1} />
                    <path d={`M ${tx-6*Math.cos(ang-.5)} ${ty-6*Math.sin(ang-.5)} L ${tx} ${ty} L ${tx-6*Math.cos(ang+.5)} ${ty-6*Math.sin(ang+.5)}`} fill="none" />
                  </g>
                })}
                {layout.puntos.filter((d) => d.etiqueta?.lin).map(({ p, x, y, etiqueta }) => (
                  <line key={`l-${p.k}`} x1={x} y1={y} x2={etiqueta!.cx} y2={etiqueta!.cy} className="stroke-muted-foreground opacity-40" />
                ))}
                {layout.puntos.map(({ p, x, y, rad, etiqueta }) => {
                  const color = lectura
                    ? (enAtacar?.has(p.k) ? 'rgb(var(--ink-crit))' : 'rgb(var(--muted-foreground))')
                    : p.q === 'ok' && !etiqueta ? 'rgb(var(--muted-foreground))' : p.k === SIN_IMPUTAR ? COLOR_SIN : Q[p.q].dot
                  const activar = () => elegirCausa(p.k)
                  const conAccion = anillos?.has(p.k) ?? false
                  return (
                    <g
                      key={p.k}
                      role="button"
                      tabIndex={0}
                      aria-label={`${p.k}: ${p.ev} ${plural(p.ev, 'evento', 'eventos')}, ${durS(p.mttr)}${conAccion ? ', con acción fuerte hecha' : ''}`}
                      onClick={activar}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activar() } }}
                      className="cursor-pointer focus-visible:outline-none"
                    >
                      <title>{p.k}</title>
                      {conAccion && <circle cx={x} cy={y} r={rad + 5} fill="none" stroke="rgb(var(--accent))" strokeWidth={2.5} />}
                      <circle cx={x} cy={y} r={rad} fill={color} className="stroke-card" strokeWidth={1.5} />
                      {etiqueta && (
                        <text x={etiqueta.bx} y={etiqueta.by} className="fill-foreground text-footnote">{p.k}</text>
                      )}
                    </g>
                  )
                })}
              </svg>)
}
