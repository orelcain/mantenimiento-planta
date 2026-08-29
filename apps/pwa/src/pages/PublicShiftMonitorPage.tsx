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
import { Activity, AlertCircle, ChevronLeft, ChevronRight, Clock, Gauge, Hourglass, Moon, PauseCircle, RefreshCw, Sun, Target, TrendingUp, Wrench } from 'lucide-react'
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
import { refrescarPulso, type PulsoMonitor } from '@/services/shoplogix/publicShiftMonitor.service'
import { elegirContador, pulsoVivo } from './monitor/contadorCrudo'
import type { PulsoVivoElegido } from './monitor/contadorCrudo'
import { construirCascada } from './monitor/cascadaTurno'
import { horaPlanta } from './monitor/horaPlanta'
import { CascadaTurnoCard } from './monitor/CascadaTurnoCard'
import { mediaMovil, ritmoAhoraCpm, ritmoAhoraAndando, repartoAhoraAndando, estadoRitmo, fraccionDeRegla, pedidoAndando, pedidoFueraDeAlcance, PASO_MIN, type TramoSerie } from '@/services/shoplogix/monitorRitmo'
import { pinShiftEnd, unpinShiftEnd, setMonitorSetPoint, setShiftQuota, setPesoPromedio, eliminarRegistroPeso } from '@/services/shoplogix/pinShiftEnd'
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
import { estadoDelLink } from '@/services/shoplogix/estadoDelLink'
import { convenioFaltante } from '@/services/shoplogix/convenioFaltante'
import { ventanaDelTurno } from '@/services/shoplogix/ventanaDelTurno'
import { frescuraDelRitmo, MIN_PARA_VIEJO } from '@/services/shoplogix/datosAlDia'
import { horaDeLaCuota } from '@/services/shoplogix/horaDeLaCuota'
import { horaMasFloja, type ParadaConHora } from '@/services/shoplogix/horaMasFloja'
import { objetivoDelTurno, type OrigenObjetivo } from '@/services/shoplogix/objetivoDelTurno'
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
import { Button } from '@/components/ui/button'
import { ReAuthConfirmDialog } from '@/components/admin/ReAuthConfirmDialog'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { ritmoAndandoDeLinea } from '@/services/shoplogix/ritmoAndandoDeLinea'
import { piezasDeToneladas, toneladasDePiezas, toneladasPorTramos } from '@/services/shoplogix/cuotaEnToneladas'
import { ritmoPorMaquina, nombreCorto, type RitmosPorMaquina } from '@/services/shoplogix/ritmoPorMaquina'
import { classifyLossState } from '@/services/shoplogix/lossBuckets'

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
        {unit && <span className="text-footnote text-muted-foreground/80">{unit}</span>}
      </div>
      {/* A todo el ancho, bajo el número: con días y bordes rotulados el spark
          dejó de ser miniatura y necesita la fila completa. */}
      {spark}
      {hint && <div className="mt-0.5 text-caption text-muted-foreground/80">{hint}</div>}
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
function Chispa({ turnos, hoy, banda, escala, mediana, muestras }: {
  turnos: Array<{ dateKey: string; ritmo: number }>
  hoy: number
  banda: { min: number; max: number }
  /**
   * Escala vertical FIJA: peor y mejor de TODOS los turnos de la historia
   * corta (no solo los dibujados). Sin ella la escala se recalculaba con los
   * datos de cada día y la misma variación se veía dramática un día y plana
   * al siguiente — era la mitad de por qué el gráfico «estaba muerto».
   */
  escala?: { min: number; max: number } | null
  /** La mediana de la ventana: «lo normal» pasa de texto a POSICIÓN. */
  mediana?: number | null
  /** De cuántos turnos sale la mediana, para rotularla honesta. */
  muestras?: number | null
}) {
  const todos = [...turnos.map((t) => t.ritmo), hoy, banda.min, banda.max]
  const lo = Math.min(...todos, ...(escala ? [escala.min] : []))
  const hi = Math.max(...todos, ...(escala ? [escala.max] : []))
  const span = hi - lo || 1
  // En % del alto, con aire arriba (para la anotación del mejor) y abajo.
  const yPct = (v: number) => 88 - ((v - lo) / span) * 72
  const puntos = [...turnos.map((t) => t.ritmo), hoy]
  const xPct = (i: number) => (i / Math.max(1, puntos.length - 1)) * 100
  /* El mejor de los DIBUJADOS. Hoy no compite (suele ser parcial) — pero si
     hoy ya lo supera, la anotación mentiría y no se muestra. */
  const iMejorCandidato = turnos.length >= 2
    ? turnos.reduce((mi, t, i) => (t.ritmo > turnos[mi]!.ritmo ? i : mi), 0)
    : null
  const iMejor = iMejorCandidato != null && turnos[iMejorCandidato]!.ritmo >= hoy
    ? iMejorCandidato
    : null
  const esDomingo = (dateKey: string) => new Date(`${dateKey}T12:00:00Z`).getUTCDay() === 0
  return (
    <div className="mt-1.5" aria-hidden>
      <div className="flex items-stretch gap-1.5">
        <div className="relative h-[88px] min-w-0 flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
            <rect
              x="0"
              y={yPct(banda.max)}
              width="100"
              height={Math.max(3, yPct(banda.min) - yPct(banda.max))}
              className="fill-muted-foreground/15"
            />
            {/* Lo normal como LÍNEA: hasta ahora la mediana vivía solo en el
                texto del detalle y el gráfico no decía dónde queda. */}
            {mediana != null && (
              <line
                x1="0" y1={yPct(mediana)} x2="100" y2={yPct(mediana)}
                stroke="var(--mon-ref)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            )}
            <polyline
              points={puntos.map((v, i) => `${xPct(i)},${yPct(v)}`).join(' ')}
              fill="none"
              strokeWidth="1.5"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-muted-foreground/70"
            />
          </svg>
          {/* Los puntos en HTML: un círculo dentro del SVG estirado sale elipse.
              El domingo va HUECO — la línea no trabaja igual y su punto bajo
              arrastraba la lectura de la semana. */}
          {puntos.map((v, i) => {
            const esHoy = i === puntos.length - 1
            const domingo = !esHoy && esDomingo(turnos[i]!.dateKey)
            return (
              <span
                key={i}
                title={`${esHoy ? 'hoy' : nombreDeDia(turnos[i]!.dateKey)} · ${fmtDec(v)} pz/min`}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  esHoy ? 'h-2.5 w-2.5' : domingo ? 'h-2 w-2 border-2' : 'h-1.5 w-1.5'
                }`}
                style={{
                  left: `${xPct(i)}%`,
                  top: `${yPct(v)}%`,
                  ...(esHoy
                    ? {
                        background: 'var(--mon-hoy)',
                        boxShadow: '0 0 0 2px rgb(var(--card)), 0 0 0 5px color-mix(in srgb, var(--mon-hoy) 40%, transparent)',
                      }
                    : domingo
                      ? { borderColor: 'var(--mon-ref)', background: 'transparent' }
                      : { background: 'var(--mon-ref)' }),
                }}
              />
            )
          })}
          {/* El mejor de la ventana, anotado: es la referencia que uno busca
              («¿cuándo fue el bueno?») sin abrir ningún tooltip. */}
          {iMejor != null && (
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
              style={{
                left: `${Math.min(80, Math.max(20, xPct(iMejor)))}%`,
                top: `${yPct(turnos[iMejor]!.ritmo)}%`,
                transform: 'translate(-50%, -170%)',
              }}
            >
              mejor de estos {turnos.length + 1}
            </span>
          )}
        </div>
        {/* El eje, rotulado: bordes de la banda y la mediana en su color. */}
        <div className="relative w-9 shrink-0 text-caption tabular-nums text-muted-foreground/80">
          <span className="absolute -translate-y-1/2" style={{ top: `${yPct(banda.max)}%` }}>
            {fmtDec(banda.max)}
          </span>
          {mediana != null && Math.abs(yPct(mediana) - yPct(banda.max)) > 12 && Math.abs(yPct(mediana) - yPct(banda.min)) > 12 && (
            <span className="absolute -translate-y-1/2" style={{ top: `${yPct(mediana)}%`, color: 'var(--mon-ref)' }}>
              {fmtDec(mediana)}
            </span>
          )}
          <span className="absolute -translate-y-1/2" style={{ top: `${yPct(banda.min)}%` }}>
            {fmtDec(banda.min)}
          </span>
        </div>
      </div>
      {/* El valor BAJO cada día: la tabla-gemela del gráfico, sin tooltips.
          Los puntos sin número eran la otra mitad del «gráfico muerto». */}
      <div className="mr-9 mt-1 flex justify-between text-center">
        {turnos.map((t) => (
          <span key={t.dateKey} className="min-w-0">
            <span className="block text-caption tabular-nums text-foreground/80">{fmtDec(t.ritmo)}</span>
            <span className="block text-[10px] text-muted-foreground/80">{diaCorto(t.dateKey)}</span>
          </span>
        ))}
        <span className="min-w-0">
          <span className="block text-caption font-semibold tabular-nums" style={{ color: 'var(--mon-hoy)' }}>
            {fmtDec(hoy)}
          </span>
          <span className="block text-[10px] font-semibold" style={{ color: 'var(--mon-hoy)' }}>hoy</span>
        </span>
      </div>
      {muestras != null && mediana != null && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
          La línea horizontal es la mediana de los últimos {muestras} turnos ({fmtDec(mediana)});
          la banda gris, el rango habitual. Punto hueco = domingo.
        </p>
      )}
    </div>
  )
}

/**
 * Editor inline del set point, calcado del «Cambiar» del cierre: visible solo
 * con sesión de supervisor. Pide el MÉTODO además del número — un set point
 * sin cómo se midió es el hardcodeo de vuelta, con otra ropa.
 */
/**
 * La cuota del turno, editable en el monitor.
 *
 * Pedido de Orel: la cuota cambia —15.000 un turno, otra cosa el siguiente— y
 * hasta ahora había que entrar a la configuración del módulo para moverla,
 * mientras la pantalla que la usa está a la vista de producción.
 *
 * Solo se ve con sesión de admin y en el turno en curso; el que abre el link
 * sigue viendo el monitor de solo lectura.
 */
/**
 * El peso promedio del pescado, editable con el turno corriendo.
 *
 * Es el dato que convierte piezas en toneladas. Cambia con el calibre del día
 * y por eso se carga a mano: Shoplogix no manda kilos y el peso real llega
 * después, por el Excel del Grader.
 */
function EditorPeso({ actual, onGuardar }: {
  actual: number | null
  onGuardar: (pesoKg: number | null) => Promise<void>
}) {
  const [abierto, setAbierto] = useState(false)
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  if (!abierto) {
    return (
      <button
        type="button"
        /* En GRAMOS (Orel, 29-08): en planta el calibre se habla en gramos
           («5.200») y tipearlo así es más rápido que «5,2». El storage sigue
           en kg — solo la entrada y la lectura van en g. */
        onClick={() => { setValor(actual != null ? String(Math.round(actual * 1000)) : ''); setAbierto(true); setError(null) }}
        className="tap-44 ml-1 rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
      >
        {actual != null ? 'Cambiar peso' : 'Poner peso promedio'}
      </button>
    )
  }

  const guardar = async (gramos: number | null) => {
    setGuardando(true)
    setError(null)
    try {
      if (gramos != null && !(gramos >= 500 && gramos <= 25_000)) {
        throw new Error('El peso promedio va en gramos: entre 500 y 25.000 g por pieza.')
      }
      await onGuardar(gramos != null ? gramos / 1000 : null)
      setAbierto(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1">
      <input
        type="number" min={500} max={25000} step={50} inputMode="numeric"
        value={valor} onChange={(e) => setValor(e.target.value)}
        placeholder="gramos por pieza"
        className="h-7 w-28 rounded-ctl border border-border bg-background px-2 text-[12px] tabular-nums"
      />
      <button
        type="button" disabled={guardando} onClick={() => guardar(Number(valor))}
        className="tap-44 rounded-ctl border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      {/* Quitar el peso del turno (Orel, 29-08): un dedo de más no puede
          quedar pegado en las toneladas. */}
      {actual != null && (
        <button
          type="button" disabled={guardando} onClick={() => guardar(null)}
          className="tap-44 rounded-ctl px-2 py-0.5 text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground disabled:opacity-50"
        >
          quitar peso
        </button>
      )}
      <button
        type="button" onClick={() => setAbierto(false)}
        className="tap-44 rounded-ctl px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        cancelar
      </button>
      {error && <span className="w-full text-[11px] text-ink-crit">{error}</span>}
    </span>
  )
}

/**
 * Cuenta atrás hasta la próxima lectura del pulso (pedido de Orel, 29-08:
 * «que el usuario sepa que se actualiza en 1 min»).
 *
 * ── Por qué el anterior murió y este no ────────────────────────────────────
 * Hubo un cronómetro así y se quitó: suponía un ciclo fijo y prometía «en
 * 1:39» al lado de un «dato nuevo en 9s» — dos promesas exactas que no se
 * cumplían. Este cuenta desde la ÚLTIMA lectura real (el scheduler corre
 * cada minuto), siempre con «~», y si el dato se atrasa dice «llegando…»
 * en vez de contar negativos. Una estimación humilde que se cumple casi
 * siempre le gana a una promesa exacta que falla a veces.
 */
function CuentaAtrasPulso({ at }: { at: string | null | undefined }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (!at) return null
  const target = Date.parse(at) + 65_000
  if (Number.isNaN(target)) return null
  const restante = Math.ceil((target - Date.now()) / 1000)
  /* Muy atrasado (>2 min): la frescura vieja ya la anuncia otro elemento —
     este contador se calla en vez de decir «llegando…» para siempre. */
  if (restante < -55) return null
  return (
    <span className="tabular-nums text-muted-foreground/70">
      {restante > 0 ? `· se refresca en ~${restante} s` : '· llegando…'}
    </span>
  )
}

/* ══ Los instrumentos de «Para llegar a la meta» (rediseño B, mockup 26-08) ══
   Las reglas de honestidad pasan de texto a GEOMETRÍA: lo que no se puede
   afirmar no se dibuja. En «Arrancando» faltan la marca del necesario y la
   banda del cierre (son proyecciones); un necesario que supera el techo se
   SALE del riel y se dice con palabras — dibujarlo al borde fingiría que casi
   se llega.
   ⚠ El riel NO usa bg-muted: en oscuro --muted y --card son casi el mismo
   tono y el riel desaparece (se vio al renderizar el mockup, no al leerlo). */

const PISTA_INSTRUMENTO = 'color-mix(in srgb, rgb(var(--muted-foreground)) 20%, transparent)'

/** El metro de piezas: 0 → meta, con el cierre proyectado como banda. */
function MetroPiezas({ ahora, meta, banda, etiquetaBanda }: {
  ahora: number
  meta: number
  /** Cierre proyectado entre los dos horizontes. null = sin proyección. */
  banda: { min: number; max: number } | null
  etiquetaBanda: string | null
}) {
  const escala = Math.max(meta, banda?.max ?? 0, ahora) * 1.04
  if (!(escala > 0)) return null
  const pct = (v: number) => Math.max(0, Math.min(100, (v / escala) * 100))
  const labX = banda ? Math.max(16, Math.min(84, (pct(banda.min) + pct(banda.max)) / 2)) : null
  return (
    <div className="relative w-full">
      <div className="relative mb-0.5 h-[15px] text-[11px] leading-[15px] tabular-nums">
        <span className="absolute left-0 whitespace-nowrap font-semibold" style={{ color: 'var(--mon-hoy)' }}>
          {fmtInt(ahora)} ahora
        </span>
        {banda && etiquetaBanda && (
          <span
            className="absolute -translate-x-1/2 whitespace-nowrap font-semibold text-foreground"
            style={{ left: `${labX}%` }}
          >
            {etiquetaBanda}
          </span>
        )}
      </div>
      <div className="relative h-3 rounded-full" style={{ background: PISTA_INSTRUMENTO }}>
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct(ahora)}%`, minWidth: 3, background: 'var(--mon-hoy)' }}
        />
        {banda && (
          <span
            className="absolute inset-y-0"
            title={`Cierre proyectado: ${fmtInt(banda.min)}–${fmtInt(banda.max)} pz`}
            style={{
              left: `${pct(banda.min)}%`,
              width: `${Math.max(1.2, pct(banda.max) - pct(banda.min))}%`,
              background: 'color-mix(in srgb, var(--mon-cuota) 42%, transparent)',
              borderLeft: '2px solid var(--mon-cuota)',
              borderRight: '2px solid var(--mon-cuota)',
            }}
          />
        )}
        <span
          className="absolute -bottom-[3px] -top-[3px] w-0.5 rounded-[1px] bg-foreground"
          style={{ left: `calc(${pct(meta)}% - 1px)` }}
          title={`Meta: ${fmtInt(meta)} pz`}
        />
      </div>
      <div className="relative mt-0.5 h-[15px] text-[11px] leading-[15px] tabular-nums text-muted-foreground">
        <span className="absolute right-0">meta {fmtInt(meta)}</span>
      </div>
    </div>
  )
}

/** El riel de ritmo: vas a · lo normal · necesitás · techo, sobre una escala. */
function RielRitmo({ vasA, normal, necesitas, techo }: {
  vasA: number | null
  normal: number | null
  /** null = sin proyección (arrancando) · 'fuera' = supera el techo, no se dibuja. */
  necesitas: number | 'fuera' | null
  techo: number | null
}) {
  const mayor = Math.max(vasA ?? 0, normal ?? 0, typeof necesitas === 'number' ? necesitas : 0, techo ?? 0)
  if (!(mayor > 0)) return null
  /* El techo cae al 93,7% y el 6,3% final es la zona rayada: lo de más allá
     del techo no es una meta, es territorio que la línea nunca pisó. */
  const escala = techo != null && techo > 0 ? techo / 0.937 : mayor * 1.07
  const pct = (v: number) => Math.max(0, Math.min(100, (v / escala) * 100))
  const nx = typeof necesitas === 'number' ? Math.max(14, Math.min(86, pct(necesitas))) : null
  return (
    <div className="relative w-full">
      <div className="relative mb-0.5 h-[15px] text-[11px] leading-[15px] tabular-nums">
        {vasA != null && (
          <span className="absolute left-0 whitespace-nowrap font-semibold" style={{ color: 'var(--mon-hoy)' }}>
            vas a {fmtDec(vasA)}
          </span>
        )}
        {typeof necesitas === 'number' && nx != null && (
          <span className="absolute -translate-x-1/2 whitespace-nowrap font-semibold text-foreground" style={{ left: `${nx}%` }}>
            necesitás {fmtDec(necesitas)}
          </span>
        )}
        {necesitas === 'fuera' && (
          <span className="absolute right-0 whitespace-nowrap font-semibold text-ink-warn">
            necesitás fuera de escala →
          </span>
        )}
      </div>
      <div className="relative h-2.5 rounded-full" style={{ background: PISTA_INSTRUMENTO }}>
        {vasA != null && (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${Math.max(1, pct(vasA))}%`, background: 'var(--mon-hoy)' }}
          />
        )}
        {techo != null && techo > 0 && (
          <span
            className="absolute inset-y-0 right-0 rounded-r-full"
            style={{
              width: '6.3%',
              background: 'repeating-linear-gradient(135deg, color-mix(in srgb, rgb(var(--muted-foreground)) 45%, transparent) 0 1.5px, transparent 1.5px 5px)',
            }}
          />
        )}
        {normal != null && normal > 0 && (
          <span
            className="absolute -bottom-0.5 -top-0.5 w-px"
            style={{ left: `${pct(normal)}%`, background: 'var(--mon-ref)' }}
            title={`Lo normal de la línea: ${fmtDec(normal)} pz/min andando`}
          />
        )}
        {typeof necesitas === 'number' && (
          <span
            className="absolute -bottom-1 -top-1 w-[3px] rounded-[2px]"
            style={{ left: `calc(${pct(necesitas)}% - 1.5px)`, background: 'var(--mon-cuota)' }}
            title={`Para la meta: ${fmtDec(necesitas)} pz/min andando`}
          />
        )}
        {techo != null && techo > 0 && (
          <span
            className="absolute -bottom-1 -top-1 w-0.5"
            style={{ left: 'calc(93.7% - 1px)', background: 'var(--mon-ref)' }}
            title={`Techo demostrado: ${fmtDec(techo)} pz/min andando`}
          />
        )}
      </div>
      <div className="relative mt-0.5 h-[15px] text-[11px] leading-[15px] tabular-nums text-muted-foreground">
        {/* Con lo normal en la mitad derecha, la etiqueta centrada se PISABA
            con «techo» (visto en vivo: «lo normal 32,eCho 43,1»). Pasada la
            mitad, el texto termina EN su marca en vez de cruzarla. */}
        {normal != null && normal > 0 && (pct(normal) > 55 ? (
          <span className="absolute -translate-x-full whitespace-nowrap pr-1" style={{ left: `${Math.min(72, pct(normal))}%` }}>
            lo normal {fmtDec(normal)}
          </span>
        ) : (
          <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${Math.max(14, pct(normal))}%` }}>
            lo normal {fmtDec(normal)}
          </span>
        ))}
        {techo != null && techo > 0 && (
          <span className="absolute right-0 whitespace-nowrap">techo {fmtDec(techo)}</span>
        )}
      </div>
    </div>
  )
}

/** Una celda de la fila de estadísticas del instrumento. */
function CeldaStat({ k, v, sub, delta }: { k: string; v: string; sub?: string; delta?: number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className="text-[15px] tabular-nums text-foreground">
        {v}
        {sub && <span className="text-[11px] text-muted-foreground"> {sub}</span>}
        {delta != null && (
          <span className={`text-[11px] tabular-nums ${delta >= 0 ? 'text-ink-ok' : 'text-ink-warn'}`}>
            {' '}{delta >= 0 ? '+' : '−'}{fmtInt(Math.abs(delta))}
          </span>
        )}
      </div>
    </div>
  )
}

function EditorCuota({ actual, pesoConocido, onGuardar, conToneladas = true }: {
  actual: number | null
  /** Peso promedio ya cargado para el turno: se PRELLENA en el modo toneladas.
      Sin esto, «Guardar» quedaba gris pidiendo un dato que la pantalla ya
      tenía — y nadie decía por qué (lo cazó Orel con el turno noche vivo). */
  pesoConocido?: number | null
  onGuardar: (piezas: number | null, origen?: { toneladas: number; pesoPromedioKg: number } | null) => Promise<void>
  /** false en Filete: ahí no se trabaja en toneladas, la cuota va directo en
      piezas y no se pide peso promedio (Orel, 27-08). */
  conToneladas?: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  /* Producción pide TONELADAS, así que ese es el modo por defecto: las piezas
     salen del peso promedio del pescado y cambian turno a turno. */
  const [modo, setModo] = useState<'toneladas' | 'piezas'>(conToneladas ? 'toneladas' : 'piezas')
  const [valor, setValor] = useState('')
  const [toneladas, setToneladas] = useState('')
  /* En GRAMOS por pieza (Orel, 29-08): el calibre se habla en gramos. Solo
     esta caja — el storage y la conversión siguen en kg. */
  const [pesoG, setPesoG] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const convertida = (() => {
    const t = Number(toneladas)
    const kg = Number(pesoG) / 1000
    if (!(t > 0) || !(kg > 0)) return null
    try { return piezasDeToneladas(t, kg) } catch { return null }
  })()

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => {
          setValor(actual != null ? String(actual) : '')
          if (pesoConocido != null && pesoConocido > 0) setPesoG(String(Math.round(pesoConocido * 1000)))
          setAbierto(true)
          setError(null)
        }}
        className="tap-44 ml-1 rounded-full border border-border px-2 py-0.5 text-[10px] normal-case tracking-normal hover:bg-muted"
      >
        {actual != null ? 'Cambiar cuota' : 'Poner cuota'}
      </button>
    )
  }

  const guardar = async (
    piezas: number | null,
    origen?: { toneladas: number; pesoPromedioKg: number } | null,
  ) => {
    setGuardando(true)
    setError(null)
    try {
      await onGuardar(piezas, origen)
      setAbierto(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <span className="ml-1 inline-flex flex-wrap items-center gap-1 normal-case tracking-normal">
      {conToneladas && (
      <span className="inline-flex overflow-hidden rounded-ctl border border-border">
        {(['toneladas', 'piezas'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setModo(m)}
            className={`tap-44 px-2 py-0.5 text-[11px] ${modo === m ? 'bg-primary/[0.15] font-medium text-foreground' : 'text-muted-foreground'}`}
          >
            {m === 'toneladas' ? 'toneladas' : 'piezas'}
          </button>
        ))}
      </span>
      )}
      {modo === 'toneladas' ? (
        <>
          <input
            type="number" min={0.1} step={0.5} inputMode="decimal"
            value={toneladas} onChange={(e) => setToneladas(e.target.value)}
            placeholder="toneladas"
            className="h-7 w-24 rounded-ctl border border-border bg-background px-2 text-[12px] tabular-nums"
          />
          <input
            type="number" min={500} max={25000} step={50} inputMode="numeric"
            value={pesoG} onChange={(e) => setPesoG(e.target.value)}
            placeholder="gramos por pieza"
            className="h-7 w-28 rounded-ctl border border-border bg-background px-2 text-[12px] tabular-nums"
          />
          {/* Las piezas, a la vista, ANTES de guardar: es el número contra el
              que va a medir el monitor toda la noche. */}
          {convertida && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              = <b className="text-foreground">{fmtInt(convertida.piezas)} pz</b>
            </span>
          )}
        </>
      ) : (
        <input
          type="number" min={1} step={100} inputMode="numeric"
          value={valor} onChange={(e) => setValor(e.target.value)}
          placeholder="piezas del turno"
          className="h-7 w-28 rounded-ctl border border-border bg-background px-2 text-[12px] tabular-nums"
        />
      )}
      <button
        type="button"
        /* En piezas también se valida: Number('') es 0 y guardaba una cuota
           de cero sin que nadie la escribiera. */
        disabled={guardando || (modo === 'toneladas' ? !convertida : !(Number(valor) > 0))}
        onClick={() => modo === 'toneladas'
          ? guardar(convertida!.piezas, { toneladas: Number(toneladas), pesoPromedioKg: Number(pesoG) / 1000 })
          : guardar(Number(valor), null)}
        className="tap-44 rounded-ctl border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
      >
        {guardando ? 'Guardando…' : 'Guardar'}
      </button>
      {/* El PORQUÉ del botón gris, escrito: «no deja cambiar» era esto. */}
      {modo === 'toneladas' && !convertida && !guardando && (
        <span className="w-full text-[11px] text-muted-foreground">
          Para guardar en toneladas falta{!(Number(toneladas) > 0) ? ' cuántas toneladas' : ''}
          {!(Number(toneladas) > 0) && !(Number(pesoG) > 0) ? ' y' : ''}
          {!(Number(pesoG) > 0) ? ' los gramos por pieza (peso promedio del calibre)' : ''}
          {' '}— o cambiá a «piezas».
        </span>
      )}
      {actual != null && (
        <button
          type="button"
          disabled={guardando}
          onClick={() => guardar(null, null)}
          className="tap-44 rounded-ctl px-2 py-0.5 text-[11px] text-muted-foreground underline decoration-dotted hover:text-foreground disabled:opacity-50"
          title="Vuelve al objetivo que publica Shoplogix"
        >
          usar el del sensor
        </button>
      )}
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="tap-44 rounded-ctl px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        cancelar
      </button>
      {error && <span className="w-full text-[11px] text-ink-crit">{error}</span>}
    </span>
  )
}

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
  requiredPerMinute, medianCpm, medianSamples, setCpm, fuenteSetPoint, onGuardarSetPoint, ventana, onVentana,
  cierreMs,
}: {
  /**
   * Cierre PROGRAMADO del turno, en wall-clock-as-UTC ms. Dibuja la vertical
   * de término y tinta la hora extra: sin la marca, la serie «se acaba» y no
   * se sabe si terminó el turno o dejó de llegar el dato (Orel, 26-08).
   */
  cierreMs?: number | null
  /** Ventana visible compartida con el comparador (minutos de turno). */
  ventana?: Ventana | null
  onVentana?: (v: Ventana | null) => void
  /** Ritmo de la última media hora, para la cabecera. */
  /** Ritmo que la meta exige ahora mismo, si hay meta. */
  requiredPerMinute?: number | null
  /** Mediana de los turnos anteriores, en pz/min de reloj. */
  medianCpm?: number | null
  /** Cuántos turnos hay detrás de esa mediana: va en el rótulo. */
  medianSamples?: number | null
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
    /* Decía "promedio de turno" y es la MEDIANA DE LOS TURNOS ANTERIORES: el
       26-08 marcaba 26,8 mientras el turno de hoy promediaba 37,2. Quien mira
       la línea gris creía estar viendo su propio turno. */
    {
      cpm: medianCpm ?? 0,
      label: medianSamples ? `mediana de ${medianSamples} turnos` : 'mediana de turnos anteriores',
      clase: 'stroke-muted-foreground/60',
    },
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
   * ── El término del turno ─────────────────────────────────────────────────
   * Una sola vertical (el cierre PROGRAMADO) y una zona tintada para lo que se
   * trabajó después. Si el último dato cae claramente ANTES del cierre no hay
   * zona: en su lugar se dice «sin datos después de las X».
   *
   * ⚠ La etiqueta va en HTML dentro del div zoomeado, posicionada en % del
   * ancho total — como <text> del SVG estirado se deforma con el zoom, y fuera
   * del div zoomeado se despega de su línea al panear (la misma lección que ya
   * obligó a sacar los puntos de la Chispa fuera del SVG).
   */
  const finDatosMs = fin > 0 ? tiempos[fin - 1]! + paso : null
  const cierre = (() => {
    if (cierreMs == null || tiempos.length === 0) return null
    const t0 = tiempos[0]!
    const tFin = tiempos[tiempos.length - 1]! + paso
    if (cierreMs <= t0 || cierreMs > tFin) return null
    const x = xDe(cierreMs)
    const extraW = finDatosMs != null && finDatosMs > cierreMs + 60_000
      ? Math.max(0, xDe(finDatosMs) - x)
      : 0
    return { x, extraW }
  })()
  const sinDatosDespues = cierreMs != null && finDatosMs != null && finDatosMs < cierreMs - 10 * 60_000
    ? horaPlanta(finDatosMs)
    : null

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
          <span className="normal-case tracking-normal text-muted-foreground/80"> · tramos de 5 min</span>
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

      <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground/80">pz/min</div>

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
              className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground/80"
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
      {/* `relative`: la etiqueta del cierre se ancla a ESTE div (el zoomeado)
          para viajar con el gráfico al acercar y panear. */}
      <div className="relative" style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
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

        {/* La hora extra, tintada: relleno grande → tinte bajo (§1.4). */}
        {cierre != null && cierre.extraW > 0 && (
          <rect x={cierre.x} y={0} width={cierre.extraW} height={H} className="fill-ink-warn/10" />
        )}

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

        {/* La vertical del cierre programado, encima de las barras. */}
        {cierre != null && (
          <line x1={cierre.x} x2={cierre.x} y1={0} y2={H}
                className="stroke-foreground/55" strokeWidth={1}
                strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
        )}

        {/* El tramo bajo el cursor, marcado sobre las barras. */}
        {foco != null && (
          <rect x={foco * stepX} y={0} width={bw} height={H} className="fill-foreground/30" />
        )}
      </svg>

      {/* La etiqueta del cierre, en HTML dentro del div zoomeado (ver nota). */}
      {cierre != null && cierreMs != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
          style={{ left: `${cierre.x}%`, transform: 'translateX(-100%)' }}
          aria-hidden
        >
          <span className="bg-card px-1">cierre {horaPlanta(cierreMs)}</span>
        </div>
      )}

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
              className="absolute top-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground/80"
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
          <span className="text-muted-foreground/80">
            Pasá el dedo o el mouse por el gráfico para ver el detalle de cada tramo.
          </span>
        )}
      </div>

      {/* Qué se dibuja, y cómo se acerca. Los botones 1×/2×/4×/8× se fueron:
          el gesto es pellizcar o rodar la rueda, y arrastrar para moverse. Lo
          que NO puede faltar es la salida — un zoom sin "ver todo" visible es
          peor que ninguno, porque quien se pierde no sabe volver. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/80">
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
          <span className="ml-auto text-[10px] text-muted-foreground/80">
            pellizcá o rodá para acercar
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
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
          tramos de 5 min <span className="text-muted-foreground/80">(el dato crudo)</span>
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
            eje hasta él aplastaba el turno entero contra el piso.
            OJO: sobre 2× la escala ni se dice: a 8 min del cierre la leyenda
            anunciaba «necesitás 598,4 pz/min» — cierto e inútil, se lee como
            pantalla rota (mismo criterio que la tarjeta de la meta). */}
        {refsFuera.map((r) => (
          <span key={r.label} className="inline-flex items-center gap-1">
            {r.cpm > escala * 2 && r.label === 'necesitás' ? (
              <>necesitás <span className="text-muted-foreground/70">más de lo que la línea puede — ya no da el tiempo</span></>
            ) : (
              <>
                {r.label} <span className="tabular-nums">{fmtDec(r.cpm)}</span> pz/min
                <span className="text-muted-foreground/50">(fuera del gráfico)</span>
              </>
            )}
          </span>
        ))}
        {convenio.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/15" />
            parada de convenio
          </span>
        )}
        {cierre != null && cierreMs != null && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-0.5 bg-foreground/55" />
            cierre programado <span className="tabular-nums">{horaPlanta(cierreMs)}</span>
          </span>
        )}
        {cierre != null && cierre.extraW > 0 && (
          <span className="inline-flex items-center gap-1">
            {/* Cuadrado sin radio: es la muestra de la ZONA tintada del SVG,
                que también es cuadrada (y el ratchet de la piel no admite
                radios nuevos fuera de escala). */}
            <span className="inline-block h-2.5 w-2.5 bg-ink-warn/25" />
            hora extra
          </span>
        )}
        {sinDatosDespues && (
          <span>sin datos después de las <span className="tabular-nums">{sinDatosDespues}</span></span>
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
    <div className="mt-0.5 text-[11px] text-muted-foreground/80">
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
          <p className="basis-full text-[10px] text-muted-foreground/80">
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
  pace, cierre, muestras, fuente, plantSlug, shiftName, startAt, historial, horizonte, vsAyer, minAndando,
  llenado, onGuardarCuota, origenObjetivo, turnosObjetivo, detenida, sinDatosHaceMin,
}: {
  pace: PaceToTarget | null
  /** Hace cuánto que la línea no produce, si está parada ahora mismo. */
  detenida?: string | null
  /** Minutos sin un tramo nuevo: la cuenta de hora extra sale de datos viejos. */
  sinDatosHaceMin?: number | null
  /** De dónde salió la vara cuando no hay cuota: ver `objetivoDelTurno`. */
  origenObjetivo?: OrigenObjetivo | null
  /** Cuántos turnos cerrados respaldan esa mediana. */
  turnosObjetivo?: number | null
  /** Fijar la cuota del turno desde acá. Solo llega con sesión de admin. */
  onGuardarCuota?: (piezas: number | null) => Promise<void>
  historial: { medianCpm: number | null; bestCpm: number | null; muestras: number | null } | null
  /**
   * El otro horizonte: hasta dónde llega el pronóstico y con qué cierre. Sin
   * esto, la respuesta a "¿llegamos?" quedaba partida entre esta tarjeta (que
   * mide hasta el horario) y el bloque del pronóstico, tres tarjetas abajo.
   */
  horizonte?: { hasta: string; estimate: number | null; mapePct: number | null; explicacion?: string | null } | null
  /** El día anterior a la MISMA altura de turno, y la diferencia con hoy. */
  vsAyer?: { label: string; pieces: number; diff: number } | null
  /** Minutos ANDANDO del turno: bajo 30 no se proyecta (rampa de partida). */
  minAndando?: number | null
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
   * OJO — Turno ARRANCANDO: con menos de 30 min andando, «al ritmo de ahora»
   * extrapola la rampa de partida. La noche del 26-08, con 8 min de datos, la
   * tarjeta anunciaba «cierra en 1.327 pz (9% de la meta)» y pedía 90 pz/min
   * (2,1× el mejor turno) — cifras que no sobreviven a la primera hora. Hasta
   * la media hora andando: la meta, cuánto falta, y la comparación contra el
   * turno anterior a la MISMA altura — esa sí usa historia y vale desde el
   * minuto uno.
   */
  if (minAndando != null && minAndando < 30) {
    return (
      <div className="mt-2 rounded-ctl border border-border bg-muted px-3 py-2">
        <p className="text-[15px] font-semibold text-foreground">
          Arrancando · <span className="tabular-nums">{fmtInt(minAndando)} min</span> andando
        </p>
        {/* El mismo metro del estado normal, SIN banda de proyección: el avance
            contra la meta es un hecho desde el minuto uno; el cierre estimado
            no, y por eso acá no se dibuja. */}
        <div className="mt-1.5">
          <MetroPiezas
            ahora={Math.max(0, pace.targetPieces - pace.remainingPieces)}
            meta={pace.targetPieces}
            banda={null}
            etiquetaBanda={null}
          />
        </div>
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Faltan <span className="tabular-nums text-foreground/90">{fmtInt(pace.remainingPieces)} pz</span>{' '}
          para {pace.targetSource === 'cuota' ? 'la meta' : 'lo esperado'}. El ritmo necesario y el
          cierre proyectado aparecen a la media hora de marcha — proyectar la rampa de partida
          asusta sin informar.
        </p>
        {vsAyer && (
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {vsAyer.label} a esta altura llevaba{' '}
            <span className="tabular-nums text-foreground/90">{fmtInt(vsAyer.pieces)} pz</span>{' '}
            <span className={vsAyer.diff >= 0 ? 'text-ink-ok' : 'text-ink-warn'}>
              ({vsAyer.diff >= 0 ? '+' : '−'}{fmtInt(Math.abs(vsAyer.diff))})
            </span>
            {' '}— esa comparación sí vale desde el arranque.
          </p>
        )}
      </div>
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
        {/* OJO: es el ritmo del TURNO andando, no el de ahora. Decía «al ritmo
            de ahora (36,3)» con la línea detenida hacía 17 minutos y el mismo
            monitor mostrando 0,0 pz/min tres bloques abajo — dos verdades
            contradictorias en una pantalla. */}
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Al ritmo del turno ({fmtDec(pace.currentPerHour / 60)} pz/min andando) son unos{' '}
          <span className="tabular-nums text-foreground/90">
            {fmtDurationSec((pace.extraMinutesNeeded ?? 0) * 60)}
          </span>{' '}
          más.
        </p>
        {/* Y si la línea NO está andando, la cuenta de arriba es hipotética:
            proyectar horas extra sobre una línea parada manda a esperar algo
            que no está pasando. */}
        {detenida && (
          <p className="mt-0.5 text-[12px] text-ink-crit">
            Pero la línea no está produciendo {detenida}: esa cuenta supone que
            vuelve a arrancar.
          </p>
        )}
        {/* Y el otro caso, que es el que más se da pasado el horario: no es que
            la línea esté parada, es que no llega dato. Proyectar tres horas de
            trabajo sobre información de hace hora y media no se sostiene. */}
        {!detenida && sinDatosHaceMin != null && sinDatosHaceMin >= MIN_PARA_VIEJO && (
          <p className="mt-0.5 text-[12px] text-ink-warn">
            Ojo: no llega dato nuevo hace{' '}
            <span className="tabular-nums">{Math.round(sinDatosHaceMin)} min</span>, así que esa
            cuenta sale del último ritmo conocido.
          </p>
        )}
        {/* También en hora extra: es cuando más se pregunta "¿por qué no va más
            rápido?", y la respuesta sigue siendo el llenado, no la velocidad. */}
        {llenado && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Con la máquina a{' '}
            <span className="tabular-nums text-foreground/90">{fmtCpm(llenado.spec.setCpm)} pz/min</span>{llenado.spec.setHz ? <span className="tabular-nums text-muted-foreground/80"> ({llenado.spec.setHz} Hz)</span> : null},
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

  /* ── Los números del instrumento (rediseño B) ── */
  const vasA = pace.currentPerHour > 0 ? pace.currentPerHour / 60 : null
  const techoRiel = historial?.bestCpm ?? (pace.maxPerHour != null ? pace.maxPerHour / 60 : null)
  const normalRiel = historial?.medianCpm ?? null
  /* Un necesario por encima del techo NO se dibuja: se sale del riel. */
  const necesitasRiel: number | 'fuera' | null = fuera
    ? 'fuera'
    : techoRiel != null && pace.requiredPerMinute > techoRiel
      ? 'fuera'
      : pace.requiredPerMinute > 0 ? pace.requiredPerMinute : null
  const producidas = Math.max(0, pace.targetPieces - pace.remainingPieces)
  const bandaCierre = (() => {
    const vals = [pace.projectedPieces, horizonte?.estimate]
      .filter((v): v is number => v != null && v > 0)
    if (vals.length === 0) return null
    return { min: Math.min(...vals), max: Math.max(...vals) }
  })()
  const etiquetaBanda = bandaCierre
    ? bandaCierre.max - bandaCierre.min < Math.max(60, bandaCierre.max * 0.03)
      ? `${fmtInt((bandaCierre.min + bandaCierre.max) / 2)} al cierre`
      : `${fmtInt(bandaCierre.min)}–${fmtInt(bandaCierre.max)} al cierre`
    : null
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
        <span className="normal-case tracking-normal text-muted-foreground/80">
          ({fmtInt(pace.targetPieces)} pz
          {/* De dónde sale la vara. Con el objetivo del sensor se dice sobre
              cuántos turnos se calculó: es una mediana de turnos cerrados, no
              el acumulado del turno en curso (que sube mientras el turno pasa
              — ver `objetivoDelTurno`). Sin historia se avisa que todavía se
              está completando, para que nadie lo lea como meta firme. */}
          {pace.targetSource === 'objetivo-sensor' && (
            origenObjetivo === 'historia'
              ? ` · Shoplogix, típico de ${turnosObjetivo} turnos`
              : ' · Shoplogix, aún completándose')})
        </span>
        {onGuardarCuota && (
          <EditorCuota
            actual={pace.targetSource === 'cuota' ? Math.round(pace.targetPieces) : null}
            onGuardar={onGuardarCuota}
          />
        )}
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
      {/* ── FILA 1 · el metro de piezas: cómo termina ── */}
      <div className="mt-3">
        <MetroPiezas
          ahora={producidas}
          meta={pace.targetPieces}
          banda={bandaCierre}
          etiquetaBanda={etiquetaBanda}
        />
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          {/* «rango entre los dos horizontes» solo cuando de verdad hay dos:
              sin historia suficiente el horizonte histórico viene null y la
              banda es un punto — decir «rango» ahí es prometer de más. */}
          {horizonte?.hasta ? (
            <>El cierre proyectado como <b className="text-foreground/80">rango entre los dos horizontes</b>:
              {cierre && <> hasta las <span className="tabular-nums">{fmtWallTime(cierre)}</span> del horario</>}
              {' '}y hasta las ≈<span className="tabular-nums">{horizonte.hasta}</span> que duran los turnos de esta línea.</>
          ) : (
            <>El cierre proyectado al ritmo del turno
              {cierre && <>, hasta las <span className="tabular-nums">{fmtWallTime(cierre)}</span> del horario</>}.</>
          )}
        </p>
      </div>

      {/* ── FILA 2 · el riel de ritmo: qué hace falta ── */}
      <div className="mt-3.5">
        <RielRitmo vasA={vasA} normal={normalRiel} necesitas={necesitasRiel} techo={techoRiel} />
        {necesitasRiel === 'fuera' && (
          <p className="mt-1 text-[13px] leading-snug text-ink-warn">
            {llenado?.imposible ? (
              <>No entra ni con las <span className="tabular-nums">{llenado.spec.cantidad} silletas</span> llenas:
                el máximo de la máquina son <span className="tabular-nums">{fmtCpm(llenado.spec.maxCpm)} pz/min</span>.</>
            ) : (
              <>Pide <span className="tabular-nums">{fmtDec(pace.requiredPerMinute)} pz/min</span>
                {techoRiel != null && techoRiel > 0 && (
                  <>: <span className="tabular-nums">{fmtDec(pace.requiredPerMinute / techoRiel)}×</span> el mejor turno
                    que esta línea hizo</>
                )}. Sale de la escala — no es una meta, es que ya no da el tiempo.</>
            )}
          </p>
        )}
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
          pz/min <b className="text-foreground/80">andando</b>, sobre{' '}
          <span className="tabular-nums">{fmtDurationSec(pace.workMin * 60)}</span> que quedan produciendo
          {pace.pendingBreakMin > 0 && (
            <> — los <span className="tabular-nums">{fmtInt(pace.pendingBreakMin)} min</span> de convenio no cuentan</>
          )}.
        </p>
      </div>

      {/* ── La fila de estadísticas ──
          Grid y no flex-wrap: con el «Queda» y su sub, el wrap apilaba las
          celdas una bajo otra y la «fila» medía tres renglones (visto en
          vivo a 375 px). */}
      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2">
        <CeldaStat k="Faltan" v={`${fmtInt(pace.remainingPieces)} pz`} />
        <CeldaStat
          k="Queda"
          v={fmtDurationSec((pace.workMin + pace.pendingBreakMin) * 60)}
          sub={`(${fmtDurationSec(pace.workMin * 60)} prod.)`}
        />
        {vsAyer && <CeldaStat k="Ayer a esta altura" v={fmtInt(vsAyer.pieces)} delta={vsAyer.diff} />}
      </div>
      {/* Los DOS horizontes ya no van como prosa: son la banda del metro de
          arriba. Su versión en palabras (auditable, con el ± y la explicación
          del rendimiento) vive dentro de «ver cómo se calcula». */}

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
          <span className="tabular-nums text-foreground/90">{fmtCpm(llenado.spec.setCpm)} pz/min</span>{llenado.spec.setHz ? <span className="tabular-nums text-muted-foreground/80"> ({llenado.spec.setHz} Hz)</span> : null},
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
          <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
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

      {/* «Ayer a esta altura» ya es una celda de la fila de estadísticas. */}

      {/* Lo AUDITABLE, a un toque: las dos proyecciones en palabras (con su ±
          y su explicación), el ritmo exacto que hace falta, el techo y la hora
          extra. El instrumento de arriba muestra; esto respalda. */}
      <button
        type="button"
        onClick={() => setVerDetalle((v) => !v)}
        className="tap-44 mt-2 text-[11px] text-sky-700 underline underline-offset-2 dark:text-sky-300"
        aria-expanded={verDetalle}
      >
        {verDetalle ? 'ocultar el cálculo' : 'ver cómo se calcula'}
      </button>

      {/* Los números en filas, no en prosa: se comparan de un vistazo. */}
      <dl className={`mt-2 space-y-0.5 text-[12px] ${verDetalle ? '' : 'hidden'}`}>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Al horario</dt>
          <dd className="tabular-nums">
            {fmtInt(pace.projectedPieces)} pz ({fmtDec((pace.projectedPieces / pace.targetPieces) * 100, 0)}%)
            {cierre && <span className="text-muted-foreground"> · hasta las {fmtWallTime(cierre)}</span>}
          </dd>
        </div>
        {horizonte?.hasta && horizonte.estimate != null && (
          <div className="flex items-baseline gap-2">
            <dt className="w-20 shrink-0 text-muted-foreground">Como los últimos</dt>
            <dd className="tabular-nums">
              {fmtInt(horizonte.estimate)} pz
              {horizonte.mapePct != null && <> ±{fmtDec(horizonte.mapePct)}%</>}
              <span className="text-muted-foreground"> · cierre ≈{horizonte.hasta}</span>
              {horizonte.explicacion && (
                <span className="block text-[11px] text-muted-foreground/80">({horizonte.explicacion})</span>
              )}
            </dd>
          </div>
        )}
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
        <p className="mt-1.5 text-[11px] text-muted-foreground/80">
          El <b>techo</b> es el mejor ritmo ANDANDO que la línea alcanzó
          {historial?.muestras ? ` en los últimos ${historial.muestras} turnos` : ' en turnos anteriores'} —
          lo que ya demostró que puede, no lo que dice el objetivo.
        </p>
      )}

      {/* La referencia histórica: hace que "necesitás 16 pz/min" se pueda
          juzgar. El objetivo del sensor puede decir 20 y la línea no haber
          pasado nunca de 12,7 — medido en Filete sobre 9 turnos. */}
      {historial?.medianCpm != null && (
        <p className="mt-1 text-[11px] text-muted-foreground/80">
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
function PorHora({ series, paradas }: {
  series: PublicMonitorLive['series']
  /** Todas las paradas del turno, para poder explicar la hora que se hundió. */
  paradas?: ParadaConHora[] | null
}) {
  const rows = useMemo(() => buildHourlyRows(series), [series])
  const max = useMemo(() => peakPieces(rows), [rows])
  /* La hora que se hundió y qué se la comió: el desplome estaba en el listado
     sin ninguna marca (h5 con 379 pz entre horas de ~2.100) y su causa vivía
     cuatro bloques más abajo. Ver `horaMasFloja`. */
  const floja = useMemo(() => horaMasFloja(rows, paradas), [rows, paradas])
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
            <span className={`w-6 shrink-0 tabular-nums ${
              floja?.index === r.index ? 'font-semibold text-ink-crit' : 'text-muted-foreground'
            }`}>h{r.index}</span>
            <span className="w-[5.5rem] shrink-0 whitespace-nowrap tabular-nums text-[11px] text-muted-foreground/80">
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
            <span className="w-[5.5rem] shrink-0 whitespace-nowrap text-right tabular-nums text-[11px] text-muted-foreground/80">
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
      {/* Con ocho números en columna, el desplome solo se ve restando de
          cabeza. Se dice cuál fue y, si una parada lo explica, cuál. */}
      {floja && (
        <p className="mt-2 text-[12px] text-foreground/90">
          La hora más floja fue la <b className="text-ink-crit">h{floja.index}</b>
          {' '}con <span className="tabular-nums">{fmtInt(floja.pieces)} pz</span>,
          {' '}<span className="tabular-nums">{Math.round(floja.caidaPct)}%</span> bajo lo habitual del turno
          {floja.culpable
            ? (<> · se la comió <b>{floja.culpable.reason}</b> desde
              las <span className="tabular-nums">{floja.culpable.hora.slice(0, 5)}</span>
              {' '}(<span className="tabular-nums">{Math.round(floja.culpable.min)} min</span> dentro de esa hora)</>)
            /* Sin una parada que la explique no se inventa un culpable: puede
               ser alimentación aguas arriba, y eso no lo sabe esta pantalla. */
            : '. Ninguna parada registrada la explica.'}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground/80">
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
/**
 * ── Respuesta de Mantención ──────────────────────────────────────────────────
 * La evidencia de que Mantención responde, EN la pantalla que mira Producción
 * (pedido de Orel, 26-08): quién falló, cuánto costó, qué tan rápido se repuso
 * y quiénes cerraron en 100%. Los datos los publica el backend en
 * `live.mantencion` (fallas encadenadas en EVENTOS; micro y planificado aparte
 * para no pulverizar el MTTR). Se muestra también con el turno cerrado — ahí
 * ES el informe.
 */
function RespuestaMantencion({ m, cerrado }: {
  m: NonNullable<PublicMonitorLive['mantencion']>
  cerrado: boolean
}) {
  if (!m.porMaquina.length) return null
  const totalFallaMin = m.porMaquina.reduce((a, x) => a + x.fallaMin, 0)
  const totalEventos = m.porMaquina.reduce((a, x) => a + x.eventosFalla, 0)
  const conFalla = [...m.porMaquina].filter((x) => x.fallaMin > 0).sort((a, b) => b.fallaMin - a.fallaMin)
  const sanas = m.porMaquina.length - conFalla.length
  const mttrGlobal = totalEventos > 0 ? totalFallaMin / totalEventos : null
  const microTotal = m.porMaquina.reduce((a, x) => a + x.microN, 0)
  const totalSinImputarMin = m.porMaquina.reduce((a, x) => a + (x.sinImputarMin ?? 0), 0)

  const colorDisp = (pct: number | null) =>
    pct == null ? 'text-muted-foreground'
      : pct >= 99.9 ? 'text-ink-ok' : pct >= 90 ? 'text-ink-warn' : 'text-ink-crit'

  /* Con CERO imputado y minutos sin causa, la tarjeta se ENCOGE al aviso
     (Orel, 26-08: «¿la ocultamos hasta que estén imputadas?»). No se oculta
     del todo —el empujón a imputar es el punto— pero tampoco muestra tres
     «100%» que cualquier paro sin causa puede desmentir: eso era exactamente
     la falsa realidad que la pregunta señalaba. */
  const soloAviso = totalFallaMin === 0 && totalSinImputarMin >= 3

  return (
    <section className="rounded-card border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Wrench className="h-3 w-3" />
        Mantención · respuesta del turno
      </div>

      {/* El titular: la historia en una frase, antes que cualquier cifra. */}
      <p className="mt-1.5 text-[15px] leading-snug text-foreground">
        {totalFallaMin === 0 && totalSinImputarMin >= 3 ? (
          /* OJO — con paros SIN CAUSA no se reclama el 100%: cualquiera de esos
             minutos puede ser una falla que nadie imputó todavía. La tarjeta
             lo dice y EMPUJA a imputar (Orel, 26-08). */
          <>Sin fallas imputadas por ahora — pero hay{' '}
            <b className="tabular-nums">{fmtInt(totalSinImputarMin)} min</b> de detenciones{' '}
            <b>sin causa anotada</b> en Shoplogix. Imputarlas cierra la historia del turno.</>
        ) : totalFallaMin === 0 ? (
          <>Sin fallas técnicas en el turno: disponibilidad{' '}
            <b className="tabular-nums">100%</b> en las {m.porMaquina.length} máquinas.</>
        ) : (
          <>La falla técnica {cerrado ? 'costó' : 'lleva'}{' '}
            <b className="tabular-nums">{fmtInt(totalFallaMin)} min</b>
            {conFalla.length === 1 && <>, toda en <b>{nombreCorto(conFalla[0]!.name)}</b></>}
            {mttrGlobal != null && <> — MTTR <b className="tabular-nums">{fmtDec(mttrGlobal)} min</b></>}
            {sanas > 0 && (
              <> y {sanas === 1 ? 'la otra máquina' : `las otras ${sanas}`} en{' '}
                <b className="tabular-nums">100%</b></>
            )}.
          </>
        )}
      </p>

      {/* El desglose del aviso: los minutos sin causa son TIEMPO DE MÁQUINA
          sumado entre las tres — no minutos de línea detenida (Orel, 26-08:
          «53 min» a secas se leía como casi una hora de línea muerta). */}
      {soloAviso && (
        <p className="mt-1.5 text-caption leading-snug text-muted-foreground">
          Son minutos de <b>cada máquina</b>, sumados
          {' — '}
          {m.porMaquina
            .filter((x) => (x.sinImputarMin ?? 0) > 0)
            .map((x, i) => (
              <span key={x.name} className="tabular-nums">
                {i > 0 && ' · '}
                {nombreCorto(x.name)} {fmtInt(x.sinImputarMin!)} min
              </span>
            ))}
          .
          {/* El número que la suma NO dice: cuánto estuvo parada la LÍNEA
              entera (las tres a la vez) sin causa. Lo publica el backend como
              intersección de los tramos; en docs viejos no viene. */}
          {m.sinImputarLineaMin != null && (
            m.sinImputarLineaMin >= 1 ? (
              <> La línea completa ({m.porMaquina.length === 3 ? 'las tres' : 'todas'} a la vez)
                estuvo <b className="tabular-nums">{fmtInt(m.sinImputarLineaMin)} min</b> detenida
                sin causa.</>
            ) : (
              <> {m.porMaquina.length === 3 ? 'Las tres' : 'Todas'} nunca pararon a la vez:
                la línea completa no perdió tiempo por estos paros.</>
            )
          )}
        </p>
      )}

      {/* Una fila por máquina: la disponibilidad TÉCNICA con su palabra.
          En modo aviso NO se pintan: un «100%» por máquina debajo de «hay 53
          min sin causa» es afirmar lo que el propio aviso pone en duda. */}
      {!soloAviso && (
      <div className="mt-2.5 space-y-1.5 border-t border-border/50 pt-2.5">
        {m.porMaquina.map((x) => (
          <div key={x.name} className="flex items-baseline gap-2">
            <span className="w-9 shrink-0 text-footnote text-muted-foreground">{nombreCorto(x.name)}</span>
            <span className={`w-14 shrink-0 text-headline tabular-nums ${
              /* Con paros sin causa el 100% queda en suspenso: tinta neutra. */
              x.fallaMin === 0 && (x.sinImputarMin ?? 0) >= 3 ? 'text-muted-foreground' : colorDisp(x.dispTecnicaPct)
            }`}>
              {x.dispTecnicaPct != null ? `${fmtDec(x.dispTecnicaPct, x.dispTecnicaPct >= 99.9 ? 0 : 1)}%` : '—'}
            </span>
            <span className="min-w-0 flex-1 truncate text-caption tabular-nums text-muted-foreground">
              {x.fallaMin > 0
                ? `${x.eventosFalla} evento${x.eventosFalla === 1 ? '' : 's'} · ${fmtInt(x.fallaMin)} min` +
                  (x.causasFalla[0] ? ` (${x.causasFalla.map((c) => c.causa).join(', ')})` : '')
                : (x.sinImputarMin ?? 0) >= 3
                  ? `sin fallas imputadas · ${fmtInt(x.sinImputarMin!)} min sin causa`
                  : 'sin fallas técnicas'}
            </span>
          </div>
        ))}
      </div>
      )}

      {/* Los eventos, del más caro al más barato: cuándo, cuánto, qué. */}
      {!soloAviso && m.eventos.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {m.eventos.slice(0, 3).map((e) => (
            <p key={`${e.maquina}-${e.desde}`} className="text-caption tabular-nums text-muted-foreground">
              {fmtWallTime(e.desde)}–{fmtWallTime(e.hasta)} · <b className="text-foreground/80">{fmtInt(e.min)} min</b>{' '}
              · {e.causas.join(' + ')}{e.paros > 1 ? ` (${e.paros} paros encadenados)` : ''} · {nombreCorto(e.maquina)}
            </p>
          ))}
        </div>
      )}

      {/* Las IMPUTACIONES, cuantificadas — todas, no solo las técnicas.
          Antes la tarjeta decía «100%» sin una palabra de los 389 min de
          MMPP que el supervisor SÍ anotó, y eso se leía como «el monitor no
          registra las imputaciones» (Orel, 28-08). Se muestra también en
          modo aviso: el contraste «esto ya está imputado / esto falta» es
          exactamente el empujón. */}
      {(m.imputadas ?? []).filter((x) => x.min >= 1).length > 0 && (
        <p className="mt-2 border-t border-border/50 pt-2 text-caption leading-snug text-muted-foreground">
          <b className="text-foreground/80">Detenciones imputadas del turno:</b>{' '}
          {(m.imputadas ?? []).filter((x) => x.min >= 1).map((x, i) => (
            <span key={x.causa} className="tabular-nums">
              {i > 0 && ' · '}
              {x.causa} <b className="text-foreground/80">{fmtInt(x.min)} min</b>
            </span>
          ))}
          <span className="text-muted-foreground/70"> (minutos de máquina, sumados)</span>
        </p>
      )}
      {!soloAviso && (
        <p className="mt-2 text-caption leading-snug text-muted-foreground/80">
          Disponibilidad técnica: solo fallas de equipo — colación, esperas externas y las{' '}
          <span className="tabular-nums">{fmtInt(microTotal)}</span> microdetenciones van aparte.
        </p>
      )}
    </section>
  )
}

/**
 * La conclusión de la lista de máquinas, dicha en una frase.
 *
 * Cuando corren parejas, la noticia no es la velocidad sino la MARCHA: se
 * nombra a la que más paró contra la que menos, en puntos de uptime — es la
 * diferencia que la barra dibuja y la que Mantención puede atacar.
 */
function fraseMaquinas(r: RitmosPorMaquina): string {
  const n = r.maquinas.length
  const cuantas = n === 3 ? 'Las tres' : n === 2 ? 'Las dos' : `Las ${n}`
  /* Sin conclusión que dar, nada: el caption de la lista ya explica la barra
     (decía lo mismo dos veces, un renglón bajo el otro — visto en vivo). */
  if (!r.parejas) return ''
  const cpms = r.maquinas.map((m) => m.cpm)
  const rango = `${fmtDec(Math.min(...cpms))}–${fmtDec(Math.max(...cpms))}`
  const conUptime = r.maquinas.filter((m) => m.uptimePct != null)
  if (conUptime.length >= 2) {
    const mejor = conUptime.reduce((a, b) => (b.uptimePct! > a.uptimePct! ? b : a))
    const peor = conUptime.reduce((a, b) => (b.uptimePct! < a.uptimePct! ? b : a))
    const brecha = Math.round(mejor.uptimePct! - peor.uptimePct!)
    if (brecha >= 10) {
      return `${cuantas} corren casi igual (${rango}). Lo que las separa es cuánto pararon: `
        + `${nombreCorto(peor.nombre)} perdió ${brecha} puntos de marcha contra ${nombreCorto(mejor.nombre)}.`
    }
  }
  return `${cuantas} corren casi igual (${rango}), y también pararon parecido.`
}

/**
 * Anexa a cada máquina los dos repartos que SUMAN los números de la línea:
 * el de la media de 15 min (`repartoAhoraAndando`, mismo denominador que el
 * número de arriba) y el aporte al promedio del turno (piezas ÷ minutos
 * produciendo de la LÍNEA — la misma división que produce `turnoCpm`). El
 * «mientras anduvo» de `ritmoPorMaquina` se conserva en `cpm`: no suma, pero
 * sigue siendo el que se compara contra el set point.
 */
function conRepartoPorMaquina(
  r: RitmosPorMaquina | null,
  seriesMaquinas: { nombre: string; serie: number[] }[] | null,
  serie: readonly TramoSerie[],
  ahoraWall: number | null | undefined,
  producingMin: number | null,
  /** El AHORA de cada máquina (pulso del contador, por nombre): la columna
      que suma el «Ahora» grande. Solo llega con el pulso fresco. */
  pulsoPorNombre?: Map<string, number> | null,
): RitmosPorMaquina | null {
  if (!r) return r
  const porNombre = new Map((seriesMaquinas ?? []).map((s) => [s.nombre, s.serie]))
  const reparto = seriesMaquinas
    ? repartoAhoraAndando(serie, r.maquinas.map((m) => porNombre.get(m.nombre) ?? null), ahoraWall)
    : null
  return {
    ...r,
    maquinas: r.maquinas.map((m, i) => ({
      ...m,
      ahoraCpm: reparto?.[i] ?? null,
      aporteCpm: producingMin != null && producingMin > 0 ? m.piezas / producingMin : null,
      pulsoCpm: pulsoPorNombre?.get(m.nombre) ?? null,
    })),
  }
}

/**
 * La velocidad de cada máquina a lo largo del turno, como curvas (pedido de
 * Orel, 26-08: el gráfico del detalle de turno «se vería bien acá»).
 *
 * ── UNA sola vara: la velocidad REAL de cada tramo ─────────────────────────
 * Dibujaba la media móvil de 15 min y Orel la leyó —con razón— como «la
 * velocidad de cada Baader en ese momento»: el último punto sumaba 19,9
 * mientras arriba el «Ahora» decía 30,1, y nada cuadraba con nada (27-08).
 * Ahora cada punto es el CRUDO del tramo de 5 min (piezas ÷ 5), y al final
 * se anexa el PUNTO VIVO del pulso por máquina — el mismo número de la
 * columna «ahora», así el final del gráfico suma el «Ahora» grande. La media
 * de 15 min ya tiene su cifra con rótulo en la cabecera; el gráfico no la
 * repite con rezago.
 *
 * SVG propio y no echarts: esta página evita a propósito ese bundle.
 * ⚠ El corte de la cola de ceros del final es el de la LÍNEA (`mediaMovil`),
 * no el de cada máquina: si una paró antes del cierre, sus ceros son la
 * información que este gráfico existe para mostrar.
 */
/**
 * Trazo SUAVE sobre los mismos puntos (pedido de Orel, 28-08: «como el
 * detalle de turno»). Spline monótona (tangentes de Steffen): suaviza el
 * dibujo sin inventar picos ni despegar los ceros — un paro suavizado sigue
 * tocando el piso, que con Catmull-Rom clásico no se cumple. Los datos del
 * tooltip son los puntos crudos de siempre; esto es solo el lápiz.
 */
function pathSuave(ys: number[]): string {
  const n = ys.length
  if (n === 0) return ''
  if (n < 3) return ys.map((y, i) => `${i === 0 ? 'M' : 'L'}${i},${y}`).join(' ')
  const delta = Array.from({ length: n - 1 }, (_, i) => ys[i + 1]! - ys[i]!)
  const m = new Array<number>(n)
  m[0] = delta[0]!
  m[n - 1] = delta[n - 2]!
  for (let i = 1; i < n - 1; i++) {
    const a = delta[i - 1]!
    const b = delta[i]!
    m[i] = a * b <= 0 ? 0 : (2 * a * b) / (a + b)
  }
  let d = `M0,${ys[0]}`
  for (let i = 0; i < n - 1; i++) {
    const c1y = ys[i]! + m[i]! / 3
    const c2y = ys[i + 1]! - m[i + 1]! / 3
    d += ` C${i + 1 / 3},${c1y} ${i + 2 / 3},${c2y} ${i + 1},${ys[i + 1]}`
  }
  return d
}

function CurvasMaquinas({ serie, maquinas, ahoraPorNombre, ahoraAt }: {
  serie: readonly TramoSerie[]
  maquinas: { nombre: string; serie: number[]; targetCpm?: number | null }[]
  /** El pulso vivo de cada máquina, por nombre — el punto final de la curva.
      null cuando el contador no está fresco: la curva termina en el último
      tramo cerrado, sin inventar un presente. */
  ahoraPorNombre?: Map<string, number> | null
  /** Hora ISO de esa lectura del pulso, para rotular el punto vivo. */
  ahoraAt?: string | null
}) {
  /* El tramo bajo el dedo/cursor (pedido de Orel, 27-08: «ver en hover la
     velocidad en todo momento», como el gráfico del detalle de turno). Los
     hooks van ANTES del return condicional — reglas de hooks. */
  const [idxSel, setIdxSel] = useState<number | null>(null)
  /* Filtro por máquina (Orel, 28-08): la leyenda es el control — tocar un
     nombre lo apaga/prende. Nunca cero visibles: apagar la última prende
     todas de vuelta. La escala se recalcula con las visibles, que es la
     gracia de aislar una. */
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(new Set())
  const fin = mediaMovil(serie).length
  /* Zoom por pellizco/rueda + paneo por scroll nativo — el MISMO gesto del
     gráfico grande (`useZoomGesto`), zoom local de este gráfico. */
  const zg = useZoomGesto({ dominioMin: Math.max(1, fin) * PASO_MIN })
  if (fin < 2) return null
  const conVivo = ahoraPorNombre != null
    && maquinas.every((m) => ahoraPorNombre.get(m.nombre) != null)
  const todas = maquinas.map((m, idx) => {
    const puntos = m.serie.slice(0, fin).map((pz) => pz / PASO_MIN)
    if (conVivo) puntos.push(ahoraPorNombre!.get(m.nombre)!)
    return { nombre: m.nombre, idx, puntos, targetCpm: m.targetCpm ?? null }
  })
  const curvas = todas.filter((c) => !ocultas.has(c.nombre))
  const alternar = (nombre: string) => {
    const next = new Set(ocultas)
    if (next.has(nombre)) next.delete(nombre)
    else next.add(nombre)
    setOcultas(next.size >= todas.length ? new Set() : next)
  }
  /* Índices: 0..fin-1 son tramos cerrados; con pulso fresco hay un punto
     extra (el vivo) en el índice `fin`. */
  const nPuntos = fin + (conVivo ? 1 : 0)
  const max = Math.max(1, ...curvas.flatMap((c) => c.puntos))
  const w = nPuntos - 1
  const y = (v: number) => 100 - (v / max) * 94 - 3
  const t0 = serie[0]?.t ? Date.parse(serie[0].t) : NaN
  const t1 = serie[fin - 1]?.t ? Date.parse(serie[fin - 1]!.t!) + PASO_MIN * 60_000 : NaN
  /* Marcas del eje X en horas REDONDAS, ubicadas por ÍNDICE del tramo (la
     serie puede traer huecos — aritmética de tiempo las correría, gotcha ya
     pagada en el gráfico grande). Paso de 1 o 2 h según el largo. */
  const marcasHora = (() => {
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return []
    const pasoH = (t1 - t0) / 3_600_000 > 4.5 ? 2 : 1
    const out: Array<{ x: number; label: string }> = []
    const primera = new Date(t0)
    primera.setUTCMinutes(0, 0, 0)
    for (let t = primera.getTime() + 3_600_000; t < t1 - 15 * 60_000; t += pasoH * 3_600_000) {
      let i = 0
      while (i < fin && Date.parse(serie[i]?.t ?? '') < t) i++
      if (i <= 0 || i >= fin) continue
      const x = (i / Math.max(1, w)) * 100
      /* Pegada a un extremo, la marca se MONTA sobre la hora de inicio/fin
         (a 375 px se leía «07:2008:00» — visto en el pulido del 27-08). Los
         extremos ya están rotulados; la marca sobra ahí. */
      if (x < 10 || x > 88) continue
      const label = horaPlanta(t)
      if (label) out.push({ x, label })
    }
    return out
  })()

  return (
    <div className="mt-3 border-t border-border/50 pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-caption text-muted-foreground">
        <span>
          Velocidad de cada máquina
          <span className="text-muted-foreground/70"> · pz/min por tramo de 5 min</span>
        </span>
        <span className="flex items-center gap-1">
          {/* La leyenda ES el filtro (Orel, 28-08): tocar apaga/prende cada
              máquina — una, dos o las tres. */}
          {todas.map((c) => {
            const oculta = ocultas.has(c.nombre)
            return (
              <button
                key={c.nombre}
                type="button"
                onClick={() => alternar(c.nombre)}
                aria-pressed={!oculta}
                className={`tap-44 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${
                  oculta ? 'opacity-40' : ''
                }`}
              >
                <span
                  className="inline-block h-1 w-3.5 rounded-full"
                  style={{ background: `var(--mon-maq-${c.idx + 1})` }}
                />
                {nombreCorto(c.nombre)}
              </button>
            )
          })}
        </span>
      </div>
      {/* El contenedor con SCROLL (paneo nativo) y adentro el contenido que
          se ensancha con el zoom — el patrón de `useZoomGesto`. El eje de
          horas va DENTRO del contenido: fuera se queda quieto al panear y
          pasa a mentir (gotcha ya pagada en el gráfico grande).
          Sin `touch-none`: el arrastre de un dedo ES el paneo. */}
      <div {...zg.props} className="relative mt-1.5 -mx-1 overflow-x-auto px-1">
      <div
        className="relative cursor-crosshair"
        style={{ width: `${zg.zoom * 100}%` }}
        /* El tramo se elige por POSICIÓN del puntero, no con un handler por
           punto: sin zoom cada tramo mide ~4 px (gotcha ya pagada en el
           gráfico grande). Pointer events cubren mouse y dedo. */
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const fr = (e.clientX - r.left) / Math.max(1, r.width)
          setIdxSel(Math.max(0, Math.min(nPuntos - 1, Math.round(fr * (nPuntos - 1)))))
        }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const fr = (e.clientX - r.left) / Math.max(1, r.width)
          setIdxSel(Math.max(0, Math.min(nPuntos - 1, Math.round(fr * (nPuntos - 1)))))
        }}
        onPointerLeave={() => setIdxSel(null)}
      >
        <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" className="block h-36 w-full" aria-hidden>
          {/* La línea de la escala: dónde queda el máximo que se alcanzó. */}
          <line
            x1={0} y1={y(max)} x2={w} y2={y(max)}
            className="stroke-foreground/15" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
          />
          {/* Las horas del eje, también como guía vertical tenue: sin ellas
              los tramos flotaban sin reloj (Orel, 27-08). */}
          {marcasHora.map((mk) => (
            <line
              key={mk.label}
              x1={(mk.x / 100) * w} y1={0} x2={(mk.x / 100) * w} y2={100}
              className="stroke-foreground/10" vectorEffect="non-scaling-stroke"
            />
          ))}
          {curvas.map((c) => (
            <path
              key={c.nombre}
              d={pathSuave(c.puntos.map((v) => y(v)))}
              fill="none"
              stroke={`var(--mon-maq-${c.idx + 1})`}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {/* Con fondo: sobre un pico de las curvas el texto era ilegible. */}
        <span
          className="absolute left-0 top-0 rounded-full px-1 text-[10px] tabular-nums text-muted-foreground/80"
          style={{ background: 'rgb(var(--card) / 0.8)' }}
        >
          {fmtDec(max)} pz/min
        </span>
        {/* El punto VIVO al final de cada curva (un círculo en el SVG estirado
            sale elipse — va en HTML): es el «ahora» de la columna de arriba. */}
        {conVivo && curvas.map((c) => (
          <span
            key={c.nombre}
            className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: '100%',
              top: `${y(c.puntos[nPuntos - 1] ?? 0)}%`,
              background: `var(--mon-maq-${c.idx + 1})`,
              boxShadow: '0 0 0 1.5px rgb(var(--card))',
            }}
          />
        ))}
        {/* ── El detalle bajo el dedo: marcador + valores del tramo ─────────
            La hora sale del TIMESTAMP del tramo, no de aritmética con el
            índice — la serie puede traer huecos (gotcha ya pagada). Todo en
            HTML: dentro del SVG estirado, texto y círculos se deforman. */}
        {idxSel != null && (() => {
          const esVivo = conVivo && idxSel === nPuntos - 1
          const xPct = (idxSel / Math.max(1, nPuntos - 1)) * 100
          const tSel = !esVivo && serie[idxSel]?.t ? Date.parse(serie[idxSel]!.t!) : NaN
          const valores = curvas.map((c) => ({ c, v: c.puntos[idxSel] ?? 0 }))
          const linea = valores.reduce((a, x) => a + x.v, 0)
          return (
            <>
              <span
                className="pointer-events-none absolute inset-y-0 w-px bg-foreground/40"
                style={{ left: `${xPct}%` }}
              />
              {valores.map(({ c, v }) => (
                <span
                  key={c.nombre}
                  className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    left: `${xPct}%`,
                    top: `${y(v)}%`,
                    background: `var(--mon-maq-${c.idx + 1})`,
                    boxShadow: '0 0 0 1.5px rgb(var(--card))',
                  }}
                />
              ))}
              <div
                className="pointer-events-none absolute z-10 rounded-ctl border border-border bg-card px-2 py-1.5 text-[11px] leading-tight shadow-sm"
                style={{
                  top: 2,
                  left: `${Math.min(72, Math.max(0, xPct + 2))}%`,
                }}
              >
                {esVivo ? (
                  <div className="mb-0.5 font-semibold tabular-nums text-foreground">
                    ahora mismo{ahoraAt ? ` · ${new Date(ahoraAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}` : ''}
                  </div>
                ) : Number.isFinite(tSel) && (
                  <div className="mb-0.5 font-semibold tabular-nums text-foreground">
                    {horaPlanta(tSel)}–{horaPlanta(tSel + PASO_MIN * 60_000)}
                  </div>
                )}
                {valores.map(({ c, v }) => (
                  <div key={c.nombre} className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                    <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: `var(--mon-maq-${c.idx + 1})` }} />
                    {nombreCorto(c.nombre)} <b className="text-foreground">{fmtDec(v)}</b>
                    {c.targetCpm != null && c.targetCpm > 0 && (
                      <span className="text-muted-foreground/70">/ obj {fmtDec(c.targetCpm, 0)}</span>
                    )}
                  </div>
                ))}
                {/* Los crudos por máquina SUMAN el de la línea en ese tramo —
                    y en el punto vivo, el «Ahora» grande de arriba. */}
                <div className="mt-0.5 border-t border-border/50 pt-0.5 tabular-nums text-muted-foreground">
                  línea <b className="text-foreground">{fmtDec(linea)}</b> pz/min
                </div>
              </div>
            </>
          )
        })()}
      {/* El eje X, DENTRO del contenido escalado: horas redondas ubicadas
          por índice de tramo, extremos anclados al borde (centrados, media
          etiqueta queda fuera — gotcha ya pagada). */}
      <div className="relative mt-0.5 h-4 text-[10px] tabular-nums text-muted-foreground/80">
        <span className="absolute left-0">{Number.isFinite(t0) ? horaPlanta(t0) : ''}</span>
        {marcasHora.map((mk) => (
          <span key={mk.label} className="absolute -translate-x-1/2" style={{ left: `${Math.min(92, Math.max(8, mk.x))}%` }}>
            {mk.label}
          </span>
        ))}
        <span className="absolute right-0">
          {conVivo ? 'ahora' : Number.isFinite(t1) ? horaPlanta(t1) : ''}
        </span>
      </div>
      </div>
      </div>
      <div className="mt-0.5 flex items-center justify-end gap-2 text-[10px] text-muted-foreground/70">
        {zg.acercado ? (
          <button type="button" onClick={zg.verTodo} className="tap-44 underline decoration-dotted underline-offset-2">
            ver todo el turno
          </button>
        ) : (
          <span>pellizcá o rodá (ctrl+rueda) para acercar</span>
        )}
      </div>
    </div>
  )
}

/**
 * Las barras minuto a minuto (opción A, Orel 29-08): la serie del turno que
 * publica el pulso, con el nombre de cada máquina ya resuelto.
 */
interface BarrasMinutoDatos {
  desde: string
  maquinas: Array<{ id: string; nombre: string; esperado: number | null; cycles: number[] }>
}

/** Ancho mínimo de barra para que el número de dos cifras quepa sin pisarse. */
const PX_MIN_NUMERO = 16

/**
 * Barras de 1 minuto con el número adentro — el ESPEJO del cronómetro de
 * Shoplogix («que el ahora muestre el dato que la barra muestra en Shoplogix
 * para cada Baader», Orel 29-08). Una franja por máquina y arriba la de la
 * línea (la suma). Color por % del esperado, los mismos cortes que usa
 * Shoplogix en sus barras: ≥75% ok, 50–75% atención, <50% crítico.
 *
 * La ventana por defecto son los últimos 40 min SIGUIENDO la cola del turno;
 * en cuanto la persona zoomea o panea, la vista es suya y no se le mueve.
 * Alejando todo el turno, los números no caben y se esconden (quedan las
 * barras y el `title` de cada una).
 */
function BarrasMinuto({ datos, cerrado }: { datos: BarrasMinutoDatos; cerrado?: boolean }) {
  const n = Math.min(...datos.maquinas.map((m) => m.cycles.length))
  const [tocado, setTocado] = useState(false)
  const [ventana, setVentana] = useState<Ventana | null>(null)
  /* El ancho visible se mide en el PADRE del contenedor con scroll (mismo
     ancho): el ref del scroll es del hook. Decide si los números caben y
     cuántos minutos entran en la ventana por defecto. */
  const medidorRef = useRef<HTMLDivElement>(null)
  const [anchoPx, setAnchoPx] = useState(0)
  useEffect(() => {
    const el = medidorRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAnchoPx(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /* Ventana por defecto ADAPTADA al ancho: los minutos que caben con número
     legible (a 375 px son ~23, en desktop ~60). Sigue la cola del turno hasta
     que la persona zoomea o panea; ahí la vista es suya. */
  const ventanaDef = anchoPx > 0
    ? Math.max(20, Math.min(60, Math.floor(anchoPx / PX_MIN_NUMERO)))
    : null
  useEffect(() => {
    if (tocado || ventanaDef == null) return
    setVentana(n > ventanaDef ? { desdeMin: n - ventanaDef, hastaMin: n } : null)
  }, [n, tocado, ventanaDef])
  const zg = useZoomGesto({
    dominioMin: Math.max(1, n),
    ventana,
    /* El scroll programado también publica ventana: solo cuenta como gesto de
       la persona cuando la vista DEJÓ la cola — ahí la vista es suya. */
    onVentana: (v) => {
      const esCola = v != null && v.hastaMin >= n - 2
        && ventanaDef != null && Math.abs((v.hastaMin - v.desdeMin) - ventanaDef) <= 2
      if (!esCola) setTocado(true)
      setVentana(v)
    },
  })
  /* Mientras nadie tomó el control, el scroll queda CLAVADO a la cola (el
     presente). La adopción del hook posiciona por rAF y a veces llega antes
     de que el contenido tenga su ancho nuevo — este ancla es determinista. */
  const scrollRef = zg.props.ref
  useEffect(() => {
    if (tocado) return
    const el = scrollRef.current
    if (el) el.scrollLeft = el.scrollWidth
  })
  if (n < 2) return null

  const t0 = Date.parse(datos.desde)
  const suma = Array.from({ length: n }, (_, i) =>
    datos.maquinas.reduce((a, m) => a + (m.cycles[i] ?? 0), 0))
  const esperadoLinea = datos.maquinas.every((m) => m.esperado != null && m.esperado > 0)
    ? datos.maquinas.reduce((a, m) => a + m.esperado!, 0)
    : null
  const pxBarra = anchoPx > 0 ? (anchoPx * zg.zoom) / n : 0
  const conNumeros = pxBarra >= PX_MIN_NUMERO

  /* Marcas de hora cada N minutos, con N elegido para que no se pisen. */
  const cadaMin = pxBarra > 0 ? Math.max(5, Math.ceil(48 / pxBarra / 5) * 5) : 60
  const marcas: number[] = []
  for (let i = 0; i < n; i++) {
    if ((t0 + i * 60_000) % (cadaMin * 60_000) === 0 && i > 0 && i < n - 2) marcas.push(i)
  }

  const claseDe = (v: number, esperado: number | null) => {
    if (esperado == null || esperado <= 0) return 'border-muted-foreground/50 bg-muted text-muted-foreground'
    const r = v / esperado
    if (r >= 0.75) return 'border-ink-ok bg-ink-ok/[0.15] text-ink-ok'
    if (r >= 0.5) return 'border-ink-warn bg-ink-warn/[0.15] text-ink-warn'
    return 'border-ink-crit bg-ink-crit/[0.15] text-ink-crit'
  }

  const franja = (nombre: string, esperado: number | null, vals: number[], altoPx: number) => {
    const tope = Math.max(esperado ?? 0, ...vals.slice(0, n), 1)
    return (
      <div key={nombre} className="mt-1.5">
        {/* Pegado al borde izquierdo VISIBLE (sticky): el contenido está
            ensanchado por el zoom y un header normal se va con el paneo. */}
        <div
          className="sticky left-0 z-10 w-fit rounded-full px-1 text-caption text-muted-foreground"
          style={{ background: 'rgb(var(--card) / 0.85)' }}
        >
          <b className="font-semibold text-foreground/80">{nombre}</b>
          {esperado != null && <span className="text-muted-foreground/80"> · esperado {fmtDec(esperado, 0)} pz/min</span>}
        </div>
        <div className="mt-0.5 flex items-stretch gap-[1px]" style={{ height: altoPx }}>
          {vals.slice(0, n).map((v, i) => (
            <div
              key={i}
              className="relative flex min-w-0 flex-1 flex-col justify-end"
              title={`${horaPlanta(t0 + i * 60_000)} · ${nombre}: ${v}${esperado != null ? ` / ${esperado}` : ''} pz`}
            >
              <div
                className={`w-full rounded-t-[3px] border ${claseDe(v, esperado)}`}
                style={{ height: `${Math.max(v > 0 ? 8 : 2, (v / tope) * 100)}%` }}
              />
              {conNumeros && v > 0 && (
                <b className={`pointer-events-none absolute inset-x-0 bottom-0 text-center text-[10px] font-semibold tabular-nums ${claseDe(v, esperado).split(' ').pop()}`}>
                  {v}
                </b>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div ref={medidorRef} className="mt-3 border-t border-border/50 pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-caption text-muted-foreground">
        <span>
          Velocidad minuto a minuto
          <span className="text-muted-foreground/70"> · piezas contadas por Shoplogix</span>
        </span>
        <span className="text-muted-foreground/70">
          {cerrado ? 'turno cerrado' : `hasta las ${horaPlanta(t0 + n * 60_000)}`}
        </span>
      </div>
      <div {...zg.props} className="relative mt-1 -mx-1 overflow-x-auto px-1">
        <div className="relative" style={{ width: `${zg.zoom * 100}%` }}>
          {/* Guías verticales de las horas, atrás de todas las franjas. */}
          {marcas.map((i) => (
            <span
              key={`g${i}`}
              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/10"
              style={{ left: `${((i + 0.5) / n) * 100}%` }}
            />
          ))}
          {franja(
            datos.maquinas.length > 1 ? 'Línea (las ' + datos.maquinas.length + ' suman)' : 'Línea',
            esperadoLinea, suma, 64,
          )}
          {datos.maquinas.length > 1 && datos.maquinas.map((m) =>
            franja(nombreCorto(m.nombre), m.esperado, m.cycles, 48))}
          <div className="relative mt-0.5 h-4 text-[10px] tabular-nums text-muted-foreground/80">
            {/* Los extremos van pegados a los bordes VISIBLES (sticky), no a
                los del contenido ensanchado; las marcas del medio, por índice.
                Cerca de un extremo la marca se omite para no montarse. */}
            {marcas
              .filter((i) => {
                const x = ((i + 0.5) / n) * 100
                return x > 6 && x < 94
              })
              .map((i) => (
                <span key={`m${i}`} className="absolute -translate-x-1/2" style={{ left: `${((i + 0.5) / n) * 100}%` }}>
                  {horaPlanta(t0 + i * 60_000)}
                </span>
              ))}
          </div>
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
        <span>
          cada barra es un minuto — verde ≥75% del esperado, ámbar 50–75%, rojo &lt;50%
        </span>
        {zg.acercado ? (
          <button type="button" onClick={zg.verTodo} className="tap-44 underline decoration-dotted underline-offset-2">
            ver todo el turno
          </button>
        ) : (
          <span className="shrink-0">pellizcá o rodá (ctrl+rueda) para acercar</span>
        )}
      </div>
    </div>
  )
}

function ReglaDeRitmo({ ahora, ahoraReloj, pedido, turno, setCpm, techoDemostrado, onEditarSetPoint, cerrado, contexto, chispa, corteMs, ahoraWallMs, pulso, vivo, maquinas, parada, serieLinea, seriesMaquinas, barras }: {
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
  /**
   * El ritmo ANDANDO que hay que sostener para llegar a la meta. Es la marca
   * de la regla: dinámico, sube si el turno se atrasa. null cuando no se sabe
   * a qué hora cierra —sin cierre no hay objetivo que calcular—, y ahí la
   * marca vuelve a ser el promedio del turno.
   */
  pedido?: number | null
  /** Promedio del turno cuando la línea produce: la marca de la regla. */
  turno: number | null
  /** Velocidad de la máquina: el final de la regla. */
  setCpm: number | null | undefined
  /**
   * Lo que esta línea demostró que puede: el mejor ritmo andando de los turnos
   * anteriores del mismo tipo. Se usa como techo cuando no hay set point —esta
   * línea, con tres Baader, no tiene uno— para poder decir cuándo el ritmo que
   * pide la meta ya no es alcanzable.
   */
  techoDemostrado?: number | null
  /** Cada máquina de la línea, con su ritmo: pedido de Orel (26-08). */
  maquinas?: RitmosPorMaquina | null
  /**
   * La línea NO está produciendo ahora mismo (colación o paro).
   *
   * ⚠⚠ Sin esto el número grande MENTÍA: la media móvil corta la cola de ceros
   * —para que la curva no se desplome al terminar el turno— así que con la
   * línea parada a mitad de turno seguía mostrando el ritmo de ANTES de parar.
   * El 26-08, con las tres Baader detenidas desde las 01:34, la tarjeta decía
   * "25,3 pz/min andando · Últimos 15 min hasta las 01:55" mientras el pulso
   * marcaba 0,0. Los últimos tres tramos eran 0, 0 y 0.
   */
  parada?: {
    desdeHace: string | null
    /** «15:09» — la hora de planta en que empezó, para decir «desde las…». */
    desdeHora: string | null
    motivo: string | null
    /** Colación / detención programada / fin de turno: se pinta neutral, no
        roja — una parada pactada no es una alarma, y pintarla de rojo es lo
        que hace que la gente deje de creerle al rojo. */
    programada: boolean
  } | null
  onEditarSetPoint?: () => void
  cerrado?: boolean
  /** Cómo viene el turno contra los anteriores: el dato que traía la tarjeta
      vieja y que sin esto se perdería. Texto, no una cifra más. */
  contexto?: string | null
  /** El sparkline de los turnos previos, si hay historia. */
  chispa?: React.ReactNode
  /** Fin del último tramo cerrado: hasta cuándo describe el número grande. */
  corteMs?: number | null
  /** Hora de planta de ahora, para saber si el número sigue siendo del presente. */
  ahoraWallMs?: number | null
  /** Ritmo casi instantáneo (~4 min) que ya calcula el backend. */
  pulso?: { cpm?: number | null; at?: string | null } | null
  /**
   * El ritmo VIVO elegido por `pulsoVivo`: el cpm fresco o, en los silencios
   * cortos del contador, el último vivo arrastrado (marcado `recalibrando`).
   * La tarjeta muestra ESTE como «Ahora» — la media de 15 min queda solo
   * para cuando ni siquiera hay un vivo reciente (pedido de Orel, 29-08:
   * «quiero la realidad del ahora, no la media»).
   */
  vivo?: PulsoVivoElegido | null
  /** La serie de la línea (la misma de los gráficos), para el eje de tiempo
      de las curvas por máquina. */
  serieLinea?: readonly TramoSerie[] | null
  /** Piezas por bucket de cada máquina, alineadas a `serieLinea`. Solo llega
      cuando el doc ya trae el desglose (docs nuevos). */
  seriesMaquinas?: { nombre: string; serie: number[]; targetCpm?: number | null }[] | null
  /** La serie minuto a minuto del pulso (dato duro). Con esto presente, las
      barras reemplazan a las curvas de 5 min. */
  barras?: BarrasMinutoDatos | null
}) {
  /*
   * ⚠ El estado se juzga contra el OBJETIVO cuando se conoce, no contra la
   * máquina: «va lento» comparando con el set point decía que la línea no está
   * a tope, que casi siempre es cierto y no ayuda a decidir. Lo que importa es
   * si el ritmo alcanza para la cuota (pedido de Orel, 17-08). Sin objetivo
   * —turno sin hora de cierre— se cae al set point, que es la única vara que
   * queda.
   */
  const frescura = frescuraDelRitmo(corteMs, ahoraWallMs)
  const vara = pedido && pedido > 0 ? pedido : setCpm
  const estado = estadoRitmo(ahora, vara)
  /* La ESCALA de la regla: el set point si existe y, si no, el TECHO
     DEMOSTRADO — el mejor ritmo andando de los últimos turnos. Antes, sin
     set point (Eviscerado no tiene uno de línea), `fraccionDeRegla` caía al
     propio ritmo como tope y la barra vivía SIEMPRE llena: solo cambiaba de
     color, no informaba nada (Orel, ronda de pulido del 27-08). */
  const techoDeLaLinea = setCpm != null && setCpm > 0 ? setCpm : (techoDemostrado ?? null)
  const fr = fraccionDeRegla(ahora, techoDeLaLinea)
  const frTurno = fraccionDeRegla(turno, techoDeLaLinea)
  const frPedido = fraccionDeRegla(pedido ?? null, techoDeLaLinea)
  const pedidoImposible = pedidoFueraDeAlcance(pedido, techoDeLaLinea)
  /* El estado SIEMPRE se dice con palabra además de color: en planta hay
     pantallas quemadas por el sol y gente que no distingue rojo de verde. */
  const palabra = cerrado
    ? 'al cierre'
    : pedido && pedido > 0
      ? estado === 'ok' ? 'alcanza la meta' : estado === 'lento' ? 'falta ritmo' : 'muy por debajo'
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

      {/* ── Los DOS números, gemelos (rediseño Orel 26-08, opción B) ─────────
          «¿cómo va ahora?» y «¿cómo fue el turno?» son preguntas distintas y
          cada una tiene su cifra con rótulo propio. Con la línea parada o el
          turno cerrado, AHORA es 0,0 de verdad — el ritmo viejo pasa a
          referencia («venía a…») en el bloque de causa, no al número grande. */}
      {/* OJO — UNA sola verdad para «Ahora» (Orel, noche del 26-08): había un 5,6
          grande (media de 15 min sobre tramos cerrados, corre atrás del reloj)
          y un chip «12,0 ahora mismo» (el PULSO del contador vivo) a tres
          centímetros. El grande ES el pulso cuando está fresco — el mismo
          número de la pantalla de planta — y la media de 15 min pasa a
          contexto. Sin pulso (contador caído), se cae a la media con su
          etiqueta honesta. */}
      <div className="mt-1.5 flex items-end gap-x-3">
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">Ahora</div>
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-[42px] font-semibold leading-none tabular-nums text-foreground">
              {parada || cerrado ? '0,0'
                : vivo != null ? fmtDec(vivo.cpm)
                : ahora != null ? fmtDec(ahora) : '—'}
            </span>
            <span className="text-[15px] text-muted-foreground">pz/min</span>
          </div>
        </div>
        {/* La media de 15 min SUBE a esta fila (Orel, 26-08): escondida en la
            letra chica del renglón de estado era «otro número más» sin
            jerarquía. Acá queda al lado del promedio, cada una con su rótulo,
            y la diferencia entre ambas se explica una sola vez abajo. Solo
            aparece cuando el número grande es el pulso — sin pulso, el grande
            YA ES la media y repetirla sería el tercer «ahora». */}
        <div className="ml-auto shrink-0 space-y-0.5 text-right">
          {!parada && !cerrado && vivo != null && ahora != null && (
            <div className="flex items-baseline justify-end gap-x-1.5">
              <span className="text-caption text-muted-foreground">media 15 min</span>
              <span className="text-headline tabular-nums text-foreground">{fmtDec(ahora)}</span>
              <span className="text-caption text-muted-foreground">pz/min</span>
            </div>
          )}
          <div className="flex items-baseline justify-end gap-x-1.5">
            <span className="text-caption text-muted-foreground">promedio turno</span>
            <span className="text-headline tabular-nums text-foreground">
              {turno != null ? fmtDec(turno) : '—'}
            </span>
            <span className="text-caption text-muted-foreground">pz/min</span>
          </div>
        </div>
      </div>

      {/* El renglón de estado del número de AHORA. Solo con la línea andando:
          parada y cierre tienen su bloque propio abajo. */}
      {!parada && !cerrado && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
          {vivo != null ? (
            <>
              <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
                <span className="inline-block size-1.5 rounded-full bg-ink-ok" />
                ahora mismo
                <span className="tabular-nums text-muted-foreground">
                  · {new Date(vivo.at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
              </span>
              {/* Con el vivo arrastrado la hora de arriba YA es la del dato:
                  acá solo se dice POR QUÉ no hay uno más nuevo. */}
              {vivo.recalibrando
                ? <span className="text-muted-foreground/80">contador recalibrando — último ritmo vivo</span>
                : <span className="text-muted-foreground/80">el contador de la pantalla de planta</span>}
              <CuentaAtrasPulso at={pulso?.at} />
              {/* El número de la media ya vive arriba, con rótulo. Acá queda
                  solo el VEREDICTO (que se juzga sobre esa media, no sobre el
                  pulso: el pulso salta demasiado para sentenciar). */}
              {ahora != null && (
                <span className={`inline-flex items-center gap-1 ${colorPunto}`}>
                  <span className="inline-block size-1.5 rounded-full bg-current" />
                  {palabra}
                </span>
              )}
            </>
          ) : frescura?.viejo ? (
            /* Si hace rato que no llega un tramo, el número deja de ser «de
               ahora»: ver `frescuraDelRitmo`. */
            <>
              <span className="inline-flex items-center gap-1 font-medium">
                <span className="inline-block size-1.5 rounded-full bg-current" />
                sin datos nuevos
              </span>
              <span className="text-muted-foreground/80">
                último dato, hace {Math.round(frescura.haceMin)} min
              </span>
            </>
          ) : (
            <>
              {ahora != null && (
                <span className={`inline-flex items-center gap-1 font-medium ${colorPunto}`}>
                  <span className="inline-block size-1.5 rounded-full bg-current" />
                  {palabra}
                </span>
              )}
              <span className="text-muted-foreground/80">andando, últimos 15 min</span>
            </>
          )}
        </p>
      )}

      {/* Qué expresa cada cifra, dicho UNA vez (pedido de Orel, 26-08: tres
          ritmos sin explicación se leían como contradicción). */}
      {!parada && !cerrado && vivo != null && ahora != null && (
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">
          <b className="text-muted-foreground">Ahora</b> salta con la línea;{' '}
          la <b className="text-muted-foreground">media 15 min</b> es el ritmo sostenido reciente
          (solo minutos andando); el <b className="text-muted-foreground">promedio</b> es todo el
          turno con esa misma vara.
        </p>
      )}

      {/* ── La causa, con techo propio ───────────────────────────────────────
          Qué la tiene en 0,0 y desde cuándo. Programada (colación, fin de
          turno) va NEUTRAL; solo el paro no pactado va rojo. */}
      {(parada || cerrado) && (
        <div className="mt-2 rounded-ctl bg-muted px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-foreground">
            <Pill tone={parada && !parada.programada && !cerrado ? 'critical' : 'neutral'} dot>
              {parada?.motivo ?? 'Turno terminado'}
            </Pill>
            {parada?.desdeHora && (
              <span className="tabular-nums">desde las {parada.desdeHora}</span>
            )}
          </div>
          <p className="mt-1 text-caption text-muted-foreground/80">
            {cerrado ? 'Fin de turno. ' : parada?.desdeHace ? `Sin producir hace ${parada.desdeHace}. ` : ''}
            {ahora != null && ahora > 0 && (
              <>Venía a <span className="tabular-nums text-foreground/80">{fmtDec(ahora)}</span> pz/min
              los últimos 15 min corriendo.</>
            )}
          </p>
        </div>
      )}
      {/* ── La regla ──────────────────────────────────────────────────────
          0 → set point (o el techo demostrado si la línea no tiene uno). El
          relleno es la media 15 andando, la marca es la meta (o el promedio)
          y el final es lo que la línea puede dar. */}
      <div className="mt-3">
        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted">
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${colorRelleno} transition-[width] duration-300 motion-reduce:transition-none`}
            style={{ width: `${Math.max(fr * 100, ahora != null && ahora > 0 ? 2 : 0)}%` }}
          />
          {/* La marca es el OBJETIVO: dónde tendría que estar el relleno para
              llegar a la cuota. Que el relleno la pase o no la alcance ES la
              respuesta, sin leer un número. */}
          {pedido != null && pedido > 0 && techoDeLaLinea != null && techoDeLaLinea > 0 && (
            <span
              className={`absolute inset-y-0 w-0.5 ${pedidoImposible ? 'bg-foreground/30' : 'bg-foreground'}`}
              style={{ left: `${frPedido * 100}%` }}
              title={pedidoImposible
                ? `La meta exigiría ${fmtDec(pedido)} pz/min andando, por encima del techo de la línea (${fmtDec(techoDeLaLinea ?? 0)})`
                : `Para la meta hay que ir a ${fmtDec(pedido)} pz/min andando`}
            />
          )}
          {/* Sin objetivo conocido, la referencia posible es el promedio del turno. */}
          {(pedido == null || pedido <= 0) && turno != null && turno > 0 && techoDeLaLinea != null && techoDeLaLinea > 0 && (
            <span
              className="absolute inset-y-0 w-0.5 bg-foreground/45"
              style={{ left: `${frTurno * 100}%` }}
              title={`Promedio del turno: ${fmtDec(turno)} pz/min`}
            />
          )}
        </div>
        <div className="mt-1 flex items-baseline justify-between text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {pedido != null && pedido > 0
              ? (pedidoImposible
                  /* Un numero que la linea no puede dar no es una meta: es
                     ruido. La pantalla ya dice arriba que no da el tiempo. */
                  ? <span title={`Haria falta ir a ${fmtDec(pedido)} pz/min andando`}>la meta ya no alcanza</span>
                  : <>para la meta <b className="font-semibold text-foreground">{fmtDec(pedido)}</b></>)
              : turno != null
                /* «línea» y no «promedio del turno»: tres centímetros más
                   arriba hay un «promedio 10,9» que es el promedio POR MÁQUINA,
                   y los dos rótulos parecidos con cifras distintas se leían
                   como un error de la app. Cerrado, el verbo va en pasado. */
                ? cerrado
                  ? <>el turno cerró en <b className="font-semibold text-foreground/80">{fmtDec(turno)}</b></>
                  : <>línea, todo el turno <b className="font-semibold text-foreground/80">{fmtDec(turno)}</b></>
                : 'línea, todo el turno —'}
          </span>
          {/* La etiqueta del techo ES el control: a 375 px no cabe un lápiz
              extra sin pisarla. Sin set point, el final de la barra es el
              TECHO DEMOSTRADO y se rotula como tal. */}
          {setCpm != null && setCpm > 0 ? (
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
          ) : techoDemostrado != null && techoDemostrado > 0 ? (
            <span
              className="tabular-nums"
              title="El mejor ritmo andando de los últimos turnos de este nombre — lo que la línea demostró que puede."
            >
              techo {fmtDec(techoDemostrado)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Cada máquina, como lista con barra de marcha ─────────────────────
          El número que hay que mirar es casi el mismo en las tres, así que el
          LARGO de la barra es el uptime, no la velocidad: el ojo ve de una
          cuál paró, que es exactamente la pregunta de Mantención. NO se
          muestra la suma: las máquinas no andan en los mismos minutos y sumar
          sus ritmos da un número que la línea nunca alcanza (44,2 vs 34,9). */}
      {/* ── Cada máquina: dos columnas que SUMAN las de arriba ────────────────
          Propuesta de Orel (26-08): a la izquierda el «ahora» de cada Baader
          —que sume el de la línea— y a la derecha su promedio —que sume el
          promedio de la línea—. La trampa era el denominador: el «mientras
          anduvo» de cada una NO suma (44,2 vs 34,9, ver `ritmoPorMaquina`).
          Las columnas que SÍ cierran son el reparto de la media de 15 min
          (`repartoAhoraAndando`) y el aporte al promedio (piezas ÷ minutos
          produciendo de la línea). El «mientras anduvo» no se pierde: queda en
          el globito de cada fila y, sobre todo, en las curvas de abajo. */}
      {maquinas && maquinas.maquinas.length > 1 && (() => {
        /* La columna izquierda, por prioridad (Orel, 27-08): el AHORA real de
           cada máquina —el pulso del contador, que por construcción SUMA el
           «Ahora» grande—, y solo si el desglose del pulso no está, la media
           de 15 min (que suma la media de arriba). Dos varas posibles, nunca
           las dos: cada una con su rótulo. */
        const conPulsoMaq = !parada && !cerrado && vivo != null
          && maquinas.maquinas.every((m) => m.pulsoCpm != null)
        const conReparto = !conPulsoMaq && !parada && !cerrado
          && maquinas.maquinas.every((m) => m.ahoraCpm != null)
        const conAporte = maquinas.maquinas.every((m) => m.aporteCpm != null)
        return (
          <div className="mt-3 border-t border-border/50 pt-2.5">
            <div className="flex items-baseline justify-between gap-2 text-caption text-muted-foreground">
              <span>
                Cada máquina
                {conPulsoMaq && <> · <b className="font-semibold text-foreground/80">ahora</b></>}
                {conReparto && <> · <b className="font-semibold text-foreground/80">media 15 min</b></>}
              </span>
              <b className="font-semibold text-foreground/80">
                {conAporte ? 'aporte al promedio' : 'promedio andando'}
              </b>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {maquinas.maquinas.map((m) => {
                const pct = m.uptimePct
                const color = pct == null ? 'bg-muted-foreground/40'
                  : pct >= 75 ? 'bg-ink-ok' : pct >= 50 ? 'bg-ink-warn' : 'bg-ink-crit'
                return (
                  <div
                    key={m.nombre}
                    className="flex items-center gap-2"
                    title={`${m.nombre}: ${fmtInt(m.piezas)} pz · mientras anduvo ${fmtDec(m.cpm)} pz/min · ${pct != null ? `${Math.round(pct)}% del turno andando` : 'sin uptime'}`}
                  >
                    <span className="w-9 shrink-0 text-footnote text-muted-foreground">{nombreCorto(m.nombre)}</span>
                    {(conPulsoMaq || conReparto) && (
                      <span className="w-11 shrink-0 text-headline tabular-nums text-foreground">
                        {fmtDec((conPulsoMaq ? m.pulsoCpm : m.ahoraCpm) ?? 0)}
                      </span>
                    )}
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      {pct != null && (
                        <span
                          className={`block h-full rounded-full ${color}`}
                          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                        />
                      )}
                    </span>
                    <span className="w-11 shrink-0 text-right text-headline tabular-nums text-foreground">
                      {conAporte ? fmtDec(m.aporteCpm ?? 0) : fmtDec(m.cpm)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-1.5 text-caption leading-snug text-muted-foreground/80">
              {conPulsoMaq && <>Izquierda: el <b>ahora</b> de cada una, del mismo contador — las tres suman el «Ahora» de arriba. </>}
              {conReparto && <>Izquierda: lo que cada una pone en la <b>media 15 min</b> — las tres suman la de arriba. </>}
              {conAporte
                ? <>Derecha: su aporte al <b>promedio del turno</b> — suman el promedio de la línea. </>
                : <>Derecha: su ritmo promedio mientras anduvo. </>}
              La barra es el % del turno que estuvo andando.
            </p>
            {fraseMaquinas(maquinas) !== '' && (
              <p className="mt-1 text-caption leading-snug text-muted-foreground/80">
                {fraseMaquinas(maquinas)}
              </p>
            )}
          </div>
        )
      })()}

      {/* Las barras minuto a minuto (dato duro de Shoplogix) cuando el pulso
          publica la serie; si no, las curvas de 5 min de siempre (turnos
          pasados y docs sin la serie). */}
      {barras && <BarrasMinuto datos={barras} cerrado={cerrado} />}
      {/* Las curvas de velocidad de cada máquina, como en el detalle de turno
          (pedido de Orel, 26-08): acá se ve QUIÉN bajó la línea y cuándo, no
          solo cuánto. Solo con docs nuevos (los viejos no traen el desglose). */}
      {!barras && serieLinea && serieLinea.length > 1 && seriesMaquinas && seriesMaquinas.length > 1 && (
        <CurvasMaquinas
          serie={serieLinea}
          maquinas={seriesMaquinas}
          /* El punto vivo SOLO con el pulso fresco y completo — la misma
             condición de la columna «ahora», para que gráfico y columna
             digan lo mismo. */
          ahoraPorNombre={
            !parada && !cerrado && vivo != null
            && maquinas != null && maquinas.maquinas.every((m) => m.pulsoCpm != null)
              ? new Map(maquinas.maquinas.map((m) => [m.nombre, m.pulsoCpm!]))
              : null
          }
          ahoraAt={vivo?.at ?? null}
        />
      )}

      {/* La hora de corte. El número grande describe los últimos 15 min, pero
          un tramo no existe hasta que cierra: sin decir hasta cuándo, quien lo
          mira no sabe si la línea bajó o si todavía no llega el dato.

          OJO: `corteMs` sale de la serie, que viene en HORA DE PLANTA sellada
          como UTC. Formatearla con el reloj del que mira le restaba las 4 h
          del huso: a las 06:51 la línea decía "hasta las 02:50". Va con
          `horaPlanta`, igual que el resto de las horas de la serie. */}
      {ahora != null && corteMs != null && !parada && !cerrado && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Últimos 15 min · hasta las <span className="tabular-nums">{horaPlanta(corteMs)}</span>
        </p>
      )}

      {/* El pulso, en otra jerarquía a propósito: responde otra pregunta («¿está
          andando AHORA?») y con el mismo peso visual competiría con el número
          de decidir. Solo aparece si el backend publicó un ritmo — cuando el
          contador salta o no llega, `cpm` viene null y acá no se muestra nada
          en vez de mentir con un cero. */}
      {/* OJO: el pulso es el latido de AHORA. Mirando un turno CERRADO de ayer
          seguía apareciendo con la hora del reloj actual: «0,0 · ahora mismo ·
          05:15» debajo de un turno que terminó a las 16:05 del día anterior,
          pegado a «Últimos 15 min · hasta las 16:05». Dos horas contradictorias
          a un centímetro. En un turno cerrado no hay «ahora mismo». */}
      {/* El chip del pulso se fue: el número grande de «Ahora» YA ES el pulso
          cuando está fresco. Dos «ahora» a tres centímetros era exactamente la
          contradicción que este monitor viene cerrando (Orel, 26-08). */}

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

      {/* El histórico, con la conclusión ANTES que el dibujo (rediseño 26-08):
          86 px de gráfico y 11 px de texto peleando el mismo renglón no ganaba
          ninguno. El veredicto va en 13 px porque ES la conclusión, no una nota
          al pie; el gráfico de abajo la confirma. */}
      {(contexto || chispa) && (
        <div className="mt-2.5 border-t border-border/50 pt-2.5">
          {contexto && (
            <p className="text-footnote leading-snug text-foreground">{contexto}</p>
          )}
          {/* QUÉ velocidad dibuja, escrito (pedido de Orel, 26-08): sin la
              etiqueta, el gráfico era «una velocidad» más entre varias. */}
          {chispa && (
            <p className="mt-1 text-caption text-muted-foreground/80">
              Ritmo promedio <b className="text-muted-foreground">andando</b> de cada turno, pz/min
              — la misma vara del «Promedio del turno» de arriba.
            </p>
          )}
          {chispa}
        </div>
      )}
    </section>
  )
}

/**
 * El control del PULSO: cuándo se leyó por última vez el contador de Shoplogix
 * y un botón para pedirlo ahora.
 *
 * ── Ya no muestra el número ────────────────────────────────────────────────
 * Lo mostraba, y el 2026-08-20 se vio el resultado: «Shoplogix marca 805 pz a
 * las 22:56» justo debajo de un «805 · datos hasta las 23:00». El mismo número
 * con dos horas distintas, porque venían de dos fuentes con distinto atraso.
 * Ahora el número grande YA ES el crudo de Shoplogix (ver `contadorCrudo`), así
 * que acá solo queda el control.
 *
 * ── Y ya no promete cuándo llega el próximo ────────────────────────────────
 * Tenía un cronómetro que suponía un ciclo fijo de 2 min desde la última
 * lectura. En la misma pantalla se leía «próxima lectura en 1:39» al lado de
 * «hay dato nuevo en 9s», que es lo que respondió el servidor al tocar el
 * botón. El servidor sabe; la cuenta local adivinaba. Se queda la del servidor,
 * que aparece cuando de verdad hay una respuesta.
 */
function PulsoVivo({ pulse, token, cerrado, onPulso }: {
  pulse: PulsoMonitor | null | undefined
  token: string
  cerrado?: boolean
  /** El pulso fresco sube a la página: el número grande sale de ahí. */
  onPulso: (p: PulsoMonitor) => void
}) {
  const [ahora, setAhora] = useState(() => Date.now())
  const [pidiendo, setPidiendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  /* El reloj corre solo mientras el turno está vivo: en uno cerrado el pulso
     no cambia y un cronómetro contando sería ruido. */
  useEffect(() => {
    if (cerrado) return
    const id = window.setInterval(() => setAhora(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [cerrado])

  /*
   * ⚠ Con el acumulado en 0 no se muestra nada. Visto al cerrar el turno de la
   * noche: el rollup de Shoplogix deja de contar el turno que terminó y
   * devuelve 0, y un control de refresco al lado de un turno ya cerrado no
   * tiene nada que refrescar.
   */
  if (cerrado || !pulse?.at || !(pulse.totalCycles > 0)) return null

  const edadSeg = Math.max(0, Math.round((ahora - Date.parse(pulse.at)) / 1000))
  const hace = edadSeg < 60
    ? 'recién'
    : `hace ${Math.floor(edadSeg / 60)} min`

  const pedir = async () => {
    setPidiendo(true); setAviso(null)
    const r = await refrescarPulso(token)
    setPidiendo(false)
    if (!r) { setAviso('No se pudo consultar ahora. Se reintenta solo.'); return }
    if (r.pulse) { onPulso(r.pulse); setAhora(Date.now()) }
    /* `yaFresco` NO es un error: es el dato más nuevo que existe. */
    if (r.yaFresco) setAviso(`Ya es lo último que hay${r.esperaSeg ? ` — hay dato nuevo en ${r.esperaSeg}s` : ''}.`)
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="tabular-nums text-muted-foreground/80">
        Leído de Shoplogix {hace}
      </span>
      <CuentaAtrasPulso at={pulse.at} />
      <button
        type="button"
        onClick={pedir}
        disabled={pidiendo}
        className="tap-44 rounded-full border border-border px-2 py-0.5 text-brand-ink disabled:opacity-50"
      >
        {pidiendo ? 'consultando…' : 'actualizar ahora'}
      </button>
      {aviso && <span className="w-full text-muted-foreground/80">{aviso}</span>}
    </div>
  )
}

function StatusPill({ live, sinDatosHaceMin }: {
  live: PublicMonitorLive
  /**
   * Minutos sin un tramo nuevo. Corroborado con Shoplogix el 26-08: a las 16:34
   * el whiteboard devolvía las tres Evisceradoras asignadas al «Turno 1» de
   * 21:15→05:00 —el de noche, que aún no empezaba— con CERO estados, y el
   * último tramo con piezas era el de las 15:05. El estado «produciendo» de las
   * máquinas venía congelado desde las 14:48-14:59.
   *
   * Con el estado viejo, «Produciendo» en verde y con el punto latiendo es una
   * afirmación sobre el presente que nadie puede sostener — y si la línea SÍ
   * está corriendo, tampoco es cierta: significa que el dato no está llegando.
   * En los dos casos lo honesto es lo mismo.
   */
  sinDatosHaceMin?: number | null
}) {
  // El primitivo Pill de la piel: tonos MEDIDOS (texto 600 sobre 500 al 15%)
  // y el punto integrado — era exactamente lo que este componente imitaba a mano.
  const map = {
    produciendo: { label: 'Produciendo', tone: 'ok' as const },
    detenida:    { label: 'Detenida',    tone: 'critical' as const },
    'sin-datos': { label: 'Sin datos',   tone: 'neutral' as const },
  } as const

  const viejo = sinDatosHaceMin != null && sinDatosHaceMin >= MIN_PARA_VIEJO
  const x = viejo ? map['sin-datos'] : (map[live.status] ?? map['sin-datos'])
  // `pulse` solo con el turno VIVO produciendo: el punto que respira es la
  // señal de "en vivo" (§7); en un turno cerrado sería un parpadeo mentiroso.
  return (
    <Pill tone={x.tone} dot={!viejo && live.status === 'produciendo' && !live.shiftClosed ? 'pulse' : true}>
      {viejo ? `Sin datos hace ${Math.round(sinDatosHaceMin!)} min` : x.label}
    </Pill>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────

export function PublicShiftMonitorPage() {
  const { token } = useParams<{ token: string }>()
  const { isDark, toggleTheme } = useTheme()
  const [data, setData] = useState<PublicShiftMonitorDoc | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'gone' | 'sin-conexion'>('loading')
  /*
   * Cuota y peso RECIÉN guardados desde esta pantalla: el backend los publica
   * en el próximo refresco (~5 min) y mientras tanto la tarjeta no mostraba
   * nada — «guardé y no pasó nada» (Orel, con el turno noche vivo). Son solo
   * respaldo: en cuanto `live` trae el valor, gana el del backend.
   */
  const [cuotaLocal, setCuotaLocal] = useState<number | null>(null)
  /* Tri-estado: `undefined` = sin gesto local (manda el doc), `null` = el
     admin QUITÓ el peso, número = recién guardado. Sin el tercer estado, el
     quitar no se reflejaba hasta el sync. */
  const [pesoLocal, setPesoLocal] = useState<number | null | undefined>(undefined)
  /* Registros de peso recién ELIMINADOS (por su `at`): el doc tarda en
     refrescar y sin esto el ✕ parecía no hacer nada por ~15 s (Orel, 29-08). */
  const [pesosEliminados, setPesosEliminados] = useState<ReadonlySet<string>>(new Set())
  /* El historial de pesos, plegado por defecto (pedido de Orel, 29-08). */
  const [verPesos, setVerPesos] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /* Los `t` de la serie son wall-clock sellados como UTC; para compararlos con
     el reloj hay que llevar "ahora" a esa misma base (igual que `fmtAgoWall`). */
  const ahoraWallMs = useMemo(() => now - new Date(now).getTimezoneOffset() * 60_000, [now])


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
      /* Un error del stream NO es un link muerto: con la señal caída en planta
         se pintaba «pedí uno nuevo a Mantención» sobre un link perfecto. Ver
         `estadoDelLink`. */
      (err) => setStatus(estadoDelLink(err)),
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
  /** Series por máquina, recortadas igual que `serieDelTurno`: el backend las
      publica alineadas 1:1 con `live.series` y `desdePrimeraPieza` corta el
      frente, así que acá se corta lo mismo para que los índices sigan calzando.
      null con docs anteriores al despliegue que publica el desglose. */
  const seriesMaquinas = useMemo(() => {
    const ms = live?.machines ?? []
    const total = live?.series?.length ?? 0
    if (ms.length < 2 || total === 0) return null
    if (!ms.every((m) => Array.isArray(m.serie) && m.serie.length === total)) return null
    const offset = total - serieDelTurno.length
    return ms.map((m) => ({
      nombre: m.name,
      serie: (m.serie as number[]).slice(offset),
      targetCpm: m.targetCpm ?? null,
    }))
  }, [live?.machines, live?.series, serieDelTurno])
  /** El arranque que se anuncia: la primera pieza, con el declarado de respaldo. */
  const inicioReal = serieDelTurno[0]?.t ?? live?.scheduledStart

  const esActual = idx === 0

  /*
   * Un turno que NO es el vigente está cerrado, se haya sellado o no.
   *
   * Medido en el historial publicado: de 6 turnos cacheados, `2026-08-24_Turno
   * 1` quedó con `shiftClosed: false` y `status: 'produciendo'` — el snapshot
   * se tomó con el turno corriendo y nunca se re-selló al cerrar. Resultado: al
   * deslizar a ese turno de anteayer la cabecera decía **Produciendo** con el
   * punto latiendo, aparecía el pulso vivo («0,0 · ahora mismo · 05:17» bajo un
   * turno que terminó el lunes) y se calculaba «hora extra» contra el reloj de
   * hoy.
   *
   * No se arregla esperando que el cache se rearme: si estás mirando un turno
   * anterior, ese turno terminó. Es verdad por construcción.
   */
  const turnoCerrado = Boolean(live?.shiftClosed) || !esActual

  /* Supervisor logueado mirando el monitor: puede editar el set point inline
     (mismo patrón que el «Cambiar» del cierre). Las reglas de Firestore son la
     defensa real; esto solo decide si se muestra el botón. */
  const esAdminMonitor = useIsAdmin()
  /* Envío manual del informe de fin de turno.
     El botón solo se MUESTRA a un admin y solo tras confirmar la contraseña;
     quien decide de verdad es la Cloud Function, que revalida el rol contra
     `users`. Un monitor abierto en un tablet de planta no tiene sesión, así que
     no ve el botón. */
  const [pidiendoClave, setPidiendoClave] = useState(false)
  const [enviandoInforme, setEnviandoInforme] = useState(false)
  const [avisoInforme, setAvisoInforme] = useState<string | null>(null)

  const enviarInforme = async () => {
    // `data` puede ser null mientras carga; el botón solo existe cuando ya hay
    // turno en pantalla, pero el tipo no lo sabe.
    if (!data) return
    setEnviandoInforme(true)
    setAvisoInforme(null)
    try {
      const fn = httpsCallable<{ plant: string; shiftDocId: string }, { enviado: boolean; motivo?: string }>(
        getFunctions(undefined, 'us-central1'), 'enviarInformeTurnoManual',
      )
      const { data: r } = await fn({ plant: data.plantSlug, shiftDocId: data.shiftDocId })
      setAvisoInforme(r.enviado ? 'Informe enviado a Telegram.' : `No se envió: ${r.motivo}`)
    } catch (e) {
      setAvisoInforme(e instanceof Error ? e.message : 'No se pudo enviar el informe.')
    } finally {
      setEnviandoInforme(false)
    }
  }
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

  /*
   * La meta del héroe: la del link si la trajo, si no la de la config del
   * módulo — que es donde escribe el editor de cuota. Con solo `targetPieces`,
   * una cuota puesta desde el monitor no movía la barra.
   */
  const metaHero = data?.targetPieces ?? live?.quotaPieces ?? cuotaLocal ?? null
  /* Con el MISMO contador del héroe, no con los tramos cerrados: a las 09:00
     el héroe decía 3.097 (pulso) y el chip 14% (2.800 de buckets, 8 min
     atrás) — 15,5% real. El mismo descuadre de «dos totales» que #819 cerró
     en el comparador, sobreviviendo en la barra de meta (visto en la
     auditoría en vivo del 27-08). */
  const progressPct = useMemo(() => {
    if (!live || !metaHero) return null
    const total = elegirContador({ pulse: data?.pulse, live, shiftClosed: live.shiftClosed }).valor
    return Math.min(100, (total / metaHero) * 100)
  }, [live, metaHero, data?.pulse])

  // Al cambiar de turno (rollover del modo línea), lo recién guardado ya no
  // aplica: la cuota y el peso son POR TURNO.
  useEffect(() => {
    setCuotaLocal(null)
    setPesoLocal(undefined)
    setPesosEliminados(new Set())
  }, [data?.shiftDocId])

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
        /* Cada evento es la parada de UNA máquina y el ritmo sale de la LÍNEA:
           sin esto, en Chonchi (3 Baader) cada parada se cobraba tres veces. */
        maquinas: live?.machinesTotal,
      }),
    [live],
  )

  /**
   * Los eventos del turno agrupados por dueño de la pérdida, con el árbol
   * OFICIAL de imputación como juez (ver `monitorEventos`).
   */
  /*
   * El objetivo del turno cuando nadie cargo una cuota. NO se usa
   * `live.expectedPieces` crudo: se completa durante el turno y como meta en
   * vivo corre hacia arriba (15.821 -> 20.875 en la misma noche). El porque y
   * la medicion, en `objetivoDelTurno`.
   */
  const objetivoSensor = useMemo(
    () => objetivoDelTurno(live?.expectedPieces, data?.forecastHistory ?? []),
    [live?.expectedPieces, data?.forecastHistory],
  )
  const metaSensor = objetivoSensor?.piezas ?? null

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
        /* La ventana del turno: una parada que arranca antes del primer dato
           solo aporta lo que cae adentro. El caso medido, en
           `paradasDentroDelTurno.test.ts`. */
        ventana: {
          desdeMs: serieDelTurno[0]?.t ? Date.parse(serieDelTurno[0].t) : null,
          hastaMs: (() => {
            const ult = serieDelTurno[serieDelTurno.length - 1]?.t
            // El último punto abre su tramo de 5 min: la ventana llega a su fin.
            return ult ? Date.parse(ult) + 5 * 60_000 : null
          })(),
        },
      }),
    [live, costoParadas, serieDelTurno],
  )

  /*
   * Todas las paradas del turno, aplanadas y con su hora de planta. Ya están
   * agrupadas por dueño para la cascada; acá se las necesita sueltas para
   * cruzarlas con la hora que se hundió (ver `horaMasFloja`).
   */
  /* La hora que nombra la cuota acumulada; se topa en el cierre y se lee en
     hora de PLANTA. El porqué, en `horaDeLaCuota`. */
  /* Hace cuánto que no llega un tramo nuevo: lo usan el badge de estado, el
     número grande y la cuenta de hora extra. Ver `frescuraDelRitmo`. */
  /* Horario planificado contra el real: ver `ventanaDelTurno`. */
  const ventanaTurno = useMemo(() => ventanaDelTurno({
    scheduledStart: live?.scheduledStart,
    scheduledEnd: live?.scheduledEnd,
    realStart: inicioReal,
    realEnd: serieDelTurno.length
      ? new Date(Date.parse(serieDelTurno[serieDelTurno.length - 1]!.t) + 5 * 60_000).toISOString()
      : null,
  }), [live?.scheduledStart, live?.scheduledEnd, inicioReal, serieDelTurno])

  const sinDatosHaceMin = useMemo(() => {
    const ult = serieDelTurno[serieDelTurno.length - 1]?.t
    if (!ult) return null
    return frescuraDelRitmo(Date.parse(ult) + 5 * 60_000, ahoraWallMs)?.haceMin ?? null
  }, [serieDelTurno, ahoraWallMs])

  const horaDeCuota = useMemo(
    () => horaDeLaCuota(live?.plannedEnd, ahoraWallMs),
    [live?.plannedEnd, ahoraWallMs],
  )

  /*
   * ¿Este turno se quedó sin convenio registrado? Medido en el turno del
   * 25-08: 0 min contra los ~57 que traen 6 de los 8 turnos iguales. El porqué
   * importa, en `convenioFaltante`.
   */
  const sinConvenio = useMemo(
    () => convenioFaltante(live?.timeBreakdown?.plannedMin, data?.forecastHistory ?? []),
    [live?.timeBreakdown?.plannedMin, data?.forecastHistory],
  )

  const paradasDelTurno = useMemo<ParadaConHora[]>(
    () => (gruposEventos ?? []).flatMap((g) =>
      g.causas.flatMap((c) => c.paradas.map((p) => ({
        reason: c.reason, hora: p.hora, hasta: p.hasta, min: p.min,
      })))),
    [gruposEventos],
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
    /* ⚠⚠ `uptimeSec` es la SUMA de las máquinas: con las tres Baader de Planta
       Principal dividía por casi tres y la pantalla decía "la línea, andando,
       va a 13,9" cuando iba a 37,3. Los turnos anteriores con los que se
       compara siempre se calcularon sobre `producingMin`. Ver
       `ritmoAndandoDeLinea`. */
    const hoy = ritmoAndandoDeLinea({
      totalPieces: live?.totalPieces,
      tiempos: live?.timeBreakdown,
      uptimeSec: live?.uptimeSec,
      machinesTotal: live?.machinesTotal,
    })
    if (previos.length === 0) return { hoy, mediana: null, mejor: null, muestras: 0 }
    return {
      hoy,
      mediana: previos[Math.floor(previos.length / 2)]!,
      mejor: previos[previos.length - 1]!,
      muestras: previos.length,
    }
  }, [live?.uptimeSec, live?.totalPieces, live?.timeBreakdown, live?.machinesTotal, resumenesAnteriores])

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
      expectedPieces: metaSensor,
      /* El MISMO total que el héroe (contador vivo cuando responde): con
         `live.totalPieces` el «faltan 14.401» convivía con un héroe en 820 —
         dos totales a dos tarjetas de distancia (Orel, noche del 26-08). */
      producedPieces: elegirContador({
        pulse: data?.pulse ?? null,
        live,
        shiftClosed: live.shiftClosed,
      }).valor,
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
        : lineMaxPerHour(metaSensor, live.scheduledStart, live.plannedEnd),
      shiftClosed: live.shiftClosed,
      pendingBreakMin: Number.isNaN(t0) ? 0 : breakMinutesBetween(breaksTurno, desdeMin, hastaMin),
    })
  }, [live, data?.targetPieces, data?.pulse, now, breaksTurno, ritmoAndando, serieDelTurno, metaSensor])

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
    const meta = data?.targetPieces ?? live?.quotaPieces ?? metaSensor
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
      /* UNA sola verdad con el héroe: el contador vivo entra como último
         punto de la curva de hoy (ver la nota en buildDayComparison). Solo
         para el turno VIGENTE — mirando uno anterior no hay contador. */
      hoyVivo: (() => {
        if (!esActual || !live?.series?.length) return null
        const cont = elegirContador({ pulse: data?.pulse ?? null, live, shiftClosed: live.shiftClosed })
        const t0c = Date.parse(live.series[0]!.t)
        if (cont.fuente !== 'pulso' || cont.corteWallMs == null || Number.isNaN(t0c)) return null
        return { pieces: cont.valor, minute: (cont.corteWallMs - t0c) / 60_000 }
      })(),
    })
    // El turno VISTO entra en las dependencias: al navegar a otro turno la
    // comparación tiene que rearmarse contra los días previos a ESE.
  }, [live, inicioReal, vista?.dateKey, vista?.shiftId, data?.history, data?.targetPieces, breaksTurno, metaSensor, esActual, data?.pulse])

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
    const metaFc = data?.targetPieces ?? live?.quotaPieces ?? metaSensor
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
      /* La colación es tiempo planificado FUERA de proceso: ni la que ya pasó
         baja el ritmo ni la que falta suma piezas (regla de Orel, 26-08). */
      convenio: {
        transcurridoMin: live?.timeBreakdown?.plannedMin ?? 0,
        porDelanteMin: pace?.pendingBreakMin ?? 0,
      },
    })
  }, [live, data?.history, data?.forecastHistory, data?.targetPieces, comparacion.currentMinute, vista?.shiftId, pace?.pendingBreakMin, metaSensor])

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
  /*
   * Las toneladas estimadas. Shoplogix no manda kilos, así que salen del peso
   * promedio que alguien carga durante el turno; las reales llegan después por
   * el Excel del Grader. Se dicen SIEMPRE con "≈" y con el peso a la vista.
   */
  const toneladas = useMemo(() => {
    /* El OPTIMISTA gana: recién guardado un peso, el doc público tarda un
       sync (~5 min) en traerlo y con `live ?? local` la pantalla seguía
       mostrando el viejo — «cambié el peso a 4000 pero no hizo nada» (Orel,
       29-08, guardando dos veces por la duda). `pesoLocal` se resetea al
       cambiar de turno, así que no puede quedar pegado. */
    const pesoKg = Number(pesoLocal !== undefined ? pesoLocal : live?.pesoPromedioKg)
    if (!(pesoKg > 0) || !live?.totalPieces) return null
    /*
     * POR TRAMOS cuando hay historial (Orel, 28-08): el calibre cambia
     * durante el turno, y valorizar todo con el último peso pisa la historia
     * — cada registro rige desde su hora. Con un solo registro equivale al
     * cálculo plano; sin registros (docs viejos) se cae al plano.
     */
    /* Los recién eliminados se filtran YA (el ✕ optimista) y los dobles
       consecutivos se colapsan también acá — el doc puede traerlos hasta que
       el backend con dedupe rebuildee. */
    const registros = (live.pesoRegistros ?? [])
      .filter((r) => !r.at || !pesosEliminados.has(r.at))
      .filter((r, i, arr) => i === 0 || r.pesoKg !== arr[i - 1]!.pesoKg)
    const porTramos = toneladasPorTramos(live.series ?? [], registros)
    const ahoraT = porTramos?.total ?? toneladasDePiezas(live.totalPieces, pesoKg)
    if (ahoraT == null) return null
    /* La META en toneladas, con el peso VIGENTE: «≈ 16,4 t de ≈ 24 t» es la
       misma gramática que la meta en piezas (rediseño 26-08). */
    const metaPz = data?.targetPieces ?? live.quotaPieces ?? cuotaLocal ?? null
    const metaT = metaPz != null ? toneladasDePiezas(metaPz, pesoKg) : null
    return {
      ahora: ahoraT,
      meta: metaT,
      pesoKg,
      /* El desglose solo cuenta historia con 2+ pesos distintos. */
      tramos: porTramos && porTramos.tramos.length >= 2 ? porTramos.tramos : null,
    }
  }, [live?.pesoPromedioKg, live?.totalPieces, live?.quotaPieces, live?.series, live?.pesoRegistros, data?.targetPieces, pesoLocal, cuotaLocal, pesosEliminados])

  const onGuardarPeso = esAdminMonitor && esActual && data?.plantSlug && live?.shiftName
    ? async (pesoKg: number | null) => {
      await setPesoPromedio({
        plantSlug: data.plantSlug!,
        shiftName: live.shiftName!,
        pesoKg,
        por: usuarioActual?.email ?? null,
      })
      setPesoLocal(pesoKg)
    }
    : undefined

  /* Quitar UN registro del historial de pesos (Orel, 29-08): un dedo de más
     no puede quedar pegado en las toneladas del turno. */
  const onEliminarPeso = esAdminMonitor && esActual && data?.plantSlug && live?.shiftName
    ? async (at: string) => {
      await eliminarRegistroPeso({
        plantSlug: data.plantSlug!,
        shiftName: live.shiftName!,
        at,
      })
      /* Optimista: fuera de la pantalla YA — el doc tarda en refrescar. */
      setPesosEliminados((prev) => new Set([...prev, at]))
    }
    : undefined

  /*
   * La cuota, editable desde el HÉROE y no solo desde el bloque de ritmo:
   * ese bloque se apaga con el turno cerrado y dejaba a un admin sin ningún
   * lugar donde poner o corregir la meta (lo cazó Orel el 26-08 mirando el
   * turno recién cerrado). Mismo guardado que siempre: config del módulo,
   * solo admin, solo el turno vigente.
   */
  const onGuardarCuota = esAdminMonitor && esActual && data?.plantSlug && live?.shiftName
    ? async (piezas: number | null, origen?: { toneladas: number; pesoPromedioKg: number } | null) => {
      await setShiftQuota({
        plantSlug: data.plantSlug!,
        shiftName: live.shiftName!,
        piezas,
        por: usuarioActual?.email ?? null,
        origen: origen ?? null,
      })
      setCuotaLocal(piezas)
      if (origen?.pesoPromedioKg) setPesoLocal(origen.pesoPromedioKg)
    }
    : undefined

  /* Filete NO trabaja en toneladas (Orel, 27-08): ahí la cuota va directo en
     piezas y la pantalla no pide cargar peso promedio. Las demás plantas sí —
     producción habla en toneladas. */
  const usaToneladas = data?.plantSlug !== 'filete'

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
      // Lo que explica el número cuando gana el método proporcional.
      explicacion: pronostico.explicacion,
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

  /* La red se cayó pero el link sirve: se dice eso, y se ofrece reintentar.
     Si ya había datos en pantalla no se tapa nada — se sigue mostrando lo
     último leído, que es mejor que una pantalla vacía en medio del turno. */
  if (status === 'sin-conexion' && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <RefreshCw className="h-10 w-10 text-muted-foreground" />
        <p className="text-lg font-semibold text-foreground">Sin conexión con los datos</p>
        <p className="max-w-xs text-sm text-muted-foreground">
          El link sigue siendo válido: es la conexión la que no responde. Se reintenta solo;
          también podés recargar.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="tap-44 min-h-[44px] rounded-ctl border border-border px-4 text-[13px] font-medium hover:bg-muted"
        >
          Reintentar
        </button>
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

  /* El número grande: el contador crudo de Shoplogix, el mismo que muestra la
     pantalla de planta, con caída al derivado de los buckets cuando el vivo no
     está o quedó atrás. Ver `contadorCrudo` para por qué no es un `??`. */
  const contador = elegirContador({ pulse: data.pulse, live, shiftClosed: live.shiftClosed })
  const outside = contador.fuente === 'pulso' ? contador.fueraDelHorario : (live.outsidePieces ?? 0)

  /* La cascada del turno. Se mide contra los TRAMOS CERRADOS, no contra el
     contador vivo: los minutos de `timeBreakdown` salen de esa misma rejilla y
     mezclarlos haría que la suma no cierre. Declara su propio corte. */
  const cascada = construirCascada({ live, ritmoMaquina: setCpmVigente })

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
            {!turnoCerrado && <StatusPill live={live} sinDatosHaceMin={sinDatosHaceMin} />}
            {/* «Turno terminado 15:10»: el hecho y su hora, sin punto que
                respire (§7) — antes acá decía «Sin datos hace 146 min», que
                denuncia una falla de sync cuando lo que pasó es que el turno
                terminó. */}
            {turnoCerrado && (
              <Pill tone="neutral" dot>
                Turno terminado{live.effectiveEnd ? ` ${fmtWallTime(live.effectiveEnd)}` : ''}
              </Pill>
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
                return <span className="text-muted-foreground/80"> → {fmtDiaCorto(fin)}</span>
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
              /* Cerrado, el rango es el REAL (hasta la última pieza), no el
                 programado: «07:15–15:10» es lo que de verdad pasó. */
              <span className="tabular-nums">
                {fmtWallTime(inicioReal)}–{fmtWallTime(live.effectiveEnd ?? live.scheduledEnd)}
              </span>
            )}
            {/* Cerrado el turno vigente, la cabecera dice el próximo hecho que
                importa: a qué hora arranca el siguiente. Sale del historial de
                la línea (el arranque del otro turno con nombre distinto). */}
            {turnoCerrado && esActual && (() => {
              const actual = vista?.shiftId ?? data.shiftId
              const otro = (data.history ?? []).find(
                (h) => h.shiftId !== actual && h.live?.scheduledStart,
              )
              if (!otro) return null
              return (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="tabular-nums">próximo {fmtWallTime(otro.live.scheduledStart)}</span>
                </>
              )
            })()}
            {/* El horario REAL al lado del planificado, cuando se corrieron: el
                mismo «Turno 2» de Chonchi fue 09:15→17:00 el 24-08 y 07:15→15:00
                el 26-08. Con un solo rango, quien cruza el monitor con la
                pantalla de Shoplogix no sabe si mira lo mismo. Pedido de Orel.
                Ver `ventanaDelTurno`. Cerrado no se repite: el rango principal
                YA es el real. */}
            {!turnoCerrado && ventanaTurno?.real && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="tabular-nums text-muted-foreground/80">
                  real {ventanaTurno.real.desde}–{ventanaTurno.real.hasta}
                </span>
              </>
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
            <span className="text-[11px] text-muted-foreground/80">
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
            {/* Cerrado, la tarjeta cambia de pregunta: ya no es «cuántas van»
                sino «cómo quedó» — todo lo que cuelga de ella habla en pasado. */}
            {turnoCerrado ? 'Resultado del turno' : esActual ? 'Piezas procesadas en la jornada' : 'Piezas de ese turno'}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-5xl font-bold tabular-nums leading-none">{fmtInt(contador.valor)}</span>
            <span className="text-sm text-muted-foreground/80">piezas</span>
            {/* UNA sola hora de corte en toda la pantalla (pedido de Orel,
                13-ago y 20-ago). Antes acá decía «datos hasta las 23:00» por los
                buckets y el pie decía «Shoplogix marca ... a las 22:56» por el
                contador vivo: el mismo número con dos horas, que es la clase de
                contradicción que este monitor viene cerrando. Ahora el grande ES
                el crudo de Shoplogix y esta es SU hora. Solo con el turno VIVO:
                cerrado, el total ya es final. */}
            {!live.shiftClosed && contador.corteWallMs != null && (
              <span className="text-[12px] tabular-nums text-muted-foreground/80">
                {contador.fuente === 'pulso' ? 'Shoplogix, ' : 'datos hasta las '}
                {new Date(contador.corteWallMs).toISOString().slice(11, 16)}
              </span>
            )}
          </div>

          {/* La frase de RESULTADO, solo con el turno cerrado: el bloque de
              «faltan…» del turno vivo habla en futuro y acá ya no hay futuro
              del que hablar. «Faltaron», no «faltan» (pedido de Orel, 26-08). */}
          {turnoCerrado && (() => {
            const meta = data.targetPieces ?? live.quotaPieces
            if (meta == null || meta <= 0) return null
            const pct = Math.round((live.totalPieces / meta) * 100)
            return (
              <p className="mt-1.5 text-[15px] text-foreground">
                {live.totalPieces >= meta ? (
                  <>Meta cumplida: cerró con{' '}
                    <b className="tabular-nums">{fmtInt(live.totalPieces - meta)} pz</b> sobre la meta de{' '}
                    <span className="tabular-nums">{fmtInt(meta)}</span>.</>
                ) : (
                  <>Cerró con <b className="tabular-nums">{pct}%</b> de la meta — faltaron{' '}
                    <b className="tabular-nums">{fmtInt(meta - live.totalPieces)}</b> de{' '}
                    <span className="tabular-nums">{fmtInt(meta)}</span>.</>
                )}
              </p>
            )
          })()}

          {/* Las TONELADAS, que es lo que pide producción: "70 t", no piezas.
              Shoplogix no manda un solo kilo —cuenta ciclos— y las toneladas
              reales salen del Excel del Grader, que no es en vivo. Con el peso
              promedio cargado a mano se estiman acá, SIEMPRE dichas como
              estimación (≈), un escalón por debajo de las piezas —se estiman,
              no se miden— y con el peso que se usó a la vista. */}
          {toneladas && (
            <div className="mt-1.5">
              <p className="text-[15px] text-foreground">
                {turnoCerrado && 'Cerró con '}
                <span className="tabular-nums font-semibold">≈ {fmtDec(toneladas.ahora)} t</span>
                {toneladas.meta != null && (
                  <span
                    className="text-muted-foreground"
                    title={`Las ${fmtInt(pace?.targetPieces ?? 0) || 'piezas de la'} meta valorizadas al peso vigente — cambia si cambia el calibre.`}
                  >
                    {' '}de ≈ <span className="tabular-nums">{fmtDec(toneladas.meta)} t</span>
                  </span>
                )}
              </p>
              {/* La proporción como LLENADO, no como resta mental (Orel,
                  29-08). Mismo lenguaje de los instrumentos: fill --mon-hoy
                  sobre la pista estándar; la meta es el final de la barra. */}
              {toneladas.meta != null && toneladas.meta > 0 && (
                <div className="relative mt-1 h-2 rounded-full" style={{ background: PISTA_INSTRUMENTO }}>
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 motion-reduce:transition-none"
                    style={{
                      width: `${Math.min(100, (toneladas.ahora / toneladas.meta) * 100)}%`,
                      minWidth: 3,
                      background: 'var(--mon-hoy)',
                    }}
                    title={`≈ ${fmtDec(toneladas.ahora)} de ≈ ${fmtDec(toneladas.meta)} t (${Math.round((toneladas.ahora / toneladas.meta) * 100)}%)`}
                  />
                </div>
              )}
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                <span>
                  {toneladas.tramos ? 'peso vigente' : 'estimado con peso prom.'}{' '}
                  <span className="tabular-nums">{fmtInt(toneladas.pesoKg * 1000)} g</span> por pieza
                </span>
                {onGuardarPeso && <EditorPeso actual={toneladas.pesoKg} onGuardar={onGuardarPeso} />}
              </div>
              {/* El HISTORIAL del peso, cuantificado por tramo (Orel, 28-08):
                  el calibre cambia con la pesca y el lote, y cada registro
                  rige desde su hora — así las toneladas de arriba son la SUMA
                  de estos tramos, no todo valorizado al último peso. */}
              {/* Plegado por defecto (Orel, 29-08): el desglose es consulta,
                  no lectura de cada vistazo. El botón dice cuántos hay. */}
              {toneladas.tramos && (
                <button
                  type="button"
                  onClick={() => setVerPesos((v) => !v)}
                  aria-expanded={verPesos}
                  className="tap-44 mt-0.5 text-[11px] text-primary underline underline-offset-2"
                >
                  {verPesos ? 'ocultar historial de pesos' : `ver historial de pesos (${toneladas.tramos.length})`}
                </button>
              )}
              {toneladas.tramos && verPesos && (
                <div className="mt-1 space-y-0.5 text-[11px] tabular-nums text-muted-foreground/80">
                  {toneladas.tramos.map((tr, i) => (
                    <div key={tr.desdeWallMs} className="flex items-center gap-1.5">
                      <span>
                        {i === 0 ? 'desde el arranque' : `desde las ${horaPlanta(tr.desdeWallMs)}`}
                        {' · '}<span className="text-muted-foreground">{fmtInt(tr.pesoKg * 1000)} g</span>
                        {' → '}{fmtInt(tr.piezas)} pz ≈{' '}
                        <span className="text-foreground/80">{fmtDec(tr.toneladas)} t</span>
                      </span>
                      {/* Quitar el registro (solo admin): si fue un dedo de
                          más, se saca y el tramo se funde con el anterior. */}
                      {onEliminarPeso && tr.at && (
                        <button
                          type="button"
                          onClick={() => { void onEliminarPeso(tr.at!) }}
                          className="tap-44 rounded-full px-1 text-[11px] leading-none text-muted-foreground/70 hover:text-ink-crit"
                          title={`Quitar este registro (${fmtInt(tr.pesoKg * 1000)} g)`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Sin peso, el hueco se explica —también al que abre el link sin
              sesión— y trae su acción solo para quien puede cargarlo. */}
          {/* También con el turno CERRADO: el peso se puede cargar después y
              las toneladas del resultado siguen valiendo (Orel, 26-08 — con
              el gate en cerrado no había dónde ponerlo). */}
          {/* En Filete no se pide: esa línea no trabaja en toneladas. */}
          {!toneladas && esActual && usaToneladas && (
            <div className="mt-1.5 flex items-center gap-2 rounded-ctl bg-muted px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-foreground">Sin peso promedio no hay toneladas</div>
                <div className="text-[11px] text-muted-foreground/80">
                  Con el peso del calibre {turnoCerrado ? 'se estiman las del turno' : 'de hoy se estiman en vivo'}.
                </div>
              </div>
              {onGuardarPeso && <EditorPeso actual={null} onGuardar={onGuardarPeso} />}
            </div>
          )}

          {/* Cuando el contador vivo no responde, el número es el derivado de
              los buckets y llega hasta 8 min tarde. Decirlo es la diferencia
              entre un dato viejo y un dato viejo que se hace pasar por vivo. */}
          {contador.motivoFallback && (
            <p className="mt-1 text-[11px] text-muted-foreground/80">
              {contador.motivoFallback}: se muestra el acumulado de los tramos de 5 min.
            </p>
          )}

          {/* Desglose cuando la línea produjo fuera del horario del turno.
              Shoplogix cierra el turno a una hora fija y manda lo que venga
              después a otro bucket; sin este desglose el total no cuadra con lo
              que la gente contó en la línea, y ahí se pierde la confianza. */}
          {outside > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              {/* OJO: `contador.valor` es el TOTAL y ya incluye lo de afuera: la
                  pantalla decía «13.689 dentro del turno + 288 fuera» cuando
                  dentro fueron 13.401. Quien sumaba no le daba, y este bloque
                  existe justamente para que el total cuadre con lo que la gente
                  contó en la línea. */}
              <span className="tabular-nums">{fmtInt(Math.max(0, contador.valor - outside))} dentro del turno</span>
              <span className="text-muted-foreground/80">+</span>
              <Pill tone="warning" className="tabular-nums normal-case">
                {fmtInt(outside)} fuera del horario
              </Pill>
              {(live.outsideRanges ?? []).map(r => (
                <span key={r.from} className="text-[11px] tabular-nums text-muted-foreground/80">
                  ({r.kind === 'antes' ? 'antes: ' : ''}{fmtWallTime(r.from)}–{fmtWallTime(r.to)})
                </span>
              ))}
            </div>
          )}

          {metaHero != null && progressPct != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex flex-wrap items-center">
                  Meta del turno: {fmtInt(metaHero)} pz
                  {/* El editor vive ACÁ, no solo en el bloque de ritmo: ese se
                      apaga al cerrar el turno y dejaba la cuota sin dónde
                      tocarse (Orel, 26-08). */}
                  {onGuardarCuota && (
                    <EditorCuota
                      actual={metaHero}
                      pesoConocido={(pesoLocal !== undefined ? pesoLocal : live.pesoPromedioKg) ?? live.quotaOrigen?.pesoPromedioKg}
                      onGuardar={onGuardarCuota}
                      conToneladas={usaToneladas}
                    />
                  )}
                </span>
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
                const meta = metaHero!
                const techo = Math.max(meta, contador.valor, banda?.cierres.max ?? 0) * 1.04
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
                    {/* El relleno con el contador del héroe — el mismo número
                        que el 3.097 grande de arriba, no los buckets. */}
                    <span
                      className="absolute inset-y-1 left-0 rounded-r-sm bg-sky-500 dark:bg-sky-400 transition-[width] duration-700"
                      style={{ width: `${pctDe(contador.valor)}%` }}
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

          {/* Sin cuota: el hueco se explica y trae su acción (solo admin). Sin
              esto, un turno sin meta no ofrecía NINGÚN lugar donde ponerla. */}
          {metaHero == null && onGuardarCuota && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-ctl bg-muted px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-foreground">Sin cuota cargada para este turno</div>
                <div className="text-[11px] text-muted-foreground/80">
                  Con la cuota (en toneladas o piezas) aparecen la barra de meta y el camino a cumplirla.
                </div>
              </div>
              <EditorCuota
                actual={null}
                pesoConocido={(pesoLocal !== undefined ? pesoLocal : live.pesoPromedioKg) ?? live.quotaOrigen?.pesoPromedioKg}
                onGuardar={onGuardarCuota}
                conToneladas={usaToneladas}
              />
            </div>
          )}

          {/* Fuera del bloque de la meta: la recomendación también aplica
              cuando el link se creó sin cuota, midiendo contra lo que el sensor
              espera del turno — que es la mayoría de los links repartidos. */}
          {!turnoCerrado && <RitmoNecesario
            pace={pace}
            origenObjetivo={objetivoSensor?.origen ?? null}
            turnosObjetivo={objetivoSensor?.turnos ?? null}
            sinDatosHaceMin={sinDatosHaceMin}
            detenida={live.machinesProducing === 0 && !live.shiftClosed && live.currentSinceAt
              ? fmtAgoWall(live.currentSinceAt, now)
              : null}
            /* La cuota se edita desde el monitor porque cambia turno a turno.
               Solo con sesión de admin y en el turno en curso: quien abre el
               link sigue viendo una pantalla de solo lectura. */
            onGuardarCuota={onGuardarCuota}
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
            minAndando={live.timeBreakdown?.producingMin ?? null}
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
          /* UN solo veredicto, por prioridad. La frase vieja daba dos a la vez
             («en su rango normal — viene aflojando») sin resolver cuál manda. */
          const contexto = (() => {
            if (turnoCpm == null) return null
            /* OJO — turno joven: el promedio de hoy es la RAMPA de partida y
               siempre sale «abajo del rango» (la noche del 26-08: «8,4, abajo
               del rango 20-43» con 20 min de marcha). Se dice que es parcial
               en vez de dar un veredicto que todavía no existe. */
            const andandoMin = live.timeBreakdown?.producingMin ?? 0
            if (!turnoCerrado && andandoMin < 60) {
              return `El punto de hoy es parcial (${Math.round(andandoMin)} min andando): la comparación con otros turnos vale desde ~1 h de marcha.`
            }
            if (!banda) {
              return resumenesAnteriores.length === 0
                ? 'Sin rango habitual todavía: aparece al 5º turno.'
                : null
            }
            const verbo = turnoCerrado ? 'cerró' : 'va'
            const rango = `(${fmtDec(banda.ritmo.min)}–${fmtDec(banda.ritmo.max)})`
            if (turnoCpm > banda.ritmo.max) return `El turno ${verbo} arriba del rango habitual de la línea ${rango}.`
            if (turnoCpm < banda.ritmo.min) return `El turno ${verbo} abajo del rango habitual de la línea ${rango}.`
            const ult5 = [...banda.turnos.slice(-4).map((t) => t.ritmo), turnoCpm]
            if (ult5.length >= 4 && turnoCpm <= Math.min(...ult5)) {
              return 'El más lento de los últimos 5 turnos — aún dentro del rango habitual.'
            }
            if (ult5.length >= 4 && turnoCpm >= Math.max(...ult5)) {
              return 'El más rápido de los últimos 5 turnos.'
            }
            if (racha && racha.n >= 2) {
              return `${racha.n} turnos seguidos ${racha.dir > 0 ? 'al alza' : 'a la baja'} — dentro del rango habitual.`
            }
            return 'Dentro del rango habitual de la línea.'
          })()
          return (
            <>
            {/* El pulso va JUNTO a la regla: son la misma pregunta —«¿cómo va
                ahora?»— y el número de Shoplogix es el que cierra el círculo
                con la pantalla de planta. */}
            <PulsoVivo
              pulse={data.pulse}
              token={token ?? ''}
              cerrado={turnoCerrado}
              onPulso={p => setData(d => (d ? { ...d, pulse: p } : d))}
            />
            {/* «Dónde se fueron las piezas»: el análisis táctico del turno. Va
                acá, entre el número crudo y la regla de ritmo, porque responde
                la pregunta que sigue a «cuántas van».
                El pronóstico del cierre NO se duplica acá: ya vive en
                `PronosticoCierre`, con su banda, su método y el conteo de
                cuántos turnos llegaron. Repetirlo sería recrear el bug de los
                «dos cierres a tres tarjetas de distancia» que ese bloque
                documenta. */}
            {/* También con el turno CERRADO: ahí deja de ser distracción y pasa
                a ser el informe — es donde el monitor demuestra qué le costó
                las piezas a la línea (hallazgo del rediseño 26-08). */}
            {cascada && <CascadaTurnoCard cascada={cascada} />}
            {/* La respuesta de Mantención, junto al «dónde se fueron las
                piezas»: la cascada dice el costo, esta tarjeta dice quién
                respondió y cómo. */}
            {live.mantencion && <RespuestaMantencion m={live.mantencion} cerrado={turnoCerrado} />}
            <ReglaDeRitmo
              /* El tramo en curso se cuenta por los minutos que LLEVA, no por
                 los 5 que va a durar: si no, el número de "ahora" queda siempre
                 por debajo del que muestra Shoplogix. */
              ahora={ritmoAhoraAndando(serieDelTurno, ahoraWallMs)}
              maquinas={conRepartoPorMaquina(
                ritmoPorMaquina(live.machines, (live.windowHours ?? 0) * 60),
                seriesMaquinas,
                serieDelTurno,
                ahoraWallMs,
                live.timeBreakdown?.producingMin ?? null,
                /* El pulso por máquina SOLO cuando el número grande es el
                   pulso: la columna debe sumar exactamente lo de arriba. Los
                   ids del desglose son los machineid de Shoplogix — se
                   traducen a nombre con las máquinas del turno. Sale del VIVO
                   elegido (fresco o arrastrado): la columna acompaña al
                   número grande también durante la recalibración. */
                (() => {
                  const pm = contador.fuente === 'pulso' ? pulsoVivo(data.pulse)?.porMaquina : null
                  if (!pm?.length) return null
                  const nombrePorId = new Map(live.machines.map((m) => [m.id, m.name]))
                  const out = new Map<string, number>()
                  for (const x of pm) {
                    const n = nombrePorId.get(x.id)
                    if (n != null) out.set(n, x.cpm)
                  }
                  return out.size > 0 ? out : null
                })(),
              )}
              serieLinea={serieDelTurno}
              seriesMaquinas={seriesMaquinas}
              /* Las barras minuto a minuto: SOLO cuando el número grande es el
                 pulso (mismo criterio que el resto del bloque vivo) y el doc
                 trae la serie. En turnos pasados o con el contador caído se
                 vuelve a las curvas de 5 min. */
              barras={(() => {
                const s = contador.fuente === 'pulso' ? data.pulse?.serieMinuto : null
                if (!s?.maquinas?.length) return null
                const nombrePorId = new Map(live.machines.map((m) => [m.id, m.name]))
                return {
                  desde: s.desde,
                  maquinas: s.maquinas.map((m) => ({
                    ...m,
                    nombre: nombrePorId.get(m.id) ?? m.id,
                  })),
                }
              })()}
              /* Parada = ninguna máquina produciendo. El pulso lo confirma:
                 con la línea en colación marca 0,0 mientras el número grande
                 mostraba el ritmo de antes de parar. También con el turno
                 CERRADO: es la causa del cierre («Detención programada desde
                 las 15:09 · fin de turno»). */
              parada={live.machinesProducing === 0 && (live.currentReason || live.currentSinceAt)
                ? {
                  desdeHace: live.currentSinceAt ? fmtAgoWall(live.currentSinceAt, now) : null,
                  desdeHora: live.currentSinceAt ? fmtWallTime(live.currentSinceAt) : null,
                  motivo: live.currentReason ?? null,
                  programada: classifyLossState({
                    type: 'break',
                    reason: live.currentReason ?? undefined,
                  }) === 'planificado',
                }
                : null}
              ahoraReloj={ritmoAhoraCpm(serieDelTurno, ahoraWallMs)}
              /* Fin del último tramo: la serie viene en hora de planta, igual
                 que el resto de la pantalla. */
              corteMs={serieDelTurno.length
                ? Date.parse(serieDelTurno[serieDelTurno.length - 1]!.t) + 5 * 60_000
                : null}
              ahoraWallMs={ahoraWallMs}
              /* ⚠ El pulso SOLO si el contador vivo está respondiendo. Con el
                 contador caído, `totalCycles` viene 0 y `cpm` viene 0 —no
                 null—, así que el chip pintaba «0,0 · ahora mismo · 15:30» dos
                 renglones debajo del aviso que dice, literalmente, que el
                 contador no está respondiendo. Un cero que es ausencia de dato
                 presentado como medición. `elegirContador` ya hace ese juicio:
                 si cayó al derivado, no hay pulso que mostrar. */
              pulso={contador.fuente === 'pulso' ? (data.pulse ?? null) : null}
              vivo={contador.fuente === 'pulso' ? pulsoVivo(data.pulse) : null}
              /* El objetivo, en la MISMA base que el ritmo: el requerido de
                 `pace` es sobre el reloj útil que queda, y se convierte a
                 «andando» con el uptime real del turno. */
              pedido={pedidoAndando(
                pace?.requiredPerMinute,
                live.timeBreakdown?.producingMin,
                live.timeBreakdown
                  ? Math.max(1, live.timeBreakdown.windowMin - (live.timeBreakdown.plannedMin ?? 0))
                  : null,
              )}
              turno={turnoCpm}
              setCpm={setCpmVigente}
              techoDemostrado={ritmoAndando.mejor}
              cerrado={turnoCerrado}
              contexto={contexto}
              /* Últimos 4 turnos + hoy (a 375 px veinte puntos se amontonan) y
                 la escala FIJA al peor/mejor de TODA la historia corta, para
                 que la misma pendiente signifique lo mismo todos los días. */
              chispa={turnoCpm != null && banda
                ? <Chispa
                    turnos={banda.turnos.slice(-4)}
                    hoy={turnoCpm}
                    banda={banda.ritmo}
                    escala={banda.turnos.length
                      ? {
                        min: Math.min(...banda.turnos.map((t) => t.ritmo)),
                        max: Math.max(...banda.turnos.map((t) => t.ritmo)),
                      }
                      : null}
                    mediana={ritmoAndando.mediana}
                    muestras={ritmoAndando.muestras}
                  />
                : undefined}
            />
            </>
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
            /* «del tiempo disponible», no «sin contar convenio»: la fórmula
               descuenta TODO lo planificado (colación, reuniones, detención
               programada) y la etiqueta vieja nombraba solo uno — y en jerga
               que el que abre el link público puede no manejar. La definición
               va escrita, no en tooltip: esta pantalla se mira en celular y
               en un PC de sala, donde nadie hace hover. */
            hint={
              live.timeBreakdown
                ? `${fmtDurationSec(live.timeBreakdown.producingMin * 60)} · del tiempo disponible`
                : fmtDurationSec(live.uptimeSec)
            }
            sub="Disponible = el turno menos colación, reuniones y paradas programadas."
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
              cierreMs={(() => {
                /* El cierre PROGRAMADO (el mismo de la cabecera): cerrado el
                   turno se usa el horario declarado; en curso, el previsto. */
                const iso = live.shiftClosed
                  ? (live.scheduledEnd ?? live.plannedEnd)
                  : (live.plannedEnd ?? live.scheduledEnd)
                const ms = iso ? Date.parse(iso) : NaN
                return Number.isNaN(ms) ? null : ms
              })()}
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
              medianCpm={
                /* La MISMA mediana que el riel y la chispa (`ritmoAndando`, 19
                   turnos), no la del backend (8): eran 29,4 y 29,7 en la misma
                   pantalla con dos muestras distintas — dos «lo normal» a diez
                   centímetros (auditoría en vivo, 27-08). El backend queda de
                   respaldo para docs sin historial. */
                ritmoAndando.mediana ?? live.paceMedianCpm
              }
              medianSamples={ritmoAndando.mediana != null ? ritmoAndando.muestras : live.paceSamples}
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
              cerrado={turnoCerrado}
              meta={data.targetPieces ?? live.quotaPieces ?? metaSensor}
              hechas={live.totalPieces}
              piezasPulso={data.pulse?.totalCycles ?? null}
              corteHora={horaPlanta(live.lastSyncAt ? Date.parse(live.lastSyncAt) - new Date().getTimezoneOffset() * 60_000 : null)}
              cuotaAhora={comparacion.optimalAtCurrentMinute}
              horaAhora={horaDeCuota}
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
            <VsAyerBloque r={comparadoConAyer} records={recordsLinea} sinConvenio={sinConvenio} />

          </>
        ) : (
          <>
            {/* Adónde va a cerrar el turno, según lo que hicieron los anteriores
                desde esta misma altura. Antes de la velocidad: primero el
                desenlace, después el detalle de cómo se está llegando. */}
            <PronosticoCierre
              f={pronostico}
              meta={data.targetPieces ?? live.quotaPieces ?? metaSensor}
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
              cierreMs={(() => {
                /* El cierre PROGRAMADO (el mismo de la cabecera): cerrado el
                   turno se usa el horario declarado; en curso, el previsto. */
                const iso = live.shiftClosed
                  ? (live.scheduledEnd ?? live.plannedEnd)
                  : (live.plannedEnd ?? live.scheduledEnd)
                const ms = iso ? Date.parse(iso) : NaN
                return Number.isNaN(ms) ? null : ms
              })()}
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
              medianCpm={
                /* La MISMA mediana que el riel y la chispa (`ritmoAndando`, 19
                   turnos), no la del backend (8): eran 29,4 y 29,7 en la misma
                   pantalla con dos muestras distintas — dos «lo normal» a diez
                   centímetros (auditoría en vivo, 27-08). El backend queda de
                   respaldo para docs sin historial. */
                ritmoAndando.mediana ?? live.paceMedianCpm
              }
              medianSamples={ritmoAndando.mediana != null ? ritmoAndando.muestras : live.paceSamples}
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
              cerrado={turnoCerrado}
              meta={data.targetPieces ?? live.quotaPieces ?? metaSensor}
              hechas={live.totalPieces}
              piezasPulso={data.pulse?.totalCycles ?? null}
              corteHora={horaPlanta(live.lastSyncAt ? Date.parse(live.lastSyncAt) - new Date().getTimezoneOffset() * 60_000 : null)}
              cuotaAhora={comparacion.optimalAtCurrentMinute}
              horaAhora={horaDeCuota}
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
            <VsAyerBloque r={comparadoConAyer} records={recordsLinea} sinConvenio={sinConvenio} />

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

        <PorHora series={serieDelTurno} paradas={paradasDelTurno} />

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
                      {m.model && <span className="ml-1 text-[11px] text-muted-foreground/80">{m.model}</span>}
                      {!live.shiftClosed && m.status === 'produciendo' && (
                        <span className="ml-1 text-[11px] text-muted-foreground/80">· produciendo</span>
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
                  <span className="w-20 text-right tabular-nums text-[11px] text-muted-foreground/80">
                    {fmtInt(m.piecesPerHour)} pz/h
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Frescura y procedencia */}
        <footer className="space-y-1 pb-6 pt-1 text-center text-[11px] text-muted-foreground/80">
          {/* Con el turno CERRADO no hay sync porque no hay producción: "hace
              4 h — puede estar detenida" de noche alarmaba por lo normal. La
              alerta ámbar queda solo para dato viejo con turno VIVO. ⚠
              `lastSyncAt` es UTC REAL (no wall-clock): la hora se formatea con
              el reloj local del cliente, no con fmtWallTime. */}
          {live.shiftClosed ? (
            <p className="text-muted-foreground/80">
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
            <p className={stale ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/80'}>
              <RefreshCw className="mr-1 inline h-3 w-3" />
              Datos de planta actualizados {fmtAgo(live.lastSyncAt, now)}
              {stale && ' — la sincronización puede estar detenida'}
            </p>
          )}
          <p>
            Se actualiza solo · solo lectura · compartido por {data.createdBy}
          </p>
          {esAdminMonitor && (
            <div className="flex flex-col items-center gap-1 pt-1">
              {/* Componente de la app, no estilos crudos: el guardarrail de la
                  piel prohibe radios fuera de la escala unica. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPidiendoClave(true)}
                disabled={enviandoInforme}
              >
                {enviandoInforme ? 'Enviando…' : 'Enviar informe de este turno'}
              </Button>
              {avisoInforme && (
                <span className="text-xs text-muted-foreground">{avisoInforme}</span>
              )}
            </div>
          )}
          {data.mode === 'line' && (
            <p className="text-muted-foreground/80">
              Este link no caduca con el turno: al arrancar el siguiente, cambia solo.
            </p>
          )}
          <p>
            Link válido hasta {new Date(data.expiresAt).toLocaleString('es-CL', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
          {/* Decirlo es parte de hacerlo bien: se cuenta el uso, no a la gente. */}
          <p className="text-muted-foreground/80">
            Se cuentan las aperturas de forma anónima, para saber si la pantalla sirve.
            No se registra quién la abre.
          </p>
        </footer>
      </main>

      {/* La contraseña se pide en el navegador y no viaja a ninguna parte: solo
          prueba que quien aprieta es el dueño de la sesión. Que además sea
          admin lo revalida la Cloud Function contra `users`. */}
      <ReAuthConfirmDialog
        open={pidiendoClave}
        onOpenChange={setPidiendoClave}
        reason="Confirma tu contraseña para enviar el informe de este turno por Telegram."
        onConfirmed={enviarInforme}
      />
    </div>
  )
}
