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
import type { CostoDeParadas } from '@/services/shoplogix/monitorPerdidas'
import { DUENO_META, type CausaDelTurno, type GrupoDelTurno } from '@/services/shoplogix/monitorEventos'
import { DUENO_UI } from './duenoUi'
import { resumenComparacion, type CompareResult } from '@/services/shoplogix/monitorCompare'
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
    <section className="rounded-2xl border border-border bg-card p-4">
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

/**
 * La referencia contra la que se compara: la cuota o un día anterior.
 *
 * Vive fuera de los componentes porque la usan DOS bloques —el comparador para
 * sus curvas y "por qué no llegamos" para el «cuándo se abrió»—, y si cada uno
 * resolviera la suya el gráfico podría estar comparando contra la cuota y la
 * brecha contra "lun 10": dos verdades a 20 px de distancia.
 */
export function referenciaDe(cmp: CompareResult, clave: string | null) {
  const anteriores = cmp.days.filter((d) => !d.esHoy)
  const efectiva = clave
    ?? (cmp.optimal ? 'cuota' : anteriores[0] ? anteriores[0].dateKey + anteriores[0].label : null)
  const dia = anteriores.find((d) => d.dateKey + d.label === efectiva) ?? null
  const contra = efectiva === 'cuota' && cmp.optimal
    ? { curva: cmp.optimal, nombre: 'la cuota' }
    : dia
    ? { curva: dia.curve, nombre: dia.label }
    : null
  return { clave: efectiva, contra }
}

/** «La colación» a partir de «COLACION»: el aviso habla, no grita. */
function nombreDeConvenio(reason: string): string {
  const bajo = reason.toLowerCase().replace(/\s+/g, ' ').trim()
  return 'La ' + (bajo === 'colacion' ? 'colación' : bajo)
}

function fmtDurMin(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m} min`
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/**
 * Por qué no llegamos: la brecha explicada, y a dónde se fue el tiempo.
 *
 * ── La resta que faltaba ────────────────────────────────────────────────────
 *
 * Este bloque y el comparador ya se rozaban sin tocarse: el comparador decía
 * "faltaron 1.081 pz" y este "52 min recuperables", en unidades distintas y sin
 * que nadie hiciera la cuenta. Al ritmo que la línea traía —13,5 pz/min andando
 * el 14-08— esos 52 minutos son ~700 piezas: el 65% de la brecha. Las otras 381
 * no son parada, es que ni andando alcanzaba.
 *
 * ⚠ Es una ESTIMACIÓN al ritmo del turno, y la pantalla lo dice con esas
 * palabras. No se usa el techo de la máquina (18 pz/min daría 936): eso es lo
 * que PODRÍA haber producido, no lo que habría producido.
 *
 * ⚠⚠ Las paradas de CONVENIO no entran en la cuenta. Contarlas daría "se
 * perdieron 1.550 pz" y es falso: en la colación no se puede producir, y la
 * cuota ya se reparte descontándola.
 *
 * ── La separación planificado / recuperable ────────────────────────────────
 *
 * Es el hallazgo que motivó el bloque: en el turno del 12-08 los 86 min de
 * detenciones grandes parecían el problema, y 78 eran colación, reunión de
 * inicio, ejercicio compensatorio y detención programada. Sin distinguirlos se
 * le pide a la línea que recupere un tiempo que por convenio no se recupera.
 */
export function TiempoDelTurno({
  tb, causaSel, onCausa, proximaParada, notas, brecha, cpmAndando, costo, grupos, notasTurno,
}: {
  tb: PublicMonitorLive['timeBreakdown']
  causaSel?: string | null
  onCausa?: (c: string | null) => void
  /** La próxima parada de convenio pronosticada: hora de reloj Y su nombre —
      «la próxima entra a las 12:50» obligaba a adivinar cuál. */
  proximaParada?: { hora: string; reason: string } | null
  /** Comentarios del operador agrupados por causa (ver `notasPorCausa`). */
  notas?: Map<string, Array<{ desde: string; texto: string }>>
  /** Piezas que faltan (o faltaron) para la meta. null si no hay meta. */
  brecha?: number | null
  /** Ritmo promedio de la línea ANDANDO. Respaldo cuando no hay `costo`. */
  cpmAndando?: number | null
  /**
   * Lo que costó cada parada, valorizada al ritmo que la línea traía en ese
   * momento (ver `monitorPerdidas.ts`). Es lo que se muestra; `cpmAndando`
   * queda solo como respaldo para las causas que no vengan calculadas.
   */
  costo?: CostoDeParadas | null
  /**
   * Los eventos del turno agrupados por dueno de la perdida (ver
   * `monitorEventos`). Es lo que se muestra; `tb.recoverable` queda solo para
   * los totales y para el reparto del tiempo plegado.
   */
  grupos?: GrupoDelTurno[]
  /**
   * Comentarios que Shoplogix marca para el turno COMPLETO (07:45-15:30).
   *
   * No cuelgan de ninguna parada, asi que hasta ahora se descartaban en
   * silencio: el 07-08 el operador anoto "Se abren guias de bronce baader 200"
   * -una falla mecanica- y no la vio nadie.
   */
  notasTurno?: string[]
}) {
  /* El reparto del tiempo pasa a DETALLE: la barra de 72/16/13% es el "cómo",
     y arriba va el "cuánto costó", que es lo que se viene a mirar. */
  const [abierto, setAbierto] = useState(false)
  if (!tb || tb.windowMin <= 0) return null

  const pct = (m: number) => Math.max(0, (m / tb.windowMin) * 100)
  // Lo que no cae en ninguna categoría (huecos de sincronización). Se dibuja
  // gris y sin etiqueta: no es producción ni una parada que alguien deba
  // explicar, pero tampoco se puede hacer desaparecer de la barra.
  const otros = Math.max(0, tb.windowMin - tb.producingMin - tb.plannedMin - tb.recoverableMin)

  /*
   * La resta. `perdidas` se topea a la brecha: si la línea anduvo por encima
   * del ritmo necesario, las paradas explican TODA la diferencia y un "700 de
   * 400" sería un número imposible en pantalla.
   */
  const cpm = cpmAndando && cpmAndando > 0 ? cpmAndando : null
  const porCausa = new Map((costo?.porCausa ?? []).map((c) => [c.reason, c]))
  /**
   * Piezas que costó una causa.
   *
   * ⚠ Al ritmo que la línea traía CUANDO paró, no al promedio del turno: el
   * promedio sobreestima —el 14-08, 719 pz contra 662 reales, un 8% de más— y
   * esa cifra se le imputa a Mantención. El respaldo al promedio solo entra
   * para causas que no vengan calculadas.
   */
  const sinRedondear = (reason: string, min: number) =>
    porCausa.get(reason)?.piezas ?? (cpm ? min * cpm : 0)
  /*
   * El total se SUMA de las mismas filas de abajo. Calcularlo aparte
   * (recoverableMin x promedio) daba un titular que no cuadraba con su propio
   * detalle, y lo que no cuadra se discute en vez de arreglarse.
   *
   * ⚠ Pero los minutos recuperables NO siempre están todos en la lista: en
   * vivo, la parada EN CURSO ya suma en `recoverableMin` y todavía no tiene
   * fila. Ese resto va al promedio del turno —no se sabe de qué causa es— y
   * sin él el titular se quedaría corto justo cuando la línea está parada.
   */
  const restoMin = Math.max(0, tb.recoverableMin - tb.recoverable.reduce((a, x) => a + x.min, 0))
  const crudas =
    cpm == null
      ? null
      : tb.recoverable.reduce((a, x) => a + sinRedondear(x.reason, x.min), 0) + restoMin * cpm
  const hayBrecha = brecha != null && brecha > 0
  const perdidas = crudas == null ? null : hayBrecha ? Math.min(crudas, brecha) : crudas
  const porRitmo = hayBrecha && perdidas != null ? Math.max(0, brecha - perdidas) : null
  const pctParadas = hayBrecha && perdidas != null ? (perdidas / brecha) * 100 : null
  // El rango de ritmos usados: es la evidencia de que cada parada se valorizó
  // distinto. Con una sola causa no hay rango que mostrar.
  const ritmos = (costo?.porCausa ?? []).map((c) => c.cpm)
  const rango = ritmos.length > 1 ? { min: Math.min(...ritmos), max: Math.max(...ritmos) } : null

  const gruposVisibles = (grupos ?? []).filter((g) => g.causas.length > 0)
  /*
   * "Ninguna falla de máquina" solo se puede afirmar si hubo paradas que
   * clasificar y ninguna cayó en Mantención. Con el turno entero sin paradas
   * la frase sería cierta pero vacía, y con el grupo presente sería falsa.
   */
  const sinFallaDeMaquina =
    gruposVisibles.some((g) => g.dueno !== 'programado') &&
    !gruposVisibles.some((g) => g.dueno === 'mantencion')
  const ultimoImputable = [...gruposVisibles].reverse().find((g) => g.dueno !== 'programado')?.dueno

  return (
    <Bloque
      id="tiempo"
      // El título depende de si hay algo que explicar: con la meta cumplida,
      // "Por qué no llegamos" sería un titular falso.
      titulo={hayBrecha ? 'Por qué no llegamos' : 'A dónde se va el tiempo'}
      extra={hayBrecha
        ? (
          <span className="tabular-nums font-semibold text-red-700 dark:text-red-400">
            −{fmtInt(brecha)} pz
          </span>
        )
        // Desde el fix de la rejilla (tbv 2), windowMin es el lapso REAL de
        // punta a punta — la MISMA medida que el "de turno" del comparador, así
        // que ahora comparten palabra a propósito. (Antes eran medidas
        // distintas y la palabra compartida parecía un error de suma.)
        : <span className="tabular-nums">{fmtDurMin(tb.windowMin)} de turno</span>}
    >
      {/* ── 1 · La resta ────────────────────────────────────────────────── */}
      {hayBrecha && perdidas != null && porRitmo != null && pctParadas != null && cpm != null && (
        <div className="mt-2">
          <p className="text-[13.5px] leading-snug text-foreground">
            De las <span className="tabular-nums font-semibold">{fmtInt(brecha)} pz</span> que
            faltaron,{' '}
            <span className="tabular-nums font-semibold text-red-700 dark:text-red-400">
              {fmtInt(perdidas)}
            </span>{' '}
            son <b>{fmtDurMin(tb.recoverableMin)} de paradas evitables</b> y{' '}
            <span className="tabular-nums font-semibold">{fmtInt(porRitmo)}</span>, ritmo por debajo
            del necesario.
          </p>
          <div className="mt-2 flex h-5 overflow-hidden rounded-lg text-[10px] font-semibold text-white">
            <span className="flex items-center justify-center bg-red-600 dark:bg-red-500"
              style={{ width: `${pctParadas}%` }}>
              {pctParadas > 22 && `${Math.round(pctParadas)}% paradas`}
            </span>
            <span className="flex items-center justify-center bg-slate-500"
              style={{ width: `${100 - pctParadas}%` }}>
              {100 - pctParadas > 22 && `${Math.round(100 - pctParadas)}% ritmo`}
            </span>
          </div>
          {/* Sin "habría cerrado 700 pz más arriba": era el MISMO 700 de la
              frase de arriba, reescrito. Queda solo el supuesto del cálculo. */}
          {/* ⚠ El supuesto va escrito: es la parte discutible del número, y
              quien lo discuta va a preguntar exactamente esto. */}
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">
            {costo
              ? (
                <>
                  Cada parada valorizada al ritmo que la línea traía justo antes
                  {rango && (
                    <>
                      {' '}(<span className="tabular-nums">{fmtDec(rango.min)}</span> a{' '}
                      <span className="tabular-nums">{fmtDec(rango.max)} pz/min</span>)
                    </>
                  )}
                  , no al promedio del turno (<span className="tabular-nums">{fmtDec(cpm)}</span>).
                </>
              )
              : (
                <>
                  Estimado al ritmo que la línea traía:{' '}
                  <span className="tabular-nums">{fmtDec(cpm)} pz/min</span> andando.
                </>
              )}
          </p>
        </div>
      )}

      {/* ── 2 · Qué pasó, agrupado por de quién es ─────────────────────── */}
      {/* Aire en vez de línea (§38): el espacio separa igual y con menos tinta. */}
      <div className={hayBrecha ? 'mt-4' : 'mt-2'}>
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Qué pasó en el turno
          {/* Los minutos solo si la resta de arriba no los dijo ya. */}
          {!hayBrecha && (
            <span className="normal-case tracking-normal">
              {' '}· {fmtDurMin(tb.recoverableMin)} recuperables
            </span>
          )}
        </p>

        {gruposVisibles.length === 0 && (
          <p className="mt-1 text-[11.5px] text-muted-foreground/60">nada por recuperar</p>
        )}

        {gruposVisibles.map((g) => (
          <div key={g.dueno}>
            <GrupoDeEventos
              g={g}
              sel={causaSel ?? null}
              onCausa={onCausa}
              notas={notas}
              proximaParada={g.dueno === 'programado' ? proximaParada : null}
              plannedMin={tb.plannedMin}
            />
            {/* ⚠ La frase que Mantención necesita poder decir. Va pegada al
                último grupo que se le puede imputar a alguien, no al final:
                después del convenio queda a tres dedos de distancia de los
                minutos que explica y se lee como un pie de página. */}
            {sinFallaDeMaquina && g.dueno === ultimoImputable && (
              <p className="mt-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                ✓ Ninguna parada por falla de máquina en este turno.
              </p>
            )}
          </div>
        ))}

        {/* El aviso de la próxima parada de convenio no puede depender de que
            YA haya habido una: el 14-08 los primeros 7 min planificados eran
            reunión de inicio y ejercicio, con la colación todavía por delante. */}
        {proximaParada && tb.plannedMin === 0 && (
          <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">
            Todavía sin paradas de convenio: {nombreDeConvenio(proximaParada.reason)} entra a las{' '}
            {/* ~ porque es la mediana de los turnos anteriores, no un pacto. */}
            <span className="tabular-nums">~{proximaParada.hora}</span>.
          </p>
        )}

        {notasTurno && notasTurno.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Anotado para todo el turno
            </p>
            <ul className="mt-1 space-y-0.5 border-l-2 border-emerald-600 pl-2">
              {notasTurno.map((t) => (
                <li key={t} className="text-[10.5px] leading-snug text-muted-foreground">{t}</li>
              ))}
            </ul>
          </div>
        )}

        {onCausa && gruposVisibles.length > 0 && (
          <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">
            Tocá una causa para ver sus paradas una por una.
          </p>
        )}
      </div>

      {/* ── 5 · El reparto del tiempo, plegado ─────────────────────────── */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="mt-2 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
        aria-expanded={abierto}
      >
        {abierto ? 'ocultar el reparto del tiempo' : 'ver el reparto del tiempo'}
      </button>

      {abierto && (
        <div className="mt-2">
          <div className="flex h-6 overflow-hidden rounded-lg text-[10px] font-semibold text-white">
            <span
              className="flex items-center justify-center bg-emerald-600 dark:bg-emerald-500"
              style={{ width: `${pct(tb.producingMin)}%` }}
              title={`Produciendo ${tb.producingMin} min`}
            >
              {pct(tb.producingMin) > 14 && `${Math.round(pct(tb.producingMin))}%`}
            </span>
            {/* En cero no se renderiza: un segmento de ancho 0 no se ve, pero su
                `title` seguía diciendo "Planificado 0 min" en el árbol de
                accesibilidad. */}
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

          <p className="mt-2 text-[10px] leading-snug text-muted-foreground/70">
            Los minutos son los que la causa estuvo activa en alguna máquina; la barra mide la
            LÍNEA, que solo se detiene cuando paran todas.
          </p>
        </div>
      )}
    </Bloque>
  )
}

/**
 * Un grupo de eventos: de quién es la pérdida, cuánto costó y sus causas.
 *
 * El primer nivel NO es "evitable / no evitable" sino de quién es, porque
 * evitable no significa de Mantención. El 14-08 los 662 pz evitables no tenían
 * ni un minuto de falla de máquina —eran operación, abastecimiento y paradas
 * que nadie imputó— y sin la separación la cifra se lee como si alguien de
 * Mantención hubiera fallado.
 */
function GrupoDeEventos({ g, sel, onCausa, notas, proximaParada, plannedMin }: {
  g: GrupoDelTurno
  sel: string | null
  onCausa?: (c: string | null) => void
  notas?: Map<string, Array<{ desde: string; texto: string }>>
  /** Solo en el grupo de convenio: cuándo entra la próxima, y cuál. */
  proximaParada?: { hora: string; reason: string } | null
  plannedMin: number
}) {
  // La paleta del dueño vive en UN lugar (duenoUi): este bloque y el Pareto
  // hablan el mismo color o el lenguaje se rompe.
  const color = DUENO_UI[g.dueno].clase
  const meta = DUENO_META[g.dueno]

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[10.5px] font-bold uppercase tracking-wide ${color}`}>
          {meta.label} <span className="font-normal normal-case tracking-normal opacity-70">· {meta.detalle}</span>
        </span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground">
          {fmtDurMin(g.min)}
          {g.piezas != null && (
            <>
              {' · '}
              <b className="text-red-700 dark:text-red-400">{fmtInt(g.piezas)} pz</b>
            </>
          )}
        </span>
      </div>
      <ul className="mt-0.5 space-y-0.5 pl-2 text-[11.5px]">
        {g.causas.map((c) => (
          <FilaEvento key={c.reason} c={c} sel={sel} onCausa={onCausa} notas={notas?.get(c.reason)} />
        ))}
      </ul>
      {/* ⚠ El aviso NO se apaga con la primera parada planificada: 7 min de
          reunión de inicio lo mataban con la colación todavía por delante. */}
      {proximaParada && plannedMin > 0 && (
        <p className="mt-1 pl-2 text-[10.5px] text-muted-foreground/70">
          {/* Con NOMBRE y en mayúscula inicial: la pregunta real es «¿cuándo es
              la colación?» y la respuesta tiene que decir colación. */}
          {nombreDeConvenio(proximaParada.reason)} entra a las{' '}
          <span className="tabular-nums">~{proximaParada.hora}</span>.
        </p>
      )}
    </div>
  )
}

/**
 * Una causa, con sus paradas adentro.
 *
 * El detalle va PLEGADO y no en una lista aparte: el turno del 14-08 tuvo 46
 * eventos y 23 eran microparadas de 12 segundos — la cronología completa entierra
 * las cuatro paradas que de verdad costaron piezas. Acá cada causa se abre sola.
 *
 * ⚠ Tocarla ya no salta al gráfico: si saltara, el detalle que se acaba de abrir
 * quedaría fuera de pantalla. La causa se marca igual en la serie, y el salto es
 * un toque más, explícito.
 */
function FilaEvento({ c, sel, onCausa, notas }: {
  c: CausaDelTurno
  sel: string | null
  onCausa?: (c: string | null) => void
  /**
   * Lo que el operador escribió sobre ESTA causa. La causa y su explicación son
   * la misma respuesta a "¿por qué paró?", así que van juntas.
   */
  notas?: Array<{ desde: string; texto: string }>
}) {
  const [abierta, setAbierta] = useState(false)
  const activa = sel === c.reason
  /*
   * Con muchas paradas, listarlas todas es la lista de 46 filas que estamos
   * evitando: se resume y se muestran las más largas, que son las que pesan.
   */
  const MUCHAS = 6
  const muchas = c.paradas.length > MUCHAS
  const visibles = muchas ? c.paradas.slice(0, 3) : c.paradas
  /*
   * ⚠ El resumen se calcula con el `count` de la FILA, no con la cantidad de
   * eventos que trae `paradas`: los dos números no coinciden —el 14-08 la fila
   * decía 23 microparadas y `stopEvents` traía 28— y verlos a 20 px de
   * distancia se lee como un error de cuenta. La lista de abajo son ejemplos
   * reales; el conteo manda el que usa todo el resto del bloque.
   */
  const cuantas = c.count || c.paradas.length
  const prom = cuantas > 0 ? (c.min / cuantas) * 60 : 0

  const cifras = (
    <span className="shrink-0 tabular-nums">
      {c.piezas != null && (
        <span className="font-semibold text-red-700 dark:text-red-400">{fmtInt(c.piezas)} pz</span>
      )}
      <span className="text-muted-foreground">
        {c.piezas != null ? ' · ' : ''}{Math.round(c.min)} min{c.count > 0 ? ` · ${c.count}×` : ''}
      </span>
    </span>
  )

  const nombre = (
    <span className="min-w-0 truncate">
      {c.reason}
      {c.paradas.length > 0 && <span className="ml-1 text-[9px] text-muted-foreground/70">{abierta ? '▾' : '▸'}</span>}
    </span>
  )

  return (
    <li>
      {onCausa && c.paradas.length > 0 ? (
        <button
          type="button"
          onClick={() => {
            setAbierta((v) => !v)
            onCausa(abierta ? null : c.reason)
          }}
          className={`flex w-full justify-between gap-2 rounded px-1 py-0.5 text-left ${
            activa ? 'bg-primary/[0.13] font-semibold text-brand-ink' : 'text-foreground hover:bg-muted'
          }`}
          aria-expanded={abierta}
        >
          {nombre}
          {cifras}
        </button>
      ) : (
        <div className="flex justify-between gap-2 px-1">{nombre}{cifras}</div>
      )}

      {/* La categoría del curso, para que la etiqueta no sea nuestra: si el
          árbol dice que ATASCAMIENTO es MMPP, nadie discute la fila. */}
      {c.categoria && (
        <p className="px-1 text-[9.5px] uppercase tracking-wide text-muted-foreground/70">
          {c.categoria}
          {c.extension && <span className="ml-1 normal-case tracking-normal">· fuera del curso</span>}
        </p>
      )}

      {abierta && c.paradas.length > 0 && (
        <div className="my-1 ml-2 border-l border-border pl-2">
          {muchas && (
            <p className="text-[10px] italic text-muted-foreground/70">
              {cuantas} paradas de {Math.round(prom)} s en promedio.
            </p>
          )}
          <ul className="space-y-px">
            {visibles.map((p, i) => (
              <li key={`${p.hora}-${i}`} className="flex gap-3 text-[10.5px] tabular-nums text-muted-foreground">
                <span className="text-muted-foreground/70">{p.hora}</span>
                <span>{fmtDec(p.min)} min</span>
              </li>
            ))}
          </ul>
          {muchas && <p className="text-[10px] italic text-muted-foreground/70">las 3 más largas</p>}
          <button
            type="button"
            onClick={() => {
              onCausa?.(c.reason)
              document.getElementById('grafico-turno')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
            className="mt-0.5 text-[10px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
          >
            ver en el gráfico
          </button>
        </div>
      )}

      {(notas ?? []).length > 0 && (
        <ul className="mt-0.5 space-y-0.5 border-l-2 border-sky-600 pl-2">
          {notas!.map((n, i) => (
            <li key={`${n.desde}-${i}`} className="text-[10.5px] leading-snug text-muted-foreground">
              <span className="tabular-nums">{n.desde}</span> · «{n.texto}»
            </li>
          ))}
        </ul>
      )}
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
export function ComparadorDias({ cmp, live, cone, ventana, onVentana, refSel, onRefSel }: {
  cmp: CompareResult
  live?: PublicMonitorLive
  /** Proyección al cierre, para dibujarla sobre la curva de hoy. */
  cone?: ConePoint[] | null
  /** Ventana visible compartida con el gráfico de velocidad. */
  ventana?: Ventana | null
  onVentana?: (v: Ventana | null) => void
  /** Contra qué se compara. Vive en el padre: el bloque "por qué no llegamos"
      usa la MISMA referencia para su «cuándo se abrió». */
  refSel?: string | null
  onRefSel: (clave: string) => void
}) {
  if (cmp.days.length === 0 || cmp.currentMinute == null) return null

  const { clave: claveSel } = referenciaDe(cmp, refSel ?? null)

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
              onSel={onRefSel}
              cone={cone}
            />
          </div>


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
            className="absolute h-1.5 rounded-full bg-primary/[0.6]"
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
