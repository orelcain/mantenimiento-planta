// @vitest-environment happy-dom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectorSeccion } from '../SelectorSeccion'

const OPCIONES = [
  { value: 'manual', label: 'Manual' },
  { value: 'procedures', label: 'Procedimientos' },
  { value: 'quiz', label: 'Evaluación', hecho: true },
] as const

function Caso() {
  const [v, setV] = useState<'manual' | 'procedures' | 'quiz'>('manual')
  return <SelectorSeccion value={v} onChange={setV} opciones={OPCIONES} />
}

afterEach(cleanup)

describe('SelectorSeccion', () => {
  it('el botón mide 48 px y muestra la sección actual', () => {
    render(<Caso />)
    const boton = screen.getByRole('button', { name: /Sección/ })
    expect(boton.className).toContain('h-[48px]')
    expect(boton.textContent).toContain('Manual')
  })

  it('«Sección ▾» abre un Sheet con la lista, elegir una sección lo cierra y cambia el botón', () => {
    render(<Caso />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Sección/ }))
    const hoja = screen.getByRole('dialog')
    expect(hoja).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Procedimientos/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /Sección/ }).textContent).toContain('Procedimientos')
  })

  it('marca la sección actual con aria-current', () => {
    render(<Caso />)
    fireEvent.click(screen.getByRole('button', { name: /Sección/ }))
    expect(screen.getByRole('button', { name: /Manual/, current: true })).toBeTruthy()
  })
})
