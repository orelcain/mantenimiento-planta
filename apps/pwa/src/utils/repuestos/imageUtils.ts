import { processImageForUpload } from '@/utils/images/processImage'

/**
 * Optimiza una imagen reduciendo su tamaño y calidad.
 *
 * @deprecated Preferir `processImageForUpload` directamente. Este wrapper delega
 * en el helper unificado y se mantiene por compatibilidad.
 * @param file Archivo de imagen original
 * @param maxWidth Ancho máximo en píxeles (default: 1200)
 * @param maxHeight Alto máximo en píxeles (default: 1200)
 * @param quality Calidad de compresión 0-1 (default: 0.8)
 * @returns Promise con el archivo optimizado y sus dimensiones
 */
export async function optimizeImage(
  file: File,
  maxWidth: number = 1200,
  maxHeight: number = 1200,
  quality: number = 0.8
): Promise<{ file: File; width: number; height: number }> {
  const result = await processImageForUpload(file, { maxWidth, maxHeight, quality })
  if (result.width > 0 && result.height > 0) {
    return { file: result.file, width: result.width, height: result.height }
  }
  // Formatos no recomprimidos (GIF/SVG): medir dimensiones reales.
  const dims = await getImageDimensions(result.file)
  return { file: result.file, width: dims.width, height: dims.height }
}

/**
 * Valida que un archivo sea una imagen válida
 * @param file Archivo a validar
 * @param maxSizeMB Tamaño máximo en MB (default: 10)
 * @returns true si es válido, mensaje de error si no
 */
export function validateImageFile(file: File, maxSizeMB: number = 25): string | true {
  // Validar tipo
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
  if (!validTypes.includes(file.type)) {
    return 'El archivo debe ser una imagen (JPG, PNG, WebP o GIF)'
  }
  
  // Validar tamaño
  const maxBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxBytes) {
    return `El archivo debe pesar menos de ${maxSizeMB}MB`
  }
  
  return true
}

/**
 * Obtiene las dimensiones de una imagen
 * @param file Archivo de imagen
 * @returns Promise con { width, height }
 */
export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onerror = () => reject(new Error('Error al cargar la imagen'))
      
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      
      img.src = e.target?.result as string
    }
    
    reader.readAsDataURL(file)
  })
}

/**
 * Convierte un archivo a base64
 * @param file Archivo a convertir
 * @returns Promise con la cadena base64
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    
    reader.onload = () => {
      const result = reader.result as string
      resolve(result)
    }
    
    reader.readAsDataURL(file)
  })
}

/**
 * Descarga una imagen desde una URL como archivo
 * @param url URL de la imagen
 * @param filename Nombre del archivo a descargar
 */
export async function downloadImage(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    // Liberar memoria
    URL.revokeObjectURL(objectUrl)
  } catch (_error) {
    throw new Error('Error al descargar la imagen')
  }
}
