/**
 * Tests de `informeTurno` (node:test nativo — correr con `node --test`).
 *
 * Estos tests no verifican cálculos: verifican QUÉ AFIRMA el informe. Es la
 * parte que llega a una reunión, y la que puede quemar la credibilidad de todo
 * lo demás si dice de más.
 *
 * Los invariantes:
 *   · nunca estima piezas que no se produjeron
 *   · un turno malo se informa como malo
 *   · lo que el dato no distingue, se declara
 *   · una sola cifra de producción en todo el documento
 */

const test = require('node:test')
const assert = require('node:assert')

const { construirTextos, causaPrincipal, etiquetaCausa } = require('../informeTurno')

const causa = (nombre, { suma, union, todas, equiv, eventos = 3, hoja, ambigua, micro, sinCausa, fuera } = {}) => ({
  causa: nombre,
  esMicro: !!micro,
  eventos,
  sumaSec: suma ?? 0,
  unionSec: union ?? 0,
  todasSec: todas ?? 0,
  equivalenteLineaSec: equiv ?? 0,
  porNivelSec: [0, union ?? 0, 0, todas ?? 0],
  porMaquina: [],
  imputacion: {
    hoja: hoja ?? null,
    categoriaLabel: ambigua ? 'Eléctrica o Mecánica' : 'Mecánica',
    ambigua: !!ambigua,
    sinCausa: !!sinCausa,
    fueraDelArbol: !!fuera,
    esMicro: !!micro,
    esDeMantencion: !!hoja,
  },
})

const resumenBase = (over = {}) => ({
  maquinas: 3,
  ciclos: 12352,
  ritmoNormal: 37.2,
  detencion: { sumaSec: 13218, unionSec: 7457, todasSec: 2190, equivalenteLineaSec: 4406 },
  mantencionEquivSec: 3010,
  sinCausaEquivSec: 0,
  causas: [causa('BOMBAS (MECANICA)', { suma: 6735, union: 3870, todas: 1080, equiv: 2245, eventos: 22, hoja: 'Bombas' })],
  pausas: [],
  ...over,
})

const meta = { planta: 'chonchi', areaLabel: 'Eviscerados Chonchi', turnoLabel: 'Turno 1', fechaLabel: '2026-08-17' }
const cotejoMejor = { comparados: 7, veredicto: 'mejor-del-periodo', difVsMediana: 2299, medianaPrevios: 10053 }
const cotejoBajo = { comparados: 6, veredicto: 'bajo-la-mediana', difVsMediana: -3072, medianaPrevios: 11231 }

// ── La regla que no se negocia ──────────────────────────────────────────────

test('NUNCA estima piezas que no se produjeron', () => {
  // Ojo con este test: la nota de la lámina 4 contiene la frase prohibida
  // DENTRO de su propia negación ("lo que este informe no dice: cuántas piezas
  // se habrían hecho"). Por eso el barrido va sobre las superficies que
  // AFIRMAN —veredicto, párrafo de la reunión, pendientes— y la advertencia se
  // verifica aparte, en el test siguiente.
  const prohibido = /habriamos|habríamos|se habrian|se habrían|piezas mas|piezas más|dejamos de producir|perdimos \d+ (piezas|ciclos)/i
  for (const cot of [cotejoMejor, cotejoBajo, { comparados: 0, veredicto: 'sin-comparables' }]) {
    const t = construirTextos({
      resumen: resumenBase(), recuperaciones: [], cotejo: cot,
      principal: resumenBase().causas[0], meta,
    })
    const afirmaciones = [t.veredictoTitulo, t.veredictoDetalle, t.parrafoReunion, ...t.pendientes].join(' ')
    assert.ok(!prohibido.test(afirmaciones), `texto con estimacion contrafactual bajo veredicto ${cot.veredicto}:\n${afirmaciones}`)
  }
})

test('la lámina del ritmo declara explícitamente lo que no se puede afirmar', () => {
  const t = construirTextos({ resumen: resumenBase(), recuperaciones: [], cotejo: cotejoMejor, principal: resumenBase().causas[0], meta })
  assert.match(t.notaLamina4, /turno ideal que no ocurrio/i)
})

// ── El veredicto sigue al dato ──────────────────────────────────────────────

test('el mejor turno del período se informa como tal, con la falla incluida', () => {
  const r = resumenBase()
  const t = construirTextos({ resumen: r, recuperaciones: [], cotejo: cotejoMejor, principal: r.causas[0], meta })
  assert.strictEqual(t.veredictoBueno, true)
  assert.match(t.veredictoTitulo, /no costo piezas/i)
  assert.match(t.veredictoDetalle, /12\.352/)
  assert.match(t.veredictoDetalle, /Bombas/)
})

test('un turno bajo la mediana se informa como tal, sin buscarle el ángulo', () => {
  const r = resumenBase({ ciclos: 8159 })
  const t = construirTextos({ resumen: r, recuperaciones: [], cotejo: cotejoBajo, principal: r.causas[0], meta })
  assert.strictEqual(t.veredictoBueno, false)
  assert.match(t.veredictoTitulo, /bajo lo habitual/i)
  assert.ok(!/pese a|aun asi|aún así|sin embargo/i.test(t.veredictoTitulo), 'no debe justificar')
  // Y apunta a lo que hay que revisar, en vez de cerrar el tema.
  assert.match(t.veredictoDetalle, /revisar/i)
})

test('sin comparables no se inventa un veredicto', () => {
  const r = resumenBase()
  const t = construirTextos({ resumen: r, recuperaciones: [], cotejo: { comparados: 0, veredicto: 'sin-comparables' }, principal: r.causas[0], meta })
  assert.match(t.veredictoDetalle, /sin compararlo/i)
  assert.strictEqual(t.veredictoBueno, false)
})

// ── Contención ──────────────────────────────────────────────────────────────

test('una recuperación de 0 min no se escribe como "volvió en 0 min"', () => {
  // Pasa de verdad: la causa terminó cuando la línea ya estaba en ritmo, o sea
  // nunca la sacó de ritmo. "0 min" se lee como error de cálculo.
  const r = resumenBase()
  const t = construirTextos({
    resumen: r, cotejo: cotejoMejor, principal: r.causas[0], meta,
    recuperaciones: [{ causa: 'Bombas', minutos: 16, desdeMs: 0, volvioMs: 0 }, { causa: 'Grader', minutos: 0, desdeMs: 0, volvioMs: 0 }],
  })
  assert.ok(!/\b0 min\b/.test(t.parrafoReunion), t.parrafoReunion)
  assert.match(t.notaLamina4, /no alcanzo a sacar la linea de su ritmo/i)
})

test('si la línea no recuperó, el informe lo dice como problema', () => {
  const r = resumenBase()
  const t = construirTextos({
    resumen: r, cotejo: cotejoMejor, principal: r.causas[0], meta,
    recuperaciones: [{ causa: 'Bombas', minutos: null, desdeMs: 0, volvioMs: null }],
  })
  assert.match(t.notaLamina4, /arrastre/i)
  assert.match(t.notaLamina4, /NO volvio/i)
})

// ── Lo que queda abierto ────────────────────────────────────────────────────

test('la pausa programada se compara con la detención, sin culpar a nadie', () => {
  const r = resumenBase({
    pausas: [causa('COLACION', { suma: 8760, union: 3045, todas: 2730, equiv: 2920, hoja: 'Colación' })],
    detencion: { sumaSec: 13218, unionSec: 7457, todasSec: 1080, equivalenteLineaSec: 4406 },
  })
  const t = construirTextos({ resumen: r, recuperaciones: [], cotejo: cotejoMejor, principal: r.causas[0], meta })
  const p = t.pendientes.find((x) => /Colación/.test(x))
  assert.ok(p, 'debe mencionar la pausa mayor')
  // El dato se informa, pero sin tono de reproche: esto sale solo todos los
  // dias y habla de una pausa que es de Produccion.
  assert.match(p, /tiempo planificado y no una falla/i)
  assert.ok(!/mas que toda la detencion|no un pendiente de un departamento/i.test(p), 'no debe sonar a reproche')
})

test('pide el sufijo de categoría cuando el dato no distingue', () => {
  const r = resumenBase({
    causas: [causa('GRADER', { suma: 2295, union: 930, todas: 660, equiv: 765, hoja: 'Grader', ambigua: true })],
  })
  const t = construirTextos({ resumen: r, recuperaciones: [], cotejo: cotejoMejor, principal: r.causas[0], meta })
  assert.ok(t.pendientes.some((x) => /ELECTRICA\) o \(MECANICA\)/.test(x)))
})

test('declara la diferencia entre las dos fuentes de producción', () => {
  // Yal 2026-08-17 tarde: 21.125 sumando máquinas y 20.916 en el aviso de
  // cierre. Si el informe no lo dice, lo descubre el que sume las barras.
  const r = resumenBase({ ciclos: 21125 })
  const t = construirTextos({ resumen: r, recuperaciones: [], cotejo: cotejoMejor, principal: r.causas[0], meta, difFuentes: 209 })
  const p = t.pendientes.find((x) => /diferencia/.test(x))
  assert.ok(p, 'debe declarar la diferencia de fuentes')
  assert.match(p, /21\.125/)
  assert.match(p, /20\.916/)
})

test('un turno limpio no inventa pendientes', () => {
  const r = resumenBase({ causas: [], pausas: [], mantencionEquivSec: 0, detencion: { sumaSec: 0, unionSec: 0, todasSec: 0, equivalenteLineaSec: 0 } })
  const t = construirTextos({ resumen: r, recuperaciones: [], cotejo: cotejoMejor, principal: null, meta })
  assert.deepStrictEqual(t.pendientes.length, 1)
  assert.match(t.pendientes[0], /Sin observaciones/i)
})

// ── Selección de la causa principal ─────────────────────────────────────────

test('la causa principal no es una micro detención', () => {
  const causas = [
    causa('(micro detenciones)', { equiv: 9999, micro: true }),
    causa('BOMBAS (MECANICA)', { equiv: 2245, hoja: 'Bombas' }),
  ]
  assert.strictEqual(causaPrincipal(causas).causa, 'BOMBAS (MECANICA)')
})

test('etiquetaCausa usa la hoja del árbol cuando existe', () => {
  assert.strictEqual(etiquetaCausa(causa('BOMBAS (MECANICA)', { hoja: 'Bombas' })), 'Bombas')
  assert.strictEqual(etiquetaCausa(causa('Planta De Riles', { fuera: true })), 'Planta De Riles')
  assert.strictEqual(etiquetaCausa(causa('(micro detenciones)', { micro: true })), 'micro detenciones')
})

// ── Título de la lámina 4 ───────────────────────────────────────────────────

const repartoDe = (parado, reenganche, degradado, eventos = []) => ({
  paradoPz: parado, reenganchePz: reenganche, degradadoPz: degradado,
  pausadoPz: 0, totalPz: parado + reenganche + degradado, eventos, maxReengancheMin: 20,
})
const textosCon = (reparto) => construirTextos({
  resumen: resumenBase(), recuperaciones: [], reparto, cotejo: cotejoMejor,
  principal: resumenBase().causas[0], meta,
})

test('sin caídas, el título no habla de tramos ni deja la lámina coja', () => {
  // Un tercio de los turnos no tiene ninguna caída. Con el título de "tramo por
  // tramo" y la tabla de caídas vacía, el informe se ve roto justo cuando no
  // hubo fallas — que es cuando más conviene que se lea bien.
  const t = textosCon(repartoDe(0, 0, 819))
  assert.match(t.tituloLamina4, /no tuvo detenciones/i)
})

test('turno perfecto: el título lo dice', () => {
  assert.match(textosCon(repartoDe(0, 0, 0)).tituloLamina4, /de punta a punta/i)
})

test('con caídas pero dominado por el ritmo, el título lo refleja', () => {
  const t = textosCon(repartoDe(300, 50, 900, [{ inicioMs: 0, minParo: 10, minReenganche: 5, pzParo: 300, pzReenganche: 50 }]))
  assert.match(t.tituloLamina4, /lo que mas costo fue el ritmo/i)
})

test('caso típico: título estándar', () => {
  const t = textosCon(repartoDe(2158, 286, 819, [{ inicioMs: 0, minParo: 35, minReenganche: 5, pzParo: 1076, pzReenganche: 43 }]))
  assert.match(t.tituloLamina4, /tramo por tramo/i)
})

test('la nota del reparto avisa cuando el degradado manda', () => {
  const t = textosCon(repartoDe(300, 50, 900, [{ inicioMs: 0, minParo: 10, minReenganche: 5, pzParo: 300, pzReenganche: 50 }]))
  assert.match(t.notaReparto, /otra palanca/i)
})

// ── Mejoras de láminas (v2) ─────────────────────────────────────────────────

test('sin comparables, el informe dice POR QUÉ y no solo que faltan', () => {
  // "No hay suficientes" no le sirve a nadie. Distinguir calendario de datos sí:
  // el "Turno 1 Lunes" existe solo los lunes; el turno de día de Chonchi cambia
  // de hora de inicio. Son dos problemas distintos.
  const r = resumenBase()
  const base = { comparados: 2, veredicto: 'sin-comparables' }

  const calendario = construirTextos({
    resumen: r, recuperaciones: [], principal: r.causas[0], meta,
    cotejo: { ...base, diagnostico: { mismaVentana: 0, sinProduccion: 0, diasMirados: 21, turnosMirados: 40 } },
  })
  assert.match(calendario.veredictoDetalle, /no se repite seguido|cambiaron la hora/i)

  const datos = construirTextos({
    resumen: r, recuperaciones: [], principal: r.causas[0], meta,
    cotejo: { ...base, diagnostico: { mismaVentana: 6, sinProduccion: 4, diasMirados: 21, turnosMirados: 40 } },
  })
  assert.match(datos.veredictoDetalle, /4 de ellos no produjeron/i)
})

test('advierte que la Calidad 100% es ausencia de dato, no medición', () => {
  // 204 turnos revisados en las 3 plantas: cero rechazo SIEMPRE. Alguien podría
  // citar ese 100% como logro.
  const t = construirTextos({
    resumen: resumenBase({ scrapTotal: 0 }), recuperaciones: [], cotejo: cotejoMejor,
    principal: resumenBase().causas[0], meta,
  })
  const p = t.pendientes.find((x) => /Calidad/.test(x))
  assert.ok(p, 'debe advertir sobre la Calidad')
  assert.match(p, /no es un resultado/i)
})

test('si algún día llega rechazo de verdad, la advertencia desaparece', () => {
  const t = construirTextos({
    resumen: resumenBase({ scrapTotal: 42 }), recuperaciones: [], cotejo: cotejoMejor,
    principal: resumenBase().causas[0], meta,
  })
  assert.ok(!t.pendientes.some((x) => /Calidad/.test(x)))
})

test('la explicación concuerda en singular y en plural', () => {
  const r = resumenBase()
  const con = (sinProduccion) => construirTextos({
    resumen: r, recuperaciones: [], principal: r.causas[0], meta,
    cotejo: {
      comparados: 2, veredicto: 'sin-comparables',
      diagnostico: { mismaVentana: 3, sinProduccion, diasMirados: 21, turnosMirados: 40 },
    },
  }).veredictoDetalle
  assert.match(con(1), /uno de ellos no produjo/)
  assert.match(con(4), /4 de ellos no produjeron/)
})

test('un turno EN CURSO no habla en pasado ni presume del cotejo', () => {
  // Decir "el turno cerró con X" cuando todavía está corriendo invita a leer
  // una foto parcial como si fuera el resultado.
  const r = resumenBase()
  const t = construirTextos({
    resumen: r, recuperaciones: [], cotejo: cotejoMejor, principal: r.causas[0], meta, enCurso: true,
  })
  assert.match(t.veredictoTitulo, /EN CURSO/i)
  assert.ok(!/cerro|cerró/i.test(t.veredictoDetalle), 'no debe hablar en pasado')
  assert.match(t.veredictoDetalle, /pueden cambiar/i)
  // Y avisa que la comparación con turnos completos no vale.
  assert.match(t.veredictoDetalle, /NO vale/i)
  assert.strictEqual(t.veredictoBueno, false)
})
