import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
  listAll,
} from 'firebase/storage'
import { storage } from './firebase'
import { generateId } from '@/lib/utils'
import { validateFile } from '@/lib/validation'
import { logger } from '@/lib/logger'
import { processImageForUpload, IMAGE_PRESETS } from '@/utils/images/processImage'

// Subir imagen de incidencia
export async function uploadIncidentPhoto(
  incidentId: string,
  file: File
): Promise<string> {
  // Validar archivo antes de subir
  const validation = validateFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  logger.info('Uploading incident photo', { 
    incidentId, 
    fileSize: file.size, 
    fileType: file.type 
  })

  try {
    // Siempre convertir a WebP con buena calidad
    const { file: fileToUpload } = await processImageForUpload(file, IMAGE_PRESETS.photo)

    const fileName = `${generateId()}.webp`
    const storageRef = ref(storage, `incidents/${incidentId}/${fileName}`)
    
    await uploadBytes(storageRef, fileToUpload, {
      contentType: 'image/webp',
    })
    const url = await getDownloadURL(storageRef)
    
    logger.info('Incident photo uploaded successfully', { 
      incidentId, 
      fileName,
      originalSize: file.size,
      webpSize: fileToUpload.size 
    })
    return url
  } catch (error) {
    logger.error('Error uploading incident photo', error as Error, { incidentId })
    throw error
  }
}

// Subir imagen de equipo
export async function uploadEquipmentPhoto(
  equipmentId: string,
  file: File
): Promise<string> {
  // Validar archivo
  const validation = validateFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  logger.info('Uploading equipment photo', { 
    equipmentId, 
    fileSize: file.size 
  })

  try {
    // Siempre convertir a WebP y comprimir si es necesario
    // Mantener calidad alta (0.88) para buena visualización
    const { file: fileToUpload } = await processImageForUpload(file, IMAGE_PRESETS.photo)

    const fileName = `${generateId()}.webp`
    const storageRef = ref(storage, `equipment/${equipmentId}/${fileName}`)
    
    await uploadBytes(storageRef, fileToUpload, {
      contentType: 'image/webp',
    })
    const url = await getDownloadURL(storageRef)
    
    logger.info('Equipment photo uploaded successfully', { 
      equipmentId, 
      fileName,
      originalSize: file.size,
      webpSize: fileToUpload.size,
      reduction: Math.round((1 - fileToUpload.size / file.size) * 100)
    })
    return url
  } catch (error) {
    logger.error('Error uploading equipment photo', error as Error, { equipmentId })
    throw error
  }
}

export async function uploadGanttCommentPhoto(
  taskId: string,
  commentDraftId: string,
  file: File
): Promise<string> {
  const validation = validateFile(file)
  if (!validation.valid) {
    throw new Error(validation.error)
  }

  logger.info('Uploading gantt comment photo', {
    taskId,
    commentDraftId,
    fileSize: file.size,
    fileType: file.type,
  })

  try {
    const { file: fileToUpload } = await processImageForUpload(file, IMAGE_PRESETS.photo)
    const fileName = `${generateId()}.webp`
    const storageRef = ref(storage, `gantt/${taskId}/comments/${commentDraftId}/${fileName}`)

    await uploadBytes(storageRef, fileToUpload, {
      contentType: 'image/webp',
    })

    return await getDownloadURL(storageRef)
  } catch (error) {
    logger.error('Error uploading gantt comment photo', error as Error, { taskId, commentDraftId })
    throw error
  }
}

// Subir foto de usuario
export async function uploadUserPhoto(
  userId: string,
  file: File
): Promise<string> {
  const { file: fileToUpload } = await processImageForUpload(file, IMAGE_PRESETS.avatar)
  const fileExtension = fileToUpload.type === 'image/webp' ? 'webp' : 'jpg'
  const fileName = `avatar.${fileExtension}`
  const storageRef = ref(storage, `users/${userId}/${fileName}`)

  await uploadBytes(storageRef, fileToUpload, { contentType: fileToUpload.type })
  return getDownloadURL(storageRef)
}

// Subir plano de planta
export async function uploadFloorPlan(
  file: File,
  name?: string
): Promise<string> {
  // Planos: preset de alta resolución (detalle fino) en vez de subir crudo.
  const { file: fileToUpload } = await processImageForUpload(file, IMAGE_PRESETS.plan)
  const fileExtension = fileToUpload.type === 'image/webp' ? 'webp' : 'jpg'
  const fileName = name ? `${name}.${fileExtension}` : `map_${Date.now()}.${fileExtension}`
  const storageRef = ref(storage, `maps/${fileName}`)

  await uploadBytes(storageRef, fileToUpload, { contentType: fileToUpload.type })
  return getDownloadURL(storageRef)
}

// Subir firma digital
export async function uploadSignature(
  incidentId: string,
  dataUrl: string
): Promise<string> {
  // Convertir data URL a blob
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  
  const fileName = `firma_${Date.now()}.png`
  const storageRef = ref(storage, `incidents/${incidentId}/signatures/${fileName}`)
  
  await uploadBytes(storageRef, blob)
  return getDownloadURL(storageRef)
}

// Eliminar archivo
export async function deleteFile(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
  } catch (error) {
    logger.error('Error eliminando archivo', error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Comprimir imagen antes de subir.
 *
 * @deprecated Preferir `processImageForUpload` (con presets de `IMAGE_PRESETS`)
 * para nuevos usos. Este wrapper delega en el helper unificado y se mantiene por
 * compatibilidad con los call sites existentes.
 */
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8,
  useWebP: boolean = true
): Promise<File> {
  const result = await processImageForUpload(file, {
    maxWidth,
    maxHeight: maxWidth,
    quality,
    preferWebP: useWebP,
  })
  return result.file
}
// Subir imagen del mapa/plano (sin compresión, mantiene resolución original)
export async function uploadMapImage(file: File): Promise<string> {
  // Validar que sea imagen
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen')
  }

  logger.info('Uploading map image', {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
  })

  const fileExtension = file.name.split('.').pop() || 'png'
  const fileName = `map_${Date.now()}.${fileExtension}`
  const storageRef = ref(storage, `maps/${fileName}`)
  
  // Subir sin comprimir para mantener máxima calidad
  const metadata = {
    contentType: file.type,
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  }

  await uploadBytes(storageRef, file, metadata)
  const url = await getDownloadURL(storageRef)
  
  logger.info('Map image uploaded successfully', { fileName, url })
  return url
}

// Obtener todas las imágenes de mapas disponibles
export async function getMapImages(): Promise<string[]> {
  try {
    const mapsRef = ref(storage, 'maps')
    const result = await listAll(mapsRef)
    
    const urls = await Promise.all(
      result.items.map(item => getDownloadURL(item))
    )
    
    return urls
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Error obteniendo mapas')
    logger.error('Error getting maps', err)
    return []
  }
}

// Eliminar mapa
export async function deleteMapImage(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
  } catch (error) {
    logger.error('Error eliminando mapa', error instanceof Error ? error : new Error(String(error)))
  }
}

/**
 * Eliminar foto de equipo
 */
export async function deleteEquipmentPhoto(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
    logger.info('Equipment photo deleted successfully', { url })
  } catch (error) {
    logger.error('Error deleting equipment photo', error as Error, { url })
    throw error
  }
}

/**
 * Listar todas las fotos de un equipo
 */
export async function listEquipmentPhotos(equipmentId: string): Promise<string[]> {
  try {
    const folderRef = ref(storage, `equipment/${equipmentId}`)
    const result = await listAll(folderRef)

    const urls = await Promise.all(
      result.items.map((itemRef) => getDownloadURL(itemRef))
    )

    return urls
  } catch (error) {
    logger.error('Error listing equipment photos', error as Error, { equipmentId })
    return []
  }
}

// ── Bodega: fotos de repuestos ──

export async function uploadBodegaPhoto(codigoSAP: string, file: File): Promise<string> {
  const validation = validateFile(file)
  if (!validation.valid) throw new Error(validation.error)

  const { file: fileToUpload } = await processImageForUpload(file, IMAGE_PRESETS.photo)
  const fileName = `${generateId()}.webp`
  const storageRef = ref(storage, `bodega/${codigoSAP}/fotos/${fileName}`)

  await uploadBytes(storageRef, fileToUpload, { contentType: 'image/webp' })
  return await getDownloadURL(storageRef)
}

export async function deleteBodegaPhoto(url: string): Promise<void> {
  try {
    const storageRef = ref(storage, url)
    await deleteObject(storageRef)
  } catch (error) {
    logger.error('Error eliminando foto bodega', error instanceof Error ? error : new Error(String(error)))
  }
}