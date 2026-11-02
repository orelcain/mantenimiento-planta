/**
 * «Compartir» del monitor de línea: el enlace público del monitor (el mismo token de la URL) con su QR,
 * para abrirlo en otro teléfono o en la TV de la sala. Quien lo abre no necesita cuenta y ve el monitor
 * en solo lectura: el token apunta al doc espejo que el backend refresca cada ciclo de sync.
 */
import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Share2 } from 'lucide-react'
import { Button, Sheet } from '@/components/piel'
import { copiarTexto } from '@/lib/clipboard'
import { rutaMonitor } from '@/services/shoplogix/monitorDeLinea'

/** El enlace público del monitor, sin parámetros de prueba (`glass`, `pantalla`): abre la vista por defecto. */
function urlPublicaMonitor(token: string, origen = window.location.origin, base: string = import.meta.env.BASE_URL || '/'): string {
  return origen + base.replace(/\/$/, '') + rutaMonitor(token)
}

export function CompartirMonitorSheet({ open, onClose, token, linea }: {
  open: boolean
  onClose: () => void
  token: string
  /** «Baader 200 · Línea 1»: va en el texto del compartir del teléfono. */
  linea: string
}) {
  const [copiado, setCopiado] = useState(false)
  const url = urlPublicaMonitor(token)
  const puedeCompartirNativo = typeof navigator !== 'undefined' && !!navigator.share

  const copiar = async () => {
    await copiarTexto(url)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }
  const compartirNativo = async () => {
    try {
      await navigator.share({ title: `Monitor · ${linea}`, text: `Turno en vivo de ${linea} (solo lectura)`, url })
    } catch {
      /* el usuario canceló */
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compartir el monitor"
      description={`Quien abra el enlace ve ${linea} en vivo, en solo lectura y sin cuenta.`}
      actions={
        <>
          {puedeCompartirNativo && (
            <Button variant="tinted" onClick={() => void compartirNativo()}>
              <Share2 aria-hidden="true" />
              Compartir
            </Button>
          )}
          <Button onClick={() => void copiar()}>
            {copiado ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copiado ? 'Enlace copiado' : 'Copiar enlace'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2">
        <div className="rounded-card bg-white p-3">
          <QRCodeSVG value={url} size={192} level="M" />
        </div>
        <p className="w-full break-all rounded-ctl bg-muted/50 p-2.5 text-center font-mono text-caption text-muted-foreground">{url}</p>
      </div>
    </Sheet>
  )
}
