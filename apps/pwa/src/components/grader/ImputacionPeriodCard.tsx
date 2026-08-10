/**
 * ImputacionPeriodCard — cobertura de imputación del período.
 *
 * La card del turno responde «¿este turno quedó documentado?». Esta responde la
 * pregunta que de verdad importa para la capacitación: **¿está mejorando?**
 *
 * Por eso el elemento central no es el porcentaje sino la SERIE por turno: un
 * 60% de mes no dice lo mismo si viene de 20% que si viene de 90%. La tendencia
 * compara la primera mitad del período con la segunda.
 *
 * Sale de `stateAggregates` del doc padre de cada turno — 0 lecturas extra de
 * Firestore.
 */

import { ListChecks } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { Disclosure } from '@/components/piel'
import { fmtSecPanoramic, type PeriodImputacion } from '@/services/grader/graderPeriodMonthlyStats'

export type TendenciaImputacion = { dir: 'sube' | 'baja' | 'estable'; deltaPts: number } | null

/**
 * Compara la primera mitad del período con la segunda.
 *
 * Necesita al menos 6 turnos: con menos, la "tendencia" es ruido de dos o tres
 * turnos y afirmarla sería peor que no decir nada. Umbral de 5 puntos por el
 * mismo motivo — una diferencia menor no distingue mejora de variación normal.
 */
export function tendenciaImputacion(porTurno: PeriodImputacion['porTurno']): TendenciaImputacion {
  if (porTurno.length < 6) return null
  const mitad = Math.floor(porTurno.length / 2)
  const prom = (xs: PeriodImputacion['porTurno']) =>
    xs.reduce((a, x) => a + x.cobertura, 0) / xs.length
  const deltaPts = (prom(porTurno.slice(mitad)) - prom(porTurno.slice(0, mitad))) * 100
  if (Math.abs(deltaPts) < 5) return { dir: 'estable', deltaPts }
  return { dir: deltaPts > 0 ? 'sube' : 'baja', deltaPts }
}

/**
 * El tono -400 solo tiene contraste sobre fondo oscuro: medido en el navegador,
 * el porcentaje daba 2,1:1 en tema claro (AA pide 4,5:1). La variante -800 para
 * claro es la convención del repo, la misma que usan GateBreakdownCard y
 * ActionPlanPanel.
 */
const nivel = (pct: number) =>
  pct >= 90 ? { text: 'text-ink-ok', bar: 'bg-emerald-500/[0.15]', label: 'Documentado' }
  : pct >= 60 ? { text: 'text-ink-warn', bar: 'bg-amber-500/[0.15]', label: 'Parcial' }
  : { text: 'text-cat-5-ink', bar: 'bg-cat-5-tint/[0.15]', label: 'Sin imputar' }

export function ImputacionPeriodCard({ imputacion }: { imputacion: PeriodImputacion | null }) {
  if (!imputacion || imputacion.totalSec <= 0) return null

  const pct = imputacion.cobertura * 100
  const th = nivel(pct)
  const sinCausalSec = imputacion.totalSec - imputacion.imputadoSec
  const tend = tendenciaImputacion(imputacion.porTurno)
  const serie = imputacion.porTurno

  return (
    <Card className="border-primary/[0.25] bg-primary/[0.15]">
      <CardContent className="py-1.5 px-4 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <ListChecks className="w-3 h-3 text-sky-400 shrink-0" />
          <p className="text-caption font-semibold text-muted-foreground tracking-wide">
            Imputación del período
          </p>
          <span
            className={cn('text-caption px-1.5 rounded-ctl border border-current/30 ml-auto', th.text)}
            title="Del tiempo detenido del período, cuánto llegó con una causal anotada en Shoplogix. No mide a Mantención: mide si los turnos quedaron documentados."
          >
            {th.label}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <p className={cn('text-lg font-bold leading-none tabular-nums', th.text)}>
              {pct.toFixed(0)}%
            </p>
            <p className="text-caption text-muted-foreground mt-0.5">con causal</p>
          </div>

          {/* La serie es el punto de la card: un 60% que viene de 20% es una
              buena noticia y uno que viene de 90% es una alarma. */}
          {serie.length > 1 && (
            <div className="flex-1 min-w-0">
              <div className="flex items-end gap-px h-8" title="Un trazo por turno, en orden cronológico. La altura es el % con causal de ese turno.">
                {serie.map((t, i) => {
                  const p = t.cobertura * 100
                  return (
                    <div
                      key={`${t.dateKey}-${t.shiftId}-${i}`}
                      className={cn('flex-1 min-w-[2px] rounded-t-sm', nivel(p).bar)}
                      style={{ height: `${Math.max(4, p)}%` }}
                      title={`${t.dateKey.slice(5)} · ${t.shiftId}: ${p.toFixed(0)}% con causal · ${fmtSecPanoramic(t.totalSec)} detenidos`}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between text-caption text-muted-foreground mt-0.5">
                <span className="tabular-nums">{serie[0]!.dateKey.slice(5)}</span>
                {tend && (
                  <span className={cn(
                    'tabular-nums',
                    tend.dir === 'sube' ? 'text-ink-ok'
                    : tend.dir === 'baja' ? 'text-cat-5-ink' : '',
                  )}>
                    {tend.dir === 'sube' ? '▲' : tend.dir === 'baja' ? '▼' : '='}{' '}
                    {tend.dir === 'estable'
                      ? 'estable en el período'
                      : `${tend.deltaPts > 0 ? '+' : ''}${tend.deltaPts.toFixed(0)} pts vs. la primera mitad`}
                  </span>
                )}
                <span className="tabular-nums">{serie[serie.length - 1]!.dateKey.slice(5)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted-foreground">
          <span className="tabular-nums">
            <b className="text-foreground/85">{fmtSecPanoramic(imputacion.imputadoSec)}</b> con causal
          </span>
          {sinCausalSec > 0 && (
            <span className="tabular-nums">
              <b className="text-foreground/85">{fmtSecPanoramic(sinCausalSec)}</b> sin anotar
            </span>
          )}
          <span className="tabular-nums">
            de {fmtSecPanoramic(imputacion.totalSec)} detenidos en {imputacion.turnos} turno{imputacion.turnos === 1 ? '' : 's'}
          </span>
        </div>

        {/* §22: el % y la tendencia responden la pregunta de la tarjeta; el
            reparto por causal es DETALLE. Se despliega en línea (variante
            `inline`) para no crear tarjeta dentro de tarjeta (§7). */}
        {imputacion.topCategorias.length > 0 && (
          <Disclosure
            variant="inline"
            title="Ver reparto por causal"
            summary={`${imputacion.topCategorias.length} causales`}
            defaultOpen={false}
            storageKey="grader-imputacion-causales"
          >
          <div className="flex flex-wrap gap-1">
            {imputacion.topCategorias.slice(0, 5).map((c) => (
              <span
                key={c.label}
                className="text-caption px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums"
              >
                {c.label} <b className="text-foreground/80">{fmtSecPanoramic(c.durationSec)}</b>
              </span>
            ))}
          </div>
          </Disclosure>
        )}
      </CardContent>
    </Card>
  )
}
