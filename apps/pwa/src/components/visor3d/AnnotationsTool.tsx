import { useRef, useState } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Annotation3D, AnnotationStatus } from '@/types/models3d'
import { CheckCircle } from 'lucide-react'

interface AnnotationsToolProps {
  annotations: Annotation3D[]
  onAnnotationClick?: (annotation: Annotation3D) => void
  onUpdateStatus?: (id: string, status: AnnotationStatus) => void
  visible?: boolean
}

function AnnotationPin({ 
  annotation, 
  onClick 
}: { 
  annotation: Annotation3D; 
  onClick?: (annotation: Annotation3D) => void 
}) {
  const [hovered, setHovered] = useState(false)
  const groupRef = useRef<THREE.Group>(null)
  
  // Color code by priority/status
  const getColor = () => {
    if (annotation.status === 'resolved') return '#10b981' // Green
    switch (annotation.priority) {
      case 'high': return '#ef4444' // Red
      case 'medium': return '#f59e0b' // Amber
      case 'low': return '#3b82f6' // Blue
      default: return '#6366f1'
    }
  }

  const baseColor = getColor()

  // Float animation
  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.position.y = annotation.position.y + Math.sin(clock.getElapsedTime() * 2) * 0.05
    }
  })

  return (
    <group 
      ref={groupRef} 
      position={[annotation.position.x, annotation.position.y, annotation.position.z]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onClick?.(annotation)
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Pin Line */}
      <mesh position={[0, 0.25, 0]}>
        <cylinderGeometry args={[0.005, 0.002, 0.5, 8]} />
        <meshStandardMaterial color={baseColor} />
      </mesh>

      {/* Pin Head (Sphere) */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial 
          color={baseColor} 
          emissive={baseColor} 
          emissiveIntensity={hovered ? 0.6 : 0.2}
        />
      </mesh>

      {/* Floating Check Icon for resolved */}
      {annotation.status === 'resolved' && (
        <Html position={[0.15, 0.5, 0]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
           <div className="bg-green-500 text-white p-0.5 rounded-full shadow-sm">
             <CheckCircle size={12} strokeWidth={3} />
           </div>
        </Html>
      )}

      {/* Number Badge */}
      <Html position={[0, 0.5, 0.08]} center distanceFactor={10} style={{ pointerEvents: 'none' }}>
        <div className="text-white text-[10px] font-bold font-mono">
          {annotation.number}
        </div>
      </Html>

      {/* Label (Visible on Hover) */}
      {hovered && (
        <Html position={[0, 0.65, 0]} center distanceFactor={10} style={{ pointerEvents: 'none', zIndex: 100 }}>
          <div className="bg-black/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-md shadow-lg border border-white/20 whitespace-nowrap flex items-center gap-2">
            <span className="font-bold">#{annotation.number}</span>
            <span className="text-sm font-medium">{annotation.title}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

export function AnnotationsTool({ annotations, onAnnotationClick, visible = true }: AnnotationsToolProps) {
  if (!visible) return null

  return (
    <group>
      {annotations.map((ann) => (
        <AnnotationPin 
          key={ann.id} 
          annotation={ann} 
          onClick={onAnnotationClick} 
        />
      ))}
    </group>
  )
}
