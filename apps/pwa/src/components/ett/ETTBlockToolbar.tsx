/**
 * ETTBlockToolbar — Barra de botones para agregar bloques al editor
 *
 * Se muestra al final de la zona "Descripción de trabajos" o como
 * botón flotante entre bloques para insertar un nuevo bloque en
 * cualquier posición.
 */

import { FileText, List, Table2, Heading2, Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import type { ETTBloque } from '@/types'

export interface ETTBlockToolbarProps {
  onAdd: (bloque: ETTBloque) => void
  compact?: boolean
}

const PLANTILLAS_BLOQUES: Array<{
  label: string
  icon: React.ComponentType<{ className?: string }>
  factory: () => ETTBloque
}> = [
  {
    label: 'Párrafo',
    icon: FileText,
    factory: () => ({ tipo: 'parrafo', texto: '' }),
  },
  {
    label: 'Subtítulo',
    icon: Heading2,
    factory: () => ({ tipo: 'subtitulo', texto: '' }),
  },
  {
    label: 'Lista',
    icon: List,
    factory: () => ({
      tipo: 'lista',
      estilo: 'bullets',
      items: [{ texto: '' }],
    }),
  },
  {
    label: 'Tabla',
    icon: Table2,
    factory: () => ({
      tipo: 'tabla',
      columnas: ['Columna 1', 'Columna 2'],
      filas: [{ celdas: ['', ''] }],
    }),
  },
]

export function ETTBlockToolbar({ onAdd, compact = false }: ETTBlockToolbarProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1 py-1 opacity-50 hover:opacity-100 transition-opacity">
        <div className="flex-1 h-px bg-gray-200" />
        {PLANTILLAS_BLOQUES.map((p) => {
          const Icon = p.icon
          return (
            <Button
              key={p.label}
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-gray-500 hover:text-gray-900"
              onClick={() => onAdd(p.factory())}
              title={`Agregar ${p.label.toLowerCase()}`}
            >
              <Icon className="h-3 w-3 mr-1" />
              {p.label}
            </Button>
          )
        })}
        <div className="flex-1 h-px bg-gray-200" />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 bg-gray-50 border border-dashed border-gray-300 rounded-ctl mt-2">
      <span className="text-xs text-gray-500 font-medium">
        <Plus className="inline h-3 w-3 mr-1" />
        Agregar bloque:
      </span>
      {PLANTILLAS_BLOQUES.map((p) => {
        const Icon = p.icon
        return (
          <Button
            key={p.label}
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onAdd(p.factory())}
          >
            <Icon className="h-3 w-3 mr-1" />
            {p.label}
          </Button>
        )
      })}
    </div>
  )
}
