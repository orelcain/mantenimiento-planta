/**
 * Tests del informe de turno por correo (node:test nativo).
 *
 * Fijan tres cosas:
 *   · las cifras cuadran: la tabla de dueños, la de fallas y el texto dicen el
 *     mismo número de Mantención
 *   · el correo dice lo que pasó y nada más (sin «habríamos producido»)
 *   · la forma del protocolo /sin-tics-visual: sin cajas, sin rejas, cuatro
 *     cuerpos, color solo de estado
 *
 * Los datos salen del turno real de Chonchi del 21-10-2026, Turno 2: Grader en
 * las 3 Baader, Cintas en Ev 2, la colación en medio.
 */

const test = require('node:test')
const assert = require('node:assert')

const { construirDatosInforme, perdidaPorDueno, minutosQueCuadran, fallasDeEquipo } = require('../informeTurno')
const { correoTurnoHtml, textosCorreo, asuntoCorreo, listaMaquinas } = require('../correoTurno')
const { recuperacion, intervalosDePausa } = require('../lineImpact')

const T0 = Date.UTC(2026, 9, 21, 7, 15)
const min = (n) => T0 + n * 60_000
const st = (a, b, reason, extra = {}) => ({
  startAt: new Date(min(a)), endAt: new Date(min(b)), type: 'downtime', name: 'Detencion', reason, ...extra,
})
const pausa = (a, b) => ({ startAt: new Date(min(a)), endAt: new Date(min(b)), type: 'break', name: 'Colacion', reason: 'COLACION' })

/** 3 máquinas, 8 h a 14 pz/min cada una salvo cuando están detenidas. */
function maquina(nombre, states) {
  const intervals = []
  for (let i = 0; i < 96; i++) {
    const a = min(i * 5)
    const b = a + 5 * 60_000
    const parada = states.some((s) => s.startAt.getTime() < b && s.endAt.getTime() > a)
    intervals.push({ startAt: new Date(a), cycles: parada ? 20 : 70 })
  }
  return { machineName: nombre, states, intervals, totalCycles: intervals.reduce((x, v) => x + v.cycles, 0) }
}

function turnoReal() {
  const col = pausa(220, 280)
  const machines = [
    maquina('Evisceradora 1', [st(430, 448, 'GRADER'), col]),
    maquina('Evisceradora 2', [st(140, 149, 'CINTAS (MECANICA)'), st(200, 209, 'CINTAS (MECANICA)'), st(430, 442, 'GRADER'), st(60, 62, 'ACUMULACION RECHAZO'), col]),
    maquina('Evisceradora 3', [st(430, 441, 'GRADER'), st(300, 303, ''), col]),
  ]
  const cotejo = {
    comparados: 7, veredicto: 'sobre-la-mediana', medianaPrevios: 14807, margenHabitual: 296, difVsMediana: 480,
    filas: [
      { id: '2026-10-20_Turno 2', inicioMs: min(-1440), ciclos: 14546, mantencionSec: 720, esReferencia: false },
      { id: '2026-10-21_Turno 2', inicioMs: T0, ciclos: 0, mantencionSec: null, esReferencia: true },
    ],
    referencia: { id: '2026-10-21_Turno 2', ciclos: 0 },
    comparables: [{ id: '2026-10-20_Turno 2', inicioMs: min(-1440), ciclos: 14546 }],
  }
  return construirDatosInforme({
    machines, windowStart: new Date(T0), windowEnd: new Date(min(465)), cotejo,
    meta: { planta: 'chonchi', areaLabel: 'Eviscerados Chonchi', turnoLabel: 'Turno 2', fechaLabel: '2026-10-21' },
    historial: [{ id: '2026-10-20_Turno 2', claves: new Set(['Cintas|Evisceradora 2']) }, { id: '2026-10-17_Turno 2', claves: new Set() }],
  })
}

// ── Cifras que cuadran ──────────────────────────────────────────────────────

test('minutosQueCuadran: las filas suman el total redondeado', () => {
  const { filas, total } = minutosQueCuadran([1080 / 3, 1065 / 3, 705 / 3, 690 / 3])
  assert.strictEqual(total, 20)
  assert.strictEqual(filas.reduce((a, m) => a + m, 0), 20)
})

test('Mantención dice el mismo número en la tabla de dueños, en la de fallas y en el texto', () => {
  const d = turnoReal()
  const mant = d.porDueno.filas.find((f) => f.clave === 'mantencion')
  assert.strictEqual(mant.min, Math.round(d.resumen.mantencionEquivSec / 60))
  assert.strictEqual(d.fallas.totalMin, mant.min)
  assert.strictEqual(d.fallas.filas.reduce((a, f) => a + f.min, 0), mant.min)
  assert.ok(textosCorreo(d).detalle.includes(`Mantención responde por ${mant.min}`))
  assert.strictEqual(d.porDueno.totalMin, d.porDueno.filas.reduce((a, f) => a + f.min, 0), 'el total es la suma de lo que se muestra')
})

test('la fila de Mantención redondea sola, igual que el texto de Telegram', () => {
  // Chonchi 21-10 T2: 1.180 s de Mantención, 105 externos, 480 de micro. Cuadrar
  // las filas contra el total le quitaba el minuto a Mantención (19) mientras
  // el aviso de Telegram decía 20: el mismo número, dicho dos veces distinto.
  const c = (causa, sec, imputacion, esMicro = false) => ({ causa, esMicro, eventos: 1, equivalenteLineaSec: sec, porMaquina: [], imputacion })
  const pd = perdidaPorDueno([
    c('GRADER', 1180, { bucket: 'mantencion', hoja: 'Grader' }),
    c('ACUMULACION RECHAZO', 105, { bucket: 'externo', hoja: 'Acumulación rechazo' }),
    c('(micro detenciones)', 480, null, true),
  ])
  assert.strictEqual(pd.filas.find((f) => f.clave === 'mantencion').min, 20)
  assert.strictEqual(pd.totalMin, 20 + 2 + 8)
})

test('dos causas escritas distinto que son la misma hoja van en una fila', () => {
  const causa = (c, eq) => ({
    causa: c, esMicro: false, eventos: 1, equivalenteLineaSec: eq, porMaquina: [],
    imputacion: { hoja: 'GEA', bucket: 'mantencion', esDeMantencion: true },
  })
  const pd = perdidaPorDueno([causa('Equipo Auxiliar/GEA', 960), causa('Equipo Auxiliar / GEA', 542)])
  const mant = pd.filas.find((f) => f.clave === 'mantencion')
  assert.strictEqual(mant.causas.length, 1)
  assert.strictEqual(mant.causas[0].sec, 1502)
})

test('lo que el árbol no asigna no se reparte: va en su fila', () => {
  const d = turnoReal()
  const claves = d.porDueno.filas.map((f) => f.clave)
  assert.ok(claves.includes('sinCausal'), 'el paro sin causal de Ev 3 desapareció')
  assert.ok(claves.includes('externo'))
})

test('Mantención sale aunque sea cero', () => {
  const pd = perdidaPorDueno([{ causa: 'FALTA MMPP', esMicro: false, eventos: 2, equivalenteLineaSec: 600, porMaquina: [], imputacion: { bucket: 'externo', hoja: 'Falta MMPP' } }])
  assert.strictEqual(pd.filas[0].clave, 'mantencion')
  assert.strictEqual(pd.filas[0].min, 0)
})

// ── Contención ──────────────────────────────────────────────────────────────

test('la recuperación descuenta la colación y cuenta el bloque donde termina la falla', () => {
  // Caso real Chonchi 21-10 T2: Cintas termina 10:50:32, el bloque de 10:50
  // va a 39 pz/min (sobre el 90 % de 41,8) y a las 10:55 empieza la colación.
  // Antes salía «69 min»; la línea nunca salió de ritmo.
  const bloques = [
    { inicioMs: min(210), piezasPorMin: 39 },
    { inicioMs: min(215), piezasPorMin: 4 },
    { inicioMs: min(220), piezasPorMin: 0 },
    { inicioMs: min(285), piezasPorMin: 42 },
  ]
  const r = recuperacion({ bloques, ritmoNormal: 41.8, desdeMs: min(215) - 28_000 })
  assert.strictEqual(r.minutos, 0)

  // Si el bloque contenedor NO llegó al ritmo, la colación en medio no cuenta.
  const lento = [{ inicioMs: min(210), piezasPorMin: 10 }, { inicioMs: min(215), piezasPorMin: 4 }, { inicioMs: min(285), piezasPorMin: 42 }]
  const r2 = recuperacion({ bloques: lento, ritmoNormal: 41.8, desdeMs: min(212), pausas: [[min(220), min(280)]] })
  assert.strictEqual(r2.minutos, 73 - 60)
})

test('intervalosDePausa junta las colaciones de todas las máquinas', () => {
  const ivs = intervalosDePausa([
    { states: [pausa(220, 280)] }, { states: [pausa(225, 285)] }, { states: [st(10, 20, 'X')] },
  ])
  assert.deepStrictEqual(ivs, [[min(220), min(285)]])
})

test('una falla que se repite en turnos equivalentes seguidos se cuenta', () => {
  const d = turnoReal()
  const cintas = d.fallas.filas.find((f) => f.etiqueta === 'Cintas')
  assert.strictEqual(cintas.turnosSeguidos, 2)
  const grader = d.fallas.filas.find((f) => f.etiqueta === 'Grader')
  assert.strictEqual(grader.turnosSeguidos, 1)
  const t = textosCorreo(d)
  assert.ok(t.abiertos.some((a) => /Cintas en Ev 2/.test(a.rotulo) && /segundo turno/.test(a.texto)))
})

test('sin historial no se afirma ninguna repetición', () => {
  const d = turnoReal()
  const f = fallasDeEquipo({
    machines: [], causas: d.resumen.causas, bloques: d.bloques, ritmoNormal: d.resumen.ritmoNormal,
  })
  assert.ok(f.filas.every((x) => x.turnosSeguidos === null))
})

// ── Lo que afirma ───────────────────────────────────────────────────────────

test('el correo NUNCA estima piezas que no se produjeron', () => {
  const html = correoTurnoHtml(turnoReal())
  assert.ok(!/habr[ií]a(mos|n)? (producido|hecho)/i.test(html))
  assert.ok(!/sin la falla/i.test(html))
})

test('la frase nombra las fallas por máquina', () => {
  const t = textosCorreo(turnoReal())
  assert.match(t.detalle, /Grader en las 3 máquinas y Cintas en Ev 2/)
  assert.strictEqual(listaMaquinas(['Ev 1', 'Ev 3'], 3), 'Ev 1 y Ev 3')
})

test('un turno sin fallas de Mantención lo dice, sin celebrarlo', () => {
  const d = turnoReal()
  d.fallas = { filas: [], totalMin: 0, eventos: 0 }
  d.porDueno = { ...d.porDueno, filas: d.porDueno.filas.map((f) => (f.clave === 'mantencion' ? { ...f, min: 0, causas: [] } : f)) }
  d.porDueno.totalMin = d.porDueno.filas.reduce((a, f) => a + f.min, 0)
  assert.match(textosCorreo(d).detalle, /ninguna detención quedó imputada a Mantención/)
  assert.match(correoTurnoHtml(d), /Ninguna detención del turno quedó imputada a Mantención/)
})

test('un turno en curso no se compara ni habla en pasado', () => {
  const d = { ...turnoReal(), enCurso: true }
  const html = correoTurnoHtml(d)
  assert.match(textosCorreo(d).veredicto, /^Turno en curso/)
  assert.ok(!/Contra los/.test(html), 'muestra el cotejo de un turno a medias')
  assert.match(asuntoCorreo(d), /^\[En curso\]/)
})

test('el pie no lleva nombre de persona', () => {
  const html = correoTurnoHtml(turnoReal())
  assert.ok(!/Orel|Cain/i.test(html))
})

// ── La forma del documento (/sin-tics-visual) ───────────────────────────────

test('sin cajas: ningún border-left, border-radius ni fondo de tinte', () => {
  const html = correoTurnoHtml(turnoReal())
  assert.ok(!/border-left/.test(html))
  assert.ok(!/border-radius/.test(html))
  // Fondos permitidos: blanco, la banda gris del encabezado y las barras del cotejo.
  const fondos = [...html.matchAll(/background:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase())
  for (const f of fondos) assert.ok(['#FFFFFF', '#F1F3F4', '#C9CDD2', '#1F1F1F'].includes(f), `fondo de tinte ${f}`)
})

test('sin reja: ninguna celda con borde en los cuatro lados', () => {
  const html = correoTurnoHtml(turnoReal())
  assert.ok(!/<td[^>]*style="[^"]*(?<!-)border:\s*1px solid/.test(html))
})

test('cuatro cuerpos exactos: 21, 14, 11 y 10,5', () => {
  const html = correoTurnoHtml(turnoReal())
  const tamanos = new Set([...html.matchAll(/font-size:\s*([\d.]+)px/g)].map((m) => m[1]))
  tamanos.delete('0') // las celdas de barra llevan font-size:0 para no crecer
  assert.deepStrictEqual([...tamanos].sort(), ['10.5', '11', '14', '21'])
})

test('color solo de estado: tinta, grises y los semánticos', () => {
  const html = correoTurnoHtml(turnoReal())
  const colores = new Set([...html.matchAll(/(?<!-)color:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase()))
  for (const c of colores) assert.ok(['#1F1F1F', '#5F6368', '#B3261E', '#8A5A00'].includes(c), `color fuera de la paleta ${c}`)
})

test('cada tabla cierra con su total', () => {
  const html = correoTurnoHtml(turnoReal())
  const totales = html.match(/font-weight:600">Total</g) || []
  assert.strictEqual(totales.length, 2, 'la tabla de dueños y la de fallas deben cerrar con Total')
})

test('nombres de Yal se acortan igual y las listas de causas no se confunden', () => {
  const { nombreCorto } = require('../informeTurno')
  const { listaY } = require('../correoTurno')
  assert.strictEqual(nombreCorto('YAL Evisceradora 3'), 'Ev 3')
  assert.strictEqual(listaMaquinas(['Ev 2', 'Ev 1'], 3), 'Ev 1 y Ev 2')
  assert.strictEqual(listaY(['Ajuste en Ev 1 y Ev 2', 'Knuro en Ev 1']), 'Ajuste en Ev 1 y Ev 2, y Knuro en Ev 1')
  assert.strictEqual(listaY(['Grader', 'Cintas']), 'Grader y Cintas')
})
