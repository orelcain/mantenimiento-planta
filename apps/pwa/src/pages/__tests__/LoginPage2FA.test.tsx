/**
 * Login con 2FA: si la contraseña es correcta pero la cuenta tiene app
 * autenticadora, la página pide el código y solo entra con él.
 * No se puede probar en el navegador sin activar TOTP en producción.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const navigate = vi.fn()
const setUser = vi.fn()
const signIn = vi.fn()
const completarIngreso = vi.fn()
const resolverConCodigo = vi.fn()
const resolver = { hints: [{ factorId: 'totp', uid: 'f1' }] }

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/store', () => ({ useAuthStore: (sel: (s: unknown) => unknown) => sel({ setUser }) }))
vi.mock('@/services/auth', () => ({
  signIn: (...a: unknown[]) => signIn(...a),
  completarIngreso: (...a: unknown[]) => completarIngreso(...a),
  signUpWithInviteCode: vi.fn(),
  initGoogleSignIn: vi.fn(),
  renderGoogleButton: vi.fn(),
  setAuthPersistence: vi.fn(async () => {}),
}))
vi.mock('@/services/mfa', async (orig) => ({
  ...(await orig<typeof import('@/services/mfa')>()),
  resolverDe: () => resolver,
  resolverConCodigo: (...a: unknown[]) => resolverConCodigo(...a),
}))
vi.mock('@/services/firebase', () => ({ auth: {} }))

import { LoginPage } from '../LoginPage'

beforeEach(() => {
  localStorage.clear()
  signIn.mockRejectedValue({ code: 'auth/multi-factor-auth-required' })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function llegarAlCodigo() {
  render(<MemoryRouter><LoginPage /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'admin@empresa.com' } })
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave-correcta' } })
  fireEvent.click(screen.getByRole('button', { name: /Iniciar Sesión/ }))
  return screen.findByLabelText('Código de la app autenticadora')
}

describe('LoginPage con 2FA', () => {
  it('con contraseña correcta pide el código y no entra todavía', async () => {
    await llegarAlCodigo()
    expect(setUser).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect((screen.getByRole('button', { name: /Verificar/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('con el código correcto entra', async () => {
    resolverConCodigo.mockResolvedValue({ user: { uid: 'u1' } })
    completarIngreso.mockResolvedValue({ id: 'u1', email: 'admin@empresa.com', rol: 'admin', activo: true })
    const campo = await llegarAlCodigo()
    fireEvent.change(campo, { target: { value: '123 456' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar/ }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(resolverConCodigo).toHaveBeenCalledWith(resolver, '123456')
    expect(setUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }))
  })

  it('con el código errado no entra y lo dice', async () => {
    resolverConCodigo.mockRejectedValue({ code: 'auth/invalid-verification-code' })
    const campo = await llegarAlCodigo()
    fireEvent.change(campo, { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: /Verificar/ }))
    expect(await screen.findByText(/Código incorrecto/)).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
    expect(setUser).not.toHaveBeenCalled()
  })
})
