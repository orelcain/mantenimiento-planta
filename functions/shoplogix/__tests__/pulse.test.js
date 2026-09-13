/**
 * Tests de `pulse` (node:test nativo — correr con `node --test`).
 *
 * El pulso es el ritmo casi instantáneo. Lo que se protege acá es que no
 * parpadee entre "va rápido" y "parada" por el refresco de 2 min de Shoplogix,
 * y que la radiografía del caso en cero no engorde el doc del monitor.
 */

const test = require('node:test')
const assert = require('node:assert')
const { componerPulso, lecturaDesdeProduccion, ritmoDeVentana, radiografia } = require('../pulse')

const lect = (min, total) => ({ at: new Date(Date.UTC(2026, 7, 19, 5, min)).toISOString(), totalCycles: total })

test('el ritmo se mide sobre la ventana, no entre lecturas consecutivas', () => {
  // Caso REAL del 18-08: el contador de Shoplogix se refresca cada 2 min, así
  // que entre consecutivas alterna 23, 0, 19, 0 — y ese 0 no es que la línea
  // pare. Sobre la ventana sale un número que se puede mirar.
  const lecturas = [lect(0, 1453), lect(1, 1476), lect(2, 1476), lect(3, 1495), lect(4, 1495)]
  const cpm = ritmoDeVentana(lecturas)
  assert.strictEqual(cpm, (1495 - 1453) / 4)
  assert.ok(cpm > 0, 'no debe dar 0 aunque la última pareja no haya cambiado')
})

test('un acumulado que baja no es un ritmo negativo: es cambio de turno', () => {
  assert.strictEqual(ritmoDeVentana([lect(0, 5000), lect(4, 12)]), null)
})

test('con una sola lectura no se inventa un ritmo', () => {
  assert.strictEqual(ritmoDeVentana([lect(0, 100)]), null)
})

test('el diagnóstico NO se guarda en el doc del monitor', () => {
  // El doc del monitor se escribe cada minuto y lo lee la PWA: la radiografía
  // viaja a su propio doc, no acá.
  const p = componerPulso(null, { ...lect(0, 0), diag: { filas: 1, muestra: [] } })
  assert.strictEqual(p.diag, undefined)
  assert.deepStrictEqual(Object.keys(p.lecturas[0]).sort(), ['at', 'totalCycles'])
})

test('la radiografía describe la forma sin copiar la respuesta entera', () => {
  const data = {
    machines: [
      { machineid: 'Total', name: 'Total', shift: 'Turno 1', target: 20, states: [{ type: 'Uptime', cycles: 0, name: 'Produciendo' }] },
      { machineid: 'abc', name: 'Ev 1', states: [{ type: 'Downtime', cycles: 0 }] },
    ],
    jobs: [], otraCosa: 1,
  }
  const r = radiografia(data)
  assert.strictEqual(r.filas, 2)
  assert.strictEqual(r.muestra[0].machineid, 'Total')
  assert.deepStrictEqual(r.muestra[0].estados[0], { type: 'Uptime', cycles: 0, name: 'Produciendo' })
  assert.ok(r.clavesRaiz.includes('machines'))
  // Guarda los VALORES de los campos escalares: son los candidatos a ser el
  // acumulado del turno cuando `states` viene vacío.
  assert.strictEqual(r.muestra[0].valores.target, 20)
  assert.strictEqual(r.muestra[0].valores.shift, 'Turno 1')
  assert.strictEqual(r.raizValores.otraCosa, 1)
  // No arrastra la respuesta completa ni los objetos anidados.
  assert.strictEqual(r.muestra[0].valores.states, undefined)
  assert.strictEqual(JSON.stringify(r).length < 1200, true)
})

// ── Hora de planta ──────────────────────────────────────────────────────────

const { ahoraEnPlanta, chileUtcOffsetHours } = require('../polling')
const { toShoplogixTime } = require('../time')

test('a Shoplogix se le manda la hora de PLANTA, no UTC', () => {
  // El defecto del 2026-08-19: se mandaba `new Date()` y Shoplogix lo leía como
  // hora local, o sea preguntábamos 4 h en el futuro. A las 19:58 UTC devolvía
  // la ficha del turno de la noche (21:30→05:15) con todo en cero.
  const utc = new Date('2026-08-19T19:58:47.000Z')
  const off = chileUtcOffsetHours(utc)
  const enPlanta = ahoraEnPlanta(utc)

  assert.strictEqual((utc.getTime() - enPlanta.getTime()) / 3_600_000, off)
  // Formateado con getters UTC da la hora del reloj de planta.
  assert.strictEqual(toShoplogixTime(enPlanta).slice(9, 13), String(19 - off).padStart(2, '0') + '58')
  // Y ya no cae dentro de un turno que aún no empezó.
  assert.ok(enPlanta < utc, 'Chile va detrás de UTC')
})

test('el desfase se recalcula por fecha: verano e invierno no son iguales', () => {
  const invierno = chileUtcOffsetHours(new Date('2026-08-19T12:00:00Z'))
  const verano = chileUtcOffsetHours(new Date('2026-01-15T12:00:00Z'))
  assert.ok(invierno === 4 || invierno === 3)
  assert.ok(verano === 3 || verano === 4)
  assert.notStrictEqual(invierno, verano)
})

// ── Tope de plausibilidad ───────────────────────────────────────────────────

test('un salto imposible del contador reinicia la ventana, no se promedia', () => {
  // Caso REAL del deploy del 2026-08-19: la ventana quedó a caballo entre las
  // lecturas de antes del arreglo de la hora (0, porque preguntábamos por un
  // turno que no había empezado) y las de después (12.169). El salto publicó
  // 3.101 pz/min en el documento que lee la pantalla.
  let p = componerPulso(null, lect(0, 0))
  p = componerPulso(p, lect(1, 0))
  p = componerPulso(p, lect(2, 12169))

  assert.strictEqual(p.lecturas.length, 1, 'la ventana arranca de nuevo desde el salto')
  assert.strictEqual(p.lecturas[0].totalCycles, 12169)
  assert.strictEqual(p.cpm, null, 'con una sola lectura no hay ritmo que publicar')
})

test('después del salto, el ritmo se reconstruye normal', () => {
  let p = componerPulso(null, lect(0, 0))
  p = componerPulso(p, lect(2, 12169))
  p = componerPulso(p, lect(4, 12252))
  p = componerPulso(p, lect(6, 12345))
  assert.strictEqual(p.cpm, (12345 - 12169) / 4)
  assert.ok(p.cpm < 120)
})

test('la producción normal no se ve afectada por el tope', () => {
  // Yal produciendo: ~35 pz/min, muy por debajo del absurdo.
  let p = componerPulso(null, lect(0, 12169))
  p = componerPulso(p, lect(2, 12252))
  p = componerPulso(p, lect(4, 12345))
  assert.strictEqual(p.lecturas.length, 3, 'no se reinicia la ventana')
  assert.strictEqual(p.cpm, 44)
})

test('ritmoDeVentana no publica un absurdo aunque la ventana lo contenga', () => {
  assert.strictEqual(ritmoDeVentana([lect(0, 0), lect(4, 12169)]), null)
})

test('el refresco de 2 min a pleno ritmo NO es una discontinuidad (bug del 0 pz/min, 29-08)', () => {
  // Caso REAL del turno día 29-08 con techo físico 56 (Chonchi): lecturas cada
  // 1 min pero el contador salta cada 2 — plano, plano, +80. El +80 en 1 min
  // aparenta 80 pz/min (> 56) pero es SOLO el refresco: usar el techo físico
  // como umbral de discontinuidad reiniciaba la ventana en cada salto y el
  // pulso publicaba null o un 0 falso con la línea a ~40 pz/min.
  let p = componerPulso(null, lect(0, 1264), 56)
  p = componerPulso(p, lect(1, 1264), 56)
  p = componerPulso(p, lect(2, 1344), 56)
  p = componerPulso(p, lect(3, 1344), 56)
  p = componerPulso(p, lect(4, 1411), 56)
  assert.strictEqual(p.lecturas.length, 5, 'la ventana NO se reinicia con el refresco')
  assert.ok(p.cpm > 30 && p.cpm < 56, `debe publicar el ritmo real (~37), salió ${p.cpm}`)
})

// ── Dato duro: buckets de 1 minuto (swap del 29-08) ─────────────────────────

/** Bucket como los devuelve `whiteboardproduction` (campos que usamos). */
const bkt = (hhmm, cycles, { dur = 60000, shift = 'Turno 2', rate = 19 } = {}) => ({
  cycles,
  expectedCycles: rate * (dur / 60000),
  totalDuration: dur,
  start: `20260829T${hhmm}00.000`,
  end: `20260829T${hhmm}59.999`,
  rate,
  shift,
})

test('el Ahora es el último minuto CERRADO común, la barra de Shoplogix', () => {
  const data = { machines: [
    { machineId: 'ev1', machineProduction: [
      bkt('0829', 8), bkt('0830', 10), bkt('0831', 15), bkt('0832', 3, { dur: 20000 }),
    ] },
    { machineId: 'ev2', machineProduction: [
      bkt('0829', 15, { rate: 16 }), bkt('0830', 15, { rate: 16 }), bkt('0831', 13, { rate: 16 }),
    ] },
  ] }
  const l = lecturaDesdeProduccion(data)
  // El común es 08:31 (el 08:32 de Ev1 está solo parcial).
  assert.strictEqual(l.duro.cpm, 15 + 13)
  assert.deepStrictEqual(l.duro.porMaquina, [{ id: 'ev1', cpm: 15 }, { id: 'ev2', cpm: 13 }])
  assert.strictEqual(l.duro.esperadoCpm, 35)
  // El minuto viaja en wall-as-UTC, como series[].t.
  assert.ok(l.duro.minuto.desde.endsWith('T08:31:00.000Z'))
  // El acumulado del turno suma TODOS los buckets del turno, incluido el parcial.
  assert.strictEqual(l.totalCycles, (8 + 10 + 15 + 3) + (15 + 15 + 13))
})

test('los buckets de OTRO turno y los Unscheduled no entran al acumulado', () => {
  const data = { machines: [
    { machineId: 'ev1', machineProduction: [
      bkt('0700', 12, { shift: 'Turno 1' }),          // cola del turno anterior
      bkt('0710', 9, { shift: 'Unscheduled' }),       // duplicado fuera de turno
      bkt('0830', 10), bkt('0831', 15),
    ] },
  ] }
  const l = lecturaDesdeProduccion(data)
  assert.strictEqual(l.totalCycles, 25, 'solo Turno 2')
  assert.strictEqual(l.duro.cpm, 15)
})

test('la serie por minuto es una rejilla continua del turno, con huecos en 0', () => {
  const data = { machines: [
    { machineId: 'ev1', machineProduction: [
      bkt('0828', 12),
      // 08:29 falta en la respuesta: en la serie queda como 0 explícito.
      bkt('0830', 10), bkt('0831', 15), bkt('0832', 3, { dur: 20000 }),
    ] },
    { machineId: 'ev2', machineProduction: [
      bkt('0829', 15, { rate: 16 }), bkt('0830', 15, { rate: 16 }), bkt('0831', 13, { rate: 16 }),
    ] },
  ] }
  const s = lecturaDesdeProduccion(data).duro.serieMinuto
  assert.ok(s.desde.endsWith('T08:28:00.000Z'), 'arranca en el primer bucket del turno')
  const ev1 = s.maquinas.find((m) => m.id === 'ev1')
  const ev2 = s.maquinas.find((m) => m.id === 'ev2')
  // 08:28..08:31 = 4 minutos; el parcial de 08:32 NO entra (cambia retroactivamente).
  assert.deepStrictEqual(ev1.cycles, [12, 0, 10, 15])
  assert.deepStrictEqual(ev2.cycles, [0, 15, 15, 13])
  assert.strictEqual(ev1.esperado, 19)
  assert.strictEqual(ev2.esperado, 16)
})

test('con el dato duro presente, componerPulso publica ESE número, no la ventana', () => {
  const duro = (cpm) => ({ cpm, porMaquina: [{ id: 'a', cpm }], esperadoCpm: 51, minuto: { desde: 'x', hasta: 'y' } })
  // La ventana diría 0 (acumulados planos); manda el bucket.
  let p = componerPulso(null, { ...lect(0, 100), duro: duro(28) }, 56)
  p = componerPulso(p, { ...lect(1, 100), duro: duro(31) }, 56)
  assert.strictEqual(p.cpm, 31)
  assert.deepStrictEqual(p.porMaquina, [{ id: 'a', cpm: 31 }])
  assert.strictEqual(p.fuente, 'buckets-1min')
  assert.strictEqual(p.esperadoCpm, 51)
  assert.strictEqual(p.vivoPrevio, undefined, 'con ritmo vivo no se arrastra nada')
})

test('un 0 del dato duro es un 0 DE VERDAD y se publica', () => {
  const p = componerPulso(null, { ...lect(0, 500), duro: { cpm: 0, porMaquina: [{ id: 'a', cpm: 0 }], esperadoCpm: 51, minuto: { desde: 'x', hasta: 'y' } } }, 56)
  assert.strictEqual(p.cpm, 0)
})

test('una serie SIN una sola pieza no se publica (turno cerrado)', () => {
  // Caso REAL del cierre del 29-08: Shoplogix devuelve una ventana ajena con
  // todo en cero y PISABA la serie buena del turno.
  const data = { machines: [
    { machineId: 'ev1', machineProduction: [bkt('0500', 0), bkt('0501', 0), bkt('0502', 0)] },
  ] }
  const l = lecturaDesdeProduccion(data)
  assert.strictEqual(l.duro.serieMinuto, null, 'sin piezas, no hay serie')
  assert.strictEqual(l.duro.cpm, 0, 'el ritmo 0 sí es un dato')
})

test('sin serie nueva se CONSERVA la del turno (no la pisa una vacía)', () => {
  const duro = (cpm, serie) => ({ cpm, porMaquina: [{ id: 'a', cpm }], esperadoCpm: 51, minuto: { desde: 'x', hasta: 'y' }, serieMinuto: serie })
  const serieBuena = { desde: '2026-08-29T07:15:00.000Z', maquinas: [{ id: 'a', esperado: 19, cycles: [15, 16] }] }
  let p = componerPulso(null, { ...lect(0, 100), duro: duro(15, serieBuena) }, 56)
  assert.strictEqual(p.serieMinuto, serieBuena)
  // Lectura del turno cerrado: sin serie. La buena sobrevive.
  p = componerPulso(p, { ...lect(1, 0), duro: duro(0, null) }, 56)
  assert.strictEqual(p.serieMinuto, serieBuena, 'la serie del turno no se pierde')
})

test('sin machineProduction no hay lectura (y no revienta)', () => {
  assert.strictEqual(lecturaDesdeProduccion({ machines: [{ machineId: 'ev1' }] }), null)
  assert.strictEqual(lecturaDesdeProduccion(null), null)
})

test('el techo físico sigue callando a la reconciliación (fix 60-69 intacto)', () => {
  // La ventana entera implica 60-69 pz/min (acreditación de golpe): sobre el
  // techo físico se publica null, aunque ningún delta individual pase de 120.
  let p = componerPulso(null, lect(0, 1000), 56)
  p = componerPulso(p, lect(1, 1065), 56)
  p = componerPulso(p, lect(2, 1130), 56)
  assert.strictEqual(p.cpm, null, 'un ritmo sobre el techo físico no se publica')

  // Y un salto de verdad absurdo (>120/min) sigue reiniciando la ventana.
  let q = componerPulso(null, lect(0, 0), 56)
  q = componerPulso(q, lect(1, 500), 56)
  assert.strictEqual(q.lecturas.length, 1, 'el absurdo genérico sigue cortando')
})
