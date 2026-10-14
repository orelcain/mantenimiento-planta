import { describe, expect, it, vi } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({}))
vi.mock('@/hooks/repuestos/useGlobalSearch', () => ({ getGlobalRepuestosCache: () => null }))

import { buscarDestinoDeFusion, esSapDeAlta, planAltaSap, type RepuestoMinimo } from '../asignarSapMaestro'

const r = (id: string, extra: Partial<RepuestoMinimo> = {}): RepuestoMinimo => ({ id, codigoSAP: '', codigoFabricante: '', ...extra })

describe('esSapDeAlta', () => {
  it('exactamente 10 dígitos', () => {
    expect(esSapDeAlta('3300112345')).toBe(true)
    expect(esSapDeAlta(' 3300112345 ')).toBe(true)
    expect(esSapDeAlta('330011234')).toBe(false)
    expect(esSapDeAlta('33001123456')).toBe(false)
    expect(esSapDeAlta('33001123AB')).toBe(false)
  })
})

describe('buscarDestinoDeFusion (Asignar SAP del hub, sin cambios de comportamiento)', () => {
  const lista = [r('a', { codigoSAP: '3300000001' }), r('b', { codigoSAP: '3300000002' }), r('c')]
  it('el otro doc que ya tiene ese SAP', () => {
    expect(buscarDestinoDeFusion('3300000002', 'c', lista)?.id).toBe('b')
    expect(buscarDestinoDeFusion(' 3300000002 ', 'c', lista)?.id).toBe('b')
  })
  it('no se fusiona consigo misma ni con nadie si el SAP es nuevo', () => {
    expect(buscarDestinoDeFusion('3300000001', 'a', lista)).toBeUndefined()
    expect(buscarDestinoDeFusion('3300000009', 'c', lista)).toBeUndefined()
  })
})

describe('planAltaSap: qué hacer en el maestro al registrar el SAP de un alta', () => {
  const sap = '3300112345'
  it('hay un doc con ese código de fabricante y sin SAP → se le asigna el SAP', () => {
    expect(planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [r('x1', { codigoFabricante: '42203183' })] }))
      .toEqual({ accion: 'asignar-sap', id: 'x1' })
  })
  it('compara el código de fabricante normalizado («4220 3183» es 42203183)', () => {
    expect(planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [r('x1', { codigoFabricante: '4220 3183' })] }).accion).toBe('asignar-sap')
  })
  it('P1-3: el SAP ya es OTRO repuesto (otro código de fabricante) → error, no se cierra vinculada a él', () => {
    const plan = planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [], conEseSap: r('3300080929', { codigoSAP: sap, codigoFabricante: '42203310', textoBreve: 'MODULO RELE 42203310' }) })
    expect(plan).toMatchObject({ accion: 'error', motivo: 'sap-de-otro-repuesto', id: '3300080929', nombre: 'MODULO RELE 42203310' })
  })
  it('P1-3: sin nombre usa el código de fabricante del otro repuesto', () => {
    const plan = planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [], conEseSap: r('x', { codigoSAP: sap, codigoFabricante: '42203310' }) })
    expect(plan).toMatchObject({ accion: 'error', nombre: '42203310' })
  })
  it('el SAP ya es un doc del maestro sin código de fabricante → se lo completa', () => {
    expect(planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [], conEseSap: r(sap, { codigoSAP: sap }) }))
      .toEqual({ accion: 'completar-fabricante', id: sap, escribe: true })
  })
  it('el SAP ya es un doc con ese mismo código de fabricante → no hay nada que escribir', () => {
    expect(planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [], conEseSap: r(sap, { codigoSAP: sap, codigoFabricante: '42203183' }) }))
      .toEqual({ accion: 'completar-fabricante', id: sap, escribe: false })
  })
  it('si el SAP ya existe, manda sobre un doc de despiece del mismo código (no se duplica el SAP)', () => {
    const plan = planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [r('x1', { codigoFabricante: '42203183' })], conEseSap: r(sap, { codigoSAP: sap }) })
    expect(plan.accion).toBe('completar-fabricante')
  })
  it('el doc con ese código de fabricante ya tiene este SAP → ya estaba', () => {
    expect(planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [r('x1', { codigoFabricante: '42203183', codigoSAP: sap })] }))
      .toEqual({ accion: 'ya-estaba', id: 'x1' })
  })
  it('un doc con ese código de fabricante pero OTRO SAP no se pisa: se crea el del SAP nuevo', () => {
    expect(planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [r('x1', { codigoFabricante: '42203183', codigoSAP: '3300000099' })] }))
      .toEqual({ accion: 'crear', id: sap })
  })
  it('ninguno → se crea repuestos/{SAP}', () => {
    expect(planAltaSap({ sap, codigoFabricante: '42203183', porFabricante: [r('z', { codigoFabricante: '11111111' })] }))
      .toEqual({ accion: 'crear', id: sap })
  })
})
