/**
 * useGlobalSearch v4.0 — Colección plana `repuestos` (normalización 2026-06)
 *
 * El catálogo vive en la colección top-level `repuestos`: un doc por repuesto
 * (docId = código SAP si existe), con `equipos: [nodeIds de hierarchy]` (N:M).
 * La carga pasa de iterar machines/*&#47;repuestos + 702 subcolecciones a DOS
 * queries: hierarchy (nombres) + repuestos (docs).
 *
 * Compatibilidad: se emite un GlobalSearchResult por (doc × equipo), donde
 * `machineId` = nodeId de hierarchy y `machineName` = alias || nombre del nodo.
 * El mismo doc Repuesto (misma id) se comparte entre sus equipos.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import type { Repuesto, Machine } from '@/types/repuestos'

export interface GlobalSearchResult {
  repuesto: Repuesto
  /** nodeId del equipo en `hierarchy` (antes: id de machines). */
  machineId: string
  /** alias || nombre del nodo-equipo. */
  machineName: string
}

export interface LoadProgress {
  loaded: number
  total: number
  phase: 'machines' | 'hierarchy' | 'done'
}

// ── Caché a nivel módulo (sobrevive mount/unmount) ────────────────
let cachedRepuestos: GlobalSearchResult[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

export function getGlobalRepuestosCache(): GlobalSearchResult[] | null {
  if (cachedRepuestos && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedRepuestos
  }
  return null
}

export function invalidateGlobalRepuestosCache() {
  cachedRepuestos = null
  cacheTimestamp = 0
}

// ── Text normalization & search ───────────────────────────────────

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d)[.,](\d)/g, '$1⋅$2')
    .replace(/[^a-z0-9\s\-_/⋅]/g, ' ')
    .replace(/⋅/g, '.')
    .replace(/\s+/g, ' ')
    .trim()

const SYNONYM_GROUPS: string[][] = [
  ['motor', 'motriz', 'motores'],
  ['bomba', 'pump', 'bombas'],
  ['reductor', 'motorreductor', 'gearbox'],
  ['cinta', 'transportadora', 'conveyor', 'banda'],
  ['valvula', 'valvula', 'valvulas'],
  ['sensor', 'instrumento', 'transmisor'],
  ['rodamiento', 'bearing', 'ruleman'],
  ['sello', 'reten', 'retenedor'],
]

const SYNONYM_LOOKUP = SYNONYM_GROUPS.reduce<Record<string, string[]>>((acc, group) => {
  const normalizedGroup = group.map(normalizeText)
  for (const term of normalizedGroup) {
    acc[term] = normalizedGroup.filter((item) => item !== term)
  }
  return acc
}, {})

const editDistanceAtMostOne = (a: string, b: string) => {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false

  let i = 0
  let j = 0
  let edits = 0

  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }

    edits++
    if (edits > 1) return false

    if (la > lb) {
      i++
    } else if (lb > la) {
      j++
    } else {
      i++
      j++
    }
  }

  if (i < la || j < lb) edits++
  return edits <= 1
}

const tokenMatchesText = (token: string, searchable: string, words: string[]) => {
  if (searchable.includes(token)) return true
  const synonyms = SYNONYM_LOOKUP[token]
  if (synonyms?.some((s) => searchable.includes(s))) return true
  if (token.length >= 4 && words.some((word) => word.length >= 4 && editDistanceAtMostOne(token, word))) return true
  return false
}

const scoreResult = (result: GlobalSearchResult, normalizedQuery: string, tokens: string[]) => {
  const rep = result.repuesto
  const name = normalizeText(rep.textoBreve || '')
  const alias = normalizeText(rep.alias || '')
  const sap = normalizeText(rep.codigoSAP || '')
  const fabricante = normalizeText(rep.codigoFabricante || '')
  const descripcion = normalizeText(rep.descripcion || '')
  const ubicacion = normalizeText(rep.ubicacionEnPlanta || '')
  const machineName = normalizeText(result.machineName || '')
  const marca = normalizeText(`${rep.marca || ''} ${rep.modeloTipo || ''}`)

  const searchable = `${name} ${alias} ${sap} ${fabricante} ${descripcion} ${ubicacion} ${machineName} ${marca}`.trim()
  const words = searchable.split(' ').filter(Boolean)

  const uniqueTokens = [...new Set(tokens.filter(Boolean))]
  for (const token of uniqueTokens) {
    if (!tokenMatchesText(token, searchable, words)) {
      return 0
    }
  }

  let score = 1

  if (sap === normalizedQuery) score += 220
  if (fabricante === normalizedQuery) score += 180
  if (name === normalizedQuery) score += 170

  if (sap.startsWith(normalizedQuery)) score += 120
  if (fabricante.startsWith(normalizedQuery)) score += 95
  if (name.startsWith(normalizedQuery)) score += 90

  if (name.includes(normalizedQuery)) score += 65
  if (alias && alias.includes(normalizedQuery)) score += 80
  if (fabricante.includes(normalizedQuery)) score += 50
  if (descripcion.includes(normalizedQuery)) score += 35
  if (machineName.includes(normalizedQuery)) score += 25
  if (ubicacion.includes(normalizedQuery)) score += 20

  for (const token of uniqueTokens) {
    if (!token) continue
    if (name.includes(token)) score += 25
    if (alias && alias.includes(token)) score += 30
    if (sap.includes(token)) score += 22
    if (fabricante.includes(token)) score += 18
    if (descripcion.includes(token)) score += 10
    if (machineName.includes(token)) score += 9
    if (ubicacion.includes(token)) score += 7
  }

  if (uniqueTokens.length > 1 && searchable.includes(normalizedQuery)) {
    score += 50
  }

  return score
}

// ── Helper: parsear un doc de la colección plana a Repuesto ───────

function parseRepuestoDoc(docSnap: { id: string; data: () => any }): Repuesto {
  const data = docSnap.data()
  return {
    id: docSnap.id,
    ...data,
    // En la colección plana codigoSAP es null para repuestos sin SAP → '' para la UI
    codigoSAP: data.codigoSAP || '',
    codigoFabricante: data.codigoFabricante || data.codigoBaader || '',
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Repuesto
}

// ── Hook principal ────────────────────────────────────────────────

export function useGlobalSearch(machines: Machine[]) {
  const [allRepuestos, setAllRepuestos] = useState<GlobalSearchResult[]>(() => getGlobalRepuestosCache() || [])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(() => !!getGlobalRepuestosCache())
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<LoadProgress>({ loaded: 0, total: 0, phase: 'done' })
  const loadingRef = useRef(false)

  // Si cambia el set de máquinas, invalidar cache solo si realmente cambió
  const prevMachineIdsRef = useRef<string>('')
  useEffect(() => {
    const key = machines.map(m => m.id).sort().join(',')
    if (prevMachineIdsRef.current && prevMachineIdsRef.current !== key) {
      invalidateGlobalRepuestosCache()
      setLoaded(false)
    }
    prevMachineIdsRef.current = key
  }, [machines])

  /**
   * Carga el catálogo completo desde la colección plana `repuestos` (2 queries:
   * hierarchy para nombres de nodos + repuestos). Emite un resultado por
   * (doc × equipo) para mantener el contrato de las vistas existentes.
   */
  const loadAll = useCallback(async () => {
    if (loadingRef.current) return

    // Verificar caché primero
    const cached = getGlobalRepuestosCache()
    if (cached) {
      setAllRepuestos(cached)
      setLoaded(true)
      return
    }

    loadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      setProgress({ loaded: 0, total: 2, phase: 'hierarchy' })
      const [hierSnap, repSnap] = await Promise.all([
        getDocs(query(collection(db, 'hierarchy'), where('activo', '==', true))),
        getDocs(collection(db, 'repuestos')),
      ])
      setProgress({ loaded: 1, total: 2, phase: 'machines' })

      const nodeName = new Map<string, string>()
      hierSnap.docs.forEach((d) => {
        const n = d.data()
        nodeName.set(d.id, (n.alias || n.nombre || d.id) as string)
      })

      const results: GlobalSearchResult[] = []
      for (const docSnap of repSnap.docs) {
        const rep = parseRepuestoDoc(docSnap)
        const equipos = Array.isArray(rep.equipos) ? rep.equipos : []
        if (equipos.length === 0) {
          results.push({ repuesto: rep, machineId: '', machineName: 'Sin equipo' })
          continue
        }
        for (const nodeId of equipos) {
          results.push({ repuesto: rep, machineId: nodeId, machineName: nodeName.get(nodeId) || nodeId })
        }
      }

      // Guardar en caché módulo
      cachedRepuestos = results
      cacheTimestamp = Date.now()

      setAllRepuestos(results)
      setLoaded(true)
      setProgress({ loaded: 2, total: 2, phase: 'done' })
    } catch (err) {
      logger.error('Error en búsqueda global', err instanceof Error ? err : new Error(String(err)))
      setError('Error al cargar el catálogo de repuestos')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [])

  /** Filtra los resultados cargados por query de texto */
  const search = useCallback(
    (queryText: string): GlobalSearchResult[] => {
      if (!queryText.trim()) return allRepuestos
      const normalizedQuery = normalizeText(queryText)
      if (!normalizedQuery) return allRepuestos

      const tokens = normalizedQuery.split(' ').filter(Boolean)

      return allRepuestos
        .map((result) => ({
          result,
          score: scoreResult(result, normalizedQuery, tokens),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.result)
    },
    [allRepuestos]
  )

  const updateRepuestoAlias = useCallback((repId: string, machineId: string, alias: string | undefined) => {
    setAllRepuestos(prev =>
      prev.map(r =>
        r.repuesto.id === repId && r.machineId === machineId
          ? { ...r, repuesto: { ...r.repuesto, alias } }
          : r
      )
    )
  }, [])

  return {
    allRepuestos,
    loading,
    loaded,
    error,
    progress,
    loadAll,
    search,
    updateRepuestoAlias,
  }
}
