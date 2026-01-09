/**
 * Utilidad para exportar comparaciones de fotos a PDF
 * Usa canvas nativo para generar el PDF sin dependencias externas pesadas
 */

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PhotoComparison, PhotoEvidence, PhotoEvidenceStatus, PhotoItem } from '@/types'

// Configuración del PDF
const PDF_CONFIG = {
  pageWidth: 595, // A4 width in points (72 dpi)
  pageHeight: 842, // A4 height in points
  margin: 40,
  headerHeight: 60,
  footerHeight: 30,
  imageMaxWidth: 240,
  imageMaxHeight: 180,
  spacing: 20,
  fontSize: {
    title: 18,
    subtitle: 12,
    body: 10,
    small: 8,
  },
}

const STATUS_LABEL: Record<PhotoEvidenceStatus, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  corregida: 'Corregida',
  verificada: 'Verificada',
}

function safeText(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function formatDateTime(value: unknown): string {
  if (!value) return ''
  try {
    const date = value instanceof Date ? value : new Date(value as any)
    if (Number.isNaN(date.getTime())) return ''
    return format(date, "dd/MM/yyyy HH:mm", { locale: es })
  } catch {
    return ''
  }
}

function drawSectionHeader(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number
): number {
  ctx.fillStyle = '#111827'
  ctx.font = `bold 11px system-ui, sans-serif`
  ctx.fillText(text, x, y)
  ctx.strokeStyle = '#e5e7eb'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y + 6)
  ctx.lineTo(x + width, y + 6)
  ctx.stroke()
  return y + 18
}

function drawInfoTable(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  rows: Array<Array<{ label: string; value: string }>>
): number {
  const rowHeight = 34
  const border = '#e5e7eb'
  const labelColor = '#6b7280'
  const valueColor = '#111827'

  let currentY = y
  for (const row of rows) {
    const cols = row.length
    const colWidth = width / cols

    // row border
    ctx.strokeStyle = border
    ctx.lineWidth = 1
    ctx.strokeRect(x, currentY, width, rowHeight)

    // vertical separators
    for (let i = 1; i < cols; i++) {
      const vx = x + colWidth * i
      ctx.beginPath()
      ctx.moveTo(vx, currentY)
      ctx.lineTo(vx, currentY + rowHeight)
      ctx.stroke()
    }

    for (let i = 0; i < cols; i++) {
      const cell = row[i] ?? { label: '', value: '' }
      const cellX = x + colWidth * i
      ctx.fillStyle = labelColor
      ctx.font = `bold 8px system-ui, sans-serif`
      ctx.fillText(cell.label.toUpperCase(), cellX + 8, currentY + 12)
      ctx.fillStyle = valueColor
      ctx.font = `10px system-ui, sans-serif`
      const value = cell.value || '-'
      ctx.fillText(value, cellX + 8, currentY + 26)
    }

    currentY += rowHeight
  }

  return currentY
}

async function drawBeforeAfterPair(
  ctx: CanvasRenderingContext2D,
  before: PhotoItem | null,
  after: PhotoItem | null,
  x: number,
  y: number,
  contentWidth: number
): Promise<number> {
  const spacing = 12
  const imageWidth = (contentWidth - spacing) / 2
  const imageHeight = 280

  // Labels
  ctx.font = `bold 10px system-ui, sans-serif`
  ctx.fillStyle = '#dc2626'
  ctx.fillText('ANTES', x, y + 12)
  ctx.fillStyle = '#16a34a'
  ctx.fillText('DESPUÉS', x + imageWidth + spacing, y + 12)

  const imgTop = y + 20

  const drawImageBox = async (
    imgUrl: string | null,
    borderColor: string,
    boxX: number
  ) => {
    // Borde
    ctx.strokeStyle = borderColor
    ctx.lineWidth = 2
    ctx.strokeRect(boxX - 2, imgTop - 2, imageWidth + 4, imageHeight + 4)

    // Fondo
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(boxX, imgTop, imageWidth, imageHeight)

    if (!imgUrl) {
      ctx.fillStyle = '#9ca3af'
      ctx.font = `10px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('Sin imagen', boxX + imageWidth / 2, imgTop + imageHeight / 2)
      ctx.textAlign = 'left'
      return
    }

    try {
      const img = await loadImage(imgUrl)
      const aspect = img.width / img.height
      let drawWidth = imageWidth
      let drawHeight = imageWidth / aspect
      if (drawHeight > imageHeight) {
        drawHeight = imageHeight
        drawWidth = imageHeight * aspect
      }
      const drawX = boxX + (imageWidth - drawWidth) / 2
      const drawY = imgTop + (imageHeight - drawHeight) / 2
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)
    } catch {
      ctx.fillStyle = '#9ca3af'
      ctx.font = `10px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText('Error cargando imagen', boxX + imageWidth / 2, imgTop + imageHeight / 2)
      ctx.textAlign = 'left'
    }
  }

  await drawImageBox(before?.url ?? null, '#dc2626', x)
  await drawImageBox(after?.url ?? null, '#16a34a', x + imageWidth + spacing)

  return imgTop + imageHeight + 16
}

/**
 * Exporta un informe técnico tipo “Mosaikus” para evidencias de mantenimiento.
 * Genera un documento paginado: 1 par ANTES/DESPUÉS por página, con identificación y cierre.
 */
export async function exportPhotoEvidenceTechnicalReportToPDF(
  evidences: PhotoEvidence[],
  title: string = 'Informe Técnico - Evidencias Fotográficas'
): Promise<void> {
  const { pageWidth, pageHeight, margin, fontSize, footerHeight } = PDF_CONFIG
  const contentWidth = pageWidth - margin * 2

  const evidencePages: Array<{ evidence: PhotoEvidence; pairIndex: number }> = []
  for (const evidence of evidences) {
    const maxPairs = Math.max(evidence.fotosBefore.length, evidence.fotosAfter.length)
    for (let i = 0; i < maxPairs; i++) {
      const before = evidence.fotosBefore[i]
      const after = evidence.fotosAfter[i]
      // Solo exportar si hay al menos una imagen en el par (y en práctica se usa cuando hay pares completos)
      if (before || after) {
        evidencePages.push({ evidence, pairIndex: i })
      }
    }
  }

  if (evidencePages.length === 0) {
    throw new Error('No hay evidencias con fotos para exportar')
  }

  const totalPages = evidencePages.length
  const canvases: HTMLCanvasElement[] = []

  for (let pageIndex = 0; pageIndex < evidencePages.length; pageIndex++) {
    const pageItem = evidencePages[pageIndex]
    if (!pageItem) continue
    const { evidence, pairIndex } = pageItem
    const canvas = document.createElement('canvas')
    canvas.width = pageWidth * 2
    canvas.height = pageHeight * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)

    // Fondo
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageWidth, pageHeight)

    // Header
    ctx.fillStyle = '#111827'
    ctx.font = `bold ${fontSize.title}px system-ui, sans-serif`
    ctx.fillText(title, margin, margin + 18)

    ctx.fillStyle = '#6b7280'
    ctx.font = `${fontSize.body}px system-ui, sans-serif`
    ctx.fillText(
      `Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`,
      margin,
      margin + 36
    )

    ctx.textAlign = 'right'
    ctx.fillText(`${pageIndex + 1}/${totalPages}`, pageWidth - margin, margin + 36)
    ctx.textAlign = 'left'

    let currentY = margin + 58

    // 1. Identificación
    currentY = drawSectionHeader(ctx, '1. IDENTIFICACIÓN', margin, currentY, contentWidth)

    const pairMeta = evidence.pairMeta?.[pairIndex]

    const statusKey = evidence.status as PhotoEvidenceStatus
    const statusLabel = STATUS_LABEL[statusKey] ?? safeText(evidence.status)
    const reportRows = [
      [
        { label: 'ID', value: safeText(evidence.id) },
        { label: 'Estado', value: safeText(statusLabel) },
        { label: 'Fecha evento', value: formatDateTime(evidence.createdAt) },
        { label: 'Reporta', value: safeText(evidence.reportadoPor) },
      ],
      [
        { label: 'Ubicación (general)', value: safeText(evidence.hierarchyPath || '-') },
        { label: 'Ubicación (par)', value: safeText(pairMeta?.ubicacion || '-') },
      ],
      [
        { label: 'Fotos antes', value: String(evidence.fotosBefore.length) },
        { label: 'Fotos después', value: String(evidence.fotosAfter.length) },
        { label: 'Par', value: `${pairIndex + 1}` },
        { label: 'Título', value: safeText(evidence.titulo) },
      ],
    ]

    currentY = drawInfoTable(ctx, margin, currentY, contentWidth, reportRows)
    currentY += 10

    // Descripción
    currentY = drawSectionHeader(ctx, 'Descripción', margin, currentY, contentWidth)
    const desc = evidence.descripcion?.trim()
    ctx.fillStyle = '#f9fafb'
    ctx.fillRect(margin, currentY - 2, contentWidth, 56)
    ctx.strokeStyle = '#e5e7eb'
    ctx.strokeRect(margin, currentY - 2, contentWidth, 56)
    ctx.fillStyle = '#111827'
    ctx.font = `10px system-ui, sans-serif`
    const bodyText = desc ? desc : '—'
    drawWrappedText(ctx, bodyText, margin + 10, currentY + 12, contentWidth - 20, 14)
    currentY += 66

    // Observación del par (si aplica)
    if ((pairMeta?.descripcion || '').trim()) {
      currentY = drawSectionHeader(ctx, 'Observación del par', margin, currentY, contentWidth)
      const pairText = pairMeta?.descripcion?.trim() || '—'
      ctx.fillStyle = '#f9fafb'
      ctx.fillRect(margin, currentY - 2, contentWidth, 44)
      ctx.strokeStyle = '#e5e7eb'
      ctx.strokeRect(margin, currentY - 2, contentWidth, 44)
      ctx.fillStyle = '#111827'
      ctx.font = `10px system-ui, sans-serif`
      drawWrappedText(ctx, pairText, margin + 10, currentY + 12, contentWidth - 20, 14)
      currentY += 54
    }

    // Evidencia fotográfica
    currentY = drawSectionHeader(ctx, '2. EVIDENCIA FOTOGRÁFICA (ANTES / DESPUÉS)', margin, currentY, contentWidth)
    const before = evidence.fotosBefore[pairIndex] ?? null
    const after = evidence.fotosAfter[pairIndex] ?? null
    currentY = await drawBeforeAfterPair(ctx, before, after, margin, currentY, contentWidth)

    // Corrección / cierre
    currentY += 6
    currentY = drawSectionHeader(ctx, '3. CIERRE', margin, currentY, contentWidth)
    const cierreRows = [
      [
        { label: 'Corregido por', value: safeText(evidence.corregidoPor || '-') },
        { label: 'Fecha corrección', value: formatDateTime(evidence.corregidaAt) || '-' },
      ],
      [
        { label: 'Verificado por', value: safeText(evidence.verificadoPor || '-') },
        { label: 'Fecha verificación', value: formatDateTime(evidence.verificadaAt) || '-' },
      ],
    ]
    drawInfoTable(ctx, margin, currentY, contentWidth, cierreRows)

    // Footer
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, pageHeight - footerHeight - margin + 10)
    ctx.lineTo(pageWidth - margin, pageHeight - footerHeight - margin + 10)
    ctx.stroke()
    ctx.fillStyle = '#9ca3af'
    ctx.font = `${fontSize.small}px system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.fillText('Sistema de Mantenimiento - Informe Técnico', margin, pageHeight - margin)
    ctx.textAlign = 'right'
    ctx.fillText(format(new Date(), 'dd/MM/yyyy', { locale: es }), pageWidth - margin, pageHeight - margin)
    ctx.textAlign = 'left'

    canvases.push(canvas)
  }

  await downloadAsPDF(canvases, title)
}

/**
 * Carga una imagen y retorna su data URL
 */
async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/**
 * Dibuja texto con word wrap
 */
function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ')
  let line = ''
  let currentY = y

  for (const word of words) {
    const testLine = line + word + ' '
    const metrics = ctx.measureText(testLine)
    
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line.trim(), x, currentY)
      line = word + ' '
      currentY += lineHeight
    } else {
      line = testLine
    }
  }
  
  ctx.fillText(line.trim(), x, currentY)
  return currentY + lineHeight
}

/**
 * Genera un PDF con las comparaciones de fotos
 */
export async function exportComparisonsToPDF(
  comparisons: PhotoComparison[],
  title: string = 'Comparación de Evidencias'
): Promise<void> {
  const { pageWidth, pageHeight, margin, headerHeight, footerHeight, spacing, fontSize } = PDF_CONFIG
  const contentWidth = pageWidth - margin * 2
  const imageWidth = (contentWidth - spacing) / 2
  const imageHeight = imageWidth * 0.75 // Aspect ratio 4:3

  // Calcular cuántas comparaciones por página
  const comparisonHeight = imageHeight + 80 // imagen + labels + espacio
  const availableHeight = pageHeight - headerHeight - footerHeight - margin * 2
  const comparisonsPerPage = Math.floor(availableHeight / comparisonHeight)

  // Crear páginas
  const pages: PhotoComparison[][] = []
  for (let i = 0; i < comparisons.length; i += comparisonsPerPage) {
    pages.push(comparisons.slice(i, i + comparisonsPerPage))
  }

  // Crear canvas para cada página y combinar en un PDF
  const canvases: HTMLCanvasElement[] = []

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageComparisons = pages[pageIndex]
    const canvas = document.createElement('canvas')
    canvas.width = pageWidth * 2 // 2x para mejor resolución
    canvas.height = pageHeight * 2
    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2) // Scale for retina

    // Fondo blanco
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageWidth, pageHeight)

    // Header
    ctx.fillStyle = '#1f2937'
    ctx.font = `bold ${fontSize.title}px system-ui, sans-serif`
    ctx.fillText(title, margin, margin + 20)
    
    ctx.fillStyle = '#6b7280'
    ctx.font = `${fontSize.body}px system-ui, sans-serif`
    ctx.fillText(
      `Generado: ${format(new Date(), "d 'de' MMMM yyyy, HH:mm", { locale: es })}`,
      margin,
      margin + 40
    )
    ctx.fillText(
      `Página ${pageIndex + 1} de ${pages.length}`,
      pageWidth - margin - 80,
      margin + 40
    )

    // Línea separadora
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, headerHeight + margin - 10)
    ctx.lineTo(pageWidth - margin, headerHeight + margin - 10)
    ctx.stroke()

    // Dibujar comparaciones
    let currentY = headerHeight + margin

    const currentPageComparisons = pageComparisons || []
    for (const comparison of currentPageComparisons) {
      // Título de la comparación
      ctx.fillStyle = '#1f2937'
      ctx.font = `bold ${fontSize.subtitle}px system-ui, sans-serif`
      ctx.fillText(comparison.titulo, margin, currentY + 15)

      if (comparison.ubicacion) {
        ctx.fillStyle = '#6b7280'
        ctx.font = `${fontSize.small}px system-ui, sans-serif`
        ctx.fillText(`📍 ${comparison.ubicacion}`, margin, currentY + 30)
      }

      currentY += 40

      // Labels
      ctx.font = `bold ${fontSize.body}px system-ui, sans-serif`
      ctx.fillStyle = '#dc2626' // Red
      ctx.fillText('ANTES', margin, currentY + 12)
      ctx.fillStyle = '#16a34a' // Green
      ctx.fillText('DESPUÉS', margin + imageWidth + spacing, currentY + 12)

      currentY += 20

      // Imágenes
      try {
        // Imagen ANTES
        const beforeImg = await loadImage(comparison.before.url)
        const beforeAspect = beforeImg.width / beforeImg.height
        let beforeDrawWidth = imageWidth
        let beforeDrawHeight = imageWidth / beforeAspect
        if (beforeDrawHeight > imageHeight) {
          beforeDrawHeight = imageHeight
          beforeDrawWidth = imageHeight * beforeAspect
        }
        
        // Borde rojo
        ctx.strokeStyle = '#dc2626'
        ctx.lineWidth = 2
        ctx.strokeRect(margin - 2, currentY - 2, imageWidth + 4, imageHeight + 4)
        
        // Fondo gris
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(margin, currentY, imageWidth, imageHeight)
        
        // Centrar imagen
        const beforeX = margin + (imageWidth - beforeDrawWidth) / 2
        const beforeY = currentY + (imageHeight - beforeDrawHeight) / 2
        ctx.drawImage(beforeImg, beforeX, beforeY, beforeDrawWidth, beforeDrawHeight)

        // Imagen DESPUÉS
        const afterImg = await loadImage(comparison.after.url)
        const afterAspect = afterImg.width / afterImg.height
        let afterDrawWidth = imageWidth
        let afterDrawHeight = imageWidth / afterAspect
        if (afterDrawHeight > imageHeight) {
          afterDrawHeight = imageHeight
          afterDrawWidth = imageHeight * afterAspect
        }
        
        // Borde verde
        ctx.strokeStyle = '#16a34a'
        ctx.lineWidth = 2
        ctx.strokeRect(margin + imageWidth + spacing - 2, currentY - 2, imageWidth + 4, imageHeight + 4)
        
        // Fondo gris
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(margin + imageWidth + spacing, currentY, imageWidth, imageHeight)
        
        // Centrar imagen
        const afterX = margin + imageWidth + spacing + (imageWidth - afterDrawWidth) / 2
        const afterY = currentY + (imageHeight - afterDrawHeight) / 2
        ctx.drawImage(afterImg, afterX, afterY, afterDrawWidth, afterDrawHeight)
      } catch (error) {
        // Si falla la carga de imagen, mostrar placeholder
        ctx.fillStyle = '#f3f4f6'
        ctx.fillRect(margin, currentY, imageWidth, imageHeight)
        ctx.fillRect(margin + imageWidth + spacing, currentY, imageWidth, imageHeight)
        
        ctx.fillStyle = '#9ca3af'
        ctx.font = `${fontSize.small}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText('Error cargando imagen', margin + imageWidth / 2, currentY + imageHeight / 2)
        ctx.fillText('Error cargando imagen', margin + imageWidth * 1.5 + spacing, currentY + imageHeight / 2)
        ctx.textAlign = 'left'
      }

      currentY += imageHeight + spacing

      // Descripción si existe
      if (comparison.descripcion) {
        ctx.fillStyle = '#6b7280'
        ctx.font = `${fontSize.small}px system-ui, sans-serif`
        currentY = drawWrappedText(ctx, comparison.descripcion, margin, currentY, contentWidth, 14)
      }

      currentY += spacing
    }

    // Footer
    ctx.strokeStyle = '#e5e7eb'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(margin, pageHeight - footerHeight - margin + 10)
    ctx.lineTo(pageWidth - margin, pageHeight - footerHeight - margin + 10)
    ctx.stroke()

    ctx.fillStyle = '#9ca3af'
    ctx.font = `${fontSize.small}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(
      'Sistema de Gestión de Mantenimiento - Evidencias Fotográficas',
      pageWidth / 2,
      pageHeight - margin
    )
    ctx.textAlign = 'left'

    canvases.push(canvas)
  }

  // Generar y descargar PDF usando los canvas
  await downloadAsPDF(canvases, title)
}

/**
 * Convierte los canvas a un PDF y lo descarga
 * Usamos una técnica simple: crear un documento HTML con las imágenes
 * y usar window.print() o descarga directa
 */
async function downloadAsPDF(canvases: HTMLCanvasElement[], title: string): Promise<void> {
  // Crear ventana de impresión con las imágenes
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error('No se pudo abrir ventana de impresión. Verifica los bloqueadores de popups.')
  }

  const imagesHtml = canvases.map((canvas, index) => {
    const dataUrl = canvas.toDataURL('image/png', 1.0)
    return `
      <div class="page" style="page-break-after: ${index < canvases.length - 1 ? 'always' : 'auto'};">
        <img src="${dataUrl}" style="width: 100%; height: auto;" />
      </div>
    `
  }).join('')

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${title}</title>
      <style>
        @page {
          size: A4;
          margin: 0;
        }
        body {
          margin: 0;
          padding: 0;
          background: white;
        }
        .page {
          width: 100%;
          max-width: 210mm;
          margin: 0 auto;
        }
        .page img {
          display: block;
        }
        @media print {
          .no-print {
            display: none !important;
          }
        }
        .print-buttons {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          display: flex;
          gap: 10px;
        }
        .print-buttons button {
          padding: 10px 20px;
          font-size: 14px;
          cursor: pointer;
          border: none;
          border-radius: 6px;
        }
        .btn-print {
          background: #2563eb;
          color: white;
        }
        .btn-download {
          background: #059669;
          color: white;
        }
        .btn-close {
          background: #6b7280;
          color: white;
        }
      </style>
    </head>
    <body>
      <div class="print-buttons no-print">
        <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
        <button class="btn-close" onclick="window.close()">✕ Cerrar</button>
      </div>
      ${imagesHtml}
      <script>
        // Auto-trigger print dialog after load
        window.onload = function() {
          // Pequeño delay para asegurar que las imágenes carguen
          setTimeout(function() {
            // window.print();
          }, 500);
        };
      </script>
    </body>
    </html>
  `)

  printWindow.document.close()
}

/**
 * Exporta una sola evidencia a PDF
 */
export async function exportSingleEvidenceToPDF(
  evidence: { titulo: string; comparisons: PhotoComparison[] }
): Promise<void> {
  if (evidence.comparisons.length === 0) {
    throw new Error('No hay comparaciones para exportar')
  }
  
  await exportComparisonsToPDF(evidence.comparisons, evidence.titulo)
}
