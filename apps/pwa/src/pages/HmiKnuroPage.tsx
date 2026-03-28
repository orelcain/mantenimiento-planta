import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { History, Cpu, RefreshCw, X, ChevronDown, ChevronUp, Sliders, RotateCcw, Copy } from 'lucide-react'
import { useAuthStore } from '@/store'
import { cn } from '@/lib/utils'
import {
  getHmiPresets,
  saveHmiPreset,
  deleteHmiPreset,
  getCurrentPreset,
  setCurrentPreset,
  getHmiRefs,
  saveHmiRefs,
  addHmiHistory,
  getHmiHistory,
  seedDefaultPresets,
} from '@/services/hmiKnuro'
import type { HmiHistoryEntry } from '@/services/hmiKnuro'
import { Button } from '@/components/ui'

/**
 * HmiKnuroPage — Módulo HMI Knuro B2
 *
 * Carga el simulador HMI (hmi-knuro-embed.html) en un iframe y actúa como
 * puente postMessage <-> Firestore para persistir presets, preset activo,
 * referencias de fábrica e historial de cambios.
 *
 * NOTA de timing: el iframe puede enviar 'hmi:ready' ANTES de que Firebase Auth
 * restaure la sesión. Usamos iframeReadyRef para reintentar sendInitData cuando
 * user se vuelve disponible.
 */
export function HmiKnuroPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const presetsDropdownRef = useRef<HTMLDivElement>(null)
  /** Flag: el iframe ya envió hmi:ready pero user no estaba disponible aún */
  const iframeReadyRef = useRef(false)
  const user = useAuthStore(state => state.user)

  // ── Estado presets ──────────────────────────────────────────────────────
  const [presets, setPresets] = useState<Record<string, Record<string, string>>>({})
  const [currentPresetName, setCurrentPresetName] = useState<string | null>(null)
  const [presetsOpen, setPresetsOpen] = useState(false)

  // ── Estado historial ────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [history, setHistory] = useState<HmiHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    // Cache buster: fuerza recarga del iframe cuando cambia la version del build
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'hmi-knuro-embed.html?v=' + v
  }, [])

  // ── Carga inicial desde Firestore → iframe ──────────────────────────────
  // No depende de user para leer; solo lo necesita para sembrar presets si vacío.
  const sendInitData = useCallback(async (iframe: HTMLIFrameElement) => {
    try {
      let [presetsData, current, refs] = await Promise.all([
        getHmiPresets(),
        getCurrentPreset(),
        getHmiRefs(),
      ])
      // Si Firestore está vacío, sembrar los 6 presets por defecto automáticamente
      if (Object.keys(presetsData).length === 0) {
        const uid = user?.id ?? useAuthStore.getState().user?.id
        if (uid) {
          try {
            await seedDefaultPresets(uid)
            ;[presetsData, current] = await Promise.all([getHmiPresets(), getCurrentPreset()])
            console.info('[HMI] Presets sembrados:', Object.keys(presetsData).join(', '))
          } catch (seedErr) {
            console.error('[HMI] Error sembrando presets (reglas Firestore?):', seedErr)
          }
        }
      }
      setPresets(presetsData)
      setCurrentPresetName(current)
      iframe.contentWindow?.postMessage({ type: 'hmi:init', presets: presetsData, current, refs }, '*')
    } catch (err) {
      console.error('[HMI] Error cargando Firestore:', err)
    }
  }, [user])

  // ── Re-intentar si user llega después de que el iframe estaba listo ────
  useEffect(() => {
    if (user && iframeReadyRef.current && iframeRef.current) {
      sendInitData(iframeRef.current)
    }
  }, [user, sendInitData])

  // ── Cerrar dropdown al hacer clic fuera ─────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (presetsDropdownRef.current && !presetsDropdownRef.current.contains(e.target as Node)) {
        setPresetsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Puente postMessage ──────────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data.type !== 'string') return
      if (!event.data.type.startsWith('hmi:')) return
      const { type } = event.data

      // hmi:ready: guardar flag. Solo llamar sendInitData si user ya está disponible.
      // Si user aún es null (auth restaurando sesión), el useEffect de reintento lo maneja.
      if (type === 'hmi:ready') {
        iframeReadyRef.current = true
        if (user && iframeRef.current) await sendInitData(iframeRef.current)
        return
      }

      // El resto de mensajes requieren user autenticado
      if (!user) return

      switch (type) {
        case 'hmi:save-preset': {
          const { name, data, previousData } = event.data
          if (!name || !data) break
          await saveHmiPreset(name, data, user.id)
          setPresets(prev => ({ ...prev, [name]: data }))
          await addHmiHistory({
            presetName: name,
            action: 'save',
            data,
            previousData: previousData ?? null,
            userId: user.id,
            userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
          })
          break
        }
        case 'hmi:delete-preset': {
          const { name } = event.data
          if (!name) break
          const currentPresets = await getHmiPresets()
          await deleteHmiPreset(name)
          setPresets(prev => { const p = { ...prev }; delete p[name]; return p })
          await addHmiHistory({
            presetName: name,
            action: 'delete',
            data: null,
            previousData: currentPresets[name] ?? null,
            userId: user.id,
            userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
          })
          break
        }
        case 'hmi:set-current':
          if (typeof event.data.name === 'string') {
            await setCurrentPreset(event.data.name)
            setCurrentPresetName(event.data.name)
          }
          break
        case 'hmi:save-refs':
          if (event.data.refs) await saveHmiRefs(event.data.refs)
          break
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [user, sendInitData])

  // ── Cargar preset desde la toolbar React (útil en mobile) ──────────────
  const loadPresetFromReact = useCallback((name: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:load-preset', name }, '*')
    setCurrentPresetName(name)
    setPresetsOpen(false)
  }, [])

  // ── Historial ──────────────────────────────────────────────────────────
  const openHistory = async () => {
    setHistoryOpen(true)
    setLoadingHistory(true)
    try {
      setHistory(await getHmiHistory(60))
    } finally {
      setLoadingHistory(false)
    }
  }

  const refreshIframe = () => {
    if (!iframeRef.current) return
    iframeRef.current.src = ''
    setTimeout(() => {
      if (iframeRef.current) iframeRef.current.src = iframeSrc
    }, 50)
  }

  const clonePreset = useCallback(async (sourceName: string) => {
    if (!user) return
    const newName = prompt('Nombre del nuevo preset:', `${sourceName} - copia`)
    if (!newName || !newName.trim()) return
    const trimmed = newName.trim()
    if (presets[trimmed]) {
      alert(`Ya existe un preset con el nombre "${trimmed}"`)
      return
    }
    const data = { ...presets[sourceName] }
    await saveHmiPreset(trimmed, data, user.id)
    const updatedPresets = { ...presets, [trimmed]: data }
    setPresets(updatedPresets)
    await addHmiHistory({
      presetName: trimmed,
      action: 'save',
      data,
      previousData: null,
      userId: user.id,
      userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
    })
    // Cargar el clon en el iframe
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'hmi:init', presets: updatedPresets, current: trimmed, refs: {} },
      '*'
    )
    await setCurrentPreset(trimmed)
    setCurrentPresetName(trimmed)
    setPresetsOpen(false)
  }, [user, presets])

  const resetToDefaults = useCallback(async () => {
    if (!user) return
    if (!confirm('¿Restaurar los 6 presets a los valores por defecto? Se perderán cambios personalizados.')) return
    await seedDefaultPresets(user.id)
    const [presetsData, current, refs] = await Promise.all([getHmiPresets(), getCurrentPreset(), getHmiRefs()])
    setPresets(presetsData)
    setCurrentPresetName(current)
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:init', presets: presetsData, current, refs }, '*')
  }, [user])

  const presetKeys = Object.keys(presets)

  return (
    <div className="flex flex-col h-full w-full relative">

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold truncate">HMI Knuro</span>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Simulador de parámetros — Baader
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">

          {/* Selector de presets */}
          <div className="relative" ref={presetsDropdownRef}>
            <Button
              variant={presetsOpen ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPresetsOpen(p => !p)}
              className="h-7 gap-1 text-xs"
              title="Seleccionar preset"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span className="hidden sm:inline max-w-[90px] truncate">
                {currentPresetName ?? 'Presets'}
              </span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', presetsOpen && 'rotate-180')} />
            </Button>

            {presetsOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-xl w-56 max-h-72 overflow-y-auto">
                {presetKeys.length === 0 ? (
                  <div className="text-xs text-muted-foreground px-3 py-3 text-center leading-relaxed">
                    Cargando presets…
                  </div>
                ) : (
                  presetKeys.map(name => (
                    <div
                      key={name}
                      className={cn(
                        'flex items-center text-xs hover:bg-muted transition-colors group',
                        name === currentPresetName && 'bg-primary/10'
                      )}
                    >
                      <button
                        onClick={() => loadPresetFromReact(name)}
                        className={cn(
                          'flex-1 text-left px-3 py-2 flex items-center gap-2 min-w-0',
                          name === currentPresetName && 'text-primary font-semibold'
                        )}
                      >
                        <span className="flex-1 truncate">{name}</span>
                        {name === currentPresetName && (
                          <span className="text-[10px] opacity-60">activo</span>
                        )}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); clonePreset(name) }}
                        className="px-2 py-2 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity flex-shrink-0"
                        title={`Clonar "${name}"`}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={historyOpen ? () => setHistoryOpen(false) : openHistory}
            className="h-7 gap-1 text-xs"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Historial</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={refreshIframe} className="h-7 gap-1 text-xs">
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Recargar</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={resetToDefaults} className="h-7 gap-1 text-xs" title="Restaurar presets a valores por defecto">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Restaurar</span>
          </Button>
        </div>
      </div>

      {/* ── iframe ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="HMI Knuro Simulator"
          className="w-full h-full border-0"
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
        />
      </div>

      {/* ── Panel historial (drawer lateral) ────────────────────────── */}
      {historyOpen && (
        <div
          className="absolute inset-y-0 right-0 flex flex-col bg-card border-l border-border shadow-2xl z-50"
          style={{ width: 'min(320px, 90vw)' }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <History className="h-4 w-4 text-primary" />
              Historial de cambios
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setHistoryExpanded(p => !p)}
                title={historyExpanded ? 'Colapsar diffs' : 'Ver diffs'}
              >
                {historyExpanded
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronUp className="h-3.5 w-3.5" />
                }
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHistoryOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loadingHistory && (
              <div className="text-xs text-muted-foreground text-center py-8">Cargando historial…</div>
            )}
            {!loadingHistory && history.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8">Sin cambios registrados</div>
            )}
            {history.map((entry, i) => {
              const diffs = entry.data && entry.previousData
                ? Object.entries(entry.data).filter(([k, v]) => entry.previousData?.[k] !== v)
                : []
              return (
                <div
                  key={entry.id ?? i}
                  className="text-xs rounded-lg border border-border p-2 space-y-0.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('font-semibold truncate', entry.action === 'delete' ? 'text-red-400' : 'text-emerald-400')}>
                      {entry.action === 'save' ? '💾' : '🗑'} {entry.presetName}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {entry.timestamp.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <div className="text-muted-foreground truncate">{entry.userName}</div>
                  {historyExpanded && diffs.length > 0 && (
                    <div className="mt-1 pt-1 border-t border-border space-y-0.5">
                      {diffs.slice(0, 5).map(([k, v]) => (
                        <div key={k} className="flex gap-1 font-mono text-[10px]">
                          <span className="text-muted-foreground truncate max-w-[80px]">{k}</span>
                          <span className="text-red-400 line-through">{entry.previousData?.[k]}</span>
                          <span className="text-emerald-400">{v}</span>
                        </div>
                      ))}
                      {diffs.length > 5 && (
                        <div className="text-muted-foreground text-[10px]">+{diffs.length - 5} más…</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
