import * as XLSX from 'xlsx'
import type { Repuesto } from '@/types/repuestos'
import { isTagAsignado, getTagNombre, getTotalCantidadesRepuesto } from '@/types/tags'

interface ExportOptions {
  machineName?: string
  includeTags?: boolean
  includeImages?: boolean
}

/**
 * Exporta repuestos a Excel con múltiples hojas:
 * - Hoja 1: Datos principales de repuestos
 * - Hoja 2: Resumen por tags
 * - Hoja 3: Estadísticas generales
 */
export async function exportRepuestosToExcel(
  repuestos: Repuesto[],
  options: ExportOptions = {}
): Promise<void> {
  const {
    machineName = 'Máquina',
    includeTags = true,
    includeImages = true,
  } = options

  // Hoja 1: Datos principales
  const mainData = repuestos.map((rep) => {
    const totals = getTotalCantidadesRepuesto(rep)
    
    const row: Record<string, any> = {
      'Código SAP': rep.codigoSAP || '',
      'Texto Breve': rep.textoBreve || '',
      'Descripción': rep.descripcion || '',
      'Código Baader': rep.codigoBaader || '',
      'Valor Unitario': rep.valorUnitario || 0,
      'Stock (Total)': totals.stock,
      'Solicitudes (Total)': totals.solicitud,
      'Valor Stock': totals.stock * (rep.valorUnitario || 0),
    }

    // Tags individuales
    if (includeTags && Array.isArray(rep.tags)) {
      const solicitudTags: string[] = []
      const stockTags: string[] = []
      
      rep.tags.forEach(tag => {
        if (isTagAsignado(tag)) {
          const label = `${getTagNombre(tag)} (${tag.cantidad})`
          if (tag.tipo === 'solicitud') {
            solicitudTags.push(label)
          } else {
            stockTags.push(label)
          }
        }
      })

      row['Tags Solicitud'] = solicitudTags.join(', ')
      row['Tags Stock'] = stockTags.join(', ')
    }

    // Imágenes
    if (includeImages) {
      const imagenesCount = (rep.imagenesManual?.length || 0) + (rep.fotosReales?.length || 0)
      row['Imágenes'] = imagenesCount
      row['Vínculos PDF'] = rep.vinculosManual?.length || 0
    }

    return row
  })

  // Hoja 2: Resumen por tags
  let tagsSummary: Record<string, any>[] = []
  if (includeTags) {
    const tagsMap = new Map<string, { tipo: 'solicitud' | 'stock'; cantidad: number; repuestos: number }>()

    repuestos.forEach(rep => {
      if (Array.isArray(rep.tags)) {
        rep.tags.forEach(tag => {
          if (isTagAsignado(tag)) {
            const nombre = getTagNombre(tag)
            const existing = tagsMap.get(nombre)
            
            if (existing) {
              existing.cantidad += tag.cantidad || 0
              existing.repuestos += 1
            } else {
              tagsMap.set(nombre, {
                tipo: tag.tipo,
                cantidad: tag.cantidad || 0,
                repuestos: 1,
              })
            }
          }
        })
      }
    })

    tagsSummary = Array.from(tagsMap.entries()).map(([nombre, data]) => ({
      'Tag': nombre,
      'Tipo': data.tipo === 'solicitud' ? 'Solicitud' : 'Stock',
      'Cantidad Total': data.cantidad,
      'Repuestos Asociados': data.repuestos,
    }))
  }

  // Hoja 3: Estadísticas
  const totalRepuestos = repuestos.length
  const conStock = repuestos.filter(r => getTotalCantidadesRepuesto(r).stock > 0).length
  const conSolicitudes = repuestos.filter(r => getTotalCantidadesRepuesto(r).solicitud > 0).length
  const valorTotalStock = repuestos.reduce((sum, r) => {
    const stock = getTotalCantidadesRepuesto(r).stock
    return sum + (stock * (r.valorUnitario || 0))
  }, 0)

  const stats = [
    { 'Métrica': 'Total Repuestos', 'Valor': totalRepuestos },
    { 'Métrica': 'Con Stock', 'Valor': conStock },
    { 'Métrica': 'Con Solicitudes', 'Valor': conSolicitudes },
    { 'Métrica': 'Valor Total Stock', 'Valor': valorTotalStock },
    { 'Métrica': 'Promedio Valor Unitario', 'Valor': totalRepuestos > 0 ? (valorTotalStock / totalRepuestos).toFixed(2) : 0 },
  ]

  // Crear workbook
  const wb = XLSX.utils.book_new()

  // Agregar hojas
  const ws1 = XLSX.utils.json_to_sheet(mainData)
  XLSX.utils.book_append_sheet(wb, ws1, 'Repuestos')

  if (includeTags && tagsSummary.length > 0) {
    const ws2 = XLSX.utils.json_to_sheet(tagsSummary)
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen Tags')
  }

  const ws3 = XLSX.utils.json_to_sheet(stats)
  XLSX.utils.book_append_sheet(wb, ws3, 'Estadísticas')

  // Auto-ajustar columnas (aproximado)
  const wscols = [
    { wch: 15 }, // Código SAP
    { wch: 30 }, // Texto Breve
    { wch: 40 }, // Descripción
    { wch: 12 }, // Unidad
    { wch: 12 }, // Valor
    { wch: 10 }, // Stock
    { wch: 12 }, // Solicitudes
    { wch: 15 }, // Valor Stock
  ]
  ws1['!cols'] = wscols

  // Generar archivo
  const timestamp = new Date().toISOString().slice(0, 10)
  const filename = `Repuestos_${machineName.replace(/\s+/g, '_')}_${timestamp}.xlsx`
  
  XLSX.writeFile(wb, filename)
}

/**
 * Exporta un resumen simple de cantidades para importación
 */
export function exportCantidadesTemplate(repuestos: Repuesto[]): void {
  const data = repuestos.map(rep => ({
    'Código SAP': rep.codigoSAP || '',
    'Texto Breve': rep.textoBreve || '',
    'Cantidad Stock': getTotalCantidadesRepuesto(rep).stock,
    'Cantidad Solicitud': getTotalCantidadesRepuesto(rep).solicitud,
    'Tag': '', // Para editar
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Cantidades')

  const timestamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `Plantilla_Cantidades_${timestamp}.xlsx`)
}
