/**
 * Pase de lectura para los nuevos (decisión de Orel, 04-11-2026).
 *
 * Un solo link `/nuevos/<token>` deja ver, SIN usuario ni contraseña y SOLO
 * para leer: el Centro de Aprendizaje, el módulo Repuestos completo (áreas,
 * bodega, códigos de fabricante) y los monitores de Filete y Eviscerado.
 *   1. El token vive en `paseLectura/actual` (ningún cliente lo lee: se pide
 *      por esta función). El administrador lo ve, lo cambia o lo pausa.
 *   2. Con el token correcto se crea una cuenta por teléfono (`lector_…`) con
 *      los claims `{ pase_lectura, pl_v }`. Las reglas le abren SOLO lecturas
 *      y solo mientras el pase siga activo y `pl_v` sea la versión vigente:
 *      «Cambiar link» sube la versión y deja fuera a todos los teléfonos que
 *      entraron con el link anterior.
 *
 * Sin dependencias de firebase-admin ni firebase-functions: todo llega por
 * `deps` para poder probarlo con `node --test` (la CI no instala nada).
 */
const { randomBytes, timingSafeEqual } = require('crypto')

const COL = 'paseLectura'
const DOC = 'actual'

/** Líneas con monitor público (las mismas de `LINEAS_CON_MONITOR` en la PWA). */
const MONITORES = [
  { id: 'chonchi-filete', plantSlug: 'filete', titulo: 'Monitor Filete' },
  { id: 'chonchi-eviscerado', plantSlug: 'chonchi', titulo: 'Monitor Eviscerado' },
]

function nuevoToken() {
  return randomBytes(18).toString('base64url')
}

function mismoToken(a, b) {
  const x = Buffer.from(String(a ?? ''))
  const y = Buffer.from(String(b ?? ''))
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y)
}

/** Lo que ve el administrador (nunca se manda a un teléfono con pase). */
function vistaSupervisor(p) {
  return {
    token: p.token,
    version: p.version,
    activo: Boolean(p.activo),
    generadoEnMs: p.generadoEnMs ?? null,
    generadoPorNombre: p.generadoPorNombre ?? '',
  }
}

// ── Acciones públicas (el link) ─────────────────────────────────────────────

async function entrar(deps, data) {
  const { db, auth, error } = deps
  const snap = await db.collection(COL).doc(DOC).get()
  const pase = snap.exists ? snap.data() : null
  if (!pase || !mismoToken(pase.token, data?.token)) {
    throw error('permission-denied', 'Este link ya no sirve. Pide el nuevo al administrador.')
  }
  if (!pase.activo) {
    throw error('failed-precondition', 'El acceso de lectura está pausado. Avisa al administrador.')
  }
  const uid = `lector_${randomBytes(12).toString('hex')}`
  const claims = { pase_lectura: true, pl_v: Number(pase.version) || 1 }
  await auth.createUser({ uid, displayName: 'Lector (pase de nuevos)' })
  // Claims en la cuenta, no solo en el token: sobreviven a cualquier otro
  // inicio de sesión que alguien le agregue a esta cuenta.
  await auth.setCustomUserClaims(uid, claims)
  return { token: await auth.createCustomToken(uid, claims) }
}

/** Los links de los monitores, para un teléfono con el pase vigente. */
async function monitores(deps, claims) {
  const { db, error, asegurarMonitorLinea } = deps
  if (claims?.pase_lectura !== true) throw error('permission-denied', 'Solo para el pase de lectura')
  const snap = await db.collection(COL).doc(DOC).get()
  const pase = snap.exists ? snap.data() : null
  if (!pase?.activo || Number(pase.version) !== Number(claims.pl_v)) {
    throw error('permission-denied', 'Este acceso ya no está vigente.')
  }
  const lista = []
  for (const m of MONITORES) {
    try {
      const r = await asegurarMonitorLinea(m.plantSlug, m.id)
      if (r?.token) lista.push({ id: m.id, titulo: m.titulo, token: r.token })
    } catch {
      // Una línea sin turnos sincronizados no tumba el portal: solo no aparece.
    }
  }
  return { monitores: lista }
}

// ── Acciones de administrador ──────────────────────────────────────────────────

/** El pase vigente; si nunca se creó, nace aquí. */
async function ver(deps, _data, quien) {
  const { db, ahoraMs } = deps
  const ref = db.collection(COL).doc(DOC)
  const snap = await ref.get()
  if (snap.exists && snap.data()?.token) return vistaSupervisor(snap.data())
  const nuevo = {
    token: nuevoToken(),
    version: 1,
    activo: true,
    generadoEnMs: ahoraMs(),
    generadoPor: quien.uid,
    generadoPorNombre: quien.nombre ?? '',
  }
  await ref.set(nuevo)
  return vistaSupervisor(nuevo)
}

/**
 * Deshabilita las cuentas `lector_…` de links anteriores. Firestore ya las deja
 * fuera por la versión; Storage no puede leer la versión, así que sin esto
 * seguirían viendo fotos. Con la cuenta deshabilitada el token deja de
 * renovarse y caduca en menos de una hora.
 */
async function deshabilitarLectores(auth, versionVigente) {
  let n = 0
  let pagina
  do {
    const r = await auth.listUsers(1000, pagina)
    for (const u of r.users) {
      if (!u.uid.startsWith('lector_') || u.disabled) continue
      if (Number(u.customClaims?.pl_v) === versionVigente) continue
      await auth.updateUser(u.uid, { disabled: true })
      n++
    }
    pagina = r.pageToken
  } while (pagina)
  return n
}

/** Link nuevo: el anterior deja de abrir y los teléfonos que entraron con él quedan fuera. */
async function cambiar(deps, _data, quien) {
  const { db, auth, ahoraMs } = deps
  const ref = db.collection(COL).doc(DOC)
  const snap = await ref.get()
  const version = (Number(snap.exists ? snap.data()?.version : 0) || 0) + 1
  const nuevo = {
    token: nuevoToken(),
    version,
    activo: true,
    generadoEnMs: ahoraMs(),
    generadoPor: quien.uid,
    generadoPorNombre: quien.nombre ?? '',
  }
  await ref.set(nuevo)
  await deshabilitarLectores(auth, version)
  return vistaSupervisor(nuevo)
}

/** Pausar o reanudar sin cambiar el link (los QR impresos siguen sirviendo al reanudar). */
async function activar(deps, data) {
  const { db, error } = deps
  const ref = db.collection(COL).doc(DOC)
  const snap = await ref.get()
  if (!snap.exists) throw error('not-found', 'Todavía no hay link de lectura')
  await ref.update({ activo: data?.activo === true })
  return vistaSupervisor({ ...snap.data(), activo: data?.activo === true })
}

const ACCIONES_SUPERVISOR = { ver, cambiar, activar }

module.exports = {
  COL,
  DOC,
  MONITORES,
  ACCIONES_SUPERVISOR,
  mismoToken,
  entrar,
  monitores,
  ver,
  cambiar,
  activar,
}
