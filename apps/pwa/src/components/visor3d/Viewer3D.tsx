/**
 * Viewer3D - Componente de visualización Three.js
 *
 * Features:
 * - Carga GLB/GLTF, OBJ, FBX con centrado automático al origen
 * - OrbitControls suaves (orbit/zoom/pan) — funciona en todos los formatos
 * - Environment lighting + tone mapping ACESFilmic
 * - Auto-fit camera al bounding box del modelo
 * - Doble cara en materiales (esencial para SketchUp)
 * - Modo pintura: click en mallas para aplicar color mate
 * - Highlight de malla al hover en modo pintura
 * - Click handler para cotas con SNAP a vértices y aristas
 * - Grid helper + ContactShadows
 */

import { Suspense, useRef, useEffect, useCallback, useState, Component, type ReactNode, type ErrorInfo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import {
  OrbitControls,
  Environment,
  useGLTF,
  useFBX,
  ContactShadows,
} from '@react-three/drei'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import type { Model3DFormat, Point3D, MaterialOverride, Annotation3D } from '@/types/models3d'
import { AnnotationsTool } from './AnnotationsTool'
import { Viewer3DModelContext, type Viewer3DModelContextValue, type Viewer3DModelInfo } from './Viewer3DModelContext'

// ============================================================================
// Props
// ============================================================================

interface Viewer3DProps {
  url: string
  format: Model3DFormat
  resetKey?: number
  viewPreset?: 'front' | 'left' | 'right' | 'top' | 'isometric'
  /** Modo ligero: sin Environment, ContactShadows ni shadow maps (para experiencias interactivas) */
  lightweight?: boolean
  /** Cotas: callback al hacer click en superficie */
  onPointClick?: (point: Point3D) => void
  /** Punto pendiente único (retrocompat) */
  pendingPoint?: Point3D | null
  /** Puntos pendientes para mediciones multi-punto */
  pendingPoints?: Point3D[]
  /** Tipo de medición activa */
  measurementType?: import('@/types/models3d').MeasurementType
  /** Callback para cerrar polígono automáticamente (al hacer click en punto 1) */
  onClosePolygon?: () => void
  /** Pintura: modo activo + color seleccionado */
  paintMode?: boolean
  paintColor?: string | null
  paintErase?: boolean
  /** Overrides de material cargados de Firestore */
  materialOverrides?: MaterialOverride[]
  /** Callback cuando se pinta una malla */
  onMeshPainted?: (meshId: string, color: string | null) => void
  /** Anotaciones (Pines 3D) */
  annotations?: Annotation3D[]
  /** Modo Anotación activo */
  annotationMode?: boolean
  /** Callback para agregar anotación */
  onAddAnnotation?: (point: Point3D) => void
  /** Callback al hacer click en una anotación */
  onAnnotationClick?: (annotation: Annotation3D) => void
  /** Callback al hacer click en una foto de anotación */
  onPhotoClick?: (photos: string[], index: number) => void
  /** Punto al que enfocar la cámara (zoom-to-focus) */
  focusPoint?: Point3D | null
  children?: ReactNode
}

// ============================================================================
// Stable Mesh ID generator
// ============================================================================

function assignStableMeshIds(object: THREE.Object3D): Map<THREE.Mesh, string> {
  const map = new Map<THREE.Mesh, string>()
  const usedIds = new Set<string>()
  let index = 0
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const base = child.name && child.name.length > 0
        ? child.name.replace(/[/.#[\]]/g, '_')
        : `mesh_${index}`
      let finalId = base
      let suffix = 1
      while (usedIds.has(finalId)) {
        finalId = `${base}_${suffix++}`
      }
      usedIds.add(finalId)
      map.set(child, finalId)
      child.userData.stableMeshId = finalId
      index++
    }
  })
  return map
}

// ============================================================================
// Material Enhancement
// ============================================================================

function enhanceModel(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry && !child.geometry.attributes.normal) {
        child.geometry.computeVertexNormals()
      }

      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((mat, matIdx) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.side = THREE.DoubleSide
          if (!mat.map && !mat.normalMap) {
            const c = mat.color
            if (c.r > 0.7 && c.g > 0.7 && c.b > 0.7) {
              mat.color.setHex(0xc8ccd0)
              mat.roughness = 0.6
              mat.metalness = 0.05
            } else {
              mat.roughness = Math.min(mat.roughness, 0.7)
              mat.metalness = Math.max(mat.metalness, 0.02)
            }
          }
          mat.envMapIntensity = 0.8
          mat.needsUpdate = true
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          const newMat = new THREE.MeshStandardMaterial({
            color: mat.color, map: mat.map, side: THREE.DoubleSide,
            roughness: 0.6, metalness: 0.05, transparent: mat.transparent, opacity: mat.opacity,
          })
          if (Array.isArray(child.material)) { child.material[matIdx] = newMat } else { child.material = newMat }
        } else if (mat instanceof THREE.MeshPhongMaterial || mat instanceof THREE.MeshLambertMaterial) {
          const newMat = new THREE.MeshStandardMaterial({
            color: (mat as THREE.MeshPhongMaterial).color || new THREE.Color(0xcccccc),
            map: (mat as THREE.MeshPhongMaterial).map || null,
            side: THREE.DoubleSide, roughness: 0.65, metalness: 0.05,
            transparent: mat.transparent, opacity: mat.opacity,
          })
          if (Array.isArray(child.material)) { child.material[matIdx] = newMat } else { child.material = newMat }
        } else {
          mat.side = THREE.DoubleSide
        }
      })

      child.castShadow = true
      child.receiveShadow = true
    }
  })
}

/**
 * Centra el modelo en el origen - CRÍTICO para OrbitControls en OBJ/FBX
 */
function centerModel(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)

  // Centrar en X y Z, apoyar en Y=0
  object.position.x -= center.x
  object.position.z -= center.z
  const newBox = new THREE.Box3().setFromObject(object)
  object.position.y -= newBox.min.y

  const finalCenter = new THREE.Vector3(0, size.y / 2, 0)
  return { center: finalCenter, size, maxDim }
}

// ============================================================================
// Apply Material Overrides
// ============================================================================

function applyMaterialOverrides(object: THREE.Object3D, overrides: MaterialOverride[]) {
  if (!overrides.length) return
  const map = new Map(overrides.map((o) => [o.meshId, o]))
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.stableMeshId) {
      const ov = map.get(child.userData.stableMeshId)
      if (ov) {
        if (!child.userData.originalMaterial) child.userData.originalMaterial = child.material
        child.material = new THREE.MeshStandardMaterial({
          color: ov.color, roughness: 1, metalness: 0, side: THREE.DoubleSide,
          opacity: ov.opacity, transparent: ov.opacity < 1,
        })
      }
    }
  })
}

// ============================================================================
// Auto-fit Camera
// ============================================================================

interface ModelInfo extends Viewer3DModelInfo {}

function getPresetCameraPosition(
  center: THREE.Vector3,
  dist: number,
  preset: NonNullable<Viewer3DProps['viewPreset']>,
): THREE.Vector3 {
  switch (preset) {
    case 'front':
      return new THREE.Vector3(center.x, center.y + dist * 0.12, center.z - dist * 1.18)
    case 'left':
      return new THREE.Vector3(center.x - dist * 1.12, center.y + dist * 0.14, center.z)
    case 'right':
      return new THREE.Vector3(center.x + dist * 1.12, center.y + dist * 0.14, center.z)
    case 'top':
      return new THREE.Vector3(center.x, center.y + dist * 1.35, center.z)
    case 'isometric':
    default:
      return new THREE.Vector3(center.x + dist * 0.75, center.y + dist * 0.58, center.z - dist * 0.82)
  }
}

function AutoFitCamera({
  modelInfo,
  resetKey,
  viewPreset = 'front',
}: {
  modelInfo: ModelInfo | null
  resetKey: number
  viewPreset?: Viewer3DProps['viewPreset']
}) {
  const { camera, controls } = useThree()

  useEffect(() => {
    if (!modelInfo || modelInfo.maxDim === 0) return
    const { center, maxDim } = modelInfo
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180)
    const dist = maxDim / (2 * Math.tan(fov / 2)) * 2.0

    const nextPosition = getPresetCameraPosition(center, dist, viewPreset ?? 'front')
    camera.position.copy(nextPosition)
    camera.lookAt(center)
    camera.near = Math.max(maxDim * 0.001, 0.001)
    camera.far = maxDim * 200
    camera.updateProjectionMatrix()

    if (controls && 'target' in controls) {
      const ctrl = controls as unknown as { target: THREE.Vector3; update: () => void }
      ctrl.target.copy(center)
      ctrl.update()
    }
  }, [modelInfo, camera, controls, resetKey, viewPreset])

  return null
}

// ============================================================================
// Focus Camera — smooth zoom to a specific point
// ============================================================================

function FocusCamera({ target }: { target: Point3D | null | undefined }) {
  const { camera, controls } = useThree()
  const animating = useRef(false)
  const startTime = useRef(0)
  const startPos = useRef(new THREE.Vector3())
  const startTarget = useRef(new THREE.Vector3())
  const endPos = useRef(new THREE.Vector3())
  const endTarget = useRef(new THREE.Vector3())
  const prevTarget = useRef<string>('')

  useEffect(() => {
    if (!target) return
    const key = `${target.x},${target.y},${target.z}`
    if (key === prevTarget.current) return
    prevTarget.current = key

    const dest = new THREE.Vector3(target.x, target.y, target.z)
    // Calculate camera position: offset from target based on current view direction
    const dir = new THREE.Vector3().subVectors(camera.position, (controls && 'target' in controls) 
      ? (controls as unknown as { target: THREE.Vector3 }).target 
      : new THREE.Vector3()
    ).normalize()
    // Place camera 1.5 units away from point
    const distance = 1.5
    const camDest = dest.clone().add(dir.multiplyScalar(distance))

    startPos.current.copy(camera.position)
    startTarget.current.copy(
      (controls && 'target' in controls)
        ? (controls as unknown as { target: THREE.Vector3 }).target
        : new THREE.Vector3()
    )
    endPos.current.copy(camDest)
    endTarget.current.copy(dest)
    startTime.current = performance.now()
    animating.current = true
  }, [target, camera, controls])

  useFrame(() => {
    if (!animating.current) return
    const elapsed = (performance.now() - startTime.current) / 800 // 800ms animation
    const t = Math.min(1, elapsed)
    // Ease-out cubic
    const ease = 1 - Math.pow(1 - t, 3)

    camera.position.lerpVectors(startPos.current, endPos.current, ease)
    if (controls && 'target' in controls) {
      const ctrl = controls as unknown as { target: THREE.Vector3; update: () => void }
      ctrl.target.lerpVectors(startTarget.current, endTarget.current, ease)
      ctrl.update()
    }

    if (t >= 1) animating.current = false
  })

  return null
}

// ============================================================================
// Model Loaders
// ============================================================================

interface LoaderResult { center: THREE.Vector3; size: THREE.Vector3; maxDim: number; meshIds: Map<THREE.Mesh, string> }

function GLBModel({ url, overrides, onLoaded }: { url: string; overrides: MaterialOverride[]; onLoaded: (obj: THREE.Object3D, info: LoaderResult) => void }) {
  const { scene } = useGLTF(url)
  const cloned = useRef<THREE.Group | null>(null)
  useEffect(() => {
    const clone = scene.clone(true)
    enhanceModel(clone)
    const meshIds = assignStableMeshIds(clone)
    const info = centerModel(clone)
    applyMaterialOverrides(clone, overrides)
    cloned.current = clone
    onLoaded(clone, { ...info, meshIds })
  }, [scene]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cloned.current) return null
  return <primitive object={cloned.current} />
}

function FBXModel({ url, overrides, onLoaded }: { url: string; overrides: MaterialOverride[]; onLoaded: (obj: THREE.Object3D, info: LoaderResult) => void }) {
  const fbx = useFBX(url)
  const cloned = useRef<THREE.Group | null>(null)
  useEffect(() => {
    const clone = fbx.clone(true)
    enhanceModel(clone)
    const meshIds = assignStableMeshIds(clone)
    const info = centerModel(clone)
    applyMaterialOverrides(clone, overrides)
    cloned.current = clone
    onLoaded(clone, { ...info, meshIds })
  }, [fbx]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!cloned.current) return null
  return <primitive object={cloned.current} />
}

function OBJModel({ url, overrides, onLoaded }: { url: string; overrides: MaterialOverride[]; onLoaded: (obj: THREE.Object3D, info: LoaderResult) => void }) {
  const [obj, setObj] = useState<THREE.Group | null>(null)
  useEffect(() => {
    const loader = new OBJLoader()
    loader.load(url, (object) => {
      enhanceModel(object)
      const meshIds = assignStableMeshIds(object)
      const info = centerModel(object)
      applyMaterialOverrides(object, overrides)
      setObj(object)
      onLoaded(object, { ...info, meshIds })
    }, undefined, (err) => console.error('Error loading OBJ:', err))
  }, [url]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!obj) return null
  return <primitive object={obj} />
}

function ModelLoader({ url, format, overrides, onLoaded }: { url: string; format: Model3DFormat; overrides: MaterialOverride[]; onLoaded: (obj: THREE.Object3D, info: LoaderResult) => void }) {
  switch (format) {
    case 'glb': case 'gltf': return <GLBModel url={url} overrides={overrides} onLoaded={onLoaded} />
    case 'fbx': return <FBXModel url={url} overrides={overrides} onLoaded={onLoaded} />
    case 'obj': return <OBJModel url={url} overrides={overrides} onLoaded={onLoaded} />
    default: return null
  }
}

// ============================================================================
// Snap Helpers — busca vértices y aristas cercanas al punto de raycast
// ============================================================================

/** Resultado de snap: tipo + posición corregida */
interface SnapResult {
  type: 'vertex' | 'edge' | 'face'
  point: THREE.Vector3
  /** Distancia en screen-space (NDC) al snap — menor = más cerca */
  screenDist: number
}

/**
 * Busca el vértice más cercano al punto de intersección dentro de un radio en pantalla.
 * Devuelve la posición en world-space del vértice si está dentro del umbral.
 */
function findNearestVertex(
  hitPoint: THREE.Vector3,
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  screenThreshold: number // en píxeles normalizados (0-1 range)
): SnapResult | null {
  const geom = mesh.geometry
  const posAttr = geom.attributes.position
  if (!posAttr) return null

  const matrixWorld = mesh.matrixWorld
  const tmpVec = new THREE.Vector3()
  const hitScreen = hitPoint.clone().project(camera)

  let bestDist = Infinity
  let bestPoint: THREE.Vector3 | null = null

  // Iterar por vértices (muestrear si hay demasiados para no bloquear)
  const stride = posAttr.count > 10000 ? Math.ceil(posAttr.count / 5000) : 1

  for (let i = 0; i < posAttr.count; i += stride) {
    tmpVec.fromBufferAttribute(posAttr, i)
    tmpVec.applyMatrix4(matrixWorld)

    // Proyectar a screen space
    const vertScreen = tmpVec.clone().project(camera)
    const dx = vertScreen.x - hitScreen.x
    const dy = vertScreen.y - hitScreen.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < screenThreshold && dist < bestDist) {
      bestDist = dist
      bestPoint = tmpVec.clone()
    }
  }

  if (bestPoint) {
    return { type: 'vertex', point: bestPoint, screenDist: bestDist }
  }
  return null
}

/**
 * Busca la arista más cercana al punto de intersección.
 * Proyecta el hit point sobre cada arista y busca la más cercana en screen-space.
 */
function findNearestEdge(
  hitPoint: THREE.Vector3,
  mesh: THREE.Mesh,
  camera: THREE.Camera,
  screenThreshold: number
): SnapResult | null {
  const geom = mesh.geometry
  const posAttr = geom.attributes.position
  if (!posAttr) return null

  const matrixWorld = mesh.matrixWorld
  const hitScreen = hitPoint.clone().project(camera)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()

  let bestDist = Infinity
  let bestPoint: THREE.Vector3 | null = null

  const index = geom.index

  if (index) {
    // Indexed geometry – recorrer triángulos
    const stride = index.count > 30000 ? Math.ceil(index.count / 15000) * 3 : 3
    for (let i = 0; i < index.count; i += stride) {
      const base = i - (i % 3) // alinear a triángulo
      if (base + 2 >= index.count) continue
      const i0 = index.getX(base)
      const i1 = index.getX(base + 1)
      const i2 = index.getX(base + 2)
      const edges = [[i0, i1], [i1, i2], [i2, i0]]

      for (const [ea, eb] of edges) {
        a.fromBufferAttribute(posAttr, ea!).applyMatrix4(matrixWorld)
        b.fromBufferAttribute(posAttr, eb!).applyMatrix4(matrixWorld)

        // Punto más cercano en el segmento
        const closest = closestPointOnSegment(hitPoint, a, b)
        const closestScreen = closest.clone().project(camera)
        const dx = closestScreen.x - hitScreen.x
        const dy = closestScreen.y - hitScreen.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < screenThreshold && dist < bestDist) {
          bestDist = dist
          bestPoint = closest
        }
      }
    }
  } else {
    // Non-indexed – triángulos secuenciales
    const stride = posAttr.count > 30000 ? Math.ceil(posAttr.count / 15000) * 3 : 3
    for (let i = 0; i + 2 < posAttr.count; i += stride) {
      const base = i - (i % 3)
      if (base + 2 >= posAttr.count) continue
      const edges = [[base, base + 1], [base + 1, base + 2], [base + 2, base]]

      for (const [ea, eb] of edges) {
        a.fromBufferAttribute(posAttr, ea!).applyMatrix4(matrixWorld)
        b.fromBufferAttribute(posAttr, eb!).applyMatrix4(matrixWorld)

        const closest = closestPointOnSegment(hitPoint, a, b)
        const closestScreen = closest.clone().project(camera)
        const dx = closestScreen.x - hitScreen.x
        const dy = closestScreen.y - hitScreen.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist < screenThreshold && dist < bestDist) {
          bestDist = dist
          bestPoint = closest
        }
      }
    }
  }

  if (bestPoint) {
    return { type: 'edge', point: bestPoint, screenDist: bestDist }
  }
  return null
}

/** Punto más cercano en un segmento A–B al punto P */
function closestPointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const ab = b.clone().sub(a)
  const ap = p.clone().sub(a)
  const lenSq = ab.lengthSq()
  if (lenSq === 0) return a.clone()
  let t = ap.dot(ab) / lenSq
  t = Math.max(0, Math.min(1, t))
  return a.clone().add(ab.multiplyScalar(t))
}

/**
 * Ejecuta snap: primero busca vértice (prioridad), luego arista.
 * Si no hay snap, devuelve el punto original de la superficie.
 */
function computeSnap(
  hitPoint: THREE.Vector3,
  mesh: THREE.Mesh,
  camera: THREE.Camera,
): SnapResult {
  // Umbral en NDC (~40px en una pantalla 1920px ≈ 0.04)
  const VERTEX_THRESHOLD = 0.05
  const EDGE_THRESHOLD = 0.04

  // Prioridad: vértice > arista > superficie
  const vertSnap = findNearestVertex(hitPoint, mesh, camera, VERTEX_THRESHOLD)
  if (vertSnap) return vertSnap

  const edgeSnap = findNearestEdge(hitPoint, mesh, camera, EDGE_THRESHOLD)
  if (edgeSnap) return edgeSnap

  return { type: 'face', point: hitPoint, screenDist: 0 }
}

// ============================================================================
// Click Handler con Snap (cotas)
// ============================================================================

function ClickHandler({ onPointClick, pendingPoints, measurementType, onClosePolygon }: {
  onPointClick: (point: Point3D) => void
  pendingPoints?: Point3D[]
  measurementType?: import('@/types/models3d').MeasurementType
  onClosePolygon?: () => void
}) {
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const mouse = useRef(new THREE.Vector2())

  // Snap indicator state
  const snapIndicatorRef = useRef<THREE.Group>(null!)
  const snapSphereRef = useRef<THREE.Mesh>(null!)
  const currentSnap = useRef<SnapResult | null>(null)
  const nearFirstPoint = useRef(false)

  // Check if mouse is near the first pending point (for closing polygons)
  const checkNearFirstPoint = useCallback((mouseNdc: THREE.Vector2): boolean => {
    if (!pendingPoints || pendingPoints.length < 3 || measurementType !== 'area') return false
    const p0 = pendingPoints[0]!
    const worldPos = new THREE.Vector3(p0.x, p0.y, p0.z)
    const screenPos = worldPos.clone().project(camera)
    const dx = screenPos.x - mouseNdc.x
    const dy = screenPos.y - mouseNdc.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    // Threshold in NDC: ~0.04 (~20px on a 1000px viewport)
    return dist < 0.06
  }, [pendingPoints, measurementType, camera])

  // Perform raycast + snap on mouse move → show indicator
  const handleMove = useCallback((event: MouseEvent) => {
    const rect = gl.domElement.getBoundingClientRect()
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.current.setFromCamera(mouse.current, camera)
    const intersects = raycaster.current.intersectObjects(scene.children, true)
    const hit = intersects.find((i) =>
      i.object instanceof THREE.Mesh &&
      !i.object.userData.isDimensionHelper &&
      !i.object.userData.isGrid &&
      !i.object.userData.isHighlight &&
      !i.object.userData.isSnapIndicator
    )

    if (hit && hit.object instanceof THREE.Mesh) {
      const snap = computeSnap(hit.point, hit.object, camera)
      currentSnap.current = snap

      // Check proximity to first point for polygon closing
      nearFirstPoint.current = checkNearFirstPoint(mouse.current)

      // Update indicator
      if (snapSphereRef.current) {
        snapSphereRef.current.position.copy(snap.point)
        snapSphereRef.current.visible = true

        // Color: verde para vértice, azul para arista, gris para superficie
        const mat = snapSphereRef.current.material as THREE.MeshStandardMaterial
        if (snap.type === 'vertex') {
          mat.color.setHex(0x22c55e) // green
          mat.emissive.setHex(0x22c55e)
          snapSphereRef.current.scale.setScalar(1.3)
          gl.domElement.style.cursor = 'crosshair'
        } else if (snap.type === 'edge') {
          mat.color.setHex(0x3b82f6) // blue
          mat.emissive.setHex(0x3b82f6)
          snapSphereRef.current.scale.setScalar(1)
          gl.domElement.style.cursor = 'crosshair'
        } else {
          mat.color.setHex(0x94a3b8) // gray
          mat.emissive.setHex(0x94a3b8)
          snapSphereRef.current.scale.setScalar(0.7)
          gl.domElement.style.cursor = 'crosshair'
        }
      }
    } else {
      currentSnap.current = null
      nearFirstPoint.current = false
      if (snapSphereRef.current) {
        snapSphereRef.current.visible = false
      }
    }
  }, [camera, scene, gl, checkNearFirstPoint])

  const handleClick = useCallback((event: MouseEvent) => {
    // Check if clicking near first point to close polygon
    const rect = gl.domElement.getBoundingClientRect()
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    if (checkNearFirstPoint(mouse.current) && onClosePolygon) {
      onClosePolygon()
      return
    }

    // Si tenemos snap, usar ese punto
    if (currentSnap.current) {
      const p = currentSnap.current.point
      onPointClick({ x: p.x, y: p.y, z: p.z })
      return
    }

    // Fallback: raycast directo
    raycaster.current.setFromCamera(mouse.current, camera)
    const intersects = raycaster.current.intersectObjects(scene.children, true)
    const hit = intersects.find((i) =>
      i.object.type === 'Mesh' && !i.object.userData.isDimensionHelper && !i.object.userData.isGrid && !i.object.userData.isHighlight && !i.object.userData.isSnapIndicator
    )
    if (hit) {
      onPointClick({ x: hit.point.x, y: hit.point.y, z: hit.point.z })
    }
  }, [camera, scene, gl, onPointClick, checkNearFirstPoint, onClosePolygon])

  useEffect(() => {
    gl.domElement.addEventListener('click', handleClick)
    gl.domElement.addEventListener('mousemove', handleMove)
    gl.domElement.style.cursor = 'crosshair'
    return () => {
      gl.domElement.removeEventListener('click', handleClick)
      gl.domElement.removeEventListener('mousemove', handleMove)
      gl.domElement.style.cursor = 'default'
    }
  }, [gl, handleClick, handleMove])

  return (
    <group ref={snapIndicatorRef} userData={{ isSnapIndicator: true }}>
      {/* Snap point indicator — esfera que aparece en el vértice/arista detectado */}
      <mesh ref={snapSphereRef} visible={false} userData={{ isSnapIndicator: true }}>
        <sphereGeometry args={[0.025, 16, 16]} />
        <meshStandardMaterial
          color="#22c55e"
          emissive="#22c55e"
          emissiveIntensity={0.6}
          transparent
          opacity={0.85}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// ============================================================================
// Paint Click Handler
// ============================================================================

function PaintClickHandler({ paintColor, paintErase, onMeshPainted }: {
  paintColor: string | null; paintErase: boolean; onMeshPainted: (meshId: string, color: string | null) => void
}) {
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const mouse = useRef(new THREE.Vector2())
  const hoveredMesh = useRef<THREE.Mesh | null>(null)
  const highlightMat = useRef(new THREE.MeshStandardMaterial({
    color: '#ffffff', emissive: '#4488ff', emissiveIntensity: 0.3,
    transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false,
  }))

  const handleClick = useCallback((event: MouseEvent) => {
    const rect = gl.domElement.getBoundingClientRect()
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.current.setFromCamera(mouse.current, camera)
    const hit = raycaster.current.intersectObjects(scene.children, true).find((i) =>
      i.object instanceof THREE.Mesh && !i.object.userData.isDimensionHelper && !i.object.userData.isGrid && !i.object.userData.isHighlight
    )
    if (hit && hit.object instanceof THREE.Mesh) {
      const mesh = hit.object
      const meshId = mesh.userData.stableMeshId
      if (!meshId) return

      // Restaurar del hover primero
      if (mesh.userData.preHoverMaterial) {
        mesh.material = mesh.userData.preHoverMaterial
        delete mesh.userData.preHoverMaterial
      }

      if (paintErase) {
        if (mesh.userData.originalMaterial) {
          mesh.material = mesh.userData.originalMaterial
          delete mesh.userData.originalMaterial
        }
        onMeshPainted(meshId, null)
      } else if (paintColor) {
        if (!mesh.userData.originalMaterial) mesh.userData.originalMaterial = mesh.material
        mesh.material = new THREE.MeshStandardMaterial({
          color: paintColor, roughness: 1, metalness: 0, side: THREE.DoubleSide,
        })
        onMeshPainted(meshId, paintColor)
      }
    }
  }, [camera, scene, gl, paintColor, paintErase, onMeshPainted])

  const handleMove = useCallback((event: MouseEvent) => {
    const rect = gl.domElement.getBoundingClientRect()
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.current.setFromCamera(mouse.current, camera)
    const hit = raycaster.current.intersectObjects(scene.children, true).find((i) =>
      i.object instanceof THREE.Mesh && !i.object.userData.isDimensionHelper && !i.object.userData.isGrid && !i.object.userData.isHighlight
    )
    const newHovered = hit ? (hit.object as THREE.Mesh) : null
    if (newHovered !== hoveredMesh.current) {
      if (hoveredMesh.current?.userData.preHoverMaterial) {
        hoveredMesh.current.material = hoveredMesh.current.userData.preHoverMaterial
        delete hoveredMesh.current.userData.preHoverMaterial
      }
      if (newHovered) {
        newHovered.userData.preHoverMaterial = newHovered.material
        newHovered.material = highlightMat.current
        gl.domElement.style.cursor = 'crosshair'
      } else {
        gl.domElement.style.cursor = 'default'
      }
      hoveredMesh.current = newHovered
    }
  }, [camera, scene, gl])

  useEffect(() => {
    gl.domElement.addEventListener('click', handleClick)
    gl.domElement.addEventListener('mousemove', handleMove)
    gl.domElement.style.cursor = 'crosshair'
    return () => {
      gl.domElement.removeEventListener('click', handleClick)
      gl.domElement.removeEventListener('mousemove', handleMove)
      gl.domElement.style.cursor = 'default'
      if (hoveredMesh.current?.userData.preHoverMaterial) {
        hoveredMesh.current.material = hoveredMesh.current.userData.preHoverMaterial
        delete hoveredMesh.current.userData.preHoverMaterial
      }
    }
  }, [gl, handleClick, handleMove])

  return null
}

// ============================================================================

// ============================================================================
// Annotation Click Handler
// ============================================================================

function AnnotationClickHandler({ onAddAnnotation }: { onAddAnnotation: (p: Point3D) => void }) {
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const mouse = useRef(new THREE.Vector2())

  const handleClick = useCallback((event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('.annotation-ui')) return // Ignorar clicks en UI html

    const rect = gl.domElement.getBoundingClientRect()
    mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.current.setFromCamera(mouse.current, camera)
    
    // Ignore invalid objects (helpers, grids, lines)
    const hit = raycaster.current.intersectObjects(scene.children, true).find((i) => 
      i.object instanceof THREE.Mesh && 
      !i.object.userData.isDimensionHelper && 
      !i.object.userData.isGrid && 
      !i.object.userData.isSnapIndicator &&
      !i.object.userData.isContactShadow && 
      i.object.visible
    )

    if (hit) {
      onAddAnnotation({ x: hit.point.x, y: hit.point.y, z: hit.point.z })
    }
  }, [camera, scene, gl, onAddAnnotation])

  useEffect(() => {
    gl.domElement.addEventListener('click', handleClick)
    gl.domElement.style.cursor = 'cell' // Indicate "Add" action
    return () => {
      gl.domElement.removeEventListener('click', handleClick)
      gl.domElement.style.cursor = 'default'
    }
  }, [gl, handleClick])

  return null
}

// In-Canvas Loader
// ============================================================================

function InCanvasLoader() {
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { if (meshRef.current) meshRef.current.rotation.y = clock.getElapsedTime() })
  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#6366f1" wireframe />
    </mesh>
  )
}

// ============================================================================
// Error Boundary
// ============================================================================

class ErrorBoundary3D extends Component<{ children: ReactNode; onError: (msg: string) => void }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; onError: (msg: string) => void }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error, _info: ErrorInfo) { this.props.onError(error.message) }
  render() {
    if (this.state.hasError) return <mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ef4444" wireframe /></mesh>
    return this.props.children
  }
}

// ============================================================================
// Scene Content
// ============================================================================

function SceneContent(props: Viewer3DProps) {
  const { 
    url, format, resetKey, onPointClick, pendingPoints, measurementType, onClosePolygon, 
    paintMode, paintColor, paintErase, materialOverrides, onMeshPainted,
    annotations, annotationMode, onAddAnnotation, onAnnotationClick, onPhotoClick,
    focusPoint, viewPreset, lightweight,
    children 
  } = props
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [modelContextValue, setModelContextValue] = useState<Viewer3DModelContextValue>({ object: null, info: null })
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setModelInfo(null)
    setModelContextValue({ object: null, info: null })
    setHasError(false)
  }, [url, format])

  const handleModelLoaded = useCallback((object: THREE.Object3D, info: LoaderResult) => {
    const nextInfo = {
      center: info.center.clone(),
      size: info.size.clone(),
      maxDim: info.maxDim,
    }
    setModelInfo(nextInfo)
    setModelContextValue({ object, info: nextInfo })
  }, [])

  return (
    <Viewer3DModelContext.Provider value={modelContextValue}>
      <color attach="background" args={['#0a0a0f']} />

      {/* Lighting — lightweight skips heavy shadow maps, Environment & ContactShadows */}
      <ambientLight intensity={lightweight ? 0.8 : 0.6} />
      {lightweight ? (
        <>
          <directionalLight position={[8, 10, 5]} intensity={1.0} />
          <directionalLight position={[-5, 5, -5]} intensity={0.4} />
          <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
        </>
      ) : (
        <>
          <directionalLight position={[8, 10, 5]} intensity={1.0} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <directionalLight position={[-5, 5, -5]} intensity={0.4} />
          <directionalLight position={[0, -3, 5]} intensity={0.2} />
          <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
          <Environment preset="apartment" />
          <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={4} />
        </>
      )}

      {/* Grid */}
      <gridHelper args={[40, 40, '#1e293b', '#111827']} position={[0, -0.01, 0]} userData={{ isGrid: true }} />

      {/* Controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.01}
        maxDistance={500}
        maxPolarAngle={Math.PI * 0.95}
        enablePan
        panSpeed={1}
        rotateSpeed={0.8}
        zoomSpeed={1.2}
        zoomToCursor
      />

      <AutoFitCamera modelInfo={modelInfo} resetKey={resetKey ?? 0} viewPreset={viewPreset} />
      <FocusCamera target={focusPoint} />

      {/* Click handlers - Priority: Paint > Annotation > Measure */}
      {paintMode && onMeshPainted ? (
        <PaintClickHandler 
          paintColor={paintColor ?? null} 
          paintErase={paintErase ?? false} 
          onMeshPainted={onMeshPainted} 
        />
      ) : annotationMode && onAddAnnotation ? (
        <AnnotationClickHandler 
          onAddAnnotation={onAddAnnotation} 
        />
      ) : onPointClick ? (
        <ClickHandler
          onPointClick={onPointClick}
          pendingPoints={pendingPoints}
          measurementType={measurementType}
          onClosePolygon={onClosePolygon}
        />
      ) : null}

      {/* Annotations */}
      {annotations && (
        <AnnotationsTool 
          annotations={annotations} 
          onAnnotationClick={onAnnotationClick}
          onPhotoClick={onPhotoClick}
        />
      )}

      {/* Pending points are now rendered inside DimensionsTool via pendingPoints prop */}

      {/* Model */}
      <Suspense fallback={<InCanvasLoader />}>
        {!hasError ? (
          <ErrorBoundary3D onError={() => setHasError(true)}>
            <ModelLoader url={url} format={format} overrides={materialOverrides ?? []} onLoaded={handleModelLoaded} />
          </ErrorBoundary3D>
        ) : (
          <mesh><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#ef4444" wireframe /></mesh>
        )}
      </Suspense>

      {children}
    </Viewer3DModelContext.Provider>
  )
}

// ============================================================================
// WebGL availability check
// ============================================================================

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    return !!gl
  } catch {
    return false
  }
}

function WebGLUnavailableFallback() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="rounded-full border border-amber-500/30 bg-amber-500/10 p-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div>
        <p className="text-sm font-semibold">WebGL no disponible</p>
        <p className="mt-1 text-xs text-muted-foreground">
          El navegador no pudo crear un contexto 3D. Intenta cerrar otras pestañas con contenido 3D,
          reiniciar el navegador o verificar que la aceleracion por hardware este habilitada.
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Canvas-level Error Boundary (catches R3F Canvas creation failures)
// ============================================================================

class CanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.warn('[Viewer3D] Canvas creation failed:', error.message)
  }
  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }
}

// ============================================================================
// Main Component
// ============================================================================

export function Viewer3D(props: Viewer3DProps) {
  const [webglOk] = useState(() => isWebGLAvailable())

  if (!webglOk) {
    return (
      <div className="w-full h-full relative">
        <WebGLUnavailableFallback />
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <CanvasErrorBoundary fallback={<WebGLUnavailableFallback />}>
        <Canvas
          camera={{ position: [0, 3, -5], fov: 45, near: 0.01, far: 2000 }}
          shadows={!props.lightweight}
          gl={{
            antialias: true,
            alpha: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
            outputColorSpace: THREE.SRGBColorSpace,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl: renderer }) => {
            renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault() })
          }}
          style={{ background: 'transparent' }}
        >
          <SceneContent {...props} />
        </Canvas>
      </CanvasErrorBoundary>
      <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 select-none pointer-events-none">
        Orbit: clic izq · Zoom: scroll · Pan: clic der
      </div>
    </div>
  )
}
