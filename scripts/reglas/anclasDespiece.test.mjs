// Uso (desde la raíz del repo): npx firebase-tools@14 emulators:exec --only firestore --project demo-rules "node scripts/reglas/anclasDespiece.test.mjs"
// Reglas de anclasDespiece (modo revisión del despiece): leer = sesión de catálogo; escribir = admin o supervisor.
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const BASE = `http://${HOST}/v1/projects/demo-rules/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (uid, prov = 'password') =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ user_id: uid, sub: uid, aud: 'demo-rules', firebase: { sign_in_provider: prov } })}.`
const val = (v) => (typeof v === 'number' ? { integerValue: String(v) } : v === true ? { booleanValue: true } : { stringValue: String(v) })
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) })

async function put(path, data, token) {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(fields(data)),
  })
  return r.status
}
async function get(path, token) {
  return (await fetch(`${BASE}/${path}`, { headers: { Authorization: `Bearer ${token}` } })).status
}

await put('users/adm', { activo: true, rol: 'admin' }, 'owner')
await put('users/sup', { activo: true, rol: 'supervisor' }, 'owner')
await put('users/tec', { activo: true, rol: 'tecnico' }, 'owner')

const ancla = { slug: 'baader-200-despiece', hoja: 45, pos: '8', codigo: '1890312000', estado: 'ubicada', en: 1 }
const id = 'anclasDespiece/baader-200-despiece__45__8'
const casos = [
  ['admin guarda', () => put(id, ancla, jwt('adm')), 200],
  ['supervisor guarda', () => put(id, ancla, jwt('sup')), 200],
  ['técnico no guarda', () => put(id, ancla, jwt('tec')), 403],
  ['técnico lee', () => get(id, jwt('tec')), 200],
  ['anónimo no lee', () => get(id, jwt('anon', 'anonymous')), 403],
]
let mal = 0
for (const [desc, f, esperado] of casos) {
  const st = await f()
  const ok = st === esperado
  if (!ok) mal++
  console.log(`${ok ? 'OK ' : 'MAL'} ${desc}: ${st} (esperado ${esperado})`)
}
process.exit(mal ? 1 : 0)
