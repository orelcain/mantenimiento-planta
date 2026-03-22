/**
 * osmBuildings — Fetch buildings, roads, and water features from
 * OpenStreetMap via the Overpass API and return structured data
 * that can be extruded as 3D objects on top of the terrain.
 */

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
    return { buildings: [], roads: [], water: [] }
  }
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

function processElements(elements: OverpassElement[]): OSMFeatures {
  const nodes = new Map<number, { lat: number; lon: number }>()
  const buildings: OSMBuilding[] = []
  const roads: OSMRoad[] = []
  const water: OSMWater[] = []

  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon })
    }
  }

  for (const el of elements) {
    if (el.type !== 'way' || !el.nodes) continue
    const coords = el.nodes
      .map((nid) => nodes.get(nid))
      .filter((c): c is { lat: number; lon: number } => c != null)
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
    }
  }

  return { buildings, roads, water }
}
