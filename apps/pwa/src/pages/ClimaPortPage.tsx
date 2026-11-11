import { useEffect, useMemo, useRef } from 'react'
import { auth } from '@/services/firebase'

const CACHE_DM_URL = 'https://us-central1-mantenimiento-planta-771a3.cloudfunctions.net/cacheDmStatus'

/**
 * Módulo Clima Puerto — Dashboard meteorológico del Puerto de Chonchi.
 *
 * Carga el HTML standalone (public/clima-puerto-embed.html) dentro de un iframe
 * que ocupa todo el espacio disponible dentro del MainLayout.
 *
 * Sin toolbar propia: el dashboard embebido ya tiene controles propios
 * (Actualizar, Mapa amplio, capas Windy, etc.).
 *
 * Acceso: protegido por AdminRoute en App.tsx.
 *
 * Puente DM (auditoría 10-11-2026): el embed lee SITPORT (GCP no puede) y le
 * pasa el estado DM a esta página por postMessage; esta lo envía a
 * `cacheDmStatus` con el ID token del usuario. La función ya no acepta
 * llamadas sin sesión, porque ese doc dispara los push de «Bahía cerrada».
 */
export function ClimaPortPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    return `${basePath}clima-puerto-embed.html`
  }, [])

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data as { __clima?: boolean; type?: string; payload?: unknown }
      if (!m || m.__clima !== true || m.type !== 'dm-cache' || !m.payload) return
      const user = auth.currentUser
      if (!user) return
      try {
        const token = await user.getIdToken()
        await fetch(CACHE_DM_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(m.payload),
        })
      } catch {
        // Igual que antes: si falla el cacheo, el dashboard sigue funcionando.
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <div className="h-full w-full">
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Clima del puerto de Chonchi"
        className="w-full h-full border-0"
        allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  )
}
