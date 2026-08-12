/**
 * Bloques del monitor público que responden "¿vamos a alcanzar, y contra qué".
 *
 * Viven fuera de `PublicShiftMonitorPage` porque esa página ya es larga y estos
 * dos son autocontenidos. Traen sus propios formateadores a propósito: el
 * bundle público no debe arrastrar los helpers del Grader, que se llevan echarts.
 */

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import { findGapWindow, type CompareResult } from '@/services/shoplogix/monitorCompare'
import { MonitorCompareChart } from './MonitorCompareChart'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

/**
 * Sección plegable del monitor.
 *
 * El monitor se mira en el celular de un supervisor, parado en planta: son ya
 * seis bloques y hay que scrollear para llegar al que interesa. Plegar los que
 * uno no está mirando es lo que lo hace usable en esa pantalla.
 *
 * El estado se guarda por `id` en `localStorage`, si no cada refresco (30 s)
 * volvería a abrir todo.
 */
export function Bloque({ id, titulo, extra, defaultAbierto = true, children }: {
  id: string
  titulo: string
  /** Dato que se sigue viendo con el bloque cerrado. */
  extra?: React.ReactNode
  defaultAbierto?: boolean
  children: React.ReactNode
}) {
  const clave = `monitor-bloque:${id}`
  const [abierto, setAbierto] = useState(() => {
    try {
      const v = localStorage.getItem(clave)
      return v == null ? defaultAbierto : v === '1'
    } catch {
      return defaultAbierto
    }
  })

  const toggle = () => {
    setAbierto((v) => {
      try { localStorage.setItem(clave, v ? '0' : '1') } catch { /* modo privado */ }
      return !v
    })
  }

  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={abierto}
      >
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {extra}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto ? '' : '-rotate-90'}`} />
        </span>
      </button>
      {abierto && children}
    </section>
  )
}

function fmtDurMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/**
 * A dónde se fue el tiempo del turno.
 *
 * La separación planificado / recuperable es el hallazgo que motivó esto: en el
 * turno del 12-08 de Filete los 86 min de detenciones grandes parecían el
 * problema, y 78 eran colación, reunión de inicio, ejercicio compensatorio y
 * detención programada. Sin distinguirlos se le pide a la línea que recupere un
 * tiempo que por convenio no se recupera.
 *
 * ⚠ Las causas van CON SU DETALLE en los dos grupos, a pedido de Orel: un
 * "planificado 78 min" a secas invita a sospechar que se esconde algo. Si la
 * colación se llevó 57 minutos, que se lea "COLACION 57 min · 4×".
 */
export function TiempoDelTurno({ tb, causaSel, onCausa }: {
  tb: PublicMonitorLive['timeBreakdown']
  causaSel?: string | null
  onCausa?: (c: string | null) => void
}) {
  const [abierto, setAbierto] = useState(false)
  if (!tb || tb.windowMin <= 0) return null

  const pct = (m: number) => Math.max(0, (m / tb.windowMin) * 100)
  // Lo que no cae en ninguna categoría (huecos de sincronización). Se dibuja
  // gris y sin etiqueta: no es producción ni una parada que alguien deba
  // explicar, pero tampoco se puede hacer desaparecer de la barra.
  const otros = Math.max(0, tb.windowMin - tb.producingMin - tb.plannedMin - tb.recoverableMin)

  return (
    <Bloque
      id="tiempo"
      titulo="A dónde se va el tiempo"
      extra={<span className="tabular-nums">{fmtDurMin(tb.windowMin)} de turno</span>}
    >
      <div className="mt-2 flex h-6 overflow-hidden rounded-lg text-[10px] font-semibold text-white">
        <span
          className="flex items-center justify-center bg-emerald-600 dark:bg-emerald-500"
          style={{ width: `${pct(tb.producingMin)}%` }}
          title={`Produciendo ${tb.producingMin} min`}
        >
          {pct(tb.producingMin) > 14 && `${Math.round(pct(tb.producingMin))}%`}
        </span>
        <span
          className="flex items-center justify-center bg-slate-500"
          style={{ width: `${pct(tb.plannedMin)}%` }}
          title={`Planificado ${tb.plannedMin} min`}
        >
          {pct(tb.plannedMin) > 14 && `${Math.round(pct(tb.plannedMin))}%`}
        </span>
        <span
          className="flex items-center justify-center bg-red-600 dark:bg-red-500"
          style={{ width: `${pct(tb.recoverableMin)}%` }}
          title={`Recuperable ${tb.recoverableMin} min`}
        >
          {pct(tb.recoverableMin) > 14 && `${Math.round(pct(tb.recoverableMin))}%`}
        </span>
        {otros > 0 && <span className="bg-muted-foreground/30" style={{ width: `${pct(otros)}%` }} />}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-500" />
          Produciendo <span className="tabular-nums text-foreground/80">{tb.producingMin} min</span>
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-slate-500" />
          Planificado <span className="tabular-nums text-foreground/80">{tb.plannedMin} min</span>
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-red-600 dark:bg-red-500" />
          Recuperable <span className="tabular-nums text-foreground/80">{tb.recoverableMin} min</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="mt-2 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
      >
        {abierto ? 'ocultar el detalle' : 'ver de qué son'}
      </button>

      {abierto && (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Planificado · no se recupera
            </p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {tb.planned.length === 0 && (
                <li className="text-muted-foreground/60">sin paradas de convenio</li>
              )}
              {tb.planned.map((x) => (
                <FilaCausa key={x.reason} x={x} sel={causaSel ?? null} onCausa={onCausa} />
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recuperable</p>
            <ul className="mt-1 space-y-0.5 text-[11px]">
              {tb.recoverable.length === 0 && (
                <li className="text-muted-foreground/60">nada por recuperar</li>
              )}
              {tb.recoverable.map((x) => (
                <FilaCausa key={x.reason} x={x} sel={causaSel ?? null} onCausa={onCausa} />
              ))}
            </ul>
          </div>
          {onCausa && (
            <p className="text-[10px] text-muted-foreground/70 sm:col-span-2">
              Tocá una causa para verla marcada en el gráfico del turno — así se ve
              CUÁNDO pasó, que es lo que explica el atraso.
            </p>
          )}
        </div>
      )}
    </Bloque>
  )
}

/**
 * Una causa del desglose. Clickeable cuando hay gráfico que marcar.
 *
 * Saber que la colación se llevó 57 min no dice nada por sí solo; lo que explica
 * el turno es CUÁNDO se los llevó. Al tocarla, el gráfico de arriba pinta esos
 * tramos — y la vista sube sola, porque en el celular el gráfico queda fuera de
 * pantalla y no se vería que algo cambió.
 */
function FilaCausa({ x, sel, onCausa }: {
  x: { reason: string; min: number; count: number }
  sel: string | null
  onCausa?: (c: string | null) => void
}) {
  const activa = sel === x.reason
  const contenido = (
    <>
      <span className="min-w-0 truncate">{x.reason}</span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {x.min} min · {x.count}×
      </span>
    </>
  )

  if (!onCausa) return <li className="flex justify-between gap-2">{contenido}</li>

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onCausa(activa ? null : x.reason)
          if (!activa) {
            document
              .getElementById('grafico-turno')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }}
        className={`flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left ${
          activa ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200' : 'text-foreground hover:bg-muted'
        }`}
      >
        {contenido}
      </button>
    </li>
  )
}

/** Colores de las líneas del comparador. Hoy siempre el primero. */
const COLORES = ['#38bdf8', '#a78bfa', '#94a3b8', '#f472b6']

/**
 * Comparador de días, a la MISMA ALTURA DE TURNO.
 *
 * Dos errores de lectura que esto impide:
 *   - "hoy llevamos 3.028 y ayer hizo 3.275" -> ayer eran las 15:30;
 *   - comparar por hora de RELOJ turnos que arrancan 07:45, 07:48 y 08:00.
 *
 * Por eso el eje son MINUTOS DESDE EL ARRANQUE y no la hora del reloj, que es
 * además como cuenta Shoplogix (confirmado por Orel, 12-08): la hora 1 va del
 * arranque a +60 min, no hasta el próximo cambio de hora.
 */
export function ComparadorDias({ cmp, live, onCausa }: {
  cmp: CompareResult
  live?: PublicMonitorLive
  onCausa?: (c: string | null) => void
}) {
  if (cmp.days.length === 0 || cmp.currentMinute == null) return null

  const hoy = cmp.days.find((d) => d.esHoy)
  const ref = hoy?.atCurrentMinute ?? null
  const hh = Math.floor(cmp.currentMinute / 60)
  const mm = cmp.currentMinute % 60

  return (
    <Bloque
      id="comparador"
      titulo="Comparado con otros días"
      extra={
        <span className="tabular-nums">
          {hh} h {String(mm).padStart(2, '0')} de turno
        </span>
      }
    >
          <div className="mt-2">
            <MonitorCompareChart cmp={cmp} />
          </div>

          <ul className="mt-2 space-y-1">
            {cmp.days.map((d, i) => {
              const dif =
                !d.esHoy && ref != null && d.atCurrentMinute != null ? ref - d.atCurrentMinute : null
              return (
                <li key={d.dateKey} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: COLORES[i % COLORES.length] }}
                  />
                  <span
                    className={`w-14 shrink-0 truncate ${d.esHoy ? 'font-semibold' : 'text-muted-foreground'}`}
                  >
                    {d.label}
                  </span>
                  <span className="flex-1 text-right tabular-nums">
                    {d.atCurrentMinute != null ? fmtInt(d.atCurrentMinute) : '—'}
                  </span>
                  {/* La diferencia contra hoy. Sin esto hay que restar de cabeza. */}
                  <span
                    className={`w-14 shrink-0 text-right tabular-nums text-[11px] ${
                      dif == null
                        ? 'text-transparent'
                        : dif >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {dif == null ? '—' : `${dif >= 0 ? '+' : ''}${fmtInt(dif)}`}
                  </span>
                  {/* El total al cierre de ese día. En HOY no va: el turno puede
                      estar en curso y "cerró 4.486" sería falso. */}
                  <span className="w-[4.2rem] shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-muted-foreground/60">
                    {d.esHoy ? '' : `cerró ${fmtInt(d.totalPieces)}`}
                  </span>
                </li>
              )
            })}

            {/* La cuota como una fila mas: cuanto separa a la realidad del
                objetivo, a esta misma altura de turno. */}
            {cmp.optimalAtCurrentMinute != null && cmp.optimalAtCurrentMinute > 0 && (
              <li className="flex items-center gap-2 border-t border-border pt-1.5 text-[12px]">
                <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-amber-500" />
                <span className="w-14 shrink-0 truncate text-amber-700 dark:text-amber-300">
                  Cuota
                </span>
                <span className="flex-1 text-right tabular-nums text-amber-700 dark:text-amber-300">
                  {fmtInt(cmp.optimalAtCurrentMinute)}
                </span>
                <span
                  className={`w-12 shrink-0 text-right tabular-nums text-[11px] ${
                    ref != null && ref - cmp.optimalAtCurrentMinute >= 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {ref != null
                    ? `${ref - cmp.optimalAtCurrentMinute >= 0 ? '+' : ''}${fmtInt(
                        ref - cmp.optimalAtCurrentMinute,
                      )}`
                    : '—'}
                </span>
                <span className="w-[4.2rem] shrink-0" />
              </li>
            )}
          </ul>

          <BrechaDelDia cmp={cmp} live={live} onCausa={onCausa} />

          <p className="mt-2 text-[11px] text-muted-foreground/70">
            Todos a la misma altura de turno, contada desde el arranque: los turnos no
            empiezan a la misma hora, así que comparar por reloj mide mal justamente el
            primer tramo.
          </p>
    </Bloque>
  )
}

/**
 * Dónde se abrió la brecha — el renglón que convierte la comparación en una
 * pregunta contestable.
 *
 * Ver la curva de hoy por debajo de la de ayer dice QUE se perdió, no DÓNDE. Y
 * la brecha casi nunca se abre pareja: se abre en un tramo y después se arrastra
 * planchada todo el turno. Con el tramo ubicado se lo cruza contra las
 * detenciones y contra lo que el operador escribió, y recién ahí se puede
 * responder "¿qué pasó que nos atrasó?".
 *
 * La referencia es el mejor de los días anteriores a esta misma altura. Si hoy
 * va arriba de todos, se compara contra la recta de la cuota — que igual hay que
 * alcanzar.
 */
function BrechaDelDia({ cmp, live, onCausa }: {
  cmp: CompareResult
  live?: PublicMonitorLive
  onCausa?: (c: string | null) => void
}) {
  const hoy = cmp.days.find((d) => d.esHoy)
  if (!hoy || cmp.currentMinute == null) return null

  const anteriores = cmp.days.filter((d) => !d.esHoy && d.atCurrentMinute != null)
  const mejor = anteriores.sort((a, b) => (b.atCurrentMinute ?? 0) - (a.atCurrentMinute ?? 0))[0]

  const contra =
    mejor && (mejor.atCurrentMinute ?? 0) > (hoy.atCurrentMinute ?? 0)
      ? { curva: mejor.curve, nombre: mejor.label }
      : cmp.optimal
      ? { curva: cmp.optimal, nombre: 'la cuota' }
      : null
  if (!contra) return null

  const g = findGapWindow(hoy.curve, contra.curva)
  if (!g) return null

  /*
   * Minutos de turno → hora de reloj. El arranque es el primer tramo con dato,
   * el mismo origen con el que se armó la curva; tomar `scheduledStart` correría
   * la ventana los minutos que la línea tardó en dar la primera pieza.
   */
  const t0 = live?.series?.[0]?.t ? Date.parse(live.series[0]!.t) : null
  const reloj = (min: number) =>
    t0 == null
      ? null
      : new Date(t0 + min * 60_000).toISOString().slice(11, 16)

  // La causa que más tiempo se llevó DENTRO de la ventana. Es la que le pone
  // nombre al bache; el resto son detalles.
  let causa: string | null = null
  let comentario: string | null = null
  if (t0 != null && live?.stopEvents && live.stopReasons) {
    const desde = t0 + g.fromMin * 60_000
    const hasta = t0 + g.toMin * 60_000
    const acc = new Map<string, number>()
    for (const e of live.stopEvents) {
      const a = Date.parse(e.f)
      const b = a + e.s * 1000
      const solape = Math.min(b, hasta) - Math.max(a, desde)
      if (solape > 0) {
        const r = live.stopReasons[e.r]
        if (r) acc.set(r, (acc.get(r) ?? 0) + solape)
      }
    }
    causa = [...acc.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null

    const c = (live.comments ?? []).find((x) => {
      if (!x.f) return false
      const a = Date.parse(x.f)
      const b = x.h ? Date.parse(x.h) : a
      return a < hasta && b > desde && b - a <= 2 * 60 * 60_000
    })
    comentario = c?.t ?? null
  }

  const desdeTxt = reloj(g.fromMin)
  const hastaTxt = reloj(g.toMin)

  return (
    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[12px]">
      <p className="text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Dónde se abrió la brecha con {contra.nombre}
      </p>
      <p className="mt-0.5 text-foreground">
        {desdeTxt && hastaTxt ? (
          <span className="tabular-nums font-semibold">{desdeTxt}–{hastaTxt}</span>
        ) : (
          <span className="tabular-nums font-semibold">
            del minuto {g.fromMin} al {g.toMin} de turno
          </span>
        )}
        {' · '}
        <span className="tabular-nums text-red-700 dark:text-red-400">−{fmtInt(g.lostPieces)} pz</span>
        {g.share > 0.15 && (
          <span className="text-muted-foreground">
            {' '}({Math.round(g.share * 100)}% del atraso)
          </span>
        )}
      </p>
      {causa && (
        <p className="mt-0.5">
          {onCausa ? (
            <button
              type="button"
              onClick={() => {
                onCausa(causa)
                document
                  .getElementById('grafico-turno')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              }}
              className="text-rose-700 underline underline-offset-2 dark:text-rose-300"
            >
              {causa}
            </button>
          ) : (
            <span className="text-rose-700 dark:text-rose-300">{causa}</span>
          )}
          <span className="text-muted-foreground"> es lo que más tiempo se llevó ahí</span>
        </p>
      )}
      {/* Lo que escribió el operador. Es el único texto en castellano del turno
          y suele explicar el bache mejor que cualquier etiqueta. */}
      {comentario && (
        <p className="mt-0.5 italic text-muted-foreground">{comentario}</p>
      )}
    </div>
  )
}
