/**
 * Store para zonas y elementos editables sobre el plano Leaflet.
 * Coordenadas en metros locales del DXF (lat=Y, lng=X, CRS.Simple).
 * Persistido en localStorage hasta migrar a Firestore.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { MAP_VIEWS, type ViewName } from '@/data/dxfLayers'

/** Capa de usuario: agrupacion con visibilidad/orden/color propios */
export interface CapaUsuario {
  id: string
  nombre: string
  color: string
  visible: boolean
  /** Mayor = renderiza encima */
  orden: number
  mapView: ViewName
}

/** Nivel / piso de la estructura. Define el eje Z de los elementos. */
export interface Nivel {
  id: string
  nombre: string   // "Planta Baja", "Segundo Piso"
  abrev: string    // "PB", "P1" — label compacto en header
  zBase: number    // altura desde 0 en metros (0, 3.5, 7.0)
  altura: number   // piso a techo en metros (3.5, 3.2, 0=abierto)
  color: string    // identificador visual del nivel
  mapView: ViewName
  orden: number    // 0 = más bajo
}

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
  /** Nivel/piso al que pertenece (undefined = sin asignar, visible en todos los niveles) */
  nivelId?: string
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
  /** Modo seleccion por recuadro activo (para touch/mobile sin shift) */
  boxSelectMode: boolean
  /** Visibilidad de capas DXF, independiente por vista */
  capasVisibles: Record<ViewName, Record<string, boolean>>
  /** Capas de usuario (agrupaciones con visibilidad/orden propios) */
  capasUsuario: CapaUsuario[]
  /** Niveles/pisos definidos por el usuario */
  niveles: Nivel[]
  /** Nivel activo para filtrar (null = mostrar todos) */
  currentNivelId: string | null

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
  toggleBoxSelectMode: () => void
  setCapaVisible: (name: string, visible: boolean) => void
  setAllCapas: (visible: boolean) => void

  addElemento: (e: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'>) => string
  addElementosBulk: (items: Omit<ElementoMapa, 'id' | 'createdAt' | 'updatedAt'>[]) => void
  updateElemento: (id: string, patch: Partial<ElementoMapa>) => void
  updateElementosBulk: (ids: string[], patch: Partial<ElementoMapa>) => void
  /** Actualiza SOLO meta (merge) masivamente — no sobreescribe otras claves */
  updateElementosBulkMeta: (ids: string[], metaPatch: Record<string, unknown>) => void
  deleteElemento: (id: string) => void
  removeElementosBulk: (ids: string[]) => void
  clearAllElementos: () => void

  // ── Capas de usuario ──────────────────────────────────────────────────────
  addCapaUsuario: (data: Omit<CapaUsuario, 'id' | 'orden'>) => string
  updateCapaUsuario: (id: string, patch: Partial<CapaUsuario>) => void
  /** Elimina una capa y opcionalmente sus elementos. Si `keepElementos` es
   *  true, los elementos quedan sin capa asignada. */
  deleteCapaUsuario: (id: string, opts?: { keepElementos?: boolean }) => void
  toggleCapaUsuarioVisible: (id: string) => void
  /** Reordena capas de una vista (orderedIds de abajo hacia arriba) */
  reorderCapas: (mapView: ViewName, orderedIds: string[]) => void

  // ── Niveles / pisos ───────────────────────────────────────────────────────
  addNivel: (data: Omit<Nivel, 'id' | 'orden'>) => string
  updateNivel: (id: string, patch: Partial<Nivel>) => void
  deleteNivel: (id: string) => void
  setCurrentNivel: (id: string | null) => void

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
      boxSelectMode: false,
      capasVisibles: { recinto: {}, interior: {} } as Record<ViewName, Record<string, boolean>>,
      capasUsuario: [],
      niveles: [],
      currentNivelId: null,
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
        boxSelectMode: false,
        measureMode: false,  // edit y measure son mutuamente excluyentes
      })),
      toggleBoxSelectMode: () => set((s) => ({
        boxSelectMode: !s.boxSelectMode,
        // Al activar, limpia seleccion previa para que el box empiece de cero
        selectedId: !s.boxSelectMode ? null : s.selectedId,
        multiSelection: !s.boxSelectMode ? [] : s.multiSelection,
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

      updateElementosBulkMeta: (ids, metaPatch) => {
        const idSet = new Set(ids)
        const now = Date.now()
        set((s) => ({
          elementos: s.elementos.map((e) =>
            idSet.has(e.id)
              ? { ...e, meta: { ...(e.meta ?? {}), ...metaPatch }, updatedAt: now }
              : e,
          ),
        }))
      },

      addCapaUsuario: (data) => {
        const id = makeId()
        set((s) => {
          const siblings = s.capasUsuario.filter((c) => c.mapView === data.mapView)
          const maxOrden = siblings.reduce((m, c) => Math.max(m, c.orden), -1)
          return {
            capasUsuario: [...s.capasUsuario, { ...data, id, orden: maxOrden + 1 }],
          }
        })
        return id
      },

      updateCapaUsuario: (id, patch) =>
        set((s) => ({
          capasUsuario: s.capasUsuario.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      deleteCapaUsuario: (id, opts) =>
        set((s) => {
          const keep = opts?.keepElementos === true
          return {
            capasUsuario: s.capasUsuario.filter((c) => c.id !== id),
            elementos: keep
              ? s.elementos.map((e) =>
                  e.meta?.capaId === id
                    ? { ...e, meta: { ...(e.meta ?? {}), capaId: undefined } }
                    : e,
                )
              : s.elementos.filter((e) => e.meta?.capaId !== id),
            selectedId:
              s.selectedId && s.elementos.find((e) => e.id === s.selectedId)?.meta?.capaId === id && !keep
                ? null
                : s.selectedId,
          }
        }),

      toggleCapaUsuarioVisible: (id) =>
        set((s) => ({
          capasUsuario: s.capasUsuario.map((c) =>
            c.id === id ? { ...c, visible: !c.visible } : c,
          ),
        })),

      reorderCapas: (mapView, orderedIds) =>
        set((s) => {
          const pos = new Map<string, number>()
          orderedIds.forEach((id, idx) => pos.set(id, idx))
          return {
            capasUsuario: s.capasUsuario.map((c) =>
              c.mapView === mapView && pos.has(c.id) ? { ...c, orden: pos.get(c.id)! } : c,
            ),
          }
        }),

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

      addNivel: (data) => {
        const id = 'niv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
        set((s) => {
          const siblings = s.niveles.filter((n) => n.mapView === data.mapView)
          const maxOrden = siblings.reduce((m, n) => Math.max(m, n.orden), -1)
          return { niveles: [...s.niveles, { ...data, id, orden: maxOrden + 1 }] }
        })
        return id
      },

      updateNivel: (id, patch) =>
        set((s) => ({ niveles: s.niveles.map((n) => (n.id === id ? { ...n, ...patch } : n)) })),

      deleteNivel: (id) =>
        set((s) => ({
          niveles: s.niveles.filter((n) => n.id !== id),
          // Elementos del nivel eliminado quedan sin nivel (visible en todos)
          elementos: s.elementos.map((e) =>
            e.nivelId === id ? { ...e, nivelId: undefined } : e,
          ),
          currentNivelId: s.currentNivelId === id ? null : s.currentNivelId,
        })),

      setCurrentNivel: (id) => set({ currentNivelId: id }),

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
      version: 4,
      migrate: (persisted, version) => {
        const s = persisted as Partial<MapaLeafletState> & {
          capasVisibles?: unknown
          capasUsuario?: unknown
          niveles?: unknown
        }
        // v1 → v2: capasVisibles flat → nested per-view
        if (version < 2 && s.capasVisibles && typeof s.capasVisibles === 'object') {
          const old = s.capasVisibles as Record<string, unknown>
          const isFlat = Object.values(old).every((v) => typeof v === 'boolean')
          if (isFlat) {
            const currView = (s.currentView ?? 'recinto') as ViewName
            s.capasVisibles = {
              recinto: currView === 'recinto' ? (old as Record<string, boolean>) : {},
              interior: currView === 'interior' ? (old as Record<string, boolean>) : {},
            } as Record<ViewName, Record<string, boolean>>
          }
        }
        // v2 → v3: crear capasUsuario desde meta.dxfSource + asignar capaId a elementos
        if (version < 3) {
          const elems = (s.elementos ?? []) as ElementoMapa[]
          const existingCapas = Array.isArray(s.capasUsuario) ? (s.capasUsuario as CapaUsuario[]) : []
          const key2capaId = new Map<string, string>()
          for (const c of existingCapas) {
            const k = `${c.mapView}:${c.nombre}`
            key2capaId.set(k, c.id)
          }
          const nuevasCapas: CapaUsuario[] = [...existingCapas]
          const ordenPorVista: Record<string, number> = {}
          for (const c of existingCapas) {
            ordenPorVista[c.mapView] = Math.max(ordenPorVista[c.mapView] ?? -1, c.orden)
          }
          for (const e of elems) {
            const src = e.meta?.dxfSource
            if (typeof src !== 'string') continue
            const mv = e.mapView as ViewName
            const cfg = MAP_VIEWS[mv]?.layers.find((l) => l.name === src)
            const nombre = cfg?.label ?? src
            const key = `${mv}:${nombre}`
            if (key2capaId.has(key)) continue
            const ord = (ordenPorVista[mv] ?? -1) + 1
            ordenPorVista[mv] = ord
            const id = 'cap_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
            key2capaId.set(key, id)
            nuevasCapas.push({
              id, nombre, color: cfg?.color ?? '#94a3b8', visible: true, orden: ord, mapView: mv,
            })
          }
          s.capasUsuario = nuevasCapas
          s.elementos = elems.map((e) => {
            const src = e.meta?.dxfSource
            if (typeof src !== 'string') return e
            const mv = e.mapView as ViewName
            const cfg = MAP_VIEWS[mv]?.layers.find((l) => l.name === src)
            const nombre = cfg?.label ?? src
            const key = `${mv}:${nombre}`
            const capaId = key2capaId.get(key)
            if (!capaId) return e
            return { ...e, meta: { ...(e.meta ?? {}), capaId } }
          })
        }
        // v3 → v4: inicializar niveles y currentNivelId
        if (version < 4) {
          if (!Array.isArray(s.niveles)) s.niveles = []
          if (s.currentNivelId === undefined) s.currentNivelId = null
        }
        return s as MapaLeafletState
      },
      partialize: (s) => ({
        elementos: s.elementos,
        capasVisibles: s.capasVisibles,
        capasUsuario: s.capasUsuario,
        niveles: s.niveles,
        currentNivelId: s.currentNivelId,
        currentView: s.currentView,
        grillaVisible: s.grillaVisible,
        grillaAngles: s.grillaAngles,
      }),
    },
  ),
)
