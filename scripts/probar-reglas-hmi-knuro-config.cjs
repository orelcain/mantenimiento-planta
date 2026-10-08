// Prueba las reglas de Firestore de hmi-knuro-config con la API projects:test
// (mismo patrón que probar-reglas-bitacora.cjs). NO escribe datos.
// Uso (desde la raíz del repo):
//   node scripts/probar-reglas-hmi-knuro-config.cjs           → reglas PUBLICADAS
//   node scripts/probar-reglas-hmi-knuro-config.cjs --local   → firestore.rules del repo
// Credencial: serviceAccountKey.json en la raíz, o la ruta en SA_KEY.
// Sale con código 2 si algún caso no dio lo esperado.
const fs = require('fs')
const path = require('path')
const LOCAL = process.argv.includes('--local')
const admin = require('firebase-admin')
const P = 'mantenimiento-planta-771a3'

const usuario = (rol) => [
  { function: 'exists', args: [{ anyValue: {} }], result: { value: true } },
  { function: 'get', args: [{ anyValue: {} }], result: { value: { data: { activo: true, rol } } } },
]
const ruta = (id) => `/databases/(default)/documents/hmi-knuro-config/${id}`
const auth = (uid, provider = 'google.com') => (uid ? { uid, token: { firebase: { sign_in_provider: provider } } } : null)

// [nombre, esperado, { method, uid, provider, id, data }, mocks]
const casos = [
  ['Sin login LEE tooltip-pwd', 'DENY', { method: 'get', id: 'tooltip-pwd' }, []],
  ['Técnico LEE tooltip-pwd', 'DENY', { method: 'get', uid: 't1', id: 'tooltip-pwd' }, usuario('tecnico')],
  ['Admin LEE tooltip-pwd', 'DENY', { method: 'get', uid: 'a1', id: 'tooltip-pwd' }, usuario('admin')],
  ['Admin ESCRIBE tooltip-pwd', 'DENY', { method: 'update', uid: 'a1', id: 'tooltip-pwd', data: { pwd: 'x' } }, usuario('admin')],
  ['Sin login LEE preset-order (Modo Aprendizaje QR)', 'ALLOW', { method: 'get', id: 'preset-order' }, []],
  ['Sin login LEE current', 'DENY', { method: 'get', id: 'current' }, []],
  ['Anónimo LEE refs', 'DENY', { method: 'get', uid: 'anon', provider: 'anonymous', id: 'refs' }, usuario('tecnico')],
  ['Técnico logueado LEE current', 'ALLOW', { method: 'get', uid: 't1', id: 'current' }, usuario('tecnico')],
  ['Admin LEE refs', 'ALLOW', { method: 'get', uid: 'a1', id: 'refs' }, usuario('admin')],
  ['Supervisor ESCRIBE preset-order', 'ALLOW', { method: 'update', uid: 's1', id: 'preset-order', data: { order: ['A'] } }, usuario('supervisor')],
  ['Técnico ESCRIBE current', 'DENY', { method: 'update', uid: 't1', id: 'current', data: { name: 'A' } }, usuario('tecnico')],
  ['Sin login ESCRIBE preset-order', 'DENY', { method: 'update', id: 'preset-order', data: { order: [] } }, []],
]

;(async () => {
  const keyPath = process.env.SA_KEY || path.join(__dirname, '..', 'serviceAccountKey.json')
  const cred = admin.credential.cert(require(keyPath))
  const { access_token: token } = await cred.getAccessToken()
  const api = async (url, body) => {
    const r = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    const j = await r.json()
    if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j.error ?? j).slice(0, 500)}`)
    return j
  }
  let source
  let origen
  if (LOCAL) {
    source = { files: [{ name: 'firestore.rules', content: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') }] }
    origen = 'firestore.rules LOCAL (sin publicar)'
  } else {
    const { releases } = await api(`https://firebaserules.googleapis.com/v1/projects/${P}/releases`)
    const rel = releases.find((r) => r.name.endsWith('cloud.firestore'))
    const rs = await api(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`)
    source = rs.source
    origen = `PUBLICADO ${rel.rulesetName.split('/').pop()} · ${rel.updateTime}`
  }
  const ahora = new Date().toISOString()
  const testCases = casos.map(([, expectation, c, mocks]) => {
    const req = { auth: auth(c.uid, c.provider), path: ruta(c.id), method: c.method, time: ahora }
    if (c.data) req.resource = { __name__: ruta(c.id), id: c.id, data: c.data }
    return {
      expectation,
      request: req,
      resource: { __name__: ruta(c.id), id: c.id, data: { x: 1 } },
      ...(mocks.length ? { functionMocks: mocks } : {}),
    }
  })
  const res = await api(`https://firebaserules.googleapis.com/v1/projects/${P}:test`, { source, testSuite: { testCases } })
  let fallas = 0
  console.log(`Reglas: ${origen}`)
  res.testResults.forEach((t, i) => {
    const ok = t.state === 'SUCCESS'
    if (!ok) fallas++
    const detalle = ok ? '' : ` ← ${JSON.stringify(t.debugMessages ?? t.errorPosition ?? '').slice(0, 300)}`
    console.log(`${ok ? 'OK  ' : 'FALLA'} [${casos[i][1]}] ${casos[i][0]}${detalle}`)
  })
  console.log(`${casos.length - fallas}/${casos.length} casos como se esperaba`)
  process.exitCode = fallas ? 2 : 0
})().catch((e) => { console.error(e); process.exit(1) })
