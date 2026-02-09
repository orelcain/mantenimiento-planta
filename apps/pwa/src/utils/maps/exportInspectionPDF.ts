/**
 * Exportación PDF de inspecciones con mapas
 * 
 * Genera un PDF profesional que incluye:
 * - Mapa con marcadores numerados
 * - Tabla de puntos de inspección
 * - Estadísticas de la inspección
 * - Fotos asociadas (opcional)
 */

// Funcion para limpiar caracteres especiales (jsPDF no soporta UTF-8 completo)
function sanitizeText(text: string): string {
  if (!text) return ''
  return text
    .replace(/á/g, 'a').replace(/Á/g, 'A')
    .replace(/é/g, 'e').replace(/É/g, 'E')
    .replace(/í/g, 'i').replace(/Í/g, 'I')
    .replace(/ó/g, 'o').replace(/Ó/g, 'O')
    .replace(/ú/g, 'u').replace(/Ú/g, 'U')
    .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/[^\x00-\x7F]/g, '') // Eliminar cualquier otro caracter no-ASCII
}

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
 * Obtiene dimensiones reales de una imagen (dataURL)
 */
async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = reject
    img.src = dataUrl
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
  
  if (inspection.inspectorNames) {
    infoItems.push(`Inspectores: ${inspection.inspectorNames}`)
  } else if (inspection.createdByName) {
    infoItems.push(`Realizada por: ${inspection.createdByName}`)
  }
  
  if (inspection.horaInicio && inspection.horaTermino) {
    infoItems.push(`Horario: ${inspection.horaInicio} - ${inspection.horaTermino}`)
  }
  
  if (inspection.folio) {
    infoItems.push(`Folio N°: ${inspection.folio}`)
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

  // Preparar datos de la tabla con campos de checklist
  const tableData = items.map(item => [
    item.order.toString(),
    item.title,
    item.cumple ? 'X' : '',
    item.noCumple ? 'X' : '',
    item.observacion || '-',
    item.fechaReparacion ? formatDate(item.fechaReparacion) : '-',
    item.fotos.length > 0 ? item.fotos.length.toString() : '-',
    item.revisoConforme || '-'
  ])

  autoTable(doc, {
    head: [['#', 'Actividad', 'C', 'N/C', 'Observación', 'F. Reparación', 'Fotos', 'Rev. Conforme']],
    body: tableData,
    startY: yPosition,
    theme: 'grid',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 8, halign: 'center' },
      3: { cellWidth: 8, halign: 'center' },
      4: { cellWidth: 40 },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 12, halign: 'center' },
      7: { cellWidth: 25 }
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
            const foto = item.fotos[i]
            if (!foto || !foto.url) continue
            const photoBase64 = await urlToBase64(foto.url)
            const { width, height } = await getImageDimensions(photoBase64)
            
            // Espacio extra para descripción
            const totalPhotoHeight = photoHeight + (foto.descripcion ? 8 : 0)
            
            if (yPosition + totalPhotoHeight > pageHeight - 20) {
              doc.addPage()
              yPosition = margin
              xPos = margin
            }

            const scale = Math.min(photoWidth / width, photoHeight / height)
            const drawWidth = width * scale
            const drawHeight = height * scale
            const drawX = xPos + (photoWidth - drawWidth) / 2
            const drawY = yPosition + (photoHeight - drawHeight) / 2

            doc.addImage(photoBase64, 'JPEG', drawX, drawY, drawWidth, drawHeight)
            
            // Agregar descripción de la foto si existe
            if (foto.descripcion) {
              doc.setFontSize(7)
              doc.setFont('helvetica', 'italic')
              doc.setTextColor(80)
              const descText = sanitizeText(foto.descripcion).substring(0, 50)
              doc.text(descText, xPos + photoWidth / 2, yPosition + photoHeight + 4, { align: 'center' })
              doc.setTextColor(0)
            }
            
            if (i % 2 === 0) {
              xPos = margin + photoWidth + 10
            } else {
              xPos = margin
              yPosition += totalPhotoHeight + 5
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
    mapVersion,
    includePhotos = true // Ahora por defecto incluye fotos
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
  let yPosition = margin

  // ===== PÁGINA 1: MAPA OCUPANDO 80% CON INFO COMPACTA EN LA PARTE SUPERIOR =====
  
  // Encabezado compacto
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(41, 128, 185)
  doc.text(sanitizeText(inspection.nombre), margin, yPosition)
  doc.setTextColor(0)
  yPosition += 6

  // Línea decorativa
  doc.setDrawColor(41, 128, 185)
  doc.setLineWidth(0.8)
  doc.line(margin, yPosition, pageWidth - margin, yPosition)
  yPosition += 4

  // Información compacta en una línea horizontal
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  
  const infoParts = [
    `Ubicacion: ${sanitizeText(inspection.locationName)}`,
    `Fecha: ${formatDate(inspection.createdAt)}`,
    `Puntos: ${items.length}`
  ]

  if (inspection.inspectorNames) {
    infoParts.push(`Inspectores: ${sanitizeText(inspection.inspectorNames)}`)
  } else {
    infoParts.push(`Usuario: ${sanitizeText(inspection.createdByName || 'Sistema')}`)
  }
  
  const infoText = infoParts.join('  -  ')
  
  doc.text(infoText, margin, yPosition)
  yPosition += 4

  // Resumen por prioridad en línea compacta
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
  
  const priorityLabels: Record<string, string> = {
    critica: 'Critica',
    alta: 'Alta',
    media: 'Media',
    baja: 'Baja',
    sin_prioridad: 'Sin definir'
  }
  
  const prioritySummary = Object.entries(countByPriority)
    .filter(([_, count]) => count > 0)
    .map(([key, count]) => `${priorityLabels[key]}: ${count}`)
    .join('  -  ')
  
  if (prioritySummary) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(60)
    doc.text(`Prioridades: ${prioritySummary}`, margin, yPosition)
    doc.setTextColor(0)
    yPosition += 4
  }
  
  yPosition += 2

  // Mapa ocupando 80% de la página (casi toda horizontal)
  const mapMaxWidth = pageWidth - (margin * 2) // 80% del ancho disponible
  const mapMaxHeight = pageHeight - yPosition - margin - 10 // Espacio restante
  
  try {
    const mapWithMarkers = await generateMapWithMarkers(
      mapVersion.imageUrl,
      items,
      2000
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
    
    doc.addImage(mapWithMarkers, 'JPEG', mapX, yPosition, mapWidth, mapHeight)
    
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
    pageHeight - 6
  )
  doc.setTextColor(0)

  // ===== PÁGINA 2+: TABLA DE PUNTOS =====
  doc.addPage('a4', 'portrait') // Volver a portrait para la tabla
  
  const tablePageWidth = doc.internal.pageSize.getWidth()
  const tableMargin = 15
  yPosition = tableMargin

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
  doc.line(tableMargin, yPosition, tablePageWidth - tableMargin, yPosition)
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
    margin: { left: tableMargin, right: tableMargin },
  })

  // ===== PÁGINAS DE FOTOS: Agrupadas por marcador =====
  if (includePhotos) {
    const itemsWithPhotos = items.filter(item => item.fotos.length > 0)
    
    if (itemsWithPhotos.length > 0) {
      doc.addPage('a4', 'portrait')
      const photoPageWidth = doc.internal.pageSize.getWidth()
      const photoPageHeight = doc.internal.pageSize.getHeight()
      const photoMargin = 15
      const contentWidth = photoPageWidth - (photoMargin * 2)
      let photoYPosition = photoMargin
      
      // Título de sección
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      doc.text('Evidencia Fotográfica', photoPageWidth / 2, photoYPosition, { align: 'center' })
      photoYPosition += 6
      
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100)
      doc.text('Fotos organizadas por punto de inspección', photoPageWidth / 2, photoYPosition, { align: 'center' })
      doc.setTextColor(0)
      photoYPosition += 12
      
      // Iterar por cada punto con fotos
      for (const item of itemsWithPhotos) {
        // Verificar espacio para título + al menos 1 foto
        if (photoYPosition + 55 > photoPageHeight - photoMargin) {
          doc.addPage('a4', 'portrait')
          photoYPosition = photoMargin
        }
        
        // Número de marcador (círculo)
        doc.setFillColor(41, 128, 185)
        doc.circle(photoMargin + 5, photoYPosition + 3, 4, 'F')
        doc.setTextColor(255)
        doc.setFontSize(8)
        doc.setFont('helvetica', 'bold')
        doc.text(item.order.toString(), photoMargin + 5, photoYPosition + 4, { align: 'center' })
        doc.setTextColor(0)
        
        // Título del punto
        doc.setFontSize(12)
        doc.setFont('helvetica', 'bold')
        doc.text(sanitizeText(item.title), photoMargin + 14, photoYPosition + 5)
        photoYPosition += 10
        
        // Descripción (si existe)
        if (item.description) {
          doc.setFontSize(9)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(100)
          const descLines = doc.splitTextToSize(sanitizeText(item.description), contentWidth - 10)
          doc.text(descLines.slice(0, 2), photoMargin + 14, photoYPosition)
          photoYPosition += Math.min(descLines.length, 2) * 4 + 2
          doc.setTextColor(0)
        }
        
        // Fotos del punto (hasta 4 por punto, 2 por fila)
        const photoWidth = (contentWidth - 15) / 2
        const photoHeight = 50
        let photoXPos = photoMargin
        
        for (let i = 0; i < Math.min(item.fotos.length, 4); i++) {
          const foto = item.fotos[i]
          if (!foto || !foto.url) continue
          
          // Espacio extra para descripción
          const totalPhotoHeight = photoHeight + (foto.descripcion ? 8 : 0)
          
          // Verificar espacio
          if (photoYPosition + totalPhotoHeight > photoPageHeight - photoMargin) {
            doc.addPage('a4', 'portrait')
            photoYPosition = photoMargin
            photoXPos = photoMargin
          }
          
          try {
            const photoBase64 = await urlToBase64(foto.url)
            const { width, height } = await getImageDimensions(photoBase64)
            const scale = Math.min(photoWidth / width, photoHeight / height)
            const drawWidth = width * scale
            const drawHeight = height * scale
            const drawX = photoXPos + (photoWidth - drawWidth) / 2
            const drawY = photoYPosition + (photoHeight - drawHeight) / 2
            doc.addImage(photoBase64, 'JPEG', drawX, drawY, drawWidth, drawHeight)
            
            // Etiqueta y descripción de foto
            doc.setFontSize(7)
            doc.setTextColor(100)
            if (foto.descripcion) {
              const fotoDesc = sanitizeText(foto.descripcion).substring(0, 40)
              doc.text(`Foto ${i + 1}: ${fotoDesc}`, photoXPos + 2, photoYPosition + photoHeight + 4)
            } else {
              doc.text(`Foto ${i + 1}`, photoXPos + 2, photoYPosition + photoHeight + 4)
            }
            doc.setTextColor(0)
            
            // Alternar posición
            if (i % 2 === 0) {
              photoXPos = photoMargin + photoWidth + 15
            } else {
              photoXPos = photoMargin
              photoYPosition += totalPhotoHeight + 8
            }
          } catch (err) {
            console.error(`Error cargando foto ${i + 1} del punto ${item.order}:`, err)
          }
        }
        // Si terminó en columna impar, mover a siguiente fila
        if (item.fotos.length % 2 !== 0) {
          photoYPosition += photoHeight + 8
        }
        
        // Espaciado entre puntos
        photoYPosition += 10
        
        // Línea separadora
        doc.setDrawColor(220)
        doc.setLineWidth(0.3)
        doc.line(photoMargin, photoYPosition - 5, photoPageWidth - photoMargin, photoYPosition - 5)
      }
    }
  }

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
      currentPageWidth - 12,
      currentPageHeight - 5,
      { align: 'right' }
    )
    doc.setTextColor(0)
  }

  // Guardar
  const fileName = `Inspeccion_${inspection.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${formatDate(inspection.createdAt).replace(/\//g, '-')}.pdf`
  doc.save(fileName)
}
