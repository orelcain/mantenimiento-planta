/**
 * NodePropertiesPanel — Panel lateral para editar propiedades de un nodo seleccionado
 * 
 * Aparece en el lado derecho del viewport cuando hay un nodo seleccionado en modo editor.
 * Permite editar: label, tipo, posición, tamaño, rotación, color, linked entity.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Tag,
  MapPin,
  Maximize2,
  RotateCw,
  Palette,
  Link2,
  ChevronDown,
} from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { MapNode, EquipmentNodeType } from '@/types/isometricMap'
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_TYPE_COLORS } from '@/types/isometricMap'

interface NodePropertiesPanelProps {
  node: MapNode
  onUpdate: (nodeId: string, updates: Partial<MapNode>) => void
  onClose: () => void
  onDelete: () => void
}

const ALL_EQUIPMENT_TYPES: EquipmentNodeType[] = [
  'pump', 'motor', 'conveyor', 'tank', 'compressor',
  'valve', 'sensor', 'pipe', 'building', 'generic',
]

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 text-xs bg-muted border rounded px-2 py-1 text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  )
}

export function NodePropertiesPanel({
  node,
  onUpdate,
  onClose,
  onDelete,
}: NodePropertiesPanelProps) {
  const [localLabel, setLocalLabel] = useState(node.label)
  const [showTypeSelector, setShowTypeSelector] = useState(false)

  useEffect(() => {
    setLocalLabel(node.label)
  }, [node.id, node.label])

  const commitLabel = useCallback(() => {
    if (localLabel.trim() && localLabel !== node.label) {
      onUpdate(node.id, { label: localLabel.trim() })
    }
  }, [localLabel, node.id, node.label, onUpdate])

  const updatePosition = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onUpdate(node.id, {
        position: { ...node.position, [axis]: value },
      })
    },
    [node.id, node.position, onUpdate]
  )

  const updateSize = useCallback(
    (dim: 'width' | 'height' | 'depth', value: number) => {
      onUpdate(node.id, {
        size: { ...node.size, [dim]: Math.max(0.5, value) },
      })
    },
    [node.id, node.size, onUpdate]
  )

  return (
    <div className="h-full flex flex-col bg-card/95 backdrop-blur">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: node.color || EQUIPMENT_TYPE_COLORS[node.type] }}
          />
          <h3 className="font-semibold text-sm truncate">Propiedades</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Label */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Tag className="h-3 w-3" />
            Nombre
          </div>
          <input
            type="text"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => e.key === 'Enter' && commitLabel()}
            className="w-full text-sm bg-muted border rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Tipo */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Palette className="h-3 w-3" />
            Tipo de equipo
          </div>
          <button
            className="w-full flex items-center justify-between bg-muted border rounded px-2.5 py-1.5 text-sm hover:bg-muted/80 transition-colors"
            onClick={() => setShowTypeSelector(!showTypeSelector)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: EQUIPMENT_TYPE_COLORS[node.type] }}
              />
              {EQUIPMENT_TYPE_LABELS[node.type]}
            </div>
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showTypeSelector && 'rotate-180')} />
          </button>
          {showTypeSelector && (
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded border">
              {ALL_EQUIPMENT_TYPES.map((type) => (
                <button
                  key={type}
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded text-xs hover:bg-background transition-colors',
                    type === node.type && 'bg-background ring-1 ring-primary'
                  )}
                  onClick={() => {
                    onUpdate(node.id, { type })
                    setShowTypeSelector(false)
                  }}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: EQUIPMENT_TYPE_COLORS[type] }}
                  />
                  {EQUIPMENT_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Posición */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MapPin className="h-3 w-3" />
            Posición (m)
          </div>
          <div className="space-y-1">
            <NumberInput label="X" value={node.position.x} onChange={(v) => updatePosition('x', v)} step={1} />
            <NumberInput label="Y" value={node.position.y} onChange={(v) => updatePosition('y', v)} step={0.5} min={0} />
            <NumberInput label="Z" value={node.position.z} onChange={(v) => updatePosition('z', v)} step={1} />
          </div>
        </div>

        {/* Tamaño */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Maximize2 className="h-3 w-3" />
            Tamaño (m)
          </div>
          <div className="space-y-1">
            <NumberInput label="Ancho" value={node.size.width} onChange={(v) => updateSize('width', v)} step={0.5} min={0.5} />
            <NumberInput label="Alto" value={node.size.height} onChange={(v) => updateSize('height', v)} step={0.5} min={0.5} />
            <NumberInput label="Prof." value={node.size.depth} onChange={(v) => updateSize('depth', v)} step={0.5} min={0.5} />
          </div>
        </div>

        {/* Rotación */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <RotateCw className="h-3 w-3" />
            Rotación
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={360}
              step={15}
              value={node.rotation}
              onChange={(e) => onUpdate(node.id, { rotation: parseInt(e.target.value) })}
              className="flex-1"
            />
            <span className="text-xs font-mono w-10 text-right">{node.rotation}°</span>
          </div>
        </div>

        {/* Visibilidad */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Visible</span>
          <button
            className={cn(
              'w-9 h-5 rounded-full transition-colors relative',
              node.visible ? 'bg-primary' : 'bg-muted-foreground/30'
            )}
            onClick={() => onUpdate(node.id, { visible: !node.visible })}
          >
            <div
              className={cn(
                'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                node.visible ? 'translate-x-4' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        {/* Vinculación */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Link2 className="h-3 w-3" />
            Vinculación
          </div>
          {node.linkedEntityId ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {node.linkedEntityType || 'entity'}
              </Badge>
              <span className="text-xs text-muted-foreground truncate">{node.linkedEntityId}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 shrink-0"
                onClick={() => onUpdate(node.id, { linkedEntityId: undefined, linkedEntityType: undefined })}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">
              Sin vincular — Próximamente
            </p>
          )}
        </div>

        {/* ID del nodo */}
        <div className="pt-2 border-t">
          <span className="text-[10px] text-muted-foreground/50 font-mono break-all">
            ID: {node.id}
          </span>
        </div>
      </div>

      {/* Footer: Delete */}
      <div className="p-3 border-t">
        <Button
          variant="destructive"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => onDelete()}
        >
          Eliminar equipo
        </Button>
      </div>
    </div>
  )
}
