/**
 * MachineSpeedMeaningCard — el resto de la frase que faltaba al "12,8 pz/min".
 *
 * Va debajo del gráfico de velocidad, que es donde nace la pregunta. Tres cosas,
 * en orden de "¿qué es?" → "¿cuánto cuesta?" → "¿de quién es el problema?":
 *
 *   1. el ritmo traducido a pz/hora, contra el objetivo TAMBIÉN en pz/hora, y
 *      las piezas que deja en el camino por cada hora producida;
 *   2. una barra por máquina que separa lo producido de lo perdido POR RITMO y
 *      lo perdido POR DETENCIÓN — se mostraban sumados y son problemas de
 *      dueños distintos (proceso vs mantención/operación);
 *   3. el aviso de que los porcentajes NO se comparan entre máquinas cuando sus
 *      objetivos difieren. Eso ya estaba en el código… dentro de un `title`, que
 *      es como no estar: en un celular no hay hover.
 *
 * ── Sigue al gráfico ────────────────────────────────────────────────────────
 *
 * La ventana que analiza NO es fija: se engancha a `TimelineSyncContext`, el
 * mismo canal por el que el gráfico publica su zoom. Elegir un tramo con el
 * mouse recalcula todo para ese tramo. Sin selección: los últimos minutos si el
 * turno está EN CURSO —lo que importa ahí es cómo va ahora, no el promedio de
 * ocho horas— y el turno completo si ya cerró.
 */

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, Badge, InfoTooltip } from '@/components/ui'
import { Gauge, AlertTriangle, ChevronDown, Radio } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildMachineSpeedSummary, type SpeedWindow } from '@/services/grader/machineSpeedMeaning'
import { useTimelineSyncOptional } from './useTimelineSync'
import { fmtTime } from '@/services/grader/graderTimeFormat'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

/** Colores por máquina — los MISMOS del gráfico de arriba, en orden. */
const BAR_COLORS = ['bg-sky-400', 'bg-violet-400', 'bg-emerald-400', 'bg-amber-400']

/** Cuánto mira hacia atrás el "ritmo actual" de un turno en curso. */
const VENTANA_ACTUAL_MIN = 30

interface Props {
  machines: UpstreamMachineShift[]
  className?: string
}

const fmt = (n: number) => Math.round(n).toLocaleString('es-CL')

export function MachineSpeedMeaningCard({ machines, className }: Props) {
  const [abierto, setAbierto] = useState(true)
  const sync = useTimelineSyncOptional()

  /*
   * ¿La línea está corriendo AHORA? Se lee del propio sensor (`isCurrent` marca
   * el estado abierto de la máquina) en vez de pedirle al padre una prop más:
   * el dato ya viaja en el snapshot y así la tarjeta no puede desincronizarse
   * de la realidad por un `status` calculado en otra parte.
   */
  const live = useMemo(
    () => machines.some((m) => (m.states ?? []).some((s) => s.isCurrent)),
    [machines],
  )

  /** Último tramo con datos — el "ahora" real de la línea, no el reloj. */
  const ultimoDatoMs = useMemo(() => {
    let max = 0
    for (const m of machines) {
      for (const iv of m.intervals ?? []) {
        const ts = iv.startAt instanceof Date ? iv.startAt.getTime() : new Date(iv.startAt as unknown as string).getTime()
        if (!Number.isNaN(ts) && ts > max) max = ts
      }
    }
    return max || null
  }, [machines])

  const { window, etiqueta, esActual } = useMemo<{
    window?: SpeedWindow; etiqueta: string; esActual: boolean
  }>(() => {
    if (sync?.range) {
      const { startMs, endMs } = sync.range
      return {
        window: { startMs, endMs },
        etiqueta: `${fmtTime(startMs)}–${fmtTime(endMs)}`,
        esActual: false,
      }
    }
    if (live && ultimoDatoMs) {
      /*
       * Se ancla al ÚLTIMO TRAMO CON DATOS y no a `Date.now()`: Shoplogix
       * sincroniza cada 5 min, así que la última media hora del reloj puede no
       * tener ni un dato todavía y la tarjeta quedaría vacía justo en el turno
       * en curso, que es cuando más se mira.
       */
      const endMs = ultimoDatoMs + 5 * 60_000
      return {
        window: { startMs: endMs - VENTANA_ACTUAL_MIN * 60_000, endMs },
        etiqueta: `últimos ${VENTANA_ACTUAL_MIN} min`,
        esActual: true,
      }
    }
    return { etiqueta: 'turno completo', esActual: false }
  }, [sync?.range, live, ultimoDatoMs])

  const s = useMemo(() => buildMachineSpeedSummary(machines, window), [machines, window])

  // Sin datos en la ventana elegida se dice, en vez de desaparecer: una tarjeta
  // que se esfuma al hacer zoom se lee como un bug.
  const sinDatosEnVentana = !s && Boolean(window)
  if (!s && !sinDatosEnVentana) return null

  const totalPerdido = s ? s.totalPorRitmo + s.totalPorDetencion : 0

  return (
    /* `data-speed-*` expone la ventana que se está analizando. Mismo motivo que
       el `data-testid="rate-chart-axis"` del panel: el gráfico que la define se
       pinta en canvas, así que sin esto no hay forma de verificar desde fuera
       —ni a ojo ni automatizado— que la tarjeta siguió al zoom. */
    <Card
      className={className}
      data-testid="speed-meaning"
      data-speed-window-start={window ? new Date(window.startMs).toISOString() : ''}
      data-speed-window-end={window ? new Date(window.endMs).toISOString() : ''}
      data-speed-window-label={etiqueta}
    >
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
          aria-expanded={abierto}
        >
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <Gauge className="w-4 h-4 text-muted-foreground shrink-0" />
            ¿Qué significa ese ritmo?
            <Badge
              variant="outline"
              className={cn('text-caption font-normal shrink-0', esActual && 'border-primary/[0.35] text-primary')}
            >
              {esActual && <Radio className="w-3 h-3 mr-1 animate-pulse" />}
              {etiqueta}
            </Badge>
          </CardTitle>
          <ChevronDown
            className={cn(
              'w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200',
              !abierto && '-rotate-90',
            )}
          />
        </button>
        {abierto && (
          <p className="text-xs text-muted-foreground">
            {sync?.range
              ? 'Del tramo que elegiste en el gráfico. '
              : esActual
              ? 'De los últimos tramos con datos. '
              : ''}
            {totalPerdido > 0 && s && (
              <>
                La línea dejó <span className="tabular-nums font-medium text-foreground">{fmt(totalPerdido)}</span> piezas
                en el camino: <span className="tabular-nums text-ink-warn">{fmt(s.totalPorRitmo)}</span> por ir bajo el
                ritmo de la línea y <span className="tabular-nums text-ink-crit">{fmt(s.totalPorDetencion)}</span> por
                estar detenidas.
              </>
            )}
          </p>
        )}
        {abierto && (
          <p className="text-caption text-muted-foreground/70">
            <InfoTooltip
              text={'El ritmo se mide SOLO sobre el tiempo en que la máquina produjo: si contara las horas paradas, una máquina detenida parecería lenta en vez de parada.\n\nLas piezas perdidas se miden contra la cadencia de la LÍNEA (la mediana de las máquinas que produjeron), no contra el objetivo propio de cada una — medir a cada máquina contra su propio objetivo castiga a la que más capacidad tiene.\n\nEl zoom del gráfico de arriba manda: lo que elijas ahí es lo que se calcula acá.'}
            />{' '}
            Ctrl + rueda sobre el gráfico para acotar el tramo.
          </p>
        )}
      </CardHeader>

      {abierto && (
        <CardContent className="space-y-3">
          {sinDatosEnVentana && (
            <p className="text-sm text-muted-foreground">
              Sin producción registrada en ese tramo. Ampliá la selección del gráfico o quitá el zoom.
            </p>
          )}

          {s?.rows.map((r, i) => {
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
                    /* El objetivo también en pz/h: si el dato de arriba está en
                       piezas por hora, la referencia tiene que estar en la misma
                       unidad o la comparación la hace el lector de memoria. */
                    <span className="text-caption text-muted-foreground ml-auto tabular-nums">
                      objetivo {r.objetivoCpm.toFixed(0)} pz/min
                      {r.objetivoPorHora != null && <> = {fmt(r.objetivoPorHora)} pz/h</>}
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

          {s && (
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
          )}

          {/* El aviso que vivía en un tooltip. En móvil no hay hover: si algo hay
              que saber para no sacar la conclusión equivocada, va escrito. */}
          {s?.objetivosDistintos && (
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
      )}
    </Card>
  )
}
