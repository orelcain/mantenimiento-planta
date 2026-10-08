// Uso (desde la raíz del repo): npx firebase-tools@14 emulators:exec --only firestore --project demo-rules "node scripts/reglas/planoVinculos.test.mjs"
// Prueba de las reglas de planoVinculos contra el emulador de Firestore, por REST.
// Auth: JWT sin firma (el emulador lo acepta). `Bearer owner` salta las reglas (para sembrar users/).
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const BASE = `http://${HOST}/v1/projects/demo-rules/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (uid) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ user_id: uid, sub: uid, aud: 'demo-rules', firebase: { sign_in_provider: 'password' } })}.`

const val = (v) =>
  typeof v === 'string' ? { stringValue: v } : v === true ? { booleanValue: true } : { stringValue: String(v) }
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) })

async function put(path, data, token) {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields(data)),
  })
  return r.status
}

await put('users/u1', { activo: true, rol: 'tecnico' }, 'owner')

const base = { plantId: 'chonchi', estado: 'confirmado', codigo: '42303109', confirmadoPor: 'u1' }
const casos = [
  // [descripción, id, datos, esperado]
  ['888 con maquina e id con maquina', 'baader-142-888__B5__baader-n2', { ...base, planoSlug: 'baader-142-888', aparato: 'B5', maquina: 'baader-n2' }, 200],
  ['888 N3', 'baader-142-888__B5__baader-n3', { ...base, planoSlug: 'baader-142-888', aparato: 'B5', maquina: 'baader-n3' }, 200],
  ['888 sin maquina (cliente viejo)', 'baader-142-888__B5', { ...base, planoSlug: 'baader-142-888', aparato: 'B5' }, 403],
  ['888 con maquina pero id sin maquina', 'baader-142-888__B6', { ...base, planoSlug: 'baader-142-888', aparato: 'B6', maquina: 'baader-n2' }, 403],
  ['888 maquina en el id distinta al campo', 'baader-142-888__B7__baader-n3', { ...base, planoSlug: 'baader-142-888', aparato: 'B7', maquina: 'baader-n2' }, 403],
  ['888 con N1 (no corresponde)', 'baader-142-888__B8__baader-n1', { ...base, planoSlug: 'baader-142-888', aparato: 'B8', maquina: 'baader-n1' }, 403],
  ['maquina inventada', 'baader-142-888__B9__baader-n9', { ...base, planoSlug: 'baader-142-888', aparato: 'B9', maquina: 'baader-n9' }, 403],
  ['860 sin maquina, id sin maquina (no cambia)', 'baader-142-860__B1', { ...base, planoSlug: 'baader-142-860', aparato: 'B1' }, 200],
  ['GEA sin maquina (no cambia)', 'gea-50520184__K1', { ...base, planoSlug: 'gea-50520184', aparato: 'K1' }, 200],
  ['860 con maquina N1 e id con sufijo (duplicaría al válido)', 'baader-142-860__B2__baader-n1', { ...base, planoSlug: 'baader-142-860', aparato: 'B2', maquina: 'baader-n1' }, 403],
  ['860 con maquina N2', 'baader-142-860__B3__baader-n2', { ...base, planoSlug: 'baader-142-860', aparato: 'B3', maquina: 'baader-n2' }, 403],
  ['GEA con maquina (el visor no la mostraría)', 'gea-50520184__K3__baader-n2', { ...base, planoSlug: 'gea-50520184', aparato: 'K3', maquina: 'baader-n2' }, 403],
  ['GEA con id mal armado', 'gea-50520184__otro', { ...base, planoSlug: 'gea-50520184', aparato: 'K2' }, 403],
]

let fallos = 0
for (const [desc, id, datos, esperado] of casos) {
  const st = await put(`planoVinculos/${id}`, datos, jwt('u1'))
  const ok = st === esperado
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${desc}: ${st} (esperado ${esperado})`)
}
console.log(fallos ? `${fallos} FALLOS` : 'TODOS OK')
process.exit(fallos ? 1 : 0)
