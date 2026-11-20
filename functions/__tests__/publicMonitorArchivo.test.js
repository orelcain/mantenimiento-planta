/**
 * Tests de «Ver otro día»: un turno pasado del monitor público, a pedido.
 * Correr con `node --test`.
 *
 * Invariantes:
 *   1. Solo se aceptan ids de turno con nombre, con forma `YYYY-MM-DD_Nombre`,
 *      dentro de la ventana de 45 días. Nada de rutas (`/`), sensor ni futuro.
 *   2. Un turno ya armado no vuelve a leer `shoplogix/` (caché en
 *      `publicMonitorArchivo`), salvo que esté medido con otra rejilla o sea
 *      reciente (el re-sync móvil todavía lo puede mover).
 *   3. El `live` que se entrega es JSON puro: sin `Date` (por HTTP llegaría
 *      como string y por Firestore como Timestamp: dos formas para la PWA).
 */

const { test } = require('node:test')
const assert = require('node:assert')

const {
  motivoRechazoArchivo, archivoVigente, listarTurnosArchivo, buildTurnoArchivo, ARCHIVO_COLLECTION,
} = require('../publicMonitor')

const AHORA = new Date(Date.UTC(2026, 10, 20, 12, 0, 0)) // 20-nov-2026 12:00 (reloj de planta)

test('acepta un turno con nombre dentro de la ventana', () => {
  assert.strictEqual(motivoRechazoArchivo('2026-10-25_Turno 1', AHORA), null)
  assert.strictEqual(motivoRechazoArchivo('2026-11-20_Turno Dia', AHORA), null)
})

test('rechaza formas raras, sensor, demasiado viejo y futuro', () => {
  assert.strictEqual(motivoRechazoArchivo('', AHORA), 'FORMATO')
  assert.strictEqual(motivoRechazoArchivo('2026-10-25', AHORA), 'FORMATO')
  assert.strictEqual(motivoRechazoArchivo('2026-10-25_Turno/../x', AHORA), 'FORMATO')
  assert.strictEqual(motivoRechazoArchivo(`2026-10-25_${'x'.repeat(61)}`, AHORA), 'FORMATO')
  assert.strictEqual(motivoRechazoArchivo('2026-10-25_Unscheduled@16:15', AHORA), 'SENSOR')
  assert.strictEqual(motivoRechazoArchivo('2026-09-01_Turno 1', AHORA), 'MUY_VIEJO')
  assert.strictEqual(motivoRechazoArchivo('2026-11-25_Turno 1', AHORA), 'FUTURO')
})

test('archivo guardado: viejo vale siempre; reciente solo 30 min; rejilla vieja nunca', () => {
  const live = { timeBreakdown: { tbv: 3 }, mantencion: { clasif: 2 } }
  const nowMs = AHORA.getTime()
  // Turno de hace 10 días: no se mueve más.
  assert.strictEqual(archivoVigente({ live, builtAt: '2026-01-01T00:00:00Z' }, '2026-11-10', AHORA, nowMs), true)
  // Turno de ayer armado hace 5 min: vale; hace 2 h: se rearma.
  assert.strictEqual(archivoVigente({ live, builtAt: new Date(nowMs - 5 * 60_000).toISOString() }, '2026-11-19', AHORA, nowMs), true)
  assert.strictEqual(archivoVigente({ live, builtAt: new Date(nowMs - 2 * 3600_000).toISOString() }, '2026-11-19', AHORA, nowMs), false)
  // Rejilla o clasificación viejas: se rearma aunque sea viejo.
  assert.strictEqual(archivoVigente({ live: { timeBreakdown: { tbv: 2 } } }, '2026-11-01', AHORA, nowMs), false)
  assert.strictEqual(archivoVigente({ live: { timeBreakdown: { tbv: 3 }, mantencion: { clasif: 1 } } }, '2026-11-01', AHORA, nowMs), false)
  assert.strictEqual(archivoVigente(null, '2026-11-01', AHORA, nowMs), false)
})

/* ── Stub de Firestore: rango por documentId + caché + subcolección machines ── */

function intervals(startMs, count, cycles) {
  return Array.from({ length: count }, (_, i) => ({
    startAt: new Date(startMs + i * 5 * 60_000),
    endAt: new Date(startMs + (i + 1) * 5 * 60_000),
    cycles,
    expectedCycles: 100,
  }))
}

function fakeDb({ shifts, machinesById, cache = new Map() }) {
  const lecturas = { machines: 0, indice: 0, cacheSets: 0 }
  const db = {
    lecturas,
    cache,
    collection(path) {
      if (path === ARCHIVO_COLLECTION) {
        return {
          doc: (id) => ({
            get: async () => ({ exists: cache.has(id), data: () => cache.get(id) }),
            set: async (v) => { lecturas.cacheSets++; cache.set(id, JSON.parse(JSON.stringify(v))) },
          }),
        }
      }
      // shoplogix/{plant}/shifts — consulta por rango de id
      const filtros = []
      const q = {
        where(_campo, op, valor) { filtros.push([op, valor]); return q },
        async get() {
          lecturas.indice++
          const docs = Object.entries(shifts)
            .filter(([id]) => filtros.every(([op, v]) => (op === '>=' ? id >= v : id < v)))
            .map(([id, data]) => ({ id, data: () => data }))
          return { docs }
        },
        async listDocuments() { throw new Error('no debe usar el camino legado') },
      }
      return q
    },
    doc(path) {
      const id = path.split('/').pop()
      return {
        get: async () => ({ exists: !!shifts[id], data: () => shifts[id] }),
        collection: () => ({
          get: async () => {
            lecturas.machines++
            const ms = machinesById[id] || []
            return { empty: ms.length === 0, docs: ms.map((m, i) => ({ id: m.machineid || `m${i}`, data: () => m })) }
          },
        }),
      }
    },
  }
  return db
}

function turnoDe(dateKey) {
  const start = Date.parse(`${dateKey}T08:00:00Z`)
  const end = Date.parse(`${dateKey}T17:00:00Z`)
  return {
    parent: { scheduledStart: new Date(start), scheduledEnd: new Date(end), lastSyncAt: new Date(end) },
    machines: [{
      machineid: 'b200', machineName: 'Linea 1', machineType: 'baader_200',
      totalCycles: 6480, expectedTotalCycles: 8000, shiftRuntime: 0.9,
      shiftRuntimeBreakdown: { uptimeSec: 32400, downtimeSec: 0, breakSec: 0 },
      scheduledStart: new Date(start), scheduledEnd: new Date(end),
      intervals: intervals(start, 108, 60),
      states: [],
    }],
  }
}

function hayDate(v) {
  if (v instanceof Date) return true
  if (Array.isArray(v)) return v.some(hayDate)
  if (v && typeof v === 'object') return Object.values(v).some(hayDate)
  return false
}

test('arma el turno con índice acotado, lo guarda y la segunda vez no lee shoplogix', async () => {
  const id = '2026-10-25_Turno 1'
  const t = turnoDe('2026-10-25')
  const db = fakeDb({ shifts: { [id]: t.parent }, machinesById: { [id]: t.machines } })

  const e1 = await buildTurnoArchivo(db, 'chonchi', id, { nowWall: AHORA, nowMs: AHORA.getTime() })
  assert.ok(e1, 'debe armar el turno')
  assert.strictEqual(e1.shiftDocId, id)
  assert.strictEqual(e1.dateKey, '2026-10-25')
  assert.strictEqual(e1.shiftId, 'Turno 1')
  assert.strictEqual(e1.live.totalPieces, 6480)
  assert.strictEqual(e1.live.shiftClosed, true, 'un turno de hace un mes sale cerrado')
  assert.strictEqual(hayDate(e1.live), false, 'el live viaja como JSON puro')
  assert.strictEqual(db.lecturas.cacheSets, 1)
  assert.ok(db.cache.has(`chonchi__${id}`))

  const machinesAntes = db.lecturas.machines
  const indiceAntes = db.lecturas.indice
  const e2 = await buildTurnoArchivo(db, 'chonchi', id, { nowWall: AHORA, nowMs: AHORA.getTime() })
  assert.deepStrictEqual(e2, JSON.parse(JSON.stringify(e1)))
  assert.strictEqual(db.lecturas.machines, machinesAntes, 'no relee las máquinas')
  assert.strictEqual(db.lecturas.indice, indiceAntes, 'no relee el índice')
})

test('un turno que no existe devuelve null y no guarda nada', async () => {
  const db = fakeDb({ shifts: {}, machinesById: {} })
  const e = await buildTurnoArchivo(db, 'chonchi', '2026-10-25_Turno 9', { nowWall: AHORA, nowMs: AHORA.getTime() })
  assert.strictEqual(e, null)
  assert.strictEqual(db.lecturas.cacheSets, 0)
  assert.strictEqual(db.lecturas.machines, 0)
})

test('la lista de «Ver otro día» ordena por arranque real y filtra sensor, vigente y pruebas', () => {
  const p = (ini, pz) => ({ scheduledStart: new Date(`2026-11-18T${ini}:00Z`), machines: [{ totalCycles: pz }] })
  const entries = [
    { id: '2026-11-18_Turno 1', data: p('21:30', 5000) },     // noche: arranca DESPUÉS del Turno 2
    { id: '2026-11-18_Turno 2', data: p('09:00', 6000) },
    { id: '2026-11-18_Unscheduled', data: p('00:00', 900) },  // cajón del sensor: fuera
    { id: '2026-11-17_Turno 2', data: p('09:00', 30) },       // prueba (< 50 pz): fuera
    { id: '2026-11-17_Turno 1', data: { machines: [{ totalCycles: 4000 }] } }, // sin horario: igual entra
    { id: '2026-11-19_Turno 2', data: p('09:00', 7000) },     // el vigente: fuera
  ]
  const lista = listarTurnosArchivo({ entries }, '2026-11-19_Turno 2')
  assert.deepStrictEqual(lista, [
    { id: '2026-11-18_Turno 1', ini: '21:30', pz: 5000 },
    { id: '2026-11-18_Turno 2', ini: '09:00', pz: 6000 },
    { id: '2026-11-17_Turno 1', ini: null, pz: 4000 },
  ])
  assert.deepStrictEqual(listarTurnosArchivo(null, 'x'), [])
})
