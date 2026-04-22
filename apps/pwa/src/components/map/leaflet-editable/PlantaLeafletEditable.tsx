/**
 * PlantaLeafletEditable
 * ─────────────────────
 * Mapa interactivo del recinto Antarfood con:
 *   • Capas estructurales reales del DXF del arquitecto (lectura, estilizables)
 *   • Capa de zonas/equipos editable (polígonos, círculos, puntos) — Geoman
 *   • Persistencia local (Zustand+localStorage) lista para mover a Firestore
 *
 * Coordenadas: CRS.Simple, metros del DXF. lat = Y_dxf, lng = X_dxf.
 */

import { useEffect, useRef, useState } from 'react'
import { MapContainer, GeoJSON, useMap, ZoomControl } from 'react-leaflet'
import L, { LatLngBounds, Map as LMap, FeatureGroup } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { DXF_LAYERS, DXF_BOUNDS, DXF_CENTER, type DxfLayerConfig } from '@/data/dxfLayers'
import { useMapaLeafletStore, type ElementoMapa, type PolygonCoords } from '@/store/useMapaLeafletStore'

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
      coordsToLatLng={(c) => L.latLng(c[1], c[0])}    // [X,Y] → latLng(Y, X)
      style={{
        color: cfg.color,
        weight: cfg.weight,
        opacity: cfg.opacity,
        fillColor: cfg.color,
        fillOpacity: 0.08,
      }}
      pointToLayer={(_f, latlng) =>
        L.circleMarker(latlng, { radius: 2.5, color: cfg.color, fillOpacity: 0.7, weight: 1 })
      }
      interactive={false}
    />
  )
}

// ─── Editor Geoman (solo en edit mode) ────────────────────────────────────────
function EditorGeoman() {
  const map = useMap()
  const editMode = useMapaLeafletStore((s) => s.editMode)
  const { addElemento, updateElemento, deleteElemento } = useMapaLeafletStore.getState()
  const featureGroupRef = useRef<FeatureGroup | null>(null)

  useEffect(() => {
    if (!map) return

    // Crear el grupo de features editables si no existe
    if (!featureGroupRef.current) {
      featureGroupRef.current = L.featureGroup().addTo(map)
    }

    // Configurar Geoman
    const pmMap = map as LMap & { pm: any }
    if (!pmMap.pm) return

    pmMap.pm.setLang('es')

    if (editMode) {
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
        fillOpacity: 0.2,
        weight: 2,
      })

      // Listener: nuevo elemento creado
      const onCreate = (e: any) => {
        const layer = e.layer
        const shape = e.shape // 'Polygon', 'Rectangle', 'Circle', 'Marker'
        let elemento: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'> | null = null

        if (shape === 'Polygon' || shape === 'Rectangle') {
          const latlngs: L.LatLng[] = (layer.getLatLngs()[0] as L.LatLng[]) ?? []
          const poligono: PolygonCoords = latlngs.map((p) => [p.lat, p.lng])
          elemento = {
            tipo: 'zona',
            nombre: 'Nueva zona',
            categoria: 'otros',
            estado: 'operativo',
            poligono,
          }
        } else if (shape === 'Circle') {
          const c = layer.getLatLng() as L.LatLng
          elemento = {
            tipo: 'forma',
            nombre: 'Círculo',
            categoria: 'otros',
            estado: 'operativo',
            punto: [c.lat, c.lng],
            radio: layer.getRadius(),
          }
        } else if (shape === 'Marker') {
          const c = layer.getLatLng() as L.LatLng
          elemento = {
            tipo: 'punto',
            nombre: 'Punto',
            categoria: 'otros',
            estado: 'operativo',
            punto: [c.lat, c.lng],
          }
        }

        if (elemento) {
          const id = addElemento(elemento)
          layer.options.elementoId = id
          ;(layer as any).bindPopup(`<b>${elemento.nombre}</b><br><small>${id}</small>`)
        }

        // Geoman dibuja en el mapa, pero queremos que las capas vivan en featureGroup
        if (featureGroupRef.current) featureGroupRef.current.addLayer(layer)
      }

      const onEdit = (e: any) => {
        const layer = e.layer
        const id = layer.options?.elementoId
        if (!id) return
        if (layer.getLatLngs) {
          const latlngs: L.LatLng[] = (layer.getLatLngs()[0] as L.LatLng[]) ?? []
          updateElemento(id, { poligono: latlngs.map((p) => [p.lat, p.lng]) })
        } else if (layer.getLatLng) {
          const c = layer.getLatLng() as L.LatLng
          const patch: any = { punto: [c.lat, c.lng] as [number, number] }
          if (layer.getRadius) patch.radio = layer.getRadius()
          updateElemento(id, patch)
        }
      }

      const onRemove = (e: any) => {
        const id = e.layer.options?.elementoId
        if (id) deleteElemento(id)
      }

      map.on('pm:create', onCreate)
      map.on('pm:edit', onEdit)
      map.on('pm:remove', onRemove)

      return () => {
        map.off('pm:create', onCreate)
        map.off('pm:edit', onEdit)
        map.off('pm:remove', onRemove)
        pmMap.pm.removeControls()
      }
    } else {
      pmMap.pm.removeControls()
    }
  }, [map, editMode, addElemento, updateElemento, deleteElemento])

  return null
}

// ─── Renderiza elementos editables del store ──────────────────────────────────
function CapaElementos() {
  const map = useMap()
  const elementos = useMapaLeafletStore((s) => s.elementos)
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
      if (current.has(el.id)) continue   // ya renderizado (Geoman lo maneja en edit)
      const color = ESTADO_COLOR[el.estado] ?? '#888'

      let layer: L.Layer | null = null
      if (el.poligono && el.poligono.length >= 3) {
        layer = L.polygon(el.poligono as L.LatLngTuple[], {
          color, weight: 2, fillColor: color, fillOpacity: 0.18,
        })
      } else if (el.punto && el.radio) {
        layer = L.circle(el.punto as L.LatLngTuple, {
          radius: el.radio, color, fillColor: color, fillOpacity: 0.2, weight: 2,
        })
      } else if (el.punto) {
        layer = L.circleMarker(el.punto as L.LatLngTuple, {
          radius: 6, color, fillColor: color, fillOpacity: 0.7, weight: 2,
        })
      }

      if (layer) {
        ;(layer.options as any).elementoId = el.id
        layer.bindPopup(`<b>${el.nombre}</b><br>${el.categoria} · ${el.estado}`)
        layer.on('click', () => setSelectedId(el.id))
        layer.addTo(map)
        current.set(el.id, layer)
      }
    }
  }, [map, elementos, setSelectedId])

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

        {/* Capas DXF (lectura) */}
        {DXF_LAYERS.map((cfg) => (
          <CapaDXF key={cfg.name} cfg={cfg} />
        ))}

        {/* Elementos editables del store */}
        <CapaElementos />

        {/* Editor Geoman (activo en editMode) */}
        <EditorGeoman />

        <ZoomControl position="bottomright" />
      </MapContainer>
    </div>
  )
}
