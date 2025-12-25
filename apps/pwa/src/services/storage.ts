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
    // Comprimir imagen automáticamente si es mayor a 1MB
    const fileToUpload = file.size > 1024 * 1024 
      ? await compressImage(file, 1920, 0.8)
      : file

    const fileExtension = file.name.split('.').pop() || 'jpg'
    const fileName = `${generateId()}.${fileExtension}`
    const storageRef = ref(storage, `incidents/${incidentId}/${fileName}`)
    
    await uploadBytes(storageRef, fileToUpload)
    const url = await getDownloadURL(storageRef)
    
    logger.info('Incident photo uploaded successfully', { incidentId, fileName })
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
    // Comprimir si es necesario
    const fileToUpload = file.size > 1024 * 1024
      ? await compressImage(file, 1920, 0.8)
      : file

    const fileExtension = file.name.split('.').pop() || 'jpg'
    const fileName = `${generateId()}.${fileExtension}`
    const storageRef = ref(storage, `equipment/${equipmentId}/${fileName}`)
    
    await uploadBytes(storageRef, fileToUpload)
    const url = await getDownloadURL(storageRef)
    
    logger.info('Equipment photo uploaded successfully', { equipmentId, fileName })
    return url
  } catch (error) {
    logger.error('Error uploading equipment photo', error as Error, { equipmentId })
    throw error
  }
}

// Subir foto de usuario
export async function uploadUserPhoto(
  userId: string,
  file: File
): Promise<string> {
  const fileExtension = file.name.split('.').pop() || 'jpg'
  const fileName = `avatar.${fileExtension}`
  const storageRef = ref(storage, `users/${userId}/${fileName}`)
  
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
}

// Subir plano de planta
export async function uploadFloorPlan(
  file: File,
  name?: string
): Promise<string> {
  const fileExtension = file.name.split('.').pop() || 'png'
  const fileName = name ? `${name}.${fileExtension}` : `map_${Date.now()}.${fileExtension}`
  const storageRef = ref(storage, `maps/${fileName}`)
  
  await uploadBytes(storageRef, file)
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
    console.error('Error eliminando archivo:', error)
  }
}

// Comprimir imagen antes de subir
export async function compressImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    
    img.onload = () => {
      const canvas = document.createElement('canvas')
      let { width, height } = img
      
      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }
      
      canvas.width = width
      canvas.height = height
      
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('No se pudo crear contexto de canvas'))
        return
      }
      
      ctx.drawImage(img, 0, 0, width, height)
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })
            resolve(compressedFile)
          } else {
            reject(new Error('No se pudo comprimir la imagen'))
          }
        },
        'image/jpeg',
        quality
      )
      
      URL.revokeObjectURL(img.src)
    }
    
    img.onerror = () => {
      reject(new Error('Error cargando imagen'))
    }
  })
}
// Subir imagen del mapa/plano
export async function uploadMapImage(file: File): Promise<string> {
  const fileExtension = file.name.split('.').pop() || 'png'
  const fileName = `map_${Date.now()}.${fileExtension}`
  const storageRef = ref(storage, `maps/${fileName}`)
  
  await uploadBytes(storageRef, file)
  return getDownloadURL(storageRef)
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
    console.error('Error eliminando mapa:', error)
  }
}