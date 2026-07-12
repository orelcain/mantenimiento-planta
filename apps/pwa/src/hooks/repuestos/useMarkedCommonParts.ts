/**
 * useMarkedCommonParts — repuestos marcados como "común" de una máquina desde el
 * módulo Repuestos (campo `comunEn: string[]` con el slug de la máquina). Se fusiona
 * con la lista curada estática (commonPartsByMachine) en la pestaña "Repuestos
 * comunes" del Centro de Aprendizaje, para que lo marcado por Mantención aparezca
 * ahí sin tocar código.
 */
import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import type { CommonPart } from '@/data/commonPartsByMachine'

const TIPO_FALLBACK = 'Sin clasificar'

export function useMarkedCommonParts(slug: string | undefined): { parts: CommonPart[]; loading: boolean } {
  const [parts, setParts] = useState<CommonPart[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!slug) { setParts([]); return }
    let alive = true
    setLoading(true)
    getDocs(query(collection(db, 'repuestos'), where('comunEn', 'array-contains', slug)))
      .then(snap => {
        if (!alive) return
        const out: CommonPart[] = snap.docs.map(d => {
          const r = d.data() as Record<string, unknown>
          const sap = String(r.codigoSAP ?? d.id).trim()
          return {
            tipo: (typeof r.tipo === 'string' && r.tipo.trim()) ? r.tipo.trim() : TIPO_FALLBACK,
            nombre: String(r.textoBreve || r.descripcion || r.alias || r.nombreManual || 'Repuesto'),
            sap,
            codigoManual: typeof r.codigoFabricante === 'string' ? r.codigoFabricante : undefined,
          }
        })
        setParts(out)
      })
      .catch(err => {
        if (alive) { setParts([]); logger.error('Error cargando repuestos comunes marcados', err instanceof Error ? err : new Error(String(err))) }
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [slug])

  return { parts, loading }
}
