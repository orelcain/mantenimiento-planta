/**
 * Escritura de repuestos de ARIA y el endpoint de Aiko (node:test nativo, Firestore falso en memoria).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const { crearEscritorRepuestos, atenderPedidoAiko } = require('../ariaRepuestos')

const CUENTA = 'firebase-adminsdk-fbsvc@mantenimiento-planta-771a3.iam.gserviceaccount.com'
const FieldValue = { serverTimestamp: () => 'TS', arrayUnion: (...x) => ({ union: x }) }

/** Firestore mínimo: docs por colección, subcolecciones `historial`, y registro de cada escritura. */
function dbFalsa(repuestos = {}) {
  const datos = { repuestos: { ...repuestos }, audit_log: {} }
  const escrituras = []
  let n = 0
  const docRef = (col, id) => ({
    id,
    get: async () => ({ id, exists: id in datos[col], data: () => datos[col][id] }),
    create: async (d) => {
      if (id in datos[col]) throw Object.assign(new Error('already exists'), { code: 6 })
      escrituras.push(['create', col, id, d]); datos[col][id] = { ...d }
    },
    update: async (d) => {
      escrituras.push(['update', col, id, d])
      const actual = datos[col][id]
      for (const [k, v] of Object.entries(d)) {
        actual[k] = v && v.union ? [...(actual[k] || []), ...v.union] : v
      }
    },
    collection: (sub) => ({ add: async (d) => { escrituras.push(['add', `${col}/${id}/${sub}`, null, d]) } }),
  })
  const db = {
    collection: (col) => ({
      doc: (id) => docRef(col, id ?? `auto${++n}`),
      add: async (d) => { escrituras.push(['add', col, null, d]) },
      where: (campo, _op, valor) => ({
        limit: () => ({
          get: async () => {
            const docs = Object.entries(datos[col]).filter(([, d]) => d[campo] === valor)
              .map(([id, d]) => ({ id, ref: docRef(col, id), data: () => d }))
            return { empty: !docs.length, docs }
          },
        }),
      }),
    }),
  }
  return { db, datos, escrituras }
}

function escritor(db) {
  let cambios = 0
  const e = crearEscritorRepuestos({
    db, FieldValue, randomUUID: () => 'uuid-1', subirFoto: async (id) => `https://foto/${id}`,
    alCambiar: () => { cambios++ },
  })
  return { e, cambios: () => cambios }
}

// ------------------------------------------------------------- ARIA igual que antes
test('ARIA: crear un repuesto nuevo graba la misma forma que antes del refactor', async () => {
  const { db, datos, escrituras } = dbFalsa()
  const { e, cambios } = escritor(db)
  const id = await e.crearNuevo({ codigoSAP: '3300100999', nombre: 'ACEITE GA90', clase: 'insumo' }, 'Danilo', 42,
    async () => Buffer.from('jpg'))
  assert.strictEqual(id, '3300100999')
  const doc = datos.repuestos['3300100999']
  assert.deepStrictEqual(Object.keys(escrituras[0][3]), ['codigoSAP', 'codigoFabricante', 'textoBreve', 'descripcion',
    'nombreManual', 'valorUnitario', 'cantidadPorMaquina', 'ubicacionEnPlanta', 'observaciones', 'vinculosManual',
    'imagenesManual', 'fotosReales', 'equipos', 'equiposCodigos', 'clase', 'tieneSap', 'plantId', 'createdAt', 'updatedAt'])
  assert.strictEqual(doc.observaciones, 'Creado vía ARIA (Telegram) por Danilo')
  assert.strictEqual(doc.plantId, 'chonchi')
  assert.strictEqual(doc.clase, 'insumo')
  assert.deepStrictEqual(doc.fotosReales.map((f) => [f.url, f.esPrincipal, f.descripcion]),
    [['https://foto/3300100999', true, 'Foto vía ARIA (Telegram)']])
  const audit = escrituras.find((x) => x[1] === 'audit_log')[3]
  assert.deepStrictEqual([audit.action, audit.userId, audit.metadata], ['create', 'telegram:42', { source: 'aria-telegram' }])
  assert.ok(escrituras.some((x) => x[1] === 'repuestos/3300100999/historial' && x[3].campo === 'creacion'))
  assert.strictEqual(cambios(), 1)
})

test('ARIA: editar un campo y adjuntar foto quedan igual que antes', async () => {
  const { db, datos, escrituras } = dbFalsa({ abc: { codigoSAP: '3300100999', codigoFabricante: 'viejo', fotosReales: [] } })
  const { e } = escritor(db)
  await e.editar({ codigoSAP: '3300100999', campo: 'codigoFabricante', valor: '999 0566', nombre: 'X' }, 'Orel', 7, null)
  assert.strictEqual(datos.repuestos.abc.codigoFabricante, '999 0566')
  const hist = escrituras.find((x) => x[1] === 'repuestos/abc/historial')[3]
  assert.deepStrictEqual([hist.campo, hist.valorAnterior, hist.valorNuevo], ['codigoFabricante', 'viejo', '999 0566'])
  assert.deepStrictEqual(escrituras.find((x) => x[1] === 'audit_log')[3].metadata, { source: 'aria-telegram', campo: 'codigoFabricante' })
  await e.adjuntarFoto('3300100999', async () => Buffer.from('jpg'))
  assert.deepStrictEqual(datos.repuestos.abc.fotosReales.map((f) => [f.esPrincipal, f.descripcion]), [[false, 'Foto vía ARIA (Telegram)']])
})

// ---------------------------------------------------------------- endpoint de Aiko
function pedir(db, body, { token = 'tok', email = CUENTA, metodo = 'POST' } = {}) {
  return atenderPedidoAiko({
    metodo, autorizacion: token ? `Bearer ${token}` : undefined, body, permitido: CUENTA, db,
    escritor: escritor(db).e,
    verificar: async (t) => { if (t !== 'tok') throw new Error('malo'); return email },
  })
}
const FOTO = Buffer.from('jpg').toString('base64')

test('Aiko: sin token 401, token malo 401, cuenta ajena 403, GET 405 — y nada se escribe', async () => {
  const { db, escrituras } = dbFalsa()
  const body = { sap: '3300100999', modo: 'crear', campos: { textoBreve: 'X' } }
  assert.strictEqual((await pedir(db, body, { token: null })).status, 401)
  assert.strictEqual((await pedir(db, body, { token: 'otro' })).status, 401)
  assert.strictEqual((await pedir(db, body, { email: 'intruso@gmail.com' })).status, 403)
  assert.strictEqual((await pedir(db, body, { metodo: 'GET' })).status, 405)
  assert.strictEqual(escrituras.length, 0)
})

test('Aiko: lista blanca de campos y SAP válido', async () => {
  const { db, escrituras } = dbFalsa()
  const r1 = await pedir(db, { sap: '3300100999', modo: 'crear', campos: { textoBreve: 'X', clase: 'hack' } })
  assert.deepStrictEqual([r1.status, r1.json.error], [400, 'campo_no_permitido'])
  assert.strictEqual((await pedir(db, { sap: '12', modo: 'crear', campos: { textoBreve: 'X' } })).status, 400)
  assert.strictEqual(escrituras.length, 0)
})

test('Aiko: crear pasa por la lógica de ARIA (historial, audit_log, plantId) y no duplica', async () => {
  const { db, datos, escrituras } = dbFalsa()
  const r = await pedir(db, { sap: '3300100999', modo: 'crear', fotoBase64: FOTO,
    campos: { textoBreve: 'ABRAZADERA 40MM', ubicacionBodega: 'A-4-18', observaciones: 'Desde foto (Aiko).' } })
  assert.deepStrictEqual([r.status, r.json.docId, r.json.fotoUrl], [200, '3300100999', 'https://foto/3300100999'])
  const doc = datos.repuestos['3300100999']
  assert.deepStrictEqual([doc.textoBreve, doc.ubicacionBodega, doc.observaciones, doc.plantId, doc.clase],
    ['ABRAZADERA 40MM', 'A-4-18', 'Desde foto (Aiko).', 'chonchi', 'repuesto'])
  const audit = escrituras.find((x) => x[1] === 'audit_log')[3]
  assert.deepStrictEqual([audit.userId, audit.metadata.source], ['telegram:aiko', 'aiko-telegram'])
  // Ya existe con otro id (pasa en 218 repuestos reales): 409, no se crea otro.
  const otra = dbFalsa({ abc: { codigoSAP: '3300100999' } })
  const r2 = await pedir(otra.db, { sap: '3300100999', modo: 'crear', campos: { textoBreve: 'X' } })
  assert.deepStrictEqual([r2.status, r2.json.error], [409, 'ya_existe'])
  assert.strictEqual(otra.escrituras.length, 0)
})

test('Aiko: completar llena solo vacíos, con historial por campo; un campo ocupado da 409 sin escribir', async () => {
  const { db, datos, escrituras } = dbFalsa({ abc: { codigoSAP: '3300105482', textoBreve: 'MODULOS', marca: '', fotosReales: [{ url: 'u0' }] } })
  const r = await pedir(db, { sap: '3300105482', modo: 'completar', docId: 'abc', fotoBase64: FOTO,
    campos: { marca: 'bticino', codigoFabricante: '5180' } })
  assert.deepStrictEqual([r.status, r.json.docId], [200, 'abc'])
  assert.deepStrictEqual([datos.repuestos.abc.marca, datos.repuestos.abc.codigoFabricante], ['bticino', '5180'])
  assert.deepStrictEqual(datos.repuestos.abc.fotosReales.map((f) => f.esPrincipal ?? null), [null, false])
  assert.deepStrictEqual(escrituras.filter((x) => x[1] === 'repuestos/abc/historial').map((x) => x[3].campo), ['marca', 'codigoFabricante'])
  const antes = escrituras.length
  const r2 = await pedir(db, { sap: '3300105482', modo: 'completar', campos: { textoBreve: 'OTRO' } })
  assert.deepStrictEqual([r2.status, r2.json.error, r2.json.campos], [409, 'campo_ocupado', ['textoBreve']])
  assert.strictEqual(escrituras.length, antes)
})

test('Aiko: completar exige un único documento para ese SAP', async () => {
  const { db, escrituras } = dbFalsa({ a: { codigoSAP: '3300100026' }, b: { codigoSAP: '3300100026' } })
  const r = await pedir(db, { sap: '3300100026', modo: 'completar', campos: { marca: 'X' } })
  assert.deepStrictEqual([r.status, r.json.error], [409, 'no_unico'])
  assert.strictEqual(escrituras.length, 0)
})
