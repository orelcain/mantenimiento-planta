/**
 * Pase de lectura para los nuevos (node:test nativo, base falsa).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const pase = require('../paseLectura')

class ErrorFalso extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

function depsFalsas() {
  const datos = new Map()
  const clon = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  const db = {
    collection: (col) => ({
      doc: (id) => {
        const k = `${col}/${id}`
        return {
          get: async () => ({ exists: datos.has(k), data: () => clon(datos.get(k)) }),
          set: async (v) => { datos.set(k, clon(v)) },
          update: async (v) => { datos.set(k, { ...datos.get(k), ...clon(v) }) },
        }
      },
    }),
  }
  const cuentas = []
  const auth = {
    createUser: async ({ uid }) => { cuentas.push({ uid }) },
    setCustomUserClaims: async (uid, claims) => { cuentas.find((c) => c.uid === uid).claims = claims },
    createCustomToken: async (uid, claims) => `custom:${uid}:${claims.pl_v}`,
    listUsers: async () => ({
      users: cuentas.map((c) => ({ uid: c.uid, disabled: Boolean(c.disabled), customClaims: c.claims })),
      pageToken: undefined,
    }),
    updateUser: async (uid, { disabled }) => { cuentas.find((c) => c.uid === uid).disabled = disabled },
  }
  return {
    datos,
    cuentas,
    deps: {
      db,
      auth,
      ahoraMs: () => 1_000,
      error: (code, msg) => new ErrorFalso(code, msg),
      asegurarMonitorLinea: async (plantSlug) => {
        if (plantSlug === 'chonchi') throw new Error('sin turnos')
        return { token: `mon-${plantSlug}` }
      },
    },
  }
}

const quien = { uid: 'sup1', nombre: 'Supervisor Uno' }

test('ver crea el pase la primera vez y después devuelve el mismo', async () => {
  const { deps } = depsFalsas()
  const a = await pase.ver(deps, {}, quien)
  const b = await pase.ver(deps, {}, quien)
  assert.equal(a.token, b.token)
  assert.equal(a.version, 1)
  assert.equal(a.activo, true)
})

test('entrar con el token correcto crea una cuenta lector con los claims de la versión', async () => {
  const { deps, cuentas } = depsFalsas()
  const { token } = await pase.ver(deps, {}, quien)
  const r = await pase.entrar(deps, { token })
  assert.match(r.token, /^custom:lector_[0-9a-f]{24}:1$/)
  assert.deepEqual(cuentas[0].claims, { pase_lectura: true, pl_v: 1 })
})

test('entrar con token incorrecto, vacío o sin pase creado se rechaza', async () => {
  const { deps, cuentas } = depsFalsas()
  await assert.rejects(pase.entrar(deps, { token: 'x' }), { code: 'permission-denied' })
  const { token } = await pase.ver(deps, {}, quien)
  await assert.rejects(pase.entrar(deps, { token: token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A') }), { code: 'permission-denied' })
  await assert.rejects(pase.entrar(deps, {}), { code: 'permission-denied' })
  assert.equal(cuentas.length, 0)
})

test('cambiar invalida el link anterior y sube la versión', async () => {
  const { deps } = depsFalsas()
  const viejo = await pase.ver(deps, {}, quien)
  const nuevo = await pase.cambiar(deps, {}, quien)
  assert.notEqual(viejo.token, nuevo.token)
  assert.equal(nuevo.version, 2)
  await assert.rejects(pase.entrar(deps, { token: viejo.token }), { code: 'permission-denied' })
  const r = await pase.entrar(deps, { token: nuevo.token })
  assert.match(r.token, /:2$/)
})

test('pausado no deja entrar; al reanudar el mismo link vuelve a servir', async () => {
  const { deps } = depsFalsas()
  const { token } = await pase.ver(deps, {}, quien)
  await pase.activar(deps, { activo: false })
  await assert.rejects(pase.entrar(deps, { token }), { code: 'failed-precondition' })
  await pase.activar(deps, { activo: true })
  await pase.entrar(deps, { token })
})

test('monitores: solo con el claim y la versión vigente; una línea sin turnos no tumba el resto', async () => {
  const { deps } = depsFalsas()
  await pase.ver(deps, {}, quien)
  await assert.rejects(pase.monitores(deps, null), { code: 'permission-denied' })
  await assert.rejects(pase.monitores(deps, { pase_lectura: true, pl_v: 9 }), { code: 'permission-denied' })
  const r = await pase.monitores(deps, { pase_lectura: true, pl_v: 1 })
  assert.deepEqual(r.monitores, [{ id: 'chonchi-filete', titulo: 'Monitor Filete', token: 'mon-filete' }])
  await pase.cambiar(deps, {}, quien)
  await assert.rejects(pase.monitores(deps, { pase_lectura: true, pl_v: 1 }), { code: 'permission-denied' })
})

test('la vista del supervisor no expone el uid de quien lo generó', async () => {
  const { deps } = depsFalsas()
  const v = await pase.ver(deps, {}, quien)
  assert.equal('generadoPor' in v, false)
  assert.equal(v.generadoPorNombre, 'Supervisor Uno')
})

test('cambiar deshabilita las cuentas de links anteriores y no toca las de la versión nueva', async () => {
  const { deps, cuentas } = depsFalsas()
  const v1 = await pase.ver(deps, {}, quien)
  await pase.entrar(deps, { token: v1.token })
  cuentas.push({ uid: 'pase_otro', claims: { pase_bitacora: true } })
  const v2 = await pase.cambiar(deps, {}, quien)
  await pase.entrar(deps, { token: v2.token })
  assert.equal(cuentas[0].disabled, true)
  assert.equal(Boolean(cuentas[1].disabled), false, 'una cuenta que no es lector no se toca')
  assert.equal(Boolean(cuentas[2].disabled), false, 'la cuenta del link vigente sigue')
})
