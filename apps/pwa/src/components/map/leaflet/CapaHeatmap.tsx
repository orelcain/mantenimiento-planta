/** Capa de heatmap gradual usando canvas nativo de Leaflet */

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { IncidenciaMapa } from './types'

const PESO_SEVERIDAD = { baja: 0.25, media: 0.5, alta: 0.75, critica: 1.0 }

interface Props {
  incidencias: IncidenciaMapa[]
  radio?: number
  opacidad?: number
}

export function CapaHeatmap({ incidencias, radio = 35, opacidad = 0.7 }: Props) {
  const map = useMap()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<L.Layer | null>(null)

  useEffect(() => {
    if (incidencias.length === 0) return

    // Crear canvas overlay personalizado
    const CanvasLayer = L.Layer.extend({
      onAdd(map: L.Map) {
        const canvas = document.createElement('canvas')
        canvas.style.position = 'absolute'
        canvas.style.top = '0'
        canvas.style.left = '0'
        canvas.style.pointerEvents = 'none'
        canvas.style.zIndex = '400'
        this._canvas = canvas
        this._map = map
        map.getPanes().overlayPane.appendChild(canvas)
        map.on('moveend zoomend resize', this._redraw, this)
        this._redraw()
        return this
      },
      onRemove(map: L.Map) {
        map.getPanes().overlayPane.removeChild(this._canvas)
        map.off('moveend zoomend resize', this._redraw, this)
      },
      _redraw() {
        const map = this._map
        const canvas: HTMLCanvasElement = this._canvas
        const size = map.getSize()
        canvas.width = size.x
        canvas.height = size.y

        const topLeft = map.containerPointToLayerPoint([0, 0])
        L.DomUtil.setPosition(canvas, topLeft)

        const ctx = canvas.getContext('2d')!
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // Dibujar gradientes radiales por incidencia
        incidencias
          .filter(i => i.estado !== 'resuelta')
          .forEach(inc => {
            const point = map.latLngToContainerPoint([inc.lat, inc.lng])
            const peso = PESO_SEVERIDAD[inc.severidad]
            const r = radio * (0.8 + peso * 0.4)

            const grad = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, r)
            grad.addColorStop(0,   `rgba(239, 68, 68, ${opacidad * peso})`)
            grad.addColorStop(0.4, `rgba(249, 115, 22, ${opacidad * peso * 0.7})`)
            grad.addColorStop(0.8, `rgba(234, 179, 8, ${opacidad * peso * 0.3})`)
            grad.addColorStop(1,   'rgba(0,0,0,0)')

            ctx.beginPath()
            ctx.arc(point.x, point.y, r, 0, Math.PI * 2)
            ctx.fillStyle = grad
            ctx.fill()
          })
      },
    })

    const layer = new (CanvasLayer as any)()
    layer.addTo(map)
    overlayRef.current = layer
    canvasRef.current = (layer as any)._canvas

    return () => {
      if (overlayRef.current) {
        overlayRef.current.remove()
        overlayRef.current = null
      }
    }
  }, [map, incidencias, radio, opacidad])

  return null
}
