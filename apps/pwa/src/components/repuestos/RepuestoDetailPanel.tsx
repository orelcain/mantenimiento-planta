/**
 * RepuestoDetailPanel — Panel lateral derecho de detalle del repuesto (Fase 3).
 *
 * Columna fija a la derecha del hub (NO modal flotante), fiel al mockup:
 * foto · nombre · SAP+copiar · EQUIPO/ÁREA/CATEGORÍA/FABRICANTE/UNIDAD ·
 * tarjeta de stock (Disponible/Mínimo/Máximo) · Bodega · Ubicación ·
 * última actualización (último movimiento) · Ver movimientos.
 */
import { useState, useEffect, useCallback } from 'react'
import { X, Copy, Check, History, ImageOff, Loader2, ArrowDownCircle, ArrowUpCircle, Settings2, Pencil, Plus, FileText, Image as ImageIcon, Images, BookOpen, ArrowRightLeft, Trash2, SquarePen, FileSearch, Star, ListPlus, FolderOpen } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { InlineEditName } from '@/components/repuestos/InlineEditName'
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
  // ── Acciones por repuesto (Wave 1: rescate de "Por equipo") ──
  /** ¿el usuario es admin? Habilita editar/renombrar/reubicar/eliminar. */
  isAdmin?: boolean
  /** Renombrar (textoBreve) inline desde el título. Solo admin. */
  onRename?: (newName: string) => Promise<void>
  /** Editar repuesto (form completo). Solo admin. */
  onEditRepuesto?: () => void
  /** Eliminar (soft delete → papelera). Solo admin. */
  onDeleteRepuesto?: () => void
  /** Reubicar a otra máquina. Solo admin. */
  onRelocate?: () => void
  /** Ver/editar ficha técnica. */
  onSpecs?: () => void
  /** Ver fotos (reales + de manual). */
  onPhotos?: () => void
  /** Ver/editar galería. */
  onGallery?: () => void
  /** Ver vínculos al manual. */
  onManual?: () => void
  /** Buscar el código de fabricante dentro del PDF del manual (ManualSearchModal). */
  onManualSearch?: () => void
  /** Ver/subir/gestionar los PDFs del equipo (MachineManualPanel). */
  onMachineManuals?: () => void
  /** ¿el repuesto está en favoritos? */
  isFavorite?: boolean
  /** Alternar favorito. */
  onToggleFavorite?: () => void
  /** Abrir el gestor de listas con nombre para este repuesto. */
  onAddToList?: () => void
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

export function RepuestoDetailPanel({ item, areaName, onClose, loadMovimientos, onSaveLocation, onSolicitar, isAdmin, onRename, onEditRepuesto, onDeleteRepuesto, onRelocate, onSpecs, onPhotos, onGallery, onManual, onManualSearch, onMachineManuals, isFavorite, onToggleFavorite, onAddToList }: RepuestoDetailPanelProps) {
  const [copied, setCopied] = useState(false)
  const [movs, setMovs] = useState<MovimientoBodega[] | null>(null)
  const [movsLoading, setMovsLoading] = useState(false)
  const [showMovs, setShowMovs] = useState(false)
  const [lightbox, setLightbox] = useState<string[] | null>(null)
  const [editLoc, setEditLoc] = useState(false)
  const [locForm, setLocForm] = useState<UbicacionEstructurada>({})
  const [savingLoc, setSavingLoc] = useState(false)

  const startEditLoc = useCallback(() => {
    setLocForm({ pasillo: item?.pasillo ?? '', estante: item?.estante ?? '', nivel: item?.nivel ?? '' })
    setEditLoc(true)
  }, [item])

  const saveLoc = useCallback(async () => {
    if (!item) return
    setSavingLoc(true)
    try { await onSaveLocation(item.codigoSAP, locForm); setEditLoc(false) }
    finally { setSavingLoc(false) }
  }, [item, locForm, onSaveLocation])

  const bodegaDocId = item?.bodegaId
  const sap = item?.codigoSAP ?? ''

  // Cargar movimientos al cambiar de repuesto (para "última actualización")
  useEffect(() => { setEditLoc(false) }, [sap])

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

  const photo = item.fotos?.[0]
  const ultimo = movs && movs.length > 0 ? movs[0] : null
  const bodega = item.ubicacionBodega || (item.bodegaId ? 'Bodega Principal' : '—')

  return (
    <aside className="fixed inset-0 z-50 flex h-full w-full flex-col border-l border-border bg-card sm:static sm:z-auto sm:w-[340px] sm:shrink-0 sm:bg-card/40">
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
              onClick={() => setLightbox(item.fotos ?? null)}
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
        <div className="mb-3 mt-1 flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">SAP</span>
          <span className="font-mono text-sm text-foreground">{sap || '-'}</span>
          {sap && (
            <button onClick={copySap} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Copiar SAP">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Acción: solicitar repuesto */}
        {onSolicitar && (
          <Button size="sm" className="mb-3 w-full gap-1.5" onClick={() => onSolicitar(item)}>
            <Plus className="h-4 w-4" /> Solicitar repuesto
          </Button>
        )}

        {/* Acciones de consulta (todos los usuarios) */}
        {(onSpecs || onPhotos || onGallery || onManual || onMachineManuals) && (
          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {onSpecs && <ActionBtn icon={FileText} label="Ficha" onClick={onSpecs} />}
            {onPhotos && <ActionBtn icon={ImageIcon} label="Fotos" onClick={onPhotos} />}
            {onGallery && <ActionBtn icon={Images} label="Galería" onClick={onGallery} />}
            {onManual && <ActionBtn icon={BookOpen} label="Manual" onClick={onManual} />}
            {onMachineManuals && <ActionBtn icon={FolderOpen} label="PDFs equipo" onClick={onMachineManuals} />}
          </div>
        )}

        {/* Buscar código de fabricante dentro del PDF del manual de la máquina */}
        {onManualSearch && (
          <Button variant="outline" size="sm" className="mb-3 w-full gap-1.5" onClick={onManualSearch}>
            <FileSearch className="h-4 w-4" /> Buscar en manual
          </Button>
        )}

        {/* Agregar a lista de favoritos con nombre */}
        {onAddToList && (
          <Button variant="outline" size="sm" className="mb-3 w-full gap-1.5" onClick={onAddToList}>
            <ListPlus className="h-4 w-4" /> Agregar a lista
          </Button>
        )}

        {/* Acciones de edición (solo admin) */}
        {isAdmin && (onEditRepuesto || onRelocate || onDeleteRepuesto) && (
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {onEditRepuesto && <ActionBtn icon={SquarePen} label="Editar" onClick={onEditRepuesto} />}
            {onRelocate && <ActionBtn icon={ArrowRightLeft} label="Reubicar" onClick={onRelocate} />}
            {onDeleteRepuesto && <ActionBtn icon={Trash2} label="Eliminar" onClick={onDeleteRepuesto} danger />}
          </div>
        )}

        {/* Campos */}
        <div className="divide-y divide-border/60 border-y border-border/60">
          <Field label="Equipo" value={item.equipos[0]?.machineName ?? '-'} />
          <Field label="Área" value={areaName} />
          <Field label="Tipo" value={item.tipo?.trim() || 'Sin clasificar'} />
          <Field label="Fabricante" value={item.codigoFabricante ?? '-'} />
          <Field label="Unidad" value={item.unidad ?? '-'} />
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
