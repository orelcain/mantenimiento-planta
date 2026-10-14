import { describe, expect, it, vi } from 'vitest'
import { abrirAria, registrarAbrirAria } from '../pantallaCompletaMovil'

describe('abrirAria', () => {
  it('entrega la consulta y las opciones de hoja (contexto) al chat registrado', () => {
    const fn = vi.fn()
    const baja = registrarAbrirAria(fn)
    abrirAria('Estoy en el HMI Knuro. ', { hoja: true, contexto: 'HMI Knuro · N1 · pantalla Principal' })
    expect(fn).toHaveBeenCalledWith('Estoy en el HMI Knuro. ', { hoja: true, contexto: 'HMI Knuro · N1 · pantalla Principal' })
    baja()
  })

  it('sin opciones se abre como siempre (panel flotante)', () => {
    const fn = vi.fn()
    const baja = registrarAbrirAria(fn)
    abrirAria('hola')
    expect(fn).toHaveBeenCalledWith('hola', undefined)
    baja()
  })

  it('si el chat aún no se registró, la petición espera con sus opciones', () => {
    abrirAria('antes', { hoja: true, contexto: 'Tarjeta A3C · B5' })
    const fn = vi.fn()
    const baja = registrarAbrirAria(fn)
    expect(fn).toHaveBeenCalledWith('antes', { hoja: true, contexto: 'Tarjeta A3C · B5' })
    baja()
  })
})
