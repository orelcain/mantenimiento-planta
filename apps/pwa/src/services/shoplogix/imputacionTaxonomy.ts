/**
 * imputacionTaxonomy — el árbol OFICIAL de imputación de fallas.
 *
 * Fuente: "Capacitación de Imputación de Fallas V12" (Roger Tornavaca Castañeda),
 * el curso con el que se capacita a los supervisores para anotar las detenciones
 * en Shoplogix. 6 categorías, 46 hojas. Esta es la estructura que ellos aprenden
 * y la que deben usar al imputar, así que es la que la app debe hablar.
 *
 * ── El problema que resuelve este archivo ────────────────────────────────────
 * Shoplogix NO nos manda la ruta del árbol: manda la HOJA sola, en mayúsculas y
 * sin acentos, con `name` siempre "Detencion"/"Micro Detencion" (verificado
 * contra Firestore, Yal 2026-07 y 2026-08). O sea llega "MOTORES", no
 * "Falla Eléctrica > Baader 142 > Motores".
 *
 * Consecuencia: seis hojas viven en DOS categorías a la vez (Balanzas, Bombas,
 * Cintas, Estación de Calidad, Grader, Motores existen tanto en Falla Eléctrica
 * como en Falla Mecánica) y desde el reason plano son indistinguibles. Por eso
 * `categorias` es un array: cuando trae 2, el dato no alcanza para decidir y hay
 * que decirlo en la UI en vez de inventar una categoría. Para la CASCADA da
 * igual — eléctrica y mecánica caen ambas en el bucket `mantencion` — pero para
 * el Pareto "eléctrica vs mecánica" que pide el curso, no.
 *
 * ── Extensiones ─────────────────────────────────────────────────────────────
 * El curso cubre la Baader 142 de Yal. Filete tiene una Baader 200 con otros
 * componentes, así que al final del array hay hojas marcadas `extension`. NO
 * son del curso y no se cuentan como tales: `TOTAL_HOJAS_CURSO` sigue diciendo
 * 46 y el árbol dibujable no las muestra.
 *
 * ── Reglas de matching ──────────────────────────────────────────────────────
 * El reason se normaliza (mayúsculas, sin acentos, separadores y espacios
 * colapsados) y se busca EXACTO primero, substring después. El orden importa:
 * con substring suelto "CAMBIO LOTE / MMPP" caía en la regla de "MMPP" y se
 * contaba como falta de materia prima.
 */

import type { LossBucket } from './lossBuckets'

export type ImputacionCategoria =
  | 'abastecimiento'
  | 'electrica'
  | 'mecanica'
  | 'mmpp'
  | 'operacional'
  | 'programado'

/**
 * `label` es el nombre usable en una fila de tabla; `oficial` es el título
 * textual del curso (se muestra en la vista del árbol, donde hay espacio);
 * `short` es para chips.
 */
export const CATEGORIA_META: Record<ImputacionCategoria, { label: string; oficial: string; short: string }> = {
  abastecimiento: { label: 'Abastecimiento / Servicios', oficial: 'Falla Abastecimiento / Servicios', short: 'Abastecimiento' },
  electrica:      { label: 'Falla Eléctrica',            oficial: 'Falla Eléctrica',                  short: 'Eléctrica' },
  mecanica:       { label: 'Falla Mecánica',             oficial: 'Falla Mecánica',                   short: 'Mecánica' },
  mmpp:           { label: 'MMPP',                       oficial: 'MMPP',                             short: 'MMPP' },
  operacional:    { label: 'Operacionales',              oficial: 'Operacionales',                    short: 'Operacional' },
  programado:     { label: 'Paros Programados',          oficial: 'Paros Programados',                short: 'Programado' },
}

export interface ImputacionLeaf {
  /** Etiqueta oficial del curso, acentuada, para mostrar. */
  label: string
  /**
   * Categorías del árbol donde existe esta hoja. Largo 2 = el reason plano de
   * Shoplogix no permite distinguir cuál de las dos fue.
   */
  categorias: ImputacionCategoria[]
  /** Dueño de la pérdida en la cascada del turno. */
  bucket: Exclude<LossBucket, 'produccion'>
  /** Equipo al que el curso amarra la hoja, cuando lo especifica. */
  equipo?: 'baader142' | 'baader200' | 'auxiliar'
  /**
   * Hoja que NO está en el curso: la agregamos nosotros para una máquina que la
   * V12 no cubre. No cuenta en `TOTAL_HOJAS_CURSO` ni se dibuja en el árbol —
   * presentar como oficial algo que no lo es sería exactamente el error que la
   * app ya evita en otros lados.
   */
  extension?: 'filete-baader200'
  /** Formas normalizadas con las que puede llegar el reason desde Shoplogix. */
  match: string[]
}

/** Normaliza un reason para comparar: mayúsculas, sin acentos, separadores parejos. */
export function normalizeReason(raw: string | undefined | null): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // fuera acentos
    .toUpperCase()
    .replace(/[/|>]/g, ' / ')          // "CAMBIO LOTE/MMPP" y "A > B" quedan parejos
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Las 46 hojas del curso.
 *
 * `bucket` traduce la categoría del curso al dueño que usa la cascada:
 *   abastecimiento → externo      (servicio que le falta a la máquina)
 *   eléctrica/mecánica → mantencion
 *   mmpp → externo                (flujo de producto, la máquina está sana)
 *   operacional → según la hoja   (la mayoría es del proceso; ver DECISIONES)
 *   programado → planificado
 */
export const IMPUTACION_LEAVES: ImputacionLeaf[] = [
  // ── 1. Falla Abastecimiento / Servicios ──────────────────────────────────
  { label: 'Agua',              categorias: ['abastecimiento'], bucket: 'externo', match: ['AGUA'] },
  { label: 'Aire',              categorias: ['abastecimiento'], bucket: 'externo', match: ['AIRE'] },
  { label: 'Energía',           categorias: ['abastecimiento'], bucket: 'externo', match: ['ENERGIA'] },
  { label: 'Flow Ice',          categorias: ['abastecimiento'], bucket: 'externo', match: ['FLOW ICE', 'FLOWICE'] },
  { label: 'Innova',            categorias: ['abastecimiento'], bucket: 'externo', match: ['INNOVA'] },
  { label: 'Insumos / Bodegas', categorias: ['abastecimiento'], bucket: 'externo', match: ['INSUMOS / BODEGAS', 'INSUMOS', 'BODEGAS'] },
  { label: 'SAP',               categorias: ['abastecimiento'], bucket: 'externo', match: ['SAP'] },

  // ── 2/3. Falla Eléctrica y Mecánica ──────────────────────────────────────
  // Inequívocas: viven en una sola categoría.
  { label: 'Lógica',                 categorias: ['electrica'], bucket: 'mantencion', equipo: 'baader142', match: ['LOGICA', 'BAADER 142 / LOGICA'] },
  { label: 'Ciclón',                 categorias: ['electrica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['CICLON'] },
  { label: 'Correas',                categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'baader142', match: ['CORREAS', 'CORREA'] },
  { label: 'Cuchillos / Guillotinas', categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader142', match: ['CUCHILLOS / GUILLOTINAS', 'CUCHILLOS', 'GUILLOTINAS'] },
  { label: 'Pernos / Resortes',      categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'baader142', match: ['PERNOS / RESORTES', 'PERNOS', 'RESORTES'] },
  { label: 'Punto Cero',             categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'baader142', match: ['PUNTO CERO'] },
  { label: 'Knuro',                  categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'auxiliar',  match: ['KNURO'] },

  // Ambiguas: el curso las tiene en eléctrica Y mecánica; el reason plano no
  // dice cuál. Mismo bucket, así que la cascada no sufre — el Pareto sí.
  { label: 'Motores',              categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'baader142', match: ['MOTORES', 'MOTOR'] },
  { label: 'Balanzas',             categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['BALANZAS', 'BALANZA'] },
  { label: 'Bombas',               categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['BOMBAS', 'BOMBA'] },
  { label: 'Cintas',               categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['CINTAS', 'CINTA'] },
  { label: 'Estación de Calidad',  categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['ESTACION DE CALIDAD', 'ESTACION CALIDAD'] },
  { label: 'Grader',               categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['GRADER'] },

  // ── 4. MMPP ──────────────────────────────────────────────────────────────
  { label: 'Acumulación rechazo',   categorias: ['mmpp'], bucket: 'externo', match: ['ACUMULACION RECHAZO', 'ACUMULACION DE RECHAZO'] },
  { label: 'Atascamiento',          categorias: ['mmpp'], bucket: 'externo', match: ['ATASCAMIENTO'] },
  { label: 'Falta MMPP',            categorias: ['mmpp'], bucket: 'externo', match: ['FALTA MMPP', 'FALTA DE MMPP'] },
  { label: 'Materia prima inactiva', categorias: ['mmpp'], bucket: 'externo', match: ['MATERIA PRIMA INACTIVA'] },

  // ── 5. Operacionales ─────────────────────────────────────────────────────
  { label: 'Ajuste mantenimiento',            categorias: ['operacional'], bucket: 'mantencion', match: ['AJUSTE MANTENIMIENTO', 'AJUSTE MANTENCION'] },
  { label: 'Trabajos contratistas / propios', categorias: ['operacional'], bucket: 'mantencion', match: ['TRABAJOS CONTRATISTAS / PROPIOS', 'TRABAJOS CONTRATISTAS', 'TRABAJOS PROPIOS'] },
  { label: 'Ajuste operador',                 categorias: ['operacional'], bucket: 'externo', match: ['AJUSTE OPERADOR'] },
  { label: 'Cambio lote / MMPP',              categorias: ['operacional'], bucket: 'externo', match: ['CAMBIO LOTE / MMPP', 'CAMBIO DE LOTE'] },
  { label: 'Contrastación',                   categorias: ['operacional'], bucket: 'externo', match: ['CONTRASTACION'] },
  { label: 'Emergencia / Evacuación',         categorias: ['operacional'], bucket: 'externo', match: ['EMERGENCIA / EVACUACION', 'EMERGENCIA', 'EVACUACION'] },
  { label: 'Falla operacional',               categorias: ['operacional'], bucket: 'externo', match: ['FALLA OPERACIONAL'] },
  { label: 'Liberación',                      categorias: ['operacional'], bucket: 'externo', match: ['LIBERACION'] },
  { label: 'Retraso aseo',                    categorias: ['operacional'], bucket: 'externo', match: ['RETRASO ASEO'] },
  { label: 'Tiempo de respuestas',            categorias: ['operacional'], bucket: 'externo', match: ['TIEMPO DE RESPUESTAS', 'TIEMPO DE RESPUESTA'] },

  // ── 6. Paros Programados ─────────────────────────────────────────────────
  { label: 'Cambio turno',                   categorias: ['programado'], bucket: 'planificado', match: ['CAMBIO TURNO', 'CAMBIO DE TURNO'] },
  { label: 'Colación',                       categorias: ['programado'], bucket: 'planificado', match: ['COLACION'] },
  { label: 'Detención programada',           categorias: ['programado'], bucket: 'planificado', match: ['DETENCION PROGRAMADA'] },
  { label: 'Ejercicio compensatorio - Paro', categorias: ['programado'], bucket: 'planificado', match: ['EJERCICIO COMPENSATORIO - PARO', 'EJERCICIO COMPENSATORIO'] },
  { label: 'Reunión inicio turno',           categorias: ['programado'], bucket: 'planificado', match: ['REUNION INICIO TURNO', 'REUNION DE INICIO DE TURNO'] },
  { label: 'Cumplimiento cuota',             categorias: ['programado'], bucket: 'externo', match: ['CUMPLIMIENTO CUOTA'] },

  /*
   * ── EXTENSIÓN · Filete / Baader 200 ─────────────────────────────────────
   *
   * El curso V12 se escribió para la Baader 142 de Yal: sus hojas mecánicas
   * nombran los componentes de ESA máquina. Filete tiene una Baader 200, que
   * manda otros nombres, y por eso 154 min de fallas mecánicas de los últimos
   * 12 turnos caían en "sin imputar" — justo los minutos que Mantención
   * necesita poder mostrar como suyos, y medir para ver si bajan.
   *
   * Verificado contra Firestore (shoplogix/filete/shifts, 12 turnos al 14-08):
   * CUCHILLERIA DORSAL 80 min · RASCADOR 47 · PUNZON 13 · Equipo Auxiliar/GEA 14.
   *
   * ⚠ Van marcadas `extension` a propósito: no son del curso. Decisión de Orel
   * el 14-08. Si algún día la V13 las incorpora, se les saca la marca.
   */
  { label: 'Cuchillería dorsal',   categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA DORSAL'] },
  { label: 'Cuchillería rascador', categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA RASCADOR'] },
  { label: 'Cuchillería punzón',   categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA PUNZON'] },
  // Cualquier otra cuchillería de la 200 que aparezca: mejor "cuchillería sin
  // detalle" que "sin imputar". Va DESPUÉS de las tres anteriores porque el
  // match por substring respeta el orden del array.
  { label: 'Cuchillería',          categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA'] },
  // GEA: la descamadora auxiliar de Filete. No es ninguna de las auxiliares del
  // curso (Ciclón, Knuro, Balanzas, Bombas, Cintas, Estación de Calidad, Grader).
  { label: 'GEA',                  categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar', extension: 'filete-baader200', match: ['EQUIPO AUXILIAR / GEA', 'GEA'] },
  /*
   * Filete anota `ACUMULACION` a secas (164 min / 38 eventos en 29 turnos de
   * jul-ago 2026); Chonchi usa `ACUMULACION RECHAZO` y Yal no usa ninguna.
   * Caia en "sin clasificar" — justo la pata de MMPP de Filete.
   *
   * Va como hoja propia y no como alias de "Acumulacion rechazo": desde el
   * reason plano no se puede afirmar que la acumulacion de Filete sea de
   * rechazo. Mismo bucket (`externo`), asi que la cascada no cambia; lo que se
   * evita es ponerle a un dato una etiqueta mas especifica de la que tiene.
   */
  { label: 'Acumulación',          categorias: ['mmpp'], bucket: 'externo', equipo: 'baader200', extension: 'filete-baader200', match: ['ACUMULACION'] },
]

/**
 * Reasons que NO son del árbol: los genera Shoplogix, no el supervisor.
 * "Planned Downtime" es el relleno con que Shoplogix rellena después del turno
 * y la ventana de consulta lo arrastra — no es tiempo del turno.
 */
const NO_TAXONOMIA: Array<{ match: string[]; bucket: Exclude<LossBucket, 'produccion'> }> = [
  { match: ['PLANNED DOWNTIME'], bucket: 'fuera-turno' },
]

export interface ImputacionMatch {
  leaf: ImputacionLeaf | null
  bucket: Exclude<LossBucket, 'produccion'> | null
  /** true cuando la hoja vive en 2 categorías y el reason no permite decidir. */
  ambigua: boolean
}

/**
 * Resuelve un reason crudo de Shoplogix contra el árbol.
 * Exacto primero, substring después — sin eso "CAMBIO LOTE / MMPP" se comía la
 * regla de "MMPP" y el cambio de lote se contaba como falta de materia prima.
 */
export function matchImputacion(rawReason: string | undefined | null): ImputacionMatch {
  const r = normalizeReason(rawReason)
  if (!r) return { leaf: null, bucket: null, ambigua: false }

  for (const n of NO_TAXONOMIA) {
    if (n.match.some((m) => r === m || r.includes(m))) return { leaf: null, bucket: n.bucket, ambigua: false }
  }
  for (const leaf of IMPUTACION_LEAVES) {
    if (leaf.match.some((m) => r === m)) {
      return { leaf, bucket: leaf.bucket, ambigua: leaf.categorias.length > 1 }
    }
  }
  for (const leaf of IMPUTACION_LEAVES) {
    if (leaf.match.some((m) => r.includes(m))) {
      return { leaf, bucket: leaf.bucket, ambigua: leaf.categorias.length > 1 }
    }
  }
  return { leaf: null, bucket: null, ambigua: false }
}

/** Etiqueta de categoría para mostrar; dice explícitamente cuándo no se puede distinguir. */
export function categoriaLabel(leaf: ImputacionLeaf | null): string {
  if (!leaf || leaf.categorias.length === 0) return 'Sin clasificar'
  return leaf.categorias.map((c) => CATEGORIA_META[c].short).join(' o ')
}

/**
 * El árbol dibujable: cada categoría con sus hojas, incluidas las que viven en
 * dos categorías (aparecen en ambas, como en el curso). Sirve para la vista de
 * referencia — 46 nodos en total.
 */
export function leavesByCategoria(): Array<{ categoria: ImputacionCategoria; label: string; hojas: ImputacionLeaf[] }> {
  return (Object.keys(CATEGORIA_META) as ImputacionCategoria[]).map((categoria) => ({
    categoria,
    label: CATEGORIA_META[categoria].oficial,
    // Sin las extensiones: esta vista dice "el árbol del curso" y tiene que
    // seguir siendo cierto.
    hojas: IMPUTACION_LEAVES.filter((l) => !l.extension && l.categorias.includes(categoria)),
  }))
}

/**
 * Hojas del curso contando las repetidas: las 6 ambiguas existen en eléctrica y
 * en mecánica, así que el árbol dibujado tiene 46 nodos aunque acá haya 40
 * entradas (una por causal distinguible en el dato).
 */
export const TOTAL_HOJAS_CURSO = IMPUTACION_LEAVES
  .filter((l) => !l.extension)
  .reduce((n, l) => n + l.categorias.length, 0)
export const TOTAL_CAUSALES = IMPUTACION_LEAVES.filter((l) => !l.extension).length
