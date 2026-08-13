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
import { Activity, AlertCircle, ChevronLeft, ChevronRight, Clock, Gauge, Hourglass, Moon, PauseCircle, Radio, RefreshCw, Sun, Target, Timer, TrendingUp } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import {
  subscribePublicShiftMonitor,
  trackMonitorUsage,
  type PublicShiftMonitorDoc,
  type PublicMonitorLive,
} from '@/services/shoplogix/publicShiftMonitor.service'
import { buildHourlyRows, peakPieces } from '@/services/shoplogix/monitorHourly'
import { computePaceToTarget, lineMaxPerHour, type PaceToTarget } from '@/services/shoplogix/monitorPace'
import { pinShiftEnd, unpinShiftEnd } from '@/services/shoplogix/pinShiftEnd'
import {
  buildDayComparison, optimalPace, plannedBreaks, mergeBreaks,
} from '@/services/shoplogix/monitorCompare'
import { TiempoDelTurno, ComparadorDias, Bloque, BitacoraOperador } from './monitor/MonitorShiftParts'
import { useIsAdmin } from '@/store'

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

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))
const fmtDec = (n: number, d = 1) =>
  (n || 0).toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })

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
  label, value, unit, icon, hint, tone = 'default',
}: {
  label: string
  value: string
  unit?: string
  icon: React.ReactNode
  hint?: string
  tone?: 'default' | 'accent'
}) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums ${tone === 'accent' ? 'text-sky-700 dark:text-sky-300' : 'text-foreground'}`}>
          {value}
        </span>
        {unit && <span className="text-[12px] text-muted-foreground/70">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</div>}
    </div>
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
  series, stopReasons, stopEvents, comments, causaSel, onCausa,
}: {
  series: PublicMonitorLive['series']
  stopReasons?: string[]
  stopEvents?: PublicMonitorLive['stopEvents']
  comments?: PublicMonitorLive['comments']
  causaSel: string | null
  onCausa: (c: string | null) => void
}) {
  /*
   * Zoom horizontal. A 375 px, 106 tramos dan barras de 3 px: se ve la forma
   * del turno pero no se puede leer un tramo concreto, que es justo lo que hace
   * falta cuando uno ya sabe que a la hora 6 pasó algo. Ampliando el ancho del
   * SVG dentro de un contenedor con scroll, cada barra crece y se puede tocar.
   */
  const [zoom, setZoom] = useState(1)
  /** Tramo bajo el cursor (o tocado en el celular). null = ninguno. */
  const [foco, setFoco] = useState<number | null>(null)
  if (!series || series.length === 0) return null

  const max = Math.max(...series.map(p => p.pieces), 1)
  const W = 100
  const H = 28
  const gap = 0.6
  const bw = Math.max(0.5, W / series.length - gap)

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

  // Bandas de la causa elegida. Se dibujan primero para quedar DETRÁS de las
  // barras: la producción es el dato, la detención es el contexto.
  const bandas = causaSel && stopEvents && stopReasons
    ? stopEvents
        .filter(e => stopReasons[e.r] === causaSel)
        .map((e, i) => {
          const desde = new Date(e.f).getTime()
          const hasta = desde + e.s * 1000
          const i0 = indiceDe(desde)
          const i1 = indiceDe(hasta)
          const x = i0 * (bw + gap)
          // Al menos un tramo de ancho: un paro de 40 s tiene que verse.
          const ancho = Math.max((i1 - i0 + (e.s >= paso ? 1 : 0)) * (bw + gap), bw * 0.6)
          // La key lleva el índice: dos paros pueden arrancar en el MISMO
          // instante con distinta duración, y con `e.f` sola React los tomaba
          // por el mismo elemento.
          return { x, ancho, key: `${e.f}-${e.s}-${i}` }
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
    const e = stopEvents.find((x) => {
      const a = new Date(x.f).getTime()
      return a < hasta && a + x.s * 1000 > desde
    })
    return e ? { causa: stopReasons[e.r]!, sec: e.s } : null
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
        <span>Piezas por tramo de 5 min</span>
        {causaSel && (
          <button
            onClick={() => onCausa(null)}
            className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[11px] normal-case text-rose-800 dark:text-rose-300"
          >
            {causaSel} ✕
          </button>
        )}
      </div>

      <div className="mt-2 overflow-x-auto">
      <div style={{ width: `${zoom * 100}%`, minWidth: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full"
           role="img"
           data-zoom={zoom}
           onMouseMove={(ev) => setFoco(tramoEn(ev.clientX, ev.currentTarget))}
           onMouseLeave={() => setFoco(null)}
           onClick={(ev) => setFoco(tramoEn(ev.clientX, ev.currentTarget))}
           aria-label="Piezas por tramo de cinco minutos">
        {bandas.map(b => (
          <rect key={b.key} x={b.x} y={0} width={b.ancho} height={H}
                className="fill-rose-500/25 stroke-rose-500/60" strokeWidth={0.15} />
        ))}

        {/* Ritmo de referencia: el mejor tramo que la máquina demostró en este
            turno. Se eligió sobre el target del sensor (100 pz/tramo) porque
            ese nunca se alcanza y dejaba todo el turno "bajo objetivo". */}
        <line x1={0} y1={H - H * 0.98} x2={W} y2={H - H * 0.98}
              className="stroke-amber-600 dark:stroke-amber-400" strokeWidth={0.2} strokeDasharray="1.2 1" />

        {series.map((p, i) => {
          const h = (p.pieces / max) * H * 0.98
          return (
            <rect
              key={p.t}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={0.4}
              className={p.pieces > 0 ? 'fill-sky-500 dark:fill-sky-400/80' : 'fill-muted-foreground/20'}
            >
              <title>{`${fmtWallTime(p.t)} · ${fmtInt(p.pieces)} pz`}</title>
            </rect>
          )
        })}

        {/* El tramo bajo el cursor, marcado sobre las barras. */}
        {foco != null && (
          <rect x={foco * (bw + gap)} y={0} width={bw} height={H} className="fill-foreground/30" />
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
              <span className="text-rose-700 dark:text-rose-300">
                {' '}- {detalle.paro.causa} {fmtDurationSec(detalle.paro.sec)}
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

      {/* En un turno completo (~100 tramos) a 375 px cada barra mide 1,6 px.
          Con 8× pasa a ~13 px: recién ahí es un blanco que se puede tocar para
          ver la hora y las piezas del tramo. */}
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <span className="normal-case">detalle</span>
        {[1, 2, 4, 8].map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            aria-pressed={zoom === z}
            className={`rounded-full border px-2 py-0.5 tabular-nums ${
              zoom === z
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-800 dark:text-sky-200'
                : 'border-border hover:bg-muted'
            }`}
          >
            {z}×
          </button>
        ))}
        {zoom > 1 && <span className="normal-case">deslizá el gráfico &#8594;</span>}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 border-t-2 border-dashed border-amber-600 dark:border-amber-400" />
          mejor ritmo del turno: <span className="tabular-nums text-muted-foreground">{fmtInt(max)}</span> pz
        </span>
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
          {fuente === 'fijado'
            ? ', fijado a mano'
            : muestras
            ? `, según los últimos ${muestras} turnos`
            : ', según el horario configurado'}.
        </span>
        {puedeEditar && !editando && (
          <button
            type="button"
            onClick={() => { setValor(fmtWallTime(cierre)); setEditando(true); setError(null) }}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
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

function RitmoNecesario({ pace, cierre, muestras, fuente, plantSlug, shiftName, startAt, historial }: {
  pace: PaceToTarget | null
  historial: { medianCpm: number | null; bestCpm: number | null; muestras: number | null } | null
  cierre: string | null | undefined
  muestras: number | null | undefined
  fuente: PublicMonitorLive['plannedEndSource']
  plantSlug: string | undefined
  shiftName: string | null | undefined
  startAt: string | null | undefined
}) {
  if (!pace) return null

  if (pace.verdict === 'cumplida') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12px] text-emerald-800 dark:text-emerald-300">
        <Target className="h-3.5 w-3.5 shrink-0" />
        Meta cumplida — todo lo que salga de acá en adelante va por encima.
      </p>
    )
  }

  const fuera = pace.verdict === 'fuera-de-alcance'
  return (
    <div
      className={`mt-2 rounded-xl border px-3 py-2 ${
        fuera
          ? 'border-amber-400/30 bg-amber-400/10'
          : 'border-sky-400/25 bg-sky-400/10'
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
      <p className={`mt-1 text-[15px] font-semibold ${fuera ? 'text-amber-800 dark:text-amber-300' : 'text-sky-800 dark:text-sky-300'}`}>
        {fuera ? 'No se alcanza con el tiempo que queda' : 'Se alcanza'}
      </p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        Al ritmo de ahora el turno cierra en{' '}
        <span className="tabular-nums text-foreground/90">{fmtInt(pace.projectedPieces)} pz</span>
        {' '}({fmtDec((pace.projectedPieces / pace.targetPieces) * 100, 0)}% de la meta).
      </p>

      {/* Los números en filas, no en prosa: se comparan de un vistazo. */}
      <dl className="mt-2 space-y-0.5 text-[12px]">
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Faltan</dt>
          <dd className="tabular-nums">{fmtInt(pace.remainingPieces)} pz</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Queda</dt>
          <dd className="tabular-nums">{fmtDurationSec(pace.remainingMin * 60)}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Necesitás</dt>
          <dd className={`tabular-nums font-semibold ${fuera ? 'text-amber-800 dark:text-amber-300' : 'text-sky-800 dark:text-sky-300'}`}>
            {fmtDec(pace.requiredPerMinute)} pz/min
            <span className="ml-1 font-normal text-muted-foreground/80">
              = {fmtInt(pace.requiredPerHour)} pz/h
            </span>
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Vas a</dt>
          <dd className="tabular-nums">
            {fmtDec(pace.currentPerHour / 60)} pz/min
            <span className="ml-1 text-muted-foreground/80">= {fmtInt(pace.currentPerHour)} pz/h</span>
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

      {/* El récord, dicho: el monitor también es evidencia de mejora. Solo
          cuando el ritmo de HOY supera al mejor de los turnos recientes. */}
      {historial?.bestCpm != null && pace.currentPerHour / 60 > historial.bestCpm && (
        <p className="mt-1.5 flex items-baseline gap-1.5 text-[12px] text-emerald-800 dark:text-emerald-300">
          <TrendingUp className="h-3.5 w-3.5 shrink-0 self-center" />
          <span>
            Por encima del mejor turno reciente ({fmtDec(historial.bestCpm)} pz/min
            {historial.muestras ? ` en los últimos ${historial.muestras}` : ''}).
          </span>
        </p>
      )}

      {pace.maxPerHour != null && (
        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
          El <b>techo</b> es el mejor ritmo que la línea alcanzó
          {historial?.muestras ? ` en los últimos ${historial.muestras} turnos` : ' en turnos anteriores'} —
          lo que ya demostró que puede, no lo que dice el objetivo.
        </p>
      )}

      {/* La referencia histórica: hace que "necesitás 16 pz/min" se pueda
          juzgar. El objetivo del sensor puede decir 20 y la línea no haber
          pasado nunca de 12,7 — medido en Filete sobre 9 turnos. */}
      {historial?.medianCpm != null && (
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Lo normal en esta línea:{' '}
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
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-border bg-muted/40'
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
              {' '}— <span className="text-emerald-800 dark:text-emerald-300">la meta entra</span>.
            </>
          ) : (
            <>
              harían falta{' '}
              <b className="tabular-nums">
                {fmtDec(pace.withExtraHour.requiredPerMinute)} pz/min ({fmtInt(pace.withExtraHour.requiredPerHour)} pz/h)
              </b>, que
              sigue por encima del techo de la línea. Con una hora no basta.
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

function StatusPill({ live }: { live: PublicMonitorLive }) {
  const map = {
    produciendo: { label: 'Produciendo', dot: 'bg-emerald-400', text: 'text-emerald-800 dark:text-emerald-300', ring: 'border-emerald-400/30 bg-emerald-400/20' },
    detenida:    { label: 'Detenida',    dot: 'bg-red-400',     text: 'text-red-800 dark:text-red-300',     ring: 'border-red-400/30 bg-red-400/20' },
    'sin-datos': { label: 'Sin datos',   dot: 'bg-muted-foreground/50',    text: 'text-muted-foreground',    ring: 'border-border bg-muted' },
  } as const
  const s = map[live.status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold ${s.ring} ${s.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${live.status === 'produciendo' ? 'animate-pulse' : ''}`} />
      {s.label}
    </span>
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
  const esActual = idx === 0

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
    return computePaceToTarget({
      // La cuota del link primero; si no, la de la config del turno.
      targetPieces: data?.targetPieces ?? live.quotaPieces,
      expectedPieces: live.expectedPieces,
      producedPieces: live.totalPieces,
      // `plannedEnd`, no `scheduledEnd`: aquél corre detrás del reloj y dejaría
      // el tiempo restante en ~0 durante todo el turno.
      scheduledEnd: live.plannedEnd,
      nowWallMs,
      currentPerHour: live.piecesPerHour,
      /*
       * El techo sale del MEJOR turno real, no de `expectedPieces/horas`. Ese
       * cálculo mezclaba lo que el sensor espera con una ventana que puede ser
       * de otro turno, y daba números que la línea ya había superado. Lo que la
       * línea demostró que puede es un techo que se puede defender.
       */
      maxPerHour: live.paceBestCpm != null
        ? live.paceBestCpm * 60
        : lineMaxPerHour(live.expectedPieces, live.scheduledStart, live.plannedEnd),
      shiftClosed: live.shiftClosed,
    })
  }, [live, data?.targetPieces, now])

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
    const opt = meta && tb
      ? optimalPace({ targetPieces: meta, windowMin: tb.windowMin, plannedMin: tb.plannedMin })
      : null

    const deConvenio = (l: PublicMonitorLive | null | undefined) =>
      plannedBreaks({
        series: l?.series,
        stopEvents: l?.stopEvents,
        stopReasons: l?.stopReasons,
        plannedReasons: (l?.timeBreakdown?.planned ?? []).map((x) => x.reason),
      })

    const hoyBreaks = deConvenio(live)
    const anteriores = (data?.history ?? []).flatMap((h) => deConvenio(h.live))
    const minutoActual = live?.series?.length ? live.series.length * 5 : 0

    return buildDayComparison({
      todaySeries: live?.series,
      todayDateKey: data?.dateKey ?? '',
      todayShiftId: data?.shiftId ?? null,
      previous: (data?.history ?? []).map((h) => ({
        dateKey: h.dateKey, shiftId: h.shiftId, series: h.live?.series,
      })),
      // Los 6 que trae el doc: cuáles se dibujan lo elige quien mira.
      maxDays: 6,
      targetPieces: meta,
      usefulMin: opt?.usefulMin ?? null,
      breaks: mergeBreaks(hoyBreaks, anteriores, minutoActual),
    })
  }, [live, data?.dateKey, data?.shiftId, data?.history, data?.targetPieces])

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
        <Hourglass className="h-11 w-11 text-sky-600 dark:text-sky-400/70" />
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
            <StatusPill live={live} />
            {live.shiftClosed && (
              <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                Turno cerrado
              </span>
            )}
          <button
            onClick={toggleTheme}
            className="ml-auto shrink-0 rounded-full border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground"
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
            <span className="first-letter:uppercase">{fmtDateLong(vista?.dateKey || data.dateKey)}</span>
            <span className="text-muted-foreground/50">·</span>
            {/*
              * Con el turno VIVO el fin de la ventana es el ÚLTIMO INTERVALO
              * SINCRONIZADO: se corre cada ~5 min y se leía como hora de
              * término ("15:00–21:52" con la línea produciendo a las 22:00).
              * Mientras el turno está en curso se muestra el cierre previsto
              * —la misma fuente que el "Cierre estimado" de abajo—; el rango
              * real recién vale cuando el turno cerró.
              */}
            {!live.shiftClosed && live.plannedEnd ? (
              <span className="tabular-nums">
                {fmtWallTime(live.scheduledStart)}&nbsp;&#8594;&nbsp;{fmtWallTime(live.plannedEnd)}
                {live.plannedEndSource !== 'fijado' && (
                  <span className="ml-1 rounded bg-muted px-1 py-px text-[10px] uppercase tracking-wide text-muted-foreground">
                    est.
                  </span>
                )}
              </span>
            ) : (
              <span className="tabular-nums">
                {fmtWallTime(live.scheduledStart)}–{fmtWallTime(live.scheduledEnd)}
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
            className="flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1.5 text-[12px] text-foreground/80 transition-colors enabled:hover:bg-muted disabled:opacity-30"
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
                className="rounded-full border border-sky-400/25 bg-sky-400/20 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-200 transition-colors hover:bg-sky-400/20"
              >
                Ir al actual
              </button>
            )}
          </div>

          <button
            onClick={() => irA(-1)}
            disabled={esActual}
            className="flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1.5 text-[12px] text-foreground/80 transition-colors enabled:hover:bg-muted disabled:opacity-30"
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
        <section className="rounded-2xl border border-sky-400/20 bg-gradient-to-b from-sky-500/15 to-transparent px-4 py-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Activity className="h-3 w-3" />
            {esActual ? 'Piezas procesadas en la jornada' : 'Piezas de ese turno'}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tabular-nums leading-none">{fmtInt(live.totalPieces)}</span>
            <span className="text-sm text-muted-foreground/70">piezas</span>
          </div>

          {/* Desglose cuando la línea produjo fuera del horario del turno.
              Shoplogix cierra el turno a una hora fija y manda lo que venga
              después a otro bucket; sin este desglose el total no cuadra con lo
              que la gente contó en la línea, y ahí se pierde la confianza. */}
          {outside > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
              <span className="tabular-nums">{fmtInt(live.shiftPieces ?? 0)} dentro del turno</span>
              <span className="text-muted-foreground/60">+</span>
              <span className="rounded-full border border-amber-400/25 bg-amber-400/20 px-2 py-0.5 tabular-nums text-amber-800 dark:text-amber-200">
                {fmtInt(outside)} fuera del horario
              </span>
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
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-sky-500 dark:bg-sky-400 transition-[width] duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Fuera del bloque de la meta: la recomendación también aplica
              cuando el link se creó sin cuota, midiendo contra lo que el sensor
              espera del turno — que es la mayoría de los links repartidos. */}
          <RitmoNecesario
            pace={pace}
            cierre={live.plannedEnd}
            muestras={live.plannedEndSamples}
            fuente={live.plannedEndSource}
            plantSlug={data.plantSlug}
            shiftName={live.shiftName}
            startAt={live.scheduledStart}
            historial={live.paceMedianCpm != null ? {
              medianCpm: live.paceMedianCpm,
              bestCpm: live.paceBestCpm ?? null,
              muestras: live.paceSamples ?? null,
            } : null}
          />

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Producción real desde{' '}
              <span className="tabular-nums text-foreground/80">{fmtWallTime(live.effectiveStart)}</span>
              {' '}hasta{' '}
              <span className="tabular-nums text-foreground/80">{fmtWallTime(live.effectiveEnd)}</span>
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="tabular-nums">{fmtDec(live.windowHours)} h de operación</span>
          </div>
        </section>

        {/* Cadencia */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label="Piezas / min"
            value={fmtDec(live.piecesPerMinute)}
            unit="pz/min"
            icon={<Gauge className="h-3 w-3" />}
            hint="promedio del turno"
            tone="accent"
          />
          <Kpi
            label="Piezas / hora"
            value={fmtInt(live.piecesPerHour)}
            unit="pz/h"
            icon={<Timer className="h-3 w-3" />}
            hint="ciclos por hora"
            tone="accent"
          />
          <Kpi
            label={`Últimos ${live.recentMinutes || 0} min`}
            value={fmtDec(live.recentPiecesPerMinute)}
            unit="pz/min"
            icon={<Radio className="h-3 w-3" />}
            hint={`${fmtInt(live.recentPieces)} pz en el tramo`}
          />
          <Kpi
            label="Tiempo produciendo"
            value={fmtDec(live.uptimePct, 0)}
            unit="%"
            icon={<Clock className="h-3 w-3" />}
            /*
             * Minutos de LÍNEA, no la suma del uptime de cada máquina: en Yal,
             * con tres Baader, esa suma daba "13 h 31 min" dentro de un turno
             * de 4 h 51 — un número imposible en la pantalla.
             */
            hint={
              live.timeBreakdown
                ? fmtDurationSec(live.timeBreakdown.producingMin * 60)
                : fmtDurationSec(live.uptimeSec)
            }
          />
        </div>

        {/* Estado actual: por qué NO está corriendo, si es el caso. Con el
            turno CERRADO no se muestra: "Línea detenida hace 6 h" después del
            cierre es lo esperable, no una alerta — junto al aviso de sync
            detenida pintaba alarmante una noche normal. */}
        {live.status === 'detenida' && esActual && !live.shiftClosed && (
          <section className="rounded-2xl border border-red-500/40 bg-red-500/15 px-4 py-3 dark:border-red-400/25">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-red-700 dark:text-red-300/80">
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

        <Sparkbars
          series={live.series}
          stopReasons={live.stopReasons}
          stopEvents={live.stopEvents}
          comments={live.comments}
          causaSel={causaSel}
          onCausa={setCausaSel}
        />

        <TiempoDelTurno tb={live.timeBreakdown} causaSel={causaSel} onCausa={setCausaSel} />

        <ComparadorDias cmp={comparacion} live={live} onCausa={setCausaSel} />

        <PorHora series={live.series} />

        {/* La bitácora del piso: lo que el operador escribió, todo y en orden.
            Hasta ahora solo se leía lo que coincidía con un tramo de brecha. */}
        <BitacoraOperador comments={live.comments} onCausa={setCausaSel} />

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
                      <span className="block truncate text-[11px] text-red-700 dark:text-red-300/90">
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
            <p className={stale ? 'text-amber-700 dark:text-amber-400/80' : 'text-muted-foreground/70'}>
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
