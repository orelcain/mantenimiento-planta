/** Tipos compartidos del módulo Leaflet de planta */

export type EstadoSensor = 'ok' | 'alerta' | 'critico' | 'offline'
export type SeveridadIncidencia = 'baja' | 'media' | 'alta' | 'critica'
export type EstadoIncidencia = 'activa' | 'en_proceso' | 'resuelta'

export interface SensorMapa {
  id: string
  label: string
  tipo: string
  lat: number
  lng: number
  estado: EstadoSensor
  valor?: number
  unidad?: string
  equipoId?: string
  ultimaLectura?: string
}

export interface IncidenciaMapa {
  id: string
  titulo: string
  descripcion?: string
  lat: number
  lng: number
  severidad: SeveridadIncidencia
  estado: EstadoIncidencia
  zona?: string
  fecha: string
  reportadoPor?: string
}

export interface CapasActivas {
  vistaAerea: boolean
  sensores: boolean
  incidencias: boolean
  heatmap: boolean
  infraestructura: boolean
}

export interface MapaPlantaProps {
  sensores?: SensorMapa[]
  incidencias?: IncidenciaMapa[]
  capasActivas: CapasActivas
  onToggleCapa: (capa: keyof CapasActivas) => void
  onSensorClick?: (sensor: SensorMapa) => void
  onIncidenciaClick?: (incidencia: IncidenciaMapa) => void
}
