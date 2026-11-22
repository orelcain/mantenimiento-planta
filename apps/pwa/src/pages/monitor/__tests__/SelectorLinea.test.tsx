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

  it('muestra Eviscerado, Filete y Yal en orden fijo, agrupados por planta, y al elegir Yal manda su token', () => {
    const onIr = vi.fn()
    render(<SelectorLinea lineas={{
      actual: 'chonchi-eviscerado',
      hermanas: [
        { nombre: 'Yal', token: 'tk-yal', plantLineId: 'yal-eviscerado' },
        { nombre: 'Filete', token: 'tk-filete', plantLineId: 'chonchi-filete' },
      ],
      onIr,
    }} />)
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['Eviscerado', 'Filete', 'Yal'])
    expect(screen.getAllByText('Planta Principal').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Referencia').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('tab', { name: 'Yal' }))
    expect(onIr).toHaveBeenCalledWith('tk-yal')
  })

  it('Yal sin elegir va con la tinta atenuada; la ayuda de Referencia dice para qué está', () => {
    render(<SelectorLinea lineas={{
      actual: 'chonchi-eviscerado',
      hermanas: [{ nombre: 'Yal', token: 'tk-yal', plantLineId: 'yal-eviscerado' }],
      onIr: () => {},
    }} />)
    expect(screen.getByRole('tab', { name: 'Yal' }).querySelector(':scope > span')?.className).toContain('text-muted-foreground')
    expect(screen.getByText('Yal la mantiene otro equipo de Mantención. Se muestra para comparar.')).toBeTruthy()
  })

  it('elegir la línea en la que ya estás no navega', () => {
    const onIr = vi.fn()
    render(<SelectorLinea lineas={{ actual: 'chonchi-eviscerado', hermanas: [{ nombre: 'Filete', token: 'tk-filete', plantLineId: 'chonchi-filete' }], onIr }} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Eviscerado' }))
    expect(onIr).not.toHaveBeenCalled()
  })

  it('el cambio conserva la pestaña de la URL', () => {
    expect(rutaMonitorConservandoVista('tk-filete', '?glass=v2&ver=analisis')).toContain('ver=analisis')
  })
})
