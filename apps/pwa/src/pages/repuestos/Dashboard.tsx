import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { AlertTriangle, Plus, FileText, Upload, Package, ArrowRightLeft, Copy as CopyDuplicateIcon, Globe, ExternalLink, Search, X, WifiOff, Star, ChevronDown, Camera, ChevronLeft, ChevronRight as ChevronRightIcon, ZoomIn, Trash2, History, Pencil } from 'lucide-react'
import { uploadEquipmentPhoto, deleteEquipmentPhoto, listEquipmentPhotos } from '@/services/storage'
import { RepuestosTable } from '@/components/repuestos/RepuestosTable'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { RepuestosPagination } from '@/components/repuestos/RepuestosPagination'
import { EmptyState } from '@/components/repuestos/EmptyState'
import { EquipmentNavigator, type SelectedEquipmentInfo } from '@/components/repuestos/EquipmentNavigator'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { TechnicalSpecsModal } from '@/components/repuestos/TechnicalSpecsModal'
import { RepuestoGalleryModal } from '@/components/repuestos/RepuestoGalleryModal'
import { RepuestoDetailModal } from '@/components/repuestos/RepuestoDetailModal'

import { ManualSearchModal } from '@/components/repuestos/ManualSearchModal'
import { MachineManualPanel } from '@/components/repuestos/MachineManualPanel'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRepuestos } from '@/hooks/repuestos/useRepuestos'
import { useEquipmentRepuestos } from '@/hooks/repuestos/useEquipmentRepuestos'
import { useRepuestosCounts } from '@/hooks/repuestos/useRepuestosCounts'
import { useMachineCategories } from '@/hooks/repuestos/useMachineCategories'
import { useToast } from '@/hooks/useToast'
import { useMachineContext, useCurrentMachine } from '@/contexts/MachineContext'
import { useAuthStore, useIsAdmin } from '@/store/authStore'
import type { Repuesto, EquipmentRepuesto, RepuestoFormData, TechnicalSpecs, MachineImage } from '@/types/repuestos'
import { normalizeForSearch } from '@/utils/repuestos'
// CategoryManager ahora se renderiza dentro de EquipmentNavigator
import { ImportRepuestosModal } from './ImportRepuestosModal'
import { ExportReportModal } from '@/components/repuestos/ExportReportModal'
import { RelocateRepuestoModal } from '@/components/repuestos/RelocateRepuestoModal'
import { BulkRelocateModal } from '@/components/repuestos/BulkRelocateModal'
import { DuplicatesModal } from '@/components/repuestos/DuplicatesModal'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { TrashPanel } from '@/components/repuestos/TrashPanel'
import { AuditLogPanel } from '@/components/repuestos/AuditLogPanel'
import { getTrashCount } from '@/services/auditLog'
import { getHmiTooltipPwd } from '@/services/hmiKnuro'
import { getRepuestoFavLists, saveRepuestoFavLists, type RepuestoFavList } from '@/services/userPreferences'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  LoadingScreen,
} from '@/components/ui'
import { logger } from '@/lib/logger'

interface RepuestosDashboardProps {
  /** ID de máquina a auto-seleccionar al montar (viene desde BuscadorGlobal → "Ver en equipo") */
  jumpMachineId?: string | null
  /** Llamado una vez que el jumpMachineId fue consumido, para limpiar el dot indicator */
  onJumpConsumed?: () => void
  /** Llamado cuando el usuario quiere buscar en todas las máquinas con una query */
  onSearchSimilar?: (query: string) => void
}

// ══════════════════════════════════════════════
//  Galería de fotos del equipo (header)
// ══════════════════════════════════════════════

function EquipmentHeaderPhoto({ equipmentId }: { equipmentId: string }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState<{ idx: number; zoom: number; panX: number; panY: number } | null>(null)
  const isAdmin = useIsAdmin()

  useEffect(() => {
    listEquipmentPhotos(equipmentId).then(setPhotos).catch(() => setPhotos([]))
  }, [equipmentId])

  const handleUpload = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadEquipmentPhoto(equipmentId, file)
      setPhotos(prev => [...prev, url])
    } catch (err) {
      logger.error('Error uploading equipment photo', err instanceof Error ? err : new Error(String(err)))
    }
    setUploading(false)
  }

  const handleDelete = async (url: string) => {
    if (!confirm('¿Eliminar esta foto?')) return
    await deleteEquipmentPhoto(url)
    setPhotos(prev => prev.filter(p => p !== url))
    setLightbox(null)
  }

  const mainPhoto = photos[0]

  return (
    <>
      {/* Thumbnail o upload */}
      {mainPhoto ? (
        <button
          onClick={() => setLightbox({ idx: 0, zoom: 1, panX: 0, panY: 0 })}
          className="relative h-12 w-12 sm:h-14 sm:w-14 rounded-xl overflow-hidden shrink-0 ring-1 ring-border hover:ring-primary/50 transition-all cursor-pointer group"
        >
          <img src={mainPhoto} alt="" className="h-full w-full object-cover group-hover:scale-110 transition-transform" loading="lazy" />
          {photos.length > 1 && (
            <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] font-bold px-1 rounded-tl">+{photos.length - 1}</span>
          )}
        </button>
      ) : (
        <label className={`h-12 w-12 sm:h-14 sm:w-14 rounded-xl flex items-center justify-center shrink-0 border-2 border-dashed transition-all ${
          uploading ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer'
        }`}>
          {uploading ? (
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <Camera className="h-5 w-5 text-muted-foreground/40 hover:text-primary/60 transition-colors" />
          )}
          {!uploading && (
            <input type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
          )}
        </label>
      )}

      {/* Lightbox con carrusel + zoom + paneo */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setLightbox(null)}>
          <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
            {/* Cerrar */}
            <button onClick={() => setLightbox(null)} className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center text-white hover:bg-red-500 transition-colors">
              <X className="h-4 w-4" />
            </button>

            {/* Imagen con zoom */}
            <div className="overflow-hidden rounded-xl max-h-[75vh] cursor-grab active:cursor-grabbing"
              onWheel={e => { e.preventDefault(); setLightbox(prev => prev ? { ...prev, zoom: Math.max(0.5, Math.min(5, prev.zoom + (e.deltaY > 0 ? -0.3 : 0.3))) } : null) }}
              onMouseMove={e => { if (e.buttons === 1 && lightbox.zoom > 1) setLightbox(prev => prev ? { ...prev, panX: prev.panX + e.movementX, panY: prev.panY + e.movementY } : null) }}
            >
              <img
                src={photos[lightbox.idx]}
                alt=""
                className="max-w-full max-h-[75vh] object-contain transition-transform"
                style={{ transform: `scale(${lightbox.zoom}) translate(${lightbox.panX / lightbox.zoom}px, ${lightbox.panY / lightbox.zoom}px)` }}
                draggable={false}
              />
            </div>

            {/* Controles */}
            <div className="flex items-center gap-3 mt-3">
              {photos.length > 1 && (
                <button onClick={() => setLightbox(prev => prev ? { ...prev, idx: (prev.idx - 1 + photos.length) % photos.length, zoom: 1, panX: 0, panY: 0 } : null)}
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronLeft className="h-4 w-4" /></button>
              )}
              <span className="text-white/60 text-xs tabular-nums">{lightbox.idx + 1} / {photos.length}</span>
              <button onClick={() => setLightbox(prev => prev ? { ...prev, zoom: prev.zoom < 2 ? 2 : 1, panX: 0, panY: 0 } : null)}
                className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ZoomIn className="h-4 w-4" /></button>
              {photos.length > 1 && (
                <button onClick={() => setLightbox(prev => prev ? { ...prev, idx: (prev.idx + 1) % photos.length, zoom: 1, panX: 0, panY: 0 } : null)}
                  className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"><ChevronRightIcon className="h-4 w-4" /></button>
              )}
            </div>

            {/* Thumbnails + upload + delete */}
            <div className="flex items-center gap-2 mt-3">
              {photos.map((url, i) => (
                <button key={url} onClick={() => setLightbox(prev => prev ? { ...prev, idx: i, zoom: 1, panX: 0, panY: 0 } : null)}
                  className={`h-12 w-12 rounded-lg overflow-hidden ring-2 transition-all ${lightbox.idx === i ? 'ring-primary' : 'ring-transparent hover:ring-white/30'}`}>
                  <img src={url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {/* Upload más */}
              {isAdmin && (
                <label className="h-12 w-12 rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 flex items-center justify-center cursor-pointer transition-colors">
                  <Plus className="h-4 w-4 text-white/40" />
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }} />
                </label>
              )}
              {/* Delete current */}
              {isAdmin && (
                <button onClick={() => handleDelete(photos[lightbox.idx]!)}
                  className="h-8 px-3 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 text-[10px] font-medium transition-colors ml-2">
                  Eliminar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════
//  Panel de chips favoritos — drag & drop + colapsar
// ══════════════════════════════════════════════

const FAV_LISTS_KEY = 'equipment-favorite-lists'
const FAV_COLLAPSED_KEY = 'equipment-favorite-collapsed'

function FavChipsPanel({ favMachines, currentMachineId, onSelect }: {
  favMachines: Map<string, { nombre: string; equipmentId: string; listName?: string }>
  currentMachineId?: string
  onSelect: (machineId: string, equipmentId: string, nombre: string) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try { const raw = localStorage.getItem(FAV_COLLAPSED_KEY); return raw ? new Set(JSON.parse(raw)) : new Set() } catch { return new Set() }
  })
  const [dragItem, setDragItem] = useState<{ listName: string; idx: number } | null>(null)
  const [dragOver, setDragOver] = useState<{ listName: string; idx: number } | null>(null)
  const [orderVersion, setOrderVersion] = useState(0)

  // Agrupar por lista manteniendo orden del localStorage
  const byList = useMemo(() => {
    const map = new Map<string, { machineId: string; nombre: string; equipmentId: string }[]>()
    for (const [machineId, info] of favMachines) {
      const listName = info.listName || 'Favoritos'
      const arr = map.get(listName) || []
      arr.push({ machineId, nombre: info.nombre, equipmentId: info.equipmentId })
      map.set(listName, arr)
    }
    // Aplicar orden guardado en localStorage
    try {
      const raw = localStorage.getItem(FAV_LISTS_KEY)
      if (raw) {
        const lists: { name: string; machineIds: string[] }[] = JSON.parse(raw)
        for (const list of lists) {
          const items = map.get(list.name)
          if (items) {
            items.sort((a, b) => {
              const ai = list.machineIds.indexOf(a.machineId)
              const bi = list.machineIds.indexOf(b.machineId)
              return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
            })
          }
        }
      }
    } catch { /* noop */ }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favMachines, orderVersion])

  const toggleCollapse = (listName: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(listName)) { next.delete(listName) } else { next.add(listName) }
      localStorage.setItem(FAV_COLLAPSED_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const handleDragStart = (listName: string, idx: number) => {
    setDragItem({ listName, idx })
  }

  const handleDragOver = (e: React.DragEvent, listName: string, idx: number) => {
    e.preventDefault()
    setDragOver({ listName, idx })
  }

  const handleDrop = (listName: string, dropIdx: number) => {
    if (!dragItem || dragItem.listName !== listName) { setDragItem(null); setDragOver(null); return }
    const items = byList.get(listName)
    if (!items) return

    // Reordenar en localStorage + Firestore
    try {
      const raw = localStorage.getItem(FAV_LISTS_KEY)
      if (raw) {
        const lists: { name: string; machineIds: string[] }[] = JSON.parse(raw)
        const list = lists.find(l => l.name === listName)
        if (list) {
          const currentOrder = items.map(i => i.machineId)
          const [moved] = currentOrder.splice(dragItem.idx, 1)
          if (moved) {
            currentOrder.splice(dropIdx, 0, moved)
            list.machineIds = currentOrder
            localStorage.setItem(FAV_LISTS_KEY, JSON.stringify(lists))
            // Persistir en Firestore
            try {
              const parsed = JSON.parse(localStorage.getItem('auth-storage') || '{}')
              const uid = parsed?.state?.user?.id
              if (uid) {
                import('@/services/userPreferences').then(({ saveFavoriteLists }) => {
                  saveFavoriteLists(uid, lists)
                })
              }
            } catch { /* noop */ }
          }
        }
      }
    } catch { /* noop */ }
    setDragItem(null)
    setDragOver(null)
    setOrderVersion(v => v + 1)
  }

  return (
    <div className="border-t border-border/30 pt-3 mt-1 space-y-1">
      {[...byList.entries()].map(([listName, items]) => {
        const isCollapsed = collapsed.has(listName)
        return (
          <div key={listName}>
            <button
              onClick={() => toggleCollapse(listName)}
              className="text-[9px] text-yellow-400/70 font-semibold uppercase shrink-0 flex items-center gap-1 hover:text-yellow-400 transition-colors mb-1"
            >
              <Star className="h-3 w-3 fill-yellow-400/50" />
              {listName}
              <span className="text-muted-foreground/40">({items.length})</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
            </button>
            {!isCollapsed && (
              <div className="flex items-center gap-1.5 overflow-x-auto sm:flex-wrap ml-4 pb-1 no-scrollbar">
                {items.map(({ machineId, nombre, equipmentId }, idx) => {
                  const isActive = currentMachineId === machineId
                  const isDragTarget = dragOver?.listName === listName && dragOver.idx === idx
                  return (
                    <button
                      key={machineId}
                      draggable
                      onDragStart={() => handleDragStart(listName, idx)}
                      onDragOver={e => handleDragOver(e, listName, idx)}
                      onDrop={() => handleDrop(listName, idx)}
                      onDragEnd={() => { setDragItem(null); setDragOver(null) }}
                      onClick={() => onSelect(machineId, equipmentId, nombre)}
                      className={[
                        'text-[10px] font-medium px-2.5 py-1 rounded-lg border transition-all cursor-grab active:cursor-grabbing whitespace-nowrap shrink-0 sm:shrink',
                        isActive
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-muted/20 border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                        isDragTarget ? 'ring-2 ring-primary/40 scale-105' : '',
                      ].join(' ')}
                    >
                      {nombre}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════
//  KPI Strip con desglose independiente por KPI
// ══════════════════════════════════════════════

function KpiStrip({ repuestos, filteredRepuestos, totalCatalogo, conSAP, conStock, valorTotal, kpiFilter, setKpiFilter, filterTipo, setFilterTipo }: {
  repuestos: Repuesto[]
  filteredRepuestos: Repuesto[]
  totalCatalogo: number
  conSAP: number
  conStock: number
  valorTotal: number
  kpiFilter: string | null
  setKpiFilter: (v: string | null) => void
  filterTipo: string | null
  setFilterTipo: (v: string | null) => void
}) {
  const [desglosePages, setDesglosePages] = useState<Record<string, number>>({})

  if (totalCatalogo === 0) return null

  const sinSAP = totalCatalogo - conSAP
  const conFicha = repuestos.filter(r => r.technicalSpecs).length
  const conFoto = repuestos.filter(r => (r.fotosReales?.length || 0) + (r.imagenesManual?.length || 0) + (r.gallery?.length || 0) > 0).length
  const tiposUnicos = new Set(repuestos.map(r => r.tipo).filter(Boolean)).size
  const coberturaPct = totalCatalogo > 0 ? Math.round((conSAP / totalCatalogo) * 100) : 0

  const kpis: { key: string; label: string; value: string | number; color: string; accent: string }[] = [
    { key: 'total', label: 'Total', value: totalCatalogo, color: 'text-foreground', accent: 'border-border/40' },
    { key: 'conSAP', label: 'Con SAP', value: conSAP, color: 'text-blue-400', accent: 'border-blue-500/40' },
    { key: 'sinSAP', label: 'Sin SAP', value: sinSAP, color: 'text-orange-400', accent: 'border-orange-500/40' },
    { key: 'conStock', label: 'Con stock', value: conStock, color: 'text-emerald-400', accent: 'border-emerald-500/40' },
    { key: 'conFicha', label: 'Con ficha', value: conFicha, color: 'text-cyan-400', accent: 'border-cyan-500/40' },
    { key: 'conFoto', label: 'Con foto', value: conFoto, color: 'text-amber-400', accent: 'border-amber-500/40' },
    { key: 'tipos', label: 'Tipos', value: tiposUnicos, color: 'text-indigo-400', accent: 'border-indigo-500/40' },
    { key: 'valor', label: 'Valor ref.', value: `$${valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`, color: 'text-violet-400', accent: 'border-violet-500/40' },
  ]

  // Filterable KPIs (click filtra la tabla)
  const filterableKeys = new Set(['conSAP', 'sinSAP', 'conStock', 'conFicha', 'conFoto'])

  // Desglose data builder per KPI
  const buildDesglose = (key: string) => {
    const source = filterableKeys.has(key) ? filteredRepuestos : repuestos
    const tipoFreq: Record<string, number> = {}
    for (const r of source) { tipoFreq[r.tipo || 'SIN TIPO'] = (tipoFreq[r.tipo || 'SIN TIPO'] || 0) + 1 }
    const byTipo = Object.entries(tipoFreq).sort((a, b) => b[1] - a[1])

    if (key === 'valor') {
      const valorPorTipo = new Map<string, number>()
      for (const r of repuestos) {
        const t = r.tipo || 'SIN TIPO'
        valorPorTipo.set(t, (valorPorTipo.get(t) || 0) + (r.valorUnitario || 0) * (r.cantidadPorMaquina || 0))
      }
      return { type: 'valor' as const, entries: [...valorPorTipo.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]) }
    }
    return { type: 'tipo' as const, entries: byTipo }
  }

  const handleKpiClick = (key: string) => {
    if (kpiFilter === key) {
      setKpiFilter(null)
    } else {
      setKpiFilter(key)
      setDesglosePages(prev => ({ ...prev, [key]: 1 }))
    }
  }

  return (
    <>
      {/* Barra cobertura SAP */}
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[9px] text-muted-foreground uppercase shrink-0">Cobertura SAP</span>
        <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${coberturaPct >= 50 ? 'bg-emerald-500' : coberturaPct >= 20 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${coberturaPct}%` }}
          />
        </div>
        <span className={`text-xs font-bold tabular-nums ${coberturaPct >= 50 ? 'text-emerald-400' : coberturaPct >= 20 ? 'text-amber-400' : 'text-red-400'}`}>
          {coberturaPct}%
        </span>
      </div>

      {/* KPIs grid */}
      <div className="grid grid-cols-3 sm:grid-cols-8 gap-1.5">
        {kpis.map(k => {
          const isActive = kpiFilter === k.key
          return (
            <button
              key={k.key}
              onClick={() => handleKpiClick(k.key)}
              className={[
                'rounded-lg px-2 py-1.5 text-left transition-all cursor-pointer hover:bg-muted/30',
                isActive ? `bg-primary/10 border-2 ${k.accent} ring-1 ring-primary/20` : 'bg-muted/15 border border-border/40',
              ].join(' ')}
            >
              <p className={`text-sm sm:text-base font-bold tabular-nums leading-tight ${isActive ? 'text-primary' : k.color}`}>{k.value}</p>
              <p className="text-[7px] sm:text-[8px] text-muted-foreground uppercase leading-tight">{k.label}</p>
            </button>
          )
        })}
      </div>

      {/* Panel desglose independiente por KPI */}
      {kpiFilter && (() => {
        const desglose = buildDesglose(kpiFilter)
        const activeKpi = kpis.find(k => k.key === kpiFilter)
        const page = desglosePages[kpiFilter] || 1
        const PAGE_SIZE = 10
        const visibleCount = page * PAGE_SIZE
        const visibleEntries = desglose.entries.slice(0, visibleCount)
        const hasMore = desglose.entries.length > visibleCount
        const showing = filterableKeys.has(kpiFilter) ? filteredRepuestos.length : repuestos.length

        return (
          <div className="mt-2 bg-muted/10 border border-border/40 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                {activeKpi?.label}: {showing} {desglose.type === 'valor' ? 'tipos con valor' : 'repuestos'}
              </p>
              <button onClick={() => setKpiFilter(null)} className="text-[9px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted/30">
                Cerrar
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {desglose.type === 'valor' ? (
                visibleEntries.map(([tipo, val]) => (
                  <button
                    key={tipo}
                    onClick={() => setFilterTipo(filterTipo === tipo ? null : tipo)}
                    className={`text-[9px] px-2 py-0.5 rounded-full border tabular-nums transition-all cursor-pointer ${
                      filterTipo === tipo
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-200 font-bold'
                        : 'bg-violet-500/10 border-violet-500/20 text-violet-300 hover:border-violet-400/40'
                    }`}
                  >
                    {tipo} <strong>${(val as number).toLocaleString('es-CL', { maximumFractionDigits: 0 })}</strong>
                  </button>
                ))
              ) : (
                visibleEntries.map(([tipo, count]) => (
                  <button
                    key={tipo}
                    onClick={() => setFilterTipo(filterTipo === tipo ? null : tipo)}
                    className={`text-[9px] px-2 py-0.5 rounded-full border tabular-nums transition-all cursor-pointer ${
                      filterTipo === tipo
                        ? 'bg-primary/15 border-primary/40 text-primary font-bold'
                        : 'bg-muted/30 border-border/30 text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    {tipo} <strong className={filterTipo === tipo ? '' : 'text-foreground'}>{count}</strong>
                  </button>
                ))
              )}
            </div>

            {hasMore && (
              <button
                onClick={() => setDesglosePages(prev => ({ ...prev, [kpiFilter]: page + 1 }))}
                className="text-[10px] text-primary hover:text-primary/80 font-medium transition-colors"
              >
                Ver + ({desglose.entries.length - visibleCount} más)
              </button>
            )}
          </div>
        )
      })()}
    </>
  )
}

export function RepuestosDashboard({
  jumpMachineId,
  onJumpConsumed,
  onSearchSimilar,
}: RepuestosDashboardProps = {}) {
  const { machines, loading: machinesLoading, setCurrentMachine } = useMachineContext()
  const currentMachine = useCurrentMachine()
  const currentUser = useAuthStore((state) => state.user)
  const isAdmin = useIsAdmin()
  const { categories } = useMachineCategories()
  const { toast } = useToast()
  const isOnline = useOnlineStatus()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Repuesto | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Repuesto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [photoModal, setPhotoModal] = useState<Repuesto | null>(null)
  const [manualModal, setManualModal] = useState<Repuesto | null>(null)
  const [specsTarget, setSpecsTarget] = useState<Repuesto | null>(null)
  const [galleryTarget, setGalleryTarget] = useState<Repuesto | null>(null)
  const [exportReportOpen, setExportReportOpen] = useState(false)
  const [manualSearchTarget, setManualSearchTarget] = useState<Repuesto | null>(null)
  const [viewInManualTarget, setViewInManualTarget] = useState<Repuesto | null>(null)
  const [relocateTarget, setRelocateTarget] = useState<Repuesto | null>(null)
  const [bulkRelocateOpen, setBulkRelocateOpen] = useState(false)
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState<Repuesto | null>(null)
  const [highlightedRepuestoId, setHighlightedRepuestoId] = useState<string | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHighlightRef = useRef<string | null>(null)
  const hasHydratedPrefsRef = useRef(false)
  const [, setSelectedCategoryId] = useState<string | null>('maquinas-principales')
  const [selectedEquipmentInfo, setSelectedEquipmentInfo] = useState<SelectedEquipmentInfo | null>(null)
  const equipmentDetailRef = useRef<HTMLDivElement | null>(null)
  const [favMachines, setFavMachines] = useState<Map<string, { nombre: string; equipmentId: string; listName?: string }>>(new Map())

  // ── Audit Log + Papelera ──
  const [trashOpen, setTrashOpen] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [trashCount, setTrashCount] = useState(0)
  useEffect(() => {
    if (isAdmin) getTrashCount().then(setTrashCount)
  }, [isAdmin, trashOpen])

  // ── Repuestos favoritos por equipo ──
  const [repFavLists, setRepFavLists] = useState<RepuestoFavList[]>([])
  const [activeFavListName, setActiveFavListName] = useState<string | null>(null)
  const [editingFavList, setEditingFavList] = useState<string | null>(null)
  const [editFavClave, setEditFavClave] = useState('')
  const [editFavClaveError, setEditFavClaveError] = useState('')
  const [editFavClaveOpen, setEditFavClaveOpen] = useState(false)
  const repFavEquipId = selectedEquipmentInfo?.id || ''
  const repFavIds = useMemo(() => {
    const ids = new Set<string>()
    repFavLists.forEach(l => l.repuestoIds.forEach(id => ids.add(id)))
    return ids
  }, [repFavLists])

  // Cargar favoritos cuando cambia el equipo
  useEffect(() => {
    if (!repFavEquipId || !currentUser?.id) { setRepFavLists([]); setActiveFavListName(null); return }
    setActiveFavListName(null)
    getRepuestoFavLists(currentUser.id, repFavEquipId).then(setRepFavLists)
  }, [repFavEquipId, currentUser?.id])

  // Modal: al tocar estrella, abre selector de lista
  const [favModalRepId, setFavModalRepId] = useState<string | null>(null)
  const [favModalNewList, setFavModalNewList] = useState('')

  const openFavModal = useCallback((repuestoId: string) => {
    setFavModalRepId(repuestoId)
    setFavModalNewList('')
  }, [])

  const addRepToList = useCallback((listName: string, repuestoId: string) => {
    if (!currentUser?.id || !repFavEquipId) return
    setRepFavLists(prev => {
      let lists = [...prev]
      const target = lists.find(l => l.name === listName)
      if (target) {
        if (!target.repuestoIds.includes(repuestoId)) {
          target.repuestoIds = [...target.repuestoIds, repuestoId]
        }
      } else {
        lists = [...lists, { name: listName, repuestoIds: [repuestoId] }]
      }
      saveRepuestoFavLists(currentUser!.id, repFavEquipId, lists)
      return lists
    })
    setFavModalRepId(null)
  }, [currentUser, repFavEquipId])

  const removeRepFromList = useCallback((listName: string, repuestoId: string) => {
    if (!currentUser?.id || !repFavEquipId) return
    setRepFavLists(prev => {
      const lists = prev.map(l => l.name === listName ? { ...l, repuestoIds: l.repuestoIds.filter(id => id !== repuestoId) } : l)
      saveRepuestoFavLists(currentUser.id, repFavEquipId, lists)
      return lists
    })
  }, [currentUser, repFavEquipId])

  // Toggle rápido: si ya es favorito en alguna lista, quita. Si no, abre modal.
  const toggleRepFavorite = useCallback((repuestoId: string) => {
    if (repFavIds.has(repuestoId)) {
      if (!currentUser?.id || !repFavEquipId) return
      setRepFavLists(prev => {
        const lists = prev.map(l => ({ ...l, repuestoIds: l.repuestoIds.filter(id => id !== repuestoId) }))
        saveRepuestoFavLists(currentUser.id, repFavEquipId, lists)
        return lists
      })
    } else {
      openFavModal(repuestoId)
    }
  }, [repFavIds, currentUser, repFavEquipId, openFavModal])

  // Scroll al detalle del equipo cuando se selecciona
  useEffect(() => {
    if (selectedEquipmentInfo && equipmentDetailRef.current) {
      setTimeout(() => {
        equipmentDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 150)
    }
  }, [selectedEquipmentInfo])

  // Filtros, ordenamiento y paginación
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300)
  const [filterTipo, setFilterTipo] = useState<string | null>(null)
  const [kpiFilter, setKpiFilter] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  // Hook combinado: repuestos propios (nodo SAP) + heredados (máquina vinculada)
  const {
    repuestos,
    loading: repuestosLoading,
    error: repuestosError,
    hasOwnPath: _hasOwnPath,
    hasSharedPath: _hasSharedPath,
    createRepuesto: createEquipmentRepuesto,
    createInMultipleNodes: _createInMultipleNodes,
    updateRepuesto: updateEquipmentRepuesto,
    deleteRepuesto: deleteEquipmentRepuesto,
    getHistorial: _getHistorial,
  } = useEquipmentRepuestos(selectedEquipmentInfo?.id || null, selectedEquipmentInfo?.linkedMachineId || currentMachine?.id)

  // Hook legacy: import masivo y reubicación (operan sobre machines/{id}/repuestos)
  const {
    importCatalogoDesdeExcel,
    relocateRepuesto,
    bulkRelocateRepuestos,
  } = useRepuestos(currentMachine?.id || null)

  // Wrappers para mantener compatibilidad con los componentes existentes
  const createRepuesto = createEquipmentRepuesto
  const updateRepuesto = useCallback(async (id: string, data: Partial<Repuesto>, originalData?: Repuesto) => {
    const rep = repuestos.find(r => r.id === id) as EquipmentRepuesto | undefined
    await updateEquipmentRepuesto(id, data, rep?.source || 'own', originalData)
  }, [repuestos, updateEquipmentRepuesto])
  const deleteRepuesto = useCallback(async (id: string) => {
    const rep = repuestos.find(r => r.id === id) as EquipmentRepuesto | undefined
    await deleteEquipmentRepuesto(id, rep?.source || 'own')
  }, [repuestos, deleteEquipmentRepuesto])

  const handleSaveSpecs = async (repuestoId: string, specs: TechnicalSpecs, _gallery: MachineImage[]) => {
    try {
      await updateRepuesto(repuestoId, { technicalSpecs: specs });
      toast({
        title: 'Ficha técnica actualizada',
        description: 'Los cambios se han guardado correctamente.',
      });
    } catch (err) {
      logger.error('Error saving specs', err instanceof Error ? err : new Error(String(err)));
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: 'No se pudieron guardar los cambios en la ficha técnica.',
      });
      throw err;
    }
  }

  const handleSaveGallery = async (repuestoId: string, gallery: MachineImage[]) => {
    try {
      await updateRepuesto(repuestoId, { gallery });
      toast({
        title: 'Galería actualizada',
        description: 'Las imágenes se han guardado correctamente.',
      });
    } catch (err) {
      logger.error('Error saving gallery', err instanceof Error ? err : new Error(String(err)));
      toast({
        variant: 'destructive',
        title: 'Error al guardar',
        description: 'No se pudieron guardar los cambios en la galería.',
      });
      throw err;
    }
  }

  // Calcular conteos de repuestos por máquina para el navegador
  // Usa getCountFromServer (aggregation) para obtener conteos reales de todas las máquinas
  const { counts: repuestosCounts } = useRepuestosCounts(machines)

  const dashboardPrefsKey = useMemo(
    () => `repuestos-dashboard-prefs:${currentUser?.id ?? 'anon'}`,
    [currentUser?.id]
  )

  // Hidratar preferencias locales por usuario
  useEffect(() => {
    try {
      const raw = localStorage.getItem(dashboardPrefsKey)
      if (!raw) {
        hasHydratedPrefsRef.current = true
        return
      }

      const prefs = JSON.parse(raw) as {
        searchQuery?: string
        filterTipo?: string | null
        pageSize?: number
      }

      if (typeof prefs.searchQuery === 'string') setSearchQuery(prefs.searchQuery)
      if (prefs.filterTipo !== undefined) setFilterTipo(prefs.filterTipo ?? null)
      if (typeof prefs.pageSize === 'number' && Number.isFinite(prefs.pageSize)) setPageSize(prefs.pageSize)
    } catch {
      logger.warn('No se pudieron restaurar preferencias del dashboard')
    } finally {
      hasHydratedPrefsRef.current = true
    }
  }, [dashboardPrefsKey])

  // Persistir preferencias de uso
  useEffect(() => {
    if (!hasHydratedPrefsRef.current) return
    const payload = {
      searchQuery,
      filterTipo,
      pageSize,
      updatedAt: Date.now(),
    }
    localStorage.setItem(dashboardPrefsKey, JSON.stringify(payload))
  }, [dashboardPrefsKey, searchQuery, filterTipo, pageSize])

  // Filtrar repuestos — Búsqueda mejorada incluye código fabricante
  const filteredRepuestos = useMemo(() => {
    let filtered = [...repuestos]

    if (debouncedSearchQuery.trim()) {
      const query = normalizeForSearch(debouncedSearchQuery)
      filtered = filtered.filter((r) => {
        return (
          normalizeForSearch(r.codigoSAP).includes(query) ||
          normalizeForSearch(r.textoBreve).includes(query) ||
          normalizeForSearch(r.descripcion).includes(query) ||
          normalizeForSearch(r.codigoFabricante).includes(query) ||
          normalizeForSearch(r.ubicacionEnPlanta).includes(query) ||
          normalizeForSearch(r.alias).includes(query) ||
          normalizeForSearch(r.nombreManual).includes(query) ||
          normalizeForSearch(r.tipo).includes(query)
        )
      })
    }

    if (filterTipo) {
      filtered = filtered.filter(r => r.tipo === filterTipo)
    }

    if (kpiFilter === 'conSAP') {
      filtered = filtered.filter(r => !!r.codigoSAP)
    } else if (kpiFilter === 'sinSAP') {
      filtered = filtered.filter(r => !r.codigoSAP)
    } else if (kpiFilter === 'conStock') {
      filtered = filtered.filter(r => (r.cantidadPorMaquina || 0) > 0)
    } else if (kpiFilter === 'conFicha') {
      filtered = filtered.filter(r => r.technicalSpecs)
    } else if (kpiFilter === 'conFoto') {
      filtered = filtered.filter(r => (r.fotosReales?.length || 0) + (r.imagenesManual?.length || 0) + (r.gallery?.length || 0) > 0)
    }

    // Filtro por lista de favoritos activa
    if (activeFavListName) {
      const activeList = repFavLists.find(l => l.name === activeFavListName)
      if (activeList) {
        const favSet = new Set(activeList.repuestoIds)
        filtered = filtered.filter(r => favSet.has(r.id))
      }
    }

    return filtered
  }, [repuestos, debouncedSearchQuery, filterTipo, kpiFilter, activeFavListName, repFavLists])

  // Tipos únicos ordenados por frecuencia (sobre todos los repuestos, no el filtrado)
  const tiposDisponibles = useMemo(() => {
    const freq: Record<string, number> = {}
    for (const r of repuestos) {
      if (r.tipo) {
        freq[r.tipo] = (freq[r.tipo] || 0) + 1
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map(([tipo, count]) => ({ tipo, count }))
  }, [repuestos])
  const [tiposPage, setTiposPage] = useState(1)
  const TIPOS_PAGE_SIZE = 10

  // Ordenar repuestos
  const sortedRepuestos = useMemo(() => {
    if (!sortColumn) return filteredRepuestos
    const sorted = [...filteredRepuestos]
    const dir = sortDirection === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      let va: string | number = ''
      let vb: string | number = ''
      switch (sortColumn) {
        case 'codigoSAP':
          va = a.codigoSAP || ''
          vb = b.codigoSAP || ''
          break
        case 'textoBreve':
          va = a.textoBreve || ''
          vb = b.textoBreve || ''
          break
        case 'codigoFabricante':
          va = a.codigoFabricante || ''
          vb = b.codigoFabricante || ''
          break
        case 'cantidadPorMaquina':
          va = a.cantidadPorMaquina || 0
          vb = b.cantidadPorMaquina || 0
          break
        case 'valorUnitario':
          va = a.valorUnitario || 0
          vb = b.valorUnitario || 0
          break
        case 'ubicacionEnPlanta':
          va = a.ubicacionEnPlanta || ''
          vb = b.ubicacionEnPlanta || ''
          break
        case 'observaciones':
          va = a.observaciones || ''
          vb = b.observaciones || ''
          break
        default:
          return 0
      }
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb, 'es') * dir
      }
      return ((va as number) - (vb as number)) * dir
    })
    return sorted
  }, [filteredRepuestos, sortColumn, sortDirection])

  const handleToggleSort = (column: string) => {
    if (sortColumn === column) {
      if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        // Third click: clear sort
        setSortColumn(null)
        setSortDirection('asc')
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  // Paginar repuestos
  const paginatedRepuestos = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = startIndex + pageSize
    return sortedRepuestos.slice(startIndex, endIndex)
  }, [sortedRepuestos, currentPage, pageSize])

  const totalPages = Math.max(1, Math.ceil(sortedRepuestos.length / pageSize))

  // Reset a página 1 cuando cambien los filtros
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, filterTipo, pageSize])

  const handleClearFilters = () => {
    setSearchQuery('')
    setFilterTipo(null)
    setKpiFilter(null)
  }

  /** Scroll al repuesto y resaltarlo */
  const scrollToAndHighlight = (repuestoId: string) => {
    // Primero: encontrar en qué página está el repuesto (sin filtros ni sort activos)
    const idx = repuestos.findIndex(r => r.id === repuestoId)
    if (idx >= 0) {
      const targetPage = Math.floor(idx / pageSize) + 1
      setCurrentPage(targetPage)
    }

    // Resaltar y hacer scroll (con delay para que React renderice la página correcta)
    setTimeout(() => {
      setHighlightedRepuestoId(repuestoId)
      const el = document.getElementById(`repuesto-${repuestoId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }

      // Limpiar highlight después de 1 minuto
      highlightTimeoutRef.current = setTimeout(() => {
        setHighlightedRepuestoId(null)
      }, 60000)
    }, 150)
  }

  // ─── Efecto: cuando los repuestos terminen de cargar y haya un highlight pendiente ───
  useEffect(() => {
    if (!repuestosLoading && pendingHighlightRef.current && repuestos.length > 0) {
      const repuestoId = pendingHighlightRef.current
      pendingHighlightRef.current = null
      scrollToAndHighlight(repuestoId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repuestosLoading, repuestos])

  // ── Consumir jumpMachineId: la máquina ya fue pre-seleccionada en MachineContext
  //    Solo notificamos a RepuestosPage para que limpie el dot indicator del tab ──
  useEffect(() => {
    if (!jumpMachineId) return
    // Si por algún motivo el contexto no tiene la máquina correcta, aseguramos el cambio
    if (jumpMachineId && machines.some(m => m.id === jumpMachineId)) {
      setCurrentMachine(jumpMachineId).then(() => {
        onJumpConsumed?.()
      }).catch(() => {
        onJumpConsumed?.()
      })
    } else {
      onJumpConsumed?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpMachineId])

  const handleOpenExportReport = () => {
    setExportReportOpen(true)
  }

  const handleImportSuccess = (message: string) => {
    toast({ title: 'Importación exitosa', description: message, variant: 'success' })
    setImportOpen(false)
  }

  const handleImportError = (message: string) => {
    toast({ title: 'Error al importar', description: message, variant: 'destructive' })
  }

  const handleCreate = async (payload: RepuestoFormData) => {
    if (!currentMachine?.id) return
    setSaving(true)
    try {
      await createRepuesto(payload)
      toast({
        title: 'Repuesto creado',
        description: 'El repuesto ha sido creado exitosamente.',
        variant: 'success',
      })
      setCreateOpen(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo crear el repuesto.'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Rename repuesto inline (solo nombre/textoBreve)
  const handleRenameRepuesto = async (repuestoId: string, newName: string) => {
    const original = repuestos.find(r => r.id === repuestoId)
    await updateRepuesto(repuestoId, { textoBreve: newName }, original)
  }

  const handleUpdate = async (payload: RepuestoFormData) => {
    if (!editTarget) return
    setSaving(true)
    try {
      await updateRepuesto(editTarget.id, { ...payload }, editTarget)
      toast({
        title: 'Repuesto actualizado',
        description: 'Los cambios han sido guardados exitosamente.',
        variant: 'success',
      })
      setEditTarget(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el repuesto.'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeletingId(confirmDelete.id)
    try {
      await deleteRepuesto(confirmDelete.id)
      toast({
        title: 'Repuesto eliminado',
        description: 'El repuesto ha sido eliminado exitosamente.',
        variant: 'success',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo eliminar el repuesto.'
      toast({ title: 'Error', description: message, variant: 'destructive' })
    } finally {
      setConfirmDelete(null)
      setDeletingId(null)
    }
  }

  if (machinesLoading) return <LoadingScreen />

  if (machines.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Repuestos</h1>
        <p className="text-muted-foreground">No hay máquinas configuradas aún.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-5 overflow-x-hidden overflow-y-auto">
        {/* Page title + audit buttons — compacto en mobile */}
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base sm:text-xl font-bold text-foreground">Repuestos</h1>
          {isAdmin && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setAuditLogOpen(true)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Historial de cambios">
                <History className="h-4 w-4" />
              </button>
              <button onClick={() => setTrashOpen(true)} className="relative p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Papelera">
                <Trash2 className="h-4 w-4" />
                {trashCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-3.5 min-w-[14px] px-0.5 rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {trashCount > 99 ? '99+' : trashCount}
                  </span>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Banner offline — visible solo sin conexión */}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-400">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>
              Sin conexión. Los cambios se guardarán localmente y se sincronizarán cuando vuelva la red.
            </span>
          </div>
        )}

        {/* Equipment Navigator: Categoría → Subcategoría → Máquina + Admin */}
        <EquipmentNavigator
          repuestosCounts={repuestosCounts}
          onCategoryChange={setSelectedCategoryId}
          onEquipmentSelect={setSelectedEquipmentInfo}
          onFavoriteMachinesChange={setFavMachines}
        />

        {/* ═══ Chips de equipos favoritos agrupados por lista ═══ */}
        {favMachines.size > 0 && (
          <FavChipsPanel
            favMachines={favMachines}
            currentMachineId={currentMachine?.id}
            onSelect={(machineId, equipmentId, nombre) => {
              setCurrentMachine(machineId)
              setSelectedEquipmentInfo({ id: equipmentId, nombre, codigo: '', alias: undefined })
            }}
          />
        )}

        {/* ═══ Detalle de la máquina seleccionada ═══ */}
        {!currentMachine && !selectedEquipmentInfo ? (
          <div className="border-t border-border/40 pt-8 flex flex-col items-center justify-center text-center gap-4 py-14">
            <div className="flex items-center justify-center w-16 h-16 rounded-2xl border border-dashed border-primary/30 bg-primary/5">
              <Package className="h-7 w-7 text-primary/70" />
            </div>
            <div className="max-w-xs">
              <p className="text-sm font-semibold">Elegí un equipo para ver sus repuestos</p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Buscá o seleccioná un equipo en el panel de arriba y verás su catálogo de repuestos, fotos y stock.
              </p>
            </div>
          </div>
        ) : (
        <div ref={equipmentDetailRef} className="border-t border-border/40 pt-4">
        {/* Machine Header — KPIs estilo Excel */}
        {(() => {
          const equipName = selectedEquipmentInfo
            ? (selectedEquipmentInfo.alias || selectedEquipmentInfo.nombre)
            : currentMachine?.nombre || ''
          const totalCatalogo = repuestos.length
          const conSAP = repuestos.filter(r => r.codigoSAP).length
          const conStock = repuestos.filter(r => (r.cantidadPorMaquina || 0) > 0).length
          const valorTotal = repuestos.reduce((s, r) => s + (r.valorUnitario || 0) * (r.cantidadPorMaquina || 0), 0)
          const isFav = !!currentMachine && favMachines.has(currentMachine.id)

          return (
            <div className="mb-4">
              {/* Nombre + favorito */}
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <EquipmentHeaderPhoto equipmentId={selectedEquipmentInfo?.id || currentMachine?.id || ''} />
                  <div>
                    <h2 className="text-base sm:text-lg font-semibold text-foreground leading-tight">{equipName}</h2>
                    <p className="text-xs text-muted-foreground">
                      {selectedEquipmentInfo ? (
                        <>
                          <span className="font-mono text-muted-foreground/60">{selectedEquipmentInfo.codigo}</span>
                          {selectedEquipmentInfo.alias && <span className="ml-1.5">{selectedEquipmentInfo.nombre}</span>}
                        </>
                      ) : (
                        [currentMachine?.marca, currentMachine?.modelo].filter(Boolean).join(' · ') || 'Catálogo de repuestos'
                      )}
                    </p>
                  </div>
                </div>
                {isFav && <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 shrink-0" />}
              </div>

              {/* KPI strip — cada uno con desglose independiente */}
              <KpiStrip
                repuestos={repuestos}
                filteredRepuestos={filteredRepuestos}
                totalCatalogo={totalCatalogo}
                conSAP={conSAP}
                conStock={conStock}
                valorTotal={valorTotal}
                kpiFilter={kpiFilter}
                setKpiFilter={setKpiFilter}
                filterTipo={filterTipo}
                setFilterTipo={setFilterTipo}
              />
            </div>
          )
        })()}

        <div className="flex items-center gap-1.5 sm:gap-2 mb-4 overflow-x-auto no-scrollbar">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="gap-1.5" title="Importar">
                <Upload className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Importar</span>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleOpenExportReport} className="gap-1.5" title="Exportar / Reportes">
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Exportar</span>
            </Button>
            {isAdmin && repuestos.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setBulkRelocateOpen(true)} className="gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300" title="Reubicar repuestos masivamente">
                <ArrowRightLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Reubicar</span>
              </Button>
            )}
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => setDuplicatesOpen(true)} className="gap-1.5 border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300" title="Detectar y fusionar duplicados">
                <CopyDuplicateIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline text-xs">Duplicados</span>
              </Button>
            )}
            {isAdmin && (
              <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                <span className="text-xs">Repuesto</span>
              </Button>
            )}
        </div>

        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={`Buscar en ${selectedEquipmentInfo ? (selectedEquipmentInfo.alias || selectedEquipmentInfo.nombre) : currentMachine?.nombre || 'equipo'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-9 py-2 text-sm bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title="Limpiar búsqueda local"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* "Buscar en todas" — sólo cuando hay query y el módulo tiene BuscadorGlobal vinculado */}
            {searchQuery.trim() && onSearchSimilar && (
              <button
                onClick={() => onSearchSimilar(searchQuery.trim())}
                title="Buscar esta pieza en todas las máquinas"
                className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/15 transition-colors whitespace-nowrap"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Buscar en todas</span>
                <ExternalLink className="h-3 w-3 sm:hidden" />
              </button>
            )}
          </div>

          {/* Chips de filtro por tipo — paginados de 10 en 10 */}
          {tiposDisponibles.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => { setFilterTipo(null); setTiposPage(1) }}
                className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
                  filterTipo === null
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                Todos
              </button>
              {tiposDisponibles.slice(0, tiposPage * TIPOS_PAGE_SIZE).map(({ tipo, count }) => (
                <button
                  key={tipo}
                  onClick={() => setFilterTipo(filterTipo === tipo ? null : tipo)}
                  className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
                    filterTipo === tipo
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {tipo} <span className="opacity-60">{count}</span>
                </button>
              ))}
              {tiposDisponibles.length > tiposPage * TIPOS_PAGE_SIZE && (
                <button
                  onClick={() => setTiposPage(p => p + 1)}
                  className="shrink-0 text-[10px] px-2 py-0.5 rounded-full border border-primary/30 text-primary cursor-pointer hover:bg-primary/10 transition-colors whitespace-nowrap"
                >
                  Ver + ({tiposDisponibles.length - tiposPage * TIPOS_PAGE_SIZE})
                </button>
              )}
            </div>
          )}

          {(searchQuery || filterTipo || kpiFilter) && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleClearFilters} className="text-xs gap-1.5">
                <X className="h-3.5 w-3.5" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </div>

        {/* KPIs eliminados — unificados en el header de equipo arriba */}

        {/* Machine Manuals Panel — only admins */}
        {isAdmin && currentMachine && (
          <MachineManualPanel machine={currentMachine} className="mt-3" />
        )}
        {isAdmin && !currentMachine && selectedEquipmentInfo && (
          <MachineManualPanel
            storageId={selectedEquipmentInfo.id}
            displayName={selectedEquipmentInfo.alias || selectedEquipmentInfo.nombre}
            className="mt-3"
          />
        )}

        {/* ═══ Listas de repuestos favoritos (tags de filtro rápido) ═══ */}
        {repFavLists.some(l => l.repuestoIds.length > 0) && (
          <div className="mt-3 flex items-center gap-1.5 overflow-x-auto sm:flex-wrap no-scrollbar">
            {repFavLists.filter(l => l.repuestoIds.length > 0).map(list => {
              const isActive = activeFavListName === list.name
              return (
                <button
                  key={list.name}
                  onClick={() => setActiveFavListName(isActive ? null : list.name)}
                  className={[
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap shrink-0',
                    isActive
                      ? 'border-yellow-500/40 bg-yellow-500/15 text-yellow-400'
                      : 'border-border bg-card text-muted-foreground hover:border-yellow-500/30 hover:text-foreground',
                  ].join(' ')}
                >
                  <Star className={`h-3 w-3 ${isActive ? 'fill-yellow-400 text-yellow-400' : 'text-yellow-400/50'}`} />
                  {list.name}
                  <span className={`text-[9px] ${isActive ? 'text-yellow-400/70' : 'text-muted-foreground/40'}`}>
                    {list.repuestoIds.length}
                  </span>
                </button>
              )
            })}
            {/* Botón editar listas */}
            <button
              onClick={() => { setEditFavClaveOpen(true); setEditFavClave(''); setEditFavClaveError('') }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border border-dashed border-border text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap shrink-0"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          </div>
        )}

        {/* Panel editar listas (abierto tras clave correcta) */}
        {editingFavList === '__all__' && (
          <div className="mt-2 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" /> Editar listas de favoritos</span>
              <button onClick={() => setEditingFavList(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            {repFavLists.map(list => (
              <div key={list.name} className="space-y-1.5 p-2 rounded-lg border border-border bg-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Star className="h-3 w-3 text-yellow-400/60 shrink-0" />
                    <input
                      defaultValue={list.name}
                      onBlur={e => {
                        const newName = e.target.value.trim()
                        if (!newName || newName === list.name || !currentUser?.id) return
                        const updated = repFavLists.map(l => l.name === list.name ? { ...l, name: newName } : l)
                        setRepFavLists(updated)
                        saveRepuestoFavLists(currentUser.id, repFavEquipId, updated)
                        if (activeFavListName === list.name) setActiveFavListName(newName)
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="text-xs font-medium text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none px-0.5 py-0 min-w-0 flex-1"
                    />
                    <span className="text-[9px] text-muted-foreground/50 shrink-0">({list.repuestoIds.length})</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => {
                      if (!currentUser?.id) return
                      const updated = repFavLists.map(l => l.name === list.name ? { ...l, repuestoIds: [] } : l)
                      setRepFavLists(updated)
                      saveRepuestoFavLists(currentUser.id, repFavEquipId, updated)
                    }} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80">Vaciar</button>
                    <button onClick={() => {
                      if (!currentUser?.id) return
                      const updated = repFavLists.filter(l => l.name !== list.name)
                      setRepFavLists(updated)
                      saveRepuestoFavLists(currentUser.id, repFavEquipId, updated)
                      if (activeFavListName === list.name) setActiveFavListName(null)
                    }} className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20">Eliminar</button>
                  </div>
                </div>
                {list.repuestoIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {list.repuestoIds.map(id => {
                      const rep = repuestos.find(r => r.id === id)
                      return (
                        <span key={id} className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {rep?.textoBreve?.slice(0, 20) || id}
                          <button onClick={() => removeRepFromList(list.name, id)} className="text-muted-foreground/60 hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error Display */}
        {repuestosError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {repuestosError}
          </div>
        )}

        {/* Content Area */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">Catálogo de repuestos</span>
              <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                {filteredRepuestos.length === repuestos.length
                  ? `${repuestos.length} items`
                  : `${filteredRepuestos.length} de ${repuestos.length}`}
              </span>
            </div>
          </div>

          {filteredRepuestos.length === 0 ? (
            <EmptyState
              hasFilters={searchQuery !== '' || filterTipo !== null || kpiFilter !== null}
              onClearFilters={handleClearFilters}
            />
          ) : (
            <>
              <RepuestosTable
                repuestos={paginatedRepuestos}
                loading={repuestosLoading}
                machineId={currentMachine?.id}
                isAdmin={isAdmin}
                sortColumn={sortColumn}
                sortDirection={sortDirection}
                onToggleSort={handleToggleSort}
                onEdit={isAdmin ? (rep) => setEditTarget(rep) : undefined}
                onDelete={isAdmin ? (rep) => setConfirmDelete(rep) : undefined}
                onViewPhotos={(rep) => setPhotoModal(rep)}
                onViewManual={(rep) => setManualModal(rep)}
                onViewSpecs={(rep) => setSpecsTarget(rep)}
                onViewGallery={(rep) => setGalleryTarget(rep)}
                onRenameRepuesto={isAdmin ? handleRenameRepuesto : undefined}
                onSearchInManual={currentMachine ? (rep) => setManualSearchTarget(rep) : undefined}
                onViewInManual={currentMachine ? (rep) => setViewInManualTarget(rep) : undefined}
                onEditAnnotation={isAdmin && currentMachine ? (rep) => setViewInManualTarget(rep) : undefined}
                onRelocate={isAdmin && currentMachine ? (rep) => setRelocateTarget(rep) : undefined}
                onViewDetail={(rep) => setDetailTarget(rep)}
                highlightedRepuestoId={highlightedRepuestoId}
                favoriteIds={repFavIds}
                onToggleFavorite={toggleRepFavorite}
              />

              <RepuestosPagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalItems={filteredRepuestos.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
              />
            </>
          )}
        </div>
        </div>
        )}
      </div>

      {/* Create Modal */}
      <RepuestoFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        machineName={currentMachine?.nombre ?? ''}
        onSubmit={handleCreate}
        loading={saving}
      />

      {/* Edit Modal */}
      <RepuestoFormModal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        mode="edit"
        machineName={currentMachine?.nombre ?? ''}
        initialData={editTarget || undefined}
        onSubmit={handleUpdate}
        loading={saving}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => (!open ? setConfirmDelete(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar repuesto</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Se eliminará el repuesto del catálogo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p className="text-foreground">
              ¿Seguro que deseas eliminar
              {confirmDelete ? ` "${confirmDelete.textoBreve || confirmDelete.codigoSAP}"` : ''}?
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={deletingId !== null}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deletingId !== null}>
              {deletingId ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportRepuestosModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={handleImportSuccess}
        onError={handleImportError}
        machineName={currentMachine?.nombre ?? ''}
        importCatalogoDesdeExcel={importCatalogoDesdeExcel}
      />

      {/* Modales de vista adicional */}
      {photoModal && (
        <RepuestoPhotosModal
          open={true}
          onOpenChange={(open) => !open && setPhotoModal(null)}
          fotosReales={photoModal.fotosReales || []}
          imagenesManual={photoModal.imagenesManual || []}
          repuestoName={photoModal.textoBreve || photoModal.codigoSAP || 'Repuesto'}
        />
      )}

      {manualModal && (
        <RepuestoManualModal
          open={true}
          onOpenChange={(open) => !open && setManualModal(null)}
          repuesto={manualModal}
        />
      )}

      {/* Modal de Ficha Técnica */}
      {specsTarget && (
        <TechnicalSpecsModal
          open={!!specsTarget}
          onOpenChange={(open) => !open && setSpecsTarget(null)}
          repuesto={specsTarget}
          machineId={currentMachine?.id}
          onSave={handleSaveSpecs}
          readOnly={!isAdmin}
        />
      )}

      {/* Modal de Galería */}
      {galleryTarget && (
        <RepuestoGalleryModal
          open={!!galleryTarget}
          onOpenChange={(open) => !open && setGalleryTarget(null)}
          repuesto={galleryTarget}
          machineId={currentMachine?.id}
          onSave={handleSaveGallery}
          readOnly={!isAdmin}
        />
      )}
      
      {/* Modal de Búsqueda en Manual */}
      {manualSearchTarget && currentMachine && (
        <ManualSearchModal
          open={!!manualSearchTarget}
          onOpenChange={(open) => !open && setManualSearchTarget(null)}
          machine={currentMachine}
          repuesto={manualSearchTarget}
          isAdmin={isAdmin}
        />
      )}

      {/* Modal de Ver en Manual (con vínculo guardado) */}
      {viewInManualTarget && currentMachine && (
        <ManualSearchModal
          open={!!viewInManualTarget}
          onOpenChange={(open) => !open && setViewInManualTarget(null)}
          machine={currentMachine}
          repuesto={viewInManualTarget}
          initialVinculo={viewInManualTarget.vinculosManual?.find(v => v.machineId === currentMachine?.id) ?? viewInManualTarget.vinculosManual?.[0]}
          isAdmin={isAdmin}
        />
      )}

      <ExportReportModal 
        isOpen={exportReportOpen}
        onClose={() => setExportReportOpen(false)}
        repuestos={repuestos}
        filteredRepuestos={filteredRepuestos}
        categories={categories}
        machineName={currentMachine?.nombre}
      />

      {/* Modal Reubicar Individual */}
      {relocateTarget && currentMachine && (
        <RelocateRepuestoModal
          open={!!relocateTarget}
          onOpenChange={(o) => !o && setRelocateTarget(null)}
          repuesto={relocateTarget}
          currentMachine={currentMachine}
          machines={machines}
          onRelocate={relocateRepuesto}
          onSuccess={() => {
            setRelocateTarget(null)
            toast({ title: 'Repuesto reubicado', description: 'El repuesto fue movido a la nueva máquina.' })
          }}
        />
      )}

      {/* Modal Reubicar Masivo */}
      {bulkRelocateOpen && currentMachine && (
        <BulkRelocateModal
          open={bulkRelocateOpen}
          onOpenChange={setBulkRelocateOpen}
          repuestos={repuestos}
          currentMachine={currentMachine}
          machines={machines}
          onBulkRelocate={bulkRelocateRepuestos}
          onSuccess={() => {
            setBulkRelocateOpen(false)
            toast({ title: 'Reubicación masiva completada', description: 'Los repuestos fueron movidos a la nueva máquina.' })
          }}
        />
      )}

      {/* Modal Duplicados */}
      <DuplicatesModal
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
        machines={machines}
        onDone={() => {
          toast({ title: 'Duplicados gestionados', description: 'Los repuestos duplicados fueron fusionados exitosamente.' })
        }}
      />

      {/* Modal Ficha completa de repuesto */}
      {detailTarget && (
        <RepuestoDetailModal
          open={!!detailTarget}
          onOpenChange={(open) => !open && setDetailTarget(null)}
          repuesto={detailTarget}
          machineName={currentMachine?.nombre}
          machineId={currentMachine?.id}
        />
      )}

      {/* Audit Log + Papelera (admin/supervisor) */}
      <TrashPanel open={trashOpen} onOpenChange={setTrashOpen} />
      <AuditLogPanel open={auditLogOpen} onOpenChange={setAuditLogOpen} />

      {/* Modal: Agregar repuesto a lista de favoritos */}
      {favModalRepId && (() => {
        const rep = repuestos.find(r => r.id === favModalRepId)
        return (
          <Dialog open={!!favModalRepId} onOpenChange={v => { if (!v) setFavModalRepId(null) }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-sm">Agregar a lista</DialogTitle>
              </DialogHeader>
              <p className="text-xs text-muted-foreground truncate">{rep?.textoBreve || rep?.codigoSAP || ''}</p>
              <div className="space-y-1.5 mt-2">
                {repFavLists.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay listas aún. Crea una:</p>
                )}
                {repFavLists.map(list => {
                  const alreadyIn = list.repuestoIds.includes(favModalRepId!)
                  return (
                    <button
                      key={list.name}
                      onClick={() => {
                        if (alreadyIn) removeRepFromList(list.name, favModalRepId!)
                        else addRepToList(list.name, favModalRepId!)
                      }}
                      className={[
                        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left',
                        alreadyIn
                          ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400'
                          : 'border-border bg-card text-foreground hover:bg-muted/20',
                      ].join(' ')}
                    >
                      <Star className={`h-3.5 w-3.5 ${alreadyIn ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40'}`} />
                      <span className="flex-1">{list.name}</span>
                      <span className="text-[9px] text-muted-foreground">{list.repuestoIds.length}</span>
                      {alreadyIn && <span className="text-[9px] text-yellow-400">En lista</span>}
                    </button>
                  )
                })}
              </div>
              {/* Crear nueva lista inline */}
              <form onSubmit={e => {
                e.preventDefault()
                if (!favModalNewList.trim()) return
                addRepToList(favModalNewList.trim(), favModalRepId!)
                setFavModalNewList('')
              }} className="flex gap-2 mt-2">
                <input
                  value={favModalNewList}
                  onChange={e => setFavModalNewList(e.target.value)}
                  placeholder="Nueva lista…"
                  className="flex-1 h-8 px-3 text-xs bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                />
                <Button type="submit" size="sm" disabled={!favModalNewList.trim()} className="h-8 text-xs">
                  Crear
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* Dialog: Clave de edición para editar listas de favoritos */}
      <Dialog open={editFavClaveOpen} onOpenChange={v => { if (!v) setEditFavClaveOpen(false) }}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Clave de edición</DialogTitle>
          </DialogHeader>
          <form onSubmit={async e => {
            e.preventDefault()
            setEditFavClaveError('')
            const correctPwd = await getHmiTooltipPwd()
            if (editFavClave.trim() !== correctPwd) {
              setEditFavClaveError('Clave incorrecta')
              return
            }
            setEditFavClaveOpen(false)
            setEditingFavList('__all__')
          }} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={editFavClave}
              onChange={e => { setEditFavClave(e.target.value); setEditFavClaveError('') }}
              placeholder="Ingresa la clave…"
              className="w-full h-9 px-3 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground"
            />
            {editFavClaveError && <p className="text-xs text-destructive">{editFavClaveError}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditFavClaveOpen(false)}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={!editFavClave.trim()}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
