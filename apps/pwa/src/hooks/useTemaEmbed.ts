import { useCallback, useEffect, type RefObject } from 'react'
import { EVENTO_INTENSIDAD } from '@/lib/intensidad'
import { temaActual } from '@/lib/temaEmbed'

/**
 * Manda el tema de la app a un iframe (contrato `app:tema`, ver public/embed-tema.js).
 *
 * Devuelve `enviarTema`, para el `onLoad` del iframe. Además lo reenvía solo:
 *  - cuando el embed lo pide (`app:tema-listo`, apenas corre su script, antes del primer pintado);
 *  - cuando cambia la intensidad (EVENTO_INTENSIDAD de useTheme);
 *  - cuando cambia la clase o la paleta del <html> (claro/oscuro del sistema, ?skin=…).
 * targetOrigin = el origen de la app; el iframe valida e.origin y e.source del lado suyo.
 */
export function useTemaEmbed(iframeRef: RefObject<HTMLIFrameElement | null>): () => void {
  const enviarTema = useCallback(() => {
    const w = iframeRef.current?.contentWindow
    if (!w) return
    try { w.postMessage(temaActual(), window.location.origin) } catch { /* iframe aún sin documento */ }
  }, [iframeRef])

  useEffect(() => {
    let raf = 0
    // useTheme emite el evento ANTES de aplicar la clase: se espera al siguiente cuadro.
    const luego = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => requestAnimationFrame(enviarTema))
    }
    const alMensaje = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.source !== iframeRef.current?.contentWindow) return
      if ((e.data as { type?: unknown } | null)?.type === 'app:tema-listo') enviarTema()
    }
    window.addEventListener('message', alMensaje)
    window.addEventListener(EVENTO_INTENSIDAD, luego)
    const mo = new MutationObserver(luego)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-paleta', 'data-skin'] })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('message', alMensaje)
      window.removeEventListener(EVENTO_INTENSIDAD, luego)
      mo.disconnect()
    }
  }, [enviarTema, iframeRef])

  return enviarTema
}
