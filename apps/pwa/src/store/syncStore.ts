import { create } from 'zustand'

interface SyncState {
  pendingWrites: number
  pendingByContext: Record<string, number>
  lastSyncError: string | null
  incrementPending: (context?: string) => void
  decrementPending: (context?: string) => void
  setSyncError: (message: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingWrites: 0,
  pendingByContext: {},
  lastSyncError: null,
  incrementPending: (context) =>
    set((state) => {
      const next = { ...state.pendingByContext }
      if (context) {
        next[context] = (next[context] ?? 0) + 1
      }
      return { pendingWrites: state.pendingWrites + 1, pendingByContext: next }
    }),
  decrementPending: (context) =>
    set((state) => {
      const next = { ...state.pendingByContext }
      if (context && next[context]) {
        next[context] = Math.max(0, next[context] - 1)
        if (next[context] === 0) delete next[context]
      }
      return { pendingWrites: Math.max(0, state.pendingWrites - 1), pendingByContext: next }
    }),
  setSyncError: (message) => set({ lastSyncError: message }),
}))

export function incrementPendingWrites(context?: string) {
  useSyncStore.getState().incrementPending(context)
}

export function decrementPendingWrites(context?: string) {
  useSyncStore.getState().decrementPending(context)
}

export function setSyncError(message: string | null) {
  useSyncStore.getState().setSyncError(message)
}
