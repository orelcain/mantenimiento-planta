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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize,
  Minimize2,
  AlertTriangle,
  X,
  Eye,
  EyeOff,
  Compass,
  Activity,
  Layers,
  Pencil,
  Eye as EyeIcon,
  Building2,
  Trash2,
  Settings2,
  MapPin,
  Ruler,
  BarChart3,
} from 'lucide-react'
import {
  Card,
  CardContent,
  Input,
} from '@/components/ui'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAppStore, useIsAdmin } from '@/store'
import { cn } from '@/lib/utils'
import { generateDemoMap, getIsometricMaps, saveIsometricMap } from '@/services/isometricMap'
import { getLatestMapVersion, getMapLocations } from '@/services/maps'
import type { CameraAngle, IsometricViewerState, MapNode, MapArea, TerrainTile, BuildEditMode, MapConnector as MapConnectorType, IsometricMap, IsometricMapConfig } from '@/types/isometricMap'
import type { MapLocation } from '@/types/maps'
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
import { useAuthStore } from '@/store'
import {
  DEFAULT_CHONCHI_RECTANGLE,
  estimateTerrainImportPreview,
  TerrainImportHttpError,
  type TerrainImportProgress,
  type TerrainGeoBounds,
  formatCoordinatesText,
  getAutoExpandedMapConfig,
  gridToGeo,
  importTerrainFromRectangle,
  parseCoordinatesText,
} from '@/lib/terrainImport'

type BackgroundCalibrationMode = 'move' | 'scale' | 'rotate'
type BackgroundDisplayMode = NonNullable<NonNullable<IsometricMap['backgroundMap']>['displayMode']>
type MapWorkspaceStage = 'terrain-base' | 'editor'

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
import { TerrainBaseWorkspace } from '@/components/map/isometric/workspace/TerrainBaseWorkspace'
import { useEditorOverlayState } from '@/components/map/isometric/editor/useEditorOverlayState'
import { getAreaAtPosition, normalizeNodeForArea } from '@/components/map/isometric/editor/areaAssociation'
import { useMapEditorActions } from '@/components/map/isometric/editor/useMapEditorActions'
import { useAreaEditorFlow } from '@/components/map/isometric/editor/useAreaEditorFlow'
import { CompassWidget } from '@/components/map/isometric/CompassWidget'
import { Minimap } from '@/components/map/isometric/Minimap'
import { MapStatsPanel } from '@/components/map/isometric/MapStatsPanel'

const ELEVATION_OPTIONS = ELEVATION_PRESET_LEVELS.map((level) => ({
  floor: level,
  full: formatElevationLabel(level),
}))

/**
 * ─── Feature flags ───
 * Controlamos qué se muestra. Empezamos con lo mínimo (solo importación del mapa).
 * A medida que vayamos necesitando cada función, la activamos aquí.
 * Al final quitamos todo lo que no sirve.
 */
const FEATURES = {
  vista2d: false,              // Header: botón "Vista 2D"
  workspaceToggle: false,      // Header: cambiar base↔editor, botón editar mapa
  headerBadges: false,         // Header: badges cámara, piso, zoom
  statusLegendCard: false,     // Card selector mapas, nombre, desc, calibración plano
  statusSummary: false,        // Card leyenda estados equipos
  editorToolbar: false,        // Toolbar superior editor (tools, undo/redo, save)
  editorBadge: false,          // Badge "MODO EDITOR" + info terreno
  buildDock: false,            // Dock inferior Sims (terrain/structures/elements)
  equipmentToggle: false,      // Botón toggle ocultar/mostrar equipos
  floorSelector: false,        // Selector de piso en metros
  auxPanel: false,             // Panel auxiliar editor (gestionar áreas)
  elevationRuler: false,       // Regla gradiente de elevación
  searchPanel: false,          // Buscador de nodos/áreas
  nodeInfoCard: false,         // Info nodo seleccionado en modo vista
  propertiesPanel: false,      // Panel propiedades nodo en modo editor
  helpHint: false,             // Atajos de teclado
  areaEditor: false,           // Editor áreas por tiles
  terrainEditorModal: false,   // Modal editor de terreno
  areaManager: false,          // Gestor modal de áreas
  addEquipmentDialog: false,   // Diálogo agregar equipo
  linkEntityDialog: false,     // Diálogo vincular entidad
  shapeEditorDialog: false,    // Editor de forma 3D
} as const

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

const BLANK_MAP_WIDTH_METERS = 600
const BLANK_MAP_DEPTH_METERS = 500
const FIT_PADDING_METERS = 20
const FIT_ISO_FACTOR = 1.45

function createBlankMapConfig(base: IsometricMapConfig): IsometricMapConfig {
  return {
    ...base,
    width: Math.max(base.width, BLANK_MAP_WIDTH_METERS),
    depth: Math.max(base.depth, BLANK_MAP_DEPTH_METERS),
    cellSize: 1,
  }
}

function normalizeMapConfig(config: IsometricMapConfig, fallback: IsometricMapConfig): IsometricMapConfig {
  return {
    ...fallback,
    ...config,
    width: Math.max(10, Math.round(config.width || fallback.width)),
    depth: Math.max(10, Math.round(config.depth || fallback.depth)),
    cellSize: 1,
  }
}

function buildMapId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'mapa'
  return `${slug}-${Date.now()}`
}

function buildBackgroundMapFromVersion(
  locationId: string,
  imageUrl: string,
  imageWidthPx: number,
  imageHeightPx: number,
  fallbackConfig: IsometricMapConfig,
  opacity: number,
  versionId: string,
): NonNullable<IsometricMap['backgroundMap']> {
  const aspect = imageWidthPx > 0 && imageHeightPx > 0 ? imageWidthPx / imageHeightPx : fallbackConfig.width / fallbackConfig.depth
  const width = fallbackConfig.width
  const depth = Math.max(10, Math.round(width / Math.max(aspect, 0.01)))

  return {
    displayMode: 'soft-light',
    locationId,
    versionId,
    imageUrl,
    imageWidthPx,
    imageHeightPx,
    opacity,
    width,
    depth,
    offsetX: 0,
    offsetZ: 0,
    rotation: 0,
  }
}

export function MapPage() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const user = useAuthStore((s) => s.user)
  const [workspaceStage, setWorkspaceStage] = useState<MapWorkspaceStage>('terrain-base')

  // Estado del visor isométrico
  const [viewerState, setViewerState] = useState<IsometricViewerState>(DEFAULT_VIEWER_STATE)

  // ── Datos del mapa (mutables para editor) ──
  const demoData = useMemo(() => generateDemoMap(), [])
  const blankMapConfig = useMemo(() => createBlankMapConfig(demoData.config), [demoData.config])
  const [mapConfig, setMapConfig] = useState<IsometricMapConfig>(() => createBlankMapConfig(demoData.config))
  const [savedMaps, setSavedMaps] = useState<IsometricMap[]>([])
  const [currentMapId, setCurrentMapId] = useState('')
  const [mapName, setMapName] = useState('Mapa Base Planta')
  const [mapDescription, setMapDescription] = useState('')
  const [isLoadingMaps, setIsLoadingMaps] = useState(true)
  const [mapStatusText, setMapStatusText] = useState('Cargando mapas guardados...')
  const [mapLocations, setMapLocations] = useState<MapLocation[]>([])
  const [isLoadingBaseMaps, setIsLoadingBaseMaps] = useState(true)
  const [baseMapStatusText, setBaseMapStatusText] = useState('Cargando fuentes de plano base...')
  const [selectedBaseLocationId, setSelectedBaseLocationId] = useState('')
  const [showBaseMap, setShowBaseMap] = useState(true)
  const [backgroundMap, setBackgroundMap] = useState<IsometricMap['backgroundMap'] | null>(null)
  const [calibrationMode, setCalibrationMode] = useState<BackgroundCalibrationMode | null>(null)
  const [calibrationStepMeters, setCalibrationStepMeters] = useState<1 | 5>(1)
  const [fitRequestKey, setFitRequestKey] = useState(0)
  const [nodes, setNodes] = useState<MapNode[]>([])
  const [areas, setAreas] = useState<MapArea[]>([])
  const [connectors, setConnectors] = useState<MapConnectorType[]>([])
  const [terrainTiles, setTerrainTiles] = useState<TerrainTile[]>([])
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
  const [terrainImportProgress, setTerrainImportProgress] = useState<TerrainImportProgress | null>(null)
  const [terrainImportCoordinatesText, setTerrainImportCoordinatesText] = useState<string>(() =>
    formatCoordinatesText(DEFAULT_CHONCHI_RECTANGLE)
  )
  const [terrainImportSampleStep, setTerrainImportSampleStep] = useState<number>(1)
  const [isShiftPressed, setIsShiftPressed] = useState(false)
  const [addPlacementRotation, setAddPlacementRotation] = useState(0)
  const lastTerrainStrokeKeyRef = useRef<string | null>(null)
  const preserveLocalBaseRef = useRef(false)
  // ── HUD state (compass, minimap, stats, geo coords, measurement) ──
  const [terrainGeoBounds, setTerrainGeoBounds] = useState<TerrainGeoBounds | null>(null)
  const [showGeoCoords, setShowGeoCoords] = useState(false)
  const [showCompass, setShowCompass] = useState(true)
  const [showMinimap, setShowMinimap] = useState(true)
  const [showStatsPanel, setShowStatsPanel] = useState(false)
  const [measurePoints, setMeasurePoints] = useState<{ x: number; z: number }[]>([])
  const [measureMode, setMeasureMode] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const history = useEditorHistory()

  const applyMapDocument = useCallback((map: IsometricMap | null) => {
    const nextConfig = map?.config
      ? normalizeMapConfig(map.config, blankMapConfig)
      : blankMapConfig
    const nextNodes = map?.nodes ?? []
    const nextAreas = map?.areas ?? []
    const nextConnectors = map?.connectors ?? []
    const nextTerrain = map?.terrain ?? []

    setMapConfig(nextConfig)
    setNodes(nextNodes)
    setAreas(nextAreas)
    setConnectors(nextConnectors)
    setTerrainTiles(nextTerrain)
    setCurrentMapId(map?.id ?? '')
    setMapName(map?.nombre ?? 'Mapa Base Planta')
    setMapDescription(map?.descripcion ?? '')
    const nextBackgroundMap = map?.backgroundMap
      ? (() => {
          const raw = map.backgroundMap
          return {
            ...raw,
            displayMode: raw.displayMode ?? 'soft-light',
            imageWidthPx: raw.imageWidthPx,
            imageHeightPx: raw.imageHeightPx,
            width: raw.width ?? nextConfig.width,
            depth: raw.depth ?? nextConfig.depth,
            offsetX: raw.offsetX ?? 0,
            offsetZ: raw.offsetZ ?? 0,
            rotation: raw.rotation ?? 0,
          }
        })()
      : null
    const hasConfiguredBase =
      nextTerrain.length > 0 ||
      nextNodes.length > 0 ||
      nextAreas.length > 0 ||
      nextConnectors.length > 0 ||
      !!nextBackgroundMap

    setSelectedBaseLocationId(nextBackgroundMap?.locationId ?? '')
    setBackgroundMap(nextBackgroundMap)
    setShowBaseMap(!!nextBackgroundMap)
    setWorkspaceStage(hasConfiguredBase ? 'editor' : 'terrain-base')
    setViewerState((prev) => ({
      ...prev,
      mode: hasConfiguredBase ? 'edit' : 'view',
      selectedNodeId: null,
      filters: {
        ...prev.filters,
        showEquipment: hasConfiguredBase,
        showLabels: hasConfiguredBase,
        showConnectors: hasConfiguredBase,
        showAlerts: false,
      },
    }))
    setHasUnsavedChanges(false)
    history.clear()
    history.pushSnapshot({ nodes: nextNodes, areas: nextAreas, connectors: nextConnectors })
    setFitRequestKey((prev) => prev + 1)
  }, [blankMapConfig, history])

  const refreshBaseMapSources = useCallback(async () => {
    setIsLoadingBaseMaps(true)
    try {
      const locations = await getMapLocations()
      setMapLocations(locations)
      setBaseMapStatusText(
        locations.length > 0
          ? 'Puedes usar como plano base la última versión de cualquier ubicación cargada en Mapas.'
          : 'No hay ubicaciones de mapa activas para usar como plano base.'
      )
    } catch (error) {
      console.error('Error loading base map sources:', error)
      setMapLocations([])
      setBaseMapStatusText('No se pudieron cargar las fuentes de plano base.')
    } finally {
      setIsLoadingBaseMaps(false)
    }
  }, [])

  const refreshSavedMaps = useCallback(async (preferredMapId?: string) => {
    setIsLoadingMaps(true)
    try {
      const maps = await getIsometricMaps()
      setSavedMaps(maps)

      if (!preferredMapId && preserveLocalBaseRef.current) {
        return
      }

      const targetMap = preferredMapId
        ? maps.find((map) => map.id === preferredMapId) ?? null
        : maps[0] ?? null

      if (targetMap) {
        applyMapDocument(targetMap)
        setMapStatusText(`Mapa cargado: ${targetMap.nombre}`)
      } else {
        applyMapDocument(null)
        setMapStatusText('Sin mapas guardados. Se abrió un lienzo grande en blanco (600 m × 500 m).')
      }
    } catch (error) {
      console.error('Error loading map library:', error)
      applyMapDocument(null)
      setMapStatusText('No se pudo cargar la biblioteca de mapas. Se abrió un lienzo en blanco.')
    } finally {
      setIsLoadingMaps(false)
    }
  }, [applyMapDocument])

  // Snapshot inicial para undo
  useEffect(() => {
    history.pushSnapshot({ nodes, areas, connectors })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void refreshSavedMaps()
  }, [refreshSavedMaps])

  useEffect(() => {
    void refreshBaseMapSources()
  }, [refreshBaseMapSources])

  const isEditMode = viewerState.mode === 'edit'
  const isTerrainBaseStage = workspaceStage === 'terrain-base'
  const isBaseMapCalibrationMode = isEditMode && !!backgroundMap && calibrationMode !== null
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

  const terrainDimensionSummary = useMemo(() => {
    if (terrainTiles.length === 0) return null

    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY
    let minElevation = Number.POSITIVE_INFINITY
    let maxElevation = Number.NEGATIVE_INFINITY

    for (const tile of terrainTiles) {
      minX = Math.min(minX, tile.x)
      maxX = Math.max(maxX, tile.x)
      minZ = Math.min(minZ, tile.z)
      maxZ = Math.max(maxZ, tile.z)
      minElevation = Math.min(minElevation, tile.elevation)
      maxElevation = Math.max(maxElevation, tile.elevation)
    }

    return {
      widthMeters: Math.max(1, maxX - minX + 1),
      depthMeters: Math.max(1, maxZ - minZ + 1),
      minElevation,
      maxElevation,
      riseMeters: Math.max(0, maxElevation),
      dropMeters: Math.max(0, -minElevation),
      reliefMeters: Math.max(0, maxElevation - minElevation),
    }
  }, [terrainTiles])

  const hoveredTerrainElevation = useMemo(() => {
    if (!terrainHoverPosition) return null
    const x = Math.round(terrainHoverPosition.x)
    const z = Math.round(terrainHoverPosition.z)
    return terrainElevationLookup.get(`${x},${z}`) ?? SEA_LEVEL_ELEVATION
  }, [terrainHoverPosition, terrainElevationLookup])

  const hoveredGeoCoord = useMemo(() => {
    if (!showGeoCoords || !terrainHoverPosition || !terrainGeoBounds) return null
    return gridToGeo(terrainHoverPosition.x, terrainHoverPosition.z, terrainGeoBounds)
  }, [showGeoCoords, terrainHoverPosition, terrainGeoBounds])

  const terrainImportPreview = useMemo(() => {
    try {
      const corners = parseCoordinatesText(terrainImportCoordinatesText)
      return estimateTerrainImportPreview(mapConfig, corners, terrainImportSampleStep)
    } catch {
      return null
    }
  }, [mapConfig, terrainImportCoordinatesText, terrainImportSampleStep])

  const terrainImportPreviewError = useMemo(() => {
    try {
      parseCoordinatesText(terrainImportCoordinatesText)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'No se pudo interpretar el rectangulo de coordenadas'
    }
  }, [terrainImportCoordinatesText])

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

  const getCurrentFloorBounds = useCallback(() => {
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minZ = Number.POSITIVE_INFINITY
    let maxZ = Number.NEGATIVE_INFINITY

    for (const tile of terrainTiles) {
      minX = Math.min(minX, tile.x)
      maxX = Math.max(maxX, tile.x + 1)
      minZ = Math.min(minZ, tile.z)
      maxZ = Math.max(maxZ, tile.z + 1)
    }

    const floorNodes = nodes.filter((n) => (n.floor ?? SEA_LEVEL_ELEVATION) === viewerState.currentFloor)
    for (const node of floorNodes) {
      const halfWidth = (node.size.width ?? 2) / 2
      const halfDepth = (node.size.depth ?? 2) / 2
      minX = Math.min(minX, node.position.x - halfWidth)
      maxX = Math.max(maxX, node.position.x + halfWidth)
      minZ = Math.min(minZ, node.position.z - halfDepth)
      maxZ = Math.max(maxZ, node.position.z + halfDepth)
    }

    const floorAreas = areas.filter((a) => (a.floor ?? SEA_LEVEL_ELEVATION) === viewerState.currentFloor)
    for (const area of floorAreas) {
      if (area.tiles && area.tiles.length > 0) {
        for (const tile of area.tiles) {
          minX = Math.min(minX, tile.x)
          maxX = Math.max(maxX, tile.x + 1)
          minZ = Math.min(minZ, tile.z)
          maxZ = Math.max(maxZ, tile.z + 1)
        }
      } else {
        minX = Math.min(minX, area.position.x - area.size.width / 2)
        maxX = Math.max(maxX, area.position.x + area.size.width / 2)
        minZ = Math.min(minZ, area.position.z - area.size.depth / 2)
        maxZ = Math.max(maxZ, area.position.z + area.size.depth / 2)
      }
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      minX = -mapConfig.width / 2
      maxX = mapConfig.width / 2
      minZ = -mapConfig.depth / 2
      maxZ = mapConfig.depth / 2
    }

    return {
      minX,
      maxX,
      minZ,
      maxZ,
      center: {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
      },
      width: Math.max(1, maxX - minX),
      depth: Math.max(1, maxZ - minZ),
    }
  }, [mapConfig.width, mapConfig.depth, terrainTiles, nodes, areas, viewerState.currentFloor])

  const fitMapComplete = useCallback(() => {
    const bounds = getCurrentFloorBounds()
    const aspect = canvasContainerRef.current
      ? Math.max(1, canvasContainerRef.current.clientWidth / Math.max(1, canvasContainerRef.current.clientHeight))
      : 16 / 9
    const requiredZoom = Math.min(
      MAX_VIEWER_ZOOM,
      Math.max(
        FULL_MAP_VIEW_ZOOM,
        Math.max(
          bounds.depth / 2 + FIT_PADDING_METERS,
          (bounds.width / 2 + FIT_PADDING_METERS) / aspect,
        ) * FIT_ISO_FACTOR,
      ),
    )

    setViewerState((prev) => ({
      ...prev,
      zoom: requiredZoom,
      panOffset: bounds.center,
    }))
  }, [getCurrentFloorBounds])

  const resetView = fitMapComplete

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => fitMapComplete())
    return () => window.cancelAnimationFrame(raf)
  }, [fitMapComplete, fitRequestKey])

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
  const [isFullscreen, setIsFullscreen] = useState(false)

  const handleToggleFullscreen = useCallback(async () => {
    const el = canvasContainerRef.current
    if (!el) return

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await el.requestFullscreen()
      }
    } catch (error) {
      console.warn('No se pudo cambiar a pantalla completa', error)
    }
  }, [])

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

  useEffect(() => {
    const syncFullscreenState = () => {
      const current = canvasContainerRef.current
      setIsFullscreen(document.fullscreenElement === current)
    }

    document.addEventListener('fullscreenchange', syncFullscreenState)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState)
    }
  }, [])

  useEffect(() => {
    const onResize = () => setFitRequestKey((prev) => prev + 1)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

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
    if (isBaseMapCalibrationMode) return

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
  }, [isBaseMapCalibrationMode, isEditMode, terrainEditEnabled])

  const handlePointerMovePan = useCallback((e: React.PointerEvent) => {
    if (isBaseMapCalibrationMode) return
    if (isEditMode && terrainEditEnabled) return

    if (!isPanning.current) return
    const dx = e.clientX - panStart.current.x
    const dy = e.clientY - panStart.current.y

    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      draggedDuringPan.current = true
    }

    panStart.current = { x: e.clientX, y: e.clientY }

    setViewerState((prev) => applyScreenPanDelta(prev, dx, dy))
  }, [applyScreenPanDelta, isBaseMapCalibrationMode, isEditMode, terrainEditEnabled])

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

  const backgroundMapMetrics = useMemo(() => {
    if (!backgroundMap) return null

    const widthPx = backgroundMap.imageWidthPx ?? 0
    const heightPx = backgroundMap.imageHeightPx ?? 0
    const pixelsPerMeterX = widthPx > 0 ? widthPx / Math.max(backgroundMap.width, 1) : null
    const pixelsPerMeterZ = heightPx > 0 ? heightPx / Math.max(backgroundMap.depth, 1) : null
    const coverageX = Math.round((backgroundMap.width / Math.max(mapConfig.width, 1)) * 100)
    const coverageZ = Math.round((backgroundMap.depth / Math.max(mapConfig.depth, 1)) * 100)
    const avgDensity = pixelsPerMeterX && pixelsPerMeterZ ? (pixelsPerMeterX + pixelsPerMeterZ) / 2 : null

    let densityLabel = 'Sin metadatos raster'
    if (avgDensity != null) {
      densityLabel = avgDensity >= 8
        ? 'Alta precisión'
        : avgDensity >= 3
          ? 'Precisión operativa'
          : 'Precisión baja'
    }

    return {
      pixelsPerMeterX,
      pixelsPerMeterZ,
      coverageX,
      coverageZ,
      densityLabel,
    }
  }, [backgroundMap, mapConfig.depth, mapConfig.width])

  const applyBackgroundMapUpdate = useCallback((updates: Partial<NonNullable<IsometricMap['backgroundMap']>>) => {
    setBackgroundMap((prev) => prev ? {
      ...prev,
      ...updates,
      width: Math.max(1, Math.round(updates.width ?? prev.width)),
      depth: Math.max(1, Math.round(updates.depth ?? prev.depth)),
      offsetX: Math.round(((updates.offsetX ?? prev.offsetX) + Number.EPSILON) * 10) / 10,
      offsetZ: Math.round(((updates.offsetZ ?? prev.offsetZ) + Number.EPSILON) * 10) / 10,
      rotation: Math.round(((updates.rotation ?? prev.rotation) + Number.EPSILON) * 10) / 10,
    } : prev)
    setHasUnsavedChanges(true)
  }, [])

  const resetBackgroundCalibration = useCallback(() => {
    if (!backgroundMap) return
    applyBackgroundMapUpdate({
      width: mapConfig.width,
      depth: backgroundMap.imageWidthPx && backgroundMap.imageHeightPx
        ? Math.max(10, Math.round(mapConfig.width / Math.max(backgroundMap.imageWidthPx / backgroundMap.imageHeightPx, 0.01)))
        : mapConfig.depth,
      offsetX: 0,
      offsetZ: 0,
      rotation: 0,
    })
    setMapStatusText('Calibración reiniciada usando el tamaño actual del lienzo y el aspecto de la imagen base.')
  }, [applyBackgroundMapUpdate, backgroundMap, mapConfig.depth, mapConfig.width])

  const centerBackgroundMap = useCallback(() => {
    if (!backgroundMap) return
    applyBackgroundMapUpdate({ offsetX: 0, offsetZ: 0 })
    setMapStatusText('Plano base centrado en el origen del lienzo.')
  }, [applyBackgroundMapUpdate, backgroundMap])

  const fitBackgroundToCanvas = useCallback(() => {
    if (!backgroundMap) return
    const nextDepth = backgroundMap.imageWidthPx && backgroundMap.imageHeightPx
      ? Math.max(10, Math.round(mapConfig.width / Math.max(backgroundMap.imageWidthPx / backgroundMap.imageHeightPx, 0.01)))
      : mapConfig.depth
    applyBackgroundMapUpdate({ width: mapConfig.width, depth: nextDepth, offsetX: 0, offsetZ: 0 })
    setMapStatusText('Plano base reajustado al ancho del lienzo y recentrado.')
  }, [applyBackgroundMapUpdate, backgroundMap, mapConfig.depth, mapConfig.width])

  const nudgeBackgroundMap = useCallback((deltaX: number, deltaZ: number) => {
    if (!backgroundMap) return
    applyBackgroundMapUpdate({
      offsetX: backgroundMap.offsetX + deltaX,
      offsetZ: backgroundMap.offsetZ + deltaZ,
    })
  }, [applyBackgroundMapUpdate, backgroundMap])

  const rotateBackgroundMap = useCallback((deltaDegrees: number) => {
    if (!backgroundMap) return
    applyBackgroundMapUpdate({ rotation: backgroundMap.rotation + deltaDegrees })
  }, [applyBackgroundMapUpdate, backgroundMap])

  const scaleBackgroundMap = useCallback((deltaMeters: number) => {
    if (!backgroundMap) return
    const ratio = backgroundMap.depth / Math.max(backgroundMap.width, 1)
    const nextWidth = Math.max(1, backgroundMap.width + deltaMeters)
    applyBackgroundMapUpdate({ width: nextWidth, depth: Math.max(1, Math.round(nextWidth * ratio)) })
  }, [applyBackgroundMapUpdate, backgroundMap])

  useEffect(() => {
    if (!isBaseMapCalibrationMode || !backgroundMap) return

    const handleCalibrationHotkeys = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return

      const step = event.shiftKey ? 5 : calibrationStepMeters
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        nudgeBackgroundMap(-step, 0)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        nudgeBackgroundMap(step, 0)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        nudgeBackgroundMap(0, -step)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        nudgeBackgroundMap(0, step)
      } else if (event.key === '[') {
        event.preventDefault()
        rotateBackgroundMap(-1)
      } else if (event.key === ']') {
        event.preventDefault()
        rotateBackgroundMap(1)
      } else if (event.key === '-') {
        event.preventDefault()
        scaleBackgroundMap(-step)
      } else if (event.key === '+' || event.key === '=') {
        event.preventDefault()
        scaleBackgroundMap(step)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        setCalibrationMode(null)
      }
    }

    window.addEventListener('keydown', handleCalibrationHotkeys)
    return () => window.removeEventListener('keydown', handleCalibrationHotkeys)
  }, [backgroundMap, calibrationStepMeters, isBaseMapCalibrationMode, nudgeBackgroundMap, rotateBackgroundMap, scaleBackgroundMap])

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
        terrain: terrainTiles,
      })
    },
    [history, areas, connectors, terrainTiles]
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

  useEffect(() => {
    if (!isTerrainBaseStage) return

    setTerrainEditEnabled(false)
    setShowTerrainModal(false)
    closeAreaEditor()
    overlayState.closeOverlay()
    setViewerState((prev) => ({
      ...prev,
      mode: 'view',
      selectedNodeId: null,
      filters: {
        ...prev.filters,
        showEquipment: false,
        showLabels: false,
        showConnectors: false,
        showAlerts: false,
      },
    }))
  }, [isTerrainBaseStage, closeAreaEditor, overlayState])

  const enterEditorWorkspace = useCallback(() => {
    setWorkspaceStage('editor')
    setViewerState((prev) => ({
      ...prev,
      mode: 'edit',
      selectedNodeId: null,
      filters: {
        ...prev.filters,
        showEquipment: true,
        showLabels: true,
      },
    }))
    setMapStatusText('Editor activado. La base ya quedo cargada y ahora el foco es editar elementos y areas.')
  }, [])

  const returnToTerrainWorkspace = useCallback(() => {
    setWorkspaceStage('terrain-base')
    setMapStatusText('Ajuste de base abierto. Usa este espacio solo para recalibrar terreno o plano base cuando sea necesario.')
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

    preserveLocalBaseRef.current = true
    setIsImportingRealTerrain(true)
    setTerrainImportProgress(null)
    setRealTerrainImportMessage('Validando coordenadas y consultando elevaciones...')

    try {
      const corners = parseCoordinatesText(terrainImportCoordinatesText)
      const expandedConfig = getAutoExpandedMapConfig(mapConfig, corners)
      const gridChanged = expandedConfig.width !== mapConfig.width || expandedConfig.depth !== mapConfig.depth
      if (gridChanged) {
        setMapConfig(expandedConfig)
      }

      // Fallback progresivo: cada paso reduce significativamente las peticiones API.
      // El paso del usuario suele auto-ajustarse al mismo valor que 8/12 en grillas grandes,
      // así que usamos saltos grandes (30, 48) para que cada reintento baje la carga real.
      const steps = Array.from(new Set([terrainImportSampleStep, 30, 48]))

      let result: Awaited<ReturnType<typeof importTerrainFromRectangle>> | null = null
      let lastError: unknown = null

      for (const step of steps) {
        try {
          setRealTerrainImportMessage(
            `Consultando elevaciones (paso ${step}m, grilla ${expandedConfig.width}×${expandedConfig.depth})...`
          )
          result = await importTerrainFromRectangle({
            config: expandedConfig,
            corners,
            sampleStep: step,
            keepSeaLevelTiles: false,
            onProgress: (progress) => {
              setTerrainImportProgress(progress)
              setRealTerrainImportMessage(
                `Consultando elevaciones ${progress.percent}% · lote ${progress.completedBatches}/${progress.totalBatches} · ${progress.completedPoints}/${progress.totalPoints} puntos`
              )
            },
          })
          break
        } catch (error) {
          lastError = error
          if (error instanceof TerrainImportHttpError && error.status === 429) {
            setRealTerrainImportMessage(
              `Cuota temporal alcanzada — reintentando con paso más grueso (${steps[steps.indexOf(step) + 1] ?? '?'}m)...`
            )
            continue
          }
          throw error
        }
      }

      if (!result) {
        throw lastError instanceof Error ? lastError : new Error('No fue posible importar el terreno')
      }

      setTerrainTiles(result.tiles)
      setTerrainGeoBounds(result.geoBounds)
      setHasUnsavedChanges(true)

      setTerrainEditableMin((prev) => Math.max(MIN_TERRAIN_ELEVATION, Math.min(prev, Math.floor(result.minElevation) - 2)))
      setTerrainEditableMax((prev) => Math.min(MAX_TERRAIN_ELEVATION, Math.max(prev, Math.ceil(result.maxElevation) + 2)))
      setTerrainFlattenTarget(clampElevation(Math.round((result.minElevation + result.maxElevation) / 2)))

      const scaleNote = gridChanged ? ' (grilla auto-expandida)' : ''
      setRealTerrainImportMessage(
        `Malla real aplicada: ${result.tiles.length} celdas, rango ${result.minElevation}m a ${result.maxElevation}m. ` +
        `Grilla ${expandedConfig.width}×${expandedConfig.depth}m, muestra efectiva ${result.usedSampleStep}m${scaleNote}.`
      )
      setMapStatusText('Base importada. Sigue con edicion de elementos; vuelve a base solo si necesitas recalibrar.')
      setFitRequestKey((prev) => prev + 1)
      enterEditorWorkspace()
    } catch (error) {
      if (error instanceof TerrainImportHttpError && error.status === 429) {
        setRealTerrainImportMessage(
          'Error: cuota de elevación agotada (429). Espera 2-3 minutos y vuelve a intentar.'
        )
      } else {
        const message = error instanceof Error ? error.message : 'No fue posible importar terreno real'
        setRealTerrainImportMessage(`Error importando terreno: ${message}`)
      }
    } finally {
      setIsImportingRealTerrain(false)
      setTerrainImportProgress(null)
    }
  }, [isImportingRealTerrain, terrainImportCoordinatesText, terrainImportSampleStep, mapConfig, enterEditorWorkspace])

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

      // Measurement ruler: collect 2 points, reset on third click
      if (measureMode) {
        setMeasurePoints((prev) => prev.length >= 2 ? [position] : [...prev, position])
        return
      }

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
      measureMode,
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
    setTerrainTiles,
    setHasUnsavedChanges,
    setEditorTool,
    setSnapEnabled,
    history,
    zoomIn,
    zoomOut,
    resetView,
  })

  const handleCreateBlankMap = useCallback(() => {
    preserveLocalBaseRef.current = true
    applyMapDocument(null)
    setMapStatusText('Lienzo nuevo listo: base 600 m × 500 m, grilla 1 m × 1 m.')
  }, [applyMapDocument])

  const handleLoadMap = useCallback((mapId: string) => {
    const target = savedMaps.find((map) => map.id === mapId) ?? null
    if (!target) return
    preserveLocalBaseRef.current = false
    applyMapDocument(target)
    setMapStatusText(`Mapa cargado: ${target.nombre}`)
  }, [applyMapDocument, savedMaps])

  const handleSelectBaseLocation = useCallback(async (locationId: string) => {
    setSelectedBaseLocationId(locationId)

    if (!locationId) {
      setBackgroundMap(null)
      setHasUnsavedChanges(true)
      setBaseMapStatusText('Plano base desactivado para este layout.')
      return
    }

    try {
      const latestVersion = await getLatestMapVersion(locationId)
      if (!latestVersion) {
        setBackgroundMap(null)
        setHasUnsavedChanges(true)
        setBaseMapStatusText('La ubicación seleccionada no tiene versiones de mapa publicadas.')
        return
      }

      setBackgroundMap(
        buildBackgroundMapFromVersion(
          locationId,
          latestVersion.imageUrl,
          latestVersion.width,
          latestVersion.height,
          mapConfig,
          backgroundMap?.opacity ?? 0.45,
          latestVersion.id,
        )
      )
      setShowBaseMap(true)
      setCalibrationMode('move')
      setHasUnsavedChanges(true)
      setBaseMapStatusText(`Plano base cargado: ${latestVersion.width}×${latestVersion.height}px · versión ${latestVersion.version}.`)
    } catch (error) {
      console.error('Error loading latest base map version:', error)
      setBaseMapStatusText('No se pudo cargar la última versión del plano base.')
    }
  }, [backgroundMap?.opacity, mapConfig])

  const expandCanvasToContent = useCallback(() => {
    const bounds = getCurrentFloorBounds()
    const nextWidth = Math.max(mapConfig.width, Math.ceil(bounds.width + FIT_PADDING_METERS * 2))
    const nextDepth = Math.max(mapConfig.depth, Math.ceil(bounds.depth + FIT_PADDING_METERS * 2))
    setMapConfig((prev) => ({ ...prev, width: nextWidth, depth: nextDepth, cellSize: 1 }))
    setHasUnsavedChanges(true)
    setMapStatusText(`Base ajustada al contenido: ${nextWidth} m × ${nextDepth} m.`)
    setFitRequestKey((prev) => prev + 1)
  }, [getCurrentFloorBounds, mapConfig.width, mapConfig.depth])

  const handleSave = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const normalizedName = mapName.trim() || 'Mapa Planta'
      const mapId = currentMapId || buildMapId(normalizedName)
      const currentVersion = currentMapId
        ? (savedMaps.find((map) => map.id === currentMapId)?.version ?? 0) + 1
        : 1

      await saveIsometricMap(
        {
          id: mapId,
          nombre: normalizedName,
          descripcion: mapDescription.trim(),
          version: currentVersion,
          config: normalizeMapConfig(mapConfig, blankMapConfig),
          backgroundMap: backgroundMap ?? undefined,
          nodes,
          connectors,
          areas,
          terrain: terrainTiles,
          createdBy: user?.id || 'system',
        },
        user?.id || 'system'
      )
      setCurrentMapId(mapId)
      setHasUnsavedChanges(false)
      setMapStatusText(`Mapa guardado: ${normalizedName} (v${currentVersion}).`)
      await refreshSavedMaps(mapId)
    } catch (error) {
      console.error('Error saving map:', error)
      setMapStatusText('Error al guardar el mapa. Revisa consola/permisos de Firestore.')
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, mapName, currentMapId, savedMaps, mapDescription, mapConfig, blankMapConfig, backgroundMap, nodes, connectors, areas, terrainTiles, user, refreshSavedMaps])

  const handleSaveAsNew = useCallback(async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const normalizedName = mapName.trim() || `Mapa ${savedMaps.length + 1}`
      const mapId = buildMapId(normalizedName)
      await saveIsometricMap(
        {
          id: mapId,
          nombre: normalizedName,
          descripcion: mapDescription.trim(),
          version: 1,
          config: normalizeMapConfig(mapConfig, blankMapConfig),
          backgroundMap: backgroundMap ?? undefined,
          nodes,
          connectors,
          areas,
          terrain: terrainTiles,
          createdBy: user?.id || 'system',
        },
        user?.id || 'system'
      )
      setCurrentMapId(mapId)
      setHasUnsavedChanges(false)
      setMapStatusText(`Mapa guardado como nuevo: ${normalizedName}.`)
      await refreshSavedMaps(mapId)
    } catch (error) {
      console.error('Error saving map as new:', error)
      setMapStatusText('No se pudo guardar como nuevo mapa.')
    } finally {
      setIsSaving(false)
    }
  }, [isSaving, mapName, savedMaps.length, mapDescription, mapConfig, blankMapConfig, backgroundMap, nodes, connectors, areas, terrainTiles, user, refreshSavedMaps])

  const handleCancelEdit = useCallback(() => {
    // Revertir al mapa cargado o a lienzo limpio si aún no existe uno persistido
    if (hasUnsavedChanges) {
      const persisted = currentMapId ? savedMaps.find((map) => map.id === currentMapId) ?? null : null
      applyMapDocument(persisted)
      setMapStatusText(persisted
        ? `Cambios descartados. Restaurado: ${persisted.nombre}.`
        : 'Cambios descartados. Lienzo limpio restaurado.')
    }
    setViewerState((prev) => ({ ...prev, mode: 'view', selectedNodeId: null }))
    setSelectedAreaId(null)
    overlayState.closeOverlay()
    closeAreaEditor()
  }, [hasUnsavedChanges, currentMapId, savedMaps, applyMapDocument, overlayState, closeAreaEditor])

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
            {isTerrainBaseStage
              ? 'Carga y ajusta la base solo una vez. Cuando quede lista, el trabajo principal pasa a edicion de elementos.'
              : 'Editor principal del layout: equipos, areas, conectores y ajustes sobre una base ya preparada.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {FEATURES.vista2d && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/map/view')}
            >
              <Layers className="h-4 w-4" />
              Vista 2D
            </Button>
          )}
          <Badge variant={isTerrainBaseStage ? 'outline' : 'secondary'} className="gap-1 font-normal">
            {isTerrainBaseStage ? 'Configurando base' : 'Editor activo'}
          </Badge>
          {FEATURES.workspaceToggle && isAdmin && isTerrainBaseStage && (terrainTiles.length > 0 || !!backgroundMap || !!currentMapId) && (
            <Button variant="default" size="sm" className="gap-1.5" onClick={enterEditorWorkspace}>
              <Pencil className="h-4 w-4" />
              Ir a edicion
            </Button>
          )}
          {FEATURES.workspaceToggle && isAdmin && !isTerrainBaseStage && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={returnToTerrainWorkspace}>
              <Compass className="h-4 w-4" />
              Ajustar base
            </Button>
          )}
          {/* Modo editor (solo admin) */}
          {FEATURES.workspaceToggle && isAdmin && !isTerrainBaseStage && (
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
          {FEATURES.headerBadges && (
            <>
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
            </>
          )}
        </div>
      </div>

      {isTerrainBaseStage && (
        <div className="relative">
        <TerrainBaseWorkspace
          currentMapId={currentMapId}
          savedMaps={savedMaps}
          isLoadingMaps={isLoadingMaps}
          onLoadMap={handleLoadMap}
          mapName={mapName}
          onMapNameChange={(value) => {
            setMapName(value)
            setHasUnsavedChanges(true)
          }}
          mapDescription={mapDescription}
          onMapDescriptionChange={(value) => {
            setMapDescription(value)
            setHasUnsavedChanges(true)
          }}
          mapWidth={mapConfig.width}
          mapDepth={mapConfig.depth}
          terrainTileCount={terrainTiles.length}
          currentFloorLabel={formatElevationLabel(viewerState.currentFloor)}
          mapStatusText={mapStatusText}
          realTerrainImportMessage={realTerrainImportMessage}
          onCreateBlankMap={handleCreateBlankMap}
          onFitMapComplete={fitMapComplete}
          onImportRealTerrain={() => { void handleImportRealTerrain() }}
          onSave={handleSave}
          onSaveAsNew={handleSaveAsNew}
          isImportingRealTerrain={isImportingRealTerrain}
          isSaving={isSaving}
          terrainImportCoordinatesText={terrainImportCoordinatesText}
          onTerrainImportCoordinatesTextChange={setTerrainImportCoordinatesText}
          terrainImportSampleStep={terrainImportSampleStep}
          onTerrainImportSampleStepChange={setTerrainImportSampleStep}
          terrainImportPreview={terrainImportPreview}
          terrainImportPreviewError={terrainImportPreviewError}
          terrainImportProgress={terrainImportProgress}
        />

        {/* ── HUD Widgets (terrain-base stage) ── */}
        {/* Compass widget (top-right of 3D preview) */}
        {showCompass && (
          <div className="absolute top-16 right-6 z-20 pointer-events-auto">
            <CompassWidget cameraAngle={viewerState.cameraAngle} />
          </div>
        )}

        {/* Minimap (bottom-right of 3D preview) */}
        {showMinimap && terrainTiles.length > 0 && (
          <div className="absolute bottom-6 right-6 z-20 pointer-events-auto">
            <Minimap
              config={mapConfig}
              terrain={terrainTiles}
              viewerState={viewerState}
              canvasAspect={mapConfig.width / mapConfig.depth}
            />
          </div>
        )}

        {/* Stats panel */}
        {showStatsPanel && (
          <div className="absolute top-16 left-6 z-20 pointer-events-auto">
            <MapStatsPanel
              config={mapConfig}
              nodes={nodes}
              areas={areas}
              connectors={connectors}
              terrain={terrainTiles}
            />
          </div>
        )}

        {/* HUD toggle buttons */}
        <div className="absolute top-4 right-4 z-30 flex gap-1 pointer-events-auto">
          <Button
            variant={showCompass ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
            onClick={() => setShowCompass(!showCompass)}
            title={showCompass ? 'Ocultar brújula' : 'Mostrar brújula'}
          >
            <Compass className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={showMinimap ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
            onClick={() => setShowMinimap(!showMinimap)}
            title={showMinimap ? 'Ocultar minimapa' : 'Mostrar minimapa'}
          >
            <Layers className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={showStatsPanel ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
            onClick={() => setShowStatsPanel(!showStatsPanel)}
            title={showStatsPanel ? 'Ocultar estadísticas' : 'Mostrar estadísticas'}
          >
            <BarChart3 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={showGeoCoords ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
            onClick={() => setShowGeoCoords(!showGeoCoords)}
            title={showGeoCoords ? 'Ocultar coordenadas geo' : 'Mostrar coordenadas geo'}
            disabled={!terrainGeoBounds}
          >
            <MapPin className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={measureMode ? 'default' : 'ghost'}
            size="icon"
            className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
            onClick={() => {
              setMeasureMode(!measureMode)
              setMeasurePoints([])
            }}
            title={measureMode ? 'Desactivar regla' : 'Medir distancia'}
          >
            <Ruler className="h-3.5 w-3.5" />
          </Button>
        </div>
        </div>
      )}

      {/* Status Legend */}
      {FEATURES.statusLegendCard && isAdmin && !isTerrainBaseStage && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mapa actual</div>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={currentMapId}
                    onChange={(e) => handleLoadMap(e.target.value)}
                    disabled={isLoadingMaps || savedMaps.length === 0}
                  >
                    <option value="">{isLoadingMaps ? 'Cargando mapas...' : savedMaps.length === 0 ? 'Sin mapas guardados' : 'Selecciona mapa'}</option>
                    {savedMaps.map((map) => (
                      <option key={map.id} value={map.id}>
                        {map.nombre} · v{map.version}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nombre</div>
                  <Input
                    value={mapName}
                    onChange={(e) => {
                      setMapName(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    placeholder="Ej: Planta Chonchi v2"
                  />
                </div>
                <div className="space-y-1 md:col-span-2 xl:col-span-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descripción</div>
                  <Input
                    value={mapDescription}
                    onChange={(e) => {
                      setMapDescription(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    placeholder="Ej: Plano calibrado para mantención marzo"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ancho base (m)</div>
                  <Input
                    type="number"
                    min={10}
                    step={1}
                    value={mapConfig.width}
                    onChange={(e) => {
                      setMapConfig((prev) => ({ ...prev, width: Math.max(10, Math.round(Number(e.target.value) || prev.width)), cellSize: 1 }))
                      setHasUnsavedChanges(true)
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profundidad base (m)</div>
                  <Input
                    type="number"
                    min={10}
                    step={1}
                    value={mapConfig.depth}
                    onChange={(e) => {
                      setMapConfig((prev) => ({ ...prev, depth: Math.max(10, Math.round(Number(e.target.value) || prev.depth)), cellSize: 1 }))
                      setHasUnsavedChanges(true)
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCreateBlankMap}>Nuevo lienzo</Button>
                <Button variant="outline" size="sm" onClick={expandCanvasToContent}>Expandir base al contenido</Button>
                <Button variant="outline" size="sm" onClick={fitMapComplete}>Ver mapa completo</Button>
                <Button variant="default" size="sm" onClick={handleSave} disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar'}</Button>
                <Button variant="secondary" size="sm" onClick={handleSaveAsNew} disabled={isSaving}>Guardar como nuevo</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">Grilla base: 1 m × 1 m</Badge>
              <Badge variant="outline">Brocha terreno: 1×1, 3×3, 5×5 m</Badge>
              <Badge variant="outline">Lienzo actual: {mapConfig.width} m × {mapConfig.depth} m</Badge>
              {currentMapId && <Badge variant="outline">ID: {currentMapId}</Badge>}
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto]">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plano base raster (Firebase Mapas)</div>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={selectedBaseLocationId}
                  onChange={(e) => void handleSelectBaseLocation(e.target.value)}
                  disabled={isLoadingBaseMaps}
                >
                  <option value="">Sin plano base</option>
                  {mapLocations.map((location) => (
                    <option key={location.id} value={location.id}>{location.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Opacidad plano base</span>
                  <span>{Math.round((backgroundMap?.opacity ?? 0.45) * 100)}%</span>
                </div>
                <input
                  className="h-10 w-full"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={backgroundMap?.opacity ?? 0.45}
                  disabled={!backgroundMap}
                  onChange={(e) => {
                    const nextOpacity = Number(e.target.value)
                    setBackgroundMap((prev) => prev ? { ...prev, opacity: nextOpacity } : prev)
                    setHasUnsavedChanges(true)
                  }}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant={showBaseMap ? 'default' : 'outline'}
                  size="sm"
                  disabled={!backgroundMap}
                  onClick={() => setShowBaseMap((prev) => !prev)}
                >
                  {showBaseMap ? 'Ocultar plano' : 'Mostrar plano'}
                </Button>
                <select
                  className="flex h-9 rounded-md border border-input bg-background px-2 text-xs"
                  value={calibrationMode ?? ''}
                  disabled={!backgroundMap}
                  onChange={(e) => setCalibrationMode((e.target.value || null) as BackgroundCalibrationMode | null)}
                >
                  <option value="">Sin calibración visual</option>
                  <option value="move">Mover sobre canvas</option>
                  <option value="scale">Escalar sobre canvas</option>
                  <option value="rotate">Rotar sobre canvas</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Estilo visual del plano</div>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={(backgroundMap?.displayMode ?? 'soft-light') as BackgroundDisplayMode}
                  disabled={!backgroundMap}
                  onChange={(e) => {
                    const displayMode = (e.target.value || 'soft-light') as BackgroundDisplayMode
                    setBackgroundMap((prev) => prev ? { ...prev, displayMode } : prev)
                    setHasUnsavedChanges(true)
                  }}
                >
                  <option value="soft-light">Suave integrado</option>
                  <option value="blueprint">Blueprint técnico</option>
                  <option value="original">Original raster</option>
                </select>
                <div className="text-[11px] text-muted-foreground">
                  Suave integrado reduce el efecto parche. Blueprint tiñe el plano para lectura técnica. Original respeta la imagen tal cual.
                </div>
              </div>
            </div>
            {backgroundMap && (
              <>
              <div className="grid gap-3 md:grid-cols-5">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ancho plano (m)</div>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={backgroundMap.width}
                    onChange={(e) => {
                      const value = Math.max(1, Math.round(Number(e.target.value) || backgroundMap.width))
                      applyBackgroundMapUpdate({ width: value })
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Profundidad plano (m)</div>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={backgroundMap.depth}
                    onChange={(e) => {
                      const value = Math.max(1, Math.round(Number(e.target.value) || backgroundMap.depth))
                      applyBackgroundMapUpdate({ depth: value })
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Offset X (m)</div>
                  <Input
                    type="number"
                    step={1}
                    value={backgroundMap.offsetX}
                    onChange={(e) => {
                      const value = Math.round(Number(e.target.value) || 0)
                      applyBackgroundMapUpdate({ offsetX: value })
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Offset Z (m)</div>
                  <Input
                    type="number"
                    step={1}
                    value={backgroundMap.offsetZ}
                    onChange={(e) => {
                      const value = Math.round(Number(e.target.value) || 0)
                      applyBackgroundMapUpdate({ offsetZ: value })
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rotación (°)</div>
                  <Input
                    type="number"
                    step={1}
                    value={backgroundMap.rotation}
                    onChange={(e) => {
                      const value = Math.round(Number(e.target.value) || 0)
                      applyBackgroundMapUpdate({ rotation: value })
                    }}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[1.3fr_1fr]">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={calibrationMode === 'move' ? 'default' : 'outline'}>Drag: mover</Badge>
                    <Badge variant={calibrationMode === 'scale' ? 'default' : 'outline'}>Drag: escalar</Badge>
                    <Badge variant={calibrationMode === 'rotate' ? 'default' : 'outline'}>Drag: rotar</Badge>
                    <Badge variant="outline">Paso teclado: {calibrationStepMeters} m</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={centerBackgroundMap}>Centrar plano</Button>
                    <Button variant="outline" size="sm" onClick={fitBackgroundToCanvas}>Ajustar al lienzo</Button>
                    <Button variant="outline" size="sm" onClick={resetBackgroundCalibration}>Reset calibración</Button>
                    <Button variant="outline" size="sm" onClick={() => setCalibrationStepMeters((prev) => prev === 1 ? 5 : 1)}>{calibrationStepMeters === 1 ? 'Paso 5 m' : 'Paso 1 m'}</Button>
                  </div>
                  <div className="grid grid-cols-[auto_auto_auto] gap-2 w-fit">
                    <div />
                    <Button variant="outline" size="sm" onClick={() => nudgeBackgroundMap(0, -calibrationStepMeters)}>↑</Button>
                    <div />
                    <Button variant="outline" size="sm" onClick={() => nudgeBackgroundMap(-calibrationStepMeters, 0)}>←</Button>
                    <Button variant="outline" size="sm" onClick={() => centerBackgroundMap()}>•</Button>
                    <Button variant="outline" size="sm" onClick={() => nudgeBackgroundMap(calibrationStepMeters, 0)}>→</Button>
                    <div />
                    <Button variant="outline" size="sm" onClick={() => nudgeBackgroundMap(0, calibrationStepMeters)}>↓</Button>
                    <div />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => rotateBackgroundMap(-5)}>Rotar -5°</Button>
                    <Button variant="outline" size="sm" onClick={() => rotateBackgroundMap(5)}>Rotar +5°</Button>
                    <Button variant="outline" size="sm" onClick={() => scaleBackgroundMap(-calibrationStepMeters)}>Escala -</Button>
                    <Button variant="outline" size="sm" onClick={() => scaleBackgroundMap(calibrationStepMeters)}>Escala +</Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Calibración visual: arrastra la imagen en el canvas según el modo activo. Teclado: flechas mueven, [ y ] rotan, +/- escalan, Shift acelera a 5 m.
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-xs">
                  <div className="font-semibold text-foreground">Validación del plano base</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Cobertura X: {backgroundMapMetrics?.coverageX ?? 0}%</Badge>
                    <Badge variant="outline">Cobertura Z: {backgroundMapMetrics?.coverageZ ?? 0}%</Badge>
                    <Badge variant="outline">Densidad: {backgroundMapMetrics?.densityLabel ?? 'N/D'}</Badge>
                  </div>
                  <div>Raster: {backgroundMap.imageWidthPx ?? 'N/D'} × {backgroundMap.imageHeightPx ?? 'N/D'} px</div>
                  <div>Escala X: {backgroundMapMetrics?.pixelsPerMeterX ? `${backgroundMapMetrics.pixelsPerMeterX.toFixed(2)} px/m` : 'Sin dato'}</div>
                  <div>Escala Z: {backgroundMapMetrics?.pixelsPerMeterZ ? `${backgroundMapMetrics.pixelsPerMeterZ.toFixed(2)} px/m` : 'Sin dato'}</div>
                  <div className="text-muted-foreground">
                    Referencia práctica: sobre 3 px/m ya sirve para layout operativo; sobre 8 px/m queda cómodo para alineación fina.
                  </div>
                </div>
              </div>
              </>
            )}
            <div className="text-xs text-muted-foreground">{baseMapStatusText}</div>
            <div className="text-xs text-muted-foreground">{mapStatusText}</div>
          </CardContent>
        </Card>
      )}

      {/* Status Legend */}
      {FEATURES.statusSummary && <Card>
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
      </Card>}

      {/* Main 3D Viewport + Controls */}
      {!isTerrainBaseStage && (
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
                config={mapConfig}
                underlayImageUrl={showBaseMap ? backgroundMap?.imageUrl ?? null : null}
                underlayDisplayMode={backgroundMap?.displayMode ?? 'soft-light'}
                underlayOpacity={backgroundMap?.opacity ?? 0.45}
                underlayWidth={backgroundMap?.width}
                underlayDepth={backgroundMap?.depth}
                underlayOffset={backgroundMap ? { x: backgroundMap.offsetX, z: backgroundMap.offsetZ } : undefined}
                underlayRotation={backgroundMap?.rotation}
                underlayInteractionMode={showBaseMap ? calibrationMode : null}
                onUnderlayTransform={applyBackgroundMapUpdate}
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
            {FEATURES.editorToolbar && isEditMode && (
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
            {FEATURES.editorBadge && isEditMode && (
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
            {FEATURES.buildDock && isEditMode && (
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
              {FEATURES.equipmentToggle && !isTerrainBaseStage && (
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
              )}

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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => { void handleToggleFullscreen() }}
                    title={isFullscreen ? 'Salir pantalla completa' : 'Pantalla completa'}
                  >
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </Button>
              </div>
            </div>

            {isFullscreen && (
              <div className="absolute top-4 right-4 z-30">
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1.5 shadow-lg"
                  onClick={() => { void handleToggleFullscreen() }}
                >
                  <Minimize2 className="h-4 w-4" />
                  Salir fullscreen
                </Button>
              </div>
            )}

            {/* Compass widget (top-right) */}
            {showCompass && (
              <div className="absolute top-4 right-4 z-20" style={{ marginTop: isFullscreen ? 48 : 0 }}>
                <CompassWidget cameraAngle={viewerState.cameraAngle} />
              </div>
            )}

            {/* Geo-coordinates + elevation hover badge (top center) */}
            {terrainHoverPosition && (hoveredGeoCoord || hoveredTerrainElevation !== null) && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                <div className="bg-card/90 backdrop-blur rounded-md border px-3 py-1 text-[11px] flex items-center gap-3 shadow">
                  {hoveredTerrainElevation !== null && (
                    <span className="font-mono text-foreground">
                      Cota {hoveredTerrainElevation > 0 ? `+${hoveredTerrainElevation.toFixed(1)}` : hoveredTerrainElevation.toFixed(1)}m
                    </span>
                  )}
                  {terrainHoverPosition && (
                    <span className="text-muted-foreground font-mono">
                      [{Math.round(terrainHoverPosition.x)}, {Math.round(terrainHoverPosition.z)}]
                    </span>
                  )}
                  {hoveredGeoCoord && (
                    <span className="text-muted-foreground font-mono">
                      {hoveredGeoCoord.lat.toFixed(6)}° {hoveredGeoCoord.lon.toFixed(6)}°
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Minimap (bottom-right) */}
            {showMinimap && terrainTiles.length > 0 && (
              <div className="absolute bottom-4 right-4 z-20">
                <Minimap
                  config={mapConfig}
                  terrain={terrainTiles}
                  viewerState={viewerState}
                  canvasAspect={mapConfig.width / mapConfig.depth}
                />
              </div>
            )}

            {/* Stats panel (top-left, below terrain card) */}
            {showStatsPanel && (
              <div className="absolute top-4 right-4 z-10" style={{ marginTop: showCompass ? 80 : 0, marginRight: 0 }}>
                <MapStatsPanel
                  config={mapConfig}
                  nodes={nodes}
                  areas={areas}
                  connectors={connectors}
                  terrain={terrainTiles}
                />
              </div>
            )}

            {/* HUD toggle buttons (top-right, below compass) */}
            <div className="absolute z-20 flex flex-col gap-1" style={{ top: showCompass ? 80 : 12, right: showStatsPanel ? 220 : 12 }}>
              <Button
                variant={showGeoCoords ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
                onClick={() => setShowGeoCoords(!showGeoCoords)}
                title={showGeoCoords ? 'Ocultar coordenadas geo' : 'Mostrar coordenadas geo'}
                disabled={!terrainGeoBounds}
              >
                <MapPin className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={showCompass ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
                onClick={() => setShowCompass(!showCompass)}
                title={showCompass ? 'Ocultar brújula' : 'Mostrar brújula'}
              >
                <Compass className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={showMinimap ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
                onClick={() => setShowMinimap(!showMinimap)}
                title={showMinimap ? 'Ocultar minimapa' : 'Mostrar minimapa'}
              >
                <Layers className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={showStatsPanel ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
                onClick={() => setShowStatsPanel(!showStatsPanel)}
                title={showStatsPanel ? 'Ocultar estadísticas' : 'Mostrar estadísticas'}
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant={measureMode ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7 bg-card/80 backdrop-blur border shadow-sm"
                onClick={() => {
                  setMeasureMode(!measureMode)
                  setMeasurePoints([])
                }}
                title={measureMode ? 'Desactivar regla' : 'Medir distancia'}
              >
                <Ruler className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Measurement result badge */}
            {measureMode && measurePoints.length === 2 && (
              <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
                <Badge variant="default" className="bg-blue-600 text-white text-xs gap-1 shadow-lg">
                  <Ruler className="h-3 w-3" />
                  {(() => {
                    const a = measurePoints[0]!
                    const b = measurePoints[1]!
                    const dx = b.x - a.x
                    const dz = b.z - a.z
                    const dist = Math.sqrt(dx * dx + dz * dz)
                    return `${dist.toFixed(1)} m`
                  })()}
                  <button
                    className="ml-1 opacity-70 hover:opacity-100"
                    onClick={() => setMeasurePoints([])}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              </div>
            )}

            <div className="absolute top-4 left-4 flex flex-col gap-2">
              {terrainDimensionSummary && (
                <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border p-2.5 w-[260px]">
                  <p className="text-[10px] text-muted-foreground font-medium px-1 mb-2">COTA DEL TERRENO</p>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded border bg-background/70 px-2 py-1.5">
                      <div className="text-muted-foreground">Ancho</div>
                      <div className="font-semibold text-foreground">{terrainDimensionSummary.widthMeters} m</div>
                    </div>
                    <div className="rounded border bg-background/70 px-2 py-1.5">
                      <div className="text-muted-foreground">Largo</div>
                      <div className="font-semibold text-foreground">{terrainDimensionSummary.depthMeters} m</div>
                    </div>
                    <div className="rounded border bg-background/70 px-2 py-1.5">
                      <div className="text-muted-foreground">Hacia arriba</div>
                      <div className="font-semibold text-foreground">+{terrainDimensionSummary.riseMeters} m</div>
                    </div>
                    <div className="rounded border bg-background/70 px-2 py-1.5">
                      <div className="text-muted-foreground">Hacia abajo</div>
                      <div className="font-semibold text-foreground">-{terrainDimensionSummary.dropMeters} m</div>
                    </div>
                  </div>
                  <div className="mt-2 rounded border bg-background/70 px-2 py-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Desnivel total</span>
                      <span className="font-semibold text-foreground">{terrainDimensionSummary.reliefMeters} m</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-muted-foreground">
                      <span>Cota min {terrainDimensionSummary.minElevation} m</span>
                      <span>Cota max {terrainDimensionSummary.maxElevation} m</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Floor selector */}
              {FEATURES.floorSelector && <div className="bg-card/90 backdrop-blur rounded-lg shadow-lg border p-1.5">
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
              </div>}

              {/* Panel auxiliar compacto (modo editor) */}
              {FEATURES.auxPanel && isEditMode && (
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
              {FEATURES.elevationRuler && isEditMode && buildMode === 'terrain' && (
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
            {FEATURES.searchPanel && !isTerrainBaseStage && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <MapSearchPanel
                nodes={nodes}
                areas={areas}
                onSelectNode={(nodeId) => handleNodeClick(nodeId)}
                onSelectArea={handleAreaClick}
                onFocusNode={handleFocusNode}
              />
            </div>
            )}

            {/* Selected node info card (centro abajo) — solo en modo vista */}
            {FEATURES.nodeInfoCard && selectedNode && !isEditMode && !isTerrainBaseStage && (
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

            {/* Panel lateral de propiedades del nodo */}
            {FEATURES.propertiesPanel && isEditMode ? (
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
            ) : null}

            {/* Help hint (bottom right) */}
            {FEATURES.helpHint && <div className="absolute bottom-4 right-4 text-[10px] text-muted-foreground/60 select-none pointer-events-none hidden md:block">
              {isEditMode
                ? 'V: seleccionar · M: mover · A: agregar · B: bulldozer · R: rotar preview · Alt+drag: duplicar · Del: eliminar · Ctrl+Z: deshacer'
                : 'Q/E: rotar · Scroll: zoom · Arrastrar clic izq/Flechas: paneo · R: reset · Click: seleccionar'}
            </div>}

            {/* Editor de áreas — panel lateral sobre la escena 3D */}
            {FEATURES.areaEditor && showAreaEditor && (
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

            {FEATURES.terrainEditorModal && <TerrainEditorModal
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
              terrainImportPreview={terrainImportPreview}
              terrainImportPreviewError={terrainImportPreviewError}
              terrainImportProgress={terrainImportProgress}
            />}

            {/* Gestor de áreas — vista centralizada */}
            {FEATURES.areaManager && showAreaManager && (
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
      )}

      {/* Diálogo de agregar equipo (editor) */}
      {FEATURES.addEquipmentDialog && <AddEquipmentDialog
        isOpen={showAddDialog}
        onClose={() => overlayState.closeOverlayIf('add-equipment')}
        onAdd={handleAddNodeFromDialog}
        allowedTypes={availableAddTypes}
        title={buildMode === 'structures' ? 'Agregar estructura' : buildMode === 'elements' ? 'Agregar elemento' : 'Agregar'}
        selectedAreaLabel={selectedAreaId ? areaById.get(selectedAreaId)?.label ?? null : null}
      />}

      {/* Diálogo de vincular entidad real (editor) */}
      {FEATURES.linkEntityDialog && selectedNode && (
        <LinkEntityDialog
          isOpen={showLinkDialog}
          node={selectedNode}
          onLink={handleLinkEntity}
          onUnlink={handleUnlinkEntity}
          onClose={() => setShowLinkDialog(false)}
        />
      )}

      {/* Editor de forma 3D */}
      {FEATURES.shapeEditorDialog && showShapeEditor && selectedNode && (
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
