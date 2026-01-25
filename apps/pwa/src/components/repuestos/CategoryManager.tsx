/**
 * CategoryManager - Gestión jerárquica de categorías y máquinas
 * 
 * Características:
 * - Listar categorías con sus máquinas (expandible)
 * - Crear/editar/eliminar categorías (con subcategorías)
 * - Crear/editar/eliminar máquinas dentro de cada categoría
 * - Reordenar categorías y máquinas (drag & drop)
 * - Mover máquinas entre categorías
 * - Archivar/Reactivar categorías y máquinas
 */

import { useState, useMemo } from 'react';
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
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
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

// Tipos para Drag & Drop
type SortableItemData = {
  type: 'category' | 'machine' | 'subcategory';
  item: MachineCategory | Machine;
  parentId?: string; // Para subcategorías o máquinas
};

// Componente para item draggable de MÁQUINA
function SortableMachineItem({
  machine,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  machine: Machine;
  onEdit: (m: Machine) => void;
  onToggleActive: (m: Machine) => void;
  onDelete: (m: Machine) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `machine-${machine.id}`,
    data: {
      type: 'machine',
      item: machine,
      parentId: machine.categoryId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 rounded-md bg-slate-900/50 border border-slate-800 ${
        !machine.activa ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-3 flex-1">
        {/* Drag Handle */}
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-gray-500" />
        </div>

        {/* Color indicator */}
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: machine.color }}
        />

        {/* Machine info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{machine.nombre}</span>
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
          onClick={() => onEdit(machine)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggleActive(machine)}
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
          onClick={() => onDelete(machine)}
          className="hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// Componente para item draggable de CATEGORÍA (con máquinas expandibles y subcategorias)
function SortableCategoryItem({
  category,
  machines,
  subcategories,
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
  // Pasar props recursivos
  allCategories,
  getMachinesByCategory,
  expandedCategories,
  toggleExpand,
}: {
  category: MachineCategory;
  machines: Machine[];
  subcategories: MachineCategory[];
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
  allCategories: MachineCategory[];
  getMachinesByCategory: (id: string) => Machine[];
  expandedCategories: Set<string>;
  toggleExpand: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `category-${category.id}`,
    data: {
      type: 'category',
      item: category,
      parentId: category.parentId
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const activeMachines = machines.filter((m) => m.activa);
  // Sort máquinas y subcategorías
  const sortedMachines = [...machines].sort((a,b) => a.orden - b.orden);
  const sortedSubcategories = [...subcategories]
    .filter(c => c.activa) // Mostrar solo activas en el árbol dragging por ahora
    .sort((a,b) => a.orden - b.orden);

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
            title="Nueva máquina / subcategoría"
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

      {/* Lista Expandible (Máquinas y Subcategorías) */}
      {isExpanded && (
        <div className="mt-4 ml-8 pl-4 border-l-2 border-slate-800 space-y-4">
          
          {/* Subcategorías Nesteadas */}
          {sortedSubcategories.length > 0 && (
            <div className="space-y-2">
               <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Subcategorías</h5>
               <SortableContext
                  items={sortedSubcategories.map(c => `category-${c.id}`)}
                  strategy={verticalListSortingStrategy}
               >
                 {sortedSubcategories.map((subcat) => {
                    const subMachines = getMachinesByCategory(subcat.id);
                    // Recursión simple: encontrar subcategorías de esta subcategoría
                    const nextSubcategories = allCategories.filter(c => c.parentId === subcat.id);
                    
                    return (
                       <SortableCategoryItem
                          key={subcat.id}
                          category={subcat}
                          machines={subMachines}
                          subcategories={nextSubcategories}
                          // Props recursivos
                          isExpanded={expandedCategories.has(subcat.id)}
                          onToggleExpand={() => toggleExpand(subcat.id)}
                          onEditCategory={onEditCategory}
                          onToggleActiveCategory={onToggleActiveCategory}
                          onDeleteCategory={onDeleteCategory}
                          onCreateMachine={onCreateMachine}
                          onEditMachine={onEditMachine}
                          onToggleActiveMachine={onToggleActiveMachine}
                          onDeleteMachine={onDeleteMachine}
                          renderIcon={renderIcon}
                          allCategories={allCategories}
                          getMachinesByCategory={getMachinesByCategory}
                          expandedCategories={expandedCategories}
                          toggleExpand={toggleExpand}
                       />
                    )
                 })}
               </SortableContext>
            </div>
          )}

          {/* Máquinas Nesteadas */}
          <div className="space-y-2">
            {sortedMachines.length > 0 ? (
               <SortableContext
                  items={sortedMachines.map(m => `machine-${m.id}`)}
                  strategy={verticalListSortingStrategy}
               >
                  <div className="space-y-2">
                    {sortedMachines.map((machine) => (
                      <SortableMachineItem
                        key={machine.id}
                        machine={machine}
                        onEdit={onEditMachine}
                        onToggleActive={onToggleActiveMachine}
                        onDelete={onDeleteMachine}
                      />
                    ))}
                  </div>
               </SortableContext>
            ) : (
              <div className="text-sm text-muted-foreground py-2 italic opacity-70">
                {subcategories.length === 0 ? 'Sin máquinas ni subcategorías.' : 'Sin máquinas directas.'}
                <Button variant="link" size="sm" onClick={() => onCreateMachine(category.id)} className="ml-1 h-auto p-0">Crear máquina</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// Componente principal CategoryManager
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
    reorderMachines,
  } = useMachines();
  const { toast } = useToast();

  const NO_PARENT_VALUE = '__none__';

  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showMachineDialog, setShowMachineDialog] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({
    nombre: '',
    descripcion: '',
    icono: 'Folder',
    parentId: NO_PARENT_VALUE,
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
  const [activeId, setActiveId] = useState<string | null>(null); // ID del elemento arrastrado

  // Derived state for filtered categories
  const activeCategories = useMemo(() => categories.filter((c) => c.activa && c.visible !== false), [categories]);
  const activeRootCategories = useMemo(() => activeCategories.filter(c => !c.parentId), [activeCategories]);
  const archivedCategories = useMemo(() => categories.filter((c) => !c.activa && c.visible !== false), [categories]);
  const parentCategoryOptions = useMemo(() => categories.filter(
    (c) => c.visible !== false && !c.parentId && (!editingCategory || c.id !== editingCategory.id)
  ), [categories, editingCategory]);

  // Sensores para drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Si queremos preview optimista de mover entre contenedores, se implementaría aquí.
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    // Tipos de movimiento
    const isCategory = activeIdStr.startsWith('category-');
    const isMachine = activeIdStr.startsWith('machine-');

    if (activeIdStr === overIdStr) return;

    if (isCategory) {
       // Reordenar categorías 
       const activeData = active.data.current as SortableItemData;
       const overData = over.data.current as SortableItemData;
       
       const catId = activeIdStr.replace('category-', '');
       const targetId = overIdStr.replace('category-', '');

       if (activeData?.parentId === overData?.parentId) {
          const parentId = activeData?.parentId;
          // Buscar en el grupo correcto (root o hijos de parent)
          const siblings = activeCategories
            .filter(c => c.parentId === (parentId || undefined) || ((!c.parentId) && !parentId))
            .sort((a,b) => a.orden - b.orden);
          
          const oldIndex = siblings.findIndex(c => c.id === catId);
          const newIndex = siblings.findIndex(c => c.id === targetId);

          if (oldIndex !== -1 && newIndex !== -1) {
             const newOrder = arrayMove(siblings, oldIndex, newIndex).map(c => c.id);
             try {
                await reorderCategories(newOrder); 
                toast({ title: 'Orden actualizado' });
             } catch(e) {
                console.error(e);
                toast({ title: 'Error al reordenar', variant: 'destructive' });
             }
          }
       } else {
           // Mover categoría a otro grupo (Reparenting - sibling level)
           const newParentId = overData?.parentId || null;
           const category = activeCategories.find((c) => c.id === catId);
           const targetCategory = activeCategories.find((c) => c.id === targetId);
           
           if (category && targetCategory) {
               // Cycle Check
               let checkId = newParentId;
               let isCycle = false;
               while (checkId) {
                   if (checkId === catId) { isCycle = true; break; }
                   const p = activeCategories.find((c) => c.id === checkId);
                   checkId = p?.parentId || null;
               }
               
               if (isCycle) {
                   toast({ title: 'Acción no permitida', description: 'No puedes mover una categoría dentro de sus propios hijos.', variant: 'destructive' });
               } else if (confirm(`¿Mover "${category.nombre}" al nivel de "${targetCategory.nombre}"?`)) {
                   try {
                      await updateCategory(category.id, { 
                          parentId: newParentId,
                          nivel: targetCategory.nivel ?? 0
                      });
                      toast({ title: 'Categoría movida' });
                   } catch(e) {
                       console.error(e);
                       toast({ title: 'Error al mover', variant: 'destructive' });
                   }
               }
           }
       }
    }

    if (isMachine) {
       const machId = activeIdStr.replace('machine-', '');
       const activeMachine = machines.find(m => m.id === machId);
       
       if (!activeMachine) return;
       
       if (overIdStr.startsWith('machine-')) {
          const targetMachId = overIdStr.replace('machine-', '');
          const targetMachine = machines.find(m => m.id === targetMachId);
          
          if (targetMachine) {
            // Caso 1: Mismo category - Reordenar
            if (activeMachine.categoryId === targetMachine.categoryId) {
               const siblings = machines
                 .filter(m => m.categoryId === activeMachine.categoryId)
                 .sort((a,b) => a.orden - b.orden);
               
               const oldIndex = siblings.findIndex(m => m.id === machId);
               const newIndex = siblings.findIndex(m => m.id === targetMachId);
               
               const newOrderList = arrayMove(siblings, oldIndex, newIndex);
               await reorderMachines(newOrderList.map(m => m.id));
            } else {
               // Caso 2: Diferente category - Mover
               if (confirm(`¿Mover "${activeMachine.nombre}" a la categoría de "${targetMachine.nombre}"?`)) {
                   await updateMachine(activeMachine.id, { 
                     categoryId: targetMachine.categoryId 
                   });
                   toast({ title: 'Máquina movida de categoría' });
               }
            }
          }
       }
       else if (overIdStr.startsWith('category-')) {
           const targetCatId = overIdStr.replace('category-', '');
           if (activeMachine.categoryId !== targetCatId) {
               if (confirm(`¿Mover "${activeMachine.nombre}" a esta categoría?`)) {
                  await updateMachine(activeMachine.id, { 
                    categoryId: targetCatId 
                  });
                  toast({ title: 'Máquina movida de categoría' });
               }
           }
       }
    }
  };

  // ==================== HANDLERS CRUD (Copiados de implementación anterior) ====================

  const handleCreateCategory = async () => {
    try {
      const parentId =
        categoryFormData.parentId === NO_PARENT_VALUE ? null : categoryFormData.parentId;
      await createCategory({
        nombre: categoryFormData.nombre,
        descripcion: categoryFormData.descripcion,
        icono: categoryFormData.icono,
        orden: activeCategories.length,
        activa: true,
        visible: true,
        parentId,
        nivel: parentId ? 1 : 0,
      });
      toast({
        title: 'Categoría creada',
        description: `${categoryFormData.nombre} creada correctamente`,
      });
      setShowCategoryDialog(false);
      setCategoryFormData({ nombre: '', descripcion: '', icono: 'Folder', parentId: NO_PARENT_VALUE });
    } catch (error) {
      console.error('Error creating category:', error);
      toast({
        title: 'Error',
        description: 'No se pudo crear la categoría',
        variant: 'destructive',
      });
    }
  };

  const handleEditCategory = (category: MachineCategory) => {
    setEditingCategory(category);
    setCategoryFormData({
      nombre: category.nombre,
      descripcion: category.descripcion || '',
      icono: category.icono,
      parentId: category.parentId ?? NO_PARENT_VALUE,
    });
    setShowCategoryDialog(true);
  };

  const handleSaveEditCategory = async () => {
    if (!editingCategory) return;
    try {
      const parentId = categoryFormData.parentId === NO_PARENT_VALUE ? null : categoryFormData.parentId;
      await updateCategory(editingCategory.id, {
        nombre: categoryFormData.nombre,
        descripcion: categoryFormData.descripcion,
        icono: categoryFormData.icono,
        parentId,
        nivel: parentId ? 1 : 0,
      });
      toast({ title: 'Categoría actualizada', description: `${categoryFormData.nombre} actualizada correctamente` });
      setShowCategoryDialog(false);
      setEditingCategory(null);
      setCategoryFormData({ nombre: '', descripcion: '', icono: 'Folder', parentId: NO_PARENT_VALUE });
    } catch (error) {
      console.error('Error updating category:', error);
      toast({ title: 'Error', description: 'No se pudo actualizar la categoría', variant: 'destructive' });
    }
  };

  const handleToggleActiveCategory = async (category: MachineCategory) => {
    try {
      if (category.activa) {
        await archiveCategory(category.id);
        toast({ title: 'Categoría archivada', description: `${category.nombre} archivada correctamente` });
      } else {
        await reactivateCategory(category.id);
        toast({ title: 'Categoría reactivada', description: `${category.nombre} reactivada correctamente` });
      }
    } catch (error) {
      console.error('Error toggling category:', error);
      toast({ title: 'Error', description: 'No se pudo cambiar el estado de la categoría', variant: 'destructive' });
    }
  };

  const handleDeleteCategory = async (category: MachineCategory) => {
    const machineCount = getMachinesByCategory(category.id).length;
    if (machineCount > 0) {
      toast({ title: 'No se puede eliminar', description: `Esta categoría tiene ${machineCount} máquina(s) asignada(s). Elimínalas primero.`, variant: 'destructive' });
      return;
    }
    if (!confirm(`¿Eliminar la categoría "${category.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteCategory(category.id);
      toast({ title: 'Categoría eliminada', description: `${category.nombre} eliminada correctamente` });
    } catch (error) {
      console.error('Error deleting category:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar la categoría', variant: 'destructive' });
    }
  };

  const handleCreateMachine = (categoryId: string) => {
    setEditingMachine(null);
    setMachineFormData({ nombre: '', marca: '', modelo: '', descripcion: '', categoryId, color: '#3b82f6' });
    setShowMachineDialog(true);
  };

  const handleEditMachine = (machine: Machine) => {
    setEditingMachine(machine);
    setMachineFormData({
      nombre: machine.nombre || '', marca: machine.marca || '', modelo: machine.modelo || '',
      descripcion: machine.descripcion || '', categoryId: machine.categoryId || '', color: machine.color || '#3b82f6',
    });
    setShowMachineDialog(true);
  };

  const handleSaveMachine = async () => {
    try {
      const nombre = machineFormData.nombre.trim();
      const marca = machineFormData.marca.trim();
      const modelo = machineFormData.modelo.trim();
      if (!nombre || !marca || !modelo) {
        toast({ title: 'Error', description: 'Los campos Nombre, Marca y Modelo son obligatorios', variant: 'destructive' });
        return;
      }
      if (editingMachine) {
        await updateMachine(editingMachine.id, {
          nombre, marca, modelo, descripcion: machineFormData.descripcion, categoryId: machineFormData.categoryId, color: machineFormData.color,
        });
        toast({ title: 'Máquina actualizada', description: `${nombre} actualizada correctamente` });
      } else {
        await createMachine({
          nombre, marca, modelo, descripcion: machineFormData.descripcion, categoryId: machineFormData.categoryId, color: machineFormData.color, activa: true, orden: 0,
        });
        toast({ title: 'Máquina creada', description: `${nombre} creada correctamente` });
        setExpandedCategories((prev) => new Set(prev).add(machineFormData.categoryId));
      }
      setShowMachineDialog(false);
      setMachineFormData({ nombre: '', marca: '', modelo: '', descripcion: '', categoryId: '', color: '#3b82f6' });
    } catch (error) {
      console.error('Error saving machine:', error);
      toast({ title: 'Error', description: 'No se pudo guardar la máquina', variant: 'destructive' });
    }
  };

  const handleToggleActiveMachine = async (machine: Machine) => {
    try {
      if (machine.activa) {
        await archiveMachine(machine.id);
        toast({ title: 'Máquina archivada', description: `${machine.nombre} archivada correctamente` });
      } else {
        await reactivateMachine(machine.id);
        toast({ title: 'Máquina reactivada', description: `${machine.nombre} reactivada correctamente` });
      }
    } catch (error) {
      console.error('Error toggling machine:', error);
      toast({ title: 'Error', description: 'No se pudo cambiar el estado de la máquina', variant: 'destructive' });
    }
  };

  const handleDeleteMachine = async (machine: Machine) => {
    if (!confirm(`¿Eliminar la máquina "${machine.nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      await deleteMachine(machine.id);
      toast({ title: 'Máquina eliminada', description: `${machine.nombre} eliminada correctamente` });
    } catch (error) {
      console.error('Error deleting machine:', error);
      toast({ title: 'Error', description: 'No se pudo eliminar la máquina', variant: 'destructive' });
    }
  };

  if (loadingCategories || loadingMachines) {
    return <div className="py-8 text-center text-muted-foreground">Cargando...</div>;
  }

  const activeCategoryIds = activeRootCategories.map((c) => `category-${c.id}`);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Gestión de Categorías y Máquinas</h2>
          <p className="text-muted-foreground">
            Organiza tus máquinas en categorías. Haz clic en una categoría para ver sus máquinas.
          </p>
        </div>
        <Button onClick={() => {
          setCategoryFormData({ nombre: '', descripcion: '', icono: 'Folder', parentId: NO_PARENT_VALUE });
          setEditingCategory(null);
          setShowCategoryDialog(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva Categoría
        </Button>
      </div>

      <div className="grid gap-4">
        {/* Categorías Activas */}
        <h3 className="text-lg font-semibold">Categorías Activas ({activeCategories.length})</h3>
        
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={activeCategoryIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-3">
              {activeRootCategories.map((category) => (
                <SortableCategoryItem
                  key={category.id}
                  category={category}
                  machines={getMachinesByCategory(category.id)}
                  subcategories={activeCategories.filter(c => c.parentId === category.id)}
                  // Recursivos
                  allCategories={activeCategories}
                  getMachinesByCategory={getMachinesByCategory}
                  expandedCategories={expandedCategories}
                  toggleExpand={toggleExpand}
                  
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
          
          <DragOverlay>
             {activeId ? (
                <div className="p-4 bg-slate-800 rounded shadow-xl border border-slate-700 opacity-90">
                   {activeId.startsWith('category-') ? 'Moviendo categoría...' : 'Moviendo máquina...'}
                </div>
             ) : null}
          </DragOverlay>
        </DndContext>

        {activeCategories.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No hay categorías activas. Crea una nueva categoría para comenzar.
          </div>
        )}
      </div>

      {/* Máquinas sin Categoría */}
      {machines.some((m) => !m.categoryId || m.categoryId === '') && (
        <div>
           {/* Legacy: Máquinas sin categoría - Simplificado */}
           <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Máquinas sin Categoría
          </h3>
          <Card className="p-4 border-blue-900/50 bg-blue-900/10">
             <div className="space-y-2">
                {machines.filter(m => !m.categoryId).map(m => (
                   <div key={m.id} className="flex justify-between p-2 bg-slate-900/50 rounded">
                      <span>{m.nombre}</span>
                      <Button variant="ghost" size="sm" onClick={() => handleEditMachine(m)}><Pencil className="h-3 w-3"/></Button>
                   </div>
                ))}
             </div>
          </Card>
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
               <Label htmlFor="cat-parent">Categoría padre (opcional)</Label>
               <Select
                  value={categoryFormData.parentId}
                  onValueChange={(value) => setCategoryFormData({ ...categoryFormData, parentId: value })}
               >
                  <SelectTrigger id="cat-parent"><SelectValue placeholder="Sin categoría padre" /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value={NO_PARENT_VALUE}>Sin categoría padre</SelectItem>
                     {parentCategoryOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                  </SelectContent>
               </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-descripcion">Descripción</Label>
              <Input
                id="cat-descripcion"
                value={categoryFormData.descripcion}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, descripcion: e.target.value })}
              />
            </div>
            <div className="space-y-2">
               <Label htmlFor="cat-icono">Ícono (Lucide)</Label>
               <Input
                  id="cat-icono"
                  value={categoryFormData.icono}
                  onChange={(e) => setCategoryFormData({ ...categoryFormData, icono: e.target.value })}
               />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>Cancelar</Button>
            <Button onClick={editingCategory ? handleSaveEditCategory : handleCreateCategory} disabled={!categoryFormData.nombre.trim()}>
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
               <Input id="mach-nombre" value={machineFormData.nombre} onChange={(e) => setMachineFormData({...machineFormData, nombre: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="mach-marca">Marca *</Label>
                    <Input id="mach-marca" value={machineFormData.marca} onChange={(e) => setMachineFormData({...machineFormData, marca: e.target.value})} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="mach-modelo">Modelo *</Label>
                    <Input id="mach-modelo" value={machineFormData.modelo} onChange={(e) => setMachineFormData({...machineFormData, modelo: e.target.value})} />
                </div>
            </div>
            <div className="space-y-2">
               <Label htmlFor="mach-categoria">Categoría *</Label>
               <Select
                  value={machineFormData.categoryId}
                  onValueChange={(value) => setMachineFormData({ ...machineFormData, categoryId: value })}
               >
                  <SelectTrigger id="mach-categoria"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                  <SelectContent>
                     {activeCategories.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.nombre}</SelectItem>)}
                  </SelectContent>
               </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMachineDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveMachine} disabled={!machineFormData.nombre}>
              {editingMachine ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
