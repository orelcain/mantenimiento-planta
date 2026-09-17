/**
 * Índice liviano del maestro de repuestos para la bitácora (17-09-2026).
 *
 * Un solo documento `repuestosIndice/sap` con `m: { [codigoSAP]: [nombreSAP, nombreComun] }`
 * para los materiales con código SAP (~3.800, ~150 KB). La app lo baja una vez por
 * sesión y busca en el teléfono; sin él, «buscar en todos» obligaba a bajar el
 * maestro entero (7.700 documentos) en cada teléfono.
 *
 * Se mantiene con un trigger sobre `repuestos/{id}` que escribe SOLO la entrada
 * que cambió (y sale temprano si no cambió nada: regla de costos). La primera
 * carga la hace `scripts/normalizacion/construir-indice-repuestos.cjs`.
 *
 * Sin dependencias de firebase: lógica pura para `node --test`.
 */
const COLECCION = 'repuestosIndice'
const DOC = 'sap'

function esSap(codigo) {
  return /^\d{6,12}$/.test(String(codigo ?? ''))
}

/** La entrada del índice para un documento del maestro, o null si no lleva SAP. */
function entradaDe(d) {
  if (!d || !esSap(d.codigoSAP)) return null
  const nombre = String(d.textoBreve || d.descripcion || d.alias || d.nombreManual || '').trim().slice(0, 120)
  const comun = Array.isArray(d.nombresComunes) ? String(d.nombresComunes[0] ?? '').trim().slice(0, 80) : ''
  return [nombre, comun]
}

/**
 * Qué escribir en el índice cuando `repuestos/{id}` pasa de `antes` a `despues`.
 * Devuelve `{ [campo]: valor | 'BORRAR' }` con rutas `m.<sap>`, o null si nada cambió.
 */
function cambiosIndice(antes, despues) {
  const a = entradaDe(antes)
  const b = entradaDe(despues)
  const sapA = a ? String(antes.codigoSAP) : null
  const sapB = b ? String(despues.codigoSAP) : null
  const cambios = {}
  if (sapA && sapA !== sapB) cambios[`m.${sapA}`] = 'BORRAR'
  if (sapB && (!a || sapA !== sapB || a[0] !== b[0] || a[1] !== b[1])) cambios[`m.${sapB}`] = b
  return Object.keys(cambios).length ? cambios : null
}

/** El índice completo a partir de todos los documentos (para construirlo de cero). */
function construirIndice(docs) {
  const m = {}
  for (const d of docs) {
    const e = entradaDe(d)
    if (e) m[String(d.codigoSAP)] = e
  }
  return m
}

module.exports = { COLECCION, DOC, esSap, entradaDe, cambiosIndice, construirIndice }
