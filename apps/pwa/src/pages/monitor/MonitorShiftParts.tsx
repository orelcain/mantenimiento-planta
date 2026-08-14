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
import { MAX_MAPE_PCT, type ConePoint, type ForecastResult } from '@/services/shoplogix/monitorForecast'
import { MonitorCompareChart } from './MonitorCompareChart'
import type { Ventana } from './useZoomGesto'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))
const nf1 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtDec = (n: number) => nf1.format(n || 0)

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
export function TiempoDelTurno({ tb, causaSel, onCausa, proximaParada, notas }: {
  tb: PublicMonitorLive['timeBreakdown']
  causaSel?: string | null
  onCausa?: (c: string | null) => void
  /** Hora de reloj de la próxima parada de convenio, ya formateada. */
  proximaParada?: string | null
  /** Comentarios del operador agrupados por causa (ver `notasPorCausa`). */
  notas?: Map<string, Array<{ desde: string; texto: string }>>
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
        {/* En cero no se renderiza: un segmento de ancho 0 no se ve, pero su
            `title` seguía diciendo "Planificado 0 min" en el árbol de
            accesibilidad — un lector de pantalla anunciaba justo el dato que
            se sacó de la leyenda por no aportar. */}
        {tb.plannedMin > 0 && (
          <span
            className="flex items-center justify-center bg-slate-500"
            style={{ width: `${pct(tb.plannedMin)}%` }}
            title={`Planificado ${tb.plannedMin} min`}
          >
            {pct(tb.plannedMin) > 14 && `${Math.round(pct(tb.plannedMin))}%`}
          </span>
        )}
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
        {/* Un chip en cero ocupa lugar para no decir nada, y peor: se lee como
            si el dato faltara. Cuando todavía no hubo paradas de convenio, la
            línea de abajo dice cuándo entra la próxima. */}
        {tb.plannedMin > 0 && (
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-slate-500" />
            Planificado <span className="tabular-nums text-foreground/80">{tb.plannedMin} min</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-red-600 dark:bg-red-500" />
          Recuperable <span className="tabular-nums text-foreground/80">{tb.recoverableMin} min</span>
        </span>
      </div>

      {/* ⚠ El aviso NO se apaga con la primera parada planificada.
          Visto el 14-08 a las 12:50 en Filete: `plannedMin` era 7 —2 min de
          reunión de inicio y 5 de ejercicio compensatorio— así que el aviso ya
          se había ido, y la colación, la parada de ~55 min que de verdad mueve
          la cuota, todavía no había ocurrido. La pregunta no es si hubo alguna
          parada de convenio, es si falta la próxima. */}
      {proximaParada && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {tb.plannedMin === 0
            ? 'Todavía sin paradas de convenio: la próxima entra a las '
            : 'La próxima parada de convenio entra a las '}
          <span className="tabular-nums">{proximaParada}</span>.
        </p>
      )}

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
                <FilaCausa key={x.reason} x={x} sel={causaSel ?? null} onCausa={onCausa} notas={notas?.get(x.reason)} />
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
                <FilaCausa key={x.reason} x={x} sel={causaSel ?? null} onCausa={onCausa} notas={notas?.get(x.reason)} />
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
function FilaCausa({ x, sel, onCausa, notas }: {
  x: { reason: string; min: number; count: number; lineMin?: number }
  sel: string | null
  onCausa?: (c: string | null) => void
  /**
   * Lo que el operador escribió sobre ESTA causa.
   *
   * Antes vivían tres bloques más abajo, en la bitácora: la pantalla decía
   * "FALLA OPERACIONAL 14 min" acá y "Ajuste erroneo de operador nuevo" a dos
   * pantallas de distancia. La causa y su explicación son la misma respuesta a
   * "¿por qué paró?", así que van juntas.
   */
  notas?: Array<{ desde: string; texto: string }>
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

  const notasDeLaCausa = (notas ?? []).length > 0 && (
    <ul className="mt-0.5 space-y-0.5 border-l-2 border-sky-500/30 pl-2">
      {notas!.map((n, i) => (
        <li key={`${n.desde}-${i}`} className="text-[10.5px] leading-snug text-muted-foreground">
          <span className="tabular-nums">{n.desde}</span> · «{n.texto}»
        </li>
      ))}
    </ul>
  )

  if (!onCausa) {
    return (
      <li>
        <div className="flex justify-between gap-2">{contenido}</div>
        {notasDeLaCausa}
      </li>
    )
  }

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
      {notasDeLaCausa}
    </li>
  )
}

/**
 * Los comentarios del operador, agrupados por la causa que anotan.
 *
 * Mismo criterio que la bitácora: sin texto no aporta, y un comentario que
 * cubre el turno entero (07:45→15:30) no describe una parada. Acá además se
 * cortan a dos por causa: son para explicar, no para leerlos todos — la
 * bitácora completa sigue existiendo abajo.
 */
export function notasPorCausa(
  comments: PublicMonitorLive['comments'],
  fmtHora: (iso: string) => string,
): Map<string, Array<{ desde: string; texto: string }>> {
  const MAX_DUR_MS = 2 * 60 * 60_000
  const out = new Map<string, Array<{ desde: string; texto: string }>>()
  for (const c of comments ?? []) {
    const texto = (c.t ?? '').trim()
    if (!texto || !c.r || !c.f) continue
    const a = Date.parse(c.f)
    if (Number.isNaN(a)) continue
    const b = c.h ? Date.parse(c.h) : a
    if (!Number.isNaN(b) && b - a > MAX_DUR_MS) continue
    const lista = out.get(c.r) ?? []
    if (lista.some((n) => n.texto === texto)) continue   // el mismo viene duplicado
    if (lista.length >= 2) continue
    lista.push({ desde: fmtHora(c.f), texto })
    out.set(c.r, lista)
  }
  return out
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
export function ComparadorDias({ cmp, live, onCausa, cone, ventana, onVentana }: {
  cmp: CompareResult
  live?: PublicMonitorLive
  onCausa?: (c: string | null) => void
  /** Proyección al cierre, para dibujarla sobre la curva de hoy. */
  cone?: ConePoint[] | null
  /** Ventana visible compartida con el gráfico de velocidad. */
  ventana?: Ventana | null
  onVentana?: (v: Ventana | null) => void
}) {
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

  const hh = Math.floor(cmp.currentMinute / 60)
  const mm = cmp.currentMinute % 60
  const resumen = resumenComparacion(cmp)

  return (
    <Bloque
      id="comparador"
      titulo="Comparado con otros días"
      /* Plegado por defecto: la respuesta corta —cuánto vamos contra la cuota—
         viaja en `extra` y se sigue viendo con el bloque cerrado. Quien quiere
         las curvas lo abre, y `Bloque` recuerda la elección. */
      defaultAbierto={false}
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
          <Veredicto cmp={cmp} cerrado={live?.shiftClosed ?? false} />

          <div className="mt-3">
            <MonitorCompareChart
              ventana={ventana}
              onVentana={onVentana}
              cmp={cmp}
              cerrado={live?.shiftClosed ?? false}
              claveSel={claveSel}
              onSel={setRefSel}
              cone={cone}
            />
          </div>


          <BrechaDelDia cmp={cmp} live={live} onCausa={onCausa} contra={contraSel} />

          {/* UNA sola nota. Antes eran tres diciendo variantes de lo mismo:
              una debajo de las tarjetas, otra acá y la de la brecha. */}
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground/70">
            Todo se lee a la misma altura de turno, no por hora de reloj: los turnos no arrancan
            a la misma hora, y esta diferencia cambia a medida que el turno avanza.
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
          const { causa } = explicar(g)
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
              {/* ⚠ El comentario del operador NO se repite acá.
                  Desde que va pegado a su causa en "A dónde se va el tiempo" y
                  completo en la bitácora, imprimirlo también en la brecha lo
                  mostraba TRES veces en la misma pantalla — «Falla
                  abastecimiento agua dulce» aparecía arriba, al medio y abajo.
                  Acá alcanza con la causa, que además marca el gráfico al
                  tocarla; el texto vive donde explica la causa. */}
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
function Veredicto({ cmp, cerrado }: {
  cmp: CompareResult
  cerrado: boolean
}) {
  const r = resumenComparacion(cmp)
  if (r.actual == null) return null

  const tono = (n: number) =>
    n >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'

  return (
    <div className="mt-2">
      {/*
        * Con el turno cerrado se habla en PASADO: "llevamos" con la línea
        * apagada suena a que alguien sigue contando, y el que abre el link a la
        * noche está leyendo un resultado, no un avance.
        */}
      {/*
        * ⚠ UNA sola frase con las piezas y las dos diferencias.
        *
        * Antes esto eran dos párrafos y dos tarjetas diciendo lo mismo cuatro
        * veces: las piezas, las dos diferencias, "mejor día" y "rango de los N
        * días" —que ya salían de las mismas cifras—. La altura del turno y el
        * "de las que X fueron producción real" se fueron: ese dato vive, con
        * más contexto, en "A dónde se va el tiempo".
        *
        * Lo que NO se toca: el número del OTRO va al lado de cada diferencia
        * (pedido de Orel, 12-08). "375 abajo de jue 13" no dice nada sin saber
        * que jue 13 llevaba 4.294 a esta misma altura.
        */}
      <p className="text-[14.5px] leading-snug text-foreground">
        <span className="text-[19px] font-bold tabular-nums">{fmtInt(r.actual)}</span>
        <span className="text-muted-foreground"> pz</span>
        {r.reciente && (
          <>
            {' · '}
            <span className={`font-semibold tabular-nums ${tono(r.reciente.dif)}`}>
              {fmtInt(Math.abs(r.reciente.dif))} {r.reciente.dif >= 0 ? 'arriba' : 'abajo'}
            </span>{' '}
            {r.reciente.mismoDia ? 'del turno anterior' : `de ${r.reciente.label}`}
            <span className="tabular-nums text-muted-foreground"> ({fmtInt(r.reciente.valor)})</span>
          </>
        )}
        {r.reciente && r.cuota && ' y'}
        {r.cuota && (
          <>
            {!r.reciente && ' · '}
            {' '}
            <span className={`font-semibold tabular-nums ${tono(r.cuota.dif)}`}>
              {fmtInt(Math.abs(r.cuota.dif))} {r.cuota.dif >= 0 ? 'arriba' : 'abajo'}
            </span>{' '}
            de la cuota
            {/* Lo que la cuota pide A ESTA ALTURA, no la meta del turno: la meta
                ya está arriba, y el número que explica la diferencia es este.
                Se compara REDONDEADO porque puede venir con decimales. */}
            {Math.round(r.cuota.meta ?? 0) !== Math.round(r.cuota.valor) && (
              <span className="tabular-nums text-muted-foreground"> ({fmtInt(r.cuota.valor)})</span>
            )}
          </>
        )}
        .
      </p>

      {/*
        * El rango de los días anteriores, en una línea en vez de dos tarjetas.
        * Contesta "¿es un mal día o el día de siempre?", que es lo único que
        * las tarjetas aportaban y no estaba ya en la frase de arriba.
        */}
      {r.rango && (
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {cerrado ? 'A esa altura' : 'A esta altura'} los{' '}
          <span className="tabular-nums">{r.rango.dias}</span> días anteriores fueron de{' '}
          <span className="tabular-nums text-foreground/80">{fmtInt(r.rango.min)}</span> a{' '}
          <span className="tabular-nums text-foreground/80">{fmtInt(r.rango.max)}</span>
          {r.mejor && <> · el mejor, {r.mejor.label}</>}.
        </p>
      )}

      {/* La aclaración de "misma altura de turno" vive UNA sola vez, al pie del
          bloque: acá era la segunda de tres diciendo lo mismo. */}
    </div>
  )
}

/**
 * Bitácora del turno: TODOS los comentarios del operador, no solo los que
 * caen en un tramo de brecha. Es el único texto en castellano que sube del
 * piso ("ERROR 801 SE REINICIA LA BAADER") y hasta ahora solo se leía si
 * coincidía con el peor tramo — lo anotado en cualquier otro momento no lo
 * leía nadie.
 *
 * El mismo texto partido en tramos contiguos se FUSIONA: el sensor corta el
 * comentario al cambiar de estado y "Se corre litografiado…" llega como
 * 14:46–14:49 y 14:50–14:57, que para quien lee es una sola anotación. Los
 * que cubren horas enteras no entran (misma regla que en las brechas: más de
 * 2 h no describe un evento, describe el turno).
 */
export function BitacoraOperador({ comments, onCausa }: {
  comments?: PublicMonitorLive['comments']
  onCausa?: (c: string | null) => void
}) {
  const MAX_DUR_MS = 2 * 60 * 60_000
  const GAP_FUSION_MS = 10 * 60_000
  const crudos = (comments ?? [])
    .map((c) => {
      const a = Date.parse(c.f ?? '')
      if (Number.isNaN(a)) return null
      const bRaw = c.h ? Date.parse(c.h) : a
      return { a, b: Number.isNaN(bRaw) ? a : bRaw, t: (c.t ?? '').trim(), r: c.r ?? null }
    })
    .filter((c): c is { a: number; b: number; t: string; r: string | null } =>
      c != null && c.t.length > 0 && c.b - c.a <= MAX_DUR_MS)
    .sort((x, y) => x.a - y.a)

  const filas: typeof crudos = []
  for (const c of crudos) {
    const u = filas[filas.length - 1]
    if (u && u.t === c.t && c.a - u.b <= GAP_FUSION_MS) u.b = Math.max(u.b, c.b)
    else filas.push({ ...c })
  }

  if (filas.length === 0) return null

  /* `f`/`h` vienen en la convención wall-clock-as-UTC del doc: la hora de
     planta ES la del ISO. Formatear con el reloj local la correría 3-4 h. */
  const hora = (ms: number) => new Date(ms).toISOString().slice(11, 16)

  return (
    <Bloque
      id="bitacora"
      titulo="Comentarios del operador"
      defaultAbierto={false}
      extra={<span className="tabular-nums">{filas.length}</span>}
    >
      <ul className="mt-2">
        {filas.map((c) => (
          <li key={c.a} className="border-t border-border/60 py-1.5 first:border-t-0">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
              <span className="tabular-nums font-semibold text-foreground">
                {hora(c.a)}{c.b > c.a ? `–${hora(c.b)}` : ''}
              </span>
              {/* La causa salta al gráfico, igual que en la brecha. */}
              {c.r && (onCausa ? (
                <button
                  type="button"
                  onClick={() => {
                    onCausa(c.r)
                    document
                      .getElementById('grafico-turno')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                  className="rounded-full bg-rose-500/15 px-2 py-px text-[10px] text-rose-700 dark:text-rose-300"
                >
                  {c.r}
                </button>
              ) : (
                <span className="rounded-full bg-rose-500/15 px-2 py-px text-[10px] text-rose-700 dark:text-rose-300">
                  {c.r}
                </span>
              ))}
            </p>
            <p className="mt-0.5 text-[12px] italic text-foreground/85">{c.t}</p>
          </li>
        ))}
      </ul>
    </Bloque>
  )
}

/**
 * Cierre estimado del turno, con su incertidumbre y su método.
 *
 * El número grande NUNCA va solo. Lo acompañan la banda (dónde terminaron los
 * turnos anteriores proyectados desde esta misma altura) y el error medido del
 * método en ESTA línea: un pronóstico desnudo se lee como promesa.
 *
 * El veredicto de la cuota es un CONTEO auditable —"ninguno de los 6 turnos
 * llegó desde acá"— y no una probabilidad: con esa muestra, un "72%" fingiría
 * una precisión que no existe.
 *
 * Ver `monitorForecast.ts` para por qué el método se elige por backtest y no
 * a mano (el mejor predictor se invierte entre Filete y Yal).
 */
export function PronosticoCierre({ f, meta, horizonte }: {
  f: ForecastResult | null
  meta: number | null
  /**
   * Hasta cuándo mide cada cierre.
   *
   * ⚠⚠ Sin esto la pantalla daba DOS cierres y ninguno decía hasta qué hora.
   * Visto en vivo el 14-08 a las 12:50 en Filete: "No se alcanza… cierra en
   * 4.501 pz (90%)" en la tarjeta de la meta y "5.011 pz — la meta entra" acá,
   * a tres tarjetas de distancia. Los dos correctos: uno proyecta al horario
   * (15:30) y el otro a lo que duraron los turnos anteriores (8 h 45). El
   * arreglo NO es elegir uno —la hora extra es una decisión que alguien toma—
   * sino escribir el horizonte al lado de cada número.
   */
  horizonte?: {
    /** Hora de reloj a la que llega el pronóstico. */
    hasta: string
    /** Cuánto dura ese turno típico, ya formateado ("8 h 45 min"). */
    dura: string
    /** El cierre del horario, cuando corta antes que el pronóstico. */
    horario: { hasta: string; piezas: number } | null
  } | null
}) {
  if (!f) return null

  /*
   * Por encima del umbral el bloque se calla. Un número con 20% de error a la
   * hora 1 quema la credibilidad del bloque para todo el resto del turno.
   */
  if (f.mapePct > MAX_MAPE_PCT) {
    return (
      <Bloque id="pronostico" titulo="Cierre estimado" defaultAbierto={false}
        extra={<span>todavía no</span>}>
        <p className="mt-2 text-[12px] text-muted-foreground">
          A esta altura el pronóstico erra{' '}
          <span className="tabular-nums text-foreground/80">{fmtDec(f.mapePct)}%</span> en esta
          línea — más adelante en el turno empieza a servir.
        </p>
      </Bloque>
    )
  }

  /*
   * Tres grados, no dos.
   *
   * ⚠ Visto en vivo el 14-08 con el turno de Filete a media mañana: con 1 de
   * 10 turnos por encima de la meta la pantalla decía "la meta entra" mientras
   * la tarjeta del ritmo, dos bloques más arriba, decía "no se alcanza". Ambas
   * eran correctas y juntas se leían como una contradicción. Un caso entre
   * diez no es "entra": es que se pudo una vez.
   */
  const proporcion = meta != null && f.hitsTarget != null && f.samples > 0
    ? f.hitsTarget / f.samples
    : null
  const grado: 'entra' | 'dificil' | 'no' =
    proporcion == null || proporcion === 0 ? 'no' : proporcion >= 1 / 3 ? 'entra' : 'dificil'

  const nombreMetodo = f.method === 'proporcional'
    ? 'proporcional'
    : f.method === 'aditivo' ? 'aditivo' : 'ritmo del turno'

  return (
    <Bloque
      id="pronostico"
      titulo="Cierre estimado"
      /* Plegado: su titular —cuánto cierra y hasta qué hora mide— ya lo dice la
         tarjeta de arriba. Acá queda el detalle auditable: la banda de los
         turnos anteriores, el método elegido y cuántos llegaron desde esta
         altura. El número sigue a la vista con el bloque cerrado. */
      defaultAbierto={false}
      extra={<span className="tabular-nums font-semibold text-sky-700 dark:text-sky-300">
        {fmtInt(f.estimate)} pz
      </span>}
    >
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[30px] font-bold leading-none tabular-nums">{fmtInt(f.estimate)}</span>
        <span className="text-[13px] font-semibold text-muted-foreground">
          pz ±{fmtDec(f.mapePct)}%
        </span>
      </div>

      {/* La banda, dibujada: dónde terminó cada turno anterior proyectado desde
          esta altura. Se angosta sola a medida que avanza el turno. */}
      <div className="mt-2 flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
        <span>{fmtInt(f.low)}</span>
        <span className="relative h-1.5 flex-1 rounded-full bg-muted">
          <span
            className="absolute h-1.5 rounded-full bg-sky-500/60"
            style={{ left: '0%', right: '0%' }}
          />
          {meta != null && meta >= f.low && meta <= f.high && (
            <span className="absolute -top-1 h-3.5 w-0.5 bg-amber-500"
              style={{ left: `${((meta - f.low) / Math.max(1, f.high - f.low)) * 100}%` }} />
          )}
        </span>
        <span>{fmtInt(f.high)}</span>
      </div>

      {/* El horizonte, escrito. Va pegado al número grande y ANTES del
          veredicto de la meta: sin él, "5.011 entra" contradice al "4.501 no
          alcanza" de la tarjeta de arriba sin que se pueda ver por qué. */}
      {horizonte && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Supone un turno como los últimos{' '}
          <span className="tabular-nums">{f.samples}</span> — {horizonte.dura}, hasta las{' '}
          <span className="tabular-nums text-foreground/90">{horizonte.hasta}</span>.
        </p>
      )}
      {horizonte?.horario && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Si corta a las{' '}
          <span className="tabular-nums text-foreground/90">{horizonte.horario.hasta}</span> del
          horario serían{' '}
          <span className="tabular-nums text-foreground/90">
            {fmtInt(horizonte.horario.piezas)} pz
          </span>
          {meta != null && meta > 0 && (
            <> ({Math.round((horizonte.horario.piezas / meta) * 100)}% de la meta)</>
          )}
          .
        </p>
      )}

      {meta != null && f.hitsTarget != null && (
        <p className={`mt-2 text-[13px] font-semibold ${
          grado === 'entra'
            ? 'text-emerald-800 dark:text-emerald-300'
            : 'text-amber-800 dark:text-amber-300'
        }`}>
          {grado === 'entra'
            ? horizonte?.horario
              // Con el horizonte a la vista, "entra" a secas volvería a chocar
              // con el "no alcanza" de la tarjeta de la meta: entra CON esa
              // duración, que es justamente lo que hay que decidir.
              ? `La meta de ${fmtInt(meta)} entra con esa duración: ${f.hitsTarget} de ${f.samples} turnos la superaron desde acá.`
              : `La meta de ${fmtInt(meta)} entra: ${f.hitsTarget} de ${f.samples} turnos la superaron desde acá.`
            : grado === 'dificil'
            ? `La meta de ${fmtInt(meta)} es difícil: solo ${f.hitsTarget} de ${f.samples} turnos la superó desde acá.`
            : `La meta de ${fmtInt(meta)} no entra: ninguno de los ${f.samples} turnos anteriores llegó desde esta altura.`}
        </p>
      )}

      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
        Método <span className="text-foreground/80">{nombreMetodo}</span> — el que menos se
        equivocó en esta línea, medido turno por turno sobre los últimos{' '}
        <span className="tabular-nums">{f.samples}</span>. Llevás{' '}
        <span className="tabular-nums text-foreground/80">{fmtInt(f.current)}</span>.
      </p>
    </Bloque>
  )
}
