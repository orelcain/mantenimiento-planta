/**
 * Página de análisis de período del Grader.
 *
 * Ofrece un selector de rango (presets: semana / mes / trimestre / temporada
 * + Custom con 2 date pickers). Al cambiar el rango, consulta Firestore con
 * `listDailySummariesByRange`, agrega todo con `aggregateDailySummaries` y
 * pasa el resultado a `<GraderPeriodView />`.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Card, CardContent, Button } from '@/components/ui'
import { ArrowLeft, BarChart3, Loader2, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissionsStore } from '@/store'
import {
  listDailySummariesByRange,
  countLegacyTardeShifts,
  migrateTardeShiftsToNoche,
  type MigrationResult,
} from '@/services/grader/graderDailySummary.service'
import {
  aggregateDailySummaries,
  type PeriodAggregate,
} from '@/services/grader/graderPeriodAggregate'
import {
  PERIOD_PRESETS,
  PRESET_ORDER,
  getDefaultPreset,
  getWeekRangeByOffset,
  getMonthRangeByOffset,
  type PeriodPresetKey,
  type PeriodRange,
} from '@/services/grader/graderPeriodPresets'
import { GraderPeriodView } from '@/components/grader/GraderPeriodView'
import { BenchmarkComparisonCard } from '@/components/grader/BenchmarkComparisonCard'
import { TopActionsCard } from '@/components/grader/TopActionsCard'
import {
  loadSeasonBenchmark,
  compareAgainstBenchmark,
  type SeasonBenchmark,
  type BenchmarkComparison,
} from '@/services/grader/graderBenchmarks'
import { listShiftsByRange, type GraderShiftDoc } from '@/services/grader/graderShifts.service'
import { aggregateAttribution, type AggregatedAttribution } from '@/services/grader/graderAttribution'
import type { GraderDailySummary } from '@/services/grader/types'
import { PauseKpiDashboard } from '@/components/grader/PauseKpiDashboard'
import { MaintenanceImpactCard } from '@/components/grader/MaintenanceImpactCard'
import { MaintenanceWorkCard } from '@/components/grader/MaintenanceWorkCard'
import { useAppStore } from '@/store'
import { getExecutions, getOverdueTasks } from '@/services/preventive'
import { computeMaintenanceWork } from '@/services/grader/maintenanceWork'
import type { PreventiveExecution } from '@/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCustomRange(start: string, end: string): PeriodRange {
  return { start, end, label: 'Rango personalizado' }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function AnalisisGraderPeriodoPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()

  const defaultPreset = useMemo(() => getDefaultPreset(), [])
  const [activePreset, setActivePreset] = useState<PeriodPresetKey>(defaultPreset.key)
  const [range, setRange] = useState<PeriodRange>(defaultPreset.range)
  const [customOpen, setCustomOpen] = useState(false)
  const [customStart, setCustomStart] = useState(defaultPreset.range.start)
  const [customEnd, setCustomEnd] = useState(defaultPreset.range.end)
  // Offset para navegación prev/next de semana/mes (0 = actual, -1 = anterior, +1 = siguiente)
  const [weekOffset, setWeekOffset] = useState(0)
  const [monthOffset, setMonthOffset] = useState(0)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aggregate, setAggregate] = useState<PeriodAggregate | null>(null)

  // Benchmark + attribution (FASE 15)
  const [benchmark, setBenchmark] = useState<SeasonBenchmark | null>(null)
  const [comparison, setComparison] = useState<BenchmarkComparison | null>(null)
  const [attribution, setAttribution] = useState<AggregatedAttribution | null>(null)

  // Migración legacy 'Turno tarde' → 'Turno noche' (iter 8 mapeaba B incorrectamente)
  const [legacyCount, setLegacyCount] = useState<number | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)

  // Resúmenes del rango — alimentan las cards de Impacto de Mantención y Tiempo muerto.
  const [allSummaries, setAllSummaries] = useState<GraderDailySummary[]>([])

  // Trabajo de Mantención (TPM): incidencias (del store) + preventivas (cumplidas/vencidas).
  const incidents = useAppStore((s) => s.incidents)
  const [executions, setExecutions] = useState<PreventiveExecution[]>([])
  const [overdueCount, setOverdueCount] = useState(0)
  const [workReady, setWorkReady] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([getExecutions().catch(() => [] as PreventiveExecution[]), getOverdueTasks().catch(() => [])])
      .then(([exes, overdue]) => {
        if (!active) return
        setExecutions(exes)
        setOverdueCount(overdue.length)
        setWorkReady(true)
      })
    return () => { active = false }
  }, [])
  const work = useMemo(
    () => (workReady ? computeMaintenanceWork(incidents, executions, overdueCount, { start: range.start, end: range.end }) : null),
    [workReady, incidents, executions, overdueCount, range],
  )

  // Cargar benchmark una sola vez al montar
  useEffect(() => {
    loadSeasonBenchmark('2025-2026').then((bm) => setBenchmark(bm))
  }, [])

  // ── Fetch + agregar cada vez que cambia el rango ─────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    setAttribution(null)
    Promise.all([
      listDailySummariesByRange(range.start, range.end),
      listShiftsByRange(range.start, range.end),
    ])
      .then(([list, shifts]: [Parameters<typeof aggregateDailySummaries>[0], GraderShiftDoc[]]) => {
        const agg = aggregateDailySummaries(list, range)
        setAggregate(agg)
        setAllSummaries(list)
        setAttribution(aggregateAttribution(shifts))
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar el período')
      })
      .finally(() => setLoading(false))
  }, [range])

  // Recalcular comparativa cuando cambia el período o el benchmark
  useEffect(() => {
    if (aggregate && benchmark) {
      setComparison(compareAgainstBenchmark(aggregate, benchmark))
    } else {
      setComparison(null)
    }
  }, [aggregate, benchmark])

  // ── Detectar turnos legacy al montar ─────────────────────────────────────
  useEffect(() => {
    countLegacyTardeShifts()
      .then(setLegacyCount)
      .catch(() => setLegacyCount(null))
  }, [])

  const handleMigrate = async () => {
    setMigrating(true)
    setMigrationResult(null)
    try {
      const result = await migrateTardeShiftsToNoche()
      setMigrationResult(result)
      setLegacyCount(0)
      // Recargar el período actual para que se refleje
      const list = await listDailySummariesByRange(range.start, range.end)
      setAggregate(aggregateDailySummaries(list, range))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al migrar turnos')
    } finally {
      setMigrating(false)
    }
  }

  const handlePresetClick = (key: Exclude<PeriodPresetKey, 'custom'>) => {
    setActivePreset(key)
    setCustomOpen(false)
    if (key === 'week') {
      setWeekOffset(0)
      setRange(getWeekRangeByOffset(0))
    } else if (key === 'month') {
      setMonthOffset(0)
      setRange(getMonthRangeByOffset(0))
    } else {
      setRange(PERIOD_PRESETS[key]())
    }
  }

  const handleApplyCustom = () => {
    if (!customStart || !customEnd) return
    if (customStart > customEnd) return
    setActivePreset('custom')
    setRange(buildCustomRange(customStart, customEnd))
  }

  const handleWeekStep = (delta: number) => {
    const next = weekOffset + delta
    setWeekOffset(next)
    setActivePreset('week')
    setRange(getWeekRangeByOffset(next))
  }

  const handleMonthStep = (delta: number) => {
    const next = monthOffset + delta
    setMonthOffset(next)
    setActivePreset('month')
    setRange(getMonthRangeByOffset(next))
  }

  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="container mx-auto p-3 sm:p-4 space-y-4 max-w-screen-xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Análisis de Turno
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Análisis de período
            </h1>
            <p className="text-xs text-muted-foreground">
              Consolidado multi-día con KPIs ponderados y gráficos de tendencia
            </p>
          </div>
        </div>
      </div>

      {/* ── Banner de migración 'Turno tarde' → 'Turno noche' ──────────────
          Aparece si todavía hay docs legacy en Firestore del iter 8 donde
          B (noche) se mapeaba incorrectamente a 'Turno tarde'. */}
      {legacyCount !== null && legacyCount > 0 && !migrationResult && (
        <Card className="border-amber-500/[0.25] bg-amber-500/[0.15]">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm min-w-0">
                <p className="font-medium text-ink-warn">
                  {legacyCount} turno{legacyCount !== 1 ? 's' : ''} legacy con etiqueta "Turno tarde" detectado{legacyCount !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  La planta sólo tiene 2 turnos (A = día, B = noche). Los turnos cargados antes del iter 9 tienen la etiqueta "tarde" por error —
                  al migrar se convierten a "Turno noche" y se fusionan con el turno noche del mismo día si existe.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleMigrate}
              disabled={migrating}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              {migrating
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Migrando…</>
                : 'Migrar a "Turno noche"'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirmación post-migración */}
      {migrationResult && (
        <Card className="border-emerald-500/[0.25] bg-emerald-500/[0.15]">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-ink-ok">
              <span className="font-medium">Migración completa:</span>{' '}
              {migrationResult.processed} turnos procesados ·{' '}
              {migrationResult.merged} fusionados con noche existente ·{' '}
              {migrationResult.renamed} renombrados
              {migrationResult.errors > 0 && (
                <span className="text-ink-crit ml-2">· {migrationResult.errors} errores</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Selector de rango ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {PRESET_ORDER.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => handlePresetClick(p.key)}
                className={cn(
                  'px-3 py-1.5 rounded-ctl text-xs font-medium border transition-colors',
                  activePreset === p.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted/50',
                )}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomOpen((o) => !o)}
              className={cn(
                'px-3 py-1.5 rounded-ctl text-xs font-medium border transition-colors',
                activePreset === 'custom'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background border-border hover:bg-muted/50',
              )}
            >
              Personalizado…
            </button>
            <div className="text-xs text-muted-foreground ml-auto">
              {range.label} · {range.start} → {range.end}
            </div>
          </div>

          {/* Navegación prev/next específica para semana/mes */}
          {(activePreset === 'week' || activePreset === 'month') && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                Navegar {activePreset === 'week' ? 'semanas' : 'meses'}:
              </span>
              <button
                type="button"
                onClick={() => activePreset === 'week' ? handleWeekStep(-1) : handleMonthStep(-1)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-ctl text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors"
                title={activePreset === 'week' ? 'Semana anterior' : 'Mes anterior'}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => activePreset === 'week' ? handleWeekStep(0 - weekOffset) : handleMonthStep(0 - monthOffset)}
                disabled={(activePreset === 'week' && weekOffset === 0) || (activePreset === 'month' && monthOffset === 0)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-ctl text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={activePreset === 'week' ? 'Volver a semana actual' : 'Volver al mes actual'}
              >
                <Circle className="h-3 w-3" />
                Hoy
              </button>
              <button
                type="button"
                onClick={() => activePreset === 'week' ? handleWeekStep(1) : handleMonthStep(1)}
                disabled={(activePreset === 'week' && weekOffset >= 0) || (activePreset === 'month' && monthOffset >= 0)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-ctl text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={activePreset === 'week' ? 'Semana siguiente' : 'Mes siguiente'}
              >
                Siguiente
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <span className="text-[11px] text-muted-foreground ml-1">
                {activePreset === 'week'
                  ? (weekOffset === 0 ? 'semana actual' : `${weekOffset < 0 ? 'hace' : 'en'} ${Math.abs(weekOffset)} semana${Math.abs(weekOffset) !== 1 ? 's' : ''}`)
                  : (monthOffset === 0 ? 'mes actual' : `${monthOffset < 0 ? 'hace' : 'en'} ${Math.abs(monthOffset)} mes${Math.abs(monthOffset) !== 1 ? 'es' : ''}`)
                }
              </span>
            </div>
          )}

          {/* Inputs de rango personalizado */}
          {customOpen && (
            <div className="flex items-center gap-2 flex-wrap pt-2 border-t">
              <label className="text-xs text-muted-foreground">Desde:</label>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border rounded-ctl px-2 py-1 text-xs bg-background [color-scheme:dark]"
              />
              <label className="text-xs text-muted-foreground">Hasta:</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border rounded-ctl px-2 py-1 text-xs bg-background [color-scheme:dark]"
              />
              <Button size="sm" onClick={handleApplyCustom} disabled={!customStart || !customEnd || customStart > customEnd}>
                Aplicar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Estados: loading / error / view ─────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <Card className="border-red-300">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && aggregate && (
        <>
          <GraderPeriodView data={aggregate} />

          {/* ── FASE 15: Benchmark + Attribution lado a lado en desktop ─ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {benchmark && comparison && (
              <BenchmarkComparisonCard
                period={aggregate}
                benchmark={benchmark}
                comparison={comparison}
              />
            )}

            {attribution && (
              <TopActionsCard attribution={attribution} />
            )}
          </div>

          {/* ── Impacto de Mantención (confiabilidad: MTTR/MTBF/disponibilidad) ── */}
          <MaintenanceImpactCard
            summaries={allSummaries}
            periodLabel={range.label}
            rangeLabel={`${range.start} → ${range.end}`}
            work={work}
          />

          {/* ── Trabajo de Mantención (TPM): correctivo → causa raíz → prevención ── */}
          <MaintenanceWorkCard work={work} />

          {/* ── Tiempo muerto del período ──────────────────────────────── */}
          <PauseKpiDashboard summaries={allSummaries} />
        </>
      )}
    </div>
  )
}
