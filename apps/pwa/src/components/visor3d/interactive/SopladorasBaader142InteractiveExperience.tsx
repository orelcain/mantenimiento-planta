import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { AirVent, Gauge, Settings2, Workflow } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Viewer3D } from '@/components/visor3d/Viewer3D'
import { useViewer3DModelContext } from '@/components/visor3d/Viewer3DModelContext'
import { cn } from '@/lib/utils'
import type { Model3DFormat } from '@/types/models3d'

type OperatingMode = 'produccion' | 'lavado' | 'mantencion'
type BackupMode = 'auto' | 'manual' | 'off'
type BlowerStatus = 'operativa' | 'revision' | 'detenida'
type ValveStatus = 'abierta' | 'cerrada'
type BlowerId = 'S1' | 'S2' | 'S3' | 'S4'
type ValveId = 'VM1' | 'VM2' | 'VB1' | 'VB2'
type FocusedAssetId = BlowerId | ValveId

interface BlowerState {
  id: BlowerId
  label: string
  zone: string
  baseFlow: number
  status: BlowerStatus
}

interface ValveState {
  id: ValveId
  label: string
  zone: string
  kind: 'mariposa' | 'bola'
  status: ValveStatus
  affects: BlowerId[]
}

interface SopladorasBaader142InteractiveExperienceProps {
  modelName: string
  className?: string
  modelUrl?: string
  modelFormat?: Model3DFormat
}

interface InteractiveNodeDefinition {
  id: FocusedAssetId
  label: string
  kind: 'blower' | 'valve'
  zone: string
  keywords: string[]
  fallback: [number, number, number]
}

interface ResolvedInteractiveNode extends InteractiveNodeDefinition {
  position: THREE.Vector3
  source: 'object' | 'fallback'
  objectName?: string
  objectRef?: THREE.Object3D
}

interface ModelActionLink {
  assetId: FocusedAssetId
  action: 'toggle-blower' | 'toggle-valve'
  transform: 'emissive' | 'rotate-y' | 'rotate-z'
  activeLabel: string
  inactiveLabel: string
  notes: string
}

type ResolvedNodeMeta = Partial<Record<FocusedAssetId, { source: 'object' | 'fallback'; objectName?: string; objectRef?: THREE.Object3D }>>

interface SceneObjectCandidate {
  text: string
  center: THREE.Vector3
  objectName: string
  object: THREE.Object3D
  objectType: 'group' | 'mesh'
}

const STATUS_ORDER: BlowerStatus[] = ['operativa', 'revision', 'detenida']

const STATUS_STYLES: Record<BlowerStatus, string> = {
  operativa: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  revision: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  detenida: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const MODE_COPY: Record<OperatingMode, { title: string; summary: string; checklist: string[] }> = {
  produccion: {
    title: 'Produccion activa',
    summary: 'Prioriza continuidad de soplado, balance de flujo y respuesta rapida ante una unidad degradada.',
    checklist: [
      'Confirmar sopladora lider y respaldo inmediato.',
      'Verificar continuidad de aire hacia las lineas habilitadas.',
      'Revisar caida de caudal si una valvula queda parcialmente cerrada.',
    ],
  },
  lavado: {
    title: 'Lavado y limpieza',
    summary: 'Permite aislar sectores mediante valvulas sin perder visibilidad del aire disponible en la red.',
    checklist: [
      'Cerrar el tramo intervenido antes de abrir resguardos.',
      'Mantener al menos una ruta activa de respaldo si la linea lo requiere.',
      'Validar retorno gradual de caudal despues del lavado.',
    ],
  },
  mantencion: {
    title: 'Mantencion controlada',
    summary: 'Sirve para ensayar bloqueo de equipos y confirmar que la configuracion deje ductos aislados.',
    checklist: [
      'Bloquear la sopladora intervenida y confirmar valvulas de aislamiento.',
      'Verificar que no queden ductos con flujo accidental.',
      'Probar retorno seguro y recuperar flujo por tramo.',
    ],
  },
}

const MODE_FLOW_FACTOR: Record<OperatingMode, number> = {
  produccion: 1,
  lavado: 0.72,
  mantencion: 0.45,
}

const INITIAL_BLOWERS: BlowerState[] = [
  { id: 'S1', label: 'Sopladora 1', zone: 'Cabecera norte', baseFlow: 92, status: 'operativa' },
  { id: 'S2', label: 'Sopladora 2', zone: 'Cabecera centro', baseFlow: 89, status: 'operativa' },
  { id: 'S3', label: 'Sopladora 3', zone: 'Cabecera sur', baseFlow: 76, status: 'revision' },
  { id: 'S4', label: 'Sopladora 4', zone: 'Respaldo de linea', baseFlow: 84, status: 'detenida' },
]

const INITIAL_VALVES: ValveState[] = [
  { id: 'VM1', label: 'Valvula mariposa norte', zone: 'Cabecera norte', kind: 'mariposa', status: 'abierta', affects: ['S1', 'S2'] },
  { id: 'VM2', label: 'Valvula mariposa sur', zone: 'Cabecera sur', kind: 'mariposa', status: 'abierta', affects: ['S3', 'S4'] },
  { id: 'VB1', label: 'Llave de bola linea A', zone: 'Linea A', kind: 'bola', status: 'abierta', affects: ['S1', 'S2'] },
  { id: 'VB2', label: 'Llave de bola linea B', zone: 'Linea B', kind: 'bola', status: 'cerrada', affects: ['S3', 'S4'] },
]

const BLOWER_VALVE_DEPENDENCIES: Record<BlowerId, ValveId[]> = {
  S1: ['VM1', 'VB1'],
  S2: ['VM1', 'VB1'],
  S3: ['VM2', 'VB2'],
  S4: ['VM2', 'VB2'],
}

const INTERACTIVE_NODE_DEFINITIONS: InteractiveNodeDefinition[] = [
  { id: 'S1', label: 'Sopladora 1', kind: 'blower', zone: 'Cabecera norte', keywords: ['sopladora 1', 'blower 1', 's1'], fallback: [0.18, 0.72, 0.26] },
  { id: 'S2', label: 'Sopladora 2', kind: 'blower', zone: 'Cabecera centro', keywords: ['sopladora 2', 'blower 2', 's2'], fallback: [0.40, 0.72, 0.34] },
  { id: 'S3', label: 'Sopladora 3', kind: 'blower', zone: 'Cabecera sur', keywords: ['sopladora 3', 'blower 3', 's3'], fallback: [0.64, 0.70, 0.44] },
  { id: 'S4', label: 'Sopladora 4', kind: 'blower', zone: 'Respaldo de linea', keywords: ['sopladora 4', 'blower 4', 's4'], fallback: [0.84, 0.68, 0.56] },
  { id: 'VM1', label: 'Valvula mariposa norte', kind: 'valve', zone: 'Cabecera norte', keywords: ['mariposa norte', 'valvula mariposa 1', 'vm1'], fallback: [0.28, 0.62, 0.24] },
  { id: 'VM2', label: 'Valvula mariposa sur', kind: 'valve', zone: 'Cabecera sur', keywords: ['mariposa sur', 'valvula mariposa 2', 'vm2'], fallback: [0.60, 0.60, 0.40] },
  { id: 'VB1', label: 'Llave de bola linea A', kind: 'valve', zone: 'Linea A', keywords: ['bola linea a', 'llave de bola 1', 'vb1'], fallback: [0.34, 0.50, 0.29] },
  { id: 'VB2', label: 'Llave de bola linea B', kind: 'valve', zone: 'Linea B', keywords: ['bola linea b', 'llave de bola 2', 'vb2'], fallback: [0.72, 0.48, 0.49] },
]

const MODEL_ACTION_LINKS: Record<FocusedAssetId, ModelActionLink> = {
  S1: { assetId: 'S1', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 1 y habilita su flujo si las valvulas dependientes estan abiertas.' },
  S2: { assetId: 'S2', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 2 y habilita su flujo si las valvulas dependientes estan abiertas.' },
  S3: { assetId: 'S3', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 3 y habilita su flujo si las valvulas dependientes estan abiertas.' },
  S4: { assetId: 'S4', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 4 como unidad de respaldo o apoyo manual.' },
  VM1: { assetId: 'VM1', action: 'toggle-valve', transform: 'rotate-y', activeLabel: 'Abierta', inactiveLabel: 'Cerrada', notes: 'La mariposa norte abre o corta el flujo del header norte.' },
  VM2: { assetId: 'VM2', action: 'toggle-valve', transform: 'rotate-y', activeLabel: 'Abierta', inactiveLabel: 'Cerrada', notes: 'La mariposa sur abre o corta el flujo del header sur.' },
  VB1: { assetId: 'VB1', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'La llave de bola A indica paso abierto en vertical y paso cerrado en horizontal.' },
  VB2: { assetId: 'VB2', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'La llave de bola B indica paso abierto en vertical y paso cerrado en horizontal.' },
}

function nextStatus(currentStatus: BlowerStatus): BlowerStatus {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus)
  return STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length]!
}

function toggleValveStatus(currentStatus: ValveStatus): ValveStatus {
  return currentStatus === 'abierta' ? 'cerrada' : 'abierta'
}

function toggleBlowerPower(currentStatus: BlowerStatus): BlowerStatus {
  return currentStatus === 'operativa' ? 'detenida' : 'operativa'
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function getFallbackPosition(fallback: [number, number, number], info: { size: THREE.Vector3 } | null): THREE.Vector3 {
  if (!info) return new THREE.Vector3()

  return new THREE.Vector3(
    -info.size.x / 2 + fallback[0] * info.size.x,
    fallback[1] * info.size.y,
    -info.size.z / 2 + fallback[2] * info.size.z,
  )
}

function scoreCandidate(candidate: SceneObjectCandidate, node: InteractiveNodeDefinition): number {
  const matches = node.keywords.reduce((count, keyword) => (
    candidate.text.includes(normalizeSearchText(keyword)) ? count + 1 : count
  ), 0)
  const typeBonus = candidate.objectType === 'group' ? 4 : 1
  return matches * 10 + typeBonus
}

function resolveInteractiveNodes(object: THREE.Object3D | null, info: { size: THREE.Vector3 } | null): ResolvedInteractiveNode[] {
  const candidates: SceneObjectCandidate[] = []

  if (object) {
    const allNamedObjects: string[] = []
    object.traverse((child) => {
      if (child === object) return
      const objectName = child.name || child.userData.stableMeshId || ''
      if (!objectName) return

      const box = new THREE.Box3().setFromObject(child)
      if (box.isEmpty()) return

      const hierarchyTrail: string[] = []
      let currentParent = child.parent
      let safety = 0
      while (currentParent && currentParent !== object && safety < 6) {
        if (currentParent.name) hierarchyTrail.push(currentParent.name)
        currentParent = currentParent.parent
        safety += 1
      }

      const text = normalizeSearchText(`${child.name} ${child.userData.stableMeshId ?? ''} ${hierarchyTrail.join(' ')}`)
      const typeLabel = child instanceof THREE.Mesh ? 'mesh' : 'group'
      allNamedObjects.push(`${typeLabel}: ${objectName}`)

      candidates.push({
        text,
        center: box.getCenter(new THREE.Vector3()),
        objectName,
        object: child,
        objectType: child instanceof THREE.Mesh ? 'mesh' : 'group',
      })
    })

    if (allNamedObjects.length > 0) {
      console.groupCollapsed(`[Sopladoras GLB] ${allNamedObjects.length} objetos nombrados detectados`)
      allNamedObjects.forEach((item, index) => console.log(`  ${index}: ${item}`))
      console.groupEnd()
    }
  }

  const usedCandidateIndexes = new Set<number>()

  return INTERACTIVE_NODE_DEFINITIONS.map((node) => {
    const candidateIndex = candidates
      .map((candidate, index) => ({ candidate, index, score: scoreCandidate(candidate, node) }))
      .filter(({ index, score }) => !usedCandidateIndexes.has(index) && score > 0)
      .sort((left, right) => right.score - left.score)[0]?.index ?? -1

    if (candidateIndex >= 0) {
      usedCandidateIndexes.add(candidateIndex)
      const candidate = candidates[candidateIndex]!
      return {
        ...node,
        position: candidate.center.clone(),
        source: 'object' as const,
        objectName: candidate.objectName,
        objectRef: candidate.object,
      }
    }

    return { ...node, position: getFallbackPosition(node.fallback, info), source: 'fallback' as const }
  })
}

function formatPercent(value: number): string {
  return `${Math.max(0, Math.round(value))}%`
}

function getBlowerStatusColor(status: BlowerStatus): string {
  if (status === 'operativa') return '#22c55e'
  if (status === 'revision') return '#f59e0b'
  return '#ef4444'
}

function getValveStatusColor(status: ValveStatus): string {
  return status === 'abierta' ? '#38bdf8' : '#ef4444'
}

function getPrimaryBackupTarget(blowers: BlowerState[], flowByBlower: Record<BlowerId, number>): BlowerId | null {
  const primaryIds: BlowerId[] = ['S1', 'S2', 'S3']
  const failedPrimary = primaryIds.find((blowerId) => {
    const blower = blowers.find((item) => item.id === blowerId)
    if (!blower) return false
    return blower.status !== 'operativa' || flowByBlower[blowerId] <= 0
  })

  return failedPrimary ?? null
}

function FlowPulse({ start, end, color, speed = 0.3, delay = 0 }: { start: THREE.Vector3; end: THREE.Vector3; color: string; speed?: number; delay?: number }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const t = (clock.getElapsedTime() * speed + delay) % 1
    meshRef.current.position.lerpVectors(start, end, t)
  })

  return (
    <mesh ref={meshRef} position={start}>
      <sphereGeometry args={[0.04, 12, 12]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
    </mesh>
  )
}

function InteractiveAssetProxy({
  node,
  color,
  selected,
  isActive,
  onClick,
}: {
  node: ResolvedInteractiveNode
  color: string
  selected: boolean
  isActive: boolean
  onClick: () => void
}) {
  const coreRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const fanGroupRef = useRef<THREE.Group>(null)
  const leverRef = useRef<THREE.Mesh>(null)
  const discRef = useRef<THREE.Mesh>(null)
  const [hovered, setHovered] = useState(false)

  useFrame(({ clock }) => {
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 2.4) * 0.08
    if (coreRef.current) {
      const scale = selected ? 1.18 : hovered ? 1.1 : 1
      coreRef.current.scale.setScalar(scale * pulse)
    }
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1 + Math.sin(clock.getElapsedTime() * 2.8) * 0.18)
    }

    if (node.kind === 'blower' && fanGroupRef.current) {
      fanGroupRef.current.rotation.z += isActive ? 0.08 : 0.01
    }

    if (node.kind === 'valve' && leverRef.current) {
      const targetRotation = isActive ? Math.PI / 2 : 0
      leverRef.current.rotation.z = THREE.MathUtils.lerp(leverRef.current.rotation.z, targetRotation, 0.14)
    }

    if (node.kind === 'valve' && discRef.current) {
      const targetRotation = isActive ? Math.PI / 2 : 0
      discRef.current.rotation.y = THREE.MathUtils.lerp(discRef.current.rotation.y, targetRotation, 0.14)
    }
  })

  const labelClassName = selected ? 'border-primary bg-background/95 text-foreground' : 'border-white/10 bg-background/85 text-muted-foreground'

  return (
    <group
      position={node.position}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <ringGeometry args={[0.12, 0.18, 24]} />
        <meshStandardMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.085, 20, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected || hovered ? 0.8 : 0.35} />
      </mesh>

      {node.kind === 'blower' ? (
        <group ref={fanGroupRef}>
          {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((rotation) => (
            <mesh key={rotation} rotation={[0, 0, rotation]} position={[0, 0, 0.01]}>
              <boxGeometry args={[0.13, 0.025, 0.015]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={isActive ? 0.8 : 0.25} />
            </mesh>
          ))}
        </group>
      ) : node.id.startsWith('VM') ? (
        <group>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.12, 0.02, 12, 24]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.35} roughness={0.45} />
          </mesh>
          <mesh ref={discRef}>
            <cylinderGeometry args={[0.08, 0.08, 0.02, 20]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
        </group>
      ) : (
        <group>
          <mesh>
            <sphereGeometry args={[0.07, 18, 18]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.25} roughness={0.55} />
          </mesh>
          <mesh ref={leverRef} position={[0, 0.13, 0]}>
            <boxGeometry args={[0.02, 0.18, 0.02]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
          </mesh>
        </group>
      )}

      <Html position={[0, 0.18, 0]} center distanceFactor={8} zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          className={cn('rounded-full border px-2 py-1 text-[10px] font-semibold shadow-lg backdrop-blur transition-colors', labelClassName)}
        >
          {node.kind === 'blower' ? `${node.label} ${isActive ? 'ON' : 'OFF'}` : `${node.label} ${isActive ? 'OPEN' : 'CLOSE'}`}
        </button>
      </Html>
    </group>
  )
}

/**
 * Builds a lookup map from stableMeshId → nodeId by traversing
 * each resolved node's meshRef and collecting all descendant meshes.
 */
function buildMeshToNodeMap(
  resolvedNodes: ResolvedInteractiveNode[],
  modelObject: THREE.Object3D | null,
): Map<string, FocusedAssetId> {
  const map = new Map<string, FocusedAssetId>()
  for (const node of resolvedNodes) {
    if (!node.objectRef) continue
    node.objectRef.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.stableMeshId) {
        map.set(child.userData.stableMeshId, node.id)
      }
    })
    if (node.objectRef instanceof THREE.Mesh && node.objectRef.userData.stableMeshId) {
      map.set(node.objectRef.userData.stableMeshId, node.id)
    }
    if (node.objectRef.parent) {
      node.objectRef.parent.traverse((child) => {
        if (child instanceof THREE.Mesh && child.userData.stableMeshId) {
          map.set(child.userData.stableMeshId, node.id)
        }
      })
    }
  }
  // Proximity-based fallback: for meshes not already mapped, check if they
  // are very close to a resolved node position and assign them.
  if (modelObject) {
    modelObject.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const sid = child.userData.stableMeshId as string | undefined
      if (!sid || map.has(sid)) return
      const box = new THREE.Box3().setFromObject(child)
      if (box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3())
      let bestDist = 0.35 // max proximity threshold
      let bestNodeId: FocusedAssetId | null = null
      for (const node of resolvedNodes) {
        const d = center.distanceTo(node.position)
        if (d < bestDist) {
          bestDist = d
          bestNodeId = node.id
        }
      }
      if (bestNodeId) map.set(sid, bestNodeId)
    })
  }
  return map
}

/**
 * Click handler that intercepts clicks on real model meshes and
 * maps them to the corresponding interactive node.
 */
function MeshClickHandler({
  meshToNodeMap,
  onToggleBlower,
  onToggleValve,
}: {
  meshToNodeMap: Map<string, FocusedAssetId>
  onToggleBlower: (blowerId: BlowerId) => void
  onToggleValve: (valveId: ValveId) => void
}) {
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())

  useEffect(() => {
    const canvas = gl.domElement
    const handleClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.current.setFromCamera(mouse, camera)
      const intersects = raycaster.current.intersectObjects(scene.children, true)
      for (const hit of intersects) {
        if (!(hit.object instanceof THREE.Mesh)) continue
        const sid = hit.object.userData.stableMeshId as string | undefined
        if (!sid) continue
        const nodeId = meshToNodeMap.get(sid)
        if (!nodeId) continue
        // Dispatch action
        if (nodeId.startsWith('S')) {
          onToggleBlower(nodeId as BlowerId)
        } else {
          onToggleValve(nodeId as ValveId)
        }
        break
      }
    }
    canvas.addEventListener('dblclick', handleClick)
    return () => canvas.removeEventListener('dblclick', handleClick)
  }, [camera, scene, gl, meshToNodeMap, onToggleBlower, onToggleValve])

  return null
}

/**
 * Applies real-time visual effects to the actual GLB meshes:
 * - Blowers: color/emissive change based on on/off status
 * - Valves: rotation change based on open/close status
 */
function RealMeshEffects({
  resolvedNodes,
  blowers,
  valves,
}: {
  resolvedNodes: ResolvedInteractiveNode[]
  blowers: BlowerState[]
  valves: ValveState[]
}) {
  // Store original materials to restore when needed
  const originalMaterials = useRef(new Map<string, THREE.Material | THREE.Material[]>())

  // Apply blower effects
  useEffect(() => {
    for (const node of resolvedNodes) {
      if (node.kind !== 'blower' || !node.objectRef) continue
      const blower = blowers.find((b) => b.id === node.id)
      if (!blower) continue

      const color = getBlowerStatusColor(blower.status)

      node.objectRef.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const key = child.uuid
        if (!originalMaterials.current.has(key)) {
          originalMaterials.current.set(key, Array.isArray(child.material) ? child.material.map((m) => m.clone()) : child.material.clone())
        }
        const mat = child.material
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.emissive.set(color)
          mat.emissiveIntensity = blower.status === 'operativa' ? 0.35 : blower.status === 'revision' ? 0.2 : 0.15
          mat.needsUpdate = true
        }
      })
    }
  }, [resolvedNodes, blowers])

  // Apply valve effects
  useFrame(() => {
    for (const node of resolvedNodes) {
      if (node.kind !== 'valve' || !node.objectRef) continue
      const valve = valves.find((v) => v.id === node.id)
      if (!valve) continue
      const actionLink = MODEL_ACTION_LINKS[node.id]

      const isOpen = valve.status === 'abierta'
      const targetAngle = isOpen ? 0 : Math.PI / 2

      if (actionLink?.transform === 'rotate-y') {
        node.objectRef.rotation.y = THREE.MathUtils.lerp(node.objectRef.rotation.y, targetAngle, 0.08)
      } else if (actionLink?.transform === 'rotate-z') {
        node.objectRef.rotation.z = THREE.MathUtils.lerp(node.objectRef.rotation.z, targetAngle, 0.08)
      }

      const color = getValveStatusColor(valve.status)
      node.objectRef.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const key = child.uuid
        if (!originalMaterials.current.has(key)) {
          originalMaterials.current.set(key, Array.isArray(child.material) ? child.material.map((m) => m.clone()) : child.material.clone())
        }
        const mat = child.material
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.emissive.set(color)
          mat.emissiveIntensity = 0.2
          mat.needsUpdate = true
        }
      })
    }
  })

  return null
}

function SopladorasBaader142InteractiveCanvasOverlay({
  blowers,
  valves,
  flowByBlower,
  backupTarget,
  focusedAssetId,
  onToggleBlower,
  onToggleValve,
  onResolvedNodesChange,
}: {
  blowers: BlowerState[]
  valves: ValveState[]
  flowByBlower: Record<BlowerId, number>
  backupTarget: BlowerId | null
  focusedAssetId: FocusedAssetId
  onToggleBlower: (blowerId: BlowerId) => void
  onToggleValve: (valveId: ValveId) => void
  onResolvedNodesChange?: (meta: ResolvedNodeMeta) => void
}) {
  const { object, info } = useViewer3DModelContext()

  const resolvedNodes = useMemo(() => resolveInteractiveNodes(object, info), [object, info])

  useEffect(() => {
    if (!onResolvedNodesChange) return
    const nextMeta = resolvedNodes.reduce<ResolvedNodeMeta>((acc, node) => {
      acc[node.id] = { source: node.source, objectName: node.objectName, objectRef: node.objectRef }
      return acc
    }, {})
    onResolvedNodesChange(nextMeta)
  }, [onResolvedNodesChange, resolvedNodes])

  const nodeMap = useMemo(() => new Map(resolvedNodes.map((node) => [node.id, node])), [resolvedNodes])

  const anchors = useMemo(() => {
    if (!info) return null
    return {
      supply: getFallbackPosition([0.07, 0.42, 0.19], info),
      outletA: getFallbackPosition([0.18, 0.82, 0.12], info),
      outletB: getFallbackPosition([0.44, 0.82, 0.18], info),
      outletC: getFallbackPosition([0.70, 0.82, 0.30], info),
      outletBackup: getFallbackPosition([0.88, 0.82, 0.40], info),
      backupHeader: getFallbackPosition([0.78, 0.58, 0.34], info),
    }
  }, [info])

  const hasNorthFlow = flowByBlower.S1 > 0 || flowByBlower.S2 > 0
  const hasSouthFlow = flowByBlower.S3 > 0 || flowByBlower.S4 > 0
  const backupActive = !!backupTarget && flowByBlower.S4 > 0

  const segments = useMemo(() => {
    if (!anchors) return []

    const vm1 = nodeMap.get('VM1')
    const vm2 = nodeMap.get('VM2')
    const vb1 = nodeMap.get('VB1')
    const vb2 = nodeMap.get('VB2')
    const s1 = nodeMap.get('S1')
    const s2 = nodeMap.get('S2')
    const s3 = nodeMap.get('S3')
    const s4 = nodeMap.get('S4')

    return [
      s1 && vm1 && { id: 's1-vm1', start: s1.position, end: vm1.position, active: flowByBlower.S1 > 0, color: '#38bdf8' },
      s2 && vm1 && { id: 's2-vm1', start: s2.position, end: vm1.position, active: flowByBlower.S2 > 0, color: '#38bdf8' },
      vm1 && vb1 && { id: 'vm1-vb1', start: vm1.position, end: vb1.position, active: hasNorthFlow, color: '#38bdf8' },
      vb1 && { id: 'vb1-out-a', start: vb1.position, end: anchors.outletA, active: flowByBlower.S1 > 0, color: '#38bdf8' },
      vb1 && { id: 'vb1-out-b', start: vb1.position, end: anchors.outletB, active: flowByBlower.S2 > 0, color: '#38bdf8' },
      s3 && vm2 && { id: 's3-vm2', start: s3.position, end: vm2.position, active: flowByBlower.S3 > 0, color: '#38bdf8' },
      s4 && vm2 && { id: 's4-vm2', start: s4.position, end: vm2.position, active: flowByBlower.S4 > 0 && !backupActive, color: '#38bdf8' },
      vm2 && vb2 && { id: 'vm2-vb2', start: vm2.position, end: vb2.position, active: hasSouthFlow && !backupActive, color: '#38bdf8' },
      vb2 && { id: 'vb2-out-c', start: vb2.position, end: anchors.outletC, active: flowByBlower.S3 > 0, color: '#38bdf8' },
      vb2 && { id: 'vb2-out-d', start: vb2.position, end: anchors.outletBackup, active: flowByBlower.S4 > 0 && !backupActive, color: '#38bdf8' },
      s4 && backupActive && { id: 's4-backup-head', start: s4.position, end: anchors.backupHeader, active: true, color: '#a78bfa' },
      backupActive && backupTarget === 'S1' && { id: 'backup-s1', start: anchors.backupHeader, end: anchors.outletA, active: true, color: '#a78bfa' },
      backupActive && backupTarget === 'S2' && { id: 'backup-s2', start: anchors.backupHeader, end: anchors.outletB, active: true, color: '#a78bfa' },
      backupActive && backupTarget === 'S3' && { id: 'backup-s3', start: anchors.backupHeader, end: anchors.outletC, active: true, color: '#a78bfa' },
    ].filter(Boolean) as Array<{ id: string; start: THREE.Vector3; end: THREE.Vector3; active: boolean; color: string }>
  }, [anchors, backupActive, backupTarget, flowByBlower, hasNorthFlow, hasSouthFlow, nodeMap])

  if (!anchors) return null

  const meshToNodeMap = buildMeshToNodeMap(resolvedNodes, object)

  return (
    <>
      <MeshClickHandler
        meshToNodeMap={meshToNodeMap}
        onToggleBlower={onToggleBlower}
        onToggleValve={onToggleValve}
      />
      <RealMeshEffects
        resolvedNodes={resolvedNodes}
        blowers={blowers}
        valves={valves}
      />

      {segments.map((segment, index) => {
        const color = segment.active ? segment.color : '#475569'
        return (
          <group key={segment.id}>
            <Line points={[segment.start, segment.end]} color={color} lineWidth={segment.active ? 2.4 : 1.2} />
            {segment.active && <FlowPulse start={segment.start} end={segment.end} color={color} speed={0.26 + index * 0.02} delay={index * 0.12} />}
          </group>
        )
      })}

      {resolvedNodes.map((node) => {
        if (node.kind === 'blower') {
          const blower = blowers.find((item) => item.id === node.id)
          if (!blower) return null
          return <InteractiveAssetProxy key={node.id} node={node} color={getBlowerStatusColor(blower.status)} selected={focusedAssetId === node.id} isActive={blower.status === 'operativa'} onClick={() => onToggleBlower(node.id as BlowerId)} />
        }

        const valve = valves.find((item) => item.id === node.id)
        if (!valve) return null
        return <InteractiveAssetProxy key={node.id} node={node} color={getValveStatusColor(valve.status)} selected={focusedAssetId === node.id} isActive={valve.status === 'abierta'} onClick={() => onToggleValve(node.id as ValveId)} />
      })}
    </>
  )
}

function StandalonePanel({ modelName, className }: Pick<SopladorasBaader142InteractiveExperienceProps, 'modelName' | 'className'>) {
  const [mode, setMode] = useState<OperatingMode>('produccion')
  const [selectedBlowerId, setSelectedBlowerId] = useState<BlowerId>('S1')
  const [blowers, setBlowers] = useState<BlowerState[]>(INITIAL_BLOWERS)

  const selectedBlower = useMemo(() => blowers.find((blower) => blower.id === selectedBlowerId) ?? blowers[0]!, [blowers, selectedBlowerId])
  const activeSummary = MODE_COPY[mode]

  const handleCycleStatus = useCallback((blowerId: BlowerId) => {
    setBlowers((currentBlowers) => currentBlowers.map((blower) => blower.id === blowerId ? { ...blower, status: nextStatus(blower.status) } : blower))
  }, [])

  return (
    <div className={cn('flex h-full flex-col bg-card', className)}>
      <div className="border-b px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AirVent className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold">Interactividad Sopladoras Baader 142</h2>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Base operativa</Badge>
            </div>
            <p className="text-xs text-muted-foreground">Esta base sirve para definir la logica operacional de {modelName} antes de bajarla al modelo 3D: modo activo, estado por sopladora y foco de inspeccion.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: 'produccion', label: 'Produccion' },
              { id: 'lavado', label: 'Lavado' },
              { id: 'mantencion', label: 'Mantencion' },
            ] as const).map((option) => (
              <Button key={option.id} variant={mode === option.id ? 'default' : 'outline'} size="sm" onClick={() => setMode(option.id)}>
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Workflow className="h-4 w-4 text-primary" />Estado por sopladora</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {blowers.map((blower) => (
                <button
                  key={blower.id}
                  type="button"
                  onClick={() => setSelectedBlowerId(blower.id)}
                  className={cn('rounded-xl border p-4 text-left transition-colors', selectedBlowerId === blower.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{blower.label}</p>
                      <p className="text-xs text-muted-foreground">{blower.zone}</p>
                    </div>
                    <Badge className={cn('border text-[10px] uppercase tracking-wide', STATUS_STYLES[blower.status])}>{blower.status}</Badge>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Caudal estimado</p>
                      <p className="text-lg font-semibold">{formatPercent(blower.baseFlow)}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); handleCycleStatus(blower.id) }}>Cambiar estado</Button>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4 text-primary" />Secuencia operativa sugerida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{activeSummary.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{activeSummary.summary}</p>
              </div>
              <div className="grid gap-2">
                {activeSummary.checklist.map((item) => <div key={item} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{item}</div>)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4 text-primary" />Punto enfocado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{selectedBlower.label}</p>
                <p className="text-sm text-muted-foreground">{selectedBlower.zone}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Estado actual</p>
                <p className="mt-1 text-lg font-semibold capitalize">{selectedBlower.status}</p>
                <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Caudal</p>
                <p className="mt-1 text-lg font-semibold">{formatPercent(selectedBlower.baseFlow)}</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Inspeccion sugerida:</p>
                <p className="rounded-lg border bg-background px-3 py-2">Revisar continuidad de aire, fijaciones, vibracion y respuesta del circuito asociado a {selectedBlower.label.toLowerCase()}.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Utilidad actual de esta base</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Permite validar el criterio operativo antes de meter complejidad visual en el modelo.</p>
              <p>Sirve para acordar estados, secuencias y respuesta esperada por cada sopladora con operacion y mantencion.</p>
              <p>Tambien deja lista la estructura para enlazar despues hotspots, alarmas y reglas reales del equipo.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Siguiente iteracion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Lo siguiente es conectar comportamiento real: arranque, paro, dependencias entre sopladoras y puntos criticos del modelo.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function ModelBoundExperience({ modelName: _modelName, className, modelUrl, modelFormat }: Required<Pick<SopladorasBaader142InteractiveExperienceProps, 'modelName' | 'modelUrl' | 'modelFormat'>> & Pick<SopladorasBaader142InteractiveExperienceProps, 'className'>) {
  const mode: OperatingMode = 'produccion'
  const [backupMode, setBackupMode] = useState<BackupMode>('auto')
  const [manualBackupTarget, setManualBackupTarget] = useState<BlowerId | null>('S1')
  const [focusedAssetId, setFocusedAssetId] = useState<FocusedAssetId>('S1')
  const [resetKey, setResetKey] = useState(0)
  const viewPreset = 'front' as const
  const [resolvedNodeMeta, setResolvedNodeMeta] = useState<ResolvedNodeMeta>({})
  const [blowers, setBlowers] = useState<BlowerState[]>(INITIAL_BLOWERS)
  const [valves, setValves] = useState<ValveState[]>(INITIAL_VALVES)

  const flowByBlower = useMemo(() => {
    const valveStatusMap = valves.reduce<Record<ValveId, ValveStatus>>((acc, valve) => {
      acc[valve.id] = valve.status
      return acc
    }, {} as Record<ValveId, ValveStatus>)

    return blowers.reduce<Record<BlowerId, number>>((acc, blower) => {
      const dependenciesOpen = BLOWER_VALVE_DEPENDENCIES[blower.id].every((valveId) => valveStatusMap[valveId] === 'abierta')
      if (!dependenciesOpen) {
        acc[blower.id] = 0
        return acc
      }

      const statusFactor = blower.status === 'operativa' ? 1 : blower.status === 'revision' ? 0.58 : 0
      acc[blower.id] = Math.round(blower.baseFlow * MODE_FLOW_FACTOR[mode] * statusFactor)
      return acc
    }, {} as Record<BlowerId, number>)
  }, [blowers, mode, valves])

  const meshAnchoredCount = useMemo(() => Object.values(resolvedNodeMeta).filter((node) => node?.source === 'mesh').length, [resolvedNodeMeta])
  const autoBackupTarget = useMemo(() => getPrimaryBackupTarget(blowers, flowByBlower), [blowers, flowByBlower])
  const backupTarget = useMemo(() => {
    if (backupMode === 'off') return null
    if (backupMode === 'manual') return manualBackupTarget
    return autoBackupTarget
  }, [autoBackupTarget, backupMode, manualBackupTarget])
  const backupOnline = useMemo(() => !!backupTarget && flowByBlower.S4 > 0, [backupTarget, flowByBlower])

  const handleToggleValve = useCallback((valveId: ValveId) => {
    setFocusedAssetId(valveId)
    setValves((currentValves) => currentValves.map((valve) => valve.id === valveId ? { ...valve, status: toggleValveStatus(valve.status) } : valve))
  }, [])

  const handleToggleBlowerPower = useCallback((blowerId: BlowerId) => {
    setFocusedAssetId(blowerId)
    setBlowers((currentBlowers) => currentBlowers.map((blower) => blower.id === blowerId ? { ...blower, status: toggleBlowerPower(blower.status) } : blower))
  }, [])

  const handleResetSystem = useCallback(() => {
    setBackupMode('auto')
    setManualBackupTarget('S1')
    setFocusedAssetId('S1')
    setResetKey((value) => value + 1)
    setBlowers(INITIAL_BLOWERS)
    setValves(INITIAL_VALVES)
  }, [])

  return (
    <div className={cn('grid h-full gap-3 bg-card p-3', className)}>
      <div className="relative min-h-[860px] overflow-hidden rounded-xl border bg-background">
        <Viewer3D url={modelUrl} format={modelFormat} resetKey={resetKey} viewPreset={viewPreset}>
          <SopladorasBaader142InteractiveCanvasOverlay
            blowers={blowers}
            valves={valves}
            flowByBlower={flowByBlower}
            backupTarget={backupTarget}
            focusedAssetId={focusedAssetId}
            onToggleBlower={handleToggleBlowerPower}
            onToggleValve={handleToggleValve}
            onResolvedNodesChange={setResolvedNodeMeta}
          />
        </Viewer3D>

        <div className="pointer-events-none absolute inset-x-2 top-2 z-10">
          <div className="pointer-events-auto rounded-xl border bg-background/88 p-2 backdrop-blur">
            <div className="grid gap-2 xl:grid-cols-[1.2fr_1.2fr_0.9fr]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sopladoras</p>
                  <span className="text-[10px] text-muted-foreground/80">ON/OFF</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {blowers.map((blower) => (
                    (() => {
                      const actionLink = MODEL_ACTION_LINKS[blower.id]
                      return (
                    <Button
                      key={blower.id}
                      size="sm"
                      variant={blower.status === 'operativa' ? 'default' : 'outline'}
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      onClick={() => handleToggleBlowerPower(blower.id)}
                      title={actionLink.notes}
                    >
                      {blower.id}
                      <span className="text-[10px] opacity-80">{blower.status === 'operativa' ? actionLink.activeLabel : blower.status === 'revision' ? 'REV' : actionLink.inactiveLabel}</span>
                    </Button>
                      )
                    })()
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Valvulas</p>
                  <span className="text-[10px] text-muted-foreground/80">Estado visual</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {valves.map((valve) => (
                    (() => {
                      const actionLink = MODEL_ACTION_LINKS[valve.id]
                      return (
                    <Button
                      key={valve.id}
                      size="sm"
                      variant={valve.status === 'abierta' ? 'default' : 'outline'}
                      className="h-8 gap-1.5 px-2.5 text-xs"
                      onClick={() => handleToggleValve(valve.id)}
                      title={actionLink.notes}
                    >
                      {valve.id}
                      <span className="text-[10px] opacity-80">
                        {valve.status === 'abierta' ? actionLink.activeLabel : actionLink.inactiveLabel}
                      </span>
                    </Button>
                      )
                    })()
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Respaldo S4</p>
                  <span className="text-[10px] text-muted-foreground/80">Modo</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: 'auto', label: 'Auto' },
                    { id: 'manual', label: 'Manual' },
                    { id: 'off', label: 'Off' },
                  ] as const).map((option) => (
                    <Button
                      key={option.id}
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      variant={backupMode === option.id ? 'default' : 'outline'}
                      onClick={() => setBackupMode(option.id)}
                    >
                      {option.label}
                    </Button>
                  ))}
                  {backupMode === 'manual' && (['S1', 'S2', 'S3'] as const).map((target) => (
                    <Button
                      key={target}
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      variant={manualBackupTarget === target ? 'default' : 'outline'}
                      onClick={() => setManualBackupTarget(target)}
                    >
                      Resp. {target}
                    </Button>
                  ))}
                  <Button size="sm" className="h-8 px-2.5 text-xs" variant="outline" onClick={handleResetSystem}>Reset sistema</Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border bg-background/85 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          {meshAnchoredCount}/{INTERACTIVE_NODE_DEFINITIONS.length} puntos anclados directamente a mallas del modelo.
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border bg-background/85 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          {backupOnline ? `S4 respalda a ${backupTarget}` : backupMode === 'off' ? 'S4 sin respaldo automatico' : backupMode === 'manual' ? `S4 armado para ${backupTarget}` : 'S4 en espera como respaldo'}
        </div>
      </div>
    </div>
  )
}

export function SopladorasBaader142InteractiveExperience({ modelName, className, modelUrl, modelFormat }: SopladorasBaader142InteractiveExperienceProps) {
  if (!modelUrl || !modelFormat) {
    return <StandalonePanel modelName={modelName} className={className} />
  }

  return (
    <ModelBoundExperience
      modelName={modelName}
      className={className}
      modelUrl={modelUrl}
      modelFormat={modelFormat}
    />
  )
}