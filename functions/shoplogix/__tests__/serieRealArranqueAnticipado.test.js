/**
 * El caso completo del 04→05 de agosto, con la serie de intervals RECONSTRUIDA
 * a partir de la respuesta real del probe de Shoplogix.
 *
 * El probe devolvió, para la ventana del 04-ago (08:00 → 08:00 del 05):
 *   Turno 2      :  93 intervals · 08:00 del 04 → 08:00 del 05 · 2.495 ciclos
 *   Unscheduled  : 102 intervals · 15:00 del 04 → 07:15 del 05 · 0 ciclos
 *   Turno 1      :  93 intervals · desde 21:15 del 04
 *
 * La reconstrucción de abajo produce EXACTAMENTE esos tres conteos, lo que
 * confirma que representa el día real y no una idealización: 93 del Turno 2 son
 * 84 de ayer (08:00→15:00) + 9 del arranque de hoy (07:15→08:00); 102 del
 * Unscheduled son 75 (15:00→21:15) + 27 (05:00→07:15); 93 del Turno 1 son las
 * 7 h 45 de 21:15 a 05:00.
 *
 * Es el test de integración que faltaba: prueba el agrupamiento a escala real,
 * con intervals contiguos, no con cuatro sintéticos.
 */
const test = require('node:test')
const assert = require('node:assert')

const { deriveShiftGroups, shiftDateKeyFromStart } = require('../sync')

const pad = (n) => String(n).padStart(2, '0')
const stamp = (d) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
  `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}.000`

/** Serie contigua de intervals de 5 min, como los emite Shoplogix. */
function serie(shift, desde, hasta, cycles) {
  const out = []
  let t = new Date(desde)
  const fin = new Date(hasta)
  while (t < fin) {
    const next = new Date(t.getTime() + 5 * 60_000)
    out.push({ shift, start: stamp(t), end: stamp(next), cycles, expectedCycles: 200 })
    t = next
  }
  return out
}

const DIA_REAL = [
  ...serie('Turno 2', '2026-08-04T08:00:00Z', '2026-08-04T15:00:00Z', 25),
  ...serie('Unscheduled', '2026-08-04T15:00:00Z', '2026-08-04T21:15:00Z', 0),
  ...serie('Turno 1', '2026-08-04T21:15:00Z', '2026-08-05T05:00:00Z', 120),
  ...serie('Unscheduled', '2026-08-05T05:00:00Z', '2026-08-05T07:15:00Z', 0),
  // El arranque anticipado del turno de HOY: los 45 min en disputa.
  ...serie('Turno 2', '2026-08-05T07:15:00Z', '2026-08-05T08:00:00Z', 30),
]

const groups = () => deriveShiftGroups([{ machineProduction: DIA_REAL }], 'chonchi')

test('la serie reconstruida reproduce los conteos del probe real', () => {
  const cuenta = (s) => DIA_REAL.filter((i) => i.shift === s).length
  assert.strictEqual(cuenta('Turno 2'), 93)
  assert.strictEqual(cuenta('Unscheduled'), 102)
  assert.strictEqual(cuenta('Turno 1'), 93)
})

test('el "Turno 2" se separa en los DOS turnos que es, no en uno de 24 h', () => {
  const t2 = groups().filter((g) => g.shiftId === 'Turno 2')
  assert.strictEqual(t2.length, 2)

  const [ayer, hoy] = t2
  assert.strictEqual(shiftDateKeyFromStart(ayer.scheduledStart), '2026-08-04')
  assert.strictEqual(shiftDateKeyFromStart(hoy.scheduledStart), '2026-08-05')
})

test('el turno de AYER deja de absorber el arranque del día siguiente', () => {
  // Antes: scheduledEnd = 08:00 del 05, con 16.398 ciclos que incluían 45 min
  // que no eran suyos.
  const ayer = groups().find(
    (g) => g.shiftId === 'Turno 2' && shiftDateKeyFromStart(g.scheduledStart) === '2026-08-04')
  assert.strictEqual(ayer.scheduledEnd.toISOString(), '2026-08-04T15:00:00.000Z')
})

test('el turno de HOY recupera sus 45 min de arranque', () => {
  const hoy = groups().find(
    (g) => g.shiftId === 'Turno 2' && shiftDateKeyFromStart(g.scheduledStart) === '2026-08-05')
  assert.strictEqual(hoy.scheduledStart.toISOString(), '2026-08-05T07:15:00.000Z')
})

test('el turno nocturno no se parte pese a cruzar medianoche', () => {
  const t1 = groups().filter((g) => g.shiftId === 'Turno 1')
  assert.strictEqual(t1.length, 1)
  assert.strictEqual(t1[0].scheduledStart.toISOString(), '2026-08-04T21:15:00.000Z')
  assert.strictEqual(t1[0].scheduledEnd.toISOString(), '2026-08-05T05:00:00.000Z')
})

test('el Unscheduled sale como UN bloque, igual que lo reporta Shoplogix', () => {
  // El nocturno corre "encima" con otra etiqueta: son dos rótulos del mismo
  // tramo de tiempo, no dos bloques que haya que separar.
  const uns = groups().filter((g) => g.shiftId === 'Unscheduled')
  assert.strictEqual(uns.length, 1)
  assert.strictEqual(uns[0].scheduledStart.toISOString(), '2026-08-04T15:00:00.000Z')
  assert.strictEqual(uns[0].scheduledEnd.toISOString(), '2026-08-05T07:15:00.000Z')
})

test('ningún grupo abarca la ventana entera', () => {
  for (const g of groups()) {
    const h = (g.scheduledEnd - g.scheduledStart) / 3_600_000
    assert.ok(h <= 20, `${g.shiftId} dura ${h.toFixed(1)} h`)
  }
})
