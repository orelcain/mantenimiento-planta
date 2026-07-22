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
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Scale } from 'lucide-react'
import { cn } from '@/lib/utils'
import { cascadeFromStates, LOSS_BUCKET_META, type LossBucket } from '@/services/shoplogix/lossBuckets'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

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

export function LossCascadeCard({ machines }: { machines: UpstreamMachineShift[] }) {
  const [expanded, setExpanded] = useState(false)

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
    // cadencia de esa máquina. Agrupadas por (bucket, reason) entre máquinas.
    const lossByCause = new Map<string, { bucket: LossBucket; label: string; sec: number; piezas: number }>()
    for (const x of perMachine) {
      for (const item of x.cascade.items) {
        const label = item.reason || (item.name.toLowerCase().includes('micro') ? 'Micro detenciones' : 'Sin causal anotada')
        const key = `${item.bucket}__${label}`
        const cur = lossByCause.get(key) ?? { bucket: item.bucket, label, sec: 0, piezas: 0 }
        cur.sec += item.durationSec
        cur.piezas += item.durationSec * x.cadencePzSec
        lossByCause.set(key, cur)
      }
    }
    const causes = [...lossByCause.values()]
      .map(c => ({ ...c, piezas: Math.round(c.piezas) }))
      .sort((a, b) => b.piezas - a.piezas)

    return { totals, usoReal, piezasReales, piezasMax, causes }
  }, [machines])

  if (!data || data.totals.techoSec <= 0) return null

  const { totals, usoReal, piezasReales, piezasMax, causes } = data
  const turnoSec = totals.techoSec + totals.planificadoSec
  const pctOfTecho = (sec: number) => (totals.techoSec > 0 ? (sec / totals.techoSec) * 100 : 0)
  const piezasPerdidas = Math.max(0, piezasMax - piezasReales)

  return (
    <div className="mb-3 pb-3 border-b border-border/60">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 group"
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <Scale className="w-3.5 h-3.5 text-sky-400 shrink-0" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Cascada del turno · ¿qué limitó la producción?
        </span>
        <span className="ml-auto flex items-center gap-3 text-[11px] tabular-nums">
          <span title="Uso real = tiempo produciendo / techo de máquina (descontada colación y pausas planificadas de personas). Es el uptime honesto — el % de uptime clásico castiga a la máquina por la colación.">
            Uso real <b className="text-emerald-400">{(usoReal * 100).toFixed(0)}%</b>
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
          {/* Cascada numérica */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 text-[11px]">
            <div className="rounded bg-muted/40 px-2 py-1">
              <div className="text-muted-foreground text-[9px] uppercase">Turno (Σ máq)</div>
              <div className="font-mono tabular-nums">{fmtHm(turnoSec)}</div>
            </div>
            <div className="rounded bg-slate-500/10 px-2 py-1" title="Colación, ejercicio compensatorio, cambio de turno — pausas de personas acordadas. Se descuentan ANTES de medir a la máquina.">
              <div className="text-muted-foreground text-[9px] uppercase">− Planificado</div>
              <div className="font-mono tabular-nums">{fmtHm(totals.planificadoSec)}</div>
            </div>
            <div className="rounded bg-sky-500/10 px-2 py-1" title="Techo real de máquina = turno − planificado. El denominador honesto: todo este tiempo la máquina PODÍA producir.">
              <div className="text-sky-400 text-[9px] uppercase">= Techo máquina</div>
              <div className="font-mono tabular-nums font-semibold">{fmtHm(totals.techoSec)}</div>
            </div>
            <div className="rounded bg-amber-500/10 px-2 py-1" title="Falta MMPP, cumplimiento de cuota, energía — la máquina estaba disponible pero el proceso no la alimentó. NO es pérdida de Mantención.">
              <div className="text-amber-500 text-[9px] uppercase">− Externo</div>
              <div className="font-mono tabular-nums">{fmtHm(totals.externoSec)}</div>
            </div>
            <div className="rounded bg-rose-500/10 px-2 py-1" title="Averías, ajustes de mantenimiento, micro detenciones, cintas — el frente que Mantención debe reducir.">
              <div className="text-rose-400 text-[9px] uppercase">− Mantención</div>
              <div className="font-mono tabular-nums">{fmtHm(totals.mantencionSec)}</div>
            </div>
            <div className="rounded bg-emerald-500/10 px-2 py-1" title="Tiempo efectivamente produciendo (uptime).">
              <div className="text-emerald-400 text-[9px] uppercase">= Uso real</div>
              <div className="font-mono tabular-nums font-semibold">{fmtHm(totals.produccionSec)}</div>
            </div>
          </div>

          {/* Piezas perdidas por causal — "la culpa, con número". SOLO buckets
              que restan del techo: lo planificado (colación, ejercicio) se
              descuenta ANTES del techo, así que sus piezas NO están "bajo el
              máximo" — mezclarlo hacía que las causales sumaran más que la
              pérdida total. Se listan aparte, sin ≈pz. */}
          {(() => {
            const techoCauses = causes.filter((c) => c.bucket !== 'planificado')
            const plannedCauses = causes.filter((c) => c.bucket === 'planificado')
            return (
              <>
                {techoCauses.length > 0 && (
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">
                      Piezas perdidas por causal · {piezasPerdidas.toLocaleString('es-CL')} pz bajo el máximo teórico
                    </p>
                    <div className="space-y-0.5">
                      {techoCauses.map((c) => {
                        const meta = LOSS_BUCKET_META[c.bucket as keyof typeof LOSS_BUCKET_META]
                        return (
                          <div key={`${c.bucket}-${c.label}`} className="flex items-center gap-2 text-[11px]">
                            <span className={cn('w-2 h-2 rounded-sm shrink-0', BUCKET_COLOR[c.bucket] ?? 'bg-slate-500/60')} />
                            <span className="truncate">{c.label}</span>
                            <span className="text-[9px] text-muted-foreground shrink-0">{meta?.owner ?? ''}</span>
                            <span className="ml-auto font-mono tabular-nums shrink-0">{fmtHm(c.sec)}</span>
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
                          <span className="ml-auto font-mono tabular-nums shrink-0">{fmtHm(c.sec)}</span>
                          <span className="w-20 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {totals.sinClasificarSec > 0 && (
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
