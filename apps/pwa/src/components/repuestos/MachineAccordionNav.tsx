/**
 * MachineAccordionNav — Navegación tipo acordeón por Categoría → Máquina
 *
 * Cada categoría raíz se muestra como una sección colapsable.
 * Al expandir se ven las máquinas como tarjetas en grid.
 * Click en una tarjeta selecciona la máquina y muestra sus repuestos.
 *
 * Si la categoría tiene subcategorías, se muestran como sub-secciones
 * con un header secundario y su propio grid de máquinas.
 */

import { useState, useMemo, useEffect } from 'react'
import { ChevronDown, ChevronRight, Package, Wrench, FolderOpen } from 'lucide-react'
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import type { Machine, MachineCategory } from '@/types/repuestos'

interface MachineAccordionNavProps {
  repuestosCounts?: Record<string, number>
  className?: string
  /** Callback para que el padre sepa qué categoría está seleccionada */
  onCategoryChange?: (categoryId: string | null) => void
}

/** Card de una máquina individual */
function MachineCard({
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
  const accentColor = machine.color || '#3b82f6'

  return (
    <button
      onClick={onClick}
      className={`
        group relative flex flex-col items-start p-3 rounded-xl border text-left w-full
        transition-all duration-200 min-w-0
        ${isActive
          ? 'bg-primary/8 border-primary/40 ring-1 ring-primary/20 shadow-sm'
          : 'bg-card/60 border-border/60 hover:bg-muted/40 hover:border-border hover:shadow-sm'
        }
      `}
    >
      {/* Color accent bar */}
      <div
        className="absolute top-0 left-3 right-3 h-[2px] rounded-b-full opacity-80"
        style={{ backgroundColor: isActive ? accentColor : 'transparent' }}
      />

      <div className="flex items-center gap-2.5 w-full min-w-0">
        <div
          className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          style={{
            backgroundColor: accentColor + (isActive ? '25' : '12'),
          }}
        >
          <Wrench className="h-4 w-4" style={{ color: accentColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-medium truncate ${isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
            {machine.nombre}
          </div>
          {(machine.marca || machine.modelo) && (
            <div className="text-[10px] text-muted-foreground/70 truncate">
              {[machine.marca, machine.modelo].filter(Boolean).join(' ')}
            </div>
          )}
        </div>
      </div>

      {/* Badge de conteo */}
      <div className="flex items-center gap-1.5 mt-2 w-full">
        <Package className="h-3 w-3 text-muted-foreground/50" />
        <span className={`text-[11px] font-medium ${isActive ? 'text-primary' : 'text-muted-foreground/70'}`}>
          {count} repuesto{count !== 1 ? 's' : ''}
        </span>
      </div>
    </button>
  )
}

/** Header de categoría colapsable */
function CategoryHeader({
  category,
  isExpanded,
  machineCount,
  totalRepuestos,
  onToggle,
}: {
  category: MachineCategory
  isExpanded: boolean
  machineCount: number
  totalRepuestos: number
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl border
        transition-all duration-200
        ${isExpanded
          ? 'bg-muted/50 border-border shadow-sm'
          : 'bg-card/40 border-border/40 hover:bg-muted/30 hover:border-border/60'
        }
      `}
    >
      {/* Expand icon */}
      <div className={`shrink-0 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
        <ChevronDown className="h-4 w-4" />
      </div>

      {/* Category icon */}
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <FolderOpen className={`h-4 w-4 ${isExpanded ? 'text-primary' : 'text-muted-foreground'}`} />
      </div>

      {/* Category name + info */}
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${isExpanded ? 'text-foreground' : 'text-muted-foreground'}`}>
          {category.nombre}
        </div>
        <div className="text-[11px] text-muted-foreground/70">
          {machineCount} equipo{machineCount !== 1 ? 's' : ''}
          {totalRepuestos > 0 && (
            <span className="ml-1.5">· {totalRepuestos.toLocaleString('es-CL')} repuestos</span>
          )}
        </div>
      </div>

      {/* Arrow indicator */}
      <ChevronRight className={`h-4 w-4 text-muted-foreground/40 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
    </button>
  )
}

/** Sub-header para subcategorías dentro de una categoría expandida */
function SubcategoryHeader({ name, count }: { name: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-1.5">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/60 shrink-0">
        {name}
      </span>
      <span className="text-[10px] text-muted-foreground/40">({count})</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  )
}

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

  // Determinar categoría expandida default (la que contiene la máquina actual)
  const getDefaultExpanded = (): Set<string> => {
    if (!currentMachine) {
      return new Set(rootCategories.length > 0 ? [rootCategories[0]!.id] : [])
    }
    const catId = currentMachine.categoryId || 'maquinas-principales'
    // Puede estar en una subcategoría
    const subcat = categories.find(c => c.id === catId && c.parentId)
    if (subcat?.parentId) return new Set([subcat.parentId])
    return new Set([catId])
  }

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(getDefaultExpanded)

  // Máquinas por categoría (incluye directas + en subcategorías)
  const machinesByCategory = useMemo(() => {
    const result: Record<string, { direct: Machine[]; subcats: { category: MachineCategory; machines: Machine[] }[] }> = {}

    rootCategories.forEach(cat => {
      const subcats = categories
        .filter(c => c.parentId === cat.id && c.activa)
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

      // Máquinas directas en la categoría
      let direct: Machine[]
      if (cat.id === 'maquinas-principales') {
        direct = activeMachines.filter(m => !m.categoryId || m.categoryId === 'maquinas-principales')
      } else {
        direct = activeMachines.filter(m => m.categoryId === cat.id)
      }

      // Máquinas en subcategorías
      const subcatData = subcats.map(sc => ({
        category: sc,
        machines: activeMachines.filter(m => m.categoryId === sc.id),
      })).filter(sd => sd.machines.length > 0)

      result[cat.id] = { direct, subcats: subcatData }
    })

    return result
  }, [rootCategories, categories, activeMachines])

  // Conteo total de repuestos por categoría
  const repuestosPerCategory = useMemo(() => {
    const result: Record<string, number> = {}
    rootCategories.forEach(cat => {
      const data = machinesByCategory[cat.id]
      if (!data) { result[cat.id] = 0; return }
      let total = 0
      data.direct.forEach(m => { total += repuestosCounts[m.id] || 0 })
      data.subcats.forEach(sc => sc.machines.forEach(m => { total += repuestosCounts[m.id] || 0 }))
      result[cat.id] = total
    })
    return result
  }, [rootCategories, machinesByCategory, repuestosCounts])

  // Conteo de máquinas por categoría
  const machineCountPerCategory = useMemo(() => {
    const result: Record<string, number> = {}
    rootCategories.forEach(cat => {
      const data = machinesByCategory[cat.id]
      if (!data) { result[cat.id] = 0; return }
      result[cat.id] = data.direct.length + data.subcats.reduce((sum, sc) => sum + sc.machines.length, 0)
    })
    return result
  }, [rootCategories, machinesByCategory])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  const handleSelectMachine = (machine: Machine) => {
    setCurrentMachine(machine.id)
    // Notificar categoría
    const catId = machine.categoryId || 'maquinas-principales'
    const subcat = categories.find(c => c.id === catId && c.parentId)
    onCategoryChange?.(subcat?.parentId || catId)
  }

  // Auto-expandir categoría de la máquina actual si cambia externamente
  useEffect(() => {
    if (!currentMachine) return
    const catId = currentMachine.categoryId || 'maquinas-principales'
    const subcat = categories.find(c => c.id === catId && c.parentId)
    const rootId = subcat?.parentId || catId
    setExpandedCategories(prev => {
      if (prev.has(rootId)) return prev
      return new Set([...prev, rootId])
    })
  }, [currentMachine, categories])

  if (rootCategories.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No hay categorías configuradas.
      </div>
    )
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {rootCategories.map(cat => {
        const isExpanded = expandedCategories.has(cat.id)
        const data = machinesByCategory[cat.id]
        const machineCount = machineCountPerCategory[cat.id] || 0
        const totalRepuestos = repuestosPerCategory[cat.id] || 0

        return (
          <div key={cat.id} className="transition-all duration-200">
            <CategoryHeader
              category={cat}
              isExpanded={isExpanded}
              machineCount={machineCount}
              totalRepuestos={totalRepuestos}
              onToggle={() => toggleCategory(cat.id)}
            />

            {isExpanded && data && (
              <div className="mt-2 ml-2 mr-1 mb-1 animate-in slide-in-from-top-2 duration-200">
                {/* Máquinas directas */}
                {data.direct.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 px-1">
                    {data.direct.map(machine => (
                      <MachineCard
                        key={machine.id}
                        machine={machine}
                        isActive={currentMachine?.id === machine.id}
                        count={repuestosCounts[machine.id] || 0}
                        onClick={() => handleSelectMachine(machine)}
                      />
                    ))}
                  </div>
                )}

                {/* Subcategorías con sus máquinas */}
                {data.subcats.map(sc => (
                  <div key={sc.category.id}>
                    <SubcategoryHeader
                      name={sc.category.nombre}
                      count={sc.machines.length}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 px-1">
                      {sc.machines.map(machine => (
                        <MachineCard
                          key={machine.id}
                          machine={machine}
                          isActive={currentMachine?.id === machine.id}
                          count={repuestosCounts[machine.id] || 0}
                          onClick={() => handleSelectMachine(machine)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Si no hay máquinas en ningún nivel */}
                {data.direct.length === 0 && data.subcats.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground/60 text-sm">
                    Sin equipos en esta categoría
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
