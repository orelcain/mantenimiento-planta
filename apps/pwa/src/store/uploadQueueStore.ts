import { create } from 'zustand'

type UploadStatus = 'queued' | 'uploading' | 'done' | 'error'

export interface UploadItem {
  id: string
  evidenceId: string
  type: 'before' | 'after'
  fileName: string
  size: number
  progress: number
  status: UploadStatus
  createdAt: number
  error?: string
}

interface UploadQueueState {
  items: UploadItem[]
  upsertItem: (item: UploadItem) => void
  updateItem: (id: string, patch: Partial<UploadItem>) => void
  removeItem: (id: string) => void
  setItems: (items: UploadItem[]) => void
}

export const useUploadQueueStore = create<UploadQueueState>((set) => ({
  items: [],
  upsertItem: (item) =>
    set((state) => {
      const exists = state.items.find((i) => i.id === item.id)
      if (exists) {
        return { items: state.items.map((i) => (i.id === item.id ? { ...i, ...item } : i)) }
      }
      return { items: [item, ...state.items].slice(0, 50) }
    }),
  updateItem: (id, patch) =>
    set((state) => ({ items: state.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  removeItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  setItems: (items) => set({ items }),
}))
