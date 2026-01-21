/**
 * CategorySelector - Selector de categorías de máquinas tipo tabs
 * 
 * Características:
 * - Tabs horizontales con iconos dinámicos (lucide-react)
 * - "Todas" como opción default
 * - Dropdown de gestión (admin only): crear, editar, eliminar categorías
 * - Badge con cantidad de máquinas por categoría
 * - Scroll horizontal en móviles
 * - Drag & drop para reordenar (admin only)
 */

import { useState } from 'react';
import { MoreVertical, Plus, Pencil, Trash2, Check, GripVertical } from 'lucide-react';
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
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories';
import { useAuthStore } from '@/store';
import type { MachineCategory } from '@/types/repuestos';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
} from '@/components/ui';

interface CategorySelectorProps {
  selectedCategoryId: string | null; // null = "Todas"
  onSelectCategory: (categoryId: string | null) => void;
  machineCountsByCategory?: Record<string, number>; // { "maquinas-principales": 5, "cintas": 3 }
  className?: string;
}

// Componente SortableTab para drag & drop
function SortableTab({
  category,
  isActive,
  count,
  isAdmin,
  onClick,
  renderIcon,
}: {
  category: MachineCategory;
  isActive: boolean;
  count: number;
  isAdmin: boolean;
  onClick: () => void;
  renderIcon: (iconName: string) => JSX.Element;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: !isAdmin,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center">
      {isAdmin && (
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing mr-1">
          <GripVertical className="h-4 w-4 text-gray-400" />
        </div>
      )}
      <button
        onClick={onClick}
        className={`
          relative px-4 py-2 min-w-[120px] text-sm font-medium
          transition-all duration-200 flex items-center gap-2
          border-b-3 border-transparent
          ${
            isActive
              ? 'text-slate-200 border-b-slate-400 bg-slate-700/50 hover:bg-slate-700/60'
              : 'text-gray-400 hover:text-gray-300 hover:border-b-gray-500 hover:bg-slate-800/30'
          }
        `}
      >
        {renderIcon(category.icono)}
        <span>{category.nombre}</span>
        {count > 0 && (
          <span
            className={`
              inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
              ${isActive ? 'bg-slate-600 text-white' : 'bg-slate-700 text-gray-300'}
            `}
          >
            {count}
          </span>
        )}
      </button>
    </div>
  );
}

export function CategorySelector({
  selectedCategoryId,
  onSelectCategory,
  machineCountsByCategory = {},
  className = '',
}: CategorySelectorProps) {
  const { categories, loading, createCategory, updateCategory, deleteCategory, reorderCategories } =
    useMachineCategories();
  const { user } = useAuthStore();
  const isAdmin = user?.rol === 'admin';

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    descripcion: '',
    icono: 'Folder',
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const activeCategories = categories.filter((c) => c.activa);
  const hasMainCategory = activeCategories.some((c) => c.id === 'maquinas-principales');

  // Total de todas las máquinas
  const totalMachines = Object.values(machineCountsByCategory).reduce((sum, count) => sum + count, 0);

  // Sensores para drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handler de drag end
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeCategories.findIndex((c) => c.id === active.id);
      const newIndex = activeCategories.findIndex((c) => c.id === over.id);

      const reordered = arrayMove(activeCategories, oldIndex, newIndex);
      const newOrder = reordered.map((c) => c.id);

      try {
        await reorderCategories(newOrder);
      } catch (error) {
        console.error('Error reordering categories:', error);
      }
    }
  };

  // Renderizar ícono dinámico desde lucide-react
  const renderIcon = (iconName: string) => {
    const IconComponent = (LucideIcons as any)[iconName];
    if (!IconComponent) {
      return <LucideIcons.Folder className="h-5 w-5" />;
    }
    return <IconComponent className="h-5 w-5" />;
  };

  // Crear categoría
  const handleCreate = async () => {
    try {
      await createCategory({
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        icono: formData.icono,
        orden: 0,
        activa: true,
      });
      setShowCreateDialog(false);
      setFormData({ nombre: '', descripcion: '', icono: 'Folder' });
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Error al crear la categoría');
    }
  };

  // Editar categoría
  const handleEdit = async () => {
    if (!editingCategoryId) return;

    try {
      await updateCategory(editingCategoryId, {
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        icono: formData.icono,
      });
      setShowEditDialog(false);
      setEditingCategoryId(null);
      setFormData({ nombre: '', descripcion: '', icono: 'Folder' });
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Error al actualizar la categoría');
    }
  };

  // Eliminar categoría
  const handleDelete = async (categoryId: string, categoryName: string) => {
    if (!confirm(`¿Eliminar la categoría "${categoryName}"?`)) return;

    try {
      await deleteCategory(categoryId);
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Error al eliminar la categoría');
    }
  };

  // Abrir diálogo de edición
  const openEditDialog = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;

    setEditingCategoryId(categoryId);
    setFormData({
      nombre: category.nombre,
      descripcion: category.descripcion || '',
      icono: category.icono,
    });
    setShowEditDialog(true);
  };

  if (loading) {
    return <div className="py-4 text-center text-sm text-gray-500">Cargando categorías...</div>;
  }

  return (
    <>
      <div className={`border-b border-slate-700 bg-slate-900 ${className}`}>
        <div className="flex items-center justify-between px-4 py-2">
          <nav className="flex space-x-2 overflow-x-auto pb-px flex-1" aria-label="Categorías">
            {/* Tabs de categorías con drag & drop */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activeCategories.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                <div className="flex space-x-2">
                  {/* Tab de Máquinas Principales (pseudo-categoría solo si no existe real) */}
                  {!hasMainCategory && (
                    <button
                      onClick={() => onSelectCategory('maquinas-principales')}
                      className={`
                        relative px-4 py-2 min-w-[140px] text-sm font-medium
                        transition-all duration-200 flex items-center gap-2
                        border-b-3 border-transparent
                        ${
                          selectedCategoryId === 'maquinas-principales'
                            ? 'text-slate-200 border-b-slate-400 bg-slate-700/50 hover:bg-slate-700/60'
                            : 'text-gray-400 hover:text-gray-300 hover:border-b-gray-500 hover:bg-slate-800/30'
                        }
                      `}
                    >
                      {renderIcon('Wrench')}
                      <span>Máquinas Principales</span>
                      {(machineCountsByCategory['maquinas-principales'] ?? 0) > 0 && (
                        <span
                          className={`
                            inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
                            ${selectedCategoryId === 'maquinas-principales' ? 'bg-slate-600 text-white' : 'bg-slate-700 text-gray-300'}
                          `}
                        >
                          {machineCountsByCategory['maquinas-principales']}
                        </span>
                      )}
                    </button>
                  )}

                  {activeCategories.map((category) => {
                    const isActive = selectedCategoryId === category.id;
                    const count = machineCountsByCategory[category.id] ?? 0;

                    return (
                      <SortableTab
                        key={category.id}
                        category={category}
                        isActive={isActive}
                        count={count}
                        isAdmin={isAdmin}
                        onClick={() => onSelectCategory(category.id)}
                        renderIcon={renderIcon}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </nav>

          {/* Botón de gestión (solo admin) */}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="ml-2">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={() => setShowCreateDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nueva Categoría
                </DropdownMenuItem>

                {activeCategories.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    {activeCategories.map((category) => (
                      <div key={category.id} className="px-2 py-1 flex items-center justify-between">
                        <span className="text-sm flex items-center gap-2">
                          {renderIcon(category.icono)}
                          {category.nombre}
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(category.id)}
                            className="h-6 w-6 p-0"
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(category.id, category.nombre)}
                            className="h-6 w-6 p-0 hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Diálogo de crear categoría */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre</Label>
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
              <p className="text-xs text-gray-500">
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
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={!formData.nombre.trim()}>
              <Check className="mr-2 h-4 w-4" />
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de editar categoría */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoría</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nombre">Nombre</Label>
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
            <Button onClick={handleEdit} disabled={!formData.nombre.trim()}>
              <Check className="mr-2 h-4 w-4" />
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
