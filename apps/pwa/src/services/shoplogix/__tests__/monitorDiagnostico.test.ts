/**
 * monitorDiagnostico — dónde se gana en cada línea.
 *
 * Los fixtures son los datos REALES del 13-ago: Filete (1 máquina) y Yal (3),
 * que se comportan al revés. Lo que se protege es que el bloque no afirme más
 * de lo que estos datos pueden sostener.
 */
import { describe, it, expect } from 'vitest'
import { buildDiagnostico, type TurnoDiagnostico } from '../monitorDiagnostico'

const t = (totalPieces: number, producingMin: number, microCount: number | null = null): TurnoDiagnostico =>
  ({ totalPieces, producingMin, microCount })

/* Filete · Turno Día: piezas, minutos produciendo y micro-detenciones reales. */
const FILETE: TurnoDiagnostico[] = [
  t(2410, 290, 150), t(2777, 290, 133), t(3005, 332, 109), t(3324, 332, 112),
  t(3917, 351, 107), t(3454, 336, 103), t(4410, 347, 79), t(3275, 303, 85),
  t(4278, 351, 86),
]

describe('buildDiagnostico', () => {
  it('en Filete el terreno está en la VELOCIDAD (datos reales)', () => {
    const d = buildDiagnostico({ history: FILETE, microHoy: 81 })!
    expect(d.factor).toBe('velocidad')
    // El tiempo andando es notablemente más estable que la velocidad.
    expect(d.cvTiempo).toBeLessThan(d.cvVelocidad)
    expect(d.samples).toBe(9)
  })

  it('en una línea de 3 máquinas manda el TIEMPO ANDANDO', () => {
    /*
     * Yal: la velocidad por máquina es pareja y lo que separa un turno de otro
     * es cuánto estuvieron andando (paradas largas).
     */
    const yal: TurnoDiagnostico[] = [
      t(19_000, 900), t(15_800, 760), t(21_000, 980), t(12_400, 600),
      t(17_600, 840), t(22_100, 1020),
    ]
    expect(buildDiagnostico({ history: yal })!.factor).toBe('tiempo')
  })

  it('cuando ninguno domina, NO inventa un veredicto', () => {
    // Velocidades 9,2-10,9 (CV 5,8%) y tiempos 280-340 (CV 6,5%): ninguno
    // domina al otro, así que nombrar un ganador sería inventarlo.
    const parejo: TurnoDiagnostico[] = [
      t(2760, 300), t(3360, 320), t(2744, 280), t(3706, 340), t(3131, 310),
    ]
    const d = buildDiagnostico({ history: parejo })!
    expect(d.factor).toBe('parejo')
  })

  it('las micro-detenciones se muestran como HECHOS: los dos extremos con sus piezas', () => {
    const d = buildDiagnostico({ history: FILETE, microHoy: 81 })!
    expect(d.micro).not.toBeNull()
    expect(d.micro!.hoy).toBe(81)
    // El turno con menos micro-detenciones y el que más, tal cual ocurrieron.
    expect(d.micro!.menos).toEqual({ count: 79, pieces: 4410 })
    expect(d.micro!.mas).toEqual({ count: 150, pieces: 2410 })
    // En estos turnos más micro-detenciones fue con menos piezas: el pareo se
    // puede mostrar sin inducir una lectura al revés.
    expect(d.micro!.relacionInversa).toBe(true)
  })

  it('⚠ si en la muestra MÁS micro-detenciones coincide con MÁS piezas, no habilita el pareo', () => {
    /*
     * Caso real visto en pantalla el 13-08 con los 6 turnos recientes de
     * Filete: el turno con menos (43) produjo 3.618 y el que más (63) produjo
     * 4.364. Mostrar esos dos extremos juntos haría leer "más
     * micro-detenciones es mejor", que es peor que no decir nada.
     */
    const alReves: TurnoDiagnostico[] = [
      t(3618, 300, 43), t(3900, 320, 48), t(4100, 330, 55),
      t(4364, 340, 63), t(3750, 310, 45), t(4000, 325, 58),
    ]
    const d = buildDiagnostico({ history: alReves, microHoy: 40 })!
    expect(d.micro).not.toBeNull()
    expect(d.micro!.relacionInversa).toBe(false)
    // Los extremos siguen ahí: la UI decide mostrar solo el rango.
    expect(d.micro!.menos.count).toBe(43)
    expect(d.micro!.mas.count).toBe(63)
  })

  it('sin contraste real entre turnos, no muestra el dato de micro-detenciones', () => {
    // Todos con prácticamente las mismas: enseñar dos extremos idénticos
    // sugeriría un contraste que no existe.
    const iguales = FILETE.map((x) => ({ ...x, microCount: 100 }))
    expect(buildDiagnostico({ history: iguales })!.micro).toBeNull()
  })

  it('sin micro-detenciones registradas, el resto del diagnóstico igual sirve', () => {
    const sinMicro = FILETE.map((x) => ({ ...x, microCount: null }))
    const d = buildDiagnostico({ history: sinMicro })!
    expect(d.micro).toBeNull()
    expect(d.factor).toBe('velocidad')
  })

  it('con menos de 4 turnos no diagnostica nada', () => {
    expect(buildDiagnostico({ history: FILETE.slice(0, 3) })).toBeNull()
  })

  it('descarta turnos sin minutos de producción — dividir por cero no es un dato', () => {
    const conBasura = [...FILETE, t(500, 0, 10)]
    expect(buildDiagnostico({ history: conBasura })!.samples).toBe(9)
  })
})
