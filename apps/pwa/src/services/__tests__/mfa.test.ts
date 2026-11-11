/**
 * 2FA (TOTP) — lo que se puede probar sin activar el proveedor en producción:
 * cómo se reconoce el «falta el segundo paso», cómo se limpia el código y qué
 * assertion se arma para el login.
 */
import { describe, it, expect, vi } from 'vitest'

const assertionForSignIn = vi.fn((uid: string, code: string) => ({ uid, code }))
vi.mock('./../firebase', () => ({ auth: {} }))
vi.mock('firebase/auth', () => ({
  getMultiFactorResolver: vi.fn(),
  multiFactor: vi.fn(),
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    assertionForSignIn: (uid: string, code: string) => assertionForSignIn(uid, code),
  },
}))

import { pideSegundoPaso, limpiarCodigo, codigoCompleto, resolverConCodigo, mensajeError2FA } from '../mfa'

describe('mfa', () => {
  it('reconoce el error de segundo paso y nada más', () => {
    expect(pideSegundoPaso({ code: 'auth/multi-factor-auth-required' })).toBe(true)
    expect(pideSegundoPaso({ code: 'auth/invalid-credential' })).toBe(false)
    expect(pideSegundoPaso(null)).toBe(false)
  })

  it('deja solo 6 dígitos de lo que se pega o escribe', () => {
    expect(limpiarCodigo('123 456')).toBe('123456')
    expect(limpiarCodigo('12-34-56-78')).toBe('123456')
    expect(codigoCompleto('12345')).toBe(false)
    expect(codigoCompleto('123456')).toBe(true)
    expect(codigoCompleto('12345a')).toBe(false)
  })

  it('resuelve con el factor TOTP y el código limpio', async () => {
    const resolveSignIn = vi.fn(async (a: unknown) => ({ user: { uid: 'u1' }, a }))
    const resolver = { hints: [{ factorId: 'phone', uid: 'p' }, { factorId: 'totp', uid: 'f1' }], resolveSignIn }
    await resolverConCodigo(resolver as never, '654 321')
    expect(assertionForSignIn).toHaveBeenCalledWith('f1', '654321')
    expect(resolveSignIn).toHaveBeenCalledWith({ uid: 'f1', code: '654321' })
  })

  it('sin factor TOTP no inventa: explica el problema', async () => {
    const resolver = { hints: [{ factorId: 'phone', uid: 'p' }], resolveSignIn: vi.fn() }
    await expect(resolverConCodigo(resolver as never, '123456')).rejects.toThrow('segundo paso')
    expect(resolver.resolveSignIn).not.toHaveBeenCalled()
  })

  it('traduce los errores del código', () => {
    expect(mensajeError2FA({ code: 'auth/invalid-verification-code' })).toMatch(/Código incorrecto/)
    expect(mensajeError2FA({ code: 'auth/unverified-email' })).toMatch(/correo no está verificado/)
    expect(mensajeError2FA({ code: 'auth/operation-not-allowed' })).toMatch(/no está habilitado/)
  })
})
