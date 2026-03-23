/**
 * EditorPreviews — Ghost overlays for terrain brush, node placement, bulldozer, and area paint.
 *
 * Pure render component — no internal state, just visualizes editor preview props.
 */

import { SEA_LEVEL_ELEVATION } from '@/types/isometricMap'

interface BrushPreview {
  center: { x: number; z: number }
  size: 1 | 3 | 5 | 7 | 9
  mode: 'raise' | 'lower' | 'flatten' | 'smooth' | 'sample'
}

interface PlacementPreview {
  position: { x: number; z: number }
  floor: number
  size: { width: number; height: number; depth: number }
  rotation: number
  valid: boolean
  snapGuides?: Array<{ axis: 'x' | 'z'; from: { x: number; z: number }; to: { x: number; z: number } }>
}

export interface EditorPreviewsProps {
  terrainBrushPreview?: BrushPreview | null
  placementPreview?: PlacementPreview | null
  bulldozerPreview?: { x: number; z: number } | null
  paintTiles?: { tiles: Set<string>; color: string; opacity: number }
  currentFloor: number
  terrainElevationMap: Map<string, number>
}

const BRUSH_COLORS: Record<BrushPreview['mode'], string> = {
  raise: '#22c55e',
  lower: '#ef4444',
  flatten: '#3b82f6',
  smooth: '#a855f7',
  sample: '#f59e0b',
}

export function EditorPreviews({
  terrainBrushPreview,
  placementPreview,
  bulldozerPreview,
  paintTiles,
  currentFloor,
  terrainElevationMap,
}: EditorPreviewsProps) {
  return (
    <>
      {/* Terrain brush preview */}
      {terrainBrushPreview && (
        <group>
          {(() => {
            const cells: Array<{ x: number; z: number; opacity: number }> = []
            const radius = Math.floor(terrainBrushPreview.size / 2)
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dz = -radius; dz <= radius; dz++) {
                const distance = Math.sqrt(dx * dx + dz * dz)
                if (distance > radius + 0.001) continue
                const normalizedDistance = radius === 0 ? 0 : distance / (radius + 0.35)
                const falloff = radius === 0 ? 1 : Math.pow(Math.max(0, 1 - normalizedDistance), 1.4)
                if (falloff <= 0) continue
                cells.push({
                  x: terrainBrushPreview.center.x + dx,
                  z: terrainBrushPreview.center.z + dz,
                  opacity: 0.15 + 0.35 * falloff,
                })
              }
            }
            return cells.map((cell) => (
              <mesh
                key={`preview-${cell.x},${cell.z}`}
                rotation-x={-Math.PI / 2}
                position={[
                  cell.x + 0.5,
                  (terrainElevationMap.get(`${cell.x},${cell.z}`) ?? SEA_LEVEL_ELEVATION) + 0.08,
                  cell.z + 0.5,
                ]}
              >
                <planeGeometry args={[0.94, 0.94]} />
                <meshBasicMaterial
                  color={BRUSH_COLORS[terrainBrushPreview.mode]}
                  transparent
                  opacity={cell.opacity}
                  depthWrite={false}
                />
              </mesh>
            ))
          })()}
        </group>
      )}

      {/* Node placement ghost */}
      {placementPreview && (
        <group>
          <mesh
            position={[
              placementPreview.position.x,
              placementPreview.floor + placementPreview.size.height / 2,
              placementPreview.position.z,
            ]}
            rotation-y={(placementPreview.rotation * Math.PI) / 180}
          >
            <boxGeometry args={[placementPreview.size.width, placementPreview.size.height, placementPreview.size.depth]} />
            <meshStandardMaterial color={placementPreview.valid ? '#22c55e' : '#ef4444'} transparent opacity={0.35} depthWrite={false} />
          </mesh>
          <mesh
            rotation-x={-Math.PI / 2}
            position={[placementPreview.position.x, placementPreview.floor + 0.05, placementPreview.position.z]}
          >
            <planeGeometry args={[placementPreview.size.width, placementPreview.size.depth]} />
            <meshBasicMaterial color={placementPreview.valid ? '#22c55e' : '#ef4444'} transparent opacity={0.25} depthWrite={false} />
          </mesh>
          {placementPreview.snapGuides?.map((guide, index) => {
            const cx = (guide.from.x + guide.to.x) / 2
            const cz = (guide.from.z + guide.to.z) / 2
            const w = Math.abs(guide.to.x - guide.from.x)
            const d = Math.abs(guide.to.z - guide.from.z)
            return (
              <mesh key={`snap-guide-${index}`} rotation-x={-Math.PI / 2} position={[cx, placementPreview.floor + 0.08, cz]}>
                <planeGeometry args={[guide.axis === 'z' ? Math.max(w, 0.08) : 0.08, guide.axis === 'x' ? Math.max(d, 0.08) : 0.08]} />
                <meshBasicMaterial color={placementPreview.valid ? '#22c55e' : '#ef4444'} transparent opacity={0.6} depthWrite={false} />
              </mesh>
            )
          })}
        </group>
      )}

      {/* Bulldozer preview */}
      {bulldozerPreview && (
        <mesh rotation-x={-Math.PI / 2} position={[bulldozerPreview.x, currentFloor + 0.06, bulldozerPreview.z]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      )}

      {/* Area paint tiles */}
      {paintTiles && paintTiles.tiles.size > 0 && (
        <group>
          {Array.from(paintTiles.tiles).map((key) => {
            const parts = key.split(',')
            const px = Number(parts[0])
            const pz = Number(parts[1])
            return (
              <mesh key={key} rotation-x={-Math.PI / 2} position={[px + 0.5, 0.02, pz + 0.5]}>
                <planeGeometry args={[0.95, 0.95]} />
                <meshBasicMaterial color={paintTiles.color} transparent opacity={Math.min(paintTiles.opacity + 0.2, 0.8)} depthWrite={false} />
              </mesh>
            )
          })}
        </group>
      )}
    </>
  )
}
