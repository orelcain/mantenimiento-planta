/**
 * useGlobalSearch v2.48.94
 *
 * Búsqueda global de repuestos a través de TODAS las máquinas.
 * Usa collectionGroup('repuestos') de Firestore para cargar
 * todos los repuestos y luego filtra client-side.
 */

import { useState, useCallback, useRef } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Repuesto, Machine } from '@/types/repuestos'

export interface GlobalSearchResult {
  repuesto: Repuesto
  machineId: string
  machineName: string
}

export function useGlobalSearch(machines: Machine[]) {
  const [allRepuestos, setAllRepuestos] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadingRef = useRef(false)

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
      const q = queryText.toLowerCase()
      return allRepuestos.filter((r) => {
        const rep = r.repuesto
        return (
          rep.codigoSAP?.toLowerCase().includes(q) ||
          rep.textoBreve?.toLowerCase().includes(q) ||
          rep.descripcion?.toLowerCase().includes(q) ||
          rep.codigoFabricante?.toLowerCase().includes(q) ||
          rep.ubicacionEnPlanta?.toLowerCase().includes(q) ||
          r.machineName.toLowerCase().includes(q)
        )
      })
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
