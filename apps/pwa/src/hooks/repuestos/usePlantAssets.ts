import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { PlantAsset, PlantAssetImagen, PlantAssetReferencia, PlantAssetTipo, PlantMarker } from '@/types/repuestos';

const COLLECTION_NAME = 'plantAssets';

const newId = () => {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toDate = (v: unknown): Date => (v as any)?.toDate?.() || new Date();

const cleanText = (v: unknown, fallback = '') => {
  const s = String(v ?? fallback);
  const t = s.trim();
  if (!t) return '';
  if (t.toLowerCase() === 'pendiente') return '';
  return s;
};

const fromDoc = (id: string, data: Record<string, unknown>): PlantAsset => {
  return {
    id,
    tipo: (data.tipo as PlantAssetTipo) || 'motor',
    equipo: cleanText(data.equipo),
    area: cleanText(data.area),
    subarea: cleanText(data.subarea),
    hierarchyNodeId: data.hierarchyNodeId ? String(data.hierarchyNodeId) : undefined,
    hierarchyPath: data.hierarchyPath ? String(data.hierarchyPath) : undefined,
    componente: cleanText(data.componente),
    codigoSAP: cleanText(data.codigoSAP),
    descripcionSAP: cleanText(data.descripcionSAP),
    marca: cleanText(data.marca),
    modeloTipo: cleanText(data.modeloTipo),
    potencia: cleanText(data.potencia),
    voltaje: cleanText(data.voltaje),
    corriente: cleanText(data.corriente),
    eje: cleanText(data.eje),
    relacionReduccion: cleanText(data.relacionReduccion),
    caudalM3h: cleanText(data.caudalM3h),
    alturaM: cleanText(data.alturaM),
    acople: cleanText(data.acople),
    alturaBaseCentroEjeMm: cleanText(data.alturaBaseCentroEjeMm),
    observaciones: cleanText(data.observaciones),
    referencias: Array.isArray(data.referencias)
      ? (data.referencias as any[]).map((r) => ({
          id: String(r.id ?? ''),
          titulo: String(r.titulo ?? ''),
          url: String(r.url ?? ''),
          createdAt: toDate(r.createdAt)
        }))
      : [],
    imagenes: Array.isArray(data.imagenes)
      ? (data.imagenes as any[]).map((img) => ({
          id: String(img.id ?? ''),
          url: String(img.url ?? ''),
          descripcion: String(img.descripcion ?? ''),
          orden: Number.isFinite(img.orden) ? Number(img.orden) : 0,
          esPrincipal: Boolean(img.esPrincipal),
          createdAt: toDate(img.createdAt)
        }))
      : [],
    marcadores: Array.isArray(data.marcadores)
      ? (data.marcadores as any[]).map((m) => ({
          id: String(m.id ?? ''),
          mapId: String(m.mapId ?? ''),
          x: typeof m.x === 'number' ? m.x : 0,
          y: typeof m.y === 'number' ? m.y : 0,
          label: m.label != null ? String(m.label) : undefined,
          createdAt: toDate(m.createdAt)
        }))
      : [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt)
  };
};

const normalizeKey = (v: string) => v.toLowerCase().replace(/\s+/g, '').trim();
const normalizeText = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const hashDjb2 = (str: string) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

export const makePlantAssetKey = (
  asset: Pick<PlantAsset, 'tipo' | 'codigoSAP' | 'equipo' | 'area' | 'subarea' | 'descripcionSAP' | 'marca' | 'modeloTipo' | 'potencia' | 'voltaje'>
) => {
  const fields = [
    asset.tipo || '',
    normalizeKey(asset.codigoSAP || ''),
    normalizeText(asset.equipo || ''),
    normalizeText(asset.area || ''),
    normalizeText(asset.subarea || ''),
    normalizeText(asset.descripcionSAP || ''),
    normalizeText(asset.marca || ''),
    normalizeText(asset.modeloTipo || ''),
    normalizeText(asset.potencia || ''),
    normalizeText(asset.voltaje || '')
  ];
  return hashDjb2(fields.join('|'));
};

const stripUndefinedDeep = (value: unknown): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((v) => stripUndefinedDeep(v))
      .filter((v) => v !== undefined);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }

  return value;
};

export function usePlantAssets() {
  const [items, setItems] = useState<PlantAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, COLLECTION_NAME), orderBy('area', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => fromDoc(d.id, d.data() as any));
        setItems(next);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setError(e instanceof Error ? e.message : 'Error cargando motores/bombas');
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const byKey = useMemo(() => {
    const m = new Map<string, PlantAsset>();
    for (const item of items) m.set(makePlantAssetKey(item), item);
    return m;
  }, [items]);

  const createAsset = useCallback(async (data: Omit<PlantAsset, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = new Date();
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...data,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now)
    } as any);
    return docRef.id;
  }, []);

  const updateAsset = useCallback(async (id: string, patch: Partial<Omit<PlantAsset, 'id' | 'createdAt'>>) => {
    const cleanedPatch = stripUndefinedDeep(patch);
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      ...cleanedPatch,
      updatedAt: Timestamp.fromDate(new Date())
    } as any);
  }, []);

  const deleteAsset = useCallback(async (id: string) => {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  }, []);

  const addMarker = useCallback(async (asset: PlantAsset, marker: Omit<PlantMarker, 'id' | 'createdAt'>) => {
    const next: PlantMarker = { id: newId(), createdAt: new Date(), ...marker };
    await updateAsset(asset.id, {
      marcadores: [...(asset.marcadores || []), next]
    } as any);
    return next;
  }, [updateAsset]);

  const deleteMarker = useCallback(async (asset: PlantAsset, markerId: string) => {
    await updateAsset(asset.id, {
      marcadores: (asset.marcadores || []).filter((m) => m.id !== markerId)
    } as any);
  }, [updateAsset]);

  const addReferencia = useCallback(async (asset: PlantAsset, ref: Omit<PlantAssetReferencia, 'id' | 'createdAt'>) => {
    const next: PlantAssetReferencia = { id: newId(), createdAt: new Date(), ...ref };
    await updateAsset(asset.id, {
      referencias: [...(asset.referencias || []), next]
    } as any);
    return next;
  }, [updateAsset]);

  const deleteReferencia = useCallback(async (asset: PlantAsset, refId: string) => {
    await updateAsset(asset.id, {
      referencias: (asset.referencias || []).filter((r) => r.id !== refId)
    } as any);
  }, [updateAsset]);

  const addImagen = useCallback(async (asset: PlantAsset, img: Omit<PlantAssetImagen, 'id' | 'createdAt'>) => {
    const next: PlantAssetImagen = { id: newId(), createdAt: new Date(), ...img };
    await updateAsset(asset.id, {
      imagenes: [...(asset.imagenes || []), next]
    } as any);
    return next;
  }, [updateAsset]);

  const deleteImagen = useCallback(async (asset: PlantAsset, imgId: string) => {
    await updateAsset(asset.id, {
      imagenes: (asset.imagenes || []).filter((i) => i.id !== imgId)
    } as any);
  }, [updateAsset]);

  const upsertMany = useCallback(
    async (
      assets: Array<Omit<PlantAsset, 'id' | 'createdAt' | 'updatedAt'>>
    ): Promise<{ created: number; updated: number }> => {
      let created = 0;
      let updated = 0;

      for (const a of assets) {
        const key = makePlantAssetKey(a as any);
        const existing = byKey.get(key);
        if (existing) {
          await updateAsset(existing.id, a as any);
          updated++;
        } else {
          await createAsset(a);
          created++;
        }
      }

      return { created, updated };
    },
    [byKey, createAsset, updateAsset]
  );

  return {
    assets: items,
    loading,
    error,
    createAsset,
    updateAsset,
    deleteAsset,
    addMarker,
    deleteMarker,
    addReferencia,
    deleteReferencia,
    addImagen,
    deleteImagen,
    upsertMany
  };
}
