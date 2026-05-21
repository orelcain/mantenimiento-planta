/**
 * learningHubPrefs — favoritos y recientes del Centro de Aprendizaje (localStorage).
 * Persistencia local por dispositivo, sin depender de auth.
 */

const FAV_KEY = 'learning_favorites'
const RECENT_KEY = 'learning_recents'
const RECENT_MAX = 6

function read(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function write(key: string, value: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Cuota llena o storage no disponible: ignorar (las prefs son no críticas)
  }
}

// ── Favoritos ──────────────────────────────────────────────────────────────────
export function getFavorites(): string[] {
  return read(FAV_KEY)
}

export function isFavorite(slug: string): boolean {
  return read(FAV_KEY).includes(slug)
}

/** Alterna un favorito y devuelve la lista resultante. */
export function toggleFavorite(slug: string): string[] {
  const current = read(FAV_KEY)
  const next = current.includes(slug) ? current.filter(s => s !== slug) : [...current, slug]
  write(FAV_KEY, next)
  return next
}

// ── Recientes ──────────────────────────────────────────────────────────────────
export function getRecents(): string[] {
  return read(RECENT_KEY)
}

/** Registra una máquina como visitada: la mueve al frente, recorta a RECENT_MAX. */
export function pushRecent(slug: string): void {
  const current = read(RECENT_KEY).filter(s => s !== slug)
  write(RECENT_KEY, [slug, ...current].slice(0, RECENT_MAX))
}
