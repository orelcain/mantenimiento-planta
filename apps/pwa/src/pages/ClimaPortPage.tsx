import { useRef, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useCanSee, useIsAdmin } from '@/store'

/**
 * Módulo Clima Puerto — Dashboard meteorológico del Puerto de Chonchi.
 *
 * Carga el HTML standalone (public/clima-puerto.html) dentro de un iframe
 * que ocupa todo el espacio disponible dentro del MainLayout.
 *
 * Sin toolbar propia: el dashboard embebido ya tiene controles propios
 * (Actualizar, Mapa amplio, capas Windy, etc.).
 *
 * Acceso: solo visible si el módulo 'climaPuerto' está habilitado
 * (por defecto solo admin; configurable desde Permisos).
 */
export function ClimaPortPage() {
  const canSee = useCanSee('climaPuerto')
  const isAdmin = useIsAdmin()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [_isFullscreen, setIsFullscreen] = useState(false)

  const basePath = import.meta.env.BASE_URL || '/'
  const iframeSrc = `${basePath}clima-puerto.html`

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
    <div className="-m-3 lg:-m-6 h-[calc(100vh-4rem)]">
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Dashboard Clima Puerto Chonchi"
        className="w-full h-full border-0"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}
