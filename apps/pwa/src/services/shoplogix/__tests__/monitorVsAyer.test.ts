/**
 * Por qué el turno cerró distinto que ayer, y los récords de la línea.
 *
 * Los números son los REALES de Filete (verificados contra Firestore el
 * 14-08): el 14 hizo 788 pz menos que el 13 siendo la línea MÁS RÁPIDA de los
 * últimos 8 turnos — la diferencia era tiempo, no velocidad. Eso es lo que la
 * descomposición tiene que saber contar.
 */
import { describe, it, expect } from 'vitest'
import { vsAyer, recordsDeLinea, bandaNormal, rachaDeRitmos, nombreDeDia, type TurnoResumen } from '../monitorVsAyer'

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
    /* El % produciendo se mide sobre el tiempo DISPONIBLE (ventana −
       planificado), la misma base que el KPI de la página. Con la ventana
       completa el récord era el 13 (78%); sobre el disponible es el 12:
       340/(450−77) = 91%. */
    expect(pct.recordDe).toBe('2026-08-12')
    expect(pct.record).toBeCloseTo(91.2, 0)
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

describe('bandaNormal', () => {
  // Los 7 turnos válidos anteriores al 14-08 (reales, resumidos).
  const previos: TurnoResumen[] = [
    T.d06, T.d12, T.d13,
    { dateKey: '2026-08-07', total: 4364, producingMin: 351, windowMin: 470, plannedMin: 57, recoverableMin: 53 },
    { dateKey: '2026-08-08', total: 3454, producingMin: 297, windowMin: 410, plannedMin: 73, recoverableMin: 40 },
    { dateKey: '2026-08-10', total: 4915, producingMin: 395, windowMin: 515, plannedMin: 57, recoverableMin: 55 },
    { dateKey: '2026-08-11', total: 3618, producingMin: 282, windowMin: 425, plannedMin: 65, recoverableMin: 78 },
  ]

  it('la banda real de Filete: ritmo 11,3-13,2 y cierres 3.454-4.915', () => {
    const b = bandaNormal(T.d14, previos)!
    expect(b.ritmo.min).toBeCloseTo(11.3, 1)
    expect(b.ritmo.max).toBeCloseTo(13.2, 1)
    expect(b.cierres).toEqual({ min: 3454, max: 4915 })
    expect(b.muestras).toBe(7)
  })

  it('⚠ el turno de HOY no entra en su propia banda: se fija a priori', () => {
    // Si entrara, el récord de hoy (13,5) estiraría la banda hasta taparse solo.
    const b = bandaNormal(T.d14, [...previos, T.d14])!
    expect(b.ritmo.max).toBeCloseTo(13.2, 1)
  })

  it('la serie viene en orden cronológico y con identidad (día por punto)', () => {
    const b = bandaNormal(T.d14, previos)!
    expect(b.turnos[0]!.dateKey).toBe('2026-08-06')
    expect(b.turnos[0]!.ritmo).toBeCloseTo(3754 / 331, 1)
    expect(b.turnos[b.turnos.length - 1]!.dateKey).toBe('2026-08-13')
  })

  it('⚠ con menos de 5 turnos válidos no hay banda: no se inventa un «normal»', () => {
    expect(bandaNormal(T.d14, [T.d06, T.d12, T.d13])).toBeNull()
  })
})

describe('rachaDeRitmos', () => {
  // La semana real de Filete (v2): NO fue una suba limpia — bache el vie 8.
  const SEMANA = [9.63, 9.11, 10.01, 11.02, 10.28, 12.44, 12.83, 13.19, 12.52, 11.59]

  it('⚠ la frase honesta del 14-08: aflojando 2, no «subió toda la semana»', () => {
    const r = rachaDeRitmos(SEMANA)!
    expect(r.dir).toBe(-1)
    expect(r.n).toBe(2)
    expect(r.desde).toBeCloseTo(13.19, 2)
  })

  it('una suba sostenida se cuenta como tal', () => {
    const r = rachaDeRitmos([9, 9.5, 10.2, 11.4, 12.8])!
    expect(r.dir).toBe(1)
    expect(r.n).toBe(4)
  })

  it('pasos de ruido (<0,15) no fabrican racha', () => {
    expect(rachaDeRitmos([11.0, 11.05, 11.1, 11.05])).toBeNull()
  })

  it('con un solo paso no hay racha que contar', () => {
    expect(rachaDeRitmos([12, 11, 12.5])).toBeNull()
  })
})
