/**
 * Store Zustand — Selección activa de día/turno histórico en el módulo Grader.
 *
 * Se comparte entre GraderHistoricalCalendar (emite la selección) y
 * AnalisisGraderGatesConfigPage (consume el summary seleccionado para
 * derivar sugerencias alométricas y análisis de pockets).
 */

import { create } from 'zustand'
import type { GraderDailySummary } from '@/services/grader/types'

interface GraderSelectionState {
  /** Summary del día/turno actualmente seleccionado en el calendario. null = ninguno. */
  selectedHistorical: GraderDailySummary | null
  setSelectedHistorical: (summary: GraderDailySummary | null) => void
}

export const useGraderSelectionStore = create<GraderSelectionState>()((set) => ({
  selectedHistorical: null,
  setSelectedHistorical: (selectedHistorical) => set({ selectedHistorical }),
}))
