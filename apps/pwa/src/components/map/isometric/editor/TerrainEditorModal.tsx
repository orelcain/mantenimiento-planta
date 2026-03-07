import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button, Badge } from '@/components/ui'
import { MIN_TERRAIN_ELEVATION, MAX_TERRAIN_ELEVATION, SEA_LEVEL_ELEVATION, clampElevation } from '@/types/isometricMap'

interface TerrainEditorModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  terrainEditEnabled: boolean
  onToggleTerrainEdit: () => void
  tool: 'raise' | 'lower' | 'flatten' | 'smooth' | 'sample'
  onToolChange: (tool: 'raise' | 'lower' | 'flatten' | 'smooth' | 'sample') => void
  brushSize: 1 | 3 | 5 | 7 | 9
  onBrushSizeChange: (size: 1 | 3 | 5 | 7 | 9) => void
  brushStrength: 1 | 2 | 3 | 4 | 5
  onBrushStrengthChange: (value: 1 | 2 | 3 | 4 | 5) => void
  editableMin: number
  editableMax: number
  onEditableMinChange: (value: number) => void
  onEditableMaxChange: (value: number) => void
  onApplyRecommendedLimits: () => void
  flattenTarget: number
  onFlattenTargetChange: (value: number) => void
}

export function TerrainEditorModal({
  isOpen,
  onOpenChange,
  terrainEditEnabled,
  onToggleTerrainEdit,
  tool,
  onToolChange,
  brushSize,
  onBrushSizeChange,
  brushStrength,
  onBrushStrengthChange,
  editableMin,
  editableMax,
  onEditableMinChange,
  onEditableMaxChange,
  onApplyRecommendedLimits,
  flattenTarget,
  onFlattenTargetChange,
}: TerrainEditorModalProps) {
  const clampToEditableRange = (value: number) => {
    return Math.max(editableMin, Math.min(editableMax, clampElevation(value)))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Editor de Terreno</DialogTitle>
          <DialogDescription>
            Flujo simple tipo Sims: activar, elegir herramienta, tamaño de brocha y pintar en el mapa.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
            <div>
              <p className="text-sm font-semibold">Modo edición de terreno</p>
              <p className="text-xs text-muted-foreground">Cada cuadrante representa 1m × 1m y permite alturas entre -50m y +200m</p>
            </div>
            <Button
              variant={terrainEditEnabled ? 'default' : 'outline'}
              size="sm"
              onClick={onToggleTerrainEdit}
            >
              {terrainEditEnabled ? 'ON' : 'OFF'}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Herramienta</p>
            <div className="grid grid-cols-5 gap-1.5">
              <Button variant={tool === 'raise' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onToolChange('raise')}>Subir</Button>
              <Button variant={tool === 'lower' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onToolChange('lower')}>Bajar</Button>
              <Button variant={tool === 'flatten' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onToolChange('flatten')}>Aplanar</Button>
              <Button variant={tool === 'smooth' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onToolChange('smooth')}>Suavizar</Button>
              <Button variant={tool === 'sample' ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onToolChange('sample')}>Muestrear</Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Brocha</p>
            <div className="grid grid-cols-5 gap-1.5">
              <Button variant={brushSize === 1 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(1)}>1×1</Button>
              <Button variant={brushSize === 3 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(3)}>3×3</Button>
              <Button variant={brushSize === 5 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(5)}>5×5</Button>
              <Button variant={brushSize === 7 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(7)}>7×7</Button>
              <Button variant={brushSize === 9 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(9)}>9×9</Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Intensidad</p>
            <div className="grid grid-cols-5 gap-1.5">
              <Button variant={brushStrength === 1 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushStrengthChange(1)}>1</Button>
              <Button variant={brushStrength === 2 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushStrengthChange(2)}>2</Button>
              <Button variant={brushStrength === 3 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushStrengthChange(3)}>3</Button>
              <Button variant={brushStrength === 4 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushStrengthChange(4)}>4</Button>
              <Button variant={brushStrength === 5 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushStrengthChange(5)}>5</Button>
            </div>
          </div>

          <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Topes de construcción</p>
              <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={onApplyRecommendedLimits}>
                Usar -30 / +60
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Mín editable (m)</p>
                <input
                  type="number"
                  min={MIN_TERRAIN_ELEVATION}
                  max={editableMax - 1}
                  step={1}
                  value={editableMin}
                  onChange={(e) => onEditableMinChange(parseFloat(e.target.value) || editableMin)}
                  className="w-full h-8 text-xs bg-muted border rounded px-2 text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Máx editable (m)</p>
                <input
                  type="number"
                  min={editableMin + 1}
                  max={MAX_TERRAIN_ELEVATION}
                  step={1}
                  value={editableMax}
                  onChange={(e) => onEditableMaxChange(parseFloat(e.target.value) || editableMax)}
                  className="w-full h-8 text-xs bg-muted border rounded px-2 text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Hard limit global: {MIN_TERRAIN_ELEVATION}m a +{MAX_TERRAIN_ELEVATION}m.
            </div>
          </div>

          {(tool === 'flatten' || tool === 'sample') && (
            <div className="space-y-2 rounded-lg border p-3 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nivel objetivo</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onFlattenTargetChange(clampToEditableRange(flattenTarget - 1))}
                >
                  -1m
                </Button>
                <input
                  type="number"
                  min={editableMin}
                  max={editableMax}
                  step={1}
                  value={flattenTarget}
                  onChange={(e) => onFlattenTargetChange(clampToEditableRange(parseFloat(e.target.value) || SEA_LEVEL_ELEVATION))}
                  className="w-24 h-8 text-xs bg-muted border rounded px-2 text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onFlattenTargetChange(clampToEditableRange(flattenTarget + 1))}
                >
                  +1m
                </Button>
                <Badge variant="outline">m</Badge>
              </div>
            </div>
          )}

          <div className="rounded-lg border p-3 bg-primary/5 border-primary/20 text-xs text-primary space-y-1">
            <p>Click y arrastra para pintar continuo. Mantén Shift para suavizar temporalmente.</p>
            <p>Para estilo Sims: usa brocha 5x5 o 7x7 con intensidad 2-3.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
