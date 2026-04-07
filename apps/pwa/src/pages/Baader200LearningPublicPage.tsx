/**
 * Baader200LearningPublicPage — Modo Aprendizaje Baader 200
 * - NO requiere autenticación
 * - Carga secciones desde Firestore (lectura pública)
 * - Ruta: /baader-200/learn  y  /baader-200/learn/:sectionId
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, BookOpen, QrCode, X, Copy, Check, Maximize, Minimize } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getB200Sections, getB200SectionOrder } from '@/services/baader200Learning'
import type { B200Section } from '@/services/baader200Learning'

export function Baader200LearningPublicPage() {
  const { sectionId } = useParams<{ sectionId?: string }>()
  const navigate = useNavigate()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeReadyRef = useRef(false)

  const [sections, setSections] = useState<B200Section[]>([])
  const [sectionOrder, setSectionOrder] = useState<string[]>([])
  const [selected, setSelected] = useState<string>(sectionId ?? '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [visualFs, setVisualFs] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    const el = (containerRef.current ?? document.documentElement) as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
    const isFs = !!(document.fullscreenElement || doc.webkitFullscreenElement)
    if (!isFs) {
      const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el)
      if (req) { req().catch(() => setVisualFs(true)) } else { setVisualFs(v => !v) }
    } else {
      const exit = document.exitFullscreen?.bind(document) ?? doc.webkitExitFullscreen?.bind(document)
      exit?.()
    }
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
    return basePath + 'baader-200-learn-embed.html?v=' + v + '&mode=readonly'
  }, [])

  const learnUrl = useMemo(() => {
    const base = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
    return selected ? `${base}/baader-200/learn/${encodeURIComponent(selected)}` : `${base}/baader-200/learn`
  }, [selected])

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([getB200Sections(), getB200SectionOrder()])
      .then(([s, order]) => {
        setSections(s)
        setSectionOrder(order)
        const keys = order.filter(id => s.find(x => x.id === id)).concat(s.filter(x => !order.includes(x.id)).map(x => x.id))
        if (!selected || !s.find(x => x.id === selected)) {
          setSelected(keys[0] ?? '')
        }
      })
      .catch(err => setError(`Error cargando datos: ${(err as Error).message}`))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const orderedSections = useMemo(() => {
    const map = new Map(sections.map(s => [s.id, s]))
    const ordered = sectionOrder.map(id => map.get(id)).filter(Boolean) as B200Section[]
    const rest = sections.filter(s => !sectionOrder.includes(s.id))
    return [...ordered, ...rest]
  }, [sections, sectionOrder])

  const sendInitData = useCallback((selId: string) => {
    if (!iframeRef.current?.contentWindow || !selId || !sections.find(s => s.id === selId)) return
    iframeRef.current.contentWindow.postMessage({
      type: 'b200:init',
      sections,
      currentId: selId,
      order: sectionOrder,
      readonly: true,
    }, '*')
  }, [sections, sectionOrder])

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || e.data.type !== 'b200:ready') return
      iframeReadyRef.current = true
      if (selected) sendInitData(selected)
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [sections, sectionOrder, selected, sendInitData])

  const switchSection = (id: string) => {
    setSelected(id)
    navigate(`../learn/${encodeURIComponent(id)}`, { relative: 'route', replace: true })
    if (iframeReadyRef.current) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'b200:select-section', id }, '*')
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(learnUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  // Agrupar secciones por tipo
  const groups = useMemo(() => {
    const g: Record<string, B200Section[]> = { ajuste: [], troubleshooting: [], seguridad: [], precaucion: [] }
    for (const s of orderedSections) { g[s.type]?.push(s) }
    return g
  }, [orderedSections])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#0a1628]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          <p className="text-blue-300 text-sm">Cargando Baader 200…</p>
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

  const selectedTitle = sections.find(s => s.id === selected)?.title ?? ''

  return (
    <div ref={containerRef} className="flex flex-col w-screen bg-[#0a1628]" style={{ height: '100dvh' }}>
      {/* Header — compact on mobile */}
      <div className="flex items-center gap-2 px-3 flex-shrink-0 border-b border-[#1e3a5f]"
        style={{ height: visualFs ? '0' : '44px', overflow: 'hidden', background: 'linear-gradient(180deg, #0d1f3c 0%, #0a1628 100%)', transition: 'height .2s' }}>
        <BookOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-blue-300 text-[11px] font-bold tracking-wide uppercase truncate">BAADER 200</span>
          <span className="text-[#3a6a9a] text-[9px] truncate hidden xs:block">{selectedTitle || 'Manual de Ajustes'}</span>
        </div>
        <button onClick={toggleFullscreen}
          className="flex items-center justify-center w-8 h-8 text-blue-400 hover:text-blue-200 transition-colors rounded-lg border border-[#1e3a5f] hover:border-blue-400 flex-shrink-0"
          title={(isFullscreen || visualFs) ? 'Salir' : 'Pantalla completa'}>
          {(isFullscreen || visualFs) ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => setQrOpen(true)}
          className="flex items-center justify-center w-8 h-8 text-blue-400 hover:text-blue-200 transition-colors rounded-lg border border-[#1e3a5f] hover:border-blue-400 flex-shrink-0">
          <QrCode className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Section tabs — horizontal scroll, touch-friendly */}
      <div className="flex-shrink-0 overflow-x-auto scrollbar-hide"
        style={{ height: visualFs ? '0' : '40px', overflow: visualFs ? 'hidden' : 'auto', background: '#0a1628', borderBottom: '1px solid #12243a', transition: 'height .2s', WebkitOverflowScrolling: 'touch' }}>
        <div className="flex items-center gap-1.5 px-2 h-full" style={{ minWidth: 'max-content' }}>
          {Object.entries(groups).map(([, secs]) => secs.length > 0 && secs.map(s => (
            <button key={s.id} onClick={() => switchSection(s.id)}
              className="flex-shrink-0 rounded-lg text-[11px] transition-all whitespace-nowrap"
              style={s.id === selected
                ? { background: '#1a4a8a', color: '#7ec8ff', border: '1px solid #2a6abf', fontWeight: 700, padding: '6px 12px' }
                : { background: 'transparent', color: '#4a7aaa', border: '1px solid #1e3a5f', padding: '6px 12px' }}>
              {s.title}
            </button>
          )))}
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 min-h-0 relative">
        <iframe ref={iframeRef} src={iframeSrc} title="Baader 200 — Modo Aprendizaje"
          className="w-full h-full border-0" allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms" />
      </div>

      {!visualFs && (
        <div className="flex-shrink-0 text-center flex-shrink-0" style={{ padding: '4px 0', background: '#0d1f3c', borderTop: '1px solid #12243a' }}>
          <p className="text-[9px] text-[#2a4a6a] uppercase tracking-wider">Solo lectura — No requiere login</p>
        </div>
      )}

      {visualFs && (
        <button onClick={() => setVisualFs(false)}
          className="fixed top-2 right-2 z-50 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-blue-200"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)' }}>
          <Minimize className="h-3 w-3" />
        </button>
      )}

      {qrOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setQrOpen(false)}>
          <div className="bg-[#0d1f3c] border border-[#1e3a5f] rounded-xl p-6 flex flex-col items-center gap-4 shadow-2xl max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between w-full">
              <span className="text-blue-300 text-sm font-semibold">Compartir sección</span>
              <button onClick={() => setQrOpen(false)} className="text-[#3a5a7a] hover:text-blue-300"><X className="h-4 w-4" /></button>
            </div>
            {selected && <p className="text-[11px] text-blue-400 text-center">{sections.find(s => s.id === selected)?.title}</p>}
            <div className="bg-white p-3 rounded-lg"><QRCodeSVG value={learnUrl} size={180} level="M" includeMargin={false} /></div>
            <div className="flex items-center gap-2 w-full">
              <input readOnly value={learnUrl} className="flex-1 text-[10px] bg-[#0a1628] border border-[#1e3a5f] rounded px-2 py-1.5 text-blue-300 outline-none min-w-0" />
              <button onClick={copyLink} className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-[#1a4a8a] text-blue-200 text-[10px] hover:bg-[#2a5a9a] transition-colors flex-shrink-0">
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
