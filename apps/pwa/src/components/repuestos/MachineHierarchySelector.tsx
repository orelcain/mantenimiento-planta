/**
 * MachineHierarchySelector.tsx
 * 
 * Selector jerárquico para ubicar nuevos motores/bombas
 * Flujo: Nivel 1 (Área) → Nivel 2 (Subárea) → Nivel 3 (ubicación final)
 */

import { useState, useEffect } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { db } from '@/services/firebase';
import { collection, getDocs, Timestamp, addDoc } from 'firebase/firestore';
import type { MachineCategory, Machine } from '@/types/repuestos';
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
  categoryId?: string;
}

export function MachineHierarchySelector({
  open,
  onOpenChange,
  onMachineCreated,
  onCreateMachine,
  loading = false,
  categoryId,
}: MachineHierarchySelectorProps) {
  const [categories, setCategories] = useState<MachineCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Estado del formulario - jerarquía dinámica
  const [selectedPath, setSelectedPath] = useState<string[]>([]); // Camino desde raíz hasta ubicación final
  const [selectedValue, setSelectedValue] = useState<string>(''); // Valor temporal del Select
  const [formData, setFormData] = useState({
    nombre: '',
    marca: '',
    modelo: '',
    descripcion: '',
  });

  // Cargar categorías e inicializar con categoryId si se proporciona
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true);
        const snapshot = await getDocs(collection(db, 'machineCategories'));
        const cats = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<MachineCategory, 'id'>),
        })) as MachineCategory[];
        
        // Ordenar por nivel y orden
        cats.sort((a, b) => {
          const levelDiff = (a.nivel ?? 0) - (b.nivel ?? 0);
          if (levelDiff !== 0) return levelDiff;
          return (a.orden ?? 0) - (b.orden ?? 0);
        });

        setCategories(cats);
      } catch (err) {
        console.error('Error al cargar categorías:', err);
      } finally {
        setLoadingCategories(false);
      }
    };

    if (open) {
      loadCategories();
    }
  }, [open]);

  // Obtener hijos del nodo actual en la jerarquía
  const baseParentId = categoryId || null;
  const currentParentId = selectedPath.length > 0 
    ? selectedPath[selectedPath.length - 1] 
    : baseParentId;
  const currentChildren = categories.filter((c) => c.parentId === currentParentId);

  // Categoría seleccionada final (el nodo más profundo en el camino)
  const selectedCategory = selectedPath.length > 0 
    ? categories.find((c) => c.id === selectedPath[selectedPath.length - 1])
    : null;

  // Si no hay nodos raíz en el camino, mostrar raíces (sin padre) o hijos de categoryId
  const rootCategories = categories.filter((c) => !c.parentId);
  const optionsToShow = selectedPath.length === 0 
    ? (categoryId ? currentChildren : rootCategories)
    : currentChildren;

  const handleSubmit = async () => {
    // Si hay selectedPath, usar el último nodo como ubicación final
    // Si no hay selectedPath pero hay categoryId, usar categoryId directamente
    // Si no hay ninguno, no proceder
    const targetLocationId = selectedPath.length > 0 
      ? selectedPath[selectedPath.length - 1]
      : categoryId;
    
    if (!targetLocationId || !formData.nombre) return;

    try {
      const newMachine: Partial<Machine> = {
        nombre: formData.nombre,
        marca: formData.marca,
        modelo: formData.modelo,
        descripcion: formData.descripcion,
        categoryId: categoryId || targetLocationId, // Si hay categoryId implícita, usarla; si no, usar el nodo seleccionado
        activa: true,
        color: '#3b82f6',
        createdAt: Timestamp.now() as any,
        updatedAt: Timestamp.now() as any,
      };

      // Si se proporciona onMachineCreated, usarla directamente
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
        // Usar callback si se proporciona
        await onCreateMachine(newMachine);
      }

      onOpenChange(false);
      resetForm();
    } catch (err) {
      console.error('Error al crear máquina:', err);
    }
  };

  const resetForm = () => {
    setSelectedPath([]); // Empezar desde raíz (o hijos de categoryId si se proporciona)
    setSelectedValue('');
    setFormData({ nombre: '', marca: '', modelo: '', descripcion: '' });
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedPath([...selectedPath, nodeId]);
    setSelectedValue(''); // Limpiar el select
  };

  const handleGoBack = () => {
    setSelectedPath((prev) => prev.slice(0, -1));
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar nuevo equipo</DialogTitle>
          <DialogDescription>
            Selecciona la ubicación del equipo según la jerarquía técnica
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* CAMINO SELECCIONADO: mostrar cuando hay selecciones */}
          {selectedPath.length > 0 && (
            <div className="space-y-2 p-2 bg-slate-800/50 rounded-lg">
              <Label className="text-xs uppercase tracking-wide">Camino seleccionado:</Label>
              <div className="flex flex-wrap gap-1">
                {selectedPath.map((nodeId, idx) => {
                  const node = categories.find((c) => c.id === nodeId);
                  return (
                    <span key={nodeId} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 rounded text-xs text-slate-200">
                      {node?.nombre || 'Desconocido'}
                      {idx < selectedPath.length - 1 && (
                        <ChevronRight className="h-3 w-3" />
                      )}
                    </span>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoBack}
                className="w-full text-xs"
              >
                ← Volver un nivel
              </Button>
            </div>
          )}

          {/* SELECTOR: solo si hay opciones disponibles */}
          {optionsToShow.length > 0 && !loadingCategories && (
            <div className="space-y-2">
              <Label className="text-sm">
                {categoryId
                  ? 'Selecciona la ubicación dentro de la jerarquía:'
                  : selectedPath.length === 0
                  ? 'Selecciona el punto de partida:'
                  : `Selecciona el siguiente nivel (${selectedPath.length} nivel${selectedPath.length > 1 ? 'es' : ''}):`}
              </Label>
              <Select value={selectedValue} onValueChange={handleSelectNode}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una opción..." />
                </SelectTrigger>
                <SelectContent>
                  {optionsToShow.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.nombre}
                      {categories.some((c) => c.parentId === option.id) && ' ➜'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Botones de acción */}
              {selectedPath.length > 0 && currentChildren.length === 0 && (
                <p className="text-xs text-green-400">
                  ✓ Ubicación final. Completa los detalles del equipo abajo.
                </p>
              )}
            </div>
          )}

          {/* LOADING */}
          {loadingCategories && (
            <div className="flex items-center justify-center gap-2 p-4 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Cargando opciones...</span>
            </div>
          )}

          {/* FORMULARIO DE DETALLES: mostrar cuando no hay más opciones O cuando ya se seleccionó algo */}
          {!loadingCategories && (optionsToShow.length === 0 || selectedPath.length > 0) && (
            <div className="space-y-3 pt-4 border-t">
              {selectedPath.length > 0 && (
                <div className="p-2 bg-green-900/20 rounded-lg border border-green-700/50">
                  <p className="text-xs text-green-300">
                    Ubicación: <strong>{selectedCategory?.nombre || 'Desconocida'}</strong>
                  </p>
                </div>
              )}
              {optionsToShow.length === 0 && categoryId && selectedPath.length === 0 && (
                <div className="p-2 bg-blue-900/20 rounded-lg border border-blue-700/50">
                  <p className="text-xs text-blue-300">
                    Categoría: <strong>{categories.find(c => c.id === categoryId)?.nombre || 'Sin jerarquía'}</strong>
                  </p>
                </div>
              )}
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
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          {(selectedPath.length > 0 || optionsToShow.length === 0) && (
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
