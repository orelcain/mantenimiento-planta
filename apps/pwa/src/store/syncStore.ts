import { create } from 'zustand'

interface SyncState {
  pendingWrites: number
  lastSyncError: string | null
  incrementPending: () => void
  decrementPending: () => void
  setSyncError: (message: string | null) => void
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingWrites: 0,
  lastSyncError: null,
  incrementPending: () => set((state) => ({ pendingWrites: state.pendingWrites + 1 })),
  decrementPending: () => set((state) => ({ pendingWrites: Math.max(0, state.pendingWrites - 1) })),
  setSyncError: (message) => set({ lastSyncError: message }),
}))

export function incrementPendingWrites() {
  useSyncStore.getState().incrementPending()
}

export function decrementPendingWrites() {
  useSyncStore.getState().decrementPending()
}

export function setSyncError(message: string | null) {
  useSyncStore.getState().setSyncError(message)
}
