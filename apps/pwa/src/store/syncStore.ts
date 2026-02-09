import { create } from 'zustand'

type SyncStatus = 'pending' | 'synced' | 'error' | 'conflict'

interface SyncEntry {
  id: string
  context: string
  status: SyncStatus
  createdAt: number
  error?: string
  refPath?: string
  payload?: string
  retryable?: boolean
  retry?: () => Promise<void>
}

interface SyncState {
  pendingWrites: number
  pendingByContext: Record<string, number>
  pendingEntries: SyncEntry[]
  lastSyncError: string | null
  lastSyncAt: number | null
  incrementPending: (
    context?: string,
    meta?: { refPath?: string; payload?: string; retryable?: boolean; retry?: () => Promise<void> }
  ) => string
  decrementPending: (context?: string) => void
  markEntrySynced: (id: string) => void
  markEntryError: (id: string, message: string, conflict?: boolean) => void
  setSyncError: (message: string | null) => void
  setLastSyncAt: (timestamp: number | null) => void
}

const MAX_ENTRIES = 50

let entryCounter = 0
function genEntryId() {
  entryCounter = (entryCounter + 1) % Number.MAX_SAFE_INTEGER
  return `${Date.now()}-${entryCounter}`
}

export const useSyncStore = create<SyncState>((set) => ({
  pendingWrites: 0,
  pendingByContext: {},
  pendingEntries: [],
  lastSyncError: null,
  lastSyncAt: null,
  incrementPending: (context, meta) =>
    set((state) => {
      const id = genEntryId()
      const entry: SyncEntry = {
        id,
        context: context ?? 'write',
        status: 'pending',
        createdAt: Date.now(),
        refPath: meta?.refPath,
        payload: meta?.payload,
        retryable: meta?.retryable,
        retry: meta?.retry,
      }
      const next = { ...state.pendingByContext }
      if (context) {
        next[context] = (next[context] ?? 0) + 1
      }
      return {
        pendingWrites: state.pendingWrites + 1,
        pendingByContext: next,
        pendingEntries: [entry, ...state.pendingEntries].slice(0, MAX_ENTRIES),
      }
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
  markEntrySynced: (id) =>
    set((state) => ({
      pendingEntries: state.pendingEntries.map((entry) =>
        entry.id === id ? { ...entry, status: 'synced' } : entry
      ),
    })),
  markEntryError: (id, message, conflict) =>
    set((state) => ({
      pendingEntries: state.pendingEntries.map((entry) =>
        entry.id === id
          ? { ...entry, status: conflict ? 'conflict' : 'error', error: message }
          : entry
      ),
    })),
  setSyncError: (message) => set({ lastSyncError: message }),
  setLastSyncAt: (timestamp) => set({ lastSyncAt: timestamp }),
}))

export function incrementPendingWrites(
  context?: string,
  meta?: { refPath?: string; payload?: string; retryable?: boolean; retry?: () => Promise<void> }
) {
  return useSyncStore.getState().incrementPending(context, meta)
}

export function decrementPendingWrites(context?: string) {
  useSyncStore.getState().decrementPending(context)
}

export function markEntrySynced(id: string) {
  useSyncStore.getState().markEntrySynced(id)
}

export function markEntryError(id: string, message: string, conflict?: boolean) {
  useSyncStore.getState().markEntryError(id, message, conflict)
}

export function setSyncError(message: string | null) {
  useSyncStore.getState().setSyncError(message)
}
