/** Panel flotante de control de capas del mapa */

import { Layers, Wifi, AlertTriangle, Flame, Map } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CapasActivas } from './types'

interface Props {
  capasActivas: CapasActivas
  onToggle: (capa: keyof CapasActivas) => void
  totalSensores: number
  totalIncidencias: number
}

const CAPAS: Array<{
  key: keyof CapasActivas
  label: string
  Icon: React.ElementType
  count?: (p: Props) => number
}> = [
  { key: 'vistaAerea',     label: 'Vista aérea',  Icon: Map },
  { key: 'sensores',       label: 'Sensores',      Icon: Wifi,          count: p => p.totalSensores },
  { key: 'incidencias',    label: 'Incidencias',   Icon: AlertTriangle, count: p => p.totalIncidencias },
  { key: 'heatmap',        label: 'Heatmap',       Icon: Flame },
  { key: 'infraestructura',label: 'Infraestructura',Icon: Layers },
]

export function ControlCapas({ capasActivas, onToggle, totalSensores, totalIncidencias }: Props) {
  const props = { capasActivas, onToggle, totalSensores, totalIncidencias }

  return (
    <div className="absolute top-4 right-4 z-[1000] bg-gray-900/90 backdrop-blur-sm border border-gray-700 rounded-xl p-3 shadow-2xl min-w-[180px]">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
        <Layers className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-semibold text-gray-200 uppercase tracking-wider">Capas</span>
      </div>

      <div className="space-y-1">
        {CAPAS.map(({ key, label, Icon, count }) => {
          const activa = capasActivas[key]
          const n = count?.(props)
          return (
            <button
              key={key}
              onClick={() => onToggle(key)}
              className={cn(
                'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-xs transition-all',
                activa
                  ? 'bg-blue-600/20 text-blue-300 hover:bg-blue-600/30'
                  : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
              )}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {n !== undefined && n > 0 && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                  activa ? 'bg-blue-500/30 text-blue-300' : 'bg-gray-700 text-gray-400'
                )}>
                  {n}
                </span>
              )}
              <span className={cn(
                'w-2 h-2 rounded-full shrink-0',
                activa ? 'bg-blue-400' : 'bg-gray-600'
              )} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
