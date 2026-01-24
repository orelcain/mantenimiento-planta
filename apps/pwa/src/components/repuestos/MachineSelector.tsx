/**
 * MachineSelector - Selector de máquinas con navegación por subcategorías
 * 
 * Características:
 * - Dos niveles de navegación:
 *   1. Subcategorías (tabs seleccionables)
 *   2. Máquinas dentro de la subcategoría seleccionada
 * - Badge con cantidad de repuestos
 * - Scroll horizontal en móviles
 */

import { useState, useMemo, useEffect } from 'react';
import { Folder, ChevronDown } from 'lucide-react';
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext';
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories';
import type { Machine } from '@/types/repuestos';

interface MachineSelectorProps {
  repuestosCounts?: Record<string, number>;
  selectedCategoryId?: string | null;
  className?: string;
}

export function MachineSelector({ 
  repuestosCounts, 
  selectedCategoryId = null,
  className = '' 
}: MachineSelectorProps) {
  const currentMachine = useCurrentMachine();
  const activeMachines = useActiveMachines();
  const { setCurrentMachine } = useMachineContext();
  const { categories } = useMachineCategories();
  
  // Estado: subcategoría seleccionada (null = "Todos" / sin subcategoría)
  const [selectedSubcatId, setSelectedSubcatId] = useState<string | null>(null);

  // Obtener subcategorías de la categoría actual
  const subcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    return categories.filter(c => c.parentId === selectedCategoryId && c.activa);
  }, [categories, selectedCategoryId]);

  // IDs de subcategorías
  const subcategoryIds = useMemo(() => 
    subcategories.map(sc => sc.id), 
    [subcategories]
  );

  // Máquinas de la categoría principal (sin subcategoría)
  const directMachines = useMemo(() => {
    if (selectedCategoryId === 'maquinas-principales') {
      return activeMachines.filter((m) => !m.categoryId || m.categoryId === 'maquinas-principales');
    } else if (selectedCategoryId === null) {
      return activeMachines;
    } else {
      // Solo máquinas directamente en esta categoría (no en subcategorías)
      return activeMachines.filter((m) => m.categoryId === selectedCategoryId);
    }
  }, [activeMachines, selectedCategoryId]);

  // Máquinas de la subcategoría seleccionada
  const subcatMachines = useMemo(() => {
    if (!selectedSubcatId) return [];
    return activeMachines.filter((m) => m.categoryId === selectedSubcatId);
  }, [activeMachines, selectedSubcatId]);

  // Máquinas a mostrar según la selección
  const machinesToShow = useMemo(() => {
    if (selectedSubcatId) {
      return subcatMachines;
    }
    // Si no hay subcategoría seleccionada, mostrar las directas
    return directMachines;
  }, [selectedSubcatId, subcatMachines, directMachines]);

  // Auto-seleccionar primera máquina visible si la actual no pertenece
  useEffect(() => {
    if (machinesToShow.length === 0) return;
    const inList = currentMachine && machinesToShow.some((m) => m.id === currentMachine.id);
    if (!inList) {
      setCurrentMachine(machinesToShow[0].id);
    }
  }, [machinesToShow, currentMachine, setCurrentMachine]);

  // Contar máquinas por subcategoría
  const machineCountBySubcat = useMemo(() => {
    const counts: Record<string, number> = {};
    subcategories.forEach(sc => {
      counts[sc.id] = activeMachines.filter(m => m.categoryId === sc.id).length;
    });
    return counts;
  }, [subcategories, activeMachines]);

  // Reset subcategoría seleccionada cuando cambia la categoría principal
  useEffect(() => {
    setSelectedSubcatId(null);
  }, [selectedCategoryId]);

  // Si no hay máquinas ni subcategorías
  if (machinesToShow.length === 0 && subcategories.length === 0) {
    const message = selectedCategoryId === null
      ? 'No hay máquinas configuradas'
      : 'No hay máquinas en esta categoría';
    
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{message}</p>
      </div>
    );
  }

  return (
    <div className={`bg-slate-900 ${className}`}>
      {/* NIVEL 1: Subcategorías (si existen) */}
      {subcategories.length > 0 && (
        <div className="border-b border-slate-700 px-2 py-1.5">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {/* Opción "Todos" o "Sin ubicación" */}
            {directMachines.length > 0 && (
              <button
                onClick={() => setSelectedSubcatId(null)}
                className={`
                  px-2.5 py-1 text-xs rounded transition-all shrink-0
                  ${!selectedSubcatId
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                  }
                `}
              >
                Todos ({directMachines.length})
              </button>
            )}
            
            {/* Subcategorías */}
            {subcategories.map((subcat) => {
              const count = machineCountBySubcat[subcat.id] || 0;
              const isSelected = selectedSubcatId === subcat.id;
              
              return (
                <button
                  key={subcat.id}
                  onClick={() => setSelectedSubcatId(subcat.id)}
                  className={`
                    px-2.5 py-1 text-xs rounded transition-all shrink-0 flex items-center gap-1
                    ${isSelected
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                    }
                  `}
                >
                  <Folder className="h-3 w-3" />
                  {subcat.nombre}
                  {count > 0 && (
                    <span className={`${isSelected ? 'text-amber-200' : 'text-slate-500'}`}>
                      ({count})
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* NIVEL 2: Máquinas */}
      {machinesToShow.length > 0 ? (
        <div className="border-b border-slate-700">
          <nav className="flex overflow-x-auto px-1 py-1 gap-1" aria-label="Máquinas">
            {machinesToShow.map((machine) => {
              const isActive = currentMachine?.id === machine.id;
              const count = repuestosCounts?.[machine.id] ?? 0;

              return (
                <button
                  key={machine.id}
                  onClick={() => setCurrentMachine(machine.id)}
                  className={`
                    relative px-3 py-1.5 text-xs font-medium
                    transition-all duration-200 rounded border-b-2 shrink-0
                    ${
                      isActive
                        ? 'text-slate-100 bg-slate-700/60'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-slate-800/50 border-transparent'
                    }
                  `}
                  style={{
                    borderBottomColor: isActive ? machine.color || '#94a3b8' : 'transparent',
                  }}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate max-w-[150px]">{machine.nombre}</span>
                    {count > 0 && (
                      <span
                        className={`
                          inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full
                          ${isActive ? 'bg-white/20 text-white' : 'bg-slate-700 text-gray-300'}
                        `}
                      >
                        {count}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </nav>
        </div>
      ) : selectedSubcatId ? (
        <div className="text-center py-4 text-gray-500 text-sm border-b border-slate-700">
          <p>No hay equipos en esta ubicación</p>
          <p className="text-xs mt-1 text-blue-400">Usa "Nuevo equipo" para agregar.</p>
        </div>
      ) : null}
    </div>
  );
}

