/**
 * Espejo del grader (E1): lógica PURA de la ingesta. Sin Firebase.
 * Contrato: `espejo-grader-e1-contrato.md` (sesión #459).
 */
const { createHash } = require('crypto')

const VERSION_CUERPO = 1
const MAX_FILAS = 2000
const MAX_LARGO_FILA = 300
const CAMPOS_FILA = 12
const MAX_DOCUMENTOS = 400 // fechas + horas distintas por envío (ops del batch ≤ 402 < 500)
const MAX_CLAVES_ESTADO = 20
const MAX_TEXTO_ESTADO = 200
const MAX_LISTA_ESTADO = 4
const MAX_LISTA_ITEM = 200

// Índices de Fecha y Hora dentro de la fila (las 11 celdas van antes de #n)
const INDICES = {
  pieza: { fecha: 0, hora: 1 },
  p0: { fecha: 2, hora: 3 },
}

const RE_LLAVE_HEADER = /^Bearer ([A-Za-z0-9_-]{43})$/
const RE_EQUIPO = /^[A-Za-z0-9_-]{1,40}$/
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^\d{2}:\d{2}:\d{2}$/
const RE_ORDINAL = /^#\d{1,4}$/
const RE_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/

function hashLlave(llave) {
  return createHash('sha256').update(String(llave), 'utf8').digest('hex')
}

// Devuelve la llave (43 base64url) o null si la cabecera no tiene ese formato.
function extraerLlave(headerAuthorization) {
  if (typeof headerAuthorization !== 'string') return null
  const m = RE_LLAVE_HEADER.exec(headerAuthorization)
  return m ? m[1] : null
}

function esObjetoPlano(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function valorEstadoValido(v) {
  if (typeof v === 'string') return v.length <= MAX_TEXTO_ESTADO
  if (typeof v === 'number') return Number.isFinite(v)
  if (typeof v === 'boolean') return true
  if (Array.isArray(v)) {
    return v.length <= MAX_LISTA_ESTADO
      && v.every((x) => typeof x === 'string' && x.length <= MAX_LISTA_ITEM)
  }
  return false
}

function validarFila(fila, informe) {
  if (typeof fila !== 'string') return 'fila no es texto'
  if (fila.length > MAX_LARGO_FILA) return 'fila demasiado larga'
  const celdas = fila.split('\t')
  if (celdas.length !== CAMPOS_FILA) return `fila con ${celdas.length} campos`
  if (!RE_ORDINAL.test(celdas[CAMPOS_FILA - 1])) return 'ordinal #n no válido'
  const { fecha, hora } = INDICES[informe]
  if (!RE_FECHA.test(celdas[fecha])) return 'fecha no válida'
  if (!RE_HORA.test(celdas[hora])) return 'hora no válida'
  return null
}

/**
 * Valida el cuerpo completo del POST.
 * @returns {{ok: true, datos: object} | {ok: false, error: string}}
 */
function validarCuerpo(body) {
  if (!esObjetoPlano(body)) return { ok: false, error: 'cuerpo no es objeto' }
  if (body.v !== VERSION_CUERPO) return { ok: false, error: 'versión no soportada' }
  if (typeof body.equipo !== 'string' || !RE_EQUIPO.test(body.equipo)) {
    return { ok: false, error: 'equipo no válido' }
  }
  if (body.informe !== 'pieza' && body.informe !== 'p0') {
    return { ok: false, error: 'informe no válido' }
  }
  if (typeof body.leidoEn !== 'string' || !RE_ISO.test(body.leidoEn)
      || Number.isNaN(Date.parse(body.leidoEn))) {
    return { ok: false, error: 'leidoEn no válido' }
  }
  if (!Array.isArray(body.filas)) return { ok: false, error: 'filas no es lista' }
  if (body.filas.length > MAX_FILAS) return { ok: false, error: 'demasiadas filas' }
  for (let i = 0; i < body.filas.length; i++) {
    const motivo = validarFila(body.filas[i], body.informe)
    if (motivo) return { ok: false, error: `fila ${i}: ${motivo}` }
  }
  if (!esObjetoPlano(body.estado)) return { ok: false, error: 'estado no es objeto' }
  const claves = Object.keys(body.estado)
  if (claves.length > MAX_CLAVES_ESTADO) return { ok: false, error: 'estado con demasiadas claves' }
  for (const k of claves) {
    if (!valorEstadoValido(body.estado[k])) return { ok: false, error: `estado.${k} no válido` }
  }
  return {
    ok: true,
    datos: {
      v: body.v,
      equipo: body.equipo,
      informe: body.informe,
      leidoEn: body.leidoEn,
      filas: body.filas,
      estado: body.estado,
    },
  }
}

/**
 * Agrupa filas ya validadas por (fecha, HH). Orden: primera aparición.
 * @returns {Array<{fecha: string, hora: string, filas: string[]}>}
 */
function agruparPorDiaHora(informe, filas) {
  const { fecha: iFecha, hora: iHora } = INDICES[informe]
  const grupos = new Map()
  for (const fila of filas) {
    const celdas = fila.split('\t')
    const fecha = celdas[iFecha]
    const hora = celdas[iHora].slice(0, 2)
    const clave = `${fecha}|${hora}`
    if (!grupos.has(clave)) grupos.set(clave, { fecha, hora, filas: [] })
    grupos.get(clave).filas.push(fila)
  }
  return [...grupos.values()]
}

/** Documentos distintos que tocará el envío: un padre por fecha + un hijo por hora. */
function contarDocumentos(grupos) {
  const fechas = new Set(grupos.map((g) => g.fecha))
  return fechas.size + grupos.length
}

module.exports = {
  VERSION_CUERPO,
  MAX_FILAS,
  MAX_LARGO_FILA,
  CAMPOS_FILA,
  MAX_DOCUMENTOS,
  hashLlave,
  extraerLlave,
  validarCuerpo,
  agruparPorDiaHora,
  contarDocumentos,
}
