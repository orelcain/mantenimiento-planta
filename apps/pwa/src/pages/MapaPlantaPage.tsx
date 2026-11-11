/**
 * MapaPlantaPage
 * ──────────────
 * Vistas:
 *  • Recinto: predio completo, capas DXF reales (~62×59 m, 17 capas)
 *  • Interior: planta principal con detalle (87×55 m, 11 capas)
 *
 * Editor: zonas, equipos y formas custom (Geoman). Persistencia local.
 */

import { Map as MapIcon, Building2, Globe2, Ruler, LayoutGrid, BoxSelect, Layers, Plus, Trash2, ChevronDown, Box, X, Upload, Type } from 'lucide-react'
import { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePielApple } from '@/hooks/usePielApple'
import { claseCapsulaBarra, claseSuperficieMenu } from '@/components/layout/navVidrio'
import { PlantaLeafletEditable, PanelCapasYZonas } from '@/components/map/leaflet-editable'
import { Wireframe3DView } from '@/components/map/wireframe3d'
import { KonvaDxfViewer } from '@/components/map/konva-dxf/KonvaDxfViewer'
import { DxfImportModal } from '@/components/map/dxf-import/DxfImportModal'
import { useMapaLeafletStore, type Nivel } from '@/store/useMapaLeafletStore'
import { MAP_VIEWS, type ViewName } from '@/data/dxfLayers'

const VIEW_ICONS: Record<ViewName, typeof Globe2> = {
  recinto:  Globe2,
  interior: Building2,
}

const VIEW_DESC: Record<ViewName, string> = {
  recinto:  'Predio completo · cerco, edificios, accesos',
  interior: 'Planta principal · muros, salas, etiquetas DXF v2',
}

/**
 * Botón de la barra del mapa. Piel Apple: va dentro de una cápsula de vidrio y el activo
 * es la lente (mismo criterio que el menú lateral). Piel anterior: sus clases de siempre.
 */
function claseHerr(apple: boolean, activo: boolean, base: string, activoAnterior: string, inactivoAnterior: string): string {
  if (apple) {
    return cn(
      'flex items-center gap-1 text-[12px] h-[34px] px-2.5 sm:px-3 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
      activo ? 'vidrio-lente' : 'text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10',
    )
  }
  return [base, activo ? activoAnterior : inactivoAnterior].join(' ')
}

/** Colores sugeridos por defecto al crear un nuevo nivel */
const NIVEL_COLORS = ['#38bdf8', '#4ade80', '#a78bfa', '#fb923c', '#f472b6', '#facc15']

/** Selector compacto de nivel/piso con popover inline */
function NivelSelector({ view }: { view: ViewName }) {
  const allNiveles     = useMapaLeafletStore((s) => s.niveles)
  const niveles        = useMemo(
    () => allNiveles.filter((n) => n.mapView === view).sort((a, b) => a.orden - b.orden),
    [allNiveles, view],
  )
  const currentNivelId = useMapaLeafletStore((s) => s.currentNivelId)
  const setCurrentNivel = useMapaLeafletStore((s) => s.setCurrentNivel)
  const addNivel       = useMapaLeafletStore((s) => s.addNivel)
  const updateNivel    = useMapaLeafletStore((s) => s.updateNivel)
  const deleteNivel    = useMapaLeafletStore((s) => s.deleteNivel)

  const [open, setOpen]           = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft]         = useState('')
  const popRef = useRef<HTMLDivElement>(null)
  const apple = usePielApple()

  // Cierra popover al clic fuera
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const activeNivel = niveles.find((n) => n.id === currentNivelId)

  function handleAddNivel() {
    const idx   = niveles.length
    const color = NIVEL_COLORS[idx % NIVEL_COLORS.length] ?? '#94a3b8'
    const zBase = niveles.reduce((acc, n) => Math.max(acc, n.zBase + n.altura), 0)
    addNivel({
      nombre: idx === 0 ? 'Planta Baja' : `Piso ${idx}`,
      abrev:  idx === 0 ? 'PB' : `P${idx}`,
      zBase,
      altura: 3.5,
      color,
      mapView: view,
    })
  }

  function commitRename(n: Nivel) {
    if (draft.trim()) updateNivel(n.id, { nombre: draft.trim() })
    setEditingId(null)
    setDraft('')
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Filtrar por nivel/piso"
        className={claseHerr(
          apple, !!currentNivelId, 'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
          'border-sky-500/70 text-sky-300 bg-sky-600/20 shadow-[0_0_8px_rgba(56,189,248,0.2)]',
          'border-gray-700/60 text-gray-400 hover:text-sky-300 hover:border-sky-700/50',
        )}
      >
        <Layers size={12} />
        <span className="hidden sm:inline font-medium">
          {activeNivel ? activeNivel.abrev : 'Niveles'}
        </span>
        {activeNivel && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: activeNivel.color }}
          />
        )}
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className={cn(claseSuperficieMenu(apple, 'bg-gray-900 border border-gray-700/80 rounded-xl shadow-2xl'), 'absolute top-full right-0 z-[9999] w-56 py-1 overflow-hidden', apple ? 'mt-2 p-1' : 'mt-1')}>
          {/* "Todos los niveles" */}
          <button
            onClick={() => { setCurrentNivel(null); setOpen(false) }}
            className={apple
              ? cn('w-full flex items-center gap-2 px-3 py-2 text-[12px] rounded-[12px] transition-colors', !currentNivelId ? 'vidrio-lente' : 'text-foreground hover:bg-muted-foreground/10')
              : `w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${
              !currentNivelId ? 'bg-gray-700/60 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <span className="w-3 h-3 rounded-full border border-gray-600 shrink-0" />
            <span>Todos los niveles</span>
          </button>

          {niveles.length > 0 && <div className={cn('h-px my-1 mx-2', apple ? 'bg-border' : 'bg-gray-800')} />}

          {/* Lista de niveles */}
          {niveles.map((n) => (
            <div
              key={n.id}
              className={apple
                ? cn('flex items-center gap-1.5 px-2 py-1.5 text-[12px] rounded-[12px] transition-colors group', currentNivelId === n.id ? 'vidrio-lente' : 'hover:bg-muted-foreground/10')
                : `flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-lg mx-1 transition-colors group ${
                currentNivelId === n.id ? 'bg-gray-700/50' : 'hover:bg-gray-800/60'
              }`}
            >
              {/* Dot color (clic → cambia color) */}
              <label className="cursor-pointer shrink-0">
                <span
                  className="block w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: n.color }}
                />
                <input
                  type="color"
                  className="sr-only"
                  value={n.color}
                  onChange={(e) => updateNivel(n.id, { color: e.target.value })}
                />
              </label>

              {/* Abrev badge */}
              <span
                className="px-1 rounded text-caption font-bold shrink-0"
                style={{ backgroundColor: n.color + '33', color: n.color }}
              >
                {n.abrev}
              </span>

              {/* Nombre (dblclick → editar) */}
              {editingId === n.id ? (
                <input
                  autoFocus
                  className="flex-1 bg-gray-800 text-white text-[11px] px-1 rounded outline-none border border-sky-500/60"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(n)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitRename(n); if (e.key === 'Escape') { setEditingId(null) } }}
                />
              ) : (
                <button
                  className={cn('flex-1 text-left truncate', apple ? 'text-foreground' : 'text-gray-300')}
                  onClick={() => { setCurrentNivel(n.id); setOpen(false) }}
                  onDoubleClick={() => { setEditingId(n.id); setDraft(n.nombre) }}
                  title={`${n.nombre} · Z+${n.zBase}m · ${n.altura}m altura. Doble clic para renombrar`}
                >
                  {n.nombre}
                </button>
              )}

              {/* zBase badge */}
              <span className={cn('text-caption shrink-0 tabular-nums', apple ? 'text-muted-foreground' : 'text-gray-600')}>+{n.zBase}m</span>

              {/* Eliminar */}
              <button
                onClick={() => { if (window.confirm(`¿Eliminar nivel "${n.nombre}"? Los elementos quedarán sin nivel.`)) deleteNivel(n.id) }}
                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all shrink-0"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}

          {/* Agregar nivel */}
          <div className={cn('h-px my-1 mx-2', apple ? 'bg-border' : 'bg-gray-800')} />
          <button
            onClick={handleAddNivel}
            className={apple
              ? 'w-full flex items-center gap-2 px-3 py-2 text-[12px] rounded-[12px] text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 transition-colors'
              : 'w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-gray-500 hover:text-sky-400 hover:bg-gray-800/60 transition-colors'}
          >
            <Plus size={11} />
            <span>Añadir nivel</span>
          </button>
        </div>
      )}
    </div>
  )
}

/** Barra flotante que aparece cuando hay 1+ elementos seleccionados */
function SelectionActionBar() {
  const selectedId          = useMapaLeafletStore((s) => s.selectedId)
  const multiSelection      = useMapaLeafletStore((s) => s.multiSelection)
  const setSelectedId       = useMapaLeafletStore((s) => s.setSelectedId)
  const clearMultiSelection = useMapaLeafletStore((s) => s.clearMultiSelection)
  const removeElementosBulk = useMapaLeafletStore((s) => s.removeElementosBulk)
  const toggleBoxSelectMode = useMapaLeafletStore((s) => s.toggleBoxSelectMode)
  const boxSelectMode       = useMapaLeafletStore((s) => s.boxSelectMode)
  const apple = usePielApple()

  const allIds = useMemo(() => {
    const ids: string[] = []
    if (selectedId) ids.push(selectedId)
    for (const id of multiSelection) if (!ids.includes(id)) ids.push(id)
    return ids
  }, [selectedId, multiSelection])

  if (allIds.length === 0) return null

  function deselect() {
    setSelectedId(null)
    clearMultiSelection()
    if (boxSelectMode) toggleBoxSelectMode()
  }

  function deleteAll() {
    if (!window.confirm(`¿Eliminar ${allIds.length} elemento${allIds.length !== 1 ? 's' : ''} seleccionado${allIds.length !== 1 ? 's' : ''}?`)) return
    removeElementosBulk(allIds)
    setSelectedId(null)
    clearMultiSelection()
    if (boxSelectMode) toggleBoxSelectMode()
  }

  return (
    <div className={apple
      ? cn(claseCapsulaBarra(), 'absolute bottom-5 left-1/2 -translate-x-1/2 z-[9999] gap-2 pl-4 pr-1.5')
      : 'absolute bottom-5 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-gray-900/95 border border-amber-500/40 rounded-xl shadow-2xl px-4 py-2 backdrop-blur-sm pointer-events-auto'}>
      <BoxSelect size={13} className={cn('shrink-0', apple ? 'text-ink-warn' : 'text-amber-400')} />
      <span className={cn('text-[12px] font-semibold whitespace-nowrap tabular-nums', apple ? 'text-foreground' : 'text-amber-300')}>
        {allIds.length} elemento{allIds.length !== 1 ? 's' : ''} seleccionado{allIds.length !== 1 ? 's' : ''}
      </span>
      <div className={cn('w-px h-4 shrink-0', apple ? 'bg-border' : 'bg-gray-700')} />
      <button
        onClick={deleteAll}
        className={apple
          ? 'flex items-center gap-1 text-[12px] h-[34px] px-3 rounded-full text-destructive hover:bg-destructive/10 transition-colors'
          : 'flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-900/20 transition-colors'}
      >
        <Trash2 size={11} />
        Eliminar
      </button>
      <button
        onClick={deselect}
        className={apple
          ? 'flex items-center gap-1 text-[12px] h-[34px] px-3 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 transition-colors'
          : 'flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-700/50 transition-colors'}
      >
        <X size={11} />
        Deseleccionar
      </button>
    </div>
  )
}

export function MapaPlantaPage() {
  const currentView        = useMapaLeafletStore((s) => s.currentView)
  const setView            = useMapaLeafletStore((s) => s.setView)
  const measureMode        = useMapaLeafletStore((s) => s.measureMode)
  const toggleMeasureMode  = useMapaLeafletStore((s) => s.toggleMeasureMode)
  const grillaVisible      = useMapaLeafletStore((s) => s.grillaVisible)
  const toggleGrilla       = useMapaLeafletStore((s) => s.toggleGrilla)
  const boxSelectMode       = useMapaLeafletStore((s) => s.boxSelectMode)
  const toggleBoxSelect     = useMapaLeafletStore((s) => s.toggleBoxSelectMode)
  const textPlacementMode   = useMapaLeafletStore((s) => s.textPlacementMode)
  const setTextPlacementMode = useMapaLeafletStore((s) => s.setTextPlacementMode)
  const view3DMode              = useMapaLeafletStore((s) => s.view3DMode)
  const toggleView3DMode        = useMapaLeafletStore((s) => s.toggleView3DMode)
  const mapasImportados         = useMapaLeafletStore((s) => s.mapasImportados)
  const mapaImportadoActivoId   = useMapaLeafletStore((s) => s.mapaImportadoActivoId)
  const setMapaImportadoActivo  = useMapaLeafletStore((s) => s.setMapaImportadoActivo)
  // deleteMapaImportado se usa desde MapaImportadoView directamente
  const [showDxfImport, setShowDxfImport] = useState(false)

  const mapaActivo = mapasImportados.find((m) => m.id === mapaImportadoActivoId) ?? null
  const apple = usePielApple()

  // Piel Apple: la barra flota sobre el mapa (el plano pasa por debajo del vidrio). Su alto
  // real (1 o 2 filas según el ancho) corre los controles superiores del mapa y el panel.
  const raizRef = useRef<HTMLDivElement>(null)
  const barraRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const raiz = raizRef.current
    const barra = barraRef.current
    if (!apple || !raiz || !barra) return
    const medir = () => raiz.style.setProperty('--mapa-barra-h', `${barra.offsetHeight + 16}px`)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(barra)
    return () => { ro.disconnect(); raiz.style.removeProperty('--mapa-barra-h') }
  }, [apple])

  return (
    <div ref={raizRef} className={cn('flex flex-col h-full bg-gray-950 overflow-hidden', apple && 'relative mapa-vidrio')}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        ref={barraRef}
        className={apple
          ? 'absolute top-2 inset-x-2 z-[1100] flex flex-wrap items-start justify-between gap-2 pointer-events-none'
          : 'flex items-center justify-between gap-2 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-900/90 border-b border-gray-800/60 shrink-0 z-10 min-h-0'}
      >

        {/* Título — oculta subtitle en móvil */}
        <div className={apple ? cn(claseCapsulaBarra(), 'hidden sm:flex gap-2 pl-4 pr-5 min-w-0') : 'flex items-center gap-2 min-w-0 shrink-0'}>
          <MapIcon size={13} className={cn('shrink-0', apple ? 'text-ink-warn' : 'text-amber-400')} />
          <div className="min-w-0">
            {apple ? (
              <h1 className="text-sm font-semibold text-foreground leading-none whitespace-nowrap">Mapa de planta</h1>
            ) : (
            <h1 className="text-[11px] sm:text-sm font-bold text-white leading-none tracking-wide whitespace-nowrap">
              <span className="sm:hidden">MAPA PLANTA</span>
              <span className="hidden sm:inline">MAPA PLANTA ANTARFOOD</span>
            </h1>
            )}
            <p className={cn('hidden text-caption mt-0.5', apple ? 'xl:block text-muted-foreground' : 'sm:block text-gray-500')}>
              {VIEW_DESC[currentView]}
            </p>
          </div>
        </div>

        {/* Herramientas — solo icono en móvil */}
        <div className={apple ? cn(claseCapsulaBarra(), 'gap-0.5 px-1') : 'flex items-center gap-1'}>
          <button
            onClick={toggleMeasureMode}
            title="Medir distancias (clic a clic)"
            className={claseHerr(apple, measureMode, 'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
              'bg-amber-600/20 border-amber-600/60 text-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.25)]',
              'border-gray-700/60 text-gray-400 hover:text-amber-400 hover:border-amber-700/50',
            )}
          >
            <Ruler size={12} />
            <span className="hidden sm:inline">Medir</span>
          </button>
          <button
            onClick={toggleGrilla}
            title="Grilla de referencia métrica con rotación"
            className={claseHerr(apple, grillaVisible, 'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
              'bg-slate-600/25 border-slate-500/60 text-slate-300 shadow-[0_0_8px_rgba(148,163,184,0.2)]',
              'border-gray-700/60 text-gray-400 hover:text-slate-300 hover:border-slate-600/50',
            )}
          >
            <LayoutGrid size={12} />
            <span className="hidden sm:inline">Grilla</span>
          </button>
          <button
            onClick={toggleBoxSelect}
            title="Selección por recuadro — arrastra para seleccionar varios. Shift+arrastre en desktop."
            className={claseHerr(apple, boxSelectMode, 'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
              'bg-amber-600/25 border-amber-500/70 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.3)]',
              'border-gray-700/60 text-gray-400 hover:text-amber-300 hover:border-amber-700/50',
            )}
          >
            <BoxSelect size={12} />
            <span className="hidden sm:inline">Selección</span>
          </button>
          <button
            onClick={() => setTextPlacementMode(!textPlacementMode)}
            title="Agregar anotación de texto en el mapa"
            className={claseHerr(apple, textPlacementMode, 'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
              'bg-pink-600/25 border-pink-500/60 text-pink-300 shadow-[0_0_8px_rgba(236,72,153,0.25)]',
              'border-gray-700/60 text-gray-400 hover:text-pink-300 hover:border-pink-700/50',
            )}
          >
            <Type size={12} />
            <span className="hidden sm:inline">Texto</span>
          </button>
        </div>

        <div className={apple ? cn(claseCapsulaBarra(), 'gap-0.5 px-1 max-w-full') : 'contents'}>
        {/* Toggle 2D / 3D */}
        <button
          onClick={toggleView3DMode}
          title={view3DMode ? 'Volver a vista 2D' : 'Ver blueprint 3D isométrico'}
          className={claseHerr(apple, view3DMode, 'flex items-center gap-1 text-[11px] px-2 sm:px-3 py-1.5 rounded-lg transition-all border',
            'bg-indigo-600/25 border-indigo-500/70 text-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.35)]',
            'border-gray-700/60 text-gray-400 hover:text-indigo-300 hover:border-indigo-700/50',
          )}
        >
          <Box size={12} />
          <span className="hidden sm:inline">{view3DMode ? '3D' : '3D'}</span>
        </button>

        {/* Selector de nivel/piso */}
        {!view3DMode && <NivelSelector view={currentView} />}

        {/* Vista — icono + label corto en móvil */}
        {apple && <div className="w-px h-5 bg-border shrink-0 mx-0.5" />}
        <div className={apple ? 'flex items-center gap-0.5 shrink-0' : 'flex items-center bg-gray-800 rounded-lg p-0.5 gap-0.5 shrink-0'}>
          {/* Vistas estáticas */}
          {(Object.keys(MAP_VIEWS) as ViewName[]).map((v) => {
            const Icon = VIEW_ICONS[v]
            const active = !mapaImportadoActivoId && currentView === v
            return (
              <button
                key={v}
                onClick={() => { setMapaImportadoActivo(null); setView(v) }}
                className={claseHerr(apple, active, 'flex items-center gap-1 text-caption sm:text-[11px] px-2 sm:px-3 py-1 rounded-md transition-all',
                  'bg-amber-600/80 text-white shadow-[inset_0_0_6px_rgba(245,158,11,0.3)]',
                  'text-gray-400 hover:text-white hover:bg-gray-700/60',
                )}
              >
                <Icon size={11} />
                <span className="hidden xs:inline sm:inline">{v === 'recinto' ? 'Recinto' : 'Planta'}</span>
              </button>
            )
          })}
          {/* Mapas importados */}
          {mapasImportados.map((m) => (
            <button
              key={m.id}
              onClick={() => setMapaImportadoActivo(m.id)}
              title={m.nombre}
              className={cn(claseHerr(apple, mapaImportadoActivoId === m.id, 'flex items-center gap-1 text-caption sm:text-[11px] px-2 sm:px-3 py-1 rounded-md transition-all',
                'bg-emerald-700/80 text-white',
                'text-gray-400 hover:text-white hover:bg-gray-700/60',
              ), 'max-w-[120px]')}
            >
              <Upload size={10} />
              <span className="truncate">{m.nombre}</span>
            </button>
          ))}
          {/* Botón importar DXF */}
          <button
            onClick={() => setShowDxfImport(true)}
            title="Importar nuevo DXF"
            className={claseHerr(apple, false, 'flex items-center gap-1 text-caption sm:text-[11px] px-2 py-1 rounded-md transition-all', '',
              'text-gray-500 hover:text-emerald-300 hover:bg-gray-700/60')}
          >
            <Plus size={10} />
            <span className="hidden sm:inline">DXF</span>
          </button>
        </div>
        </div>
      </header>

      {/* ── Mapa + panel ─────────────────────────────────────────────────── */}
      <main className="flex-1 relative overflow-hidden">
        {/* Mapa importado activo */}
        {mapaActivo ? (
          <KonvaDxfViewer mapa={mapaActivo} />
        ) : (
          <>
            {/* 2D — siempre montado (Leaflet no tolera re-init) */}
            <div className={`absolute inset-0 ${view3DMode ? 'invisible pointer-events-none' : ''}`}>
              <PlantaLeafletEditable />
              <PanelCapasYZonas />
              <SelectionActionBar />
            </div>
            {/* 3D — siempre montado */}
            <div className={`absolute inset-0 transition-opacity duration-200 ${view3DMode ? 'opacity-100' : 'opacity-0 pointer-events-none [&_*]:!pointer-events-none'}`}>
              <Wireframe3DView />
            </div>
          </>
        )}
      </main>

      {/* Modal importar DXF */}
      {showDxfImport && <DxfImportModal onClose={() => setShowDxfImport(false)} />}
    </div>
  )
}
