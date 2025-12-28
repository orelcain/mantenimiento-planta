/**
 * HierarchyPage - Gestión de jerarquías organizacionales
 * 
 * Permite a administradores crear, editar y eliminar nodos
 * de la estructura jerárquica de 8 niveles.
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
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
} from 'lucide-react'
import { debounce } from 'lodash'
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
  Spinner,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { 
  HierarchyNodeWithChildren, 
  HierarchyLevel, 
  HIERARCHY_LEVEL_NAMES,
  HierarchyNode,
} from '@/types/hierarchy'
import { 
  useHierarchyTree, 
  useHierarchyMutations 
} from '@/hooks/useHierarchy'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

interface NodeFormData {
  nombre: string
  codigo: string
  nivel: HierarchyLevel
  parentId: string | null
  descripcion: string
  orden: number
}

export function HierarchyPage() {
  const user = useAuthStore(state => state.user)
  const { tree, loading, refresh } = useHierarchyTree()
  const { createNode, updateNode, deleteNode, reorderNode } = useHierarchyMutations()

  // Vista local del árbol para reordenamiento optimista
  const [viewTree, setViewTree] = useState<HierarchyNodeWithChildren[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null)
  const [parentForNew, setParentForNew] = useState<HierarchyNodeWithChildren | null>(null)
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null)
  
  // Estado para preservar expansión en búsqueda
  const prevSearchRef = useRef('')
  const preSearchExpandedRef = useRef<Set<string>>(new Set())
  
  // Refs para scroll y foco visual
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  
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

  // Verificar permisos de admin
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
    })
    setSaveError(null)
    setShowEditDialog(true)
  }

  const handleDelete = async (node: HierarchyNode) => {
    // Confirmación especial para empresas (nivel 1)
    const isEmpresa = node.nivel === HierarchyLevel.EMPRESA
    const confirmMessage = isEmpresa
      ? `⚠️ ADVERTENCIA: Vas a eliminar la empresa "${node.nombre}" y TODA su jerarquía (áreas, sistemas, equipos, etc.).\n\n¿Estás absolutamente seguro? Esta acción NO se puede deshacer.`
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
      await deleteNode(node.id)
      logger.info('Node deleted', { nodeId: node.id, nivel: node.nivel, isEmpresa })
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
      console.log('[HierarchyPage] Creando nodo:', {
        nombre: formData.nombre,
        codigo: formData.codigo,
        nivel: formData.nivel,
        parentId: formData.parentId,
        userId: user.id
      })
      
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
      console.log('[HierarchyPage] Nodo creado exitosamente:', newId)

      logger.info('Node created', { nombre: formData.nombre, nivel: formData.nivel })
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
        activo: true,
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
      // Encontrado en este nivel
      if (node.id === targetId) {
        if (direction === 'up' && i > 0) {
          ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
          return { updated: true, next: arr }
        }
        if (direction === 'down' && i < arr.length - 1) {
          ;[arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]
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

  const scrollToNode = (nodeId: string) => {
    const el = nodeRefs.current.get(nodeId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
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
    const lowerQuery = query.toLowerCase()

    const filterRecursive = (nodes: HierarchyNodeWithChildren[]): HierarchyNodeWithChildren[] => {
      return nodes.filter(node => {
        const matchesName = node.nombre.toLowerCase().includes(lowerQuery)
        const matchesCode = node.codigo.toLowerCase().includes(lowerQuery)
        const matches = matchesName || matchesCode

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

  // Contar nodos que coinciden (definido ANTES de useMemo)
  const countMatches = (nodes: HierarchyNodeWithChildren[]): number => {
    let count = 0
    const traverse = (nodes: HierarchyNodeWithChildren[]) => {
      nodes.forEach(node => {
        count++
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
    return { ...result, matchCount: countMatches(result.filtered) }
  }, [viewTree, debouncedSearch])

  // Manejo robusto de expansión en búsquedas sin colapsar el árbol
  useEffect(() => {
    const prevSearch = prevSearchRef.current
    const hasSearch = !!debouncedSearch.trim()

    // Entrada a modo búsqueda: guardar expansión actual y expandir coincidencias
    if (!prevSearch && hasSearch) {
      preSearchExpandedRef.current = new Set(expandedNodes)
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
    
    return nodes.map(node => {
      const isExpanded = expandedNodes.has(node.id)
      const hasChildren = node.children && node.children.length > 0
      const indent = depth * 24
      
      // Detectar si este nodo es un match
      const isMatch = debouncedSearch && (
        node.nombre.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        node.codigo.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
      
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
              // Mantener scroll al primer match
              // eslint-disable-next-line @typescript-eslint/no-unused-expressions
              assignRef && (firstMatchRef.current = el)
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
                ? 'border-emerald-400/70 bg-emerald-50 ring-2 ring-emerald-400/50'
                : 'border-transparent hover:border-border hover:bg-muted'
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
                  {highlightText(node.nombre, debouncedSearch)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {HIERARCHY_LEVEL_NAMES[node.nivel]}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {highlightText(node.codigo, debouncedSearch)}
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestión de Jerarquías</h1>
          <p className="text-muted-foreground">
            Administra la estructura organizacional de 8 niveles
          </p>
        </div>
        <Button onClick={() => handleCreate(null)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva Empresa
        </Button>
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
    </div>
  )
}
