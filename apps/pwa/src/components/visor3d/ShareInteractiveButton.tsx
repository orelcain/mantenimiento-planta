/**
 * ShareInteractiveButton — Botón único "Compartir" para experiencias interactivas
 *
 * Abre un Dialog con:
 *  - QR para escanear (apunta a la ruta pública /v/interactive/<slug>)
 *  - URL completa visible
 *  - Botón "Copiar link" (clipboard)
 *  - Botón "Compartir" nativo (navigator.share) cuando está disponible
 *
 * Las experiencias interactivas usan este componente en su header para que
 * cualquier persona pueda compartir el link/QR del modelo interactivo
 * (no solo de los modelos 3D estáticos como antes).
 */

import { useCallback, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui'

export interface ShareInteractiveButtonProps {
  /** URL completa a compartir. Ej: `${window.location.origin}/mantenimiento-planta/v/interactive/plataforma-ponton` */
  url: string
  /** Nombre del modelo o experiencia. Aparece en el título del Dialog y como title del share nativo. */
  title: string
  /** Texto descriptivo opcional para el share nativo. */
  description?: string
  /** Variante del trigger button. Default 'outline'. */
  variant?: 'outline' | 'default' | 'secondary' | 'ghost'
  /** Tamaño del trigger. Default 'sm'. */
  size?: 'sm' | 'default'
  /** className extra para el trigger. */
  className?: string
}

export function ShareInteractiveButton({
  url,
  title,
  description,
  variant = 'outline',
  size = 'sm',
  className,
}: ShareInteractiveButtonProps) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.warn('Clipboard write failed:', err)
    }
  }, [url])

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.share) return
    try {
      await navigator.share({
        title,
        text: description ?? `Modelo interactivo: ${title}`,
        url,
      })
    } catch (err) {
      // El usuario canceló o falló — silenciar AbortError
      if ((err as Error).name !== 'AbortError') {
        console.warn('navigator.share failed:', err)
      }
    }
  }, [url, title, description])

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={`gap-1.5 ${className ?? ''}`}
        onClick={() => setOpen(true)}
      >
        <Share2 className="h-4 w-4" />
        Compartir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="rounded-lg bg-white p-4">
              <QRCodeSVG value={url} size={200} level="M" includeMargin />
            </div>
            <p className="break-all px-4 text-center text-xs text-muted-foreground">
              {url}
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button variant="outline" size="sm" className="gap-2" onClick={handleCopyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar link'}
              </Button>
              {canNativeShare && (
                <Button variant="default" size="sm" className="gap-2" onClick={handleNativeShare}>
                  <Share2 className="h-4 w-4" />
                  Compartir
                </Button>
              )}
            </div>
            <p className="text-center text-[10px] text-muted-foreground">
              Esta vista es pública — no requiere iniciar sesión.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
