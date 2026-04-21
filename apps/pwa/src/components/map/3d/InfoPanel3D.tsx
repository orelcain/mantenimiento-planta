import { X, Wrench, AlertTriangle, Calendar } from 'lucide-react'
import { ZONAS, MOCK_OT, ESTADO_COLORS, CATEGORIA_ACCENT } from '@/data/zonas3d'
import { usePlanta3DStore } from '@/store/usePlanta3DStore'

const PRIORIDAD_COLOR = {
  alta:  'text-red-400 bg-red-900/40',
  media: 'text-yellow-400 bg-yellow-900/40',
  baja:  'text-blue-400 bg-blue-900/40',
} as const

const OT_ESTADO_COLOR = {
  abierta:    'text-red-400 bg-red-900/40',
  programada: 'text-blue-400 bg-blue-900/40',
  cerrada:    'text-gray-400 bg-gray-700/40',
} as const

export function InfoPanel3D() {
  const { selectedZonaId, setSelectedZona } = usePlanta3DStore()
  const zona = ZONAS.find((z) => z.id === selectedZonaId)

  if (!zona) return null

  const ots          = MOCK_OT[zona.id] ?? []
  const otAbiertas   = ots.filter((o) => o.estado === 'abierta').length
  const estadoColor  = ESTADO_COLORS[zona.estado]
  const accentColor  = CATEGORIA_ACCENT[zona.categoria]

  return (
    <div className="w-80 h-full bg-gray-900/95 border-l border-gray-700/60 flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div
        className="px-4 pt-4 pb-3 border-b border-gray-700/60"
        style={{ borderLeft: `3px solid ${accentColor}` }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] text-gray-400 font-mono tracking-wider">{zona.sap}</div>
            <h2 className="text-sm font-bold text-white mt-0.5 leading-tight">{zona.label}</h2>
            {zona.descripcion && (
              <p className="text-[11px] text-gray-400 mt-1 leading-snug">{zona.descripcion}</p>
            )}
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: estadoColor }} />
              <span className="text-[11px] capitalize font-medium" style={{ color: estadoColor }}>
                {zona.estado}
              </span>
              {otAbiertas > 0 && (
                <span className="ml-2 flex items-center gap-1 text-[10px] text-red-400">
                  <AlertTriangle size={10} />
                  {otAbiertas} OT abierta{otAbiertas > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setSelectedZona(null)}
            className="text-gray-500 hover:text-white transition-colors flex-shrink-0 mt-0.5"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Equipos instalados */}
      {zona.equipos && zona.equipos.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-700/60">
          <div className="flex items-center gap-1.5 mb-2">
            <Wrench size={11} className="text-gray-400" />
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Equipos instalados</span>
          </div>
          <div className="flex flex-col gap-1">
            {zona.equipos.map((eq) => (
              <div key={eq} className="flex items-center gap-2 text-xs text-gray-300">
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
                {eq}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Órdenes de trabajo */}
      <div className="px-4 py-3 flex-1 overflow-y-auto">
        <div className="flex items-center gap-1.5 mb-3">
          <Calendar size={11} className="text-gray-400" />
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">
            Órdenes de trabajo ({ots.length})
          </span>
        </div>

        {ots.length === 0 ? (
          <div className="text-xs text-gray-500 italic text-center py-4">
            Sin OT registradas para esta zona
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {ots.map((ot) => (
              <div key={ot.id} className="bg-gray-800/70 rounded-md p-3 border border-gray-700/50">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="text-[10px] text-gray-400 font-mono">{ot.id}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${PRIORIDAD_COLOR[ot.prioridad]}`}>
                    {ot.prioridad}
                  </span>
                </div>
                <div className="text-xs text-white leading-snug mb-2">{ot.titulo}</div>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${OT_ESTADO_COLOR[ot.estado]}`}>
                    {ot.estado}
                  </span>
                  <span className="text-[10px] text-gray-500">{ot.fecha}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="px-4 py-3 border-t border-gray-700/60 flex gap-2">
        <button className="flex-1 text-xs bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-2 rounded-md transition-colors font-medium">
          Ver OT abiertas
        </button>
        <button className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white py-2 rounded-md transition-colors">
          Evidencias
        </button>
      </div>
    </div>
  )
}
