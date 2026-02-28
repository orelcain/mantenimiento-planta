/**
 * ShapeEditorDialog — Editor de formas 3D para equipos del mapa
 * 
 * Permite componer formas custom a partir de primitivas básicas
 * (caja, cilindro, esfera, cono, torus) con posición, tamaño,
 * rotación y color editables.
 * 
 * Cada cuadro de la grilla = 1m × 1m
 * Las cotas se muestran en metros.
 */

import { useState, useCallback, useMemo, useRef, type ChangeEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { 
  X, Trash2, Copy, Box, Circle, Triangle, 
  RotateCw, Palette, ChevronDown, ChevronUp, Save, 
  Undo2, Layers, Upload, Download
} from 'lucide-react'
import { Button, Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { MapNode, ShapePrimitive, ShapePrimitiveType } from '@/types/isometricMap'
import { EQUIPMENT_TYPE_COLORS } from '@/types/isometricMap'

interface ShapeEditorDialogProps {
  isOpen: boolean
  node: MapNode
  onSave: (nodeId: string, customShape: ShapePrimitive[]) => void
  onClear: (nodeId: string) => void
  onClose: () => void
}

const PRIMITIVE_PRESETS: { type: ShapePrimitiveType; label: string; icon: typeof Box; description: string }[] = [
  { type: 'box', label: 'Caja', icon: Box, description: 'Paralelepípedo con ancho, alto y profundidad' },
  { type: 'cylinder', label: 'Cilindro', icon: Circle, description: 'Cilindro con radio y altura' },
  { type: 'sphere', label: 'Esfera', icon: Circle, description: 'Esfera con radio' },
  { type: 'cone', label: 'Cono', icon: Triangle, description: 'Cono con radio base y altura' },
  { type: 'torus', label: 'Torus', icon: RotateCw, description: 'Anillo con radio mayor y tubo' },
]

const DEFAULT_COLORS = [
  '#5b7ea6', '#b46565', '#5f8f72', '#b08e5a', '#7b6ea8',
  '#a56f8e', '#5d95a1', '#b37b57', '#7b7f87', '#b6b4af',
  '#4e5968', '#7f776c', '#6d8fb8', '#8b72a8', '#5f9b92',
]

type SculptMode = 'primitives' | 'voxel'
type FaceDirection = 'top' | 'bottom' | 'left' | 'right' | 'front' | 'back'

const MATTE_MATERIAL = { metalness: 0.05, roughness: 0.95 } as const

function voxelKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`
}

function parseVoxelKey(key: string): { x: number; y: number; z: number } {
  const parts = key.split(',')
  const parsedX = Number(parts[0] ?? 0)
  const parsedY = Number(parts[1] ?? 0)
  const parsedZ = Number(parts[2] ?? 0)

  return {
    x: Number.isFinite(parsedX) ? parsedX : 0,
    y: Number.isFinite(parsedY) ? parsedY : 0,
    z: Number.isFinite(parsedZ) ? parsedZ : 0,
  }
}

function getFaceNormal(face: FaceDirection) {
  switch (face) {
    case 'top': return { dx: 0, dy: 1, dz: 0 }
    case 'bottom': return { dx: 0, dy: -1, dz: 0 }
    case 'left': return { dx: -1, dy: 0, dz: 0 }
    case 'right': return { dx: 1, dy: 0, dz: 0 }
    case 'front': return { dx: 0, dy: 0, dz: 1 }
    case 'back': return { dx: 0, dy: 0, dz: -1 }
    default: return { dx: 0, dy: 1, dz: 0 }
  }
}

function faceDirectionFromNormal(normal: THREE.Vector3): FaceDirection {
  const absX = Math.abs(normal.x)
  const absY = Math.abs(normal.y)
  const absZ = Math.abs(normal.z)

  if (absY >= absX && absY >= absZ) return normal.y >= 0 ? 'top' : 'bottom'
  if (absX >= absY && absX >= absZ) return normal.x >= 0 ? 'right' : 'left'
  return normal.z >= 0 ? 'front' : 'back'
}

function getVoxelBounds(cells: Set<string>) {
  if (cells.size === 0) return null
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  for (const key of cells) {
    const { x, y, z } = parseVoxelKey(key)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }

  return { minX, minY, minZ, maxX, maxY, maxZ }
}

function voxelBelongsToFace(x: number, y: number, z: number, bounds: ReturnType<typeof getVoxelBounds>, face: FaceDirection) {
  if (!bounds) return false
  switch (face) {
    case 'top': return y === bounds.maxY
    case 'bottom': return y === bounds.minY
    case 'left': return x === bounds.minX
    case 'right': return x === bounds.maxX
    case 'front': return z === bounds.maxZ
    case 'back': return z === bounds.minZ
    default: return false
  }
}

function projectFaceCell(
  x: number,
  y: number,
  z: number,
  bounds: NonNullable<ReturnType<typeof getVoxelBounds>>,
  face: FaceDirection,
  subdivisions: number,
) {
  const width = Math.max(1, bounds.maxX - bounds.minX + 1)
  const height = Math.max(1, bounds.maxY - bounds.minY + 1)
  const depth = Math.max(1, bounds.maxZ - bounds.minZ + 1)

  let axisU = 0
  let axisV = 0
  let lenU = 1
  let lenV = 1

  switch (face) {
    case 'top':
    case 'bottom':
      axisU = x - bounds.minX
      axisV = z - bounds.minZ
      lenU = width
      lenV = depth
      break
    case 'left':
    case 'right':
      axisU = z - bounds.minZ
      axisV = y - bounds.minY
      lenU = depth
      lenV = height
      break
    case 'front':
    case 'back':
      axisU = x - bounds.minX
      axisV = y - bounds.minY
      lenU = width
      lenV = height
      break
  }

  const u = Math.min(subdivisions - 1, Math.floor((axisU * subdivisions) / lenU))
  const v = Math.min(subdivisions - 1, Math.floor((axisV * subdivisions) / lenV))
  return { u, v }
}

function buildDefaultVoxelsFromNode(node: MapNode, gridSize: number) {
  const cells = new Set<string>()
  const width = Math.max(1, Math.round(node.size.width))
  const depth = Math.max(1, Math.round(node.size.depth))
  const height = Math.max(1, Math.round(node.size.height))
  const startX = Math.max(0, Math.floor((gridSize - width) / 2))
  const startZ = Math.max(0, Math.floor((gridSize - depth) / 2))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < depth; z++) {
        cells.add(voxelKey(startX + x, y, startZ + z))
      }
    }
  }

  // Solo aplicar redondeo si no elimina más del 40% de los voxels
  const roundedKeys = computeRoundedCornerRemoval(cells, cells)
  if (roundedKeys.length === 0 || roundedKeys.length > cells.size * 0.4) return cells

  const rounded = new Set(cells)
  for (const key of roundedKeys) rounded.delete(key)
  return rounded
}

function clampVoxelValue(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function worldToVoxelCoordinate(value: number, min: number, max: number, gridSize: number) {
  if (max - min <= 0) return 0
  const normalized = (value - min) / (max - min)
  return clampVoxelValue(Math.floor(normalized * (gridSize - 1)), 0, gridSize - 1)
}

function voxelizeSceneBounds(scene: THREE.Object3D, gridSize: number) {
  const sceneBounds = new THREE.Box3().setFromObject(scene)
  if (sceneBounds.isEmpty()) return new Set<string>()

  const sceneMin = sceneBounds.min
  const sceneMax = sceneBounds.max
  const voxels = new Set<string>()

  scene.updateWorldMatrix(true, true)
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return

    const meshBounds = new THREE.Box3().setFromObject(mesh)
    if (meshBounds.isEmpty()) return

    const x0 = worldToVoxelCoordinate(meshBounds.min.x, sceneMin.x, sceneMax.x, gridSize)
    const x1 = worldToVoxelCoordinate(meshBounds.max.x, sceneMin.x, sceneMax.x, gridSize)
    const z0 = worldToVoxelCoordinate(meshBounds.min.z, sceneMin.z, sceneMax.z, gridSize)
    const z1 = worldToVoxelCoordinate(meshBounds.max.z, sceneMin.z, sceneMax.z, gridSize)
    const y0 = clampVoxelValue(Math.floor((meshBounds.min.y - sceneMin.y) * 2), 0, 40)
    const y1 = clampVoxelValue(Math.ceil((meshBounds.max.y - sceneMin.y) * 2), 0, 40)

    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          voxels.add(voxelKey(x, y, z))
        }
      }
    }
  })

  return voxels
}

function computeRoundedCornerRemoval(allCells: Set<string>, scopeKeys: Set<string>) {
  const removals: string[] = []

  for (const key of scopeKeys) {
    if (!allCells.has(key)) continue

    const { x, y, z } = parseVoxelKey(key)
    const hasXP = allCells.has(voxelKey(x + 1, y, z))
    const hasXN = allCells.has(voxelKey(x - 1, y, z))
    const hasYP = allCells.has(voxelKey(x, y + 1, z))
    const hasYN = allCells.has(voxelKey(x, y - 1, z))
    const hasZP = allCells.has(voxelKey(x, y, z + 1))
    const hasZN = allCells.has(voxelKey(x, y, z - 1))

    const missingCount = Number(!hasXP) + Number(!hasXN) + Number(!hasYP) + Number(!hasYN) + Number(!hasZP) + Number(!hasZN)
    const isExterior = missingCount > 0
    const hasMissingOnEachAxis = (!hasXP || !hasXN) && (!hasYP || !hasYN) && (!hasZP || !hasZN)

    if (isExterior && hasMissingOnEachAxis && missingCount >= 3) {
      removals.push(key)
    }
  }

  return removals
}

function parseGltfFile(fileBuffer: ArrayBuffer): Promise<{ scene: THREE.Object3D }> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.parse(fileBuffer, '', (gltf) => resolve(gltf), (error) => reject(error))
  })
}

function createDefaultPrimitive(type: ShapePrimitiveType, color: string): ShapePrimitive {
  const id = `prim-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`
  const defaults: Record<ShapePrimitiveType, Partial<ShapePrimitive>> = {
    box: { size: { x: 1, y: 1, z: 1 } },
    cylinder: { size: { x: 0.5, y: 1, z: 0.5 } },
    sphere: { size: { x: 0.5, y: 0.5, z: 0.5 } },
    cone: { size: { x: 0.5, y: 1, z: 0.5 } },
    torus: { size: { x: 0.5, y: 0.1, z: 0.5 } },
  }
  return {
    id,
    type,
    position: { x: 0, y: 0.5, z: 0 },
    size: defaults[type].size!,
    rotation: { x: 0, y: 0, z: 0 },
    color,
    metalness: MATTE_MATERIAL.metalness,
    roughness: MATTE_MATERIAL.roughness,
  }
}

function getPrimitiveGeometry(prim: ShapePrimitive) {
  switch (prim.type) {
    case 'box':
      return <boxGeometry args={[prim.size.x, prim.size.y, prim.size.z]} />
    case 'cylinder':
      return <cylinderGeometry args={[prim.size.x, prim.size.x, prim.size.y, 24]} />
    case 'sphere':
      return <sphereGeometry args={[prim.size.x, 24, 24]} />
    case 'cone':
      return <coneGeometry args={[prim.size.x, prim.size.y, 24]} />
    case 'torus':
      return <torusGeometry args={[prim.size.x, prim.size.y, 16, 32]} />
    default:
      return <boxGeometry args={[prim.size.x, prim.size.y, prim.size.z]} />
  }
}

function primitiveLocalBounds(prim: ShapePrimitive): THREE.Box3 {
  switch (prim.type) {
    case 'box':
      return new THREE.Box3(
        new THREE.Vector3(-prim.size.x / 2, -prim.size.y / 2, -prim.size.z / 2),
        new THREE.Vector3(prim.size.x / 2, prim.size.y / 2, prim.size.z / 2)
      )
    case 'cylinder':
      return new THREE.Box3(
        new THREE.Vector3(-prim.size.x, -prim.size.y / 2, -prim.size.x),
        new THREE.Vector3(prim.size.x, prim.size.y / 2, prim.size.x)
      )
    case 'sphere':
      return new THREE.Box3(
        new THREE.Vector3(-prim.size.x, -prim.size.x, -prim.size.x),
        new THREE.Vector3(prim.size.x, prim.size.x, prim.size.x)
      )
    case 'cone':
      return new THREE.Box3(
        new THREE.Vector3(-prim.size.x, -prim.size.y / 2, -prim.size.x),
        new THREE.Vector3(prim.size.x, prim.size.y / 2, prim.size.x)
      )
    case 'torus': {
      const major = prim.size.x
      const tube = prim.size.y
      return new THREE.Box3(
        new THREE.Vector3(-(major + tube), -(major + tube), -tube),
        new THREE.Vector3(major + tube, major + tube, tube)
      )
    }
    default:
      return new THREE.Box3(
        new THREE.Vector3(-prim.size.x / 2, -prim.size.y / 2, -prim.size.z / 2),
        new THREE.Vector3(prim.size.x / 2, prim.size.y / 2, prim.size.z / 2)
      )
  }
}

function ShapePreviewScene({
  primitives,
  selectedPrimId,
  voxelSelection,
  onVoxelFacePick,
}: {
  primitives: ShapePrimitive[]
  selectedPrimId: string | null
  voxelSelection?: Set<string>
  onVoxelFacePick?: (voxelId: string, face: FaceDirection, append: boolean) => void
}) {
  const handleVoxelPointerDown = useCallback((primId: string, event: ThreeEvent<PointerEvent>) => {
    if (!onVoxelFacePick || !primId.startsWith('voxel-')) return
    event.stopPropagation()
    const rawId = primId.replace('voxel-', '')

    const worldNormal = event.face?.normal
      ? event.face.normal.clone().transformDirection(event.object.matrixWorld)
      : new THREE.Vector3(0, 1, 0)
    const face = faceDirectionFromNormal(worldNormal)
    onVoxelFacePick(rawId, face, event.nativeEvent.shiftKey)
  }, [onVoxelFacePick])

  return (
    <>
      <color attach="background" args={['#0b1220']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 12, 6]} intensity={0.9} />
      <directionalLight position={[-6, 8, -6]} intensity={0.35} />

      <gridHelper args={[30, 30, '#334155', '#1e293b']} position={[0, 0, 0]} />
      <axesHelper args={[3]} />

      {primitives.map((prim) => {
        const rotX = (prim.rotation.x * Math.PI) / 180
        const rotY = (prim.rotation.y * Math.PI) / 180
        const rotZ = (prim.rotation.z * Math.PI) / 180
        const isSelected = selectedPrimId === prim.id

        return (
          <group key={prim.id} position={[prim.position.x, prim.position.y, prim.position.z]} rotation={[rotX, rotY, rotZ]}>
            <mesh onPointerDown={(event) => handleVoxelPointerDown(prim.id, event)}>
              {getPrimitiveGeometry(prim)}
              <meshStandardMaterial color={prim.color} roughness={MATTE_MATERIAL.roughness} metalness={MATTE_MATERIAL.metalness} />
            </mesh>
            {isSelected && (
              <mesh>
                {getPrimitiveGeometry(prim)}
                <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.35} />
              </mesh>
            )}
            {voxelSelection?.has(prim.id.replace('voxel-', '')) && (
              <mesh>
                {getPrimitiveGeometry(prim)}
                <meshBasicMaterial color="#38bdf8" transparent opacity={0.22} />
              </mesh>
            )}
          </group>
        )
      })}

      <OrbitControls makeDefault enablePan enableZoom enableRotate />
    </>
  )
}

/** Slider para un valor numérico con label y cotas */
function DimensionInput({
  label,
  value,
  min = -10,
  max = 10,
  step = 0.1,
  unit = 'm',
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-4 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-primary"
      />
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-14 text-xs bg-muted border rounded px-1.5 py-0.5 text-center"
      />
      <span className="text-[10px] text-muted-foreground">{unit}</span>
    </div>
  )
}

export function ShapeEditorDialog({ isOpen, node, onSave, onClear, onClose }: ShapeEditorDialogProps) {
  const initialGridSize = Math.max(8, Math.min(20, Math.ceil(Math.max(node.size.width, node.size.depth)) + 4))
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // Initialize primitives from node's existing custom shape or generate from default type
  const [primitives, setPrimitives] = useState<ShapePrimitive[]>(() => {
    if (node.customShape && node.customShape.length > 0) {
      return node.customShape.map((prim) => ({
        ...prim,
        metalness: MATTE_MATERIAL.metalness,
        roughness: MATTE_MATERIAL.roughness,
      }))
    }
    // Generate a single box primitive matching the node's current size
    const baseColor = node.color || EQUIPMENT_TYPE_COLORS[node.type]
    return [{
      id: 'prim-initial',
      type: 'box',
      position: { x: 0, y: node.size.height / 2, z: 0 },
      size: { x: node.size.width, y: node.size.height, z: node.size.depth },
      rotation: { x: 0, y: 0, z: 0 },
      color: baseColor,
      metalness: MATTE_MATERIAL.metalness,
      roughness: MATTE_MATERIAL.roughness,
    }]
  })

  const [sculptMode, setSculptMode] = useState<SculptMode>('primitives')
  const [voxelGridSize] = useState(initialGridSize)
  const [activeFace, setActiveFace] = useState<FaceDirection>('top')
  const [faceSubdivision, setFaceSubdivision] = useState(8)
  const [voxelColor, setVoxelColor] = useState(node.color || EQUIPMENT_TYPE_COLORS[node.type])
  const [voxelCells, setVoxelCells] = useState<Set<string>>(() => buildDefaultVoxelsFromNode(node, initialGridSize))
  const [voxelSelection, setVoxelSelection] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const [selectedPrimId, setSelectedPrimId] = useState<string | null>(
    primitives.length > 0 ? primitives[0]?.id ?? null : null
  )
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    position: true, size: true, rotation: false, material: false,
  })

  const selectedPrim = useMemo(
    () => primitives.find((p) => p.id === selectedPrimId) ?? null,
    [primitives, selectedPrimId]
  )

  const voxelBounds = useMemo(() => getVoxelBounds(voxelCells), [voxelCells])

  const faceBuckets = useMemo(() => {
    const buckets = new Map<string, string[]>()
    if (!voxelBounds) return buckets

    for (const key of voxelCells) {
      const { x, y, z } = parseVoxelKey(key)
      if (!voxelBelongsToFace(x, y, z, voxelBounds, activeFace)) continue
      const { u, v } = projectFaceCell(x, y, z, voxelBounds, activeFace, faceSubdivision)
      const bucketKey = `${u},${v}`
      const bucket = buckets.get(bucketKey)
      if (bucket) bucket.push(key)
      else buckets.set(bucketKey, [key])
    }

    return buckets
  }, [voxelCells, voxelBounds, activeFace, faceSubdivision])

  const activeFaceVoxels = useMemo(() => {
    const out: string[] = []
    if (!voxelBounds) return out
    for (const key of voxelCells) {
      const { x, y, z } = parseVoxelKey(key)
      if (voxelBelongsToFace(x, y, z, voxelBounds, activeFace)) out.push(key)
    }
    return out
  }, [voxelCells, voxelBounds, activeFace])

  const voxelPrimitives = useMemo<ShapePrimitive[]>(() => {
    const out: ShapePrimitive[] = []
    for (const key of voxelCells) {
      const { x, y, z } = parseVoxelKey(key)
      out.push({
        id: `voxel-${key}`,
        type: 'box',
        position: {
          x: x - voxelGridSize / 2 + 0.5,
          y: y + 0.5,
          z: z - voxelGridSize / 2 + 0.5,
        },
        size: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        color: voxelColor,
        metalness: MATTE_MATERIAL.metalness,
        roughness: MATTE_MATERIAL.roughness,
      })
    }
    return out
  }, [voxelCells, voxelGridSize, voxelColor])

  const activePrimitives = sculptMode === 'voxel' ? voxelPrimitives : primitives

  const shapeMetrics = useMemo(() => {
    if (activePrimitives.length === 0) {
      return {
        width: 0,
        height: 0,
        depth: 0,
        footprint: 0,
        footprintTiles: 0,
        center: [0, 1.5, 0] as [number, number, number],
      }
    }

    const globalBox = new THREE.Box3()
    let initialized = false

    for (const prim of activePrimitives) {
      const localBounds = primitiveLocalBounds(prim)
      const rotX = (prim.rotation.x * Math.PI) / 180
      const rotY = (prim.rotation.y * Math.PI) / 180
      const rotZ = (prim.rotation.z * Math.PI) / 180
      const matrix = new THREE.Matrix4()
      matrix.compose(
        new THREE.Vector3(prim.position.x, prim.position.y, prim.position.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ)),
        new THREE.Vector3(1, 1, 1)
      )
      const worldBounds = localBounds.clone().applyMatrix4(matrix)
      if (!initialized) {
        globalBox.copy(worldBounds)
        initialized = true
      } else {
        globalBox.union(worldBounds)
      }
    }

    const size = new THREE.Vector3()
    const center = new THREE.Vector3()
    globalBox.getSize(size)
    globalBox.getCenter(center)

    const width = Number(size.x.toFixed(2))
    const height = Number(size.y.toFixed(2))
    const depth = Number(size.z.toFixed(2))
    const footprint = Number((width * depth).toFixed(2))

    return {
      width,
      height,
      depth,
      footprint,
      footprintTiles: Math.ceil(width) * Math.ceil(depth),
      center: [center.x, Math.max(center.y, 1.5), center.z] as [number, number, number],
    }
  }, [activePrimitives])

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const updatePrimitive = useCallback((primId: string, updates: Partial<ShapePrimitive>) => {
    setPrimitives((prev) => prev.map((p) => p.id === primId ? { ...p, ...updates } : p))
  }, [])

  const updatePrimVec3 = useCallback(
    (primId: string, field: 'position' | 'size' | 'rotation', axis: 'x' | 'y' | 'z', value: number) => {
      setPrimitives((prev) =>
        prev.map((p) =>
          p.id === primId
            ? { ...p, [field]: { ...p[field], [axis]: value } }
            : p
        )
      )
    },
    []
  )

  const addPrimitive = useCallback((type: ShapePrimitiveType) => {
    const baseColor = node.color || EQUIPMENT_TYPE_COLORS[node.type]
    const newPrim = createDefaultPrimitive(type, baseColor)
    setPrimitives((prev) => [...prev, newPrim])
    setSelectedPrimId(newPrim.id)
  }, [node])

  const deletePrimitive = useCallback((primId: string) => {
    setPrimitives((prev) => {
      const next = prev.filter((p) => p.id !== primId)
      if (selectedPrimId === primId) {
        setSelectedPrimId(next.length > 0 ? next[0]?.id ?? null : null)
      }
      return next
    })
  }, [selectedPrimId])

  const duplicatePrimitive = useCallback((primId: string) => {
    const source = primitives.find((p) => p.id === primId)
    if (!source) return
    const newPrim: ShapePrimitive = {
      ...source,
      id: `prim-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      position: { ...source.position, x: source.position.x + 0.5 },
    }
    setPrimitives((prev) => [...prev, newPrim])
    setSelectedPrimId(newPrim.id)
  }, [primitives])

  const extrudeVoxelKeys = useCallback((keys: string[], face: FaceDirection) => {
    if (keys.length === 0) return
    const { dx, dy, dz } = getFaceNormal(face)
    setVoxelCells((prev) => {
      const next = new Set(prev)
      const movedSelection: string[] = []

      for (const key of keys) {
        const { x, y, z } = parseVoxelKey(key)
        const nx = x + dx
        const ny = y + dy
        const nz = z + dz
        if (nx < 0 || nx >= voxelGridSize || nz < 0 || nz >= voxelGridSize || ny < 0 || ny > 40) continue
        const target = voxelKey(nx, ny, nz)
        next.add(target)
        movedSelection.push(target)
      }

      setVoxelSelection(new Set(movedSelection))
      return next
    })
  }, [voxelGridSize])

  const selectFullActiveFace = useCallback(() => {
    setVoxelSelection(new Set(activeFaceVoxels))
  }, [activeFaceVoxels])

  const extrudeActiveFace = useCallback(() => {
    const source = voxelSelection.size > 0
      ? Array.from(voxelSelection)
      : activeFaceVoxels
    extrudeVoxelKeys(source, activeFace)
  }, [voxelSelection, activeFaceVoxels, extrudeVoxelKeys, activeFace])

  const applyCornerRounding = useCallback(() => {
    setVoxelCells((prev) => {
      const scope = voxelSelection.size > 0
        ? new Set(Array.from(voxelSelection).filter((key) => prev.has(key)))
        : new Set(prev)

      const toRemove = computeRoundedCornerRemoval(prev, scope)
      if (toRemove.length === 0) {
        setImportMessage('No se detectaron esquinas para redondear en la selección actual')
        return prev
      }

      const next = new Set(prev)
      for (const key of toRemove) next.delete(key)
      setVoxelSelection(new Set())
      setImportMessage(`Redondeo aplicado: ${toRemove.length} voxel(es) suavizados`)
      return next
    })
  }, [voxelSelection])

  const handleVoxelFacePick = useCallback((rawVoxelId: string, face: FaceDirection, append: boolean) => {
    if (!voxelBounds || !voxelCells.has(rawVoxelId)) return
    const { x, y, z } = parseVoxelKey(rawVoxelId)
    const { u, v } = projectFaceCell(x, y, z, voxelBounds, face, faceSubdivision)
    const bucket = faceBuckets.get(`${u},${v}`) ?? [rawVoxelId]

    setActiveFace(face)
    setVoxelSelection((prev) => {
      const next = append ? new Set(prev) : new Set<string>()
      const allSelected = bucket.every((key) => next.has(key))

      if (allSelected && append) {
        for (const key of bucket) next.delete(key)
      } else {
        for (const key of bucket) next.add(key)
      }

      return next
    })
  }, [voxelBounds, voxelCells, faceSubdivision, faceBuckets])

  const resetVoxelFromNode = useCallback(() => {
    const rebuilt = buildDefaultVoxelsFromNode(node, voxelGridSize)
    setVoxelCells(rebuilt)
    setVoxelSelection(new Set())
  }, [node, voxelGridSize])

  const handleSave = useCallback(() => {
    onSave(node.id, activePrimitives)
    onClose()
  }, [node.id, activePrimitives, onSave, onClose])

  const exportCurrentShape = useCallback(() => {
    const payload = {
      nodeId: node.id,
      mode: sculptMode,
      primitives,
      voxelColor,
      voxelGridSize,
      voxelCells: Array.from(voxelCells),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${node.label.replace(/\s+/g, '_').toLowerCase()}-shape.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [node.id, node.label, sculptMode, primitives, voxelColor, voxelGridSize, voxelCells])

  const importShapeFromFile = useCallback(async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    setImportMessage(null)
    setIsImporting(true)

    try {
      if (extension === 'json') {
        const text = await file.text()
        const parsed = JSON.parse(text)

        if (Array.isArray(parsed)) {
          const importedPrimitives = (parsed as ShapePrimitive[]).map((prim) => ({
            ...prim,
            metalness: MATTE_MATERIAL.metalness,
            roughness: MATTE_MATERIAL.roughness,
          }))
          setPrimitives(importedPrimitives)
          setSelectedPrimId(importedPrimitives[0]?.id ?? null)
          setSculptMode('primitives')
          setImportMessage(`Importado JSON con ${parsed.length} primitivas`)
          return
        }

        if (Array.isArray(parsed?.primitives)) {
          const importedPrimitives = (parsed.primitives as ShapePrimitive[]).map((prim) => ({
            ...prim,
            metalness: MATTE_MATERIAL.metalness,
            roughness: MATTE_MATERIAL.roughness,
          }))
          setPrimitives(importedPrimitives)
          setSelectedPrimId(importedPrimitives[0]?.id ?? null)
          if (Array.isArray(parsed?.voxelCells)) {
            setVoxelCells(new Set<string>(parsed.voxelCells))
          }
          if (typeof parsed?.voxelColor === 'string') {
            setVoxelColor(parsed.voxelColor)
          }
          setSculptMode(parsed?.mode === 'voxel' ? 'voxel' : 'primitives')
          setImportMessage(`Importado JSON (${importedPrimitives.length} primitivas)`)
          return
        }

        if (Array.isArray(parsed?.voxelCells)) {
          setVoxelCells(new Set<string>(parsed.voxelCells))
          setVoxelSelection(new Set())
          if (typeof parsed?.voxelColor === 'string') {
            setVoxelColor(parsed.voxelColor)
          }
          setSculptMode('voxel')
          setImportMessage(`Importado JSON con ${parsed.voxelCells.length} voxeles`)
          return
        }

        throw new Error('Formato JSON no compatible')
      }

      if (extension === 'glb' || extension === 'gltf') {
        const buffer = await file.arrayBuffer()
        const gltf = await parseGltfFile(buffer)
        const importedVoxels = voxelizeSceneBounds(gltf.scene, voxelGridSize)
        if (importedVoxels.size === 0) {
          throw new Error('No se detectó geometría en el modelo')
        }
        setVoxelCells(importedVoxels)
        setVoxelSelection(new Set())
        setSculptMode('voxel')
        setImportMessage(`Modelo ${extension.toUpperCase()} convertido a ${importedVoxels.size} voxeles`)
        return
      }

      throw new Error('Formato no soportado. Usa JSON, GLB o GLTF')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido importando archivo'
      setImportMessage(message)
    } finally {
      setIsImporting(false)
    }
  }, [voxelGridSize])

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click()
  }, [])

  const handleImportInputChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await importShapeFromFile(file)
    e.target.value = ''
  }, [importShapeFromFile])

  const handleClearCustom = useCallback(() => {
    onClear(node.id)
    onClose()
  }, [node.id, onClear, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-[1280px] mx-4 max-h-[92vh] flex flex-col">
        <input
          ref={importInputRef}
          type="file"
          accept=".json,.glb,.gltf"
          className="hidden"
          onChange={handleImportInputChange}
        />

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Editor de Forma: {node.label}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada cuadro de la grilla = 1m × 1m · Modo Primitivas o Esculpido Voxel
            </p>
            {importMessage && (
              <p className="text-[11px] mt-1 text-muted-foreground">{importMessage}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="gap-1" onClick={handleImportClick} disabled={isImporting}>
              <Upload className="h-3.5 w-3.5" />
              {isImporting ? 'Importando...' : 'Importar'}
            </Button>
            <Button variant="outline" size="sm" className="gap-1" onClick={exportCurrentShape}>
              <Download className="h-3.5 w-3.5" />
              Exportar
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: Primitive palette + list */}
          <div className="w-72 border-r flex flex-col shrink-0">
            <div className="p-3 border-b">
              <p className="text-xs font-semibold mb-2">Modo de edición</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  className={cn('px-2 py-1.5 rounded border text-xs', sculptMode === 'primitives' ? 'border-primary bg-primary/10' : 'hover:bg-muted')}
                  onClick={() => setSculptMode('primitives')}
                >
                  Primitivas
                </button>
                <button
                  className={cn('px-2 py-1.5 rounded border text-xs', sculptMode === 'voxel' ? 'border-primary bg-primary/10' : 'hover:bg-muted')}
                  onClick={() => setSculptMode('voxel')}
                >
                  Voxel
                </button>
              </div>
            </div>

            {sculptMode === 'primitives' ? (
              <>
                <div className="p-3 border-b">
                  <p className="text-xs font-semibold mb-2">Agregar primitiva</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {PRIMITIVE_PRESETS.map(({ type, label, icon: Icon }) => (
                      <button
                        key={type}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg border hover:bg-muted transition-colors text-center"
                        onClick={() => addPrimitive(type)}
                        title={label}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-[10px]">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  <p className="text-[10px] text-muted-foreground px-1 mb-1">
                    {primitives.length} primitiva{primitives.length !== 1 ? 's' : ''}
                  </p>
                  {primitives.map((prim, i) => (
                    <button
                      key={prim.id}
                      className={cn(
                        'w-full text-left px-2.5 py-2 rounded-lg border transition-colors flex items-center gap-2',
                        selectedPrimId === prim.id
                          ? 'border-primary bg-primary/10'
                          : 'hover:bg-muted'
                      )}
                      onClick={() => setSelectedPrimId(prim.id)}
                    >
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: prim.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium capitalize">{prim.type} #{i + 1}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {prim.size.x.toFixed(1)}×{prim.size.y.toFixed(1)}×{prim.size.z.toFixed(1)}m
                        </p>
                      </div>
                      <div className="flex gap-0.5">
                        <button
                          className="p-0.5 rounded hover:bg-muted-foreground/20"
                          onClick={(e) => { e.stopPropagation(); duplicatePrimitive(prim.id) }}
                          title="Duplicar"
                        >
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                          className="p-0.5 rounded hover:bg-destructive/20"
                          onClick={(e) => { e.stopPropagation(); deletePrimitive(prim.id) }}
                          title="Eliminar"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </button>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold mb-1.5">Color voxel</p>
                  <input
                    type="color"
                    value={voxelColor}
                    onChange={(e) => setVoxelColor(e.target.value)}
                    className="w-full h-8 cursor-pointer rounded border p-0"
                  />
                </div>

                <div className="space-y-1.5 border rounded-lg p-2">
                  <p className="text-xs font-semibold">Selección directa</p>
                  <div className="rounded border px-2 py-1.5 text-[10px]">
                    Cara activa: <span className="font-semibold uppercase">{activeFace}</span>
                  </div>

                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">Nivel de detalle de selección</p>
                    <div className="grid grid-cols-3 gap-1">
                      {[2, 4, 6, 8, 12, 16].map((value) => (
                        <button
                          key={value}
                          className={cn('px-1.5 py-1 rounded border text-[10px]', faceSubdivision === value ? 'border-primary bg-primary/10' : 'hover:bg-muted')}
                          onClick={() => setFaceSubdivision(value)}
                        >
                          {value}×{value}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={selectFullActiveFace}>
                      Selec. exterior
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={extrudeActiveFace}>
                      Extruir selección
                    </Button>
                  </div>

                  <Button variant="outline" size="sm" className="h-7 text-[10px] w-full" onClick={applyCornerRounding}>
                    Redondear esquinas
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1" onClick={() => setVoxelSelection(new Set())}>
                    <Trash2 className="h-3.5 w-3.5" /> Limpiar selección
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-1" onClick={resetVoxelFromNode}>
                    <Undo2 className="h-3.5 w-3.5" /> Reiniciar voxel
                  </Button>
                </div>

                <div className="rounded border px-2 py-1.5 text-[10px] text-muted-foreground">
                  Clic en el modelo para seleccionar cara/zona. Usa Shift para acumular y luego extruye o redondea.
                </div>
              </div>
            )}
          </div>

          {/* Right: Properties panel */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {sculptMode === 'voxel' ? (
              <div className="flex flex-col h-full p-2 gap-2">
                <div className="border rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
                  <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between shrink-0">
                    <span className="text-xs font-semibold">Visor 3D voxel</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{shapeMetrics.width}×{shapeMetrics.height}×{shapeMetrics.depth}m</span>
                      <Badge variant="secondary" className="text-[10px]">{voxelCells.size} voxel{voxelCells.size !== 1 ? 's' : ''}</Badge>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    <Canvas
                      camera={{
                        position: [shapeMetrics.center[0] + 6, shapeMetrics.center[1] + 4, shapeMetrics.center[2] + 6],
                        fov: 40,
                        near: 0.1,
                        far: 1000,
                      }}
                    >
                      <ShapePreviewScene
                        primitives={activePrimitives}
                        selectedPrimId={null}
                        voxelSelection={voxelSelection}
                        onVoxelFacePick={handleVoxelFacePick}
                      />
                    </Canvas>
                  </div>
                </div>
                <div className="shrink-0 text-[10px] text-muted-foreground text-center">
                  Cara: <span className="font-semibold uppercase">{activeFace}</span> · Selección: <span className="font-semibold">{voxelSelection.size}</span> voxel{voxelSelection.size !== 1 ? 's' : ''}
                </div>
              </div>
            ) : selectedPrim ? (
              <div className="flex flex-col h-full p-2 gap-2">
                {/* Live preview */}
                <div className="border rounded-lg overflow-hidden flex-1 flex flex-col min-h-0">
                  <div className="px-3 py-1.5 border-b bg-muted/30 flex items-center justify-between shrink-0">
                    <span className="text-xs font-semibold">Visor 3D en vivo</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">Arrastrar: rotar · Rueda: zoom</span>
                      <Badge variant="secondary" className="text-[10px]">1 cuadro = 1m</Badge>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[300px]">
                    <Canvas
                      camera={{
                        position: [shapeMetrics.center[0] + 6, shapeMetrics.center[1] + 4, shapeMetrics.center[2] + 6],
                        fov: 40,
                        near: 0.1,
                        far: 1000,
                      }}
                    >
                      <ShapePreviewScene primitives={activePrimitives} selectedPrimId={selectedPrimId} voxelSelection={voxelSelection} />
                    </Canvas>
                  </div>
                </div>

                {/* Compact info strip */}
                <div className="shrink-0 flex items-center gap-2 px-1">
                  <Badge variant="outline" className="capitalize text-[10px]">{selectedPrim.type}</Badge>
                  <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: selectedPrim.color }} />
                  <span className="text-[10px] text-muted-foreground">
                    {shapeMetrics.width}×{shapeMetrics.height}×{shapeMetrics.depth}m · {shapeMetrics.footprint}m²
                  </span>
                </div>

                {/* Scrollable property editors */}
                <div className="shrink-0 overflow-y-auto max-h-[40vh] space-y-2 pr-1">
                <div className="border rounded-lg">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-muted/50"
                    onClick={() => toggleSection('position')}
                  >
                    <span>📍 Posición (metros)</span>
                    {expandedSections.position ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {expandedSections.position && (
                    <div className="px-3 pb-3 space-y-1.5">
                      <DimensionInput label="X" value={selectedPrim.position.x} min={-20} max={20} step={0.1} onChange={(v) => updatePrimVec3(selectedPrim.id, 'position', 'x', v)} />
                      <DimensionInput label="Y" value={selectedPrim.position.y} min={0} max={20} step={0.1} onChange={(v) => updatePrimVec3(selectedPrim.id, 'position', 'y', v)} />
                      <DimensionInput label="Z" value={selectedPrim.position.z} min={-20} max={20} step={0.1} onChange={(v) => updatePrimVec3(selectedPrim.id, 'position', 'z', v)} />
                    </div>
                  )}
                </div>

                {/* Size section */}
                <div className="border rounded-lg">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-muted/50"
                    onClick={() => toggleSection('size')}
                  >
                    <span>📐 Dimensiones ({selectedPrim.type === 'sphere' ? 'radio' : selectedPrim.type === 'cylinder' ? 'radio × altura' : selectedPrim.type === 'cone' ? 'radio × altura' : selectedPrim.type === 'torus' ? 'radio × tubo' : 'ancho × alto × prof.'})</span>
                    {expandedSections.size ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {expandedSections.size && (
                    <div className="px-3 pb-3 space-y-1.5">
                      <DimensionInput
                        label={selectedPrim.type === 'sphere' || selectedPrim.type === 'cylinder' || selectedPrim.type === 'cone' || selectedPrim.type === 'torus' ? 'R' : 'W'}
                        value={selectedPrim.size.x}
                        min={0.05}
                        max={20}
                        step={0.05}
                        onChange={(v) => updatePrimVec3(selectedPrim.id, 'size', 'x', v)}
                      />
                      <DimensionInput
                        label={selectedPrim.type === 'torus' ? 'T' : 'H'}
                        value={selectedPrim.size.y}
                        min={0.05}
                        max={20}
                        step={0.05}
                        onChange={(v) => updatePrimVec3(selectedPrim.id, 'size', 'y', v)}
                      />
                      {(selectedPrim.type === 'box') && (
                        <DimensionInput
                          label="D"
                          value={selectedPrim.size.z}
                          min={0.05}
                          max={20}
                          step={0.05}
                          onChange={(v) => updatePrimVec3(selectedPrim.id, 'size', 'z', v)}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Rotation section */}
                <div className="border rounded-lg">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-muted/50"
                    onClick={() => toggleSection('rotation')}
                  >
                    <span>🔄 Rotación (grados)</span>
                    {expandedSections.rotation ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {expandedSections.rotation && (
                    <div className="px-3 pb-3 space-y-1.5">
                      <DimensionInput label="X" value={selectedPrim.rotation.x} min={0} max={360} step={5} unit="°" onChange={(v) => updatePrimVec3(selectedPrim.id, 'rotation', 'x', v)} />
                      <DimensionInput label="Y" value={selectedPrim.rotation.y} min={0} max={360} step={5} unit="°" onChange={(v) => updatePrimVec3(selectedPrim.id, 'rotation', 'y', v)} />
                      <DimensionInput label="Z" value={selectedPrim.rotation.z} min={0} max={360} step={5} unit="°" onChange={(v) => updatePrimVec3(selectedPrim.id, 'rotation', 'z', v)} />
                    </div>
                  )}
                </div>

                {/* Material section */}
                <div className="border rounded-lg">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-muted/50"
                    onClick={() => toggleSection('material')}
                  >
                    <span><Palette className="inline h-3.5 w-3.5 mr-1" />Material</span>
                    {expandedSections.material ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {expandedSections.material && (
                    <div className="px-3 pb-3 space-y-2">
                      {/* Color palette */}
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1">Color</p>
                        <div className="flex flex-wrap gap-1.5">
                          {DEFAULT_COLORS.map((c) => (
                            <button
                              key={c}
                              className={cn(
                                'w-5 h-5 rounded-sm border transition-transform',
                                selectedPrim.color === c ? 'ring-2 ring-primary scale-110' : 'hover:scale-110'
                              )}
                              style={{ backgroundColor: c }}
                              onClick={() => updatePrimitive(selectedPrim.id, { color: c })}
                            />
                          ))}
                          <input
                            type="color"
                            value={selectedPrim.color}
                            onChange={(e) => updatePrimitive(selectedPrim.id, { color: e.target.value })}
                            className="w-5 h-5 cursor-pointer rounded-sm border-0 p-0"
                            title="Color personalizado"
                          />
                        </div>
                      </div>
                      <div className="rounded border px-2 py-1.5 text-[10px] text-muted-foreground">
                        Acabado fijo: mate (sin brillo)
                      </div>
                    </div>
                  )}
                </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Selecciona una primitiva para editar
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t">
          <div className="flex gap-2">
            {node.customShape && node.customShape.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleClearCustom}>
                <Undo2 className="h-3.5 w-3.5" />
                Restaurar forma original
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" className="gap-1" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" />
              Guardar forma ({activePrimitives.length} elemento{activePrimitives.length !== 1 ? 's' : ''})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
