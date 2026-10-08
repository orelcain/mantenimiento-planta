import { describe, expect, it } from 'vitest'
import type { ModuloPrioritario } from '@/data/baader142A3cPrioridad'
import { PRIORIDAD_A3C, TOTAL_PRIORITARIOS } from '@/data/baader142A3cPrioridad'
import { armarPorConfirmar, estaEnLista, primeraSeleccion } from '../porConfirmarA3c'

const prioridad: ModuloPrioritario[] = [
  {
    id: 'm1',
    nombre: 'Módulo uno',
    episodios: 5,
    resumen: 'r1',
    fuentes: ['f'],
    elementos: [
      { codigo: 'SM5', tipo: 'motor', lectura: 'Leer placa del motor' },
      { codigo: 'B5', tipo: 'sensor', lectura: 'Leer etiqueta del sensor' },
      { codigo: 'B25', tipo: 'encoder', lectura: 'Leer etiqueta del encoder' },
    ],
  },
  { id: 'm2', nombre: 'Módulo dos', episodios: 3, resumen: 'r2', fuentes: ['f'], elementos: [{ codigo: 'Y1', tipo: 'valvula', lectura: 'Leer placa' }] },
]
const elementos = {
  SM5: { es: 'motor paso a paso' }, B5: { es: 'sensor' }, B25: { es: 'encoder' }, Y1: { es: 'válvula' },
  B1: { es: 'sensor B1' }, B2: { es: 'sensor B2' }, SM9: { es: 'motor 9' },
  'A3C.P1': { es: 'pseudo' }, X5: { es: 'regleta' }, TP3: { es: 'punto de prueba' },
}
const aparatos = {
  SM5: [{ nr: '41702013' }, { nr: '41702013' }, { nr: '41702014' }],
  B1: [{ nr: '42303109' }],
}

describe('armarPorConfirmar', () => {
  it('pendientes antes que confirmados dentro del grupo, conteos 0/3 y 1/3', () => {
    const sin = armarPorConfirmar({ prioridad, aparatos, vinculos: new Map(), elementos })
    expect(sin.grupos[0]?.filas.map(f => f.codigo)).toEqual(['SM5', 'B5', 'B25'])
    expect(sin.grupos[0]).toMatchObject({ numero: 1, confirmados: 0, total: 3 })

    const con = armarPorConfirmar({ prioridad, aparatos, vinculos: new Map([['SM5', { estado: 'confirmado' as const }]]), elementos })
    expect(con.grupos[0]?.filas.map(f => f.codigo)).toEqual(['B5', 'B25', 'SM5'])
    expect(con.grupos[0]?.filas[2]?.estado).toBe('confirmado')
    expect(con.grupos[0]).toMatchObject({ confirmados: 1, total: 3 })
    expect(con.prioritarios).toEqual({ confirmados: 1, total: 4 })
  })

  it('corregido y no_aplica no bajan: solo lo confirmado va al final', () => {
    const r = armarPorConfirmar({
      prioridad,
      aparatos,
      vinculos: new Map([['SM5', { estado: 'corregido' as const, codigo: 'X1' }], ['B5', { estado: 'confirmado' as const }], ['B25', { estado: 'no_aplica' as const }]]),
      elementos,
    })
    expect(r.grupos[0]?.filas.map(f => f.codigo)).toEqual(['SM5', 'B25', 'B5'])
    expect(r.grupos[0]?.confirmados).toBe(1)
  })

  it('candidatos salen de partes (sin repetir) y vacío si no hay', () => {
    const r = armarPorConfirmar({ prioridad, aparatos, vinculos: new Map(), elementos })
    expect(r.grupos[0]?.filas[0]?.candidatos).toEqual(['41702013', '41702014'])
    expect(r.grupos[0]?.filas[1]?.candidatos).toEqual([])
  })

  it('el resto excluye prioritarios y no-físicos, y cuenta sus confirmados', () => {
    const r = armarPorConfirmar({ prioridad, aparatos, vinculos: new Map([['B2', { estado: 'confirmado' as const }]]), elementos })
    expect(r.resto.filas.map(f => f.codigo)).toEqual(['B1', 'SM9', 'B2'])
    expect(r.resto).toMatchObject({ total: 3, confirmados: 1 })
    expect(r.plano).toEqual({ confirmados: 1, total: 7 })
  })

  it('primeraSeleccion: primera pendiente en orden de pantalla; si no queda, la primera fila', () => {
    const v = (cods: string[]) => new Map(cods.map(c => [c, { estado: 'confirmado' as const }]))
    expect(primeraSeleccion(armarPorConfirmar({ prioridad, aparatos, vinculos: v(['SM5']), elementos }))).toBe('B5')
    expect(primeraSeleccion(armarPorConfirmar({ prioridad, aparatos, vinculos: v(['SM5', 'B5', 'B25', 'Y1']), elementos }))).toBe('SM5')
  })

  it('estaEnLista: acepta prioritarios y resto; rechaza códigos inexistentes y no-físicos', () => {
    const r = armarPorConfirmar({ prioridad, aparatos, vinculos: null, elementos })
    expect(estaEnLista(r, 'SM5')).toBe(true)
    expect(estaEnLista(r, 'B2')).toBe(true)
    expect(estaEnLista(r, 'B999')).toBe(false)
    expect(estaEnLista(r, null)).toBe(false)
  })
})

describe('PRIORIDAD_A3C', () => {
  it('son 6 módulos y 14 elementos sin repetir', () => {
    expect(PRIORIDAD_A3C).toHaveLength(6)
    const cods = PRIORIDAD_A3C.flatMap(m => m.elementos.map(e => e.codigo))
    expect(cods).toHaveLength(14)
    expect(new Set(cods).size).toBe(14)
    expect(TOTAL_PRIORITARIOS).toBe(14)
    expect(PRIORIDAD_A3C.every(m => m.fuentes.length > 0)).toBe(true)
  })
})
