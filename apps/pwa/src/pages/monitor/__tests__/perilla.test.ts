/**
 * Pruebas de perilla.ts: la vigencia de la perilla (perillaEn), la vara del minuto
 * (varaMinuto) y el umbral de ritmo (umbralARitmo). Lo que se protege: que una
 * anotación rija desde su hora y no antes, que una máquina no herede la de otra,
 * y que sin perilla la vara vuelva a Shoplogix.
 */
import { describe, expect, it } from 'vitest'
import { construirPerilla, desdePerilla } from '@/lib/horaDePlanta'
import {
  perillaEn,
  porDeUsuario,
  quienAnoto,
  rotuloRaya,
  tonoDePorcentajeVara,
  tonoVara,
  umbralARitmo,
  UMBRAL_A_RITMO_PERILLA,
  varaMinuto,
  type PerillasDeLinea,
} from '../perilla'

const HORA = 3_600_000
/** Inicio de turno de referencia (UTC). */
const INICIO = Date.parse('2026-11-04T12:00:00.000Z')
/** ISO de `h` horas respecto del inicio del turno (negativo = antes). */
const enHora = (h: number) => new Date(INICIO + h * HORA).toISOString()

/** Arma la forma de `live.perillas` desde el historial, para que `actual` no quede desfasado. */
function perillasDe(historial: Array<{ machineId: string; cpm: number; desde: string }>): PerillasDeLinea {
  const actual: PerillasDeLinea['actual'] = {}
  for (const h of historial) {
    const previo = actual[h.machineId]
    if (!previo || Date.parse(h.desde) >= Date.parse(previo.desde)) {
      actual[h.machineId] = { cpm: h.cpm, desde: h.desde }
    }
  }
  return {
    actual,
    historial: historial.map((h) => ({ cpm: h.cpm, desde: h.desde, machineId: h.machineId })),
  }
}

describe('perillaEn', () => {
  it('sin perillas no hay vigente', () => {
    expect(perillaEn(null, 'ev1', INICIO)).toBeNull()
    expect(perillaEn(undefined, 'ev1', INICIO)).toBeNull()
    expect(perillaEn({ actual: {}, historial: [] }, 'ev1', INICIO)).toBeNull()
  })

  it('una anotación de antes del turno rige todo el turno', () => {
    const p = perillasDe([{ machineId: 'ev1', cpm: 17, desde: enHora(-24) }])
    expect(perillaEn(p, 'ev1', INICIO)).toBe(17)
    expect(perillaEn(p, 'ev1', INICIO + 7 * HORA)).toBe(17)
  })

  it('cambio a mitad de turno (17 → 19): cada instante ve la anotación de su hora', () => {
    const p = perillasDe([
      { machineId: 'ev1', cpm: 17, desde: enHora(-24) },
      { machineId: 'ev1', cpm: 19, desde: enHora(2) },
    ])
    expect(perillaEn(p, 'ev1', INICIO + HORA)).toBe(17)
    expect(perillaEn(p, 'ev1', INICIO + 2 * HORA)).toBe(19) // la hora exacta ya cuenta
    expect(perillaEn(p, 'ev1', INICIO + 5 * HORA)).toBe(19)
    expect(perillaEn(p, 'ev1', INICIO - HORA)).toBe(17)
  })

  it('una anotación futura no rige antes de su hora', () => {
    const p = perillasDe([
      { machineId: 'ev1', cpm: 17, desde: enHora(-24) },
      { machineId: 'ev1', cpm: 19, desde: enHora(5) },
    ])
    expect(perillaEn(p, 'ev1', INICIO + 4 * HORA)).toBe(17)
    const soloFutura = perillasDe([{ machineId: 'ev1', cpm: 19, desde: enHora(5) }])
    expect(perillaEn(soloFutura, 'ev1', INICIO)).toBeNull()
  })

  it('una máquina sin anotación no hereda la de otra', () => {
    const p = perillasDe([
      { machineId: 'ev1', cpm: 17, desde: enHora(-24) },
      { machineId: 'ev2', cpm: 15, desde: enHora(-24) },
    ])
    expect(perillaEn(p, 'ev3', INICIO)).toBeNull()
    expect(perillaEn(p, 'ev2', INICIO)).toBe(15)
  })

  it('si el historial se recortó, la anotación actual sigue valiendo', () => {
    const p: PerillasDeLinea = {
      actual: { ev1: { cpm: 17, desde: enHora(-24) } },
      historial: [],
    }
    expect(perillaEn(p, 'ev1', INICIO)).toBe(17)
  })
})

describe('varaMinuto', () => {
  it('con perilla vigente manda la perilla, aunque Shoplogix diga otra cosa', () => {
    const p = perillasDe([{ machineId: 'ev1', cpm: 17, desde: enHora(-24) }])
    expect(varaMinuto(p, 'ev1', INICIO + HORA, 18)).toEqual({ cpm: 17, fuente: 'perilla' })
  })

  it('sin perilla cae al esperado de Shoplogix', () => {
    expect(varaMinuto(null, 'ev1', INICIO, 18)).toEqual({ cpm: 18, fuente: 'shoplogix' })
  })

  it('una anotación futura todavía no cambia la vara', () => {
    const p = perillasDe([{ machineId: 'ev1', cpm: 19, desde: enHora(5) }])
    expect(varaMinuto(p, 'ev1', INICIO, 18)).toEqual({ cpm: 18, fuente: 'shoplogix' })
  })

  it('sin perilla ni Shoplogix, la vara es null y la fuente sigue siendo Shoplogix', () => {
    expect(varaMinuto(null, 'ev1', INICIO, null)).toEqual({ cpm: null, fuente: 'shoplogix' })
  })
})

describe('umbralARitmo: con perilla anotada, a ritmo es la perilla completa', () => {
  it('la constante vale 1 (decisión de Orel, 04-11)', () => {
    expect(UMBRAL_A_RITMO_PERILLA).toBe(1)
  })
  it.each([
    [17, 17], // con 17 anotado, a ritmo es 17 o más
    [16, 16],
    [18, 18],
    [15, 15],
    [20, 20],
    [5, 5],
    [30, 30],
  ])('con %i pz/min el umbral es %i', (cpm, umbral) => {
    expect(umbralARitmo(cpm)).toBe(umbral)
  })
})

describe('tonoVara: bandas de la perilla y el 75 % de Shoplogix', () => {
  const perilla17 = { cpm: 17, fuente: 'perilla' as const }
  const shoplogix16 = { cpm: 16, fuente: 'shoplogix' as const }
  it.each([
    [17, 'bien'], // el umbral entero: a ritmo
    [18, 'bien'],
    [16, 'atento'], // una menos que la perilla ya es bajo, no a ritmo
    [9, 'atento'], // 9/17 = 52,9 %: sobre la mitad
    [8, 'mal'], // 8/17 = 47 %: muy bajo
    [0, 'mal'], // detenida con vara: muy bajo
  ])('perilla 17 · %i pz → %s', (v, tono) => {
    expect(tonoVara(v, perilla17)).toBe(tono)
  })
  it.each([
    [12, 'bien'], // 75 % exacto de 16 (Shoplogix): sigue siendo a ritmo
    [11, 'atento'],
    [8, 'atento'], // 50 % exacto: bajo
    [7, 'mal'],
  ])('Shoplogix 16 · %i pz → %s (sin perilla no cambia)', (v, tono) => {
    expect(tonoVara(v, shoplogix16)).toBe(tono)
  })
  it('sin vara: con piezas es a ritmo (como antes), sin piezas es sin dato', () => {
    expect(tonoVara(5, { cpm: null, fuente: 'shoplogix' })).toBe('bien')
    expect(tonoVara(0, { cpm: null, fuente: 'shoplogix' })).toBe('sin')
  })
})

describe('desdePerilla: la hora de planta sellada como UTC, no la UTC real', () => {
  it('verano (UTC−3, 04-11-2026 04:20Z) → 01:20 de planta', () => {
    expect(desdePerilla(Date.parse('2026-11-04T04:20:00Z'))).toBe('2026-11-04T01:20:00.000Z')
  })
  it('invierno (UTC−4, 01-07-2026 12:00Z) → 08:00 de planta', () => {
    expect(desdePerilla(Date.parse('2026-07-01T12:00:00Z'))).toBe('2026-07-01T08:00:00.000Z')
  })
  it('anotada a las 10:00 en Chile entra en vigor a las 10:00, no a las 13:00', () => {
    expect(desdePerilla(Date.parse('2026-11-04T13:00:00Z'))).toBe('2026-11-04T10:00:00.000Z')
  })
  it('un instante que no es número no se guarda', () => {
    expect(() => desdePerilla(Number.NaN)).toThrow()
  })
  it('construirPerilla usa esa misma hora y guarda quién la anotó', () => {
    expect(construirPerilla({ cpm: 17, por: 'Orel C.', nowMs: Date.parse('2026-11-04T04:20:00Z') })).toEqual({
      cpm: 17,
      desde: '2026-11-04T01:20:00.000Z',
      por: 'Orel C.',
    })
  })
})

describe('perillaEn con un instante que no es número', () => {
  it('devuelve null aunque haya una anotación (con NaN todas parecían vigentes)', () => {
    const perillas = { actual: { ev1: { cpm: 17, desde: '2026-11-04T01:20:00.000Z' } }, historial: [] }
    expect(perillaEn(perillas, 'ev1', Number.NaN)).toBeNull()
    expect(perillaEn(perillas, 'ev1', Date.parse('2026-11-04T02:00:00.000Z'))).toBe(17)
  })
})

describe('rótulo de la raya «a ritmo»: el entero de la vara, no el 75 % de siempre con perilla', () => {
  it('con perilla anotada es la perilla completa: 17 o más', () => {
    expect(rotuloRaya({ cpm: 17, fuente: 'perilla' })).toBe('17 o más')
  })

  it('sin perilla es el 75 % de la meta de Shoplogix: meta 16 → 12 o más', () => {
    expect(rotuloRaya({ cpm: 16, fuente: 'shoplogix' })).toBe('12 o más')
  })

  it('sin vara no hay rótulo', () => {
    expect(rotuloRaya({ cpm: null, fuente: 'shoplogix' })).toBeNull()
  })

  it('el tono de una cifra de carros sigue la regla de tonoVara (perilla completa, o 75 % y 50 %)', () => {
    expect(tonoDePorcentajeVara(100, { cpm: 17, fuente: 'perilla' })).toBe('bien')
    /* 82 % de 17 son 13,9 pz/min: ni a ritmo (17) ni bajo, sino «atento». */
    expect(tonoDePorcentajeVara(82, { cpm: 17, fuente: 'perilla' })).toBe('atento')
    expect(tonoDePorcentajeVara(75, { cpm: 16, fuente: 'shoplogix' })).toBe('bien')
    expect(tonoDePorcentajeVara(60, { cpm: 16, fuente: 'shoplogix' })).toBe('atento')
    expect(tonoDePorcentajeVara(40, { cpm: 16, fuente: 'shoplogix' })).toBe('mal')
    expect(tonoDePorcentajeVara(null, { cpm: 16, fuente: 'shoplogix' })).toBe('sin')
  })
})

describe('quién anotó: nunca un correo completo en pantalla', () => {
  it('un correo se muestra solo como lo que va antes de «@»', () => {
    expect(quienAnoto('ana.perez@ejemplo.cl')).toBe('ana.perez')
  })

  it('un nombre se muestra tal cual, sin cortarlo', () => {
    expect(quienAnoto('Ana Pérez')).toBe('Ana Pérez')
  })

  it('sin dato, o sin nada antes de «@», no inventa un nombre', () => {
    expect(quienAnoto(null)).toBeNull()
    expect(quienAnoto('   ')).toBeNull()
    expect(quienAnoto('@ejemplo.cl')).toBeNull()
  })

  it('al anotar guarda el nombre visible; sin nombre, lo que va antes de «@» del correo', () => {
    expect(porDeUsuario({ nombre: 'Ana', apellido: 'Pérez', email: 'ana.perez@ejemplo.cl' })).toBe('Ana Pérez')
    expect(porDeUsuario({ nombre: '', apellido: null, email: 'ana.perez@ejemplo.cl' })).toBe('ana.perez')
    expect(porDeUsuario(null)).toBeNull()
  })
})
