/**
 * MapaPlantaPage
 * ──────────────
 * Vista principal del mapa de planta:
 *  • Base: capas reales del DXF del arquitecto (vector, ~88 KB total)
 *  • Editable: zonas, equipos y formas custom vía Leaflet-Geoman
 *  • Persistencia: Zustand + localStorage (próximo: Firestore)
 */

import { Map as MapIcon, Info } from 'lucide-react'
import { PlantaLeafletEditable, PanelCapasYZonas } from '@/components/map/leaflet-editable'

export function MapaPlantaPage() {
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
              Chonchi · Chiloé · Plano arquitectónico vectorizado
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-gray-500">
          <Info size={11} className="text-gray-600" />
          <span>Coordenadas en metros (CRS local del arquitecto)</span>
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
