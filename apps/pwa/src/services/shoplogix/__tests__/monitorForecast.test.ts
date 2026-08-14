/**
 * monitorForecast — el pronóstico del cierre y su error.
 *
 * Lo que estos tests protegen no es una fórmula: es que el método se ELIJA con
 * los datos de cada línea. El backtest del 13-ago mostró que el mejor
 * predictor se invierte entre Filete (proporcional) y Yal (aditivo), así que
 * cablear uno degradaría la otra planta.
 */
import { describe, it, expect } from 'vitest'
import { buildForecast, type HistoryShift } from '../monitorForecast'
import type { PacePoint } from '../monitorCompare'

/**
 * Turno mínimo pero suficiente: lo único que los predictores miran es cuánto
 * llevaba a la altura que se predice y con cuánto cerró.
 */
function turno(a300: number, total: number, durMin = 470): HistoryShift {
  const curve: PacePoint[] = []
  for (let m = 30; m <= 300; m += 30) {
    curve.push({ minutes: m, pieces: Math.round(a300 * (m / 300)) })
  }
  for (let m = 330; m < durMin; m += 30) {
    curve.push({ minutes: m, pieces: Math.round(a300 + (total - a300) * ((m - 300) / (durMin - 300))) })
  }
  curve.push({ minutes: durMin, pieces: total })
  return { curve, totalPieces: total }
}

/* Filete · Turno Día, datos REALES de Shoplogix (piezas a las 5 h → cierre). */
const FILETE: HistoryShift[] = [
  turno(1765, 2410), turno(1868, 2777), turno(2140, 3005), turno(2202, 3324),
  turno(2872, 3917), turno(2560, 3454), turno(3051, 4410), turno(2074, 3275),
  turno(2950, 4278),
]
/** El turno del 13-ago: llevaba 2.945 a las 5 h y cerró en 4.294. */
const HOY_FILETE = turno(2945, 4294)

describe('buildForecast · elección del método', () => {
  it('en una línea PROPORCIONAL (la velocidad manda) elige el proporcional', () => {
    /*
     * Filete: el tiempo andando casi no varía y un turno rápido lo es de punta
     * a punta, así que las curvas son escaladas entre sí.
     */
    const f = buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE, targetPieces: 5000,
    })!
    expect(f.method).toBe('proporcional')
    expect(f.samples).toBe(9)
  })

  it('y acierta el cierre real del turno con datos reales', () => {
    const f = buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE, targetPieces: 5000,
    })!
    // El turno cerró en 4.294.
    expect(Math.abs(f.estimate - 4294) / 4294).toBeLessThan(0.05)
    expect(f.low).toBeLessThan(f.estimate)
    expect(f.high).toBeGreaterThan(f.estimate)
    // Y el error declarado tiene que ser creíble, no cosmético.
    expect(f.mapePct).toBeGreaterThan(0)
    expect(f.mapePct).toBeLessThan(15)
  })

  it('en una línea de DISPONIBILIDAD (paradas impredecibles) elige el aditivo', () => {
    /*
     * Yal: todos arrancan parecido y lo que los separa son las paradas del
     * tramo final. Ahí suponer proporcionalidad es justamente el error.
     */
    const yal: HistoryShift[] = [
      turno(10_000, 19_000), turno(10_200, 17_500), turno(9_800, 20_100),
      turno(10_100, 15_800), turno(9_900, 18_600), turno(10_050, 21_000),
    ]
    const f = buildForecast({
      todayCurve: turno(10_000, 0).curve, currentMinute: 300, history: yal,
    })!
    expect(f.method).toBe('aditivo')
  })

  it('el veredicto de la cuota es un CONTEO auditable, no una probabilidad', () => {
    const f = buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE, targetPieces: 5000,
    })!
    // Ningún turno anterior llegó a 5.000 desde esta altura.
    expect(f.hitsTarget).toBe(0)

    const facil = buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE, targetPieces: 3800,
    })!
    expect(facil.hitsTarget).toBeGreaterThan(0)
    expect(facil.hitsTarget).toBeLessThanOrEqual(facil.samples)
  })

  it('sin cuota no inventa un veredicto', () => {
    const f = buildForecast({ todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE })!
    expect(f.hitsTarget).toBeNull()
  })
})

describe('buildForecast · el cono que se dibuja', () => {
  const f = () => buildForecast({
    todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE, targetPieces: 5000,
  })!

  it('nace exactamente en el punto actual — la banda sale de la curva, no flota', () => {
    const c = f().cone
    expect(c[0]!.minutes).toBe(300)
    expect(c[0]!.low).toBe(2945)
    expect(c[0]!.mid).toBe(2945)
    expect(c[0]!.high).toBe(2945)
  })

  it('se abre hacia el cierre y nunca retrocede', () => {
    const c = f().cone
    expect(c.length).toBeGreaterThan(4)
    for (let i = 1; i < c.length; i++) {
      expect(c[i]!.mid).toBeGreaterThanOrEqual(c[i - 1]!.mid)
      expect(c[i]!.high).toBeGreaterThanOrEqual(c[i]!.low)
    }
    // El ancho crece: a mitad de camino la banda es más angosta que al final.
    const medio = c[Math.floor(c.length / 2)]!
    const fin = c[c.length - 1]!
    expect(fin.high - fin.low).toBeGreaterThan(medio.high - medio.low)
  })

  it('termina donde dice el número grande — una sola verdad en pantalla', () => {
    const r = f()
    const fin = r.cone[r.cone.length - 1]!
    expect(Math.abs(fin.mid - r.estimate) / r.estimate).toBeLessThan(0.03)
    expect(fin.low).toBeGreaterThanOrEqual(r.low - 1)
    expect(fin.high).toBeLessThanOrEqual(r.high + 1)
  })
})

describe('buildForecast · cuándo NO pronosticar', () => {
  it('con el turno cerrado no hay nada que pronosticar', () => {
    expect(buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE, shiftClosed: true,
    })).toBeNull()
  })

  it('sin historial suficiente se calla', () => {
    expect(buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 300, history: FILETE.slice(0, 3),
    })).toBeNull()
  })

  it('sin piezas todavía, tampoco', () => {
    expect(buildForecast({
      todayCurve: [{ minutes: 5, pieces: 0 }], currentMinute: 5, history: FILETE,
    })).toBeNull()
    expect(buildForecast({ todayCurve: null, currentMinute: 300, history: FILETE })).toBeNull()
  })

  it('⚠ los turnos EN CURSO no entran al historial', () => {
    /*
     * El hallazgo que más caro salió del análisis: colar un turno a medio andar
     * (su "total" es un parcial) disparó el error de 7% a 90%. Un turno que
     * duró 260 min contra una mediana de 470 es eso.
     */
    const conBasura = [...FILETE, turno(1500, 1500, 260)]
    const f = buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 300, history: conBasura,
    })!
    expect(f.samples).toBe(9)
    expect(Math.abs(f.estimate - 4294) / 4294).toBeLessThan(0.05)
  })

  it('descarta los turnos que no llegaron a la altura que se predice', () => {
    // A los 360 min, un turno que terminó a los 370 no sirve de referencia.
    const f = buildForecast({
      todayCurve: HOY_FILETE.curve, currentMinute: 360,
      history: [...FILETE, turno(2000, 2600, 370)],
    })
    expect(f?.samples).toBe(9)
  })
})
