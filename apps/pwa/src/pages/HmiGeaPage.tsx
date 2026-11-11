import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { BookOpen, Check, Copy, QrCode, RefreshCw, Share2 } from 'lucide-react'
import { useAuthStore } from '@/store'
import { Button, EncabezadoHerramienta, Sheet } from '@/components/piel'
import { copiarTexto } from '@/lib/clipboard'

/**
 * HmiGeaPage — Simulador HMI GEA PowerPak (termoformadora GEA V2, serie 50520184).
 *
 * Ruta pública /aprendizaje/hmi-gea (única entrada, desde el Centro de Aprendizaje; abre sin sesión).
 * Embebe /hmi-gea-embed.html en un iframe. Los datos van DENTRO del HTML: no hay Firestore,
 * ni puente postMessage, ni modo edición.
 *
 * Contrato con el HTML (ver iframeSrc):
 * - `?embed=1`: el HTML debe ocultar su cabecera propia (título + leyenda) porque la app ya pone
 *   el EncabezadoHerramienta, y no necesitar scroll propio salvo el de su contenido.
 * - `?v=<versión>`: solo rompe la caché; el HTML lo ignora.
 * - `#p1-1-6` (hash de la ruta): abre esa pantalla. El HTML lo mantiene al navegar, y «Compartir» lo copia
 *   al enlace público para abrir a otros en la misma pantalla (solo lectura: el simulador no guarda nada).
 */

/** Pantalla que muestra el iframe ahora, como «1.1.6» (el HTML lleva su hash `#p1-1-6`). */
function pantallaDelIframe(iframe: HTMLIFrameElement | null): string | null {
  try {
    const h = iframe?.contentWindow?.location.hash ?? ''
    return /^#p[\d-]+$/.test(h) ? h.slice(2).replace(/-/g, '.') : null
  } catch {
    return null
  }
}

export function HmiGeaPage() {
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)
  const { hash } = useLocation()
  const [compartir, setCompartir] = useState<{ pantalla: string | null } | null>(null)
  const [conPantalla, setConPantalla] = useState(true)
  const [copiado, setCopiado] = useState(false)

  const basePublica = window.location.origin + (import.meta.env.BASE_URL || '/') + 'aprendizaje/hmi-gea'
  const pantallaCompartida = conPantalla ? compartir?.pantalla ?? null : null
  const urlCompartir = basePublica + (pantallaCompartida ? '#p' + pantallaCompartida.replace(/\./g, '-') : '')
  const abrirCompartir = () => { setCopiado(false); setCompartir({ pantalla: pantallaDelIframe(iframeRef.current) }) }
  const copiar = async () => { await copiarTexto(urlCompartir); setCopiado(true); setTimeout(() => setCopiado(false), 2000) }
  const puedeCompartirNativo = typeof navigator !== 'undefined' && !!navigator.share
  const compartirNativo = async () => {
    try {
      await navigator.share({ title: 'HMI GEA PowerPak', text: 'Simulador del panel de la termoformadora GEA V2 (solo lectura)', url: urlCompartir })
    } catch {
      /* el usuario canceló */
    }
  }

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    // el hash de la ruta (#p1-1-6) abre esa pantalla dentro del simulador
    return basePath + 'hmi-gea-embed.html?embed=1&v=' + v + (/^#p[\d-]+$/.test(hash) ? hash : '')
    // solo al montar: navegar dentro del simulador no debe recargar el iframe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const recargar = () => {
    const iframe = iframeRef.current
    if (!iframe) return
    iframe.src = ''
    setTimeout(() => { if (iframeRef.current) iframeRef.current.src = iframeSrc }, 50)
  }

  return (
    // Sin sesión no hay layout que acote el alto: se toma el del viewport (como el HMI Knuro/Grader).
    <div
      className="flex flex-col h-full w-full relative"
      style={isAuthenticated ? undefined : { height: '100dvh' }}
    >
      <EncabezadoHerramienta
        etiquetaVolver="Aprendizaje"
        volverA="/aprendizaje"
        titulo="HMI GEA PowerPak"
        subtitulo="Simulador · Termoformadora GEA V2 · serie 50520184"
        contextoAria="Estoy en el simulador HMI GEA PowerPak (termoformadora GEA V2). "
        itemsMas={[
          { key: 'share', label: 'Compartir (enlace y QR)', subtitle: 'Lo abren sin cuenta, en solo lectura', icon: <QrCode aria-hidden="true" />, onClick: abrirCompartir },
          { key: 'exp', label: 'Expediente de la termoformadora', subtitle: 'Ficha de la máquina en Aprendizaje', icon: <BookOpen aria-hidden="true" />, onClick: () => navigate('/aprendizaje/maquina/termoformadora-gea') },
          { key: 'reload', label: 'Recargar simulador', icon: <RefreshCw aria-hidden="true" />, onClick: recargar },
        ]}
      />

      <div className="flex-1 min-h-0 relative overflow-auto bg-background">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="HMI GEA PowerPak Simulator"
          className="absolute inset-x-0 top-0 block h-full w-full border-0"
          // iOS agranda el iframe hasta el ancho de su contenido: 1px + min-width lo deja fijo al ancho disponible
          style={{ width: 1, minWidth: '100%' }}
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
        />
      </div>

      <Sheet
        open={compartir !== null}
        onClose={() => setCompartir(null)}
        title="Compartir el simulador"
        description="Quien abra el enlace ve el panel de la GEA en solo lectura, sin cuenta. No puede cambiar nada."
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
            <QRCodeSVG value={urlCompartir} size={192} level="M" />
          </div>
          <p className="w-full break-all rounded-ctl bg-muted/50 p-2.5 text-center font-mono text-caption text-muted-foreground">{urlCompartir}</p>
          {compartir?.pantalla && (
            <label className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 text-body">
              <input type="checkbox" className="h-5 w-5 accent-primary" checked={conPantalla} onChange={e => setConPantalla(e.target.checked)} />
              <span>Abrir en la pantalla que estoy viendo <span className="tabular-nums text-muted-foreground">({compartir.pantalla})</span></span>
            </label>
          )}
        </div>
      </Sheet>
    </div>
  )
}
