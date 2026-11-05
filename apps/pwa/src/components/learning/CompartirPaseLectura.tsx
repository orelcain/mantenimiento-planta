import { useCallback, useState } from 'react'
import { Check, Copy, Loader2, RefreshCw, Share2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui'
import {
  activarPaseLectura,
  cambiarPaseLectura,
  mensajeDeError,
  urlDelPaseLectura,
  verPaseLectura,
  type EstadoPaseLectura,
} from '@/services/paseLectura'

/**
 * «Compartir con nuevos» (solo admin): QR y link del pase de lectura.
 * El link abre Aprendizaje, Repuestos y los monitores de Filete y Eviscerado
 * sin usuario ni contraseña y solo para leer. «Cambiar link» deja fuera a todos
 * los teléfonos que entraron con el anterior; «Pausar» corta el acceso sin
 * invalidar los QR ya impresos.
 */
export function CompartirPaseLectura({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [pase, setPase] = useState<EstadoPaseLectura | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmarCambio, setConfirmarCambio] = useState(false)

  const correr = useCallback(async (fn: () => Promise<EstadoPaseLectura>) => {
    setOcupado(true)
    setError(null)
    try {
      setPase(await fn())
    } catch (e) {
      setError(mensajeDeError(e))
    } finally {
      setOcupado(false)
    }
  }, [])

  const abrir = () => {
    setOpen(true)
    setConfirmarCambio(false)
    if (!pase) void correr(verPaseLectura)
  }

  const url = pase ? urlDelPaseLectura(window.location.origin, import.meta.env.BASE_URL, pase.token) : ''
  const puedeCompartir = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setError('No se pudo copiar. Mantén presionado el link para copiarlo.')
    }
  }

  const compartir = async () => {
    try {
      await navigator.share({
        title: 'Mantención ANTARFOOD · acceso de lectura',
        text: 'Centro de Aprendizaje, Repuestos y monitores de planta (solo lectura).',
        url,
      })
    } catch { /* cancelado */ }
  }

  return (
    <>
      <Button variant="outline" size="default" className={`gap-1.5 ${className ?? ''}`} onClick={abrir}>
        <Share2 className="h-4 w-4" />
        Compartir
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">Acceso de lectura para nuevos</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <p className="text-center text-footnote text-muted-foreground">
              Abre Aprendizaje, Repuestos y los monitores de Filete y Eviscerado sin usuario ni contraseña. Solo pueden mirar y buscar.
            </p>
            {!pase && ocupado && <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando" />}
            {error && <p role="alert" className="text-center text-footnote text-destructive">{error}</p>}
            {pase && (
              <>
                <div className={`rounded-ctl bg-white p-4 ${pase.activo ? '' : 'opacity-40'}`}>
                  <QRCodeSVG value={url} size={200} level="M" includeMargin />
                </div>
                <p className="break-all px-4 text-center text-xs text-muted-foreground">{url}</p>
                {!pase.activo && (
                  <p className="text-center text-footnote font-semibold text-destructive">Pausado: el link no deja entrar a nadie.</p>
                )}
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => void copiar()}>
                    {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiado ? 'Copiado' : 'Copiar link'}
                  </Button>
                  {puedeCompartir && (
                    <Button variant="default" size="sm" className="gap-2" onClick={() => void compartir()}>
                      <Share2 className="h-4 w-4" />
                      Compartir
                    </Button>
                  )}
                </div>
                <div className="flex w-full flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:justify-center">
                  {confirmarCambio ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      disabled={ocupado}
                      onClick={() => { setConfirmarCambio(false); void correr(cambiarPaseLectura) }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Sí, cambiar (el anterior deja de servir)
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="gap-2" disabled={ocupado} onClick={() => setConfirmarCambio(true)}>
                      <RefreshCw className="h-4 w-4" />
                      Cambiar link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => void correr(() => activarPaseLectura(!pase.activo))}
                  >
                    {pase.activo ? 'Pausar acceso' : 'Reanudar acceso'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
