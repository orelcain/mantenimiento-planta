/**
 * RepuestoDetailPanel — Panel lateral derecho de detalle del repuesto (Fase 3).
 *
 * Columna fija a la derecha del hub (NO modal flotante), fiel al mockup:
 * foto · nombre · SAP+copiar · EQUIPO/ÁREA/CATEGORÍA/FABRICANTE/UNIDAD ·
 * tarjeta de stock (Disponible/Mínimo/Máximo) · Bodega · Ubicación ·
 * última actualización (último movimiento) · Ver movimientos.
 */
import { useState, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import { X, Copy, Check, History, ImageOff, Loader2, ArrowDownCircle, ArrowUpCircle, Settings2, Pencil, Plus, FileText, Image as ImageIcon, BookOpen, Trash2, SquarePen, Star, ListPlus, ExternalLink, MapPin, Wrench } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { findMachineBySlug } from '@/data/learningMachines'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { InlineEditName } from '@/components/repuestos/InlineEditName'
import { useManualesDeEquipos } from '@/hooks/repuestos/useManualesDeEquipos'
import { CLASE_LABEL } from '@/types/repuestos'
import type { AreaRepuestoRow } from '@/hooks/repuestos/useAreaRepuestos'
import type { MovimientoBodega } from '@/hooks/repuestos/useBodega'

export interface UbicacionEstructurada { pasillo?: string; estante?: string; nivel?: string }

interface RepuestoDetailPanelProps {
  item: AreaRepuestoRow | null
  areaName: string
  onClose: () => void
  loadMovimientos: (bodegaDocId: string, max?: number) => Promise<MovimientoBodega[]>
  onSaveLocation: (codigoSAP: string, loc: UbicacionEstructurada) => Promise<void>
  /** Abrir el modal de solicitud prellenado con este repuesto (Fase 6). */
  onSolicitar?: (item: AreaRepuestoRow) => void
  /** Asignar un código SAP a una pieza de despiece (sin SAP → ordenable). */
  onAssignSap?: () => void
  /** Asignar/añadir un equipo donde se usa el material (N:M). */
  onAssignEquipo?: () => void
  // ── Acciones por repuesto (Wave 1: rescate de "Por equipo") ──
  /** ¿el usuario es admin? Habilita editar/renombrar/reubicar/eliminar. */
  isAdmin?: boolean
  /** Renombrar (textoBreve) inline desde el título. Solo admin. */
  onRename?: (newName: string) => Promise<void>
  /** Editar repuesto (form completo). Solo admin. */
  onEditRepuesto?: () => void
  /** Eliminar (soft delete → papelera). Solo admin. */
  onDeleteRepuesto?: () => void
  /** Ver/editar ficha técnica. */
  onSpecs?: () => void
  /** Ver fotos (reales + de manual + galería heredada). Unifica el antiguo botón "Galería". */
  onPhotos?: () => void
  /** Ver vínculos al manual. */
  onManual?: () => void
  /** ¿el repuesto está en favoritos? */
  isFavorite?: boolean
  /** Alternar favorito. */
  onToggleFavorite?: () => void
  /** Abrir el gestor de listas con nombre para este repuesto. */
  onAddToList?: () => void
  /**
   * Guardar nombres comunes (apodos). Solo admin. En desktop también se editan
   * en la columna "Apodos" de la tabla (lg+); este campo es el ÚNICO camino en móvil.
   */
  onSaveApodos?: (apodos: string[]) => Promise<void>
  // ── Repuesto común / más usado de una máquina (lista compartida de planta) ──
  /** Slugs de máquina para las que este repuesto está marcado como común. */
  comunEn?: string[]
  /** Abrir el selector de máquina para marcarlo como común. Solo admin. */
  onMarkComun?: () => void
  /** Quitar la marca "común" de una máquina. Solo admin. */
  onRemoveComun?: (slug: string) => void
}

/** Botón de acción compacto del panel (icono + etiqueta). */
function ActionBtn({ icon: Icon, label, onClick, danger }: { icon: typeof FileText; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex flex-col items-center gap-1 rounded-lg border border-border bg-card px-2 py-2 text-[10px] font-medium transition',
        danger ? 'text-red-500 hover:bg-red-500/10 hover:border-red-500/40' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )
}

/** Texto de ubicación: estructurada (Pasillo/Estante/Nivel) o el string libre legacy. */
function formatUbicacion(item: AreaRepuestoRow): string {
  const parts: string[] = []
  if (item.pasillo) parts.push(`Pasillo ${item.pasillo}`)
  if (item.estante) parts.push(`Estante ${item.estante}`)
  if (item.nivel) parts.push(`Nivel ${item.nivel}`)
  if (parts.length) return parts.join(' / ')
  return item.ubicacionBodega || '—'
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-[13px] font-medium text-foreground">{value || '-'}</span>
    </div>
  )
}

const MOV_META: Record<MovimientoBodega['tipo'], { icon: typeof ArrowDownCircle; cls: string; label: string }> = {
  entrada: { icon: ArrowDownCircle, cls: 'text-emerald-500', label: 'Entrada' },
  salida: { icon: ArrowUpCircle, cls: 'text-red-500', label: 'Salida' },
  ajuste: { icon: Settings2, cls: 'text-amber-500', label: 'Ajuste' },
}

function fmtDate(d: Date): string {
  try {
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export function RepuestoDetailPanel({ item, areaName, onClose, loadMovimientos, onSaveLocation, onSolicitar, onAssignSap, onAssignEquipo, isAdmin, onRename, onEditRepuesto, onDeleteRepuesto, onSpecs, onPhotos, onManual, isFavorite, onToggleFavorite, onAddToList, onSaveApodos, comunEn, onMarkComun, onRemoveComun }: RepuestoDetailPanelProps) {
  const [copied, setCopied] = useState(false)
  const [movs, setMovs] = useState<MovimientoBodega[] | null>(null)
  const [movsLoading, setMovsLoading] = useState(false)
  const [showMovs, setShowMovs] = useState(false)
  const [lightbox, setLightbox] = useState<string[] | null>(null)
  const [editLoc, setEditLoc] = useState(false)
  const [locForm, setLocForm] = useState<UbicacionEstructurada>({})
  const [savingLoc, setSavingLoc] = useState(false)

  // ── Ancho redimensionable del panel (desktop) ──
  const [width, setWidth] = useState<number>(() => {
    try { const w = parseInt(localStorage.getItem('repuestos-detail-width') || '', 10); if (w >= 300 && w <= 760) return w } catch { /* noop */ }
    return 360
  })
  const [isDesktop, setIsDesktop] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 640px)')
    const on = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const startResize = useCallback((e: ReactMouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = width; let latest = startW
    const move = (ev: globalThis.MouseEvent) => { latest = Math.min(760, Math.max(300, startW + (startX - ev.clientX))); setWidth(latest) }
    const up = () => {
      document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''; document.body.style.userSelect = ''
      try { localStorage.setItem('repuestos-detail-width', String(latest)) } catch { /* noop */ }
    }
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up)
  }, [width])

  const startEditLoc = useCallback(() => {
    setLocForm({ pasillo: item?.pasillo ?? '', estante: item?.estante ?? '', nivel: item?.nivel ?? '' })
    setEditLoc(true)
  }, [item])

  // ── Nombres comunes (apodos) ──
  const [editApodos, setEditApodos] = useState(false)
  const [apodosVal, setApodosVal] = useState('')
  const [savingApodos, setSavingApodos] = useState(false)

  const startEditApodos = useCallback(() => {
    setApodosVal((item?.nombresComunes ?? []).join(', '))
    setEditApodos(true)
  }, [item])

  const saveApodos = useCallback(async () => {
    if (!onSaveApodos) return
    setSavingApodos(true)
    try {
      await onSaveApodos(apodosVal.split(',').map((s) => s.trim()).filter(Boolean))
      setEditApodos(false)
    } finally { setSavingApodos(false) }
  }, [onSaveApodos, apodosVal])

  const saveLoc = useCallback(async () => {
    if (!item) return
    setSavingLoc(true)
    try { await onSaveLocation(item.codigoSAP, locForm); setEditLoc(false) }
    finally { setSavingLoc(false) }
  }, [item, locForm, onSaveLocation])

  const bodegaDocId = item?.bodegaId
  const sap = item?.codigoSAP ?? ''

  // Equipos N:M donde se usa el material (nodeIds) y manuales heredados de ellos.
  const equiposReales = (item?.equipos ?? []).filter((e) => e.machineId)
  const { manuales: manualesHeredados, loading: manualesLoading } = useManualesDeEquipos(equiposReales.map((e) => e.machineId))

  // Cargar movimientos al cambiar de repuesto (para "última actualización")
  useEffect(() => { setEditLoc(false); setEditApodos(false) }, [sap])

  useEffect(() => {
    setMovs(null); setShowMovs(false)
    if (!bodegaDocId) return
    let alive = true
    setMovsLoading(true)
    loadMovimientos(bodegaDocId, 50)
      .then((m) => { if (alive) setMovs(m) })
      .catch(() => { if (alive) setMovs([]) })
      .finally(() => { if (alive) setMovsLoading(false) })
    return () => { alive = false }
  }, [bodegaDocId, loadMovimientos])

  const copySap = useCallback(() => {
    if (!sap) return
    navigator.clipboard?.writeText(sap).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [sap])

  if (!item) return null

  // Fotos de bodega (del físico) primero; si no hay, las del catálogo (manual/galería)
  const allPhotos = [...(item.fotos ?? []), ...(item.fotosCatalogo ?? [])]
  const photo = allPhotos[0]
  const ultimo = movs && movs.length > 0 ? movs[0] : null
  const bodega = item.ubicacionBodega || (item.bodegaId ? 'Bodega Principal' : '—')

  return (
    <aside
      style={isDesktop ? { width } : undefined}
      className="fixed inset-0 z-50 flex h-full w-full flex-col border-l border-border bg-card sm:static sm:z-auto sm:w-auto sm:shrink-0 sm:bg-card/40 relative"
    >
      {/* Asa de arrastre para ajustar el ancho (solo desktop) */}
      <div
        onMouseDown={startResize}
        className="absolute left-0 top-0 z-10 hidden h-full w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40 sm:block"
        title="Arrastra para ajustar el ancho"
        aria-label="Ajustar ancho del panel"
      />
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detalle del repuesto</span>
        <div className="flex items-center gap-1">
          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              className={['rounded p-1 transition', isFavorite ? 'text-amber-400' : 'text-muted-foreground hover:text-amber-400'].join(' ')}
              title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              aria-label="Favorito"
            >
              <Star className={['h-4 w-4', isFavorite ? 'fill-current' : ''].join(' ')} />
            </button>
          )}
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Foto */}
        <div className="mb-3 flex justify-center">
          {photo ? (
            <button
              onClick={() => setLightbox(allPhotos.length ? allPhotos : null)}
              className="overflow-hidden rounded-lg border border-border transition hover:ring-2 hover:ring-primary"
            >
              <img src={photo} alt={item.textoBreve} className="h-32 w-full max-w-[280px] object-cover" />
            </button>
          ) : (
            <div className="flex h-28 w-full max-w-[280px] items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/50">
              <ImageOff className="h-7 w-7" />
            </div>
          )}
        </div>

        {/* Nombre + SAP */}
        {isAdmin && onRename ? (
          <InlineEditName
            value={item.textoBreve || ''}
            onSave={onRename}
            canEdit
            placeholder="(sin nombre)"
            textClassName="text-base font-bold leading-tight text-foreground"
            inputClassName="text-base font-bold leading-tight"
          />
        ) : (
          <h2 className="text-base font-bold leading-tight text-foreground">{item.textoBreve || '(sin nombre)'}</h2>
        )}
        <div className="mb-3 mt-1.5 flex flex-wrap items-center gap-2">
          {item.clase && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{CLASE_LABEL[item.clase]}</span>
          )}
          {sap ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">SAP</span>
              <span className="font-mono text-sm text-foreground">{sap}</span>
              <button onClick={copySap} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Copiar SAP">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </span>
          ) : (
            <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">sin SAP · pieza de despiece</span>
          )}
        </div>

        {/* Acción: solicitar repuesto — solo con SAP (lo ordenable). Sin SAP no se puede pedir. */}
        {sap ? (
          onSolicitar && (
            <Button size="sm" className="mb-3 w-full gap-1.5" onClick={() => onSolicitar(item)}>
              <Plus className="h-4 w-4" /> Solicitar repuesto
            </Button>
          )
        ) : (
          <div className="mb-3 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">Pieza de despiece sin código SAP — asígnale un SAP para poder solicitarla a bodega.</p>
            {onAssignSap && (
              <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={onAssignSap}>
                <Plus className="h-4 w-4" /> Asignar código SAP
              </Button>
            )}
          </div>
        )}

        {/* Acciones de consulta (todos los usuarios) */}
        {(onSpecs || onPhotos || onManual) && (
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {onSpecs && <ActionBtn icon={FileText} label="Ficha" onClick={onSpecs} />}
            {onPhotos && <ActionBtn icon={ImageIcon} label="Fotos" onClick={onPhotos} />}
            {onManual && <ActionBtn icon={BookOpen} label="Manual" onClick={onManual} />}
          </div>
        )}

        {/* Agregar a lista de favoritos con nombre */}
        {onAddToList && (
          <Button variant="outline" size="sm" className="mb-3 w-full gap-1.5" onClick={onAddToList}>
            <ListPlus className="h-4 w-4" /> Agregar a lista
          </Button>
        )}

        {/* Acciones de edición (solo admin) */}
        {isAdmin && (onEditRepuesto || onDeleteRepuesto) && (
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {onEditRepuesto && <ActionBtn icon={SquarePen} label="Editar" onClick={onEditRepuesto} />}
            {onDeleteRepuesto && <ActionBtn icon={Trash2} label="Eliminar" onClick={onDeleteRepuesto} danger />}
          </div>
        )}

        {/* Dónde se usa — N:M (todos los equipos donde sirve el material) */}
        <div className="border-y border-border/60 py-2">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {equiposReales.length > 0 ? `Dónde se usa · ${equiposReales.length} ${equiposReales.length === 1 ? 'equipo' : 'equipos'}` : 'Material transversal'}
          </div>
          {equiposReales.length > 0 ? (
            <div className="space-y-1">
              {equiposReales.slice(0, 6).map((e) => (
                <div key={e.machineId} className="truncate rounded-md bg-muted/40 px-2 py-1 text-[12.5px] text-foreground" title={e.machineName}>
                  {e.machineName}
                </div>
              ))}
              {equiposReales.length > 6 && (
                <div className="px-2 text-[11px] text-muted-foreground">y {equiposReales.length - 6} más…</div>
              )}
              {onAssignEquipo && (
                <button onClick={onAssignEquipo} className="mt-0.5 inline-flex items-center gap-1 px-1 text-[11px] text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Agregar equipo
                </button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-[12.5px] text-muted-foreground">Insumo/herramienta sin equipo fijo — disponible para toda la planta.</p>
              {onAssignEquipo && (
                <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={onAssignEquipo}>
                  <Plus className="h-4 w-4" /> Asignar a un equipo
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Repuesto común / más usado — lista COMPARTIDA de planta (marca del admin).
            Se refleja en la pestaña "Repuestos comunes" del Centro de Aprendizaje. */}
        {(( comunEn && comunEn.length > 0) || onMarkComun) && (
          <div className="border-b border-border/60 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Wrench className="h-3.5 w-3.5 text-emerald-500" />
              Repuesto común de
            </div>
            {comunEn && comunEn.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {comunEn.map((slug) => (
                  <span
                    key={slug}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[12px] font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    {findMachineBySlug(slug)?.name ?? slug}
                    {onRemoveComun && (
                      <button onClick={() => onRemoveComun(slug)} className="ml-0.5 opacity-60 hover:opacity-100" aria-label="Quitar">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                {onMarkComun && (
                  <button onClick={onMarkComun} className="inline-flex items-center gap-1 px-1 text-[11px] text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Otra máquina
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p className="text-[12.5px] text-muted-foreground">Marcalo como repuesto común de una máquina para que aparezca en su lista de aprendizaje.</p>
                {onMarkComun && (
                  <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={onMarkComun}>
                    <Wrench className="h-4 w-4" /> Marcar como común
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Manuales del equipo (heredados de los equipos donde se usa) */}
        {(manualesHeredados.length > 0 || manualesLoading) && (
          <div className="border-b border-border/60 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Manuales del equipo
              {manualesHeredados.length > 0 && <span className="font-normal">({manualesHeredados.length})</span>}
            </div>
            {manualesLoading ? (
              <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> cargando…</div>
            ) : (
              <div className="space-y-1">
                {manualesHeredados.map((m) => (
                  <a
                    key={m.id}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-[12.5px] text-foreground transition hover:bg-muted/50 hover:text-primary"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate" title={m.titulo}>{m.titulo}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Campos */}
        <div className="divide-y divide-border/60 border-b border-border/60">
          <Field label="Área" value={areaName} />
          <Field label="Tipo" value={item.tipo?.trim() || 'Sin clasificar'} />
          <Field label="Fabricante" value={item.codigoFabricante ?? '-'} />
          <Field label="Unidad" value={item.unidad ?? '-'} />
          {/* Nombres comunes (apodos) — editable acá porque la columna de la tabla solo existe en lg+ */}
          <div className="py-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Nombres comunes</span>
              {!editApodos && (
                <span className="flex min-w-0 items-center gap-1.5 text-right text-[13px] font-medium text-foreground">
                  <span className="min-w-0 truncate" title={(item.nombresComunes ?? []).join(', ')}>
                    {(item.nombresComunes && item.nombresComunes.length) ? item.nombresComunes.join(', ') : '—'}
                  </span>
                  {onSaveApodos && (
                    <button onClick={startEditApodos} className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-primary" title="Editar nombres comunes" aria-label="Editar nombres comunes">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
            </div>
            {editApodos && (
              <div className="mt-2 space-y-2">
                <Input
                  autoFocus
                  value={apodosVal}
                  onChange={(e) => setApodosVal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveApodos()
                    else if (e.key === 'Escape') setEditApodos(false)
                  }}
                  placeholder="apodos, separados por coma"
                  className="h-8 text-xs"
                  disabled={savingApodos}
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 flex-1" onClick={saveApodos} disabled={savingApodos}>
                    {savingApodos ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setEditApodos(false)} disabled={savingApodos}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tarjeta de stock */}
        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-center">
          <div className="bg-card px-2 py-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Disponible</div>
            <div className={['text-2xl font-bold tabular-nums', item.stockStatus === 'out' ? 'text-red-500' : item.stockStatus === 'low' ? 'text-amber-500' : 'text-emerald-500'].join(' ')}>
              {item.bodegaId ? item.stockActual : '—'}
            </div>
          </div>
          <div className="bg-card px-2 py-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Mínimo</div>
            <div className="text-2xl font-bold tabular-nums text-foreground">{item.bodegaId ? item.stockMinimo : '—'}</div>
          </div>
          <div className="bg-card px-2 py-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Máximo</div>
            <div className="text-2xl font-bold tabular-nums text-foreground">{item.stockMaximo ?? '—'}</div>
          </div>
        </div>

        {/* Bodega / Ubicación */}
        <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
          <Field label="Bodega" value={bodega} />
          {/* Ubicación estructurada (editable) */}
          <div className="py-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Ubicación</span>
              {!editLoc && (
                <span className="flex items-center gap-1.5 text-right text-[13px] font-medium text-foreground">
                  {formatUbicacion(item)}
                  {item.bodegaId && (
                    <button onClick={startEditLoc} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Editar ubicación">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
            </div>
            {editLoc && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <Input value={locForm.pasillo ?? ''} onChange={(e) => setLocForm((f) => ({ ...f, pasillo: e.target.value }))} placeholder="Pasillo" className="h-8 text-xs" />
                  <Input value={locForm.estante ?? ''} onChange={(e) => setLocForm((f) => ({ ...f, estante: e.target.value }))} placeholder="Estante" className="h-8 text-xs" />
                  <Input value={locForm.nivel ?? ''} onChange={(e) => setLocForm((f) => ({ ...f, nivel: e.target.value }))} placeholder="Nivel" className="h-8 text-xs" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 flex-1" onClick={saveLoc} disabled={savingLoc}>
                    {savingLoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setEditLoc(false)} disabled={savingLoc}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Última actualización */}
        <div className="mt-3 text-[11px] text-muted-foreground">
          <div className="uppercase tracking-wide">Última actualización</div>
          {movsLoading ? (
            <div className="mt-1 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> cargando…</div>
          ) : ultimo ? (
            <div className="mt-0.5 text-foreground">{fmtDate(ultimo.createdAt)} <span className="text-muted-foreground">· por {ultimo.realizadoPorNombre || '—'}</span></div>
          ) : (
            <div className="mt-0.5">Sin movimientos registrados</div>
          )}
        </div>

        {/* Ver movimientos */}
        {bodegaDocId && (
          <Button variant="outline" size="sm" className="mt-3 w-full gap-1.5" onClick={() => setShowMovs((s) => !s)} disabled={movsLoading || !movs?.length}>
            <History className="h-4 w-4" /> {showMovs ? 'Ocultar movimientos' : `Ver movimientos${movs?.length ? ` (${movs.length})` : ''}`}
          </Button>
        )}

        {showMovs && movs && movs.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {movs.map((m) => {
              const meta = MOV_META[m.tipo]
              const Icon = meta.icon
              return (
                <div key={m.id} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
                  <Icon className={['h-3.5 w-3.5 shrink-0', meta.cls].join(' ')} />
                  <span className="font-medium">{meta.label}</span>
                  <span className="tabular-nums">{m.cantidad}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{fmtDate(m.createdAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {lightbox && <ImageLightbox photos={lightbox} onClose={() => setLightbox(null)} />}
    </aside>
  )
}
