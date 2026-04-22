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

import { useEffect, useRef, useState } from 'react'
import { MapContainer, GeoJSON, useMap, ZoomControl } from 'react-leaflet'
import L, { LatLngBounds, Map as LMap, FeatureGroup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import './geoman-dark.css'
import { DXF_LAYERS, DXF_BOUNDS, DXF_CENTER, type DxfLayerConfig } from '@/data/dxfLayers'
import { useMapaLeafletStore, type ElementoMapa, type PolygonCoords } from '@/store/useMapaLeafletStore'

// ─── Helpers de geometría ────────────────────────────────────────────────────
const SNAP_GRID = 0.5  // metros — snap mientras se dibuja

function snap(v: number): number {
  return Math.round(v / SNAP_GRID) * SNAP_GRID
}

/** Área en m² de un polígono (Shoelace formula). Coords [Y, X] */
function polygonArea(latlngs: L.LatLng[]): number {
  let area = 0
  for (let i = 0; i < latlngs.length; i++) {
    const j = (i + 1) % latlngs.length
    area += latlngs[i].lng * latlngs[j].lat
    area -= latlngs[j].lng * latlngs[i].lat
  }
  return Math.abs(area / 2)
}

/** Centro de un polígono (promedio simple de vértices) */
function polygonCenter(coords: PolygonCoords): L.LatLng {
  const lat = coords.reduce((a, c) => a + c[0], 0) / coords.length
  const lng = coords.reduce((a, c) => a + c[1], 0) / coords.length
  return L.latLng(lat, lng)
}

// ─── Carga perezosa de cada GeoJSON DXF ──────────────────────────────────────
function CapaDXF({ cfg }: { cfg: DxfLayerConfig }) {
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null)
  const visible = useMapaLeafletStore((s) => s.capasVisibles[cfg.name] ?? cfg.defaultVisible)

  useEffect(() => {
    let cancel = false
    fetch(`${import.meta.env.BASE_URL}maps/dxf/${cfg.name}.geojson`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancel) setData(j) })
      .catch(() => {})
    return () => { cancel = true }
  }, [cfg.name])

  if (!data || !visible) return null

  return (
    <GeoJSON
      data={data as GeoJSON.GeoJsonObject}
      coordsToLatLng={(c) => L.latLng(c[1], c[0])}
      style={{
        color: cfg.color,
        weight: cfg.weight,
        opacity: cfg.opacity,
        fillColor: cfg.color,
        fillOpacity: 0.06,
      }}
      pointToLayer={(_f, latlng) =>
        L.circleMarker(latlng, { radius: 2.5, color: cfg.color, fillOpacity: 0.7, weight: 1 })
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
function EditorGeoman() {
  const map = useMap()
  const editMode = useMapaLeafletStore((s) => s.editMode)
  const featureGroupRef = useRef<FeatureGroup | null>(null)

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
      drawMarker: true,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: true,
      drawText: false,
      editMode: true,
      dragMode: true,
      cutPolygon: false,
      removalMode: true,
      rotateMode: true,
    })

    pmMap.pm.setPathOptions({
      color: '#22c55e',
      fillColor: '#22c55e',
      fillOpacity: 0.18,
      weight: 2,
    })

    // Snap a grilla mientras dibuja
    pmMap.pm.setGlobalOptions({
      snappable: true,
      snapDistance: 12,
      tooltips: true,
      allowSelfIntersection: false,
    })

    const onCreate = (e: any) => {
      const layer = e.layer
      const shape = e.shape
      const { addElemento, setSelectedId } = useMapaLeafletStore.getState()

      let elemento: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'> | null = null

      if (shape === 'Polygon' || shape === 'Rectangle') {
        const latlngs: L.LatLng[] = (layer.getLatLngs()[0] as L.LatLng[]) ?? []
        // Snap vértices a grilla
        const snapped: PolygonCoords = latlngs.map((p) => [snap(p.lat), snap(p.lng)])
        layer.setLatLngs([snapped.map((p) => L.latLng(p[0], p[1]))])
        const area = polygonArea(latlngs)
        elemento = {
          tipo: 'zona',
          nombre: '', // vacío → fuerza al usuario a nombrar
          categoria: 'otros',
          estado: 'operativo',
          poligono: snapped,
          meta: { area_m2: Number(area.toFixed(2)) },
        }
      } else if (shape === 'Circle') {
        const c = layer.getLatLng() as L.LatLng
        const r = layer.getRadius() as number
        const cs: [number, number] = [snap(c.lat), snap(c.lng)]
        layer.setLatLng(L.latLng(cs[0], cs[1]))
        elemento = {
          tipo: 'forma',
          nombre: '',
          categoria: 'otros',
          estado: 'operativo',
          punto: cs,
          radio: Math.round(r * 10) / 10,
        }
      } else if (shape === 'Marker') {
        const c = layer.getLatLng() as L.LatLng
        const cs: [number, number] = [snap(c.lat), snap(c.lng)]
        layer.setLatLng(L.latLng(cs[0], cs[1]))
        elemento = {
          tipo: 'punto',
          nombre: '',
          categoria: 'otros',
          estado: 'operativo',
          punto: cs,
        }
      }

      if (elemento) {
        const id = addElemento(elemento)
        ;(layer.options as any).elementoId = id
        setSelectedId(id)
        // Foco al campo nombre del panel después de un tick
        setTimeout(() => {
          const input = document.querySelector<HTMLInputElement>('input[data-name-input="true"]')
          input?.focus()
          input?.select()
        }, 80)
      }
      if (featureGroupRef.current) featureGroupRef.current.addLayer(layer)
    }

    const onEdit = (e: any) => {
      const layer = e.layer
      const id = layer.options?.elementoId
      if (!id) return
      const { updateElemento } = useMapaLeafletStore.getState()
      if (layer.getLatLngs) {
        const latlngs: L.LatLng[] = (layer.getLatLngs()[0] as L.LatLng[]) ?? []
        const poligono: PolygonCoords = latlngs.map((p) => [snap(p.lat), snap(p.lng)])
        updateElemento(id, {
          poligono,
          meta: { area_m2: Number(polygonArea(latlngs).toFixed(2)) },
        })
      } else if (layer.getLatLng) {
        const c = layer.getLatLng() as L.LatLng
        const patch: Partial<ElementoMapa> = { punto: [snap(c.lat), snap(c.lng)] }
        if (layer.getRadius) patch.radio = Math.round(layer.getRadius() * 10) / 10
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
  }, [map, editMode])

  return null
}

// ─── Renderiza elementos del store + selección/hover ─────────────────────────
function CapaElementos() {
  const map = useMap()
  const elementos = useMapaLeafletStore((s) => s.elementos)
  const selectedId = useMapaLeafletStore((s) => s.selectedId)
  const setSelectedId = useMapaLeafletStore((s) => s.setSelectedId)
  const layersRef = useRef<Map<string, L.Layer>>(new Map())

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
      const isSelected = el.id === selectedId
      const color = ESTADO_COLOR[el.estado] ?? '#888'

      const baseStyle = {
        color, weight: isSelected ? 3 : 2,
        fillColor: color, fillOpacity: isSelected ? 0.35 : 0.18,
        className: isSelected ? 'editable-element editable-element-selected' : 'editable-element',
      }

      let layer = current.get(el.id) as any
      if (!layer) {
        // Crear nueva capa
        if (el.poligono && el.poligono.length >= 3) {
          layer = L.polygon(el.poligono as L.LatLngTuple[], baseStyle)
        } else if (el.punto && el.radio) {
          layer = L.circle(el.punto as L.LatLngTuple, { ...baseStyle, radius: el.radio })
        } else if (el.punto) {
          layer = L.circleMarker(el.punto as L.LatLngTuple, { ...baseStyle, radius: 7 })
        }
        if (layer) {
          ;(layer.options as any).elementoId = el.id
          layer.on('click', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev)
            setSelectedId(el.id)
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
  }, [map, elementos, selectedId, setSelectedId])

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

// ─── Atajos de teclado ───────────────────────────────────────────────────────
function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return  // no interferir con inputs

      const { selectedId, deleteElemento, setSelectedId, editMode, toggleEditMode, elementos, addElemento } =
        useMapaLeafletStore.getState()

      if (e.key === 'Escape') {
        setSelectedId(null)
      } else if (e.key === 'Delete' && selectedId) {
        if (confirm('¿Eliminar este elemento?')) deleteElemento(selectedId)
      } else if (e.ctrlKey && e.key.toLowerCase() === 'd' && selectedId) {
        e.preventDefault()
        const el = elementos.find((x) => x.id === selectedId)
        if (el) {
          // Duplicar con offset 2m al este
          const offset = (coords: [number, number]): [number, number] => [coords[0], coords[1] + 2]
          const newId = addElemento({
            tipo: el.tipo,
            nombre: el.nombre + ' (copia)',
            categoria: el.categoria,
            estado: el.estado,
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

// ─── Fit bounds inicial ──────────────────────────────────────────────────────
function FitDxfBounds() {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(new LatLngBounds(DXF_BOUNDS), { padding: [20, 20] })
  }, [map])
  return null
}

// ─── Componente principal ────────────────────────────────────────────────────
export function PlantaLeafletEditable() {
  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={DXF_CENTER as L.LatLngTuple}
        zoom={3}
        minZoom={1}
        maxZoom={8}
        zoomControl={false}
        crs={L.CRS.Simple}
        className="w-full h-full"
        style={{ background: '#0a0e14' }}
      >
        <FitDxfBounds />

        {DXF_LAYERS.map((cfg) => (
          <CapaDXF key={cfg.name} cfg={cfg} />
        ))}

        <CapaElementos />
        <EditorGeoman />
        <DrawAreaTooltip />
        <CenterOnSelected />
        <KeyboardShortcuts />

        <ZoomControl position="bottomright" />
      </MapContainer>
    </div>
  )
}
