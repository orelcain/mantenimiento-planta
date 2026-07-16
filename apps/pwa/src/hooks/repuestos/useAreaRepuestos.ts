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

export type StockStatus = 'ok' | 'low' | 'out' | 'unset'

export interface AreaRepuestoRow extends BodegaMergedItem {
  stockStatus: StockStatus
}

export function stockStatusOf(item: BodegaMergedItem): StockStatus {
  if (!item.bodegaId) return 'unset' // sin configuración de bodega
  // Cero es "sin stock" SIEMPRE, tenga o no mínimo definido: antes exigir
  // stockMinimo > 0 hacía que ~1.768 ítems con 0 unidades se mostraran como
  // "Disponible" (solo 19 de 2.177 tienen mínimo) y el filtro no servía.
  if (item.stockActual === 0) return 'out'
  if (item.stockMinimo > 0 && item.stockActual <= item.stockMinimo) return 'low'
  return 'ok'
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
      .map((it) => ({ ...it, stockStatus: stockStatusOf(it) }))
  }, [items, showingAll, selectedAreaId, machineInArea])
}
