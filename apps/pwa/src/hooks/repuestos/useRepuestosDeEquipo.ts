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
import type { Repuesto } from '@/types/repuestos'

export interface RepuestoDeEquipo {
  id: string
  codigoSAP: string
  nombre: string
  /** El código del fabricante; en el despiece es lo que distingue una pieza de otra. */
  codigoFabricante?: string
  tipo?: string
  stockFisico?: number
  /**
   * Cuantas lleva la maquina. Es `cantidadPorMaquina`, NO `cantidadPorEquipo`:
   * ese ultimo esta en el esquema documentado pero en cero docs. Va a la
   * posicion de la BOM en IB01.
   */
  cantidadPorMaquina?: number
  /**
   * El documento completo. El export IB01 necesita campos que esta vista no
   * muestra (textoBreve, unidad, obsoleto), y volver a leerlos de Firestore
   * solo para exportar seria pagar la misma query dos veces.
   */
  doc: Repuesto
}

/**
 * Lee los repuestos de un equipo UNA vez, sin React.
 *
 * Existe aparte del hook porque el PDF del expediente necesita la misma lista pero **solo
 * cuando alguien pulsa el botón**. Llamar al hook desde el diálogo hacía la consulta al ABRIR
 * el expediente, así que una Baader leía sus 1.803 documentos dos veces: una para la pestaña
 * de materiales y otra por si acaso. Este proyecto tiene techo de costos en GCP.
 */
export async function leerRepuestosDeEquipo(nodeId: string): Promise<RepuestoDeEquipo[]> {
  const snap = await getDocs(query(collection(db, 'repuestos'), where('equipos', 'array-contains', nodeId)))
  const rows: RepuestoDeEquipo[] = snap.docs.map((d) => {
    const r = d.data() as Record<string, unknown>
    return {
      id: d.id,
      codigoSAP: String(r.codigoSAP ?? ''),
      nombre: String(r.textoBreve || r.descripcion || r.alias || r.nombreManual || 'Repuesto'),
      tipo: typeof r.tipo === 'string' ? r.tipo : undefined,
      codigoFabricante: typeof r.codigoFabricante === 'string' ? r.codigoFabricante : undefined,
      stockFisico: typeof r.stockFisico === 'number' ? r.stockFisico : undefined,
      doc: { id: d.id, ...r } as unknown as Repuesto,
      cantidadPorMaquina: typeof r.cantidadPorMaquina === 'number' ? r.cantidadPorMaquina : undefined,
    }
  })
  rows.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  return rows
}

export function useRepuestosDeEquipo(nodeId?: string, reloadKey?: number): { repuestos: RepuestoDeEquipo[]; loading: boolean } {
  const [repuestos, setRepuestos] = useState<RepuestoDeEquipo[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!nodeId) {
      setRepuestos([])
      return
    }
    let alive = true
    setLoading(true)
    leerRepuestosDeEquipo(nodeId)
      .then((rows) => {
        if (alive) setRepuestos(rows)
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
  }, [nodeId, reloadKey])

  return { repuestos, loading }
}
