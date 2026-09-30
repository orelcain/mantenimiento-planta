/**
 * Avisos de detención con umbral aprendido (30-09-2026).
 * Casos reales: el paro de las 11:37 de la Ev1 del 29-09 avisado dos veces
 * (turno + Unscheduled); el re-sync de agosto disparando avisos el 30-09 01:50.
 */
const test = require('node:test')
const assert = require('node:assert')
const A = require('../avisosParos')

const W = (iso) => Date.parse(iso) // wall-clock-as-UTC
const paro = (hhmm, min, reason, extra = {}) => ({
  type: 'downtime', name: 'Detencion', reason,
  startAt: new Date(`2026-09-29T${hhmm}:00Z`), durationSec: Math.round(min * 60), ...extra,
})

test('normCausa: variantes de la misma causa se juntan', () => {
  assert.equal(A.normCausa('Equipo Auxiliar / GEA'), A.normCausa('Equipo Auxiliar/GEA'))
  assert.equal(A.normCausa('EJERCICIO  COMPENSATORIO'), 'EJERCICIO COMPENSATORIO')
  assert.equal(A.normCausa(''), '(SIN CAUSA)')
})

test('calcularUmbrales: p90 de su causa, mínimo 5 min, 10 min con poca historia', () => {
  // «Acumulación rechazo»: casi siempre 3-5 min, alguna larga.
  const acumulacion = [3, 3, 3.5, 4, 4, 4.3, 4.5, 5, 5, 6, 8.5, 12].map((min) => ({ causa: 'ACUMULACION RECHAZO', min }))
  const cortas = [3, 3, 3.2, 3.4, 3.5, 3.6, 3.8, 4].map((min) => ({ causa: 'ATASCAMIENTO', min }))
  const rara = [{ causa: 'KNURO', min: 40 }]
  const t = A.calcularUmbrales([...acumulacion, ...cortas, ...rara])
  const fila = (c) => t.find((f) => f.causa === c)
  // 12 casos ordenados: el p90 (posición 9 de 0..11) es 6 → umbral 6 min.
  assert.equal(fila('ACUMULACION RECHAZO').umbralMin, 6)
  assert.equal(fila('ACUMULACION RECHAZO').p50, 4.3)
  assert.equal(fila('ATASCAMIENTO').umbralMin, 5, 'nunca bajo 5 min aunque su p90 sea menor')
  assert.equal(fila('KNURO').umbralMin, 10, 'con menos de 8 casos manda el fijo de 10')
})

test('esTurnoAvisable: nunca Unscheduled, nunca días viejos; el nocturno de ayer sí', () => {
  const ahora = W('2026-09-30T01:50:00Z')
  assert.equal(A.esTurnoAvisable('2026-09-29_Unscheduled', ahora), false)
  assert.equal(A.esTurnoAvisable('2026-09-26_Unscheduled@16:15', ahora), false)
  assert.equal(A.esTurnoAvisable('2026-08-20_Turno 2', ahora), false, 'el re-sync de agosto no avisa')
  assert.equal(A.esTurnoAvisable('2026-09-29_Turno 1', ahora), true, 'nocturno que arrancó ayer 21:15')
  assert.equal(A.esTurnoAvisable('2026-09-30_Turno 2', ahora), true)
})

test('parosParaAvisar: solo los que pasan el umbral de SU causa', () => {
  const tabla = [
    { causa: 'ACUMULACION RECHAZO', n: 68, p50: 4.3, p90: 8.5, umbralMin: 8.5 },
    { causa: 'SAP', n: 37, p50: 12.5, p90: 23.8, umbralMin: 23.8 },
  ]
  const states = [
    paro('07:27', 3, 'ACUMULACION RECHAZO'),       // normal → no
    paro('09:17', 4, 'ACUMULACION RECHAZO'),       // normal → no
    paro('11:37', 13, 'ACUMULACION RECHAZO'),      // largo para su causa → sí
    paro('12:00', 15, 'SAP'),                      // normal para SAP → no
    paro('13:00', 11, 'CAUSA NUEVA'),              // sin historia: umbral 10 → sí
    { type: 'break', name: 'Detencion', reason: 'COLACION', startAt: new Date('2026-09-29T13:30:00Z'), durationSec: 3000 },
    { type: 'downtime', name: 'Micro Detencion', reason: '', startAt: new Date('2026-09-29T14:00:00Z'), durationSec: 900 },
  ]
  const { nuevas } = A.parosParaAvisar({
    states, tabla, usarAprendido: true, minFijoMin: 3, nowWallMs: W('2026-09-29T15:00:00Z'), yaNotificadas: new Set(),
  })
  assert.deepEqual(nuevas.map((n) => n.stop.reason), ['ACUMULACION RECHAZO', 'CAUSA NUEVA'])
  assert.equal(nuevas[0].stop.durationSec, 13 * 60)
})

test('parosParaAvisar: con la regla vieja (toggle apagado) avisa todo ≥ 3 min', () => {
  const states = [paro('07:27', 3, 'ACUMULACION RECHAZO'), paro('09:17', 2, 'X')]
  const { nuevas } = A.parosParaAvisar({
    states, tabla: null, usarAprendido: false, minFijoMin: 3, nowWallMs: W('2026-09-29T10:00:00Z'), yaNotificadas: new Set(),
  })
  assert.equal(nuevas.length, 1)
})

test('parosParaAvisar: un paro ya avisado no se repite; uno de hace más de 12 h no se avisa', () => {
  const states = [paro('01:00', 20, 'SAP'), paro('11:37', 13, 'ACUMULACION RECHAZO')]
  const tabla = [{ causa: 'ACUMULACION RECHAZO', n: 68, p50: 4.3, p90: 8.5, umbralMin: 8.5 }]
  const clave = A.claveParo(states[1], 1)
  const { relevantes, nuevas } = A.parosParaAvisar({
    states, tabla, usarAprendido: true, minFijoMin: 3, nowWallMs: W('2026-09-29T15:00:00Z'), yaNotificadas: new Set([clave]),
  })
  assert.equal(relevantes.length, 2, 'los dos quedan en el baseline')
  assert.equal(nuevas.length, 0, 'uno ya avisado, el otro de hace 14 h')
})

test('agruparEnLinea: la misma causa en 3 Baader a ±3 min es UN evento', () => {
  let rec = []
  const r1 = A.agruparEnLinea(rec, { causa: 'Acumulacion Rechazo', iniMs: W('2026-09-29T11:37:00Z') }); rec = r1.recientes
  const r2 = A.agruparEnLinea(rec, { causa: 'ACUMULACION RECHAZO', iniMs: W('2026-09-29T11:38:30Z') }); rec = r2.recientes
  const r3 = A.agruparEnLinea(rec, { causa: 'ACUMULACION RECHAZO', iniMs: W('2026-09-29T11:45:00Z') }); rec = r3.recientes
  const r4 = A.agruparEnLinea(rec, { causa: 'CINTAS (MECANICA)', iniMs: W('2026-09-29T11:38:00Z') })
  assert.deepEqual([r1.repetido, r2.repetido, r3.repetido, r4.repetido], [false, true, false, false])
})

test('textoAvisoParo: dice lo normal de la causa', () => {
  const t = A.textoAvisoParo({
    dMin: 13, reason: 'ACUMULACION RECHAZO', machineName: 'Evisceradora 1', plantLabel: 'Eviscerado Chonchi',
    umbral: { umbralMin: 8.5, p50: 4.3, n: 68, aprendido: true },
  })
  assert.ok(t.tg.includes('Detención de 13 min'))
  assert.ok(t.tg.includes('~4,3 min'), t.tg)
  assert.ok(t.tg.includes('avisa sobre 8,5'), t.tg)
})
