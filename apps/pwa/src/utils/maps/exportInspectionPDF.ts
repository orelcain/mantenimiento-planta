/**
 * Exportación PDF de inspecciones con mapas
 * 
 * Genera un PDF profesional que incluye:
 * - Mapa con marcadores numerados
 * - Tabla de puntos de inspección
 * - Estadísticas de la inspección
 * - Fotos asociadas (opcional)
 */

import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate } from '@/lib/utils'
import type { 
  Inspection, 
  InspectionItem, 
  MapVersion 
} from '@/types/maps'

export type PDFLayout = 'portrait' | 'landscape-full'

interface ExportInspectionPDFOptions {
  inspection: Inspection
  items: InspectionItem[]
  mapVersion: MapVersion
  includePhotos?: boolean
  includeStats?: boolean
  layout?: PDFLayout
}

/**
 * Convierte una imagen URL a base64
 */
async function urlToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No canvas context'))
        return
      }
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Dibuja un marcador numerado en el canvas
 */
function drawMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  number: number,
  color: string = '#ef4444'
) {
  const radius = 16
  
  // Círculo principal
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = color
  ctx.fill()
  
  // Borde blanco
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.stroke()
  
  // Número
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 14px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(number.toString(), x, y)
}

/**
 * Genera imagen del mapa con marcadores superpuestos
 */
async function generateMapWithMarkers(
  mapImageUrl: string,
  items: InspectionItem[],
  maxWidth: number = 800
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      // Calcular dimensiones manteniendo aspecto
      let width = img.width
      let height = img.height
      
      if (width > maxWidth) {
        const ratio = maxWidth / width
        width = maxWidth
        height = height * ratio
      }
      
      // Crear canvas
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        reject(new Error('No canvas context'))
        return
      }
      
      // Dibujar mapa base
      ctx.drawImage(img, 0, 0, width, height)
      
      // Dibujar marcadores
      for (const item of items) {
        const x = item.position.x * width
        const y = item.position.y * height
        drawMarker(ctx, x, y, item.order)
      }
      
      resolve(canvas.toDataURL('image/jpeg', 0.9))
    }
    
    img.onerror = reject
    img.src = mapImageUrl
  })
}

/**
 * Exporta una inspección a PDF con mapa y tabla de puntos
 */
export async function exportInspectionToPDF(
  options: ExportInspectionPDFOptions
): Promise<void> {
  const { 
    inspection, 
    items, 
    mapVersion,
    includePhotos = false,
    includeStats = true,
    layout = 'portrait'
  } = options

  // Si es landscape-full, usar función especializada
  if (layout === 'landscape-full') {
    return exportInspectionLandscapePDF(options)
  }

  // Crear documento portrait estándar
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - (margin * 2)
  let yPosition = margin

  // ===== ENCABEZADO =====
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Informe de Inspección', pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 10

  // Nombre de la inspección
  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.text(inspection.nombre, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 8

  // Línea decorativa
  doc.setDrawColor(41, 128, 185)
  doc.setLineWidth(0.5)
  doc.line(margin, yPosition, pageWidth - margin, yPosition)
  yPosition += 10

  // ===== INFORMACIÓN GENERAL =====
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text('Información General', margin, yPosition)
  yPosition += 6

  doc.setFont('helvetica', 'normal')
  const infoItems = [
    `Ubicación: ${inspection.locationName}`,
    `Fecha: ${formatDate(inspection.createdAt)}`,
    `Estado: ${getStatusLabel(inspection.status)}`,
    `Total de puntos: ${items.length}`,
  ]
  
  if (inspection.createdByName) {
    infoItems.push(`Realizada por: ${inspection.createdByName}`)
  }
  
  if (inspection.motivoInspeccion) {
    infoItems.push(`Motivo: ${inspection.motivoInspeccion}`)
  }

  for (const info of infoItems) {
    doc.text(info, margin, yPosition)
    yPosition += 5
  }
  yPosition += 5

  // ===== ESTADÍSTICAS (si se solicitan) =====
  if (includeStats && items.length > 0) {
    // Contar por prioridad
    const countByPriority: Record<string, number> = {
      critica: 0,
      alta: 0,
      media: 0,
      baja: 0,
      sin_prioridad: 0
    }
    
    for (const item of items) {
      const key = item.prioridad || 'sin_prioridad'
      countByPriority[key] = (countByPriority[key] || 0) + 1
    }

    doc.setFont('helvetica', 'bold')
    doc.text('Resumen por Prioridad', margin, yPosition)
    yPosition += 6

    doc.setFont('helvetica', 'normal')
    const priorityLabels: Record<string, string> = {
      critica: 'Crítica',
      alta: 'Alta',
      media: 'Media',
      baja: 'Baja',
      sin_prioridad: 'Sin definir'
    }

    let xPos = margin
    for (const [key, count] of Object.entries(countByPriority)) {
      if (count > 0) {
        const label = `${priorityLabels[key]}: ${count}`
        doc.text(label, xPos, yPosition)
        xPos += 35
      }
    }
    yPosition += 10
  }

  // ===== MAPA CON MARCADORES =====
  doc.setFont('helvetica', 'bold')
  doc.text('Mapa de Puntos de Inspección', margin, yPosition)
  yPosition += 6

  try {
    // Generar imagen del mapa con marcadores
    const mapWithMarkers = await generateMapWithMarkers(
      mapVersion.imageUrl,
      items,
      800
    )
    
    // Calcular dimensiones del mapa en el PDF
    const mapMaxWidth = contentWidth
    const mapMaxHeight = 100 // mm
    
    // Obtener dimensiones reales
    const tempImg = new Image()
    await new Promise<void>((resolve, reject) => {
      tempImg.onload = () => resolve()
      tempImg.onerror = reject
      tempImg.src = mapWithMarkers
    })
    
    const aspectRatio = tempImg.width / tempImg.height
    let mapWidth = mapMaxWidth
    let mapHeight = mapWidth / aspectRatio
    
    if (mapHeight > mapMaxHeight) {
      mapHeight = mapMaxHeight
      mapWidth = mapHeight * aspectRatio
    }
    
    // Centrar mapa
    const mapX = margin + (contentWidth - mapWidth) / 2
    
    // Verificar si hay espacio, si no, nueva página
    if (yPosition + mapHeight > pageHeight - 40) {
      doc.addPage()
      yPosition = margin
    }
    
    doc.addImage(mapWithMarkers, 'JPEG', mapX, yPosition, mapWidth, mapHeight)
    yPosition += mapHeight + 10
    
  } catch (error) {
    console.error('Error generando mapa:', error)
    doc.setFont('helvetica', 'italic')
    doc.text('No se pudo cargar el mapa', margin, yPosition)
    yPosition += 10
  }

  // ===== TABLA DE PUNTOS =====
  // Nueva página para la tabla si no hay espacio
  if (yPosition > pageHeight - 60) {
    doc.addPage()
    yPosition = margin
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Detalle de Puntos de Inspección', margin, yPosition)
  yPosition += 6

  // Preparar datos de la tabla
  const tableData = items.map(item => [
    item.order.toString(),
    item.title,
    item.description || '-',
    getPriorityLabel(item.prioridad),
    item.fotos.length > 0 ? `${item.fotos.length} foto(s)` : '-'
  ])

  autoTable(doc, {
    head: [['#', 'Título', 'Descripción', 'Prioridad', 'Fotos']],
    body: tableData,
    startY: yPosition,
    theme: 'striped',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 70 },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
    },
    margin: { left: margin, right: margin },
  })

  // ===== FOTOS (si se solicitan) =====
  if (includePhotos) {
    const itemsWithPhotos = items.filter(item => item.fotos.length > 0)
    
    if (itemsWithPhotos.length > 0) {
      doc.addPage()
      yPosition = margin
      
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Evidencia Fotográfica', pageWidth / 2, yPosition, { align: 'center' })
      yPosition += 10

      for (const item of itemsWithPhotos) {
        // Título del punto
        if (yPosition > pageHeight - 80) {
          doc.addPage()
          yPosition = margin
        }

        doc.setFontSize(11)
        doc.setFont('helvetica', 'bold')
        doc.text(`Punto ${item.order}: ${item.title}`, margin, yPosition)
        yPosition += 6

        // Mostrar hasta 2 fotos por fila
        const photoWidth = (contentWidth - 10) / 2
        const photoHeight = 50
        let xPos = margin

        for (let i = 0; i < Math.min(item.fotos.length, 4); i++) {
          try {
            const photoBase64 = await urlToBase64(item.fotos[i] || '')
            
            if (yPosition + photoHeight > pageHeight - 20) {
              doc.addPage()
              yPosition = margin
              xPos = margin
            }

            doc.addImage(photoBase64, 'JPEG', xPos, yPosition, photoWidth, photoHeight)
            
            if (i % 2 === 0) {
              xPos = margin + photoWidth + 10
            } else {
              xPos = margin
              yPosition += photoHeight + 5
            }
          } catch (error) {
            console.error('Error cargando foto:', error)
          }
        }

        yPosition += photoHeight + 10
      }
    }
  }

  // ===== PIE DE PÁGINA =====
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(128)
    
    // Fecha de generación
    const generatedDate = new Date().toLocaleString('es-CL')
    doc.text(`Generado: ${generatedDate}`, margin, pageHeight - 10)
    
    // Número de página
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
    
    doc.setTextColor(0)
  }

  // Descargar PDF
  const fileName = `Inspeccion_${inspection.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(inspection.createdAt).replace(/\//g, '-')}.pdf`
  doc.save(fileName)
}

/**
 * Etiqueta de estado
 */
function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    en_progreso: 'En Progreso',
    finalizado: 'Finalizado',
    cancelada: 'Cancelada'
  }
  return labels[status] || status
}

/**
 * Etiqueta de prioridad
 */
function getPriorityLabel(priority?: string): string {
  if (!priority) return '-'
  const labels: Record<string, string> = {
    critica: 'Crítica',
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja'
  }
  return labels[priority] || priority
}

/**
 * Exportar vista de mapa con todos los marcadores
 */
export async function exportMapViewToPDF(
  locationName: string,
  mapVersion: MapVersion,
  markers: Array<{
    order: number
    position: { x: number; y: number }
    title: string
    description?: string
    type: 'inspeccion' | 'incidencia'
    inspectionName?: string
    createdAt: Date
  }>
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentWidth = pageWidth - (margin * 2)
  let yPosition = margin

  // Encabezado
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`Vista de Mapa - ${locationName}`, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')} | Total de puntos: ${markers.length}`, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 10

  // Mapa
  try {
    // Crear items falsos para dibujar marcadores
    const itemsForMap = markers.map((m, idx) => ({
      order: idx + 1,
      position: m.position
    }))
    
    const mapWithMarkers = await generateMapWithMarkers(
      mapVersion.imageUrl,
      itemsForMap as InspectionItem[],
      1200
    )
    
    const mapMaxWidth = contentWidth
    const mapMaxHeight = pageHeight - yPosition - 40
    
    const tempImg = new Image()
    await new Promise<void>((resolve, reject) => {
      tempImg.onload = () => resolve()
      tempImg.onerror = reject
      tempImg.src = mapWithMarkers
    })
    
    const aspectRatio = tempImg.width / tempImg.height
    let mapWidth = mapMaxWidth
    let mapHeight = mapWidth / aspectRatio
    
    if (mapHeight > mapMaxHeight) {
      mapHeight = mapMaxHeight
      mapWidth = mapHeight * aspectRatio
    }
    
    const mapX = margin + (contentWidth - mapWidth) / 2
    doc.addImage(mapWithMarkers, 'JPEG', mapX, yPosition, mapWidth, mapHeight)
    
  } catch (error) {
    console.error('Error generando mapa:', error)
  }

  // Nueva página para tabla
  doc.addPage()
  yPosition = margin

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Listado de Puntos', pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 10

  const tableData = markers.map((m, idx) => [
    (idx + 1).toString(),
    m.title,
    m.description || '-',
    m.type === 'inspeccion' ? 'Inspección' : 'Incidencia',
    m.inspectionName || '-',
    formatDate(m.createdAt)
  ])

  autoTable(doc, {
    head: [['#', 'Título', 'Descripción', 'Tipo', 'Inspección', 'Fecha']],
    body: tableData,
    startY: yPosition,
    theme: 'striped',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
    },
    margin: { left: margin, right: margin },
  })

  // Pie de página
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(128)
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
    doc.setTextColor(0)
  }

  const fileName = `Mapa_${locationName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
  doc.save(fileName)
}

/**
 * Exporta inspección con mapa en página completa horizontal
 */
async function exportInspectionLandscapePDF(
  options: ExportInspectionPDFOptions
): Promise<void> {
  const { 
    inspection, 
    items, 
    mapVersion
  } = options

  // Crear documento LANDSCAPE
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth() // ~297mm en landscape
  const pageHeight = doc.internal.pageSize.getHeight() // ~210mm en landscape
  const margin = 10

  // ===== PÁGINA 1: MAPA EN PÁGINA COMPLETA =====
  
  // Título pequeño en la parte superior
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(inspection.nombre, pageWidth / 2, margin + 5, { align: 'center' })
  
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100)
  doc.text(
    `${inspection.locationName} • ${items.length} puntos • ${formatDate(inspection.createdAt)}`,
    pageWidth / 2, 
    margin + 11, 
    { align: 'center' }
  )
  doc.setTextColor(0)

  // Generar mapa con marcadores - tamaño grande para landscape
  const mapMaxWidth = pageWidth - (margin * 2) // Casi toda la página
  const mapMaxHeight = pageHeight - 35 // Dejar espacio para título y footer
  
  try {
    const mapWithMarkers = await generateMapWithMarkers(
      mapVersion.imageUrl,
      items,
      2000 // Mayor resolución para página grande
    )
    
    // Calcular dimensiones manteniendo aspecto
    const aspectRatio = mapVersion.width / mapVersion.height
    let mapWidth = mapMaxWidth
    let mapHeight = mapWidth / aspectRatio
    
    // Si es muy alto, ajustar por altura
    if (mapHeight > mapMaxHeight) {
      mapHeight = mapMaxHeight
      mapWidth = mapHeight * aspectRatio
    }
    
    // Centrar horizontalmente
    const mapX = margin + (mapMaxWidth - mapWidth) / 2
    const mapY = 20 // Después del título
    
    doc.addImage(mapWithMarkers, 'JPEG', mapX, mapY, mapWidth, mapHeight)
    
  } catch (error) {
    console.error('Error generando mapa landscape:', error)
    doc.setFontSize(12)
    doc.text('Error al cargar el mapa', pageWidth / 2, pageHeight / 2, { align: 'center' })
  }

  // Footer de página 1
  doc.setFontSize(8)
  doc.setTextColor(128)
  doc.text(
    `Generado: ${new Date().toLocaleString('es-CL')}`,
    margin,
    pageHeight - 5
  )
  doc.setTextColor(0)

  // ===== PÁGINA 2+: TABLA DE PUNTOS =====
  doc.addPage('a4', 'portrait') // Volver a portrait para la tabla
  
  const tablePageWidth = doc.internal.pageSize.getWidth()
  let yPosition = margin

  // Encabezado
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Detalle de Puntos de Inspección', tablePageWidth / 2, yPosition, { align: 'center' })
  yPosition += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(inspection.nombre, tablePageWidth / 2, yPosition, { align: 'center' })
  yPosition += 10

  // Línea decorativa
  doc.setDrawColor(41, 128, 185)
  doc.setLineWidth(0.5)
  doc.line(margin, yPosition, tablePageWidth - margin, yPosition)
  yPosition += 8

  // Tabla de puntos
  const tableData = items.map((item) => [
    item.order.toString(),
    item.title,
    item.description || '-',
    item.prioridad || '-',
    item.fotos.length > 0 ? `${item.fotos.length} foto(s)` : '-'
  ])

  autoTable(doc, {
    head: [['#', 'Título', 'Descripción', 'Prioridad', 'Fotos']],
    body: tableData,
    startY: yPosition,
    theme: 'striped',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: {
      fontSize: 9,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 50 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 25, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
    },
    margin: { left: margin, right: margin },
  })

  // Pie de página en todas las páginas
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(128)
    
    const currentPageWidth = doc.internal.pageSize.getWidth()
    const currentPageHeight = doc.internal.pageSize.getHeight()
    
    doc.text(
      `Página ${i} de ${pageCount}`,
      currentPageWidth - margin,
      currentPageHeight - 5,
      { align: 'right' }
    )
    doc.setTextColor(0)
  }

  // Guardar
  const fileName = `Inspeccion_${inspection.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(inspection.createdAt).replace(/\//g, '-')}.pdf`
  doc.save(fileName)
}
