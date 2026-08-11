/**
 * "Dónde estuvo la limitación" — la mitad de máquinas de la tarjeta de turno.
 *
 * Vive aparte porque es IDÉNTICA con y sin Excel del Grader, y eso es lo que
 * hace que las dos versiones de la tarjeta se lean como la misma pantalla.
 * Antes eran dos componentes con estructuras distintas (`HeroScorecard` en 3
 * columnas por fuente de datos, `ShoplogixOnlyScorecard` en 3 tarjetas) y
 * cargar el Excel se sentía un cambio de pantalla; Orel lo describió como "todo
 * desordenado" (11-ago-2026).
 *
 * La agrupación es por PREGUNTA, no por fuente: acá se responde dónde estuvo el
 * cuello de botella, que es el dato de Mantención. Cuánto salió se responde en
 * la otra mitad.
 */
import { cn } from '@/lib/utils'
import { shortMachineName } from '@/services/grader/graderMachineNames'
import { machineShortLabel } from '@/services/shoplogix/shoplogixMachines'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'

/**
 * Veredicto por máquina: combina disponibilidad (uptime) y ritmo vs objetivo, y
 * manda el PEOR de los dos — una máquina que estuvo prendida todo el turno pero
 * a media velocidad no está "bien".
 *
 * Umbrales heredados del módulo, sin inventar: uptime 70/40, ritmo 85/50.
 */
const UMBRAL_UPTIME = { ok: 70, warn: 40 }
const UMBRAL_RITMO = { ok: 85, warn: 50 }

const VEREDICTO = {
  ok:       { label: 'Bien',    text: 'text-ink-ok',   fill: 'bg-ink-ok',   chip: 'bg-emerald-500/[0.15] border-ink-ok/[0.45]' },
  warn:     { label: 'Regular', text: 'text-ink-warn', fill: 'bg-ink-warn', chip: 'bg-amber-500/[0.15] border-ink-warn/[0.45]' },
  critical: { label: 'Crítico', text: 'text-ink-crit', fill: 'bg-ink-crit', chip: 'bg-red-500/[0.15] border-ink-crit/[0.45]' },
} as const

type Veredicto = keyof typeof VEREDICTO

function tier(v: number, u: { ok: number; warn: number }): number {
  return v >= u.ok ? 2 : v >= u.warn ? 1 : 0
}

function machineVerdict(uptimePct: number, ratioPct: number): Veredicto {
  const peor = Math.min(tier(uptimePct, UMBRAL_UPTIME), tier(ratioPct, UMBRAL_RITMO))
  return peor === 2 ? 'ok' : peor === 1 ? 'warn' : 'critical'
}

/** Nivel del uptime por sí solo, sin mezclarlo con el ritmo. */
function uptimeTier(pct: number): Veredicto {
  return pct >= UMBRAL_UPTIME.ok ? 'ok' : pct >= UMBRAL_UPTIME.warn ? 'warn' : 'critical'
}

/** Tinta del uptime. */
function uptimeInk(pct: number): string {
  return VEREDICTO[uptimeTier(pct)].text
}

/**
 * Relleno de la barra de uptime — del UPTIME, no del veredicto combinado.
 *
 * Si la barra usara el veredicto, una máquina con 82% de uptime pero ritmo bajo
 * pintaba la barra en ámbar mientras el número al lado iba en verde: dos
 * colores distintos para el mismo dato. El veredicto tiene su propio chip.
 */
function uptimeFill(pct: number): string {
  return VEREDICTO[uptimeTier(pct)].fill
}

interface Props {
  machines: UpstreamLineSnapshot['machines']
  /** Uptime promedio de la línea, 0..1. */
  avgUptime: number | null
}

export function ShiftMachinesHalf({ machines, avgUptime }: Props) {
  if (machines.length === 0) return null
  const avgPct = avgUptime != null ? avgUptime * 100 : null

  return (
    <div className="min-w-0">
      <div className="text-caption tracking-wider text-muted-foreground">
        Dónde estuvo la limitación
      </div>

      {avgPct != null && (
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className={cn('text-2xl font-bold tabular-nums leading-none', uptimeInk(avgPct))}>
            {avgPct.toFixed(0)}%
          </span>
          <span className="text-xs text-muted-foreground">
            uptime promedio · {machines.length} {machines.length === 1 ? 'máquina' : 'máquinas'}
          </span>
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        {machines.map((m, idx) => {
          const uptimePct = (m.shiftRuntime ?? 0) * 100
          const ratioPct = (m.overallRatio ?? 0) * 100
          const v = VEREDICTO[machineVerdict(uptimePct, ratioPct)]
          // El nombre corto sale del MODELO, no de un "Ev" fijo: en Filete la
          // máquina es una Baader 200 y aparecía como "Ev 1" (de evisceradora).
          const corto = machines.length > 1
            ? `${machineShortLabel(m.machineType)} ${idx + 1}`
            : machineShortLabel(m.machineType)

          return (
            <div key={m.machineid}>
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium truncate" title={shortMachineName(m.machineName)}>
                  <span className="hidden sm:inline">{shortMachineName(m.machineName)}</span>
                  <span className="sm:hidden">{corto}</span>
                </span>
                <span className="text-caption text-muted-foreground tabular-nums ml-auto shrink-0">
                  {m.totalCycles.toLocaleString('es-CL')} ciclos
                </span>
              </div>

              <div className="flex items-center gap-2 mt-1">
                <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', uptimeFill(uptimePct))}
                    style={{ width: `${Math.min(100, uptimePct).toFixed(1)}%` }}
                  />
                </div>
                <span className={cn('text-xs font-semibold tabular-nums shrink-0 w-9 text-right', uptimeInk(uptimePct))}>
                  {uptimePct.toFixed(0)}%
                </span>
              </div>

              <div className="flex items-center gap-2 mt-1 text-caption text-muted-foreground">
                <span
                  className={cn('inline-flex items-center gap-1 rounded-full border px-1.5 py-px font-semibold', v.chip, v.text)}
                  title="Combina disponibilidad (uptime) y ritmo vs objetivo — manda el peor de los dos."
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', v.fill)} />
                  {v.label}
                </span>
                <span title="Ciclos reales vs objetivo Shoplogix para este turno">
                  ritmo vs objetivo <b className="tabular-nums font-semibold">{ratioPct.toFixed(0)}%</b>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
