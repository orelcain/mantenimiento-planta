/**
 * Tests de kpisMantencion (node:test — correr con `node --test`).
 *
 * Los fixtures son los REALES del 26-08-2026 (Eviscerado P. Principal,
 * Turno 2), el día que parió el módulo: Ev1 con la crisis KNURO y sus dos
 * trampas de datos (states duplicados en Unscheduled, duración sin recortar).
 */

const { test, describe } = require('node:test')
const assert = require('node:assert')
const {
  clasificaCausa, sanearStates, encadenarFallas, kpisDeMaquina,
  velocidadDesde1min, caidaDeLinea, reenganches,
} = require('../kpisMantencion')

describe('clasificaCausa', () => {
  const casos = [
    [{ type: 'uptime', name: 'Produciendo' }, 'produccion'],
    [{ type: 'break', name: 'Detencion', reason: 'COLACION' }, 'planificado'],
    [{ type: 'break', name: 'Detencion', reason: 'DETENCION PROGRAMADA' }, 'planificado'],
    // Espacios dobles y tildes: Shoplogix escribe a mano (visto 12-08).
    [{ type: 'break', name: 'Detencion', reason: 'EJERCICIO  COMPENSATORIO - Paro' }, 'planificado'],
    [{ type: 'downtime', name: 'Detencion Excedido', reason: 'COLACION' }, 'excedido'],
    [{ type: 'downtime', name: 'Detencion', reason: 'ACUMULACION RECHAZO' }, 'externo'],
    [{ type: 'downtime', name: 'Micro Detencion', reason: '' }, 'micro'],
    [{ type: 'downtime', name: 'Detencion', reason: 'KNURO' }, 'falla'],
    [{ type: 'downtime', name: 'Detencion', reason: 'LOGICA' }, 'falla'],
    [{ type: 'downtime', name: 'Detencion', reason: '' }, 'sin-imputar'],
  ]
  for (const [st, esperado] of casos) {
    test(`${st.name}/${st.reason || '∅'} → ${esperado}`, () => {
      assert.strictEqual(clasificaCausa(st), esperado)
    })
  }
})

describe('sanearStates — las dos trampas del 26-08', () => {
  const ventana = { start: new Date('2026-08-26T07:15:00Z'), end: new Date('2026-08-26T15:10:00Z') }
  const knuro = { type: 'downtime', name: 'Detencion', reason: 'KNURO', startAt: '2026-08-26T09:19:53Z', endAt: '2026-08-26T09:59:53Z' }

  test('⚠ el Unscheduled repite states del turno: dedupe por clave', () => {
    const out = sanearStates([knuro, { ...knuro }], ventana)
    assert.strictEqual(out.length, 1)
    assert.strictEqual(out[0].durationSec, 2400)
  })

  test('⚠ un state que sigue corriendo se RECORTA a la ventana', () => {
    // La DETENCION PROGRAMADA del cierre: empieza 15:09 y corre por horas.
    const cierre = { type: 'break', name: 'Detencion', reason: 'DETENCION PROGRAMADA', startAt: '2026-08-26T15:09:00Z', endAt: '2026-08-26T17:49:00Z' }
    const out = sanearStates([cierre], ventana)
    assert.strictEqual(out.length, 1)
    assert.strictEqual(out[0].durationSec, 60) // solo el minuto que cae adentro
  })

  test('un state totalmente fuera de la ventana no entra', () => {
    const fuera = { ...knuro, startAt: '2026-08-26T17:00:00Z', endAt: '2026-08-26T17:30:00Z' }
    assert.strictEqual(sanearStates([fuera], ventana).length, 0)
  })
})

describe('encadenarFallas — la crisis KNURO es UN evento', () => {
  // Real: 08:51→08:57 (5,5), 08:57→09:08 (11,25), 09:19→09:59 (40).
  const fallas = [
    { desde: '2026-08-26T08:51:38Z', hasta: '2026-08-26T08:57:08Z', sec: 330, causa: 'KNURO' },
    { desde: '2026-08-26T08:57:23Z', hasta: '2026-08-26T09:08:38Z', sec: 675, causa: 'KNURO' },
    { desde: '2026-08-26T09:19:53Z', hasta: '2026-08-26T09:59:53Z', sec: 2400, causa: 'KNURO' },
    { desde: '2026-08-26T12:18:54Z', hasta: '2026-08-26T12:26:54Z', sec: 480, causa: 'LOGICA' },
  ]
  test('tres filas KNURO con huecos de hasta 11m15s = un evento; LOGICA aparte', () => {
    const ev = encadenarFallas(fallas)
    assert.strictEqual(ev.length, 2)
    assert.strictEqual(ev[0].paros, 3)
    assert.deepStrictEqual(ev[0].causas, ['KNURO'])
    assert.strictEqual(ev[0].sec, 3405)
    assert.strictEqual(ev[1].causas[0], 'LOGICA')
  })

  test('con gap chico solo encadena lo pegado (las dos primeras van a 15 s)', () => {
    assert.strictEqual(encadenarFallas(fallas, 60_000).length, 3)
  })
})

describe('kpisDeMaquina', () => {
  test('MTTR/MTBF se calculan sobre EVENTOS, no filas — y la disponibilidad técnica solo mira fallas', () => {
    const mkUp = (desde, hasta) => ({ type: 'uptime', name: 'Produciendo', startAt: desde, endAt: hasta, durationSec: (new Date(hasta) - new Date(desde)) / 1000 })
    const states = [
      mkUp('2026-08-26T07:15:00Z', '2026-08-26T08:51:00Z'), // 96 min
      { type: 'downtime', name: 'Detencion', reason: 'KNURO', startAt: '2026-08-26T08:51:00Z', endAt: '2026-08-26T08:57:00Z', durationSec: 360 },
      { type: 'downtime', name: 'Detencion', reason: 'KNURO', startAt: '2026-08-26T09:00:00Z', endAt: '2026-08-26T09:40:00Z', durationSec: 2400 },
      mkUp('2026-08-26T09:40:00Z', '2026-08-26T11:40:00Z'), // 120 min
      { type: 'break', name: 'Detencion', reason: 'COLACION', startAt: '2026-08-26T11:40:00Z', endAt: '2026-08-26T12:25:00Z', durationSec: 2700 },
      mkUp('2026-08-26T12:25:00Z', '2026-08-26T15:00:00Z'), // 155 min
    ]
    const k = kpisDeMaquina(states)
    assert.strictEqual(k.eventosFalla.length, 1)          // KNURO encadenado
    assert.strictEqual(Math.round(k.uptimeMin), 371)
    assert.strictEqual(Math.round(k.mttrMin), 46)          // 2760 s / 1 evento
    assert.strictEqual(Math.round(k.mtbfMin), 371)         // uptime / 1 evento
    // La colación NO castiga la disponibilidad técnica.
    assert.ok(k.dispTecnicaPct > 88 && k.dispTecnicaPct < 90)
    assert.strictEqual(k.grupos.planificado.n, 1)
  })

  test('sin fallas: disponibilidad 100 y MTTR/MTBF null (Ev2/Ev3 del 26-08)', () => {
    const k = kpisDeMaquina([
      { type: 'uptime', name: 'Produciendo', startAt: '2026-08-26T07:15:00Z', endAt: '2026-08-26T15:00:00Z', durationSec: 27900 },
    ])
    assert.strictEqual(k.dispTecnicaPct, 100)
    assert.strictEqual(k.mttrMin, null)
    assert.strictEqual(k.mtbfMin, null)
  })
})

describe('velocidadDesde1min', () => {
  test('la pérdida por velocidad solo cuenta minutos ANDANDO con esperado', () => {
    const v = velocidadDesde1min([
      { c: 15, e: 16 }, { c: 8, e: 16 }, { c: 0, e: 16 }, // el 0 es paro, no velocidad
      { c: 10, e: 0 },                                      // sin esperado: no evalúa
    ])
    assert.strictEqual(v.minAndando, 2)
    assert.strictEqual(v.pzPerdidasVelocidad, 9) // (16-15)+(16-8)
    assert.strictEqual(Math.round(v.pctLleno), 50)
  })
})

describe('caidaDeLinea', () => {
  test('⚠ e=0 en todas = la planta no operaba: cae del "no planificada"', () => {
    const ev1 = [{ c: 0, e: 19 }, { c: 0, e: 0 }, { c: 5, e: 19 }]
    const ev2 = [{ c: 0, e: 16 }, { c: 0, e: 0 }, { c: 0, e: 16 }]
    const r = caidaDeLinea([ev1, ev2])
    assert.strictEqual(r.minCaidaTotal, 2)          // min 0 y min 1
    assert.strictEqual(r.minCaidaNoPlanificada, 1)  // solo el min 0
  })
})

describe('reenganches', () => {
  test('⚠ el umbral es la mediana ANDANDO propia, no el esperado teórico', () => {
    // Ev1 real: esperado 19, mediana andando 13. Contra el teórico daba "nunca".
    const t0 = Date.parse('2026-08-26T10:00:00Z')
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      ms: t0 + i * 60_000, e: 19, c: [0, 0, 1, 5, 14, 15, 13, 14, 15, 13][i],
    }))
    const r = reenganches(buckets, [{ hasta: '2026-08-26T10:00:00Z' }], 13)
    assert.strictEqual(r[0].min, 4) // al 5º minuto llega a 14 ≥ 11,7
  })

  test('si nunca recupera, dice null en vez de inventar', () => {
    const buckets = [{ ms: Date.parse('2026-08-26T10:01:00Z'), e: 19, c: 3 }]
    const r = reenganches(buckets, [{ hasta: '2026-08-26T10:00:00Z' }], 13)
    assert.strictEqual(r[0].min, null)
  })
})

describe('interseccionSec', () => {
  const { interseccionSec } = require('../kpisMantencion')
  const min = (m) => m * 60_000

  test('la línea entera detenida = solape de TODAS, no la suma', () => {
    // Ev1 para 0-10, Ev2 para 5-15: sumados son 20 min, juntas solo 5.
    const sec = interseccionSec([
      [[min(0), min(10)]],
      [[min(5), min(15)]],
    ])
    assert.strictEqual(sec, 5 * 60)
  })

  test('sin solape es 0 aunque cada una haya parado', () => {
    const sec = interseccionSec([
      [[min(0), min(10)]],
      [[min(20), min(30)]],
    ])
    assert.strictEqual(sec, 0)
  })

  test('tramos solapados de UNA máquina no cuentan doble', () => {
    // Ev1 trae el mismo paro partido en dos states que se pisan.
    const sec = interseccionSec([
      [[min(0), min(8)], [min(6), min(10)]],
      [[min(4), min(12)]],
    ])
    assert.strictEqual(sec, 6 * 60)   // 4→10
  })

  test('tres máquinas: manda la ventana común', () => {
    const sec = interseccionSec([
      [[min(0), min(30)]],
      [[min(10), min(40)]],
      [[min(25), min(50)]],
    ])
    assert.strictEqual(sec, 5 * 60)   // 25→30
  })
})
