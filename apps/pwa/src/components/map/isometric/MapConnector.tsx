/**
 * MapConnector — Conexiones entre equipos (tuberías, cables, flujo)
 * 
 * Dibuja líneas/tubos entre dos nodos del mapa con animación de flujo opcional.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { MapConnector as MapConnectorType, MapNode } from '@/types/isometricMap'

interface MapConnectorProps {
  connector: MapConnectorType
  fromNode: MapNode
  toNode: MapNode
}

const STYLE_CONFIG = {
  pipe: { radius: 0.12, color: '#6b7280', segments: 12 },
  cable: { radius: 0.04, color: '#f59e0b', segments: 8 },
  flow: { radius: 0.08, color: '#3b82f6', segments: 10 },
  signal: { radius: 0.03, color: '#22d3ee', segments: 6 },
}

export function MapConnector({ connector, fromNode, toNode }: MapConnectorProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const dashRef = useRef<THREE.LineSegments>(null)

  const from = new THREE.Vector3(
    fromNode.position.x,
    fromNode.size.height / 2,
    fromNode.position.z
  )
  const to = new THREE.Vector3(
    toNode.position.x,
    toNode.size.height / 2,
    toNode.position.z
  )

  const config = STYLE_CONFIG[connector.style]
  const color = connector.color || config.color
  const length = from.distanceTo(to)
  const midpoint = from.clone().add(to).multiplyScalar(0.5)

  // Calcular ángulo de rotación
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    to.clone().sub(from).normalize()
  )

  // Animación de flujo (dash offset)
  useFrame(() => {
    if (dashRef.current && connector.animated) {
      dashRef.current.computeLineDistances()
    }
  })

  // Para animación de flujo, usar partículas simples
  if (connector.animated) {
    return (
      <group>
        {/* Tubería base */}
        <mesh position={midpoint} quaternion={quaternion}>
          <cylinderGeometry args={[config.radius, config.radius, length, config.segments]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.4}
            roughness={0.5}
            metalness={0.5}
          />
        </mesh>

        {/* Partículas de flujo animadas */}
        <FlowParticles from={from} to={to} color={color} />
      </group>
    )
  }

  return (
    <mesh ref={meshRef} position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[config.radius, config.radius, length, config.segments]} />
      <meshStandardMaterial
        color={color}
        roughness={0.4}
        metalness={0.6}
      />
    </mesh>
  )
}

/** Partículas animadas que representan flujo entre dos puntos */
function FlowParticles({ from, to, color }: { from: THREE.Vector3; to: THREE.Vector3; color: string }) {
  const groupRef = useRef<THREE.Group>(null)
  const PARTICLE_COUNT = 5

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()

    groupRef.current.children.forEach((child, i) => {
      const progress = ((t * 0.5 + i / PARTICLE_COUNT) % 1)
      const pos = from.clone().lerp(to, progress)
      child.position.copy(pos)
    })
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshBasicMaterial color={color} transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  )
}
