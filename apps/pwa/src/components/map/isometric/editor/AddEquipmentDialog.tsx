/**
 * AddEquipmentDialog — Diálogo modal para seleccionar tipo de equipo a agregar
 * 
 * Muestra una cuadrícula visual con los 10 tipos de equipo disponibles.
 * Al seleccionar uno, crea un nuevo nodo en la posición central del viewport.
 */

import { useEffect, useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { EquipmentNodeType, MapNode } from '@/types/isometricMap'
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_TYPE_COLORS } from '@/types/isometricMap'

interface AddEquipmentDialogProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (node: MapNode) => void
  selectedAreaLabel?: string | null
  allowedTypes?: EquipmentNodeType[]
  title?: string
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
  { type: 'evaporator', defaultSize: { width: 3, height: 2.5, depth: 2 }, description: 'Evaporador con serpentín y ventiladores' },
  { type: 'condenser', defaultSize: { width: 3.5, height: 2, depth: 2 }, description: 'Condensador térmico' },
  { type: 'panel', defaultSize: { width: 1.5, height: 2, depth: 0.5 }, description: 'Tablero eléctrico o de control' },
  { type: 'extractor', defaultSize: { width: 1.5, height: 2, depth: 1.5 }, description: 'Extractor o ventilador de aire' },
  { type: 'transformer', defaultSize: { width: 2.5, height: 3, depth: 2 }, description: 'Transformador eléctrico' },
  { type: 'boiler', defaultSize: { width: 3, height: 3.5, depth: 3 }, description: 'Caldera industrial' },
  { type: 'building', defaultSize: { width: 6, height: 4, depth: 5 }, description: 'Edificio o estructura' },
  { type: 'generic', defaultSize: { width: 2, height: 2, depth: 2 }, description: 'Equipo genérico' },
]

function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
}

export function AddEquipmentDialog({
  isOpen,
  onClose,
  onAdd,
  selectedAreaLabel,
  allowedTypes,
  title,
}: AddEquipmentDialogProps) {
  const [search, setSearch] = useState('')
  const [selectedPreset, setSelectedPreset] = useState<EquipmentPreset | null>(null)
  const [customLabel, setCustomLabel] = useState('')

  const availablePresets = allowedTypes?.length
    ? EQUIPMENT_PRESETS.filter((preset) => allowedTypes.includes(preset.type))
    : EQUIPMENT_PRESETS

  useEffect(() => {
    if (selectedPreset && !availablePresets.some((preset) => preset.type === selectedPreset.type)) {
      setSelectedPreset(null)
    }
  }, [availablePresets, selectedPreset])

  const filteredPresets = search
    ? availablePresets.filter(
        (p) =>
          EQUIPMENT_TYPE_LABELS[p.type].toLowerCase().includes(search.toLowerCase()) ||
          p.description.toLowerCase().includes(search.toLowerCase())
      )
    : availablePresets

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
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            {title ?? 'Agregar equipo'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Selecciona una categoría y tipo para ubicarlo en el mapa.
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="px-4 pt-3">
          {selectedAreaLabel && (
            <div className="mb-2 text-xs rounded-lg border bg-primary/5 border-primary/20 px-2.5 py-1.5 text-primary">
              Se agregará dentro de: <span className="font-semibold">{selectedAreaLabel}</span>
            </div>
          )}
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
        <div className="max-h-[48vh] overflow-y-auto p-4">
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
      </DialogContent>
    </Dialog>
  )
}
