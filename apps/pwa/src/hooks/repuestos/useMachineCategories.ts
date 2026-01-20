/**
 * Hook useMachineCategories - CRUD de categorías de máquinas
 * 
 * Características:
 * - Listener en tiempo real (onSnapshot)
 * - CRUD completo (create, update, delete)
 * - Reordenamiento (drag & drop)
 * - Activar/Desactivar categorías
 */

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  writeBatch,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { MachineCategory } from '@/types/repuestos';

const COLLECTION_NAME = 'machineCategories';

export function useMachineCategories() {
  const [categories, setCategories] = useState<MachineCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cargar todas las categorías
  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);

      const q = query(collection(db, COLLECTION_NAME), orderBy('orden', 'asc'));
      const snapshot = await getDocs(q);

      const categoriesData = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          nombre: data.nombre,
          descripcion: data.descripcion || '',
          icono: data.icono || 'Folder',
          orden: data.orden || 0,
          activa: data.activa !== false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate(),
        } as MachineCategory;
      });

      setCategories(categoriesData);
    } catch (err) {
      console.error('Error fetching machine categories:', err);
      setError('Error al cargar las categorías');
    } finally {
      setLoading(false);
    }
  };

  // Obtener una categoría por ID
  const getCategory = async (categoryId: string): Promise<MachineCategory | null> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, categoryId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const data = docSnap.data();
      return {
        id: docSnap.id,
        nombre: data.nombre,
        descripcion: data.descripcion || '',
        icono: data.icono || 'Folder',
        orden: data.orden || 0,
        activa: data.activa !== false,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate(),
      } as MachineCategory;
    } catch (err) {
      console.error(`Error fetching category ${categoryId}:`, err);
      throw new Error('Error al obtener la categoría');
    }
  };

  // Crear nueva categoría
  const createCategory = async (
    categoryData: Omit<MachineCategory, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> => {
    try {
      // Generar ID slug desde el nombre
      const id = categoryData.nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // quitar acentos
        .replace(/[^a-z0-9\s-]/g, '') // quitar caracteres especiales
        .trim()
        .replace(/\s+/g, '-'); // espacios a guiones

      // Calcular orden automáticamente
      const maxOrden =
        categories.length > 0 ? Math.max(...categories.map((c) => c.orden)) : -1;

      const newCategory = {
        nombre: categoryData.nombre,
        descripcion: categoryData.descripcion || '',
        icono: categoryData.icono || 'Folder',
        orden: categoryData.orden ?? maxOrden + 1,
        activa: categoryData.activa ?? true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = doc(db, COLLECTION_NAME, id);
      await setDoc(docRef, newCategory);

      return id;
    } catch (err) {
      console.error('Error creating category:', err);
      throw new Error('Error al crear la categoría');
    }
  };

  // Actualizar categoría
  const updateCategory = async (
    categoryId: string,
    updates: Partial<Omit<MachineCategory, 'id' | 'createdAt'>>
  ): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, categoryId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error(`Error updating category ${categoryId}:`, err);
      throw new Error('Error al actualizar la categoría');
    }
  };

  // Eliminar categoría (físico)
  const deleteCategory = async (categoryId: string): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, categoryId);
      await deleteDoc(docRef);
    } catch (err) {
      console.error(`Error deleting category ${categoryId}:`, err);
      throw new Error('Error al eliminar la categoría');
    }
  };

  // Archivar categoría (lógico)
  const archiveCategory = async (categoryId: string): Promise<void> => {
    await updateCategory(categoryId, { activa: false });
  };

  // Reactivar categoría
  const reactivateCategory = async (categoryId: string): Promise<void> => {
    await updateCategory(categoryId, { activa: true });
  };

  // Reordenar categorías (para drag & drop)
  const reorderCategories = async (newOrder: string[]): Promise<void> => {
    try {
      const batch = writeBatch(db);

      newOrder.forEach((categoryId, index) => {
        const docRef = doc(db, COLLECTION_NAME, categoryId);
        batch.update(docRef, {
          orden: index,
          updatedAt: Timestamp.now(),
        });
      });

      await batch.commit();
    } catch (err) {
      console.error('Error reordering categories:', err);
      throw new Error('Error al reordenar las categorías');
    }
  };

  // Obtener solo categorías activas
  const getActiveCategories = (): MachineCategory[] => {
    return categories.filter((c) => c.activa);
  };

  // Verificar si existe una categoría
  const categoryExists = (categoryId: string): boolean => {
    return categories.some((c) => c.id === categoryId);
  };

  // Listener en tiempo real para cambios en categorías
  useEffect(() => {
    setLoading(true);

    const q = query(collection(db, COLLECTION_NAME), orderBy('orden', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const categoriesData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            nombre: data.nombre,
            descripcion: data.descripcion || '',
            icono: data.icono || 'Folder',
            orden: data.orden || 0,
            activa: data.activa !== false,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate(),
          } as MachineCategory;
        });

        setCategories(categoriesData);
        setLoading(false);
      },
      (err) => {
        console.error('Error en listener de categorías:', err);
        setError('Error al cargar las categorías');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return {
    categories,
    loading,
    error,
    fetchCategories,
    getCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    archiveCategory,
    reactivateCategory,
    reorderCategories,
    getActiveCategories,
    categoryExists,
  };
}
