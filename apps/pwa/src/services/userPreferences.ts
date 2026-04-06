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

const COL = 'user_preferences'

export interface FavList {
  name: string
  machineIds: string[]
  machineNames?: Record<string, string>
}

export interface UserPreferencesData {
  favoriteLists: FavList[]
  bodegaWatchlist: string[]
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
    console.error('Error loading user preferences:', err)
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
    console.error('Error saving favorite lists:', err)
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
    console.error('Error saving bodega watchlist:', err)
  }
}
