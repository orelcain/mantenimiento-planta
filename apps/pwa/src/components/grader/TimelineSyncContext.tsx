/**
 * TimelineSyncContext — coordina zoom y axisPointer cross-chart entre el
 * timeline del Grader y los charts del panel upstream (Baader Gantts +
 * IntervalsBars de producción).
 *
 * Diseño:
 *   - Un único `range: { startMs, endMs } | null` en el provider; null = full
 *   - Cualquier chart puede leer (`useTimelineSync().range`) o actualizar
 *     (`setRange(...)`) desde su handler de zoom interno
 *   - Los charts ECharts se inscriben en un mismo `connectGroupId` para que
 *     ECharts sincronice nativamente axisPointer (crosshair cross-chart) y
 *     dataZoom propagation entre ellos via `echarts.connect()`
 *
 * Patrón de uso:
 *   1. <TimelineSyncProvider> envuelve la página de turno
 *   2. Cada chart ECharts llama `useEChartsConnect(ref, groupId)` para inscribirse
 *   3. Cada chart escribe al state global cuando el usuario hace zoom local
 *   4. Componentes HTML (Baader cards) leen el `range` para ajustar windowStart/End
 *
 * Migración progresiva: hoy todo es opt-in. Componentes que no consumen el
 * context siguen funcionando con su comportamiento previo.
 *
 * Los hooks de consumo (`useTimelineSync`, `useTimelineSyncOptional`) viven
 * en `./useTimelineSync.ts` para mantener fast-refresh compatible.
 */

import { createContext, useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export interface TimelineRange {
  startMs: number
  endMs: number
}

export interface TimelineSyncValue {
  /** Rango actualmente seleccionado (null = full range / sin zoom) */
  range: TimelineRange | null
  /** Actualiza el rango. Pasar null para resetear a full. */
  setRange: (next: TimelineRange | null) => void
  /** ID de grupo para `echarts.connect()` — todos los charts del grupo
   *  sincronizan zoom y axisPointer nativamente. */
  connectGroupId: string
}

// eslint-disable-next-line react-refresh/only-export-components
export const TimelineSyncContext = createContext<TimelineSyncValue | null>(null)

interface ProviderProps {
  children: ReactNode
  /** ID único del grupo (un valor por vista de turno permite múltiples
   *  instancias en la misma página sin colisión). Default: 'timeline-sync'. */
  groupId?: string
}

export function TimelineSyncProvider({ children, groupId = 'timeline-sync' }: ProviderProps) {
  const [range, setRangeState] = useState<TimelineRange | null>(null)

  // setRange es estable (useCallback) para evitar re-renders cascada en
  // consumidores que sólo dependen del setter.
  const setRange = useCallback((next: TimelineRange | null) => {
    setRangeState((prev) => {
      // Idempotencia: si el nuevo rango es igual al actual, no re-renderiza
      if (prev === next) return prev
      if (prev == null && next == null) return prev
      if (prev != null && next != null && prev.startMs === next.startMs && prev.endMs === next.endMs) {
        return prev
      }
      return next
    })
  }, [])

  const value = useMemo<TimelineSyncValue>(
    () => ({ range, setRange, connectGroupId: groupId }),
    [range, setRange, groupId],
  )

  return <TimelineSyncContext.Provider value={value}>{children}</TimelineSyncContext.Provider>
}
