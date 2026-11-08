import { describe, expect, it } from 'vitest'
import { detectarRepeticion, equipoBase, piezasDe, type EventoRepeticion } from '../repeticion'

/**
 * Casos del 24-09-2026 (mockup R1). Ojo: el texto de N2 y el nombre «BAADER 200» son los del
 * mockup (resumen de Orel), no el texto verbatim de la Bitácora. Confirmar con los eventos reales
 * antes de tomar el resultado como dato.
 */
const HOY = new Date(2026, 8, 24) // 24-09-2026, hora local

const N1: EventoRepeticion = {
  id: 'n1',
  equipo: 'EVISCERADORA BAADER 142 N1',
  descripcion: 'Se corta resorte ingreso chapaleta baader 1. Se reemplaza y normaliza',
  fechaTurno: '2026-09-24',
  minutosParada: 7,
}
const N2: EventoRepeticion = {
  id: 'n2',
  equipo: 'EVISCERADORA BAADER 142 N2',
  descripcion: 'Mismo resorte de la chapaleta, mismo turno',
  fechaTurno: '2026-09-24',
  minutosParada: 8,
}
const B200: EventoRepeticion = {
  id: 'b2',
  equipo: 'BAADER 200',
  descripcion: 'Se cortan resortes alimentación 1 y 2, se reutilizan los mismos',
  fechaTurno: '2026-09-24',
  minutosParada: 6,
}
const N3_INSPECCION: EventoRepeticion = {
  id: 'n3',
  equipo: 'EVISCERADORA BAADER 142 N3',
  descripcion: 'Inspección: ruido muy fuerte en la chapaleta de ingreso; se instala regulador de aire',
  fechaTurno: '2026-09-20',
  minutosParada: null,
}
const SIN_PARES: EventoRepeticion = {
  id: 'x',
  equipo: 'Iluminación nave',
  descripcion: 'Cambio de tubos fluorescentes',
  fechaTurno: '2026-09-24',
  minutosParada: 0,
}

describe('detectarRepeticion · casos reales del 24-09', () => {
  it('los 3 resortes del mismo día se detectan como una repetición', () => {
    const r = detectarRepeticion(N1, [N2, B200], HOY)
    expect(r).not.toBeNull()
    expect(r?.eventoIds.sort()).toEqual(['b2', 'n1', 'n2'])
    expect(r?.minutos).toBe(21)
    expect(r?.resumen).toBe('Resorte cortado · 3 veces el 24-09 · Baader 142 N1, N2 y Baader 200 · 21 min')
  })

  it('desde el evento de N2 también se detecta, con el mismo resumen', () => {
    const r = detectarRepeticion(N2, [N1, B200], HOY)
    expect(r?.eventoIds).toHaveLength(3)
    expect(r?.resumen).toContain('3 veces el 24-09')
  })

  it('un evento sin pares no es repetición', () => {
    expect(detectarRepeticion(SIN_PARES, [N1, N2, B200], HOY)).toBeNull()
  })

  it('la inspección del 20-09 en el mismo equipo base cuenta dentro de los 30 días', () => {
    const r = detectarRepeticion(N1, [N3_INSPECCION], HOY)
    expect(r?.eventoIds).toEqual(['n1', 'n3'])
    expect(r?.resumen).toContain('entre el 20-09 y el 24-09')
  })

  it('un evento de otro equipo y otro día no basta para repetir', () => {
    const b200Antes: EventoRepeticion = { ...B200, id: 'b0', fechaTurno: '2026-09-01' }
    expect(detectarRepeticion(N1, [b200Antes], HOY)).toBeNull()
  })

  it('fuera de la ventana de 30 días no cuenta', () => {
    const viejo: EventoRepeticion = { ...N2, id: 'viejo', fechaTurno: '2026-08-01' }
    expect(detectarRepeticion(N1, [viejo], HOY)).toBeNull()
  })
})

describe('piezas y equipo base', () => {
  it('singular y plural son la misma pieza; verbos y genéricas no cuentan', () => {
    expect(piezasDe('Se cortan resortes')).toEqual(new Set(['resorte']))
    expect(piezasDe('Se corta resorte')).toEqual(new Set(['resorte']))
    expect(piezasDe('Se reemplaza y normaliza la máquina de línea')).toEqual(new Set())
  })

  it('expulsadores pierde la «es» del plural', () => {
    expect(piezasDe('Cambio de expulsadores')).toEqual(new Set(['expulsador']))
  })

  it('el sufijo de línea no cambia el equipo base', () => {
    expect(equipoBase('EVISCERADORA BAADER 142 N1')).toBe(equipoBase('EVISCERADORA BAADER 142 N2'))
    expect(equipoBase('EVISCERADORA BAADER 142 N1')).not.toBe(equipoBase('BAADER 200'))
  })
})
