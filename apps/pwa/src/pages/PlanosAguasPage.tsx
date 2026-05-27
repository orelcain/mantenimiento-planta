import { useEffect, useMemo, useRef } from 'react'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { ref as storageRef, uploadString, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage, auth } from '../services/firebase'

/**
 * Módulo Planos de Aguas — Planta Principal.
 *
 * Carga el HTML standalone (public/planos-aguas-embed.html) en un iframe.
 *
 * Sincronización: el iframe NO hereda la sesión de Firebase del PWA (storage
 * particionado), por lo que sus escrituras a Firestore se denegaban en silencio.
 * Acá actuamos de PUENTE: el iframe nos pide guardar/subir/borrar vía postMessage
 * y nosotros (que SÍ estamos autenticados) ejecutamos la operación en Firestore /
 * Storage. Las lecturas siguen haciéndose desde el iframe (regla read:if true).
 *
 * Acceso por QR (sin login): planos-aguas-embed.html es estático y público; en ese
 * caso no hay puente y el iframe solo lee (modo ?view=1 = solo lectura).
 */
export function PlanosAguasPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return `${basePath}planos-aguas-embed.html?v=${v}`
  }, [])

  useEffect(() => {
    const ORIGIN = window.location.origin
    const post = (msg: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(msg, ORIGIN)
    }
    const sendBridge = () => {
      const u = auth.currentUser
      post({ __planos: true, type: 'bridge', authed: !!u, uid: u?.uid ?? null })
    }

    // Defensa en profundidad: el iframe corre el HTML del bundle (mismo origen, riesgo bajo)
    // pero limitamos los paths de Storage al prefijo del módulo para evitar que un bug
    // o un futuro contenido injectado escriba/borre fuera de `planosAguas/`.
    const isAllowedPath = (p: unknown): p is string =>
      typeof p === 'string' && /^planosAguas\/[A-Za-z0-9_\-./]+\.(jpg|jpeg|png|webp)$/i.test(p) && !p.includes('..')

    const onMsg = (e: MessageEvent) => {
      if (e.origin !== ORIGIN) return
      if (e.source !== iframeRef.current?.contentWindow) return
      const m = e.data as { __planos?: boolean; type?: string; reqId?: number; payload?: Record<string, unknown>; path?: string; dataUrl?: string }
      if (!m || m.__planos !== true) return

      if (m.type === 'hello') {
        sendBridge()
      } else if (m.type === 'save') {
        // Guardamos todo como un único JSON (blob): Firestore no admite arrays anidados (pts: [[x,y]...])
        setDoc(doc(db, 'planosAguas', 'main'), { blob: JSON.stringify(m.payload ?? {}), updatedAt: serverTimestamp() }, { merge: true })
          .then(() => post({ __planos: true, type: 'save-result', ok: true, reqId: m.reqId }))
          .catch((err) => post({ __planos: true, type: 'save-result', ok: false, code: err?.code ?? 'error', reqId: m.reqId }))
      } else if (m.type === 'upload' && m.dataUrl) {
        if (!isAllowedPath(m.path)) {
          post({ __planos: true, type: 'upload-result', ok: false, code: 'invalid-path', reqId: m.reqId })
          return
        }
        const r = storageRef(storage, m.path)
        uploadString(r, m.dataUrl, 'data_url', { contentType: 'image/jpeg' })
          .then(() => getDownloadURL(r))
          .then((url) => post({ __planos: true, type: 'upload-result', ok: true, url, reqId: m.reqId }))
          .catch((err) => post({ __planos: true, type: 'upload-result', ok: false, code: err?.code ?? 'error', reqId: m.reqId }))
      } else if (m.type === 'delete-photo') {
        if (!isAllowedPath(m.path)) return
        deleteObject(storageRef(storage, m.path)).catch(() => {})
      }
    }

    window.addEventListener('message', onMsg)
    const unsubAuth = auth.onAuthStateChanged(() => sendBridge())
    return () => {
      window.removeEventListener('message', onMsg)
      unsubAuth()
    }
  }, [])

  return (
    <div className="h-full w-full">
      <iframe
        ref={iframeRef}
        src={iframeSrc}
        title="Planos de Aguas — Planta Principal"
        className="w-full h-full border-0"
        allow="fullscreen; clipboard-read; clipboard-write"
        sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-modals"
        onLoad={() => {
          const u = auth.currentUser
          iframeRef.current?.contentWindow?.postMessage({ __planos: true, type: 'bridge', authed: !!u, uid: u?.uid ?? null }, window.location.origin)
        }}
      />
    </div>
  )
}
