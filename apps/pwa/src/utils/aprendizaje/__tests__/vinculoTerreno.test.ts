import { describe, expect, it } from 'vitest'
import { maquinasDePlano } from '@/data/planos'
import { agruparVinculos, estadoPorMaquina, idVinculo, mensajeErrorTerreno, parsearMaquina, vinculoActivo } from '../vinculoTerreno'

type Doc = { aparato: string; estado: 'confirmado' | 'corregido' | 'no_aplica'; codigo?: string; maquina?: 'baader-n1' | 'baader-n2' | 'baader-n3' }

describe('maquinasDePlano', () => {
  it('888 = N2 y N3; 860 = N1; el resto no distingue máquina', () => {
    expect(maquinasDePlano('baader-142-888')).toEqual(['baader-n2', 'baader-n3'])
    expect(maquinasDePlano('baader-142-860')).toEqual(['baader-n1'])
    expect(maquinasDePlano('baader-200-862')).toEqual([])
    expect(maquinasDePlano(undefined)).toEqual([])
  })
})

describe('idVinculo', () => {
  it('plano con varias máquinas: lleva la máquina', () => {
    expect(idVinculo('baader-142-888', 'B5', 'baader-n3')).toBe('baader-142-888__B5__baader-n3')
  })
  it('plano con una o ninguna: no cambia', () => {
    expect(idVinculo('baader-142-860', 'B1', 'baader-n1')).toBe('baader-142-860__B1')
    expect(idVinculo('gea-50520184', 'K1')).toBe('gea-50520184__K1')
    expect(idVinculo('baader-200-862', 'K1', null)).toBe('baader-200-862__K1')
  })
})

describe('parsearMaquina', () => {
  it('acepta n2, N2 y baader-n2', () => {
    expect(parsearMaquina('n2')).toBe('baader-n2')
    expect(parsearMaquina('N3')).toBe('baader-n3')
    expect(parsearMaquina('baader-n2')).toBe('baader-n2')
    expect(parsearMaquina(' baader-N1 ')).toBe('baader-n1')
  })
  it('lo demás es null', () => {
    for (const q of [null, undefined, '', 'n4', 'baader', 'x']) expect(parsearMaquina(q)).toBeNull()
  })
})

describe('agruparVinculos', () => {
  it('888: un doc por máquina; el viejo sin máquina va aparte y no cuenta', () => {
    const docs: Doc[] = [
      { aparato: 'B5', estado: 'confirmado', codigo: '1', maquina: 'baader-n2' },
      { aparato: 'B5', estado: 'confirmado', codigo: '2', maquina: 'baader-n3' },
      { aparato: 'B6', estado: 'confirmado', codigo: '3' }, // viejo
    ]
    const m = agruparVinculos('baader-142-888', docs)
    expect(m.get('B5')?.porMaquina['baader-n2']?.codigo).toBe('1')
    expect(m.get('B5')?.porMaquina['baader-n3']?.codigo).toBe('2')
    expect(m.get('B6')?.porMaquina).toEqual({})
    expect(m.get('B6')?.sinMaquina?.codigo).toBe('3')
    expect(estadoPorMaquina(m.get('B6'), ['baader-n2', 'baader-n3']).resueltas).toEqual([])
  })

  it('860 (una máquina): el doc sin máquina vale para N1', () => {
    const m = agruparVinculos('baader-142-860', [{ aparato: 'B1', estado: 'confirmado' } as Doc])
    expect(m.get('B1')?.porMaquina['baader-n1']?.estado).toBe('confirmado')
    expect(m.get('B1')?.sinMaquina).toBeUndefined()
    expect(estadoPorMaquina(m.get('B1'), ['baader-n1']).enTodas).toBe(true)
  })

  it('plano sin máquinas (GEA, 200): el doc queda en sinMaquina y es el vínculo activo', () => {
    const m = agruparVinculos('gea-50520184', [{ aparato: 'K1', estado: 'confirmado' } as Doc])
    expect(vinculoActivo('gea-50520184', m.get('K1'), null)?.estado).toBe('confirmado')
  })

  it('ignora un doc con una máquina que el plano no tiene', () => {
    const m = agruparVinculos('baader-142-888', [{ aparato: 'B5', estado: 'confirmado', maquina: 'baader-n1' } as Doc])
    expect(m.get('B5')?.porMaquina).toEqual({})
  })
})

describe('vinculoActivo', () => {
  const m = agruparVinculos('baader-142-888', [
    { aparato: 'B5', estado: 'confirmado', codigo: '1', maquina: 'baader-n2' },
  ] as Doc[])
  it('filtra a la máquina elegida; sin máquina no hay ninguno', () => {
    expect(vinculoActivo('baader-142-888', m.get('B5'), 'baader-n2')?.codigo).toBe('1')
    expect(vinculoActivo('baader-142-888', m.get('B5'), 'baader-n3')).toBeUndefined()
    expect(vinculoActivo('baader-142-888', m.get('B5'), null)).toBeUndefined()
  })
})

describe('estadoPorMaquina', () => {
  const MQ = ['baader-n2', 'baader-n3'] as const
  it('distintas solo si dos máquinas llevan códigos diferentes', () => {
    const e = (a: string, b: string) => ({
      porMaquina: { 'baader-n2': { estado: 'confirmado' as const, codigo: a }, 'baader-n3': { estado: 'corregido' as const, codigo: b } },
    })
    expect(estadoPorMaquina(e('1', '2'), MQ)).toMatchObject({ distintas: true, enTodas: true })
    expect(estadoPorMaquina(e('1', '1'), MQ).distintas).toBe(false)
  })
  it('no_aplica resuelve pero no aporta código', () => {
    const r = estadoPorMaquina(
      { porMaquina: { 'baader-n2': { estado: 'confirmado', codigo: '1' }, 'baader-n3': { estado: 'no_aplica' } } },
      MQ,
    )
    expect(r).toMatchObject({ enTodas: true, distintas: false, resueltas: ['baader-n2', 'baader-n3'] })
  })
  it('sin entrada: nada resuelto', () => {
    expect(estadoPorMaquina(undefined, MQ)).toMatchObject({ resueltas: [], enTodas: false, distintas: false })
  })
})

describe('mensajeErrorTerreno', () => {
  it('permission-denied sugiere actualizar la app', () => {
    expect(mensajeErrorTerreno(new Error('Missing or insufficient permissions.'))).toMatch(/actualiza la app/i)
  })
  it('otro error pasa tal cual', () => {
    expect(mensajeErrorTerreno(new Error('Elige primero la máquina en la que estás.'))).toBe('Elige primero la máquina en la que estás.')
  })
})
