/**
 * Panel lateral del mapa Leaflet:
 *  • Tabs: Zonas/Equipos | Capas DXF
 *  • Toggle visibilidad por capa DXF (agrupado)
 *  • Lista de elementos con búsqueda y filtro por categoría
 *  • Editor inline del seleccionado (nombre, categoría, estado)
 *  • Confirmación antes de eliminar
 */

import { Eye, EyeOff, Edit3, Save, Trash2, Check, Search, X, Crosshair, Copy, Download, CheckCircle2, Loader, Plus, GripVertical } from 'lucide-react'
import { MAP_VIEWS, type DxfLayerConfig } from '@/data/dxfLayers'
import { useMapaLeafletStore, type ZonaCategoria, type ZonaEstado, type ElementoMapa, type PolygonCoords, type Nivel } from '@/store/useMapaLeafletStore'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'

// ─── Tipos mínimos GeoJSON para absorción DXF ────────────────────────────────
type GJCoord = readonly number[]
type GJGeometry =
  | { type: 'LineString';      coordinates: GJCoord[] }
  | { type: 'MultiLineString'; coordinates: GJCoord[][] }
  | { type: 'Polygon';         coordinates: GJCoord[][] }
  | { type: 'Point';           coordinates: GJCoord }
  | { type: string }

interface GJFeature { geometry: GJGeometry | null }

function toLatLng(c: GJCoord): [number, number] {
  return [c[1] ?? 0, c[0] ?? 0]
}

const GROUP_LABEL: Record<DxfLayerConfig['group'], string> = {
  cerco:         'Cerco perimetral',
  estructura:    'Estructura',
  detalle:       'Detalle interior',
  instalaciones: 'Instalaciones',
  otros:         'Otros',
}

const CATEGORIAS: { value: ZonaCategoria; label: string; color: string }[] = [
  { value: 'produccion',  label: 'Producción',  color: '#22c55e' },
  { value: 'frio',        label: 'Frío',        color: '#06b6d4' },
  { value: 'utilidades',  label: 'Utilidades',  color: '#a855f7' },
  { value: 'logistica',   label: 'Logística',   color: '#f59e0b' },
  { value: 'admin',       label: 'Admin',       color: '#94a3b8' },
  { value: 'estructura',  label: 'Estructura',  color: '#ef4444' },
  { value: 'otros',       label: 'Otros',       color: '#64748b' },
]

const ESTADOS: { value: ZonaEstado; label: string; color: string }[] = [
  { value: 'operativo', label: 'Operativo', color: '#22c55e' },
  { value: 'alerta',    label: 'Alerta',    color: '#f59e0b' },
  { value: 'detenido',  label: 'Detenido',  color: '#ef4444' },
]

// ─── Indicador de tipo (zona/punto/forma) ────────────────────────────────────
function TipoBadge({ tipo }: { tipo: ElementoMapa['tipo'] }) {
  const cfg = {
    zona:   { label: 'ZONA',  bg: 'bg-amber-900/40',  text: 'text-amber-300' },
    forma:  { label: 'CIRC',  bg: 'bg-cyan-900/40',   text: 'text-cyan-300' },
    punto:  { label: 'PUNTO', bg: 'bg-purple-900/40', text: 'text-purple-300' },
    equipo: { label: 'EQUIP', bg: 'bg-blue-900/40',   text: 'text-blue-300' },
    sensor: { label: 'SENSR', bg: 'bg-green-900/40',  text: 'text-green-300' },
    cota:   { label: 'COTA',  bg: 'bg-slate-800/60',  text: 'text-slate-300' },
    linea:  { label: 'LINEA', bg: 'bg-orange-900/40', text: 'text-orange-300' },
  }[tipo]
  if (!cfg) return null
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} font-mono font-bold`}>
      {cfg.label}
    </span>
  )
}

/** Picker de nivel para un elemento individual en el panel de propiedades */
function NivelPickerEl({ elId, nivelId, view }: { elId: string; nivelId?: string; view: string }) {
  const niveles      = useMapaLeafletStore((s) => (s.niveles as Nivel[]).filter((n) => n.mapView === view).sort((a, b) => a.orden - b.orden))
  const updateElemento = useMapaLeafletStore((s) => s.updateElemento)
  if (niveles.length === 0) return null
  return (
    <div>
      <label className="text-[9px] uppercase text-gray-500 font-semibold">Nivel / Piso</label>
      <select
        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-sky-500/60 focus:outline-none"
        value={nivelId ?? ''}
        onChange={(e) => updateElemento(elId, { nivelId: e.target.value || undefined })}
      >
        <option value="">Sin nivel (visible en todos)</option>
        {niveles.map((n) => (
          <option key={n.id} value={n.id}>
            {n.abrev} — {n.nombre} (+{n.zBase}m)
          </option>
        ))}
      </select>
    </div>
  )
}

export function PanelCapasYZonas() {
  const {
    currentView, elementos: allElementos,
    selectedId, multiSelection, editMode, capasVisibles,
    capasUsuario, niveles,
    setSelectedId, clearMultiSelection, toggleEditMode, setCapaVisible, setAllCapas,
    updateElemento, updateElementosBulk, updateElementosBulkMeta,
    deleteElemento, addElemento, addElementosBulk, removeElementosBulk,
    addCapaUsuario, updateCapaUsuario, deleteCapaUsuario, toggleCapaUsuarioVisible, reorderCapas,
  } = useMapaLeafletStore()

  // ids seleccionados (primary + multi)
  const selectedIds = useMemo(() => {
    const out: string[] = []
    if (selectedId) out.push(selectedId)
    for (const x of multiSelection) if (!out.includes(x)) out.push(x)
    return out
  }, [selectedId, multiSelection])
  const isMultiSelect = selectedIds.length > 1

  // Capas ya absorbidas (tienen meta.dxfSource en la vista actual)
  const absorbedLayers = useMemo(() => {
    const s = new Set<string>()
    for (const e of allElementos) {
      if (e.mapView === currentView && typeof e.meta?.dxfSource === 'string') {
        s.add(e.meta.dxfSource)
      }
    }
    return s
  }, [allElementos, currentView])

  const [absorbing, setAbsorbing] = useState<Record<string, boolean>>({})

  const absorbDxfLayer = useCallback(async (layerName: string) => {
    if (absorbedLayers.has(layerName)) return

    setAbsorbing((prev) => ({ ...prev, [layerName]: true }))
    try {
      const folder = MAP_VIEWS[currentView].folder
      const res = await fetch(`${import.meta.env.BASE_URL}maps/${folder}/${layerName}.geojson`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const geojson = await res.json() as { features: GJFeature[] }

      // Crear o reutilizar CapaUsuario asociada
      const cfg = MAP_VIEWS[currentView].layers.find((l) => l.name === layerName)
      const nombre = cfg?.label ?? layerName
      let capaId = capasUsuario.find((c) => c.mapView === currentView && c.nombre === nombre)?.id
      if (!capaId) {
        capaId = addCapaUsuario({
          nombre, color: cfg?.color ?? '#94a3b8', visible: true, mapView: currentView,
        })
      }

      const items: Parameters<typeof addElementosBulk>[0] = []

      for (const feature of geojson.features) {
        const geom = feature.geometry
        if (!geom) continue

        const base = {
          nombre: '',
          categoria: 'otros' as const,
          estado: 'operativo' as const,
          mapView: currentView,
          meta: { dxfSource: layerName, capaId },
        }

        if (geom.type === 'LineString') {
          const poligono: PolygonCoords = (geom as Extract<GJGeometry, { type: 'LineString' }>).coordinates.map(toLatLng)
          items.push({ ...base, tipo: 'linea', poligono })
        } else if (geom.type === 'MultiLineString') {
          const poligono: PolygonCoords = (geom as Extract<GJGeometry, { type: 'MultiLineString' }>).coordinates.flat().map(toLatLng)
          items.push({ ...base, tipo: 'linea', poligono })
        } else if (geom.type === 'Polygon') {
          const ring = (geom as Extract<GJGeometry, { type: 'Polygon' }>).coordinates[0]
          if (ring) {
            const poligono: PolygonCoords = ring.map(toLatLng)
            items.push({ ...base, tipo: 'zona', poligono })
          }
        } else if (geom.type === 'Point') {
          const c = (geom as Extract<GJGeometry, { type: 'Point' }>).coordinates
          items.push({ ...base, tipo: 'punto', punto: toLatLng(c) })
        }
      }

      if (items.length > 0) {
        addElementosBulk(items)
        setCapaVisible(layerName, false)
      }
    } catch (err) {
      console.error('[Absorber] Error:', err)
    } finally {
      setAbsorbing((prev) => ({ ...prev, [layerName]: false }))
    }
  }, [currentView, absorbedLayers, addElementosBulk, setCapaVisible, capasUsuario, addCapaUsuario])

  // Elementos semánticos (zonas/equipos nombrados) — excluye cotas y estructurales absorbidos
  const elementos = useMemo(
    () => allElementos.filter((e) =>
      e.mapView === currentView &&
      e.tipo !== 'cota' &&
      typeof e.meta?.dxfSource !== 'string',
    ),
    [allElementos, currentView],
  )

  // Cotas de la vista activa, agrupadas por categoría
  const cotasElementos = useMemo(
    () => allElementos.filter((e) => e.mapView === currentView && e.tipo === 'cota'),
    [allElementos, currentView],
  )


  // Capas de la vista actual
  const viewLayers = MAP_VIEWS[currentView].layers

  const [tab, setTab]               = useState<'capas' | 'zonas'>('zonas')
  const [filtro, setFiltro]         = useState('')
  const [filtroCat, setFiltroCat]   = useState<'all' | ZonaCategoria>('all')
  const [confirmDel, setConfirmDel] = useState(false)
  const [cotasExpanded, setCotasExpanded] = useState(true)
  const [editingCapaId, setEditingCapaId] = useState<string | null>(null)
  const [confirmDelCapa, setConfirmDelCapa] = useState<string | null>(null)
  const [draggingCapaId, setDraggingCapaId] = useState<string | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [dxfImportExpanded, setDxfImportExpanded] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Capas del usuario para la vista actual, ordenadas de mayor a menor orden
  // (arriba = z-index mas alto)
  const capasDeVista = useMemo(() => {
    return capasUsuario
      .filter((c) => c.mapView === currentView)
      .sort((a, b) => b.orden - a.orden)
  }, [capasUsuario, currentView])

  const nivelesBulk = useMemo(() => {
    return (niveles as Nivel[]).filter((n) => n.mapView === currentView).sort((a, b) => a.orden - b.orden)
  }, [niveles, currentView])

  // Contador de elementos por capa de la vista actual
  const contadorPorCapa = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of allElementos) {
      if (e.mapView !== currentView) continue
      const id = typeof e.meta?.capaId === 'string' ? e.meta.capaId : null
      if (id) m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [allElementos, currentView])


  const selectedEl = useMemo(
    () => allElementos.find((e) => e.id === selectedId && e.mapView === currentView) ?? null,
    [allElementos, selectedId, currentView],
  )

  // Auto-foco en nombre cuando un elemento se selecciona y aún no tiene nombre
  useEffect(() => {
    if (selectedEl && selectedEl.nombre === '' && nameInputRef.current) {
      nameInputRef.current.focus()
    }
    setConfirmDel(false)  // resetear confirmación al cambiar selección
  }, [selectedId, selectedEl])

  // Lista filtrada
  const elementosFiltrados = useMemo(() => {
    const f = filtro.toLowerCase().trim()
    return elementos.filter((e) => {
      if (filtroCat !== 'all' && e.categoria !== filtroCat) return false
      if (f && !e.nombre.toLowerCase().includes(f)) return false
      return true
    })
  }, [elementos, filtro, filtroCat])

  // Conteos por categoría
  const contadores = useMemo(() => {
    const c: Record<string, number> = { all: elementos.length }
    for (const e of elementos) c[e.categoria] = (c[e.categoria] ?? 0) + 1
    return c
  }, [elementos])

  // Agrupar capas DXF (reactivo al cambio de vista)
  const grupos = useMemo(() => {
    const g = new Map<string, DxfLayerConfig[]>()
    for (const c of viewLayers) {
      if (!g.has(c.group)) g.set(c.group, [])
      g.get(c.group)!.push(c)
    }
    return g
  }, [viewLayers])

  return (
    <div className="absolute top-3 right-3 w-72 max-h-[calc(100%-24px)] bg-gray-900/97 backdrop-blur border border-gray-700/60 rounded-lg shadow-2xl text-gray-200 flex flex-col overflow-hidden z-[1000]">
      {/* Tabs */}
      <div className="flex border-b border-gray-700/50 shrink-0">
        <button
          onClick={() => setTab('zonas')}
          className={`flex-1 text-xs py-2 font-semibold transition-colors ${
            tab === 'zonas' ? 'bg-gray-800 text-amber-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Zonas / Equipos {(elementos.length + cotasElementos.length) > 0 && (
            <span className="ml-1 text-[9px] px-1 py-0.5 bg-amber-900/40 text-amber-300 rounded">
              {elementos.length + cotasElementos.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('capas')}
          className={`flex-1 text-xs py-2 font-semibold transition-colors ${
            tab === 'capas' ? 'bg-gray-800 text-amber-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Capas
        </button>
      </div>

      {/* Botón edit mode */}
      <div className="px-3 py-2 border-b border-gray-700/40 shrink-0">
        <button
          onClick={toggleEditMode}
          title="Atajo: tecla E"
          className={`w-full flex items-center justify-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium transition-all border ${
            editMode
              ? 'bg-blue-600/30 border-blue-500/70 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
              : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-amber-500/60 hover:text-amber-300'
          }`}
        >
          {editMode ? <Save size={11} /> : <Edit3 size={11} />}
          {editMode ? 'Modo edición activo' : 'Editar'}
          <span className="ml-auto text-[9px] text-gray-500 font-mono">E</span>
        </button>
      </div>

      {/* Contenido scroll */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'capas' && (
          <div className="p-2">
            {/* Header: titulo + nueva */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
                Capas {currentView === 'recinto' ? 'Recinto' : 'Planta'}
              </span>
              <button
                onClick={() => {
                  const id = addCapaUsuario({
                    nombre: 'Nueva capa', color: '#fbbf24', visible: true, mapView: currentView,
                  })
                  setEditingCapaId(id)
                }}
                className="text-[9px] px-2 py-0.5 bg-amber-600/80 hover:bg-amber-500 text-gray-900 rounded font-semibold flex items-center gap-0.5"
                title="Crear nueva capa"
              >
                <Plus size={10} /> Nueva
              </button>
            </div>

            {/* Lista CapasUsuario */}
            {capasDeVista.length === 0 ? (
              <div className="text-[11px] text-gray-500 italic text-center py-3">
                Sin capas. Crea una o importa desde DXF abajo.
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 mb-3">
                {capasDeVista.map((c, idx) => {
                  const count = contadorPorCapa.get(c.id) ?? 0
                  const isEditing = editingCapaId === c.id
                  const isConfirmingDel = confirmDelCapa === c.id
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', c.id); setDraggingCapaId(c.id) }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx) }}
                      onDragEnd={() => { setDraggingCapaId(null); setDragOverIdx(null) }}
                      onDrop={(e) => {
                        e.preventDefault()
                        const dragId = e.dataTransfer.getData('text/plain')
                        if (!dragId || dragId === c.id) return
                        const orderedIds = capasDeVista.map((x) => x.id)
                        const from = orderedIds.indexOf(dragId)
                        const to = orderedIds.indexOf(c.id)
                        if (from < 0 || to < 0) return
                        orderedIds.splice(from, 1)
                        orderedIds.splice(to, 0, dragId)
                        // Store uses orden ascendente (mayor = encima)
                        reorderCapas(currentView, [...orderedIds].reverse())
                        setDraggingCapaId(null); setDragOverIdx(null)
                      }}
                      className={`flex items-center gap-1 px-1 py-0.5 rounded text-left transition-all border ${
                        draggingCapaId === c.id ? 'opacity-40' : ''
                      } ${dragOverIdx === idx ? 'border-amber-500/60 bg-amber-900/20' : 'border-transparent hover:bg-gray-800/60'}`}
                    >
                      <GripVertical size={10} className="text-gray-600 shrink-0 cursor-grab active:cursor-grabbing" />
                      <button
                        onClick={() => toggleCapaUsuarioVisible(c.id)}
                        title={c.visible ? 'Ocultar capa' : 'Mostrar capa'}
                        className="shrink-0"
                      >
                        {c.visible
                          ? <Eye size={11} className="text-gray-300" />
                          : <EyeOff size={11} className="text-gray-600" />}
                      </button>
                      <label className="shrink-0 cursor-pointer" title="Cambiar color">
                        <div className="w-3 h-3 rounded-sm border border-gray-700" style={{ backgroundColor: c.color }} />
                        <input
                          type="color"
                          value={c.color}
                          onChange={(e) => updateCapaUsuario(c.id, { color: e.target.value })}
                          className="sr-only"
                        />
                      </label>
                      {isEditing ? (
                        <input
                          autoFocus
                          defaultValue={c.nombre}
                          onBlur={(e) => {
                            const v = e.target.value.trim()
                            if (v) updateCapaUsuario(c.id, { nombre: v })
                            setEditingCapaId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                            if (e.key === 'Escape') setEditingCapaId(null)
                          }}
                          className="flex-1 min-w-0 bg-gray-800 border border-amber-600/60 rounded px-1 py-0 text-[11px] text-white outline-none"
                        />
                      ) : (
                        <button
                          onDoubleClick={() => setEditingCapaId(c.id)}
                          title="Doble-click para renombrar"
                          className={`flex-1 min-w-0 text-[11px] text-left truncate transition-colors ${c.visible ? 'text-gray-200' : 'text-gray-500'}`}
                        >
                          {c.nombre}
                        </button>
                      )}
                      <span className="text-[9px] text-gray-500 font-mono shrink-0">{count}</span>
                      {isConfirmingDel ? (
                        <>
                          <button
                            onClick={() => setConfirmDelCapa(null)}
                            className="text-[9px] px-1 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
                            title="Cancelar"
                          >
                            ✕
                          </button>
                          <button
                            onClick={() => { deleteCapaUsuario(c.id, { keepElementos: true }); setConfirmDelCapa(null) }}
                            className="text-[9px] px-1 py-0.5 bg-amber-700/80 hover:bg-amber-600 text-white rounded"
                            title="Eliminar capa, conservar elementos (quedan sin capa)"
                          >
                            Capa
                          </button>
                          <button
                            onClick={() => { deleteCapaUsuario(c.id); setConfirmDelCapa(null) }}
                            className="text-[9px] px-1 py-0.5 bg-red-700 hover:bg-red-600 text-white rounded font-medium"
                            title="Eliminar capa Y todos sus elementos"
                          >
                            Todo
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDelCapa(c.id)}
                          title="Eliminar capa"
                          className="shrink-0 flex items-center justify-center w-5 h-5 rounded text-gray-600 hover:text-red-400 hover:bg-gray-800"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Importar desde DXF */}
            <div className="border-t border-gray-700/50 pt-2 mt-1">
              <button
                onClick={() => setDxfImportExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-1 mb-1 group"
              >
                <span className="text-[9px] uppercase tracking-wider font-semibold text-gray-500 group-hover:text-gray-300 flex items-center gap-1">
                  <Download size={10} /> Importar desde DXF
                </span>
                <span className="text-[9px] text-gray-500">
                  {viewLayers.length} {dxfImportExpanded ? '▲' : '▼'}
                </span>
              </button>

              {dxfImportExpanded && (
                <div>
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => setAllCapas(true)}
                      className="flex-1 text-[10px] py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">
                      Ver todas
                    </button>
                    <button
                      onClick={() => setAllCapas(false)}
                      className="flex-1 text-[10px] py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">
                      Ocultar todas
                    </button>
                  </div>
                  {Array.from(grupos.entries()).map(([gKey, capas]) => (
                    <div key={gKey} className="mb-2">
                      <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 mb-0.5 font-semibold">
                        {GROUP_LABEL[gKey as DxfLayerConfig['group']]}
                      </div>
                      {capas.map((c) => {
                        const visible = capasVisibles[currentView]?.[c.name] ?? c.defaultVisible
                        const isAbsorbing = absorbing[c.name] ?? false
                        const isAbsorbed = absorbedLayers.has(c.name)
                        return (
                          <div key={c.name} className="flex items-center gap-1">
                            <button
                              onClick={() => { if (!isAbsorbed) setCapaVisible(c.name, !visible) }}
                              disabled={isAbsorbed}
                              title={isAbsorbed ? 'Absorbida — ver en Capas' : (visible ? 'Ocultar' : 'Mostrar')}
                              className={`flex-1 flex items-center gap-2 px-2 py-0.5 rounded text-left transition-colors group min-w-0 ${
                                isAbsorbed ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-800'
                              }`}
                            >
                              {visible && !isAbsorbed
                                ? <Eye size={10} className="text-gray-400 shrink-0" />
                                : <EyeOff size={10} className="text-gray-600 shrink-0" />}
                              <div className="w-2 h-2 rounded-sm border border-gray-700 shrink-0"
                                   style={{ backgroundColor: (visible && !isAbsorbed) ? c.color : 'transparent' }} />
                              <span className={`text-[10px] truncate ${(visible && !isAbsorbed) ? 'text-gray-200' : 'text-gray-600'}`}>
                                {c.label}
                              </span>
                            </button>
                            <button
                              onClick={() => { void absorbDxfLayer(c.name) }}
                              disabled={isAbsorbing || isAbsorbed}
                              title={isAbsorbed ? 'Ya absorbida' : 'Absorber como capa editable'}
                              className={`shrink-0 flex items-center justify-center w-5 h-5 rounded transition-colors ${
                                isAbsorbed
                                  ? 'text-emerald-500 cursor-default'
                                  : isAbsorbing
                                    ? 'text-gray-500 cursor-wait'
                                    : 'text-gray-600 hover:text-amber-400 hover:bg-gray-800'
                              }`}
                            >
                              {isAbsorbing
                                ? <Loader size={9} className="animate-spin" />
                                : isAbsorbed
                                  ? <CheckCircle2 size={9} />
                                  : <Download size={9} />}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'zonas' && (
          <div className="p-2 flex flex-col gap-2">
            {/* Buscador */}
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                placeholder="Buscar elemento…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-gray-800 border border-gray-700 rounded text-[11px] text-white placeholder-gray-500 focus:border-amber-500/60 focus:outline-none"
              />
              {filtro && (
                <button
                  onClick={() => setFiltro('')}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Filtro categoría */}
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFiltroCat('all')}
                className={`text-[9px] px-1.5 py-0.5 rounded transition-all ${
                  filtroCat === 'all' ? 'bg-amber-600/40 text-amber-200' : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                Todas ({contadores.all ?? 0})
              </button>
              {CATEGORIAS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setFiltroCat(c.value)}
                  className={`text-[9px] px-1.5 py-0.5 rounded transition-all flex items-center gap-1 ${
                    filtroCat === c.value
                      ? 'bg-amber-600/40 text-amber-200'
                      : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                  }`}
                  style={filtroCat === c.value ? { borderLeft: `2px solid ${c.color}` } : {}}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.label} {contadores[c.value] && <span className="opacity-60">{contadores[c.value]}</span>}
                </button>
              ))}
            </div>

            {/* Lista */}
            {elementosFiltrados.length === 0 ? (
              <div className="text-center text-[11px] text-gray-500 py-6 italic">
                {elementos.length === 0
                  ? <>Sin elementos.<br />Activá <span className="text-blue-400">Editar</span> y dibujá zonas.</>
                  : 'Sin resultados con esos filtros.'}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {elementosFiltrados.map((el) => (
                  <button
                    key={el.id}
                    onClick={() => setSelectedId(el.id === selectedId ? null : el.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-all border ${
                      selectedId === el.id
                        ? 'bg-amber-900/30 border-amber-700/60 shadow-[inset_0_0_8px_rgba(245,158,11,0.15)]'
                        : 'border-transparent hover:bg-gray-800 hover:border-gray-700'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{
                      backgroundColor: el.estado === 'operativo' ? '#22c55e'
                                     : el.estado === 'alerta' ? '#f59e0b' : '#ef4444',
                    }} />
                    <span className="text-[11px] text-gray-200 flex-1 truncate">
                      {el.nombre || <span className="italic text-gray-500">(sin nombre)</span>}
                    </span>
                    <TipoBadge tipo={el.tipo} />
                  </button>
                ))}
              </div>
            )}

            {/* ── Sección Cotas ─────────────────────────────────────── */}
            {cotasElementos.length > 0 && (
              <div className="border-t border-gray-700/30 pt-2 mt-1">
                <button
                  onClick={() => setCotasExpanded((v) => !v)}
                  className="w-full flex items-center justify-between px-1 mb-1 group"
                >
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 group-hover:text-slate-300">
                    Cotas
                  </span>
                  <span className="text-[9px] text-slate-500">
                    {cotasElementos.length} {cotasExpanded ? '▲' : '▼'}
                  </span>
                </button>

                {cotasExpanded && (
                  <div className="flex flex-col gap-0.5">
                    {/* Agrupa por categoria */}
                    {CATEGORIAS.filter((cat) => cotasElementos.some((c) => c.categoria === cat.value)).map((cat) => (
                      <div key={cat.value} className="mb-1.5">
                        <div className="flex items-center gap-1 px-1 mb-0.5">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-[9px] text-gray-500 font-semibold">{cat.label}</span>
                        </div>
                        {cotasElementos.filter((c) => c.categoria === cat.value).map((cota) => (
                          <button
                            key={cota.id}
                            onClick={() => setSelectedId(cota.id === selectedId ? null : cota.id)}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-all border ${
                              selectedId === cota.id
                                ? 'bg-slate-800/60 border-slate-600/60'
                                : 'border-transparent hover:bg-gray-800/60'
                            }`}
                          >
                            <span className="text-[10px] text-slate-300 flex-1 truncate">
                              {cota.nombre || <span className="italic text-slate-600">(sin etiqueta)</span>}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">
                              {((cota.meta?.totalM as number | undefined) ?? 0).toFixed(2)} m
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                    {/* Cotas sin categoría clasificada */}
                    {cotasElementos.filter((c) => !CATEGORIAS.some((cat) => cat.value === c.categoria)).map((cota) => (
                      <button
                        key={cota.id}
                        onClick={() => setSelectedId(cota.id === selectedId ? null : cota.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-all border ${
                          selectedId === cota.id
                            ? 'bg-slate-800/60 border-slate-600/60'
                            : 'border-transparent hover:bg-gray-800/60'
                        }`}
                      >
                        <span className="text-[10px] text-slate-300 flex-1 truncate">
                          {cota.nombre || <span className="italic text-slate-600">(sin etiqueta)</span>}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {((cota.meta?.totalM as number | undefined) ?? 0).toFixed(2)} m
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Panel multi-seleccion (2+ elementos) ─────────────── */}
            {isMultiSelect && (
              <div className="border-t border-amber-700/60 pt-3 mt-1 flex flex-col gap-2 bg-amber-900/10 -mx-2 px-2 pb-2 rounded-b">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-amber-300">
                    {selectedIds.length} elementos seleccionados
                  </span>
                  <button
                    onClick={() => { setSelectedId(null); clearMultiSelection() }}
                    className="text-[9px] text-gray-400 hover:text-amber-300"
                    title="Limpiar seleccion"
                  >
                    limpiar
                  </button>
                </div>

                <div>
                  <label className="text-[9px] uppercase text-gray-500 font-semibold">Asignar a capa</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-amber-500/60 focus:outline-none"
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === '__none__') {
                        updateElementosBulkMeta(selectedIds, { capaId: undefined })
                      } else if (v) {
                        updateElementosBulkMeta(selectedIds, { capaId: v })
                      }
                      e.target.value = ''
                    }}
                  >
                    <option value="">— elegir capa —</option>
                    <option value="__none__">(sin capa)</option>
                    {capasDeVista.map((c) => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>

                {/* Asignar nivel bulk */}
                {nivelesBulk.length > 0 && (
                  <div>
                    <label className="text-[9px] uppercase text-gray-500 font-semibold">Asignar nivel a todos</label>
                    <select
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-sky-500/60 focus:outline-none"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '__none__') updateElementosBulk(selectedIds, { nivelId: undefined })
                        else if (v) updateElementosBulk(selectedIds, { nivelId: v })
                        e.target.value = ''
                      }}
                    >
                      <option value="">— elegir nivel —</option>
                      <option value="__none__">(sin nivel)</option>
                      {nivelesBulk.map((n) => (
                        <option key={n.id} value={n.id}>{n.abrev} — {n.nombre}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-[9px] uppercase text-gray-500 font-semibold">Cambiar categoria a todos</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-amber-500/60 focus:outline-none"
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value as ZonaCategoria
                      if (v) updateElementosBulk(selectedIds, { categoria: v })
                      e.target.value = ''
                    }}
                  >
                    <option value="">— elegir —</option>
                    {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[9px] uppercase text-gray-500 font-semibold">Cambiar estado a todos</label>
                  <div className="flex gap-1 mt-0.5">
                    {ESTADOS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => updateElementosBulk(selectedIds, { estado: s.value })}
                        className="flex-1 text-[10px] py-1 rounded border border-gray-700 text-gray-300 hover:text-white transition-all"
                        style={{ borderColor: s.color, color: s.color }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {!confirmDel ? (
                  <button
                    onClick={() => setConfirmDel(true)}
                    className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 bg-red-900/30 hover:bg-red-900/50 border border-red-800/60 text-red-400 rounded transition-colors"
                  >
                    <Trash2 size={11} /> Eliminar {selectedIds.length} elementos
                  </button>
                ) : (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setConfirmDel(false)}
                      className="flex-1 text-[11px] py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        removeElementosBulk(selectedIds)
                        setSelectedId(null)
                        clearMultiSelection()
                        setConfirmDel(false)
                      }}
                      className="flex-1 text-[11px] py-1.5 bg-red-700 hover:bg-red-600 text-white rounded font-medium"
                    >
                      Sí, eliminar {selectedIds.length}
                    </button>
                  </div>
                )}

                <p className="text-[9px] text-gray-500 italic">
                  Tip: Shift+click agrega/quita. Shift+arrastre = seleccion por recuadro.
                </p>
              </div>
            )}

            {/* Detalle del seleccionado (solo single-select) */}
            {!isMultiSelect && selectedEl && (
              <div className="border-t border-gray-700/50 pt-3 mt-1 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <TipoBadge tipo={selectedEl.tipo} />
                  {selectedEl.tipo === 'cota' && typeof selectedEl.meta?.totalM === 'number' && (
                    <span className="text-[9px] text-slate-300 font-mono font-bold">
                      {(selectedEl.meta.totalM as number).toFixed(2)} m
                    </span>
                  )}
                  {typeof selectedEl.meta?.area_m2 === 'number' && (
                    <span className="text-[9px] text-gray-400 font-mono">
                      {selectedEl.meta.area_m2} m²
                    </span>
                  )}
                  {selectedEl.radio && (
                    <span className="text-[9px] text-gray-400 font-mono">
                      r = {selectedEl.radio} m
                    </span>
                  )}
                </div>

                <div>
                  <label className="text-[9px] uppercase text-gray-500 font-semibold">
                    {selectedEl.tipo === 'cota' ? 'Etiqueta' : 'Nombre'}
                  </label>
                  <input
                    ref={nameInputRef}
                    data-name-input="true"
                    placeholder={selectedEl.tipo === 'cota' ? 'Ej: Ancho paletizado' : 'Ej: Sala calderas'}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-amber-500/60 focus:outline-none"
                    value={selectedEl.nombre}
                    onChange={(e) => updateElemento(selectedEl.id, { nombre: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[9px] uppercase text-gray-500 font-semibold">
                    {selectedEl.tipo === 'cota' ? 'Área' : 'Categoría'}
                  </label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-amber-500/60 focus:outline-none"
                    value={selectedEl.categoria}
                    onChange={(e) => updateElemento(selectedEl.id, { categoria: e.target.value as ZonaCategoria })}
                  >
                    {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

                {selectedEl.tipo !== 'cota' && (
                  <div>
                    <label className="text-[9px] uppercase text-gray-500 font-semibold">Estado</label>
                    <div className="flex gap-1 mt-0.5">
                      {ESTADOS.map((s) => {
                        const active = selectedEl.estado === s.value
                        return (
                          <button
                            key={s.value}
                            onClick={() => updateElemento(selectedEl.id, { estado: s.value })}
                            className={`flex-1 text-[10px] py-1 rounded border transition-all ${
                              active ? 'font-semibold' : 'border-gray-700 text-gray-500 hover:text-gray-300'
                            }`}
                            style={active
                              ? { color: s.color, borderColor: s.color, backgroundColor: s.color + '22' }
                              : {}}
                          >
                            {active && <Check size={10} className="inline -mt-0.5 mr-0.5" />}
                            {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Nivel/piso */}
                <NivelPickerEl elId={selectedEl.id} nivelId={selectedEl.nivelId} view={selectedEl.mapView} />

                {/* Acciones del elemento */}
                <div className="flex gap-1 mt-1">
                  <button
                    onClick={() => {
                      // Re-trigger center: forzar setSelectedId al mismo id no funciona,
                      // así que limpiamos y volvemos a setear
                      const id = selectedEl.id
                      setSelectedId(null)
                      setTimeout(() => setSelectedId(id), 50)
                    }}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors"
                    title="Centrar mapa en este elemento"
                  >
                    <Crosshair size={10} /> Centrar
                  </button>
                  <button
                    onClick={() => {
                      const offset = (c: [number, number]): [number, number] => [c[0], c[1] + 2]
                      const newId = addElemento({
                        tipo: selectedEl.tipo,
                        nombre: selectedEl.nombre + ' (copia)',
                        categoria: selectedEl.categoria,
                        estado: selectedEl.estado,
                        mapView: selectedEl.mapView,
                        poligono: selectedEl.poligono?.map(offset),
                        punto: selectedEl.punto ? offset(selectedEl.punto) : undefined,
                        radio: selectedEl.radio,
                        meta: selectedEl.meta,
                      })
                      setSelectedId(newId)
                    }}
                    className="flex-1 flex items-center justify-center gap-1 text-[10px] py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700 transition-colors"
                    title="Duplicar (Ctrl+D)"
                  >
                    <Copy size={10} /> Duplicar
                  </button>
                </div>

                {/* Eliminar con confirmación */}
                {!confirmDel ? (
                  <button
                    onClick={() => setConfirmDel(true)}
                    className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 mt-1 bg-red-900/20 hover:bg-red-900/40 border border-red-800/50 text-red-400 rounded transition-colors"
                  >
                    <Trash2 size={11} /> Eliminar elemento
                  </button>
                ) : (
                  <div className="flex gap-1 mt-1">
                    <button
                      onClick={() => setConfirmDel(false)}
                      className="flex-1 text-[11px] py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded">
                      Cancelar
                    </button>
                    <button
                      onClick={() => { deleteElemento(selectedEl.id); setSelectedId(null); setConfirmDel(false) }}
                      className="flex-1 text-[11px] py-1.5 bg-red-700 hover:bg-red-600 text-white rounded font-medium">
                      Sí, eliminar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer con info */}
      <div className="px-3 py-1.5 border-t border-gray-700/40 text-[9px] text-gray-500 flex justify-between shrink-0">
        <span>{elementos.length} elementos · {viewLayers.length} capas</span>
        {editMode && <span className="text-blue-400 font-semibold">EDIT</span>}
      </div>
    </div>
  )
}
