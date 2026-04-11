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
import { ArrowLeft, BarChart3, Loader2, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react'
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
  type PeriodPresetKey,
  type PeriodRange,
} from '@/services/grader/graderPeriodPresets'
import { GraderPeriodView } from '@/components/grader/GraderPeriodView'

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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aggregate, setAggregate] = useState<PeriodAggregate | null>(null)

  // Migración legacy 'Turno tarde' → 'Turno noche' (iter 8 mapeaba B incorrectamente)
  const [legacyCount, setLegacyCount] = useState<number | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)

  // ── Fetch + agregar cada vez que cambia el rango ─────────────────────────
  useEffect(() => {
    setLoading(true)
    setError(null)
    listDailySummariesByRange(range.start, range.end)
      .then((list) => {
        setAggregate(aggregateDailySummaries(list, range))
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al cargar el período')
      })
      .finally(() => setLoading(false))
  }, [range.start, range.end, range.label])

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
    setRange(PERIOD_PRESETS[key]())
    setCustomOpen(false)
  }

  const handleApplyCustom = () => {
    if (!customStart || !customEnd) return
    if (customStart > customEnd) return
    setActivePreset('custom')
    setRange(buildCustomRange(customStart, customEnd))
  }

  if (!canSee('analisisGrader')) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Volver
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
        <Button variant="outline" size="sm" onClick={() => navigate('/analisis-grader/calendario')}>
          <Calendar className="h-4 w-4 mr-1" />
          Calendario
        </Button>
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
        <GraderPeriodView data={aggregate} />
      )}
    </div>
  )
}
