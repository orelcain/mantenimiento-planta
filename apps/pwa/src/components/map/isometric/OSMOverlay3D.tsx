/**
 * OSMOverlay3D — Render OSM features as 3D geometry on top of the terrain.
 *
 * - Buildings: Extruded polygons with roofs
 * - Roads: Flat ribbon lines following terrain elevation
 * - Water: Semi-transparent animated polygons at water level
 * - Trees: Instanced cone+cylinder shapes in forest/scrub areas
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { TerrainGeoBounds } from '@/lib/terrainImport'
import type { OSMFeatures } from '@/lib/osmBuildings'
import type { LandcoverFeature } from '@/lib/terrainComposite'

interface OSMOverlay3DProps {
  features: OSMFeatures
  geoBounds: TerrainGeoBounds
  terrainElevationMap: Map<string, number>
  /** Minimum terrain elevation for sea-level reference */
  minElevation: number
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Convert geo coordinates to grid (x, z) using the terrain bounds */
function geoToGrid(
  lat: number,
  lon: number,
  b: TerrainGeoBounds,
): { x: number; z: number } {
  const gridW = b.gridMaxX - b.gridMinX
  const gridD = b.gridMaxZ - b.gridMinZ
  const u = (lon - b.minLon) / (b.maxLon - b.minLon)
  const v = (b.maxLat - lat) / (b.maxLat - b.minLat)
  return {
    x: b.gridMinX + u * gridW,
    z: b.gridMinZ + v * gridD,
  }
}

/** Look up terrain elevation at a grid position (bilinear from 4 neighbors) */
function getElevationAt(
  gx: number,
  gz: number,
  elevMap: Map<string, number>,
  fallback: number,
): number {
  const ix = Math.floor(gx)
  const iz = Math.floor(gz)
  const e00 = elevMap.get(`${ix},${iz}`) ?? fallback
  const e10 = elevMap.get(`${ix + 1},${iz}`) ?? fallback
  const e01 = elevMap.get(`${ix},${iz + 1}`) ?? fallback
  const e11 = elevMap.get(`${ix + 1},${iz + 1}`) ?? fallback
  const fx = gx - ix
  const fz = gz - iz
  return (
    e00 * (1 - fx) * (1 - fz) +
    e10 * fx * (1 - fz) +
    e01 * (1 - fx) * fz +
    e11 * fx * fz
  )
}

/* ------------------------------------------------------------------ */
/*  Buildings — extruded polygons                                      */
/* ------------------------------------------------------------------ */

function useBuildingsGeometry(
  buildings: OSMFeatures['buildings'],
  b: TerrainGeoBounds,
  elevMap: Map<string, number>,
  minElev: number,
) {
  return useMemo(() => {
    if (buildings.length === 0) return null

    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []

    const wallColor = new THREE.Color('#c8bfa8')
    const roofColor = new THREE.Color('#8b4513')

    for (const bldg of buildings) {
      const pts = bldg.coords.map((c) => {
        const g = geoToGrid(c.lat, c.lon, b)
        const elev = getElevationAt(g.x, g.z, elevMap, minElev)
        return { x: g.x, z: g.z, y: elev }
      })
      if (pts.length < 3) continue

      const h = bldg.height

      // Walls — quad strip around the perimeter
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i]
        const p1 = pts[i + 1]
        if (!p0 || !p1) continue
        const baseY0 = p0.y
        const baseY1 = p1.y
        const topY0 = p0.y + h
        const topY1 = p1.y + h

        const vi = positions.length / 3
        positions.push(p0.x, baseY0, p0.z)
        positions.push(p1.x, baseY1, p1.z)
        positions.push(p1.x, topY1, p1.z)
        positions.push(p0.x, topY0, p0.z)

        // Slight shade variation based on face direction
        const shade = 0.85 + Math.abs(p1.x - p0.x) / (Math.abs(p1.x - p0.x) + Math.abs(p1.z - p0.z) + 0.01) * 0.15
        const wc = wallColor.clone().multiplyScalar(shade)
        colors.push(wc.r, wc.g, wc.b)
        colors.push(wc.r, wc.g, wc.b)
        colors.push(wc.r, wc.g, wc.b)
        colors.push(wc.r, wc.g, wc.b)

        indices.push(vi, vi + 1, vi + 2)
        indices.push(vi, vi + 2, vi + 3)
      }

      // Flat roof — fan triangulation from centroid
      if (pts.length >= 3) {
        let cx = 0, cz = 0, cy = 0
        for (const p of pts) { cx += p.x; cz += p.z; cy += p.y }
        cx /= pts.length; cz /= pts.length; cy /= pts.length
        const roofY = cy + h

        const ci = positions.length / 3
        positions.push(cx, roofY, cz)
        colors.push(roofColor.r, roofColor.g, roofColor.b)

        for (let i = 0; i < pts.length - 1; i++) {
          const p0 = pts[i]
          const p1 = pts[i + 1]
          if (!p0 || !p1) continue
          const vi = positions.length / 3
          positions.push(p0.x, p0.y + h, p0.z)
          positions.push(p1.x, p1.y + h, p1.z)
          colors.push(roofColor.r, roofColor.g, roofColor.b)
          colors.push(roofColor.r, roofColor.g, roofColor.b)
          indices.push(ci, vi, vi + 1)
        }
      }
    }

    if (positions.length === 0) return null

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [buildings, b, elevMap, minElev])
}

/* ------------------------------------------------------------------ */
/*  Roads — flat lines on terrain surface                              */
/* ------------------------------------------------------------------ */

function useRoadsGeometry(
  roads: OSMFeatures['roads'],
  b: TerrainGeoBounds,
  elevMap: Map<string, number>,
  minElev: number,
) {
  return useMemo(() => {
    if (roads.length === 0) return null

    const positions: number[] = []
    const colors: number[] = []

    const roadColors: Record<string, THREE.Color> = {
      primary: new THREE.Color('#4a4a4a'),
      secondary: new THREE.Color('#5a5a5a'),
      residential: new THREE.Color('#6a6a5a'),
      track: new THREE.Color('#8a7a60'),
    }
    const defaultRoadColor = new THREE.Color('#555555')

    for (const road of roads) {
      const color = roadColors[road.type] ?? defaultRoadColor

      for (let i = 0; i < road.coords.length - 1; i++) {
        const c0 = road.coords[i]
        const c1 = road.coords[i + 1]
        if (!c0 || !c1) continue

        const g0 = geoToGrid(c0.lat, c0.lon, b)
        const g1 = geoToGrid(c1.lat, c1.lon, b)
        const e0 = getElevationAt(g0.x, g0.z, elevMap, minElev) + 0.15
        const e1 = getElevationAt(g1.x, g1.z, elevMap, minElev) + 0.15

        // Generate ribbon: offset perpendicular to segment direction
        const dx = g1.x - g0.x
        const dz = g1.z - g0.z
        const len = Math.sqrt(dx * dx + dz * dz)
        if (len < 0.01) continue
        const hw = road.width * 0.5
        const nx = (-dz / len) * hw
        const nz = (dx / len) * hw

        // Quad: left0, right0, right1, left1
        positions.push(g0.x + nx, e0, g0.z + nz)
        positions.push(g0.x - nx, e0, g0.z - nz)
        positions.push(g1.x - nx, e1, g1.z - nz)
        positions.push(g1.x + nx, e1, g1.z + nz)

        for (let v = 0; v < 4; v++) {
          colors.push(color.r, color.g, color.b)
        }
      }
    }

    if (positions.length === 0) return null

    // Build index for quads
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    const idx: number[] = []
    for (let q = 0; q < positions.length / 12; q++) {
      const vi = q * 4
      idx.push(vi, vi + 1, vi + 2)
      idx.push(vi, vi + 2, vi + 3)
    }
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }, [roads, b, elevMap, minElev])
}

/* ------------------------------------------------------------------ */
/*  Water — translucent polygons                                       */
/* ------------------------------------------------------------------ */

function useWaterGeometry(
  water: OSMFeatures['water'],
  b: TerrainGeoBounds,
  elevMap: Map<string, number>,
  minElev: number,
) {
  return useMemo(() => {
    if (water.length === 0) return null

    const positions: number[] = []
    const indices: number[] = []

    for (const w of water) {
      const pts = w.coords.map((c) => {
        const g = geoToGrid(c.lat, c.lon, b)
        const elev = getElevationAt(g.x, g.z, elevMap, minElev)
        return { x: g.x, z: g.z, y: elev + 0.1 }
      })
      if (pts.length < 3) continue

      // Fan triangulation from first vertex
      const baseIdx = positions.length / 3
      for (const p of pts) {
        positions.push(p.x, p.y, p.z)
      }
      for (let i = 1; i < pts.length - 1; i++) {
        indices.push(baseIdx, baseIdx + i, baseIdx + i + 1)
      }
    }

    if (positions.length === 0) return null
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [water, b, elevMap, minElev])
}

/* ------------------------------------------------------------------ */
/*  Trees — instanced cones in forest/scrub zones                     */
/* ------------------------------------------------------------------ */

function useTreeInstances(
  landcover: LandcoverFeature[],
  b: TerrainGeoBounds,
  elevMap: Map<string, number>,
  minElev: number,
) {
  return useMemo(() => {
    const forestAreas = landcover.filter((f) => f.type === 'forest' || f.type === 'scrub')
    if (forestAreas.length === 0) return null

    const treePositions: { x: number; y: number; z: number; scale: number }[] = []

    for (const area of forestAreas) {
      const gridPts = area.coords.map((c) => geoToGrid(c.lat, c.lon, b))
      if (gridPts.length < 3) continue

      // Bounding box of this polygon
      let gMinX = Infinity, gMaxX = -Infinity
      let gMinZ = Infinity, gMaxZ = -Infinity
      for (const p of gridPts) {
        if (p.x < gMinX) gMinX = p.x
        if (p.x > gMaxX) gMaxX = p.x
        if (p.z < gMinZ) gMinZ = p.z
        if (p.z > gMaxZ) gMaxZ = p.z
      }

      // Scatter trees in a grid pattern with jitter, ~every 4m
      const step = 4
      for (let tx = gMinX; tx <= gMaxX; tx += step) {
        for (let tz = gMinZ; tz <= gMaxZ; tz += step) {
          // Jitter
          const jx = tx + (Math.sin(tx * 13.7 + tz * 7.3) * 0.5 + 0.5) * step * 0.6
          const jz = tz + (Math.cos(tx * 11.3 + tz * 5.7) * 0.5 + 0.5) * step * 0.6

          // Point-in-polygon (ray casting)
          if (!pointInPolygon(jx, jz, gridPts)) continue

          const elev = getElevationAt(jx, jz, elevMap, minElev)
          const scale = 0.6 + (Math.sin(jx * 17.1 + jz * 23.7) * 0.5 + 0.5) * 0.8
          treePositions.push({ x: jx, y: elev, z: jz, scale })
        }
      }
    }

    return treePositions.length > 0 ? treePositions : null
  }, [landcover, b, elevMap, minElev])
}

/** Simple ray-casting point-in-polygon */
function pointInPolygon(
  px: number,
  pz: number,
  polygon: { x: number; z: number }[],
): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]
    const pj = polygon[j]
    if (!pi || !pj) continue
    if (
      pi.z > pz !== pj.z > pz &&
      px < ((pj.x - pi.x) * (pz - pi.z)) / (pj.z - pi.z) + pi.x
    ) {
      inside = !inside
    }
  }
  return inside
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function OSMOverlay3D({
  features,
  geoBounds,
  terrainElevationMap,
  minElevation,
}: OSMOverlay3DProps) {
  const buildingsGeo = useBuildingsGeometry(features.buildings, geoBounds, terrainElevationMap, minElevation)
  const roadsGeo = useRoadsGeometry(features.roads, geoBounds, terrainElevationMap, minElevation)
  const waterGeo = useWaterGeometry(features.water, geoBounds, terrainElevationMap, minElevation)
  const treeInstances = useTreeInstances(features.landcover, geoBounds, terrainElevationMap, minElevation)

  const waterRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (waterRef.current) {
      // Gentle wave animation
      waterRef.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.06
    }
  })

  return (
    <group>
      {/* Buildings */}
      {buildingsGeo && (
        <mesh geometry={buildingsGeo} castShadow receiveShadow renderOrder={5}>
          <meshStandardMaterial
            vertexColors
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Roads */}
      {roadsGeo && (
        <mesh geometry={roadsGeo} receiveShadow renderOrder={5}>
          <meshStandardMaterial
            vertexColors
            roughness={0.95}
            metalness={0}
          />
        </mesh>
      )}

      {/* Water bodies */}
      {waterGeo && (
        <mesh ref={waterRef} geometry={waterGeo} renderOrder={6}>
          <meshStandardMaterial
            color="#2a7ab5"
            transparent
            opacity={0.6}
            roughness={0.1}
            metalness={0.4}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Trees — instanced cones */}
      {treeInstances && treeInstances.length > 0 && (
        <TreeField trees={treeInstances} />
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ */
/*  TreeField — InstancedMesh for performance                          */
/* ------------------------------------------------------------------ */

function TreeField({ trees }: { trees: { x: number; y: number; z: number; scale: number }[] }) {
  const { trunkGeo, canopyGeo } = useMemo(() => ({
    trunkGeo: new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5),
    canopyGeo: new THREE.ConeGeometry(1.2, 2.8, 6),
  }), [])

  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const canopyRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    if (!trunkRef.current || !canopyRef.current) return

    const mat = new THREE.Matrix4()
    const pos = new THREE.Vector3()
    const quat = new THREE.Quaternion()
    const sc = new THREE.Vector3()

    for (let i = 0; i < trees.length; i++) {
      const t = trees[i]
      if (!t) continue

      // Trunk
      pos.set(t.x, t.y + 0.6 * t.scale, t.z)
      sc.set(t.scale, t.scale, t.scale)
      mat.compose(pos, quat, sc)
      trunkRef.current.setMatrixAt(i, mat)

      // Canopy
      pos.set(t.x, t.y + 2.2 * t.scale, t.z)
      mat.compose(pos, quat, sc)
      canopyRef.current.setMatrixAt(i, mat)
    }
    trunkRef.current.instanceMatrix.needsUpdate = true
    canopyRef.current.instanceMatrix.needsUpdate = true
  }, [trees])

  const count = trees.length

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, count]} castShadow renderOrder={5}>
        <meshStandardMaterial color="#5c3a1e" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={canopyRef} args={[canopyGeo, undefined, count]} castShadow renderOrder={5}>
        <meshStandardMaterial color="#2d5a1e" roughness={0.85} />
      </instancedMesh>
    </group>
  )
}
