/**
 * MachineHierarchySelector.tsx
 * 
 * Selector y creador jerárquico para el módulo de Repuestos.
 * Permite:
 * - Crear SUBCATEGORÍAS dentro de categorías existentes
 * - Crear EQUIPOS dentro de cualquier categoría/subcategoría
 * - Navegar por la jerarquía de machineCategories
 * 
 * Usa la colección 'machineCategories' para gestionar la estructura.
 */

import { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Loader2, FolderPlus, Plus, Folder, Settings2 } from 'lucide-react';
import { db } from '@/services/firebase';
import { collection, getDocs, addDoc, Timestamp, doc, setDoc } from 'firebase/firestore';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui';

interface MachineHierarchySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMachineCreated?: (machine: Machine) => void;
  onSubcategoryCreated?: (category: MachineCategory) => void;
  loading?: boolean;
  categoryId?: string; // Categoría padre inicial
}

export function MachineHierarchySelector({
  open,
  onOpenChange,
  onMachineCreated,
  onSubcategoryCreated,
  loading = false,
  categoryId,
}: MachineHierarchySelectorProps) {
  const [categories, setCategories] = useState<MachineCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [activeTab, setActiveTab] = useState<'equipo' | 'subcategoria'>('equipo');

  // Estado del formulario - navegación jerárquica
  const [selectedPath, setSelectedPath] = useState<string[]>([]); // IDs desde raíz hasta ubicación
  const [selectedValue, setSelectedValue] = useState<string>('');
  
  // Formulario de equipo
  const [equipoData, setEquipoData] = useState({
    nombre: '',
    marca: '',
    modelo: '',
    descripcion: '',
  });

  // Formulario de subcategoría
  const [subcatData, setSubcatData] = useState({
    nombre: '',
    descripcion: '',
    icono: 'Folder',
  });

  // Cargar categorías
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

  // Inicializar path cuando se abre el modal con categoryId
  useEffect(() => {
    if (open && categoryId) {
      setSelectedPath([categoryId]);
    } else if (!open) {
      setSelectedPath([]);
    }
  }, [open, categoryId]);

  // Calcular el parentId actual - IMPORTANTE: usar categoryId como fallback
  const currentParentId = useMemo(() => {
    if (selectedPath.length > 0) {
      return selectedPath[selectedPath.length - 1];
    }
    // Fallback: si no hay path pero sí categoryId, usar categoryId
    return categoryId || null;
  }, [selectedPath, categoryId]);

  // Obtener hijos del nodo actual
  const currentChildren = useMemo(() => {
    return categories.filter(c => c.parentId === currentParentId);
  }, [categories, currentParentId]);

  // Categorías raíz (sin padre)
  const rootCategories = useMemo(() => {
    return categories.filter(c => !c.parentId);
  }, [categories]);

  // Opciones a mostrar (subcategorías del nodo actual)
  const optionsToShow = useMemo(() => {
    // Si hay un parentId (ya sea del path o del categoryId), mostrar sus hijos
    if (currentParentId) {
      return currentChildren;
    }
    // Si no hay nada seleccionado, mostrar raíces
    return rootCategories;
  }, [currentParentId, currentChildren, rootCategories]);

  // Nodos del path para breadcrumb - incluir categoryId inicial si está presente
  const pathNodes = useMemo(() => {
    const pathToUse = selectedPath.length > 0 ? selectedPath : (categoryId ? [categoryId] : []);
    return pathToUse.map(id => categories.find(c => c.id === id)).filter(Boolean) as MachineCategory[];
  }, [selectedPath, categories, categoryId]);

  // Nodo actual seleccionado - usar categoryId como fallback
  const currentNode = useMemo(() => {
    const nodeId = selectedPath.length > 0 
      ? selectedPath[selectedPath.length - 1] 
      : categoryId;
    if (!nodeId) return null;
    return categories.find(c => c.id === nodeId) || null;
  }, [selectedPath, categories, categoryId]);

  // Calcular nivel actual para la nueva subcategoría
  const currentLevel = useMemo(() => {
    if (currentNode) return (currentNode.nivel ?? 0) + 1;
    return 0;
  }, [currentNode]);

  const handleSelectNode = (nodeId: string) => {
    // Si no hay path pero sí categoryId, iniciar el path con categoryId primero
    if (selectedPath.length === 0 && categoryId) {
      setSelectedPath([categoryId, nodeId]);
    } else {
      setSelectedPath([...selectedPath, nodeId]);
    }
    setSelectedValue('');
  };

  const handleGoBack = () => {
    setSelectedPath(prev => {
      const newPath = prev.slice(0, -1);
      // Si después de retroceder quedamos en el categoryId inicial, mantenerlo
      if (newPath.length === 0 && categoryId) {
        return [categoryId];
      }
      return newPath;
    });
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setSelectedPath(categoryId ? [categoryId] : []);
    setSelectedValue('');
    setEquipoData({ nombre: '', marca: '', modelo: '', descripcion: '' });
    setSubcatData({ nombre: '', descripcion: '', icono: 'Folder' });
    setActiveTab('equipo');
  };

  // Crear equipo
  const handleCreateEquipo = async () => {
    if (!equipoData.nombre) return;

    try {
      const newMachine: Partial<Machine> = {
        nombre: equipoData.nombre,
        marca: equipoData.marca,
        modelo: equipoData.modelo,
        descripcion: equipoData.descripcion,
        categoryId: currentParentId || categoryId || undefined,
        activa: true,
        color: '#3b82f6',
        orden: 0,
        createdAt: Timestamp.now() as any,
        updatedAt: Timestamp.now() as any,
      };

      const machinesCollection = collection(db, 'machines');
      const docRef = await addDoc(machinesCollection, newMachine);
      
      const createdMachine: Machine = {
        id: docRef.id,
        ...newMachine,
      } as Machine;

      if (onMachineCreated) {
        onMachineCreated(createdMachine);
      }

      onOpenChange(false);
      resetForm();
    } catch (err) {
      console.error('Error al crear equipo:', err);
    }
  };

  // Crear subcategoría
  const handleCreateSubcategoria = async () => {
    if (!subcatData.nombre) return;

    try {
      // Generar ID slug
      const slug = subcatData.nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      const catId = `${slug}-${Date.now().toString(36)}`;

      const newCategory: Omit<MachineCategory, 'id'> = {
        nombre: subcatData.nombre,
        descripcion: subcatData.descripcion || `Subcategoría de ${currentNode?.nombre || 'raíz'}`,
        icono: subcatData.icono,
        orden: currentChildren.length,
        activa: true,
        parentId: currentParentId || null,
        nivel: currentLevel,
      };

      // Guardar en Firestore
      await setDoc(doc(db, 'machineCategories', catId), {
        ...newCategory,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const createdCategory: MachineCategory = {
        id: catId,
        ...newCategory,
      };

      // Actualizar lista local
      setCategories(prev => [...prev, createdCategory]);

      if (onSubcategoryCreated) {
        onSubcategoryCreated(createdCategory);
      }

      // Limpiar form pero mantener el modal abierto para seguir creando
      setSubcatData({ nombre: '', descripcion: '', icono: 'Folder' });
      
      // Navegar a la subcategoría recién creada
      setSelectedPath([...selectedPath, catId]);

    } catch (err) {
      console.error('Error al crear subcategoría:', err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestión de Categorías y Equipos</DialogTitle>
          <DialogDescription>
            Crea subcategorías para organizar o agrega equipos directamente
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'equipo' | 'subcategoria')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="equipo" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Nuevo Equipo
            </TabsTrigger>
            <TabsTrigger value="subcategoria" className="flex items-center gap-2">
              <FolderPlus className="h-4 w-4" />
              Nueva Subcategoría
            </TabsTrigger>
          </TabsList>

          {/* CONTENIDO COMÚN: Navegación */}
          <div className="mt-4 space-y-4">
            {/* BREADCRUMB: Ubicación actual */}
            {pathNodes.length > 0 && (
              <div className="space-y-2 p-3 bg-slate-800/50 rounded-lg">
                <Label className="text-xs uppercase tracking-wide text-slate-400">
                  <Folder className="h-3 w-3 inline mr-1" />
                  Ubicación actual:
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

            {/* SELECTOR: Navegar más profundo si hay subcategorías */}
            {(optionsToShow.length > 0 || loadingCategories) && (
              <div className="space-y-2">
                <Label className="text-sm">
                  {selectedPath.length === 0
                    ? 'Selecciona una categoría (opcional):'
                    : currentChildren.length > 0 
                      ? 'Navegar a subcategoría (opcional):'
                      : 'No hay subcategorías'}
                </Label>
                {loadingCategories ? (
                  <div className="flex items-center justify-center gap-2 p-4 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Cargando...</span>
                  </div>
                ) : optionsToShow.length > 0 ? (
                  <Select value={selectedValue} onValueChange={handleSelectNode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona para navegar más profundo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {optionsToShow.map((option) => {
                        const hasChildren = categories.some(c => c.parentId === option.id);
                        return (
                          <SelectItem key={option.id} value={option.id}>
                            {option.nombre}
                            {hasChildren && ' 📁'}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Esta categoría no tiene subcategorías. Puedes crear una o agregar un equipo aquí.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* TAB: Nuevo Equipo */}
          <TabsContent value="equipo" className="space-y-4 mt-4">
            <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-700/50">
              <p className="text-xs text-blue-300">
                📍 El equipo se creará en: <strong>{currentNode?.nombre || 'Raíz (sin categoría)'}</strong>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="equipo-nombre">Nombre del equipo *</Label>
                <Input
                  id="equipo-nombre"
                  placeholder="ej: Bomba caseta mar 40/26"
                  value={equipoData.nombre}
                  onChange={e => setEquipoData({ ...equipoData, nombre: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="equipo-marca">Marca</Label>
                <Input
                  id="equipo-marca"
                  placeholder="ej: SEW, Siemens, etc."
                  value={equipoData.marca}
                  onChange={e => setEquipoData({ ...equipoData, marca: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="equipo-modelo">Modelo</Label>
                <Input
                  id="equipo-modelo"
                  placeholder="ej: IE3 90L"
                  value={equipoData.modelo}
                  onChange={e => setEquipoData({ ...equipoData, modelo: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="equipo-descripcion">Descripción</Label>
                <Input
                  id="equipo-descripcion"
                  placeholder="ej: Motor trifásico para bombeo"
                  value={equipoData.descripcion}
                  onChange={e => setEquipoData({ ...equipoData, descripcion: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateEquipo}
                disabled={!equipoData.nombre || loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear equipo
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* TAB: Nueva Subcategoría */}
          <TabsContent value="subcategoria" className="space-y-4 mt-4">
            <div className="p-3 bg-amber-900/20 rounded-lg border border-amber-700/50">
              <p className="text-xs text-amber-300">
                📁 La subcategoría se creará dentro de: <strong>{currentNode?.nombre || 'Raíz (nivel 0)'}</strong>
              </p>
              <p className="text-xs text-amber-400 mt-1">
                Nivel: {currentLevel}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="subcat-nombre">Nombre de la subcategoría *</Label>
                <Input
                  id="subcat-nombre"
                  placeholder="ej: Bombas de agua, Motores SEW, etc."
                  value={subcatData.nombre}
                  onChange={e => setSubcatData({ ...subcatData, nombre: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="subcat-descripcion">Descripción (opcional)</Label>
                <Input
                  id="subcat-descripcion"
                  placeholder="ej: Bombas para sistema de agua de mar"
                  value={subcatData.descripcion}
                  onChange={e => setSubcatData({ ...subcatData, descripcion: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="subcat-icono">Icono</Label>
                <Select 
                  value={subcatData.icono} 
                  onValueChange={(v) => setSubcatData({ ...subcatData, icono: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Folder">📁 Carpeta</SelectItem>
                    <SelectItem value="Cog">⚙️ Engranaje</SelectItem>
                    <SelectItem value="Zap">⚡ Energía</SelectItem>
                    <SelectItem value="Droplet">💧 Agua</SelectItem>
                    <SelectItem value="Wind">💨 Aire</SelectItem>
                    <SelectItem value="Thermometer">🌡️ Temperatura</SelectItem>
                    <SelectItem value="Factory">🏭 Fábrica</SelectItem>
                    <SelectItem value="Wrench">🔧 Herramienta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreateSubcategoria}
                disabled={!subcatData.nombre || loading}
                variant="secondary"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creando...
                  </>
                ) : (
                  <>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Crear subcategoría
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
