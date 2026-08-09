import { useMemo } from 'react'
import { ChevronLeft, Wrench, History, Package, FileText, Zap, GraduationCap, Plus } from 'lucide-react'
import { Button, Pill, ListGroup, ListCell, CellIcon } from '@/components/piel'
import { cadenceCpm } from '@/services/grader/plantKpiCompute'
import { classifyLossState, LOSS_BUCKET_META } from '@/services/shoplogix/lossBuckets'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

/**
 * LA MÁQUINA COMO HUB (docs §4) — la pieza central de la reestructuración.
 *
 * Hoy la app tiene los datos de un equipo repartidos en módulos sueltos del menú
 * (repuestos, planos, protocolo, variadores, CTD, aprendizaje). Un técnico no
 * piensa "voy al módulo de repuestos": piensa "la 142 está mala". Por eso el eje
 * organizador pasa a ser la MÁQUINA, y los módulos se vuelven secciones suyas.
 *
 * Acá conviven dos tipos de contenido, y es importante no confundirlos:
 *  - Lo REAL: estado actual, cifras del turno y la secuencia de estados, todo
 *    derivado del snapshot de Shoplogix que ya recibe la pantalla.
 *  - Los DESTINOS: las secciones que hoy viven en el menú. Se muestran con su
 *    etiqueta pero sin números inventados — cablearlas es el barrido siguiente,
 *    no este piloto. Nunca mostrar un contador falso: si no hay dato, no va.
 */

function fmtMin(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('es-CL').replace(/\./g, ' ')
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return ((parts[0]![0] ?? '') + (parts[1]![0] ?? '')).toUpperCase()
}

export interface MachineHubProps {
  machine: UpstreamMachineShift
  onBack: () => void
  onNewIncident: () => void
}

export function MachineHub({ machine, onBack, onNewIncident }: MachineHubProps) {
  const cur = machine.states?.find((s) => s.isCurrent)
  const down = cur?.type === 'downtime'
  const bd = machine.shiftRuntimeBreakdown
  const cpm = cadenceCpm(machine.totalCycles ?? 0, bd?.uptimeSec ?? 0)

  /** Últimos estados, del más reciente al más antiguo. Es el "qué pasó" del turno. */
  const timeline = useMemo(() => {
    const st = [...(machine.states ?? [])]
      .filter((s) => (s.durationSec ?? 0) > 0)
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime())
      .slice(0, 8)
    return st.map((s) => {
      const bucket = classifyLossState(s)
      const meta = bucket in LOSS_BUCKET_META
        ? LOSS_BUCKET_META[bucket as keyof typeof LOSS_BUCKET_META]
        : null
      return {
        s,
        tone: s.type === 'uptime' ? 'ok' : bucket === 'mantencion' ? 'critical' : bucket === 'planificado' ? 'neutral' : 'warning',
        owner: meta?.owner ?? null,
      } as const
    })
  }, [machine.states])

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado de ficha: atrás con CONTEXTO, no un "Volver" genérico (§4). */}
      <div className="flex flex-col gap-3 px-1">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex w-fit items-center gap-0.5 text-[0.85rem] font-medium text-primary hover:opacity-70"
        >
          <ChevronLeft className="size-4" /> Máquinas
        </button>
        <div className="flex items-center gap-3">
          <span
            className={`flex size-12 items-center justify-center rounded-card text-[0.8rem] font-bold text-white ${
              down ? 'bg-red-500' : cur ? 'bg-emerald-500' : 'bg-muted-foreground'
            }`}
          >
            {initials(machine.machineName)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[1.5rem] font-bold leading-tight tracking-[-0.025em]">
              {machine.machineName}
            </h1>
            <p className="truncate text-[0.78rem] text-muted-foreground">
              {machine.machineType ?? 'Equipo'} · turno {machine.shiftId}
            </p>
          </div>
          <Pill tone={down ? 'critical' : cur ? 'ok' : 'neutral'} dot={down ? undefined : 'pulse'}>
            {down ? 'En falla' : cur ? 'Operando' : 'Sin actividad'}
          </Pill>
        </div>
      </div>

      {/* Cifras REALES del turno para este equipo. */}
      <section className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card bg-card px-4 py-4 sm:grid-cols-4">
        {[
          { l: 'Cadencia', v: cpm > 0 ? `${cpm.toFixed(1)} pz/min` : '—' },
          { l: 'Ciclos', v: fmtInt(machine.totalCycles) },
          { l: 'Produciendo', v: fmtMin(bd?.uptimeSec) },
          { l: 'Detención', v: fmtMin(bd?.downtimeSec) },
        ].map((k) => (
          <div key={k.l}>
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{k.l}</p>
            <p className="text-[1.1rem] font-bold tabular-nums leading-tight tracking-[-0.02em]">{k.v}</p>
          </div>
        ))}
      </section>

      {/* Qué pasó en el turno — dato real, no un destino. */}
      {timeline.length > 0 && (
        <ListGroup title="Qué pasó en este turno" footer="Estados registrados por Shoplogix, del más reciente al más antiguo.">
          {timeline.map(({ s, tone, owner }, i) => (
            <ListCell
              key={`${s.startAt}-${i}`}
              leading={<CellIcon className={tone === 'ok' ? 'bg-emerald-500' : tone === 'critical' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-muted-foreground'}>{' '}</CellIcon>}
              title={s.reason || s.name || 'Sin causa registrada'}
              subtitle={
                new Date(s.startAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) +
                (owner ? ` · responsable: ${owner}` : '')
              }
              value={fmtMin(s.durationSec)}
              chevron={false}
            />
          ))}
        </ListGroup>
      )}

      {/*
        Los DESTINOS: lo que hoy son módulos sueltos del menú pasa a ser sección
        de la máquina. Sin contadores porque todavía no están cableados — un
        número inventado acá sería peor que no mostrarlo.
      */}
      <ListGroup
        title="En este equipo"
        footer="Estas secciones hoy viven como módulos sueltos del menú. Cablearlas a la ficha es el barrido siguiente."
      >
        {[
          { icon: <Wrench className="size-4" />, label: 'Incidencias' },
          { icon: <History className="size-4" />, label: 'Historial y confiabilidad' },
          { icon: <Package className="size-4" />, label: 'Repuestos del equipo' },
        ].map((it) => (
          <ListCell
            key={it.label}
            leading={
              <span className="flex size-7 items-center justify-center rounded-ctl bg-muted-foreground/15 text-muted-foreground">
                {it.icon}
              </span>
            }
            title={it.label}
            onClick={() => {}}
          />
        ))}
      </ListGroup>

      <ListGroup title="Documentación técnica">
        {[
          { icon: <FileText className="size-4" />, label: 'Protocolo de mantención' },
          { icon: <Zap className="size-4" />, label: 'Plano eléctrico' },
          { icon: <GraduationCap className="size-4" />, label: 'Centro de Aprendizaje' },
        ].map((it) => (
          <ListCell
            key={it.label}
            leading={
              <span className="flex size-7 items-center justify-center rounded-ctl bg-muted-foreground/15 text-muted-foreground">
                {it.icon}
              </span>
            }
            title={it.label}
            onClick={() => {}}
          />
        ))}
      </ListGroup>

      <div className="px-1">
        <Button size="block" onClick={onNewIncident}>
          <Plus /> Registrar incidencia en {machine.machineName}
        </Button>
      </div>
    </div>
  )
}
