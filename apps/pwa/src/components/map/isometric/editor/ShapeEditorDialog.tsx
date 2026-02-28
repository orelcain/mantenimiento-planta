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

import { useState, useCallback, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { 
  X, Trash2, Copy, Box, Circle, Triangle, 
  RotateCw, Palette, ChevronDown, ChevronUp, Save, 
  Undo2, Layers
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
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#6b7280', '#d1d5db',
  '#1e293b', '#78716c', '#0ea5e9', '#a855f7', '#14b8a6',
]

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
    metalness: 0.5,
    roughness: 0.4,
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
}: {
  primitives: ShapePrimitive[]
  selectedPrimId: string | null
}) {
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
            <mesh>
              {getPrimitiveGeometry(prim)}
              <meshStandardMaterial color={prim.color} roughness={prim.roughness} metalness={prim.metalness} />
            </mesh>
            {isSelected && (
              <mesh>
                {getPrimitiveGeometry(prim)}
                <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.35} />
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
  // Initialize primitives from node's existing custom shape or generate from default type
  const [primitives, setPrimitives] = useState<ShapePrimitive[]>(() => {
    if (node.customShape && node.customShape.length > 0) {
      return [...node.customShape]
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
      metalness: 0.5,
      roughness: 0.4,
    }]
  })

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

  const shapeMetrics = useMemo(() => {
    if (primitives.length === 0) {
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

    for (const prim of primitives) {
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
  }, [primitives])

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

  const handleSave = useCallback(() => {
    onSave(node.id, primitives)
    onClose()
  }, [node.id, primitives, onSave, onClose])

  const handleClearCustom = useCallback(() => {
    onClear(node.id)
    onClose()
  }, [node.id, onClear, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-card border rounded-xl shadow-2xl w-full max-w-[1280px] mx-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Editor de Forma: {node.label}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada cuadro de la grilla = 1m × 1m · Compón primitivas 3D para definir la forma del equipo
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left: Primitive palette + list */}
          <div className="w-72 border-r flex flex-col shrink-0">
            {/* Add primitives */}
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

            {/* Primitive list */}
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
          </div>

          {/* Right: Properties panel */}
          <div className="flex-1 overflow-y-auto min-w-0">
            {selectedPrim ? (
              <div className="p-4 space-y-3">
                {/* Live preview */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
                    <span className="text-xs font-semibold">Visor 3D en vivo</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground hidden sm:inline">Arrastrar: rotar · Rueda: zoom · Shift+arrastrar: mover</span>
                      <Badge variant="secondary" className="text-[10px]">1 cuadro = 1m</Badge>
                    </div>
                  </div>
                  <div className="h-[360px] lg:h-[420px]">
                    <Canvas
                      camera={{
                        position: [shapeMetrics.center[0] + 6, shapeMetrics.center[1] + 4, shapeMetrics.center[2] + 6],
                        fov: 40,
                        near: 0.1,
                        far: 1000,
                      }}
                    >
                      <ShapePreviewScene primitives={primitives} selectedPrimId={selectedPrimId} />
                    </Canvas>
                  </div>
                </div>

                {/* Global metrics */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Caja envolvente</p>
                    <p className="text-xs font-semibold">
                      {shapeMetrics.width} × {shapeMetrics.height} × {shapeMetrics.depth} m
                    </p>
                  </div>
                  <div className="border rounded-lg p-2">
                    <p className="text-[10px] text-muted-foreground">Huella aprox. suelo</p>
                    <p className="text-xs font-semibold">
                      {shapeMetrics.footprint} m² ({shapeMetrics.footprintTiles} cuadros)
                    </p>
                  </div>
                </div>

                {/* Type badge */}
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">{selectedPrim.type}</Badge>
                  <div
                    className="w-4 h-4 rounded border"
                    style={{ backgroundColor: selectedPrim.color }}
                  />
                </div>

                {/* Position section */}
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
                      <DimensionInput label="Met" value={selectedPrim.metalness} min={0} max={1} step={0.05} unit="" onChange={(v) => updatePrimitive(selectedPrim.id, { metalness: v })} />
                      <DimensionInput label="Rug" value={selectedPrim.roughness} min={0} max={1} step={0.05} unit="" onChange={(v) => updatePrimitive(selectedPrim.id, { roughness: v })} />
                    </div>
                  )}
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
              Guardar forma ({primitives.length} primitiva{primitives.length !== 1 ? 's' : ''})
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
