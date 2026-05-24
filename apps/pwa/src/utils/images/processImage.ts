import { logger } from '@/lib/logger'

/**
 * Procesamiento unificado de imágenes antes de subir a Firebase Storage.
 *
 * Una sola fuente de verdad para redimensionar + convertir a WebP (con fallback
 * a JPEG en navegadores que no codifican WebP, p.ej. iOS antiguo) y, opcionalmente,
 * ajustar la calidad hasta cumplir un objetivo de peso (`targetBytes`).
 *
 * Es IDEMPOTENTE: si el archivo ya es WebP, ya cabe en las dimensiones y pesa por
 * debajo del objetivo, se devuelve tal cual sin re-codificar. Esto neutraliza la
 * "doble compresión" cuando un componente comprime y luego el servicio vuelve a
 * llamar al procesador.
 */

export interface ImageProcessOptions {
  /** Ancho máximo en píxeles. Mantiene proporción. */
  maxWidth?: number
  /** Alto máximo en píxeles. Mantiene proporción. */
  maxHeight?: number
  /** Calidad inicial 0–1 (default 0.85). */
  quality?: number
  /** Si se define, baja la calidad iterando hasta quedar por debajo de este peso. */
  targetBytes?: number
  /** Piso de calidad al iterar hacia el objetivo de peso (default 0.5). */
  minQuality?: number
  /** Preferir WebP (default true). Si el navegador no lo codifica, cae a JPEG. */
  preferWebP?: boolean
}

export interface ProcessedImage {
  file: File
  width: number
  height: number
  format: 'webp' | 'jpeg' | 'original'
  originalSize: number
  finalSize: number
}

/**
 * Presets estándar de la app. El de fotos generales apunta a ~400KB
 * (balanceado: nitidez excelente en pantalla y PDF, ~25x más liviano que un
 * original típico de celular).
 */
export const IMAGE_PRESETS = {
  /** Fotos generales: incidencias, equipos, evidencia, repuestos, gantt, chat, etc. */
  photo: { maxWidth: 1920, maxHeight: 1920, quality: 0.85, targetBytes: 400 * 1024 },
  /** Planos/mapas: requieren detalle fino, se permite más peso. */
  plan: { maxWidth: 2500, maxHeight: 2500, quality: 0.85, targetBytes: 1200 * 1024 },
  /** Miniaturas. */
  thumbnail: { maxWidth: 600, maxHeight: 600, quality: 0.8, targetBytes: 80 * 1024 },
  /** Avatares de usuario. */
  avatar: { maxWidth: 512, maxHeight: 512, quality: 0.85, targetBytes: 80 * 1024 },
} as const satisfies Record<string, ImageProcessOptions>

/** Formatos que NO se recomprimen (animaciones / vectores). */
const SKIP_TYPES = ['image/gif', 'image/svg+xml']

interface DecodedImage {
  width: number
  height: number
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
  close: () => void
}

/**
 * Decodifica el archivo respetando la orientación EXIF cuando el navegador lo
 * soporta (createImageBitmap con imageOrientation). Cae a HTMLImageElement.
 */
async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
        close: () => bitmap.close(),
      }
    } catch {
      // Algunos navegadores no aceptan la opción imageOrientation: fallback abajo.
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Error cargando imagen'))
      el.src = objectUrl
    })
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      close: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (err) {
    URL.revokeObjectURL(objectUrl)
    throw err
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality))
}

function fitDimensions(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  let w = width
  let h = height
  if (w > maxWidth) {
    h = Math.round((h * maxWidth) / w)
    w = maxWidth
  }
  if (h > maxHeight) {
    w = Math.round((w * maxHeight) / h)
    h = maxHeight
  }
  return { width: w, height: h }
}

/**
 * Procesa una imagen para subirla. Devuelve un File optimizado (WebP o JPEG).
 * Para GIF/SVG o archivos no-imagen, devuelve el original sin tocar.
 */
export async function processImageForUpload(
  file: File,
  opts: ImageProcessOptions = {}
): Promise<ProcessedImage> {
  const {
    maxWidth = 1920,
    maxHeight = 1920,
    quality = 0.85,
    targetBytes,
    minQuality = 0.5,
    preferWebP = true,
  } = opts

  // Normalizar calidad: aceptar escala 0–1 o 0–100 (algunos call sites pasan 85).
  const baseQuality = quality > 1 ? quality / 100 : quality

  const passthrough = (format: ProcessedImage['format']): ProcessedImage => ({
    file,
    width: 0,
    height: 0,
    format,
    originalSize: file.size,
    finalSize: file.size,
  })

  // No tocar animaciones/vectores ni archivos que no sean imagen.
  if (!file.type.startsWith('image/') || SKIP_TYPES.includes(file.type)) {
    return passthrough('original')
  }

  let decoded: DecodedImage
  try {
    decoded = await decode(file)
  } catch (err) {
    logger.warn('processImageForUpload: no se pudo decodificar; se sube original', {
      name: file.name,
      type: file.type,
    })
    return passthrough('original')
  }

  try {
    const target = fitDimensions(decoded.width, decoded.height, maxWidth, maxHeight)
    const needsResize = target.width < decoded.width || target.height < decoded.height

    // Idempotencia: ya es WebP, no necesita resize y cabe en el objetivo de peso.
    if (
      file.type === 'image/webp' &&
      !needsResize &&
      (targetBytes === undefined || file.size <= targetBytes)
    ) {
      return {
        file,
        width: decoded.width,
        height: decoded.height,
        format: 'webp',
        originalSize: file.size,
        finalSize: file.size,
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      logger.warn('processImageForUpload: sin contexto canvas; se sube original')
      return passthrough('original')
    }
    decoded.draw(ctx, target.width, target.height)

    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '') || 'image'

    // Determinar formato de salida probando WebP una vez.
    let outType = 'image/jpeg'
    let outExt = 'jpg'
    let format: 'webp' | 'jpeg' = 'jpeg'
    let blob: Blob | null = null

    if (preferWebP) {
      const webp = await toBlob(canvas, 'image/webp', baseQuality)
      if (webp && webp.type === 'image/webp') {
        outType = 'image/webp'
        outExt = 'webp'
        format = 'webp'
        blob = webp
      } else {
        logger.warn('processImageForUpload: WebP no soportado, usando JPEG')
      }
    }

    if (!blob) {
      blob = await toBlob(canvas, 'image/jpeg', baseQuality)
    }

    // Iterar bajando calidad hasta cumplir el objetivo de peso.
    if (blob && targetBytes !== undefined && blob.size > targetBytes) {
      let q = baseQuality
      while (q - 0.1 >= minQuality - 1e-6 && blob && blob.size > targetBytes) {
        q = Math.round((q - 0.1) * 100) / 100
        const next = await toBlob(canvas, outType, q)
        if (!next) break
        blob = next
      }
    }

    if (!blob) {
      logger.warn('processImageForUpload: no se pudo codificar; se sube original')
      return passthrough('original')
    }

    const outFile = new File([blob], `${nameWithoutExt}.${outExt}`, {
      type: outType,
      lastModified: Date.now(),
    })

    return {
      file: outFile,
      width: target.width,
      height: target.height,
      format,
      originalSize: file.size,
      finalSize: outFile.size,
    }
  } finally {
    decoded.close()
  }
}
