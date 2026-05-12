/**
 * HmiBombeoS2PublicPage — Modo Aprendizaje HMI SIMATIC Sistema 2 Bombeo Acopio
 *
 * - NO requiere autenticación
 * - Embebe el HMI como iframe en modo readonly
 * - Selector de preset (pills horizontales)
 * - Ruta: /aprendizaje/hmi-bombeo-s2
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Loader2, AlertCircle, BookOpen, Maximize, Minimize } from 'lucide-react'
import { getBombeoS2Presets, DEFAULT_BOMBEO_S2_PRESETS, type HmiBombeoS2Values } from '@/services/hmiBombeoS2'

export function HmiBombeoS2PublicPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeReadyRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const [presets, setPresets] = useState<Record<string, HmiBombeoS2Values>>(DEFAULT_BOMBEO_S2_PRESETS)
  const [selected, setSelected] = useState<string>('Estado normal')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'hmi-bombeo-s2-embed.html?v=' + v + '&mode=readonly'
  }, [])

  const toggleFullscreen = useCallback(() => {
    const el = (containerRef.current ?? document.documentElement) as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    const isFs = !!(document.fullscreenElement || doc.webkitFullscreenElement)
    if (!isFs) {
      const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el)
      req?.()
    } else {
      const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document)
      exit?.()
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element }
      setIsFullscreen(!!(document.fullscreenElement || doc.webkitFullscreenElement))
    }
    document.addEventListener('fullscreenchange', handler)
    document.addEventListener('webkitfullscreenchange', handler)
    return () => {
      document.removeEventListener('fullscreenchange', handler)
      document.removeEventListener('webkitfullscreenchange', handler)
    }
  }, [])

  // Cargar presets desde Firestore (con fallback a defaults locales)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getBombeoS2Presets()
      .then(p => {
        if (cancelled) return
        const merged = Object.keys(p).length > 0 ? p : DEFAULT_BOMBEO_S2_PRESETS
        setPresets(merged)
        const firstKey = Object.keys(merged)[0]
        if (firstKey) setSelected(firstKey)
      })
      .catch(err => {
        if (!cancelled) setError(`Error: ${(err as Error).message}`)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const sendInit = useCallback((presetName: string) => {
    if (!iframeRef.current?.contentWindow) return
    const values = presets[presetName] ?? {}
    iframeRef.current.contentWindow.postMessage(
      { type: 'hmi:init', values, readonly: true },
      '*',
    )
  }, [presets])

  // Escuchar hmi:ready
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'hmi:ready') return
      iframeReadyRef.current = true
      if (selected) sendInit(selected)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [selected, sendInit])

  const switchPreset = (name: string) => {
    setSelected(name)
    if (iframeReadyRef.current) sendInit(name)
  }

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

  const presetKeys = Object.keys(presets)

  return (
    <div ref={containerRef} className="flex flex-col w-screen bg-[#0a1628]" style={{ height: '100dvh' }}>
      <div className="flex items-center gap-2 px-3 flex-shrink-0 border-b border-[#1e3a5f]"
           style={{ height: '40px', background: '#0d1f3c' }}>
        <BookOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Modo Aprendizaje</span>
        <span className="text-[#3a5a7a] text-xs hidden sm:inline">— HMI Bombeo Acopio S2</span>
        <div className="flex-1" />
        <button onClick={toggleFullscreen}
                className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-200 px-2 py-1 rounded border border-[#1e3a5f] hover:border-blue-400"
                title={isFullscreen ? 'Salir' : 'Pantalla completa'}>
          {isFullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 flex-shrink-0 overflow-x-auto"
           style={{ height: '36px', background: '#0a1628', borderBottom: '1px solid #12243a' }}>
        <span className="text-[10px] text-[#3a5a7a] flex-shrink-0 uppercase tracking-wide">Escenario:</span>
        {presetKeys.map(name => (
          <button key={name} onClick={() => switchPreset(name)}
                  className="flex-shrink-0 px-2.5 py-0.5 rounded-full text-[10px] transition-all whitespace-nowrap"
                  style={
                    name === selected
                      ? { background: '#1a4a8a', color: '#7ec8ff', border: '1px solid #2a6abf', fontWeight: 600 }
                      : { background: '#0d1f3c', color: '#4a7aaa', border: '1px solid #1e3a5f' }
                  }>
            {name}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative">
        <iframe ref={iframeRef} src={iframeSrc}
                title="HMI Bombeo Acopio S2 — Modo Aprendizaje"
                className="w-full h-full border-0"
                allow="fullscreen"
                sandbox="allow-scripts allow-same-origin" />
      </div>

      <div className="flex-shrink-0 text-center"
           style={{ padding: '3px 0', background: '#0d1f3c', borderTop: '1px solid #12243a' }}>
        <p className="text-[9px] text-[#2a4a6a] uppercase tracking-wider">Mantenimiento Industrial — Solo lectura</p>
      </div>
    </div>
  )
}
