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
  const hasTiles = area.tiles && area.tiles.length > 0
  const effectiveOpacity = Math.max(0.18, area.opacity)

  // Borde pulsante si está seleccionada
  useFrame(({ clock }) => {
    if (meshRef.current && selected) {
      const t = clock.getElapsedTime()
      const material = meshRef.current.material as THREE.MeshBasicMaterial
      material.opacity = effectiveOpacity * (0.8 + Math.sin(t * 2) * 0.2)
    }
  })

  // Tile-based rendering
  if (hasTiles) {
    return (
      <group>
        {area.tiles!.map((tile) => (
          <mesh
            key={`${tile.x},${tile.z}`}
            rotation-x={-Math.PI / 2}
            position={[tile.x + 0.5, 0.03, tile.z + 0.5]}
            onClick={(e) => {
              e.stopPropagation()
              onClick?.(area.id)
            }}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              color={area.color}
              transparent
              opacity={effectiveOpacity}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
        {/* Label centered */}
        <Html
          position={[area.position.x, 0.5, area.position.z]}
          center
          wrapperClass="map-overlay-html"
          zIndexRange={[2, 0]}
          style={{ pointerEvents: 'none', userSelect: 'none', zIndex: 1 }}
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

  // Rectangular area (original)
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
          opacity={effectiveOpacity}
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
        wrapperClass="map-overlay-html"
        zIndexRange={[2, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none', zIndex: 1 }}
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
