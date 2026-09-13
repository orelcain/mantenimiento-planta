/**
 * Bloques del monitor público que responden "¿vamos a alcanzar, y contra qué".
 *
 * Viven fuera de `PublicShiftMonitorPage` porque esa página ya es larga y estos
 * dos son autocontenidos. Traen sus propios formateadores a propósito: el
 * bundle público no debe arrastrar los helpers del Grader, que se llevan echarts.
 */

import { desdePrimeraPieza } from '@/services/shoplogix/monitorActividad'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { PublicMonitorLive } from '@/services/shoplogix/publicShiftMonitor.service'
import type { CostoDeParadas } from '@/services/shoplogix/monitorPerdidas'
import { DUENO_META, veredictoFallaDeMaquina, type CausaDelTurno, type GrupoDelTurno } from '@/services/shoplogix/monitorEventos'
import { DUENO_UI } from './duenoUi'
import { resumenComparacion, type CompareResult } from '@/services/shoplogix/monitorCompare'
import { MAX_MAPE_PCT, type ConePoint, type ForecastResult } from '@/services/shoplogix/monitorForecast'
import { MonitorCompareChart } from './MonitorCompareChart'
import type { Ventana } from './useZoomGesto'
import type { NotaDeOperador } from './notasOperador'

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
  /*
   * Plegar existe por la ALTURA del celular. En pantalla grande la página va
   * en columnas y esa razón no corre: los bloques nacen abiertos, que es lo
   * que uno espera de un tablero en el PC.
   *
   * ⚠ Y la preferencia se guarda POR TAMAÑO de pantalla. Con una sola clave,
   * lo que alguien plegó en su teléfono —donde plegar es lo correcto— viajaba
   * al PC y dejaba el pareto y «de quién fue la pérdida» cerrados en una
   * pantalla que los muestra sin costo (visto en local, 30-08).
   */
  const ancha = typeof window !== 'undefined'
    && window.matchMedia?.('(min-width: 1100px)').matches
  const clave = `monitor-bloque:${id}${ancha ? ':pc' : ''}`
  const [abierto, setAbierto] = useState(() => {
    try {
      const v = localStorage.getItem(clave)
      return v == null ? (defaultAbierto || ancha) : v === '1'
    } catch {
      return defaultAbierto || ancha
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
        /* La cabecera de un bloque plegable medía 17 px de alto: es el control
           que más se toca de la pantalla y el que menos superficie daba. */
        className="tap-44 flex w-full items-center justify-between gap-2 text-left"
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

/** «La colación» a partir de «COLACION»: el aviso habla, no grita.
    OJO: el artículo fijo solo funciona con la colación: con el reason crudo de
    otros convenios salía «La ejercicio compensatorio - paro entra a las…»
    (visto en vivo, 27-08). Para el resto, el nombre va entre comillas con
    su sustantivo delante. */
function nombreDeConvenio(reason: string): string {
  const bajo = reason.toLowerCase().replace(/\s+/g, ' ').trim()
  if (bajo === 'colacion') return 'La colación'
  return `La parada de convenio «${bajo}»`
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
  tb, causaSel, onCausa, onVentana, onTramo, proximaParada, notas, cerrado, meta, hechas,
  piezasPulso, corteHora,
  cuotaAhora, horaAhora, cpmAndando, costo, grupos, notasTurno,
}: {
  tb: PublicMonitorLive['timeBreakdown']
  causaSel?: string | null
  onCausa?: (c: string | null) => void
  /**
   * Acercar el gráfico a un tramo. Es lo que permite saltar a UNA parada y no
   * a todas las de su causa: tocar «de 08:57 a 09:02» lleva el gráfico ahí.
   */
  onVentana?: (v: Ventana | null) => void
  /**
   * Marcar UNA parada en el gráfico. Sin esto, tocar una microdetención
   * pintaba las 40 de su causa y no se podía saber cuál era ni medirla.
   */
  onTramo?: (v: Ventana | null) => void
  /** La próxima parada de convenio pronosticada: hora de reloj Y su nombre —
      «la próxima entra a las 12:50» obligaba a adivinar cuál. */
  proximaParada?: { hora: string; reason: string } | null
  /** Comentarios del operador agrupados por causa (ver `notasPorCausa`). */
  notas?: Map<string, NotaDeOperador[]>
  /** true con el turno cerrado: la resta se hace contra la meta COMPLETA. */
  cerrado?: boolean
  /** La meta del turno completo. null si no hay meta. */
  meta?: number | null
  /** Piezas hechas hasta ahora (o al cierre). */
  hechas?: number | null
  /** Lo que ya leyó el pulso — más fresco que el snapshot de este desglose. */
  piezasPulso?: number | null
  /** Hora de planta del corte al que corresponde este desglose. */
  corteHora?: string | null
  /**
   * La cuota a esta ALTURA del turno: la curva del comparador, que se aplana
   * durante la colación. Solo importa en vivo — restar contra la meta completa
   * pintaría como «ritmo perdido» lo que simplemente no se jugó todavía.
   */
  cuotaAhora?: number | null
  /** Hora de reloj para nombrar la cuota («las 2.600 que tocaban a las 11:00»). */
  horaAhora?: string | null
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
  /*
   * Acordeón por parte (mockup v3): cada parte de la barra abre SU detalle,
   * uno a la vez. Los minutos del turno viven como texto bajo «Hechas» — la
   * segunda barra murió acá. El control canónico es la FILA de 44 px, no el
   * segmento: un segmento puede medir 3 px en un turno bueno.
   */
  /*
   * «Paradas» arranca ABIERTA: adentro vive la lista de causas por dueño — el
   * argumento de imputación de Mantención — y detrás de un tap, por defecto,
   * no lo vería nadie. Quien mira otra parte la pliega, y un tap la devuelve.
   */
  const [parte, setParte] = useState<'hechas' | 'paradas' | 'ritmo' | 'jugar' | 'programado' | null>('paradas')
  const alternarParte = (p: 'hechas' | 'paradas' | 'ritmo' | 'jugar' | 'programado') =>
    setParte((v) => (v === p ? null : p))
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
  /*
   * OJO OJO: MINUTOS DE LÍNEA, no de máquina.
   *
   * `min` son los minutos que la causa estuvo activa en ALGUNA máquina;
   * `lineMin`, los que además frenaron la línea entera. Con tres Baader los dos
   * se separan muchísimo. Turno 2 del 26-08, medido del payload:
   *
   *     KNURO 88/8 · Micro Detencion 39/3 · Detencion 10/3 · LOGICA 8/0 ·
   *     ACUMULACION RECHAZO 6/5   →  suma 151 de máquina contra 12 de línea
   *
   * Sumando `min` la pantalla decía «Paradas 2.066 pz» cuatro renglones arriba
   * de «las paradas evitables llevan 12 min con la línea entera detenida»:
   * 172 pz/min en una línea que da 45. `cascadaTurno` ya usaba `lineMin` — eran
   * dos varas para lo mismo en la misma pantalla.
   *
   * Solo los minutos de línea se traducen a piezas que no pasaron por el sensor.
   */
  const minDeLinea = (x: { min: number; lineMin?: number | null }) => Math.max(0, x.lineMin ?? x.min)
  /*
   * El RITMO sigue siendo el local —el que la línea traía justo antes de esa
   * parada, que `monitorPerdidas` calcula por causa— y solo se corrigen los
   * MINUTOS. Valorizar con el promedio del turno sería el error opuesto: una
   * parada de 27 min a 9 pz/min cuesta 243 pz, no las 351 del promedio.
   */
  /* Ritmo local de la causa (`cpm` ya trae deshecha la división por máquinas
     que lleva `piezas`) por los minutos de LÍNEA. */
  const piezasDe = (reason: string, minLinea: number) =>
    minLinea * (porCausa.get(reason)?.cpm ?? cpm ?? 0)
  /*
   * Y los `lineMin` de las causas tampoco se descuentan ENTRE SÍ: dos causas
   * distintas pueden frenar la línea en el mismo minuto. En el turno del 26-08
   * suman 19 mientras `recoverableMin` —el total de línea, el que cierra la
   * ventana (475 = 392 + 61 + 12 + 10)— dice 12. Se escalan para que sumen ese
   * total: así el titular cuadra con los minutos que la propia pantalla dice
   * dos renglones más abajo, y la proporción entre causas se conserva.
   */
  const sumaLinea = tb.recoverable.reduce((a, x) => a + minDeLinea(x), 0)
  const escala = sumaLinea > tb.recoverableMin && sumaLinea > 0 ? tb.recoverableMin / sumaLinea : 1
  const restoMin = Math.max(0, tb.recoverableMin - sumaLinea)
  const crudas =
    cpm == null
      ? null
      : tb.recoverable.reduce((a, x) => a + piezasDe(x.reason, minDeLinea(x) * escala), 0) + restoMin * cpm
  /*
   * La vara de la resta. Cerrado: la meta completa. En vivo: la cuota A ESTA
   * ALTURA (la misma curva del comparador, aplanada en colación) — contra la
   * meta completa, `porRitmo` absorbería todo lo que aún no se juega: a las
   * 11:00 con 2.230 pz hechas la brecha contra la meta es ~2.770 y casi nada
   * de eso es pérdida. Sin curva de cuota, en vivo NO hay resta honesta.
   */
  const metaOk = meta != null && meta > 0 ? meta : null
  const cuotaOk = !cerrado && metaOk != null && cuotaAhora != null && cuotaAhora > 0
    ? Math.min(Math.round(cuotaAhora), metaOk)
    : null
  const referencia = cerrado ? metaOk : cuotaOk
  const brecha = referencia != null && hechas != null ? Math.max(0, referencia - hechas) : null
  const hayBrecha = brecha != null && brecha > 0
  /*
   * Meta cumplida (regla de Orel: «seamos positivos — ¿qué pasa si se llega?»).
   * El bloque no puede llamarse «por qué no llegamos» un día que SÍ se llegó:
   * con la vara alcanzada se celebra, y las paradas igual muestran su costo —
   * «llegamos, y sin las paradas llegábamos más arriba» es el mejor argumento
   * de Mantención que existe.
   */
  const superada = referencia != null && hechas != null && referencia > 0 && brecha === 0
  const excedente = superada ? Math.max(0, Math.round(hechas! - referencia!)) : 0
  const perdidas = crudas == null ? null : hayBrecha ? Math.min(crudas, brecha) : crudas
  const porRitmo = (hayBrecha || superada) && perdidas != null ? Math.max(0, (brecha ?? 0) - perdidas) : null
  /** Lo que la cuota todavía no pide: va HUECO en la barra, no es pérdida. */
  const porJugar = cuotaOk != null && metaOk != null ? Math.max(0, metaOk - cuotaOk) : 0
  /** El peso de cada parte sobre la meta: el «% del 100%» que pidió Orel. */
  const pctMeta = (v: number) =>
    metaOk != null && metaOk > 0 ? `${Math.round((v / metaOk) * 100)}%` : null
  /* Con la vara superada en vivo, lo hecho puede pasar la cuota: el hueco se
     mide contra lo HECHO para que la barra no dibuje de más. */
  const porJugarBarra = superada && !cerrado && metaOk != null && hechas != null
    ? Math.max(0, metaOk - hechas)
    : porJugar
  // El rango de ritmos usados: es la evidencia de que cada parada se valorizó
  // distinto. Con una sola causa no hay rango que mostrar.
  const ritmos = (costo?.porCausa ?? []).map((c) => c.cpm)
  const rango = ritmos.length > 1 ? { min: Math.min(...ritmos), max: Math.max(...ritmos) } : null

  /** La resta (y su acordeón) solo con todas sus piezas sobre la mesa. */
  const restaVisible =
    (hayBrecha || superada) && perdidas != null && porRitmo != null && metaOk != null && hechas != null && cpm != null

  const gruposVisibles = (grupos ?? []).filter((g) => g.causas.length > 0)
  /* Regla de Orel: lo PROGRAMADO va aparte — no es detención imputable ni se
     recupera. Las imputables viven dentro de «Paradas»; el convenio, en su fila. */
  const gruposImputables = gruposVisibles.filter((g) => g.dueno !== 'programado')
  const grupoProgramado = gruposVisibles.find((g) => g.dueno === 'programado') ?? null
  /*
   * "Ninguna falla de máquina" solo se puede afirmar sobre las paradas que
   * TIENEN causa anotada — `sin-imputar` no es evidencia de nada. La regla y
   * el porqué viven en `veredictoFallaDeMaquina`.
   */
  const veredicto = veredictoFallaDeMaquina(gruposVisibles)
  const ultimoImputable = [...gruposVisibles].reverse().find((g) => g.dueno !== 'programado')?.dueno

  return (
    <Bloque
      id="tiempo"
      // El título depende de si hay algo que explicar: con la meta cumplida,
      // "Por qué no llegamos" sería un titular falso.
      /* «Camino a la meta» funciona perdiendo, ganando y en vivo — el nombre
         viejo («Por qué no llegamos») asumía la derrota, y el día que se
         llegue no puede quedarse ese titular (regla de Orel). */
      titulo={hayBrecha || superada ? 'Camino a la meta' : 'A dónde se va el tiempo'}
      extra={hayBrecha
        ? (
          <span className="tabular-nums font-semibold text-red-700 dark:text-red-400">
            −{fmtInt(brecha)} pz
            {/* En vivo la cifra es contra la cuota de AHORA, y tiene que decirlo:
                sin el sufijo se lee como si faltara eso para la meta completa. */}
            {!cerrado && <span className="font-normal text-muted-foreground"> a esta hora</span>}
          </span>
        )
        : superada
        ? (
          <span className="tabular-nums font-semibold text-ink-ok">
            {excedente > 0 ? `✓ +${fmtInt(excedente)} pz` : '✓ en la meta'}
            {!cerrado && <span className="font-normal text-muted-foreground"> a esta hora</span>}
          </span>
        )
        // Desde el fix de la rejilla (tbv 2), windowMin es el lapso REAL de
        // punta a punta — la MISMA medida que el "de turno" del comparador, así
        // que ahora comparten palabra a propósito. (Antes eran medidas
        // distintas y la palabra compartida parecía un error de suma.)
        : <span className="tabular-nums">{fmtDurMin(tb.windowMin)} de turno</span>}
    >
      {/* ── 1 · La resta ────────────────────────────────────────────────── */}
      {restaVisible && perdidas != null && porRitmo != null && metaOk != null && hechas != null && cpm != null && (
        <div className="mt-2">
          {/*
           * La barra madre: su largo total ES la meta, todo en piezas. Lo hecho
           * en neutro apagado (no es la noticia bajo este título), la pérdida
           * en color, y en vivo lo que la cuota aún no pide va HUECO — el borde
           * entre lo pintado y el hueco es la cuota de esta hora. Los valores
           * SIEMPRE afuera: el ancho de un segmento no decide su legibilidad.
           */}
          <p className="text-right text-[11px] uppercase tracking-wide text-muted-foreground/80">
            meta <span className="tabular-nums">{fmtInt(metaOk)} pz</span>
          </p>
          {/* Los segmentos son ATAJOS al mismo detalle que su fila (abajo);
              con una parte abierta los demás se atenúan para ver cuál se mira. */}
          <div className="mt-1 flex h-6 gap-[2px]">
            {([
              { p: 'hechas' as const, v: hechas, cls: 'bg-muted-foreground/[0.35]', flex: true, rotulo: 'hechas' },
              { p: 'paradas' as const, v: hayBrecha ? perdidas : 0, cls: 'bg-red-600 dark:bg-red-500', rotulo: 'perdidas en paradas' },
              { p: 'ritmo' as const, v: hayBrecha ? porRitmo : 0, cls: 'bg-amber-600 dark:bg-amber-500', rotulo: 'por ritmo' },
              { p: 'jugar' as const, v: porJugarBarra, cls: 'border border-dashed border-muted-foreground/[0.4]', rotulo: 'aún por jugar' },
            ]).filter((s) => s.flex || s.v > 0).map((s) => (
              <button
                key={s.p}
                type="button"
                onClick={() => alternarParte(s.p)}
                aria-expanded={parte === s.p}
                aria-label={`${fmtInt(s.v)} piezas ${s.rotulo} — ver detalle`}
                className={`rounded-[4px] transition-opacity ${s.cls} ${parte != null && parte !== s.p ? 'opacity-30' : ''}`}
                style={s.flex ? { flex: '1 1 0%' } : { width: `${(s.v / metaOk) * 100}%`, minWidth: 3 }}
              />
            ))}
          </div>
          {/* Las filas SON la leyenda, y cada una abre su parte (44 px §3). */}
          <div className="mt-2 overflow-hidden rounded-[10px] bg-muted">
            {([
              { p: 'hechas' as const, nombre: 'Hechas', valor: `${fmtInt(hechas)} pz`, pct: pctMeta(hechas), tick: 'bg-muted-foreground/[0.5]' },
              { p: 'paradas' as const, nombre: 'Paradas', valor: `${fmtInt(perdidas)} pz`, pct: pctMeta(perdidas), tick: 'bg-red-600 dark:bg-red-500' },
              { p: 'ritmo' as const, nombre: 'Ritmo', valor: `${fmtInt(porRitmo)} pz`, pct: pctMeta(porRitmo), tick: 'bg-amber-600 dark:bg-amber-500' },
              ...(porJugarBarra > 0 ? [{ p: 'jugar' as const, nombre: 'Por jugar', valor: `${fmtInt(porJugarBarra)} pz`, pct: pctMeta(porJugarBarra), tick: 'border border-dashed border-muted-foreground/[0.5] bg-transparent' }] : []),
              /*
               * El convenio NO tiene segmento en la barra: la barra cuenta
               * PIEZAS contra la meta y en la colación no se producen — la
               * cuota ya se reparte descontándola. Convertirlo daría «se
               * perdieron 794 pz en la colación», que es falso. Su peso se dice
               * igual, con el denominador nombrado: % DEL TURNO, no de la meta.
               */
              /* `tb.plannedMin` y no `grupoProgramado.min`: el grupo suma los
                 minutos por MÁQUINA (66+9+6 = 81) y el desglose de línea dice
                 61. Mostrar 81 además rompía el reparto — 392 produciendo + 81
                 + 12 se pasa de los 475 de ventana. */
              ...(grupoProgramado ? [{ p: 'programado' as const, nombre: 'Programado', valor: fmtDurMin(tb.plannedMin), pct: tb.windowMin > 0 ? `${Math.round((tb.plannedMin / tb.windowMin) * 100)}% turno` : null, tick: 'bg-muted-foreground' }] : []),
            ]).map((f, i) => (
              <div key={f.p} className={i > 0 ? 'border-t border-border/60' : ''}>
                <button
                  type="button"
                  onClick={() => alternarParte(f.p)}
                  aria-expanded={parte === f.p}
                  className={`flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left text-[13px] text-foreground ${parte === f.p ? 'bg-primary/[0.08]' : ''}`}
                >
                  <i className={`h-5 w-1 shrink-0 rounded-full ${f.tick}`} />
                  <span className="flex-1 truncate">{f.nombre}</span>
                  <span className="tabular-nums font-semibold">{f.valor}</span>
                  {f.pct && (
                    <span className="w-20 shrink-0 whitespace-nowrap text-right tabular-nums text-[11px] font-normal text-muted-foreground">
                      {f.pct}
                    </span>
                  )}
                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${parte === f.p ? '' : '-rotate-90'}`} />
                </button>
                {parte === f.p && (
                  /* `pantalla-oculta`: en la TV la tarjeta muestra solo la
                     barra, las filas y el veredicto — el detalle expandido es
                     para tocar, y en la sala nadie toca. */
                  <div className="pantalla-oculta bg-primary/[0.08] px-3 pb-3 pl-[26px] text-[12.5px] leading-snug">
                    {f.p === 'hechas' && (
                      <>
                        {([
                          { n: 'Produciendo', m: tb.producingMin },
                          { n: 'Convenio (colación y afines)', m: tb.plannedMin },
                          { n: 'Detenida, recuperable', m: tb.recoverableMin },
                          ...(otros > 0 ? [{ n: 'Huecos de sincronización', m: otros }] : []),
                        ]).filter((x) => x.m > 0).map((x) => (
                          <p key={x.n} className="flex justify-between gap-2 py-0.5">
                            <span className="text-muted-foreground">{x.n}</span>
                            <span className="tabular-nums font-semibold text-foreground">
                              {fmtDurMin(x.m)} <span className="font-normal text-muted-foreground">· {Math.round(pct(x.m))}%</span>
                            </span>
                          </p>
                        ))}
                        <p className="mt-1.5 text-muted-foreground/80">
                          Los minutos miden la LÍNEA, que solo se detiene cuando paran todas las máquinas.
                        </p>
                        {/* El titular de arriba usa el pulso (lectura por minuto)
                            y este desglose el último snapshot: el 26-08 se leía
                            "9.041 piezas" arriba y "Hechas 8.894" acá, 147 de
                            diferencia por 6 minutos de desfase, sin nada que lo
                            explicara. */}
                        {piezasPulso != null && hechas != null && piezasPulso > hechas && (
                          <p className="mt-1 text-muted-foreground/80">
                            Este desglose va al último corte de Shoplogix
                            {corteHora ? <> (<span className="tabular-nums">{corteHora}</span>)</> : null}
                            : el pulso ya leyó{' '}
                            <span className="tabular-nums font-semibold text-foreground">
                              {fmtInt(piezasPulso - hechas)} pz
                            </span>{' '}
                            más, que entran en el próximo.
                          </p>
                        )}
                      </>
                    )}
                    {f.p === 'paradas' && (
                      <>
                        {/* La lista de causas por DUEÑO completa vive acá adentro
                            (pedido de Orel: «las demás dentro de las de arriba») —
                            y la fila arranca abierta para que el argumento de
                            imputación siga siendo lo primero que se ve. */}
                        {gruposImputables.length === 0 && (
                          <p className="py-0.5 text-muted-foreground/80">nada por recuperar</p>
                        )}
                        {gruposImputables.map((g) => (
                          <div key={g.dueno}>
                            <GrupoDeEventos
                              g={g}
                              sel={causaSel ?? null}
                              onCausa={onCausa}
                              onVentana={onVentana}
                              onTramo={onTramo}
                              notas={notas}
                              proximaParada={null}
                              plannedMin={tb.plannedMin}
                            />
                            {veredicto && g.dueno === ultimoImputable && (
                              <p className="mt-2 text-[11px] font-semibold text-ink-ok">
                                {veredicto.texto}
                              </p>
                            )}
                          </div>
                        ))}
                        {onCausa && gruposImputables.length > 0 && (
                          <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                            Tocá una causa para ver sus paradas una por una.
                          </p>
                        )}
                        {/* ⚠ El supuesto va escrito: es la parte discutible del
                            número, y quien lo discuta pregunta exactamente esto. */}
                        <p className="mt-1.5 text-muted-foreground/80">
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
                      </>
                    )}
                    {f.p === 'ritmo' && (
                      <>
                        {/* Qué es la cifra: el RESTO de la resta, no una medición
                            aparte. Sin esto se lee como si alguien hubiera medido
                            «piezas perdidas por velocidad», que no existe. */}
                        <p className="text-muted-foreground">
                          Es lo que queda de la brecha <b>después</b> de descontar las paradas:{' '}
                          <span className="tabular-nums font-semibold text-foreground">{fmtInt(porRitmo)} pz</span>{' '}
                          que no se hicieron <b>con la línea andando</b>.
                        </p>
                        {tb.producingMin > 0 && (
                          <p className="mt-1.5 text-muted-foreground">
                            La cuenta: mientras produjo, la línea promedió{' '}
                            <span className="tabular-nums font-semibold text-foreground">{fmtDec(cpm)} pz/min</span>{' '}
                            y para la meta necesitaba{' '}
                            <span className="tabular-nums font-semibold text-foreground">
                              {fmtDec(cpm + porRitmo / tb.producingMin)}
                            </span>
                            . Esa diferencia de{' '}
                            <span className="tabular-nums">{fmtDec(porRitmo / tb.producingMin)} pz/min</span>,
                            sostenida {fmtDurMin(tb.producingMin)}, son las{' '}
                            <span className="tabular-nums">{fmtInt(porRitmo)} pz</span>.
                          </p>
                        )}
                        {/*
                          * ⚠ Lo que el dato NO dice. Sin este párrafo, «ritmo» se
                          * lee como «el operador bajó la velocidad» — y las causas
                          * más probables (menos materia prima llegando, calibre
                          * más chico, microparadas bajo el umbral) no son eso.
                          */}
                        <p className="mt-1.5 text-muted-foreground/80">
                          <b>Por qué anduvo más lento, esto no lo dice.</b> Las causas habituales son
                          menos producto llegando desde aguas arriba, calibre distinto al del set
                          point, o microparadas más cortas que el umbral con que Shoplogix las
                          registra. Confirmarlo es pregunta de terreno, no del dato.
                        </p>
                      </>
                    )}
                    {f.p === 'jugar' && (
                      <p className="text-muted-foreground">
                        Piezas que la cuota todavía no pide a esta altura: no son pérdida, son el
                        resto del turno. El pronóstico de cierre vive en su propia tarjeta, más
                        abajo.
                      </p>
                    )}
                    {f.p === 'programado' && grupoProgramado && (
                      <>
                        {/* La pregunta que salta al verlo fuera de la barra, contestada
                            en la pantalla y no en una conversación: */}
                        <p className="mb-1 text-muted-foreground/80">
                          No entra en la barra porque la barra cuenta <b>piezas contra la meta</b> y
                          en el convenio no se produce: la meta ya se reparte descontándolo. Por eso
                          su peso se mide en tiempo — {tb.windowMin > 0 && (
                            <span className="tabular-nums">
                              {Math.round((tb.plannedMin / tb.windowMin) * 100)}%
                            </span>
                          )} del turno.
                        </p>
                        <GrupoDeEventos
                          g={grupoProgramado}
                          sel={causaSel ?? null}
                          onCausa={onCausa}
                          onVentana={onVentana}
                          onTramo={onTramo}
                          notas={notas}
                          proximaParada={proximaParada}
                          plannedMin={tb.plannedMin}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {superada
            ? (
              /* «Llegamos, y sin las paradas llegábamos más arriba»: la meta
                 cumplida no apaga el costo de las paradas — lo convierte en el
                 argumento de cuánto más se puede. */
              <p className="mt-2 text-[13.5px] leading-snug text-foreground">
                <span className="font-semibold text-ink-ok">
                  {cerrado ? 'Meta cumplida' : 'Al día con la cuota'}
                </span>
                : <span className="tabular-nums font-semibold">{fmtInt(hechas)}</span> de{' '}
                <span className="tabular-nums">{fmtInt(referencia ?? 0)} pz</span>
                {excedente > 0 && <> (+{fmtInt(excedente)})</>}.
                {perdidas != null && perdidas > 0 && (
                  <>
                    {' '}Las paradas igual costaron ~
                    <span className="tabular-nums font-semibold">{fmtInt(perdidas)} pz</span> — sin
                    ellas {cerrado ? 'el cierre quedaba' : 'iríamos'} más arriba.
                  </>
                )}
              </p>
            )
            : cerrado
            ? (
              <p className="mt-2 text-[13.5px] leading-snug text-foreground">
                De las <span className="tabular-nums font-semibold">{fmtInt(brecha!)} pz</span> que
                faltaron,{' '}
                <span className="tabular-nums font-semibold text-red-700 dark:text-red-400">
                  {fmtInt(perdidas)}
                </span>{' '}
                son <b>{fmtDurMin(tb.recoverableMin)} de paradas evitables</b> y{' '}
                <span className="tabular-nums font-semibold">{fmtInt(porRitmo)}</span>, ritmo por
                debajo del necesario.
              </p>
            )
            : (
              <p className="mt-2 text-[13.5px] leading-snug text-foreground">
                Van <span className="tabular-nums font-semibold">{fmtInt(hechas)}</span> de las{' '}
                <span className="tabular-nums font-semibold">{fmtInt(cuotaOk ?? 0)}</span> que
                tocaban {horaAhora ? <>a las <span className="tabular-nums">{horaAhora}</span></> : 'a esta altura'}.
                {' '}
                {/* `recoverableMin` son los minutos con la LÍNEA ENTERA detenida, y
                    arriba cada causa muestra los minutos en que estuvo activa en
                    ALGUNA máquina (86 min de "Detención" contra 67 de línea, el
                    24-08 en Chonchi). Sin decir cuál es cuál, los dos números se
                    leen como si uno estuviera mal. */}
                {/* Con cero minutos, fmtDurMin devuelve «—» y la frase decía
                    «llevan — con la línea entera detenida» (visto en vivo,
                    27-08 con solo micro y una máquina parada de a una). El
                    cero acá es una BUENA noticia y se dice como tal. */}
                {tb.recoverableMin >= 1 ? (
                  <>Las paradas evitables llevan <b>{fmtDurMin(tb.recoverableMin)}</b>
                  {(tb.recoverable ?? []).some((x) => (x.lineMin ?? x.min) < x.min)
                    ? ' con la línea entera detenida.'
                    : '.'}</>
                ) : (
                  <>La línea entera todavía no pierde tiempo por paradas evitables.</>
                )}
              </p>
            )}
        </div>
      )}
      {/* Sin ritmo de referencia la resta no se puede repartir — pero decirlo
          es mejor que desaparecer mudo, que es lo que hacía antes. */}
      {hayBrecha && perdidas == null && (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          {cerrado
            ? 'Sin un ritmo de referencia no se puede repartir la brecha entre paradas y ritmo.'
            : 'La línea todavía no produce: sin un ritmo de referencia no se puede repartir lo que falta entre paradas y ritmo.'}
        </p>
      )}

      {/* ── 2 · Qué pasó, agrupado por de quién es ───────────────────────
          SOLO sin acordeón: con la resta visible, las causas imputables viven
          dentro de «Paradas» (abierta por defecto) y el convenio dentro de
          «Programado» — repetirlas acá era la duplicación que acusó Orel. */}
      {!restaVisible && (
        <div className="mt-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Qué pasó en el turno
            <span className="normal-case tracking-normal">
              {' '}· {fmtDurMin(tb.recoverableMin)} recuperables
            </span>
          </p>

          {gruposVisibles.length === 0 && (
            <p className="mt-1 text-[11.5px] text-muted-foreground/80">nada por recuperar</p>
          )}

          {gruposVisibles.map((g) => (
            <div key={g.dueno}>
              <GrupoDeEventos
                g={g}
                sel={causaSel ?? null}
                onCausa={onCausa}
                onVentana={onVentana}
                onTramo={onTramo}
                notas={notas}
                proximaParada={g.dueno === 'programado' ? proximaParada : null}
                plannedMin={tb.plannedMin}
              />
              {/* ⚠ La frase que Mantención necesita poder decir. Va pegada al
                  último grupo que se le puede imputar a alguien, no al final:
                  después del convenio queda a tres dedos de distancia de los
                  minutos que explica y se lee como un pie de página. */}
              {veredicto && g.dueno === ultimoImputable && (
                <p className="mt-2 text-[11px] font-semibold text-ink-ok">
                  {veredicto.texto}
                </p>
              )}
            </div>
          ))}

          {onCausa && gruposVisibles.length > 0 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground/80">
              Tocá una causa para ver sus paradas una por una.
            </p>
          )}
        </div>
      )}

      {/* El aviso de la próxima parada de convenio no puede depender de que
          YA haya habido una (14-08: los primeros 7 min eran reunión y
          ejercicio, con la colación por delante) NI de que la fila
          «Programado» esté abierta — con ella cerrada, este renglón es el
          único que lo dice; con ella abierta lo dice el grupo y esto se
          calla para no repetirlo. */}
      {proximaParada && (tb.plannedMin === 0 || (restaVisible && parte !== 'programado')) && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/80">
          {tb.plannedMin === 0 ? 'Todavía sin paradas de convenio: ' : ''}
          {nombreDeConvenio(proximaParada.reason)} entra a las{' '}
          {/* ~ porque es la mediana de los turnos anteriores, no un pacto. */}
          <span className="tabular-nums">~{proximaParada.hora}</span>.
        </p>
      )}

      {/* Siempre visible: acá aparecen fallas mecánicas anotadas a mano
          («guías de bronce») y eso no puede depender de ningún tap. */}
      {notasTurno && notasTurno.length > 0 && (
        <div className="mt-4">
          <p className="text-[11px] uppercase tracking-wide text-ink-ok">
            Anotado para todo el turno
          </p>
          <ul className="mt-1 space-y-0.5 border-l-2 border-ink-ok pl-2">
            {notasTurno.map((t) => (
              <li key={t} className="text-[11px] leading-snug text-muted-foreground">{t}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 5 · El reparto del tiempo, plegado ───────────────────────────
          SOLO cuando el acordeón no está: con la resta visible, los minutos
          ya viven bajo la fila «Hechas» y esto sería la segunda barra de
          vuelta. Sin brecha (meta cumplida, sin meta, sin cpm) sigue siendo
          la única puerta a los minutos. */}
      {!restaVisible && (
        <>
      <button
        type="button"
        onClick={() => alternarParte('hechas')}
        className="mt-2 text-[11px] text-brand-ink underline underline-offset-2"
        aria-expanded={parte === 'hechas'}
      >
        {parte === 'hechas' ? 'ocultar el reparto del tiempo' : 'ver el reparto del tiempo'}
      </button>

      {parte === 'hechas' && (
        <div className="mt-2">
          <div className="flex h-6 overflow-hidden rounded-lg text-[11px] font-semibold text-white">
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
              <i className="h-2.5 w-2.5 rounded-[4px] bg-red-600 dark:bg-red-500" />
              Recuperable <span className="tabular-nums text-foreground/80">{tb.recoverableMin} min</span>
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">
            Los minutos son los que la causa estuvo activa en alguna máquina; la barra mide la
            LÍNEA, que solo se detiene cuando paran todas.
          </p>
        </div>
      )}
        </>
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
function GrupoDeEventos({ g, sel, onCausa, onVentana, onTramo, notas, proximaParada, plannedMin }: {
  g: GrupoDelTurno
  sel: string | null
  onCausa?: (c: string | null) => void
  onVentana?: (v: Ventana | null) => void
  onTramo?: (v: Ventana | null) => void
  notas?: Map<string, NotaDeOperador[]>
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
        <span className={`text-[11px] font-bold uppercase tracking-wide ${color}`}>
          {meta.label} <span className="font-normal normal-case tracking-normal opacity-70">· {meta.detalle}</span>
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
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
          <FilaEvento key={c.reason} c={c} sel={sel} onCausa={onCausa} onVentana={onVentana}
            onTramo={onTramo} notas={notas?.get(c.reason)} />
        ))}
      </ul>
      {/* ⚠ El aviso NO se apaga con la primera parada planificada: 7 min de
          reunión de inicio lo mataban con la colación todavía por delante. */}
      {proximaParada && plannedMin > 0 && (
        <p className="mt-1 pl-2 text-[11px] text-muted-foreground/80">
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
function FilaEvento({ c, sel, onCausa, onVentana, onTramo, notas }: {
  c: CausaDelTurno
  sel: string | null
  onCausa?: (c: string | null) => void
  onVentana?: (v: Ventana | null) => void
  onTramo?: (v: Ventana | null) => void
  /**
   * Lo que el operador escribió sobre ESTA causa. La causa y su explicación son
   * la misma respuesta a "¿por qué paró?", así que van juntas.
   */
  notas?: NotaDeOperador[]
}) {
  const [abierta, setAbierta] = useState(false)
  const activa = sel === c.reason
  /*
   * Con muchas paradas, listarlas todas es la lista de 46 filas que estamos
   * evitando: se resume y se muestran las más largas, que son las que pesan.
   */
  /*
   * TODAS las paradas, no una muestra (pedido de Orel): cortar en 3 dejaba
   * fuera 37 de las 40 microdetenciones y con ellas cualquier posibilidad de
   * ubicar la que a uno le interesa. Siguen ordenadas de más larga a más
   * corta; con muchas, la lista scrollea dentro de su propia caja para no
   * empujar el resto del bloque fuera de pantalla.
   */
  const MUCHAS = 6
  const muchas = c.paradas.length > MUCHAS
  const visibles = c.paradas
  /*
   * ⚠ El resumen se calcula con el `count` de la FILA, no con la cantidad de
   * eventos que trae `paradas`: los dos números no coinciden —el 14-08 la fila
   * decía 23 microparadas y `stopEvents` traía 28— y verlos a 20 px de
   * distancia se lee como un error de cuenta. La lista de abajo son ejemplos
   * reales; el conteo manda el que usa todo el resto del bloque.
   */
  const cuantas = c.count || c.paradas.length
  const prom = cuantas > 0 ? (c.min / cuantas) * 60 : 0

  /*
   * El comentario del operador va PEGADO a la parada que explica, no en una
   * lista aparte que repetía la hora (pedido de Orel: «ligado al evento
   * imputado, no duplicado»). Se emparejan por tramo, con dos minutos de
   * tolerancia: el operador escribe cuando ya paró, no en el instante exacto.
   *
   * Las que no calzan con ninguna parada visible NO se tiran: quedan en la
   * lista de abajo. Perder lo que escribió el piso ya nos costó una vez.
   */
  const TOLERANCIA_MIN = 2
  const notaDe = (p: { desdeMin: number | null; hastaMin: number | null }) =>
    (notas ?? []).filter((n) =>
      n.desdeMin != null && p.desdeMin != null && p.hastaMin != null &&
      n.desdeMin >= p.desdeMin - TOLERANCIA_MIN && n.desdeMin <= p.hastaMin + TOLERANCIA_MIN)
  const emparejadas = new Set(
    (c.paradas ?? []).flatMap((p) => notaDe(p)).map((n) => n.texto),
  )
  const sueltas = (notas ?? []).filter((n) => !emparejadas.has(n.texto))

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
      {c.paradas.length > 0 && <span className="ml-1 text-[11px] text-muted-foreground/80">{abierta ? '▾' : '▸'}</span>}
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
          /* Altura REAL, no `tap-44`: estas filas van apiladas y el área
             fantasma de 44 px de una pisaría a la vecina — tocar una abriría
             la de al lado, que es peor que el target chico. Medido con
             `elementFromPoint` en el monitor de prod: daban 19 px de alto
             táctil, y son el camino para ir a ver una parada una por una. */
          className={`flex min-h-[32px] w-full items-center justify-between gap-2 rounded px-1 py-1 text-left ${
            activa ? 'bg-primary/[0.13] font-semibold text-foreground' : 'text-foreground hover:bg-muted'
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
        <p className="px-1 text-[9.5px] uppercase tracking-wide text-muted-foreground/80">
          {c.categoria}
          {c.extension && <span className="ml-1 normal-case tracking-normal">· fuera del curso</span>}
        </p>
      )}

      {abierta && c.paradas.length > 0 && (
        <div className="my-1 ml-2 border-l border-border pl-2">
          {muchas && (
            <p className="text-[11px] italic text-muted-foreground/80">
              {/* Segundos SOLO cuando el promedio no llega al minuto: en las
                  microparadas «30 s» se lee mejor que «0,5 min». Para las
                  demás era el único número en segundos de toda la pantalla —
                  «510 s» al lado de una lista en minutos obliga a dividir por
                  60 de cabeza, parado en planta. */}
              {cuantas} paradas de {prom < 60
                ? `${Math.round(prom)} s`
                : `${fmtDec(prom / 60)} min`} en promedio.
            </p>
          )}
          {/*
            Cada parada es su propio botón: tocarla acerca el gráfico a ESE
            tramo (con un respiro a los lados para verla en contexto). Antes
            había un «ver en el gráfico» al pie que mostraba TODAS las de la
            causa; eso ya lo hace tocar la causa madre, y una parada de 5 min
            perdida entre 40 microparadas era imposible de ubicar.
          */}
          <ul className={`space-y-px ${muchas ? 'max-h-56 overflow-y-auto pr-1' : ''}`}>
            {visibles.map((p, i) => {
              const saltable = onVentana != null && p.desdeMin != null && p.hastaMin != null
              const contenido = (
                <>
                  <span className="tabular-nums text-muted-foreground/80">
                    {p.hora}<span className="px-0.5">→</span>{p.hasta}
                  </span>
                  <span className="tabular-nums">{fmtDec(p.min)} min</span>
                </>
              )
              const suyas = notaDe(p)
              return (
                <li key={`${p.hora}-${i}`}>
                  {saltable ? (
                    <button
                      type="button"
                      onClick={() => {
                        onCausa?.(c.reason)
                        /* La banda marcada es ESTA parada, no las 40 de su causa. */
                        onTramo?.({ desdeMin: p.desdeMin!, hastaMin: p.hastaMin! })
                        /* Un respiro proporcional a la parada (mín. 3 min): pegada
                           al borde no se entiende qué venía antes ni después. */
                        const aire = Math.max(3, p.min * 0.8)
                        onVentana?.({
                          desdeMin: Math.max(0, p.desdeMin! - aire),
                          hastaMin: p.hastaMin! + aire,
                        })
                        document.getElementById('grafico-turno')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                      className="flex w-full items-center gap-3 rounded-ctl px-1 py-1 text-left text-[11px] text-muted-foreground hover:bg-muted"
                      title="Ver esta parada en el gráfico"
                    >
                      {contenido}
                      <span className="ml-auto text-brand-ink">ver ›</span>
                    </button>
                  ) : (
                    <div className="flex gap-3 px-1 py-1 text-[11px] text-muted-foreground">{contenido}</div>
                  )}
                  {/* Lo que el operador escribió DE ESTA parada: sin repetir la
                      hora, que ya la dice la línea de arriba. */}
                  {suyas.map((n) => (
                    <p key={n.texto} className="ml-1 border-l-2 border-primary pl-2 text-[11px] leading-snug text-muted-foreground">
                      «{n.texto}»
                    </p>
                  ))}
                </li>
              )
            })}
          </ul>
          {muchas && (
            <p className="text-[11px] italic text-muted-foreground/80">
              las {c.paradas.length}, de la más larga a la más corta
            </p>
          )}
        </div>
      )}

      {/* Con la causa ABIERTA, las notas ya viven dentro de su parada: acá
          quedan solo las que no calzaron con ninguna. Con la causa cerrada se
          muestran todas — son la señal de que el piso explicó algo. */}
      {(abierta ? sueltas : (notas ?? [])).length > 0 && (
        <ul className="mt-0.5 space-y-0.5 border-l-2 border-primary pl-2">
          {(abierta ? sueltas : (notas ?? [])).map((n, i) => (
            <li key={`${n.desde}-${i}`} className="text-[11px] leading-snug text-muted-foreground">
              <span className="tabular-nums">
                {n.desde}{n.hasta && n.hasta !== n.desde && <>→{n.hasta}</>}
              </span> · «{n.texto}»
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
                ? 'text-ink-ok'
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
              /* El arranque del turno visto: convierte el eje de «h+6» a la
                 hora de reloj, la misma que muestra el gráfico de velocidad. */
              /* La primera PIEZA, igual que el resto del monitor: rotular
                 desde el primer tramo sincronizado ponía el eje 12 h antes del
                 arranque real cuando el turno no está definido en Shoplogix. */
              t0={desdePrimeraPieza(live?.series)[0]?.t ?? null}
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
          {/* ⚠ Esta nota decía «no por hora de reloj» y quedó contradiciendo al
              eje, que ahora SÍ muestra horas. Además su premisa era falsa acá:
              los 7 turnos medidos de Filete arrancaron todos a las 07:40. Lo
              que sigue siendo cierto —y lo único que hay que advertir— es
              contra qué se alinean los OTROS días. */}
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">
            Las horas son las de este turno. Los otros días se alinean por altura de turno
            —minutos desde su propio arranque—, así que si alguno empezó a otra hora, igual se
            compara a la misma altura.
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
    n >= 0 ? 'text-ink-ok' : 'text-red-700 dark:text-red-400'

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
          <span className="tabular-nums">{r.rango.dias}</span>{' '}
          {r.muestra.mismoTurno ? 'turnos iguales anteriores' : 'turnos anteriores'} fueron de{' '}
          <span className="tabular-nums text-foreground/80">{fmtInt(r.rango.min)}</span> a{' '}
          <span className="tabular-nums text-foreground/80">{fmtInt(r.rango.max)}</span>
          {r.mejor && <> · el mejor, {r.mejor.label}</>}.
          {/* OJO — Si la muestra mezcla horarios hay que decirlo: un turno de noche
              contra turnos de día no es «lo normal de este turno». Pasó en Filete
              al mover la producción de día a noche — el nombre siguió igual y la
              comparación cambió de significado sin avisar. */}
          {!r.muestra.mismoTurno && (
            <span className="text-muted-foreground/80">
              {' '}Son de otro horario: no hay suficientes de este turno todavía.
            </span>
          )}
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
      <div className="mt-2 flex items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
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
