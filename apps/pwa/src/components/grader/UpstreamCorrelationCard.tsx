/**
 * Card "Correlación upstream" — muestra al operador del Grader la causa
 * probable de cada paro basado en el estado de las Baaders 142 en ventana
 * temporal ±10 min.
 *
 * Aparece SOLO si hay al menos 1 paro con correlación detectada. Si todos
 * los paros del Grader fueron por causas internas, este card no se renderiza.
 *
 * Ver: apps/pwa/src/services/shoplogix/shoplogixCorrelation.ts
 */

import { useMemo, useState } from 'react'
import { Card, CardContent, Badge } from '@/components/ui'
import { Link2, ChevronDown, ChevronRight, AlertTriangle, Info, CheckCircle2, Factory, Clock } from 'lucide-react'
import type { Pause } from '@/services/grader/types'
import type { UpstreamLineSnapshot } from '@/services/shoplogix/types'
import {
  correlatePausesWithUpstream,
  summarizeCorrelations,
  confidenceLabel,
  type PauseCorrelation,
  type CorrelationKind,
} from '@/services/shoplogix/shoplogixCorrelation'

interface Props {
  pauses: Pause[]
  snapshot: UpstreamLineSnapshot | null | undefined
}

function fmtHHmm(d: Date): string {
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return rm > 0 ? `${h} h ${rm} min` : `${h} h`
}

function fmtLead(sec: number): string {
  if (sec === 0) return 'simultáneo'
  if (sec > 0)  return `+${Math.round(sec / 60)} min`
  return `${Math.round(sec / 60)} min`
}

const KIND_STYLE: Record<CorrelationKind, { bg: string; border: string; text: string; icon: typeof AlertTriangle; label: string }> = {
  upstream_global:   { bg: 'bg-rose-950/40',   border: 'border-rose-900/60',   text: 'text-rose-300',    icon: AlertTriangle, label: 'Causa upstream' },
  upstream_majority: { bg: 'bg-amber-950/40',  border: 'border-amber-900/60',  text: 'text-amber-300',   icon: AlertTriangle, label: 'Upstream parcial' },
  upstream_single:   { bg: 'bg-slate-900/60',  border: 'border-slate-800',     text: 'text-slate-400',   icon: Info,          label: 'Verificar' },
  no_correlation:    { bg: 'bg-emerald-950/30',border: 'border-emerald-900/40',text: 'text-emerald-400', icon: CheckCircle2,  label: 'Interna' },
}

function CorrelationRow({ corr, expanded, onToggle }: {
  corr: PauseCorrelation
  expanded: boolean
  onToggle: () => void
}) {
  const s = KIND_STYLE[corr.kind]
  const Icon = s.icon
  const conf = confidenceLabel(corr.confidence)
  return (
    <div className="py-2">
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-2 text-left p-2 rounded border ${s.bg} ${s.border} group`}
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronDown  className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />}
        <Icon className={`w-4 h-4 flex-shrink-0 ${s.text}`} />
        <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
          {fmtHHmm(corr.pauseStart)}
        </span>
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${s.text} ${s.border} flex-shrink-0`}>
          {fmtDur(corr.pauseDurSec)}
        </Badge>
        <span className={`text-xs ${s.text} truncate`}>{corr.hypothesis}</span>
        <Badge
          variant="outline"
          className={`ml-auto text-[10px] px-1.5 py-0 h-4 border-slate-700 ${conf.color} flex-shrink-0`}
          title={`Confianza ${Math.round(corr.confidence * 100)}% (alta ≥70%, media 40-70%, baja <40%)`}
        >
          confianza {conf.text}
        </Badge>
      </button>

      {expanded && corr.contributors.length > 0 && (
        <div className="mt-2 ml-6 space-y-1 text-[11px] text-slate-400 border-l-2 border-slate-800/60 pl-3">
          {corr.contributors.map(c => (
            <div key={c.machineid} className="flex items-center gap-2">
              <span className="text-slate-300 min-w-[9rem]">{c.machineName}</span>
              <span>{c.stateName}</span>
              {c.reason && <span className="text-slate-500">· {c.reason}</span>}
              <span className="ml-auto tabular-nums text-slate-500">
                {fmtHHmm(c.stateStart)}–{fmtHHmm(c.stateEnd)}
              </span>
              <span className="tabular-nums text-slate-600 w-16 text-right">
                lead {fmtLead(c.leadSec)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function UpstreamCorrelationCard({ pauses, snapshot }: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const correlations = useMemo(
    () => correlatePausesWithUpstream(pauses, snapshot),
    [pauses, snapshot],
  )
  const summary = useMemo(() => summarizeCorrelations(correlations), [correlations])

  // Si no hay snapshot o no hay paros → no renderizar
  if (!snapshot || pauses.length === 0) return null

  // Ordenar: primero causas upstream (alta confianza), después el resto
  const sorted = [...correlations].sort((a, b) => {
    if (a.kind === 'no_correlation' && b.kind !== 'no_correlation') return 1
    if (b.kind === 'no_correlation' && a.kind !== 'no_correlation') return -1
    return b.confidence - a.confidence
  })

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Total tiempo muerto del turno (todos los paros, para % comparativo)
  const totalPauseDurSec = pauses.reduce((acc, p) => acc + p.durationSec, 0)
  const upstreamShareOfPauseTime = totalPauseDurSec > 0
    ? summary.upstreamCausedDurSec / totalPauseDurSec
    : 0

  return (
    <Card className="border-slate-800 bg-slate-950/50">
      <CardContent className="py-3 px-4">
        {/* Header — KPI accionable: tiempo muerto causado por upstream */}
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-violet-400" />
            <span className="font-medium text-sm">Correlación con upstream</span>
          </div>

          {summary.upstreamCaused > 0 && (
            <div
              className="flex items-center gap-1.5 text-xs text-rose-300 tabular-nums"
              title={`${summary.upstreamCaused} de ${summary.total} paros del Grader correlacionaron con eventos upstream. Tiempo muerto del Grader que coincidió con paros Baader: ${fmtDur(summary.upstreamCausedDurSec)} (${Math.round(upstreamShareOfPauseTime * 100)}% del tiempo muerto del turno).`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span className="font-semibold">
                {fmtDur(summary.upstreamCausedDurSec)} de paro upstream
              </span>
              <span className="opacity-70">
                ({summary.upstreamCaused} de {summary.total} paros · {Math.round(upstreamShareOfPauseTime * 100)}% del tiempo muerto)
              </span>
            </div>
          )}
        </div>

        {summary.upstreamCaused === 0 ? (
          <div className="text-xs text-slate-500 py-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Ninguno de los {pauses.length} paros correlacionó con eventos upstream. Las Baaders estaban corriendo normal → las causas son internas del Grader.
          </div>
        ) : (
          <>
            {/* Breakdown por máquina — qué Evisceradora atender primero */}
            {summary.byMachine.length > 0 && (
              <div className="mb-3 p-2 rounded border border-slate-800/80 bg-slate-900/40">
                <div className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
                  <Factory className="w-3 h-3" />
                  Impacto por máquina (paros del Grader donde la máquina contribuyó)
                </div>
                <div className="space-y-0.5">
                  {summary.byMachine.map((m, idx) => {
                    const totalUpstreamSec = summary.upstreamCausedDurSec
                    const sharePct = totalUpstreamSec > 0 ? (m.totalOverlapSec / totalUpstreamSec) * 100 : 0
                    // Top máquina destacada en rojo, resto slate
                    const isTop = idx === 0
                    return (
                      <div
                        key={m.machineid}
                        className={`flex items-center gap-2 text-[11px] tabular-nums ${isTop ? 'text-rose-300' : 'text-slate-400'}`}
                      >
                        <span className="min-w-[8rem]">{m.machineName}</span>
                        <span className="opacity-80">{m.pauseCount} paro{m.pauseCount !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span className="font-semibold">{fmtDur(m.totalOverlapSec)} overlap</span>
                        {/* Barra visual proporcional al share */}
                        <div className="flex-1 h-1.5 rounded-full bg-slate-800/80 overflow-hidden ml-1 max-w-[120px]">
                          <div
                            className={`h-full rounded-full ${isTop ? 'bg-rose-400' : 'bg-slate-500'}`}
                            style={{ width: `${Math.max(2, Math.min(100, sharePct))}%` }}
                          />
                        </div>
                        <span className="w-10 text-right opacity-70">{sharePct.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>
                <div className="text-[9px] text-slate-600 mt-1.5">
                  Recomendación: priorizar mantención en la máquina con mayor overlap.
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-800/60">
              {sorted.slice(0, 10).map(corr => (
                <CorrelationRow
                  key={corr.pauseId}
                  corr={corr}
                  expanded={expandedIds.has(corr.pauseId)}
                  onToggle={() => toggle(corr.pauseId)}
                />
              ))}
              {sorted.length > 10 && (
                <div className="text-[11px] text-slate-600 py-2 text-center">
                  … y {sorted.length - 10} paros más
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
