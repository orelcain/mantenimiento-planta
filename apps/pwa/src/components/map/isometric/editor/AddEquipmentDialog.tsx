/**
 * AddEquipmentDialog — Diálogo modal para seleccionar tipo de equipo a agregar
 * 
 * Muestra una cuadrícula visual con los 10 tipos de equipo disponibles.
 * Al seleccionar uno, crea un nuevo nodo en la posición central del viewport.
 */

import { useState } from 'react'
import { X, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { EquipmentNodeType, MapNode } from '@/types/isometricMap'
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_TYPE_COLORS } from '@/types/isometricMap'

interface AddEquipmentDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (node: MapNode) => void
}

interface EquipmentPreset {
  type: EquipmentNodeType
  defaultSize: { width: number; height: number; depth: number }
  description: string
}

const EQUIPMENT_PRESETS: EquipmentPreset[] = [
  { type: 'pump', defaultSize: { width: 2, height: 1.5, depth: 1.5 }, description: 'Bomba de fluidos con entrada y salida' },
  { type: 'motor', defaultSize: { width: 2, height: 2, depth: 1.5 }, description: 'Motor eléctrico industrial' },
  { type: 'conveyor', defaultSize: { width: 5, height: 1.2, depth: 1.5 }, description: 'Cinta transportadora' },
  { type: 'tank', defaultSize: { width: 3, height: 4, depth: 3 }, description: 'Tanque o estanque de almacenamiento' },
  { type: 'compressor', defaultSize: { width: 2.5, height: 2.5, depth: 2 }, description: 'Compresor de aire o gas' },
  { type: 'valve', defaultSize: { width: 1, height: 1.2, depth: 1 }, description: 'Válvula de control de flujo' },
  { type: 'sensor', defaultSize: { width: 0.5, height: 1.5, depth: 0.5 }, description: 'Sensor IoT (temperatura, presión, etc.)' },
  { type: 'pipe', defaultSize: { width: 4, height: 0.5, depth: 0.5 }, description: 'Tramo de tubería' },
  { type: 'building', defaultSize: { width: 6, height: 4, depth: 5 }, description: 'Edificio o estructura' },
  { type: 'generic', defaultSize: { width: 2, height: 2, depth: 2 }, description: 'Equipo genérico' },
]

function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
}

export function AddEquipmentDialog({ isOpen, onClose, onAdd }: AddEquipmentDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<EquipmentPreset | null>(null)
  const [customLabel, setCustomLabel] = useState('')

  if (!isOpen) return null

  const filteredPresets = search
    ? EQUIPMENT_PRESETS.filter(
        (p) =>
          EQUIPMENT_TYPE_LABELS[p.type].toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase())
      )
    : EQUIPMENT_PRESETS

  const handleAdd = () => {
    const preset: EquipmentPreset = selectedPreset
      ? selectedPreset
      : { type: 'generic', defaultSize: { width: 2, height: 2, depth: 2 }, description: 'Equipo genérico' }
    const label = customLabel.trim() || `${EQUIPMENT_TYPE_LABELS[preset.type]} nuevo`

    const newNode: MapNode = {
      id: generateNodeId(),
      label,
      type: preset.type,
      position: { x: 0, y: 0, z: 0 },
      size: { ...preset.defaultSize },
      rotation: 0,
      visible: true,
    }

    onAdd(newNode)
    // Reset state
    setSearch('')
    setSelectedPreset(null)
    setCustomLabel('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Agregar equipo
          </h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar tipo de equipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>
        </div>

        {/* Equipment grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-2">
            {filteredPresets.map((preset) => (
              <button
                key={preset.type}
                className={cn(
                  'flex flex-col items-start gap-1.5 p-3 rounded-lg border text-left hover:bg-muted transition-colors',
                  selectedPreset?.type === preset.type && 'ring-2 ring-primary bg-muted'
                )}
                onClick={() => setSelectedPreset(preset)}
                onDoubleClick={() => {
                  setSelectedPreset(preset)
                  handleAdd()
                }}
              >
                <div className="flex items-center gap-2 w-full">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: EQUIPMENT_TYPE_COLORS[preset.type] }}
                  />
                  <span className="font-medium text-sm">{EQUIPMENT_TYPE_LABELS[preset.type]}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {preset.description}
                </p>
                <div className="text-[10px] text-muted-foreground/60 font-mono">
                  {preset.defaultSize.width}×{preset.defaultSize.height}×{preset.defaultSize.depth}m
                </div>
              </button>
            ))}
          </div>

          {filteredPresets.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              No se encontraron equipos
            </p>
          )}
        </div>

        {/* Custom label + Add button */}
        <div className="p-4 border-t space-y-3">
          <input
            type="text"
            placeholder="Nombre personalizado (opcional)"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && selectedPreset && handleAdd()}
            className="w-full text-sm bg-muted border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdd}
              disabled={!selectedPreset}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Agregar
              {selectedPreset && (
                <span className="opacity-70">
                  ({EQUIPMENT_TYPE_LABELS[selectedPreset.type]})
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
