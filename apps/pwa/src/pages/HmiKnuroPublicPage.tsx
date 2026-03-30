/**
 * HmiKnuroPublicPage — Modo Aprendizaje HMI Knuro
 *
 * - NO requiere autenticación
 * - Carga presets y tooltips desde Firestore (lectura pública)
 * - Embebe el HMI en modo readonly (sin edición de parámetros ni tooltips)
 * - Selector de preset (pills horizontales scrollables)
 * - Layout adaptado a móvil horizontal
 * - Ruta: /hmi/learn  y  /hmi/learn/:presetId
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, BookOpen, QrCode, X, Copy, Check, Maximize, Minimize } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getHmiPresets, getHmiTooltips, getPresetOrder } from '@/services/hmiKnuro'

export function HmiKnuroPublicPage() {
  const { presetId } = useParams<{ presetId?: string }>()
  const navigate = useNavigate()
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

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
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
    setLoading(true)
    setError(null)
    Promise.all([getHmiPresets(), getHmiTooltips(), getPresetOrder()])
      .then(([p, t, order]) => {
        setPresets(p)
        setTooltips(t)
        setPresetOrder(order)
        // Seleccionar preset inicial
        const keys = order.filter(n => n in p).concat(Object.keys(p).filter(n => !order.includes(n)))
        if (!selected || !(selected in p)) {
          setSelected(keys[0] ?? '')
        }
      })
      .catch(err => setError(`Error cargando datos: ${(err as Error).message}`))
      .finally(() => setLoading(false))
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
      '*'
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

  // Cambiar preset
  const switchPreset = (name: string) => {
    setSelected(name)
    navigate(`../learn/${encodeURIComponent(name)}`, { relative: 'route', replace: true })
    if (iframeReadyRef.current) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:load-preset', name }, '*')
      // Also re-send full init to ensure tooltips are loaded
      setTimeout(() => sendInitData(name), 100)
    }
  }

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
    <div ref={containerRef} className="flex flex-col w-screen bg-[#0a1628]" style={{ height: '100dvh' }}>

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0 border-b border-[#1e3a5f]"
        style={{ height: '40px', background: '#0d1f3c' }}
      >
        <BookOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Modo Aprendizaje</span>
        <span className="text-[#3a5a7a] text-xs hidden sm:inline">— HMI Knuro</span>
        <div className="flex-1" />
        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-200 transition-colors px-2 py-1 rounded border border-[#1e3a5f] hover:border-blue-400"
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {isFullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
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
        style={{ height: '36px', background: '#0a1628', borderBottom: '1px solid #12243a' }}
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
      <div
        className="flex-shrink-0 text-center"
        style={{ padding: '3px 0', background: '#0d1f3c', borderTop: '1px solid #12243a' }}
      >
        <p className="text-[9px] text-[#2a4a6a] uppercase tracking-wider">Mantenimiento Industrial — Solo lectura</p>
      </div>

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
