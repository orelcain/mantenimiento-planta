/**
 * HierarchyPage - Gestión de jerarquías organizacionales
 * 
 * Permite a administradores crear, editar y eliminar nodos
 * de la estructura jerárquica de 8 niveles.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Plus,
  Edit2,
  Trash2,
  ChevronRight,
  ChevronDown,
  Building2,
  FolderOpen,
  Folder,
  Settings as SettingsIcon,
  CheckCircle,
  XCircle,
  ArrowUp,
  ArrowDown,
  Search,
  Package,
  ExternalLink,
  Share2,
  Image as ImageIcon,
  Sparkles,
  Clock,
} from 'lucide-react'
import { debounce } from '@/lib/rate-limit'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Textarea,
  Badge,
  Switch,
  Spinner,
  Checkbox,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { 
  HierarchyNodeWithChildren, 
  HierarchyLevel, 
  HIERARCHY_LEVEL_NAMES,
  HierarchyNode,
} from '@/types/hierarchy'
import { Equipment } from '@/types'
import { 
  useHierarchyTree, 
  useHierarchyMutations 
} from '@/hooks/useHierarchy'
import { getEquipments } from '@/services/equipment'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

interface NodeFormData {
  nombre: string
  codigo: string
  nivel: HierarchyLevel
  parentId: string | null
  descripcion: string
  orden: number
  activo: boolean
}

function findPathToNode(
  nodes: HierarchyNodeWithChildren[],
  targetId: string
): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return [node.id]
    if (node.children?.length) {
      const childPath = findPathToNode(node.children, targetId)
      if (childPath) return [node.id, ...childPath]
    }
  }
  return null
}

export function HierarchyPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore(state => state.user)
  const { tree, loading, refresh, hasUpdates } = useHierarchyTree({ includeInactive: true })
  const { createNode, updateNode, deleteNode, reorderNode } = useHierarchyMutations()

  // Vista local del árbol para reordenamiento optimista
  const [viewTree, setViewTree] = useState<HierarchyNodeWithChildren[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    // Restaurar estado de expansión desde localStorage
    const saved = localStorage.getItem('hierarchy_expanded_nodes')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return new Set(parsed)
      } catch {
        return new Set()
      }
    }
    return new Set()
  })
  const expandedNodesRef = useRef(expandedNodes)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null)
  const [parentForNew, setParentForNew] = useState<HierarchyNodeWithChildren | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)

  // Estados para equipos
  const [equipmentByNode, setEquipmentByNode] = useState<Map<string, Equipment[]>>(new Map())
  const [expandedEquipmentNodes, setExpandedEquipmentNodes] = useState<Set<string>>(() => {
    // Restaurar estado de expansión de equipos desde localStorage
    const saved = localStorage.getItem('hierarchy_expanded_equipment_nodes')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return new Set(parsed)
      } catch {
        return new Set()
      }
    }
    return new Set()
  })
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Set<string>>(new Set())
  const [showShareModal, setShowShareModal] = useState(false)

  // Persistir estado de expansión de equipos
  useEffect(() => {
    try { localStorage.setItem('hierarchy_expanded_equipment_nodes', JSON.stringify([...expandedEquipmentNodes])) } catch { /* storage full */ }
  }, [expandedEquipmentNodes])

  useEffect(() => {
    expandedNodesRef.current = expandedNodes
    try { localStorage.setItem('hierarchy_expanded_nodes', JSON.stringify([...expandedNodes])) } catch { /* storage full */ }
  }, [expandedNodes])

  // Cargar equipos cuando se monta el componente
  useEffect(() => {
    const loadEquipment = async () => {
      try {
        const equipment = await getEquipments()

        // Agrupar equipos por hierarchyNodeId
        const byNode = new Map<string, Equipment[]>()
        equipment.forEach(eq => {
          const nodeId = eq.hierarchyNodeId
          if (nodeId) {
            const existing = byNode.get(nodeId) || []
            byNode.set(nodeId, [...existing, eq])
          }
        })
        setEquipmentByNode(byNode)
      } catch (error) {
        logger.error('Failed to load equipment', error as Error)
      }
    }

    loadEquipment()
  }, [])

  const { qParam, focusParam } = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return {
      qParam: params.get('q') || '',
      focusParam: params.get('focus') || '',
    }
  }, [location.search])
  
  // Estado para preservar expansión en búsqueda
  const prevSearchRef = useRef('')
  const preSearchExpandedRef = useRef<Set<string>>(new Set())
  
  // Refs para scroll y foco visual
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const scrollToNode = useCallback((nodeId: string) => {
    const el = nodeRefs.current.get(nodeId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])
  
  // Ref para scroll automático al primer resultado
  const firstMatchRef = useRef<HTMLDivElement | null>(null)
  const [isFirstMatch, setIsFirstMatch] = useState(true)
  
  const [formData, setFormData] = useState<NodeFormData>({
    nombre: '',
    codigo: '',
    nivel: HierarchyLevel.AREA,
    parentId: null,
    descripcion: '',
    orden: 1,
    activo: true,
  })

  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Debounced search (300ms delay)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setDebouncedSearch(value)
    }, 300),
    []
  )

  const handleSearchChange = (value: string) => {
    setSearchQuery(value)
    debouncedSetSearch(value)
  }

  // Sincronizar la vista local con el árbol cargado desde servidor
  useEffect(() => {
    setViewTree(tree)
  }, [tree])

  // Permitir deep-link: /hierarchy?q=...&focus=...
  useEffect(() => {
    if (qParam) {
      setSearchQuery(qParam)
      setDebouncedSearch(qParam)
      setIsFirstMatch(true)
    }
  }, [qParam])

  useEffect(() => {
    if (!focusParam || viewTree.length === 0) return

    const path = findPathToNode(viewTree, focusParam)
    if (!path) return

    // Expandir ancestros del nodo para asegurar visibilidad
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      path.slice(0, -1).forEach((id) => next.add(id))
      return next
    })

    setActiveNodeId(focusParam)

    // Esperar render para tener refs
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToNode(focusParam)
      })
    })
  }, [focusParam, scrollToNode, viewTree])

  const toggleNode = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  // Expandir todos los nodos
  const expandAll = () => {
    const allIds = new Set<string>()
    const collectIds = (nodes: HierarchyNodeWithChildren[]) => {
      nodes.forEach(node => {
        allIds.add(node.id)
        if (node.children?.length > 0) {
          collectIds(node.children)
        }
      })
    }
    collectIds(viewTree)
    setExpandedNodes(allIds)
  }

  // Contraer todos los nodos
  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

  // Funciones para equipos
  const toggleEquipmentNode = (nodeId: string) => {
    const newExpanded = new Set(expandedEquipmentNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedEquipmentNodes(newExpanded)
  }

  const toggleEquipmentSelection = (equipmentId: string) => {
    const newSelected = new Set(selectedEquipmentIds)
    if (newSelected.has(equipmentId)) {
      newSelected.delete(equipmentId)
    } else {
      newSelected.add(equipmentId)
    }
    setSelectedEquipmentIds(newSelected)
  }

  const clearSelection = () => {
    setSelectedEquipmentIds(new Set())
  }

  const navigateToEquipment = (equipmentId: string) => {
    navigate(`/equipment?id=${equipmentId}`)
  }

  const handleCreate = (parent: HierarchyNodeWithChildren | null) => {
    setParentForNew(parent)
    const nextLevel = parent ? (parent.nivel + 1) as HierarchyLevel : HierarchyLevel.EMPRESA
    setFormData({
      nombre: '',
      codigo: '',
      nivel: nextLevel,
      parentId: parent?.id ?? null,
      descripcion: '',
      orden: 1,
      activo: true,
    })
    setSaveError(null)
    setShowCreateDialog(true)
  }

  const handleEdit = (node: HierarchyNode) => {
    setSelectedNode(node)
    setFormData({
      nombre: node.nombre,
      codigo: node.codigo,
      nivel: node.nivel,
      parentId: node.parentId,
      descripcion: node.descripcion || '',
      orden: node.orden,
      activo: node.activo ?? true,
    })
    setSaveError(null)
    setShowEditDialog(true)
  }

  const handleDelete = async (node: HierarchyNodeWithChildren) => {
    const isEmpresa = node.nivel === HierarchyLevel.EMPRESA
    const hasChildren = Boolean(node.children && node.children.length > 0)
    const willCascadeDelete = isEmpresa || hasChildren

    const confirmMessage = willCascadeDelete
      ? `⚠️ ADVERTENCIA: Vas a eliminar "${node.nombre}" y TODA su jerarquía descendiente.\n\n¿Estás seguro? Esta acción NO se puede deshacer.`
      : `¿Eliminar "${node.nombre}"? Esta acción no se puede deshacer.`
    
    if (!confirm(confirmMessage)) {
      return
    }

    // Doble confirmación para empresas
    if (isEmpresa) {
      const finalConfirm = confirm(`Última confirmación: ¿Realmente deseas eliminar la empresa "${node.nombre}" y toda su estructura?`)
      if (!finalConfirm) {
        return
      }
    }

    try {
      await deleteNode(node.id, willCascadeDelete)
      logger.info('Node deleted', { nodeId: node.id, nivel: node.nivel, isEmpresa, hasChildren, willCascadeDelete })
      refresh()
    } catch (error) {
      logger.error('Error deleting node', error instanceof Error ? error : new Error(String(error)))
      alert('Error al eliminar el nodo')
    }
  }

  const handleSubmitCreate = async () => {
    if (!user?.id) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const nodeData: any = {
        nombre: formData.nombre,
        codigo: formData.codigo,
        nivel: formData.nivel,
        parentId: formData.parentId,
        orden: formData.orden,
        activo: true,
      }
      
      // Solo agregar descripcion si tiene valor
      if (formData.descripcion?.trim()) {
        nodeData.descripcion = formData.descripcion.trim()
      }
      
      const newId = await createNode(nodeData)

      logger.info('Node created', { nodeId: newId, nombre: formData.nombre, nivel: formData.nivel })
      setShowCreateDialog(false)
      refresh()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
      logger.error('Error creating node', error instanceof Error ? error : new Error(String(error)))
      setSaveError(errorMsg)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmitEdit = async () => {
    if (!selectedNode) return

    setIsSaving(true)
    setSaveError(null)

    try {
      const updateData: any = {
        nombre: formData.nombre,
        codigo: formData.codigo,
        orden: formData.orden,
        activo: formData.activo,
      }
      
      // Solo agregar descripcion si tiene valor
      if (formData.descripcion?.trim()) {
        updateData.descripcion = formData.descripcion.trim()
      }
      
      await updateNode(selectedNode.id, updateData)

      logger.info('Node updated', { nodeId: selectedNode.id })
      setShowEditDialog(false)
      refresh()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
      logger.error('Error updating node', error instanceof Error ? error : new Error(String(error)))
      setSaveError(errorMsg)
    } finally {
      setIsSaving(false)
    }
  }

  const reorderInTree = (
    nodes: HierarchyNodeWithChildren[],
    targetId: string,
    direction: 'up' | 'down'
  ): { updated: boolean; next: HierarchyNodeWithChildren[] } => {
    const arr = [...nodes]
    for (let i = 0; i < arr.length; i++) {
      const node = arr[i]
      if (!node) continue
      // Encontrado en este nivel
      if (node.id === targetId) {
        if (direction === 'up' && i > 0) {
          const prev = arr[i - 1]
          if (!prev) return { updated: false, next: nodes }
          arr[i - 1] = node
          arr[i] = prev
          return { updated: true, next: arr }
        }
        if (direction === 'down' && i < arr.length - 1) {
          const nextNode = arr[i + 1]
          if (!nextNode) return { updated: false, next: nodes }
          arr[i + 1] = node
          arr[i] = nextNode
          return { updated: true, next: arr }
        }
        return { updated: false, next: nodes }
      }
      // Buscar en hijos
      if (node.children?.length) {
        const childResult = reorderInTree(node.children, targetId, direction)
        if (childResult.updated) {
          arr[i] = { ...node, children: childResult.next }
          return { updated: true, next: arr }
        }
      }
    }
    return { updated: false, next: nodes }
  }

  const handleReorder = async (nodeId: string, direction: 'up' | 'down') => {
    const prevTree = viewTree
    const { updated, next } = reorderInTree(viewTree, nodeId, direction)
    if (!updated) return

    // Optimista: actualizar vista y foco
    setViewTree(next)
    setActiveNodeId(nodeId)
    scrollToNode(nodeId)

    try {
      await reorderNode(nodeId, direction)
      refresh() // Mantener coherencia con servidor
    } catch (error) {
      logger.error('Error reordering node', error instanceof Error ? error : new Error(String(error)))
      alert('Error al reordenar el nodo')
      setViewTree(prevTree) // Revertir si falla
    }
  }

  // Filtrar y expandir automáticamente los nodos que coinciden con la búsqueda
  const filterAndExpandTree = (
    nodes: HierarchyNodeWithChildren[], 
    query: string
  ): { filtered: HierarchyNodeWithChildren[], toExpand: Set<string> } => {
    const toExpand = new Set<string>()

    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)

    const nodeMatchesQuery = (node: HierarchyNodeWithChildren): boolean => {
      if (tokens.length === 0) return true
      const name = node.nombre.toLowerCase()
      const code = node.codigo.toLowerCase()
      return tokens.every((t) => name.includes(t) || code.includes(t))
    }

    const filterRecursive = (nodes: HierarchyNodeWithChildren[]): HierarchyNodeWithChildren[] => {
      return nodes.filter(node => {
        const matches = nodeMatchesQuery(node)

        let filteredChildren: HierarchyNodeWithChildren[] = []
        if (node.children && node.children.length > 0) {
          filteredChildren = filterRecursive(node.children)
        }

        const hasMatchingChildren = filteredChildren.length > 0

        // Si este nodo o algún hijo coincide, expandir y mantener
        if (matches || hasMatchingChildren) {
          if (hasMatchingChildren) {
            toExpand.add(node.id) // Expandir nodo padre de coincidencias
          }
          return {
            ...node,
            children: filteredChildren
          }
        }

        return null
      }).filter(Boolean) as HierarchyNodeWithChildren[]
    }

    const filtered = query ? filterRecursive(nodes) : nodes
    return { filtered, toExpand }
  }

  // Contar coincidencias reales (sin contar padres agregados por contexto)
  const countMatches = (nodes: HierarchyNodeWithChildren[], query: string): number => {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)

    if (tokens.length === 0) return 0

    const matches = (node: HierarchyNodeWithChildren): boolean => {
      const name = node.nombre.toLowerCase()
      const code = node.codigo.toLowerCase()
      return tokens.every((t) => name.includes(t) || code.includes(t))
    }

    let count = 0
    const traverse = (arr: HierarchyNodeWithChildren[]) => {
      arr.forEach((node) => {
        if (matches(node)) count++
        if (node.children && node.children.length > 0) {
          traverse(node.children)
        }
      })
    }

    traverse(nodes)
    return count
  }

  // Aplicar filtro y auto-expandir
  const { filtered: filteredTree, toExpand, matchCount } = useMemo(() => {
    if (!debouncedSearch.trim()) {
      return { filtered: viewTree, toExpand: new Set<string>(), matchCount: 0 }
    }
    const result = filterAndExpandTree(viewTree, debouncedSearch)
    return { ...result, matchCount: countMatches(result.filtered, debouncedSearch) }
  }, [viewTree, debouncedSearch])

  // Manejo robusto de expansión en búsquedas sin colapsar el árbol
  useEffect(() => {
    const prevSearch = prevSearchRef.current
    const hasSearch = !!debouncedSearch.trim()

    // Entrada a modo búsqueda: guardar expansión actual y expandir coincidencias
    if (!prevSearch && hasSearch) {
      preSearchExpandedRef.current = new Set(expandedNodesRef.current)
      if (toExpand.size > 0) {
        setExpandedNodes(toExpand)
        setIsFirstMatch(true)
      }
    }

    // Cambio dentro de búsqueda: actualizar expansión con coincidencias
    if (hasSearch && toExpand.size > 0) {
      setExpandedNodes(toExpand)
      setIsFirstMatch(true)
    }

    // Salida de búsqueda: restaurar expansión previa (sin colapsar)
    if (prevSearch && !hasSearch) {
      setExpandedNodes(preSearchExpandedRef.current)
      setIsFirstMatch(true)
    }

    prevSearchRef.current = debouncedSearch
  }, [debouncedSearch, toExpand])

  // Scroll automático al primer resultado
  useEffect(() => {
    if (debouncedSearch && firstMatchRef.current && isFirstMatch) {
      firstMatchRef.current.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      })
      setIsFirstMatch(false)
    }
  }, [debouncedSearch, isFirstMatch])

  // Función para resaltar texto coincidente
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text
    
    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const index = lowerText.indexOf(lowerQuery)
    
    if (index === -1) return text
    
    const before = text.substring(0, index)
    const match = text.substring(index, index + query.length)
    const after = text.substring(index + query.length)
    
    return (
      <>
        {before}
        <span className="bg-yellow-200 text-yellow-900 font-semibold px-0.5 rounded">
          {match}
        </span>
        {after}
      </>
    )
  }

  const renderTree = (nodes: HierarchyNodeWithChildren[], depth = 0) => {
    let isFirstRendered = isFirstMatch // Track si es el primer match renderizado


  // Verificar permisos de admin (debe estar después de todos los hooks)
  if (user?.rol !== 'admin') {
    return (
      <div className="flex items-center justify-center h-96">
        <Card className="p-8 text-center">
          <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
          <h2 className="text-xl font-bold">Acceso Denegado</h2>
          <p className="text-muted-foreground mt-2">
            Solo los administradores pueden gestionar jerarquías.
          </p>
        </Card>
      </div>
    )
  }
    const searchTokens = debouncedSearch
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean)

    const highlightQuery = searchTokens[0] || debouncedSearch
    
    return nodes.map(node => {
      const isExpanded = expandedNodes.has(node.id)
      const hasChildren = node.children && node.children.length > 0
      const childCount = node.children?.length ?? 0
      const indent = depth * 24
      
      // Detectar si este nodo es un match
      const isMatch = searchTokens.length > 0 && searchTokens.every((t) => {
        const name = node.nombre.toLowerCase()
        const code = node.codigo.toLowerCase()
        return name.includes(t) || code.includes(t)
      })
      
      // Asignar ref al primer match
      const assignRef = isMatch && isFirstRendered
      if (assignRef) {
        isFirstRendered = false
      }

      const isActive = activeNodeId === node.id

      return (
        <div
          key={node.id}
          className="mb-1"
          ref={el => {
            if (assignRef && firstMatchRef) {
              firstMatchRef.current = el
            }
            if (el) {
              nodeRefs.current.set(node.id, el)
            } else {
              nodeRefs.current.delete(node.id)
            }
          }}
        >
          <div
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg transition-colors group',
              'border',
              isActive
                ? 'border-emerald-500/30 bg-emerald-500/10 dark:border-emerald-400/20 dark:bg-emerald-400/5'
                : 'border-transparent hover:border-border hover:bg-muted',
              !node.activo && 'opacity-60'
            )}
            style={{ paddingLeft: `${indent + 8}px` }}
            onClick={() => setActiveNodeId(node.id)}
          >
            {/* Toggle expand */}
            {hasChildren ? (
              <button
                onClick={() => toggleNode(node.id)}
                className="p-1 hover:bg-muted-foreground/10 rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <div className="w-6" />
            )}

            {/* Icon */}
            {node.nivel === 1 ? (
              <Building2 className="h-4 w-4 text-blue-500" />
            ) : hasChildren ? (
              <FolderOpen className="h-4 w-4 text-amber-500" />
            ) : (
              <Folder className="h-4 w-4 text-gray-400" />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">
                  {highlightText(node.nombre, highlightQuery)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {HIERARCHY_LEVEL_NAMES[node.nivel]}
                </Badge>
                {childCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    Hijos: {childCount}
                  </Badge>
                )}
                {!node.activo && (
                  <Badge variant="secondary" className="text-xs">
                    Inactivo
                  </Badge>
                )}
                {/* Badge de equipos */}
                {equipmentByNode.get(node.id) && equipmentByNode.get(node.id)!.length > 0 && (
                  <Badge variant="default" className="text-xs flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {equipmentByNode.get(node.id)!.length}
                  </Badge>
                )}
                {/* Badge estructura base vs expansión */}
                {node.isBaseStructure ? (
                  <Badge 
                    variant="outline" 
                    className="text-xs flex items-center gap-1 border-blue-300 text-blue-700 bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={`Estructura base - ${node.baseStructureDate ? new Date(node.baseStructureDate.toDate()).toLocaleDateString() : 'Fecha no disponible'}`}
                  >
                    <Clock className="h-2.5 w-2.5" />
                    Base
                  </Badge>
                ) : node.creadoEn && (
                  <Badge 
                    variant="default" 
                    className="text-xs flex items-center gap-1 bg-green-500 hover:bg-green-600"
                    title={`Expansión agregada - ${new Date(node.creadoEn.toDate()).toLocaleDateString()}`}
                  >
                    <Sparkles className="h-2.5 w-2.5" />
                    Nuevo
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {highlightText(node.codigo, highlightQuery)}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Botones de ordenamiento */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReorder(node.id, 'up')}
                className="h-8 w-8 p-0"
                title="Mover arriba"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleReorder(node.id, 'down')}
                className="h-8 w-8 p-0"
                title="Mover abajo"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              {node.nivel < 8 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCreate(node)}
                  className="h-8 w-8 p-0"
                  title="Agregar hijo"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(node)}
                className="h-8 w-8 p-0"
                title="Editar"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              {/* Permitir eliminar cualquier nivel, incluyendo empresas (nivel 1) */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(node)}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Equipment list */}
          {equipmentByNode.get(node.id) && equipmentByNode.get(node.id)!.length > 0 && (
            <div style={{ paddingLeft: `${indent + 32}px` }} className="mt-1">
              <button
                onClick={() => toggleEquipmentNode(node.id)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted"
              >
                {expandedEquipmentNodes.has(node.id) ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <Package className="h-3 w-3" />
                <span>{equipmentByNode.get(node.id)!.length} equipos</span>
              </button>

              {expandedEquipmentNodes.has(node.id) && (
                <div className="mt-1 space-y-1">
                  {equipmentByNode.get(node.id)!.map((eq) => (
                    <div
                      key={eq.id}
                      className="flex items-center gap-2 p-2 rounded border border-border hover:border-primary/50 bg-background/50"
                    >
                      <Checkbox
                        checked={selectedEquipmentIds.has(eq.id)}
                        onCheckedChange={() => toggleEquipmentSelection(eq.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{eq.nombre}</div>
                        <div className="text-xs text-muted-foreground font-mono">{eq.codigo}</div>
                      </div>
                      {eq.photos && eq.photos.length > 0 && (
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          <ImageIcon className="h-2.5 w-2.5" />
                          {eq.photos.length}
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigateToEquipment(eq.id)}
                        className="h-7 px-2 text-xs"
                        title="Ver en módulo equipos"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Children */}
          {isExpanded && hasChildren && (
            <div className="mt-1">
              {renderTree(node.children!, depth + 1)}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="space-y-6">
      {/* Banner de actualizaciones disponibles */}
      {hasUpdates && (
        <div className="bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">
              Hay actualizaciones disponibles en la jerarquía
            </span>
          </div>
          <Button onClick={() => refresh()} variant="default" size="sm" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Actualizar ahora
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Jerarquías</h1>
          <p className="text-muted-foreground">
            Administra la estructura organizacional de 8 niveles
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refresh()} variant="outline" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            Sincronizar
          </Button>
          <Button onClick={() => handleCreate(null)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nueva Empresa
          </Button>
        </div>
      </div>

      {/* Buscador */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o código..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 pr-10"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setDebouncedSearch('')
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title="Limpiar búsqueda"
                >
                  <XCircle className="h-4 w-4" />
                </button>
              )}
            </div>
            {debouncedSearch && matchCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {matchCount} {matchCount === 1 ? 'resultado encontrado' : 'resultados encontrados'}
              </p>
            )}
            {debouncedSearch && matchCount === 0 && (
              <p className="text-xs text-orange-600">
                No se encontraron resultados para "{debouncedSearch}"
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tree */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              Estructura Jerárquica
            </CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAll}
                className="gap-2"
                title="Expandir todos los nodos"
              >
                <ChevronDown className="h-4 w-4" />
                Expandir Todo
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAll}
                className="gap-2"
                title="Contraer todos los nodos"
              >
                <ChevronRight className="h-4 w-4" />
                Contraer Todo
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
              <span className="ml-3 text-muted-foreground">Cargando estructura...</span>
            </div>
          ) : filteredTree.length === 0 ? (
            <div className="text-center py-12">
              <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchQuery ? 'No se encontraron resultados' : 'No hay nodos creados. Comienza creando una empresa.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {renderTree(filteredTree)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Crear {HIERARCHY_LEVEL_NAMES[formData.nivel]}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {parentForNew && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <span className="text-muted-foreground">Padre:</span>
                <span className="font-medium ml-2">{parentForNew.nombre}</span>
              </div>
            )}

            <div>
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Área de Producción"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="codigo">Código *</Label>
              <Input
                id="codigo"
                value={formData.codigo}
                onChange={e => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                placeholder="Ej: PROD-001"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Formato recomendado: XXX-NNN
              </p>
            </div>

            <div>
              <Label htmlFor="descripcion">Descripción (opcional)</Label>
              <Textarea
                id="descripcion"
                value={formData.descripcion}
                onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Detalles adicionales..."
                rows={3}
                className="mt-1"
              />
            </div>

            {saveError && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                {saveError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitCreate}
              disabled={isSaving || !formData.nombre || !formData.codigo}
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" />
                  <span className="ml-2">Creando...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Crear
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Editar {selectedNode && HIERARCHY_LEVEL_NAMES[selectedNode.nivel]}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-nombre">Nombre *</Label>
              <Input
                id="edit-nombre"
                value={formData.nombre}
                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="edit-codigo">Código *</Label>
              <Input
                id="edit-codigo"
                value={formData.codigo}
                onChange={e => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                className="mt-1"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
              <div>
                <p className="text-sm font-medium">Activo</p>
                <p className="text-xs text-muted-foreground">
                  Si lo desactivas, deja de aparecer en selectores.
                </p>
              </div>
              <Switch
                checked={formData.activo}
                onCheckedChange={(checked) => setFormData({ ...formData, activo: checked })}
              />
            </div>

            <div>
              <Label htmlFor="edit-descripcion">Descripción</Label>
              <Textarea
                id="edit-descripcion"
                value={formData.descripcion}
                onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                rows={3}
                className="mt-1"
              />
            </div>

            {saveError && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                {saveError}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitEdit}
              disabled={isSaving || !formData.nombre || !formData.codigo}
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" />
                  <span className="ml-2">Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating action bar for selected equipment */}
      {selectedEquipmentIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
          <Card className="shadow-lg border-2 border-primary">
            <CardContent className="p-4 flex items-center gap-4">
              <div className="text-sm font-medium">
                {selectedEquipmentIds.size} {selectedEquipmentIds.size === 1 ? 'equipo seleccionado' : 'equipos seleccionados'}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearSelection}
                >
                  Limpiar
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowShareModal(true)}
                  className="gap-2"
                >
                  <Share2 className="h-4 w-4" />
                  Compartir
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Share modal placeholder - will reuse EquipmentPage share logic */}
      {showShareModal && (
        <Dialog open onOpenChange={(open) => !open && setShowShareModal(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Compartir equipos desde jerarquía</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <p className="text-sm text-muted-foreground mb-4">
                Se compartirán {selectedEquipmentIds.size} equipos seleccionados
              </p>
              <p className="text-xs text-muted-foreground">
                Esta funcionalidad reutilizará la lógica de compartir del módulo de equipos.
                Por ahora, puedes navegar al módulo de equipos para compartir.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowShareModal(false)}>
                Cerrar
              </Button>
              <Button
                onClick={() => {
                  const ids = Array.from(selectedEquipmentIds).join(',')
                  navigate(`/equipment?selected=${ids}`)
                }}
              >
                Ir a Equipos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
