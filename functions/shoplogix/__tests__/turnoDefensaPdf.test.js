/**
 * Tests de maquetación de `turnoDefensaPdf` (node:test nativo).
 *
 * Estos tests existen por un defecto que sobrevivió a diez PR y a 1.797 tests:
 * jsPDF DESCARTA en silencio todo lo que se dibuja bajo el borde inferior de la
 * hoja. No recorta, no avisa, no falla — el bloque simplemente no queda en el
 * PDF. La lámina 4 se pasaba del borde en los 8 informes reales que se
 * revisaron el 2026-08-20, y con ella se perdían los KPI de ocupación de la
 * cadena, la nota de cómo leer el reparto y la nota que declara lo que el
 * informe NO afirma. El PDF salía bien formado y pesaba lo esperado.
 *
 * Por eso acá no se verifica que el PDF "se genere": eso ya pasaba. Se verifica
 * que TODO lo que `construirTextos` decidió afirmar haya llegado al papel, y que
 * nada se haya escrito fuera de la hoja. La única forma de saberlo sin renderizar
 * es el registro que expone `generarInformeTurno`.
 */

const test = require('node:test')
const assert = require('node:assert')

const { generarInformeTurno, wa, Y_FIN, H } = require('../turnoDefensaPdf')

// ── Datos de prueba ─────────────────────────────────────────────────────────
// El caso que rompía era el turno LARGO: muchos tramos y muchas caídas empujan
// todo lo de abajo fuera de la hoja. Los valores salen del turno real de Filete
// del 2026-08-20 (6 tramos, 14 caídas) y del de Chonchi (9 tramos).

const causa = (nombre, over = {}) => ({
  causa: nombre,
  esMicro: false,
  eventos: 14,
  sumaSec: 4670,
  unionSec: 4670,
  todasSec: 4670,
  equivalenteLineaSec: 4670,
  porNivelSec: [0, 4670],
  imputacion: {
    hoja: null, categoriaLabel: 'Sin causa imputada', ambigua: false,
    sinCausa: true, fueraDelArbol: false, esMicro: false, esDeMantencion: false,
  },
  ...over,
})

const T0 = Date.UTC(2026, 7, 20, 7, 45)
const min = (n) => T0 + n * 60_000

function datos({ nTramos = 6, nCaidas = 14, planta = 'filete', ocupacion = true } = {}) {
  return {
    meta: { planta, areaLabel: 'Filete', turnoLabel: 'Turno Dia', fechaLabel: '2026-08-20' },
    resumen: {
      maquinas: planta === 'filete' ? 1 : 3,
      ciclos: 2308,
      ritmoNormal: 7.2,
      inicioMs: T0,
      finMs: min(465),
      detencion: { sumaSec: 6156, unionSec: 6156, todasSec: 6156, equivalenteLineaSec: 6156 },
      mantencionEquivSec: 0,
      sinCausaEquivSec: 4670,
      scrapTotal: 0,
      causas: [causa('(sin causa imputada)'), causa('micro', { esMicro: true, eventos: 186, sumaSec: 1486 })],
      pausas: [],
    },
    bloques: Array.from({ length: 93 }, (_, i) => ({ piezasPorMin: 4 + (i % 5) })),
    tramos: Array.from({ length: nTramos }, (_, i) => ({
      enRitmo: i % 2 === 1, inicioMs: min(i * 40), finMs: min(i * 40 + 40),
      minutos: 40, ciclos: 300, piezasPorMin: 5.3, pctDelRitmo: 0.73,
    })),
    eventosPorMaquina: [{ maquina: 'Linea 1', intervalos: [[min(5), min(25)]], sec: 6156, ultimoFinMs: min(25) }],
    recuperaciones: [{ causa: '(sin causa imputada)', desdeMs: min(300), minutos: null, volvioMs: null }],
    reparto: {
      totalPz: 707, paradoPz: 478, reenganchePz: 78, degradadoPz: 151, maxReengancheMin: 15,
      eventos: Array.from({ length: nCaidas }, (_, i) => ({
        inicioMs: min(i * 30), minParo: 5, pzParo: 30, minReenganche: i === 2 ? 15 : 5, pzReenganche: 11,
      })),
    },
    ocupacion: ocupacion
      ? { ocupacion: 0.44, llenas: 2308, vacias: 2942, pasaron: 5250, ritmoNominal: 18, minutosEnMarcha: 292 }
      : null,
    cotejo: {
      comparados: 7,
      medianaPrevios: 3919,
      veredicto: 'bajo-la-mediana',
      difVsMediana: -1611,
      filas: Array.from({ length: 8 }, (_, i) => ({
        id: `2026-08-1${i}_Turno Dia`, ciclos: 3000 + i * 200, esReferencia: i === 7, detencionLineaSec: 4000,
      })),
    },
    enCurso: false,
    textos: {
      veredictoTitulo: 'El turno cerro bajo lo habitual.',
      veredictoDetalle: 'Detalle del veredicto que ocupa un par de lineas en la lamina uno.',
      veredictoBueno: false,
      produccionSub: 'bajo la mediana de los ultimos 7 turnos',
      notaLamina1: 'Por que esta lamina va primero. '.repeat(6),
      notaLamina2: 'Como leer esta tabla. '.repeat(12),
      notaLamina3: 'Para que sirve en la reunion. '.repeat(10),
      tituloLamina4: 'El ritmo real del turno, tramo por tramo',
      notaLamina4: 'Lo que estos numeros si prueban. '.repeat(12),
      notaReparto: 'Como leer el reparto. '.repeat(10),
      notaOcupacion: 'La perdida de velocidad, traducida. '.repeat(10),
      notaLamina5: 'Que dice esta comparacion. '.repeat(8),
      parrafoReunion: 'Parrafo para leer en la reunion. '.repeat(8),
      pendientes: Array.from({ length: 6 }, (_, i) => `Pendiente numero ${i + 1}. `.repeat(8)),
      pieDeFuente: 'Generado automaticamente al cierre del turno. Planta filete.',
    },
  }
}

/** Genera y devuelve el registro de todo lo que se escribió. */
function escrituras(d) {
  const registro = []
  const pdf = generarInformeTurno(d, { registro })
  assert.ok(pdf.length > 5000, 'el PDF deberia tener contenido')
  return registro
}

// ── El invariante que se rompió ─────────────────────────────────────────────

test('nada se escribe bajo el borde de la hoja', () => {
  // El pie de fuente es el único que vive en el margen inferior, a proposito.
  for (const caso of [{}, { nTramos: 12, nCaidas: 20 }, { planta: 'chonchi', nTramos: 9 }]) {
    const d = datos(caso)
    const fuera = escrituras(d)
      .filter((e) => e.yFin > Y_FIN)
      .filter((e) => !e.texto.startsWith('Generado automaticamente'))
    assert.deepStrictEqual(
      fuera.map((e) => `p${e.pagina} y=${e.yFin.toFixed(0)} ${e.texto.slice(0, 40)}`), [],
      `caso ${JSON.stringify(caso)}: hay texto bajo el borde util (${Y_FIN} mm)`,
    )
  }
})

test('nada se escribe fuera de la hoja fisica, ni siquiera el pie', () => {
  for (const e of escrituras(datos({ nCaidas: 20 }))) {
    assert.ok(e.yFin <= H, `"${e.texto.slice(0, 40)}" quedaria en y=${e.yFin}, fuera de la hoja de ${H} mm`)
  }
})

// ── Que todo lo que se afirma llegue al papel ───────────────────────────────

test('todos los bloques de la lamina 4 llegan al PDF, con turno largo', () => {
  // Este es literalmente el defecto del 2026-08-20: con 14 caidas, la tabla
  // llegaba al borde y todo lo de abajo desaparecia sin dejar rastro.
  const registro = escrituras(datos({ nCaidas: 14 }))
  const todo = registro.map((e) => e.texto).join(' | ')
  for (const esperado of [
    'Lo que estos numeros si prueban', // la nota que declara lo que el informe NO dice
    'Como leer el reparto',
    'SILLETAS LLENAS',
    'SILLETAS VACIAS',
    'CADENA EN MARCHA',
    'RECUPERACION - (SIN CAUSA IMPUTADA)',
  ]) {
    assert.ok(todo.includes(esperado), `falta "${esperado}" en el PDF`)
  }
})

test('ninguna fila de la tabla de caidas se pierde al continuar de hoja', () => {
  const nCaidas = 20
  const registro = escrituras(datos({ nCaidas }))
  // Cada caida escribe su hora de inicio en la primera columna.
  const horas = new Set(registro.filter((e) => /^\d\d:\d\d$/.test(e.texto)).map((e) => e.texto))
  // Las 20 caidas van cada 30 min desde las 07:45, asi que las horas son unicas.
  assert.ok(horas.size >= nCaidas, `solo ${horas.size} horas de caida en el PDF, se esperaban ${nCaidas}`)
})

test('la cabecera de una tabla se repite en la hoja de continuacion', () => {
  const registro = escrituras(datos({ nCaidas: 20 }))
  const cabeceras = registro.filter((e) => e.texto === wa('CAIDA'))
  assert.ok(cabeceras.length >= 2, 'la tabla de caidas continua de hoja sin repetir la cabecera')
  assert.ok(
    new Set(cabeceras.map((e) => e.pagina)).size >= 2,
    'las cabeceras repetidas deberian estar en hojas distintas',
  )
})

test('el texto de las lamina 5 y 6 llega entero aunque haya muchos pendientes', () => {
  const d = datos()
  d.textos.pendientes = Array.from({ length: 12 }, (_, i) => `Pendiente largo numero ${i + 1}. `.repeat(10))
  const todo = escrituras(d).map((e) => e.texto).join(' | ')
  for (let i = 1; i <= 12; i++) {
    assert.ok(todo.includes(`Pendiente largo numero ${i}.`), `falta el pendiente ${i}`)
  }
  assert.ok(todo.includes('Generado automaticamente'), 'falta el pie de fuente')
})

// ── Numeración ──────────────────────────────────────────────────────────────

test('la numeracion de hojas cuenta las hojas reales, no las laminas', () => {
  const registro = escrituras(datos({ nCaidas: 20 }))
  const sellos = registro.filter((e) => /^\d+ \/ \d+$/.test(e.texto)).map((e) => e.texto)
  const total = Number(sellos[0].split(' / ')[1])
  assert.ok(total >= 6, 'un informe tiene al menos las 6 laminas')
  assert.strictEqual(sellos.length, total, 'cada hoja debe llevar su sello')
  assert.deepStrictEqual(
    sellos, Array.from({ length: total }, (_, i) => `${i + 1} / ${total}`),
    'los sellos deben ir en orden y contra el total real',
  )
})

test('un turno corto no gasta hojas de mas', () => {
  // El contrapeso del test anterior: si el flujo empezara a cortar por cualquier
  // cosa, un turno tranquilo pasaria de 6 hojas a 10 y nadie lo notaria.
  const registro = escrituras(datos({ nTramos: 3, nCaidas: 2 }))
  const total = Number(registro.find((e) => /^\d+ \/ \d+$/.test(e.texto)).texto.split(' / ')[1])
  assert.ok(total <= 8, `un turno corto no deberia ocupar ${total} hojas`)
})
