import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  OrbitControls,
  useGLTF,
  useAnimations,
  Environment,
  Html,
  ContactShadows,
  MeshReflectorMaterial,
  Grid,
} from '@react-three/drei'
import * as THREE from 'three'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Camera, Compass, DoorOpen, ArrowUpFromLine, Wind } from 'lucide-react'

const GLB_URL = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/models3d/plataforma_ponton.glb`

interface PlataformaPontonInteractiveExperienceProps {
  modelName: string
  className?: string
}

type CameraPreset = 'orbital' | 'interior' | 'frontal' | 'cerca' | 'detalle'

interface CameraView {
  id: CameraPreset
  label: string
  position: [number, number, number]
  target: [number, number, number]
}

// Coordenadas en convención three.js (Y up) - calculadas desde Blender (Z up) con yup transform
// Blender (x, y, z) -> three.js (x, z, -y)
const CAMERA_VIEWS: Record<CameraPreset, CameraView> = {
  orbital: {
    id: 'orbital',
    label: 'Cámara orbital',
    position: [-4, 4.5, -11],
    target: [1.5, 1.5, -0.5],
  },
  interior: {
    id: 'interior',
    label: 'Desde el interior mirando afuera',
    position: [1.5, 1.8, 1.5],
    target: [1.5, 1.5, -3],
  },
  frontal: {
    id: 'frontal',
    label: 'Vista frontal del pontón',
    position: [1.5, 2.5, -9],
    target: [1.5, 1.5, -0.5],
  },
  cerca: {
    id: 'cerca',
    label: 'Cerca y desde arriba (4 m)',
    position: [1.5, 5.5, -4],
    target: [1.5, 2.0, -0.5],
  },
  detalle: {
    id: 'detalle',
    label: 'Detalle subida + desarme',
    position: [1.5, 6.5, -1.5],
    target: [1.5, 2.5, -1.0],
  },
}

function PontonModel({
  onActionsReady,
}: {
  onActionsReady: (actions: Record<string, THREE.AnimationAction | null>) => void
}) {
  const { scene, animations } = useGLTF(GLB_URL)
  const groupRef = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, groupRef)

  useEffect(() => {
    if (actions && Object.keys(actions).length > 0) {
      onActionsReady(actions)
    }
  }, [actions, onActionsReady])

  // Mejorar materiales del modelo + ocultar el "Agua" estático (lo reemplazamos por animado)
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true
        obj.receiveShadow = true
        // Ocultar el mesh "Agua" del GLB — usamos AnimatedWater en su lugar
        if (obj.name === 'Agua' || obj.name.startsWith('Agua')) {
          obj.visible = false
        }
      }
    })
  }, [scene])

  return <primitive ref={groupRef} object={scene} />
}

// ============================================================
// Agua OPACA realista con olas + viento + ESPUMA en crestas
// Material físico con shader injection para foam blanco en peaks
// ============================================================
function AnimatedWater({
  position,
  size = 60,
  windStrength = 1.0,
  windDirection = 0.6,
}: {
  position: [number, number, number]
  size?: number
  windStrength?: number
  windDirection?: number
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const originalPositions = useRef<Float32Array | null>(null)
  const colorsRef = useRef<Float32Array | null>(null)

  useFrame((state) => {
    if (!meshRef.current) return
    const geometry = meshRef.current.geometry as THREE.PlaneGeometry
    const positions = geometry.attributes.position as THREE.BufferAttribute

    if (!originalPositions.current) {
      originalPositions.current = new Float32Array(positions.array)
      // Crear atributo de colores para foam
      const colArr = new Float32Array(positions.count * 3)
      colorsRef.current = colArr
      geometry.setAttribute('color', new THREE.BufferAttribute(colArr, 3))
    }

    const t = state.clock.elapsedTime
    const orig = originalPositions.current
    const colors = colorsRef.current!
    const wx = Math.cos(windDirection)
    const wy = Math.sin(windDirection)

    // Color base agua y color espuma
    const baseR = 0.051, baseG = 0.227, baseB = 0.322
    const foamR = 0.92, foamG = 0.96, foamB = 0.98

    const foamThreshold = 0.05 + 0.04 * (2 - windStrength)
    const maxFoamAt = 0.18 * windStrength

    for (let i = 0; i < positions.count; i++) {
      const ox = orig[i * 3]
      const oy = orig[i * 3 + 1]
      const u = ox * wx + oy * wy
      const v = -ox * wy + oy * wx

      const swell = Math.sin(u * 0.5 + t * 0.8) * 0.18 * windStrength
      const wave = Math.sin(v * 0.8 + t * 1.1) * 0.09 * windStrength
      const ripple1 = Math.sin(u * 2.2 + t * 2.2) * 0.025 * windStrength
      const ripple2 = Math.cos(v * 2.5 + ox * 0.9 + t * 2.8) * 0.020 * windStrength
      const choppy = Math.cos(u * 1.2 + v * 0.9 + t * 1.3) * 0.040 * windStrength
      const broken = Math.sin(u * 4.0 + v * 3.5 + t * 3.5) * 0.012 * windStrength

      const h = swell + wave + ripple1 + ripple2 + choppy + broken
      positions.setZ(i, h)

      const foamAmt = Math.max(
        0,
        Math.min(1, (h - foamThreshold) / Math.max(0.01, maxFoamAt - foamThreshold))
      )
      const f = Math.pow(foamAmt, 1.6)
      colors[i * 3]     = baseR + (foamR - baseR) * f
      colors[i * 3 + 1] = baseG + (foamG - baseG) * f
      colors[i * 3 + 2] = baseB + (foamB - baseB) * f
    }
    positions.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    geometry.computeVertexNormals()
  })

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[size, size, 96, 96]} />
      {/* MeshReflectorMaterial = refleja todo el modelo en el agua (técnica de videojuego) */}
      <MeshReflectorMaterial
        blur={[200, 80]}
        resolution={512}
        mixBlur={1.2}
        mixStrength={0.85}
        mirror={0.55}
        color="#0d3a52"
        roughness={0.32}
        metalness={0.15}
        depthScale={0.6}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.2}
        envMapIntensity={1.0}
        vertexColors
      />
    </mesh>
  )
}

// ============================================================
// Sistema de partículas para SPLASH (salpicaduras)
// Burst-based: cada vez que `triggerKey` cambia, dispara N partículas
// desde `origin` con velocidades aleatorias hacia arriba+laterales
// ============================================================
function SplashBurst({
  origin,
  triggerKey,
  count = 40,
  velocityScale = 1,
  color = '#cfe6ee',
}: {
  origin: [number, number, number]
  triggerKey: number
  count?: number
  velocityScale?: number
  color?: string
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const particles = useRef<Array<{ pos: [number, number, number]; vel: [number, number, number]; life: number; size: number }>>([])

  // Inicializar buffer una sola vez
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const posArr = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) posArr[i] = 10000 // fuera de pantalla
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3))
    const sizes = new Float32Array(count).fill(0.06)
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.06,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    })
    return { geometry: geo, material: mat }
  }, [count, color])

  // Trigger: al cambiar triggerKey, resetear partículas
  useEffect(() => {
    if (triggerKey === 0) return
    particles.current = []
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = (1.5 + Math.random() * 2.5) * velocityScale
      particles.current.push({
        pos: [origin[0] + (Math.random() - 0.5) * 0.3, origin[1], origin[2] + (Math.random() - 0.5) * 0.3],
        vel: [Math.cos(angle) * speed * 0.5, 2 + Math.random() * 3, Math.sin(angle) * speed * 0.5],
        life: 0.9 + Math.random() * 0.6,
        size: 0.04 + Math.random() * 0.06,
      })
    }
  }, [triggerKey, count, velocityScale, origin])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    const positions = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute
    const arr = positions.array as Float32Array
    for (let i = 0; i < count; i++) {
      const p = particles.current[i]
      if (!p || p.life <= 0) {
        arr[i * 3] = 10000
        continue
      }
      p.pos[0] += p.vel[0] * delta
      p.pos[1] += p.vel[1] * delta
      p.pos[2] += p.vel[2] * delta
      p.vel[1] -= 6.5 * delta // gravedad
      p.life -= delta
      arr[i * 3] = p.pos[0]
      arr[i * 3 + 1] = p.pos[1]
      arr[i * 3 + 2] = p.pos[2]
    }
    positions.needsUpdate = true
    // Fade out via opacity (simplificación)
    const anyAlive = particles.current.some((p) => p && p.life > 0)
    material.opacity = anyAlive ? 0.85 : 0
  })

  return <points ref={pointsRef} geometry={geometry} material={material} />
}

// ============================================================
// Splash continuo alrededor del casco — partículas tipo "chapoteo" sutil
// ============================================================
function HullSplashes({ windStrength = 1.0 }: { windStrength?: number }) {
  const [trigger, setTrigger] = useState(0)
  const [origins, setOrigins] = useState<Array<[number, number, number]>>([])

  useEffect(() => {
    // Puntos alrededor del casco (20×20m centrado 0,2)
    // El casco va aprox X[-3,4] Z[-2,4] en three.js
    setOrigins([
      [-3.2, -0.02, 2.0],   // costado izq
      [4.2, -0.02, 2.0],    // costado der
      [-3.2, -0.02, -1.5],  // izq atrás
      [4.2, -0.02, -1.5],   // der atrás
      [0.5, -0.02, 4.2],    // frente medio
      [3.0, -0.02, 4.2],    // frente derecho
    ])
  }, [])

  useEffect(() => {
    const id = setInterval(() => {
      setTrigger((t) => t + 1)
    }, Math.max(800, 2500 / Math.max(0.3, windStrength)))
    return () => clearInterval(id)
  }, [windStrength])

  // Cada trigger, dispara desde un origen aleatorio
  const idx = trigger % origins.length

  return origins.length > 0 ? (
    <SplashBurst
      origin={origins[idx]}
      triggerKey={trigger}
      count={18}
      velocityScale={0.6 * windStrength}
    />
  ) : null
}

// ============================================================
// Cuerda principal con sway: oscilación lateral según viento
// ============================================================
function WindyRopes({ windStrength = 1.0 }: { windStrength?: number }) {
  const { scene } = useThree()
  const ropesRef = useRef<{ obj: THREE.Object3D; baseRotX: number; baseRotZ: number; phase: number }[]>([])

  useEffect(() => {
    const found: typeof ropesRef.current = []
    scene.traverse((obj) => {
      // SOLO cabo libre (extremo suelto que cuelga del operario).
      // La cuerda principal está bajo tensión — NO debe oscilar (se saldría de la argolla)
      if (obj.name === 'Cuerda_cabo_libre_V2a' || obj.name === 'Cuerda_cabo_libre_V2b') {
        found.push({
          obj,
          baseRotX: obj.rotation.x,
          baseRotZ: obj.rotation.z,
          phase: Math.random() * Math.PI * 2,
        })
      }
    })
    ropesRef.current = found
  }, [scene])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (const r of ropesRef.current) {
      // Sway lateral suave del cabo libre (péndulo bajo viento)
      r.obj.rotation.x = r.baseRotX + Math.sin(t * 1.3 + r.phase) * 0.04 * windStrength
      r.obj.rotation.z = r.baseRotZ + Math.cos(t * 1.0 + r.phase) * 0.05 * windStrength
    }
  })

  return null
}

// ============================================================
// Función compartida — calcula altura del agua en posición (x, z) — DEBE coincidir con AnimatedWater
// ============================================================
function sampleWaveHeight(
  worldX: number,
  worldZ: number,
  waterCenter: [number, number, number],
  t: number,
  windStrength: number,
  windDirection: number,
): number {
  // Posición local relativa al centro del agua (en plano XZ three.js → XY del plane antes de rotación)
  // El agua tiene rotation [-π/2, 0, 0], así que su local X = world X - centerX, local Y = -(world Z - centerZ)
  const ox = worldX - waterCenter[0]
  const oy = -(worldZ - waterCenter[2])
  const wx = Math.cos(windDirection)
  const wy = Math.sin(windDirection)
  const u = ox * wx + oy * wy
  const v = -ox * wy + oy * wx

  const swell = Math.sin(u * 0.5 + t * 0.8) * 0.18 * windStrength
  const wave = Math.sin(v * 0.8 + t * 1.1) * 0.09 * windStrength
  const ripple1 = Math.sin(u * 2.2 + t * 2.2) * 0.025 * windStrength
  const ripple2 = Math.cos(v * 2.5 + ox * 0.9 + t * 2.8) * 0.020 * windStrength
  const choppy = Math.cos(u * 1.2 + v * 0.9 + t * 1.3) * 0.040 * windStrength
  const broken = Math.sin(u * 4.0 + v * 3.5 + t * 3.5) * 0.012 * windStrength
  return swell + wave + ripple1 + ripple2 + choppy + broken
}

// ============================================================
// Boyas con FLOTACIÓN REAL — siguen la altura del agua bajo cada una
// ============================================================
function WindyBuoys({
  windStrength = 1.0,
  waterCenter = [0, -0.05, 2],
  windDirection = 0.6,
}: {
  windStrength?: number
  waterCenter?: [number, number, number]
  windDirection?: number
}) {
  const { scene } = useThree()
  // Boyas: agrupar piezas (cuerpo, banda, tapa, punta, tope) por número
  const boyaGroupsRef = useRef<{
    pieces: THREE.Object3D[]
    baseY: number
    centerX: number
    centerZ: number
    phase: number
  }[]>([])

  useEffect(() => {
    // Agrupar por prefijo Boya_<N>_
    const groups: Record<string, THREE.Object3D[]> = {}
    scene.traverse((obj) => {
      const match = obj.name.match(/^(Boya_\d+)_/)
      if (match) {
        const key = match[1]
        if (!groups[key]) groups[key] = []
        groups[key].push(obj)
      }
    })

    const built: typeof boyaGroupsRef.current = []
    for (const [_key, pieces] of Object.entries(groups)) {
      if (pieces.length === 0) continue
      // Centro de la boya: usar el cuerpo principal (Boya_N_cuerpo)
      const cuerpo = pieces.find((p) => p.name.endsWith('_cuerpo')) ?? pieces[0]
      // World position del cuerpo
      const wp = new THREE.Vector3()
      cuerpo.getWorldPosition(wp)
      built.push({
        pieces,
        baseY: pieces.reduce((acc, p) => acc + p.position.y, 0) / pieces.length,
        centerX: wp.x,
        centerZ: wp.z,
        phase: Math.random() * Math.PI * 2,
      })
      // Guardar base.y individual por pieza
      pieces.forEach((p) => {
        ;(p as any).__baseY = p.position.y
        ;(p as any).__baseRotX = p.rotation.x
        ;(p as any).__baseRotZ = p.rotation.z
      })
    }
    boyaGroupsRef.current = built
  }, [scene])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    for (const g of boyaGroupsRef.current) {
      // Sample altura del agua donde está la boya
      const waveH = sampleWaveHeight(g.centerX, g.centerZ, waterCenter, t, windStrength, windDirection)
      // Sample alrededor para calcular pendiente (tilt según olas)
      const dx = 0.15
      const wH_xp = sampleWaveHeight(g.centerX + dx, g.centerZ, waterCenter, t, windStrength, windDirection)
      const wH_xm = sampleWaveHeight(g.centerX - dx, g.centerZ, waterCenter, t, windStrength, windDirection)
      const wH_zp = sampleWaveHeight(g.centerX, g.centerZ + dx, waterCenter, t, windStrength, windDirection)
      const wH_zm = sampleWaveHeight(g.centerX, g.centerZ - dx, waterCenter, t, windStrength, windDirection)
      // Pendiente local (gradiente de la superficie)
      const tiltX = (wH_zp - wH_zm) / (2 * dx) // rotación alrededor de X
      const tiltZ = -(wH_xp - wH_xm) / (2 * dx) // rotación alrededor de Z

      for (const p of g.pieces) {
        const baseY = (p as any).__baseY as number
        const baseRotX = (p as any).__baseRotX as number
        const baseRotZ = (p as any).__baseRotZ as number
        // Posicionar siguiendo la ola
        p.position.y = baseY + waveH
        // Tilt según pendiente del agua + jiggle por viento
        p.rotation.x = baseRotX + tiltX * 0.7 + Math.cos(t * 0.6 + g.phase) * 0.015 * windStrength
        p.rotation.z = baseRotZ + tiltZ * 0.7 + Math.sin(t * 0.7 + g.phase) * 0.02 * windStrength
      }
    }
  })

  return null
}

useGLTF.preload(GLB_URL)

function CameraController({
  view,
  orbitEnabled,
}: {
  view: CameraView
  orbitEnabled: boolean
}) {
  const { camera } = useThree()
  const orbitRef = useRef<any>(null)
  const targetRef = useRef(new THREE.Vector3(...view.target))
  const positionRef = useRef(new THREE.Vector3(...view.position))

  // Animar transición a la nueva vista
  useEffect(() => {
    targetRef.current.set(...view.target)
    positionRef.current.set(...view.position)
  }, [view])

  useFrame((_, delta) => {
    if (!orbitEnabled) {
      camera.position.lerp(positionRef.current, Math.min(1, delta * 3))
      camera.lookAt(targetRef.current)
    }
  })

  return orbitEnabled ? (
    <OrbitControls
      ref={orbitRef}
      target={view.target}
      enableDamping
      dampingFactor={0.08}
      maxDistance={30}
      minDistance={2}
    />
  ) : null
}

export function PlataformaPontonInteractiveExperience({
  modelName,
  className,
}: PlataformaPontonInteractiveExperienceProps) {
  const [actions, setActions] = useState<Record<string, THREE.AnimationAction | null>>({})
  const [puertaAbierta, setPuertaAbierta] = useState(false)
  const [s1Arriba, setS1Arriba] = useState(false)
  const [s2Arriba, setS2Arriba] = useState(false)
  const [vista, setVista] = useState<CameraPreset>('orbital')
  // Control de viento — afecta olas + boyas + cuerdas + frecuencia de splashes
  const [viento, setViento] = useState<'calma' | 'brisa' | 'fuerte'>('brisa')
  const windConfig = {
    calma: { strength: 0.35, label: 'Calma' },
    brisa: { strength: 1.0, label: 'Brisa' },
    fuerte: { strength: 1.8, label: 'Marejada' },
  } as const

  // Triggers de splash cuando se levanta cada sistema
  const [splashS1, setSplashS1] = useState(0)
  const [splashS2, setSplashS2] = useState(0)

  const playAction = (name: string, reverse = false) => {
    const action = actions[name]
    if (!action) {
      console.warn(`Animación "${name}" no encontrada. Disponibles:`, Object.keys(actions))
      return
    }
    Object.values(actions).forEach((a) => {
      if (a && a.isRunning()) a.stop()
    })
    action.reset()
    action.setLoop(THREE.LoopOnce, 1)
    action.clampWhenFinished = true
    if (reverse) {
      // Reproducir hacia atrás: empezar desde el final del clip
      action.timeScale = -1
      action.time = action.getClip().duration
    } else {
      action.timeScale = 1
      action.time = 0
    }
    action.play()
  }

  const togglePuerta = () => {
    // Solo hay "Abrir_Puerta" → reproducir reverse para cerrar
    playAction('Abrir_Puerta', puertaAbierta)
    setPuertaAbierta((v) => !v)
  }

  const toggleSistema1 = () => {
    playAction('Subir_Sistema_1', s1Arriba)
    setS1Arriba((v) => !v)
    // Splash en el ducto V2a (X=1.2 Blender → x=1.2 three; Y_blender=0.92 → y=0.92; Z_blender=0.5 → z=-0.92)
    setSplashS1((k) => k + 1)
  }

  const toggleSistema2 = () => {
    playAction('Subir_Sistema_2', s2Arriba)
    setS2Arriba((v) => !v)
    // Splash en el ducto V2b
    setSplashS2((k) => k + 1)
  }

  const currentView = useMemo(() => CAMERA_VIEWS[vista], [vista])
  const animationNames = Object.keys(actions)

  return (
    <div className={cn('flex h-full flex-col bg-card', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b bg-card/95 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Plataforma Pontón Acopio</h2>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Interactivo
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {modelName}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={puertaAbierta ? 'default' : 'outline'}
            onClick={togglePuerta}
            className="gap-1.5"
          >
            <DoorOpen className="h-4 w-4" />
            {puertaAbierta ? 'Cerrar puerta' : 'Abrir puerta'}
          </Button>
          <Button
            size="sm"
            variant={s1Arriba ? 'default' : 'outline'}
            onClick={toggleSistema1}
            className="gap-1.5"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            {s1Arriba
              ? 'Bajar ducto bomba flujo sistema 1'
              : 'Levantar ducto bomba flujo sistema 1'}
          </Button>
          <Button
            size="sm"
            variant={s2Arriba ? 'default' : 'outline'}
            onClick={toggleSistema2}
            className="gap-1.5"
          >
            <ArrowUpFromLine className="h-4 w-4" />
            {s2Arriba
              ? 'Bajar ducto bomba flujo sistema 2'
              : 'Levantar ducto bomba flujo sistema 2'}
          </Button>
        </div>
      </div>

      {/* Selector de vista */}
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/40 px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5" />
          Vista:
        </span>
        {(Object.keys(CAMERA_VIEWS) as CameraPreset[]).map((id) => (
          <Button
            key={id}
            size="sm"
            variant={vista === id ? 'default' : 'ghost'}
            onClick={() => setVista(id)}
            className="h-7 gap-1.5 px-2 text-[11px]"
          >
            {id === 'orbital' ? <Compass className="h-3.5 w-3.5" /> : null}
            {CAMERA_VIEWS[id].label}
          </Button>
        ))}
      </div>

      {/* Selector de viento (afecta agua + boyas) */}
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5">
        <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5" />
          Viento:
        </span>
        {(Object.keys(windConfig) as Array<keyof typeof windConfig>).map((id) => (
          <Button
            key={id}
            size="sm"
            variant={viento === id ? 'default' : 'ghost'}
            onClick={() => setViento(id)}
            className="h-6 px-2 text-[10px]"
          >
            {windConfig[id].label}
          </Button>
        ))}
      </div>

      <div className="relative flex-1">
        <Canvas
          shadows
          camera={{ position: currentView.position, fov: 45 }}
          gl={{
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.15,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
          dpr={[1, 2]}
        >
          {/* Fondo gris Blender + niebla suave */}
          <color attach="background" args={['#3a3a3a']} />
          <fog attach="fog" args={['#3a3a3a', 22, 55]} />

          {/* Cuadrícula tipo Blender (líneas X/Y) — divisiones de 1m */}
          <Grid
            position={[0, -0.5, 0]}
            args={[40, 40]}
            cellSize={1}
            cellThickness={0.6}
            cellColor="#6c6c6c"
            sectionSize={5}
            sectionThickness={1.2}
            sectionColor="#9a9a9a"
            fadeDistance={30}
            fadeStrength={1.5}
            followCamera={false}
            infiniteGrid
          />

          {/* Iluminación base reducida — el HDR Environment hace el trabajo principal */}
          <ambientLight intensity={0.25} />

          {/* Sol principal — sombra dura proyectada */}
          <directionalLight
            position={[8, 12, 6]}
            intensity={1.1}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-bias={-0.0005}
            shadow-normalBias={0.02}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={10}
            shadow-camera-bottom={-10}
            shadow-camera-near={0.1}
            shadow-camera-far={40}
          />
          {/* Fill light frío opuesto */}
          <directionalLight position={[-5, 5, -5]} intensity={0.25} color="#aac4ff" />

          <Suspense
            fallback={
              <Html center>
                <div className="rounded bg-background/90 px-3 py-2 text-xs">Cargando modelo…</div>
              </Html>
            }
          >
            <PontonModel onActionsReady={setActions} />
            {/* HDR environment Bosque solo para iluminación/reflejos (NO como background) */}
            <Environment preset="forest" background={false} environmentIntensity={1.1} />

            {/* Agua reflectiva — tamaño real del Blender (20×20m centrada en 0,-2 Blender → 0,2 three) */}
            <AnimatedWater
              position={[0, -0.05, 2]}
              size={20}
              windStrength={windConfig[viento].strength}
              windDirection={0.6}
            />

            {/* Boyas flotando con física real (siguen altura del agua + tilt según pendiente) */}
            <WindyBuoys
              windStrength={windConfig[viento].strength}
              waterCenter={[0, -0.05, 2]}
              windDirection={0.6}
            />

            {/* Sway en cuerdas con viento */}
            <WindyRopes windStrength={windConfig[viento].strength} />

            {/* Salpicaduras continuas alrededor del casco */}
            <HullSplashes windStrength={windConfig[viento].strength} />

            {/* Splash al levantar/bajar ducto V2a */}
            <SplashBurst
              origin={[1.2, 0.05, -1.0]}
              triggerKey={splashS1}
              count={50}
              velocityScale={1.2}
            />

            {/* Splash al levantar/bajar ducto V2b */}
            <SplashBurst
              origin={[1.8, 0.05, -1.0]}
              triggerKey={splashS2}
              count={50}
              velocityScale={1.2}
            />

            {/* Sombra de contacto bajo la plataforma (suelo del pontón ~Z=1.4 en Blender = y=1.4 en three) */}
            <ContactShadows
              position={[1.5, 1.38, -0.5]}
              opacity={0.55}
              scale={12}
              blur={2.4}
              far={2.5}
              resolution={1024}
              color="#000000"
            />
          </Suspense>

          <CameraController view={currentView} orbitEnabled={vista === 'orbital'} />
        </Canvas>

        {animationNames.length === 0 ? (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-amber-500/15 px-2 py-1 text-[10px] text-amber-700">
            Esperando animaciones…
          </div>
        ) : (
          <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-700">
            {animationNames.length} animaciones cargadas
          </div>
        )}
      </div>
    </div>
  )
}
