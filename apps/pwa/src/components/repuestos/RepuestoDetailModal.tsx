/**
 * RepuestoDetailModal — Ficha completa de repuesto
 *
 * Muestra TODA la información de un repuesto en una sola vista:
 * - Datos principales (códigos, nombre, alias, descripción, observaciones)
 * - Valores (cantidad, valor unitario, ubicación)
 * - Ficha técnica (si existe)
 * - Galería de imágenes (fotos reales, manual, gallery)
 * - Vínculos al manual
 *
 * Permite editar el alias del repuesto (nombre común del técnico).
 * Accesible para TODOS los usuarios (no solo admin).
 */

import { useState, useRef, useEffect } from 'react'
import {
  X, Package, MapPin, DollarSign, Hash, Tag,
  ClipboardList, Camera, BookOpen, MessageSquareText,
  Image as ImageIcon, ChevronLeft, ChevronRight,
  Pencil, Check, X as XIcon,
} from 'lucide-react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { Dialog, DialogContent, Badge } from '@/components/ui'
import type { Repuesto, ImagenRepuesto, MachineImage } from '@/types/repuestos'
import { logger } from '@/lib/logger'

// ─── Helpers ────────────────────────────────────────────────

const formatCurrency = (v: number) =>
  Number.isFinite(v) ? `$${v.toLocaleString('es-CL')}` : '—'

const TECH_TYPE_LABELS: Record<string, string> = {
  motor: 'Motor Eléctrico',
  bomba: 'Bomba',
  reductor: 'Reductor',
  cinta: 'Cinta Transportadora',
  valvula: 'Válvula',
  sensor: 'Sensor / Instrumento',
  cilindro: 'Cilindro',
  compresor: 'Compresor',
  intercambiador: 'Intercambiador de Calor',
  filtro: 'Filtro',
  general: 'General',
  pump: 'Bomba',
  conveyor: 'Cinta',
}

// ─── Image Lightbox ─────────────────────────────────────────

interface LightboxImage {
  url: string
  label: string
  tipo: string
}

function ImageLightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: LightboxImage[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  // Precargar vecinas (debe estar antes de cualquier early return)
  useEffect(() => {
    [images[index - 1]?.url, images[index + 1]?.url].forEach(src => {
      if (src) { const i = new Image(); i.src = src }
    })
  }, [index, images])

  const img = images[index]
  if (!img) return null
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-3xl max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-3 -right-3 z-10 h-8 w-8 rounded-full bg-background/90 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>

        <img src={img.url} alt={img.label} className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-2xl" />

        <div className="flex items-center gap-4 mt-3">
          <button onClick={onPrev} disabled={images.length <= 1} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center">
            <div className="text-white/90 text-sm truncate max-w-[250px]">{img.label}</div>
            <div className="text-white/50 text-xs">{img.tipo} · {index + 1}/{images.length}</div>
          </div>
          <button onClick={onNext} disabled={images.length <= 1} className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white disabled:opacity-30 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Section component ──────────────────────────────────────

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Package; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string | number | undefined | null; mono?: boolean }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className={`text-sm text-foreground text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

// ─── Main Modal ─────────────────────────────────────────────

interface RepuestoDetailModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuesto: Repuesto
  machineName?: string
  machineId?: string
  onAliasUpdated?: (repuestoId: string, alias: string) => void
}

export function RepuestoDetailModal({
  open,
  onOpenChange,
  repuesto: rep,
  machineName,
  machineId,
  onAliasUpdated,
}: RepuestoDetailModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasValue, setAliasValue] = useState(rep.alias || '')
  const [savingAlias, setSavingAlias] = useState(false)
  const aliasInputRef = useRef<HTMLInputElement>(null)
  const [editingTipo, setEditingTipo] = useState(false)
  const [tipoValue, setTipoValue] = useState(rep.tipo || '')
  const [savingTipo, setSavingTipo] = useState(false)
  const tipoInputRef = useRef<HTMLInputElement>(null)

  const saveAlias = async () => {
    const colPath = (rep as any).sourceCollection || (machineId ? `machines/${machineId}/repuestos` : null)
    if (!colPath) return
    const trimmed = aliasValue.trim()
    setSavingAlias(true)
    try {
      await updateDoc(doc(db, `${colPath}/${rep.id}`), {
        alias: trimmed || null,
      })
      rep.alias = trimmed || undefined
      onAliasUpdated?.(rep.id, trimmed)
      setEditingAlias(false)
    } catch (err) {
      logger.error('Error saving alias', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSavingAlias(false)
    }
  }

  const saveTipo = async () => {
    // Determinar la colección correcta: sourceCollection (EquipmentRepuesto) o machines/{machineId}/repuestos
    const colPath = (rep as any).sourceCollection || (machineId ? `machines/${machineId}/repuestos` : null)
    if (!colPath) return
    const trimmed = tipoValue.trim().toUpperCase()
    setSavingTipo(true)
    try {
      await updateDoc(doc(db, `${colPath}/${rep.id}`), {
        tipo: trimmed || null,
      })
      ;(rep as any).tipo = trimmed || undefined
      setEditingTipo(false)
    } catch (err) {
      logger.error('Error saving tipo', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSavingTipo(false)
    }
  }

  // ── Collect all images ──
  const allImages: LightboxImage[] = []

  rep.fotosReales?.forEach((img: ImagenRepuesto) => {
    allImages.push({ url: img.url, label: img.descripcion || 'Foto real', tipo: 'Foto real' })
  })
  rep.imagenesManual?.forEach((img: ImagenRepuesto) => {
    allImages.push({ url: img.url, label: img.descripcion || 'Imagen del manual', tipo: 'Manual' })
  })
  rep.gallery?.forEach((img: MachineImage) => {
    const typeLabels: Record<string, string> = { plate: 'Placa', equipment: 'Equipo', part: 'Pieza', other: 'Otra' }
    allImages.push({ url: img.url, label: img.notes || typeLabels[img.type] || 'Galería', tipo: typeLabels[img.type] || 'Galería' })
  })

  // ── Technical specs ──
  const specs = rep.technicalSpecs
  const specEntries: { label: string; value: string }[] = []
  if (specs) {
    for (const [key, val] of Object.entries(specs.standardValues || {})) {
      if (val !== '' && val !== undefined && val !== null) {
        // Human-readable label from key (camelCase → Capitalized Words)
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
        specEntries.push({ label, value: String(val) })
      }
    }
    specs.customFields?.forEach((f) => {
      if (f.value) specEntries.push({ label: f.label, value: f.value })
    })
  }

  const hasImages = allImages.length > 0
  const hasSpecs = specEntries.length > 0 || specs?.notes

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto p-0 rounded-t-2xl sm:rounded-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-card border-b px-6 py-4">
            <div className="flex items-start gap-3">
              {/* Thumbnail */}
              {allImages[0] ? (
                <button
                  onClick={() => setLightboxIndex(0)}
                  className="h-14 w-14 rounded-xl overflow-hidden ring-1 ring-border hover:ring-primary/50 transition-all shrink-0 cursor-pointer"
                >
                  <img src={allImages[0].url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </button>
              ) : (
                <div className="h-14 w-14 rounded-xl bg-muted/50 flex items-center justify-center shrink-0 border border-dashed border-border">
                  <Package className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-foreground leading-tight line-clamp-2">
                  {rep.textoBreve || rep.descripcion || 'Sin nombre'}
                </h2>

                {/* Alias editable */}
                <div className="flex items-center gap-1.5 mt-1">
                  {editingAlias ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input
                        ref={aliasInputRef}
                        value={aliasValue}
                        onChange={e => setAliasValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveAlias(); if (e.key === 'Escape') setEditingAlias(false) }}
                        placeholder="Nombre común (ej: motor de corte)"
                        className="flex-1 min-w-0 h-7 text-xs bg-muted/50 border border-primary/30 rounded px-2 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder:text-muted-foreground/40"
                        autoFocus
                        disabled={savingAlias}
                      />
                      <button onClick={saveAlias} disabled={savingAlias} className="h-6 w-6 rounded flex items-center justify-center text-primary hover:bg-primary/10 transition-colors">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => { setEditingAlias(false); setAliasValue(rep.alias || '') }} className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted/50 transition-colors">
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {rep.alias ? (
                        <span className="text-xs text-primary/70 italic truncate">"{rep.alias}"</span>
                      ) : null}
                      {machineId && (
                        <button
                          onClick={() => { setAliasValue(rep.alias || ''); setEditingAlias(true) }}
                          className="flex items-center gap-0.5 text-[9px] text-muted-foreground/50 hover:text-primary transition-colors shrink-0"
                          title={rep.alias ? 'Editar alias' : 'Agregar nombre común'}
                        >
                          <Pencil className="h-2.5 w-2.5" />
                          {!rep.alias && <span>Agregar alias</span>}
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-1">
                  {rep.codigoSAP && (
                    <Badge variant="secondary" className="text-[10px] font-mono">{rep.codigoSAP}</Badge>
                  )}
                  {rep.codigoFabricante && (
                    <Badge variant="secondary" className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border-blue-500/20">
                      Fab: {rep.codigoFabricante}
                    </Badge>
                  )}
                  {machineName && (
                    <Badge variant="outline" className="text-[10px]">{machineName}</Badge>
                  )}
                  {specs && (
                    <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                      {TECH_TYPE_LABELS[specs.type] || specs.type}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-6">

            {/* ── Datos generales ── */}
            <Section title="Información General" icon={Tag}>
              <div className="bg-muted/20 rounded-lg p-3 space-y-0">
                <InfoRow label="Código SAP" value={rep.codigoSAP} mono />
                <InfoRow label="Código Fabricante" value={rep.codigoFabricante} mono />
                {rep.alias && <InfoRow label="Alias (nombre común)" value={rep.alias} />}
                <InfoRow label="N° Serie equipo" value={rep.numeroSerie} mono />
                <InfoRow label="Nombre Manual" value={rep.nombreManual} />
                {rep.descripcion && (
                  <div className="py-1.5 border-b border-border/30">
                    <span className="text-xs text-muted-foreground block mb-0.5">Descripción</span>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{rep.descripcion}</p>
                  </div>
                )}
                <InfoRow label="Posición en diagrama" value={rep.posicionManual} mono />
                {/* Tipo — editable */}
                <div className="py-1.5 border-b border-border/30 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Tipo</span>
                  {editingTipo ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        ref={tipoInputRef}
                        value={tipoValue}
                        onChange={e => setTipoValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveTipo(); if (e.key === 'Escape') setEditingTipo(false) }}
                        placeholder="Ej: SENSOR, ANILLO, CORREA"
                        className="h-6 px-2 text-xs rounded border border-primary/50 bg-background text-foreground uppercase placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 w-40"
                        autoFocus
                      />
                      <button onClick={saveTipo} disabled={savingTipo} className="h-6 w-6 flex items-center justify-center rounded bg-primary/20 hover:bg-primary/30 text-primary">
                        <Check className="h-3 w-3" />
                      </button>
                      <button onClick={() => setEditingTipo(false)} className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/50 text-muted-foreground">
                        <XIcon className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setTipoValue(rep.tipo || ''); setEditingTipo(true); setTimeout(() => tipoInputRef.current?.focus(), 50) }}
                      className="flex items-center gap-1 text-sm text-foreground hover:text-primary transition-colors group"
                    >
                      <span>{rep.tipo || <span className="text-muted-foreground/50">Sin tipo</span>}</span>
                      <Pencil className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                    </button>
                  )}
                </div>
              </div>
            </Section>

            {/* ── Valores ── */}
            <Section title="Valores y Ubicación" icon={DollarSign}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-muted/20 rounded-lg p-3 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Valor Unitario</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">{formatCurrency(rep.valorUnitario || 0)}</div>
                </div>
                <div className="bg-muted/20 rounded-lg p-3 text-center">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Cant / Máquina</div>
                  <div className="text-lg font-bold text-foreground mt-0.5">
                    <Hash className="h-3.5 w-3.5 inline mr-0.5 text-muted-foreground" />
                    {rep.cantidadPorMaquina || 0}
                  </div>
                </div>
                {rep.ubicacionEnPlanta && (
                  <div className="bg-muted/20 rounded-lg p-3 text-center col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Ubicación</div>
                    <div className="text-sm font-medium text-foreground mt-0.5 flex items-center justify-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {rep.ubicacionEnPlanta}
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Observaciones ── */}
            {rep.observaciones && (
              <Section title="Observaciones" icon={MessageSquareText}>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{rep.observaciones}</p>
                </div>
              </Section>
            )}

            {/* ── Ficha Técnica ── */}
            {hasSpecs && (
              <Section title="Ficha Técnica" icon={ClipboardList}>
                <div className="bg-muted/20 rounded-lg p-3 space-y-0">
                  {specEntries.map((entry, i) => (
                    <InfoRow key={i} label={entry.label} value={entry.value} />
                  ))}
                </div>
                {specs?.notes && (
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mt-2">
                    <span className="text-[10px] text-muted-foreground block mb-1">Notas técnicas</span>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{specs.notes}</p>
                  </div>
                )}
              </Section>
            )}

            {/* ── Galería de imágenes ── */}
            {hasImages && (
              <Section title={`Imágenes (${allImages.length})`} icon={Camera}>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {allImages.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setLightboxIndex(idx)}
                      className="relative aspect-square rounded-lg overflow-hidden ring-1 ring-border hover:ring-primary/50 transition-all group cursor-pointer"
                    >
                      <img src={img.url} alt={img.label} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200" loading="lazy" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1">
                        <span className="text-[9px] text-white/90 line-clamp-1">{img.tipo}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Vínculos al manual ── */}
            {(rep.vinculosManual?.length ?? 0) > 0 && (
              <Section title={`Vínculos al Manual (${rep.vinculosManual!.length})`} icon={BookOpen}>
                <div className="space-y-1">
                  {rep.vinculosManual!.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2">
                      <BookOpen className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      <span className="text-xs text-foreground">
                        Página {v.pagina || '—'}
                        {v.descripcion ? ` — ${v.descripcion}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ── Sin información ── */}
            {!hasImages && !hasSpecs && !rep.observaciones && !rep.descripcion && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <ImageIcon className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm">Este repuesto aún no tiene información adicional.</p>
              </div>
            )}

          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={allImages}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((prev) => (prev! - 1 + allImages.length) % allImages.length)}
          onNext={() => setLightboxIndex((prev) => (prev! + 1) % allImages.length)}
        />
      )}
    </>
  )
}
