import { Badge, Button, Card, CardContent, Input } from '@/components/ui'
import type { IsometricMap } from '@/types/isometricMap'
import { TerrainImportPanel } from './TerrainImportPanel'
import type { TerrainImportPreview, TerrainImportProgress } from '@/lib/terrainImport'

interface TerrainBaseWorkspaceProps {
  currentMapId: string
  savedMaps: IsometricMap[]
  isLoadingMaps: boolean
  onLoadMap: (mapId: string) => void
  mapName: string
  onMapNameChange: (value: string) => void
  mapDescription: string
  onMapDescriptionChange: (value: string) => void
  mapWidth: number
  mapDepth: number
  terrainTileCount: number
  currentFloorLabel: string
  mapStatusText: string
  realTerrainImportMessage?: string | null
  onCreateBlankMap: () => void
  onFitMapComplete: () => void
  onImportRealTerrain: () => void
  onSave: () => void
  onSaveAsNew: () => void
  isImportingRealTerrain: boolean
  isSaving: boolean
  terrainImportCoordinatesText: string
  onTerrainImportCoordinatesTextChange: (value: string) => void
  terrainImportSampleStep: number
  onTerrainImportSampleStepChange: (value: number) => void
  terrainImportPreview?: TerrainImportPreview | null
  terrainImportPreviewError?: string | null
  terrainImportProgress?: TerrainImportProgress | null
}

export function TerrainBaseWorkspace({
  currentMapId,
  savedMaps,
  isLoadingMaps,
  onLoadMap,
  mapName,
  onMapNameChange,
  mapDescription,
  onMapDescriptionChange,
  mapWidth,
  mapDepth,
  terrainTileCount,
  currentFloorLabel,
  mapStatusText,
  realTerrainImportMessage,
  onCreateBlankMap,
  onFitMapComplete,
  onImportRealTerrain,
  onSave,
  onSaveAsNew,
  isImportingRealTerrain,
  isSaving,
  terrainImportCoordinatesText,
  onTerrainImportCoordinatesTextChange,
  terrainImportSampleStep,
  onTerrainImportSampleStepChange,
  terrainImportPreview,
  terrainImportPreviewError,
  terrainImportProgress,
}: TerrainBaseWorkspaceProps) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Base del mapa</h2>
            <p className="text-xs text-muted-foreground">
              En esta etapa el objetivo es simple: importar bien el terreno desde 4 coordenadas, revisar escala general y guardar una base limpia.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onCreateBlankMap}>Nuevo lienzo</Button>
            <Button variant="outline" size="sm" onClick={onFitMapComplete}>Ver mapa completo</Button>
            <Button variant="default" size="sm" onClick={onImportRealTerrain} disabled={isImportingRealTerrain}>
              {isImportingRealTerrain ? 'Importando terreno...' : 'Importar terreno real'}
            </Button>
            <Button variant="secondary" size="sm" onClick={onSave} disabled={isSaving}>
              {isSaving ? 'Guardando...' : 'Guardar base'}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Mapa actual</div>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={currentMapId}
                  onChange={(e) => onLoadMap(e.target.value)}
                  disabled={isLoadingMaps || savedMaps.length === 0}
                >
                  <option value="">{isLoadingMaps ? 'Cargando mapas...' : savedMaps.length === 0 ? 'Sin mapas guardados' : 'Selecciona mapa'}</option>
                  {savedMaps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {map.nombre} · v{map.version}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Nombre de la base</div>
                <Input
                  value={mapName}
                  onChange={(e) => onMapNameChange(e.target.value)}
                  placeholder="Ej: Base topografica Chonchi"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Descripcion</div>
              <Input
                value={mapDescription}
                onChange={(e) => onMapDescriptionChange(e.target.value)}
                placeholder="Ej: Terreno importado desde rectangulo operacional"
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
              <div className="font-semibold text-foreground">Resumen actual</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Lienzo: {mapWidth} m × {mapDepth} m</Badge>
                <Badge variant="outline">Terreno: {terrainTileCount} celdas</Badge>
                <Badge variant="outline">Piso visible: {currentFloorLabel}</Badge>
                <Badge variant="outline">Grilla: 1 m × 1 m</Badge>
                {currentMapId && <Badge variant="outline">ID: {currentMapId}</Badge>}
              </div>
              <div className="text-muted-foreground">{mapStatusText}</div>
              <div className="text-muted-foreground">{realTerrainImportMessage ?? 'Aun no has importado una malla real en esta sesion.'}</div>
            </div>
          </div>

          <TerrainImportPanel
            title="Coordenadas del terreno"
            description="Usa exactamente 4 lineas en formato lat, lon. El visor autoexpande la base para que el rectangulo entre completo."
            importLabel="Aplicar importacion"
            importBusyLabel="Importando..."
            isImporting={isImportingRealTerrain}
            onImport={onImportRealTerrain}
            coordinatesText={terrainImportCoordinatesText}
            onCoordinatesTextChange={onTerrainImportCoordinatesTextChange}
            sampleStep={terrainImportSampleStep}
            onSampleStepChange={onTerrainImportSampleStepChange}
            statusMessage={realTerrainImportMessage}
            preview={terrainImportPreview}
            previewError={terrainImportPreviewError}
            progress={terrainImportProgress}
            coordinateRows={6}
            footer={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={onSaveAsNew} disabled={isSaving}>
                  Guardar como nueva base
                </Button>
              </div>
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}