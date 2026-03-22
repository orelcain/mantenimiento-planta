/**
 * SceneEnvironment — Lighting, fog, and background for the 3D scene.
 *
 * Extracted from IsometricScene to isolate environment configuration.
 */

interface SceneEnvironmentProps {
  hasSatelliteTexture: boolean
}

export function SceneEnvironment({ hasSatelliteTexture }: SceneEnvironmentProps) {
  return (
    <>
      {/* Background */}
      <color attach="background" args={['#1a2530']} />

      {/* Natural lighting */}
      <ambientLight intensity={hasSatelliteTexture ? 0.9 : 0.72} />
      <directionalLight
        position={[30, 45, 20]}
        intensity={hasSatelliteTexture ? 1.4 : 1.1}
        color={hasSatelliteTexture ? '#fffaf0' : '#fff4db'}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={120}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
      />
      <directionalLight position={[-18, 12, -22]} intensity={0.25} color="#96c8e8" />
      <hemisphereLight
        args={[
          hasSatelliteTexture ? '#e8f4ff' : '#d7f0ff',
          '#1a1510',
          hasSatelliteTexture ? 0.7 : 0.58,
        ]}
      />

      {/* Distance fog */}
      <fog attach="fog" args={['#1a2530', 200, 500]} />
    </>
  )
}
