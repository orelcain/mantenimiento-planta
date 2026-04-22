import { Suspense, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows, Sky } from '@react-three/drei'
import * as THREE from 'three'
import { Building3D } from './Building3D'
import { Silo3D } from './Silo3D'
import { Ground3D } from './Ground3D'
import { ZONAS, SILOS } from '@/data/zonas3d'
import { usePlanta3DStore } from '@/store/usePlanta3DStore'

function SceneContent() {
  const { selectedZonaId, showEstados, showLabels, setSelectedZona, setHoveredZona } = usePlanta3DStore()

  const handleClick = useCallback(
    (id: string) => setSelectedZona(selectedZonaId === id ? null : id),
    [selectedZonaId, setSelectedZona],
  )

  return (
    <>
      {/* Niebla atmosférica cálida para profundidad isométrica */}
      <fog attach="fog" args={['#e87030', 180, 420]} />

      {/* Cielo golden hour */}
      <Sky
        distance={450000}
        sunPosition={[1, 0.12, -0.5]}
        inclination={0.485}
        azimuth={0.18}
        turbidity={14}
        rayleigh={2.5}
        mieCoefficient={0.018}
        mieDirectionalG={0.9}
      />

      {/* HDRI sunset desde CDN pmndrs */}
      <Environment preset="sunset" />

      {/* Sol principal — naranja intenso */}
      <directionalLight
        position={[30, 25, 10]}
        intensity={3.8}
        color="#ff6a10"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={160}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-bias={-0.001}
      />

      {/* Segundo sol difuso — relleno violeta/azul */}
      <directionalLight position={[-30, 10, -25]} intensity={0.55} color="#5060c0" />

      {/* Ambiente ámbar muy cálido */}
      <ambientLight intensity={0.5} color="#ff8820" />

      {/* Hemisferio: naranja-dorado arriba / marrón-oscuro abajo */}
      <hemisphereLight args={['#ff9940', '#3a1a00', 0.6]} />

      {/* Sombras de contacto suaves */}
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.55}
        scale={100}
        blur={3.0}
        far={14}
        color="#1a0800"
      />

      {/* Suelo + muros */}
      <Ground3D />

      {/* Edificios */}
      {ZONAS.map((zona) => (
        <Building3D
          key={zona.id}
          zona={zona}
          selected={selectedZonaId === zona.id}
          showEstado={showEstados}
          showLabel={showLabels}
          onClick={handleClick}
          onHover={setHoveredZona}
        />
      ))}

      {/* Silos */}
      {SILOS.map((silo) => (
        <Silo3D key={silo.id} silo={silo} showLabel={showLabels} />
      ))}

      {/* Controles — zoom en vez de distance para cámara ortográfica */}
      <OrbitControls
        enableDamping
        dampingFactor={0.07}
        maxPolarAngle={Math.PI / 2.3}
        minPolarAngle={0.2}
        minZoom={5}
        maxZoom={45}
        target={[0, 2, 0]}
        makeDefault
      />

      {/* Post-processing deshabilitado: @react-three/postprocessing v3 requiere fiber v9 + React 19.
          Re-habilitar cuando se actualice el stack. */}
    </>
  )
}

function CanvasLoader() {
  return (
    <mesh position={[0, 1, 0]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#3b82f6" wireframe />
    </mesh>
  )
}

export function PlantaScene3D() {
  return (
    <div className="w-full h-full">
      <Canvas
        orthographic
        camera={{ zoom: 13, position: [100, 100, 100], near: -800, far: 1200 }}
        shadows
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.35,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
        onPointerMissed={() => usePlanta3DStore.getState().setSelectedZona(null)}
      >
        <Suspense fallback={<CanvasLoader />}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  )
}
