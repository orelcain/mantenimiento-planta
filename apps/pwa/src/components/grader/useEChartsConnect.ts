/**
 * Helper: inscribe una instancia de ECharts en un grupo de `echarts.connect()`.
 *
 * Diseño: en lugar de un hook con useEffect (que corre tarde respecto al
 * lifecycle de ECharts), exponemos una función `connectInstance` que se
 * llama desde el callback `onChartReady` de ReactECharts — ese fire EXACTO
 * cuando la instancia está lista, sin polling ni race conditions.
 *
 * Patrón de uso:
 *   const { connectGroupId } = useTimelineSync()
 *   <ReactECharts onChartReady={(inst) => connectChartToGroup(inst, connectGroupId)} ... />
 *
 * Devolvemos también un hook `useEChartsConnect` para compatibilidad legacy,
 * pero internamente usa el mismo helper. El hook reasigna group cuando
 * groupId cambia (sin importar timing, porque inst persiste tras mount).
 */

import { useEffect, useCallback } from 'react'
import * as echarts from 'echarts'

type EChartsForReactRef = React.MutableRefObject<any>

/**
 * Inscribe una instancia ECharts a un grupo. Idempotente: re-asignar el
 * mismo group no duplica nada en el registro global de echarts.
 *
 * IMPORTANTE: `echarts.connect()` propaga dataZoom entre charts del mismo
 * grupo. Si los charts tienen xAxis types diferentes (ej. el Grader es
 * `category` con 462 slots minute-by-minute, mientras los Baader Gantts son
 * `time` continuos en ms), la propagación NO es semánticamente correcta —
 * el % del Grader se aplica literalmente al rango time del Gantt, dando
 * rangos visibles que NO coinciden temporalmente.
 *
 * Por eso el sync del rango se hace MANUALMENTE vía TimelineSyncContext
 * (callback `setRange` con timestamps reales). El group se setea pero NO
 * llamamos `echarts.connect()` para evitar la propagación rota.
 *
 * Lo que SÍ aporta tener el group set (sin connect): permite operaciones
 * manuales como `dispatchAction` cross-chart en el futuro (Fase 4 crosshair).
 */
export function connectChartToGroup(inst: any, groupId: string): void {
  if (!inst) return
  inst.group = groupId
  // NO llamamos echarts.connect(groupId) intencionalmente — ver comment arriba.
  // El sync del rango se hace vía context callback en setRange + xAxis.min/max
  // explícito en cada chart al re-render.
  void echarts // referencia para evitar tree-shaking del import (futuro F4)
}

/**
 * Hook que inscribe la instancia (via ref) al grupo cuando el ref está
 * disponible. Patrón legacy — preferir `onChartReady` callback en charts
 * nuevos.
 */
export function useEChartsConnect(ref: EChartsForReactRef, groupId: string) {
  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let assignedInst: any = null

    const tryAssign = (attempt: number) => {
      if (cancelled) return
      const inst = ref.current?.getEchartsInstance?.()
      if (inst) {
        connectChartToGroup(inst, groupId)
        assignedInst = inst
        return
      }
      if (attempt < 20) {
        timeoutId = setTimeout(() => tryAssign(attempt + 1), 50)
      }
    }

    tryAssign(0)

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (assignedInst && assignedInst.group === groupId) {
        assignedInst.group = null
      }
    }
  }, [ref, groupId])
}

/**
 * Devuelve un callback estable para usar como `onChartReady`. Más confiable
 * que `useEChartsConnect` porque corre EXACTAMENTE cuando ECharts inicializa.
 */
export function useChartReadyConnect(groupId: string) {
  return useCallback((inst: any) => {
    connectChartToGroup(inst, groupId)
  }, [groupId])
}
