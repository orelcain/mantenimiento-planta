/**
 * Store para zonas y elementos editables sobre el plano Leaflet.
 * Coordenadas en metros locales del DXF (lat=Y, lng=X, CRS.Simple).
 * Persistido en localStorage hasta migrar a Firestore.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ViewName } from '@/data/dxfLayers'

export type ZonaCategoria = 'produccion' | 'frio' | 'utilidades' | 'logistica' | 'admin' | 'estructura' | 'otros'
export type ZonaEstado    = 'operativo' | 'alerta' | 'detenido'
export type ElementoTipo  = 'zona' | 'equipo' | 'sensor' | 'punto' | 'forma'

/** Polígono: array de puntos [lat, lng] = [Y, X] en unidades del DXF de la vista */
export type PolygonCoords = [number, number][]

export interface ElementoMapa {
  id: string
  tipo: ElementoTipo
  nombre: string
  categoria: ZonaCategoria
  estado: ZonaEstado
  /** Vista a la que pertenece (recinto / interior). Sus coords están en
      el sistema de esa vista. */
  mapView: ViewName
  /** Polígono en CRS.Simple ([Y, X]) */
  poligono?: PolygonCoords
  /** Para puntos (equipos, sensores): coordenada única [lat, lng] */
  punto?: [number, number]
  /** Para círculos: radio en unidades del DXF */
  radio?: number
  /** Metadata libre */
  meta?: Record<string, unknown>
  /** Marca de creación / última edición */
  createdAt: number
  updatedAt: number
}

interface MapaLeafletState {
  /** Vista actualmente activa */
  currentView: ViewName
  elementos: ElementoMapa[]
  selectedId: string | null
  editMode: boolean
  capasVisibles: Record<string, boolean>   // capas DXF visibles por nombre

  // Acciones
  setView: (v: ViewName) => void
  setSelectedId: (id: string | null) => void
  toggleEditMode: () => void
  setCapaVisible: (name: string, visible: boolean) => void
  setAllCapas: (visible: boolean) => void

  addElemento: (e: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'>) => string
  updateElemento: (id: string, patch: Partial<ElementoMapa>) => void
  deleteElemento: (id: string) => void
  clearAllElementos: () => void
}

function makeId(): string {
  return 'el_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
}

export const useMapaLeafletStore = create<MapaLeafletState>()(
  persist(
    (set) => ({
      currentView: 'recinto' as ViewName,
      elementos: [],
      selectedId: null,
      editMode: false,
      capasVisibles: {},

      setView: (v) => set({ currentView: v, selectedId: null }),
      setSelectedId: (id) => set({ selectedId: id }),
      toggleEditMode: () => set((s) => ({ editMode: !s.editMode, selectedId: null })),

      setCapaVisible: (name, visible) =>
        set((s) => ({ capasVisibles: { ...s.capasVisibles, [name]: visible } })),

      setAllCapas: (visible) =>
        set((s) => {
          const next: Record<string, boolean> = {}
          for (const k of Object.keys(s.capasVisibles)) next[k] = visible
          return { capasVisibles: next }
        }),

      addElemento: (data) => {
        const id = makeId()
        const now = Date.now()
        set((s) => ({
          elementos: [...s.elementos, { ...data, id, createdAt: now, updatedAt: now }],
        }))
        return id
      },

      updateElemento: (id, patch) =>
        set((s) => ({
          elementos: s.elementos.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e,
          ),
        })),

      deleteElemento: (id) =>
        set((s) => ({
          elementos: s.elementos.filter((e) => e.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      clearAllElementos: () => set({ elementos: [], selectedId: null }),
    }),
    {
      name: 'mapa-leaflet-v1',
      partialize: (s) => ({
        elementos: s.elementos,
        capasVisibles: s.capasVisibles,
        currentView: s.currentView,
      }),
    },
  ),
)
