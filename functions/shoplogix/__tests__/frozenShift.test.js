/**
 * Tests de `isShiftAlreadyFrozen` (node:test nativo — correr con `node --test`).
 *
 * Este helper decide si un turno YA cerrado se puede dejar de reescribir. Es el
 * corazón del ahorro de writes (~12k/día → ~2k), pero también el cambio con más
 * riesgo del PR: si devuelve `true` de más, un turno queda congelado con datos
 * incompletos y NADIE lo vuelve a escribir.
 *
 * Por eso la regla es asimétrica y estos tests la fijan:
 *   - `true` (congelar) solo con evidencia positiva y completa.
 *   - `false` (reescribir) ante cualquier duda: doc ausente, sin lastSyncAt,
 *     sync anterior al cierre, doc legacy sin enriquecer, o error de lectura.
 *
 * Un falso `false` cuesta unos writes. Un falso `true` pierde datos.
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { isShiftAlreadyFrozen, CLOSED_SHIFT_GRACE_MS, PARENT_SCHEMA_VERSION, aggregateStatesByReason } = require('../sync')

const silentLogger = { warn() {}, info() {}, error() {} }

const SCHEDULED_END = new Date('2026-07-08T15:00:00Z')

/** `now` a N ms después del cierre del turno. */
const nowAfterClose = (ms) => new Date(SCHEDULED_END.getTime() + ms)

/**
 * db falso: `doc()` devuelve un ref cuyo `get()` resuelve al snapshot dado.
 * `snapshot === null` simula doc inexistente; `throws` simula error de lectura.
 */
function fakeDb({ data, exists = true, throws = false }) {
  return {
    doc: () => ({
      get: async () => {
        if (throws) throw new Error('firestore unavailable')
        return { exists, data: () => data }
      },
    }),
  }
}

/** Doc padre "sano": sincronizado bien después del cierre, con esquema al día. */
function healthyParentDoc() {
  return {
    parentSchemaVersion: PARENT_SCHEMA_VERSION,
    lastSyncAt: new Date(SCHEDULED_END.getTime() + CLOSED_SHIFT_GRACE_MS + 60_000),
    machines: [
      { machineid: 'm1', status: 'ok', totalCycles: 8000, uptimeSec: 20000 },
      { machineid: 'm2', status: 'ok', totalCycles: 7500, uptimeSec: 19000 },
    ],
  }
}

const call = (db, now) => isShiftAlreadyFrozen({
  db,
  plantSlug: 'yal',
  parentShiftDateKey: '2026-07-08',
  shiftId: 'Turno 2',
  scheduledEnd: SCHEDULED_END,
  now,
  logger: silentLogger,
})

// ── Caso feliz: el único que congela ─────────────────────────────────────────

test('congela un turno cerrado, ya sincronizado tras el cierre y enriquecido', async () => {
  const frozen = await call(fakeDb({ data: healthyParentDoc() }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, true)
})

test('acepta lastSyncAt como Timestamp de Firestore (tiene .toDate())', async () => {
  const ts = { toDate: () => new Date(SCHEDULED_END.getTime() + CLOSED_SHIFT_GRACE_MS + 60_000) }
  const data = { ...healthyParentDoc(), lastSyncAt: ts }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, true)
})

// ── Gracia post-cierre ───────────────────────────────────────────────────────

test('NO congela dentro de la gracia: Shoplogix aún puede ajustar el turno', async () => {
  const frozen = await call(fakeDb({ data: healthyParentDoc() }), nowAfterClose(30 * 60_000))
  assert.strictEqual(frozen, false)
})

test('NO congela un turno todavía en curso (now anterior al cierre)', async () => {
  const frozen = await call(fakeDb({ data: healthyParentDoc() }), nowAfterClose(-2 * 3600_000))
  assert.strictEqual(frozen, false)
})

// ── Evidencia insuficiente → reescribir ──────────────────────────────────────

test('NO congela si el doc padre no existe: el turno nunca se guardó', async () => {
  const frozen = await call(fakeDb({ exists: false, data: undefined }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

test('NO congela si el doc padre no trae lastSyncAt', async () => {
  const data = { ...healthyParentDoc(), lastSyncAt: undefined }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

test('NO congela si el último sync ocurrió ANTES del cierre + gracia', async () => {
  // El turno cerró 15:00 pero el último sync fue 14:30 → los datos finales
  // (última hora de producción) nunca se guardaron. Debe reescribirse.
  const data = { ...healthyParentDoc(), lastSyncAt: new Date('2026-07-08T14:30:00Z') }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

test('NO congela docs legacy sin uptimeSec: se reescriben una vez para enriquecer', async () => {
  const data = {
    ...healthyParentDoc(),
    machines: [{ machineid: 'm1', status: 'ok', totalCycles: 8000 }],  // sin uptimeSec
  }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

// ── Migración de esquema del doc padre ───────────────────────────────────────

test('NO congela docs sin parentSchemaVersion (v1 implícita)', async () => {
  const data = { ...healthyParentDoc() }
  delete data.parentSchemaVersion
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

test('NO congela docs de una versión de esquema anterior: fuerza el repoblado', async () => {
  // Este es el punto de todo el mecanismo: sin él, un turno congelado nunca
  // recibiría los campos que agregue una versión futura del sync, y haría falta
  // un backfill manual del histórico completo.
  const data = { ...healthyParentDoc(), parentSchemaVersion: PARENT_SCHEMA_VERSION - 1 }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

test('congela docs de una versión FUTURA (no fuerza reescritura hacia atrás)', async () => {
  const data = { ...healthyParentDoc(), parentSchemaVersion: PARENT_SCHEMA_VERSION + 1 }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, true)
})

test('NO congela si machines viene vacío', async () => {
  const data = { ...healthyParentDoc(), machines: [] }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

test('NO congela si machines no es array (doc corrupto)', async () => {
  const data = { ...healthyParentDoc(), machines: 'basura' }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

// ── Tolerancia a fallos ──────────────────────────────────────────────────────

test('NO congela (y no lanza) si la lectura de Firestore falla', async () => {
  const frozen = await call(fakeDb({ throws: true }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, false)
})

// ── Robustez del enriquecimiento parcial ─────────────────────────────────────

test('congela aunque UNA máquina haya fallado el normalizer (some, no every)', async () => {
  // Si una Baader queda en status:'error' sin uptimeSec, exigir que TODAS lo
  // tengan dejaría el turno reescribiéndose para siempre.
  const data = {
    ...healthyParentDoc(),
    machines: [
      { machineid: 'm1', status: 'ok', totalCycles: 8000, uptimeSec: 20000 },
      { machineid: 'm2', status: 'error', error: 'normalizer err' },
    ],
  }
  const frozen = await call(fakeDb({ data }), nowAfterClose(6 * 3600_000))
  assert.strictEqual(frozen, true)
})
