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
  brushSize: 1 | 3 | 5
  onBrushSizeChange: (size: 1 | 3 | 5) => void
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
  flattenTarget,
  onFlattenTargetChange,
}: TerrainEditorModalProps) {
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
              <p className="text-xs text-muted-foreground">Cada cuadrante representa 1m × 1m × 1m</p>
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
            <div className="flex items-center gap-1.5">
              <Button variant={brushSize === 1 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(1)}>1×1</Button>
              <Button variant={brushSize === 3 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(3)}>3×3</Button>
              <Button variant={brushSize === 5 ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => onBrushSizeChange(5)}>5×5</Button>
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
                  onClick={() => onFlattenTargetChange(clampElevation(flattenTarget - 1))}
                >
                  -1m
                </Button>
                <input
                  type="number"
                  min={MIN_TERRAIN_ELEVATION}
                  max={MAX_TERRAIN_ELEVATION}
                  step={1}
                  value={flattenTarget}
                  onChange={(e) => onFlattenTargetChange(clampElevation(parseFloat(e.target.value) || SEA_LEVEL_ELEVATION))}
                  className="w-24 h-8 text-xs bg-muted border rounded px-2 text-right font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => onFlattenTargetChange(clampElevation(flattenTarget + 1))}
                >
                  +1m
                </Button>
                <Badge variant="outline">m</Badge>
              </div>
            </div>
          )}

          <div className="rounded-lg border p-3 bg-primary/5 border-primary/20 text-xs text-primary">
            Click y arrastra para pintar continuo. Mantén Shift para suavizar temporalmente.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
