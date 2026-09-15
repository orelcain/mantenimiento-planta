import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { CampoEntero } from '../CampoEntero'
import { enteroDesdeTexto } from '@/lib/entero'

afterEach(cleanup)

describe('enteroDesdeTexto', () => {
  it('vacío NO es el mínimo: no hay número todavía', () => {
    expect(enteroDesdeTexto('', 5)).toBeNull()
    expect(enteroDesdeTexto('  ', 1)).toBeNull()
  })

  it('respeta el mínimo y rechaza decimales, negativos y texto', () => {
    expect(enteroDesdeTexto('30', 5)).toBe(30)
    expect(enteroDesdeTexto('3', 5)).toBeNull()
    expect(enteroDesdeTexto('2.5', 1)).toBeNull()
    expect(enteroDesdeTexto('-4', 1)).toBeNull()
    expect(enteroDesdeTexto('treinta', 1)).toBeNull()
  })
})

describe('CampoEntero', () => {
  it('borrar y escribir 30 da 30, no 4530 ni 545', () => {
    const onChange = vi.fn()
    render(<CampoEntero value={45} min={5} onChange={onChange} aria-label="Minutos" />)
    const campo = screen.getByLabelText('Minutos') as HTMLInputElement
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: '' } })
    expect(campo.value).toBe('')
    expect(onChange).not.toHaveBeenCalled() // vacío no manda nada hacia arriba
    fireEvent.change(campo, { target: { value: '3' } })
    expect(onChange).not.toHaveBeenCalled() // 3 está bajo el mínimo (5)
    fireEvent.change(campo, { target: { value: '30' } })
    expect(onChange).toHaveBeenCalledWith(30)
  })

  it('salir con el campo vacío vuelve al último valor bueno', () => {
    const onChange = vi.fn()
    render(<CampoEntero value={45} min={5} onChange={onChange} aria-label="Minutos" />)
    const campo = screen.getByLabelText('Minutos') as HTMLInputElement
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: '' } })
    fireEvent.blur(campo)
    expect(campo.value).toBe('45')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('no deja escribir letras ni signos', () => {
    render(<CampoEntero value={1} min={1} onChange={vi.fn()} aria-label="Personas" />)
    const campo = screen.getByLabelText('Personas') as HTMLInputElement
    fireEvent.focus(campo)
    fireEvent.change(campo, { target: { value: '2a-,' } })
    expect(campo.value).toBe('2')
  })
})
