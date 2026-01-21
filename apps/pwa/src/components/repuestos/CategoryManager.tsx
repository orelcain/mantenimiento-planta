/**
 * CategoryManager - Gestión jerárquica de categorías y máquinas
 * 
 * Características:
 * - Listar categorías con sus máquinas (expandible)
 * - Crear/editar/eliminar categorías
 * - Crear/editar/eliminar máquinas dentro de cada categoría
 * - Reordenar categorías (drag & drop)
 * - Archivar/Reactivar categorías y máquinas
 */

import { useState } from 'react';
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, GripVertical, Folder, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
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
import type { MachineCategory, Machine } from '@/types/repuestos';
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
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';

// Componente para item draggable de categoría (con máquinas expandibles)
function SortableCategoryItem({
  category,
  machines,
  isExpanded,
  onToggleExpand,
  onEditCategory,
  onToggleActiveCategory,
  onDeleteCategory,
  onCreateMachine,
  onEditMachine,
  onToggleActiveMachine,
  onDeleteMachine,
  renderIcon,
}: {
  category: MachineCategory;
  machines: Machine[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditCategory: (category: MachineCategory) => void;
  onToggleActiveCategory: (category: MachineCategory) => void;
  onDeleteCategory: (category: MachineCategory) => void;
  onCreateMachine: (categoryId: string) => void;
  onEditMachine: (machine: Machine) => void;
  onToggleActiveMachine: (machine: Machine) => void;
  onDeleteMachine: (machine: Machine) => void;
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

  const activeMachines = machines.filter((m) => m.activa);

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`p-4 ${!category.activa ? 'opacity-60' : ''}`}
    >
      {/* Header de categoría */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          {/* Drag handle */}
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-5 w-5 text-gray-400" />
          </div>

          {/* Expand/Collapse */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            className="p-0 h-auto hover:bg-transparent"
          >
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronRight className="h-5 w-5 text-slate-400" />
            )}
          </Button>

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
              <span>{activeMachines.length} máquina{activeMachines.length !== 1 ? 's' : ''}</span>
              {!category.activa && (
                <>
                  <span>•</span>
                  <span className="text-orange-500">Archivada</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions de categoría */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCreateMachine(category.id)}
            title="Nueva máquina"
          >
            <Plus className="h-4 w-4 mr-1" />
            <Wrench className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onEditCategory(category)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleActiveCategory(category)}
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
            onClick={() => onDeleteCategory(category)}
            className="hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Lista de máquinas (expandible) */}
      {isExpanded && (
        <div className="mt-4 ml-14 space-y-2 border-l-2 border-slate-700 pl-4">
          {machines.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              No hay máquinas en esta categoría. 
              <Button
                variant="link"
                size="sm"
                onClick={() => onCreateMachine(category.id)}
                className="p-0 h-auto ml-1"
              >
                Crear una
              </Button>
            </div>
          ) : (
            machines.map((machine) => (
              <div
                key={machine.id}
                className={`flex items-center justify-between p-3 rounded-md bg-slate-900/50 border border-slate-800 ${
                  !machine.activa ? 'opacity-60' : ''
                }`}
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Color indicator */}
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: machine.color }}
                  />

                  {/* Machine info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{machine.nombre}</span>
                      {!machine.activa && (
                        <Badge variant="outline" className="text-xs text-orange-500">
                          Archivada
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {machine.marca} {machine.modelo && `· ${machine.modelo}`}
                    </div>
                  </div>
                </div>

                {/* Machine actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditMachine(machine)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onToggleActiveMachine(machine)}
                    title={machine.activa ? 'Archivar' : 'Reactivar'}
                  >
                    {machine.activa ? (
                      <Archive className="h-3 w-3" />
                    ) : (
                      <ArchiveRestore className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteMachine(machine)}
                    className="hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

export function CategoryManager() {
  const {
    categories,
    loading: loadingCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    archiveCategory,
    reactivateCategory,
    reorderCategories,
  } = useMachineCategories();
  const {
    machines,
    loading: loadingMachines,
    createMachine,
    updateMachine,
    deleteMachine,
    archiveMachine,
    reactivateMachine,
  } = useMachines();
  const { toast } = useToast();

  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showMachineDialog, setShowMachineDialog] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({
    nombre: '',
    descripcion: '',
    icono: 'Folder',
  });
  const [machineFormData, setMachineFormData] = useState({
    nombre: '',
    marca: '',
    modelo: '',
    descripcion: '',
    categoryId: '',
    color: '#3b82f6',
  });
  const [editingCategory, setEditingCategory] = useState<MachineCategory | null>(null);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const activeCategories = categories.filter((c) => c.activa);
  const archivedCategories = categories.filter((c) => !c.activa);

  // Sensores para drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Toggle expand/collapse
  const toggleExpand = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Renderizar ícono dinámico
  const renderIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    if (!IconComponent) {
      return <Folder className="h-5 w-5" />;
    }
    return <IconComponent className="h-5 w-5" />;
  };

  // Obtener máquinas de una categoría
  const getMachinesByCategory = (categoryId: string) => {
    return machines.filter((m) => m.categoryId === categoryId);
  };

  // ==================== CATEGORÍAS ====================

  // Crear categoría
  const handleCreateCategory = async () => {
    try {
      await createCategory({
        nombre: categoryFormData.nombre,
        descripcion: categoryFormData.descripcion,
        icono: categoryFormData.icono,
        orden: activeCategories.length,
        activa: true,
      });
      toast({
        title: 'Categoría creada',
        description: `${categoryFormData.nombre} creada correctamente`,
      });
      setShowCategoryDialog(false);
      setCategoryFormData({ nombre: '', descripcion: '', icono: 'Folder' });
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
  const handleEditCategory = (category: MachineCategory) => {
    setEditingCategory(category);
    setCategoryFormData({
      nombre: category.nombre,
      descripcion: category.descripcion || '',
      icono: category.icono,
    });
    setShowCategoryDialog(true);
  };

  const handleSaveEditCategory = async () => {
    if (!editingCategory) return;

    try {
      await updateCategory(editingCategory.id, {
        nombre: categoryFormData.nombre,
        descripcion: categoryFormData.descripcion,
        icono: categoryFormData.icono,
      });
      toast({
        title: 'Categoría actualizada',
        description: `${categoryFormData.nombre} actualizada correctamente`,
      });
      setShowCategoryDialog(false);
      setEditingCategory(null);
      setCategoryFormData({ nombre: '', descripcion: '', icono: 'Folder' });
    } catch (error) {
      console.error('Error updating category:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar la categoría',
        variant: 'destructive',
      });
    }
  };

  // Toggle activa/archivada categoría
  const handleToggleActiveCategory = async (category: MachineCategory) => {
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
  const handleDeleteCategory = async (category: MachineCategory) => {
    const machineCount = getMachinesByCategory(category.id).length;
    if (machineCount > 0) {
      toast({
        title: 'No se puede eliminar',
        description: `Esta categoría tiene ${machineCount} máquina(s) asignada(s). Elimínalas primero.`,
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

  // Drag & drop - reordenar categorías
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

  // ==================== MÁQUINAS ====================

  // Crear máquina
  const handleCreateMachine = (categoryId: string) => {
    setEditingMachine(null);
    setMachineFormData({
      nombre: '',
      marca: '',
      modelo: '',
      descripcion: '',
      categoryId,
      color: '#3b82f6',
    });
    setShowMachineDialog(true);
  };

  // Editar máquina
  const handleEditMachine = (machine: Machine) => {
    setEditingMachine(machine);
    setMachineFormData({
      nombre: machine.nombre || '',
      marca: machine.marca || '',
      modelo: machine.modelo || '',
      descripcion: machine.descripcion || '',
      categoryId: machine.categoryId || '',
      color: machine.color || '#3b82f6',
    });
    setShowMachineDialog(true);
  };

  // Guardar máquina
  const handleSaveMachine = async () => {
    try {
      const nombre = machineFormData.nombre.trim();
      const marca = machineFormData.marca.trim();
      const modelo = machineFormData.modelo.trim();

      if (!nombre || !marca || !modelo) {
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
          nombre,
          marca,
          modelo,
          descripcion: machineFormData.descripcion,
          categoryId: machineFormData.categoryId,
          color: machineFormData.color,
        });

        toast({
          title: 'Máquina actualizada',
          description: `${nombre} actualizada correctamente`,
        });
      } else {
        // Crear
        await createMachine({
          nombre,
          marca,
          modelo,
          descripcion: machineFormData.descripcion,
          categoryId: machineFormData.categoryId,
          color: machineFormData.color,
          activa: true,
          orden: 0,
        });

        toast({
          title: 'Máquina creada',
          description: `${nombre} creada correctamente`,
        });

        // Expandir la categoría automáticamente
        setExpandedCategories((prev) => new Set(prev).add(machineFormData.categoryId));
      }

      setShowMachineDialog(false);
      setMachineFormData({
        nombre: '',
        marca: '',
        modelo: '',
        descripcion: '',
        categoryId: '',
        color: '#3b82f6',
      });
    } catch (error) {
      console.error('Error saving machine:', error);
      toast({
        title: 'Error',
        description: 'No se pudo guardar la máquina',
        variant: 'destructive',
      });
    }
  };

  // Toggle activa/archivada máquina
  const handleToggleActiveMachine = async (machine: Machine) => {
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
      console.error('Error toggling machine:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cambiar el estado de la máquina',
        variant: 'destructive',
      });
    }
  };

  // Eliminar máquina
  const handleDeleteMachine = async (machine: Machine) => {
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

  if (loadingCategories || loadingMachines) {
    return <div className="py-8 text-center text-muted-foreground">Cargando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Gestión de Categorías y Máquinas</h2>
          <p className="text-sm text-muted-foreground">
            Organiza tus máquinas en categorías. Haz clic en una categoría para ver sus máquinas.
          </p>
        </div>
        <Button onClick={() => { setCategoryFormData({ nombre: '', descripcion: '', icono: 'Folder' }); setEditingCategory(null); setShowCategoryDialog(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Categoría
        </Button>
      </div>

      {/* Categorías Activas con máquinas */}
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
                  machines={getMachinesByCategory(category.id)}
                  isExpanded={expandedCategories.has(category.id)}
                  onToggleExpand={() => toggleExpand(category.id)}
                  onEditCategory={handleEditCategory}
                  onToggleActiveCategory={handleToggleActiveCategory}
                  onDeleteCategory={handleDeleteCategory}
                  onCreateMachine={handleCreateMachine}
                  onEditMachine={handleEditMachine}
                  onToggleActiveMachine={handleToggleActiveMachine}
                  onDeleteMachine={handleDeleteMachine}
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

      {/* Máquinas sin Categoría (Máquinas Principales) */}
      {machines.filter((m) => !m.categoryId || m.categoryId === '').length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Máquinas sin Categoría ({machines.filter((m) => !m.categoryId || m.categoryId === '').length})
          </h3>
          <Card className="p-4 border-blue-900/50 bg-blue-900/10">
            <div className="space-y-3">
              {machines
                .filter((m) => !m.categoryId || m.categoryId === '')
                .map((machine) => (
                  <div
                    key={machine.id}
                    className="flex items-center justify-between p-3 rounded-md bg-slate-900/50 border border-slate-800 hover:border-slate-700"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="text-slate-400">{renderIcon('Wrench')}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{machine.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {machine.marca} {machine.modelo}
                        </p>
                        {machine.descripcion && (
                          <p className="text-xs text-slate-400 mt-1">{machine.descripcion}</p>
                        )}
                        {!machine.activa && (
                          <span className="inline-block mt-1 text-xs text-orange-500">Archivada</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditMachine(machine)}
                        title="Editar"
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          machine.activa ? handleToggleActiveMachine(machine) : handleToggleActiveMachine(machine)
                        }
                        title={machine.activa ? 'Archivar' : 'Reactivar'}
                      >
                        {machine.activa ? (
                          <Archive className="h-3 w-3" />
                        ) : (
                          <ArchiveRestore className="h-3 w-3" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteMachine(machine)}
                        className="hover:text-destructive"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setMachineFormData({ nombre: '', marca: '', modelo: '', descripcion: '', categoryId: '', color: '#3b82f6' });
                  setEditingMachine(null);
                  setShowMachineDialog(true);
                }}
                className="w-full"
              >
                <Plus className="mr-2 h-4 w-4" />
                Agregar máquina sin categoría
              </Button>
            </div>
          </Card>
        </div>
      )}

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
                        <span>{getMachinesByCategory(category.id).length} máquina(s)</span>
                        <span>•</span>
                        <span className="text-orange-500">Archivada</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleActiveCategory(category)}
                      title="Reactivar"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(category)}
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

      {/* Diálogo Crear/Editar Categoría */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cat-nombre">Nombre *</Label>
              <Input
                id="cat-nombre"
                value={categoryFormData.nombre}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, nombre: e.target.value })}
                placeholder="Ej: Máquinas Principales"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-descripcion">Descripción</Label>
              <Input
                id="cat-descripcion"
                value={categoryFormData.descripcion}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, descripcion: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-icono">Ícono (Lucide)</Label>
              <Input
                id="cat-icono"
                value={categoryFormData.icono}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, icono: e.target.value })}
                placeholder="Ej: Factory, Zap, Link"
              />
              <p className="text-xs text-muted-foreground">
                Ver iconos en{' '}
                <a
                  href="https://lucide.dev/icons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-400 hover:text-slate-300 hover:underline"
                >
                  lucide.dev/icons
                </a>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={editingCategory ? handleSaveEditCategory : handleCreateCategory}
              disabled={!categoryFormData.nombre.trim()}
            >
              {editingCategory ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Crear/Editar Máquina */}
      <Dialog open={showMachineDialog} onOpenChange={setShowMachineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingMachine ? 'Editar Máquina' : 'Nueva Máquina'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="mach-nombre">Nombre *</Label>
              <Input
                id="mach-nombre"
                value={machineFormData.nombre}
                onChange={(e) => setMachineFormData({ ...machineFormData, nombre: e.target.value })}
                placeholder="Ej: Torno CNC"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mach-marca">Marca *</Label>
                <Input
                  id="mach-marca"
                  value={machineFormData.marca}
                  onChange={(e) => setMachineFormData({ ...machineFormData, marca: e.target.value })}
                  placeholder="Ej: Haas"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mach-modelo">Modelo *</Label>
                <Input
                  id="mach-modelo"
                  value={machineFormData.modelo}
                  onChange={(e) => setMachineFormData({ ...machineFormData, modelo: e.target.value })}
                  placeholder="Ej: ST-20"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mach-descripcion">Descripción</Label>
              <Input
                id="mach-descripcion"
                value={machineFormData.descripcion}
                onChange={(e) => setMachineFormData({ ...machineFormData, descripcion: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mach-categoria">Categoría *</Label>
              <Select
                value={machineFormData.categoryId}
                onValueChange={(value) => setMachineFormData({ ...machineFormData, categoryId: value })}
              >
                <SelectTrigger id="mach-categoria">
                  <SelectValue placeholder="Selecciona una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="mach-color">Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mach-color"
                  type="color"
                  value={machineFormData.color}
                  onChange={(e) => setMachineFormData({ ...machineFormData, color: e.target.value })}
                  className="w-20 h-10"
                />
                <span className="text-sm text-muted-foreground">{machineFormData.color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMachineDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveMachine}
              disabled={!machineFormData.nombre.trim() || !machineFormData.marca.trim() || !machineFormData.modelo.trim() || !machineFormData.categoryId}
            >
              {editingMachine ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
