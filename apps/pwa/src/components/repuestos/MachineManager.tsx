/**
 * MachineManager — Gestión de máquinas
 *
 * Mejoras v2:
 * - Vista agrupada por área de proceso (árbol)
 * - Quick-assign: clic en el badge de área → árbol compacto → guarda sin diálogo
 * - Drag & drop entre áreas preparado
 */

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import {
  Plus, Pencil, Trash2, Archive, ArchiveRestore,
  ChevronRight, MapPin, X, Check, Search,
} from 'lucide-react'
import { doc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useMachines } from '@/hooks/repuestos/useMachines'
import { useHierarchyTree } from '@/hooks/useHierarchy'
import { useToast } from '@/hooks/useToast'
import type { Machine } from '@/types/repuestos'
import type { HierarchyNodeWithChildren } from '@/types/hierarchy'
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui'

/* ── helpers ────────────────────────────────────────────────── */
const KNOWN_NODE_NAMES: Record<string, string> = {
  'AQ-IN-CHO-PCHO-PROC-EVIS': 'Eviscerado',
  'AQ-IN-CHO-PCHO-PROC-FILE': 'Filete',
  'AQ-IN-CHO-PCHO-PROC-EMPA': 'Emparrillado',
  'AQ-IN-CHO-PCHO-PROC-EMPQ': 'Empaque',
}

function flattenTree(
  nodes: HierarchyNodeWithChildren[],
  depth = 0,
): { id: string; nombre: string; depth: number }[] {
  const result: { id: string; nombre: string; depth: number }[] = []
  for (const n of nodes) {
    result.push({ id: n.id, nombre: n.nombre, depth })
    if (n.children?.length) result.push(...flattenTree(n.children, depth + 1))
  }
  return result
}

function getNodeName(
  nodeId: string | undefined,
  hierarchyOptions: { id: string; nombre: string }[],
): string {
  if (!nodeId) return 'Sin área'
  return (
    hierarchyOptions.find(n => n.id === nodeId)?.nombre ||
    KNOWN_NODE_NAMES[nodeId] ||
    KNOWN_NODE_NAMES[nodeId.toUpperCase()] ||
    'Sin área'
  )
}

/** Devuelve null si el nodeId no resuelve a un nombre conocido (para agrupar como sin área) */
function resolveNodeKey(
  nodeId: string | undefined | null,
  hierarchyOptions: { id: string; nombre: string }[],
): string | null {
  if (!nodeId) return null
  const found =
    hierarchyOptions.find(n => n.id === nodeId) ||
    KNOWN_NODE_NAMES[nodeId] ||
    KNOWN_NODE_NAMES[nodeId.toUpperCase()]
  return found ? nodeId : null
}

/* ── AreaTreePicker ─────────────────────────────────────────────
   Dropdown compacto con árbol para seleccionar área rápido.
   Se cierra al hacer clic fuera o al seleccionar.
   ──────────────────────────────────────────────────────────── */
/** Comprueba si un nodo o algún descendiente coincide con el query */
function nodeMatchesQuery(node: HierarchyNodeWithChildren, q: string): boolean {
  if (!q) return true
  if (node.nombre.toLowerCase().includes(q)) return true
  return (node.children ?? []).some(c => nodeMatchesQuery(c, q))
}

function AreaTreeNode({
  node, depth, currentId, onSelect, searchQ,
}: {
  node: HierarchyNodeWithChildren
  depth: number
  currentId: string | undefined
  onSelect: (id: string, nombre: string) => void
  searchQ: string
}) {
  const hasChildren = (node.children?.length ?? 0) > 0
  const selfMatch = !searchQ || node.nombre.toLowerCase().includes(searchQ)
  const childMatch = hasChildren && (node.children ?? []).some(c => nodeMatchesQuery(c, searchQ))
  // Auto-expandir cuando hay búsqueda activa y hay coincidencias en hijos
  const [manualOpen, setManualOpen] = useState(depth < 2)
  const isOpen = searchQ ? (selfMatch || childMatch) : manualOpen
  const isSelected = node.id === currentId
  if (searchQ && !selfMatch && !childMatch) return null

  return (
    <div>
      <button
        onClick={() => {
          if (hasChildren) setManualOpen(v => !v)
          onSelect(node.id, node.nombre)
        }}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={[
          'w-full flex items-center gap-1.5 py-1.5 pr-2 text-left text-[11px] rounded transition-colors',
          isSelected
            ? 'bg-primary/15 text-primary font-semibold'
            : 'hover:bg-muted/60 text-foreground/80',
        ].join(' ')}
      >
        {hasChildren ? (
          <ChevronRight className={`h-3 w-3 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50 shrink-0 ml-0.5" />
        )}
        {/* Resaltar coincidencia */}
        {selfMatch && searchQ ? (
          <span className="flex-1 truncate">
            {node.nombre.split(new RegExp(`(${searchQ})`, 'i')).map((part, i) =>
              part.toLowerCase() === searchQ
                ? <mark key={i} className="bg-primary/20 text-primary rounded-sm px-0.5 not-italic">{part}</mark>
                : part
            )}
          </span>
        ) : (
          <span className="flex-1 truncate">{node.nombre}</span>
        )}
        {isSelected && <Check className="h-3 w-3 shrink-0 text-primary" />}
      </button>
      {hasChildren && isOpen && (
        <div>
          {node.children!.map(child => (
            <AreaTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              currentId={currentId}
              onSelect={onSelect}
              searchQ={searchQ}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AreaTreePicker({
  tree, currentId, anchorRef, onSelect, onClose,
}: {
  tree: HierarchyNodeWithChildren[]
  currentId: string | undefined
  anchorRef: React.RefObject<HTMLButtonElement>
  onSelect: (id: string | null, nombre: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [pickerSearch, setPickerSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchQ = pickerSearch.toLowerCase().trim()

  // Calcular posición fija — panel más alto para incluir buscador
  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const r   = anchorRef.current.getBoundingClientRect()
    const vh  = window.innerHeight
    const panelH = 340
    const spaceBelow = vh - r.bottom
    const top = spaceBelow >= panelH
      ? r.bottom + 4
      : Math.max(8, r.top - panelH - 4)
    setPos({ top, left: Math.max(8, r.right - 272) })
  }, [anchorRef])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, anchorRef])

  // Enfocar buscador al abrir
  useEffect(() => {
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const rootNodes = tree.length === 1 ? (tree[0]!.children ?? tree) : tree

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-68 rounded-lg border border-border bg-card shadow-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
          Cambiar área
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Buscador */}
      <div className="px-2 py-1.5 border-b border-border/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          <input
            ref={searchInputRef}
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            placeholder="Buscar área…"
            className="w-full h-6 pl-6 pr-6 text-[11px] bg-muted/40 rounded border-0 outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/50"
          />
          {pickerSearch && (
            <button onClick={() => setPickerSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto p-1">
        {/* Sin área — ocultar si hay búsqueda activa */}
        {!searchQ && (
          <>
            <button
              onClick={() => onSelect(null, 'Sin área')}
              className={[
                'w-full flex items-center gap-2 px-2 py-1.5 text-[11px] rounded transition-colors',
                !currentId
                  ? 'bg-amber-500/15 text-amber-600 font-semibold'
                  : 'hover:bg-muted/60 text-muted-foreground',
              ].join(' ')}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              Sin área asignada
              {!currentId && <Check className="h-3 w-3 ml-auto shrink-0" />}
            </button>
            <div className="my-1 border-t border-border/50" />
          </>
        )}

        {rootNodes.map(node => (
          <AreaTreeNode
            key={node.id}
            node={node}
            depth={0}
            currentId={currentId}
            onSelect={(id, nombre) => onSelect(id, nombre)}
            searchQ={searchQ}
          />
        ))}

        {searchQ && rootNodes.every(n => !nodeMatchesQuery(n, searchQ)) && (
          <p className="text-center text-[10px] text-muted-foreground py-4">Sin resultados</p>
        )}
      </div>
    </div>
  )
}

/* ── MachineRow — fila compacta de una línea ──────────────────── */
function MachineRow({
  machine, tree, hierarchyOptions, onEdit, onToggleActive, onDelete,
}: {
  machine: Machine
  tree: HierarchyNodeWithChildren[]
  hierarchyOptions: { id: string; nombre: string; depth: number }[]
  onEdit: (m: Machine) => void
  onToggleActive: (m: Machine) => void
  onDelete: (m: Machine) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const { toast } = useToast()

  const areaName = getNodeName(machine.hierarchyNodeId, hierarchyOptions)
  const hasArea  = !!machine.hierarchyNodeId

  const handleQuickAssign = useCallback(async (nodeId: string | null, nodeName: string) => {
    setPickerOpen(false)
    if (nodeId === (machine.hierarchyNodeId ?? null)) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'machines', machine.id), {
        hierarchyNodeId: nodeId ?? null,
        updatedAt: Timestamp.now(),
      })
      toast({ title: 'Área actualizada', description: `${machine.nombre} → ${nodeName}` })
    } catch {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [machine, toast])

  return (
    <div className={[
      'group flex items-center gap-2 px-2 h-8 rounded transition-colors',
      'hover:bg-muted/40',
      !machine.activa ? 'opacity-40' : '',
    ].join(' ')}>

      {/* Dot color */}
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: machine.color || '#94a3b8' }} />

      {/* Nombre */}
      <span className={`flex-1 min-w-0 text-[12px] truncate ${!machine.activa ? 'line-through text-muted-foreground' : 'text-foreground/90'}`}>
        {machine.nombre}
      </span>

      {/* Badge área — visible siempre, acciones solo en hover */}
      <div className="relative shrink-0 flex items-center gap-1">

        {/* Acciones — ocultas hasta hover */}
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button onClick={() => onEdit(machine)} title="Editar"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={() => onToggleActive(machine)} title={machine.activa ? 'Archivar' : 'Reactivar'}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
            {machine.activa ? <Archive className="h-3 w-3" /> : <ArchiveRestore className="h-3 w-3" />}
          </button>
          <button onClick={() => onDelete(machine)} title="Eliminar"
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted/60 transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Badge área clickeable */}
        <button
          ref={anchorRef}
          onClick={() => setPickerOpen(v => !v)}
          title="Cambiar área"
          disabled={saving}
          className={[
            'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all',
            saving ? 'opacity-50 cursor-wait' : 'cursor-pointer',
            hasArea
              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
              : 'text-amber-500 hover:bg-amber-500/10',
          ].join(' ')}
        >
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="max-w-[80px] truncate">{areaName}</span>
        </button>

        {pickerOpen && (
          <AreaTreePicker
            tree={tree}
            currentId={machine.hierarchyNodeId}
            anchorRef={anchorRef}
            onSelect={handleQuickAssign}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    </div>
  )
}

/* ── MachineManager (principal) ─────────────────────────────── */
export function MachineManager({
  defaultNodeId,
  defaultNodeName,
  onCreated,
}: {
  defaultNodeId?: string
  defaultNodeName?: string
  onCreated?: () => void
} = {}) {
  const { machines, createMachine, updateMachine, deleteMachine, archiveMachine, reactivateMachine } =
    useMachines()
  const { tree } = useHierarchyTree()
  const { toast } = useToast()

  const hierarchyOptions = flattenTree(tree)

  const [showDialog, setShowDialog] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [formData, setFormData] = useState({
    nombre: '', marca: '', modelo: '', descripcion: '',
    categoryId: 'none', hierarchyNodeId: 'none', color: '#3b82f6',
  })
  const [showArchived, setShowArchived] = useState(false)

  // Abrir diálogo de nuevo equipo automáticamente si viene defaultNodeId
  useEffect(() => {
    if (defaultNodeId) {
      setEditingMachine(null)
      setFormData({
        nombre: '', marca: '', modelo: '', descripcion: '',
        categoryId: 'none', hierarchyNodeId: defaultNodeId, color: '#3b82f6',
      })
      setShowDialog(true)
    }
  }, [defaultNodeId])

  const resetForm = () => {
    setFormData({ nombre: '', marca: '', modelo: '', descripcion: '', categoryId: 'none', hierarchyNodeId: 'none', color: '#3b82f6' })
    setEditingMachine(null)
  }

  const handleCreate = () => { resetForm(); setShowDialog(true) }

  const handleEdit = (machine: Machine) => {
    setEditingMachine(machine)
    setFormData({
      nombre: machine.nombre || '',
      marca: machine.marca || '',
      modelo: machine.modelo || '',
      descripcion: machine.descripcion || '',
      categoryId: machine.categoryId ?? 'none',
      hierarchyNodeId: machine.hierarchyNodeId ?? 'none',
      color: machine.color || '#3b82f6',
    })
    setShowDialog(true)
  }

  const handleSave = async () => {
    const nombre = formData.nombre.trim()
    if (!nombre) {
      toast({ title: 'Error', description: 'El nombre es obligatorio', variant: 'destructive' })
      return
    }
    try {
      const payload = {
        nombre,
        marca: formData.marca.trim(),
        modelo: formData.modelo.trim(),
        descripcion: formData.descripcion,
        categoryId: formData.categoryId === 'none' ? null : formData.categoryId,
        hierarchyNodeId: formData.hierarchyNodeId === 'none' ? undefined : formData.hierarchyNodeId,
        color: formData.color,
      }
      if (editingMachine) {
        await updateMachine(editingMachine.id, payload)
        toast({ title: 'Guardado', description: `${nombre} actualizada` })
      } else {
        await createMachine({ ...payload, activa: true, orden: 0 })
        toast({ title: 'Creada', description: `${nombre} agregada` })
        onCreated?.()
      }
      setShowDialog(false)
      resetForm()
    } catch {
      toast({ title: 'Error', description: 'No se pudo guardar', variant: 'destructive' })
    }
  }

  const handleToggleActive = async (machine: Machine) => {
    try {
      if (machine.activa) {
        await archiveMachine(machine.id)
        toast({ title: 'Archivada', description: machine.nombre })
      } else {
        await reactivateMachine(machine.id)
        toast({ title: 'Reactivada', description: machine.nombre })
      }
    } catch {
      toast({ title: 'Error', description: 'No se pudo cambiar estado', variant: 'destructive' })
    }
  }

  const handleDelete = async (machine: Machine) => {
    if (!confirm(`¿Eliminar "${machine.nombre}"? Esta acción no se puede deshacer.`)) return
    try {
      await deleteMachine(machine.id)
      toast({ title: 'Eliminada', description: machine.nombre })
    } catch {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' })
    }
  }

  /* ── Agrupar máquinas por área ── */
  const activeMachines   = machines.filter(m => m.activa)
  const archivedMachines = machines.filter(m => !m.activa)

  // Construir grupos: área → máquinas
  const areaGroups = (() => {
    const map = new Map<string | null, { label: string; machines: Machine[] }>()
    for (const m of activeMachines) {
      // Normalizar a lowercase; si no hay nombre conocido para el nodeId → sin área
      const rawKey = m.hierarchyNodeId ? m.hierarchyNodeId.toLowerCase() : null
      const key = resolveNodeKey(rawKey, hierarchyOptions)
      if (!map.has(key)) {
        map.set(key, {
          label: key ? (getNodeName(key, hierarchyOptions) || 'Sin área asignada') : 'Sin área asignada',
          machines: [],
        })
      }
      map.get(key)!.machines.push(m)
    }
    // Ordenar: primero los que tienen área (por nombre), luego sin área
    const entries = [...map.entries()].sort((a, b) => {
      if (a[0] === null) return 1
      if (b[0] === null) return -1
      return a[1].label.localeCompare(b[1].label)
    })
    return entries
  })()

  const sharedCardProps = {
    tree,
    hierarchyOptions,
    onEdit: handleEdit,
    onToggleActive: handleToggleActive,
    onDelete: handleDelete,
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">Equipos</h2>
          <p className="text-[11px] text-muted-foreground">
            Clic en el badge de área para reasignar rápidamente
          </p>
        </div>
        <Button size="sm" onClick={handleCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Nuevo equipo
        </Button>
      </div>

      {/* Grupos por área */}
      {areaGroups.map(([nodeId, group]) => (
        <div key={nodeId ?? '__none__'}>
          {/* Encabezado del grupo */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className={[
              'text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full',
              nodeId
                ? 'bg-primary/10 text-primary'
                : 'bg-amber-500/10 text-amber-600',
            ].join(' ')}>
              {group.label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {group.machines.length} equipo{group.machines.length !== 1 ? 's' : ''}
            </span>
            <div className="flex-1 border-t border-border/40" />
          </div>

          <div className="grid gap-1.5 pl-2">
            {group.machines.map(m => (
              <MachineRow key={m.id} machine={m} {...sharedCardProps} />
            ))}
          </div>
        </div>
      ))}

      {activeMachines.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Sin equipos activos. Crea uno nuevo.
        </div>
      )}

      {/* Archivadas (colapsable) */}
      {archivedMachines.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived(v => !v)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={`h-3 w-3 transition-transform ${showArchived ? 'rotate-90' : ''}`} />
            Archivadas ({archivedMachines.length})
          </button>
          {showArchived && (
            <div className="grid gap-1.5 mt-2 pl-2 opacity-60">
              {archivedMachines.map(m => (
                <MachineRow key={m.id} machine={m} {...sharedCardProps} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialog crear/editar completo */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMachine ? 'Editar equipo' : 'Nuevo equipo'}</DialogTitle>
            {!editingMachine && defaultNodeName && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3 shrink-0" />
                Área: <span className="font-medium text-foreground">{defaultNodeName}</span>
              </p>
            )}
          </DialogHeader>

          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre" value={formData.nombre}
                onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Baader 200"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="marca">Marca</Label>
                <Input
                  id="marca" value={formData.marca}
                  onChange={e => setFormData({ ...formData, marca: e.target.value })}
                  placeholder="Baader"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="modelo">Modelo</Label>
                <Input
                  id="modelo" value={formData.modelo}
                  onChange={e => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="200"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="desc">Descripción</Label>
              <Input
                id="desc" value={formData.descripcion}
                onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Área de proceso</Label>
              <Select
                value={formData.hierarchyNodeId}
                onValueChange={v => setFormData({ ...formData, hierarchyNodeId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar área" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin área asignada</SelectItem>
                  {hierarchyOptions.map(n => (
                    <SelectItem key={n.id} value={n.id}>
                      {'  '.repeat(n.depth)}{n.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 items-center">
                <Input
                  value={formData.color}
                  onChange={e => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3b82f6" className="flex-1"
                />
                <div className="h-8 w-8 rounded border border-border shrink-0"
                  style={{ backgroundColor: formData.color }} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingMachine ? 'Guardar' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
