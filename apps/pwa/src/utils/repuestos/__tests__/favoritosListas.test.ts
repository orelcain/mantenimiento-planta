import { describe, it, expect } from 'vitest'
import type { FavList } from '@/services/userPreferences'
import { quitarEquipoDeLista, restoreEquipToList, type FavoritoQuitado } from '../favoritosListas'

const base = (): FavList[] => [
  { name: 'Equipos', machineIds: ['a', 'b', 'c'], machineNames: { a: 'A', b: 'B', c: 'C' } },
  { name: 'Solo', machineIds: ['z'], machineNames: { z: 'Z' } },
  { name: 'Cintas', machineIds: ['x', 'y'] },
]
const q = (o: Partial<FavoritoQuitado>): FavoritoQuitado => ({ listName: 'Equipos', machineId: 'b', index: 1, listIndex: 0, ...o })

describe('restoreEquipToList', () => {
  it('restaura en medio', () => {
    const lists: FavList[] = [{ name: 'Equipos', machineIds: ['a', 'c'] }]
    expect(restoreEquipToList(lists, q({}))[0]!.machineIds).toEqual(['a', 'b', 'c'])
  })
  it('restaura al final', () => {
    const lists: FavList[] = [{ name: 'Equipos', machineIds: ['a', 'b'] }]
    expect(restoreEquipToList(lists, q({ machineId: 'c', index: 2 }))[0]!.machineIds).toEqual(['a', 'b', 'c'])
  })
  it('recrea la lista borrada en su posición (medio y final)', () => {
    const sin: FavList[] = [base()[0]!, base()[2]!]
    const medio = restoreEquipToList(sin, { listName: 'Solo', machineId: 'z', machineName: 'Z', index: 0, listIndex: 1 })
    expect(medio.map((l) => l.name)).toEqual(['Equipos', 'Solo', 'Cintas'])
    expect(medio[1]).toEqual({ name: 'Solo', machineIds: ['z'], machineNames: { z: 'Z' } })
    const final = restoreEquipToList(sin, { listName: 'Solo', machineId: 'z', index: 0, listIndex: 2 })
    expect(final.map((l) => l.name)).toEqual(['Equipos', 'Cintas', 'Solo'])
    expect(final[2]).toEqual({ name: 'Solo', machineIds: ['z'] })
  })
  it('no duplica un id que ya está (misma referencia)', () => {
    const lists = base()
    expect(restoreEquipToList(lists, q({}))).toBe(lists)
  })
  it('acota posiciones fuera de rango', () => {
    const lists: FavList[] = [{ name: 'Equipos', machineIds: ['a'] }]
    expect(restoreEquipToList(lists, q({ machineId: 'n', index: 99 }))[0]!.machineIds).toEqual(['a', 'n'])
    expect(restoreEquipToList(lists, q({ machineId: 'n', index: -5 }))[0]!.machineIds).toEqual(['n', 'a'])
    const otra = restoreEquipToList(lists, { listName: 'Otra', machineId: 'n', index: 0, listIndex: 99 })
    expect(otra.map((l) => l.name)).toEqual(['Equipos', 'Otra'])
  })
  it('conserva el resto de machineNames y no muta la entrada', () => {
    const lists: FavList[] = [{ name: 'Equipos', machineIds: ['a'], machineNames: { a: 'A' } }]
    const copia = structuredClone(lists)
    const r = restoreEquipToList(lists, q({ machineName: 'B' }))
    expect(r[0]!.machineNames).toEqual({ a: 'A', b: 'B' })
    expect(lists).toEqual(copia)
  })
})

describe('quitarEquipoDeLista', () => {
  it('quita y guarda el snapshot', () => {
    const { lists, quitado } = quitarEquipoDeLista(base(), 'Equipos', 'b')
    expect(lists[0]!.machineIds).toEqual(['a', 'c'])
    expect(lists[0]!.machineNames).toEqual({ a: 'A', c: 'C' })
    expect(quitado).toEqual({ listName: 'Equipos', machineId: 'b', machineName: 'B', index: 1, listIndex: 0 })
  })
  it('lista o equipo inexistente: sin cambios', () => {
    const l = base()
    expect(quitarEquipoDeLista(l, 'No', 'a')).toEqual({ lists: l, quitado: null })
    expect(quitarEquipoDeLista(l, 'Equipos', 'zz').quitado).toBeNull()
  })
  it('ida y vuelta deja las listas iguales, incluida la lista de un solo equipo', () => {
    for (const [lista, id] of [['Equipos', 'a'], ['Equipos', 'c'], ['Solo', 'z'], ['Cintas', 'x']] as const) {
      const { lists, quitado } = quitarEquipoDeLista(base(), lista, id)
      expect(quitado).not.toBeNull()
      if (lista === 'Solo') expect(lists.map((l) => l.name)).toEqual(['Equipos', 'Cintas'])
      expect(restoreEquipToList(lists, quitado!)).toEqual(base())
    }
  })
})
