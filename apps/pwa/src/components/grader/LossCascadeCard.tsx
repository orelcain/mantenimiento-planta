/**
 * LossCascadeCard — cascada de pérdidas de tiempo del turno (línea completa).
 *
 * Responde LA pregunta de la meta grande: ¿qué limitó que las máquinas
 * produjeran su máximo, y de quién es cada pérdida?
 *
 *   Tiempo turno (suma máquinas)
 *   − Planificado (colación, ejercicio compensatorio…)  → personas, acordado
 *   = TECHO real de máquina                              ← denominador honesto
 *   − Externo (falta MMPP, cuota…)                       → proceso, NO Mantención
 *   − Mantención (averías, ajustes, micro, cintas)       → lo nuestro
 *   − Sin clasificar                                     → visible, jamás oculto
 *   = Uso real (uptime)
 *
 * Piezas máx teóricas = Σ por máquina (techo_m × cadencia_m), con cadencia_m =
 * ciclos/uptime de ESA máquina en ESTE turno (su ritmo real demostrado, no un
 * target de catálogo). Piezas perdidas por causal = duración × cadencia.
 *
 * NOTA vs `shiftRuntime` (uptime % actual): ese indicador incluye colación y
 * ejercicio en el denominador → castiga a la máquina por pausas de personas.
 * `usoReal` de esta cascada usa el techo (sin planificado): es el % honesto.
 *
 * Misma dinámica que la Cascada del mes (GraderHistoricalCalendar, pestaña
 * panorámica): celdas ordenadas de mayor a menor, filtro por grupo (click),
 * % sobre base común (turno completo) + % sobre techo en las pérdidas, y caja
 * "¿cómo se calcula?" — pedido explícito de Orel 2026-07-22 de portar "las
 * demás cualidades que tiene el de afuera del mes" a la cascada del turno.
 */

import { useMemo, useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cascadeFromStates, classifyLossState, LOSS_BUCKET_META, type LossBucket } from '@/services/shoplogix/lossBuckets'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'
import { useTimelineSyncOptional } from './useTimelineSync'

function fmtHm(sec: number): string {
  if (sec <= 0) return '0m'
  const m = Math.round(sec / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

const BUCKET_COLOR: Record<string, string> = {
  'planificado':    'bg-slate-500/60',
  'externo':        'bg-amber-500/70',
  'mantencion':     'bg-rose-500/70',
  'sin-clasificar': 'bg-violet-500/60',
  'produccion':     'bg-emerald-500/75',
}

/** Persistido entre turnos: si el usuario colapsa la cascada, se queda así
 *  hasta que la vuelva a abrir (pedido Orel: "que guarde el estado en que se
 *  deja" en vez de recordarse cerrada/abierta solo dentro de este turno). */
const EXPANDED_KEY = 'graderLossCascadeExpanded'

export function LossCascadeCard({ machines }: { machines: UpstreamMachineShift[] }) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem(EXPANDED_KEY)
    return stored === null ? true : stored === '1'
  })
  useEffect(() => {
    window.localStorage.setItem(EXPANDED_KEY, expanded ? '1' : '0')
  }, [expanded])

  const [filter, setFilter] = useState<'all' | LossBucket>('all')
  // Selección fina DENTRO de una causal: click en el badge "Ev 1/2/3" de una
  // fila (ej. AJUSTE MANTENIMIENTO → Ev 2) — resalta y cuenta SOLO los eventos
  // de esa máquina para esa causal, no las 3 (Orel 2026-07-22).
  const [causeMachine, setCauseMachine] = useState<{ bucket: LossBucket; label: string; machine: string } | null>(null)
  const [calcOpen, setCalcOpen] = useState(false)
  const timelineSync = useTimelineSyncOptional()

  /** Mismo criterio de etiqueta que usa la agregación de causas más abajo —
   *  necesario acá para poder volver a filtrar states CRUDOS por causal. */
  const stateCauseLabel = (s: { name: string; reason: string }) =>
    s.reason || (s.name.toLowerCase().includes('micro') ? 'Micro detenciones' : 'Sin causal anotada')
  const shortMachineName = (name: string) => name.replace(/^YAL\s+/i, '').replace(/Evisceradora/i, 'Ev')

  // Filtrar por grupo (o por causal+máquina específica) RESALTA en los 3
  // Gantts + el chart de velocidad upstream — "demostrar" cómo se comportaron
  // las Baader ahí (Orel 2026-07-22), no solo listarlo como texto.
  useEffect(() => {
    if (!timelineSync) return
    if (causeMachine) {
      const ranges = machines
        .filter((m) => shortMachineName(m.machineName) === causeMachine.machine)
        .flatMap((m) => m.states
          .filter((s) => classifyLossState(s) === causeMachine.bucket && stateCauseLabel(s) === causeMachine.label)
          .map((s) => ({ startMs: s.startAt.getTime(), endMs: s.endAt.getTime() })))
      timelineSync.setHighlightRanges(ranges)
    } else if (filter === 'all') {
      timelineSync.setHighlightRanges([])
    } else {
      const ranges = machines.flatMap((m) =>
        m.states
          .filter((s) => classifyLossState(s) === filter)
          .map((s) => ({ startMs: s.startAt.getTime(), endMs: s.endAt.getTime() })),
      )
      timelineSync.setHighlightRanges(ranges)
    }
    // Al desmontar (cambiar de turno) limpiar — evita que el resaltado de un
    // turno anterior "sangre" al siguiente si el usuario navega con el filtro activo.
    return () => timelineSync.setHighlightRanges([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, causeMachine, machines])

  const data = useMemo(() => {
    if (machines.length === 0) return null
    // Cascada de tiempo: suma de las máquinas (horas-máquina, igual que el
    // resto del panel). Piezas: cadencia real por máquina × su propio techo.
    const perMachine = machines.map((m) => {
      const cascade = cascadeFromStates(m.states)
      const cadencePzSec = cascade.produccionSec > 0 ? m.totalCycles / cascade.produccionSec : 0
      return { m, cascade, cadencePzSec }
    })
    const sum = (f: (x: typeof perMachine[number]) => number) => perMachine.reduce((a, x) => a + f(x), 0)
    const totals = {
      produccionSec:    sum(x => x.cascade.produccionSec),
      planificadoSec:   sum(x => x.cascade.planificadoSec),
      externoSec:       sum(x => x.cascade.externoSec),
      mantencionSec:    sum(x => x.cascade.mantencionSec),
      sinClasificarSec: sum(x => x.cascade.sinClasificarSec),
      techoSec:         sum(x => x.cascade.techoSec),
    }
    const usoReal = totals.techoSec > 0 ? totals.produccionSec / totals.techoSec : 0
    const piezasReales = sum(x => x.m.totalCycles)
    const piezasMax = Math.round(sum(x => x.cascade.techoSec * x.cadencePzSec))

    // Piezas perdidas POR CAUSAL: duración de la causal en cada máquina × la
    // cadencia de esa máquina. Agrupadas por (bucket, reason) entre máquinas,
    // pero conservando QUÉ Baader(s) aportó cada causal (pedido Orel: "AJUSTE
    // MANTENIMIENTO ¿en qué Baader fue?" — antes se perdía al sumar entre las 3).
    const lossByCause = new Map<string, { bucket: LossBucket; label: string; sec: number; piezas: number; count: number; machines: Set<string> }>()
    for (const x of perMachine) {
      const shortName = x.m.machineName.replace(/^YAL\s+/i, '').replace(/Evisceradora/i, 'Ev')
      for (const item of x.cascade.items) {
        const label = item.reason || (item.name.toLowerCase().includes('micro') ? 'Micro detenciones' : 'Sin causal anotada')
        const key = `${item.bucket}__${label}`
        const cur = lossByCause.get(key) ?? { bucket: item.bucket, label, sec: 0, piezas: 0, count: 0, machines: new Set<string>() }
        cur.sec += item.durationSec
        cur.piezas += item.durationSec * x.cadencePzSec
        cur.count += item.count
        cur.machines.add(shortName)
        lossByCause.set(key, cur)
      }
    }
    const causes = [...lossByCause.values()]
      .map(c => ({ ...c, piezas: Math.round(c.piezas), machines: [...c.machines].sort() }))
      .sort((a, b) => b.piezas - a.piezas)

    return { totals, usoReal, piezasReales, piezasMax, causes }
  }, [machines])

  if (!data || data.totals.techoSec <= 0) return null

  const { totals, usoReal, piezasReales, piezasMax, causes } = data
  const turnoSec = totals.techoSec + totals.planificadoSec
  const pctOfTecho = (sec: number) => (totals.techoSec > 0 ? (sec / totals.techoSec) * 100 : 0)
  const pctOfTurno = (sec: number) => (turnoSec > 0 ? (sec / turnoSec) * 100 : 0)
  const piezasPerdidas = Math.max(0, piezasMax - piezasReales)
  // Uptime clásico derivado de las MISMAS horas de la cascada (no de un
  // shiftRuntime promedio aparte) para que toda la aritmética del panel
  // se pueda verificar a mano, sumando 100% sobre el turno.
  const uptimeClasico = turnoSec > 0 ? (totals.produccionSec / turnoSec) * 100 : null

  const lossCells: Array<{
    id: LossBucket
    label: string
    sec: number
    pct: string
    pct2: string | null
    bg: string; text: string; ringHover: string; ringActive: string
    tip: string
  }> = [
    {
      id: 'externo' as LossBucket, label: '− Externo', sec: totals.externoSec,
      pct: `${pctOfTurno(totals.externoSec).toFixed(1)}% del turno`,
      pct2: `${pctOfTecho(totals.externoSec).toFixed(1)}% del techo`,
      bg: 'bg-amber-500/10', text: 'text-amber-500',
      ringHover: 'hover:ring-amber-400/40', ringActive: 'ring-1 ring-amber-400/70',
      tip: 'Falta MMPP, cumplimiento de cuota, energía — la máquina disponible pero el proceso no la alimentó. NO es pérdida de Mantención. Click para ver sus eventos.',
    },
    {
      id: 'planificado' as LossBucket, label: '− Planificado', sec: totals.planificadoSec,
      pct: `${pctOfTurno(totals.planificadoSec).toFixed(1)}% del turno`,
      pct2: null,
      bg: 'bg-slate-500/10', text: 'text-muted-foreground',
      ringHover: 'hover:ring-slate-400/40', ringActive: 'ring-1 ring-slate-400/70',
      tip: 'Colación, ejercicio compensatorio, cambio de turno — pausas de personas acordadas. Se descuentan ANTES de medir a la máquina (fuera del techo). Click para ver sus eventos.',
    },
    {
      id: 'mantencion' as LossBucket, label: '− Mantención', sec: totals.mantencionSec,
      pct: `${pctOfTurno(totals.mantencionSec).toFixed(1)}% del turno`,
      pct2: `${pctOfTecho(totals.mantencionSec).toFixed(1)}% del techo`,
      bg: 'bg-rose-500/10', text: 'text-rose-400',
      ringHover: 'hover:ring-rose-400/40', ringActive: 'ring-1 ring-rose-400/70',
      tip: 'Averías, ajustes de mantenimiento, micro detenciones, cintas — el frente que Mantención debe reducir. Click para ver sus eventos.',
    },
    {
      id: 'sin-clasificar' as LossBucket, label: '− Sin clasif.', sec: totals.sinClasificarSec,
      pct: `${pctOfTurno(totals.sinClasificarSec).toFixed(1)}% del turno`,
      pct2: `${pctOfTecho(totals.sinClasificarSec).toFixed(1)}% del techo`,
      bg: 'bg-violet-500/10', text: 'text-violet-400',
      ringHover: 'hover:ring-violet-400/40', ringActive: 'ring-1 ring-violet-400/70',
      tip: 'Causal desconocida o sin anotar en Shoplogix (ej. LOGICA). Anotarla le asigna dueño. Click para ver sus eventos.',
    },
  ].sort((a, b) => b.sec - a.sec)

  const filtered = filter === 'all' ? causes : causes.filter((c) => c.bucket === filter)
  const techoCauses = filtered.filter((c) => c.bucket !== 'planificado')
  const plannedCauses = filtered.filter((c) => c.bucket === 'planificado')
  const filterMeta = filter === 'externo' || filter === 'mantencion' || filter === 'sin-clasificar'
    ? LOSS_BUCKET_META[filter]
    : null
  const filterSec = filtered.reduce((a, c) => a + c.sec, 0)
  const filterPz  = techoCauses.reduce((a, c) => a + c.piezas, 0)

  return (
    <div className="mb-4 pb-4 border-b border-border/60">
      {/* Header MÁS VISIBLE: antes se perdía como una línea gris más — ahora
          card propia con borde e ícono a color, para que "se note que se puede
          desplegar" (Orel 2026-07-22). */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 group rounded-md border border-sky-500/25 bg-sky-500/5 px-3 py-2 hover:bg-sky-500/10 transition-colors"
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-sky-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-sky-400 shrink-0" />}
        <Scale className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-[13px] font-semibold text-foreground/90">
          Cascada del turno
        </span>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">¿qué limitó la producción?</span>
        <span className="ml-auto flex items-center gap-3 text-[11px] tabular-nums">
          <span title="Uso real = tiempo produciendo / techo de máquina (descontada colación y pausas planificadas de personas). Es el uptime honesto — el % de uptime clásico castiga a la máquina por la colación.">
            Uso real <b className="text-emerald-400 text-sm">{(usoReal * 100).toFixed(0)}%</b>
          </span>
          <span title={`Piezas máximas teóricas del turno = techo de máquina × cadencia real demostrada por cada Baader en este turno.\nReales: ${piezasReales.toLocaleString('es-CL')} · Máx: ${piezasMax.toLocaleString('es-CL')}`}>
            <b>{piezasReales.toLocaleString('es-CL')}</b>
            <span className="text-muted-foreground"> / {piezasMax.toLocaleString('es-CL')} pz</span>
          </span>
        </span>
      </button>

      {/* Barra apilada sobre el TECHO (planificado queda fuera, como corresponde) */}
      <div className="mt-2 flex h-2.5 rounded-full overflow-hidden bg-muted/60">
        {totals.produccionSec    > 0 && <div className={BUCKET_COLOR['produccion']}    style={{ width: `${pctOfTecho(totals.produccionSec)}%` }} title={`Produciendo: ${fmtHm(totals.produccionSec)}`} />}
        {totals.externoSec       > 0 && <div className={BUCKET_COLOR['externo']}       style={{ width: `${pctOfTecho(totals.externoSec)}%` }} title={`Externo (proceso): ${fmtHm(totals.externoSec)}`} />}
        {totals.mantencionSec    > 0 && <div className={BUCKET_COLOR['mantencion']}    style={{ width: `${pctOfTecho(totals.mantencionSec)}%` }} title={`Mantención (equipos): ${fmtHm(totals.mantencionSec)}`} />}
        {totals.sinClasificarSec > 0 && <div className={BUCKET_COLOR['sin-clasificar']} style={{ width: `${pctOfTecho(totals.sinClasificarSec)}%` }} title={`Sin clasificar: ${fmtHm(totals.sinClasificarSec)}`} />}
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setCalcOpen((v) => !v)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border transition-colors',
                calcOpen ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'bg-muted text-muted-foreground border-border hover:bg-accent',
              )}
            >
              ¿cómo se calcula?
            </button>
          </div>
          {calcOpen && (
            <div className="rounded border border-sky-500/25 bg-sky-500/5 px-3 py-2 text-[11px] space-y-1 font-mono tabular-nums">
              <div>
                <span className="text-muted-foreground">Turno (Σ máq) = tiempo rastreado por Shoplogix en el turno × 3 Baader (procesando + pausas + paros + setup; colación incluida hasta el paso siguiente) = </span>
                <b>{fmtHm(turnoSec)}</b>
              </div>
              <div>
                <span className="text-muted-foreground">Techo de máquina = turno − planificado = </span>
                {fmtHm(turnoSec)} − {fmtHm(totals.planificadoSec)} = <b className="text-sky-400">{fmtHm(totals.techoSec)}</b>
              </div>
              <div>
                <span className="text-muted-foreground">Uso real = procesando ÷ techo = </span>
                {fmtHm(totals.produccionSec)} ÷ {fmtHm(totals.techoSec)} = <b className="text-emerald-400">{(usoReal * 100).toFixed(1)}%</b>
              </div>
              {uptimeClasico != null && (
                <div>
                  <span className="text-muted-foreground">Uptime clásico = procesando ÷ turno completo = </span>
                  {fmtHm(totals.produccionSec)} ÷ {fmtHm(turnoSec)} = <b>{uptimeClasico.toFixed(1)}%</b>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Piezas máx = techo de cada Baader × su cadencia real de este turno (piezas÷hora demostradas) = </span>
                <b>{piezasMax.toLocaleString('es-CL')} pz</b>
              </div>
              <div>
                <span className="text-muted-foreground">Verificación (todo sobre el turno completo): </span>
                {pctOfTurno(totals.produccionSec).toFixed(1)}% uso real + {pctOfTurno(totals.externoSec).toFixed(1)}% externo + {pctOfTurno(totals.planificadoSec).toFixed(1)}% planificado + {pctOfTurno(totals.mantencionSec).toFixed(1)}% mantención + {pctOfTurno(totals.sinClasificarSec).toFixed(1)}% sin clasif. = <b>{(pctOfTurno(totals.produccionSec) + pctOfTurno(totals.externoSec) + pctOfTurno(totals.planificadoSec) + pctOfTurno(totals.mantencionSec) + pctOfTurno(totals.sinClasificarSec)).toFixed(1)}%</b>
              </div>
            </div>
          )}

          {/* Cascada numérica ORDENADA de mayor a menor (niveles primero, luego
              pérdidas por magnitud) — mismo criterio que la Cascada del mes.
              Los grupos de pérdida son BOTONES: click filtra la lista abajo. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 text-[11px]">
            <div className="rounded bg-muted/40 px-2 py-1.5" title="Suma del tiempo rastreado por Shoplogix en el turno, de las 3 máquinas (procesando + pausas + paros + setup).">
              <div className="text-muted-foreground text-[9px] uppercase">Turno (Σ máq)</div>
              <div className="font-mono tabular-nums">{fmtHm(turnoSec)}</div>
              <div className="text-[9px] text-muted-foreground/60">100%</div>
            </div>
            <div className="rounded bg-sky-500/10 px-2 py-1.5" title="Techo real de máquina = turno − planificado. El denominador honesto: todo este tiempo la máquina PODÍA producir. Es un subtotal (no se suma con las demás celdas).">
              <div className="text-sky-400 text-[9px] uppercase">= Techo máquina</div>
              <div className="font-mono tabular-nums font-semibold">{fmtHm(totals.techoSec)}</div>
              <div className="text-[9px] text-muted-foreground/60 tabular-nums">{pctOfTurno(totals.techoSec).toFixed(1)}% del turno · subtotal</div>
            </div>
            <div className="rounded bg-emerald-500/10 px-2 py-1.5" title="Tiempo efectivamente produciendo (uptime).">
              <div className="text-emerald-400 text-[9px] uppercase">= Uso real</div>
              <div className="font-mono tabular-nums font-semibold">{fmtHm(totals.produccionSec)}</div>
              <div className="text-[9px] text-muted-foreground/60 tabular-nums">{pctOfTurno(totals.produccionSec).toFixed(1)}% del turno</div>
              <div className="text-[9px] text-emerald-400/70 tabular-nums">{(usoReal * 100).toFixed(1)}% del techo</div>
            </div>
            {lossCells.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setFilter((f) => (f === c.id ? 'all' : c.id)); setCauseMachine(null) }}
                className={cn('rounded px-2 py-1.5 text-left transition-shadow hover:ring-1', c.bg, c.ringHover, filter === c.id && c.ringActive)}
                title={c.tip}
              >
                <div className={cn('text-[9px] uppercase', c.text)}>{c.label}</div>
                <div className="font-mono tabular-nums">{fmtHm(c.sec)}</div>
                <div className="text-[9px] text-muted-foreground/60 tabular-nums">{c.pct}</div>
                {c.pct2 && <div className="text-[9px] text-muted-foreground/40 tabular-nums">{c.pct2}</div>}
              </button>
            ))}
          </div>

          {causeMachine ? (
            <div className="flex items-center gap-2 text-[11px] rounded border border-amber-400/40 bg-amber-500/10 px-2 py-1.5">
              <span className="w-2 h-2 rounded-sm shrink-0 bg-amber-400" />
              <span>
                Resaltando: <b>{causeMachine.label}</b> en <b>{causeMachine.machine}</b>
                <span className="text-muted-foreground"> · mira las bandas amarillas en el Gantt de esa máquina y en la velocidad upstream</span>
              </span>
              <button
                type="button"
                onClick={() => setCauseMachine(null)}
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                ✕ quitar
              </button>
            </div>
          ) : filter !== 'all' && (
            <div className="flex items-center gap-2 text-[11px] rounded border border-border bg-muted/40 px-2 py-1.5">
              <span className={cn('w-2 h-2 rounded-sm shrink-0', BUCKET_COLOR[filter] ?? 'bg-slate-500/60')} />
              <span>
                Filtrando: <b>{filter === 'planificado' ? 'Planificado' : filterMeta?.label ?? filter}</b>
                <span className="text-muted-foreground tabular-nums"> · {filtered.length} causal{filtered.length === 1 ? '' : 'es'} · {fmtHm(filterSec)}{filter !== 'planificado' ? ` · ≈ ${filterPz.toLocaleString('es-CL')} pz` : ' (fuera del techo, sin costo en piezas)'}</span>
              </span>
              <button
                type="button"
                onClick={() => { setFilter('all'); setCauseMachine(null) }}
                className="ml-auto text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                ✕ quitar filtro
              </button>
            </div>
          )}

          {/* Piezas perdidas por causal — "la culpa, con número". SOLO buckets
              que restan del techo: lo planificado (colación, ejercicio) se
              descuenta ANTES del techo, así que sus piezas NO están "bajo el
              máximo" — mezclarlo hacía que las causales sumaran más que la
              pérdida total. Se listan aparte, sin ≈pz. */}
          {techoCauses.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
                {filter === 'all'
                  ? `Piezas perdidas por causal · ${piezasPerdidas.toLocaleString('es-CL')} pz bajo el máximo teórico`
                  : 'Eventos del grupo · con su costo en piezas'}
              </p>
              <div className="space-y-0.5">
                {techoCauses.map((c) => {
                  const meta = LOSS_BUCKET_META[c.bucket as keyof typeof LOSS_BUCKET_META]
                  return (
                    <div key={`${c.bucket}-${c.label}`} className="flex items-center gap-2 text-[11px]">
                      <span className={cn('w-2 h-2 rounded-sm shrink-0', BUCKET_COLOR[c.bucket] ?? 'bg-slate-500/60')} />
                      <span className="truncate">{c.label}</span>
                      <span className="text-[9px] text-muted-foreground shrink-0">{meta?.owner ?? ''}</span>
                      {/* Qué Baader(s) aportó esta causal — antes se perdía al
                          sumar las 3 máquinas (Orel: "¿en qué Baader fue?").
                          Cada badge es clickeable: filtra y resalta SOLO los
                          eventos de esa máquina para esta causal específica. */}
                      <span className="flex gap-0.5 shrink-0">
                        {c.machines.map((mn) => {
                          const active = causeMachine?.bucket === c.bucket && causeMachine?.label === c.label && causeMachine?.machine === mn
                          return (
                            <button
                              key={mn}
                              type="button"
                              onClick={() => setCauseMachine((prev) =>
                                prev && prev.bucket === c.bucket && prev.label === c.label && prev.machine === mn
                                  ? null
                                  : { bucket: c.bucket, label: c.label, machine: mn },
                              )}
                              className={cn(
                                'text-[8px] px-1 rounded bg-muted border transition-colors hover:border-amber-400/60 hover:text-foreground',
                                active ? 'border-amber-400/80 text-amber-400 bg-amber-500/10' : 'border-border/60 text-muted-foreground/80',
                              )}
                              title={`Ver solo los eventos de "${c.label}" en ${mn}`}
                            >
                              {mn}
                            </button>
                          )
                        })}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60 tabular-nums shrink-0">×{c.count}</span>
                      <span className="ml-auto font-mono tabular-nums shrink-0">{fmtHm(c.sec)}</span>
                      <span className="font-mono tabular-nums text-muted-foreground/60 w-14 text-right shrink-0 text-[10px]">
                        {pctOfTecho(c.sec).toFixed(1)}%
                      </span>
                      <span className="font-mono tabular-nums text-muted-foreground w-20 text-right shrink-0">
                        ≈ {c.piezas.toLocaleString('es-CL')} pz
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {plannedCauses.length > 0 && (
            <div>
              <p className="text-[9px] text-muted-foreground/70 uppercase tracking-wider mb-1">
                Pausas planificadas · fuera del techo (no cuentan como pérdida)
              </p>
              <div className="space-y-0.5 opacity-70">
                {plannedCauses.map((c) => (
                  <div key={`${c.bucket}-${c.label}`} className="flex items-center gap-2 text-[11px]">
                    <span className="w-2 h-2 rounded-sm shrink-0 bg-slate-500/60" />
                    <span className="truncate">{c.label}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0">Personas (acordado)</span>
                    <span className="text-[9px] text-muted-foreground/60 tabular-nums shrink-0">×{c.count}</span>
                    <span className="ml-auto font-mono tabular-nums shrink-0">{fmtHm(c.sec)}</span>
                    <span className="font-mono tabular-nums text-muted-foreground/60 w-14 text-right shrink-0 text-[10px]">
                      {pctOfTurno(c.sec).toFixed(1)}%
                    </span>
                    <span className="w-20 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {totals.sinClasificarSec > 0 && filter === 'all' && (
            <p className="text-[10px] text-violet-400/80">
              ⚠ {fmtHm(totals.sinClasificarSec)} sin clasificar — causal desconocida o sin anotar en Shoplogix.
              Anotarla permite asignarle dueño (y sacarla de la duda).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
