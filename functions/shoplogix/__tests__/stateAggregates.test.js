/**
 * Tests de `aggregateStatesByReason` (node:test nativo — correr con `node --test`).
 *
 * Este agregado es la forma comprimida de `states[]` que va al doc padre para que
 * la vista mensual arme el pareto de paros y los totales macro/micro sin bajar las
 * subcolecciones de cada turno.
 *
 * Invariante que fijan estos tests: el agregado debe conservar TODO lo que la PWA
 * necesita para reconstruir sus números — `type` y `reason` (para clasificar
 * avería vs paro operacional), `name` (para separar Micro Detencion), `color` y
 * `durationSec`/`count`. Si se pierde alguno, el pareto o el MTTR salen mal.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { aggregateStatesByReason } = require('../sync')

const state = (over = {}) => ({
  type: 'downtime', name: '', reason: '', color: '#ff0000', durationSec: 60, ...over,
})

test('suma duración y conteo de states con la misma (type, name, reason)', () => {
  const out = aggregateStatesByReason([
    state({ reason: 'FALTA MMPP', durationSec: 100 }),
    state({ reason: 'FALTA MMPP', durationSec: 50 }),
  ])
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].reason, 'FALTA MMPP')
  assert.strictEqual(out[0].durationSec, 150)
  assert.strictEqual(out[0].count, 2)
})

test('separa buckets distintos por reason', () => {
  const out = aggregateStatesByReason([
    state({ reason: 'FALTA MMPP', durationSec: 100 }),
    state({ reason: 'COLACION', type: 'break', durationSec: 60 }),
  ])
  assert.strictEqual(out.length, 2)
})

test('separa Micro Detencion de Detencion aunque ambas no tengan reason', () => {
  // Clave para el MTTR: la PWA separa macro/micro por `name === 'Micro Detencion'`.
  // Si el agregado colapsara ambas, 1400 microparos hundirían el MTTR macro.
  const out = aggregateStatesByReason([
    state({ name: 'Micro Detencion', durationSec: 5 }),
    state({ name: 'Micro Detencion', durationSec: 7 }),
    state({ name: 'Detencion', durationSec: 600 }),
  ])
  assert.strictEqual(out.length, 2)
  const micro = out.find(x => x.name === 'Micro Detencion')
  const macro = out.find(x => x.name === 'Detencion')
  assert.strictEqual(micro.count, 2)
  assert.strictEqual(micro.durationSec, 12)
  assert.strictEqual(macro.count, 1)
  assert.strictEqual(macro.durationSec, 600)
})

test('separa por type aunque coincidan name y reason', () => {
  // isMaintenanceState mira `type`: un 'break' y un 'downtime' con la misma razón
  // NO son la misma cosa (uno es avería, el otro no).
  const out = aggregateStatesByReason([
    state({ type: 'downtime', reason: 'AJUSTE MANTENIMIENTO' }),
    state({ type: 'break',    reason: 'AJUSTE MANTENIMIENTO' }),
  ])
  assert.strictEqual(out.length, 2)
})

test('excluye uptime: el pareto muestra paradas, y el total ya va en breakdown', () => {
  const out = aggregateStatesByReason([
    state({ type: 'uptime', durationSec: 20000 }),
    state({ type: 'downtime', reason: 'X', durationSec: 10 }),
  ])
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].type, 'downtime')
})

test('ordena por duración descendente (el pareto ya viene listo)', () => {
  const out = aggregateStatesByReason([
    state({ reason: 'CHICO', durationSec: 10 }),
    state({ reason: 'GRANDE', durationSec: 900 }),
    state({ reason: 'MEDIO', durationSec: 100 }),
  ])
  assert.deepStrictEqual(out.map(x => x.reason), ['GRANDE', 'MEDIO', 'CHICO'])
})

test('conserva color, type, name y reason para reconstruir el pareto', () => {
  const out = aggregateStatesByReason([state({ reason: 'COLACION', type: 'break', name: 'Break', color: '#abcdef' })])
  assert.deepStrictEqual(out[0], {
    type: 'break', name: 'Break', reason: 'COLACION', color: '#abcdef', durationSec: 60, count: 1,
  })
})

test('tolera states sin durationSec, sin color y listas vacías/nulas', () => {
  const out = aggregateStatesByReason([{ type: 'downtime', reason: 'X' }])
  assert.strictEqual(out[0].durationSec, 0)
  assert.strictEqual(out[0].color, '#64748b')
  assert.deepStrictEqual(aggregateStatesByReason([]), [])
  assert.deepStrictEqual(aggregateStatesByReason(null), [])
  assert.deepStrictEqual(aggregateStatesByReason(undefined), [])
})

test('comprime cientos de micro-paros en una sola entrada', () => {
  const many = Array.from({ length: 500 }, () => state({ name: 'Micro Detencion', durationSec: 3 }))
  const out = aggregateStatesByReason(many)
  assert.strictEqual(out.length, 1)
  assert.strictEqual(out[0].count, 500)
  assert.strictEqual(out[0].durationSec, 1500)
})
