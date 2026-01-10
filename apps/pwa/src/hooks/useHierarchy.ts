/**
 * Hooks para gestión del sistema jerárquico
 * Optimizados con caché y queries eficientes
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  QueryConstraint,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../services/firebase'
import { useAuthStore } from '../store'
import { logger } from '../lib/logger'
import {
  HierarchyNode,
  HierarchyNodeWithChildren,
  HierarchyPath,
  HierarchyLevel,
  HierarchyFilters,
  CreateHierarchyNodeInput,
  UpdateHierarchyNodeInput,
  HierarchyStats,
} from '@/types/hierarchy'

// Cache global para árbol completo con timestamp de última actualización
let treeCache: {
  key: 'active' | 'all'
  data: HierarchyNodeWithChildren[]
  timestamp: number
  lastUpdate: Timestamp | null
} | null = null

const CACHE_TTL_MS = 5 * 60 * 1000

let nodeCache = new Map<string, { node: HierarchyNode; timestamp: number }>()
let childrenCache = new Map<string, { children: HierarchyNode[]; timestamp: number }>()
let pathCache = new Map<string, { path: HierarchyPath[]; timestamp: number }>()

function isFresh(timestamp: number) {
  return Date.now() - timestamp < CACHE_TTL_MS
}

function invalidateHierarchyCaches() {
  treeCache = null
  nodeCache.clear()
  childrenCache.clear()
  pathCache.clear()
}

async function getNodeCached(id: string): Promise<HierarchyNode | null> {
  const cached = nodeCache.get(id)
  if (cached && isFresh(cached.timestamp)) {
    return cached.node
  }

  const snap = await getDoc(doc(db, 'hierarchy', id))
  if (!snap.exists()) {
    nodeCache.delete(id)
    return null
  }

  const node = { id: snap.id, ...snap.data() } as HierarchyNode
  nodeCache.set(id, { node, timestamp: Date.now() })
  return node
}

/**
 * Hook principal: obtener árbol completo jerárquico
 * Con sincronización automática cada 30 segundos
 */
export function useHierarchyTree(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false
  const [tree, setTree] = useState<HierarchyNodeWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [hasUpdates, setHasUpdates] = useState(false)

  const loadTree = async () => {
    try {
      setError(null)

      const cacheKey: 'active' | 'all' = includeInactive ? 'all' : 'active'
      if (treeCache && treeCache.key === cacheKey && isFresh(treeCache.timestamp)) {
        setTree(treeCache.data)
        setHasUpdates(false)
        setLoading(false)
        return
      }

      setLoading(true)

      // Obtener todos los nodos ordenados por nivel y orden
      const hierarchyRef = collection(db, 'hierarchy')
      // Nota: includeInactive usa ordenamiento en cliente para evitar requerir un índice compuesto extra.
      const q = includeInactive
        ? query(hierarchyRef, orderBy('nivel', 'asc'))
        : query(
            hierarchyRef,
            where('activo', '==', true),
            orderBy('nivel', 'asc'),
            orderBy('orden', 'asc')
          )
      
      const snapshot = await getDocs(q)
      const nodesUnsorted: HierarchyNode[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as HierarchyNode))

      const nodes = includeInactive
        ? [...nodesUnsorted].sort((a, b) => {
            if (a.nivel !== b.nivel) return a.nivel - b.nivel
            return (a.orden ?? 0) - (b.orden ?? 0)
          })
        : nodesUnsorted

      // Pre-cargar cache de nodos por id para acelerar breadcrumbs/path
      const now = Date.now()
      nodes.forEach((n) => {
        nodeCache.set(n.id, { node: n, timestamp: now })
      })

      // Encontrar última actualización
      let lastUpdate: Timestamp | null = null
      nodes.forEach(node => {
        if (node.actualizadoEn) {
          if (!lastUpdate || node.actualizadoEn.toMillis() > lastUpdate.toMillis()) {
            lastUpdate = node.actualizadoEn
          }
        }
      })

      // Construir árbol desde los nodos planos
      const treeData = buildTree(nodes)

      // Actualizar caché
      treeCache = {
        key: includeInactive ? 'all' : 'active',
        data: treeData,
        timestamp: Date.now(),
        lastUpdate,
      }

      setTree(treeData)
      setHasUpdates(false)
      logger.info('Hierarchy tree loaded', { nodeCount: nodes.length })
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al cargar jerarquía')
      setError(error)
      logger.error('Failed to load hierarchy tree', error)
    } finally {
      setLoading(false)
    }
  }

  // Verificar si hay actualizaciones sin recargar todo el árbol
  const checkForUpdates = async () => {
    if (!treeCache?.lastUpdate) return
    
    try {
      const hierarchyRef = collection(db, 'hierarchy')
      const q = includeInactive
        ? query(
            hierarchyRef,
            where('actualizadoEn', '>', treeCache.lastUpdate),
            orderBy('actualizadoEn', 'desc')
          )
        : query(
            hierarchyRef,
            where('activo', '==', true),
            where('actualizadoEn', '>', treeCache.lastUpdate),
            orderBy('actualizadoEn', 'desc')
          )
      
      const snapshot = await getDocs(q)
      if (snapshot.size > 0) {
        setHasUpdates(true)
        logger.info('New hierarchy updates detected', { count: snapshot.size })
      }
    } catch (err) {
      logger.error('Error checking for updates', err instanceof Error ? err : new Error(String(err)))
    }
  }

  const loadTreeRef = useRef(loadTree)
  const checkForUpdatesRef = useRef(checkForUpdates)

  loadTreeRef.current = loadTree
  checkForUpdatesRef.current = checkForUpdates

  useEffect(() => {
    loadTreeRef.current()

    // Polling cada 30 segundos para detectar cambios
    const interval = setInterval(() => {
      checkForUpdatesRef.current()
    }, 30000)

    return () => clearInterval(interval)
  }, [includeInactive])

  const refresh = () => {
    invalidateHierarchyCaches()
    loadTree()
  }

  return { tree, loading, error, refresh, hasUpdates }
}

/**
 * Hook: obtener nodos hijos de un nivel específico
 */
export function useHierarchyChildren(parentId: string | null, nivel?: HierarchyLevel) {
  const [children, setChildren] = useState<HierarchyNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (nivel !== undefined && nivel >= 8) {
      // Nivel 8 no tiene hijos
      setChildren([])
      return
    }

    const cacheKey = `${parentId ?? 'root'}|${nivel ?? 'any'}`
    const cached = childrenCache.get(cacheKey)
    if (cached && isFresh(cached.timestamp)) {
      setChildren(cached.children)
      setLoading(false)
      return
    }

    const loadChildren = async () => {
      try {
        setLoading(true)
        const hierarchyRef = collection(db, 'hierarchy')
        
        const constraints: QueryConstraint[] = [
          where('parentId', '==', parentId),
          where('activo', '==', true),
          orderBy('orden', 'asc'),
        ]

        if (nivel !== undefined) {
          // El parámetro 'nivel' representa el nivel que queremos obtener, no el del padre
          // Por lo tanto, buscamos exactamente ese nivel
          constraints.unshift(where('nivel', '==', nivel))
        }

        const q = query(hierarchyRef, ...constraints)
        const snapshot = await getDocs(q)
        
        const nodes: HierarchyNode[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as HierarchyNode))

        childrenCache.set(cacheKey, { children: nodes, timestamp: Date.now() })
        setChildren(nodes)
      } catch (error) {
        logger.error('Failed to load hierarchy children', error instanceof Error ? error : new Error(String(error)))
        setChildren([])
      } finally {
        setLoading(false)
      }
    }

    loadChildren()
  }, [parentId, nivel])

  return { children, loading }
}

/**
 * Hook: obtener path completo de un nodo (breadcrumbs)
 */
export function useHierarchyPath(nodeId: string | null) {
  const [path, setPath] = useState<HierarchyPath[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!nodeId) {
      setPath([])
      return
    }

    const cached = pathCache.get(nodeId)
    if (cached && isFresh(cached.timestamp)) {
      setPath(cached.path)
      setLoading(false)
      return
    }

    const loadPath = async () => {
      try {
        setLoading(true)

        const node = await getNodeCached(nodeId)
        if (!node) {
          setPath([])
          pathCache.delete(nodeId)
          return
        }

        const ancestors = await Promise.all((node.path || []).map((id) => getNodeCached(id)))
        const fullPath: HierarchyPath[] = ancestors
          .filter((n): n is HierarchyNode => Boolean(n))
          .map((n) => ({
            id: n.id,
            nombre: n.nombre,
            codigo: n.codigo,
            nivel: n.nivel,
          }))

        fullPath.push({ id: node.id, nombre: node.nombre, codigo: node.codigo, nivel: node.nivel })

        pathCache.set(nodeId, { path: fullPath, timestamp: Date.now() })
        setPath(fullPath)
      } catch (error) {
        logger.error('Failed to load hierarchy path', error instanceof Error ? error : new Error(String(error)))
        setPath([])
      } finally {
        setLoading(false)
      }
    }

    loadPath()
  }, [nodeId])

  return { path, loading }
}

/**
 * Hook: buscar nodos con filtros
 */
export function useHierarchySearch(filters: HierarchyFilters) {
  const [nodes, setNodes] = useState<HierarchyNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const search = async () => {
      try {
        setLoading(true)
        const hierarchyRef = collection(db, 'hierarchy')
        
        const constraints: QueryConstraint[] = []

        if (filters.nivel !== undefined) {
          constraints.push(where('nivel', '==', filters.nivel))
        }

        if (filters.parentId !== undefined) {
          constraints.push(where('parentId', '==', filters.parentId))
        }

        if (filters.activo !== undefined) {
          constraints.push(where('activo', '==', filters.activo))
        }

        constraints.push(orderBy('orden', 'asc'))

        const q = query(hierarchyRef, ...constraints)
        const snapshot = await getDocs(q)
        
        let results: HierarchyNode[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as HierarchyNode))

        // Filtrar por búsqueda de texto en cliente
        if (filters.search) {
          const searchLower = filters.search.toLowerCase()
          results = results.filter(
            node =>
              node.nombre.toLowerCase().includes(searchLower) ||
              node.codigo.toLowerCase().includes(searchLower)
          )
        }

        setNodes(results)
      } catch (error) {
        logger.error('Failed to search hierarchy', error instanceof Error ? error : new Error(String(error)))
        setNodes([])
      } finally {
        setLoading(false)
      }
    }

    search()
  }, [filters])

  return { nodes, loading }
}

/**
 * Hook: CRUD operations
 */
export function useHierarchyMutations() {
  const user = useAuthStore((state: any) => state.user)

  const assertUniqueCodigo = async (codigoRaw: string, excludeId?: string) => {
    const codigo = codigoRaw.trim()
    if (!codigo) throw new Error('El código es obligatorio')

    const hierarchyRef = collection(db, 'hierarchy')
    const q = query(hierarchyRef, where('codigo', '==', codigo), where('activo', '==', true))
    const snap = await getDocs(q)

    // Si existe algún doc activo con el mismo código (que no sea el mismo id), bloquear.
    const collision = snap.docs.find(d => d.id !== excludeId)
    if (collision) {
      throw new Error(`Ya existe un nodo activo con el código ${codigo}`)
    }
  }

  const createNode = async (input: CreateHierarchyNodeInput): Promise<string> => {
    if (!user?.id) {
      const errorMsg = 'Usuario no autenticado o sin ID'
      throw new Error(errorMsg)
    }

    try {
      await assertUniqueCodigo(input.codigo)

      // Calcular path
      const path: string[] = []
      if (input.parentId) {
        const parentDoc = await getDoc(doc(db, 'hierarchy', input.parentId))
        if (parentDoc.exists()) {
          const parentData = parentDoc.data() as HierarchyNode
          path.push(...parentData.path, input.parentId)
        } else {
        }
      }

      // Obtener orden (siguiente disponible)
      const hierarchyRef = collection(db, 'hierarchy')
      const siblingsQuery = query(
        hierarchyRef,
        where('parentId', '==', input.parentId),
        orderBy('orden', 'desc')
      )
      const siblingsSnapshot = await getDocs(siblingsQuery)
      const lastOrder = siblingsSnapshot.empty
        ? 0
        : (siblingsSnapshot.docs[0]?.data().orden ?? 0)

      const newNode: any = {
        nombre: input.nombre,
        codigo: input.codigo,
        nivel: input.nivel,
        parentId: input.parentId,
        path,
        orden: lastOrder + 1,
        activo: true,
        creadoPor: user.id,
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      }
      
      // Solo agregar campos opcionales si tienen valor
      if (input.descripcion?.trim()) {
        newNode.descripcion = input.descripcion.trim()
      }
      if (input.metadata) {
        newNode.metadata = input.metadata
      }

      const docRef = await addDoc(collection(db, 'hierarchy'), newNode)
      
      // Invalidar caché
      invalidateHierarchyCaches()

      logger.info('Hierarchy node created', { id: docRef.id, nivel: input.nivel })
      return docRef.id
    } catch (error) {
      logger.error('Failed to create hierarchy node', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  const updateNode = async (id: string, input: UpdateHierarchyNodeInput): Promise<void> => {
    try {
      if (input.codigo !== undefined) {
        await assertUniqueCodigo(input.codigo, id)
      }

      const updateData: any = {
        actualizadoEn: Timestamp.now(),
      }
      
      // Solo agregar campos que tienen valor
      if (input.nombre !== undefined) updateData.nombre = input.nombre
      if (input.codigo !== undefined) updateData.codigo = input.codigo
      if (input.activo !== undefined) updateData.activo = input.activo
      
      // Campos opcionales - solo si tienen valor
      if (input.descripcion?.trim()) {
        updateData.descripcion = input.descripcion.trim()
      }
      if (input.metadata) {
        updateData.metadata = input.metadata
      }
      
      await updateDoc(doc(db, 'hierarchy', id), updateData)

      // Invalidar caché
      invalidateHierarchyCaches()

      logger.info('Hierarchy node updated', { id })
    } catch (error) {
      logger.error('Failed to create hierarchy node', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  const deleteNode = async (id: string, deleteChildren = false): Promise<void> => {
    try {
      if (deleteChildren) {
        // Eliminar nodo y todos sus descendientes (en lotes para evitar límite de 500 ops)
        const hierarchyRef = collection(db, 'hierarchy')
        const descendantsQuery = query(hierarchyRef, where('path', 'array-contains', id))
        const descendantsSnapshot = await getDocs(descendantsQuery)

        const refs = [doc(db, 'hierarchy', id), ...descendantsSnapshot.docs.map((d) => d.ref)]

        const chunkSize = 450
        for (let i = 0; i < refs.length; i += chunkSize) {
          const batch = writeBatch(db)
          const chunk = refs.slice(i, i + chunkSize)
          chunk.forEach((ref) => batch.delete(ref))
          await batch.commit()
        }

        logger.info('Hierarchy node and descendants deleted', {
          id,
          descendantsCount: descendantsSnapshot.size,
        })
      } else {
        // Solo eliminar el nodo (bloquear si tiene hijos para evitar huérfanos)
        const hierarchyRef = collection(db, 'hierarchy')
        const childrenQuery = query(hierarchyRef, where('parentId', '==', id), limit(1))
        const childrenSnap = await getDocs(childrenQuery)
        if (!childrenSnap.empty) {
          throw new Error('No se puede eliminar un nodo con hijos. Usa eliminación en cascada o elimina/desactiva primero los descendientes.')
        }

        await deleteDoc(doc(db, 'hierarchy', id))
        logger.info('Hierarchy node deleted', { id })
      }

      // Invalidar caché
      invalidateHierarchyCaches()
    } catch (error) {
      logger.error('Failed to delete hierarchy node', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  /**
   * Reordenar un nodo moviéndolo hacia arriba o abajo entre sus hermanos
   */
  const reorderNode = async (nodeId: string, direction: 'up' | 'down'): Promise<void> => {
    try {
      // Obtener el nodo actual
      const nodeRef = doc(db, 'hierarchy', nodeId)
      const nodeSnap = await getDoc(nodeRef)
      
      if (!nodeSnap.exists()) {
        throw new Error('Nodo no encontrado')
      }

      const currentNode = { id: nodeSnap.id, ...nodeSnap.data() } as HierarchyNode

      // Obtener hermanos (mismo parentId y nivel)
      const hierarchyRef = collection(db, 'hierarchy')
      const siblingsQuery = query(
        hierarchyRef,
        where('parentId', '==', currentNode.parentId),
        where('nivel', '==', currentNode.nivel),
        where('activo', '==', true),
        orderBy('orden', 'asc')
      )
      
      const siblingsSnapshot = await getDocs(siblingsQuery)
      const siblings = siblingsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as HierarchyNode))

      // Encontrar índice del nodo actual
      const currentIndex = siblings.findIndex(s => s.id === nodeId)
      
      if (currentIndex === -1) {
        throw new Error('Nodo no encontrado entre hermanos')
      }

      // Validar movimiento
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
      if (targetIndex < 0 || targetIndex >= siblings.length) {
        logger.info('Cannot move node: already at boundary', { nodeId, direction })
        return // No hacer nada si ya está en el límite
      }

      // Intercambiar orden con el hermano
      const batch = writeBatch(db)
      const targetNode = siblings[targetIndex]
      
      if (!targetNode) {
        logger.error('Target node not found', new Error(`Target node not found: ${nodeId} ${direction} ${targetIndex}`))
        return
      }

      batch.update(doc(db, 'hierarchy', currentNode.id), { orden: targetNode.orden })
      batch.update(doc(db, 'hierarchy', targetNode.id), { orden: currentNode.orden })

      await batch.commit()

      // Invalidar caché
      invalidateHierarchyCaches()

      logger.info('Node reordered', { nodeId, direction, newOrder: targetNode.orden })
    } catch (error) {
      logger.error('Failed to reorder node', error instanceof Error ? error : new Error(String(error)))
      throw error
    }
  }

  return { createNode, updateNode, deleteNode, reorderNode }
}

/**
 * Hook: obtener estadísticas por nivel
 */
export function useHierarchyStats() {
  const [stats, setStats] = useState<HierarchyStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const hierarchyRef = collection(db, 'hierarchy')
        const snapshot = await getDocs(hierarchyRef)
        
        const nodes: HierarchyNode[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as HierarchyNode))

        // Agrupar por nivel
        const levelGroups: Record<number, HierarchyNode[]> = {}
        nodes.forEach(node => {
          if (!levelGroups[node.nivel]) {
            levelGroups[node.nivel] = []
          }
          levelGroups[node.nivel]?.push(node)
        })

        // Calcular estadísticas
        const levelStats: HierarchyStats[] = Object.entries(levelGroups).map(
          ([nivel, nodes]) => ({
            nivel: Number(nivel) as HierarchyLevel,
            total: nodes.length,
            activos: nodes.filter(n => n.activo).length,
            inactivos: nodes.filter(n => !n.activo).length,
          })
        )

        setStats(levelStats.sort((a, b) => a.nivel - b.nivel))
      } catch (error) {
        logger.error('Failed to load hierarchy stats', error instanceof Error ? error : new Error(String(error)))
      } finally {
        setLoading(false)
      }
    }

    loadStats()
  }, [])

  return { stats, loading }
}

/**
 * Función auxiliar: construir árbol desde nodos planos
 */
function buildTree(nodes: HierarchyNode[]): HierarchyNodeWithChildren[] {
  const nodeMap = new Map<string, HierarchyNodeWithChildren>()
  const rootNodes: HierarchyNodeWithChildren[] = []

  // Crear mapa de nodos
  nodes.forEach(node => {
    nodeMap.set(node.id, { ...node, children: [] })
  })

  // Construir relaciones parent-child
  nodes.forEach(node => {
    const nodeWithChildren = nodeMap.get(node.id)!
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId)
      if (parent) {
        parent.children.push(nodeWithChildren)
      }
    } else {
      rootNodes.push(nodeWithChildren)
    }
  })

  return rootNodes
}

/**
 * Hook: obtener opciones de cascada para selector
 * Devuelve solo los hijos inmediatos de un nodo
 */
export function useHierarchyCascadeOptions(parentId: string | null, nivel: HierarchyLevel) {
  const { children, loading } = useHierarchyChildren(parentId, nivel)
  
  const options = useMemo(() => {
    const opts = children.map(node => ({
      value: node.id,
      label: node.nombre, // Solo el nombre, sin código
      nivel: node.nivel,
      hasChildren: node.nivel < 8,
    }))
    return opts
  }, [children])

  return { options, loading }
}
