/**
 * CategoryManager - Gestión de categorías de máquinas para administradores
 * 
 * Características:
 * - Listar todas las categorías (activas e inactivas)
 * - Crear nueva categoría con icono
 * - Editar categoría (nombre, descripción, icono)
 * - Reordenar categorías (drag & drop)
 * - Archivar/Reactivar categoría
 * - Eliminar categoría (con confirmación)
 * - Vista de máquinas por categoría
 */

import { useState } from 'react';
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, GripVertical, Folder } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories';
import { useMachines } from '@/hooks/repuestos/useMachines';
import { useToast } from '@/hooks/useToast';
import type { MachineCategory } from '@/types/repuestos';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
  Card,
} from '@/components/ui';

// Componente para item draggable
function SortableCategoryItem({
  category,
  machineCount,
  onEdit,
  onToggleActive,
  onDelete,
  renderIcon,
}: {
  category: MachineCategory;
  machineCount: number;
  onEdit: (category: MachineCategory) => void;
  onToggleActive: (category: MachineCategory) => void;
  onDelete: (category: MachineCategory) => void;
  renderIcon: (iconName: string) => JSX.Element;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-4 ${!category.activa ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {/* Drag handle */}
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-5 w-5 text-gray-400" />
          </div>

          {/* Icon */}
          <div className="text-slate-400">
            {renderIcon(category.icono)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold">{category.nombre}</h4>
            {category.descripcion && (
              <p className="text-xs text-muted-foreground mt-1">{category.descripcion}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>Orden: {category.orden}</span>
              <span>•</span>
              <span>{machineCount} máquina{machineCount !== 1 ? 's' : ''}</span>
              {!category.activa && (
                <>
                  <span>•</span>
                  <span className="text-orange-500">Archivada</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(category)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleActive(category)}
            title={category.activa ? 'Archivar' : 'Reactivar'}
          >
            {category.activa ? (
              <Archive className="h-4 w-4" />
            ) : (
              <ArchiveRestore className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(category)}
            className="hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function CategoryManager() {
  const {
    categories,
    loading,
    createCategory,
    updateCategory,
    deleteCategory,
    archiveCategory,
    reactivateCategory,
    reorderCategories,
  } = useMachineCategories();
  const { machines } = useMachines();
  const { toast } = useToast();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    icono: 'Folder',
  });
  const [editingCategory, setEditingCategory] = useState<MachineCategory | null>(null);

  const activeCategories = categories.filter((c) => c.activa);
  const archivedCategories = categories.filter((c) => !c.activa);

  // Sensores para drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Renderizar ícono dinámico
  const renderIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    if (!IconComponent) {
      return <Folder className="h-5 w-5" />;
    }
    return <IconComponent className="h-5 w-5" />;
  };

  // Contar máquinas por categoría
  const getMachineCount = (categoryId: string) => {
    return machines.filter((m) => m.categoryId === categoryId && m.activa).length;
  };

  // Crear categoría
  const handleCreate = async () => {
    try {
      await createCategory({
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        icono: formData.icono,
        orden: activeCategories.length,
        activa: true,
      });
      toast({
        title: 'Categoría creada',
        description: `${formData.nombre} creada correctamente`,
      });
      setShowCreateDialog(false);
      setFormData({ nombre: '', descripcion: '', icono: 'Folder' });
    } catch (error) {
      console.error('Error creating category:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la categoría',
        variant: 'destructive',
      });
    }
  };

  // Editar categoría
  const handleEdit = (category: MachineCategory) => {
    setEditingCategory(category);
    setFormData({
      nombre: category.nombre,
      descripcion: category.descripcion || '',
      icono: category.icono,
    });
    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingCategory) return;

    try {
      await updateCategory(editingCategory.id, {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        icono: formData.icono,
      });
      toast({
        title: 'Categoría actualizada',
        description: `${formData.nombre} actualizada correctamente`,
      });
      setShowEditDialog(false);
      setEditingCategory(null);
      setFormData({ nombre: '', descripcion: '', icono: 'Folder' });
    } catch (error) {
      console.error('Error updating category:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la categoría',
        variant: 'destructive',
      });
    }
  };

  // Toggle activa/archivada
  const handleToggleActive = async (category: MachineCategory) => {
    try {
      if (category.activa) {
        await archiveCategory(category.id);
        toast({
          title: 'Categoría archivada',
          description: `${category.nombre} archivada correctamente`,
        });
      } else {
        await reactivateCategory(category.id);
        toast({
          title: 'Categoría reactivada',
          description: `${category.nombre} reactivada correctamente`,
        });
      }
    } catch (error) {
      console.error('Error toggling category:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la categoría',
        variant: 'destructive',
      });
    }
  };

  // Eliminar categoría
  const handleDelete = async (category: MachineCategory) => {
    const machineCount = getMachineCount(category.id);
    if (machineCount > 0) {
      toast({
        title: 'No se puede eliminar',
        description: `Esta categoría tiene ${machineCount} máquina(s) asignada(s). Reasígnalas primero.`,
        variant: 'destructive',
      });
      return;
    }

    if (
      !confirm(
        `¿Eliminar la categoría "${category.nombre}"? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }

    try {
      await deleteCategory(category.id);
      toast({
        title: 'Categoría eliminada',
        description: `${category.nombre} eliminada correctamente`,
      });
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la categoría',
        variant: 'destructive',
      });
    }
  };

  // Drag & drop - reordenar
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeCategories.findIndex((c) => c.id === active.id);
      const newIndex = activeCategories.findIndex((c) => c.id === over.id);

      const reordered = arrayMove(activeCategories, oldIndex, newIndex);
      const newOrder = reordered.map((c) => c.id);

      try {
        await reorderCategories(newOrder);
        toast({
          title: 'Orden actualizado',
          description: 'Las categorías se han reordenado correctamente',
        });
      } catch (error) {
        console.error('Error reordering categories:', error);
        toast({
          title: 'Error',
          description: 'No se pudo actualizar el orden',
          variant: 'destructive',
        });
      }
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Cargando categorías...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Gestión de Categorías</h2>
          <p className="text-sm text-muted-foreground">
            Organiza las máquinas en categorías. Arrastra para reordenar.
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Categoría
        </Button>
      </div>

      {/* Categorías Activas */}
      <div>
        <h3 className="text-lg font-semibold mb-3">
          Categorías Activas ({activeCategories.length})
        </h3>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeCategories.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-3">
              {activeCategories.map((category) => (
                <SortableCategoryItem
                  key={category.id}
                  category={category}
                  machineCount={getMachineCount(category.id)}
                  onEdit={handleEdit}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDelete}
                  renderIcon={renderIcon}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {activeCategories.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No hay categorías activas. Crea una nueva categoría para comenzar.
          </div>
        )}
      </div>

      {/* Categorías Archivadas */}
      {archivedCategories.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            Categorías Archivadas ({archivedCategories.length})
          </h3>
          <div className="grid gap-3">
            {archivedCategories.map((category) => (
              <Card key={category.id} className="p-4 opacity-60">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-slate-400">{renderIcon(category.icono)}</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold">{category.nombre}</h4>
                      {category.descripcion && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {category.descripcion}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{getMachineCount(category.id)} máquina(s)</span>
                        <span>•</span>
                        <span className="text-orange-500">Archivada</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActive(category)}
                      title="Reactivar"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(category)}
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

      {/* Diálogo Crear */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                placeholder="Ej: Máquinas Principales"
              />
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
              <Label htmlFor="icono">Ícono (Lucide)</Label>
              <Input
                id="icono"
                value={formData.icono}
                onChange={(e) => setFormData({ ...formData, icono: e.target.value })}
                placeholder="Ej: Factory, Zap, Link"
              />
              <p className="text-xs text-muted-foreground">
                Ver iconos en{' '}
                <a
                  href="https://lucide.dev/icons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  lucide.dev/icons
                </a>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!formData.nombre.trim()}>
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Editar */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nombre">Nombre *</Label>
              <Input
                id="edit-nombre"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-descripcion">Descripción</Label>
              <Input
                id="edit-descripcion"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-icono">Ícono (Lucide)</Label>
              <Input
                id="edit-icono"
                value={formData.icono}
                onChange={(e) => setFormData({ ...formData, icono: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={!formData.nombre.trim()}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
