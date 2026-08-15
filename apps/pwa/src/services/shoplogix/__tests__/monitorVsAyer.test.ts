/**
 * Por qué el turno cerró distinto que ayer, y los récords de la línea.
 *
 * Los números son los REALES de Filete (verificados contra Firestore el
 * 14-08): el 14 hizo 788 pz menos que el 13 siendo la línea MÁS RÁPIDA de los
 * últimos 8 turnos — la diferencia era tiempo, no velocidad. Eso es lo que la
 * descomposición tiene que saber contar.
 */
import { describe, it, expect } from 'vitest'
import { vsAyer, recordsDeLinea, nombreDeDia, type TurnoResumen } from '../monitorVsAyer'

/** Filete, reales: 06→14 de agosto. */
const T = {
  d06: { dateKey: '2026-08-06', total: 3754, producingMin: 331, windowMin: 450, plannedMin: 61, recoverableMin: 58 },
  d12: { dateKey: '2026-08-12', total: 4486, producingMin: 340, windowMin: 450, plannedMin: 77, recoverableMin: 33 },
  d13: { dateKey: '2026-08-13', total: 4707, producingMin: 376, windowMin: 485, plannedMin: 46, recoverableMin: 59 },
  d14: { dateKey: '2026-08-14', total: 3919, producingMin: 291, windowMin: 405, plannedMin: 63, recoverableMin: 52 },
} satisfies Record<string, TurnoResumen>

describe('vsAyer · el 14 contra el 13, tal cual pasó', () => {
  const r = vsAyer(T.d14, [T.d06, T.d12, T.d13])!

  it('compara contra el MÁS RECIENTE válido, no contra cualquiera', () => {
    expect(r.ayer.dateKey).toBe('2026-08-13')
    expect(r.diff).toBe(-788)
  })

  it('⚠⚠ la historia real: más rápido, pero menos tiempo', () => {
    // La trampa que motivó todo: en pz/min de reloj los dos días dan 9,7.
    expect(r.ritmoHoy).toBeGreaterThan(r.ritmoAyer)
    const t = Object.fromEntries(r.terminos.map((x) => [x.clave, Math.round(x.piezas)]))
    expect(t.duracion).toBe(-1001)   // 80 min menos de ventana
    expect(t.convenio).toBe(-213)    // 17 min más de colación
    expect(t.paradas).toBe(88)       // 7 min MENOS de paradas: a favor
    expect(t.ritmo).toBe(276)        // 0,9 pz/min más rápido
  })

  it('la suma CUADRA con la diferencia: cada término es auditable', () => {
    const suma = r.terminos.reduce((a, x) => a + x.piezas, 0)
    expect(Math.round(suma)).toBe(r.diff)
  })

  it('el residuo queda visible y dentro del umbral', () => {
    const residuo = r.terminos.find((x) => x.clave === 'residuo')!
    expect(Math.abs(residuo.piezas)).toBeLessThan(100)
    expect(r.datosIncompletos).toBe(false)
  })
})

describe('vsAyer · defensas', () => {
  it('⚠ un turno roto no compara: mejor nada que un fantasma', () => {
    // El 13 sin desglose (así vienen 12 de los 23 en Firestore) se saltea y
    // se compara contra el 12.
    const roto = { dateKey: '2026-08-13', total: 4707, producingMin: 376 }
    expect(vsAyer(T.d14, [T.d12, roto])!.ayer.dateKey).toBe('2026-08-12')
    expect(vsAyer(T.d14, [roto])).toBeNull()
  })

  it('no compara el hoy contra un turno FUTURO ya sincronizado', () => {
    expect(vsAyer(T.d13, [T.d14, T.d12])!.ayer.dateKey).toBe('2026-08-12')
  })

  it('con residuo gigante avisa que los datos no alcanzan', () => {
    // Ventana enorme sin producción que la explique: huecos de sensor.
    const raro = { ...T.d14, windowMin: 900 }
    expect(vsAyer(raro, [T.d13])!.datosIncompletos).toBe(true)
  })
})

describe('recordsDeLinea', () => {
  const previos = [T.d06, T.d12, T.d13]

  it('🏆 el 14 rompió el récord de ritmo y el bloque lo sabe', () => {
    const r = recordsDeLinea(T.d14, previos)!
    const ritmo = r.componentes.find((c) => c.clave === 'ritmo')!
    expect(ritmo.esNuevo).toBe(true)
    expect(ritmo.recordDe).toBe('2026-08-12')      // la vara vieja: 13,2
    expect(ritmo.record).toBeCloseTo(13.2, 1)
  })

  it('los récords son POR COMPONENTE: cada uno puede ser de otro día', () => {
    const r = recordsDeLinea(T.d14, previos)!
    const paradas = r.componentes.find((c) => c.clave === 'paradas')!
    const pct = r.componentes.find((c) => c.clave === 'pctAndando')!
    expect(paradas.recordDe).toBe('2026-08-12')    // 33 min
    expect(paradas.esNuevo).toBe(false)
    expect(pct.recordDe).toBe('2026-08-13')        // 78%
    // La brecha de paradas en piezas, al ritmo de HOY: 19 min × 13,5.
    expect(Math.round(paradas.brechaPiezas!)).toBe(256)
  })

  it('⚠ con menos de 3 turnos válidos no hay récords: todo sería récord', () => {
    expect(recordsDeLinea(T.d14, [T.d13])).toBeNull()
    expect(recordsDeLinea(T.d14, [T.d13, { dateKey: '2026-08-11', total: 100, producingMin: 10 }])).toBeNull()
  })
})

describe('nombreDeDia', () => {
  it('cita el turno como se habla en planta', () => {
    expect(nombreDeDia('2026-08-13')).toBe('jue 13')
    expect(nombreDeDia('2026-08-14')).toBe('vie 14')
  })
})
