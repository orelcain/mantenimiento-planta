import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MAX_RECIENTES } from '@/utils/recorridoPlano'
import {
  CLAVE_RECIENTES_REPUESTOS,
  leerRecientesRepuestos,
  registrarRecienteEquipo,
  registrarRecienteRepuesto,
  limpiarRecientesRepuestos,
} from '../recientesRepuestos'

describe('recientesRepuestos', () => {
  const datos = new Map<string, string>()
  const almacenamiento = {
    getItem: vi.fn((clave: string) => datos.get(clave) ?? null),
    setItem: vi.fn((clave: string, valor: string) => { datos.set(clave, valor) }),
    removeItem: vi.fn((clave: string) => { datos.delete(clave) }),
  }

  beforeEach(() => {
    datos.clear()
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', almacenamiento)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('guarda prefijos e:/r: y distingue el mismo id por tipo', () => {
    registrarRecienteEquipo('123', 'Motor')
    registrarRecienteRepuesto('123', 'Rodamiento')
    expect(JSON.parse(datos.get(CLAVE_RECIENTES_REPUESTOS)!)).toEqual([
      { c: 'r:123', n: 'Rodamiento' }, { c: 'e:123', n: 'Motor' },
    ])
    expect(leerRecientesRepuestos()).toEqual([
      { tipo: 'repuesto', id: '123', nombre: 'Rodamiento' },
      { tipo: 'equipo', id: '123', nombre: 'Motor' },
    ])
  })

  it('conserva solamente los ocho mas recientes', () => {
    for (let i = 0; i < MAX_RECIENTES + 3; i++) registrarRecienteRepuesto(String(i), '')
    expect(leerRecientesRepuestos().map(({ id }) => id)).toEqual(['10', '9', '8', '7', '6', '5', '4', '3'])
    expect(JSON.parse(datos.get(CLAVE_RECIENTES_REPUESTOS)!)).toHaveLength(MAX_RECIENTES)
  })

  it.each([registrarRecienteEquipo, registrarRecienteRepuesto])('reordena sin duplicar y conserva o actualiza el nombre', (registrar) => {
    registrar('1', 'Anterior')
    registrar('2', 'Segundo')
    registrar('1', '')
    expect(leerRecientesRepuestos().map(({ id, nombre }) => ({ id, nombre }))).toEqual([
      { id: '1', nombre: 'Anterior' }, { id: '2', nombre: 'Segundo' },
    ])
    registrar('1', 'Actualizado')
    expect(leerRecientesRepuestos()[0]?.nombre).toBe('Actualizado')
    expect(leerRecientesRepuestos()).toHaveLength(2)
  })

  it('descarta prefijos invalidos e ids vacios y usa el id si falta nombre', () => {
    datos.set(CLAVE_RECIENTES_REPUESTOS, JSON.stringify([
      { c: '123' }, { c: 'x:123' }, { c: 'e:' }, { c: 'r:   ' },
      { c: 'e:equipo' }, { c: 'r:SAP', n: '' }, 'r:legacy',
    ]))
    expect(leerRecientesRepuestos()).toEqual([
      { tipo: 'equipo', id: 'equipo', nombre: 'equipo' },
      { tipo: 'repuesto', id: 'SAP', nombre: 'SAP' },
      { tipo: 'repuesto', id: 'legacy', nombre: 'legacy' },
    ])
  })

  it.each(['{roto', 'null', '{}', '[null, 42, {"c": 5}]'])('tolera datos corruptos: %s', (crudo) => {
    datos.set(CLAVE_RECIENTES_REPUESTOS, crudo)
    expect(leerRecientesRepuestos()).toEqual([])
    expect(() => registrarRecienteEquipo('1', 'Motor')).not.toThrow()
    expect(leerRecientesRepuestos()).toEqual([{ tipo: 'equipo', id: '1', nombre: 'Motor' }])
  })

  it('limpia solo el historial de repuestos', () => {
    datos.set('otra-clave', 'conservar')
    registrarRecienteEquipo('1', 'Motor')
    limpiarRecientesRepuestos()
    expect(datos.has(CLAVE_RECIENTES_REPUESTOS)).toBe(false)
    expect(leerRecientesRepuestos()).toEqual([])
    expect(datos.get('otra-clave')).toBe('conservar')
  })

  it('ignora ids vacios o de espacios sin acceder al almacenamiento', () => {
    for (const id of ['', '   ', '\t\n']) {
      registrarRecienteEquipo(id, 'Motor')
      registrarRecienteRepuesto(id, 'Pieza')
    }
    expect(almacenamiento.getItem).not.toHaveBeenCalled()
    expect(almacenamiento.setItem).not.toHaveBeenCalled()
  })

  it('tolera localStorage inexistente', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(leerRecientesRepuestos()).toEqual([])
    expect(() => registrarRecienteEquipo('1', 'Motor')).not.toThrow()
    expect(() => registrarRecienteRepuesto('2', 'Pieza')).not.toThrow()
    expect(() => limpiarRecientesRepuestos()).not.toThrow()
  })

  it.each(['getItem', 'setItem', 'removeItem'] as const)('tolera %s bloqueado', (metodo) => {
    vi.stubGlobal('localStorage', {
      ...almacenamiento,
      [metodo]: () => { throw new Error('Almacenamiento bloqueado') },
    })
    expect(leerRecientesRepuestos()).toEqual([])
    expect(() => registrarRecienteEquipo('1', 'Motor')).not.toThrow()
    expect(() => registrarRecienteRepuesto('2', 'Pieza')).not.toThrow()
    expect(() => limpiarRecientesRepuestos()).not.toThrow()
  })
})
