import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '@/services/firebase';

type UploadResult = { url: string; path: string };

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]+/g, '_');

const newId = () => {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function usePlantStorage(machineId: string | null) {
  const requireMachineId = () => {
    if (!machineId) throw new Error('Machine ID is required');
    return machineId;
  };

  const uploadPlantMapImage = async (file: File, mapId: string): Promise<UploadResult> => {
    const mid = requireMachineId();
    const id = newId();
    const path = `machines/${mid}/plantMaps/${mapId}/${id}-${safeFileName(file.name)}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return { url, path };
  };

  const uploadPlantAssetImage = async (file: File, assetId: string): Promise<UploadResult> => {
    const mid = requireMachineId();
    const id = newId();
    const path = `machines/${mid}/plantAssets/${assetId}/imagenes/${id}-${safeFileName(file.name)}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return { url, path };
  };

  const deleteByPath = async (path: string) => {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  };

  const deleteByUrl = async (url: string) => {
    const storageRef = ref(storage, url);
    await deleteObject(storageRef);
  };

  return { uploadPlantMapImage, uploadPlantAssetImage, deleteByPath, deleteByUrl };
}
