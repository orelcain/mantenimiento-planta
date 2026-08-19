/**
 * imputacion — el árbol oficial de imputación de fallas, del lado del servidor.
 *
 * Fuente: "Capacitación de Imputación de Fallas V12" (Roger Tornavaca Castañeda),
 * el curso con el que se capacita a los supervisores para anotar las detenciones
 * en Shoplogix. 6 categorías, 46 hojas.
 *
 * ── Por qué está duplicado (y cómo NO se despega del original) ───────────────
 * El original vive en `apps/pwa/src/services/shoplogix/imputacionTaxonomy.ts`.
 * No se puede importar desde acá: `firebase.json` despliega SOLO la carpeta
 * `functions/`, así que un require a `../apps/pwa/...` funciona en local y
 * revienta en la nube. Tampoco sirve un JSON compartido en la raíz, por lo
 * mismo.
 *
 * La duplicación se sostiene con `__tests__/imputacion.test.js`, que LEE el .ts
 * y falla si las hojas dejan de coincidir. Si agregas una causal, agrégala en
 * los dos lados: el test te lo va a recordar.
 *
 * ── Lo que este archivo agrega sobre el original ────────────────────────────
 * El .ts se escribió cuando Shoplogix mandaba la hoja pelada ("MOTORES") y por
 * eso 6 hojas quedaban ambiguas: Balanzas, Bombas, Cintas, Estación de Calidad,
 * Grader y Motores existen en Falla Eléctrica Y en Falla Mecánica, y el dato no
 * permitía decidir. Ese comentario ya no es del todo cierto: auditando 25 turnos
 * de julio-agosto 2026, Chonchi está mandando **`MOTORES (MECANICA)`**,
 * `BOMBAS (MECANICA)`, `CINTAS (MECANICA)`. O sea el sufijo que había que pedir
 * en terreno ya está llegando, al menos en una planta.
 *
 * `matchImputacion` lo aprovecha: si el reason trae `(MECANICA)` o `(ELECTRICA)`
 * y la hoja admite esa categoría, devuelve la categoría resuelta y `ambigua:
 * false`. Si no lo trae, se comporta igual que antes. Yal todavía manda la hoja
 * pelada, así que las dos formas conviven y las dos tienen que funcionar.
 */

/** Categorías del curso. */
const CATEGORIA_META = {
  abastecimiento: { label: 'Abastecimiento / Servicios', short: 'Abastecimiento' },
  electrica:      { label: 'Falla Eléctrica',            short: 'Eléctrica' },
  mecanica:       { label: 'Falla Mecánica',             short: 'Mecánica' },
  mmpp:           { label: 'MMPP',                       short: 'MMPP' },
  operacional:    { label: 'Operacionales',              short: 'Operacional' },
  programado:     { label: 'Paros Programados',          short: 'Programado' },
}

/**
 * Las hojas. `bucket` dice de quién es la pérdida:
 *   mantencion  → Mantención responde por ella
 *   externo     → la máquina está sana; el problema viene de afuera
 *   planificado → pausa acordada, no es pérdida por falla
 *   fuera-turno → ni siquiera es tiempo del turno
 *
 * ⚠ Espejo de IMPUTACION_LEAVES en el .ts. Mantener en sincronía (hay test).
 */
const IMPUTACION_LEAVES = [
  // 1. Falla Abastecimiento / Servicios
  { label: 'Agua',              categorias: ['abastecimiento'], bucket: 'externo', match: ['AGUA'] },
  { label: 'Aire',              categorias: ['abastecimiento'], bucket: 'externo', match: ['AIRE'] },
  { label: 'Energía',           categorias: ['abastecimiento'], bucket: 'externo', match: ['ENERGIA'] },
  { label: 'Flow Ice',          categorias: ['abastecimiento'], bucket: 'externo', match: ['FLOW ICE', 'FLOWICE'] },
  { label: 'Innova',            categorias: ['abastecimiento'], bucket: 'externo', match: ['INNOVA'] },
  { label: 'Insumos / Bodegas', categorias: ['abastecimiento'], bucket: 'externo', match: ['INSUMOS / BODEGAS', 'INSUMOS', 'BODEGAS'] },
  { label: 'SAP',               categorias: ['abastecimiento'], bucket: 'externo', match: ['SAP'] },

  // 2/3. Falla Eléctrica y Mecánica — inequívocas
  { label: 'Lógica',                  categorias: ['electrica'], bucket: 'mantencion', equipo: 'baader142', match: ['LOGICA', 'BAADER 142 / LOGICA'] },
  { label: 'Ciclón',                  categorias: ['electrica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['CICLON'] },
  { label: 'Correas',                 categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'baader142', match: ['CORREAS', 'CORREA'] },
  { label: 'Cuchillos / Guillotinas', categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'baader142', match: ['CUCHILLOS / GUILLOTINAS', 'CUCHILLOS', 'GUILLOTINAS'] },
  { label: 'Pernos / Resortes',       categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'baader142', match: ['PERNOS / RESORTES', 'PERNOS', 'RESORTES'] },
  { label: 'Punto Cero',              categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'baader142', match: ['PUNTO CERO'] },
  { label: 'Knuro',                   categorias: ['mecanica'],  bucket: 'mantencion', equipo: 'auxiliar',  match: ['KNURO'] },

  // Ambiguas salvo que el reason traiga el sufijo (ELECTRICA)/(MECANICA)
  { label: 'Motores',             categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'baader142', match: ['MOTORES', 'MOTOR'] },
  { label: 'Balanzas',            categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['BALANZAS', 'BALANZA'] },
  { label: 'Bombas',              categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['BOMBAS', 'BOMBA'] },
  { label: 'Cintas',              categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['CINTAS', 'CINTA'] },
  { label: 'Estación de Calidad', categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['ESTACION DE CALIDAD', 'ESTACION CALIDAD'] },
  { label: 'Grader',              categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar',  match: ['GRADER'] },

  // 4. MMPP
  { label: 'Acumulación rechazo',    categorias: ['mmpp'], bucket: 'externo', match: ['ACUMULACION RECHAZO', 'ACUMULACION DE RECHAZO'] },
  { label: 'Atascamiento',           categorias: ['mmpp'], bucket: 'externo', match: ['ATASCAMIENTO'] },
  { label: 'Falta MMPP',             categorias: ['mmpp'], bucket: 'externo', match: ['FALTA MMPP', 'FALTA DE MMPP'] },
  { label: 'Materia prima inactiva', categorias: ['mmpp'], bucket: 'externo', match: ['MATERIA PRIMA INACTIVA'] },

  // 5. Operacionales
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

  // 6. Paros Programados
  { label: 'Cambio turno',                   categorias: ['programado'], bucket: 'planificado', match: ['CAMBIO TURNO', 'CAMBIO DE TURNO'] },
  { label: 'Colación',                       categorias: ['programado'], bucket: 'planificado', match: ['COLACION'] },
  { label: 'Detención programada',           categorias: ['programado'], bucket: 'planificado', match: ['DETENCION PROGRAMADA'] },
  { label: 'Ejercicio compensatorio - Paro', categorias: ['programado'], bucket: 'planificado', match: ['EJERCICIO COMPENSATORIO - PARO', 'EJERCICIO COMPENSATORIO'] },
  { label: 'Reunión inicio turno',           categorias: ['programado'], bucket: 'planificado', match: ['REUNION INICIO TURNO', 'REUNION DE INICIO DE TURNO'] },
  { label: 'Cumplimiento cuota',             categorias: ['programado'], bucket: 'externo', match: ['CUMPLIMIENTO CUOTA'] },

  // Extensión · Filete / Baader 200 (no son del curso — ver el .ts)
  { label: 'Cuchillería dorsal',   categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA DORSAL'] },
  { label: 'Cuchillería rascador', categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA RASCADOR'] },
  { label: 'Cuchillería punzón',   categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA PUNZON'] },
  { label: 'Cuchillería',          categorias: ['mecanica'], bucket: 'mantencion', equipo: 'baader200', extension: 'filete-baader200', match: ['CUCHILLERIA'] },
  { label: 'GEA',                  categorias: ['electrica', 'mecanica'], bucket: 'mantencion', equipo: 'auxiliar', extension: 'filete-baader200', match: ['EQUIPO AUXILIAR / GEA', 'GEA'] },
  // Filete anota `ACUMULACION` a secas; Chonchi usa `ACUMULACION RECHAZO`. Hoja
  // propia y no alias: desde el reason plano no se puede afirmar que la de
  // Filete sea de rechazo. Mismo bucket, asi que la cascada no cambia.
  { label: 'Acumulación',          categorias: ['mmpp'], bucket: 'externo', equipo: 'baader200', extension: 'filete-baader200', match: ['ACUMULACION'] },
]

/**
 * Reasons que NO son del árbol: los genera Shoplogix, no el supervisor.
 * "Planned Downtime" es el relleno de después del turno que la ventana de
 * consulta arrastra — no es tiempo del turno. En Yal son 10.781 min en 25
 * turnos: contarlo como paro sería el error más caro de todos.
 */
const NO_TAXONOMIA = [
  { match: ['PLANNED DOWNTIME'], bucket: 'fuera-turno' },
]

/** Mayúsculas, sin acentos, separadores parejos. Espejo del .ts. */
function normalizeReason(raw) {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[/|>]/g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Separa el sufijo de categoría que Chonchi ya está mandando.
 * "MOTORES (MECANICA)" → { base: 'MOTORES', categoria: 'mecanica' }
 */
function separarSufijoCategoria(normalizado) {
  const m = normalizado.match(/^(.*?)\s*\((ELECTRICA|MECANICA)\)\s*$/)
  if (!m) return { base: normalizado, categoria: null }
  return { base: m[1].trim(), categoria: m[2] === 'ELECTRICA' ? 'electrica' : 'mecanica' }
}

/**
 * Resuelve un reason crudo contra el árbol.
 *
 * Exacto primero, substring después: con substring suelto "CAMBIO LOTE / MMPP"
 * calzaba con la regla de "MMPP" y un cambio de lote se contaba como falta de
 * materia prima.
 *
 * @returns {{leaf, bucket, categoria, ambigua, fueraDelArbol, sinCausa}}
 */
function matchImputacion(rawReason) {
  const norm = normalizeReason(rawReason)
  const vacio = { leaf: null, bucket: null, categoria: null, ambigua: false, fueraDelArbol: false, sinCausa: true }
  if (!norm) return vacio

  for (const n of NO_TAXONOMIA) {
    if (n.match.some((m) => norm === m || norm.includes(m))) {
      return { leaf: null, bucket: n.bucket, categoria: null, ambigua: false, fueraDelArbol: false, sinCausa: false }
    }
  }

  const { base, categoria: sufijo } = separarSufijoCategoria(norm)

  const resolver = (leaf) => {
    // El sufijo solo manda si la hoja de verdad admite esa categoría: un
    // "(MECANICA)" pegado a una hoja que solo existe en eléctrica es un dato
    // contradictorio, y preferimos la hoja antes que el sufijo.
    const usaSufijo = sufijo && leaf.categorias.includes(sufijo)
    const cats = usaSufijo ? [sufijo] : leaf.categorias
    return {
      leaf,
      bucket: leaf.bucket,
      categoria: cats.length === 1 ? cats[0] : null,
      ambigua: cats.length > 1,
      fueraDelArbol: false,
      sinCausa: false,
    }
  }

  for (const leaf of IMPUTACION_LEAVES) {
    if (leaf.match.some((m) => base === m)) return resolver(leaf)
  }
  for (const leaf of IMPUTACION_LEAVES) {
    if (leaf.match.some((m) => base.includes(m))) return resolver(leaf)
  }

  // Causa escrita que el árbol no conoce. NO es lo mismo que un paro sin
  // imputar: alguien sí anotó, y esconderlo en "sin causa" borra el hecho de
  // que hay causales en uso que el curso no cubre (Chonchi jul-ago 2026:
  // "Planta De Riles" 177 min, "Limpieza de Ducto" 62 min).
  return { leaf: null, bucket: null, categoria: null, ambigua: false, fueraDelArbol: true, sinCausa: false }
}

/** Etiqueta para mostrar; dice explícitamente cuándo no se puede distinguir. */
function categoriaLabel(m) {
  if (!m || m.sinCausa) return 'Sin causa imputada'
  if (m.fueraDelArbol) return 'Fuera del árbol'
  if (m.categoria) return CATEGORIA_META[m.categoria].short
  if (m.leaf && m.leaf.categorias.length > 1) {
    return m.leaf.categorias.map((c) => CATEGORIA_META[c].short).join(' o ')
  }
  return 'Sin clasificar'
}

/**
 * Clasificador listo para pasarle a `lineImpact.impactoPorCausa({ clasificar })`.
 * Devuelve solo lo que el informe necesita mostrar.
 *
 * `opts.esMicro` importa: las micro detenciones llegan SIEMPRE sin causal, pero
 * porque el sistema no la pide, no porque el supervisor se haya saltado el
 * paso. Meterlas en "sin causa imputada" infla ese indicador justo cuando el
 * indicador existe para medir si la capacitación funcionó.
 */
function clasificarParaInforme(rawReason, opts = {}) {
  if (opts.esMicro) {
    return {
      hoja: null,
      categoria: null,
      categoriaLabel: 'Micro detenciones',
      bucket: null,
      ambigua: false,
      fueraDelArbol: false,
      sinCausa: false,
      esMicro: true,
      esDeMantencion: false,
    }
  }
  const m = matchImputacion(rawReason)
  return {
    hoja: m.leaf ? m.leaf.label : null,
    categoria: m.categoria,
    categoriaLabel: categoriaLabel(m),
    bucket: m.bucket,
    ambigua: m.ambigua,
    fueraDelArbol: m.fueraDelArbol,
    sinCausa: m.sinCausa,
    esMicro: false,
    esDeMantencion: m.bucket === 'mantencion',
  }
}

module.exports = {
  CATEGORIA_META,
  IMPUTACION_LEAVES,
  normalizeReason,
  separarSufijoCategoria,
  matchImputacion,
  categoriaLabel,
  clasificarParaInforme,
}
