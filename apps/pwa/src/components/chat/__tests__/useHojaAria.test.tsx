// @vitest-environment happy-dom
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { abrirAria, registrarAbrirAria } from '@/lib/pantallaCompletaMovil'
import { useHojaAria } from '../useHojaAria'

let cerrar: () => void = () => {}

/** Imita el orden de efectos del ChatBot: primero el registro (atiende la petición pendiente), luego la hoja. */
function Caso() {
  const [isOpen, setIsOpen] = useState(false)
  const [hoja, setHoja] = useHojaAria(isOpen)
  cerrar = () => setIsOpen(false)
  useEffect(() => registrarAbrirAria((_c, o) => {
    setIsOpen(true)
    setHoja(o?.hoja ? { contexto: o.contexto ?? '' } : null)
  }), [setHoja])
  return <span data-testid="estado">{isOpen ? 'abierto' : 'cerrado'}|{hoja?.contexto ?? 'normal'}</span>
}

afterEach(cleanup)

describe('useHojaAria', () => {
  it('una petición pendiente antes del montaje abre en modo hoja con su contexto', () => {
    abrirAria('hola', { hoja: true, contexto: 'Tarjeta A3C · B5' })
    render(<Caso />)
    expect(screen.getByTestId('estado').textContent).toBe('abierto|Tarjeta A3C · B5')
  })

  it('un cierre real reinicia la hoja', () => {
    render(<Caso />)
    act(() => abrirAria('x', { hoja: true, contexto: 'HMI Knuro · N1' }))
    expect(screen.getByTestId('estado').textContent).toBe('abierto|HMI Knuro · N1')
    act(() => cerrar())
    expect(screen.getByTestId('estado').textContent).toBe('cerrado|normal')
  })
})
