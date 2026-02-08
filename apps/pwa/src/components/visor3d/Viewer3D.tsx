/**
 * Viewer3D - Componente de visualización Three.js
 * 
 * Features:
 * - Carga GLB/GLTF, OBJ, FBX
 * - OrbitControls (orbit/zoom/pan)
 * - Environment lighting
 * - Grid helper
 * - Click handler para seleccionar puntos (cotas)
 * - Reset view
 */

import { Suspense, useRef, useEffect, useCallback, useState, type ReactNode } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import {
  OrbitControls,
  Environment,
  Center,
  Grid,
  useGLTF,
  useFBX,
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
// Model Loaders
// ============================================================================

function GLBModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return (
    <Center>
      <primitive object={scene.clone()} />
    </Center>
  )
}

function FBXModel({ url }: { url: string }) {
  const fbx = useFBX(url)
  return (
    <Center>
      <primitive object={fbx.clone()} />
    </Center>
  )
}

function OBJModel({ url }: { url: string }) {
  const [obj, setObj] = useState<THREE.Group | null>(null)

  useEffect(() => {
    const loader = new OBJLoader()
    loader.load(
      url,
      (object) => setObj(object),
      undefined,
      (err) => console.error('Error loading OBJ:', err)
    )
  }, [url])

  if (!obj) return null
  return (
    <Center>
      <primitive object={obj} />
    </Center>
  )
}

function ModelLoader({ url, format }: { url: string; format: Model3DFormat }) {
  switch (format) {
    case 'glb':
    case 'gltf':
      return <GLBModel url={url} />
    case 'fbx':
      return <FBXModel url={url} />
    case 'obj':
      return <OBJModel url={url} />
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
// Camera Reset
// ============================================================================

function CameraReset({ resetKey }: { resetKey: number }) {
  const { camera } = useThree()
  const controlsRef = useRef<{ reset: () => void } | null>(null)

  useEffect(() => {
    if (resetKey > 0) {
      camera.position.set(3, 2, 3)
      camera.lookAt(0, 0, 0)
      controlsRef.current?.reset()
    }
  }, [resetKey, camera])

  return null
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

function ModelWithErrorHandling({
  url,
  format,
}: {
  url: string
  format: Model3DFormat
}) {
  const [error, setError] = useState<string | null>(null)

  if (error) {
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ef4444" wireframe />
      </mesh>
    )
  }

  return (
    <ErrorBoundary3D onError={(e) => setError(e)}>
      <ModelLoader url={url} format={format} />
    </ErrorBoundary3D>
  )
}

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
// Main Component
// ============================================================================

export function Viewer3D({
  url,
  format,
  resetKey = 0,
  onPointClick,
  pendingPoint,
  children,
}: Viewer3DProps) {
  return (
    <div className="w-full h-full relative">
      {/* HTML overlay for loading */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" id="viewer-loading-overlay">
        {/* This will be hidden once canvas renders */}
      </div>

      <Canvas
        camera={{ position: [3, 2, 3], fov: 50, near: 0.01, far: 1000 }}
        shadows
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        {/* Background color */}
        <color attach="background" args={['#0c0c0e']} />

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
        <directionalLight position={[-3, 3, -3]} intensity={0.3} />

        {/* Environment for realistic reflections */}
        <Environment preset="warehouse" />

        {/* Grid */}
        <Grid
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#1a1a2e"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#2a2a4e"
          fadeDistance={15}
          fadeStrength={1}
          infiniteGrid
          userData={{ isGrid: true }}
        />

        {/* Controls */}
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.05}
          minDistance={0.1}
          maxDistance={50}
          target={[0, 0, 0]}
        />

        {/* Camera reset handler */}
        <CameraReset resetKey={resetKey} />

        {/* Click handler for dimension creation */}
        {onPointClick && <ClickHandler onPointClick={onPointClick} />}

        {/* Pending point marker */}
        {pendingPoint && <PendingPointMarker point={pendingPoint} />}

        {/* Model */}
        <Suspense fallback={<InCanvasLoader />}>
          <ModelWithErrorHandling url={url} format={format} />
        </Suspense>

        {/* Dimension overlays (children from parent) */}
        {children}
      </Canvas>

      {/* Corner label */}
      <div className="absolute bottom-2 right-2 text-[10px] text-muted-foreground/50 select-none pointer-events-none">
        Orbit: clic izq · Zoom: scroll · Pan: clic der
      </div>
    </div>
  )
}
