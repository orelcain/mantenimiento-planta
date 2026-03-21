import { useMemo, useEffect } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'

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
 */
export function ClimaPortPage() {
  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    return `${basePath}clima-puerto-embed.html`
  }, [])

  // Escuchar datos DIRECTEMAR del embed y cachear en Firestore
  // para que Cloud Functions pueda leer el estado del puerto
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type !== 'DM_STATUS_UPDATE') return
      const payload = event.data.payload
      if (!payload?.found) return
      setDoc(doc(db, 'cache', 'dmStatus'), {
        ...payload,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {})
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
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
