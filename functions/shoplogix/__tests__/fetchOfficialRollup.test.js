/**
 * Tests de fetchOfficialRollup (node:test nativo — correr con `node --test`).
 *
 * `query` es inyectado (fake), sin red real. Escenarios calcados de lo
 * verificado a mano contra saas139.shoplogix.com el 2026-07-16 (ver
 * ARIA_MEMORY.md § "API interna Shoplogix").
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { fetchOfficialRollup } = require('../sync')

const REAL_ROLLUP_RESPONSE = {
  machines: [
    { machine: 'YAL Evisceradora 1', machineid: 'fbf9e673-7fdf-47d4-a1cb-af3777fa8eb4', shift: 'Turno 2', start: '20260716T144500.000', end: '20260717T000000.000', target: 4662.6856 },
    { machine: 'YAL Evisceradora 2', machineid: 'f7d8838a-0aff-4d80-a676-a4e35b3a4c00', shift: 'Turno 2', start: '20260716T144500.000', end: '20260717T000000.000', target: 4662.6832 },
    { machine: 'YAL Evisceradora 3', machineid: '54eea655-3c62-4d3d-8e3b-11b3962e988b', shift: 'Turno 2', start: '20260716T144500.000', end: '20260717T000000.000', target: 5536.93345 },
    { machine: 'Total', machineid: 'Total', shift: 'Turno 2', start: '20260716T144500.000', end: '20260717T000000.000', target: 14862.30225 },
  ],
  jobs: [{ name: 'SALAR', jobMaxRunRate: 1140, currentJob: true, productionQuantityExpected: 0 }],
}

test('parsea el rollup real: targets por machineid, excluye la fila "Total", toma el job vigente', async () => {
  const query = async (opts) => {
    assert.strictEqual(opts.type, 'whiteboard')
    assert.strictEqual(opts.params.rollup, 1)
    assert.strictEqual(opts.params.areas, 3651)
    return REAL_ROLLUP_RESPONSE
  }
  const result = await fetchOfficialRollup({ query, plantSlug: 'yal', at: new Date('2026-07-16T21:00:58Z') })
  assert.strictEqual(result.shiftLabel, 'Turno 2')
  assert.strictEqual(result.targetsByMachineId.size, 3, 'la fila "Total" no debe contarse como máquina')
  assert.strictEqual(result.targetsByMachineId.get('fbf9e673-7fdf-47d4-a1cb-af3777fa8eb4'), 4662.6856)
  assert.strictEqual(result.targetsByMachineId.get('54eea655-3c62-4d3d-8e3b-11b3962e988b'), 5536.93345)
  assert.deepStrictEqual(result.currentJob, { name: 'SALAR', jobMaxRunRate: 1140, productionQuantityExpected: 0 })
  // Convención "wall-clock-as-UTC" del proyecto (igual que toShoplogixTime/
  // parseShoplogixTime en todo sync.js): 14:45 Chile se codifica y decodifica
  // como 14:45Z, sin aplicar el offset -03:00/-04:00 real.
  assert.strictEqual(result.officialStart.toISOString(), '2026-07-16T14:45:00.000Z')
})

test('plantSlug sin areaId registrado (chonchi 2.0, hipotético) devuelve null sin llamar a query', async () => {
  const query = async () => { throw new Error('no debería llamarse') }
  const result = await fetchOfficialRollup({ query, plantSlug: 'planta-inexistente', at: new Date() })
  assert.strictEqual(result, null)
})

test('respuesta sin filas de máquina (día sin config) devuelve null', async () => {
  const query = async () => ({ machines: [], jobs: [] })
  const result = await fetchOfficialRollup({ query, plantSlug: 'yal', at: new Date() })
  assert.strictEqual(result, null)
})

test('HTTP 500 ("No exporter found", visto en la práctica) no lanza — devuelve null', async () => {
  const query = async () => { throw new Error('[shoplogix] HTTP 500 en whiteboard: No exporter found') }
  const result = await fetchOfficialRollup({ query, plantSlug: 'yal', at: new Date(), logger: { warn: () => {} } })
  assert.strictEqual(result, null)
})

test('AUTH_EXPIRED SÍ se propaga (no es un error a ignorar en silencio)', async () => {
  const query = async () => { const e = new Error('Auth expirada'); e.code = 'AUTH_EXPIRED'; throw e }
  await assert.rejects(
    () => fetchOfficialRollup({ query, plantSlug: 'yal', at: new Date() }),
    (err) => err.code === 'AUTH_EXPIRED',
  )
})

test('sin jobs[] en la respuesta, currentJob queda null (no revienta)', async () => {
  const query = async () => ({
    machines: [{ machine: 'YAL Evisceradora 1', machineid: 'fbf9e673-7fdf-47d4-a1cb-af3777fa8eb4', shift: 'Turno 3', start: '20260716T000000.000', end: '20260716T074500.000', target: 100 }],
  })
  const result = await fetchOfficialRollup({ query, plantSlug: 'yal', at: new Date() })
  assert.strictEqual(result.currentJob, null)
  assert.strictEqual(result.shiftLabel, 'Turno 3')
})
