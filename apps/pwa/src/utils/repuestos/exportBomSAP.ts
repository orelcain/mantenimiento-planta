import * as XLSX from 'xlsx'
import type { Repuesto } from '@/types/repuestos'

/**
 * Exportador de Lista de Materiales de Equipo para SAP PM (transacción IB01).
 *
 * Contexto: los nodos `720004…` de `hierarchy` son NÚMEROS DE EQUIPO en SAP, así que la
 * transacción es IB01 (BOM de equipo), no IB11 (BOM de ubicación técnica).
 *
 * Reglas que impone SAP y que aquí se respetan:
 * - Uso de lista = 4 (Mantenimiento).
 * - El Centro es parte de la cabecera: Chonchi y Yal son centros distintos, así que un
 *   mismo modelo de máquina en las dos plantas produce DOS BOM distintas.
 * - Categoría de posición: `L` = material de stock (exige código en el maestro MM),
 *   `T` = posición de texto (para el despiece sin código SAP).
 * - El texto de posición de SAP admite 40 caracteres.
 */

/** Largo máximo del texto breve de posición en SAP. */
export const SAP_TEXTO_POSICION_MAX = 40

/** Uso de lista de materiales: 4 = Mantenimiento (PM). */
export const SAP_USO_MANTENIMIENTO = '4'

export type SapItemCategory = 'L' | 'T'

export interface BomIB01Row {
  /** Nº de posición SAP, en decenas: 0010, 0020, … */
  posicion: string
  categoria: SapItemCategory
  /** Código SAP del material. Vacío en las posiciones de texto. */
  material: string
  cantidad: number
  unidad: string
  /** Texto de posición, ya truncado al límite de SAP. */
  texto: string
  /** Texto completo sin truncar, como referencia para quien carga. */
  textoCompleto: string
  codigoFabricante: string
}

export interface BomIB01Header {
  equipoCodigo: string
  equipoNombre: string
  centro: string
  uso: string
  validoDesde: string
}

export interface BomIB01Resumen {
  total: number
  posicionesL: number
  posicionesT: number
  /** Posiciones que quedaron en cantidad 1 por no tener dato real. */
  sinCantidadReal: number
  textosTruncados: number
}

export interface BomIB01 {
  header: BomIB01Header
  rows: BomIB01Row[]
  resumen: BomIB01Resumen
}

export interface BuildBomOptions {
  equipoCodigo: string
  equipoNombre: string
  centro: string
  /** Incluir el despiece sin código SAP como posiciones de texto. Por defecto, no. */
  incluirSinSap?: boolean
  /** Fecha de validez (YYYY-MM-DD). Por defecto, hoy. */
  validoDesde?: string
}

/** Unidades nuestras → unidades de medida de SAP. Lo no mapeado pasa tal cual. */
const UNIDAD_SAP: Record<string, string> = {
  UN: 'ST', UND: 'ST', UNI: 'ST', PZA: 'ST', PZ: 'ST', EA: 'ST', '': 'ST',
  MT: 'M', MTS: 'M', METRO: 'M', METROS: 'M',
  LT: 'L', LTS: 'L', LITRO: 'L', LITROS: 'L',
  KG: 'KG', GR: 'G', M2: 'M2', M3: 'M3',
}

export function toUnidadSAP(unidad?: string): string {
  const key = (unidad || '').trim().toUpperCase()
  return UNIDAD_SAP[key] ?? (key || 'ST')
}

const tieneCodigoSap = (rep: Repuesto): boolean => /^\d{6,}$/.test((rep.codigoSAP || '').trim())

/**
 * Deriva el Centro a partir de los nombres de los ancestros del equipo en `hierarchy`.
 *
 * Ojo: los equipos se llaman IGUAL en las dos plantas (hay una "EVISCERADORA BAADER 142 N3"
 * en Chonchi y otra en Yal), así que el centro JAMÁS se puede sacar del nombre del equipo —
 * solo del árbol. Confundirlos significa cargar la BOM de una planta contra el centro de la otra.
 */
export function deriveCentro(nombresAncestros: string[]): string {
  const planta = nombresAncestros.find((n) =>
    (n || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase()
      .startsWith('PLANTA'),
  )
  // Sin un nodo "PLANTA …" explícito, el nivel 2 del árbol es el equivalente más cercano.
  return (planta ?? nombresAncestros[1] ?? '').trim()
}

/**
 * Construye la lista de materiales lista para IB01 a partir de los repuestos de un equipo.
 * Función pura: no toca red ni archivos.
 */
export function buildBomIB01(repuestos: Repuesto[], options: BuildBomOptions): BomIB01 {
  const {
    equipoCodigo,
    equipoNombre,
    centro,
    incluirSinSap = false,
    validoDesde = new Date().toISOString().slice(0, 10),
  } = options

  const conSap = repuestos.filter(tieneCodigoSap)
  const sinSap = incluirSinSap ? repuestos.filter((r) => !tieneCodigoSap(r)) : []

  // Las posiciones de stock van primero y ordenadas por código: así la lista queda estable
  // entre exportaciones y el que carga en SAP puede cotejar contra el maestro de materiales.
  const ordenadas = [
    ...conSap.sort((a, b) => (a.codigoSAP || '').localeCompare(b.codigoSAP || '')),
    ...sinSap.sort((a, b) => (a.textoBreve || '').localeCompare(b.textoBreve || '', 'es')),
  ]

  let sinCantidadReal = 0
  let textosTruncados = 0

  const rows: BomIB01Row[] = ordenadas.map((rep, i) => {
    const esL = tieneCodigoSap(rep)
    const cantidadReal = Number(rep.cantidadPorMaquina)
    const tieneCantidad = Number.isFinite(cantidadReal) && cantidadReal > 0
    if (!tieneCantidad) sinCantidadReal++

    const textoCompleto = (rep.textoBreve || rep.descripcion || '').trim()
    // En una posición de texto el código de fabricante es lo único que identifica la pieza,
    // así que va adelante para que sobreviva al truncado de 40 caracteres.
    const base = !esL && rep.codigoFabricante
      ? (rep.codigoFabricante + ' ' + textoCompleto).trim()
      : textoCompleto
    if (base.length > SAP_TEXTO_POSICION_MAX) textosTruncados++

    return {
      posicion: String((i + 1) * 10).padStart(4, '0'),
      categoria: esL ? 'L' : 'T',
      material: esL ? (rep.codigoSAP || '').trim() : '',
      cantidad: tieneCantidad ? cantidadReal : 1,
      unidad: toUnidadSAP(rep.unidad),
      texto: base.slice(0, SAP_TEXTO_POSICION_MAX),
      textoCompleto: base,
      codigoFabricante: (rep.codigoFabricante || '').trim(),
    }
  })

  return {
    header: { equipoCodigo, equipoNombre, centro, uso: SAP_USO_MANTENIMIENTO, validoDesde },
    rows,
    resumen: {
      total: rows.length,
      posicionesL: rows.filter((r) => r.categoria === 'L').length,
      posicionesT: rows.filter((r) => r.categoria === 'T').length,
      sinCantidadReal,
      textosTruncados,
    },
  }
}

/** Nombre de archivo sin acentos ni caracteres que rompan en Windows. */
export function bomFileName(header: BomIB01Header): string {
  const slug = (header.equipoNombre || 'equipo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'equipo'
  return 'BOM_IB01_' + header.equipoCodigo + '_' + slug + '_' + header.validoDesde + '.xlsx'
}

/** Escribe el .xlsx: hoja "Cabecera IB01" + hoja "Posiciones". */
export function exportBomIB01ToExcel(bom: BomIB01): void {
  const { header, rows, resumen } = bom

  const cabecera = [
    { Campo: 'Transacción', Valor: 'IB01 — Lista de materiales de equipo' },
    { Campo: 'Equipo', Valor: header.equipoCodigo },
    { Campo: 'Denominación', Valor: header.equipoNombre },
    { Campo: 'Centro', Valor: header.centro },
    { Campo: 'Uso de lista', Valor: header.uso + ' (Mantenimiento)' },
    { Campo: 'Válido desde', Valor: header.validoDesde },
    { Campo: '', Valor: '' },
    { Campo: 'Total posiciones', Valor: resumen.total },
    { Campo: '· tipo L (material de stock)', Valor: resumen.posicionesL },
    { Campo: '· tipo T (texto, sin código SAP)', Valor: resumen.posicionesT },
    { Campo: 'Posiciones sin cantidad real (quedaron en 1)', Valor: resumen.sinCantidadReal },
    { Campo: 'Textos truncados a 40 caracteres', Valor: resumen.textosTruncados },
  ]

  const posiciones = rows.map((r) => ({
    'Posición': r.posicion,
    'Categoría': r.categoria,
    'Material': r.material,
    'Cantidad': r.cantidad,
    'UM': r.unidad,
    'Texto de posición': r.texto,
    'Texto completo': r.textoCompleto,
    'Código fabricante': r.codigoFabricante,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cabecera), 'Cabecera IB01')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(posiciones), 'Posiciones')
  XLSX.writeFile(wb, bomFileName(header))
}
