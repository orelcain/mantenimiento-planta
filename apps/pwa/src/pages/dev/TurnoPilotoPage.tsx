import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button, Pill, ListGroup, ListCell, CellIcon, Sheet, StatRing } from '@/components/piel'
import { PLANT_LINES, getPlantLineConfig } from '@/config/plantLines'
import { loadLatestActiveShift, type LatestShift } from '@/services/grader/turnoKpis'
import { getDailySummary } from '@/services/grader/graderDailySummary.service'
import { useUpstreamLineSnapshot } from '@/hooks/useUpstreamLineSnapshot'
import { aggregateShifts, cadenceCpm } from '@/services/grader/plantKpiCompute'
import { cascadeFromStates } from '@/services/shoplogix/lossBuckets'
import type { GraderDailySummary } from '@/services/grader/types'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

/**
 * PANTALLA PILOTO de la nueva piel: Análisis de Turno con DATOS REALES.
 * Ruta `/dev/turno-piloto` (dev, fuera del menú). Normas: docs/NUEVA_PIEL_APPLE_HIG.md
 *
 * Qué prueba y qué no: prueba que la piel y los primitivos aguantan datos de
 * planta de verdad —nombres largos, KPIs nulos, turnos sin actividad— que es
 * donde un mockup siempre miente. NO reemplaza a AnalisisGraderTurnoPage: esa
 * sigue intacta en producción, y esta es su versión de al lado para comparar.
 *
 * Fuente de datos: exactamente la misma que la página real (loadLatestActiveShift
 * + getDailySummary + useUpstreamLineSnapshot en tiempo real). Si acá los números
 * difieren de la página real, es un bug del piloto, no de la piel.
 *
 * La estructura sigue la decisión de §4: la pantalla se ORDENA POR URGENCIA —
 * si hay una máquina detenida ahora, manda ella; si no, manda el OEE y el "sin
 * incidencias" se muestra como logro de Mantención.
 */

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  // Espacio fino como separador de miles: no se confunde con un punto decimal.
  return Math.round(n).toLocaleString('es-CL').replace(/\./g, ' ')
}

function fmtMin(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

/** Estado actual de una máquina, derivado del state marcado `isCurrent`. */
function machineNow(m: UpstreamMachineShift) {
  const cur = m.states?.find((s) => s.isCurrent)
  const down = cur?.type === 'downtime'
  return {
    down,
    idle: !cur,
    label: down
      ? `Detenida · ${cur?.reason || cur?.name || 'sin causa registrada'}`
      : cur?.type === 'uptime'
        ? 'Operando'
        : cur?.type === 'setup'
          ? 'Setup'
          : cur?.type === 'break'
            ? 'Colación / pausa'
            : 'Sin actividad',
    sinceSec: cur ? Math.max(0, (Date.now() - new Date(cur.startAt).getTime()) / 1000) : null,
  }
}

function initials(name: string): string {
  const clean = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim()
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return ((parts[0]![0] ?? '') + (parts[1]![0] ?? '')).toUpperCase()
}

export default function TurnoPilotoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const cfg = useMemo(() => getPlantLineConfig(searchParams.get('linea') ?? ''), [searchParams])

  const [latest, setLatest] = useState<LatestShift | null>(null)
  const [summary, setSummary] = useState<GraderDailySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<UpstreamMachineShift | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    setLatest(null)
    setSummary(null)
    loadLatestActiveShift(cfg.plantSlug)
      .then(async (ls) => {
        if (!alive) return
        setLatest(ls)
        if (ls) {
          const s = await getDailySummary(ls.dateKey, ls.shiftId, cfg.id).catch(() => null)
          if (alive) setSummary(s)
        }
      })
      .catch((e) => alive && setError(e?.message ?? String(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [cfg.plantSlug, cfg.id])

  // Tiempo real: una vez conocido el turno, el snapshot manda sobre la carga inicial.
  const { snapshot, syncedAt } = useUpstreamLineSnapshot(
    latest?.dateKey ?? null,
    latest?.shiftId ?? null,
    cfg.plantSlug,
  )
  // Memoizado: sin esto la lista se recrea en cada render y los useMemo de abajo
  // (KPIs y cascada, que recorren todos los states) se recalculan siempre.
  const machines = useMemo(
    () => snapshot?.machines ?? latest?.machines ?? [],
    [snapshot?.machines, latest?.machines],
  )

  const kpis = useMemo(() => {
    if (!latest || machines.length === 0) return null
    return aggregateShifts(
      [{ dateKey: latest.dateKey, shiftId: latest.shiftId, machines }],
      `${latest.dateKey} ${latest.shiftId}`,
      summary ? [summary] : [],
    )
  }, [latest, machines, summary])

  const cascade = useMemo(
    () => cascadeFromStates(machines.flatMap((m) => m.states ?? [])),
    [machines],
  )

  // Ordenar por urgencia: detenidas primero, luego por cadencia descendente.
  const rows = useMemo(
    () =>
      machines
        .map((m) => ({ m, now: machineNow(m), cpm: cadenceCpm(m.totalCycles ?? 0, m.shiftRuntimeBreakdown?.uptimeSec ?? 0) }))
        .sort((a, b) => Number(b.now.down) - Number(a.now.down) || b.cpm - a.cpm),
    [machines],
  )
  const downNow = rows.filter((r) => r.now.down)
  const worst = downNow[0] ?? null

  /**
   * El anillo es el protagonista de la pantalla (§7) y no puede quedar hueco.
   * El OEE necesita Calidad, que solo existe si hay Excel del Grader cargado —
   * y hay casos donde NO va a existir nunca (Filete no tiene Grader) o todavía
   * no existe (turno en curso, antes de la carga). Detectado al probar el
   * piloto con datos: sin este fallback la pantalla abría con un "—" gigante.
   * Cuando falta OEE, el anillo pasa a Disponibilidad —siempre calculable desde
   * Shoplogix— y lo dice, en vez de fingir que el dato no importa.
   */
  const ringIsOee = kpis?.oee != null
  const ringValue = ringIsOee ? kpis!.oee : (kpis?.availability ?? null)
  const ringLabel = ringIsOee ? 'OEE' : 'Disponib.'

  const cascadeParts = cascade
    ? [
        { key: 'produccion', label: 'Producción', sec: cascade.produccionSec, cls: 'bg-primary' },
        { key: 'mantencion', label: 'Mantención', sec: cascade.mantencionSec, cls: 'bg-red-500' },
        { key: 'externo', label: 'Externo', sec: cascade.externoSec, cls: 'bg-amber-500' },
        { key: 'planificado', label: 'Planificado', sec: cascade.planificadoSec, cls: 'bg-muted-foreground/60' },
        { key: 'sin-clasificar', label: 'Sin clasificar', sec: cascade.sinClasificarSec, cls: 'bg-muted-foreground/30' },
      ].filter((p) => p.sec > 0)
    : []
  const cascadeTotal = cascadeParts.reduce((a, p) => a + p.sec, 0)

  return (
    <div className="min-h-screen bg-background pb-16 text-foreground">
      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b border-border bg-card/80 px-5 py-3 backdrop-blur-xl">
        <span className="text-[0.8rem] font-semibold">
          ANTARFOOD <span className="font-normal text-muted-foreground">· Piloto de la piel</span>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={cfg.id}
            onChange={(e) => setSearchParams({ linea: e.target.value })}
            className="h-9 rounded-ctl border-0 bg-muted-foreground/10 px-3 text-[0.8rem] font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {PLANT_LINES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label} · {l.areaLabel}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="tinted"
            onClick={() => {
              const el = document.documentElement
              const dark = el.classList.toggle('dark')
              localStorage.setItem('app-theme', dark ? 'dark' : 'light')
            }}
          >
            Claro / Oscuro
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
        {/* ── Título grande ───────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 px-1">
          <h1 className="text-[2.05rem] font-bold leading-none tracking-[-0.028em]">
            {latest?.shiftId ?? 'Turno'}
          </h1>
          <span className="pb-0.5 text-[0.85rem] text-muted-foreground">
            {latest ? `${latest.dateKey} · ${cfg.label} ${cfg.areaLabel}` : cfg.label}
          </span>
          {syncedAt && (
            <span className="ml-auto pb-0.5">
              <Pill tone="ok" dot="pulse">
                En vivo · {syncedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
              </Pill>
            </span>
          )}
        </div>

        {/* ── Estados de carga / error / vacío ────────────────────────── */}
        {loading && (
          <div className="flex flex-col gap-3">
            {/* Skeleton, no spinner (§9): la silueta anticipa el layout real. */}
            <div className="h-[9.5rem] animate-pulse rounded-card bg-card" />
            <div className="h-24 animate-pulse rounded-card bg-card" />
            <div className="h-56 animate-pulse rounded-card bg-card" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-card bg-card p-5">
            <h2 className="text-[1rem] font-semibold">No se pudo cargar el turno</h2>
            <p className="mt-1 text-[0.85rem] text-muted-foreground">{error}</p>
          </div>
        )}

        {!loading && !error && !latest && (
          <div className="rounded-card bg-card p-8 text-center">
            <p className="text-[0.95rem] font-semibold">Sin turnos con actividad</p>
            <p className="mt-1 text-[0.85rem] text-muted-foreground">
              No hay datos de Shoplogix en los últimos 7 días para {cfg.label} {cfg.areaLabel}.
            </p>
          </div>
        )}

        {!loading && !error && latest && (
          <>
            {/* ── Urgencia primero (§4). Si hay detención AHORA, manda. ── */}
            {worst ? (
              <section className="overflow-hidden rounded-card border border-red-500/35 bg-card">
                <header className="flex items-center gap-2 bg-red-500/[0.08] px-4 py-2.5">
                  <AlertTriangle className="size-3.5 text-red-600" />
                  <span className="text-[0.68rem] font-bold uppercase tracking-[0.06em] text-red-600">
                    Requiere atención
                  </span>
                  <span className="ml-auto text-[0.85rem] font-semibold tabular-nums text-red-600">
                    {fmtMin(worst.now.sinceSec)}
                  </span>
                </header>
                <div className="px-4 py-3">
                  <p className="text-[1.02rem] font-semibold leading-tight">{worst.m.machineName}</p>
                  <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                    {worst.now.label}
                    {downNow.length > 1 && ` · +${downNow.length - 1} máquina(s) más detenida(s)`}
                  </p>
                </div>
                <div className="flex gap-2 px-4 pb-4">
                  <Button className="flex-1" onClick={() => setDetail(worst.m)}>
                    Ver detalle
                  </Button>
                  <Button variant="tinted" className="flex-1" onClick={() => setDetail(worst.m)}>
                    Registrar incidencia
                  </Button>
                </div>
              </section>
            ) : (
              // Sin fallas: el logro de Mantención es el protagonista (meta grande).
              <section className="flex flex-col items-center gap-3 rounded-card bg-card px-4 py-6 text-center">
                <StatRing value={ringValue} label={ringLabel} />
                <div>
                  <p className="flex items-center justify-center gap-1.5 text-[0.92rem] font-semibold text-emerald-600">
                    <CheckCircle2 className="size-4" /> Sin detenciones activas
                  </p>
                  <p className="mt-0.5 text-[0.8rem] text-muted-foreground">
                    {machines.length} máquina{machines.length === 1 ? '' : 's'} en el turno ·{' '}
                    {snapshot?.machinesProducing ?? 0} produciendo ahora
                  </p>
                </div>
              </section>
            )}

            {/* ── KPIs. Con detención activa el anillo baja de rango. ──── */}
            <section className="flex items-center gap-4 rounded-card bg-card px-4 py-4">
              {worst && <StatRing value={ringValue} label={ringLabel} size={82} />}
              <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                {[
                  { l: 'Piezas', v: fmtInt(summary?.totalPieces ?? null) },
                  // Si el anillo ya muestra Disponibilidad, acá va Rendimiento
                  // para no repetir el mismo número dos veces.
                  ringIsOee
                    ? { l: 'Disponib.', v: kpis?.availability != null ? `${(kpis.availability * 100).toFixed(0)}%` : '—' }
                    : { l: 'Rendim.', v: kpis?.performance != null ? `${(kpis.performance * 100).toFixed(0)}%` : '—' },
                  { l: 'MTTR', v: kpis?.mttrMin ? `${Math.round(kpis.mttrMin)} min` : '—' },
                  { l: 'MTBF', v: kpis?.mtbfHours ? `${kpis.mtbfHours.toFixed(1)} h` : '—' },
                ].map((k) => (
                  <div key={k.l}>
                    <p className="text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      {k.l}
                    </p>
                    <p className="text-[1.15rem] font-bold tabular-nums leading-tight tracking-[-0.02em]">{k.v}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Cascada de pérdidas ──────────────────────────────────── */}
            {cascadeTotal > 0 && (
              <section className="rounded-card bg-card px-4 py-4">
                <h2 className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                  Cascada de pérdidas · {fmtMin(cascadeTotal)}
                </h2>
                <div className="flex h-5 gap-[2px] overflow-hidden rounded-full">
                  {cascadeParts.map((p) => (
                    <div
                      key={p.key}
                      className={`${p.cls} rounded-[3px]`}
                      style={{ width: `${(p.sec / cascadeTotal) * 100}%` }}
                      title={`${p.label}: ${fmtMin(p.sec)}`}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                  {cascadeParts.map((p) => (
                    <span key={p.key} className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                      <i className={`size-2 rounded-[3px] ${p.cls}`} />
                      {p.label} <b className="font-semibold tabular-nums text-foreground">{fmtMin(p.sec)}</b>
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* ── Máquinas ─────────────────────────────────────────────── */}
            <ListGroup
              title={`Máquinas · ${machines.length - downNow.length} de ${machines.length} operando`}
              footer="Datos en vivo de Shoplogix. Toca una máquina para ver su detalle."
            >
              {rows.map(({ m, now, cpm }) => (
                <ListCell
                  key={m.machineid}
                  leading={
                    <CellIcon className={now.down ? 'bg-red-500' : now.idle ? 'bg-muted-foreground' : 'bg-emerald-500'}>
                      {initials(m.machineName)}
                    </CellIcon>
                  }
                  title={m.machineName}
                  subtitle={now.label}
                  value={cpm > 0 ? `${cpm.toFixed(1)} pz/min` : '—'}
                  valueSub={fmtInt(m.totalCycles)}
                  onClick={() => setDetail(m)}
                />
              ))}
            </ListGroup>
          </>
        )}
      </main>

      {/* Detalle en Sheet, no en modal centrado (§5.4). */}
      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.machineName}
        description={detail ? machineNow(detail).label : undefined}
        actions={
          <>
            <Button variant="tinted" onClick={() => setDetail(null)}>
              Cerrar
            </Button>
            <Button onClick={() => setDetail(null)}>Registrar incidencia</Button>
          </>
        }
      >
        {detail && (
          <div className="flex flex-col gap-2">
            {[
              ['Ciclos del turno', fmtInt(detail.totalCycles)],
              ['Esperados', fmtInt(detail.expectedTotalCycles)],
              ['Tiempo produciendo', fmtMin(detail.shiftRuntimeBreakdown?.uptimeSec)],
              ['Detención', fmtMin(detail.shiftRuntimeBreakdown?.downtimeSec)],
              ['Setup', fmtMin(detail.shiftRuntimeBreakdown?.setupSec)],
            ].map(([l, v]) => (
              <div key={l} className="flex justify-between border-b border-border py-1.5 text-[0.85rem] last:border-b-0">
                <span className="text-muted-foreground">{l}</span>
                <b className="font-semibold tabular-nums">{v}</b>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </div>
  )
}
