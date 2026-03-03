import { useRef, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useCanSee, useIsAdmin } from '@/store'
import { CloudSun, Maximize2, Minimize2, RefreshCw, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui'

/**
 * Módulo Clima Puerto — Dashboard meteorológico del Puerto de Chonchi.
 *
 * Carga el HTML standalone (public/clima-puerto.html) dentro de un iframe
 * que ocupa todo el espacio disponible dentro del MainLayout (header 4rem arriba).
 *
 * Usa márgenes negativos para eliminar el padding del <main> del layout padre
 * y así evitar overflow/scroll que haría desaparecer el sidebar.
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
    // Márgenes negativos anulan el p-3/lg:p-6 del <main> padre.
    // h-[calc(100vh-4rem)] = viewport - header sticky (h-16 = 4rem).
    <div className="-m-3 lg:-m-6 flex flex-col h-[calc(100vh-4rem)]">
      {/* Toolbar compacta */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b bg-card/80 backdrop-blur shrink-0">
        <div className="flex items-center gap-2">
          <CloudSun className="h-4 w-4 text-blue-500" />
          <h1 className="text-sm font-semibold">Clima Puerto Chonchi</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Dashboard meteorológico · DIRECTEMAR
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleRefresh}
            title="Recargar datos"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleOpenExternal}
            title="Abrir en nueva pestaña"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Iframe — ocupa todo el espacio restante */}
      <iframe
        key={iframeKey}
        ref={iframeRef}
        src={iframeSrc}
        title="Dashboard Clima Puerto Chonchi"
        className="flex-1 w-full border-0 min-h-0"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}
