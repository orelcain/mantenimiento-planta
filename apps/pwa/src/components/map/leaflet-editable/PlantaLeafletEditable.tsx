/**
 * PlantaLeafletEditable
 * ─────────────────────
 * Mapa interactivo del recinto Antarfood:
 *  • Capas reales del DXF como base (lectura)
 *  • Editor Geoman: polígonos, círculos, marcadores
 *  • Snap a grilla 0.5m, tooltip con área en m² mientras dibujás
 *  • Click en elemento → se selecciona en panel
 *  • Hover con halo
 *  • Atajos: Esc cancela, Del borra, Ctrl+D duplica
 *  • Persistencia: Zustand + localStorage
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, GeoJSON, useMap, ZoomControl } from 'react-leaflet'
import L, { LatLngBounds, Map as LMap, FeatureGroup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import './geoman-dark.css'
import { MAP_VIEWS, type DxfLayerConfig, type MapView } from '@/data/dxfLayers'
import { useMapaLeafletStore, type ElementoMapa, type PolygonCoords } from '@/store/useMapaLeafletStore'

// ─── Helpers de geometría ────────────────────────────────────────────────────
/** Snap a grilla — usa unidad nativa de la vista. Para recinto = 0.5m, para
 *  interior (mm) = 500mm = 0.5m. */
function snapFor(view: MapView): (v: number) => number {
  const grid = 0.5 / view.unitScale  // siempre 0.5m físicos
  return (v: number) => Math.round(v / grid) * grid
}

/** Área en m² de un polígono (Shoelace formula). Coords [Y, X] */
function polygonArea(latlngs: L.LatLng[]): number {
  let area = 0
  for (let i = 0; i < latlngs.length; i++) {
    const j = (i + 1) % latlngs.length
    const a = latlngs[i]
    const b = latlngs[j]
    if (!a || !b) continue
    area += a.lng * b.lat
    area -= b.lng * a.lat
  }
  return Math.abs(area / 2)
}

/** Centro de un polígono (promedio simple de vértices) */
function polygonCenter(coords: PolygonCoords): L.LatLng {
  const lat = coords.reduce((a, c) => a + c[0], 0) / coords.length
  const lng = coords.reduce((a, c) => a + c[1], 0) / coords.length
  return L.latLng(lat, lng)
}

// ─── Grilla canvas ───────────────────────────────────────────────────────────

/**
 * Fase estable de la grilla anclada a coordenadas DXF.
 * Calcula a qué distancia (en px) del origen del canvas (0,0) cae la primera
 * línea de la grilla en el eje perpendicular, usando las coordenadas DXF del
 * punto que hay en ese origen. Estable a cualquier zoom/pan.
 *
 * Derivación: en CRS.Simple Leaflet flipea Y (screen_y = -dxf_lat * scale + k).
 * La dirección perpendicular a `lineAngleRad` en screen es (-sin θ, cos θ).
 * Ese vector en DXF es (lat=-cos θ, lng=-sin θ). La proyección del punto DXF
 * (lat0, lng0) sobre ese eje: -(lat0·cos θ + lng0·sin θ) · unitScale [metros].
 */
function gridPhase(
  originLL: L.LatLng,
  lineAngleRad: number,
  unitScale: number,
  oneMpx: number,
): number {
  const projM = -unitScale * (originLL.lat * Math.cos(lineAngleRad) + originLL.lng * Math.sin(lineAngleRad))
  return (((projM % 1) + 1) % 1) * oneMpx
}

/** Dibuja líneas paralelas a `lineAngleRad` separadas `spacingPx` px,
 *  usando `phasePx` (0..spacingPx) precalculado en coordenadas DXF. */
function drawParallelLines(
  ctx: CanvasRenderingContext2D,
  W: number, H: number,
  lineAngleRad: number, spacingPx: number,
  phasePx: number,
) {
  if (spacingPx < 2) return
  const cos = Math.cos(lineAngleRad), sin = Math.sin(lineAngleRad)
  const perpX = -sin, perpY = cos
  const ext = Math.hypot(W, H) + spacingPx * 2
  const n = Math.ceil(ext / spacingPx) + 2
  ctx.beginPath()
  for (let i = -n; i <= n; i++) {
    const d = phasePx + i * spacingPx
    const px = d * perpX, py = d * perpY
    ctx.moveTo(px - ext * cos, py - ext * sin)
    ctx.lineTo(px + ext * cos, py + ext * sin)
  }
  ctx.stroke()
}

/** Capa canvas con grilla 1m×1m fija y ángulo ajustable por vista. */
function GrillaLayer({ view }: { view: MapView }) {
  const map           = useMap()
  const grillaVisible = useMapaLeafletStore((s) => s.grillaVisible)
  const grillaAngles  = useMapaLeafletStore((s) => s.grillaAngles)
  const grillaAngle   = grillaAngles[view.name] ?? 0
  const canvasRef     = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const container = map.getContainer()

    const cleanup = () => {
      if (canvasRef.current) { canvasRef.current.remove(); canvasRef.current = null }
    }

    if (!grillaVisible) { cleanup(); return }

    if (!canvasRef.current) {
      const cv = document.createElement('canvas')
      cv.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:200;'
      container.appendChild(cv)
      canvasRef.current = cv
    }

    const draw = () => {
      const cv = canvasRef.current
      if (!cv) return
      const sz = map.getSize()
      // Redimensionar solo si cambió el tamaño (evita borrar el canvas innecesariamente)
      if (cv.width !== sz.x || cv.height !== sz.y) { cv.width = sz.x; cv.height = sz.y }
      const ctx = cv.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, sz.x, sz.y)

      // Pixels por 1 metro real
      const p0 = map.latLngToContainerPoint(L.latLng(0, 0))
      const p1 = map.latLngToContainerPoint(L.latLng(0, 1 / view.unitScale))
      const oneMpx = Math.abs(p1.x - p0.x)
      if (oneMpx < 1.5) return   // demasiado alejado — invisible, no dibuja

      // Fase calculada desde DXF puro (estable a cualquier zoom/pan)
      const originLL = map.containerPointToLatLng(L.point(0, 0))
      const aRad = grillaAngle * Math.PI / 180
      const phase1 = gridPhase(originLL, aRad,                view.unitScale, oneMpx)
      const phase2 = gridPhase(originLL, aRad + Math.PI / 2, view.unitScale, oneMpx)

      // Clip al recinto + 100 m de margen (no dibuja fuera del área del mapa)
      const marginDxf = 10 / view.unitScale
      const [swB, neB] = view.bounds
      const swPx = map.latLngToContainerPoint(L.latLng(swB[0] - marginDxf, swB[1] - marginDxf))
      const nePx = map.latLngToContainerPoint(L.latLng(neB[0] + marginDxf, neB[1] + marginDxf))
      const clipL = Math.max(0, Math.min(swPx.x, nePx.x))
      const clipT = Math.max(0, Math.min(swPx.y, nePx.y))
      const clipR = Math.min(sz.x, Math.max(swPx.x, nePx.x))
      const clipB = Math.min(sz.y, Math.max(swPx.y, nePx.y))

      if (clipR > clipL && clipB > clipT) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(clipL, clipT, clipR - clipL, clipB - clipT)
        ctx.clip()

        ctx.strokeStyle = 'rgba(148,163,184,0.14)'
        ctx.lineWidth = 0.5
        drawParallelLines(ctx, sz.x, sz.y, aRad,                oneMpx, phase1)
        drawParallelLines(ctx, sz.x, sz.y, aRad + Math.PI / 2, oneMpx, phase2)

        ctx.restore()
      }

      // Etiqueta fuera del clip (siempre visible)
      ctx.fillStyle = 'rgba(148,163,184,0.4)'
      ctx.font = '9px ui-monospace, monospace'
      ctx.fillText(`1m × 1m${grillaAngle !== 0 ? ' · ' + grillaAngle + '°' : ''}`, 6, sz.y - 6)
    }

    // RAF throttle: máximo 1 redibujado por frame aunque Leaflet dispare muchos eventos
    let rafId: number | null = null
    const scheduleDraw = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => { rafId = null; draw() })
    }

    draw()
    map.on('move zoom moveend zoomend resize', scheduleDraw)
    return () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
      map.off('move zoom moveend zoomend resize', scheduleDraw)
      cleanup()
    }
  }, [map, grillaVisible, grillaAngle, view])

  return null
}

// ─── Overlay de grilla (controles ángulo, fuera del MapContainer) ─────────────
function GrillaOverlay({ view }: { view: MapView }) {
  const grillaAngles   = useMapaLeafletStore((s) => s.grillaAngles)
  const setGrillaAngle = useMapaLeafletStore((s) => s.setGrillaAngle)
  const grillaAngle    = grillaAngles[view.name] ?? 0
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(String(grillaAngle))

  // Sync inputVal cuando cambia la vista o el ángulo externo
  useEffect(() => { setInputVal(String(grillaAngle)) }, [view.name, grillaAngle])

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    setGrillaAngle(view.name, v)
    setInputVal(String(v))
  }
  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputVal(e.target.value)
    const n = parseFloat(e.target.value)
    if (!isNaN(n) && n >= -90 && n <= 90) setGrillaAngle(view.name, n)
  }
  const handleReset = () => { setGrillaAngle(view.name, 0); setInputVal('0') }

  // ── Panel colapsado ───────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="hidden sm:block absolute bottom-10 left-3 z-[1000] pointer-events-none select-none">
        <div className="bg-gray-900/90 border border-slate-700/40 rounded-lg shadow-lg px-3 py-1.5 flex items-center gap-2 backdrop-blur-sm">
          <span className="text-[9px] text-slate-500 font-mono">1m × 1m</span>
          {grillaAngle !== 0 && (
            <span className="text-[9px] font-mono text-amber-400/80">{grillaAngle}°</span>
          )}
          <button
            className="pointer-events-auto text-[9px] text-gray-500 hover:text-amber-400 transition-colors border border-gray-700/50 rounded px-1.5 py-0.5"
            onClick={() => setEditing(true)}
          >
            Editar ángulo
          </button>
        </div>
      </div>
    )
  }

  // ── Panel expandido ───────────────────────────────────────────────────────
  return (
    <div
      className="hidden sm:block absolute bottom-10 left-3 z-[1000] pointer-events-none select-none"
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="bg-gray-900/95 border border-slate-700/60 rounded-xl shadow-xl px-4 py-3 w-56 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Grilla · {view.label}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="pointer-events-auto text-[10px] text-gray-600 hover:text-amber-400 transition-colors"
              onClick={handleReset}
            >
              Reset
            </button>
            <button
              className="pointer-events-auto text-[11px] text-gray-600 hover:text-white transition-colors leading-none"
              onClick={() => setEditing(false)}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Presets rápidos */}
        <div className="flex gap-1 mb-2">
          {[0, 15, 30, 45].map((deg) => (
            <button
              key={deg}
              className={[
                'pointer-events-auto flex-1 text-[9px] py-0.5 rounded border transition-colors',
                Math.abs(grillaAngle) === deg || Math.abs(grillaAngle) === 90 - deg
                  ? 'border-amber-600/60 text-amber-400 bg-amber-600/10'
                  : 'border-gray-700/50 text-gray-500 hover:text-white hover:border-gray-500',
              ].join(' ')}
              onClick={() => { setGrillaAngle(view.name, deg); setInputVal(String(deg)) }}
            >
              {deg === 0 ? 'H/V' : `${deg}°`}
            </button>
          ))}
        </div>

        <label className="text-[9px] text-gray-500 block mb-1">
          Fino ({grillaAngle}°)
        </label>
        <input
          type="range"
          min="-90" max="90" step="0.5"
          value={grillaAngle}
          onChange={handleSlider}
          className="pointer-events-auto w-full accent-amber-500 mb-1.5"
        />
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-gray-600">-90°</span>
          <input
            type="number"
            min="-90" max="90" step="0.5"
            value={inputVal}
            onChange={handleText}
            className="pointer-events-auto flex-1 text-center text-[11px] font-mono bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-amber-400 focus:outline-none focus:border-amber-600"
          />
          <span className="text-[9px] text-gray-600">+90°</span>
        </div>
        <button
          className="pointer-events-auto w-full text-[10px] py-1 mt-2.5 rounded-md bg-slate-700/40 border border-slate-600/40 text-slate-300 hover:bg-slate-600/50 transition-colors"
          onClick={() => setEditing(false)}
        >
          Listo
        </button>
      </div>
    </div>
  )
}

// ─── Snap helpers (herramienta medir) ───────────────────────────────────────
/** Recorre un FeatureCollection GeoJSON y empuja todos los vértices a `out`.
 *  DXF guarda [X, Y] → Leaflet necesita lat=Y, lng=X. */
function collectSnapPoints(fc: GeoJSON.FeatureCollection, out: L.LatLng[]) {
  const walk = (c: unknown): void => {
    if (!Array.isArray(c) || c.length === 0) return
    if (typeof c[0] === 'number') {
      out.push(L.latLng(c[1] as number, c[0] as number))
    } else {
      for (const child of c) walk(child)
    }
  }
  for (const f of fc.features) {
    if (f.geometry) walk((f.geometry as { coordinates: unknown }).coordinates)
  }
}

/** Busca el vértice snap más cercano al cursor en espacio de píxeles. */
function findSnap(map: LMap, pts: L.LatLng[], cursor: L.LatLng, threshPx: number): L.LatLng | null {
  const cp = map.latLngToContainerPoint(cursor)
  let best: L.LatLng | null = null
  let bestD = threshPx
  for (const pt of pts) {
    const pp = map.latLngToContainerPoint(pt)
    const d = Math.hypot(pp.x - cp.x, pp.y - cp.y)
    if (d < bestD) { bestD = d; best = pt }
  }
  return best
}

/** Ángulo en grados del segmento a→b (respecto a horizontal). */
function segAngle(a: L.LatLng, b: L.LatLng): number {
  return Math.atan2(b.lat - a.lat, b.lng - a.lng) * 180 / Math.PI
}

/** Etiqueta de ángulo: "H" si ~horizontal, "V" si ~vertical, o "XX.X°". */
function angleTag(deg: number): string {
  const a = ((deg % 180) + 180) % 180
  if (a <= 3 || a >= 177) return 'H'
  if (Math.abs(a - 90) <= 3) return 'V'
  return `${deg.toFixed(1)}°`
}

// ─── Carga perezosa de cada GeoJSON DXF ──────────────────────────────────────
function CapaDXF({ cfg, folder }: { cfg: DxfLayerConfig; folder: string }) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)
  const visible = useMapaLeafletStore((s) => s.capasVisibles[s.currentView]?.[cfg.name] ?? cfg.defaultVisible)
  const map = useMap()
  const [zoomFactor, setZoomFactor] = useState(1)

  useEffect(() => {
    let cancel = false
    fetch(`${import.meta.env.BASE_URL}maps/${folder}/${cfg.name}.geojson`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancel) setData(j) })
      .catch(() => {})
    return () => { cancel = true }
  }, [cfg.name, folder])

  // Ajustar peso según zoom: más zoom = trazo más grueso, menos zoom = más fino
  useEffect(() => {
    if (!map) return
    const update = () => {
      const z = map.getZoom()
      // En CRS.Simple zoom 0 ≈ 1px/unidad; queremos peso 1.0 cerca de fit y crece al zoom-in
      const factor = Math.max(0.5, Math.min(3, Math.pow(1.4, Math.max(0, z + 4))))
      setZoomFactor(factor)
    }
    update()
    map.on('zoomend', update)
    return () => { map.off('zoomend', update) }
  }, [map])

  if (!data || !visible) return null

  return (
    <GeoJSON
      data={data as GeoJSON.GeoJsonObject}
      coordsToLatLng={(c) => L.latLng(c[1], c[0])}
      style={{
        color: cfg.color,
        weight: Math.max(0.4, cfg.weight * zoomFactor * 0.8),
        opacity: cfg.opacity,
        fillColor: cfg.color,
        fillOpacity: 0.06,
        lineCap: 'round',
        lineJoin: 'round',
      }}
      pointToLayer={(_f, latlng) =>
        L.circleMarker(latlng, {
          radius: Math.max(1.5, 2.5 * zoomFactor * 0.6),
          color: cfg.color, fillOpacity: 0.7, weight: 1,
        })
      }
      interactive={false}
    />
  )
}

// ─── Tooltip flotante con área mientras se dibuja ────────────────────────────
function DrawAreaTooltip() {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    const el = document.createElement('div')
    el.className = 'draw-area-tooltip'
    el.style.display = 'none'
    document.body.appendChild(el)

    const onDrawStart = () => { el.style.display = 'none' }
    const onVertexAdded = (e: any) => {
      const wm: any = e.workingLayer
      if (!wm || !wm.getLatLngs) return
      const coords = wm.getLatLngs()
      const points = Array.isArray(coords[0]) ? coords[0] : coords
      if (points.length < 2) { el.style.display = 'none'; return }
      const area = polygonArea(points as L.LatLng[])
      el.textContent = points.length >= 3 ? `${area.toFixed(1)} m²` : `${points.length} pts`
      el.style.display = 'block'
    }
    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (el.style.display === 'block') {
        el.style.left = (e.originalEvent.clientX + 12) + 'px'
        el.style.top  = (e.originalEvent.clientY + 12) + 'px'
      }
    }
    const onDrawEnd = () => { el.style.display = 'none' }

    map.on('pm:drawstart', onDrawStart)
    map.on('pm:vertexadded', onVertexAdded)
    map.on('mousemove', onMouseMove)
    map.on('pm:drawend pm:create', onDrawEnd)

    return () => {
      map.off('pm:drawstart', onDrawStart)
      map.off('pm:vertexadded', onVertexAdded)
      map.off('mousemove', onMouseMove)
      map.off('pm:drawend pm:create', onDrawEnd)
      el.remove()
    }
  }, [map])

  return null
}

// ─── Editor Geoman ────────────────────────────────────────────────────────────
function EditorGeoman({ view }: { view: MapView }) {
  const map = useMap()
  const editMode = useMapaLeafletStore((s) => s.editMode)
  const featureGroupRef = useRef<FeatureGroup | null>(null)
  const snap = snapFor(view)
  const u2 = view.unitScale * view.unitScale  // factor unidad² → m²

  useEffect(() => {
    if (!map) return
    if (!featureGroupRef.current) {
      featureGroupRef.current = L.featureGroup().addTo(map)
    }
    const pmMap = map as LMap & { pm: any }
    if (!pmMap.pm) return

    pmMap.pm.setLang('es')

    if (!editMode) {
      pmMap.pm.removeControls()
      pmMap.pm.disableGlobalEditMode()
      pmMap.pm.disableGlobalDragMode()
      pmMap.pm.disableGlobalRemovalMode()
      pmMap.pm.disableGlobalRotateMode()
      return
    }

    pmMap.pm.addControls({
      position: 'topleft',
      drawMarker: true, drawCircleMarker: false, drawPolyline: true,
      drawRectangle: true, drawPolygon: true, drawCircle: true,
      drawText: false, editMode: true, dragMode: true,
      cutPolygon: false, removalMode: true, rotateMode: true,
    })

    pmMap.pm.setPathOptions({ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.18, weight: 2 })
    pmMap.pm.setGlobalOptions({
      snappable: true, snapDistance: 12, tooltips: true, allowSelfIntersection: false,
    })

    const onCreate = (e: any) => {
      const layer = e.layer
      const shape = e.shape
      const { addElemento, setSelectedId } = useMapaLeafletStore.getState()

      let elemento: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'> | null = null

      if (shape === 'Polygon' || shape === 'Rectangle') {
        const latlngs: L.LatLng[] = (layer.getLatLngs()[0] as L.LatLng[]) ?? []
        const snapped: PolygonCoords = latlngs.map((p) => [snap(p.lat), snap(p.lng)])
        layer.setLatLngs([snapped.map((p) => L.latLng(p[0], p[1]))])
        const area_m2 = polygonArea(latlngs) * u2
        elemento = {
          tipo: 'zona', nombre: '', categoria: 'otros', estado: 'operativo',
          mapView: view.name, poligono: snapped,
          meta: { area_m2: Number(area_m2.toFixed(2)) },
        }
      } else if (shape === 'Circle') {
        const c = layer.getLatLng() as L.LatLng
        const r = layer.getRadius() as number
        const cs: [number, number] = [snap(c.lat), snap(c.lng)]
        layer.setLatLng(L.latLng(cs[0], cs[1]))
        elemento = {
          tipo: 'forma', nombre: '', categoria: 'otros', estado: 'operativo',
          mapView: view.name, punto: cs,
          radio: Math.round(r * 10) / 10,
          meta: { radio_m: Number((r * view.unitScale).toFixed(2)) },
        }
      } else if (shape === 'Marker') {
        const c = layer.getLatLng() as L.LatLng
        const cs: [number, number] = [snap(c.lat), snap(c.lng)]
        layer.setLatLng(L.latLng(cs[0], cs[1]))
        elemento = {
          tipo: 'punto', nombre: '', categoria: 'otros', estado: 'operativo',
          mapView: view.name, punto: cs,
        }
      } else if (shape === 'Line') {
        const latlngs: L.LatLng[] = (layer.getLatLngs() as L.LatLng[]) ?? []
        const snapped: PolygonCoords = latlngs.map((p) => [snap(p.lat), snap(p.lng)])
        layer.setLatLngs(snapped.map((p) => L.latLng(p[0], p[1])))
        // Longitud total en metros
        let totalM = 0
        for (let i = 1; i < snapped.length; i++) {
          const a = snapped[i - 1]; const b = snapped[i]
          if (!a || !b) continue
          totalM += Math.hypot(b[0] - a[0], b[1] - a[1]) * view.unitScale
        }
        elemento = {
          tipo: 'linea', nombre: '', categoria: 'estructura', estado: 'operativo',
          mapView: view.name, poligono: snapped,
          meta: { longitud_m: Number(totalM.toFixed(2)) },
        }
      }

      if (elemento) {
        const id = addElemento(elemento)
        ;(layer.options as any).elementoId = id
        setSelectedId(id)
        setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('input[data-name-input="true"]')
          input?.focus(); input?.select()
        }, 80)
      }
      if (featureGroupRef.current) featureGroupRef.current.addLayer(layer)
    }

    const onEdit = (e: any) => {
      const layer = e.layer
      const id = layer.options?.elementoId
      if (!id) return
      const { updateElemento, elementos } = useMapaLeafletStore.getState()
      const el = elementos.find((x) => x.id === id)
      if (layer.getLatLngs) {
        const raw = layer.getLatLngs() as L.LatLng[] | L.LatLng[][]
        // Polygon: LatLng[][] (rings). Polyline (linea): LatLng[].
        const isLinea = el?.tipo === 'linea' || !Array.isArray(raw[0])
        const latlngs: L.LatLng[] = (isLinea ? raw : raw[0] ?? []) as L.LatLng[]
        const poligono: PolygonCoords = latlngs.map((p) => [snap(p.lat), snap(p.lng)])
        if (isLinea) {
          let totalM = 0
          for (let i = 1; i < poligono.length; i++) {
            const a = poligono[i - 1]!
            const b = poligono[i]!
            totalM += Math.hypot(b[0] - a[0], b[1] - a[1]) * view.unitScale
          }
          updateElemento(id, {
            poligono,
            meta: { ...(el?.meta ?? {}), longitud_m: Number(totalM.toFixed(2)) },
          })
        } else {
          updateElemento(id, {
            poligono,
            meta: { ...(el?.meta ?? {}), area_m2: Number((polygonArea(latlngs) * u2).toFixed(2)) },
          })
        }
      } else if (layer.getLatLng) {
        const c = layer.getLatLng() as L.LatLng
        const patch: Partial<ElementoMapa> = { punto: [snap(c.lat), snap(c.lng)] }
        if (layer.getRadius) {
          const r = layer.getRadius()
          patch.radio = Math.round(r * 10) / 10
          patch.meta = { ...(el?.meta ?? {}), radio_m: Number((r * view.unitScale).toFixed(2)) }
        }
        updateElemento(id, patch)
      }
    }

    const onRemove = (e: any) => {
      const id = e.layer.options?.elementoId
      if (id) useMapaLeafletStore.getState().deleteElemento(id)
    }

    map.on('pm:create', onCreate)
    map.on('pm:edit', onEdit)
    map.on('pm:remove', onRemove)

    return () => {
      map.off('pm:create', onCreate)
      map.off('pm:edit', onEdit)
      map.off('pm:remove', onRemove)
    }
  }, [map, editMode, view, snap, u2])

  return null
}

// ─── Renderiza elementos del store + selección/hover ─────────────────────────
function CapaElementos({ view }: { view: MapView }) {
  const map = useMap()
  const allElementos = useMapaLeafletStore((s) => s.elementos)
  const capasUsuario = useMapaLeafletStore((s) => s.capasUsuario)

  const capasById = useMemo(() => {
    const m = new Map<string, { color: string; visible: boolean; orden: number }>()
    for (const c of capasUsuario) {
      if (c.mapView === view.name) m.set(c.id, { color: c.color, visible: c.visible, orden: c.orden })
    }
    return m
  }, [capasUsuario, view.name])

  // Gestion de panes Leaflet por capa (z-index)
  useEffect(() => {
    if (!map) return
    for (const c of capasUsuario) {
      if (c.mapView !== view.name) continue
      const paneName = `capa-${c.id}`
      let pane = map.getPane(paneName)
      if (!pane) pane = map.createPane(paneName)
      // overlayPane default = 400. Distribuir capas en [410, 410+orden]
      pane.style.zIndex = String(410 + c.orden)
      pane.style.pointerEvents = 'auto'
    }
  }, [map, capasUsuario, view.name])

  const elementos = useMemo(
    () => allElementos.filter((e) => {
      if (e.mapView !== view.name) return false
      const capaId = e.meta?.capaId
      if (typeof capaId === 'string') {
        const capa = capasById.get(capaId)
        if (capa && !capa.visible) return false
      }
      return true
    }),
    [allElementos, view.name, capasById],
  )
  const selectedId = useMapaLeafletStore((s) => s.selectedId)
  const setSelectedId = useMapaLeafletStore((s) => s.setSelectedId)
  const multiSelection = useMapaLeafletStore((s) => s.multiSelection)
  const toggleMultiSelect = useMapaLeafletStore((s) => s.toggleMultiSelect)
  const editMode = useMapaLeafletStore((s) => s.editMode)
  const layersRef = useRef<Map<string, L.Layer>>(new Map())

  const selectedSet = useMemo(() => {
    const s = new Set<string>(multiSelection)
    if (selectedId) s.add(selectedId)
    return s
  }, [selectedId, multiSelection])

  useEffect(() => {
    if (!map) return
    const current = layersRef.current

    // Limpia capas que ya no están en el store
    for (const [id, layer] of current.entries()) {
      if (!elementos.find((e) => e.id === id)) {
        map.removeLayer(layer)
        current.delete(id)
      }
    }

    const ESTADO_COLOR = { operativo: '#22c55e', alerta: '#f59e0b', detenido: '#ef4444' }

    for (const el of elementos) {
      const isSelected = selectedSet.has(el.id)
      const isPrimary = el.id === selectedId
      const capaId = typeof el.meta?.capaId === 'string' ? el.meta.capaId : null
      const capaColor = capaId ? capasById.get(capaId)?.color : null
      const color = capaColor ?? ESTADO_COLOR[el.estado] ?? '#888'

      const baseStyle = {
        color, weight: isSelected ? (isPrimary ? 3 : 2.5) : 2,
        fillColor: color, fillOpacity: isSelected ? 0.35 : 0.18,
        className: isSelected ? 'editable-element editable-element-selected' : 'editable-element',
      }

      const paneName = capaId && map.getPane(`capa-${capaId}`) ? `capa-${capaId}` : undefined

      let layer = current.get(el.id) as any
      // Si cambio el pane (reasignacion de capa), destruir y recrear
      if (layer && layer.options?.pane !== paneName) {
        map.removeLayer(layer)
        current.delete(el.id)
        layer = null
      }
      if (!layer) {
        const opts = { ...baseStyle, ...(paneName ? { pane: paneName } : {}) }
        // Crear nueva capa
        if (el.tipo === 'linea' && el.poligono && el.poligono.length >= 2) {
          layer = L.polyline(el.poligono as L.LatLngTuple[], {
            ...opts, fillOpacity: 0, weight: isSelected ? 4 : 3,
          })
        } else if (el.poligono && el.poligono.length >= 3) {
          layer = L.polygon(el.poligono as L.LatLngTuple[], opts)
        } else if (el.punto && el.radio) {
          layer = L.circle(el.punto as L.LatLngTuple, { ...opts, radius: el.radio })
        } else if (el.punto) {
          layer = L.circleMarker(el.punto as L.LatLngTuple, { ...opts, radius: 7 })
        }
        if (layer) {
          ;(layer.options as any).elementoId = el.id
          layer.on('click', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev)
            const oe = ev.originalEvent
            if (oe && (oe.shiftKey || oe.metaKey || oe.ctrlKey)) {
              toggleMultiSelect(el.id)
            } else {
              setSelectedId(el.id)
            }
          })
          layer.addTo(map)
          current.set(el.id, layer)
        }
      } else {
        // Actualizar estilo (cambió selección o estado)
        layer.setStyle?.(baseStyle)
        // Actualizar geometría si cambió
        if (el.poligono && layer.setLatLngs) {
          layer.setLatLngs(el.poligono as L.LatLngTuple[])
        }
        if (el.punto && layer.setLatLng) {
          layer.setLatLng(el.punto as L.LatLngTuple)
          if (el.radio && layer.setRadius) layer.setRadius(el.radio)
        }
      }

      if (layer) {
        const popupHtml = `
          <div style="min-width:140px">
            <div style="font-weight:600;color:#fbbf24;margin-bottom:2px">${el.nombre || '(sin nombre)'}</div>
            <div style="font-size:10px;color:#94a3b8">${el.categoria} · ${el.estado}</div>
            ${el.meta?.area_m2 ? `<div style="font-size:10px;color:#64748b;margin-top:2px">${el.meta.area_m2} m²</div>` : ''}
          </div>
        `
        layer.bindPopup(popupHtml)
      }
    }
  }, [map, elementos, selectedId, setSelectedId, selectedSet, toggleMultiSelect, capasById])

  // ── Geoman edit handles: sólo sobre la capa seleccionada cuando editMode está activo ──
  useEffect(() => {
    const current = layersRef.current
    for (const [id, layer] of current.entries()) {
      const pm = (layer as unknown as { pm?: { enabled: () => boolean; enable: (o?: unknown) => void; disable: () => void } }).pm
      if (!pm) continue
      const shouldEdit = editMode && id === selectedId
      if (shouldEdit && !pm.enabled()) {
        pm.enable({ allowSelfIntersection: true, preventMarkerRemoval: false, snappable: true })
      } else if (!shouldEdit && pm.enabled()) {
        pm.disable()
      }
    }
  }, [selectedId, editMode, elementos])

  return null
}

// ─── Centra el mapa en el elemento seleccionado cuando cambia ────────────────
function CenterOnSelected() {
  const map = useMap()
  const selectedId = useMapaLeafletStore((s) => s.selectedId)
  const elementos  = useMapaLeafletStore((s) => s.elementos)
  const lastIdRef  = useRef<string | null>(null)

  useEffect(() => {
    if (!map || !selectedId || selectedId === lastIdRef.current) return
    lastIdRef.current = selectedId
    const el = elementos.find((e) => e.id === selectedId)
    if (!el) return
    if (el.poligono && el.poligono.length >= 3) {
      const center = polygonCenter(el.poligono)
      map.flyTo(center, Math.max(map.getZoom(), 4), { duration: 0.6 })
    } else if (el.punto) {
      map.flyTo(el.punto as L.LatLngTuple, Math.max(map.getZoom(), 5), { duration: 0.6 })
    }
  }, [map, selectedId, elementos])

  return null
}

// ─── Herramienta de medición ─────────────────────────────────────────────────
/**
 * MeasureTool — clic a clic para medir distancias reales en el DXF.
 * • Snap automático a vértices de las capas visibles (anillo ámbar)
 * • Indicador H / V / ángulo en el overlay
 * • Esc limpia la sesión actual
 */
function MeasureTool({ view }: { view: MapView }) {
  const map = useMap()
  const {
    measureMode,
    measureClearSignal,
    addMeasureSegment,
    setMeasurePointCount,
    setMeasureCurrentPoints,
    setMeasureLastAngle,
  } = useMapaLeafletStore()

  const pointsRef     = useRef<L.LatLng[]>([])
  const layersRef     = useRef<L.Layer[]>([])
  const rubberRef     = useRef<L.Polyline | null>(null)
  const snapPtsRef    = useRef<L.LatLng[]>([])
  const snapRingRef   = useRef<L.CircleMarker | null>(null)
  const snapActiveRef = useRef<L.LatLng | null>(null)

  const removeLayers = useCallback(() => {
    layersRef.current.forEach((l) => { try { map.removeLayer(l) } catch { /* ok */ } })
    layersRef.current = []
    if (rubberRef.current)  { try { map.removeLayer(rubberRef.current) }  catch { /* ok */ }; rubberRef.current  = null }
    if (snapRingRef.current){ try { map.removeLayer(snapRingRef.current) } catch { /* ok */ }; snapRingRef.current = null }
  }, [map])

  const resetPoints = useCallback(() => {
    pointsRef.current = []
    setMeasurePointCount(0)
    setMeasureCurrentPoints([])
    setMeasureLastAngle(null)
  }, [setMeasurePointCount, setMeasureCurrentPoints, setMeasureLastAngle])

  // Reacciona al signal de limpieza (desde overlay o toggleMeasureMode)
  const prevSignalRef = useRef(0)
  useEffect(() => {
    if (measureClearSignal === prevSignalRef.current) return
    prevSignalRef.current = measureClearSignal
    removeLayers()
    resetPoints()
  }, [measureClearSignal, removeLayers, resetPoints])

  // Carga puntos de snap cuando se activa el modo medir
  useEffect(() => {
    if (!measureMode) { snapPtsRef.current = []; return }
    const { capasVisibles, currentView } = useMapaLeafletStore.getState()
    const visible = view.layers.filter((c) => capasVisibles[currentView]?.[c.name] ?? c.defaultVisible)
    const all: L.LatLng[] = []
    Promise.all(
      visible.map((c) =>
        fetch(`${import.meta.env.BASE_URL}maps/${view.folder}/${c.name}.geojson`)
          .then((r) => (r.ok ? r.json() : null))
          .then((fc: GeoJSON.FeatureCollection | null) => { if (fc) collectSnapPoints(fc, all) })
          .catch(() => {})
      )
    ).then(() => { snapPtsRef.current = all })
  }, [measureMode, view])

  useEffect(() => {
    if (!measureMode) {
      removeLayers()
      resetPoints()
      return
    }

    const container = map.getContainer()
    container.style.cursor = 'crosshair'

    const onClick = (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e)
      const snap  = snapActiveRef.current
      const newPt = snap ?? e.latlng
      const pts   = pointsRef.current

      const dot = L.circleMarker(newPt, {
        radius: snap ? 6 : 5,
        color: '#f59e0b',
        fillColor: snap ? '#f59e0b' : '#0a0e14',
        fillOpacity: snap ? 0.8 : 1,
        weight: 2.5, interactive: false,
      }).addTo(map)
      layersRef.current.push(dot)

      if (pts.length > 0) {
        const prev = pts[pts.length - 1]
        if (prev) {
          const dx   = newPt.lng - prev.lng
          const dy   = newPt.lat - prev.lat
          const dist = Math.sqrt(dx * dx + dy * dy) * view.unitScale
          const tag  = angleTag(segAngle(prev, newPt))

          const line = L.polyline([prev, newPt], {
            color: '#f59e0b', weight: 2, dashArray: '8 5',
            interactive: false, opacity: 0.9,
          }).addTo(map)

          const mid = L.latLng((prev.lat + newPt.lat) / 2, (prev.lng + newPt.lng) / 2)
          const lbl = L.marker(mid, {
            icon: L.divIcon({
              className: 'measure-label-container',
              html: `<span class="measure-label">${dist.toFixed(2)} m${tag === 'H' || tag === 'V' ? ` · ${tag}` : ''}</span>`,
              iconSize:   [110, 22],
              iconAnchor: [55, 11],
            }),
            interactive: false, zIndexOffset: 1000,
          }).addTo(map)

          layersRef.current.push(line, lbl)
          addMeasureSegment(dist)
        }
      }

      const newPts = [...pts, newPt]
      pointsRef.current = newPts
      setMeasurePointCount(newPts.length)
      setMeasureCurrentPoints(newPts.map((p) => [p.lat, p.lng]))
    }

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      const snap   = findSnap(map, snapPtsRef.current, e.latlng, 18)
      snapActiveRef.current = snap
      const cursor = snap ?? e.latlng

      // Anillo snap
      if (snap) {
        if (snapRingRef.current) {
          snapRingRef.current.setLatLng(snap)
        } else {
          snapRingRef.current = L.circleMarker(snap, {
            radius: 9, color: '#fbbf24', fillOpacity: 0, weight: 2, interactive: false,
          }).addTo(map)
        }
      } else if (snapRingRef.current) {
        try { map.removeLayer(snapRingRef.current) } catch { /* ok */ }
        snapRingRef.current = null
      }

      // Línea de goma
      const last = pointsRef.current[pointsRef.current.length - 1]
      if (!last) return
      if (rubberRef.current) {
        rubberRef.current.setLatLngs([last, cursor])
      } else {
        rubberRef.current = L.polyline([last, cursor], {
          color: '#fbbf24', weight: 1, dashArray: '4 4', interactive: false, opacity: 0.5,
        }).addTo(map)
      }

      setMeasureLastAngle(segAngle(last, cursor))
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        removeLayers()
        resetPoints()
        useMapaLeafletStore.getState().clearMeasurements()
      }
    }

    map.on('click', onClick)
    map.on('mousemove', onMouseMove)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMouseMove)
      window.removeEventListener('keydown', onKeyDown)
      container.style.cursor = ''
      if (rubberRef.current)  { try { map.removeLayer(rubberRef.current) }  catch { /* ok */ }; rubberRef.current  = null }
      if (snapRingRef.current){ try { map.removeLayer(snapRingRef.current) } catch { /* ok */ }; snapRingRef.current = null }
    }
  }, [map, measureMode, view, addMeasureSegment, setMeasurePointCount, setMeasureCurrentPoints, setMeasureLastAngle, removeLayers, resetPoints])

  return null
}

// ─── Cotas permanentes guardadas ─────────────────────────────────────────────
function CapaCotas({ view }: { view: MapView }) {
  const map          = useMap()
  const allElementos = useMapaLeafletStore((s) => s.elementos)
  const cotas = useMemo(
    () => allElementos.filter((e) => e.tipo === 'cota' && e.mapView === view.name),
    [allElementos, view.name],
  )
  const layersRef    = useRef<Map<string, L.Layer[]>>(new Map())
  const updatedAtRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!map) return
    const current   = layersRef.current
    const updatedAt = updatedAtRef.current

    // Elimina cotas que ya no están en el store
    for (const [id, layers] of current.entries()) {
      if (!cotas.find((c) => c.id === id)) {
        layers.forEach((l) => { try { map.removeLayer(l) } catch { /* ok */ } })
        current.delete(id)
        updatedAt.delete(id)
      }
    }

    for (const cota of cotas) {
      // Re-renderiza si el nombre (u otro campo) cambió
      const lastAt = updatedAt.get(cota.id)
      if (lastAt !== undefined && lastAt >= cota.updatedAt) continue

      // Limpia capas previas antes de re-renderizar
      const oldLayers = current.get(cota.id)
      if (oldLayers) {
        oldLayers.forEach((l) => { try { map.removeLayer(l) } catch { /* ok */ } })
        current.delete(cota.id)
      }

      const meta = cota.meta as { points?: [number, number][]; totalM?: number } | undefined
      if (!meta?.points || meta.points.length < 2) continue

      const latlngs   = meta.points.map((p) => L.latLng(p[0], p[1]))
      const layers: L.Layer[] = []
      const totalM    = (meta.totalM as number | undefined) ?? 0
      const measLabel = `${totalM.toFixed(2)} m`
      // Muestra "Etiqueta · 3.74 m" o solo "3.74 m" si no hay etiqueta
      const displayLabel = cota.nombre && cota.nombre !== measLabel
        ? `${cota.nombre} · ${measLabel}`
        : measLabel

      // Línea cota
      const line = L.polyline(latlngs, {
        color: '#94a3b8', weight: 1.5, dashArray: '6 4', interactive: true, opacity: 0.85,
      })
      line.bindPopup(`<div style="font-size:11px;color:#fbbf24;font-weight:600">${displayLabel}</div>`)
      line.addTo(map)
      layers.push(line)

      // Etiqueta en punto medio
      const midIdx = Math.floor(latlngs.length / 2)
      const midPt  = latlngs[midIdx] ?? latlngs[0]
      if (midPt) {
        const lbl = L.marker(midPt, {
          icon: L.divIcon({
            className: 'cota-label-container',
            html: `<span class="cota-label">${displayLabel}</span>`,
            iconSize:   [130, 20],
            iconAnchor: [65, 20],
          }),
          interactive: false, zIndexOffset: 500,
        }).addTo(map)
        layers.push(lbl)
      }

      // Extremos
      const first = latlngs[0]
      const last  = latlngs[latlngs.length - 1]
      for (const pt of [first, last]) {
        if (!pt) continue
        const cap = L.circleMarker(pt, {
          radius: 4, color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.9, weight: 1, interactive: false,
        }).addTo(map)
        layers.push(cap)
      }

      current.set(cota.id, layers)
      updatedAt.set(cota.id, cota.updatedAt)
    }
  }, [map, cotas])

  return null
}

// ─── Atajos de teclado ───────────────────────────────────────────────────────
function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return  // no interferir con inputs

      const { selectedId, deleteElemento, setSelectedId, toggleEditMode, elementos, addElemento } =
        useMapaLeafletStore.getState()

      if (e.key === 'Escape') {
        setSelectedId(null)
      } else if (e.key === 'Delete' && selectedId) {
        if (confirm('¿Eliminar este elemento?')) deleteElemento(selectedId)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        const el = elementos.find((x) => x.id === selectedId)
        if (el) {
          const offset = (coords: [number, number]): [number, number] => [coords[0], coords[1] + 2]
          const newId = addElemento({
            tipo: el.tipo,
            nombre: el.nombre + ' (copia)',
            categoria: el.categoria,
            estado: el.estado,
            mapView: el.mapView,
            poligono: el.poligono?.map(offset),
            punto: el.punto ? offset(el.punto) : undefined,
            radio: el.radio,
            meta: el.meta,
          })
          setSelectedId(newId)
        }
      } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
        toggleEditMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}

// ─── Fit bounds — refit cuando cambia la vista ───────────────────────────────
function FitDxfBounds({ view }: { view: MapView }) {
  const map = useMap()
  useEffect(() => {
    // Pequeño delay para asegurar que el container ya tiene su tamaño final
    const t = setTimeout(() => {
      map.invalidateSize()
      map.fitBounds(new LatLngBounds(view.bounds), { padding: [40, 40], animate: false })
    }, 50)
    return () => clearTimeout(t)
  }, [map, view])
  return null
}

// ─── Box-select: shift+drag para seleccionar varios elementos ────────────────
function BoxSelect({ view }: { view: MapView }) {
  const map = useMap()
  const editMode = useMapaLeafletStore((s) => s.editMode)

  useEffect(() => {
    if (!map || !editMode) return

    let startLL: L.LatLng | null = null
    let rect: L.Rectangle | null = null

    const onMouseDown = (ev: L.LeafletMouseEvent) => {
      const oe = ev.originalEvent
      if (!oe?.shiftKey) return
      oe.preventDefault()
      map.dragging.disable()
      if (map.boxZoom) map.boxZoom.disable()
      startLL = ev.latlng
    }

    const onMouseMove = (ev: L.LeafletMouseEvent) => {
      if (!startLL) return
      const bounds = L.latLngBounds(startLL, ev.latlng)
      if (!rect) {
        rect = L.rectangle(bounds, {
          color: '#fbbf24', weight: 1.5, dashArray: '4 3', fillColor: '#fbbf24', fillOpacity: 0.08,
          interactive: false,
        }).addTo(map)
      } else {
        rect.setBounds(bounds)
      }
    }

    const onMouseUp = (ev: L.LeafletMouseEvent) => {
      map.dragging.enable()
      if (map.boxZoom) map.boxZoom.enable()
      if (!startLL) return
      const bounds = L.latLngBounds(startLL, ev.latlng)
      if (rect) { map.removeLayer(rect); rect = null }
      startLL = null

      const { elementos, selectedId, multiSelection, setSelectedId } = useMapaLeafletStore.getState()
      const toggle = useMapaLeafletStore.getState().toggleMultiSelect
      const hit: string[] = []
      for (const el of elementos) {
        if (el.mapView !== view.name) continue
        const coords = el.poligono ?? (el.punto ? [el.punto] : [])
        let inside = false
        for (const c of coords) {
          if (bounds.contains(L.latLng(c[0], c[1]))) { inside = true; break }
        }
        if (inside) hit.push(el.id)
      }
      if (hit.length === 0) return
      const existing = new Set<string>([...(selectedId ? [selectedId] : []), ...multiSelection])
      // Si no hay nada seleccionado, primero del hit se vuelve primary
      if (existing.size === 0) {
        setSelectedId(hit[0] ?? null)
        for (let i = 1; i < hit.length; i++) {
          const id = hit[i]
          if (id) toggle(id)
        }
      } else {
        for (const id of hit) {
          if (!existing.has(id)) toggle(id)
        }
      }
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)
    return () => {
      map.off('mousedown', onMouseDown)
      map.off('mousemove', onMouseMove)
      map.off('mouseup', onMouseUp)
      if (rect) { map.removeLayer(rect); rect = null }
      map.dragging.enable()
      if (map.boxZoom) map.boxZoom.enable()
    }
  }, [map, editMode, view.name])

  return null
}

// ─── Componente principal — internal (con view fija) ─────────────────────────
function MapContents({ view }: { view: MapView }) {
  return (
    <>
      <FitDxfBounds view={view} />

      {view.layers.map((cfg) => (
        <CapaDXF key={cfg.name} cfg={cfg} folder={view.folder} />
      ))}

      <GrillaLayer view={view} />
      <CapaElementos view={view} />
      <CapaCotas view={view} />
      <EditorGeoman view={view} />
      <BoxSelect view={view} />
      <MeasureTool view={view} />
      <DrawAreaTooltip />
      <CenterOnSelected />
      <KeyboardShortcuts />

      <ZoomControl position="bottomright" />
    </>
  )
}

// ─── Overlay de medición (fuera del MapContainer) ────────────────────────────
function MeasureOverlay() {
  const measureSegments      = useMapaLeafletStore((s) => s.measureSegments)
  const measurePointCount    = useMapaLeafletStore((s) => s.measurePointCount)
  const measureCurrentPoints = useMapaLeafletStore((s) => s.measureCurrentPoints)
  const measureLastAngle     = useMapaLeafletStore((s) => s.measureLastAngle)
  const currentView          = useMapaLeafletStore((s) => s.currentView)
  const clearMeasurements    = useMapaLeafletStore((s) => s.clearMeasurements)
  const addElemento          = useMapaLeafletStore((s) => s.addElemento)

  const [cotaNombre, setCotaNombre] = useState('')

  const total = measureSegments.reduce((a, d) => a + d, 0)
  const tag   = measureLastAngle !== null ? angleTag(measureLastAngle) : null

  const handleGuardarCota = () => {
    if (measureCurrentPoints.length < 2 || measureSegments.length === 0) return
    addElemento({
      tipo: 'cota',
      nombre: cotaNombre.trim(),   // vacío = solo muestra la medida
      categoria: 'otros',
      estado: 'operativo',
      mapView: currentView,
      meta: {
        points:   measureCurrentPoints,
        segments: measureSegments,
        totalM:   total,
        angle:    measureLastAngle,
      },
    })
    setCotaNombre('')
    clearMeasurements()
  }

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none select-none">
      <div className="bg-gray-900/95 border border-amber-700/60 rounded-xl shadow-2xl px-4 py-3 min-w-60 backdrop-blur-sm">

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
              Herramienta Medir
            </span>
            {tag && (
              <span className={[
                'text-[9px] font-bold px-1.5 py-0.5 rounded',
                tag === 'H'
                  ? 'bg-sky-900/60 text-sky-300 border border-sky-700/50'
                  : tag === 'V'
                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                    : 'bg-gray-800/60 text-gray-300 border border-gray-700/50',
              ].join(' ')}>
                {tag}
              </span>
            )}
          </div>
          <button
            className="pointer-events-auto text-[10px] text-gray-500 hover:text-red-400 transition-colors"
            onClick={clearMeasurements}
          >
            Limpiar · Esc
          </button>
        </div>

        {/* Instrucción o resultados */}
        {measurePointCount === 0 && (
          <p className="text-gray-400 text-xs">Clic en el mapa → primer punto</p>
        )}
        {measurePointCount === 1 && (
          <p className="text-amber-300 text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5 align-middle" />
            Punto fijado — clic para medir
          </p>
        )}

        {measureSegments.length > 0 && (
          <div className="space-y-1 mt-1">
            {measureSegments.map((d, i) => (
              <div key={i} className="flex justify-between items-center text-xs gap-6">
                <span className="text-gray-500">Seg {i + 1}</span>
                <span className="font-mono font-bold text-amber-400">{d.toFixed(2)} m</span>
              </div>
            ))}
            {measureSegments.length > 1 && (
              <div className="flex justify-between items-center text-xs gap-6 border-t border-gray-700/60 pt-1.5 mt-1">
                <span className="text-gray-300 font-semibold">Total</span>
                <span className="font-mono font-bold text-white">{total.toFixed(2)} m</span>
              </div>
            )}
            <div className="flex flex-col gap-1 mt-2 pt-1.5 border-t border-gray-800">
              <input
                type="text"
                value={cotaNombre}
                onChange={(e) => setCotaNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGuardarCota()}
                placeholder="Etiqueta (ej: Ancho paletizado)"
                className="pointer-events-auto w-full text-[10px] bg-gray-800/80 border border-gray-700/60 rounded px-2 py-1 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-600/60"
              />
              <button
                className="pointer-events-auto w-full text-[10px] py-1 rounded-md bg-amber-600/20 border border-amber-600/50 text-amber-400 hover:bg-amber-600/35 transition-colors"
                onClick={handleGuardarCota}
              >
                Guardar cota
              </button>
            </div>
            <p className="text-[10px] text-gray-600 pt-1">
              Seguí haciendo clic para sumar segmentos
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Componente principal — wrapper que reacciona al cambio de vista ─────────
export function PlantaLeafletEditable() {
  const currentView   = useMapaLeafletStore((s) => s.currentView)
  const measureMode   = useMapaLeafletStore((s) => s.measureMode)
  const grillaVisible = useMapaLeafletStore((s) => s.grillaVisible)
  const view = MAP_VIEWS[currentView]

  return (
    <div className="relative w-full h-full">
      {/* key={currentView} fuerza re-mount al cambiar vista (CRS, bounds, etc) */}
      <MapContainer
        key={currentView}
        center={view.center as L.LatLngTuple}
        zoom={0}
        minZoom={-20}
        maxZoom={20}
        zoomSnap={0.25}
        zoomControl={false}
        crs={L.CRS.Simple}
        className="w-full h-full"
        style={{ background: '#0a0e14' }}
      >
        <MapContents view={view} />
      </MapContainer>

      {measureMode   && <MeasureOverlay />}
      {grillaVisible && <GrillaOverlay view={view} />}
    </div>
  )
}
