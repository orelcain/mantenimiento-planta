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
import { Check, GripVertical } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Input,
  Label,
} from '@/components/ui';
import { logger } from '@/lib/logger';

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
}: {
  category: MachineCategory;
  isActive: boolean;
  count: number;
  isAdmin: boolean;
  onClick: () => void;
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
          <GripVertical className="h-4 w-4 text-muted-foreground" />
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
              ? 'text-foreground border-b-primary bg-muted hover:bg-muted'
              : 'text-muted-foreground hover:text-foreground hover:border-b-border hover:bg-muted/50'
          }
        `}
      >
        <span>{category.nombre}</span>
        {count > 0 && (
          <span
            className={`
              inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
              ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
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
  const { categories, loading, createCategory, updateCategory, reorderCategories } =
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

  // Solo mostrar categorías raíz (sin parentId) en las pestañas principales
  const activeCategories = categories.filter((c) => c.activa && c.visible !== false && !c.parentId);
  const hasMainCategory = activeCategories.some((c) => c.id === 'maquinas-principales');

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
        logger.error('Error reordering categories', error instanceof Error ? error : new Error(String(error)));
      }
    }
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
        visible: true,
      });
      setShowCreateDialog(false);
      setFormData({ nombre: '', descripcion: '', icono: 'Folder' });
    } catch (error) {
      logger.error('Error creating category', error instanceof Error ? error : new Error(String(error)));
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
      logger.error('Error updating category', error instanceof Error ? error : new Error(String(error)));
      alert('Error al actualizar la categoría');
    }
  };

  if (loading) {
    return <div className="py-4 text-center text-sm text-muted-foreground">Cargando categorías...</div>;
  }

  return (
    <>
      <div className={`border-b border-border bg-card ${className}`}>
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
                            ? 'text-foreground border-b-primary bg-muted hover:bg-muted'
                            : 'text-muted-foreground hover:text-foreground hover:border-b-border hover:bg-muted/50'
                        }
                      `}
                    >
                      <span>Máquinas Principales</span>
                      {(machineCountsByCategory['maquinas-principales'] ?? 0) > 0 && (
                        <span
                          className={`
                            inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
                            ${selectedCategoryId === 'maquinas-principales' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}
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
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </nav>

          {/* Botón de gestión (solo admin) */}
          {/* Eliminado botón redundante de gestión global de categorías */}
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
              <p className="text-xs text-muted-foreground">
                Ver iconos en{' '}
                <a
                  href="https://lucide.dev/icons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground hover:underline"
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
