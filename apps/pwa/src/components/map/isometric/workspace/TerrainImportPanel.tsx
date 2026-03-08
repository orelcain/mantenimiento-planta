import type { ReactNode } from 'react'
import { Button, Textarea } from '@/components/ui'

interface TerrainImportPanelProps {
  title?: string
  description?: string
  importLabel?: string
  importBusyLabel?: string
  isImporting: boolean
  onImport: () => void
  coordinatesText: string
  onCoordinatesTextChange: (value: string) => void
  sampleStep: number
  onSampleStepChange: (value: number) => void
  statusMessage?: string | null
  coordinateRows?: number
  headerActions?: ReactNode
  footer?: ReactNode
}

const SAMPLE_STEPS = [4, 6, 8, 10, 12] as const

export function TerrainImportPanel({
  title = 'Terreno Real (4 Coordenadas)',
  description = 'Genera una malla de alturas gradual desde elevacion geoespacial y la adapta al canvas del visor.',
  importLabel = 'Importar malla real',
  importBusyLabel = 'Importando...',
  isImporting,
  onImport,
  coordinatesText,
  onCoordinatesTextChange,
  sampleStep,
  onSampleStepChange,
  statusMessage,
  coordinateRows = 4,
  headerActions,
  footer,
}: TerrainImportPanelProps) {
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
        <p className="text-[11px] text-muted-foreground">Detalle de malla (metros por muestra)</p>
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

      {statusMessage && (
        <p className="text-[11px] font-medium text-primary">{statusMessage}</p>
      )}

      {footer}
    </div>
  )
}