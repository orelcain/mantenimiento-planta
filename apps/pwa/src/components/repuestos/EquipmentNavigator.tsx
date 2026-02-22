/**
 * EquipmentNavigator — Navegación compacta de equipos con admin integrado
 *
 * Layout:
 *  Row 1: Tabs de categorías raíz + botón admin
 *  Row 2: Máquinas en fila horizontal con separadores de subcategoría inline
 */

import { useState, useMemo, useEffect } from 'react'
import {
  Settings2,
  X,
} from 'lucide-react'
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import { useIsAdmin } from '@/store/authStore'
import { CategoryManager } from '@/components/repuestos/CategoryManager'
import { Button } from '@/components/ui'
import type { Machine, MachineCategory } from '@/types/repuestos'

/* ═══════════════════════════════════════════════════════════════ */
interface EquipmentNavigatorProps {
  repuestosCounts?: Record<string, number>
  className?: string
  onCategoryChange?: (categoryId: string | null) => void
}

/* ═══════════════════════════════════════════════════════════════
   Machine Pill
   ═══════════════════════════════════════════════════════════════ */
function MachinePill({
  machine, isActive, count, onClick,
}: {
  machine: Machine; isActive: boolean; count: number; onClick: () => void
}) {
  const accent = machine.color || '#3b82f6'
  return (
    <button
      onClick={onClick}
      title={`${machine.nombre} — ${count} repuestos`}
      className={`
        inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px]
        transition-all whitespace-nowrap cursor-pointer
        ${isActive
          ? 'bg-primary/12 text-foreground font-semibold ring-1 ring-primary/30'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }
      `}
    >
      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: accent }} />
      <span className="truncate max-w-[130px]">{machine.nombre}</span>
      <span className={`tabular-nums text-[9px] ${isActive ? 'text-primary' : 'opacity-40'}`}>
        {count}
      </span>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   Inline Subcategory Separator
   ═══════════════════════════════════════════════════════════════ */
function SubcatSeparator({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40 select-none shrink-0">
      <span className="w-px h-3 bg-border/60" />
      {label}
    </span>
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
  const { setCurrentMachine } = useMachineContext()
  const { categories } = useMachineCategories()
  const isAdmin = useIsAdmin()

  const [adminMode, setAdminMode] = useState(false)

  // ── Categorías raíz ──
  const rootCategories = useMemo(() =>
    categories
      .filter(c => c.activa && c.visible !== false && !c.parentId)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [categories]
  )

  // ── Estado ──
  const [activeCatId, setActiveCatId] = useState<string>(() => {
    if (currentMachine) {
      const catId = currentMachine.categoryId || 'maquinas-principales'
      const sub = categories.find(c => c.id === catId && c.parentId)
      return sub?.parentId || catId
    }
    return rootCategories[0]?.id || 'maquinas-principales'
  })

  // ── Subcategorías ──
  const subcategories = useMemo(() =>
    categories
      .filter(c => c.parentId === activeCatId && c.activa)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [categories, activeCatId]
  )

  // ── Elementos a renderizar: array de { type: 'separator' | 'machine', ... } ──
  // Genera una lista plana de separadores + máquinas para una sola fila
  const flatItems = useMemo(() => {
    type Item =
      | { type: 'separator'; id: string; label: string }
      | { type: 'machine'; id: string; machine: Machine }

    const items: Item[] = []
    const hasSubcats = subcategories.length > 0

    if (hasSubcats) {
      // Máquinas directas en la categoría raíz
      const directMachines = activeMachines
        .filter(m => {
          if (activeCatId === 'maquinas-principales') return m.categoryId === activeCatId || !m.categoryId
          return m.categoryId === activeCatId
        })
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

      if (directMachines.length > 0) {
        items.push({ type: 'separator', id: `sep-direct`, label: 'General' })
        directMachines.forEach(m => items.push({ type: 'machine', id: m.id, machine: m }))
      }

      // Cada subcategoría con sus máquinas
      subcategories.forEach(sc => {
        const scMachines = activeMachines
          .filter(m => m.categoryId === sc.id)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        if (scMachines.length > 0) {
          items.push({ type: 'separator', id: `sep-${sc.id}`, label: sc.nombre })
          scMachines.forEach(m => items.push({ type: 'machine', id: m.id, machine: m }))
        }
      })
    } else {
      // Sin subcategorías
      const machines = activeCatId === 'maquinas-principales'
        ? activeMachines.filter(m => !m.categoryId || m.categoryId === activeCatId)
        : activeMachines.filter(m => m.categoryId === activeCatId)
      machines
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .forEach(m => items.push({ type: 'machine', id: m.id, machine: m }))
    }

    return items
  }, [activeMachines, activeCatId, subcategories])

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

  // ── Handlers ──
  const handleCategoryChange = (catId: string) => {
    setActiveCatId(catId)
    onCategoryChange?.(catId)
  }

  const handleSelectMachine = (machine: Machine) => {
    setCurrentMachine(machine.id)
    const catId = machine.categoryId || 'maquinas-principales'
    const sub = categories.find(c => c.id === catId && c.parentId)
    onCategoryChange?.(sub?.parentId || catId)
  }

  useEffect(() => {
    if (!currentMachine) return
    const catId = currentMachine.categoryId || 'maquinas-principales'
    const sub = categories.find(c => c.id === catId && c.parentId)
    const rootId = sub?.parentId || catId
    if (rootId !== activeCatId) setActiveCatId(rootId)
  }, [currentMachine, categories])

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

  /* ═══ BROWSE MODE ═══ */
  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* ── Row 1: Categorías ── */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 scrollbar-thin">
          {rootCategories.map(cat => {
            const isActive = activeCatId === cat.id
            const mCount = machineCountPerCat[cat.id] || 0
            return (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`
                  inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  whitespace-nowrap transition-all shrink-0
                  ${isActive
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                  }
                `}
              >
                {cat.nombre}
                <span className={`text-[10px] font-semibold tabular-nums ${isActive ? 'opacity-60' : 'opacity-40'}`}>
                  {mCount}
                </span>
              </button>
            )
          })}
        </div>
        {isAdmin && (
          <Button
            variant="ghost" size="sm"
            onClick={() => setAdminMode(true)}
            className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground h-7 px-2"
            title="Administrar estructura"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[11px]">Administrar</span>
          </Button>
        )}
      </div>

      {/* ── Row 2: Máquinas en fila con separadores inline ── */}
      <div className="flex flex-wrap items-center gap-0.5">
        {flatItems.length === 0 && (
          <span className="text-xs text-muted-foreground/50 italic py-1">Sin equipos en esta categoría</span>
        )}
        {flatItems.map(item =>
          item.type === 'separator' ? (
            <SubcatSeparator key={item.id} label={item.label} />
          ) : (
            <MachinePill
              key={item.id}
              machine={item.machine}
              isActive={currentMachine?.id === item.machine.id}
              count={repuestosCounts[item.machine.id] || 0}
              onClick={() => handleSelectMachine(item.machine)}
            />
          )
        )}
      </div>
    </div>
  )
}
