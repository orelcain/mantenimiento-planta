/**
 * TerrainMesh — Dedicated component for terrain heightfield rendering.
 *
 * Encapsulates:
 *  - Building the elevation map, metrics, and data bounds
 *  - Solid geometry (topographic vertex colors + UV for satellite draping)
 *  - Contour lines (marching-squares at 5m or 10m intervals)
 *  - Material selection (vertex-color fallback vs satellite canvas texture)
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import type { TerrainTile, IsometricMapConfig } from '@/types/isometricMap'
import {
  buildElevationMap,
  computeTerrainMetrics,
  computeTerrainDataBounds,
  buildTerrainSolidGeometry,
  buildTerrainContourGeometry,
} from '@/lib/terrainGeometry'

export interface TerrainMeshProps {
  terrain: TerrainTile[]
  config: IsometricMapConfig
  satelliteTextureCanvas?: HTMLCanvasElement | null
}

/** Re-export computed terrain helpers for consumers that need raw data (e.g. OSMOverlay3D). */
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

export function TerrainMesh({ terrain, config, satelliteTextureCanvas }: TerrainMeshProps) {
  const { elevationMap, metrics, dataBounds } = useTerrainData(terrain)

  const solidGeometry = useMemo(() => {
    if (terrain.length === 0 || !dataBounds) return null
    return buildTerrainSolidGeometry(elevationMap, dataBounds, metrics, config)
  }, [terrain, elevationMap, dataBounds, metrics, config])

  const contourGeometry = useMemo(() => {
    if (terrain.length === 0 || !dataBounds) return null
    return buildTerrainContourGeometry(elevationMap, dataBounds, metrics)
  }, [terrain, elevationMap, dataBounds, metrics])

  if (!solidGeometry) return null

  return (
    <group>
      {/* Vertex-color fallback (no satellite) */}
      {!satelliteTextureCanvas && (
        <mesh geometry={solidGeometry} castShadow receiveShadow renderOrder={2}>
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            metalness={0}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      {/* Satellite draping */}
      {satelliteTextureCanvas && (
        <mesh geometry={solidGeometry} castShadow receiveShadow renderOrder={2}>
          <meshStandardMaterial
            roughness={0.88}
            metalness={0.02}
            side={THREE.FrontSide}
            envMapIntensity={0.3}
          >
            <canvasTexture
              attach="map"
              image={satelliteTextureCanvas}
              colorSpace={THREE.SRGBColorSpace}
              wrapS={THREE.ClampToEdgeWrapping}
              wrapT={THREE.ClampToEdgeWrapping}
              magFilter={THREE.LinearFilter}
              minFilter={THREE.LinearMipmapLinearFilter}
            />
          </meshStandardMaterial>
        </mesh>
      )}

      {/* Contour lines — only without satellite (hillshade suffices otherwise) */}
      {contourGeometry && !satelliteTextureCanvas && (
        <lineSegments geometry={contourGeometry} renderOrder={3}>
          <lineBasicMaterial
            color="#9fd8ff"
            transparent
            opacity={0.4}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </group>
  )
}
