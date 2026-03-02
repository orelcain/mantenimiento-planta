/**
 * EditorToolbar — Barra de herramientas flotante para el modo editor
 * 
 * Aparece como HUD overlay cuando el visor está en modo 'edit'.
 * Herramientas: Agregar equipo, Eliminar, Duplicar, Rotar, Guardar, Cancelar.
 */

import {
  Plus,
  Trash2,
  Copy,
  RotateCw,
  Save,
  X,
  Undo2,
  Redo2,
  Grid3X3,
  MousePointer2,
  Move,
  Hammer,
} from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { EquipmentNodeType } from '@/types/isometricMap'
import { EQUIPMENT_TYPE_LABELS, EQUIPMENT_TYPE_COLORS } from '@/types/isometricMap'

export type EditorTool = 'select' | 'move' | 'add' | 'bulldozer'

interface EditorToolbarProps {
  /** Herramienta activa */
  activeTool: EditorTool
  /** Hay un nodo seleccionado */
  hasSelection: boolean
  /** Hay cambios sin guardar */
  hasUnsavedChanges: boolean
  /** Guardando en progreso */
  isSaving: boolean
  /** Puede deshacer */
  canUndo: boolean
  /** Puede rehacer */
  canRedo: boolean
  /** Snap activo */
  snapEnabled: boolean
  /** Tipo de equipo seleccionado para agregar */
  addEquipmentType: EquipmentNodeType
  /** Callbacks */
  onToolChange: (tool: EditorTool) => void
  onAddEquipment: () => void
  onDeleteSelected: () => void
  onDuplicateSelected: () => void
  onRotateSelected: () => void
  onSave: () => void
  onCancel: () => void
  onUndo: () => void
  onRedo: () => void
  onToggleSnap: () => void
  onChangeEquipmentType: (type: EquipmentNodeType) => void
  onShowAddDialog: () => void
}

const TOOLS: { id: EditorTool; icon: typeof MousePointer2; label: string; shortcut: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Seleccionar', shortcut: 'V' },
  { id: 'move', icon: Move, label: 'Mover', shortcut: 'M' },
  { id: 'add', icon: Plus, label: 'Agregar', shortcut: 'A' },
  { id: 'bulldozer', icon: Hammer, label: 'Bulldozer', shortcut: 'B' },
]

export function EditorToolbar({
  activeTool,
  hasSelection,
  hasUnsavedChanges,
  isSaving,
  canUndo,
  canRedo,
  snapEnabled,
  addEquipmentType,
  onToolChange,
  onDeleteSelected,
  onDuplicateSelected,
  onRotateSelected,
  onSave,
  onCancel,
  onUndo,
  onRedo,
  onToggleSnap,
  onShowAddDialog,
}: EditorToolbarProps) {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
      {/* Herramientas principales */}
      <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur rounded-lg p-1 shadow-lg border">
        {TOOLS.map(({ id, icon: Icon, label, shortcut }) => (
          <Button
            key={id}
            variant={activeTool === id ? 'default' : 'ghost'}
            size="icon"
            className={cn(
              'h-8 w-8 relative',
              activeTool === id && 'bg-primary text-primary-foreground'
            )}
            onClick={() => onToolChange(id)}
            title={`${label} (${shortcut})`}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}

        <div className="w-px h-6 bg-border mx-1" />

        {/* Grid snap */}
        <Button
          variant={snapEnabled ? 'secondary' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={onToggleSnap}
          title="Snap a grilla (G)"
        >
          <Grid3X3 className="h-4 w-4" />
        </Button>
      </div>

      {/* Tipo de equipo (cuando tool = add) */}
      {activeTool === 'add' && (
        <div className="bg-card/95 backdrop-blur rounded-lg p-1 shadow-lg border flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs px-2"
            onClick={onShowAddDialog}
          >
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: EQUIPMENT_TYPE_COLORS[addEquipmentType] }}
            />
            {EQUIPMENT_TYPE_LABELS[addEquipmentType]}
          </Button>
        </div>
      )}

      {/* Acciones sobre selección */}
      {hasSelection && (
        <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur rounded-lg p-1 shadow-lg border">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onDuplicateSelected}
            title="Duplicar (Ctrl+D)"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRotateSelected}
            title="Rotar 90° (T)"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDeleteSelected}
            title="Eliminar (Delete)"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Undo/Redo + Save/Cancel */}
      <div className="flex items-center gap-0.5 bg-card/95 backdrop-blur rounded-lg p-1 shadow-lg border">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onUndo}
          disabled={!canUndo}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onRedo}
          disabled={!canRedo}
          title="Rehacer (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          variant="default"
          size="sm"
          className="h-8 gap-1 text-xs px-3"
          onClick={onSave}
          disabled={isSaving || !hasUnsavedChanges}
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? 'Guardando...' : 'Guardar'}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onCancel}
          title="Salir de edición"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
