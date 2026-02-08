/**
 * DimensionsTool - Renderiza mediciones en el espacio 3D
 * 
 * Soporta:
 * - Distancia: línea entre 2 puntos
 * - Área: polígono de 3+ puntos con relleno semitransparente
 * - Circunferencia: círculo a partir de 3 puntos
 * - Volumen: caja wireframe entre 2 puntos diagonales
 */

import { useMemo, useRef } from 'react'
import { Line, Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Dimension3D, Point3D, MeasurementType } from '@/types/models3d'
import { getUnitSuffix } from '@/types/models3d'

interface DimensionsToolProps {
  dimensions: Dimension3D[]
  /** Puntos pendientes mientras se crea una medición */
  pendingPoints?: Point3D[]
  /** Tipo de medición activa (para el indicador de cierre) */
  measurementType?: MeasurementType
}

// ============================================================================
// Distance Line (original)
// ============================================================================

function DistanceLine({ dim }: { dim: Dimension3D }) {
  const points = useMemo(
    () => [
      [dim.p1.x, dim.p1.y, dim.p1.z] as [number, number, number],
      [dim.p2.x, dim.p2.y, dim.p2.z] as [number, number, number],
    ],
    [dim]
  )

  const midPoint = useMemo(
    () => [
      (dim.p1.x + dim.p2.x) / 2,
      (dim.p1.y + dim.p2.y) / 2,
      (dim.p1.z + dim.p2.z) / 2,
    ] as [number, number, number],
    [dim]
  )

  const text = dim.label
    ? `${dim.label}: ${dim.value.toFixed(1)} ${dim.unit}`
    : `${dim.value.toFixed(1)} ${dim.unit}`

  return (
    <group userData={{ isDimensionHelper: true }}>
      <Line points={points} color="#f59e0b" lineWidth={2} />
      <NumberedPoint position={[dim.p1.x, dim.p1.y, dim.p1.z]} index={1} color="#f59e0b" />
      <NumberedPoint position={[dim.p2.x, dim.p2.y, dim.p2.z]} index={2} color="#f59e0b" />
      <DimensionLabel position={midPoint} text={text} color="#f59e0b" />
    </group>
  )
}

// ============================================================================
// Area Polygon
// ============================================================================

function AreaPolygon({ dim }: { dim: Dimension3D }) {
  const pts = dim.points
  if (pts.length < 3) return null

  const linePoints = useMemo(() => {
    const arr = pts.map((p) => [p.x, p.y, p.z] as [number, number, number])
    arr.push(arr[0]!) // cerrar polígono
    return arr
  }, [pts])

  const centroid = useMemo(() => {
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
    const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    const cz = pts.reduce((s, p) => s + p.z, 0) / pts.length
    return [cx, cy, cz] as [number, number, number]
  }, [pts])

  const suffix = getUnitSuffix(dim.unit, 'area')
  const text = dim.label
    ? `${dim.label}: ${dim.value.toFixed(2)} ${suffix}`
    : `${dim.value.toFixed(2)} ${suffix}`

  // Mesh fill (triangulate from centroid as simple fan)
  const fillGeom = useMemo(() => {
    const geom = new THREE.BufferGeometry()
    const vertices: number[] = []
    const c = centroid
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i]!
      const next = pts[(i + 1) % pts.length]!
      vertices.push(c[0], c[1], c[2], cur.x, cur.y, cur.z, next.x, next.y, next.z)
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geom.computeVertexNormals()
    return geom
  }, [pts, centroid])

  return (
    <group userData={{ isDimensionHelper: true }}>
      <Line points={linePoints} color="#10b981" lineWidth={2} />
      {pts.map((p, i) => (
        <NumberedPoint key={i} position={[p.x, p.y, p.z]} index={i + 1} color="#10b981" />
      ))}
      <mesh geometry={fillGeom}>
        <meshStandardMaterial
          color="#10b981"
          transparent
          opacity={0.15}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <DimensionLabel position={centroid} text={text} color="#10b981" />
    </group>
  )
}

// ============================================================================
// Circumference Circle
// ============================================================================

function CircumferenceLine({ dim }: { dim: Dimension3D }) {
  const pts = dim.points
  if (pts.length < 3 || !dim.radius) return null

  // Recrear el centro y el círculo a partir de la info guardada
  const circlePoints = useMemo(() => {
    const p0 = pts[0]!, p1 = pts[1]!, p2 = pts[2]!

    // Calcular centro real y normal del plano
    const A = new THREE.Vector3(p0.x, p0.y, p0.z)
    const B = new THREE.Vector3(p1.x, p1.y, p1.z)
    const C = new THREE.Vector3(p2.x, p2.y, p2.z)
    const AB = B.clone().sub(A)
    const AC = C.clone().sub(A)
    const normal = AB.clone().cross(AC).normalize()

    if (normal.length() < 1e-6) return []

    // Centro del círculo circunscrito
    const abMid = A.clone().add(B).multiplyScalar(0.5)
    const acMid = A.clone().add(C).multiplyScalar(0.5)
    const bisAB = AB.clone().cross(normal)
    const bisAC = AC.clone().cross(normal)
    const crossBis = bisAB.clone().cross(bisAC)
    const crossBisLen2 = crossBis.lengthSq()
    if (crossBisLen2 < 1e-15) return []

    const d = acMid.clone().sub(abMid)
    const dCrossBisAC = d.clone().cross(bisAC)
    const s = dCrossBisAC.dot(crossBis) / crossBisLen2
    const circCenter = abMid.clone().add(bisAB.clone().multiplyScalar(s))
    const r = circCenter.distanceTo(A)

    // Generar puntos del círculo
    const u = AB.clone().normalize()
    const v = normal.clone().cross(u).normalize()
    const segments = 64
    const result: [number, number, number][] = []
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2
      const x = circCenter.x + r * Math.cos(angle) * u.x + r * Math.sin(angle) * v.x
      const y = circCenter.y + r * Math.cos(angle) * u.y + r * Math.sin(angle) * v.y
      const z = circCenter.z + r * Math.cos(angle) * u.z + r * Math.sin(angle) * v.z
      result.push([x, y, z])
    }
    return result
  }, [pts, dim.radius])

  const centerPos = useMemo(() => {
    const p0 = pts[0]!, p1 = pts[1]!, p2 = pts[2]!
    const A = new THREE.Vector3(p0.x, p0.y, p0.z)
    const B = new THREE.Vector3(p1.x, p1.y, p1.z)
    const C = new THREE.Vector3(p2.x, p2.y, p2.z)
    const AB = B.clone().sub(A)
    const AC = C.clone().sub(A)
    const normal = AB.clone().cross(AC).normalize()
    const abMid = A.clone().add(B).multiplyScalar(0.5)
    const acMid = A.clone().add(C).multiplyScalar(0.5)
    const bisAB = AB.clone().cross(normal)
    const bisAC = AC.clone().cross(normal)
    const crossBis = bisAB.clone().cross(bisAC)
    const crossBisLen2 = crossBis.lengthSq()
    if (crossBisLen2 < 1e-15) return [0, 0, 0] as [number, number, number]
    const d = acMid.clone().sub(abMid)
    const dCrossBisAC = d.clone().cross(bisAC)
    const s = dCrossBisAC.dot(crossBis) / crossBisLen2
    const cc = abMid.clone().add(bisAB.clone().multiplyScalar(s))
    return [cc.x, cc.y, cc.z] as [number, number, number]
  }, [pts])

  if (circlePoints.length === 0) return null

  const suffix = getUnitSuffix(dim.unit, 'circumference')
  const text = `⌀${dim.diameter?.toFixed(1)} ${suffix} · C=${dim.value.toFixed(1)} ${suffix}`

  return (
    <group userData={{ isDimensionHelper: true }}>
      <Line points={circlePoints} color="#8b5cf6" lineWidth={2} />
      {pts.map((p, i) => (
        <NumberedPoint key={i} position={[p.x, p.y, p.z]} index={i + 1} color="#8b5cf6" />
      ))}
      {/* Center point */}
      <mesh position={centerPos}>
        <ringGeometry args={[0.008, 0.015, 16]} />
        <meshStandardMaterial color="#c4b5fd" emissive="#c4b5fd" emissiveIntensity={0.4} side={THREE.DoubleSide} />
      </mesh>
      <DimensionLabel position={centerPos} text={text} color="#8b5cf6" />
    </group>
  )
}

// ============================================================================
// Volume Box
// ============================================================================

function VolumeBox({ dim }: { dim: Dimension3D }) {
  const boxData = useMemo(() => {
    const p1 = dim.p1
    const p2 = dim.p2
    const cx = (p1.x + p2.x) / 2
    const cy = (p1.y + p2.y) / 2
    const cz = (p1.z + p2.z) / 2
    const sx = Math.abs(p2.x - p1.x)
    const sy = Math.abs(p2.y - p1.y)
    const sz = Math.abs(p2.z - p1.z)
    return {
      position: [cx, cy, cz] as [number, number, number],
      size: [sx, sy, sz] as [number, number, number],
    }
  }, [dim])

  const suffix = getUnitSuffix(dim.unit, 'volume')
  const text = dim.label
    ? `${dim.label}: ${dim.value.toFixed(2)} ${suffix}`
    : `${dim.value.toFixed(2)} ${suffix}`

  return (
    <group userData={{ isDimensionHelper: true }}>
      <mesh position={boxData.position}>
        <boxGeometry args={boxData.size} />
        <meshStandardMaterial
          color="#ef4444"
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <lineSegments position={boxData.position}>
        <edgesGeometry args={[new THREE.BoxGeometry(...boxData.size)]} />
        <lineBasicMaterial color="#ef4444" />
      </lineSegments>
      <NumberedPoint position={[dim.p1.x, dim.p1.y, dim.p1.z]} index={1} color="#ef4444" />
      <NumberedPoint position={[dim.p2.x, dim.p2.y, dim.p2.z]} index={2} color="#ef4444" />
      <DimensionLabel position={boxData.position} text={text} color="#ef4444" />
    </group>
  )
}

// ============================================================================
// Pending Points Preview (while creating)
// ============================================================================

function PendingPointsPreview({ points, measurementType }: { points: Point3D[]; measurementType?: MeasurementType }) {
  if (points.length === 0) return null

  const linePoints = useMemo(() => {
    return points.map((p) => [p.x, p.y, p.z] as [number, number, number])
  }, [points])

  // Can close polygon? (area mode with 3+ points)
  const canClose = measurementType === 'area' && points.length >= 3

  return (
    <group userData={{ isDimensionHelper: true }}>
      {points.length > 1 && (
        <Line points={linePoints} color="#6366f1" lineWidth={1.5} dashed dashSize={0.05} gapSize={0.03} />
      )}
      {points.map((p, i) => (
        <NumberedPoint
          key={i}
          position={[p.x, p.y, p.z]}
          index={i + 1}
          color="#6366f1"
          pending
          isCloseTarget={canClose && i === 0}
        />
      ))}
    </group>
  )
}

// ============================================================================
// Shared label component
// ============================================================================

// ============================================================================
// Numbered Point Marker (replaces plain spheres)
// ============================================================================

function NumberedPoint({
  position,
  index,
  color,
  pending,
  isCloseTarget,
}: {
  position: [number, number, number]
  index: number
  color: string
  pending?: boolean
  isCloseTarget?: boolean
}) {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)

  // Pulse animation for close-target (point 1 when area can close)
  useFrame(({ clock }) => {
    if (isCloseTarget && ringRef.current) {
      const s = 1 + Math.sin(clock.getElapsedTime() * 3) * 0.35
      ringRef.current.scale.setScalar(s)
    }
  })

  return (
    <group ref={groupRef} position={position} userData={{ isDimensionHelper: true }}>
      {/* Outer ring — precise, non-occluding */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.008, 0.014, 20]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>

      {/* Center dot — tiny, precise */}
      <mesh>
        <sphereGeometry args={[0.004, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} depthTest={false} />
      </mesh>

      {/* Cross-hair lines for precision */}
      <Line
        points={[[-0.018, 0, 0], [0.018, 0, 0]]}
        color={color}
        lineWidth={1}
        userData={{ isDimensionHelper: true }}
      />
      <Line
        points={[[0, 0, -0.018], [0, 0, 0.018]]}
        color={color}
        lineWidth={1}
        userData={{ isDimensionHelper: true }}
      />

      {/* Close-target ring (pulsing green ring around point 1 in area mode) */}
      {isCloseTarget && (
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.025, 0.035, 24]} />
          <meshStandardMaterial
            color="#22c55e"
            emissive="#22c55e"
            emissiveIntensity={0.7}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
            depthTest={false}
          />
        </mesh>
      )}

      {/* Number label */}
      <Html
        position={[0.022, 0.022, 0]}
        center
        distanceFactor={2}
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            background: pending ? '#6366f1' : color,
            color: '#fff',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9px',
            fontWeight: 700,
            fontFamily: 'monospace',
            border: isCloseTarget ? '2px solid #22c55e' : '1px solid rgba(255,255,255,0.3)',
            boxShadow: isCloseTarget ? '0 0 8px #22c55e' : '0 1px 3px rgba(0,0,0,0.5)',
            lineHeight: 1,
          }}
        >
          {index}
        </div>
        {isCloseTarget && (
          <div
            style={{
              position: 'absolute',
              top: '-18px',
              left: '50%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              fontSize: '9px',
              fontWeight: 600,
              color: '#22c55e',
              background: 'rgba(0,0,0,0.8)',
              padding: '1px 5px',
              borderRadius: '3px',
              border: '1px solid #22c55e40',
            }}
          >
            Cerrar
          </div>
        )}
      </Html>
    </group>
  )
}

function DimensionLabel({ position, text, color }: { position: [number, number, number]; text: string; color: string }) {
  return (
    <Html position={position} center distanceFactor={3} style={{ pointerEvents: 'none' }}>
      <div
        className="px-2 py-0.5 rounded text-xs font-mono whitespace-nowrap select-none"
        style={{
          background: 'rgba(0, 0, 0, 0.85)',
          color,
          border: `1px solid ${color}40`,
          fontSize: '11px',
          lineHeight: '1.4',
        }}
      >
        {text}
      </div>
    </Html>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function DimensionRenderer({ dim }: { dim: Dimension3D }) {
  switch (dim.type) {
    case 'area': return <AreaPolygon dim={dim} />
    case 'circumference': return <CircumferenceLine dim={dim} />
    case 'volume': return <VolumeBox dim={dim} />
    case 'distance':
    default:
      return <DistanceLine dim={dim} />
  }
}

export function DimensionsTool({ dimensions, pendingPoints, measurementType }: DimensionsToolProps) {
  return (
    <group>
      {dimensions.map((dim) => (
        <DimensionRenderer key={dim.id} dim={dim} />
      ))}
      {pendingPoints && pendingPoints.length > 0 && (
        <PendingPointsPreview points={pendingPoints} measurementType={measurementType} />
      )}
    </group>
  )
}
