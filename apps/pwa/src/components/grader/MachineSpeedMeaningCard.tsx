/**
 * MachineSpeedMeaningCard — el resto de la frase que faltaba al "12,8 pz/min".
 *
 * Va debajo del gráfico de velocidad, que es donde nace la pregunta. Tres cosas,
 * en orden de "¿qué es?" → "¿cuánto cuesta?" → "¿de quién es el problema?":
 *
 *   1. el ritmo traducido a pz/hora y a piezas perdidas por cada hora producida;
 *   2. una barra por máquina que separa lo producido de lo perdido POR RITMO y
 *      lo perdido POR DETENCIÓN — hoy se muestran sumados y son problemas de
 *      dueños distintos (proceso vs mantención/operación);
 *   3. el aviso de que los porcentajes NO se comparan entre máquinas cuando sus
 *      objetivos difieren. Eso ya estaba en el código… dentro de un `title`, que
 *      es como no estar: en un celular no hay hover.
 */

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, InfoTooltip } from '@/components/ui'
import { Gauge, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildMachineSpeedSummary } from '@/services/grader/machineSpeedMeaning'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

/** Colores por máquina — los MISMOS del gráfico de arriba, en orden. */
const BAR_COLORS = ['bg-sky-400', 'bg-violet-400', 'bg-emerald-400', 'bg-amber-400']

interface Props {
  machines: UpstreamMachineShift[]
  className?: string
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CL')

export function MachineSpeedMeaningCard({ machines, className }: Props) {
  const s = useMemo(() => buildMachineSpeedSummary(machines), [machines])
  if (!s) return null

  const totalPerdido = s.totalPorRitmo + s.totalPorDetencion

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gauge className="w-4 h-4 text-muted-foreground" />
          ¿Qué significa ese ritmo?
          <InfoTooltip
            text={'El ritmo se mide SOLO sobre el tiempo en que la máquina produjo: si contara las horas paradas, una máquina detenida parecería lenta en vez de parada.\n\nLas piezas perdidas se miden contra la cadencia de la LÍNEA (la mediana de las máquinas que produjeron), no contra el objetivo propio de cada una — medir a cada máquina contra su propio objetivo castiga a la que más capacidad tiene.'}
          />
        </CardTitle>
        {totalPerdido > 0 && (
          <p className="text-xs text-muted-foreground">
            La línea dejó <span className="tabular-nums font-medium text-foreground">{fmt(totalPerdido)}</span> piezas
            en el camino: <span className="tabular-nums text-ink-warn">{fmt(s.totalPorRitmo)}</span> por ir bajo el
            ritmo de la línea y <span className="tabular-nums text-ink-crit">{fmt(s.totalPorDetencion)}</span> por
            estar detenidas.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {s.rows.map((r, i) => {
          const total = r.piezas + r.perdidasPorRitmo + r.perdidasPorDetencion
          const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)
          return (
            <div key={r.machineid} className="space-y-1.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-medium">{r.name}</span>
                <span className="text-lg font-medium tabular-nums leading-none">{r.ritmoCpm.toFixed(1)}</span>
                <span className="text-caption text-muted-foreground">pz/min</span>
                <span className="text-caption text-muted-foreground tabular-nums">
                  = {fmt(r.ritmoPorHora)} pz/h
                </span>
                {r.objetivoCpm != null && (
                  <span className="text-caption text-muted-foreground ml-auto tabular-nums">
                    objetivo {r.objetivoCpm.toFixed(0)} pz/min
                  </span>
                )}
              </div>

              {/* Producido · perdido por ritmo · perdido por detención */}
              <div className="h-2.5 rounded-full bg-muted-foreground/[0.12] overflow-hidden flex">
                <span
                  className={cn('h-full', BAR_COLORS[i % BAR_COLORS.length])}
                  style={{ width: `${pct(r.piezas)}%` }}
                  title={`${fmt(r.piezas)} piezas producidas`}
                />
                <span
                  className="h-full bg-warning"
                  style={{ width: `${pct(r.perdidasPorRitmo)}%` }}
                  title={`${fmt(r.perdidasPorRitmo)} piezas perdidas por ir bajo la cadencia de la línea`}
                />
                <span
                  className="h-full bg-destructive"
                  style={{ width: `${pct(r.perdidasPorDetencion)}%` }}
                  title={`${fmt(r.perdidasPorDetencion)} piezas perdidas por detención`}
                />
              </div>

              <p className="text-caption text-muted-foreground tabular-nums">
                <span className="text-foreground font-medium">{fmt(r.piezas)} pz</span> producidas
                {r.perdidasPorRitmo > 0 && <> · <span className="text-ink-warn">{fmt(r.perdidasPorRitmo)}</span> por ritmo</>}
                {r.perdidasPorDetencion > 0 && <> · <span className="text-ink-crit">{fmt(r.perdidasPorDetencion)}</span> por detención</>}
                {r.brechaPorHora != null && r.brechaPorHora > 0 && (
                  <> · <span className="text-foreground">−{fmt(r.brechaPorHora)}</span> pz por cada hora producida contra su objetivo</>
                )}
              </p>
            </div>
          )
        })}

        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-caption text-muted-foreground pt-0.5 border-t border-border">
          <span className="flex items-center gap-1.5 pt-2">
            <span className="w-4 h-2 rounded-full bg-sky-400" /> producido
          </span>
          <span className="flex items-center gap-1.5 sm:pt-2">
            <span className="w-4 h-2 rounded-full bg-warning" /> perdido por ritmo
          </span>
          <span className="flex items-center gap-1.5 sm:pt-2">
            <span className="w-4 h-2 rounded-full bg-destructive" /> perdido por detención
          </span>
        </div>

        {/* El aviso que vivía en un tooltip. En móvil no hay hover: si algo hay
            que saber para no sacar la conclusión equivocada, va escrito. */}
        {s.objetivosDistintos && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground rounded-ctl bg-warning/[0.12] border border-warning/[0.28] px-2.5 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-ink-warn" />
            <span>
              <span className="font-medium text-foreground">Los objetivos no son iguales</span> — estas máquinas no son
              todas el mismo modelo, así que su «% del objetivo» <span className="font-medium">no se compara entre
              ellas</span>: la de mayor capacidad puede entregar más piezas y aun así lucir peor. Para compararlas,
              mirá las piezas perdidas, que se miden contra la cadencia de la línea.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
