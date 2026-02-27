/**
 * EquipmentNode — Representación 3D de un equipo en el mapa isométrico
 * 
 * Cada tipo de equipo tiene una geometría distinta:
 * - Bomba: Cilindro horizontal
 * - Motor: Caja con cilindro
 * - Tanque: Cilindro vertical grande
 * - Sensor: Esfera pequeña
 * - Transportador: Caja larga y plana
 * - Válvula: Toroide
 * - Compresor: Caja con esferas
 * - Tubería: Cilindro delgado
 * - Edificio: Caja grande
 * - Genérico: Caja simple
 * 
 * Incluye:
 * - Indicador de estado (color del borde/halo)
 * - Label flotante
 * - Animación de pulso para alertas
 * - Hover/selección highlight
 */

import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { MapNode, OperationalStatus } from '@/types/isometricMap'
import { EQUIPMENT_TYPE_COLORS, STATUS_COLORS } from '@/types/isometricMap'

interface EquipmentNodeProps {
  node: MapNode
  status?: OperationalStatus
  activeIncidents?: number
  sensorValue?: string
  selected?: boolean
  hovered?: boolean
  showLabel?: boolean
  onClick?: (nodeId: string) => void
  onHover?: (nodeId: string | null) => void
}

// Geometrías por tipo de equipo
function EquipmentGeometry({ type, size }: { type: MapNode['type']; size: MapNode['size'] }) {
  const { width: w, height: h, depth: d } = size

  switch (type) {
    case 'pump':
      return (
        <group>
          {/* Cuerpo cilíndrico horizontal */}
          <mesh rotation-z={Math.PI / 2} position={[0, h / 2, 0]}>
            <cylinderGeometry args={[Math.min(w, d) / 2.5, Math.min(w, d) / 2.5, w * 0.8, 16]} />
            <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.pump} roughness={0.3} metalness={0.7} />
          </mesh>
          {/* Entrada/salida */}
          <mesh position={[w * 0.4, h / 2, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[d / 6, d / 6, d * 0.3, 8]} />
            <meshStandardMaterial color="#60a5fa" roughness={0.4} metalness={0.6} />
          </mesh>
          {/* Base */}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[w * 0.6, 0.1, d * 0.6]} />
            <meshStandardMaterial color="#374151" roughness={0.8} />
          </mesh>
        </group>
      )

    case 'motor':
      return (
        <group>
          {/* Cuerpo principal */}
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w * 0.8, h * 0.7, d * 0.8]} />
            <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.motor} roughness={0.3} metalness={0.6} />
          </mesh>
          {/* Eje del motor */}
          <mesh position={[w * 0.45, h / 2, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[d / 8, d / 8, w * 0.3, 12]} />
            <meshStandardMaterial color="#d1d5db" roughness={0.2} metalness={0.9} />
          </mesh>
          {/* Aletas de refrigeración (minibox) */}
          {[0.3, 0.5, 0.7].map((t, i) => (
            <mesh key={i} position={[0, h * t, d * 0.42]}>
              <boxGeometry args={[w * 0.7, h * 0.08, 0.05]} />
              <meshStandardMaterial color="#92400e" roughness={0.5} metalness={0.4} />
            </mesh>
          ))}
        </group>
      )

    case 'tank':
      return (
        <group>
          {/* Cuerpo cilíndrico vertical */}
          <mesh position={[0, h / 2, 0]}>
            <cylinderGeometry args={[Math.min(w, d) / 2, Math.min(w, d) / 2, h, 24]} />
            <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.tank} roughness={0.3} metalness={0.5} transparent opacity={0.85} />
          </mesh>
          {/* Tapa superior */}
          <mesh position={[0, h + 0.05, 0]}>
            <cylinderGeometry args={[Math.min(w, d) / 2, Math.min(w, d) / 2, 0.1, 24]} />
            <meshStandardMaterial color="#0891b2" roughness={0.4} metalness={0.6} />
          </mesh>
          {/* Indicador de nivel */}
          <mesh position={[Math.min(w, d) / 2 + 0.05, h * 0.4, 0]}>
            <boxGeometry args={[0.08, h * 0.6, 0.15]} />
            <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.3} />
          </mesh>
        </group>
      )

    case 'sensor':
      return (
        <group>
          {/* Poste */}
          <mesh position={[0, h * 0.3, 0]}>
            <cylinderGeometry args={[0.05, 0.05, h * 0.6, 8]} />
            <meshStandardMaterial color="#6b7280" roughness={0.5} metalness={0.7} />
          </mesh>
          {/* Cabeza del sensor */}
          <mesh position={[0, h * 0.7, 0]}>
            <sphereGeometry args={[Math.min(w, d) / 3, 16, 16]} />
            <meshStandardMaterial
              color={EQUIPMENT_TYPE_COLORS.sensor}
              emissive={EQUIPMENT_TYPE_COLORS.sensor}
              emissiveIntensity={0.4}
              roughness={0.2}
              metalness={0.8}
            />
          </mesh>
        </group>
      )

    case 'conveyor':
      return (
        <group>
          {/* Estructura */}
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h * 0.3, d]} />
            <meshStandardMaterial color="#4c1d95" roughness={0.4} metalness={0.5} />
          </mesh>
          {/* Cinta */}
          <mesh position={[0, h * 0.7, 0]}>
            <boxGeometry args={[w * 1.05, h * 0.05, d * 0.9]} />
            <meshStandardMaterial color="#7c3aed" roughness={0.7} metalness={0.2} />
          </mesh>
          {/* Rodillos en los extremos */}
          {[-1, 1].map((dir, i) => (
            <mesh key={i} position={[dir * w * 0.45, h / 2, 0]} rotation-z={Math.PI / 2}>
              <cylinderGeometry args={[d / 4, d / 4, 0.15, 12]} />
              <meshStandardMaterial color="#a78bfa" roughness={0.3} metalness={0.7} />
            </mesh>
          ))}
        </group>
      )

    case 'valve':
      return (
        <group>
          {/* Cuerpo */}
          <mesh position={[0, h / 2, 0]}>
            <sphereGeometry args={[Math.min(w, d) / 2.5, 12, 12]} />
            <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.valve} roughness={0.3} metalness={0.6} />
          </mesh>
          {/* Volante */}
          <mesh position={[0, h * 0.8, 0]} rotation-x={Math.PI / 2}>
            <torusGeometry args={[w / 3, 0.05, 8, 16]} />
            <meshStandardMaterial color="#d1d5db" roughness={0.3} metalness={0.8} />
          </mesh>
          {/* Vástago */}
          <mesh position={[0, h * 0.65, 0]}>
            <cylinderGeometry args={[0.04, 0.04, h * 0.3, 8]} />
            <meshStandardMaterial color="#9ca3af" roughness={0.4} metalness={0.7} />
          </mesh>
        </group>
      )

    case 'compressor':
      return (
        <group>
          {/* Cuerpo principal */}
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w * 0.9, h * 0.8, d * 0.9]} />
            <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.compressor} roughness={0.3} metalness={0.5} />
          </mesh>
          {/* Motor superior */}
          <mesh position={[0, h * 0.9, 0]}>
            <cylinderGeometry args={[w / 4, w / 4, h * 0.2, 12]} />
            <meshStandardMaterial color="#9ca3af" roughness={0.3} metalness={0.7} />
          </mesh>
        </group>
      )

    case 'building':
      return (
        <group>
          {/* Estructura */}
          <mesh position={[0, h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.building} roughness={0.8} metalness={0.1} />
          </mesh>
          {/* Techo */}
          <mesh position={[0, h + 0.1, 0]}>
            <boxGeometry args={[w * 1.05, 0.2, d * 1.05]} />
            <meshStandardMaterial color="#57534e" roughness={0.7} metalness={0.2} />
          </mesh>
        </group>
      )

    case 'pipe':
      return (
        <mesh position={[0, h / 2, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[d / 3, d / 3, w, 12]} />
          <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.pipe} roughness={0.3} metalness={0.7} />
        </mesh>
      )

    case 'generic':
    default:
      return (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color={EQUIPMENT_TYPE_COLORS.generic} roughness={0.5} metalness={0.3} />
        </mesh>
      )
  }
}

/** Halo de estado que pulsa */
function StatusIndicator({ status, size, pulse }: { status: OperationalStatus; size: number; pulse: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (meshRef.current && pulse) {
      const t = clock.getElapsedTime()
      const scale = 1 + Math.sin(t * 3) * 0.15
      meshRef.current.scale.set(scale, 1, scale)
      meshRef.current.material = meshRef.current.material as THREE.MeshBasicMaterial
    }
  })

  const color = STATUS_COLORS[status]

  return (
    <mesh ref={meshRef} rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
      <ringGeometry args={[size * 0.5, size * 0.6, 32]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={status === 'critical' ? 0.8 : 0.5}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

/** Badge de incidencias activas */
function IncidentBadge({ count, position: pos }: { count: number; position: [number, number, number] }) {
  if (count === 0) return null

  return (
    <Html position={pos} center style={{ pointerEvents: 'none' }}>
      <div
        style={{
          background: count > 2 ? '#ef4444' : '#f59e0b',
          color: 'white',
          borderRadius: '50%',
          width: 22,
          height: 22,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          border: '2px solid white',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        {count}
      </div>
    </Html>
  )
}

export function EquipmentNode({
  node,
  status = 'ok',
  activeIncidents = 0,
  sensorValue,
  selected = false,
  hovered = false,
  showLabel = true,
  onClick,
  onHover,
}: EquipmentNodeProps) {
  const groupRef = useRef<THREE.Group>(null)
  const [isLocalHover, setIsLocalHover] = useState(false)
  const effectiveHover = hovered || isLocalHover

  // Highlight por selección
  const outlineScale = selected ? 1.08 : effectiveHover ? 1.04 : 1

  // Animación suave de hover
  useFrame((_, delta) => {
    if (!groupRef.current) return
    const target = outlineScale
    const current = groupRef.current.scale.x
    const lerped = THREE.MathUtils.lerp(current, target, 1 - Math.exp(-12 * delta))
    groupRef.current.scale.setScalar(lerped)
  })

  const labelY = node.size.height + 0.5

  // Tamaño para el indicator ring
  const ringSize = Math.max(node.size.width, node.size.depth)

  const shouldPulse = status === 'critical' || status === 'warning'

  if (!node.visible) return null

  return (
    <group
      ref={groupRef}
      position={[node.position.x, node.position.y, node.position.z]}
      rotation-y={(node.rotation * Math.PI) / 180}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(node.id)
      }}
      onPointerEnter={(e) => {
        e.stopPropagation()
        setIsLocalHover(true)
        onHover?.(node.id)
        document.body.style.cursor = 'pointer'
      }}
      onPointerLeave={() => {
        setIsLocalHover(false)
        onHover?.(null)
        document.body.style.cursor = 'default'
      }}
    >
      {/* Status ring en el suelo */}
      {status !== 'ok' && (
        <StatusIndicator status={status} size={ringSize} pulse={shouldPulse} />
      )}

      {/* Equipo 3D */}
      <EquipmentGeometry type={node.type} size={node.size} />

      {/* Glow de selección */}
      {(selected || effectiveHover) && (
        <mesh position={[0, node.size.height / 2, 0]}>
          <boxGeometry args={[
            node.size.width * 1.1,
            node.size.height * 1.1,
            node.size.depth * 1.1,
          ]} />
          <meshBasicMaterial
            color={selected ? '#3b82f6' : '#60a5fa'}
            transparent
            opacity={0.12}
            wireframe
          />
        </mesh>
      )}

      {/* Label flotante */}
      {showLabel && (
        <Html
          position={[0, labelY, 0]}
          center
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          <div
            style={{
              background: selected ? 'rgba(59,130,246,0.95)' : 'rgba(15,23,42,0.85)',
              color: 'white',
              padding: '3px 8px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              border: selected ? '1px solid #60a5fa' : '1px solid rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {node.label}
            {sensorValue && (
              <span style={{ marginLeft: 4, opacity: 0.8, fontSize: 10 }}>
                {sensorValue}
              </span>
            )}
          </div>
        </Html>
      )}

      {/* Badge de incidencias */}
      <IncidentBadge
        count={activeIncidents}
        position={[node.size.width / 2 + 0.3, labelY + 0.3, 0]}
      />
    </group>
  )
}
