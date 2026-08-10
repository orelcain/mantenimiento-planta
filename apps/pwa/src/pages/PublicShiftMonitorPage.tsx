/**
 * Monitor público de turno — vista en vivo sin sesión (link/QR).
 *
 * Pensada para Control de Producción: entra desde el QR en el celular y ve
 * cuántas piezas lleva la línea, a qué cadencia (pz/min y pz/h), de qué turno
 * y día se trata, desde qué hora, y si la máquina está corriendo o parada.
 * SOLO LECTURA — no hay ninguna acción que escriba.
 *
 * Se actualiza sola: el doc espejo lo reescribe el backend cada ciclo de sync
 * (~5 min mientras el turno corre) y acá hay un `onSnapshot`.
 *
 * Estilo: paleta oscura fija (no theme-aware), igual que las otras vistas
 * públicas por token. Es un tablero que se mira en el celular en planta o
 * proyectado en una pantalla; el contraste alto y los números grandes mandan,
 * y quien lo abre no tiene sesión ni toggle de tema.
 *
 * ⚠ Horas de TURNO en wall-clock de planta (getUTC*); `lastSyncAt` es UTC real.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Activity, AlertCircle, Clock, Gauge, Hourglass, PauseCircle, Radio, Repeat, RefreshCw, Timer } from 'lucide-react'
import {
  subscribePublicShiftMonitor,
  type PublicShiftMonitorDoc,
  type PublicMonitorLive,
} from '@/services/shoplogix/publicShiftMonitor.service'

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
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/45">
        {icon}{label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums ${tone === 'accent' ? 'text-sky-300' : 'text-white'}`}>
          {value}
        </span>
        {unit && <span className="text-[12px] text-white/40">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-white/35">{hint}</div>}
    </div>
  )
}

/** Barras de 5 min. SVG puro — sin librerías de gráficos en el bundle público. */
function Sparkbars({ series }: { series: PublicMonitorLive['series'] }) {
  if (!series || series.length === 0) return null
  const max = Math.max(...series.map(p => p.pieces), 1)
  const W = 100
  const H = 28
  const gap = 0.6
  const bw = Math.max(0.5, W / series.length - gap)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/45">
        <span>Piezas por tramo de 5 min</span>
        <span className="tabular-nums text-white/35">
          {fmtWallTime(series[0]!.t)}–{fmtWallTime(series[series.length - 1]!.t)}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 h-16 w-full" role="img"
           aria-label="Piezas por tramo de cinco minutos">
        {series.map((p, i) => {
          const h = (p.pieces / max) * H
          return (
            <rect
              key={p.t}
              x={i * (bw + gap)}
              y={H - h}
              width={bw}
              height={h}
              rx={0.4}
              className={p.pieces > 0 ? 'fill-sky-400/80' : 'fill-white/10'}
            />
          )
        })}
      </svg>
      <div className="mt-1 text-[11px] text-white/35">
        Máximo del tramo: <span className="tabular-nums text-white/60">{fmtInt(max)}</span> pz
      </div>
    </div>
  )
}

function StatusPill({ live }: { live: PublicMonitorLive }) {
  const map = {
    produciendo: { label: 'Produciendo', dot: 'bg-emerald-400', text: 'text-emerald-300', ring: 'border-emerald-400/30 bg-emerald-400/10' },
    detenida:    { label: 'Detenida',    dot: 'bg-red-400',     text: 'text-red-300',     ring: 'border-red-400/30 bg-red-400/10' },
    'sin-datos': { label: 'Sin datos',   dot: 'bg-white/40',    text: 'text-white/60',    ring: 'border-white/15 bg-white/5' },
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

  const live = data?.live ?? null

  const progressPct = useMemo(() => {
    if (!live || !data?.targetPieces) return null
    return Math.min(100, (live.totalPieces / data.targetPieces) * 100)
  }, [live, data?.targetPieces])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <RefreshCw className="h-6 w-6 animate-spin text-sky-400" />
      </div>
    )
  }

  if (status === 'gone' || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-950 px-6 text-center">
        <AlertCircle className="h-11 w-11 text-red-400" />
        <p className="text-lg font-semibold text-white">Este link ya no está disponible</p>
        <p className="max-w-xs text-sm text-white/50">
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
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-950 px-6 text-center">
        <Hourglass className="h-11 w-11 text-sky-400/70" />
        <p className="text-lg font-semibold text-white">Esperando el próximo turno</p>
        <p className="max-w-xs text-sm text-white/50">
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
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Cabecera: qué línea, qué turno, qué día, desde qué hora */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-gray-950/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="text-base font-semibold leading-tight">{lineTitle}</h1>
            <StatusPill live={live} />
            {live.shiftClosed && (
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                Turno cerrado
              </span>
            )}
            {/* Sin esto, ver que cambió el turno del encabezado se lee como que
                el link se rompió. Con el chip, se entiende que sigue la línea. */}
            {data.mode === 'line' && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-300/90">
                <Repeat className="h-3 w-3" />
                Sigue el turno vigente
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-white/55">
            {areaTitle && <span>{areaTitle}</span>}
            {areaTitle && <span className="text-white/20">·</span>}
            <span className="font-medium text-white/70">{data.shiftId}</span>
            <span className="text-white/20">·</span>
            {/* first-letter, no `capitalize`: ese capitaliza CADA palabra y
                dejaba "Lunes, 10 De Agosto". */}
            <span className="first-letter:uppercase">{fmtDateLong(data.dateKey)}</span>
            <span className="text-white/20">·</span>
            <span className="tabular-nums">
              {fmtWallTime(live.scheduledStart)}–{fmtWallTime(live.scheduledEnd)}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-3 px-4 py-4">
        {/* Piezas acumuladas — el número que vienen a ver */}
        <section className="rounded-2xl border border-sky-400/20 bg-gradient-to-b from-sky-500/10 to-transparent px-4 py-4">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/50">
            <Activity className="h-3 w-3" />
            Piezas procesadas en la jornada
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tabular-nums leading-none">{fmtInt(live.totalPieces)}</span>
            <span className="text-sm text-white/40">piezas</span>
          </div>

          {/* Desglose cuando la línea produjo fuera del horario del turno.
              Shoplogix cierra el turno a una hora fija y manda lo que venga
              después a otro bucket; sin este desglose el total no cuadra con lo
              que la gente contó en la línea, y ahí se pierde la confianza. */}
          {outside > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/60">
              <span className="tabular-nums">{fmtInt(live.shiftPieces ?? 0)} dentro del turno</span>
              <span className="text-white/25">+</span>
              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 tabular-nums text-amber-200">
                {fmtInt(outside)} fuera del horario
              </span>
              {(live.outsideRanges ?? []).map(r => (
                <span key={r.from} className="text-[11px] tabular-nums text-white/35">
                  ({r.kind === 'antes' ? 'antes: ' : ''}{fmtWallTime(r.from)}–{fmtWallTime(r.to)})
                </span>
              ))}
            </div>
          )}

          {data.targetPieces != null && progressPct != null && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-white/50">
                <span>Meta del turno: {fmtInt(data.targetPieces)} pz</span>
                <span className="tabular-nums">{fmtDec(progressPct, 0)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-sky-400 transition-[width] duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/45">
            <span>
              Producción real desde{' '}
              <span className="tabular-nums text-white/70">{fmtWallTime(live.effectiveStart)}</span>
              {' '}hasta{' '}
              <span className="tabular-nums text-white/70">{fmtWallTime(live.effectiveEnd)}</span>
            </span>
            <span className="text-white/20">·</span>
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
            hint={fmtDurationSec(live.uptimeSec)}
          />
        </div>

        {/* Estado actual: por qué NO está corriendo, si es el caso */}
        {live.status === 'detenida' && (
          <section className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-red-300/80">
              <PauseCircle className="h-3 w-3" />
              Ahora mismo
            </div>
            <p className="mt-1 text-sm text-white">
              Línea detenida{live.currentReason ? ` — ${live.currentReason}` : ''}
              {live.currentSinceAt && (
                <span className="text-white/50">
                  {' '}(desde {fmtWallTime(live.currentSinceAt)}, {fmtAgoWall(live.currentSinceAt, now)})
                </span>
              )}
            </p>
          </section>
        )}

        <Sparkbars series={live.series} />

        {/* Desglose por máquina — solo aporta cuando la línea tiene más de una */}
        {live.machines.length > 1 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-white/45">Por máquina</div>
            <ul className="mt-2 space-y-2">
              {live.machines.map(m => (
                <li key={m.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      m.status === 'produciendo' ? 'bg-emerald-400' : m.status === 'detenida' ? 'bg-red-400' : 'bg-white/30'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {m.name}
                    {m.model && <span className="ml-1 text-[11px] text-white/35">{m.model}</span>}
                  </span>
                  <span className="tabular-nums text-white/80">{fmtInt(m.pieces)} pz</span>
                  <span className="w-20 text-right tabular-nums text-[11px] text-white/40">
                    {fmtInt(m.piecesPerHour)} pz/h
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Paros del turno: lo que explica la diferencia entre lo hecho y lo posible */}
        {live.topStops.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-white/45">
              Detenciones del turno
            </div>
            <ul className="mt-2 space-y-1.5">
              {live.topStops.map(s => (
                <li key={s.reason} className="flex items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate text-white/80">{s.reason}</span>
                  <span className="tabular-nums text-white/60">{fmtDurationSec(s.sec)}</span>
                  <span className="w-12 text-right tabular-nums text-[11px] text-white/35">
                    {s.count}×
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Frescura y procedencia */}
        <footer className="space-y-1 pb-6 pt-1 text-center text-[11px] text-white/30">
          <p className={stale ? 'text-amber-400/80' : 'text-white/40'}>
            <RefreshCw className="mr-1 inline h-3 w-3" />
            Datos de planta actualizados {fmtAgo(live.lastSyncAt, now)}
            {stale && ' — la sincronización puede estar detenida'}
          </p>
          <p>
            Se actualiza solo · solo lectura · compartido por {data.createdBy}
          </p>
          {data.mode === 'line' && (
            <p className="text-white/40">
              Este link no caduca con el turno: al arrancar el siguiente, cambia solo.
            </p>
          )}
          <p>
            Link válido hasta {new Date(data.expiresAt).toLocaleString('es-CL', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </footer>
      </main>
    </div>
  )
}
