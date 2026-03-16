/**
 * MapStatsPanel — Panel de estadísticas del mapa
 *
 * Muestra métricas resumidas: equipos, áreas, elevación, cobertura, dimensiones.
 */

import type { MapNode, MapArea, TerrainTile, IsometricMapConfig, MapConnector } from '@/types/isometricMap'
import { Badge } from '@/components/ui/badge'
import { BarChart3, Layers, Mountain, Move3D, Link2 } from 'lucide-react'

interface MapStatsPanelProps {
  config: IsometricMapConfig
  nodes: MapNode[]
  areas: MapArea[]
  connectors: MapConnector[]
  terrain: TerrainTile[]
}

export function MapStatsPanel({ config, nodes, areas, connectors, terrain }: MapStatsPanelProps) {
  let minElev = Infinity
  let maxElev = -Infinity
  for (const tile of terrain) {
    if (tile.elevation < minElev) minElev = tile.elevation
    if (tile.elevation > maxElev) maxElev = tile.elevation
  }
  if (!Number.isFinite(minElev)) { minElev = 0; maxElev = 0 }

  const relief = Math.round((maxElev - minElev) * 10) / 10
  const gridArea = config.width * config.depth
  const coverage = terrain.length > 0 ? Math.round((terrain.length / gridArea) * 100) : 0

  const typeCount = new Map<string, number>()
  for (const node of nodes) {
    typeCount.set(node.type, (typeCount.get(node.type) ?? 0) + 1)
  }
  const topTypes = [...typeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="bg-card/95 backdrop-blur rounded-lg border shadow-lg p-3 text-xs space-y-2 min-w-[200px]">
      <div className="font-semibold text-sm flex items-center gap-1.5">
        <BarChart3 className="h-3.5 w-3.5 text-primary" />
        Estadísticas del mapa
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
        <div className="flex items-center gap-1">
          <Move3D className="h-3 w-3" />
          Grilla
        </div>
        <div className="text-foreground font-medium">{config.width}×{config.depth}m</div>

        <div className="flex items-center gap-1">
          <Mountain className="h-3 w-3" />
          Elevación
        </div>
        <div className="text-foreground font-medium">
          {Math.round(minElev * 10) / 10}m — {Math.round(maxElev * 10) / 10}m
        </div>

        <div>Relieve</div>
        <div className="text-foreground font-medium">{relief}m</div>

        <div>Cobertura terreno</div>
        <div className="text-foreground font-medium">{terrain.length.toLocaleString()} celdas ({coverage}%)</div>

        <div className="flex items-center gap-1">
          <Layers className="h-3 w-3" />
          Áreas
        </div>
        <div className="text-foreground font-medium">{areas.length}</div>

        <div className="flex items-center gap-1">
          <Link2 className="h-3 w-3" />
          Conectores
        </div>
        <div className="text-foreground font-medium">{connectors.length}</div>
      </div>

      {nodes.length > 0 && (
        <div className="border-t pt-1.5 mt-1.5">
          <div className="text-muted-foreground mb-1">Equipos ({nodes.length})</div>
          <div className="flex flex-wrap gap-1">
            {topTypes.map(([type, count]) => (
              <Badge key={type} variant="outline" className="text-[10px]">
                {type} ×{count}
              </Badge>
            ))}
            {typeCount.size > 4 && (
              <Badge variant="outline" className="text-[10px]">
                +{typeCount.size - 4} tipos
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
