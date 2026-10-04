/**
 * RepuestoDetailPanel — Panel lateral derecho de detalle del repuesto (Fase 3).
 *
 * Columna fija a la derecha del hub (NO modal flotante), fiel al mockup:
 * foto · nombre · SAP+copiar · EQUIPO/ÁREA/CATEGORÍA/FABRICANTE/UNIDAD ·
 * tarjeta de stock (Disponible/Mínimo/Máximo) · Bodega · Ubicación ·
 * última actualización (último movimiento) · Ver movimientos.
 */
import { useState, useEffect, useCallback, type MouseEvent as ReactMouseEvent } from 'react'
import { ChevronLeft, MoreHorizontal, X, Copy, Check, ClipboardCheck, History, Loader2, ArrowDownCircle, ArrowUpCircle, Settings2, Pencil, Plus, FileText, Image as ImageIcon, BookOpen, Shapes, Trash2, SquarePen, Star, ListPlus, ExternalLink, MapPin, Wrench } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { findMachineBySlug } from '@/data/learningMachines'
import { machinesForCommonSap } from '@/data/commonPartsByMachine'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { InlineEditName } from '@/components/repuestos/InlineEditName'
import { useManualesDeEquipos } from '@/hooks/repuestos/useManualesDeEquipos'
import { CLASE_LABEL } from '@/types/repuestos'
import type { AreaRepuestoRow } from '@/hooks/repuestos/useAreaRepuestos'
import type { MovimientoBodega } from '@/hooks/repuestos/useBodega'
import { AREA_TACTIL, AREA_TACTIL_COMPACTA } from '@/lib/areaTactil'
import { Link, useNavigate } from 'react-router-dom'
import { Button as PielButton, ListGroup, ListCell } from '@/components/piel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import { ocultarBurbujaChat } from '@/lib/pantallaCompletaMovil'
import { agruparDondeSeUsa, totalDondeSeUsa, plantaCorta } from '@/hooks/repuestos/dondeSeUsa'
import { rutaExpedienteEquipo } from '@/services/equipos/enlaceExpediente'

export interface UbicacionEstructurada { pasillo?: string; estante?: string; nivel?: string }

interface RepuestoDetailPanelProps {
  item: AreaRepuestoRow | null
  /**
   * Planta de un nodo de la jerarquía. Sin ella los equipos se agrupan solo por nombre y
   * «KNURO N1» de Chonchi y de Yal se colapsan en uno: el panel decía 3 equipos para 6.
   */
  plantaDe?: (nodeId: string) => string | undefined
  areaName: string
  /** Texto del «‹ volver» en el teléfono (la cinta/equipo desde donde se llegó). Por defecto, el área. */
  volverA?: string
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
  /** Figura del despiece donde va la pieza (por código de fabricante); null = no está en un despiece. */
  dibujo?: { fig: string; abrir: () => void } | null
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
  /** Registrar un conteo físico (fija el stock a lo contado; 0 = "no había"). */
  onContar?: (contado: number) => Promise<void>
  // ── Repuesto común / más usado de una máquina (lista compartida de planta) ──
  /** Slugs de máquina para las que este repuesto está marcado como común. */
  comunEn?: string[]
  /** Abrir el selector de máquina para marcarlo como común. Solo admin. */
  onMarkComun?: () => void
  /** Quitar la marca "común" de una máquina. Solo admin. */
  onRemoveComun?: (slug: string) => void
}

/**
 * Botón de acción compacto del panel (icono + etiqueta).
 *
 * `contenido` dice si detrás HAY algo. Sin eso los tres botones de consulta se veían idénticos
 * tuvieran o no contenido, y con la cobertura real del catálogo (ficha 0,1 %, foto 1,0 %,
 * manual 0,04 % — medido el 13-09 sobre 7.673 documentos) eso significa que casi todos los
 * clics caen en un formulario vacío y las pocas piezas documentadas no se distinguen.
 *
 * Nunca se deshabilita: el botón vacío es justamente la puerta para CARGAR lo que falta.
 * Se atenúa, que es distinto — informa sin cerrar el paso.
 */
function ActionBtn({ icon: Icon, label, onClick, danger, contenido }: {
  icon: typeof FileText
  label: string
  onClick: () => void
  danger?: boolean
  /** `undefined` = este botón no lleva señal · `0`/`false` = vacío · nº o `true` = tiene. */
  contenido?: number | boolean
}) {
  const senal = contenido !== undefined
  const tiene = typeof contenido === 'number' ? contenido > 0 : !!contenido
  const cuantos = typeof contenido === 'number' && contenido > 1 ? contenido : null
  return (
    <button
      onClick={onClick}
      title={senal ? (tiene ? `${label}: hay contenido cargado` : `${label}: sin contenido — pulsa para cargarlo`) : undefined}
      className={[
        'relative flex flex-col items-center gap-1 rounded-card border bg-card px-2 py-2 text-caption font-medium transition',
        danger
          ? 'border-border text-ink-crit hover:bg-red-500/[0.15] hover:border-transparent'
          : senal && tiene
            ? 'border-primary/[0.35] text-foreground hover:bg-muted'
            : senal
              ? 'border-border/[0.6] text-muted-foreground/[0.7] hover:bg-muted hover:text-foreground'
              : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      ].join(' ')}
    >
      {senal && tiene && (
        <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground">
          {cuantos ?? '✓'}
        </span>
      )}
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
      <span className="text-caption tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-footnote font-medium text-foreground">{value || '-'}</span>
    </div>
  )
}

const MOV_META: Record<MovimientoBodega['tipo'], { icon: typeof ArrowDownCircle; cls: string; label: string }> = {
  entrada: { icon: ArrowDownCircle, cls: 'text-ink-ok', label: 'Entrada' },
  salida: { icon: ArrowUpCircle, cls: 'text-ink-crit', label: 'Salida' },
  ajuste: { icon: Settings2, cls: 'text-ink-warn', label: 'Ajuste' },
}

function fmtDate(d: Date): string {
  try {
    return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export function RepuestoDetailPanel({ item, plantaDe, areaName, volverA, onClose, loadMovimientos, onSaveLocation, onSolicitar, onAssignSap, onAssignEquipo, isAdmin, onRename, onEditRepuesto, onDeleteRepuesto, onSpecs, onPhotos, onManual, dibujo, isFavorite, onToggleFavorite, onAddToList, onSaveApodos, onContar, comunEn, onMarkComun, onRemoveComun }: RepuestoDetailPanelProps) {
  const [copied, setCopied] = useState(false)
  const [movs, setMovs] = useState<MovimientoBodega[] | null>(null)
  const [movsLoading, setMovsLoading] = useState(false)
  const [showMovs, setShowMovs] = useState(false)
  /**
   * Fuerza recargar los movimientos tras escribir desde este panel. El efecto
   * de abajo solo depende de `bodegaDocId`, que NO cambia al contar (es el mismo
   * doc) → sin esto, el conteo se guardaba bien pero "Última actualización"
   * seguía diciendo "Sin movimientos registrados" hasta reabrir el panel.
   */
  const [movsRefresh, setMovsRefresh] = useState(0)
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null)
  const [editLoc, setEditLoc] = useState(false)
  const [locForm, setLocForm] = useState<UbicacionEstructurada>({})
  const [savingLoc, setSavingLoc] = useState(false)
  // ── Conteo físico ──
  const [contando, setContando] = useState(false)
  const [conteoVal, setConteoVal] = useState('')
  const [savingConteo, setSavingConteo] = useState(false)

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

  const saveConteo = useCallback(async () => {
    if (!onContar) return
    const n = Number.parseInt(conteoVal, 10)
    if (!Number.isFinite(n) || n < 0) return
    setSavingConteo(true)
    try { await onContar(n); setContando(false); setConteoVal(''); setMovsRefresh((v) => v + 1) }
    finally { setSavingConteo(false) }
  }, [onContar, conteoVal])

  const bodegaDocId = item?.bodegaId
  const sap = item?.codigoSAP ?? ''

  // Equipos N:M donde se usa el material (nodeIds) y manuales heredados de ellos.
  const equiposReales = (item?.equipos ?? []).filter((e) => e.machineId)
  // Agrupado por PLANTA y familia: los equipos se llaman igual en las dos plantas.
  const familiasEquipos = agruparDondeSeUsa(equiposReales, plantaDe)
  const totalEquiposUnicos = totalDondeSeUsa(familiasEquipos)
  // Con qué se llega filtrada la lista del expediente: el código de ESTA pieza.
  const buscarEnExpediente = (item?.codigoSAP || item?.codigoFabricante || '').trim()
  const { manuales: manualesHeredados, loading: manualesLoading } = useManualesDeEquipos(equiposReales.map((e) => e.machineId))

  // Cargar movimientos al cambiar de repuesto (para "última actualización")
  useEffect(() => { setEditLoc(false); setEditApodos(false); setContando(false); setConteoVal(''); setShowMovs(false) }, [sap])

  useEffect(() => {
    setMovs(null)
    if (!bodegaDocId) return
    let alive = true
    setMovsLoading(true)
    loadMovimientos(bodegaDocId, 50)
      .then((m) => { if (alive) setMovs(m) })
      .catch(() => { if (alive) setMovs([]) })
      .finally(() => { if (alive) setMovsLoading(false) })
    return () => { alive = false }
  }, [bodegaDocId, loadMovimientos, movsRefresh])

  const navigate = useNavigate()
  const hayItem = !!item
  // Bajo md (<768 px) la lista usa la fila móvil: la burbuja del chat se esconde mientras el detalle esté abierto.
  // En <640 el detalle es pantalla completa; entre 640 y 767 es el panel lateral y la burbuja tapaba su «Ver».
  const [bajoMd, setBajoMd] = useState<boolean>(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 767px)')
    const alCambiar = () => setBajoMd(mq.matches)
    alCambiar()
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])
  useEffect(() => {
    if (!bajoMd || !hayItem) return
    return ocultarBurbujaChat()
  }, [bajoMd, hayItem])

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
  // Nombre común primero: el título es el 1er nombre común y el nombre SAP queda en su propio renglón gris.
  const nv = nombreVisible(item)
  const etiquetasNombre = nv.etiquetas.map((et) => (
    <span key={et} className="mr-1.5 inline-block rounded-ctl bg-muted px-1.5 py-0.5 align-middle text-caption font-medium text-muted-foreground">{et}</span>
  ))

  // Secciones de abajo (común, manuales, descripción, campos, stock, conteo, ubicación,
  // movimientos): idénticas en teléfono y escritorio, por eso se definen una sola vez.
  const resto = (
    <>
        {/* Repuesto común / más usado — lista COMPARTIDA de planta. Fusiona los
            SEMBRADOS de la lista base (commonPartsByMachine, por SAP, no editables
            desde acá) + los MARCADOS a mano (comunEn, con ✕). Se refleja en la
            pestaña "Repuestos comunes" del Centro de Aprendizaje. */}
        {(() => {
          const seeded = item?.codigoSAP ? machinesForCommonSap(item.codigoSAP) : []
          const marked = comunEn ?? []
          const seededSet = new Set(seeded)
          const markedSet = new Set(marked)
          const allSlugs = [...new Set([...seeded, ...marked])]
          if (allSlugs.length === 0 && !onMarkComun) return null
          return (
            <div className="border-b border-border/60 py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-caption tracking-wide text-muted-foreground">
                <Wrench className="h-3.5 w-3.5 text-ink-ok" />
                Repuesto común de
              </div>
              {allSlugs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {allSlugs.map((slug) => {
                    const removable = markedSet.has(slug) && onRemoveComun
                    const seededOnly = seededSet.has(slug) && !markedSet.has(slug)
                    return (
                      <span
                        key={slug}
                        className="inline-flex items-center gap-1 rounded-ctl bg-emerald-500/[0.15] px-2 py-1 text-footnote font-medium text-ink-ok"
                        title={seededOnly ? 'De la lista base (planilla de planta) — se edita en el código' : undefined}
                      >
                        {findMachineBySlug(slug)?.name ?? slug}
                        {seededOnly && <span className="text-caption tracking-wide opacity-60">base</span>}
                        {removable && (
                          <button onClick={() => onRemoveComun!(slug)} className="ml-0.5 opacity-60 hover:opacity-100" aria-label="Quitar">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    )
                  })}
                  {onMarkComun && (
                    <button onClick={onMarkComun} className="inline-flex items-center gap-1 px-1 text-caption text-primary hover:underline">
                      <Plus className="h-3 w-3" /> Otra máquina
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-footnote text-muted-foreground">Marcalo como repuesto común de una máquina para que aparezca en su lista de aprendizaje.</p>
                  {onMarkComun && (
                    <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={onMarkComun}>
                      <Wrench className="h-4 w-4" /> Marcar como común
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Manuales del equipo (heredados de los equipos donde se usa) */}
        {(manualesHeredados.length > 0 || manualesLoading) && (
          <div className="border-b border-border/60 py-2">
            <div className="mb-1.5 flex items-center gap-1.5 text-caption tracking-wide text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" />
              Manuales del equipo
              {manualesHeredados.length > 0 && <span className="font-normal">({manualesHeredados.length})</span>}
            </div>
            {manualesLoading ? (
              <div className="flex items-center gap-1.5 text-footnote text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> cargando…</div>
            ) : (
              <div className="space-y-1">
                {manualesHeredados.map((m) => (
                  <a
                    key={m.id}
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-ctl border border-border/60 px-2 py-1.5 text-footnote text-foreground transition hover:bg-muted/50 hover:text-primary"
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

        {/* Descripción y observaciones del catálogo (antes solo visibles en Editar) */}
        {(item.descripcion || item.observacionesRepuesto) && (
          <div className="border-b border-border/60 py-2">
            {item.descripcion && (
              <div className="mb-1.5">
                <div className="mb-0.5 text-caption tracking-wide text-muted-foreground">Descripción</div>
                <p className="whitespace-pre-wrap text-footnote leading-snug text-foreground">{item.descripcion}</p>
              </div>
            )}
            {item.observacionesRepuesto && (
              <div>
                <div className="mb-0.5 text-caption tracking-wide text-muted-foreground">Observaciones</div>
                <p className="whitespace-pre-wrap text-footnote leading-snug text-muted-foreground">{item.observacionesRepuesto}</p>
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
              <span className="text-caption tracking-wide text-muted-foreground">Nombres comunes</span>
              {!editApodos && (
                <span className="flex min-w-0 items-center gap-1.5 text-right text-footnote font-medium text-foreground">
                  <span className="min-w-0 truncate" title={(item.nombresComunes ?? []).join(', ')}>
                    {nv.esComun ? nv.titulo : '—'}
                  </span>
                  {onSaveApodos && (
                    <button onClick={startEditApodos} className="shrink-0 rounded-ctl p-0.5 text-muted-foreground hover:text-primary" title="Editar nombres comunes" aria-label="Editar nombres comunes">
                      <Pencil className="h-3 w-3" />
                    </button>
                  )}
                </span>
              )}
            </div>
            {!editApodos && nv.otros.length > 0 && (
              <p className="mt-0.5 break-words text-footnote text-muted-foreground">También se busca como: {nv.otros.join(', ')}</p>
            )}
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
                  placeholder="nombres comunes, separados por coma (el primero se muestra como título)"
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
        <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-card border border-border bg-border text-center">
          <div className="bg-card px-2 py-3">
            <div className="text-caption tracking-wide text-muted-foreground">Disponible</div>
            <div className={['text-2xl font-bold tabular-nums', item.stockStatus === 'out' ? 'text-ink-crit' : item.stockStatus === 'low' ? 'text-ink-warn' : 'text-ink-ok'].join(' ')}>
              {item.bodegaId ? item.stockActual : '—'}
            </div>
          </div>
          <div className="bg-card px-2 py-3">
            <div className="text-caption tracking-wide text-muted-foreground">Mínimo</div>
            <div className="text-2xl font-bold tabular-nums text-foreground">{item.bodegaId ? item.stockMinimo : '—'}</div>
          </div>
          <div className="bg-card px-2 py-3">
            <div className="text-caption tracking-wide text-muted-foreground">Máximo</div>
            <div className="text-2xl font-bold tabular-nums text-foreground">{item.stockMaximo ?? '—'}</div>
          </div>
        </div>

        {/* Conteo físico — reemplaza a la pestaña Bodega: se cuenta desde acá,
            en la ficha del repuesto, y el resultado alimenta el filtro de stock. */}
        {onContar && sap && (
          <div className="mt-2">
            {!contando ? (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 text-caption text-muted-foreground">
                  {item.ultimoConteoAt ? (
                    <>Contado el {fmtDate(item.ultimoConteoAt)}{item.ultimoConteoPor ? ` · por ${item.ultimoConteoPor}` : ''}</>
                  ) : (
                    <span className="text-ink-warn">Nunca contado — el stock viene de la importación</span>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1.5" onClick={() => { setConteoVal(String(item.stockActual ?? 0)); setContando(true) }}>
                  <ClipboardCheck className="h-3.5 w-3.5" /> Contar
                </Button>
              </div>
            ) : (
              <div className="rounded-card border border-transparent bg-primary/5 p-2">
                <div className="mb-1.5 text-caption text-muted-foreground">
                  Antes había <span className="font-bold text-foreground">{item.bodegaId ? item.stockActual : 0}</span>. ¿Cuántas hay ahora? (0 = no había)
                </div>
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={conteoVal}
                    onChange={(e) => setConteoVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveConteo()
                      else if (e.key === 'Escape') setContando(false)
                    }}
                    className="h-8 w-24 text-sm"
                    disabled={savingConteo}
                  />
                  <Button size="sm" className="h-8 flex-1" onClick={saveConteo} disabled={savingConteo || conteoVal.trim() === ''}>
                    {savingConteo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar conteo'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setContando(false)} disabled={savingConteo}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bodega / Ubicación */}
        <div className="mt-3 divide-y divide-border/60 border-y border-border/60">
          <Field label="Bodega" value={bodega} />
          {/* Ubicación estructurada (editable) */}
          <div className="py-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-caption tracking-wide text-muted-foreground">Ubicación</span>
              {!editLoc && (
                <span className="flex items-center gap-1.5 text-right text-footnote font-medium text-foreground">
                  {formatUbicacion(item)}
                  {item.bodegaId && (
                    <button onClick={startEditLoc} className="rounded-ctl p-0.5 text-muted-foreground hover:text-primary" title="Editar ubicación">
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
        <div className="mt-3 text-caption text-muted-foreground">
          <div className="tracking-wide">Última actualización</div>
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
                <div key={m.id} className="flex items-center gap-2 rounded-ctl border border-border/60 px-2 py-1.5 text-xs">
                  <Icon className={['h-3.5 w-3.5 shrink-0', meta.cls].join(' ')} />
                  <span className="font-medium">{meta.label}</span>
                  <span className="tabular-nums">{m.cantidad}</span>
                  <span className="ml-auto text-caption text-muted-foreground">{fmtDate(m.createdAt)}</span>
                </div>
              )
            })}
          </div>
        )}
    </>
  )

  if (!isDesktop) {
    const hayMenu = !!onAddToList || (isAdmin && (!!onEditRepuesto || !!onDeleteRepuesto))
    const tonoStock = item.stockStatus === 'out' ? 'text-ink-crit' : item.stockStatus === 'low' ? 'text-ink-warn' : 'text-ink-ok'
    return (
      <aside className="fixed inset-0 z-50 flex h-full w-full flex-col bg-background pt-[env(safe-area-inset-top)]">
        {/* Barra superior: ‹ volver + cápsula de vidrio con favorito y ⋯ (una sola cápsula, no un vidrio por botón) */}
        <div className="flex shrink-0 items-center justify-between px-2">
          <button onClick={onClose} className="inline-flex min-h-[44px] items-center gap-0.5 pl-0.5 pr-2 text-body text-primary" aria-label={`Volver a ${volverA || areaName || 'Repuestos'}`}>
            <ChevronLeft className="size-6" aria-hidden />
            <span className="max-w-[60vw] truncate">{volverA || areaName || 'Repuestos'}</span>
          </button>
          <div className="glass-nav flex items-center rounded-full px-0.5">
            {onToggleFavorite && (
              <button onClick={onToggleFavorite} className={[AREA_TACTIL, 'rounded-full', isFavorite ? 'text-ink-warn' : 'text-foreground'].join(' ')} aria-label={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'} aria-pressed={!!isFavorite}>
                <Star className={['size-[22px]', isFavorite ? 'fill-current' : ''].join(' ')} />
              </button>
            )}
            {hayMenu && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={[AREA_TACTIL, 'rounded-full text-foreground'].join(' ')} aria-label="Más acciones">
                    <MoreHorizontal className="size-[22px]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13rem]">
                  {onAddToList && (
                    <DropdownMenuItem className="min-h-[44px] gap-2 text-body" onSelect={onAddToList}>
                      <ListPlus className="size-4" /> Agregar a lista
                    </DropdownMenuItem>
                  )}
                  {isAdmin && onEditRepuesto && (
                    <DropdownMenuItem className="min-h-[44px] gap-2 text-body" onSelect={onEditRepuesto}>
                      <SquarePen className="size-4" /> Editar
                    </DropdownMenuItem>
                  )}
                  {isAdmin && onDeleteRepuesto && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="min-h-[44px] gap-2 text-body text-ink-crit focus:text-ink-crit" onSelect={onDeleteRepuesto}>
                        <Trash2 className="size-4" /> Eliminar
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-[calc(104px+env(safe-area-inset-bottom))]">
          {/* Nombre */}
          <div className="px-4 pt-1">
            {nv.esComun ? (
              <>
                <h2 className="text-title2 font-bold text-foreground">{etiquetasNombre}{nv.titulo}</h2>
                {nv.oficial && (isAdmin && onRename ? (
                  <InlineEditName
                    value={item.textoBreve || ''}
                    display={nv.oficial}
                    onSave={onRename}
                    canEdit
                    textClassName="break-words text-subhead text-muted-foreground"
                    inputClassName="text-subhead"
                  />
                ) : (
                  <p className="break-words text-subhead text-muted-foreground">{nv.oficial}</p>
                ))}
              </>
            ) : isAdmin && onRename ? (
              <h2 className="text-title2 font-bold text-foreground">
                {etiquetasNombre}
                <InlineEditName
                  value={item.textoBreve || ''}
                  display={nv.titulo}
                  onSave={onRename}
                  canEdit
                  placeholder="(sin nombre)"
                  textClassName="text-title2 font-bold"
                  inputClassName="text-title2 font-bold"
                />
              </h2>
            ) : (
              <h2 className="text-title2 font-bold text-foreground">{etiquetasNombre}{nv.titulo}</h2>
            )}
          </div>
          {/* SAP + copiar (44×44: a la derecha hay espacio) */}
          <div className="flex items-center justify-between pl-4 pr-1">
            {sap ? (
              <>
                <span className="text-subhead text-muted-foreground">SAP <span className="ml-1 font-mono text-body text-foreground">{sap}</span></span>
                <button onClick={copySap} className={`${AREA_TACTIL} rounded-full text-primary`} aria-label="Copiar código SAP">
                  {copied ? <Check className="size-5 text-ink-ok" /> : <Copy className="size-5" />}
                </button>
              </>
            ) : (
              <span className="py-2 text-subhead text-ink-warn">Sin SAP · pieza de despiece</span>
            )}
          </div>
          {/* Stock en una línea, sin tarjeta */}
          <p className="flex items-center gap-1.5 px-4 pb-4 text-subhead text-muted-foreground">
            {item.bodegaId ? (
              <>
                <span className={['size-2 shrink-0 rounded-full', item.stockStatus === 'out' ? 'bg-ink-crit' : item.stockStatus === 'low' ? 'bg-ink-warn' : 'bg-ink-ok'].join(' ')} aria-hidden />
                <span>
                  <b className={['font-semibold tabular-nums', tonoStock].join(' ')}>{item.stockActual} {item.unidad || 'pzas'}</b>
                  {item.stockStatus === 'out' ? ' · sin stock' : item.stockStatus === 'low' ? ' · bajo mínimo' : ' disponibles'} · {bodega}
                </span>
              </>
            ) : (
              <span>Sin stock configurado</span>
            )}
          </p>

          {/* Carrusel de fotos: solo si hay */}
          {allPhotos.length > 0 && (
            <div className="mb-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Fotos del repuesto">
              {allPhotos.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setLightbox({ photos: allPhotos, index: i })}
                  className="aspect-video w-[248px] shrink-0 snap-center overflow-hidden rounded-[16px] ring-1 ring-inset ring-border"
                  aria-label={`Ver foto ${i + 1} de ${allPhotos.length}`}
                >
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Dónde se usa: la fila ENTERA es tocable (antes el «Ver» medía 38×32) */}
          <div className="pb-5">
            <ListGroup
              className="px-4"
              title={equiposReales.length > 0 ? `Dónde se usa · ${totalEquiposUnicos} ${totalEquiposUnicos === 1 ? 'equipo' : 'equipos'}` : 'Material transversal'}
            >
              {equiposReales.length > 0 ? (
                familiasEquipos.flatMap((f) =>
                  f.unidades.map((u) => (
                    <ListCell
                      key={u.nodeId}
                      className="min-h-[52px]"
                      title={`${f.familia}${u.unidad ? ` ${u.unidad}` : ''}`}
                      subtitle={f.planta ? plantaCorta(f.planta) : undefined}
                      onClick={() => navigate(rutaExpedienteEquipo(u.nodeId, 'recursos', { buscar: buscarEnExpediente }))}
                    />
                  )),
                )
              ) : (
                <ListCell className="min-h-[52px]" title="Disponible para toda la planta" subtitle="Insumo o herramienta sin equipo fijo" />
              )}
              {onAssignEquipo && (
                <ListCell className="min-h-[52px] text-primary" title={equiposReales.length > 0 ? 'Agregar equipo' : 'Asignar a un equipo'} onClick={onAssignEquipo} />
              )}
            </ListGroup>
          </div>

          {/* Documentos */}
          {(onSpecs || onManual || dibujo || onPhotos) && (
            <div className="pb-5">
              <ListGroup className="px-4" title="Documentos">
                {onSpecs && <ListCell className="min-h-[52px]" leading={<FileText className="size-5 text-primary" />} title="Ficha técnica" value={item.tieneFicha ? undefined : 'Sin cargar'} onClick={onSpecs} />}
                {onManual && <ListCell className="min-h-[52px]" leading={<BookOpen className="size-5 text-primary" />} title="Manual" value={manualesLoading ? undefined : ((item.manuales ?? 0) + manualesHeredados.length) || 'Sin cargar'} onClick={onManual} />}
                {dibujo && <ListCell className="min-h-[52px]" leading={<Shapes className="size-5 text-primary" />} title={`Dibujo · fig. ${dibujo.fig}`} onClick={dibujo.abrir} />}
                {onPhotos && <ListCell className="min-h-[52px]" leading={<ImageIcon className="size-5 text-primary" />} title="Fotos" value={allPhotos.length || 'Sin cargar'} onClick={onPhotos} />}
              </ListGroup>
            </div>
          )}

          <div className="px-4">{resto}</div>
        </div>

        {/* Barra inferior de vidrio: único botón filled de la vista */}
        <div className="glass-nav absolute inset-x-0 bottom-0 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          {sap ? (
            onSolicitar && (
              <PielButton size="lg" className="w-full" onClick={() => onSolicitar(item)}>
                <Plus /> Solicitar repuesto
              </PielButton>
            )
          ) : (
            onAssignSap && (
              <PielButton size="lg" variant="tinted" className="w-full" onClick={onAssignSap}>
                <Plus /> Asignar código SAP
              </PielButton>
            )
          )}
        </div>

        {lightbox && <ImageLightbox photos={lightbox.photos} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />}
      </aside>
    )
  }

  return (
    <aside
      style={isDesktop ? { width } : undefined}
      className="fixed inset-0 z-50 flex h-full w-full flex-col border-l border-border bg-[var(--panel-surface)] sm:static sm:z-auto sm:w-auto sm:shrink-0 relative"
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
        <span className="text-caption font-bold tracking-wider text-muted-foreground">Detalle del repuesto</span>
        <div className="flex items-center gap-1">
          {onToggleFavorite && (
            <button
              onClick={onToggleFavorite}
              /* 44x44 REALES, sin margen negativo: entre este botón y «Cerrar» solo hay 4 px
                 medidos, así que invadir hacia los lados haría que tocar uno active el otro. */
              className={[AREA_TACTIL, 'rounded-ctl transition', isFavorite ? 'text-ink-warn' : 'text-muted-foreground hover:text-ink-warn'].join(' ')}
              title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
              aria-label="Favorito"
            >
              <Star className={['h-4 w-4', isFavorite ? 'fill-current' : ''].join(' ')} />
            </button>
          )}
          <button onClick={onClose} className={`${AREA_TACTIL} rounded-ctl text-muted-foreground hover:bg-muted hover:text-foreground`} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Foto — solo cuando HAY foto. El placeholder gastaba media pantalla
            de móvil en un ícono (solo ~64 de 7.700 repuestos tienen foto) y
            empujaba stock/ubicación fuera de la vista. */}
        {photo && (
          <div className="mb-3 flex justify-center">
            <button
              onClick={() => setLightbox(allPhotos.length ? { photos: allPhotos, index: 0 } : null)}
              className="overflow-hidden rounded-card border border-border transition hover:ring-2 hover:ring-primary"
            >
              <img src={photo} alt={nv.titulo} className="h-32 w-full max-w-[280px] object-cover" />
            </button>
          </div>
        )}

        {/* Nombre + SAP */}
        {nv.esComun ? (
          <>
            <h2 className="text-base font-bold leading-tight text-foreground">{etiquetasNombre}{nv.titulo}</h2>
            {nv.oficial && (isAdmin && onRename ? (
              <InlineEditName
                value={item.textoBreve || ''}
                display={nv.oficial}
                onSave={onRename}
                canEdit
                className="mt-0.5"
                textClassName="break-words text-footnote text-muted-foreground"
                inputClassName="text-footnote"
              />
            ) : (
              <p className="mt-0.5 break-words text-footnote text-muted-foreground">{nv.oficial}</p>
            ))}
          </>
        ) : isAdmin && onRename ? (
          <h2 className="text-base font-bold leading-tight text-foreground">
            {etiquetasNombre}
            <InlineEditName
              value={item.textoBreve || ''}
              display={nv.titulo}
              onSave={onRename}
              canEdit
              placeholder="(sin nombre)"
              textClassName="text-base font-bold leading-tight text-foreground"
              inputClassName="text-base font-bold leading-tight"
            />
          </h2>
        ) : (
          <h2 className="text-base font-bold leading-tight text-foreground">{etiquetasNombre}{nv.titulo}</h2>
        )}
        <div className="mb-3 mt-1.5 flex flex-wrap items-center gap-2">
          {item.clase && (
            <span className="rounded-ctl bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">{CLASE_LABEL[item.clase]}</span>
          )}
          {sap ? (
            <span className="inline-flex items-center gap-1">
              <span className="text-caption tracking-wide text-muted-foreground">SAP</span>
              <span className="font-mono text-sm text-foreground">{sap}</span>
              {/* Era 18×18: el target más chico de la pantalla y la acción que más se usa en
                  planta. Crece hacia afuera — medidos 61 px libres arriba y 13 abajo. */}
              <button onClick={copySap} className={`${AREA_TACTIL_COMPACTA} rounded-ctl text-muted-foreground hover:text-primary`} title="Copiar SAP" aria-label="Copiar código SAP">
                {copied ? <Check className="h-3.5 w-3.5 text-ink-ok" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </span>
          ) : (
            <span className="rounded-ctl bg-amber-500/[0.15] px-1.5 py-0.5 text-caption font-medium text-ink-warn">sin SAP · pieza de despiece</span>
          )}
        </div>

        {/* Stock + ubicación PRIMERO — es lo que el técnico vino a buscar.
            Antes vivían 2 scrolls abajo (tarjeta de stock + fila BODEGA),
            detrás de secciones administrativas. La tarjeta detallada
            (mín/máx/conteo) sigue abajo; esto es el resumen de un vistazo. */}
        {item.bodegaId && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-card border border-border bg-muted px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
              <span className={['h-2 w-2 shrink-0 rounded-full', item.stockStatus === 'out' ? 'bg-red-500' : item.stockStatus === 'low' ? 'bg-amber-500' : 'bg-emerald-500'].join(' ')} />
              <span className={item.stockStatus === 'out' ? 'text-ink-crit' : item.stockStatus === 'low' ? 'text-ink-warn' : 'text-ink-ok'}>
                {item.stockActual} {item.unidad || 'pzas'}
              </span>
              {item.stockStatus === 'out' && <span className="text-caption font-normal text-muted-foreground">sin stock</span>}
              {item.stockStatus === 'low' && <span className="text-caption font-normal text-muted-foreground">bajo mínimo</span>}
            </span>
            <span className="inline-flex min-w-0 items-center gap-1 text-sm text-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{bodega}</span>
            </span>
          </div>
        )}

        {/* Acción: solicitar repuesto — solo con SAP (lo ordenable). Sin SAP no se puede pedir. */}
        {sap ? (
          onSolicitar && (
            <Button size="sm" className="mb-3 w-full gap-1.5" onClick={() => onSolicitar(item)}>
              <Plus className="h-4 w-4" /> Solicitar repuesto
            </Button>
          )
        ) : (
          <div className="mb-3 rounded-card border border-dashed border-transparent bg-amber-500/[0.15] px-3 py-2">
            <p className="text-caption text-muted-foreground">Pieza de despiece sin código SAP — asígnale un SAP para poder solicitarla a bodega.</p>
            {onAssignSap && (
              <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={onAssignSap}>
                <Plus className="h-4 w-4" /> Asignar código SAP
              </Button>
            )}
          </div>
        )}

        {/* Acciones de consulta (todos los usuarios) */}
        {(onSpecs || onPhotos || onManual || dibujo) && (
          <div className={['mb-3 grid gap-1.5', dibujo ? 'grid-cols-2' : 'grid-cols-3'].join(' ')}>
            {onSpecs && <ActionBtn icon={FileText} label="Ficha" onClick={onSpecs} contenido={!!item.tieneFicha} />}
            {onPhotos && <ActionBtn icon={ImageIcon} label="Fotos" onClick={onPhotos} contenido={(item.fotos?.length ?? 0) + (item.fotosCatalogo?.length ?? 0)} />}
            {/*
              El modal de manual muestra los vínculos PROPIOS del repuesto Y los HEREDADOS de
              sus equipos, así que la señal tiene que sumar los dos: contar solo los propios
              habría dejado en gris un botón que abre el manual del KNURO. Mientras carga no se
              afirma nada (`undefined` = sin señal), para no decir «vacío» antes de saberlo.
            */}
            {dibujo && (
              <ActionBtn icon={Shapes} label={`Dibujo · fig. ${dibujo.fig}`} onClick={dibujo.abrir} />
            )}
            {onManual && (
              <ActionBtn
                icon={BookOpen}
                label="Manual"
                onClick={onManual}
                contenido={manualesLoading ? undefined : (item.manuales ?? 0) + manualesHeredados.length}
              />
            )}
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
          <div className="mb-1.5 flex items-center gap-1.5 text-caption tracking-wide text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {equiposReales.length > 0 ? `Dónde se usa · ${totalEquiposUnicos} ${totalEquiposUnicos === 1 ? 'equipo' : 'equipos'}` : 'Material transversal'}
          </div>
          {equiposReales.length > 0 ? (
            <div className="space-y-1">
              {familiasEquipos.slice(0, 6).map((f) => (
                <div
                  key={`${f.planta ?? ''}|${f.familia}`}
                  className="flex items-center gap-1.5 rounded-ctl bg-muted px-2 py-1 text-footnote text-foreground"
                >
                  <span className="min-w-0 truncate">
                    {f.familia}
                    {f.planta && <span className="text-muted-foreground"> · {plantaCorta(f.planta)}</span>}
                  </span>
                  {/*
                    Cada unidad abre el expediente de ESE equipo, en la lista de materiales y ya
                    filtrada por el código de esta pieza. Por eso la agrupación tenía que saber la
                    planta: «N1» a secas habría llevado a Chonchi o a Yal según el orden de llegada.
                  */}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {f.unidades.map((u) => (
                      <Link
                        key={u.nodeId}
                        to={rutaExpedienteEquipo(u.nodeId, 'recursos', { buscar: buscarEnExpediente })}
                        title={`Abrir el expediente de ${u.nombre}${f.planta ? ` (${plantaCorta(f.planta)})` : ''}`}
                        /* Tamaño REAL y no un área ampliada: N1, N2 y N3 quedan a 4 px entre sí y un pseudo-
                           elemento de 44 px se solaparía con el vecino — tocar N1 abriría N2. */
                        className="inline-flex min-h-[32px] min-w-[38px] items-center justify-center rounded-ctl bg-background px-2 font-mono text-caption text-primary hover:underline"
                      >
                        {u.unidad || 'Ver'}
                      </Link>
                    ))}
                  </span>
                </div>
              ))}
              {familiasEquipos.length > 6 && (
                <div className="px-2 text-caption text-muted-foreground">y {familiasEquipos.length - 6} familias más…</div>
              )}
              {onAssignEquipo && (
                /* 15 px de alto. Sube a 44 sin estirar la lista: medidos 65 px libres arriba
                   y 86 abajo, así que el área crece hacia afuera sin pisar nada. */
                <button onClick={onAssignEquipo} className={`${AREA_TACTIL_COMPACTA} mt-0.5 inline-flex items-center gap-1 px-1 text-caption text-primary hover:underline`}>
                  <Plus className="h-3 w-3" /> Agregar equipo
                </button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-footnote text-muted-foreground">Insumo/herramienta sin equipo fijo — disponible para toda la planta.</p>
              {onAssignEquipo && (
                <Button size="sm" variant="outline" className="mt-2 w-full gap-1.5" onClick={onAssignEquipo}>
                  <Plus className="h-4 w-4" /> Asignar a un equipo
                </Button>
              )}
            </div>
          )}
        </div>

        {resto}
      </div>

      {lightbox && <ImageLightbox photos={lightbox.photos} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />}
    </aside>
  )
}
