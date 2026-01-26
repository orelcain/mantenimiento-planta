/**
 * Optimiza una imagen reduciendo su tamaño y calidad
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onerror = () => reject(new Error('Error al leer el archivo'))
    
    reader.onload = (e) => {
      const img = new Image()
      
      img.onerror = () => reject(new Error('Error al cargar la imagen'))
      
      img.onload = () => {
        try {
          // Calcular nuevas dimensiones manteniendo aspecto
          let { width, height } = img
          
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
          
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }
          
          // Crear canvas y redimensionar
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('No se pudo crear el contexto del canvas'))
            return
          }
          
          // Dibujar imagen redimensionada
          ctx.drawImage(img, 0, 0, width, height)
          
          // Convertir a blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Error al crear el blob de la imagen'))
                return
              }
              
              // Crear nuevo archivo
              const fileName = file.name.replace(/\.[^/.]+$/, "") + ".webp"
              const optimizedFile = new File([blob], fileName, {
                type: 'image/webp',
                lastModified: Date.now(),
              })
              
              resolve({ file: optimizedFile, width, height })
            },
            'image/webp',
            quality
          )
        } catch (error) {
          reject(error)
        }
      }
      
      img.src = e.target?.result as string
    }
    
    reader.readAsDataURL(file)
  })
}

/**
 * Valida que un archivo sea una imagen válida
 * @param file Archivo a validar
 * @param maxSizeMB Tamaño máximo en MB (default: 10)
 * @returns true si es válido, mensaje de error si no
 */
export function validateImageFile(file: File, maxSizeMB: number = 10): string | true {
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
  } catch (error) {
    throw new Error('Error al descargar la imagen')
  }
}
