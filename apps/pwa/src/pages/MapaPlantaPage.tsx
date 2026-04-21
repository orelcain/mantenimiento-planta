import { Suspense, lazy } from 'react'
import { Layers, Tag, ArrowRight } from 'lucide-react'
import { StatsCards } from '@/components/map/3d/StatsCards'
import { InfoPanel3D } from '@/components/map/3d/InfoPanel3D'
import { usePlanta3DStore } from '@/store/usePlanta3DStore'

const PlantaScene3D = lazy(() =>
  import('@/components/map/3d/PlantaScene3D').then((m) => ({ default: m.PlantaScene3D })),
)

function LoadingScene() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-950 gap-3">
      <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-amber-500/70 font-serif italic">Cargando escena 3D…</span>
    </div>
  )
}

export function MapaPlantaPage() {
  const { selectedZonaId, showEstados, showLabels, toggleEstados, toggleLabels } =
    usePlanta3DStore()

  return (
    <div className="flex flex-col h-screen bg-gray-950 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900/90 border-b border-gray-800/60 shrink-0 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 text-base select-none" aria-hidden>⚜</span>
          <div>
            <h1 className="text-sm font-bold text-white font-serif leading-none tracking-wide">
              VISOR PLANTA ANTARFOOD
            </h1>
            <p className="text-[10px] text-gray-500 mt-0.5">
              Punta Arenas · Vista 3D interactiva
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleEstados}
            title="Mostrar/ocultar estados de equipos"
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-all ${
              showEstados
                ? 'border-green-500/70 text-green-400 bg-green-500/10'
                : 'border-gray-600 text-gray-500 hover:text-gray-300'
            }`}
          >
            <Layers size={11} />
            Estados
          </button>
          <button
            onClick={toggleLabels}
            title="Mostrar/ocultar etiquetas de edificios"
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border transition-all ${
              showLabels
                ? 'border-amber-500/70 text-amber-400 bg-amber-500/10'
                : 'border-gray-600 text-gray-500 hover:text-gray-300'
            }`}
          >
            <Tag size={11} />
            Etiquetas
          </button>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          <span className="text-[10px] text-gray-600">
            Toca un edificio para ver detalles
          </span>
          <ArrowRight size={10} className="text-gray-600" />
        </div>
      </header>

      {/* ── Canvas + Overlays ── */}
      <main className="flex-1 relative overflow-hidden">
        <Suspense fallback={<LoadingScene />}>
          <PlantaScene3D />
        </Suspense>

        {/* Stats cards (top-left y top-right) */}
        <StatsCards />

        {/* Hint de navegación */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm text-[10px] text-gray-400 px-3 py-1.5 rounded-full border border-gray-700/50">
            Arrastra para rotar · Scroll para zoom · Click en edificio para detalles
          </div>
        </div>

        {/* Info panel — desliza desde la derecha */}
        <div
          className="absolute top-0 right-0 h-full transition-transform duration-300 ease-out z-20"
          style={{ transform: selectedZonaId ? 'translateX(0)' : 'translateX(100%)' }}
        >
          <InfoPanel3D />
        </div>
      </main>
    </div>
  )
}
