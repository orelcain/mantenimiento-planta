/** Capa de sensores IoT sobre el mapa con estado en tiempo real */

import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import type { SensorMapa, EstadoSensor } from './types'

const COLOR_ESTADO: Record<EstadoSensor, string> = {
  ok:       '#22c55e',
  alerta:   '#f59e0b',
  critico:  '#ef4444',
  offline:  '#6b7280',
}

const LABEL_ESTADO: Record<EstadoSensor, string> = {
  ok:      'Normal',
  alerta:  'Alerta',
  critico: 'Crítico',
  offline: 'Sin señal',
}

function iconSensor(estado: EstadoSensor) {
  const color = COLOR_ESTADO[estado]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="12" fill="${color}" fill-opacity="0.25" stroke="${color}" stroke-width="2"/>
      <circle cx="16" cy="16" r="6" fill="${color}"/>
      ${estado === 'critico' ? `<circle cx="16" cy="16" r="12" fill="none" stroke="${color}" stroke-width="2" opacity="0.5">
        <animate attributeName="r" values="12;18;12" dur="1.5s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.5;0;0.5" dur="1.5s" repeatCount="indefinite"/>
      </circle>` : ''}
    </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  })
}

interface Props {
  sensores: SensorMapa[]
  onSensorClick?: (s: SensorMapa) => void
}

export function CapaSensores({ sensores, onSensorClick }: Props) {
  return (
    <>
      {sensores.map(sensor => (
        <Marker
          key={sensor.id}
          position={[sensor.lat, sensor.lng]}
          icon={iconSensor(sensor.estado)}
          eventHandlers={{ click: () => onSensorClick?.(sensor) }}
        >
          <Popup className="mapa-popup">
            <div className="min-w-[180px]">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full inline-block"
                  style={{ background: COLOR_ESTADO[sensor.estado] }}
                />
                <span className="font-semibold text-sm">{sensor.label}</span>
              </div>
              <div className="text-xs space-y-1 text-gray-600">
                <div>Tipo: <span className="font-medium">{sensor.tipo}</span></div>
                <div>Estado: <span className="font-medium" style={{ color: COLOR_ESTADO[sensor.estado] }}>{LABEL_ESTADO[sensor.estado]}</span></div>
                {sensor.valor !== undefined && (
                  <div>Valor: <span className="font-medium">{sensor.valor} {sensor.unidad}</span></div>
                )}
                {sensor.ultimaLectura && (
                  <div className="text-gray-400 text-[11px]">Última lectura: {sensor.ultimaLectura}</div>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}
