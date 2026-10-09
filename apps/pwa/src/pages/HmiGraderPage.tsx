import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BookOpen, RefreshCw, RotateCcw, Save, Pencil } from 'lucide-react'
import { useAuthStore, useIsAdmin } from '@/store'
import { GRADER_HMI_TARGETS } from '@/services/grader/graderHmiPractice'
import { logger } from '@/lib/logger'
import {
  getGraderState,
  saveGraderState,
  resetGraderState,
  addGraderHistory,
  type GraderState,
} from '@/services/hmiGrader'
import { EncabezadoHerramienta } from '@/components/piel'
import { useTemaEmbed } from '@/hooks/useTemaEmbed'

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
 *
 * Dos rutas, un componente:
 * - /aprendizaje/hmi-grader (pública, única entrada para todos): práctica de solo lectura. Lee el
 *   estado guardado pero NO escribe nada en Firestore (ni el auto-guardado del iframe, ni historial).
 *   Al admin le muestra «Editar estado» → /hmi-grader.
 * - /hmi-grader (AdminRoute, sin ítem de menú): modo edición; Guardar / Restaurar y persistencia.
 *   firestore.rules: escritura de hmi-grader-config / -history solo admin.
 */
export function HmiGraderPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const enviarTema = useTemaEmbed(iframeRef)
  const iframeReadyRef = useRef(false)
  const user = useAuthStore(state => state.user)
  const isAdmin = useIsAdmin()
  const location = useLocation()
  // Modo edición: solo en /hmi-grader y solo admin (la ruta ya es AdminRoute; se repite por defensa).
  const modoEdicion = isAdmin && location.pathname.replace(/\/+$/, '') === '/hmi-grader'

  // Modo práctica: ?practica=<runbookId> → al cargar, el simulador navega solo
  // hasta la pantalla del procedimiento (ver graderHmiPractice.ts).
  const practiceTarget = useMemo(() => {
    const id = searchParams.get('practica')
    return id ? GRADER_HMI_TARGETS[id] ?? null : null
  }, [searchParams])

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
      // Mismo patrón que PlanosAguasPage.tsx: solo aceptar mensajes del propio
      // iframe same-origin (defensa contra postMessage de un opener ajeno).
      if (event.origin !== window.location.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data.type !== 'string') return
      if (!event.data.type.startsWith('hmi:')) return
      const { type } = event.data

      if (type === 'hmi:ready') {
        iframeReadyRef.current = true
        if (iframeRef.current) {
          await sendInitData(iframeRef.current)
          if (practiceTarget) {
            iframeRef.current.contentWindow?.postMessage(
              { type: 'hmi:goto', target: practiceTarget },
              '*',
            )
          }
        }
        return
      }

      // Guardar estado (disparado cuando el HMI cambia indicadores o log)
      if (type === 'hmi:save-state' && event.data.state) {
        if (!modoEdicion) return // práctica: lo que se toca no pisa el estado compartido
        try {
          await saveGraderState(event.data.state, user?.id)
          setGraderState(event.data.state)
        } catch (err) {
          logger.error('HMI Grader: Error guardando estado', err instanceof Error ? err : new Error(String(err)))
        }
        return
      }

      // Log de eventos (futuro: persistir pocket clicks, fkey press, etc)
      if (type === 'hmi:log-event' && user && modoEdicion) {
        try {
          await addGraderHistory({
            action: event.data.action ?? 'state-save',
            detail: event.data.detail ?? '',
            userId: user.id,
            userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
          })
        } catch {
          logger.warn('HMI Grader: Error guardando historial')
        }
        return
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [user, sendInitData, practiceTarget, modoEdicion])

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

      {/* ── Encabezado único del marco de herramientas ──────────────────
          Volver usa useVolver (history.state.idx): antes `history.length > 1` podía sacar al
          usuario de la app al entrar por un enlace con historial previo. Todo lo que eran
          botones sueltos (Expediente, Editar estado, Recargar, Guardar, Restaurar) va en «Más». */}
      <EncabezadoHerramienta
        etiquetaVolver={modoEdicion ? 'Simulador' : 'Aprendizaje'}
        volverA={modoEdicion ? '/aprendizaje/hmi-grader' : '/aprendizaje'}
        titulo="HMI Grader"
        subtitulo={modoEdicion ? 'Edición del estado · StaticGrader Marelec Z2' : 'Simulador StaticGrader · Marelec Z2'}
        contextoAria="Estoy en el simulador HMI Grader (StaticGrader Marelec Z2). "
        itemsMas={[
          { key: 'exp', label: 'Expediente del Grader', subtitle: 'Manual, procedimientos y diagnóstico', icon: <BookOpen aria-hidden="true" />, onClick: () => navigate('/aprendizaje/maquina/grader') },
          ...(isAdmin && !modoEdicion ? [{ key: 'edit', label: 'Editar estado', icon: <Pencil aria-hidden="true" />, onClick: () => navigate('/hmi-grader') }] : []),
          { key: 'reload', label: 'Recargar simulador', icon: <RefreshCw aria-hidden="true" />, onClick: refreshIframe },
          ...(modoEdicion ? [
            { key: 'save', label: 'Guardar estado', subtitle: 'Escribe el estado actual en Firestore', icon: <Save aria-hidden="true" />, onClick: handleSaveState, disabled: savingState },
            { key: 'reset', label: 'Restaurar estado inicial', icon: <RotateCcw aria-hidden="true" />, onClick: handleResetState },
          ] : []),
        ]}
      />

      {/* ── iframe ─────────────────────────────────────────────────────
          El HMI + teclados necesitan ~854 px. Ese mínimo vive SOLO en el iframe: el contenedor
          es `flex-1 min-h-0 overflow-auto`, así que toma el alto que deja el encabezado y se
          desplaza. Con el mínimo en el contenedor (antes) la página medía 880 + encabezado, el
          ancestro `overflow-hidden` del modo lienzo la recortaba y lo de abajo no se alcanzaba. */}
      <div className="flex-1 min-h-0 relative overflow-auto bg-background">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="HMI Grader Simulator"
          className="w-full border-0 block"
          style={{ height: '100%', minHeight: 880 }}
          allow="fullscreen"
          onLoad={enviarTema}
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals"
        />
      </div>
    </div>
  )
}
