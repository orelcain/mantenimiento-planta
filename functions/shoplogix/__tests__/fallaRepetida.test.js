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

// ── Serie semanal «fallas repetidas de Mantención» (estudio 03-11-2026, §8.3) ──
const iso = (s) => Date.parse(s) // instante de pared, como en el resto del archivo
const st = (startIso, durSec, reason, { type = 'downtime', name = 'Detencion' } = {}) => ({ startAt: iso(startIso), durationSec: durSec, type, name, reason })
const turno = (id, maquinas) => ({ id, maquinas })
const maq = (machineid, states) => ({ machineid, name: machineid, states })
const DESDE = '2026-10-05' // lunes: la ventana arranca en semana completa

test('lunesDe y primerLunesDesde: lunes ISO y primera semana completa', () => {
  assert.equal(F.lunesDe('2026-10-18'), '2026-10-12') // domingo → lunes anterior
  assert.equal(F.lunesDe('2026-10-19'), '2026-10-19') // lunes → él mismo
  assert.equal(F.lunesDe('2026-10-25'), '2026-10-19') // domingo siguiente
  assert.equal(F.primerLunesDesde('2026-10-05'), '2026-10-05') // ya es lunes
  assert.equal(F.primerLunesDesde('2026-10-07'), '2026-10-12') // miércoles → lunes siguiente
})

test('umbral: 300 s exactos no entran, 301 s sí', () => {
  const con = (dur) => F.semanasFallasMantencion([turno('2026-10-19_Turno 1', [maq('m1', [st('2026-10-19T08:00:00Z', dur, 'LOGICA')])])], { desde: DESDE })
  assert.deepStrictEqual(con(300), [{ semana: '2026-10-19', turnos: 1, fallas: 0, repetidas: 0 }])
  assert.deepStrictEqual(con(301), [{ semana: '2026-10-19', turnos: 1, fallas: 1, repetidas: 0 }])
})

test('bucket: un motivo que no es de Mantención no entra; «Ajuste mantenimiento» y contratistas sí', () => {
  const r = F.semanasFallasMantencion([turno('2026-10-19_Turno 1', [
    maq('m1', [st('2026-10-19T08:00:00Z', 900, 'COLACION')]),
    maq('m2', [st('2026-10-19T08:00:00Z', 900, 'AJUSTE MANTENIMIENTO')]),
    maq('m3', [st('2026-10-19T08:00:00Z', 900, 'TRABAJOS CONTRATISTAS')]),
  ])], { desde: DESDE })
  assert.deepStrictEqual(r, [{ semana: '2026-10-19', turnos: 1, fallas: 2, repetidas: 0 }])
})

test('unión: a 9 min 59 s del fin se une; a 10 min exactos no (y entonces la primera es repetida)', () => {
  const T = '2026-10-19_Turno 1'
  // Primera: 08:00 + 10 min → fin 08:10. Segunda a 08:19:59 (9 min 59 s después): se une.
  const unida = F.semanasFallasMantencion([turno(T, [maq('m1', [
    st('2026-10-19T08:00:00Z', 600, 'LOGICA'), st('2026-10-19T08:19:59Z', 400, 'LOGICA')])])], { desde: DESDE })
  assert.deepStrictEqual(unida, [{ semana: '2026-10-19', turnos: 1, fallas: 1, repetidas: 0 }])
  // Segunda a 08:20:00 (10 min exactos): no se une; la primera es repetida (10 min ≤ 2 h).
  const aparte = F.semanasFallasMantencion([turno(T, [maq('m1', [
    st('2026-10-19T08:00:00Z', 600, 'LOGICA'), st('2026-10-19T08:20:00Z', 400, 'LOGICA')])])], { desde: DESDE })
  assert.deepStrictEqual(aparte, [{ semana: '2026-10-19', turnos: 1, fallas: 2, repetidas: 1 }])
})

test('repetida: la siguiente empieza ≤ 2 h después del fin (2 h exactas sí, 2 h + 1 s no)', () => {
  const T = '2026-10-19_Turno 1'
  // Fin de la primera: 08:10. Siguiente a 10:10 = 2 h exactas → repetida.
  const exacta = F.semanasFallasMantencion([turno(T, [maq('m1', [
    st('2026-10-19T08:00:00Z', 600, 'LOGICA'), st('2026-10-19T10:10:00Z', 600, 'LOGICA')])])], { desde: DESDE })
  assert.deepStrictEqual(exacta, [{ semana: '2026-10-19', turnos: 1, fallas: 2, repetidas: 1 }])
  // Siguiente a 10:10:01 = 2 h + 1 s → no es repetida.
  const pasada = F.semanasFallasMantencion([turno(T, [maq('m1', [
    st('2026-10-19T08:00:00Z', 600, 'LOGICA'), st('2026-10-19T10:10:01Z', 600, 'LOGICA')])])], { desde: DESDE })
  assert.deepStrictEqual(pasada, [{ semana: '2026-10-19', turnos: 1, fallas: 2, repetidas: 0 }])
})

test('semana: sale de la FECHA DEL TURNO, no de la del state (domingo 18 con falla el lunes 00:30)', () => {
  const r = F.semanasFallasMantencion([turno('2026-10-18_Turno 3', [maq('m1', [st('2026-10-19T00:30:00Z', 600, 'LOGICA')])])], { desde: DESDE })
  assert.deepStrictEqual(r, [{ semana: '2026-10-12', turnos: 1, fallas: 1, repetidas: 0 }])
})

test('Unscheduled: los turnos cuyo id lo trae se saltan (no suman turno, falla ni semana)', () => {
  const r = F.semanasFallasMantencion([
    turno('2026-10-19_Turno 1', [maq('m1', [st('2026-10-19T08:00:00Z', 600, 'LOGICA')])]),
    turno('2026-10-19_Unscheduled', [maq('m1', [st('2026-10-19T08:00:00Z', 600, 'LOGICA'), st('2026-10-19T20:00:00Z', 600, 'MOTORES')])]),
    turno('2026-10-26_Unscheduled', [maq('m1', [st('2026-10-26T08:00:00Z', 600, 'MOTORES')])]),
  ], { desde: DESDE })
  assert.deepStrictEqual(r, [{ semana: '2026-10-19', turnos: 1, fallas: 1, repetidas: 0 }])
})

test('id sin fecha válida se salta sin tumbar la serie', () => {
  const r = F.semanasFallasMantencion([
    turno('basura', [maq('m1', [st('2026-10-19T08:00:00Z', 600, 'LOGICA')])]),
    turno('2026-10-19_Turno 1', []),
  ], { desde: DESDE })
  assert.deepStrictEqual(r, [{ semana: '2026-10-19', turnos: 1, fallas: 0, repetidas: 0 }])
})

test('mismo state en dos turnos cuenta una vez (el turno sí cuenta dos)', () => {
  const s = st('2026-10-19T08:00:00Z', 600, 'LOGICA')
  const r = F.semanasFallasMantencion([
    turno('2026-10-19_Turno 1', [maq('m1', [s])]),
    turno('2026-10-19_Turno 2', [maq('m1', [{ ...s }])]),
  ], { desde: DESDE })
  assert.deepStrictEqual(r, [{ semana: '2026-10-19', turnos: 2, fallas: 1, repetidas: 0 }])
})

test('semana con turnos y sin fallas aparece con 0; semana sin turnos no aparece', () => {
  const r = F.semanasFallasMantencion([
    turno('2026-10-19_Turno 1', [maq('m1', [st('2026-10-19T08:00:00Z', 60, 'LOGICA')])]), // 60 s: no cuenta
    turno('2026-10-26_Turno 1', [maq('m1', [])]),
    turno('2026-11-09_Turno 1', [maq('m1', [st('2026-11-09T08:00:00Z', 600, 'LOGICA')])]),
  ], { desde: DESDE })
  assert.deepStrictEqual(r, [
    { semana: '2026-10-19', turnos: 1, fallas: 0, repetidas: 0 },
    { semana: '2026-10-26', turnos: 1, fallas: 0, repetidas: 0 },
    { semana: '2026-11-09', turnos: 1, fallas: 1, repetidas: 0 },
  ])
})

test('la primera semana de la ventana, incompleta, no aparece', () => {
  const r = F.semanasFallasMantencion([
    turno('2026-10-08_Turno 1', [maq('m1', [st('2026-10-08T08:00:00Z', 600, 'LOGICA')])]), // semana del 05: antes de la ventana
    turno('2026-10-13_Turno 1', [maq('m1', [st('2026-10-13T08:00:00Z', 600, 'LOGICA')])]),
  ], { desde: '2026-10-07' }) // miércoles: la ventana arranca el lunes 12
  assert.deepStrictEqual(r, [{ semana: '2026-10-12', turnos: 1, fallas: 1, repetidas: 0 }])
})

test('máquinas distintas no se mezclan: no se unen ni cuentan como repetición', () => {
  const r = F.semanasFallasMantencion([turno('2026-10-19_Turno 1', [
    maq('m1', [st('2026-10-19T08:00:00Z', 600, 'LOGICA')]),
    maq('m2', [st('2026-10-19T08:12:00Z', 600, 'LOGICA')]), // 2 min después del fin de m1: no se une
  ])], { desde: DESDE })
  assert.deepStrictEqual(r, [{ semana: '2026-10-19', turnos: 1, fallas: 2, repetidas: 0 }])
})

test('calcularReincidenciaPlanta: semanas ignora el doc Unscheduled y no hace lecturas extra', async () => {
  let lecturas = 0
  const f1 = st('2026-10-19T08:00:00Z', 600, 'LOGICA')
  const f2 = st('2026-10-19T20:00:00Z', 600, 'MOTORES')
  const doc = (id, maquinas) => ({
    id,
    ref: { collection: () => ({ get: async () => { lecturas++; return { docs: maquinas.map(([mid, states]) => ({ id: mid, data: () => ({ machineName: mid, states }) })) } } }) },
  })
  const snap = { docs: [doc('2026-10-19_Turno 1', [['m1', [f1]]]), doc('2026-10-19_Unscheduled', [['m1', [f1, f2]]])] }
  const q = { where: () => q, get: async () => { lecturas++; return snap } }
  const r = await F.calcularReincidenciaPlanta({ db: { collection: () => q }, plantSlug: 'chonchi', hoyDateKey: '2026-10-25', FieldPath: { documentId: () => '__name__' } })
  assert.deepStrictEqual(r.semanas, [{ semana: '2026-10-19', turnos: 1, fallas: 1, repetidas: 0 }])
  assert.deepStrictEqual(r.definicionSemanas, { minDurSec: 300, unirMin: 10, repetidaH: 2 })
  assert.equal(lecturas, 3) // 1 consulta de turnos + 1 por turno (sus máquinas), nada más
})
