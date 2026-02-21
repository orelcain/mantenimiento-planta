import * as XLSX from 'xlsx'
import type { Repuesto } from '@/types/repuestos'

interface ExportOptions {
  machineName?: string
  includeImages?: boolean
  /** @deprecated ya no se usa en catálogo puro */
  includeTags?: boolean
}

/**
 * Exporta repuestos a Excel — Catálogo puro
 * - Hoja 1: Datos principales de repuestos
 * - Hoja 2: Estadísticas generales
 */
export async function exportRepuestosToExcel(
  repuestos: Repuesto[],
  options: ExportOptions = {}
): Promise<void> {
  const {
    machineName = 'Máquina',
    includeImages = true,
  } = options

  // Hoja 1: Datos principales
  const mainData = repuestos.map((rep) => {
    const row: Record<string, any> = {
      'Código SAP': rep.codigoSAP || '',
      'Texto Breve': rep.textoBreve || '',
      'Descripción': rep.descripcion || '',
      'Código Fabricante': rep.codigoBaader || '',
      'Valor Unitario': rep.valorUnitario || 0,
      'Cant/Máquina': rep.cantidadPorMaquina || 0,
      'Ubicación': rep.ubicacionEnPlanta || '',
      'Valor Referencial': (rep.cantidadPorMaquina || 1) * (rep.valorUnitario || 0),
    }

    if (includeImages) {
      const imagenesCount = (rep.imagenesManual?.length || 0) + (rep.fotosReales?.length || 0) + (rep.gallery?.length || 0)
      row['Imágenes'] = imagenesCount
      row['Vínculos PDF'] = rep.vinculosManual?.length || 0
      row['Ficha Técnica'] = rep.technicalSpecs ? 'Sí' : 'No'
    }

    return row
  })

  // Hoja 2: Estadísticas de catálogo
  const totalRepuestos = repuestos.length
  const conFicha = repuestos.filter(r => r.technicalSpecs).length
  const conFoto = repuestos.filter(r => (r.fotosReales?.length || 0) + (r.imagenesManual?.length || 0) + (r.gallery?.length || 0) > 0).length
  const conManual = repuestos.filter(r => (r.vinculosManual?.length || 0) > 0).length
  const valorReferencial = repuestos.reduce((sum, r) => sum + ((r.cantidadPorMaquina || 1) * (r.valorUnitario || 0)), 0)

  const stats = [
    { 'Métrica': 'Total Repuestos', 'Valor': totalRepuestos },
    { 'Métrica': 'Con Ficha Técnica', 'Valor': conFicha },
    { 'Métrica': 'Con Foto/Manual', 'Valor': conFoto },
    { 'Métrica': 'Con Vínculo a PDF', 'Valor': conManual },
    { 'Métrica': 'Valor Referencial Total', 'Valor': valorReferencial },
  ]

  // Crear workbook
  const wb = XLSX.utils.book_new()

  const ws1 = XLSX.utils.json_to_sheet(mainData)
  XLSX.utils.book_append_sheet(wb, ws1, 'Repuestos')

  const ws2 = XLSX.utils.json_to_sheet(stats)
  XLSX.utils.book_append_sheet(wb, ws2, 'Estadísticas')

  // Auto-ajustar columnas
  ws1['!cols'] = [
    { wch: 15 },  // Código SAP
    { wch: 30 },  // Texto Breve
    { wch: 40 },  // Descripción
    { wch: 15 },  // Cód Fabricante
    { wch: 12 },  // Valor Unit
    { wch: 12 },  // Cant/Máq
    { wch: 25 },  // Ubicación
    { wch: 15 },  // Valor Ref
  ]

  const timestamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Repuestos_${machineName.replace(/\s+/g, '_')}_${timestamp}.xlsx`)
}

/**
 * Exporta una plantilla de importación para catálogo
 */
export function exportCantidadesTemplate(repuestos: Repuesto[]): void {
  const data = repuestos.map(rep => ({
    'Código SAP': rep.codigoSAP || '',
    'Texto Breve': rep.textoBreve || '',
    'Código Fabricante': rep.codigoBaader || '',
    'Valor Unitario': rep.valorUnitario || 0,
    'Cant/Máquina': rep.cantidadPorMaquina || 0,
    'Ubicación': rep.ubicacionEnPlanta || '',
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Catálogo')

  const timestamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Plantilla_Catalogo_${timestamp}.xlsx`)
}
