/**
 * Landing unificado de Análisis Grader.
 *
 * Layout responsive optimizado para supervisor en planta (mobile) y
 * análisis post-turno (desktop).
 *
 * - Hero inteligente: cambia jerarquía según detecta turno vivo
 * - Desktop (lg+): 2-cols asimétrico (Recientes 60% | Calendario 40%)
 * - Tablet (sm+): stack vertical con recientes 3-col
 * - Mobile: CTA full-width, recientes scroll horizontal, accesos 2x2
 */

import { useEffect, useState, useMemo } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, Badge, Button } from '@/components/ui'
import { Upload, Activity, BarChart3, Settings2, TrendingUp, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
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

const P0_BORDER: Record<ReturnType<typeof verdictFromP0Pct>, string> = {
  ok: 'border-emerald-500/30 hover:border-emerald-500/60',
  warn: 'border-amber-500/30 hover:border-amber-500/60',
  critical: 'border-red-500/30 hover:border-red-500/60',
}

function RecentShiftCard({ summary, onClick }: { summary: GraderDailySummary; onClick: () => void }) {
  const verdict = verdictFromP0Pct(summary.pointZeroPct)
  const shortDate = summary.dateKey.slice(5) // MM-DD
  const shortShift = summary.shiftId.includes('día') ? 'Día' : 'Noche'
  const ariaLabel = `Turno ${shortShift} del ${summary.dateKey}. Punto cero ${summary.pointZeroPct.toFixed(1)}%. ${summary.totalPieces.toLocaleString('es-CL')} piezas.`

  return (
    <button
      aria-label={ariaLabel}
      className={`w-full text-left border rounded-lg p-3 bg-background/40 hover:bg-muted/40 transition-all space-y-1 min-w-[140px] ${P0_BORDER[verdict]}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs text-muted-foreground">{shortDate} · {shortShift}</span>
        {summary.hasPieceData && summary.hasGate0Data
          ? <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">●</Badge>
          : <Badge variant="outline" className="text-[10px] px-1 py-0 opacity-50 shrink-0">◐</Badge>}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${P0_COLOR[verdict]}`}>
        {summary.pointZeroPct.toFixed(1)}%
      </div>
      <div className="text-xs text-muted-foreground truncate">
        {summary.totalPieces.toLocaleString('es-CL')} pz
        {summary.totalWeightKg ? ` · ${summary.totalWeightKg.toFixed(0)} kg` : ''}
      </div>
    </button>
  )
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

  const [recentSummaries, setRecentSummaries] = useState<GraderDailySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [calendarOpenMobile, setCalendarOpenMobile] = useState(false)

  useEffect(() => {
    // Traemos 60 días hacia atrás para capturar turnos recientes aunque la
    // temporada haya bajado de cadencia en la última semana.
    const today = todayKey()
    const from = offsetDate(today, -60)
    listDailySummariesByRange(from, today)
      .then(list => {
        // Ordenar desc por dateKey+shiftId y quedarse con los 8 más recientes
        const sorted = [...list].sort((a, b) => {
          if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey)
          return b.shiftId.localeCompare(a.shiftId)
        })
        setRecentSummaries(sorted.slice(0, 8))
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

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6 max-w-screen-xl">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
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
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 shrink-0">
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
                <Button
                  size="lg"
                  onClick={goToUpload}
                  className="gap-2 w-full sm:w-auto"
                >
                  <Upload className="w-4 h-4" />
                  Cargar Excel
                </Button>
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

      {/* ── Desktop (xl+): 2-cols asimétrico | Mobile/Tablet: stack ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-6">
        {/* Columna izq (xl:5/12): Recientes compactos */}
        <section className="xl:col-span-5 min-w-0">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Últimos turnos
            </h2>
            {recentSummaries.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {recentSummaries.length} turnos
              </span>
            )}
          </div>
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="border rounded-lg p-3 animate-pulse h-20 bg-muted/20" />
              ))}
            </div>
          ) : recentSummaries.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-8 flex flex-col items-center gap-2 text-center">
                <BarChart3 className="w-6 h-6 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No hay turnos en los últimos 14 días.
                </p>
                <Button variant="outline" size="sm" onClick={goToUpload} className="gap-2 mt-1">
                  <Upload className="w-4 h-4" />
                  Cargar primer Excel
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Mobile: scroll horizontal */}
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-3 px-3 snap-x snap-mandatory sm:hidden">
                {recentSummaries.map(s => (
                  <div key={s.id} className="flex-shrink-0 w-[42vw] max-w-[180px] snap-start">
                    <RecentShiftCard summary={s} onClick={() => goToTurno(s.dateKey, s.shiftId)} />
                  </div>
                ))}
              </div>
              {/* Tablet+: grid adaptativo (3-4 cols según viewport) */}
              <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4 gap-2 sm:gap-3">
                {recentSummaries.map(s => (
                  <RecentShiftCard
                    key={s.id}
                    summary={s}
                    onClick={() => goToTurno(s.dateKey, s.shiftId)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Columna der (xl:7/12): Calendario — colapsable en mobile/tablet */}
        <section className="xl:col-span-7 min-w-0">
          {/* Mobile/Tablet toggle */}
          <button
            onClick={() => setCalendarOpenMobile(o => !o)}
            className="xl:hidden w-full flex items-center justify-between p-3 border rounded-lg text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-muted-foreground uppercase tracking-wider text-xs">
              <BarChart3 className="w-4 h-4" />
              Calendario histórico
            </span>
            {calendarOpenMobile ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {/* XL+: siempre visible con heading. Mobile/Tablet: colapsable */}
          <div className="hidden xl:block mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Calendario histórico
            </h2>
          </div>
          <div className={`${calendarOpenMobile ? 'block mt-3' : 'hidden'} xl:block`}>
            <GraderHistoricalCalendar onLoadTurno={goToTurno} />
          </div>
        </section>
      </div>
    </div>
  )
}
