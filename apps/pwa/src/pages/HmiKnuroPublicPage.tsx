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
 * - Ruta: /aprendizaje/hmi-knuro  y  /aprendizaje/hmi-knuro/:presetId (única puerta para todos).
 *   /hmi/learn[/:presetId] (QR antiguos) redirige aquí desde App.tsx.
 * - Con sesión va dentro de MainLayout (main de alto fijo, ver isHmiKnuroRoute): ocupa h-full.
 *   Sin sesión no hay layout: ocupa 100dvh.
 * - Admin: botón «Editar presets y ayudas» → /hmi-knuro (editor, AdminRoute).
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Loader2, AlertCircle, BookOpen, QrCode, X, Copy, Check, Maximize, Minimize, ArrowLeft, Pencil } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getHmiPresets, getHmiTooltips, getPresetOrder } from '@/services/hmiKnuro'
import { useHmiKnuroMovil } from '@/components/hmiKnuro/hmiKnuroMovil'
import { AvisoGirarTelefono } from '@/components/hmiKnuro/AvisoGirarTelefono'
import { useAuthStore, useIsAdmin } from '@/store'

export function HmiKnuroPublicPage() {
  const { presetId } = useParams<{ presetId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeReadyRef = useRef(false)
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  const isAdmin = useIsAdmin()

  const [presets, setPresets] = useState<Record<string, Record<string, string>>>({})
  const [tooltips, setTooltips] = useState<Record<string, unknown>>({})
  const [presetOrder, setPresetOrder] = useState<string[]>([])
  const [selected, setSelected] = useState<string>(presetId ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // QR dialog
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Pantalla completa / celular horizontal (compartido con la página admin)
  const containerRef = useRef<HTMLDivElement>(null)
  const { compact, immersive, isFullscreen, visualFs, enterFullscreen, exitImmersive, toggleFullscreen, mostrarAviso, ocultarAviso } =
    useHmiKnuroMovil(containerRef, iframeRef)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'hmi-knuro-embed.html?v=' + v + '&mode=readonly'
  }, [])

  const learnUrl = useMemo(() => {
    const base = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    return selected ? `${base}/aprendizaje/hmi-knuro/${encodeURIComponent(selected)}` : `${base}/aprendizaje/hmi-knuro`
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

  // Aplicar un preset a la UI y al iframe (sin tocar la URL)
  const applyPreset = (name: string) => {
    setSelected(name)
    if (iframeReadyRef.current) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:load-preset', name }, window.location.origin)
      // Also re-send full init to ensure tooltips are loaded
      setTimeout(() => sendInitData(name), 100)
    }
  }

  // Ruta base de la página actual (sin el :presetId), hoy siempre /aprendizaje/hmi-knuro
  // (antes también /hmi/learn): la navegación relativa ('../learn/x') solo servía en la primera
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

  // Volver: con sesión, atrás en el historial si se llegó navegando dentro de la app; si no
  // (QR, enlace directo o sin sesión), al Centro de Aprendizaje.
  const volver = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (isAuthenticated && idx > 0) navigate(-1)
    else navigate('/aprendizaje')
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
      <div className={`flex items-center justify-center bg-[#0a1628] ${isAuthenticated ? 'h-full w-full' : 'h-screen w-screen'}`}>
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
      <div className={`flex items-center justify-center bg-[#0a1628] ${isAuthenticated ? 'h-full w-full' : 'h-screen w-screen'}`}>
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
      className={immersive
        ? 'fixed inset-0 z-[70] flex flex-col bg-[#1a1c22]'
        : isAuthenticated ? 'flex flex-col h-full w-full bg-[#0a1628]' : 'flex flex-col w-screen bg-[#0a1628]'}
      style={immersive
        ? { height: '100dvh', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }
        : isAuthenticated ? undefined : { height: '100dvh' }}
    >

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0 border-b border-[#1e3a5f]"
        style={{ height: immersive ? '0' : '40px', overflow: 'hidden', background: '#0d1f3c', borderBottomWidth: immersive ? 0 : undefined, transition: 'height .2s' }}
      >
        <button
          onClick={volver}
          className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-200 transition-colors px-2 py-1 -ml-1 rounded"
          title="Volver"
          aria-label="Volver"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Volver</span>
        </button>
        <BookOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Modo Aprendizaje</span>
        <span className="text-[#3a5a7a] text-xs hidden sm:inline">— HMI Knuro</span>
        <div className="flex-1" />
        {isAdmin && (
          <button
            onClick={() => navigate('/hmi-knuro')}
            className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-200 transition-colors px-2 py-1 rounded border border-[#1e3a5f] hover:border-blue-400"
            title="Editar presets y ayudas"
          >
            <Pencil className="h-3 w-3" />
            <span className="hidden sm:inline">Editar presets y ayudas</span>
          </button>
        )}
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

      {/* Celular vertical: aviso para girar */}
      {mostrarAviso && <AvisoGirarTelefono onPantallaCompleta={enterFullscreen} onCerrar={ocultarAviso} />}

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
