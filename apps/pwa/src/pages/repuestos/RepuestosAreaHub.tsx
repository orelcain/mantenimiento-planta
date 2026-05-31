/**
 * RepuestosAreaHub — Lente único área-first del módulo Repuestos (rediseño).
 *
 * Fase 1 (shell): sidebar de áreas + header de área + KPIs + lista de
 * motores/bombas del área (validando el vínculo hierarchy de Fase 0) + detalle.
 *
 * Pendiente por fase:
 *  - Fase 2: tabla de repuestos del área (catálogo + bodega) con stock/paginación.
 *  - Fase 3: panel de detalle lateral del repuesto.
 *  - Fase 5: filtro "Tipo ▾" + columna Tipo (una sola bodega; agrupación por tipo de repuesto).
 *  - Fase 6: "+ Solicitar repuesto".
 *  - Fase 7: búsqueda global del topbar + promover hub a vista por defecto.
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, ChevronRight, ChevronLeft, Cog, ImageOff, Plus, ListChecks, ClipboardList, Menu } from 'lucide-react'
import { Badge, Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui'
import { AreaSidebar } from '@/components/repuestos/AreaSidebar'
import { AssetDetailModal } from '@/components/repuestos/AssetDetailModal'
import { RepuestoDetailPanel } from '@/components/repuestos/RepuestoDetailPanel'
import { AssetDetailPanel } from '@/components/repuestos/AssetDetailPanel'
import { SolicitarRepuestoModal, type RepuestoLite } from '@/components/repuestos/SolicitarRepuestoModal'
import { SolicitudesPanel } from '@/components/repuestos/SolicitudesPanel'
import { useSolicitudes } from '@/hooks/repuestos/useSolicitudes'
import { useAuthStore } from '@/store/authStore'
import { usePlantAssets } from '@/hooks/repuestos/usePlantAssets'
import { useHierarchyAreaTree, type AreaTreeNode } from '@/hooks/useHierarchyAreaTree'
import { useGlobalSearch } from '@/hooks/repuestos/useGlobalSearch'
import { useGlobalEquipmentSearch, getGlobalEquipmentCache } from '@/hooks/useGlobalEquipmentSearch'
import { useBodega } from '@/hooks/repuestos/useBodega'
import { useAreaRepuestos, type StockStatus } from '@/hooks/repuestos/useAreaRepuestos'
import { useHierarchyPaths } from '@/hooks/repuestos/useHierarchyPaths'
import { normalizeForSearch } from '@/utils/repuestos'
import type { PlantAsset, Machine } from '@/types/repuestos'

type StockFilter = 'all' | StockStatus
const PAGE_SIZES = [8, 25, 50]

const STORAGE_KEY = 'repuestos-nav-node' // compartido con EquipmentNavigator

/** Foto principal (primero) de un asset. */
function thumbOf(asset: PlantAsset): string | undefined {
  const imgs = (asset.imagenes ?? []).slice().sort(
    (a, b) => (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0) || (a.orden ?? 0) - (b.orden ?? 0),
  )
  return imgs[0]?.url || undefined
}

/** Etiqueta de tipo de repuesto (texto libre del catálogo); vacío → "Sin clasificar". */
const tipoLabelOf = (tipo?: string): string => (tipo || '').trim() || 'Sin clasificar'

const STOCK_META: Record<StockStatus, { label: string; dot: string; text: string }> = {
  ok: { label: 'Disponible', dot: 'bg-emerald-500', text: 'text-emerald-500' },
  low: { label: 'Bajo', dot: 'bg-amber-500', text: 'text-amber-500' },
  out: { label: 'Sin stock', dot: 'bg-red-500', text: 'text-red-500' },
  unset: { label: 'Sin config', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
}

function KpiCard({ value, label, accent, hint, bar }: { value: string | number; label: string; accent: string; hint?: string; bar?: string }) {
  return (
    <div className={['rounded-xl border border-l-4 border-border bg-card px-4 py-3', bar].filter(Boolean).join(' ')}>
      <div className={['text-2xl font-bold tabular-nums', accent].join(' ')}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground/60">{hint}</div>}
    </div>
  )
}

export function RepuestosAreaHub() {
  const { areaTree, findNode, getNodePath, expandNode } = useHierarchyAreaTree()
  const { assets, loading: assetsLoading, updateAsset, addImagen, deleteImagen } = usePlantAssets()

  // Las máquinas con repuestos están archivadas (activa=false); el catálogo se arma
  // desde el equipment cache (mismo patrón que Buscador/Bodega), no desde useActiveMachines.
  const { loading: eqLoading } = useGlobalEquipmentSearch('', 999)
  const { isUnder, loading: pathsLoading } = useHierarchyPaths()

  // machines[] + machineId→Set(ancestros) desde el equipment cache (cada equipo trae path).
  const { machines, machineAreas } = useMemo(() => {
    const eq = getGlobalEquipmentCache() || []
    const machinesMap = new Map<string, Machine>()
    const areas = new Map<string, Set<string>>()
    for (const e of eq) {
      if (!e.linkedMachineId || e.oculto) continue
      if (!machinesMap.has(e.linkedMachineId)) {
        machinesMap.set(e.linkedMachineId, {
          id: e.linkedMachineId, nombre: e.nombre, marca: '', modelo: '',
          activa: true, color: '#6b7280', orden: 0, createdAt: new Date(),
        } as Machine)
      }
      let set = areas.get(e.linkedMachineId)
      if (!set) { set = new Set<string>(); areas.set(e.linkedMachineId, set) }
      for (const a of e.path) set.add(a)
      set.add(e.id)
      if (e.parentId) set.add(e.parentId)
    }
    return { machines: [...machinesMap.values()], machineAreas: areas }
    // eqLoading dispara el recálculo cuando el cache (no reactivo) termina de cargar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqLoading])

  const { allRepuestos, loadAll, loaded: repuestosLoaded, loading: repuestosLoading } = useGlobalSearch(machines)
  useEffect(() => { if (machines.length) loadAll() }, [machines, loadAll])
  const { items: bodegaItems, loading: bodegaLoading, loadMovimientos, saveStock } = useBodega(allRepuestos)

  // membership repuesto(machineId) → área: vía equipment cache, con fallback a ancestría directa
  const machineInArea = useCallback(
    (machineId: string, areaId: string) => machineAreas.get(machineId)?.has(areaId) ?? isUnder(machineId, areaId),
    [machineAreas, isUnder],
  )

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })
  const [showingAll, setShowingAll] = useState(false)
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({})
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showEquipos, setShowEquipos] = useState(false)

  // Filtros + paginación de la tabla de repuestos
  const [repQuery, setRepQuery] = useState('')
  const [repEquipoFilter, setRepEquipoFilter] = useState<string>('all')
  const [repStockFilter, setRepStockFilter] = useState<StockFilter>('all')
  const [repTipoFilter, setRepTipoFilter] = useState<string>('all')
  const [repPage, setRepPage] = useState(0)
  const [repPageSize, setRepPageSize] = useState(25)

  // Repuesto seleccionado → panel lateral de detalle
  const [selectedRepSap, setSelectedRepSap] = useState<string | null>(null)

  // ── Solicitudes de repuesto (Fase 6) ──
  const user = useAuthStore((s) => s.user)
  const { solicitudes, loading: solicitudesLoading, pendientesCount, crearSolicitud, avanzarEstado } = useSolicitudes()
  const [solicitarOpen, setSolicitarOpen] = useState(false)
  const [solicitarRepuesto, setSolicitarRepuesto] = useState<RepuestoLite | null>(null)
  const [solicitudesOpen, setSolicitudesOpen] = useState(false)

  // Drawer del sidebar de áreas en móvil
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)

  const openSolicitar = useCallback((rep: RepuestoLite | null) => {
    setSolicitarRepuesto(rep)
    setSolicitarOpen(true)
  }, [])

  const handleCrearSolicitud = useCallback(
    async (data: Parameters<typeof crearSolicitud>[0]) => {
      await crearSolicitud(data, user?.id ?? 'anon', user?.nombre ?? 'Anónimo')
    },
    [crearSolicitud, user],
  )

  // Persistir selección
  useEffect(() => {
    try {
      if (selectedAreaId) localStorage.setItem(STORAGE_KEY, selectedAreaId)
    } catch { /* noop */ }
  }, [selectedAreaId])

  const linkedAssets = useMemo(() => assets.filter((a) => a.hierarchyNodeId), [assets])

  // Conteo recursivo de M/B por nodeId (por ancestría, robusto) — para badges del sidebar
  const assetCountByNode = useMemo(() => {
    const out: Record<string, number> = {}
    const visit = (node: AreaTreeNode) => {
      out[node.id] = linkedAssets.filter((a) => isUnder(a.hierarchyNodeId, node.id)).length
      node.children.forEach(visit)
    }
    areaTree.forEach(visit)
    return out
  }, [areaTree, linkedAssets, isUnder])

  const selectedNode = useMemo(
    () => (selectedAreaId ? findNode(selectedAreaId) : null),
    [selectedAreaId, findNode],
  )

  // Motores/bombas del área seleccionada (por ancestría)
  const areaAssets = useMemo(() => {
    if (showingAll) return linkedAssets
    if (!selectedAreaId) return []
    return linkedAssets.filter((a) => isUnder(a.hierarchyNodeId, selectedAreaId))
  }, [linkedAssets, showingAll, selectedAreaId, isUnder])

  // Búsqueda global: motores/bombas que matchean la query (equipo/modelo/SAP/marca/componente)
  const filteredAssets = useMemo(() => {
    const q = normalizeForSearch(repQuery)
    if (!q) return areaAssets
    return areaAssets.filter((a) =>
      normalizeForSearch(a.equipo).includes(q) ||
      normalizeForSearch(a.modeloTipo ?? '').includes(q) ||
      normalizeForSearch(a.codigoSAP ?? '').includes(q) ||
      normalizeForSearch(a.marca ?? '').includes(q) ||
      normalizeForSearch(a.componente ?? '').includes(q),
    )
  }, [areaAssets, repQuery])

  // Al buscar y haber M/B coincidentes, abrir la sección de equipos para no ocultarlos
  useEffect(() => {
    if (repQuery.trim() && filteredAssets.length > 0) setShowEquipos(true)
  }, [repQuery, filteredAssets.length])

  // Repuestos del área (catálogo + bodega) y KPIs de stock derivados
  const areaRepuestos = useAreaRepuestos(bodegaItems, { showingAll, selectedAreaId, machineInArea })
  const stockKpis = useMemo(() => {
    let ok = 0, low = 0, out = 0
    for (const r of areaRepuestos) {
      if (r.stockStatus === 'ok') ok++
      else if (r.stockStatus === 'low') low++
      else if (r.stockStatus === 'out') out++
    }
    const total = areaRepuestos.length
    const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
    return { total, ok, low, out, pctOk: pct(ok), pctLow: pct(low), pctOut: pct(out) }
  }, [areaRepuestos])

  // Opciones del filtro "Equipo" (nombres distintos del área)
  const equipoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of areaRepuestos) { const n = r.equipos[0]?.machineName; if (n) s.add(n) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [areaRepuestos])

  // Opciones del filtro "Tipo" presentes en el área, ordenadas por frecuencia (con conteo)
  const tipoOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of areaRepuestos) {
      const t = tipoLabelOf(r.tipo)
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }, [areaRepuestos])

  // Opciones para el selector del modal de solicitud (repuestos del área con SAP)
  const solicitarOptions = useMemo<RepuestoLite[]>(
    () => areaRepuestos.map((r) => ({ codigoSAP: r.codigoSAP, textoBreve: r.textoBreve })),
    [areaRepuestos],
  )

  // Filtrado (buscar + equipo + stock)
  const filteredRep = useMemo(() => {
    let res = areaRepuestos
    if (repStockFilter !== 'all') res = res.filter((r) => r.stockStatus === repStockFilter)
    if (repTipoFilter !== 'all') res = res.filter((r) => tipoLabelOf(r.tipo) === repTipoFilter)
    if (repEquipoFilter !== 'all') res = res.filter((r) => r.equipos.some((e) => e.machineName === repEquipoFilter))
    const q = normalizeForSearch(repQuery)
    if (q) {
      res = res.filter((r) =>
        normalizeForSearch(r.codigoSAP).includes(q) ||
        normalizeForSearch(r.textoBreve).includes(q) ||
        normalizeForSearch(r.codigoFabricante).includes(q) ||
        normalizeForSearch(r.alias ?? '').includes(q) ||
        r.equipos.some((e) => normalizeForSearch(e.machineName).includes(q)),
      )
    }
    return res
  }, [areaRepuestos, repStockFilter, repTipoFilter, repEquipoFilter, repQuery])

  // Reset de página al cambiar área/filtros
  useEffect(() => { setRepPage(0) }, [selectedAreaId, showingAll, repQuery, repEquipoFilter, repStockFilter, repTipoFilter, repPageSize])

  // Los tipos dependen del área → al cambiar de área el filtro de tipo vuelve a "Todos"
  useEffect(() => { setRepTipoFilter('all') }, [selectedAreaId, showingAll])

  const totalPages = Math.max(1, Math.ceil(filteredRep.length / repPageSize))
  const page = Math.min(repPage, totalPages - 1)
  const pagedRep = useMemo(
    () => filteredRep.slice(page * repPageSize, page * repPageSize + repPageSize),
    [filteredRep, page, repPageSize],
  )

  const selectedRep = useMemo(
    () => areaRepuestos.find((r) => r.codigoSAP === selectedRepSap) ?? null,
    [areaRepuestos, selectedRepSap],
  )

  // Guardar ubicación estructurada (preserva el resto del stock del item).
  // Firestore no admite `undefined` (sin ignoreUndefinedProperties) → se stripean.
  const handleSaveLocation = useCallback(
    async (sap: string, loc: { pasillo?: string; estante?: string; nivel?: string }) => {
      const it = bodegaItems.find((b) => b.codigoSAP === sap)
      const payload: Record<string, unknown> = {
        stockActual: it?.stockActual ?? 0,
        stockMinimo: it?.stockMinimo ?? 0,
        ubicacionBodega: it?.ubicacionBodega ?? '',
        unidad: it?.unidad ?? 'pzas',
        // strings vacíos (no undefined) → permiten limpiar el campo
        pasillo: loc.pasillo?.trim() ?? '',
        estante: loc.estante?.trim() ?? '',
        nivel: loc.nivel?.trim() ?? '',
      }
      // Preservar opcionales solo si están definidos (evita undefined en Firestore)
      if (it?.stockMaximo != null) payload.stockMaximo = it.stockMaximo
      if (it?.proveedor != null) payload.proveedor = it.proveedor
      if (it?.costoCompra != null) payload.costoCompra = it.costoCompra
      if (it?.leadTime != null) payload.leadTime = it.leadTime
      if (it?.categoria != null) payload.categoria = it.categoria
      if (it?.observaciones != null) payload.observaciones = it.observaciones
      await saveStock(sap, payload as unknown as Parameters<typeof saveStock>[1])
    },
    [bodegaItems, saveStock],
  )

  const repuestosBusy = !repuestosLoaded || repuestosLoading || bodegaLoading || pathsLoading || eqLoading

  const breadcrumb = useMemo(
    () => (selectedAreaId ? getNodePath(selectedAreaId).map((n) => n.nombre) : []),
    [selectedAreaId, getNodePath],
  )

  const eqCount = selectedNode
    ? (function c(n: AreaTreeNode): number { let t = n.equipmentCount; n.children.forEach((x) => { t += c(x) }); return t })(selectedNode)
    : 0

  // ── Handlers ──
  const handleSelectArea = useCallback((node: AreaTreeNode) => {
    setSelectedAreaId(node.id)
    setShowingAll(false)
    // Abrir ancestros para contexto
    setOpenNodes((prev) => {
      const next = { ...prev }
      getNodePath(node.id).slice(0, -1).forEach((n) => { next[n.id] = true })
      return next
    })
  }, [getNodePath])

  const handleToggleNode = useCallback((id: string) => {
    setOpenNodes((prev) => {
      const willOpen = !prev[id]
      if (willOpen) expandNode(id) // lazy-load hijos
      return { ...prev, [id]: willOpen }
    })
  }, [expandNode])

  const handleShowAll = useCallback(() => {
    setShowingAll(true)
    setSelectedAreaId(null)
  }, [])

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  )

  const title = showingAll ? 'Todas las áreas' : (selectedNode?.nombre ?? 'Selecciona un área')

  return (
    <div className="flex h-full bg-background">
      <AreaSidebar
        selectedAreaId={selectedAreaId}
        onSelectArea={handleSelectArea}
        assetCountByNode={assetCountByNode}
        openNodes={openNodes}
        onToggleNode={handleToggleNode}
        onShowAll={handleShowAll}
        showingAll={showingAll}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
      />

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header del módulo: búsqueda global + acciones (cableado en fases posteriores) */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <button
            onClick={() => setSidebarMobileOpen(true)}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
            aria-label="Abrir áreas"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={repQuery}
              onChange={(e) => {
                const v = e.target.value
                setRepQuery(v)
                // Búsqueda global: al teclear, mostrar todas las áreas para no ocultar coincidencias
                if (v.trim() && !showingAll) setShowingAll(true)
              }}
              placeholder="Buscar SAP, repuesto, equipo o fabricante…"
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSolicitudesOpen(true)}>
            <ClipboardList className="h-4 w-4" /> Solicitudes
            {pendientesCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 tabular-nums">{pendientesCount}</Badge>
            )}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openSolicitar(null)}>
            <Plus className="h-4 w-4" /> Solicitar repuesto
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Cabecera del área */}
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              {breadcrumb.length > 1 && (
                <div className="mb-0.5 truncate text-[11px] text-muted-foreground">
                  {breadcrumb.slice(0, -1).join(' › ')}
                </div>
              )}
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-bold text-foreground">{title}</h1>
                {selectedNode && !repQuery.trim() && (
                  <Badge variant="secondary" className="tabular-nums">{eqCount} equipos</Badge>
                )}
                {repQuery.trim() && (
                  <Badge variant="secondary" className="gap-1">
                    <Search className="h-3 w-3" /> «{repQuery.trim()}»
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant={showEquipos ? 'default' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setShowEquipos((s) => !s)}
            >
              <ListChecks className="h-4 w-4" /> Ver equipos del área
              {filteredAssets.length > 0 && <span className="tabular-nums opacity-70">({filteredAssets.length})</span>}
            </Button>
          </div>

          {/* KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard value={repuestosBusy ? '…' : stockKpis.total} label="Repuestos totales" accent="text-primary" bar="border-l-primary" />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.ok} label="Stock disponible" accent="text-emerald-500" hint={repuestosBusy ? undefined : `${stockKpis.pctOk}%`} bar="border-l-emerald-500" />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.low} label="Stock bajo" accent="text-amber-500" hint={repuestosBusy ? undefined : `${stockKpis.pctLow}%`} bar="border-l-amber-500" />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.out} label="Sin stock" accent="text-red-500" hint={repuestosBusy ? undefined : `${stockKpis.pctOut}%`} bar="border-l-red-500" />
          </div>

          {/* Motores/Bombas del área (toggle "Ver equipos del área") */}
          {showEquipos && (
          <section className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Cog className="h-4 w-4 text-cyan-500" />
              <h2 className="text-sm font-semibold text-foreground">Motores y bombas del área</h2>
              <span className="text-xs text-muted-foreground tabular-nums">({filteredAssets.length})</span>
            </div>

            {assetsLoading ? (
              <div className="rounded-lg border border-border py-8 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : filteredAssets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {repQuery.trim()
                  ? 'Ningún motor/bomba coincide con la búsqueda.'
                  : selectedAreaId ? 'Esta área no tiene motores/bombas registrados.' : 'Selecciona un área en la izquierda.'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40 text-left">
                    <tr>
                      <th className="w-14 px-3 py-2 text-center font-semibold">Foto</th>
                      <th className="px-3 py-2 font-semibold">Equipo</th>
                      <th className="px-3 py-2 font-semibold">Tipo</th>
                      <th className="px-3 py-2 font-semibold">Modelo</th>
                      <th className="px-3 py-2 font-semibold">SAP</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAssets.map((a) => {
                      const thumb = thumbOf(a)
                      return (
                        <tr
                          key={a.id}
                          onClick={() => { setSelectedAssetId(a.id); setSelectedRepSap(null) }}
                          className={[
                            'cursor-pointer transition-colors',
                            selectedAssetId === a.id ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/40',
                          ].join(' ')}
                        >
                          <td className="px-3 py-2">
                            {thumb ? (
                              <img src={thumb} alt={a.equipo} loading="lazy" className="mx-auto h-10 w-10 rounded-md border border-border object-cover" />
                            ) : (
                              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground/50">
                                <ImageOff className="h-4 w-4" />
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 font-medium text-foreground">{a.equipo || '-'}</td>
                          <td className="px-3 py-2">
                            <Badge variant={a.tipo === 'motor' ? 'default' : 'secondary'}>
                              {a.tipo === 'motor' ? 'Motor' : 'Bomba'}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-foreground">{a.modeloTipo || '-'}</td>
                          <td className="px-3 py-2 font-mono text-xs">{a.codigoSAP || <span className="text-muted-foreground">-</span>}</td>
                          <td className="px-3 py-2 text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          )}

          {/* Tabla de repuestos del área (catálogo + bodega) */}
          <section>
            {/* Filtros */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={repQuery}
                  onChange={(e) => setRepQuery(e.target.value)}
                  placeholder="Buscar en repuestos…"
                  className="pl-9"
                />
              </div>
              <Select value={repEquipoFilter} onValueChange={setRepEquipoFilter}>
                <SelectTrigger className="w-[190px]"><SelectValue placeholder="Todos los equipos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los equipos</SelectItem>
                  {equipoOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={repTipoFilter} onValueChange={setRepTipoFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {tipoOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.value} ({t.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={repStockFilter} onValueChange={(v) => setRepStockFilter(v as StockFilter)}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Stock: Todos</SelectItem>
                  <SelectItem value="ok">Disponible</SelectItem>
                  <SelectItem value="low">Bajo</SelectItem>
                  <SelectItem value="out">Sin stock</SelectItem>
                  <SelectItem value="unset">Sin config.</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {repuestosBusy ? (
              <div className="rounded-lg border border-border py-10 text-center text-sm text-muted-foreground">Cargando repuestos…</div>
            ) : filteredRep.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {!selectedAreaId && !showingAll
                  ? 'Selecciona un área en la izquierda.'
                  : areaRepuestos.length === 0
                    ? 'Esta área no tiene repuestos con código SAP.'
                    : 'Sin resultados para los filtros aplicados.'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/40 text-left">
                      <tr>
                        <th className="px-3 py-2 font-semibold">SAP</th>
                        <th className="px-3 py-2 font-semibold">Repuesto</th>
                        <th className="hidden px-3 py-2 font-semibold md:table-cell">Equipo</th>
                        <th className="px-3 py-2 font-semibold">Stock</th>
                        <th className="hidden px-3 py-2 font-semibold md:table-cell">Tipo</th>
                        <th className="w-8 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedRep.map((r) => {
                        const meta = STOCK_META[r.stockStatus]
                        const equipo = r.equipos[0]?.machineName ?? '-'
                        const extra = r.equipos.length > 1 ? ` +${r.equipos.length - 1}` : ''
                        const isSel = selectedRepSap === r.codigoSAP
                        return (
                          <tr
                            key={r.codigoSAP}
                            onClick={() => { setSelectedRepSap(r.codigoSAP); setSelectedAssetId(null) }}
                            className={[
                              'cursor-pointer transition-colors',
                              isSel ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/40',
                            ].join(' ')}
                          >
                            <td className="px-3 py-2 font-mono text-xs">{r.codigoSAP || '-'}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-foreground">{r.textoBreve || r.alias || '(sin nombre)'}</div>
                              {/* En móvil, equipo + tipo van como subtítulo (columnas ocultas) */}
                              <div className="mt-0.5 text-[10px] text-muted-foreground md:hidden">
                                {equipo}{extra} · {tipoLabelOf(r.tipo)}
                              </div>
                            </td>
                            <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{equipo}<span className="text-muted-foreground/60">{extra}</span></td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className={['h-2 w-2 rounded-full', meta.dot].join(' ')} />
                                <span className="tabular-nums font-medium">{r.stockStatus === 'unset' ? '—' : r.stockActual}</span>
                                <span className={['text-[10px]', meta.text].join(' ')}>{meta.label}</span>
                              </div>
                            </td>
                            <td className="hidden px-3 py-2 md:table-cell">
                              <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{tipoLabelOf(r.tipo)}</span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground/40"><ChevronRight className="h-4 w-4" /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Paginación */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    Mostrando {page * repPageSize + 1} a {Math.min((page + 1) * repPageSize, filteredRep.length)} de {filteredRep.length} repuestos
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRepPage((p) => Math.max(0, p - 1))}
                      disabled={page <= 0}
                      className="flex h-7 w-7 items-center justify-center rounded border border-border disabled:opacity-40 hover:bg-muted"
                      aria-label="Anterior"
                    ><ChevronLeft className="h-4 w-4" /></button>
                    <span className="tabular-nums">{page + 1} / {totalPages}</span>
                    <button
                      onClick={() => setRepPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="flex h-7 w-7 items-center justify-center rounded border border-border disabled:opacity-40 hover:bg-muted"
                      aria-label="Siguiente"
                    ><ChevronRight className="h-4 w-4" /></button>
                    <Select value={String(repPageSize)} onValueChange={(v) => setRepPageSize(Number(v))}>
                      <SelectTrigger className="h-7 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((s) => <SelectItem key={s} value={String(s)}>{s} por página</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Panel lateral de detalle del repuesto (columna fija, no modal) */}
      {selectedRep && (
        <RepuestoDetailPanel
          item={selectedRep}
          areaName={showingAll ? 'Todas las áreas' : (selectedNode?.nombre ?? '')}
          onClose={() => setSelectedRepSap(null)}
          loadMovimientos={loadMovimientos}
          onSaveLocation={handleSaveLocation}
          onSolicitar={(r) => openSolicitar({ codigoSAP: r.codigoSAP, textoBreve: r.textoBreve })}
        />
      )}

      {/* Panel lateral de detalle del motor/bomba (no modal; edición vía modal) */}
      {!selectedRep && selectedAsset && (
        <AssetDetailPanel
          asset={selectedAsset}
          areaName={showingAll ? 'Todas las áreas' : (selectedNode?.nombre ?? '')}
          onClose={() => setSelectedAssetId(null)}
          onEdit={() => setShowDetail(true)}
        />
      )}

      {/* Edición motor/bomba (modal editable existente, abierto desde el panel) */}
      <AssetDetailModal
        asset={selectedAsset}
        open={showDetail}
        onOpenChange={setShowDetail}
        onUpdate={updateAsset}
        onAddImage={addImagen}
        onDeleteImage={deleteImagen}
      />

      {/* Solicitar repuesto (Fase 6) */}
      <SolicitarRepuestoModal
        open={solicitarOpen}
        onOpenChange={setSolicitarOpen}
        repuesto={solicitarRepuesto}
        options={solicitarOptions}
        onSubmit={handleCrearSolicitud}
      />
      <SolicitudesPanel
        open={solicitudesOpen}
        onOpenChange={setSolicitudesOpen}
        solicitudes={solicitudes}
        loading={solicitudesLoading}
        onAvanzar={avanzarEstado}
      />
    </div>
  )
}
