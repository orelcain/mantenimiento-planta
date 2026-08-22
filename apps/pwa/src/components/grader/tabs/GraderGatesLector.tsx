/**
 * GraderGatesLector — «qué mirar ahora» de los gates, arriba del tab Compuertas.
 *
 * El mismo patrón que ya opera en el protocolo BAADER 142 (Perilla5Page):
 * lector con el problema dominante en lenguaje de planta, la pauta accionable
 * inline, y el cierre del lazo hacia una incidencia precargada. NADA de cálculo
 * nuevo: destila lo que el tab ya computa (gateBalance, gateSwapSuggestions,
 * computeGateTimingSignals) y que hoy vive repartido en ~600 líneas de tarjetas.
 *
 * Regla heredada del protocolo: con todo verde el lector NO existe — una
 * alerta que aparece siempre se deja de leer.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GateTimingSignal } from '@/services/grader/graderGateTiming'
import type { GateAssignment, GraderAnalyticsResult } from '@/services/grader/types'

interface Props {
  analytics: GraderAnalyticsResult
  gates: GateAssignment[]
  timingSignals: GateTimingSignal[]
  /** Etiqueta del período para el marcador de la incidencia (p. ej. "T2 22-08"). */
  etiquetaPeriodo?: string
}

export function GraderGatesLector({ analytics, gates, timingSignals, etiquetaPeriodo }: Props) {
  const navigate = useNavigate()
  const [copiado, setCopiado] = useState(false)

  const lector = useMemo(() => {
    const balance = (analytics.gateBalance ?? [])
      .filter((b) => b.severity !== 'info')
      .sort((a, b) =>
        (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1)
        || Math.abs(b.gap) - Math.abs(a.gap))
    const dominante = balance[0] ?? null
    const timingCrit = timingSignals.filter((s) => s.status === 'critical')
    if (!dominante && timingCrit.length === 0) return null

    const swaps = [...(analytics.gateSwapSuggestions ?? [])]
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 3)

    const titulo = dominante
      ? `Repartir el ${dominante.calibre}: ${dominante.gatesAssigned} gate${dominante.gatesAssigned === 1 ? '' : 's'} no dan abasto`
      : `Timing crítico en ${timingCrit.length} gate${timingCrit.length === 1 ? '' : 's'}`

    const pasos: string[] = swaps.length > 0
      ? [
          ...swaps.map((s) =>
            `Gate ${s.gateNumber}: ${s.currentCalibre} → ${s.suggestedCalibre} — ${s.reason}`),
          'Verificar en el HMI que el cambio quedó y mirar el balance a los 30 min.',
        ]
      : timingCrit.map((s) => `Gate ${s.gateNumber}: ${s.hint}`)

    return { dominante, timingCrit, titulo, pasos }
  }, [analytics.gateBalance, analytics.gateSwapSuggestions, timingSignals])

  if (!lector) return null
  const { dominante, timingCrit, titulo, pasos } = lector
  const critico = dominante?.severity === 'critical' || timingCrit.length > 0
  const marcador = `[grader-gates${etiquetaPeriodo ? ` · ${etiquetaPeriodo}` : ''}]`

  const resumenTexto = () => [
    `Gates del Grader${etiquetaPeriodo ? ` — ${etiquetaPeriodo}` : ''}`,
    titulo,
    ...(dominante ? [dominante.message] : []),
    ...timingCrit.map((s) => `Gate ${s.gateNumber} crítico de timing: ${s.hint}`),
    'Pauta:',
    ...pasos.map((p, i) => `${i + 1}. ${p}`),
  ].join('\n')

  const registrarIncidencia = () => {
    const desc = [
      marcador,
      ...(dominante ? [dominante.message] : []),
      ...timingCrit.map((s) => `Gate ${s.gateNumber} crítico de timing: ${s.hint}`),
      '',
      'Pauta:',
      ...pasos.map((p, i) => `${i + 1}. ${p}`),
    ].join('\n')
    navigate(`/incidents?nueva=1&titulo=${encodeURIComponent(`${titulo} (gates Grader)`)}&desc=${encodeURIComponent(desc)}`)
  }

  const copiarResumen = async () => {
    const texto = resumenTexto()
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = texto
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } finally { ta.remove() }
    }
    setCopiado(true)
    window.setTimeout(() => setCopiado(false), 2500)
  }

  return (
    <div
      className={cn(
        'rounded-card border bg-card p-4',
        critico ? 'border-ink-crit' : 'border-ink-warn',
      )}
      role="region"
      aria-label="Qué mirar ahora en los gates"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'grid h-9 w-9 shrink-0 place-items-center rounded-ctl',
            critico ? 'bg-ink-crit/10 text-ink-crit' : 'bg-ink-warn/10 text-ink-warn',
          )}
        >
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h3 className="min-w-0 flex-1 text-base font-semibold leading-tight">{titulo}</h3>
        {dominante ? (
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 font-mono text-xs font-bold tabular-nums',
              critico ? 'bg-ink-crit/10 text-ink-crit' : 'bg-ink-warn/10 text-ink-warn',
            )}
          >
            {Math.round(dominante.demandPct)}% · {dominante.gatesAssigned}/{gates.length}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">
        {dominante ? dominante.message : null}
        {dominante && timingCrit.length > 0 ? ' ' : null}
        {timingCrit.length > 0 ? (
          <>
            {timingCrit.map((s) => (
              <span key={s.gateNumber}>
                El gate <strong className="text-ink-crit tabular-nums">{s.gateNumber}</strong>{' '}
                está crítico de timing ({s.hint}).{' '}
              </span>
            ))}
            Cada pieza que pierde se va al repaso.
          </>
        ) : null}
      </p>

      {pasos.length > 0 ? (
        <ol className="mt-3 space-y-1.5 text-sm">
          {pasos.map((p, i) => (
            <li key={p} className="flex gap-2">
              <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
              <span>{p}</span>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={registrarIncidencia}
          className="inline-flex min-h-[44px] items-center rounded-ctl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Registrar incidencia con esto
        </button>
        <button
          type="button"
          onClick={() => void copiarResumen()}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1.5 rounded-ctl px-4 text-sm font-medium',
            copiado ? 'bg-ink-ok/10 text-ink-ok' : 'bg-primary/10 text-primary',
          )}
        >
          {copiado ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copiado ? 'Copiado' : 'Copiar resumen'}
        </button>
      </div>

      {/* Grilla glanceable: los 12 gates con su % del turno y el semáforo de timing */}
      <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6">
        {gates.map((g) => {
          const stats = analytics.gateAdvancedStats.find((s) => s.gateNumber === g.gateNumber)
          const sig = timingSignals.find((s) => s.gateNumber === g.gateNumber)
          return (
            <div
              key={g.gateNumber}
              className={cn(
                'rounded-ctl px-2.5 py-1.5',
                sig?.status === 'critical' ? 'bg-ink-crit/10'
                : sig?.status === 'warn' ? 'bg-ink-warn/10'
                : 'bg-muted',
              )}
              title={sig?.hint}
            >
              <div className="text-[11px] font-bold tracking-wide text-muted-foreground">
                G{g.gateNumber}
              </div>
              <div
                className={cn(
                  'font-mono text-base font-bold tabular-nums',
                  !g.active ? 'text-muted-foreground'
                  : sig?.status === 'critical' ? 'text-ink-crit'
                  : sig?.status === 'warn' ? 'text-ink-warn' : 'text-ink-ok',
                )}
              >
                {g.active && stats ? `${Math.round(stats.utilizationPct)}%` : '—'}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {g.active ? g.assignedCalibre : 'inactivo'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
