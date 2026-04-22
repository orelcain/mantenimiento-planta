/**
 * Configuración de capas extraídas del DXF "recinto completo".
 * Coordenadas en metros locales del arquitecto (CRS.Simple en Leaflet).
 *
 * Bounds reales (de los datos):  X ∈ [731, 793],  Y ∈ [-654, -595]   (62 × 59 m)
 *
 * Cada capa es un GeoJSON estático en /maps/dxf/{name}.geojson
 */

export interface DxfLayerConfig {
  /** Nombre del archivo GeoJSON (sin extensión) */
  name: string
  /** Etiqueta visible al usuario */
  label: string
  /** Categoría agrupable */
  group: 'estructura' | 'instalaciones' | 'cerco' | 'detalle' | 'otros'
  /** Color del trazo */
  color: string
  /** Grosor del trazo en px */
  weight: number
  /** Opacidad (0-1) */
  opacity: number
  /** Visible por defecto */
  defaultVisible: boolean
  /** Z-index relativo (mayor = encima) */
  zIndex: number
}

export const DXF_LAYERS: DxfLayerConfig[] = [
  // ─── Estructura mayor ────────────────────────────────────────────────
  { name: 'CERCO',         label: 'Cerco perimetral',  group: 'cerco',        color: '#22c55e', weight: 2.0, opacity: 1.0, defaultVisible: true,  zIndex: 100 },
  { name: 'MURO',          label: 'Muros principales', group: 'estructura',   color: '#f59e0b', weight: 1.8, opacity: 1.0, defaultVisible: true,  zIndex: 90 },
  { name: 'CIMENTACION',   label: 'Cimentación',       group: 'estructura',   color: '#ef4444', weight: 1.0, opacity: 0.7, defaultVisible: true,  zIndex: 60 },

  // ─── Detalle interior ────────────────────────────────────────────────
  { name: '023_MUROS_2',   label: 'Muros internos',    group: 'detalle',      color: '#a78bfa', weight: 0.6, opacity: 0.85, defaultVisible: true, zIndex: 70 },
  { name: 'CAMARA',        label: 'Cámaras frío',      group: 'instalaciones',color: '#06b6d4', weight: 1.5, opacity: 1.0, defaultVisible: true,  zIndex: 80 },
  { name: 'VENTANAS',      label: 'Ventanas',          group: 'detalle',      color: '#60a5fa', weight: 0.8, opacity: 0.85, defaultVisible: true, zIndex: 65 },
  { name: 'ESCALERA',      label: 'Escaleras',         group: 'detalle',      color: '#34d399', weight: 0.8, opacity: 0.85, defaultVisible: true, zIndex: 65 },
  { name: 'BARRERA',       label: 'Barreras',          group: 'detalle',      color: '#fb923c', weight: 1.0, opacity: 0.85, defaultVisible: true, zIndex: 75 },

  // ─── Instalaciones ────────────────────────────────────────────────────
  { name: 'GENERADOR',     label: 'Generador',         group: 'instalaciones',color: '#fde047', weight: 1.5, opacity: 1.0, defaultVisible: true,  zIndex: 85 },
  { name: 'BENCINA',       label: 'Bencinera',         group: 'instalaciones',color: '#fbbf24', weight: 1.0, opacity: 0.9, defaultVisible: true,  zIndex: 75 },
  { name: 'ESTANQUE-AGUA', label: 'Estanque agua',     group: 'instalaciones',color: '#22d3ee', weight: 1.5, opacity: 1.0, defaultVisible: true,  zIndex: 80 },
  { name: 'AGUA',          label: 'Agua',              group: 'instalaciones',color: '#0ea5e9', weight: 1.0, opacity: 0.7, defaultVisible: true,  zIndex: 50 },

  // ─── Otros ────────────────────────────────────────────────────────────
  { name: 'A_PV',          label: 'Pavimento',         group: 'otros',        color: '#facc15', weight: 0.8, opacity: 0.6, defaultVisible: false, zIndex: 40 },
  { name: 'CAMINO',        label: 'Camino',            group: 'otros',        color: '#a3a3a3', weight: 1.0, opacity: 0.7, defaultVisible: true,  zIndex: 45 },
  { name: 'PLANTA',        label: 'Planta',            group: 'otros',        color: '#10b981', weight: 1.0, opacity: 0.7, defaultVisible: false, zIndex: 55 },
  { name: 'LOTEA',         label: 'Lote',              group: 'otros',        color: '#f472b6', weight: 1.5, opacity: 0.7, defaultVisible: true,  zIndex: 95 },
  { name: 'DIBUJO',        label: 'Dibujo',            group: 'otros',        color: '#94a3b8', weight: 0.5, opacity: 0.5, defaultVisible: false, zIndex: 30 },
]

/** Bounds reales del DXF (lat=Y, lng=X en CRS.Simple) */
export const DXF_BOUNDS: [[number, number], [number, number]] = [
  [-654, 731],  // SW (Y mínimo, X mínimo)
  [-595, 793],  // NE (Y máximo, X máximo)
]

/** Centro del recinto */
export const DXF_CENTER: [number, number] = [
  (-654 + -595) / 2,  // Y promedio
  (731 + 793) / 2,    // X promedio
]

// ═══════════════════════════════════════════════════════════════════════════
// VISTA INTERIOR (planta-principal.dxf)
// Coordenadas en milímetros del arquitecto. Bounds ~87.6 × 55.6 m físicos.
// ═══════════════════════════════════════════════════════════════════════════

export const DXF_INTERIOR_LAYERS: DxfLayerConfig[] = [
  { name: '023_MUROS_2',                 label: 'Muros',                 group: 'estructura',   color: '#f59e0b', weight: 0.8, opacity: 1.0,  defaultVisible: true,  zIndex: 90 },
  { name: 'CIMENTACION',                 label: 'Cimentación',           group: 'estructura',   color: '#ef4444', weight: 1.2, opacity: 0.7,  defaultVisible: true,  zIndex: 70 },
  { name: 'P-ESTRUCTURA_NUEVA',          label: 'Estructura nueva',      group: 'estructura',   color: '#a78bfa', weight: 1.5, opacity: 0.95, defaultVisible: true,  zIndex: 85 },
  { name: 'ESCALERAS',                   label: 'Escaleras',             group: 'detalle',      color: '#34d399', weight: 1.0, opacity: 0.85, defaultVisible: true,  zIndex: 65 },
  { name: 'VENTANAS',                    label: 'Ventanas',              group: 'detalle',      color: '#60a5fa', weight: 1.0, opacity: 0.85, defaultVisible: true,  zIndex: 60 },
  { name: 'VANO-PUERTAS',                label: 'Puertas',               group: 'detalle',      color: '#22d3ee', weight: 1.5, opacity: 0.95, defaultVisible: true,  zIndex: 65 },
  { name: 'VANO-ANTEPECHOS',             label: 'Antepechos',            group: 'detalle',      color: '#7dd3fc', weight: 1.0, opacity: 0.7,  defaultVisible: true,  zIndex: 55 },
  { name: 'EQP-EQUIPOS_-_SITUACION_P0',  label: 'Equipos actuales',      group: 'instalaciones',color: '#22c55e', weight: 1.2, opacity: 1.0,  defaultVisible: true,  zIndex: 80 },
  { name: 'EQP-EQUIPOS_-_SITUACION_PR',  label: 'Equipos proyecto',      group: 'instalaciones',color: '#facc15', weight: 1.0, opacity: 0.7,  defaultVisible: false, zIndex: 75 },
  { name: 'P-EQUIPO_REUBICADO',          label: 'Equipo reubicado',      group: 'instalaciones',color: '#fb923c', weight: 1.0, opacity: 0.7,  defaultVisible: false, zIndex: 75 },
  { name: 'MUEBLES',                     label: 'Muebles',               group: 'otros',        color: '#94a3b8', weight: 0.6, opacity: 0.5,  defaultVisible: false, zIndex: 40 },
]

/** Bounds del interior (de los datos) */
export const DXF_INTERIOR_BOUNDS: [[number, number], [number, number]] = [
  [3572, 5948],     // SW
  [59154, 93554],   // NE
]

export const DXF_INTERIOR_CENTER: [number, number] = [
  (3572 + 59154) / 2,
  (5948 + 93554) / 2,
]

// ═══════════════════════════════════════════════════════════════════════════

export type ViewName = 'recinto' | 'interior'

export interface MapView {
  name: ViewName
  label: string
  layers: DxfLayerConfig[]
  bounds: [[number, number], [number, number]]
  center: [number, number]
  /** Subdirectorio dentro de /maps/ */
  folder: string
  /** Factor de unidad (m por unidad nativa). Recinto=1, Interior=0.001 (mm→m) */
  unitScale: number
}

export const MAP_VIEWS: Record<ViewName, MapView> = {
  recinto: {
    name: 'recinto',
    label: 'Recinto',
    layers: DXF_LAYERS,
    bounds: DXF_BOUNDS,
    center: DXF_CENTER,
    folder: 'dxf',
    unitScale: 1,
  },
  interior: {
    name: 'interior',
    label: 'Interior',
    layers: DXF_INTERIOR_LAYERS,
    bounds: DXF_INTERIOR_BOUNDS,
    center: DXF_INTERIOR_CENTER,
    folder: 'dxf-interior',
    unitScale: 0.001,
  },
}
