/**
 * useRepuestosByCodigos — resuelve repuestos del maestro por una lista de códigos
 * SAP. Usado por la pestaña "Repuestos comunes" del Centro de Aprendizaje para
 * traer foto/stock/nombre reales de una lista curada (commonPartsByMachine).
 *
 * Consulta por el campo `codigoSAP` en chunks de 30 (límite de `in` de Firestore).
 * Devuelve un mapa sap -> datos, para que el consumidor conserve su propio orden.
 */
import { useEffect, useState } from 'react'
import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'

export interface RepuestoResuelto {
  id: string
  codigoSAP: string
  nombre: string
  tipo?: string
  fotoUrl?: string
  stockFisico?: number
  ubicacion?: string
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

/** Extrae la URL de la foto principal (fotosReales > imagenesManual > gallery). */
function pickFoto(r: Record<string, unknown>): string | undefined {
  const arrays = [r.fotosReales, r.imagenesManual, r.gallery]
  for (const a of arrays) {
    if (Array.isArray(a) && a.length) {
      const principal = a.find((x): x is { url?: string; esPrincipal?: boolean } =>
        !!x && typeof x === 'object' && (x as { esPrincipal?: boolean }).esPrincipal === true)
      const chosen = (principal ?? a[0]) as { url?: string } | undefined
      if (chosen?.url) return chosen.url
    }
  }
  return undefined
}

export function useRepuestosByCodigos(saps: string[]): { bySap: Map<string, RepuestoResuelto>; loading: boolean } {
  const [bySap, setBySap] = useState<Map<string, RepuestoResuelto>>(new Map())
  const [loading, setLoading] = useState(false)
  // clave estable para el effect (orden no importa, unicidad sí)
  const key = [...new Set(saps.map(s => String(s).trim()).filter(Boolean))].sort().join(',')

  useEffect(() => {
    const codigos = key ? key.split(',') : []
    if (!codigos.length) {
      setBySap(new Map())
      return
    }
    let alive = true
    setLoading(true)
    // Cada query se resuelve por separado: si una falla (ej. un valor inválido para
    // documentId() in), no tumba a las demás. El repuesto trae nombre/tipo/foto; el
    // STOCK vive en la colección aparte `bodega/{codigoSAP}` (stock overlay).
    const empty = { docs: [] as { id: string; data: () => Record<string, unknown> }[] }
    const groups = chunk(codigos, 30)
    const repRuns = groups.flatMap(group => [
      getDocs(query(collection(db, 'repuestos'), where('codigoSAP', 'in', group))).catch(() => empty),
      getDocs(query(collection(db, 'repuestos'), where(documentId(), 'in', group))).catch(() => empty),
    ])
    const bodegaRuns = groups.map(group =>
      getDocs(query(collection(db, 'bodega'), where(documentId(), 'in', group))).catch(() => empty),
    )
    Promise.all([Promise.all(repRuns), Promise.all(bodegaRuns)])
      .then(([repSnaps, bodegaSnaps]) => {
        if (!alive) return
        // stock por SAP desde bodega
        const stockBySap = new Map<string, number>()
        for (const snap of bodegaSnaps) {
          for (const d of snap.docs) {
            const b = d.data() as Record<string, unknown>
            if (typeof b.stockActual === 'number') stockBySap.set(d.id, b.stockActual)
          }
        }
        const map = new Map<string, RepuestoResuelto>()
        for (const snap of repSnaps) {
          for (const d of snap.docs) {
            const r = d.data() as Record<string, unknown>
            const sap = String(r.codigoSAP ?? d.id).trim()
            if (map.has(sap)) continue
            map.set(sap, {
              id: d.id,
              codigoSAP: sap,
              nombre: String(r.textoBreve || r.descripcion || r.alias || r.nombreManual || 'Repuesto'),
              tipo: typeof r.tipo === 'string' ? r.tipo : undefined,
              fotoUrl: pickFoto(r),
              stockFisico: stockBySap.has(sap) ? stockBySap.get(sap) : (stockBySap.has(d.id) ? stockBySap.get(d.id) : undefined),
              ubicacion: typeof r.ubicacionEnPlanta === 'string' ? r.ubicacionEnPlanta : undefined,
            })
          }
        }
        setBySap(map)
      })
      .catch(err => {
        if (alive) {
          setBySap(new Map())
          logger.error('Error resolviendo repuestos por SAP', err instanceof Error ? err : new Error(String(err)))
        }
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [key])

  return { bySap, loading }
}
