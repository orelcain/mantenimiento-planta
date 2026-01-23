/**
 * MachineSelector - Selector de máquinas con soporte para subcategorías
 * 
 * Características:
 * - Tabs horizontales con color de cada máquina
 * - Badge con cantidad de repuestos
 * - Soporte para subcategorías (muestra equipos de la categoría + subcategorías)
 * - Indicador de subcategoría como prefijo
 * - Scroll horizontal en móviles
 * - Filtrado por categoría
 */

import { useMemo } from 'react';
import { Folder, ChevronRight } from 'lucide-react';
import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext';
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories';
import type { Machine } from '@/types/repuestos';

interface MachineSelectorProps {
  repuestosCounts?: Record<string, number>; // { "baader-200": 202, "fishken": 7 }
  selectedCategoryId?: string | null; // "maquinas-principales" = máquinas sin categoría
  className?: string;
}

interface MachineGroup {
  subcategoryId: string | null;
  subcategoryName: string | null;
  machines: Machine[];
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

  // Obtener todas las subcategorías de la categoría seleccionada
  const subcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    return categories.filter(c => c.parentId === selectedCategoryId && c.activa);
  }, [categories, selectedCategoryId]);

  // IDs de subcategorías para filtrar
  const subcategoryIds = useMemo(() => 
    subcategories.map(sc => sc.id), 
    [subcategories]
  );

  // Filtrar y agrupar máquinas
  const machineGroups = useMemo(() => {
    let filtered: Machine[] = [];

    if (selectedCategoryId === 'maquinas-principales') {
      // Máquinas principales (sin categoría o con categoryId = maquinas-principales)
      filtered = activeMachines.filter((m) => !m.categoryId || m.categoryId === 'maquinas-principales');
    } else if (selectedCategoryId === null) {
      // Todas las máquinas
      filtered = activeMachines;
    } else {
      // Máquinas de esta categoría + máquinas de sus subcategorías
      filtered = activeMachines.filter((m) => 
        m.categoryId === selectedCategoryId || 
        subcategoryIds.includes(m.categoryId || '')
      );
    }

    // Agrupar por subcategoría
    const groups: MachineGroup[] = [];
    
    // Primero: máquinas directamente en la categoría (sin subcategoría)
    const directMachines = filtered.filter(m => 
      m.categoryId === selectedCategoryId || 
      m.categoryId === 'maquinas-principales' ||
      !m.categoryId
    );
    
    if (directMachines.length > 0) {
      groups.push({
        subcategoryId: null,
        subcategoryName: null,
        machines: directMachines,
      });
    }

    // Luego: máquinas agrupadas por subcategoría
    subcategories.forEach(subcat => {
      const subcatMachines = filtered.filter(m => m.categoryId === subcat.id);
      if (subcatMachines.length > 0) {
        groups.push({
          subcategoryId: subcat.id,
          subcategoryName: subcat.nombre,
          machines: subcatMachines,
        });
      }
    });

    return groups;
  }, [activeMachines, selectedCategoryId, subcategoryIds, subcategories]);

  // Total de máquinas filtradas
  const totalMachines = machineGroups.reduce((sum, g) => sum + g.machines.length, 0);

  if (totalMachines === 0) {
    const message = selectedCategoryId === null
      ? 'No hay máquinas configuradas'
      : 'No hay máquinas en esta categoría';
    
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{message}</p>
        {selectedCategoryId !== null && subcategories.length > 0 && (
          <p className="text-sm mt-2 text-blue-400">
            Hay {subcategories.length} subcategoría{subcategories.length > 1 ? 's' : ''} sin equipos. 
            Usa "Nuevo equipo" para agregar.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={`border-b border-slate-700 bg-slate-900 ${className}`}>
      <nav className="flex flex-wrap gap-1 overflow-x-auto pb-px p-1" aria-label="Máquinas">
        {machineGroups.map((group, groupIdx) => (
          <div key={group.subcategoryId || 'direct'} className="flex items-center gap-1">
            {/* Separador visual entre grupos */}
            {groupIdx > 0 && (
              <div className="h-8 w-px bg-slate-600 mx-1" />
            )}
            
            {/* Indicador de subcategoría */}
            {group.subcategoryName && (
              <div className="flex items-center gap-1 px-2 py-1 bg-slate-800 rounded text-xs text-slate-400">
                <Folder className="h-3 w-3" />
                <span>{group.subcategoryName}</span>
                <ChevronRight className="h-3 w-3" />
              </div>
            )}
            
            {/* Máquinas del grupo */}
            {group.machines.map((machine) => {
              const isActive = currentMachine?.id === machine.id;
              const count = repuestosCounts?.[machine.id] ?? 0;

              return (
                <button
                  key={machine.id}
                  onClick={() => setCurrentMachine(machine.id)}
                  className={`
                    relative px-3 py-2 min-w-[100px] text-sm font-medium
                    transition-all duration-200 border-b-2 rounded-t
                    ${
                      isActive
                        ? 'text-slate-200 bg-slate-700/50 hover:opacity-90'
                        : 'text-gray-400 hover:text-gray-300 hover:bg-slate-800/50 border-transparent'
                    }
                  `}
                  style={{
                    borderBottomColor: isActive ? machine.color || '#94a3b8' : 'transparent',
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  title={group.subcategoryName ? `${group.subcategoryName} > ${machine.nombre}` : machine.nombre}
                >
                  <div className="flex items-center justify-center gap-2">
                    <span className="truncate max-w-[120px]">{machine.nombre}</span>
                    {count > 0 && (
                      <span
                        className={`
                          inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold rounded-full
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
          </div>
        ))}
      </nav>
      
      {/* Indicador de subcategorías disponibles */}
      {subcategories.length > 0 && (
        <div className="px-2 py-1 bg-slate-800/30 border-t border-slate-700/50">
          <p className="text-xs text-slate-500">
            📁 {subcategories.length} subcategoría{subcategories.length > 1 ? 's' : ''}: {subcategories.map(s => s.nombre).join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

