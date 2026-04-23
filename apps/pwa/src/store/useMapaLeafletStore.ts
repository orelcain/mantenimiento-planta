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
export type ElementoTipo  = 'zona' | 'equipo' | 'sensor' | 'punto' | 'forma' | 'cota' | 'linea'

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
  /** Ids adicionales seleccionados (multi-seleccion, ademas de selectedId) */
  multiSelection: string[]
  editMode: boolean
  /** Visibilidad de capas DXF, independiente por vista */
  capasVisibles: Record<ViewName, Record<string, boolean>>

  // ── Grilla ──────────────────────────────────────────────────────────────────
  grillaVisible: boolean
  /** Ángulo de rotación de la grilla por vista (recinto / interior) */
  grillaAngles: Record<string, number>
  toggleGrilla: () => void
  setGrillaAngle: (view: string, a: number) => void

  // ── Medición ────────────────────────────────────────────────────────────────
  measureMode: boolean
  measureSegments: number[]       // distancias acumuladas en metros
  measurePointCount: number       // para mostrar instrucciones en overlay
  measureCurrentPoints: [number, number][]  // [lat, lng] del path actual
  /** Incrementar para señalar a MeasureTool que limpie sus capas Leaflet */
  measureClearSignal: number
  /** Ángulo del último segmento medido (grados, null si < 2 puntos) */
  measureLastAngle: number | null

  // Acciones
  setView: (v: ViewName) => void
  setSelectedId: (id: string | null) => void
  toggleMultiSelect: (id: string) => void
  clearMultiSelection: () => void
  getAllSelectedIds: () => string[]
  toggleEditMode: () => void
  setCapaVisible: (name: string, visible: boolean) => void
  setAllCapas: (visible: boolean) => void

  addElemento: (e: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'>) => string
  addElementosBulk: (items: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'>[]) => void
  updateElemento: (id: string, patch: Partial<ElementoMapa>) => void
  updateElementosBulk: (ids: string[], patch: Partial<ElementoMapa>) => void
  deleteElemento: (id: string) => void
  removeElementosBulk: (ids: string[]) => void
  clearAllElementos: () => void

  toggleMeasureMode: () => void
  addMeasureSegment: (dist: number) => void
  setMeasurePointCount: (n: number) => void
  setMeasureCurrentPoints: (pts: [number, number][]) => void
  setMeasureLastAngle: (a: number | null) => void
  clearMeasurements: () => void
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
      multiSelection: [],
      editMode: false,
      capasVisibles: { recinto: {}, interior: {} } as Record<ViewName, Record<string, boolean>>,
      grillaVisible: false,
      grillaAngles: { recinto: 0, interior: 0 } as Record<string, number>,
      toggleGrilla:   () => set((s) => ({ grillaVisible: !s.grillaVisible })),
      setGrillaAngle: (view, a) => set((s) => ({ grillaAngles: { ...s.grillaAngles, [view]: a } })),

      measureMode: false,
      measureSegments: [],
      measurePointCount: 0,
      measureCurrentPoints: [],
      measureClearSignal: 0,
      measureLastAngle: null,

      setView: (v) => set({ currentView: v, selectedId: null, multiSelection: [] }),
      setSelectedId: (id) => set({ selectedId: id, multiSelection: [] }),
      toggleMultiSelect: (id) => set((s) => {
        // Si es el primary, promover un multi al primary (o limpiar)
        if (s.selectedId === id) {
          const first = s.multiSelection[0]
          return { selectedId: first ?? null, multiSelection: s.multiSelection.slice(1) }
        }
        // Si ya esta en multiSelection → remover
        if (s.multiSelection.includes(id)) {
          return { multiSelection: s.multiSelection.filter((x) => x !== id) }
        }
        // Si no hay primary → este se vuelve primary
        if (!s.selectedId) {
          return { selectedId: id }
        }
        // Sino → agregar a multiSelection
        return { multiSelection: [...s.multiSelection, id] }
      }),
      clearMultiSelection: () => set({ multiSelection: [] }),
      getAllSelectedIds: () => {
        const s = useMapaLeafletStore.getState()
        const out: string[] = []
        if (s.selectedId) out.push(s.selectedId)
        for (const x of s.multiSelection) if (!out.includes(x)) out.push(x)
        return out
      },
      toggleEditMode: () => set((s) => ({
        editMode: !s.editMode,
        selectedId: null,
        multiSelection: [],
        measureMode: false,  // edit y measure son mutuamente excluyentes
      })),

      setCapaVisible: (name, visible) =>
        set((s) => {
          const v = s.currentView
          return {
            capasVisibles: {
              ...s.capasVisibles,
              [v]: { ...(s.capasVisibles[v] ?? {}), [name]: visible },
            },
          }
        }),

      setAllCapas: (visible) =>
        set((s) => {
          const v = s.currentView
          const next: Record<string, boolean> = {}
          const current = s.capasVisibles[v] ?? {}
          for (const k of Object.keys(current)) next[k] = visible
          return { capasVisibles: { ...s.capasVisibles, [v]: next } }
        }),

      addElemento: (data) => {
        const id = makeId()
        const now = Date.now()
        set((s) => ({
          elementos: [...s.elementos, { ...data, id, createdAt: now, updatedAt: now }],
        }))
        return id
      },

      addElementosBulk: (items) => {
        const now = Date.now()
        const nuevos: ElementoMapa[] = items.map((data) => ({
          ...data,
          id: makeId(),
          createdAt: now,
          updatedAt: now,
        }))
        set((s) => ({ elementos: [...s.elementos, ...nuevos] }))
      },

      updateElemento: (id, patch) =>
        set((s) => ({
          elementos: s.elementos.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: Date.now() } : e,
          ),
        })),

      updateElementosBulk: (ids, patch) => {
        const idSet = new Set(ids)
        const now = Date.now()
        set((s) => ({
          elementos: s.elementos.map((e) =>
            idSet.has(e.id) ? { ...e, ...patch, updatedAt: now } : e,
          ),
        }))
      },

      deleteElemento: (id) =>
        set((s) => ({
          elementos: s.elementos.filter((e) => e.id !== id),
          selectedId: s.selectedId === id ? null : s.selectedId,
        })),

      removeElementosBulk: (ids) => {
        const idSet = new Set(ids)
        set((s) => ({
          elementos: s.elementos.filter((e) => !idSet.has(e.id)),
          selectedId: s.selectedId && idSet.has(s.selectedId) ? null : s.selectedId,
        }))
      },

      clearAllElementos: () => set({ elementos: [], selectedId: null }),

      toggleMeasureMode: () => set((s) => ({
        measureMode: !s.measureMode,
        editMode: false,
        measureSegments: [],
        measurePointCount: 0,
        measureCurrentPoints: [],
        measureLastAngle: null,
        measureClearSignal: s.measureClearSignal + 1,
      })),
      addMeasureSegment: (dist) => set((s) => ({
        measureSegments: [...s.measureSegments, dist],
      })),
      setMeasurePointCount: (n) => set({ measurePointCount: n }),
      setMeasureCurrentPoints: (pts) => set({ measureCurrentPoints: pts }),
      setMeasureLastAngle: (a) => set({ measureLastAngle: a }),
      clearMeasurements: () => set((s) => ({
        measureSegments: [],
        measurePointCount: 0,
        measureCurrentPoints: [],
        measureLastAngle: null,
        measureClearSignal: s.measureClearSignal + 1,
      })),
    }),
    {
      name: 'mapa-leaflet-v1',
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as Partial<MapaLeafletState> & { capasVisibles?: unknown }
        if (version < 2 && s.capasVisibles && typeof s.capasVisibles === 'object') {
          const old = s.capasVisibles as Record<string, unknown>
          // Detectar si es flat antiguo (valores boolean) vs nested nuevo (valores objeto)
          const isFlat = Object.values(old).every((v) => typeof v === 'boolean')
          if (isFlat) {
            const currView = (s.currentView ?? 'recinto') as ViewName
            s.capasVisibles = {
              recinto: currView === 'recinto' ? (old as Record<string, boolean>) : {},
              interior: currView === 'interior' ? (old as Record<string, boolean>) : {},
            } as Record<ViewName, Record<string, boolean>>
          }
        }
        return s as MapaLeafletState
      },
      partialize: (s) => ({
        elementos: s.elementos,
        capasVisibles: s.capasVisibles,
        currentView: s.currentView,
        grillaVisible: s.grillaVisible,
        grillaAngles: s.grillaAngles,
      }),
    },
  ),
)
