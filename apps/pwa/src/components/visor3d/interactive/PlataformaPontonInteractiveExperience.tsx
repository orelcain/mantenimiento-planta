import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, useGLTF, useAnimations, Environment, Html } from '@react-three/drei'
import * as THREE from 'three'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { Camera, Compass, DoorOpen, ArrowUpFromLine } from 'lucide-react'

const GLB_URL = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/models3d/plataforma_ponton.glb`

interface PlataformaPontonInteractiveExperienceProps {
  modelName: string
  className?: string
}

type CameraPreset = 'orbital' | 'interior' | 'frontal' | 'cerca'

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
    target: [1.5, 1.0, -0.5],
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

  // Mejorar materiales del modelo
  useEffect(() => {
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true
        obj.receiveShadow = true
      }
    })
  }, [scene])

  return <primitive ref={groupRef} object={scene} />
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
    // Solo hay "Subir_Sistema_1" → reproducir reverse para bajar
    playAction('Subir_Sistema_1', s1Arriba)
    setS1Arriba((v) => !v)
  }

  const toggleSistema2 = () => {
    playAction('Subir_Sistema_2', s2Arriba)
    setS2Arriba((v) => !v)
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

      <div className="relative flex-1">
        <Canvas
          shadows
          camera={{ position: currentView.position, fov: 45 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        >
          <color attach="background" args={['#7a8a9a']} />
          <fog attach="fog" args={['#7a8a9a', 25, 60]} />
          <ambientLight intensity={0.45} />
          <directionalLight
            position={[8, 12, 6]}
            intensity={1.0}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-5, 5, -5]} intensity={0.3} />

          <Suspense
            fallback={
              <Html center>
                <div className="rounded bg-background/90 px-3 py-2 text-xs">Cargando modelo…</div>
              </Html>
            }
          >
            <PontonModel onActionsReady={setActions} />
            <Environment preset="sunset" background={false} />
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
