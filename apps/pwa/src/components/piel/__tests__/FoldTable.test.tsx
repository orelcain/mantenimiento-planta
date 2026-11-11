/**
 * FoldTable: las filas con detalle se pliegan, el botón lleva aria-expanded y
 * tocar la fila (no solo el botón) también la abre.
 */
import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FoldTable } from '../FoldTable'

const columnas = [
  { id: 'maquina', label: 'Máquina' },
  { id: 'disp', label: 'Disp.', align: 'right' as const },
]

function tabla() {
  return render(
    <FoldTable
      caption="Máquinas"
      columns={columnas}
      rows={[
        { id: 'b1', cells: ['Baader 1', '78 %'], detail: <span>Detenciones: 4</span> },
        { id: 'b2', cells: ['Baader 2', '80 %'] },
      ]}
      cierre={{ id: 'cierre', cells: ['Cierre', '79 %'], destacada: true }}
      nota="Toca una fila."
    />,
  )
}

describe('FoldTable', () => {
  it('el detalle empieza plegado y el botón dice que está cerrado', () => {
    const { container } = tabla()
    const boton = container.querySelector('button')!
    expect(boton.getAttribute('aria-expanded')).toBe('false')
    const detalle = document.getElementById(boton.getAttribute('aria-controls')!)!
    expect(detalle.hasAttribute('hidden')).toBe(true)
  })

  it('tocar el botón despliega y vuelve a plegar', () => {
    const { container } = tabla()
    const boton = container.querySelector('button')!
    fireEvent.click(boton)
    expect(boton.getAttribute('aria-expanded')).toBe('true')
    const detalle = document.getElementById(boton.getAttribute('aria-controls')!)!
    expect(detalle.hasAttribute('hidden')).toBe(false)
    expect(detalle.textContent).toContain('Detenciones: 4')
    fireEvent.click(boton)
    expect(boton.getAttribute('aria-expanded')).toBe('false')
  })

  it('tocar la fila también la despliega', () => {
    const { container } = tabla()
    const fila = container.querySelector('tbody tr')!
    fireEvent.click(fila)
    expect(container.querySelector('button')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('solo las filas con detalle llevan botón; la fila de cierre va en peso 600', () => {
    const { container } = tabla()
    expect(container.querySelectorAll('button')).toHaveLength(1)
    const cierre = Array.from(container.querySelectorAll('tr')).find((tr) => tr.textContent?.includes('Cierre'))!
    expect(cierre.className).toContain('border-t-2')
    expect(Array.from(cierre.querySelectorAll('td')).every((td) => td.className.includes('font-semibold'))).toBe(true)
  })

  it('la tabla no tiene bordes verticales', () => {
    const { container } = tabla()
    const celdas = container.querySelectorAll('td, th')
    celdas.forEach((c) => expect(c.className).not.toMatch(/\bborder-[lr]\b|\bborder-x\b/))
  })
})
