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
import { Plus, Pencil, Trash2, Archive, ArchiveRestore, GripVertical, ChevronDown, ChevronRight, Wrench, MoreVertical, FolderPlus, ClipboardList, Camera, FileText } from 'lucide-react';
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
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
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui';

// Tipos para Drag & Drop
type SortableItemData = {
  type: 'category' | 'machine' | 'subcategory';
  item: MachineCategory | Machine;
  parentId?: string; // Para subcategorías o máquinas
};

// --- COMPONENTE ITEM DE MÁQUINA (Compacto) ---
function SortableMachineItem({
  machine,
  onEdit,
  onToggleActive,
  onDelete,
  onOpenSpecs,
  onOpenGallery
}: {
  machine: Machine;
  onEdit: (m: Machine) => void;
  onToggleActive: (m: Machine) => void;
  onDelete: (m: Machine) => void;
  onOpenSpecs: (m: Machine) => void;
  onOpenGallery: (m: Machine) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `machine-${machine.id}`,
    data: { type: 'machine', item: machine, parentId: machine.categoryId }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 py-2 px-2 border-b border-border/40 hover:bg-muted/50 transition-colors ${!machine.activa ? 'opacity-60 bg-muted/20' : 'bg-card'}`}
    >
      {/* Drag Handle */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/50 hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Indicador Color */}
      <div className="w-1.5 h-6 rounded-full shrink-0" style={{ backgroundColor: machine.color || '#3b82f6' }} />

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-2">
           <span className="font-medium text-sm leading-none truncate">{machine.nombre}</span>
           {!machine.activa && <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 border-orange-500/50 text-orange-500">Archivada</Badge>}
        </div>
        <span className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
          {machine.marca} {machine.modelo}
        </span>
      </div>

      {/* Acciones Rápidas */}
      <div className="flex items-center">
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20" 
          onClick={() => onOpenSpecs(machine)} 
          title="Ficha Técnica"
        >
          <ClipboardList className="h-4 w-4" />
        </Button>
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-900/20" 
          onClick={() => onOpenGallery(machine)} 
          title="Galería"
        >
          <Camera className="h-4 w-4" />
        </Button>

        {/* Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(machine)}>
              <Pencil className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(machine)}>
               {machine.activa ? <><Archive className="mr-2 h-4 w-4"/> Archivar</> : <><ArchiveRestore className="mr-2 h-4 w-4"/> Reactivar</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(machine)} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// --- COMPONENTE ITEM DE CATEGORÍA (Compacto & Recursivo) ---
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
  onOpenSpecs,
  onOpenGallery,
  onCreateSubcategory,
  allCategories,
  getMachinesByCategory,
  expandedCategories,
  toggleExpand,
  depth = 0
}: {
  category: MachineCategory;
  machines: Machine[];
  subcategories: MachineCategory[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditCategory: (c: MachineCategory) => void;
  onToggleActiveCategory: (c: MachineCategory) => void;
  onDeleteCategory: (c: MachineCategory) => void;
  onCreateMachine: (catId: string) => void;
  onEditMachine: (m: Machine) => void;
  onToggleActiveMachine: (m: Machine) => void;
  onDeleteMachine: (m: Machine) => void;
  onOpenSpecs: (m: Machine) => void;
  onOpenGallery: (m: Machine) => void;
  onCreateSubcategory: (parentId: string) => void;
  allCategories: MachineCategory[];
  getMachinesByCategory: (id: string) => Machine[];
  expandedCategories: Set<string>;
  toggleExpand: (id: string) => void;
  depth?: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: `category-${category.id}`,
    data: { type: 'category', item: category, parentId: category.parentId }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
  };

  const activeMachines = machines.filter(m => m.activa);
  const sortedMachines = [...machines].sort((a,b) => a.orden - b.orden);
  const sortedSubcategories = [...subcategories]
    .filter(c => c.activa)
    .sort((a,b) => a.orden - b.orden);

  const hasChildren = sortedMachines.length > 0 || sortedSubcategories.length > 0;
  
  // Estilos visuales según profundidad
  const isRoot = depth === 0;
  const containerClasses = isRoot
    ? 'bg-card border border-border shadow-sm mb-3' 
    : 'mt-2 border border-border/60 bg-muted/20 ml-3'; // Subcategorías: marco propio y sangría

  return (
    <div ref={setNodeRef} style={style} className={`rounded-lg transition-colors ${containerClasses} ${!category.activa ? 'opacity-60' : ''} ${isOver ? 'ring-2 ring-primary/50 bg-accent' : ''}`}>
      
      {/* Header Compacto */}
      <div className={`flex items-center p-2 gap-2 min-h-[3rem] rounded-t-lg ${depth > 0 ? '': ''}`}>
        
        {/* Drag */}
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/50 hover:text-foreground">
           <GripVertical className="h-4 w-4" />
        </div>

        {/* Expand / Title */}
         <div className="flex-1 flex items-center min-w-0 gap-2 cursor-pointer select-none" onClick={onToggleExpand}>
            <div className="p-1 rounded-sm hover:bg-muted text-muted-foreground transition-colors">
               {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
            
            <div className="flex flex-col truncate">
               <span className={`font-semibold truncate text-sm ${depth === 0 ? 'text-foreground' : 'text-foreground/90'}`}>
                  {category.nombre}
               </span>
               <span className="text-[10px] text-muted-foreground">
                  {activeMachines.length} equipos • {sortedSubcategories.length} subcat.
               </span>
            </div>
         </div>

         {/* Actions Menu */}
        <DropdownMenu>
           <DropdownMenuTrigger asChild>
             <Button variant="ghost" size="icon" className="h-8 w-8">
               <MoreVertical className="h-4 w-4" />
             </Button>
           </DropdownMenuTrigger>
           <DropdownMenuContent align="end">
              <DropdownMenuLabel>Acciones</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => onCreateSubcategory(category.id)}>
                 <FolderPlus className="mr-2 h-4 w-4" /> Subcategoría
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateMachine(category.id)}>
                 <Wrench className="mr-2 h-4 w-4" /> Equipo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onEditCategory(category)}>
                 <Pencil className="mr-2 h-4 w-4" /> Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onToggleActiveCategory(category)}>
                 {category.activa ? <><Archive className="mr-2 h-4 w-4"/> Archivar</> : <><ArchiveRestore className="mr-2 h-4 w-4"/> Reactivar</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDeleteCategory(category)} className="text-destructive focus:text-destructive">
                 <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </DropdownMenuItem>
           </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Contenido Expandible */}
      {isExpanded && (
        <div className={`px-2 pb-2 ${isRoot ? '' : ''}`}>
            {/* Subcategorías */}
            <SortableContext items={sortedSubcategories.map(c => `category-${c.id}`)} strategy={verticalListSortingStrategy}>
               {sortedSubcategories.map(subcat => (
                  <SortableCategoryItem
                    key={subcat.id}
                    category={subcat}
                    machines={getMachinesByCategory(subcat.id)}
                    subcategories={allCategories.filter(c => c.parentId === subcat.id)}
                    isExpanded={expandedCategories.has(subcat.id)}
                    onToggleExpand={() => toggleExpand(subcat.id)}
                    onEditCategory={onEditCategory}
                    onToggleActiveCategory={onToggleActiveCategory}
                    onDeleteCategory={onDeleteCategory}
                    onCreateMachine={onCreateMachine}
                    onEditMachine={onEditMachine}
                    onToggleActiveMachine={onToggleActiveMachine}
                    onDeleteMachine={onDeleteMachine}
                    onOpenSpecs={onOpenSpecs}
                    onOpenGallery={onOpenGallery}
                    onCreateSubcategory={onCreateSubcategory}
                    allCategories={allCategories}
                    getMachinesByCategory={getMachinesByCategory}
                    expandedCategories={expandedCategories}
                    toggleExpand={toggleExpand}
                    depth={depth + 1}
                  />
               ))}
            </SortableContext>

            {/* Máquinas */}
            <SortableContext items={sortedMachines.map(m => `machine-${m.id}`)} strategy={verticalListSortingStrategy}>
               <div className="flex flex-col gap-1 mt-1">
                  {sortedMachines.map(machine => (
                     <SortableMachineItem
                        key={machine.id}
                        machine={machine}
                        onEdit={onEditMachine}
                        onToggleActive={onToggleActiveMachine}
                        onDelete={onDeleteMachine}
                        onOpenSpecs={onOpenSpecs}
                        onOpenGallery={onOpenGallery}
                     />
                  ))}
               </div>
            </SortableContext>
            
            {!hasChildren && (
               <div className="text-xs text-muted-foreground py-2 pl-4 italic">
                  Vacío. <span className="underline cursor-pointer" onClick={() => onCreateMachine(category.id)}>Agregar equipo</span>
               </div>
            )}
        </div>
      )}
    </div>
  );
}

// Componente principal CategoryManager
// --- CONTAINER PRINCIPAL ---
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
    icono: '', // Default vacío, no se usan iconos
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
  const [activeId, setActiveId] = useState<string | null>(null);
  
  // Estados para Ficha Técnica y Galería
  const [showSpecsDialog, setShowSpecsDialog] = useState(false);
  const [showGalleryDialog, setShowGalleryDialog] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);

  const handleOpenSpecs = (m: Machine) => {
    setSelectedMachine(m);
    setShowSpecsDialog(true);
  };

  const handleOpenGallery = (m: Machine) => {
    setSelectedMachine(m);
    setShowGalleryDialog(true);
  };

  // Filtros
  const activeCategories = useMemo(() => categories.filter((c) => c.activa && (c.visible !== false)), [categories]);
  const activeRootCategories = useMemo(() => activeCategories.filter(c => !c.parentId), [activeCategories]);

  // Construir opciones jerárquicas
  const hierarchicalOptions = useMemo(() => {
    const buildOptions = (parentId: string | null = null, depth = 0): {id: string, nombre: string, depth: number}[] => {
        const children = activeCategories
           .filter(c => (c.parentId || null) === parentId)
           .sort((a,b) => a.orden - b.orden);
        
        let result: {id: string, nombre: string, depth: number}[] = [];
        children.forEach(child => {
            result.push({ id: child.id, nombre: child.nombre, depth });
            result = [...result, ...buildOptions(child.id, depth + 1)];
        });
        return result;
    };
    return buildOptions(null, 0);
  }, [activeCategories]);

  // Drag & Drop Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleExpand = (categoryId: string) => {
    setExpandedCategories((prev) => {
       const newSet = new Set(prev);
       if (newSet.has(categoryId)) newSet.delete(categoryId);
       else newSet.add(categoryId);
       return newSet;
    });
  };

  const getMachinesByCategory = (categoryId: string) => machines.filter((m) => m.categoryId === categoryId);

  // --- DRAG END LOGIC ---
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);
    const isCategory = activeIdStr.startsWith('category-');
    const isMachine = activeIdStr.startsWith('machine-');

    if (activeIdStr === overIdStr) return;

    if (isCategory) {
       const activeData = active.data.current as SortableItemData;
       const overData = over.data.current as SortableItemData;
       const catId = activeIdStr.replace('category-', '');
       const targetId = overIdStr.replace('category-', '');

       if (activeData?.parentId === overData?.parentId) {
          const parentId = activeData?.parentId;
          const siblings = activeCategories
            .filter(c => c.parentId === (parentId || undefined) || ((!c.parentId) && !parentId))
            .sort((a,b) => a.orden - b.orden);
          
          const oldIndex = siblings.findIndex(c => c.id === catId);
          const newIndex = siblings.findIndex(c => c.id === targetId);
          if (oldIndex !== -1 && newIndex !== -1) {
             const newOrder = arrayMove(siblings, oldIndex, newIndex).map(c => c.id);
             await reorderCategories(newOrder).catch(() => toast({ title: 'Error', variant: 'destructive' }));
          }
       } else {
           // Reparenting Logic
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
               if (isCycle) return toast({ title: 'Error cíclico', description: 'No puedes mover una categoría dentro de sus hijos.', variant: 'destructive' });
               
               if (confirm(`¿Mover "${category.nombre}" al nivel de "${targetCategory.nombre}"?`)) {
                   await updateCategory(category.id, { parentId: newParentId, nivel: targetCategory.nivel ?? 0 });
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
            if (activeMachine.categoryId === targetMachine.categoryId) {
               const siblings = machines.filter(m => m.categoryId === activeMachine.categoryId).sort((a,b) => a.orden - b.orden);
               const oldIndex = siblings.findIndex(m => m.id === machId);
               const newIndex = siblings.findIndex(m => m.id === targetMachId);
               await reorderMachines(arrayMove(siblings, oldIndex, newIndex).map(m => m.id));
            } else {
               if (confirm(`¿Mover "${activeMachine.nombre}" a "${targetMachine.nombre}"?`)) {
                   await updateMachine(activeMachine.id, { categoryId: targetMachine.categoryId });
               }
            }
          }
       } else if (overIdStr.startsWith('category-')) {
           const targetCatId = overIdStr.replace('category-', '');
           if (activeMachine.categoryId !== targetCatId) {
               if (confirm(`¿Mover "${activeMachine.nombre}" a esta categoría?`)) {
                  await updateMachine(activeMachine.id, { categoryId: targetCatId });
               }
           }
       }
    }
  };

  // --- CRUD HANDLERS SIMPLIFICADOS ---
  const handleCreateCategory = async () => {
      const parentId = categoryFormData.parentId === NO_PARENT_VALUE ? null : categoryFormData.parentId;
      try {
        await createCategory({
            ...categoryFormData,
            orden: activeCategories.length,
            activa: true,
            visible: true,
            parentId,
            nivel: parentId ? 1 : 0
        });
        toast({ title: 'Categoría creada' });
        setShowCategoryDialog(false);
      } catch { toast({ title: 'Error', variant: 'destructive' }); }
  };
  const handleEditCategory = (c: MachineCategory) => {
      setEditingCategory(c);
      setCategoryFormData({ ...c, parentId: c.parentId ?? NO_PARENT_VALUE, descripcion: c.descripcion || '' });
      setShowCategoryDialog(true);
  };
  const handleSaveEditCategory = async () => {
      if (!editingCategory) return;
      const parentId = categoryFormData.parentId === NO_PARENT_VALUE ? null : categoryFormData.parentId;
      try {
          await updateCategory(editingCategory.id, { ...categoryFormData, parentId, nivel: parentId ? 1 : 0 });
          toast({ title: 'Categoría actualizada' });
          setShowCategoryDialog(false);
      } catch { toast({ title: 'Error', variant: 'destructive' }); }
  };
  const handleToggleActiveCategory = async (c: MachineCategory) => {
      try {
          if (c.activa) await archiveCategory(c.id); else await reactivateCategory(c.id);
          toast({ title: c.activa ? 'Archivada' : 'Reactivada' });
      } catch { toast({ title: 'Error', variant: 'destructive' }); }
  };
  const handleDeleteCategory = async (c: MachineCategory) => {
      if (getMachinesByCategory(c.id).length > 0) return toast({ title: 'No vacía', description: 'Elimina las máquinas primero.', variant: 'destructive' });
      if (confirm('¿Eliminar?')) await deleteCategory(c.id);
  };
  
  const handleCreateMachine = (catId: string) => {
      setEditingMachine(null);
      setMachineFormData({ nombre: '', marca: '', modelo: '', descripcion: '', categoryId: catId, color: '#3b82f6' });
      setShowMachineDialog(true);
  };
  const handleEditMachine = (m: Machine) => {
      setEditingMachine(m);
      setMachineFormData({ ...m, categoryId: m.categoryId || '', descripcion: m.descripcion||'' });
      setShowMachineDialog(true);
  };
  const handleSaveMachine = async () => {
      try {
          if (editingMachine) {
              await updateMachine(editingMachine.id, machineFormData);
              toast({ title: 'Máquina actualizada' });
          } else {
              await createMachine({ ...machineFormData, activa: true, orden: 0 });
              toast({ title: 'Máquina creada' });
              setExpandedCategories(prev => new Set(prev).add(machineFormData.categoryId));
          }
          setShowMachineDialog(false);
      } catch { toast({ title: 'Error', variant: 'destructive' }); }
  };
  const handleToggleActiveMachine = async (m: Machine) => {
       if (m.activa) await archiveMachine(m.id); else await reactivateMachine(m.id);
  };
  const handleDeleteMachine = async (m: Machine) => {
      if (confirm('¿Eliminar máquina?')) await deleteMachine(m.id);
  };

  const activeCategoryIds = activeRootCategories.map((c) => `category-${c.id}`);

  if (loadingCategories || loadingMachines) return <div className="text-center py-8">Cargando...</div>;

  return (
    <div className="flex flex-col h-full bg-background/50">
      <div className="flex items-center justify-between mb-4 sticky top-0 bg-background z-10 py-2 border-b">
        <h2 className="text-lg font-bold">Estructura</h2>
        <Button size="sm" onClick={() => {
          setCategoryFormData({ nombre: '', descripcion: '', icono: '', parentId: NO_PARENT_VALUE });
          setEditingCategory(null);
          setShowCategoryDialog(true);
        }}>
          <Plus className="mr-1 h-3 w-3" /> Nueva
        </Button>
      </div>

      <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin} // Mejor detección para anidamiento (drop target)
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-y-auto pr-1">
             <SortableContext items={activeCategoryIds} strategy={verticalListSortingStrategy}>
               {activeRootCategories.map((category) => (
                 <SortableCategoryItem
                   key={category.id}
                   category={category}
                   machines={getMachinesByCategory(category.id)}
                   subcategories={activeCategories.filter(c => c.parentId === category.id)}
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
                   onOpenSpecs={handleOpenSpecs}
                   onOpenGallery={handleOpenGallery}
                   onCreateSubcategory={(parentId) => {
                       setCategoryFormData({ nombre: '', descripcion: '', icono: '', parentId });
                       setEditingCategory(null);
                       setShowCategoryDialog(true);
                   }}
                 />
               ))}
             </SortableContext>
          </div>
          
          <DragOverlay>
             {activeId ? (
                <div className="p-3 bg-card border rounded shadow-xl opacity-90 text-sm">
                   Moviendo...
                </div>
             ) : null}
          </DragOverlay>
      </DndContext>

      {/* DIALOGS - Simplified for brevity */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
         <DialogContent className="max-w-sm">
            <DialogHeader>
                <DialogTitle>
                    {editingCategory ? 'Editar Categoría' : (categoryFormData.parentId !== NO_PARENT_VALUE ? 'Nueva Subcategoría' : 'Nueva Categoría')}
                </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
               <div><Label>Nombre</Label><Input value={categoryFormData.nombre} onChange={e=>setCategoryFormData({...categoryFormData, nombre:e.target.value})} /></div>
               <div><Label>Padre</Label>
               <Select value={categoryFormData.parentId} onValueChange={v=>setCategoryFormData({...categoryFormData, parentId:v})}>
                  <SelectTrigger><SelectValue placeholder="Raíz" /></SelectTrigger>
                  <SelectContent>
                     <SelectItem value={NO_PARENT_VALUE}>Raíz</SelectItem>
                     {hierarchicalOptions.map(o=><SelectItem key={o.id} value={o.id}><span style={{paddingLeft:o.depth*10}}>{o.nombre}</span></SelectItem>)}
                  </SelectContent>
               </Select>
               </div>
            </div>
            <DialogFooter><Button onClick={editingCategory?handleSaveEditCategory:handleCreateCategory}>Guardar</Button></DialogFooter>
         </DialogContent>
      </Dialog>
      
      <Dialog open={showMachineDialog} onOpenChange={setShowMachineDialog}>
         <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editingMachine?'Editar':'Nueva'} Máquina</DialogTitle></DialogHeader>
            <div className="space-y-3 py-2">
                <div><Label>Nombre</Label><Input value={machineFormData.nombre} onChange={e=>setMachineFormData({...machineFormData, nombre:e.target.value})}/></div>
                <div className="grid grid-cols-2 gap-2">
                   <div><Label>Marca</Label><Input value={machineFormData.marca} onChange={e=>setMachineFormData({...machineFormData, marca:e.target.value})}/></div>
                   <div><Label>Modelo</Label><Input value={machineFormData.modelo} onChange={e=>setMachineFormData({...machineFormData, modelo:e.target.value})}/></div>
                </div>
                <div><Label>Categoría</Label>
                   <Select value={machineFormData.categoryId} onValueChange={v=>setMachineFormData({...machineFormData, categoryId:v})}>
                     <SelectTrigger><SelectValue/></SelectTrigger>
                     <SelectContent>{hierarchicalOptions.map(o=><SelectItem key={o.id} value={o.id}><span style={{paddingLeft:o.depth*10}}>{o.nombre}</span></SelectItem>)}</SelectContent>
                   </Select>
                </div>
            </div>
            <DialogFooter><Button onClick={handleSaveMachine}>Guardar</Button></DialogFooter>
         </DialogContent>
      </Dialog>

      {/* Diálogo Ficha Técnica */}
      <Dialog open={showSpecsDialog} onOpenChange={setShowSpecsDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-blue-500" />
                    Datos Técnicos: {selectedMachine?.nombre}
                </DialogTitle>
            </DialogHeader>
            <div className="py-8">
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-muted rounded-lg bg-muted/10 text-center">
                    <div className="bg-blue-500/10 p-4 rounded-full mb-4">
                        <ClipboardList className="h-8 w-8 text-blue-500" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1">Módulo de Ficha Técnica</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-4">
                        Aquí podrás gestionar las especificaciones técnicas (Motor, Bomba, Cinta, etc.) y campos personalizados.
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" disabled><FileText className="mr-2 h-4 w-4"/> Generar PDF (Pronto)</Button>
                        <Button size="sm" disabled>Configurar Campos</Button>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setShowSpecsDialog(false)}>Cerrar</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Galería */}
      <Dialog open={showGalleryDialog} onOpenChange={setShowGalleryDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    <Camera className="h-5 w-5 text-amber-500" />
                    Galería e Imágenes: {selectedMachine?.nombre}
                </DialogTitle>
            </DialogHeader>
            <div className="py-8">
                 <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-muted rounded-lg bg-muted/10 text-center">
                    <div className="bg-amber-500/10 p-4 rounded-full mb-4">
                        <Camera className="h-8 w-8 text-amber-500" />
                    </div>
                    <h3 className="font-semibold text-lg mb-1">Galería de Imágenes</h3>
                    <p className="text-muted-foreground max-w-sm mx-auto mb-4">
                        Aquí podrás subir fotos de placas, equipos y evidencias visuales.
                    </p>
                    <Button size="sm" disabled>Subir Imagen</Button>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setShowGalleryDialog(false)}>Cerrar</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
