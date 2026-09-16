import { describe, expect, it } from 'vitest'
import { describirDispositivo, diasRestantes, fechaCorta, leerQrDeHash, mensajeDeError, urlDelPase, usuarioDePase } from '../paseBitacora'

describe('pase de bitácora (cliente)', () => {
  it('el QR lleva planta y token en el # y se lee de vuelta', () => {
    const url = urlDelPase('https://orelcain.github.io', '/mantenimiento-planta/', { plantId: 'chonchi', token: 'Ab_c-1234567890XYZ' })
    expect(url).toBe('https://orelcain.github.io/mantenimiento-planta/pase-bitacora#p=chonchi&t=Ab_c-1234567890XYZ')
    expect(leerQrDeHash(new URL(url).hash)).toEqual({ plantId: 'chonchi', token: 'Ab_c-1234567890XYZ' })
    expect(urlDelPase('http://localhost:5189', '/mantenimiento-planta', { plantId: 'chonchi', token: 'x'.repeat(20) })).toContain(
      '/mantenimiento-planta/pase-bitacora#',
    )
  })

  it('un # incompleto o raro no es un QR', () => {
    expect(leerQrDeHash('')).toBeNull()
    expect(leerQrDeHash('#p=chonchi')).toBeNull()
    expect(leerQrDeHash('#p=chonchi&t=corto')).toBeNull()
    expect(leerQrDeHash('#p=../x&t=Ab_c-1234567890XYZ')).toBeNull()
    expect(leerQrDeHash('#p=chonchi&t=<script>alert(1)</script>')).toBeNull()
  })

  it('el usuario del pase lleva el nombre COMPLETO (las reglas lo comparan exacto)', () => {
    const u = usuarioDePase('pase_1', { plantId: 'chonchi', nombre: 'Juan Pablo Pérez' })
    expect(u.nombre).toBe('Juan Pablo Pérez')
    expect(u.apellido).toBe('')
    expect(u.paseBitacora).toEqual({ plantId: 'chonchi', nombre: 'Juan Pablo Pérez' })
    expect(u.rol).toBe('usuario')
  })

  it('días que le quedan al QR y fecha corta', () => {
    const ahora = Date.UTC(2026, 8, 16, 12)
    expect(diasRestantes(ahora + 30 * 86_400_000, ahora)).toBe(30)
    expect(diasRestantes(ahora + 1000, ahora)).toBe(1)
    expect(diasRestantes(ahora - 1, ahora)).toBe(0)
    expect(diasRestantes(null, ahora)).toBe(0)
    expect(fechaCorta(new Date(2026, 9, 16).getTime())).toBe('16-10-2026')
  })

  it('distingue el teléfono y deja pasar solo los mensajes del servidor', () => {
    expect(describirDispositivo('Mozilla/5.0 (Linux; Android 14; SM-A546E) Mobile Safari')).toBe('Android')
    expect(describirDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone')
    expect(describirDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('PC Windows')
    expect(mensajeDeError({ code: 'functions/permission-denied', message: 'PIN incorrecto. Quedan 4 intentos antes del bloqueo.' })).toMatch(/PIN incorrecto/)
    expect(mensajeDeError({ code: 'functions/internal', message: 'INTERNAL stack…' })).not.toMatch(/stack/)
  })
})
