/**
 * Espejo del grader (E1): lógica PURA de la ingesta. Sin Firebase.
 * Contrato: `espejo-grader-e1-contrato.md` (sesión #459).
 */
const { createHash, randomBytes } = require('crypto')
const fs = require('fs')
const path = require('path')

const VERSION_CUERPO = 1
const MAX_FILAS = 2000
const MAX_LARGO_FILA = 300
const CAMPOS_FILA = 12
const MAX_DOCUMENTOS = 400 // fechas + horas distintas por envío (ops del batch ≤ 402 < 500)
// e1.7 suma «pantalla», «matrix» y «huecos» (23); queda una de holgura.
const MAX_CLAVES_ESTADO = 24
const MAX_TEXTO_ESTADO = 200
const MAX_LISTA_ESTADO = 4
const MAX_LISTA_ITEM = 200

// Índices de Fecha y Hora dentro de la fila (las 11 celdas van antes de #n)
const INDICES = {
  pieza: { fecha: 0, hora: 1 },
  p0: { fecha: 2, hora: 3 },
}

// E1.3: código de alta de un solo uso (mismo formato que la llave) y versión del lector.
const RE_ALTA = /^[A-Za-z0-9_-]{43}$/
const RE_VERSION = /^e\d{1,2}(\.\d{1,2}){1,2}$/
// La vigencia sale de `creadaEn` (hora del servidor): el reloj del PC del admin no influye.
const VIGENCIA_ALTA_MS = 25 * 60 * 1000
const LECTOR_RUTA = path.join(__dirname, 'espejo', 'lector-espejo.ps1')

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


/** Llave nueva: 32 bytes aleatorios en base64url (43 caracteres). */
function generarLlave() {
  return randomBytes(32).toString('base64url')
}

/**
 * Cuerpo del canje de alta: `{ v: 1, alta: '<43>', equipo }` (sin Authorization).
 * @returns {{ok: true, codigo: string, equipo: string} | {ok: false, error: string}}
 */
function validarAlta(body) {
  if (!esObjetoPlano(body)) return { ok: false, error: 'cuerpo no es objeto' }
  if (body.v !== VERSION_CUERPO) return { ok: false, error: 'versión no soportada' }
  if (typeof body.alta !== 'string' || !RE_ALTA.test(body.alta)) return { ok: false, error: 'código de alta mal formado' }
  if (typeof body.equipo !== 'string' || !RE_EQUIPO.test(body.equipo)) return { ok: false, error: 'equipo no válido' }
  return { ok: true, codigo: body.alta, equipo: body.equipo }
}

/**
 * ¿Se puede canjear este documento de alta? '' si sí; si no, el motivo.
 * `creadaEnMs` = creadaEn del servidor en milisegundos (Timestamp.toMillis()).
 */
function motivoAltaNoVigente(doc, ahoraMs) {
  if (!doc) return 'código desconocido'
  if (doc.usada === true) return 'código ya usado'
  if (typeof doc.creadaEnMs !== 'number') return 'código vencido'
  if (doc.creadaEnMs > ahoraMs + 60 * 1000) return 'código con fecha no válida'
  if (ahoraMs - doc.creadaEnMs >= VIGENCIA_ALTA_MS) return 'código vencido'
  return ''
}

/** Versión declarada en el texto del lector (`$VERSION = 'e1.3'`), o null. */
function versionDeLector(texto) {
  const m = /^\$VERSION = '(e[0-9.]+)'\r?$/m.exec(String(texto))
  return m && RE_VERSION.test(m[1]) ? m[1] : null
}

/**
 * El lector que va dentro de esta función: bytes EXACTOS que se sirven, su sha256 y su versión.
 * El hash se calcula sobre esos mismos bytes, así el lector verifica lo que de verdad recibió.
 */
function lectorIncluido(ruta = LECTOR_RUTA) {
  const bytes = fs.readFileSync(ruta)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return { bytes, sha256, version: versionDeLector(bytes.toString('utf8')) }
}

/**
 * Qué versión debe correr en planta. Solo hay actualización si un admin publicó EXACTAMENTE la versión
 * que trae esta función (un merge no cambia nada en planta hasta que se pulsa «Publicar»).
 * @returns {{version: string, sha256: string} | null}
 */
function actualizacionVigente(publicado, incluido) {
  if (!publicado || !incluido || !incluido.version) return null
  if (publicado.version !== incluido.version) return null
  return { version: incluido.version, sha256: incluido.sha256 }
}

// E1.4: lectura en vivo a pedido. El monitor escribe graderEspejoControl/{linea} con `hasta`; la función lo
// devuelve en la respuesta de cada envío y el lector baja su espera a 60 s mientras siga vigente.
const VIVO_MAX_MS = 30 * 60 * 1000

/**
 * Lectura en vivo vigente según el documento de control. `hastaMs` = hasta del documento en milisegundos
 * (Timestamp.toMillis()). Devuelve el fin en ISO (hora del servidor) y los segundos que faltan: el lector arma su
 * plazo con los segundos, así el reloj del PC de planta no influye. Un `hasta` vencido o a más de 30 min no vale
 * (las reglas ya lo impiden; esto cubre un documento escrito por otro camino).
 * @returns {{vivoHasta: string, vivoSeg: number} | null}
 */
function vivoDeControl(hastaMs, ahoraMs) {
  if (typeof hastaMs !== 'number' || !Number.isFinite(hastaMs)) return null
  if (typeof ahoraMs !== 'number' || !Number.isFinite(ahoraMs)) return null
  const falta = hastaMs - ahoraMs
  if (falta <= 0 || falta > VIVO_MAX_MS + 60 * 1000) return null
  const seg = Math.ceil(falta / 1000)
  return { vivoHasta: new Date(hastaMs).toISOString(), vivoSeg: seg }
}

// e1.7: el lector compara las filas por hora de Matrix con las del espejo para rellenar huecos. Pide los conteos con
// GET ?conteos=AAAA-MM-DD[,AAAA-MM-DD…]: como mucho 8 fechas distintas (el lector revisa hasta 7 días).
const MAX_FECHAS_CONTEOS = 8
const RE_FECHA_CONTEOS = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valida la lista de fechas de una consulta de conteos.
 * @returns {{ok: true, fechas: string[]} | {ok: false, error: string}}
 */
function validarConteos(q) {
  if (typeof q !== 'string' || !q) return { ok: false, error: 'conteos sin fechas' }
  const fechas = [...new Set(q.split(','))]
  if (fechas.length > MAX_FECHAS_CONTEOS) return { ok: false, error: 'demasiadas fechas' }
  for (const f of fechas) {
    if (!RE_FECHA_CONTEOS.test(f) || Number.isNaN(Date.parse(`${f}T00:00:00Z`))) return { ok: false, error: 'fecha no válida' }
  }
  return { ok: true, fechas }
}

/**
 * Filas por hora de un día del espejo: { 'HH': n } a partir de los documentos `horas` ({ id, filas }). Las horas vacías
 * no salen. n = filas distintas guardadas (arrayUnion), lo mismo que cuenta el lector en la tabla de Matrix.
 */
function conteoPorHora(docs) {
  const out = {}
  for (const d of docs || []) {
    if (!d || typeof d.id !== 'string' || !/^\d{2}$/.test(d.id)) continue
    const n = Array.isArray(d.filas) ? d.filas.length : 0
    if (n > 0) out[d.id] = n
  }
  return out
}

module.exports = {
  MAX_CLAVES_ESTADO,
  MAX_FECHAS_CONTEOS,
  validarConteos,
  conteoPorHora,
  VIVO_MAX_MS,
  vivoDeControl,
  RE_VERSION,
  VIGENCIA_ALTA_MS,
  LECTOR_RUTA,
  generarLlave,
  validarAlta,
  motivoAltaNoVigente,
  versionDeLector,
  lectorIncluido,
  actualizacionVigente,
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
