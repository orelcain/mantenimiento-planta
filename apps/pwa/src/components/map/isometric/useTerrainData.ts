import { useMemo } from 'react'
import type { TerrainTile } from '@/types/isometricMap'
import {
  buildElevationMap,
  computeTerrainMetrics,
  computeTerrainDataBounds,
} from '@/lib/terrainGeometry'

export function useTerrainData(terrain: TerrainTile[] | undefined) {
  const elevationMap = useMemo(
    () => buildElevationMap(terrain ?? []),
    [terrain],
  )

  const metrics = useMemo(
    () => computeTerrainMetrics(terrain ?? []),
    [terrain],
  )

  const dataBounds = useMemo(
    () => computeTerrainDataBounds(terrain ?? []),
    [terrain],
  )

  return { elevationMap, metrics, dataBounds }
}
