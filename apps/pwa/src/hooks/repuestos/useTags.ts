import { useState, useEffect, useCallback, useMemo } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { TagGlobal, Repuesto } from '@/types/repuestos';
import { isTagAsignado } from '@/types/repuestos';

// Tags iniciales por defecto (se usan si no hay datos en Firestore)
const DEFAULT_TAGS: TagGlobal[] = [
  { nombre: 'Overhaul temporada baja', tipo: 'solicitud', createdAt: new Date() },
  { nombre: 'Urgentes este mes', tipo: 'solicitud', createdAt: new Date() },
  { nombre: 'Críticos', tipo: 'solicitud', createdAt: new Date() },
  { nombre: 'En espera proveedor', tipo: 'solicitud', createdAt: new Date() },
  { nombre: 'Pedido realizado', tipo: 'solicitud', createdAt: new Date() },
  { nombre: 'Stock mínimo', tipo: 'stock', createdAt: new Date() },
  { nombre: 'Stock actual', tipo: 'stock', createdAt: new Date() },
  { nombre: 'Preventivo mensual', tipo: 'solicitud', createdAt: new Date() }
];

// Construir ruta del documento dinámicamente por máquina
const getSettingsDocPath = (machineId: string) => {
  // COMPATIBILIDAD TEMPORAL: Para Baader 200, usar ruta antigua
  if (machineId === 'baader-200') {
    return 'settings/tags';
  }
  return `machines/${machineId}/settings/tags`;
};

// Helper para migrar tags antiguos (strings) al nuevo formato
function migrateOldTags(tags: (string | TagGlobal)[]): TagGlobal[] {
  return tags.map(tag => {
    if (typeof tag === 'string') {
      // Inferir tipo basado en el nombre
      const tipo = tag.toLowerCase().includes('stock') ? 'stock' : 'solicitud';
      return { nombre: tag, tipo, createdAt: new Date() };
    }
    return tag;
  });
}

export function useTags(repuestos?: Repuesto[], machineId?: string | null) {
  const [tags, setTags] = useState<TagGlobal[]>(DEFAULT_TAGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Extraer tags únicos de los repuestos que no están en la lista global
  const tagsEnUso = useMemo(() => {
    if (!repuestos) return [];
    
    const tagMap = new Map<string, TagGlobal>();
    
    repuestos.forEach(rep => {
      (rep.tags || []).forEach(tag => {
        const nombre = isTagAsignado(tag) ? tag.nombre : tag;
        const tipo = isTagAsignado(tag) ? tag.tipo : (nombre.toLowerCase().includes('stock') ? 'stock' : 'solicitud');
        
        if (!tagMap.has(nombre)) {
          tagMap.set(nombre, { nombre, tipo, createdAt: new Date() });
        }
      });
    });
    
    return Array.from(tagMap.values());
  }, [repuestos]);

  // Combinar tags globales con tags en uso
  const allTags = useMemo(() => {
    const combined = [...tags];
    
    tagsEnUso.forEach(tagEnUso => {
      if (!combined.some(t => t.nombre === tagEnUso.nombre)) {
        combined.push(tagEnUso);
      }
    });
    
    return combined.sort((a, b) => 
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [tags, tagsEnUso]);

  // Escuchar cambios en tiempo real
  useEffect(() => {
    if (!machineId) {
      setTags(DEFAULT_TAGS);
      setLoading(false);
      return;
    }

    const docPath = getSettingsDocPath(machineId);
    const docRef = doc(db, docPath);
    
    const unsubscribe = onSnapshot(docRef, 
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          // Migrar si es formato antiguo (array de strings)
          const rawTags = data.tags || DEFAULT_TAGS;
          const migratedTags = migrateOldTags(rawTags);
          setTags(migratedTags);
          
          // Si hubo migración, guardar el nuevo formato
          if (rawTags.some((t: unknown) => typeof t === 'string')) {
            setDoc(docRef, { 
              tags: migratedTags, 
              updatedAt: new Date() 
            }).catch(console.error);
          }
        } else {
          // Si no existe el documento, crearlo con tags por defecto
          setDoc(docRef, { 
            tags: DEFAULT_TAGS, 
            updatedAt: new Date() 
          }).catch(console.error);
          setTags(DEFAULT_TAGS);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error getting tags:', err);
        setError(err.message);
        setLoading(false);
        // Usar tags por defecto si hay error
        setTags(DEFAULT_TAGS);
      }
    );

    return () => unsubscribe();
  }, [machineId]);

  // Guardar tags en Firestore
  const saveTags = useCallback(async (newTags: TagGlobal[]) => {
    if (!machineId) return;

    try {
      const docPath = getSettingsDocPath(machineId);
      const docRef = doc(db, docPath);
      await setDoc(docRef, { 
        tags: newTags, 
        updatedAt: new Date() 
      });
      return true;
    } catch (err) {
      console.error('Error saving tags:', err);
      setError((err as Error).message);
      return false;
    }
  }, [machineId]);

  // Agregar un tag nuevo si no existe
  const addTag = useCallback(async (nombre: string, tipo: 'solicitud' | 'stock' = 'solicitud') => {
    const trimmedNombre = nombre.trim();
    if (!trimmedNombre || tags.some(t => t.nombre === trimmedNombre)) {
      return false; // Tag vacío o ya existe
    }
    
    const newTag: TagGlobal = { nombre: trimmedNombre, tipo, createdAt: new Date() };
    const updatedTags = [...tags, newTag].sort((a, b) => 
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
    return await saveTags(updatedTags);
  }, [tags, saveTags]);

  // Eliminar un tag
  const removeTag = useCallback(async (tagNombre: string) => {
    const updatedTags = tags.filter(t => t.nombre !== tagNombre);
    return await saveTags(updatedTags);
  }, [tags, saveTags]);

  // Renombrar un tag
  const renameTag = useCallback(async (oldNombre: string, newNombre: string) => {
    const trimmedNew = newNombre.trim();
    if (!trimmedNew || (tags.some(t => t.nombre === trimmedNew) && trimmedNew !== oldNombre)) {
      return false; // Tag vacío o ya existe otro con ese nombre
    }
    
    const updatedTags = tags.map(t => 
      t.nombre === oldNombre ? { ...t, nombre: trimmedNew } : t
    ).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    return await saveTags(updatedTags);
  }, [tags, saveTags]);

  // Cambiar el tipo de un tag
  const changeTagTipo = useCallback(async (tagNombre: string, nuevoTipo: 'solicitud' | 'stock') => {
    const updatedTags = tags.map(t => 
      t.nombre === tagNombre ? { ...t, tipo: nuevoTipo } : t
    );
    return await saveTags(updatedTags);
  }, [tags, saveTags]);

  // Agregar múltiples tags a la vez (útil para importación)
  const addMultipleTags = useCallback(async (newTags: { nombre: string; tipo: 'solicitud' | 'stock' }[]) => {
    const uniqueNewTags = newTags
      .filter(t => t.nombre.trim() && !tags.some(existing => existing.nombre === t.nombre.trim()))
      .map(t => ({ ...t, nombre: t.nombre.trim(), createdAt: new Date() }));
    
    if (uniqueNewTags.length === 0) return true;
    
    const updatedTags = [...tags, ...uniqueNewTags].sort((a, b) => 
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
    
    return await saveTags(updatedTags);
  }, [tags, saveTags]);

  // Obtener tipo de cualquier tag (global o en uso)
  const getTagTipoAll = useCallback((tagNombre: string): 'solicitud' | 'stock' | null => {
    const tag = allTags.find(t => t.nombre === tagNombre);
    return tag ? tag.tipo : null;
  }, [allTags]);

  return {
    tags: allTags,  // Retornar todos los tags (globales + en uso)
    tagsGlobales: tags,  // Solo los guardados en Firestore
    tagsEnUso,  // Solo los encontrados en repuestos
    loading,
    error,
    addTag,
    removeTag,
    renameTag,
    changeTagTipo,
    getTagTipo: getTagTipoAll,  // Usar la versión que busca en todos
    addMultipleTags,
    saveTags,
    DEFAULT_TAGS
  };
}
