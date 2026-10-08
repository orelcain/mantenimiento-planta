import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, RefreshCw, X, ChevronDown, ChevronUp, Sliders, RotateCcw, Copy, Pencil, Check, ArrowUp, ArrowDown, BookmarkCheck, QrCode, Minimize, ArrowLeft } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import {
  getHmiPresets,
  saveHmiPreset,
  deleteHmiPreset,
  getCurrentPreset,
  setCurrentPreset,
  getHmiRefs,
  saveHmiRefs,
  saveHmiTooltips,
  getHmiTooltips,
  addHmiHistory,
  getHmiHistory,
  seedDefaultPresets,
  getPresetOrder,
  savePresetOrder,
  saveDefaultSnapshot,
} from '@/services/hmiKnuro'
import type { HmiHistoryEntry } from '@/services/hmiKnuro'
import { useHmiKnuroMovil } from '@/components/hmiKnuro/hmiKnuroMovil'
import { AvisoGirarTelefono } from '@/components/hmiKnuro/AvisoGirarTelefono'
import { KnuroPresetPicker } from '@/components/hmiKnuro/KnuroPresetPicker'
import { frasePreset, partirPreset } from '@/components/hmiKnuro/knuroPresets'
import '@/components/hmiKnuro/knuroConsola.css'

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
 *
 * Celular (useHmiKnuroMovil, igual que la página pública): en horizontal el simulador pasa a
 * `fixed inset-0` por encima de la barra inferior de la app, sin la barra admin, y el iframe
 * recibe `hmi:land` (riel Buscar/Lista/«?»/Salir). Las acciones admin (presets, Historial…)
 * quedan fuera de ese modo: «Salir» las devuelve. En vertical, aviso «Gira el teléfono».
 *
 * Marco «Consola» (knuroConsola.css), igual que la página pública: estilo FIJO, no sigue el tema.
 * Cabecera: Simulador (volver) · presets en segmentados Planta/Máquina · menú «Presets» (orden,
 * renombrar, clonar, QR, restaurar/guardar defaults) · Historial · Recargar. Lo que vive DENTRO del
 * iframe (guardar valores como preset, comparar, exportar PDF, editar refs) sigue en el panel
 * «Pantallas» del simulador, sección «Edición de presets» (solo fuera de modo lectura).
 */
/** «Planta Principal - BAA142 - N1» → «Principal · N°1» (el nombre completo queda en el title). */
function etiquetaCorta(name: string): string {
  const p = partirPreset(name)
  return p ? `${p.planta} · N°${p.maquina}` : name
}

export function HmiKnuroPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const presetsDropdownRef = useRef<HTMLDivElement>(null)
  /** Flag: el iframe ya envió hmi:ready pero user no estaba disponible aún */
  const iframeReadyRef = useRef(false)
  const user = useAuthStore(state => state.user)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const { compact, immersive, isFullscreen, visualFs, enterFullscreen, exitImmersive, mostrarAviso, ocultarAviso } =
    useHmiKnuroMovil(containerRef, iframeRef)

  // ── Estado presets ──────────────────────────────────────────────────────
  const [presets, setPresets] = useState<Record<string, Record<string, string>>>({})
  const [currentPresetName, setCurrentPresetName] = useState<string | null>(null)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [presetOrder, setPresetOrder] = useState<string[]>([])
  const [editingPreset, setEditingPreset] = useState<{ name: string; value: string } | null>(null)

  // ── Estado QR ───────────────────────────────────────────────────────────
  const [qrPreset, setQrPreset] = useState<string | null>(null)
  const [qrCopied, setQrCopied] = useState(false)

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
      let [presetsData, current, refs, order, tooltips] = await Promise.all([
        getHmiPresets(),
        getCurrentPreset(),
        getHmiRefs(),
        getPresetOrder(),
        getHmiTooltips(),
      ])
      // Si Firestore está vacío, sembrar los 6 presets por defecto automáticamente
      if (Object.keys(presetsData).length === 0) {
        const uid = user?.id ?? useAuthStore.getState().user?.id
        if (uid) {
          try {
            await seedDefaultPresets(uid)
            ;[presetsData, current] = await Promise.all([getHmiPresets(), getCurrentPreset()])
            logger.info('HMI: Presets sembrados')
          } catch (seedErr) {
            logger.error('HMI: Error sembrando presets (reglas Firestore?)', seedErr instanceof Error ? seedErr : new Error(String(seedErr)))
          }
        }
      }
      setPresets(presetsData)
      setCurrentPresetName(current)
      setPresetOrder(order)
      // La clave de edición ya NO viaja al iframe: esta página está tras AdminRoute y
      // Firestore exige isAdmin para escribir hmi-knuro-tooltips, así que la
      // edición de globos se concede con canEdit (ver hmi-knuro-embed.html).
      iframe.contentWindow?.postMessage(
        { type: 'hmi:init', presets: presetsData, current, refs, order, tooltips, canEdit: true },
        window.location.origin,
      )
    } catch (err) {
      logger.error('HMI: Error cargando Firestore', err instanceof Error ? err : new Error(String(err)))
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
      // Mismo patrón que PlanosAguasPage.tsx: solo aceptar mensajes del propio
      // iframe same-origin (defensa contra postMessage de un opener ajeno).
      if (event.origin !== window.location.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data.type !== 'string') return
      if (!event.data.type.startsWith('hmi:')) return
      const { type } = event.data

      // hmi:ready: guardar flag. Solo llamar sendInitData si user ya está disponible.
      // Si user aún es null (auth restaurando sesión), el useEffect de reintento lo maniza.
      // Auto-sync: si el iframe envía tooltips locales, guardarlos a Firestore en background.
      if (type === 'hmi:ready') {
        iframeReadyRef.current = true
        if (event.data.tooltips && Object.keys(event.data.tooltips).length > 0) {
          saveHmiTooltips(event.data.tooltips).catch(_err =>
            logger.warn('HMI: Auto-sync tooltips falló')
          )
        }
        if (user && iframeRef.current) await sendInitData(iframeRef.current)
        return
      }

      // Guardar tooltips y clave: NO requieren user autenticado
      // (los tooltips son globales, compartidos por todos)
      if (type === 'hmi:save-tooltip') {
        if (event.data.tooltips) {
          await saveHmiTooltips(event.data.tooltips).catch(err =>
            logger.error('HMI: Error guardando tooltips en Firestore', err instanceof Error ? err : new Error(String(err)))
          )
        }
        return
      }

      // 'hmi:save-pwd' ya no existe: el iframe no maneja la clave (se cambia en Ajustes).

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
        case 'hmi:reorder-preset': {
          const { order: newOrder } = event.data
          if (Array.isArray(newOrder)) {
            setPresetOrder(newOrder)
            await savePresetOrder(newOrder)
          }
          break
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [user, sendInitData])

  // ── Cargar preset desde la toolbar React (útil en mobile) ──────────────
  const loadPresetFromReact = useCallback((name: string) => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:load-preset', name }, window.location.origin)
    setCurrentPresetName(name)
    setPresetsOpen(false)
  }, [])

  // Volver al simulador público, en el preset que se está editando
  const volverAlSimulador = () => {
    navigate(currentPresetName ? `/aprendizaje/hmi-knuro/${encodeURIComponent(currentPresetName)}` : '/aprendizaje/hmi-knuro')
  }

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
    const cloneOrder = [...presetOrder, trimmed]
    setPresetOrder(cloneOrder)
    await savePresetOrder(cloneOrder)
    // Cargar el clon en el iframe
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'hmi:init', presets: updatedPresets, current: trimmed, refs: {}, order: cloneOrder },
      window.location.origin
    )
    await setCurrentPreset(trimmed)
    setCurrentPresetName(trimmed)
    setPresetsOpen(false)
  }, [user, presets, presetOrder])

  const resetToDefaults = useCallback(async () => {
    if (!user) return
    if (!confirm('¿Restaurar los 6 presets a los valores por defecto? Se perderán cambios personalizados.')) return
    await seedDefaultPresets(user.id)
    const [presetsData, current, refs] = await Promise.all([getHmiPresets(), getCurrentPreset(), getHmiRefs()])
    setPresets(presetsData)
    setCurrentPresetName(current)
    iframeRef.current?.contentWindow?.postMessage({ type: 'hmi:init', presets: presetsData, current, refs, order: presetOrder }, window.location.origin)
  }, [user, presetOrder])

  const saveAsDefaults = useCallback(async () => {
    if (!user) return
    if (!confirm('¿Guardar los presets actuales como nuevos defaults?\n"Restaurar" usará estos valores en el futuro.')) return
    await saveDefaultSnapshot(user.id)
    alert('✓ Presets actuales guardados como defaults.')
  }, [user])

  // Orden: los que están en presetOrder primero, luego los que falten al final
  const presetKeys = useMemo(() => {
    const all = Object.keys(presets)
    const ordered = presetOrder.filter(n => all.includes(n))
    const rest = all.filter(n => !presetOrder.includes(n))
    return [...ordered, ...rest]
  }, [presets, presetOrder])

  const movePreset = useCallback(async (name: string, dir: 'up' | 'down') => {
    const keys = [...presetKeys]
    const idx = keys.indexOf(name)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === keys.length - 1) return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    const tmp = keys[idx] as string; keys[idx] = keys[swap] as string; keys[swap] = tmp
    setPresetOrder(keys)
    await savePresetOrder(keys)
  }, [presetKeys])

  const confirmRename = useCallback(async () => {
    if (!user || !editingPreset) return
    const { name: oldName, value: newName } = editingPreset
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) { setEditingPreset(null); return }
    if (presets[trimmed]) { alert(`Ya existe un preset con el nombre "${trimmed}"`); return }
    const data = { ...presets[oldName] }
    await saveHmiPreset(trimmed, data, user.id)
    await deleteHmiPreset(oldName)
    const newOrder = presetKeys.map(n => n === oldName ? trimmed : n)
    setPresetOrder(newOrder)
    await savePresetOrder(newOrder)
    const updatedPresets = { ...presets, [trimmed]: data }
    delete updatedPresets[oldName]
    setPresets(updatedPresets)
    if (currentPresetName === oldName) {
      await setCurrentPreset(trimmed)
      setCurrentPresetName(trimmed)
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'hmi:init', presets: updatedPresets, current: trimmed, refs: {}, order: newOrder }, window.location.origin
      )
    }
    setEditingPreset(null)
  }, [user, editingPreset, presets, presetKeys, currentPresetName])

  // Menú «Presets»: orden, renombrar, clonar, QR, restaurar y guardar defaults (antes la barra
  // admin y el desplegable). La elección del preset activo va en los segmentados.
  const presetMenu = (
    <div className="knc-popw" ref={presetsDropdownRef}>
      <button
        type="button"
        className="knc-ib knc-pc"
        aria-haspopup="menu"
        aria-expanded={presetsOpen}
        onClick={() => setPresetsOpen(p => !p)}
        title="Gestionar presets"
      >
        <Sliders aria-hidden="true" /><span className="knc-t2">Presets</span><ChevronDown aria-hidden="true" />
      </button>
      <button type="button" className="knc-ib m sq knc-m" aria-haspopup="menu" aria-expanded={presetsOpen} onClick={() => setPresetsOpen(p => !p)} aria-label="Gestionar presets">
        <Sliders aria-hidden="true" />
      </button>
      {presetsOpen && (
        <div className="knc-pop r" role="menu" style={{ width: 340 }}>
          <div className="knc-pop-h">Presets · orden, nombre, copia y QR</div>
          {presetKeys.length === 0 && <div className="knc-pop-h" style={{ textTransform: 'none' }}>Cargando presets…</div>}
          {presetKeys.map((name, idx) => {
            const isEditing = editingPreset?.name === name
            const on = name === currentPresetName
            return (
              <div key={name} className={cn('knc-pop-row', on && 'on')}>
                {isEditing ? (
                  <>
                    <input
                      autoFocus
                      value={editingPreset.value}
                      onChange={e => setEditingPreset({ name, value: e.target.value })}
                      onKeyDown={e => {
                        if (e.key === 'Enter') confirmRename()
                        if (e.key === 'Escape') { e.stopPropagation(); setEditingPreset(null) }
                      }}
                      className="knc-input"
                      aria-label={`Nuevo nombre para ${name}`}
                    />
                    <button type="button" className="knc-tool" onClick={confirmRename} title="Confirmar" aria-label="Confirmar"><Check /></button>
                    <button type="button" className="knc-tool" onClick={() => setEditingPreset(null)} title="Cancelar" aria-label="Cancelar"><X /></button>
                  </>
                ) : (
                  <>
                    <button type="button" className="knc-tool" onClick={() => movePreset(name, 'up')} disabled={idx === 0} title="Mover arriba" aria-label={`Mover ${name} arriba`}><ArrowUp /></button>
                    <button type="button" className="knc-tool" onClick={() => movePreset(name, 'down')} disabled={idx === presetKeys.length - 1} title="Mover abajo" aria-label={`Mover ${name} abajo`}><ArrowDown /></button>
                    <button type="button" role="menuitemradio" aria-checked={on} className="knc-pop-i" style={{ flex: 1, minWidth: 0 }} onClick={() => loadPresetFromReact(name)}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{etiquetaCorta(name)}</span>
                    </button>
                    <button type="button" className="knc-tool" onClick={() => setEditingPreset({ name, value: name })} title="Renombrar" aria-label={`Renombrar ${name}`}><Pencil /></button>
                    <button type="button" className="knc-tool" onClick={() => clonePreset(name)} title={`Clonar «${name}»`} aria-label={`Clonar ${name}`}><Copy /></button>
                    <button type="button" className="knc-tool" onClick={() => { setPresetsOpen(false); setQrPreset(name) }} title={`Compartir «${name}» (QR)`} aria-label={`QR de ${name}`}><QrCode /></button>
                  </>
                )}
              </div>
            )
          })}
          <div className="knc-pop-h">Valores por defecto</div>
          <button type="button" className="knc-pop-i" onClick={() => { setPresetsOpen(false); resetToDefaults() }}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />Restaurar los presets por defecto
          </button>
          <button type="button" className="knc-pop-i" onClick={() => { setPresetsOpen(false); saveAsDefaults() }}>
            <BookmarkCheck className="h-4 w-4" aria-hidden="true" />Guardar los actuales como defaults
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div
      ref={containerRef}
      className={immersive ? 'knc fixed inset-0 z-[70] flex flex-col' : 'knc flex flex-col h-full w-full relative'}
      style={immersive
        ? { height: '100dvh', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }
        : undefined}
    >

      {/* ── Cabecera «Consola» (fuera en pantalla completa / celular horizontal) ─── */}
      {!immersive && (
        <header className="knc-hdr">
          <button type="button" onClick={volverAlSimulador} className="knc-ib knc-pc" aria-label="Volver al simulador" title="Volver al simulador">
            <ArrowLeft aria-hidden="true" /><span className="knc-t2">Simulador</span>
          </button>
          <button type="button" onClick={volverAlSimulador} className="knc-ib m sq bare knc-m" aria-label="Volver al simulador">
            <ArrowLeft aria-hidden="true" />
          </button>
          <div className="knc-ttl">
            <b>HMI Knuro</b>
            <span className="knc-lab">Editor de presets y ayudas</span>
          </div>
          <span className="knc-div knc-pc" aria-hidden="true" />
          <div className="knc-pc" style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            <KnuroPresetPicker names={presetKeys} selected={currentPresetName} onSelect={loadPresetFromReact} variant="pc" />
          </div>
          <span className="knc-sp" />
          {presetMenu}
          <button type="button" className="knc-ib knc-pc" aria-pressed={historyOpen} onClick={historyOpen ? () => setHistoryOpen(false) : openHistory} title="Historial de cambios">
            <History aria-hidden="true" /><span className="knc-t1">Historial</span>
          </button>
          <button type="button" className="knc-ib m sq knc-m" aria-pressed={historyOpen} onClick={historyOpen ? () => setHistoryOpen(false) : openHistory} aria-label="Historial de cambios">
            <History aria-hidden="true" />
          </button>
          <button type="button" className="knc-ib knc-pc" onClick={refreshIframe} title="Recargar el simulador">
            <RefreshCw aria-hidden="true" /><span className="knc-t1">Recargar</span>
          </button>
          <button type="button" className="knc-ib m sq knc-m" onClick={refreshIframe} aria-label="Recargar el simulador">
            <RefreshCw aria-hidden="true" />
          </button>
        </header>
      )}

      {/* ── Celular: presets en fila propia ─────────────────────────── */}
      {!immersive && (
        <div className="knc-m">
          <KnuroPresetPicker names={presetKeys} selected={currentPresetName} onSelect={loadPresetFromReact} variant="m" />
        </div>
      )}

      {/* ── Celular vertical: aviso para girar ───────────────────────── */}
      {mostrarAviso && <AvisoGirarTelefono onPantallaCompleta={enterFullscreen} onCerrar={ocultarAviso} />}

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

      {/* Salir de pantalla completa fuera del modo horizontal (en horizontal se sale desde el riel del HMI) */}
      {(isFullscreen || visualFs) && !compact && (
        <button type="button" onClick={exitImmersive} aria-label="Salir de pantalla completa" className="knc-fsx">
          <Minimize className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {/* ── QR ───────────────────────────────────────────────────────── */}
      {qrPreset && (() => {
        const base = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
        const learnUrl = `${base}/aprendizaje/hmi-knuro/${encodeURIComponent(qrPreset)}`
        const partes = partirPreset(qrPreset)
        return (
          <div className="knc-scrim" onClick={() => setQrPreset(null)}>
            <div className="knc-dlg" role="dialog" aria-modal="true" aria-label="Compartir preset" onClick={e => e.stopPropagation()}>
              <div className="knc-dlg-h">
                <span>Compartir preset</span>
                <button type="button" className="knc-ib sq bare" onClick={() => setQrPreset(null)} aria-label="Cerrar"><X aria-hidden="true" /></button>
              </div>
              <p>{partes ? frasePreset(partes) : qrPreset}</p>
              <div className="knc-qr">
                <QRCodeSVG value={learnUrl} size={180} level="M" includeMargin={false} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input readOnly value={learnUrl} className="knc-input knc-mono" style={{ fontSize: 11 }} aria-label="Enlace" />
                <button
                  type="button"
                  className="knc-ib"
                  onClick={() => {
                    navigator.clipboard.writeText(learnUrl).then(() => {
                      setQrCopied(true)
                      setTimeout(() => setQrCopied(false), 2000)
                    })
                  }}
                >
                  {qrCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {qrCopied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <p>Abre el simulador en modo lectura. No requiere sesión.</p>
            </div>
          </div>
        )
      })()}

      {/* ── Panel historial (drawer lateral) ────────────────────────── */}
      {historyOpen && (
        <div
          className="knc-drawer absolute inset-y-0 right-0 flex flex-col z-50"
          style={{ width: 'min(320px, 90vw)' }}
        >
          <div className="flex items-center justify-between px-3 py-2 knc-drawer-h flex-shrink-0">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <History className="h-4 w-4" aria-hidden="true" />
              Historial de cambios
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="knc-ib sq bare"
                onClick={() => setHistoryExpanded(p => !p)}
                title={historyExpanded ? 'Ocultar cambios' : 'Ver cambios'}
                aria-label={historyExpanded ? 'Ocultar cambios' : 'Ver cambios'}
              >
                {historyExpanded
                  ? <ChevronDown className="h-3.5 w-3.5" />
                  : <ChevronUp className="h-3.5 w-3.5" />
                }
              </button>
              <button type="button" className="knc-ib sq bare" onClick={() => setHistoryOpen(false)} aria-label="Cerrar historial">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loadingHistory && (
              <div className="text-xs knc-ink2 text-center py-8">Cargando historial…</div>
            )}
            {!loadingHistory && history.length === 0 && (
              <div className="text-xs knc-ink2 text-center py-8">Sin cambios registrados</div>
            )}
            {history.map((entry, i) => {
              const diffs = entry.data && entry.previousData
                ? Object.entries(entry.data).filter(([k, v]) => entry.previousData?.[k] !== v)
                : []
              return (
                <div
                  key={entry.id ?? i}
                  className="text-xs knc-drawer-i p-2 space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('font-semibold truncate', entry.action === 'delete' ? 'knc-bad' : 'knc-ok')}>
                      {entry.action === 'save' ? 'Guardado' : 'Borrado'} · {entry.presetName}
                    </span>
                    <span className="text-[11px] knc-ink2 flex-shrink-0">
                      {entry.timestamp.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <div className="knc-ink2 truncate">{entry.userName}</div>
                  {historyExpanded && diffs.length > 0 && (
                    <div className="mt-1 pt-1 knc-drawer-sep space-y-0.5">
                      {diffs.slice(0, 5).map(([k, v]) => (
                        <div key={k} className="flex gap-1 font-mono text-[11px]">
                          <span className="knc-ink2 truncate max-w-[80px]">{k}</span>
                          <span className="knc-bad line-through">{entry.previousData?.[k]}</span>
                          <span className="knc-ok">{v}</span>
                        </div>
                      ))}
                      {diffs.length > 5 && (
                        <div className="knc-ink2 text-[11px]">+{diffs.length - 5} más…</div>
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
