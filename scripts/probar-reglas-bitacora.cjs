// Prueba las reglas de Firestore PUBLICADAS de la Bitácora con la API projects:test.
// NO escribe datos: simula create/update/delete/get con usuarios de mentira (functionMocks).
// Uso (desde la raíz del repo, con serviceAccountKey.json):
//   node scripts/probar-reglas-bitacora.cjs           → prueba las reglas PUBLICADAS
//   node scripts/probar-reglas-bitacora.cjs --local   → prueba firestore.rules del repo ANTES de publicar
// Sale con código 2 si algún caso no dio lo esperado.
const fs = require('fs')
const path = require('path')
const LOCAL = process.argv.includes('--local')
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

// Casos de lo agregado después de #1024 (técnicos presentes, lista maestra, participantes).
// Solo aplican al ruleset que ya los trae: con --local, o cuando estén publicados.
const CASOS_TECNICOS = [
  ['Evento con participantes y equipo de la jerarquía', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ participantes: ['Lucas Adrade', 'Matias Serpa'], equipoId: '09DK1IcV8BaDCp9vU4Tf' }) }, usuario(true, 'tecnico')],
  ['Evento con 13 participantes', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraEventos', data: evento({ participantes: Array(13).fill('X') }) }, usuario(true, 'tecnico')],
  ['Turno con solo técnicos presentes (sin observación)', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-15_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', presentes: ['Danilo Cortes', 'Lucas Adrade'], actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
  ['Presentes que no son lista', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraTurnos', id: 'chonchi_2026-09-15_tarde', data: { plantId: 'chonchi', turnoId: '2026-09-15_tarde', presentes: 'Danilo', actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
  ['Técnico activo ajusta la lista maestra', 'ALLOW', { method: 'create', uid: 'tecnico1', col: 'bitacoraConfig', id: 'chonchi', data: { agregados: ['Juan Pérez'], ocultos: [], renombres: { 'Lucas Adrade': 'Lucas Andrade' }, actualizadoPor: 'tecnico1' } }, usuario(true, 'tecnico')],
  ['Lista maestra firmada por otro', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraConfig', id: 'chonchi', data: { agregados: [], ocultos: [], renombres: {}, actualizadoPor: 'tecnico2' } }, usuario(true, 'tecnico')],
  ['Usuario inactivo ajusta la lista maestra', 'DENY', { method: 'create', uid: 'tecnico1', col: 'bitacoraConfig', id: 'chonchi', data: { agregados: [], ocultos: [], renombres: {}, actualizadoPor: 'tecnico1' } }, usuario(false, 'tecnico')],
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
  let source
  let origen
  if (LOCAL) {
    const archivo = path.join(__dirname, '..', 'firestore.rules')
    source = { files: [{ name: 'firestore.rules', content: fs.readFileSync(archivo, 'utf8') }] }
    origen = 'firestore.rules LOCAL (sin publicar)'
  } else {
    const { releases } = await api(`https://firebaserules.googleapis.com/v1/projects/${P}/releases`)
    const rel = releases.find((r) => r.name.endsWith('cloud.firestore'))
    const rs = await api(`https://firebaserules.googleapis.com/v1/${rel.rulesetName}`)
    source = rs.source
    origen = `PUBLICADO ${rel.rulesetName.split('/').pop()} · ${rel.updateTime}`
  }
  const contenido = source.files.map((f) => f.content).join('\n')
  if (contenido.includes('/bitacoraConfig/')) casos.push(...CASOS_TECNICOS)

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
  const res = await api(`https://firebaserules.googleapis.com/v1/projects/${P}:test`, { source, testSuite: { testCases } })
  let fallas = 0
  res.testResults.forEach((t, i) => {
    const ok = t.state === 'SUCCESS'
    if (!ok) fallas++
    const detalle = ok ? '' : ` ← ${JSON.stringify(t.debugMessages ?? t.errorPosition ?? '').slice(0, 300)}`
    console.log(`${ok ? 'OK   ' : 'FALLA'} [${casos[i][1]}] ${casos[i][0]}${detalle}`)
  })
  console.log(`\n${casos.length - fallas}/${casos.length} casos como se esperaba · ${origen}`)
  // exitCode y no process.exit(): en Windows (Node 24) cortar con conexiones de
  // fetch abiertas revienta libuv al salir y el código de salida queda basura.
  process.exitCode = fallas ? 2 : 0
})().catch((e) => {
  console.error(e.message)
  process.exitCode = 1
})
