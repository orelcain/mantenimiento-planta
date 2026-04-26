import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { Scale, RefreshCw, RotateCcw, Save } from 'lucide-react'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'
import {
  getGraderState,
  saveGraderState,
  resetGraderState,
  addGraderHistory,
  type GraderState,
} from '@/services/hmiGrader'
import { Button } from '@/components/ui'

/**
 * HmiGraderPage — Módulo HMI Grader (Marelec StaticGrader Z2)
 *
 * Carga el simulador HMI (hmi-grader.html) en un iframe y actúa como puente
 * postMessage <-> Firestore para persistir el estado visual del clasificador.
 *
 * Por ahora el HMI es standalone (no dispara postMessages aún). Este wrapper
 * está preparado para la iter siguiente cuando se agregue el bridge al HTML.
 *
 * Patrón idéntico a HmiKnuroPage pero sin presets (el Grader no los usa).
 */
export function HmiGraderPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeReadyRef = useRef(false)
  const user = useAuthStore(state => state.user)

  const [graderState, setGraderState] = useState<GraderState | null>(null)
  const [savingState, setSavingState] = useState(false)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'hmi-grader-embed.html?v=' + v
  }, [])

  // ── Carga inicial desde Firestore → iframe ──────────────────────────────
  const sendInitData = useCallback(async (iframe: HTMLIFrameElement) => {
    try {
      const state = await getGraderState()
      setGraderState(state)
      iframe.contentWindow?.postMessage(
        { type: 'hmi:init', state },
        '*',
      )
    } catch (err) {
      logger.error('HMI Grader: Error cargando Firestore', err instanceof Error ? err : new Error(String(err)))
    }
  }, [])

  // ── Reintento si user llega después de iframe ready ────────────────────
  useEffect(() => {
    if (user && iframeReadyRef.current && iframeRef.current) {
      sendInitData(iframeRef.current)
    }
  }, [user, sendInitData])

  // ── Puente postMessage ──────────────────────────────────────────────────
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (!event.data || typeof event.data.type !== 'string') return
      if (!event.data.type.startsWith('hmi:')) return
      const { type } = event.data

      if (type === 'hmi:ready') {
        iframeReadyRef.current = true
        if (iframeRef.current) await sendInitData(iframeRef.current)
        return
      }

      // Guardar estado (disparado cuando el HMI cambia indicadores o log)
      if (type === 'hmi:save-state' && event.data.state) {
        try {
          await saveGraderState(event.data.state, user?.id)
          setGraderState(event.data.state)
        } catch (err) {
          logger.error('HMI Grader: Error guardando estado', err instanceof Error ? err : new Error(String(err)))
        }
        return
      }

      // Log de eventos (futuro: persistir pocket clicks, fkey press, etc)
      if (type === 'hmi:log-event' && user) {
        try {
          await addGraderHistory({
            action: event.data.action ?? 'state-save',
            detail: event.data.detail ?? '',
            userId: user.id,
            userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
          })
        } catch (err) {
          logger.warn('HMI Grader: Error guardando historial')
        }
        return
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [user, sendInitData])

  const refreshIframe = useCallback(() => {
    if (!iframeRef.current) return
    iframeRef.current.src = ''
    setTimeout(() => {
      if (iframeRef.current) iframeRef.current.src = iframeSrc
    }, 50)
  }, [iframeSrc])

  const handleResetState = useCallback(async () => {
    if (!confirm('¿Restaurar el HMI Grader a estado inicial (0.00 kg en los 4 indicadores, log vacío)?')) return
    try {
      await resetGraderState(user?.id)
      refreshIframe()
    } catch (err) {
      logger.error('HMI Grader: Error reseteando estado', err instanceof Error ? err : new Error(String(err)))
      alert('Error al restaurar estado')
    }
  }, [user, refreshIframe])

  const handleSaveState = useCallback(async () => {
    if (!graderState) {
      alert('Todavía no hay estado que guardar. El HMI debe dispararlo vía postMessage (próxima iter).')
      return
    }
    setSavingState(true)
    try {
      await saveGraderState(graderState, user?.id)
      alert('✓ Estado guardado')
    } catch (err) {
      logger.error('HMI Grader: Error guardando', err instanceof Error ? err : new Error(String(err)))
      alert('Error al guardar estado')
    } finally {
      setSavingState(false)
    }
  }, [graderState, user])

  return (
    <div className="flex flex-col h-full w-full relative">

      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Scale className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold truncate">HMI Grader</span>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Simulador StaticGrader — Marelec Z2
          </span>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveState}
            disabled={savingState}
            className="h-7 gap-1 text-xs"
            title="Guardar estado actual en Firestore"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Guardar</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={refreshIframe}
            className="h-7 gap-1 text-xs"
            title="Recargar simulador"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Recargar</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetState}
            className="h-7 gap-1 text-xs"
            title="Restaurar a estado inicial"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Restaurar</span>
          </Button>
        </div>
      </div>

      {/* ── iframe ─────────────────────────────────────────────────────
          min-height: 880px porque el HMI + teclados necesitan ~854px y no
          queremos depender solo del flex-1 del MainLayout (que puede colapsar
          si el layout padre no tiene altura fija) */}
      <div
        className="flex-1 min-h-0 relative overflow-auto bg-[#2C3E50]"
        style={{ minHeight: 880 }}
      >
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="HMI Grader Simulator"
          className="w-full border-0 block"
          style={{ height: '100%', minHeight: 880 }}
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
        />
      </div>
    </div>
  )
}
