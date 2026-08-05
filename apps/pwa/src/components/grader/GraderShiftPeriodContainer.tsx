/**
 * Une el hook de datos con la vista de período. Es el único punto donde la
 * página real toca la Matriz/Lista: le pasa el mes y la línea, y recibe el
 * turno elegido.
 *
 * Se mantiene aparte de `GraderShiftPeriodView` para que la vista siga siendo
 * un componente puro de presentación — así se puede montar con un fixture (ver
 * `pages/dev/MatrizTurnosDevPage`) sin arrastrar Firestore ni autenticación.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useGraderShiftPeriod } from '@/hooks/useGraderShiftPeriod'
import { GraderShiftPeriodView } from '@/components/grader/GraderShiftPeriodView'
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import type { PlantLineId } from '@/config/plantLines'
import type { GraderDailySummary } from '@/services/grader/types'
import { computePeriodMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'
import { useGraderSelectionStore } from '@/store/graderSelectionStore'
import { buildPeriodSummary } from '@/services/grader/graderPeriodSummary'
import { loadPeriodReliability } from '@/services/grader/graderPeriodReliability'
import { exportPeriodSummaryPng } from '@/services/grader/graderPeriodSummaryPng'
import { exportPeriodSummaryPdf } from '@/services/grader/graderPeriodSummaryPdf'
import { getAreaDisplayLabel, DEFAULT_PLANT_LINE_ID } from '@/config/plantLines'

export interface GraderShiftPeriodContainerProps {
  plantLineId?: PlantLineId
  /** Mes visible. Lo controla la página para compartirlo con los paneles. */
  month: Date
  onMonthChange?: (next: Date) => void
  /**
   * Summaries del Grader del mes. Los emitía el calendario y los consumen el
   * KPI board y el panel mensual — sin esto, al retirar el calendario esos dos
   * se quedaban vacíos sin aviso.
   */
  onSummariesLoaded?: (summaries: GraderDailySummary[]) => void
  /** Stats mensuales de Shoplogix para el panel de resumen. */
  onMonthStatsLoaded?: (stats: ReturnType<typeof computePeriodMonthlyStats>) => void
  onSelectShift?: (shift: PeriodShift) => void
  /** Abrir el análisis completo del turno (equivale al 'Cargar' del calendario). */
  onOpenShift?: (shift: PeriodShift) => void
  className?: string
}

export function GraderShiftPeriodContainer({
  plantLineId, month, onMonthChange, onSummariesLoaded, onMonthStatsLoaded, onSelectShift, onOpenShift, className,
}: GraderShiftPeriodContainerProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // El calendario retirado era el UNICO emisor de esta seleccion, y
  // `AnalisisGraderGatesConfigPage` la consume para calibrar el peso medio.
  // Sin esto esa pagina caia siempre a su fallback (el summary mas reciente de
  // 60 dias) sin que nadie lo notara.
  const setSelectedHistorical = useGraderSelectionStore(st => st.setSelectedHistorical)

  const { loading, error, shifts, rows, days, byKey, slxDegraded } = useGraderShiftPeriod({
    year: month.getFullYear(),
    month: month.getMonth(),
    plantLineId,
  })

  // Los summaries que ya trae el hook, re-emitidos para los paneles vecinos.
  const summaries = useMemo(
    () => shifts.filter(s => s.hasGrader).map(s => s.graderSummary!).filter(Boolean),
    [shifts],
  )
  useEffect(() => { onSummariesLoaded?.(summaries) }, [summaries, onSummariesLoaded])

  const monthStats = useMemo(() => computePeriodMonthlyStats(shifts), [shifts])
  useEffect(() => { onMonthStatsLoaded?.(monthStats) }, [monthStats, onMonthStatsLoaded])

  // Exportar el comparativo del período. Las pausas NO vienen en el hook (viven
  // en una subcolección aparte y encarecerían la matriz, que se abre muchas
  // veces al día), así que se cargan recién acá, cuando alguien las pide.
  const [exporting, setExporting] = useState<'png' | 'pdf' | null>(null)
  const handleExport = useCallback(async (format: 'png' | 'pdf') => {
    setExporting(format)
    try {
      const { reliability, breakdownsByShiftKey } = await loadPeriodReliability(shifts)
      const summary = buildPeriodSummary({
        shifts,
        stats: monthStats,
        monthDate: month,
        areaLabel: getAreaDisplayLabel(plantLineId ?? DEFAULT_PLANT_LINE_ID),
        reliability,
        breakdownsByShiftKey,
      })
      const suffix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
      if (format === 'png') exportPeriodSummaryPng({ summary, filenameSuffix: suffix })
      else exportPeriodSummaryPdf({ summary, filenameSuffix: suffix })
    } finally {
      setExporting(null)
    }
  }, [shifts, monthStats, month, plantLineId])

  return (
    <GraderShiftPeriodView
      month={month} onMonthChange={onMonthChange}
      shifts={shifts} rows={rows} days={days} byKey={byKey}
      loading={loading} error={error} slxDegraded={slxDegraded}
      selectedKey={selectedKey}
      onSelect={(s) => {
        const next = selectedKey === s.key ? null : s.key
        setSelectedKey(next)
        setSelectedHistorical(next ? (s.graderSummary ?? null) : null)
        onSelectShift?.(s)
      }}
      onOpenShift={onOpenShift}
      onExport={handleExport}
      exporting={exporting}
      className={className}
    />
  )
}
