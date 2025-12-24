import { create } from 'zustand'
import type { Incident, Zone, Equipment } from '@/types'

interface AppState {
  // Incidencias
  incidents: Incident[]
  selectedIncident: Incident | null
  setIncidents: (incidents: Incident[]) => void
  setSelectedIncident: (incident: Incident | null) => void
  addIncident: (incident: Incident) => void
  updateIncident: (id: string, data: Partial<Incident>) => void
  removeIncident: (id: string) => void

  // Zonas
  zones: Zone[]
  selectedZone: Zone | null
  setZones: (zones: Zone[]) => void
  setSelectedZone: (zone: Zone | null) => void

  // Equipos
  equipment: Equipment[]
  selectedEquipment: Equipment | null
  setEquipment: (equipment: Equipment[]) => void
  setSelectedEquipment: (equipment: Equipment | null) => void

  // UI
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void

  // Mapa
  mapImage: string | null
  setMapImage: (url: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  // Incidencias
  incidents: [],
  selectedIncident: null,
  setIncidents: (incidents) => set({ incidents }),
  setSelectedIncident: (selectedIncident) => set({ selectedIncident }),
  addIncident: (incident) =>
    set((state) => ({
      incidents: [incident, ...state.incidents],
    })),
  updateIncident: (id, data) =>
    set((state) => ({
      incidents: state.incidents.map((inc) =>
        inc.id === id ? { ...inc, ...data } : inc
      ),
    })),
  removeIncident: (id) =>
    set((state) => ({
      incidents: state.incidents.filter((inc) => inc.id !== id),
    })),

  // Zonas
  zones: [],
  selectedZone: null,
  setZones: (zones) => set({ zones }),
  setSelectedZone: (selectedZone) => set({ selectedZone }),

  // Equipos
  equipment: [],
  selectedEquipment: null,
  setEquipment: (equipment) => set({ equipment }),
  setSelectedEquipment: (selectedEquipment) => set({ selectedEquipment }),

  // UI
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  // Mapa
  mapImage: null,
  setMapImage: (mapImage) => set({ mapImage }),
}))
