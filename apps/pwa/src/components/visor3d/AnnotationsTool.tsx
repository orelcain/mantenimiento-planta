import { useRef, useState, useMemo, useCallback } from 'react'
import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { Annotation3D, AnnotationStatus } from '@/types/models3d'
import { CheckCircle, AlertTriangle, Info, MapPin, ImageIcon, Pencil, X as XIcon } from 'lucide-react'

interface AnnotationsToolProps {
  annotations: Annotation3D[]
  onAnnotationClick?: (annotation: Annotation3D) => void
  onUpdateStatus?: (id: string, status: AnnotationStatus) => void
  onPhotoClick?: (photos: string[], index: number) => void
  visible?: boolean
}

// Priority config
const PRIORITY_CONFIG = {
  high:    { color: '#ef4444', glow: '#ff6b6b', ring: '#fca5a5', label: 'Alta',  Icon: AlertTriangle },
  medium:  { color: '#f59e0b', glow: '#fbbf24', ring: '#fde68a', label: 'Media', Icon: Info },
  low:     { color: '#3b82f6', glow: '#60a5fa', ring: '#93c5fd', label: 'Baja',  Icon: Info },
} as const

const RESOLVED_CONFIG = { color: '#10b981', glow: '#34d399', ring: '#6ee7b7' }

function AnnotationPin({ 
  annotation, 
  onClick,
  onPhotoClick,
  pinned,
  onPin,
}: { 
  annotation: Annotation3D; 
  onClick?: (annotation: Annotation3D) => void
  onPhotoClick?: (photos: string[], index: number) => void
  pinned: boolean
  onPin: (id: string | null) => void
}) {
  const [hovered, setHovered] = useState(false)
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Mesh>(null)
  const isResolved = annotation.status === 'resolved'
  const showTooltip = hovered || pinned
  
  const config = isResolved ? RESOLVED_CONFIG : (PRIORITY_CONFIG[annotation.priority] ?? PRIORITY_CONFIG.medium)
  const PriorityIcon = isResolved ? CheckCircle : (PRIORITY_CONFIG[annotation.priority]?.Icon ?? Info)

  // Smooth float + ring pulse animation
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()
    if (groupRef.current) {
      groupRef.current.position.y = annotation.position.y + Math.sin(t * 1.5) * 0.03
    }
    if (ringRef.current) {
      const pulse = 1 + Math.sin(t * 3) * 0.15
      ringRef.current.scale.set(pulse, pulse, pulse)
      const mat = ringRef.current.material as THREE.MeshStandardMaterial
      mat.opacity = 0.3 + Math.sin(t * 3) * 0.15
    }
  })

  // Create pin shape (teardrop) geometry
  const pinShapeGeom = useMemo(() => {
    const shape = new THREE.Shape()
    // Teardrop pin: círculo arriba, punta abajo
    const r = 0.09
    shape.moveTo(0, 0)  // punta inferior
    shape.quadraticCurveTo(-r * 1.2, r * 1.5, -r, r * 2.2)
    shape.absarc(0, r * 2.2, r, Math.PI, 0, false)
    shape.quadraticCurveTo(r * 1.2, r * 1.5, 0, 0)

    const extrudeSettings = { depth: 0.04, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 4 }
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings)
    geom.center()
    return geom
  }, [])

  return (
    <group 
      ref={groupRef} 
      position={[annotation.position.x, annotation.position.y, annotation.position.z]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        // Toggle pin: click to fix tooltip, click again to unpin
        onPin(pinned ? null : annotation.id)
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {/* Ground ring (pulsating) */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[0.08, 0.12, 32]} />
        <meshStandardMaterial 
          color={config.ring} 
          transparent 
          opacity={0.4} 
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Vertical stem */}
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.008, 0.004, 0.4, 8]} />
        <meshStandardMaterial 
          color={config.color} 
          metalness={0.6} 
          roughness={0.3} 
        />
      </mesh>

      {/* Pin head (Teardrop / Marker shape) */}
      <group position={[0, 0.5, 0]} scale={hovered ? 1.25 : 1}>
        <mesh geometry={pinShapeGeom} rotation={[0, 0, Math.PI]}>
          <meshStandardMaterial 
            color={config.color} 
            emissive={config.glow} 
            emissiveIntensity={hovered ? 0.7 : 0.25}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>

        {/* Inner white dot (like Google Maps pin center) */}
        <mesh position={[0, 0.02, 0.03]}>
          <circleGeometry args={[0.04, 16]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
        </mesh>
      </group>

      {/* Number badge via Html (always visible) */}
      <Html 
        position={[0, 0.5, 0]} 
        center 
        distanceFactor={8}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        <div className="flex items-center gap-1">
          <div 
            className="flex items-center justify-center rounded-full font-bold font-mono text-white shadow-lg"
            style={{
              width: 22,
              height: 22,
              fontSize: 11,
              backgroundColor: config.color,
              border: `2px solid ${config.ring}`,
              boxShadow: `0 0 8px ${config.glow}80`,
              transform: 'translateY(-2px)',
            }}
          >
            {annotation.number}
          </div>
          {(annotation.photos?.length ?? 0) > 0 && (
            <div 
              className="flex items-center gap-0.5 rounded-full px-1 py-0.5 text-white shadow-md"
              style={{ 
                backgroundColor: 'rgba(0,0,0,0.7)', 
                fontSize: 9,
                transform: 'translateY(-2px)',
              }}
            >
              <ImageIcon size={8} />
              <span>{annotation.photos!.length}</span>
            </div>
          )}
        </div>
      </Html>

      {/* Resolved check icon */}
      {isResolved && (
        <Html position={[0.14, 0.62, 0]} center distanceFactor={8} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="bg-emerald-500 text-white p-0.5 rounded-full shadow-md ring-2 ring-emerald-300/50">
            <CheckCircle size={11} strokeWidth={3} />
          </div>
        </Html>
      )}

      {/* Tooltip — hover preview or pinned interactive */}
      {showTooltip && (
        <Html 
          position={[0, 0.78, 0]} 
          center 
          distanceFactor={8} 
          zIndexRange={[10, 0]}
          style={{ pointerEvents: pinned ? 'auto' : 'none', zIndex: 10 }}
        >
          <div 
            className="annotation-ui bg-gray-900/90 backdrop-blur-md text-white rounded-lg shadow-2xl border border-white/10 whitespace-nowrap"
            style={{ minWidth: 180 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with priority color bar */}
            <div 
              className="flex items-center gap-2 px-3 py-2 rounded-t-lg border-b border-white/10"
              style={{ backgroundColor: `${config.color}20` }}
            >
              <PriorityIcon size={14} style={{ color: config.color }} />
              <span className="font-bold text-sm" style={{ color: config.color }}>
                #{annotation.number}
              </span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/10 font-medium" style={{ color: config.ring }}>
                {isResolved ? 'Resuelta' : (PRIORITY_CONFIG[annotation.priority]?.label ?? 'Media')}
              </span>
              {/* Close button when pinned */}
              {pinned && (
                <button
                  className="ml-auto p-0.5 rounded-full hover:bg-white/20 transition-colors"
                  onClick={(e) => { e.stopPropagation(); onPin(null) }}
                >
                  <XIcon size={12} />
                </button>
              )}
            </div>
            {/* Title & description */}
            <div className="px-3 py-2">
              <p className="text-sm font-semibold leading-tight">{annotation.title}</p>
              {annotation.description && (
                <p className="text-xs text-gray-400 mt-1 leading-snug max-w-[200px] truncate">
                  {annotation.description}
                </p>
              )}
              {/* Photo thumbnails – always clickable when pinned */}
              {(annotation.photos?.length ?? 0) > 0 && (
                <div className="flex gap-1 mt-2" style={{ pointerEvents: 'auto' }}>
                  {annotation.photos!.slice(0, 3).map((url, i) => (
                    <img 
                      key={i}
                      src={url} 
                      alt={`Foto ${i + 1}`}
                      className="w-10 h-10 object-cover rounded border border-white/20 cursor-pointer hover:ring-2 hover:ring-white/50 transition-all"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPhotoClick?.(annotation.photos!, i)
                      }}
                    />
                  ))}
                  {annotation.photos!.length > 3 && (
                    <div 
                      className="w-10 h-10 rounded border border-white/20 bg-white/10 flex items-center justify-center text-xs text-gray-300 cursor-pointer hover:bg-white/20 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        onPhotoClick?.(annotation.photos!, 3)
                      }}
                    >
                      +{annotation.photos!.length - 3}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Footer — edit button when pinned, hint when hovering */}
            <div className="px-3 py-1.5 bg-white/5 rounded-b-lg border-t border-white/5">
              {pinned ? (
                <button 
                  className="flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors text-white"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPin(null)
                    onClick?.(annotation)
                  }}
                >
                  <Pencil size={11} />
                  Editar anotación
                </button>
              ) : (
                <p className="text-[10px] text-gray-500 flex items-center gap-1">
                  <MapPin size={9} /> Clic para fijar y ver opciones
                </p>
              )}
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}

export function AnnotationsTool({ annotations, onAnnotationClick, onPhotoClick, visible = true }: AnnotationsToolProps) {
  const [pinnedId, setPinnedId] = useState<string | null>(null)

  // Unpin when clicking on the 3D scene background (via group)
  const handleBackgroundClick = useCallback(() => {
    setPinnedId(null)
  }, [])

  if (!visible) return null

  return (
    <group onClick={handleBackgroundClick}>
      {annotations.map((ann) => (
        <AnnotationPin 
          key={ann.id} 
          annotation={ann} 
          onClick={onAnnotationClick}
          onPhotoClick={onPhotoClick}
          pinned={pinnedId === ann.id}
          onPin={setPinnedId}
        />
      ))}
    </group>
  )
}
