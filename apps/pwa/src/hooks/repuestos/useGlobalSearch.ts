/**
 * useGlobalSearch v2.48.94
 *
 * Búsqueda global de repuestos a través de TODAS las máquinas.
 * Usa collectionGroup('repuestos') de Firestore para cargar
 * todos los repuestos y luego filtra client-side.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Repuesto, Machine } from '@/types/repuestos'

export interface GlobalSearchResult {
  repuesto: Repuesto
  machineId: string
  machineName: string
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Preservar puntos/comas entre dígitos (decimales: 2.2, 2,2)
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

/**
 * Verifica si un token (o sus sinónimos o un match fuzzy) aparece en el texto.
 * Retorna true si el token está "presente" en el texto buscable.
 */
const tokenMatchesText = (token: string, searchable: string, words: string[]) => {
  // Match directo
  if (searchable.includes(token)) return true
  // Match por sinónimo
  const synonyms = SYNONYM_LOOKUP[token]
  if (synonyms?.some((s) => searchable.includes(s))) return true
  // Match fuzzy (solo para tokens largos)
  if (token.length >= 4 && words.some((word) => word.length >= 4 && editDistanceAtMostOne(token, word))) return true
  return false
}

const scoreResult = (result: GlobalSearchResult, normalizedQuery: string, tokens: string[]) => {
  const rep = result.repuesto
  const name = normalizeText(rep.textoBreve || '')
  const sap = normalizeText(rep.codigoSAP || '')
  const fabricante = normalizeText(rep.codigoFabricante || '')
  const descripcion = normalizeText(rep.descripcion || '')
  const ubicacion = normalizeText(rep.ubicacionEnPlanta || '')
  const machineName = normalizeText(result.machineName || '')

  const searchable = `${name} ${sap} ${fabricante} ${descripcion} ${ubicacion} ${machineName}`.trim()
  const words = searchable.split(' ').filter(Boolean)

  // ── FILTRO AND: TODOS los tokens deben estar presentes ──
  // (match directo, por sinónimo o fuzzy)
  const uniqueTokens = [...new Set(tokens.filter(Boolean))]
  for (const token of uniqueTokens) {
    if (!tokenMatchesText(token, searchable, words)) {
      return 0 // token ausente → descartado
    }
  }

  // ── SCORING: solo para resultados que pasaron el filtro AND ──
  let score = 1 // base: pasó el filtro

  if (sap === normalizedQuery) score += 220
  if (fabricante === normalizedQuery) score += 180
  if (name === normalizedQuery) score += 170

  if (sap.startsWith(normalizedQuery)) score += 120
  if (fabricante.startsWith(normalizedQuery)) score += 95
  if (name.startsWith(normalizedQuery)) score += 90

  if (name.includes(normalizedQuery)) score += 65
  if (fabricante.includes(normalizedQuery)) score += 50
  if (descripcion.includes(normalizedQuery)) score += 35
  if (machineName.includes(normalizedQuery)) score += 25
  if (ubicacion.includes(normalizedQuery)) score += 20

  for (const token of uniqueTokens) {
    if (!token) continue
    // Bonus por campo donde aparece
    if (name.includes(token)) score += 25
    if (sap.includes(token)) score += 22
    if (fabricante.includes(token)) score += 18
    if (descripcion.includes(token)) score += 10
    if (machineName.includes(token)) score += 9
    if (ubicacion.includes(token)) score += 7
  }

  // Bonus extra si todos los tokens aparecen juntos (frase exacta)
  if (uniqueTokens.length > 1 && searchable.includes(normalizedQuery)) {
    score += 50
  }

  return score
}

export function useGlobalSearch(machines: Machine[]) {
  const [allRepuestos, setAllRepuestos] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadingRef = useRef(false)

  // Si cambia el set de máquinas, invalidar cache para recargar el índice global
  useEffect(() => {
    setLoaded(false)
  }, [machines])

  /**
   * Carga todos los repuestos de todas las máquinas.
   * Usa la iteración por máquina (más fiable que collectionGroup
   * que requiere un índice de Firestore especial).
   */
  const loadAll = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setError(null)

    try {
      const results: GlobalSearchResult[] = []

      for (const machine of machines) {
        if (!machine.activa) continue
        const machineCol = collection(db, `machines/${machine.id}/repuestos`)
        const snapshot = await getDocs(machineCol)

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data()
          const rep: Repuesto = {
            id: docSnap.id,
            ...data,
            codigoFabricante: data.codigoFabricante || data.codigoBaader || '',
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
          } as Repuesto

          results.push({
            repuesto: rep,
            machineId: machine.id,
            machineName: machine.nombre || machine.id,
          })
        }
      }

      setAllRepuestos(results)
      setLoaded(true)
    } catch (err) {
      console.error('Error en búsqueda global:', err)
      setError('Error al buscar en todas las máquinas')
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [machines])

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

  return {
    allRepuestos,
    loading,
    loaded,
    error,
    loadAll,
    search,
  }
}
