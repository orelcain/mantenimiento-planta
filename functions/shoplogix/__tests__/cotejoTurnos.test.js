/**
 * Tests de `cotejoTurnos` (node:test nativo — correr con `node --test`).
 *
 * El punto que fijan: el emparejamiento va por VENTANA, no por nombre. Los
 * casos usan los turnos reales que rompen el atajo del nombre —"Turno 1" y
 * "Turno 1 Lunes" de Chonchi son turnos distintos con el mismo prefijo— y los
 * turnos sin producción, que si entran al promedio hacen que el cotejo mienta
 * a nuestro favor.
 */

const test = require('node:test')
const assert = require('node:assert')

const {
  horaDePlanta,
  distanciaHoraria,
  esComparable,
  seleccionarComparables,
  resumirTurno,
  armarCotejo,
} = require('../cotejoTurnos')

// Ventanas en wall-clock-as-UTC, como llegan de Shoplogix.
const w = (fecha, hIni, hFin, minIni = 0, minFin = 0) => ({
  inicioMs: Date.parse(`${fecha}T${String(hIni).padStart(2, '0')}:${String(minIni).padStart(2, '0')}:00Z`),
  finMs: Date.parse(`${fecha}T${String(hFin).padStart(2, '0')}:${String(minFin).padStart(2, '0')}:00Z`)
    + (hFin <= hIni ? 86_400_000 : 0),
})

// ── Hora de planta ──────────────────────────────────────────────────────────

test('la hora sale del reloj de planta, sin convertir zona', () => {
  // Si se convirtiera a hora local del servidor, un turno que arranca 21:15 en
  // Chiloé aparecería a otra hora y dejaría de emparejar con los demás.
  assert.strictEqual(horaDePlanta(Date.parse('2026-08-17T21:15:00Z')), 21.25)
})

test('la distancia horaria cruza la medianoche', () => {
  assert.strictEqual(distanciaHoraria(21.5, 0.5), 3)
  assert.strictEqual(distanciaHoraria(23, 1), 2)
  assert.strictEqual(distanciaHoraria(9, 21), 12)
})

// ── Comparabilidad ──────────────────────────────────────────────────────────

test('dos noches del mismo turno son comparables', () => {
  assert.ok(esComparable(w('2026-08-17', 21, 5, 15), w('2026-08-13', 21, 5, 15)))
})

test('"Turno 1" y "Turno 1 Lunes" NO son comparables aunque compartan nombre', () => {
  // Chonchi real: Turno 1 arranca 21:15 y "Turno 1 Lunes" a las 00:00. Filtrar
  // por prefijo del nombre los mezclaría y el cotejo compararía peras con papas.
  const noche = w('2026-08-17', 21, 5, 15)
  const lunes = w('2026-08-17', 0, 7, 0, 15)
  assert.strictEqual(esComparable(noche, lunes), false)
})

test('el turno de día no se compara con el de noche', () => {
  assert.strictEqual(esComparable(w('2026-08-17', 21, 5, 15), w('2026-08-17', 9, 17, 15)), false)
})

test('una duración muy distinta rompe la comparación', () => {
  // Mismo horario de inicio pero 3 h en vez de 7:45: no es el mismo turno.
  assert.strictEqual(esComparable(w('2026-08-17', 21, 5, 15), w('2026-08-16', 21, 0, 15)), false)
})

test('tolera los corrimientos chicos de inicio', () => {
  // Los turnos reales arrancan 21:15 o 21:30 según el día.
  assert.ok(esComparable(w('2026-08-17', 21, 5, 15), w('2026-08-10', 21, 5, 30)))
})

// ── Selección ───────────────────────────────────────────────────────────────

const turno = (id, fecha, ciclos, hIni = 21, hFin = 5) => ({ id, ciclos, ...w(fecha, hIni, hFin, 15) })

test('elige los comparables anteriores, del más reciente al más antiguo', () => {
  const ref = turno('2026-08-17_Turno 1', '2026-08-17', 12352)
  const cand = [
    ref,
    turno('2026-08-13_Turno 1', '2026-08-13', 8159),
    turno('2026-08-11_Turno 1', '2026-08-11', 12341),
    turno('2026-08-10_Turno 1', '2026-08-10', 12170),
  ]
  const sel = seleccionarComparables(cand, ref, { n: 2 })
  assert.deepStrictEqual(sel.map((t) => t.id), ['2026-08-13_Turno 1', '2026-08-11_Turno 1'])
})

test('deja fuera los turnos sin producción', () => {
  // Agosto 2026 tuvo tres noches con la planta parada. Si entran al cotejo, la
  // mediana se hunde y cualquier turno normal parece excelente.
  const ref = turno('2026-08-17_Turno 1', '2026-08-17', 12352)
  const cand = [
    ref,
    turno('2026-08-14_Turno 1', '2026-08-14', 0),
    turno('2026-08-12_Turno 1', '2026-08-12', 0),
    turno('2026-08-11_Turno 1', '2026-08-11', 12341),
  ]
  assert.deepStrictEqual(
    seleccionarComparables(cand, ref).map((t) => t.id),
    ['2026-08-11_Turno 1'],
  )
})

test('nunca se compara consigo mismo ni con turnos posteriores', () => {
  const ref = turno('2026-08-13_Turno 1', '2026-08-13', 8159)
  const cand = [ref, turno('2026-08-17_Turno 1', '2026-08-17', 12352)]
  assert.deepStrictEqual(seleccionarComparables(cand, ref), [])
})

test('mezcla de turnos: solo entran los de la misma ventana', () => {
  const ref = turno('2026-08-17_Turno 1', '2026-08-17', 12352)
  const cand = [
    ref,
    turno('2026-08-16_Turno 2', '2026-08-16', 9000, 9, 17),      // día
    turno('2026-08-16_Turno 1 Lunes', '2026-08-16', 5000, 0, 7), // otra ventana
    turno('2026-08-15_Turno 1', '2026-08-15', 11000),            // sí
  ]
  assert.deepStrictEqual(
    seleccionarComparables(cand, ref).map((t) => t.id),
    ['2026-08-15_Turno 1'],
  )
})

// ── Veredicto ───────────────────────────────────────────────────────────────

test('reconoce el turno como el mejor del período', () => {
  // El caso real del 17-08: la noche con más falla mecánica y la de más
  // producción del mes.
  const ref = turno('2026-08-17_Turno 1', '2026-08-17', 12352)
  const prev = [
    turno('2026-08-13_Turno 1', '2026-08-13', 8159),
    turno('2026-08-11_Turno 1', '2026-08-11', 12341),
    turno('2026-08-10_Turno 1', '2026-08-10', 12170),
    turno('2026-08-07_Turno 1', '2026-08-07', 9652),
  ]
  const c = armarCotejo(ref, prev)
  assert.strictEqual(c.veredicto, 'mejor-del-periodo')
  assert.strictEqual(c.mejorPrevio, 12341)
  assert.ok(c.difVsMediana > 0)
  // Las filas van en orden cronológico y la referencia va marcada.
  assert.strictEqual(c.filas[c.filas.length - 1].esReferencia, true)
  assert.strictEqual(c.filas.length, 5)
})

test('un turno flojo se informa como flojo', () => {
  const ref = turno('2026-08-13_Turno 1', '2026-08-13', 8159)
  const prev = [
    turno('2026-08-11_Turno 1', '2026-08-11', 12341),
    turno('2026-08-10_Turno 1', '2026-08-10', 12170),
    turno('2026-08-07_Turno 1', '2026-08-07', 9652),
  ]
  const c = armarCotejo(ref, prev)
  assert.strictEqual(c.veredicto, 'bajo-la-mediana')
  assert.ok(c.difVsMediana < 0)
})

test('con menos de 3 comparables no se emite veredicto', () => {
  // Un veredicto sacado de dos turnos no se sostiene en una reunión.
  const ref = turno('2026-08-17_Turno 1', '2026-08-17', 12352)
  const c = armarCotejo(ref, [turno('2026-08-11_Turno 1', '2026-08-11', 12341)])
  assert.strictEqual(c.veredicto, 'sin-comparables')
  assert.strictEqual(c.comparados, 1)
})

// ── Resumen del turno ───────────────────────────────────────────────────────

const st = (a, b, reason, type = 'downtime', name = 'Detencion') => ({
  startAt: new Date(Date.parse(`2026-08-17T${a}:00Z`)),
  endAt: new Date(Date.parse(`2026-08-17T${b}:00Z`)),
  type, name, reason,
})

test('la detención de línea NO es la suma de las uniones por causa', () => {
  // Dos causas que se solapan en el tiempo: sumar sus uniones contaría dos
  // veces el mismo minuto y el informe declararía más línea detenida de la que
  // hubo — el error opuesto al del resumen de área, pero igual de malo.
  const machines = [
    { machineName: 'Ev 1', totalCycles: 100, states: [st('21:00', '21:20', 'BOMBAS')], intervals: [] },
    { machineName: 'Ev 2', totalCycles: 100, states: [st('21:10', '21:30', 'GRADER')], intervals: [] },
  ]
  const r = resumirTurno({ machines })
  const sumaDeUniones = r.causas.reduce((a, c) => a + c.unionSec, 0)
  assert.strictEqual(sumaDeUniones, 40 * 60)      // 20 + 20, con 10 min repetidos
  assert.strictEqual(r.detencion.unionSec, 30 * 60) // la línea: 21:00 → 21:30
  assert.strictEqual(r.detencion.todasSec, 10 * 60) // 21:10 → 21:20
})

test('el resumen separa lo de Mantención de lo que no lo es', () => {
  const clasificar = (reason) => ({ esDeMantencion: reason === 'BOMBAS', sinCausa: !reason })
  const machines = [
    { machineName: 'Ev 1', totalCycles: 50, states: [st('21:00', '21:30', 'BOMBAS')], intervals: [] },
    { machineName: 'Ev 2', totalCycles: 50, states: [st('21:00', '21:30', 'FALTA MMPP')], intervals: [] },
  ]
  const r = resumirTurno({ machines, clasificar })
  assert.strictEqual(r.ciclos, 100)
  assert.strictEqual(r.mantencionEquivSec, 15 * 60)   // 30 min ÷ 2 máquinas
  assert.strictEqual(r.detencion.equivalenteLineaSec, 30 * 60)
})

test('la colación se resume aparte de las detenciones', () => {
  const machines = [
    { machineName: 'Ev 1', totalCycles: 10, states: [st('21:00', '21:50', 'COLACION', 'break')], intervals: [] },
  ]
  const r = resumirTurno({ machines })
  assert.strictEqual(r.causas.length, 0)
  assert.strictEqual(r.pausas.length, 1)
  assert.strictEqual(r.pausas[0].causa, 'COLACION')
})

test('deja fuera el turno que apenas alcanzó a correr', () => {
  // Caso real: Chonchi 2026-07-31 hizo 759 piezas contra una mediana de ~10.000
  // (corrió menos de 2 h). Pasaba el umbral de 50 y hundía la mediana, con lo
  // que cualquier turno corriente parecía excelente.
  const ref = turno('2026-08-13_Turno 1', '2026-08-13', 8159)
  const cand = [
    ref,
    turno('2026-07-31_Turno 1', '2026-07-31', 759),
    turno('2026-08-04_Turno 1', '2026-08-04', 11231),
    turno('2026-08-06_Turno 1', '2026-08-06', 10053),
    turno('2026-08-10_Turno 1', '2026-08-10', 12170),
  ]
  const sel = seleccionarComparables(cand, ref)
  assert.ok(!sel.some((t) => t.id === '2026-07-31_Turno 1'), 'el turno trunco no debe entrar')
  assert.strictEqual(sel.length, 3)
})

test('el piso es relativo, no un número fijo por planta', () => {
  // Yal produce ~20.000 por turno y Chonchi ~12.000: un absoluto habría que
  // mantenerlo a mano. 10.000 es normal en Yal y sospechoso en Chonchi.
  const refYal = turno('2026-08-17_Turno 2', '2026-08-17', 20916, 15, 23)
  const candYal = [
    refYal,
    turno('2026-08-09_Turno 2', '2026-08-09', 10343, 15, 23),
    turno('2026-08-10_Turno 2', '2026-08-10', 21746, 15, 23),
    turno('2026-08-11_Turno 2', '2026-08-11', 15929, 15, 23),
    turno('2026-08-12_Turno 2', '2026-08-12', 19532, 15, 23),
  ]
  const sel = seleccionarComparables(candYal, refYal)
  assert.ok(sel.some((t) => t.id === '2026-08-09_Turno 2'), '10.343 es un turno flojo pero real en Yal')
})
