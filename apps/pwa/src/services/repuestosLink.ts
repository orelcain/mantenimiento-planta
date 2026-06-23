import { arrayRemove, arrayUnion, collection, doc, getDocs, updateDoc } from '@/services/firestoreTracked'
import { db } from './firebase'

/**
 * Vínculo repuesto ↔ equipo (N:M) desde el expediente del CTD.
 * El maestro `repuestos` tiene `equipos: [nodeIds]`. Vincular = agregar el nodeId
 * del equipo al array del repuesto. Búsqueda client-side sobre el maestro cargado
 * una vez (cache de módulo). Regla: update repuestos = technician.
 */
export interface RepuestoMaestroItem {
  id: string
  codigoSAP: string
  nombre: string
  equipos: string[]
}

let cache: RepuestoMaestroItem[] | null = null

export async function getRepuestosMaestro(): Promise<RepuestoMaestroItem[]> {
  if (cache) return cache
  const snap = await getDocs(collection(db, 'repuestos'))
  cache = snap.docs.map((d) => {
    const r = d.data() as Record<string, unknown>
    return {
      id: d.id,
      codigoSAP: String(r.codigoSAP ?? ''),
      nombre: String(r.textoBreve || r.descripcion || r.alias || r.nombreManual || 'Repuesto'),
      equipos: Array.isArray(r.equipos) ? (r.equipos as string[]) : [],
    }
  })
  return cache
}

export async function linkRepuestoEquipo(repuestoId: string, nodeId: string, codigo: string): Promise<void> {
  await updateDoc(doc(db, 'repuestos', repuestoId), {
    equipos: arrayUnion(nodeId),
    equiposCodigos: arrayUnion((codigo || '').trim() || `s/c:${nodeId}`),
  })
  const it = cache?.find((x) => x.id === repuestoId)
  if (it && !it.equipos.includes(nodeId)) it.equipos.push(nodeId)
}

export async function unlinkRepuestoEquipo(repuestoId: string, nodeId: string): Promise<void> {
  await updateDoc(doc(db, 'repuestos', repuestoId), { equipos: arrayRemove(nodeId) })
  const it = cache?.find((x) => x.id === repuestoId)
  if (it) it.equipos = it.equipos.filter((e) => e !== nodeId)
}
