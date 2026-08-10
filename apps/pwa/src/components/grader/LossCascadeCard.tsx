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
import { shortMachineName } from '@/services/grader/graderMachineNames'
import {
  estimateManualLine,
  MANUAL_LINE_LABEL,
  MANUAL_LINE_TOOLTIP,
} from '@/services/grader/graderManualLine'
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
  'planificado':    'bg-muted-foreground/[0.10]',
  'externo':        'bg-amber-500/[0.15]',
  'mantencion':     'bg-cat-5-tint/[0.15]',
  'sin-clasificar': 'bg-cat-6-tint/[0.15]',
  'produccion':     'bg-emerald-500/[0.15]',
}

/** Persistido entre turnos: si el usuario colapsa la cascada, se queda así
 *  hasta que la vuelva a abrir (pedido Orel: "que guarde el estado en que se
 *  deja" en vez de recordarse cerrada/abierta solo dentro de este turno). */
const EXPANDED_KEY = 'graderLossCascadeExpanded'

export function LossCascadeCard({
  machines,
  graderTotalPieces,
}: {
  machines: UpstreamMachineShift[]
  /**
   * Piezas totales que contó el Grader en el turno. Sirve para descontar la
   * línea manual de la pérdida: sin esto, las piezas que la planta SÍ produjo
   * a mano se cuentan como pérdida de máquina. Opcional — sin Excel del Grader
   * la cascada sigue funcionando en bruto, como antes.
   */
  graderTotalPieces?: number | null
}) {
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

  // Filtrar por grupo (o por causal+máquina específica) RESALTA en los 3
  // Gantts + el chart de velocidad upstream — "demostrar" cómo se comportaron
  // las Baader ahí (Orel 2026-07-22), no solo listarlo como texto.
  useEffect(() => {
    if (!timelineSync) return
    if (causeMachine) {
      // machineId presente → EXCLUSIVO de esa Baader (Orel 2026-07-23): las
      // otras 2 Gantt no se pintan aunque tengan su propia barra en el mismo
      // tramo horario. El chart de velocidad upstream sigue mostrando las 3
      // líneas (eso no cambia) — solo el Gantt filtra por dueño del rango.
      const targetMachine = machines.find((m) => shortMachineName(m.machineName) === causeMachine.machine)
      const ranges = targetMachine
        ? targetMachine.states
          .filter((s) => classifyLossState(s) === causeMachine.bucket && stateCauseLabel(s) === causeMachine.label)
          .map((s) => ({ startMs: s.startAt.getTime(), endMs: s.endAt.getTime(), machineId: targetMachine.machineid }))
        : []
      timelineSync.setHighlightRanges(ranges)
      timelineSync.setHighlightBucket(null)
      // Aísla la Baader filtrada en el panel: las otras 2 se ocultan (no solo
      // se dejan de resaltar) para verla sin bajar con scroll (Orel 2026-07-23).
      timelineSync.setIsolatedMachineId(targetMachine?.machineid ?? null)
    } else if (filter === 'all') {
      timelineSync.setHighlightRanges([])
      timelineSync.setHighlightBucket(null)
      timelineSync.setIsolatedMachineId(null)
    } else {
      // Filtro de GRUPO (Externo/Mantención/etc.): el chart upstream usa la
      // ventana de tiempo (ranges, cruza máquinas a propósito). Los Gantts
      // usan `highlightBucket` — cada barra se resalta según SU PROPIA causal
      // real, no por coincidir de horario con el evento de otra máquina (bug
      // reportado por Orel: Ev2/Ev3 marcaban tramos que no eran FALTA MMPP).
      const ranges = machines.flatMap((m) =>
        m.states
          .filter((s) => classifyLossState(s) === filter)
          .map((s) => ({ startMs: s.startAt.getTime(), endMs: s.endAt.getTime() })),
      )
      timelineSync.setHighlightRanges(ranges)
      timelineSync.setHighlightBucket(filter)
      timelineSync.setIsolatedMachineId(null)
    }
    // Al desmontar (cambiar de turno) limpiar — evita que el resaltado de un
    // turno anterior "sangre" al siguiente si el usuario navega con el filtro activo.
    return () => {
      timelineSync.setHighlightRanges([])
      timelineSync.setHighlightBucket(null)
      timelineSync.setIsolatedMachineId(null)
    }
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

    // Línea manual: piezas que la planta SÍ produjo, pero fuera de las Baader.
    //
    // La cascada mide capacidad de MÁQUINA, así que la pérdida bruta
    // (máx − ciclos Baader) está bien como está. Lo que faltaba es decir que
    // parte de esa pérdida se recuperó a mano: en el turno del 31-jul, 774 de
    // las 3.282 piezas "perdidas" salieron igual por la línea manual. Sin
    // descontarlas, el informe sobreestima la pérdida ~30% y hace ver el turno
    // peor de lo que fue.
    const manual = graderTotalPieces != null
      ? estimateManualLine({ graderPieces: graderTotalPieces, baaderCycles: piezasReales })
      : null

    // Piezas perdidas POR CAUSAL: duración de la causal en cada máquina × la
    // cadencia de esa máquina. Agrupadas por (bucket, reason) entre máquinas,
    // pero conservando QUÉ Baader(s) aportó cada causal (pedido Orel: "AJUSTE
    // MANTENIMIENTO ¿en qué Baader fue?" — antes se perdía al sumar entre las 3).
    const lossByCause = new Map<string, { bucket: LossBucket; label: string; sec: number; piezas: number; count: number; machines: Set<string> }>()
    for (const x of perMachine) {
      const shortName = shortMachineName(x.m.machineName)
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

    const perMachineOut = perMachine.map((x) => ({
      machineid: x.m.machineid,
      // Mismo nombre que la leyenda del gráfico. Antes acá se abreviaba a
      // "Ev 1" y en el gráfico a "M1": la misma máquina con dos nombres en la
      // misma pantalla, y ninguno de los dos es como se le dice en planta.
      name: shortMachineName(x.m.machineName),
      cascade: x.cascade,
      piezas: x.m.totalCycles,
      // Cadencia sobre el tiempo EN PROCESO, no sobre el turno completo: una
      // máquina detenida mostraría 0,3 pz/min y parecería lenta en vez de
      // parada. Son dos problemas distintos y se arreglan distinto.
      pzMin: x.cadencePzSec * 60,
    }))

    return { totals, usoReal, piezasReales, piezasMax, causes, perMachine: perMachineOut, manual }
  }, [machines, graderTotalPieces])

  if (!data || data.totals.techoSec <= 0) return null

  const { totals, usoReal, piezasReales, piezasMax, causes, perMachine, manual } = data
  const turnoSec = totals.techoSec + totals.planificadoSec
  const pctOfTecho = (sec: number) => (totals.techoSec > 0 ? (sec / totals.techoSec) * 100 : 0)
  const pctOfTurno = (sec: number) => (turnoSec > 0 ? (sec / turnoSec) * 100 : 0)
  const piezasPerdidas = Math.max(0, piezasMax - piezasReales)
  // Pérdida NETA: lo que no se recuperó por ningún lado. La bruta sigue siendo
  // la pérdida de capacidad de máquina (que es lo que mide esta cascada); la
  // neta es lo que realmente le faltó a la planta al final del turno.
  const recuperadas = manual ? Math.min(manual.manualPieces, piezasPerdidas) : 0
  const piezasPerdidasNetas = Math.max(0, piezasPerdidas - recuperadas)
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
      bg: 'bg-amber-500/[0.15]', text: 'text-amber-500',
      ringHover: 'hover:ring-amber-400/40', ringActive: 'ring-1 ring-amber-400/70',
      tip: 'Falta MMPP, cumplimiento de cuota, energía — la máquina disponible pero el proceso no la alimentó. NO es pérdida de Mantención. Click para ver sus eventos.',
    },
    {
      id: 'planificado' as LossBucket, label: '− Planificado', sec: totals.planificadoSec,
      pct: `${pctOfTurno(totals.planificadoSec).toFixed(1)}% del turno`,
      pct2: null,
      bg: 'bg-muted-foreground/[0.10]', text: 'text-muted-foreground',
      ringHover: 'hover:ring-slate-400/40', ringActive: 'ring-1 ring-slate-400/70',
      tip: 'Colación, ejercicio compensatorio, cambio de turno — pausas de personas acordadas. Se descuentan ANTES de medir a la máquina (fuera del techo). Click para ver sus eventos.',
    },
    {
      id: 'mantencion' as LossBucket, label: '− Mantención', sec: totals.mantencionSec,
      pct: `${pctOfTurno(totals.mantencionSec).toFixed(1)}% del turno`,
      pct2: `${pctOfTecho(totals.mantencionSec).toFixed(1)}% del techo`,
      bg: 'bg-cat-5-tint/[0.15]', text: 'text-rose-400',
      ringHover: 'hover:ring-rose-400/40', ringActive: 'ring-1 ring-rose-400/70',
      tip: 'Averías, ajustes de mantenimiento, micro detenciones, cintas — el frente que Mantención debe reducir. Click para ver sus eventos.',
    },
    {
      id: 'sin-clasificar' as LossBucket, label: '− Sin clasif.', sec: totals.sinClasificarSec,
      pct: `${pctOfTurno(totals.sinClasificarSec).toFixed(1)}% del turno`,
      pct2: `${pctOfTecho(totals.sinClasificarSec).toFixed(1)}% del techo`,
      bg: 'bg-cat-6-tint/[0.15]', text: 'text-violet-400',
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
        className="w-full flex items-center gap-2 group rounded-ctl border border-primary/[0.25] bg-primary/[0.15] px-3 py-2 hover:bg-primary/[0.15] transition-colors"
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-sky-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-sky-400 shrink-0" />}
        <Scale className="w-4 h-4 text-sky-400 shrink-0" />
        <span className="text-footnote font-semibold text-foreground/90">
          Cascada del turno
        </span>
        <span className="text-caption text-muted-foreground hidden sm:inline">¿qué limitó la producción?</span>
        <span className="ml-auto flex items-center gap-3 text-caption tabular-nums">
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
                'text-caption px-2 py-0.5 rounded-ctl border transition-colors',
                calcOpen ? 'bg-primary/[0.15] text-sky-400 border-primary/[0.25]' : 'bg-muted text-muted-foreground border-border hover:bg-accent',
              )}
            >
              ¿cómo se calcula?
            </button>
          </div>
          {calcOpen && (
            <div className="rounded-ctl border border-primary/[0.25] bg-primary/[0.15] px-3 py-2 text-caption space-y-1 font-mono tabular-nums">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 text-caption">
            <div className="rounded-ctl bg-muted/40 px-2 py-1.5" title="Suma del tiempo rastreado por Shoplogix en el turno, de las 3 máquinas (procesando + pausas + paros + setup).">
              <div className="text-muted-foreground text-caption uppercase">Turno (Σ máq)</div>
              <div className="font-mono tabular-nums">{fmtHm(turnoSec)}</div>
              <div className="text-caption text-muted-foreground/60">100%</div>
            </div>
            <div className="rounded-ctl bg-primary/[0.15] px-2 py-1.5" title="Techo real de máquina = turno − planificado. El denominador honesto: todo este tiempo la máquina PODÍA producir. Es un subtotal (no se suma con las demás celdas).">
              <div className="text-sky-400 text-caption uppercase">= Techo máquina</div>
              <div className="font-mono tabular-nums font-semibold">{fmtHm(totals.techoSec)}</div>
              <div className="text-caption text-muted-foreground/60 tabular-nums">{pctOfTurno(totals.techoSec).toFixed(1)}% del turno · subtotal</div>
            </div>
            <div className="rounded-ctl bg-emerald-500/[0.15] px-2 py-1.5" title="Tiempo efectivamente produciendo (uptime).">
              <div className="text-emerald-400 text-caption uppercase">= Uso real</div>
              <div className="font-mono tabular-nums font-semibold">{fmtHm(totals.produccionSec)}</div>
              <div className="text-caption text-muted-foreground/60 tabular-nums">{pctOfTurno(totals.produccionSec).toFixed(1)}% del turno</div>
              <div className="text-caption text-emerald-400/70 tabular-nums">{(usoReal * 100).toFixed(1)}% del techo</div>
            </div>
            {lossCells.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { setFilter((f) => (f === c.id ? 'all' : c.id)); setCauseMachine(null) }}
                className={cn('rounded-ctl px-2 py-1.5 text-left transition-shadow hover:ring-1', c.bg, c.ringHover, filter === c.id && c.ringActive)}
                title={c.tip}
              >
                <div className={cn('text-caption uppercase', c.text)}>{c.label}</div>
                <div className="font-mono tabular-nums">{fmtHm(c.sec)}</div>
                <div className="text-caption text-muted-foreground/60 tabular-nums">{c.pct}</div>
                {c.pct2 && <div className="text-caption text-muted-foreground/40 tabular-nums">{c.pct2}</div>}
              </button>
            ))}
          </div>

          {/* Desglose por máquina — REACTIVO al grupo seleccionado arriba
              (mismo patrón que la Cascada del mes, Orel 2026-07-23): sin
              filtro muestra uso real de siempre; con un grupo de pérdida
              activo muestra cuánto aportó cada Baader a ESE grupo (% =
              participación dentro del grupo, las 3 suman ~100%) + tiempo
              absoluto + qué fracción es de SU PROPIO techo/turno. */}
          {(() => {
            const activeBucket = filter === 'all' ? null : filter
            const bucketSecOf = (c: typeof perMachine[number]['cascade']) => {
              switch (activeBucket) {
                case 'externo':        return c.externoSec
                case 'mantencion':      return c.mantencionSec
                case 'sin-clasificar':  return c.sinClasificarSec
                case 'planificado':     return c.planificadoSec
                default:                return c.produccionSec
              }
            }
            const groupTotalSec = perMachine.reduce((a, m) => a + bucketSecOf(m.cascade), 0)
            const theme = activeBucket == null
              ? { bar: 'bg-emerald-500/[0.15]', text: 'text-emerald-400' }
              : activeBucket === 'externo'
              ? { bar: 'bg-amber-500/[0.15]', text: 'text-amber-400' }
              : activeBucket === 'mantencion'
              ? { bar: 'bg-cat-5-tint/[0.15]', text: 'text-rose-400' }
              : activeBucket === 'sin-clasificar'
              ? { bar: 'bg-cat-6-tint/[0.15]', text: 'text-violet-400' }
              : { bar: 'bg-muted-foreground/[0.10]', text: 'text-muted-foreground' }
            const groupLabel = activeBucket == null ? 'Uso real por máquina' : `${LOSS_BUCKET_META[activeBucket as keyof typeof LOSS_BUCKET_META]?.label ?? activeBucket} por máquina`
            return (
              <div className="space-y-1">
                <p className="text-caption text-muted-foreground uppercase tracking-wider">{groupLabel}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {perMachine.map((m) => {
                    const sec = bucketSecOf(m.cascade)
                    const shareOfGroup = groupTotalSec > 0 ? (sec / groupTotalSec) * 100 : 0
                    const ownDenomSec = activeBucket === 'planificado' ? m.cascade.techoSec + m.cascade.planificadoSec : m.cascade.techoSec
                    const pctOfOwnDenom = ownDenomSec > 0 ? (sec / ownDenomSec) * 100 : 0
                    const bigPct = activeBucket == null ? m.cascade.usoReal * 100 : shareOfGroup
                    return (
                      <div key={m.machineid} className="rounded-ctl bg-muted/40 border border-border px-2 py-1.5 text-caption">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground/85">{m.name}</span>
                          <span className={cn('font-mono tabular-nums', theme.text)}>{bigPct.toFixed(0)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted/70 overflow-hidden">
                          <div className={cn('h-full rounded-full', theme.bar)} style={{ width: `${Math.min(100, bigPct)}%` }} />
                        </div>
                        <div className="mt-1 text-caption text-muted-foreground tabular-nums">
                          {activeBucket == null
                            ? `${fmtHm(m.cascade.produccionSec)} de ${fmtHm(m.cascade.techoSec)} de techo`
                            : `${fmtHm(sec)} · ${pctOfOwnDenom.toFixed(0)}% de ${activeBucket === 'planificado' ? 'su turno' : 'su techo'}`}
                        </div>
                        {/* Piezas y cadencia real de la máquina. Sin esto, dos
                            máquinas con el mismo % de uso se veían iguales
                            aunque una produjera el triple que la otra. */}
                        {activeBucket == null && m.piezas > 0 && (
                          <div
                            className="mt-0.5 text-caption tabular-nums text-foreground/70"
                            title={`${m.piezas.toLocaleString('es-CL')} piezas en ${fmtHm(m.cascade.produccionSec)} de proceso. La cadencia se mide solo sobre el tiempo en proceso: si contara las horas paradas, una máquina detenida parecería lenta en vez de parada.`}
                          >
                            {m.piezas.toLocaleString('es-CL')} pz
                            <span className="text-muted-foreground"> · </span>
                            <span className="font-medium">{m.pzMin.toFixed(1)} pz/min</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {causeMachine ? (
            <div className="flex items-center gap-2 text-caption rounded-ctl border border-amber-500/[0.25] bg-amber-500/[0.15] px-2 py-1.5">
              <span className="w-2 h-2 rounded-ctl shrink-0 bg-amber-400" />
              <span>
                Resaltando: <b>{causeMachine.label}</b> en <b>{causeMachine.machine}</b>
                <span className="text-muted-foreground"> · mira las bandas amarillas en el Gantt de esa máquina y en la velocidad upstream</span>
              </span>
              <button
                type="button"
                onClick={() => setCauseMachine(null)}
                className="ml-auto text-caption px-1.5 py-0.5 rounded-ctl border border-border text-muted-foreground hover:bg-accent transition-colors"
              >
                ✕ quitar
              </button>
            </div>
          ) : filter !== 'all' && (
            <div className="flex items-center gap-2 text-caption rounded-ctl border border-border bg-muted/40 px-2 py-1.5">
              <span className={cn('w-2 h-2 rounded-ctl shrink-0', BUCKET_COLOR[filter] ?? 'bg-muted-foreground/[0.10]')} />
              <span>
                Filtrando: <b>{filter === 'planificado' ? 'Planificado' : filterMeta?.label ?? filter}</b>
                <span className="text-muted-foreground tabular-nums"> · {filtered.length} causal{filtered.length === 1 ? '' : 'es'} · {fmtHm(filterSec)}{filter !== 'planificado' ? ` · ≈ ${filterPz.toLocaleString('es-CL')} pz` : ' (fuera del techo, sin costo en piezas)'}</span>
              </span>
              <button
                type="button"
                onClick={() => { setFilter('all'); setCauseMachine(null) }}
                className="ml-auto text-caption px-1.5 py-0.5 rounded-ctl border border-border text-muted-foreground hover:bg-accent transition-colors"
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
              <p className="text-caption text-muted-foreground uppercase tracking-wider mb-1">
                {filter === 'all'
                  ? `Piezas perdidas por causal · ${piezasPerdidas.toLocaleString('es-CL')} pz bajo el máximo teórico`
                  : 'Eventos del grupo · con su costo en piezas'}
              </p>
              {/* La pérdida de arriba es de capacidad de MÁQUINA. Parte de esa
                  producción la planta la recuperó a mano, y decirlo cambia la
                  lectura del turno: sin esta línea el informe sobreestima la
                  pérdida (31-jul: 3.282 "perdidas" cuando 774 salieron igual). */}
              {filter === 'all' && recuperadas > 0 && (
                <div
                  className="mb-1.5 flex items-center gap-2 text-caption rounded-ctl px-2 py-1 bg-cat-6-tint/[0.15] border border-cat-6-tint/[0.25] cursor-help"
                  title={`${MANUAL_LINE_LABEL}: la planta procesó ${manual!.manualPieces.toLocaleString('es-CL')} piezas por fuera de las Baader. ${MANUAL_LINE_TOOLTIP}`}
                >
                  <span className="w-2 h-2 rounded-ctl shrink-0 bg-cat-6-tint/[0.15]" />
                  <span className="truncate text-violet-300">Recuperadas por la línea manual</span>
                  <span className="ml-auto shrink-0 tabular-nums text-violet-300">
                    −{recuperadas.toLocaleString('es-CL')} pz
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    → pérdida neta <b className="text-foreground/90">{piezasPerdidasNetas.toLocaleString('es-CL')}</b>
                  </span>
                </div>
              )}
              <div className="space-y-0.5">
                {techoCauses.map((c) => {
                  const meta = LOSS_BUCKET_META[c.bucket as keyof typeof LOSS_BUCKET_META]
                  return (
                    <div key={`${c.bucket}-${c.label}`} className="flex items-center gap-2 text-caption">
                      <span className={cn('w-2 h-2 rounded-ctl shrink-0', BUCKET_COLOR[c.bucket] ?? 'bg-muted-foreground/[0.10]')} />
                      <span className="truncate">{c.label}</span>
                      <span className="text-caption text-muted-foreground shrink-0">{meta?.owner ?? ''}</span>
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
                                'text-caption px-1 rounded-ctl bg-muted border transition-colors hover:border-amber-500/[0.25] hover:text-foreground',
                                active ? 'border-amber-500/[0.25] text-amber-400 bg-amber-500/[0.15]' : 'border-border/60 text-muted-foreground/80',
                              )}
                              title={`Ver solo los eventos de "${c.label}" en ${mn}`}
                            >
                              {mn}
                            </button>
                          )
                        })}
                      </span>
                      <span className="text-caption text-muted-foreground/60 tabular-nums shrink-0">×{c.count}</span>
                      <span className="ml-auto font-mono tabular-nums shrink-0">{fmtHm(c.sec)}</span>
                      <span className="font-mono tabular-nums text-muted-foreground/60 w-14 text-right shrink-0 text-caption">
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
              <p className="text-caption text-muted-foreground/70 uppercase tracking-wider mb-1">
                Pausas planificadas · fuera del techo (no cuentan como pérdida)
              </p>
              <div className="space-y-0.5 opacity-70">
                {plannedCauses.map((c) => (
                  <div key={`${c.bucket}-${c.label}`} className="flex items-center gap-2 text-caption">
                    <span className="w-2 h-2 rounded-ctl shrink-0 bg-muted-foreground/[0.10]" />
                    <span className="truncate">{c.label}</span>
                    <span className="text-caption text-muted-foreground shrink-0">Personas (acordado)</span>
                    <span className="text-caption text-muted-foreground/60 tabular-nums shrink-0">×{c.count}</span>
                    <span className="ml-auto font-mono tabular-nums shrink-0">{fmtHm(c.sec)}</span>
                    <span className="font-mono tabular-nums text-muted-foreground/60 w-14 text-right shrink-0 text-caption">
                      {pctOfTurno(c.sec).toFixed(1)}%
                    </span>
                    <span className="w-20 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {totals.sinClasificarSec > 0 && filter === 'all' && (
            <p className="text-caption text-violet-400/80">
              ⚠ {fmtHm(totals.sinClasificarSec)} sin clasificar — causal desconocida o sin anotar en Shoplogix.
              Anotarla permite asignarle dueño (y sacarla de la duda).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
