// Uso (desde la raíz del repo): npx firebase-tools@14 emulators:exec --only firestore --project demo-rules "node scripts/reglas/moduloVistas.test.mjs"
// Prueba de las reglas de moduloVistas (contador de vistas por módulo) contra el emulador de Firestore, por REST.
// Auth: JWT sin firma (el emulador lo acepta). `Bearer owner` salta las reglas (para sembrar users/ y docs previos).
// Una «vista» = usuario-día por módulo: la regla exige agregar a `u` el hash del que escribe, que no estaba antes.
// Las fechas son RELATIVAS a hoy porque la regla compara el id del doc con request.time (reloj real del emulador).
import { createHash } from 'node:crypto'

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const BASE = `http://${HOST}/v1/projects/demo-rules/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (uid) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ user_id: uid, sub: uid, aud: 'demo-rules', firebase: { sign_in_provider: 'password' } })}.`

// Mismo cálculo que el cliente: 12 primeros hex de sha256(uid).
const hash = (uid) => createHash('sha256').update(uid).digest('hex').slice(0, 12)

// Día UTC relativo a hoy (k = 0 hoy, -1 ayer, 1 mañana). Es la misma base que usa la regla (timestamp.date = 00:00 UTC).
const dia = (k) => new Date(Date.now() + k * 86_400_000).toISOString().slice(0, 10)

const val = (v) =>
  typeof v === 'string'
    ? { stringValue: v }
    : typeof v === 'boolean'
      ? { booleanValue: v }
      : typeof v === 'number'
        ? Number.isInteger(v)
          ? { integerValue: String(v) }
          : { doubleValue: v }
        : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } }
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) })

async function put(path, data, token, mask = []) {
  // En moduloVistas/ el cliente declara `ultimo` (el módulo que toca); aquí se agrega solo.
  if (path.startsWith('moduloVistas/') && token !== 'owner' && !('ultimo' in data)) {
    data = { ultimo: Object.keys(data)[0], ...data }
    mask = ['ultimo', ...mask]
  }
  const qs = mask.map((m) => `updateMask.fieldPaths=${encodeURIComponent('`' + m + '`')}`).join('&')
  const r = await fetch(`${BASE}/${path}${qs ? `?${qs}` : ''}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields(data)),
  })
  return r.status
}
async function get(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  return (await fetch(`${BASE}/${path}`, { headers })).status
}
async function del(path, token) {
  return (await fetch(`${BASE}/${path}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })).status
}

await put('users/u1', { activo: true, rol: 'tecnico' }, 'owner')
await put('users/u2', { activo: false, rol: 'tecnico' }, 'owner')
await put('users/u3', { activo: true, rol: 'supervisor' }, 'owner')

const H1 = hash('u1')
const H3 = hash('u3')
const T1 = jwt('u1')

// Módulo tal como lo escribe u1 (vista nueva, claro, celular, su hash).
const mod = (extra = {}) => ({ vistas: 1, claro: 1, cel: 1, u: { [H1]: true }, ...extra })
// Estado previo: u3 ya contó `inicio`; `bitacora` lo contó otra persona (hash ajeno).
const PREV = {
  ultimo: 'inicio',
  inicio: { vistas: 1, claro: 1, cel: 1, u: { [H3]: true } },
  bitacora: { vistas: 4, oscuro: 4, pc: 4, u: { [H3]: true, aaaaaaaaaaaa: true, bbbbbbbbbbbb: true, cccccccccccc: true } },
}

let fallos = 0
const check = (desc, st, esperado) => {
  const ok = esperado === 200 ? st === 200 : st === 403
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${desc}: ${st} (esperado ${esperado})`)
}
// Deja el doc `id` en el estado previo (o inexistente) antes de cada caso: los casos no se contaminan entre sí.
async function preparar(id, previo) {
  if (previo) await put(`moduloVistas/${id}`, previo, 'owner')
  else await del(`moduloVistas/${id}`, 'owner')
}
async function crear(desc, id, data, mask, token, esperado) {
  await preparar(id, null)
  check(`create: ${desc}`, await put(`moduloVistas/${id}`, data, token, mask), esperado)
}
async function actualizar(desc, id, data, mask, token, esperado, previo = PREV) {
  await preparar(id, previo)
  check(`update: ${desc}`, await put(`moduloVistas/${id}`, data, token, mask), esperado)
}

const HOY = dia(0)

// ---- create (el doc del día aún no existe) ----
await crear('un módulo, +1 vista, claro, cel, con hash propio', HOY, { aprendizaje: mod() }, ['aprendizaje'], T1, 200)
await crear('módulo con guion (aprendizaje-hmi-knuro)', HOY, { 'aprendizaje-hmi-knuro': mod() }, ['aprendizaje-hmi-knuro'], T1, 200)
await crear('SIN u (obligatorio)', HOY, { otro: { vistas: 1, oscuro: 1, pc: 1 } }, ['otro'], T1, 403)
await crear('u vacío', HOY, { otro: { vistas: 1, oscuro: 1, pc: 1, u: {} } }, ['otro'], T1, 403)
await crear('vistas = 2 (inflar)', HOY, { inicio: mod({ vistas: 2 }) }, ['inicio'], T1, 403)
await crear('dos módulos en el mismo write', HOY, { inicio: mod(), otro: mod() }, ['inicio', 'otro'], T1, 403)
await crear('módulo fuera de la lista', HOY, { inventado: mod() }, ['inventado'], T1, 403)
await crear('sin intensidad (claro/oscuro)', HOY, { inicio: { vistas: 1, cel: 1, u: { [H1]: true } } }, ['inicio'], T1, 403)
await crear('claro y oscuro a la vez', HOY, { inicio: mod({ oscuro: 1 }) }, ['inicio'], T1, 403)
await crear('cel y pc a la vez', HOY, { inicio: mod({ pc: 1 }) }, ['inicio'], T1, 403)
await crear('campo extra en el módulo (nombre)', HOY, { inicio: mod({ nombre: 'Orel' }) }, ['inicio'], T1, 403)
await crear('hash de otra persona', HOY, { inicio: mod({ u: { [H3]: true } }) }, ['inicio'], T1, 403)
await crear('mi hash + uno ajeno', HOY, { inicio: mod({ u: { [H1]: true, [H3]: true } }) }, ['inicio'], T1, 403)
await crear('uid en claro en vez de hash', HOY, { inicio: mod({ u: { u1: true } }) }, ['inicio'], T1, 403)
await crear('hash con valor distinto de true', HOY, { inicio: mod({ u: { [H1]: false } }) }, ['inicio'], T1, 403)
await crear('valor numérico como string', HOY, { inicio: mod({ vistas: '1' }) }, ['inicio'], T1, 403)
await crear('id con mala forma', 'hoy', { inicio: mod() }, ['inicio'], T1, 403)
await crear('id con mala forma (fecha sin ceros)', '2026-1-5', { inicio: mod() }, ['inicio'], T1, 403)
await crear('usuario inactivo', HOY, { inicio: mod() }, ['inicio'], jwt('u2'), 403)
await crear('usuario sin doc en users', HOY, { inicio: mod() }, ['inicio'], jwt('u9'), 403)
await preparar(HOY, null)
check('create: ultimo apunta a otro módulo que el escrito', await put(`moduloVistas/${HOY}`, { ultimo: 'aria', inicio: mod() }, T1, ['ultimo', 'inicio']), 403)

// ---- create: ventana de fechas (id vs request.time; ver diaVistasCercano en firestore.rules) ----
// Ventana: request.time en (fecha-1d, fecha+2d) con la fecha a 00:00 UTC => ids válidos: ayer, hoy y mañana (UTC).
await crear('fecha de hoy', dia(0), { inicio: mod() }, ['inicio'], T1, 200)
await crear('fecha de ayer (UTC), cubre el desfase de Chile', dia(-1), { inicio: mod() }, ['inicio'], T1, 200)
await crear('fecha de mañana (UTC): DENTRO de la ventana, se acepta (cubre Chile adelantado respecto de UTC)', dia(1), { inicio: mod() }, ['inicio'], T1, 200)
await crear('fecha de anteayer (fuera de la ventana)', dia(-2), { inicio: mod() }, ['inicio'], T1, 403)
await crear('fecha de pasado mañana (fuera de la ventana)', dia(2), { inicio: mod() }, ['inicio'], T1, 403)
await crear('fecha de hace 10 días', dia(-10), { inicio: mod() }, ['inicio'], T1, 403)
await crear('fecha de dentro de 10 días', dia(10), { inicio: mod() }, ['inicio'], T1, 403)

// ---- update (el doc del día ya existe; PREV: u3 contó inicio, otros cuatro hashes contaron bitacora) ----
await actualizar('otro usuario, mismo módulo y día (suma su vista)', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 200)
await actualizar('otro usuario, mismo módulo, otra intensidad y dispositivo (oscuro/pc)', HOY, { inicio: { vistas: 2, claro: 1, oscuro: 1, cel: 1, pc: 1, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 200)
await actualizar('segundo módulo nuevo del mismo usuario', HOY, { admin: { vistas: 1, oscuro: 1, pc: 1, u: { [H1]: true } } }, ['admin'], T1, 200)
await actualizar('segunda vista del MISMO usuario, mismo módulo y día', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 403, {
  ...PREV,
  inicio: { vistas: 1, claro: 1, cel: 1, u: { [H1]: true } },
})
await actualizar('segunda vista del mismo usuario reenviando u idéntico', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H1]: true } } }, ['inicio'], T1, 403, {
  ...PREV,
  inicio: { vistas: 1, claro: 1, cel: 1, u: { [H1]: true } },
})
await actualizar('BORRAR u (módulo sin u)', HOY, { inicio: { vistas: 2, claro: 2, cel: 2 } }, ['inicio'], T1, 403)
await actualizar('BORRAR u (u vacío)', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: {} } }, ['inicio'], T1, 403)
await actualizar('BORRAR el propio hash (estaba y se quita)', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true } } }, ['inicio'], T1, 403, {
  ...PREV,
  inicio: { vistas: 1, claro: 1, cel: 1, u: { [H1]: true, [H3]: true } },
})
await actualizar('borrar el hash de otro usuario', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H1]: true } } }, ['inicio'], T1, 403)
await actualizar('sumar vista agregando un hash ajeno además del propio', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true, abcdefabcdef: true } } }, ['inicio'], T1, 403)
await actualizar('sumar vista agregando solo un hash ajeno', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, abcdefabcdef: true } } }, ['inicio'], T1, 403)
await actualizar('+2 en vistas', HOY, { inicio: { vistas: 3, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 403)
await actualizar('vistas +1 pero claro +2', HOY, { inicio: { vistas: 2, claro: 3, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 403)
await actualizar('bajar el contador', HOY, { bitacora: { vistas: 3, oscuro: 3, pc: 3, u: { [H3]: true, aaaaaaaaaaaa: true, bbbbbbbbbbbb: true, cccccccccccc: true, [H1]: true } } }, ['bitacora'], T1, 403)
await actualizar('hash nuevo pero sin sumar vistas', HOY, { bitacora: { vistas: 4, oscuro: 4, pc: 4, u: { [H3]: true, aaaaaaaaaaaa: true, bbbbbbbbbbbb: true, cccccccccccc: true, [H1]: true } } }, ['bitacora'], T1, 403)
await actualizar('dos módulos a la vez', HOY, {
  inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } },
  bitacora: { vistas: 5, oscuro: 5, pc: 5, u: { [H3]: true, aaaaaaaaaaaa: true, bbbbbbbbbbbb: true, cccccccccccc: true, [H1]: true } },
}, ['inicio', 'bitacora'], T1, 403)
await actualizar('usuario inactivo', HOY, { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], jwt('u2'), 403)
await actualizar('día de ayer (dentro de la ventana)', dia(-1), { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 200)
await actualizar('día de hace 10 días (doc existente, fuera de la ventana)', dia(-10), { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 403)
await actualizar('día de mañana (dentro de la ventana)', dia(1), { inicio: { vistas: 2, claro: 2, cel: 2, u: { [H3]: true, [H1]: true } } }, ['inicio'], T1, 200)

// ---- lectura y borrado ----
await preparar(HOY, PREV)
check('read: técnico (no supervisor)', await get(`moduloVistas/${HOY}`, T1), 403)
check('read: supervisor', await get(`moduloVistas/${HOY}`, jwt('u3')), 200)
check('read: sin sesión', await get(`moduloVistas/${HOY}`, null), 403)
check('delete: supervisor', await del(`moduloVistas/${HOY}`, jwt('u3')), 403)

console.log(fallos ? `${fallos} FALLOS` : 'TODOS OK')
process.exit(fallos ? 1 : 0)
