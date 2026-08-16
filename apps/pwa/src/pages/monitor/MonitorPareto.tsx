/**
 * "Qué se repite": el Pareto de las paradas recuperables de los últimos turnos.
 *
 * Es el bloque que faltaba para pasar de "hoy pasó esto" a "esto vuelve todos
 * los turnos, ataquémoslo". Se alimenta del historial que YA viaja en el doc
 * del monitor: cero lecturas extra.
 *
 * Cada fila lleva las dos medidas juntas —minutos y en cuántos turnos
 * aparece— porque ninguna de las dos sola alcanza: en Filete `ACUMULACION` es
 * cuarta por minutos y ocurrió una sola vez. El porqué está en
 * `monitorPareto.ts`.
 */
import { useState } from 'react'
import { DUENO_UI } from './duenoUi'
import { Bloque } from './MonitorShiftParts'
import type { ContextoPareto, ParetoResult, PuntoTendencia } from '@/services/shoplogix/monitorPareto'
import { nombreDeDia } from '@/services/shoplogix/monitorVsAyer'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

/** "2 h 6 min" a partir de minutos, para totales que pasan la hora. */
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDec1 = (n: number) => nf1.format(n || 0)

function fmtMin(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r > 0 ? `${h} h ${r} min` : `${h} h`
}

export function ParetoDeParadas({ pareto, ctx, tendencia }: {
  pareto: ParetoResult | null
  /** El marco temporal de los MISMOS turnos del ranking. */
  ctx?: ContextoPareto | null
  /** La serie, que mira más atrás: 10 turnos en vez de los 6 con detalle. */
  tendencia?: ContextoPareto | null
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  // Con uno o dos turnos no hay patrón que mostrar, solo el turno de hoy otra
  // vez. Tres es el mínimo para que "en 2 de 3" signifique algo.
  if (!pareto || pareto.shifts < 3 || pareto.rows.length === 0) return null

  const max = pareto.rows[0]!.minutes
  const vitales = pareto.rows.slice(0, Math.max(1, pareto.vitalCount))
  const resto = pareto.rows.slice(vitales.length)
  const cronicas = vitales.filter((r) => r.shifts >= Math.ceil(pareto.shifts / 2))
  /* La serie mira más atrás que el ranking (10 turnos contra 6): si no llega,
     se cae al contexto de la propia muestra. */
  const serie = tendencia ?? ctx ?? null
  /* Escala del gráfico: el peor turno con aire, para que la barra más alta no
     toque el techo y se pueda leer su número encima. */
  const maxPct = Math.max(
    5, ...(serie?.serie ?? []).map((p) => p.pct), serie?.banda?.alto ?? 0,
  ) * 1.3

  return (
    <Bloque
      id="pareto"
      titulo="Qué se repite"
      /* ⚠ El extra decía «6 turnos · 5 h 48 min» y adentro se leía «49 h 10
         min en total»: dos horas distintas a diez centímetros, sin decir que
         una es la parte y la otra el todo. Acá va el indicador. */
      extra={
        <span className="tabular-nums">
          {pareto.shifts} turnos{ctx && ctx.ventanaMin > 0 && ` · ${fmtDec1(ctx.pct)}%`}
        </span>
      }
      defaultAbierto={false}
    >
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Tiempo <b>recuperable</b> de los últimos <span className="tabular-nums">{pareto.shifts}</span>{' '}
        turnos de esta línea, por causa. Las paradas de convenio no entran: no son pérdidas que
        alguien pueda atacar.
      </p>

      {/* ── El marco: cuánto tiempo se está midiendo ──────────────────────
          Sin esto, «5 h 48 min» no dice nada: no se sabe si es mucho o poco.
          El 100% es el tiempo TOTAL de los turnos, con el convenio A LA VISTA
          (decisión de Orel) — escondido en el denominador, nadie notaría que
          la colación creció. */}
      {ctx && ctx.ventanaMin > 0 && (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[28px] font-bold leading-none tabular-nums text-foreground">
              {fmtDec1(ctx.pct)}%
            </span>
            <span className="text-right text-[11px] leading-tight text-muted-foreground">
              <span className="tabular-nums font-semibold text-foreground/80">{fmtMin(ctx.recuperableMin)}</span>
              {' '}recuperables<br />
              de <span className="tabular-nums">{fmtMin(ctx.ventanaMin)}</span> en{' '}
              {ctx.turnos} turnos completos
            </span>
          </div>
          <div className="mt-2 flex h-3.5 gap-[2px]" role="img"
            aria-label={`De ${fmtMin(ctx.ventanaMin)} medidos: ${fmtMin(ctx.produciendoMin)} produciendo, ${fmtMin(ctx.convenioMin)} de convenio, ${fmtMin(ctx.recuperableMin)} recuperables`}>
            <i className="rounded-[4px] bg-muted-foreground/[0.35]" style={{ flex: '1 1 0%' }} />
            {ctx.convenioMin > 0 && (
              <i className="rounded-[4px] bg-muted-foreground/[0.6]"
                style={{ width: `${(ctx.convenioMin / ctx.ventanaMin) * 100}%`, minWidth: 3 }} />
            )}
            {ctx.recuperableMin > 0 && (
              <i className="rounded-[4px] bg-ink-warn"
                style={{ width: `${(ctx.recuperableMin / ctx.ventanaMin) * 100}%`, minWidth: 3 }} />
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/[0.35]" />
              Produciendo <span className="tabular-nums text-foreground/80">{fmtMin(ctx.produciendoMin)}</span>
            </span>
            {ctx.convenioMin > 0 && (
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-[3px] bg-muted-foreground/[0.6]" />
                Convenio <span className="tabular-nums text-foreground/80">{fmtMin(ctx.convenioMin)}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <i className="h-2.5 w-2.5 rounded-[3px] bg-ink-warn" />
              Recuperable <span className="tabular-nums font-semibold text-foreground/80">{fmtMin(ctx.recuperableMin)}</span>
            </span>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2.5">
        {vitales.map((r) => (
          <FilaPareto
            key={r.label} r={r} max={max} turnos={pareto.shifts}
            abierta={abierta === r.label}
            onToggle={() => setAbierta((v) => (v === r.label ? null : r.label))}
          />
        ))}
      </ul>

      {/* El resto de las causas va PEGADO a la lista, no después de la
          conclusión: partía el bloque en dos mitades y las cuatro chicas
          aparecían debajo del cierre, donde el ojo ya daba por terminado. */}
      {resto.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] text-brand-ink underline underline-offset-2">
            ver las otras {resto.length}
          </summary>
          <ul className="mt-2 space-y-2.5">
            {resto.map((r) => (
              <FilaPareto
                key={r.label} r={r} max={max} turnos={pareto.shifts}
                abierta={abierta === r.label}
                onToggle={() => setAbierta((v) => (v === r.label ? null : r.label))}
              />
            ))}
          </ul>
        </details>
      )}

      {/* El corte, dicho en palabras: es la frase que alguien puede repetir en
          una reunión sin tener que leer el gráfico. */}
      {/* La frase de gestión que las filas no dicen: quién carga con lo que
          se repite. El 15-08 el 49% no tenía dueño — no se puede atacar lo
          que nadie anota, y ESO es el hallazgo. */}
      {(pareto.porDueno.mantencion > 0 || pareto.porDueno.externo > 0 || pareto.porDueno['sin-imputar'] > 0) && (
        <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
          De lo que se repite:{' '}
          <b className="tabular-nums text-muted-foreground">{fmtMin(pareto.porDueno['sin-imputar'])} sin imputar
            {pareto.totalMin > 0 && ` (${Math.round((pareto.porDueno['sin-imputar'] / pareto.totalMin) * 100)}%)`}</b>
          {' · '}
          <b className={`tabular-nums ${DUENO_UI.externo.clase}`}>{fmtMin(pareto.porDueno.externo)} externos</b>
          {' · '}
          <b className={`tabular-nums ${DUENO_UI.mantencion.clase}`}>{fmtMin(pareto.porDueno.mantencion)} de equipos</b>.
          {pareto.porDueno['sin-imputar'] >= pareto.porDueno.mantencion &&
            pareto.porDueno['sin-imputar'] >= pareto.porDueno.externo && (
            <> Lo más grande no tiene dueño — no se puede atacar lo que nadie anota.</>
          )}
        </p>
      )}

      <p className="mt-3 rounded-lg bg-muted px-2.5 py-2 text-[12px] font-medium text-emerald-800 dark:text-emerald-300">
        {vitales.length === 1
          ? `Una sola causa explica el ${Math.round(pareto.vitalPct)}% del tiempo parado.`
          : `${vitales.length} causas explican el ${Math.round(pareto.vitalPct)}% del tiempo parado.`}
        {cronicas.length > 0 && cronicas.length < vitales.length && (
          <>
            {' '}
            <span className="font-normal text-foreground/70">
              De esas, {cronicas.length === 1 ? 'solo una vuelve' : `${cronicas.length} vuelven`} turno
              tras turno; el resto fueron episodios sueltos.
            </span>
          </>
        )}
      </p>

      {/* ── ¿Mejora o empeora? ────────────────────────────────────────────
        * Barras por turno (Orel: se leen mejor que la línea), angostas y con
        * su % encima — anchas y sin cifra no se podían comparar.
        * ⚠ El veredicto NO se infiere de la forma: los últimos 3 turnos tienen
        * que quedar TODOS bajo el mejor de los anteriores. Con datos ruidosos,
        * cualquier regla más blanda declara una mejora que la produjo un solo
        * turno malo.
        */}
      {serie && serie.serie.length >= 3 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Cómo viene turno a turno
            <span className="normal-case tracking-normal">
              {' '}· % recuperable de cada turno · últimos {serie.serie.length}
            </span>
          </p>

          <div className="relative mt-3 h-[104px]">
            {/* La mediana, para tener contra qué comparar cada barra. */}
            {serie.banda && (
              <div className="absolute inset-x-0 border-t border-dashed border-muted-foreground/[0.5]"
                style={{ bottom: `${(serie.banda.mediana / maxPct) * 100}%` }}>
                <span className="absolute right-0 -top-4 text-[11px] tabular-nums text-muted-foreground">
                  mediana {fmtDec1(serie.banda.mediana)}%
                </span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-[3px]">
              {[
                ...serie.serie.map((p): { p: PuntoTendencia; hueco: boolean } => ({ p, hueco: false })),
                ...serie.sinProduccion.map((d): { p: PuntoTendencia; hueco: boolean } => (
                  { p: { dateKey: d, pct: 0, recuperableMin: 0, windowMin: 0 }, hueco: true })),
              ]
                .map(({ p, hueco }) => (
                  <div key={p.dateKey} className="flex min-w-0 flex-1 flex-col items-center">
                    {!hueco && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {Math.round(p.pct)}%
                      </span>
                    )}
                    <div
                      className={hueco
                        ? 'w-full max-w-[26px] rounded-t-[3px] border border-dashed border-muted-foreground/[0.4]'
                        : `w-full max-w-[26px] rounded-t-[3px] ${p.pct > (serie.banda?.mediana ?? 0) ? 'bg-ink-warn' : 'bg-muted-foreground/[0.45]'}`}
                      style={{ height: hueco ? '8px' : `${Math.max(3, (p.pct / maxPct) * 80)}px` }}
                      title={hueco
                        ? `${nombreDeDia(p.dateKey)}: la línea no produjo`
                        : `${nombreDeDia(p.dateKey)}: ${fmtMin(p.recuperableMin)} de ${fmtMin(p.windowMin)}`}
                    />
                  </div>
                ))}
            </div>
          </div>

          <div className="mt-1 flex justify-between gap-[3px] text-[11px] text-muted-foreground/70">
            {[...serie.serie.map((p) => p.dateKey), ...serie.sinProduccion].map((d: string) => (
              <span key={d} className="min-w-0 flex-1 truncate text-center tabular-nums">
                {d.slice(8)}
              </span>
            ))}
          </div>

          <p className="mt-2 text-[12px] leading-snug">
            <b className={serie.veredicto === 'mejora' ? 'text-ink-ok'
              : serie.veredicto === 'empeora' ? 'text-ink-crit' : 'text-foreground'}>
              {serie.veredicto === 'mejora' ? 'Viene mejorando'
                : serie.veredicto === 'empeora' ? 'Viene empeorando'
                : 'Sin cambio visible'}
            </b>
            {serie.banda && (
              <span className="text-muted-foreground">
                {' '}· lo habitual va de{' '}
                <span className="tabular-nums">{fmtDec1(serie.banda.bajo)}%</span> a{' '}
                <span className="tabular-nums">{fmtDec1(serie.banda.alto)}%</span>
                {serie.veredicto === 'sin-cambio' && serie.vara != null && (
                  <> — para decir que mejoró harían falta 3 turnos seguidos bajo{' '}
                    <span className="tabular-nums">{fmtDec1(serie.vara)}%</span></>
                )}
              </span>
            )}
          </p>
        </div>
      )}

    </Bloque>
  )
}

function FilaPareto({ r, max, turnos, abierta, onToggle }: {
  r: ParetoResult['rows'][number]
  max: number
  turnos: number
  abierta: boolean
  onToggle: () => void
}) {
  const agrupa = r.parts.length > 1
  /*
   * Una causa que aparece en menos de la mitad de los turnos se dibuja en gris:
   * pesa en minutos pero no es un patrón, y la diferencia tiene que verse sin
   * leer la cifra.
   */
  const cronica = r.shifts >= Math.ceil(turnos / 2)

  return (
    <li>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="min-w-0 truncate">
          {r.label}
          {agrupa && (
            <button
              type="button"
              onClick={onToggle}
              className="ml-1.5 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
            >
              {r.parts.length} causas
            </button>
          )}
        </span>
        <span className="shrink-0 tabular-nums font-semibold">
          {fmtMin(r.minutes)}
          <span className="ml-1 font-normal text-muted-foreground">{Math.round(r.sharePct)}%</span>
        </span>
      </div>

      <div className="mt-1 h-2 overflow-hidden rounded bg-muted">
        <div
          className={`h-full rounded ${cronica ? 'bg-sky-500 dark:bg-sky-400' : 'bg-muted-foreground/50'}`}
          style={{ width: `${(r.minutes / max) * 100}%` }}
        />
      </div>

      <div className="mt-0.5 flex flex-wrap gap-x-3 text-[10.5px] text-muted-foreground">
        {/* El dueño según el árbol oficial: cierra el círculo con «Qué pasó en
            el turno» — lo que se repite también dice de quién es. */}
        <span className={`font-semibold ${DUENO_UI[r.dueno].clase}`}>
          {DUENO_UI[r.dueno].corto}
        </span>
        <span className="tabular-nums">
          en <b className={cronica ? 'text-foreground/80' : ''}>{r.shifts} de {turnos}</b> turnos
        </span>
        {r.count > 0 && (
          <span className="tabular-nums">
            {fmtInt(r.count)} {r.count === 1 ? 'parada' : 'paradas'}
          </span>
        )}
        <span className="tabular-nums">acumulado {Math.round(r.cumPct)}%</span>
      </div>

      {abierta && agrupa && (
        <ul className="mt-1 space-y-0.5 border-l border-border pl-2.5 text-[11px] text-muted-foreground">
          {r.parts.map((p) => (
            <li key={p.reason} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{p.reason}</span>
              <span className="shrink-0 tabular-nums">{fmtMin(p.min)} · {p.count}×</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
