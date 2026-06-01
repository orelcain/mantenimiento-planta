/**
 * UserPreferences — Preferencias del usuario en Firestore
 *
 * Almacena datos de negocio que deben sincronizarse entre dispositivos:
 * - Listas de equipos favoritos (con orden y nombres)
 * - Watchlist de bodega (repuestos vigilados)
 *
 * Colección: user_preferences/{userId}
 */

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'
import { logger } from '@/lib/logger'

const COL = 'user_preferences'

export interface FavList {
  name: string
  machineIds: string[]
  machineNames?: Record<string, string>
}

/** Lista de repuestos favoritos por equipo */
export interface RepuestoFavList {
  name: string           // "Favoritos", "Resortes", "Sensores", etc.
  repuestoIds: string[]  // IDs de repuestos en esa lista
}

export interface UserPreferencesData {
  favoriteLists: FavList[]
  bodegaWatchlist: string[]
  /** Repuestos favoritos por equipo: key = nodeId del equipo */
  repuestoFavLists?: Record<string, RepuestoFavList[]>
  /** Repuestos favoritos GLOBALES del hub área-first (rowKeys estables, no por equipo). */
  repuestoFavs?: string[]
  updatedAt?: unknown
}

// ── Leer preferencias ──

export async function getUserPreferences(userId: string): Promise<UserPreferencesData> {
  try {
    const snap = await getDoc(doc(db, COL, userId))
    if (snap.exists()) {
      const data = snap.data()
      return {
        favoriteLists: data.favoriteLists || [],
        bodegaWatchlist: data.bodegaWatchlist || [],
      }
    }
  } catch (err) {
    logger.error('Error loading user preferences', err instanceof Error ? err : new Error(String(err)))
  }
  return { favoriteLists: [], bodegaWatchlist: [] }
}

// ── Guardar listas de favoritos ──

export async function saveFavoriteLists(userId: string, lists: FavList[]): Promise<void> {
  try {
    await setDoc(doc(db, COL, userId), {
      favoriteLists: lists,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    logger.error('Error saving favorite lists', err instanceof Error ? err : new Error(String(err)))
  }
}

// ── Repuestos favoritos por equipo ──

export async function getRepuestoFavLists(userId: string, equipmentId: string): Promise<RepuestoFavList[]> {
  try {
    const snap = await getDoc(doc(db, COL, userId))
    if (snap.exists()) {
      const all = snap.data().repuestoFavLists || {}
      return all[equipmentId] || []
    }
  } catch (err) {
    logger.error('Error loading repuesto fav lists', err instanceof Error ? err : new Error(String(err)))
  }
  return []
}

export async function saveRepuestoFavLists(userId: string, equipmentId: string, lists: RepuestoFavList[]): Promise<void> {
  try {
    // Leer existentes para no perder otros equipos
    const snap = await getDoc(doc(db, COL, userId))
    const existing = snap.exists() ? (snap.data().repuestoFavLists || {}) : {}
    existing[equipmentId] = lists
    await setDoc(doc(db, COL, userId), {
      repuestoFavLists: existing,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    logger.error('Error saving repuesto fav lists', err instanceof Error ? err : new Error(String(err)))
  }
}

// ── Repuestos favoritos GLOBALES (hub área-first) ──
// Keyed por rowKey estable del item agregado (sap || fab:<fab> || id:<machineId>:<repId>),
// no por doc-id ni por equipo → un favorito sigue al repuesto a través de la vista agregada.

export async function getRepuestoFavs(userId: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, COL, userId))
    if (snap.exists()) return (snap.data().repuestoFavs as string[]) || []
  } catch (err) {
    logger.error('Error loading repuesto favs', err instanceof Error ? err : new Error(String(err)))
  }
  return []
}

export async function saveRepuestoFavs(userId: string, favs: string[]): Promise<void> {
  try {
    await setDoc(doc(db, COL, userId), {
      repuestoFavs: favs,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    logger.error('Error saving repuesto favs', err instanceof Error ? err : new Error(String(err)))
  }
}

// ── Guardar watchlist de bodega ──

export async function saveBodegaWatchlist(userId: string, watchlist: string[]): Promise<void> {
  try {
    await setDoc(doc(db, COL, userId), {
      bodegaWatchlist: watchlist,
      updatedAt: serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    logger.error('Error saving bodega watchlist', err instanceof Error ? err : new Error(String(err)))
  }
}
