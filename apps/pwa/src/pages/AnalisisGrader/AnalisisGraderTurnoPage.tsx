/**
 * Vista unificada de turno — reemplaza AnalisisGraderDetallePage.
 * Soporta modo live y closed. Ruta: /analisis-grader/turno/:shiftId
 *
 * shiftId format en URL: `YYYY-MM-DD__Turno%20d%C3%ADa`
 * (React Router decodifica automáticamente → `YYYY-MM-DD__Turno día`)
 */

import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Navigate } from 'react-router-dom'
import { Button, Card, CardContent, Spinner } from '@/components/ui'
import { ArrowLeft, Settings2, AlertCircle, Upload, Activity, Sparkles, Loader2 } from 'lucide-react'
import { usePermissionsStore } from '@/store'
import { getDailySummary, loadTimelineAggregates } from '@/services/grader/graderDailySummary.service'
import { getShiftDoc } from '@/services/grader/graderShifts.service'
import { computeShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'
import { DEFAULT_SHIFT_SCHEDULE } from '@/services/grader/graderShiftSchedule'
import { parseMatrixErrorString } from '@/services/grader/graderMatrixP0Causes'
import { HeroScorecard } from '@/components/grader/HeroScorecard'
import { P0CausesPanel } from '@/components/grader/P0CausesPanel'
import { ShiftTimelineView } from '@/components/grader/ShiftTimelineView'
import { ActionPlanPanel, deriveSuggestions } from '@/components/grader/ActionPlanPanel'
import { findTriggeredRunbooks } from '@/services/grader/graderRunbooks'
import { analyzeGraderFromSummary } from '@/services/grader/graderSummaryAI'
import { loadSeasonBenchmark, type SeasonBenchmark } from '@/services/grader/graderBenchmarks'
import { AIOutputPanel } from '@/components/grader/GraderInlinePanels'
import type { GraderDailySummary, MatrixP0Cause, PointZeroClassification, TimelineBucket } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'
import type { AIGraderOutput } from '@/services/grader/types'

/** Parsea `YYYY-MM-DD__Turno día` → [dateKey, shiftLabel] */
function parseShiftId(raw: string | undefined): [string, string] {
  if (!raw) return ['', '']
  const idx = raw.indexOf('__')
  if (idx === -1) return [raw, '']
  return [raw.slice(0, idx), raw.slice(idx + 2)]
}

/**
 * Deriva byMatrixCause desde topP0Causes del summary histórico.
 * Fallback cuando no hay datos de Excel P0 en sesión.
 */
function deriveByMatrixCause(
  topP0Causes: GraderDailySummary['topP0Causes'],
  totalP0Pieces: number,
): PointZeroClassification['byMatrixCause'] {
  const ALL: MatrixP0Cause[] = ['fuera_de_limites', 'no_leido_fotocelula', 'puerta_no_preparada', 'otro']
  const acc = Object.fromEntries(ALL.map(mc => [mc, { pieces: 0, pct: 0, subCauses: [] as PointZeroClassification['byMatrixCause'][MatrixP0Cause]['subCauses'] }])) as PointZeroClassification['byMatrixCause']

  for (const c of topP0Causes ?? []) {
    const mc = labelToMatrixCause(c.error)
    acc[mc].pieces += c.pieces
  }

  for (const mc of ALL) {
    acc[mc].pct = totalP0Pieces > 0 ? (acc[mc].pieces / totalP0Pieces) * 100 : 0
  }

  return acc
}

/** Clasifica strings de causa tanto del Excel Matrix como los internos */
function labelToMatrixCause(label: string): MatrixP0Cause {
  const s = (label ?? '').toLowerCase()
  const fromMatrix = parseMatrixErrorString(label)
  if (fromMatrix !== 'otro') return fromMatrix
  if (s.includes('rango')) return 'fuera_de_limites'
  if (s.includes('close') || s.includes('long')) return 'no_leido_fotocelula'
  return 'otro'
}

/** Causa Matrix dominante desde byMatrixCause */
function dominantCause(
  byMatrixCause: PointZeroClassification['byMatrixCause'] | null,
): MatrixP0Cause | null {
  if (!byMatrixCause) return null
  let top: MatrixP0Cause | null = null
  let max = 0
  for (const [mc, v] of Object.entries(byMatrixCause) as [MatrixP0Cause, { pieces: number }][]) {
    if (v.pieces > max) { max = v.pieces; top = mc }
  }
  return top
}

export function AnalisisGraderTurnoPage() {
  const { canSee } = usePermissionsStore()
  const navigate = useNavigate()
  const { shiftId: rawShiftId } = useParams<{ shiftId: string }>()

  const [dateKey, shiftLabel] = useMemo(() => parseShiftId(rawShiftId), [rawShiftId])

  const [shiftWindow, setShiftWindow] = useState<ShiftTimeWindow | null>(
    () => dateKey && shiftLabel
      ? computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
      : null,
  )

  // Sincronizar cuando cambia la URL
  useEffect(() => {
    setShiftWindow(
      dateKey && shiftLabel
        ? computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
        : null,
    )
  }, [dateKey, shiftLabel])

  // Auto-refresh cada minuto si el turno está en vivo
  // Solo dependemos de `status` para evitar resetear el interval en cada tick
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shiftWindow || shiftWindow.status !== 'live') return
    const id = setInterval(() => {
      setShiftWindow(
        dateKey && shiftLabel
          ? computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
          : null,
      )
    }, 60_000)
    return () => clearInterval(id)
  }, [shiftWindow?.status, dateKey, shiftLabel])

  const [summary, setSummary] = useState<GraderDailySummary | null>(null)
  const [shiftDoc, setShiftDoc] = useState<GraderShiftDoc | null>(null)
  const [timelineBuckets, setTimelineBuckets] = useState<TimelineBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── IA (FASE 16) ─────────────────────────────────────────────────────────
  const [aiOutput, setAiOutput] = useState<AIGraderOutput | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [benchmark, setBenchmark] = useState<SeasonBenchmark | null>(null)

  useEffect(() => {
    loadSeasonBenchmark('2025-2026').then(setBenchmark).catch(() => setBenchmark(null))
  }, [])

  const handleGenerateAI = async () => {
    if (!summary) return
    setAiLoading(true)
    setAiError(null)
    try {
      const benchmarkDelta = benchmark
        ? +(summary.pointZeroPct - benchmark.p0Pct).toFixed(2)
        : undefined
      const result = await analyzeGraderFromSummary(summary, undefined, {
        actions: shiftDoc?.actions,
        benchmarkDelta,
      })
      setAiOutput(result)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Error al analizar con IA')
    } finally {
      setAiLoading(false)
    }
  }

  useEffect(() => {
    if (!dateKey || !shiftLabel) {
      setError('URL inválida. Formato esperado: /turno/YYYY-MM-DD__Turno día')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    Promise.all([
      getDailySummary(dateKey, shiftLabel),
      getShiftDoc(dateKey, shiftLabel).catch(() => null),
    ])
      .then(([s, sd]) => {
        if (!s) {
          const win = computeShiftTimeWindow(dateKey, shiftLabel, DEFAULT_SHIFT_SCHEDULE)
          if (win.status !== 'live') {
            setError(`Turno ${shiftLabel} del ${dateKey} no encontrado en el historial.`)
          }
          // Si es live: summary=null + error=null → renderiza empty-state con CTA de upload
        } else {
          setSummary(s)
        }
        setShiftDoc(sd)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error al cargar el turno.'))
      .finally(() => setLoading(false))
  }, [dateKey, shiftLabel])

  // Carga timeline sub-collection (graderDailySummaries/{id}/meta/timeline)
  useEffect(() => {
    if (!dateKey || !shiftLabel) return
    loadTimelineAggregates(`${dateKey}__${shiftLabel}`)
      .then(buckets => setTimelineBuckets(buckets ?? []))
      .catch(() => {})
  }, [dateKey, shiftLabel])

  // Todos los useMemo ANTES del early return condicional (regla de hooks)
  const byMatrixCause = useMemo(() => {
    if (!summary?.topP0Causes?.length) return null
    return deriveByMatrixCause(summary.topP0Causes, summary.pointZeroPieces)
  }, [summary])

  const dominant = useMemo(() => dominantCause(byMatrixCause), [byMatrixCause])

  const suggestions = useMemo(
    () => deriveSuggestions(summary?.pointZeroPct ?? 0, dominant),
    [summary, dominant],
  )

  const triggeredRunbooks = useMemo(
    () => findTriggeredRunbooks(dominant, summary?.pointZeroPct ?? 0),
    [dominant, summary],
  )

  const shiftDocId = `${dateKey}__${shiftLabel}`

  if (!canSee('analisisGrader')) return <Navigate to="/" replace />

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/analisis-grader')}
          className="gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Análisis Grader
        </Button>
        {dateKey && shiftLabel && (
          <span className="text-sm text-muted-foreground">
            {shiftLabel} · {dateKey}
          </span>
        )}
      </div>

      {/* Estados */}
      {loading && (
        <div className="flex items-center gap-3 py-8 justify-center text-muted-foreground">
          <Spinner className="w-5 h-5" />
          Cargando turno…
        </div>
      )}

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 flex items-center gap-3 text-destructive">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* Turno en vivo sin datos aún */}
      {!loading && !error && !summary && shiftWindow?.status === 'live' && (
        <Card className="border-dashed">
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <Activity className="w-8 h-8 text-red-400 animate-pulse" />
            <p className="font-medium">Turno en curso — sin datos cargados aún</p>
            <p className="text-sm text-muted-foreground">
              Cargá el primer Excel de Matrix para ver el estado del proceso.
            </p>
            <Button onClick={() => navigate('/analisis-grader/wizard')} className="gap-2 mt-1">
              <Upload className="w-4 h-4" />
              Cargar Excel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Contenido principal */}
      {summary && shiftWindow && (
        <>
          {/* Fila superior: scorecard + acciones */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <HeroScorecard summary={summary} shiftWindow={shiftWindow} />
              <P0CausesPanel
                byMatrixCause={byMatrixCause}
                totalP0Pct={summary.pointZeroPct}
              />
            </div>

            <div className="space-y-4">
              <ActionPlanPanel
                shiftDocId={shiftDocId}
                suggestions={suggestions}
                status={shiftWindow.status}
                relatedRunbooks={triggeredRunbooks}
              />
            </div>
          </div>

          {/* Timeline — full width */}
          <ShiftTimelineView
            timelineBuckets={timelineBuckets}
            shiftDoc={shiftDoc}
            shiftWindow={shiftWindow}
          />

          {/* ── Sección IA ─────────────────────────────────────────────── */}
          <Card>
            <CardContent className="py-3 px-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-medium">Análisis IA</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateAI}
                  disabled={aiLoading || !summary}
                  className="text-xs"
                >
                  {aiLoading
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Analizando…</>
                    : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />{aiOutput ? 'Regenerar' : 'Generar análisis'}</>}
                </Button>
              </div>
              {aiError && (
                <p className="text-xs text-destructive">{aiError}</p>
              )}
            </CardContent>
          </Card>
          {aiOutput && <AIOutputPanel output={aiOutput} />}

          {/* Link a configuración avanzada */}
          <button
            onClick={() => navigate('/analisis-grader/wizard?tab=gates')}
            className="w-full text-left"
          >
            <Card className="border-dashed hover:bg-muted/30 transition-colors">
              <CardContent className="py-3 px-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Settings2 className="w-4 h-4" />
                Abrir configuración física avanzada (12 Gates, Cintas, Distancias…)
              </CardContent>
            </Card>
          </button>
        </>
      )}
    </div>
  )
}
