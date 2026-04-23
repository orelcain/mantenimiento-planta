/**
 * MapaPlantaPage
 * ──────────────
 * Vistas:
 *  • Recinto: predio completo, capas DXF reales (~62×59 m, 17 capas)
 *  • Interior: planta principal con detalle (87×55 m, 11 capas)
 *
 * Editor: zonas, equipos y formas custom (Geoman). Persistencia local.
 */

import { Map as MapIcon, Building2, Globe2, Ruler, LayoutGrid } from 'lucide-react'
import { PlantaLeafletEditable, PanelCapasYZonas } from '@/components/map/leaflet-editable'
import { useMapaLeafletStore } from '@/store/useMapaLeafletStore'
import { MAP_VIEWS, type ViewName } from '@/data/dxfLayers'

const VIEW_ICONS: Record<ViewName, typeof Globe2> = {
  recinto:  Globe2,
  interior: Building2,
}

const VIEW_DESC: Record<ViewName, string> = {
  recinto:  'Predio completo · cerco, edificios, accesos',
  interior: 'Planta principal · muros, salas, etiquetas DXF v2',
}

export function MapaPlantaPage() {
  const currentView       = useMapaLeafletStore((s) => s.currentView)
  const setView           = useMapaLeafletStore((s) => s.setView)
  const measureMode       = useMapaLeafletStore((s) => s.measureMode)
  const toggleMeasureMode = useMapaLeafletStore((s) => s.toggleMeasureMode)
  const grillaVisible     = useMapaLeafletStore((s) => s.grillaVisible)
  const toggleGrilla      = useMapaLeafletStore((s) => s.toggleGrilla)

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-900/90 border-b border-gray-800/60 shrink-0 z-10 min-h-0">

        {/* Título — oculta subtitle en móvil */}
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <MapIcon size={13} className="text-amber-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-[11px] sm:text-sm font-bold text-white leading-none tracking-wide whitespace-nowrap">
              <span className="sm:hidden">MAPA PLANTA</span>
              <span className="hidden sm:inline">MAPA PLANTA ANTARFOOD</span>
            </h1>
            <p className="hidden sm:block text-[10px] text-gray-500 mt-0.5">
              {VIEW_DESC[currentView]}
            </p>
          </div>
        </div>

        {/* Herramientas — solo icono en móvil */}
        <div className="flex items-center gap-1">
          <button
            onClick={toggleMeasureMode}
            title="Medir distancias (clic a clic)"
            className={[
              'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
              measureMode
                ? 'bg-amber-600/20 border-amber-600/60 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.25)]'
                : 'border-gray-700/60 text-gray-400 hover:text-amber-400 hover:border-amber-700/50',
            ].join(' ')}
          >
            <Ruler size={12} />
            <span className="hidden sm:inline">Medir</span>
          </button>
          <button
            onClick={toggleGrilla}
            title="Grilla de referencia métrica con rotación"
            className={[
              'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
              grillaVisible
                ? 'bg-slate-600/25 border-slate-500/60 text-slate-300 shadow-[0_0_8px_rgba(148,163,184,0.2)]'
                : 'border-gray-700/60 text-gray-400 hover:text-slate-300 hover:border-slate-600/50',
            ].join(' ')}
          >
            <LayoutGrid size={12} />
            <span className="hidden sm:inline">Grilla</span>
          </button>
        </div>

        {/* Vista — icono + label corto en móvil */}
        <div className="flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5 shrink-0">
          {(Object.keys(MAP_VIEWS) as ViewName[]).map((v) => {
            const Icon = VIEW_ICONS[v]
            const active = currentView === v
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`flex items-center gap-1 text-[10px] sm:text-[11px] px-2 sm:px-3 py-1 rounded-md transition-all ${
                  active
                    ? 'bg-amber-600/80 text-white shadow-[inset_0_0_6px_rgba(245,158,11,0.3)]'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700/60'
                }`}
              >
                <Icon size={11} />
                <span className="hidden xs:inline sm:inline">{v === 'recinto' ? 'Recinto' : 'Planta'}</span>
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
