import { useCallback, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { IsometricViewerState, MapArea, MapConnector, MapNode } from '@/types/isometricMap'
import type { AreaPaintState } from './AreaTileEditor'

interface UseAreaEditorFlowParams {
  areas: MapArea[]
  nodes: MapNode[]
  currentFloor: number
  currentFilters: IsometricViewerState['filters']
  showAreaEditor: boolean
  setViewerState: Dispatch<SetStateAction<IsometricViewerState>>
  setSelectedAreaId: Dispatch<SetStateAction<string | null>>
  setEditorTool: Dispatch<SetStateAction<'select' | 'move' | 'add'>>
  commitEditorChange: (newNodes: MapNode[], newAreas?: MapArea[], newConnectors?: MapConnector[]) => void
  openAreaOverlay: () => void
  closeAreaOverlay: () => void
}

const EMPTY_AREA_PAINT_STATE: AreaPaintState = {
  tiles: new Set<string>(),
  tool: 'paint',
  name: '',
  color: '#3b82f6',
  opacity: 0.3,
  linkedZoneId: '',
  editAreaId: null,
}

export function useAreaEditorFlow({
  areas,
  nodes,
  currentFloor,
  currentFilters,
  showAreaEditor,
  setViewerState,
  setSelectedAreaId,
  setEditorTool,
  commitEditorChange,
  openAreaOverlay,
  closeAreaOverlay,
}: UseAreaEditorFlowParams) {
  const [editingArea, setEditingArea] = useState<MapArea | null>(null)
  const [areaPaintState, setAreaPaintState] = useState<AreaPaintState>(EMPTY_AREA_PAINT_STATE)
  const prevFiltersRef = useRef<IsometricViewerState['filters'] | null>(null)

  const currentFloorAreas = useMemo(
    () => areas.filter((area) => (area.floor ?? 0) === currentFloor),
    [areas, currentFloor]
  )

  const handleAreaPaintStateChange = useCallback((update: Partial<AreaPaintState>) => {
    setAreaPaintState((prev) => {
      if ('tiles' in update && update.tiles) {
        return { ...prev, ...update, tiles: update.tiles }
      }
      return { ...prev, ...update }
    })
  }, [])

  const openAreaEditor = useCallback((area?: MapArea | null) => {
    openAreaOverlay()
    setSelectedAreaId(area?.id ?? null)
    prevFiltersRef.current = { ...currentFilters }

    setViewerState((prev) => ({
      ...prev,
      filters: {
        ...prev.filters,
        showEquipment: false,
        showLabels: false,
        showAreas: true,
      },
    }))

    setEditingArea(area ?? null)

    if (area?.tiles) {
      const tileSet = new Set<string>(area.tiles.map((tile) => `${tile.x},${tile.z}`))
      setAreaPaintState({
        tiles: tileSet,
        tool: 'paint',
        name: area.label,
        color: area.color ?? '#3b82f6',
        opacity: area.opacity ?? 0.3,
        linkedZoneId: area.linkedZoneId ?? '',
        editAreaId: area.id,
      })
    } else {
      setAreaPaintState({
        tiles: new Set<string>(),
        tool: 'paint',
        name: '',
        color: '#3b82f6',
        opacity: 0.3,
        linkedZoneId: '',
        editAreaId: null,
      })
    }

    setEditorTool('select')
  }, [openAreaOverlay, setSelectedAreaId, currentFilters, setViewerState, setEditorTool])

  const closeAreaEditor = useCallback(() => {
    if (prevFiltersRef.current) {
      setViewerState((prev) => ({
        ...prev,
        filters: { ...prevFiltersRef.current! },
      }))
      prevFiltersRef.current = null
    }

    closeAreaOverlay()
    setEditingArea(null)
    setAreaPaintState({
      tiles: new Set<string>(),
      tool: 'paint',
      name: '',
      color: '#3b82f6',
      opacity: 0.3,
      linkedZoneId: '',
      editAreaId: null,
    })
  }, [setViewerState, closeAreaOverlay])

  const paintAreaTileAt = useCallback((position: { x: number; z: number }) => {
    if (!showAreaEditor) return false

    const key = `${position.x},${position.z}`
    setAreaPaintState((prev) => {
      const newTiles = new Set(prev.tiles)
      if (prev.tool === 'paint') {
        newTiles.add(key)
      } else {
        newTiles.delete(key)
      }
      return { ...prev, tiles: newTiles }
    })

    return true
  }, [showAreaEditor])

  const handleSaveArea = useCallback((area: MapArea) => {
    const exists = areas.find((item) => item.id === area.id)

    if (exists) {
      const newAreas = areas.map((item) => (item.id === area.id ? area : item))
      commitEditorChange(nodes, newAreas)
      setSelectedAreaId(area.id)
      closeAreaEditor()
      return
    }

    const newAreas = [...areas, area]
    commitEditorChange(nodes, newAreas)
    setSelectedAreaId(area.id)
    openAreaEditor(area)
  }, [areas, nodes, commitEditorChange, setSelectedAreaId, closeAreaEditor, openAreaEditor])

  const handleDeleteArea = useCallback((areaId: string) => {
    const newAreas = areas.filter((area) => area.id !== areaId)
    commitEditorChange(nodes, newAreas)
    setSelectedAreaId(null)
    closeAreaEditor()
  }, [areas, nodes, commitEditorChange, setSelectedAreaId, closeAreaEditor])

  return {
    editingArea,
    areaPaintState,
    currentFloorAreas,
    handleAreaPaintStateChange,
    openAreaEditor,
    closeAreaEditor,
    paintAreaTileAt,
    handleSaveArea,
    handleDeleteArea,
  }
}
