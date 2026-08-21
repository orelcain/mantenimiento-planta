/**
 * Tests de `enviarInforme` (node:test nativo — correr con `node --test`).
 *
 * Lo que fijan es CUANDO NO se manda. Un informe que se manda solo, todos los
 * días, a un canal equivocado o con datos de un turno que no existió, hace más
 * daño que no tenerlo.
 *
 * Firestore va falseado con un doble mínimo: estos tests no verifican la base,
 * verifican las guardas.
 */

const test = require('node:test')
const assert = require('node:assert')

const { enviarInformeDeTurno, nombreArchivo, caption } = require('../enviarInforme')

const silencioso = { warn() {}, info() {}, error() {} }

/** Firestore falso: solo lo que toca `enviarInformeDeTurno`. */
function fakeDb({ padre = {}, machines = [] } = {}) {
  const escrituras = []
  const machineDocs = machines.map((m, i) => ({ id: `m${i}`, data: () => m }))
  const machinesCol = {
    get: async () => ({ empty: machineDocs.length === 0, docs: machineDocs, size: machineDocs.length }),
  }
  const shiftDoc = {
    get: async () => ({ exists: true, data: () => padre }),
    collection: () => machinesCol,
    set: async (v) => { escrituras.push(v) },
  }
  const db = {
    escrituras,
    collection: () => ({ doc: () => ({ collection: () => ({ doc: () => shiftDoc, where() { return this }, get: async () => ({ docs: [] }) }) }) }),
  }
  return db
}

const maquina = (nombre, ciclos) => ({
  machineName: nombre,
  totalCycles: ciclos,
  shiftStart: new Date(Date.UTC(2026, 7, 17, 21, 15)),
  shiftEnd: new Date(Date.UTC(2026, 7, 18, 5, 0)),
  states: [{
    startAt: new Date(Date.UTC(2026, 7, 17, 21, 30)),
    endAt: new Date(Date.UTC(2026, 7, 17, 21, 45)),
    type: 'downtime', name: 'Detencion', reason: 'BOMBAS (MECANICA)',
  }],
  intervals: Array.from({ length: 12 }, (_, i) => ({
    startAt: new Date(Date.UTC(2026, 7, 17, 21, 15 + i * 5)),
    cycles: 180,
  })),
})

const cfgPrendida = { shiftEnd: { minPieces: 50, informePdf: { enabled: true, chatId: '12345' } } }

test('apagada por defecto: no manda nada', async () => {
  let llamado = false
  const r = await enviarInformeDeTurno({
    db: fakeDb(), plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1',
    config: { shiftEnd: { informePdf: { enabled: false } } },
    enviarDocumento: async () => { llamado = true },
    logger: silencioso,
  })
  assert.deepStrictEqual(r, { enviado: false, motivo: 'apagado' })
  assert.strictEqual(llamado, false)
})

test('sin chat configurado NO cae al chat general', async () => {
  // Es la guarda más importante del módulo: un informe que sale solo a un
  // grupo porque nadie configuró el destino es peor que no mandarlo.
  let llamado = false
  const r = await enviarInformeDeTurno({
    db: fakeDb(), plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1',
    config: { shiftEnd: { informePdf: { enabled: true, chatId: null } } },
    enviarDocumento: async () => { llamado = true },
    logger: silencioso,
  })
  assert.strictEqual(r.motivo, 'sin-destino')
  assert.strictEqual(llamado, false)
})

test('no se manda dos veces el mismo turno', async () => {
  let llamado = false
  const r = await enviarInformeDeTurno({
    db: fakeDb({ padre: { informePdfSentAt: new Date() } }),
    plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async () => { llamado = true },
    logger: silencioso,
  })
  assert.strictEqual(r.motivo, 'ya-enviado')
  assert.strictEqual(llamado, false)
})

test('un turno sin producción no genera informe', async () => {
  // Mismo criterio que el brief: bajo el umbral es ruido o lote de prueba.
  let llamado = false
  const r = await enviarInformeDeTurno({
    db: fakeDb({ machines: [maquina('Ev 1', 10)] }),
    plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async () => { llamado = true },
    logger: silencioso,
  })
  assert.strictEqual(r.motivo, 'sin-produccion')
  assert.strictEqual(llamado, false)
})

test('sin máquinas no genera informe', async () => {
  const r = await enviarInformeDeTurno({
    db: fakeDb({ machines: [] }),
    plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async () => {},
    logger: silencioso,
  })
  assert.strictEqual(r.motivo, 'sin-maquinas')
})

test('con todo en orden manda el PDF y cachea el resumen', async () => {
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  const enviados = []
  const r = await enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async (chatId, buffer, filename, cap) => { enviados.push({ chatId, buffer, filename, cap }) },
    logger: silencioso,
  })
  assert.strictEqual(r.enviado, true)
  assert.ok(r.bytes > 10_000, 'el PDF debe tener contenido')

  const [e] = enviados
  assert.strictEqual(e.chatId, '12345')
  assert.strictEqual(e.filename, 'informe-turno-chonchi-2026-08-17_Turno-1.pdf')
  assert.strictEqual(e.buffer.slice(0, 5).toString(), '%PDF-')
  assert.match(e.cap, /Eviscerados Chonchi/)

  // Deja marca de idempotencia y cachea el resumen sin el detalle pesado.
  const [w] = db.escrituras
  assert.ok(w.informePdfSentAt)
  assert.ok(w.resumenLinea)
  assert.strictEqual(w.resumenLinea.causas, undefined, 'el detalle no se cachea')
  assert.strictEqual(w.resumenLinea.ciclos, 4320)
})

test('el mensaje se entiende sin abrir el PDF', async () => {
  // Quien lo lee a las 5 AM en el teléfono tiene que saber si vale la pena abrirlo.
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  let cap = null
  await enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async (_c, _b, _f, c) => { cap = c },
    logger: silencioso,
  })
  assert.match(cap, /Producción/)
  assert.match(cap, /4\.320/)
  assert.match(cap, /Línea detenida/)
})

test('el nombre del archivo no lleva caracteres que rompan Telegram', () => {
  assert.strictEqual(nombreArchivo('yal', '2026-08-17_Turno 1 Lunes'), 'informe-turno-yal-2026-08-17_Turno-1-Lunes.pdf')
})

test('caption arma bien un turno sin detenciones', () => {
  const c = caption({
    meta: { areaLabel: 'Filete', turnoLabel: 'Turno Dia', fechaLabel: '2026-08-17' },
    datos: {
      resumen: { ciclos: 5000, detencion: { todasSec: 0 }, mantencionEquivSec: 0 },
      textos: { veredictoTitulo: 'Turno sin fallas.' },
    },
  })
  assert.match(c, /Línea detenida: 0 min/)
  assert.ok(!/Atribuible a Mantención/.test(c), 'sin tiempo de Mantencion no se muestra la linea')
})

test('un envío fallido NO se marca como enviado', () => {
  // El defecto del 2026-08-19: Telegram responde {ok:false} sin lanzar, el
  // envoltorio no lo miraba y el turno quedaba con `informePdfSentAt` puesto
  // sin que nadie hubiera recibido nada. Y como quedaba marcado, no se
  // reintentaba nunca.
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  return enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async () => { throw new Error('Telegram rechazo el documento: chat not found') },
    logger: silencioso,
  }).then(
    () => assert.fail('debe propagar el error'),
    (e) => {
      assert.match(e.message, /chat not found/)
      const escrito = Object.assign({}, ...db.escrituras)
      assert.strictEqual(escrito.informePdfSentAt, undefined, 'no debe marcarse como enviado')
      assert.strictEqual(escrito.informePdfIntentos, 1)
      assert.match(escrito.informePdfError.mensaje, /chat not found/)
    },
  )
})

test('se rinde después de 3 intentos en vez de reintentar para siempre', async () => {
  // Sin tope, un error permanente hace que el cron arme el PDF cada 5 min y
  // falle, indefinidamente.
  let llamado = false
  const r = await enviarInformeDeTurno({
    db: fakeDb({ padre: { informePdfIntentos: 3 }, machines: [maquina('Ev 1', 2160)] }),
    plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async () => { llamado = true },
    logger: silencioso,
  })
  assert.strictEqual(r.motivo, 'demasiados-intentos')
  assert.strictEqual(llamado, false)
})

test('un turno EN CURSO se manda, pero no deja marca ni cachea', async () => {
  // El botón sirve a mitad de turno, pero el turno sigue vivo: sus números van
  // a cambiar. Si se cacheara, el cotejo de mañana compararía contra una foto
  // a medias — y si dejara marca, el informe real del cierre no saldría.
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  let cap = null
  const r = await enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enCurso: true, forzar: true,
    enviarDocumento: async (_c, _b, _f, c) => { cap = c },
    logger: silencioso,
  })
  assert.strictEqual(r.enviado, true)
  assert.strictEqual(r.parcial, true)
  assert.match(cap, /TURNO EN CURSO/)
  /* Desde el 21-08 SI deja rastro del envio — pero solo eso. Lo que no puede
     dejar es la marca de idempotencia ni el resumen cacheado: con la marca, el
     informe del cierre no saldria; con el resumen, el cotejo de manana
     compararia contra una foto a medias. */
  const escrito = Object.assign({}, ...db.escrituras)
  assert.deepStrictEqual(Object.keys(escrito), ['informePdfEnvios'])
  assert.strictEqual(escrito.informePdfSentAt, undefined, 'un parcial NO puede dejar marca')
  assert.strictEqual(escrito.resumenLinea, undefined, 'un parcial NO puede cachear el resumen')
})

// ── El rastro de lo enviado ─────────────────────────────────────────────────
//
// El 2026-08-20 un envio del boton salio con `enviado: true` y 45 KB en el log,
// y Orel no lo vio en el hilo. Sin el `message_id` no se pudo saber si el
// mensaje existia o si Telegram lo habia deduplicado contra uno identico. Estos
// tests fijan que esa pregunta ahora se pueda responder.

/** `enviarDocumento` que responde como Telegram de verdad. */
const telegramOk = (messageId) => async () => ({ ok: true, result: { message_id: messageId } })

test('guarda el message_id de Telegram al cerrar el turno', async () => {
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  const r = await enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: telegramOk(1547), logger: silencioso,
  })
  assert.strictEqual(r.messageId, 1547)
  const escrito = Object.assign({}, ...db.escrituras)
  assert.strictEqual(escrito.informePdfMessageId, 1547)
  assert.strictEqual(escrito.informePdfEnvios.length, 1)
  assert.strictEqual(escrito.informePdfEnvios[0].messageId, 1547)
  assert.strictEqual(escrito.informePdfEnvios[0].chatId, '12345')
  assert.strictEqual(escrito.informePdfEnvios[0].parcial, false)
  assert.ok(escrito.informePdfEnvios[0].bytes > 5000)
})

test('un envio PARCIAL tambien deja su message_id', async () => {
  // Es justo el que no dejaba nada, y el que fallo el 20-08.
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  const r = await enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enCurso: true, forzar: true,
    enviarDocumento: telegramOk(1548), logger: silencioso,
  })
  assert.strictEqual(r.messageId, 1548)
  const escrito = Object.assign({}, ...db.escrituras)
  assert.strictEqual(escrito.informePdfEnvios[0].messageId, 1548)
  assert.strictEqual(escrito.informePdfEnvios[0].parcial, true)
})

test('los reenvios se acumulan y el historial tiene tope', async () => {
  // El boton se puede apretar muchas veces; el doc padre se lee en cada cotejo.
  const previos = Array.from({ length: 10 }, (_, i) => ({ messageId: 1000 + i, parcial: false }))
  const db = fakeDb({
    padre: { informePdfSentAt: new Date(), informePdfEnvios: previos },
    machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)],
  })
  await enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    forzar: true, enviarDocumento: telegramOk(2000), logger: silencioso,
  })
  const escrito = Object.assign({}, ...db.escrituras)
  assert.strictEqual(escrito.informePdfEnvios.length, 10, 'el historial no puede crecer sin tope')
  assert.strictEqual(escrito.informePdfEnvios.at(-1).messageId, 2000, 'el ultimo es el mas nuevo')
  assert.strictEqual(escrito.informePdfEnvios[0].messageId, 1001, 'se descarta el mas viejo')
})

test('si Telegram no devuelve id, se anota el envio igual', async () => {
  // Saber que se envio y no tener el id es distinto de no tener rastro. Con
  // `messageId: null` al menos queda la hora, el chat y el tamano.
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  const r = await enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async () => undefined, logger: silencioso,
  })
  assert.strictEqual(r.enviado, true)
  assert.strictEqual(r.messageId, null)
  const escrito = Object.assign({}, ...db.escrituras)
  assert.strictEqual(escrito.informePdfEnvios[0].messageId, null)
  assert.ok(escrito.informePdfEnvios[0].at instanceof Date)
})

test('un envio fallido NO deja rastro de envio', async () => {
  // El rastro dice "esto salio". Un envio que lanzo no salio, y anotarlo seria
  // exactamente el error que este cambio vino a arreglar, al reves.
  const db = fakeDb({ machines: [maquina('Ev 1', 2160), maquina('Ev 2', 2160)] })
  await assert.rejects(() => enviarInformeDeTurno({
    db, plant: 'chonchi', shiftDocId: '2026-08-17_Turno 1', config: cfgPrendida,
    enviarDocumento: async () => { throw new Error('Telegram rechazo el documento') },
    logger: silencioso,
  }))
  const escrito = Object.assign({}, ...db.escrituras)
  assert.strictEqual(escrito.informePdfEnvios, undefined)
  assert.strictEqual(escrito.informePdfSentAt, undefined)
  assert.strictEqual(escrito.informePdfIntentos, 1)
})
