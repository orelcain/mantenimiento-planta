/**
 * terrainGeometry.ts — Pure functions for terrain 3D geometry construction.
 *
 * Extracted from IsometricScene to enable unit testing and reduce monolith size.
 * All functions are stateless: (terrain tiles, config) → BufferGeometry.
 */

import * as THREE from 'three'
import type { TerrainTile, IsometricMapConfig } from '@/types/isometricMap'
import { SEA_LEVEL_ELEVATION } from '@/types/isometricMap'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TerrainMetrics {
  minElevation: number
  maxElevation: number
  elevationRange: number
  baseElevation: number
}

export interface TerrainDataBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/* ------------------------------------------------------------------ */
/*  Topographic color ramp — land-only palette                         */
/* ------------------------------------------------------------------ */

const TOPOGRAPHIC_COLOR_STOPS = [
  { stop: 0, color: new THREE.Color('#a8c090') },    // lowland green
  { stop: 0.15, color: new THREE.Color('#96bc73') },  // light green
  { stop: 0.35, color: new THREE.Color('#739763') },  // forest green
  { stop: 0.55, color: new THREE.Color('#8a9e6a') },  // olive
  { stop: 0.75, color: new THREE.Color('#b18d68') },  // tan/rock
  { stop: 0.9, color: new THREE.Color('#c4b08a') },   // light rock
  { stop: 1, color: new THREE.Color('#ddd6c5') },     // summit gray
]

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function getTopographicColor(normalizedElevation: number): THREE.Color {
  const n = clamp01(normalizedElevation)
  for (let i = 0; i < TOPOGRAPHIC_COLOR_STOPS.length - 1; i++) {
    const cur = TOPOGRAPHIC_COLOR_STOPS[i]!
    const nxt = TOPOGRAPHIC_COLOR_STOPS[i + 1]!
    if (n <= nxt.stop) {
      const mix = clamp01((n - cur.stop) / Math.max(0.0001, nxt.stop - cur.stop))
      return cur.color.clone().lerp(nxt.color, mix)
    }
  }
  const last = TOPOGRAPHIC_COLOR_STOPS[TOPOGRAPHIC_COLOR_STOPS.length - 1]
  return (last?.color ?? new THREE.Color('#c8c3b5')).clone()
}

/* ------------------------------------------------------------------ */
/*  Contour intersection helper                                        */
/* ------------------------------------------------------------------ */

export function getContourIntersection(
  start: [number, number, number],
  end: [number, number, number],
  contourLevel: number,
): [number, number, number] | null {
  const delta = end[1] - start[1]
  if (Math.abs(delta) < 0.0001) return null
  const t = (contourLevel - start[1]) / delta
  if (t < 0 || t > 1) return null
  return [
    start[0] + t * (end[0] - start[0]),
    contourLevel,
    start[2] + t * (end[2] - start[2]),
  ]
}

/* ------------------------------------------------------------------ */
/*  Metrics & bounds                                                   */
/* ------------------------------------------------------------------ */

const MIN_TERRAIN = -50 // matches MIN_TERRAIN_ELEVATION

export function computeTerrainMetrics(tiles: TerrainTile[]): TerrainMetrics {
  if (tiles.length === 0) {
    return { minElevation: 0, maxElevation: 0, elevationRange: 1, baseElevation: MIN_TERRAIN }
  }
  let min = Infinity, max = -Infinity
  for (const t of tiles) {
    if (t.elevation < min) min = t.elevation
    if (t.elevation > max) max = t.elevation
  }
  const range = Math.max(1, max - min)
  const sideDepth = Math.max(3, Math.min(6, Math.round(range * 0.08)))
  return {
    minElevation: min,
    maxElevation: max,
    elevationRange: range,
    baseElevation: Math.max(MIN_TERRAIN, min - sideDepth),
  }
}

export function computeTerrainDataBounds(tiles: TerrainTile[]): TerrainDataBounds | null {
  if (tiles.length === 0) return null
  let bMinX = Infinity, bMaxX = -Infinity, bMinZ = Infinity, bMaxZ = -Infinity
  for (const t of tiles) {
    if (t.x < bMinX) bMinX = t.x
    if (t.x > bMaxX) bMaxX = t.x
    if (t.z < bMinZ) bMinZ = t.z
    if (t.z > bMaxZ) bMaxZ = t.z
  }
  return { minX: bMinX, maxX: bMaxX + 1, minZ: bMinZ, maxZ: bMaxZ + 1 }
}

export function buildElevationMap(tiles: TerrainTile[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const t of tiles) map.set(`${t.x},${t.z}`, t.elevation)
  return map
}

/* ------------------------------------------------------------------ */
/*  Solid geometry builder                                             */
/* ------------------------------------------------------------------ */

export function buildTerrainSolidGeometry(
  elevationMap: Map<string, number>,
  dataBounds: TerrainDataBounds,
  metrics: TerrainMetrics,
  config: Pick<IsometricMapConfig, 'width' | 'depth'>,
): THREE.BufferGeometry {
  const { minX, maxX, minZ, maxZ } = dataBounds
  const widthCells = maxX - minX
  const depthCells = maxZ - minZ
  const baseY = metrics.baseElevation

  const getCellElev = (x: number, z: number) => elevationMap.get(`${x},${z}`) ?? SEA_LEVEL_ELEVATION
  const getTopElev = (vx: number, vz: number) =>
    (getCellElev(vx - 1, vz - 1) + getCellElev(vx, vz - 1) + getCellElev(vx - 1, vz) + getCellElev(vx, vz)) / 4

  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  const cliffDark = new THREE.Color('#3a2a1a')
  const cliffLight = new THREE.Color('#8b7355')
  const bottomColor = new THREE.Color('#2a1f14')
  const color = new THREE.Color()

  // Pre-compute top height grid (vertex-averaged)
  const topGrid: number[][] = []
  for (let iz = 0; iz <= depthCells; iz++) {
    const row: number[] = []
    for (let ix = 0; ix <= widthCells; ix++) row.push(getTopElev(minX + ix, minZ + iz))
    topGrid.push(row)
  }
  const getTop = (ix: number, iz: number) => topGrid[iz]?.[ix] ?? SEA_LEVEL_ELEVATION

  const setColor = (elev: number) => {
    const n = (elev - metrics.minElevation) / metrics.elevationRange
    color.copy(getTopographicColor(n))
    color.offsetHSL(0, 0.02, 0.08)
  }

  const pushVert = (x: number, y: number, z: number, c: THREE.Color, u = 0, v = 0) => {
    positions.push(x, y + 0.02, z)
    colors.push(c.r, c.g, c.b)
    uvs.push(u, v)
    return positions.length / 3 - 1
  }

  const pushQuad = (
    a: [number, number, number], b: [number, number, number],
    c: [number, number, number], d: [number, number, number],
    cA: THREE.Color, cB: THREE.Color, cC: THREE.Color, cD: THREE.Color,
    uvA?: [number, number], uvB?: [number, number], uvC?: [number, number], uvD?: [number, number],
  ) => {
    const ia = pushVert(a[0], a[1], a[2], cA, uvA?.[0] ?? 0, uvA?.[1] ?? 0)
    const ib = pushVert(b[0], b[1], b[2], cB, uvB?.[0] ?? 0, uvB?.[1] ?? 0)
    const ic = pushVert(c[0], c[1], c[2], cC, uvC?.[0] ?? 0, uvC?.[1] ?? 0)
    const id = pushVert(d[0], d[1], d[2], cD, uvD?.[0] ?? 0, uvD?.[1] ?? 0)
    indices.push(ia, ib, ic, ia, ic, id)
  }

  // UV mapping relative to full config grid (satellite texture covers entire geo bounds)
  const cfgMinX = Math.floor(-config.width / 2)
  const cfgMaxX = Math.ceil(config.width / 2)
  const cfgMinZ = Math.floor(-config.depth / 2)
  const cfgMaxZ = Math.ceil(config.depth / 2)
  const fullW = cfgMaxX - cfgMinX
  const fullD = cfgMaxZ - cfgMinZ

  // ── Top surface ──
  for (let iz = 0; iz < depthCells; iz++) {
    const z = minZ + iz
    for (let ix = 0; ix < widthCells; ix++) {
      const x = minX + ix
      const y00 = getTop(ix, iz)
      const y10 = getTop(ix + 1, iz)
      const y11 = getTop(ix + 1, iz + 1)
      const y01 = getTop(ix, iz + 1)

      setColor(y00); const c00 = color.clone()
      setColor(y10); const c10 = color.clone()
      setColor(y11); const c11 = color.clone()
      setColor(y01); const c01 = color.clone()

      const u0 = (x - cfgMinX) / fullW
      const u1 = (x + 1 - cfgMinX) / fullW
      const v0 = 1 - (z - cfgMinZ) / fullD
      const v1 = 1 - (z + 1 - cfgMinZ) / fullD

      pushQuad(
        [x, y00, z], [x + 1, y10, z], [x + 1, y11, z + 1], [x, y01, z + 1],
        c00, c10, c11, c01,
        [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      )
    }
  }

  // ── Bottom face ──
  pushQuad(
    [minX, baseY, minZ], [minX, baseY, maxZ], [maxX, baseY, maxZ], [maxX, baseY, minZ],
    bottomColor, bottomColor, bottomColor, bottomColor,
  )

  // ── Boundary walls (geological strata gradient) ──
  const wallQuad = (
    ix: number, getY1: () => number, getY2: () => number,
    wallZ: number, flipWinding: boolean,
  ) => {
    const x1 = minX + ix
    const x2 = x1 + 1
    const y1 = getY1()
    const y2 = getY2()
    const mix = clamp01((Math.max(y1, y2) - metrics.minElevation) / metrics.elevationRange)
    const wTop = cliffDark.clone().lerp(cliffLight, mix * 0.8 + 0.2)
    const wBot = cliffDark.clone()
    if (flipWinding) {
      pushQuad([x1, y1, wallZ], [x2, y2, wallZ], [x2, baseY, wallZ], [x1, baseY, wallZ], wTop, wTop, wBot, wBot)
    } else {
      pushQuad([x1, y1, wallZ], [x1, baseY, wallZ], [x2, baseY, wallZ], [x2, y2, wallZ], wTop, wBot, wBot, wTop)
    }
  }

  for (let ix = 0; ix < widthCells; ix++) {
    // North wall
    wallQuad(ix, () => getTop(ix, 0), () => getTop(ix + 1, 0), minZ, false)
    // South wall
    wallQuad(ix, () => getTop(ix, depthCells), () => getTop(ix + 1, depthCells), maxZ, true)
  }

  for (let iz = 0; iz < depthCells; iz++) {
    const z1 = minZ + iz
    const z2 = z1 + 1

    // West wall
    const yw1 = getTop(0, iz), yw2 = getTop(0, iz + 1)
    const mixW = clamp01((Math.max(yw1, yw2) - metrics.minElevation) / metrics.elevationRange)
    const wTopW = cliffDark.clone().lerp(cliffLight, mixW * 0.8 + 0.2)
    const wBotW = cliffDark.clone()
    pushQuad(
      [minX, yw1, z1], [minX, yw2, z2], [minX, baseY, z2], [minX, baseY, z1],
      wTopW, wTopW, wBotW, wBotW,
    )

    // East wall
    const ye1 = getTop(widthCells, iz), ye2 = getTop(widthCells, iz + 1)
    const mixE = clamp01((Math.max(ye1, ye2) - metrics.minElevation) / metrics.elevationRange)
    const wTopE = cliffDark.clone().lerp(cliffLight, mixE * 0.8 + 0.2)
    const wBotE = cliffDark.clone()
    pushQuad(
      [maxX, ye1, z1], [maxX, baseY, z1], [maxX, baseY, z2], [maxX, ye2, z2],
      wTopE, wBotE, wBotE, wTopE,
    )
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/* ------------------------------------------------------------------ */
/*  Contour lines builder                                              */
/* ------------------------------------------------------------------ */

export function buildTerrainContourGeometry(
  elevationMap: Map<string, number>,
  dataBounds: TerrainDataBounds,
  metrics: TerrainMetrics,
): THREE.BufferGeometry | null {
  const { minX, maxX, minZ, maxZ } = dataBounds
  const widthCells = maxX - minX
  const depthCells = maxZ - minZ
  if (widthCells <= 0 || depthCells <= 0) return null

  const getCellElev = (x: number, z: number) => elevationMap.get(`${x},${z}`) ?? SEA_LEVEL_ELEVATION
  const getTopElev = (vx: number, vz: number) =>
    (getCellElev(vx - 1, vz - 1) + getCellElev(vx, vz - 1) + getCellElev(vx - 1, vz) + getCellElev(vx, vz)) / 4

  const interval = metrics.elevationRange >= 80 ? 10 : 5
  const startLvl = Math.ceil(metrics.minElevation / interval) * interval
  const endLvl = Math.floor(metrics.maxElevation / interval) * interval
  const positions: number[] = []

  for (let iz = 0; iz < depthCells; iz++) {
    const z = minZ + iz
    for (let ix = 0; ix < widthCells; ix++) {
      const x = minX + ix
      const y00 = getTopElev(x, z)
      const y10 = getTopElev(x + 1, z)
      const y11 = getTopElev(x + 1, z + 1)
      const y01 = getTopElev(x, z + 1)

      for (let level = startLvl; level <= endLvl; level += interval) {
        const pts = [
          getContourIntersection([x, y00, z], [x + 1, y10, z], level),
          getContourIntersection([x + 1, y10, z], [x + 1, y11, z + 1], level),
          getContourIntersection([x + 1, y11, z + 1], [x, y01, z + 1], level),
          getContourIntersection([x, y01, z + 1], [x, y00, z], level),
        ].filter((p): p is [number, number, number] => p !== null)

        if (pts.length < 2) continue
        for (let i = 0; i <= pts.length - 2; i += 2) {
          const s = pts[i], e = pts[i + 1]
          if (!s || !e) continue
          positions.push(s[0], s[1], s[2], e[0], e[1], e[2])
        }
      }
    }
  }

  if (positions.length === 0) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}
