/**
 * EquipmentNavigator — Fusión P2+P6
 *
 * Layout:
 *  Rail lateral (iconos categoría) | Header + Breadcrumb + SubcatChips + Search + MachineGrid
 *  Admin mode integrado
 */

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  Settings2,
  X,
  Search,
  Factory,
  Wrench,
  Link2,
  ChevronRight,
  GripVertical,
  Save,
} from 'lucide-react'
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import { useIsAdmin } from '@/store/authStore'
import { CategoryManager } from '@/components/repuestos/CategoryManager'
import { Button, Input } from '@/components/ui'
import { doc, writeBatch, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Machine, MachineCategory } from '@/types/repuestos'
import { InlineEditName } from '@/components/repuestos/InlineEditName'

/* ═══════════════════════════════════════════════════════════════ */
interface EquipmentNavigatorProps {
  repuestosCounts?: Record<string, number>
  className?: string
  onCategoryChange?: (categoryId: string | null) => void
}

/* ═══════════════════════════════════════════════════════════════
   Lucide icon resolver — categor ía.icono → componente
   ═══════════════════════════════════════════════════════════════ */
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Factory, Wrench, Link2,
}
function CategoryIcon({ cat, className = 'h-5 w-5' }: { cat: MachineCategory; className?: string }) {
  const Icon = ICON_MAP[cat.icono] || Factory
  return <Icon className={className} />
}

/* ═══════════════════════════════════════════════════════════════
   Rail Button (vertical sidebar)
   ═══════════════════════════════════════════════════════════════ */
function RailButton({
  cat, isActive, count, onClick,
}: {
  cat: MachineCategory; isActive: boolean; count: number; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={cat.nombre}
      className={`
        relative flex flex-col items-center justify-center gap-0.5
        w-[52px] min-h-[48px] rounded-lg cursor-pointer
        transition-all duration-150 shrink-0
        ${isActive
          ? 'bg-accent text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }
      `}
    >
      {/* Active indicator */}
      {isActive && (
        <span className="absolute -left-[3px] top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-sm bg-primary" />
      )}
      <CategoryIcon cat={cat} className="h-5 w-5" />
      <span className="text-[8px] uppercase tracking-wide leading-tight text-center truncate max-w-[46px]">
        {cat.nombre.split(' ')[0]?.substring(0, 7)}
      </span>
      {/* Count badge */}
      <span className={`
        absolute -top-0.5 -right-0.5 min-w-[16px] h-[14px] px-1
        rounded-full text-[8px] font-bold leading-[14px] text-center
        ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
      `}>
        {count}
      </span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Subcategory Chip
   ═══════════════════════════════════════════════════════════════ */
function SubcatChip({
  label, isActive, count, onClick, canEdit, onRename,
}: {
  label: string; isActive: boolean; count: number; onClick: () => void
  canEdit?: boolean; onRename?: (newName: string) => Promise<void>
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]
        border transition-all whitespace-nowrap cursor-pointer
        ${isActive
          ? 'border-primary/40 bg-primary/10 text-foreground font-medium'
          : 'border-border text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
        }
      `}
    >
      {canEdit && onRename ? (
        <InlineEditName
          value={label}
          onSave={onRename}
          canEdit
          textClassName="truncate"
        />
      ) : (
        label
      )}
      <span className={`text-[9px] tabular-nums ${isActive ? 'text-primary' : 'opacity-50'}`}>
        {count}
      </span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Machine Card (grid item)
   ═══════════════════════════════════════════════════════════════ */
function MachineCard({
  machine, isActive, count, maxCount, onClick, canEdit, onRename,
}: {
  machine: Machine; isActive: boolean; count: number; maxCount: number; onClick: () => void
  canEdit?: boolean; onRename?: (newName: string) => Promise<void>
}) {
  const accent = machine.color || '#3b82f6'
  const pct = maxCount > 0 ? Math.min(100, (count / maxCount) * 100) : 0
  const barColor = count === 0 ? 'var(--muted-foreground)' : count < 5 ? 'var(--amber, #f59e0b)' : 'var(--green, #22c55e)'

  return (
    <button
      onClick={onClick}
      title={`${machine.nombre} — ${count} repuestos`}
      className={`
        relative flex items-center gap-2 px-3 py-2 rounded-lg text-left
        transition-all duration-150 cursor-pointer overflow-hidden
        ${isActive
          ? 'bg-accent border border-primary/30 shadow-sm'
          : 'border border-transparent hover:bg-muted/50 hover:border-border'
        }
      `}
    >
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
      {canEdit && onRename ? (
        <InlineEditName
          value={machine.nombre}
          onSave={onRename}
          canEdit
          className="flex-1 min-w-0"
          textClassName={`truncate text-[12px] ${isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
        />
      ) : (
        <span className={`flex-1 truncate text-[12px] ${isActive ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
          {machine.nombre}
        </span>
      )}
      <span className={`
        text-[10px] tabular-nums px-1.5 py-0.5 rounded
        ${isActive
          ? 'bg-primary/15 text-primary font-semibold'
          : 'bg-muted/50 text-muted-foreground'
        }
      `}>
        {count}
      </span>
      {/* Mini stock bar at bottom */}
      <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-border/50 overflow-hidden">
        <span
          className="block h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Componente Principal
   ═══════════════════════════════════════════════════════════════ */
export function EquipmentNavigator({
  repuestosCounts = {},
  className = '',
  onCategoryChange,
}: EquipmentNavigatorProps) {
  const currentMachine = useCurrentMachine()
  const activeMachines = useActiveMachines()
  const { setCurrentMachine, clearCurrentMachine } = useMachineContext()
  const { categories, updateCategory } = useMachineCategories()
  const isAdmin = useIsAdmin()

  const [adminMode, setAdminMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [reorderMode, setReorderMode] = useState(false)
  const [localOrder, setLocalOrder] = useState<Machine[]>([])
  const [savingOrder, setSavingOrder] = useState(false)
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)

  // ── Categorías raíz ──
  const rootCategories = useMemo(() =>
    categories
      .filter(c => c.activa && c.visible !== false && !c.parentId)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [categories]
  )

  // ── Estado categoría activa ──
  const [activeCatId, setActiveCatId] = useState<string>(() => {
    if (currentMachine) {
      const catId = currentMachine.categoryId || 'maquinas-principales'
      const sub = categories.find(c => c.id === catId && c.parentId)
      return sub?.parentId || catId
    }
    return rootCategories[0]?.id || 'maquinas-principales'
  })

  // ── Subcategorías de la cat activa ──
  const subcategories = useMemo(() =>
    categories
      .filter(c => c.parentId === activeCatId && c.activa)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [categories, activeCatId]
  )

  // ── Estado subcategoría activa ──
  const [activeSubcatId, setActiveSubcatId] = useState<string | null>(() => {
    if (currentMachine) {
      const catId = currentMachine.categoryId || 'maquinas-principales'
      const sub = categories.find(c => c.id === catId && c.parentId)
      if (sub) return sub.id
    }
    return null
  })

  // Auto-select first subcategory when category changes or subcats load
  useEffect(() => {
    if (subcategories.length > 0) {
      const first = subcategories[0]
      // If current activeSubcatId is not in this list, select first
      if (first && (!activeSubcatId || !subcategories.find(s => s.id === activeSubcatId))) {
        setActiveSubcatId(first.id)
      }
    } else {
      setActiveSubcatId(null)
    }
  }, [subcategories, activeSubcatId])

  // ── Máquinas filtradas por subcategoría ──
  const machinesInSubcat = useMemo(() => {
    const targetId = activeSubcatId || activeCatId
    let machines: Machine[]

    if (activeCatId === 'maquinas-principales' && !activeSubcatId) {
      machines = activeMachines.filter(m => !m.categoryId || m.categoryId === activeCatId)
    } else {
      machines = activeMachines.filter(m => m.categoryId === targetId)
    }

    return machines.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }, [activeMachines, activeCatId, activeSubcatId])

  // ── Búsqueda ──
  const filteredMachines = useMemo(() => {
    if (!searchQuery.trim()) return machinesInSubcat
    const q = searchQuery.toLowerCase()
    return machinesInSubcat.filter(m =>
      m.nombre.toLowerCase().includes(q) ||
      m.marca?.toLowerCase().includes(q) ||
      m.modelo?.toLowerCase().includes(q)
    )
  }, [machinesInSubcat, searchQuery])

  // ── Max count para barras ──
  const maxCount = useMemo(() =>
    Math.max(1, ...activeMachines.map(m => repuestosCounts[m.id] || 0)),
    [activeMachines, repuestosCounts]
  )

  // ── Conteo por cat raíz ──
  const machineCountPerCat = useMemo(() => {
    const result: Record<string, number> = {}
    rootCategories.forEach(cat => {
      const subcatIds = categories.filter(c => c.parentId === cat.id && c.activa).map(c => c.id)
      const allIds = [cat.id, ...subcatIds]
      if (cat.id === 'maquinas-principales') {
        result[cat.id] = activeMachines.filter(m => !m.categoryId || allIds.includes(m.categoryId || '')).length
      } else {
        result[cat.id] = activeMachines.filter(m => m.categoryId && allIds.includes(m.categoryId)).length
      }
    })
    return result
  }, [rootCategories, categories, activeMachines])

  // ── Conteo por subcategoría ──
  const machineCountPerSubcat = useMemo(() => {
    const result: Record<string, number> = {}
    subcategories.forEach(sc => {
      result[sc.id] = activeMachines.filter(m => m.categoryId === sc.id).length
    })
    return result
  }, [subcategories, activeMachines])

  // ── Handlers ──
  const handleCategoryChange = useCallback((catId: string) => {
    setActiveCatId(catId)
    setSearchQuery('')
    clearCurrentMachine()
    onCategoryChange?.(catId)
  }, [clearCurrentMachine, onCategoryChange])

  const handleSubcatChange = useCallback((subcatId: string) => {
    setActiveSubcatId(subcatId)
    setSearchQuery('')
    clearCurrentMachine()
  }, [clearCurrentMachine])

  const handleSelectMachine = useCallback((machine: Machine) => {
    setCurrentMachine(machine.id)
    const catId = machine.categoryId || 'maquinas-principales'
    const sub = categories.find(c => c.id === catId && c.parentId)
    onCategoryChange?.(sub?.parentId || catId)
  }, [categories, setCurrentMachine, onCategoryChange])

  // ── Reorder (drag & drop) ──
  const enterReorderMode = useCallback(() => {
    setLocalOrder([...machinesInSubcat])
    setReorderMode(true)
  }, [machinesInSubcat])

  const cancelReorder = useCallback(() => {
    setReorderMode(false)
    setLocalOrder([])
  }, [])

  const handleDragStart = useCallback((index: number) => {
    dragItem.current = index
  }, [])

  const handleDragEnter = useCallback((index: number) => {
    dragOverItem.current = index
  }, [])

  const handleDragEnd = useCallback(() => {
    if (dragItem.current === null || dragOverItem.current === null) return
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null
      dragOverItem.current = null
      return
    }
    setLocalOrder(prev => {
      const updated = [...prev]
      const draggedItem = updated.splice(dragItem.current!, 1)[0]
      if (draggedItem) updated.splice(dragOverItem.current!, 0, draggedItem)
      return updated
    })
    dragItem.current = null
    dragOverItem.current = null
  }, [])

  const saveOrder = useCallback(async () => {
    if (localOrder.length === 0) return
    setSavingOrder(true)
    try {
      const batch = writeBatch(db)
      localOrder.forEach((machine, index) => {
        const ref = doc(db, 'machines', machine.id)
        batch.update(ref, { orden: index, updatedAt: Timestamp.now() })
      })
      await batch.commit()
      setReorderMode(false)
      setLocalOrder([])
    } catch (err) {
      console.error('Error saving order:', err)
    } finally {
      setSavingOrder(false)
    }
  }, [localOrder])

  // ── Rename handlers (inline edit) ──
  const handleRenameCategory = useCallback(async (catId: string, newName: string) => {
    await updateCategory(catId, { nombre: newName })
  }, [updateCategory])

  const handleRenameMachine = useCallback(async (machineId: string, newName: string) => {
    const ref = doc(db, 'machines', machineId)
    await updateDoc(ref, { nombre: newName, updatedAt: Timestamp.now() })
  }, [])

  // Sync activeCatId + activeSubcatId when currentMachine changes externally
  useEffect(() => {
    if (!currentMachine) return
    const catId = currentMachine.categoryId || 'maquinas-principales'
    const sub = categories.find(c => c.id === catId && c.parentId)
    const rootId = sub?.parentId || catId
    if (rootId !== activeCatId) setActiveCatId(rootId)
    if (sub && sub.id !== activeSubcatId) setActiveSubcatId(sub.id)
  }, [currentMachine, categories])

  // ── Derived ──
  const activeCat = rootCategories.find(c => c.id === activeCatId)
  const activeSubcat = subcategories.find(c => c.id === activeSubcatId)

  if (rootCategories.length === 0) {
    return <div className="text-center py-4 text-muted-foreground text-sm">No hay categorías configuradas.</div>
  }

  /* ═══ ADMIN MODE ═══ */
  if (adminMode) {
    return (
      <div className={`rounded-xl border border-primary/30 bg-card overflow-hidden ${className}`}>
        <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/20">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Administrar Estructura</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full hidden sm:inline">
              Reordena, crea y edita categorías, subcategorías y equipos
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setAdminMode(false)} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" /> Cerrar
          </Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <CategoryManager />
        </div>
      </div>
    )
  }

  /* ═══ BROWSE MODE — FUSION 2+6 ═══ */
  return (
    <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`}>
      <div className="flex">
        {/* ── RAIL (sidebar vertical de categorías) ── */}
        <div className="flex flex-col items-center gap-0.5 px-1 py-2 border-r border-border bg-card shrink-0">
          {rootCategories.map(cat => (
            <RailButton
              key={cat.id}
              cat={cat}
              isActive={activeCatId === cat.id}
              count={machineCountPerCat[cat.id] || 0}
              onClick={() => handleCategoryChange(cat.id)}
            />
          ))}
          {/* Admin button at bottom of rail */}
          {isAdmin && (
            <button
              onClick={() => setAdminMode(true)}
              title="Administrar estructura"
              className="flex items-center justify-center w-[52px] h-9 mt-auto rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Settings2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ── CONTENT ── */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            {isAdmin && activeCat ? (
              <InlineEditName
                value={activeCat.nombre}
                onSave={(n) => handleRenameCategory(activeCat.id, n)}
                canEdit
                textClassName="text-sm font-semibold text-foreground"
              />
            ) : (
              <span className="text-sm font-semibold text-foreground">{activeCat?.nombre}</span>
            )}
            <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full tabular-nums">
              {filteredMachines.length}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {isAdmin && !reorderMode && (
                <button
                  onClick={enterReorderMode}
                  title="Reordenar equipos (drag & drop)"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ordenar</span>
                </button>
              )}
              {reorderMode && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={cancelReorder}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                  >
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                  <button
                    onClick={saveOrder}
                    disabled={savingOrder}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded transition-colors disabled:opacity-50"
                  >
                    <Save className="h-3 w-3" />
                    {savingOrder ? 'Guardando…' : 'Guardar orden'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 px-3 py-1 text-[11px] text-muted-foreground bg-muted/30 border-b border-border">
            <span>{activeCat?.nombre}</span>
            {activeSubcat && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <span>{activeSubcat.nombre}</span>
              </>
            )}
            {currentMachine && (
              <>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
                <span className="text-primary font-medium">● {currentMachine.nombre}</span>
              </>
            )}
          </div>

          {/* Toolbar: subcats + search */}
          <div className="flex items-center gap-2 px-3 py-1.5 flex-wrap">
            {/* Subcategory chips */}
            {subcategories.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap flex-1">
                {subcategories.map(sc => (
                  <SubcatChip
                    key={sc.id}
                    label={sc.nombre.replace(/^(Cintas?|Máquinas?|Cinta)\s*/i, '')}
                    isActive={activeSubcatId === sc.id}
                    count={machineCountPerSubcat[sc.id] || 0}
                    onClick={() => handleSubcatChange(sc.id)}
                    canEdit={isAdmin}
                    onRename={(n) => handleRenameCategory(sc.id, n)}
                  />
                ))}
              </div>
            )}
            {/* Search */}
            <div className="relative w-full sm:w-auto sm:max-w-[180px] shrink-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar equipo…"
                className="h-7 pl-7 pr-7 text-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Machine Grid */}
          <div className="px-2 pb-2 pt-0.5">
            {reorderMode ? (
              /* ── Reorder mode: drag & drop list ── */
              localOrder.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  Sin equipos en esta subcategoría
                </div>
              ) : (
                <>
                  <div className="mb-1.5 px-1">
                    <span className="text-[10px] text-muted-foreground">
                      ↕ Arrastra los equipos para reordenar · El orden refleja la secuencia física del proceso
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                    {localOrder.map((machine, index) => (
                      <div
                        key={machine.id}
                        draggable
                        onDragStart={() => handleDragStart(index)}
                        onDragEnter={() => handleDragEnter(index)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => e.preventDefault()}
                        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-border bg-card hover:border-primary/50 cursor-grab active:cursor-grabbing transition-colors select-none"
                      >
                        <span className="text-[10px] font-mono text-muted-foreground w-4 text-center shrink-0">
                          {index + 1}
                        </span>
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: machine.color || '#3b82f6' }}
                        />
                        <span className="text-xs font-medium text-foreground truncate">
                          {machine.nombre}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {repuestosCounts[machine.id] || 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )
            ) : (
              /* ── Browse mode: normal grid ── */
              filteredMachines.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-xs">
                  {searchQuery
                    ? <>🔍 Sin resultados para &quot;{searchQuery}&quot;</>
                    : 'Sin equipos en esta subcategoría'
                  }
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                  {filteredMachines.map(machine => (
                    <MachineCard
                      key={machine.id}
                      machine={machine}
                      isActive={currentMachine?.id === machine.id}
                      count={repuestosCounts[machine.id] || 0}
                      maxCount={maxCount}
                      onClick={() => handleSelectMachine(machine)}
                      canEdit={isAdmin}
                      onRename={(n) => handleRenameMachine(machine.id, n)}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
