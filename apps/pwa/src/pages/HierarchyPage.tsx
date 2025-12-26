/**
 * HierarchyPage - Gestión de jerarquías organizacionales
 * 
 * Permite a administradores crear, editar y eliminar nodos
 * de la estructura jerárquica de 8 niveles.
 */

import { useState, useEffect } from 'react'
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
} from 'lucide-react'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  const { createNode, updateNode, deleteNode } = useHierarchyMutations()

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedNode, setSelectedNode] = useState<HierarchyNode | null>(null)
  const [parentForNew, setParentForNew] = useState<HierarchyNodeWithChildren | null>(null)
  
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
    if (!confirm(`¿Eliminar "${node.nombre}"? Esta acción no se puede deshacer.`)) {
      return
    }

    try {
      await deleteNode(node.id)
      logger.info('Node deleted', { nodeId: node.id })
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
        creadoPor: user.id,
      }
      
      // Solo agregar descripcion si tiene valor
      if (formData.descripcion?.trim()) {
        nodeData.descripcion = formData.descripcion.trim()
      }
      
      await createNode(nodeData)

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

  const renderTree = (nodes: HierarchyNodeWithChildren[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedNodes.has(node.id)
      const hasChildren = node.children && node.children.length > 0
      const indent = depth * 24

      return (
        <div key={node.id} className="mb-1">
          <div
            className={cn(
              'flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors group',
              'border border-transparent hover:border-border'
            )}
            style={{ paddingLeft: `${indent + 8}px` }}
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
                <span className="font-medium truncate">{node.nombre}</span>
                <Badge variant="outline" className="text-xs">
                  {HIERARCHY_LEVEL_NAMES[node.nivel]}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                {node.codigo}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {node.nivel < 8 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCreate(node)}
                  className="h-8 w-8 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleEdit(node)}
                className="h-8 w-8 p-0"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              {node.nivel > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(node)}
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
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

      {/* Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Estructura Jerárquica
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner size="lg" />
              <span className="ml-3 text-muted-foreground">Cargando estructura...</span>
            </div>
          ) : tree.length === 0 ? (
            <div className="text-center py-12">
              <Folder className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                No hay jerarquías configuradas
              </p>
              <Button onClick={() => handleCreate(null)} className="mt-4">
                Crear primera empresa
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {renderTree(tree)}
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
