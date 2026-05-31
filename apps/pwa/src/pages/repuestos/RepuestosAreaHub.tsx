/**
 * RepuestosAreaHub — Lente único área-first del módulo Repuestos (rediseño).
 *
 * Fase 1 (shell): sidebar de áreas + header de área + KPIs + lista de
 * motores/bombas del área (validando el vínculo hierarchy de Fase 0) + detalle.
 *
 * Pendiente por fase:
 *  - Fase 2: tabla de repuestos del área (catálogo + bodega) con stock/paginación.
 *  - Fase 3: panel de detalle lateral del repuesto.
 *  - Fase 5: selector "Bodega ▾" + columna Bodega.
 *  - Fase 6: "+ Solicitar repuesto".
 *  - Fase 7: búsqueda global del topbar + promover hub a vista por defecto.
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, ChevronRight, ChevronLeft, Cog, ImageOff, Plus, Warehouse, ListChecks } from 'lucide-react'
import { Badge, Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui'
import { AreaSidebar } from '@/components/repuestos/AreaSidebar'
import { AssetDetailModal } from '@/components/repuestos/AssetDetailModal'
import { RepuestoDetailPanel } from '@/components/repuestos/RepuestoDetailPanel'
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

const STOCK_META: Record<StockStatus, { label: string; dot: string; text: string }> = {
  ok: { label: 'Disponible', dot: 'bg-emerald-500', text: 'text-emerald-500' },
  low: { label: 'Bajo', dot: 'bg-amber-500', text: 'text-amber-500' },
  out: { label: 'Sin stock', dot: 'bg-red-500', text: 'text-red-500' },
  unset: { label: 'Sin config', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
}

function KpiCard({ value, label, accent, hint }: { value: string | number; label: string; accent: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
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
  const { items: bodegaItems, loading: bodegaLoading, loadMovimientos } = useBodega(allRepuestos)

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
  const [repPage, setRepPage] = useState(0)
  const [repPageSize, setRepPageSize] = useState(25)

  // Repuesto seleccionado → panel lateral de detalle
  const [selectedRepSap, setSelectedRepSap] = useState<string | null>(null)

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

  // Filtrado (buscar + equipo + stock)
  const filteredRep = useMemo(() => {
    let res = areaRepuestos
    if (repStockFilter !== 'all') res = res.filter((r) => r.stockStatus === repStockFilter)
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
  }, [areaRepuestos, repStockFilter, repEquipoFilter, repQuery])

  // Reset de página al cambiar área/filtros
  useEffect(() => { setRepPage(0) }, [selectedAreaId, showingAll, repQuery, repEquipoFilter, repStockFilter, repPageSize])

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
      />

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header del módulo: búsqueda global + acciones (cableado en fases posteriores) */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input disabled placeholder="Buscar SAP, repuesto, equipo o fabricante… (Fase 7)" className="pl-9" />
          </div>
          <Button variant="outline" size="sm" disabled className="gap-1.5">
            <Warehouse className="h-4 w-4" /> Bodega
            <ChevronRight className="h-3 w-3 rotate-90 opacity-60" />
          </Button>
          <Button size="sm" disabled className="gap-1.5">
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
                {selectedNode && (
                  <Badge variant="secondary" className="tabular-nums">{eqCount} equipos</Badge>
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
              {areaAssets.length > 0 && <span className="tabular-nums opacity-70">({areaAssets.length})</span>}
            </Button>
          </div>

          {/* KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard value={repuestosBusy ? '…' : stockKpis.total} label="Repuestos totales" accent="text-primary" />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.ok} label="Stock disponible" accent="text-emerald-500" hint={repuestosBusy ? undefined : `${stockKpis.pctOk}%`} />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.low} label="Stock bajo" accent="text-amber-500" hint={repuestosBusy ? undefined : `${stockKpis.pctLow}%`} />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.out} label="Sin stock" accent="text-red-500" hint={repuestosBusy ? undefined : `${stockKpis.pctOut}%`} />
          </div>

          {/* Motores/Bombas del área (toggle "Ver equipos del área") */}
          {showEquipos && (
          <section className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Cog className="h-4 w-4 text-cyan-500" />
              <h2 className="text-sm font-semibold text-foreground">Motores y bombas del área</h2>
              <span className="text-xs text-muted-foreground tabular-nums">({areaAssets.length})</span>
            </div>

            {assetsLoading ? (
              <div className="rounded-lg border border-border py-8 text-center text-sm text-muted-foreground">Cargando…</div>
            ) : areaAssets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {selectedAreaId ? 'Esta área no tiene motores/bombas registrados.' : 'Selecciona un área en la izquierda.'}
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
                    {areaAssets.map((a) => {
                      const thumb = thumbOf(a)
                      return (
                        <tr
                          key={a.id}
                          onClick={() => { setSelectedAssetId(a.id); setShowDetail(true) }}
                          className="cursor-pointer transition-colors hover:bg-muted/40"
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
                        <th className="px-3 py-2 font-semibold">Equipo</th>
                        <th className="px-3 py-2 font-semibold">Stock</th>
                        <th className="px-3 py-2 font-semibold">Bodega</th>
                        <th className="w-8 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedRep.map((r) => {
                        const meta = STOCK_META[r.stockStatus]
                        const equipo = r.equipos[0]?.machineName ?? '-'
                        const extra = r.equipos.length > 1 ? ` +${r.equipos.length - 1}` : ''
                        const bodega = r.ubicacionBodega || (r.bodegaId ? 'Bodega Principal' : '—')
                        const isSel = selectedRepSap === r.codigoSAP
                        return (
                          <tr
                            key={r.codigoSAP}
                            onClick={() => setSelectedRepSap(r.codigoSAP)}
                            className={[
                              'cursor-pointer transition-colors',
                              isSel ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/40',
                            ].join(' ')}
                          >
                            <td className="px-3 py-2 font-mono text-xs">{r.codigoSAP || '-'}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-foreground">{r.textoBreve || r.alias || '(sin nombre)'}</div>
                              {r.tipo && <div className="text-[10px] text-muted-foreground">{r.tipo}</div>}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{equipo}<span className="text-muted-foreground/60">{extra}</span></td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <span className={['h-2 w-2 rounded-full', meta.dot].join(' ')} />
                                <span className="tabular-nums font-medium">{r.stockStatus === 'unset' ? '—' : r.stockActual}</span>
                                <span className={['text-[10px]', meta.text].join(' ')}>{meta.label}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{bodega}</td>
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
        />
      )}

      {/* Detalle motor/bomba (modal editable existente) */}
      <AssetDetailModal
        asset={selectedAsset}
        open={showDetail}
        onOpenChange={setShowDetail}
        onUpdate={updateAsset}
        onAddImage={addImagen}
        onDeleteImage={deleteImagen}
      />
    </div>
  )
}
