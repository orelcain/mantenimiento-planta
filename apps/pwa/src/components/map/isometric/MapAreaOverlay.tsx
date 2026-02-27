/**
 * MapAreaOverlay — Zonas rectangulares coloreadas en el suelo del mapa isométrico
 * 
 * Representan áreas lógicas (ej: "Zona Bombas", "Área Compresores").
 * Se muestran como rectángulos semi-transparentes sobre el grid.
 */

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import type { MapArea } from '@/types/isometricMap'

interface MapAreaOverlayProps {
  area: MapArea
  selected?: boolean
  onClick?: (areaId: string) => void
}

export function MapAreaOverlay({ area, selected = false, onClick }: MapAreaOverlayProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  // Borde pulsante si está seleccionada
  useFrame(({ clock }) => {
    if (meshRef.current && selected) {
      const t = clock.getElapsedTime()
      const material = meshRef.current.material as THREE.MeshBasicMaterial
      material.opacity = area.opacity * (0.8 + Math.sin(t * 2) * 0.2)
    }
  })

  return (
    <group position={[area.position.x, 0.03, area.position.z]}>
      {/* Superficie coloreada */}
      <mesh
        ref={meshRef}
        rotation-x={-Math.PI / 2}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(area.id)
        }}
      >
        <planeGeometry args={[area.size.width, area.size.depth]} />
        <meshBasicMaterial
          color={area.color}
          transparent
          opacity={area.opacity}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Borde */}
      <lineLoop rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={new Float32Array([
              -area.size.width / 2, -area.size.depth / 2, 0,
              area.size.width / 2, -area.size.depth / 2, 0,
              area.size.width / 2, area.size.depth / 2, 0,
              -area.size.width / 2, area.size.depth / 2, 0,
            ])}
            count={4}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={selected ? '#ffffff' : area.color}
          transparent
          opacity={selected ? 0.9 : 0.5}
          linewidth={1}
        />
      </lineLoop>

      {/* Label de la zona */}
      <Html
        position={[0, 0.5, -area.size.depth / 2 + 0.5]}
        center
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div
          style={{
            background: `${area.color}cc`,
            color: 'white',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          {area.label}
        </div>
      </Html>
    </group>
  )
}
