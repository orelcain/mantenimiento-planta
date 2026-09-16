// Prueba storage.rules del REPO (antes de publicar) con la API projects:test.
// NO escribe nada. Cubre el pase de bitácora (16-09-2026): el teléfono con pase
// solo toca bitacora/, y el resto de las sesiones sigue igual.
// Uso (desde la raíz del repo, con serviceAccountKey.json):
//   node scripts/probar-reglas-storage-pase.cjs
// Sale con código 2 si algún caso no dio lo esperado.
const fs = require('fs')
const path = require('path')
const admin = require('firebase-admin')
const P = 'mantenimiento-planta-771a3'
const B = 'mantenimiento-planta-771a3.firebasestorage.app'
const llave = path.join(__dirname, '..', 'serviceAccountKey.json')
const reglas = path.join(__dirname, '..', 'storage.rules')
const pase = { uid: 'pase_1', token: { firebase: { sign_in_provider: 'custom' }, pase_bitacora: true, plantId: 'chonchi', nombre: 'Leandro Igor' } }
const tec = { uid: 'tec1', token: { firebase: { sign_in_provider: 'password' } } }
const tg = { uid: 'tg_1', token: { firebase: { sign_in_provider: 'custom' }, isTelegramUser: true } }
const foto = { size: 200000, contentType: 'image/jpeg' }
const casos = [
  ['Pase sube foto a bitacora/', 'ALLOW', pase, 'create', 'bitacora/2026-09-16_tarde/ev1/a.jpg', foto],
  ['Pase lee foto de bitacora/', 'ALLOW', pase, 'get', 'bitacora/2026-09-16_tarde/ev1/a.jpg'],
  ['Pase borra foto de bitacora/', 'ALLOW', pase, 'delete', 'bitacora/2026-09-16_tarde/ev1/a.jpg'],
  ['Pase sube un PDF a bitacora/', 'DENY', pase, 'create', 'bitacora/2026-09-16_tarde/ev1/a.pdf', { size: 1000, contentType: 'application/pdf' }],
  ['Pase sube a incidents/', 'DENY', pase, 'create', 'incidents/i1/a.jpg', foto],
  ['Pase sube a planosAguas/', 'DENY', pase, 'create', 'planosAguas/x/a.jpg', foto],
  ['Pase lee otra carpeta', 'DENY', pase, 'get', 'equipment/e1/a.jpg'],
  ['Pase borra en incidents/', 'DENY', pase, 'delete', 'incidents/i1/a.jpg'],
  ['Técnico sube a bitacora/', 'ALLOW', tec, 'create', 'bitacora/2026-09-16_tarde/ev1/a.jpg', foto],
  ['Técnico lee otra carpeta', 'ALLOW', tec, 'get', 'equipment/e1/a.jpg'],
  ['Técnico sube a incidents/', 'ALLOW', tec, 'create', 'incidents/i1/a.jpg', foto],
  ['Telegram (custom sin pase) lee', 'ALLOW', tg, 'get', 'equipment/e1/a.jpg'],
  ['Sin sesión sube a bitacora/', 'DENY', null, 'create', 'bitacora/2026-09-16_tarde/ev1/a.jpg', foto],
  ['Lectura pública de planos/ sigue', 'ALLOW', null, 'get', 'planos/x.svg'],
]
;(async () => {
  const cred = admin.credential.cert(require(llave))
  const { access_token } = await cred.getAccessToken()
  const source = { files: [{ name: 'storage.rules', content: fs.readFileSync(reglas, 'utf8') }] }
  const testCases = casos.map(([, expectation, auth, method, obj, recurso]) => ({
    expectation,
    request: {
      ...(auth ? { auth } : {}),
      path: `/b/${B}/o/${obj}`,
      method,
      time: new Date().toISOString(),
      ...(recurso ? { resource: { ...recurso, name: obj, bucket: B } } : {}),
    },
    ...(method !== 'create' ? { resource: { name: obj, bucket: B, size: 1000, contentType: 'image/jpeg' } } : {}),
  }))
  const r = await fetch(`https://firebaserules.googleapis.com/v1/projects/${P}:test`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, testSuite: { testCases } }),
  })
  const j = await r.json()
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 800))
  let f = 0
  j.testResults.forEach((t, i) => {
    const ok = t.state === 'SUCCESS'
    if (!ok) f++
    console.log(`${ok ? 'OK   ' : 'FALLA'} [${casos[i][1]}] ${casos[i][0]}${ok ? '' : ' ← ' + JSON.stringify(t.debugMessages ?? t.errorPosition ?? t).slice(0, 300)}`)
  })
  console.log(`${casos.length - f}/${casos.length} casos como se esperaba · storage.rules LOCAL (sin publicar)`)
  process.exitCode = f ? 2 : 0
})().catch((e) => { console.error(e.message); process.exitCode = 1 })
