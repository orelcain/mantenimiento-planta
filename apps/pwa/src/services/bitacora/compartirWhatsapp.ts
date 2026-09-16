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
 * Abre el menú de compartir con las láminas y el mensaje. El mensaje queda
 * además en el portapapeles: si la app de destino no lo toma junto a las
 * imágenes, se pega en el chat.
 */
export async function compartirEnWhatsapp(turno: TurnoMantencion, texto: string, listas: readonly LaminaGenerada[]): Promise<'enviado' | 'cancelado'> {
  void copiarTexto(texto).catch(() => undefined)
  const files = listas.map((g) => new File([g.png], nombreArchivoLamina(turno, g.lamina, 'png'), { type: 'image/png' }))
  try {
    await navigator.share(files.length ? { files, text: texto } : { text: texto })
    return 'enviado'
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return 'cancelado'
    throw e
  }
}
