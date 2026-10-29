/**
 * Cierre congelado del Duelo (node:test nativo). Lo que se juega: que lo SELLADO no cambie nunca, que lo que está en
 * gracia SÍ recoja las correcciones, que el mes vaya por jornada y que semana y mes cuenten con la regla de la pantalla.
 * Datos reales: `fixtures/duelo-semanas-43-44.json` (Eviscerado y Filete, 19 al 28-10-2026).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const N = require('../lib/dueloNucleo.cjs')
const C = require('../dueloCierre')
const fixture = require('./fixtures/duelo-semanas-43-44.json')

const ev = fixture.lineas.eviscerado
const fi = fixture.lineas.filete
const clonar = (x) => JSON.parse(JSON.stringify(x))
const calcular = (linea, extra) => C.calcularMes({ planta: 'chonchi', mes: '2026-10', stats: linea.stats, overrides: linea.overrides, maquinas: linea.maquinas, hoyKey: '2026-10-29', ahoraIso: '2026-10-29T21:30:00.000Z', ...extra })

test('jornadas: selladas hasta J+4, provisorias en la gracia, y el marcador es el del núcleo', () => {
  const { doc, sellados } = calcular(ev)
  assert.equal(doc.jornadas['2026-10-24'].estado, 'sellada', '24 + 4 = 28 ≤ 29')
  assert.equal(doc.jornadas['2026-10-26'].estado, 'provisoria', '26 + 4 = 30 > 29')
  assert.equal(doc.jornadas['2026-10-28'].estado, 'provisoria')
  assert.ok(sellados.includes(doc.jornadas['2026-10-24'].dia.r.shiftDocId))
  // El marcador de la jornada es exactamente compararTurnos(día, noche) del núcleo.
  const j = doc.jornadas['2026-10-22']
  const m = N.compararTurnos(j.dia.r, j.noche.r)
  assert.deepEqual([j.marcador.pA, j.marcador.pB, j.marcador.ganador], [m.puntosA, m.puntosB, m.ganador])
})

test('semana y mes: los puntos son los de marcadorDePeriodo sobre los mismos duelos (la regla de la pantalla)', () => {
  const { doc } = calcular(ev)
  const modo = N.modoArranqueDe(N.unidadDeMaquinas(ev.maquinas))
  const duelos = N.duelosDeTurnos(N.resumenesDeStats(ev.stats, ev.overrides, modo, null))
  const semana = doc.semanas['2026-10-19']
  assert.equal(semana.estado, 'sellado', 'domingo 25 + 4 = 29: sellada')
  assert.deepEqual(semana.marcador.puntos, N.marcadorDePeriodo(duelos, 'semana', '2026-10-19', '2026-10-29').puntos)
  assert.equal(doc.semanas['2026-10-26'], undefined, 'la semana del 26-10 termina el 01-11: va al doc de noviembre')
  assert.equal(doc.resumen.estado, 'provisorio', 'octubre aún no vence')
  assert.deepEqual(doc.resumen.marcador.puntos, N.marcadorDePeriodo(duelos, 'mes', '2026-10', '2026-10-29').puntos)
  // Piezas, costo y micro por equipo salen de los mismos turnos.
  const pz = ev.stats.filter((s) => s.dateKey >= '2026-10-19' && s.dateKey <= '2026-10-25').reduce((a, s) => a + s.total, 0)
  assert.equal(semana.pzTotal.rebolledo + semana.pzTotal.cardenas, pz)
})

test('⚠ lo sellado no cambia aunque cambie shiftStats; lo provisorio sí lo recoge', () => {
  const primero = calcular(ev).doc
  const stats = clonar(ev.stats)
  for (const s of stats) if (s.dateKey === '2026-10-22' || s.dateKey === '2026-10-27') s.total += 5000
  const segundo = calcular(ev, { stats, previo: primero }).doc
  assert.deepEqual(segundo.jornadas['2026-10-22'], primero.jornadas['2026-10-22'], 'sellada: idéntica')
  assert.equal(segundo.jornadas['2026-10-27'].dia.r.piezas, primero.jornadas['2026-10-27'].dia.r.piezas + 5000, 'en gracia: se recalcula')
  assert.deepEqual(segundo.semanas['2026-10-19'], primero.semanas['2026-10-19'], 'la semana sellada tampoco cambia')
})

test('la corrección manual de equipo vale en la gracia y no después del sellado', () => {
  const primero = calcular(ev).doc
  const id27 = primero.jornadas['2026-10-27'].dia.r.shiftDocId
  const id22 = primero.jornadas['2026-10-22'].dia.r.shiftDocId
  const otro = (e) => N.otroEquipo(e)
  const overrides = { ...ev.overrides, [id27]: otro(primero.jornadas['2026-10-27'].dia.r.equipo), [id22]: otro(primero.jornadas['2026-10-22'].dia.r.equipo) }
  const segundo = calcular(ev, { overrides, previo: primero }).doc
  assert.notEqual(segundo.jornadas['2026-10-27'].dia.r.equipo, primero.jornadas['2026-10-27'].dia.r.equipo)
  assert.equal(segundo.jornadas['2026-10-22'].dia.r.equipo, primero.jornadas['2026-10-22'].dia.r.equipo)
  assert.equal(segundo.jornadas['2026-10-27'].marcador, null, 'mismo equipo en los dos turnos: no hay duelo')
})

test('el sellado avanza con los días: el 31-10 se sella el 27 y el 28 sigue en gracia', () => {
  const primero = calcular(ev).doc
  const { doc, sellados } = calcular(ev, { previo: primero, hoyKey: '2026-10-31' })
  assert.equal(doc.jornadas['2026-10-27'].estado, 'sellada')
  assert.equal(doc.jornadas['2026-10-28'].estado, 'provisoria')
  assert.ok(sellados.includes(doc.jornadas['2026-10-27'].noche.r.shiftDocId))
  assert.ok(!sellados.includes(doc.jornadas['2026-10-22'].dia.r.shiftDocId), 'lo ya sellado no se vuelve a sellar ni a cuadrar')
})

test('⚠ el arranque de Eviscerado no se pisa con «sin dato» cuando su serie sale del archivo', () => {
  const primero = calcular(ev).doc
  assert.equal(primero.modoArranque, 'ritmo90')
  // Como si la corrida anterior lo hubiera medido con la serie: ahora la serie ya no está.
  primero.jornadas['2026-10-27'].dia.r.arranqueMin = 42
  primero.jornadas['2026-10-27'].noche.r.arranqueMin = 17
  const segundo = calcular(ev, { previo: primero }).doc
  assert.equal(segundo.jornadas['2026-10-27'].dia.r.arranqueMin, 42)
  assert.equal(segundo.jornadas['2026-10-27'].noche.r.arranqueMin, 17)
  // Filete mide con la primera pieza (`duelo.ini`): su valor fresco manda.
  const f1 = calcular(fi).doc
  const fresco = f1.jornadas['2026-10-27'].dia.r.arranqueMin
  assert.notEqual(fresco, null)
  f1.jornadas['2026-10-27'].dia.r.arranqueMin = 999
  assert.equal(calcular(fi, { previo: f1 }).doc.jornadas['2026-10-27'].dia.r.arranqueMin, fresco)
})

test('el mes va por JORNADA: la noche del 31-10 a las 21:00 abre la jornada del 01-11 y cae en noviembre', () => {
  const noche = clonar(ev.stats.find((s) => s.duelo?.h0 && Number(s.duelo.h0.slice(0, 2)) >= 17))
  assert.ok(noche, 'el fixture trae noches que parten en la tarde')
  noche.shiftDocId = `2026-10-31_${noche.shiftId}`
  noche.dateKey = '2026-10-31'
  const stats = [...ev.stats, noche]
  const oct = calcular(ev, { stats, hoyKey: '2026-11-02' }).doc
  assert.equal(oct.jornadas['2026-10-31'], undefined)
  assert.equal(oct.jornadas['2026-11-01'], undefined)
  const nov = C.calcularMes({ planta: 'chonchi', mes: '2026-11', stats, overrides: ev.overrides, maquinas: ev.maquinas, hoyKey: '2026-11-02' }).doc
  assert.ok(nov.jornadas['2026-11-01'], 'la noche vive en noviembre')
  // La semana del 26-10 (termina el 01-11) se arma en noviembre leyendo las jornadas de octubre.
  const conBorde = C.calcularMes({ planta: 'chonchi', mes: '2026-11', stats, overrides: ev.overrides, maquinas: ev.maquinas, hoyKey: '2026-11-02', previoAnterior: oct }).doc
  assert.ok(conBorde.semanas['2026-10-26'].jornadas >= 4)
})

test('doc válido para Firestore: sin undefined, sin períodos antes de octubre y de tamaño acotado', () => {
  const { doc } = calcular(ev)
  const sinUndefined = (x) => x === undefined ? false : Array.isArray(x) ? x.every(sinUndefined) : x && typeof x === 'object' ? Object.values(x).every(sinUndefined) : true
  assert.ok(sinUndefined(doc))
  assert.ok(Object.keys(doc.semanas).every((k) => k >= '2026-10-01'))
  // 9 jornadas del fixture ≈ 17 KB; un mes completo (~26 jornadas) queda bajo 100 KB, lejos del 1 MB de Firestore.
  assert.ok(JSON.stringify(doc).length < 100 * 1024 * (9 / 26))
  assert.equal(doc.v, C.CIERRE_V)
})

test('mesesAProcesar: gracia + mes anterior mientras no esté sellado, nunca antes de octubre', () => {
  assert.deepEqual(C.mesesAProcesar('2026-10-29'), ['2026-10'])
  assert.deepEqual(C.mesesAProcesar('2026-11-03', false), ['2026-10', '2026-11'])
  assert.deepEqual(C.mesesAProcesar('2026-11-10', true), ['2026-11'])
  assert.deepEqual(C.mesesAProcesar('2026-11-10', false), ['2026-10', '2026-11'], 'si falló la corrida del día 4, octubre se sella después')
})

test('ejecutarCierre: lee el monitor de línea, cuadra contra Shoplogix lo que se sella y escribe un doc por mes', async () => {
  const escritos = {}
  const padres = Object.fromEntries(ev.stats.map((s) => [s.shiftDocId, { officialLive: { totalCycles: s.total - 10 } }]))
  const ref = (path) => ({
    path,
    id: path.split('/').pop(),
    get: async () => ({ exists: true, data: () => (path.startsWith('dueloCierres/') ? escritos[path] : path.startsWith('monitor_config/') ? { duelo: { overrides: ev.overrides } } : undefined) }),
    set: async (d) => { escritos[path] = d },
  })
  const db = {
    collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: false, docs: [{ id: 'tok', data: () => ({ shiftStats: ev.stats, live: { machines: ev.maquinas }, seriesMinuto: [] }) }] }) }) }) }),
    doc: ref,
    getAll: async (...refs) => refs.map((r) => ({ id: r.id, exists: !!padres[r.id], data: () => padres[r.id] })),
  }
  const r = await C.ejecutarCierre(db, 'chonchi', { hoyKey: '2026-10-29', ahoraIso: '2026-10-29T21:30:00.000Z', logger: { info() {}, warn() {} } })
  assert.deepEqual(Object.keys(escritos), ['dueloCierres/chonchi_2026-10'])
  assert.equal(r.meses[0].mes, '2026-10')
  const doc = escritos['dueloCierres/chonchi_2026-10']
  assert.deepEqual(doc.jornadas['2026-10-22'].dia.cuadre, { slx: doc.jornadas['2026-10-22'].dia.r.piezas - 10, dif: 10 })
  assert.equal(doc.jornadas['2026-10-27'].dia.cuadre, undefined, 'lo provisorio no se cuadra todavía')
})
