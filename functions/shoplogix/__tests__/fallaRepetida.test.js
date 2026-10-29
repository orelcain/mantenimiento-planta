/**
 * Falla repetida (28-10-2026). Cifras de referencia del estudio con el volcado
 * real: Chonchi ago-26 62 % de 170 episodios, sep-26 43 % de 47; Yal oct-26 36 % de 69.
 */
const test = require('node:test')
const assert = require('node:assert')
const F = require('../fallaRepetida')

const T0 = Date.parse('2026-10-20T08:00:00Z') // wall-clock-as-UTC
const at = (min) => T0 + min * 60_000
const up = (a, b) => ({ startAt: at(a), durationSec: (b - a) * 60, type: 'uptime', name: 'Produciendo', reason: '' })
const paro = (m, dur, reason, name = 'Detencion') => ({ startAt: at(m), durationSec: dur * 60, type: 'downtime', name, reason })

test('causaDeFalla: Mantención sí; Ajuste, contratistas y no-Mantención no; cuchillerías B200 juntas', () => {
  assert.equal(F.causaDeFalla('LOGICA'), 'Lógica')
  assert.equal(F.causaDeFalla('AJUSTE MANTENIMIENTO'), null)
  assert.equal(F.causaDeFalla('TRABAJOS CONTRATISTAS'), null)
  assert.equal(F.causaDeFalla('COLACION'), null)
  assert.equal(F.causaDeFalla('BAADER 200/CUCHILLERIA DORSAL'), 'Cuchillería')
})

test('vuelve en ≤ 8 h de operación, contadas en uptime y no en reloj', () => {
  // 20 h de reloj entre paros pero 230 min produciendo → vuelve.
  const { episodios } = F.episodiosMaquina([paro(0, 10, 'MOTORES'), up(10, 130), up(1100, 1210), paro(1210, 5, 'MOTORES'), up(1215, 1215 + 600)])
  assert.equal(episodios.length, 2)
  assert.equal(episodios[0].vuelve, true)
  assert.equal(episodios[1].esRepeticion, true)
  assert.ok(Math.abs(episodios[1].opHDesdeAnterior - 230 / 60) < 1e-9)
  assert.equal(episodios[1].vuelve, false) // 10 h de operación después sin volver
})

test('vuelve = null si no hay 8 h de operación por delante (todavía no se sabe)', () => {
  const { episodios } = F.episodiosMaquina([paro(0, 10, 'LOGICA'), up(10, 100)])
  assert.equal(episodios[0].vuelve, null)
})

test('encadena paros < 12 min, ignora micros, paros < 2 min y duplicados', () => {
  const p = paro(300, 5, 'CINTAS')
  const { episodios } = F.episodiosMaquina([
    paro(0, 5, 'CINTAS'), up(5, 15), paro(15, 5, 'CINTAS'),
    paro(100, 9, 'CINTAS', 'Micro Detencion'), paro(150, 1, 'CINTAS'),
    up(20, 300), p, { ...p },
  ])
  assert.equal(episodios.length, 2)
  assert.equal(episodios[0].paros, 2)
  assert.equal(episodios[1].paros, 1)
})

test('resumirReincidencia: meses con «pocos datos» y azar menor que la tasa', () => {
  const states = []
  let t = 0
  for (let i = 0; i < 6; i++) { states.push(up(t, t + 60), paro(t + 60, 10, 'LOGICA')); t += 70 }
  states.push(up(t, t + 2000))
  const r = F.resumirReincidencia([{ machineid: 'm', name: 'Ev3', states }])
  assert.equal(r.meses.length, 1)
  assert.equal(r.meses[0].pocosDatos, true)
  const c = r.causas[0]
  assert.equal(c.causa, 'Lógica')
  assert.equal(c.episodios, 6)
  assert.equal(c.vuelven, 5)
  assert.ok(c.azar > 0 && c.azar < c.tasa)
})

test('avisosFallaRepetida: solo al soltar la máquina, con causa de tasa alta y historia suficiente', () => {
  const causas = [{ causa: 'Knuro', episodios: 29, vuelven: 17, tasa: 17 / 29 }, { causa: 'Correas', episodios: 16, vuelven: 1, tasa: 1 / 16 }]
  const m = (states) => [{ id: 'm2', name: 'YAL Evisceradora 2', states }]
  const cerrado = [up(0, 60), paro(60, 10, 'KNURO'), up(70, 80)]
  const [a] = F.avisosFallaRepetida(m(cerrado), causas, at(85))
  assert.deepStrictEqual({ causa: a.causa, deCada10: a.deCada10, vuelven: a.vuelven, episodios: a.episodios }, { causa: 'Knuro', deCada10: 6, vuelven: 17, episodios: 29 })
  // Todavía detenida: no avisa.
  assert.equal(F.avisosFallaRepetida(m([up(0, 60), paro(60, 10, 'KNURO')]), causas, at(65)).length, 0)
  // Pasó la ventana de 30 min: no avisa.
  assert.equal(F.avisosFallaRepetida(m(cerrado), causas, at(70 + 31)).length, 0)
  // Causa que casi no vuelve: no avisa.
  assert.equal(F.avisosFallaRepetida(m([up(0, 60), paro(60, 10, 'CORREAS'), up(70, 80)]), causas, at(85)).length, 0)
  // Causa con poca historia: no avisa.
  assert.equal(F.avisosFallaRepetida(m(cerrado), [{ causa: 'Knuro', episodios: 5, vuelven: 4, tasa: 0.8 }], at(85)).length, 0)
})
