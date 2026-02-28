import type { MapArea, MapNode } from '@/types/isometricMap'

export function getAreaAtPosition(areas: MapArea[], x: number, z: number, floor: number): MapArea | null {
  const floorAreas = areas.filter((area) => (area.floor ?? 0) === floor)

  const tileMatch = floorAreas.find((area) =>
    area.tiles?.some((tile) => tile.x === x && tile.z === z)
  )
  if (tileMatch) return tileMatch

  const boundsMatch = floorAreas.find((area) => {
    if (area.tiles?.length) return false
    const minX = area.position.x - area.size.width / 2
    const maxX = area.position.x + area.size.width / 2
    const minZ = area.position.z - area.size.depth / 2
    const maxZ = area.position.z + area.size.depth / 2
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ
  })

  return boundsMatch ?? null
}

export function normalizeNodeForArea(node: MapNode, area: MapArea | null, floor: number): MapNode {
  return {
    ...node,
    floor: area?.floor ?? floor,
    position: area
      ? { x: area.position.x, y: node.position.y ?? 0, z: area.position.z }
      : { ...node.position },
    linkedAreaId: area?.id,
  }
}
