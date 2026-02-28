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
  Scan,
  Building2,
  Shapes,
  Grid3x3,
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
import type { AreaPaintState } from '@/components/map/isometric/editor/AreaTileEditor'

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
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [showShapeEditor, setShowShapeEditor] = useState(false)
  const [showAreaEditor, setShowAreaEditor] = useState(false)
  const [editingArea, setEditingArea] = useState<MapArea | null>(null)
  const [areaPaintState, setAreaPaintState] = useState<AreaPaintState>({
    tiles: new Set<string>(),
    tool: 'paint',
    name: '',
    color: '#3b82f6',
    opacity: 0.3,
    linkedZoneId: '',
    editAreaId: null,
  })
  const prevFiltersRef = useRef<IsometricViewerState['filters'] | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const history = useEditorHistory()

  // Snapshot inicial para undo
  useEffect(() => {
    history.pushSnapshot({ nodes, areas, connectors })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isEditMode = viewerState.mode === 'edit'

  // Incidencias activas
  const activeIncidents = useMemo(
    () => incidents.filter((i) =>
      i.status === 'pendiente' || i.status === 'confirmada' || i.status === 'en_proceso'
    ),
    [incidents]
  )

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
      zoom: Math.min(prev.zoom + Math.max(2, Math.round(prev.zoom * 0.08)), 500),
    }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      zoom: Math.max(prev.zoom - Math.max(2, Math.round(prev.zoom * 0.08)), 3),
    }))
  }, [])

  const resetView = useCallback(() => {
    setViewerState(DEFAULT_VIEWER_STATE)
  }, [])

  // Fit all: calcular zoom para que todo el mapa quepa en pantalla
  const fitAll = useCallback(() => {
    // Calcular bounding box de todos los nodos visibles
    const visibleNodes = nodes.filter(n => n.visible && (n.floor ?? 0) === viewerState.currentFloor)
    if (visibleNodes.length === 0) {
      // Si no hay nodos, usar config del mapa
      const mapHalf = Math.max(demoData.config.width, demoData.config.depth) / 2
      setViewerState((prev) => ({
        ...prev,
        zoom: mapHalf * 1.15,
        panOffset: { x: 0, z: 0 },
      }))
      return
    }
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const n of visibleNodes) {
      const hw = (n.size.width ?? 2) / 2
      const hd = (n.size.depth ?? 2) / 2
      minX = Math.min(minX, n.position.x - hw)
      maxX = Math.max(maxX, n.position.x + hw)
      minZ = Math.min(minZ, n.position.z - hd)
      maxZ = Math.max(maxZ, n.position.z + hd)
    }
    // También incluir áreas
    for (const a of areas.filter(a => (a.floor ?? 0) === viewerState.currentFloor)) {
      minX = Math.min(minX, a.position.x - a.size.width / 2)
      maxX = Math.max(maxX, a.position.x + a.size.width / 2)
      minZ = Math.min(minZ, a.position.z - a.size.depth / 2)
      maxZ = Math.max(maxZ, a.position.z + a.size.depth / 2)
    }
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const spanX = maxX - minX
    const spanZ = maxZ - minZ
    // Zoom = half-height del frustum ortográfico; aspect ~16:9 → width = zoom * aspect
    // Necesitamos que spanZ <= 2*zoom y spanX <= 2*zoom*aspect
    // Asumimos aspect ~1.6 y agregamos 15% de padding
    const zoomForHeight = (spanZ / 2) * 1.15
    const zoomForWidth = (spanX / 2 / 1.6) * 1.15
    const idealZoom = Math.max(zoomForHeight, zoomForWidth, 10)
    setViewerState((prev) => ({
      ...prev,
      zoom: Math.min(idealZoom, 500),
      panOffset: { x: cx, z: cz },
    }))
  }, [nodes, areas, viewerState.currentFloor, demoData.config])

  // Cambiar de piso
  const setFloor = useCallback((floor: number) => {
    setViewerState((prev) => ({
      ...prev,
      currentFloor: floor,
    }))
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
        ? Math.min(prev.zoom + step, 500)
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

  // ── Pan (middle-click o right-click drag) ──
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })

  const handlePointerDownPan = useCallback((e: React.PointerEvent) => {
    // Middle button (1) or right button (2)
    if (e.button === 1 || e.button === 2) {
      e.preventDefault()
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY }
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    }
  }, [])

  const handlePointerMovePan = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y
    panStart.current = { x: e.clientX, y: e.clientY }

    // Sensibilidad inversamente proporcional al zoom
    // Zoom alto (cerca) → movimiento fino; Zoom bajo (lejos) → movimiento amplio
    setViewerState((prev) => {
      const sensitivity = 30 / prev.zoom
      return {
        ...prev,
        panOffset: {
          x: prev.panOffset.x - dx * sensitivity,
          z: prev.panOffset.z - dy * sensitivity,
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
    setViewerState((prev) => ({
      ...prev,
      selectedNodeId: prev.selectedNodeId === nodeId ? null : nodeId,
    }))
  }, [])

  const handleNodeHover = useCallback((nodeId: string | null) => {
    setViewerState((prev) => ({
      ...prev,
      hoveredNodeId: nodeId,
    }))
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setViewerState((prev) => ({
      ...prev,
      selectedNodeId: null,
    }))
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
      const newNodes = nodes.map((n) =>
        n.id === nodeId ? { ...n, position: newPosition } : n
      )
      commitEditorChange(newNodes)
    },
    [nodes, commitEditorChange]
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
      setShowAddDialog(false)
      // Seleccionar el nodo recién agregado
      setViewerState((prev) => ({ ...prev, selectedNodeId: newNode.id }))
    },
    [nodes, commitEditorChange]
  )

  // ── Area paint state ──
  const handleAreaPaintStateChange = useCallback((update: Partial<AreaPaintState>) => {
    setAreaPaintState((prev) => {
      // Si el update contiene tiles, reemplazar directamente (Set no se puede spread)
      if ('tiles' in update && update.tiles) {
        return { ...prev, ...update, tiles: update.tiles }
      }
      return { ...prev, ...update }
    })
  }, [])

  // Abrir editor de áreas: guardar filtros previos y ocultar equipos/etiquetas
  const openAreaEditor = useCallback((area?: MapArea | null) => {
    prevFiltersRef.current = { ...viewerState.filters }
    setViewerState((prev) => ({
      ...prev,
      filters: { ...prev.filters, showEquipment: false, showLabels: false },
    }))
    setEditingArea(area ?? null)
    // Inicializar paint state desde el área existente o vacío
    if (area?.tiles) {
      const tileSet = new Set<string>(area.tiles.map((t) => `${t.x},${t.z}`))
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
    setShowAreaEditor(true)
  }, [viewerState.filters])

  // Cerrar editor de áreas: restaurar filtros previos
  const closeAreaEditor = useCallback(() => {
    if (prevFiltersRef.current) {
      setViewerState((prev) => ({
        ...prev,
        filters: { ...prevFiltersRef.current! },
      }))
      prevFiltersRef.current = null
    }
    setShowAreaEditor(false)
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
  }, [])

  const handleFloorClick = useCallback(
    (position: { x: number; z: number }) => {
      // ── Area paint mode: toggle tiles ──
      if (showAreaEditor) {
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
        visible: true,
      }
      handleAddNode(newNode)
    },
    [showAreaEditor, editorTool, addEquipmentType, handleAddNode, viewerState.currentFloor]
  )

  const handleDeleteSelected = useCallback(() => {
    if (!viewerState.selectedNodeId) return
    const newNodes = nodes.filter((n) => n.id !== viewerState.selectedNodeId)
    // También eliminar conectores que referencien al nodo
    const newConnectors = connectors.filter(
      (c) => c.fromNodeId !== viewerState.selectedNodeId && c.toNodeId !== viewerState.selectedNodeId
    )
    commitEditorChange(newNodes, undefined, newConnectors)
    setViewerState((prev) => ({ ...prev, selectedNodeId: null }))
  }, [viewerState.selectedNodeId, nodes, connectors, commitEditorChange])

  const handleDuplicateSelected = useCallback(() => {
    if (!viewerState.selectedNodeId) return
    const source = nodes.find((n) => n.id === viewerState.selectedNodeId)
    if (!source) return
    const newNode: MapNode = {
      ...source,
      id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      label: `${source.label} (copia)`,
      position: {
        x: source.position.x + 2,
        y: source.position.y,
        z: source.position.z + 2,
      },
    }
    commitEditorChange([...nodes, newNode])
    setViewerState((prev) => ({ ...prev, selectedNodeId: newNode.id }))
  }, [viewerState.selectedNodeId, nodes, commitEditorChange])

  const handleRotateSelected = useCallback(() => {
    if (!viewerState.selectedNodeId) return
    const newNodes = nodes.map((n) =>
      n.id === viewerState.selectedNodeId
        ? { ...n, rotation: (n.rotation + 90) % 360 }
        : n
    )
    commitEditorChange(newNodes)
  }, [viewerState.selectedNodeId, nodes, commitEditorChange])

  const handleUndo = useCallback(() => {
    const snapshot = history.undo()
    if (snapshot) {
      setNodes(snapshot.nodes)
      setAreas(snapshot.areas)
      setConnectors(snapshot.connectors)
      setHasUnsavedChanges(true)
    }
  }, [history])

  const handleRedo = useCallback(() => {
    const snapshot = history.redo()
    if (snapshot) {
      setNodes(snapshot.nodes)
      setAreas(snapshot.areas)
      setConnectors(snapshot.connectors)
      setHasUnsavedChanges(true)
    }
  }, [history])

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
    history.clear()
  }, [hasUnsavedChanges, history])

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

  // Handler para guardar área del tile editor
  const handleSaveArea = useCallback((area: MapArea) => {
    const exists = areas.find((a) => a.id === area.id)
    if (exists) {
      const newAreas = areas.map((a) => a.id === area.id ? area : a)
      commitEditorChange(nodes, newAreas)
    } else {
      commitEditorChange(nodes, [...areas, area])
    }
    closeAreaEditor()
  }, [areas, nodes, commitEditorChange, closeAreaEditor])

  const handleDeleteArea = useCallback((areaId: string) => {
    const newAreas = areas.filter((a) => a.id !== areaId)
    commitEditorChange(nodes, newAreas)
    closeAreaEditor()
  }, [areas, nodes, commitEditorChange, closeAreaEditor])

  // Keyboard shortcuts (Q/E ya los maneja useIsometricRotation internamente)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      // Editor shortcuts
      if (isEditMode) {
        switch (e.key) {
          case 'v':
          case 'V':
            e.preventDefault()
            setEditorTool('select')
            return
          case 'm':
          case 'M':
            e.preventDefault()
            setEditorTool('move')
            return
          case 'a':
          case 'A':
            e.preventDefault()
            setEditorTool('add')
            return
          case 'g':
          case 'G':
            e.preventDefault()
            setSnapEnabled((prev) => !prev)
            return
          case 't':
          case 'T':
            e.preventDefault()
            handleRotateSelected()
            return
          case 'Delete':
          case 'Backspace':
            e.preventDefault()
            handleDeleteSelected()
            return
          case 'z':
          case 'Z':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              handleUndo()
              return
            }
            break
          case 'y':
          case 'Y':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              handleRedo()
              return
            }
            break
          case 'd':
          case 'D':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault()
              handleDuplicateSelected()
              return
            }
            break
        }
      }

      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault()
          zoomIn()
          break
        case '-':
          e.preventDefault()
          zoomOut()
          break
        case 'r':
        case 'R':
          if (!isEditMode) {
            e.preventDefault()
            resetView()
          }
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [zoomIn, zoomOut, resetView, isEditMode, handleDeleteSelected, handleDuplicateSelected, handleRedo, handleRotateSelected, handleUndo])

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
            Vista 3D de la planta — Rotar: Q/E · Zoom: scroll · Pan: click medio · Reset: R
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
                runtimeData={runtimeData}
                viewerState={viewerState}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
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
                onAddEquipment={() => setShowAddDialog(true)}
                onDeleteSelected={handleDeleteSelected}
                onDuplicateSelected={handleDuplicateSelected}
                onRotateSelected={handleRotateSelected}
                onSave={handleSave}
                onCancel={handleCancelEdit}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onToggleSnap={() => setSnapEnabled((v) => !v)}
                onChangeEquipmentType={setAddEquipmentType}
                onShowAddDialog={() => setShowAddDialog(true)}
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
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fitAll} title="Vista completa">
                    <Scan className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetView} title="Resetear (R)">
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
                  {[
                    { floor: 0, full: 'Planta Baja' },
                    { floor: 1, full: 'Segundo Piso' },
                    { floor: 2, full: 'Techo' },
                  ].map(({ floor, full }) => (
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
                <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border p-1 flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs justify-start"
                    onClick={() => openAreaEditor(null)}
                  >
                    <Grid3x3 className="h-3.5 w-3.5" />
                    Nueva área
                  </Button>
                  {selectedNode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs justify-start"
                      onClick={() => setShowShapeEditor(true)}
                    >
                      <Shapes className="h-3.5 w-3.5" />
                      Editar forma
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Search panel (center top) — visible siempre */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <MapSearchPanel
                nodes={nodes}
                areas={areas}
                onSelectNode={(nodeId) => handleNodeClick(nodeId)}
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
                'absolute top-0 right-0 h-full border-l shadow-lg transition-all duration-300 overflow-hidden',
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
                  />
                )}
              </div>
            ) : (
              /* Panel lateral de incidencias (modo vista) */
              <div className={cn(
                'absolute top-0 right-0 h-full bg-card/95 backdrop-blur border-l shadow-lg transition-all duration-300 overflow-hidden',
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
                className="absolute top-4 right-4 shadow-lg"
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
                : 'Q/E: rotar · Scroll: zoom · Click medio/der: paneo · R: reset · Click: seleccionar'}
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
                onClose={closeAreaEditor}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Diálogo de agregar equipo (editor) */}
      <AddEquipmentDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddNode}
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
          onClose={() => setShowShapeEditor(false)}
        />
      )}

    </div>
  )
}
