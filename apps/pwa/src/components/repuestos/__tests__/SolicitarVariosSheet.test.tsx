// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SolicitarVariosSheet } from '../SolicitarVariosSheet'
import type { PiezaSolicitable } from '@/utils/repuestos/solicitudMultiple'

// Piezas reales de la BAADER 200 (inventario 25-09-26).
const PIEZAS: PiezaSolicitable[] = [
  { clave: 'a', codigoSAP: '3300106403', textoBreve: 'CUCHILLA CIRC 200MM 94011760', comun: true, cantidadPorMaquina: 40, stock: { configurado: true, stockActual: 20 } },
  { clave: 'b', codigoSAP: '3300051215', textoBreve: 'RODILLO 92152025', stock: { configurado: true, stockActual: 5 } },
  { clave: 'd', codigoSAP: '', textoBreve: 'GUIA DE COJINETE 2000400006', codigoFabricante: '2000400006' },
]

afterEach(cleanup)

describe('Solicitar varios repuestos', () => {
  it('marca dos, sube una cantidad, avisa del stock y crea las dos solicitudes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<SolicitarVariosSheet open onClose={() => {}} maquina="BAADER 200" piezas={PIEZAS} onSubmit={onSubmit} />)
    expect(screen.getByText('Comunes de la máquina · 1')).toBeTruthy()
    expect(screen.getByText(/la máquina lleva 40/)).toBeTruthy()
    // arranca en 1 aunque la máquina lleve 40
    fireEvent.click(screen.getByLabelText('Marcar CUCHILLA CIRC 200MM 94011760'))
    expect((screen.getByLabelText('Cantidad de CUCHILLA CIRC 200MM 94011760') as HTMLInputElement).value).toBe('1')
    fireEvent.click(screen.getByLabelText('Marcar RODILLO 92152025'))
    fireEvent.change(screen.getByLabelText('Cantidad de RODILLO 92152025'), { target: { value: '6' } })
    expect(screen.getByText(/hay 5 pzas.*no alcanza para 6/)).toBeTruthy()
    expect(screen.getByText(/2 repuestos · 7 unidades/)).toBeTruthy()
    // la pieza sin SAP no se puede marcar
    expect((screen.getByLabelText('Marcar GUIA DE COJINETE 2000400006') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Solicitar 2 repuestos/ }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]![0].map((s: { codigoSAP: string; cantidad: number }) => [s.codigoSAP, s.cantidad]))
      .toEqual([['3300106403', 1], ['3300051215', 6]])
  })

  it('el buscador filtra y el botón queda deshabilitado sin nada marcado', () => {
    render(<SolicitarVariosSheet open onClose={() => {}} maquina="BAADER 200" piezas={PIEZAS} onSubmit={vi.fn()} />)
    expect((screen.getByRole('button', { name: 'Solicitar' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Buscar repuesto'), { target: { value: 'rodillo' } })
    expect(screen.queryByText('CUCHILLA CIRC 200MM 94011760')).toBeNull()
    expect(screen.getByText('RODILLO 92152025')).toBeTruthy()
  })
})
