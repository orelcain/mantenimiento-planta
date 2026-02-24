import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { 
  Repuesto, 
  HistorialCambio, 
  RepuestoFormData,
  ImportCatalogoRow,
} from '@/types/repuestos';

const normalizeKey = (value: string) => value.trim().toUpperCase();

const toFiniteNumber = (value: unknown, defaultValue: number): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : defaultValue;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

const getCollectionPath = (machineId: string) => {
  return `machines/${machineId}/repuestos`;
};

export function useRepuestos(machineId: string | null) {
  const [repuestos, setRepuestos] = useState<Repuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Escuchar cambios en tiempo real
  useEffect(() => {
    if (!machineId) {
      setRepuestos([]);
      setLoading(false);
      return;
    }

    const collectionPath = getCollectionPath(machineId);
    const q = query(collection(db, collectionPath), orderBy('codigoSAP'));
    
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            ...d,
            // Backward compat: old docs may have codigoBaader instead of codigoFabricante
            codigoFabricante: d.codigoFabricante || d.codigoBaader || '',
            createdAt: d.createdAt?.toDate() || new Date(),
            updatedAt: d.updatedAt?.toDate() || new Date(),
          };
        }) as Repuesto[];
        
        setRepuestos(data);
        setLoading(false);
      },
      (err) => {
        console.error('Error getting repuestos:', err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [machineId]);

  // Agregar historial de cambios
  const addHistorial = useCallback(async (
    repuestoId: string, 
    campo: string, 
    valorAnterior: string | number | null | undefined, 
    valorNuevo: string | number | null | undefined
  ) => {
    if (!machineId) return;
    
    try {
      const collectionPath = getCollectionPath(machineId);
      const safeValorAnterior = valorAnterior === undefined ? null : valorAnterior;
      const safeValorNuevo = valorNuevo === undefined ? null : valorNuevo;
      
      await addDoc(collection(db, `${collectionPath}/${repuestoId}/historial`), {
        campo,
        valorAnterior: safeValorAnterior,
        valorNuevo: safeValorNuevo,
        fecha: Timestamp.now()
      });
    } catch (err) {
      console.error('Error adding historial:', err);
    }
  }, [machineId]);

  // Crear repuesto
  const createRepuesto = useCallback(async (data: RepuestoFormData): Promise<string> => {
    if (!machineId) throw new Error('Machine ID is required');
    
    try {
      const collectionPath = getCollectionPath(machineId);

      const newRepuesto = {
        codigoSAP: data.codigoSAP,
        codigoFabricante: data.codigoFabricante,
        textoBreve: data.textoBreve,
        descripcion: data.descripcion || '',
        nombreManual: data.nombreManual || '',
        valorUnitario: data.valorUnitario,
        cantidadPorMaquina: data.cantidadPorMaquina || 0,
        ubicacionEnPlanta: data.ubicacionEnPlanta || '',
        vinculosManual: [],
        imagenesManual: [],
        fotosReales: [],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, collectionPath), newRepuesto);
      await addHistorial(docRef.id, 'creacion', null, JSON.stringify(data));
      
      return docRef.id;
    } catch (err) {
      console.error('Error creating repuesto:', err);
      throw err;
    }
  }, [machineId, addHistorial]);

  // Actualizar repuesto
  const updateRepuesto = useCallback(async (
    id: string, 
    data: Partial<Repuesto>,
    originalData?: Repuesto
  ) => {
    if (!machineId) throw new Error('Machine ID is required');
    
    try {
      const collectionPath = getCollectionPath(machineId);
      const updateData = {
        ...data,
        updatedAt: Timestamp.now()
      };

      await updateDoc(doc(db, collectionPath, id), updateData as any);

      // Registrar cambios en historial
      if (originalData) {
        for (const key of Object.keys(data) as (keyof Repuesto)[]) {
          if (data[key] !== originalData[key]) {
            await addHistorial(
              id, 
              key, 
              originalData[key] as string | number | null, 
              data[key] as string | number | null
            );
          }
        }
      }
    } catch (err) {
      console.error('Error updating repuesto:', err);
      throw err;
    }
  }, [machineId, addHistorial]);

  // Eliminar repuesto
  const deleteRepuesto = useCallback(async (id: string) => {
    if (!machineId) throw new Error('Machine ID is required');
    
    try {
      const collectionPath = getCollectionPath(machineId);
      // Primero eliminar el historial
      const historialRef = collection(db, `${collectionPath}/${id}/historial`);
      const historialSnapshot = await getDocs(historialRef);
      
      const batch = writeBatch(db);
      historialSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // Luego eliminar el repuesto
      await deleteDoc(doc(db, collectionPath, id));
    } catch (err) {
      console.error('Error deleting repuesto:', err);
      throw err;
    }
  }, [machineId]);

  // Obtener historial de un repuesto
  const getHistorial = useCallback(async (repuestoId: string): Promise<HistorialCambio[]> => {
    if (!machineId) return [];
    
    try {
      const collectionPath = getCollectionPath(machineId);
      const q = query(
        collection(db, `${collectionPath}/${repuestoId}/historial`),
        orderBy('fecha', 'desc')
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        repuestoId,
        ...doc.data(),
        fecha: doc.data().fecha?.toDate() || new Date()
      })) as HistorialCambio[];
    } catch (err) {
      console.error('Error getting historial:', err);
      return [];
    }
  }, [machineId]);

  // Importar repuestos masivamente (para carga inicial)
  const importRepuestos = useCallback(async (data: RepuestoFormData[]) => {
    if (!machineId) throw new Error('Machine ID is required');
    
    try {
      const collectionPath = getCollectionPath(machineId);
      const batch = writeBatch(db);
      
      for (const item of data) {
        const docRef = doc(collection(db, collectionPath));
        batch.set(docRef, {
          codigoSAP: item.codigoSAP,
          codigoFabricante: item.codigoFabricante,
          textoBreve: item.textoBreve,
          descripcion: item.descripcion || '',
          valorUnitario: item.valorUnitario,
          cantidadPorMaquina: item.cantidadPorMaquina || 0,
          ubicacionEnPlanta: item.ubicacionEnPlanta || '',
          vinculosManual: [],
          imagenesManual: [],
          fotosReales: [],
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        });
      }

      await batch.commit();
    } catch (err) {
      console.error('Error importing repuestos:', err);
      throw err;
    }
  }, [machineId]);

  // Importar solo al catálogo desde Excel. Crea repuesto si no existe.
  const importCatalogoDesdeExcel = useCallback(async (args: {
    rows: ImportCatalogoRow[];
    placeholder?: string;
  }) => {
    if (!machineId) throw new Error('Machine ID is required');

    const { rows, placeholder = 'pendiente' } = args;
    const collectionPath = getCollectionPath(machineId);

    const normalizeText = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

    const bySAP = new Map<string, Repuesto>();
    const byBaader = new Map<string, Repuesto>();
    const byText = new Map<string, Repuesto>();
    repuestos.forEach((r) => {
      if (r.codigoSAP && r.codigoSAP !== placeholder) bySAP.set(normalizeKey(r.codigoSAP), r);
      if (r.codigoFabricante && r.codigoFabricante !== placeholder) byBaader.set(normalizeKey(r.codigoFabricante), r);
      
      const textKey = normalizeText(r.descripcion || r.textoBreve || '');
      if (textKey.length > 5) {
        byText.set(textKey, r);
      }
    });

    const ops = rows.map((row) => {
      const codigoSAP = (row.codigoSAP || '').trim() || placeholder;
      const codigoFabricante = (row.codigoFabricante || '').trim() || placeholder;
      const keySAP = codigoSAP !== placeholder ? normalizeKey(codigoSAP) : '';
      const keyBaader = codigoFabricante !== placeholder ? normalizeKey(codigoFabricante) : '';

      let existing = (keySAP && bySAP.get(keySAP)) || (keyBaader && byBaader.get(keyBaader)) || null;
      
      const valorUnitario = Math.max(0, toFiniteNumber(row.valorUnitario, 0));
      const cantidadPorMaquina = Math.max(0, toFiniteNumber(row.cantidadPorMaquina, 0));
      const textoBreve = (row.textoBreve || '').trim();
      const descripcion = (row.descripcion || '').trim();
      const ubicacionEnPlanta = (row.ubicacionEnPlanta || '').trim();
      const forceOverride = row.forceOverride || {};
      
      if (!existing && codigoSAP === placeholder && codigoFabricante === placeholder) {
        const textKey = normalizeText(descripcion || textoBreve || '');
        if (textKey.length > 5) {
          existing = byText.get(textKey) || null;
        }
      }

      return { existing, codigoSAP, codigoFabricante, valorUnitario, cantidadPorMaquina, textoBreve, descripcion, ubicacionEnPlanta, forceOverride };
    });

    const chunks = chunk(ops, 400);
    for (const batchOps of chunks) {
      const batch = writeBatch(db);

      for (const op of batchOps) {
        if (op.existing) {
          const r = op.existing;
          const nextValorUnitario = op.forceOverride.valorUnitario ? op.valorUnitario : (r.valorUnitario === 0 && op.valorUnitario > 0 ? op.valorUnitario : r.valorUnitario);
          const nextCodigoSAP = op.forceOverride.codigoSAP ? op.codigoSAP : (r.codigoSAP === placeholder && op.codigoSAP !== placeholder ? op.codigoSAP : r.codigoSAP);
          const nextCodigoFabricante = op.forceOverride.codigoFabricante ? op.codigoFabricante : (r.codigoFabricante === placeholder && op.codigoFabricante !== placeholder ? op.codigoFabricante : r.codigoFabricante);
          const nextTextoBreve = op.forceOverride.textoBreve ? op.textoBreve : ((!r.textoBreve || r.textoBreve.trim().length === 0) && op.textoBreve ? op.textoBreve : r.textoBreve);
          const nextDescripcion = op.forceOverride.descripcion 
            ? op.descripcion 
            : ((!r.descripcion || r.descripcion.trim().length === 0) ? (op.descripcion || op.textoBreve || r.descripcion) : r.descripcion);

          batch.update(doc(db, collectionPath, r.id), {
            codigoSAP: nextCodigoSAP,
            codigoFabricante: nextCodigoFabricante,
            textoBreve: nextTextoBreve,
            descripcion: nextDescripcion,
            valorUnitario: nextValorUnitario,
            cantidadPorMaquina: op.cantidadPorMaquina > 0 ? op.cantidadPorMaquina : (r.cantidadPorMaquina || 0),
            ubicacionEnPlanta: op.ubicacionEnPlanta || r.ubicacionEnPlanta || '',
            updatedAt: Timestamp.now()
          });
        } else {
          const docRef = doc(collection(db, collectionPath));

          batch.set(docRef, {
            codigoSAP: op.codigoSAP,
            codigoFabricante: op.codigoFabricante,
            textoBreve: op.textoBreve || '',
            descripcion: op.descripcion || op.textoBreve || '',
            valorUnitario: op.valorUnitario,
            cantidadPorMaquina: op.cantidadPorMaquina,
            ubicacionEnPlanta: op.ubicacionEnPlanta,
            vinculosManual: [],
            imagenesManual: [],
            fotosReales: [],
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
          });
        }
      }

      await batch.commit();
    }
  }, [machineId, repuestos]);

  // Reubicar un repuesto a otra máquina (copia datos + historial, borra original)
  const relocateRepuesto = useCallback(async (repuestoId: string, targetMachineId: string): Promise<string> => {
    if (!machineId) throw new Error('Machine ID de origen es requerido');
    if (machineId === targetMachineId) throw new Error('La máquina destino es la misma que la actual');

    const sourcePath = getCollectionPath(machineId);
    const targetPath = getCollectionPath(targetMachineId);

    // 1. Leer el doc original
    const sourceRef = doc(db, sourcePath, repuestoId);
    const sourceSnap = await getDoc(sourceRef);
    if (!sourceSnap.exists()) throw new Error('Repuesto no encontrado');

    const data = sourceSnap.data();

    // 2. Crear en la máquina destino (sin id, sin createdAt/updatedAt — se regeneran)
    const { ...repData } = data;
    delete repData.createdAt;
    delete repData.updatedAt;

    const newDocRef = await addDoc(collection(db, targetPath), {
      ...repData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // 3. Copiar subcollection historial
    const historialSnap = await getDocs(collection(db, `${sourcePath}/${repuestoId}/historial`));
    if (!historialSnap.empty) {
      const batch = writeBatch(db);
      historialSnap.docs.forEach(h => {
        const hRef = doc(collection(db, `${targetPath}/${newDocRef.id}/historial`));
        batch.set(hRef, h.data());
      });
      await batch.commit();
    }

    // 4. Registrar reubicación en historial del nuevo doc
    await addDoc(collection(db, `${targetPath}/${newDocRef.id}/historial`), {
      campo: 'reubicacion',
      valorAnterior: machineId,
      valorNuevo: targetMachineId,
      fecha: Timestamp.now(),
    });

    // 5. Borrar historial y doc de la máquina de origen
    if (!historialSnap.empty) {
      const delBatch = writeBatch(db);
      historialSnap.docs.forEach(h => delBatch.delete(h.ref));
      await delBatch.commit();
    }
    await deleteDoc(sourceRef);

    return newDocRef.id;
  }, [machineId]);

  // Reubicar múltiples repuestos a otra máquina
  const bulkRelocateRepuestos = useCallback(async (repuestoIds: string[], targetMachineId: string): Promise<number> => {
    let moved = 0;
    for (const id of repuestoIds) {
      await relocateRepuesto(id, targetMachineId);
      moved++;
    }
    return moved;
  }, [relocateRepuesto]);

  return {
    repuestos,
    loading,
    error,
    createRepuesto,
    updateRepuesto,
    deleteRepuesto,
    getHistorial,
    importRepuestos,
    importCatalogoDesdeExcel,
    relocateRepuesto,
    bulkRelocateRepuestos,
  };
}
