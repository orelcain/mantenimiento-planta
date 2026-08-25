/**
 * useAreaRepuestos — Repuestos de un área (rediseño área-first, Fase 2).
 *
 * Toma los items ya mergeados catálogo+bodega (useBodega().items) y los filtra
 * por pertenencia al subárbol del área seleccionada. El puente es el nodo de
 * jerarquía: cada equipo del repuesto (`item.equipos[].machineId`) es o bien
 *   - un machineId  → resolvemos su `machine.hierarchyNodeId`, o
 *   - un nodeId de hierarchy (repuestos colgados directo del nodo) → se usa tal cual.
 *
 * Deriva además el estado de stock (ok / low / out / unset) para los dots.
 */
import { useMemo } from 'react'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'

export type { StockStatus } from '@/hooks/repuestos/estadoDeStock'
export { stockStatusOf } from '@/hooks/repuestos/estadoDeStock'
import { stockStatusOf as _estado, type StockStatus } from '@/hooks/repuestos/estadoDeStock'

export interface AreaRepuestoRow extends BodegaMergedItem {
  stockStatus: StockStatus
}


interface Options {
  /** true = mostrar todas las áreas (sin filtrar). */
  showingAll: boolean
  /** área seleccionada (nodeId de hierarchy). */
  selectedAreaId: string | null
  /** ¿el repuesto alojado en `machineId` pertenece al área `areaId`? */
  machineInArea: (machineId: string, areaId: string) => boolean
}

export function useAreaRepuestos(
  items: BodegaMergedItem[],
  { showingAll, selectedAreaId, machineInArea }: Options,
): AreaRepuestoRow[] {
  return useMemo(() => {
    const belongsToArea = (item: BodegaMergedItem): boolean => {
      if (showingAll) return true
      if (!selectedAreaId) return false
      return item.equipos.some((eq) => machineInArea(eq.machineId, selectedAreaId))
    }

    return items
      .filter(belongsToArea)
      .map((it) => ({ ...it, stockStatus: _estado(it) }))
  }, [items, showingAll, selectedAreaId, machineInArea])
}
