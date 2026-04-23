/**
 * Wireframe3DView — Blueprint isométrico de las capas DXF.
 *
 * Cámara: OrthographicCamera NW (ángulo 3 = 315°, elevación ~35°).
 * Color: blueprint blanco-azulado #c8d8f0 sobre fondo oscuro.
 * Geometría: LineSegments fusionados por capa (~8-17 draw calls totales).
 * Iter 1: todo en y=0 (plano). Iter 2 agregará extrusión por nivel.
 */

import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useMapaLeafletStore } from '@/store/useMapaLeafletStore'
import { MAP_VIEWS, type DxfLayerConfig, type ViewName } from '@/data/dxfLayers'
import { RotateCw, Home } from 'lucide-react'

// ── Constantes ───────────────────────────────────────────────────────────────

const BG_COLOR   = '#060e1a'
const LINE_COLOR = '#c8d8f0'
const ISO_ELEVATION = Math.atan(1 / Math.SQRT2) // 35.264°

/** Azimuts como tupla → el indexado 0-3 retorna `number` (no `number | undefined`) */
const AZIMUTHS: readonly [number, number, number, number] = [
  Math.PI / 4,          // 0 → Sur-Oeste
  (3 * Math.PI) / 4,   // 1 → Sur-Este
  (5 * Math.PI) / 4,   // 2 → Nor-Este
  (7 * Math.PI) / 4,   // 3 → Nor-Oeste
] as const

const ANGLE_NAMES: readonly [string, string, string, string] = [
  'Sur-Oeste', 'Sur-Este', 'Nor-Este', 'Nor-Oeste',
] as const

const OPACITY_BY_GROUP: Record<string, number> = {
  cerco: 1.0, estructura: 0.95, instalaciones: 0.7, detalle: 0.55, otros: 0.35,
}

// ── Cache de GeoJSON ─────────────────────────────────────────────────────────

interface GeoFC {
  type: string
  features: Array<{ geometry: { type: string; coordinates: unknown } | null }>
}

const geoCache = new Map<string, GeoFC>()

// ── Conversión GeoJSON → segmentos Three.js ──────────────────────────────────

function addChain(coords: [number, number][], cx: number, cy: number, buf: number[]): void {
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i] as [number, number]
    const b = coords[i + 1] as [number, number]
    buf.push(a[0] - cx, 0, -(a[1] - cy))
    buf.push(b[0] - cx, 0, -(b[1] - cy))
  }
}

function extractSegments(
  geom: { type: string; coordinates: unknown },
  cx: number, cy: number,
  buf: number[],
): void {
  type C2 = [number, number][]
  switch (geom.type) {
    case 'LineString':
      addChain(geom.coordinates as C2, cx, cy, buf); break
    case 'MultiLineString':
      for (const ls of geom.coordinates as C2[]) addChain(ls, cx, cy, buf); break
    case 'Polygon':
      for (const ring of geom.coordinates as C2[]) addChain(ring, cx, cy, buf); break
    case 'MultiPolygon':
      for (const poly of geom.coordinates as C2[][])
        for (const ring of poly) addChain(ring, cx, cy, buf)
      break
  }
}

// ── LayerLines — un lineSegments por capa DXF ────────────────────────────────

function LayerLines({ layer, folder, cx, cy }: {
  layer: DxfLayerConfig; folder: string; cx: number; cy: number
}) {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null)
  const { invalidate } = useThree()
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const url = `${import.meta.env.BASE_URL}maps/${folder}/${layer.name}.geojson`

    async function load() {
      try {
        let fc = geoCache.get(url)
        if (!fc) {
          const res = await fetch(url)
          if (!res.ok) return
          fc = (await res.json()) as GeoFC
          geoCache.set(url, fc)
        }
        if (!alive.current) return

        const buf: number[] = []
        for (const feat of fc.features) {
          if (feat.geometry) extractSegments(feat.geometry, cx, cy, buf)
        }
        if (!buf.length || !alive.current) return

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf), 3))
        setGeo(geometry)
        invalidate()
      } catch { /* skip archivos faltantes */ }
    }
    load()
    return () => { alive.current = false }
  }, [layer.name, folder, cx, cy, invalidate])

  if (!geo) return null

  const opacity = OPACITY_BY_GROUP[layer.group] ?? 0.5
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={LINE_COLOR} opacity={opacity} transparent depthWrite={false} />
    </lineSegments>
  )
}

// ── GridFloor — grilla de referencia métrica ─────────────────────────────────

function GridFloor({ size }: { size: number }) {
  const helper = new THREE.GridHelper(size * 2, Math.floor(size * 2), '#0a1a2e', '#071525')
  return <primitive object={helper} position={[0, -0.05, 0]} />
}

// ── CameraRotator — reposiciona la cámara al cambiar ángulo (Q/E) ───────────

function CameraRotator({ angleIdx, distance }: { angleIdx: 0|1|2|3; distance: number }) {
  const { camera } = useThree()
  useEffect(() => {
    const az = AZIMUTHS[angleIdx]
    const el = ISO_ELEVATION
    camera.position.set(
      distance * Math.cos(el) * Math.sin(az),
      distance * Math.sin(el),
      distance * Math.cos(el) * Math.cos(az),
    )
    camera.lookAt(0, 0, 0)
    if (camera instanceof THREE.OrthographicCamera) camera.updateProjectionMatrix()
  }, [angleIdx, distance, camera])
  return null
}

// ── Scene — contenido 3D ─────────────────────────────────────────────────────

function Scene({ view, cx, cy }: { view: ViewName; cx: number; cy: number }) {
  const mapView = MAP_VIEWS[view]
  // Blueprint 3D muestra siempre las capas con defaultVisible=true, independiente de los toggles 2D
  const layers = mapView.layers.filter((l) => l.defaultVisible)

  const sizeX = mapView.bounds[1][1] - mapView.bounds[0][1]
  const sizeZ = mapView.bounds[1][0] - mapView.bounds[0][0]

  return (
    <>
      <GridFloor size={Math.max(sizeX, sizeZ)} />
      {layers.map((layer) => (
        <LayerLines key={layer.name} layer={layer} folder={mapView.folder} cx={cx} cy={cy} />
      ))}
    </>
  )
}

// ── Wireframe3DView — componente público ─────────────────────────────────────

export function Wireframe3DView() {
  const currentView = useMapaLeafletStore((s) => s.currentView)
  const mapView     = MAP_VIEWS[currentView]

  // Centro en coords GeoJSON. bounds: [[Ymin,Xmin],[Ymax,Xmax]]
  const cx = (mapView.bounds[0][1] + mapView.bounds[1][1]) / 2
  const cy = (mapView.bounds[0][0] + mapView.bounds[1][0]) / 2

  const sizeX    = mapView.bounds[1][1] - mapView.bounds[0][1]
  const sizeZ    = mapView.bounds[1][0] - mapView.bounds[0][0]
  const distance = Math.sqrt(sizeX * sizeX + sizeZ * sizeZ) * 1.2
  const initZoom = Math.min(Math.max(sizeX, sizeZ) * 0.12, 18)

  const [angleIdx, setAngleIdx] = useState<0 | 1 | 2 | 3>(3)
  // OrbitControls ref — usamos interfaz mínima que necesitamos (object, target, update)
  const orbitRef = useRef<{
    object: THREE.Camera
    target: THREE.Vector3
    update: () => void
  } | null>(null)

  function resetCamera() {
    const ctrl = orbitRef.current
    if (!ctrl) return
    const az = AZIMUTHS[angleIdx]
    const el = ISO_ELEVATION
    const cam = ctrl.object as THREE.OrthographicCamera
    cam.position.set(
      distance * Math.cos(el) * Math.sin(az),
      distance * Math.sin(el),
      distance * Math.cos(el) * Math.cos(az),
    )
    cam.zoom = initZoom
    cam.updateProjectionMatrix()
    ctrl.target.set(0, 0, 0)
    ctrl.update()
  }

  function rotateAngle() {
    setAngleIdx((i) => ((i + 1) % 4) as 0 | 1 | 2 | 3)
  }

  return (
    <div className="absolute inset-0" style={{ background: BG_COLOR }}>
      <Canvas
        orthographic
        camera={{
          position: [
            distance * Math.cos(ISO_ELEVATION) * Math.sin(AZIMUTHS[3]),
            distance * Math.sin(ISO_ELEVATION),
            distance * Math.cos(ISO_ELEVATION) * Math.cos(AZIMUTHS[3]),
          ],
          up: [0, 1, 0],
          zoom: initZoom,
          near: 0.01,
          far: distance * 20,
        }}
        onCreated={({ camera }) => camera.lookAt(0, 0, 0)}
        gl={{ antialias: true, alpha: false }}
        dpr={[1, Math.min(window.devicePixelRatio, 2)]}
        frameloop="always"
      >
        <color attach="background" args={[BG_COLOR]} />

        <CameraRotator angleIdx={angleIdx} distance={distance} />

        <Scene view={currentView} cx={cx} cy={cy} />

        <OrbitControls
          ref={orbitRef as React.MutableRefObject<null>}
          enablePan
          enableZoom
          enableRotate
          dampingFactor={0.07}
          enableDamping
          minZoom={1}
          maxZoom={200}
          makeDefault
        />
      </Canvas>

      {/* ── Overlay controles ── */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        <button
          onClick={rotateAngle}
          title={`Vista actual: ${ANGLE_NAMES[angleIdx]} → rotar`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#060e1a]/90 border border-[#c8d8f0]/20 rounded-lg text-[11px] text-[#c8d8f0]/70 hover:text-[#c8d8f0] hover:border-[#c8d8f0]/40 transition-all backdrop-blur-sm"
        >
          <RotateCw size={12} />
          <span className="hidden sm:inline">{ANGLE_NAMES[angleIdx]}</span>
        </button>
        <button
          onClick={resetCamera}
          title="Centrar cámara"
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#060e1a]/90 border border-[#c8d8f0]/10 rounded-lg text-[11px] text-[#c8d8f0]/40 hover:text-[#c8d8f0]/70 hover:border-[#c8d8f0]/25 transition-all backdrop-blur-sm"
        >
          <Home size={12} />
          <span className="hidden sm:inline">Centrar</span>
        </button>
      </div>

      {/* ── Info inferior ── */}
      <div className="absolute bottom-3 left-3 text-[10px] text-[#c8d8f0]/20 font-mono pointer-events-none select-none">
        3D Blueprint · {mapView.label} · drag=orbitar · scroll=zoom · botón=rotar
      </div>
    </div>
  )
}
