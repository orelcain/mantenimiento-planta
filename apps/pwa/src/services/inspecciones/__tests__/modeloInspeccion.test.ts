import { describe, expect, it } from 'vitest'
import {
  PAUTA_POST_ASEO,
  frasePorLiberacion,
  resumenDeInspeccion,
  type DesviacionDeInspeccion,
} from '../modeloInspeccion'

const TODOS = Object.fromEntries(PAUTA_POST_ASEO.criterios.map((c) => [c.id, 'conforme' as const]))

const desviacion = (p: Partial<DesviacionDeInspeccion> = {}): DesviacionDeInspeccion => ({
  id: 'd1',
  criterioId: 'neumatico',
  pendiente: false,
  desdeMin: 40,
  hastaMin: 80,
  ...p,
})

describe('el avance de la pauta', () => {
  it('no sugiere liberar mientras falten puntos por revisar', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { mecanico: 'conforme' } }, [])
    expect(r.revisados).toBe(1)
    expect(r.total).toBe(7)
    expect(r.sugerido).toBeNull()
  })

  it('cuenta conformes y no conformes por separado', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: { ...TODOS, neumatico: 'no-conforme' } }, [desviacion()])
    expect(r.conformes).toBe(6)
    expect(r.noConformes).toBe(1)
    expect(r.revisados).toBe(7)
  })
})

describe('el estado de la liberación se deduce, no se marca', () => {
  it('sin desviaciones es conforme', () => {
    expect(resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, []).sugerido).toBe('conforme')
  })

  it('con desviaciones todas cerradas es «corregida antes del arranque»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [desviacion(), desviacion({ id: 'd2' })])
    expect(r.sugerido).toBe('corregida')
    expect(r.pendientes).toBe(0)
  })

  it('con una abierta pasa a «con pendientes controlados»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion(),
      desviacion({ id: 'd2', pendiente: true, hastaMin: null }),
    ])
    expect(r.sugerido).toBe('con-pendientes')
    expect(r.pendientes).toBe(1)
  })

  it('nunca sugiere «no liberada»: esa la marca una persona', () => {
    for (const ds of [[], [desviacion()], [desviacion({ pendiente: true, hastaMin: null })]]) {
      expect(resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, ds).sugerido).not.toBe('no-liberada')
    }
  })
})

describe('la corrida: lo que hoy no queda en ninguna parte', () => {
  it('va de la primera desviación a la última cerrada', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', desdeMin: 40, hastaMin: 70 }),
      desviacion({ id: 'd2', desdeMin: 55, hastaMin: 85 }),
    ])
    expect(r.minutosDeCorrida).toBe(45)
  })

  it('no inventa minutos si ninguna se cerró', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, hastaMin: null }),
    ])
    expect(r.minutosDeCorrida).toBeNull()
  })

  it('ignora las desviaciones sin hora en vez de romperse', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', desdeMin: null, hastaMin: null }),
      desviacion({ id: 'd2', desdeMin: 30, hastaMin: 60 }),
    ])
    expect(r.minutosDeCorrida).toBe(30)
  })
})

describe('la frase de la entrega', () => {
  it('dice cuánto tomó la corrida', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ id: 'd1', desdeMin: 40, hastaMin: 80 }),
      desviacion({ id: 'd2', desdeMin: 45, hastaMin: 75 }),
    ])
    expect(frasePorLiberacion('corregida', r)).toBe('2 desviaciones resueltas en 40 min antes del arranque.')
  })

  it('en singular no dice «desviaciones»', () => {
    const r = resumenDeInspeccion(PAUTA_POST_ASEO, { resultados: TODOS }, [
      desviacion({ pendiente: true, hastaMin: null }),
    ])
    expect(frasePorLiberacion('con-pendientes', r)).toBe('1 de 1 desviación queda abierta, controladas.')
  })
})
