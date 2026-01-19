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
import type { PlantMapArea, PlantMapAreaPoint, PlantMapAreaShape } from '@/types/repuestos';

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const toDate = (v: unknown): Date | undefined => {
  const d = (v as any)?.toDate?.();
  return d instanceof Date ? d : undefined;
};

const normalizePoint = (p: any): PlantMapAreaPoint => {
  const x = typeof p?.x === 'number' ? p.x : 0;
  const y = typeof p?.y === 'number' ? p.y : 0;
  return { x: clamp01(x), y: clamp01(y) };
};

const normalizeShape = (data: Record<string, unknown>): PlantMapAreaShape => {
  const kind = String(data.kind ?? 'polygon');
  if (kind === 'circle') {
    const cx = typeof data.cx === 'number' ? data.cx : 0.5;
    const cy = typeof data.cy === 'number' ? data.cy : 0.5;
    const r = typeof data.r === 'number' ? data.r : 0.05;
    return { kind: 'circle', cx: clamp01(cx), cy: clamp01(cy), r: Math.max(0, r) };
  }

  const pointsRaw = Array.isArray(data.points) ? (data.points as any[]) : [];
  const points = pointsRaw.map(normalizePoint).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return { kind: 'polygon', points };
};

const fromDoc = (mapId: string, id: string, data: Record<string, unknown>): PlantMapArea => {
  const nombre = String(data.nombre ?? '').trim() || 'Área';
  const visible = data.visible == null ? true : Boolean(data.visible);
  const fillOpacity = typeof data.fillOpacity === 'number' ? data.fillOpacity : 0.18;
  const strokeOpacity = typeof data.strokeOpacity === 'number' ? data.strokeOpacity : 0.7;

  const shape = normalizeShape(data);

  return {
    id,
    mapId,
    nombre,
    visible,
    fillOpacity: Math.max(0, Math.min(1, fillOpacity)),
    strokeOpacity: Math.max(0, Math.min(1, strokeOpacity)),
    shape,
    createdAt: toDate(data.createdAt) || new Date(),
    updatedAt: toDate(data.updatedAt)
  };
};

export function usePlantMapAreas(mapId: string | null | undefined) {
  const [areas, setAreas] = useState<PlantMapArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapId) {
      setAreas([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'plantMaps', mapId, 'areas'), orderBy('nombre', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => fromDoc(mapId, d.id, d.data() as any));
        setAreas(next);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e instanceof Error ? e.message : 'Error cargando áreas');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [mapId]);

  const createArea = useCallback(
    async (args: Omit<PlantMapArea, 'id' | 'createdAt' | 'updatedAt'>) => {
      if (!mapId) throw new Error('mapId requerido');
      const now = new Date();
      const payload: any = {
        nombre: String(args.nombre ?? '').trim() || 'Área',
        visible: Boolean(args.visible),
        fillOpacity: Number.isFinite(args.fillOpacity) ? args.fillOpacity : 0.18,
        strokeOpacity: Number.isFinite(args.strokeOpacity) ? args.strokeOpacity : 0.7,
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now)
      };

      if (args.shape.kind === 'circle') {
        payload.kind = 'circle';
        payload.cx = clamp01(args.shape.cx);
        payload.cy = clamp01(args.shape.cy);
        payload.r = Math.max(0, args.shape.r);
        payload.points = [];
      } else {
        payload.kind = 'polygon';
        payload.points = (args.shape.points || []).map((p) => normalizePoint(p));
        payload.cx = 0;
        payload.cy = 0;
        payload.r = 0;
      }

      const docRef = await addDoc(collection(db, 'plantMaps', mapId, 'areas'), payload);
      return docRef.id;
    },
    [mapId]
  );

  const updateArea = useCallback(
    async (id: string, patch: Partial<Omit<PlantMapArea, 'id' | 'mapId' | 'createdAt'>>) => {
      if (!mapId) throw new Error('mapId requerido');
      const payload: any = {
        updatedAt: Timestamp.fromDate(new Date())
      };

      if (patch.nombre !== undefined) payload.nombre = String(patch.nombre ?? '').trim();
      if (patch.visible !== undefined) payload.visible = Boolean(patch.visible);
      if (patch.fillOpacity !== undefined && typeof patch.fillOpacity === 'number') payload.fillOpacity = patch.fillOpacity;
      if (patch.strokeOpacity !== undefined && typeof patch.strokeOpacity === 'number') payload.strokeOpacity = patch.strokeOpacity;

      if (patch.shape) {
        if (patch.shape.kind === 'circle') {
          payload.kind = 'circle';
          payload.cx = clamp01(patch.shape.cx);
          payload.cy = clamp01(patch.shape.cy);
          payload.r = Math.max(0, patch.shape.r);
          payload.points = [];
        } else {
          payload.kind = 'polygon';
          payload.points = (patch.shape.points || []).map((p) => normalizePoint(p));
          payload.cx = 0;
          payload.cy = 0;
          payload.r = 0;
        }
      }

      await updateDoc(doc(db, 'plantMaps', mapId, 'areas', id), payload);
    },
    [mapId]
  );

  const deleteArea = useCallback(
    async (id: string) => {
      if (!mapId) throw new Error('mapId requerido');
      await deleteDoc(doc(db, 'plantMaps', mapId, 'areas', id));
    },
    [mapId]
  );

  return { areas, loading, error, createArea, updateArea, deleteArea };
}
