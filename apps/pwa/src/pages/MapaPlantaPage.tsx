/**
 * MapaPlantaPage
 * ──────────────
 * Vistas:
 *  • Recinto: predio completo, capas DXF reales (~62×59 m, 17 capas)
 *  • Interior: planta principal con detalle (87×55 m, 11 capas)
 *
 * Editor: zonas, equipos y formas custom (Geoman). Persistencia local.
 */

import { Map as MapIcon, Building2, Globe2 } from 'lucide-react'
import { PlantaLeafletEditable, PanelCapasYZonas } from '@/components/map/leaflet-editable'
import { useMapaLeafletStore } from '@/store/useMapaLeafletStore'
import { MAP_VIEWS, type ViewName } from '@/data/dxfLayers'

const VIEW_ICONS: Record<ViewName, typeof Globe2> = {
  recinto:  Globe2,
  interior: Building2,
}

const VIEW_DESC: Record<ViewName, string> = {
  recinto:  'Predio completo · cerco, edificios, accesos',
  interior: 'Planta principal · muros internos, equipos',
}

export function MapaPlantaPage() {
  const currentView = useMapaLeafletStore((s) => s.currentView)
  const setView     = useMapaLeafletStore((s) => s.setView)

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900/90 border-b border-gray-800/60 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <MapIcon size={15} className="text-amber-400" />
          <div>
            <h1 className="text-sm font-bold text-white leading-none tracking-wide">
              MAPA PLANTA ANTARFOOD
            </h1>
            <p className="text-[10px] text-gray-500 mt-0.5">
              {VIEW_DESC[currentView]}
            </p>
          </div>
        </div>

        {/* View switcher */}
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5">
          {(Object.keys(MAP_VIEWS) as ViewName[]).map((v) => {
            const cfg = MAP_VIEWS[v]
            const Icon = VIEW_ICONS[v]
            const active = currentView === v
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-md transition-all ${
                  active
                    ? 'bg-amber-600/80 text-white shadow-[inset_0_0_6px_rgba(245,158,11,0.3)]'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
                }`}
              >
                <Icon size={11} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      </header>

      {/* ── Mapa + panel ─────────────────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden">
        <PlantaLeafletEditable />
        <PanelCapasYZonas />
      </main>
    </div>
  )
}
