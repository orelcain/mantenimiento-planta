import { collection, doc, getDocs, serverTimestamp, updateDoc } from '@/services/firestoreTracked'
import { db } from './firebase'

/**
 * Mover (reparentar) un equipo en el árbol `hierarchy` (fuente de verdad SAP).
 * El equipo ES un nodo `tipoNodo:'equipo'`; "mover" = cambiar su `parentId`.
 * Conserva los repuestos/manuales (se vinculan por nodeId, que NO cambia).
 * Marca el equipo `syncExcluded` para que el sync SAP no revierta el cambio.
 * Solo admin (regla `hierarchy` update = admin).
 */

export interface AreaNode {
  id: string
  /** Ruta completa de nombres (para mostrar en el picker). */
  rutaNombre: string
  nivel: number
}

interface RawNode {
  id: string
  nombre: string
  nivel: number
  parentId: string | null
  tipoNodo?: string
  path: string[]
}

let nodesCache: RawNode[] | null = null

async function loadNodes(): Promise<RawNode[]> {
  if (nodesCache) return nodesCache
  const snap = await getDocs(collection(db, 'hierarchy'))
  nodesCache = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>
    return {
      id: d.id,
      nombre: String(x.nombre ?? x.alias ?? d.id),
      nivel: typeof x.nivel === 'number' ? x.nivel : 0,
      parentId: (x.parentId ?? null) as string | null,
      tipoNodo: typeof x.tipoNodo === 'string' ? x.tipoNodo : undefined,
      path: Array.isArray(x.path) ? (x.path as string[]) : [],
    }
  })
  return nodesCache
}

function indexById(nodes: RawNode[]): Map<string, RawNode> {
  const m = new Map<string, RawNode>()
  for (const n of nodes) m.set(n.id, n)
  return m
}

/** Ids de ancestros desde la raíz (sin incluir el propio nodo), vía cadena parentId. */
function ancestorIds(nodeId: string, map: Map<string, RawNode>): string[] {
  const out: string[] = []
  let cur = map.get(nodeId)?.parentId ?? null
  let guard = 0
  while (cur && guard++ < 30) {
    out.unshift(cur)
    cur = map.get(cur)?.parentId ?? null
  }
  return out
}

/** Ruta de nombres "A > B > C" hasta el nodo (incluido). */
function rutaNombre(nodeId: string, map: Map<string, RawNode>): string {
  return [...ancestorIds(nodeId, map), nodeId]
    .map((id) => map.get(id)?.nombre ?? '')
    .filter(Boolean)
    .join(' > ')
}

/** Candidatos a nuevo padre: cualquier nodo salvo el propio y sus descendientes (evita ciclos). */
export async function getParentCandidates(nodeId: string): Promise<AreaNode[]> {
  const nodes = await loadNodes()
  const map = indexById(nodes)
  const esDescendiente = (id: string): boolean => {
    let cur = map.get(id)?.parentId ?? null
    let guard = 0
    while (cur && guard++ < 30) {
      if (cur === nodeId) return true
      cur = map.get(cur)?.parentId ?? null
    }
    return false
  }
  return nodes
    .filter((n) => n.id !== nodeId && !esDescendiente(n.id))
    .map((n) => ({ id: n.id, rutaNombre: rutaNombre(n.id, map), nivel: n.nivel }))
    .sort((a, b) => a.rutaNombre.localeCompare(b.rutaNombre, 'es'))
}

/**
 * Reparenta el nodo del equipo bajo `newParentId`. Devuelve la nueva ruta (string).
 * Actualiza: hierarchy/{nodeId} (parentId + path) y equipment/{equipmentId}
 * (hierarchyPath + syncExcluded).
 */
export async function moverEquipoEnJerarquia(equipmentId: string, nodeId: string, newParentId: string): Promise<string> {
  const nodes = await loadNodes()
  const map = indexById(nodes)
  const self = map.get(nodeId)
  const parent = map.get(newParentId)
  if (!self) throw new Error('No se encontró el nodo del equipo en la jerarquía.')
  if (!parent) throw new Error('No se encontró el destino en la jerarquía.')

  const newPathArr = [...ancestorIds(newParentId, map), newParentId]
  const newPathStr = `${rutaNombre(newParentId, map)} > ${self.nombre}`

  await updateDoc(doc(db, 'hierarchy', nodeId), {
    parentId: newParentId,
    path: newPathArr,
    actualizadoEn: serverTimestamp(),
  })
  await updateDoc(doc(db, 'equipment', equipmentId), {
    hierarchyPath: newPathStr,
    syncExcluded: true,
    updatedAt: serverTimestamp(),
  })

  // Mantener el cache coherente.
  self.parentId = newParentId
  self.path = newPathArr
  return newPathStr
}
