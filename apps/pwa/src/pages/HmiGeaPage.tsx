import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/store'
import { EncabezadoHerramienta } from '@/components/piel'

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
 */
export function HmiGeaPage() {
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const isAuthenticated = useAuthStore(state => state.isAuthenticated)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'hmi-gea-embed.html?embed=1&v=' + v
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
    </div>
  )
}
