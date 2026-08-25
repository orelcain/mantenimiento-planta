/**
 * `fcmTokens` está vacío: 0 dispositivos registrados en toda la app. La Cloud
 * Function devuelve `{ success: true, skipped: true, reason: 'no_tokens' }` y
 * nadie se entera; el switch de configuración prometía "push a todos los
 * usuarios activos".
 */
import { describe, it, expect } from 'vitest'
import { avisoDispositivosPush } from '../avisoDispositivosPush'

describe('avisoDispositivosPush', () => {
  it('con cero dispositivos avisa que no le llega a nadie', () => {
    const aviso = avisoDispositivosPush(0)
    expect(aviso.tono).toBe('alerta')
    expect(aviso.texto).toContain('no le llegan a nadie')
    expect(aviso.texto).toContain('Ajustes → Notificaciones')
  })

  it('con uno no dice "1 dispositivos"', () => {
    expect(avisoDispositivosPush(1)).toEqual({ tono: 'ok', texto: 'Llega a 1 dispositivo registrado.' })
  })

  it('con varios dice cuántos', () => {
    expect(avisoDispositivosPush(4)).toMatchObject({ tono: 'ok', texto: 'Llega a 4 dispositivos registrados.' })
  })

  it('mientras cuenta no afirma nada', () => {
    expect(avisoDispositivosPush(null).tono).toBe('cargando')
  })
})
