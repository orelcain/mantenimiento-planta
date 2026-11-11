/**
 * «Pedidos por atender» arriba de Bodega: lo que espera a bodega se ve y se atiende ahí.
 * Producción tiene hoy 2 pedidos, ambos entregados; el caso cargado se prueba aquí, no escribiendo
 * pedidos reales (cada uno avisa al grupo de Telegram).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: () => ({}), addDoc: vi.fn(), updateDoc: vi.fn(), onSnapshot: () => () => {},
  query: () => ({}), orderBy: () => ({}), serverTimestamp: () => 'TS', Timestamp: class {},
}))

import { PedidosPorAtender } from '../PedidosPorAtender'
import type { SolicitudItem, SolicitudRepuesto } from '@/hooks/repuestos/useSolicitudes'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'

afterEach(cleanup)

const pedido = (p: Partial<SolicitudRepuesto>): SolicitudRepuesto => ({
  id: 'p', codigoSAP: '3300098563', textoBreve: 'AMORTIGUADOR 1420704000', cantidad: 1, estado: 'pendiente',
  solicitadoPor: 'u', solicitadoPorNombre: 'Danilo Cortés', createdAt: new Date(), ...p,
})

const stocks: Record<string, StockDeSolicitud> = {
  '3300098563': { configurado: true, stockActual: 1, unidad: 'pzas' },
  '3300120602': { configurado: true, stockActual: 0 },
  '3300029112': { configurado: true, stockActual: 2 },
}

const montar = (solicitudes: SolicitudItem[], extra: Partial<Parameters<typeof PedidosPorAtender>[0]> = {}) => {
  const onAvanzar = vi.fn(() => Promise.resolve())
  const onVerTodos = vi.fn()
  render(
    <PedidosPorAtender
      solicitudes={solicitudes}
      esPC
      stockDe={sap => stocks[sap]}
      nombreDe={(_sap, t) => ({ titulo: t ?? '', oficial: null, etiquetas: [], otros: [], esComun: false })}
      onAvanzar={onAvanzar}
      onVerTodos={onVerTodos}
      {...extra}
    />,
  )
  return { onAvanzar, onVerTodos }
}

describe('PedidosPorAtender', () => {
  it('cuenta lo que espera y deja aprobar ahí mismo', () => {
    const { onAvanzar } = montar([
      pedido({ id: 'a1' }),
      pedido({ id: 'e1', estado: 'aprobada', codigoSAP: '3300029112', textoBreve: 'Abrazadera 2" INOX' }),
      pedido({ id: 'x', estado: 'entregada' }),
    ])
    expect(screen.getByRole('heading', { name: 'Pedidos por atender · 2' })).toBeTruthy()
    expect(screen.getByText('1 por aprobar · 1 por entregar')).toBeTruthy()
    expect(screen.getByText('queda 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }))
    expect(onAvanzar).toHaveBeenCalledWith('a1', 'aprobada')
    fireEvent.click(screen.getByRole('button', { name: 'Entregar' }))
    expect(onAvanzar).toHaveBeenCalledWith('e1', 'entregada')
  })

  it('sin stock no ofrece entregar: dice que falta comprar', () => {
    montar([pedido({ id: 'e2', estado: 'aprobada', codigoSAP: '3300120602', textoBreve: 'Adaptador 1420606015' })])
    expect(screen.queryByRole('button', { name: 'Entregar' })).toBeNull()
    expect(screen.getByText('Falta comprar')).toBeTruthy()
  })

  it('sin pendientes, una línea y el acceso al historial', () => {
    const { onVerTodos } = montar([pedido({ id: 'x1', estado: 'entregada' }), pedido({ id: 'x2', estado: 'entregada' })])
    expect(screen.getByText('Ninguno por atender · 2 entregados')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver los 2, con entregados' }))
    expect(onVerTodos).toHaveBeenCalled()
  })

  it('sin permiso de escritura no hay botones de aprobar ni entregar', () => {
    montar([pedido({ id: 'a1' })], { onAvanzar: undefined })
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })
})
