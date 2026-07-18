/**
 * SidebarEditorPage — Editor drag & drop del sidebar
 * Ruta: /admin/sidebar (solo admin)
 *
 * Permite reordenar grupos y mover módulos entre categorías.
 * Persiste en Firestore: sidebarConfig/default
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  GripVertical, Save, RotateCcw, ArrowLeft, CheckCircle2, Loader2, Info,
} from 'lucide-react'
import { loadSidebarConfig, saveSidebarConfig } from '@/services/sidebarConfig'

// Tipos locales
interface Item { id: string; name: string; href: string; groupId: string }
interface Group { id: string; label: string; items: Item[] }

// Config por defecto (espejo del navGroups en MainLayout)
const DEFAULT_GROUPS: Group[] = [
  {
    id: 'principal', label: 'Principal',
    items: [
      { id: 'dashboard', name: 'Dashboard', href: '/', groupId: 'principal' },
      { id: 'incidencias', name: 'Incidencias', href: '/incidents', groupId: 'principal' },
      { id: 'evidencias', name: 'Evidencias', href: '/photo-evidence', groupId: 'principal' },
    ],
  },
  {
    id: 'planificacion', label: 'Planificación',
    items: [
      { id: 'inspecciones', name: 'Inspecciones', href: '/inspections', groupId: 'planificacion' },
      { id: 'preventivo', name: 'Preventivo', href: '/preventive', groupId: 'planificacion' },
      { id: 'predictivo', name: 'Predictivo', href: '/predictive', groupId: 'planificacion' },
      { id: 'gantt', name: 'Planificador Gantt', href: '/gantt', groupId: 'planificacion' },
      { id: 'calendario', name: 'Calendario Mantención', href: '/calendario-mantencion', groupId: 'planificacion' },
    ],
  },
  {
    id: 'equipamiento', label: 'Equipamiento',
    items: [
      { id: 'equipos', name: 'Equipos', href: '/equipment', groupId: 'equipamiento' },
      { id: 'repuestos', name: 'Repuestos', href: '/repuestos', groupId: 'equipamiento' },
      { id: 'sensores', name: 'Sensores', href: '/sensors', groupId: 'equipamiento' },
      { id: 'panel-sensores', name: 'Panel Sensores', href: '/sensors/monitor', groupId: 'equipamiento' },
    ],
  },
  {
    id: 'herramientas', label: 'Herramientas',
    items: [
      { id: 'mapa', name: 'Visor de Mapas', href: '/map', groupId: 'herramientas' },
      { id: 'visor3d', name: 'Visor 3D', href: '/visor-3d', groupId: 'herramientas' },
      { id: 'grader', name: 'Análisis de Turno', href: '/analisis-grader', groupId: 'herramientas' },
      { id: 'clima', name: 'Clima Puerto', href: '/clima-puerto', groupId: 'herramientas' },
      { id: 'hmi', name: 'HMI Knuro', href: '/hmi-knuro', groupId: 'herramientas' },
      { id: 'baader', name: 'Baader 200', href: '/baader-200', groupId: 'herramientas' },
    ],
  },
  {
    id: 'aprendizaje', label: 'Aprendizaje',
    items: [
      { id: 'hub', name: 'Centro de Aprendizaje', href: '/aprendizaje', groupId: 'aprendizaje' },
    ],
  },
  {
    id: 'admin', label: 'Administración',
    items: [
      // Sidebar minimalista — todo lo admin vive en el hub `/admin` con
      // re-confirmación. Los items individuales (Configuración, Mapas, ETT,
      // etc.) NO aparecen en el sidebar; se accede a ellos desde el Panel.
      { id: 'panel-admin', name: 'Panel Admin', href: '/admin', groupId: 'admin' },
    ],
  },
]

// Aplanar todos los items
function flatItems(groups: Group[]): Item[] {
  return groups.flatMap(g => g.items)
}

// ── Item sortable ────────────────────────────────────────────
function SortableItem({ item, isDragging }: { item: Item; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground select-none"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={`Mover ${item.name}`}
        className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none flex items-center justify-center min-w-[44px] min-h-[44px] -m-2 p-2"
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex-1 truncate">{item.name}</span>
      <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{item.href}</span>
    </div>
  )
}

// ── Grupo sortable ───────────────────────────────────────────
function SortableGroup({
  group,
  activeItemId,
}: {
  group: Group
  activeItemId: string | null
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `group:${group.id}` })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-card/50">
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
        <button
          {...attributes}
          {...listeners}
          aria-label={`Mover grupo ${group.label}`}
          className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none flex items-center justify-center min-w-[44px] min-h-[44px] -m-2 p-2"
        >
          <GripVertical className="h-5 w-5" />
        </button>
        <span className="font-semibold text-sm text-foreground flex-1">{group.label}</span>
        <span className="text-[10px] text-muted-foreground">{group.items.length} módulos</span>
      </div>

      {/* Items */}
      <div className="p-2 flex flex-col gap-1.5 min-h-[48px]">
        <SortableContext items={group.items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {group.items.map(item => (
            <SortableItem key={item.id} item={item} isDragging={item.id === activeItemId} />
          ))}
        </SortableContext>
        {group.items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">Sin módulos</p>
        )}
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────
export function SidebarEditorPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>(DEFAULT_GROUPS)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Cargar config guardada
  useEffect(() => {
    loadSidebarConfig().then(config => {
      if (config) {
        // Reconstruir grupos con el orden guardado
        const groupMap = Object.fromEntries(DEFAULT_GROUPS.map(g => [g.id, g]))

        const rebuilt: Group[] = config.groupOrder.reduce<Group[]>((acc, gid) => {
            const def = groupMap[gid]
            if (!def) return acc
            const savedGroup = config.groups.find(g => g.id === gid)
            if (!savedGroup) { acc.push(def); return acc }
            const savedIds = new Set(savedGroup.itemOrder)
            const orderedItems = savedGroup.itemOrder
              .map(href => def.items.find(i => i.href === href))
              .filter((i): i is Item => i !== undefined)
            const rest = def.items.filter(i => !savedIds.has(i.href))
            acc.push({ ...def, items: [...orderedItems, ...rest] })
            return acc
          }, [])

        // Agregar grupos nuevos que no estén en el config guardado
        DEFAULT_GROUPS.forEach(dg => {
          if (!config.groupOrder.includes(dg.id)) rebuilt.push(dg)
        })

        setGroups(rebuilt)
      }
      setLoading(false)
    })
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // delay 200ms (más responsivo que 250) + tolerance 8px (permite jitter del dedo sin cancelar)
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
    setSaved(false)
  }

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    // Solo mover items (no grupos)
    if (activeId.startsWith('group:') || overId.startsWith('group:')) return

    setGroups(prev => {
      const activeGroup = prev.find(g => g.items.some(i => i.id === activeId))
      const overGroup = overId.startsWith('group:')
        ? prev.find(g => g.id === overId.replace('group:', ''))
        : prev.find(g => g.items.some(i => i.id === overId))

      if (!activeGroup || !overGroup) return prev
      if (activeGroup.id === overGroup.id) return prev

      // Mover item entre grupos
      const activeItem = activeGroup.items.find(i => i.id === activeId)!
      const updatedItem = { ...activeItem, groupId: overGroup.id }
      const overIndex = overGroup.items.findIndex(i => i.id === overId)

      return prev.map(g => {
        if (g.id === activeGroup.id) return { ...g, items: g.items.filter(i => i.id !== activeId) }
        if (g.id === overGroup.id) {
          const newItems = [...g.items]
          const insertAt = overIndex >= 0 ? overIndex : newItems.length
          newItems.splice(insertAt, 0, updatedItem)
          return { ...g, items: newItems }
        }
        return g
      })
    })
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const activeId = String(active.id)
    const overId = String(over.id)

    setGroups(prev => {
      // Reordenar grupos
      if (activeId.startsWith('group:') && overId.startsWith('group:')) {
        const fromId = activeId.replace('group:', '')
        const toId = overId.replace('group:', '')
        const fromIdx = prev.findIndex(g => g.id === fromId)
        const toIdx = prev.findIndex(g => g.id === toId)
        if (fromIdx < 0 || toIdx < 0) return prev
        return arrayMove(prev, fromIdx, toIdx)
      }

      // Reordenar items dentro del mismo grupo
      const group = prev.find(g => g.items.some(i => i.id === activeId))
      if (!group) return prev
      const overInSameGroup = group.items.some(i => i.id === overId)
      if (!overInSameGroup) return prev // cross-group ya manejado en dragOver

      const fromIdx = group.items.findIndex(i => i.id === activeId)
      const toIdx = group.items.findIndex(i => i.id === overId)
      if (fromIdx < 0 || toIdx < 0) return prev

      return prev.map(g =>
        g.id === group.id ? { ...g, items: arrayMove(g.items, fromIdx, toIdx) } : g
      )
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveSidebarConfig({
        groupOrder: groups.map(g => g.id),
        groups: groups.map(g => ({
          id: g.id,
          label: g.label,
          itemOrder: g.items.map(i => i.href),
        })),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setGroups(DEFAULT_GROUPS)
    setSaved(false)
  }

  const activeItem = activeId && !activeId.startsWith('group:')
    ? flatItems(groups).find(i => i.id === activeId)
    : null

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Editor de Sidebar</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Arrastra para reordenar grupos y módulos</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Resetear
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
          {saved ? '¡Guardado!' : 'Guardar'}
        </button>
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted px-3 py-2.5 mb-5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Los cambios se aplican al <strong>recargar la app</strong>. El grupo "Administración" siempre es solo visible para admins.
        </span>
      </div>

      {/* DnD Context */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={groups.map(g => `group:${g.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
            {groups.map(group => (
              <SortableGroup
                key={group.id}
                group={group}
                activeItemId={activeId}
              />
            ))}
          </div>
        </SortableContext>

        {/* Drag overlay */}
        <DragOverlay>
          {activeItem && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary bg-card shadow-lg text-sm text-foreground opacity-95">
              <GripVertical className="h-4 w-4 text-primary" />
              <span>{activeItem.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
