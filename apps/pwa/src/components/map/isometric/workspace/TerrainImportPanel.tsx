import type { ReactNode } from 'react'
import { Button, Textarea } from '@/components/ui'
import type { TerrainImportPreview, TerrainImportProgress } from '@/lib/terrainImport'

interface TerrainImportPanelProps {
  title?: string
  description?: string
  layout?: 'vertical' | 'horizontal'
  importLabel?: string
  importBusyLabel?: string
  isImporting: boolean
  onImport: () => void
  coordinatesText: string
  onCoordinatesTextChange: (value: string) => void
  sampleStep: number
  onSampleStepChange: (value: number) => void
  statusMessage?: string | null
  preview?: TerrainImportPreview | null
  previewError?: string | null
  progress?: TerrainImportProgress | null
  coordinateRows?: number
  headerActions?: ReactNode
  footer?: ReactNode
}

const SAMPLE_STEPS = [1] as const

export function TerrainImportPanel({
  title = 'Terreno Real (4 Coordenadas)',
  description = 'Genera una malla de alturas gradual desde elevacion geoespacial y la adapta al canvas del visor.',
  layout = 'vertical',
  importLabel = 'Importar malla real',
  importBusyLabel = 'Importando...',
  isImporting,
  onImport,
  coordinatesText,
  onCoordinatesTextChange,
  sampleStep,
  onSampleStepChange,
  statusMessage,
  preview,
  previewError,
  progress,
  coordinateRows = 4,
  headerActions,
  footer,
}: TerrainImportPanelProps) {
  const isHorizontal = layout === 'horizontal'

  return (
    <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <Button
            variant="default"
            size="sm"
            className="h-8 text-xs"
            onClick={onImport}
            disabled={isImporting}
          >
            {isImporting ? importBusyLabel : importLabel}
          </Button>
        </div>
      </div>

      <div className={isHorizontal ? 'grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-start' : 'space-y-3'}>
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Coordenadas (4 lineas, formato: lat, lon)</p>
            <Textarea
              value={coordinatesText}
              onChange={(event) => onCoordinatesTextChange(event.target.value)}
              rows={coordinateRows}
              className="text-[11px] font-mono"
              placeholder="-42.632500, -73.763200"
            />
          </div>

          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">Detalle de malla base (1 m). Si la grilla es muy grande, el sistema puede aumentar el muestreo efectivo automáticamente.</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {SAMPLE_STEPS.map((step) => (
                <Button
                  key={step}
                  size="sm"
                  variant={sampleStep === step ? 'default' : 'outline'}
                  className="h-7 px-2 text-[11px]"
                  onClick={() => onSampleStepChange(step)}
                >
                  {step}m
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {previewError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">
              {previewError}
            </div>
          )}

          {preview && (
            <div className="rounded-lg border bg-background/70 p-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Previsualizacion</p>
              <div className="grid gap-2 sm:grid-cols-2 text-[11px] text-muted-foreground">
                <div>Rectangulo estimado: <span className="font-medium text-foreground">{Math.round(preview.rectangleWidthMeters)} m × {Math.round(preview.rectangleDepthMeters)} m</span></div>
                <div>Canvas final: <span className="font-medium text-foreground">{preview.gridWidth} m × {preview.gridDepth} m</span></div>
                <div>Muestreo efectivo: <span className="font-medium text-foreground">cada {preview.sampleStep} m</span></div>
                <div>Puntos API: <span className="font-medium text-foreground">{preview.totalSamplePoints}</span> ({preview.sampleCols} × {preview.sampleRows})</div>
              </div>
            </div>
          )}

          {isImporting && progress && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium text-primary">Progreso de importacion</span>
                <span className="font-mono text-primary">{progress.percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-primary/15">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
              </div>
              <div className="text-[11px] text-muted-foreground">
                Lotes: {progress.completedBatches}/{progress.totalBatches} · Puntos: {progress.completedPoints}/{progress.totalPoints}
              </div>
            </div>
          )}

          {statusMessage && (
            <p className="text-[11px] font-medium text-primary">{statusMessage}</p>
          )}
        </div>
      </div>

      {footer}
    </div>
  )
}