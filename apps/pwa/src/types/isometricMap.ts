/**
 * Tipos para el Mapa Isométrico de Planta
 * 
 * Sistema de visualización 3D isométrica con:
 * - Three.js + Cámara Ortográfica
 * - Grilla 1m × 1m a escala real
 * - Rotación 4 ángulos estilo FFT (0°, 90°, 180°, 270°)
 * - Overlay de datos en tiempo real
 */

// ============================================================
// Configuración del Mapa
// ============================================================

/** Ángulos de rotación de cámara estilo Final Fantasy Tactics */
export type CameraAngle = 0 | 1 | 2 | 3

/** Nombres de las 4 vistas */
export const CAMERA_ANGLE_NAMES: Record<CameraAngle, string> = {
  0: 'Sur-Oeste',
  1: 'Sur-Este',
  2: 'Nor-Este',
  3: 'Nor-Oeste',
}

/** Azimut en radianes para cada ángulo (cada 90°) */
export const CAMERA_ANGLE_AZIMUTH: Record<CameraAngle, number> = {
  0: Math.PI / 4,           // 45°  — Vista clásica isométrica
  1: (3 * Math.PI) / 4,     // 135°
  2: (5 * Math.PI) / 4,     // 225°
  3: (7 * Math.PI) / 4,     // 315°
}

/** Elevación isométrica estándar (~35.264° = arctan(1/√2)) */
export const ISO_ELEVATION = Math.atan(1 / Math.SQRT2)

/** Escala base: cada cuadrante equivale a 1m × 1m × 1m */
export const GRID_CELL_METERS = 1
export const VERTICAL_UNIT_METERS = 1

/** Nivel del mar y límites de elevación construible (en metros) */
export const SEA_LEVEL_ELEVATION = 0
export const MIN_TERRAIN_ELEVATION = -50
export const MAX_TERRAIN_ELEVATION = 200

/** Niveles rápidos para navegación de pisos/elevación */
export const ELEVATION_PRESET_LEVELS = [-50, 0, 50, 100, 150, 200] as const

export function clampElevation(value: number): number {
  return Math.max(MIN_TERRAIN_ELEVATION, Math.min(MAX_TERRAIN_ELEVATION, Math.round(value)))
}

export function formatElevationLabel(level: number): string {
  const normalized = clampElevation(level)
  if (normalized === SEA_LEVEL_ELEVATION) return 'Nivel del mar (0 m)'
  return `${normalized > 0 ? '+' : ''}${normalized} m`
}

/** Configuración visual del mapa */
export interface IsometricMapConfig {
  /** Ancho de la planta en metros */
  width: number
  /** Profundidad de la planta en metros */
  depth: number
  /** Tamaño de cada celda de la grilla en metros (default: 1) */
  cellSize: number
  /** Color de fondo del suelo */
  floorColor: string
  /** Color de las líneas de la grilla */
  gridColor: string
  /** Opacidad de la grilla (0-1) */
  gridOpacity: number
  /** Mostrar grilla */
  showGrid: boolean
  /** Mostrar etiquetas de ejes */
  showAxisLabels: boolean
}

export const DEFAULT_MAP_CONFIG: IsometricMapConfig = {
  width: 80,
  depth: 50,
  cellSize: GRID_CELL_METERS,
  floorColor: '#1a1a2e',
  gridColor: '#4a9eff',
  gridOpacity: 0.15,
  showGrid: true,
  showAxisLabels: true,
}

// ============================================================
// Elementos del Mapa
// ============================================================

/** Tipos de equipos que se pueden colocar en el mapa */
export type EquipmentNodeType =
  | 'pump'           // Bomba
  | 'motor'          // Motor eléctrico
  | 'conveyor'       // Cinta transportadora
  | 'tank'           // Tanque/estanque
  | 'compressor'     // Compresor
  | 'valve'          // Válvula
  | 'sensor'         // Sensor IoT
  | 'pipe'           // Tubería
  | 'building'       // Edificio/estructura
  | 'evaporator'     // Evaporador (serpentín + ventiladores)
  | 'condenser'      // Condensador
  | 'panel'          // Tablero eléctrico/control
  | 'extractor'      // Extractor de aire / ventilador
  | 'transformer'    // Transformador eléctrico
  | 'boiler'         // Caldera
  | 'generic'        // Genérico

/** Modos de edición tipo construcción (estilo Sims) */
export type BuildEditMode = 'terrain' | 'structures' | 'elements'

/** Tipos que se consideran estructura/contenedor */
export const STRUCTURE_NODE_TYPES: EquipmentNodeType[] = ['building']

/** Tipos que se consideran elementos/equipos dentro-fuera de estructuras */
export const ELEMENT_NODE_TYPES: EquipmentNodeType[] = [
  'pump',
  'motor',
  'conveyor',
  'tank',
  'compressor',
  'valve',
  'sensor',
  'pipe',
  'evaporator',
  'condenser',
  'panel',
  'extractor',
  'transformer',
  'boiler',
  'generic',
]

/** Colores por tipo de equipo */
export const EQUIPMENT_TYPE_COLORS: Record<EquipmentNodeType, string> = {
  pump: '#3b82f6',       // Azul
  motor: '#f59e0b',      // Ámbar
  conveyor: '#8b5cf6',   // Violeta
  tank: '#06b6d4',       // Cyan
  compressor: '#ec4899',  // Rosa
  valve: '#10b981',      // Esmeralda
  sensor: '#14b8a6',     // Teal
  pipe: '#6b7280',       // Gris
  building: '#78716c',   // Stone
  evaporator: '#0ea5e9', // Sky
  condenser: '#f97316',  // Orange
  panel: '#a855f7',      // Purple
  extractor: '#22d3ee',  // Cyan claro
  transformer: '#eab308', // Yellow
  boiler: '#dc2626',     // Rojo
  generic: '#94a3b8',    // Slate
}

/** Etiquetas en español por tipo */
export const EQUIPMENT_TYPE_LABELS: Record<EquipmentNodeType, string> = {
  pump: 'Bomba',
  motor: 'Motor',
  conveyor: 'Transportador',
  tank: 'Tanque',
  compressor: 'Compresor',
  valve: 'Válvula',
  sensor: 'Sensor',
  pipe: 'Tubería',
  building: 'Edificio',
  evaporator: 'Evaporador',
  condenser: 'Condensador',
  panel: 'Tablero',
  extractor: 'Extractor',
  transformer: 'Transformador',
  boiler: 'Caldera',
  generic: 'Equipo',
}

/** Estado operativo visual */
export type OperationalStatus = 'ok' | 'warning' | 'critical' | 'offline' | 'maintenance'

export const STATUS_COLORS: Record<OperationalStatus, string> = {
  ok: '#22c55e',
  warning: '#f59e0b',
  critical: '#ef4444',
  offline: '#6b7280',
  maintenance: '#3b82f6',
}

export const STATUS_LABELS: Record<OperationalStatus, string> = {
  ok: 'Operativo',
  warning: 'Advertencia',
  critical: 'Crítico',
  offline: 'Desconectado',
  maintenance: 'En mantención',
}

// ============================================================
// Primitivas de forma 3D (para editor de formas custom)
// ============================================================

export type ShapePrimitiveType = 'box' | 'cylinder' | 'sphere' | 'cone' | 'torus'

/** Una primitiva 3D posicionable dentro de un equipo */
export interface ShapePrimitive {
  id: string
  type: ShapePrimitiveType
  /** Posición relativa al centro del nodo (metros) */
  position: { x: number; y: number; z: number }
  /** Tamaño en metros — significado depende del tipo:
   *  box: width, height, depth
   *  cylinder: radius(x), height(y), radius(z)  (z ignored, uses x)
   *  sphere: radius(x) (y,z ignored)
   *  cone: radius(x), height(y)
   *  torus: radius(x), tube(y) */
  size: { x: number; y: number; z: number }
  /** Rotación en grados (x, y, z) */
  rotation: { x: number; y: number; z: number }
  /** Color de la primitiva */
  color: string
  /** Metalness 0-1 */
  metalness: number
  /** Roughness 0-1 */
  roughness: number
}

/** Un elemento (equipo/sensor/zona) posicionado en el mapa */
export interface MapNode {
  id: string
  /** Nombre visible */
  label: string
  /** Tipo de equipo para rendering */
  type: EquipmentNodeType
  /** Posición en metros (coordenada mundo) */
  position: { x: number; y: number; z: number }
  /** Tamaño en metros (ancho, alto, profundidad) */
  size: { width: number; height: number; depth: number }
  /** Rotación en grados (eje Y) */
  rotation: number
  /** Nivel de elevación base (metros respecto a nivel del mar, default 0) */
  floor?: number
  /** Vinculación con entidad real en Firestore */
  linkedEntityType?: 'equipment' | 'plantAsset' | 'iotDevice' | 'zone'
  linkedEntityId?: string
  /** Vinculación opcional con área del mapa */
  linkedAreaId?: string
  /** Color override (si no, usa color del tipo) */
  color?: string
  /** Primitivas custom (si se definen, reemplazan la geometría por defecto) */
  customShape?: ShapePrimitive[]
  /** Visible en el mapa */
  visible: boolean
  /** Metadatos extra */
  metadata?: Record<string, unknown>
}

/** Conector entre dos nodos (tubería, cable, flujo) */
export interface MapConnector {
  id: string
  fromNodeId: string
  toNodeId: string
  label?: string
  style: 'pipe' | 'cable' | 'flow' | 'signal'
  color?: string
  /** Animación de flujo */
  animated: boolean
}

/** Área en el mapa (zona lógica) — puede ser rectangular o definida por tiles */
export interface MapArea {
  id: string
  label: string
  /** Posición centro (para áreas rectangulares) */
  position: { x: number; z: number }
  /** Tamaño (para áreas rectangulares) */
  size: { width: number; depth: number }
  color: string
  opacity: number
  /** Nivel de elevación del área (metros respecto a nivel del mar, default 0) */
  floor?: number
  /** Tiles seleccionados al estilo FFT (coordenadas de grilla) — si se define, usa tiles en vez de rectángulo */
  tiles?: { x: number; z: number }[]
  linkedZoneId?: string
}

/** Celda de terreno editable (cuadrante 1m x 1m con elevación en metros) */
export interface TerrainTile {
  x: number
  z: number
  /** Cota del terreno en metros respecto a nivel del mar */
  elevation: number
}

// ============================================================
// Documento del Mapa (Firestore)
// ============================================================

/** Mapa isométrico completo guardado en Firestore */
export interface IsometricMap {
  id: string
  nombre: string
  descripcion?: string
  /** Versión del layout (para historial) */
  version: number
  /** Configuración del canvas */
  config: IsometricMapConfig
  /** Nodos (equipos, sensores) */
  nodes: MapNode[]
  /** Conectores (tuberías, cables) */
  connectors: MapConnector[]
  /** Áreas/zonas */
  areas: MapArea[]
  /** Terreno voxel por cuadrantes de 1m */
  terrain?: TerrainTile[]
  /** Metadatos */
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// ============================================================
// Runtime (no persistido)
// ============================================================

/** Data en tiempo real que se superpone al mapa */
export interface NodeRuntimeData {
  nodeId: string
  status: OperationalStatus
  /** Incidencias activas vinculadas */
  activeIncidents: number
  /** Último valor del sensor (si aplica) */
  sensorValue?: number
  sensorUnit?: string
  /** Tooltip extra */
  tooltip?: string
}

/** Estado global del visor isométrico */
export interface IsometricViewerState {
  /** Ángulo actual de la cámara (0-3) */
  cameraAngle: CameraAngle
  /** Nivel de zoom */
  zoom: number
  /** Offset de paneo (desplazamiento del centro de la cámara en el plano XZ) */
  panOffset: { x: number; z: number }
  /** Nodo seleccionado */
  selectedNodeId: string | null
  /** Nodo hover */
  hoveredNodeId: string | null
  /** Modo del visor */
  mode: 'view' | 'edit'
  /** Nivel de elevación actual visualizado (metros respecto a nivel del mar) */
  currentFloor: number
  /** Filtros activos */
  filters: {
    showEquipment: boolean
    showPumps: boolean
    showMotors: boolean
    showSensors: boolean
    showConnectors: boolean
    showAreas: boolean
    showAlerts: boolean
    showLabels: boolean
  }
}

/** Zoom objetivo para acción "Ver mapa completo" */
export const FULL_MAP_VIEW_ZOOM = 40

/** Zoom máximo permitido al alejar manualmente */
export const MAX_VIEWER_ZOOM = 500

export const DEFAULT_VIEWER_STATE: IsometricViewerState = {
  cameraAngle: 0,
  zoom: FULL_MAP_VIEW_ZOOM,
  panOffset: { x: 0, z: 0 },
  selectedNodeId: null,
  hoveredNodeId: null,
  mode: 'view',
  currentFloor: SEA_LEVEL_ELEVATION,
  filters: {
    showEquipment: true,
    showPumps: true,
    showMotors: true,
    showSensors: true,
    showConnectors: true,
    showAreas: true,
    showAlerts: true,
    showLabels: false,
  },
}
