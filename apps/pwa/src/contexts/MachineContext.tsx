/**
 * MachineContext - Gestión global de máquinas
 * 
 * Provee:
 * - Lista de todas las máquinas disponibles
 * - Máquina actualmente seleccionada
 * - Funciones para cambiar entre máquinas
 * - Persistencia de la selección en localStorage
 * 
 * Usado por:
 * - RepuestosDashboard (tabs de máquinas)
 * - useRepuestos (colección dinámica por máquina)
 * - useTags (tags por máquina)
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useMachines } from '@/hooks/repuestos/useMachines';
import type { Machine, MachineContextType } from '@/types/repuestos';

const MachineContext = createContext<MachineContextType | null>(null);

interface MachineProviderProps {
  children: ReactNode;
}

const STORAGE_KEY = 'repuestos:selectedMachineId';

export function MachineProvider({ children }: MachineProviderProps) {
  const { machines, loading: machinesLoading } = useMachines();
  const [currentMachine, setCurrentMachineState] = useState<Machine | null>(null);
  const [loading, setLoading] = useState(true);

  // Inicializar máquina al cargar
  useEffect(() => {
    if (machinesLoading) return;

    // Si no hay máquinas, no hay nada que hacer
    if (machines.length === 0) {
      setCurrentMachineState(null);
      setLoading(false);
      return;
    }

    // Intentar cargar desde localStorage
    const storedMachineId = localStorage.getItem(STORAGE_KEY);
    
    if (storedMachineId) {
      const storedMachine = machines.find(m => m.id === storedMachineId);
      if (storedMachine && storedMachine.activa) {
        setCurrentMachineState(storedMachine);
        setLoading(false);
        return;
      }
    }

    // Fallback: seleccionar la primera máquina activa
    const firstActive = machines.find(m => m.activa);
    if (firstActive) {
      setCurrentMachineState(firstActive);
      localStorage.setItem(STORAGE_KEY, firstActive.id);
    }

    setLoading(false);
  }, [machines, machinesLoading]);

  // Cambiar máquina actual (busca en lista cargada)
  const setCurrentMachine = async (machineId: string) => {
    const machine = machines.find(m => m.id === machineId);
    
    if (!machine) {
      // Si no existe en la lista, puede ser una máquina recién creada
      // El listener de Firestore actualizará la lista automáticamente
      console.warn(`Machine not found in current list: ${machineId} - waiting for refresh...`);
      localStorage.setItem(STORAGE_KEY, machineId); // Guardar para auto-selección cuando se actualice
      return;
    }

    if (!machine.activa) {
      console.warn(`Machine is not active: ${machineId}`);
      // Permitir selección de máquinas archivadas si es necesario
    }

    setCurrentMachineState(machine);
    localStorage.setItem(STORAGE_KEY, machineId);
    
    console.log(`✅ Switched to machine: ${machine.nombre} (${machineId})`);
  };

  // Establecer máquina directamente (útil después de crear una nueva)
  const setCurrentMachineDirect = (machine: Machine) => {
    setCurrentMachineState(machine);
    localStorage.setItem(STORAGE_KEY, machine.id);
    console.log(`✅ Set machine directly: ${machine.nombre} (${machine.id})`);
  };

  const value: MachineContextType = {
    currentMachine,
    machines,
    loading: loading || machinesLoading,
    setCurrentMachine,
    setCurrentMachineDirect,
  };

  return (
    <MachineContext.Provider value={value}>
      {children}
    </MachineContext.Provider>
  );
}

/**
 * Hook para usar el contexto de máquinas
 * Lanza error si se usa fuera del provider
 */
export function useMachineContext(): MachineContextType {
  const context = useContext(MachineContext);
  
  if (!context) {
    throw new Error('useMachineContext must be used within MachineProvider');
  }
  
  return context;
}

/**
 * Hook simplificado para obtener solo la máquina actual
 */
export function useCurrentMachine(): Machine | null {
  const { currentMachine } = useMachineContext();
  return currentMachine;
}

/**
 * Hook para obtener todas las máquinas activas
 */
export function useActiveMachines(): Machine[] {
  const { machines } = useMachineContext();
  return machines.filter(m => m.activa);
}
