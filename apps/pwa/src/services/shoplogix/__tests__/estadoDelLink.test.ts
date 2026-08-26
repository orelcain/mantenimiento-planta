/**
 * El monitor decía «Este link ya no está disponible — pide uno nuevo a
 * Mantención» ante CUALQUIER error del stream, incluida una caída de red. En
 * planta, con señal mala, eso manda a pedir un link que no hace falta.
 */
import { describe, it, expect } from 'vitest'
import { estadoDelLink } from '../estadoDelLink'

const err = (code: string) => Object.assign(new Error(code), { code })

describe('estadoDelLink', () => {
  it('el link revocado o vencido lo corta la regla: eso sí es "gone"', () => {
    expect(estadoDelLink(err('permission-denied'))).toBe('gone')
    expect(estadoDelLink(err('not-found'))).toBe('gone')
    expect(estadoDelLink(err('invalid-argument'))).toBe('gone')
  })

  it('⚠ la red caída NO mata el link', () => {
    expect(estadoDelLink(err('unavailable'))).toBe('sin-conexion')
    expect(estadoDelLink(err('deadline-exceeded'))).toBe('sin-conexion')
    expect(estadoDelLink(err('cancelled'))).toBe('sin-conexion')
    expect(estadoDelLink(err('internal'))).toBe('sin-conexion')
  })

  it('acepta el prefijo que a veces trae el SDK', () => {
    expect(estadoDelLink(err('firestore/permission-denied'))).toBe('gone')
  })

  it('no distingue mayúsculas', () => {
    expect(estadoDelLink(err('PERMISSION-DENIED'))).toBe('gone')
  })

  it('ante la duda, transitorio — nunca mandar a pedir un link que sirve', () => {
    expect(estadoDelLink(new Error('vaya usted a saber'))).toBe('sin-conexion')
    expect(estadoDelLink(null)).toBe('sin-conexion')
    expect(estadoDelLink(undefined)).toBe('sin-conexion')
    expect(estadoDelLink({})).toBe('sin-conexion')
    expect(estadoDelLink('texto suelto')).toBe('sin-conexion')
  })
})

/**
 * El error REAL que tira el SDK de Firestore cuando no hay red. Se deja escrito
 * porque el shape del objeto es lo único que sostiene el `switch`: si el SDK
 * cambiara `code`, este test cae y no la pantalla en planta.
 */
describe('el error tal como llega del SDK', () => {
  it('FirebaseError de red → sin-conexion', () => {
    const real = Object.assign(new Error('Failed to get document because the client is offline.'), {
      name: 'FirebaseError', code: 'unavailable',
    })
    expect(estadoDelLink(real)).toBe('sin-conexion')
  })

  it('FirebaseError de reglas → gone', () => {
    const real = Object.assign(new Error('Missing or insufficient permissions.'), {
      name: 'FirebaseError', code: 'permission-denied',
    })
    expect(estadoDelLink(real)).toBe('gone')
  })
})
