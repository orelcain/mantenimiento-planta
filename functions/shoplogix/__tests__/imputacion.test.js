/**
 * Tests de `imputacion` (node:test nativo — correr con `node --test`).
 *
 * Dos trabajos:
 *
 * 1. Que el clasificador resuelva los reasons REALES de las dos plantas. Los
 *    casos salen de auditar 25 turnos de julio-agosto 2026 en Chonchi y Yal, no
 *    de imaginar entradas.
 *
 * 2. Que la copia de este lado no se despegue del original de la PWA. El último
 *    test lee `imputacionTaxonomy.ts` y compara las hojas. Si alguien agrega una
 *    causal en un solo lado, falla acá — que es el único seguro que tenemos
 *    contra la duplicación que `firebase.json` nos obliga a mantener.
 */

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const {
  IMPUTACION_LEAVES,
  normalizeReason,
  separarSufijoCategoria,
  matchImputacion,
  categoriaLabel,
  clasificarParaInforme,
} = require('../imputacion')

// ── Normalización ───────────────────────────────────────────────────────────

test('normaliza acentos, mayúsculas y separadores', () => {
  assert.strictEqual(normalizeReason('Colación'), 'COLACION')
  assert.strictEqual(normalizeReason('CAMBIO LOTE/MMPP'), 'CAMBIO LOTE / MMPP')
  assert.strictEqual(normalizeReason('PERNOS/RESORTES'), 'PERNOS / RESORTES')
  assert.strictEqual(normalizeReason('  MOTORES   '), 'MOTORES')
})

// ── Sufijo de categoría ─────────────────────────────────────────────────────

test('separa el sufijo (MECANICA) que Chonchi ya está mandando', () => {
  assert.deepStrictEqual(separarSufijoCategoria('MOTORES (MECANICA)'), { base: 'MOTORES', categoria: 'mecanica' })
  assert.deepStrictEqual(separarSufijoCategoria('BOMBAS (ELECTRICA)'), { base: 'BOMBAS', categoria: 'electrica' })
  assert.deepStrictEqual(separarSufijoCategoria('KNURO'), { base: 'KNURO', categoria: null })
})

test('el sufijo DESAMBIGUA una hoja que vive en dos categorías', () => {
  // Sin sufijo, Bombas no se puede clasificar: existe en eléctrica y mecánica.
  const sin = matchImputacion('BOMBAS')
  assert.strictEqual(sin.ambigua, true)
  assert.strictEqual(sin.categoria, null)
  assert.strictEqual(categoriaLabel(sin), 'Eléctrica o Mecánica')

  // Con sufijo, sí. Es el caso real de Chonchi 2026-08-17.
  const con = matchImputacion('BOMBAS (MECANICA)')
  assert.strictEqual(con.ambigua, false)
  assert.strictEqual(con.categoria, 'mecanica')
  assert.strictEqual(con.leaf.label, 'Bombas')
  assert.strictEqual(categoriaLabel(con), 'Mecánica')
})

test('un sufijo que contradice a la hoja no gana', () => {
  // "Lógica" solo existe en eléctrica. Si llega "(MECANICA)", el árbol manda:
  // inventar una categoría que la hoja no tiene sería peor que ignorar el dato.
  const m = matchImputacion('LOGICA (MECANICA)')
  assert.strictEqual(m.leaf.label, 'Lógica')
  assert.strictEqual(m.categoria, 'electrica')
})

// ── Reasons reales de las dos plantas ───────────────────────────────────────

test('resuelve los reasons reales de Chonchi', () => {
  const casos = [
    ['FALTA MMPP',          'Falta MMPP',            'externo'],
    ['LOGICA',              'Lógica',                'mantencion'],
    ['MOTORES (MECANICA)',  'Motores',               'mantencion'],
    ['ACUMULACION RECHAZO', 'Acumulación rechazo',   'externo'],
    ['RETRASO ASEO',        'Retraso aseo',          'externo'],
    ['KNURO',               'Knuro',                 'mantencion'],
    ['BOMBAS (MECANICA)',   'Bombas',                'mantencion'],
    ['CINTAS (MECANICA)',   'Cintas',                'mantencion'],
    ['PERNOS/RESORTES',     'Pernos / Resortes',     'mantencion'],
    ['PUNTO CERO',          'Punto Cero',            'mantencion'],
    ['ESTACION DE CALIDAD', 'Estación de Calidad',   'mantencion'],
    ['COLACION',            'Colación',              'planificado'],
    ['REUNION INICIO TURNO', 'Reunión inicio turno', 'planificado'],
  ]
  for (const [reason, hoja, bucket] of casos) {
    const m = matchImputacion(reason)
    assert.strictEqual(m.leaf && m.leaf.label, hoja, `hoja de ${reason}`)
    assert.strictEqual(m.bucket, bucket, `bucket de ${reason}`)
  }
})

test('resuelve los reasons reales de Yal', () => {
  const casos = [
    ['CUMPLIMIENTO CUOTA',   'Cumplimiento cuota',   'externo'],
    ['AJUSTE MANTENIMIENTO', 'Ajuste mantenimiento', 'mantencion'],
    ['CONTRASTACION',        'Contrastación',        'externo'],
    ['ATASCAMIENTO',         'Atascamiento',         'externo'],
    ['CAMBIO LOTE/MMPP',     'Cambio lote / MMPP',   'externo'],
    ['AJUSTE OPERADOR',      'Ajuste operador',      'externo'],
    ['CAMBIO TURNO',         'Cambio turno',         'planificado'],
    ['CINTAS',               'Cintas',               'mantencion'],
  ]
  for (const [reason, hoja, bucket] of casos) {
    const m = matchImputacion(reason)
    assert.strictEqual(m.leaf && m.leaf.label, hoja, `hoja de ${reason}`)
    assert.strictEqual(m.bucket, bucket, `bucket de ${reason}`)
  }
})

test('"CAMBIO LOTE / MMPP" no se cuenta como falta de materia prima', () => {
  // El match exacto tiene que ir antes que el substring, o un cambio de lote
  // aparece como MMPP y le carga a Producción una falla que no tuvo.
  const m = matchImputacion('CAMBIO LOTE/MMPP')
  assert.strictEqual(m.leaf.label, 'Cambio lote / MMPP')
  assert.notStrictEqual(m.leaf.label, 'Falta MMPP')
})

test('Planned Downtime queda fuera del turno, no como paro', () => {
  // En Yal son 10.781 min en 25 turnos: contarlo como detención sería el error
  // más caro que puede cometer el informe.
  const m = matchImputacion('Planned Downtime')
  assert.strictEqual(m.bucket, 'fuera-turno')
  assert.strictEqual(m.leaf, null)
})

test('DETENCION PROGRAMADA no es Planned Downtime', () => {
  const m = matchImputacion('DETENCION PROGRAMADA')
  assert.strictEqual(m.bucket, 'planificado')
})

// ── Los tres estados que no son "una hoja" ──────────────────────────────────

test('distingue sin causa, fuera del árbol y clasificado', () => {
  assert.strictEqual(matchImputacion('').sinCausa, true)
  assert.strictEqual(matchImputacion(null).sinCausa, true)

  // Causales reales de Chonchi que el curso V12 no cubre.
  for (const r of ['Planta De Riles', 'Limpieza de Ducto']) {
    const m = matchImputacion(r)
    assert.strictEqual(m.fueraDelArbol, true, r)
    assert.strictEqual(m.sinCausa, false, `${r} SÍ fue imputado, solo que fuera del árbol`)
    assert.strictEqual(categoriaLabel(m), 'Fuera del árbol')
  }

  assert.strictEqual(matchImputacion('KNURO').fueraDelArbol, false)
})

// ── Salida para el informe ──────────────────────────────────────────────────

test('clasificarParaInforme marca lo que es de Mantención', () => {
  assert.strictEqual(clasificarParaInforme('BOMBAS (MECANICA)').esDeMantencion, true)
  assert.strictEqual(clasificarParaInforme('AJUSTE MANTENIMIENTO').esDeMantencion, true)
  assert.strictEqual(clasificarParaInforme('FALTA MMPP').esDeMantencion, false)
  assert.strictEqual(clasificarParaInforme('COLACION').esDeMantencion, false)
})

test('clasificarParaInforme nunca inventa una categoría', () => {
  const c = clasificarParaInforme('GRADER')
  assert.strictEqual(c.categoria, null)
  assert.strictEqual(c.ambigua, true)
  assert.strictEqual(c.categoriaLabel, 'Eléctrica o Mecánica')
})

// ── Anti-drift contra el original de la PWA ─────────────────────────────────

test('las hojas siguen coincidiendo con imputacionTaxonomy.ts', () => {
  const ts = path.resolve(__dirname, '../../../apps/pwa/src/services/shoplogix/imputacionTaxonomy.ts')
  if (!fs.existsSync(ts)) {
    // En el paquete desplegado la PWA no viaja; el test solo aplica en el repo.
    return
  }
  const src = fs.readFileSync(ts, 'utf8')

  // Extrae los pares label/match de cada hoja del array del .ts.
  const hojasTs = []
  const re = /\{\s*label:\s*'([^']+)'[^}]*?match:\s*\[([^\]]*)\]\s*\}/g
  let m
  while ((m = re.exec(src)) !== null) {
    const matches = m[2].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean)
    hojasTs.push({ label: m[1], match: matches })
  }

  assert.ok(hojasTs.length > 40, `el parser del .ts encontró solo ${hojasTs.length} hojas — revisar el regex`)

  const clave = (h) => `${h.label}::${h.match.join('|')}`
  const enTs = new Set(hojasTs.map(clave))
  const enJs = new Set(IMPUTACION_LEAVES.map(clave))

  const soloTs = [...enTs].filter((k) => !enJs.has(k))
  const soloJs = [...enJs].filter((k) => !enTs.has(k))

  assert.deepStrictEqual(soloTs, [], 'hojas en el .ts que faltan en imputacion.js')
  assert.deepStrictEqual(soloJs, [], 'hojas en imputacion.js que faltan en el .ts')
})

test('las micro detenciones no cuentan como "sin causa imputada"', () => {
  // Llegan siempre con reason vacío porque el sistema no lo pide, no porque el
  // supervisor se lo haya saltado. Sumarlas al indicador de "sin imputar" lo
  // infla justo cuando ese indicador mide si la capacitación funcionó.
  const c = clasificarParaInforme('', { esMicro: true })
  assert.strictEqual(c.esMicro, true)
  assert.strictEqual(c.sinCausa, false)
  assert.strictEqual(c.fueraDelArbol, false)
  assert.strictEqual(c.categoriaLabel, 'Micro detenciones')
})

test('un paro grande sin causal SÍ cuenta como sin imputar', () => {
  const c = clasificarParaInforme('', { esMicro: false })
  assert.strictEqual(c.sinCausa, true)
  assert.strictEqual(c.categoriaLabel, 'Sin causa imputada')
})

test('la acumulación de Filete se clasifica sin decir que es de rechazo', () => {
  // Filete anota "ACUMULACION" a secas (164 min / 38 eventos en 29 turnos);
  // Chonchi usa "ACUMULACION RECHAZO". Antes caía en "fuera del árbol", que es
  // justo la pata de MMPP de Filete.
  const f = matchImputacion('ACUMULACION')
  assert.strictEqual(f.leaf.label, 'Acumulación')
  assert.strictEqual(f.bucket, 'externo')
  assert.strictEqual(f.fueraDelArbol, false)
  // No se le pone la etiqueta mas especifica: el dato plano no dice que sea de rechazo.
  assert.notStrictEqual(f.leaf.label, 'Acumulación rechazo')

  // Y la causal de Chonchi sigue resolviendo a la suya, no a la nueva.
  assert.strictEqual(matchImputacion('ACUMULACION RECHAZO').leaf.label, 'Acumulación rechazo')
  assert.strictEqual(matchImputacion('ACUMULACION DE RECHAZO').leaf.label, 'Acumulación rechazo')
})

test('la hoja nueva no infla el conteo del curso', () => {
  // Va marcada como extension: el curso V12 no la tiene y el arbol dibujable
  // tiene que seguir diciendo la verdad.
  const hoja = IMPUTACION_LEAVES.find((l) => l.label === 'Acumulación')
  assert.strictEqual(hoja.extension, 'filete-baader200')
})
