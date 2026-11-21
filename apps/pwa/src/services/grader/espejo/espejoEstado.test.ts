import { describe, it, expect } from 'vitest'
import {
  avisoLimite,
  elegirEstado,
  estaVivo,
  fraseDeError,
  minutosDesde,
  textoHace,
  type EstadoLector,
} from './espejoEstado'

const AHORA = Date.parse('2026-11-20T12:00:00Z')
const hace = (min: number) => AHORA - min * 60_000

describe('vivo (≤ 12 min, reloj inyectado)', () => {
  it('2 min y 12 min están vivos; 13 min no', () => {
    expect(estaVivo(hace(2), AHORA)).toBe(true)
    expect(estaVivo(hace(12), AHORA)).toBe(true)
    expect(estaVivo(hace(13), AHORA)).toBe(false)
  })

  it('13 min exactos y 12 min con segundos: el límite es por minutos enteros', () => {
    expect(estaVivo(AHORA - 12 * 60_000 - 59_000, AHORA)).toBe(true)
    expect(estaVivo(AHORA - 13 * 60_000, AHORA)).toBe(false)
  })

  it('sin latido nunca está vivo; un latido «del futuro» no da minutos negativos', () => {
    expect(estaVivo(null, AHORA)).toBe(false)
    expect(minutosDesde(null, AHORA)).toBeNull()
    expect(minutosDesde(AHORA + 5_000, AHORA)).toBe(0)
  })

  it('redacta el «hace»', () => {
    expect(textoHace(0)).toBe('hace menos de 1 min')
    expect(textoHace(38)).toBe('hace 38 min')
    expect(textoHace(60)).toBe('hace 1 h')
    expect(textoHace(65)).toBe('hace 1 h 05 min')
  })
})

describe('estado del lector', () => {
  const e = (equipo: string, ultimoLatidoMs: number | null): EstadoLector =>
    ({ equipo, linea: 'chonchi', ultimoLatidoMs, leidoEn: null, informe: 'pieza', estado: {} })

  it('con varios equipos elige el que avisó último', () => {
    expect(elegirEstado([e('A', hace(30)), e('B', hace(3)), e('C', null)])?.equipo).toBe('B')
    expect(elegirEstado([])).toBeNull()
  })

  it('frases de error conocidas y desconocidas', () => {
    expect(fraseDeError('otro-informe')).toContain('«Pieza pieza Grader»')
    expect(fraseDeError('sin-matrix')).not.toBeNull()
    expect(fraseDeError('sin-tabla')).not.toBeNull()
    expect(fraseDeError('licencia-en-pantalla')).not.toBeNull()
    expect(fraseDeError('')).toBeNull()
    expect(fraseDeError('algo-raro')).toBeNull()
  })

  it('avisa el corte de 10 000 solo con límite marcado y tabla llena', () => {
    expect(avisoLimite({ limite: true, filasTabla: 10000 })).toContain('10 000')
    expect(avisoLimite({ limite: true, filasTabla: 9998 })).toBeNull()
    expect(avisoLimite({ limite: false, filasTabla: 10000 })).toBeNull()
  })
})
