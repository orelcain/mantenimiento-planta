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

  // ── Subcategorías ──
  const subcategories = useMemo(() => {
    return categories
      .filter(c => c.parentId === activeCatId && c.activa)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }, [categories, activeCatId])

  // ── Máquinas agrupadas por subcategoría ──
  // Si la categoría tiene subcategorías, agrupa: [{ label, machines }]
  // Si no tiene subcategorías, un solo grupo sin label
  const machineGroups = useMemo(() => {
    type MachineGroup = { id: string; label: string | null; machines: Machine[] }
    const groups: MachineGroup[] = []

    if (subcategories.length > 0) {
      // Máquinas directamente en la categoría raíz (sin subcategoría)
      const directMachines = activeMachines
        .filter(m => {
          if (activeCatId === 'maquinas-principales') {
            return m.categoryId === activeCatId || !m.categoryId
          }
          return m.categoryId === activeCatId
        })
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

      if (directMachines.length > 0) {
        groups.push({ id: activeCatId, label: 'Sin subcategoría', machines: directMachines })
      }

      // Máquinas por cada subcategoría
      subcategories.forEach(sc => {
        const scMachines = activeMachines
          .filter(m => m.categoryId === sc.id)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        groups.push({ id: sc.id, label: sc.nombre, machines: scMachines })
      })
    } else {
      // Sin subcategorías: un solo grupo
      let machines: Machine[]
      if (activeCatId === 'maquinas-principales') {
        machines = activeMachines
          .filter(m => !m.categoryId || m.categoryId === activeCatId)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      } else {
        machines = activeMachines
          .filter(m => m.categoryId === activeCatId)
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      }
      groups.push({ id: activeCatId, label: null, machines })
    }

    return groups
  }, [activeMachines, activeCatId, subcategories])

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

      {/* ── Row 2: Máquinas agrupadas por subcategoría ── */}
      <div className="space-y-1.5 pt-0.5">
        {machineGroups.map(group => {
          // Saltar grupos vacíos (subcategorías sin máquinas)
          if (group.machines.length === 0 && group.label) return null

          return (
            <div key={group.id}>
              {/* Label de subcategoría (solo si hay más de un grupo) */}
              {group.label && machineGroups.length > 1 && (
                <div className="flex items-center gap-1.5 mb-1 pl-0.5">
                  <ChevronRight className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                  <span className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wider">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/30 tabular-nums">
                    {group.machines.length}
                  </span>
                </div>
              )}

              {/* Pills de máquinas */}
              <div className="flex flex-wrap items-center gap-0.5">
                {group.machines.length === 0 && (
                  <span className="text-xs text-muted-foreground/40 italic py-1 pl-5">
                    Sin equipos
                  </span>
                )}
                {group.machines.map(machine => (
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
        })}
      </div>
    </div>
  )
}
