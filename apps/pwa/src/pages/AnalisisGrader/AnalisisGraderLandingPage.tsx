/**
 * Landing unificado de Análisis Grader.
 *
 * Filosofía de UX: una acción por zona.
 *  · Hero → ¿qué hago ahora? (CTA inteligente: turno vivo / último turno / upload)
 *  · Accesos rápidos → ¿a dónde voy?
 *  · Calendario histórico → ¿qué pasó antes?
 *
 * El calendario es la fuente única para turnos previos (con color por verdict
 * P0, navegación por mes, panel detalle). No hay lista redundante de "últimos
 * turnos" — esa info YA está en el calendario con más contexto visual.
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, Badge, Button } from '@/components/ui'
import { Upload, Activity, BarChart3, Settings2, TrendingUp, BookOpen, Eye } from 'lucide-react'
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

interface QuickAccessProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  subtitle: string
  onClick: () => void
  accent?: boolean
}

function QuickAccess({ icon: Icon, title, subtitle, onClick, accent }: QuickAccessProps) {
  return (
    <button
      onClick={onClick}
      className={`group w-full text-left border rounded-lg p-3 transition-all hover:bg-muted/40 ${
        accent ? 'border-primary/30 hover:border-primary/60' : 'hover:border-muted-foreground/40'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={`w-5 h-5 shrink-0 ${accent ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} transition-colors`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm truncate">{title}</div>
          <div className="text-xs text-muted-foreground truncate hidden sm:block">{subtitle}</div>
        </div>
      </div>
    </button>
  )
}

export function AnalisisGraderLandingPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()

  const [lastClosedShift, setLastClosedShift] = useState<GraderDailySummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Traemos 60 días para capturar el último turno cerrado aunque la
    // temporada haya bajado de cadencia.
    const today = todayKey()
    const from = offsetDate(today, -60)
    listDailySummariesByRange(from, today)
      .then(list => {
        // Ordenar desc por dateKey+shiftId (más reciente primero)
        const sorted = [...list].sort((a, b) => {
          if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey)
          return b.shiftId.localeCompare(a.shiftId)
        })
        setLastClosedShift(sorted[0] ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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

  const goToUpload = () => navigate('/analisis-grader/wizard')

  // Formatear fecha corta del último turno ("lun 27 feb")
  const lastShiftLabel = useMemo(() => {
    if (!lastClosedShift) return null
    const d = new Date(`${lastClosedShift.dateKey}T12:00:00`)
    const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')
    const dayNum = d.getDate()
    const monthName = d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
    const shortShift = lastClosedShift.shiftId.includes('día') ? 'día' : 'noche'
    return `${dayName} ${dayNum} ${monthName} · ${shortShift}`
  }, [lastClosedShift])

  const lastShiftVerdict = lastClosedShift ? verdictFromP0Pct(lastClosedShift.pointZeroPct) : 'ok'

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6 max-w-screen-xl">
      {/* ── Hero inteligente ───────────────────────────────────────────── */}
      <Card className="border-primary/20 overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold">Análisis Grader</h1>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                Cargá el Excel exportado de Matrix para ver el estado del proceso
              </p>
            </div>

            {/* CTAs: mobile stack, desktop inline */}
            <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto">
              {liveShift ? (
                <>
                  <Button
                    size="lg"
                    onClick={() => goToTurno(todayKey(), liveShift.shiftId)}
                    className="gap-2 bg-red-500/90 hover:bg-red-500 text-white border-0 w-full sm:w-auto"
                  >
                    <Activity className="w-4 h-4 animate-pulse" />
                    <span className="hidden sm:inline">Turno en vivo:</span>
                    <span>{liveShift.shiftId}</span>
                    <Badge className="bg-white/20 text-white text-[10px] ml-1 border-0">LIVE</Badge>
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={goToUpload}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Upload className="w-4 h-4" />
                    Cargar Excel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    onClick={goToUpload}
                    className="gap-2 w-full sm:w-auto"
                  >
                    <Upload className="w-4 h-4" />
                    Cargar Excel
                  </Button>
                  {/* CTA secundario: último turno (si existe) */}
                  {!loading && lastClosedShift && lastShiftLabel && (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => goToTurno(lastClosedShift.dateKey, lastClosedShift.shiftId)}
                      className="gap-2 w-full sm:w-auto"
                    >
                      <Eye className="w-4 h-4 text-muted-foreground" />
                      <span className="hidden sm:inline">Último turno:</span>
                      <span className="text-xs sm:text-sm font-normal text-muted-foreground">{lastShiftLabel}</span>
                      <span className={`font-bold tabular-nums ${P0_COLOR[lastShiftVerdict]}`}>
                        {lastClosedShift.pointZeroPct.toFixed(1)}%
                      </span>
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Accesos rápidos: tira compacta ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <QuickAccess
          icon={TrendingUp}
          title="Análisis de período"
          subtitle="Tendencia multi-turno"
          onClick={() => navigate('/analisis-grader/periodo')}
          accent
        />
        <QuickAccess
          icon={BarChart3}
          title="Dashboard clásico"
          subtitle="Upload + análisis detallado"
          onClick={goToUpload}
        />
        <QuickAccess
          icon={Settings2}
          title="Configuración"
          subtitle="Gates, cintas, distancias"
          onClick={() => navigate('/analisis-grader/wizard?tab=gates')}
        />
        <QuickAccess
          icon={BookOpen}
          title="Manual y runbooks"
          subtitle="10 procedimientos Z2"
          onClick={() => navigate('/analisis-grader/ayuda')}
        />
      </div>

      {/* ── Calendario histórico: protagonismo total, full width ───────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Historial de turnos
          </h2>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Click en un día para ver detalle · colores según P0%
          </span>
        </div>
        <GraderHistoricalCalendar onLoadTurno={goToTurno} />
      </section>
    </div>
  )
}
