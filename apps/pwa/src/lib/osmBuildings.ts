/**
 * osmBuildings — Fetch buildings, roads, water features and natural
 * landcover from OpenStreetMap via the Overpass API and return
 * structured data for 3D rendering and terrain compositing.
 */

import type { LandcoverFeature } from './terrainComposite'

export interface OSMBuilding {
  coords: { lat: number; lon: number }[]
  /** Estimated height in meters */
  height: number
  tags: Record<string, string>
}

export interface OSMRoad {
  coords: { lat: number; lon: number }[]
  /** Visual width in meters */
  width: number
  type: string
}

export interface OSMWater {
  coords: { lat: number; lon: number }[]
  tags: Record<string, string>
}

export interface OSMFeatures {
  buildings: OSMBuilding[]
  roads: OSMRoad[]
  water: OSMWater[]
  landcover: LandcoverFeature[]
}

const OVERPASS_API = 'https://overpass-api.de/api/interpreter'
const OVERPASS_TIMEOUT = 30

/**
 * Fetch OSM features (buildings, roads, water) inside the given bbox.
 * Returns an empty result on failure so callers can degrade gracefully.
 */
export async function fetchOSMFeatures(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
): Promise<OSMFeatures> {
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`
  const query = `
    [out:json][timeout:${OVERPASS_TIMEOUT}];
    (
      way["building"](${bbox});
      way["highway"](${bbox});
      way["waterway"](${bbox});
      way["natural"="water"](${bbox});
      way["natural"="wood"](${bbox});
      way["natural"="scrub"](${bbox});
      way["natural"="wetland"](${bbox});
      way["natural"="sand"](${bbox});
      way["natural"="bare_rock"](${bbox});
      way["natural"="grassland"](${bbox});
      way["natural"="coastline"](${bbox});
      way["landuse"="forest"](${bbox});
      way["landuse"="farmland"](${bbox});
      way["landuse"="grass"](${bbox});
      way["landuse"="meadow"](${bbox});
      way["landuse"="orchard"](${bbox});
      relation["natural"="water"](${bbox});
    );
    out body;
    >;
    out skel qt;
  `

  try {
    const resp = await fetch(OVERPASS_API, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    if (!resp.ok) throw new Error(`Overpass ${resp.status}`)
    const data = await resp.json()
    return processElements(data.elements ?? [])
  } catch {
    return { buildings: [], roads: [], water: [], landcover: [] }
  }
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
  members?: { type: string; ref: number; role: string }[]
}

function processElements(elements: OverpassElement[]): OSMFeatures {
  const nodes = new Map<number, { lat: number; lon: number }>()
  const buildings: OSMBuilding[] = []
  const roads: OSMRoad[] = []
  const water: OSMWater[] = []
  const landcover: LandcoverFeature[] = []

  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon })
    }
  }

  const resolveCoords = (nodeIds: number[]) =>
    nodeIds
      .map((nid) => nodes.get(nid))
      .filter((c): c is { lat: number; lon: number } => c != null)

  for (const el of elements) {
    if (el.type === 'relation') {
      // Relations for large water bodies / multipolygons
      const tags = el.tags ?? {}
      if (tags.natural === 'water' && el.members) {
        for (const m of el.members) {
          if (m.type === 'way' && m.role === 'outer' && m.ref) {
            const wayEl = elements.find((e) => e.type === 'way' && e.id === m.ref)
            if (wayEl?.nodes) {
              const coords = resolveCoords(wayEl.nodes)
              if (coords.length >= 3) {
                water.push({ coords, tags })
                landcover.push({ coords, type: 'water' })
              }
            }
          }
        }
      }
      continue
    }

    if (el.type !== 'way' || !el.nodes) continue
    const coords = resolveCoords(el.nodes)
    if (coords.length < 3) continue

    const tags = el.tags ?? {}

    if (tags.building) {
      const rawHeight = parseFloat(tags['building:height'] || tags.height || '0')
      const levels = parseFloat(tags['building:levels'] || '1')
      const height = rawHeight > 0 ? rawHeight : Math.max(3, levels * 3.2)
      buildings.push({ coords, height, tags })
    } else if (tags.highway) {
      const width =
        tags.highway === 'primary' ? 6 :
        tags.highway === 'secondary' ? 5 :
        tags.highway === 'residential' ? 4 : 3
      roads.push({ coords, width, type: tags.highway })
    } else if (tags.waterway || tags.natural === 'water') {
      water.push({ coords, tags })
      landcover.push({ coords, type: 'water' })
    } else {
      // Landcover classification
      const lcType = classifyLandcover(tags)
      if (lcType) {
        landcover.push({ coords, type: lcType })
      }
    }
  }

  return { buildings, roads, water, landcover }
}

function classifyLandcover(
  tags: Record<string, string>,
): LandcoverFeature['type'] | null {
  const nat = tags.natural
  const lu = tags.landuse

  if (nat === 'wood' || lu === 'forest' || lu === 'orchard') return 'forest'
  if (nat === 'scrub') return 'scrub'
  if (nat === 'wetland') return 'wetland'
  if (nat === 'sand' || nat === 'beach') return 'sand'
  if (nat === 'bare_rock' || nat === 'scree') return 'rock'
  if (nat === 'grassland' || lu === 'grass' || lu === 'meadow') return 'grass'
  if (lu === 'farmland') return 'farmland'

  return null
}
