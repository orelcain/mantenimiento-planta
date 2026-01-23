/**
 * MachineHierarchySelector.tsx
 * 
 * Selector jerárquico para ubicar nuevos motores/bombas
 * Flujo: Nivel 1 (Área) → Nivel 2 (Subárea) → Nivel 3 (ubicación final)
 */

import { useState, useEffect } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { db } from '@/services/firebase';
import { collection, query, where, getDocs, Timestamp, addDoc } from 'firebase/firestore';
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
}

export function MachineHierarchySelector({
  open,
  onOpenChange,
  onMachineCreated,
  onCreateMachine,
  loading = false,
}: MachineHierarchySelectorProps) {
  const [categories, setCategories] = useState<MachineCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Estado del formulario
  const [step, setStep] = useState<'area' | 'subarea' | 'details'>('area');
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedSubareaId, setSelectedSubareaId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [formData, setFormData] = useState({
    nombre: '',
    marca: '',
    modelo: '',
    descripcion: '',
  });

  // Cargar categorías
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setLoadingCategories(true);
        // Cargar TODAS las categorías (sin filtrar por activa)
        // porque la jerarquía puede tener categorías inactivas pero que siguen siendo válidas
        const q = query(
          collection(db, 'machineCategories')
        );
        const snapshot = await getDocs(q);
        const cats = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
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

  // Nivel 1: áreas (tomamos nodos sin padre para mostrar raíz técnica)
  const areas = categories.filter((c) => !c.parentId);

  // Nivel 2: subáreas hijas del área seleccionada
  const subareas = categories.filter((c) => c.parentId === selectedAreaId);

  // Nivel 3: ubicaciones hijas de la subárea seleccionada (si existen)
  const locations = categories.filter((c) => c.parentId === selectedSubareaId);

  // Categoría seleccionada final (toma el nivel más profundo elegido)
  const selectedCategory = categories.find((c) => c.id === (selectedLocationId || selectedSubareaId || selectedAreaId));

  const handleSubmit = async () => {
    const targetCategoryId = selectedLocationId || selectedSubareaId || selectedAreaId;
    if (!targetCategoryId || !formData.nombre) return;

    try {
      const newMachine: Partial<Machine> = {
        nombre: formData.nombre,
        marca: formData.marca,
        modelo: formData.modelo,
        descripcion: formData.descripcion,
        categoryId: targetCategoryId,
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
    setStep('area');
    setSelectedAreaId('');
    setSelectedSubareaId('');
    setSelectedLocationId('');
    setFormData({ nombre: '', marca: '', modelo: '', descripcion: '' });
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
          {/* PASO 1: Seleccionar Área (Nivel 1) */}
          {(step === 'area' || !selectedAreaId) && (
            <div className="space-y-2">
              <Label>Área (Nivel 1)</Label>
              <Select value={selectedAreaId} onValueChange={setSelectedAreaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un área" />
                </SelectTrigger>
                <SelectContent>
                  {loadingCategories ? (
                    <div className="p-2 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando...
                    </div>
                  ) : (
                    areas.map(area => (
                      <SelectItem key={area.id} value={area.id}>
                        📍 {area.nombre}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* PASO 2: Seleccionar Subárea (Nivel 2) */}
          {selectedAreaId && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span>Subárea (Nivel 2)</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Label>
              <Select
                value={selectedSubareaId}
                onValueChange={(val) => {
                  setSelectedSubareaId(val);
                  setSelectedLocationId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una subárea" />
                </SelectTrigger>
                <SelectContent>
                  {subareas.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No hay subáreas en esta área
                    </div>
                  ) : (
                    subareas.map((subarea) => (
                      <SelectItem key={subarea.id} value={subarea.id}>
                        🔧 {subarea.nombre}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* PASO 3: Seleccionar ubicación final (Nivel 3+) */}
          {selectedSubareaId && locations.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <span>Ubicación (Nivel 3)</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Label>
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una ubicación" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      📦 {loc.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* PASO 3: Detalles del equipo */}
          {selectedSubareaId && (
            <div className="space-y-3 pt-4 border-t">
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

              {/* Resumen de ubicación */}
              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded border border-blue-200 dark:border-blue-800">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                  Ubicación:
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  {categories.find(c => c.id === selectedAreaId)?.nombre}
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  → {selectedCategory?.nombre}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          {selectedSubareaId && (
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
