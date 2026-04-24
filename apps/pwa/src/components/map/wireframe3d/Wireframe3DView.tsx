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
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { useMapaLeafletStore, type ElementoMapa } from '@/store/useMapaLeafletStore'
import {
  MAP_VIEWS,
  type DxfLayerConfig,
  type ViewName,
  DXF_INTERIOR_SVG_LAYERS,
  DXF_SVG_BOUNDS,
  type DxfSvgLayerConfig,
} from '@/data/dxfLayers'
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

// ── SVGLayer3D — carga un SVG DXF y lo renderiza como líneas 3D al y=0 ──────
/**
 * Las capas SVG del DXF usan viewBox 0..1000000 (X) × 0..714286 (Y) que
 * corresponde a DXF_SVG_BOUNDS = X[-5,100], Y[40,115]. En SVG, Y crece hacia
 * abajo → DXF Y=115 (top) cae en SVG Y=0; invertimos al convertir a 3D.
 */
const SVG_BOUNDS = DXF_SVG_BOUNDS  // [[Ymin,Xmin],[Ymax,Xmax]]
const SVG_VIEWBOX_W = 1_000_000
const SVG_VIEWBOX_H = 714_286

const svgCache = new Map<string, string>()

function SVGLayer3D({ cfg, cx, cy, opacity }: {
  cfg: DxfSvgLayerConfig; cx: number; cy: number; opacity: number
}) {
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null)
  const { invalidate } = useThree()
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const url = `${import.meta.env.BASE_URL}maps/dxf-interior/svg/${cfg.name}.svg`

    async function load() {
      try {
        let text = svgCache.get(url)
        if (!text) {
          const res = await fetch(url)
          if (!res.ok) return
          text = await res.text()
          svgCache.set(url, text)
        }
        if (!alive.current) return

        const loader = new SVGLoader()
        const data = loader.parse(text)

        // Escalas viewBox → metros DXF
        const dxfXMin = SVG_BOUNDS[0][1]  // -5
        const dxfXMax = SVG_BOUNDS[1][1]  // 100
        const dxfYMin = SVG_BOUNDS[0][0]  // 40
        const dxfYMax = SVG_BOUNDS[1][0]  // 115
        const wM = dxfXMax - dxfXMin      // 105
        const hM = dxfYMax - dxfYMin      // 75
        const sx = wM / SVG_VIEWBOX_W     // m por unidad SVG X
        const sy = hM / SVG_VIEWBOX_H     // m por unidad SVG Y

        const buf: number[] = []
        const SAMPLE_MIN_DIST = 0.05  // m — densidad mínima entre puntos consecutivos

        for (const path of data.paths) {
          for (const sub of path.subPaths) {
            const pts = sub.getPoints(Math.max(8, Math.floor(sub.getLength() / 100)))
            for (let i = 0; i < pts.length - 1; i++) {
              const a = pts[i]!
              const b = pts[i + 1]!
              // SVG → DXF (Y invertido: SVG 0 = DXF Y top)
              const axm = dxfXMin + a.x * sx
              const aym = dxfYMax - a.y * sy
              const bxm = dxfXMin + b.x * sx
              const bym = dxfYMax - b.y * sy
              // Saltar segmentos demasiado cortos (ruido)
              const d = Math.hypot(bxm - axm, bym - aym)
              if (d < SAMPLE_MIN_DIST) continue
              // 3D: worldX = dxfX - cx, worldZ = -(dxfY - cy)
              buf.push(axm - cx, 0, -(aym - cy))
              buf.push(bxm - cx, 0, -(bym - cy))
            }
          }
        }

        if (!buf.length || !alive.current) return

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf), 3))
        setGeo(geometry)
        invalidate()
      } catch { /* skip */ }
    }
    load()
    return () => { alive.current = false }
  }, [cfg.name, cx, cy, invalidate])

  if (!geo) return null
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

// ── ElementosLayer — elementos del usuario (polígonos, círculos, líneas) ─────
/**
 * Convierte los ElementoMapa de la vista activa a LineSegments Three.js.
 * Coords del store: [lat, lng] = [Y, X] en unidades DXF.
 * Mismo sistema que addChain: x3d = X - cx,  z3d = -(Y - cy).
 */
const ELEM_CIRCLE_SEGMENTS = 32

function buildElemGeometry(
  elementos: ElementoMapa[],
  view: string,
  cx: number,
  cy: number,
): THREE.BufferGeometry | null {
  const buf: number[] = []

  for (const el of elementos) {
    if (el.mapView !== view) continue

    if (el.poligono && el.poligono.length >= 2) {
      // Polígono / línea
      const close = el.tipo !== 'linea'
      const pts = close ? [...el.poligono, el.poligono[0]!] : el.poligono
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]!; const b = pts[i + 1]!
        buf.push(a[1] - cx, 0, -(a[0] - cy))
        buf.push(b[1] - cx, 0, -(b[0] - cy))
      }
    } else if (el.punto) {
      const [lat, lng] = el.punto
      if (el.radio && el.radio > 0) {
        // Círculo: N segmentos
        const r = el.radio
        const N = ELEM_CIRCLE_SEGMENTS
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2
          const b = ((i + 1) / N) * Math.PI * 2
          buf.push(
            (lng + r * Math.cos(a)) - cx, 0, -((lat + r * Math.sin(a)) - cy),
            (lng + r * Math.cos(b)) - cx, 0, -((lat + r * Math.sin(b)) - cy),
          )
        }
      } else {
        // Punto: pequeña cruz
        const s = 0.5
        buf.push(lng - s - cx, 0, -(lat - cy),  lng + s - cx, 0, -(lat - cy))
        buf.push(lng - cx, 0, -(lat - s - cy),  lng - cx, 0, -(lat + s - cy))
      }
    }
  }

  if (!buf.length) return null
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf), 3))
  return geometry
}

function ElementosLayer({ view, cx, cy }: { view: string; cx: number; cy: number }) {
  const elementos = useMapaLeafletStore((s) => s.elementos)
  const { invalidate } = useThree()

  const geo = useMemo(
    () => buildElemGeometry(elementos, view, cx, cy),
    [elementos, view, cx, cy],
  )

  useEffect(() => { if (geo) invalidate() }, [geo, invalidate])

  if (!geo) return null
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#f59e0b" opacity={0.9} transparent depthWrite={false} />
    </lineSegments>
  )
}

// ── Scene — contenido 3D ─────────────────────────────────────────────────────

function Scene({ view, cx, cy }: { view: ViewName; cx: number; cy: number }) {
  const mapView = MAP_VIEWS[view]
  // Blueprint 3D: capas con defaultVisible=true, excluyendo eliminadas permanentemente
  const layers = mapView.layers.filter((l) => l.defaultVisible && !geoJsonElim.includes(l.name))
  const capasSvgVisibles        = useMapaLeafletStore((s) => s.capasSvgVisibles)
  const capasSvgOpacity         = useMapaLeafletStore((s) => s.capasSvgOpacity)
  const capasSvgEliminadas      = useMapaLeafletStore((s) => s.capasSvgEliminadas)
  const capasGeoJsonEliminadas  = useMapaLeafletStore((s) => s.capasGeoJsonEliminadas)
  const geoJsonElim             = capasGeoJsonEliminadas[view] ?? []

  const sizeX = mapView.bounds[1][1] - mapView.bounds[0][1]
  const sizeZ = mapView.bounds[1][0] - mapView.bounds[0][0]

  return (
    <>
      <GridFloor size={Math.max(sizeX, sizeZ)} />
      {layers.map((layer) => (
        <LayerLines key={layer.name} layer={layer} folder={mapView.folder} cx={cx} cy={cy} />
      ))}
      {/* Capas SVG fieles al DXF (solo vista interior) — respeta eliminadas y visibilidad */}
      {view === 'interior' && DXF_INTERIOR_SVG_LAYERS
        .filter((cfg) => !capasSvgEliminadas.includes(cfg.name))
        .filter((cfg) => capasSvgVisibles[cfg.name] ?? cfg.defaultVisible)
        .map((cfg) => (
          <SVGLayer3D
            key={`svg3d-${cfg.name}`}
            cfg={cfg} cx={cx} cy={cy}
            opacity={Math.min(1, cfg.opacity * capasSvgOpacity * 1.15)}
          />
        ))}
      {/* Elementos del usuario: polígonos, círculos, líneas */}
      <ElementosLayer view={view} cx={cx} cy={cy} />
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
