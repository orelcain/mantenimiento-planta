import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { Repuesto } from '@/types/repuestos'

interface ExportPDFOptions {
  machineName?: string
  includeStats?: boolean
  /** @deprecated ya no se usa en catálogo puro */
  includeTagsDetail?: boolean
}

/**
 * Exporta repuestos a PDF con formato profesional — Catálogo puro
 */
export async function exportRepuestosToPDF(
  repuestos: Repuesto[],
  options: ExportPDFOptions = {}
): Promise<void> {
  const {
    machineName = 'Máquina',
    includeStats = true,
  } = options

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

  // Estadísticas de catálogo
  if (includeStats) {
    const totalRepuestos = repuestos.length
    const conFicha = repuestos.filter(r => r.technicalSpecs).length
    const conFoto = repuestos.filter(r => (r.fotosReales?.length || 0) + (r.imagenesManual?.length || 0) + (r.gallery?.length || 0) > 0).length
    const valorReferencial = repuestos.reduce((sum, r) => sum + ((r.cantidadPorMaquina || 1) * (r.valorUnitario || 0)), 0)

    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('Estadísticas del Catálogo', 14, yPosition)
    yPosition += 7

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Total de Repuestos: ${totalRepuestos}`, 14, yPosition)
    yPosition += 5
    doc.text(`Con Ficha Técnica: ${conFicha}`, 14, yPosition)
    yPosition += 5
    doc.text(`Con Foto/Manual: ${conFoto}`, 14, yPosition)
    yPosition += 5
    doc.text(`Valor Referencial Total: $${valorReferencial.toLocaleString('es-CL')}`, 14, yPosition)
    yPosition += 10
  }

  // Tabla principal
  const tableData = repuestos.map(rep => [
    rep.codigoSAP || '-',
    rep.textoBreve || '-',
    rep.codigoBaader || '-',
    (rep.cantidadPorMaquina || 0).toString(),
    rep.valorUnitario ? `$${rep.valorUnitario.toLocaleString('es-CL')}` : '-',
    rep.ubicacionEnPlanta || '-',
  ])

  autoTable(doc, {
    head: [['Código SAP', 'Repuesto', 'Cód. Fabricante', 'Cant/Máq', 'Valor Unit.', 'Ubicación']],
    body: tableData,
    startY: yPosition,
    theme: 'striped',
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 10,
    },
    bodyStyles: { fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 80 },
      2: { cellWidth: 30 },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 40 },
    },
    margin: { left: 14, right: 14 },
  })

  // Pie de página
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

  const timestamp = new Date().toISOString().slice(0, 10)
  doc.save(`Repuestos_${machineName.replace(/\s+/g, '_')}_${timestamp}.pdf`)
}

/**
 * @deprecated Tags eliminados en catálogo puro. Exporta catálogo estándar.
 */
export async function exportTagsReportToPDF(
  repuestos: Repuesto[],
  machineName: string = 'Máquina'
): Promise<void> {
  return exportRepuestosToPDF(repuestos, { machineName, includeStats: true })
}
