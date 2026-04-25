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
 * `echarts.connect()` propaga eventos entre charts del mismo grupo:
 *   - axisPointer (crosshair vertical cross-chart al hover)
 *   - showTip / hideTip (tooltip sincronizado)
 *
 * Notas sobre dataZoom: ECharts intenta propagar dataZoom también, pero los
 * charts del panel (Gantts, ProductionBars) NO tienen dataZoom configurado
 * — son charts read-only desde el zoom point of view. Cuando connect
 * intenta propagar dataZoom hacia ellos, el cambio no se aplica (no hay
 * dataZoom donde aterrizar). El sync de zoom se hace 100% vía
 * TimelineSyncContext callback (timestamps reales en ms).
 *
 * Resultado: tenemos lo mejor de ambos mundos:
 *   - Zoom sync exacto vía context (timestamps en ms, no porcentajes
 *     mal-traducidos entre xAxis types diferentes)
 *   - axisPointer + tooltips cross-chart automáticos vía echarts.connect
 */
export function connectChartToGroup(inst: any, groupId: string): void {
  if (!inst) return
  inst.group = groupId
  echarts.connect(groupId)
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
