/**
 * Minimap — Vista aérea en miniatura del mapa isométrico
 *
 * Muestra el terreno como un mapa de calor 2D y dibuja un rectángulo
 * de viewport que indica la región visible actual.
 */

import { useRef, useEffect, useMemo } from 'react'
import type { TerrainTile, IsometricMapConfig, IsometricViewerState } from '@/types/isometricMap'
import { MIN_TERRAIN_ELEVATION, MAX_TERRAIN_ELEVATION, SEA_LEVEL_ELEVATION } from '@/types/isometricMap'

interface MinimapProps {
  config: IsometricMapConfig
  terrain: TerrainTile[]
  viewerState: IsometricViewerState
  /** Aspect ratio of the main canvas viewport */
  canvasAspect: number
}

const MINIMAP_SIZE = 160

function elevationToColor(elevation: number): string {
  const range = MAX_TERRAIN_ELEVATION - MIN_TERRAIN_ELEVATION
  const normalized = (elevation - MIN_TERRAIN_ELEVATION) / range
  const hue = 220 * (1 - normalized)
  const lightness = 35 + normalized * 30
  return `hsl(${hue}, 75%, ${lightness}%)`
}

export function Minimap({ config, terrain, viewerState, canvasAspect }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const terrainMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const tile of terrain) {
      map.set(`${tile.x},${tile.z}`, tile.elevation)
    }
    return map
  }, [terrain])

  // Draw terrain heatmap
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    // Background
    ctx.fillStyle = '#0d1117'
    ctx.fillRect(0, 0, w, h)

    if (terrain.length === 0) return

    const halfW = config.width / 2
    const halfD = config.depth / 2

    // Draw terrain cells with appropriate pixel granularity
    const cellW = w / config.width
    const cellH = h / config.depth
    const step = Math.max(1, Math.floor(1 / Math.max(cellW, cellH)))

    for (let z = Math.floor(-halfD); z < Math.ceil(halfD); z += step) {
      for (let x = Math.floor(-halfW); x < Math.ceil(halfW); x += step) {
        const elevation = terrainMap.get(`${x},${z}`) ?? SEA_LEVEL_ELEVATION
        if (elevation === SEA_LEVEL_ELEVATION && !terrainMap.has(`${x},${z}`)) continue

        const px = ((x + halfW) / config.width) * w
        const py = ((z + halfD) / config.depth) * h
        const pw = Math.max(1, cellW * step)
        const ph = Math.max(1, cellH * step)

        ctx.fillStyle = elevationToColor(elevation)
        ctx.fillRect(px, py, pw, ph)
      }
    }
  }, [terrain, terrainMap, config.width, config.depth])

  // Draw viewport rectangle overlay
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // We need to redraw viewport indicator on top
    // For simplicity, we use a separate draw pass that overlays
    const w = canvas.width
    const h = canvas.height
    const halfW = config.width / 2
    const halfD = config.depth / 2

    // Viewport dimensions in world units
    const viewHalfW = viewerState.zoom * canvasAspect
    const viewHalfH = viewerState.zoom

    const cx = ((viewerState.panOffset.x + halfW) / config.width) * w
    const cy = ((viewerState.panOffset.z + halfD) / config.depth) * h
    const vw = (viewHalfW * 2 / config.width) * w
    const vh = (viewHalfH * 2 / config.depth) * h

    // Redraw the viewport indicator (clear just the border area)
    ctx.strokeStyle = '#4a9eff'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 2])
    ctx.strokeRect(cx - vw / 2, cy - vh / 2, vw, vh)
    ctx.setLineDash([])

    // Center crosshair
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(cx - 4, cy)
    ctx.lineTo(cx + 4, cy)
    ctx.moveTo(cx, cy - 4)
    ctx.lineTo(cx, cy + 4)
    ctx.stroke()
  }, [config.width, config.depth, viewerState.zoom, viewerState.panOffset, canvasAspect, terrain])

  return (
    <div className="bg-card/90 backdrop-blur rounded-lg border shadow-lg overflow-hidden" title="Minimap — vista aérea">
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={Math.round(MINIMAP_SIZE * (config.depth / config.width))}
        className="block"
        style={{ width: MINIMAP_SIZE, height: Math.round(MINIMAP_SIZE * (config.depth / config.width)) }}
      />
    </div>
  )
}
