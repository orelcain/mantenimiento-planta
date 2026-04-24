/**
 * MapaImportadoView
 * Renderiza un MapaImportado como mapa Leaflet editable.
 * Usa CRS.Simple igual que PlantaLeafletEditable.
 * Panel lateral con lista de capas, visibilidad y eliminación.
 */

import { useEffect, useRef, useState } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Eye, EyeOff, Trash2, Upload, ChevronDown } from 'lucide-react'
import { useMapaLeafletStore, type MapaImportado } from '@/store/useMapaLeafletStore'

// ── FitBounds helper ─────────────────────────────────────────────────────────

function FitBounds({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap()
  useEffect(() => {
    const lb = L.latLngBounds(
      L.latLng(bounds[0][0], bounds[0][1]),
      L.latLng(bounds[1][0], bounds[1][1]),
    )
    map.fitBounds(lb, { padding: [40, 40], animate: false, maxZoom: 4 })
  }, [map, bounds])
  return null
}

// ── Panel de capas ───────────────────────────────────────────────────────────

function PanelCapasImportado({ mapa }: { mapa: MapaImportado }) {
  const [open, setOpen]           = useState(true)
  const toggleVisible             = useMapaLeafletStore((s) => s.toggleCapaImportadaVisible)
  const eliminar                  = useMapaLeafletStore((s) => s.eliminarCapaImportada)
  const deleteMapa                = useMapaLeafletStore((s) => s.deleteMapaImportado)
  const setActivo                 = useMapaLeafletStore((s) => s.setMapaImportadoActivo)

  const capas = mapa.capas.filter((c) => !c.eliminada)

  return (
    <div className="absolute top-3 right-3 w-64 bg-gray-900/97 border border-gray-700/60 rounded-lg shadow-2xl z-[1000] text-gray-200 flex flex-col max-h-[calc(100%-24px)] overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/40 shrink-0">
        <Upload size={12} className="text-emerald-400 shrink-0" />
        <span className="text-[11px] font-semibold flex-1 truncate text-emerald-300">{mapa.nombre}</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-0.5 hover:bg-gray-800 rounded text-gray-600 hover:text-gray-300 transition-colors"
        >
          <ChevronDown size={12} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      </div>

      {/* Lista capas */}
      {open && (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-0.5">
          <div className="text-[9px] text-gray-500 px-1 mb-1 uppercase tracking-wider font-semibold">
            {capas.length} capa{capas.length !== 1 ? 's' : ''}
          </div>
          {capas.map((c) => (
            <div key={c.name} className="flex items-center gap-1 group">
              <button
                onClick={() => toggleVisible(mapa.id, c.name)}
                className="flex-1 flex items-center gap-2 px-2 py-0.5 rounded text-left hover:bg-gray-800 transition-colors min-w-0"
              >
                {c.visible
                  ? <Eye size={10} className="text-gray-400 shrink-0" />
                  : <EyeOff size={10} className="text-gray-600 shrink-0" />}
                <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: c.color }} />
                <span className={`text-[10px] truncate ${c.visible ? 'text-gray-200' : 'text-gray-600'}`}>
                  {c.name}
                </span>
                <span className="text-[8px] font-mono text-gray-600 shrink-0">{c.entityCount}</span>
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`¿Eliminar capa "${c.name}"?`)) return
                  eliminar(mapa.id, c.name)
                }}
                className="shrink-0 p-0.5 hover:bg-red-900/60 rounded text-red-500 hover:text-red-300 transition-colors"
                title="Eliminar capa"
              >
                <Trash2 size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Footer — eliminar mapa completo */}
      <div className="border-t border-gray-700/40 px-2 py-1.5 flex gap-1 shrink-0">
        <button
          onClick={() => {
            if (!window.confirm(`¿Eliminar el mapa "${mapa.nombre}" y todas sus capas?`)) return
            deleteMapa(mapa.id)
            setActivo(null)
          }}
          className="flex-1 flex items-center justify-center gap-1 text-[9px] py-1 bg-red-900/20 hover:bg-red-900/40 border border-red-800/40 text-red-400 rounded transition-colors"
        >
          <Trash2 size={9} /> Eliminar mapa
        </button>
      </div>
    </div>
  )
}

// ── Vista principal ──────────────────────────────────────────────────────────

const BLUEPRINT_BG = '#0a0e14'

interface Props {
  mapa: MapaImportado
}

export function MapaImportadoView({ mapa }: Props) {
  const capas = mapa.capas.filter((c) => !c.eliminada && c.visible)

  return (
    <div className="absolute inset-0" style={{ background: BLUEPRINT_BG }}>
      <MapContainer
        crs={L.CRS.Simple}
        zoom={0}
        center={[0, 0]}
        minZoom={-8}
        maxZoom={6}
        zoomControl={true}
        scrollWheelZoom={true}
        className="w-full h-full"
        style={{ background: BLUEPRINT_BG }}
      >
        <FitBounds bounds={mapa.bounds} />

        {capas.map((c) => (
          <GeoJSON
            key={`${mapa.id}-${c.name}`}
            data={c.geojson}
            style={() => ({
              color: c.color,
              weight: 1,
              opacity: 0.85,
              fillOpacity: 0.1,
            })}
          />
        ))}
      </MapContainer>

      <PanelCapasImportado mapa={mapa} />
    </div>
  )
}
