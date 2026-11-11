import { describe, expect, it } from 'vitest'
import type { FavList } from '@/services/userPreferences'
import {
  agregarEquipos,
  alternarEliminarLista,
  alternarQuitar,
  aplicarBorrador,
  crearBorrador,
  crearLista,
  diffFavoritos,
  renombrarLista,
  reordenar,
} from '../edicionFavoritos'

const ORIGINAL: FavList[] = [
  { name: 'Fileteo', machineIds: ['b200', 'b142'], machineNames: { b200: 'BAADER 200', b142: 'BAADER 142' } },
  { name: 'Cintas', machineIds: ['c1'], machineNames: { c1: 'Cinta 1' } },
]

const nuevo = () => crearBorrador(ORIGINAL)

describe('diffFavoritos', () => {
  it('sin cambios: nada que guardar ni clave', () => {
    const d = diffFavoritos(ORIGINAL, nuevo())
    expect(d.hayCambios).toBe(false)
    expect(d.requiereClave).toBe(false)
  })

  it('solo agregar: hay cambios y NO pide clave', () => {
    const b0 = nuevo()
    const b = agregarEquipos(b0, b0[0]!.key, [{ id: 'm1', nombre: 'MAREL HG' }, { id: 'b200', nombre: 'BAADER 200' }])
    const d = diffFavoritos(ORIGINAL, b)
    expect(d.agregados).toEqual([{ lista: 'Fileteo', machineId: 'm1' }])
    expect(d.hayCambios).toBe(true)
    expect(d.requiereClave).toBe(false)
    expect(aplicarBorrador(b)[0]!.machineIds).toEqual(['b200', 'b142', 'm1'])
  })

  it('quitar un equipo guardado: pide clave y lo saca del resultado', () => {
    const b0 = nuevo()
    const b = alternarQuitar(b0, b0[0]!.key, 'b142')
    const d = diffFavoritos(ORIGINAL, b)
    expect(d.quitados).toEqual([{ lista: 'Fileteo', machineId: 'b142', nombre: 'BAADER 142' }])
    expect(d.requiereClave).toBe(true)
    expect(aplicarBorrador(b)[0]!.machineIds).toEqual(['b200'])
    // des-marcar lo revierte
    expect(diffFavoritos(ORIGINAL, alternarQuitar(b, b0[0]!.key, 'b142')).hayCambios).toBe(false)
  })

  it('renombrar no es quitar: no pide clave', () => {
    const b0 = nuevo()
    const b = renombrarLista(b0, b0[1]!.key, 'Cintas de salida')
    const d = diffFavoritos(ORIGINAL, b)
    expect(d.renombres).toEqual([{ de: 'Cintas', a: 'Cintas de salida' }])
    expect(d.quitados).toEqual([])
    expect(d.listasEliminadas).toEqual([])
    expect(d.requiereClave).toBe(false)
    expect(d.hayCambios).toBe(true)
    expect(aplicarBorrador(b)[1]!.name).toBe('Cintas de salida')
  })

  it('agregar y quitar el mismo equipo en la tanda: no cuenta como quita', () => {
    const b0 = nuevo()
    let b = agregarEquipos(b0, b0[0]!.key, [{ id: 'm1', nombre: 'MAREL HG' }])
    b = alternarQuitar(b, b0[0]!.key, 'm1')
    const d = diffFavoritos(ORIGINAL, b)
    expect(d.quitados).toEqual([])
    expect(d.agregados).toEqual([])
    expect(d.hayCambios).toBe(false)
    expect(d.requiereClave).toBe(false)
  })

  it('vaciar una lista: pide clave y se guarda sin ella', () => {
    const b0 = nuevo()
    const b = alternarQuitar(b0, b0[1]!.key, 'c1')
    const d = diffFavoritos(ORIGINAL, b)
    expect(d.listasEliminadas).toEqual(['Cintas'])
    expect(d.quitados).toHaveLength(1)
    expect(d.requiereClave).toBe(true)
    expect(aplicarBorrador(b).map((l) => l.name)).toEqual(['Fileteo'])
  })

  it('eliminar una lista marcada: pide clave y cuenta todos sus equipos', () => {
    const b0 = nuevo()
    const b = alternarEliminarLista(b0, b0[0]!.key)
    const d = diffFavoritos(ORIGINAL, b)
    expect(d.listasEliminadas).toEqual(['Fileteo'])
    expect(d.quitados.map((q) => q.machineId)).toEqual(['b200', 'b142'])
    expect(d.requiereClave).toBe(true)
  })

  it('reordenar: hay cambios pero no pide clave', () => {
    const b0 = nuevo()
    const b = reordenar(b0, b0[0]!.key, 0, 1)
    const d = diffFavoritos(ORIGINAL, b)
    expect(d.hayCambios).toBe(true)
    expect(d.requiereClave).toBe(false)
    expect(aplicarBorrador(b)[0]!.machineIds).toEqual(['b142', 'b200'])
  })
})

describe('helpers de borrador', () => {
  it('no permite nombres vacíos ni repetidos al crear o renombrar', () => {
    const b0 = nuevo()
    expect(crearLista(b0, '   ').key).toBeNull()
    expect(crearLista(b0, 'cintas').key).toBeNull()
    expect(renombrarLista(b0, b0[0]!.key, 'CINTAS')).toBe(b0)
    expect(renombrarLista(b0, b0[0]!.key, '')).toBe(b0)
    const { borrador, key } = crearLista(b0, 'Nueva')
    expect(key).not.toBeNull()
    expect(borrador).toHaveLength(3)
  })

  it('una lista nueva sin equipos no se guarda', () => {
    const { borrador } = crearLista(nuevo(), 'Vacía')
    expect(aplicarBorrador(borrador)).toHaveLength(2)
    expect(diffFavoritos(ORIGINAL, borrador).hayCambios).toBe(false)
  })

  it('aplicarBorrador conserva machineNames', () => {
    const b0 = nuevo()
    const b = agregarEquipos(b0, b0[1]!.key, [{ id: 'x', nombre: 'GRADER' }])
    expect(aplicarBorrador(b)[1]!.machineNames).toEqual({ c1: 'Cinta 1', x: 'GRADER' })
  })
})
