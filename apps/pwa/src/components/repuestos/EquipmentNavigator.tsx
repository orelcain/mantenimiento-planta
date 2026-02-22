/**
 * EquipmentNavigator — Navegación limpia de equipos con modo admin integrado
 *
 * Dos modos:
 *  • Browse (default): Navegación compacta Categoría → Subcategoría → Máquina
 *  • Admin: Panel de gestión CRUD + reorden de categorías/subcategorías/máquinas
 */

import { useState, useMemo, useEffect } from 'react'
import {
  ChevronRight,
  Settings2,
  X,
} from 'lucide-react'
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import { useIsAdmin } from '@/store/authStore'
import { CategoryManager } from '@/components/repuestos/CategoryManager'
import { Button } from '@/components/ui'
import type { Machine } from '@/types/repuestos'

/* ═══════════════════════════════════════════════════════════════
   Props
   ═══════════════════════════════════════════════════════════════ */
interface EquipmentNavigatorProps {
  repuestosCounts?: Record<string, number>
  className?: string
  onCategoryChange?: (categoryId: string | null) => void
}

/* ═══════════════════════════════════════════════════════════════
   Machine Pill — Item individual de máquina
   ═══════════════════════════════════════════════════════════════ */
function MachinePill({
  machine,
  isActive,
  count,
  onClick,
}: {
  machine: Machine
  isActive: boolean
  count: number
  onClick: () => void
}) {
  const accent = machine.color || '#3b82f6'

  return (
    <button
      onClick={onClick}
      title={machine.nombre}
      className={`
        group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
        transition-all whitespace-nowrap cursor-pointer border
        ${isActive
          ? 'bg-primary/10 border-primary/40 text-foreground font-semibold shadow-sm'
          : 'border-transparent hover:border-border/60 hover:bg-muted/50 text-muted-foreground'
        }
      `}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0 ring-1 ring-black/5"
        style={{ backgroundColor: accent }}
      />
      <span className="truncate max-w-[160px]">{machine.nombre}</span>
      <span className={`
        tabular-nums text-[10px] font-medium
        ${isActive ? 'text-primary' : 'text-muted-foreground/50'}
      `}>
        {count}
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
  const { setCurrentMachine } = useMachineContext()
  const { categories } = useMachineCategories()
  const isAdmin = useIsAdmin()

  const [adminMode, setAdminMode] = useState(false)

  // ── Categorías raíz ordenadas ──
  const rootCategories = useMemo(() => {
    return categories
      .filter(c => c.activa && c.visible !== false && !c.parentId)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }, [categories])

  // ── Estado activo ──
  const [activeCatId, setActiveCatId] = useState<string>(
    () => {
      if (currentMachine) {
        const catId = currentMachine.categoryId || 'maquinas-principales'
        const sub = categories.find(c => c.id === catId && c.parentId)
        return sub?.parentId || catId
      }
      return rootCategories[0]?.id || 'maquinas-principales'
    }
  )
  const [activeSubcatId, setActiveSubcatId] = useState<string | null>(null)

  // ── Subcategorías ──
  const subcategories = useMemo(() => {
    return categories
      .filter(c => c.parentId === activeCatId && c.activa)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }, [categories, activeCatId])

  // ── Máquinas visibles ──
  const visibleMachines = useMemo(() => {
    if (activeSubcatId) {
      return activeMachines
        .filter(m => m.categoryId === activeSubcatId)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    }
    const subcatIds = subcategories.map(sc => sc.id)
    const allCatIds = [activeCatId, ...subcatIds]
    if (activeCatId === 'maquinas-principales') {
      return activeMachines
        .filter(m => !m.categoryId || allCatIds.includes(m.categoryId))
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    }
    return activeMachines
      .filter(m => m.categoryId && allCatIds.includes(m.categoryId))
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }, [activeMachines, activeCatId, activeSubcatId, subcategories])

  // ── Conteo de máquinas por cat raíz ──
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
    setActiveSubcatId(null)
    onCategoryChange?.(catId)
  }

  const handleSelectMachine = (machine: Machine) => {
    setCurrentMachine(machine.id)
    const catId = machine.categoryId || 'maquinas-principales'
    const sub = categories.find(c => c.id === catId && c.parentId)
    onCategoryChange?.(sub?.parentId || catId)
  }

  // Sincronizar con máquina activa
  useEffect(() => {
    if (!currentMachine) return
    const catId = currentMachine.categoryId || 'maquinas-principales'
    const sub = categories.find(c => c.id === catId && c.parentId)
    const rootId = sub?.parentId || catId
    if (rootId !== activeCatId) {
      setActiveCatId(rootId)
      setActiveSubcatId(sub?.id || null)
    }
  }, [currentMachine, categories])

  if (rootCategories.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No hay categorías configuradas.
      </div>
    )
  }

  /* ═══ ADMIN MODE ═══ */
  if (adminMode) {
    return (
      <div className={`rounded-xl border border-primary/30 bg-card overflow-hidden ${className}`}>
        {/* Header del panel admin */}
        <div className="flex items-center justify-between px-4 py-3 bg-primary/5 border-b border-primary/20">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Administrar Estructura</span>
            <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
              Reordena, crea y edita categorías, subcategorías y equipos
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdminMode(false)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Cerrar
          </Button>
        </div>

        {/* CategoryManager integrado */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          <CategoryManager />
        </div>
      </div>
    )
  }

  /* ═══ BROWSE MODE ═══ */
  return (
    <div className={`space-y-1 ${className}`}>
      {/* ── Row 1: Categorías + botón Admin ── */}
      <div className="flex items-center gap-2">
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
                <span>{cat.nombre}</span>
                <span className={`
                  text-[10px] font-semibold tabular-nums
                  ${isActive ? 'opacity-60' : 'opacity-40'}
                `}>
                  {mCount}
                </span>
              </button>
            )
          })}
        </div>

        {/* Admin toggle */}
        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAdminMode(true)}
            className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground h-7 px-2"
            title="Administrar estructura de categorías y equipos"
          >
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[11px]">Administrar</span>
          </Button>
        )}
      </div>

      {/* ── Row 2: Subcategorías (si hay) con breadcrumb ── */}
      {subcategories.length > 0 && (
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-thin pl-1">
          <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
          <button
            onClick={() => setActiveSubcatId(null)}
            className={`
              px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-all shrink-0
              ${!activeSubcatId
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30'
              }
            `}
          >
            Todos
          </button>
          {subcategories.map(sc => {
            const isActive = activeSubcatId === sc.id
            const scMachines = activeMachines.filter(m => m.categoryId === sc.id)

            return (
              <button
                key={sc.id}
                onClick={() => setActiveSubcatId(sc.id)}
                className={`
                  inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
                  whitespace-nowrap transition-all shrink-0
                  ${isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30'
                  }
                `}
              >
                <span>{sc.nombre}</span>
                <span className="text-[10px] opacity-40 tabular-nums">{scMachines.length}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Row 3: Máquinas ── */}
      <div className="flex flex-wrap items-center gap-0.5 pt-0.5">
        {visibleMachines.length === 0 && (
          <span className="text-xs text-muted-foreground/50 italic py-1 pl-1">
            Sin equipos en esta categoría
          </span>
        )}
        {visibleMachines.map(machine => (
          <MachinePill
            key={machine.id}
            machine={machine}
            isActive={currentMachine?.id === machine.id}
            count={repuestosCounts[machine.id] || 0}
            onClick={() => handleSelectMachine(machine)}
          />
        ))}
      </div>
    </div>
  )
}
