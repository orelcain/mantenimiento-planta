import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { alternarLinea, fijarCantidad, quitarLinea, type LineaPedido } from '@/utils/repuestos/pedidoRepuestos'

/**
 * El pedido de repuestos en curso. Persiste en el dispositivo (localStorage): se arma de a poco,
 * buscando en distintas máquinas, y no debe perderse al cambiar de pantalla o cerrar la app.
 * La lógica vive en `utils/repuestos/pedidoRepuestos` (probada); aquí solo se guarda.
 */
interface PedidoState {
  lineas: LineaPedido[]
  nota: string
  alternar: (linea: LineaPedido) => void
  fijar: (clave: string, cantidad: number) => void
  quitar: (clave: string) => void
  setNota: (nota: string) => void
  vaciar: () => void
}

export const usePedidoStore = create<PedidoState>()(
  persist(
    (set) => ({
      lineas: [],
      nota: '',
      alternar: (linea) => set((s) => ({ lineas: alternarLinea(s.lineas, linea) })),
      fijar: (clave, cantidad) => set((s) => ({ lineas: fijarCantidad(s.lineas, clave, cantidad) })),
      quitar: (clave) => set((s) => ({ lineas: quitarLinea(s.lineas, clave) })),
      setNota: (nota) => set({ nota }),
      vaciar: () => set({ lineas: [], nota: '' }),
    }),
    { name: 'pedido-repuestos-v1' },
  ),
)
