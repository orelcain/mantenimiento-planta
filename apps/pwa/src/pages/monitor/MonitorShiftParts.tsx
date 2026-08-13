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
import {
  findGapWindows, resumenComparacion, type CompareResult, type PacePoint,
} from '@/services/shoplogix/monitorCompare'
import { MonitorCompareChart } from './MonitorCompareChart'
import { COLORES } from './monitorColors'

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
      // "de operación", no "de turno": esta ventana es el tiempo RASTREADO
      // (sin huecos de sensor), y el comparador usa "de turno" para el tiempo
      // corrido desde el arranque — la misma palabra para dos medidas parecía
      // un error de suma (6 h 3 vs 7 h 0 en la misma pantalla).
      extra={<span className="tabular-nums">{fmtDurMin(tb.windowMin)} de operación</span>}
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
          <p className="text-[10px] text-muted-foreground/70 sm:col-span-2">
            Los minutos son los que la causa estuvo activa en alguna máquina; la barra
            de arriba mide la LÍNEA, que solo se detiene cuando paran todas.
            {onCausa && ' Tocá una causa para ver en qué momento del turno ocurrió.'}
          </p>
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
  x: { reason: string; min: number; count: number; lineMin?: number }
  sel: string | null
  onCausa?: (c: string | null) => void
}) {
  const activa = sel === x.reason
  /*
   * Cuando la parada fue de UNA máquina y las otras siguieron, la línea no
   * perdió ese tiempo. Sin decirlo, la barra marca "recuperable 9 min" y acá
   * abajo se lee "KNURO 98 min", y parece que uno de los dos miente.
   */
  const frenoMenos = x.lineMin != null && x.lineMin < x.min
  const contenido = (
    <>
      <span className="min-w-0 truncate">
        {x.reason}
        {frenoMenos && (
          <span className="ml-1.5 text-[10px] text-muted-foreground/70">
            {x.lineMin === 0 ? 'la línea siguió' : `frenó ${x.lineMin} min`}
          </span>
        )}
      </span>
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
  /** La tabla día por día arranca plegada: primero la conclusión. */
  const [detalle, setDetalle] = useState(false)
  /*
   * La referencia elegida ('cuota' o dateKey+label de un día) vive ACÁ y no en
   * el gráfico: la brecha de abajo se calcula contra la MISMA referencia. El
   * estado arranca en null (el default se resuelve después del early return,
   * cuando `cmp.days` ya no puede venir vacío).
   */
  const [refSel, setRefSel] = useState<string | null>(null)

  if (cmp.days.length === 0 || cmp.currentMinute == null) return null

  const anterioresSel = cmp.days.filter((d) => !d.esHoy)
  const claveSel = refSel
    ?? (cmp.optimal ? 'cuota' : anterioresSel[0] ? anterioresSel[0].dateKey + anterioresSel[0].label : null)
  const diaSel = anterioresSel.find((d) => d.dateKey + d.label === claveSel) ?? null
  const contraSel = claveSel === 'cuota' && cmp.optimal
    ? { curva: cmp.optimal, nombre: 'la cuota' }
    : diaSel
    ? { curva: diaSel.curve, nombre: diaSel.label }
    : null

  const hoy = cmp.days.find((d) => d.esHoy)
  const ref = hoy?.atCurrentMinute ?? null
  const hh = Math.floor(cmp.currentMinute / 60)
  const mm = cmp.currentMinute % 60
  const resumen = resumenComparacion(cmp)

  return (
    <Bloque
      id="comparador"
      titulo="Comparado con otros días"
      /* Plegado, la altura del turno no dice nada; la diferencia contra la
         cuota sí, y es la razón por la que uno abriría el bloque. */
      extra={
        resumen.cuota
          ? (
            <span className={`tabular-nums font-semibold ${
              resumen.cuota.dif >= 0
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-700 dark:text-red-400'
            }`}>
              {resumen.cuota.dif >= 0 ? '+' : '−'}{fmtInt(Math.abs(resumen.cuota.dif))} vs cuota
            </span>
          )
          : <span className="tabular-nums">{hh} h {String(mm).padStart(2, '0')} de turno</span>
      }
    >
          <Veredicto
            cmp={cmp}
            cerrado={live?.shiftClosed ?? false}
            producingMin={live?.timeBreakdown?.producingMin ?? null}
          />

          <div className="mt-3">
            <MonitorCompareChart
              cmp={cmp}
              cerrado={live?.shiftClosed ?? false}
              claveSel={claveSel}
              onSel={setRefSel}
            />
          </div>

          <button
            type="button"
            onClick={() => setDetalle((v) => !v)}
            className="mt-2 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
          >
            {detalle ? 'ocultar los días' : `ver los ${cmp.days.length} días uno por uno`}
          </button>

          {detalle && (
          <ul className="mt-2 space-y-1">
            {/* Solo informativa: el "contra qui\u00e9n" del gr\u00e1fico se elige en sus
                chips, y duplicar esa selecci\u00f3n ac\u00e1 creaba dos verdades. */}
            {cmp.days.map((d) => {
              const dif =
                !d.esHoy && ref != null && d.atCurrentMinute != null ? ref - d.atCurrentMinute : null
              return (
                <li key={d.dateKey + d.label} className="flex items-center gap-2 px-1 text-[12px]">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: d.esHoy ? COLORES[0] : '#64748b' }}
                  />
                  <span className={`w-14 shrink-0 truncate ${d.esHoy ? 'font-semibold' : 'text-foreground/80'}`}>
                    {d.label}
                  </span>
                  <span className="flex-1 text-right tabular-nums">
                    {d.atCurrentMinute != null ? fmtInt(d.atCurrentMinute) : '\u2014'}
                  </span>
                  {/* La diferencia contra hoy. Sin esto hay que restar de cabeza. */}
                  <span
                    className={`w-12 shrink-0 text-right tabular-nums text-[11px] ${
                      dif == null
                        ? 'text-transparent'
                        : dif >= 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {dif == null ? '\u2014' : `${dif >= 0 ? '+' : ''}${fmtInt(dif)}`}
                  </span>
                  {/* El total al cierre de ese día. En HOY no va: el turno puede
                      estar en curso y "cerró 4.486" sería falso. */}
                  <span className="w-[4.2rem] shrink-0 whitespace-nowrap text-right text-[10px] tabular-nums text-muted-foreground/60">
                    {d.esHoy ? '' : `cerró ${fmtInt(d.totalPieces)}`}
                  </span>
                </li>
              )
            })}

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
          )}

          <BrechaDelDia cmp={cmp} live={live} onCausa={onCausa} contra={contraSel} />

          <p className="mt-2 text-[11px] text-muted-foreground/70">
            {detalle && 'Tocá un día para mostrarlo u ocultarlo en el gráfico. '}
            Todos se leen a la misma
            altura de turno, contada desde el arranque: los turnos no
            empiezan a la misma hora, así que comparar por reloj mide mal justamente el
            primer tramo.
          </p>
    </Bloque>
  )
}

/**
 * Dónde se abrió la brecha — el bloque que convierte la comparación en una
 * pregunta contestable.
 *
 * Ver la curva de hoy por debajo de la de ayer dice QUE se perdió, no DÓNDE. Y
 * muchas veces el atraso se repartió en dos o tres golpes distintos: mostrar
 * solo el peor cuenta la mitad de la historia. Cada tramo se cruza contra las
 * detenciones y contra lo que el operador escribió, y recién ahí se puede
 * responder "¿qué pasó que nos atrasó?".
 *
 * La referencia es LA MISMA que el chip del comparador (v3): con el gráfico
 * comparando contra la cuota y esta lista contra "lun 10" eran dos verdades a
 * 20 px de distancia. Si contra la referencia elegida hoy no perdió terreno,
 * el bloque simplemente no aparece.
 */
function BrechaDelDia({ cmp, live, onCausa, contra }: {
  cmp: CompareResult
  live?: PublicMonitorLive
  onCausa?: (c: string | null) => void
  contra: { curva: PacePoint[]; nombre: string } | null
}) {
  const hoy = cmp.days.find((d) => d.esHoy)
  if (!hoy || cmp.currentMinute == null || !contra) return null

  // Hasta 3 tramos; el filtro del 10% del atraso ya viene hecho del servicio.
  const ventanas = findGapWindows(hoy.curve, contra.curva, 3)
  if (ventanas.length === 0) return null

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

  /** La causa que más tiempo se llevó dentro de la ventana, y el comentario. */
  const explicar = (g: { fromMin: number; toMin: number }) => {
    if (t0 == null || !live?.stopEvents || !live.stopReasons) {
      return { causa: null as string | null, comentario: null as string | null }
    }
    const desde = t0 + g.fromMin * 60_000
    const hasta = t0 + g.toMin * 60_000
    const acc = new Map<string, number>()
    for (const e of live.stopEvents) {
      const a = Date.parse(e.f)
      const b = a + e.s * 1000
      const solape = Math.min(b, hasta) - Math.max(a, desde)
      if (solape > 0) {
        const rr = live.stopReasons[e.r]
        if (rr) acc.set(rr, (acc.get(rr) ?? 0) + solape)
      }
    }
    const causa = [...acc.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null
    const c = (live.comments ?? []).find((x) => {
      if (!x.f) return false
      const a = Date.parse(x.f)
      const b = x.h ? Date.parse(x.h) : a
      return a < hasta && b > desde && b - a <= 2 * 60 * 60_000
    })
    return { causa, comentario: c?.t ?? null }
  }

  return (
    <div className="mt-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[12px]">
      <p className="text-[10px] uppercase tracking-wide text-amber-800 dark:text-amber-300">
        Dónde se abrió la brecha con {contra.nombre}
      </p>

      <ul className="mt-1 space-y-1.5">
        {ventanas.map((g) => {
          const { causa, comentario } = explicar(g)
          const desdeTxt = reloj(g.fromMin)
          const hastaTxt = reloj(g.toMin)
          return (
            <li key={g.fromMin}>
              <p className="text-foreground">
                {desdeTxt && hastaTxt ? (
                  <span className="tabular-nums font-semibold">{desdeTxt}–{hastaTxt}</span>
                ) : (
                  <span className="tabular-nums font-semibold">
                    min {g.fromMin}–{g.toMin} de turno
                  </span>
                )}
                {' · '}
                <span className="tabular-nums text-red-700 dark:text-red-400">
                  −{fmtInt(g.lostPieces)} pz
                </span>
                {/* El % solo cuando hay varios tramos: "100% de lo perdido"
                    en un tramo único no agrega nada. */}
                {ventanas.length > 1 && (
                  <span className="text-muted-foreground">
                    {' '}({Math.round(g.share * 100)}% de lo perdido)
                  </span>
                )}
                {causa && (
                  <>
                    {' · '}
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
                  </>
                )}
              </p>
              {/* Lo que escribió el operador: el único texto en castellano del
                  turno, y suele explicar el bache mejor que la etiqueta. */}
              {comentario && (
                <p className="mt-0.5 italic text-muted-foreground">{comentario}</p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * La conclusión del comparador, arriba y en palabras.
 *
 * Lo que fallaba: el bloque abría con seis filas de números y dejaba la
 * conclusión a cargo de quien mira, que tiene que restar de cabeza parado en
 * planta. Acá la primera línea ya dice si vas mejor o peor, y contra qué; los
 * días quedan abajo, plegados, para el que quiera hurgar.
 *
 * Dos varas distintas a propósito: el día MÁS RECIENTE es con el que la gente
 * compara sola ("ayer a esta hora"), y el MEJOR es la que dice si el turno
 * bueno era alcanzable. La cuota es la tercera y no se negocia.
 */
function Veredicto({ cmp, cerrado, producingMin }: {
  cmp: CompareResult
  cerrado: boolean
  /** Minutos que la L\u00cdNEA produjo de verdad (timeBreakdown), para decir cu\u00e1nto
      de la altura del turno fue producci\u00f3n real y cu\u00e1nto parada. */
  producingMin?: number | null
}) {
  const r = resumenComparacion(cmp)
  if (r.actual == null) return null

  const tono = (n: number) =>
    n >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
  const conSigno = (n: number) => `${n >= 0 ? '+' : '\u2212'}${fmtInt(Math.abs(n))}`
  const fmtHm = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
  const altura = r.minutos != null ? fmtHm(r.minutos) : null
  // Solo si aporta: con la l\u00ednea produciendo el turno completo, repetir la
  // misma cifra dos veces no dice nada.
  const real = producingMin != null && r.minutos != null && producingMin < r.minutos
    ? fmtHm(producingMin)
    : null

  return (
    <div className="mt-2">
      {/*
        * Con el turno cerrado se habla en PASADO: "llevamos" con la línea
        * apagada suena a que alguien sigue contando, y el que abre el link a la
        * noche está leyendo un resultado, no un avance.
        */}
      <p className="text-[15px] font-semibold leading-snug text-foreground">
        {cerrado ? 'Se lograron ' : 'Llevamos '}
        <span className="tabular-nums">{fmtInt(r.actual)} pz</span>
        {altura && (
          <span className="font-normal text-muted-foreground">
            {cerrado ? ` en ${altura} de turno` : ` a ${altura} de turno`}
            {/* Pedido de Orel (13-ago): decir cuánto de esa altura fue
                producción de verdad — el resto son paradas, y es la brecha
                que Mantención puede mostrar y atacar. */}
            {real && (cerrado
              ? `, de las que ${real} fueron de producción real`
              : `, con ${real} de producción real`)}
          </span>
        )}
        .
      </p>

      {/*
        * Cada comparación con el número del otro al lado. "Vas 1.083 arriba de
        * mar 11" no dice nada si no se sabe que mar 11 llevaba 3.403 a esta
        * misma altura — y ese valor es el que se mueve durante el turno.
        */}
      <p className="mt-1 text-[13.5px] leading-snug text-foreground/90">
        {r.reciente && (
          <>
            {cerrado ? 'Fueron' : 'Vamos'}{' '}
            <span className={`font-semibold tabular-nums ${tono(r.reciente.dif)}`}>
              {fmtInt(Math.abs(r.reciente.dif))} pz {r.reciente.dif >= 0 ? 'arriba' : 'abajo'}
            </span>{' '}
            {r.reciente.mismoDia ? 'del turno anterior' : `de ${r.reciente.label}`}, que a
            {cerrado ? ' la misma altura' : ' esta altura'} llevaba{' '}
            <span className="tabular-nums">{fmtInt(r.reciente.valor)}</span>
          </>
        )}
        {r.reciente && r.cuota && ', y '}
        {r.cuota && (
          <>
            {!r.reciente && (cerrado ? 'Fueron ' : 'Vamos ')}
            <span className={`font-semibold tabular-nums ${tono(r.cuota.dif)}`}>
              {fmtInt(Math.abs(r.cuota.dif))} pz {r.cuota.dif >= 0 ? 'arriba' : 'abajo'}
            </span>{' '}
            de la cuota
            {r.cuota.meta ? <> de <span className="tabular-nums">{fmtInt(r.cuota.meta)}</span></> : null}
            {/* Al final del turno la cuota ya pide el total: repetirlo sobra.
                Se compara REDONDEADO — la meta puede venir con decimales de
                Shoplogix y "de 17.908, que pide 17.908" es la misma cifra. */}
            {Math.round(r.cuota.meta ?? 0) !== Math.round(r.cuota.valor) && (
              <>
                , que a {cerrado ? 'esa altura pedía' : 'esta altura pide'}{' '}
                <span className="tabular-nums">{fmtInt(r.cuota.valor)}</span>
              </>
            )}
          </>
        )}
        .
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-2">
        {r.mejor && (
          <div className="rounded-xl border border-border bg-muted/60 px-2.5 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Mejor día a esta altura
            </dt>
            <dd className={`mt-0.5 text-lg font-bold tabular-nums ${tono(r.mejor.dif)}`}>
              {conSigno(r.mejor.dif)}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                vs {r.mejor.label} ({fmtInt(r.mejor.valor)})
              </span>
            </dd>
          </div>
        )}
        {r.cuota && (
          <div className="rounded-xl border border-border bg-muted/60 px-2.5 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Para la cuota
            </dt>
            <dd className={`mt-0.5 text-lg font-bold tabular-nums ${tono(r.cuota.dif)}`}>
              {conSigno(r.cuota.dif)}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                {cerrado ? 'pedía' : 'pide'} {fmtInt(r.cuota.valor)}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {/* Que quede dicho que el número se mueve: no es el total del otro día. */}
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
        {cerrado
          ? 'Comparado a la misma altura de turno: un día que duró más pudo cerrar con otro total.'
          : 'Esta diferencia cambia durante el turno: se compara contra lo que cada día llevaba a esta MISMA altura, no contra el total con que cerró.'}
      </p>
    </div>
  )
}
