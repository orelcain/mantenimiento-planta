/**
 * Tests de `lineImpact` (node:test nativo — correr con `node --test`).
 *
 * Invariante que fijan: la suma de horas-máquina que informa Shoplogix NUNCA se
 * usa como impacto de línea. Cada causa tiene que salir con sus cuatro medidas
 * (suma / unión / todas / equivalente) y las cuatro tienen que cerrar entre sí.
 *
 * Los casos de solapamiento están escritos a mano porque son justo donde el ojo
 * se equivoca: paros que se tocan en el borde, paros anidados, un paro que cruza
 * el fin del turno, y una máquina que no tuvo la causa (y que igual tiene que
 * contar en el denominador, o "las 3 detenidas" sale mal).
 */

const test = require('node:test')
const assert = require('node:assert')

const {
  fusionar,
  perfilDeSolapamiento,
  impactoPorCausa,
  ritmoDelTurno,
  recuperacion,
  tramosDeRitmo,
} = require('../lineImpact')

// Helpers: minutos desde un origen arbitrario, para que los casos se lean.
const T0 = Date.UTC(2026, 7, 17, 21, 0, 0)
const m = (min) => T0 + min * 60_000
const st = (desdeMin, hastaMin, reason, extra = {}) => ({
  startAt: new Date(m(desdeMin)),
  endAt: new Date(m(hastaMin)),
  durationSec: (hastaMin - desdeMin) * 60,
  type: 'downtime',
  name: 'Detencion',
  reason,
  ...extra,
})
const maq = (machineName, states, intervals = []) => ({ machineName, states, intervals })
const min = (sec) => sec / 60

// ── fusionar ────────────────────────────────────────────────────────────────

test('fusionar une solapados y deja pegados los que apenas se tocan', () => {
  const r = fusionar([[m(0), m(10)], [m(5), m(20)], [m(20), m(25)], [m(40), m(50)]])
  assert.deepStrictEqual(r, [[m(0), m(25)], [m(40), m(50)]])
})

test('fusionar absorbe un intervalo contenido en otro', () => {
  assert.deepStrictEqual(fusionar([[m(0), m(60)], [m(10), m(20)]]), [[m(0), m(60)]])
})

// ── perfilDeSolapamiento ────────────────────────────────────────────────────

test('tres máquinas caídas en la misma ventana: unión = todas = la ventana', () => {
  const p = perfilDeSolapamiento([
    [[m(0), m(10)]],
    [[m(0), m(10)]],
    [[m(0), m(10)]],
  ])
  assert.strictEqual(min(p.unionSec), 10)
  assert.strictEqual(min(p.todasSec), 10)
  assert.strictEqual(min(p.porNivelSec[1]), 0)
})

test('paros escalonados: la suma triplica a la unión y no hay línea muerta', () => {
  const p = perfilDeSolapamiento([
    [[m(0), m(10)]],
    [[m(10), m(20)]],
    [[m(20), m(30)]],
  ])
  assert.strictEqual(min(p.unionSec), 30)
  assert.strictEqual(min(p.todasSec), 0)      // nunca coincidieron
  assert.strictEqual(min(p.porNivelSec[1]), 30)
})

test('dos paros que se TOCAN en el borde no cuentan como solapados', () => {
  // Este es el que engaña: [0,10] y [10,20] comparten el instante 10.
  // Si el barrido abriera antes de cerrar, aparecería 1 instante con 2 caídas.
  const p = perfilDeSolapamiento([[[m(0), m(10)]], [[m(10), m(20)]]])
  assert.strictEqual(min(p.porNivelSec[2]), 0)
  assert.strictEqual(min(p.unionSec), 20)
})

test('solapamiento parcial reparte bien entre niveles', () => {
  const p = perfilDeSolapamiento([[[m(0), m(20)]], [[m(10), m(30)]]])
  assert.strictEqual(min(p.porNivelSec[1]), 20)  // 0-10 y 20-30
  assert.strictEqual(min(p.porNivelSec[2]), 10)  // 10-20
  assert.strictEqual(min(p.unionSec), 30)
  assert.strictEqual(min(p.todasSec), 10)
})

test('una máquina sin paros hace que NUNCA haya línea muerta', () => {
  // El denominador importa: si la tercera máquina no se pasara, "todas" daría
  // 10 min y el informe diría que la línea estuvo muerta cuando no lo estuvo.
  const p = perfilDeSolapamiento([[[m(0), m(10)]], [[m(0), m(10)]], []])
  assert.strictEqual(min(p.todasSec), 0)
  assert.strictEqual(min(p.porNivelSec[2]), 10)
})

// ── impactoPorCausa ─────────────────────────────────────────────────────────

test('las cuatro medidas cierran entre sí y la suma NO es el impacto', () => {
  const machines = [
    maq('Ev 1', [st(0, 20, 'BOMBAS')]),
    maq('Ev 2', [st(10, 30, 'BOMBAS')]),
    maq('Ev 3', [st(10, 20, 'BOMBAS')]),
  ]
  const [fila] = impactoPorCausa({ machines })

  assert.strictEqual(min(fila.sumaSec), 50)                 // 20 + 20 + 10
  assert.strictEqual(min(fila.unionSec), 30)                // 0 → 30
  assert.strictEqual(min(fila.todasSec), 10)                // 10 → 20
  assert.strictEqual(min(fila.equivalenteLineaSec), 50 / 3) // suma ÷ 3 máquinas
  assert.ok(fila.sumaSec > fila.unionSec, 'la suma sobreestima el impacto de línea')
  assert.strictEqual(fila.eventos, 3)
})

test('recorta los paros que cruzan el fin del turno', () => {
  // Sin recorte, un paro que sigue en el turno siguiente se contaría entero en
  // los dos — la duplicación que ya mordió a normalizer.js.
  const machines = [maq('Ev 1', [st(0, 120, 'BOMBAS')])]
  const [fila] = impactoPorCausa({ machines, windowStart: m(0), windowEnd: m(60) })
  assert.strictEqual(min(fila.sumaSec), 60)
})

test('descarta un paro enteramente fuera de la ventana', () => {
  const machines = [maq('Ev 1', [st(200, 260, 'BOMBAS')])]
  const filas = impactoPorCausa({ machines, windowStart: m(0), windowEnd: m(60) })
  assert.strictEqual(filas.length, 0)
})

test('separa las causas y ordena por equivalente de línea', () => {
  const machines = [
    maq('Ev 1', [st(0, 30, 'BOMBAS'), st(40, 45, 'GRADER')]),
    maq('Ev 2', [st(0, 30, 'BOMBAS')]),
  ]
  const filas = impactoPorCausa({ machines })
  assert.deepStrictEqual(filas.map((f) => f.causa), ['BOMBAS', 'GRADER'])
  assert.strictEqual(min(filas[0].equivalenteLineaSec), 30)  // 60 ÷ 2
  assert.strictEqual(min(filas[1].equivalenteLineaSec), 2.5) //  5 ÷ 2
})

test('los paros sin causa se muestran, no se esconden', () => {
  const machines = [maq('Ev 1', [st(0, 10, '')])]
  const [fila] = impactoPorCausa({ machines })
  assert.strictEqual(fila.causa, '(sin causa imputada)')
})

test('las micro detenciones no se mezclan con los paros sin imputar', () => {
  // Micro Detencion llega SIEMPRE con reason vacío. Si cayeran en el mismo
  // saco, el informe acusaría de "sin causa" al ruido normal de la línea.
  const machines = [maq('Ev 1', [
    st(0, 10, '', { name: 'Micro Detencion' }),
    st(20, 30, ''),
  ])]
  const filas = impactoPorCausa({ machines })
  const causas = filas.map((f) => f.causa).sort()
  assert.deepStrictEqual(causas, ['(micro detenciones)', '(sin causa imputada)'])
})

test('la colación no entra como detención por defecto', () => {
  const machines = [maq('Ev 1', [
    st(0, 10, 'BOMBAS'),
    { ...st(20, 70, 'COLACION'), type: 'break' },
  ])]
  const filas = impactoPorCausa({ machines })
  assert.deepStrictEqual(filas.map((f) => f.causa), ['BOMBAS'])
})

test('el filtro `incluir` permite medir la colación con la misma vara', () => {
  // Hallazgo del 17-08: la colación detuvo la línea 50 min y la falla mecánica
  // 18. Para poder decirlo hay que poder medir las pausas igual que los paros.
  const machines = [
    maq('Ev 1', [{ ...st(0, 50, 'COLACION'), type: 'break' }]),
    maq('Ev 2', [{ ...st(0, 50, 'COLACION'), type: 'break' }]),
  ]
  const filas = impactoPorCausa({ machines, incluir: (s) => s.type === 'break' })
  assert.strictEqual(min(filas[0].todasSec), 50)
})

test('clasificar cuelga la imputación sin que el módulo conozca el árbol', () => {
  const machines = [maq('Ev 1', [st(0, 10, 'BOMBAS')])]
  const [fila] = impactoPorCausa({
    machines,
    clasificar: (r) => ({ label: r === 'BOMBAS' ? 'Bombas' : null, ambigua: true }),
  })
  assert.strictEqual(fila.imputacion.label, 'Bombas')
  assert.strictEqual(fila.imputacion.ambigua, true)
})

// ── ritmoDelTurno / recuperación ────────────────────────────────────────────

/** Turno sintético: 12 bloques de 5 min; los bloques 3 y 4 caen por un paro. */
function turnoDePrueba() {
  const intervals = []
  const ritmo = [180, 180, 180, 20, 0, 60, 175, 180, 185, 180, 180, 180]
  ritmo.forEach((c, i) => intervals.push({ startAt: new Date(m(i * 5)), cycles: c }))
  return [maq('Ev 1', [st(15, 28, 'BOMBAS')], intervals)]
}

test('ritmoNormal sale de los bloques limpios, no del promedio del turno', () => {
  const r = ritmoDelTurno({ machines: turnoDePrueba() })
  assert.strictEqual(r.ritmoNormal, 36)   // 180 ciclos / 5 min
  // El promedio del turno sería ~29: usarlo escondería la caída.
  assert.strictEqual(r.bloques.length, 12)
  assert.strictEqual(r.bloques[3].limpio, false)
  assert.strictEqual(r.bloques[0].limpio, true)
})

test('las micro detenciones no ensucian un bloque', () => {
  const intervals = [{ startAt: new Date(m(0)), cycles: 180 }]
  const machines = [maq('Ev 1', [st(1, 2, '', { name: 'Micro Detencion' })], intervals)]
  const r = ritmoDelTurno({ machines })
  assert.strictEqual(r.bloques[0].limpio, true)
})

test('la colación sí ensucia el bloque', () => {
  const intervals = [{ startAt: new Date(m(0)), cycles: 10 }]
  const machines = [maq('Ev 1', [{ ...st(0, 5, 'COLACION'), type: 'break' }], intervals)]
  const r = ritmoDelTurno({ machines })
  assert.strictEqual(r.bloques[0].limpio, false)
})

test('recuperación mide desde el fin del paro hasta que vuelve el ritmo', () => {
  const r = ritmoDelTurno({ machines: turnoDePrueba() })
  const rec = recuperacion({ bloques: r.bloques, ritmoNormal: r.ritmoNormal, desdeMs: m(28) })
  assert.strictEqual(rec.minutos, 2)         // 28 → bloque de 30
  assert.strictEqual(rec.volvioMs, m(30))
})

test('recuperación devuelve null si la línea nunca volvió al ritmo', () => {
  const intervals = [0, 1, 2].map((i) => ({ startAt: new Date(m(i * 5)), cycles: i === 0 ? 180 : 10 }))
  const machines = [maq('Ev 1', [st(5, 10, 'BOMBAS')], intervals)]
  const r = ritmoDelTurno({ machines })
  const rec = recuperacion({ bloques: r.bloques, ritmoNormal: r.ritmoNormal, desdeMs: m(10) })
  assert.strictEqual(rec.minutos, null)
})

test('tramosDeRitmo agrupa bloques consecutivos y da el % del ritmo', () => {
  const r = ritmoDelTurno({ machines: turnoDePrueba() })
  const tramos = tramosDeRitmo({ bloques: r.bloques, ritmoNormal: r.ritmoNormal, pasoMin: 5, minMinutos: 15 })
  assert.strictEqual(tramos.length, 3)
  assert.strictEqual(tramos[0].enRitmo, true)
  assert.strictEqual(tramos[1].enRitmo, false)
  assert.strictEqual(tramos[1].minutos, 15)          // bloques 3, 4 y 5
  assert.ok(tramos[1].pctDelRitmo < 0.5)
  assert.strictEqual(tramos[2].enRitmo, true)
})

test('un bache de 5 min no parte el turno en dos tramos', () => {
  // Contra el turno real salían 26 tramos porque un bloque al 89% y el
  // siguiente al 91% abrían y cerraban tramo. Eso es parpadeo del umbral, no
  // información: un bache corto tiene que absorberse en el tramo que lo rodea.
  const intervals = [180, 180, 180, 160, 180, 180, 180, 180]
    .map((c, i) => ({ startAt: new Date(m(i * 5)), cycles: c }))
  const machines = [maq('Ev 1', [], intervals)]
  const r = ritmoDelTurno({ machines })
  const tramos = tramosDeRitmo({ bloques: r.bloques, ritmoNormal: r.ritmoNormal, pasoMin: 5, minMinutos: 15 })
  assert.strictEqual(tramos.length, 1)
  assert.strictEqual(tramos[0].enRitmo, true)
})

test('una caída larga SÍ parte el turno, aunque haya baches cortos alrededor', () => {
  const intervals = [180, 180, 180, 20, 10, 15, 20, 180, 180, 180]
    .map((c, i) => ({ startAt: new Date(m(i * 5)), cycles: c }))
  const machines = [maq('Ev 1', [], intervals)]
  const r = ritmoDelTurno({ machines })
  const tramos = tramosDeRitmo({ bloques: r.bloques, ritmoNormal: r.ritmoNormal, pasoMin: 5, minMinutos: 15 })
  assert.strictEqual(tramos.length, 3)
  assert.strictEqual(tramos[1].enRitmo, false)
  assert.strictEqual(tramos[1].minutos, 20)
})

test('minMinutos nunca deja el turno sin tramos', () => {
  // Turno más corto que el mínimo: tiene que quedar UN tramo, no cero.
  const intervals = [180, 20].map((c, i) => ({ startAt: new Date(m(i * 5)), cycles: c }))
  const machines = [maq('Ev 1', [], intervals)]
  const r = ritmoDelTurno({ machines })
  const tramos = tramosDeRitmo({ bloques: r.bloques, ritmoNormal: r.ritmoNormal, pasoMin: 5, minMinutos: 60 })
  assert.strictEqual(tramos.length, 1)
  assert.strictEqual(tramos[0].minutos, 10)
})

test('sin bloques limpios no se inventa un ritmo normal', () => {
  const intervals = [{ startAt: new Date(m(0)), cycles: 50 }]
  const machines = [maq('Ev 1', [st(0, 5, 'BOMBAS')], intervals)]
  const r = ritmoDelTurno({ machines })
  assert.strictEqual(r.ritmoNormal, null)
  assert.deepStrictEqual(tramosDeRitmo({ bloques: r.bloques, ritmoNormal: null, pasoMin: 5 }), [])
})

test('el clasificador recibe el reason CRUDO, no el texto de relleno', () => {
  // Si se le pasara "(sin causa imputada)", el clasificador lo leería como una
  // causal desconocida y el informe diría "fuera del árbol" en vez de
  // "nadie imputó" — que son dos problemas distintos y se arreglan distinto.
  const vistos = []
  impactoPorCausa({
    machines: [maq('Ev 1', [st(0, 10, ''), st(20, 30, 'BOMBAS')])],
    clasificar: (r, o) => { vistos.push([r, o.esMicro]); return null },
  })
  assert.deepStrictEqual(vistos.sort(), [['', false], ['BOMBAS', false]])
})

test('marca las filas de micro detención', () => {
  const filas = impactoPorCausa({
    machines: [maq('Ev 1', [st(0, 10, '', { name: 'Micro Detencion' }), st(20, 30, 'BOMBAS')])],
  })
  assert.strictEqual(filas.find((f) => f.causa === '(micro detenciones)').esMicro, true)
  assert.strictEqual(filas.find((f) => f.causa === 'BOMBAS').esMicro, false)
})

// ── repartoDePerdida ────────────────────────────────────────────────────────

const { repartoDePerdida } = require('../lineImpact')

/** Bloques de 5 min a partir de una lista de ciclos. */
const bloquesDe = (ciclos) => ciclos.map((c, i) => ({
  inicioMs: m(i * 5), ciclos: c, piezasPorMin: c / 5, limpio: true,
}))

test('separa lo perdido parado de lo perdido reenganchando', () => {
  //            en ritmo | parada  | reenganche  | en ritmo
  const b = bloquesDe([180, 180, 0, 0, 90, 140, 180, 180])
  const r = repartoDePerdida({ machines: [], bloques: b, ritmoNormal: 36, pasoMin: 5 })
  assert.strictEqual(r.paradoPz, 360)          // 2 bloques a 0, potencial 180 c/u
  assert.strictEqual(r.reenganchePz, 130)      // (180-90) + (180-140)
  assert.strictEqual(r.degradadoPz, 0)
  assert.strictEqual(r.eventos.length, 1)
  assert.strictEqual(r.eventos[0].minParo, 10)
  assert.strictEqual(r.eventos[0].minReenganche, 10)
})

test('el reenganche se corta a los 20 min y el resto es ritmo degradado', () => {
  // Esta es la guarda que evita el error del 2026-08-18: sin tope, los 30 min
  // lentos de después se contaban como "arranque lento" y se le cargaban a la
  // contención de la falla.
  const b = bloquesDe([180, 0, 140, 140, 140, 140, 140, 140, 180])
  const r = repartoDePerdida({ machines: [], bloques: b, ritmoNormal: 36, pasoMin: 5, maxReengancheMin: 20 })
  assert.strictEqual(r.eventos[0].minReenganche, 20)
  assert.strictEqual(r.reenganchePz, 160)      // 4 bloques x 40
  assert.strictEqual(r.degradadoPz, 80)        // los 2 bloques que sobran
})

test('un tramo lento SIN paro previo es ritmo degradado, no reenganche', () => {
  const b = bloquesDe([180, 150, 150, 150, 180])
  const r = repartoDePerdida({ machines: [], bloques: b, ritmoNormal: 36, pasoMin: 5 })
  assert.strictEqual(r.reenganchePz, 0)
  assert.strictEqual(r.paradoPz, 0)
  assert.strictEqual(r.degradadoPz, 90)
  assert.deepStrictEqual(r.eventos, [])
})

test('la colación no cuenta como pérdida por falla', () => {
  const b = bloquesDe([180, 0, 0, 180])
  const machines = [{
    machineName: 'Ev 1',
    states: [{ startAt: new Date(m(5)), endAt: new Date(m(15)), type: 'break', name: 'Detencion', reason: 'COLACION' }],
  }]
  const r = repartoDePerdida({ machines, bloques: b, ritmoNormal: 36, pasoMin: 5 })
  assert.strictEqual(r.paradoPz, 0)
  assert.strictEqual(r.pausadoPz, 360)
  assert.strictEqual(r.totalPz, 0)
})

test('una segunda caída durante el reenganche abre su propio evento', () => {
  const b = bloquesDe([180, 0, 120, 0, 120, 180])
  const r = repartoDePerdida({ machines: [], bloques: b, ritmoNormal: 36, pasoMin: 5 })
  assert.strictEqual(r.eventos.length, 2)
  assert.strictEqual(r.paradoPz, 360)
})

test('sin ritmo normal no se reparte nada', () => {
  const r = repartoDePerdida({ machines: [], bloques: bloquesDe([100, 0]), ritmoNormal: null, pasoMin: 5 })
  assert.strictEqual(r.totalPz, 0)
  assert.deepStrictEqual(r.eventos, [])
})

test('el tope por defecto son 30 min (calibrado con la Baader, no con la teoria)', () => {
  // Partió en 20 y Orel lo subió a 30 el 2026-08-18: en el turno del 17-08 una
  // caída tocaba el tope exacto, señal de que se estaba mandando reenganche
  // real al saco de "degradado". Si alguien cambia el default, que se entere.
  const b = bloquesDe([180, 0, 140, 140, 140, 140, 140, 140, 180])
  const r = repartoDePerdida({ machines: [], bloques: b, ritmoNormal: 36, pasoMin: 5 })
  assert.strictEqual(r.maxReengancheMin, 30)
  assert.strictEqual(r.eventos[0].minReenganche, 30)
  assert.strictEqual(r.degradadoPz, 0)   // los 6 bloques lentos caben en el tope
})
