import { useEffect, useRef, useState } from 'react'
import { logger } from '@/lib/logger'
import type { Zone, Incident } from '@/types'

interface InteractiveSVGMapProps {
  svgUrl: string
  zones: Zone[]
  incidents: Incident[]
  scale: number
  position: { x: number; y: number }
  onZoneClick?: (zoneId: string) => void
  onIncidentClick?: (incident: Incident) => void
}

/**
 * Componente para renderizar mapas SVG interactivos
 * 
 * Funcionalidades:
 * - Detecta elementos SVG con IDs (zonas, máquinas)
 * - Vincula elementos con datos de Firestore
 * - Cambia colores dinámicamente según estado
 * - Inyecta marcadores de incidencias en coordenadas absolutas
 * - Zoom infinito sin pérdida de calidad
 */
export function InteractiveSVGMap({
  svgUrl,
  zones,
  incidents,
  scale,
  position,
  onZoneClick,
  onIncidentClick,
}: InteractiveSVGMapProps) {
  const objectRef = useRef<HTMLObjectElement>(null)
  const [svgDoc, setSvgDoc] = useState<Document | null>(null)
  const [svgElements, setSvgElements] = useState<Map<string, SVGElement>>(new Map())

  // Cargar documento SVG
  useEffect(() => {
    const obj = objectRef.current
    if (!obj) return

    const handleLoad = () => {
      try {
        const doc = obj.contentDocument
        if (!doc) {
          logger.warn('SVG content document not available')
          return
        }

        setSvgDoc(doc)
        
        // Parsear elementos con IDs
        const elements = new Map<string, SVGElement>()
        const allElements = doc.querySelectorAll('[id]')
        
        allElements.forEach((el) => {
          const id = el.getAttribute('id')
          if (id && el instanceof SVGElement) {
            elements.set(id, el)
            logger.debug('Found SVG element', { id, tagName: el.tagName })
          }
        })

        setSvgElements(elements)
        logger.info('SVG loaded', { 
          elementCount: elements.size,
          ids: Array.from(elements.keys()).slice(0, 10) 
        })
      } catch (error) {
        logger.error('Error loading SVG', error instanceof Error ? error : new Error(String(error)))
      }
    }

    obj.addEventListener('load', handleLoad)
    
    // Si ya está cargado
    if (obj.contentDocument) {
      handleLoad()
    }

    return () => obj.removeEventListener('load', handleLoad)
  }, [svgUrl])

  // Vincular zonas con elementos SVG
  useEffect(() => {
    if (!svgDoc || svgElements.size === 0) return

    zones.forEach((zone) => {
      // Buscar elemento SVG por varios patrones de ID
      const possibleIds = [
        zone.codigo,
        zone.codigo?.toLowerCase(),
        zone.codigo?.toUpperCase(),
        `zona-${zone.codigo}`,
        `zone-${zone.codigo}`,
        zone.id,
      ].filter(Boolean)

      for (const id of possibleIds) {
        const element = svgElements.get(id!)
        if (element) {
          // Aplicar estilo según incidencias
          const zoneIncidents = incidents.filter(i => i.zoneId === zone.id)
          const hasCritical = zoneIncidents.some(i => i.prioridad === 'critica')
          const hasHigh = zoneIncidents.some(i => i.prioridad === 'alta')

          let fillColor = zone.color || '#2196f3'
          let opacity = '0.2'

          if (hasCritical) {
            fillColor = '#ef4444' // red-500
            opacity = '0.3'
          } else if (hasHigh) {
            fillColor = '#f59e0b' // amber-500
            opacity = '0.25'
          }

          element.style.fill = fillColor
          element.style.fillOpacity = opacity
          element.style.stroke = fillColor
          element.style.strokeWidth = '2'
          element.style.cursor = 'pointer'
          element.style.transition = 'all 0.2s'

          // Event listeners
          element.addEventListener('mouseenter', () => {
            element.style.fillOpacity = '0.4'
            element.style.strokeWidth = '3'
          })

          element.addEventListener('mouseleave', () => {
            element.style.fillOpacity = opacity
            element.style.strokeWidth = '2'
          })

          element.addEventListener('click', (e) => {
            e.stopPropagation()
            onZoneClick?.(zone.id)
            logger.info('Zone clicked', { zoneId: zone.id, zoneName: zone.nombre })
          })

          // Agregar tooltip
          const title = element.querySelector('title') || document.createElementNS('http://www.w3.org/2000/svg', 'title')
          title.textContent = `${zone.nombre} (${zoneIncidents.length} incidencias)`
          if (!element.querySelector('title')) {
            element.appendChild(title)
          }

          logger.debug('Zone linked to SVG element', { zoneId: zone.id, svgId: id })
          break
        }
      }
    })
  }, [svgDoc, svgElements, zones, incidents, onZoneClick])

  // Inyectar marcadores de incidencias
  useEffect(() => {
    if (!svgDoc || !svgDoc.documentElement) return

    // Limpiar marcadores previos
    const existingMarkers = svgDoc.querySelectorAll('.incident-marker')
    existingMarkers.forEach(m => m.remove())

    // Crear grupo para marcadores
    let markersGroup = svgDoc.getElementById('incident-markers') as SVGGElement | null
    if (!markersGroup) {
      markersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      markersGroup.setAttribute('id', 'incident-markers')
      svgDoc.documentElement.appendChild(markersGroup)
    }

    // Agregar marcador por cada incidencia
    incidents.forEach((incident) => {
      const zone = zones.find(z => z.id === incident.zoneId)
      if (!zone?.bounds) return

      // Calcular posición dentro de la zona (en coordenadas SVG)
      const centerX = (zone.bounds.minX + zone.bounds.maxX) / 2
      const centerY = (zone.bounds.minY + zone.bounds.maxY) / 2

      // Distribuir incidencias en círculo
      const zoneIncidents = incidents.filter(i => i.zoneId === incident.zoneId)
      const idx = zoneIncidents.findIndex(i => i.id === incident.id)
      const angle = (idx / zoneIncidents.length) * 2 * Math.PI
      const radius = Math.min(
        (zone.bounds.maxX - zone.bounds.minX) * 0.2,
        (zone.bounds.maxY - zone.bounds.minY) * 0.2
      )

      // Convertir coordenadas normalizadas (0-1) a coordenadas SVG
      const svgRect = svgDoc.documentElement.getBoundingClientRect()
      const viewBox = svgDoc.documentElement.getAttribute('viewBox')?.split(' ').map(Number)
      const svgWidth = viewBox?.[2] || svgRect.width
      const svgHeight = viewBox?.[3] || svgRect.height

      const x = (centerX + Math.cos(angle) * radius) * svgWidth
      const y = (centerY + Math.sin(angle) * radius) * svgHeight

      // Color según prioridad
      const colors = {
        critica: '#ef4444',
        alta: '#f59e0b',
        media: '#3b82f6',
        baja: '#6b7280',
      }

      // Crear marcador
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      marker.classList.add('incident-marker')
      marker.setAttribute('transform', `translate(${x}, ${y})`)
      marker.style.cursor = 'pointer'

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      circle.setAttribute('r', '8')
      circle.setAttribute('fill', colors[incident.prioridad])
      circle.setAttribute('stroke', '#ffffff')
      circle.setAttribute('stroke-width', '2')

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title')
      title.textContent = incident.titulo

      marker.appendChild(circle)
      marker.appendChild(title)

      // Animación pulse para críticas
      if (incident.prioridad === 'critica') {
        const animate = document.createElementNS('http://www.w3.org/2000/svg', 'animate')
        animate.setAttribute('attributeName', 'r')
        animate.setAttribute('values', '8;12;8')
        animate.setAttribute('dur', '2s')
        animate.setAttribute('repeatCount', 'indefinite')
        circle.appendChild(animate)
      }

      // Click handler
      marker.addEventListener('click', (e) => {
        e.stopPropagation()
        onIncidentClick?.(incident)
        logger.info('Incident marker clicked', { incidentId: incident.id })
      })

      markersGroup!.appendChild(marker)
    })

    logger.info('Incident markers injected', { count: incidents.length })
  }, [svgDoc, zones, incidents, onIncidentClick])

  return (
    <div
      className="absolute inset-0"
      style={{
        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        transformOrigin: 'top left',
      }}
    >
      <object
        ref={objectRef}
        data={svgUrl}
        type="image/svg+xml"
        className="w-full h-full pointer-events-auto"
        style={{
          userSelect: 'none',
        }}
      >
        <img src={svgUrl} alt="Plano de planta SVG" />
      </object>
    </div>
  )
}
