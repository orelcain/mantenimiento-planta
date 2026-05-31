/**
 * useHierarchyPaths — Membership área-first robusto (Fase 2).
 *
 * Carga TODOS los nodos de `hierarchy` una vez (cacheado a nivel módulo) y, por
 * cada nodo, arma el set de sus ancestros (incluyéndose). La membresía de un
 * repuesto/equipo a un área se decide por ANCESTRÍA: el nodo N pertenece al área
 * A si A ∈ ancestros(N) ∪ {N}.
 *
 * Reconstruye los ancestros caminando la cadena de `parentId` (no depende de que
 * el campo `path[]` esté poblado, que en algunos nodos viene vacío) — y no
 * depende del árbol lazy de useHierarchyAreaTree (que no trae nodos profundos).
 */
import { useState, useEffect, useCallback } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

// nodeId → Set(ancestorIds incl. self)
let cache: Map<string, Set<string>> | null = null
let cacheTs = 0
const TTL = 5 * 60 * 1000

export function invalidateHierarchyPathsCache() { cache = null; cacheTs = 0 }

function build(nodes: { id: string; parentId: string | null; path: string[] }[]): Map<string, Set<string>> {
  const parentOf = new Map<string, string | null>()
  for (const n of nodes) parentOf.set(n.id, n.parentId)
  const out = new Map<string, Set<string>>()
  for (const n of nodes) {
    const s = new Set<string>([n.id])
    // 1) Campo `path` (array de ancestros desde la raíz) — autoritativo cuando existe
    for (const a of n.path) s.add(a)
    // 2) Cadena de parentId — fallback/complemento cuando `path` viene incompleto
    let cur = n.parentId
    let guard = 0
    while (cur && guard++ < 30) {
      s.add(cur)
      cur = parentOf.get(cur) ?? null
    }
    out.set(n.id, s)
  }
  return out
}

export function useHierarchyPaths() {
  const [map, setMap] = useState<Map<string, Set<string>> | null>(
    () => (cache && Date.now() - cacheTs < TTL ? cache : null),
  )
  const [loading, setLoading] = useState(!map)

  useEffect(() => {
    if (map) return
    let alive = true
    ;(async () => {
      try {
        const snap = await getDocs(collection(db, 'hierarchy'))
        const nodes = snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            parentId: (data.parentId ?? null) as string | null,
            path: Array.isArray(data.path) ? (data.path as string[]) : [],
          }
        })
        const m = build(nodes)
        cache = m
        cacheTs = Date.now()
        if (alive) { setMap(m); setLoading(false) }
      } catch (err) {
        logger.error('useHierarchyPaths load error', err instanceof Error ? err : new Error(String(err)))
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [map])

  /** ¿El nodo `nodeId` está bajo (o es) el área `areaId`? */
  const isUnder = useCallback(
    (nodeId: string | undefined | null, areaId: string | null): boolean => {
      if (!nodeId || !areaId || !map) return false
      return map.get(nodeId)?.has(areaId) ?? false
    },
    [map],
  )

  return { isUnder, loading, ready: !!map }
}
