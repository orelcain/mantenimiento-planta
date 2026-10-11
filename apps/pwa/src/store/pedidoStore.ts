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
  /** Claves ya registradas como solicitud: no se vuelven a registrar (ni a avisar por Telegram). */
  registradas: string[]
  alternar: (linea: LineaPedido) => void
  fijar: (clave: string, cantidad: number) => void
  quitar: (clave: string) => void
  setNota: (nota: string) => void
  marcarRegistrada: (clave: string) => void
  vaciar: () => void
}

const sinClave = (lista: string[], clave: string) => lista.filter((c) => c !== clave)

export const usePedidoStore = create<PedidoState>()(
  persist(
    (set) => ({
      lineas: [],
      nota: '',
      registradas: [],
      alternar: (linea) =>
        set((s) => ({ lineas: alternarLinea(s.lineas, linea), registradas: sinClave(s.registradas, linea.clave) })),
      fijar: (clave, cantidad) => set((s) => ({ lineas: fijarCantidad(s.lineas, clave, cantidad) })),
      quitar: (clave) => set((s) => ({ lineas: quitarLinea(s.lineas, clave), registradas: sinClave(s.registradas, clave) })),
      setNota: (nota) => set({ nota }),
      marcarRegistrada: (clave) =>
        set((s) => (s.registradas.includes(clave) ? s : { registradas: [...s.registradas, clave] })),
      vaciar: () => set({ lineas: [], nota: '', registradas: [] }),
    }),
    // Lo guardado antes de existir `registradas` se completa con el estado inicial ([]).
    { name: 'pedido-repuestos-v1' },
  ),
)
