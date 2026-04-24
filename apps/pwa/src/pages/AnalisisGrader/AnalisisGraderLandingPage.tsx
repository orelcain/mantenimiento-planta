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
import { Upload, Activity, BarChart3, Settings2, TrendingUp, BookOpen, Eye, ClipboardList, GitCompare } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { useIsAdmin } from '@/store/authStore'
import { GlobalSettingsModal } from '@/components/grader/GlobalSettingsModal'
import { DayComparisonModal } from '@/components/grader/DayComparisonModal'
import { listDailySummariesByRange, loadPausesAggregates } from '@/services/grader/graderDailySummary.service'
import { resolveEffectiveTag } from '@/services/grader/graderPauseTags'
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
  const isAdmin = useIsAdmin()
  const navigate = useNavigate()

  const [lastClosedShift, setLastClosedShift] = useState<GraderDailySummary | null>(null)
  const [allSummaries, setAllSummaries] = useState<GraderDailySummary[]>([])
  const [loading, setLoading] = useState(true)

  // M1 — badge pausas sin clasificar
  const [untaggedCount, setUntaggedCount] = useState<number | null>(null)

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
        setAllSummaries(list)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // M1 — carga lazy de meta/pauses solo para admins, últimos 7 días
  useEffect(() => {
    if (!isAdmin || allSummaries.length === 0) return
    const cutoff = offsetDate(todayKey(), -7)
    const recent = allSummaries.filter(
      s => s.dateKey >= cutoff && (s.pausesCount ?? 0) > 0
    )
    if (recent.length === 0) { setUntaggedCount(0); return }
    let count = 0
    Promise.all(recent.map(s => loadPausesAggregates(s.id)))
      .then(results => {
        for (const result of results) {
          if (!result) continue
          for (const pause of result.pauses) {
            if (!resolveEffectiveTag(pause)) count++
          }
        }
        setUntaggedCount(count)
      })
      .catch(() => setUntaggedCount(null))
  }, [allSummaries, isAdmin])

  const liveShift = useMemo(() => {
    const today = todayKey()
    const now = new Date()
    for (const sched of DEFAULT_SHIFT_SCHEDULE) {
      const win = computeShiftTimeWindow(today, sched.shiftId, DEFAULT_SHIFT_SCHEDULE, now)
      if (win.status === 'live') return { shiftId: sched.shiftId, window: win }
    }
    return null
  }, [])

  // Formatear fecha corta del último turno ("lun 27 feb")
  // IMPORTANTE: todos los hooks deben ir ANTES del early return de canSee
  // para respetar rules-of-hooks.
  const lastShiftLabel = useMemo(() => {
    if (!lastClosedShift) return null
    const d = new Date(`${lastClosedShift.dateKey}T12:00:00`)
    const dayName = d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')
    const dayNum = d.getDate()
    const monthName = d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')
    const shortShift = lastClosedShift.shiftId.includes('día') ? 'día' : 'noche'
    return `${dayName} ${dayNum} ${monthName} · ${shortShift}`
  }, [lastClosedShift])

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showComparison, setShowComparison] = useState(false)

  // Par de turnos día+noche para el último día con ambos turnos disponibles
  const comparisonPair = useMemo<[GraderDailySummary, GraderDailySummary] | null>(() => {
    if (!lastClosedShift || allSummaries.length === 0) return null
    const dateKey = lastClosedShift.dateKey
    const dayShift   = allSummaries.find((s) => s.dateKey === dateKey && s.shiftId === 'Turno día')
    const nightShift = allSummaries.find((s) => s.dateKey === dateKey && s.shiftId === 'Turno noche')
    if (!dayShift || !nightShift) return null
    return [dayShift, nightShift]
  }, [allSummaries, lastClosedShift])

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  const goToTurno = (dateKey: string, shiftId: string) => {
    navigate(`/analisis-grader/turno/${dateKey}__${encodeURIComponent(shiftId)}`)
  }

  const goToUpload = () => navigate('/analisis-grader/wizard')

  const lastShiftVerdict = lastClosedShift ? verdictFromP0Pct(lastClosedShift.pointZeroPct) : 'ok'

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-4 sm:space-y-6 max-w-screen-xl">
      {/* ── Hero inteligente ───────────────────────────────────────────── */}
      <Card className="border-primary/20 overflow-hidden">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0 flex items-start justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">Análisis de Turno</h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                  Línea completa: Grader + Baaders. Cargá el Excel del Grader para ver el estado del turno.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                title="Configuración global (umbrales + tags + detector). Los 12 gates se editan en cada turno."
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <Settings2 className="w-4 h-4" />
              </Button>
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
                  {/* D↔N rápido: solo cuando el último día tiene ambos turnos */}
                  {!loading && comparisonPair && (
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => setShowComparison(true)}
                      className="gap-2 text-indigo-500 border-indigo-500/30 hover:bg-indigo-500/10 w-full sm:w-auto"
                      title="Comparar turno día vs noche"
                    >
                      <GitCompare className="w-4 h-4" />
                      D↔N
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── M1 · Badge pausas sin clasificar (solo admins) ───────────── */}
      {isAdmin && untaggedCount !== null && untaggedCount > 0 && (
        <button
          onClick={() => navigate('/analisis-grader/periodo')}
          className="flex items-center justify-between gap-3 w-full px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 transition-colors text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <ClipboardList className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-sm">
              <span className="font-semibold text-amber-400">{untaggedCount}</span>
              <span className="text-muted-foreground">
                {' '}pausa{untaggedCount !== 1 ? 's' : ''} sin clasificar en los últimos 7 días
              </span>
            </span>
          </div>
          <span className="text-xs text-amber-400 shrink-0">Clasificar →</span>
        </button>
      )}

      {/* ── Accesos rápidos: tira compacta (3 en mobile, 3 en desktop) ── */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <QuickAccess
          icon={TrendingUp}
          title="Período"
          subtitle="Tendencia multi-turno · benchmark"
          onClick={() => navigate('/analisis-grader/periodo')}
          accent
        />
        <QuickAccess
          icon={Settings2}
          title="Configuración global"
          subtitle="Umbrales · tags · detector pausas"
          onClick={() => setSettingsOpen(true)}
        />
        <QuickAccess
          icon={BookOpen}
          title="Manual"
          subtitle="10 runbooks Z2 + glosario"
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

      <GlobalSettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />

      {showComparison && comparisonPair && (
        <DayComparisonModal
          open={showComparison}
          onClose={() => setShowComparison(false)}
          summaries={comparisonPair}
          dateKey={comparisonPair[0].dateKey}
        />
      )}
    </div>
  )
}
