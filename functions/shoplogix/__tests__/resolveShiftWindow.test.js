/**
 * Tests de resolveShiftWindow (node:test nativo — correr con `node --test`).
 *
 * El caso real que motivó la función: 3-ago-2026, Chonchi "Turno 2". Shoplogix
 * re-etiquetó intervals de otro turno como suyos (su propia reconciliación
 * registró +7.129 piezas 24 h después del cierre), así que la ventana derivada
 * de intervals quedó en 22,75 h — 09:15 hasta las 08:00 del día siguiente — y se
 * tragó los turnos vecinos. Al segmentar el Excel del Grader con esa ventana,
 * 6.526 piezas quedaron fuera de todo turno y desaparecieron de los KPIs.
 *
 * La función es deliberadamente conservadora: solo corrige cuando el derivado es
 * imposible Y el oficial es creíble. En cualquier otro caso respeta el derivado,
 * que es el comportamiento histórico.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { resolveShiftWindow } = require('../sync')

// wall-clock-as-UTC, la escala en que viaja todo lo derivado de intervals
const t = (dia, h, m = 0) => new Date(Date.UTC(2026, 7, dia, h, m))

test('caso real 3-ago: ventana derivada de 22,75 h se reemplaza por el horario oficial', () => {
  const r = resolveShiftWindow({
    scheduledStart: t(3, 9, 15),
    scheduledEnd:   t(4, 8, 0),      // ← 22,75 h: imposible
    officialStart:  t(3, 9, 15),
    officialEnd:    t(3, 17, 0),     // ← 7,75 h: el turno de día real
  })
  assert.strictEqual(r.corregida, true)
  assert.strictEqual(r.start.toISOString(), t(3, 9, 15).toISOString())
  assert.strictEqual(r.end.toISOString(), t(3, 17, 0).toISOString())
  assert.match(r.motivo, /imposible/)
})

test('turno normal: no se toca aunque haya oficial distinto', () => {
  const r = resolveShiftWindow({
    scheduledStart: t(3, 21, 15),
    scheduledEnd:   t(4, 5, 0),      // 7,75 h: creíble
    officialStart:  t(3, 21, 0),
    officialEnd:    t(4, 6, 0),
  })
  assert.strictEqual(r.corregida, false)
  assert.strictEqual(r.end.toISOString(), t(4, 5, 0).toISOString())
})

test('el turno más largo real (Yal 14:45→00:00, 9,25 h) NO se considera imposible', () => {
  const r = resolveShiftWindow({
    scheduledStart: t(3, 14, 45),
    scheduledEnd:   t(4, 0, 0),
    officialStart:  t(3, 15, 0),
    officialEnd:    t(3, 23, 0),
  })
  assert.strictEqual(r.corregida, false)
})

test('derivado imposible pero SIN oficial: se respeta el derivado (no se inventa ventana)', () => {
  const r = resolveShiftWindow({
    scheduledStart: t(3, 9, 15),
    scheduledEnd:   t(4, 8, 0),
    officialStart:  undefined,
    officialEnd:    undefined,
  })
  assert.strictEqual(r.corregida, false)
  assert.strictEqual(r.end.toISOString(), t(4, 8, 0).toISOString())
})

test('derivado imposible y oficial TAMBIÉN imposible: no se corrige', () => {
  const r = resolveShiftWindow({
    scheduledStart: t(3, 9, 15),
    scheduledEnd:   t(4, 8, 0),
    officialStart:  t(3, 9, 15),
    officialEnd:    t(4, 9, 0),      // 23,75 h
  })
  assert.strictEqual(r.corregida, false)
})

test('oficial de OTRO día (plantilla corrida): no se adopta', () => {
  const r = resolveShiftWindow({
    scheduledStart: t(3, 9, 15),
    scheduledEnd:   t(4, 8, 0),
    officialStart:  t(1, 9, 15),     // 48 h antes del arranque derivado
    officialEnd:    t(1, 17, 0),
  })
  assert.strictEqual(r.corregida, false)
})

test('oficial invertido o de duración cero: no se adopta', () => {
  for (const [oStart, oEnd] of [[t(3, 17, 0), t(3, 9, 15)], [t(3, 9, 15), t(3, 9, 15)]]) {
    const r = resolveShiftWindow({
      scheduledStart: t(3, 9, 15), scheduledEnd: t(4, 8, 0),
      officialStart: oStart, officialEnd: oEnd,
    })
    assert.strictEqual(r.corregida, false)
  }
})

test('fechas inválidas en el oficial no rompen ni corrigen', () => {
  const r = resolveShiftWindow({
    scheduledStart: t(3, 9, 15),
    scheduledEnd:   t(4, 8, 0),
    officialStart:  new Date('no-es-fecha'),
    officialEnd:    t(3, 17, 0),
  })
  assert.strictEqual(r.corregida, false)
})
