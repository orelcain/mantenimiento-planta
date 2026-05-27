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

import { useState, useRef, useCallback } from 'react'
import {
  Package, MapPin, DollarSign, Hash, Tag,
  ClipboardList, Camera, BookOpen, MessageSquareText,
  Image as ImageIcon,
  Pencil, Check, X as XIcon, Warehouse, Plus, History, Download,
} from 'lucide-react'
import { doc, updateDoc, addDoc, collection, getDocs, query, where, limit } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { Dialog, DialogContent, Badge } from '@/components/ui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { Repuesto, ImagenRepuesto, MachineImage } from '@/types/repuestos'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store/authStore'

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
  const user = useAuthStore(s => s.user)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [editingAlias, setEditingAlias] = useState(false)
  const [aliasValue, setAliasValue] = useState(rep.alias || '')
  const [savingAlias, setSavingAlias] = useState(false)
  const aliasInputRef = useRef<HTMLInputElement>(null)
  const [editingTipo, setEditingTipo] = useState(false)
  const [tipoValue, setTipoValue] = useState(rep.tipo || '')
  const [savingTipo, setSavingTipo] = useState(false)
  const tipoInputRef = useRef<HTMLInputElement>(null)

  // ── Stock state ──────────────────────────────────────────────
  const [localStock, setLocalStock] = useState<number | undefined>(rep.stockFisico)
  const [localMin, setLocalMin] = useState<number | undefined>(rep.stockMinimo)
  const [editingMin, setEditingMin] = useState(false)
  const [minVal, setMinVal] = useState('')
  const [savingMin, setSavingMin] = useState(false)
  const [showConteo, setShowConteo] = useState(false)
  const [conteoVal, setConteoVal] = useState('')
  const [conteoObs, setConteoObs] = useState('')
  const [savingConteo, setSavingConteo] = useState(false)
  const [historial, setHistorial] = useState<{ cantidad: number; userName: string; ts: number; bajoMinimo: boolean | null; observaciones?: string }[]>([])
  const [showHistorial, setShowHistorial] = useState(false)
  const [loadingHistorial, setLoadingHistorial] = useState(false)

  const hasStock = localStock !== undefined || localMin !== undefined
  const isLow = localStock !== undefined && localMin !== undefined && localMin > 0 && localStock < localMin

  const colPath = (rep as any).sourceCollection || (machineId ? `machines/${machineId}/repuestos` : null)

  const saveMin = useCallback(async () => {
    const val = parseInt(minVal, 10)
    if (isNaN(val) || val < 0 || !colPath) return
    setSavingMin(true)
    try {
      await updateDoc(doc(db, `${colPath}/${rep.id}`), { stockMinimo: val, updatedAt: new Date() })
      setLocalMin(val)
      setEditingMin(false)
    } catch (err) {
      logger.error('Error guardando mínimo', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSavingMin(false)
    }
  }, [minVal, colPath, rep.id])

  const registrarConteo = useCallback(async () => {
    const val = parseInt(conteoVal, 10)
    if (isNaN(val) || val < 0 || !machineId || !colPath) return
    setSavingConteo(true)
    try {
      await updateDoc(doc(db, `${colPath}/${rep.id}`), {
        stockFisico: val,
        updatedAt: new Date(),
      })
      const obs = conteoObs.trim()
      const logEntry: Record<string, unknown> = {
        userId: user?.id || '',
        userName: user?.nombre || user?.email || 'usuario',
        machineId,
        machineName: machineName || machineId,
        repuestoId: rep.id,
        repuestoName: rep.textoBreve || rep.descripcion || rep.codigoSAP || '',
        codigoSAP: rep.codigoSAP || '',
        cantidad: val,
        stockMinimo: localMin ?? null,
        bajoMinimo: localMin !== undefined ? val < localMin : null,
        ts: Date.now(),
        source: 'pwa',
      }
      if (obs) logEntry.observaciones = obs
      await addDoc(collection(db, 'stockAuditLog'), logEntry)
      setLocalStock(val)
      setHistorial(prev => [{ cantidad: val, userName: String(logEntry.userName), ts: Number(logEntry.ts), bajoMinimo: logEntry.bajoMinimo as boolean | null, observaciones: obs || undefined }, ...prev].slice(0, 5))
      setShowConteo(false)
      setConteoVal('')
      setConteoObs('')
    } catch (err) {
      logger.error('Error registrando conteo', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSavingConteo(false)
    }
  }, [conteoVal, conteoObs, machineId, colPath, rep, user, machineName, localMin])

  const loadHistorial = useCallback(async () => {
    if (!machineId) return
    setLoadingHistorial(true)
    try {
      const q = query(collection(db, 'stockAuditLog'), where('repuestoId', '==', rep.id), limit(10))
      const snap = await getDocs(q)
      const entries = snap.docs
        .map(d => { const data = d.data(); return { cantidad: data.cantidad, userName: data.userName || '', ts: data.ts || 0, bajoMinimo: data.bajoMinimo ?? null, observaciones: data.observaciones || undefined } })
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 5)
      setHistorial(entries)
    } catch (err) {
      logger.warn('Error cargando historial stock')
    } finally {
      setLoadingHistorial(false)
    }
  }, [rep.id, machineId])

  const exportHistorialCSV = useCallback(() => {
    const name = rep.textoBreve || rep.descripcion || rep.codigoSAP || 'repuesto'
    const fecha = new Date().toLocaleDateString('es-CL').replace(/\//g, '-')
    const BOM = '﻿'
    const header = ['Fecha', 'Cantidad', 'Usuario', 'Bajo Mínimo', 'Observaciones', 'Equipo', 'SAP']
    const rows = historial.map(h => [
      new Date(h.ts).toLocaleString('es-CL'),
      h.cantidad,
      `"${h.userName.replace(/"/g, '""')}"`,
      h.bajoMinimo === true ? 'Sí' : h.bajoMinimo === false ? 'No' : '',
      `"${(h.observaciones || '').replace(/"/g, '""')}"`,
      `"${(machineName || '').replace(/"/g, '""')}"`,
      rep.codigoSAP || '',
    ].join(','))
    const csv = BOM + [header.join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `stock-${name.slice(0, 30).replace(/\s+/g, '-')}-${fecha}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [historial, rep, machineName])

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
  const allImages: { url: string; label: string; tipo: string }[] = []

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

            {/* ── Stock ── */}
            {hasStock && (
              <Section title="Stock" icon={Warehouse}>
                <div className="space-y-3">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className={`rounded-lg p-3 text-center ${isLow ? 'bg-red-500/10 border border-red-500/20' : 'bg-muted/20'}`}>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">En Bodega</div>
                      <div className={`text-2xl font-bold tabular-nums mt-0.5 ${isLow ? 'text-red-400' : 'text-foreground'}`}>
                        {localStock ?? '—'}
                      </div>
                      {isLow && <div className="text-[9px] text-red-400 font-medium mt-0.5">⚠ Bajo mínimo</div>}
                    </div>
                    <div className="bg-muted/20 rounded-lg p-3 text-center relative">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Mínimo</div>
                      {editingMin ? (
                        <div className="flex items-center gap-1 mt-1 justify-center">
                          <input
                            type="number" min={0} value={minVal}
                            onChange={e => setMinVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveMin(); if (e.key === 'Escape') setEditingMin(false) }}
                            autoFocus
                            className="w-16 h-8 rounded border border-primary/50 bg-background px-2 text-sm font-mono tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-primary/50"
                          />
                          <button onClick={saveMin} disabled={savingMin} className="h-8 w-8 flex items-center justify-center rounded bg-primary/20 hover:bg-primary/30 text-primary">
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={colPath ? () => { setMinVal(localMin !== undefined ? String(localMin) : ''); setEditingMin(true) } : undefined}
                          className={`text-2xl font-bold tabular-nums text-foreground mt-0.5 block w-full ${colPath ? 'hover:text-primary cursor-pointer transition-colors group' : ''}`}
                        >
                          {localMin ?? '—'}
                          {colPath && <Pencil className="h-2.5 w-2.5 inline ml-1 text-muted-foreground/30 group-hover:text-primary transition-colors" />}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Botón registrar conteo */}
                  {machineId && !showConteo && (
                    <button
                      onClick={() => { setShowConteo(true); setConteoVal(localStock !== undefined ? String(localStock) : '') }}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                      Registrar conteo
                    </button>
                  )}

                  {/* Formulario inline */}
                  {showConteo && (
                    <div className="bg-muted/20 rounded-lg p-3 space-y-2">
                      <div className="text-xs text-muted-foreground font-medium">Nueva cantidad en bodega</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          value={conteoVal}
                          onChange={e => setConteoVal(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Escape') setShowConteo(false) }}
                          placeholder="0"
                          autoFocus
                          className="flex-1 h-9 rounded-lg border border-border bg-background px-3 text-sm font-mono tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <button
                          onClick={registrarConteo}
                          disabled={savingConteo || !conteoVal}
                          className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:bg-primary/90 transition-colors"
                        >
                          {savingConteo ? '…' : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => { setShowConteo(false); setConteoObs('') }}
                          className="h-9 px-2 rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors"
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                      {localMin !== undefined && conteoVal !== '' && !isNaN(parseInt(conteoVal)) && (
                        <div className={`text-xs ${parseInt(conteoVal) < localMin ? 'text-red-400' : 'text-emerald-400'}`}>
                          {parseInt(conteoVal) < localMin ? `⚠ Quedará bajo el mínimo (${localMin})` : `✓ Sobre el mínimo (${localMin})`}
                        </div>
                      )}
                      <textarea
                        value={conteoObs}
                        onChange={e => setConteoObs(e.target.value)}
                        placeholder="Observaciones (opcional)"
                        maxLength={200}
                        rows={2}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                      />
                    </div>
                  )}

                  {/* Historial */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { if (!showHistorial) loadHistorial(); setShowHistorial(v => !v) }}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors flex-1"
                    >
                      <History className="h-3.5 w-3.5" />
                      {showHistorial ? 'Ocultar historial' : 'Ver historial de conteos'}
                    </button>
                    {historial.length > 0 && (
                      <button
                        onClick={exportHistorialCSV}
                        title="Descargar CSV"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        CSV
                      </button>
                    )}
                  </div>
                  {showHistorial && (
                    <div className="space-y-1">
                      {loadingHistorial && <div className="text-xs text-muted-foreground animate-pulse">Cargando…</div>}
                      {!loadingHistorial && historial.length === 0 && (
                        <div className="text-xs text-muted-foreground">Sin conteos registrados</div>
                      )}
                      {historial.map((h, i) => (
                        <div key={i} className="bg-muted/20 rounded-lg px-3 py-1.5 text-xs space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`font-bold tabular-nums ${h.bajoMinimo ? 'text-red-400' : 'text-emerald-400'}`}>
                              {h.bajoMinimo ? '⚠' : '✓'} {h.cantidad}
                            </span>
                            <span className="text-muted-foreground truncate">{h.userName}</span>
                            <span className="text-muted-foreground font-mono shrink-0">
                              {new Date(h.ts).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {h.observaciones && (
                            <div className="text-muted-foreground italic truncate">"{h.observaciones}"</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
            )}

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

      {/* Lightbox con pan+zoom (componente unificado @/components/ui/ImageLightbox) */}
      {lightboxIndex !== null && (
        <ImageLightbox
          photos={allImages.map(i => i.url)}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}
