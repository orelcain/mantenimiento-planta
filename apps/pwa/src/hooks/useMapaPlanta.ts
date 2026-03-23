/** Hook de estado para el módulo MapaPlanta */

import { useState, useCallback } from 'react'
import type { CapasActivas, SensorMapa, IncidenciaMapa } from '@/components/map/leaflet/types'

const CAPAS_DEFAULT: CapasActivas = {
  vistaAerea:      true,
  sensores:        true,
  incidencias:     true,
  heatmap:         false,
  infraestructura: false,
}

// Datos demo para desarrollo — reemplazar con Firestore
const SENSORES_DEMO: SensorMapa[] = [
  { id: 's1', label: 'Sensor Bomba 1', tipo: 'Presión',    lat: -42.6315, lng: -73.7605, estado: 'ok',      valor: 4.2, unidad: 'bar' },
  { id: 's2', label: 'Sensor Bomba 2', tipo: 'Presión',    lat: -42.6320, lng: -73.7595, estado: 'alerta',  valor: 6.8, unidad: 'bar' },
  { id: 's3', label: 'Temp. Cámara 1', tipo: 'Temperatura',lat: -42.6310, lng: -73.7620, estado: 'ok',      valor: 2.1, unidad: '°C' },
  { id: 's4', label: 'Nivel Estanque A',tipo: 'Nivel',     lat: -42.6308, lng: -73.7590, estado: 'critico', valor: 12,  unidad: '%' },
  { id: 's5', label: 'Caudal Agua Dulce',tipo: 'Caudal',   lat: -42.6325, lng: -73.7615, estado: 'offline' },
]

const INCIDENCIAS_DEMO: IncidenciaMapa[] = [
  { id: 'i1', titulo: 'Falla bomba principal', descripcion: 'Presión fuera de rango',       lat: -42.6318, lng: -73.7598, severidad: 'critica', estado: 'activa',     zona: 'Sala de bombas',   fecha: '2026-03-23 08:30', reportadoPor: 'J. Morales' },
  { id: 'i2', titulo: 'Filtro obstruido',       descripcion: 'Requiere limpieza preventiva', lat: -42.6312, lng: -73.7608, severidad: 'media',   estado: 'en_proceso', zona: 'Planta principal', fecha: '2026-03-22 14:15', reportadoPor: 'C. Díaz' },
  { id: 'i3', titulo: 'Correa transportadora',  descripcion: 'Desgaste detectado',           lat: -42.6305, lng: -73.7618, severidad: 'alta',    estado: 'activa',     zona: 'Patio exterior',   fecha: '2026-03-23 06:00', reportadoPor: 'A. Torres' },
  { id: 'i4', titulo: 'Sensor nivel OK',         descripcion: 'Calibración exitosa',          lat: -42.6322, lng: -73.7585, severidad: 'baja',    estado: 'resuelta',   zona: 'Estanques',        fecha: '2026-03-21 10:00', reportadoPor: 'Sistema' },
]

export function useMapaPlanta() {
  const [capasActivas, setCapasActivas] = useState<CapasActivas>(CAPAS_DEFAULT)
  const [sensorSeleccionado, setSensorSeleccionado] = useState<SensorMapa | null>(null)
  const [incidenciaSeleccionada, setIncidenciaSeleccionada] = useState<IncidenciaMapa | null>(null)

  const toggleCapa = useCallback((capa: keyof CapasActivas) => {
    setCapasActivas(prev => ({ ...prev, [capa]: !prev[capa] }))
  }, [])

  return {
    capasActivas,
    toggleCapa,
    sensores: SENSORES_DEMO,
    incidencias: INCIDENCIAS_DEMO,
    sensorSeleccionado,
    setSensorSeleccionado,
    incidenciaSeleccionada,
    setIncidenciaSeleccionada,
  }
}
