/**
 * Pase de la Bitácora (decisiones de Orel, 16-09-2026).
 *
 * Un QR deja entrar a la bitácora SIN la contraseña de la cuenta compartida:
 *   1. El QR lleva la planta y un token (`bitacoraPases/{plantId}`). Sirve para
 *      teléfonos NUEVOS durante 30 días; «Renovar» alarga el mismo token.
 *   2. El técnico elige su nombre (solo los que tienen PIN) y escribe su PIN
 *      personal de 4 dígitos. Se guarda solo la huella (scrypt + sal) en
 *      `bitacoraPines`, que ningún cliente puede leer.
 *   3. 5 fallos seguidos bloquean ese nombre 15 minutos; 15 fallos sin un
 *      acierto lo bloquean hasta que un supervisor reinicie el PIN (con 10.000
 *      PIN posibles, el bloqueo corto solo no alcanza).
 *   4. Con PIN correcto se crea una cuenta por TELÉFONO (`pase_…`) con los
 *      claims `{ pase_bitacora, plantId, nombre }` y un documento en
 *      `bitacoraDispositivos`. Las reglas dejan a esa cuenta SOLO en la
 *      bitácora y solo mientras el dispositivo siga activo.
 *
 * Sin dependencias de firebase-admin ni firebase-functions: todo llega por
 * `deps` para poder probarlo con `node --test` (la CI no instala nada).
 */
const { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } = require('crypto')

const COL = {
  pases: 'bitacoraPases',
  pines: 'bitacoraPines',
  dispositivos: 'bitacoraDispositivos',
}
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000
const FALLOS_POR_BLOQUEO = 5
const BLOQUEO_MS = 15 * 60 * 1000
const FALLOS_HASTA_BLOQUEO_TOTAL = 15
const PLANTAS = ['chonchi']
/** PIN que cualquiera probaría primero: no se entregan. */
const PIN_EVIDENTES = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '2580', '0852'])

function normalizarNombre(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function limpiarNombre(nombre) {
  return String(nombre ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
}

/** Id del documento del PIN: la planta y una huella del nombre (sin `/` ni tildes). */
function idPin(plantId, nombre) {
  const huella = createHash('sha256').update(normalizarNombre(nombre)).digest('hex').slice(0, 24)
  return `${plantId}__${huella}`
}

function nuevoTokenQr() {
  return randomBytes(24).toString('base64url')
}

function nuevoPin(azar = () => randomInt(0, 10000)) {
  for (let i = 0; i < 50; i++) {
    const pin = String(azar()).padStart(4, '0')
    if (!PIN_EVIDENTES.has(pin)) return pin
  }
  throw new Error('No se pudo generar un PIN')
}

function huellaPin(pin, sal) {
  return scryptSync(String(pin), sal, 32).toString('hex')
}

function pinCorrecto(pin, sal, huella) {
  if (!/^\d{4}$/.test(String(pin ?? ''))) return false
  const a = Buffer.from(huellaPin(pin, sal), 'hex')
  const b = Buffer.from(String(huella ?? ''), 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function mismoToken(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

/** 'ok' | 'invalido' | 'vencido'. */
function estadoToken(pase, token, ahoraMs) {
  if (!pase || !mismoToken(pase.token, token)) return 'invalido'
  if (!(Number(pase.venceEnMs) > ahoraMs)) return 'vencido'
  return 'ok'
}

/**
 * Un intento de PIN sobre el estado de bloqueo. Durante un bloqueo no se mira
 * el PIN: si no, el bloqueo no frenaría a quien sigue probando.
 * estado: { fallos, bloqueadoHastaMs, bloqueoTotal }
 */
function evaluarIntento(estado, correcto, ahoraMs) {
  const fallos = Number(estado?.fallos) || 0
  if (estado?.bloqueoTotal) return { resultado: 'bloqueo-total', estado: { ...estado } }
  if (Number(estado?.bloqueadoHastaMs) > ahoraMs) {
    return { resultado: 'bloqueado', estado: { ...estado }, hastaMs: Number(estado.bloqueadoHastaMs) }
  }
  if (correcto) return { resultado: 'ok', estado: { fallos: 0, bloqueadoHastaMs: null, bloqueoTotal: false } }
  const n = fallos + 1
  if (n >= FALLOS_HASTA_BLOQUEO_TOTAL) {
    return { resultado: 'bloqueo-total', estado: { fallos: n, bloqueadoHastaMs: null, bloqueoTotal: true } }
  }
  if (n % FALLOS_POR_BLOQUEO === 0) {
    const hastaMs = ahoraMs + BLOQUEO_MS
    return { resultado: 'bloqueado', estado: { fallos: n, bloqueadoHastaMs: hastaMs, bloqueoTotal: false }, hastaMs }
  }
  return {
    resultado: 'incorrecto',
    estado: { fallos: n, bloqueadoHastaMs: null, bloqueoTotal: false },
    quedan: FALLOS_POR_BLOQUEO - (n % FALLOS_POR_BLOQUEO),
  }
}

function limpiarDispositivo(d) {
  return String(d ?? '').replace(/[^\p{L}\p{N} ._()-]/gu, '').trim().slice(0, 40) || 'Teléfono'
}

function plantaValida(plantId, error) {
  const p = String(plantId ?? '')
  if (!PLANTAS.includes(p)) throw error('invalid-argument', 'Planta desconocida')
  return p
}

function nombresConPin(pase) {
  return [...(pase?.conPin ?? [])].sort((a, b) => a.localeCompare(b, 'es'))
}

// ── Acciones públicas (el QR) ───────────────────────────────────────────────

/** Qué técnicos pueden entrar con este QR. */
async function info(deps, data) {
  const { db, ahoraMs, error } = deps
  const plantId = plantaValida(data?.plantId, error)
  const snap = await db.collection(COL.pases).doc(plantId).get()
  const pase = snap.exists ? snap.data() : null
  const estado = estadoToken(pase, data?.token, ahoraMs())
  if (estado === 'invalido') throw error('permission-denied', 'Este QR ya no sirve. Pide el nuevo a un supervisor.')
  if (estado === 'vencido') throw error('failed-precondition', 'Este QR venció. Pide a un supervisor que lo renueve.')
  return { plantId, tecnicos: nombresConPin(pase), venceEnMs: pase.venceEnMs }
}

/** Valida el PIN y entrega la sesión del teléfono. */
async function entrar(deps, data) {
  const { db, auth, ahoraMs, error } = deps
  const plantId = plantaValida(data?.plantId, error)
  const nombreElegido = limpiarNombre(data?.nombre)
  if (!nombreElegido) throw error('invalid-argument', 'Elige tu nombre')
  const paseRef = db.collection(COL.pases).doc(plantId)
  const pinRef = db.collection(COL.pines).doc(idPin(plantId, nombreElegido))
  const clave = pinRef.id

  const r = await db.runTransaction(async (tx) => {
    const ahora = ahoraMs()
    const [paseSnap, pinSnap] = await Promise.all([tx.get(paseRef), tx.get(pinRef)])
    const pase = paseSnap.exists ? paseSnap.data() : null
    const estado = estadoToken(pase, data?.token, ahora)
    if (estado !== 'ok') return { resultado: `qr-${estado}` }
    if (!pinSnap.exists) return { resultado: 'sin-pin' }
    const pinDoc = pinSnap.data()
    const intento = evaluarIntento(pinDoc, pinCorrecto(data?.pin, pinDoc.sal, pinDoc.huella), ahora)
    const campos = ['fallos', 'bloqueadoHastaMs', 'bloqueoTotal']
    if (campos.some((c) => (pinDoc[c] ?? null) !== (intento.estado[c] ?? null))) {
      tx.update(pinRef, Object.fromEntries(campos.map((c) => [c, intento.estado[c] ?? null])))
    }
    // El supervisor ve los bloqueos en el pase (el doc del PIN no se lee desde la app).
    const bloqueo = intento.estado.bloqueoTotal || intento.estado.bloqueadoHastaMs
      ? { nombre: pinDoc.nombre, hastaMs: intento.estado.bloqueadoHastaMs ?? null, total: Boolean(intento.estado.bloqueoTotal) }
      : null
    const previo = pase.bloqueados?.[clave] ?? null
    if (JSON.stringify(previo) !== JSON.stringify(bloqueo)) {
      tx.update(paseRef, { [`bloqueados.${clave}`]: bloqueo })
    }
    return { ...intento, nombre: pinDoc.nombre }
  })

  switch (r.resultado) {
    case 'qr-invalido':
      throw error('permission-denied', 'Este QR ya no sirve. Pide el nuevo a un supervisor.')
    case 'qr-vencido':
      throw error('failed-precondition', 'Este QR venció. Pide a un supervisor que lo renueve.')
    case 'sin-pin':
      throw error('failed-precondition', 'Ese nombre no tiene PIN. Pídelo a un supervisor.')
    case 'bloqueo-total':
      throw error('resource-exhausted', 'Demasiados intentos. Pide a un supervisor que reinicie tu PIN.')
    case 'bloqueado': {
      const min = Math.max(1, Math.ceil((r.hastaMs - ahoraMs()) / 60000))
      throw error('resource-exhausted', `Demasiados intentos. Prueba de nuevo en ${min} min.`)
    }
    case 'incorrecto':
      throw error('permission-denied', `PIN incorrecto. ${r.quedan === 1 ? 'Queda 1 intento' : `Quedan ${r.quedan} intentos`} antes del bloqueo.`)
    default:
      break
  }

  const uid = `pase_${randomBytes(12).toString('hex')}`
  const claims = { pase_bitacora: true, plantId, nombre: r.nombre }
  const dispositivo = limpiarDispositivo(data?.dispositivo)
  // El documento del dispositivo va PRIMERO: las reglas lo exigen, y un
  // teléfono sin él no puede escribir aunque la sesión exista.
  await db.collection(COL.dispositivos).doc(uid).set({
    plantId,
    nombre: r.nombre,
    claveNombre: clave,
    dispositivo,
    activo: true,
    creadoEnMs: ahoraMs(),
  })
  try {
    await auth.createUser({ uid, displayName: `${r.nombre} (${dispositivo})` })
    // Claims en la cuenta, no solo en el token: sobreviven a cualquier otro
    // inicio de sesión que alguien le agregue a esta cuenta.
    await auth.setCustomUserClaims(uid, claims)
    const token = await auth.createCustomToken(uid, claims)
    return { token, nombre: r.nombre, plantId }
  } catch (e) {
    // Sin sesión no hay teléfono: que no quede uno fantasma en la lista del supervisor.
    await db.collection(COL.dispositivos).doc(uid).delete().catch(() => undefined)
    throw e
  }
}

// ── Acciones de supervisor ──────────────────────────────────────────────────

async function generar(deps, data, quien) {
  const { db, ahoraMs, error } = deps
  const plantId = plantaValida(data?.plantId, error)
  const ahora = ahoraMs()
  await db.collection(COL.pases).doc(plantId).set(
    {
      plantId,
      token: nuevoTokenQr(),
      venceEnMs: ahora + VIGENCIA_MS,
      generadoEnMs: ahora,
      generadoPor: quien.uid,
      generadoPorNombre: quien.nombre ?? '',
      renovadoEnMs: null,
    },
    { merge: true },
  )
  return { ok: true }
}

async function renovar(deps, data, quien) {
  const { db, ahoraMs, error } = deps
  const plantId = plantaValida(data?.plantId, error)
  const ref = db.collection(COL.pases).doc(plantId)
  const snap = await ref.get()
  if (!snap.exists || !snap.data()?.token) throw error('failed-precondition', 'Primero genera el QR')
  const ahora = ahoraMs()
  await ref.update({ venceEnMs: ahora + VIGENCIA_MS, renovadoEnMs: ahora, renovadoPor: quien.uid })
  return { ok: true, venceEnMs: ahora + VIGENCIA_MS }
}

/** Saca a todos los teléfonos de ese técnico. */
async function quitarDispositivosDe(deps, plantId, clave, quien) {
  const { db } = deps
  const snap = await db
    .collection(COL.dispositivos)
    .where('plantId', '==', plantId)
    .where('claveNombre', '==', clave)
    .where('activo', '==', true)
    .get()
  for (const d of snap.docs) await desactivar(deps, d.id, quien)
  return snap.size
}

async function desactivar(deps, uid, quien) {
  const { db, auth, ahoraMs } = deps
  await db.collection(COL.dispositivos).doc(uid).update({ activo: false, quitadoEnMs: ahoraMs(), quitadoPor: quien.uid })
  try {
    await auth.updateUser(uid, { disabled: true })
    await auth.revokeRefreshTokens(uid)
  } catch (e) {
    // Sin la cuenta de Auth (nunca se creó) basta con el documento: las reglas ya lo cortan.
    if (e?.code !== 'auth/user-not-found') throw e
  }
}

/** Asigna o reinicia el PIN. Devuelve el PIN UNA vez (no se guarda en claro). */
async function asignarPin(deps, data, quien) {
  const { db, ahoraMs, error } = deps
  const plantId = plantaValida(data?.plantId, error)
  const nombre = limpiarNombre(data?.nombre)
  if (!nombre) throw error('invalid-argument', 'Falta el nombre del técnico')
  const pinRef = db.collection(COL.pines).doc(idPin(plantId, nombre))
  const paseRef = db.collection(COL.pases).doc(plantId)
  const reinicio = (await pinRef.get()).exists
  // Reiniciar = el PIN anterior deja de servir y sus teléfonos quedan fuera.
  const quitados = reinicio ? await quitarDispositivosDe(deps, plantId, pinRef.id, quien) : 0
  const pin = nuevoPin()
  const sal = randomBytes(16).toString('hex')
  const ahora = ahoraMs()
  await pinRef.set({
    plantId,
    nombre,
    sal,
    huella: huellaPin(pin, sal),
    fallos: 0,
    bloqueadoHastaMs: null,
    bloqueoTotal: false,
    asignadoEnMs: ahora,
    asignadoPor: quien.uid,
  })
  const pase = (await paseRef.get()).data() ?? {}
  const conPin = [...new Set([...(pase.conPin ?? []).filter((n) => normalizarNombre(n) !== normalizarNombre(nombre)), nombre])]
  await paseRef.set({ plantId, conPin, bloqueados: { [pinRef.id]: null } }, { merge: true })
  return { pin, nombre, reinicio, telefonosQuitados: quitados }
}

async function quitarPin(deps, data, quien) {
  const { db, error } = deps
  const plantId = plantaValida(data?.plantId, error)
  const nombre = limpiarNombre(data?.nombre)
  if (!nombre) throw error('invalid-argument', 'Falta el nombre del técnico')
  const pinRef = db.collection(COL.pines).doc(idPin(plantId, nombre))
  const quitados = await quitarDispositivosDe(deps, plantId, pinRef.id, quien)
  await pinRef.delete()
  const paseRef = db.collection(COL.pases).doc(plantId)
  const pase = (await paseRef.get()).data() ?? {}
  await paseRef.set(
    {
      plantId,
      conPin: (pase.conPin ?? []).filter((n) => normalizarNombre(n) !== normalizarNombre(nombre)),
      bloqueados: { [pinRef.id]: null },
    },
    { merge: true },
  )
  return { ok: true, telefonosQuitados: quitados }
}

async function quitarDispositivo(deps, data, quien) {
  const { db, error } = deps
  const uid = String(data?.uid ?? '')
  if (!/^pase_[0-9a-f]{24}$/.test(uid)) throw error('invalid-argument', 'Dispositivo inválido')
  const snap = await db.collection(COL.dispositivos).doc(uid).get()
  if (!snap.exists) throw error('not-found', 'Ese teléfono ya no está')
  await desactivar(deps, uid, quien)
  return { ok: true }
}

/** El propio teléfono cierra su sesión: queda fuera de la lista del supervisor. */
async function salir(deps, uid) {
  const { db } = deps
  if (!/^pase_[0-9a-f]{24}$/.test(String(uid ?? ''))) return { ok: false }
  const snap = await db.collection(COL.dispositivos).doc(uid).get()
  if (snap.exists && snap.data()?.activo) await desactivar(deps, uid, { uid })
  return { ok: true }
}

const ACCIONES_SUPERVISOR = { generar, renovar, asignarPin, quitarPin, quitarDispositivo }

module.exports = {
  COL,
  VIGENCIA_MS,
  FALLOS_POR_BLOQUEO,
  BLOQUEO_MS,
  FALLOS_HASTA_BLOQUEO_TOTAL,
  ACCIONES_SUPERVISOR,
  normalizarNombre,
  idPin,
  nuevoPin,
  huellaPin,
  pinCorrecto,
  estadoToken,
  evaluarIntento,
  limpiarDispositivo,
  info,
  entrar,
  generar,
  renovar,
  asignarPin,
  quitarPin,
  quitarDispositivo,
  salir,
}
