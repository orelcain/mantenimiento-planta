/**
 * Turno que arranca ANTES del ancla de 08:00 y sigue en curso.
 *
 * Caso real, Chonchi 29-sep-2026: el Turno 2 arrancó 07:15 (oficial 07:15→15:00).
 * Hasta las 08:00 el sync corre la ventana de AYER (28 06:00 → 29 08:00). Desde
 * #1191 el turno en curso toma el cierre oficial (15:00) y el guard de cola
 * cortada lo veía «pasado del borde» con un doc guardado que también decía 15:00
 * → lo salteaba en cada sync: el doc quedó con 1 interval y el monitor mostró
 * «detenido desde 07:15» hasta las 08:03, con la línea produciendo.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { resolveShiftWindow, isTruncatedTailOfNextWindow, cierreParaGuardCola } = require('../sync')

const silentLogger = { warn() {}, info() {}, error() {} }
const at = (iso) => new Date(iso)
const WINDOW_END = at('2026-09-29T08:00:00Z') // ventana del 28: 06:00 → 08:00 del 29 (wall-clock-as-UTC)

// Doc de hoy ya escrito en el primer sync (07:17) con el cierre oficial.
const dbConDoc = (scheduledEnd) => ({
  doc: () => ({ get: async () => ({ exists: true, data: () => ({ scheduledEnd }) }) }),
})

const guardCola = (scheduledEnd, storedEnd) => isTruncatedTailOfNextWindow({
  db: dbConDoc(storedEnd), plantSlug: 'chonchi', parentShiftDateKey: '2026-09-29', shiftId: 'Turno 2',
  scheduledEnd, windowEnd: WINDOW_END, logger: silentLogger,
})

test('caso real 29-09 07:51: el turno en curso que arrancó 07:15 SE ESCRIBE', async () => {
  const observado = at('2026-09-29T07:51:26Z')
  const ventana = resolveShiftWindow({
    scheduledStart: at('2026-09-29T07:15:00Z'), scheduledEnd: observado,
    officialStart: at('2026-09-29T07:15:00Z'), officialEnd: at('2026-09-29T15:00:00Z'),
    nowWall: at('2026-09-29T07:52:00Z'),
  })
  assert.strictEqual(ventana.corregida, true)
  assert.deepStrictEqual(ventana.end, at('2026-09-29T15:00:00Z'))

  const storedEnd = at('2026-09-29T15:00:00Z')
  // Lo que pasaba: con el cierre corregido el guard salteaba el turno.
  assert.strictEqual(await guardCola(ventana.end, storedEnd), true)
  // Con el cierre observado, no hay cola cortada: se escribe.
  assert.strictEqual(await guardCola(cierreParaGuardCola(observado, ventana.end), storedEnd), false)
})

test('la cola cortada de verdad se sigue protegiendo (re-sync de ayer pasadas las 08:00)', async () => {
  // Ventana de ayer: el turno de hoy aparece cortado justo en el borde, sin oficial.
  const observado = WINDOW_END
  const ventana = resolveShiftWindow({
    scheduledStart: at('2026-09-29T07:15:00Z'), scheduledEnd: observado, nowWall: at('2026-09-29T09:10:00Z'),
  })
  assert.strictEqual(ventana.corregida, false)
  assert.strictEqual(await guardCola(cierreParaGuardCola(observado, ventana.end), at('2026-09-29T15:00:00Z')), true)
})

test('si la corrección ACORTA (ventana imposible, caso 3-ago) manda la corregida', () => {
  const observado = at('2026-08-04T06:45:00Z')
  const corregido = at('2026-08-03T15:30:00Z')
  assert.deepStrictEqual(cierreParaGuardCola(observado, corregido), corregido)
})

test('sin corrección, el cierre es el observado', () => {
  const e = at('2026-09-29T07:51:26Z')
  assert.deepStrictEqual(cierreParaGuardCola(e, e), e)
})

test('fechas inválidas no rompen: se usa la otra', () => {
  const ok = at('2026-09-29T07:51:26Z')
  assert.deepStrictEqual(cierreParaGuardCola(new Date('x'), ok), ok)
  assert.deepStrictEqual(cierreParaGuardCola(ok, null), ok)
})
