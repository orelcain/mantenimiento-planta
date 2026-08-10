/**
 * Vista pública de un turno Grader compartido via token.
 * No requiere autenticación. Token expiración: 24 horas.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui'
import { AlertCircle, Clock, PauseCircle, Activity, ExternalLink } from 'lucide-react'
import { loadPublicToken } from '@/services/grader/graderPublicToken.service'
import { ShiftTimelineView } from '@/components/grader/ShiftTimelineView'
import { computeShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { DEFAULT_SHIFT_SCHEDULE } from '@/services/grader/graderShiftSchedule'
import type { GraderPublicTokenDoc } from '@/services/grader/graderPublicToken.service'

function fmtSec(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function KpiChip({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-white/10 bg-white/5 px-4 py-3 min-w-[110px]">
      <div className="flex items-center gap-1 text-caption text-white/50 mb-1">{icon}{label}</div>
      <div className="text-xl font-bold tabular-nums text-white">{value}</div>
    </div>
  )
}

export function GraderPublicTokenPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<GraderPublicTokenDoc | null>(null)
  const [status, setStatus] = useState<'loading' | 'expired' | 'notfound' | 'ok'>('loading')

  useEffect(() => {
    if (!token) { setStatus('notfound'); return }
    loadPublicToken(token).then(doc => {
      if (!doc) { setStatus('notfound'); return }
      if (new Date(doc.expiresAt) < new Date()) { setStatus('expired'); return }
      setData(doc)
      setStatus('ok')
    }).catch(() => setStatus('notfound'))
  }, [token])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Spinner className="w-8 h-8 text-amber-400" />
      </div>
    )
  }

  // ── Error states ─────────────────────────────────────────────────────────
  if (status !== 'ok' || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-white/70 px-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-lg font-semibold text-white">
          {status === 'expired' ? 'Este link ha expirado' : 'Turno no encontrado'}
        </p>
        <p className="text-sm max-w-xs">
          {status === 'expired'
            ? 'Los links de turno son válidos por 24 horas. Pide al supervisor que genere uno nuevo.'
            : 'El link no es válido o fue eliminado.'}
        </p>
        <button
          onClick={() => navigate('/login')}
          className="mt-4 flex items-center gap-2 rounded-card bg-amber-500 px-4 py-2 text-sm font-medium text-black hover:bg-amber-400 transition-colors"
        >
          <ExternalLink className="w-4 h-4" />
          Ir al sistema
        </button>
      </div>
    )
  }

  // ── Render turno ─────────────────────────────────────────────────────────
  const { summary, timelineBuckets, pauses, dateKey, shiftId, createdBy, createdAt, expiresAt } = data

  const dateLabel = new Date(`${dateKey}T12:00:00`)
    .toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const shiftWindow = computeShiftTimeWindow(dateKey, shiftId, DEFAULT_SHIFT_SCHEDULE)

  const p0Pct = summary.pointZeroPct ?? 0
  const p0Color = p0Pct <= 2 ? 'text-green-400' : p0Pct <= 3.5 ? 'text-amber-400' : 'text-red-400'

  const createdLabel = new Date(createdAt).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).replace('.', '')
  const expiresLabel = new Date(expiresAt).toLocaleDateString('es-CL', {
    day: 'numeric', month: 'short',
  }).replace('.', '')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-muted-foreground/[0.10] backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-sm font-semibold tracking-wide text-white/90">GRADER Z2</span>
          </div>
          <span className="text-white/30">·</span>
          <span className="text-sm text-white/70">{shiftId}</span>
          <span className="text-white/30">·</span>
          <span className="text-sm text-white/50">{dateLabel}</span>
          <div className="ml-auto">
            <button
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 rounded-ctl bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 text-xs text-white/70"
            >
              <ExternalLink className="w-3 h-3" />
              Ver en sistema
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* KPIs */}
        <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
          <KpiChip
            label="P0%"
            value={<span className={p0Color}>{p0Pct.toFixed(2)}%</span>}
            icon={<Activity className="w-3 h-3" />}
          />
          <KpiChip
            label="Piezas"
            value={(summary.totalPieces ?? 0).toLocaleString('es-CL')}
            icon={<Activity className="w-3 h-3" />}
          />
          {summary.totalDeadTimeSec != null && summary.totalDeadTimeSec > 0 && (
            <KpiChip
              label="Tiempo muerto"
              value={fmtSec(summary.totalDeadTimeSec)}
              icon={<Clock className="w-3 h-3" />}
            />
          )}
          {(summary.pausesCount ?? 0) > 0 && (
            <KpiChip
              label="Pausas ≥5min"
              value={String(summary.pausesCount)}
              icon={<PauseCircle className="w-3 h-3" />}
            />
          )}
        </div>

        {/* Timeline read-only */}
        <ShiftTimelineView
          timelineBuckets={timelineBuckets}
          shiftDoc={null}
          shiftWindow={shiftWindow}
          pauses={pauses}
          summaryP0Pct={p0Pct}
        />

        {/* Footer de trazabilidad */}
        <div className="text-center text-caption text-white/30 pb-4">
          Compartido por <span className="text-white/50">{createdBy}</span> el {createdLabel}
          {' · '}válido hasta <span className="text-white/50">{expiresLabel}</span>
          {' · '}
          <button
            onClick={() => navigate('/login')}
            className="text-amber-400/60 hover:text-amber-400 transition-colors underline"
          >
            acceder al sistema completo
          </button>
        </div>
      </main>
    </div>
  )
}
