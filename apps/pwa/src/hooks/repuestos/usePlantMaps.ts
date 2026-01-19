import { useCallback, useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { PlantMap } from '@/types/repuestos';

const COLLECTION_NAME = 'plantMaps';

const fromDoc = (id: string, data: Record<string, unknown>): PlantMap => {
  return {
    id,
    nombre: String(data.nombre ?? ''),
    imageUrl: String(data.imageUrl ?? ''),
    createdAt: (data.createdAt as any)?.toDate?.() || new Date(),
    updatedAt: (data.updatedAt as any)?.toDate?.() || undefined
  };
};

export function usePlantMaps() {
  const [items, setItems] = useState<PlantMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, COLLECTION_NAME), orderBy('nombre', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => fromDoc(d.id, d.data() as any));
        setItems(next);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e instanceof Error ? e.message : 'Error cargando planos');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const createMap = useCallback(async (args: { nombre: string; imageUrl: string }) => {
    const now = new Date();
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      nombre: args.nombre,
      imageUrl: args.imageUrl,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    });
    return docRef.id;
  }, []);

  const updateMap = useCallback(async (id: string, patch: Partial<Pick<PlantMap, 'nombre' | 'imageUrl'>>) => {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      ...patch,
      updatedAt: Timestamp.fromDate(new Date())
    } as any);
  }, []);

  const deleteMap = useCallback(async (id: string) => {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }, []);

  return { maps: items, loading, error, createMap, updateMap, deleteMap };
}
