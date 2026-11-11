/**
 * Cuánto respalda a cada equipo favorito: repuestos, repuestos con SAP y eventos de bitácora.
 *
 * Usa conteos agregados (1 lectura por cada 1.000 entradas) y no baja el maestro de repuestos:
 * abrir «Mis equipos» no debe costar los ~7.900 documentos del catálogo. Un conteo fallido
 * devuelve `null` y se puede reintentar; la ventana deja la celda en blanco.
 */
import { collection, getCountFromServer, query, where, type Query } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { BITACORA_COLECCION } from '@/config/bitacora'
import { logger } from '@/lib/logger'

const TTL = 5 * 60 * 1000
/** Tope de Firestore para `array-contains-any`. */
export const MAX_EQUIPOS_SIN_REPETIR = 30

const cache = new Map<string, { t: number; p: Promise<number | null> }>()

function contar(clave: string, q: () => Query): Promise<number | null> {
  const hit = cache.get(clave)
  if (hit && Date.now() - hit.t < TTL) return hit.p
  const p = getCountFromServer(q())
    .then((s): number | null => s.data().count)
    .catch((err: unknown) => {
      logger.error('No se pudo contar el respaldo del equipo', err instanceof Error ? err : new Error(String(err)))
      cache.delete(clave)
      return null
    })
  cache.set(clave, { t: Date.now(), p })
  return p
}

const repuestos = () => collection(db, 'repuestos')

export function contarRepuestos(nodeId: string): Promise<number | null> {
  return contar(`r|${nodeId}`, () => query(repuestos(), where('equipos', 'array-contains', nodeId)))
}

export function contarRepuestosConSap(nodeId: string): Promise<number | null> {
  return contar(`s|${nodeId}`, () => query(repuestos(), where('equipos', 'array-contains', nodeId), where('tieneSap', '==', true)))
}

export function contarEventosBitacora(codigo: string): Promise<number | null> {
  return contar(`b|${codigo}`, () => query(collection(db, BITACORA_COLECCION), where('equipoCodigo', '==', codigo)))
}

/** Repuestos distintos de un grupo de equipos. Sobre 30 equipos Firestore no puede contarlos de una vez. */
export async function contarRepuestosSinRepetir(nodeIds: string[]): Promise<{ total: number | null; conSap: number | null }> {
  if (nodeIds.length === 0) return { total: 0, conSap: 0 }
  if (nodeIds.length > MAX_EQUIPOS_SIN_REPETIR) return { total: null, conSap: null }
  const ids = [...nodeIds].sort()
  const clave = ids.join(',')
  const [total, conSap] = await Promise.all([
    contar(`dr|${clave}`, () => query(repuestos(), where('equipos', 'array-contains-any', ids))),
    contar(`ds|${clave}`, () => query(repuestos(), where('equipos', 'array-contains-any', ids), where('tieneSap', '==', true))),
  ])
  return { total, conSap }
}
