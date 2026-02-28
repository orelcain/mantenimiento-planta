/**
 * AreaTileEditor — Panel lateral para editar área
 * 
 * El pintado de tiles se hace directamente en el mapa 3D.
 * Este componente solo muestra propiedades y controles.
 */

import { useState, useCallback, useMemo } from 'react'
import { X, Save, Paintbrush, Eraser, Trash2, Link2, Tag, Plus } from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { MapArea } from '@/types/isometricMap'

export interface AreaPaintState {
  tiles: Set<string>
  tool: 'paint' | 'erase'
  name: string
  color: string
  opacity: number
  linkedZoneId: string
  editAreaId: string | null
}

interface AreaTileEditorProps {
  isOpen: boolean
  paintState: AreaPaintState
  onPaintStateChange: (update: Partial<AreaPaintState>) => void
  currentFloor: number
  editArea?: MapArea | null
  onSave: (area: MapArea) => void
  onDelete?: (areaId: string) => void
  onCreateAndAddEquipment?: () => void
  onClose: () => void
}

const AREA_COLORS = [
  { color: '#3b82f6', label: 'Azul' },
  { color: '#22c55e', label: 'Verde' },
  { color: '#f59e0b', label: 'Ámbar' },
  { color: '#ef4444', label: 'Rojo' },
  { color: '#8b5cf6', label: 'Violeta' },
  { color: '#ec4899', label: 'Rosa' },
  { color: '#06b6d4', label: 'Cyan' },
  { color: '#f97316', label: 'Naranja' },
  { color: '#14b8a6', label: 'Teal' },
  { color: '#78716c', label: 'Piedra' },
]

const FLOOR_LABELS: Record<number, string> = {
  0: 'Planta Baja',
  1: 'Segundo Piso',
  2: 'Techo',
}

export function AreaTileEditor({
  isOpen,
  paintState,
  onPaintStateChange,
  currentFloor,
  editArea,
  onSave,
  onDelete,
  onCreateAndAddEquipment,
  onClose,
}: AreaTileEditorProps) {
  const { zones } = useAppStore()
  const [zoneSearch, setZoneSearch] = useState('')
  const [showZoneList, setShowZoneList] = useState(false)

  const filteredZones = useMemo(() => {
    const active = zones.filter((z) => z.activa)
    if (!zoneSearch) return active
    const q = zoneSearch.toLowerCase()
    return active.filter((z) => z.nombre.toLowerCase().includes(q) || z.codigo.toLowerCase().includes(q))
  }, [zones, zoneSearch])

  // Calculate area bounds from tiles
  const tileBounds = useMemo(() => {
    if (paintState.tiles.size === 0) return null
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const key of paintState.tiles) {
      const parts = key.split(',')
      const px = Number(parts[0])
      const pz = Number(parts[1])
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      minZ = Math.min(minZ, pz)
      maxZ = Math.max(maxZ, pz)
    }
    return {
      center: { x: (minX + maxX) / 2 + 0.5, z: (minZ + maxZ) / 2 + 0.5 },
      size: { width: maxX - minX + 1, depth: maxZ - minZ + 1 },
    }
  }, [paintState.tiles])

  const handleSave = useCallback(() => {
    if (!paintState.name.trim() || paintState.tiles.size === 0) return

    const tiles = Array.from(paintState.tiles).map((key) => {
      const parts = key.split(',')
      return { x: Number(parts[0]), z: Number(parts[1]) }
    })

    const bounds = tileBounds!

    const area: MapArea = {
      id: editArea?.id ?? `area-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      label: paintState.name.trim(),
      position: bounds.center,
      size: bounds.size,
      color: paintState.color,
      opacity: paintState.opacity,
      floor: currentFloor,
      tiles,
      linkedZoneId: paintState.linkedZoneId || undefined,
    }
    onSave(area)
  }, [paintState, tileBounds, currentFloor, editArea, onSave])

  if (!isOpen) return null

  return (
    <div className="absolute top-4 left-4 z-30 w-[22rem] md:w-[26rem] bg-card/95 backdrop-blur rounded-xl shadow-2xl border flex flex-col max-h-[calc(100%-2rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Paintbrush className="h-4 w-4 text-primary" />
            {editArea ? 'Editar Área' : 'Nueva Área'}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {FLOOR_LABELS[currentFloor]} · Selecciona tiles directamente en el mapa
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 p-3 space-y-3 overflow-y-auto">
        {/* Tools */}
        <div className="flex items-center gap-2">
          <Button
            variant={paintState.tool === 'paint' ? 'default' : 'outline'}
            size="sm"
            className="gap-1 text-xs flex-1"
            onClick={() => onPaintStateChange({ tool: 'paint' })}
          >
            <Paintbrush className="h-3.5 w-3.5" />
            Pintar
          </Button>
          <Button
            variant={paintState.tool === 'erase' ? 'default' : 'outline'}
            size="sm"
            className="gap-1 text-xs flex-1"
            onClick={() => onPaintStateChange({ tool: 'erase' })}
          >
            <Eraser className="h-3.5 w-3.5" />
            Borrar
          </Button>
        </div>

        {/* Tile count */}
        <div className="flex items-center justify-center">
          <Badge variant="secondary" className="text-xs">
            {paintState.tiles.size} tiles ({paintState.tiles.size}m²)
          </Badge>
        </div>

        {/* Name */}
        <div>
          <label className="text-xs font-semibold flex items-center gap-1">
            <Tag className="h-3 w-3" />
            Nombre
          </label>
          <input
            type="text"
            value={paintState.name}
            onChange={(e) => onPaintStateChange({ name: e.target.value })}
            placeholder="Ej: Eviscerado"
            className="w-full mt-1 px-2 py-1.5 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Color */}
        <div>
          <p className="text-xs font-semibold mb-1.5">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {AREA_COLORS.map(({ color }) => (
              <button
                key={color}
                className={cn(
                  'w-5 h-5 rounded-sm border transition-transform',
                  paintState.color === color ? 'ring-2 ring-primary scale-110' : 'hover:scale-110'
                )}
                style={{ backgroundColor: color }}
                onClick={() => onPaintStateChange({ color })}
              />
            ))}
            <input
              type="color"
              value={paintState.color}
              onChange={(e) => onPaintStateChange({ color: e.target.value })}
              className="w-5 h-5 cursor-pointer rounded-sm border-0 p-0"
            />
          </div>
        </div>

        {/* Opacity */}
        <div>
          <p className="text-xs font-semibold mb-1">Opacidad</p>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.1}
              max={0.6}
              step={0.05}
              value={paintState.opacity}
              onChange={(e) => onPaintStateChange({ opacity: parseFloat(e.target.value) })}
              className="flex-1 h-1 accent-primary"
            />
            <span className="text-xs text-muted-foreground w-8 text-right">
              {Math.round(paintState.opacity * 100)}%
            </span>
          </div>
        </div>

        {/* Link to zone */}
        <div>
          <p className="text-xs font-semibold flex items-center gap-1 mb-1">
            <Link2 className="h-3 w-3" />
            Vincular zona
          </p>
          <button
            className="w-full text-left px-2 py-1.5 text-xs bg-muted border rounded-lg hover:bg-muted/80"
            onClick={() => setShowZoneList(!showZoneList)}
          >
            {paintState.linkedZoneId
              ? zones.find((z) => z.id === paintState.linkedZoneId)?.nombre ?? paintState.linkedZoneId
              : 'Sin vincular — click para buscar'}
          </button>
          {showZoneList && (
            <div className="mt-1 border rounded-lg bg-card max-h-32 overflow-y-auto">
              <input
                type="text"
                placeholder="Buscar zona..."
                value={zoneSearch}
                onChange={(e) => setZoneSearch(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-muted border-b focus:outline-none"
                autoFocus
              />
              {paintState.linkedZoneId && (
                <button
                  className="w-full text-left px-2 py-1.5 text-xs text-destructive hover:bg-muted"
                  onClick={() => { onPaintStateChange({ linkedZoneId: '' }); setShowZoneList(false) }}
                >
                  ✕ Desvincular
                </button>
              )}
              {filteredZones.map((z) => (
                <button
                  key={z.id}
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs hover:bg-muted',
                    paintState.linkedZoneId === z.id && 'bg-primary/10 font-medium'
                  )}
                  onClick={() => { onPaintStateChange({ linkedZoneId: z.id }); setShowZoneList(false) }}
                >
                  {z.nombre} <span className="text-muted-foreground">({z.codigo})</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bounds info */}
        {tileBounds && (
          <div className="p-2 rounded-lg bg-muted/50 text-[10px] text-muted-foreground space-y-0.5">
            <p>Centro: ({tileBounds.center.x.toFixed(1)}, {tileBounds.center.z.toFixed(1)})m</p>
            <p>Bounding: {tileBounds.size.width}m × {tileBounds.size.depth}m</p>
            <p>Superficie: {paintState.tiles.size}m²</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t space-y-2">
        {onCreateAndAddEquipment && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full gap-1 text-xs"
            onClick={onCreateAndAddEquipment}
          >
            <Plus className="h-3.5 w-3.5" />
            Crear y agregar equipo
          </Button>
        )}
        {editArea && onDelete && (
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1 text-xs text-destructive hover:text-destructive"
            onClick={() => { onDelete(editArea.id); onClose() }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar área
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="flex-1 gap-1"
            onClick={handleSave}
            disabled={!paintState.name.trim() || paintState.tiles.size === 0}
          >
            <Save className="h-3.5 w-3.5" />
            {editArea ? 'Actualizar' : 'Crear'}
          </Button>
        </div>
      </div>
    </div>
  )
}
