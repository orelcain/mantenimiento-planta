import { useRef, useState, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Zona } from '@/data/zonas3d'
import { ESTADO_COLORS, CATEGORIA_ACCENT } from '@/data/zonas3d'

interface Building3DProps {
  zona: Zona
  selected: boolean
  showEstado: boolean
  showLabel: boolean
  onClick: (id: string) => void
  onHover: (id: string | null) => void
}

// Paleta medieval cálida — muros y techos por categoría
const WALL_COLORS: Record<string, string> = {
  produccion: '#c8935a',
  frio:       '#7a9ab8',
  utilidades: '#c8902a',
  logistica:  '#8aaa6a',
  admin:      '#b89878',
}
const ROOF_COLORS: Record<string, string> = {
  produccion: '#7a2818',
  frio:       '#2a3a5a',
  utilidades: '#6a4210',
  logistica:  '#3a5a2a',
  admin:      '#4a3828',
}

function makeToonGradient(steps: string[]): THREE.DataTexture {
  const data = new Uint8Array(steps.length * 4)
  steps.forEach((hex, i) => {
    const c = new THREE.Color(hex)
    data[i * 4]     = Math.round(c.r * 255)
    data[i * 4 + 1] = Math.round(c.g * 255)
    data[i * 4 + 2] = Math.round(c.b * 255)
    data[i * 4 + 3] = 255
  })
  const tex = new THREE.DataTexture(data, steps.length, 1)
  tex.needsUpdate = true
  return tex
}

export function Building3D({ zona, selected, showEstado, showLabel, onClick, onHover }: Building3DProps) {
  const [hovered, setHovered] = useState(false)
  const ringRef   = useRef<THREE.Mesh>(null!)
  const overlayRef = useRef<THREE.MeshBasicMaterial>(null!)

  const [bx, by, bz] = zona.pos
  const [w, h, d]    = zona.size

  const wallColor  = WALL_COLORS[zona.categoria]  ?? '#c8935a'
  const roofColor  = ROOF_COLORS[zona.categoria]  ?? '#4a3828'
  const accentColor = CATEGORIA_ACCENT[zona.categoria]
  const estadoColor = ESTADO_COLORS[zona.estado]
  const ringRadius  = Math.max(w, d) * 0.62
  const roofH       = Math.max(h * 0.55, 2.2)

  // Toon gradient textures
  const wallGrad = useMemo(() => {
    const base = new THREE.Color(wallColor)
    const light = base.clone().multiplyScalar(1.4).getHexString()
    const mid   = base.clone().getHexString()
    const dark  = base.clone().multiplyScalar(0.55).getHexString()
    return makeToonGradient([`#${dark}`, `#${mid}`, `#${light}`])
  }, [wallColor])

  const roofGrad = useMemo(() => {
    const base = new THREE.Color(roofColor)
    const light = base.clone().multiplyScalar(1.5).getHexString()
    const dark  = base.clone().multiplyScalar(0.5).getHexString()
    return makeToonGradient([`#${dark}`, `#${roofColor.slice(1)}`, `#${light}`])
  }, [roofColor])

  // Ring pulse + status blink
  useFrame((_, delta) => {
    if (ringRef.current) {
      if (selected) {
        ringRef.current.visible = true
        ringRef.current.rotation.y += delta * 1.8
        const s = 1 + Math.sin(Date.now() / 300) * 0.04
        ringRef.current.scale.setScalar(s)
      } else {
        ringRef.current.visible = false
      }
    }
    if (overlayRef.current && zona.estado === 'detenido') {
      overlayRef.current.opacity = 0.28 + Math.abs(Math.sin(Date.now() / 500)) * 0.15
    }
  })

  // Annotation label
  const labelPos: [number, number, number]  = [w * 0.5 + 2.8, h + roofH + 0.5, 0]
  const lineStart: [number, number, number] = [w * 0.3, h + roofH * 0.6, 0]

  return (
    <group position={[bx, by, bz]}>
      {/* Cuerpo principal — toon material */}
      <mesh
        position={[0, h / 2, 0]}
        castShadow
        receiveShadow
        onClick={(e) => { e.stopPropagation(); onClick(zona.id) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(zona.id) }}
        onPointerOut={() => { setHovered(false); onHover(null) }}
      >
        <boxGeometry args={[w, h, d]} />
        <meshToonMaterial
          color={hovered ? '#ffe8c0' : wallColor}
          gradientMap={wallGrad}
        />
      </mesh>

      {/* Techo piramidal (4 caras) */}
      <mesh position={[0, h + roofH / 2, 0]} castShadow rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[Math.max(w, d) * 0.62, roofH, 4]} />
        <meshToonMaterial color={roofColor} gradientMap={roofGrad} />
      </mesh>

      {/* Alero del techo (voladizo) */}
      <mesh position={[0, h + 0.06, 0]}>
        <boxGeometry args={[w + 0.5, 0.18, d + 0.5]} />
        <meshToonMaterial color={roofColor} gradientMap={roofGrad} />
      </mesh>

      {/* Franja de categoría (fachada frontal) */}
      <mesh position={[0, h * 0.78, d / 2 + 0.02]}>
        <planeGeometry args={[w * 0.7, h * 0.22]} />
        <meshBasicMaterial color={accentColor} transparent opacity={0.85} />
      </mesh>

      {/* Ventanas con glow */}
      {w >= 5 && d >= 4 && ([
        [-(w * 0.25), h * 0.42, d / 2 + 0.02],
        [ (w * 0.25), h * 0.42, d / 2 + 0.02],
      ] as [number, number, number][]).map(([wx, wy, wz], i) => (
        <mesh key={i} position={[wx, wy, wz]}>
          <planeGeometry args={[1.1, 0.85]} />
          <meshStandardMaterial
            color="#ffe8a0"
            emissive="#ffcc40"
            emissiveIntensity={0.9}
            roughness={0.1}
          />
        </mesh>
      ))}

      {/* Chimenea (edificios producción grandes) */}
      {zona.categoria === 'produccion' && w >= 8 && (
        <group position={[w * 0.3, h + roofH * 0.5, d * 0.2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.28, 0.35, roofH * 0.8, 8]} />
            <meshToonMaterial color="#5a3828" />
          </mesh>
          {/* Sombrero chimenea */}
          <mesh position={[0, roofH * 0.4 + 0.15, 0]}>
            <cylinderGeometry args={[0.5, 0.28, 0.25, 8]} />
            <meshToonMaterial color="#3a2818" />
          </mesh>
        </group>
      )}

      {/* Overlay de estado */}
      {showEstado && (
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[w + 0.08, h + 0.08, d + 0.08]} />
          <meshBasicMaterial
            ref={overlayRef}
            color={estadoColor}
            transparent
            opacity={zona.estado === 'detenido' ? 0.35 : zona.estado === 'alerta' ? 0.2 : 0.08}
            depthWrite={false}
            side={THREE.FrontSide}
          />
        </mesh>
      )}

      {/* Ring dorado de selección */}
      <mesh ref={ringRef} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[ringRadius, ringRadius + 0.6, 48]} />
        <meshBasicMaterial color="#ffd700" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>

      {/* Anotación tipo pergamino */}
      {showLabel && (
        <>
          <Line
            points={[lineStart, labelPos]}
            color="#c8a040"
            lineWidth={1.2}
            transparent
            opacity={0.7}
          />
          <Html
            position={labelPos}
            distanceFactor={32}
            style={{ pointerEvents: 'none', userSelect: 'none' }}
          >
            <div style={{
              background: 'linear-gradient(150deg, #fff8d0 0%, #e8cc70 60%, #c8a030 100%)',
              border: '1.5px solid #8a5a08',
              borderRadius: '2px',
              padding: '4px 9px',
              fontFamily: '"Georgia", "Palatino Linotype", serif',
              fontSize: '9px',
              fontWeight: 'bold',
              fontStyle: 'italic',
              color: '#2a0e00',
              whiteSpace: 'nowrap',
              boxShadow: '2px 3px 8px rgba(0,0,0,0.6), inset 0 0 6px rgba(200,160,0,0.15)',
              lineHeight: 1.3,
              display: 'flex',
              flexDirection: 'column',
              gap: '1px',
              minWidth: '90px',
            }}>
              <span style={{ fontSize: '6.5px', color: '#7a4a05', letterSpacing: '0.08em', fontStyle: 'normal' }}>
                ⚜ {zona.sap}
              </span>
              <span style={{ fontSize: '9.5px' }}>{zona.label}</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '7px',
                color: estadoColor,
                fontStyle: 'normal',
                fontWeight: 'bold',
              }}>
                <span style={{
                  width: '5px', height: '5px',
                  borderRadius: '50%',
                  background: estadoColor,
                  display: 'inline-block',
                  boxShadow: `0 0 4px ${estadoColor}`,
                }} />
                {zona.estado.toUpperCase()}
              </span>
            </div>
          </Html>
        </>
      )}
    </group>
  )
}
