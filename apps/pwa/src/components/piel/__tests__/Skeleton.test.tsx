/**
 * Esqueletos con forma: anuncian la carga una sola vez (role=status con su
 * rótulo), dibujan la cantidad de filas pedida y no dejan nada enfocable.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SkeletonFilas, SkeletonTabla, SkeletonPanel, SkeletonGrafico } from '../Skeleton'

afterEach(cleanup)

describe('Esqueletos con forma', () => {
  it('SkeletonFilas anuncia la carga y dibuja una fila con filete por elemento', () => {
    render(<SkeletonFilas label="Cargando bodega" filas={5} />)
    const estado = screen.getByRole('status', { name: 'Cargando bodega' })
    expect(estado.querySelectorAll(':scope > .border-b')).toHaveLength(5)
  })

  it('SkeletonFilas sin cola no dibuja la cifra de la derecha', () => {
    const { container } = render(<SkeletonFilas label="x" filas={1} lineas={1} cola={false} />)
    expect(container.querySelectorAll('[aria-hidden]')).toHaveLength(1)
  })

  it('SkeletonTabla dibuja cabecera más filas, con la cantidad de columnas pedida', () => {
    render(<SkeletonTabla label="Cargando repuestos" filas={3} columnas={4} />)
    const estado = screen.getByRole('status', { name: 'Cargando repuestos' })
    const filas = estado.querySelectorAll(':scope > .grid')
    expect(filas).toHaveLength(4)
    expect(filas[0]?.children).toHaveLength(4)
  })

  it('SkeletonPanel con kpis y gráfico tiene un solo status', () => {
    render(<SkeletonPanel label="Cargando turno" kpis={4} grafico="10rem" />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('SkeletonGrafico suelto con rótulo es un status; dentro de un panel no', () => {
    render(<SkeletonGrafico label="Cargando gráfico" alto="8rem" />)
    expect(screen.getByRole('status', { name: 'Cargando gráfico' })).toBeTruthy()
  })

  it('nada del esqueleto es enfocable', () => {
    const { container } = render(<SkeletonPanel label="x" kpis={2} grafico="4rem" />)
    expect(container.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })
})
