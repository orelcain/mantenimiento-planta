/**
 * MapaPlanta — Visor georeferenciado de la planta Antarfood
 *
 * Capas:
 *  - Imagen aérea 2023 georeferenciada sobre Leaflet
 *  - Sensores IoT con estado en tiempo real
 *  - Incidencias con globos informativos
 *  - Heatmap de zonas de mayor incidencia
 *  - Toggle de capas
 */

import { useEffect } from 'react'
import { MapContainer, ImageOverlay, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import { LatLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { CapaSensores } from './CapaSensores'
import { CapaIncidencias } from './CapaIncidencias'
import { CapaHeatmap } from './CapaHeatmap'
import { ControlCapas } from './ControlCapas'
import type { MapaPlantaProps } from './types'

// Bounds georeferenciados con 4 puntos GPS del recinto
const BOUNDS_RECINTO = new LatLngBounds(
  [-42.633389, -73.763244], // SW (más al sur y oeste)
  [-42.629392, -73.756375]  // NE (más al norte y este)
)

const CENTRO: [number, number] = [-42.63139, -73.75981]

// Fix icono default de Leaflet con Vite
import L from 'leaflet'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
L.Marker.prototype.options.icon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

function FitBounds() {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(BOUNDS_RECINTO, { padding: [20, 20] })
  }, [map])
  return null
}

export function MapaPlanta({
  sensores = [],
  incidencias = [],
  capasActivas,
  onToggleCapa,
  onSensorClick,
  onIncidenciaClick,
}: MapaPlantaProps) {
  return (
    <div className="relative w-full h-full rounded-lg overflow-hidden">
      <MapContainer
        center={CENTRO}
        zoom={16}
        zoomControl={false}
        className="w-full h-full"
        style={{ background: '#1a2332' }}
      >
        {/* Mapa base satelital (sin API key) */}
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          attribution="Esri, Maxar, Earthstar Geographics"
          maxZoom={20}
        />

        {/* Vista aérea 2023 georeferenciada como overlay */}
        {capasActivas.vistaAerea && (
          <ImageOverlay
            url="/maps/recinto-2023.png"
            bounds={BOUNDS_RECINTO}
            opacity={0.85}
            zIndex={10}
          />
        )}

        {/* Heatmap de incidencias */}
        {capasActivas.heatmap && (
          <CapaHeatmap incidencias={incidencias} />
        )}

        {/* Sensores */}
        {capasActivas.sensores && (
          <CapaSensores sensores={sensores} onSensorClick={onSensorClick} />
        )}

        {/* Incidencias */}
        {capasActivas.incidencias && (
          <CapaIncidencias incidencias={incidencias} onIncidenciaClick={onIncidenciaClick} />
        )}

        <ZoomControl position="bottomright" />
        <FitBounds />
      </MapContainer>

      {/* Panel de control de capas */}
      <ControlCapas
        capasActivas={capasActivas}
        onToggle={onToggleCapa}
        totalSensores={sensores.length}
        totalIncidencias={incidencias.filter(i => i.estado === 'activa').length}
      />
    </div>
  )
}
