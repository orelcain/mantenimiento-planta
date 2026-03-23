/** Capa de incidencias con globos informativos y severidad visual */

import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { IncidenciaMapa, SeveridadIncidencia, EstadoIncidencia } from './types'

const COLOR_SEVERIDAD: Record<SeveridadIncidencia, string> = {
  baja:    '#22c55e',
  media:   '#f59e0b',
  alta:    '#f97316',
  critica: '#ef4444',
}

const ICONO_SEVERIDAD: Record<SeveridadIncidencia, string> = {
  baja:    '●',
  media:   '▲',
  alta:    '▲',
  critica: '⚠',
}

const LABEL_ESTADO: Record<EstadoIncidencia, string> = {
  activa:     'Activa',
  en_proceso: 'En proceso',
  resuelta:   'Resuelta',
}

const COLOR_ESTADO: Record<EstadoIncidencia, string> = {
  activa:     '#ef4444',
  en_proceso: '#f59e0b',
  resuelta:   '#22c55e',
}

function iconIncidencia(severidad: SeveridadIncidencia, estado: EstadoIncidencia) {
  const color = estado === 'resuelta' ? '#6b7280' : COLOR_SEVERIDAD[severidad]
  const icono = ICONO_SEVERIDAD[severidad]
  const pulsar = estado === 'activa' && severidad === 'critica'

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 36 42">
      <filter id="sombra">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
      <path d="M18 2 C9 2 2 9 2 18 C2 28 18 40 18 40 C18 40 34 28 34 18 C34 9 27 2 18 2Z"
            fill="${color}" filter="url(#sombra)" opacity="${estado === 'resuelta' ? 0.6 : 1}"/>
      <text x="18" y="22" text-anchor="middle" font-size="14" fill="white" font-weight="bold">${icono}</text>
      ${pulsar ? `<circle cx="18" cy="18" r="16" fill="none" stroke="${color}" stroke-width="2">
        <animate attributeName="r" values="16;24;16" dur="1.2s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.8;0;0.8" dur="1.2s" repeatCount="indefinite"/>
      </circle>` : ''}
    </svg>`

  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [36, 42],
    iconAnchor: [18, 42],
    popupAnchor: [0, -44],
  })
}

interface Props {
  incidencias: IncidenciaMapa[]
  onIncidenciaClick?: (i: IncidenciaMapa) => void
}

export function CapaIncidencias({ incidencias, onIncidenciaClick }: Props) {
  return (
    <>
      {incidencias.map(inc => (
        <Marker
          key={inc.id}
          position={[inc.lat, inc.lng]}
          icon={iconIncidencia(inc.severidad, inc.estado)}
          eventHandlers={{ click: () => onIncidenciaClick?.(inc) }}
          zIndexOffset={inc.severidad === 'critica' ? 1000 : inc.severidad === 'alta' ? 500 : 0}
        >
          <Popup className="mapa-popup" maxWidth={260}>
            <div className="min-w-[220px]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="font-semibold text-sm leading-tight">{inc.titulo}</span>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                  style={{ background: COLOR_ESTADO[inc.estado] + '22', color: COLOR_ESTADO[inc.estado] }}
                >
                  {LABEL_ESTADO[inc.estado]}
                </span>
              </div>
              {inc.descripcion && (
                <p className="text-xs text-gray-500 mb-2 leading-snug">{inc.descripcion}</p>
              )}
              <div className="text-xs space-y-1">
                <div className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ background: COLOR_SEVERIDAD[inc.severidad] }}
                  />
                  <span className="capitalize font-medium" style={{ color: COLOR_SEVERIDAD[inc.severidad] }}>
                    Severidad {inc.severidad}
                  </span>
                </div>
                {inc.zona && <div className="text-gray-500">Zona: {inc.zona}</div>}
                {inc.reportadoPor && <div className="text-gray-500">Por: {inc.reportadoPor}</div>}
                <div className="text-gray-400 text-[11px]">{inc.fecha}</div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
