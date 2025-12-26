/**
 * Hooks para gestión del sistema jerárquico
 * Optimizados con caché y queries eficientes
 */

import { useState, useEffect, useMemo } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
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
  HIERARCHY_LEVEL_NAMES,
} from '@/types/hierarchy'

// Cache global para árbol completo (5 minutos TTL)
let treeCache: {
  data: HierarchyNodeWithChildren[]
  timestamp: number
} | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Hook principal: obtener árbol completo jerárquico
 * Optimizado con caché en memoria
 */
export function useHierarchyTree() {
  const [tree, setTree] = useState<HierarchyNodeWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const loadTree = async () => {
    try {
      setLoading(true)
      setError(null)

      // Verificar caché
      if (treeCache && Date.now() - treeCache.timestamp < CACHE_TTL) {
        logger.info('Using cached hierarchy tree')
        setTree(treeCache.data)
        setLoading(false)
        return
      }

      // Obtener todos los nodos ordenados por nivel y orden
      const hierarchyRef = collection(db, 'hierarchy')
      const q = query(
        hierarchyRef,
        where('activo', '==', true),
        orderBy('nivel', 'asc'),
        orderBy('orden', 'asc')
      )
      
      const snapshot = await getDocs(q)
      const nodes: HierarchyNode[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as HierarchyNode))

      // Construir árbol desde los nodos planos
      const treeData = buildTree(nodes)

      // Actualizar caché
      treeCache = {
        data: treeData,
        timestamp: Date.now(),
      }

      setTree(treeData)
      logger.info('Hierarchy tree loaded', { nodeCount: nodes.length })
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Error al cargar jerarquía')
      setError(error)
      logger.error('Failed to load hierarchy tree', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTree()
  }, [])

  const refresh = () => {
    treeCache = null // Invalidar caché
    loadTree()
  }

  return { tree, loading, error, refresh }
}

/**
 * Hook: obtener nodos hijos de un nivel específico
 */
export function useHierarchyChildren(parentId: string | null, nivel?: HierarchyLevel) {
  const [children, setChildren] = useState<HierarchyNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    console.log('[useHierarchyChildren] Cargando hijos:', { parentId, nivel })
    
    if (nivel !== undefined && nivel >= 8) {
      // Nivel 8 no tiene hijos
      console.log('[useHierarchyChildren] Nivel 8 alcanzado, sin hijos')
      setChildren([])
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
          constraints.unshift(where('nivel', '==', nivel + 1))
        }

        console.log('[useHierarchyChildren] Query constraints:', constraints.map(c => c.type))
        
        const q = query(hierarchyRef, ...constraints)
        const snapshot = await getDocs(q)
        
        console.log('[useHierarchyChildren] Documentos encontrados:', snapshot.size)
        
        const nodes: HierarchyNode[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as HierarchyNode))

        console.log('[useHierarchyChildren] Nodos procesados:', nodes.length)
        setChildren(nodes)
      } catch (error) {
        console.error('[useHierarchyChildren] Error:', error)
        logger.error('Failed to load hierarchy children', error)
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

    const loadPath = async () => {
      try {
        setLoading(true)
        
        // Obtener el nodo actual
        const nodeDoc = await getDoc(doc(db, 'hierarchy', nodeId))
        if (!nodeDoc.exists()) {
          setPath([])
          return
        }

        const node = { id: nodeDoc.id, ...nodeDoc.data() } as HierarchyNode

        // Construir path desde el array path del nodo
        const pathDocs = await Promise.all(
          node.path.map(id => getDoc(doc(db, 'hierarchy', id)))
        )

        const fullPath: HierarchyPath[] = pathDocs
          .filter(doc => doc.exists())
          .map(doc => {
            const data = doc.data() as HierarchyNode
            return {
              id: doc.id,
              nombre: data.nombre,
              codigo: data.codigo,
              nivel: data.nivel,
            }
          })

        // Agregar nodo actual al final
        fullPath.push({
          id: node.id,
          nombre: node.nombre,
          codigo: node.codigo,
          nivel: node.nivel,
        })

        setPath(fullPath)
      } catch (error) {
        logger.error('Failed to load hierarchy path', error)
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
        logger.error('Failed to search hierarchy', error)
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

  const createNode = async (input: CreateHierarchyNodeInput): Promise<string> => {
    console.log('[useHierarchy] createNode iniciado:', input)
    console.log('[useHierarchy] Usuario actual:', { uid: user?.uid, id: user?.id })
    
    if (!user?.id) {
      const errorMsg = 'Usuario no autenticado o sin ID'
      console.error('[useHierarchy] Error:', errorMsg, user)
      throw new Error(errorMsg)
    }

    try {
      // Calcular path
      const path: string[] = []
      if (input.parentId) {
        console.log('[useHierarchy] Obteniendo padre:', input.parentId)
        const parentDoc = await getDoc(doc(db, 'hierarchy', input.parentId))
        if (parentDoc.exists()) {
          const parentData = parentDoc.data() as HierarchyNode
          path.push(...parentData.path, input.parentId)
          console.log('[useHierarchy] Path calculado:', path)
        } else {
          console.error('[useHierarchy] Padre no encontrado:', input.parentId)
        }
      }

      // Obtener orden (siguiente disponible)
      console.log('[useHierarchy] Consultando hermanos para calcular orden...')
      const hierarchyRef = collection(db, 'hierarchy')
      const siblingsQuery = query(
        hierarchyRef,
        where('parentId', '==', input.parentId),
        orderBy('orden', 'desc')
      )
      const siblingsSnapshot = await getDocs(siblingsQuery)
      const lastOrder = siblingsSnapshot.empty
        ? 0
        : (siblingsSnapshot.docs[0].data().orden ?? 0)
      
      console.log('[useHierarchy] Hermanos encontrados:', siblingsSnapshot.size, 'Orden siguiente:', lastOrder + 1)

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

      console.log('[useHierarchy] Guardando nodo en Firestore:', newNode)
      const docRef = await addDoc(collection(db, 'hierarchy'), newNode)
      console.log('[useHierarchy] Nodo guardado con ID:', docRef.id)
      
      // Invalidar caché
      treeCache = null

      logger.info('Hierarchy node created', { id: docRef.id, nivel: input.nivel })
      console.log('[useHierarchy] Nodo creado exitosamente')
      return docRef.id
    } catch (error) {
      console.error('[useHierarchy] Error al crear nodo:', error)
      console.error('[useHierarchy] Detalles del error:', {
        name: (error as any).name,
        code: (error as any).code,
        message: (error as any).message,
        stack: (error as any).stack
      })
      logger.error('Failed to create hierarchy node', error)
      throw error
    }
  }

  const updateNode = async (id: string, input: UpdateHierarchyNodeInput): Promise<void> => {
    try {
      const updateData: any = {
        actualizadoEn: Timestamp.now(),
      }
      
      // Solo agregar campos que tienen valor
      if (input.nombre !== undefined) updateData.nombre = input.nombre
      if (input.codigo !== undefined) updateData.codigo = input.codigo
      if (input.orden !== undefined) updateData.orden = input.orden
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
      treeCache = null

      logger.info('Hierarchy node updated', { id })
    } catch (error) {
      logger.error('Failed to update hierarchy node', error)
      throw error
    }
  }

  const deleteNode = async (id: string, deleteChildren = false): Promise<void> => {
    try {
      if (deleteChildren) {
        // Eliminar nodo y todos sus descendientes
        const batch = writeBatch(db)
        
        // Obtener todos los descendientes
        const hierarchyRef = collection(db, 'hierarchy')
        const descendantsQuery = query(
          hierarchyRef,
          where('path', 'array-contains', id)
        )
        const descendantsSnapshot = await getDocs(descendantsQuery)

        // Agregar nodo actual y descendientes al batch
        batch.delete(doc(db, 'hierarchy', id))
        descendantsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref)
        })

        await batch.commit()
        logger.info('Hierarchy node and descendants deleted', {
          id,
          descendantsCount: descendantsSnapshot.size,
        })
      } else {
        // Solo eliminar el nodo (hijos quedan huérfanos - se podrían reasignar)
        await deleteDoc(doc(db, 'hierarchy', id))
        logger.info('Hierarchy node deleted', { id })
      }

      // Invalidar caché
      treeCache = null
    } catch (error) {
      logger.error('Failed to delete hierarchy node', error)
      throw error
    }
  }

  return { createNode, updateNode, deleteNode }
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
          levelGroups[node.nivel].push(node)
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
        logger.error('Failed to load hierarchy stats', error)
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
      label: `${node.codigo} - ${node.nombre}`,
      nivel: node.nivel,
      hasChildren: node.nivel < 8,
    }))
    console.log('[useHierarchyCascadeOptions] Opciones generadas:', {
      parentId,
      nivel,
      childrenCount: children.length,
      optionsCount: opts.length,
      options: opts
    })
    return opts
  }, [children, parentId, nivel])

  return { options, loading }
}
