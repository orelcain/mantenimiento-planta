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
import { VENTANAS, type ContextoPareto, type ParetoResult, type PuntoTendencia, type Ventana as VentanaPareto } from '@/services/shoplogix/monitorPareto'
import { nombreDeDia } from '@/services/shoplogix/monitorVsAyer'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

/** "2 h 6 min" a partir de minutos, para totales que pasan la hora. */
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDec1 = (n: number) => nf1.format(n || 0)

/** «Turno Dia» → «Día». El prefijo se repite en todos y no aporta. */
function nombreCortoTurno(id: string): string {
  const t = id.replace(/^turno\s+/i, '').trim()
  if (/^dia$/i.test(t)) return 'Día'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function fmtMin(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r > 0 ? `${h} h ${r} min` : `${h} h`
}

export function ParetoDeParadas({
  pareto, ctx, tendencia, porTurno, ventana, onVentana, turno, onTurno,
}: {
  pareto: ParetoResult | null
  /** El marco temporal de los MISMOS turnos del ranking. */
  ctx?: ContextoPareto | null
  /** La serie de la tendencia (hoy, los mismos turnos que el ranking). */
  tendencia?: ContextoPareto | null
  /** Un contexto por nombre de turno: la comparación «Día vs Noche». */
  porTurno?: Array<{ turno: string; ctx: ContextoPareto }>
  /** Cuántos turnos se miran. null = todos los que haya. */
  ventana?: VentanaPareto
  onVentana?: (v: VentanaPareto) => void
  /** Qué turno se mira, o 'todos' para verlos juntos. */
  turno?: string | 'todos' | null
  onTurno?: (t: string | 'todos' | null) => void
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const [porQueMediana, setPorQueMediana] = useState(false)
  // Con uno o dos turnos no hay patrón que mostrar, solo el turno de hoy otra
  // vez. Tres es el mínimo para que "en 2 de 3" signifique algo.
  if (!pareto || pareto.shifts < 3 || pareto.rows.length === 0) return null

  /* Los turnos que de verdad se están midiendo: los que produjeron. */
  const turnosMedidos = ctx?.turnos ?? pareto.shifts
  const max = pareto.rows[0]!.minutes
  const vitales = pareto.rows.slice(0, Math.max(1, pareto.vitalCount))
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
      /* ⚠ El conteo lo manda el CONTEXTO, no el ranking: `pareto.shifts` cuenta
         las entradas de la muestra —incluido un sábado con la línea apagada y
         cero causas— y decía «7 turnos» al lado de una barra que medía 6. */
      extra={
        <span className="tabular-nums">
          {turnosMedidos} turnos{ctx && ctx.ventanaMin > 0 && ` · ${fmtDec1(ctx.pct)}%`}
        </span>
      }
      defaultAbierto={false}
    >
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Tiempo <b>recuperable</b> de los últimos <span className="tabular-nums">{turnosMedidos}</span>{' '}
        turnos de esta línea, por causa. Las paradas de convenio no entran: no son pérdidas que
        alguien pueda atacar.
      </p>

      {/* ── El marco: cuánto tiempo se está midiendo ──────────────────────
          Sin esto, «5 h 48 min» no dice nada: no se sabe si es mucho o poco.
          El 100% es el tiempo TOTAL de los turnos, con el convenio A LA VISTA
          (decisión de Orel) — escondido en el denominador, nadie notaría que
          la colación creció. */}
      {/* Cuántos turnos y cuál: los dos controles que Orel pidió. Solo
          aparecen cuando hay de dónde elegir — con un turno corriendo y pocos
          datos, un selector con una sola opción es ruido. */}
      {(onVentana || (onTurno && (porTurno?.length ?? 0) > 1)) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {onVentana && VENTANAS.map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => onVentana(v)}
              className={`min-h-[32px] rounded-full px-2.5 text-[12px] tabular-nums ${
                ventana === v ? 'bg-primary/[0.13] font-semibold text-brand-ink' : 'bg-muted text-muted-foreground'
              }`}
            >
              {v == null ? 'todos' : v}
            </button>
          ))}
          {onTurno && (porTurno?.length ?? 0) > 1 && (
            <>
              <span className="mx-0.5 h-4 w-px bg-border" />
              {[...(porTurno ?? []).map((x) => x.turno), 'todos'].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => onTurno(t as string | 'todos')}
                  className={`min-h-[32px] rounded-full px-2.5 text-[12px] ${
                    turno === t ? 'bg-primary/[0.13] font-semibold text-brand-ink' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {t === 'todos' ? 'los dos' : nombreCortoTurno(t)}
                </button>
              ))}
            </>
          )}
        </div>
      )}

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

      {/*
        * UNA lista agrupada con TODAS las causas (§5.2): superficie propia,
        * separadores hairline y nada escondido. Antes eran dos listas con
        * formatos distintos —las «vitales» con barra y la cola en texto— y la
        * conclusión partiéndolas al medio. El corte del 80% sigue estando,
        * pero como una MARCA entre filas, no como un tajo.
        */}
      <ul className="mt-4 overflow-hidden rounded-[14px] bg-muted/50">
        {pareto.rows.map((r, i) => (
          <div key={r.label}>
            {/* Sin marca del corte 80/20: la lista ya está ordenada y cada fila
                dice su % — el separador partía en dos algo que se lee de
                corrido, y el «resto» sonaba a sobra en vez de a cola larga. */}
            <div className={i > 0 ? 'border-t border-border/50' : ''}>
              <FilaPareto
                r={r} max={max} turnos={turnosMedidos} ventanaMin={ctx?.ventanaMin}
                abierta={abierta === r.label}
                onToggle={() => setAbierta((v) => (v === r.label ? null : r.label))}
              />
            </div>
          </div>
        ))}
      </ul>

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
              {serie.banda && (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => setPorQueMediana((v) => !v)}
                    className="underline decoration-dotted underline-offset-2 text-brand-ink"
                    aria-expanded={porQueMediana}
                  >
                    mediana <span className="tabular-nums">{fmtDec1(serie.banda.mediana)}%</span> ⓘ
                  </button>
                </>
              )}
            </span>
          </p>

          {/* Por qué la mediana y no el promedio: la pregunta que se hace
              cualquiera que mire el número, contestada con SUS datos. */}
          {porQueMediana && serie.banda && (
            <div className="mt-2 rounded-[10px] bg-muted p-2.5 text-[12px] leading-snug text-muted-foreground">
              <p>
                <b className="text-foreground">Mediana</b>: el valor del medio. La mitad de los
                turnos estuvo por debajo de{' '}
                <span className="tabular-nums">{fmtDec1(serie.banda.mediana)}%</span> y la otra
                mitad por encima.
              </p>
              {serie.promedio != null && (
                <p className="mt-1.5">
                  <b className="text-foreground">Promedio</b>: sumar todo y dividir. Da{' '}
                  <span className="tabular-nums">{fmtDec1(serie.promedio)}%</span>
                  {Math.abs(serie.promedio - serie.banda.mediana) >= 0.3 && (
                    <>
                      , más alto que la mediana porque{' '}
                      <b className="text-foreground">un solo turno malo lo arrastra</b>: el peor de
                      estos {serie.serie.length} llegó a{' '}
                      <span className="tabular-nums">
                        {fmtDec1(Math.max(...serie.serie.map((p) => p.pct)))}%
                      </span>
                      {' '}y sube el promedio de todos
                    </>
                  )}
                  .
                </p>
              )}
              <p className="mt-1.5">
                Por eso la referencia es la mediana: describe el turno <b>típico</b>, no se mueve
                por un día suelto, y así una mejora de verdad se nota en vez de quedar tapada.
              </p>
            </div>
          )}

          <div className="relative mt-3 h-[104px]">
            {/* La mediana, para tener contra qué comparar cada barra. Su cifra
                va en el encabezado: flotando sobre la línea pisaba el % de la
                barra que quedara debajo. */}
            {serie.banda && (
              <div className="absolute inset-x-0 border-t border-dashed border-muted-foreground/[0.5]"
                style={{ bottom: `${(serie.banda.mediana / maxPct) * 100}%` }} />
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

function FilaPareto({ r, max, turnos, ventanaMin, abierta, onToggle }: {
  r: ParetoResult['rows'][number]
  max: number
  turnos: number
  /** Minutos totales de la muestra: el 100% del bloque entero. */
  ventanaMin?: number
  abierta: boolean
  onToggle: () => void
}) {
  const agrupa = r.parts.length > 1
  /*
   * Una causa que aparece en menos de la mitad de los turnos NO es un patrón:
   * pesa en minutos pero pasó suelta. Antes eso se decía apagando la barra a
   * gris; ahora la barra lleva el color del DUEÑO —que es más información— y
   * lo crónico se dice donde corresponde: en el texto, «en 6 de 6 turnos».
   */
  const cronica = r.shifts >= Math.ceil(turnos / 2)
  const ui = DUENO_UI[r.dueno]

  return (
    <li>
      {/*
        * TODAS las causas llevan barra, también las chicas (pedido de Orel):
        * sin ella hay que leer «5 min · 1%» para saber que no pesa, y la
        * comparación entre filas se pierde. La barra es fina y del color del
        * dueño, así una fila dice cuánto Y de quién sin leer una palabra.
        */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        className="w-full px-3 py-2 text-left"
      >
        <span className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] text-foreground">{r.label}</span>
          {/*
            * ⚠ El % es del TIEMPO DE LOS TURNOS, el mismo 100% que el número
            * grande de arriba — así la columna SUMA ese número (pedido de
            * Orel). Antes era el % de lo recuperable y sumaba 100%: dos
            * denominadores a diez centímetros, y el «32%» no se entendía de
            * qué era. Con un decimal, porque las causas chicas dan 0,2%.
            */}
          <span className="shrink-0 text-[13px] tabular-nums font-semibold text-foreground">
            {fmtMin(r.minutes)}
            {ventanaMin != null && ventanaMin > 0 && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                {fmtDec1((r.minutes / ventanaMin) * 100)}%
              </span>
            )}
          </span>
        </span>
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted-foreground/[0.15]">
          <span
            className={`block h-full rounded-full ${ui.barra} ${cronica ? '' : 'opacity-60'}`}
            style={{ width: `${Math.max(2, (r.minutes / max) * 100)}%` }}
          />
        </span>
        <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[11px]">
          {/* El dueño según el árbol oficial: cierra el círculo con «Qué pasó
              en el turno» — lo que se repite también dice de quién es. */}
          <span className={`font-semibold ${ui.clase}`}>{ui.corto}</span>
          <span className="tabular-nums text-muted-foreground">
            en <b className={cronica ? 'text-foreground/80' : ''}>{r.shifts} de {turnos}</b> turnos
          </span>
          {r.count > 0 && (
            <span className="tabular-nums text-muted-foreground">
              {fmtInt(r.count)} {r.count === 1 ? 'parada' : 'paradas'}
            </span>
          )}
          {agrupa && (
            <span className="ml-auto shrink-0 text-brand-ink">
              {abierta ? 'ocultar' : `${r.parts.length} causas`}
            </span>
          )}
        </span>
      </button>

      {abierta && agrupa && (
        <ul className="space-y-0.5 px-3 pb-2 pl-6 text-[11px] text-muted-foreground">
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
