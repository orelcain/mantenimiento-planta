/**
 * AreaTileEditor — Editor de áreas tipo FFT / ajedrez
 * 
 * Permite seleccionar tiles de la grilla (1m×1m) pintándolos
 * para definir la forma de un área. Se puede nombrar y vincular
 * a una zona real de la jerarquía.
 * 
 * Se activa en modo editor con la herramienta 'area'.
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { X, Save, Paintbrush, Eraser, Trash2, Link2, Tag } from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import type { MapArea } from '@/types/isometricMap'

interface AreaTileEditorProps {
  isOpen: boolean
  /** Existing area to edit, or null for new */
  editArea?: MapArea | null
  currentFloor: number
  onSave: (area: MapArea) => void
  onDelete?: (areaId: string) => void
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

export function AreaTileEditor({ isOpen, editArea, currentFloor, onSave, onDelete, onClose }: AreaTileEditorProps) {
  const { zones } = useAppStore()

  // Tiles state: set of "x,z" strings
  const [selectedTiles, setSelectedTiles] = useState<Set<string>>(() => {
    if (editArea?.tiles) {
      return new Set(editArea.tiles.map((t) => `${t.x},${t.z}`))
    }
    return new Set()
  })

  const [areaName, setAreaName] = useState(editArea?.label ?? '')
  const [areaColor, setAreaColor] = useState(editArea?.color ?? '#3b82f6')
  const [areaOpacity, setAreaOpacity] = useState(editArea?.opacity ?? 0.25)
  const [linkedZoneId, setLinkedZoneId] = useState(editArea?.linkedZoneId ?? '')
  const [tool, setTool] = useState<'paint' | 'erase'>('paint')
  const [zoneSearch, setZoneSearch] = useState('')
  const [showZoneList, setShowZoneList] = useState(false)

  // Grid viewport — show a 30×30 section centered at 0,0 (or area center)
  const gridCenter = useMemo(() => {
    if (editArea) {
      return { x: Math.round(editArea.position.x), z: Math.round(editArea.position.z) }
    }
    return { x: 0, z: 0 }
  }, [editArea])

  const gridSize = 30
  const cellPx = 18 // pixels per cell

  // Painting state
  const isPainting = useRef(false)

  const toggleTile = useCallback((x: number, z: number) => {
    const key = `${x},${z}`
    setSelectedTiles((prev) => {
      const next = new Set(prev)
      if (tool === 'paint') {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }, [tool])

  // Calculate area bounds from tiles
  const tileBounds = useMemo(() => {
    if (selectedTiles.size === 0) return null
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const key of selectedTiles) {
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
  }, [selectedTiles])

  const filteredZones = useMemo(() => {
    const active = zones.filter((z) => z.activa)
    if (!zoneSearch) return active
    const q = zoneSearch.toLowerCase()
    return active.filter((z) => z.nombre.toLowerCase().includes(q) || z.codigo.toLowerCase().includes(q))
  }, [zones, zoneSearch])

  const handleSave = useCallback(() => {
    if (!areaName.trim() || selectedTiles.size === 0) return

    const tiles = Array.from(selectedTiles).map((key) => {
      const parts = key.split(',')
      return { x: Number(parts[0]), z: Number(parts[1]) }
    })

    const bounds = tileBounds!

    const area: MapArea = {
      id: editArea?.id ?? `area-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      label: areaName.trim(),
      position: bounds.center,
      size: bounds.size,
      color: areaColor,
      opacity: areaOpacity,
      floor: currentFloor,
      tiles,
      linkedZoneId: linkedZoneId || undefined,
    }
    onSave(area)
    onClose()
  }, [areaName, selectedTiles, tileBounds, areaColor, areaOpacity, currentFloor, linkedZoneId, editArea, onSave, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Paintbrush className="h-5 w-5 text-primary" />
              {editArea ? 'Editar Área' : 'Nueva Área'}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Piso: {FLOOR_LABELS[currentFloor] ?? `Piso ${currentFloor}`} · Selecciona tiles de 1m×1m para definir la forma
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Grid tile selector */}
          <div className="flex-1 p-4 overflow-auto">
            {/* Tools */}
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant={tool === 'paint' ? 'default' : 'outline'}
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setTool('paint')}
              >
                <Paintbrush className="h-3.5 w-3.5" />
                Pintar
              </Button>
              <Button
                variant={tool === 'erase' ? 'default' : 'outline'}
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setTool('erase')}
              >
                <Eraser className="h-3.5 w-3.5" />
                Borrar
              </Button>
              <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="text-[10px]">
                  {selectedTiles.size} tiles ({selectedTiles.size}m²)
                </Badge>
              </div>
            </div>

            {/* Grid */}
            <div
              className="border rounded-lg bg-muted/30 overflow-auto select-none"
              style={{ maxHeight: 360 }}
            >
              <div
                className="relative"
                style={{
                  width: gridSize * cellPx,
                  height: gridSize * cellPx,
                }}
                onPointerUp={() => { isPainting.current = false }}
                onPointerLeave={() => { isPainting.current = false }}
              >
                {/* Grid cells */}
                {Array.from({ length: gridSize }).map((_, row) =>
                  Array.from({ length: gridSize }).map((_, col) => {
                    const x = gridCenter.x - Math.floor(gridSize / 2) + col
                    const z = gridCenter.z - Math.floor(gridSize / 2) + row
                    const key = `${x},${z}`
                    const isSelected = selectedTiles.has(key)

                    return (
                      <div
                        key={key}
                        className={cn(
                          'absolute border transition-colors',
                          isSelected ? 'border-white/30' : 'border-white/5 hover:border-white/20'
                        )}
                        style={{
                          left: col * cellPx,
                          top: row * cellPx,
                          width: cellPx,
                          height: cellPx,
                          backgroundColor: isSelected ? areaColor : 'transparent',
                          opacity: isSelected ? 0.6 : 1,
                          cursor: tool === 'paint' ? 'crosshair' : 'pointer',
                        }}
                        onPointerDown={(e) => {
                          e.preventDefault()
                          isPainting.current = true
                          toggleTile(x, z)
                        }}
                        onPointerEnter={() => {
                          if (isPainting.current) toggleTile(x, z)
                        }}
                      >
                        {/* Coordinate labels every 5m */}
                        {(x % 5 === 0 && z % 5 === 0) && (
                          <span className="absolute text-[7px] text-muted-foreground/40 leading-none" style={{ top: 1, left: 1 }}>
                            {x},{z}
                          </span>
                        )}
                      </div>
                    )
                  })
                )}
                {/* Center crosshair */}
                <div
                  className="absolute pointer-events-none border border-white/20"
                  style={{
                    left: Math.floor(gridSize / 2) * cellPx - 1,
                    top: 0,
                    width: 2,
                    height: gridSize * cellPx,
                  }}
                />
                <div
                  className="absolute pointer-events-none border border-white/20"
                  style={{
                    left: 0,
                    top: Math.floor(gridSize / 2) * cellPx - 1,
                    width: gridSize * cellPx,
                    height: 2,
                  }}
                />
              </div>
            </div>
          </div>

          {/* Right: Properties */}
          <div className="w-56 border-l p-3 space-y-3 overflow-y-auto">
            {/* Name */}
            <div>
              <label className="text-xs font-semibold flex items-center gap-1">
                <Tag className="h-3 w-3" />
                Nombre
              </label>
              <input
                type="text"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
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
                      areaColor === color ? 'ring-2 ring-primary scale-110' : 'hover:scale-110'
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setAreaColor(color)}
                  />
                ))}
                <input
                  type="color"
                  value={areaColor}
                  onChange={(e) => setAreaColor(e.target.value)}
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
                  value={areaOpacity}
                  onChange={(e) => setAreaOpacity(parseFloat(e.target.value))}
                  className="flex-1 h-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground w-8 text-right">
                  {Math.round(areaOpacity * 100)}%
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
                {linkedZoneId
                  ? zones.find((z) => z.id === linkedZoneId)?.nombre ?? linkedZoneId
                  : 'Sin vincular — click para buscar'}
              </button>
              {showZoneList && (
                <div className="mt-1 border rounded-lg bg-card max-h-40 overflow-y-auto">
                  <input
                    type="text"
                    placeholder="Buscar zona..."
                    value={zoneSearch}
                    onChange={(e) => setZoneSearch(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-muted border-b focus:outline-none"
                    autoFocus
                  />
                  {linkedZoneId && (
                    <button
                      className="w-full text-left px-2 py-1.5 text-xs text-destructive hover:bg-muted"
                      onClick={() => { setLinkedZoneId(''); setShowZoneList(false) }}
                    >
                      ✕ Desvincular
                    </button>
                  )}
                  {filteredZones.map((z) => (
                    <button
                      key={z.id}
                      className={cn(
                        'w-full text-left px-2 py-1.5 text-xs hover:bg-muted',
                        linkedZoneId === z.id && 'bg-primary/10 font-medium'
                      )}
                      onClick={() => { setLinkedZoneId(z.id); setShowZoneList(false) }}
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
                <p>Superficie: {selectedTiles.size}m²</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t">
          <div>
            {editArea && onDelete && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs text-destructive hover:text-destructive"
                onClick={() => { onDelete(editArea.id); onClose() }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar área
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="gap-1"
              onClick={handleSave}
              disabled={!areaName.trim() || selectedTiles.size === 0}
            >
              <Save className="h-3.5 w-3.5" />
              {editArea ? 'Actualizar área' : 'Crear área'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
