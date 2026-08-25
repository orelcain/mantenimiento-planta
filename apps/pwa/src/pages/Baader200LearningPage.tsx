import { useEffect, useRef, useMemo, useState, useCallback } from 'react'
import { History, BookOpen, RefreshCw, X, ChevronDown, ChevronUp, QrCode, Copy, Check, Trash2, Sparkles, Save } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'
import { storage } from '@/services/firebase'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import {
  getB200Sections,
  saveB200Section,
  deleteB200Section,
  getB200SectionOrder,
  addB200History,
  getB200History,
  seedB200Sections,
  getB200EditPwd,
} from '@/services/baader200Learning'
import type { B200Section, B200HistoryEntry } from '@/services/baader200Learning'
import { Button } from '@/components/ui'

export function Baader200LearningPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const iframeReadyRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore(state => state.user)

  const [sections, setSections] = useState<B200Section[]>([])
  const [, setSectionOrder] = useState<string[]>([])
  const [currentSectionId, setCurrentSectionId] = useState<string | null>(null)
  // Si la carga falla, el iframe se queda en "Selecciona una sección del menú"
  // sin que nadie sepa por qué: el error solo iba al logger. Pasó de verdad —
  // 9 de las 23 secciones tenían `updatedAt` como número y el parser reventaba.
  const [errorCarga, setErrorCarga] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [history, setHistory] = useState<B200HistoryEntry[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [qrSection, setQrSection] = useState<string | null>(null)
  const [qrCopied, setQrCopied] = useState(false)

  const iframeSrc = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    const v = import.meta.env.VITE_APP_VERSION || Date.now().toString().slice(0, 8)
    return basePath + 'baader-200-learn-embed.html?v=' + v
  }, [])

  const sendInitData = useCallback(async (iframe: HTMLIFrameElement) => {
    try {
      let [sectionsData, order] = await Promise.all([
        getB200Sections(),
        getB200SectionOrder(),
      ])
      if (sectionsData.length === 0 && user?.id) {
        await seedB200Sections(user.id)
        ;[sectionsData, order] = await Promise.all([getB200Sections(), getB200SectionOrder()])
      }
      setSections(sectionsData)
      setSectionOrder(order)
      iframe.contentWindow?.postMessage({
        type: 'b200:init',
        sections: sectionsData,
        currentId: sectionsData[0]?.id ?? null,
        order,
        readonly: false,
      }, '*')
      setErrorCarga(null)
    } catch (err) {
      logger.error('B200: Error cargando datos', err instanceof Error ? err : new Error(String(err)))
      setErrorCarga(err instanceof Error ? err.message : String(err))
    }
  }, [user])

  useEffect(() => {
    if (user && iframeReadyRef.current && iframeRef.current) {
      sendInitData(iframeRef.current)
    }
  }, [user, sendInitData])

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Mismo patrón que PlanosAguasPage.tsx: solo aceptar mensajes del propio
      // iframe same-origin — antes cualquier ventana con referencia a esta
      // pestaña (ej. si se abrió vía window.open desde otro sitio) podía
      // disparar b200:save-section/delete-section con la sesión del usuario.
      if (event.origin !== window.location.origin) return
      if (event.source !== iframeRef.current?.contentWindow) return
      if (!event.data || typeof event.data.type !== 'string') return
      if (!event.data.type.startsWith('b200:')) return
      const { type } = event.data

      if (type === 'b200:ready') {
        iframeReadyRef.current = true
        if (user && iframeRef.current) await sendInitData(iframeRef.current)
        return
      }

      if (type === 'b200:select') {
        if (typeof event.data.id === 'string') setCurrentSectionId(event.data.id)
        return
      }

      if (!user) return

      if (type === 'b200:save-section') {
        const { section } = event.data as { section: B200Section }
        if (!section?.id) return
        const isNew = !sections.find(s => s.id === section.id)
        await saveB200Section({ ...section, updatedBy: user.id }, user.id)
        setSections(prev => {
          const idx = prev.findIndex(s => s.id === section.id)
          if (idx >= 0) { const n = [...prev]; n[idx] = { ...section, updatedAt: new Date(), updatedBy: user.id }; return n }
          return [...prev, { ...section, updatedAt: new Date(), updatedBy: user.id }]
        })
        await addB200History({
          sectionId: section.id,
          sectionTitle: section.title,
          action: isNew ? 'create' : 'update',
          userId: user.id,
          userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
        })
        return
      }

      if (type === 'b200:delete-section') {
        const { id } = event.data as { id: string }
        if (!id) return
        const sec = sections.find(s => s.id === id)
        await deleteB200Section(id)
        setSections(prev => prev.filter(s => s.id !== id))
        if (sec) {
          await addB200History({
            sectionId: id,
            sectionTitle: sec.title,
            action: 'delete',
            userId: user.id,
            userName: ((user.nombre ?? '') + ' ' + (user.apellido ?? '')).trim() || user.email,
          })
        }
        return
      }

      if (type === 'b200:request-unlock') {
        const pwd = prompt('Ingrese clave de administrador:')
        if (!pwd) {
          iframeRef.current?.contentWindow?.postMessage({ type: 'b200:lock-fail', message: 'Operación cancelada' }, '*')
          return
        }
        try {
          const correctPwd = await getB200EditPwd()
          if (pwd === correctPwd) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'b200:unlock' }, '*')
          } else {
            iframeRef.current?.contentWindow?.postMessage({ type: 'b200:lock-fail', message: 'Clave incorrecta' }, '*')
          }
        } catch {
          iframeRef.current?.contentWindow?.postMessage({ type: 'b200:lock-fail', message: 'Error verificando clave' }, '*')
        }
        return
      }

      if (type === 'b200:request-upload') {
        fileInputRef.current?.click()
        return
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [user, sections, sendInitData])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0 || !iframeRef.current?.contentWindow) return
    const iframe = iframeRef.current.contentWindow

    for (let i = 0; i < files.length; i++) {
      const file = files[i]!
      const defaultName = file.name.replace(/\.[^.]+$/, '')
      const caption = prompt(`Nombre/descripción para la imagen${files.length > 1 ? ` (${i + 1} de ${files.length})` : ''}:`, defaultName)
      if (caption === null) continue // user cancelled

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `baader200-images/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const storageRef = ref(storage, path)
      const task = uploadBytesResumable(storageRef, file)

      await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
          (snap) => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
            iframe.postMessage({ type: 'b200:upload-progress', percent: pct, current: i + 1, total: files.length }, '*')
          },
          (err) => {
            iframe.postMessage({ type: 'b200:upload-error', error: err.message }, '*')
            reject(err)
          },
          async () => {
            const url = await getDownloadURL(task.snapshot.ref)
            iframe.postMessage({ type: 'b200:upload-result', url, caption: caption || defaultName }, '*')
            resolve()
          }
        )
      }).catch(() => {})
    }
    iframe.postMessage({ type: 'b200:upload-done' }, '*')
    e.target.value = ''
  }, [])

  const refreshIframe = () => {
    if (!iframeRef.current) return
    iframeRef.current.src = ''
    setTimeout(() => { if (iframeRef.current) iframeRef.current.src = iframeSrc }, 50)
  }

  const openHistory = async () => {
    setHistoryOpen(true)
    setLoadingHistory(true)
    try { setHistory(await getB200History(60)) }
    finally { setLoadingHistory(false) }
  }

  const currentSection = sections.find(s => s.id === currentSectionId)

  return (
    <div className="flex flex-col h-full w-full relative">
      {errorCarga && (
        <div className="px-3 py-2 text-xs text-ink-crit border-b border-border flex-shrink-0">
          No se pudieron cargar las secciones del manual, así que el visor quedó
          vacío. Detalle: {errorCarga}
        </div>
      )}
      <div className="flex items-center justify-between px-3 py-1.5 bg-card border-b border-border flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold truncate">Baader 200</span>
          <span className="text-xs text-muted-foreground hidden md:inline">
            Manual de Ajustes — {sections.length} secciones
          </span>
          {currentSection && (
            <span className="text-xs text-muted-foreground hidden lg:inline truncate max-w-[200px]">
              · {currentSection.title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setQrSection(currentSectionId || sections[0]?.id || null)}
            className="h-7 gap-1 text-xs"
            title="Compartir sección por QR"
          >
            <QrCode className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Compartir</span>
          </Button>
          <Button
            variant={historyOpen ? 'default' : 'ghost'}
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

      <div className="flex-1 min-h-0 relative overflow-hidden">
        <iframe
          ref={iframeRef}
          src={iframeSrc}
          title="Baader 200 — Manual de Ajustes"
          className="w-full h-full border-0"
          allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>

      {/* QR Dialog */}
      {qrSection && (() => {
        const base = window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
        const learnUrl = `${base}/baader-200/learn/${encodeURIComponent(qrSection)}`
        const title = sections.find(s => s.id === qrSection)?.title ?? qrSection
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setQrSection(null)}>
            <div className="bg-card border border-border rounded-card p-6 flex flex-col items-center gap-4 shadow-2xl max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-1.5">
                  <QrCode className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Compartir sección</span>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setQrSection(null)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">{title}</p>
              <div className="bg-white p-3 rounded-card">
                <QRCodeSVG value={learnUrl} size={180} level="M" includeMargin={false} />
              </div>
              <div className="flex items-center gap-2 w-full">
                <input readOnly value={learnUrl} className="flex-1 text-caption bg-muted border border-border rounded-ctl px-2 py-1.5 text-foreground outline-none min-w-0" />
                <Button size="sm" className="h-7 gap-1 text-xs flex-shrink-0"
                  onClick={() => { navigator.clipboard.writeText(learnUrl).then(() => { setQrCopied(true); setTimeout(() => setQrCopied(false), 2000) }) }}>
                  {qrCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {qrCopied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <p className="text-caption text-muted-foreground text-center leading-relaxed">
                Abre la sección en modo lectura.<br />No requiere login.
              </p>
            </div>
          </div>
        )
      })()}

      {/* Panel historial */}
      {historyOpen && (
        <div className="absolute inset-y-0 right-0 flex flex-col bg-card border-l border-border shadow-2xl z-50" style={{ width: 'min(320px, 90vw)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
            <span className="text-sm font-semibold flex items-center gap-1.5">
              <History className="h-4 w-4 text-primary" />
              Historial de cambios
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHistoryExpanded(p => !p)}>
                {historyExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setHistoryOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loadingHistory && <div className="text-xs text-muted-foreground text-center py-8">Cargando historial…</div>}
            {!loadingHistory && history.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Sin cambios registrados</div>}
            {history.map((entry, i) => (
              <div key={entry.id ?? i} className="text-xs rounded-card border border-border p-2 space-y-0.5 hover:bg-muted/40 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className={cn('font-semibold truncate', entry.action === 'delete' ? 'text-red-400' : entry.action === 'create' ? 'text-blue-400' : 'text-emerald-400')}>
                    {entry.action === 'delete' ? <Trash2 className="inline h-3 w-3" aria-label="Borrado" /> : entry.action === 'create' ? <Sparkles className="inline h-3 w-3" aria-label="Creado" /> : <Save className="inline h-3 w-3" aria-label="Guardado" />} {entry.sectionTitle}
                  </span>
                  <span className="text-caption text-muted-foreground flex-shrink-0">
                    {entry.timestamp.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <div className="text-muted-foreground truncate">{entry.userName}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
