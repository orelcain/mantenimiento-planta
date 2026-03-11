import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { AirVent, Gauge, Settings2, Workflow } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { Viewer3D } from '@/components/visor3d/Viewer3D'
import { useViewer3DModelContext } from '@/components/visor3d/Viewer3DModelContext'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/useToast'
import { deleteInteractiveBinding, setInteractiveBinding, subscribeToInteractiveBindings, type InteractiveBinding } from '@/services/interactiveBindings'
import type { Model3DFormat } from '@/types/models3d'

type OperatingMode = 'produccion' | 'lavado' | 'mantencion'
type BackupMode = 'auto' | 'manual' | 'off'
type BlowerStatus = 'operativa' | 'revision' | 'detenida'
type ValveStatus = 'abierta' | 'cerrada'
type LineId = 'L1' | 'L2' | 'L3' | 'L4'
type PrimaryLineId = 'L1' | 'L2' | 'L3'
type BlowerId = 'S1' | 'S2' | 'S3' | 'S4'
type ValveId = 'L1_VB1' | 'L1_VB2' | 'L1_VM1' | 'L2_VB1' | 'L2_VB2' | 'L2_VM1' | 'L3_VB1' | 'L3_VM1' | 'L4_VB1'
type FocusedAssetId = BlowerId | ValveId

interface BlowerState {
  id: BlowerId
  label: string
  zone: string
  lineId: LineId
  baseFlow: number
  status: BlowerStatus
}

interface ValveState {
  id: ValveId
  label: string
  zone: string
  lineId: LineId
  kind: 'mariposa' | 'bola'
  status: ValveStatus
}

interface LineVisualConfig {
  id: LineId
  label: string
  color: string
  blowerId: BlowerId
  valveIds: ValveId[]
  outletFallback: [number, number, number]
  manifoldFallback?: [number, number, number]
}

interface SopladorasBaader142InteractiveExperienceProps {
  modelId?: string
  modelName: string
  className?: string
  modelUrl?: string
  modelFormat?: Model3DFormat
  canEditMappings?: boolean
  currentUserId?: string
}

interface InteractiveNodeDefinition {
  id: FocusedAssetId
  label: string
  kind: 'blower' | 'valve'
  zone: string
  lineId: LineId
  keywords: string[]
  preferredObjectNames: string[]
  handleKeywords?: string[]
  fallback: [number, number, number]
}

interface ResolvedInteractiveNode extends InteractiveNodeDefinition {
  position: THREE.Vector3
  source: 'object' | 'fallback'
  objectName?: string
  objectRef?: THREE.Object3D
  motionObjectName?: string
  motionObjectRef?: THREE.Object3D
}

interface ModelActionLink {
  assetId: FocusedAssetId
  action: 'toggle-blower' | 'toggle-valve'
  transform: 'emissive' | 'rotate-y' | 'rotate-z'
  activeLabel: string
  inactiveLabel: string
  notes: string
}

type ResolvedNodeMeta = Partial<Record<FocusedAssetId, { source: 'object' | 'fallback'; objectName?: string; motionObjectName?: string }>>
type InteractiveBindingMap = Partial<Record<FocusedAssetId, InteractiveBinding>>

interface SceneObjectCandidate {
  text: string
  normalizedName: string
  center: THREE.Vector3
  objectName: string
  object: THREE.Object3D
  objectType: 'group' | 'mesh'
}

interface FlowSegment {
  id: string
  start: THREE.Vector3
  end: THREE.Vector3
  active: boolean
  color: string
}

const STATUS_ORDER: BlowerStatus[] = ['operativa', 'revision', 'detenida']
const PRIMARY_LINE_IDS: PrimaryLineId[] = ['L1', 'L2', 'L3']
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

const LINE_VISUALS: Record<LineId, LineVisualConfig> = {
  L1: { id: 'L1', label: 'Linea 1', color: '#eab308', blowerId: 'S1', valveIds: ['L1_VB1', 'L1_VB2', 'L1_VM1'], outletFallback: [0.14, 0.80, 0.12] },
  L2: { id: 'L2', label: 'Linea 2', color: '#ef4444', blowerId: 'S2', valveIds: ['L2_VB1', 'L2_VB2', 'L2_VM1'], outletFallback: [0.39, 0.81, 0.18] },
  L3: { id: 'L3', label: 'Linea 3', color: '#3b82f6', blowerId: 'S3', valveIds: ['L3_VB1', 'L3_VM1'], outletFallback: [0.67, 0.80, 0.29] },
  L4: { id: 'L4', label: 'Linea 4 respaldo', color: '#334155', blowerId: 'S4', valveIds: ['L4_VB1'], outletFallback: [0.81, 0.58, 0.35], manifoldFallback: [0.81, 0.58, 0.35] },
}

const INITIAL_BLOWERS: BlowerState[] = [
  { id: 'S1', label: 'Sopladora 1', zone: 'Linea 1 amarilla', lineId: 'L1', baseFlow: 92, status: 'operativa' },
  { id: 'S2', label: 'Sopladora 2', zone: 'Linea 2 roja', lineId: 'L2', baseFlow: 89, status: 'operativa' },
  { id: 'S3', label: 'Sopladora 3', zone: 'Linea 3 azul', lineId: 'L3', baseFlow: 76, status: 'revision' },
  { id: 'S4', label: 'Sopladora 4', zone: 'Linea 4 respaldo', lineId: 'L4', baseFlow: 84, status: 'detenida' },
]

const INITIAL_VALVES: ValveState[] = [
  { id: 'L1_VB1', label: 'L1 bola 1', zone: 'Linea 1 amarilla', lineId: 'L1', kind: 'bola', status: 'abierta' },
  { id: 'L1_VB2', label: 'L1 bola 2', zone: 'Linea 1 amarilla', lineId: 'L1', kind: 'bola', status: 'abierta' },
  { id: 'L1_VM1', label: 'L1 mariposa', zone: 'Linea 1 amarilla', lineId: 'L1', kind: 'mariposa', status: 'abierta' },
  { id: 'L2_VB1', label: 'L2 bola 1', zone: 'Linea 2 roja', lineId: 'L2', kind: 'bola', status: 'abierta' },
  { id: 'L2_VB2', label: 'L2 bola 2', zone: 'Linea 2 roja', lineId: 'L2', kind: 'bola', status: 'abierta' },
  { id: 'L2_VM1', label: 'L2 mariposa', zone: 'Linea 2 roja', lineId: 'L2', kind: 'mariposa', status: 'abierta' },
  { id: 'L3_VB1', label: 'L3 bola 1', zone: 'Linea 3 azul', lineId: 'L3', kind: 'bola', status: 'abierta' },
  { id: 'L3_VM1', label: 'L3 mariposa', zone: 'Linea 3 azul', lineId: 'L3', kind: 'mariposa', status: 'abierta' },
  { id: 'L4_VB1', label: 'L4 bola respaldo', zone: 'Linea 4 respaldo', lineId: 'L4', kind: 'bola', status: 'abierta' },
]

const INTERACTIVE_NODE_DEFINITIONS: InteractiveNodeDefinition[] = [
  {
    id: 'S1',
    label: 'Sopladora 1',
    kind: 'blower',
    zone: 'Linea 1 amarilla',
    lineId: 'L1',
    keywords: ['sopladora 1', 'blower 1', 's1', 'linea 1', 'l1', 'amarilla'],
    preferredObjectNames: ['S1', 'SOPLADORA_1', 'SOPLADORA1', 'BLOWER_1', 'BLOWER1', 'L1_S1'],
    fallback: [0.16, 0.71, 0.25],
  },
  {
    id: 'S2',
    label: 'Sopladora 2',
    kind: 'blower',
    zone: 'Linea 2 roja',
    lineId: 'L2',
    keywords: ['sopladora 2', 'blower 2', 's2', 'linea 2', 'l2', 'roja'],
    preferredObjectNames: ['S2', 'SOPLADORA_2', 'SOPLADORA2', 'BLOWER_2', 'BLOWER2', 'L2_S2'],
    fallback: [0.38, 0.71, 0.33],
  },
  {
    id: 'S3',
    label: 'Sopladora 3',
    kind: 'blower',
    zone: 'Linea 3 azul',
    lineId: 'L3',
    keywords: ['sopladora 3', 'blower 3', 's3', 'linea 3', 'l3', 'azul'],
    preferredObjectNames: ['S3', 'SOPLADORA_3', 'SOPLADORA3', 'BLOWER_3', 'BLOWER3', 'L3_S3'],
    fallback: [0.62, 0.70, 0.43],
  },
  {
    id: 'S4',
    label: 'Sopladora 4',
    kind: 'blower',
    zone: 'Linea 4 respaldo',
    lineId: 'L4',
    keywords: ['sopladora 4', 'blower 4', 's4', 'linea 4', 'l4', 'respaldo', 'backup'],
    preferredObjectNames: ['S4', 'SOPLADORA_4', 'SOPLADORA4', 'BLOWER_4', 'BLOWER4', 'L4_S4', 'RESPALDO_S4'],
    fallback: [0.82, 0.68, 0.55],
  },
  {
    id: 'L1_VB1',
    label: 'L1 bola 1',
    kind: 'valve',
    zone: 'Linea 1 amarilla',
    lineId: 'L1',
    keywords: ['l1 vb1', 'linea 1 bola 1', 'bola 1 amarilla', 'valvula bola 1 l1'],
    preferredObjectNames: ['L1_VB1', 'VB1_L1', 'VALVULA_BOLA_L1_1', 'LINEA1_BOLA1'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'llave'],
    fallback: [0.23, 0.59, 0.20],
  },
  {
    id: 'L1_VB2',
    label: 'L1 bola 2',
    kind: 'valve',
    zone: 'Linea 1 amarilla',
    lineId: 'L1',
    keywords: ['l1 vb2', 'linea 1 bola 2', 'bola 2 amarilla', 'valvula bola 2 l1'],
    preferredObjectNames: ['L1_VB2', 'VB2_L1', 'VALVULA_BOLA_L1_2', 'LINEA1_BOLA2'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'llave'],
    fallback: [0.28, 0.55, 0.22],
  },
  {
    id: 'L1_VM1',
    label: 'L1 mariposa',
    kind: 'valve',
    zone: 'Linea 1 amarilla',
    lineId: 'L1',
    keywords: ['l1 vm1', 'linea 1 mariposa', 'mariposa amarilla', 'valvula mariposa l1'],
    preferredObjectNames: ['L1_VM1', 'VM1_L1', 'VALVULA_MARIPOSA_L1', 'LINEA1_MARIPOSA'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'mariposa'],
    fallback: [0.34, 0.52, 0.24],
  },
  {
    id: 'L2_VB1',
    label: 'L2 bola 1',
    kind: 'valve',
    zone: 'Linea 2 roja',
    lineId: 'L2',
    keywords: ['l2 vb1', 'linea 2 bola 1', 'bola 1 roja', 'valvula bola 1 l2'],
    preferredObjectNames: ['L2_VB1', 'VB1_L2', 'VALVULA_BOLA_L2_1', 'LINEA2_BOLA1'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'llave'],
    fallback: [0.44, 0.59, 0.30],
  },
  {
    id: 'L2_VB2',
    label: 'L2 bola 2',
    kind: 'valve',
    zone: 'Linea 2 roja',
    lineId: 'L2',
    keywords: ['l2 vb2', 'linea 2 bola 2', 'bola 2 roja', 'valvula bola 2 l2'],
    preferredObjectNames: ['L2_VB2', 'VB2_L2', 'VALVULA_BOLA_L2_2', 'LINEA2_BOLA2'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'llave'],
    fallback: [0.51, 0.55, 0.34],
  },
  {
    id: 'L2_VM1',
    label: 'L2 mariposa',
    kind: 'valve',
    zone: 'Linea 2 roja',
    lineId: 'L2',
    keywords: ['l2 vm1', 'linea 2 mariposa', 'mariposa roja', 'valvula mariposa l2'],
    preferredObjectNames: ['L2_VM1', 'VM1_L2', 'VALVULA_MARIPOSA_L2', 'LINEA2_MARIPOSA'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'mariposa'],
    fallback: [0.57, 0.52, 0.37],
  },
  {
    id: 'L3_VB1',
    label: 'L3 bola 1',
    kind: 'valve',
    zone: 'Linea 3 azul',
    lineId: 'L3',
    keywords: ['l3 vb1', 'linea 3 bola 1', 'bola azul', 'valvula bola l3'],
    preferredObjectNames: ['L3_VB1', 'VB1_L3', 'VALVULA_BOLA_L3', 'LINEA3_BOLA1'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'llave'],
    fallback: [0.70, 0.52, 0.45],
  },
  {
    id: 'L3_VM1',
    label: 'L3 mariposa',
    kind: 'valve',
    zone: 'Linea 3 azul',
    lineId: 'L3',
    keywords: ['l3 vm1', 'linea 3 mariposa', 'mariposa azul', 'valvula mariposa l3'],
    preferredObjectNames: ['L3_VM1', 'VM1_L3', 'VALVULA_MARIPOSA_L3', 'LINEA3_MARIPOSA'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'mariposa'],
    fallback: [0.74, 0.49, 0.47],
  },
  {
    id: 'L4_VB1',
    label: 'L4 bola respaldo',
    kind: 'valve',
    zone: 'Linea 4 respaldo',
    lineId: 'L4',
    keywords: ['l4 vb1', 'linea 4 bola', 'bola respaldo', 'valvula bola l4', 'backup valve'],
    preferredObjectNames: ['L4_VB1', 'VB1_L4', 'VALVULA_BOLA_L4', 'LINEA4_BOLA1', 'RESPALDO_BOLA'],
    handleKeywords: ['manilla', 'handle', 'palanca', 'lever', 'llave'],
    fallback: [0.78, 0.50, 0.52],
  },
]

const MODEL_ACTION_LINKS: Record<FocusedAssetId, ModelActionLink> = {
  S1: { assetId: 'S1', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 1.' },
  S2: { assetId: 'S2', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 2.' },
  S3: { assetId: 'S3', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 3.' },
  S4: { assetId: 'S4', action: 'toggle-blower', transform: 'emissive', activeLabel: 'ON', inactiveLabel: 'OFF', notes: 'Enciende o detiene la sopladora 4 de respaldo.' },
  L1_VB1: { assetId: 'L1_VB1', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'Llave de bola L1. Vertical abierta, horizontal cerrada.' },
  L1_VB2: { assetId: 'L1_VB2', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'Llave de bola L1. Vertical abierta, horizontal cerrada.' },
  L1_VM1: { assetId: 'L1_VM1', action: 'toggle-valve', transform: 'rotate-y', activeLabel: 'Abierta', inactiveLabel: 'Cerrada', notes: 'Mariposa L1 para direccionar el caudal.' },
  L2_VB1: { assetId: 'L2_VB1', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'Llave de bola L2. Vertical abierta, horizontal cerrada.' },
  L2_VB2: { assetId: 'L2_VB2', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'Llave de bola L2. Vertical abierta, horizontal cerrada.' },
  L2_VM1: { assetId: 'L2_VM1', action: 'toggle-valve', transform: 'rotate-y', activeLabel: 'Abierta', inactiveLabel: 'Cerrada', notes: 'Mariposa L2 para direccionar el caudal.' },
  L3_VB1: { assetId: 'L3_VB1', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'Llave de bola L3. Vertical abierta, horizontal cerrada.' },
  L3_VM1: { assetId: 'L3_VM1', action: 'toggle-valve', transform: 'rotate-y', activeLabel: 'Abierta', inactiveLabel: 'Cerrada', notes: 'Mariposa L3 para direccionar el caudal.' },
  L4_VB1: { assetId: 'L4_VB1', action: 'toggle-valve', transform: 'rotate-z', activeLabel: 'Vertical', inactiveLabel: 'Horizontal', notes: 'Llave de bola L4 de respaldo.' },
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
  const exactMatch = node.preferredObjectNames.some((preferredName) => normalizeSearchText(preferredName) === candidate.normalizedName)
  const partialMatch = node.preferredObjectNames.some((preferredName) => candidate.normalizedName.includes(normalizeSearchText(preferredName)))
  const keywordMatches = node.keywords.reduce((count, keyword) => (
    candidate.text.includes(normalizeSearchText(keyword)) ? count + 1 : count
  ), 0)
  const typeBonus = candidate.objectType === 'group' ? 6 : 2
  return (exactMatch ? 120 : 0) + (partialMatch ? 40 : 0) + keywordMatches * 14 + typeBonus
}

function findMotionObject(root: THREE.Object3D, keywords: string[] = []): THREE.Object3D {
  if (keywords.length === 0) return root

  const normalizedKeywords = keywords.map((keyword) => normalizeSearchText(keyword))
  let bestObject: THREE.Object3D | null = null
  let bestScore = -1

  root.traverse((child) => {
    if (child === root) return
    const childName = child.name || child.userData.stableMeshId || ''
    if (!childName) return

    const normalizedName = normalizeSearchText(childName)
    const matchCount = normalizedKeywords.reduce((count, keyword) => count + (normalizedName.includes(keyword) ? 1 : 0), 0)
    if (matchCount === 0) return

    const score = matchCount * 10 + (child instanceof THREE.Group ? 5 : 0)
    if (score > bestScore) {
      bestObject = child
      bestScore = score
    }
  })

  if (bestObject) {
    return bestObject
  }

  return root
}

function getPrimaryLineAnchor(anchors: { L1: THREE.Vector3; L2: THREE.Vector3; L3: THREE.Vector3 }, lineId: PrimaryLineId): THREE.Vector3 {
  return anchors[lineId]
}

function findCandidateIndexByObjectName(candidates: SceneObjectCandidate[], objectName?: string): number {
  if (!objectName) return -1
  const normalizedTarget = normalizeSearchText(objectName)
  return candidates.findIndex((candidate) => candidate.normalizedName === normalizedTarget || candidate.text.includes(normalizedTarget))
}

function findObjectByName(root: THREE.Object3D | null | undefined, objectName?: string): THREE.Object3D | undefined {
  if (!root || !objectName) return undefined
  const normalizedTarget = normalizeSearchText(objectName)
  let found: THREE.Object3D | undefined
  root.traverse((child) => {
    if (found) return
    const childName = child.name || child.userData.stableMeshId || ''
    if (childName && normalizeSearchText(childName) === normalizedTarget) {
      found = child
    }
  })
  return found
}

function getBindingMap(bindings: InteractiveBinding[]): InteractiveBindingMap {
  return bindings.reduce<InteractiveBindingMap>((acc, binding) => {
    acc[binding.assetId as FocusedAssetId] = binding
    return acc
  }, {})
}

function getNamedSelectionFromHit(hitObject: THREE.Object3D, modelRoot: THREE.Object3D): { objectName: string; motionObjectName?: string } | null {
  const namedPath: Array<{ name: string; object: THREE.Object3D }> = []
  let current: THREE.Object3D | null = hitObject

  while (current && current !== modelRoot) {
    const currentName = current.name || current.userData.stableMeshId || ''
    if (currentName) {
      namedPath.push({ name: currentName, object: current })
    }
    current = current.parent
  }

  if (namedPath.length === 0) {
    const fallbackName = hitObject.name || hitObject.userData.stableMeshId || ''
    return fallbackName ? { objectName: fallbackName, motionObjectName: fallbackName } : null
  }

  const nearestNamed = namedPath[0]!
  const farthestNamed = [...namedPath].reverse().find((entry) => entry.object instanceof THREE.Group) ?? namedPath[namedPath.length - 1]!

  return {
    objectName: farthestNamed.name,
    motionObjectName: nearestNamed.name,
  }
}

function resolveInteractiveNodes(object: THREE.Object3D | null, info: { size: THREE.Vector3 } | null, bindingMap: InteractiveBindingMap): ResolvedInteractiveNode[] {
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

      const normalizedName = normalizeSearchText(objectName)
      const text = normalizeSearchText(`${objectName} ${child.userData.stableMeshId ?? ''} ${hierarchyTrail.join(' ')}`)
      const typeLabel = child instanceof THREE.Mesh ? 'mesh' : 'group'
      allNamedObjects.push(`${typeLabel}: ${objectName}`)

      candidates.push({
        text,
        normalizedName,
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
    const binding = bindingMap[node.id]
    const boundCandidateIndex = findCandidateIndexByObjectName(candidates, binding?.objectName)
    const candidateIndex = boundCandidateIndex >= 0 && !usedCandidateIndexes.has(boundCandidateIndex)
      ? boundCandidateIndex
      : candidates
          .map((candidate, index) => ({ candidate, index, score: scoreCandidate(candidate, node) }))
          .filter(({ index, score }) => !usedCandidateIndexes.has(index) && score > 0)
          .sort((left, right) => right.score - left.score)[0]?.index ?? -1

    if (candidateIndex >= 0) {
      usedCandidateIndexes.add(candidateIndex)
      const candidate = candidates[candidateIndex]!
      const motionObject = binding?.motionObjectName
        ? findObjectByName(candidate.object, binding.motionObjectName) ?? findObjectByName(object, binding.motionObjectName) ?? candidate.object
        : node.kind === 'valve'
          ? findMotionObject(candidate.object, node.handleKeywords)
          : candidate.object
      return {
        ...node,
        position: candidate.center.clone(),
        source: 'object' as const,
        objectName: candidate.objectName,
        objectRef: candidate.object,
        motionObjectName: motionObject.name || candidate.objectName,
        motionObjectRef: motionObject,
      }
    }

    return {
      ...node,
      position: getFallbackPosition(node.fallback, info),
      source: 'fallback' as const,
    }
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

function getLineColor(lineId: LineId): string {
  return LINE_VISUALS[lineId].color
}

function getValveMap(valves: ValveState[]): Record<ValveId, ValveStatus> {
  return valves.reduce<Record<ValveId, ValveStatus>>((acc, valve) => {
    acc[valve.id] = valve.status
    return acc
  }, {} as Record<ValveId, ValveStatus>)
}

function getLineOutletFlow(lineId: LineId, sourceFlow: number, valveMap: Record<ValveId, ValveStatus>): number {
  if (sourceFlow <= 0) return 0
  const valvesOpen = LINE_VISUALS[lineId].valveIds.every((valveId) => valveMap[valveId] === 'abierta')
  return valvesOpen ? sourceFlow : 0
}

function getAutoBackupTargets(blowers: BlowerState[], outletFlowByLine: Record<LineId, number>): PrimaryLineId[] {
  return PRIMARY_LINE_IDS.filter((lineId) => {
    const blowerId = LINE_VISUALS[lineId].blowerId
    const blower = blowers.find((item) => item.id === blowerId)
    if (!blower) return false
    return blower.status === 'detenida' || outletFlowByLine[lineId] <= 0
  })
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
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} depthTest={false} depthWrite={false} transparent opacity={0.98} />
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

function BlowerStatusBillboard({
  node,
  blower,
  selected,
  onClick,
}: {
  node: ResolvedInteractiveNode
  blower: BlowerState
  selected: boolean
  onClick: () => void
}) {
  const statusColor = blower.status === 'operativa' ? 'bg-emerald-500/90' : blower.status === 'revision' ? 'bg-amber-500/90' : 'bg-rose-500/90'

  return (
    <Html position={[node.position.x, node.position.y + 0.22, node.position.z]} center distanceFactor={7} zIndexRange={[25, 0]}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white shadow-lg backdrop-blur transition-transform hover:scale-[1.03]',
          statusColor,
          selected ? 'border-white/80' : 'border-black/20',
        )}
        title={`${blower.label} ${blower.status === 'operativa' ? 'ON' : blower.status === 'revision' ? 'REV' : 'OFF'}`}
      >
        {blower.id} {blower.status === 'operativa' ? 'ON' : blower.status === 'revision' ? 'REV' : 'OFF'}
      </button>
    </Html>
  )
}

function buildMeshToNodeMap(resolvedNodes: ResolvedInteractiveNode[], modelObject: THREE.Object3D | null): Map<string, FocusedAssetId> {
  const map = new Map<string, FocusedAssetId>()
  for (const node of resolvedNodes) {
    if (!node.objectRef) continue
    node.objectRef.traverse((child) => {
      if (child.type === 'Mesh' && child.userData.stableMeshId) {
        map.set(child.userData.stableMeshId, node.id)
      }
    })
  }

  if (modelObject) {
    modelObject.traverse((child) => {
      if (child.type !== 'Mesh') return
      const stableMeshId = child.userData.stableMeshId as string | undefined
      if (!stableMeshId || map.has(stableMeshId)) return
      const box = new THREE.Box3().setFromObject(child)
      if (box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3())
      let bestDistance = 0.22
      let bestNodeId: FocusedAssetId | null = null
      for (const node of resolvedNodes) {
        const distance = center.distanceTo(node.position)
        if (distance < bestDistance) {
          bestDistance = distance
          bestNodeId = node.id
        }
      }
      if (bestNodeId) {
        map.set(stableMeshId, bestNodeId)
      }
    })
  }

  return map
}

function MeshClickHandler({
  meshToNodeMap,
  modelRoot,
  editMode,
  assignmentTargetId,
  onHoverBindingCandidate,
  onAssignBinding,
  onToggleBlower,
  onToggleValve,
}: {
  meshToNodeMap: Map<string, FocusedAssetId>
  modelRoot: THREE.Object3D | null
  editMode: boolean
  assignmentTargetId: FocusedAssetId | null
  onHoverBindingCandidate?: (binding: { objectName: string; motionObjectName?: string } | null) => void
  onAssignBinding?: (assetId: FocusedAssetId, binding: { objectName: string; motionObjectName?: string }) => void
  onToggleBlower: (blowerId: BlowerId) => void
  onToggleValve: (valveId: ValveId) => void
}) {
  const { camera, scene, gl } = useThree()
  const raycaster = useRef(new THREE.Raycaster())

  const getSelectionFromEvent = useCallback((event: MouseEvent) => {
    const rect = gl.domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycaster.current.setFromCamera(mouse, camera)
    return raycaster.current.intersectObjects(scene.children, true)
  }, [camera, gl, scene])

  useEffect(() => {
    const canvas = gl.domElement

    const isModelMesh = (obj: THREE.Object3D): boolean =>
      obj.type === 'Mesh' && !obj.userData.isDimensionHelper && !obj.userData.isGrid && !obj.userData.isHighlight && !obj.userData.isSnapIndicator

    const handleAssignClick = (event: MouseEvent) => {
      const intersects = getSelectionFromEvent(event)
      console.log('[Editor] click — intersects:', intersects.length, intersects.slice(0, 3).map((i) => ({ type: i.object.type, name: i.object.name, sid: i.object.userData.stableMeshId })))
      const hit = intersects.find((i) => isModelMesh(i.object))
      if (!hit) { console.log('[Editor] click — no model mesh hit'); return }
      if (editMode && assignmentTargetId && modelRoot && onAssignBinding) {
        const selection = getNamedSelectionFromHit(hit.object, modelRoot)
        console.log('[Editor] click — selection:', selection)
        if (selection) {
          onAssignBinding(assignmentTargetId, selection)
        }
      }
    }

    const handleHover = (event: MouseEvent) => {
      if (!editMode || !modelRoot || !onHoverBindingCandidate) return
      const intersects = getSelectionFromEvent(event)
      const hit = intersects.find((i) => isModelMesh(i.object))
      if (hit) {
        const selection = getNamedSelectionFromHit(hit.object, modelRoot)
        onHoverBindingCandidate(selection)
        canvas.style.cursor = selection ? 'crosshair' : 'default'
        return
      }
      onHoverBindingCandidate(null)
      canvas.style.cursor = 'default'
    }

    const handleToggleWithDoubleClick = (event: MouseEvent) => {
      const intersects = getSelectionFromEvent(event)
      const hit = intersects.find((i) => isModelMesh(i.object))
      if (!hit) return
      const stableMeshId = (hit.object as THREE.Mesh).userData.stableMeshId as string | undefined
      if (!stableMeshId) return
      const nodeId = meshToNodeMap.get(stableMeshId)
      if (!nodeId) return
      if (nodeId.startsWith('S')) {
        onToggleBlower(nodeId as BlowerId)
      } else {
        onToggleValve(nodeId as ValveId)
      }
    }

    if (editMode) {
      canvas.addEventListener('click', handleAssignClick)
      canvas.addEventListener('mousemove', handleHover)
      canvas.style.cursor = assignmentTargetId ? 'crosshair' : 'default'
      return () => {
        canvas.removeEventListener('click', handleAssignClick)
        canvas.removeEventListener('mousemove', handleHover)
        canvas.style.cursor = 'default'
        onHoverBindingCandidate?.(null)
      }
    }

    canvas.addEventListener('dblclick', handleToggleWithDoubleClick)
    return () => {
      canvas.removeEventListener('dblclick', handleToggleWithDoubleClick)
      canvas.style.cursor = 'default'
    }
  }, [assignmentTargetId, editMode, getSelectionFromEvent, gl, meshToNodeMap, modelRoot, onAssignBinding, onHoverBindingCandidate, onToggleBlower, onToggleValve])

  return null
}

function RealMeshEffects({
  resolvedNodes,
  blowers,
  valves,
}: {
  resolvedNodes: ResolvedInteractiveNode[]
  blowers: BlowerState[]
  valves: ValveState[]
}) {
  const originalMaterials = useRef(new Map<string, THREE.Material | THREE.Material[]>())
  const baseRotations = useRef(new Map<string, THREE.Euler>())

  useEffect(() => {
    for (const node of resolvedNodes) {
      if (node.kind !== 'blower' || !node.objectRef) continue
      const blower = blowers.find((item) => item.id === node.id)
      if (!blower) continue

      const color = getBlowerStatusColor(blower.status)
      node.objectRef.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const key = child.uuid
        if (!originalMaterials.current.has(key)) {
          originalMaterials.current.set(key, Array.isArray(child.material) ? child.material.map((material) => material.clone()) : child.material.clone())
        }
        const material = child.material
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
          material.emissive.set(color)
          material.emissiveIntensity = blower.status === 'operativa' ? 0.35 : blower.status === 'revision' ? 0.2 : 0.12
          material.needsUpdate = true
        }
      })
    }
  }, [resolvedNodes, blowers])

  useFrame(() => {
    for (const node of resolvedNodes) {
      if (node.kind !== 'valve') continue
      const valve = valves.find((item) => item.id === node.id)
      if (!valve) continue

      const actionLink = MODEL_ACTION_LINKS[node.id]
      const motionObject = node.motionObjectRef ?? node.objectRef
      if (motionObject) {
        if (!baseRotations.current.has(motionObject.uuid)) {
          baseRotations.current.set(motionObject.uuid, motionObject.rotation.clone())
        }
        const baseRotation = baseRotations.current.get(motionObject.uuid)!
        const axis = actionLink.transform === 'rotate-y' ? 'y' : 'z'
        const targetAngle = baseRotation[axis] + (valve.status === 'abierta' ? 0 : Math.PI / 2)
        motionObject.rotation[axis] = THREE.MathUtils.lerp(motionObject.rotation[axis], targetAngle, 0.12)
      }

      if (!node.objectRef) continue
      const color = getValveStatusColor(valve.status)
      node.objectRef.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return
        const key = child.uuid
        if (!originalMaterials.current.has(key)) {
          originalMaterials.current.set(key, Array.isArray(child.material) ? child.material.map((material) => material.clone()) : child.material.clone())
        }
        const material = child.material
        if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
          material.emissive.set(color)
          material.emissiveIntensity = 0.2
          material.needsUpdate = true
        }
      })
    }
  })

  return null
}

function appendPathSegments({
  collector,
  segmentPrefix,
  start,
  valveNodes,
  outlet,
  valveMap,
  sourceActive,
  color,
}: {
  collector: FlowSegment[]
  segmentPrefix: string
  start: THREE.Vector3
  valveNodes: ResolvedInteractiveNode[]
  outlet: THREE.Vector3
  valveMap: Record<ValveId, ValveStatus>
  sourceActive: boolean
  color: string
}) {
  let upstreamActive = sourceActive
  let currentPoint = start

  valveNodes.forEach((valveNode, index) => {
    collector.push({
      id: `${segmentPrefix}-to-${valveNode.id}`,
      start: currentPoint,
      end: valveNode.position,
      active: upstreamActive,
      color,
    })
    currentPoint = valveNode.position
    if (valveMap[valveNode.id as ValveId] === 'cerrada') {
      upstreamActive = false
    }
    if (index === valveNodes.length - 1) {
      collector.push({
        id: `${segmentPrefix}-to-outlet`,
        start: currentPoint,
        end: outlet,
        active: upstreamActive,
        color,
      })
    }
  })

  if (valveNodes.length === 0) {
    collector.push({
      id: `${segmentPrefix}-to-outlet`,
      start,
      end: outlet,
      active: upstreamActive,
      color,
    })
  }
}

function SopladorasBaader142InteractiveCanvasOverlay({
  blowers,
  valves,
  blowerFlow,
  backupTargets,
  bindingMap,
  editMode,
  assignmentTargetId,
  onHoverBindingCandidate,
  focusedAssetId,
  onAssignBinding,
  onToggleBlower,
  onToggleValve,
  onResolvedNodesChange,
}: {
  blowers: BlowerState[]
  valves: ValveState[]
  blowerFlow: Record<BlowerId, number>
  backupTargets: PrimaryLineId[]
  bindingMap: InteractiveBindingMap
  editMode: boolean
  assignmentTargetId: FocusedAssetId | null
  onHoverBindingCandidate?: (binding: { objectName: string; motionObjectName?: string } | null) => void
  focusedAssetId: FocusedAssetId
  onAssignBinding?: (assetId: FocusedAssetId, binding: { objectName: string; motionObjectName?: string }) => void
  onToggleBlower: (blowerId: BlowerId) => void
  onToggleValve: (valveId: ValveId) => void
  onResolvedNodesChange?: (meta: ResolvedNodeMeta) => void
}) {
  const { object, info } = useViewer3DModelContext()

  const resolvedNodes = useMemo(() => resolveInteractiveNodes(object, info, bindingMap), [bindingMap, object, info])

  useEffect(() => {
    if (!onResolvedNodesChange) return
    const nextMeta = resolvedNodes.reduce<ResolvedNodeMeta>((acc, node) => {
      acc[node.id] = { source: node.source, objectName: node.objectName, motionObjectName: node.motionObjectName }
      return acc
    }, {})
    onResolvedNodesChange(nextMeta)
  }, [onResolvedNodesChange, resolvedNodes])

  const nodeMap = useMemo(() => new Map(resolvedNodes.map((node) => [node.id, node])), [resolvedNodes])
  const valveMap = useMemo(() => getValveMap(valves), [valves])

  const anchors = useMemo(() => {
    if (!info) return null
    return {
      L1: getFallbackPosition(LINE_VISUALS.L1.outletFallback, info),
      L2: getFallbackPosition(LINE_VISUALS.L2.outletFallback, info),
      L3: getFallbackPosition(LINE_VISUALS.L3.outletFallback, info),
      manifold: getFallbackPosition(LINE_VISUALS.L4.manifoldFallback ?? LINE_VISUALS.L4.outletFallback, info),
    }
  }, [info])

  const segments = useMemo(() => {
    if (!anchors) return []

    const nextSegments: FlowSegment[] = []

    PRIMARY_LINE_IDS.forEach((lineId) => {
      const lineConfig = LINE_VISUALS[lineId]
      const blowerNode = nodeMap.get(lineConfig.blowerId)
      if (!blowerNode) return
      const valveNodes = lineConfig.valveIds
        .map((valveId) => nodeMap.get(valveId))
        .filter((item): item is ResolvedInteractiveNode => !!item)
      appendPathSegments({
        collector: nextSegments,
        segmentPrefix: `${lineId}-direct`,
        start: blowerNode.position,
        valveNodes,
        outlet: getPrimaryLineAnchor(anchors, lineId),
        valveMap,
        sourceActive: blowerFlow[lineConfig.blowerId] > 0,
        color: lineConfig.color,
      })
    })

    const backupBlowerNode = nodeMap.get('S4')
    const backupValveNode = nodeMap.get('L4_VB1')
    if (backupBlowerNode && backupValveNode) {
      const supplyActive = blowerFlow.S4 > 0
      nextSegments.push({
        id: 'L4-supply-to-valve',
        start: backupBlowerNode.position,
        end: backupValveNode.position,
        active: supplyActive,
        color: LINE_VISUALS.L4.color,
      })
      nextSegments.push({
        id: 'L4-valve-to-manifold',
        start: backupValveNode.position,
        end: anchors.manifold,
        active: supplyActive && valveMap.L4_VB1 === 'abierta',
        color: LINE_VISUALS.L4.color,
      })

      const backupShare = backupTargets.length > 0 ? blowerFlow.S4 / backupTargets.length : 0
      const backupAvailable = supplyActive && valveMap.L4_VB1 === 'abierta' && backupShare > 0

      backupTargets.forEach((lineId) => {
        const lineConfig = LINE_VISUALS[lineId]
        const valveNodes = lineConfig.valveIds
          .map((valveId) => nodeMap.get(valveId))
          .filter((item): item is ResolvedInteractiveNode => !!item)
        appendPathSegments({
          collector: nextSegments,
          segmentPrefix: `${lineId}-backup`,
          start: anchors.manifold,
          valveNodes,
          outlet: getPrimaryLineAnchor(anchors, lineId),
          valveMap,
          sourceActive: backupAvailable,
          color: lineConfig.color,
        })
      })
    }

    return nextSegments
  }, [anchors, backupTargets, blowerFlow, nodeMap, valveMap])

  const meshToNodeMap = useMemo(() => buildMeshToNodeMap(resolvedNodes, object), [resolvedNodes, object])

  if (!anchors) return null

  // In edit mode, render ONLY the click handler — skip all 3D overlays,
  // Html billboards, flow lines and effects to avoid GPU overload / WebGL context loss.
  if (editMode) {
    return (
      <MeshClickHandler
        meshToNodeMap={meshToNodeMap}
        modelRoot={object}
        editMode={editMode}
        assignmentTargetId={assignmentTargetId}
        onHoverBindingCandidate={onHoverBindingCandidate}
        onAssignBinding={onAssignBinding}
        onToggleBlower={onToggleBlower}
        onToggleValve={onToggleValve}
      />
    )
  }

  return (
    <>
      <MeshClickHandler
        meshToNodeMap={meshToNodeMap}
        modelRoot={object}
        editMode={editMode}
        assignmentTargetId={assignmentTargetId}
        onHoverBindingCandidate={onHoverBindingCandidate}
        onAssignBinding={onAssignBinding}
        onToggleBlower={onToggleBlower}
        onToggleValve={onToggleValve}
      />
      <RealMeshEffects resolvedNodes={resolvedNodes} blowers={blowers} valves={valves} />

      {segments.map((segment, index) => {
        const color = segment.active ? segment.color : '#475569'
        return (
          <group key={segment.id}>
            <Line points={[segment.start, segment.end]} color={color} lineWidth={segment.active ? 2.8 : 1.4} depthTest={false} transparent opacity={segment.active ? 0.96 : 0.48} />
            {segment.active ? <FlowPulse start={segment.start} end={segment.end} color={color} speed={0.26 + index * 0.02} delay={index * 0.12} /> : null}
          </group>
        )
      })}

      {resolvedNodes.map((node) => {
        if (node.kind === 'blower') {
          const blower = blowers.find((item) => item.id === node.id)
          if (!blower) return null
          if (node.source === 'fallback') {
            return (
              <InteractiveAssetProxy
                key={node.id}
                node={node}
                color={getBlowerStatusColor(blower.status)}
                selected={focusedAssetId === node.id}
                isActive={blower.status === 'operativa'}
                onClick={() => onToggleBlower(node.id as BlowerId)}
              />
            )
          }
          return (
            <BlowerStatusBillboard
              key={node.id}
              node={node}
              blower={blower}
              selected={focusedAssetId === node.id}
              onClick={() => onToggleBlower(node.id as BlowerId)}
            />
          )
        }

        const valve = valves.find((item) => item.id === node.id)
        if (!valve || node.source === 'object') return null
        return (
          <InteractiveAssetProxy
            key={node.id}
            node={node}
            color={getValveStatusColor(valve.status)}
            selected={focusedAssetId === node.id}
            isActive={valve.status === 'abierta'}
            onClick={() => onToggleValve(node.id as ValveId)}
          />
        )
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

function ModelBoundExperience({ modelId, modelName: _modelName, className, modelUrl, modelFormat, canEditMappings = false, currentUserId = 'system' }: Required<Pick<SopladorasBaader142InteractiveExperienceProps, 'modelName' | 'modelUrl' | 'modelFormat'>> & Pick<SopladorasBaader142InteractiveExperienceProps, 'className' | 'modelId' | 'canEditMappings' | 'currentUserId'>) {
  const { toast } = useToast()
  const mode: OperatingMode = 'produccion'
  const [backupMode, setBackupMode] = useState<BackupMode>('auto')
  const [manualBackupTarget, setManualBackupTarget] = useState<PrimaryLineId | null>('L1')
  const [focusedAssetId, setFocusedAssetId] = useState<FocusedAssetId>('S1')
  const [assignmentTargetId, setAssignmentTargetId] = useState<FocusedAssetId | null>(null)
  const [editMappingsMode, setEditMappingsMode] = useState(false)
  const [bindings, setBindings] = useState<InteractiveBinding[]>([])
  const [lastPickedBinding, setLastPickedBinding] = useState<{ assetId: FocusedAssetId; objectName: string; motionObjectName?: string } | null>(null)
  const [hoveredBindingCandidate, setHoveredBindingCandidate] = useState<{ objectName: string; motionObjectName?: string } | null>(null)
  const [resetKey, setResetKey] = useState(0)
  const viewPreset = 'front' as const
  const [resolvedNodeMeta, setResolvedNodeMeta] = useState<ResolvedNodeMeta>({})
  const [blowers, setBlowers] = useState<BlowerState[]>(INITIAL_BLOWERS)
  const [valves, setValves] = useState<ValveState[]>(INITIAL_VALVES)

  useEffect(() => {
    if (!modelId) {
      setBindings([])
      return
    }
    const unsubscribe = subscribeToInteractiveBindings(
      modelId,
      setBindings,
      (error) => {
        console.warn('[InteractiveBindings] Firestore subscription error (may be permissions):', error.message)
      },
    )
    return () => unsubscribe()
  }, [modelId])

  useEffect(() => {
    if (!editMappingsMode) {
      setAssignmentTargetId(null)
    }
  }, [editMappingsMode])

  const bindingMap = useMemo(() => getBindingMap(bindings), [bindings])

  const blowerFlow = useMemo(() => {
    return blowers.reduce<Record<BlowerId, number>>((acc, blower) => {
      const statusFactor = blower.status === 'operativa' ? 1 : blower.status === 'revision' ? 0.58 : 0
      acc[blower.id] = Math.round(blower.baseFlow * MODE_FLOW_FACTOR[mode] * statusFactor)
      return acc
    }, {} as Record<BlowerId, number>)
  }, [blowers, mode])

  const valveMap = useMemo(() => getValveMap(valves), [valves])
  const outletFlowByLine = useMemo(() => {
    return (Object.keys(LINE_VISUALS) as LineId[]).reduce<Record<LineId, number>>((acc, lineId) => {
      const blowerId = LINE_VISUALS[lineId].blowerId
      acc[lineId] = getLineOutletFlow(lineId, blowerFlow[blowerId], valveMap)
      return acc
    }, {} as Record<LineId, number>)
  }, [blowerFlow, valveMap])

  const meshAnchoredCount = useMemo(() => Object.values(resolvedNodeMeta).filter((node) => node?.source === 'object').length, [resolvedNodeMeta])
  const autoBackupTargets = useMemo(() => getAutoBackupTargets(blowers, outletFlowByLine), [blowers, outletFlowByLine])
  const backupTargets = useMemo<PrimaryLineId[]>(() => {
    if (backupMode === 'off') return []
    if (backupMode === 'manual') return manualBackupTarget ? [manualBackupTarget] : []
    return autoBackupTargets
  }, [autoBackupTargets, backupMode, manualBackupTarget])
  const backupOnline = useMemo(() => backupTargets.length > 0 && blowerFlow.S4 > 0 && valveMap.L4_VB1 === 'abierta', [backupTargets, blowerFlow, valveMap])

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
    setManualBackupTarget('L1')
    setFocusedAssetId('S1')
    setResetKey((value) => value + 1)
    setBlowers(INITIAL_BLOWERS)
    setValves(INITIAL_VALVES)
  }, [])

  const handleAssignBinding = useCallback(async (assetId: FocusedAssetId, binding: { objectName: string; motionObjectName?: string }) => {
    setFocusedAssetId(assetId)
    setLastPickedBinding({ assetId, objectName: binding.objectName, motionObjectName: binding.motionObjectName })
    if (!modelId) return

    try {
      await setInteractiveBinding(modelId, {
        assetId,
        objectName: binding.objectName,
        motionObjectName: binding.motionObjectName,
        updatedBy: currentUserId,
      })
      toast({
        title: `Enlace guardado para ${assetId}`,
        description: binding.motionObjectName ? `${binding.objectName} / manilla ${binding.motionObjectName}` : binding.objectName,
      })
    } catch (error) {
      toast({
        title: 'Error al guardar enlace',
        description: error instanceof Error ? error.message : 'No se pudo persistir el binding del asset.',
        variant: 'destructive',
      })
    }
  }, [currentUserId, modelId, toast])

  const handleClearBinding = useCallback(async () => {
    if (!modelId || !assignmentTargetId) return
    try {
      await deleteInteractiveBinding(modelId, assignmentTargetId)
      toast({ title: `Enlace eliminado para ${assignmentTargetId}` })
    } catch (error) {
      toast({
        title: 'Error al quitar enlace',
        description: error instanceof Error ? error.message : 'No se pudo eliminar el binding.',
        variant: 'destructive',
      })
    }
  }, [assignmentTargetId, modelId, toast])

  const handleAssetButton = useCallback((assetId: FocusedAssetId) => {
    setFocusedAssetId(assetId)
    if (editMappingsMode) {
      setAssignmentTargetId(assetId)
      return
    }

    if (assetId.startsWith('S')) {
      handleToggleBlowerPower(assetId as BlowerId)
      return
    }
    handleToggleValve(assetId as ValveId)
  }, [editMappingsMode, handleToggleBlowerPower, handleToggleValve])

  const activeBinding = assignmentTargetId ? bindingMap[assignmentTargetId] : undefined
  const activeResolvedMeta = assignmentTargetId ? resolvedNodeMeta[assignmentTargetId] : undefined

  return (
    <div className={cn('grid h-full gap-3 bg-card p-3', className)}>
      <div className="relative min-h-[860px] overflow-hidden rounded-xl border bg-background">
        <Viewer3D url={modelUrl} format={modelFormat} resetKey={resetKey} viewPreset={viewPreset}>
          <SopladorasBaader142InteractiveCanvasOverlay
            blowers={blowers}
            valves={valves}
            blowerFlow={blowerFlow}
            backupTargets={backupTargets}
            bindingMap={bindingMap}
            editMode={editMappingsMode}
            assignmentTargetId={assignmentTargetId}
            onHoverBindingCandidate={setHoveredBindingCandidate}
            focusedAssetId={focusedAssetId}
            onAssignBinding={handleAssignBinding}
            onToggleBlower={handleToggleBlowerPower}
            onToggleValve={handleToggleValve}
            onResolvedNodesChange={setResolvedNodeMeta}
          />
        </Viewer3D>

        <div className="pointer-events-none absolute inset-x-2 top-2 z-10">
          <div className="pointer-events-auto rounded-xl border bg-background/88 p-2 backdrop-blur">
            {canEditMappings ? (
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/70 px-2 py-1.5">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Modo enlaces</p>
                  <p className="text-[11px] text-muted-foreground">
                    {editMappingsMode
                      ? assignmentTargetId
                        ? `Seleccionado ${assignmentTargetId}. Pasa sobre la pieza y haz clic para asignarla.`
                        : 'Editor activo. Elige un asset y luego haz clic sobre el modelo.'
                      : 'Activa el editor para asignar cada boton a su grupo real del GLB.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant={editMappingsMode ? 'default' : 'outline'} className="h-8 px-2.5 text-xs" onClick={() => setEditMappingsMode((value) => !value)}>
                    {editMappingsMode ? 'Salir editor' : 'Editar enlaces'}
                  </Button>
                  {editMappingsMode && assignmentTargetId ? (
                    <Button size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={handleClearBinding}>
                      Quitar enlace
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="grid gap-2 xl:grid-cols-[1fr_1.4fr_0.9fr]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sopladoras</p>
                  <span className="text-[10px] text-muted-foreground/80">{editMappingsMode ? 'Selecciona para enlazar' : 'ON, REV u OFF'}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {blowers.map((blower) => {
                    const actionLink = MODEL_ACTION_LINKS[blower.id]
                    return (
                      <Button
                        key={blower.id}
                        size="sm"
                        variant={editMappingsMode ? (assignmentTargetId === blower.id ? 'default' : 'outline') : blower.status === 'operativa' ? 'default' : 'outline'}
                        className="h-8 gap-1.5 px-2.5 text-xs"
                        onClick={() => handleAssetButton(blower.id)}
                        title={editMappingsMode ? (bindingMap[blower.id]?.objectName ?? resolvedNodeMeta[blower.id]?.objectName ?? 'Sin grupo asignado') : actionLink.notes}
                      >
                        {blower.id}
                        <span className="text-[10px] opacity-80">{editMappingsMode ? (bindingMap[blower.id]?.objectName ? 'LINK' : 'SET') : blower.status === 'operativa' ? actionLink.activeLabel : blower.status === 'revision' ? 'REV' : actionLink.inactiveLabel}</span>
                      </Button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Valvulas por linea</p>
                  <span className="text-[10px] text-muted-foreground/80">{editMappingsMode ? 'Selecciona para enlazar' : 'Manilla real a 90 grados'}</span>
                </div>
                <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-4">
                  {(Object.keys(LINE_VISUALS) as LineId[]).map((lineId) => (
                    <div key={lineId} className="rounded-lg border bg-background/55 p-1.5">
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getLineColor(lineId) }} />
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{lineId}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {valves.filter((valve) => valve.lineId === lineId).map((valve) => {
                          const actionLink = MODEL_ACTION_LINKS[valve.id]
                          return (
                            <Button
                              key={valve.id}
                              size="sm"
                              variant={editMappingsMode ? (assignmentTargetId === valve.id ? 'default' : 'outline') : valve.status === 'abierta' ? 'default' : 'outline'}
                              className="h-7 gap-1 px-2 text-[11px]"
                              onClick={() => handleAssetButton(valve.id)}
                              title={editMappingsMode ? (bindingMap[valve.id]?.objectName ?? resolvedNodeMeta[valve.id]?.objectName ?? 'Sin grupo asignado') : actionLink.notes}
                            >
                              {valve.id.replace(`${lineId}_`, '')}
                              <span className="text-[10px] opacity-80">{editMappingsMode ? (bindingMap[valve.id]?.objectName ? 'LINK' : 'SET') : valve.status === 'abierta' ? actionLink.activeLabel : actionLink.inactiveLabel}</span>
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Respaldo S4</p>
                  <span className="text-[10px] text-muted-foreground/80">Reparte caudal</span>
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
                  {backupMode === 'manual' && PRIMARY_LINE_IDS.map((lineId) => (
                    <Button
                      key={lineId}
                      size="sm"
                      className="h-8 px-2.5 text-xs"
                      variant={manualBackupTarget === lineId ? 'default' : 'outline'}
                      onClick={() => setManualBackupTarget(lineId)}
                    >
                      {lineId}
                    </Button>
                  ))}
                  <Button size="sm" className="h-8 px-2.5 text-xs" variant="outline" onClick={handleResetSystem}>Reset sistema</Button>
                </div>
              </div>
            </div>

            {editMappingsMode ? (
              <div className="mt-2 rounded-lg border bg-background/65 px-2 py-1.5 text-[11px] text-muted-foreground">
                {assignmentTargetId ? (
                  <>
                    <span className="font-semibold text-foreground">{assignmentTargetId}</span>
                    {' -> '}
                    {activeBinding?.objectName ?? activeResolvedMeta?.objectName ?? 'sin grupo asignado'}
                    {activeBinding?.motionObjectName || activeResolvedMeta?.motionObjectName ? ` / manilla ${activeBinding?.motionObjectName ?? activeResolvedMeta?.motionObjectName}` : ''}
                  </>
                ) : (
                  'Selecciona un asset en la barra superior para empezar a asignar grupos reales.'
                )}
              </div>
            ) : null}

            {editMappingsMode ? (
              <div className="mt-2 rounded-lg border bg-background/65 px-2 py-1.5 text-[11px] text-muted-foreground">
                Hover actual:
                {' '}
                {hoveredBindingCandidate
                  ? `${hoveredBindingCandidate.objectName}${hoveredBindingCandidate.motionObjectName ? ` / manilla ${hoveredBindingCandidate.motionObjectName}` : ''}`
                  : 'sin deteccion debajo del cursor'}
              </div>
            ) : null}

            {editMappingsMode && lastPickedBinding ? (
              <div className="mt-2 rounded-lg border bg-background/65 px-2 py-1.5 text-[11px] text-muted-foreground">
                Ultimo pick: <span className="font-semibold text-foreground">{lastPickedBinding.assetId}</span>
                {' -> '}
                {lastPickedBinding.objectName}
                {lastPickedBinding.motionObjectName ? ` / manilla ${lastPickedBinding.motionObjectName}` : ''}
              </div>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border bg-background/85 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          {meshAnchoredCount}/{INTERACTIVE_NODE_DEFINITIONS.length} assets amarrados a grupos reales del GLB.
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-lg border bg-background/85 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
          {backupOnline ? `S4 respalda ${backupTargets.join(', ')}` : backupMode === 'off' ? 'S4 sin respaldo automatico' : backupMode === 'manual' ? `S4 armado para ${manualBackupTarget ?? 'sin destino'}` : 'S4 en espera como respaldo' }
        </div>
      </div>
    </div>
  )
}

export function SopladorasBaader142InteractiveExperience({ modelId, modelName, className, modelUrl, modelFormat, canEditMappings, currentUserId }: SopladorasBaader142InteractiveExperienceProps) {
  if (!modelUrl || !modelFormat) {
    return <StandalonePanel modelName={modelName} className={className} />
  }

  return (
    <ModelBoundExperience
      modelId={modelId}
      modelName={modelName}
      className={className}
      modelUrl={modelUrl}
      modelFormat={modelFormat}
      canEditMappings={canEditMappings}
      currentUserId={currentUserId}
    />
  )
}
