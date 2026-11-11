import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { FuenteRepuestos } from '@/services/bitacora/repuestosBitacora'
import { RepuestosUsados } from '../RepuestosUsados'

afterEach(cleanup)

const fuente: FuenteRepuestos = {
  porCodigo: vi.fn(async () => null),
  delEquipo: vi.fn(async () => []),
  todos: vi.fn(async () => []),
  bodegaDe: vi.fn(async () => new Map()),
  guardarNombreComun: vi.fn(async () => undefined),
}

const valor = [
  { codigoSAP: '3300012407', nombre: 'MUELLE 38010321', nombreComun: 'Resorte medidor largo', cantidad: 2 },
  { codigoSAP: '3300011654', nombre: 'ANILLO 31000251', cantidad: 3 },
]

describe('RepuestosUsados como tabla (PC)', () => {
  it('dibuja una fila por repuesto y cierra con el total de unidades', () => {
    render(<RepuestosUsados valor={valor} onChange={() => {}} equipoId={null} fuente={fuente} comoTabla />)
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('Resorte medidor largo')).toBeTruthy()
    expect(screen.getByText('2 repuestos, 5 UN')).toBeTruthy()
  })

  it('los controles de cantidad y quitar siguen cambiando el valor', () => {
    const onChange = vi.fn()
    render(<RepuestosUsados valor={[valor[0]!]} onChange={onChange} equipoId={null} fuente={fuente} comoTabla />)
    fireEvent.click(screen.getByRole('button', { name: 'Uno más' }))
    expect(onChange).toHaveBeenLastCalledWith([{ ...valor[0], cantidad: 3 }])
    fireEvent.click(screen.getByRole('button', { name: 'Quitar 3300012407' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('sin `comoTabla` conserva la lista del celular', () => {
    render(<RepuestosUsados valor={valor} onChange={() => {}} equipoId={null} fuente={fuente} />)
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.getByRole('list', { name: 'Repuestos agregados' })).toBeTruthy()
  })
})
