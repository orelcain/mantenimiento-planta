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
// nodeId → nombre. Sale de la MISMA lectura de `hierarchy`: no cuesta ni un documento más.
let nombresCache: Map<string, string> = new Map()
const TTL = 5 * 60 * 1000

export function invalidateHierarchyPathsCache() { cache = null; cacheTs = 0; nombresCache = new Map() }

async function loadAncestorsMap(): Promise<Map<string, Set<string>>> {
  if (cache && Date.now() - cacheTs < TTL) return cache
  const snap = await getDocs(collection(db, 'hierarchy'))
  const nodes = snap.docs.map((d) => {
    const data = d.data()
    return {
      id: d.id,
      parentId: (data.parentId ?? null) as string | null,
      path: Array.isArray(data.path) ? (data.path as string[]) : [],
      nombre: typeof data.nombre === 'string' ? data.nombre : '',
    }
  })
  nombresCache = new Map(nodes.map((n) => [n.id, n.nombre]))
  const m = build(nodes)
  cache = m
  cacheTs = Date.now()
  return m
}

/**
 * `areaIds` de un repuesto = unión de {equipo + todos sus ancestros} para cada
 * nodeId en `equipos[]`. Se persiste en el doc (ver `useRepuestoCrud` y
 * `scripts/backfill-repuestos-area-ids.js`) para poder filtrar del lado del
 * servidor con `where('areaIds', 'array-contains', areaId)` — sin esto, mirar
 * un área implicaba bajar el maestro COMPLETO (~7.700 docs) y filtrar en el
 * cliente. Misma lógica de ancestría que `isUnder`, expuesta standalone para
 * usarla fuera de un componente React (flujos de guardado).
 */
export async function computeAreaIds(equipoIds: string[]): Promise<string[]> {
  if (!equipoIds || equipoIds.length === 0) return []
  const map = await loadAncestorsMap()
  return unionAncestors(map, equipoIds)
}

/** Parte pura de `computeAreaIds` (sin Firestore) — testeable directo. */
export function unionAncestors(map: Map<string, Set<string>>, equipoIds: string[]): string[] {
  const out = new Set<string>()
  for (const eq of equipoIds) {
    const ancestors = map.get(eq)
    if (ancestors) for (const a of ancestors) out.add(a)
    else out.add(eq) // nodo no encontrado en hierarchy (raro) — igual queda matcheable por su propio id
  }
  return [...out]
}

export function build(nodes: { id: string; parentId: string | null; path: string[]; nombre?: string }[]): Map<string, Set<string>> {
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

/**
 * La PLANTA a la que pertenece un nodo: el ancestro cuyo nombre empieza por «PLANTA».
 *
 * Existe porque los equipos se llaman igual en las dos plantas —hay seis KNURO y seis Baader
 * 142— y agrupar solo por nombre visible juntaba KNURO N1 de Chonchi con KNURO N1 de Yal. El
 * panel del repuesto decía «Dónde se usa · 3 equipos» para un cilindro montado en 6.
 *
 * Pura y testeable: recibe los ancestros y los nombres, no lee Firestore.
 */
export function plantaDeNodo(
  ancestros: ReadonlySet<string> | undefined,
  nombres: ReadonlyMap<string, string>,
): string | undefined {
  if (!ancestros) return undefined
  for (const id of ancestros) {
    const nombre = (nombres.get(id) ?? '').trim()
    if (/^PLANTA\b/i.test(nombre)) return nombre
  }
  return undefined
}

export function useHierarchyPaths() {
  const [map, setMap] = useState<Map<string, Set<string>> | null>(
    () => (cache && Date.now() - cacheTs < TTL ? cache : null),
  )
  const [loading, setLoading] = useState(!map)

  useEffect(() => {
    if (map) return
    let alive = true
    loadAncestorsMap()
      .then((m) => { if (alive) { setMap(m); setLoading(false) } })
      .catch((err) => {
        logger.error('useHierarchyPaths load error', err instanceof Error ? err : new Error(String(err)))
        if (alive) setLoading(false)
      })
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

  /** Nombre de la planta del nodo («PLANTA CHONCHI» / «PLANTA YAL»), si se conoce. */
  const plantaDe = useCallback(
    (nodeId: string | undefined | null): string | undefined => {
      if (!nodeId || !map) return undefined
      return plantaDeNodo(map.get(nodeId), nombresCache)
    },
    [map],
  )

  return { isUnder, plantaDe, loading, ready: !!map }
}
