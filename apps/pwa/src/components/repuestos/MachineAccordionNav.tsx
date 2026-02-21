/**
 * MachineAccordionNav — Navegación compacta por Categoría → Subcategoría → Máquina
 *
 * Layout:
 *  Fila 1 — Tabs horizontales por categoría raíz
 *  Fila 2 — Sub-tabs horizontales por subcategoría (si aplica)
 *  Fila 3 — Chips compactos de máquinas con badge de conteo
 */

import { useState, useMemo, useEffect } from 'react'
import { Package } from 'lucide-react'
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import type { Machine } from '@/types/repuestos'

interface MachineAccordionNavProps {
  repuestosCounts?: Record<string, number>
  className?: string
  onCategoryChange?: (categoryId: string | null) => void
}

/* ────────── Chip compacto de máquina ────────── */
function MachineChip({
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
      title={`${machine.nombre} — ${count} repuesto${count !== 1 ? 's' : ''}`}
      className={`
        inline-flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg border text-xs
        transition-all whitespace-nowrap cursor-pointer
        ${isActive
          ? 'border-primary/50 shadow-sm ring-1 ring-primary/20'
          : 'border-border/50 hover:border-border hover:bg-muted/40'
        }
      `}
      style={isActive ? { backgroundColor: accent + '14' } : undefined}
    >
      {/* Dot de color */}
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: accent }}
      />
      <span className={`truncate max-w-[140px] ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
        {machine.nombre}
      </span>
      {/* Badge de conteo */}
      <span className={`
        inline-flex items-center justify-center min-w-[20px] h-[18px] px-1 rounded-full text-[10px] font-bold
        ${isActive
          ? 'bg-primary/20 text-primary'
          : count > 0
            ? 'bg-muted text-muted-foreground'
            : 'bg-transparent text-muted-foreground/40'
        }
      `}>
        {count}
      </span>
    </button>
  )
}

/* ────────── Componente principal ────────── */
export function MachineAccordionNav({
  repuestosCounts = {},
  className = '',
  onCategoryChange,
}: MachineAccordionNavProps) {
  const currentMachine = useCurrentMachine()
  const activeMachines = useActiveMachines()
  const { setCurrentMachine } = useMachineContext()
  const { categories } = useMachineCategories()

  // Categorías raíz ordenadas
  const rootCategories = useMemo(() => {
    return categories
      .filter(c => c.activa && c.visible !== false && !c.parentId)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }, [categories])

  // Estado: categoría seleccionada
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

  // Estado: subcategoría seleccionada (null = "Todos")
  const [activeSubcatId, setActiveSubcatId] = useState<string | null>(null)

  // Subcategorías de la categoría activa
  const subcategories = useMemo(() => {
    return categories
      .filter(c => c.parentId === activeCatId && c.activa)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
  }, [categories, activeCatId])

  // Máquinas según categoría + subcategoría seleccionadas
  const visibleMachines = useMemo(() => {
    if (activeSubcatId) {
      return activeMachines
        .filter(m => m.categoryId === activeSubcatId)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    }

    // Sin subcategoría seleccionada: todas las de la categoría raíz
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

  // Conteo total de repuestos por categoría raíz (para badge en tab)
  const countPerRootCat = useMemo(() => {
    const result: Record<string, number> = {}
    rootCategories.forEach(cat => {
      const subcatIds = categories.filter(c => c.parentId === cat.id && c.activa).map(c => c.id)
      const allIds = [cat.id, ...subcatIds]

      let machines: Machine[]
      if (cat.id === 'maquinas-principales') {
        machines = activeMachines.filter(m => !m.categoryId || allIds.includes(m.categoryId || ''))
      } else {
        machines = activeMachines.filter(m => m.categoryId && allIds.includes(m.categoryId))
      }

      result[cat.id] = machines.reduce((sum, m) => sum + (repuestosCounts[m.id] || 0), 0)
    })
    return result
  }, [rootCategories, categories, activeMachines, repuestosCounts])

  // Conteo de máquinas por categoría raíz
  const machineCountPerRootCat = useMemo(() => {
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

  // Al cambiar de categoría raíz
  const handleCategoryChange = (catId: string) => {
    setActiveCatId(catId)
    setActiveSubcatId(null)
    onCategoryChange?.(catId)
  }

  // Seleccionar máquina
  const handleSelectMachine = (machine: Machine) => {
    setCurrentMachine(machine.id)
    const catId = machine.categoryId || 'maquinas-principales'
    const sub = categories.find(c => c.id === catId && c.parentId)
    onCategoryChange?.(sub?.parentId || catId)
  }

  // Sincronizar cuando cambia la máquina externamente
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

  return (
    <div className={`space-y-2 ${className}`}>
      {/* ═══ Row 1: Category tabs ═══ */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
        {rootCategories.map(cat => {
          const isActive = activeCatId === cat.id
          const mCount = machineCountPerRootCat[cat.id] || 0
          const rCount = countPerRootCat[cat.id] || 0

          return (
            <button
              key={cat.id}
              onClick={() => handleCategoryChange(cat.id)}
              className={`
                inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
                whitespace-nowrap transition-all border shrink-0
                ${isActive
                  ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                  : 'bg-card/60 border-border/40 text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                }
              `}
            >
              <span>{cat.nombre}</span>
              <span className={`
                text-[10px] rounded-full px-1.5 py-0.5 font-bold
                ${isActive ? 'bg-primary/20 text-primary' : 'bg-muted/80 text-muted-foreground/60'}
              `}>
                {mCount}
              </span>
              {rCount > 0 && (
                <span className="text-[10px] text-muted-foreground/50 font-normal">
                  · {rCount.toLocaleString('es-CL')} rep.
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ═══ Row 2: Subcategory tabs (si hay) ═══ */}
      {subcategories.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-thin">
          <button
            onClick={() => setActiveSubcatId(null)}
            className={`
              inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
              whitespace-nowrap transition-all border shrink-0
              ${!activeSubcatId
                ? 'bg-secondary/80 border-secondary text-secondary-foreground'
                : 'bg-transparent border-border/30 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/30'
              }
            `}
          >
            Todos
          </button>
          {subcategories.map(sc => {
            const isActive = activeSubcatId === sc.id
            const scMachines = activeMachines.filter(m => m.categoryId === sc.id)
            const scCount = scMachines.reduce((sum, m) => sum + (repuestosCounts[m.id] || 0), 0)

            return (
              <button
                key={sc.id}
                onClick={() => setActiveSubcatId(sc.id)}
                className={`
                  inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
                  whitespace-nowrap transition-all border shrink-0
                  ${isActive
                    ? 'bg-secondary/80 border-secondary text-secondary-foreground'
                    : 'bg-transparent border-border/30 text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/30'
                  }
                `}
              >
                <span>{sc.nombre}</span>
                <span className="text-[10px] opacity-60">({scMachines.length})</span>
                {scCount > 0 && (
                  <span className="text-[10px] opacity-40">· {scCount}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* ═══ Row 3: Machine chips ═══ */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Package className="h-3.5 w-3.5 text-muted-foreground/40 mr-0.5" />
        {visibleMachines.length === 0 && (
          <span className="text-xs text-muted-foreground/50 italic">Sin equipos en esta categoría</span>
        )}
        {visibleMachines.map(machine => (
          <MachineChip
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
