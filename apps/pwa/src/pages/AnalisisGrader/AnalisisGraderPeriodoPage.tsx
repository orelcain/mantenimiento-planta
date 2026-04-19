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
import { ArrowLeft, BarChart3, Loader2, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Circle, RefreshCcw } from 'lucide-react'
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
import { reclassifyShift, type ReclassifyResult } from '@/services/grader/graderReclassifier'
import { useIsAdmin } from '@/store'
import type { GraderDailySummary } from '@/services/grader/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildCustomRange(start: string, end: string): PeriodRange {
  return { start, end, label: 'Rango personalizado' }
}

// ── Componente ───────────────────────────────────────────────────────────────

export function AnalisisGraderPeriodoPage() {
  const { canSee } = usePermissionsStore()
  const isAdmin = useIsAdmin()
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

  // Reclasificador histórico (FASE 26) — admin only
  const [allSummaries, setAllSummaries] = useState<GraderDailySummary[]>([])
  const [reclassifying, setReclassifying] = useState(false)
  const [reclassifyProgress, setReclassifyProgress] = useState<{ current: number; total: number } | null>(null)
  const [reclassifyReport, setReclassifyReport] = useState<{ ok: number; warnings: number; errors: number; details: Array<ReclassifyResult & { error?: string }> } | null>(null)

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

  const handleReclassify = async () => {
    if (allSummaries.length === 0) return
    setReclassifying(true)
    setReclassifyReport(null)
    const BATCH = 5
    const TIMEOUT_MS = 25_000
    const INTER_BATCH_MS = 150
    const results: Array<ReclassifyResult & { error?: string }> = new Array(allSummaries.length)
    let completed = 0

    const withTimeout = (summary: GraderDailySummary) =>
      Promise.race([
        // writeSyntheticSnapshots:false — clasifica en memoria sin escribir snapshots a Firestore
        // (evita N writes secuenciales + re-lectura por turno que causaban throttling)
        reclassifyShift(summary.id, { writeSyntheticSnapshots: false }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout 25s')), TIMEOUT_MS),
        ),
      ])

    for (let i = 0; i < allSummaries.length; i += BATCH) {
      const slice = allSummaries.slice(i, i + BATCH)
      await Promise.all(
        slice.map(async (summary, idx) => {
          try {
            results[i + idx] = await withTimeout(summary)
          } catch (err) {
            results[i + idx] = {
              shiftDocId: summary.id,
              topP0CausesBefore: [],
              topP0CausesAfter: [],
              inferredSnapshotsCount: 0,
              confidence: 'low',
              error: err instanceof Error ? err.message : String(err),
            }
          } finally {
            completed++
            setReclassifyProgress({ current: completed, total: allSummaries.length })
          }
        }),
      )
      // Pequeña pausa entre batches para no saturar Firestore
      if (i + BATCH < allSummaries.length) {
        await new Promise((r) => setTimeout(r, INTER_BATCH_MS))
      }
    }
    setReclassifyReport({
      ok: results.filter(r => !r.error && r.confidence !== 'low').length,
      warnings: results.filter(r => !r.error && r.confidence === 'low').length,
      errors: results.filter(r => !!r.error).length,
      details: results,
    })
    setReclassifying(false)
    setReclassifyProgress(null)
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
            Análisis Grader
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
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-sm min-w-0">
                <p className="font-medium text-amber-700 dark:text-amber-400">
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
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              <span className="font-medium">Migración completa:</span>{' '}
              {migrationResult.processed} turnos procesados ·{' '}
              {migrationResult.merged} fusionados con noche existente ·{' '}
              {migrationResult.renamed} renombrados
              {migrationResult.errors > 0 && (
                <span className="text-red-600 ml-2">· {migrationResult.errors} errores</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Reclasificador histórico (solo admin) ───────────────────────── */}
      {isAdmin && allSummaries.length > 0 && (
        <Card className="border-cyan-500/40 bg-cyan-500/5">
          <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <RefreshCcw className="h-4 w-4 text-cyan-500 shrink-0 mt-0.5" />
              <div className="text-sm min-w-0">
                <p className="font-medium text-cyan-700 dark:text-cyan-400">
                  Reclasificación histórica (FASE 26)
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Re-procesa {allSummaries.length} turno{allSummaries.length !== 1 ? 's' : ''} del rango actual con la lógica de 9 causas Matrix. Infiere config de gates desde pieceRecords almacenados.
                </p>
                {reclassifyReport && (
                  <div className="mt-2 text-xs space-y-1">
                    <p>✅ {reclassifyReport.ok} ok · ⚠️ {reclassifyReport.warnings} baja confianza · ❌ {reclassifyReport.errors} errores</p>
                    <details>
                      <summary className="cursor-pointer text-muted-foreground">Ver detalle</summary>
                      <pre className="text-[10px] bg-muted/40 p-2 rounded mt-1 overflow-x-auto max-h-40">{JSON.stringify(reclassifyReport.details.map(r => ({ id: r.shiftDocId, confidence: r.confidence, n: r.inferredSnapshotsCount, error: r.error })), null, 2)}</pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
            <Button
              size="sm"
              onClick={handleReclassify}
              disabled={reclassifying}
              className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
            >
              {reclassifying && reclassifyProgress
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Reclasificando {reclassifyProgress.current}/{reclassifyProgress.total}…</>
                : <><RefreshCcw className="h-3.5 w-3.5 mr-1.5" />Reclasificar</>}
            </Button>
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
                  'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
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
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
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
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors"
                title={activePreset === 'week' ? 'Semana anterior' : 'Mes anterior'}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </button>
              <button
                type="button"
                onClick={() => activePreset === 'week' ? handleWeekStep(0 - weekOffset) : handleMonthStep(0 - monthOffset)}
                disabled={(activePreset === 'week' && weekOffset === 0) || (activePreset === 'month' && monthOffset === 0)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={activePreset === 'week' ? 'Volver a semana actual' : 'Volver al mes actual'}
              >
                <Circle className="h-3 w-3" />
                Hoy
              </button>
              <button
                type="button"
                onClick={() => activePreset === 'week' ? handleWeekStep(1) : handleMonthStep(1)}
                disabled={(activePreset === 'week' && weekOffset >= 0) || (activePreset === 'month' && monthOffset >= 0)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                className="border rounded px-2 py-1 text-xs bg-background [color-scheme:dark]"
              />
              <label className="text-xs text-muted-foreground">Hasta:</label>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border rounded px-2 py-1 text-xs bg-background [color-scheme:dark]"
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
        </>
      )}
    </div>
  )
}
