/**
 * Panel lateral del mapa Leaflet:
 *  • Tabs: Zonas/Equipos | Capas DXF
 *  • Toggle visibilidad por capa DXF (agrupado)
 *  • Lista de elementos con búsqueda y filtro por categoría
 *  • Editor inline del seleccionado (nombre, categoría, estado)
 *  • Confirmación antes de eliminar
 */

import { Eye, EyeOff, Edit3, Save, Trash2, Check, Search, X, Crosshair, Copy } from 'lucide-react'
import { MAP_VIEWS, type DxfLayerConfig } from '@/data/dxfLayers'
import { useMapaLeafletStore, type ZonaCategoria, type ZonaEstado, type ElementoMapa } from '@/store/useMapaLeafletStore'
import { useState, useMemo, useEffect, useRef } from 'react'

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
  }[tipo]
  if (!cfg) return null
  return (
    <span className={`text-[8px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text} font-mono font-bold`}>
      {cfg.label}
    </span>
  )
}

export function PanelCapasYZonas() {
  const {
    currentView, elementos: allElementos,
    selectedId, editMode, capasVisibles,
    setSelectedId, toggleEditMode, setCapaVisible, setAllCapas,
    updateElemento, deleteElemento, addElemento,
  } = useMapaLeafletStore()

  // Filtra elementos a los de la vista activa
  const elementos = useMemo(
    () => allElementos.filter((e) => e.mapView === currentView),
    [allElementos, currentView],
  )

  // Capas de la vista actual
  const viewLayers = MAP_VIEWS[currentView].layers

  const [tab, setTab]               = useState<'capas' | 'zonas'>('zonas')
  const [filtro, setFiltro]         = useState('')
  const [filtroCat, setFiltroCat]   = useState<'all' | ZonaCategoria>('all')
  const [confirmDel, setConfirmDel] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const selectedEl = useMemo(
    () => elementos.find((e) => e.id === selectedId) ?? null,
    [elementos, selectedId],
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

  // Agrupar capas DXF
  const grupos = useMemo(() => {
    const g = new Map<string, DxfLayerConfig[]>()
    for (const c of viewLayers) {
      if (!g.has(c.group)) g.set(c.group, [])
      g.get(c.group)!.push(c)
    }
    return g
  }, [])

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
          Zonas / Equipos {elementos.length > 0 && (
            <span className="ml-1 text-[9px] px-1 py-0.5 bg-amber-900/40 text-amber-300 rounded">
              {elementos.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('capas')}
          className={`flex-1 text-xs py-2 font-semibold transition-colors ${
            tab === 'capas' ? 'bg-gray-800 text-amber-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Capas DXF
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
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setAllCapas(true)}
                className="flex-1 text-[10px] py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">
                Todas
              </button>
              <button
                onClick={() => setAllCapas(false)}
                className="flex-1 text-[10px] py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors">
                Ninguna
              </button>
            </div>

            {Array.from(grupos.entries()).map(([gKey, capas]) => (
              <div key={gKey} className="mb-3">
                <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 mb-1 font-semibold">
                  {GROUP_LABEL[gKey as DxfLayerConfig['group']]}
                </div>
                {capas.map((c) => {
                  const visible = capasVisibles[c.name] ?? c.defaultVisible
                  return (
                    <button
                      key={c.name}
                      onClick={() => setCapaVisible(c.name, !visible)}
                      className="w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-800 rounded text-left transition-colors group"
                    >
                      {visible
                        ? <Eye size={11} className="text-gray-400 shrink-0 group-hover:text-amber-400" />
                        : <EyeOff size={11} className="text-gray-600 shrink-0 group-hover:text-gray-400" />}
                      <div
                        className="w-3 h-3 rounded-sm border border-gray-700 shrink-0"
                        style={{ backgroundColor: visible ? c.color : 'transparent' }}
                      />
                      <span className={`text-[11px] truncate transition-colors ${visible ? 'text-gray-200' : 'text-gray-600'}`}>
                        {c.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
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

            {/* Detalle del seleccionado */}
            {selectedEl && (
              <div className="border-t border-gray-700/50 pt-3 mt-1 flex flex-col gap-2.5">
                <div className="flex items-center gap-2">
                  <TipoBadge tipo={selectedEl.tipo} />
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
                  <label className="text-[9px] uppercase text-gray-500 font-semibold">Nombre</label>
                  <input
                    ref={nameInputRef}
                    data-name-input="true"
                    placeholder="Ej: Sala calderas"
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-amber-500/60 focus:outline-none"
                    value={selectedEl.nombre}
                    onChange={(e) => updateElemento(selectedEl.id, { nombre: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-[9px] uppercase text-gray-500 font-semibold">Categoría</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5 focus:border-amber-500/60 focus:outline-none"
                    value={selectedEl.categoria}
                    onChange={(e) => updateElemento(selectedEl.id, { categoria: e.target.value as ZonaCategoria })}
                  >
                    {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

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
