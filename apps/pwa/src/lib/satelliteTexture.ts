/**
 * satelliteTexture — Fetch & compose Esri World Imagery tiles into a single
 * canvas that can be used as a Three.js texture for terrain draping.
 *
 * The canvas covers the exact bounding-box and is cropped from the
 * composite of all tiles that intersect the area.
 */

export interface SatelliteTextureResult {
  /** Canvas with the satellite imagery, ready for THREE.CanvasTexture */
  canvas: HTMLCanvasElement
  /** Pixel width of the output canvas */
  width: number
  /** Pixel height of the output canvas */
  height: number
}

const ESRI_WORLD_IMAGERY_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'
const DEFAULT_SAT_ZOOM = 17 // ~1.2 m/px → excellent detail for plant-scale areas

function lonLatToTile(lon: number, lat: number, zoom: number) {
  const n = 2 ** zoom
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

function tileBounds(tx: number, ty: number, zoom: number) {
  const n = 2 ** zoom
  const west = (tx / n) * 360 - 180
  const east = ((tx + 1) / n) * 360 - 180
  const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI
  const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 1)) / n))) * 180) / Math.PI
  return { north, south, east, west }
}

/**
 * Fetch satellite imagery tiles covering the given bbox and return
 * a cropped HTMLCanvasElement matching the exact bounds.
 */
export async function fetchSatelliteTexture(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  zoom: number = DEFAULT_SAT_ZOOM,
  onProgress?: (msg: string, pct: number) => void,
): Promise<SatelliteTextureResult> {
  const minTile = lonLatToTile(minLon, maxLat, zoom) // NW
  const maxTile = lonLatToTile(maxLon, minLat, zoom) // SE

  const tilesX = maxTile.x - minTile.x + 1
  const tilesY = maxTile.y - minTile.y + 1

  const canvas = document.createElement('canvas')
  canvas.width = tilesX * 256
  canvas.height = tilesY * 256
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2d context not available')

  let fetched = 0
  const total = tilesX * tilesY

  for (let ty = minTile.y; ty <= maxTile.y; ty++) {
    for (let tx = minTile.x; tx <= maxTile.x; tx++) {
      const url = `${ESRI_WORLD_IMAGERY_URL}/${zoom}/${ty}/${tx}`
      try {
        const resp = await fetch(url)
        if (resp.ok) {
          const blob = await resp.blob()
          const bmp = await createImageBitmap(blob)
          ctx.drawImage(bmp, (tx - minTile.x) * 256, (ty - minTile.y) * 256, 256, 256)
          bmp.close()
        }
      } catch {
        /* skip individual tile failures */
      }
      fetched++
      onProgress?.(`Satélite: ${fetched}/${total} tiles`, Math.round((fetched / total) * 100))
    }
  }

  // Crop to exact bbox
  const nwBounds = tileBounds(minTile.x, minTile.y, zoom)
  const fullWest = nwBounds.west
  const fullNorth = nwBounds.north
  const fullEast = tileBounds(maxTile.x + 1, minTile.y, zoom).west
  const fullSouth = tileBounds(minTile.x, maxTile.y + 1, zoom).north

  const uMin = (minLon - fullWest) / (fullEast - fullWest)
  const uMax = (maxLon - fullWest) / (fullEast - fullWest)
  const vMin = (fullNorth - maxLat) / (fullNorth - fullSouth)
  const vMax = (fullNorth - minLat) / (fullNorth - fullSouth)

  const cropX = Math.floor(uMin * canvas.width)
  const cropY = Math.floor(vMin * canvas.height)
  const cropW = Math.max(1, Math.floor((uMax - uMin) * canvas.width))
  const cropH = Math.max(1, Math.floor((vMax - vMin) * canvas.height))

  const cropped = document.createElement('canvas')
  cropped.width = cropW
  cropped.height = cropH
  const croppedCtx = cropped.getContext('2d')
  if (croppedCtx) croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

  return { canvas: cropped, width: cropW, height: cropH }
}
