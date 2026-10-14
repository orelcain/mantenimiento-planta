// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ContextoHojaAria } from '../ContextoHojaAria'

afterEach(cleanup)

describe('ContextoHojaAria', () => {
  it('muestra dónde está el usuario como encabezado de la hoja', () => {
    render(<ContextoHojaAria contexto="HMI Knuro · N1 · pantalla Principal" />)
    expect(screen.getByTestId('contexto-hoja-aria').textContent).toBe('HMI Knuro · N1 · pantalla Principal')
  })
})
