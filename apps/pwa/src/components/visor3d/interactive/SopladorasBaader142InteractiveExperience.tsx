import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { AirVent, Gauge, RotateCcw, Settings2, Workflow } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Viewer3D } from '@/components/visor3d/Viewer3D'
import { useViewer3DModelContext } from '@/components/visor3d/Viewer3DModelContext'
import { cn } from '@/lib/utils'
import type { Model3DFormat } from '@/types/models3d'

type OperatingMode = 'produccion' | 'lavado' | 'mantencion'
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
  source: 'mesh' | 'fallback'
  meshName?: string
}

type ResolvedNodeMeta = Partial<Record<FocusedAssetId, { source: 'mesh' | 'fallback'; meshName?: string }>>

const STATUS_ORDER: BlowerStatus[] = ['operativa', 'revision', 'detenida']

const STATUS_STYLES: Record<BlowerStatus, string> = {
  operativa: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  revision: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  detenida: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const VALVE_STYLES: Record<ValveStatus, string> = {
  abierta: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  cerrada: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
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

function nextStatus(currentStatus: BlowerStatus): BlowerStatus {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus)
  return STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length]!
}

function toggleValveStatus(currentStatus: ValveStatus): ValveStatus {
  return currentStatus === 'abierta' ? 'cerrada' : 'abierta'
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

function resolveInteractiveNodes(object: THREE.Object3D | null, info: { size: THREE.Vector3 } | null): ResolvedInteractiveNode[] {
  const candidates: Array<{ text: string; center: THREE.Vector3; meshName: string }> = []

  if (object) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const text = normalizeSearchText(`${child.name} ${child.userData.stableMeshId ?? ''}`)
      const box = new THREE.Box3().setFromObject(child)
      if (box.isEmpty()) return

      candidates.push({
        text,
        center: box.getCenter(new THREE.Vector3()),
        meshName: child.name || child.userData.stableMeshId || 'mesh',
      })
    })
  }

  const usedCandidateIndexes = new Set<number>()

  return INTERACTIVE_NODE_DEFINITIONS.map((node) => {
    const candidateIndex = candidates.findIndex((candidate, index) => !usedCandidateIndexes.has(index) && node.keywords.some((keyword) => candidate.text.includes(normalizeSearchText(keyword))))

    if (candidateIndex >= 0) {
      usedCandidateIndexes.add(candidateIndex)
      const candidate = candidates[candidateIndex]!
      return { ...node, position: candidate.center.clone(), source: 'mesh' as const, meshName: candidate.meshName }
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

function HotspotMarker({ node, color, selected, onClick }: { node: ResolvedInteractiveNode; color: string; selected: boolean; onClick: () => void }) {
  const coreRef = useRef<THREE.Mesh>(null)
  const ringRef = useRef<THREE.Mesh>(null)
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
      <Html position={[0, 0.18, 0]} center distanceFactor={8} zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          className={cn('rounded-full border px-2 py-1 text-[10px] font-semibold shadow-lg backdrop-blur transition-colors', labelClassName)}
        >
          {node.label}
        </button>
      </Html>
    </group>
  )
}

function SopladorasBaader142InteractiveCanvasOverlay({
  blowers,
  valves,
  flowByBlower,
  focusedAssetId,
  onFocusAsset,
  onResolvedNodesChange,
}: {
  blowers: BlowerState[]
  valves: ValveState[]
  flowByBlower: Record<BlowerId, number>
  focusedAssetId: FocusedAssetId
  onFocusAsset: (assetId: FocusedAssetId) => void
  onResolvedNodesChange?: (meta: ResolvedNodeMeta) => void
}) {
  const { object, info } = useViewer3DModelContext()

  const resolvedNodes = useMemo(() => resolveInteractiveNodes(object, info), [object, info])

  useEffect(() => {
    if (!onResolvedNodesChange) return
    const nextMeta = resolvedNodes.reduce<ResolvedNodeMeta>((acc, node) => {
      acc[node.id] = { source: node.source, meshName: node.meshName }
      return acc
    }, {})
    onResolvedNodesChange(nextMeta)
  }, [onResolvedNodesChange, resolvedNodes])

  const nodeMap = useMemo(() => new Map(resolvedNodes.map((node) => [node.id, node])), [resolvedNodes])

  const anchors = useMemo(() => {
    if (!info) return null
    return {
      supply: getFallbackPosition([0.07, 0.42, 0.19], info),
    }
  }, [info])

  const hasNorthFlow = flowByBlower.S1 > 0 || flowByBlower.S2 > 0
  const hasSouthFlow = flowByBlower.S3 > 0 || flowByBlower.S4 > 0

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
      vm1 && { id: 'supply-vm1', start: anchors.supply, end: vm1.position, active: hasNorthFlow },
      vm2 && { id: 'supply-vm2', start: anchors.supply, end: vm2.position, active: hasSouthFlow },
      vm1 && vb1 && { id: 'vm1-vb1', start: vm1.position, end: vb1.position, active: hasNorthFlow },
      vm2 && vb2 && { id: 'vm2-vb2', start: vm2.position, end: vb2.position, active: hasSouthFlow },
      vb1 && s1 && { id: 'vb1-s1', start: vb1.position, end: s1.position, active: flowByBlower.S1 > 0 },
      vb1 && s2 && { id: 'vb1-s2', start: vb1.position, end: s2.position, active: flowByBlower.S2 > 0 },
      vb2 && s3 && { id: 'vb2-s3', start: vb2.position, end: s3.position, active: flowByBlower.S3 > 0 },
      vb2 && s4 && { id: 'vb2-s4', start: vb2.position, end: s4.position, active: flowByBlower.S4 > 0 },
    ].filter(Boolean) as Array<{ id: string; start: THREE.Vector3; end: THREE.Vector3; active: boolean }>
  }, [anchors, hasNorthFlow, hasSouthFlow, flowByBlower, nodeMap])

  if (!anchors) return null

  return (
    <>
      {segments.map((segment, index) => {
        const color = segment.active ? '#38bdf8' : '#475569'
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
          return <HotspotMarker key={node.id} node={node} color={getBlowerStatusColor(blower.status)} selected={focusedAssetId === node.id} onClick={() => onFocusAsset(node.id)} />
        }

        const valve = valves.find((item) => item.id === node.id)
        if (!valve) return null
        return <HotspotMarker key={node.id} node={node} color={getValveStatusColor(valve.status)} selected={focusedAssetId === node.id} onClick={() => onFocusAsset(node.id)} />
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

function ModelBoundExperience({ modelName, className, modelUrl, modelFormat }: Required<Pick<SopladorasBaader142InteractiveExperienceProps, 'modelName' | 'modelUrl' | 'modelFormat'>> & Pick<SopladorasBaader142InteractiveExperienceProps, 'className'>) {
  const [mode, setMode] = useState<OperatingMode>('produccion')
  const [focusedAssetId, setFocusedAssetId] = useState<FocusedAssetId>('S1')
  const [resetKey, setResetKey] = useState(0)
  const [resolvedNodeMeta, setResolvedNodeMeta] = useState<ResolvedNodeMeta>({})
  const [blowers, setBlowers] = useState<BlowerState[]>(INITIAL_BLOWERS)
  const [valves, setValves] = useState<ValveState[]>(INITIAL_VALVES)

  const activeSummary = MODE_COPY[mode]

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

  const openValveCount = useMemo(() => valves.filter((valve) => valve.status === 'abierta').length, [valves])
  const activeBlowerCount = useMemo(() => blowers.filter((blower) => flowByBlower[blower.id] > 0).length, [blowers, flowByBlower])
  const meshAnchoredCount = useMemo(() => Object.values(resolvedNodeMeta).filter((node) => node?.source === 'mesh').length, [resolvedNodeMeta])

  const focusedBlower = blowers.find((blower) => blower.id === focusedAssetId)
  const focusedValve = valves.find((valve) => valve.id === focusedAssetId)
  const focusedMeta = resolvedNodeMeta[focusedAssetId]

  const handleCycleStatus = useCallback((blowerId: BlowerId) => {
    setFocusedAssetId(blowerId)
    setBlowers((currentBlowers) => currentBlowers.map((blower) => blower.id === blowerId ? { ...blower, status: nextStatus(blower.status) } : blower))
  }, [])

  const handleToggleValve = useCallback((valveId: ValveId) => {
    setFocusedAssetId(valveId)
    setValves((currentValves) => currentValves.map((valve) => valve.id === valveId ? { ...valve, status: toggleValveStatus(valve.status) } : valve))
  }, [])

  const focusTitle = focusedBlower?.label ?? focusedValve?.label ?? 'Sin foco'
  const focusZone = focusedBlower?.zone ?? focusedValve?.zone ?? 'Sin ubicacion'
  const focusStatusLabel = focusedBlower?.status ?? focusedValve?.status ?? 'sin estado'
  const focusFlowLabel = focusedBlower ? formatPercent(flowByBlower[focusedBlower.id]) : focusedValve?.status === 'abierta' ? 'Paso habilitado' : 'Linea aislada'

  const inspectionSuggestion = focusedBlower
    ? `Revisar vibracion, continuidad de aire y respuesta de ${focusedBlower.label.toLowerCase()} segun el estado actual.`
    : focusedValve?.status === 'abierta'
      ? `Confirmar apertura efectiva, ausencia de fuga y estabilidad de ${focusedValve.label.toLowerCase()}.`
      : `Validar enclavamiento y posicion cerrada de ${focusedValve?.label.toLowerCase()} antes de intervenir el ducto.`

  return (
    <div className={cn('grid h-full gap-4 bg-card p-4 xl:grid-cols-[minmax(0,1.65fr)_380px]', className)}>
      <div className="relative min-h-[620px] overflow-hidden rounded-xl border bg-background">
        <Viewer3D url={modelUrl} format={modelFormat} resetKey={resetKey}>
          <SopladorasBaader142InteractiveCanvasOverlay
            blowers={blowers}
            valves={valves}
            flowByBlower={flowByBlower}
            focusedAssetId={focusedAssetId}
            onFocusAsset={setFocusedAssetId}
            onResolvedNodesChange={setResolvedNodeMeta}
          />
        </Viewer3D>

        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
          <div className="pointer-events-auto max-w-2xl rounded-xl border bg-background/90 p-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <AirVent className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold">Interactividad Sopladoras Baader 142</h2>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Base 3D activa</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Esta vista usa el mismo modelo de {modelName} y superpone hotspots sobre sopladoras, llaves de bola y valvulas mariposa para probar continuidad de aire por ductos.</p>
          </div>

          <div className="pointer-events-auto flex flex-wrap gap-2">
            {([
              { id: 'produccion', label: 'Produccion' },
              { id: 'lavado', label: 'Lavado' },
              { id: 'mantencion', label: 'Mantencion' },
            ] as const).map((option) => (
              <Button key={option.id} variant={mode === option.id ? 'default' : 'outline'} size="sm" onClick={() => setMode(option.id)}>
                {option.label}
              </Button>
            ))}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setResetKey((value) => value + 1)}>
              <RotateCcw className="h-4 w-4" />
              Reset vista
            </Button>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border bg-background/85 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          {meshAnchoredCount}/{INTERACTIVE_NODE_DEFINITIONS.length} puntos anclados directamente a mallas del modelo.
        </div>
      </div>

      <div className="space-y-4 overflow-y-auto pr-1">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Workflow className="h-4 w-4 text-primary" />Estado por sopladora</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            {blowers.map((blower) => (
              <button
                key={blower.id}
                type="button"
                onClick={() => setFocusedAssetId(blower.id)}
                className={cn('rounded-xl border p-4 text-left transition-colors', focusedAssetId === blower.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30')}
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
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Caudal actual</p>
                    <p className="text-lg font-semibold">{formatPercent(flowByBlower[blower.id])}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); handleCycleStatus(blower.id) }}>Cambiar estado</Button>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4 text-primary" />Valvulas y aislamiento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            {valves.map((valve) => (
              <button
                key={valve.id}
                type="button"
                onClick={() => setFocusedAssetId(valve.id)}
                className={cn('rounded-xl border p-4 text-left transition-colors', focusedAssetId === valve.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/30')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{valve.label}</p>
                    <p className="text-xs text-muted-foreground">{valve.zone}</p>
                  </div>
                  <Badge className={cn('border text-[10px] uppercase tracking-wide', VALVE_STYLES[valve.status])}>{valve.status}</Badge>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Impacta</p>
                    <p className="text-sm font-medium">{valve.affects.join(' / ')}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={(event) => { event.stopPropagation(); handleToggleValve(valve.id) }}>
                    {valve.status === 'abierta' ? 'Cerrar' : 'Abrir'}
                  </Button>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Gauge className="h-4 w-4 text-primary" />Punto enfocado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm font-semibold">{focusTitle}</p>
              <p className="text-sm text-muted-foreground">{focusZone}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Estado actual</p>
              <p className="mt-1 text-lg font-semibold capitalize">{focusStatusLabel}</p>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Respuesta</p>
              <p className="mt-1 text-lg font-semibold">{focusFlowLabel}</p>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Anclaje</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {focusedMeta?.source === 'mesh' ? `Malla detectada: ${focusedMeta.meshName}` : 'Posicion de respaldo sobre bounding box del modelo.'}
              </p>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>Inspeccion sugerida:</p>
              <p className="rounded-lg border bg-background px-3 py-2">{inspectionSuggestion}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Estado de flujo del modelo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{activeBlowerCount} sopladoras entregando aire en este escenario.</p>
            <p>{openValveCount} valvulas abiertas habilitan continuidad por los ductos activos.</p>
            <p>Los tramos con flujo se iluminan en azul sobre el mismo GLB para identificar sectores habilitados y aislados.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{activeSummary.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{activeSummary.summary}</p>
            <div className="grid gap-2">
              {activeSummary.checklist.map((item) => <div key={item} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">{item}</div>)}
            </div>
          </CardContent>
        </Card>
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