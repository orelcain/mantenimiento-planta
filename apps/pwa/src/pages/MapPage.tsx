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
import { useNavigate } from 'react-router-dom'
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
import type { CameraAngle, IsometricViewerState, MapNode, MapArea, TerrainTile, BuildEditMode, MapConnector as MapConnectorType } from '@/types/isometricMap'
import { 
  DEFAULT_VIEWER_STATE,
  FULL_MAP_VIEW_ZOOM,
  MAX_VIEWER_ZOOM,
  CAMERA_ANGLE_AZIMUTH,
  CAMERA_ANGLE_NAMES,
  ELEVATION_PRESET_LEVELS,
  SEA_LEVEL_ELEVATION,
  MIN_TERRAIN_ELEVATION,
  MAX_TERRAIN_ELEVATION,
  clampElevation,
  formatElevationLabel,
  STATUS_LABELS,
  STATUS_COLORS,
  EQUIPMENT_TYPE_LABELS,
  STRUCTURE_NODE_TYPES,
  ELEMENT_NODE_TYPES,
} from '@/types/isometricMap'
import type { Incident, IncidentPriority, IncidentStatus } from '@/types'
import { useAuthStore } from '@/store'
import {
  DEFAULT_CHONCHI_RECTANGLE,
  TerrainImportHttpError,
  formatCoordinatesText,
  importTerrainFromRectangle,
  parseCoordinatesText,
} from '@/lib/terrainImport'

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
import { TerrainEditorModal } from '@/components/map/isometric/editor/TerrainEditorModal'
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

const ELEVATION_OPTIONS = ELEVATION_PRESET_LEVELS.map((level) => ({
  floor: level,
  full: formatElevationLabel(level),
}))

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

function isOverlapping2D(
  a: { x: number; z: number; width: number; depth: number },
  b: { x: number; z: number; width: number; depth: number }
): boolean {
  const dx = Math.abs(a.x - b.x)
  const dz = Math.abs(a.z - b.z)
  return dx < (a.width + b.width) / 2 && dz < (a.depth + b.depth) / 2
}

function getRotatedFootprint(size: MapNode['size'], rotation: number): { width: number; depth: number } {
  const normalized = ((rotation % 360) + 360) % 360
  const quarterTurns = Math.round(normalized / 90) % 4
  if (quarterTurns % 2 === 1) {
    return { width: size.depth, depth: size.width }
  }
  return { width: size.width, depth: size.depth }
}

function getSmartSnappedPlacement(
  rawPosition: { x: number; z: number },
  candidateSize: { width: number; depth: number },
  floor: number,
  nodes: MapNode[],
  enabled: boolean
): {
  position: { x: number; z: number }
  guides: Array<{ axis: 'x' | 'z'; from: { x: number; z: number }; to: { x: number; z: number } }>
} {
  if (!enabled) return { position: rawPosition, guides: [] }

  const SNAP_THRESHOLD = 0.9
  const candidateHalfW = candidateSize.width / 2
  const candidateHalfD = candidateSize.depth / 2

  let snappedX = rawPosition.x
  let snappedZ = rawPosition.z
  let bestDX = SNAP_THRESHOLD + 1
  let bestDZ = SNAP_THRESHOLD + 1
  let bestXGuide: { from: { x: number; z: number }; to: { x: number; z: number } } | null = null
  let bestZGuide: { from: { x: number; z: number }; to: { x: number; z: number } } | null = null

  for (const node of nodes) {
    const nodeFloor = clampElevation(node.floor ?? node.position.y ?? SEA_LEVEL_ELEVATION)
    if (nodeFloor !== floor) continue

    const nodeFootprint = getRotatedFootprint(node.size, node.rotation)
    const nodeHalfW = nodeFootprint.width / 2
    const nodeHalfD = nodeFootprint.depth / 2

    const xTargets = [
      node.position.x - (nodeHalfW + candidateHalfW),
      node.position.x + (nodeHalfW + candidateHalfW),
    ]

    for (const targetX of xTargets) {
      const distance = Math.abs(rawPosition.x - targetX)
      if (distance <= SNAP_THRESHOLD && distance < bestDX) {
        bestDX = distance
        snappedX = targetX
        const guideHalfLength = nodeHalfD + candidateHalfD + 0.6
        bestXGuide = {
          from: { x: targetX, z: node.position.z - guideHalfLength },
          to: { x: targetX, z: node.position.z + guideHalfLength },
        }
      }
    }

    const zTargets = [
      node.position.z - (nodeHalfD + candidateHalfD),
      node.position.z + (nodeHalfD + candidateHalfD),
    ]

    for (const targetZ of zTargets) {
      const distance = Math.abs(rawPosition.z - targetZ)
      if (distance <= SNAP_THRESHOLD && distance < bestDZ) {
        bestDZ = distance
        snappedZ = targetZ
        const guideHalfLength = nodeHalfW + candidateHalfW + 0.6
        bestZGuide = {
          from: { x: node.position.x - guideHalfLength, z: targetZ },
          to: { x: node.position.x + guideHalfLength, z: targetZ },
        }
      }
    }
  }

  const guides: Array<{ axis: 'x' | 'z'; from: { x: number; z: number }; to: { x: number; z: number } }> = []
  if (bestXGuide) guides.push({ axis: 'x', ...bestXGuide })
  if (bestZGuide) guides.push({ axis: 'z', ...bestZGuide })

  return { position: { x: snappedX, z: snappedZ }, guides }
}

export function MapPage() {
  const navigate = useNavigate()
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
  const [nodes, setNodes] = useState<MapNode[]>([])
  const [areas, setAreas] = useState<MapArea[]>([])
  const [connectors, setConnectors] = useState<MapConnectorType[]>([])
  const [terrainTiles, setTerrainTiles] = useState<TerrainTile[]>(() => demoData.terrain ?? [])
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
  const [areaManagerFloor, setAreaManagerFloor] = useState<'all' | number>('all')
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null)
  const [hoveredAreaId, setHoveredAreaId] = useState<string | null>(null)
  const showOnlyActiveAreaEquipment = false
  const [buildMode, setBuildMode] = useState<BuildEditMode>('elements')
  const [terrainEditEnabled, setTerrainEditEnabled] = useState(false)
  const [terrainTool, setTerrainTool] = useState<'raise' | 'lower' | 'flatten' | 'smooth' | 'sample'>('raise')
  const [terrainBrushSize, setTerrainBrushSize] = useState<1 | 3 | 5 | 7 | 9>(3)
  const [terrainBrushStrength, setTerrainBrushStrength] = useState<1 | 2 | 3 | 4 | 5>(2)
  const [terrainEditableMin, setTerrainEditableMin] = useState(-30)
  const [terrainEditableMax, setTerrainEditableMax] = useState(60)
  const [terrainFlattenTarget, setTerrainFlattenTarget] = useState<number>(SEA_LEVEL_ELEVATION)
  const [terrainHoverPosition, setTerrainHoverPosition] = useState<{ x: number; z: number } | null>(null)
  const [showTerrainModal, setShowTerrainModal] = useState(false)
  const [isImportingRealTerrain, setIsImportingRealTerrain] = useState(false)
  const [realTerrainImportMessage, setRealTerrainImportMessage] = useState<string | null>(null)
  const [terrainImportCoordinatesText, setTerrainImportCoordinatesText] = useState<string>(() =>
    formatCoordinatesText(DEFAULT_CHONCHI_RECTANGLE)
  )
  const [terrainImportSampleStep, setTerrainImportSampleStep] = useState<number>(6)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [addPlacementRotation, setAddPlacementRotation] = useState(0)
  const lastTerrainStrokeKeyRef = useRef<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const history = useEditorHistory()

  // Snapshot inicial para undo
  useEffect(() => {
    history.pushSnapshot({ nodes, areas, connectors })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isEditMode = viewerState.mode === 'edit'
  const activeTerrainTool = terrainEditEnabled && isShiftPressed ? 'smooth' : terrainTool
  const terrainToolLabel = useCallback((tool: 'raise' | 'lower' | 'flatten' | 'smooth' | 'sample') => {
    if (tool === 'raise') return 'Bulldozer (Relleno)'
    if (tool === 'lower') return 'Excavadora (Corte)'
    if (tool === 'flatten') return 'Motoniveladora (Cota)'
    if (tool === 'smooth') return 'Rodillo Compactador'
    return 'Topografo (Muestreo)'
  }, [])
  const clampedTerrainEditableMin = useMemo(
    () => Math.max(MIN_TERRAIN_ELEVATION, Math.min(MAX_TERRAIN_ELEVATION - 1, Math.round(terrainEditableMin))),
    [terrainEditableMin]
  )
  const clampedTerrainEditableMax = useMemo(
    () => Math.min(MAX_TERRAIN_ELEVATION, Math.max(clampedTerrainEditableMin + 1, Math.round(terrainEditableMax))),
    [terrainEditableMax, clampedTerrainEditableMin]
  )
  const clampToEditableTerrainRange = useCallback((value: number) => {
    const hard = clampElevation(value)
    return Math.max(clampedTerrainEditableMin, Math.min(clampedTerrainEditableMax, hard))
  }, [clampedTerrainEditableMin, clampedTerrainEditableMax])

  const handleTerrainEditableMinChange = useCallback((value: number) => {
    const nextMin = Math.max(
      MIN_TERRAIN_ELEVATION,
      Math.min(clampedTerrainEditableMax - 1, Math.round(value))
    )
    setTerrainEditableMin(nextMin)
  }, [clampedTerrainEditableMax])

  const handleTerrainEditableMaxChange = useCallback((value: number) => {
    const nextMax = Math.min(
      MAX_TERRAIN_ELEVATION,
      Math.max(clampedTerrainEditableMin + 1, Math.round(value))
    )
    setTerrainEditableMax(nextMax)
  }, [clampedTerrainEditableMin])

  const applyRecommendedTerrainLimits = useCallback(() => {
    setTerrainEditableMin(-30)
    setTerrainEditableMax(60)
  }, [])

  const terrainElevationLookup = useMemo(() => {
    const map = new Map<string, number>()
    for (const tile of terrainTiles) {
      map.set(`${tile.x},${tile.z}`, tile.elevation)
    }
    return map
  }, [terrainTiles])

  const hoveredTerrainElevation = useMemo(() => {
    if (!terrainHoverPosition) return null
    const x = Math.round(terrainHoverPosition.x)
    const z = Math.round(terrainHoverPosition.z)
    return terrainElevationLookup.get(`${x},${z}`) ?? SEA_LEVEL_ELEVATION
  }, [terrainHoverPosition, terrainElevationLookup])

  const elevationColorForMeter = useCallback((meter: number) => {
    const bounded = clampElevation(meter)
    const normalized = (bounded - MIN_TERRAIN_ELEVATION) / (MAX_TERRAIN_ELEVATION - MIN_TERRAIN_ELEVATION)
    const hue = 220 * (1 - normalized) // Azul (-50) -> Rojo (+200)
    const saturation = 86
    let lightness = 49

    // Banding suave por metro para distinguir capas.
    lightness += Math.abs(bounded) % 2 === 0 ? 4 : -3
    lightness = Math.max(22, Math.min(72, lightness))

    return `hsl(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%)`
  }, [])

  const terrainRulerGradient = useMemo(() => {
    const steps: string[] = []
    const range = MAX_TERRAIN_ELEVATION - MIN_TERRAIN_ELEVATION
    for (let meter = MIN_TERRAIN_ELEVATION; meter <= MAX_TERRAIN_ELEVATION; meter += 1) {
      const pct = ((meter - MIN_TERRAIN_ELEVATION) / range) * 100
      steps.push(`${elevationColorForMeter(meter)} ${pct.toFixed(2)}%`)
    }
    return `linear-gradient(to top, ${steps.join(', ')})`
  }, [elevationColorForMeter])

  const terrainRulerMarks = useMemo(() => {
    const values = [
      MIN_TERRAIN_ELEVATION,
      clampedTerrainEditableMin,
      SEA_LEVEL_ELEVATION,
      clampedTerrainEditableMax,
      MAX_TERRAIN_ELEVATION,
    ]
    return Array.from(new Set(values)).sort((a, b) => a - b)
  }, [clampedTerrainEditableMin, clampedTerrainEditableMax])

  useEffect(() => {
    setTerrainFlattenTarget((prev) => clampToEditableTerrainRange(prev))
  }, [clampToEditableTerrainRange])
  const effectiveAddType = useMemo<MapNode['type']>(() => {
    if (buildMode === 'structures') return 'building'
    if (buildMode === 'elements' && addEquipmentType === 'building') return 'pump'
    return addEquipmentType
  }, [buildMode, addEquipmentType])

  const availableAddTypes = useMemo(() => {
    if (buildMode === 'structures') return STRUCTURE_NODE_TYPES
    if (buildMode === 'elements') return ELEMENT_NODE_TYPES
    return []
  }, [buildMode])

  useEffect(() => {
    if (buildMode === 'terrain') {
      setTerrainEditEnabled(true)
      return
    }

    setTerrainEditEnabled(false)
    if (buildMode === 'structures' && addEquipmentType !== 'building') {
      setAddEquipmentType('building')
    }
    if (buildMode === 'elements' && addEquipmentType === 'building') {
      setAddEquipmentType('pump')
    }
  }, [buildMode, addEquipmentType])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setIsShiftPressed(true)

      if (
        isEditMode &&
        event.key === 'Escape' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)
      ) {
        event.preventDefault()
        setEditorTool('select')
        overlayState.closeOverlayIf('add-equipment')
      }

      if (
        isEditMode &&
        editorTool === 'add' &&
        buildMode !== 'terrain' &&
        (event.key === 'r' || event.key === 'R') &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)
      ) {
        event.preventDefault()
        setAddPlacementRotation((prev) => (prev + 90) % 360)
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setIsShiftPressed(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [isEditMode, editorTool, buildMode, overlayState])

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
    let filtered = nodes

    if (isEditMode && buildMode === 'structures') {
      filtered = filtered.filter((node) => STRUCTURE_NODE_TYPES.includes(node.type))
    }

    if (isEditMode && buildMode === 'elements') {
      filtered = filtered.filter((node) => ELEMENT_NODE_TYPES.includes(node.type))
    }

    if (showOnlyActiveAreaEquipment && selectedAreaId) {
      filtered = filtered.filter((node) => node.linkedAreaId === selectedAreaId)
    }

    if (filtered.length === nodes.length) return undefined
    return new Set(filtered.map((node) => node.id))
  }, [nodes, isEditMode, buildMode, showOnlyActiveAreaEquipment, selectedAreaId])

  const managedAreas = useMemo(() => {
    const base = areaManagerFloor === 'all'
      ? areas
      : areas.filter((area) => (area.floor ?? SEA_LEVEL_ELEVATION) === areaManagerFloor)
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
    const floorNodes = nodes.filter((n) => (n.floor ?? SEA_LEVEL_ELEVATION) === viewerState.currentFloor)
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

    const floorAreas = areas.filter((a) => (a.floor ?? SEA_LEVEL_ELEVATION) === viewerState.currentFloor)
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
    const normalizedFloor = clampElevation(floor)
    setViewerState((prev) => ({
      ...prev,
      currentFloor: normalizedFloor,
    }))
    setSelectedAreaId(null)
  }, [])

  // Focus en un nodo (centrar cámara + seleccionar)
  const handleFocusNode = useCallback((_nodeId: string, position: { x: number; z: number }) => {
    setViewerState((prev) => ({
      ...prev,
      panOffset: { x: position.x, z: position.z },
      zoom: prev.zoom,
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
  const draggedDuringPan = useRef(false)
  const suppressClickUntil = useRef(0)

  const applyScreenPanDelta = useCallback((state: IsometricViewerState, dx: number, dy: number) => {
    const sensitivity = Math.min(0.55, Math.max(0.04, state.zoom / 600))

    const azimuth = CAMERA_ANGLE_AZIMUTH[state.cameraAngle]
    const rightX = Math.cos(azimuth)
    const rightZ = -Math.sin(azimuth)
    const forwardX = -Math.sin(azimuth)
    const forwardZ = -Math.cos(azimuth)

    const panDeltaX = (-dx * rightX + dy * forwardX) * sensitivity
    const panDeltaZ = (-dx * rightZ + dy * forwardZ) * sensitivity

    return {
      ...state,
      panOffset: {
        x: state.panOffset.x + panDeltaX,
        z: state.panOffset.z + panDeltaZ,
      },
    }
  }, [])

  const handlePointerDownPan = useCallback((e: React.PointerEvent) => {
    if (isEditMode && terrainEditEnabled) {
      lastTerrainStrokeKeyRef.current = null
      return
    }

    const targetEl = e.target as HTMLElement | null
    const isUiControl = !!targetEl?.closest('button,input,textarea,select,a,[role="button"],[data-no-pan="true"]')
    if (isUiControl) return

    // Left button (0)
    if (e.button !== 0) return

    e.preventDefault()
    isPanning.current = true
    draggedDuringPan.current = false
    panStart.current = { x: e.clientX, y: e.clientY }
    targetEl?.setPointerCapture(e.pointerId)
  }, [isEditMode, terrainEditEnabled])

  const handlePointerMovePan = useCallback((e: React.PointerEvent) => {
    if (isEditMode && terrainEditEnabled) return

    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      draggedDuringPan.current = true
    }

    panStart.current = { x: e.clientX, y: e.clientY }

    setViewerState((prev) => applyScreenPanDelta(prev, dx, dy))
  }, [applyScreenPanDelta, isEditMode, terrainEditEnabled])

  const handlePointerUpPan = useCallback((e: React.PointerEvent) => {
    lastTerrainStrokeKeyRef.current = null

    if (isPanning.current) {
      isPanning.current = false
      if (draggedDuringPan.current) {
        suppressClickUntil.current = Date.now() + 220
      }
      draggedDuringPan.current = false
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    }
  }, [])

  const isClickSuppressedAfterDrag = useCallback(() => Date.now() < suppressClickUntil.current, [])

  // ── Pan con teclado (flechas) ──
  const arrowHoldStartRef = useRef<number | null>(null)
  const arrowHoldKeyRef = useRef<'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | null>(null)

  useEffect(() => {
    const isArrowKey = (key: string): key is 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' =>
      key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'

    const handleArrowPan = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLSelectElement) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return

      const key = e.key
      if (!isArrowKey(key)) return
      e.preventDefault()

      if (!e.repeat || arrowHoldKeyRef.current !== key) {
        arrowHoldKeyRef.current = key
        arrowHoldStartRef.current = Date.now()
      }

      const elapsedMs = arrowHoldStartRef.current ? Date.now() - arrowHoldStartRef.current : 0
      const acceleration = Math.min(3, 1 + elapsedMs / 450)
      const keyPixels = 22 * acceleration

      // Mapeo base de flechas (dirección intuitiva)
      const virtualDx = key === 'ArrowLeft' ? -keyPixels : key === 'ArrowRight' ? keyPixels : 0
      const virtualDy = key === 'ArrowUp' ? -keyPixels : key === 'ArrowDown' ? keyPixels : 0

      setViewerState((prev) => {
        return applyScreenPanDelta(prev, virtualDx, virtualDy)
      })
    }

    const handleArrowUp = (e: KeyboardEvent) => {
      if (!isArrowKey(e.key)) return
      if (arrowHoldKeyRef.current === e.key) {
        arrowHoldKeyRef.current = null
        arrowHoldStartRef.current = null
      }
    }

    window.addEventListener('keydown', handleArrowPan)
    window.addEventListener('keyup', handleArrowUp)
    return () => {
      window.removeEventListener('keydown', handleArrowPan)
      window.removeEventListener('keyup', handleArrowUp)
    }
  }, [applyScreenPanDelta])

  // ── Handlers de nodos ──
  const handleDeleteNodeById = useCallback((nodeId: string) => {
    const newNodes = nodes.filter((node) => node.id !== nodeId)
    if (newNodes.length === nodes.length) return

    const newConnectors = connectors.filter(
      (connector) => connector.fromNodeId !== nodeId && connector.toNodeId !== nodeId
    )

    setNodes(newNodes)
    setConnectors(newConnectors)
    setHasUnsavedChanges(true)
    history.pushSnapshot({
      nodes: newNodes,
      areas,
      connectors: newConnectors,
    })
    setViewerState((prev) => ({ ...prev, selectedNodeId: null }))
  }, [nodes, connectors, areas, history])

  const handleNodeClick = useCallback((nodeId: string) => {
    if (isClickSuppressedAfterDrag()) return

    if (isEditMode && editorTool === 'bulldozer') {
      handleDeleteNodeById(nodeId)
      setEditorTool('select')
      return
    }

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
  }, [nodes, viewerState.selectedNodeId, isClickSuppressedAfterDrag, isEditMode, editorTool, handleDeleteNodeById])

  const handleNodeHover = useCallback((nodeId: string | null) => {
    const node = nodeId ? nodes.find((n) => n.id === nodeId) : null
    setViewerState((prev) => ({
      ...prev,
      hoveredNodeId: nodeId,
    }))
    setHoveredAreaId(node?.linkedAreaId ?? null)
  }, [nodes])

  const handleBackgroundClick = useCallback(() => {
    if (isClickSuppressedAfterDrag()) return

    setViewerState((prev) => ({
      ...prev,
      selectedNodeId: null,
    }))
    setSelectedAreaId(null)
    setHoveredAreaId(null)
  }, [isClickSuppressedAfterDrag])

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
    (nodeId: string, newPosition: { x: number; y: number; z: number }, options?: { duplicate?: boolean }) => {
      const sourceNode = nodes.find((node) => node.id === nodeId)
      if (!sourceNode) return

      if (options?.duplicate) {
        const targetArea = resolveAreaAtPosition(newPosition.x, newPosition.z, viewerState.currentFloor)
        const duplicatedNode: MapNode = {
          ...sourceNode,
          id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          label: `${sourceNode.label} (copia)`,
          position: newPosition,
          linkedAreaId: targetArea?.id,
        }
        commitEditorChange([...nodes, duplicatedNode])
        setViewerState((prev) => ({ ...prev, selectedNodeId: duplicatedNode.id }))
        return
      }

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
      const newNodes = nodes.map((n) => {
        if (n.id !== nodeId) return n

        const hasFloorUpdate = Object.prototype.hasOwnProperty.call(updates, 'floor')
        const incomingFloor = updates.floor
        const incomingY = updates.position?.y

        const resolvedElevation = hasFloorUpdate && typeof incomingFloor === 'number'
          ? clampElevation(incomingFloor)
          : typeof incomingY === 'number'
            ? clampElevation(incomingY)
            : clampElevation(n.floor ?? n.position.y ?? SEA_LEVEL_ELEVATION)

        const mergedPosition = {
          ...n.position,
          ...(updates.position ?? {}),
          y: resolvedElevation,
        }

        return {
          ...n,
          ...updates,
          floor: resolvedElevation,
          position: mergedPosition,
        }
      })
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
    if (isClickSuppressedAfterDrag()) return

    const area = areas.find((a) => a.id === areaId)
    if (!area) return

    setSelectedAreaId(areaId)

    if (isEditMode) {
      openAreaEditor(area)
      return
    }

    setViewerState((prev) => ({
      ...prev,
      currentFloor: area.floor ?? SEA_LEVEL_ELEVATION,
      filters: { ...prev.filters, showAreas: true },
      panOffset: { x: area.position.x, z: area.position.z },
      zoom: prev.zoom,
    }))
  }, [areas, isEditMode, openAreaEditor, isClickSuppressedAfterDrag])

  const applyTerrainBrushAt = useCallback((position: { x: number; z: number }, source: 'click' | 'drag') => {
    if (!isEditMode || !terrainEditEnabled) return

    if (activeTerrainTool === 'sample') {
      if (source !== 'click') return
      const x = Math.round(position.x)
      const z = Math.round(position.z)
      const key = `${x},${z}`
      const sampled = terrainTiles.find((tile) => `${tile.x},${tile.z}` === key)?.elevation ?? SEA_LEVEL_ELEVATION
      setTerrainFlattenTarget(clampToEditableTerrainRange(sampled))
      setTerrainTool('flatten')
      return
    }

    const centerX = Math.round(position.x)
    const centerZ = Math.round(position.z)
    const strokeKey = `${centerX},${centerZ}|${activeTerrainTool}|${terrainBrushSize}|${terrainBrushStrength}|${terrainFlattenTarget}`

    if (source === 'drag' && lastTerrainStrokeKeyRef.current === strokeKey) return
    lastTerrainStrokeKeyRef.current = strokeKey

    setTerrainTiles((prev) => {
      const sourceMap = new Map<string, number>()
      for (const tile of prev) {
        sourceMap.set(`${tile.x},${tile.z}`, tile.elevation)
      }

      const map = new Map(sourceMap)

      const radius = Math.floor(terrainBrushSize / 2)
      let changed = false

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const distance = Math.sqrt(dx * dx + dz * dz)
          if (distance > radius + 0.001) continue

          const normalizedDistance = radius === 0 ? 0 : distance / (radius + 0.35)
          const falloff = radius === 0 ? 1 : Math.pow(Math.max(0, 1 - normalizedDistance), 1.5)
          if (falloff <= 0) continue

          const x = centerX + dx
          const z = centerZ + dz
          const key = `${x},${z}`
          const currentElevation = sourceMap.get(key) ?? SEA_LEVEL_ELEVATION

          let targetElevation = currentElevation
          if (activeTerrainTool === 'raise') {
            const delta = Math.max(1, Math.round(terrainBrushStrength * falloff))
            targetElevation = clampToEditableTerrainRange(currentElevation + delta)
          } else if (activeTerrainTool === 'lower') {
            const delta = Math.max(1, Math.round(terrainBrushStrength * falloff))
            targetElevation = clampToEditableTerrainRange(currentElevation - delta)
          } else if (activeTerrainTool === 'flatten') {
            // Motoniveladora: corta/rellena directo a cota objetivo.
            targetElevation = clampToEditableTerrainRange(terrainFlattenTarget)
          } else {
            const smoothRadius = terrainBrushSize >= 7 ? 2 : 1
            let weightedSum = 0
            let totalWeight = 0
            for (let nx = -smoothRadius; nx <= smoothRadius; nx++) {
              for (let nz = -smoothRadius; nz <= smoothRadius; nz++) {
                const nDistance = Math.sqrt(nx * nx + nz * nz)
                if (nDistance > smoothRadius + 0.001) continue
                const weight = 1 / (1 + nDistance)
                const nKey = `${x + nx},${z + nz}`
                weightedSum += (sourceMap.get(nKey) ?? SEA_LEVEL_ELEVATION) * weight
                totalWeight += weight
              }
            }
            const avg = totalWeight > 0
              ? weightedSum / totalWeight
              : currentElevation
            const smoothBlend = Math.min(1, 0.22 * terrainBrushStrength * (0.4 + falloff))
            targetElevation = clampToEditableTerrainRange(Math.round(currentElevation + (avg - currentElevation) * smoothBlend))
          }

          if (targetElevation === currentElevation) continue
          changed = true

          if (targetElevation === SEA_LEVEL_ELEVATION) {
            map.delete(key)
          } else {
            map.set(key, targetElevation)
          }
        }
      }

      if (!changed) return prev

      setHasUnsavedChanges(true)
      return Array.from(map.entries()).map(([key, elevation]) => {
        const [xs, zs] = key.split(',')
        return { x: Number(xs), z: Number(zs), elevation }
      })
    })
  }, [
    isEditMode,
    terrainEditEnabled,
    activeTerrainTool,
    terrainBrushSize,
    terrainBrushStrength,
    terrainFlattenTarget,
    terrainTiles,
    clampToEditableTerrainRange,
  ])

  const handleFloorHover = useCallback((position: { x: number; z: number } | null) => {
    setTerrainHoverPosition(position)
  }, [])

  const handleImportRealTerrain = useCallback(async () => {
    if (isImportingRealTerrain) return

    setIsImportingRealTerrain(true)
    setRealTerrainImportMessage('Validando coordenadas y consultando elevaciones...')

    try {
      const corners = parseCoordinatesText(terrainImportCoordinatesText)
      const steps = Array.from(new Set([terrainImportSampleStep, 8, 12]))

      let result: Awaited<ReturnType<typeof importTerrainFromRectangle>> | null = null
      let lastError: unknown = null

      for (const step of steps) {
        try {
          setRealTerrainImportMessage(`Consultando elevaciones (paso ${step}m)...`)
          result = await importTerrainFromRectangle({
            config: demoData.config,
            corners,
            sampleStep: step,
            keepSeaLevelTiles: false,
          })
          break
        } catch (error) {
          lastError = error
          if (error instanceof TerrainImportHttpError && error.status === 429) {
            continue
          }
          throw error
        }
      }

      if (!result) {
        throw lastError instanceof Error ? lastError : new Error('No fue posible importar el terreno')
      }

      setTerrainTiles(result.tiles)
      setHasUnsavedChanges(true)

      setTerrainEditableMin((prev) => Math.max(MIN_TERRAIN_ELEVATION, Math.min(prev, Math.floor(result.minElevation) - 2)))
      setTerrainEditableMax((prev) => Math.min(MAX_TERRAIN_ELEVATION, Math.max(prev, Math.ceil(result.maxElevation) + 2)))
      setTerrainFlattenTarget(clampElevation(Math.round((result.minElevation + result.maxElevation) / 2)))

      setRealTerrainImportMessage(
        `Malla real aplicada: ${result.tiles.length} celdas, rango ${result.minElevation}m a ${result.maxElevation}m.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible importar terreno real'
      setRealTerrainImportMessage(`Error importando terreno: ${message}`)
    } finally {
      setIsImportingRealTerrain(false)
    }
  }, [isImportingRealTerrain, terrainImportCoordinatesText, terrainImportSampleStep, demoData.config])

  const handleFloorDrag = useCallback((position: { x: number; z: number }) => {
    applyTerrainBrushAt(position, 'drag')
  }, [applyTerrainBrushAt])

  const findNodeAtPosition = useCallback((position: { x: number; z: number }) => {
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index]
      if (!node) continue
      const nodeFloor = clampElevation(node.floor ?? node.position.y ?? SEA_LEVEL_ELEVATION)
      if (nodeFloor !== viewerState.currentFloor) continue

      const halfWidth = node.size.width / 2
      const halfDepth = node.size.depth / 2
      if (
        position.x >= node.position.x - halfWidth &&
        position.x <= node.position.x + halfWidth &&
        position.z >= node.position.z - halfDepth &&
        position.z <= node.position.z + halfDepth
      ) {
        return node
      }
    }
    return null
  }, [nodes, viewerState.currentFloor])

  const placementPreview = useMemo(() => {
    if (!isEditMode || editorTool !== 'add') return null
    if (buildMode === 'terrain') return null
    if (!terrainHoverPosition) return null

    const candidateSize = getDefaultSize(effectiveAddType)
    const rotatedFootprint = getRotatedFootprint(candidateSize, addPlacementRotation)
    const snappedPlacement = getSmartSnappedPlacement(
      terrainHoverPosition,
      rotatedFootprint,
      viewerState.currentFloor,
      nodes,
      snapEnabled
    )
    const snappedPosition = snappedPlacement.position

    const collides = nodes.some((node) => {
      const nodeFloor = clampElevation(node.floor ?? node.position.y ?? SEA_LEVEL_ELEVATION)
      if (nodeFloor !== viewerState.currentFloor) return false
      return isOverlapping2D(
        {
          x: snappedPosition.x,
          z: snappedPosition.z,
          width: rotatedFootprint.width,
          depth: rotatedFootprint.depth,
        },
        {
          x: node.position.x,
          z: node.position.z,
          width: node.size.width,
          depth: node.size.depth,
        }
      )
    })

    return {
      position: snappedPosition,
      floor: viewerState.currentFloor,
      size: {
        ...candidateSize,
        width: rotatedFootprint.width,
        depth: rotatedFootprint.depth,
      },
      rotation: addPlacementRotation,
      valid: !collides,
      snapGuides: snappedPlacement.guides,
    }
  }, [isEditMode, editorTool, buildMode, terrainHoverPosition, effectiveAddType, nodes, viewerState.currentFloor, addPlacementRotation, snapEnabled])

  const handleFloorClick = useCallback(
    (position: { x: number; z: number }) => {
      if (isClickSuppressedAfterDrag()) return

      if (isEditMode && buildMode === 'terrain' && terrainEditEnabled) {
        applyTerrainBrushAt(position, 'click')
        return
      }

      if (isEditMode && editorTool === 'bulldozer') {
        const targetNode = findNodeAtPosition(position)
        if (targetNode) {
          handleDeleteNodeById(targetNode.id)
          setEditorTool('select')
        }
        return
      }

      const placementPosition = placementPreview?.position ?? position
      const areaAtPoint = resolveAreaAtPosition(placementPosition.x, placementPosition.z, viewerState.currentFloor)
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

      if (!placementPreview?.valid) {
        return
      }

      // Crear nuevo nodo en la posición donde se hizo click
      const newNode: MapNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        label: `${EQUIPMENT_TYPE_LABELS[effectiveAddType]} nuevo`,
        type: effectiveAddType,
        position: { x: placementPosition.x, y: viewerState.currentFloor, z: placementPosition.z },
        size: getDefaultSize(effectiveAddType),
        rotation: addPlacementRotation,
        floor: viewerState.currentFloor,
        linkedAreaId: areaAtPoint?.id,
        visible: true,
      }

      handleAddNode(newNode)
      setEditorTool('select')
    },
    [
      paintAreaTileAt,
      editorTool,
      effectiveAddType,
      handleAddNode,
      resolveAreaAtPosition,
      viewerState.currentFloor,
      isClickSuppressedAfterDrag,
      isEditMode,
      buildMode,
      findNodeAtPosition,
      handleDeleteNodeById,
      placementPreview?.position,
      placementPreview?.valid,
      addPlacementRotation,
      terrainEditEnabled,
      applyTerrainBrushAt,
      setEditorTool,
    ]
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
          terrain: terrainTiles,
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
  }, [isSaving, nodes, connectors, areas, terrainTiles, demoData.config, user])

  const handleCancelEdit = useCallback(() => {
    // Revertir a lienzo limpio si hay cambios sin guardar
    if (hasUnsavedChanges) {
      setNodes([])
      setAreas([])
      setConnectors([])
      setTerrainTiles([])
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

  const startAddEquipmentFlow = useCallback(() => {
    closeAreaEditor()
    if (buildMode === 'terrain') {
      setBuildMode('elements')
    }
    setEditorTool('add')
    overlayState.openOverlay('add-equipment')
  }, [closeAreaEditor, overlayState, buildMode])

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
            Vista 3D de la planta — Rotar: Q/E · Zoom: scroll · Pan: arrastrar clic izquierdo o flechas · Reset: R
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/map/view')}
          >
            <Layers className="h-4 w-4" />
            Vista 2D
          </Button>
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
            {formatElevationLabel(viewerState.currentFloor)}
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
                terrain={terrainTiles}
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
                onFloorDrag={handleFloorDrag}
                onFloorHover={handleFloorHover}
                terrainBrushPreview={terrainEditEnabled && terrainHoverPosition
                  ? {
                      center: terrainHoverPosition,
                      size: terrainBrushSize,
                      mode: activeTerrainTool,
                    }
                  : null}
                placementPreview={placementPreview}
                bulldozerPreview={isEditMode && editorTool === 'bulldozer' && terrainHoverPosition
                  ? { x: terrainHoverPosition.x, z: terrainHoverPosition.z }
                  : null}
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
                  startAddEquipmentFlow()
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
                  startAddEquipmentFlow()
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
                {terrainEditEnabled && (
                  <Badge variant="default" className="ml-2 bg-emerald-600 text-white gap-1 text-xs">
                    Terreno {terrainToolLabel(activeTerrainTool)}
                  </Badge>
                )}
                {terrainEditEnabled && (
                  <Badge variant="outline" className="ml-2 text-xs bg-background/90">
                    Tope edición: {clampedTerrainEditableMin}m a +{clampedTerrainEditableMax}m
                  </Badge>
                )}
                {terrainEditEnabled && hoveredTerrainElevation !== null && (
                  <Badge variant="outline" className="ml-2 text-xs bg-background/90">
                    Cota brocha: {hoveredTerrainElevation > 0 ? `+${hoveredTerrainElevation}` : hoveredTerrainElevation}m
                  </Badge>
                )}
                {isEditMode && (
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {buildMode === 'terrain' ? 'Modo Terreno' : buildMode === 'structures' ? 'Modo Estructuras' : 'Modo Elementos'}
                  </Badge>
                )}
              </div>
            )}

            {/* Sims-like Build Dock (centro inferior) */}
            {isEditMode && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
                <div className="bg-card/95 backdrop-blur rounded-xl border shadow-2xl p-2 min-w-[560px]">
                  <div className="grid grid-cols-3 gap-1 mb-2">
                    <Button
                      size="sm"
                      variant={buildMode === 'terrain' ? 'default' : 'outline'}
                      className="h-8 text-xs"
                      onClick={() => setBuildMode('terrain')}
                    >
                      Terreno
                    </Button>
                    <Button
                      size="sm"
                      variant={buildMode === 'structures' ? 'default' : 'outline'}
                      className="h-8 text-xs"
                      onClick={() => setBuildMode('structures')}
                    >
                      Estructuras
                    </Button>
                    <Button
                      size="sm"
                      variant={buildMode === 'elements' ? 'default' : 'outline'}
                      className="h-8 text-xs"
                      onClick={() => setBuildMode('elements')}
                    >
                      Elementos
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    {buildMode === 'terrain' ? (
                      <>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            setTerrainEditEnabled(true)
                            setShowTerrainModal(true)
                          }}
                        >
                          Editor de terreno
                        </Button>
                        <Badge variant="outline" className="text-[10px]">Brocha {terrainBrushSize}×{terrainBrushSize}</Badge>
                        <Badge variant="outline" className="text-[10px]">Intensidad {terrainBrushStrength}</Badge>
                        <Badge variant="outline" className="text-[10px]">Topes {clampedTerrainEditableMin} / +{clampedTerrainEditableMax}m</Badge>
                        <Badge variant="outline" className="text-[10px]">{terrainToolLabel(activeTerrainTool)}</Badge>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={startAddEquipmentFlow}
                        >
                          {buildMode === 'structures' ? 'Agregar estructura' : 'Agregar elemento'}
                        </Button>
                        <Button
                          size="sm"
                          variant={editorTool === 'bulldozer' ? 'destructive' : 'outline'}
                          className="h-8 text-xs"
                          onClick={() => setEditorTool((tool) => (tool === 'bulldozer' ? 'select' : 'bulldozer'))}
                        >
                          Bulldozer
                        </Button>
                        <Badge variant="outline" className="text-[10px]">
                          {buildMode === 'structures' ? 'Solo edificios' : 'Máquinas y equipos'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">Rotación {addPlacementRotation}° (R)</Badge>
                      </>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs ml-auto"
                      onClick={() => overlayState.openOverlay('area-manager')}
                    >
                      Áreas
                    </Button>
                  </div>
                </div>
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
                <p className="text-[10px] text-muted-foreground font-medium px-1 mb-1">NIVEL (m)</p>
                <div className="flex items-center gap-1 mb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setFloor(viewerState.currentFloor - 1)}
                    title="Bajar 1 metro"
                  >
                    -1
                  </Button>
                  <input
                    type="number"
                    min={MIN_TERRAIN_ELEVATION}
                    max={MAX_TERRAIN_ELEVATION}
                    step={1}
                    value={viewerState.currentFloor}
                    onChange={(e) => setFloor(parseFloat(e.target.value) || SEA_LEVEL_ELEVATION)}
                    className="w-20 h-7 text-xs bg-muted border rounded px-2 text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setFloor(viewerState.currentFloor + 1)}
                    title="Subir 1 metro"
                  >
                    +1
                  </Button>
                </div>
                <div className="flex flex-col gap-0.5">
                  {ELEVATION_OPTIONS.map(({ floor, full }) => (
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

              {/* Panel auxiliar compacto (modo editor) */}
              {isEditMode && (
                <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border p-2 flex flex-col gap-2 w-[260px]">
                  <p className="text-[10px] text-muted-foreground font-medium px-1">PANELES</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs justify-start"
                    onClick={() => overlayState.openOverlay('area-manager')}
                  >
                    <Settings2 className="h-3.5 w-3.5 mr-1" />
                    Gestionar áreas
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs justify-start"
                    onClick={() => setViewerState((prev) => ({
                      ...prev,
                      filters: { ...prev.filters, showAreas: !prev.filters.showAreas },
                    }))}
                  >
                    {viewerState.filters.showAreas ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                    {viewerState.filters.showAreas ? 'Ocultar áreas' : 'Mostrar áreas'}
                  </Button>
                </div>
              )}

              {/* Regla de elevación con gradiente negativo/positivo */}
              {isEditMode && buildMode === 'terrain' && (
                <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border p-2 w-[260px]">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-muted-foreground font-medium">REGLA DE METROS</p>
                    <Badge variant="outline" className="text-[10px]">-50m / +200m</Badge>
                  </div>
                  <div className="relative h-44 rounded border overflow-hidden" style={{ background: terrainRulerGradient }}>
                    <div
                      className="absolute left-0 right-0 border-y border-white/60 bg-white/10"
                      style={{
                        bottom: `${((clampedTerrainEditableMin - MIN_TERRAIN_ELEVATION) / (MAX_TERRAIN_ELEVATION - MIN_TERRAIN_ELEVATION)) * 100}%`,
                        height: `${((clampedTerrainEditableMax - clampedTerrainEditableMin) / (MAX_TERRAIN_ELEVATION - MIN_TERRAIN_ELEVATION)) * 100}%`,
                      }}
                    />
                    {terrainRulerMarks.map((value) => {
                      const pct = ((value - MIN_TERRAIN_ELEVATION) / (MAX_TERRAIN_ELEVATION - MIN_TERRAIN_ELEVATION)) * 100
                      const isEditableBound = value === clampedTerrainEditableMin || value === clampedTerrainEditableMax
                      return (
                        <div key={value} className="absolute left-0 right-0" style={{ bottom: `${pct}%` }}>
                          <div className={cn('border-t', isEditableBound ? 'border-white/90' : 'border-white/45')} />
                          <span className={cn('absolute right-1 -top-2 text-[10px] font-mono px-1 rounded bg-black/45 text-white', isEditableBound && 'bg-primary/80')}>
                            {value > 0 ? `+${value}` : value}m
                          </span>
                        </div>
                      )
                    })}
                  </div>
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
                ? 'V: seleccionar · M: mover · A: agregar · B: bulldozer · R: rotar preview · Alt+drag: duplicar · Del: eliminar · Ctrl+Z: deshacer'
                : 'Q/E: rotar · Scroll: zoom · Arrastrar clic izq/Flechas: paneo · R: reset · Click: seleccionar'}
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
                  startAddEquipmentFlow()
                }}
                onClose={closeAreaEditor}
              />
            )}

            <TerrainEditorModal
              isOpen={showTerrainModal}
              onOpenChange={setShowTerrainModal}
              terrainEditEnabled={terrainEditEnabled}
              onToggleTerrainEdit={() => {
                setBuildMode('terrain')
                setTerrainEditEnabled((value) => !value)
              }}
              tool={terrainTool}
              onToolChange={setTerrainTool}
              brushSize={terrainBrushSize}
              onBrushSizeChange={setTerrainBrushSize}
              brushStrength={terrainBrushStrength}
              onBrushStrengthChange={setTerrainBrushStrength}
              editableMin={clampedTerrainEditableMin}
              editableMax={clampedTerrainEditableMax}
              onEditableMinChange={handleTerrainEditableMinChange}
              onEditableMaxChange={handleTerrainEditableMaxChange}
              onApplyRecommendedLimits={applyRecommendedTerrainLimits}
              flattenTarget={terrainFlattenTarget}
              onFlattenTargetChange={(value) => setTerrainFlattenTarget(clampToEditableTerrainRange(value))}
              isImportingRealTerrain={isImportingRealTerrain}
              onImportRealTerrain={() => {
                void handleImportRealTerrain()
              }}
              realTerrainImportMessage={realTerrainImportMessage}
              terrainImportCoordinatesText={terrainImportCoordinatesText}
              onTerrainImportCoordinatesTextChange={setTerrainImportCoordinatesText}
              terrainImportSampleStep={terrainImportSampleStep}
              onTerrainImportSampleStepChange={setTerrainImportSampleStep}
            />

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
                      {ELEVATION_OPTIONS.map(({ floor, full }) => (
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
                                {formatElevationLabel(area.floor ?? SEA_LEVEL_ELEVATION)} · {area.tiles?.length ?? 0} tiles
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
                                    currentFloor: area.floor ?? SEA_LEVEL_ELEVATION,
                                    panOffset: { x: area.position.x, z: area.position.z },
                                    zoom: prev.zoom,
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
        allowedTypes={availableAddTypes}
        title={buildMode === 'structures' ? 'Agregar estructura' : buildMode === 'elements' ? 'Agregar elemento' : 'Agregar'}
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
