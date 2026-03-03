import { useRef, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useCanSee, useIsAdmin } from '@/store'
import { CloudSun, Maximize2, Minimize2, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * Módulo Clima Puerto — Dashboard meteorológico del Puerto de Chonchi.
 *
 * Carga el HTML standalone (public/clima-puerto.html) dentro de un iframe
 * con pantalla completa, ocupando todo el viewport disponible.
 *
 * Acceso: solo visible si el módulo 'climaPuerto' está habilitado
 * (por defecto solo admin; configurable desde Permisos).
 */
export function ClimaPortPage() {
  const canSee = useCanSee('climaPuerto')
  const isAdmin = useIsAdmin()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)

  const basePath = import.meta.env.BASE_URL || '/'
  const iframeSrc = `${basePath}clima-puerto.html`

  const handleRefresh = () => {
    setIframeKey((k) => k + 1)
  }

  const handleFullscreen = () => {
    if (!iframeRef.current) return
    if (!document.fullscreenElement) {
      iframeRef.current.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  const handleOpenExternal = () => {
    window.open(iframeSrc, '_blank')
  }

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  // Guard después de todos los hooks
  if (!canSee && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-2">
          <CloudSun className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-semibold">Clima Puerto Chonchi</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Dashboard meteorológico · DIRECTEMAR
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            title="Recargar datos"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleOpenExternal}
            title="Abrir en nueva pestaña"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Iframe — ocupa todo el espacio restante */}
      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={iframeSrc}
        title="Dashboard Clima Puerto Chonchi"
        className="flex-1 w-full border-0"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}
