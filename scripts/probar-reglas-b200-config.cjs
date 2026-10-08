// Prueba las reglas de Firestore de baader200-config (y la escritura de
// baader200-sections, que define quién edita el manual) con la API projects:test
// (mismo patrón que probar-reglas-bitacora.cjs). NO escribe datos.
// Uso (desde la raíz del repo):
//   node scripts/probar-reglas-b200-config.cjs           → reglas PUBLICADAS
//   node scripts/probar-reglas-b200-config.cjs --local   → firestore.rules del repo
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
const ruta = (id) => (id.includes('/') ? `/databases/(default)/documents/${id}` : `/databases/(default)/documents/baader200-config/${id}`)
const auth = (uid, provider = 'google.com') => (uid ? { uid, token: { firebase: { sign_in_provider: provider } } } : null)

// [nombre, esperado, { method, uid, provider, id, data }, mocks]
const casos = [
  ['Sin login LEE edit-pwd', 'DENY', { method: 'get', id: 'edit-pwd' }, []],
  ['Técnico LEE edit-pwd', 'DENY', { method: 'get', uid: 't1', id: 'edit-pwd' }, usuario('tecnico')],
  ['Admin LEE edit-pwd', 'DENY', { method: 'get', uid: 'a1', id: 'edit-pwd' }, usuario('admin')],
  ['Admin ESCRIBE edit-pwd', 'DENY', { method: 'update', uid: 'a1', id: 'edit-pwd', data: { pwd: 'x' } }, usuario('admin')],
  ['Sin login LEE section-order (Modo Aprendizaje QR)', 'ALLOW', { method: 'get', id: 'section-order' }, []],
  ['Sin login LEE otro doc de config', 'DENY', { method: 'get', id: 'otro' }, []],
  ['Anónimo LEE otro doc de config', 'DENY', { method: 'get', uid: 'anon', provider: 'anonymous', id: 'otro' }, usuario('tecnico')],
  ['Técnico logueado LEE otro doc de config', 'ALLOW', { method: 'get', uid: 't1', id: 'otro' }, usuario('tecnico')],
  ['Supervisor ESCRIBE section-order', 'ALLOW', { method: 'update', uid: 's1', id: 'section-order', data: { order: ['a'] } }, usuario('supervisor')],
  ['Técnico ESCRIBE section-order', 'DENY', { method: 'update', uid: 't1', id: 'section-order', data: { order: [] } }, usuario('tecnico')],
  ['Sin login ESCRIBE section-order', 'DENY', { method: 'update', id: 'section-order', data: { order: [] } }, []],
  ['Sin login LEE una sección (QR)', 'ALLOW', { method: 'get', id: 'baader200-sections/primera-alimentacion' }, []],
  ['Sin login ESCRIBE una sección', 'DENY', { method: 'update', id: 'baader200-sections/primera-alimentacion', data: { title: 'x' } }, []],
  ['Técnico ESCRIBE una sección', 'DENY', { method: 'update', uid: 't1', id: 'baader200-sections/primera-alimentacion', data: { title: 'x' } }, usuario('tecnico')],
  ['Admin ESCRIBE una sección', 'ALLOW', { method: 'update', uid: 'a1', id: 'baader200-sections/primera-alimentacion', data: { title: 'x' } }, usuario('admin')],
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
    if (c.data) req.resource = { __name__: ruta(c.id), id: c.id.split('/').pop(), data: c.data }
    return {
      expectation,
      request: req,
      resource: { __name__: ruta(c.id), id: c.id.split('/').pop(), data: { x: 1 } },
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
