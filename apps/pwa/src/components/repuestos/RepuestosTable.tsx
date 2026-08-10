import { useState } from 'react'
import { Package, ImageIcon, X, BookOpen, Eye, Camera, Pencil, Trash2, ArrowRightLeft, ArrowUpDown, ArrowUp, ArrowDown, MessageSquareText, Star } from 'lucide-react'
import type { Repuesto, EquipmentRepuesto } from '@/types/repuestos'
import { RepuestoActionsMenu } from './RepuestoActionsMenu'

/** Tooltip ligero para botones de acción (CSS puro, sin deps) */
function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="relative group/tip">
      {children}
      <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-ctl bg-popover text-popover-foreground text-caption px-1.5 py-0.5 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50 shadow-lg border border-border">
        {label}
      </span>
    </span>
  )
}

interface RepuestosTableProps {
  repuestos: Repuesto[]
  loading?: boolean
  machineId?: string
  isAdmin?: boolean
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc'
  onToggleSort?: (column: string) => void
  onEdit?: (repuesto: Repuesto) => void
  onDelete?: (repuesto: Repuesto) => void
  onViewManual?: (repuesto: Repuesto) => void
  onViewPhotos?: (repuesto: Repuesto) => void
  onViewSpecs?: (repuesto: Repuesto) => void
  onViewGallery?: (repuesto: Repuesto) => void
  onRenameRepuesto?: (repuestoId: string, newName: string) => Promise<void>
  onSearchInManual?: (repuesto: Repuesto) => void
  onViewInManual?: (repuesto: Repuesto) => void
  onEditAnnotation?: (repuesto: Repuesto) => void
  onRelocate?: (repuesto: Repuesto) => void
  onViewDetail?: (repuesto: Repuesto) => void
  highlightedRepuestoId?: string | null
  favoriteIds?: Set<string>
  onToggleFavorite?: (repuestoId: string) => void
}

const formatNumber = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('es-CL') : '-';

function tipoBadgeClass(tipo: string): string {
  const t = tipo.toUpperCase()
  if (['RODAMIENTO', 'COJINETE'].includes(t)) return 'bg-primary/[0.15] text-primary'
  if (['SELLO/JUNTA', 'ANILLO'].includes(t)) return 'bg-green-500/[0.15] text-ink-ok'
  if (['MOTOR', 'BOMBA'].includes(t)) return 'bg-red-500/[0.15] text-ink-crit'
  if (['SENSOR', 'INTERRUPTOR', 'MÓDULO ELÉCT.', 'RELÉ', 'CONTACTOR', 'FUENTE ALIM.', 'TRANSFORMADOR', 'VARIADOR', 'HMI', 'PLC'].includes(t)) return 'bg-cat-6-tint/[0.15] text-cat-6-ink'
  if (['TORNILLERÍA', 'PERNO', 'TUERCA', 'PASADOR', 'ARANDELA', 'ABRAZADERA'].includes(t)) return 'bg-muted-foreground/[0.10] text-muted-foreground'
  if (['CORREA', 'CADENA', 'CINTA/BANDA'].includes(t)) return 'bg-cat-4-tint/[0.15] text-cat-4-ink'
  if (['VÁLVULA', 'CILINDRO NEUM.', 'NEUMÁTICA GEN.'].includes(t)) return 'bg-cat-7-tint/[0.15] text-cat-7-ink'
  if (['FILTRO', 'LUBRICACIÓN'].includes(t)) return 'bg-amber-500/[0.15] text-yellow-500'
  return 'bg-muted text-muted-foreground'
}

/** Thumbnail de la primera imagen disponible — click para carrusel, cajón vacío = upload */
function RepuestoThumbnail({ rep, onPreview, onOpenGallery }: {
  rep: Repuesto
  onPreview?: (url: string, name: string, allImages: { url: string }[]) => void
  onOpenGallery?: (rep: Repuesto) => void
}) {
  const allImages = [
    ...(rep.fotosReales || []),
    ...(rep.imagenesManual || []),
    ...(rep.gallery || []),
  ]
  const img = allImages[0]
  const totalImages = allImages.length

  if (!img) {
    // Cajón vacío — click abre galería para subir imágenes
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onOpenGallery?.(rep) }}
        className="h-11 w-11 rounded-card bg-muted/50 flex items-center justify-center shrink-0 border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
        title="Agregar imagen"
      >
        <Camera className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
      </button>
    )
  }
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onPreview?.(img.url, rep.textoBreve || rep.codigoSAP || 'Repuesto', allImages) }}
      className="relative h-11 w-11 rounded-card overflow-hidden shrink-0 ring-1 ring-border hover:ring-primary/50 transition-all cursor-pointer group"
    >
      <img
        src={img.url}
        alt=""
        className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-200"
        loading="lazy"
      />
      {totalImages > 1 && (
        <span className="absolute bottom-0 right-0 bg-black/70 text-white text-caption font-bold px-1 rounded-tl">
          +{totalImages - 1}
        </span>
      )}
    </button>
  )
}

/** Preview con carrusel + zoom + paneo — mismas capacidades que galería de equipo */
function QuickImagePreview({ url, name, allImages, onClose, onAddPhoto }: {
  url: string; name: string; allImages?: { url: string }[]; onClose: () => void
  onAddPhoto?: () => void
}) {
  const images = allImages && allImages.length > 0 ? allImages : [{ url }]
  const [idx, setIdx] = useState(() => {
    const i = images.findIndex(img => img.url === url)
    return i >= 0 ? i : 0
  })
  const [zoom, setZoom] = useState(1)
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const current = images[idx]
  if (!current) return null

  const resetView = () => { setZoom(1); setPanX(0); setPanY(0) }
  const goTo = (i: number) => { setIdx(i); resetView() }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
        {/* Cerrar */}
        <button onClick={onClose} className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-red-500 transition-colors">
          <X className="h-4 w-4" />
        </button>

        {/* Imagen con zoom + paneo */}
        <div
          className="overflow-hidden rounded-card max-h-[70vh] cursor-grab active:cursor-grabbing"
          onWheel={e => { e.preventDefault(); setZoom(z => Math.max(0.5, Math.min(5, z + (e.deltaY > 0 ? -0.3 : 0.3)))) }}
          onMouseMove={e => { if (e.buttons === 1 && zoom > 1) { setPanX(p => p + e.movementX); setPanY(p => p + e.movementY) } }}
        >
          <img
            src={current.url}
            alt={name}
            className="max-w-full max-h-[70vh] object-contain transition-transform"
            style={{ transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)` }}
            draggable={false}
          />
        </div>

        <div className="text-center mt-2 text-white/80 text-sm truncate">{name}</div>

        {/* Controles: carrusel + zoom */}
        <div className="flex items-center gap-3 mt-2">
          {images.length > 1 && (
            <button onClick={() => goTo((idx - 1 + images.length) % images.length)}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
              <ArrowUp className="h-4 w-4 -rotate-90" />
            </button>
          )}
          <span className="text-white/60 text-xs tabular-nums">{idx + 1} / {images.length}</span>
          <button onClick={() => { if (zoom < 2) { setZoom(2); setPanX(0); setPanY(0) } else resetView() }}
            className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
            <Eye className="h-4 w-4" />
          </button>
          {images.length > 1 && (
            <button onClick={() => goTo((idx + 1) % images.length)}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
              <ArrowDown className="h-4 w-4 -rotate-90" />
            </button>
          )}
        </div>

        {/* Thumbnails + agregar */}
        {(images.length > 1 || onAddPhoto) && (
          <div className="flex items-center gap-2 mt-3">
            {images.map((img, i) => (
              <button key={img.url} onClick={() => goTo(i)}
                className={`h-10 w-10 rounded-card overflow-hidden ring-2 transition-all ${idx === i ? 'ring-primary' : 'ring-transparent hover:ring-white/30'}`}>
                <img src={img.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
            {onAddPhoto && (
              <button onClick={onAddPhoto}
                className="h-10 w-10 rounded-card border-2 border-dashed border-white/20 hover:border-white/40 flex items-center justify-center text-white/40 hover:text-white/60 transition-colors">
                <Camera className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


/** Header de columna con sorting */
function SortableTh({
  column,
  label,
  sortColumn,
  sortDirection,
  onToggleSort,
  className = '',
}: {
  column: string
  label: string
  sortColumn?: string | null
  sortDirection?: 'asc' | 'desc'
  onToggleSort?: (column: string) => void
  className?: string
}) {
  const active = sortColumn === column
  return (
    <th
      className={`px-3 py-3 font-semibold ${className} ${onToggleSort ? 'cursor-pointer select-none hover:text-foreground transition-colors group/sort' : ''}`}
      onClick={() => onToggleSort?.(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {onToggleSort && (
          <span className="inline-flex">
            {active ? (
              sortDirection === 'asc' ? (
                <ArrowUp className="h-3 w-3 text-primary" />
              ) : (
                <ArrowDown className="h-3 w-3 text-primary" />
              )
            ) : (
              <ArrowUpDown className="h-3 w-3 opacity-0 group-hover/sort:opacity-40 transition-opacity" />
            )}
          </span>
        )}
      </span>
    </th>
  )
}


export function RepuestosTable({
  repuestos,
  loading,
  isAdmin,
  sortColumn,
  sortDirection,
  onToggleSort,
  onEdit,
  onDelete,
  onViewManual,
  onViewPhotos,
  onViewSpecs,
  onViewGallery,
  onSearchInManual,
  onViewInManual,
  onEditAnnotation,
  onRelocate,
  onViewDetail,
  highlightedRepuestoId,
  favoriteIds,
  onToggleFavorite,
}: RepuestosTableProps) {
  const [preview, setPreview] = useState<{ url: string; name: string; allImages?: { url: string }[]; rep?: Repuesto } | null>(null)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
          <span className="text-sm">Cargando repuestos...</span>
        </div>
      </div>
    );
  }

  if (repuestos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-card bg-muted gap-3">
        <Package className="h-10 w-10 text-muted-foreground/30" />
        <span>No hay repuestos en esta máquina.</span>
      </div>
    );
  }

  return (
    <>
      {/* Quick Image Preview Overlay */}
      {preview && (
        <QuickImagePreview url={preview.url} name={preview.name} allImages={preview.allImages} onClose={() => setPreview(null)}
          onAddPhoto={onViewGallery && preview.rep ? () => { const r = preview.rep!; setPreview(null); onViewGallery(r) } : undefined} />
      )}

      {/* Mobile Card View — compacto */}
      <div className="grid grid-cols-1 gap-2 sm:hidden">
        {repuestos.map((rep) => {
          const hasMedia = (rep.imagenesManual?.length || 0) + (rep.fotosReales?.length || 0) + (rep.gallery?.length || 0) > 0
          return (
            <div
              key={rep.id}
              id={`repuesto-${rep.id}`}
              onClick={() => onViewDetail?.(rep)}
              className={`bg-card border rounded-card p-3 transition-all active:scale-[0.99] ${highlightedRepuestoId === rep.id ? 'ring-2 ring-emerald-500 bg-emerald-500/[0.15]' : ''}`}
            >
              <div className="flex gap-2.5 items-start">
                {/* Thumbnail compacto */}
                {hasMedia && (
                  <RepuestoThumbnail rep={rep} onPreview={(url, name, imgs) => setPreview({ url, name, allImages: imgs, rep })} onOpenGallery={onViewGallery} />
                )}
                <div className="flex-1 min-w-0">
                  {/* Nombre + estrella favorito */}
                  <div className="flex items-center gap-1">
                    <p className="font-medium text-foreground text-footnote leading-tight line-clamp-1 flex-1">{rep.textoBreve || rep.descripcion || 'Sin nombre'}</p>
                    {onToggleFavorite && (
                      <button onClick={e => { e.stopPropagation(); onToggleFavorite(rep.id) }} className="shrink-0 p-0.5">
                        <Star className={`h-3.5 w-3.5 ${favoriteIds?.has(rep.id) ? 'text-ink-warn fill-yellow-400' : 'text-muted-foreground/20'}`} />
                      </button>
                    )}
                  </div>
                  {/* Badges inline */}
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <span className="text-caption font-mono text-primary bg-primary/[0.15] px-1 py-0 rounded-ctl">{rep.codigoSAP || 'S/C'}</span>
                    {rep.codigoFabricante && <span className="text-caption font-mono text-cat-6-ink bg-cat-6-tint/[0.15] px-1 py-0 rounded-ctl">{rep.codigoFabricante}</span>}
                    {rep.tipo && <span className={`text-caption px-1 py-0 rounded-ctl font-semibold uppercase ${tipoBadgeClass(rep.tipo)}`}>{rep.tipo}</span>}
                    {(rep as EquipmentRepuesto).source && (
                      <span className={`text-caption px-1 py-0 rounded-ctl font-medium ${(rep as EquipmentRepuesto).source === 'own' ? 'bg-emerald-500/[0.15] text-ink-ok' : 'bg-primary/[0.15] text-primary'}`}>
                        {(rep as EquipmentRepuesto).source === 'own' ? 'Propio' : 'Comp.'}
                      </span>
                    )}
                  </div>
                  {/* Valor + cantidad en 1 línea */}
                  <div className="flex items-center gap-3 mt-1">
                    {(rep.valorUnitario || 0) > 0 && <span className="text-caption font-semibold text-foreground">${formatNumber(rep.valorUnitario)}</span>}
                    {(rep.cantidadPorMaquina || 0) > 0 && <span className="text-caption text-primary">{rep.cantidadPorMaquina}/máq</span>}
                  </div>
                </div>
                {/* Menu acciones */}
                <div onClick={e => e.stopPropagation()}>
                  <RepuestoActionsMenu
                    repuesto={rep}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onViewManual={onViewManual}
                    onViewPhotos={onViewPhotos}
                    onViewSpecs={onViewSpecs}
                    onViewGallery={onViewGallery}
                    onSearchInManual={onSearchInManual}
                    onViewInManual={onViewInManual}
                    onRelocate={onRelocate}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block overflow-auto rounded-card border bg-card shadow-sm">
        <table className="min-w-full divide-y divide-border">
          <thead>
            <tr className="text-left text-caption tracking-wider text-muted-foreground bg-muted">
              <th className="pl-4 pr-2 py-3 font-semibold w-12"></th>
              <SortableTh column="codigoSAP" label="Código SAP" sortColumn={sortColumn} sortDirection={sortDirection} onToggleSort={onToggleSort} />
              <SortableTh column="textoBreve" label="Repuesto" sortColumn={sortColumn} sortDirection={sortDirection} onToggleSort={onToggleSort} />
              <SortableTh column="codigoFabricante" label="Cód. Fabricante" sortColumn={sortColumn} sortDirection={sortDirection} onToggleSort={onToggleSort} />
              <SortableTh column="cantidadPorMaquina" label="Cant/Máq" sortColumn={sortColumn} sortDirection={sortDirection} onToggleSort={onToggleSort} className="text-center" />
              <SortableTh column="valorUnitario" label="Valor Unit." sortColumn={sortColumn} sortDirection={sortDirection} onToggleSort={onToggleSort} className="text-right" />
              <SortableTh column="ubicacionEnPlanta" label="Ubicación" sortColumn={sortColumn} sortDirection={sortDirection} onToggleSort={onToggleSort} />
              <SortableTh column="observaciones" label="Observaciones" sortColumn={sortColumn} sortDirection={sortDirection} onToggleSort={onToggleSort} />
              <th className="px-3 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50 text-sm">
            {repuestos.map((rep, idx) => {
              const hasMedia = (rep.fotosReales?.length || 0) + (rep.imagenesManual?.length || 0) + (rep.gallery?.length || 0) > 0
              return (
                <tr
                  key={rep.id}
                  id={`repuesto-${rep.id}`}
                  className={`group hover:bg-primary/5 transition-colors ${idx % 2 === 0 ? '' : 'bg-muted/10'} ${highlightedRepuestoId === rep.id ? 'ring-2 ring-inset ring-emerald-500 bg-emerald-500/[0.15] animate-pulse' : ''}`}
                >
                  {/* Thumbnail */}
                  <td className="pl-4 pr-2 py-2.5">
                    <RepuestoThumbnail rep={rep} onPreview={(url, name, imgs) => setPreview({ url, name, allImages: imgs, rep })} onOpenGallery={onViewGallery} />
                  </td>
                  {/* Código SAP */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-ctl">
                      {rep.codigoSAP || '—'}
                    </span>
                  </td>
                  {/* Nombre y descripción */}
                  <td className="px-3 py-2.5 max-w-[300px]">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <button
                          onClick={() => onViewDetail?.(rep)}
                          className="font-medium text-foreground truncate text-left hover:text-primary hover:underline transition-colors cursor-pointer"
                          title="Ver ficha completa"
                        >{rep.textoBreve || rep.descripcion || 'Sin nombre'}</button>
                        {rep.descripcion && rep.descripcion !== (rep.textoBreve || '') ? (
                          <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{rep.descripcion}</div>
                        ) : null}
                        {rep.tipo && (
                          <span className={`inline-block text-caption px-1 py-0 rounded-ctl font-medium tracking-wide mt-0.5 ${tipoBadgeClass(rep.tipo)}`}>
                            {rep.tipo}
                          </span>
                        )}
                        {(rep as EquipmentRepuesto).source && (
                          <span className={`inline-block text-caption px-1 py-0 rounded-ctl font-medium tracking-wide mt-0.5 ml-1 ${(rep as EquipmentRepuesto).source === 'own' ? 'bg-emerald-500/[0.15] text-ink-ok' : 'bg-primary/[0.15] text-primary'}`}>
                            {(rep as EquipmentRepuesto).source === 'own' ? 'Propio' : 'Compartido'}
                          </span>
                        )}
                      </div>
                      {hasMedia && (
                        <ImageIcon className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                      )}
                      {onToggleFavorite && (
                        <button onClick={() => onToggleFavorite(rep.id)} className="shrink-0 p-0.5 rounded-ctl hover:bg-amber-500/[0.15] transition-colors">
                          <Star className={`h-3 w-3 ${favoriteIds?.has(rep.id) ? 'text-ink-warn fill-yellow-400' : 'text-muted-foreground/20 group-hover:text-muted-foreground/40'}`} />
                        </button>
                      )}
                    </div>
                  </td>
                  {/* Código fabricante */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {rep.codigoFabricante ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-ctl">
                          {rep.codigoFabricante}
                        </span>
                        {onSearchInManual && (
                          <button
                            onClick={() => onSearchInManual(rep)}
                            title="Buscar en manual de la máquina"
                            className="text-cat-6-ink/60 hover:text-purple-400 transition-colors"
                          >
                            <BookOpen className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  {/* Cantidad por máquina */}
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-mono text-sm">
                      {rep.cantidadPorMaquina || 0}
                    </span>
                  </td>
                  {/* Valor unitario */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span className="font-mono text-sm">
                      ${formatNumber(rep.valorUnitario || 0)}
                    </span>
                  </td>
                  {/* Ubicación */}
                  <td className="px-3 py-2.5 max-w-[150px]">
                    {rep.ubicacionEnPlanta ? (
                      <span className="text-xs text-muted-foreground truncate block" title={rep.ubicacionEnPlanta}>
                        {rep.ubicacionEnPlanta}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  {/* Observaciones */}
                  <td className="px-3 py-2.5 max-w-[200px]">
                    {rep.observaciones ? (
                      <div className="flex items-start gap-1">
                        <MessageSquareText className="h-3 w-3 text-ink-warn/60 shrink-0 mt-0.5" />
                        <span className="text-xs text-muted-foreground line-clamp-2" title={rep.observaciones}>
                          {rep.observaciones}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  {/* Acciones — botones inline con tooltips */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-0.5 flex-wrap">
                      {/* ── Ficha Técnica (separada) ── */}
                      {/* Ficha técnica y galería se acceden desde el thumbnail (izq) y nombre */}

                      {/* ── Manual ── */}
                      {onSearchInManual && rep.codigoFabricante && (
                        <Tip label="Buscar en Manual">
                          <button onClick={() => onSearchInManual(rep)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-ctl text-cat-6-ink/60 hover:text-purple-400 hover:bg-cat-6-tint/[0.15] transition-colors">
                            <BookOpen className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}
                      {onViewInManual && (rep.vinculosManual?.length ?? 0) > 0 && (
                        <Tip label="Ver en Manual">
                          <button onClick={() => onViewInManual(rep)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-ctl text-ink-ok/60 hover:text-green-400 hover:bg-green-500/[0.15] transition-colors">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}
                      {isAdmin && onEditAnnotation && (rep.vinculosManual?.length ?? 0) > 0 && (
                        <Tip label="Editar ubicación">
                          <button onClick={() => onEditAnnotation(rep)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-ctl text-ink-warn/60 hover:text-yellow-400 hover:bg-amber-500/[0.15] transition-colors">
                            <Pencil className="h-3 w-3" />
                          </button>
                        </Tip>
                      )}

                      {/* Separador visual */}
                      {(onEdit || onDelete) && (
                        <span className="w-px h-4 bg-border mx-0.5" />
                      )}

                      {/* ── Editar / Eliminar ── */}
                      {onEdit && (
                        <Tip label="Editar repuesto">
                          <button onClick={() => onEdit(rep)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-ctl text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 transition-colors">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}
                      {onRelocate && (
                        <Tip label="Reubicar">
                          <button onClick={() => onRelocate(rep)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-ctl text-ink-warn/60 hover:text-amber-400 hover:bg-amber-500/[0.15] transition-colors">
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}
                      {onDelete && (
                        <Tip label="Eliminar">
                          <button onClick={() => onDelete(rep)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-ctl text-destructive/40 hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </Tip>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
