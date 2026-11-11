import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelectorLinea } from '../SelectorLinea'
import { rutaMonitorConservandoVista } from '@/services/shoplogix/monitorDeLinea'

describe('SelectorLinea · Eviscerado | Filete', () => {
  afterEach(cleanup)

  it('sin línea hermana no se muestra', () => {
    const { container } = render(<SelectorLinea lineas={{ actual: 'Eviscerado', hermanas: [], onIr: () => {} }} />)
    expect(container.firstChild).toBeNull()
    const { container: c2 } = render(<SelectorLinea lineas={null} />)
    expect(c2.firstChild).toBeNull()
  })

  it('muestra las dos líneas en orden alfabético y al elegir la otra manda su token', () => {
    const onIr = vi.fn()
    render(<SelectorLinea lineas={{ actual: 'Eviscerado', hermanas: [{ nombre: 'Filete', token: 'tk-filete' }], onIr }} />)
    const a = screen.getByText('Eviscerado')
    const b = screen.getByText('Filete')
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(b)
    expect(onIr).toHaveBeenCalledWith('tk-filete')
  })

  it('elegir la línea en la que ya estás no navega', () => {
    const onIr = vi.fn()
    render(<SelectorLinea lineas={{ actual: 'Eviscerado', hermanas: [{ nombre: 'Filete', token: 'tk-filete' }], onIr }} />)
    fireEvent.click(screen.getByText('Eviscerado'))
    expect(onIr).not.toHaveBeenCalled()
  })

  it('el cambio conserva la pestaña de la URL', () => {
    expect(rutaMonitorConservandoVista('tk-filete', '?glass=v2&ver=analisis')).toContain('ver=analisis')
  })
})
