/**
 * Hook: inscribe una instancia de ECharts en un grupo de `echarts.connect()`.
 *
 * Todos los charts inscritos en el mismo grupo comparten:
 *   - dataZoom (zoom en uno propaga a todos)
 *   - axisPointer (crosshair cross-chart en el mismo X)
 *   - tooltips sincronizados (showTip/hideTip)
 *
 * Importante: la conexión se establece cada vez que cambia la instancia o el
 * grupo. ECharts mantiene un registro global de grupos, así que llamar
 * `connect()` con el mismo ID es idempotente — no duplica.
 *
 * Patrón de uso:
 *   const ref = useRef<any>(null)
 *   const { connectGroupId } = useTimelineSync()
 *   useEChartsConnect(ref, connectGroupId)
 *   ...
 *   <ReactECharts ref={ref} ... />
 */

import { useEffect } from 'react'
import * as echarts from 'echarts'

type EChartsForReactRef = React.MutableRefObject<any>

export function useEChartsConnect(ref: EChartsForReactRef, groupId: string) {
  useEffect(() => {
    const inst = ref.current?.getEchartsInstance?.()
    if (!inst) return
    inst.group = groupId
    echarts.connect(groupId)
    // Cleanup: al desmontar, desinscribir del grupo. ECharts limpia
    // automáticamente cuando la instancia se destruye, pero ser explícitos
    // evita ruido si el grupo se re-asigna en el mismo componente.
    return () => {
      if (inst && inst.group === groupId) {
        // setear null deshabilita la sincronización para esta instancia
        inst.group = null
      }
    }
  }, [ref, groupId])
}
