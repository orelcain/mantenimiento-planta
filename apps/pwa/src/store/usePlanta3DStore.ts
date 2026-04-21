import { create } from 'zustand'

interface Planta3DState {
  selectedZonaId: string | null
  hoveredZonaId: string | null
  showEstados: boolean
  showLabels: boolean
  showFlujo: boolean
  setSelectedZona: (id: string | null) => void
  setHoveredZona: (id: string | null) => void
  toggleEstados: () => void
  toggleLabels: () => void
  toggleFlujo: () => void
}

export const usePlanta3DStore = create<Planta3DState>((set) => ({
  selectedZonaId: null,
  hoveredZonaId: null,
  showEstados: true,
  showLabels: true,
  showFlujo: false,
  setSelectedZona: (id) => set({ selectedZonaId: id }),
  setHoveredZona: (id) => set({ hoveredZonaId: id }),
  toggleEstados: () => set((s) => ({ showEstados: !s.showEstados })),
  toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleFlujo: () => set((s) => ({ showFlujo: !s.showFlujo })),
}))
