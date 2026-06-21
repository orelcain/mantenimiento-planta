/**
 * useRepuestosDeEquipo — repuestos del maestro vinculados a un equipo.
 *
 * Modelo N:M (Fase 6): la colección plana `repuestos` tiene `equipos: [nodeIds]`.
 * Un equipo (nodeId de `hierarchy`) hereda los repuestos donde
 * `equipos array-contains <nodeId>`. Mismo patrón que `useManualesDeEquipos`.
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

export interface RepuestoDeEquipo {
  id: string
  codigoSAP: string
  nombre: string
  tipo?: string
  stockFisico?: number
}

export function useRepuestosDeEquipo(nodeId?: string): { repuestos: RepuestoDeEquipo[]; loading: boolean } {
  const [repuestos, setRepuestos] = useState<RepuestoDeEquipo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!nodeId) {
      setRepuestos([])
      return
    }
    let alive = true
    setLoading(true)
    getDocs(query(collection(db, 'repuestos'), where('equipos', 'array-contains', nodeId)))
      .then((snap) => {
        if (!alive) return
        const rows: RepuestoDeEquipo[] = snap.docs.map((d) => {
          const r = d.data() as Record<string, unknown>
          return {
            id: d.id,
            codigoSAP: String(r.codigoSAP ?? ''),
            nombre: String(r.textoBreve || r.descripcion || r.alias || r.nombreManual || 'Repuesto'),
            tipo: typeof r.tipo === 'string' ? r.tipo : undefined,
            stockFisico: typeof r.stockFisico === 'number' ? r.stockFisico : undefined,
          }
        })
        rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        setRepuestos(rows)
      })
      .catch((err) => {
        if (alive) {
          setRepuestos([])
          logger.error('Error cargando repuestos del equipo', err instanceof Error ? err : new Error(String(err)))
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [nodeId])

  return { repuestos, loading }
}
