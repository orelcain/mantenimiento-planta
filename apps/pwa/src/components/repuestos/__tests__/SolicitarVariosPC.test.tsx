// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { SolicitarVariosSheet } from '../SolicitarVariosSheet'
import type { PiezaSolicitable } from '@/utils/repuestos/solicitudMultiple'

vi.mock('@/hooks/useEsPC', () => ({ useEsPC: () => true }))

// Repuestos reales de la Baader 142 (Firestore, 09-11-2026).
const PIEZAS: PiezaSolicitable[] = [
  { clave: 'a', codigoSAP: '3300012407', textoBreve: 'MUELLE 38010321', nombresComunes: ['Resorte medidor largo'], codigoFabricante: '38010321', comun: true, cantidadPorMaquina: 44, stock: { configurado: true, stockActual: 2, ubicacionBodega: 'C-1' } },
  { clave: 'b', codigoSAP: '3300011872', textoBreve: 'CORREA 37750006', nombresComunes: ['Correa cuchilla circular'], comun: true, stock: { configurado: true, stockActual: 0, ubicacionBodega: 'C-3' } },
  { clave: 'd', codigoSAP: '', textoBreve: 'GUIA DE COJINETE 2000400006', codigoFabricante: '2000400006' },
]

afterEach(cleanup)

const abrir = (onSubmit = vi.fn().mockResolvedValue(undefined)) => {
  render(<SolicitarVariosSheet open onClose={() => {}} maquina="EVISCERADORA BAADER 142 N1" piezas={PIEZAS} onSubmit={onSubmit} />)
  return { onSubmit, panel: within(screen.getByRole('complementary', { name: 'Repuestos a solicitar' })) }
}

describe('Solicitar repuestos en PC', () => {
  it('lo marcado aparece en el panel con su aviso y el total', () => {
    const { panel } = abrir()
    expect(panel.getByText('Marca los repuestos en la tabla.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Resorte medidor largo' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cantidad de Resorte medidor largo' }), { target: { value: '4' } })
    expect(panel.getByText('4 UN', { selector: 'span.flex-none' })).toBeTruthy()
    expect(panel.getByText(/no alcanza para 4/)).toBeTruthy()
    expect(panel.getByText('1 repuesto, 1 aviso')).toBeTruthy()
  })

  it('la cantidad solo se ve en lo marcado', () => {
    abrir()
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Correa cuchilla circular' }))
    expect(screen.queryAllByRole('spinbutton')).toHaveLength(1)
  })

  it('quitar desde el panel desmarca el repuesto', () => {
    const { panel } = abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Correa cuchilla circular' }))
    fireEvent.click(panel.getByRole('button', { name: 'Quitar Correa cuchilla circular' }))
    expect(panel.getByText('Marca los repuestos en la tabla.')).toBeTruthy()
  })

  it('un repuesto sin SAP no se puede marcar', () => {
    abrir()
    expect((screen.getByRole('button', { name: /GUIA|Cojinete/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('crea una solicitud por repuesto con su cantidad y la observación', async () => {
    const { onSubmit } = abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Resorte medidor largo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    fireEvent.change(screen.getByLabelText('Observación, va en todas'), { target: { value: 'Para el lunes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar 1 repuesto' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0]?.[0]).toEqual([{ codigoSAP: '3300012407', textoBreve: 'MUELLE 38010321', cantidad: 2, observaciones: 'Para el lunes' }])
  })
})
