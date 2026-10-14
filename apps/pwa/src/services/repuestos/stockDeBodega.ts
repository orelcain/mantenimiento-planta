import { collection, documentId, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'

/**
 * Stock en bodega de unos SAP concretos, leído solo cuando hace falta (al abrir
 * «Solicitar repuestos» desde el expediente, que no carga la bodega entera).
 * Lotes de 30: es el tope de `in` en Firestore. Un SAP sin doc queda fuera del
 * mapa = «sin registro en bodega», no cero.
 */
export async function leerStockDeBodega(saps: string[]): Promise<Map<string, StockDeSolicitud>> {
  const out = new Map<string, StockDeSolicitud>()
  const unicos = [...new Set(saps.map((s) => s.trim()).filter(Boolean))]
  for (let i = 0; i < unicos.length; i += 30) {
    const lote = unicos.slice(i, i + 30)
    const snap = await getDocs(query(collection(db, 'bodega'), where(documentId(), 'in', lote)))
    for (const d of snap.docs) {
      const x = d.data() as { stockActual?: number; unidad?: string; ubicacionBodega?: string }
      out.set(d.id, { configurado: true, stockActual: x.stockActual ?? 0, unidad: x.unidad, ubicacionBodega: x.ubicacionBodega })
    }
  }
  return out
}
