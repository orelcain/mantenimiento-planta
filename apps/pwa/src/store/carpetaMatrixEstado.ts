/**
 * Estado en memoria de la carga automática de la carpeta de Matrix. Lo escribe
 * `CarpetaMatrixVigilante` y lo leen los avisos de Análisis de turno. No se
 * persiste: al recargar, el vigilante lo vuelve a derivar desde IndexedDB.
 */
import { create } from 'zustand'
import type { CortadoInfo, EstadoCarpeta, UltimoOtro, UltimoResultado } from '@/services/grader/carpetaMatrix'

export interface CarpetaMatrixEstadoState {
  estado: EstadoCarpeta
  nombreCarpeta: string | null
  revisadoEn: number | null
  ultimo: UltimoResultado | null
  cortado: CortadoInfo | null
  /** Último archivo que no es Pieza a pieza (p. ej. Puerta 0) cargado. */
  ultimoOtro: UltimoOtro | null
  /** Hay una revisión en curso (la de la pestaña, vigilante o botón). */
  revisando: boolean
  ultimoPiezaAPieza: number | null
  errorTexto: string | null
  actualizar: (parcial: Partial<Omit<CarpetaMatrixEstadoState, 'actualizar'>>) => void
}

export const useCarpetaMatrixEstado = create<CarpetaMatrixEstadoState>()((set) => ({
  estado: 'sin-autorizar',
  nombreCarpeta: null,
  revisadoEn: null,
  ultimo: null,
  cortado: null,
  ultimoOtro: null,
  revisando: false,
  ultimoPiezaAPieza: null,
  errorTexto: null,
  actualizar: (parcial) => set(parcial),
}))
