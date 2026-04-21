import { Html } from '@react-three/drei'
import type { Silo } from '@/data/zonas3d'

const SILO_COLORS: Record<string, string> = {
  agua:        '#5a9fd4',
  hielo:       '#b0d8f0',
  combustible: '#d4a855',
}

interface Silo3DProps {
  silo: Silo
  showLabel: boolean
}

export function Silo3D({ silo, showLabel }: Silo3DProps) {
  const [x, y, z] = silo.pos
  const color = SILO_COLORS[silo.tipo] ?? '#aaaaaa'

  return (
    <group position={[x, y, z]}>
      {/* Cuerpo cilíndrico */}
      <mesh position={[0, silo.h / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[silo.r, silo.r, silo.h, 24]} />
        <meshStandardMaterial
          color={color}
          metalness={0.65}
          roughness={0.35}
          envMapIntensity={1.2}
        />
      </mesh>

      {/* Cúpula superior */}
      <mesh position={[0, silo.h, 0]} castShadow>
        <sphereGeometry args={[silo.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} metalness={0.65} roughness={0.3} />
      </mesh>

      {/* Base de apoyo */}
      <mesh position={[0, 0.15, 0]} receiveShadow>
        <cylinderGeometry args={[silo.r + 0.2, silo.r + 0.3, 0.3, 16]} />
        <meshStandardMaterial color="#5a5040" roughness={0.95} />
      </mesh>

      {/* Label flotante */}
      {showLabel && (
        <Html
          position={[silo.r + 1.5, silo.h * 0.55, 0]}
          distanceFactor={22}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'linear-gradient(135deg, #fff5be 0%, #dcc378 100%)',
            border: '1px solid #8a5a08',
            borderRadius: '3px',
            padding: '3px 7px',
            fontFamily: 'Georgia, serif',
            fontSize: '8px',
            fontWeight: 'bold',
            fontStyle: 'italic',
            color: '#3d1a00',
            whiteSpace: 'pre',
            boxShadow: '1px 2px 4px rgba(0,0,0,0.45)',
            lineHeight: 1.3,
            textAlign: 'center',
          }}>
            {silo.label}
          </div>
        </Html>
      )}
    </group>
  )
}
