/**
 * DimensionsTool - Renderiza cotas/dimensiones en el espacio 3D
 * 
 * Dibuja líneas y etiquetas de texto para cada cota almacenada.
 */

import { useMemo } from 'react'
import { Line, Html } from '@react-three/drei'
import type { Dimension3D } from '@/types/models3d'

interface DimensionsToolProps {
  dimensions: Dimension3D[]
}

function DimensionLine({ dim }: { dim: Dimension3D }) {
  // Puntos de la línea
  const points = useMemo(
    () => [
      [dim.p1.x, dim.p1.y, dim.p1.z] as [number, number, number],
      [dim.p2.x, dim.p2.y, dim.p2.z] as [number, number, number],
    ],
    [dim]
  )

  // Punto medio para la etiqueta
  const midPoint = useMemo(
    () => [
      (dim.p1.x + dim.p2.x) / 2,
      (dim.p1.y + dim.p2.y) / 2,
      (dim.p1.z + dim.p2.z) / 2,
    ] as [number, number, number],
    [dim]
  )

  // Texto a mostrar
  const text = dim.label
    ? `${dim.label}: ${dim.length.toFixed(1)} ${dim.unit}`
    : `${dim.length.toFixed(1)} ${dim.unit}`

  return (
    <group userData={{ isDimensionHelper: true }}>
      {/* Line between the two points */}
      <Line
        points={points}
        color="#f59e0b"
        lineWidth={2}
        dashed={false}
      />

      {/* Start point sphere */}
      <mesh position={[dim.p1.x, dim.p1.y, dim.p1.z]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.3} />
      </mesh>

      {/* End point sphere */}
      <mesh position={[dim.p2.x, dim.p2.y, dim.p2.z]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.3} />
      </mesh>

      {/* Label at midpoint */}
      <Html
        position={midPoint}
        center
        distanceFactor={3}
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap select-none"
          style={{
            background: 'rgba(0, 0, 0, 0.85)',
            color: '#f59e0b',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            fontSize: '11px',
            lineHeight: '1.4',
          }}
        >
          {text}
        </div>
      </Html>
    </group>
  )
}

export function DimensionsTool({ dimensions }: DimensionsToolProps) {
  if (dimensions.length === 0) return null

  return (
    <group>
      {dimensions.map((dim) => (
        <DimensionLine key={dim.id} dim={dim} />
      ))}
    </group>
  )
}
