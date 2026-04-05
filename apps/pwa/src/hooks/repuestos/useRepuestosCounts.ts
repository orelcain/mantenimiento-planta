/**
 * useRepuestosCounts — Obtiene el conteo de repuestos de cada máquina
 * usando getCountFromServer (aggregation query, no descarga documentos).
 */

import { useState, useEffect, useRef } from 'react'
import { collection, getCountFromServer } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Machine } from '@/types/repuestos'

// Cache global para evitar re-fetch innecesarios
let cachedCounts: Record<string, number> = {}
let cachedKey = ''

export function useRepuestosCounts(machines: Machine[]) {
  const [counts, setCounts] = useState<Record<string, number>>(cachedCounts)
  const [loading, setLoading] = useState(true)

  // Estabilizar dependencia: solo re-fetch si cambia la lista de IDs
  const machineIdsKey = machines.map(m => m.id).sort().join(',')
  const fetchingRef = useRef(false)

  useEffect(() => {
    if (machines.length === 0) {
      setCounts({})
      setLoading(false)
      return
    }

    // Si ya tenemos cache con la misma key, usar cache
    if (cachedKey === machineIdsKey && Object.keys(cachedCounts).length > 0) {
      setCounts(cachedCounts)
      setLoading(false)
      return
    }

    // Evitar fetches concurrentes
    if (fetchingRef.current) return
    fetchingRef.current = true

    let cancelled = false

    const fetchCounts = async () => {
      setLoading(true)
      const result: Record<string, number> = {}

      try {
        // Fetch en paralelo en batches de 10
        const BATCH = 10
        for (let i = 0; i < machines.length; i += BATCH) {
          if (cancelled) return
          const batch = machines.slice(i, i + BATCH)
          const promises = batch.map(async (m) => {
            try {
              const colRef = collection(db, `machines/${m.id}/repuestos`)
              const snapshot = await getCountFromServer(colRef)
              return { id: m.id, count: snapshot.data().count }
            } catch {
              return { id: m.id, count: 0 }
            }
          })
          const results = await Promise.all(promises)
          if (cancelled) return
          results.forEach(r => { result[r.id] = r.count })
        }

        if (!cancelled) {
          cachedCounts = result
          cachedKey = machineIdsKey
          setCounts(result)
          setLoading(false)
        }
      } finally {
        fetchingRef.current = false
      }
    }

    fetchCounts()

    return () => {
      cancelled = true
      fetchingRef.current = false
    }
  }, [machineIdsKey, machines])

  return { counts, loading }
}
