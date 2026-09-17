import { copiarTexto } from '@/lib/clipboard'
import type { LaminaGenerada } from '@/hooks/useLaminasWhatsapp'
import type { TurnoMantencion } from './bitacora.types'
import { nombreArchivoLamina } from './bitacoraWhatsapp'

/** ¿El teléfono puede compartir imágenes con otras apps (WhatsApp)? */
export function puedeCompartirArchivos(): boolean {
  try {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [new File([''], 'lamina.png', { type: 'image/png' })] })
    )
  } catch {
    return false
  }
}

/**
 * WhatsApp pone el texto que llega junto a imágenes como PIE DE FOTO, y el pie
 * se corta en ~1.024 caracteres: un turno de 8 eventos llegaba hasta el 4.º
 * (17-09-2026). Sobre este largo, el mensaje y las láminas van por separado.
 */
export const LIMITE_PIE_FOTO = 1000

/** ¿El envío necesita dos pasos (mensaje aparte de las láminas)? */
export function envioEnDosPasos(texto: string, laminas: number): boolean {
  return laminas > 0 && texto.length > LIMITE_PIE_FOTO
}

async function compartir(datos: ShareData): Promise<'enviado' | 'cancelado'> {
  try {
    await navigator.share(datos)
    return 'enviado'
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return 'cancelado'
    throw e
  }
}

/** Paso 1 de 2: solo el mensaje (sin imágenes no hay pie y no se corta). */
export async function compartirMensaje(texto: string): Promise<'enviado' | 'cancelado'> {
  void copiarTexto(texto).catch(() => undefined)
  return compartir({ text: texto })
}

/** Paso 2 de 2: solo las láminas. */
export async function compartirLaminas(turno: TurnoMantencion, listas: readonly LaminaGenerada[]): Promise<'enviado' | 'cancelado'> {
  const files = listas.map((g) => new File([g.png], nombreArchivoLamina(turno, g.lamina, 'png'), { type: 'image/png' }))
  return compartir({ files })
}

/**
 * Abre el menú de compartir con las láminas y el mensaje (mensaje corto: cabe
 * como pie de foto). El mensaje queda
 * además en el portapapeles: si la app de destino no lo toma junto a las
 * imágenes, se pega en el chat.
 */
export async function compartirEnWhatsapp(turno: TurnoMantencion, texto: string, listas: readonly LaminaGenerada[]): Promise<'enviado' | 'cancelado'> {
  void copiarTexto(texto).catch(() => undefined)
  const files = listas.map((g) => new File([g.png], nombreArchivoLamina(turno, g.lamina, 'png'), { type: 'image/png' }))
  return compartir(files.length ? { files, text: texto } : { text: texto })
}
