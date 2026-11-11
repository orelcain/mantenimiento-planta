import { describe, it, expect } from 'vitest'
import {
  LISTA_GENERAL, alternarEnLista, alternarFavorito, clavesDe, contarEnLista, contarFavoritos, crearLista,
  eliminarLista, esFavoritoDelEquipo, migrarListas, traducirIdLegacy,
} from '../favoritosEquipo'

const fila = (sap: string, fab = '') => ({ id: `d-${sap || fab}`, codigoSAP: sap, codigoFabricante: fab })

describe('traducirIdLegacy (listas de 2540bad2)', () => {
  it('inv-<SAP> pasa a SAP', () => expect(traducirIdLegacy('inv-3300126381')).toBe('3300126381'))
  it('id de catálogo estático pasa a fab:<código>', () => {
    expect(traducirIdLegacy('baader-142-resorte-38010604')).toBe('fab:38010604')
    expect(traducirIdLegacy('baader-142-38010160')).toBe('fab:38010160')
    expect(traducirIdLegacy('baader-142-1420000101')).toBe('fab:1420000101')
    expect(traducirIdLegacy('baader-142-cuchilla-rascador-baader-1424102001')).toBe('fab:1424102001')
  })
  it('lo ya estable y los docId sueltos no se tocan', () => {
    expect(traducirIdLegacy('3300103452')).toBe('3300103452')
    expect(traducirIdLegacy('fab:999 0543')).toBe('fab:999 0543')
    expect(traducirIdLegacy('nPyLbb78wIvkUCwmdE2A')).toBe('nPyLbb78wIvkUCwmdE2A')
  })
  it('es idempotente', () => {
    for (const id of ['inv-3300126381', 'baader-142-38010160', 'x']) expect(traducirIdLegacy(traducirIdLegacy(id))).toBe(traducirIdLegacy(id))
  })
})

describe('migrarListas', () => {
  it('traduce, quita repetidos y no muta la entrada', () => {
    const raw = [{ name: ' Resortes ', repuestoIds: ['inv-3300126381', '3300126381', 'baader-142-38010160'] }]
    const out = migrarListas(raw)
    expect(out).toEqual([{ name: 'Resortes', repuestoIds: ['3300126381', 'fab:38010160'] }])
    expect(raw[0]?.repuestoIds[0]).toBe('inv-3300126381')
  })
  it('tolera null y listas rotas', () => {
    expect(migrarListas(undefined)).toEqual([])
    expect(migrarListas([{ name: '', repuestoIds: ['1'] }, { name: 'A', repuestoIds: undefined as unknown as string[] }])).toEqual([{ name: 'A', repuestoIds: [] }])
  })
})

describe('contador de «Favoritos de este equipo»', () => {
  const listas = migrarListas([
    { name: 'Resortes', repuestoIds: ['inv-3300126381', 'baader-142-38010160'] },
    { name: 'Sensores', repuestoIds: ['inv-3300126381', '3300103452'] },
  ])
  const filas = [fila('3300126381', '38010111'), fila('3300011875', '38010160'), fila('3300103452'), fila('3300000001')]

  it('cuenta filas distintas (unión de listas): una pieza en dos listas cuenta una vez', () => {
    expect(contarFavoritos(listas, filas)).toBe(3)
  })
  it('una lista vieja por fabricante calza con la fila que tiene ese código', () => {
    expect(esFavoritoDelEquipo(listas, fila('3300011875', '38010160'))).toBe(true)
  })
  it('cuenta por lista', () => {
    expect(contarEnLista(listas[1]!, filas)).toBe(2)
    expect(contarEnLista(listas[0]!, filas)).toBe(2)
  })
  it('lo que se marca aparece en el contador y lo que se desmarca sale', () => {
    const f = fila('3300000001')
    const con = alternarFavorito(listas, f)
    expect(contarFavoritos(con, filas)).toBe(4)
    expect(con.find((l) => l.name === LISTA_GENERAL)?.repuestoIds).toEqual(['3300000001'])
    expect(contarFavoritos(alternarFavorito(con, f), filas)).toBe(3)
  })
})

describe('operaciones sobre listas', () => {
  it('desmarcar la estrella quita la pieza de TODAS las listas', () => {
    const l = migrarListas([{ name: 'A', repuestoIds: ['1'] }, { name: 'B', repuestoIds: ['1', '2'] }])
    expect(alternarFavorito(l, '1')).toEqual([{ name: 'A', repuestoIds: [] }, { name: 'B', repuestoIds: ['2'] }])
  })
  it('alternarEnLista agrega, quita y crea la lista si no existe', () => {
    let l = alternarEnLista([], 'Sensores', fila('3300103452'))
    expect(l).toEqual([{ name: 'Sensores', repuestoIds: ['3300103452'] }])
    l = alternarEnLista(l, 'Sensores', fila('3300103452'))
    expect(l).toEqual([{ name: 'Sensores', repuestoIds: [] }])
  })
  it('no crea nombres vacíos ni repetidos', () => {
    const l = [{ name: 'A', repuestoIds: [] }]
    expect(crearLista(l, '  ')).toEqual(l)
    expect(crearLista(l, 'A')).toEqual(l)
    expect(crearLista(l, 'B', '9')).toEqual([...l, { name: 'B', repuestoIds: ['9'] }])
  })
  it('eliminar una lista no toca las demás', () => {
    expect(eliminarLista([{ name: 'A', repuestoIds: ['1'] }, { name: 'B', repuestoIds: [] }], 'A')).toEqual([{ name: 'B', repuestoIds: [] }])
  })
  it('la clave principal es el SAP si lo hay', () => {
    expect(clavesDe(fila('3300103452', 'G1599'))).toEqual(['3300103452', 'fab:G1599'])
    expect(clavesDe({ id: 'x' })).toEqual(['id:x'])
  })
})
