/**
 * Zustand store para el módulo Visor 3D
 */

import { create } from 'zustand'
import type { Model3D } from '@/types/models3d'

interface Models3DState {
  models: Model3D[]
  selectedModel: Model3D | null
  isLoading: boolean
  error: string | null
  searchQuery: string

  setModels: (models: Model3D[]) => void
  setSelectedModel: (model: Model3D | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSearchQuery: (query: string) => void
}

export const useModels3DStore = create<Models3DState>()((set) => ({
  models: [],
  selectedModel: null,
  isLoading: true,
  error: null,
  searchQuery: '',

  setModels: (models) => set({ models, isLoading: false }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}))
