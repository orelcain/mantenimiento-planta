/**
 * Tests del vigía intra-turno. Los casos son los REALES de la guardia
 * nocturna del 27-08 (corrida a mano desde Claude Code), incluidas las dos
 * lecciones pagadas esa noche: «Planned Downtime» es pactada aunque venga en
 * inglés, y toda alerta abre un ciclo que hay que cerrar.
 */
const test = require('node:test')
const assert = require('node:assert')
const { evaluarVigia, UMBRALES, esPactada } = require('../shoplogix/vigiaTurno')

const NOMBRES = new Map([['id-ev1', 'Evisceradora 1'], ['id-ev2', 'Evisceradora 2']])

const base = (extra = {}) => ({
  shiftDocId: '2026-08-27_Turno 1',
  shiftClosed: false,
  status: 'produciendo',
  reason: '',
  totalPieces: 1000,
  pulsoCpm: 28,
  porMaquina: [{ id: 'id-ev1', cpm: 14 }, { id: 'id-ev2', cpm: 14 }],
  lecturaFallo: false,
  ...extra,
})

function correr(lecturas) {
  let st = {}
  const eventos = []
  for (const l of lecturas) {
    const r = evaluarVigia(l, st, NOMBRES)
    eventos.push(...r.eventos)
    st = r.estado
  }
  return { eventos, st }
}

test('vigia: N lecturas normales no dicen nada', () => {
  const { eventos } = correr(Array.from({ length: 30 }, () => base()))
  assert.deepEqual(eventos, [])
})

test('vigia: paro NO pactado avisa al umbral, UNA vez, y cierra con el reenganche', () => {
  const paradas = Array.from({ length: UMBRALES.paroNoPactadoMin + 5 }, () =>
    base({ status: 'detenida', reason: 'Detencion' }))
  const { eventos, st } = correr([base(), ...paradas, base({ totalPieces: 2099 })])
  const avisos = eventos.filter((e) => e.includes('Línea detenida'))
  assert.equal(avisos.length, 1)
  assert.ok(avisos[0].includes('Detencion'))
  const cierres = eventos.filter((e) => e.includes('Reenganche'))
  assert.equal(cierres.length, 1)
  assert.ok(cierres[0].includes('2.099') || cierres[0].includes('2,099') || cierres[0].includes('2099'))
  assert.equal(st.paroAvisado, false)
})

test('vigia: «Planned Downtime» es PACTADA — la lección de la colación del 27-08', () => {
  assert.ok(esPactada('Planned Downtime'))
  assert.ok(esPactada('COLACION'))
  assert.ok(!esPactada('Detencion'))
  // Con la pactada, a los 8 min NO dice nada; al umbral largo sí.
  const paradas = Array.from({ length: UMBRALES.paroPactadoMin }, () =>
    base({ status: 'detenida', reason: 'Planned Downtime' }))
  const { eventos } = correr([base(), ...paradas])
  assert.equal(eventos.filter((e) => e.includes('Línea detenida')).length, 0)
  const largas = eventos.filter((e) => e.includes('pactada que se alarga'))
  assert.equal(largas.length, 1)
})

test('vigia: una máquina en cero con la línea andando — el caso Ev 1', () => {
  const conEv1Muerta = Array.from({ length: UMBRALES.maquinaCeroMin + 3 }, () =>
    base({ porMaquina: [{ id: 'id-ev1', cpm: 0 }, { id: 'id-ev2', cpm: 14 }] }))
  const { eventos } = correr([...conEv1Muerta, base({ porMaquina: [{ id: 'id-ev1', cpm: 5.2 }, { id: 'id-ev2', cpm: 14 }] })])
  const avisos = eventos.filter((e) => e.includes('parada'))
  assert.equal(avisos.length, 1)
  assert.ok(avisos[0].includes('Evisceradora 1'), avisos[0])
  const vueltas = eventos.filter((e) => e.includes('de vuelta'))
  assert.equal(vueltas.length, 1)
  assert.ok(vueltas[0].includes('5.2'))
})

test('vigia: con la línea PARADA las máquinas en cero no cuentan (ya avisa el paro)', () => {
  const paradas = Array.from({ length: 30 }, () =>
    base({ status: 'detenida', reason: 'Detencion', porMaquina: [{ id: 'id-ev1', cpm: 0 }, { id: 'id-ev2', cpm: 0 }] }))
  const { eventos } = correr(paradas)
  assert.equal(eventos.filter((e) => e.includes('Evisceradora')).length, 0)
})

test('vigia: contador caído y de vuelta', () => {
  const fallos = Array.from({ length: UMBRALES.contadorCaidoMin }, () => base({ lecturaFallo: true, pulsoCpm: null, porMaquina: null }))
  const { eventos } = correr([base(), ...fallos, base()])
  assert.equal(eventos.filter((e) => e.includes('Contador sin responder')).length, 1)
  assert.equal(eventos.filter((e) => e.includes('Contador de vuelta')).length, 1)
})

test('vigia: ritmo desplomado sostenido, con histéresis para no parpadear', () => {
  const lentas = Array.from({ length: UMBRALES.lentoMin }, () => base({ pulsoCpm: 6 }))
  // 12 pz/min NO cierra el ciclo (histéresis); 20 sí.
  const { eventos } = correr([base(), ...lentas, base({ pulsoCpm: 12 }), base({ pulsoCpm: 20 })])
  assert.equal(eventos.filter((e) => e.includes('muy lenta')).length, 1)
  assert.equal(eventos.filter((e) => e.includes('Ritmo recuperado')).length, 1)
})

test('vigia: cambio de turno resetea todo sin avisar', () => {
  const paradas = Array.from({ length: UMBRALES.paroNoPactadoMin - 1 }, () =>
    base({ status: 'detenida', reason: 'Detencion' }))
  const { eventos } = correr([...paradas, base({ shiftDocId: '2026-08-28_Turno 2', status: 'detenida', reason: 'Detencion' })])
  // El contador del paro arrancó de nuevo con el turno nuevo: sin aviso.
  assert.deepEqual(eventos, [])
})

test('vigia: turno cerrado apaga los ciclos sin avisos de cierre', () => {
  const paradas = Array.from({ length: UMBRALES.paroNoPactadoMin }, () =>
    base({ status: 'detenida', reason: 'Detencion' }))
  const { eventos } = correr([...paradas, base({ shiftClosed: true, status: 'detenida' }), base({ shiftClosed: true, status: 'produciendo' })])
  assert.equal(eventos.filter((e) => e.includes('Línea detenida')).length, 1)
  assert.equal(eventos.filter((e) => e.includes('Reenganche')).length, 0)
})
