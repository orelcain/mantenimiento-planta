/**
 * Utilidad para exportar comparaciones de fotos a PDF
 * Usa canvas nativo para generar el PDF sin dependencias externas pesadas
 */

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PhotoComparison } from '@/types'

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
