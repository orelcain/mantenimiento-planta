/**
 * Panel lateral del mapa Leaflet:
 *  • Toggle de visibilidad por capa DXF (agrupado por categoría)
 *  • Lista de elementos editables (zonas/puntos creados por el usuario)
 *  • Edición rápida de nombre/categoría/estado del elemento seleccionado
 */

import { Eye, EyeOff, Edit3, Save, Trash2, Check } from 'lucide-react'
import { DXF_LAYERS, type DxfLayerConfig } from '@/data/dxfLayers'
import { useMapaLeafletStore, type ZonaCategoria, type ZonaEstado } from '@/store/useMapaLeafletStore'
import { useState } from 'react'

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

export function PanelCapasYZonas() {
  const {
    elementos, selectedId, editMode,
    capasVisibles,
    setSelectedId, toggleEditMode, setCapaVisible, setAllCapas,
    updateElemento, deleteElemento,
  } = useMapaLeafletStore()
  const [tab, setTab] = useState<'capas' | 'zonas'>('zonas')

  const selectedEl = elementos.find((e) => e.id === selectedId) ?? null

  // Agrupar capas por categoría
  const grupos = new Map<string, DxfLayerConfig[]>()
  for (const c of DXF_LAYERS) {
    if (!grupos.has(c.group)) grupos.set(c.group, [])
    grupos.get(c.group)!.push(c)
  }

  return (
    <div className="absolute top-3 right-3 w-72 max-h-[calc(100%-24px)] bg-gray-900/95 backdrop-blur border border-gray-700/60 rounded-lg shadow-2xl text-gray-200 flex flex-col overflow-hidden">
      {/* Header con tabs */}
      <div className="flex border-b border-gray-700/50 shrink-0">
        <button
          onClick={() => setTab('zonas')}
          className={`flex-1 text-xs py-2 font-semibold transition-colors ${
            tab === 'zonas' ? 'bg-gray-800 text-amber-400' : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Zonas / Equipos
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
      <div className="px-3 py-2 border-b border-gray-700/40 shrink-0 flex items-center gap-2">
        <button
          onClick={toggleEditMode}
          className={`flex-1 flex items-center justify-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md font-medium transition-all border ${
            editMode
              ? 'bg-blue-600/30 border-blue-500/70 text-blue-300'
              : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500'
          }`}
        >
          {editMode ? <Save size={11} /> : <Edit3 size={11} />}
          {editMode ? 'Guardando cambios' : 'Editar'}
        </button>
      </div>

      {/* Contenido scroll */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'capas' && (
          <div className="p-2">
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setAllCapas(true)}
                className="flex-1 text-[10px] py-1 bg-gray-800 hover:bg-gray-700 rounded">
                Todas
              </button>
              <button
                onClick={() => setAllCapas(false)}
                className="flex-1 text-[10px] py-1 bg-gray-800 hover:bg-gray-700 rounded">
                Ninguna
              </button>
            </div>

            {Array.from(grupos.entries()).map(([gKey, capas]) => (
              <div key={gKey} className="mb-3">
                <div className="text-[9px] uppercase tracking-wider text-gray-500 px-1 mb-1">
                  {GROUP_LABEL[gKey as DxfLayerConfig['group']]}
                </div>
                {capas.map((c) => {
                  const visible = capasVisibles[c.name] ?? c.defaultVisible
                  return (
                    <button
                      key={c.name}
                      onClick={() => setCapaVisible(c.name, !visible)}
                      className="w-full flex items-center gap-2 px-2 py-1 hover:bg-gray-800 rounded text-left"
                    >
                      {visible ? <Eye size={11} className="text-gray-400 shrink-0" /> : <EyeOff size={11} className="text-gray-600 shrink-0" />}
                      <div className="w-3 h-3 rounded-sm border border-gray-700 shrink-0" style={{ backgroundColor: visible ? c.color : 'transparent' }} />
                      <span className={`text-[11px] truncate ${visible ? 'text-gray-200' : 'text-gray-600'}`}>{c.label}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {tab === 'zonas' && (
          <div className="p-2">
            {/* Lista de elementos */}
            {elementos.length === 0 ? (
              <div className="text-center text-[11px] text-gray-500 py-6 italic">
                Sin elementos.<br />
                Activá <span className="text-blue-400">Editar</span> y dibujá zonas en el mapa.
              </div>
            ) : (
              <div className="flex flex-col gap-1 mb-3">
                {elementos.map((el) => (
                  <button
                    key={el.id}
                    onClick={() => setSelectedId(el.id === selectedId ? null : el.id)}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                      selectedId === el.id
                        ? 'bg-amber-900/30 border border-amber-700/50'
                        : 'hover:bg-gray-800 border border-transparent'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{
                      backgroundColor: el.estado === 'operativo' ? '#22c55e' : el.estado === 'alerta' ? '#f59e0b' : '#ef4444',
                    }} />
                    <span className="text-[11px] text-gray-200 flex-1 truncate">{el.nombre}</span>
                    <span className="text-[9px] text-gray-500 uppercase">{el.tipo}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Detalle del seleccionado */}
            {selectedEl && (
              <div className="border-t border-gray-700/50 pt-3 mt-2 flex flex-col gap-2">
                <div>
                  <label className="text-[9px] uppercase text-gray-500">Nombre</label>
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5"
                    value={selectedEl.nombre}
                    onChange={(e) => updateElemento(selectedEl.id, { nombre: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-[9px] uppercase text-gray-500">Categoría</label>
                  <select
                    className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white mt-0.5"
                    value={selectedEl.categoria}
                    onChange={(e) => updateElemento(selectedEl.id, { categoria: e.target.value as ZonaCategoria })}
                  >
                    {CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] uppercase text-gray-500">Estado</label>
                  <div className="flex gap-1 mt-0.5">
                    {ESTADOS.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => updateElemento(selectedEl.id, { estado: s.value })}
                        className={`flex-1 text-[10px] py-1 rounded border transition-all ${
                          selectedEl.estado === s.value
                            ? 'border-current font-semibold'
                            : 'border-gray-700 text-gray-500 hover:text-gray-300'
                        }`}
                        style={selectedEl.estado === s.value ? { color: s.color, backgroundColor: s.color + '22' } : {}}
                      >
                        {selectedEl.estado === s.value && <Check size={10} className="inline -mt-0.5 mr-0.5" />}
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => { deleteElemento(selectedEl.id); setSelectedId(null) }}
                  className="flex items-center justify-center gap-1.5 text-[11px] py-1.5 mt-1 bg-red-900/30 hover:bg-red-900/50 border border-red-800/50 text-red-300 rounded"
                >
                  <Trash2 size={11} /> Eliminar elemento
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-gray-700/40 text-[9px] text-gray-500 flex justify-between shrink-0">
        <span>{elementos.length} elementos · {DXF_LAYERS.length} capas</span>
        {editMode && <span className="text-blue-400">EDIT</span>}
      </div>
    </div>
  )
}
