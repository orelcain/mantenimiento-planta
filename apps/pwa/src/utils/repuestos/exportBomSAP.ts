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

/**
 * Marca de codigo SAP obsoleto en el texto del material.
 *
 * "(NO USAR)" significa "no comprar contra este codigo", NO "material inservible": muchos
 * tienen stock fisico real, por eso se conservan en el maestro. Aqui NO se excluyen de la
 * BOM — se CUENTAN, para que quien carga en SAP lo vea y decida. Excluirlos en silencio
 * seria tomar por el una decision que ya esta tomada al reves.
 */
const MARCA_OBSOLETO = /\(NO USAR\)/i

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
  /** Posiciones que salieron con la UM por defecto porque el material no traia unidad. */
  unidadAsumida: number
  /** Posiciones cuyo material esta marcado como codigo SAP obsoleto. */
  obsoletos: number
  /**
   * Materiales que aparecen mas de una vez en ESTA misma lista. SAP rebota la carga entera
   * si una BOM trae el mismo material repetido, y nada mas lo detectaria antes de intentarlo.
   */
  materialesDuplicados: number
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

/**
 * El corte entre la lista de materiales y el resto: **tener codigo SAP**.
 *
 * No hay que inventar un criterio — un repuesto con codigo es un material que
 * existe en SAP y se puede pedir; uno sin codigo es despiece del fabricante,
 * sirve para identificar la pieza en el plano y nada mas. Medido en la Baader
 * 142: de 1.804 repuestos ligados, **476 tienen codigo** y son la BOM.
 *
 * Lo usa tambien el expediente del equipo, para mostrar la BOM antes que el
 * despiece. Una sola definicion del corte.
 */
export const esCodigoSapValido = (codigo?: string): boolean => /^\d{6,}$/.test((codigo || '').trim())

const tieneCodigoSap = (rep: Repuesto): boolean => esCodigoSapValido(rep.codigoSAP)

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
  let obsoletos = 0
  let unidadAsumida = 0

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
    if (MARCA_OBSOLETO.test(textoCompleto)) obsoletos++
    // Sin unidad en el maestro la posicion sale como pieza. Es un default sensato para un
    // repuesto, pero el que carga tiene que poder revisar cuales se asumieron: un material
    // que se pide por metro cargado como pieza hace pedir 1 unidad de algo que va en rollo.
    if (!String(rep.unidad || '').trim()) unidadAsumida++

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

  const materiales = rows.filter((r) => r.material).map((r) => r.material)
  const materialesDuplicados = materiales.length - new Set(materiales).size

  return {
    header: { equipoCodigo, equipoNombre, centro, uso: SAP_USO_MANTENIMIENTO, validoDesde },
    rows,
    resumen: {
      total: rows.length,
      posicionesL: rows.filter((r) => r.categoria === 'L').length,
      posicionesT: rows.filter((r) => r.categoria === 'T').length,
      sinCantidadReal,
      textosTruncados,
      unidadAsumida,
      obsoletos,
      materialesDuplicados,
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
    { Campo: 'Posiciones con UM asumida (el material no traia unidad)', Valor: resumen.unidadAsumida },
    { Campo: 'Materiales con codigo OBSOLETO (NO USAR)', Valor: resumen.obsoletos },
    { Campo: 'Materiales REPETIDOS en esta lista (SAP la rechaza)', Valor: resumen.materialesDuplicados },
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

/* ------------------------------------------------------------------ *
 * Exportación masiva: varias BOM en un solo archivo                   *
 * ------------------------------------------------------------------ */

/** Un equipo del árbol, ya resuelto a su identidad SAP. */
export interface EquipoSap {
  /** docId del nodo en `hierarchy` — es lo que guarda `repuesto.equipos[]`. */
  id: string
  codigo: string
  nombre: string
  centro: string
}

/**
 * Arma una BOM por equipo a partir del catálogo completo del alcance.
 *
 * Un mismo repuesto pertenece a varios equipos (relación N:M por modelo de máquina), así que
 * aparece en la BOM de cada uno: en SAP cada equipo lleva su propia lista. Los equipos que no
 * tienen ninguna posición se omiten — una BOM vacía no se puede cargar.
 */
export function buildBomsIB01(
  repuestos: Repuesto[],
  equipos: EquipoSap[],
  options: { incluirSinSap?: boolean; validoDesde?: string } = {},
): BomIB01[] {
  // Índice en UNA pasada sobre el catálogo. Filtrar el array por cada equipo sería
  // O(repuestos × equipos) — con ~7.700 repuestos y cientos de equipos eso cuelga la pestaña.
  const porEquipo = new Map<string, Repuesto[]>()
  const buscados = new Set(equipos.filter((e) => e.codigo).map((e) => e.id))
  for (const r of repuestos) {
    if (!Array.isArray(r.equipos)) continue
    for (const id of r.equipos) {
      if (!buscados.has(id)) continue
      const lista = porEquipo.get(id)
      if (lista) lista.push(r)
      else porEquipo.set(id, [r])
    }
  }

  const boms: BomIB01[] = []
  for (const eq of equipos) {
    if (!eq.codigo) continue
    const delEquipo = porEquipo.get(eq.id)
    if (!delEquipo || delEquipo.length === 0) continue
    const bom = buildBomIB01(delEquipo, {
      equipoCodigo: eq.codigo,
      equipoNombre: eq.nombre,
      centro: eq.centro,
      ...options,
    })
    if (bom.rows.length > 0) boms.push(bom)
  }
  return boms
}

export interface BomsMasivasResumen {
  equipos: number
  posiciones: number
  posicionesL: number
  posicionesT: number
  sinCantidadReal: number
  unidadAsumida: number
  obsoletos: number
  materialesDuplicados: number
  centros: string[]
}

export function resumirBoms(boms: BomIB01[]): BomsMasivasResumen {
  return {
    equipos: boms.length,
    posiciones: boms.reduce((n, b) => n + b.resumen.total, 0),
    posicionesL: boms.reduce((n, b) => n + b.resumen.posicionesL, 0),
    posicionesT: boms.reduce((n, b) => n + b.resumen.posicionesT, 0),
    sinCantidadReal: boms.reduce((n, b) => n + b.resumen.sinCantidadReal, 0),
    unidadAsumida: boms.reduce((n, b) => n + b.resumen.unidadAsumida, 0),
    obsoletos: boms.reduce((n, b) => n + b.resumen.obsoletos, 0),
    materialesDuplicados: boms.reduce((n, b) => n + b.resumen.materialesDuplicados, 0),
    centros: [...new Set(boms.map((b) => b.header.centro).filter(Boolean))].sort(),
  }
}

export function bomsFileName(boms: BomIB01[], fecha?: string): string {
  const f = fecha || boms[0]?.header.validoDesde || new Date().toISOString().slice(0, 10)
  return 'BOM_IB01_MASIVO_' + boms.length + '_equipos_' + f + '.xlsx'
}

/**
 * Escribe todas las BOM en UN archivo, con las posiciones en una hoja plana.
 *
 * Plano y no una hoja por equipo a propósito: así es como lo espera una carga masiva
 * (LSMW / LTMC), que lee una fila por posición con el equipo y el centro como columnas.
 * Una hoja por equipo obligaría a recomponer el archivo a mano antes de cargarlo.
 */
export function exportBomsIB01ToExcel(boms: BomIB01[], fecha?: string): void {
  const cabeceras = boms.map((b) => ({
    'Equipo': b.header.equipoCodigo,
    'Denominación': b.header.equipoNombre,
    'Centro': b.header.centro,
    'Uso de lista': b.header.uso,
    'Válido desde': b.header.validoDesde,
    'Posiciones': b.resumen.total,
    'Tipo L': b.resumen.posicionesL,
    'Tipo T': b.resumen.posicionesT,
    'Sin cantidad real': b.resumen.sinCantidadReal,
    'UM asumida': b.resumen.unidadAsumida,
    'Obsoletos (NO USAR)': b.resumen.obsoletos,
    'Materiales repetidos': b.resumen.materialesDuplicados,
  }))

  const posiciones = boms.flatMap((b) =>
    b.rows.map((r) => ({
      'Equipo': b.header.equipoCodigo,
      'Centro': b.header.centro,
      'Posición': r.posicion,
      'Categoría': r.categoria,
      'Material': r.material,
      'Cantidad': r.cantidad,
      'UM': r.unidad,
      'Texto de posición': r.texto,
      'Texto completo': r.textoCompleto,
      'Código fabricante': r.codigoFabricante,
    })),
  )

  const r = resumirBoms(boms)
  const resumen = [
    { Campo: 'Transacción', Valor: 'IB01 — Listas de materiales de equipo (carga masiva)' },
    { Campo: 'Uso de lista', Valor: SAP_USO_MANTENIMIENTO + ' (Mantenimiento)' },
    { Campo: 'Equipos', Valor: r.equipos },
    { Campo: 'Centros', Valor: r.centros.join(' · ') },
    { Campo: 'Total posiciones', Valor: r.posiciones },
    { Campo: '· tipo L (material de stock)', Valor: r.posicionesL },
    { Campo: '· tipo T (texto, sin código SAP)', Valor: r.posicionesT },
    { Campo: 'Posiciones sin cantidad real (quedaron en 1)', Valor: r.sinCantidadReal },
    { Campo: 'Posiciones con UM asumida (el material no traia unidad)', Valor: r.unidadAsumida },
    { Campo: 'Materiales con codigo OBSOLETO (NO USAR)', Valor: r.obsoletos },
    { Campo: 'Materiales REPETIDOS dentro de una lista (SAP la rechaza)', Valor: r.materialesDuplicados },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cabeceras), 'Cabeceras IB01')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(posiciones), 'Posiciones')
  XLSX.writeFile(wb, bomsFileName(boms, fecha))
}
