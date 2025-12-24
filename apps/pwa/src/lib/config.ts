// Configuración de rutas base para la aplicación
// En desarrollo: '/'
// En producción (GitHub Pages): '/mantenimiento-planta/'

export const BASE_URL = import.meta.env.BASE_URL || '/'

// Helper para construir rutas de assets locales
export function getAssetUrl(path: string): string {
  // Si la ruta ya es absoluta (http/https) o es de Firebase Storage, devolverla tal cual
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('blob:')) {
    return path
  }
  
  // Asegurar que el path comienza con /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  
  // Construir la URL completa con el basePath
  const baseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL
  return `${baseUrl}${normalizedPath}`
}

// Helper para verificar si una URL es de Firebase Storage
export function isFirebaseStorageUrl(url: string): boolean {
  return url.includes('firebasestorage.googleapis.com') || 
         url.includes('.firebasestorage.app')
}
