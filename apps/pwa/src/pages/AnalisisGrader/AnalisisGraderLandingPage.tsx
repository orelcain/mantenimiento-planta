/**
 * Landing unificado de Análisis Grader.
 * Reemplaza a AnalisisGraderWizardPage como punto de entrada principal.
 *
 * FASE 12 — solo landing + acceso a TurnoPage.
 * Upload completo sigue en WizardPage (conservada hasta FASE 16).
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, Badge, Button } from '@/components/ui'
import { Upload, Activity, BarChart3, Settings2, TrendingUp, Clock } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
import { computeShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { DEFAULT_SHIFT_SCHEDULE } from '@/services/grader/graderShiftSchedule'
import { verdictFromP0Pct } from '@/services/grader/graderThresholds'
import { GraderHistoricalCalendar } from '@/components/grader/GraderHistoricalCalendar'
import type { GraderDailySummary } from '@/services/grader/types'

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function offsetDate(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const P0_COLOR: Record<ReturnType<typeof verdictFromP0Pct>, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  critical: 'text-red-400',
}

function RecentShiftCard({ summary, onClick }: { summary: GraderDailySummary; onClick: () => void }) {
  const verdict = verdictFromP0Pct(summary.pointZeroPct)
  const shortDate = summary.dateKey.slice(5) // MM-DD
  const shortShift = summary.shiftId.includes('día') ? 'Día' : 'Noche'

  return (
    <button
      className="w-full text-left border rounded-lg p-3 hover:bg-muted/40 transition-colors space-y-1"
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{shortDate} · {shortShift}</span>
        {summary.hasPieceData && summary.hasGate0Data
          ? <Badge variant="outline" className="text-xs px-1 py-0">completo</Badge>
          : <Badge variant="outline" className="text-xs px-1 py-0 opacity-60">parcial</Badge>}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${P0_COLOR[verdict]}`}>
        {summary.pointZeroPct.toFixed(1)}%
      </div>
      <div className="text-xs text-muted-foreground">
        {summary.totalPieces.toLocaleString('es-CL')} piezas
        {summary.totalWeightKg ? ` · ${summary.totalWeightKg.toFixed(0)} kg` : ''}
      </div>
    </button>
  )
}

export function AnalisisGraderLandingPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()

  const [recentSummaries, setRecentSummaries] = useState<GraderDailySummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const today = todayKey()
    const from = offsetDate(today, -14)
    listDailySummariesByRange(from, today)
      .then(list => setRecentSummaries(list.slice(0, 8)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Detectar turno vivo ahora mismo
  const liveShift = useMemo(() => {
    const today = todayKey()
    const now = new Date()
    for (const sched of DEFAULT_SHIFT_SCHEDULE) {
      const win = computeShiftTimeWindow(today, sched.shiftId, DEFAULT_SHIFT_SCHEDULE, now)
      if (win.status === 'live') return { shiftId: sched.shiftId, window: win }
    }
    return null
  }, [])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  const goToTurno = (dateKey: string, shiftId: string) => {
    navigate(`/analisis-grader/turno/${dateKey}__${encodeURIComponent(shiftId)}`)
  }

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-screen-xl">
      {/* Hero */}
      <Card className="border-primary/20">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold mb-1">Análisis Grader</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Cargá el Excel exportado de Matrix para ver el estado del proceso
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              size="lg"
              onClick={() => navigate('/analisis-grader/wizard')}
              className="gap-2"
            >
              <Upload className="w-4 h-4" />
              Cargar Excel
            </Button>
            {liveShift && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => goToTurno(todayKey(), liveShift.shiftId)}
                className="gap-2"
              >
                <Activity className="w-4 h-4 text-red-400 animate-pulse" />
                Turno en vivo: {liveShift.shiftId}
                <Badge className="bg-red-500 text-white text-xs ml-1">LIVE</Badge>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Turnos recientes */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Últimos turnos
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border rounded-lg p-3 animate-pulse h-20 bg-muted/30" />
            ))}
          </div>
        ) : recentSummaries.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            No hay turnos en los últimos 14 días. Cargá un Excel para empezar.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recentSummaries.map(s => (
              <RecentShiftCard
                key={s.id}
                summary={s}
                onClick={() => goToTurno(s.dateKey, s.shiftId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Accesos rápidos — fila horizontal */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button className="text-left" onClick={() => navigate('/analisis-grader/periodo')}>
          <Card className="hover:bg-muted/40 transition-colors h-full">
            <CardContent className="p-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <div>
                <div className="font-medium text-xs">Análisis de período</div>
                <div className="text-xs text-muted-foreground">Tendencia multi-turno</div>
              </div>
            </CardContent>
          </Card>
        </button>

        <button className="text-left" onClick={() => navigate('/analisis-grader/wizard')}>
          <Card className="hover:bg-muted/40 transition-colors h-full">
            <CardContent className="p-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary shrink-0" />
              <div>
                <div className="font-medium text-xs">Análisis rápido</div>
                <div className="text-xs text-muted-foreground">Upload + dashboard</div>
              </div>
            </CardContent>
          </Card>
        </button>

        <button className="text-left" onClick={() => navigate('/analisis-grader/gates-config')}>
          <Card className="hover:bg-muted/40 transition-colors h-full">
            <CardContent className="p-3 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <div className="font-medium text-xs">Configuración avanzada</div>
                <div className="text-xs text-muted-foreground">Gates, cintas, distancias</div>
              </div>
            </CardContent>
          </Card>
        </button>

        <div className="opacity-50 cursor-not-allowed">
          <Card className="h-full">
            <CardContent className="p-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <div className="font-medium text-xs">Manual y runbooks</div>
                <div className="text-xs text-muted-foreground">Próximamente (FASE 14)</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Calendario — full width para que el panel de detalle no se apile */}
      <GraderHistoricalCalendar onLoadTurno={goToTurno} />
    </div>
  )
}
