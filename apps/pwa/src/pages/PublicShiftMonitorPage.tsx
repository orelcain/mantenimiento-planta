/**
 * Monitor público de turno — vista en vivo sin sesión (link/QR).
 *
 * Pensada para Control de Producción: entra desde el QR en el celular y ve
 * cuántas piezas lleva la línea, a qué cadencia (pz/min y pz/h), de qué turno
 * y día se trata, desde qué hora, y si la máquina está corriendo o parada.
 *
 * SOLO LECTURA para quien entra por el QR sin cuenta — que es el caso normal.
 * La ÚNICA excepción es fijar la hora de cierre del turno, y solo si quien mira
 * tiene sesión de admin: el resto ni siquiera ve el control. Esa escritura no
 * toca el doc del monitor (tiene `allow write: if false` en las reglas y así
 * queda) sino `graderModuleConfigs`, cuyas reglas exigen supervisor — o sea que
 * la comprobación de rol de la UI no es la única defensa.
 *
 * Se actualiza sola: el doc espejo lo reescribe el backend cada ciclo de sync
 * (~5 min mientras el turno corre) y acá hay un `onSnapshot`.
 *
 * Estilo: theme-aware con los tokens de la app y su propio selector sol/luna.
 * Nació oscura —un tablero de planta se mira mejor así— pero la pantalla se abre
 * también de día y en oficina, así que la elección es de quien mira. El tema se
 * guarda en el mismo `app-theme` que el resto de la app: quien tenga la PWA en
 * claro abre este link en claro.
 *
 * ⚠ Horas de TURNO en wall-clock de planta (getUTC*); `lastSyncAt` es UTC real.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Activity, AlertCircle, ChevronLeft, ChevronRight, Clock, Gauge, Hourglass, Moon, PauseCircle, RefreshCw, Sun, Target, TrendingUp } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import {
  subscribePublicShiftMonitor,
  trackMonitorUsage,
  type PublicShiftMonitorDoc,
  type PublicMonitorLive,
} from '@/services/shoplogix/publicShiftMonitor.service'
import { buildHourlyRows, peakPieces } from '@/services/shoplogix/monitorHourly'
import { computePaceToTarget, lineMaxPerHour, type PaceToTarget } from '@/services/shoplogix/monitorPace'
import { ventanaDeActividad, desdePrimeraPieza, piezasAntesDelArranque } from '@/services/shoplogix/monitorActividad'
import { mediaMovil, ritmoAhoraCpm, ritmoAhoraAndando, estadoRitmo, fraccionDeRegla } from '@/services/shoplogix/monitorRitmo'
import { pinShiftEnd, unpinShiftEnd, setMonitorSetPoint } from '@/services/shoplogix/pinShiftEnd'
import {
  buildDayComparison, optimalPace, plannedBreaks, mergeBreaks, cumulativeFromStart,
  breakMinutesBetween, extendOngoingBreaks,
  type PlannedBreak,
  prediccionConvenio,
} from '@/services/shoplogix/monitorCompare'
import { buildForecast, MAX_MAPE_PCT } from '@/services/shoplogix/monitorForecast'
import {
  buildPareto, contextoPareto, contextoPorTurno, muestraUnica, turnosParaVentana,
  type Ventana as VentanaPareto,
} from '@/services/shoplogix/monitorPareto'
import { parseShiftDocId } from '@/services/shoplogix/shoplogixShift.service'
import { agruparEventos } from '@/services/shoplogix/monitorEventos'
import { costoDeParadas } from '@/services/shoplogix/monitorPerdidas'
import { bandaNormal, nombreDeDia, rachaDeRitmos, recordsDeLinea, vsAyer as compararVsAyer, type TurnoResumen } from '@/services/shoplogix/monitorVsAyer'
import { llenadoDeSilletas, specDeMaquina, comoDeCada100, type LlenadoSilletas } from '@/services/shoplogix/monitorMaquina'
import { ParetoDeParadas } from './monitor/MonitorPareto'
import { useZoomGesto, type Ventana } from './monitor/useZoomGesto'
import { TiempoDelTurno, ComparadorDias, Bloque, PronosticoCierre } from './monitor/MonitorShiftParts'
import { notasPorCausa, notasDelTurno } from './monitor/notasOperador'
import { VsAyerBloque } from './monitor/MonitorVsAyer'
import { Pill } from '@/components/piel'
import { useIsAdmin } from '@/store'
import { useAuthStore } from '@/store/authStore'

// ── Formateadores (locales a propósito: esta página no debe arrastrar el
//    módulo de helpers del Grader, que se lleva echarts al bundle) ───────────

/** HH:MM en hora de planta. Los ISO de turno llevan Z pero son wall-clock. */
function fmtWallTime(isoStr: string | null | undefined): string {
  if (!isoStr) return '—'
  const d = new Date(isoStr)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function fmtDateLong(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`)
  if (Number.isNaN(d.getTime())) return dateKey
  return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * «mar 18» — el día en corto, para turnos que cruzan la medianoche.
 *
 * ⚠ Shoplogix fecha el turno por su día de INICIO: el nocturno que arranca
 * 21:30 del lunes 17 y cierra 05:15 del martes 18 se llama «17 Aug». En planta
 * ese mismo turno es «el turno noche del 18». No se pelea con la fuente —el
 * dateKey sigue siendo el de Shoplogix, que es lo que empareja los documentos—
 * pero la cabecera muestra los DOS días para que nadie tenga que adivinar de
 * cuál se está hablando.
 */
function fmtDiaCorto(d: Date): string {
  /* timeZone UTC porque los ISO del monitor son wall-clock: el instante YA es
     hora de planta. Sin esto, un celular en otro huso muestra otro día. */
  return d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
}

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))
const fmtDec = (n: number, d = 1) =>
  (n || 0).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Velocidades de máquina: enteras se leen mejor sin el ",0". */
function fmtCpm(n: number): string {
  return Number.isInteger(n) ? fmtInt(n) : fmtDec(n)
}

function fmtDurationSec(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  // Las micro detenciones duran menos de un minuto: redondeadas se leían
  // "0 min", que no existe. Bajo el minuto se muestran en segundos.
  if (sec < 60) return `${Math.round(sec)} s`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/** "hace 3 min" a partir de un timestamp UTC real. */
function fmtAgo(isoStr: string | null | undefined, nowMs: number): string {
  if (!isoStr) return 'sin dato'
  const t = new Date(isoStr).getTime()
  if (Number.isNaN(t)) return 'sin dato'
  const sec = Math.max(0, Math.round((nowMs - t) / 1000))
  if (sec < 60) return 'recién'
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  return `hace ${h} h`
}

/**
 * "hace X" de un timestamp de TURNO (wall-clock). El reloj de referencia
 * también hay que llevarlo a wall-clock de planta o el resultado se corre las
 * horas del huso.
 */
function fmtAgoWall(isoStr: string | null | undefined, nowMs: number): string {
  if (!isoStr) return ''
  const t = new Date(isoStr).getTime()
  if (Number.isNaN(t)) return ''
  const nowWall = nowMs - new Date(nowMs).getTimezoneOffset() * 60_000
  const sec = Math.max(0, Math.round((nowWall - t) / 1000))
  if (sec < 60) return 'recién'
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `hace ${h} h ${m} min` : `hace ${h} h`
}

// ── Piezas de UI ────────────────────────────────────────────────────────────

function Kpi({
  label, value, unit, icon, hint, sub, spark, lectura, tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  icon: React.ReactNode
  hint?: string
  /** Segunda medida, con su denominador escrito (ej. el ritmo de reloj). */
  sub?: string
  /** Miniatura de los últimos turnos con la banda normal (ver `Chispa`). */
  spark?: React.ReactNode
  /**
   * El veredicto del número contra su contexto — la guía lo resume: la tarjeta
   * tiene que contestar sola «¿esto está bien?». `null` = sin contexto todavía.
   */
  lectura?: { texto: string; tono: 'bien' | 'mal' | 'normal' } | null
  tone?: 'default' | 'accent'
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      {/* Roles de la piel (§2 del HIG): caption para el encabezado de grupo
          (es EL rol sancionado en mayúsculas), title1 para el dato — «nunca
          inventar tamaño»: el stat 30/700 no está en la escala del config y el
          rol existente más cercano es title1. */}
      <div className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-title1 tabular-nums ${tone === 'accent' ? 'text-sky-700 dark:text-sky-300' : 'text-foreground'}`}>
          {value}
        </span>
        {unit && <span className="text-footnote text-muted-foreground/70">{unit}</span>}
      </div>
      {/* A todo el ancho, bajo el número: con días y bordes rotulados el spark
          dejó de ser miniatura y necesita la fila completa. */}
      {spark}
      {hint && <div className="mt-0.5 text-caption text-muted-foreground/70">{hint}</div>}
      {lectura && (
        <div
          className={`mt-0.5 text-caption leading-snug ${
            lectura.tono === 'bien'
              ? 'font-semibold text-emerald-700 dark:text-emerald-400'
              : lectura.tono === 'mal'
                ? 'font-semibold text-red-700 dark:text-red-400'
                : 'text-muted-foreground'
          }`}
        >
          {lectura.texto}
        </div>
      )}
      {sub && (
        <div className="mt-0.5 text-caption tabular-nums text-muted-foreground">{sub}</div>
      )}
    </div>
  )
}

/** «x13» — el día de un turno en dos-tres caracteres, para el pie del spark. */
function diaCorto(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ''
  return 'dlmxjvs'[d.getUTCDay()]! + d.getUTCDate()
}

/**
 * La semana de la línea, con identidad: banda de rango normal con sus BORDES
 * rotulados, un día bajo cada punto (y tooltip con el valor), y HOY con anillo
 * de acento. Antes era una miniatura muda de 86 px: escondía la noticia de la
 * semana (la línea venía acelerando y aflojó) y el rango había que leerlo en
 * el texto.
 *
 * ⚠ El SVG va estirado (`preserveAspectRatio="none"`): adentro SOLO geometría
 * con trazo no escalable — texto, puntos y redondeos van en HTML encima, que
 * es la lección que ya nos costó una vez en el gráfico grande.
 */
function Chispa({ turnos, hoy, banda }: {
  turnos: Array<{ dateKey: string; ritmo: number }>
  hoy: number
  banda: { min: number; max: number }
}) {
  const todos = [...turnos.map((t) => t.ritmo), hoy, banda.min, banda.max]
  const lo = Math.min(...todos)
  const hi = Math.max(...todos)
  const span = hi - lo || 1
  // En % del alto, con 12% de aire arriba y abajo.
  const yPct = (v: number) => 88 - ((v - lo) / span) * 76
  const puntos = [...turnos.map((t) => t.ritmo), hoy]
  const xPct = (i: number) => (i / Math.max(1, puntos.length - 1)) * 100
  return (
    <div className="mt-1.5" aria-hidden>
      <div className="flex items-stretch gap-1.5">
        <div className="relative h-16 min-w-0 flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
            <rect
              x="0"
              y={yPct(banda.max)}
              width="100"
              height={Math.max(3, yPct(banda.min) - yPct(banda.max))}
              className="fill-muted-foreground/15"
            />
            <polyline
              points={puntos.map((v, i) => `${xPct(i)},${yPct(v)}`).join(' ')}
              fill="none"
              strokeWidth="1.8"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-muted-foreground/70"
            />
          </svg>
          {/* Los puntos en HTML: un círculo dentro del SVG estirado sale elipse. */}
          {puntos.map((v, i) => (
            <span
              key={i}
              title={`${i < turnos.length ? nombreDeDia(turnos[i]!.dateKey) : 'hoy'} · ${fmtDec(v)} pz/min`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                i === puntos.length - 1
                  ? 'h-2.5 w-2.5 bg-primary ring-2 ring-primary/35'
                  : 'h-1.5 w-1.5 bg-muted-foreground/70'
              }`}
              style={{ left: `${xPct(i)}%`, top: `${yPct(v)}%` }}
            />
          ))}
        </div>
        {/* Los bordes de la banda, rotulados: el rango se LEE, no se adivina. */}
        <div className="relative w-7 shrink-0 text-caption tabular-nums text-muted-foreground/70">
          <span className="absolute -translate-y-1/2" style={{ top: `${yPct(banda.max)}%` }}>
            {fmtDec(banda.max)}
          </span>
          <span className="absolute -translate-y-1/2" style={{ top: `${yPct(banda.min)}%` }}>
            {fmtDec(banda.min)}
          </span>
        </div>
      </div>
      <div className="mr-8 flex justify-between text-caption tabular-nums text-muted-foreground/70">
        {turnos.map((t) => (
          <span key={t.dateKey}>{diaCorto(t.dateKey)}</span>
        ))}
        <span className="font-semibold text-brand-ink">hoy</span>
      </div>
    </div>
  )
}

/**
 * Editor inline del set point, calcado del «Cambiar» del cierre: visible solo
 * con sesión de supervisor. Pide el MÉTODO además del número — un set point
 * sin cómo se midió es el hardcodeo de vuelta, con otra ropa.
 */
function EditorSetPoint({ actual, onGuardar }: {
  actual: number | null
  onGuardar: (cpm: number, metodo: string) => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState('')
  const [metodo, setMetodo] = useState('cronómetro en mano · silletas/min en la alimentación')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => { setValor(actual != null ? String(actual) : ''); setAbierto(true); setError(null) }}
        className="tap-44 rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
      >
        Cambiar
      </button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-[11px] tabular-nums"
        aria-label="Set point en piezas por minuto"
      />
      <input
        type="text"
        value={metodo}
        onChange={(e) => setMetodo(e.target.value)}
        className="w-52 rounded border border-border bg-background px-1.5 py-0.5 text-[10px]"
        aria-label="Cómo se midió"
        placeholder="cómo se midió"
      />
      <button
        type="button"
        disabled={guardando}
        onClick={async () => {
          const cpm = Number(valor.replace(',', '.'))
          if (!(cpm > 0) || cpm > 60) { setError('entre 1 y 60'); return }
          setGuardando(true)
          try { await onGuardar(cpm, metodo); setAbierto(false) }
          catch { setError('no se pudo guardar') }
          finally { setGuardando(false) }
        }}
        className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
      >
        Guardar
      </button>
      <button type="button" onClick={() => setAbierto(false)} className="text-[10px] text-muted-foreground underline">
        cancelar
      </button>
      {error && <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>}
    </span>
  )
}

/** Barras de 5 min. SVG puro — sin librerías de gráficos en el bundle público. */
/**
 * Barras de 5 min con eje de horas, ritmo de referencia y las detenciones
 * ubicadas encima.
 *
 * El gráfico anterior decía CUÁNTO se produjo y nada más: 106 barras sin
 * referencia de ritmo, sin horas y con los baches mudos. Las tres capas de acá
 * responden lo que se pregunta quien lo mira — si el ritmo fue bueno, a qué
 * hora fue la caída y por qué. SVG puro, sin librerías de gráficos.
 */
function Sparkbars({
  series, stopReasons, stopEvents, comments, causaSel, onCausa, tramoSel, breaks,
  requiredPerMinute, medianCpm, setCpm, fuenteSetPoint, onGuardarSetPoint, ventana, onVentana,
}: {
  /** Ventana visible compartida con el comparador (minutos de turno). */
  ventana?: Ventana | null
  onVentana?: (v: Ventana | null) => void
  /** Ritmo de la última media hora, para la cabecera. */
  /** Ritmo que la meta exige ahora mismo, si hay meta. */
  requiredPerMinute?: number | null
  /** Mediana de los turnos anteriores, en pz/min de reloj. */
  medianCpm?: number | null
  /**
   * Velocidad a la que corre la máquina, en pz/min. La escala llega hasta ella
   * a propósito: con la curva orbitando en 10 y el techo dibujado en 18, el
   * espacio vacío entre las dos ES el llenado de silletas que falta. Sin esa
   * referencia el gráfico se autoescala y todo turno parece igual de lleno.
   */
  setCpm?: number | null
  /** De dónde salió el set point (fecha y método): la fuente es parte del dato. */
  fuenteSetPoint?: string | null
  /** Presente solo para supervisores logueados: habilita el editor inline. */
  onGuardarSetPoint?: (cpm: number, metodo: string) => Promise<void>
  series: PublicMonitorLive['series']
  stopReasons?: string[]
  stopEvents?: PublicMonitorLive['stopEvents']
  comments?: PublicMonitorLive['comments']
  causaSel: string | null
  onCausa: (c: string | null) => void
  /**
   * UNA parada concreta, en minutos de turno. Cuando está, la banda marcada es
   * SOLO esa: con «Micro Detencion» seleccionada se pintaban las 40 y era
   * imposible saber cuál se tocó ni medir su largo.
   */
  tramoSel?: Ventana | null
  /**
   * Paradas de convenio, de fondo: las mismas bandas grises del comparador y
   * de la curva de velocidad, y de la MISMA fuente (`comparacion.breaks`).
   *
   * ⚠⚠ El intento anterior las dibujaba desde `stopEvents` y salían 23 bandas
   * de ancho mínimo en vez de una. La razón: `stopEvents` trae TODAS las
   * detenciones —56 el 13-08, 28 el 14-08, casi todas micro-detenciones de 15
   * a 90 segundos— y su campo `r` es un ÍNDICE a `stopReasons`, no el nombre
   * de la causa. Filtrando por las causas de `timeBreakdown.planned`, que es
   * lo que hace `plannedBreaks()`, quedan 3 el 13-08 y 2 el 14-08.
   */
  breaks?: PlannedBreak[]
}) {
  /** Tramo bajo el cursor (o tocado en el celular). null = ninguno. */
  const [foco, setFoco] = useState<number | null>(null)
  /**
   * Qué series se dibujan. "Solo línea" para leer la forma del turno, "solo
   * barras" para cazar el tramo puntual. Se recuerda, como los bloques
   * plegados: quien prefiere una vista no tiene que volver a elegirla en cada
   * refresco (el monitor se refresca solo cada 30 s).
   */
  const [ver, setVer] = useState<'ambas' | 'barras' | 'linea'>(() => {
    try {
      const v = localStorage.getItem('monitor-grafico-ver')
      return v === 'barras' || v === 'linea' ? v : 'ambas'
    } catch {
      return 'ambas'
    }
  })
  const elegirVer = (v: 'ambas' | 'barras' | 'linea') => {
    setVer(v)
    try { localStorage.setItem('monitor-grafico-ver', v) } catch { /* modo privado */ }
  }

  /*
   * Zoom por gesto y ventana compartida con el comparador: los dos gráficos
   * miran el mismo turno por el mismo eje, así que acercarse en uno mueve al
   * otro al mismo tramo. El mecanismo vive en `useZoomGesto`.
   */
  const g = useZoomGesto({
    dominioMin: (series?.length ?? 0) * 5,
    ventana,
    onVentana,
  })
  const zoom = g.zoom
  if (!series || series.length === 0) return null

  const max = Math.max(...series.map(p => p.pieces), 1)
  const W = 100
  const H = 100

  /*
   * ── La escala vertical, en pz/min ───────────────────────────────────────
   *
   * Antes el gráfico se autoescalaba al máximo del turno y no tenía eje: la
   * altura de una barra no se traducía a ningún número y había que tocarla
   * para saber cuánto fue. Peor: cada turno se dibujaba contra su propio
   * máximo, así que todos parecían igual de llenos.
   *
   * Ahora la escala llega hasta la velocidad de la MÁQUINA (redondeada a un
   * múltiplo de 5) y el espacio vacío entre la curva y ese techo es, dibujado,
   * el llenado de silletas que falta. Una sola unidad para barras y línea:
   * pz/min. Las barras son las piezas del tramo divididas por 5, así que
   * comparten escala — dos ejes para el mismo dato es la receta clásica para
   * leer mal un gráfico.
   */
  const maxCpm = max / 5
  const tope = Math.max(maxCpm, setCpm ?? 0)
  const pasoY = tope > 12 ? 5 : tope > 6 ? 2 : 1
  const escala = Math.ceil(tope / pasoY) * pasoY
  const marcasY: number[] = []
  for (let v = 0; v <= escala + 0.001; v += pasoY) marcasY.push(v)
  /** Altura en el viewBox de un valor en pz/min. */
  const yDeCpm = (cpm: number) => H - (cpm / escala) * H
  /** Lo mismo para un tramo, que viene en piezas. */
  const yDePiezas = (piezas: number) => yDeCpm(piezas / 5)
  /** Alto real del área de dibujo. En px: el root corre al 85% y los rem encogen. */
  const ALTO = 170
  /*
   * ⚠⚠ El paso sale del ancho DISPONIBLE, no de un mínimo por barra.
   *
   * Antes: `bw = max(0.5, W/n - gap)` con `gap = 0.6`, y cada barra en
   * `i * stepX`. Con un turno largo —118 tramos el 13-08— el paso queda
   * en 1,1 y el contenido llega hasta x=129 dentro de un viewBox de 100: **las
   * últimas 15 barras se dibujaban FUERA del área visible**. Más de una hora
   * de producción que nadie veía, justo la cola donde vive la hora extra.
   *
   * Ahora el paso es `W / n` siempre y la barra ocupa el 70% de su paso: el
   * turno entra completo cualquiera sea su largo, y para mirar de cerca está
   * el zoom.
   */
  const stepX = W / series.length
  const bw = Math.max(0.3, stepX * 0.7)

  /*
   * La MEDIA MÓVIL DE 15 MIN sobre las barras. Es lo que antes vivía en un
   * segundo gráfico —"Velocidad de la línea"— que dibujaba exactamente esta
   * misma serie de 5 min, uno en piezas y el otro en pz/min. Dos tarjetas para
   * el mismo dato: la tendencia va encima de su propio detalle.
   *
   * ⚠ Se corta la cola de tramos en CERO del final: cuando la línea deja de
   * producir, la serie sigue trayendo tramos vacíos y la media los promedia,
   * así que la curva termina cayendo al suelo y el turno parece desplomarse
   * cuando en realidad terminó. Los ceros del MEDIO se conservan: esos sí son
   * información (la colación, una falla).
   */
  /* ⚠ La media vive en `monitorRitmo`, no acá: el número protagonista de la
     tarjeta de arriba es el ÚLTIMO PUNTO de esta misma curva, y con dos
     cálculos separados podían divergir sin que nadie lo notara. */
  const media = mediaMovil(series)
  /* Dónde termina la parte con datos: `mediaMovil` ya corta la cola de ceros,
     así que su largo ES ese corte. La línea cruda usa el mismo. */
  const fin = media.length
  const lineaMedia = media.map((v, i) => `${i * stepX + bw / 2},${yDePiezas(v)}`).join(' ')
  /*
   * La serie CRUDA de 5 min, la que manda Shoplogix. Con las barras a la vista
   * ya está dibujada —son el mismo dato—, pero en "solo línea" desaparecería y
   * el gráfico pasaría a mostrar únicamente un promedio. Así que en ese modo
   * vuelve como línea tenue: la media encima, el dato crudo detrás.
   */
  const lineaCruda = series
    .slice(0, fin)
    .map((p, i) => `${i * stepX + bw / 2},${yDePiezas(p.pieces || 0)}`)
    .join(' ')

  /*
   * Las referencias del ritmo, ya en la escala del eje. Solo se dibujan si
   * CABEN: con la meta pidiendo 53 pz/min y el mejor tramo en 14,6, la línea
   * de "necesitás" estiraba el eje al cuádruple y aplastaba el turno entero
   * contra el piso. Cuando no cabe, el número se dice en la leyenda en vez de
   * deformar el gráfico.
   */
  const refs = [
    { cpm: requiredPerMinute ?? 0, label: 'necesitás', clase: 'stroke-amber-600 dark:stroke-amber-400' },
    { cpm: medianCpm ?? 0, label: 'promedio de turno', clase: 'stroke-muted-foreground/60' },
  ].filter((r) => r.cpm > 0)
  const refsDibujables = refs.filter((r) => r.cpm <= escala)
  const refsFuera = refs.filter((r) => r.cpm > escala)

  // ⚠ La serie NO es continua: solo trae los tramos que el sensor registró, y
  // durante una parada larga puede faltar más de uno. Por eso la posición de un
  // paro se busca en la serie (índice del bucket que lo contiene) en vez de
  // calcularse por tiempo transcurrido — ese atajo dejaba las bandas corridas
  // varios tramos a la derecha y algunas fuera del gráfico.
  const tiempos = series.map(p => new Date(p.t).getTime())
  const paso = 5 * 60_000

  /** Índice del tramo que contiene `ms`, o el más cercano dentro del rango. */
  const indiceDe = (ms: number) => {
    if (ms <= tiempos[0]!) return 0
    for (let i = tiempos.length - 1; i >= 0; i--) {
      if (ms >= tiempos[i]!) return i
    }
    return 0
  }

  /**
   * Posición horizontal EXACTA de un instante, con su fracción dentro del
   * tramo.
   *
   * ⚠ Antes se dibujaba por índice de tramo y con un ancho mínimo de 0,6
   * barras: una microparada de 15 s pintaba media barra de 5 min y parecía
   * durar veinte veces más de lo que duró. La posición sigue buscándose por
   * ÍNDICE (la serie no es continua), pero adentro del tramo se interpola.
   */
  const xDe = (ms: number) => {
    const i = indiceDe(ms)
    const frac = Math.min(1, Math.max(0, (ms - tiempos[i]!) / paso))
    return (i + frac) * stepX
  }

  /*
   * Ancho mínimo de una banda: lo justo para que un paro corto se VEA, sin
   * fingir que duró más. Antes el piso era 0,6 barras (≈3 min de los 5 del
   * tramo) y una microparada de 15 s se dibujaba como si fuera eterna.
   */
  const ANCHO_MIN = Math.min(0.25, bw * 0.25)
  const bandaDe = (desde: number, hasta: number, key: string) => {
    const x = xDe(desde)
    return { x, ancho: Math.max(xDe(hasta) - x, ANCHO_MIN), key }
  }



  /*
   * Fondo de convenio. Solo las que explican un hueco VISIBLE: una parada de
   * 5 min pinta un puntito gris que ensucia en vez de explicar. Y la posición
   * se busca por ÍNDICE en la serie, no por aritmética de tiempo — la serie no
   * es continua y ese atajo corre las bandas a la derecha.
   */
  /*
   * Fondo de convenio: solo las paradas que explican un hueco VISIBLE. El piso
   * de 15 min (3 tramos) es lo que separa la colación —43 min el 13-08, ocho
   * barras en cero seguidas— de la reunión de inicio de 5 min, que pinta un
   * puntito gris y ensucia en vez de explicar. Con ese piso, el 13-08 queda
   * UNA banda: la colación.
   *
   * `comparacion.breaks` incluye el PRONÓSTICO de las paradas que todavía no
   * ocurrieron (para aplanar la curva de la cuota). Acá no van: este gráfico
   * solo llega hasta el último tramo con dato, y una banda futura terminaría
   * clavada contra el borde derecho, sobre producción real.
   */
  const convenio = (breaks ?? [])
    /*
     * El piso baja de 15 a 3 min: el motivo del umbral alto era que la banda
     * se dibujaba por índice con un mínimo de UN TRAMO, así que una reunión de
     * 5 min pintaba lo mismo que la colación de 43 y ensuciaba sin explicar.
     * Con el ancho real, 5 min miden 5 min — y esconder una parada de convenio
     * porque es corta era esconder tiempo que sí ocurrió.
     */
    .filter((b) => b.toMin - b.fromMin >= 3)
    .map((b) => {
      const desde = tiempos[0]! + b.fromMin * 60_000
      const hasta = tiempos[0]! + b.toMin * 60_000
      return { b, desde, hasta }
    })
    .filter(({ desde }) => desde < tiempos[tiempos.length - 1]!)
    // Mismo trazo que las paradas: posición y ancho por TIEMPO, no por índice.
    .map(({ b, desde, hasta }) => bandaDe(desde, hasta, `${b.fromMin}-${b.toMin}`))

  // Bandas de la causa elegida. Se dibujan primero para quedar DETRÁS de las
  // barras: la producción es el dato, la detención es el contexto.
  const bandas = tramoSel
    ? [bandaDe(
        tiempos[0]! + tramoSel.desdeMin * 60_000,
        tiempos[0]! + tramoSel.hastaMin * 60_000,
        `tramo-${tramoSel.desdeMin}-${tramoSel.hastaMin}`,
      )]
    : causaSel && stopEvents && stopReasons
    ? stopEvents
        .filter(e => stopReasons[e.r] === causaSel)
        // La key lleva el índice: dos paros pueden arrancar en el MISMO
        // instante con distinta duración, y con `e.f` sola React los tomaba
        // por el mismo elemento.
        .map((e, i) => {
          const desde = new Date(e.f).getTime()
          return bandaDe(desde, desde + e.s * 1000, `${e.f}-${e.s}-${i}`)
        })
    : []

  /*
   * Marcas de hora ubicadas por ÍNDICE de tramo, no repartidas parejo: van
   * dentro del contenedor con scroll, así que tienen que viajar con el gráfico
   * al hacer zoom. Repartidas por porcentaje del ancho visible se quedaban
   * quietas y el eje pasaba a mentir apenas uno deslizaba.
   *
   * Una marca por hora con zoom, y de a dos horas sin él, para que en un
   * celular no se amontonen.
   */
  const cadaN = zoom >= 2 ? 12 : 24
  const marcas = series.map((p, i) => ({ t: p.t, i })).filter((m) => m.i % cadaN === 0)

  /** La detención que cae dentro de un tramo — para el detalle al recorrerlo. */
  const paroEnTramo = (i: number) => {
    if (!stopEvents || !stopReasons) return null
    const desde = tiempos[i]!
    const hasta = desde + paso
    /*
     * ⚠⚠ Antes: `.find()` — el PRIMER evento que rozara el tramo, con su
     * duración completa. En el tramo 08:25-08:30 del 12-08 había tres paradas
     * (15 s + 15 s + los primeros 24 s de una de 75 s) y el chip decía «Micro
     * Detencion 15 s»: ni la parada más larga, ni el total, ni lo que cabía en
     * el tramo. Ahora se suma lo que CADA parada pasó DENTRO del tramo, que es
     * lo único que ese tramo puede afirmar.
     */
    let sec = 0
    let cuantas = 0
    const porCausa = new Map<string, number>()
    for (const x of stopEvents) {
      const a = new Date(x.f).getTime()
      const b = a + x.s * 1000
      const solape = Math.min(b, hasta) - Math.max(a, desde)
      if (solape <= 0) continue
      const causa = stopReasons[x.r]
      if (!causa) continue
      sec += solape / 1000
      cuantas += 1
      porCausa.set(causa, (porCausa.get(causa) ?? 0) + solape / 1000)
    }
    if (cuantas === 0) return null
    const [causa] = [...porCausa.entries()].sort((a, b) => b[1] - a[1])[0]!
    return {
      causa,
      sec: Math.round(sec),
      cuantas,
      /** Más de una causa en el mismo tramo: el chip no puede nombrar una sola. */
      variasCausas: porCausa.size > 1,
    }
  }

  /** Lo que el operador escribió sobre lo que pasó en ese tramo. */
  const comentarioEnTramo = (i: number) => {
    if (!comments || comments.length === 0) return null
    const desde = tiempos[i]!
    const hasta = desde + paso
    const c = comments.find((x) => {
      if (!x.f) return false
      const a = new Date(x.f).getTime()
      const b = x.h ? new Date(x.h).getTime() : a + paso
      // Un comentario que cubre 3 horas no describe un tramo de 5 minutos.
      if (b - a > 2 * 60 * 60_000) return false
      return a < hasta && b > desde
    })
    return c ? c.t : null
  }

  const detalle = foco != null && series[foco]
    ? {
        hora: fmtWallTime(series[foco]!.t),
        hasta: fmtWallTime(new Date(tiempos[foco]! + paso).toISOString()),
        pz: series[foco]!.pieces,
        paro: paroEnTramo(foco),
        comentario: comentarioEnTramo(foco),
      }
    : null

  /** El tramo elegido a partir de la posición del puntero dentro del gráfico. */
  const tramoEn = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect()
    const i = Math.floor(((clientX - r.left) / r.width) * series.length)
    return Math.min(series.length - 1, Math.max(0, i))
  }

  return (
    <div id="grafico-turno" className="scroll-mt-4 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-muted-foreground">
        <span>
          Velocidad de la línea
          <span className="normal-case tracking-normal text-muted-foreground/70"> · tramos de 5 min</span>
        </span>
        {/* OJO — Acá había un «N pz/min ahora» que salía de `recentPerMinute` —otra
            ventana móvil— mientras la regla de arriba muestra el último punto de
            ESTA curva: se veían 4,6 arriba y 2,1 acá, dos verdades para el mismo
            instante. Es exactamente el problema que este rediseño vino a cerrar,
            así que el número vive en UN solo lugar y el gráfico solo lo dibuja. */}
        {causaSel && (
          <button
            onClick={() => onCausa(null)}
            className="rounded-full"
          >
            <Pill tone="critical" className="normal-case">{causaSel} ✕</Pill>
          </button>
        )}
      </div>

      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">pz/min</div>

      {/* ⚠ El eje Y va FUERA del contenedor con scroll y el X adentro: al
          revés, las horas se quedan quietas mientras el gráfico se desplaza y
          el eje pasa a mentir (ya ocurrió en este mismo gráfico), y los
          números del eje vertical se irían de pantalla al panear. */}
      <div className="relative mt-1">
        <div
          className="pointer-events-none absolute left-0 top-0 z-10 w-7"
          style={{ height: ALTO }}
          aria-hidden
        >
          {marcasY.map((v) => (
            <span
              key={v}
              className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground/70"
              style={{ top: `${(1 - v / escala) * 100}%` }}
            >
              {fmtInt(v)}
            </span>
          ))}
        </div>

      <div
        {...g.props}
        className={`ml-7 overflow-x-auto ${g.acercado ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{ touchAction: g.acercado ? 'pan-x' : 'auto' }}
      >
      <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full"
           style={{ height: ALTO }}
           role="img"
           data-zoom={zoom}
           onMouseMove={(ev) => setFoco(tramoEn(ev.clientX, ev.currentTarget))}
           onMouseLeave={() => setFoco(null)}
           onClick={(ev) => setFoco(tramoEn(ev.clientX, ev.currentTarget))}
           aria-label="Velocidad de la línea por tramos de cinco minutos">
        {/* El convenio primero: es el fondo del fondo. La causa elegida se
            dibuja encima, y las barras encima de las dos. */}
        {convenio.map(b => (
          <rect key={b.key} x={b.x} y={0} width={b.ancho} height={H}
                className="fill-muted-foreground/15" />
        ))}

        {bandas.map(b => (
          <rect key={b.key} x={b.x} y={0} width={b.ancho} height={H}
                className="fill-rose-500/25 stroke-rose-500/60" strokeWidth={0.15} />
        ))}

        {/* Las guías del eje: la forma del turno se lee sin tocar nada. */}
        {marcasY.filter((v) => v > 0 && v !== setCpm).map((v) => (
          <line key={v} x1={0} x2={W} y1={yDeCpm(v)} y2={yDeCpm(v)}
                className="stroke-muted-foreground/15" strokeWidth={0.2}
                vectorEffect="non-scaling-stroke" />
        ))}

        {/* ⚠ El techo de la MÁQUINA, no el mejor tramo del turno. Antes la
            referencia era el máximo alcanzado, que es una consecuencia y no un
            límite: contra sí mismo todo turno se ve lleno. Con la velocidad
            configurada, el hueco entre la curva y esta línea es el llenado de
            silletas que falta. */}
        {setCpm != null && setCpm > 0 && setCpm <= escala && (
          <line x1={0} x2={W} y1={yDeCpm(setCpm)} y2={yDeCpm(setCpm)}
                className="stroke-amber-600 dark:stroke-amber-400" strokeWidth={0.9}
                strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        )}

        {/* Las referencias de ritmo que CABEN en la escala (ver `refs`). */}
        {refsDibujables.map((r) => (
          <line key={r.label} x1={0} x2={W} y1={yDeCpm(r.cpm)} y2={yDeCpm(r.cpm)}
                className={r.clase} strokeWidth={0.6} strokeDasharray="2 2"
                vectorEffect="non-scaling-stroke" />
        ))}

        {ver !== 'linea' && series.map((p, i) => {
          const y = yDePiezas(p.pieces)
          return (
            <rect
              key={p.t}
              x={i * stepX}
              y={y}
              width={bw}
              height={Math.max(0, H - y)}
              /*
               * ⚠ Sin `rx` y con `crispEdges`. El SVG se estira con el zoom
               * (`preserveAspectRatio="none"`), así que una esquina redondeada
               * de 0,4 unidades se deforma en una elipse —ancha en x, plana en
               * y— y los bordes suavizados caen entre píxeles: las barras se
               * ven "pixeladas" y de anchos distintos al acercarse. Con las
               * esquinas rectas y el suavizado apagado quedan nítidas en
               * cualquier zoom.
               */
              shapeRendering="crispEdges"
              className={p.pieces > 0
                ? 'fill-sky-500/40 dark:fill-sky-400/30'
                : 'fill-muted-foreground/15'}
            >
              <title>{`${fmtWallTime(p.t)} · ${fmtInt(p.pieces)} pz · ${fmtDec(p.pieces / 5)} pz/min`}</title>
            </rect>
          )
        })}

        {/* La tendencia, encima de su propio detalle: con 5 min a secas una
            micro-detención parece un desplome, con 30 el cambio de ritmo tarda
            media hora en notarse. 15 es el compromiso que pidió Orel.
            Las barras quedaron al 35%: antes competían con la curva —mismo
            tono, línea de 1 px— y la tendencia se perdía entre ellas. */}
        {ver === 'linea' && fin >= 3 && (
          <polyline points={lineaCruda} fill="none"
                    className="stroke-sky-500/40 dark:stroke-sky-400/30"
                    strokeWidth={1} strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke" />
        )}

        {ver !== 'barras' && media.length >= 3 && (
          <polyline points={lineaMedia} fill="none"
                    className="stroke-sky-700 dark:stroke-sky-200"
                    strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"
                    vectorEffect="non-scaling-stroke" />
        )}

        {/* El tramo bajo el cursor, marcado sobre las barras. */}
        {foco != null && (
          <rect x={foco * stepX} y={0} width={bw} height={H} className="fill-foreground/30" />
        )}
      </svg>

      {/* El eje viaja DENTRO del contenedor con scroll: afuera, al deslizar el
          gráfico las horas se quedaban quietas y dejaban de corresponder. */}
      <div className="relative mt-1 h-4">
        {marcas.map((m) => {
          const pct = ((m.i + 0.5) / series.length) * 100
          /*
           * Las marcas de los extremos se anclan al borde y no al centro: con el
           * centrado de siempre media etiqueta quedaba fuera del contenedor y se
           * leía ":40" en vez de "07:40".
           */
          const anclaje = pct < 6 ? 'none' : pct > 94 ? 'translateX(-100%)' : 'translateX(-50%)'
          return (
            <span
              key={m.t}
              className="absolute top-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground/70"
              style={{ left: `${pct}%`, transform: anclaje }}
            >
              {fmtWallTime(m.t)}
            </span>
          )
        })}
      </div>
      </div>
      </div>
      </div>

      {/* Detalle del tramo. Alto fijo para que el bloque no salte al entrar y
          salir el cursor. */}
      <div className="mt-1 min-h-[2.5rem] rounded-lg bg-muted/60 px-2 py-1 text-[11px]">
        {detalle ? (
          <>
            <span className="tabular-nums text-foreground">{detalle.hora}-{detalle.hasta}</span>
            <span className="tabular-nums text-foreground/90"> - {fmtInt(detalle.pz)} pz</span>
            <span className="tabular-nums text-muted-foreground">
              {' '}({fmtDec(detalle.pz / 5, 1)} pz/min)
            </span>
            {detalle.paro && (
              /* Lo que ese tramo estuvo parado, sumando las paradas que caen
                 DENTRO de él — no la duración de una sola. */
              <span className="text-rose-700 dark:text-rose-300">
                {' '}- {detalle.paro.variasCausas ? 'detenida' : detalle.paro.causa}{' '}
                {fmtDurationSec(detalle.paro.sec)}
                {detalle.paro.cuantas > 1 && ` en ${detalle.paro.cuantas} paradas`}
              </span>
            )}
            {/* El comentario del operador es el unico texto en castellano del
                turno: explica la causa mucho mejor que la etiqueta. */}
            {detalle.comentario && (
              <div className="mt-0.5 italic text-muted-foreground">{detalle.comentario}</div>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/60">
            Pasá el dedo o el mouse por el gráfico para ver el detalle de cada tramo.
          </span>
        )}
      </div>

      {/* Qué se dibuja, y cómo se acerca. Los botones 1×/2×/4×/8× se fueron:
          el gesto es pellizcar o rodar la rueda, y arrastrar para moverse. Lo
          que NO puede faltar es la salida — un zoom sin "ver todo" visible es
          peor que ninguno, porque quien se pierde no sabe volver. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/70">
        {([['ambas', 'ambas'], ['barras', 'solo barras'], ['linea', 'solo línea']] as const).map(
          ([v, texto]) => (
            <button
              key={v}
              type="button"
              onClick={() => elegirVer(v)}
              aria-pressed={ver === v}
              className={`tap-44 rounded-full border px-2 py-0.5 ${
                ver === v
                  ? 'border-transparent bg-primary/[0.13] font-semibold text-foreground'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {texto}
            </button>
          ),
        )}
        {g.acercado ? (
          <button
            type="button"
            onClick={g.verTodo}
            className="tap-44 rounded-full border border-border px-2 py-0.5 hover:bg-muted"
          >
            ver todo · {fmtDec(zoom)}×
          </button>
        ) : (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            pellizcá o rodá para acercar
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
        {ver !== 'barras' && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-[3px] w-3.5 rounded-sm bg-sky-700 dark:bg-sky-200" />
            media de 15 min
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          {ver === 'linea' ? (
            <span className="inline-block h-0.5 w-3.5 bg-sky-500/40 dark:bg-sky-400/30" />
          ) : (
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-500/40 dark:bg-sky-400/30" />
          )}
          tramos de 5 min <span className="text-muted-foreground/60">(el dato crudo)</span>
        </span>
        {/* El techo de la máquina, no el mejor tramo: es lo que hace que el
            hueco de arriba signifique algo. */}
        {setCpm != null && setCpm > 0 && setCpm <= escala && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-3 border-t-2 border-dashed border-amber-600 dark:border-amber-400" />
            <span className="tabular-nums">{fmtCpm(setCpm)}</span> lo que da la máquina
            {/* Editado por un supervisor: 18 medidos con cronómetro no es un
                dato del PLC, y presentarlo sin fuente lo hacía parecer uno. */}
            {fuenteSetPoint && (
              <span
                className="cursor-help border-b border-dotted border-muted-foreground/50 text-muted-foreground/80"
                title={fuenteSetPoint}
              >
                ⓘ
              </span>
            )}
            {onGuardarSetPoint && <EditorSetPoint actual={setCpm} onGuardar={onGuardarSetPoint} />}
          </span>
        )}
        {refsDibujables.map((r) => (
          <span key={r.label} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-3 border-t border-dashed ${
              r.label === 'necesitás' ? 'border-amber-600 dark:border-amber-400' : 'border-muted-foreground/60'
            }`} />
            {r.label} <span className="tabular-nums">{fmtDec(r.cpm)}</span>
          </span>
        ))}
        {/* Fuera de escala: el número se dice, pero no se dibuja — estirar el
            eje hasta él aplastaba el turno entero contra el piso. */}
        {refsFuera.map((r) => (
          <span key={r.label} className="inline-flex items-center gap-1">
            {r.label} <span className="tabular-nums">{fmtDec(r.cpm)}</span> pz/min
            <span className="text-muted-foreground/50">(fuera del gráfico)</span>
          </span>
        ))}
        {convenio.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/15" />
            parada de convenio
          </span>
        )}
        {causaSel && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-500/25 ring-1 ring-rose-500/60" />
            {causaSel}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * "¿A qué ritmo tengo que ir para llegar?" — la línea accionable de la meta.
 *
 * Debajo de la barra de avance, que dice dónde estás, esto dice qué hacer: las
 * piezas que faltan, el tiempo que queda y el ritmo necesario de acá al cierre.
 *
 * ⚠ Cuando ese ritmo supera el techo de la línea lo dice sin rodeos. Un
 * "necesitás 61 pz/min" en una línea que da 46 no es una meta, es una cifra que
 * hace perder la confianza en la pantalla — y la decisión correcta ahí no es
 * apurar, es replanificar.
 */
/**
 * De dónde sale la hora de cierre — y, si quien mira es admin, cómo cambiarla.
 *
 * Sin esta línea el "faltan 3 h 20 min" es un número sin dueño. Con ella se
 * puede discutir: dice si salió de los turnos anteriores o si alguien la fijó.
 *
 * ⚠ El campo de edición NO es la seguridad. El doc del monitor tiene
 * `allow write: if false` —nadie lo toca desde el navegador, con sesión o sin
 * ella— y lo que se guarda va a `graderModuleConfigs`, cuyas reglas exigen
 * supervisor. Quien abre el QR sin cuenta no ve el control, y aunque lo viera,
 * Firestore rechazaría la escritura.
 */
function CierreDelTurno({ cierre, muestras, fuente, plantSlug, shiftName, startAt }: {
  cierre: string | null | undefined
  muestras: number | null | undefined
  fuente: PublicMonitorLive['plannedEndSource']
  plantSlug: string | undefined
  shiftName: string | null | undefined
  startAt: string | null | undefined
}) {
  const isAdmin = useIsAdmin()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!cierre) return null

  const puedeEditar = isAdmin && Boolean(plantSlug) && Boolean(shiftName)

  const guardar = async () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(valor.trim())
    if (!m) { setError('Usá el formato HH:MM'); return }
    const h = Number(m[1]), min = Number(m[2])
    if (h > 23 || min > 59) { setError('Hora fuera de rango'); return }
    setGuardando(true); setError(null)
    try {
      await pinShiftEnd({ plantSlug: plantSlug!, shiftName: shiftName!, endHour: h, endMinute: min, startAtIso: startAt })
      setEditando(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-0.5 text-[11px] text-muted-foreground/70">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>
          Cierre estimado <span className="tabular-nums">{fmtWallTime(cierre)}</span>
          {/*
            * `duracion` se dice distinto a propósito: no es «a qué hora
            * cerraron» sino «cuánto duraron». Es el caso de un turno sin
            * definir en Shoplogix, donde la hora cambia día a día y lo único
            * estable es la duración — quien lee tiene que saber de dónde sale
            * el número para poder desconfiar de él con criterio.
            */}
          {fuente === 'fijado'
            ? ', fijado a mano'
            : fuente === 'duracion'
            ? `, estimado sumando lo que duran los turnos de esta línea (${muestras ?? 0} turnos)`
            : muestras
            ? `, según los últimos ${muestras} turnos`
            : ', según el horario configurado'}.
        </span>
        {puedeEditar && !editando && (
          <button
            type="button"
            onClick={() => { setValor(fmtWallTime(cierre)); setEditando(true); setError(null) }}
            className="tap-44 rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
          >
            Cambiar
          </button>
        )}
      </div>

      {puedeEditar && editando && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="HH:MM"
            className="w-20 rounded-ctl border border-border bg-background px-2 py-1 text-[12px] tabular-nums text-foreground"
          />
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-ctl bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Fijar cierre'}
          </button>
          <button
            type="button"
            onClick={() => { setEditando(false); setError(null) }}
            className="rounded-ctl border border-border px-2.5 py-1 text-[11px]"
          >
            Cancelar
          </button>
          {fuente === 'fijado' && (
            <button
              type="button"
              onClick={async () => {
                setGuardando(true)
                try { await unpinShiftEnd({ plantSlug: plantSlug!, shiftName: shiftName! }); setEditando(false) }
                catch (e) { setError(e instanceof Error ? e.message : 'No se pudo quitar') }
                finally { setGuardando(false) }
              }}
              className="text-[10px] underline underline-offset-2"
            >
              volver al automático
            </button>
          )}
          <p className="basis-full text-[10px] text-muted-foreground/60">
            Se aplica a todos los turnos «{shiftName}» de esta línea. El monitor tarda
            un ciclo de sync (~5 min) en tomarlo.
          </p>
          {error && <p className="basis-full text-[11px] text-red-700 dark:text-red-300">{error}</p>}
        </div>
      )}
    </div>
  )
}

function RitmoNecesario({
  pace, cierre, muestras, fuente, plantSlug, shiftName, startAt, historial, horizonte, vsAyer,
  llenado,
}: {
  pace: PaceToTarget | null
  historial: { medianCpm: number | null; bestCpm: number | null; muestras: number | null } | null
  /**
   * El otro horizonte: hasta dónde llega el pronóstico y con qué cierre. Sin
   * esto, la respuesta a "¿llegamos?" quedaba partida entre esta tarjeta (que
   * mide hasta el horario) y el bloque del pronóstico, tres tarjetas abajo.
   */
  horizonte?: { hasta: string; estimate: number | null; mapePct: number | null } | null
  /** El día anterior a la MISMA altura de turno, y la diferencia con hoy. */
  vsAyer?: { label: string; pieces: number; diff: number } | null
  /** Velocidad de la máquina y llenado de silletas, si el modelo se conoce. */
  llenado?: LlenadoSilletas | null
  cierre: string | null | undefined
  muestras: number | null | undefined
  fuente: PublicMonitorLive['plannedEndSource']
  plantSlug: string | undefined
  shiftName: string | null | undefined
  startAt: string | null | undefined
}) {
  /* El detalle arranca cerrado: la tarjeta contesta "¿llegamos?" en tres
     líneas y el resto —ritmo requerido, techo, hora extra— se abre a pedido.
     El hook va ANTES de cualquier return. */
  const [verDetalle, setVerDetalle] = useState(false)
  /*
   * ⚠ Sin horario NO se desaparece en silencio. La primera noche de un turno
   * nuevo (Filete, semana del 17-08) no hay historia ni entrada de config:
   * `pace` es null y esta tarjeta era un hueco mudo justo la noche de máxima
   * audiencia. La regla de las guías: un hueco sin explicación es peor que un
   * número sin contexto. Shoplogix manda los horarios — acá solo se espera.
   */
  if (!pace) {
    if (cierre != null) return null // hay horario pero no meta: nada que decir
    /*
     * ⚠⚠ DOS causas distintas y una de ellas no se resuelve sola:
     *
     * - Turno con nombre nuevo → el backend aprende su cierre con 2 turnos
     *   cerrados. Esperar sirve.
     * - Turno SIN DEFINIR en Shoplogix (`Unscheduled`) → el inferidor descarta
     *   los Unscheduled a propósito (`publicMonitor.js`, filtro
     *   `!/unscheduled/i`), así que ese cierre NO se va a aprender nunca.
     *   Decirle a la gente que espere sería mandarla a esperar para siempre.
     *
     * Y en los dos casos hay que dejar a mano el botón de fijar el cierre: la
     * versión anterior retornaba ANTES de `CierreDelTurno`, así que justo
     * cuando faltaba el horario no había forma de ponerlo.
     */
    const sinDefinir = /unscheduled/i.test(shiftName ?? '')
    return (
      <>
        <div className="mt-3 rounded-xl border border-dashed border-border px-3 py-2.5 text-[11.5px] leading-snug text-muted-foreground">
          <span className="font-semibold text-amber-700 dark:text-amber-400">◔ Para llegar a la meta</span>{' '}
          {sinDefinir ? (
            <>
              — este tramo no tiene turno definido en Shoplogix, así que no se sabe a qué hora
              cierra y no se puede calcular el ritmo que falta. Se arregla definiendo el turno
              en Shoplogix, o fijando acá abajo la hora de cierre. Mientras tanto, la lectura es
              el ritmo andando.
            </>
          ) : (
            <>
              — sin horario conocido para este turno todavía
              {shiftName ? <> («{shiftName}» es nuevo)</> : null}: se aprende solo cuando
              Shoplogix cierre 2 turnos con este nombre. También se puede fijar acá abajo.
              Mientras tanto, la lectura es el ritmo andando.
            </>
          )}
        </div>
        <CierreDelTurno
          cierre={cierre}
          muestras={muestras}
          fuente={fuente}
          plantSlug={plantSlug}
          shiftName={shiftName}
          startAt={startAt}
        />
      </>
    )
  }

  if (pace.verdict === 'cumplida') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-800 dark:text-emerald-300">
        <Target className="h-3.5 w-3.5 shrink-0" />
        Meta cumplida — todo lo que salga de acá en adelante va por encima.
      </p>
    )
  }

  /*
   * Hora extra: el turno pasó su horario y la línea sigue. Ya no hay "ritmo
   * necesario" que pedir —no queda ventana— pero sí lo que importa: cuánto
   * falta y cuánto tardaría a este ritmo. Antes la tarjeta desaparecía entera.
   */
  if (pace.verdict === 'hora-extra') {
    return (
      <div className="mt-2 rounded-xl border border-border bg-muted px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
          <Target className="h-3.5 w-3.5" />
          Hora extra · pasado el horario del turno
        </div>
        <p className="mt-1 text-[15px] font-semibold text-sky-800 dark:text-sky-300">
          Faltan <span className="tabular-nums">{fmtInt(pace.remainingPieces)} pz</span> para{' '}
          {pace.targetSource === 'cuota' ? 'la meta' : 'lo esperado'}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Al ritmo de ahora ({fmtDec(pace.currentPerHour / 60)} pz/min andando) son unos{' '}
          <span className="tabular-nums text-foreground/90">
            {fmtDurationSec((pace.extraMinutesNeeded ?? 0) * 60)}
          </span>{' '}
          más.
        </p>
        {/* También en hora extra: es cuando más se pregunta "¿por qué no va más
            rápido?", y la respuesta sigue siendo el llenado, no la velocidad. */}
        {llenado && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Con la máquina a{' '}
            <span className="tabular-nums text-foreground/90">{fmtCpm(llenado.spec.setCpm)} pz/min</span>{llenado.spec.setHz ? <span className="tabular-nums text-muted-foreground/70"> ({llenado.spec.setHz} Hz)</span> : null},
            van{' '}
            <b className="tabular-nums text-foreground/90">
              {comoDeCada100(llenado.actual)} de cada 100
            </b>{' '}
            silletas con pieza.
            {llenado.contradiceSetPoint != null && (
              <span className="mt-0.5 block text-[11px] text-amber-800 dark:text-amber-300">
                ⚠ Hubo tramos a{' '}
                <span className="tabular-nums">{fmtDec(llenado.contradiceSetPoint)} pz/min</span>:
                la máquina no está corriendo a {fmtCpm(llenado.spec.setCpm)}.
              </span>
            )}
          </p>
        )}
      </div>
    )
  }

  const fuera = pace.verdict === 'fuera-de-alcance'
  /* El escalón del medio (pedido de Orel, 13-ago): "Se alcanza pidiendo 24
     pz/min" en una línea que viene a 10 es verdad solo en teoría — el techo es
     lo mejor que la línea hizo alguna vez, no la tendencia de hoy. */
  const exigente = pace.verdict === 'exigente'
  return (
    <div
      className={`mt-2 rounded-xl border px-3 py-2 ${
        fuera || exigente
          ? 'border-border bg-muted'
          : 'border-border bg-muted'
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Target className="h-3.5 w-3.5" />
        {/* Cuál meta, siempre: sin esto no se sabe si el número persigue la
            cuota del turno o lo que el sensor espera, que pueden diferir. */}
        Para llegar a {pace.targetSource === 'cuota' ? 'la meta' : 'lo esperado'}
        <span className="normal-case tracking-normal text-muted-foreground/70">
          ({fmtInt(pace.targetPieces)} pz
          {pace.targetSource === 'objetivo-sensor' && ' · objetivo Shoplogix'})
        </span>
      </div>
      {/* El VEREDICTO primero y en grande. Antes todo esto era un párrafo denso
          donde "¿llego o no?" —la única pregunta que importa— había que
          deducirla leyendo cuatro cifras seguidas. */}
      <p className={`mt-1 text-[15px] font-semibold ${fuera || exigente ? 'text-amber-800 dark:text-amber-300' : 'text-sky-800 dark:text-sky-300'}`}>
        {fuera
          // "Dentro del horario", no "con el tiempo que queda": el turno se
          // estira casi todos los días y el bloque de abajo cuenta con eso.
          ? 'Dentro del horario no alcanza'
          : exigente
          ? 'Se alcanza, pero solo apurando'
          : 'Se alcanza al ritmo que traés'}
      </p>
      {/* Sin adornos históricos: con techo desconocido no se puede afirmar
          que la línea "lo logró alguna vez" — los dos números ya lo dicen.
          También en "no se alcanza": el porqué en una línea. */}
      {/* ⚠ Un requerido MUY por encima del techo no se dice como número.
          Visto el 14-08 a las 15:25, con 6 minutos de turno por delante: "Pide
          186,7 pz/min y la línea, andando, va a 11,6". Es cierto y es inútil —
          nadie lee eso como una meta, se lee como que la pantalla se rompió. A
          partir de 2× el mejor turno se dice lo que de verdad pasa: que ya no
          da el tiempo. El número exacto sigue en el detalle, que es auditable.

          Con el máximo funcional de la máquina se puede ser más preciso todavía:
          no es que "no alcanza", es que **no existe** — no entra ni con las
          silletas llenas y la máquina en su tope. */}
      {(exigente || fuera) && llenado?.imposible ? (
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          No entra ni con las{' '}
          <span className="tabular-nums text-foreground/90">{llenado.spec.cantidad} silletas</span>{' '}
          llenas: faltan{' '}
          <span className="tabular-nums text-foreground/90">{fmtInt(pace.remainingPieces)} pz</span>
          {' '}y el máximo de la máquina son{' '}
          <span className="tabular-nums text-foreground/90">{fmtCpm(llenado.spec.maxCpm)} pz/min</span>.
        </p>
      ) : (exigente || fuera) && (
        pace.maxPerHour != null && pace.requiredPerHour > pace.maxPerHour * 2 ? (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Ya no da el tiempo: faltan{' '}
            <span className="tabular-nums text-foreground/90">{fmtInt(pace.remainingPieces)} pz</span>
            {' '}y quedan{' '}
            <span className="tabular-nums text-foreground/90">
              {fmtDurationSec(pace.workMin * 60)}
            </span>
            {pace.pendingBreakMin > 0 ? ' de producción.' : '.'}
          </p>
        ) : (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Pide <span className="tabular-nums text-foreground/90">{fmtDec(pace.requiredPerMinute)} pz/min</span>{' '}
            y la línea, andando, va a{' '}
            <span className="tabular-nums text-foreground/90">{fmtDec(pace.currentPerHour / 60)}</span>.
          </p>
        )
      )}
      {/* ⚠⚠ La HORA, siempre. Esta proyección va hasta el horario del turno y
          el pronóstico va hasta lo que duraron los turnos anteriores: el 14-08
          a las 12:50 uno decía 4.501 pz y el otro 5.011, a lados opuestos de
          la meta, sin que nada explicara la diferencia. Son dos horizontes, no
          dos cuentas — y desde que la tarjeta los dice a los dos, el "¿vamos a
          llegar?" se contesta acá arriba sin abrir nada. */}
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {cierre ? (
          <>
            Al ritmo de ahora, hasta las{' '}
            <span className="tabular-nums text-foreground/90">{fmtWallTime(cierre)}</span> el turno
            cierra en{' '}
          </>
        ) : (
          <>Al ritmo de ahora el turno cierra en{' '}</>
        )}
        <span className="tabular-nums text-foreground/90">{fmtInt(pace.projectedPieces)} pz</span>
        {' '}({fmtDec((pace.projectedPieces / pace.targetPieces) * 100, 0)}% de la meta).
      </p>

      {/* El otro horizonte, el que suele ocurrir: los turnos de esta línea se
          estiran. El número grande del pronóstico vive tres bloques más abajo;
          acá va su titular, que es la otra mitad de la respuesta. */}
      {horizonte?.hasta && horizonte.estimate != null && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Si se estira como los últimos turnos (≈
          <span className="tabular-nums text-foreground/90">{horizonte.hasta}</span>),{' '}
          <span className="tabular-nums text-foreground/90">{fmtInt(horizonte.estimate)} pz</span>
          {horizonte.mapePct != null && <> ±{fmtDec(horizonte.mapePct)}%</>}.
        </p>
      )}

      {/* ⚠⚠ El límite NO es la velocidad de la máquina.
          La Baader 200 pasa silletas a una velocidad fija y el operador pone
          una pieza en cada una — o no: cansancio, un salmón que sacar, o la
          línea atochada aguas abajo. Ritmo real = velocidad × llenado, y esas
          dos mitades tienen dueños distintos. Sin esta línea, "la línea anda a
          11,6" se lee como que la máquina rinde poco, cuando en 614 tramos de
          los últimos 7 turnos NINGUNO llegó al 90% de llenado. */}
      {llenado && (
        <p className="mt-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[12px] text-muted-foreground">
          Con la máquina a{' '}
          <span className="tabular-nums text-foreground/90">{fmtCpm(llenado.spec.setCpm)} pz/min</span>{llenado.spec.setHz ? <span className="tabular-nums text-muted-foreground/70"> ({llenado.spec.setHz} Hz)</span> : null},
          venís llenando{' '}
          <b className="tabular-nums text-foreground/90">
            {comoDeCada100(llenado.actual)} de cada 100
          </b>{' '}
          silletas
          {llenado.necesaria != null && !llenado.imposible && (
            <>
              {' '}· para la meta harían falta{' '}
              <b className={`tabular-nums ${
                llenado.necesaria > llenado.actual
                  ? 'text-amber-800 dark:text-amber-300'
                  : 'text-emerald-800 dark:text-emerald-300'
              }`}>
                {comoDeCada100(llenado.necesaria)}
              </b>
            </>
          )}
          .
          <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
            No es velocidad de máquina: es cuántas silletas van con pieza
            (abastecimiento o atochamiento aguas abajo).
          </span>
          {/* Los datos desmintiendo la config: si algún tramo pasó la velocidad
              configurada, la máquina no está en esa velocidad y el llenado de
              arriba está mal calculado. Sale solo, sin que nadie se acuerde de
              revisar el set point. */}
          {llenado.contradiceSetPoint != null && (
            <span className="mt-1 block text-[11px] text-amber-800 dark:text-amber-300">
              ⚠ Hubo tramos a{' '}
              <span className="tabular-nums">{fmtDec(llenado.contradiceSetPoint)} pz/min</span>: la
              máquina no está corriendo a {fmtCpm(llenado.spec.setCpm)}. Hay que corregir la
              velocidad configurada.
            </span>
          )}
        </p>
      )}

      {/* La referencia que uno busca enseguida: contra el día anterior, a la
          MISMA altura de turno. Estaba solo dentro del comparador, que ahora
          arranca plegado. */}
      {vsAyer && (
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {vsAyer.label} a esta altura llevaba{' '}
          <span className="tabular-nums text-foreground/90">{fmtInt(vsAyer.pieces)} pz</span>
          {' '}
          <span className={
            vsAyer.diff >= 0
              ? 'text-emerald-800 dark:text-emerald-300'
              : 'text-amber-800 dark:text-amber-300'
          }>
            ({vsAyer.diff >= 0 ? '+' : '−'}{fmtInt(Math.abs(vsAyer.diff))})
          </span>.
        </p>
      )}

      {/* El detalle, a un toque: qué ritmo hace falta, el techo, lo normal y la
          hora extra. Antes eran doce líneas siempre abiertas arriba de todo, y
          la pregunta que la gente hace —¿llegamos?— quedaba enterrada entre
          ellas. */}
      <button
        type="button"
        onClick={() => setVerDetalle((v) => !v)}
        className="tap-44 mt-2 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
        aria-expanded={verDetalle}
      >
        {verDetalle ? 'ocultar qué hace falta' : 'ver qué hace falta'}
      </button>

      {!verDetalle && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Faltan <span className="tabular-nums">{fmtInt(pace.remainingPieces)} pz</span> ·{' '}
          quedan <span className="tabular-nums">{fmtDurationSec(pace.remainingMin * 60)}</span>
          {pace.pendingBreakMin > 0 && (
            <>
              {' '}(<span className="tabular-nums">{fmtDurationSec(pace.workMin * 60)}</span>{' '}
              produciendo)
            </>
          )}
        </p>
      )}

      {/* Los números en filas, no en prosa: se comparan de un vistazo. */}
      <dl className={`mt-2 space-y-0.5 text-[12px] ${verDetalle ? '' : 'hidden'}`}>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Faltan</dt>
          <dd className="tabular-nums">{fmtInt(pace.remainingPieces)} pz</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Queda</dt>
          <dd className="tabular-nums">
            {fmtDurationSec(pace.remainingMin * 60)}
            {/* La colación, dicha acá mismo: sin esto el ritmo necesario se lee
                como si esos minutos fueran de producción. */}
            {pace.pendingBreakMin > 0 && (
              <span className="ml-1.5 font-normal text-muted-foreground/80">
                · {fmtDurationSec(pace.workMin * 60)} produciendo
              </span>
            )}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Necesitás</dt>
          <dd className={`tabular-nums font-semibold ${fuera ? 'text-amber-800 dark:text-amber-300' : 'text-sky-800 dark:text-sky-300'}`}>
            {fmtDec(pace.requiredPerMinute)} pz/min
            <span className="ml-1 font-normal text-muted-foreground/80">andando</span>
            {/* Un requerido por encima del techo no es una meta: es una cifra
                que hace perder la confianza en la pantalla. Se dice cuántas
                veces es lo que la línea da, que es lo que se puede juzgar. */}
            {fuera && pace.maxPerHour != null && pace.requiredPerHour > pace.maxPerHour && (
              <span className="ml-1 font-normal text-muted-foreground/80">
                · {fmtDec(pace.requiredPerHour / pace.maxPerHour)}× el mejor turno
              </span>
            )}
          </dd>
        </div>
        {pace.pendingBreakMin > 0 && (
          <p className="pl-[5.5rem] text-[11px] leading-snug text-muted-foreground/80">
            Descontando{' '}
            <span className="tabular-nums">{fmtDurationSec(pace.pendingBreakMin * 60)}</span> de
            paradas de convenio que faltan: el ritmo se pide sobre el tiempo en que la línea
            produce, no sobre el reloj.
          </p>
        )}
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Vas a</dt>
          <dd className="tabular-nums">
            {fmtDec(pace.currentPerHour / 60)} pz/min
            <span className="ml-1 text-muted-foreground/80">andando</span>
          </dd>
        </div>
        {/* El TECHO explicado: no es un número abstracto, es lo mejor que esta
            línea dio en los turnos anteriores. Sin decir de dónde sale, "techo
            816 pz/h" no se puede ni discutir ni creer. */}
        {pace.maxPerHour != null && (
          <div className="flex items-baseline gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Techo</dt>
            <dd className="tabular-nums text-muted-foreground">
              {fmtDec(pace.maxPerHour / 60)} pz/min
              <span className="ml-1">= {fmtInt(pace.maxPerHour)} pz/h</span>
            </dd>
          </div>
        )}
      </dl>

      {/* Todo lo de abajo es el DETALLE de "qué hace falta": ritmo requerido,
          techo, referencias históricas, hora extra y de dónde sale la hora de
          cierre. Se abre a pedido — antes eran doce líneas siempre abiertas.*/}
      <div className={verDetalle ? '' : 'hidden'}>
      {/* El récord, dicho: el monitor también es evidencia de mejora. Solo
          cuando el ritmo de HOY supera al mejor de los turnos recientes. */}
      {historial?.bestCpm != null && pace.currentPerHour / 60 > historial.bestCpm && (
        <p className="mt-1.5 flex items-baseline gap-1.5 text-[12px] text-emerald-800 dark:text-emerald-300">
          <TrendingUp className="h-3.5 w-3.5 shrink-0 self-center" />
          <span>
            Andando, por encima del mejor turno reciente ({fmtDec(historial.bestCpm)} pz/min
            {historial.muestras ? ` en los últimos ${historial.muestras}` : ''}).
          </span>
        </p>
      )}

      {pace.maxPerHour != null && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          El <b>techo</b> es el mejor ritmo ANDANDO que la línea alcanzó
          {historial?.muestras ? ` en los últimos ${historial.muestras} turnos` : ' en turnos anteriores'} —
          lo que ya demostró que puede, no lo que dice el objetivo.
        </p>
      )}

      {/* La referencia histórica: hace que "necesitás 16 pz/min" se pueda
          juzgar. El objetivo del sensor puede decir 20 y la línea no haber
          pasado nunca de 12,7 — medido en Filete sobre 9 turnos. */}
      {historial?.medianCpm != null && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Andando, lo normal en esta línea:{' '}
          <span className="tabular-nums text-foreground/80">
            {fmtDec(historial.medianCpm)} pz/min ({fmtInt(historial.medianCpm * 60)} pz/h)
          </span>
          {historial.bestCpm != null && (
            <>
              {' '}· mejor turno{' '}
              <span className="tabular-nums text-foreground/80">
                {fmtDec(historial.bestCpm)} pz/min ({fmtInt(historial.bestCpm * 60)} pz/h)
              </span>
            </>
          )}
          .
        </p>
      )}

      {/* La hora extra: la pregunta que sigue a "no se alcanza". Convierte un
          "no llegamos" en una decisión que alguien puede tomar ahora. */}
      {pace.withExtraHour && (
        <div
          className={`mt-2 rounded-xl border px-2.5 py-2 text-[12px] ${
            pace.withExtraHour.feasible
              ? 'border-border bg-muted'
              : 'border-border bg-muted'
          }`}
        >
          <span className="font-medium">Con 1 hora extra: </span>
          {pace.withExtraHour.feasible ? (
            <>
              bastaría con{' '}
              <b className="tabular-nums text-emerald-800 dark:text-emerald-300">
                {fmtDec(pace.withExtraHour.requiredPerMinute)} pz/min
              </b>{' '}
              <span className="text-muted-foreground/80">
                ({fmtInt(pace.withExtraHour.requiredPerHour)} pz/h)
              </span>
              {' '}—{' '}
              {/* La diferencia entre "cabe en el techo histórico" y "es el
                  ritmo que la línea YA trae" es la que decide si la hora
                  extra resuelve o solo acerca. */}
              <span className="text-emerald-800 dark:text-emerald-300">
                {/* "La meta entra" a secas volvía a chocar con el bloque del
                    pronóstico, que a la misma hora decía "no entra": este
                    número cabe en el techo pero está por encima del ritmo que
                    la línea trae, así que se dice condicional. */}
                {pace.withExtraHour.realistic ? 'el ritmo que ya traés' : 'alcanzaría, pero apurando'}
              </span>.
            </>
          ) : (
            <>
              harían falta{' '}
              <b className="tabular-nums">
                {fmtDec(pace.withExtraHour.requiredPerMinute)} pz/min ({fmtInt(pace.withExtraHour.requiredPerHour)} pz/h)
              </b>, que
              sigue lejos de lo que la línea viene dando. Con una hora no basta.
            </>
          )}
        </div>
      )}
      <CierreDelTurno
        cierre={cierre}
        muestras={muestras}
        fuente={fuente}
        plantSlug={plantSlug}
        shiftName={shiftName}
        startAt={startAt}
      />
      </div>
      {/* El aviso de "no se alcanza" ya no va acá: era una tercera repetición
          del mismo hecho, después del veredicto de arriba y de la fila "Techo".
          Y convivía mal con el "hay que subir 320 pz/h" — decir a la vez cuánto
          acelerar y que no sirve de nada. */}
    </div>
  )
}

/**
 * El turno hora por hora.
 *
 * Existe por un caso concreto: un supervisor dijo que "en la primera hora
 * hicieron 800 piezas" y no había con qué contrastarlo — el monitor mostraba el
 * total del turno y la cadencia promedio, que no responden esa pregunta.
 *
 * Cada fila lleva las piezas Y el ritmo equivalente en pz/h. La distinción no es
 * un adorno: un turno que arranca 21:15 tiene una "primera hora" de 45 minutos,
 * así que sus piezas no se comparan de igual a igual con las de una hora
 * entera — el ritmo sí.
 */
function PorHora({ series }: { series: PublicMonitorLive['series'] }) {
  const rows = useMemo(() => buildHourlyRows(series), [series])
  const max = useMemo(() => peakPieces(rows), [rows])
  if (rows.length === 0) return null

  return (
    <Bloque
      id="porhora"
      titulo="Hora por hora"
      /* Detalle: se abre cuando alguien lo busca. Con todos los bloques
         abiertos la pantalla medía cuatro pantallas de celular para contestar
         tres preguntas. */
      defaultAbierto={false}
      extra={<span className="normal-case">desde el arranque</span>}
    >
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.hourStart} className="flex items-center gap-2 text-sm">
            {/* El nº de hora de TURNO manda, y el tramo de reloj va al lado para
                poder cruzarlo con lo que dijo el supervisor. La hora 1 de un
                turno que arrancó 07:45 va a las 08:45, no a las 08:00. */}
            <span className="w-6 shrink-0 tabular-nums text-muted-foreground">h{r.index}</span>
            <span className="w-[5.5rem] shrink-0 whitespace-nowrap tabular-nums text-[11px] text-muted-foreground/70">
              {fmtWallTime(r.from)}–{fmtWallTime(r.to)}
            </span>
            <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-sky-400"
                style={{ width: `${max > 0 ? (r.pieces / max) * 100 : 0}%` }}
              />
            </span>
            <span className="w-[4.5rem] shrink-0 text-right tabular-nums text-foreground/90">
              {fmtInt(r.pieces)} pz
            </span>
            {/* 5.5rem y no 5: con el asterisco de hora parcial, "1.012 pz/h *"
                se partía en dos líneas y descuadraba la fila. */}
            <span className="w-[5.5rem] shrink-0 whitespace-nowrap text-right tabular-nums text-[11px] text-muted-foreground/70">
              {fmtInt(r.piecesPerHour)} pz/h
              {r.partial && (
                <span
                  className="ml-1 text-amber-700 dark:text-amber-300"
                  title={`Hora incompleta: ${r.minutesCovered} min con datos. Las piezas no se comparan con una hora entera; el ritmo pz/h sí.`}
                >
                  *
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground/70">
        Horas corridas desde el arranque, como cuenta Shoplogix: la hora 1 va del
        primer ciclo a +60 min.
        {rows.some((r) => r.partial) && (
          <> El <span className="text-amber-700 dark:text-amber-300">*</span> marca una hora
          incompleta — tiene menos piezas porque duró menos, no porque fuera más lenta;
          para comparar, mirá el ritmo en pz/h.</>
        )}
      </p>
    </Bloque>
  )
}

/**
 * La regla de ritmo: UN número protagonista y una escala que lo explica.
 *
 * ── Por qué reemplaza a tres tarjetas ──────────────────────────────────────
 *
 * Convivían seis cifras de ritmo (acumulado del turno, de reloj, pz/h, últimos
 * 30 min, «12,5 ahora» dentro del gráfico, media de 15) sin jerarquía, y la más
 * grande era la que menos se movía: Orel vio el gráfico desplomarse mientras el
 * número no se inmutaba. Acá el protagonista es el ritmo de AHORA —el último
 * punto de la curva de abajo, literalmente el mismo dato— y las otras dos
 * referencias dejan de ser cifras sueltas para volverse posiciones de una
 * escala: dónde está el promedio del turno, y dónde el techo de la máquina.
 *
 * La lectura no exige aritmética mental: la distancia entre el relleno y el
 * final de la regla ES lo que falta. No hay que saber que 18 es el techo ni
 * restar 12,5 de 18.
 */
function ReglaDeRitmo({ ahora, ahoraReloj, turno, setCpm, onEditarSetPoint, cerrado, contexto, chispa }: {
  /**
   * Ritmo de ahora ANDANDO, en pz/min: los últimos 15 min descontando los
   * tramos parados. Va en esta base y no en la de reloj porque es contra lo
   * que se compara —el set point de la máquina y el promedio del turno— y
   * mezclar denominadores en una misma barra fue justo el error que este
   * bloque vino a terminar.
   */
  ahora: number | null
  /** El mismo tramo pero DE RELOJ (con las paradas adentro). */
  ahoraReloj?: number | null
  /** Promedio del turno cuando la línea produce: la marca de la regla. */
  turno: number | null
  /** Velocidad de la máquina: el final de la regla. */
  setCpm: number | null | undefined
  onEditarSetPoint?: () => void
  cerrado?: boolean
  /** Cómo viene el turno contra los anteriores: el dato que traía la tarjeta
      vieja y que sin esto se perdería. Texto, no una cifra más. */
  contexto?: string | null
  /** El sparkline de los turnos previos, si hay historia. */
  chispa?: React.ReactNode
}) {
  const estado = estadoRitmo(ahora, setCpm)
  const fr = fraccionDeRegla(ahora, setCpm)
  const frTurno = fraccionDeRegla(turno, setCpm)
  /* El estado SIEMPRE se dice con palabra además de color: en planta hay
     pantallas quemadas por el sol y gente que no distingue rojo de verde. */
  const palabra = cerrado
    ? 'al cierre'
    : estado === 'ok' ? 'a ritmo' : estado === 'lento' ? 'va lento' : 'casi parada'
  const colorRelleno = estado === 'ok'
    ? 'bg-ink-ok' : estado === 'lento' ? 'bg-ink-warn' : 'bg-ink-crit'
  const colorPunto = estado === 'ok'
    ? 'text-ink-ok' : estado === 'lento' ? 'text-ink-warn' : 'text-ink-crit'

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Gauge className="h-3 w-3" />
        Ritmo de la línea
      </div>

      {/* El número no lleva acento: el acento se reserva para lo interactivo y
          el estado ya lo cuenta la barra (§1.4). */}
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-[42px] font-semibold leading-none tabular-nums text-foreground">
          {ahora != null ? fmtDec(ahora) : '—'}
        </span>
        <span className="text-[15px] text-muted-foreground">pz/min andando</span>
        {ahora != null && (
          <span className={`ml-auto inline-flex items-center gap-1 text-[12px] font-medium ${colorPunto}`}>
            <span className="inline-block size-1.5 rounded-full bg-current" />
            {palabra}
          </span>
        )}
      </div>

      {/* ── La regla ──────────────────────────────────────────────────────
          0 → set point. El relleno es AHORA, la marca es el promedio del
          turno y el final es lo que da la máquina. */}
      <div className="mt-3">
        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${colorRelleno} transition-[width] duration-300 motion-reduce:transition-none`}
            style={{ width: `${Math.max(fr * 100, ahora != null && ahora > 0 ? 2 : 0)}%` }}
          />
          {turno != null && turno > 0 && setCpm != null && setCpm > 0 && (
            <span
              className="absolute inset-y-0 w-0.5 bg-foreground/45"
              style={{ left: `${frTurno * 100}%` }}
              title={`Promedio del turno: ${fmtDec(turno)} pz/min`}
            />
          )}
        </div>
        <div className="mt-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {turno != null ? <>promedio del turno <b className="font-semibold text-foreground/80">{fmtDec(turno)}</b></> : 'promedio del turno —'}
          </span>
          {/* La etiqueta del techo ES el control: a 375 px no cabe un lápiz
              extra sin pisarla. */}
          {setCpm != null && setCpm > 0 && (
            onEditarSetPoint ? (
              <button
                type="button"
                onClick={onEditarSetPoint}
                className="tap-44 tabular-nums underline decoration-dotted underline-offset-2"
              >
                {fmtDec(setCpm)} máquina
              </button>
            ) : (
              <span className="tabular-nums">{fmtDec(setCpm)} máquina</span>
            )
          )}
        </div>
      </div>

      {/* Las dos bases, dichas. El de reloj no se esconde: es el que dice
          cuánto SALE de verdad, y su distancia con el andando es el costo de
          las paradas. Pero el grande es el andando porque es el comparable. */}
      {ahora != null && ahoraReloj != null && ahoraReloj > 0 && Math.abs(ahora - ahoraReloj) > 0.05 && (
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Son los últimos 15 min <b className="text-foreground/80">cuando la línea corre</b>.
          Contando también los minutos parados de ese tramo:{' '}
          <b className="tabular-nums text-foreground/80">{fmtDec(ahoraReloj)}</b> pz/min de reloj.
        </p>
      )}

      {(contexto || chispa) && (
        <div className="mt-2.5 flex items-center gap-2 border-t border-border/50 pt-2.5">
          {chispa}
          {contexto && (
            <span className="text-[11px] leading-snug text-muted-foreground">{contexto}</span>
          )}
        </div>
      )}
    </section>
  )
}

function StatusPill({ live }: { live: PublicMonitorLive }) {
  // El primitivo Pill de la piel: tonos MEDIDOS (texto 600 sobre 500 al 15%)
  // y el punto integrado — era exactamente lo que este componente imitaba a mano.
  const map = {
    produciendo: { label: 'Produciendo', tone: 'ok' as const },
    detenida:    { label: 'Detenida',    tone: 'critical' as const },
    'sin-datos': { label: 'Sin datos',   tone: 'neutral' as const },
  } as const

  const x = map[live.status] ?? map['sin-datos']
  // `pulse` solo con el turno VIVO produciendo: el punto que respira es la
  // señal de "en vivo" (§7); en un turno cerrado sería un parpadeo mentiroso.
  return (
    <Pill tone={x.tone} dot={live.status === 'produciendo' && !live.shiftClosed ? 'pulse' : true}>
      {x.label}
    </Pill>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────

export function PublicShiftMonitorPage() {
  const { token } = useParams<{ token: string }>()
  const { isDark, toggleTheme } = useTheme()
  const [data, setData] = useState<PublicShiftMonitorDoc | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'gone'>('loading')
  const [now, setNow] = useState(() => Date.now())

  // Reloj propio: la frescura ("hace X min") tiene que envejecer a la vista
  // aunque el doc no cambie — si no, un sync caído se ve igual que uno al día.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!token) { setStatus('gone'); return }
    return subscribePublicShiftMonitor(
      token,
      (docData) => {
        if (!docData) { setStatus('gone'); return }
        // Doble chequeo en cliente: las reglas ya cortan por `expiresAt`, pero
        // un doc cacheado localmente puede sobrevivir al vencimiento.
        if (new Date(docData.expiresAt).getTime() <= Date.now()) { setStatus('gone'); return }
        setData(docData)
        setStatus('ok')
      },
      () => setStatus('gone'),
    )
  }, [token])

  /**
   * Turno que se está mirando, EN LA URL (`?turno=<shiftDocId>`). Sin él, el
   * vigente.
   *
   * ⚠ Vivía en `useState` + refs y los botones "no respondían" (reporte de Orel,
   * 11-ago): al navegar, el componente se REMONTA —se ve en las trazas: el ref
   * vuelve a `null` justo después del clic— y con él se perdía la posición, así
   * que la pantalla saltaba de vuelta al turno actual. La URL sobrevive al
   * remonte, y de paso el turno queda compartible: mandar "mirá el de ayer" pasa
   * a ser copiar el link.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const turnoParam = searchParams.get('turno')
  /** Causa de detención resaltada sobre el gráfico. */
  const [causaSel, setCausaSel] = useState<string | null>(null)
  /* La parada concreta que se está mirando: marca UNA banda, no las 40 de su
     causa. Se limpia al soltar la causa o al elegir otra. */
  const [tramoSel, setTramoSel] = useState<Ventana | null>(null)
  /**
   * El tramo de turno que se está mirando, en minutos desde el primer tramo
   * con dato. Vive acá porque lo COMPARTEN los dos gráficos: acercarse en la
   * velocidad mueve al comparador al mismo tramo, que es lo que permite cruzar
   * "acá se cayó el ritmo" con "acá se abrió la brecha". null = todo el turno.
   */
  const [ventanaGrafica, setVentanaGrafica] = useState<Ventana | null>(null)
  /**
   * Contra qué se compara (la cuota o un día). Vive acá porque lo usan DOS
   * bloques: el comparador para sus curvas y "por qué no llegamos" para el
   * «cuándo se abrió». Con una copia en cada uno, el gráfico podía estar
   * comparando contra la cuota y la brecha contra "lun 10".
   */
  const [refSel, setRefSel] = useState<string | null>(null)

  // Turnos navegables, del actual hacia atrás. El backend publica el historial
  // ya compuesto; acá solo se elige cuál se pinta.
  const vistas = useMemo(() => {
    if (!data?.live) return []
    return [
      { shiftDocId: data.shiftDocId, dateKey: data.dateKey, shiftId: data.shiftId, live: data.live },
      ...(data.history ?? []),
    ]
  }, [data])

  // Turno que el usuario eligió mirar. Cuando arranca uno nuevo, el historial se
  // corre una posición: sin esto la pantalla saltaría sola a otro turno mientras
  // alguien lo está leyendo.
  //
  // ⚠ El efecto depende SOLO de `vistas`, nunca de `idx`: al depender también de
  // `idx` se disparaba en la propia navegación del usuario y lo devolvía al
  // turno actual — el botón parecía no responder.
  // El índice se DERIVA de la URL: sin estado que restaurar, no hay efecto que
  // pelee con la navegación del usuario ni que lo devuelva al turno actual.
  // Si el turno pedido se cayó del historial, cae solo al vigente.
  const idx = useMemo(() => {
    if (!turnoParam) return 0
    const i = vistas.findIndex(v => v.shiftDocId === turnoParam)
    return i >= 0 ? i : 0
  }, [vistas, turnoParam])

  // Telemetría anónima de uso (ver `trackMonitorUsage`). Se engancha una sola
  // vez por token; el ref le deja consultar en qué turno está parado el usuario
  // sin re-suscribirse en cada navegación.
  const idxRef = useRef(0)
  idxRef.current = idx
  useEffect(() => {
    if (!token || status !== 'ok') return
    return trackMonitorUsage(token, () => idxRef.current > 0)
  }, [token, status])

  const vista = vistas[idx] ?? null
  const live = vista?.live ?? null

  /*
   * ── El eje arranca donde la línea arrancó ──────────────────────────────
   *
   * El recorte ya NO se hace con la ventana de zoom: se hace en el ORIGEN de la
   * serie (`desdePrimeraPieza`, dentro de `monitorHourly` y `monitorCompare`),
   * que es de donde salía el problema. Forzar una ventana además desalineaba el
   * comparador: los días de referencia arrancaban en su minuto 0 y hoy en el
   * 725, así que sus curvas quedaban fuera del encuadre.
   *
   * Lo que queda acá es solo el AVISO: cuánto tiempo declarado se está dejando
   * afuera, para que nadie crea que el turno entero fue así de corto.
   */
  const recorteActividad = useMemo(
    () => ventanaDeActividad(live?.series),
    [live?.series],
  )
  /** Piezas de la prueba de máquina que quedaron antes del arranque real. */
  const pzAntesDelArranque = useMemo(() => piezasAntesDelArranque(live?.series), [live?.series])
  /** La serie que ven los gráficos: desde la primera pieza, como el resto. */
  const serieDelTurno = useMemo(() => desdePrimeraPieza(live?.series), [live?.series])
  /** El arranque que se anuncia: la primera pieza, con el declarado de respaldo. */
  const inicioReal = serieDelTurno[0]?.t ?? live?.scheduledStart

  const esActual = idx === 0

  /* Supervisor logueado mirando el monitor: puede editar el set point inline
     (mismo patrón que el «Cambiar» del cierre). Las reglas de Firestore son la
     defensa real; esto solo decide si se muestra el botón. */
  const esAdminMonitor = useIsAdmin()
  const usuarioActual = useAuthStore((st) => st.user)

  const verIndice = (n: number) => {
    const destino = Math.min(vistas.length - 1, Math.max(0, n))
    // Volver al vigente es dejar de navegar: desde ahí la pantalla vuelve a
    // seguir al turno en curso cuando arranque el siguiente.
    // `replace` para no llenar el historial del navegador con cada flecha: el
    // botón "atrás" del celular tiene que salir de la pantalla, no deshacer
    // turno por turno.
    if (destino === 0) setSearchParams({}, { replace: true })
    else setSearchParams({ turno: vistas[destino]!.shiftDocId }, { replace: true })
    // Otro turno, otras detenciones: mantener la selección marcaría bandas que
    // no existen en el turno que se acaba de abrir.
    setCausaSel(null)
  }
  const irA = (delta: number) => verIndice(idx + delta)

  // Swipe: es la interacción natural en el celular, que es donde se abre el QR.
  // Las flechas quedan igual para desktop y accesibilidad.
  const touchX = useRef<number | null>(null)
  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0]?.clientX ?? null }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current
    touchX.current = null
    if (Math.abs(dx) < 60) return       // bajo eso es un scroll, no un swipe
    irA(dx < 0 ? 1 : -1)                // arrastrar a la izquierda = ir hacia atrás
  }

  const progressPct = useMemo(() => {
    if (!live || !data?.targetPieces) return null
    return Math.min(100, (live.totalPieces / data.targetPieces) * 100)
  }, [live, data?.targetPieces])

  /**
   * Las paradas de convenio del turno: las de hoy como hechos y las de los
   * días anteriores como pronóstico para lo que falta.
   *
   * UNA sola fuente para las cuatro cosas que dependen de ellas —la curva de
   * la cuota, el fondo gris de los gráficos, el ritmo necesario y el aviso de
   * la próxima parada—. Dos agregaciones paralelas del mismo dato siempre
   * terminan diciendo cosas distintas.
   */
  const breaksTurno = useMemo(() => {
    const deConvenio = (l: PublicMonitorLive | null | undefined) =>
      plannedBreaks({
        series: l?.series,
        stopEvents: l?.stopEvents,
        stopReasons: l?.stopReasons,
        // Qué causa es de convenio lo resolvió el backend: duplicar la lista
        // acá garantiza que un día las dos versiones difieran.
        plannedReasons: (l?.timeBreakdown?.planned ?? []).map((x) => x.reason),
      })
    const minutoActual = live?.series?.length ? live.series.length * 5 : 0
    /*
     * ⚠ Por TURNO y no aplanado: la predicción necesita saber en cuántos
     * turnos aparece cada causa. Aplanado, la detención programada de UN día
     * se pronosticaba como diaria y el ejercicio generaba paradas fantasma.
     */
    const porTurno = (data?.history ?? []).map((h) => deConvenio(h.live))
    const anteriores = prediccionConvenio(porTurno)

    /*
     * ⚠⚠ La parada EN CURSO no está en `stopEvents`.
     *
     * Visto a las 13:44 del 14-08: la cabecera decía "Línea detenida — COLACION
     * (desde 13:37)" y `stopEvents` no la traía — Shoplogix publica los
     * intervalos cerrados. Sin esto, la colación que está ocurriendo aporta
     * cero al descuento justo mientras ocurre, que es cuando más importa.
     * Sale de `currentReason`/`currentSinceAt`, y es de convenio si esa causa
     * lo es hoy o lo fue en los turnos anteriores.
     */
    const t0raw = serieDelTurno[0]?.t
    const causasDeConvenio = new Set([
      ...(live?.timeBreakdown?.planned ?? []).map((x) => x.reason),
      ...anteriores.map((b) => b.reason),
    ])
    const enCurso: PlannedBreak[] = []
    if (live?.currentReason && live.currentSinceAt && t0raw && causasDeConvenio.has(live.currentReason)) {
      const desdeMin = Math.round((Date.parse(live.currentSinceAt) - Date.parse(t0raw)) / 60_000)
      if (Number.isFinite(desdeMin)) {
        enCurso.push({
          fromMin: desdeMin,
          toMin: Math.max(desdeMin, minutoActual),
          reason: live.currentReason,
        })
      }
    }

    // La que está ocurriendo llega con los minutos que lleva, no con los que va
    // a durar: se estira a lo que dura en los turnos anteriores.
    const hoy = extendOngoingBreaks([...deConvenio(live), ...enCurso], anteriores, minutoActual)
    return mergeBreaks(hoy, anteriores, minutoActual)
  }, [live, data?.history, serieDelTurno])

  /**
   * Lo que el operador escribió, agrupado por la causa que anota, para poder
   * mostrarlo PEGADO a esa causa en el desglose del tiempo. La bitácora
   * completa sigue abajo: esto son las dos primeras notas de cada causa.
   */
  const notasDeOperador = useMemo(
    () => notasPorCausa(live?.comments, fmtWallTime, serieDelTurno[0]?.t ?? null),
    // El t0 entra en la cuenta: sin él las notas no sabrían dónde caen.
    [live?.comments, serieDelTurno],
  )

  /* Los que Shoplogix marca para el turno entero: no cuelgan de ninguna parada
     y hasta ahora se descartaban en silencio. */
  const notasDeTurnoCompleto = useMemo(() => notasDelTurno(live?.comments), [live?.comments])

  /**
   * El Pareto de las paradas de los últimos turnos.
   *
   * Sale del `history` que ya viaja en el doc (mismo turno, hasta 6 anteriores)
   * más el turno que se está mirando: cero lecturas extra. Solo el tiempo
   * RECUPERABLE — el convenio no es una pérdida que alguien pueda atacar.
   */
  /*
   * La muestra del Pareto, UNA sola vez para el ranking y para su contexto: si
   * cada uno armara la suya podrían hablar de conjuntos distintos, que es
   * justo lo que pasaba.
   *
   * ⚠⚠ BUG que esto corrige: se sumaba el turno VISTO más el historial
   * completo, y el historial YA lo incluye. Mirando el 14-08 el bloque decía
   * «7 turnos · 6 h 42 min» cuando eran 6 turnos y 5 h 48 min: el turno en
   * pantalla contaba dos veces (verificado contra Firestore el 15-08).
   */
  /*
   * TODOS los turnos que el espejo conozca, de la fuente más rica primero.
   *
   * `shiftStats` (40 turnos, con causas, día y noche) es lo que habilita elegir
   * la ventana y comparar un turno contra el otro. Cae a `history` (6, con
   * causas) y `forecastHistory` (10, sin causas) mientras el backend no lo
   * haya repoblado: el arreglo se llena de a pocos turnos por corrida, así que
   * durante un rato el monitor va a tener las tres fuentes conviviendo.
   */
  const turnosConocidos = useMemo(() => muestraUnica([
    {
      dateKey: vista?.dateKey ?? data?.dateKey ?? '',
      shiftId: vista?.shiftId ?? data?.shiftId ?? null,
      total: live?.totalPieces ?? null,
      windowMin: live?.timeBreakdown?.windowMin ?? null,
      producingMin: live?.timeBreakdown?.producingMin ?? null,
      plannedMin: live?.timeBreakdown?.plannedMin ?? null,
      recoverableMin: live?.timeBreakdown?.recoverableMin ?? null,
      causas: live?.timeBreakdown?.recoverable ?? null,
    },
    ...(data?.shiftStats ?? []).map((t) => ({
      dateKey: t.dateKey,
      shiftId: t.shiftId ?? null,
      total: t.total ?? null,
      windowMin: t.windowMin ?? null,
      producingMin: t.producingMin ?? null,
      plannedMin: t.plannedMin ?? null,
      recoverableMin: t.recoverableMin ?? null,
      causas: t.recoverable ?? null,
    })),
    ...(data?.history ?? []).map((h) => ({
      dateKey: h.dateKey,
      shiftId: h.shiftId ?? null,
      total: h.live?.totalPieces ?? null,
      windowMin: h.live?.timeBreakdown?.windowMin ?? null,
      producingMin: h.live?.timeBreakdown?.producingMin ?? null,
      plannedMin: h.live?.timeBreakdown?.plannedMin ?? null,
      recoverableMin: h.live?.timeBreakdown?.recoverableMin ?? null,
      causas: h.live?.timeBreakdown?.recoverable ?? null,
    })),
    ...(data?.forecastHistory ?? []).map((f) => ({
      dateKey: f.dateKey,
      shiftId: parseShiftDocId(f.shiftDocId)?.shiftId ?? null,
      total: f.total ?? null,
      windowMin: f.windowMin ?? null,
      producingMin: f.producingMin ?? null,
      plannedMin: f.plannedMin ?? null,
      recoverableMin: f.recoverableMin ?? null,
      causas: null,
    })),
  ]), [live?.timeBreakdown, live?.totalPieces, data?.shiftStats, data?.history, data?.forecastHistory,
       data?.dateKey, data?.shiftId, vista?.dateKey, vista?.shiftId])

  /*
   * La ventana elegida vive acá arriba porque las TRES piezas del bloque
   * (barra, ranking y tendencia) tienen que mirar los mismos turnos: si cada
   * una recortara por su cuenta, el «% de estos N turnos» podría no ser el de
   * las causas listadas.
   */
  const [ventanaPareto, setVentanaPareto] = useState<VentanaPareto>(10)
  /* Qué turno se mira: el propio, o todos juntos para comparar día vs noche. */
  const [turnoPareto, setTurnoPareto] = useState<string | 'todos' | null>(null)

  /* El ranking y su barra: SOLO turnos con detalle de causas, o el total de
     arriba no cuadraría con la suma de las filas de abajo. */
  const turnosDelPareto = useMemo(
    () => turnosParaVentana(turnosConocidos, {
      ventana: ventanaPareto,
      turno: turnoPareto ?? vista?.shiftId ?? null,
      conCausas: true,
    }),
    [turnosConocidos, ventanaPareto, turnoPareto, vista?.shiftId],
  )
  /* El turno ENTERO, no solo sus causas: buildPareto valoriza cada causa con
     el cpm andando del turno en que ocurrió. */
  const pareto = useMemo(() => buildPareto(turnosDelPareto), [turnosDelPareto])
  const paretoCtx = useMemo(() => contextoPareto(turnosDelPareto), [turnosDelPareto])
  /*
   * ⚠⚠ La tendencia mira LOS MISMOS turnos que el ranking, no más.
   *
   * Tenía sentido técnico que mirara más (solo necesita minutos, no causas),
   * pero en pantalla quedaba «6 de 10 turnos» arriba y diez barras abajo, y
   * Orel insistió dos veces: un bloque que muestra dos conteos hace dudar del
   * dato entero, por bien explicado que esté. Vale más un bloque que cuadra
   * con seis turnos que uno que enseña diez y hay que justificar.
   *
   * No se pierde nada permanente: en cuanto `shiftStats` (#590) traiga el
   * detalle de todos, el mismo selector muestra 10, 15 o 30 sin explicaciones.
   */
  const paretoTendencia = paretoCtx

  /* Un contexto por turno: es la comparación «Día vs Noche». Con un solo turno
     corriendo devuelve uno y la UI no ofrece nada. */
  const paretoPorTurno = useMemo(
    () => contextoPorTurno(turnosConocidos, ventanaPareto),
    [turnosConocidos, ventanaPareto],
  )


  /**
   * El ritmo de la línea ANDANDO: piezas por minuto de uptime.
   *
   * ⚠⚠ Es la base que hace comparable todo lo demás. Desde que el ritmo
   * necesario descuenta las paradas de convenio, pedirlo sobre tiempo
   * productivo y contrastarlo contra un ritmo de RELOJ mezcla dos medidas: la
   * pantalla decía "necesitás 39,4 y vas a 9,7" cuando la línea, andando, iba
   * a 11,7. Lo vio Orel al toque: "igual le pones 39 pz/min".
   *
   * Medido en los 10 turnos de Filete (14-08): andando la mediana es 11,0 y el
   * mejor turno 13,2, contra 8,1 y 9,7 de reloj. La diferencia entre las dos
   * medidas ES el tiempo parado — que es justo lo que Mantención mueve.
   */
  /**
   * Cuánto costó cada parada, en piezas.
   *
   * ⚠ Cada evento se valoriza al ritmo que la línea traía JUSTO ANTES, no al
   * promedio del turno. Lo vio Orel el 14-08: antes del corte de agua la línea
   * venía a 12,1 pz/min con tramos de 8,5, no a los 13,5 del promedio. Con el
   * promedio las paradas de ese turno suman 719 pz; medidas así, 662. Esas 57
   * piezas de diferencia se le imputaban a Mantención sin que hubieran existido.
   */
  const costoParadas = useMemo(
    () =>
      costoDeParadas({
        series: live?.series,
        stopEvents: live?.stopEvents,
        stopReasons: live?.stopReasons,
        // Solo lo recuperable: el convenio no se convierte a piezas.
        recuperables: (live?.timeBreakdown?.recoverable ?? []).map((x) => x.reason),
        cpmGlobal:
          live?.timeBreakdown && live.timeBreakdown.producingMin > 0
            ? live.totalPieces / live.timeBreakdown.producingMin
            : 0,
      }),
    [live],
  )

  /**
   * Los eventos del turno agrupados por dueño de la pérdida, con el árbol
   * OFICIAL de imputación como juez (ver `monitorEventos`).
   */
  const gruposEventos = useMemo(
    () =>
      agruparEventos({
        tb: live?.timeBreakdown,
        stopEvents: live?.stopEvents,
        stopReasons: live?.stopReasons,
        costo: costoParadas,
        cpmGlobal:
          live?.timeBreakdown && live.timeBreakdown.producingMin > 0
            ? live.totalPieces / live.timeBreakdown.producingMin
            : null,
        /* El minuto 0 del eje que comparten los gráficos: la PRIMERA PIEZA,
           la misma base de `monitorCompare`. Con él, cada parada sabe
           dónde cae en el gráfico y se puede saltar a ella sola. */
        t0: serieDelTurno[0]?.t ?? null,
      }),
    [live, costoParadas, serieDelTurno],
  )

  /*
   * Por qué el turno cerró distinto que ayer, y los récords de la línea.
   *
   * Los resúmenes salen de DOS fuentes que se complementan: `forecastHistory`
   * (hasta 10 turnos del mismo nombre, RECONSTRUIDOS con el código vigente) y
   * `history` (solo 6 turnos, con el `live` completo pero CACHEADO tal como se
   * calculó en su momento).
   *
   * ⚠ Manda `forecastHistory` cuando trae el desglose. Verificado el 14-08: el
   * `history` cacheado decía 397 min produciendo para el 07-08 y reconstruirlo
   * fresco da 351 — son números de ANTES de los fixes de atribución de paradas,
   * y un «récord de 84% andando» calculado con otras reglas no es un récord,
   * es una vara torcida. `history` queda solo de relleno para los dateKeys que
   * el backend todavía no repobló.
   */
  const resumenesAnteriores = useMemo(() => {
    /*
     * ⚠⚠ La clave lleva el NOMBRE del turno, no solo la fecha. Con día y noche
     * corriendo, dos turnos del mismo día son dos entradas distintas: con la
     * fecha sola, el que llegara segundo pisaba al primero y desaparecía.
     *
     * Y el filtro por turno mira el turno VISTO (`vista`), no el vigente: es
     * el mismo gotcha de siempre en esta página — mirando el nocturno de ayer
     * desde el diurno de hoy, comparaba contra los diurnos.
     */
    const por = new Map<string, TurnoResumen>()
    const turnoVisto = vista?.shiftId ?? null
    const mismo = (id: string | null) => !turnoVisto || !id || id === turnoVisto
    const clave = (dateKey: string, shiftId: string | null) => `${dateKey}|${shiftId ?? ''}`

    for (const h of data?.forecastHistory ?? []) {
      if (h.windowMin == null) continue // entrada vieja, sin desglose: no sirve acá
      /* `forecastHistory` no trae `shiftId` suelto: viene dentro del docId. */
      const shiftId = parseShiftDocId(h.shiftDocId)?.shiftId ?? null
      if (!mismo(shiftId)) continue
      por.set(clave(h.dateKey, shiftId), {
        dateKey: h.dateKey,
        shiftId,
        total: h.total,
        producingMin: h.producingMin,
        windowMin: h.windowMin,
        plannedMin: h.plannedMin,
        recoverableMin: h.recoverableMin,
      })
    }
    for (const h of data?.history ?? []) {
      const shiftId = h.shiftId ?? null
      if (por.has(clave(h.dateKey, shiftId))) continue
      if (!mismo(shiftId)) continue          // el nocturno no compara con el de día
      const tb = h.live?.timeBreakdown
      if (!tb) continue
      por.set(clave(h.dateKey, shiftId), {
        dateKey: h.dateKey,
        shiftId,
        total: h.live.totalPieces ?? 0,
        producingMin: tb.producingMin ?? 0,
        windowMin: tb.windowMin,
        plannedMin: tb.plannedMin,
        recoverableMin: tb.recoverableMin,
      })
    }
    /*
     * ⚠⚠ Y por último `shiftStats`, que es el ÚNICO que trae TODOS los nombres
     * de turno (40 turnos livianos). `forecastHistory` se publica solo para el
     * turno VIGENTE, así que al mirar el otro —el diurno mientras corre la
     * noche, o al revés— la muestra se quedaba corta y la banda de «rango
     * normal» desaparecía justo cuando Filete pasó a tener dos turnos. Va al
     * final porque las otras dos fuentes traen más detalle por turno.
     */
    for (const t of data?.shiftStats ?? []) {
      const shiftId = t.shiftId ?? null
      if (por.has(clave(t.dateKey, shiftId))) continue
      if (!mismo(shiftId)) continue
      if (t.windowMin == null || t.producingMin == null) continue
      por.set(clave(t.dateKey, shiftId), {
        dateKey: t.dateKey,
        shiftId,
        total: t.total ?? 0,
        producingMin: t.producingMin,
        windowMin: t.windowMin,
        plannedMin: t.plannedMin ?? 0,
        recoverableMin: t.recoverableMin ?? 0,
      })
    }
    return [...por.values()]
  }, [data?.history, data?.forecastHistory, data?.shiftStats, vista?.shiftId])

  /*
   * ⚠ Solo con el turno CERRADO: a mitad de turno el término «duración»
   * compararía una ventana a medio crecer contra una completa, y todos los
   * números darían en contra sin que nadie hubiera hecho nada mal. En vivo esa
   * pregunta la contesta el comparador.
   */
  /*
   * ⚠ `vista.dateKey`, NUNCA `data.dateKey`: `live` es el turno que se está
   * MIRANDO (con «Anterior» puede ser el de ayer) y `data.dateKey` el VIGENTE.
   * Con el vigente, el turno visto pasaba el filtro `< hoy` y entraba en su
   * propia banda/récords: el 14-08 visto desde el 15 decía «en su rango normal
   * (10,3–13,5)» — el techo era él mismo, y el récord desaparecía. Es la
   * violación exacta del «fijado a priori» de la guía.
   */
  const resumenHoy = useMemo((): TurnoResumen | null => {
    if (!live?.shiftClosed || !live.timeBreakdown || !vista?.dateKey) return null
    return {
      dateKey: vista.dateKey,
      shiftId: vista.shiftId ?? null,
      total: live.totalPieces,
      producingMin: live.timeBreakdown.producingMin,
      windowMin: live.timeBreakdown.windowMin,
      plannedMin: live.timeBreakdown.plannedMin,
      recoverableMin: live.timeBreakdown.recoverableMin,
    }
  }, [live, vista?.dateKey, vista?.shiftId])

  /*
   * El rango normal se calcula también EN VIVO (no solo con el turno cerrado):
   * la banda es de los turnos anteriores y no cambia con el minuto a minuto.
   */
  const banda = useMemo(() => {
    const hoy: TurnoResumen | null = live?.timeBreakdown && vista?.dateKey
      ? {
        dateKey: vista.dateKey,
        shiftId: vista.shiftId ?? null,
        total: live.totalPieces,
        producingMin: live.timeBreakdown.producingMin,
        windowMin: live.timeBreakdown.windowMin,
        plannedMin: live.timeBreakdown.plannedMin,
        recoverableMin: live.timeBreakdown.recoverableMin,
      }
      : null
    return hoy ? bandaNormal(hoy, resumenesAnteriores) : null
  }, [live, vista?.dateKey, vista?.shiftId, resumenesAnteriores])

  const comparadoConAyer = useMemo(
    () => (resumenHoy ? compararVsAyer(resumenHoy, resumenesAnteriores) : null),
    [resumenHoy, resumenesAnteriores],
  )
  const recordsLinea = useMemo(
    () => (resumenHoy ? recordsDeLinea(resumenHoy, resumenesAnteriores) : null),
    [resumenHoy, resumenesAnteriores],
  )

  const ritmoAndando = useMemo(() => {
    /*
     * ⚠ Del MISMO turno: este ritmo alimenta el techo («lo que esta línea
     * demostró que puede»). Con día y noche corriendo, mezclarlos le pondría
     * al diurno un techo hecho con nocturnos, que trabajan otra dotación y
     * otra materia prima. `resumenesAnteriores` ya viene filtrado por el turno
     * VISTO y trae las tres fuentes, incluido `shiftStats`.
     */
    const previos = resumenesAnteriores
      .filter((h) => h.producingMin > 0 && h.total > 0)
      .map((h) => h.total / h.producingMin)
      .sort((a, b) => a - b)
    const uptimeMin = (live?.uptimeSec ?? 0) / 60
    const hoy = uptimeMin > 0 && live?.totalPieces ? live.totalPieces / uptimeMin : null
    if (previos.length === 0) return { hoy, mediana: null, mejor: null, muestras: 0 }
    return {
      hoy,
      mediana: previos[Math.floor(previos.length / 2)]!,
      mejor: previos[previos.length - 1]!,
      muestras: previos.length,
    }
  }, [live?.uptimeSec, live?.totalPieces, resumenesAnteriores])

  /*
   * Ritmo necesario para llegar a la meta. Se recalcula con el mismo reloj que
   * el resto de la página (`now`, que tictaquea solo), así que la recomendación
   * baja sola a medida que avanza el turno.
   *
   * ⚠ `now` es UTC real y los horarios del turno son wall-clock de planta: hay
   * que llevar el reloj al mismo marco antes de restar, o el tiempo restante
   * sale corrido las horas del huso.
   */
  const pace = useMemo(() => {
    if (!live) return null
    const nowWallMs = now - new Date(now).getTimezoneOffset() * 60_000
    /*
     * Lo que falta de COLACIÓN dentro de la ventana. Sin esto el ritmo
     * necesario se reparte sobre tiempo de reloj: el 14-08 a las 12:50 pedía
     * 13,1 pz/min repartiendo 2.089 pz en 2 h 40, con ~55 min de colación
     * adentro. Sobre los minutos en que la línea produce son casi 20.
     * Minutos contados desde la primera pieza, la base de `breaks`.
     */
    const t0 = serieDelTurno[0]?.t ? Date.parse(serieDelTurno[0]!.t) : NaN
    const desdeMin = live.series?.length ? live.series.length * 5 : 0
    const hastaMin = !Number.isNaN(t0) && live.plannedEnd
      ? (Date.parse(live.plannedEnd) - t0) / 60_000
      : desdeMin
    return computePaceToTarget({
      // La cuota del link primero; si no, la de la config del turno.
      targetPieces: data?.targetPieces ?? live.quotaPieces,
      expectedPieces: live.expectedPieces,
      producedPieces: live.totalPieces,
      // `plannedEnd`, no `scheduledEnd`: aquél corre detrás del reloj y dejaría
      // el tiempo restante en ~0 durante todo el turno.
      scheduledEnd: live.plannedEnd,
      nowWallMs,
      /*
       * ⚠ Ritmo ANDANDO, no de reloj: el requerido se pide sobre el tiempo en
       * que la línea va a producir, así que compararlo contra un ritmo que
       * incluye las paradas mide dos cosas distintas.
       */
      currentPerHour: (ritmoAndando.hoy ?? live.piecesPerMinute) * 60,
      // Sin ritmo reciente: el de los últimos 30 min es de reloj y durante una
      // colación cae a cero. Mezclarlo acá volvería a cruzar las dos medidas.
      recentPerHour: null,
      /*
       * El techo sale del MEJOR turno real, no de `expectedPieces/horas`. Ese
       * cálculo mezclaba lo que el sensor espera con una ventana que puede ser
       * de otro turno, y daba números que la línea ya había superado. Lo que la
       * línea demostró que puede es un techo que se puede defender.
       */
      maxPerHour: ritmoAndando.mejor != null
        ? ritmoAndando.mejor * 60
        : live.paceBestCpm != null
        ? live.paceBestCpm * 60
        : lineMaxPerHour(live.expectedPieces, live.scheduledStart, live.plannedEnd),
      shiftClosed: live.shiftClosed,
      pendingBreakMin: Number.isNaN(t0) ? 0 : breakMinutesBetween(breaksTurno, desdeMin, hastaMin),
    })
  }, [live, data?.targetPieces, now, breaksTurno, ritmoAndando, serieDelTurno])

  /*
   * Comparador con los turnos anteriores, a la misma altura de turno.
   *
   * La serie de cada día ya viaja en el doc (`history`), así que esto no cuesta
   * ni una lectura extra.
   *
   * ⚠ La curva objetivo se APLANA durante las paradas de convenio. Repartir la
   * cuota en una recta supone que no hay colación y termina pidiendo producción
   * justo cuando la línea está parada por convenio — a la hora 5, en esta línea.
   * Las paradas de hoy son hechos; para las que todavía no ocurrieron se usan
   * las de los días anteriores como pronóstico.
   */
  const comparacion = useMemo(() => {
    /*
     * Sin cuota configurada vale el objetivo de Shoplogix, que es contra lo que
     * la pantalla ya mide arriba: si no, en Yal el comparador se quedaba sin
     * referencia y no había con qué contrastar el avance.
     */
    const meta = data?.targetPieces ?? live?.quotaPieces ?? live?.expectedPieces ?? null
    const tb = live?.timeBreakdown

    // Las mismas del ritmo necesario y del fondo de los gráficos: `breaksTurno`.
    const breaks = breaksTurno

    /*
     * ⚠⚠ La curva de la cuota se reparte sobre el turno COMPLETO, no sobre lo
     * transcurrido.
     *
     * Visto en vivo el 14-08 a las 11:25: `timeBreakdown.windowMin` son los
     * minutos de operación HASTA AHORA (215), no la duración del turno (465).
     * Repartir 5.000 piezas sobre 215 min pedía 23 pz/min en una línea que da
     * 10: la línea ámbar trepaba hasta la cuota en la hora 4 y después seguía
     * plana, el área roja se comía el gráfico y "dónde se abrió la brecha"
     * marcaba el turno entero. Un solo error explicaba los tres síntomas.
     *
     * Con el turno cerrado no se notaba, porque ahí lo transcurrido ES la
     * duración: el bug solo aparecía con el turno en curso.
     */
    /*
     * ⚠⚠ Desde el ARRANQUE REAL, no desde `scheduledStart`. En un turno sin
     * definir la ventana declarada empieza en el borde de las 06:00 del día
     * ANTERIOR: con el cierre estimado del día siguiente, la resta daba casi
     * 26 h de turno y la cuota se repartía tan fina que cualquier ritmo parecía
     * ir sobrado.
     *
     * ⚠ Y el fallback a `windowMin` —lo TRANSCURRIDO— es el que producía la
     * cuota fantasma: a las 02:45, con 2 h 21 de producción, repartía las 5.000
     * sobre lo transcurrido y anunciaba «van 1.829 de las 5.000 que tocaban a
     * esta hora», imputándole al turno una deuda de 3.100 piezas por un tiempo
     * que todavía no pasó. Sin cierre conocido NO hay cuota que repartir: mejor
     * no dibujar la curva que dibujar una que miente.
     */
    const ventanaTurnoMin = inicioReal && live?.plannedEnd
      ? Math.round((Date.parse(live.plannedEnd) - Date.parse(inicioReal)) / 60_000)
      : 0
    /* Y el tiempo de convenio también es el PREVISTO: `plannedMin` todavía es 0
       a media mañana porque la colación no ocurrió, pero va a ocurrir. */
    const convenioPrevistoMin = breaks.reduce((a, b) => a + Math.max(0, b.toMin - b.fromMin), 0)
    const opt = meta && ventanaTurnoMin > 0
      ? optimalPace({
          targetPieces: meta,
          windowMin: ventanaTurnoMin,
          plannedMin: Math.max(convenioPrevistoMin, tb?.plannedMin ?? 0),
        })
      : null

    return buildDayComparison({
      todaySeries: live?.series,
      /*
       * ⚠⚠ El turno VISTO, no el vigente. `todaySeries` ya venía de `vista`
       * pero el dateKey salía de `data`: mirando el 14-08 la curva era la del
       * 14 y su etiqueta decía 15, así que el propio 14 seguía en `previous` y
       * el veredicto se comparaba CONSIGO MISMO — «0 arriba de vie 14 (3.919)»
       * estando parado en el vie 14. Es el gotcha de siempre en esta página:
       * lo que dependa de «hoy» se toma de `vista`, nunca de `data`.
       */
      todayDateKey: vista?.dateKey ?? '',
      todayShiftId: vista?.shiftId ?? null,
      /*
       * ⚠⚠ NO se filtra por nombre de turno, y esto se decidió MIRANDO LOS
       * DATOS (Orel, 17-08). Filete movió su turno de producción: hasta el 14
       * el grande era «Turno Dia» (07:50–15:30, 2.400–4.400 pz) y el 17 pasó a
       * ser «Turno Noche L» (00:20–07:51, 4.398 pz) — el MISMO turno corrido de
       * hora. El «Turno Dia» del 17 es otra cosa: 4 h y 604 pz.
       *
       * O sea que el nombre dejó de significar lo mismo, y filtrar por él hacía
       * exactamente lo contrario de lo que sirve: le ponía al turno chico la
       * vara del grande, y dejaba al grande sin nada con qué compararse.
       *
       * Se ofrecen TODOS los turnos, cada uno etiquetado con el suyo, y ordenados
       * con los del mismo nombre primero. Quién compara contra quién lo elige la
       * persona con los chips: el nombre es una sugerencia, no una regla.
       */
      previous: (() => {
        const otros = (data?.history ?? [])
          .filter((h) => !(h.dateKey === vista?.dateKey && h.shiftId === vista?.shiftId))
        if (!vista?.shiftId) return otros
        const mismo = otros.filter((h) => h.shiftId === vista.shiftId)
        const resto = otros.filter((h) => h.shiftId !== vista.shiftId)
        return [...mismo, ...resto]
      })().map((h) => ({ dateKey: h.dateKey, shiftId: h.shiftId, series: h.live?.series })),
      maxDays: 6,
      targetPieces: meta,
      usefulMin: opt?.usefulMin ?? null,
      breaks,
    })
    // El turno VISTO entra en las dependencias: al navegar a otro turno la
    // comparación tiene que rearmarse contra los días previos a ESE.
  }, [live, inicioReal, vista?.dateKey, vista?.shiftId, data?.history, data?.targetPieces, breaksTurno])

  /*
   * Pronóstico del cierre. Se alimenta del `history` que YA viaja en el doc:
   * cero lecturas extra.
   *
   * ⚠ Solo turnos del MISMO nombre. En Yal conviven tres turnos por día con
   * dotación y duración distintas; mezclarlos como si fueran comparables es
   * exactamente el error que el motor no puede detectar por su cuenta. Si con
   * ese filtro no queda muestra suficiente, el bloque no aparece.
   */
  const pronostico = useMemo(() => {
    const metaFc = data?.targetPieces ?? live?.quotaPieces ?? live?.expectedPieces ?? null
    /*
     * `forecastHistory` trae hasta 10 turnos del MISMO nombre; el filtro sobre
     * `history` queda de respaldo para los docs anteriores a ese campo (y para
     * las líneas de un solo turno por día, donde alcanzaba).
     */
    const resumidos = (data?.forecastHistory ?? []).map((h) => ({
      curve: (h.curve ?? []).map((p) => ({ minutes: p.m, pieces: p.p })),
      totalPieces: h.total,
    }))
    const historial = resumidos.length > 0
      ? resumidos
      : (data?.history ?? [])
          /* `vista`, no `data`: el turno que se está MIRANDO, no el vigente. */
      .filter((h) => h.shiftId === vista?.shiftId)
          .map((h) => ({
            curve: cumulativeFromStart(h.live?.series),
            totalPieces: h.live?.totalPieces ?? 0,
          }))
    return buildForecast({
      todayCurve: cumulativeFromStart(live?.series),
      currentMinute: comparacion.currentMinute,
      history: historial,
      targetPieces: metaFc,
      shiftClosed: live?.shiftClosed,
    })
  }, [live, data?.history, data?.forecastHistory, data?.targetPieces, comparacion.currentMinute, vista?.shiftId])

  /**
   * Hasta cuándo mide el pronóstico, y cuánto sería si el turno cortara en su
   * horario.
   *
   * ⚠⚠ Los dos cierres de la pantalla no discrepaban por la cuenta sino por el
   * horizonte: `pace` proyecta a `plannedEnd` y el pronóstico a la mediana de
   * lo que DURARON los turnos anteriores (`horizonMin`). En Filete son 460 min
   * contra 525 — la hora extra que la línea hace casi todos los días. Acá se
   * traducen los dos a hora de reloj para que cada número diga hasta cuándo
   * vale, en vez de dejar que se contradigan a tres tarjetas de distancia.
   *
   * El minuto 0 es la PRIMERA PIEZA, no `scheduledStart` ni el primer tramo
   * sincronizado: es la misma base con que `monitorCompare` indexa las curvas.
   */
  const horizontePronostico = useMemo(() => {
    const t0raw = serieDelTurno[0]?.t
    if (!pronostico || !t0raw) return null
    const t0 = Date.parse(t0raw)
    if (Number.isNaN(t0)) return null
    const finMs = t0 + pronostico.horizonMin * 60_000
    const horarioMs = live?.plannedEnd ? Date.parse(live.plannedEnd) : NaN
    /*
     * La segunda línea solo cuando el horario corta ANTES y por un margen que
     * se note: con los dos horizontes casi pegados serían dos cifras iguales
     * ocupando dos renglones, que es la clase de ruido que este cambio vino a
     * sacar.
     */
    const horario =
      pace && pace.verdict !== 'hora-extra' && !Number.isNaN(horarioMs) &&
      horarioMs < finMs - 15 * 60_000
        ? { hasta: fmtWallTime(live!.plannedEnd!), piezas: Math.round(pace.projectedPieces) }
        : null
    return {
      hasta: fmtWallTime(new Date(finMs).toISOString()),
      dura: fmtDurationSec(pronostico.horizonMin * 60),
      horario,
      // El titular del pronóstico, para poder decirlo también arriba: la
      // respuesta a "¿llegamos?" no puede estar partida en dos tarjetas.
      estimate: pronostico.mapePct <= MAX_MAPE_PCT ? pronostico.estimate : null,
      mapePct: pronostico.mapePct <= MAX_MAPE_PCT ? pronostico.mapePct : null,
    }
  }, [pronostico, live, pace, serieDelTurno])

  /**
   * Velocidad de la máquina y llenado de silletas.
   *
   * Solo para los modelos cuyo mecanismo conocemos (hoy, la Baader 200 de
   * Filete). El ritmo va ANDANDO: sobre el reloj se mezclarían las paradas con
   * el llenado, que es justo la confusión que este bloque viene a deshacer.
   */
  /*
   * El ritmo "de reloj" HONESTO: piezas ÷ lapso real de punta a punta
   * (tb.windowMin, la vara del fix #562). `live.piecesPerMinute` divide por los
   * minutos de OPERACIÓN (huecos >30 min descontados) — decirle "con paradas y
   * colación" a ese número era falso justo en la colación larga, y además el
   * ritmo requerido del pace ya usa la base de lapso real: eran dos "reloj"
   * distintos en la misma pantalla.
   */
  /* El «de reloj · pz/h» salió de la pantalla con la regla de ritmo: era la
     misma producción en otra unidad, y dos unidades obligan a convertir de
     cabeza. El pz/h sigue en las exportaciones y en el análisis del turno. */
  /** El set point que manda: el editado por un supervisor, si existe. */
  const setCpmVigente = live?.setPoint?.cpm ?? specDeMaquina(live?.machines?.[0]?.model)?.setCpm ?? null

  const llenadoSilletas = useMemo(
    () => llenadoDeSilletas({
      model: live?.machines?.[0]?.model,
      cpmAndando: ritmoAndando.hoy,
      producingMin: live?.timeBreakdown?.producingMin,
      remainingPieces: pace?.remainingPieces,
      workMin: pace?.workMin,
      // El mejor tramo del turno, para que los datos puedan desmentir el set
      // point configurado en vez de que alguien tenga que acordarse de revisarlo.
      maxTramoCpm: live?.series?.length
        ? Math.max(...live.series.map((p) => p.pieces || 0)) / 5
        : null,
      setCpmOverride: live?.setPoint?.cpm ?? null,
    }),
    [live?.machines, live?.series, live?.timeBreakdown, live?.setPoint, ritmoAndando.hoy, pace],
  )

  /**
   * El día anterior más reciente a la MISMA altura de turno.
   *
   * Vivía solo dentro del comparador; ahora que ese bloque arranca plegado, la
   * referencia que uno busca primero —"¿vamos mejor o peor que ayer?"— sube a
   * la tarjeta de arriba.
   */
  const vsAyer = useMemo(() => {
    const hoy = comparacion.days.find((d) => d.esHoy)
    const previo = comparacion.days.find((d) => !d.esHoy && d.atCurrentMinute != null)
    if (!hoy?.atCurrentMinute || !previo?.atCurrentMinute) return null
    return {
      label: previo.label,
      pieces: previo.atCurrentMinute,
      diff: hoy.atCurrentMinute - previo.atCurrentMinute,
    }
  }, [comparacion.days])

  /**
   * La hora de reloj de la próxima parada de convenio que todavía no empezó.
   *
   * Sirve para el turno temprano, cuando "Planificado 0 min" ocupaba un chip
   * para no decir nada y se leía como si faltara un dato. El horario ya lo
   * conoce la pantalla —lo usa para aplanar la curva de la cuota—, así que en
   * vez de un cero mudo se anticipa cuándo entra la colación. Se calcula acá y
   * no en el bloque porque `fromMin` es relativo al arranque del turno: pasar
   * la conversión a hora de reloj adentro obligaría a que el componente
   * conociera la convención wall-clock-as-UTC.
   */
  const proximaParada = useMemo(() => {
    // ⚠ La base es la PRIMERA PIEZA, que es contra lo que
    // `plannedBreaks` cuenta sus minutos. Con `scheduledStart` la hora salía
    // corrida (hoy 07:45 contra 07:40: cinco minutos tarde).
    const base = serieDelTurno[0]?.t ?? live?.scheduledStart
    if (!base || comparacion.currentMinute == null) return null
    const prox = comparacion.breaks
      .filter((b) => b.fromMin > comparacion.currentMinute!)
      .sort((a, b) => a.fromMin - b.fromMin)[0]
    if (!prox) return null
    /*
     * CON NOMBRE: «la próxima entra a las 12:50» obligaba a adivinar cuál. La
     * pregunta real de Control de Producción es «¿cuándo es la colación?», y
     * la respuesta tiene que decir colación. La hora lleva ~ porque es la
     * mediana de los turnos anteriores, no un horario pactado.
     */
    return {
      hora: fmtWallTime(new Date(Date.parse(base) + prox.fromMin * 60_000).toISOString()),
      reason: prox.reason,
    }
  }, [serieDelTurno, live?.scheduledStart, comparacion.breaks, comparacion.currentMinute])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <RefreshCw className="h-6 w-6 animate-spin text-sky-600 dark:text-sky-400" />
      </div>
    )
  }

  if (status === 'gone' || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <AlertCircle className="h-11 w-11 text-red-600 dark:text-red-400" />
        <p className="text-lg font-semibold text-foreground">Este link ya no está disponible</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Los links de monitoreo tienen vencimiento y se pueden revocar. Pide uno nuevo a
          Mantención para seguir viendo el turno.
        </p>
      </div>
    )
  }

  // Un link de línea puede nacer fuera de turno (fin de semana, parada). No
  // está roto: está esperando. Decirle "no disponible" mandaría a pedir otro
  // link que tampoco mostraría nada.
  if (!live) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <Hourglass className="h-11 w-11 text-primary" />
        <p className="text-lg font-semibold text-foreground">Esperando el próximo turno</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {data.machineKindLong || data.lineLabel || 'La línea'} no tiene un turno en curso. Esta
          pantalla se llena sola cuando arranque — deja el link guardado.
        </p>
      </div>
    )
  }

  const lineTitle = data.machineKindLong || data.lineLabel || data.areaLabel || 'Línea de producción'
  // Dedupe: en las líneas donde el área y la planta se llaman igual (Filete)
  // el subtítulo quedaba "Filete · Filete".
  const areaTitle = [...new Set([data.lineLabel, data.areaLabel].filter(Boolean))].join(' · ')

  const outside = live.outsidePieces ?? 0

  const stale = live.lastSyncAt
    ? (now - new Date(live.lastSyncAt).getTime()) / 1000 > 15 * 60
    : true

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Cabecera: qué línea, qué turno, qué día, desde qué hora */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-base font-semibold leading-tight">{lineTitle}</h1>
            {/* Con el turno CERRADO no se anuncia el estado en vivo: «Detenida»
                junto a «Turno cerrado» son dos estados a la vez, y a 375 px
                empujaban la fecha a una tercera línea. */}
            {!live.shiftClosed && <StatusPill live={live} />}
            {live.shiftClosed && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                Turno cerrado
              </span>
            )}
          <button
            onClick={toggleTheme}
            className="tap-44 ml-auto shrink-0 rounded-full border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground"
            title={isDark ? 'Cambiar a vista clara' : 'Cambiar a vista oscura'}
            aria-label={isDark ? 'Cambiar a vista clara' : 'Cambiar a vista oscura'}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted-foreground">
            {areaTitle && <span>{areaTitle}</span>}
            {areaTitle && <span className="text-muted-foreground/50">·</span>}
            <span className="font-medium text-foreground/80">{vista?.shiftId || data.shiftId}</span>
            <span className="text-muted-foreground/50">·</span>
            {/* first-letter, no `capitalize`: ese capitaliza CADA palabra y
                dejaba "Lunes, 10 De Agosto". */}
            <span className="first-letter:uppercase">
              {fmtDateLong(vista?.dateKey || data.dateKey)}
              {(() => {
                /* El fin del turno: el previsto si está en curso, el real si cerró. */
                const finIso = live.shiftClosed ? live.scheduledEnd : (live.plannedEnd ?? live.scheduledEnd)
                if (!finIso || !inicioReal) return null
                const ini = new Date(inicioReal)
                const fin = new Date(finIso)
                if (Number.isNaN(ini.getTime()) || Number.isNaN(fin.getTime())) return null
                /* Wall-clock: los ISO del monitor llevan Z pero son hora de
                   planta, así que el día se lee con getUTCDate. */
                if (ini.getUTCDate() === fin.getUTCDate()) return null
                return <span className="text-muted-foreground/70"> → {fmtDiaCorto(fin)}</span>
              })()}
            </span>
            <span className="text-muted-foreground/50">·</span>
            {/*
              * Con el turno VIVO el fin de la ventana es el ÚLTIMO INTERVALO
              * SINCRONIZADO: se corre cada ~5 min y se leía como hora de
              * término ("15:00–21:52" con la línea produciendo a las 22:00).
              * Mientras el turno está en curso se muestra el cierre previsto
              * —la misma fuente que el "Cierre estimado" de abajo—; el rango
              * real recién vale cuando el turno cerró.
              */}
            {/*
              * El INICIO es la primera pieza, no `scheduledStart`: el resto del
              * monitor ya cuenta desde ahí (gráficos, hora por hora, comparador)
              * y la cabecera anunciaba «06:00» mientras los gráficos partían a
              * las 21:45 — dos horarios para el mismo turno en la misma
              * pantalla. Si no hay ni una pieza todavía, se muestra el
              * declarado: es lo único que se sabe.
              */}
            {!live.shiftClosed && live.plannedEnd ? (
              <span className="tabular-nums">
                {fmtWallTime(inicioReal)}&nbsp;&#8594;&nbsp;{fmtWallTime(live.plannedEnd)}
                {live.plannedEndSource !== 'fijado' && (
                  <span className="ml-1 rounded bg-muted px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                    est.
                  </span>
                )}
              </span>
            ) : (
              <span className="tabular-nums">
                {fmtWallTime(inicioReal)}–{fmtWallTime(live.scheduledEnd)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Navegación entre turnos. Solo aparece cuando hay historial: en una
          línea recién integrada no tiene sentido mostrar flechas muertas. */}
      {vistas.length > 1 && (
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 pt-3">
          <button
            onClick={() => irA(1)}
            disabled={idx >= vistas.length - 1}
            className="tap-44 flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1.5 text-[12px] text-foreground/80 transition-colors enabled:hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Anterior
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/70">
              {esActual ? 'Turno actual' : `${idx} turno${idx > 1 ? 's' : ''} atrás`}
            </span>
            {/* Atajo al presente: con seis turnos de historial, volver de a uno
                es tedioso. Solo aparece cuando de verdad hay camino que saltar. */}
            {idx > 1 && (
              <button
                onClick={() => verIndice(0)}
                className="tap-44 rounded-full bg-primary/[0.13] px-2 py-0.5 text-[11px] font-semibold text-foreground transition-opacity hover:opacity-80"
              >
                Ir al actual
              </button>
            )}
          </div>

          <button
            onClick={() => irA(-1)}
            disabled={esActual}
            className="tap-44 flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1.5 text-[12px] text-foreground/80 transition-colors enabled:hover:bg-muted disabled:opacity-30"
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <main
        className="mx-auto max-w-3xl space-y-3 px-4 py-4"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Piezas acumuladas — el número que vienen a ver */}
        <section className="rounded-2xl border border-border bg-gradient-to-b from-primary/[0.08] to-transparent px-4 py-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3 w-3" />
            {esActual ? 'Piezas procesadas en la jornada' : 'Piezas de ese turno'}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-5xl font-bold tabular-nums leading-none">{fmtInt(live.totalPieces)}</span>
            <span className="text-sm text-muted-foreground/70">piezas</span>
            {/* Hasta qué minuto cuenta el número (pedido de Orel, 13-ago): el
                contador de la pantalla de Shoplogix es vivo y este es un espejo
                que copia cada ~5 min — sin decir el corte, la diferencia de un
                ciclo de sync (63 pz ese día) parecía un descuadre de conteo.
                El corte honesto es el FIN del último tramo con dato (t + 5),
                no `lastSyncAt` (el sync puede correr sin traer tramo nuevo).
                Solo con el turno VIVO: cerrado, el total ya es final. */}
            {!live.shiftClosed && live.series && live.series.length > 0 && (
              <span className="text-[12px] tabular-nums text-muted-foreground/70">
                datos hasta las{' '}
                {new Date(Date.parse(live.series[live.series.length - 1]!.t) + 5 * 60_000)
                  .toISOString().slice(11, 16)}
                {/* El contador de la PANTALLA de planta, con su hora: el sync
                    lo captura del rollup vivo (mismo endpoint que el
                    whiteboard). Quien compara contra la pared encuentra acá el
                    mismo número. `at` es UTC real → reloj local del cliente. */}
                {live.shoplogixLive && live.shoplogixLive.totalCycles > 0 && (
                  <>
                    {' '}· Shoplogix marcaba{' '}
                    <span className="text-foreground/80">{fmtInt(live.shoplogixLive.totalCycles)}</span>
                    {live.shoplogixLive.at && (
                      <>
                        {' '}a las{' '}
                        {new Date(live.shoplogixLive.at).toLocaleTimeString('es-CL', {
                          hour: '2-digit', minute: '2-digit', hour12: false,
                        })}
                      </>
                    )}
                  </>
                )}
              </span>
            )}
          </div>

          {/* Desglose cuando la línea produjo fuera del horario del turno.
              Shoplogix cierra el turno a una hora fija y manda lo que venga
              después a otro bucket; sin este desglose el total no cuadra con lo
              que la gente contó en la línea, y ahí se pierde la confianza. */}
          {outside > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{fmtInt(live.shiftPieces ?? 0)} dentro del turno</span>
              <span className="text-muted-foreground/60">+</span>
              <Pill tone="warning" className="tabular-nums normal-case">
                {fmtInt(outside)} fuera del horario
              </Pill>
              {(live.outsideRanges ?? []).map(r => (
                <span key={r.from} className="text-[11px] tabular-nums text-muted-foreground/70">
                  ({r.kind === 'antes' ? 'antes: ' : ''}{fmtWallTime(r.from)}–{fmtWallTime(r.to)})
                </span>
              ))}
            </div>
          )}

          {data.targetPieces != null && progressPct != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Meta del turno: {fmtInt(data.targetPieces)} pz</span>
                <span className="tabular-nums">{fmtDec(progressPct, 0)}%</span>
              </div>
              {/*
               * Bullet, no barra de progreso: la banda gris de fondo es lo que
               * esta línea CIERRA normalmente. Separa dos conversaciones que el
               * % mezcla: «el turno fue malo» vs «la meta está por encima de lo
               * que la línea cerró en toda su historia» — en Filete la meta
               * (5.000) supera el mejor cierre real (4.915).
               */}
              {(() => {
                const meta = data.targetPieces!
                const techo = Math.max(meta, live.totalPieces, banda?.cierres.max ?? 0) * 1.04
                const pctDe = (v: number) => Math.min(100, (v / techo) * 100)
                return (
                  <div className="relative mt-1 h-3.5 overflow-hidden rounded-md bg-muted">
                    {banda && (
                      <span
                        className="absolute inset-y-0 bg-slate-400/40 dark:bg-slate-500/40"
                        style={{
                          left: `${pctDe(banda.cierres.min)}%`,
                          width: `${pctDe(banda.cierres.max) - pctDe(banda.cierres.min)}%`,
                        }}
                        title={`Cierres habituales: ${fmtInt(banda.cierres.min)}–${fmtInt(banda.cierres.max)} pz (${banda.muestras} turnos)`}
                      />
                    )}
                    <span
                      className="absolute inset-y-1 left-0 rounded-r-sm bg-sky-500 dark:bg-sky-400 transition-[width] duration-700"
                      style={{ width: `${pctDe(live.totalPieces)}%` }}
                    />
                    <span
                      className="absolute inset-y-0 w-[2.5px] bg-foreground"
                      style={{ left: `${pctDe(meta)}%` }}
                      title={`Meta: ${fmtInt(meta)} pz`}
                    />
                  </div>
                )
              })()}
              {banda && (
                <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/80">
                  La banda gris es lo que esta línea cierra normalmente{' '}
                  (<span className="tabular-nums">{fmtInt(banda.cierres.min)}–{fmtInt(banda.cierres.max)}</span>
                  , últimos {banda.muestras} turnos)
                  {data.targetPieces! > (banda.cierres.max ?? 0) && (
                    <> — la meta está por encima de todo ese rango</>
                  )}
                  .
                </p>
              )}
            </div>
          )}

          {/* Fuera del bloque de la meta: la recomendación también aplica
              cuando el link se creó sin cuota, midiendo contra lo que el sensor
              espera del turno — que es la mayoría de los links repartidos. */}
          {!live.shiftClosed && <RitmoNecesario
            pace={pace}
            cierre={live.plannedEnd}
            muestras={live.plannedEndSamples}
            fuente={live.plannedEndSource}
            plantSlug={data.plantSlug}
            shiftName={live.shiftName}
            startAt={live.scheduledStart}
            /* Referencias en la MISMA base que el requerido: andando. Con las
               de reloj la tarjeta comparaba 11,8 andando contra un "mejor
               turno" de 9,7 de reloj y anunciaba un récord que no existía. */
            horizonte={horizontePronostico}
            vsAyer={vsAyer}
            llenado={llenadoSilletas}
            historial={ritmoAndando.mediana != null ? {
              medianCpm: ritmoAndando.mediana,
              bestCpm: ritmoAndando.mejor,
              muestras: ritmoAndando.muestras,
            } : live.paceMedianCpm != null ? {
              medianCpm: live.paceMedianCpm,
              bestCpm: live.paceBestCpm ?? null,
              muestras: live.paceSamples ?? null,
            } : null}
          />}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              {/* El MISMO arranque que la cabecera: `effectiveStart` viene del
                  backend y toma el primer ciclo, aunque sea un pico suelto —
                  decía 21:45 mientras la cabecera decía 00:20. */}
              Producción real desde{' '}
              <span className="tabular-nums text-foreground/80">{fmtWallTime(inicioReal)}</span>
              {' '}hasta{' '}
              <span className="tabular-nums text-foreground/80">{fmtWallTime(live.effectiveEnd)}</span>
            </span>
            <span className="text-muted-foreground/50">·</span>
            {/* PRODUCIENDO, el mismo número de la tarjeta del %: acá vivía una
                tercera medida de tiempo ("6,8 h de operación", huecos >30 min
                descontados) entre el lapso del turno y el produciendo — tres
                números parecidos con dos etiquetas parecidas es la receta del
                "esto no suma" que ya nos mordió una vez. */}
            {live.timeBreakdown && live.timeBreakdown.producingMin > 0 ? (
              <span className="tabular-nums">
                {fmtDurationSec(live.timeBreakdown.producingMin * 60)} produciendo
              </span>
            ) : (
              <span className="tabular-nums">{fmtDec(live.windowHours)} h de operación</span>
            )}
          </div>
        </section>

        {/* Cadencia */}
        {(() => {
          const turnoCpm = live.timeBreakdown && live.timeBreakdown.producingMin > 0
            ? live.totalPieces / live.timeBreakdown.producingMin
            : null
          /* El contexto histórico que traía la tarjeta vieja: rango normal de
             los turnos anteriores y racha. Se conserva como TEXTO —una cifra
             más habría recreado el problema que este bloque vino a arreglar. */
          const racha = turnoCpm != null && banda
            ? rachaDeRitmos([...banda.turnos.map((t) => t.ritmo), turnoCpm])
            : null
          const fraseRacha = racha && turnoCpm != null
            ? ` — viene ${racha.dir > 0 ? 'subiendo' : 'aflojando'} ${racha.n} turnos`
            : ''
          const contexto = turnoCpm != null && banda
            ? turnoCpm > banda.ritmo.max ? `El turno va arriba de su rango normal${fraseRacha}`
              : turnoCpm < banda.ritmo.min ? `El turno va abajo de su rango normal${fraseRacha}`
              : `El turno va en su rango normal${fraseRacha}`
            : turnoCpm != null && resumenesAnteriores.length === 0
              ? 'Sin rango normal todavía: aparece al 5º turno'
              : null
          return (
            <ReglaDeRitmo
              ahora={ritmoAhoraAndando(serieDelTurno)}
              ahoraReloj={ritmoAhoraCpm(serieDelTurno)}
              turno={turnoCpm}
              setCpm={setCpmVigente}
              cerrado={live.shiftClosed}
              contexto={contexto}
              chispa={turnoCpm != null && banda
                ? <Chispa turnos={banda.turnos} hoy={turnoCpm} banda={banda.ritmo} />
                : undefined}
            />
          )
        })()}
        {/* Una sola tarjeta desde que el ritmo se unificó arriba: en una grilla
            de dos columnas quedaba a media pantalla, con el hueco al lado. */}
        <div className="grid grid-cols-1 gap-3">
          {/* El número que manda es el ANDANDO: mide a la línea y se compara
              entre turnos. El de reloj (piezas ÷ ventana) mezcla velocidad con
              disponibilidad —9,7 vs 9,7 el día que la línea fue la más rápida
              de los últimos 8 turnos— y queda como segunda línea, con su
              denominador escrito. */}
          {/* OJO — Acá vivían DOS tarjetas: «Ritmo andando» y «Últimos N min», y
              entre ambas repartían cuatro cifras de ritmo más las del gráfico.
              La grande era el acumulado del turno, que pasada la primera hora
              casi no se mueve: Orel vio caer el gráfico con el número quieto.
              Ahora son una sola regla, con el ritmo de AHORA de protagonista y
              las otras dos como posiciones de la escala. El detalle histórico
              (rango normal, racha de turnos) vive en «Comparado con otros
              días», que es el bloque que existe para eso. */}
          <Kpi
            label="Tiempo produciendo"
            /*
             * ⚠ Sobre el tiempo DISPONIBLE, no sobre el turno entero: la
             * colación no es tiempo en el que se podría haber producido, así
             * que meterla en el denominador castiga a la línea por una parada
             * de convenio (Orel, 14-08). Hoy la diferencia eran 13 puntos:
             * 68% del turno contra 81% de lo que la línea tenía disponible.
             */
            value={fmtDec(
              live.timeBreakdown && live.timeBreakdown.windowMin > live.timeBreakdown.plannedMin
                ? (live.timeBreakdown.producingMin /
                    (live.timeBreakdown.windowMin - live.timeBreakdown.plannedMin)) * 100
                : live.uptimePct,
              0,
            )}
            unit="%"
            icon={<Clock className="h-3 w-3" />}
            /*
             * Minutos de LÍNEA, no la suma del uptime de cada máquina: en Yal,
             * con tres Baader, esa suma daba "13 h 31 min" dentro de un turno
             * de 4 h 51 — un número imposible en la pantalla.
             */
            hint={
              live.timeBreakdown
                ? `${fmtDurationSec(live.timeBreakdown.producingMin * 60)}${
                    live.timeBreakdown.plannedMin > 0 ? ' · sin contar convenio' : ''
                  }`
                : fmtDurationSec(live.uptimeSec)
            }
          />
        </div>

        {/* Estado actual: por qué NO está corriendo, si es el caso. Con el
            turno CERRADO no se muestra: "Línea detenida hace 6 h" después del
            cierre es lo esperable, no una alerta — junto al aviso de sync
            detenida pintaba alarmante una noche normal. */}
        {live.status === 'detenida' && esActual && !live.shiftClosed && (
          <section className="rounded-2xl border border-border bg-muted px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-red-600 dark:text-red-400">
              <PauseCircle className="h-3 w-3" />
              Ahora mismo
            </div>
            <p className="mt-1 text-sm text-foreground">
              Línea detenida{live.currentReason ? ` — ${live.currentReason}` : ''}
              {live.currentSinceAt && (
                <span className="text-muted-foreground">
                  {' '}(desde {fmtWallTime(live.currentSinceAt)}, {fmtAgoWall(live.currentSinceAt, now)})
                </span>
              )}
            </p>
          </section>
        )}

        {/*
          Ahora que la cabecera muestra el arranque REAL, el horario declarado
          no se ve en ninguna otra parte: este aviso es el que lo conserva. Sin
          él, el turno de 06:00 desaparecería de la pantalla sin dejar rastro y
          nadie podría notar el desfase.
        */}
        {recorteActividad && serieDelTurno.length > 0 && (
          <p className="text-[11px] leading-snug text-muted-foreground">
            Todo se cuenta desde que arrancó la producción. El turno estaba declarado desde
            las <b className="text-foreground/80">{fmtWallTime(live.scheduledStart)}</b>.
            {pzAntesDelArranque > 0 && (
              <> Antes del arranque hubo <b className="text-foreground/80">{fmtInt(pzAntesDelArranque)} pz</b>
              {' '}sueltas —una prueba de máquina— que siguen contando en el total pero no marcan el inicio.</>
            )}
          </p>
        )}

        {/*
          El ORDEN cuenta la historia del estado (test del §0 del HIG: lo más
          importante AHORA va primero). En VIVO la pregunta es «¿cómo vamos y
          llegamos?»: pronóstico → comparador → velocidad → detalle. CERRADO es
          una autopsia: qué pasó → qué cambió contra ayer → la velocidad como
          evidencia → la comparación. El pronóstico y el ritmo necesario no se
          renderizan en cerrado: pronosticar un turno terminado no es un dato,
          es ruido.
        */}
        {live.shiftClosed ? (
          <>
            {/* ⚠ UN solo gráfico de la serie de 5 min.
                Había dos tarjetas —"Velocidad de la línea" y "Piezas por tramo"—
                dibujando exactamente la misma serie, una en pz/min y otra en
                piezas. La tendencia (media de 15 min) y las referencias de ritmo se
                mudaron acá, encima de su propio detalle, que además es el gráfico
                que sabe ubicar las detenciones y el que tiene el zoom a 8×. */}
            <Sparkbars
              series={serieDelTurno}
              stopReasons={live.stopReasons}
              stopEvents={live.stopEvents}
              comments={live.comments}
              causaSel={causaSel}
              onCausa={(c) => { setCausaSel(c); setTramoSel(null) }}
              tramoSel={tramoSel}
              breaks={comparacion.breaks}
              ventana={ventanaGrafica}
              onVentana={setVentanaGrafica}
              requiredPerMinute={pace && pace.requiredPerMinute > 0 ? pace.requiredPerMinute : null}
              medianCpm={live.paceMedianCpm}
              setCpm={setCpmVigente}
              fuenteSetPoint={live.setPoint
                ? `Set point ${fmtDec(live.setPoint.cpm)} pz/min` +
                  (live.setPoint.medidoEl ? ` · medido el ${live.setPoint.medidoEl}` : '') +
                  (live.setPoint.metodo ? ` (${live.setPoint.metodo})` : '') +
                  ' — no es dato del PLC.'
                : null}
              onGuardarSetPoint={esAdminMonitor && esActual && data.plantSlug
                ? async (cpm, metodo) => {
                  await setMonitorSetPoint({
                    plantSlug: data.plantSlug!,
                    cpm,
                    metodo,
                    por: usuarioActual?.email ?? null,
                  })
                }
                : undefined}
            />
            {/* El gráfico va ARRIBA del bloque de la meta (pedido de Orel):
                tocar una imputación salta al gráfico, y el salto tiene que ser
                hacia algo que ya pasaste, no hacia abajo. */}
            <TiempoDelTurno
              tb={live.timeBreakdown}
              causaSel={causaSel}
              onCausa={(c) => { setCausaSel(c); setTramoSel(null) }}
              onVentana={setVentanaGrafica}
              onTramo={setTramoSel}
              proximaParada={proximaParada}
              notas={notasDeOperador}
              /* La resta: minutos parados -> piezas, al ritmo del turno.
                 En vivo la vara es la cuota a ESTA altura (la curva del
                 comparador, aplanada en colacion) - contra la meta completa,
                 el "ritmo" absorberia lo que aun no se juega. */
              cerrado={live.shiftClosed}
              meta={data.targetPieces ?? live.quotaPieces ?? live.expectedPieces ?? null}
              hechas={live.totalPieces}
              cuotaAhora={comparacion.optimalAtCurrentMinute}
              horaAhora={`${String(new Date(now).getHours()).padStart(2, '0')}:${String(new Date(now).getMinutes()).padStart(2, '0')}`}
              cpmAndando={
                live.timeBreakdown && live.timeBreakdown.producingMin > 0
                  ? live.totalPieces / live.timeBreakdown.producingMin
                  : null
              }
              costo={costoParadas}
              grupos={gruposEventos}
              notasTurno={notasDeTurnoCompleto}
            />
            {/* La curva contra los otros días va ANTES del «vs ayer» (pedido de
                Orel): las dos miran atrás, pero esta enseña el turno completo de
                un vistazo y la de ayer es el detalle numérico de UNA de esas
                curvas. Primero el panorama, después la cuenta. */}
            <ComparadorDias
              ventana={ventanaGrafica}
              onVentana={setVentanaGrafica}
              refSel={refSel}
              onRefSel={setRefSel}
              cmp={comparacion}
              live={live}
              /* Solo cuando el pronóstico es creíble: un cono con 20% de error es
                 una mancha que promete lo que no puede. */
              cone={pronostico && pronostico.mapePct <= MAX_MAPE_PCT ? pronostico.cone : null}
            />
            {/* Cerró el turno: qué cambió contra ayer y cómo quedó contra los
                récords. Es el paso de "hoy pasó esto" a "esto vuelve todos los
                turnos". */}
            <VsAyerBloque r={comparadoConAyer} records={recordsLinea} />

          </>
        ) : (
          <>
            {/* Adónde va a cerrar el turno, según lo que hicieron los anteriores
                desde esta misma altura. Antes de la velocidad: primero el
                desenlace, después el detalle de cómo se está llegando. */}
            <PronosticoCierre
              f={pronostico}
              meta={data.targetPieces ?? live.quotaPieces ?? live.expectedPieces ?? null}
              horizonte={horizontePronostico}
            />
            {/* El comparador SUBE hasta acá, pegado al pronóstico: los dos
                contestan la misma pregunta —si el turno llega— y estaban separados
                por tres bloques de detalle. Arriba el desenlace, abajo el porqué
                (velocidad, tramos, tiempo, hora por hora). */}
            <ComparadorDias
              ventana={ventanaGrafica}
              onVentana={setVentanaGrafica}
              refSel={refSel}
              onRefSel={setRefSel}
              cmp={comparacion}
              live={live}
              /* Solo cuando el pronóstico es creíble: un cono con 20% de error es
                 una mancha que promete lo que no puede. */
              cone={pronostico && pronostico.mapePct <= MAX_MAPE_PCT ? pronostico.cone : null}
            />
            {/* ⚠ UN solo gráfico de la serie de 5 min.
                Había dos tarjetas —"Velocidad de la línea" y "Piezas por tramo"—
                dibujando exactamente la misma serie, una en pz/min y otra en
                piezas. La tendencia (media de 15 min) y las referencias de ritmo se
                mudaron acá, encima de su propio detalle, que además es el gráfico
                que sabe ubicar las detenciones y el que tiene el zoom a 8×. */}
            <Sparkbars
              series={serieDelTurno}
              stopReasons={live.stopReasons}
              stopEvents={live.stopEvents}
              comments={live.comments}
              causaSel={causaSel}
              onCausa={(c) => { setCausaSel(c); setTramoSel(null) }}
              tramoSel={tramoSel}
              breaks={comparacion.breaks}
              ventana={ventanaGrafica}
              onVentana={setVentanaGrafica}
              requiredPerMinute={pace && pace.requiredPerMinute > 0 ? pace.requiredPerMinute : null}
              medianCpm={live.paceMedianCpm}
              setCpm={setCpmVigente}
              fuenteSetPoint={live.setPoint
                ? `Set point ${fmtDec(live.setPoint.cpm)} pz/min` +
                  (live.setPoint.medidoEl ? ` · medido el ${live.setPoint.medidoEl}` : '') +
                  (live.setPoint.metodo ? ` (${live.setPoint.metodo})` : '') +
                  ' — no es dato del PLC.'
                : null}
              onGuardarSetPoint={esAdminMonitor && esActual && data.plantSlug
                ? async (cpm, metodo) => {
                  await setMonitorSetPoint({
                    plantSlug: data.plantSlug!,
                    cpm,
                    metodo,
                    por: usuarioActual?.email ?? null,
                  })
                }
                : undefined}
            />
            <TiempoDelTurno
              tb={live.timeBreakdown}
              causaSel={causaSel}
              onCausa={(c) => { setCausaSel(c); setTramoSel(null) }}
              onVentana={setVentanaGrafica}
              onTramo={setTramoSel}
              proximaParada={proximaParada}
              notas={notasDeOperador}
              /* La resta: minutos parados -> piezas, al ritmo del turno.
                 En vivo la vara es la cuota a ESTA altura (la curva del
                 comparador, aplanada en colacion) - contra la meta completa,
                 el "ritmo" absorberia lo que aun no se juega. */
              cerrado={live.shiftClosed}
              meta={data.targetPieces ?? live.quotaPieces ?? live.expectedPieces ?? null}
              hechas={live.totalPieces}
              cuotaAhora={comparacion.optimalAtCurrentMinute}
              horaAhora={`${String(new Date(now).getHours()).padStart(2, '0')}:${String(new Date(now).getMinutes()).padStart(2, '0')}`}
              cpmAndando={
                live.timeBreakdown && live.timeBreakdown.producingMin > 0
                  ? live.totalPieces / live.timeBreakdown.producingMin
                  : null
              }
              costo={costoParadas}
              grupos={gruposEventos}
              notasTurno={notasDeTurnoCompleto}
            />
            {/* Pegado al desglose de HOY va el de SIEMPRE: la misma pregunta —qué
                para la línea— pero mirando los turnos anteriores. Es el paso de
                "hoy pasó esto" a "esto vuelve todos los turnos". */}
            {/* Cerró el turno: qué cambió contra ayer y cómo quedó contra los
                récords. El orden es a propósito — primero qué pasó (arriba),
                después por qué fue distinto, después qué se repite siempre. */}
            <VsAyerBloque r={comparadoConAyer} records={recordsLinea} />

          </>
        )}

        {/* ⚠ Turno sin historia (la primera noche del turno noche): medio
            monitor no puede existir y eso es CORRECTO — pero se dice, con el
            plan de cuándo aparece cada cosa, en vez de dejar huecos mudos. */}
        {resumenesAnteriores.length === 0 && live.totalPieces > 0 && (
          <div className="rounded-xl border border-dashed border-border px-3 py-2.5 text-[11.5px] leading-snug text-muted-foreground">
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              ◔ Turno sin historia todavía
            </span>{' '}
            — «{live.shiftName ?? data.shiftId}» compara solo contra turnos del mismo nombre,
            nunca contra el de día. Van a ir apareciendo solos: el comparativo con ayer
            (2º turno), el pronóstico de cierre (4º), y el rango normal con los récords (5º).
          </div>
        )}

        <ParetoDeParadas
          pareto={pareto} ctx={paretoCtx} tendencia={paretoTendencia}
          porTurno={paretoPorTurno}
          ventana={ventanaPareto} onVentana={setVentanaPareto}
          turno={turnoPareto ?? vista?.shiftId ?? null} onTurno={setTurnoPareto}
        />

        <PorHora series={serieDelTurno} />

        {/* Desglose por máquina — solo aporta cuando la línea tiene más de una */}
        {live.machines.length > 1 && (
          <section className="rounded-2xl border border-border bg-card px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Por máquina</div>
            <ul className="mt-2 space-y-2">
              {live.machines.map(m => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  {/* El punto de estado solo con el turno VIVO: cerrado, todas
                      paradas es lo esperable — tres puntos rojos toda la noche
                      son la misma falsa alarma que el "Ahora mismo". */}
                  {!live.shiftClosed && (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        m.status === 'produciendo' ? 'bg-emerald-400' : m.status === 'detenida' ? 'bg-red-400' : 'bg-muted-foreground/40'
                      }`}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {m.name}
                      {m.model && <span className="ml-1 text-[11px] text-muted-foreground/70">{m.model}</span>}
                      {!live.shiftClosed && m.status === 'produciendo' && (
                        <span className="ml-1 text-[11px] text-muted-foreground/70">· produciendo</span>
                      )}
                    </span>
                    {/* Una Baader parada de tres no se veía en ningún lado: el
                        "Ahora mismo" de línea solo salta si paran TODAS. */}
                    {!live.shiftClosed && m.status === 'detenida' && m.currentReason && (
                      <span className="block truncate text-[11px] text-red-600 dark:text-red-400">
                        parada · {m.currentReason}
                        {m.currentSinceAt && ` (${fmtAgoWall(m.currentSinceAt, now)})`}
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums text-foreground/80">{fmtInt(m.pieces)} pz</span>
                  <span className="w-20 text-right tabular-nums text-[11px] text-muted-foreground/70">
                    {fmtInt(m.piecesPerHour)} pz/h
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Frescura y procedencia */}
        <footer className="space-y-1 pb-6 pt-1 text-center text-[11px] text-muted-foreground/60">
          {/* Con el turno CERRADO no hay sync porque no hay producción: "hace
              4 h — puede estar detenida" de noche alarmaba por lo normal. La
              alerta ámbar queda solo para dato viejo con turno VIVO. ⚠
              `lastSyncAt` es UTC REAL (no wall-clock): la hora se formatea con
              el reloj local del cliente, no con fmtWallTime. */}
          {live.shiftClosed ? (
            <p className="text-muted-foreground/70">
              Turno cerrado
              {live.lastSyncAt && (
                <>
                  {' '}· último dato de las{' '}
                  <span className="tabular-nums">
                    {new Date(live.lastSyncAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                </>
              )}
              . Se actualiza solo cuando arranque el próximo turno.
            </p>
          ) : (
            <p className={stale ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/70'}>
              <RefreshCw className="mr-1 inline h-3 w-3" />
              Datos de planta actualizados {fmtAgo(live.lastSyncAt, now)}
              {stale && ' — la sincronización puede estar detenida'}
            </p>
          )}
          <p>
            Se actualiza solo · solo lectura · compartido por {data.createdBy}
          </p>
          {data.mode === 'line' && (
            <p className="text-muted-foreground/70">
              Este link no caduca con el turno: al arrancar el siguiente, cambia solo.
            </p>
          )}
          <p>
            Link válido hasta {new Date(data.expiresAt).toLocaleString('es-CL', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
          {/* Decirlo es parte de hacerlo bien: se cuenta el uso, no a la gente. */}
          <p className="text-muted-foreground/60">
            Se cuentan las aperturas de forma anónima, para saber si la pantalla sirve.
            No se registra quién la abre.
          </p>
        </footer>
      </main>
    </div>
  )
}
