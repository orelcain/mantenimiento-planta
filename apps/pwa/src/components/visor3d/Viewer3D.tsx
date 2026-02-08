/**
 * Viewer3D - Componente de visualización Three.js
 * 
 * Features:
 * - Carga GLB/GLTF, OBJ, FBX
 * - OrbitControls (orbit/zoom/pan)
 * - Environment lighting + tone mapping
 * - Auto-fit camera al bounding box del modelo
 * - Doble cara en materiales (esencial para SketchUp)
 * - Mejora de materiales por defecto
 * - Grid helper
 * - Click handler para seleccionar puntos (cotas)
 * - Reset view
 */

import { Suspense, useRef, useEffect, useCallback, useState, type ReactNode } from 'react'
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
import type { Model3DFormat, Point3D } from '@/types/models3d'

// ============================================================================
// Props
// ============================================================================

interface Viewer3DProps {
  url: string
  format: Model3DFormat
  resetKey?: number
  onPointClick?: (point: Point3D) => void
  pendingPoint?: Point3D | null
  children?: ReactNode
}

// ============================================================================
// Material Enhancement - Fix SketchUp exports
// ============================================================================

/**
 * Recorre el modelo y mejora los materiales:
 * - Activa doble cara (SketchUp exporta caras invertidas)
 * - Mejora materiales sin textura con un material físico decente
 * - Recomputa normales si faltan
 */
function enhanceModel(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)

  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      // Recomputar normales si faltan
      if (child.geometry && !child.geometry.attributes.normal) {
        child.geometry.computeVertexNormals()
      }

      // Procesar material(es)
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((mat) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          // Doble cara siempre (SketchUp necesita esto)
          mat.side = THREE.DoubleSide
          // Si el material es completamente blanco/gris sin textura, mejorarlo
          if (!mat.map && !mat.normalMap) {
            const color = mat.color
            const isDefault = color.r > 0.7 && color.g > 0.7 && color.b > 0.7
            if (isDefault) {
              // Color gris claro más interesante
              mat.color.setHex(0xc8ccd0)
              mat.roughness = 0.6
              mat.metalness = 0.05
            } else {
              // Mantener color original pero mejorar propiedades
              mat.roughness = Math.min(mat.roughness, 0.7)
              mat.metalness = Math.max(mat.metalness, 0.02)
            }
          }
          mat.envMapIntensity = 0.8
          mat.needsUpdate = true
        } else if (mat instanceof THREE.MeshBasicMaterial) {
          // Convertir MeshBasicMaterial a MeshStandardMaterial para que responda a luces
          const newMat = new THREE.MeshStandardMaterial({
            color: mat.color,
            map: mat.map,
            side: THREE.DoubleSide,
            roughness: 0.6,
            metalness: 0.05,
            transparent: mat.transparent,
            opacity: mat.opacity,
          })
          child.material = newMat
        } else {
          // Cualquier otro material: doble cara
          mat.side = THREE.DoubleSide
        }
      })

      // Habilitar sombras
      child.castShadow = true
      child.receiveShadow = true
    }
  })

  return { box, size, maxDim }
}

// ============================================================================
// Auto-fit Camera to model bounding box
// ============================================================================

function AutoFitCamera({ object, resetKey }: { object: THREE.Object3D | null; resetKey: number }) {
  const { camera, controls } = useThree()
  const fitted = useRef(false)

  useEffect(() => {
    if (!object) return
    
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    
    if (maxDim === 0) return

    // Distancia de cámara basada en el tamaño del modelo
    const fov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180)
    const cameraDistance = maxDim / (2 * Math.tan(fov / 2)) * 1.8

    // Posicionar cámara mirando en diagonal
    camera.position.set(
      center.x + cameraDistance * 0.7,
      center.y + cameraDistance * 0.5,
      center.z + cameraDistance * 0.7
    )
    camera.lookAt(center)
    camera.near = maxDim * 0.001
    camera.far = maxDim * 100
    camera.updateProjectionMatrix()

    // Actualizar controls target
    if (controls && 'target' in controls) {
      (controls as unknown as { target: THREE.Vector3 }).target.copy(center)
    }

    fitted.current = true
  }, [object, camera, controls, resetKey])

  return null
}

// ============================================================================
// Model Loaders (with material enhancement)
// ============================================================================

function GLBModel({ url, onLoaded }: { url: string; onLoaded: (obj: THREE.Object3D) => void }) {
  const { scene } = useGLTF(url)
  const cloned = useRef<THREE.Group | null>(null)

  useEffect(() => {
    const clone = scene.clone(true)
    enhanceModel(clone)
    cloned.current = clone
    onLoaded(clone)
  }, [scene, onLoaded])

  if (!cloned.current) return null
  return <primitive object={cloned.current} />
}

function FBXModel({ url, onLoaded }: { url: string; onLoaded: (obj: THREE.Object3D) => void }) {
  const fbx = useFBX(url)
  const cloned = useRef<THREE.Group | null>(null)

  useEffect(() => {
    const clone = fbx.clone(true)
    enhanceModel(clone)
    cloned.current = clone
    onLoaded(clone)
  }, [fbx, onLoaded])

  if (!cloned.current) return null
  return <primitive object={cloned.current} />
}

function OBJModel({ url, onLoaded }: { url: string; onLoaded: (obj: THREE.Object3D) => void }) {
  const [obj, setObj] = useState<THREE.Group | null>(null)

  useEffect(() => {
    const loader = new OBJLoader()
    loader.load(
      url,
      (object) => {
        enhanceModel(object)
        setObj(object)
        onLoaded(object)
      },
      undefined,
      (err) => console.error('Error loading OBJ:', err)
    )
  }, [url, onLoaded])

  if (!obj) return null
  return <primitive object={obj} />
}

function ModelLoader({
  url,
  format,
  onLoaded,
}: {
  url: string
  format: Model3DFormat
  onLoaded: (obj: THREE.Object3D) => void
}) {
  switch (format) {
    case 'glb':
    case 'gltf':
      return <GLBModel url={url} onLoaded={onLoaded} />
    case 'fbx':
      return <FBXModel url={url} onLoaded={onLoaded} />
    case 'obj':
      return <OBJModel url={url} onLoaded={onLoaded} />
    default:
      return null
  }
}

// ============================================================================
// Click Handler (Raycasting for dimension points)
// ============================================================================

function ClickHandler({
  onPointClick,
}: {
  onPointClick: (point: Point3D) => void
}) {
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())
  const mouse = useRef(new THREE.Vector2())

  const handleClick = useCallback(
    (event: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect()
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.current.setFromCamera(mouse.current, camera)
      const intersects = raycaster.current.intersectObjects(scene.children, true)

      // Filter out helpers, grids, dimension lines etc.
      const hit = intersects.find(
        (i) =>
          i.object.type === 'Mesh' &&
          !i.object.userData.isDimensionHelper &&
          !i.object.userData.isGrid
      )

      if (hit) {
        onPointClick({
          x: hit.point.x,
          y: hit.point.y,
          z: hit.point.z,
        })
      }
    },
    [camera, scene, gl, onPointClick]
  )

  useEffect(() => {
    gl.domElement.addEventListener('click', handleClick)
    return () => gl.domElement.removeEventListener('click', handleClick)
  }, [gl, handleClick])

  return null
}

// ============================================================================
// Pending Point Marker
// ============================================================================

function PendingPointMarker({ point }: { point: Point3D }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      const scale = 1 + Math.sin(clock.getElapsedTime() * 4) * 0.3
      meshRef.current.scale.setScalar(scale)
    }
  })

  return (
    <mesh ref={meshRef} position={[point.x, point.y, point.z]} userData={{ isDimensionHelper: true }}>
      <sphereGeometry args={[0.03, 16, 16]} />
      <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={0.5} />
    </mesh>
  )
}

// ============================================================================
// Loading fallback inside Canvas
// ============================================================================

function InCanvasLoader() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = clock.getElapsedTime()
    }
  })

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#6366f1" wireframe />
    </mesh>
  )
}

// ============================================================================
// Error Boundary for 3D Content
// ============================================================================

import { Component, type ErrorInfo } from 'react'

interface ErrorBoundary3DProps {
  children: ReactNode
  onError: (message: string) => void
}

interface ErrorBoundary3DState {
  hasError: boolean
}

class ErrorBoundary3D extends Component<ErrorBoundary3DProps, ErrorBoundary3DState> {
  constructor(props: ErrorBoundary3DProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundary3DState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error.message)
  }

  render() {
    if (this.state.hasError) {
      return (
        <mesh>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#ef4444" wireframe />
        </mesh>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// Scene Content (inside Canvas)
// ============================================================================

function SceneContent({
  url,
  format,
  resetKey,
  onPointClick,
  pendingPoint,
  children,
}: Viewer3DProps) {
  const [loadedObject, setLoadedObject] = useState<THREE.Object3D | null>(null)
  const [hasError, setHasError] = useState(false)

  const handleModelLoaded = useCallback((obj: THREE.Object3D) => {
    setLoadedObject(obj)
  }, [])

  return (
    <>
      {/* Background */}
      <color attach="background" args={['#0a0a0f']} />

      {/* Improved lighting setup for SketchUp models */}
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[8, 10, 5]}
        intensity={1.0}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={50}
        shadow-camera-near={0.1}
      />
      <directionalLight position={[-5, 5, -5]} intensity={0.4} />
      <directionalLight position={[0, -3, 5]} intensity={0.2} />

      {/* Hemisphere light for natural outdoor feel */}
      <hemisphereLight
        args={['#b1e1ff', '#b97a20', 0.5]}
      />

      {/* Environment for realistic reflections */}
      <Environment preset="apartment" />

      {/* Contact shadows under model */}
      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.4}
        scale={20}
        blur={2}
        far={4}
      />

      {/* Grid */}
      <gridHelper
        args={[40, 40, '#1e293b', '#111827']}
        position={[0, -0.01, 0]}
        userData={{ isGrid: true }}
      />

      {/* Controls */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={0.1}
        maxDistance={200}
        maxPolarAngle={Math.PI * 0.95}
      />

      {/* Auto-fit camera to model */}
      <AutoFitCamera object={loadedObject} resetKey={resetKey ?? 0} />

      {/* Click handler for dimension creation */}
      {onPointClick && <ClickHandler onPointClick={onPointClick} />}

      {/* Pending point marker */}
      {pendingPoint && <PendingPointMarker point={pendingPoint} />}

      {/* Model */}
      <Suspense fallback={<InCanvasLoader />}>
        {!hasError ? (
          <ErrorBoundary3D onError={() => setHasError(true)}>
            <ModelLoader url={url} format={format} onLoaded={handleModelLoaded} />
          </ErrorBoundary3D>
        ) : (
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#ef4444" wireframe />
          </mesh>
        )}
      </Suspense>

      {/* Dimension overlays (children from parent) */}
      {children}
    </>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function Viewer3D(props: Viewer3DProps) {
  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: [5, 3, 5], fov: 45, near: 0.01, far: 2000 }}
        shadows
        gl={{
          antialias: true,
          alpha: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.2,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        style={{ background: 'transparent' }}
      >
        <SceneContent {...props} />
      </Canvas>

      {/* Corner label */}
      <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 select-none pointer-events-none">
        Orbit: clic izq · Zoom: scroll · Pan: clic der
      </div>
    </div>
  )
}
