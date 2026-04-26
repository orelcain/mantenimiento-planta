/**
 * useGlobalEquipmentSearch — Búsqueda global de equipos SAP
 *
 * Carga todos los nodos-equipo (código numérico o vacío) una sola vez,
 * los cachea, y filtra client-side por nombre/alias/código.
 * Retorna resultados con su path completo para navegar al área padre.
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { isEquipmentNode } from '@/types/hierarchy'
import { logger } from '@/lib/logger'

export interface GlobalEquipmentResult {
  id: string
  nombre: string
  alias?: string
  codigo: string
  parentId: string | null
  path: string[]          // IDs desde raíz hasta este nodo
  linkedMachineId?: string
  oculto?: boolean
}

// Cache global — se comparte entre montajes del hook
let cachedEquipment: GlobalEquipmentResult[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 min

export function invalidateGlobalEquipmentCache() {
  cachedEquipment = null
  cacheTimestamp = 0
}

/** Acceder al cache de equipos globales (null si no cargado aún) */
export function getGlobalEquipmentCache(): GlobalEquipmentResult[] | null {
  if (cachedEquipment && Date.now() - cacheTimestamp < CACHE_TTL) return cachedEquipment
  return null
}

export function useGlobalEquipmentSearch(searchQuery: string, minChars = 2) {
  const [allEquipment, setAllEquipment] = useState<GlobalEquipmentResult[]>(cachedEquipment ?? [])
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  // Cargar todos los equipos una sola vez
  useEffect(() => {
    if (cachedEquipment && Date.now() - cacheTimestamp < CACHE_TTL) {
      setAllEquipment(cachedEquipment)
      return
    }
    if (loadedRef.current) return
    loadedRef.current = true

    const load = async () => {
      setLoading(true)
      try {
        const hierarchyRef = collection(db, 'hierarchy')
        const q = query(hierarchyRef, where('activo', '==', true))
        const snap = await getDocs(q)

        const results: GlobalEquipmentResult[] = []
        snap.forEach(doc => {
          const d = doc.data()
          const codigo = d.codigo ?? ''
          // Solo equipos: código numérico o vacío (no áreas alfanuméricas)
          if (!isEquipmentNode(codigo) && codigo !== '') return

          results.push({
            id: doc.id,
            nombre: d.nombre ?? '',
            alias: d.alias,
            codigo,
            parentId: d.parentId ?? null,
            path: d.path ?? [],
            linkedMachineId: d.linkedMachineId,
            oculto: d.oculto ?? false,
          })
        })

        cachedEquipment = results
        cacheTimestamp = Date.now()
        setAllEquipment(results)
      } catch (err) {
        logger.error('Error loading global equipment search', err instanceof Error ? err : new Error(String(err)))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  // Filtrar por query
  const results = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (q.length < minChars) return []

    const terms = q.split(/\s+/)

    return allEquipment
      .filter(eq => {
        const haystack = `${eq.nombre} ${eq.alias ?? ''} ${eq.codigo}`.toLowerCase()
        return terms.every(t => haystack.includes(t))
      })
      .slice(0, 30) // Limitar resultados visibles
  }, [allEquipment, searchQuery, minChars])

  return { results, loading }
}
