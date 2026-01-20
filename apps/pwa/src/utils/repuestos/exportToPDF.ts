import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Repuesto } from '@/types/repuestos'
import { getTotalCantidadesRepuesto, isTagAsignado, getTagNombre } from '@/types/tags'

interface ExportPDFOptions {
  machineName?: string
  includeStats?: boolean
  includeTagsDetail?: boolean
}

/**
 * Exporta repuestos a PDF con formato profesional
 */
export async function exportRepuestosToPDF(
  repuestos: Repuesto[],
  options: ExportPDFOptions = {}
): Promise<void> {
  const {
    machineName = 'Máquina',
    includeStats = true,
    includeTagsDetail = true,
  } = options

  // Crear documento
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  let yPosition = 20

  // Título
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(`Catálogo de Repuestos - ${machineName}`, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 10

  // Fecha
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const fecha = new Date().toLocaleDateString('es-CL')
  doc.text(`Fecha: ${fecha}`, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 15

  // Estadísticas (si se solicitan)
  if (includeStats) {
    const totalRepuestos = repuestos.length
    const conStock = repuestos.filter(r => getTotalCantidadesRepuesto(r).stock > 0).length
    const conSolicitudes = repuestos.filter(r => getTotalCantidadesRepuesto(r).solicitud > 0).length
    const valorTotalStock = repuestos.reduce((sum, r) => {
      const stock = getTotalCantidadesRepuesto(r).stock
      return sum + (stock * (r.valorUnitario || 0))
    }, 0)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Estadísticas Generales', 14, yPosition)
    yPosition += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Total de Repuestos: ${totalRepuestos}`, 14, yPosition)
    yPosition += 5
    doc.text(`Con Stock: ${conStock}`, 14, yPosition)
    yPosition += 5
    doc.text(`Con Solicitudes: ${conSolicitudes}`, 14, yPosition)
    yPosition += 5
    doc.text(`Valor Total Stock: $${valorTotalStock.toLocaleString('es-CL')}`, 14, yPosition)
    yPosition += 10
  }

  // Tabla principal de repuestos
  const tableData = repuestos.map(rep => {
    const totals = getTotalCantidadesRepuesto(rep)
    
    return [
      rep.codigoSAP || '-',
      rep.textoBreve || '-',
      totals.stock.toString(),
      totals.solicitud.toString(),
      rep.valorUnitario ? `$${rep.valorUnitario.toLocaleString('es-CL')}` : '-',
      rep.valorUnitario ? `$${(totals.stock * rep.valorUnitario).toLocaleString('es-CL')}` : '-',
    ]
  })

  autoTable(doc, {
    head: [['Código SAP', 'Texto Breve', 'Stock', 'Solicitud', 'Valor Unit.', 'Valor Stock']],
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
      0: { cellWidth: 30 }, // Código SAP
      1: { cellWidth: 80 }, // Texto Breve
      2: { cellWidth: 20, halign: 'right' }, // Stock
      3: { cellWidth: 25, halign: 'right' }, // Solicitud
      4: { cellWidth: 25, halign: 'right' }, // Valor Unit
      5: { cellWidth: 30, halign: 'right' }, // Valor Stock
    },
    margin: { left: 14, right: 14 },
  })

  // Detalle de tags por repuesto (opcional, nueva página)
  if (includeTagsDetail && repuestos.some(r => Array.isArray(r.tags) && r.tags.length > 0)) {
    doc.addPage()
    yPosition = 20

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Detalle de Tags por Repuesto', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 10

    const tagsTableData: string[][] = []

    repuestos.forEach(rep => {
      if (Array.isArray(rep.tags) && rep.tags.length > 0) {
        rep.tags.forEach(tag => {
          if (isTagAsignado(tag)) {
            tagsTableData.push([
              rep.codigoSAP || '-',
              rep.textoBreve || '-',
              getTagNombre(tag),
              tag.tipo === 'solicitud' ? 'Solicitud' : 'Stock',
              tag.cantidad?.toString() || '0',
            ])
          }
        })
      }
    })

    if (tagsTableData.length > 0) {
      autoTable(doc, {
        head: [['Código SAP', 'Texto Breve', 'Tag', 'Tipo', 'Cantidad']],
        body: tagsTableData,
        startY: yPosition,
        theme: 'grid',
        headStyles: {
          fillColor: [52, 152, 219],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 10,
        },
        bodyStyles: {
          fontSize: 9,
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 80 },
          2: { cellWidth: 50 },
          3: { cellWidth: 25 },
          4: { cellWidth: 20, halign: 'right' },
        },
        margin: { left: 14, right: 14 },
      })
    }
  }

  // Pie de página en todas las páginas
  const pageCount = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    )
  }

  // Guardar archivo
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `Repuestos_${machineName.replace(/\s+/g, '_')}_${timestamp}.pdf`
  
  doc.save(filename)
}

/**
 * Exporta un reporte resumido con solo estadísticas por tag
 */
export async function exportTagsReportToPDF(
  repuestos: Repuesto[],
  machineName: string = 'Máquina'
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  let yPosition = 20

  // Título
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(`Reporte de Tags - ${machineName}`, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 10

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  const fecha = new Date().toLocaleDateString('es-CL')
  doc.text(`Fecha: ${fecha}`, pageWidth / 2, yPosition, { align: 'center' })
  yPosition += 15

  // Agrupar por tags
  const tagsMap = new Map<string, { tipo: 'solicitud' | 'stock'; cantidad: number; repuestos: Set<string> }>()

  repuestos.forEach(rep => {
    if (Array.isArray(rep.tags)) {
      rep.tags.forEach(tag => {
        if (isTagAsignado(tag)) {
          const nombre = getTagNombre(tag)
          const existing = tagsMap.get(nombre)
          
          if (existing) {
            existing.cantidad += tag.cantidad || 0
            existing.repuestos.add(rep.id)
          } else {
            tagsMap.set(nombre, {
              tipo: tag.tipo,
              cantidad: tag.cantidad || 0,
              repuestos: new Set([rep.id]),
            })
          }
        }
      })
    }
  })

  // Preparar datos para tabla
  const tableData = Array.from(tagsMap.entries()).map(([nombre, data]) => [
    nombre,
    data.tipo === 'solicitud' ? 'Solicitud' : 'Stock',
    data.cantidad.toString(),
    data.repuestos.size.toString(),
  ])

  autoTable(doc, {
    head: [['Tag', 'Tipo', 'Cantidad Total', 'Repuestos Asociados']],
    body: tableData,
    startY: yPosition,
    theme: 'grid',
    headStyles: {
      fillColor: [46, 204, 113],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 11,
    },
    bodyStyles: {
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 40 },
      2: { cellWidth: 40, halign: 'right' },
      3: { cellWidth: 50, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  })

  // Guardar
  const timestamp = new Date().toISOString().slice(0, 10)
  doc.save(`Reporte_Tags_${machineName.replace(/\s+/g, '_')}_${timestamp}.pdf`)
}
