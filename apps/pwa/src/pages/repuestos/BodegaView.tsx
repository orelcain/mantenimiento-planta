/**
 * BodegaView — Sistema de gestión de bodega de repuestos
 *
 * Sub-pestañas:
 *  - Stock:        gestión de stock, movimientos, alertas
 *  - Inventarios:  conteos periódicos, reconciliación
 *  - Estadísticas: KPIs, alertas, distribución, valor
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
} from 'lucide-react'
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { useGlobalSearch } from '@/hooks/repuestos/useGlobalSearch'
import { getGlobalEquipmentCache, useGlobalEquipmentSearch } from '@/hooks/useGlobalEquipmentSearch'
import { useBodega } from '@/hooks/repuestos/useBodega'
import type {
  BodegaMergedItem, BodegaStockData, MovimientoBodega,
  InventarioSesion, InventarioConteo,
} from '@/hooks/repuestos/useBodega'
import type { Machine } from '@/types/repuestos'
import { useAuthStore } from '@/store/authStore'

type BodegaTab = 'stock' | 'inventarios' | 'movimientos' | 'estadisticas'
type StockFilter = 'todos' | 'configurados' | 'bajo' | 'sin' | 'sinConfig'

const INPUT = 'w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground'

// ══════════════════════════════════════════════
//  CONTENEDOR PRINCIPAL
// ══════════════════════════════════════════════

export function BodegaView() {
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
  }, [hierarchyNames])

  const { allRepuestos, loadAll, loaded, loading: catalogLoading } = useGlobalSearch(machines)

  useEffect(() => {
    if (!loaded && machines.length > 0) loadAll()
  }, [loaded, machines.length, loadAll])

  const bodega = useBodega(allRepuestos)
  const isLoading = catalogLoading || (bodega.loading && allRepuestos.length === 0)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
        <span className="text-sm text-muted-foreground">
          {catalogLoading ? 'Cargando catálogo…' : 'Cargando bodega…'}
        </span>
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
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg w-fit">
        {SUB_TABS.map(t => {
          const Icon = t.icon
          const active = subTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
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

      {subTab === 'stock' && <StockTab bodega={bodega} user={user} />}
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

function StockTab({ bodega, user }: { bodega: ReturnType<typeof useBodega>; user: any }) {
  const { items, stats, saveStock, registrarMovimiento, loadMovimientos } = bodega
  const [searchQuery, setSearchQuery] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>('todos')
  const [editingItem, setEditingItem] = useState<BodegaMergedItem | null>(null)
  const [movimientoItem, setMovimientoItem] = useState<BodegaMergedItem | null>(null)
  const [historialItem, setHistorialItem] = useState<BodegaMergedItem | null>(null)
  const [showBulkConfig, setShowBulkConfig] = useState(false)
  const [sortField, setSortField] = useState<SortField>('nombre')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const toggleSort = useCallback((field: SortField) => {
    setSortField(prev => { if (prev === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev } setSortDir('asc'); return field })
  }, [])

  const filtered = useMemo(() => {
    let result = items
    if (stockFilter === 'configurados') result = result.filter(i => i.bodegaId)
    else if (stockFilter === 'bajo') result = result.filter(i => i.bodegaId && i.stockMinimo > 0 && i.stockActual <= i.stockMinimo && i.stockActual > 0)
    else if (stockFilter === 'sin') result = result.filter(i => i.bodegaId && i.stockActual === 0 && i.stockMinimo > 0)
    else if (stockFilter === 'sinConfig') result = result.filter(i => !i.bodegaId)

    if (searchQuery.trim()) {
      const terms = searchQuery.toLowerCase().trim().split(/\s+/)
      result = result.filter(i => {
        const h = `${i.codigoSAP} ${i.codigoFabricante} ${i.textoBreve} ${i.alias || ''} ${i.ubicacionBodega} ${i.proveedor || ''} ${i.tipo || ''}`.toLowerCase()
        return terms.every(t => h.includes(t))
      })
    }

    // Ordenar
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
        default: return dir * (a.textoBreve || '').localeCompare(b.textoBreve || '')
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
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <StatCard icon={Package} label="Con SAP" value={stats.total} color="text-blue-400" bg="bg-blue-500/10" onClick={() => setStockFilter('todos')} active={stockFilter === 'todos'} />
        <StatCard icon={PackageCheck} label="Configurados" value={stats.conStock} color="text-emerald-400" bg="bg-emerald-500/10" onClick={() => setStockFilter('configurados')} active={stockFilter === 'configurados'} />
        <StatCard icon={TrendingDown} label="Bajo stock" value={stats.bajoStock} color="text-amber-400" bg="bg-amber-500/10" onClick={() => setStockFilter('bajo')} active={stockFilter === 'bajo'} />
        <StatCard icon={PackageX} label="Sin stock" value={stats.sinStock} color="text-red-400" bg="bg-red-500/10" onClick={() => setStockFilter('sin')} active={stockFilter === 'sin'} />
        <StatCard icon={DollarSign} label="Valor bodega" value={`$${stats.valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`} color="text-violet-400" bg="bg-violet-500/10" onClick={() => setStockFilter('sinConfig')} active={stockFilter === 'sinConfig'} sublabel="Sin configurar" />
      </div>

      {/* Search + Export */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nombre, SAP, tipo, ubicación…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/50"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
        {stats.sinConfig > 0 && (
          <button onClick={() => setShowBulkConfig(true)} title="Configurar múltiples" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary/10 border border-primary/30 rounded-lg hover:bg-primary/20 text-primary transition-colors shrink-0">
            <Settings2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Config. masiva</span>
          </button>
        )}
        <button onClick={() => exportCsv(filtered)} title="Exportar CSV" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted/30 border border-border rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors shrink-0">
          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Exportar</span>
        </button>
      </div>

      {/* Panel de alertas */}
      {stats.alertas.length > 0 && stockFilter === 'todos' && !searchQuery && (
        <AlertPanel alertas={stats.alertas} onFilter={(f: StockFilter) => setStockFilter(f)} />
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState message={items.length === 0 ? 'No hay repuestos con código SAP' : 'Sin resultados'} />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="hidden sm:grid grid-cols-[1fr_60px_70px_70px_70px_110px_100px] gap-2 px-4 py-2 bg-muted/20 border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <button onClick={() => toggleSort('nombre')} className="flex items-center gap-1 hover:text-foreground transition-colors">Repuesto <SortIcon field="nombre" /></button>
            <button onClick={() => toggleSort('equipos')} className="flex items-center gap-1 justify-center hover:text-foreground transition-colors"><Layers className="h-3 w-3" /> <SortIcon field="equipos" /></button>
            <button onClick={() => toggleSort('stock')} className="flex items-center gap-1 justify-center hover:text-foreground transition-colors">Stock <SortIcon field="stock" /></button>
            <span className="text-center">Mín</span>
            <button onClick={() => toggleSort('valor')} className="flex items-center gap-1 justify-center hover:text-foreground transition-colors">Valor <SortIcon field="valor" /></button>
            <span>Ubicación</span>
            <span className="text-right">Acciones</span>
          </div>
          <div className="divide-y divide-border/50 max-h-[55vh] overflow-y-auto">
            {filtered.map(item => (
              <BodegaRow key={item.codigoSAP} item={item}
                onEdit={() => setEditingItem(item)} onMovimiento={() => setMovimientoItem(item)}
                onHistorial={() => setHistorialItem(item)} />
            ))}
          </div>
          <div className="px-4 py-2 bg-muted/10 border-t border-border text-xs text-muted-foreground">{filtered.length} de {items.length} repuestos</div>
        </div>
      )}

      {editingItem && <StockFormModal item={editingItem} onSave={async d => { await saveStock(editingItem.codigoSAP, d); setEditingItem(null) }} onClose={() => setEditingItem(null)} />}
      {movimientoItem && <MovimientoModal item={movimientoItem} onSave={async (t, c, m) => { if (user) { await registrarMovimiento(movimientoItem, { tipo: t, cantidad: c, motivo: m }, user.id, user.nombre); setMovimientoItem(null) } }} onClose={() => setMovimientoItem(null)} />}
      {historialItem && <HistorialModal item={historialItem} loadMovimientos={loadMovimientos} onClose={() => setHistorialItem(null)} />}
      {showBulkConfig && <BulkConfigModal items={items.filter(i => !i.bodegaId)} saveStock={saveStock} onClose={() => setShowBulkConfig(false)} />}
    </>
  )
}

// ══════════════════════════════════════════════
//  TAB: INVENTARIOS
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
    // Actualizar sesión en la lista
    const updated = await loadInventarios()
    setSesiones(updated)
    setActiveSesion(updated.find(s => s.id === activeSesion.id) || activeSesion)
  }

  const handleFinalizar = async () => {
    if (!user || !activeSesion) return
    if (!confirm('¿Finalizar inventario y ajustar stock según conteo físico? Los ítems no contados NO se modificarán.')) return
    await finalizarInventario(activeSesion.id, user.id, user.nombre)
    setActiveSesion(null)
    await reload()
  }

  if (activeSesion) {
    const contados = conteos.filter(c => c.stockFisico !== null)
    const conDif = contados.filter(c => c.diferencia !== 0)

    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => setActiveSesion(null)} className="text-xs text-primary hover:underline mb-1 flex items-center gap-1">
              ← Volver a inventarios
            </button>
            <h3 className="text-base font-bold text-foreground">{activeSesion.nombre}</h3>
            <p className="text-xs text-muted-foreground">
              {contados.length}/{conteos.length} contados • {conDif.length} con diferencia
              {activeSesion.estado === 'finalizado' && <span className="ml-2 text-emerald-400 font-semibold">✓ Finalizado</span>}
            </p>
          </div>
          {activeSesion.estado === 'en_curso' && (
            <button onClick={handleFinalizar}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500 transition-colors">
              <CheckCircle2 className="h-4 w-4" /> Finalizar y ajustar
            </button>
          )}
        </div>

        {/* Progreso */}
        <div className="bg-muted/20 rounded-lg p-3 border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progreso</span>
            <span>{Math.round((contados.length / conteos.length) * 100)}%</span>
          </div>
          <div className="h-2 bg-muted/40 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(contados.length / conteos.length) * 100}%` }} />
          </div>
        </div>

        {/* Tabs: Pendientes / Contados / Con diferencia */}
        <ConteoList
          conteos={conteos}
          isFinalizado={activeSesion.estado === 'finalizado'}
          onConteo={handleConteo}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Crear nuevo */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Nuevo inventario periódico</h3>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground block mb-1">Nombre</label>
            <input type="text" value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
              placeholder={`Inventario ${new Date().toLocaleDateString('es-CL')}`}
              className={INPUT} />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer shrink-0 pb-2">
            <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} className="rounded" />
            Solo con stock configurado
          </label>
          <button onClick={handleCrear} disabled={creando || !nuevoNombre.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0">
            {creando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crear
          </button>
        </div>
        {soloConStock && items.filter(i => i.bodegaId).length === 0 ? (
          <p className="text-[10px] text-amber-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            No hay ítems con stock configurado. Desmarca la opción o configura stock primero en la pestaña Stock.
          </p>
        ) : (
          <p className="text-[10px] text-muted-foreground mt-2">
            Se incluirán {soloConStock ? items.filter(i => i.bodegaId).length : items.length} ítems con código SAP
          </p>
        )}
      </div>

      {/* Lista de sesiones */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 text-primary animate-spin" /></div>
      ) : sesiones.length === 0 ? (
        <EmptyState message="No hay inventarios registrados" />
      ) : (
        <div className="space-y-2">
          {sesiones.map(s => (
            <button key={s.id} onClick={() => handleOpenSesion(s)}
              className="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:bg-muted/10 transition-colors text-left">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${s.estado === 'finalizado' ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                {s.estado === 'finalizado' ? <CheckCircle2 className="h-5 w-5 text-emerald-400" /> : <ClipboardList className="h-5 w-5 text-amber-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{s.nombre}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                  <span>{s.contados}/{s.totalItems} contados</span>
                  {s.conDiferencia > 0 && <span className="text-amber-400">{s.conDiferencia} con diferencia</span>}
                  <span>{s.creadoPorNombre}</span>
                  <span>{s.createdAt.toLocaleDateString('es-CL')}</span>
                </div>
              </div>
              {s.estado === 'en_curso' && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold uppercase shrink-0">En curso</span>
              )}
              {s.estado === 'finalizado' && (
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-semibold uppercase shrink-0">Finalizado</span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lista de conteos ──

function ConteoList({ conteos, isFinalizado, onConteo }: {
  conteos: InventarioConteo[]
  isFinalizado: boolean
  onConteo: (sap: string, stockFisico: number, obs?: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'pendientes' | 'contados' | 'diferencias'>('pendientes')
  const [editingSAP, setEditingSAP] = useState<string | null>(null)
  const [editValue, setEditValue] = useState(0)
  const [editObs, setEditObs] = useState('')
  const [conteoSearch, setConteoSearch] = useState('')

  const pendientes = conteos.filter(c => c.stockFisico === null)
  const contados = conteos.filter(c => c.stockFisico !== null)
  const conDif = contados.filter(c => c.diferencia !== 0)

  const baseList = tab === 'pendientes' ? pendientes : tab === 'diferencias' ? conDif : contados
  const visible = useMemo(() => {
    if (!conteoSearch.trim()) return baseList
    const terms = conteoSearch.toLowerCase().trim().split(/\s+/)
    return baseList.filter(c => {
      const h = `${c.codigoSAP} ${c.textoBreve}`.toLowerCase()
      return terms.every(t => h.includes(t))
    })
  }, [baseList, conteoSearch])

  const handleSave = async (sap: string) => {
    await onConteo(sap, editValue, editObs)
    setEditingSAP(null)
    setEditObs('')
  }

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {[
          { id: 'pendientes' as const, label: 'Pendientes', count: pendientes.length, color: 'text-amber-400' },
          { id: 'contados' as const, label: 'Contados', count: contados.length, color: 'text-emerald-400' },
          { id: 'diferencias' as const, label: 'Diferencias', count: conDif.length, color: 'text-red-400' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t.id ? 'bg-muted/40 text-foreground' : 'text-muted-foreground hover:bg-muted/20'}`}>
            {t.label} <span className={t.color}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Búsqueda dentro de conteos */}
      {conteos.length > 10 && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" placeholder="Buscar por nombre o SAP…" value={conteoSearch} onChange={e => setConteoSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted/20 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground" />
          {conteoSearch && <button onClick={() => setConteoSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2"><X className="h-3 w-3 text-muted-foreground" /></button>}
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState message={conteoSearch ? 'Sin coincidencias' : tab === 'pendientes' ? 'Todo contado' : 'Sin ítems'} />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border/50 max-h-[50vh] overflow-y-auto">
          {visible.map(c => (
            <div key={c.codigoSAP} className="px-4 py-2.5 hover:bg-muted/10 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.textoBreve}</p>
                  <span className="text-[10px] font-mono text-blue-400">{c.codigoSAP}</span>
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
                      <p className={`text-sm font-bold tabular-nums ${c.diferencia > 0 ? 'text-emerald-400' : c.diferencia < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {c.diferencia > 0 ? '+' : ''}{c.diferencia}
                      </p>
                    </div>
                    {!isFinalizado && (
                      <button onClick={() => { setEditingSAP(c.codigoSAP); setEditValue(c.stockFisico!); setEditObs(c.observaciones || '') }}
                        className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                    )}
                  </>
                ) : (
                  editingSAP === c.codigoSAP ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <input type="number" min={0} value={editValue} onChange={e => setEditValue(Number(e.target.value))}
                        className="w-20 px-2 py-1 text-sm text-center bg-muted/30 border border-border rounded-lg tabular-nums font-bold focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground" autoFocus />
                      <input type="text" value={editObs} onChange={e => setEditObs(e.target.value)}
                        placeholder="Obs." className="w-28 px-2 py-1 text-xs bg-muted/30 border border-border rounded-lg text-foreground" />
                      <button onClick={() => handleSave(c.codigoSAP)} className="p-1 rounded bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setEditingSAP(null)} className="p-1 rounded hover:bg-muted/50 text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingSAP(c.codigoSAP); setEditValue(c.stockSistema) }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors shrink-0">
                      <CircleDot className="h-3.5 w-3.5" /> Contar
                    </button>
                  )
                )}
              </div>
              {c.observaciones && c.stockFisico !== null && (
                <p className="text-[10px] text-muted-foreground mt-1 ml-1">📝 {c.observaciones}</p>
              )}
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

  useEffect(() => {
    setLoading(true)
    bodega.loadAllMovimientos(50).then(data => {
      setMovimientos(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [bodega.loadAllMovimientos])

  const filtered = useMemo(() => {
    let result = movimientos
    if (filtroTipo !== 'todos') result = result.filter(m => m.tipo === filtroTipo)
    if (searchMov.trim()) {
      const terms = searchMov.toLowerCase().trim().split(/\s+/)
      result = result.filter(m => {
        const h = `${m.bodegaItemId} ${m.motivo} ${m.realizadoPorNombre}`.toLowerCase()
        return terms.every(t => h.includes(t))
      })
    }
    return result
  }, [movimientos, filtroTipo, searchMov])

  const entradas = movimientos.filter(m => m.tipo === 'entrada').length
  const salidas = movimientos.filter(m => m.tipo === 'salida').length
  const ajustes = movimientos.filter(m => m.tipo === 'ajuste').length

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 text-primary animate-spin" /></div>
  }

  return (
    <div className="space-y-3">
      {/* Resumen */}
      <div className="grid grid-cols-4 gap-2">
        <button onClick={() => setFiltroTipo('todos')}
          className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${filtroTipo === 'todos' ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:bg-muted/20'}`}>
          <History className="h-4 w-4 text-blue-400" />
          <div><p className="text-lg font-bold text-foreground tabular-nums">{movimientos.length}</p><p className="text-[10px] text-muted-foreground">Total</p></div>
        </button>
        <button onClick={() => setFiltroTipo('entrada')}
          className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${filtroTipo === 'entrada' ? 'border-emerald-500/40 bg-emerald-500/5 ring-1 ring-emerald-500/20' : 'border-border bg-card hover:bg-muted/20'}`}>
          <ArrowDownCircle className="h-4 w-4 text-emerald-400" />
          <div><p className="text-lg font-bold text-foreground tabular-nums">{entradas}</p><p className="text-[10px] text-muted-foreground">Entradas</p></div>
        </button>
        <button onClick={() => setFiltroTipo('salida')}
          className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${filtroTipo === 'salida' ? 'border-red-500/40 bg-red-500/5 ring-1 ring-red-500/20' : 'border-border bg-card hover:bg-muted/20'}`}>
          <ArrowUpCircle className="h-4 w-4 text-red-400" />
          <div><p className="text-lg font-bold text-foreground tabular-nums">{salidas}</p><p className="text-[10px] text-muted-foreground">Salidas</p></div>
        </button>
        <button onClick={() => setFiltroTipo('ajuste')}
          className={`flex items-center gap-2 p-3 rounded-xl border transition-all text-left ${filtroTipo === 'ajuste' ? 'border-blue-500/40 bg-blue-500/5 ring-1 ring-blue-500/20' : 'border-border bg-card hover:bg-muted/20'}`}>
          <Settings2 className="h-4 w-4 text-blue-400" />
          <div><p className="text-lg font-bold text-foreground tabular-nums">{ajustes}</p><p className="text-[10px] text-muted-foreground">Ajustes</p></div>
        </button>
      </div>

      {/* Búsqueda + Export */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por SAP, motivo, usuario…" value={searchMov} onChange={e => setSearchMov(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm bg-muted/30 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground" />
          {searchMov && <button onClick={() => setSearchMov('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted/50"><X className="h-3.5 w-3.5 text-muted-foreground" /></button>}
        </div>
        <button onClick={() => exportMovsCsv(filtered)} title="Exportar CSV" className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-muted/30 border border-border rounded-lg hover:bg-muted/50 text-muted-foreground transition-colors shrink-0">
          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Exportar</span>
        </button>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <EmptyState message={movimientos.length === 0 ? 'Sin movimientos registrados' : 'Sin resultados'} />
      ) : (
        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="hidden sm:grid grid-cols-[90px_80px_1fr_80px_80px_120px] gap-2 px-4 py-2 bg-muted/20 border-b border-border text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            <span>Fecha</span><span>Tipo</span><span>Motivo</span><span className="text-center">Cantidad</span><span className="text-center">Stock</span><span>Realizado por</span>
          </div>
          <div className="divide-y divide-border/50 max-h-[55vh] overflow-y-auto">
            {filtered.map(m => {
              const tipoConfig = {
                entrada: { label: 'Entrada', color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: ArrowDownCircle },
                salida: { label: 'Salida', color: 'text-red-400', bg: 'bg-red-500/10', icon: ArrowUpCircle },
                ajuste: { label: 'Ajuste', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Settings2 },
              }[m.tipo]
              const TIcon = tipoConfig.icon
              return (
                <div key={m.id} className="sm:grid sm:grid-cols-[90px_80px_1fr_80px_80px_120px] gap-2 px-4 py-2.5 hover:bg-muted/10 transition-colors">
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
                    <span className="text-[10px] font-mono text-blue-400">{m.bodegaItemId}</span>
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
          <div className="px-4 py-2 bg-muted/10 border-t border-border text-xs text-muted-foreground">{filtered.length} movimientos</div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════
//  TAB: ESTADÍSTICAS
// ══════════════════════════════════════════════

function EstadisticasTab({ bodega }: { bodega: ReturnType<typeof useBodega> }) {
  const { items, stats } = bodega
  const [movimientos, setMovimientos] = useState<MovimientoBodega[]>([])
  const [movLoading, setMovLoading] = useState(true)

  useEffect(() => {
    setMovLoading(true)
    bodega.loadAllMovimientos(5).then(data => {
      setMovimientos(data)
      setMovLoading(false)
    }).catch(() => setMovLoading(false))
  }, [bodega.loadAllMovimientos])

  const movEntradas = movimientos.filter(m => m.tipo === 'entrada').length
  const movSalidas = movimientos.filter(m => m.tipo === 'salida').length
  const movAjustes = movimientos.filter(m => m.tipo === 'ajuste').length

  // Cobertura y salud
  const coberturaPct = stats.total > 0 ? Math.round((stats.conStock / stats.total) * 100) : 0
  const okCount = stats.stockOk
  const proveedores = useMemo(() => {
    const map = new Map<string, number>()
    for (const i of items) {
      if (!i.proveedor) continue
      map.set(i.proveedor, (map.get(i.proveedor) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [items])

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard label="Total ítems SAP" value={stats.total} icon={Package} color="text-blue-400" />
        <KpiCard label="Con stock configurado" value={stats.conStock} icon={PackageCheck} color="text-emerald-400" sub={`${coberturaPct}% cobertura`} />
        <KpiCard label="Valor inventario" value={`$${stats.valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`} icon={DollarSign} color="text-violet-400" />
        <KpiCard label="Bajo / Sin stock" value={`${stats.bajoStock} / ${stats.sinStock}`} icon={AlertTriangle} color="text-amber-400" />
      </div>

      {/* Salud de stock + Cobertura */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Salud de stock */}
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Salud del inventario</p>
          <div className="flex items-center gap-3 mb-3">
            {[
              { icon: ShieldCheck, label: 'OK', count: okCount, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { icon: ShieldAlert, label: 'Bajo', count: stats.bajoStock, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { icon: ShieldX, label: 'Sin stock', count: stats.sinStock, color: 'text-red-400', bg: 'bg-red-500/10' },
            ].map(s => (
              <div key={s.label} className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border border-border/50 bg-muted/10">
                <s.icon className={`h-5 w-5 ${s.color}`} />
                <span className="text-lg font-bold text-foreground tabular-nums">{s.count}</span>
                <span className="text-[9px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
          {/* Barra de salud apilada */}
          {stats.conStock > 0 && (
            <div className="h-3 rounded-full overflow-hidden flex bg-muted/30">
              {okCount > 0 && <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(okCount / stats.conStock) * 100}%` }} title={`OK: ${okCount}`} />}
              {stats.bajoStock > 0 && <div className="bg-amber-500 h-full transition-all" style={{ width: `${(stats.bajoStock / stats.conStock) * 100}%` }} title={`Bajo: ${stats.bajoStock}`} />}
              {stats.sinStock > 0 && <div className="bg-red-500 h-full transition-all" style={{ width: `${(stats.sinStock / stats.conStock) * 100}%` }} title={`Sin: ${stats.sinStock}`} />}
            </div>
          )}
        </div>

        {/* Cobertura */}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Alertas de stock bajo */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-red-500/5">
            <p className="text-xs font-semibold text-red-400 uppercase tracking-wide flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Alertas de stock ({stats.alertas.length})
            </p>
          </div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {stats.alertas.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground text-center">Sin alertas de stock bajo</p>
            ) : stats.alertas.map(item => (
              <div key={item.codigoSAP} className="px-4 py-2.5 flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${item.stockActual === 0 ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                  {item.stockActual === 0 ? <PackageX className="h-4 w-4 text-red-400" /> : <TrendingDown className="h-4 w-4 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.textoBreve}</p>
                  <p className="text-[10px] font-mono text-blue-400">{item.codigoSAP}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-sm font-bold tabular-nums ${item.stockActual === 0 ? 'text-red-400' : 'text-amber-400'}`}>{item.stockActual}</p>
                  <p className="text-[9px] text-muted-foreground">mín: {item.stockMinimo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Distribución por tipo */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Distribución por tipo</p>
          </div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {stats.tipoDistribution.map(([tipo, count]) => (
              <div key={tipo} className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-foreground">{tipo}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(count / stats.total) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground tabular-nums w-8 text-right">{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top ítems por valor */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-violet-500/5">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide">Top 10 ítems por valor</p>
          </div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {stats.topByValue.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground text-center">Sin datos de valor</p>
            ) : stats.topByValue.map((item, i) => (
              <div key={item.codigoSAP} className="px-4 py-2 flex items-center gap-3">
                <span className="text-[10px] text-muted-foreground/50 w-4 text-right shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{item.textoBreve}</p>
                  <p className="text-[10px] text-muted-foreground">{item.stockActual} × ${(item.costoCompra ?? item.valorUnitario ?? 0).toLocaleString('es-CL')}</p>
                </div>
                <span className="text-xs font-bold text-violet-400 tabular-nums shrink-0">${item.valorInventario.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Movimientos recientes */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Movimientos recientes
              {!movLoading && <span className="text-muted-foreground/50">({movEntradas}↓ {movSalidas}↑ {movAjustes}⟳)</span>}
            </p>
          </div>
          <div className="max-h-[250px] overflow-y-auto divide-y divide-border/50">
            {movLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 text-primary animate-spin" /></div>
            ) : movimientos.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground text-center">Sin movimientos registrados</p>
            ) : movimientos.slice(0, 15).map(m => (
              <div key={m.id} className="px-4 py-2 flex items-center gap-2">
                <span className={`text-[10px] font-bold w-12 shrink-0 ${m.tipo === 'entrada' ? 'text-emerald-400' : m.tipo === 'salida' ? 'text-red-400' : 'text-blue-400'}`}>
                  {m.tipo === 'entrada' ? '↓ Entr.' : m.tipo === 'salida' ? '↑ Sal.' : '⟳ Ajuste'}
                </span>
                <span className="text-xs font-bold text-foreground tabular-nums w-8 shrink-0">
                  {m.tipo === 'ajuste' ? `→${m.stockResultante}` : `${m.tipo === 'entrada' ? '+' : '-'}${m.cantidad}`}
                </span>
                <span className="text-xs text-muted-foreground truncate flex-1">{m.motivo || m.bodegaItemId}</span>
                <span className="text-[10px] text-muted-foreground/50 shrink-0">{m.createdAt.toLocaleDateString('es-CL')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Proveedores */}
      {proveedores.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Proveedores ({proveedores.length})
            </p>
          </div>
          <div className="max-h-[200px] overflow-y-auto divide-y divide-border/50">
            {proveedores.map(([prov, count]) => (
              <div key={prov} className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-foreground truncate">{prov}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="w-20 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${(count / items.length) * 100}%` }} />
                  </div>
                  <span className="text-xs font-bold text-muted-foreground tabular-nums w-8 text-right">{count}</span>
                </div>
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
      active ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:bg-muted/20'].join(' ')}>
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
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 bg-muted/20`}><Icon className={`h-5 w-5 ${color}`} /></div>
      <div>
        <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
        {sub && <p className="text-[9px] text-muted-foreground/60 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  )
}

function BodegaRow({ item, onEdit, onMovimiento, onHistorial }: {
  item: BodegaMergedItem; onEdit: () => void; onMovimiento: () => void; onHistorial: () => void
}) {
  const has = !!item.bodegaId
  const isBajo = has && item.stockMinimo > 0 && item.stockActual <= item.stockMinimo && item.stockActual > 0
  const isSin = has && item.stockActual === 0 && item.stockMinimo > 0
  const valorTotal = item.stockActual * (item.costoCompra ?? item.valorUnitario ?? 0)

  return (
    <div className={`sm:grid sm:grid-cols-[1fr_60px_70px_70px_70px_110px_100px] gap-2 px-4 py-2.5 transition-colors ${isSin ? 'bg-red-500/5 hover:bg-red-500/10 border-l-2 border-l-red-500/40' : isBajo ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500/40' : 'hover:bg-muted/10'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{item.textoBreve}</p>
          {isSin && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-semibold uppercase">Sin stock</span>}
          {isBajo && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold uppercase">Bajo</span>}
          {!has && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-400 font-medium">Sin config.</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">{item.codigoSAP}</span>
          {item.codigoFabricante && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 font-mono">{item.codigoFabricante}</span>}
          {item.tipo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">{item.tipo}</span>}
        </div>
      </div>
      {/* Equipos */}
      <div className="hidden sm:flex items-center justify-center" title={item.equipos.map(e => e.machineName).join(', ')}>
        <span className="text-xs font-medium text-muted-foreground tabular-nums flex items-center gap-0.5">
          <Layers className="h-3 w-3 opacity-50" />{item.equipos.length}
        </span>
      </div>
      <div className="flex sm:flex-col items-center justify-center gap-1 mt-2 sm:mt-0">
        <span className="sm:hidden text-xs text-muted-foreground">Stock:</span>
        {has ? <span className={`text-sm font-bold tabular-nums ${isSin ? 'text-red-400' : isBajo ? 'text-amber-400' : 'text-foreground'}`}>{item.stockActual}</span>
          : <span className="text-sm text-muted-foreground/30">—</span>}
      </div>
      <div className="hidden sm:flex items-center justify-center"><span className="text-sm text-muted-foreground tabular-nums">{has && item.stockMinimo > 0 ? item.stockMinimo : '—'}</span></div>
      {/* Valor */}
      <div className="hidden sm:flex items-center justify-center">
        {has && valorTotal > 0 ? <span className="text-xs font-medium text-violet-400 tabular-nums">${valorTotal.toLocaleString('es-CL', { maximumFractionDigits: 0 })}</span>
          : <span className="text-xs text-muted-foreground/30">—</span>}
      </div>
      <div className="hidden sm:flex items-center">
        {item.ubicacionBodega ? <span className="text-xs text-muted-foreground truncate flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{item.ubicacionBodega}</span>
          : <span className="text-xs text-muted-foreground/30">—</span>}
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 sm:mt-0">
        <button onClick={onMovimiento} title="Movimiento" className="p-1.5 rounded-md hover:bg-emerald-500/10 text-emerald-400 transition-colors"><ArrowDownCircle className="h-4 w-4" /></button>
        {has && <button onClick={onHistorial} title="Historial" className="p-1.5 rounded-md hover:bg-blue-500/10 text-blue-400 transition-colors"><History className="h-4 w-4" /></button>}
        <button onClick={onEdit} title={has ? 'Editar' : 'Configurar'} className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors">
          {has ? <Pencil className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
        </button>
      </div>
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
    <div className="bg-red-500/5 border border-red-500/20 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-red-500/10 transition-colors">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span className="text-xs font-semibold text-red-400">
            {alertas.length} alerta{alertas.length > 1 ? 's' : ''} de stock
          </span>
          {sinStock.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-bold">{sinStock.length} sin stock</span>}
          {bajoStock.length > 0 && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold">{bajoStock.length} bajo mínimo</span>}
        </div>
        <ChevronDown className={`h-4 w-4 text-red-400/60 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-red-500/10 divide-y divide-red-500/10 max-h-[200px] overflow-y-auto">
          {alertas.slice(0, 10).map(item => (
            <div key={item.codigoSAP} className="flex items-center gap-3 px-4 py-2">
              {item.stockActual === 0
                ? <PackageX className="h-4 w-4 text-red-400 shrink-0" />
                : <TrendingDown className="h-4 w-4 text-amber-400 shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{item.textoBreve}</p>
                <span className="text-[10px] font-mono text-blue-400">{item.codigoSAP}</span>
              </div>
              <div className="text-right shrink-0">
                <span className={`text-sm font-bold tabular-nums ${item.stockActual === 0 ? 'text-red-400' : 'text-amber-400'}`}>{item.stockActual}</span>
                <span className="text-[9px] text-muted-foreground ml-1">/ {item.stockMinimo}</span>
              </div>
            </div>
          ))}
          {alertas.length > 10 && (
            <div className="px-4 py-2 text-center">
              <button onClick={() => onFilter('bajo')} className="text-[10px] text-primary hover:underline">
                Ver todas las {alertas.length} alertas →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ModalBackdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground mb-1 block">{label}</span>{children}</label>
}

function StockFormModal({ item, onSave, onClose }: { item: BodegaMergedItem; onSave: (d: BodegaStockData) => Promise<void>; onClose: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<BodegaStockData>({
    stockActual: item.stockActual, stockMinimo: item.stockMinimo,
    stockMaximo: item.stockMaximo ?? 0,
    ubicacionBodega: item.ubicacionBodega || '', proveedor: item.proveedor || '',
    costoCompra: item.costoCompra ?? item.valorUnitario ?? 0, unidad: item.unidad || 'pzas',
    leadTime: item.leadTime ?? 0, categoria: item.categoria,
    observaciones: item.observaciones || '',
  })
  const set = (k: keyof BodegaStockData, v: string | number) => setForm(p => ({ ...p, [k]: v }))

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={async e => { e.preventDefault(); setSaving(true); try { await onSave(form) } finally { setSaving(false) } }}>
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-base font-bold">{item.bodegaId ? 'Editar stock' : 'Configurar stock'}</h3>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{item.textoBreve}</p>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">{item.codigoSAP}</span>
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
            <Field label="Lead time (días)"><input type="number" min={0} value={form.leadTime ?? 0} onChange={e => set('leadTime', Number(e.target.value))} className={`${INPUT} tabular-nums`} placeholder="Días de entrega" /></Field>
            <Field label="Categoría ABC">
              <select value={form.categoria || ''} onChange={e => set('categoria', e.target.value)} className={INPUT}>
                <option value="">Sin clasificar</option>
                <option value="A">A — Crítico / Alto valor</option>
                <option value="B">B — Importante / Valor medio</option>
                <option value="C">C — Estándar / Bajo valor</option>
              </select>
            </Field>
          </div>
          <Field label="Observaciones"><textarea value={form.observaciones || ''} onChange={e => set('observaciones', e.target.value)} rows={2} className={`${INPUT} resize-none`} /></Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40 rounded-lg">Cancelar</button>
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

  const handleTipoChange = (t: typeof tipo) => {
    setTipo(t)
    setMotivoKey('')
  }

  const OPTS = [
    { v: 'entrada' as const, l: 'Entrada', icon: ArrowDownCircle, c: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { v: 'salida' as const, l: 'Salida', icon: ArrowUpCircle, c: 'text-red-400 bg-red-500/10 border-red-500/30' },
    { v: 'ajuste' as const, l: 'Ajuste', icon: Settings2, c: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  ]

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={async e => { e.preventDefault(); setSaving(true); try { await onSave(tipo, cantidad, motivoFinal) } finally { setSaving(false) } }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div><h3 className="text-base font-bold">Registrar movimiento</h3><p className="text-xs text-muted-foreground truncate mt-0.5">{item.textoBreve} — {item.codigoSAP}</p></div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-muted/50"><X className="h-5 w-5 text-muted-foreground" /></button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {OPTS.map(o => { const I = o.icon; return (
              <button key={o.v} type="button" onClick={() => handleTipoChange(o.v)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all text-sm font-medium ${tipo === o.v ? o.c : 'border-border bg-muted/10 text-muted-foreground hover:bg-muted/20'}`}>
                <I className="h-5 w-5" />{o.l}
              </button>
            )})}
          </div>
          <Field label={tipo === 'ajuste' ? 'Nuevo stock' : 'Cantidad'}>
            <input type="number" min={0} value={cantidad} onChange={e => setCantidad(Number(e.target.value))} className={`${INPUT} text-lg font-bold tabular-nums text-center`} autoFocus />
          </Field>
          <div className="flex items-center justify-center gap-3 py-2 px-4 rounded-lg bg-muted/20 border border-border">
            <span className="text-sm text-muted-foreground">Actual: <strong className="text-foreground">{item.stockActual}</strong></span>
            <span className="text-muted-foreground">→</span>
            <span className="text-sm text-muted-foreground">Nuevo: <strong className={preview <= (item.stockMinimo || 0) && item.stockMinimo > 0 ? 'text-amber-400' : 'text-emerald-400'}>{preview}</strong></span>
          </div>
          <Field label="Motivo">
            <select value={motivoKey} onChange={e => setMotivoKey(e.target.value)} className={INPUT}>
              <option value="">— Seleccionar motivo —</option>
              {motivos.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </Field>
          <Field label="Referencia (opcional)">
            <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Ej: OC #123, OT #456, Bomba L3…" className={INPUT} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40 rounded-lg">Cancelar</button>
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
        <button onClick={onClose} className="p-1 rounded hover:bg-muted/50"><X className="h-5 w-5 text-muted-foreground" /></button>
      </div>
      <div className="px-5 py-4 max-h-[400px] overflow-y-auto">
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 text-primary animate-spin" /></div>
          : movs.length === 0 ? <p className="text-center text-sm text-muted-foreground py-8">Sin movimientos</p>
          : <div className="space-y-2">{movs.map(m => {
            const cfg = { entrada: { l: 'Entrada', c: 'text-emerald-400 bg-emerald-500/10', i: ArrowDownCircle },
              salida: { l: 'Salida', c: 'text-red-400 bg-red-500/10', i: ArrowUpCircle },
              ajuste: { l: 'Ajuste', c: 'text-blue-400 bg-blue-500/10', i: Settings2 } }[m.tipo]
            const I = cfg.i
            return (
              <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/10 border border-border/50">
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
        <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40 rounded-lg">Cerrar</button>
      </div>
    </ModalBackdrop>
  )
}

function BulkConfigModal({ items, saveStock, onClose }: {
  items: BodegaMergedItem[]
  saveStock: (sap: string, data: BodegaStockData) => Promise<void>
  onClose: () => void
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
    const terms = searchBulk.toLowerCase().split(/\s+/)
    return items.filter(i => {
      const h = `${i.codigoSAP} ${i.textoBreve} ${i.tipo || ''}`.toLowerCase()
      return terms.every(t => h.includes(t))
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
        await saveStock(item.codigoSAP, {
          stockActual: 0, stockMinimo, stockMaximo: 0,
          ubicacionBodega: ubicacion, unidad,
          observaciones: '',
        })
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
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">{selected.size} ítems configurados</p>
            <p className="text-xs text-muted-foreground mt-1">Stock mín: {stockMinimo} | Unidad: {unidad}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Stock mínimo"><input type="number" min={0} value={stockMinimo} onChange={e => setStockMinimo(Number(e.target.value))} className={`${INPUT} tabular-nums`} /></Field>
              <Field label="Unidad">
                <select value={unidad} onChange={e => setUnidad(e.target.value)} className={INPUT}>
                  <option value="pzas">Piezas</option><option value="litros">Litros</option><option value="metros">Metros</option><option value="kg">Kilogramos</option><option value="rollos">Rollos</option><option value="cajas">Cajas</option><option value="sets">Sets</option>
                </select>
              </Field>
              <Field label="Ubicación"><input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Opcional" className={INPUT} /></Field>
            </div>

            {/* Selección */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border">
                <input type="checkbox" checked={selected.size === visible.length && visible.length > 0} onChange={toggleAll} className="rounded" />
                <span className="text-xs text-muted-foreground">{selected.size} seleccionados</span>
                <div className="flex-1" />
                <input type="text" value={searchBulk} onChange={e => setSearchBulk(e.target.value)} placeholder="Filtrar…" className="w-32 px-2 py-1 text-[10px] bg-muted/30 border border-border rounded text-foreground" />
              </div>
              <div className="max-h-[200px] overflow-y-auto divide-y divide-border/50">
                {visible.slice(0, 100).map(item => (
                  <label key={item.codigoSAP} className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/10 cursor-pointer">
                    <input type="checkbox" checked={selected.has(item.codigoSAP)} onChange={() => {
                      const next = new Set(selected)
                      next.has(item.codigoSAP) ? next.delete(item.codigoSAP) : next.add(item.codigoSAP)
                      setSelected(next)
                    }} className="rounded" />
                    <span className="text-xs text-foreground truncate flex-1">{item.textoBreve}</span>
                    <span className="text-[10px] font-mono text-blue-400 shrink-0">{item.codigoSAP}</span>
                  </label>
                ))}
              </div>
            </div>

            {saving && (
              <div className="bg-muted/20 rounded-lg p-3 border border-border">
                <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Configurando…</span><span>{progress}%</span></div>
                <div className="h-2 bg-muted/40 rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
        <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40 rounded-lg">{done ? 'Cerrar' : 'Cancelar'}</button>
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
