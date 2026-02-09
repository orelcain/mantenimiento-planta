import {
  collection,
  getDocs,
  query,
  where,
  documentId,
} from '@/services/firestoreTracked'
import { db } from './firebase'
import type { User } from '@/types'

const nameCache = new Map<string, string>()
const infoCache = new Map<string, string>()

function toDisplayName(user: Partial<User> | null | undefined, fallbackId: string): string {
  if (!user) return fallbackId
  const full = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim()
  return full || fallbackId
}

function toInfoLabel(user: Partial<User> | null | undefined, fallbackId: string): string {
  if (!user) return fallbackId
  const full = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim()
  const roleLabel = user.rol === 'admin'
    ? 'Admin'
    : user.rol === 'supervisor'
    ? 'Supervisor'
    : user.rol === 'tecnico'
    ? 'Técnico'
    : 'Usuario'
  const providerLabel = user.authProvider === 'google' ? 'Google' : 'Email'
  const base = full || fallbackId
  return `${base} · ${roleLabel} · ${providerLabel}`
}

export function getCachedUserDisplayName(userId: string): string | undefined {
  return nameCache.get(userId)
}

export function getCachedUserInfoLabel(userId: string): string | undefined {
  return infoCache.get(userId)
}

export async function getUserDisplayNameMap(userIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  const result: Record<string, string> = {}

  const missing = uniqueIds.filter((id) => !nameCache.has(id))
  if (missing.length === 0) {
    for (const id of uniqueIds) {
      result[id] = nameCache.get(id) || id
    }
    return result
  }

  // Firestore 'in' acepta hasta 10 elementos; hacemos chunking.
  const chunks: string[][] = []
  for (let i = 0; i < missing.length; i += 10) {
    chunks.push(missing.slice(i, i + 10))
  }

  for (const chunk of chunks) {
    const q = query(collection(db, 'users'), where(documentId(), 'in', chunk))
    const snap = await getDocs(q)

    // Defaults: si no existe, dejamos fallback al id
    for (const id of chunk) {
      if (!nameCache.has(id)) nameCache.set(id, id)
    }

    for (const doc of snap.docs) {
      const data = doc.data() as Partial<User>
      const display = toDisplayName(data, doc.id)
      nameCache.set(doc.id, display)
    }
  }

  for (const id of uniqueIds) {
    result[id] = nameCache.get(id) || id
  }

  return result
}

export async function getUserInfoLabelMap(userIds: string[]): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)))
  const result: Record<string, string> = {}

  const missing = uniqueIds.filter((id) => !infoCache.has(id))
  if (missing.length === 0) {
    for (const id of uniqueIds) {
      result[id] = infoCache.get(id) || id
    }
    return result
  }

  const chunks: string[][] = []
  for (let i = 0; i < missing.length; i += 10) {
    chunks.push(missing.slice(i, i + 10))
  }

  for (const chunk of chunks) {
    const q = query(collection(db, 'users'), where(documentId(), 'in', chunk))
    const snap = await getDocs(q)

    for (const id of chunk) {
      if (!infoCache.has(id)) infoCache.set(id, id)
    }

    for (const doc of snap.docs) {
      const data = doc.data() as Partial<User>
      const info = toInfoLabel(data, doc.id)
      infoCache.set(doc.id, info)
    }
  }

  for (const id of uniqueIds) {
    result[id] = infoCache.get(id) || id
  }

  return result
}
