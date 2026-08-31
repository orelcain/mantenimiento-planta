/**
 * El archivo de las barras minuto a minuto (`archivarSerieMinuto`): al
 * refrescar un monitor de línea, la serie del pulso se guarda recortada a la
 * ventana del turno que se venía midiendo, para que el historial conserve las
 * barras cuando Shoplogix ya no entregue los buckets (ventana de ~12 h).
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { archivarSerieMinuto } = require('../publicMonitor')

/** Un monitor con serie de 60 min desde las 10:00 y turno 10:05→10:45. */
function monitorBase() {
  return {
    shiftDocId: '2026-08-30_Turno 2',
    live: {
      effectiveStart: '2026-08-30T10:05:00.000Z',
      effectiveEnd: '2026-08-30T10:45:00.000Z',
    },
    pulse: {
      serieMinuto: {
        desde: '2026-08-30T10:00:00.000Z',
        maquinas: [
          { id: 'a', esperado: 19, cycles: Array.from({ length: 60 }, (_, i) => i % 20) },
          { id: 'b', cycles: Array.from({ length: 60 }, () => 5) },
        ],
      },
    },
    seriesMinuto: [],
  }
}

test('archiva la serie recortada a la ventana del turno (+30 min de gracia)', () => {
  const out = archivarSerieMinuto(monitorBase())
  assert.ok(out)
  assert.strictEqual(out.length, 1)
  const e = out[0]
  assert.strictEqual(e.shiftDocId, '2026-08-30_Turno 2')
  // arranca en el minuto 5 (10:05) y llega hasta fin+30 (10:45+30 = min 75,
  // acotado al largo real de 60)
  assert.strictEqual(e.desde, '2026-08-30T10:05:00.000Z')
  assert.strictEqual(e.maquinas[0].cycles.length, 55)
  // conserva los campos del pulso (esperado) sin inventar otros
  assert.strictEqual(e.maquinas[0].esperado, 19)
  assert.strictEqual(e.maquinas[1].esperado, undefined)
})

test('una serie PARCIAL (empieza >15 min después del arranque) NO se archiva', () => {
  const m = monitorBase()
  m.live.effectiveStart = '2026-08-30T09:30:00.000Z' // el turno empezó 30 min antes de la serie
  assert.strictEqual(archivarSerieMinuto(m), null)
})

test('reemplaza la entrada del mismo turno y conserva las de otros, con tope 6', () => {
  const m = monitorBase()
  m.seriesMinuto = [
    { shiftDocId: '2026-08-30_Turno 2', desde: 'viejo', maquinas: [] }, // se reemplaza
    ...Array.from({ length: 6 }, (_, i) => ({ shiftDocId: `otro-${i}`, desde: 'x', maquinas: [] })),
  ]
  const out = archivarSerieMinuto(m)
  assert.strictEqual(out.length, 6)
  assert.strictEqual(out[0].shiftDocId, '2026-08-30_Turno 2')
  assert.notStrictEqual(out[0].desde, 'viejo')
  assert.strictEqual(out.filter(e => e.shiftDocId === '2026-08-30_Turno 2').length, 1)
})

test('sin serie, sin live o sin shiftDocId no hay nada que archivar', () => {
  assert.strictEqual(archivarSerieMinuto({}), null)
  const sinSerie = monitorBase(); sinSerie.pulse = null
  assert.strictEqual(archivarSerieMinuto(sinSerie), null)
  const sinLive = monitorBase(); sinLive.live = null
  assert.strictEqual(archivarSerieMinuto(sinLive), null)
})

test('sin fin legible archiva hasta donde llegue la serie', () => {
  const m = monitorBase()
  m.live = { effectiveStart: '2026-08-30T10:05:00.000Z' }
  const out = archivarSerieMinuto(m)
  assert.ok(out)
  assert.strictEqual(out[0].maquinas[0].cycles.length, 55) // 60 − 5 del arranque
})
