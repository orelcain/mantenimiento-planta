/**
 * MapaPlantaPage — Visor georeferenciado de planta Antarfood
 *
 * Reemplaza el visor isométrico 3D por un mapa 2D con:
 *  - Imagen aérea 2023 georeferenciada (4 puntos GPS reales)
 *  - Sensores IoT con estado en tiempo real
 *  - Incidencias con globos informativos y severidad
 *  - Heatmap gradual de zonas con mayor incidencia
 *  - Toggle de capas
 */

import { Suspense, lazy } from 'react'
import { Spinner } from '@/components/ui'
import { useMapaPlanta } from '@/hooks/useMapaPlanta'

// Lazy load para no cargar Leaflet en el bundle inicial
const MapaPlanta = lazy(() =>
  import('@/components/map/leaflet/MapaPlanta').then(m => ({ default: m.MapaPlanta }))
)

export function MapaPlantaPage() {
  const {
    capasActivas,
    toggleCapa,
    sensores,
    incidencias,
    setSensorSeleccionado,
    setIncidenciaSeleccionada,
  } = useMapaPlanta()

  const activas = incidencias.filter(i => i.estado === 'activa').length
  const criticos = sensores.filter(s => s.estado === 'critico').length

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-white">Visor de Planta</h1>
          <span className="text-xs text-gray-500">Antarfood — Recinto Principal</span>
        </div>
        <div className="flex items-center gap-3">
          {criticos > 0 && (
            <span className="flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              {criticos} sensor{criticos > 1 ? 'es' : ''} crítico{criticos > 1 ? 's' : ''}
            </span>
          )}
          {activas > 0 && (
            <span className="flex items-center gap-1 text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              {activas} incidencia{activas > 1 ? 's' : ''} activa{activas > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-gray-600">
            {sensores.length} sensores · {incidencias.length} incidencias
          </span>
        </div>
      </div>

      {/* Mapa — ocupa todo el espacio restante */}
      <div className="flex-1 relative">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full bg-gray-950">
            <Spinner className="w-8 h-8 text-blue-500" />
          </div>
        }>
          <MapaPlanta
            sensores={sensores}
            incidencias={incidencias}
            capasActivas={capasActivas}
            onToggleCapa={toggleCapa}
            onSensorClick={setSensorSeleccionado}
            onIncidenciaClick={setIncidenciaSeleccionada}
          />
        </Suspense>
      </div>
    </div>
  )
}
