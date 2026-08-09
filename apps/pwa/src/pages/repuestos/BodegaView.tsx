/**
 * BodegaView — Sistema de gestión de bodega de repuestos
 *
 * Sub-pestañas:
 *  - Stock:        gestión de stock, movimientos, alertas, watchlist
 *  - Inventarios:  conteos periódicos, reconciliación, resumen post-finalización
 *  - Movimientos:  historial global filtrable
 *  - Estadísticas: KPIs, rotación, ABC, stock muerto, distribución, valor
 *
 * Solo repuestos con código SAP.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  Package, Search, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  Settings2, History, X, Check, Pencil, MapPin, TrendingDown,
  PackageX, DollarSign, PackageCheck, Loader2, ClipboardList,
  BarChart3, Plus, ChevronRight, CheckCircle2, CircleDot,
  AlertCircle, Clock, Download, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown,
  Layers, Truck, ShieldCheck, ShieldAlert, ShieldX,
  Star, Activity, Zap, Archive, Camera, QrCode, ShoppingCart, Image, Tag,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { escapeHtml } from '@/lib/escapeHtml'
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useGlobalSearch } from '@/hooks/repuestos/useGlobalSearch'
import { haystackMatchesAll, normalizeForSearch } from '@/utils/repuestos'
import { getGlobalEquipmentCache, useGlobalEquipmentSearch } from '@/hooks/useGlobalEquipmentSearch'
import { useBodega } from '@/hooks/repuestos/useBodega'
// `Tag` colisiona con el ícono homónimo de lucide ya usado acá.
import { Tag as CatTag, type TagTone } from '@/components/piel'
import { CargaRapidaModal } from '@/components/repuestos/CargaRapidaModal'
import type {
  BodegaMergedItem, BodegaStockData, MovimientoBodega,
  InventarioSesion, InventarioConteo,
} from '@/hooks/repuestos/useBodega'
import type { Machine } from '@/types/repuestos'
import { useAuthStore } from '@/store/authStore'
import { ImageLightbox } from '@/components/ui/ImageLightbox'

type BodegaTab = 'stock' | 'inventarios' | 'movimientos' | 'estadisticas'
type StockFilter = 'todos' | 'configurados' | 'bajo' | 'sin' | 'sinConfig' | 'favoritos'

const INPUT = 'w-full px-3 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground'

/**
 * Tono CATEGÓRICO por tipo de repuesto (primitivo <Tag>, docs §1.6).
 *
 * Antes esta función devolvía clases Tailwind crudas con el patrón
 * `bg-X-500/15 text-X-700 dark:text-X-400`. Ese patrón es exactamente el que la
 * auditoría de julio marcó como riesgo: sobre fondo al 15% varios de esos pares
 * caían BAJO 4.5:1 (emerald 4.09, red 3.99). Los tonos de <Tag> están medidos y
 * cumplen AA en ambos temas.
 *
 * Los tonos NO son semánticos: un motor en tono 5 no es "peor" que un
 * rodamiento en tono 1, solo es otra cosa.
 */
function tipoTag(tipo?: string): TagTone {
  if (!tipo) return 'neutral'
  const t = tipo.toUpperCase()
  if (['RODAMIENTO', 'COJINETE'].includes(t)) return 1
  if (['SELLO/JUNTA', 'ANILLO', 'SELLO'].includes(t)) return 2
  if (['MOTOR', 'BOMBA'].includes(t)) return 5
  if (['SENSOR', 'INTERRUPTOR', 'MÓDULO ELÉCT.', 'RELÉ', 'CONTACTOR',
    'FUENTE ALIM.', 'TRANSFORMADOR', 'VARIADOR', 'HMI', 'PLC'].includes(t)) return 6
  if (['TORNILLERÍA', 'PERNO', 'TUERCA', 'PASADOR', 'ARANDELA', 'ABRAZADERA'].includes(t)) return 'neutral'
  if (['CORREA', 'CADENA', 'CINTA/BANDA'].includes(t)) return 4
  if (['VÁLVULA', 'CILINDRO NEUM.', 'NEUMÁTICA GEN.'].includes(t)) return 7
  if (['FILTRO', 'LUBRICACIÓN'].includes(t)) return 8
  if (['RESORTE'].includes(t)) return 7
  if (['SOPORTE', 'CARCASA/TAPA', 'ESTRUCTURA'].includes(t)) return 'neutral'
  if (['AMORTIGUADOR'].includes(t)) return 5
  return 'neutral'
}

// ══════════════════════════════════════════════
//  CONTENEDOR PRINCIPAL
// ══════════════════════════════════════════════

interface BodegaViewProps {
  onViewInEquipo?: (machineId: string) => void
  onSearchSimilar?: (query: string) => void
}

export function BodegaView({ onViewInEquipo, onSearchSimilar }: BodegaViewProps = {}) {
  const user = useAuthStore(s => s.user)
  const [subTab, setSubTab] = useState<BodegaTab>('stock')

  // ── Cargar catálogo (mismo patrón que BuscadorGlobal) ──
  useGlobalEquipmentSearch('', 999)
  const [hierarchyNames, setHierarchyNames] = useState<Map<string, string>>(new Map())
  const hierarchyLoadedRef = useRef(false)

  useEffect(() => {
    if (hierarchyLoadedRef.current) return
    hierarchyLoadedRef.current = true
    ;(async () => {
      try {
        const snap = await getDocs(fsQuery(collection(db, 'hierarchy'), where('activo', '==', true)))
        const names = new Map<string, string>()
        snap.forEach(d => names.set(d.id, d.data().nombre ?? d.id))
        setHierarchyNames(names)
      } catch {}
    })()
  }, [])

  const machines = useMemo((): Machine[] => {
    const eq = getGlobalEquipmentCache()
    if (!eq) return []
    const seen = new Map<string, { nombre: string }>()
    for (const e of eq) {
      if (!e.linkedMachineId || e.oculto || seen.has(e.linkedMachineId)) continue
      seen.set(e.linkedMachineId, { nombre: e.nombre })
    }
    return [...seen.entries()].map(([id, info]) => ({
      id, nombre: info.nombre, marca: '', modelo: '',
      activa: true, color: '#6b7280', orden: 0, createdAt: new Date(),
    }))
    // Trigger re-calc cuando la jerarquía carga (cache global no es reactivo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchyNames])

  const { allRepuestos, loadAll, loaded, loading: catalogLoading, progress } = useGlobalSearch(machines)

  useEffect(() => {
    if (!loaded && machines.length > 0) loadAll()
  }, [loaded, machines.length, loadAll])

  const bodega = useBodega(allRepuestos)
  const isLoading = catalogLoading || (bodega.loading && allRepuestos.length === 0)

  if (isLoading) {
    const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 px-6">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground">
          {progress.phase === 'machines' && progress.total > 0
            ? `Cargando equipos… ${progress.loaded}/${progress.total}`
            : progress.phase === 'hierarchy'
              ? 'Indexando jerarquía…'
              : 'Cargando bodega…'}
        </span>
        {progress.total > 0 && (
          <div className="w-full max-w-[200px] h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    )
  }

  const SUB_TABS: { id: BodegaTab; label: string; icon: typeof Package }[] = [
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'inventarios', label: 'Inventarios', icon: ClipboardList },
    { id: 'movimientos', label: 'Movimientos', icon: History },
    { id: 'estadisticas', label: 'Estadísticas', icon: BarChart3 },
  ]

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Sub-tabs: compactas en móvil (sin ícono, menos padding) para que las 4
          quepan en 375px — antes "Estadísticas" quedaba cortada fuera de vista. */}
      <div className="flex items-center gap-1 bg-muted p-1 rounded-lg w-fit max-w-full overflow-x-auto no-scrollbar">
        {SUB_TABS.map(t => {
          const Icon = t.icon
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={[
                'flex shrink-0 items-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
              ].join(' ')}
            >
              <Icon className="hidden sm:block h-3.5 w-3.5" />
              {t.label}
              {t.id === 'stock' && bodega.stats.bajoStock + bodega.stats.sinStock > 0 && (
                <span className="h-4 min-w-[16px] px-1 rounded-full bg-red-500/80 text-white text-[9px] font-bold flex items-center justify-center">
                  {bodega.stats.bajoStock + bodega.stats.sinStock}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {subTab === 'stock' && <StockTab bodega={bodega} user={user} onViewInEquipo={onViewInEquipo} onSearchSimilar={onSearchSimilar} />}
      {subTab === 'inventarios' && <InventarioTab bodega={bodega} user={user} />}
      {subTab === 'movimientos' && <MovimientosTab bodega={bodega} />}
      {subTab === 'estadisticas' && <EstadisticasTab bodega={bodega} />}
    </div>
  )
}

// ══════════════════════════════════════════════
//  TAB: STOCK
// ══════════════════════════════════════════════

type SortField = 'nombre' | 'sap' | 'stock' | 'valor' | 'equipos'
type SortDir = 'asc' | 'desc'

function exportCsv(items: BodegaMergedItem[]) {
  const header = 'Código SAP,Código Fabricante,Nombre,Tipo,Stock,Mínimo,Unidad,Ubicación,Proveedor,Costo,Valor Total,Equipos\n'
  const rows = items.map(i => {
    const valor = i.stockActual * (i.costoCompra ?? i.valorUnitario ?? 0)
    const equipos = i.equipos.map(e => e.machineName).join(' | ')
    return [i.codigoSAP, i.codigoFabricante, `"${(i.textoBreve || '').replace(/"/g, '""')}"`, i.tipo || '', i.stockActual, i.stockMinimo, i.unidad, `"${(i.ubicacionBodega || '').replace(/"/g, '""')}"`, `"${(i.proveedor || '').replace(/"/g, '""')}"`, i.costoCompra ?? i.valorUnitario ?? 0, valor, `"${equipos}"`].join(',')
  }).join('\n')
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bodega_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function StockTab({ bodega, user, onViewInEquipo, onSearchSimilar }: { bodega: ReturnType<typeof useBodega>; user: any; onViewInEquipo?: (machineId: string) => void; onSearchSimilar?: (query: string) => void }) {
  const { items, stats, saveStock, registrarMovimiento, registrarMovimientoBatch, loadMovimientos, toggleWatch, addPhoto, removePhoto, calcReorderData } = bodega
  const [searchQuery, setSearchQuery] = useState('')
  // Default 'configurados': tras unificar el maestro (Fase 6) "Con SAP" pasó de
  // 759 a 3.778 ítems (mayoría sin stock). El gestor de bodega quiere ver primero
  // su inventario real (los que tienen registro de bodega); el resto, a un clic.
  const [stockFilter, setStockFilter] = useState<StockFilter>('configurados')
  const [editingItem, setEditingItem] = useState<BodegaMergedItem | null>(null)
  const [movimientoItem, setMovimientoItem] = useState<BodegaMergedItem | null>(null)
  const [historialItem, setHistorialItem] = useState<BodegaMergedItem | null>(null)
  const [showBulkConfig, setShowBulkConfig] = useState(false)
  const [showCargaRapida, setShowCargaRapida] = useState(false)
  const [showBatchMov, setShowBatchMov] = useState(false)
  const [drawerItem, setDrawerItem] = useState<BodegaMergedItem | null>(null)
  const [sortField, setSortField] = useState<SortField>('nombre')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const favCount = items.filter(i => i.isWatched).length

  const toggleSort = useCallback((field: SortField) => {
    setSortField(prev => { if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev } setSortDir('asc'); return field })
  }, [])

  const filtered = useMemo(() => {
    let result = items
    if (stockFilter === 'configurados') result = result.filter(i => i.bodegaId)
    else if (stockFilter === 'bajo') result = result.filter(i => i.bodegaId && i.stockMinimo > 0 && i.stockActual <= i.stockMinimo && i.stockActual > 0)
    else if (stockFilter === 'sin') result = result.filter(i => i.bodegaId && i.stockActual === 0 && i.stockMinimo > 0)
    else if (stockFilter === 'sinConfig') result = result.filter(i => !i.bodegaId)
    else if (stockFilter === 'favoritos') result = result.filter(i => i.isWatched)

    if (searchQuery.trim()) {
      const terms = normalizeForSearch(searchQuery).split(/\s+/).filter(Boolean)
      result = result.filter(i => {
        const h = normalizeForSearch(`${i.codigoSAP} ${i.codigoFabricante} ${i.textoBreve} ${i.alias || ''} ${i.ubicacionBodega} ${i.proveedor || ''} ${i.tipo || ''}`)
        return haystackMatchesAll(h, terms)
      })
    }

    const dir = sortDir === 'asc' ? 1 : -1
    result = [...result].sort((a, b) => {
      switch (sortField) {
        case 'sap': return dir * a.codigoSAP.localeCompare(b.codigoSAP)
        case 'stock': return dir * (a.stockActual - b.stockActual)
        case 'valor': {
          const va = a.stockActual * (a.costoCompra ?? a.valorUnitario ?? 0)
          const vb = b.stockActual * (b.costoCompra ?? b.valorUnitario ?? 0)
          return dir * (va - vb)
        }
        case 'equipos': return dir * (a.equipos.length - b.equipos.length)
        default: {
          // Sin nombre SIEMPRE al final (aun en desc): '' ordena antes que todo
          // y dejaba los docs sucios como primera pantalla de Bodega.
          if (a.textoBreve && !b.textoBreve) return -1
          if (!a.textoBreve && b.textoBreve) return 1
          return dir * (a.textoBreve || '').localeCompare(b.textoBreve || '')
        }
      }
    })
    return result
  }, [items, stockFilter, searchQuery, sortField, sortDir])

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />
    return sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        <StatCard icon={Package} label="Con SAP" value={stats.total} color="text-primary" bg="bg-primary/[0.08]" onClick={() => setStockFilter('todos')} active={stockFilter === 'todos'} />
        <StatCard icon={PackageCheck} label="Configurados" value={stats.conStock} color="text-emerald-600" bg="bg-emerald-500/[0.08]" onClick={() => setStockFilter('configurados')} active={stockFilter === 'configurados'} />
        <StatCard icon={TrendingDown} label="Bajo stock" value={stats.bajoStock} color="text-amber-600" bg="bg-amber-500/[0.08]" onClick={() => setStockFilter('bajo')} active={stockFilter === 'bajo'} />
        <StatCard icon={PackageX} label="Sin stock" value={stats.sinStock} color="text-red-600" bg="bg-red-500/[0.08]" onClick={() => setStockFilter('sin')} active={stockFilter === 'sin'} />
        <StatCard icon={Settings2} label="Sin configurar" value={stats.sinConfig} color="text-muted-foreground" bg="bg-muted-foreground/[0.10]" onClick={() => setStockFilter('sinConfig')} active={stockFilter === 'sinConfig'} />
        <StatCard icon={Star} label="Favoritos" value={favCount} color="text-amber-600" bg="bg-amber-500/[0.08]" onClick={() => setStockFilter('favoritos')} active={stockFilter === 'favoritos'} />
      </div>

      {/* Search + Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nombre, SAP, tipo, ubicación…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
        <button onClick={() => setShowBatchMov(true)} title="Movimiento en lote" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-500/[0.08] border border-emerald-500/[0.25] rounded-lg hover:bg-emerald-500/[0.08] text-emerald-600 transition-colors shrink-0">
          <Layers className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Lote</span>
        </button>
        <button onClick={() => setShowCargaRapida(true)} title="Carga rápida de stock y ubicación, ítem por ítem" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-amber-500/[0.08] border border-amber-500/[0.25] rounded-lg hover:bg-amber-500/[0.08] text-amber-600 transition-colors shrink-0">
          <MapPin className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Carga rápida</span>
        </button>
        {stats.sinConfig > 0 && (
          <button onClick={() => setShowBulkConfig(true)} title="Configurar múltiples" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 text-primary transition-colors shrink-0">
            <Settings2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Config.</span>
          </button>
        )}
        <button onClick={() => exportCsv(filtered)} title="Exportar CSV" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted border border-border rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0">
          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">CSV</span>
        </button>
      </div>

      {/* Panel de alertas — visible en las vistas de resumen (todos/configurados) */}
      {stats.alertas.length > 0 && (stockFilter === 'todos' || stockFilter === 'configurados') && !searchQuery && (
        <AlertPanel alertas={stats.alertas} onFilter={(f: StockFilter) => setStockFilter(f)} />
      )}

      {/* Sort bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Ordenar:</span>
        {([['nombre', 'Nombre'], ['stock', 'Stock'], ['valor', 'Valor'], ['equipos', 'Equipos']] as [SortField, string][]).map(([field, label]) => (
          <button key={field} onClick={() => toggleSort(field)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${sortField === field ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
            {label} <SortIcon field={field} />
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">{filtered.length} de {items.length}</span>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <EmptyState message={items.length === 0 ? 'No hay repuestos con código SAP' : 'Sin resultados'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {filtered.map(item => (
            <BodegaRow key={item.codigoSAP} item={item}
              onEdit={() => setEditingItem(item)} onMovimiento={() => setMovimientoItem(item)}
              onHistorial={() => setHistorialItem(item)} onToggleWatch={() => toggleWatch(item.codigoSAP)}
              onOpenDrawer={() => setDrawerItem(item)} />
          ))}
        </div>
      )}

      {editingItem && <StockFormModal item={editingItem} onSave={async d => { await saveStock(editingItem.codigoSAP, d); setEditingItem(null) }} onClose={() => setEditingItem(null)} />}
      {movimientoItem && <MovimientoModal item={movimientoItem} onSave={async (t, c, m) => { if (user) { await registrarMovimiento(movimientoItem, { tipo: t, cantidad: c, motivo: m }, user.id, user.nombre); setMovimientoItem(null) } }} onClose={() => setMovimientoItem(null)} />}
      {historialItem && <HistorialModal item={historialItem} loadMovimientos={loadMovimientos} onClose={() => setHistorialItem(null)} />}
      {showBulkConfig && <BulkConfigModal items={items.filter(i => !i.bodegaId)} saveStock={saveStock} onClose={() => setShowBulkConfig(false)} />}
      {showCargaRapida && <CargaRapidaModal items={items} saveStock={saveStock} onClose={() => setShowCargaRapida(false)} />}
      {showBatchMov && <BatchMovimientoModal items={items.filter(i => i.bodegaId)} registrarMovimientoBatch={registrarMovimientoBatch} user={user} onClose={() => setShowBatchMov(false)} />}
      {drawerItem && <ItemDrawer item={drawerItem} loadMovimientos={loadMovimientos} onClose={() => setDrawerItem(null)} onEdit={() => { setEditingItem(drawerItem); setDrawerItem(null) }} onMovimiento={() => { setMovimientoItem(drawerItem); setDrawerItem(null) }} addPhoto={addPhoto} removePhoto={removePhoto} calcReorderData={calcReorderData} onViewInEquipo={onViewInEquipo} onSearchSimilar={onSearchSimilar} />}
    </>
  )
}

// ══════════════════════════════════════════════
//  TAB: INVENTARIOS (mejorado con resumen + escaneo rápido)
// ══════════════════════════════════════════════

function InventarioTab({ bodega, user }: { bodega: ReturnType<typeof useBodega>; user: any }) {
  const { items, crearInventario, loadInventarios, loadConteos, registrarConteo, finalizarInventario } = bodega
  const [sesiones, setSesiones] = useState<InventarioSesion[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSesion, setActiveSesion] = useState<InventarioSesion | null>(null)
  const [conteos, setConteos] = useState<InventarioConteo[]>([])
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [soloConStock, setSoloConStock] = useState(true)
  const [resumenFinal, setResumenFinal] = useState<{ contados: number; ajustados: number; valorDif: number; precision: number } | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    const data = await loadInventarios()
    setSesiones(data)
    setLoading(false)
  }, [loadInventarios])

  useEffect(() => { reload() }, [reload])

  const handleCrear = async () => {
    if (!user || !nuevoNombre.trim()) return
    const itemsToCount = soloConStock ? items.filter(i => i.bodegaId) : items
    if (itemsToCount.length === 0) return
    setCreando(true)
    try {
      await crearInventario(nuevoNombre.trim(), user.id, user.nombre, itemsToCount)
      setNuevoNombre('')
      await reload()
    } finally { setCreando(false) }
  }

  const handleOpenSesion = async (s: InventarioSesion) => {
    setActiveSesion(s)
    const data = await loadConteos(s.id)
    setConteos(data)
  }

  const handleConteo = async (codigoSAP: string, stockFisico: number, obs?: string) => {
    if (!user || !activeSesion) return
    await registrarConteo(activeSesion.id, codigoSAP, stockFisico, user.id, user.nombre, obs)
    const data = await loadConteos(activeSesion.id)
    setConteos(data)
    const updated = await loadInventarios()
    setSesiones(updated)
    setActiveSesion(updated.find(s => s.id === activeSesion.id) || activeSesion)
  }

  const handleFinalizar = async () => {
    if (!user || !activeSesion) return
    if (!confirm('¿Finalizar inventario y ajustar stock según conteo físico? Los ítems no contados NO se modificarán.')) return
    // Calcular resumen antes de finalizar
    const contados = conteos.filter(c => c.stockFisico !== null)
    const ajustados = contados.filter(c => c.diferencia !== 0)
    const valorDif = ajustados.reduce((sum, c) => {
      const item = items.find(i => i.codigoSAP === c.codigoSAP)
      const costo = item?.costoCompra ?? item?.valorUnitario ?? 0
      return sum + Math.abs(c.diferencia) * costo
    }, 0)
    const precision = contados.length > 0 ? Math.round(((contados.length - ajustados.length) / contados.length) * 100) : 100

    await finalizarInventario(activeSesion.id, user.id, user.nombre)
    setResumenFinal({ contados: contados.length, ajustados: ajustados.length, valorDif, precision })
    setActiveSesion(null)
    await reload()
  }

  // Resumen post-finalización
  if (resumenFinal) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <div className="h-16 w-16 rounded-2xl bg-emerald-500/[0.08] flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-foreground">Inventario finalizado</h3>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{resumenFinal.contados}</p>
            <p className="text-[10px] text-muted-foreground">Ítems contados</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{resumenFinal.ajustados}</p>
            <p className="text-[10px] text-muted-foreground">Con diferencia</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-cat-6-ink">${resumenFinal.valorDif.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-muted-foreground">Valor diferencias</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className={`text-2xl font-bold ${resumenFinal.precision >= 95 ? 'text-emerald-600' : resumenFinal.precision >= 80 ? 'text-amber-600' : 'text-red-600'}`}>{resumenFinal.precision}%</p>
            <p className="text-[10px] text-muted-foreground">Precisión</p>
          </div>
        </div>
        <button onClick={() => setResumenFinal(null)} className="mt-4 px-6 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90">
          Volver a inventarios
        </button>
      </div>
    )
  }

  if (activeSesion) {
    const contados = conteos.filter(c => c.stockFisico !== null)
    const conDif = contados.filter(c => c.diferencia !== 0)

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => setActiveSesion(null)} className="text-xs text-primary hover:underline mb-1 flex items-center gap-1">
              ← Volver a inventarios
            </button>
            <h3 className="text-base font-bold text-foreground">{activeSesion.nombre}</h3>
            <p className="text-xs text-muted-foreground">
              {contados.length}/{conteos.length} contados • {conDif.length} con diferencia
              {activeSesion.estado === 'finalizado' && <span className="ml-2 text-emerald-600 font-semibold">✓ Finalizado</span>}
            </p>
          </div>
          {activeSesion.estado === 'en_curso' && (
            <button onClick={handleFinalizar}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 transition-colors">
              <CheckCircle2 className="h-4 w-4" /> Finalizar y ajustar
            </button>
          )}
        </div>

        <div className="bg-muted rounded-lg p-3 border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progreso</span>
            <span>{conteos.length > 0 ? Math.round((contados.length / conteos.length) * 100) : 0}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${conteos.length > 0 ? (contados.length / conteos.length) * 100 : 0}%` }} />
          </div>
        </div>

        <ConteoList conteos={conteos} isFinalizado={activeSesion.estado === 'finalizado'} onConteo={handleConteo} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Nuevo inventario periódico</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Nombre</label>
            <input type="text" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
              placeholder={`Inventario ${new Date().toLocaleDateString('es-CL')}`} className={INPUT} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer shrink-0 pb-2">
            <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} className="rounded" />
            Solo con stock configurado
          </label>
          <button onClick={handleCrear} disabled={creando || !nuevoNombre.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear
          </button>
        </div>
        {soloConStock && items.filter(i => i.bodegaId).length === 0 ? (
          <p className="text-[10px] text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />No hay ítems con stock configurado.</p>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-2">Se incluirán {soloConStock ? items.filter(i => i.bodegaId).length : items.length} ítems con código SAP</p>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 text-primary animate-spin" /></div>
      ) : sesiones.length === 0 ? (
        <EmptyState message="No hay inventarios registrados" />
      ) : (
        <div className="space-y-2">
          {sesiones.map(s => (
            <button key={s.id} onClick={() => handleOpenSesion(s)}
              className="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:bg-muted transition-colors text-left">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${s.estado === 'finalizado' ? 'bg-emerald-500/[0.08]' : 'bg-amber-500/[0.08]'}`}>
                {s.estado === 'finalizado' ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <ClipboardList className="h-5 w-5 text-amber-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.nombre}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                  <span>{s.contados}/{s.totalItems} contados</span>
                  {s.conDiferencia > 0 && <span className="text-amber-600">{s.conDiferencia} con diferencia</span>}
                  <span>{s.creadoPorNombre}</span>
                  <span>{s.createdAt.toLocaleDateString('es-CL')}</span>
                </div>
              </div>
              {s.estado === 'en_curso' && <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/[0.08] text-amber-600 font-semibold uppercase shrink-0">En curso</span>}
              {s.estado === 'finalizado' && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/[0.08] text-emerald-600 font-semibold uppercase shrink-0">Finalizado</span>}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lista de conteos (con escaneo rápido) ──

function ConteoList({ conteos, isFinalizado, onConteo }: {
  conteos: InventarioConteo[]; isFinalizado: boolean
  onConteo: (sap: string, stockFisico: number, obs?: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'pendientes' | 'contados' | 'diferencias'>('pendientes')
  const [editingSAP, setEditingSAP] = useState<string | null>(null)
  const [editValue, setEditValue] = useState(0)
  const [editObs, setEditObs] = useState('')
  const [conteoSearch, setConteoSearch] = useState('')
  const [quickScan, setQuickScan] = useState(false)

  const pendientes = conteos.filter(c => c.stockFisico === null)
  const contados = conteos.filter(c => c.stockFisico !== null)
  const conDif = contados.filter(c => c.diferencia !== 0)

  const baseList = tab === 'pendientes' ? pendientes : tab === 'diferencias' ? conDif : contados
  const visible = useMemo(() => {
    if (!conteoSearch.trim()) return baseList
    const terms = normalizeForSearch(conteoSearch).split(/\s+/).filter(Boolean)
    return baseList.filter(c => {
      const h = normalizeForSearch(`${c.codigoSAP} ${c.textoBreve}`)
      return haystackMatchesAll(h, terms)
    })
  }, [baseList, conteoSearch])

  const handleSave = async (sap: string) => {
    await onConteo(sap, editValue, editObs)
    setEditingSAP(null)
    setEditObs('')
    // Escaneo rápido: avanzar al siguiente pendiente
    if (quickScan) {
      const nextPending = pendientes.find(c => c.codigoSAP !== sap)
      if (nextPending) {
        setEditingSAP(nextPending.codigoSAP)
        setEditValue(nextPending.stockSistema)
      }
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        {[
          { id: 'pendientes' as const, label: 'Pendientes', count: pendientes.length, color: 'text-amber-600' },
          { id: 'contados' as const, label: 'Contados', count: contados.length, color: 'text-emerald-600' },
          { id: 'diferencias' as const, label: 'Diferencias', count: conDif.length, color: 'text-red-600' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
            {t.label} <span className={t.color}>{t.count}</span>
          </button>
        ))}
        <div className="flex-1" />
        {!isFinalizado && tab === 'pendientes' && (
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={quickScan} onChange={e => setQuickScan(e.target.checked)} className="rounded h-3 w-3" />
            <Zap className="h-3 w-3" /> Escaneo rápido
          </label>
        )}
      </div>

      {conteos.length > 10 && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nombre o SAP…" value={conteoSearch} onChange={e => setConteoSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground" />
          {conteoSearch && <button onClick={() => setConteoSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground" /></button>}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState message={conteoSearch ? 'Sin coincidencias' : tab === 'pendientes' ? 'Todo contado' : 'Sin ítems'} />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border/50 max-h-[50vh] overflow-y-auto">
          {visible.map(c => (
            <div key={c.codigoSAP} className="px-4 py-2.5 hover:bg-muted transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.textoBreve}</p>
                  <span className="text-[10px] font-mono text-primary">{c.codigoSAP}</span>
                </div>
                <div className="text-center shrink-0 w-16">
                  <p className="text-[9px] text-muted-foreground uppercase">Sistema</p>
                  <p className="text-sm font-bold text-foreground tabular-nums">{c.stockSistema}</p>
                </div>
                {c.stockFisico !== null ? (
                  <>
                    <div className="text-center shrink-0 w-16">
                      <p className="text-[9px] text-muted-foreground uppercase">Físico</p>
                      <p className="text-sm font-bold text-foreground tabular-nums">{c.stockFisico}</p>
                    </div>
                    <div className="text-center shrink-0 w-16">
                      <p className="text-[9px] text-muted-foreground uppercase">Dif.</p>
                      <p className={`text-sm font-bold tabular-nums ${c.diferencia > 0 ? 'text-emerald-600' : c.diferencia < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {c.diferencia > 0 ? '+' : ''}{c.diferencia}
                      </p>
                    </div>
                    {!isFinalizado && (
                      <button onClick={() => { setEditingSAP(c.codigoSAP); setEditValue(c.stockFisico!); setEditObs(c.observaciones || '') }}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    )}
                  </>
                ) : (
                  editingSAP === c.codigoSAP ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <input type="number" min={0} value={editValue} onChange={e => setEditValue(Number(e.target.value))}
                        className="w-20 px-2 py-1 text-sm text-center bg-muted border border-border rounded-lg tabular-nums font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground" autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleSave(c.codigoSAP) }} />
                      {!quickScan && <input type="text" value={editObs} onChange={e => setEditObs(e.target.value)} placeholder="Obs." className="w-28 px-2 py-1 text-xs bg-muted border border-border rounded-lg text-foreground" />}
                      <button onClick={() => handleSave(c.codigoSAP)} className="p-1 rounded bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditingSAP(null)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingSAP(c.codigoSAP); setEditValue(c.stockSistema) }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors shrink-0">
                      <CircleDot className="h-3.5 w-3.5" /> Contar
                    </button>
                  )
                )}
              </div>
              {c.observaciones && c.stockFisico !== null && <p className="text-[10px] text-muted-foreground mt-1 ml-1">Obs: {c.observaciones}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
//  TAB: MOVIMIENTOS
// ══════════════════════════════════════════════

type MovFilter = 'todos' | 'entrada' | 'salida' | 'ajuste'

function exportMovsCsv(movs: MovimientoBodega[]) {
  const header = 'Fecha,Hora,Tipo,Código SAP,Cantidad,Stock Resultante,Motivo,Realizado por\n'
  const rows = movs.map(m =>
    [m.createdAt.toLocaleDateString('es-CL'), m.createdAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }), m.tipo, m.bodegaItemId, m.cantidad, m.stockResultante, `"${(m.motivo || '').replace(/"/g, '""')}"`, m.realizadoPorNombre].join(',')
  ).join('\n')
  const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `movimientos_bodega_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function MovimientosTab({ bodega }: { bodega: ReturnType<typeof useBodega> }) {
  const [movimientos, setMovimientos] = useState<MovimientoBodega[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<MovFilter>('todos')
  const [searchMov, setSearchMov] = useState('')

  const { loadMovimientosRecientes } = bodega
  useEffect(() => {
    setLoading(true)
    loadMovimientosRecientes(50).then(data => {
      setMovimientos(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [loadMovimientosRecientes])

  const filtered = useMemo(() => {
    let result = movimientos
    if (filtroTipo !== 'todos') result = result.filter(m => m.tipo === filtroTipo)
    if (searchMov.trim()) {
      const terms = normalizeForSearch(searchMov).split(/\s+/).filter(Boolean)
      result = result.filter(m => {
        const h = normalizeForSearch(`${m.bodegaItemId} ${m.motivo} ${m.realizadoPorNombre}`)
        return haystackMatchesAll(h, terms)
      })
    }
    return result
  }, [movimientos, filtroTipo, searchMov])

  const entradas = movimientos.filter(m => m.tipo === 'entrada').length
  const salidas = movimientos.filter(m => m.tipo === 'salida').length
  const ajustes = movimientos.filter(m => m.tipo === 'ajuste').length

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 text-primary animate-spin" /></div>

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {[
          { f: 'todos' as MovFilter, label: 'Total', count: movimientos.length, icon: History, color: 'text-primary', border: 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' },
          { f: 'entrada' as MovFilter, label: 'Entradas', count: entradas, icon: ArrowDownCircle, color: 'text-emerald-600', border: 'border-emerald-500/40 bg-emerald-500/[0.08] ring-1 ring-emerald-500/20' },
          { f: 'salida' as MovFilter, label: 'Salidas', count: salidas, icon: ArrowUpCircle, color: 'text-red-600', border: 'border-red-500/40 bg-red-500/[0.08] ring-1 ring-red-500/20' },
          { f: 'ajuste' as MovFilter, label: 'Ajustes', count: ajustes, icon: Settings2, color: 'text-primary', border: 'border-blue-500/40 bg-primary/[0.08] ring-1 ring-blue-500/20' },
        ].map(o => {
          const I = o.icon
          return (
            <button key={o.f} onClick={() => setFiltroTipo(o.f)}
              className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${filtroTipo === o.f ? o.border : 'border-border bg-card hover:bg-muted'}`}>
              <I className={`h-4 w-4 ${o.color}`} />
              <div><p className="text-lg font-bold text-foreground tabular-nums">{o.count}</p><p className="text-[10px] text-muted-foreground">{o.label}</p></div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por SAP, motivo, usuario…" value={searchMov} onChange={e => setSearchMov(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-muted border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground" />
          {searchMov && <button onClick={() => setSearchMov('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
        <button onClick={() => exportMovsCsv(filtered)} title="Exportar CSV" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted border border-border rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0">
          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Exportar</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState message={movimientos.length === 0 ? 'Sin movimientos registrados' : 'Sin resultados'} />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="hidden sm:grid grid-cols-[90px_80px_1fr_80px_80px_120px] gap-2 px-4 py-2 bg-muted border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <span>Fecha</span><span>Tipo</span><span>Motivo</span><span className="text-center">Cantidad</span><span className="text-center">Stock</span><span>Realizado por</span>
          </div>
          <div className="divide-y divide-border/50 max-h-[55vh] overflow-y-auto">
            {filtered.map(m => {
              const tipoConfig = {
                entrada: { label: 'Entrada', color: 'text-emerald-600', bg: 'bg-emerald-500/[0.08]', icon: ArrowDownCircle },
                salida: { label: 'Salida', color: 'text-red-600', bg: 'bg-red-500/[0.08]', icon: ArrowUpCircle },
                ajuste: { label: 'Ajuste', color: 'text-primary', bg: 'bg-primary/[0.08]', icon: Settings2 },
              }[m.tipo]
              const TIcon = tipoConfig.icon
              return (
                <div key={m.id} className="sm:grid sm:grid-cols-[90px_80px_1fr_80px_80px_120px] gap-2 px-4 py-2.5 hover:bg-muted transition-colors">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    <p>{m.createdAt.toLocaleDateString('es-CL')}</p>
                    <p className="text-[10px] text-muted-foreground/60">{m.createdAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-6 w-6 rounded flex items-center justify-center shrink-0 ${tipoConfig.bg}`}><TIcon className={`h-3.5 w-3.5 ${tipoConfig.color}`} /></div>
                    <span className={`text-[10px] font-semibold ${tipoConfig.color}`}>{tipoConfig.label}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-foreground truncate">{m.motivo || '—'}</p>
                    <span className="text-[10px] font-mono text-primary">{m.bodegaItemId}</span>
                  </div>
                  <div className="flex items-center justify-center">
                    <span className={`text-sm font-bold tabular-nums ${tipoConfig.color}`}>
                      {m.tipo === 'ajuste' ? `→${m.stockResultante}` : `${m.tipo === 'entrada' ? '+' : '-'}${m.cantidad}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-center"><span className="text-xs text-muted-foreground tabular-nums">{m.stockResultante}</span></div>
                  <div className="flex items-center"><span className="text-xs text-muted-foreground truncate">{m.realizadoPorNombre || '—'}</span></div>
                </div>
              )
            })}
          </div>
          <div className="px-4 py-2 bg-muted border-t border-border text-xs text-muted-foreground">{filtered.length} movimientos</div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
//  TAB: ESTADÍSTICAS (mejorada con rotación, ABC, stock muerto)
// ══════════════════════════════════════════════

function EstadisticasTab({ bodega }: { bodega: ReturnType<typeof useBodega> }) {
  const { items, stats, loadMovimientosRecientes } = bodega
  const [movimientos, setMovimientos] = useState<MovimientoBodega[]>([])
  const [movLoading, setMovLoading] = useState(true)

  useEffect(() => {
    setMovLoading(true)
    loadMovimientosRecientes(200).then(data => {
      setMovimientos(data)
      setMovLoading(false)
    }).catch(() => setMovLoading(false))
  }, [loadMovimientosRecientes])

  // Rotación por ítem (salidas / stock promedio)
  const rotacionData = useMemo(() => {
    if (movimientos.length === 0) return { itemRotacion: [] as { item: BodegaMergedItem; salidas: number; rotacion: number }[], avgRotacion: 0 }
    const salidasPorItem = new Map<string, number>()
    for (const m of movimientos) {
      if (m.tipo === 'salida') salidasPorItem.set(m.bodegaItemId, (salidasPorItem.get(m.bodegaItemId) || 0) + m.cantidad)
    }
    const itemRotacion = items.filter(i => i.bodegaId).map(item => {
      const salidas = salidasPorItem.get(item.bodegaId || item.codigoSAP) || 0
      const stockProm = Math.max(item.stockActual, 1)
      return { item, salidas, rotacion: salidas / stockProm }
    }).sort((a, b) => b.rotacion - a.rotacion)
    const avgRotacion = itemRotacion.length > 0 ? itemRotacion.reduce((s, r) => s + r.rotacion, 0) / itemRotacion.length : 0
    return { itemRotacion, avgRotacion }
  }, [items, movimientos])

  // ABC automático
  const abcData = useMemo(() => {
    const conStock = items.filter(i => i.bodegaId)
    const sorted = conStock.map(i => ({
      item: i,
      valorTotal: (i.costoCompra ?? i.valorUnitario ?? 0) * i.stockActual,
    })).sort((a, b) => b.valorTotal - a.valorTotal)
    const totalValor = sorted.reduce((s, r) => s + r.valorTotal, 0)
    let acum = 0
    const classified = sorted.map(r => {
      acum += r.valorTotal
      const pctAcum = totalValor > 0 ? (acum / totalValor) * 100 : 0
      const abc: 'A' | 'B' | 'C' = pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C'
      return { ...r, abc, pctAcum }
    })
    return {
      A: classified.filter(c => c.abc === 'A'),
      B: classified.filter(c => c.abc === 'B'),
      C: classified.filter(c => c.abc === 'C'),
      totalValor,
    }
  }, [items])

  // Stock muerto (sin movimiento reciente)
  const deadStock = useMemo(() => {
    if (movimientos.length === 0) return { noMov90: [] as BodegaMergedItem[], noMov180: [] as BodegaMergedItem[] }
    const lastMovDate = new Map<string, Date>()
    for (const m of movimientos) {
      const prev = lastMovDate.get(m.bodegaItemId)
      if (!prev || m.createdAt > prev) lastMovDate.set(m.bodegaItemId, m.createdAt)
    }
    const now = new Date()
    const d90 = 90 * 24 * 60 * 60 * 1000
    const d180 = 180 * 24 * 60 * 60 * 1000
    const conStock = items.filter(i => i.bodegaId && i.stockActual > 0)
    const noMov90 = conStock.filter(i => {
      const last = lastMovDate.get(i.bodegaId || i.codigoSAP)
      return !last || (now.getTime() - last.getTime()) > d90
    })
    const noMov180 = conStock.filter(i => {
      const last = lastMovDate.get(i.bodegaId || i.codigoSAP)
      return !last || (now.getTime() - last.getTime()) > d180
    })
    return { noMov90, noMov180 }
  }, [items, movimientos])

  const movEntradas = movimientos.filter(m => m.tipo === 'entrada').length
  const movSalidas = movimientos.filter(m => m.tipo === 'salida').length
  const movAjustes = movimientos.filter(m => m.tipo === 'ajuste').length
  const coberturaPct = stats.total > 0 ? Math.round((stats.conStock / stats.total) * 100) : 0
  const okCount = stats.stockOk
  const proveedores = useMemo(() => {
    const map = new Map<string, number>()
    for (const i of items) { if (i.proveedor) map.set(i.proveedor, (map.get(i.proveedor) || 0) + 1) }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="Total ítems SAP" value={stats.total} icon={Package} color="text-primary" />
        <KpiCard label="Con stock configurado" value={stats.conStock} icon={PackageCheck} color="text-emerald-600" sub={`${coberturaPct}% cobertura`} />
        <KpiCard label="Valor inventario" value={`$${stats.valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`} icon={DollarSign} color="text-cat-6-ink" />
        <KpiCard label="Bajo / Sin stock" value={`${stats.bajoStock} / ${stats.sinStock}`} icon={AlertTriangle} color="text-amber-600" />
      </div>

      {/* Salud + Cobertura */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Salud del inventario</p>
          <div className="flex items-center gap-3 mb-3">
            {[
              { icon: ShieldCheck, label: 'OK', count: okCount, color: 'text-emerald-600', bg: 'bg-emerald-500/[0.08]' },
              { icon: ShieldAlert, label: 'Bajo', count: stats.bajoStock, color: 'text-amber-600', bg: 'bg-amber-500/[0.08]' },
              { icon: ShieldX, label: 'Sin stock', count: stats.sinStock, color: 'text-red-600', bg: 'bg-red-500/[0.08]' },
            ].map(s => (
              <div key={s.label} className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border border-border bg-muted">
                <s.icon className={`h-5 w-5 ${s.color}`} /><span className="text-lg font-bold text-foreground tabular-nums">{s.count}</span><span className="text-[9px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
          {stats.conStock > 0 && (
            <div className="h-3 rounded-full overflow-hidden flex bg-muted">
              {okCount > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(okCount / stats.conStock) * 100}%` }} />}
              {stats.bajoStock > 0 && <div className="bg-amber-500 h-full transition-all" style={{ width: `${(stats.bajoStock / stats.conStock) * 100}%` }} />}
              {stats.sinStock > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${(stats.sinStock / stats.conStock) * 100}%` }} />}
            </div>
          )}
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Cobertura de bodega</p>
          <div className="flex items-center justify-center">
            <div className="relative h-28 w-28">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                  className={coberturaPct >= 80 ? 'text-emerald-500' : coberturaPct >= 50 ? 'text-amber-500' : 'text-red-500'}
                  strokeDasharray={`${(coberturaPct / 100) * 97.4} ${97.4 - (coberturaPct / 100) * 97.4}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground tabular-nums">{coberturaPct}%</span>
                <span className="text-[9px] text-muted-foreground">configurados</span>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span><strong className="text-foreground">{stats.conStock}</strong> configurados</span>
            <span><strong className="text-foreground">{stats.sinConfig}</strong> sin configurar</span>
          </div>
        </div>
      </div>

      {/* Clasificación ABC automática */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-cat-6-tint/[0.08]">
          <p className="text-xs font-semibold text-cat-6-ink uppercase tracking-wide flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Clasificación ABC (por valor inventario)
          </p>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-3 gap-3 mb-3">
            {[
              { label: 'A — Crítico', data: abcData.A, color: 'text-red-600', bg: 'bg-red-500/[0.08]', desc: '80% del valor' },
              { label: 'B — Importante', data: abcData.B, color: 'text-amber-600', bg: 'bg-amber-500/[0.08]', desc: '15% del valor' },
              { label: 'C — Estándar', data: abcData.C, color: 'text-emerald-600', bg: 'bg-emerald-500/[0.08]', desc: '5% del valor' },
            ].map(cat => (
              <div key={cat.label} className={`rounded-lg border border-border p-3 ${cat.bg}`}>
                <p className={`text-xs font-semibold ${cat.color}`}>{cat.label}</p>
                <p className="text-xl font-bold text-foreground tabular-nums mt-1">{cat.data.length}</p>
                <p className="text-[9px] text-muted-foreground">{cat.desc}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  ${cat.data.reduce((s, r) => s + r.valorTotal, 0).toLocaleString('es-CL', { maximumFractionDigits: 0 })}
                </p>
              </div>
            ))}
          </div>
          {/* Barra proporcional */}
          {abcData.totalValor > 0 && (
            <div className="h-4 rounded-full overflow-hidden flex bg-muted">
              {abcData.A.length > 0 && <div className="bg-red-500/70 h-full" style={{ width: `${(abcData.A.reduce((s, r) => s + r.valorTotal, 0) / abcData.totalValor) * 100}%` }} title={`A: ${abcData.A.length} ítems`} />}
              {abcData.B.length > 0 && <div className="bg-amber-500/70 h-full" style={{ width: `${(abcData.B.reduce((s, r) => s + r.valorTotal, 0) / abcData.totalValor) * 100}%` }} title={`B: ${abcData.B.length} ítems`} />}
              {abcData.C.length > 0 && <div className="bg-emerald-500/70 h-full" style={{ width: `${(abcData.C.reduce((s, r) => s + r.valorTotal, 0) / abcData.totalValor) * 100}%` }} title={`C: ${abcData.C.length} ítems`} />}
            </div>
          )}
        </div>
      </div>

      {/* Stock muerto + Rotación */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Stock sin movimiento */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted-foreground/[0.10]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Archive className="h-3.5 w-3.5" /> Stock sin movimiento
            </p>
          </div>
          {movLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 text-primary animate-spin" /></div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg border border-border bg-amber-500/[0.08] p-3 text-center">
                  <p className="text-xl font-bold text-amber-600 tabular-nums">{deadStock.noMov90.length}</p>
                  <p className="text-[9px] text-muted-foreground">+90 días</p>
                </div>
                <div className="flex-1 rounded-lg border border-border bg-red-500/[0.08] p-3 text-center">
                  <p className="text-xl font-bold text-red-600 tabular-nums">{deadStock.noMov180.length}</p>
                  <p className="text-[9px] text-muted-foreground">+180 días</p>
                </div>
              </div>
              {deadStock.noMov180.length > 0 && (
                <div className="max-h-[150px] overflow-y-auto divide-y divide-border/50 border border-border rounded-lg">
                  {deadStock.noMov180.slice(0, 8).map(item => (
                    <div key={item.codigoSAP} className="px-3 py-1.5 flex items-center gap-2">
                      <span className="text-xs text-foreground truncate flex-1">{item.textoBreve}</span>
                      <span className="text-[10px] font-mono text-primary shrink-0">{item.codigoSAP}</span>
                      <span className="text-xs font-bold text-muted-foreground tabular-nums shrink-0">{item.stockActual}</span>
                    </div>
                  ))}
                  {deadStock.noMov180.length > 8 && <p className="px-3 py-1.5 text-[10px] text-muted-foreground text-center">+{deadStock.noMov180.length - 8} más</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rotación */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-primary/[0.08]">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Rotación de inventario
            </p>
          </div>
          {movLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 text-primary animate-spin" /></div>
          ) : (
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-border bg-primary/[0.08] p-3 text-center">
                <p className="text-xl font-bold text-primary tabular-nums">{rotacionData.avgRotacion.toFixed(2)}</p>
                <p className="text-[9px] text-muted-foreground">Rotación promedio</p>
              </div>
              {rotacionData.itemRotacion.filter(r => r.salidas > 0).length > 0 && (
                <div className="max-h-[150px] overflow-y-auto divide-y divide-border/50 border border-border rounded-lg">
                  <div className="px-3 py-1 bg-muted text-[9px] text-muted-foreground font-semibold flex items-center">
                    <span className="flex-1">Ítem</span><span className="w-14 text-center">Salidas</span><span className="w-14 text-right">Rotación</span>
                  </div>
                  {rotacionData.itemRotacion.filter(r => r.salidas > 0).slice(0, 8).map(r => (
                    <div key={r.item.codigoSAP} className="px-3 py-1.5 flex items-center gap-2">
                      <span className="text-xs text-foreground truncate flex-1">{r.item.textoBreve}</span>
                      <span className="text-xs font-bold text-muted-foreground tabular-nums w-14 text-center">{r.salidas}</span>
                      <span className="text-xs font-bold text-primary tabular-nums w-14 text-right">{r.rotacion.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Alertas */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-red-500/[0.08]">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" /> Alertas ({stats.alertas.length})</p>
          </div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {stats.alertas.length === 0 ? <p className="p-4 text-xs text-muted-foreground text-center">Sin alertas</p>
            : stats.alertas.map(item => (
              <div key={item.codigoSAP} className="px-4 py-2.5 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${item.stockActual === 0 ? 'bg-red-500/[0.08]' : 'bg-amber-500/[0.08]'}`}>
                  {item.stockActual === 0 ? <PackageX className="h-4 w-4 text-red-600" /> : <TrendingDown className="h-4 w-4 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground truncate">{item.textoBreve}</p><p className="text-[10px] font-mono text-primary">{item.codigoSAP}</p></div>
                <div className="text-right shrink-0"><p className={`text-sm font-bold tabular-nums ${item.stockActual === 0 ? 'text-red-600' : 'text-amber-600'}`}>{item.stockActual}</p><p className="text-[9px] text-muted-foreground">mín: {item.stockMinimo}</p></div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribución por tipo */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distribución por tipo</p></div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {stats.tipoDistribution.map(([tipo, count]) => (
              <div key={tipo} className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-foreground">{tipo}</span>
                <div className="flex items-center gap-2"><div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary/60 rounded-full" style={{ width: `${(count / stats.total) * 100}%` }} /></div><span className="text-xs font-bold text-muted-foreground tabular-nums w-8 text-right">{count}</span></div>
              </div>
            ))}
          </div>
        </div>

        {/* Top por valor */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-cat-6-tint/[0.08]"><p className="text-xs font-semibold text-cat-6-ink uppercase tracking-wide">Top 10 por valor</p></div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {stats.topByValue.length === 0 ? <p className="p-4 text-xs text-muted-foreground text-center">Sin datos</p>
            : stats.topByValue.map((item, i) => (
              <div key={item.codigoSAP} className="px-4 py-2 flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground/50 w-4 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground truncate">{item.textoBreve}</p><p className="text-[10px] text-muted-foreground">{item.stockActual} × ${(item.costoCompra ?? item.valorUnitario ?? 0).toLocaleString('es-CL')}</p></div>
                <span className="text-xs font-bold text-cat-6-ink tabular-nums shrink-0">${item.valorInventario.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Movimientos recientes */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Movimientos recientes {!movLoading && <span className="text-muted-foreground/50">({movEntradas}↓ {movSalidas}↑ {movAjustes}⟳)</span>}
            </p>
          </div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {movLoading ? <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 text-primary animate-spin" /></div>
            : movimientos.length === 0 ? <p className="p-4 text-xs text-muted-foreground text-center">Sin movimientos</p>
            : movimientos.slice(0, 15).map(m => (
              <div key={m.id} className="px-4 py-2 flex items-center gap-2">
                <span className={`text-[10px] font-bold w-12 shrink-0 ${m.tipo === 'entrada' ? 'text-emerald-600' : m.tipo === 'salida' ? 'text-red-600' : 'text-primary'}`}>
                  {m.tipo === 'entrada' ? '↓ Entr.' : m.tipo === 'salida' ? '↑ Sal.' : '⟳ Ajuste'}
                </span>
                <span className="text-xs font-bold text-foreground tabular-nums w-8 shrink-0">{m.tipo === 'ajuste' ? `→${m.stockResultante}` : `${m.tipo === 'entrada' ? '+' : '-'}${m.cantidad}`}</span>
                <span className="text-xs text-muted-foreground truncate flex-1">{m.motivo || m.bodegaItemId}</span>
                <span className="text-[10px] text-muted-foreground/50 shrink-0">{m.createdAt.toLocaleDateString('es-CL')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════ Cobertura por equipo (estilo Excel Inicio) ════ */}
      {(() => {
        // Agrupar ítems por equipo
        const equipoMap = new Map<string, { nombre: string; total: number; conStock: number; unidades: number; valor: number }>()
        for (const item of items) {
          for (const eq of item.equipos) {
            const key = eq.machineId
            const prev = equipoMap.get(key) || { nombre: eq.machineName, total: 0, conStock: 0, unidades: 0, valor: 0 }
            prev.total++
            if (item.bodegaId && item.stockActual > 0) {
              prev.conStock++
              prev.unidades += item.stockActual
              prev.valor += item.stockActual * (item.costoCompra ?? item.valorUnitario ?? 0)
            }
            equipoMap.set(key, prev)
          }
        }
        const equipoRows = [...equipoMap.entries()]
          .map(([id, d]) => ({ id, ...d, pct: d.total > 0 ? Math.round((d.conStock / d.total) * 100) : 0 }))
          .sort((a, b) => b.valor - a.valor)
        const totalValorEquipos = equipoRows.reduce((s, r) => s + r.valor, 0)
        const totalUnidadesEquipos = equipoRows.reduce((s, r) => s + r.unidades, 0)

        return equipoRows.length > 0 ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-cat-7-tint/[0.08]">
              <p className="text-xs font-semibold text-cat-7-ink uppercase tracking-wide flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Cobertura por equipo
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted text-[9px] uppercase tracking-wider text-muted-foreground/60">
                    <th className="px-4 py-2 text-left font-semibold">Equipo</th>
                    <th className="px-2 py-2 text-center font-semibold">Repuestos</th>
                    <th className="px-2 py-2 text-center font-semibold">Con stock</th>
                    <th className="px-2 py-2 text-center font-semibold">Unidades</th>
                    <th className="px-2 py-2 text-right font-semibold">Valor ($)</th>
                    <th className="px-4 py-2 text-center font-semibold w-40">Cobertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {equipoRows.map(row => (
                    <tr key={row.id} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-2 font-medium text-foreground truncate max-w-[200px]">{row.nombre}</td>
                      <td className="px-2 py-2 text-center text-muted-foreground tabular-nums">{row.total}</td>
                      <td className="px-2 py-2 text-center tabular-nums font-semibold text-emerald-600">{row.conStock}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{row.unidades.toLocaleString('es-CL')}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-cat-6-ink">${row.valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${row.pct >= 50 ? 'bg-emerald-500' : row.pct >= 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(row.pct, 100)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] font-bold tabular-nums w-8 text-right ${row.pct >= 50 ? 'text-emerald-600' : row.pct >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                            {row.pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted font-bold text-foreground">
                    <td className="px-4 py-2.5">TOTAL PLANTA</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{stats.total}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums text-emerald-600">{stats.conStock}</td>
                    <td className="px-2 py-2.5 text-center tabular-nums">{totalUnidadesEquipos.toLocaleString('es-CL')}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-cat-6-ink">${totalValorEquipos.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${coberturaPct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold tabular-nums w-8 text-right text-primary">{coberturaPct}%</span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ) : null
      })()}

      {/* ════ Resumen por tipo de repuesto (estilo Excel "Por Tipo") ════ */}
      {(() => {
        const tipoMap = new Map<string, { total: number; conStock: number; fisicos: number; valor: number }>()
        for (const item of items) {
          const tipo = item.tipo || 'SIN TIPO'
          const prev = tipoMap.get(tipo) || { total: 0, conStock: 0, fisicos: 0, valor: 0 }
          prev.total++
          if (item.bodegaId && item.stockActual > 0) {
            prev.conStock++
            prev.fisicos += item.stockActual
            prev.valor += item.stockActual * (item.costoCompra ?? item.valorUnitario ?? 0)
          }
          tipoMap.set(tipo, prev)
        }
        const tipoRows = [...tipoMap.entries()]
          .map(([tipo, d]) => ({ tipo, ...d, pct: d.total > 0 ? Math.round((d.conStock / d.total) * 100) : 0 }))
          .sort((a, b) => b.total - a.total)

        return tipoRows.length > 0 ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-cat-3-tint/[0.08]">
              <p className="text-xs font-semibold text-cat-3-ink uppercase tracking-wide flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Resumen por tipo de repuesto
              </p>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="bg-muted text-[9px] uppercase tracking-wider text-muted-foreground/60">
                    <th className="px-4 py-2 text-left font-semibold">Tipo</th>
                    <th className="px-2 py-2 text-center font-semibold">Total</th>
                    <th className="px-2 py-2 text-center font-semibold">Con stock</th>
                    <th className="px-2 py-2 text-center font-semibold">Uds. f&iacute;sicas</th>
                    <th className="px-2 py-2 text-right font-semibold">Valor ($)</th>
                    <th className="px-4 py-2 text-center font-semibold w-36">Cobertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {tipoRows.map(row => (
                    <tr key={row.tipo} className="hover:bg-muted transition-colors">
                      <td className="px-4 py-2">
                        <CatTag tone={tipoTag(row.tipo === 'SIN TIPO' ? undefined : row.tipo)} className="uppercase">
                          {row.tipo}
                        </CatTag>
                      </td>
                      <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{row.total}</td>
                      <td className="px-2 py-2 text-center tabular-nums font-semibold text-emerald-600">{row.conStock}</td>
                      <td className="px-2 py-2 text-center tabular-nums text-muted-foreground">{row.fisicos}</td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium text-cat-6-ink">
                        {row.valor > 0 ? `$${row.valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })}` : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${row.pct >= 50 ? 'bg-emerald-500' : row.pct >= 20 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(row.pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold tabular-nums w-8 text-right text-muted-foreground">{row.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null
      })()}

      {/* Proveedores */}
      {proveedores.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Proveedores ({proveedores.length})</p>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-border/50">
            {proveedores.map(([prov, count]) => (
              <div key={prov} className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-foreground truncate">{prov}</span>
                <div className="flex items-center gap-2 shrink-0"><div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${(count / items.length) * 100}%` }} /></div><span className="text-xs font-bold text-muted-foreground tabular-nums w-8 text-right">{count}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
//  COMPONENTES COMPARTIDOS
// ══════════════════════════════════════════════

function StatCard({ icon: Icon, label, value, color, bg, onClick, active, sublabel }: {
  icon: typeof Package; label: string; value: string | number; color: string; bg: string; onClick: () => void; active: boolean; sublabel?: string
}) {
  return (
    <button onClick={onClick} className={['flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left',
      active ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:bg-muted'].join(' ')}>
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
      <div className="min-w-0">
        <p className="text-lg font-bold text-foreground leading-tight truncate">{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">{active && sublabel ? sublabel : label}</p>
      </div>
    </button>
  )
}

function KpiCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: typeof Package; color: string; sub?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-muted"><Icon className={`h-5 w-5 ${color}`} /></div>
      <div><p className="text-xl font-bold text-foreground tabular-nums">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p>{sub && <p className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</p>}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (<div className="text-center py-12 text-muted-foreground"><Package className="h-10 w-10 mx-auto mb-3 opacity-40" /><p className="text-sm font-medium">{message}</p></div>)
}

function Sparkline({ data, width = 80, height = 24, color = '#3b82f6' }: { data: number[]; width?: number; height?: number; color?: string }) {
  if (data.length < 2) return <span className="text-[9px] text-muted-foreground">—</span>
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pad = 2
  const coords = data.map((v, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }))
  const points = coords.map(c => `${c.x},${c.y}`).join(' ')
  const last = coords[coords.length - 1] ?? { x: 0, y: 0 }
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last.x} cy={last.y} r="2" fill={color} />
    </svg>
  )
}

/** Barra de progreso de stock con semáforo visual */
function StockBar({ actual, minimo, maximo }: { actual: number; minimo: number; maximo?: number }) {
  const tope = maximo && maximo > 0 ? maximo : Math.max(minimo * 2, actual, 1)
  const pct = Math.min(100, (actual / tope) * 100)
  const color = actual === 0 ? 'bg-red-500' : actual <= minimo ? 'bg-amber-500' : 'bg-emerald-500'
  const minimoPct = tope > 0 ? Math.min(100, (minimo / tope) * 100) : 0

  return (
    <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div className={`absolute inset-y-0 left-0 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      {minimo > 0 && <div className="absolute inset-y-0 w-px bg-amber-400/60" style={{ left: `${minimoPct}%` }} />}
    </div>
  )
}

function BodegaRow({ item, onEdit, onMovimiento, onHistorial, onToggleWatch, onOpenDrawer }: {
  item: BodegaMergedItem; onEdit: () => void; onMovimiento: () => void; onHistorial: () => void; onToggleWatch: () => void; onOpenDrawer: () => void
}) {
  const has = !!item.bodegaId
  const isBajo = has && item.stockMinimo > 0 && item.stockActual <= item.stockMinimo && item.stockActual > 0
  const isSin = has && item.stockActual === 0 && item.stockMinimo > 0
  const valorTotal = item.stockActual * (item.costoCompra ?? item.valorUnitario ?? 0)
  // Foto propia de bodega o, en su defecto, del catálogo (fotosReales/manual).
  const foto = item.fotos?.[0] || item.fotosCatalogo?.[0]

  // Acento lateral por estado: la respuesta "¿hay?" se lee de un vistazo al
  // escanear la grilla, sin leer números.
  // Stock 0 sin mínimo configurado no es alerta (regla de negocio), pero
  // tampoco puede pintarse verde: un "0" en verde se lee como "hay".
  const isCeroNeutro = has && item.stockActual === 0 && !isSin
  const accent = !has
    ? 'border-l-zinc-400/40 dark:border-l-zinc-500/40'
    : isSin
      ? 'border-l-red-500'
      : isBajo
        ? 'border-l-amber-400'
        : isCeroNeutro
          ? 'border-l-zinc-400/40 dark:border-l-zinc-500/40'
          : 'border-l-emerald-500/80'
  const stockColor = isSin
    ? 'text-red-600 dark:text-red-400'
    : isBajo
      ? 'text-amber-600 dark:text-amber-400'
      : isCeroNeutro
        ? 'text-zinc-500 dark:text-zinc-400'
        : 'text-emerald-600 dark:text-emerald-400'

  return (
    <div
      className={[
        'group relative flex flex-col rounded-xl border border-l-4 transition-all cursor-pointer',
        accent,
        isSin ? 'border-red-500/[0.25] bg-red-500/[0.08] hover:bg-red-500/[0.08]' :
        isBajo ? 'border-amber-500/[0.25] bg-amber-500/[0.08] hover:bg-amber-500/[0.08]' :
        'border-border bg-card hover:bg-muted',
      ].join(' ')}
      onClick={onOpenDrawer}
    >
      <div className="flex-1 p-3">
        {/* Nombre (2 líneas, sin cortar lo importante) + foto real si existe + favorito */}
        <div className="flex items-start gap-2">
          {foto && (
            <img src={foto} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" loading="lazy" />
          )}
          {item.textoBreve ? (
            <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground line-clamp-2">{item.textoBreve}</p>
          ) : (
            <p className="min-w-0 flex-1 text-sm font-medium italic leading-snug text-muted-foreground line-clamp-2">(sin nombre — SAP {item.codigoSAP})</p>
          )}
          <div className="shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={onToggleWatch} className="-m-1 p-1.5 rounded hover:bg-amber-500/[0.08] transition-colors">
              <Star className={`h-3.5 w-3.5 ${item.isWatched ? 'text-amber-600 fill-yellow-400' : 'text-muted-foreground/30 group-hover:text-muted-foreground/60'}`} />
            </button>
          </div>
        </div>

        {/* Lo que el técnico vino a buscar: ¿CUÁNTO hay? y ¿DÓNDE está? */}
        <div className="mt-2.5 flex items-end justify-between gap-2">
          {has ? (
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span className={`text-2xl font-bold leading-none tabular-nums ${stockColor}`}>{item.stockActual}</span>
              <span className="text-[11px] text-muted-foreground">{item.unidad}</span>
              {isSin && <span className="text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">sin stock</span>}
              {isBajo && <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">bajo mín</span>}
              {!isSin && !isBajo && item.stockMinimo > 0 && (
                <span className="text-[10px] text-muted-foreground">mín {item.stockMinimo}</span>
              )}
            </div>
          ) : (
            <span className="rounded-md bg-muted px-2 py-1 text-[11px] text-muted-foreground">Sin configurar</span>
          )}
          {item.ubicacionBodega && (
            <span className="inline-flex max-w-[55%] items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground" title={item.ubicacionBodega}>
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{item.ubicacionBodega}</span>
            </span>
          )}
        </div>

        {has && (
          <div className="mt-2">
            <StockBar actual={item.stockActual} minimo={item.stockMinimo} maximo={item.stockMaximo} />
          </div>
        )}

        {/* Meta secundaria */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-primary/[0.08] px-1.5 py-0.5 font-mono text-[10px] text-blue-600 dark:text-blue-400">{item.codigoSAP}</span>
          {item.tipo && <CatTag tone={tipoTag(item.tipo)} className="uppercase">{item.tipo}</CatTag>}
          {item.equipos.length > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={item.equipos.map(e => e.machineName).join(', ')}>
              <Layers className="h-2.5 w-2.5" />{item.equipos.length}
            </span>
          )}
          {valorTotal > 0 && (
            <span className="ml-auto text-[10px] font-medium tabular-nums text-violet-600 dark:text-violet-400">
              ${valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}
            </span>
          )}
        </div>
      </div>

      {/* Acciones: fila propia en móvil; en desktop flotan sobre la esquina al
          hacer hover (sin reservar una franja vacía en cada card). */}
      <div
        className="flex items-center justify-end gap-0.5 px-3 pb-2 sm:absolute sm:bottom-1.5 sm:right-1.5 sm:rounded-lg sm:border sm:border-border sm:bg-card/90 sm:p-0.5 sm:px-1 sm:pb-0.5 sm:shadow-sm sm:backdrop-blur-sm sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onMovimiento} title="Movimiento" className="p-1.5 rounded-md hover:bg-emerald-500/[0.08] text-emerald-600 dark:text-emerald-400 transition-colors">
          <ArrowDownCircle className="h-3.5 w-3.5" />
        </button>
        {has && (
          <button onClick={onHistorial} title="Historial" className="p-1.5 rounded-md hover:bg-primary/[0.08] text-blue-600 dark:text-blue-400 transition-colors">
            <History className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={onEdit} title={has ? 'Editar' : 'Configurar'} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground transition-colors">
          {has ? <Pencil className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
//  DRAWER LATERAL (vista rápida por ítem)
// ══════════════════════════════════════════════

function ItemDrawer({ item, loadMovimientos, onClose, onEdit, onMovimiento, addPhoto, removePhoto, calcReorderData, onViewInEquipo, onSearchSimilar }: {
  item: BodegaMergedItem; loadMovimientos: (id: string, max?: number) => Promise<MovimientoBodega[]>
  onClose: () => void; onEdit: () => void; onMovimiento: () => void
  addPhoto?: (sap: string, file: File) => Promise<string>
  removePhoto?: (sap: string, url: string) => Promise<void>
  calcReorderData?: (item: BodegaMergedItem, movs: MovimientoBodega[]) => { consumoDiario: number; puntoReorden: number; diasRestantes: number; necesitaPedir: boolean } | null
  onViewInEquipo?: (machineId: string) => void
  onSearchSimilar?: (query: string) => void
}) {
  const [movs, setMovs] = useState<MovimientoBodega[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  useEffect(() => {
    if (!item.bodegaId) { setLoading(false); return }
    loadMovimientos(item.bodegaId, 20).then(d => { setMovs(d); setLoading(false) }).catch(() => setLoading(false))
  }, [item.bodegaId, loadMovimientos])

  const has = !!item.bodegaId
  const isBajo = has && item.stockMinimo > 0 && item.stockActual <= item.stockMinimo && item.stockActual > 0
  const isSin = has && item.stockActual === 0 && item.stockMinimo > 0
  const valorTotal = item.stockActual * (item.costoCompra ?? item.valorUnitario ?? 0)
  const sparkData = movs.slice(0, 15).reverse().map(m => m.stockResultante)
  const reorder = calcReorderData?.(item, movs) ?? null
  const qrValue = `${window.location.origin}${window.location.pathname}?sap=${item.codigoSAP}`

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !addPhoto) return
    setUploading(true)
    try { await addPhoto(item.codigoSAP, file) } finally { setUploading(false) }
    e.target.value = ''
  }

  const handleDownloadQR = () => {
    const svg = document.getElementById('bodega-qr-svg')
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement('canvas')
    canvas.width = 300; canvas.height = 300
    const ctx = canvas.getContext('2d')
    const img = new window.Image()
    img.onload = () => { ctx?.drawImage(img, 0, 0); const a = document.createElement('a'); a.download = `QR_${item.codigoSAP}.png`; a.href = canvas.toDataURL('image/png'); a.click() }
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)))
  }

  const handlePrintQR = () => {
    const w = window.open('', '_blank', 'width=400,height=500')
    if (!w) return
    const svg = document.getElementById('bodega-qr-svg')
    const svgHtml = svg ? new XMLSerializer().serializeToString(svg) : ''
    // escapeHtml en los campos del maestro: vienen de Firestore y un valor con
    // <script> imprimiría ejecutándose en la ventana nueva (stored XSS).
    w.document.write(`<html><head><title>QR ${escapeHtml(item.codigoSAP)}</title><style>body{font-family:sans-serif;text-align:center;padding:20px}h2{margin:0 0 4px}p{margin:2px 0;color:#666;font-size:12px}.qr{margin:16px auto}</style></head><body><h2>${escapeHtml(item.textoBreve)}</h2><p>${escapeHtml(item.codigoSAP)}</p>${item.codigoFabricante ? `<p>${escapeHtml(item.codigoFabricante)}</p>` : ''}<div class="qr">${svgHtml}</div><p>${escapeHtml(item.ubicacionBodega || '')}</p><script>setTimeout(()=>{window.print();window.close()},300)</script></body></html>`)
    w.document.close()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full sm:max-w-md bg-card border-l border-border shadow-2xl overflow-y-auto animate-in slide-in-from-right" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-5 py-4 z-10">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <p className={item.textoBreve ? 'text-base font-bold text-foreground' : 'text-base font-bold italic text-muted-foreground'}>{item.textoBreve || `(sin nombre — SAP ${item.codigoSAP})`}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/[0.08] text-primary font-mono">{item.codigoSAP}</span>
                {item.codigoFabricante && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cat-6-tint/[0.08] text-cat-6-ink font-mono">{item.codigoFabricante}</span>}
                {item.tipo && <CatTag tone={tipoTag(item.tipo)} className="uppercase">{item.tipo}</CatTag>}
                {item.categoria && <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${item.categoria === 'A' ? 'bg-red-500/[0.08] text-red-600' : item.categoria === 'B' ? 'bg-amber-500/[0.08] text-amber-600' : 'bg-emerald-500/[0.08] text-emerald-600'}`}>ABC: {item.categoria}</span>}
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted shrink-0"><X className="h-5 w-5 text-muted-foreground" /></button>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={onMovimiento} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-emerald-500/[0.08] border border-emerald-500/[0.25] rounded-lg hover:bg-emerald-500/[0.08] text-emerald-600">
              <ArrowDownCircle className="h-3.5 w-3.5" /> Movimiento
            </button>
            <button onClick={onEdit} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted border border-border rounded-lg hover:bg-muted text-muted-foreground">
              <Pencil className="h-3.5 w-3.5" /> {has ? 'Editar' : 'Configurar'}
            </button>
            {onSearchSimilar && (
              <button onClick={() => { onSearchSimilar(item.textoBreve || item.codigoSAP); onClose() }} className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary/[0.08] border border-primary/[0.25] rounded-lg hover:bg-primary/[0.08] text-primary">
                <Search className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Foto principal */}
          {item.fotos && item.fotos.length > 0 && (
            <div className="rounded-lg overflow-hidden border border-border bg-muted">
              <img src={item.fotos[0]} alt={item.textoBreve} className="w-full h-32 object-contain" />
            </div>
          )}

          {/* Stock actual */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border p-3 text-center">
              <p className={`text-2xl font-bold tabular-nums ${isSin ? 'text-red-600' : isBajo ? 'text-amber-600' : 'text-foreground'}`}>{item.stockActual}</p>
              <p className="text-[9px] text-muted-foreground">Stock actual</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-muted-foreground tabular-nums">{item.stockMinimo}</p>
              <p className="text-[9px] text-muted-foreground">Mínimo</p>
            </div>
            <div className="rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-cat-6-ink tabular-nums">${valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</p>
              <p className="text-[9px] text-muted-foreground">Valor</p>
            </div>
          </div>

          {/* Barra de progreso de stock */}
          {has && item.stockMinimo > 0 && (
            <div className="space-y-1">
              <StockBar actual={item.stockActual} minimo={item.stockMinimo} maximo={item.stockMaximo} />
              <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                <span>0</span>
                <span>Mín: {item.stockMinimo}</span>
                <span>{item.stockMaximo || item.stockMinimo * 2}</span>
              </div>
            </div>
          )}

          {/* Sparkline */}
          {sparkData.length >= 2 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Activity className="h-3 w-3" /> Tendencia de stock</p>
              <div className="flex items-center justify-center">
                <Sparkline data={sparkData} width={280} height={40} color={isSin ? '#ef4444' : isBajo ? '#f59e0b' : '#3b82f6'} />
              </div>
            </div>
          )}

          {/* Punto de reorden */}
          {reorder && (
            <div className={`rounded-lg border p-3 ${reorder.necesitaPedir ? 'border-red-500/[0.25] bg-red-500/[0.08]' : 'border-border'}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <ShoppingCart className="h-3 w-3" /> Reposición
                {reorder.necesitaPedir && <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-red-500/[0.08] text-red-600 font-bold uppercase">Pedir ahora</span>}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center">
                  <p className="text-lg font-bold text-foreground tabular-nums">{reorder.puntoReorden}</p>
                  <p className="text-[8px] text-muted-foreground">Pto. reorden</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-primary tabular-nums">{reorder.consumoDiario.toFixed(1)}</p>
                  <p className="text-[8px] text-muted-foreground">Consumo/día</p>
                </div>
                <div className="text-center">
                  <p className={`text-lg font-bold tabular-nums ${reorder.diasRestantes < 14 ? 'text-red-600' : reorder.diasRestantes < 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {reorder.diasRestantes === Infinity ? '∞' : reorder.diasRestantes}
                  </p>
                  <p className="text-[8px] text-muted-foreground">Días restantes</p>
                </div>
              </div>
              {item.leadTime && <p className="text-[9px] text-muted-foreground text-center mt-2">Lead time proveedor: {item.leadTime} días</p>}
            </div>
          )}

          {/* Fotos */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted border-b border-border flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold flex items-center gap-1">
                <Image className="h-3 w-3" /> Fotos ({item.fotos?.length || 0})
              </p>
              {addPhoto && (
                <label className="flex items-center gap-1 text-[10px] text-primary cursor-pointer hover:underline">
                  <Camera className="h-3 w-3" /> Agregar
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
                </label>
              )}
            </div>
            {uploading && (
              <div className="px-3 py-2 flex items-center gap-2">
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                <span className="text-[10px] text-muted-foreground">Subiendo foto...</span>
              </div>
            )}
            {item.fotos && item.fotos.length > 0 ? (
              <div className="p-2 grid grid-cols-4 gap-1.5">
                {item.fotos.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-border cursor-pointer" onClick={() => setLightboxIndex(i)}>
                    <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                    {removePhoto && (
                      <button onClick={e => { e.stopPropagation(); removePhoto(item.codigoSAP, url) }}
                        className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-3 text-[10px] text-muted-foreground text-center">Sin fotos. Agrega una para identificación visual.</p>
            )}
          </div>

          {/* Código QR */}
          <div className="rounded-lg border border-border overflow-hidden">
            <button onClick={() => setShowQR(q => !q)} className="w-full px-3 py-2 bg-muted flex items-center justify-between hover:bg-muted transition-colors">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold flex items-center gap-1">
                <QrCode className="h-3 w-3" /> Código QR
              </p>
              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${showQR ? 'rotate-180' : ''}`} />
            </button>
            {showQR && (
              <div className="p-4 flex flex-col items-center gap-3">
                <QRCodeSVG id="bodega-qr-svg" value={qrValue} size={180} level="H" includeMargin />
                <p className="text-[9px] text-muted-foreground text-center break-all max-w-[200px]">{item.codigoSAP}</p>
                <div className="flex gap-2">
                  <button onClick={handleDownloadQR} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium bg-muted border border-border rounded-lg hover:bg-muted text-muted-foreground">
                    <Download className="h-3 w-3" /> Descargar PNG
                  </button>
                  <button onClick={handlePrintQR} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-medium bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 text-primary">
                    <QrCode className="h-3 w-3" /> Imprimir
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Detalles */}
          <div className="rounded-lg border border-border divide-y divide-border/50">
            {[
              { label: 'Ubicación', value: item.ubicacionBodega || '—' },
              { label: 'Proveedor', value: item.proveedor || '—' },
              { label: 'Costo compra', value: item.costoCompra ? `$${item.costoCompra.toLocaleString('es-CL')}` : '—' },
              { label: 'Unidad', value: item.unidad },
              { label: 'Stock máximo', value: item.stockMaximo ? String(item.stockMaximo) : '—' },
              { label: 'Lead time', value: item.leadTime ? `${item.leadTime} días` : '—' },
            ].map(d => (
              <div key={d.label} className="flex items-center justify-between px-3 py-2">
                <span className="text-[10px] text-muted-foreground">{d.label}</span>
                <span className="text-xs text-foreground font-medium">{d.value}</span>
              </div>
            ))}
          </div>

          {/* Equipos vinculados */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted border-b border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold flex items-center gap-1">
                <Layers className="h-3 w-3" /> Equipos ({item.equipos.length})
              </p>
            </div>
            <div className="max-h-[120px] overflow-y-auto divide-y divide-border/50">
              {item.equipos.map(e => (
                <div key={e.machineId} className="px-3 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-foreground truncate">{e.machineName}</span>
                  {onViewInEquipo && (
                    <button
                      onClick={() => { onViewInEquipo(e.machineId); onClose() }}
                      className="shrink-0 text-[9px] text-primary hover:text-primary/80 hover:underline transition-colors"
                    >
                      Ver en Áreas
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Historial de movimientos */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="px-3 py-2 bg-muted border-b border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold flex items-center gap-1">
                <History className="h-3 w-3" /> Movimientos recientes
              </p>
            </div>
            {loading ? <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 text-primary animate-spin" /></div>
            : movs.length === 0 ? <p className="p-3 text-[10px] text-muted-foreground text-center">Sin movimientos</p>
            : (
              <div className="max-h-[200px] overflow-y-auto divide-y divide-border/50">
                {movs.map(m => (
                  <div key={m.id} className="px-3 py-2 flex items-center gap-2">
                    <span className={`text-[10px] font-bold w-10 shrink-0 ${m.tipo === 'entrada' ? 'text-emerald-600' : m.tipo === 'salida' ? 'text-red-600' : 'text-primary'}`}>
                      {m.tipo === 'entrada' ? '↓ Ent' : m.tipo === 'salida' ? '↑ Sal' : '⟳ Aj'}
                    </span>
                    <span className="text-xs font-bold text-foreground tabular-nums w-8 shrink-0">
                      {m.tipo === 'ajuste' ? `→${m.stockResultante}` : `${m.tipo === 'entrada' ? '+' : '-'}${m.cantidad}`}
                    </span>
                    <span className="text-[10px] text-muted-foreground truncate flex-1">{m.motivo || '—'}</span>
                    <span className="text-[9px] text-muted-foreground/50 shrink-0">{m.createdAt.toLocaleDateString('es-CL')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {item.observaciones && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Observaciones</p>
              <p className="text-xs text-foreground">{item.observaciones}</p>
            </div>
          )}
        </div>
      </div>
      {/* Lightbox con pan+zoom (componente unificado @/components/ui/ImageLightbox) */}
      {lightboxIndex !== null && item.fotos && item.fotos.length > 0 && (
        <ImageLightbox
          photos={item.fotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
//  MODALES
// ══════════════════════════════════════════════

function AlertPanel({ alertas, onFilter }: { alertas: BodegaMergedItem[]; onFilter: (f: StockFilter) => void }) {
  const [expanded, setExpanded] = useState(false)
  const sinStock = alertas.filter(a => a.stockActual === 0)
  const bajoStock = alertas.filter(a => a.stockActual > 0)

  return (
    <div className="bg-red-500/[0.08] border border-red-500/20 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-red-500/[0.08] transition-colors">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="text-xs font-semibold text-red-600">{alertas.length} alerta{alertas.length > 1 ? 's' : ''} de stock</span>
          {sinStock.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/[0.08] text-red-600 font-bold">{sinStock.length} sin stock</span>}
          {bajoStock.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/[0.08] text-amber-600 font-bold">{bajoStock.length} bajo mínimo</span>}
        </div>
        <ChevronDown className={`h-4 w-4 text-red-600/60 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-red-500/10 divide-y divide-red-500/10 max-h-[200px] overflow-y-auto">
          {alertas.slice(0, 10).map(item => (
            <div key={item.codigoSAP} className="flex items-center gap-3 px-4 py-2">
              {item.stockActual === 0 ? <PackageX className="h-4 w-4 text-red-600 shrink-0" /> : <TrendingDown className="h-4 w-4 text-amber-600 shrink-0" />}
              <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground truncate">{item.textoBreve}</p><span className="text-[10px] font-mono text-primary">{item.codigoSAP}</span></div>
              <div className="text-right shrink-0"><span className={`text-sm font-bold tabular-nums ${item.stockActual === 0 ? 'text-red-600' : 'text-amber-600'}`}>{item.stockActual}</span><span className="text-[9px] text-muted-foreground ml-1">/ {item.stockMinimo}</span></div>
            </div>
          ))}
          {alertas.length > 10 && <div className="px-4 py-2 text-center"><button onClick={() => onFilter('bajo')} className="text-[10px] text-primary hover:underline">Ver todas →</button></div>}
        </div>
      )}
    </div>
  )
}

function ModalBackdrop({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} max-h-[90dvh] sm:max-h-[85vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>{children}</label>
}

function StockFormModal({ item, onSave, onClose }: { item: BodegaMergedItem; onSave: (d: BodegaStockData) => Promise<void>; onClose: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<BodegaStockData>({
    stockActual: item.stockActual, stockMinimo: item.stockMinimo, stockMaximo: item.stockMaximo ?? 0,
    ubicacionBodega: item.ubicacionBodega || '', proveedor: item.proveedor || '',
    costoCompra: item.costoCompra ?? item.valorUnitario ?? 0, unidad: item.unidad || 'pzas',
    leadTime: item.leadTime ?? 0, categoria: item.categoria, observaciones: item.observaciones || '',
  })
  const set = (k: keyof BodegaStockData, v: string | number) => setForm(p => ({ ...p, [k]: v }))

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={async e => { e.preventDefault(); setSaving(true); try { await onSave(form) } finally { setSaving(false) } }}>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold">{item.bodegaId ? 'Editar stock' : 'Configurar stock'}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.textoBreve}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/[0.08] text-primary font-mono">{item.codigoSAP}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <Field label="Stock actual"><input type="number" min={0} value={form.stockActual} onChange={e => set('stockActual', Number(e.target.value))} className={`${INPUT} tabular-nums`} /></Field>
            <Field label="Stock mínimo"><input type="number" min={0} value={form.stockMinimo} onChange={e => set('stockMinimo', Number(e.target.value))} className={`${INPUT} tabular-nums`} /></Field>
            <Field label="Stock máximo"><input type="number" min={0} value={form.stockMaximo ?? 0} onChange={e => set('stockMaximo', Number(e.target.value))} className={`${INPUT} tabular-nums`} /></Field>
            <Field label="Unidad"><select value={form.unidad} onChange={e => set('unidad', e.target.value)} className={INPUT}>
              <option value="pzas">Piezas</option><option value="litros">Litros</option><option value="metros">Metros</option><option value="kg">Kilogramos</option><option value="rollos">Rollos</option><option value="cajas">Cajas</option><option value="sets">Sets</option>
            </select></Field>
          </div>
          <Field label="Ubicación en bodega"><input type="text" value={form.ubicacionBodega} onChange={e => set('ubicacionBodega', e.target.value)} placeholder="Ej: Estante A3 - Caja 2" className={INPUT} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Proveedor"><input type="text" value={form.proveedor || ''} onChange={e => set('proveedor', e.target.value)} className={INPUT} /></Field>
            <Field label="Costo compra ($)"><input type="number" min={0} step={0.01} value={form.costoCompra ?? 0} onChange={e => set('costoCompra', Number(e.target.value))} className={`${INPUT} tabular-nums`} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead time (días)"><input type="number" min={0} value={form.leadTime ?? 0} onChange={e => set('leadTime', Number(e.target.value))} className={`${INPUT} tabular-nums`} /></Field>
            <Field label="Categoría ABC"><select value={form.categoria || ''} onChange={e => set('categoria', e.target.value)} className={INPUT}>
              <option value="">Sin clasificar</option><option value="A">A — Crítico / Alto valor</option><option value="B">B — Importante / Valor medio</option><option value="C">C — Estándar / Bajo valor</option>
            </select></Field>
          </div>
          <Field label="Observaciones"><textarea value={form.observaciones || ''} onChange={e => set('observaciones', e.target.value)} rows={2} className={`${INPUT} resize-none`} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar
          </button>
        </div>
      </form>
    </ModalBackdrop>
  )
}

const MOTIVOS_POR_TIPO: Record<'entrada' | 'salida' | 'ajuste', { value: string; label: string }[]> = {
  entrada: [
    { value: 'compra_oc', label: 'Compra / Orden de compra' },
    { value: 'devolucion_taller', label: 'Devolución de taller' },
    { value: 'transferencia_in', label: 'Transferencia recibida' },
    { value: 'donacion', label: 'Donación' },
    { value: 'otro_entrada', label: 'Otro' },
  ],
  salida: [
    { value: 'uso_mantencion', label: 'Uso en mantención' },
    { value: 'uso_emergencia', label: 'Uso en emergencia' },
    { value: 'prestamo', label: 'Préstamo' },
    { value: 'baja_descarte', label: 'Baja / Descarte' },
    { value: 'transferencia_out', label: 'Transferencia enviada' },
    { value: 'otro_salida', label: 'Otro' },
  ],
  ajuste: [
    { value: 'inventario_periodico', label: 'Inventario periódico' },
    { value: 'correccion_admin', label: 'Corrección administrativa' },
    { value: 'merma', label: 'Merma' },
    { value: 'otro_ajuste', label: 'Otro' },
  ],
}

function MovimientoModal({ item, onSave, onClose }: {
  item: BodegaMergedItem; onSave: (t: 'entrada' | 'salida' | 'ajuste', c: number, m: string) => Promise<void>; onClose: () => void
}) {
  const [tipo, setTipo] = useState<'entrada' | 'salida' | 'ajuste'>('entrada')
  const [cantidad, setCantidad] = useState(1)
  const [motivoKey, setMotivoKey] = useState('')
  const [referencia, setReferencia] = useState('')
  const [saving, setSaving] = useState(false)
  const preview = tipo === 'entrada' ? item.stockActual + cantidad : tipo === 'salida' ? Math.max(0, item.stockActual - cantidad) : cantidad

  const motivos = MOTIVOS_POR_TIPO[tipo]
  const motivoLabel = motivos.find(m => m.value === motivoKey)?.label || ''
  const motivoFinal = motivoLabel + (referencia.trim() ? ` — ${referencia.trim()}` : '')

  const handleTipoChange = (t: typeof tipo) => { setTipo(t); setMotivoKey('') }

  const OPTS = [
    { v: 'entrada' as const, l: 'Entrada', icon: ArrowDownCircle, c: 'text-emerald-600 bg-emerald-500/[0.08] border-emerald-500/[0.25]' },
    { v: 'salida' as const, l: 'Salida', icon: ArrowUpCircle, c: 'text-red-600 bg-red-500/[0.08] border-red-500/[0.25]' },
    { v: 'ajuste' as const, l: 'Ajuste', icon: Settings2, c: 'text-primary bg-primary/[0.08] border-primary/[0.25]' },
  ]

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={async e => { e.preventDefault(); setSaving(true); try { await onSave(tipo, cantidad, motivoFinal) } finally { setSaving(false) } }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div><h3 className="text-base font-bold">Registrar movimiento</h3><p className="text-xs text-muted-foreground truncate mt-0.5">{item.textoBreve} — {item.codigoSAP}</p></div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {OPTS.map(o => { const I = o.icon; return (
              <button key={o.v} type="button" onClick={() => handleTipoChange(o.v)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all text-sm font-medium ${tipo === o.v ? o.c : 'border-border bg-muted text-muted-foreground hover:bg-muted'}`}>
                <I className="h-5 w-5" />{o.l}
              </button>
            )})}
          </div>
          <Field label={tipo === 'ajuste' ? 'Nuevo stock' : 'Cantidad'}>
            <input type="number" min={0} value={cantidad} onChange={e => setCantidad(Number(e.target.value))} className={`${INPUT} text-lg font-bold tabular-nums text-center`} autoFocus />
          </Field>
          <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-lg bg-muted border border-border">
            <span className="text-sm text-muted-foreground">Actual: <strong className="text-foreground">{item.stockActual}</strong></span>
            <span className="text-muted-foreground">→</span>
            <span className="text-sm text-muted-foreground">Nuevo: <strong className={preview <= (item.stockMinimo || 0) && item.stockMinimo > 0 ? 'text-amber-600' : 'text-emerald-600'}>{preview}</strong></span>
          </div>
          <Field label="Motivo"><select value={motivoKey} onChange={e => setMotivoKey(e.target.value)} className={INPUT}><option value="">— Seleccionar motivo —</option>{motivos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
          <Field label="Referencia (opcional)"><input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: OC #123, OT #456…" className={INPUT} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Cancelar</button>
          <button type="submit" disabled={saving || !motivoKey || (cantidad <= 0 && tipo !== 'ajuste')}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar
          </button>
        </div>
      </form>
    </ModalBackdrop>
  )
}

function HistorialModal({ item, loadMovimientos, onClose }: {
  item: BodegaMergedItem; loadMovimientos: (id: string, max?: number) => Promise<MovimientoBodega[]>; onClose: () => void
}) {
  const [movs, setMovs] = useState<MovimientoBodega[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!item.bodegaId) { setLoading(false); return }
    loadMovimientos(item.bodegaId, 30).then(d => { setMovs(d); setLoading(false) }).catch(() => setLoading(false))
  }, [item.bodegaId, loadMovimientos])

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div><h3 className="text-base font-bold">Historial</h3><p className="text-xs text-muted-foreground truncate mt-0.5">{item.textoBreve} — {item.codigoSAP}</p></div>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="h-5 w-5 text-muted-foreground" /></button>
      </div>
      <div className="px-5 py-4 max-h-[400px] overflow-y-auto">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 text-primary animate-spin" /></div>
          : movs.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Sin movimientos</p>
          : <div className="space-y-2">{movs.map(m => {
            const cfg = { entrada: { l: 'Entrada', c: 'text-emerald-600 bg-emerald-500/[0.08]', i: ArrowDownCircle },
              salida: { l: 'Salida', c: 'text-red-600 bg-red-500/[0.08]', i: ArrowUpCircle },
              ajuste: { l: 'Ajuste', c: 'text-primary bg-primary/[0.08]', i: Settings2 } }[m.tipo]
            const I = cfg.i
            return (
              <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted border border-border">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.c}`}><I className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold ${cfg.c.split(' ')[0]}`}>{cfg.l}</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">{m.tipo === 'ajuste' ? `→ ${m.stockResultante}` : `${m.tipo === 'entrada' ? '+' : '-'}${m.cantidad}`}</span>
                    <span className="text-xs text-muted-foreground">(stock: {m.stockResultante})</span>
                  </div>
                  {m.motivo && <p className="text-xs text-muted-foreground mt-0.5">{m.motivo}</p>}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground/70">
                    <span>{m.realizadoPorNombre || 'Usuario'}</span><span>•</span>
                    <span>{m.createdAt.toLocaleDateString('es-CL')} {m.createdAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            )
          })}</div>}
      </div>
      <div className="px-5 py-3 border-t border-border flex justify-end">
        <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">Cerrar</button>
      </div>
    </ModalBackdrop>
  )
}

// ══════════════════════════════════════════════
//  MODAL: MOVIMIENTOS EN LOTE (batch)
// ══════════════════════════════════════════════

function BatchMovimientoModal({ items, registrarMovimientoBatch, user, onClose }: {
  items: BodegaMergedItem[]
  registrarMovimientoBatch: (batchItems: { item: BodegaMergedItem; cantidad: number }[], tipo: 'entrada' | 'salida' | 'ajuste', motivo: string, userId: string, userName: string, onProgress?: (done: number, total: number) => void) => Promise<void>
  user: any; onClose: () => void
}) {
  const [tipo, setTipo] = useState<'entrada' | 'salida'>('entrada')
  const [motivoKey, setMotivoKey] = useState('')
  const [referencia, setReferencia] = useState('')
  const [searchBatch, setSearchBatch] = useState('')
  const [selected, setSelected] = useState<Map<string, number>>(new Map())
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)

  const motivos = MOTIVOS_POR_TIPO[tipo]
  const motivoLabel = motivos.find(m => m.value === motivoKey)?.label || ''
  const motivoFinal = motivoLabel + (referencia.trim() ? ` — ${referencia.trim()}` : '')

  const visible = useMemo(() => {
    if (!searchBatch.trim()) return items
    const terms = normalizeForSearch(searchBatch).split(/\s+/).filter(Boolean)
    return items.filter(i => {
      const h = normalizeForSearch(`${i.codigoSAP} ${i.textoBreve} ${i.tipo || ''}`)
      return haystackMatchesAll(h, terms)
    })
  }, [items, searchBatch])

  const handleApply = async () => {
    if (!user || selected.size === 0 || !motivoKey) return
    setSaving(true)
    const batchItems = [...selected.entries()].map(([sap, cantidad]) => {
      const item = items.find(i => i.codigoSAP === sap)!
      return { item, cantidad }
    }).filter(b => b.item)
    await registrarMovimientoBatch(batchItems, tipo, motivoFinal, user.id, user.nombre, (d, t) => setProgress(Math.round((d / t) * 100)))
    setDone(true)
    setSaving(false)
  }

  const toggleItem = (sap: string) => {
    const next = new Map(selected)
    if (next.has(sap)) next.delete(sap); else next.set(sap, 1)
    setSelected(next)
  }

  const setCant = (sap: string, cant: number) => {
    const next = new Map(selected)
    next.set(sap, Math.max(0, cant))
    setSelected(next)
  }

  return (
    <ModalBackdrop onClose={onClose} wide>
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-base font-bold">Movimiento en lote</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Registrar entrada o salida de múltiples ítems a la vez</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">{selected.size} movimientos registrados</p>
            <p className="text-xs text-muted-foreground mt-1">{tipo === 'entrada' ? 'Entradas' : 'Salidas'} — {motivoLabel}</p>
          </div>
        ) : (
          <>
            {/* Tipo */}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setTipo('entrada'); setMotivoKey('') }}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all text-sm font-medium ${tipo === 'entrada' ? 'text-emerald-600 bg-emerald-500/[0.08] border-emerald-500/[0.25]' : 'border-border bg-muted text-muted-foreground'}`}>
                <ArrowDownCircle className="h-5 w-5" /> Entrada
              </button>
              <button type="button" onClick={() => { setTipo('salida'); setMotivoKey('') }}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all text-sm font-medium ${tipo === 'salida' ? 'text-red-600 bg-red-500/[0.08] border-red-500/[0.25]' : 'border-border bg-muted text-muted-foreground'}`}>
                <ArrowUpCircle className="h-5 w-5" /> Salida
              </button>
            </div>

            {/* Motivo compartido */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Motivo"><select value={motivoKey} onChange={e => setMotivoKey(e.target.value)} className={INPUT}><option value="">— Seleccionar —</option>{motivos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
              <Field label="Referencia"><input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="OC #123…" className={INPUT} /></Field>
            </div>

            {/* Selección de ítems con cantidad */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
                <span className="text-xs text-muted-foreground font-semibold">{selected.size} seleccionados</span>
                <div className="flex-1" />
                <input type="text" value={searchBatch} onChange={e => setSearchBatch(e.target.value)} placeholder="Filtrar…" className="w-40 px-2 py-1 text-[10px] bg-muted border border-border rounded text-foreground" />
              </div>
              <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
                {visible.slice(0, 100).map(item => {
                  const isSelected = selected.has(item.codigoSAP)
                  return (
                    <div key={item.codigoSAP} className={`flex items-center gap-2 px-3 py-2 ${isSelected ? 'bg-primary/5' : 'hover:bg-muted'}`}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleItem(item.codigoSAP)} className="rounded" />
                      <span className="text-xs text-foreground truncate flex-1">{item.textoBreve}</span>
                      <span className="text-[10px] font-mono text-primary shrink-0 w-20">{item.codigoSAP}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 w-12 text-right">stk: {item.stockActual}</span>
                      {isSelected && (
                        <input type="number" min={0} value={selected.get(item.codigoSAP) || 1}
                          onChange={e => setCant(item.codigoSAP, Number(e.target.value))}
                          className="w-16 px-2 py-0.5 text-xs text-center bg-muted border border-border rounded tabular-nums font-bold text-foreground shrink-0"
                          onClick={e => e.stopPropagation()} />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {saving && (
              <div className="bg-muted rounded-lg p-3 border border-border">
                <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Procesando…</span><span>{progress}%</span></div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">{done ? 'Cerrar' : 'Cancelar'}</button>
        {!done && (
          <button onClick={handleApply} disabled={saving || selected.size === 0 || !motivoKey}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Registrar {selected.size} {tipo === 'entrada' ? 'entradas' : 'salidas'}
          </button>
        )}
      </div>
    </ModalBackdrop>
  )
}

function BulkConfigModal({ items, saveStock, onClose }: {
  items: BodegaMergedItem[]; saveStock: (sap: string, data: BodegaStockData) => Promise<void>; onClose: () => void
}) {
  const [stockMinimo, setStockMinimo] = useState(1)
  const [unidad, setUnidad] = useState('pzas')
  const [ubicacion, setUbicacion] = useState('')
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState(false)
  const [searchBulk, setSearchBulk] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map(i => i.codigoSAP)))

  const visible = useMemo(() => {
    if (!searchBulk.trim()) return items
    const terms = normalizeForSearch(searchBulk).split(/\s+/).filter(Boolean)
    return items.filter(i => {
      const h = normalizeForSearch(`${i.codigoSAP} ${i.textoBreve} ${i.tipo || ''}`)
      return haystackMatchesAll(h, terms)
    })
  }, [items, searchBulk])

  const toggleAll = () => {
    if (selected.size === visible.length) setSelected(new Set())
    else setSelected(new Set(visible.map(i => i.codigoSAP)))
  }

  const handleApply = async () => {
    const toApply = items.filter(i => selected.has(i.codigoSAP))
    if (toApply.length === 0) return
    setSaving(true)
    let count = 0
    for (const item of toApply) {
      try {
        await saveStock(item.codigoSAP, { stockActual: 0, stockMinimo, stockMaximo: 0, ubicacionBodega: ubicacion, unidad, observaciones: '' })
        count++
        setProgress(Math.round((count / toApply.length) * 100))
      } catch { /* continue */ }
    }
    setDone(true)
    setSaving(false)
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-base font-bold">Configuración masiva</h3>
        <p className="text-xs text-muted-foreground mt-0.5">{items.length} ítems sin configurar</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        {done ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">{selected.size} ítems configurados</p>
            <p className="text-xs text-muted-foreground mt-1">Stock mín: {stockMinimo} | Unidad: {unidad}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Stock mínimo"><input type="number" min={0} value={stockMinimo} onChange={e => setStockMinimo(Number(e.target.value))} className={`${INPUT} tabular-nums`} /></Field>
              <Field label="Unidad"><select value={unidad} onChange={e => setUnidad(e.target.value)} className={INPUT}>
                <option value="pzas">Piezas</option><option value="litros">Litros</option><option value="metros">Metros</option><option value="kg">Kilogramos</option><option value="rollos">Rollos</option><option value="cajas">Cajas</option><option value="sets">Sets</option>
              </select></Field>
              <Field label="Ubicación"><input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Opcional" className={INPUT} /></Field>
            </div>
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted border-b border-border">
                <input type="checkbox" checked={selected.size === visible.length && visible.length > 0} onChange={toggleAll} className="rounded" />
                <span className="text-xs text-muted-foreground">{selected.size} seleccionados</span>
                <div className="flex-1" />
                <input type="text" value={searchBulk} onChange={e => setSearchBulk(e.target.value)} placeholder="Filtrar…" className="w-32 px-2 py-1 text-[10px] bg-muted border border-border rounded text-foreground" />
              </div>
              <div className="max-h-[200px] overflow-y-auto divide-y divide-border/50">
                {visible.slice(0, 100).map(item => (
                  <label key={item.codigoSAP} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted cursor-pointer">
                    <input type="checkbox" checked={selected.has(item.codigoSAP)} onChange={() => {
                      const next = new Set(selected)
                      if (next.has(item.codigoSAP)) { next.delete(item.codigoSAP) } else { next.add(item.codigoSAP) }
                      setSelected(next)
                    }} className="rounded" />
                    <span className="text-xs text-foreground truncate flex-1">{item.textoBreve}</span>
                    <span className="text-[10px] font-mono text-primary shrink-0">{item.codigoSAP}</span>
                  </label>
                ))}
              </div>
            </div>
            {saving && (
              <div className="bg-muted rounded-lg p-3 border border-border">
                <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Configurando…</span><span>{progress}%</span></div>
                <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted rounded-lg">{done ? 'Cerrar' : 'Cancelar'}</button>
        {!done && (
          <button onClick={handleApply} disabled={saving || selected.size === 0}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Configurar {selected.size} ítems
          </button>
        )}
      </div>
    </ModalBackdrop>
  )
}
