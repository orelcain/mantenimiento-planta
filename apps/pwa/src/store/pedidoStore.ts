import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  alternarLinea,
  cambiarDuenoPedido,
  fijarCantidad,
  quitarLinea,
  type EstadoDuenos,
  type LineaPedido,
  type PedidoDeUsuario,
} from '@/utils/repuestos/pedidoRepuestos'

/**
 * El pedido de repuestos en curso. Persiste en el dispositivo (localStorage): se arma de a poco,
 * buscando en distintas máquinas, y no debe perderse al cambiar de pantalla o cerrar la app.
 * Es POR USUARIO: en un PC compartido de planta cada uno ve el suyo (ver `cambiarDuenoPedido`).
 * La lógica vive en `utils/repuestos/pedidoRepuestos` (probada); aquí solo se guarda.
 */
interface PedidoState {
  lineas: LineaPedido[]
  nota: string
  /** Claves ya registradas como solicitud: no se vuelven a registrar (ni a avisar por Telegram). */
  registradas: string[]
  dueno: string | null
  otros: Record<string, PedidoDeUsuario>
  /** Si el correo / compartir lleva las fotos. Preferencia del dispositivo (no se borra al vaciar). */
  conFotos: boolean
  setConFotos: (v: boolean) => void
  /** Muestra el pedido del usuario que entró (aparta el de quien estaba). */
  usarDueno: (id: string) => void
  /** Reemplaza la lista entera (p. ej. al pasar líneas `fab:` a su SAP, ver `conSapAsignado`). */
  reemplazar: (lineas: readonly LineaPedido[]) => void
  alternar: (linea: LineaPedido) => void
  fijar: (clave: string, cantidad: number) => void
  quitar: (clave: string) => void
  setNota: (nota: string) => void
  marcarRegistrada: (clave: string) => void
  vaciar: () => void
}

const sinClave = (lista: string[], clave: string) => lista.filter((c) => c !== clave)
const soloPresentes = (registradas: string[], lineas: readonly LineaPedido[]) =>
  registradas.filter((c) => lineas.some((l) => l.clave === c))

export const usePedidoStore = create<PedidoState>()(
  persist(
    (set) => ({
      lineas: [],
      nota: '',
      registradas: [],
      dueno: null,
      otros: {},
      conFotos: true,
      setConFotos: (conFotos) => set({ conFotos }),
      usarDueno: (id) =>
        set((s) => {
          const actual: EstadoDuenos = { lineas: s.lineas, nota: s.nota, registradas: s.registradas, dueno: s.dueno, otros: s.otros }
          const nuevo = cambiarDuenoPedido(actual, id)
          return nuevo === actual ? s : nuevo
        }),
      reemplazar: (lineas) => set((s) => ({ lineas: [...lineas], registradas: soloPresentes(s.registradas, lineas) })),
      alternar: (linea) =>
        set((s) => {
          const lineas = alternarLinea(s.lineas, linea)
          return { lineas, registradas: soloPresentes(s.registradas, lineas) }
        }),
      fijar: (clave, cantidad) => set((s) => ({ lineas: fijarCantidad(s.lineas, clave, cantidad) })),
      quitar: (clave) => set((s) => ({ lineas: quitarLinea(s.lineas, clave), registradas: sinClave(s.registradas, clave) })),
      setNota: (nota) => set({ nota }),
      marcarRegistrada: (clave) =>
        set((s) => (s.registradas.includes(clave) ? s : { registradas: [...s.registradas, clave] })),
      vaciar: () => set({ lineas: [], nota: '', registradas: [] }),
    }),
    // Lo guardado antes de existir `registradas` / `conFotos` / `dueno` se completa con el estado
    // inicial; un pedido sin dueño lo adopta el primero que entra (no se pierde el actual).
    { name: 'pedido-repuestos-v1' },
  ),
)
