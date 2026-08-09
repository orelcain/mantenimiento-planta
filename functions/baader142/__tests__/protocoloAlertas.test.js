/**
 * Tests de protocoloAlertas (node:test — correr con `node --test`).
 * Los números de los casos "reales" son la lectura de terreno del 08-08-2026
 * (Baader 142 N1: 1299 pescados, E825-C = 452).
 */
const { test } = require('node:test')
const assert = require('node:assert')
const {
  tasa1000,
  nivelDeTasa,
  evaluarLectura,
  componerAlerta,
  componerRecordatorio,
} = require('../protocoloAlertas')

/** Lectura con todo en cero, para pisar solo lo que cada caso necesita. */
const base = (over = {}) => ({
  maquina: 'baader-n1', fecha: '2026-08-15', fish: 1000,
  stops: 0, stopc: 0, tclip: 0, tclipc: 0, anusi: 0, anuso: 0,
  e821: 0, e821c: 0, e822: 0, e822c: 0, e823: 0, e823c: 0,
  e824: 0, e824c: 0, e825: 0, e825c: 0,
  ...over,
})

test('tasa1000 calcula como el display: por cada 1000 pescados', () => {
  assert.strictEqual(tasa1000(452, 1299), 348)
  assert.strictEqual(tasa1000(0, 1299), 0)
})

test('tasa1000 sin pescados devuelve 0 en vez de dividir por cero', () => {
  assert.strictEqual(tasa1000(10, 0), 0)
  assert.strictEqual(tasa1000(10, undefined), 0)
})

test('nivelDeTasa respeta los umbrales 5 / 30 / 100', () => {
  assert.strictEqual(nivelDeTasa(0), 'normal')
  assert.strictEqual(nivelDeTasa(4), 'normal')
  assert.strictEqual(nivelDeTasa(5), 'vigilar')
  assert.strictEqual(nivelDeTasa(30), 'intervenir')
  assert.strictEqual(nivelDeTasa(100), 'critico')
  assert.strictEqual(nivelDeTasa(348), 'critico')
})

test('el caso real del 08-08: el excavador B sale crítico y encabeza', () => {
  const ev = evaluarLectura(base({ fish: 1299, e825c: 452, e824c: 3, e822c: 1 }), [])
  assert.strictEqual(ev.alertas.length, 1)
  assert.strictEqual(ev.alertas[0].tipo, 'umbral')
  assert.strictEqual(ev.alertas[0].sm, 'SM5')
  assert.strictEqual(ev.alertas[0].nivel, 'critico')
  assert.strictEqual(ev.alertas[0].tasa, 348)
})

test('una máquina sana no genera ninguna alerta', () => {
  const ev = evaluarLectura(base({ fish: 5000, e821c: 2, e824c: 4 }), [])
  assert.deepStrictEqual(ev.alertas, [])
  assert.strictEqual(componerAlerta(ev), null)
})

test('paradas sin correcciones previas son falla dura, no desgaste', () => {
  const ev = evaluarLectura(base({ e823: 4, e823c: 0 }), [])
  assert.strictEqual(ev.alertas[0].tipo, 'falla-dura')
  assert.strictEqual(ev.alertas[0].sm, 'SM3')
  assert.strictEqual(ev.alertas[0].ind, 'B3')
  assert.strictEqual(ev.alertas[0].paradas, 4)
})

test('avisa por tendencia cuando sube en las DOS últimas lecturas', () => {
  const ev = evaluarLectura(base({ e822c: 9 }), [base({ e822c: 7 }), base({ e822c: 5 })])
  assert.strictEqual(ev.alertas[0].tipo, 'tendencia')
  assert.strictEqual(ev.alertas[0].sm, 'SM2')
  assert.strictEqual(ev.alertas[0].tasa, 9)
})

test('no confunde ruido con tendencia: 0 → 1 → 2 por mil no alerta', () => {
  const ev = evaluarLectura(base({ e822c: 2 }), [base({ e822c: 1 }), base({ e822c: 0 })])
  assert.deepStrictEqual(ev.alertas, [])
})

test('una sola subida no alcanza: hacen falta dos tramos', () => {
  const ev = evaluarLectura(base({ e822c: 9 }), [base({ e822c: 5 })])
  assert.deepStrictEqual(ev.alertas, [])
})

test('compara TASAS, no totales: más pescados con las mismas correcciones no es subida', () => {
  // 20/1000 → 10/2000: la tasa bajó a la mitad aunque el total absoluto sea igual.
  const ev = evaluarLectura(
    base({ fish: 2000, e824c: 20 }),
    [base({ fish: 1000, e824c: 20 })],
  )
  assert.deepStrictEqual(ev.alertas, [])
})

test('marca cuando la tasa quedó igual, para que no parezca un hallazgo nuevo', () => {
  const ev = evaluarLectura(base({ e825c: 50 }), [base({ e825c: 50 })])
  assert.strictEqual(ev.alertas[0].nivel, 'intervenir')
  assert.strictEqual(ev.alertas[0].igual, true)
  assert.match(componerAlerta(ev), /sigue sin corregirse/)
})

test('ordena por gravedad: lo crítico va primero', () => {
  const ev = evaluarLectura(base({ e821c: 40, e825c: 150 }), [])
  assert.deepStrictEqual(ev.alertas.map((a) => a.sm), ['SM5', 'SM1'])
})

test('la alerta nombra herramienta, tasa, máquina y deja el link', () => {
  const msg = componerAlerta(evaluarLectura(base({ fish: 1299, e825c: 452 }), []))
  assert.match(msg, /Excavador B SM5/)
  assert.match(msg, /348/)
  assert.match(msg, /Baader 142 N1/)
  assert.match(msg, /aprendizaje\/perilla-5\?vista=protocolo/)
})

test('en falla dura manda a mirar el inductivo, no la correa', () => {
  const msg = componerAlerta(evaluarLectura(base({ e824: 3, e824c: 0 }), []))
  assert.match(msg, /inductivo B4/)
  assert.match(msg, /No es desgaste/)
})

test('sin alertas no hay mensaje: no se mandan avisos vacíos', () => {
  assert.strictEqual(componerAlerta(evaluarLectura(base(), [])), null)
  assert.strictEqual(componerAlerta(null), null)
})

test('el recordatorio calla cuando ya se registraron las tres', () => {
  assert.strictEqual(componerRecordatorio(['baader-n1', 'baader-n2', 'baader-n3']), null)
})

test('el recordatorio lista las que faltan con su última fecha y marca las hechas', () => {
  const msg = componerRecordatorio(['baader-n1'], {
    'baader-n2': '2026-08-01', 'baader-n1': '2026-08-15',
  })
  assert.match(msg, /⬜ Baader 142 N2/)
  assert.match(msg, /última: 2026-08-01/)
  assert.match(msg, /⬜ Baader 142 N3/)
  assert.match(msg, /sin registros todavía/)
  assert.match(msg, /✅ Baader 142 N1/)
})

test('el recordatorio repite la regla de no resetear, que es el motivo de todo esto', () => {
  assert.match(componerRecordatorio([]), /no resetear el protocolo/)
})
