import { useState, useCallback } from 'react';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { storage } from '@/services/firebase';
import type { ImagenRepuesto } from '@/types/repuestos';
import { optimizeImage } from '@/utils/repuestos';

export function useStorage(machineId: string | null, manualStoragePath?: string) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Subir imagen de repuesto
  const uploadImage = useCallback(async (
    file: File,
    repuestoId: string,
    tipo: 'manual' | 'real',
    options?: {
      quality?: number;
      skipOptimize?: boolean;
      meta?: {
        sizeOriginal?: number;
        chosen?: {
          format: 'webp' | 'jpeg' | 'original';
          quality?: number;
          maxWidth?: number;
          maxHeight?: number;
        };
      };
    }
  ): Promise<ImagenRepuesto> => {
    if (!machineId) {
      throw new Error('Machine ID is required');
    }

    setUploading(true);
    setProgress(0);

    try {
      // Optimización en cliente: reduce dimensiones/peso antes de subir.
      // Nota: no optimizamos GIF/SVG para no romper animaciones/vectores.
      const shouldOptimize =
        !options?.skipOptimize &&
        file.type.startsWith('image/') &&
        !['image/gif', 'image/svg+xml'].includes(file.type);
      let fileToUpload = file;
      let width: number | undefined;
      let height: number | undefined;

      if (shouldOptimize) {
        try {
          const quality = options?.quality ?? 0.85;
          const result = await optimizeImage(file, 1200, 1200, quality);
          fileToUpload = result.file;
          width = result.width;
          height = result.height;
        } catch (err) {
          console.warn('[useStorage] No se pudo optimizar imagen; subiendo original', err);
          fileToUpload = file;
        }
      }

      const timestamp = Date.now();
      const fileName = `${timestamp}_${fileToUpload.name}`;
      
      // COMPATIBILIDAD: Para Baader 200, usar rutas antiguas
      const path = machineId === 'baader-200'
        ? `repuestos/${repuestoId}/${tipo}/${fileName}`
        : `machines/${machineId}/repuestos/${repuestoId}/${tipo}/${fileName}`;
      
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, fileToUpload);
      setProgress(100);

      const url = await getDownloadURL(storageRef);

      const formatFinal: ImagenRepuesto['formatFinal'] =
        options?.meta?.chosen?.format
          ? options.meta.chosen.format
          : fileToUpload.type === 'image/webp'
            ? 'webp'
            : fileToUpload.type === 'image/jpeg'
              ? 'jpeg'
              : 'original';

      const sizeOriginal = options?.meta?.sizeOriginal ?? (options?.skipOptimize ? undefined : file.size);

      const imagen: ImagenRepuesto = {
        id: `${timestamp}`,
        url,
        descripcion: '',
        orden: 0,
        esPrincipal: false,
        tipo,
        createdAt: new Date(),
        sizeOriginal,
        sizeFinal: fileToUpload.size,
        formatFinal,
        qualityFinal: options?.meta?.chosen?.quality,
        width,
        height
      };

      return imagen;
    } catch (err) {
      console.error('Error al subir imagen:', err);
      throw err;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [machineId]);

  // Eliminar imagen
  const deleteImage = useCallback(async (url: string) => {
    try {
      const storageRef = ref(storage, url);
      await deleteObject(storageRef);
    } catch (err) {
      console.error('Error al eliminar imagen:', err);
      // Si el archivo no existe, no es un error crítico
    }
  }, []);

  // Subir PDF del manual
  const uploadManualPDF = useCallback(async (file: File, manualName: string = 'manual_principal'): Promise<string> => {
    if (!machineId) {
      throw new Error('Machine ID is required');
    }

    setUploading(true);
    setProgress(0);

    try {
      // Usar nombre único por archivo para evitar sobrescribir
      const timestamp = Date.now();
      const baseName = manualName || 'manual';
      const ext = file.name.split('.').pop() || 'pdf';
      const uniqueName = `${baseName}_${timestamp}.${ext}`;

      // Usa ruta personalizada si se proporcionó, o la default
      const basePath = manualStoragePath || `machines/${machineId}/manuales`;
      const path = `${basePath}/${uniqueName}`;

      console.log('📁 [useStorage] Upload path:', path);
      const storageRef = ref(storage, path);

      // Upload con progreso real
      const uploadTask = uploadBytesResumable(storageRef, file);

      const url = await new Promise<string>((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (snapshot) => {
            const pct = snapshot.totalBytes > 0
              ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
              : 0;
            setProgress(pct);
          },
          (error) => {
            reject(error);
          },
          async () => {
            try {
              setProgress(100);
              const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(downloadUrl);
            } catch (err) {
              reject(err);
            }
          }
        );
      });

      return url;
    } catch (err) {
      console.error('Error al subir PDF:', err);
      throw err;
    } finally {
      setUploading(false);
      // Mantener el progreso visible (p.ej. 100%) hasta el próximo upload
    }
  }, [machineId, manualStoragePath]);

  // Obtener URL del manual - busca cualquier PDF en las carpetas usando listAll()
  const getManualURL = useCallback(async (): Promise<string | null> => {
    if (!machineId) {
      return null;
    }

    const folder = manualStoragePath || `machines/${machineId}/manuales`;
    try {
      const folderRef = ref(storage, folder);
      const listResult = await listAll(folderRef);

      // Buscar el primer archivo PDF
      for (const item of listResult.items) {
        if (item.name.toLowerCase().endsWith('.pdf')) {
          const url = await getDownloadURL(item);
          console.log(`✅ Manual encontrado: ${folder}/${item.name}`);
          return url;
        }
      }
    } catch {
      // Silenciosamente retornar null (normal para máquinas nuevas sin manual)
      return null;
    }

    // Silenciosamente retornar null (normal para máquinas nuevas sin manual)
    return null;
  }, [machineId, manualStoragePath]);

  // Subir infografía/diagrama (imagen, PDF, modelo 3D)
  const uploadInfografia = useCallback(async (file: File, fileName?: string): Promise<string> => {
    if (!machineId) {
      throw new Error('Machine ID is required');
    }

    setUploading(true);
    setProgress(0);

    try {
      const timestamp = Date.now();
      const baseName = fileName || file.name.replace(/\.[^/.]+$/, '') || 'infografia';
      const ext = file.name.split('.').pop() || 'png';
      const uniqueName = `${baseName}_${timestamp}.${ext}`;

      const path = `machines/${machineId}/infografias/${uniqueName}`;
      
      console.log('📊 [useStorage] Upload infografia path for machine', machineId, ':', path);
      const storageRef = ref(storage, path);

      await uploadBytes(storageRef, file);
      setProgress(100);

      const url = await getDownloadURL(storageRef);
      return url;
    } catch (err) {
      console.error('Error al subir infografía:', err);
      throw err;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [machineId]);

  return {
    uploading,
    progress,
    uploadImage,
    deleteImage,
    uploadManualPDF,
    getManualURL,
    uploadInfografia
  };
}
