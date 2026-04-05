/**
 * useHierarchyAreaTree — Árbol de áreas con lazy loading
 *
 * Carga inicial: niveles 1–4. Al expandir un nodo, carga sus hijos-área.
 * Solo incluye nodos con código alfanumérico (áreas), NO equipos SAP (código numérico).
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore'
import { db } from '@/services/firebase'
import {
  HierarchyNode,
  HierarchyNodeWithChildren,
  HierarchyLevel,
  isEquipmentNode,
} from '@/types/hierarchy'

// Nodo de área para el sidebar — extiende con conteo de equipos hijos
export interface AreaTreeNode extends HierarchyNodeWithChildren {
  children: AreaTreeNode[]
  equipmentCount: number    // Equipos SAP directos (hijos con código numérico)
  hasMoreChildren: boolean  // true si hay hijos-área no cargados aún
  isLoading?: boolean       // true mientras se cargan hijos
}

const INITIAL_MAX_LEVEL = 4 // Cargar hasta SISTEMA inicialmente

// Cache de nodos por parentId para evitar re-fetches
const areaChildrenCache = new Map<string, { nodes: HierarchyNode[]; equipCount: number; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000

function isAreaNode(node: HierarchyNode): boolean {
  // Áreas tienen código alfanumérico no vacío (ej: "PROD-001")
  // Equipos tienen código numérico (ej: "720004316") o vacío
  return !!node.codigo && !isEquipmentNode(node.codigo)
}

function buildAreaTree(nodes: HierarchyNode[]): AreaTreeNode[] {
  const nodeMap = new Map<string, AreaTreeNode>()
  const rootNodes: AreaTreeNode[] = []

  // Separar áreas y equipos
  const areas = nodes.filter(isAreaNode)
  const equipmentByParent = new Map<string, number>()

  // Contar equipos por parentId
  for (const n of nodes) {
    if (isEquipmentNode(n.codigo) && n.parentId) {
      equipmentByParent.set(n.parentId, (equipmentByParent.get(n.parentId) || 0) + 1)
    }
  }

  // Crear mapa de nodos área
  for (const node of areas) {
    nodeMap.set(node.id, {
      ...node,
      children: [],
      equipmentCount: equipmentByParent.get(node.id) || 0,
      hasMoreChildren: false,
    })
  }

  // Construir relaciones parent-child
  for (const node of areas) {
    const treeNode = nodeMap.get(node.id)!
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId)
      if (parent) {
        parent.children.push(treeNode)
      }
    } else {
      rootNodes.push(treeNode)
    }
  }

  return rootNodes
}

// Contar equipos recursivos (propios + de todos los descendientes)
function countEquipmentRecursive(node: AreaTreeNode): number {
  let total = node.equipmentCount
  for (const child of node.children) {
    total += countEquipmentRecursive(child)
  }
  return total
}

export function useHierarchyAreaTree() {
  const [allNodes, setAllNodes] = useState<HierarchyNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [loadingNodeIds, setLoadingNodeIds] = useState<Set<string>>(new Set())
  const loadedRef = useRef(false)

  // Carga inicial: todos los nodos activos hasta nivel INITIAL_MAX_LEVEL
  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true

    const load = async () => {
      try {
        setLoading(true)
        const hierarchyRef = collection(db, 'hierarchy')
        const q = query(
          hierarchyRef,
          where('activo', '==', true),
          where('nivel', '<=', INITIAL_MAX_LEVEL),
          orderBy('nivel', 'asc'),
          orderBy('orden', 'asc'),
        )
        const snapshot = await getDocs(q)
        const nodes: HierarchyNode[] = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data(),
        } as HierarchyNode))

        // También cargar equipos de nivel 5 para conteo (solo si su padre es área de nivel <= 4)
        const q2 = query(
          hierarchyRef,
          where('activo', '==', true),
          where('nivel', '==', INITIAL_MAX_LEVEL + 1),
          orderBy('orden', 'asc'),
        )
        const snap2 = await getDocs(q2)
        const level5Nodes: HierarchyNode[] = snap2.docs.map(d => ({
          id: d.id,
          ...d.data(),
        } as HierarchyNode))

        // Agregar solo equipos de nivel 5 (para conteo), no como nodos del árbol
        setAllNodes([...nodes, ...level5Nodes])
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Error cargando jerarquía'))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  // Expandir un nodo: cargar sus hijos-área y equipos directos
  const expandNode = useCallback(async (nodeId: string) => {
    const cached = areaChildrenCache.get(nodeId)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      // Ya tenemos los hijos en cache — agregarlos si no están ya
      setAllNodes(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        const newNodes = cached.nodes.filter(n => !existingIds.has(n.id))
        return newNodes.length > 0 ? [...prev, ...newNodes] : prev
      })
      return
    }

    setLoadingNodeIds(prev => new Set(prev).add(nodeId))

    try {
      const hierarchyRef = collection(db, 'hierarchy')
      const q = query(
        hierarchyRef,
        where('parentId', '==', nodeId),
        where('activo', '==', true),
        orderBy('orden', 'asc'),
      )
      const snapshot = await getDocs(q)
      const childNodes: HierarchyNode[] = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
      } as HierarchyNode))

      // Contar equipos
      const equipCount = childNodes.filter(n => isEquipmentNode(n.codigo)).length

      // Cachear
      areaChildrenCache.set(nodeId, { nodes: childNodes, equipCount, ts: Date.now() })

      // También cargar nietos (nivel+1) para poder mostrar equipmentCount en los hijos
      const areaChildren = childNodes.filter(isAreaNode)
      if (areaChildren.length > 0) {
        const grandchildPromises = areaChildren.map(async (child) => {
          const cachedGC = areaChildrenCache.get(child.id)
          if (cachedGC && Date.now() - cachedGC.ts < CACHE_TTL) {
            return cachedGC.nodes
          }
          const qGC = query(
            hierarchyRef,
            where('parentId', '==', child.id),
            where('activo', '==', true),
            orderBy('orden', 'asc'),
          )
          const snapGC = await getDocs(qGC)
          const gcNodes: HierarchyNode[] = snapGC.docs.map(d => ({
            id: d.id,
            ...d.data(),
          } as HierarchyNode))
          const gcEquipCount = gcNodes.filter(n => isEquipmentNode(n.codigo)).length
          areaChildrenCache.set(child.id, { nodes: gcNodes, equipCount: gcEquipCount, ts: Date.now() })
          return gcNodes
        })
        const grandchildren = (await Promise.all(grandchildPromises)).flat()
        childNodes.push(...grandchildren)
      }

      setAllNodes(prev => {
        const existingIds = new Set(prev.map(n => n.id))
        const newNodes = childNodes.filter(n => !existingIds.has(n.id))
        return newNodes.length > 0 ? [...prev, ...newNodes] : prev
      })
    } catch (err) {
      console.error('Error expanding node', nodeId, err)
    } finally {
      setLoadingNodeIds(prev => {
        const next = new Set(prev)
        next.delete(nodeId)
        return next
      })
    }
  }, [])

  // Construir árbol desde nodos planos
  const areaTree = useMemo(() => {
    if (allNodes.length === 0) return []

    const tree = buildAreaTree(allNodes)

    // Marcar nodos que podrían tener hijos no cargados
    function markHasMore(node: AreaTreeNode) {
      // Si el nodo tiene nivel < 8 y no tiene hijos-área cargados, podría tener más
      const cachedChildren = areaChildrenCache.get(node.id)
      if (!cachedChildren && node.nivel < HierarchyLevel.ELEMENTO && node.children.length === 0) {
        node.hasMoreChildren = true
      }
      // Si tiene equipmentCount > 0 o hijos, no se poda
      node.isLoading = loadingNodeIds.has(node.id)
      for (const child of node.children) {
        markHasMore(child)
      }
    }

    for (const root of tree) {
      markHasMore(root)
    }

    return tree
  }, [allNodes, loadingNodeIds])

  // Mapa plano id→nombre para breadcrumbs
  const nodeNameMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const n of allNodes) {
      if (isAreaNode(n)) {
        map.set(n.id, n.nombre)
      }
    }
    return map
  }, [allNodes])

  // Buscar un nodo en el árbol
  const findNode = useCallback((nodeId: string): AreaTreeNode | null => {
    function search(nodes: AreaTreeNode[]): AreaTreeNode | null {
      for (const n of nodes) {
        if (n.id === nodeId) return n
        const found = search(n.children)
        if (found) return found
      }
      return null
    }
    return search(areaTree)
  }, [areaTree])

  // Path de un nodo (para breadcrumb)
  const getNodePath = useCallback((nodeId: string): { id: string; nombre: string }[] => {
    const path: { id: string; nombre: string }[] = []
    function search(nodes: AreaTreeNode[], ancestors: { id: string; nombre: string }[]): boolean {
      for (const n of nodes) {
        const currentPath = [...ancestors, { id: n.id, nombre: n.nombre }]
        if (n.id === nodeId) {
          path.push(...currentPath)
          return true
        }
        if (search(n.children, currentPath)) return true
      }
      return false
    }
    search(areaTree, [])
    return path
  }, [areaTree])

  return {
    areaTree,
    loading,
    error,
    expandNode,
    findNode,
    getNodePath,
    nodeNameMap,
    countEquipmentRecursive,
  }
}
