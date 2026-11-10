import { describe, expect, it } from 'vitest'
import type { DiagnosisEntry } from '@/services/learningContent'
import { agruparCasos, esCodigoError, sinSolucionDelFabricante } from '../diagnosticoGrupos'

const caso = (title: string, solution = 'Hacer algo.', extra: Partial<DiagnosisEntry> = {}): DiagnosisEntry => ({
  id: title, title, symptom: '', possibleCauses: [], solution, createdAt: 0, updatedAt: 0, ...extra,
})

describe('diagnosticoGrupos', () => {
  it('reconoce los códigos de error y no confunde «Esófago»', () => {
    expect(esCodigoError(caso('E 770'))).toBe(true)
    expect(esCodigoError(caso('E 8 N X'))).toBe(true)
    expect(esCodigoError(caso('Códigos de error E77x/E8xx (motores paso a paso)'))).toBe(true)
    expect(esCodigoError(caso('Esófago queda demasiado largo'))).toBe(false)
    expect(esCodigoError(caso('Fallo de introducción / atasco en la entrada (E777)'))).toBe(false)
  })

  it('cuenta los códigos sin solución del fabricante', () => {
    expect(sinSolucionDelFabricante(caso('E 771', 'El manual no entrega una solución separada para esta fila.'))).toBe(true)
    expect(sinSolucionDelFabricante(caso('E 821', 'Pulsar el pulsador I.'))).toBe(false)
  })

  it('agrupa conservando el número original y filtra sin acentos', () => {
    const entries = [
      caso('Códigos de error E77x'),
      caso('Fallo de introducción (E777)'),
      caso('Esófago queda demasiado largo', 'Afilar.', { possibleCauses: ['Hoja de membrana embotada'] }),
      caso('E 770', 'El manual no entrega una solución separada.'),
    ]
    const grupos = agruparCasos(entries)
    expect(grupos.map(g => [g.id, g.casos.map(c => c.numero)])).toEqual([
      ['sintomas', [2, 3]],
      ['codigos', [1, 4]],
    ])
    expect(grupos[1]!.sinSolucion).toBe(1)
    const filtrados = agruparCasos(entries, 'esofago')
    expect(filtrados).toHaveLength(1)
    expect(filtrados[0]!.casos[0]!.numero).toBe(3)
    expect(agruparCasos(entries, 'membrana')[0]!.casos[0]!.numero).toBe(3)
    expect(agruparCasos(entries, 'nada que coincida')).toEqual([])
  })
})
