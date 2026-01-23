/**
 * MachineHierarchySelector.tsx
 * 
 * Selector jerárquico para ubicar nuevos equipos (motores, bombas, etc.)
 * USA LA JERARQUÍA TÉCNICA REAL del módulo Jerarquía (colección 'hierarchy')
 * NO usa machineCategories - esa es solo para clasificación de repuestos
 * 
 * Flujo: Empresa → Área → Sub-área → Sistema → Sub-sistema → Sección → Elemento
 */

import { useState, useMemo } from 'react';
import { ChevronRight, Loader2, MapPin } from 'lucide-react';
import { db } from '@/services/firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { useHierarchyTree } from '@/hooks/useHierarchy';
import type { HierarchyNodeWithChildren } from '@/types/hierarchy';
import type { Machine } from '@/types/repuestos';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

interface MachineHierarchySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMachineCreated?: (machine: Machine) => void;
  onCreateMachine?: (machine: Partial<Machine>) => Promise<void>;
  loading?: boolean;
  categoryId?: string; // Categoría de repuestos (motores-bombas, cintas, etc.) - se guarda en el equipo
}

export function MachineHierarchySelector({
  open,
  onOpenChange,
  onMachineCreated,
  onCreateMachine,
  loading = false,
  categoryId,
}: MachineHierarchySelectorProps) {
  // Usar el hook de jerarquía técnica REAL
  const { tree: hierarchyTree, loading: loadingHierarchy } = useHierarchyTree();
  
  // Estado del formulario - jerarquía dinámica
  const [selectedPath, setSelectedPath] = useState<string[]>([]); // IDs desde raíz hasta ubicación final
  const [selectedValue, setSelectedValue] = useState<string>(''); // Valor temporal del Select
  const [formData, setFormData] = useState({
    nombre: '',
    marca: '',
    modelo: '',
    descripcion: '',
  });

  // Aplanar el árbol para búsquedas rápidas
  const flatNodes = useMemo(() => {
    const result: HierarchyNodeWithChildren[] = [];
    const flatten = (nodes: HierarchyNodeWithChildren[]) => {
      for (const node of nodes) {
        result.push(node);
        if (node.children?.length) {
          flatten(node.children);
        }
      }
    };
    flatten(hierarchyTree);
    return result;
  }, [hierarchyTree]);

  // Obtener las opciones actuales basadas en el path seleccionado
  const currentOptions = useMemo(() => {
    if (selectedPath.length === 0) {
      // Sin selección: mostrar raíces (nivel 1)
      return hierarchyTree;
    }
    
    // Buscar el último nodo seleccionado y mostrar sus hijos
    const lastSelectedId = selectedPath[selectedPath.length - 1];
    const lastNode = flatNodes.find(n => n.id === lastSelectedId);
    return lastNode?.children || [];
  }, [hierarchyTree, flatNodes, selectedPath]);

  // Nodo final seleccionado (para mostrar ubicación)
  const selectedNode = useMemo(() => {
    if (selectedPath.length === 0) return null;
    const lastId = selectedPath[selectedPath.length - 1];
    return flatNodes.find(n => n.id === lastId) || null;
  }, [flatNodes, selectedPath]);

  // Construir el path completo para mostrar breadcrumb
  const pathNodes = useMemo(() => {
    return selectedPath.map(id => flatNodes.find(n => n.id === id)).filter(Boolean) as HierarchyNodeWithChildren[];
  }, [flatNodes, selectedPath]);

  const handleSubmit = async () => {
    // Validar que tenemos ubicación y nombre
    const hierarchyNodeId = selectedPath.length > 0 ? selectedPath[selectedPath.length - 1] : null;
    
    if (!formData.nombre) return;

    try {
      // Construir el path completo de nombres para referencia
      const hierarchyPath = pathNodes.map(n => n.nombre).join(' > ');
      
      const newMachine: Partial<Machine> = {
        nombre: formData.nombre,
        marca: formData.marca,
        modelo: formData.modelo,
        descripcion: formData.descripcion,
        categoryId: categoryId || undefined, // Categoría de repuestos (tipo de equipo)
        hierarchyNodeId: hierarchyNodeId || undefined, // ID del nodo en la jerarquía técnica
        hierarchyPath: hierarchyPath || undefined, // Path legible (para búsquedas/display)
        activa: true,
        color: '#3b82f6',
        createdAt: Timestamp.now() as any,
        updatedAt: Timestamp.now() as any,
      };

      if (onMachineCreated) {
        // Crear el equipo directamente en la BD
        const machinesCollection = collection(db, 'machines');
        const docRef = await addDoc(machinesCollection, newMachine);
        
        const createdMachine: Machine = {
          id: docRef.id,
          ...newMachine,
        } as Machine;
        
        onMachineCreated(createdMachine);
      } else if (onCreateMachine) {
        await onCreateMachine(newMachine);
      }

      onOpenChange(false);
      resetForm();
    } catch (err) {
      console.error('Error al crear máquina:', err);
    }
  };

  const resetForm = () => {
    setSelectedPath([]);
    setSelectedValue('');
    setFormData({ nombre: '', marca: '', modelo: '', descripcion: '' });
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedPath([...selectedPath, nodeId]);
    setSelectedValue('');
  };

  const handleGoBack = () => {
    setSelectedPath(prev => prev.slice(0, -1));
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  // Determinar si mostrar formulario (cuando no hay más hijos o se llegó a un nodo final)
  const showForm = selectedPath.length > 0 && (currentOptions.length === 0 || selectedPath.length >= 2);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agregar nuevo equipo</DialogTitle>
          <DialogDescription>
            Navega por la jerarquía técnica para ubicar el equipo
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* BREADCRUMB: Camino seleccionado */}
          {pathNodes.length > 0 && (
            <div className="space-y-2 p-3 bg-slate-800/50 rounded-lg">
              <Label className="text-xs uppercase tracking-wide text-slate-400">
                <MapPin className="h-3 w-3 inline mr-1" />
                Ubicación seleccionada:
              </Label>
              <div className="flex flex-wrap gap-1">
                {pathNodes.map((node, idx) => (
                  <span 
                    key={node.id} 
                    className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 rounded text-xs text-slate-200"
                  >
                    {node.nombre}
                    {idx < pathNodes.length - 1 && (
                      <ChevronRight className="h-3 w-3 text-slate-500" />
                    )}
                  </span>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoBack}
                className="w-full text-xs mt-2"
              >
                ← Volver un nivel
              </Button>
            </div>
          )}

          {/* SELECTOR: Mostrar siempre que haya opciones */}
          {(currentOptions.length > 0 || loadingHierarchy) && (
            <div className="space-y-2">
              <Label className="text-sm">
                {selectedPath.length === 0
                  ? 'Selecciona la empresa/planta:'
                  : `Nivel ${selectedPath.length + 1}: Selecciona siguiente ubicación`}
              </Label>
              {loadingHierarchy ? (
                <div className="flex items-center justify-center gap-2 p-4 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Cargando jerarquía...</span>
                </div>
              ) : (
                <Select value={selectedValue} onValueChange={handleSelectNode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una opción..." />
                  </SelectTrigger>
                  <SelectContent>
                    {currentOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.nombre}
                        {option.children && option.children.length > 0 && ' ➜'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Indicador de nodo final */}
              {selectedPath.length > 0 && currentOptions.length === 0 && (
                <p className="text-xs text-green-400">
                  ✓ Ubicación final alcanzada. Completa los detalles del equipo.
                </p>
              )}
            </div>
          )}

          {/* FORMULARIO DE DETALLES */}
          {showForm && !loadingHierarchy && (
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <div className="p-2 bg-green-900/20 rounded-lg border border-green-700/50">
                <p className="text-xs text-green-300">
                  📍 Ubicación: <strong>{selectedNode?.nombre || 'Sin ubicación'}</strong>
                </p>
                {categoryId && (
                  <p className="text-xs text-blue-300 mt-1">
                    📦 Categoría: <strong>{categoryId}</strong>
                  </p>
                )}
              </div>
              
              <div>
                <Label htmlFor="nombre">Nombre del equipo *</Label>
                <Input
                  id="nombre"
                  placeholder="ej: Motor SEW Principal"
                  value={formData.nombre}
                  onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="marca">Marca</Label>
                <Input
                  id="marca"
                  placeholder="ej: SEW, Siemens, etc."
                  value={formData.marca}
                  onChange={e => setFormData({ ...formData, marca: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="modelo">Modelo</Label>
                <Input
                  id="modelo"
                  placeholder="ej: IE3 90L"
                  value={formData.modelo}
                  onChange={e => setFormData({ ...formData, modelo: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="descripcion">Descripción</Label>
                <Input
                  id="descripcion"
                  placeholder="ej: Motor trifásico para bombeo"
                  value={formData.descripcion}
                  onChange={e => setFormData({ ...formData, descripcion: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Mensaje inicial si no hay jerarquía */}
          {!loadingHierarchy && hierarchyTree.length === 0 && (
            <div className="p-4 bg-yellow-900/20 rounded-lg border border-yellow-700/50 text-center">
              <p className="text-sm text-yellow-300">
                ⚠️ No hay jerarquía técnica configurada.
              </p>
              <p className="text-xs text-yellow-400 mt-1">
                Ve a Configuración → Jerarquía para crear la estructura.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          {showForm && (
            <Button
              onClick={handleSubmit}
              disabled={!formData.nombre || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creando...
                </>
              ) : (
                'Crear equipo'
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
