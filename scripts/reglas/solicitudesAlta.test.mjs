// Uso (desde la raíz del repo): npx firebase-tools@14 emulators:exec --only firestore --project demo-rules "node scripts/reglas/solicitudesAlta.test.mjs"
// Prueba de las reglas de solicitudes_repuestos (alta de código A3C + pedidos normales sin `tipo`) contra el emulador, por REST.
// Auth: JWT sin firma (el emulador lo acepta). `Bearer owner` salta las reglas (para sembrar users/ y docs previos).
const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const BASE = `http://${HOST}/v1/projects/demo-rules/databases/(default)/documents`
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (uid) =>
  `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ user_id: uid, sub: uid, aud: 'demo-rules', firebase: { sign_in_provider: 'password' } })}.`

const val = (v) =>
  typeof v === 'string' ? { stringValue: v }
    : v === true ? { booleanValue: true }
      : Number.isInteger(v) ? { integerValue: String(v) }
        : typeof v === 'number' ? { doubleValue: v }
          : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
            : { stringValue: String(v) }
const fields = (o) => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)])) })

async function put(path, data, token) {
  const r = await fetch(`${BASE}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields(data)),
  })
  return r.status
}

// u1 = técnico (bodega) · u2 = usuario común activo · u3 = otro usuario común activo
await put('users/u1', { activo: true, rol: 'tecnico' }, 'owner')
await put('users/u2', { activo: true, rol: 'usuario' }, 'owner')
await put('users/u3', { activo: true, rol: 'usuario' }, 'owner')

// codigoNorm = normCodigo del cliente (mayúsculas sin separadores); la regla ata el id a él.
const norm = (c) => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '')
const alta = (extra = {}) => {
  const d = {
    tipo: 'alta_codigo', codigoFabricante: '42203183', codigoSAP: '', textoBreve: 'Relé en miniatura 24V DC',
    elemento: 'K20', elementos: ['K20', 'K22'], cantidad: 1, estado: 'pendiente',
    solicitadoPor: 'u2', solicitadoPorNombre: 'Danilo', ...extra,
  }
  return { ...d, codigoNorm: extra.codigoNorm ?? norm(d.codigoFabricante) }
}
const normal = (extra = {}) => ({
  codigoSAP: '3300080929', textoBreve: 'MODULO RELE 42203310', cantidad: 2, estado: 'pendiente',
  solicitadoPor: 'u2', solicitadoPorNombre: 'Ana', ...extra,
})

// Siembra (sin reglas) para los casos de actualización.
await put('solicitudes_repuestos/alta_RES1', alta({ codigoFabricante: 'RES1' }), 'owner')
await put('solicitudes_repuestos/alta_RES2', alta({ codigoFabricante: 'RES2' }), 'owner')
await put('solicitudes_repuestos/alta_RES3', alta({ codigoFabricante: 'RES3' }), 'owner')
await put('solicitudes_repuestos/alta_RES4', alta({ codigoFabricante: 'RES4' }), 'owner')
await put('solicitudes_repuestos/alta_REC1', alta({ codigoFabricante: 'REC1', estado: 'rechazada', motivoRechazo: 'Falta foto', rechazadaPor: 'u1', rechazadaPorNombre: 'Pedro' }), 'owner')
await put('solicitudes_repuestos/alta_REC2', alta({ codigoFabricante: 'REC2', estado: 'rechazada', motivoRechazo: 'Falta foto', rechazadaPor: 'u1', rechazadaPorNombre: 'Pedro' }), 'owner')
await put('solicitudes_repuestos/alta_REC3', alta({ codigoFabricante: 'REC3', estado: 'rechazada', motivoRechazo: 'Falta foto', rechazadaPor: 'u1', rechazadaPorNombre: 'Pedro' }), 'owner')
await put('solicitudes_repuestos/alta_REC4', alta({ codigoFabricante: 'REC4', estado: 'rechazada', motivoRechazo: 'Falta foto', rechazadaPor: 'u1', rechazadaPorNombre: 'Pedro' }), 'owner')
await put('solicitudes_repuestos/alta_RES5', alta({ codigoFabricante: 'RES5' }), 'owner')
await put('solicitudes_repuestos/alta_RES6', alta({ codigoFabricante: 'RES6' }), 'owner')
await put('solicitudes_repuestos/alta_CRE1', alta({ codigoFabricante: 'CRE1', estado: 'creada', sapCreado: '3300112345', codigoSAP: '3300112345', origenSap: 'nuevo', creadaPor: 'u1' }), 'owner')
await put('solicitudes_repuestos/pedido1', normal(), 'owner')
await put('solicitudes_repuestos/pedido2', normal({ estado: 'aprobada' }), 'owner')

const creada = (base, extra = {}) => ({
  ...base, estado: 'creada', sapCreado: '3300112345', codigoSAP: '3300112345', origenSap: 'nuevo',
  creadaPor: 'u1', creadaPorNombre: 'Pedro', ...extra,
})

const casos = [
  // [descripción, path, datos, usuario, esperado]
  // ── Crear ──
  ['alta válida (id alta_<CODIGO>)', 'solicitudes_repuestos/alta_42203183', alta(), 'u2', 200],
  ['alta con id sin el prefijo alta_', 'solicitudes_repuestos/42203184', alta({ codigoFabricante: '42203184' }), 'u2', 403],
  ['alta con id en minúsculas', 'solicitudes_repuestos/alta_abc', alta({ codigoFabricante: 'abc' }), 'u2', 403],
  ['alta con SAP no vacío al crear', 'solicitudes_repuestos/alta_42203185', alta({ codigoFabricante: '42203185', codigoSAP: '3300112345' }), 'u2', 403],
  ['alta a nombre de otro solicitante', 'solicitudes_repuestos/alta_42203186', alta({ codigoFabricante: '42203186', solicitadoPor: 'u3' }), 'u2', 403],
  ['alta con cantidad 0', 'solicitudes_repuestos/alta_42203187', alta({ codigoFabricante: '42203187', cantidad: 0 }), 'u2', 403],
  ['alta con cantidad 1000', 'solicitudes_repuestos/alta_42203188', alta({ codigoFabricante: '42203188', cantidad: 1000 }), 'u2', 403],
  ['alta con cantidad decimal', 'solicitudes_repuestos/alta_42203189', alta({ codigoFabricante: '42203189', cantidad: 1.5 }), 'u2', 403],
  ['alta con codigoFabricante vacío', 'solicitudes_repuestos/alta_', alta({ codigoFabricante: '' }), 'u2', 403],
  ['alta ya creada como estado (no pendiente)', 'solicitudes_repuestos/alta_42203190', alta({ codigoFabricante: '42203190', estado: 'creada' }), 'u2', 403],
  // ── Crear: id atado al código y lista exacta de campos ──
  ['id alta_XYZ con codigoFabricante ABC (el id no corresponde al código)', 'solicitudes_repuestos/alta_XYZ', alta({ codigoFabricante: 'ABC' }), 'u2', 403],
  ['id alta_ABC con codigoFabricante ABC y codigoNorm ABC', 'solicitudes_repuestos/alta_ABC', alta({ codigoFabricante: 'ABC' }), 'u2', 200],
  ['segunda alta del mismo fabricante ABC con otro id', 'solicitudes_repuestos/alta_ABC2', alta({ codigoFabricante: 'ABC' }), 'u2', 403],
  ['codigoNorm con minúsculas o separadores', 'solicitudes_repuestos/alta_ab-1', alta({ codigoFabricante: 'ab-1', codigoNorm: 'ab-1' }), 'u2', 403],
  ['codigoNorm que no corresponde al fabricante (alta_XYZ, fabricante ABC, codigoNorm XYZ)', 'solicitudes_repuestos/alta_XYZ', alta({ codigoFabricante: 'ABC', codigoNorm: 'XYZ' }), 'u2', 403],
  ['fabricante con separadores y minúsculas: codigoNorm = normalizado (alta_4220A3183)', 'solicitudes_repuestos/alta_4220A3183', alta({ codigoFabricante: '4220-a3183' }), 'u2', 200],
  ['fabricante con separadores pero codigoNorm sin normalizar', 'solicitudes_repuestos/alta_42203190', alta({ codigoFabricante: '4220-3190', codigoNorm: '4220-3190' }), 'u2', 403],
  ['sin codigoNorm', 'solicitudes_repuestos/alta_NN1', (() => { const d = alta({ codigoFabricante: 'NN1' }); delete d.codigoNorm; return d })(), 'u2', 403],
  ['create con sapCreado inyectado', 'solicitudes_repuestos/alta_INY1', alta({ codigoFabricante: 'INY1', sapCreado: '3300112345' }), 'u2', 403],
  ['create con origenSap inyectado', 'solicitudes_repuestos/alta_INY2', alta({ codigoFabricante: 'INY2', origenSap: 'nuevo' }), 'u2', 403],
  ['create con rechazadaPorNombre inyectado', 'solicitudes_repuestos/alta_INY3', alta({ codigoFabricante: 'INY3', rechazadaPorNombre: 'Pedro' }), 'u2', 403],
  ['create con creadaPor inyectado', 'solicitudes_repuestos/alta_INY4', alta({ codigoFabricante: 'INY4', creadaPor: 'u1' }), 'u2', 403],
  ['create con un campo cualquiera fuera de la lista', 'solicitudes_repuestos/alta_INY5', alta({ codigoFabricante: 'INY5', esAdmin: true }), 'u2', 403],
  // ── Resolver (bodega) ──
  ['técnico registra «creada» con SAP de 10 dígitos', 'solicitudes_repuestos/alta_RES1', creada(alta({ codigoFabricante: 'RES1' })), 'u1', 200],
  ['técnico registra «creada» (ya existía)', 'solicitudes_repuestos/alta_RES4', creada(alta({ codigoFabricante: 'RES4' }), { origenSap: 'ya_existia' }), 'u1', 200],
  ['solicitante no técnico intenta «creada»', 'solicitudes_repuestos/alta_RES2', creada(alta({ codigoFabricante: 'RES2' })), 'u2', 403],
  ['técnico con SAP de 9 dígitos', 'solicitudes_repuestos/alta_RES2', creada(alta({ codigoFabricante: 'RES2' }), { sapCreado: '330011234', codigoSAP: '330011234' }), 'u1', 403],
  ['técnico con SAP con letras', 'solicitudes_repuestos/alta_RES2', creada(alta({ codigoFabricante: 'RES2' }), { sapCreado: '33001123AB', codigoSAP: '33001123AB' }), 'u1', 403],
  ['técnico con origenSap inventado', 'solicitudes_repuestos/alta_RES2', creada(alta({ codigoFabricante: 'RES2' }), { origenSap: 'otro' }), 'u1', 403],
  ['técnico con «creada» que además cambia la cantidad', 'solicitudes_repuestos/alta_RES2', creada(alta({ codigoFabricante: 'RES2' }), { cantidad: 5 }), 'u1', 403],
  ['técnico firma «creada» a nombre de otro (creadaPor ajeno)', 'solicitudes_repuestos/alta_RES5', creada(alta({ codigoFabricante: 'RES5' }), { creadaPor: 'u9' }), 'u1', 403],
  ['técnico rechaza a nombre de otro (rechazadaPor ajeno)', 'solicitudes_repuestos/alta_RES6', alta({ codigoFabricante: 'RES6', estado: 'rechazada', motivoRechazo: 'No', rechazadaPor: 'u9', rechazadaPorNombre: 'Otro' }), 'u1', 403],
  ['técnico rechaza con motivo', 'solicitudes_repuestos/alta_RES3', alta({ codigoFabricante: 'RES3', estado: 'rechazada', motivoRechazo: 'Falta foto de la etiqueta', rechazadaPor: 'u1', rechazadaPorNombre: 'Pedro' }), 'u1', 200],
  ['técnico rechaza SIN motivo', 'solicitudes_repuestos/alta_RES2', alta({ codigoFabricante: 'RES2', estado: 'rechazada', motivoRechazo: '', rechazadaPor: 'u1' }), 'u1', 403],
  ['técnico rechaza con motivo de 301 caracteres', 'solicitudes_repuestos/alta_RES2', alta({ codigoFabricante: 'RES2', estado: 'rechazada', motivoRechazo: 'x'.repeat(301), rechazadaPor: 'u1' }), 'u1', 403],
  ['no técnico rechaza', 'solicitudes_repuestos/alta_RES2', alta({ codigoFabricante: 'RES2', estado: 'rechazada', motivoRechazo: 'No', rechazadaPor: 'u2' }), 'u2', 403],
  ['técnico vuelve «creada» una ya creada (cambia SAP)', 'solicitudes_repuestos/alta_CRE1', creada(alta({ codigoFabricante: 'CRE1', estado: 'creada' }), { sapCreado: '3300999999', codigoSAP: '3300999999' }), 'u1', 403],
  // ── Reabrir ──
  ['solicitante reabre su rechazada', 'solicitudes_repuestos/alta_REC1', alta({ codigoFabricante: 'REC1', estado: 'pendiente', solicitadoPor: 'u2', solicitadoPorNombre: 'Danilo', observaciones: 'Con foto' }), 'u2', 200],
  ['otro usuario activo reabre y pasa a ser el solicitante', 'solicitudes_repuestos/alta_REC2', alta({ codigoFabricante: 'REC2', estado: 'pendiente', solicitadoPor: 'u3', solicitadoPorNombre: 'Ana' }), 'u3', 200],
  ['reabrir SIN limpiar el rechazo (queda motivoRechazo)', 'solicitudes_repuestos/alta_REC4', alta({ codigoFabricante: 'REC4', estado: 'pendiente', solicitadoPor: 'u3', solicitadoPorNombre: 'Ana', motivoRechazo: 'Falta foto' }), 'u3', 403],
  ['reabrir SIN limpiar quién rechazó (queda rechazadaPor)', 'solicitudes_repuestos/alta_REC4', alta({ codigoFabricante: 'REC4', estado: 'pendiente', solicitadoPor: 'u3', solicitadoPorNombre: 'Ana', rechazadaPor: 'u1' }), 'u3', 403],
  ['reabrir poniendo a otro como solicitante', 'solicitudes_repuestos/alta_REC3', alta({ codigoFabricante: 'REC3', estado: 'pendiente', solicitadoPor: 'u1' }), 'u3', 403],
  ['reabrir una pendiente (no estaba rechazada)', 'solicitudes_repuestos/alta_RES2', alta({ codigoFabricante: 'RES2', estado: 'pendiente', solicitadoPor: 'u3' }), 'u3', 403],
  // ── Pedidos normales (sin tipo): igual que antes ──
  ['pedido normal: crear', 'solicitudes_repuestos/nuevo1', normal(), 'u2', 200],
  ['pedido normal: crear con id libre y SAP no vacío', 'solicitudes_repuestos/nuevo2', normal({ codigoSAP: '3300054757' }), 'u2', 200],
  ['pedido normal: crear a nombre de otro', 'solicitudes_repuestos/nuevo3', normal({ solicitadoPor: 'u3' }), 'u2', 403],
  ['pedido normal: técnico aprueba', 'solicitudes_repuestos/pedido1', normal({ estado: 'aprobada', aprobadaPor: 'Pedro' }), 'u1', 200],
  ['pedido normal: técnico entrega', 'solicitudes_repuestos/pedido2', normal({ estado: 'entregada', entregadaPor: 'Pedro' }), 'u1', 200],
  ['pedido normal: no técnico aprueba', 'solicitudes_repuestos/nuevo1', normal({ estado: 'aprobada' }), 'u2', 403],
  ['pedido normal: técnico lo convierte en alta (cambia tipo)', 'solicitudes_repuestos/nuevo2', { ...normal({ codigoSAP: '3300054757' }), tipo: 'alta_codigo' }, 'u1', 403],
]

let fallos = 0
for (const [desc, path, datos, uid, esperado] of casos) {
  const st = await put(path, datos, jwt(uid))
  const ok = st === esperado
  if (!ok) fallos++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${desc}: ${st} (esperado ${esperado})`)
}
console.log(fallos ? `${fallos} FALLOS` : `TODOS OK (${casos.length})`)
process.exit(fallos ? 1 : 0)
