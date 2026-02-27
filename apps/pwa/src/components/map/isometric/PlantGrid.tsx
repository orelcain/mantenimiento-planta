/**
 * PlantGrid — Grilla isométrica 1m × 1m a escala real
 * 
 * Dibuja el suelo de la planta con una grilla métrica visible.
 * Cada celda = 1 metro real. Se puede personalizar tamaño.
 * Incluye etiquetas de ejes opcionales.
 */

import { useMemo } from 'react'
import * as THREE from 'three'
import type { IsometricMapConfig } from '@/types/isometricMap'

interface PlantGridProps {
  config: IsometricMapConfig
}

export function PlantGrid({ config }: PlantGridProps) {
  const { width, depth, cellSize, floorColor, gridColor, gridOpacity, showGrid } = config

  // Generar geometría de líneas de grilla
  const gridLines = useMemo(() => {
    if (!showGrid) return null

    const points: number[] = []
    const halfW = width / 2
    const halfD = depth / 2

    // Líneas en X (a lo largo del ancho)
    for (let z = -halfD; z <= halfD; z += cellSize) {
      points.push(-halfW, 0.01, z, halfW, 0.01, z)
    }

    // Líneas en Z (a lo largo de la profundidad)
    for (let x = -halfW; x <= halfW; x += cellSize) {
      points.push(x, 0.01, -halfD, x, 0.01, halfD)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3)
    )
    return geometry
  }, [width, depth, cellSize, showGrid])

  // Líneas de los ejes principales (más gruesas)
  const axisLines = useMemo(() => {
    const halfW = width / 2
    const halfD = depth / 2
    const points: number[] = []

    // Eje X (rojo)
    points.push(-halfW, 0.02, 0, halfW, 0.02, 0)
    // Eje Z (azul)
    points.push(0, 0.02, -halfD, 0, 0.02, halfD)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3)
    )
    return geometry
  }, [width, depth])

  // Marcas cada 10 metros
  const majorGridLines = useMemo(() => {
    if (!showGrid) return null

    const points: number[] = []
    const halfW = width / 2
    const halfD = depth / 2
    const majorStep = cellSize * 10

    for (let z = -halfD; z <= halfD; z += majorStep) {
      points.push(-halfW, 0.015, z, halfW, 0.015, z)
    }
    for (let x = -halfW; x <= halfW; x += majorStep) {
      points.push(x, 0.015, -halfD, x, 0.015, halfD)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3)
    )
    return geometry
  }, [width, depth, cellSize, showGrid])

  return (
    <group name="plant-grid">
      {/* Suelo */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial
          color={floorColor}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Grilla menor (cada metro) */}
      {gridLines && (
        <lineSegments geometry={gridLines}>
          <lineBasicMaterial
            color={gridColor}
            transparent
            opacity={gridOpacity * 0.5}
          />
        </lineSegments>
      )}

      {/* Grilla mayor (cada 10 metros) */}
      {majorGridLines && (
        <lineSegments geometry={majorGridLines}>
          <lineBasicMaterial
            color={gridColor}
            transparent
            opacity={gridOpacity}
          />
        </lineSegments>
      )}

      {/* Ejes principales */}
      {axisLines && (
        <lineSegments geometry={axisLines}>
          <lineBasicMaterial
            color="#ffffff"
            transparent
            opacity={0.3}
          />
        </lineSegments>
      )}

      {/* Borde del mapa */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 0]}>
        <ringGeometry args={[0, 0, 0]} />
      </mesh>
      <lineSegments>
        <edgesGeometry
          args={[new THREE.PlaneGeometry(width, depth)]}
        />
        <lineBasicMaterial color={gridColor} transparent opacity={gridOpacity * 2} />
      </lineSegments>
    </group>
  )
}

/**
 * PlantFloorBorder — Borde visual del área de la planta
 */
export function PlantFloorBorder({ width, depth, color = '#4a9eff' }: { width: number; depth: number; color?: string }) {
  const points = useMemo(() => {
    const hw = width / 2
    const hd = depth / 2
    return [
      new THREE.Vector3(-hw, 0.03, -hd),
      new THREE.Vector3(hw, 0.03, -hd),
      new THREE.Vector3(hw, 0.03, hd),
      new THREE.Vector3(-hw, 0.03, hd),
      new THREE.Vector3(-hw, 0.03, -hd),
    ]
  }, [width, depth])

  const lineGeometry = useMemo(() => {
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [points])

  return (
    <primitive object={new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6, linewidth: 2 }))} />
  )
}
