/**
 * MapPage — Visor de Mapas Isométrico 3D + Modo Editor
 * 
 * Mapa isométrico interactivo de la planta con:
 * - Vista 3D con cámara ortográfica y rotación FFT (Q/E o botones)
 * - Equipos representados como nodos 3D con estado en tiempo real
 * - Panel lateral de incidencias activas (reutilizado del visor anterior)
 * - Leyenda de estados con colores
 * - Controles de zoom, rotación y filtros
 * - MODO EDITOR: drag & drop, agregar/eliminar equipos, propiedades, undo/redo, save
 * 
 * v2.67.0 — Mapa Isométrico + Editor
 */

import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import {
  MapPin,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize,
  AlertTriangle,
  X,
  ChevronRight,
  Eye,
  EyeOff,
  Compass,
  Activity,
  CircleCheck,
  Layers,
  Pencil,
  Eye as EyeIcon,
  Building2,
  Shapes,
  Grid3x3,
  Trash2,
  Settings2,
} from 'lucide-react'
import {
  Card,
  CardContent,
  Button,
  Badge,
} from '@/components/ui'
import { IncidentDetail } from '@/components/incidents/IncidentDetail'
import { useAppStore, useCanValidateIncidents, useIsAdmin } from '@/store'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import { generateDemoMap, saveIsometricMap } from '@/services/isometricMap'
import type { CameraAngle, IsometricViewerState, MapNode, MapArea, MapConnector as MapConnectorType } from '@/types/isometricMap'
import { 
  DEFAULT_VIEWER_STATE,
  FULL_MAP_VIEW_ZOOM,
  MAX_VIEWER_ZOOM,
  CAMERA_ANGLE_AZIMUTH,
  CAMERA_ANGLE_NAMES,
  STATUS_LABELS,
  STATUS_COLORS,
  EQUIPMENT_TYPE_LABELS,
} from '@/types/isometricMap'
import type { Incident, IncidentPriority, IncidentStatus } from '@/types'
import { useAuthStore } from '@/store'

// Lazy load del componente 3D pesado
const IsometricScene = lazy(() =>
  import('@/components/map/isometric/IsometricScene').then((m) => ({ default: m.IsometricScene }))
)

// Editor components (no lazy — son ligeros)
import { EditorToolbar } from '@/components/map/isometric/editor/EditorToolbar'
import type { EditorTool } from '@/components/map/isometric/editor/EditorToolbar'
import { NodePropertiesPanel } from '@/components/map/isometric/editor/NodePropertiesPanel'
import { AddEquipmentDialog } from '@/components/map/isometric/editor/AddEquipmentDialog'
import { LinkEntityDialog } from '@/components/map/isometric/editor/LinkEntityDialog'
import { useEditorHistory } from '@/components/map/isometric/editor/useEditorHistory'
import { useMapRuntimeData } from '@/components/map/isometric/editor/useMapRuntimeData'
import { MapSearchPanel } from '@/components/map/isometric/editor/MapSearchPanel'
import { ShapeEditorDialog } from '@/components/map/isometric/editor/ShapeEditorDialog'
import { AreaTileEditor } from '@/components/map/isometric/editor/AreaTileEditor'
import { useEditorOverlayState } from '@/components/map/isometric/editor/useEditorOverlayState'
import { getAreaAtPosition, normalizeNodeForArea } from '@/components/map/isometric/editor/areaAssociation'
import { useMapEditorActions } from '@/components/map/isometric/editor/useMapEditorActions'
import { useAreaEditorFlow } from '@/components/map/isometric/editor/useAreaEditorFlow'

const PRIORITY_CONFIG: Record<IncidentPriority, { color: string; bg: string; label: string }> = {
  critica: { color: 'text-red-500', bg: 'bg-red-500', label: 'Crítica' },
  alta: { color: 'text-orange-500', bg: 'bg-orange-500', label: 'Alta' },
  media: { color: 'text-blue-500', bg: 'bg-blue-500', label: 'Media' },
  baja: { color: 'text-gray-500', bg: 'bg-gray-500', label: 'Baja' },
}

const STATUS_CONFIG: Record<IncidentStatus, { label: string; variant: string }> = {
  pendiente: { label: 'Pendiente', variant: 'warning' },
  confirmada: { label: 'Confirmada', variant: 'default' },
  rechazada: { label: 'Rechazada', variant: 'destructive' },
  en_proceso: { label: 'En proceso', variant: 'secondary' },
  resuelta: { label: 'Resuelta', variant: 'success' },
  cerrada: { label: 'Cerrada', variant: 'outline' },
}

const FLOOR_OPTIONS = [
  { floor: 0, full: 'Planta Baja' },
  { floor: 1, full: 'Segundo Piso' },
  { floor: 2, full: 'Techo' },
] as const

const FLOOR_LABELS: Record<number, string> = {
  0: 'Planta Baja',
  1: 'Segundo Piso',
  2: 'Techo',
}

/** Tamaños por defecto para cada tipo de equipo */
function getDefaultSize(type: MapNode['type']): MapNode['size'] {
  const sizes: Record<string, MapNode['size']> = {
    pump:       { width: 2,   height: 1.5, depth: 1.5 },
    motor:      { width: 2,   height: 2,   depth: 1.5 },
    conveyor:   { width: 5,   height: 1.2, depth: 1.5 },
    tank:       { width: 3,   height: 4,   depth: 3 },
    compressor: { width: 2.5, height: 2.5, depth: 2 },
    valve:      { width: 1,   height: 1.2, depth: 1 },
    sensor:     { width: 0.5, height: 1.5, depth: 0.5 },
    pipe:       { width: 4,   height: 0.5, depth: 0.5 },
    evaporator: { width: 3,   height: 2.5, depth: 2 },
    condenser:  { width: 3.5, height: 2,   depth: 2 },
    panel:      { width: 1.5, height: 2,   depth: 0.5 },
    extractor:  { width: 1.5, height: 2,   depth: 1.5 },
    transformer:{ width: 2.5, height: 3,   depth: 2 },
    boiler:     { width: 3,   height: 3.5, depth: 3 },
    building:   { width: 6,   height: 4,   depth: 5 },
    generic:    { width: 2,   height: 2,   depth: 2 },
  }
  return sizes[type] ?? { width: 2, height: 2, depth: 2 }
}

export function MapPage() {
  const canValidate = useCanValidateIncidents()
  const isAdmin = useIsAdmin()
  const user = useAuthStore((s) => s.user)
  const { incidents } = useAppStore()
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [showIncidentPanel, setShowIncidentPanel] = useState(true)
  const [showFilters, setShowFilters] = useState(false)

  // Estado del visor isométrico
  const [viewerState, setViewerState] = useState<IsometricViewerState>(DEFAULT_VIEWER_STATE)

  // ── Datos del mapa (mutables para editor) ──
  const demoData = useMemo(() => generateDemoMap(), [])
  const [nodes, setNodes] = useState<MapNode[]>(() => demoData.nodes)
  const [areas, setAreas] = useState<MapArea[]>(() => demoData.areas)
  const [connectors, setConnectors] = useState<MapConnectorType[]>(() => demoData.connectors)
  // Runtime data vinculado a datos reales (Equipment, Incidents)
  const runtimeData = useMapRuntimeData(nodes)

  // ── Estado del editor ──
  const [editorTool, setEditorTool] = useState<EditorTool>('select')
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [addEquipmentType, setAddEquipmentType] = useState<MapNode['type']>('pump')
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const overlayState = useEditorOverlayState()
  const showAddDialog = overlayState.isOverlayOpen('add-equipment')
  const showShapeEditor = overlayState.isOverlayOpen('shape-editor')
  const showAreaEditor = overlayState.isOverlayOpen('area-editor')
  const showAreaManager = overlayState.isOverlayOpen('area-manager')
  const [areaManagerFloor, setAreaManagerFloor] = useState<'all' | 0 | 1 | 2>('all')
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [hoveredAreaId, setHoveredAreaId] = useState<string | null>(null)
  const [showOnlyActiveAreaEquipment, setShowOnlyActiveAreaEquipment] = useState(false)
  const [workflowPreset, setWorkflowPreset] = useState<'areas' | 'equipos' | 'ajuste'>('equipos')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const history = useEditorHistory()

  // Snapshot inicial para undo
  useEffect(() => {
    history.pushSnapshot({ nodes, areas, connectors })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isEditMode = viewerState.mode === 'edit'

  const resolveAreaAtPosition = useCallback((x: number, z: number, floor: number) => {
    return getAreaAtPosition(areas, x, z, floor)
  }, [areas])

  // Incidencias activas
  const activeIncidents = useMemo(
    () => incidents.filter((i) =>
      i.status === 'pendiente' || i.status === 'confirmada' || i.status === 'en_proceso'
    ),
    [incidents]
  )

  const visibleNodeIds = useMemo(() => {
    if (!showOnlyActiveAreaEquipment || !selectedAreaId) return undefined
    return new Set(
      nodes
        .filter((node) => node.linkedAreaId === selectedAreaId)
        .map((node) => node.id)
    )
  }, [showOnlyActiveAreaEquipment, selectedAreaId, nodes])

  const selectedAreaEquipmentSummary = useMemo(() => {
    if (!selectedAreaId) return null
    const selectedArea = areas.find((area) => area.id === selectedAreaId)
    if (!selectedArea) return null
    const floor = selectedArea.floor ?? viewerState.currentFloor
    const floorNodes = nodes.filter((node) => (node.floor ?? 0) === floor)
    const linked = floorNodes.filter((node) => node.linkedAreaId === selectedAreaId).length
    const unlinked = floorNodes.filter((node) => !node.linkedAreaId).length
    return { linked, unlinked, floor }
  }, [selectedAreaId, areas, nodes, viewerState.currentFloor])

  const managedAreas = useMemo(() => {
    const base = areaManagerFloor === 'all'
      ? areas
      : areas.filter((area) => (area.floor ?? 0) === areaManagerFloor)
    return [...base].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }, [areas, areaManagerFloor])

  const areaById = useMemo(() => {
    return new Map(areas.map((area) => [area.id, area]))
  }, [areas])

  // Resumen de estados para la leyenda
  const statusSummary = useMemo(() => {
    const summary = { ok: 0, warning: 0, critical: 0, offline: 0, maintenance: 0 }
    for (const [, data] of runtimeData) {
      summary[data.status]++
    }
    return summary
  }, [runtimeData])

  // ── Handlers de cámara ──
  const rotateLeft = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      cameraAngle: ((prev.cameraAngle + 3) % 4) as CameraAngle,
    }))
  }, [])

  const rotateRight = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      cameraAngle: ((prev.cameraAngle + 1) % 4) as CameraAngle,
    }))
  }, [])

  const zoomIn = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      zoom: Math.min(prev.zoom + Math.max(2, Math.round(prev.zoom * 0.08)), MAX_VIEWER_ZOOM),
    }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom - Math.max(2, Math.round(prev.zoom * 0.08)), 3),
    }))
  }, [])

  const getCurrentFloorCenter = useCallback(() => {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY

    // Priorizar nodos para calcular centro: reflejan mejor el contenido real visible
    // y evitan que áreas fuera de escala arrastren el encuadre.
    const floorNodes = nodes.filter((n) => (n.floor ?? 0) === viewerState.currentFloor)
    for (const node of floorNodes) {
      const halfWidth = (node.size.width ?? 2) / 2
      const halfDepth = (node.size.depth ?? 2) / 2
      minX = Math.min(minX, node.position.x - halfWidth)
      maxX = Math.max(maxX, node.position.x + halfWidth)
      minZ = Math.min(minZ, node.position.z - halfDepth)
      maxZ = Math.max(maxZ, node.position.z + halfDepth)
    }

    if (floorNodes.length > 0 && Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minZ) && Number.isFinite(maxZ)) {
      return {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
      }
    }

    minX = Number.POSITIVE_INFINITY
    maxX = Number.NEGATIVE_INFINITY
    minZ = Number.POSITIVE_INFINITY
    maxZ = Number.NEGATIVE_INFINITY

    const floorAreas = areas.filter((a) => (a.floor ?? 0) === viewerState.currentFloor)
    for (const area of floorAreas) {
      minX = Math.min(minX, area.position.x - area.size.width / 2)
      maxX = Math.max(maxX, area.position.x + area.size.width / 2)
      minZ = Math.min(minZ, area.position.z - area.size.depth / 2)
      maxZ = Math.max(maxZ, area.position.z + area.size.depth / 2)
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      return { x: 0, z: 0 }
    }

    return {
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
    }
  }, [nodes, areas, viewerState.currentFloor])

  const fitMapComplete = useCallback(() => {
    const center = getCurrentFloorCenter()
    setViewerState((prev) => ({
      ...prev,
      zoom: FULL_MAP_VIEW_ZOOM,
      panOffset: center,
    }))
  }, [getCurrentFloorCenter])

  const resetView = fitMapComplete

  const didApplyInitialFullView = useRef(false)
  useEffect(() => {
    if (didApplyInitialFullView.current) return
    didApplyInitialFullView.current = true
    fitMapComplete()
  }, [fitMapComplete])

  // Cambiar de piso
  const setFloor = useCallback((floor: number) => {
    setViewerState((prev) => ({
      ...prev,
      currentFloor: floor,
    }))
    setSelectedAreaId(null)
  }, [])

  // Focus en un nodo (centrar cámara + seleccionar)
  const handleFocusNode = useCallback((_nodeId: string, position: { x: number; z: number }) => {
    setViewerState((prev) => ({
      ...prev,
      panOffset: { x: position.x, z: position.z },
      zoom: Math.max(prev.zoom, 30), // Acercar si está muy lejos
    }))
  }, [])

  // ── Wheel zoom (scroll) ──
  const canvasContainerRef = useRef<HTMLDivElement>(null)

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY
    setViewerState((prev) => {
      // Paso proporcional al zoom actual → aceleración natural
      const step = Math.max(1, Math.round(prev.zoom * 0.06))
      const newZoom = delta > 0
        ? Math.min(prev.zoom + step, MAX_VIEWER_ZOOM)
        : Math.max(prev.zoom - step, 3)
      return { ...prev, zoom: newZoom }
    })
  }, [])

  useEffect(() => {
    const el = canvasContainerRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Pan (left-click drag) ──
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })

  const handlePointerDownPan = useCallback((e: React.PointerEvent) => {
    const targetEl = e.target as HTMLElement | null
    const isUiControl = !!targetEl?.closest('button,input,textarea,select,a,[role="button"],[data-no-pan="true"]')
    if (isUiControl) return

    // Left button (0)
    if (e.button !== 0) return

    e.preventDefault()
    isPanning.current = true
    panStart.current = { x: e.clientX, y: e.clientY }
    targetEl?.setPointerCapture(e.pointerId)
  }, [])

  const handlePointerMovePan = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    panStart.current = { x: e.clientX, y: e.clientY }

    // Paneo orientado a cámara (estilo moderno):
    // el arrastre sigue la dirección de la vista actual (incluye rotación Q/E)
    setViewerState((prev) => {
      const sensitivity = Math.min(0.55, Math.max(0.04, prev.zoom / 600))

      const azimuth = CAMERA_ANGLE_AZIMUTH[prev.cameraAngle]
      const rightX = Math.cos(azimuth)
      const rightZ = -Math.sin(azimuth)
      const forwardX = -Math.sin(azimuth)
      const forwardZ = -Math.cos(azimuth)

      const panDeltaX = (-dx * rightX - dy * forwardX) * sensitivity
      const panDeltaZ = (-dx * rightZ - dy * forwardZ) * sensitivity

      return {
        ...prev,
        panOffset: {
          x: prev.panOffset.x + panDeltaX,
          z: prev.panOffset.z + panDeltaZ,
        },
      }
    })
  }, [])

  const handlePointerUpPan = useCallback((e: React.PointerEvent) => {
    if (isPanning.current) {
      isPanning.current = false
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }, [])

  // ── Handlers de nodos ──
  const handleNodeClick = useCallback((nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId)
    const nextSelected = viewerState.selectedNodeId === nodeId ? null : nodeId

    setViewerState((prev) => ({
      ...prev,
      selectedNodeId: nextSelected,
    }))

    if (!nextSelected) return
    if (node?.linkedAreaId) {
      setSelectedAreaId(node.linkedAreaId)
    }
  }, [nodes, viewerState.selectedNodeId])

  const handleNodeHover = useCallback((nodeId: string | null) => {
    const node = nodeId ? nodes.find((n) => n.id === nodeId) : null
    setViewerState((prev) => ({
      ...prev,
      hoveredNodeId: nodeId,
    }))
    setHoveredAreaId(node?.linkedAreaId ?? null)
  }, [nodes])

  const handleBackgroundClick = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      selectedNodeId: null,
    }))
    setSelectedAreaId(null)
    setHoveredAreaId(null)
  }, [])

  // ── Handlers de filtros ──
  const toggleFilter = useCallback((key: keyof IsometricViewerState['filters']) => {
    setViewerState((prev) => ({
      ...prev,
      filters: {
        ...prev.filters,
        [key]: !prev.filters[key],
      },
    }))
  }, [])

  // ── Handlers del editor ──
  const commitEditorChange = useCallback(
    (newNodes: MapNode[], newAreas?: MapArea[], newConnectors?: MapConnectorType[]) => {
      setNodes(newNodes)
      if (newAreas) setAreas(newAreas)
      if (newConnectors) setConnectors(newConnectors)
      setHasUnsavedChanges(true)
      history.pushSnapshot({
        nodes: newNodes,
        areas: newAreas || areas,
        connectors: newConnectors || connectors,
      })
    },
    [history, areas, connectors]
  )

  const {
    editingArea,
    areaPaintState,
    currentFloorAreas,
    handleAreaPaintStateChange,
    openAreaEditor,
    closeAreaEditor,
    paintAreaTileAt,
    handleSaveArea,
    handleDeleteArea,
  } = useAreaEditorFlow({
    areas,
    nodes,
    currentFloor: viewerState.currentFloor,
    currentFilters: viewerState.filters,
    showAreaEditor,
    setViewerState,
    setSelectedAreaId,
    setEditorTool,
    commitEditorChange,
    openAreaOverlay: () => overlayState.openOverlay('area-editor'),
    closeAreaOverlay: () => overlayState.closeOverlayIf('area-editor'),
  })

  const handleToggleEditMode = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      mode: prev.mode === 'edit' ? 'view' : 'edit',
      selectedNodeId: null,
    }))
    setEditorTool('select')
  }, [])

  const handleNodeDragEnd = useCallback(
    (nodeId: string, newPosition: { x: number; y: number; z: number }) => {
      const targetArea = resolveAreaAtPosition(newPosition.x, newPosition.z, viewerState.currentFloor)
      const newNodes = nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              position: newPosition,
              linkedAreaId: targetArea?.id,
            }
          : n
      )
      commitEditorChange(newNodes)
    },
    [nodes, commitEditorChange, resolveAreaAtPosition, viewerState.currentFloor]
  )

  const handleNodeUpdate = useCallback(
    (nodeId: string, updates: Partial<MapNode>) => {
      const newNodes = nodes.map((n) =>
        n.id === nodeId ? { ...n, ...updates } : n
      )
      commitEditorChange(newNodes)
    },
    [nodes, commitEditorChange]
  )

  const handleAddNode = useCallback(
    (newNode: MapNode) => {
      commitEditorChange([...nodes, newNode])
      overlayState.closeOverlayIf('add-equipment')
      // Seleccionar el nodo recién agregado
      setViewerState((prev) => ({ ...prev, selectedNodeId: newNode.id }))
    },
    [nodes, commitEditorChange, overlayState]
  )

  const handleAddNodeFromDialog = useCallback((newNode: MapNode) => {
    const selectedArea = selectedAreaId ? areas.find((area) => area.id === selectedAreaId) : null
    const areaForNode = selectedArea ?? resolveAreaAtPosition(newNode.position.x, newNode.position.z, viewerState.currentFloor)
    const normalizedNode = normalizeNodeForArea(newNode, areaForNode, viewerState.currentFloor)

    handleAddNode(normalizedNode)
  }, [selectedAreaId, areas, resolveAreaAtPosition, viewerState.currentFloor, handleAddNode])

  const handleAreaClick = useCallback((areaId: string) => {
    const area = areas.find((a) => a.id === areaId)
    if (!area) return

    setSelectedAreaId(areaId)

    if (isEditMode) {
      openAreaEditor(area)
      return
    }

    setViewerState((prev) => ({
      ...prev,
      currentFloor: area.floor ?? 0,
      filters: { ...prev.filters, showAreas: true },
      panOffset: { x: area.position.x, z: area.position.z },
      zoom: Math.max(prev.zoom, 30),
    }))
  }, [areas, isEditMode, openAreaEditor])

  const handleFloorClick = useCallback(
    (position: { x: number; z: number }) => {
      const areaAtPoint = resolveAreaAtPosition(position.x, position.z, viewerState.currentFloor)
      if (areaAtPoint) {
        setSelectedAreaId(areaAtPoint.id)
      }

      // ── Area paint mode: toggle tiles ──
      if (paintAreaTileAt(position)) {
        return
      }

      if (editorTool !== 'add') {
        // En modo select/move, deseleccionar
        setViewerState((prev) => ({ ...prev, selectedNodeId: null }))
        return
      }
      // Crear nuevo nodo en la posición donde se hizo click
      const newNode: MapNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        label: `${EQUIPMENT_TYPE_LABELS[addEquipmentType]} nuevo`,
        type: addEquipmentType,
        position: { x: position.x, y: 0, z: position.z },
        size: getDefaultSize(addEquipmentType),
        rotation: 0,
        floor: viewerState.currentFloor,
        linkedAreaId: areaAtPoint?.id,
        visible: true,
      }
      handleAddNode(newNode)
    },
    [paintAreaTileAt, editorTool, addEquipmentType, handleAddNode, resolveAreaAtPosition, viewerState.currentFloor]
  )

  const {
    handleDeleteSelected,
    handleDuplicateSelected,
    handleRotateSelected,
    handleUndo,
    handleRedo,
  } = useMapEditorActions({
    isEditMode,
    selectedNodeId: viewerState.selectedNodeId,
    nodes,
    connectors,
    commitEditorChange,
    setViewerState,
    setNodes,
    setAreas,
    setConnectors,
    setHasUnsavedChanges,
    setEditorTool,
    setSnapEnabled,
    history,
    zoomIn,
    zoomOut,
    resetView,
  })

  const handleSave = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      await saveIsometricMap(
        {
          id: 'planta-principal',
          nombre: 'Planta Principal ETT',
          version: 1,
          config: demoData.config,
          nodes,
          connectors,
          areas,
          createdBy: user?.id || 'system',
        },
        user?.id || 'system'
      )
      setHasUnsavedChanges(false)
    } catch (error) {
      console.error('Error saving map:', error)
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, nodes, connectors, areas, demoData.config, user])

  const handleCancelEdit = useCallback(() => {
    // Revertir a datos iniciales del demo si hay cambios sin guardar
    if (hasUnsavedChanges) {
      const initial = generateDemoMap()
      setNodes(initial.nodes)
      setAreas(initial.areas)
      setConnectors(initial.connectors)
      setHasUnsavedChanges(false)
    }
    setViewerState((prev) => ({ ...prev, mode: 'view', selectedNodeId: null }))
    setSelectedAreaId(null)
    overlayState.closeOverlay()
    closeAreaEditor()
    history.clear()
  }, [hasUnsavedChanges, history, overlayState, closeAreaEditor])

  // Nodo seleccionado data
  const selectedNode = viewerState.selectedNodeId
    ? nodes.find((n) => n.id === viewerState.selectedNodeId)
    : null
  const selectedNodeRuntime = viewerState.selectedNodeId
    ? runtimeData.get(viewerState.selectedNodeId)
    : null

  // Resolver nombre de entidad vinculada para el panel de propiedades
  const linkedEntityName = useMemo(() => {
    if (!selectedNode?.linkedEntityId) return undefined
    if (selectedNode.linkedEntityType === 'equipment') {
      const eq = useAppStore.getState().equipment.find((e) => e.id === selectedNode.linkedEntityId)
      return eq ? `${eq.nombre} (${eq.codigo})` : undefined
    }
    if (selectedNode.linkedEntityType === 'zone') {
      const z = useAppStore.getState().zones.find((z) => z.id === selectedNode.linkedEntityId)
      return z ? `${z.nombre} (${z.codigo})` : undefined
    }
    return undefined
  }, [selectedNode?.linkedEntityId, selectedNode?.linkedEntityType])

  // Handlers de vinculación
  const handleLinkEntity = useCallback((nodeId: string, entityType: MapNode['linkedEntityType'], entityId: string) => {
    handleNodeUpdate(nodeId, { linkedEntityType: entityType, linkedEntityId: entityId })
    setShowLinkDialog(false)
  }, [handleNodeUpdate])

  const handleUnlinkEntity = useCallback((nodeId: string) => {
    handleNodeUpdate(nodeId, { linkedEntityType: undefined, linkedEntityId: undefined })
    setShowLinkDialog(false)
  }, [handleNodeUpdate])

  // Handler para guardar forma custom
  const handleSaveCustomShape = useCallback((nodeId: string, customShape: import('@/types/isometricMap').ShapePrimitive[]) => {
    handleNodeUpdate(nodeId, { customShape })
  }, [handleNodeUpdate])

  // Handler para restaurar forma por defecto
  const handleClearCustomShape = useCallback((nodeId: string) => {
    handleNodeUpdate(nodeId, { customShape: undefined })
  }, [handleNodeUpdate])

  const isAddToolActive = editorTool === 'add'
  const isMoveToolActive = editorTool === 'move'
  const preferAreaFlow = workflowPreset === 'areas'
  const preferEquipmentFlow = workflowPreset === 'equipos'
  const preferFineTuneFlow = workflowPreset === 'ajuste'

  const startAddEquipmentFlow = useCallback(() => {
    closeAreaEditor()
    setEditorTool('add')
    overlayState.openOverlay('add-equipment')
  }, [closeAreaEditor, overlayState])

  const quickActionHint = useMemo(() => {
    if (selectedNode) {
      if (isMoveToolActive) return 'Arrastra el equipo a su nueva posición y luego finaliza movimiento.'
      if (preferAreaFlow && selectedNode.linkedAreaId) return 'Flujo áreas: abre el área del equipo para ajustar tiles y asociación.'
      if (preferFineTuneFlow) return 'Ajuste fino: prioriza editar forma, rotación y vínculo del equipo actual.'
      if (isAddToolActive) return 'Estás en modo agregar: crea otro equipo o vuelve a selección para editar.'
      return 'Edita forma o vínculo del equipo, o salta a su área asociada para continuar el flujo.'
    }

    if (selectedAreaId) {
      if (preferEquipmentFlow) return 'Flujo equipos: agrega rápidamente equipos dentro de esta área activa.'
      if (isAddToolActive) return 'Agrega equipos dentro del área activa y luego vuelve a modo selección.'
      return 'Edita el área activa o agrega equipos directamente dentro de esta zona.'
    }

    if (preferAreaFlow) return 'Flujo áreas: delimita primero zonas y luego asigna equipos por contexto.'
    if (preferFineTuneFlow) return 'Ajuste fino: selecciona un equipo o área existente para modificar detalles.'
    if (isAddToolActive) return 'Define y agrega un equipo nuevo en el mapa, o sal de modo agregar.'
    return 'Comienza creando un área o agregando un equipo para iniciar el diseño del piso.'
  }, [
    selectedNode,
    isMoveToolActive,
    isAddToolActive,
    selectedAreaId,
    preferAreaFlow,
    preferEquipmentFlow,
    preferFineTuneFlow,
  ])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Compass className="h-6 w-6 text-primary" />
            Mapa Isométrico
          </h1>
          <p className="text-sm text-muted-foreground">
            Vista 3D de la planta — Rotar: Q/E · Zoom: scroll · Pan: arrastrar clic izquierdo · Reset: R
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Modo editor (solo admin) */}
          {isAdmin && (
            <Button
              variant={isEditMode ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={handleToggleEditMode}
            >
              {isEditMode ? (
                <>
                  <EyeIcon className="h-4 w-4" />
                  Modo Vista
                </>
              ) : (
                <>
                  <Pencil className="h-4 w-4" />
                  Editar Mapa
                </>
              )}
            </Button>
          )}
          {/* Ángulo actual */}
          <Badge variant="outline" className="gap-1 font-normal">
            <Compass className="h-3.5 w-3.5" />
            {CAMERA_ANGLE_NAMES[viewerState.cameraAngle]}
          </Badge>
          {/* Piso */}
          <Badge variant="outline" className="gap-1 font-normal">
            <Building2 className="h-3.5 w-3.5" />
            {viewerState.currentFloor === 0 ? 'PB' : viewerState.currentFloor === 1 ? '2° Piso' : 'Techo'}
          </Badge>
          {/* Zoom */}
          <Badge variant="outline" className="gap-1 font-normal">
            Zoom: {viewerState.zoom}
          </Badge>
        </div>
      </div>

      {/* Status Legend */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((status) => (
              <div key={status} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                <span>{STATUS_LABELS[status]}</span>
                <span className="font-semibold text-foreground">({statusSummary[status]})</span>
              </div>
            ))}
            <div className="ml-auto flex items-center gap-1 text-muted-foreground">
              <Activity className="h-3.5 w-3.5" />
              <span>{nodes.length} equipos</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main 3D Viewport + Controls */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div
            ref={canvasContainerRef}
            className="relative w-full h-[550px] md:h-[650px] lg:h-[700px]"
            onPointerDown={handlePointerDownPan}
            onPointerMove={handlePointerMovePan}
            onPointerUp={handlePointerUpPan}
            onContextMenu={(e) => e.preventDefault()}
          >
            {/* Three.js Scene */}
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center bg-[#0d1117]">
                  <div className="text-center space-y-3">
                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-sm text-muted-foreground">Cargando escena 3D...</p>
                  </div>
                </div>
              }
            >
              <IsometricScene
                config={demoData.config}
                nodes={nodes}
                connectors={connectors}
                areas={areas}
                selectedAreaId={selectedAreaId}
                highlightedAreaId={hoveredAreaId}
                runtimeData={runtimeData}
                viewerState={viewerState}
                visibleNodeIds={visibleNodeIds}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onAreaClick={handleAreaClick}
                onBackgroundClick={handleBackgroundClick}
                onNodeDragEnd={handleNodeDragEnd}
                onFloorClick={handleFloorClick}
                paintTiles={showAreaEditor ? {
                  tiles: areaPaintState.tiles,
                  color: areaPaintState.color,
                  opacity: areaPaintState.opacity,
                } : undefined}
              />
            </Suspense>

            {/* ─── HUD Overlay Controls ─── */}

            {/* Editor Toolbar (arriba centro, solo en modo edit) */}
            {isEditMode && (
              <EditorToolbar
                activeTool={editorTool}
                hasSelection={!!viewerState.selectedNodeId}
                hasUnsavedChanges={hasUnsavedChanges}
                isSaving={isSaving}
                canUndo={history.canUndo}
                canRedo={history.canRedo}
                snapEnabled={snapEnabled}
                addEquipmentType={addEquipmentType}
                onToolChange={setEditorTool}
                onAddEquipment={() => {
                  closeAreaEditor()
                  overlayState.openOverlay('add-equipment')
                }}
                onDeleteSelected={handleDeleteSelected}
                onDuplicateSelected={handleDuplicateSelected}
                onRotateSelected={handleRotateSelected}
                onSave={handleSave}
                onCancel={handleCancelEdit}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onToggleSnap={() => setSnapEnabled((v) => !v)}
                onChangeEquipmentType={setAddEquipmentType}
                onShowAddDialog={() => {
                  closeAreaEditor()
                  overlayState.openOverlay('add-equipment')
                }}
              />
            )}

            {/* Edit mode indicator */}
            {isEditMode && (
              <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
                <Badge variant="default" className="bg-amber-500 text-white gap-1 text-xs">
                  <Pencil className="h-3 w-3" />
                  MODO EDITOR
                  {hasUnsavedChanges && ' • Sin guardar'}
                </Badge>
              </div>
            )}

            {/* Camera rotation + zoom + pan (izquierda abajo) */}
            <div className="absolute bottom-4 left-4 flex flex-col gap-2">
              {/* Toggle equipos: botón prominente */}
              <Button
                variant={viewerState.filters.showEquipment ? 'outline' : 'default'}
                size="sm"
                className={cn(
                  'gap-1.5 text-xs shadow-lg backdrop-blur',
                  !viewerState.filters.showEquipment && 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
                )}
                onClick={() => toggleFilter('showEquipment')}
                title={viewerState.filters.showEquipment ? 'Ocultar equipos (ver solo planta)' : 'Mostrar equipos'}
              >
                {viewerState.filters.showEquipment ? (
                  <><EyeOff className="h-3.5 w-3.5" /> Ocultar Equipos</>
                ) : (
                  <><Eye className="h-3.5 w-3.5" /> Solo Planta</>
                )}
              </Button>

              <div className="flex items-center gap-1 bg-card/90 backdrop-blur rounded-lg p-1 shadow-lg border">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={rotateLeft} title="Rotar izq (Q)">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={rotateRight} title="Rotar der (E)">
                    <RotateCw className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn} title="Acercar (scroll ↑)">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut} title="Alejar (scroll ↓)">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <div className="w-px h-6 bg-border" />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fitMapComplete} title={`Ver mapa completo (zoom ${FULL_MAP_VIEW_ZOOM})`}>
                    <Maximize className="h-4 w-4" />
                  </Button>
              </div>
            </div>

            {/* Filter toggles (izquierda arriba) */}
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Layers className="h-3.5 w-3.5" />
                  Filtros
                </Button>
                {showFilters && (
                  <div className="p-2 border-t space-y-1">
                    {[
                      { key: 'showEquipment' as const, icon: Shapes, label: 'Equipos' },
                      { key: 'showLabels' as const, icon: Eye, label: 'Etiquetas' },
                      { key: 'showAreas' as const, icon: MapPin, label: 'Áreas' },
                      { key: 'showConnectors' as const, icon: Activity, label: 'Conectores' },
                      { key: 'showAlerts' as const, icon: AlertTriangle, label: 'Alertas' },
                    ].map(({ key, icon: Icon, label }) => (
                      <button
                        key={key}
                        className={cn(
                          'flex items-center gap-2 w-full text-left text-xs px-2 py-1 rounded hover:bg-muted transition-colors',
                          viewerState.filters[key] ? 'text-foreground' : 'text-muted-foreground'
                        )}
                        onClick={() => toggleFilter(key)}
                      >
                        {viewerState.filters[key] ? (
                          <Eye className="h-3 w-3 text-primary" />
                        ) : (
                          <EyeOff className="h-3 w-3" />
                        )}
                        <Icon className="h-3 w-3" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Floor selector */}
              <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border p-1.5">
                <p className="text-[10px] text-muted-foreground font-medium px-1 mb-1">PISO</p>
                <div className="flex flex-col gap-0.5">
                  {FLOOR_OPTIONS.map(({ floor, full }) => (
                    <Button
                      key={floor}
                      variant={viewerState.currentFloor === floor ? 'default' : 'ghost'}
                      size="sm"
                      className={cn(
                        'h-8 text-xs px-3 justify-start gap-2',
                        viewerState.currentFloor === floor && 'font-bold'
                      )}
                      onClick={() => setFloor(floor)}
                      title={full}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {full}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Area editor buttons (solo en modo editor) */}
              {isEditMode && (
                <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border p-2 flex flex-col gap-2 w-[320px]">
                  <p className="text-[10px] text-muted-foreground font-medium px-1">EDITOR RÁPIDO</p>

                  {selectedAreaId && (
                    <div className="px-2 py-1.5 rounded-md border bg-primary/5 border-primary/20 text-[11px] text-primary">
                      Área activa: <span className="font-semibold">{areaById.get(selectedAreaId)?.label ?? selectedAreaId}</span>
                      {selectedAreaEquipmentSummary && (
                        <span className="ml-1 text-primary/80">
                          · {selectedAreaEquipmentSummary.linked} asociados / {selectedAreaEquipmentSummary.unlinked} sin área
                        </span>
                      )}
                    </div>
                  )}

                  {selectedNode && (
                    <div className="px-2 py-1.5 rounded-md border bg-amber-500/5 border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
                      Equipo activo: <span className="font-semibold">{selectedNode.label}</span>
                      {selectedNode.linkedAreaId && (
                        <span className="ml-1 text-amber-700/80 dark:text-amber-300/80">
                          · Área: {areaById.get(selectedNode.linkedAreaId)?.label ?? selectedNode.linkedAreaId}
                        </span>
                      )}
                    </div>
                  )}

                  <div className={cn(
                    'px-2 py-1 rounded-md border text-[11px]',
                    isAddToolActive
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : isMoveToolActive
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300'
                        : 'bg-muted/40 border-border text-muted-foreground'
                  )}>
                    Modo activo: <span className="font-semibold uppercase">{editorTool}</span>
                  </div>

                  <div className="px-2 py-1.5 rounded-md border bg-muted/30 border-border text-[11px]">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Siguiente recomendado</p>
                    <p className="text-[11px] text-foreground leading-snug mt-0.5">{quickActionHint}</p>
                  </div>

                  <div className="px-1 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Preset de flujo</p>
                    <div className="grid grid-cols-3 gap-1">
                      <Button
                        size="sm"
                        variant={workflowPreset === 'areas' ? 'default' : 'outline'}
                        className="h-7 text-[10px] px-1"
                        onClick={() => setWorkflowPreset('areas')}
                      >
                        Diseñar áreas
                      </Button>
                      <Button
                        size="sm"
                        variant={workflowPreset === 'equipos' ? 'default' : 'outline'}
                        className="h-7 text-[10px] px-1"
                        onClick={() => setWorkflowPreset('equipos')}
                      >
                        Poblar equipos
                      </Button>
                      <Button
                        size="sm"
                        variant={workflowPreset === 'ajuste' ? 'default' : 'outline'}
                        className="h-7 text-[10px] px-1"
                        onClick={() => setWorkflowPreset('ajuste')}
                      >
                        Ajuste fino
                      </Button>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground font-medium px-1">ACCIONES CONTEXTUALES</p>

                  <div className="space-y-1">
                    {!selectedNode && !selectedAreaId && (
                      <>
                        {preferAreaFlow && !isAddToolActive ? (
                          <>
                            <div className="space-y-0.5">
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1.5 text-xs justify-start w-full"
                                onClick={() => openAreaEditor(null)}
                              >
                                <Grid3x3 className="h-3.5 w-3.5" />
                                Crear nueva área
                              </Button>
                              <p className="text-[10px] text-muted-foreground px-1">Prioridad del preset actual.</p>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={startAddEquipmentFlow}
                            >
                              <Shapes className="h-3.5 w-3.5" />
                              Agregar equipo
                            </Button>
                          </>
                        ) : isAddToolActive ? (
                          <>
                            <div className="space-y-0.5">
                              <Button
                                variant="default"
                                size="sm"
                                className="gap-1.5 text-xs justify-start w-full"
                                onClick={startAddEquipmentFlow}
                              >
                                <Shapes className="h-3.5 w-3.5" />
                                Configurar equipo a agregar
                              </Button>
                              <p className="text-[10px] text-muted-foreground px-1">Ajusta tipo y datos antes de ubicarlo en el mapa.</p>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={() => setEditorTool('select')}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Salir de modo agregar
                            </Button>
                          </>
                        ) : (
                          <div className="space-y-0.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={startAddEquipmentFlow}
                            >
                              <Shapes className="h-3.5 w-3.5" />
                              Agregar equipo
                            </Button>
                            <p className="text-[10px] text-muted-foreground px-1">Recomendado si ya tienes ubicación en mente.</p>
                          </div>
                        )}

                        {(!preferAreaFlow || isAddToolActive) && (
                          <div className="space-y-0.5">
                            <Button
                              variant={isAddToolActive ? 'outline' : 'default'}
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={() => openAreaEditor(null)}
                            >
                              <Grid3x3 className="h-3.5 w-3.5" />
                              Crear nueva área
                            </Button>
                            <p className="text-[10px] text-muted-foreground px-1">Útil para delimitar zonas antes de asociar equipos.</p>
                          </div>
                        )}
                      </>
                    )}

                    {selectedAreaId && (
                      <>
                        {preferAreaFlow && !isAddToolActive ? (
                          <div className="space-y-0.5">
                            <Button
                              variant="default"
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={() => {
                                const selectedArea = areaById.get(selectedAreaId)
                                if (selectedArea) openAreaEditor(selectedArea)
                              }}
                            >
                              <Grid3x3 className="h-3.5 w-3.5" />
                              Editar área activa
                            </Button>
                            <p className="text-[10px] text-muted-foreground px-1">Prioridad del preset actual.</p>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <Button
                              variant={isAddToolActive ? 'default' : 'outline'}
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={startAddEquipmentFlow}
                            >
                              <Shapes className="h-3.5 w-3.5" />
                              Agregar equipo en área
                            </Button>
                            <p className="text-[10px] text-muted-foreground px-1">El nuevo equipo quedará asociado a esta área activa.</p>
                          </div>
                        )}

                        {isAddToolActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs justify-start w-full"
                            onClick={() => setEditorTool('select')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Volver a modo seleccionar
                          </Button>
                        )}

                        {(!preferAreaFlow || isAddToolActive) && (
                          <div className="space-y-0.5">
                            <Button
                              variant={isAddToolActive ? 'outline' : 'default'}
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={() => {
                                const selectedArea = areaById.get(selectedAreaId)
                                if (selectedArea) openAreaEditor(selectedArea)
                              }}
                            >
                              <Grid3x3 className="h-3.5 w-3.5" />
                              Editar área activa
                            </Button>
                            <p className="text-[10px] text-muted-foreground px-1">Pinta/borrar tiles y ajusta propiedades del área.</p>
                          </div>
                        )}

                        <Button
                          variant={showOnlyActiveAreaEquipment ? 'default' : 'outline'}
                          size="sm"
                          className="gap-1.5 text-xs justify-start w-full"
                          onClick={() => setShowOnlyActiveAreaEquipment((prev) => !prev)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {showOnlyActiveAreaEquipment ? 'Mostrar todos los equipos' : 'Solo equipos del área activa'}
                        </Button>
                      </>
                    )}

                    {selectedNode && (
                      <>
                        {isMoveToolActive ? (
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-1.5 text-xs justify-start w-full"
                            onClick={() => setEditorTool('select')}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Finalizar movimiento
                          </Button>
                        ) : (
                          <Button
                            variant={isAddToolActive ? 'default' : 'outline'}
                            size="sm"
                            className="gap-1.5 text-xs justify-start w-full"
                            onClick={startAddEquipmentFlow}
                          >
                            <Shapes className="h-3.5 w-3.5" />
                            Agregar otro equipo
                          </Button>
                        )}

                        {preferAreaFlow && selectedNode.linkedAreaId ? (
                          <div className="space-y-0.5">
                            <Button
                              variant="default"
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={() => {
                                const linkedArea = areaById.get(selectedNode.linkedAreaId!)
                                if (linkedArea) {
                                  setSelectedAreaId(linkedArea.id)
                                  openAreaEditor(linkedArea)
                                }
                              }}
                            >
                              <Grid3x3 className="h-3.5 w-3.5" />
                              Editar área del equipo
                            </Button>
                            <p className="text-[10px] text-muted-foreground px-1">Prioridad del preset actual.</p>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <Button
                              variant={isMoveToolActive ? 'outline' : 'default'}
                              size="sm"
                              className="gap-1.5 text-xs justify-start w-full"
                              onClick={() => overlayState.openOverlay('shape-editor')}
                            >
                              <Shapes className="h-3.5 w-3.5" />
                              Editar forma del equipo
                            </Button>
                            <p className="text-[10px] text-muted-foreground px-1">Ideal cuando el equipo ya está posicionado y asociado.</p>
                          </div>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs justify-start w-full"
                          onClick={() => setShowLinkDialog(true)}
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          Vincular entidad real
                        </Button>

                        {(!preferAreaFlow || !selectedNode.linkedAreaId) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs justify-start w-full"
                            onClick={() => {
                              const linkedAreaId = selectedNode.linkedAreaId
                              const linkedArea = linkedAreaId ? areaById.get(linkedAreaId) : null
                              if (linkedArea) {
                                setSelectedAreaId(linkedArea.id)
                                openAreaEditor(linkedArea)
                              }
                            }}
                            disabled={!selectedNode.linkedAreaId}
                          >
                            <Grid3x3 className="h-3.5 w-3.5" />
                            {selectedNode.linkedAreaId ? 'Editar área del equipo' : 'Equipo sin área asociada'}
                          </Button>
                        )}

                        {selectedAreaId && selectedAreaId !== selectedNode.linkedAreaId && (
                          <Button
                            variant={isAddToolActive ? 'default' : 'outline'}
                            size="sm"
                            className="gap-1.5 text-xs justify-start w-full"
                            onClick={() => handleNodeUpdate(selectedNode.id, { linkedAreaId: selectedAreaId })}
                          >
                            <Grid3x3 className="h-3.5 w-3.5" />
                            Asociar equipo a área activa
                          </Button>
                        )}
                      </>
                    )}

                    <div className="border-t pt-1.5 mt-1">
                      <p className="text-[10px] text-muted-foreground font-medium px-1 mb-1">UTILIDADES GLOBALES</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs justify-start w-full"
                        onClick={() => overlayState.openOverlay('area-manager')}
                      >
                        <Settings2 className="h-3.5 w-3.5" />
                        Gestionar áreas
                      </Button>
                    </div>
                  </div>

                  <div className="border-t pt-1.5">
                    <p className="text-[10px] text-muted-foreground px-1 mb-1">ÁREAS DEL PISO</p>
                    <div className="max-h-28 overflow-y-auto space-y-1 px-0.5">
                      {currentFloorAreas.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground px-1">Sin áreas en este piso</p>
                      ) : (
                        currentFloorAreas.map((area) => (
                          <button
                            key={area.id}
                            className={cn(
                              'w-full text-left px-2 py-1 rounded text-[11px] border flex items-center gap-2',
                              selectedAreaId === area.id ? 'bg-primary/10 border-primary/50' : 'bg-muted/40 hover:bg-muted'
                            )}
                            onClick={() => {
                              setSelectedAreaId(area.id)
                              setViewerState((prev) => ({
                                ...prev,
                                panOffset: { x: area.position.x, z: area.position.z },
                                zoom: Math.max(prev.zoom, 28),
                                currentFloor: area.floor ?? 0,
                                filters: { ...prev.filters, showAreas: true },
                              }))
                            }}
                          >
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: area.color }} />
                            <span className="truncate flex-1">{area.label}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs justify-start w-full"
                    onClick={() => setViewerState((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, showAreas: !prev.filters.showAreas },
                    }))}
                  >
                    {viewerState.filters.showAreas ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {viewerState.filters.showAreas ? 'Ocultar áreas' : 'Mostrar áreas'}
                  </Button>

                  <p className="text-[10px] text-muted-foreground px-1">
                    Tip: las acciones cambian según selección activa (área o equipo).
                  </p>
                </div>
              )}
            </div>

            {/* Search panel (center top) — visible siempre */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <MapSearchPanel
                nodes={nodes}
                areas={areas}
                onSelectNode={(nodeId) => handleNodeClick(nodeId)}
                onSelectArea={handleAreaClick}
                onFocusNode={handleFocusNode}
              />
            </div>

            {/* Selected node info card (centro abajo) — solo en modo vista */}
            {selectedNode && !isEditMode && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 max-w-sm w-full px-4">
                <Card className="bg-card/95 backdrop-blur shadow-xl border">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm">{selectedNode.label}</h4>
                        <p className="text-xs text-muted-foreground">
                          {EQUIPMENT_TYPE_LABELS[selectedNode.type]} · Pos ({selectedNode.position.x}, {selectedNode.position.z})m
                        </p>
                        {selectedNodeRuntime && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: STATUS_COLORS[selectedNodeRuntime.status] }}
                            />
                            <span className="text-xs font-medium">
                              {STATUS_LABELS[selectedNodeRuntime.status]}
                            </span>
                            {selectedNodeRuntime.activeIncidents > 0 && (
                              <Badge variant="destructive" className="text-xs h-5 gap-0.5">
                                <AlertTriangle className="h-3 w-3" />
                                {selectedNodeRuntime.activeIncidents}
                              </Badge>
                            )}
                            {selectedNodeRuntime.sensorValue !== undefined && (
                              <Badge variant="secondary" className="text-xs h-5">
                                {selectedNodeRuntime.sensorValue}{selectedNodeRuntime.sensorUnit || ''}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={handleBackgroundClick}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Panel lateral: Propiedades (modo editor) o Incidencias (modo vista) */}
            {isEditMode ? (
              /* Panel de propiedades del nodo en modo editor */
              <div className={cn(
                'absolute top-0 right-0 h-full border-l shadow-lg transition-all duration-300 overflow-hidden z-40',
                selectedNode ? 'w-72 md:w-80' : 'w-0'
              )}>
                {selectedNode && (
                  <NodePropertiesPanel
                    node={selectedNode}
                    onUpdate={handleNodeUpdate}
                    onClose={handleBackgroundClick}
                    onDelete={() => handleDeleteSelected()}
                    onOpenLinkDialog={() => setShowLinkDialog(true)}
                    linkedEntityName={linkedEntityName}
                    linkedAreaName={selectedNode.linkedAreaId ? areas.find((area) => area.id === selectedNode.linkedAreaId)?.label : undefined}
                    selectedAreaName={selectedAreaId ? areas.find((area) => area.id === selectedAreaId)?.label : undefined}
                    onAssignSelectedArea={selectedAreaId ? () => handleNodeUpdate(selectedNode.id, { linkedAreaId: selectedAreaId }) : undefined}
                  />
                )}
              </div>
            ) : (
              /* Panel lateral de incidencias (modo vista) */
              <div className={cn(
                'absolute top-0 right-0 h-full bg-card/95 backdrop-blur border-l shadow-lg transition-all duration-300 overflow-hidden z-40',
                showIncidentPanel ? 'w-72 md:w-80' : 'w-0'
              )}>
                <div className="h-full flex flex-col">
                  <div className="p-3 border-b flex items-center justify-between">
                    <h3 className="font-semibold text-sm">
                      Incidencias ({activeIncidents.length})
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowIncidentPanel(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {activeIncidents.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">
                        <CircleCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        <p className="text-sm">Sin incidencias activas</p>
                      </div>
                    ) : (
                      activeIncidents.map((incident) => {
                        const priorityConfig = PRIORITY_CONFIG[incident.prioridad]
                        const statusConfig = STATUS_CONFIG[incident.status]
                        
                        return (
                          <button
                            key={incident.id}
                            className={cn(
                              'w-full text-left p-2.5 rounded-lg border bg-card hover:bg-muted transition-colors',
                              selectedIncident?.id === incident.id && 'ring-2 ring-primary'
                            )}
                            onClick={() => setSelectedIncident(incident)}
                          >
                            <div className="flex items-start gap-2">
                              <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', priorityConfig.bg)} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-xs truncate">{incident.titulo}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Badge variant={statusConfig.variant as any} className="text-[10px] h-4">
                                    {statusConfig.label}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {formatRelativeTime(incident.createdAt)}
                                  </span>
                                </div>
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-1" />
                            </div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Botón para mostrar panel de incidencias (solo modo vista) */}
            {!isEditMode && !showIncidentPanel && (
              <Button
                className="absolute top-4 right-4 shadow-lg z-40"
                variant="secondary"
                size="sm"
                onClick={() => setShowIncidentPanel(true)}
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                {activeIncidents.length}
              </Button>
            )}

            {/* Help hint (bottom right) */}
            <div className="absolute bottom-4 right-4 text-[10px] text-muted-foreground/60 select-none pointer-events-none hidden md:block">
              {isEditMode
                ? 'V: seleccionar · M: mover · A: agregar · Del: eliminar · Ctrl+Z: deshacer'
                : 'Q/E: rotar · Scroll: zoom · Arrastrar clic izq: paneo · R: reset · Click: seleccionar'}
            </div>

            {/* Editor de áreas — panel lateral sobre la escena 3D */}
            {showAreaEditor && (
              <AreaTileEditor
                isOpen={showAreaEditor}
                paintState={areaPaintState}
                onPaintStateChange={handleAreaPaintStateChange}
                editArea={editingArea}
                currentFloor={viewerState.currentFloor}
                onSave={handleSaveArea}
                onDelete={handleDeleteArea}
                onCreateAndAddEquipment={() => {
                  closeAreaEditor()
                  setEditorTool('add')
                  overlayState.openOverlay('add-equipment')
                }}
                onClose={closeAreaEditor}
              />
            )}

            {/* Gestor de áreas — vista centralizada */}
            {showAreaManager && (
              <div className="absolute inset-0 z-30 bg-background/70 backdrop-blur-sm flex items-center justify-center p-4">
                <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden border shadow-2xl">
                  <CardContent className="p-0 h-full flex flex-col">
                    <div className="p-3 border-b flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold">Gestionar Áreas</h3>
                        <p className="text-[11px] text-muted-foreground">Edita o elimina áreas existentes desde un solo lugar</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => overlayState.closeOverlayIf('area-manager')}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="p-3 border-b flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant={areaManagerFloor === 'all' ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setAreaManagerFloor('all')}
                      >
                        Todos
                      </Button>
                      {FLOOR_OPTIONS.map(({ floor, full }) => (
                        <Button
                          key={floor}
                          size="sm"
                          variant={areaManagerFloor === floor ? 'default' : 'outline'}
                          className="h-7 text-xs"
                          onClick={() => setAreaManagerFloor(floor)}
                        >
                          {full}
                        </Button>
                      ))}
                      <Badge variant="outline" className="ml-auto text-xs">
                        {managedAreas.length} áreas
                      </Badge>
                    </div>

                    <div className="p-3 overflow-y-auto space-y-2">
                      {managedAreas.length === 0 ? (
                        <div className="text-center text-xs text-muted-foreground py-8">No hay áreas para este filtro</div>
                      ) : (
                        managedAreas.map((area) => (
                          <div key={area.id} className="border rounded-lg p-2.5 bg-card/70 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: area.color }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{area.label}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {FLOOR_LABELS[area.floor ?? 0] ?? `Piso ${area.floor ?? 0}`} · {area.tiles?.length ?? 0} tiles
                              </p>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  overlayState.closeOverlayIf('area-manager')
                                  setSelectedAreaId(area.id)
                                  setViewerState((prev) => ({
                                    ...prev,
                                    currentFloor: area.floor ?? 0,
                                    panOffset: { x: area.position.x, z: area.position.z },
                                    zoom: Math.max(prev.zoom, 28),
                                    filters: { ...prev.filters, showAreas: true },
                                  }))
                                }}
                              >
                                Ver
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  overlayState.closeOverlayIf('area-manager')
                                  openAreaEditor(area)
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs text-destructive hover:text-destructive"
                                onClick={() => {
                                  if (window.confirm(`¿Eliminar área "${area.label}"? Esta acción no se puede deshacer.`)) {
                                    handleDeleteArea(area.id)
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Eliminar
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de agregar equipo (editor) */}
      <AddEquipmentDialog
        isOpen={showAddDialog}
        onClose={() => overlayState.closeOverlayIf('add-equipment')}
        onAdd={handleAddNodeFromDialog}
        selectedAreaLabel={selectedAreaId ? areaById.get(selectedAreaId)?.label ?? null : null}
      />

      {/* Diálogo de vincular entidad real (editor) */}
      {selectedNode && (
        <LinkEntityDialog
          isOpen={showLinkDialog}
          node={selectedNode}
          onLink={handleLinkEntity}
          onUnlink={handleUnlinkEntity}
          onClose={() => setShowLinkDialog(false)}
        />
      )}

      {/* Diálogo de detalle de incidencia */}
      {selectedIncident && (
        <IncidentDetail 
          incident={selectedIncident} 
          onClose={() => setSelectedIncident(null)} 
          canValidate={canValidate}
        />
      )}

      {/* Editor de forma 3D */}
      {showShapeEditor && selectedNode && (
        <ShapeEditorDialog
          isOpen={showShapeEditor}
          node={selectedNode}
          onSave={handleSaveCustomShape}
          onClear={handleClearCustomShape}
          onClose={() => overlayState.closeOverlayIf('shape-editor')}
        />
      )}

    </div>
  )
}
