/**
 * Pase de la Bitácora: QR + PIN personal (node:test nativo, base falsa).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const pase = require('../paseBitacora')

class ErrorFalso extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

/** Firestore mínimo: docs en un Map, `where` de igualdad, transacciones y `update` con rutas `a.b`. */
function baseFalsa() {
  const datos = new Map()
  const clon = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
  const aplicarUpdate = (actual, campos) => {
    const nuevo = clon(actual) ?? {}
    for (const [k, v] of Object.entries(campos)) {
      const partes = k.split('.')
      let o = nuevo
      for (const p of partes.slice(0, -1)) o = o[p] ??= {}
      o[partes[partes.length - 1]] = clon(v)
    }
    return nuevo
  }
  const fusionar = (a, b) => {
    const r = clon(a) ?? {}
    for (const [k, v] of Object.entries(b)) {
      r[k] = v && typeof v === 'object' && !Array.isArray(v) && r[k] && typeof r[k] === 'object' ? fusionar(r[k], v) : clon(v)
    }
    return r
  }
  const docRef = (col, id) => {
    const ruta = `${col}/${id}`
    const snap = () => ({ id, exists: datos.has(ruta), data: () => clon(datos.get(ruta)) })
    return {
      id,
      ruta,
      get: async () => snap(),
      _snap: snap,
      set: async (v, opt) => void datos.set(ruta, opt?.merge ? fusionar(datos.get(ruta), v) : clon(v)),
      update: async (v) => {
        if (!datos.has(ruta)) throw new Error(`no existe ${ruta}`)
        datos.set(ruta, aplicarUpdate(datos.get(ruta), v))
      },
      delete: async () => void datos.delete(ruta),
    }
  }
  const coleccion = (col, filtros = []) => ({
    doc: (id) => docRef(col, id),
    where: (campo, op, valor) => coleccion(col, [...filtros, [campo, valor]]),
    get: async () => {
      const docs = [...datos.entries()]
        .filter(([r]) => r.startsWith(`${col}/`))
        .filter(([, v]) => filtros.every(([c, x]) => v[c] === x))
        .map(([r, v]) => ({ id: r.slice(col.length + 1), data: () => clon(v) }))
      return { docs, size: docs.length }
    },
  })
  return {
    datos,
    collection: coleccion,
    runTransaction: async (fn) => {
      const escrituras = []
      const tx = {
        get: async (ref) => ref._snap(),
        update: (ref, v) => escrituras.push(() => ref.update(v)),
      }
      const r = await fn(tx)
      for (const w of escrituras) await w()
      return r
    },
  }
}

function authFalso() {
  const usuarios = new Map()
  return {
    usuarios,
    createUser: async ({ uid, displayName }) => void usuarios.set(uid, { displayName, disabled: false, claims: null, revocado: false }),
    setCustomUserClaims: async (uid, claims) => void (usuarios.get(uid).claims = claims),
    createCustomToken: async (uid, claims) => `token-de-${uid}-${claims.nombre}`,
    updateUser: async (uid, v) => {
      if (!usuarios.has(uid)) throw Object.assign(new Error('x'), { code: 'auth/user-not-found' })
      Object.assign(usuarios.get(uid), v)
    },
    revokeRefreshTokens: async (uid) => void (usuarios.get(uid).revocado = true),
  }
}

function montar(inicioMs = Date.UTC(2026, 8, 16, 20, 0)) {
  let reloj = inicioMs
  const deps = {
    db: baseFalsa(),
    auth: authFalso(),
    ahoraMs: () => reloj,
    error: (code, msg) => new ErrorFalso(code, msg),
  }
  return { deps, avanzar: (ms) => (reloj += ms) }
}

const supervisor = { uid: 'orel', nombre: 'Danilo Cortes' }

async function paseListo(deps) {
  await pase.generar(deps, { plantId: 'chonchi' }, supervisor)
  const token = deps.db.datos.get('bitacoraPases/chonchi').token
  const { pin } = await pase.asignarPin(deps, { plantId: 'chonchi', nombre: 'Leandro Igor' }, supervisor)
  return { token, pin }
}

const pinMalo = (pin) => (pin === '9876' ? '9875' : '9876')

test('el QR y el PIN correcto entregan una sesión limitada a la bitácora', async () => {
  const { deps } = montar()
  const { token, pin } = await paseListo(deps)
  assert.match(pin, /^\d{4}$/)
  // El PIN no se guarda en claro.
  const [docPin] = [...deps.db.datos.entries()].filter(([r]) => r.startsWith('bitacoraPines/'))
  assert.ok(!JSON.stringify(docPin[1]).includes(`"${pin}"`))

  const info = await pase.info(deps, { plantId: 'chonchi', token })
  assert.deepStrictEqual(info.tecnicos, ['Leandro Igor'])

  const r = await pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'leandro  igor', pin, dispositivo: 'Android <script>' })
  assert.strictEqual(r.nombre, 'Leandro Igor')
  const [uid, u] = [...deps.auth.usuarios.entries()][0]
  assert.match(uid, /^pase_[0-9a-f]{24}$/)
  assert.deepStrictEqual(u.claims, { pase_bitacora: true, plantId: 'chonchi', nombre: 'Leandro Igor' })
  const disp = deps.db.datos.get(`bitacoraDispositivos/${uid}`)
  assert.strictEqual(disp.activo, true)
  assert.strictEqual(disp.dispositivo, 'Android script')
})

test('un QR equivocado, de otra planta o vencido no sirve', async () => {
  const { deps, avanzar } = montar()
  const { token, pin } = await paseListo(deps)
  await assert.rejects(pase.info(deps, { plantId: 'chonchi', token: 'otro' }), { code: 'permission-denied' })
  await assert.rejects(pase.info(deps, { plantId: 'yal', token }), { code: 'invalid-argument' })
  avanzar(pase.VIGENCIA_MS + 1)
  await assert.rejects(pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin }), { code: 'failed-precondition' })
  // Renovar alarga el MISMO QR: no hay que reimprimirlo.
  await pase.renovar(deps, { plantId: 'chonchi' }, supervisor)
  assert.strictEqual(deps.db.datos.get('bitacoraPases/chonchi').token, token)
  await pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin })
  // Generar otro cambia el token: el anterior deja de servir.
  await pase.generar(deps, { plantId: 'chonchi' }, supervisor)
  await assert.rejects(pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin }), { code: 'permission-denied' })
})

test('un nombre sin PIN no entra', async () => {
  const { deps } = montar()
  const { token } = await paseListo(deps)
  await assert.rejects(pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Matias Serpa', pin: '1234' }), {
    code: 'failed-precondition',
    message: /no tiene PIN/,
  })
})

test('5 fallos bloquean 15 min y durante el bloqueo ni el PIN correcto entra', async () => {
  const { deps, avanzar } = montar()
  const { token, pin } = await paseListo(deps)
  const intento = (p) => pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin: p })
  for (let i = 1; i <= 4; i++) {
    await assert.rejects(intento(pinMalo(pin)), { code: 'permission-denied', message: new RegExp(i === 4 ? 'Queda 1 intento' : `Quedan ${5 - i} intentos`) })
  }
  await assert.rejects(intento(pinMalo(pin)), { code: 'resource-exhausted', message: /15 min/ })
  await assert.rejects(intento(pin), { code: 'resource-exhausted' })
  // El supervisor ve el bloqueo en el pase.
  const bloqueos = Object.values(deps.db.datos.get('bitacoraPases/chonchi').bloqueados).filter(Boolean)
  assert.strictEqual(bloqueos[0].nombre, 'Leandro Igor')
  avanzar(pase.BLOQUEO_MS + 1)
  await intento(pin)
  assert.deepStrictEqual(Object.values(deps.db.datos.get('bitacoraPases/chonchi').bloqueados).filter(Boolean), [])
})

test('15 fallos sin acierto bloquean hasta que un supervisor reinicia el PIN', async () => {
  const { deps, avanzar } = montar()
  const { token, pin } = await paseListo(deps)
  const intento = (p) => pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin: p })
  for (let i = 0; i < 15; i++) {
    await intento(pinMalo(pin)).catch(() => undefined)
    avanzar(pase.BLOQUEO_MS + 1)
  }
  await assert.rejects(intento(pin), { code: 'resource-exhausted', message: /supervisor/ })
  const { pin: nuevo } = await pase.asignarPin(deps, { plantId: 'chonchi', nombre: 'Leandro Igor' }, supervisor)
  await intento(nuevo)
})

test('reiniciar o quitar el PIN saca a los teléfonos de ese técnico, y no a los demás', async () => {
  const { deps } = montar()
  const { token, pin } = await paseListo(deps)
  const { pin: pinM } = await pase.asignarPin(deps, { plantId: 'chonchi', nombre: 'Matias Serpa' }, supervisor)
  await pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin })
  await pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin })
  await pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Matias Serpa', pin: pinM })

  const r = await pase.asignarPin(deps, { plantId: 'chonchi', nombre: 'Leandro Igor' }, supervisor)
  assert.strictEqual(r.reinicio, true)
  assert.strictEqual(r.telefonosQuitados, 2)
  assert.notStrictEqual(r.pin, undefined)
  // El PIN anterior ya no sirve.
  await assert.rejects(pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin: r.pin === pin ? pinMalo(pin) : pin }))

  const disp = [...deps.db.datos.entries()].filter(([k]) => k.startsWith('bitacoraDispositivos/')).map(([k, v]) => [k.split('/')[1], v])
  const leandro = disp.filter(([, v]) => v.nombre === 'Leandro Igor')
  assert.ok(leandro.every(([, v]) => v.activo === false))
  assert.ok(leandro.every(([uid]) => deps.auth.usuarios.get(uid).disabled && deps.auth.usuarios.get(uid).revocado))
  assert.ok(disp.filter(([, v]) => v.nombre === 'Matias Serpa').every(([, v]) => v.activo))

  const q = await pase.quitarPin(deps, { plantId: 'chonchi', nombre: 'Matias Serpa' }, supervisor)
  assert.strictEqual(q.telefonosQuitados, 1)
  assert.deepStrictEqual(deps.db.datos.get('bitacoraPases/chonchi').conPin, ['Leandro Igor'])
})

test('quitar un teléfono puntual', async () => {
  const { deps } = montar()
  const { token, pin } = await paseListo(deps)
  await pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin })
  const [uid] = [...deps.auth.usuarios.keys()]
  await pase.quitarDispositivo(deps, { uid }, supervisor)
  assert.strictEqual(deps.db.datos.get(`bitacoraDispositivos/${uid}`).activo, false)
  assert.strictEqual(deps.auth.usuarios.get(uid).disabled, true)
  await assert.rejects(pase.quitarDispositivo(deps, { uid: 'users/admin' }, supervisor), { code: 'invalid-argument' })
})

test('el teléfono que sale queda fuera de la lista', async () => {
  const { deps } = montar()
  const { token, pin } = await paseListo(deps)
  await pase.entrar(deps, { plantId: 'chonchi', token, nombre: 'Leandro Igor', pin })
  const [uid] = [...deps.auth.usuarios.keys()]
  await pase.salir(deps, uid)
  assert.strictEqual(deps.db.datos.get(`bitacoraDispositivos/${uid}`).activo, false)
  assert.deepStrictEqual(await pase.salir(deps, 'orel'), { ok: false })
})

test('lógica pura: bloqueo, PIN evidentes y huella', () => {
  const t = 1_000_000
  assert.strictEqual(pase.evaluarIntento({ fallos: 3 }, true, t).estado.fallos, 0)
  assert.strictEqual(pase.evaluarIntento({ fallos: 9 }, false, t).resultado, 'bloqueado')
  assert.strictEqual(pase.evaluarIntento({ fallos: 14 }, false, t).resultado, 'bloqueo-total')
  assert.strictEqual(pase.evaluarIntento({ fallos: 0, bloqueadoHastaMs: t + 1 }, true, t).resultado, 'bloqueado')
  const secuencia = ['1234', '0000', '0042']
  assert.strictEqual(pase.nuevoPin(() => Number(secuencia.shift())), '0042')
  assert.strictEqual(pase.pinCorrecto('12a4', 'sal', pase.huellaPin('12a4', 'sal')), false)
  assert.strictEqual(pase.pinCorrecto('0042', 'sal', pase.huellaPin('0042', 'sal')), true)
  assert.strictEqual(pase.idPin('chonchi', 'Leandro  Ígor'), pase.idPin('chonchi', 'leandro igor'))
  assert.strictEqual(pase.limpiarDispositivo(''), 'Teléfono')
})
