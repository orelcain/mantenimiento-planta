/**
 * MachineManager - Gestión de máquinas para administradores
 * 
 * Características:
 * - Listar todas las máquinas (activas e inactivas)
 * - Crear nueva máquina
 * - Editar máquina (nombre, marca, modelo, categoría, color)
 * - Asignar categoría a máquina
 * - Archivar/Reactivar máquina
 * - Eliminar máquina (con confirmación)
 * - Reordenar máquinas (drag & drop preparado)
 */

import { useState } from 'react';
import { Plus, Pencil, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { useMachines } from '@/hooks/repuestos/useMachines';
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories';
import { useToast } from '@/hooks/useToast';
import type { Machine } from '@/types/repuestos';
import {
  Button,
  Dialog,
  DialogContent,
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
  Card,
} from '@/components/ui';

export function MachineManager() {
  const { machines, createMachine, updateMachine, deleteMachine, archiveMachine, reactivateMachine } =
    useMachines();
  const { categories } = useMachineCategories();
  const { toast } = useToast();

  const [showDialog, setShowDialog] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [formData, setFormData] = useState({
    nombre: '',
    marca: '',
    modelo: '',
    descripcion: '',
    categoryId: 'none', // usar 'none' como sentinel para "Sin categoría"
    color: '#3b82f6',
  });

  // Reset form
  const resetForm = () => {
    setFormData({
      nombre: '',
      marca: '',
      modelo: '',
      descripcion: '',
      categoryId: 'none',
      color: '#3b82f6',
    });
    setEditingMachine(null);
  };

  // Abrir modal para crear
  const handleCreate = () => {
    resetForm();
    setShowDialog(true);
  };

  // Abrir modal para editar
  const handleEdit = (machine: Machine) => {
    setEditingMachine(machine);
    setFormData({
      nombre: machine.nombre,
      marca: machine.marca,
      modelo: machine.modelo,
      descripcion: machine.descripcion || '',
      categoryId: machine.categoryId ?? 'none',
      color: machine.color || '#3b82f6',
    });
    setShowDialog(true);
  };

  // Guardar (crear o actualizar)
  const handleSave = async () => {
    try {
      if (!formData.nombre.trim() || !formData.marca.trim() || !formData.modelo.trim()) {
        toast({
          title: 'Error',
          description: 'Los campos Nombre, Marca y Modelo son obligatorios',
          variant: 'destructive',
        });
        return;
      }

      if (editingMachine) {
        // Actualizar
        await updateMachine(editingMachine.id, {
          nombre: formData.nombre,
          marca: formData.marca,
          modelo: formData.modelo,
          descripcion: formData.descripcion,
          categoryId: formData.categoryId === 'none' ? null : formData.categoryId,
          color: formData.color,
        });

        toast({
          title: 'Máquina actualizada',
          description: `${formData.nombre} actualizada correctamente`,
        });
      } else {
        // Crear
        await createMachine({
          nombre: formData.nombre,
          marca: formData.marca,
          modelo: formData.modelo,
          descripcion: formData.descripcion,
          categoryId: formData.categoryId === 'none' ? null : formData.categoryId,
          color: formData.color,
          activa: true,
          orden: 0,
        });

        toast({
          title: 'Máquina creada',
          description: `${formData.nombre} creada correctamente`,
        });
      }

      setShowDialog(false);
      resetForm();
    } catch (error) {
      console.error('Error saving machine:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la máquina',
        variant: 'destructive',
      });
    }
  };

  // Archivar/Reactivar
  const handleToggleActive = async (machine: Machine) => {
    try {
      if (machine.activa) {
        await archiveMachine(machine.id);
        toast({
          title: 'Máquina archivada',
          description: `${machine.nombre} archivada correctamente`,
        });
      } else {
        await reactivateMachine(machine.id);
        toast({
          title: 'Máquina reactivada',
          description: `${machine.nombre} reactivada correctamente`,
        });
      }
    } catch (error) {
      console.error('Error toggling machine active:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la máquina',
        variant: 'destructive',
      });
    }
  };

  // Eliminar
  const handleDelete = async (machine: Machine) => {
    if (!confirm(`¿Eliminar la máquina "${machine.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await deleteMachine(machine.id);
      toast({
        title: 'Máquina eliminada',
        description: `${machine.nombre} eliminada correctamente`,
      });
    } catch (error) {
      console.error('Error deleting machine:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la máquina',
        variant: 'destructive',
      });
    }
  };

  // Obtener nombre de categoría
  const getCategoryName = (categoryId: string | null | undefined) => {
    if (!categoryId) return 'Sin categoría';
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.nombre : 'Sin categoría';
  };

  const activeMachines = machines.filter((m) => m.activa);
  const archivedMachines = machines.filter((m) => !m.activa);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Máquinas</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Administra las máquinas y equipos del sistema de repuestos
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Máquina
        </Button>
      </div>

      {/* Máquinas Activas */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Máquinas Activas ({activeMachines.length})</h3>
        <div className="grid gap-3">
          {activeMachines.map((machine) => (
            <Card key={machine.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                  {/* Color indicator */}
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: machine.color }}
                    title={`Color: ${machine.color}`}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-base">{machine.nombre}</h4>
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        {getCategoryName(machine.categoryId)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {machine.marca} - {machine.modelo}
                    </p>
                    {machine.descripcion && (
                      <p className="text-xs text-muted-foreground mt-1">{machine.descripcion}</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(machine)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleActive(machine)}
                    title="Archivar"
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(machine)}
                    className="hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {activeMachines.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No hay máquinas activas. Crea una nueva máquina para comenzar.
            </div>
          )}
        </div>
      </div>

      {/* Máquinas Archivadas */}
      {archivedMachines.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            Máquinas Archivadas ({archivedMachines.length})
          </h3>
          <div className="grid gap-3">
            {archivedMachines.map((machine) => (
              <Card key={machine.id} className="p-4 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: machine.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-base">{machine.nombre}</h4>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          Archivada
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {machine.marca} - {machine.modelo}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(machine)}
                      title="Reactivar"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(machine)}
                      className="hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal de Crear/Editar */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingMachine ? 'Editar Máquina' : 'Nueva Máquina'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Baader 200"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="marca">Marca *</Label>
                <Input
                  id="marca"
                  value={formData.marca}
                  onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                  placeholder="Ej: Baader"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="modelo">Modelo *</Label>
                <Input
                  id="modelo"
                  value={formData.modelo}
                  onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                  placeholder="Ej: 200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <Input
                id="descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Opcional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoryId">Categoría</Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {categories
                    .filter((c) => c.activa)
                    .map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">Color (Hex)</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3b82f6"
                  className="flex-1"
                />
                <div
                  className="w-10 h-10 rounded border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: formData.color }}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingMachine ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
