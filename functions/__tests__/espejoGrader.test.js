/**
 * Espejo del grader (E1): llave, hash, validación de cuerpo (una prueba por cota) y agrupado.
 */
const { test } = require('node:test')
const assert = require('node:assert')

const espejo = require('../espejoGrader')

const LLAVE_OK = 'A'.repeat(43)

function filaPieza(sobrescribir = {}) {
  const celdas = ['2026-11-19', '00:02:39', '4,32 kg', '1', '720.260.738', '9', 'Premium',
    'CONGELADO', '8 - 10 LB', 'HG', 'A', '#0']
  for (const [i, v] of Object.entries(sobrescribir)) celdas[Number(i)] = v
  return celdas.join('\t')
}

function filaP0(sobrescribir = {}) {
  const celdas = ['Salmón', 'L1', '2026-11-19', '07:15:00', 'A', '1', '1', 'Premium', '4,3', '', '4300', '#0']
  for (const [i, v] of Object.entries(sobrescribir)) celdas[Number(i)] = v
  return celdas.join('\t')
}

function cuerpo(sobrescribir = {}) {
  return {
    v: 1,
    equipo: 'CH-MANT-P07',
    informe: 'pieza',
    leidoEn: '2026-11-20T21:49:12-03:00',
    filas: [filaPieza()],
    estado: { version: 'e1.0', filasTabla: 10000, piezas: 9998, limite: true, rango: ['a', 'b'] },
    ...sobrescribir,
  }
}

function errorDe(body) {
  const r = espejo.validarCuerpo(body)
  assert.strictEqual(r.ok, false, 'debía rechazarse')
  return r.error
}

// ---------- llave ----------

test('extraerLlave acepta 43 caracteres base64url', () => {
  assert.strictEqual(espejo.extraerLlave(`Bearer ${LLAVE_OK}`), LLAVE_OK)
  assert.strictEqual(espejo.extraerLlave(`Bearer ${'a-_9'.repeat(10)}abc`), `${'a-_9'.repeat(10)}abc`)
})

test('extraerLlave rechaza llave mal formada o cabecera ausente', () => {
  assert.strictEqual(espejo.extraerLlave(`Bearer ${'A'.repeat(42)}`), null, '42 caracteres')
  assert.strictEqual(espejo.extraerLlave(`Bearer ${'A'.repeat(44)}`), null, '44 caracteres')
  assert.strictEqual(espejo.extraerLlave(`Bearer ${'A'.repeat(42)}+`), null, 'signo más no es base64url')
  assert.strictEqual(espejo.extraerLlave(`Basic ${LLAVE_OK}`), null, 'esquema distinto')
  assert.strictEqual(espejo.extraerLlave(undefined), null)
  assert.strictEqual(espejo.extraerLlave(''), null)
})

test('hashLlave es sha256 hex estable y distinto por llave', () => {
  assert.strictEqual(espejo.hashLlave('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  const h1 = espejo.hashLlave(LLAVE_OK)
  assert.strictEqual(h1, espejo.hashLlave(LLAVE_OK))
  assert.match(h1, /^[0-9a-f]{64}$/)
  assert.notStrictEqual(h1, espejo.hashLlave('B'.repeat(43)))
})

// ---------- cuerpo válido ----------

test('cuerpo válido de pieza se acepta y conserva los campos', () => {
  const r = espejo.validarCuerpo(cuerpo())
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.datos.equipo, 'CH-MANT-P07')
  assert.strictEqual(r.datos.filas.length, 1)
})

test('cuerpo válido sin filas (solo latido) se acepta', () => {
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ filas: [] })).ok, true)
})

test('cuerpo válido de p0 se acepta con Fecha e Hora en índices 2 y 3', () => {
  const r = espejo.validarCuerpo(cuerpo({ informe: 'p0', filas: [filaP0()] }))
  assert.strictEqual(r.ok, true)
})

test('pieza y p0 usan índices distintos: una fila de p0 no pasa como pieza', () => {
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ informe: 'pieza', filas: [filaP0()] })).ok, false)
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ informe: 'p0', filas: [filaPieza()] })).ok, false)
})

test('cuerpo no objeto o versión distinta se rechaza', () => {
  assert.strictEqual(errorDe(null), 'cuerpo no es objeto')
  assert.strictEqual(errorDe([]), 'cuerpo no es objeto')
  assert.strictEqual(errorDe(cuerpo({ v: 2 })), 'versión no soportada')
})

// ---------- cotas: una por cada una ----------

test('cota filas: 2000 se acepta y 2001 se rechaza', () => {
  const dos000 = Array.from({ length: 2000 }, () => filaPieza())
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ filas: dos000 })).ok, true)
  const mas = [...dos000, filaPieza()]
  assert.strictEqual(errorDe(cuerpo({ filas: mas })), 'demasiadas filas')
})

test('cota fila larga: más de 300 caracteres se rechaza', () => {
  const larga = filaPieza({ 2: 'x'.repeat(300) })
  assert.ok(larga.length > 300)
  assert.strictEqual(errorDe(cuerpo({ filas: [larga] })), 'fila 0: fila demasiado larga')
  const justa = filaPieza({ 2: 'x'.repeat(300 - (filaPieza().length - '4,32 kg'.length)) })
  assert.strictEqual(justa.length, 300)
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ filas: [justa] })).ok, true)
})

test('cota campos: 11 campos se rechaza', () => {
  const once = filaPieza().split('\t').slice(0, 11).join('\t')
  assert.strictEqual(errorDe(cuerpo({ filas: [once] })), 'fila 0: fila con 11 campos')
})

test('cota campos: 13 campos se rechaza', () => {
  const trece = filaPieza() + '\tExtra'
  assert.strictEqual(errorDe(cuerpo({ filas: [trece] })), 'fila 0: fila con 13 campos')
})

test('cota ordinal: #x, 0 sin almohadilla y más de 4 dígitos se rechazan', () => {
  for (const malo of ['#x', '0', '#12345', '#']) {
    assert.strictEqual(errorDe(cuerpo({ filas: [filaPieza({ 11: malo })] })),
      'fila 0: ordinal #n no válido', `ordinal ${malo}`)
  }
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ filas: [filaPieza({ 11: '#1234' })] })).ok, true)
})

test('cota fecha: formato distinto a AAAA-MM-DD se rechaza', () => {
  assert.strictEqual(errorDe(cuerpo({ filas: [filaPieza({ 0: '2026/11/19' })] })),
    'fila 0: fecha no válida')
})

test('cota hora: formato distinto a HH:MM:SS se rechaza', () => {
  assert.strictEqual(errorDe(cuerpo({ filas: [filaPieza({ 1: '0:02:39' })] })),
    'fila 0: hora no válida')
})

test('cota informe: solo pieza o p0', () => {
  assert.strictEqual(errorDe(cuerpo({ informe: 'otra' })), 'informe no válido')
})

test('cota equipo: solo letras, números, guion y guion bajo, hasta 40', () => {
  assert.strictEqual(errorDe(cuerpo({ equipo: 'CH MANT' })), 'equipo no válido')
  assert.strictEqual(errorDe(cuerpo({ equipo: 'A'.repeat(41) })), 'equipo no válido')
  assert.strictEqual(errorDe(cuerpo({ equipo: '' })), 'equipo no válido')
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ equipo: 'A'.repeat(40) })).ok, true)
})

test('cota leidoEn: debe ser ISO parseable', () => {
  assert.strictEqual(errorDe(cuerpo({ leidoEn: 'ayer' })), 'leidoEn no válido')
  assert.strictEqual(errorDe(cuerpo({ leidoEn: '2026-13-45T99:00:00Z' })), 'leidoEn no válido')
})

test('cota estado: más de 24 claves se rechaza (e1.7 sube el tope de 20 a 24)', () => {
  const estado = {}
  for (let i = 0; i < 25; i++) estado[`k${i}`] = i
  assert.strictEqual(errorDe(cuerpo({ estado })), 'estado con demasiadas claves')
  const veinticuatro = {}
  for (let i = 0; i < 24; i++) veinticuatro[`k${i}`] = i
  assert.strictEqual(espejo.validarCuerpo(cuerpo({ estado: veinticuatro })).ok, true)
})

test('cota estado: valor fuera de tipo o demasiado largo se rechaza', () => {
  assert.strictEqual(errorDe(cuerpo({ estado: { x: { anidado: 1 } } })), 'estado.x no válido')
  assert.strictEqual(errorDe(cuerpo({ estado: { x: 'a'.repeat(201) } })), 'estado.x no válido')
  assert.strictEqual(errorDe(cuerpo({ estado: { x: ['a', 'b', 'c', 'd', 'e'] } })), 'estado.x no válido')
})

// ---------- agrupado ----------

test('agruparPorDiaHora separa por fecha y hora en pieza', () => {
  const filas = [
    filaPieza({ 1: '00:02:39' }),
    filaPieza({ 1: '00:59:59', 4: '2' }),
    filaPieza({ 1: '01:00:01' }),
    filaPieza({ 0: '2026-11-20', 1: '00:10:00' }),
  ]
  const grupos = espejo.agruparPorDiaHora('pieza', filas)
  assert.deepStrictEqual(grupos.map((g) => [g.fecha, g.hora, g.filas.length]), [
    ['2026-11-19', '00', 2],
    ['2026-11-19', '01', 1],
    ['2026-11-20', '00', 1],
  ])
})

test('agruparPorDiaHora usa Fecha y Hora de p0 (índices 2 y 3)', () => {
  const filas = [
    filaP0({ 3: '07:15:00' }),
    filaP0({ 3: '07:59:00', 11: '#1' }),
    filaP0({ 2: '2026-11-18', 3: '23:00:00' }),
  ]
  const grupos = espejo.agruparPorDiaHora('p0', filas)
  assert.deepStrictEqual(grupos.map((g) => [g.fecha, g.hora, g.filas.length]), [
    ['2026-11-19', '07', 2],
    ['2026-11-18', '23', 1],
  ])
})

test('filas de dos días distintos generan documentos de cada día', () => {
  const filas = [filaPieza(), filaPieza({ 0: '2026-11-20' })]
  const grupos = espejo.agruparPorDiaHora('pieza', filas)
  assert.strictEqual(new Set(grupos.map((g) => g.fecha)).size, 2)
  assert.strictEqual(espejo.contarDocumentos(grupos), 4) // 2 padres + 2 horas
})

test('contarDocumentos: 17 días de 24 horas supera el tope de 400', () => {
  const filas = []
  for (let d = 1; d <= 17; d++) {
    const fecha = `2026-11-${String(d).padStart(2, '0')}`
    for (let h = 0; h < 24; h++) {
      filas.push(filaPieza({ 0: fecha, 1: `${String(h).padStart(2, '0')}:00:00` }))
    }
  }
  const grupos = espejo.agruparPorDiaHora('pieza', filas)
  const n = espejo.contarDocumentos(grupos)
  assert.strictEqual(n, 17 + 17 * 24)
  assert.ok(n > espejo.MAX_DOCUMENTOS)
})

// ---- E1.3: alta de un solo uso, versión publicada y lector incluido ----
const path = require('path')
const fs = require('fs')

test('alta: acepta {v:1, alta:43, equipo} y rechaza el resto', () => {
  assert.deepStrictEqual(espejo.validarAlta({ v: 1, alta: LLAVE_OK, equipo: 'CH-MANT-P07' }), { ok: true, codigo: LLAVE_OK, equipo: 'CH-MANT-P07' })
  assert.strictEqual(espejo.validarAlta({ v: 1, alta: 'corto', equipo: 'X' }).ok, false)
  assert.strictEqual(espejo.validarAlta({ v: 2, alta: LLAVE_OK, equipo: 'X' }).ok, false)
  assert.strictEqual(espejo.validarAlta({ v: 1, alta: LLAVE_OK, equipo: 'con espacio' }).ok, false)
  assert.strictEqual(espejo.validarAlta(null).ok, false)
})

test('alta: solo se canjea una vez y antes de vencer', () => {
  const ahora = 1_000_000_000
  const hace = (min) => ({ usada: false, creadaEnMs: ahora - min * 60_000 })
  assert.strictEqual(espejo.motivoAltaNoVigente(hace(1), ahora), '')
  assert.strictEqual(espejo.motivoAltaNoVigente(hace(24.9), ahora), '')
  assert.strictEqual(espejo.motivoAltaNoVigente(hace(25), ahora), 'código vencido')
  assert.strictEqual(espejo.motivoAltaNoVigente(hace(-5), ahora), 'código con fecha no válida')
  assert.strictEqual(espejo.motivoAltaNoVigente(null, ahora), 'código desconocido')
  assert.strictEqual(espejo.motivoAltaNoVigente({ usada: true, creadaEnMs: ahora }, ahora), 'código ya usado')
  assert.strictEqual(espejo.motivoAltaNoVigente({ usada: false, creadaEnMs: null }, ahora), 'código vencido')
})

test('llave generada: 43 base64url y distinta cada vez', () => {
  const a = espejo.generarLlave()
  assert.match(a, /^[A-Za-z0-9_-]{43}$/)
  assert.notStrictEqual(a, espejo.generarLlave())
})

test('versión del lector: lee la línea $VERSION exacta', () => {
  assert.strictEqual(espejo.versionDeLector("x\r\n$VERSION = 'e1.3'\r\ny"), 'e1.3')
  assert.strictEqual(espejo.versionDeLector("$VERSION = 'e1.10.2'"), 'e1.10.2')
  assert.strictEqual(espejo.versionDeLector("  $VERSION = 'e1.3'"), null)
  assert.strictEqual(espejo.versionDeLector("$VERSION = 'x1'"), null)
})

test('actualización: solo si un admin publicó EXACTAMENTE la versión incluida', () => {
  const incluido = { version: 'e1.3', sha256: 'a'.repeat(64) }
  assert.deepStrictEqual(espejo.actualizacionVigente({ version: 'e1.3' }, incluido), { version: 'e1.3', sha256: 'a'.repeat(64) })
  assert.strictEqual(espejo.actualizacionVigente({ version: 'e1.2' }, incluido), null)
  assert.strictEqual(espejo.actualizacionVigente(null, incluido), null)
  assert.strictEqual(espejo.actualizacionVigente({ version: 'e1.3' }, { version: null, sha256: 'x' }), null)
})

test('lector incluido: existe, declara su versión y el hash es de los bytes servidos', () => {
  const l = espejo.lectorIncluido()
  assert.match(l.version, espejo.RE_VERSION)
  const bytes = fs.readFileSync(path.join(__dirname, '..', 'espejo', 'lector-espejo.ps1'))
  assert.strictEqual(l.sha256, require('crypto').createHash('sha256').update(bytes).digest('hex'))
  assert.strictEqual(bytes[0], 0xef, 'con BOM UTF-8 para PowerShell 5.1')
})

// ---- E1.4: lectura en vivo a pedido ----
const AHORA = Date.UTC(2026, 10, 21, 14, 0, 0)

test('vivo: hasta en el futuro → fin ISO y segundos que faltan (redondeo hacia arriba)', () => {
  assert.deepStrictEqual(espejo.vivoDeControl(AHORA + 15 * 60 * 1000, AHORA), {
    vivoHasta: new Date(AHORA + 15 * 60 * 1000).toISOString(),
    vivoSeg: 900,
  })
  assert.strictEqual(espejo.vivoDeControl(AHORA + 1500, AHORA).vivoSeg, 2)
})

test('vivo: vencido, justo ahora o sin documento → null (vuelve a 5 min)', () => {
  assert.strictEqual(espejo.vivoDeControl(AHORA - 1, AHORA), null)
  assert.strictEqual(espejo.vivoDeControl(AHORA, AHORA), null)
  assert.strictEqual(espejo.vivoDeControl(null, AHORA), null)
  assert.strictEqual(espejo.vivoDeControl(undefined, AHORA), null)
  assert.strictEqual(espejo.vivoDeControl(Number.NaN, AHORA), null)
  assert.strictEqual(espejo.vivoDeControl('2026-11-21T14:15:00Z', AHORA), null)
})

test('vivo: más de 30 min (+1 min de holgura de reloj) no vale', () => {
  assert.ok(espejo.vivoDeControl(AHORA + 30 * 60 * 1000, AHORA))
  assert.ok(espejo.vivoDeControl(AHORA + 31 * 60 * 1000, AHORA))
  assert.strictEqual(espejo.vivoDeControl(AHORA + 31 * 60 * 1000 + 1, AHORA), null)
  assert.strictEqual(espejo.VIVO_MAX_MS, 30 * 60 * 1000)
})

// ---- e1.10: pedido manual de Puerta 0 y estado propio de Puerta 0 ----
test('pedido P0: vigente hasta 1 h, con 1 min de holgura hacia adelante; se devuelve como ISO', () => {
  assert.deepStrictEqual(espejo.pedidoP0Vigente(AHORA - 5 * 60 * 1000, AHORA), { p0Pedido: new Date(AHORA - 5 * 60 * 1000).toISOString() })
  assert.ok(espejo.pedidoP0Vigente(AHORA, AHORA))
  assert.ok(espejo.pedidoP0Vigente(AHORA + 60 * 1000, AHORA))
  assert.strictEqual(espejo.pedidoP0Vigente(AHORA + 60 * 1000 + 1, AHORA), null)
  assert.ok(espejo.pedidoP0Vigente(AHORA - espejo.PEDIDO_P0_MAX_MS, AHORA))
  assert.strictEqual(espejo.pedidoP0Vigente(AHORA - espejo.PEDIDO_P0_MAX_MS - 1, AHORA), null)
})

test('pedido P0: sin documento o mal formado → null', () => {
  assert.strictEqual(espejo.pedidoP0Vigente(null, AHORA), null)
  assert.strictEqual(espejo.pedidoP0Vigente(undefined, AHORA), null)
  assert.strictEqual(espejo.pedidoP0Vigente(Number.NaN, AHORA), null)
  assert.strictEqual(espejo.pedidoP0Vigente('2026-11-21T14:00:00Z', AHORA), null)
  assert.strictEqual(espejo.pedidoP0Vigente(AHORA, null), null)
})

test('estado: un envío de Puerta 0 no pisa el latido de pieza (va en su campo p0)', () => {
  const base = { equipo: 'PC1', linea: 'chonchi', leidoEn: '2026-11-23T10:00:00-03:00', estado: { p0: 'ok' }, prefijo: 'abcd1234' }
  const p0 = espejo.camposEstado({ ...base, informe: 'p0' })
  assert.deepStrictEqual(p0, { equipo: 'PC1', linea: 'chonchi', p0: { leidoEn: base.leidoEn, estado: { p0: 'ok' } }, llave: 'abcd1234' })
  assert.ok(!('estado' in p0) && !('informe' in p0) && !('leidoEn' in p0))
  const pz = espejo.camposEstado({ ...base, informe: 'pieza' })
  assert.deepStrictEqual(pz, { equipo: 'PC1', linea: 'chonchi', leidoEn: base.leidoEn, informe: 'pieza', estado: { p0: 'ok' }, llave: 'abcd1234' })
})
