import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { History, Cpu, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuthStore } from '@/store'
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
} from '@/services/hmiKnuro'
import type { HmiHistoryEntry } from '@/services/hmiKnuro'
import { Button } from '@/components/ui'

/**
 * HmiKnuroPage — Módulo HMI Knuro B2
 *
 * Carga el simulador HMI (hmi-knuro-embed.html) en un iframe y actúa como
 * puente postMessage <-> Firestore para persistir presets, preset activo,
 * referencias de fábrica e historial de cambios.
 */
export function HmiKnuroPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const user = useAuthStore(state => state.user)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [history, setHistory] = useState<HmiHistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    return basePath + 'hmi-knuro-embed.html'
  }, [])

  const sendInitData = useCallback(async (iframe: HTMLIFrameElement) => {
    try {
      const [presets, current, refs] = await Promise.all([
        getHmiPresets(),
        getCurrentPreset(),
        getHmiRefs(),
      ])
      iframe.contentWindow?.postMessage({ type: 'hmi:init', presets, current, refs }, '*')
    } catch (err) {
      console.error('[HMI Knuro] Error cargando datos de Firestore:', err)
    }
  }, [])

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data.type !== 'string') return
      if (!event.data.type.startsWith('hmi:')) return
      if (!user) return
      const { type } = event.data
      switch (type) {
        case 'hmi:ready':
          if (iframeRef.current) await sendInitData(iframeRef.current)
          break
        case 'hmi:save-preset': {
          const { name, data, previousData } = event.data
          if (!name || !data) break
          await saveHmiPreset(name, data, user.id)
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
          const presets = await getHmiPresets()
          await deleteHmiPreset(name)
          await addHmiHistory({
            presetName: name,
            action: 'delete',
            data: null,
            previousData: presets[name] ?? null,
            userId: user.id,
            userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
          })
          break
        }
        case 'hmi:set-current':
          if (typeof event.data.name === 'string') await setCurrentPreset(event.data.name)
          break
        case 'hmi:save-refs':
          if (event.data.refs) await saveHmiRefs(event.data.refs)
          break
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [user, sendInitData])

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

  return (
    <div className="flex flex-col h-full w-full relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Cpu className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold truncate">HMI Knuro B2</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Simulador de parámetros — Baader
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
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
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="HMI Knuro B2 Simulator"
          className="w-full h-full border-0"
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        />
      </div>

      {/* Panel historial */}
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
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setHistoryOpen(false)}
              >
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
                    <span className={`font-semibold truncate ${entry.action === 'delete' ? 'text-red-400' : 'text-emerald-400'}`}>
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
