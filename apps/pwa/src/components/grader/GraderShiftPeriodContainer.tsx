/**
 * Une el hook de datos con la vista de período. Es el único punto donde la
 * página real toca la Matriz/Lista: le pasa el mes y la línea, y recibe el
 * turno elegido.
 *
 * Se mantiene aparte de `GraderShiftPeriodView` para que la vista siga siendo
 * un componente puro de presentación — así se puede montar con un fixture (ver
 * `pages/dev/MatrizTurnosDevPage`) sin arrastrar Firestore ni autenticación.
 */
import { useEffect, useMemo, useState } from 'react'
import { useGraderShiftPeriod } from '@/hooks/useGraderShiftPeriod'
import { GraderShiftPeriodView } from '@/components/grader/GraderShiftPeriodView'
import type { PeriodShift } from '@/services/grader/graderShiftPeriod'
import type { PlantLineId } from '@/config/plantLines'
import type { GraderDailySummary } from '@/services/grader/types'
import { computePeriodMonthlyStats } from '@/services/grader/graderPeriodMonthlyStats'

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

  return (
    <GraderShiftPeriodView
      month={month} onMonthChange={onMonthChange}
      shifts={shifts} rows={rows} days={days} byKey={byKey}
      loading={loading} error={error} slxDegraded={slxDegraded}
      selectedKey={selectedKey}
      onSelect={(s) => {
        setSelectedKey(prev => (prev === s.key ? null : s.key))
        onSelectShift?.(s)
      }}
      onOpenShift={onOpenShift}
      className={className}
    />
  )
}
