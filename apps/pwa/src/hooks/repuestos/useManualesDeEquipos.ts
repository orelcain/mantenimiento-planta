/**
 * useManualesDeEquipos — Manuales heredados de los equipos de un material.
 *
 * Modelo unificado (Fase 6): los manuales viven en la colección plana `manuales`
 * con `equipos: [nodeIds]` (N:M, mismo patrón que repuestos). Un material hereda
 * los manuales de TODOS los equipos donde se usa: consultamos `manuales` donde
 * `equipos array-contains-any [nodeIds del material]`. Así un rodamiento de las
 * Baader 142 muestra los 3 PDFs de la Baader sin vincularlos a mano.
 */
import { useState, useEffect } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

export interface ManualHeredado {
  id: string
  titulo: string
  url: string
  machineOrigen?: string
}

export function useManualesDeEquipos(equipoNodeIds: string[]): { manuales: ManualHeredado[]; loading: boolean } {
  const [manuales, setManuales] = useState<ManualHeredado[]>([])
  const [loading, setLoading] = useState(false)
  // Clave estable para el efecto (orden/dedup) sin recrear el array en cada render.
  const key = [...new Set(equipoNodeIds.filter(Boolean))].sort().join(',')

  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (!ids.length) { setManuales([]); return }
    let alive = true
    setLoading(true)
    // array-contains-any admite hasta 30 valores → trocear por si un material
    // sirviera a muchos equipos.
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30))
    Promise.all(
      chunks.map((c) => getDocs(query(collection(db, 'manuales'), where('equipos', 'array-contains-any', c)))),
    )
      .then((snaps) => {
        if (!alive) return
        const byId = new Map<string, ManualHeredado>()
        for (const snap of snaps) {
          for (const d of snap.docs) {
            const m = d.data()
            if (!byId.has(d.id)) byId.set(d.id, { id: d.id, titulo: m.titulo || 'Manual', url: m.url || '', machineOrigen: m.machineOrigen })
          }
        }
        setManuales([...byId.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')))
      })
      .catch((err) => {
        if (alive) { setManuales([]); logger.error('Error cargando manuales heredados', err instanceof Error ? err : new Error(String(err))) }
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [key])

  return { manuales, loading }
}
