/**
 * MachineSelector - Selector de máquinas tipo tabs
 * 
 * Características:
 * - Tabs horizontales con color de cada máquina
 * - Badge con cantidad de repuestos
 * - Indicador de máquina activa
 * - Scroll horizontal en móviles
 * - Filtrado por categoría
 */

import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext';

interface MachineSelectorProps {
  repuestosCounts?: Record<string, number>; // { "baader-200": 202, "fishken": 7 }
  selectedCategoryId?: string | null; // null = "Todas"
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

  // Filtrar máquinas por categoría seleccionada
  const filteredMachines = selectedCategoryId === null
    ? activeMachines
    : activeMachines.filter((m) => m.categoryId === selectedCategoryId);

  if (filteredMachines.length === 0) {
    const message = selectedCategoryId === null
      ? 'No hay máquinas configuradas'
      : 'No hay máquinas en esta categoría';
    
    return (
      <div className="text-center py-8 text-gray-500">
        <p>{message}</p>
        {selectedCategoryId === null && (
          <p className="text-sm mt-2">Configure las máquinas en la sección de administración</p>
        )}
      </div>
    );
  }

  return (
    <div className={`border-b border-slate-700 bg-slate-900 ${className}`}>
      <nav className="flex space-x-2 overflow-x-auto pb-px" aria-label="Máquinas">
        {filteredMachines.map((machine) => {
          const isActive = currentMachine?.id === machine.id;
          const count = repuestosCounts?.[machine.id] ?? 0;

          return (
            <button
              key={machine.id}
              onClick={() => setCurrentMachine(machine.id)}
              className={`
                relative px-4 py-3 min-w-[140px] text-sm font-medium
                transition-all duration-200 border-b-3
                ${
                  isActive
                    ? 'text-slate-200 hover:opacity-90'
                    : 'text-gray-400 hover:text-gray-300 hover:bg-slate-800/50'
                }
              `}
              style={{
                borderBottomColor: isActive ? machine.color || '#94a3b8' : 'transparent',
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="flex items-center justify-center gap-2">
                <span>{machine.nombre}</span>
                {count > 0 && (
                  <span
                    className={`
                      inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
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
  );
}

