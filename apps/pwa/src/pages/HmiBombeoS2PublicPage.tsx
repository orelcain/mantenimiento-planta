/**
 * HmiBombeoS2PublicPage — Modo Aprendizaje HMI Bombeo Acopio S2 (YAL)
 *
 * - NO requiere autenticación (público)
 * - Embebe el HMI standalone /hmi-bombeo-s2-embed.html en iframe
 * - Validador de ciclo MANUAL:
 *   · Reproduce el video IMG_1522.mp4 (PLC real operando) lado a lado con el simulador
 *   · Controles frame-step preciso (±1 frame a 30fps)
 *   · Botones del ciclo como bookmarks rápidos al timestamp donde ocurre cada evento
 *   · (Próx fase) edición manual de pipes/LEDs + captura de snapshots
 * - Ruta: /aprendizaje/hmi-bombeo-s2
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { BookOpen, QrCode, X, Copy, Check, Maximize, Minimize, GitCompare, Play, Pause, SkipBack, SkipForward, Rewind, Paintbrush, Eraser, Camera, Download, Trash2 } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

const SNAPSHOTS_LS_KEY = 'hmi-yal-snapshots-v1'

interface Snapshot {
  id: string                          // uuid corto
  name: string
  description: string
  videoTimestamp: number              // segundos
  frameNumber: number
  capturedAt: string                  // ISO date
  state: Record<string, string>       // state vector completo
  overrides: Record<string, string>   // pipe overrides ("on" | "off")
}

type ValveValue = 'open' | 'closed'
type LedValue = 'on-green' | 'off'
type EquipValue = 'on' | 'off'

interface CycleState {
  id: string
  label: string
  description: string
  videoTimestamp: number    // segundos en el video real (IMG_1522.mp4 @ 29.95fps)
  values: Record<string, ValveValue | LedValue | EquipValue | string>
}

const EQUIP_ON: Record<string, EquipValue> = {
  'equipment.atlas': 'on',
  'equipment.c1': 'on',
  'equipment.c2': 'on',
  'equipment.sello': 'on',
  'equipment.bombeo': 'on',
  'equipment.bBarrido': 'on',
}

function makeVector(valves: Record<string, ValveValue>, leds: Record<string, LedValue>, readouts: Record<string, string> = {}) {
  return { ...EQUIP_ON, ...valves, ...leds, ...readouts }
}

/**
 * Estados del ciclo extraídos del análisis de IMG_1522.mp4 (frames a 2fps = 0.5s granularidad).
 * El campo videoTimestamp linkea cada estado al momento exacto del video real.
 */
const CYCLE_STATES: CycleState[] = [
  {
    id: 'A.0', label: 'A.0', description: 'Fase A inicial — descarga A + carga B (LED A verde)',
    videoTimestamp: 0.5,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'open','valve.y103':'open','valve.y104':'closed','valve.y111':'closed','valve.y112':'closed','valve.y12':'open','valve.y13':'open','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'on-green','led.tankB':'off','led.yal':'on-green' },
    ),
  },
  {
    id: 'A.1', label: 'A.1', description: 'Fase A — A_drain (LED A bajó a blanco)',
    videoTimestamp: 5,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'open','valve.y103':'open','valve.y104':'closed','valve.y111':'closed','valve.y112':'closed','valve.y12':'open','valve.y13':'open','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'off','led.tankB':'off','led.yal':'on-green' },
    ),
  },
  {
    id: 'A.2', label: 'A.2', description: 'B_full: y10.3 cierra, y11.1 abre venteo vacío, LED B verde',
    videoTimestamp: 17.5,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'open','valve.y103':'closed','valve.y104':'closed','valve.y111':'open','valve.y112':'closed','valve.y12':'open','valve.y13':'open','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'off','led.tankB':'on-green','led.yal':'on-green' },
    ),
  },
  {
    id: 'A.3', label: 'A.3', description: 'A_discharge_done: y10.2 cierra, y11.2 abre venteo presión, y13 cierra',
    videoTimestamp: 22.5,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'closed','valve.y103':'closed','valve.y104':'closed','valve.y111':'open','valve.y112':'open','valve.y12':'open','valve.y13':'closed','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'off','led.tankB':'on-green','led.yal':'off' },
    ),
  },
  {
    id: 'TRANS_AB', label: '↔ A→B', description: 'vent_complete: y11.1+y11.2 cierran, conmuta a Fase B',
    videoTimestamp: 24,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'closed','valve.y103':'closed','valve.y104':'closed','valve.y111':'closed','valve.y112':'closed','valve.y12':'open','valve.y13':'closed','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'off','led.tankB':'on-green','led.yal':'off' },
    ),
  },
  {
    id: 'B.0', label: 'B.0', description: 'Fase B inicial — descarga B + carga A (LED B verde)',
    videoTimestamp: 27.5,
    values: makeVector(
      { 'valve.y101':'open','valve.y102':'closed','valve.y103':'closed','valve.y104':'open','valve.y111':'closed','valve.y112':'closed','valve.y12':'open','valve.y13':'open','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'off','led.tankB':'on-green','led.yal':'on-green' },
    ),
  },
  {
    id: 'B.1', label: 'B.1', description: 'Fase B — B_drain (LED B bajó a blanco)',
    videoTimestamp: 45,
    values: makeVector(
      { 'valve.y101':'open','valve.y102':'closed','valve.y103':'closed','valve.y104':'open','valve.y111':'closed','valve.y112':'closed','valve.y12':'open','valve.y13':'open','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'off','led.tankB':'off','led.yal':'on-green' },
    ),
  },
  {
    id: 'B.2', label: 'B.2', description: 'A_full: y10.1 cierra, y11.1 abre venteo vacío, LED A verde',
    videoTimestamp: 57.5,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'closed','valve.y103':'closed','valve.y104':'open','valve.y111':'open','valve.y112':'closed','valve.y12':'open','valve.y13':'open','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'on-green','led.tankB':'on-green','led.yal':'on-green' },
    ),
  },
  {
    id: 'B.3', label: 'B.3', description: 'B_discharge_done: y10.4 cierra, y11.2 abre venteo presión, y13 cierra',
    videoTimestamp: 70,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'closed','valve.y103':'closed','valve.y104':'closed','valve.y111':'open','valve.y112':'open','valve.y12':'open','valve.y13':'closed','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'on-green','led.tankB':'off','led.yal':'off' },
    ),
  },
  {
    id: 'TRANS_BA', label: '↔ B→A', description: 'vent_complete final: reinicia ciclo a Fase A',
    videoTimestamp: 72.5,
    values: makeVector(
      { 'valve.y101':'closed','valve.y102':'closed','valve.y103':'closed','valve.y104':'closed','valve.y111':'closed','valve.y112':'closed','valve.y12':'open','valve.y13':'closed','valve.y141':'open','valve.y142':'open' },
      { 'led.tankA':'on-green','led.tankB':'off','led.yal':'off' },
    ),
  },
]

const BASE_PATH = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || '/'
const VIDEO_FPS = 29.95
const FRAME_DT = 1 / VIDEO_FPS

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s.toFixed(2).padStart(5, '0')}`
}

export function HmiBombeoS2PublicPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [qrOpen, setQrOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [visualFs, setVisualFs] = useState(false)

  const [currentStateIdx, setCurrentStateIdx] = useState<number>(-1)
  const [compareMode, setCompareMode] = useState(true)
  const [syncMode, setSyncMode] = useState(true)
  const [paintMode, setPaintMode] = useState(false)    // editor manual: click pipes para override on/off
  const [videoTime, setVideoTime] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [overridesCount, setOverridesCount] = useState(0)
  const lastAppliedSyncIdxRef = useRef<number>(-1)

  /* Snapshots: estados capturados manualmente, persisten en LocalStorage */
  const [snapshots, setSnapshots] = useState<Snapshot[]>(() => {
    try {
      const raw = localStorage.getItem(SNAPSHOTS_LS_KEY)
      return raw ? JSON.parse(raw) as Snapshot[] : []
    } catch { return [] }
  })
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false)
  const [captureName, setCaptureName] = useState('')
  const [captureDescription, setCaptureDescription] = useState('')
  const pendingSnapshotPayloadRef = useRef<{ state: Record<string, string>; overrides: Record<string, string> } | null>(null)

  /* Persistir snapshots cada cambio */
  useEffect(() => {
    try { localStorage.setItem(SNAPSHOTS_LS_KEY, JSON.stringify(snapshots)) } catch {}
  }, [snapshots])

  /* Pedir el state al HMI: dispara hmi:get-state, espera hmi:state-snapshot */
  const requestSnapshot = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:get-state' }, '*')
  }, [])

  /* Confirmar el snapshot (guarda en lista) */
  const confirmSnapshot = useCallback(() => {
    const payload = pendingSnapshotPayloadRef.current
    if (!payload) return
    const t = videoRef.current?.currentTime || 0
    const newSnap: Snapshot = {
      id: Math.random().toString(36).slice(2, 10),
      name: captureName.trim() || `Snap_${new Date().toISOString().slice(11, 19)}`,
      description: captureDescription.trim(),
      videoTimestamp: t,
      frameNumber: Math.round(t * VIDEO_FPS),
      capturedAt: new Date().toISOString(),
      state: payload.state,
      overrides: payload.overrides,
    }
    setSnapshots(prev => [...prev, newSnap].sort((a, b) => a.videoTimestamp - b.videoTimestamp))
    setCaptureDialogOpen(false)
    setCaptureName('')
    setCaptureDescription('')
    pendingSnapshotPayloadRef.current = null
  }, [captureName, captureDescription])

  const deleteSnapshot = useCallback((id: string) => {
    setSnapshots(prev => prev.filter(s => s.id !== id))
  }, [])

  /* Aplicar un snapshot al simulador + seek video */
  const applySnapshot = useCallback((snap: Snapshot) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'hmi:applyAll', values: snap.state },
      '*'
    )
    // Aplicar overrides después (necesitamos un mensaje extra)
    Object.entries(snap.overrides).forEach(([pipe, override]) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'hmi:set-pipe-override', pipe, override },
        '*'
      )
    })
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = snap.videoTimestamp
    }
  }, [])

  /* Export JSON de todos los snapshots */
  const exportSnapshotsJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(snapshots, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hmi-yal-snapshots-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [snapshots])

  /* Sincronizar paint-mode al iframe */
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'hmi:paint-mode', on: paintMode },
      '*'
    )
  }, [paintMode])

  /* Escuchar mensajes del iframe (overrides changed, snapshots) */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!e.data || e.data.source !== 'hmi-yal') return
      if (e.data.type === 'hmi:pipe-override-changed') {
        setOverridesCount(c => c + 1)
      } else if (e.data.type === 'hmi:overrides-cleared') {
        setOverridesCount(0)
      } else if (e.data.type === 'hmi:state-snapshot') {
        // Recibido el state vector del HMI → abrir dialog de captura
        pendingSnapshotPayloadRef.current = {
          state: e.data.state || {},
          overrides: e.data.overrides || {},
        }
        // Pausar video y pre-fill nombre con el timestamp
        const t = videoRef.current?.currentTime || 0
        videoRef.current?.pause()
        setCaptureName(`State_${t.toFixed(2)}s`)
        setCaptureDialogOpen(true)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  const clearOverrides = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:clear-overrides' }, '*')
  }, [])

  const iframeSrc = useMemo(() => {
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    // embedded=1 → oculta el cycle-panel del HMI (los controles vienen del wrapper React)
    return BASE_PATH + 'hmi-bombeo-s2-embed.html?v=' + v + '&embedded=1'
  }, [])

  const learnUrl = useMemo(() => {
    const base = window.location.origin + BASE_PATH.replace(/\/$/, '')
    return `${base}/aprendizaje/hmi-bombeo-s2`
  }, [])

  /* Aplica un estado del ciclo: postMessage al HMI + seek video al timestamp */
  const applyState = useCallback((idx: number) => {
    const state = CYCLE_STATES[idx]
    if (!state) return
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'hmi:applyAll', values: state.values },
      '*'
    )
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = state.videoTimestamp
    }
    setCurrentStateIdx(idx)
  }, [])

  /* Frame stepping preciso */
  const stepFrame = useCallback((delta: number) => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const nextTime = Math.max(0, Math.min(v.duration || 999, v.currentTime + delta * FRAME_DT))
    // Snap al frame más cercano para precisión
    v.currentTime = Math.round(nextTime * VIDEO_FPS) / VIDEO_FPS
  }, [])

  const togglePlayPause = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }, [])

  /* Listeners del video para mantener UI sincronizada + auto-aplicar estado en sync mode */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onTime = () => {
      setVideoTime(v.currentTime)
      if (!syncMode) return
      // Buscar el bookmark más reciente cuyo timestamp <= currentTime
      let targetIdx = -1
      for (let i = CYCLE_STATES.length - 1; i >= 0; i--) {
        const cs = CYCLE_STATES[i]
        if (cs && cs.videoTimestamp <= v.currentTime) {
          targetIdx = i
          break
        }
      }
      if (targetIdx !== lastAppliedSyncIdxRef.current) {
        lastAppliedSyncIdxRef.current = targetIdx
        if (targetIdx >= 0) {
          const state = CYCLE_STATES[targetIdx]
          if (state) {
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'hmi:applyAll', values: state.values },
              '*'
            )
            setCurrentStateIdx(targetIdx)
          }
        }
      }
    }
    const onDur = () => setVideoDuration(v.duration)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onSeek = onTime  // disparar sync también en seek manual del scrubber
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('seeked', onSeek)
    v.addEventListener('loadedmetadata', onDur)
    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    return () => {
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('seeked', onSeek)
      v.removeEventListener('loadedmetadata', onDur)
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
    }
  }, [syncMode])

  /* Keyboard shortcuts: ←/→ frame, espacio play/pause */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrame(e.shiftKey ? -10 : -1) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrame(e.shiftKey ? 10 : 1) }
      else if (e.key === ' ') { e.preventDefault(); togglePlayPause() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stepFrame, togglePlayPause])

  const toggleFullscreen = useCallback(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }
    const el = (containerRef.current ?? document.documentElement) as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }
    const isFs = !!(document.fullscreenElement || doc.webkitFullscreenElement)
    if (!isFs) {
      const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el)
      if (req) req().catch(() => setVisualFs(true))
      else setVisualFs(v => !v)
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

  const copyLink = () => {
    navigator.clipboard.writeText(learnUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const currentState = currentStateIdx >= 0 ? CYCLE_STATES[currentStateIdx] : null
  const currentFrame = Math.round(videoTime * VIDEO_FPS)
  const totalFrames = Math.round(videoDuration * VIDEO_FPS)

  return (
    <div ref={containerRef} className="flex flex-col w-screen bg-[#0a1628]" style={{ height: '100dvh' }}>

      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 flex-shrink-0 border-b border-[#1e3a5f]"
        style={{ height: visualFs ? '0' : '40px', overflow: 'hidden', background: '#0d1f3c', transition: 'height .2s' }}
      >
        <BookOpen className="h-4 w-4 text-blue-400 flex-shrink-0" />
        <span className="text-blue-300 text-xs font-semibold tracking-wide uppercase">Modo Aprendizaje</span>
        <span className="text-[#3a5a7a] text-xs hidden sm:inline">— HMI Bombeo Acopio S2 (YAL) · Validador con video real</span>
        <div className="flex-1" />
        <button
          onClick={() => setPaintMode(v => !v)}
          className={`flex items-center gap-1 text-[10px] transition-colors px-2 py-1 rounded border ${paintMode ? 'border-pink-400 text-pink-300 bg-pink-500/10' : 'border-[#1e3a5f] text-blue-400 hover:text-blue-200 hover:border-blue-400'}`}
          title={paintMode ? 'Editor Manual ON: click en cañerías para forzar verde/rojo. Click válvulas/LEDs igual que siempre.' : 'Activar editor manual de cañerías (click ciclo: auto → verde → rojo → auto)'}
        >
          <Paintbrush className="h-3 w-3" />
          <span className="hidden sm:inline">Editar {paintMode ? 'ON' : 'OFF'}</span>
        </button>
        {overridesCount > 0 && (
          <button
            onClick={clearOverrides}
            className="flex items-center gap-1 text-[10px] text-pink-400 hover:text-pink-200 transition-colors px-2 py-1 rounded border border-pink-700 hover:border-pink-400"
            title="Limpiar todos los overrides manuales (vuelve a las reglas automáticas)"
          >
            <Eraser className="h-3 w-3" />
            <span className="hidden sm:inline">Limpiar</span>
          </button>
        )}
        <button
          onClick={requestSnapshot}
          className="flex items-center gap-1 text-[10px] text-cyan-300 hover:text-cyan-100 transition-colors px-2 py-1 rounded border border-cyan-700 hover:border-cyan-400"
          title="Capturar el estado actual del simulador con el timestamp del video"
        >
          <Camera className="h-3 w-3" />
          <span className="hidden sm:inline">Capturar</span>
        </button>
        <button
          onClick={() => setSyncMode(v => !v)}
          className={`flex items-center gap-1 text-[10px] transition-colors px-2 py-1 rounded border ${syncMode ? 'border-amber-400 text-amber-300 bg-amber-500/10' : 'border-[#1e3a5f] text-blue-400 hover:text-blue-200 hover:border-blue-400'}`}
          title={syncMode ? 'Sync ON: el simulador refleja el estado del video automáticamente al cruzar cada bookmark' : 'Sync OFF: el simulador es independiente del video'}
        >
          <span className="font-mono text-[10px]">⇄</span>
          <span className="hidden sm:inline">Sync {syncMode ? 'ON' : 'OFF'}</span>
        </button>
        <button
          onClick={() => setCompareMode(v => !v)}
          className={`flex items-center gap-1 text-[10px] transition-colors px-2 py-1 rounded border ${compareMode ? 'border-green-400 text-green-300 bg-green-500/10' : 'border-[#1e3a5f] text-blue-400 hover:text-blue-200 hover:border-blue-400'}`}
          title="Mostrar / ocultar video real al lado del simulador"
        >
          <GitCompare className="h-3 w-3" />
          <span className="hidden sm:inline">{compareMode ? 'Video ON' : 'Video OFF'}</span>
        </button>
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

      {/* Body: simulador | video player */}
      <div className="flex-1 min-h-0 relative flex">
        <div className={compareMode ? 'w-1/2 min-h-0 relative' : 'w-full min-h-0 relative'}>
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="HMI Bombeo Acopio S2 — Simulador"
            className="w-full h-full border-0"
            allow="fullscreen"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
          <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider text-blue-300 bg-[#0d1f3c]/80 px-2 py-0.5 rounded border border-[#1e3a5f] pointer-events-none">
            Simulador
          </div>
        </div>
        {compareMode && (
          <div className="w-1/2 min-h-0 relative bg-black flex flex-col border-l border-[#1e3a5f]">
            {/* Video element */}
            <div className="flex-1 min-h-0 relative flex items-center justify-center bg-black">
              <video
                ref={videoRef}
                src={BASE_PATH + 'hmi-yal-videos/IMG_1522.mp4'}
                className="max-w-full max-h-full"
                preload="metadata"
                playsInline
              />
              <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider text-green-300 bg-[#0d1f3c]/80 px-2 py-0.5 rounded border border-green-700 pointer-events-none">
                Video real · PLC operando
              </div>
              <div className="absolute top-2 right-2 text-[10px] font-mono text-green-300 bg-[#0d1f3c]/80 px-2 py-0.5 rounded border border-green-700 pointer-events-none">
                f_{String(currentFrame).padStart(4, '0')} · {formatTime(videoTime)}
              </div>
            </div>

            {/* Custom video controls */}
            <div className="flex-shrink-0 bg-[#0a1628] border-t border-[#1e3a5f] px-2 py-2">
              <div className="flex items-center gap-1 mb-1">
                <button
                  onClick={() => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = 0 } }}
                  className="flex-shrink-0 p-1 rounded text-blue-400 hover:text-blue-200 hover:bg-[#1e3a5f]"
                  title="Volver al inicio"
                >
                  <Rewind className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => stepFrame(-10)}
                  className="flex-shrink-0 p-1 rounded text-blue-400 hover:text-blue-200 hover:bg-[#1e3a5f] font-mono text-[9px]"
                  title="-10 frames (Shift+←)"
                >
                  ⏪10
                </button>
                <button
                  onClick={() => stepFrame(-1)}
                  className="flex-shrink-0 p-1 rounded text-blue-400 hover:text-blue-200 hover:bg-[#1e3a5f]"
                  title="-1 frame (←)"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={togglePlayPause}
                  className="flex-shrink-0 p-1 rounded text-green-400 hover:text-green-200 hover:bg-[#1e3a5f]"
                  title="Play/Pause (Space)"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => stepFrame(1)}
                  className="flex-shrink-0 p-1 rounded text-blue-400 hover:text-blue-200 hover:bg-[#1e3a5f]"
                  title="+1 frame (→)"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => stepFrame(10)}
                  className="flex-shrink-0 p-1 rounded text-blue-400 hover:text-blue-200 hover:bg-[#1e3a5f] font-mono text-[9px]"
                  title="+10 frames (Shift+→)"
                >
                  10⏩
                </button>
                <span className="text-[10px] font-mono text-blue-300 ml-2 flex-shrink-0">
                  {currentFrame}/{totalFrames || '?'}
                </span>
                <span className="text-[10px] font-mono text-[#5a8ab8] flex-shrink-0">
                  {formatTime(videoTime)} / {formatTime(videoDuration)}
                </span>
                <div className="flex-1" />
                <span className="text-[9px] text-[#3a5a7a] uppercase tracking-wider">←/→ frame · Shift ±10 · Space</span>
              </div>
              <input
                type="range"
                min={0}
                max={videoDuration || 100}
                step={FRAME_DT}
                value={videoTime}
                onChange={(e) => { const v = videoRef.current; if (v) { v.pause(); v.currentTime = parseFloat(e.target.value) } }}
                className="w-full h-1 bg-[#1e3a5f] rounded accent-green-500 cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer: panel del ciclo (bookmarks rápidos) */}
      {!visualFs && (
        <div className="flex-shrink-0 border-t border-[#1e3a5f] bg-[#0d1f3c]">
          <div className="flex items-center gap-1 px-2 py-2 overflow-x-auto">
            <span className="text-[#3a5a7a] text-[9px] uppercase tracking-wider flex-shrink-0 pr-1">Bookmarks ciclo:</span>
            {CYCLE_STATES.map((s, idx) => {
              const active = currentStateIdx === idx
              const isTransition = s.id.startsWith('TRANS_')
              return (
                <button
                  key={s.id}
                  onClick={() => applyState(idx)}
                  className="flex-shrink-0 px-2.5 py-1 rounded text-[11px] transition-all whitespace-nowrap font-mono"
                  style={
                    active
                      ? { background: isTransition ? '#7a4a1a' : '#1a4a8a', color: '#fff', border: '1px solid ' + (isTransition ? '#bf6a2a' : '#2a6abf'), fontWeight: 700 }
                      : { background: isTransition ? '#1a1208' : '#0a1628', color: isTransition ? '#bf8a4a' : '#5a8ab8', border: '1px solid ' + (isTransition ? '#3a2a18' : '#1e3a5f') }
                  }
                  title={`${s.description}\n→ Aplica al simulador y salta a t=${s.videoTimestamp}s del video`}
                >
                  {s.label}
                  <span className="ml-1 text-[8px] opacity-60">{s.videoTimestamp}s</span>
                </button>
              )
            })}
          </div>

          {currentState && (
            <div className="px-3 pb-2 text-[10px] text-blue-300/80 italic">
              <span className="text-blue-400 font-semibold not-italic">{currentState.label}:</span> {currentState.description}
            </div>
          )}

          {!currentState && (
            <div className="px-3 pb-2 text-[10px] text-[#3a5a7a]">
              <span className="uppercase tracking-wider">Tocá un bookmark para saltar a ese momento del video + aplicar estado al simulador.</span>
              <span className="ml-2 hidden sm:inline">Próx fase: edición manual de pipes + captura de snapshots reales.</span>
            </div>
          )}
        </div>
      )}

      {/* Botón salir de fullscreen visual (iOS / fallback) */}
      {visualFs && (
        <button
          onClick={() => setVisualFs(false)}
          className="fixed top-2 right-2 z-50 flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-blue-200"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <Minimize className="h-3 w-3" />
        </button>
      )}

      {/* Capture Dialog */}
      {captureDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setCaptureDialogOpen(false)}
        >
          <div
            className="bg-[#0d1f3c] border border-cyan-700 rounded-xl p-5 flex flex-col gap-3 shadow-2xl max-w-md w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-cyan-300 text-sm font-semibold flex items-center gap-2">
                <Camera className="h-4 w-4" /> Capturar Estado
              </span>
              <button onClick={() => setCaptureDialogOpen(false)} className="text-[#3a5a7a] hover:text-cyan-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-[10px] text-blue-300/70">
              Timestamp video: <span className="font-mono text-cyan-300">{formatTime(videoTime)}</span>
              {' · '}
              Frame: <span className="font-mono text-cyan-300">f_{String(Math.round(videoTime * VIDEO_FPS)).padStart(4, '0')}</span>
              {pendingSnapshotPayloadRef.current && (
                <span className="block mt-1">Overrides manuales: <span className="font-mono text-pink-300">{Object.keys(pendingSnapshotPayloadRef.current.overrides).length}</span></span>
              )}
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-blue-300/80 uppercase tracking-wide">Nombre del estado</span>
              <input
                type="text"
                value={captureName}
                onChange={e => setCaptureName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmSnapshot() }}
                placeholder="ej: A.2_real, Venteo_max, Fase_A_inicio..."
                className="bg-[#0a1628] border border-[#1e3a5f] rounded px-2 py-1.5 text-[12px] text-blue-200 outline-none focus:border-cyan-400"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] text-blue-300/80 uppercase tracking-wide">Descripción (opcional)</span>
              <input
                type="text"
                value={captureDescription}
                onChange={e => setCaptureDescription(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirmSnapshot() }}
                placeholder="ej: B_full ocurrió, venteo vacío activo"
                className="bg-[#0a1628] border border-[#1e3a5f] rounded px-2 py-1.5 text-[12px] text-blue-200 outline-none focus:border-cyan-400"
              />
            </label>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={confirmSnapshot}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-[11px] font-semibold transition-colors"
              >
                <Check className="h-3.5 w-3.5" /> Guardar snapshot
              </button>
              <button
                onClick={() => setCaptureDialogOpen(false)}
                className="px-3 py-2 rounded border border-[#1e3a5f] hover:border-blue-400 text-blue-300 text-[11px] transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Snapshots panel — overlay deslizable a la izquierda */}
      {snapshots.length > 0 && !visualFs && (
        <div className="absolute top-[44px] left-0 z-30 max-w-[260px] max-h-[60vh] overflow-y-auto bg-[#0d1f3c]/95 border border-cyan-900 rounded-r-lg p-2 shadow-2xl">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-cyan-300 text-[10px] font-semibold uppercase tracking-wide">Snapshots ({snapshots.length})</span>
            <button onClick={exportSnapshotsJSON} title="Exportar todos como JSON" className="text-blue-400 hover:text-blue-200">
              <Download className="h-3 w-3" />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {snapshots.map(s => (
              <div key={s.id} className="bg-[#0a1628] border border-[#1e3a5f] hover:border-cyan-700 rounded p-1.5 flex items-start gap-1 group">
                <button onClick={() => applySnapshot(s)} className="flex-1 text-left" title={s.description || 'Aplicar al simulador y saltar al timestamp del video'}>
                  <div className="text-[11px] text-cyan-200 font-mono leading-tight">{s.name}</div>
                  <div className="text-[9px] text-[#5a8ab8] font-mono">
                    {formatTime(s.videoTimestamp)} · f_{String(s.frameNumber).padStart(4, '0')}
                    {Object.keys(s.overrides).length > 0 && <span className="text-pink-400"> · {Object.keys(s.overrides).length}🎨</span>}
                  </div>
                  {s.description && <div className="text-[9px] text-blue-300/70 italic mt-0.5 truncate">{s.description}</div>}
                </button>
                <button onClick={() => deleteSnapshot(s.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity flex-shrink-0 p-0.5" title="Eliminar snapshot">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
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
              <span className="text-blue-300 text-sm font-semibold">Compartir HMI</span>
              <button onClick={() => setQrOpen(false)} className="text-[#3a5a7a] hover:text-blue-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-[11px] text-blue-400 text-center">HMI Bombeo Acopio S2 · YAL</p>

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
