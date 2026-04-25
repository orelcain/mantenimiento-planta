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

export interface HoverState {
  /** Timestamp en ms del minuto bajo el cursor */
  ms: number
  /** ID del chart que originó el hover (evita feedback loops) */
  originId: string
}

export interface LotChange {
  /** Timestamp en ms del minuto donde empieza el lote */
  ms: number
  /** Número de lote (string para preservar formato Marelec) */
  lot: string
}

export interface TimelineSyncValue {
  /** Rango actualmente seleccionado (null = full range / sin zoom) */
  range: TimelineRange | null
  /** Actualiza el rango. Pasar null para resetear a full. */
  setRange: (next: TimelineRange | null) => void
  /** Estado de hover compartido (crosshair cross-chart). null = sin hover. */
  hover: HoverState | null
  /** Actualiza el hover. Pasar null para limpiar. */
  setHover: (next: HoverState | null) => void
  /** Cambios de lote detectados en el timeline del Grader. Los charts del
   *  panel los proyectan como markLines verticales para correlación visual
   *  (Fase 4c — lot projection). */
  lotChanges: LotChange[]
  /** Publica los cambios de lote (lo invoca el Grader cuando sus buckets
   *  cambian). Idempotente: skip si el array es estructuralmente igual. */
  setLotChanges: (next: LotChange[]) => void
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
  const [hover, setHoverState] = useState<HoverState | null>(null)
  const [lotChanges, setLotChangesState] = useState<LotChange[]>([])

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

  // setHover idempotente: la combinación (ms, originId) define el hover.
  const setHover = useCallback((next: HoverState | null) => {
    setHoverState((prev) => {
      if (prev === next) return prev
      if (prev == null && next == null) return prev
      if (prev != null && next != null && prev.ms === next.ms && prev.originId === next.originId) {
        return prev
      }
      return next
    })
  }, [])

  // setLotChanges idempotente: compare estructural (longitud + ms+lot por idx)
  // para evitar re-renders cascada cuando el Grader recalcula con la misma data.
  const setLotChanges = useCallback((next: LotChange[]) => {
    setLotChangesState((prev) => {
      if (prev === next) return prev
      if (prev.length !== next.length) return next
      for (let i = 0; i < prev.length; i++) {
        if (prev[i]!.ms !== next[i]!.ms || prev[i]!.lot !== next[i]!.lot) return next
      }
      return prev
    })
  }, [])

  const value = useMemo<TimelineSyncValue>(
    () => ({ range, setRange, hover, setHover, lotChanges, setLotChanges, connectGroupId: groupId }),
    [range, setRange, hover, setHover, lotChanges, setLotChanges, groupId],
  )

  return <TimelineSyncContext.Provider value={value}>{children}</TimelineSyncContext.Provider>
}
