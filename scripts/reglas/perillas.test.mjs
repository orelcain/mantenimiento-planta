// Uso (desde la raíz del repo): npx firebase-tools@14 emulators:exec --only firestore --project demo-rules "node scripts/reglas/perillas.test.mjs"
// Prueba de las reglas de graderModuleConfigs con la perilla por máquina (monitorPerillas y monitorPerillasHistorial) y el modo del umbral (monitorUmbralARitmo y su historial):
// solo admin las cambia; el supervisor sigue escribiendo el resto del doc (set point, horario).
// Contra el emulador, por REST. Auth: JWT sin firma (el emulador lo acepta). `Bearer owner` salta las reglas (para sembrar).
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const BASE = `http://${HOST}/v1/projects/demo-rules/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (uid) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ user_id: uid, sub: uid, aud: 'demo-rules', firebase: { sign_in_provider: 'password' } })}.`

// Objetos anidados → mapValue (el helper de solicitudesAlta.test.mjs no los soporta).
const val = (v) =>
  v === null ? { nullValue: null }
    : typeof v === 'string' ? { stringValue: v }
      : typeof v === 'boolean' ? { booleanValue: v }
        : Number.isInteger(v) ? { integerValue: String(v) }
          : typeof v === 'number' ? { doubleValue: v }
            : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
              : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } }
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) })

// mask = campos de primer nivel que se escriben (escritura parcial). Sin mask, el PATCH reemplaza el documento entero.
async function escribir(path, data, token, mask = null) {
  const qs = mask ? '?' + mask.map((m) => `updateMask.fieldPaths=${m}`).join('&') : ''
  const r = await fetch(`${BASE}/${path}${qs}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields(data)),
  })
  return r.status
}

// adm = admin · sup = supervisor · usr = usuario común (no supervisor). Todos activos.
await escribir('users/adm', { activo: true, rol: 'admin' }, 'owner')
await escribir('users/sup', { activo: true, rol: 'supervisor' }, 'owner')
await escribir('users/usr', { activo: true, rol: 'usuario' }, 'owner')

// Línea 'global' sembrada con su perilla (ev1 a 17), su modo del umbral y su set point; el resto del doc es horario.
const PERILLA_17 = { cpm: 17, desde: '2026-11-03T12:00:00.000Z', por: 'admin' }
const HIST_17 = { ...PERILLA_17, machineId: 'ev1' }
const MODO_CAL = { modo: 'calibrado', desde: '2026-11-03T12:00:00.000Z', por: 'admin' }
const MODO_OPT = { modo: 'optimo', desde: '2026-11-04T13:00:00.000Z', por: 'admin' }
const seed = () => ({
  shiftSchedule: [],
  monitorSetPoint: { cpm: 18, medidoEl: '2026-08-15', metodo: 'cronómetro', por: 'admin' },
  monitorPerillas: { ev1: PERILLA_17 },
  monitorPerillasHistorial: [HIST_17],
  monitorUmbralARitmo: MODO_CAL,
  monitorUmbralARitmoHistorial: [MODO_CAL],
})
await escribir('graderModuleConfigs/global', seed(), 'owner')

const SP_19 = { cpm: 19, medidoEl: '2026-11-04', metodo: 'cronómetro', por: 'admin' }
const P_19 = { cpm: 19, desde: '2026-11-04T13:00:00.000Z', por: 'admin' }

// [descripción, ruta, datos, máscara, usuario, estado esperado]
const casos = [
  // ── Documento nuevo (create) ──
  ['supervisor crea doc solo con set point', 'graderModuleConfigs/nuevoSp', { monitorSetPoint: SP_19 }, null, 'sup', 200],
  ['supervisor crea doc con monitorPerillas', 'graderModuleConfigs/nuevoP', { monitorPerillas: { ev1: P_19 } }, null, 'sup', 403],
  ['supervisor crea doc con monitorPerillasHistorial', 'graderModuleConfigs/nuevoH', { monitorPerillasHistorial: [{ ...P_19, machineId: 'ev1' }] }, null, 'sup', 403],
  ['admin crea doc con monitorPerillas', 'graderModuleConfigs/nuevoA', { monitorPerillas: { ev1: P_19 } }, null, 'adm', 200],
  ['usuario común crea doc solo con set point', 'graderModuleConfigs/nuevoU', { monitorSetPoint: SP_19 }, null, 'usr', 403],
  ['supervisor crea doc con monitorUmbralARitmo', 'graderModuleConfigs/nuevoM', { monitorUmbralARitmo: MODO_OPT }, null, 'sup', 403],
  ['admin crea doc con monitorUmbralARitmo', 'graderModuleConfigs/nuevoMA', { monitorUmbralARitmo: MODO_OPT }, null, 'adm', 200],
  // ── Documento existente (update) ──
  ['supervisor cambia set point', 'graderModuleConfigs/global', { monitorSetPoint: SP_19 }, ['monitorSetPoint'], 'sup', 200],
  ['supervisor cambia horario (campo ajeno a la perilla)', 'graderModuleConfigs/global', { shiftSchedule: [] }, ['shiftSchedule'], 'sup', 200],
  ['supervisor cambia monitorPerillas', 'graderModuleConfigs/global', { monitorPerillas: { ev1: P_19 } }, ['monitorPerillas'], 'sup', 403],
  ['supervisor cambia monitorPerillasHistorial', 'graderModuleConfigs/global', { monitorPerillasHistorial: [HIST_17, { ...P_19, machineId: 'ev1' }] }, ['monitorPerillasHistorial'], 'sup', 403],
  ['supervisor reescribe monitorPerillas sin cambiarla', 'graderModuleConfigs/global', { monitorPerillas: { ev1: PERILLA_17 } }, ['monitorPerillas'], 'sup', 200],
  ['supervisor borra la perilla con reemplazo completo', 'graderModuleConfigs/global', { shiftSchedule: [], monitorSetPoint: SP_19 }, null, 'sup', 403],
  ['supervisor reemplazo completo que conserva la perilla', 'graderModuleConfigs/global', { ...seed(), monitorSetPoint: SP_19 }, null, 'sup', 200],
  ['usuario común cambia set point', 'graderModuleConfigs/global', { monitorSetPoint: SP_19 }, ['monitorSetPoint'], 'usr', 403],
  ['admin cambia monitorPerillas', 'graderModuleConfigs/global', { monitorPerillas: { ev1: P_19, ev2: P_19 } }, ['monitorPerillas'], 'adm', 200],
  ['admin cambia monitorPerillasHistorial', 'graderModuleConfigs/global', { monitorPerillasHistorial: [HIST_17, { ...P_19, machineId: 'ev1' }] }, ['monitorPerillasHistorial'], 'adm', 200],
  ['supervisor cambia monitorUmbralARitmo', 'graderModuleConfigs/global', { monitorUmbralARitmo: MODO_OPT }, ['monitorUmbralARitmo'], 'sup', 403],
  ['supervisor cambia monitorUmbralARitmoHistorial', 'graderModuleConfigs/global', { monitorUmbralARitmoHistorial: [MODO_CAL, MODO_OPT] }, ['monitorUmbralARitmoHistorial'], 'sup', 403],
  ['supervisor reescribe monitorUmbralARitmo sin cambiarlo', 'graderModuleConfigs/global', { monitorUmbralARitmo: MODO_CAL }, ['monitorUmbralARitmo'], 'sup', 200],
  ['admin cambia monitorUmbralARitmo', 'graderModuleConfigs/global', { monitorUmbralARitmo: MODO_OPT }, ['monitorUmbralARitmo'], 'adm', 200],
  ['admin cambia monitorUmbralARitmoHistorial', 'graderModuleConfigs/global', { monitorUmbralARitmoHistorial: [MODO_CAL, MODO_OPT] }, ['monitorUmbralARitmoHistorial'], 'adm', 200],
]

let fallos = 0
for (const [desc, path, datos, mask, uid, esperado] of casos) {
  const st = await escribir(path, datos, jwt(uid), mask)
  const ok = st === esperado
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${desc}: ${st} (esperado ${esperado})`)
}
console.log(fallos ? `${fallos} FALLOS` : `TODOS OK (${casos.length})`)
process.exit(fallos ? 1 : 0)
