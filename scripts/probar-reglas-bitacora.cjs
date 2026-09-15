// Prueba las reglas de Firestore PUBLICADAS de la Bitácora con la API projects:test.
// NO escribe datos: simula create/update/delete/get con usuarios de mentira (functionMocks).
// Uso (desde la raíz del repo, con serviceAccountKey.json): node scripts/probar-reglas-bitacora.cjs
// Sale con código 2 si algún caso no dio lo esperado. Correrlo tras cada cambio de reglas publicado.
const path = require('path')
const admin = require('firebase-admin')
const P = 'mantenimiento-planta-771a3'

const usuario = (activo, rol) => [
  { function: 'exists', args: [{ anyValue: {} }], result: { value: true } },
  { function: 'get', args: [{ anyValue: {} }], result: { value: { data: { activo, rol } } } },
]
const auth = (uid) => ({ uid, token: { firebase: { sign_in_provider: 'google.com' } } })
const ruta = (col, id) => `/databases/(default)/documents/${col}/${id}`

const evento = (extra = {}) => ({
  plantId: 'chonchi',
  turnoId: '2026-09-15_tarde',
  fechaTurno: '2026-09-15',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'BAADER 142',
  descripcion: 'Detención por E777.',
  horaInicio: '16:20',
  horaTermino: '16:55',
  impacto: 'con-parada',
  minutosParada: 35,
  ventana: null,
  pendiente: false,
  fotos: [{ url: 'https://x/a.jpg', path: 'bitacora/x/y/a.jpg', etiqueta: 'antes', ancho: 1600, alto: 1200 }],
  creadoPor: 'tecnico1',
  autorNombre: 'Danilo Cortes',
  ...extra,
})

const casos = [
  ['Técnico activo CREA un evento válido', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento() }, usuario(true, 'tecnico')],
  ['Evento abierto (término null, sin parada, ventana)', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ horaTermino: null, impacto: 'en-ventana', minutosParada: null, ventana: 'Colación HG', equipo: '' }) }, usuario(true, 'tecnico')],
  ['Crear firmando como OTRO usuario', 'DENY', { method: 'create', uid: 'tecnico2', col: 'bitacoraEventos', data: evento() }, usuario(true, 'tecnico')],
  ['Crear con descripción vacía', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ descripcion: '   ' }) }, usuario(true, 'tecnico')],
  ['Crear con turnoId mal formado', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ turnoId: '2026-09-15_madrugada' }) }, usuario(true, 'tecnico')],
  ['Crear con 9 fotos', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ fotos: Array(9).fill(evento().fotos[0]) }) }, usuario(true, 'tecnico')],
  ['Usuario INACTIVO crea', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento() }, usuario(false, 'tecnico')],
  ['Otro técnico EDITA (bitácora compartida)', 'ALLOW', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ descripcion: 'Corregido', actualizadoPorNombre: 'Otro' }), previo: evento() }, usuario(true, 'tecnico')],
  ['Editar cambiando el autor', 'DENY', { method: 'update', uid: 'tecnico2', col: 'bitacoraEventos', data: evento({ creadoPor: 'tecnico2' }), previo: evento() }, usuario(true, 'tecnico')],
  ['Editar moviendo el evento a otro turno', 'DENY', { method: 'update', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ turnoId: '2026-09-15_noche' }), previo: evento() }, usuario(true, 'tecnico')],
  ['El AUTOR borra', 'ALLOW', { method: 'delete', uid: 'tecnico1', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'tecnico')],
  ['Otro técnico borra', 'DENY', { method: 'delete', uid: 'tecnico2', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'tecnico')],
  ['Admin borra', 'ALLOW', { method: 'delete', uid: 'jefe', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'admin')],
  ['Técnico activo LEE', 'ALLOW', { method: 'get', uid: 'tecnico1', col: 'bitacoraEventos', previo: evento() }, usuario(true, 'tecnico')],
  ['Observación del turno válida', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-15_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', observacion: 'Sin novedad', actualizadoPor: 'tecnico1', actualizadoPorNombre: 'Danilo' } }, usuario(true, 'tecnico')],
  ['Observación con id que no calza con el turno', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-14_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', observacion: 'x', actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
]

;(async () => {
  const cred = admin.credential.cert(require(path.join(__dirname, '..', 'serviceAccountKey.json')))
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
  // Se prueba el ruleset PUBLICADO, no el archivo del repo: "está en el código" ≠ "está vivo".
  const { releases } = await api(`https://firebaserules.googleapis.com/v1/projects/${P}/releases`)
  const rel = releases.find((r) => r.name.endsWith('cloud.firestore'))
  const rs = await api(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`)

  const testCases = casos.map(([, expectation, c, mocks]) => {
    const id = c.id ?? 'evento1'
    const req = { auth: auth(c.uid), path: ruta(c.col, id), method: c.method, time: new Date().toISOString() }
    if (c.data) req.resource = { __name__: ruta(c.col, id), id, data: c.data }
    return {
      expectation,
      request: req,
      ...(c.previo ? { resource: { __name__: ruta(c.col, id), id, data: c.previo } } : {}),
      functionMocks: mocks,
    }
  })
  const res = await api(`https://firebaserules.googleapis.com/v1/projects/${P}:test`, { source: rs.source, testSuite: { testCases } })
  let fallas = 0
  res.testResults.forEach((t, i) => {
    const ok = t.state === 'SUCCESS'
    if (!ok) fallas++
    const detalle = ok ? '' : ` ← ${JSON.stringify(t.debugMessages ?? t.errorPosition ?? '').slice(0, 300)}`
    console.log(`${ok ? 'OK   ' : 'FALLA'} [${casos[i][1]}] ${casos[i][0]}${detalle}`)
  })
  console.log(`\n${casos.length - fallas}/${casos.length} casos como se esperaba · ruleset ${rel.rulesetName.split('/').pop()} · publicado ${rel.updateTime}`)
  process.exit(fallas ? 2 : 0)
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
