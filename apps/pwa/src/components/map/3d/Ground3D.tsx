import { useMemo, Suspense } from 'react'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

function makeCobblesTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#9a7a50'
  ctx.fillRect(0, 0, size, size)

  const bW = 28, bH = 16
  for (let row = 0; row < size / bH + 1; row++) {
    const offset = (row % 2) * (bW / 2)
    for (let col = -1; col < size / bW + 1; col++) {
      const x = col * bW + offset
      const y = row * bH
      const brightness = 0.88 + Math.random() * 0.18
      const hue = 22 + Math.random() * 12
      ctx.fillStyle = `hsla(${hue}, 42%, ${Math.round(38 * brightness)}%, 1)`
      ctx.fillRect(x + 1, y + 1, bW - 2, bH - 2)
    }
  }

  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const r = 5 + Math.random() * 12
    ctx.fillStyle = `hsla(${85 + Math.random() * 20}, 45%, ${30 + Math.random() * 15}%, 0.5)`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.strokeStyle = 'rgba(30,15,0,0.2)'
  ctx.lineWidth = 1.5
  for (let row = 0; row < size / bH + 1; row++) {
    const offset = (row % 2) * (bW / 2)
    for (let col = -1; col < size / bW + 1; col++) {
      const x = col * bW + offset
      const y = row * bH
      ctx.strokeRect(x + 0.5, y + 0.5, bW - 1, bH - 1)
    }
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4)
  return tex
}

function WallSegment({ pos, size }: { pos: [number, number, number]; size: [number, number, number] }) {
  return (
    <mesh position={pos} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshToonMaterial color="#a08968" />
    </mesh>
  )
}

// Plano con el plano arquitectónico real superpuesto sobre el suelo
function FloorPlan() {
  const planTex = useTexture('/maps/planta-principal.png')

  planTex.colorSpace = THREE.SRGBColorSpace
  planTex.wrapS = planTex.wrapT = THREE.ClampToEdgeWrapping

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -1]}>
      {/* Plano arquitectónico real: 88 m ancho × 44 m profundo, centrado */}
      <planeGeometry args={[88, 44]} />
      <meshBasicMaterial
        map={planTex}
        transparent
        opacity={0.35}
        depthWrite={false}
      />
    </mesh>
  )
}

export function Ground3D() {
  const cobblesTex = useMemo(() => makeCobblesTexture(), [])

  return (
    <>
      {/* Suelo base — adoquines medievales */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[180, 180]} />
        <meshStandardMaterial map={cobblesTex} roughness={0.95} metalness={0.0} />
      </mesh>

      {/* Plano arquitectónico real translúcido (guía visual de layout) */}
      <Suspense fallback={null}>
        <FloorPlan />
      </Suspense>

      {/* Muros perimetrales — recinto Antarfood ~110m × 65m (incluye patio y estanques) */}
      <WallSegment pos={[0,  1.5, -35]}   size={[114, 3, 0.6]} />
      <WallSegment pos={[0,  1.5,  32]}   size={[114, 3, 0.6]} />
      <WallSegment pos={[-57, 1.5, -1.5]} size={[0.6, 3, 68]} />
      <WallSegment pos={[ 57, 1.5, -1.5]} size={[0.6, 3, 68]} />

      {/* Torres esquina medievales */}
      {([[-57, -35], [57, -35], [57, 32], [-57, 32]] as [number, number][]).map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 2.5, z]} castShadow>
            <boxGeometry args={[3, 5, 3]} />
            <meshToonMaterial color="#8a6a4a" />
          </mesh>
          <mesh position={[x, 5.5, z]} castShadow>
            <coneGeometry args={[2.4, 3, 4]} />
            <meshToonMaterial color="#7a2818" />
          </mesh>
        </group>
      ))}

      {/* Portón principal sur (acceso camiones — frente a maq_sur) */}
      <WallSegment pos={[-20, 1.5, -35]} size={[22, 3, 0.6]} />
      <WallSegment pos={[ 22, 1.5, -35]} size={[36, 3, 0.6]} />

      {/* Portón norte (salida producto / estanques) */}
      <WallSegment pos={[-10, 1.5, 32]}  size={[80, 3, 0.6]} />

      {/* Camino de acceso principal — asfalto */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -43]} receiveShadow>
        <planeGeometry args={[16, 18]} />
        <meshStandardMaterial color="#2a2820" roughness={0.98} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -43]}>
        <planeGeometry args={[0.3, 18]} />
        <meshBasicMaterial color="#ddcc00" />
      </mesh>

      {/* Patio maniobras despacho — sur este */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, 0, -43]} receiveShadow>
        <planeGeometry args={[30, 18]} />
        <meshStandardMaterial color="#2e2c28" roughness={0.98} />
      </mesh>
    </>
  )
}
