/**
 * HmiKnuroPublicPage — Modo Aprendizaje HMI Knuro
 *
 * - NO requiere autenticación
 * - Carga presets y tooltips desde Firestore (lectura pública)
 * - Embebe el HMI en modo readonly (sin edición de parámetros ni tooltips)
 * - Selector de preset (pills horizontales scrollables)
 * - Layout adaptado a móvil horizontal
 * - Celular horizontal: pantalla completa del simulador SIN barras de la página (ni las de
 *   MainLayout): el HMI toma el alto completo y el iframe muestra su riel (Buscar, Lista,
 *   «?», Salir). Se activa con «Pantalla completa» o con solo girar el teléfono.
 * - Celular vertical: aviso descartable «Gira el teléfono…» con botón «Pantalla completa».
 * - Ruta: /hmi/learn  y  /hmi/learn/:presetId
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Loader2, AlertCircle, BookOpen, QrCode, X, Copy, Check, Maximize, Minimize } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getHmiPresets, getHmiTooltips, getPresetOrder } from '@/services/hmiKnuro'

/** Misma condición que usa el iframe (KN_LAND_MQ en hmi-knuro-embed.html). */
const LAND_MQ = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)'
const PORTRAIT_MQ = '(orientation: portrait) and (max-width: 640px)'
const AVISO_KEY = 'hmiKnuro.avisoGirar.oculto'

function useMedia(query: string): boolean {
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

export function HmiKnuroPublicPage() {
  const { presetId } = useParams<{ presetId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeReadyRef = useRef(false)

  const [presets, setPresets] = useState<Record<string, Record<string, string>>>({})
  const [tooltips, setTooltips] = useState<Record<string, unknown>>({})
  const [presetOrder, setPresetOrder] = useState<string[]>([])
  const [selected, setSelected] = useState<string>(presetId ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // QR dialog
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Fullscreen (real API + fallback visual para iOS)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [visualFs, setVisualFs] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Celular horizontal → modo compacto sin barras. «Salir» lo apaga hasta volver a vertical.
  const landscape = useMedia(LAND_MQ)
  const portraitPhone = useMedia(PORTRAIT_MQ)
  const [landOff, setLandOff] = useState(false)
  const [avisoOculto, setAvisoOculto] = useState(readAvisoOculto)
  useEffect(() => { if (!landscape) setLandOff(false) }, [landscape])
  const compact = landscape && !landOff
  const immersive = compact || isFullscreen || visualFs

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
  }, [])

  const exitImmersive = useCallback(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
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
    const doc = document as Document & { webkitFullscreenElement?: Element }
    if (document.fullscreenElement || doc.webkitFullscreenElement || visualFs) exitImmersive()
    else enterFullscreen()
  }, [visualFs, enterFullscreen, exitImmersive])

  const ocultarAviso = useCallback(() => {
    setAvisoOculto(true)
    try { window.localStorage.setItem(AVISO_KEY, '1') } catch { /* modo privado */ }
  }, [])

  useEffect(() => {
    const handler = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element }
      const fs = !!(document.fullscreenElement || doc.webkitFullscreenElement)
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

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'hmi-knuro-embed.html?v=' + v + '&mode=readonly'
  }, [])

  const learnUrl = useMemo(() => {
    const base = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    return selected ? `${base}/hmi/learn/${encodeURIComponent(selected)}` : `${base}/hmi/learn`
  }, [selected])

  // Cargar datos desde Firestore (sin auth)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([getHmiPresets(), getHmiTooltips(), getPresetOrder()])
      .then(([p, t, order]) => {
        if (cancelled) return
        setPresets(p)
        setTooltips(t)
        setPresetOrder(order)
        // Seleccionar preset inicial
        const keys = order.filter(n => n in p).concat(Object.keys(p).filter(n => !order.includes(n)))
        if (!selected || !(selected in p)) {
          setSelected(keys[0] ?? '')
        }
      })
      .catch(err => { if (!cancelled) setError(`Error cargando datos: ${(err as Error).message}`) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Presets en orden
  const presetKeys = useMemo(() => {
    const all = Object.keys(presets)
    const ordered = presetOrder.filter(n => all.includes(n))
    const rest = all.filter(n => !presetOrder.includes(n))
    return [...ordered, ...rest]
  }, [presets, presetOrder])

  // Enviar datos al iframe cuando esté listo y haya preset seleccionado
  const sendInitData = (selected: string) => {
    if (!iframeRef.current?.contentWindow || !selected || !(selected in presets)) return
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'hmi:init',
        presets,
        current: selected,
        refs: {},
        order: presetOrder,
        readonly: true,
        tooltips,
      },
      window.location.origin
    )
  }

  // Escuchar hmi:ready
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'hmi:ready') return
      iframeReadyRef.current = true
      if (selected) sendInitData(selected)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [presets, tooltips, presetOrder, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  // Modo horizontal compacto → iframe (muestra el riel y deja el HMI a todo el alto)
  const compactRef = useRef(compact)
  compactRef.current = compact
  useEffect(() => {
    if (!iframeReadyRef.current) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:land', on: compact }, window.location.origin)
  }, [compact])
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return
      if (!e.data || typeof e.data.type !== 'string') return
      if (e.data.type === 'hmi:ready') {
        iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:land', on: compactRef.current }, window.location.origin)
      } else if (e.data.type === 'hmi:exit-fs') {
        exitImmersive()
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [exitImmersive])

  // Aplicar un preset a la UI y al iframe (sin tocar la URL)
  const applyPreset = (name: string) => {
    setSelected(name)
    if (iframeReadyRef.current) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:load-preset', name }, window.location.origin)
      // Also re-send full init to ensure tooltips are loaded
      setTimeout(() => sendInitData(name), 100)
    }
  }

  // Ruta base de la página actual (sin el :presetId). Sirve para /hmi/learn y
  // /aprendizaje/hmi-knuro: la navegación relativa ('../learn/x') solo servía en la primera
  // y mandaba a /aprendizaje/learn/x (inexistente -> login) en la segunda.
  const basePath = useMemo(() => {
    let path = location.pathname.replace(/\/+$/, '')
    if (presetId) {
      const suffix = '/' + encodeURIComponent(presetId)
      if (path.endsWith(suffix)) path = path.slice(0, -suffix.length)
      else path = path.slice(0, path.lastIndexOf('/'))
    }
    return path
  }, [location.pathname, presetId])

  // Cambiar preset: actualiza la URL (conserva la ruta pública actual); el efecto de abajo aplica el cambio
  const switchPreset = (name: string) => {
    if (name === presetId) return
    navigate(`${basePath}/${encodeURIComponent(name)}`)
  }

  // La URL manda: atrás/adelante del navegador o enlace directo cambian el preset
  useEffect(() => {
    if (loading || !presetId || presetId === selected) return
    if (presetId in presets) applyPreset(presetId)
  }, [presetId]) // eslint-disable-line react-hooks/exhaustive-deps

  const copyLink = () => {
    navigator.clipboard.writeText(learnUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#0a1628]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-blue-300 text-sm">Cargando HMI…</p>
        </div>
      </div>
    )
  }

  // Error
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#0a1628]">
        <div className="flex flex-col items-center gap-3 max-w-sm px-4">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-red-300 text-sm text-center">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={immersive ? 'fixed inset-0 z-[70] flex flex-col bg-[#1a1c22]' : 'flex flex-col w-screen bg-[#0a1628]'}
      style={immersive
        ? { height: '100dvh', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }
        : { height: '100dvh' }}
    >

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0 border-b border-[#1e3a5f]"
        style={{ height: immersive ? '0' : '40px', overflow: 'hidden', background: '#0d1f3c', borderBottomWidth: immersive ? 0 : undefined, transition: 'height .2s' }}
      >
        <BookOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Modo Aprendizaje</span>
        <span className="text-[#3a5a7a] text-xs hidden sm:inline">— HMI Knuro</span>
        <div className="flex-1" />
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-200 transition-colors px-2 py-1 rounded border border-[#1e3a5f] hover:border-blue-400"
          title={(isFullscreen || visualFs) ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {(isFullscreen || visualFs) ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
        </button>
        <button
          onClick={() => setQrOpen(true)}
          className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-200 transition-colors px-2 py-1 rounded border border-[#1e3a5f] hover:border-blue-400"
          title="Compartir QR"
        >
          <QrCode className="h-3 w-3" />
          <span className="hidden sm:inline">Compartir</span>
        </button>
      </div>

      {/* Preset selector */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0 overflow-x-auto"
        style={{ height: immersive ? '0' : '36px', overflow: immersive ? 'hidden' : 'auto', background: '#0a1628', borderBottom: immersive ? '0' : '1px solid #12243a', transition: 'height .2s' }}
      >
        <span className="text-[10px] text-[#3a5a7a] flex-shrink-0 uppercase tracking-wide">Preset:</span>
        {presetKeys.map(name => (
          <button
            key={name}
            onClick={() => switchPreset(name)}
            className="flex-shrink-0 px-2.5 py-0.5 rounded-full text-[10px] transition-all whitespace-nowrap"
            style={
              name === selected
                ? { background: '#1a4a8a', color: '#7ec8ff', border: '1px solid #2a6abf', fontWeight: 600 }
                : { background: '#0d1f3c', color: '#4a7aaa', border: '1px solid #1e3a5f' }
            }
          >
            {name}
          </button>
        ))}
      </div>

      {/* Celular vertical: aviso para girar (estilo ventana del panel, como la ayuda) */}
      {portraitPhone && !avisoOculto && !immersive && (
        <div
          role="note"
          className="flex-shrink-0 flex items-center gap-2.5"
          style={{
            margin: '8px 10px', padding: '6px 4px 6px 10px', background: '#f4f4f4', color: '#222',
            border: '1px solid #9090a0', borderBottom: '2px solid #707080', borderRadius: 3,
            font: '14px/1.3 Arial, Helvetica, sans-serif',
          }}
        >
          <svg viewBox="0 0 30 30" width="26" height="26" fill="none" stroke="#1e3f7a" strokeWidth="2" aria-hidden="true" style={{ flex: 'none' }}>
            <rect x="4" y="9" width="20" height="12" rx="2" />
            <path d="M26 6a8 8 0 0 0-8-4l2 2m-2-2 2-2" />
          </svg>
          <span className="flex-1 min-w-0">Gira el teléfono para ver el panel más grande</span>
          <button
            type="button"
            onClick={() => { ocultarAviso(); enterFullscreen() }}
            style={{
              flex: 'none', minHeight: 44, padding: '0 10px', background: '#dcdce8', color: '#111',
              border: '1px solid #9090a0', borderBottom: '2px solid #707080', borderRadius: 2,
              font: 'bold 13px Arial, Helvetica, sans-serif',
            }}
          >
            Pantalla completa
          </button>
          <button
            type="button"
            onClick={ocultarAviso}
            aria-label="No volver a mostrar este aviso"
            className="flex items-center justify-center"
            style={{ flex: 'none', width: 44, height: 44, color: '#555', background: 'transparent', border: 0 }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* iframe */}
      <div className="flex-1 min-h-0 relative">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="HMI Knuro — Modo Aprendizaje"
          className="w-full h-full border-0"
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>

      {/* Footer branding */}
      {!immersive && (
        <div
          className="flex-shrink-0 text-center"
          style={{ padding: '3px 0', background: '#0d1f3c', borderTop: '1px solid #12243a' }}
        >
          <p className="text-[9px] text-[#2a4a6a] uppercase tracking-wider">Mantenimiento Industrial — Solo lectura</p>
        </div>
      )}

      {/* Salir de pantalla completa fuera del modo horizontal (en horizontal se sale desde el riel del HMI) */}
      {(isFullscreen || visualFs) && !compact && (
        <button
          onClick={exitImmersive}
          aria-label="Salir de pantalla completa"
          className="fixed top-2 right-2 z-[80] flex items-center justify-center rounded-lg text-blue-200"
          style={{ width: 44, height: 44, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <Minimize className="h-4 w-4" />
        </button>
      )}

      {/* QR Dialog */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setQrOpen(false)}
        >
          <div
            className="bg-[#0d1f3c] border border-[#1e3a5f] rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl max-w-xs w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-blue-300 text-sm font-semibold">Compartir preset</span>
              <button onClick={() => setQrOpen(false)} className="text-[#3a5a7a] hover:text-blue-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            {selected && (
              <p className="text-[11px] text-blue-400 text-center">{selected}</p>
            )}

            <div className="bg-white p-3 rounded-lg">
              <QRCodeSVG value={learnUrl} size={180} level="M" includeMargin={false} />
            </div>

            <div className="flex items-center gap-2 w-full">
              <input
                readOnly
                value={learnUrl}
                className="flex-1 text-[10px] bg-[#0a1628] border border-[#1e3a5f] rounded px-2 py-1.5 text-blue-300 outline-none min-w-0"
              />
              <button
                onClick={copyLink}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#1a4a8a] text-blue-200 text-[10px] hover:bg-[#2a5a9a] transition-colors flex-shrink-0"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
