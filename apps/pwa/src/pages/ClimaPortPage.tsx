import { useMemo } from 'react'

/**
 * Módulo Clima Puerto — Dashboard meteorológico del Puerto de Chonchi.
 *
 * Carga el HTML standalone (public/clima-puerto.html) dentro de un iframe
 * que ocupa todo el espacio disponible dentro del MainLayout.
 *
 * Sin toolbar propia: el dashboard embebido ya tiene controles propios
 * (Actualizar, Mapa amplio, capas Windy, etc.).
 *
 * Acceso: protegido por AdminRoute en App.tsx.
 */
export function ClimaPortPage() {
  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    return `${basePath}clima-puerto.html`
  }, [])

  return (
    <div className="h-full w-full">
      <iframe
        src={iframeSrc}
        title="Dashboard Clima Puerto Chonchi"
        className="w-full h-full border-0"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}
