import { describe, expect, it } from 'vitest'
import type { Acr, AccionAcr } from '../acr.types'
import type { TurnoJK } from '@/services/shoplogix/jackKnife'
import {
  coberturaPrioritarias,
  cortesPorCausa,
  efectoPorCausa,
  referenciaCaidaSola,
  resumenEfecto,
  type FilaEfecto,
} from '../efectoAcciones'

/** Día n desde el 1-01-2026, en YYYY-MM-DD (un turno por día, para que el orden sea evidente). */
function diaN(n: number): string {
  return new Date(Date.UTC(2026, 0, 1 + n)).toISOString().slice(0, 10)
}

/** Turno con `causas` como eventos (cada uno de 1 minuto). */
const turno = (n: number, causas: string[] = []): TurnoJK => ({
  id: `${diaN(n)}_Turno 1`,
  dateKey: diaN(n),
  shiftId: 'Turno 1',
  resumen: {
    v: 1,
    eventos: causas.map((c, k) => [c, k, 1] as [string, number, number]),
    sinImputar: [],
    sinImputarLinea: [],
    comentarios: [],
    conCausaMin: 0,
    sinCausaMin: 0,
    uptimeMin: 480,
  },
})

/** `n` turnos; la causa `causa` aparece en los turnos que cumple `cae`. */
const serie = (n: number, causa: string, cae: (i: number) => boolean): TurnoJK[] =>
  Array.from({ length: n }, (_, i) => turno(i, cae(i) ? [causa] : []))

const accion = (fuerza: AccionAcr['fuerza'], estado: AccionAcr['estado'], hechaEn: string | null): AccionAcr => ({
  id: `a-${fuerza}-${estado}-${hechaEn}`,
  texto: 'x',
  fuerza,
  causaId: null,
  responsable: '',
  fechaLimite: null,
  estado,
  hechaEn,
})

const acr = (causaJK: string | null | undefined, acciones: AccionAcr[]): Acr =>
  ({ id: `acr-${causaJK}`, causaJK, acciones, estado: 'cerrado' }) as unknown as Acr

const fila = (cambio: number | null, estado: FilaEfecto['estado'] = 'medida'): FilaEfecto => ({
  causa: 'c',
  corte: '2026-03-01',
  antesEv: 10,
  antesMin: 10,
  despuesEv: 5,
  despuesMin: 5,
  turnosDespues: 30,
  estado,
  cambio,
})

describe('cortesPorCausa', () => {
  it('toma la menor fecha de las acciones fuertes hechas, por causa', () => {
    const cortes = cortesPorCausa([
      acr('Lógica', [accion('fuerte', 'hecha', '2026-03-10'), accion('fuerte', 'hecha', '2026-02-01')]),
      acr('Lógica', [accion('fuerte', 'hecha', '2026-02-20')]),
    ])
    expect(cortes.get('Lógica')).toBe('2026-02-01')
  })

  it('ignora débiles, pendientes, sin fecha y ACR sin causa de texto', () => {
    const cortes = cortesPorCausa([
      acr('Correas', [accion('debil', 'hecha', '2026-02-01'), accion('fuerte', 'pendiente', null), accion('fuerte', 'hecha', null)]),
      acr(null, [accion('fuerte', 'hecha', '2026-02-01')]),
      acr(undefined, [accion('fuerte', 'hecha', '2026-02-01')]),
    ])
    expect(cortes.size).toBe(0)
  })
})

describe('referenciaCaidaSola', () => {
  it('sin 60 turnos no hay referencia', () => {
    expect(referenciaCaidaSola(serie(59, 'X', () => true), new Map())).toBeNull()
  })

  it('una causa que se apaga después de los primeros 30 turnos cae −100 % en las ventanas que la tienen', () => {
    const r = referenciaCaidaSola(serie(90, 'X', (i) => i < 30), new Map())
    expect(r).toEqual({ casos: 2, mediana: -1, p25: -1, p75: -1 })
  })

  it('omite la ventana si la causa tiene corte y la ventana posterior llega hasta el corte', () => {
    const cortes = new Map([['X', diaN(50)]])
    expect(referenciaCaidaSola(serie(90, 'X', (i) => i < 30), cortes)).toBeNull()
  })

  it('una causa con corte posterior a todas sus ventanas sí entra', () => {
    const cortes = new Map([['X', diaN(80)]])
    expect(referenciaCaidaSola(serie(90, 'X', (i) => i < 30), cortes)?.casos).toBe(2)
  })
})

describe('efectoPorCausa: estados', () => {
  it('pocasAntes si hay menos de 30 turnos antes del corte', () => {
    const f = efectoPorCausa(serie(100, 'X', () => true), new Map([['X', diaN(3)]]))
    expect(f[0]).toMatchObject({ estado: 'pocasAntes', cambio: null })
  })

  it('midiendo si el después tiene menos de 30 turnos', () => {
    const f = efectoPorCausa(serie(60, 'X', () => true), new Map([['X', diaN(40)]]))
    expect(f[0]).toMatchObject({ estado: 'midiendo', turnosDespues: 20, cambio: null, antesEv: 30 })
  })

  it('medida con 30 y 30 turnos: el cambio compara eventos', () => {
    const f = efectoPorCausa(serie(100, 'X', (i) => i < 40 || i >= 70), new Map([['X', diaN(40)]]))
    expect(f[0]).toMatchObject({ estado: 'medida', antesEv: 30, despuesEv: 0, cambio: -1 })
  })
})

describe('resumenEfecto', () => {
  const ref = { p25: -0.5 }

  it('con menos de 5 causas medidas el veredicto es falta', () => {
    const r = resumenEfecto([fila(-0.9), fila(-0.9), fila(-0.9), fila(-0.9)], ref)
    expect(r).toMatchObject({ medidas: 4, minimas: 5, veredicto: 'falta' })
  })

  it('caeMas exige 5 causas y mediana bajo el percentil 25', () => {
    const cinco = [fila(-0.9), fila(-0.8), fila(-0.7), fila(-0.6), fila(-0.4)]
    expect(resumenEfecto(cinco, ref)).toMatchObject({ medidas: 5, medianaCambio: -0.7, veredicto: 'caeMas' })
  })

  it('con 5 causas pero mediana sobre el percentil 25: igual', () => {
    const r = resumenEfecto([fila(-0.1), fila(0), fila(0.2), fila(-0.9), fila(-0.2)], ref)
    expect(r.veredicto).toBe('igual')
  })

  it('no cuentan las filas que aún miden o no tienen antes suficiente', () => {
    const r = resumenEfecto([fila(-0.9), fila(-0.9), fila(-0.9), fila(-0.9), fila(null, 'midiendo'), fila(null, 'pocasAntes')], ref)
    expect(r.medidas).toBe(4)
    expect(r.veredicto).toBe('falta')
  })

  it('sin referencia no puede decir caeMas', () => {
    const r = resumenEfecto([fila(-0.9), fila(-0.9), fila(-0.9), fila(-0.9), fila(-0.9)], null)
    expect(r.veredicto).toBe('igual')
  })
})

describe('coberturaPrioritarias', () => {
  it('cuenta puntos de nivel 1 o 2 con ACR de acción fuerte hecha', () => {
    const calc = {
      pts: [
        { k: 'Lógica', ev: 20, min: 300, mttr: 15, q: 'amb' as const },
        { k: 'Motores', ev: 3, min: 30, mttr: 10, q: 'ok' as const },
      ],
      N: 23,
      D: 330,
      un: 5,
      um: 10,
      cob: null,
      barras: [],
      desde: 0,
      hasta: 0,
    }
    const cubiertas = coberturaPrioritarias(calc, [acr('Lógica', [accion('fuerte', 'hecha', '2026-02-01')])])
    expect(cubiertas).toEqual({ cubiertas: 1, total: 1 })
    expect(coberturaPrioritarias(calc, [acr('Lógica', [])])).toEqual({ cubiertas: 0, total: 1 })
  })
})
