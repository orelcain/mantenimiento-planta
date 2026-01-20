/**
 * MachineSelector - Selector de máquinas tipo tabs
 * 
 * Características:
 * - Tabs horizontales con color de cada máquina
 * - Badge con cantidad de repuestos
 * - Indicador de máquina activa
 * - Scroll horizontal en móviles
 */

import { useCurrentMachine, useActiveMachines, useMachineContext } from '@/contexts/MachineContext';

interface MachineSelectorProps {
  repuestosCounts?: Record<string, number>; // { "baader-200": 202, "fishken": 7 }
  className?: string;
}

export function MachineSelector({ repuestosCounts, className = '' }: MachineSelectorProps) {
  const currentMachine = useCurrentMachine();
  const activeMachines = useActiveMachines();
  const { setCurrentMachine } = useMachineContext();

  if (activeMachines.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No hay máquinas configuradas</p>
        <p className="text-sm mt-2">Configure las máquinas en la sección de administración</p>
      </div>
    );
  }

  return (
    <div className={`border-b border-gray-200 ${className}`}>
      <nav className="flex space-x-2 overflow-x-auto pb-px" aria-label="Máquinas">
        {activeMachines.map((machine) => {
          const isActive = currentMachine?.id === machine.id;
          const count = repuestosCounts?.[machine.id] ?? 0;

          return (
            <button
              key={machine.id}
              onClick={() => setCurrentMachine(machine.id)}
              className={`
                relative px-4 py-3 min-w-[140px] text-sm font-medium rounded-t-lg
                transition-all duration-200
                ${
                  isActive
                    ? 'text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100'
                }
              `}
              style={{
                backgroundColor: isActive ? machine.color : undefined,
                borderBottomColor: isActive ? machine.color : undefined,
                borderBottomWidth: isActive ? '3px' : '0',
              }}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="flex items-center justify-center gap-2">
                <span>{machine.nombre}</span>
                {count > 0 && (
                  <span
                    className={`
                      inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
                      ${isActive ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}
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
