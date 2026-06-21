import { useCallback, useEffect, useState } from 'react'

/**
 * Clave de localStorage para los favoritos de equipos.
 *
 * IMPORTANTE: es la MISMA clave que usa `EquipmentPage` (favoritesStorageKey).
 * Mantenerlas idénticas hace que Equipos y el Centro Técnico Documental
 * compartan una sola lista de favoritos (única fuente de verdad por usuario).
 */
export function equipmentFavoritesStorageKey(userId?: string) {
  return `equipment_favorites_v1:${userId ?? 'anon'}`
}

function safeParseIds(raw: string | null): string[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as string[]) : []
  } catch {
    return []
  }
}

/**
 * Favoritos de equipos persistidos en localStorage por usuario, compartidos
 * con la página de Equipos. Devuelve el Set actual + helpers para alternar y
 * consultar. El estado inicial se hidrata de localStorage de forma síncrona
 * (lazy init) para evitar el flash de "vacío" al montar.
 */
export function useEquipmentFavorites(userId?: string) {
  const key = equipmentFavoritesStorageKey(userId)
  const [favorites, setFavorites] = useState<Set<string>>(
    () => new Set(safeParseIds(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)),
  )

  // Re-hidratar si cambia el usuario (la clave depende del userId).
  useEffect(() => {
    setFavorites(new Set(safeParseIds(localStorage.getItem(key))))
  }, [key])

  // Persistir cualquier cambio.
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify([...favorites]))
  }, [favorites, key])

  const toggleFavorite = useCallback((equipmentId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(equipmentId)) next.delete(equipmentId)
      else next.add(equipmentId)
      return next
    })
  }, [])

  const isFavorite = useCallback((equipmentId: string) => favorites.has(equipmentId), [favorites])

  return { favorites, toggleFavorite, isFavorite }
}
