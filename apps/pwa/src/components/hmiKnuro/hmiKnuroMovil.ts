/**
 * HMI Knuro en el CELULAR — lógica compartida por la página admin (HmiKnuroPage) y la pública
 * (HmiKnuroPublicPage). Antes vivía solo en la pública: la admin nunca le mandaba `hmi:land` al
 * iframe, así que en horizontal seguían todas las barras y el HMI quedaba diminuto.
 *
 * - Horizontal (pointer: coarse): la página pone su contenedor `fixed inset-0` por encima de
 *   TODO el cromo de la app (barra inferior, burbuja de ARIA) y le avisa al iframe con
 *   `hmi:land`, que esconde sus barras y muestra el riel Buscar/Lista/«?»/Salir.
 *   «Salir» (mensaje `hmi:exit-fs`) devuelve el cromo hasta volver a vertical.
 * - Vertical: aviso descartable «Gira el teléfono…» (misma clave de localStorage en ambas).
 * - En el teléfono se esconde la burbuja del chat de ARIA mientras se esté en la página: tapaba
 *   el 🔧 de la barra del simulador, la hoja de ayuda y la lista de campos (ver ChatBot).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { ocultarBurbujaChat } from '@/lib/pantallaCompletaMovil'

/** Misma condición que usa el iframe (KN_LAND_MQ en hmi-knuro-embed.html). */
export const LAND_MQ = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)'
export const PORTRAIT_MQ = '(orientation: portrait) and (max-width: 640px)'
/** Teléfono en cualquier orientación: aquí la burbuja de ARIA no tiene dónde ponerse. */
const PHONE_MQ = '(pointer: coarse) and (max-width: 767px), (pointer: coarse) and (max-height: 500px)'
export const AVISO_KEY = 'hmiKnuro.avisoGirar.oculto'

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => {
    try { return window.matchMedia(query).matches } catch { return false }
  })
  useEffect(() => {
    let mq: MediaQueryList
    try { mq = window.matchMedia(query) } catch { return }
    const h = () => setMatch(mq.matches)
    h()
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [query])
  return match
}

function readAvisoOculto(): boolean {
  try { return window.localStorage.getItem(AVISO_KEY) === '1' } catch { return false }
}

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }

/**
 * Estado de pantalla completa / modo horizontal del simulador.
 * `containerRef` es lo que se pide a pantalla completa (Android); `iframeRef` recibe `hmi:land`.
 */
export function useHmiKnuroMovil(
  containerRef: RefObject<HTMLElement | null>,
  iframeRef: RefObject<HTMLIFrameElement | null>,
) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [visualFs, setVisualFs] = useState(false)
  const landscape = useMedia(LAND_MQ)
  const portraitPhone = useMedia(PORTRAIT_MQ)
  const phone = useMedia(PHONE_MQ)
  const [landOff, setLandOff] = useState(false)
  const [avisoOculto, setAvisoOculto] = useState(readAvisoOculto)
  useEffect(() => { if (!landscape) setLandOff(false) }, [landscape])
  const compact = landscape && !landOff
  const immersive = compact || isFullscreen || visualFs

  // Burbuja de ARIA fuera mientras se esté en el HMI desde un teléfono.
  useEffect(() => (phone ? ocultarBurbujaChat() : undefined), [phone])

  useEffect(() => {
    const handler = () => {
      const fs = !!(document.fullscreenElement || (document as FsDoc).webkitFullscreenElement)
      setIsFullscreen(fs)
      if (!fs) setVisualFs(false)
    }
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [])

  const enterFullscreen = useCallback(() => {
    setLandOff(false)
    const el = (containerRef.current ?? document.documentElement) as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
    const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el)
    // Android Chrome: pantalla completa + girar y bloquear en horizontal. iPhone no deja
    // ninguna de las dos: ahí se esconden las barras y el modo horizontal sale al girar.
    const lockLandscape = () => {
      try {
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
        o?.lock?.('landscape')?.catch(() => {})
      } catch { /* sin soporte */ }
    }
    if (req) {
      try {
        req().then(lockLandscape).catch(() => setVisualFs(true))
      } catch { setVisualFs(true) }
    } else {
      setVisualFs(true)
    }
  }, [containerRef])

  const exitImmersive = useCallback(() => {
    const doc = document as FsDoc
    if (document.fullscreenElement || doc.webkitFullscreenElement) {
      const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document)
      try { (exit?.() as Promise<void> | undefined)?.catch?.(() => {}) } catch { /* nada */ }
    }
    try {
      const o = screen.orientation as ScreenOrientation & { unlock?: () => void }
      o?.unlock?.()
    } catch { /* sin soporte */ }
    setVisualFs(false)
    if (window.matchMedia?.(LAND_MQ).matches) setLandOff(true)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement || (document as FsDoc).webkitFullscreenElement || visualFs) exitImmersive()
    else enterFullscreen()
  }, [visualFs, enterFullscreen, exitImmersive])

  const ocultarAviso = useCallback(() => {
    setAvisoOculto(true)
    try { window.localStorage.setItem(AVISO_KEY, '1') } catch { /* modo privado */ }
  }, [])

  // Modo horizontal → iframe (muestra el riel y deja el HMI a todo el alto). El iframe decide
  // `kn-land` SOLO por este mensaje (dentro del iframe su propio alto no sirve de criterio).
  const readyRef = useRef(false)
  const compactRef = useRef(compact)
  compactRef.current = compact
  useEffect(() => {
    if (!readyRef.current) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:land', on: compact }, window.location.origin)
  }, [compact, iframeRef])
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return
      if (!e.data || typeof e.data.type !== 'string') return
      if (e.data.type === 'hmi:ready') {
        readyRef.current = true
        iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:land', on: compactRef.current }, window.location.origin)
      } else if (e.data.type === 'hmi:exit-fs') {
        exitImmersive()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [exitImmersive, iframeRef])

  return {
    compact, immersive, isFullscreen, visualFs,
    enterFullscreen, exitImmersive, toggleFullscreen,
    mostrarAviso: portraitPhone && !avisoOculto && !immersive,
    ocultarAviso,
  }
}

/** Cierra un menú al tocar fuera o con Escape. */
export function useCloseOnOutside(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [ref, open, close])
}
