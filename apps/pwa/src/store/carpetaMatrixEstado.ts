/**
 * Estado en memoria de la carga automática de la carpeta de Matrix. Lo escribe
 * `CarpetaMatrixVigilante` y lo leen los avisos de Análisis de turno. No se
 * persiste: al recargar, el vigilante lo vuelve a derivar desde IndexedDB.
 */
import { create } from 'zustand'
import type { EstadoCarpeta, UltimoResultado } from '@/services/grader/carpetaMatrix'

export interface CarpetaMatrixEstadoState {
  estado: EstadoCarpeta
  nombreCarpeta: string | null
  revisadoEn: number | null
  ultimo: UltimoResultado | null
  ultimoPiezaAPieza: number | null
  errorTexto: string | null
  actualizar: (parcial: Partial<Omit<CarpetaMatrixEstadoState, 'actualizar'>>) => void
}

export const useCarpetaMatrixEstado = create<CarpetaMatrixEstadoState>()((set) => ({
  estado: 'sin-autorizar',
  nombreCarpeta: null,
  revisadoEn: null,
  ultimo: null,
  ultimoPiezaAPieza: null,
  errorTexto: null,
  actualizar: (parcial) => set(parcial),
}))
