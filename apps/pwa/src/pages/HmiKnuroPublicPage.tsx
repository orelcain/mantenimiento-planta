/**
 * HmiKnuroPublicPage — Modo Aprendizaje HMI Knuro
 *
 * - NO requiere autenticación
 * - Carga presets y tooltips desde Firestore (lectura pública)
 * - Embebe el HMI en modo readonly (sin edición de parámetros ni tooltips)
 * - Marco único de herramienta (2026-10-09): EncabezadoHerramienta (volver · título · ARIA · Más) y,
 *   debajo, el único control: los presets (ControlPresetsKnuro: Máquina N1-N3 segmentada + Planta).
 *   El marco sigue el tema (paleta Pizarra); ya no hay estilo fijo «Consola» (DESIGN.md §5f/§6b).
 *   Pantalla completa y Compartir (QR) viven en «Más». El iframe lleva `embed=1`: sin su franja
 *   «Modo Aprendizaje — Solo lectura».
 * - Layout adaptado a móvil horizontal
 * - Celular horizontal: pantalla completa del simulador SIN barras de la página (ni las de
 *   MainLayout): el HMI toma el alto completo y el iframe muestra su riel (Buscar, Lista,
 *   «?», Salir). Se activa con «Pantalla completa» o con solo girar el teléfono.
 * - Celular vertical: pista de giro de primera visita DENTRO del iframe (línea bajo el panel, no
 *   flota sobre nada; mensaje hmi:giro). Se marca vista al mostrarse (una sola vez). La frase de
 *   planta y máquina va en el encabezado en lugar del subtítulo.
 * - Ruta: /aprendizaje/hmi-knuro  y  /aprendizaje/hmi-knuro/:presetId (única puerta para todos).
 *   /hmi/learn[/:presetId] (QR antiguos) redirige aquí desde App.tsx.
 * - Con sesión va dentro de MainLayout (main de alto fijo: modo «lienzo» de lib/rutasHerramienta.ts): ocupa h-full.
 *   Sin sesión no hay layout: ocupa 100dvh.
 * - Admin: botón «Editar presets y ayudas» → /hmi-knuro (editor, AdminRoute).
 */

import { useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Loader2, AlertCircle, QrCode, X, Copy, Check, Maximize, Minimize, Pencil } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { getHmiPresets, getHmiTooltips, getPresetOrder } from '@/services/hmiKnuro'
import { AVISO_KEY, useHmiKnuroMovil } from '@/components/hmiKnuro/hmiKnuroMovil'
import { ControlPresetsKnuro } from '@/components/hmiKnuro/ControlPresetsKnuro'
import { EncabezadoHerramienta } from '@/components/piel'
import { frasePreset, partirPreset } from '@/components/hmiKnuro/knuroPresets'
import '@/components/hmiKnuro/knuroConsola.css'
import { useAuthStore, useIsAdmin } from '@/store'
import { useTemaEmbed } from '@/hooks/useTemaEmbed'

export function HmiKnuroPublicPage() {
  const { presetId } = useParams<{ presetId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeReadyRef = useRef(false)
  const enviarTema = useTemaEmbed(iframeRef)
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

  // Pista de giro → iframe. Al mostrarse queda marcada como vista (localStorage): sale una vez.
  const [iframeListo, setIframeListo] = useState(false)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== iframeRef.current?.contentWindow) return
      const t = (e.data as { type?: unknown } | null)?.type
      if (t === 'hmi:ready') setIframeListo(true)
      else if (t === 'hmi:giro-off') ocultarAviso()
      else if (t === 'hmi:giro-fs') { ocultarAviso(); enterFullscreen() }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [ocultarAviso, enterFullscreen])
  useEffect(() => {
    if (!iframeListo) return
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:giro', on: mostrarAviso }, window.location.origin)
    if (mostrarAviso) {
      try { window.localStorage.setItem(AVISO_KEY, '1') } catch { /* modo privado */ }
    }
  }, [iframeListo, mostrarAviso])

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'hmi-knuro-embed.html?v=' + v + '&mode=readonly&embed=1'
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

  const copyLink = () => {
    navigator.clipboard.writeText(learnUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const fsOn = isFullscreen || visualFs
  const fsLabel = fsOn ? 'Salir de pantalla completa' : 'Pantalla completa'
  const selPartes = selected ? partirPreset(selected) : null
  const fraseSel = selPartes ? frasePreset(selPartes) : selected

  // Carga / error: mismo marco (sigue el tema)
  if (loading || error) {
    return (
      <div className={`knc knc-estado ${isAuthenticated ? 'h-full w-full' : 'h-screen w-screen'}`}>
        {loading
          ? <><Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /><p>Cargando HMI…</p></>
          : <><AlertCircle className="h-8 w-8 bad" aria-hidden="true" /><p className="bad" style={{ maxWidth: 320, textAlign: 'center' }}>{error}</p></>}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={immersive
        ? 'knc fixed inset-0 z-[70] flex flex-col'
        : isAuthenticated ? 'knc flex flex-col h-full w-full' : 'knc flex flex-col w-screen'}
      style={immersive
        ? { height: '100dvh', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }
        : isAuthenticated ? undefined : { height: '100dvh' }}
    >

      {/* Encabezado único del marco (fuera en pantalla completa / celular horizontal). El único
          control, los presets, va debajo en el celular y dentro de la fila en PC. */}
      {!immersive && (
        <EncabezadoHerramienta
          etiquetaVolver="Aprendizaje"
          volverA="/aprendizaje"
          titulo="HMI Knuro"
          subtitulo={fraseSel || undefined}
          contextoAria={`Estoy en el simulador HMI Knuro${fraseSel ? `, ${fraseSel}` : ''}. `}
          control={<ControlPresetsKnuro names={presetKeys} selected={selected || null} onSelect={switchPreset} />}
          itemsMas={[
            { key: 'fs', label: fsLabel, icon: fsOn ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />, onClick: toggleFullscreen },
            { key: 'qr', label: 'Compartir (QR)', icon: <QrCode aria-hidden="true" />, onClick: () => setQrOpen(true) },
            ...(isAdmin ? [{ key: 'edit', label: 'Editar presets y ayudas', icon: <Pencil aria-hidden="true" />, onClick: () => navigate('/hmi-knuro') }] : []),
          ]}
        />
      )}

      {/* iframe */}
      <div className="flex-1 min-h-0 relative">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="HMI Knuro — Modo Aprendizaje"
          className="w-full h-full border-0"
          allow="fullscreen"
          onLoad={enviarTema}
          sandbox="allow-scripts allow-same-origin allow-forms"
        />
      </div>

      {/* Salir de pantalla completa fuera del modo horizontal (en horizontal se sale desde el riel del HMI) */}
      {fsOn && !compact && (
        <button type="button" onClick={exitImmersive} aria-label="Salir de pantalla completa" className="knc-fsx">
          <Minimize className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {/* QR */}
      {qrOpen && (
        <div className="knc-scrim" onClick={() => setQrOpen(false)}>
          <div className="knc-dlg" role="dialog" aria-modal="true" aria-label="Compartir preset" onClick={e => e.stopPropagation()}>
            <div className="knc-dlg-h">
              <span>Compartir preset</span>
              <button type="button" onClick={() => setQrOpen(false)} className="knc-ib sq bare" aria-label="Cerrar">
                <X aria-hidden="true" />
              </button>
            </div>
            {fraseSel && <p>{fraseSel}</p>}
            <div className="knc-qr">
              <QRCodeSVG value={learnUrl} size={180} level="M" includeMargin={false} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={learnUrl} className="knc-input knc-mono" style={{ fontSize: 11 }} aria-label="Enlace" />
              <button type="button" onClick={copyLink} className="knc-ib">
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
            <p>Abre el simulador en modo lectura. No requiere sesión.</p>
          </div>
        </div>
      )}
    </div>
  )
}
