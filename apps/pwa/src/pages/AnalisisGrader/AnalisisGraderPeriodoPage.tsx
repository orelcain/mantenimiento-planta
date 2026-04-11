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
import { ArrowLeft, BarChart3, Loader2, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissionsStore } from '@/store'
import { listDailySummariesByRange } from '@/services/grader/graderDailySummary.service'
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
