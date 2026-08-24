import { describe, it, expect } from 'vitest'
import { esAccesoDenegado } from '../graderPublicToken.service'

/**
 * La expiración del link se chequea en las REGLAS de Firestore. Un token
 * vencido no llega como documento vencido: llega como `permission-denied`, y
 * la vista pública lo estaba mostrando como "El link no es válido o fue
 * eliminado" — sin decirle a la persona que solo tiene que pedir otro.
 */
describe('esAccesoDenegado', () => {
  it('reconoce el error de reglas de Firestore', () => {
    expect(esAccesoDenegado({ code: 'permission-denied' })).toBe(true)
    expect(esAccesoDenegado({ code: 'firestore/permission-denied' })).toBe(true)
  })

  it('no confunde otros errores con falta de permiso', () => {
    expect(esAccesoDenegado({ code: 'unavailable' })).toBe(false)
    expect(esAccesoDenegado(new Error('network'))).toBe(false)
    expect(esAccesoDenegado(null)).toBe(false)
    expect(esAccesoDenegado(undefined)).toBe(false)
  })
})
