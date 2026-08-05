/**
 * Guard de CABEZA truncada — espejo de `truncatedTail.test.js`.
 *
 * Hace falta desde que la ventana de consulta empieza a las 06:00 (antes 08:00)
 * para captar el arranque anticipado del turno de día. El efecto colateral es
 * que ahora la consulta de un día alcanza a ver la COLA del turno nocturno que
 * arrancó el día anterior y sigue corriendo — Yal `Turno 3` iba 00:00→08:00 —,
 * y ese fragmento apunta al MISMO doc que la ventana anterior ya escribió
 * entero. Sin este guard lo pisaría con dos horas de datos.
 *
 * Es exactamente el mismo mecanismo que arruinó a Filete el 03-ago (4 ciclos en
 * vez de 2.406), con el borde cambiado.
 */
const test = require('node:test')
const assert = require('node:assert')

const { isTruncatedHeadOfPrevWindow } = require('../sync')

// Ventana del 2026-08-05: 06:00 del 05 → 08:00 del 06 (wall-clock-as-UTC).
const WINDOW_START = new Date('2026-08-05T06:00:00Z')

const logger = { warn() {}, info() {}, error() {} }

/** Firestore mínimo: un doc con el `scheduledStart` que se quiera. */
function dbWith(storedStart, { exists = true, throws = false } = {}) {
  return {
    doc: () => ({
      get: async () => {
        if (throws) throw new Error('firestore caido')
        return {
          exists,
          data: () => (storedStart === undefined ? {} : { scheduledStart: storedStart }),
        }
      },
    }),
  }
}

const call = (db, scheduledStart) => isTruncatedHeadOfPrevWindow({
  db, plantSlug: 'yal', parentShiftDateKey: '2026-08-05', shiftId: 'Turno 3',
  scheduledStart, windowStart: WINDOW_START, logger,
})

test('cabeza cortada: el grupo empieza en el borde y el doc arranca antes → NO se escribe', async () => {
  // Caso real que motiva el guard: Turno 3 corre 00:00→08:00; la ventana del 05
  // lo ve solo desde las 06:00, pero el doc completo ya existe desde las 00:00.
  const db = dbWith(new Date('2026-08-05T00:00:00Z'))
  assert.strictEqual(await call(db, WINDOW_START), true)
})

test('un turno que arranca DESPUÉS del borde nunca está cortado', async () => {
  // El turno de día (07:15) empieza dentro de la ventana: se escribe siempre.
  const db = dbWith(new Date('2026-08-05T00:00:00Z'))
  assert.strictEqual(await call(db, new Date('2026-08-05T07:15:00Z')), false)
})

test('un turno que legítimamente arranca a las 06:00 se escribe', async () => {
  // El doc guardado arranca a la misma hora ⇒ nadie tiene mejor información.
  // Sin esta condición, un turno que empieza justo en el borde no se guardaría
  // nunca: la ventana anterior termina antes y tampoco lo ve.
  const db = dbWith(new Date('2026-08-05T06:00:00Z'))
  assert.strictEqual(await call(db, WINDOW_START), false)
})

test('si Shoplogix ATRASA el inicio de un turno, la corrección se guarda', async () => {
  // El doc decía que arrancaba más tarde: esto es una corrección real, no un
  // fragmento. Bloquearla dejaría el doc viejo para siempre.
  const db = dbWith(new Date('2026-08-05T09:00:00Z'))
  assert.strictEqual(await call(db, WINDOW_START), false)
})

test('sin doc guardado se escribe (es la primera vez que se ve el turno)', async () => {
  assert.strictEqual(await call(dbWith(null, { exists: false }), WINDOW_START), false)
})

test('doc sin scheduledStart → se escribe, no se asume nada', async () => {
  assert.strictEqual(await call(dbWith(undefined), WINDOW_START), false)
})

test('scheduledStart inválido → se escribe', async () => {
  assert.strictEqual(await call(dbWith(new Date('no-es-fecha')), WINDOW_START), false)
})

test('Firestore caído → se escribe; nunca se pierde un turno por precaución', async () => {
  assert.strictEqual(await call(dbWith(null, { throws: true }), WINDOW_START), false)
})

test('acepta Timestamp de Firestore, Date y string ISO', async () => {
  const ts = { toDate: () => new Date('2026-08-05T00:00:00Z') }
  assert.strictEqual(await call(dbWith(ts), WINDOW_START), true)
  assert.strictEqual(await call(dbWith(new Date('2026-08-05T00:00:00Z')), WINDOW_START), true)
  assert.strictEqual(await call(dbWith('2026-08-05T00:00:00Z'), WINDOW_START), true)
})

test('no hace ni una lectura cuando el turno arranca dentro de la ventana', async () => {
  // El corto-circuito importa: `syncDay` evalúa esto por cada grupo de cada
  // planta, en cada corrida horaria.
  let lecturas = 0
  const db = { doc: () => ({ get: async () => { lecturas++; return { exists: false } } }) }
  await call(db, new Date('2026-08-05T07:15:00Z'))
  assert.strictEqual(lecturas, 0)
})
