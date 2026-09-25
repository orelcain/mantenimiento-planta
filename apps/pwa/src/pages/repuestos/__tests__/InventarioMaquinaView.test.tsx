// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InventarioMaquinaView } from '../InventarioMaquinaView'
import type { InventarioLinea, InventarioSesion, BodegaMergedItem } from '@/hooks/repuestos/useBodega'

// Líneas reales del cuaderno BAADER 200 (25-09-26).
const base = { codigoSAP: '', textoBreve: '', descripcion: '', nombreComun: '', stockSistema: null, notaCuaderno: '' }
const LINEAS: InventarioLinea[] = [
  { ...base, id: 'u1-002', ubicacion: 'Ubicación 1', codigoFabricante: '92152025', codigoCuaderno: '92152025',
    codigoSAP: '3300051215', textoBreve: 'RODILLO 92152025', cantidad: 5, stockSistema: 6, estado: 'validado' },
  { ...base, id: 'u3-008', ubicacion: 'Ubicación 3', codigoFabricante: '92481630', codigoCuaderno: '92481630',
    cantidad: 7, estado: 'dudoso', motivo: 'codigo', sugerencia: '92461630',
    detalleDuda: 'No existe. 92461630 = Bulón con gollete (SAP 3300011830).' },
  { ...base, id: 'u1-005', ubicacion: 'Ubicación 1', codigoFabricante: '37310102', codigoCuaderno: '37310102',
    codigoSAP: '3300011820', cantidad: 6, estado: 'dudoso', motivo: 'sap', detalleDuda: 'El texto del SAP cita otro código.' },
]
const ITEMS = [
  { codigoSAP: '3300011830', codigoFabricante: '92461630', textoBreve: 'BULON 92461630', stockActual: 9, bodegaId: 'b1' },
  { codigoSAP: '3300051215', codigoFabricante: '92152025', textoBreve: 'RODILLO 92152025', stockActual: 6, bodegaId: 'b2' },
] as unknown as BodegaMergedItem[]
const SESION = { id: 's1', nombre: 'Inventario BAADER 200 bodega 25-09-26', estado: 'en_curso', tipo: 'maquina',
  maquina: 'BAADER 200', creadoPor: 'u', creadoPorNombre: 'x', totalItems: 3, contados: 3, conDiferencia: 1,
  createdAt: new Date() } as InventarioSesion

function montar() {
  const validarLinea = vi.fn().mockResolvedValue(undefined)
  const bodega = { items: ITEMS, loadLineas: vi.fn().mockResolvedValue(LINEAS), validarLinea } as never
  render(<InventarioMaquinaView sesion={SESION} bodega={bodega} user={{ id: 'u1', nombre: 'Tester' }} onVolver={() => {}} />)
  return { validarLinea }
}

afterEach(cleanup)

describe('InventarioMaquinaView', () => {
  it('muestra lo validado por ubicación, con contado vs sistema', async () => {
    montar()
    expect(await screen.findByText('RODILLO 92152025')).toBeTruthy()
    expect(screen.getByText(/sist\. 6 \(-1\)/)).toBeTruthy()
    // los dudosos NO aparecen en el inventario
    expect(screen.queryByText(/92481630/)).toBeNull()
  })

  it('valida un dudoso con la sugerencia y trae el SAP del maestro', async () => {
    const { validarLinea } = montar()
    fireEvent.click(await screen.findByRole('tab', { name: /Dudosos/ }))
    // el código precargado es la sugerencia, y el maestro la reconoce
    expect(await screen.findByDisplayValue('92461630')).toBeTruthy()
    expect(screen.getByText('BULON 92461630')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Validar/ })[0]!)
    await waitFor(() => expect(validarLinea).toHaveBeenCalled())
    const [, lineaId, datos] = validarLinea.mock.calls[0]!
    expect(lineaId).toBe('u3-008')
    expect(datos).toMatchObject({ codigoFabricante: '92461630', cantidad: 7, codigoSAP: '3300011830', stockSistema: 9 })
  })

  it('un SAP que no corresponde no se vuelve a ofrecer', async () => {
    montar()
    fireEvent.click(await screen.findByRole('tab', { name: /Dudosos/ }))
    expect(await screen.findByPlaceholderText(/El actual \(3300011820\) es de otra pieza/)).toBeTruthy()
  })
})
