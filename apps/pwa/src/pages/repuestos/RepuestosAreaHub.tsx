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
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Search, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Cog, ImageOff, Plus, ClipboardList, Menu, GitMerge, History, Trash2, Star, Upload, Download, ArrowUpDown, Eye, EyeOff, Package, X, Loader2, Wrench, Settings2, Archive, ArrowRightLeft, MoreVertical } from 'lucide-react'
import { Badge, Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui'
import { AreaSidebar } from '@/components/repuestos/AreaSidebar'
import { AssetDetailModal } from '@/components/repuestos/AssetDetailModal'
import { RepuestoDetailPanel } from '@/components/repuestos/RepuestoDetailPanel'
import { AssetDetailPanel } from '@/components/repuestos/AssetDetailPanel'
import { SolicitarRepuestoModal, type RepuestoLite } from '@/components/repuestos/SolicitarRepuestoModal'
import { SolicitudesPanel } from '@/components/repuestos/SolicitudesPanel'
import { useSolicitudes } from '@/hooks/repuestos/useSolicitudes'
import { useAuthStore, useIsAdmin } from '@/store/authStore'
import { DuplicatesModal } from '@/components/repuestos/DuplicatesModal'
import { AuditLogPanel } from '@/components/repuestos/AuditLogPanel'
import { TrashPanel } from '@/components/repuestos/TrashPanel'
import { getTrashCount, moveToTrash } from '@/services/auditLog'
import { usePlantAssets } from '@/hooks/repuestos/usePlantAssets'
import { useHierarchyAreaTree, type AreaTreeNode } from '@/hooks/useHierarchyAreaTree'
import { useGlobalSearch, invalidateGlobalRepuestosCache, type GlobalSearchResult } from '@/hooks/repuestos/useGlobalSearch'
import { useGlobalEquipmentSearch, getGlobalEquipmentCache } from '@/hooks/useGlobalEquipmentSearch'
import { useBodega } from '@/hooks/repuestos/useBodega'
import { useAreaRepuestos, type StockStatus, type AreaRepuestoRow } from '@/hooks/repuestos/useAreaRepuestos'
import { useHierarchyPaths } from '@/hooks/repuestos/useHierarchyPaths'
import { getRepuestoFavs, saveRepuestoFavs, getRepuestoFavListsGlobal, saveRepuestoFavListsGlobal, getUserPreferences, saveFavoriteLists, type RepuestoFavList, type FavList } from '@/services/userPreferences'
import { useRepuestoCrud } from '@/hooks/repuestos/useRepuestoCrud'
import { useRepuestos } from '@/hooks/repuestos/useRepuestos'
import { useToast } from '@/hooks/useToast'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { TechnicalSpecsModal } from '@/components/repuestos/TechnicalSpecsModal'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoGalleryModal } from '@/components/repuestos/RepuestoGalleryModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { ManualSearchModal } from '@/components/repuestos/ManualSearchModal'
import { RelocateRepuestoModal } from '@/components/repuestos/RelocateRepuestoModal'
import { BulkRelocateModal } from '@/components/repuestos/BulkRelocateModal'
import { ImportRepuestosModal } from './ImportRepuestosModal'
import { ExportReportModal } from '@/components/repuestos/ExportReportModal'
import { normalizeForSearch } from '@/utils/repuestos'
import { Timestamp, addDoc, collection, doc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { logger } from '@/lib/logger'
import { getHmiTooltipPwd } from '@/services/hmiKnuro'
import { useEquipmentForArea, invalidateEquipmentCache } from '@/hooks/useEquipmentForArea'
import { EquipmentCard } from '@/components/repuestos/EquipmentCard'
import { MachineManager } from '@/components/repuestos/MachineManager'
import { EquipmentHeaderPhoto } from '@/components/repuestos/EquipmentHeaderPhoto'
import { MachineManualPanel } from '@/components/repuestos/MachineManualPanel'
import { InlineEditName } from '@/components/repuestos/InlineEditName'
import { useMachines } from '@/hooks/repuestos/useMachines'
import type { PlantAsset, Machine, RepuestoFormData, TechnicalSpecs, MachineImage } from '@/types/repuestos'

type RepAction = 'edit' | 'specs' | 'photos' | 'gallery' | 'manual' | 'manualSearch' | 'relocate' | 'delete'
type SortCol = 'codigoSAP' | 'textoBreve' | 'equipo' | 'stock' | 'tipo'

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
    <div className={['rounded-xl border border-l-4 border-border bg-card px-3 py-2.5 sm:px-4 sm:py-3', bar].filter(Boolean).join(' ')}>
      <div className={['text-xl font-bold tabular-nums sm:text-2xl', accent].join(' ')}>{value}</div>
      <div className="text-[11px] text-muted-foreground sm:text-xs">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted-foreground/60">{hint}</div>}
    </div>
  )
}

interface RepuestosAreaHubProps {
  /** Query inicial (al saltar desde "Buscar similar" de otras vistas). */
  initialQuery?: string
  onQueryConsumed?: () => void
}

export function RepuestosAreaHub({ initialQuery, onQueryConsumed }: RepuestosAreaHubProps = {}) {
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

  // Nombre amigable por machineId/equipId (para los chips de favoritos de equipos):
  // alias o nombre del equipo desde el cache, igual que EquipmentNavigator.
  const equipNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of (getGlobalEquipmentCache() || [])) {
      const label = e.alias || e.nombre || e.id
      m.set(e.id, label)
      if (e.linkedMachineId) m.set(e.linkedMachineId, label)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqLoading])

  const { allRepuestos, loadAll, loaded: repuestosLoaded, loading: repuestosLoading } = useGlobalSearch(machines)
  useEffect(() => { if (machines.length) loadAll() }, [machines, loadAll])
  // allItems = TODOS los repuestos del área (con y sin SAP); el stock se engancha si hay SAP.
  const { allItems: bodegaItems, loading: bodegaLoading, loadMovimientos, saveStock } = useBodega(allRepuestos)

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
  // Equipo seleccionado desde el sidebar / chips de favoritos (clave = linkedMachineId || nodeId) para resaltarlo.
  const [selectedEquipKey, setSelectedEquipKey] = useState<string | null>(null)

  // Filtros + paginación de la tabla de repuestos
  const [repQuery, setRepQuery] = useState('')
  const [repEquipoFilter, setRepEquipoFilter] = useState<string>('all')
  const [repStockFilter, setRepStockFilter] = useState<StockFilter>('all')
  const [repTipoFilter, setRepTipoFilter] = useState<string>('all')
  const [repPage, setRepPage] = useState(0)
  const [repPageSize, setRepPageSize] = useState(25)

  // Repuesto seleccionado → panel lateral de detalle
  // Selección por rowKey estable (NO codigoSAP: vacío en repuestos sin SAP → colisiona).
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)

  // ── Solicitudes de repuesto (Fase 6) ──
  const user = useAuthStore((s) => s.user)
  const { solicitudes, loading: solicitudesLoading, pendientesCount, crearSolicitud, avanzarEstado } = useSolicitudes()
  const [solicitarOpen, setSolicitarOpen] = useState(false)
  const [solicitarRepuesto, setSolicitarRepuesto] = useState<RepuestoLite | null>(null)
  const [solicitudesOpen, setSolicitudesOpen] = useState(false)

  // Drawer del sidebar de áreas en móvil
  const [sidebarMobileOpen, setSidebarMobileOpen] = useState(false)

  // Contraer el sidebar de áreas en desktop (persistido), como el sidebar general de la app
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('repuestos-area-sidebar-collapsed') === '1' } catch { return false }
  })
  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem('repuestos-area-sidebar-collapsed', next ? '1' : '0') } catch { /* noop */ }
      return next
    })
  }, [])

  // ── Herramientas admin (gestión de catálogo) ──
  const isAdmin = useIsAdmin()
  const [duplicatesOpen, setDuplicatesOpen] = useState(false)
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashCount, setTrashCount] = useState(0)
  const [machineManagerOpen, setMachineManagerOpen] = useState(false) // G4: CRUD máquinas manuales
  const [adminMenuOpen, setAdminMenuOpen] = useState(false) // overflow herramientas admin (móvil)
  const [photoEquip, setPhotoEquip] = useState<{ id: string; name: string } | null>(null) // G1: fotos por equipo

  // ── Acciones por repuesto (Wave 1: rescate de "Por equipo") ──
  const { toast } = useToast()
  const { createRepuesto: crudCreate, updateRepuesto: crudUpdate, deleteRepuesto: crudDelete } = useRepuestoCrud()
  const [actionTarget, setActionTarget] = useState<{ kind: RepAction; source: GlobalSearchResult } | null>(null)
  const [equipoPicker, setEquipoPicker] = useState<{ kind: RepAction; sources: GlobalSearchResult[] } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createTargetMachine, setCreateTargetMachine] = useState<Machine | null>(null)
  const [createPicker, setCreatePicker] = useState(false)
  const [savingRep, setSavingRep] = useState(false)
  // Reubicación: useRepuestos se liga a la máquina ORIGEN del repuesto elegido.
  const relocateMachineId = actionTarget?.kind === 'relocate' ? actionTarget.source.machineId : null
  const { relocateRepuesto } = useRepuestos(relocateMachineId)

  // ── Importar / Exportar (Wave 3) ──
  const [importPicker, setImportPicker] = useState(false)
  const [importTargetMachine, setImportTargetMachine] = useState<Machine | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  // importCatalogoDesdeExcel se liga a la máquina destino elegida del área.
  const { importCatalogoDesdeExcel } = useRepuestos(importTargetMachine?.id ?? null)

  // ── Reubicación masiva (G3, Wave 2) ──
  const [bulkPicker, setBulkPicker] = useState(false)
  const [bulkSourceMachine, setBulkSourceMachine] = useState<Machine | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  // repuestos + bulkRelocateRepuestos se ligan a la máquina ORIGEN elegida.
  const { repuestos: bulkSourceRepuestos, bulkRelocateRepuestos } = useRepuestos(bulkSourceMachine?.id ?? null)

  // ── Favoritos de repuestos (globales por usuario, keyed por rowKey) ──
  const [favKeys, setFavKeys] = useState<Set<string>>(new Set())
  const [repFavOnly, setRepFavOnly] = useState(false)
  useEffect(() => {
    if (!user?.id) return
    getRepuestoFavs(user.id).then((arr) => setFavKeys(new Set(arr))).catch(() => {})
  }, [user?.id])
  const toggleFav = useCallback((rowKey: string) => {
    const uid = user?.id
    if (!uid) return
    setFavKeys((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      saveRepuestoFavs(uid, [...next])
      return next
    })
  }, [user?.id])

  // ── Listas de favoritos con nombre (globales por usuario, keyed por rowKey) ──
  const [favLists, setFavLists] = useState<RepuestoFavList[]>([])
  const [listFilter, setListFilter] = useState<string>('all')
  const [addToListRowKey, setAddToListRowKey] = useState<string | null>(null) // repuesto objetivo del modal
  const [newListName, setNewListName] = useState('')
  useEffect(() => {
    if (!user?.id) return
    getRepuestoFavListsGlobal(user.id).then(setFavLists).catch(() => {})
  }, [user?.id])
  const persistLists = useCallback((lists: RepuestoFavList[]) => {
    setFavLists(lists)
    if (user?.id) saveRepuestoFavListsGlobal(user.id, lists)
  }, [user?.id])
  const toggleInList = useCallback((listName: string, rowKey: string) => {
    persistLists(favLists.map((l) => {
      if (l.name !== listName) return l
      const has = l.repuestoIds.includes(rowKey)
      return { ...l, repuestoIds: has ? l.repuestoIds.filter((id) => id !== rowKey) : [...l.repuestoIds, rowKey] }
    }))
  }, [favLists, persistLists])
  const createListWith = useCallback((name: string, rowKey: string) => {
    const clean = name.trim()
    if (!clean || favLists.some((l) => l.name === clean)) return
    persistLists([...favLists, { name: clean, repuestoIds: [rowKey] }])
  }, [favLists, persistLists])
  const deleteList = useCallback((name: string) => {
    persistLists(favLists.filter((l) => l.name !== name))
    setListFilter((f) => (f === name ? 'all' : f))
  }, [favLists, persistLists])

  // ── Favoritos de EQUIPOS (listas con nombre del legacy "Por equipo") ──
  // Solo lectura en el hub: viven en user_preferences/{uid}.favoriteLists (machineIds).
  const [equipFavLists, setEquipFavLists] = useState<FavList[]>([])
  const [favBarClosed, setFavBarClosed] = useState<Record<string, boolean>>({})
  const [favBarOpen, setFavBarOpen] = useState(false) // barra de favoritos colapsada por defecto (UX)
  useEffect(() => {
    if (!user?.id) return
    getUserPreferences(user.id).then((p) => setEquipFavLists(p.favoriteLists || [])).catch(() => {})
  }, [user?.id])

  // ── Gestión de favoritos de EQUIPOS (G2, Wave 2) ──
  // El hub ahora puede crear/editar listas (antes solo lectura). Persisten en
  // user_preferences/{uid}.favoriteLists (machineIds + machineNames).
  const persistEquipLists = useCallback((lists: FavList[]) => {
    setEquipFavLists(lists)
    if (user?.id) saveFavoriteLists(user.id, lists)
  }, [user?.id])
  const isEquipFav = useCallback((id: string) => equipFavLists.some((l) => l.machineIds.includes(id)), [equipFavLists])
  // Set plano de claves favoritas de equipos (machineIds de todas las listas) para el sidebar.
  const equipFavKeys = useMemo(() => new Set(equipFavLists.flatMap((l) => l.machineIds)), [equipFavLists])
  const [favEquipPicker, setFavEquipPicker] = useState<{ machineId: string; displayName: string } | null>(null)
  const [newEquipListName, setNewEquipListName] = useState('')
  // Estrella: si ya está en alguna lista → quitar de todas; si no → abrir selector.
  const handleEquipStar = useCallback((machineId: string, _e: unknown, displayName?: string) => {
    if (isEquipFav(machineId)) {
      persistEquipLists(equipFavLists.map((l) => ({ ...l, machineIds: l.machineIds.filter((id) => id !== machineId) })).filter((l) => l.machineIds.length > 0))
    } else {
      setFavEquipPicker({ machineId, displayName: displayName || machineId })
      setNewEquipListName('')
    }
  }, [equipFavLists, isEquipFav, persistEquipLists])
  const addEquipToList = useCallback((listName: string, machineId: string, displayName: string) => {
    const clean = listName.trim()
    if (!clean) return
    const existing = equipFavLists.find((l) => l.name === clean)
    let next: FavList[]
    if (existing) {
      if (existing.machineIds.includes(machineId)) { setFavEquipPicker(null); return }
      next = equipFavLists.map((l) => l.name === clean ? { ...l, machineIds: [...l.machineIds, machineId], machineNames: { ...l.machineNames, [machineId]: displayName } } : l)
    } else {
      next = [...equipFavLists, { name: clean, machineIds: [machineId], machineNames: { [machineId]: displayName } }]
    }
    persistEquipLists(next)
    setFavEquipPicker(null)
    setNewEquipListName('')
  }, [equipFavLists, persistEquipLists])
  const renameEquipList = useCallback((oldName: string, newName: string) => {
    const clean = newName.trim()
    if (!clean || (clean !== oldName && equipFavLists.some((l) => l.name === clean))) return
    persistEquipLists(equipFavLists.map((l) => l.name === oldName ? { ...l, name: clean } : l))
  }, [equipFavLists, persistEquipLists])
  const deleteEquipList = useCallback((name: string) => {
    if (!confirm(`¿Eliminar la lista "${name}"?`)) return
    persistEquipLists(equipFavLists.filter((l) => l.name !== name))
  }, [equipFavLists, persistEquipLists])
  const removeEquipFromList = useCallback((listName: string, machineId: string) => {
    persistEquipLists(equipFavLists.map((l) => l.name === listName ? { ...l, machineIds: l.machineIds.filter((id) => id !== machineId) } : l).filter((l) => l.machineIds.length > 0))
  }, [equipFavLists, persistEquipLists])
  const moveEquipInList = useCallback((listName: string, idx: number, dir: 'up' | 'down') => {
    const swap = dir === 'up' ? idx - 1 : idx + 1
    persistEquipLists(equipFavLists.map((l) => {
      if (l.name !== listName) return l
      if (swap < 0 || swap >= l.machineIds.length) return l
      const ids = [...l.machineIds]
      const tmp = ids[idx]!; ids[idx] = ids[swap]!; ids[swap] = tmp
      return { ...l, machineIds: ids }
    }))
  }, [equipFavLists, persistEquipLists])

  // Áreas favoritas (estrella en el árbol) — compartido con "Por equipo" (localStorage).
  const [favoriteAreaIds, setFavoriteAreaIds] = useState<Set<string>>(() => {
    try { const s = localStorage.getItem('hierarchy-favorites'); return s ? new Set(JSON.parse(s) as string[]) : new Set<string>() } catch { return new Set<string>() }
  })
  const [areaFavOnly, setAreaFavOnly] = useState(false)
  const toggleAreaFav = useCallback((id: string) => {
    setFavoriteAreaIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem('hierarchy-favorites', JSON.stringify([...next])) } catch { /* noop */ }
      return next
    })
  }, [])

  // Al activar "solo favoritos", auto-expandir (una vez) las áreas con favoritos
  // —áreas favoritas o con equipos favoritos— recorriendo el árbol ya cargado.
  // El ref evita re-expandir si el técnico colapsa algo manualmente luego.
  const favExpandedRef = useRef(false)
  useEffect(() => {
    if (!areaFavOnly) { favExpandedRef.current = false; return }
    if (favExpandedRef.current) return
    const toOpen: Record<string, boolean> = {}
    const walk = (nodes: AreaTreeNode[]) => {
      for (const n of nodes) {
        const hasFavEquip = n.equipment.some((e) => !e.oculto && equipFavKeys.has(e.linkedMachineId || e.id))
        if (hasFavEquip || favoriteAreaIds.has(n.id)) {
          getNodePath(n.id).forEach((p) => { toOpen[p.id] = true })
        }
        if (n.children.length > 0) walk(n.children)
      }
    }
    walk(areaTree)
    if (Object.keys(toOpen).length > 0) {
      setOpenNodes((prev) => ({ ...prev, ...toOpen }))
      favExpandedRef.current = true
    }
  }, [areaFavOnly, favoriteAreaIds, equipFavKeys, getNodePath, areaTree])

  // Clic en chip de equipo → ir a su área + filtrar la tabla a ese equipo + revelar equipos.
  const handleFavEquipClick = useCallback((favKey: string) => {
    const eq = getGlobalEquipmentCache() || []
    const e = eq.find((x) => (x.linkedMachineId || x.id) === favKey) || eq.find((x) => x.id === favKey)
    const areaId = e?.parentId || (e?.path && e.path.length ? e.path[e.path.length - 1] : null)
    if (areaId) {
      setSelectedAreaId(areaId)
      setShowingAll(false)
      setOpenNodes((prev) => {
        const next = { ...prev }
        getNodePath(areaId).forEach((n) => { next[n.id] = true })
        return next
      })
    } else {
      setShowingAll(true)
      setSelectedAreaId(null)
    }
    const m = machines.find((x) => x.id === favKey || (!!e?.linkedMachineId && x.id === e.linkedMachineId))
    setRepEquipoFilter(m ? m.nombre : 'all')
    // Clave = id del NODO del equipo (para resaltarlo en el sidebar y reducir los M/B a ese equipo).
    setSelectedEquipKey(e?.id ?? favKey)
    setSelectedRowKey(null)
    setSelectedAssetId(null)
    setSidebarMobileOpen(false)
  }, [machines, getNodePath])
  useEffect(() => {
    if (isAdmin) getTrashCount().then(setTrashCount).catch(() => {})
  }, [isAdmin, trashOpen])

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

  // Conteo de repuestos por nodeId (badge "N rep" del sidebar). Una pasada sobre
  // los items: cada repuesto cuenta en todas las áreas ancestras de sus equipos
  // (misma lógica que machineInArea → coincide con areaRepuestos.length del área).
  const repCountByNode = useMemo(() => {
    const out: Record<string, number> = {}
    for (const it of bodegaItems) {
      const nodes = new Set<string>()
      for (const eq of it.equipos) {
        const set = machineAreas.get(eq.machineId)
        if (set) for (const a of set) nodes.add(a)
      }
      for (const n of nodes) out[n] = (out[n] ?? 0) + 1
    }
    return out
  }, [bodegaItems, machineAreas])

  const selectedNode = useMemo(
    () => (selectedAreaId ? findNode(selectedAreaId) : null),
    [selectedAreaId, findNode],
  )

  // Motores/bombas del alcance: si hay un equipo seleccionado, solo los de ese equipo
  // (por ancestría del nodo); si no, los del área seleccionada.
  const areaAssets = useMemo(() => {
    if (showingAll) return linkedAssets
    if (selectedEquipKey) return linkedAssets.filter((a) => isUnder(a.hierarchyNodeId, selectedEquipKey))
    if (!selectedAreaId) return []
    return linkedAssets.filter((a) => isUnder(a.hierarchyNodeId, selectedAreaId))
  }, [linkedAssets, showingAll, selectedEquipKey, selectedAreaId, isUnder])

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

  // "Buscar similar" desde otras vistas → cargar query en la búsqueda global del hub
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setRepQuery(initialQuery)
      setShowingAll(true)
      onQueryConsumed?.()
    }
  }, [initialQuery, onQueryConsumed])

  // Repuestos del área (catálogo + bodega) y KPIs de stock derivados
  const areaRepuestos = useAreaRepuestos(bodegaItems, { showingAll, selectedAreaId, machineInArea })

  // Repuestos en el alcance actual: si hay un equipo seleccionado (filtro de equipo
  // activo), todo el panel (KPIs, cobertura, tipos, tabla) se reduce a ese equipo.
  const scopedRepuestos = useMemo(
    () => (repEquipoFilter === 'all'
      ? areaRepuestos
      : areaRepuestos.filter((r) => r.equipos.some((e) => e.machineName === repEquipoFilter))),
    [areaRepuestos, repEquipoFilter],
  )

  const stockKpis = useMemo(() => {
    let ok = 0, low = 0, out = 0
    for (const r of scopedRepuestos) {
      if (r.stockStatus === 'ok') ok++
      else if (r.stockStatus === 'low') low++
      else if (r.stockStatus === 'out') out++
    }
    const total = scopedRepuestos.length // todos los repuestos del alcance (con y sin SAP)
    const configurados = ok + low + out // solo los que tienen stock configurado (SAP en bodega)
    // Los % de stock son relativos a los configurados, no al total (que incluye sin-SAP)
    const pct = (n: number) => (configurados > 0 ? Math.round((n / configurados) * 100) : 0)
    return { total, configurados, ok, low, out, pctOk: pct(ok), pctLow: pct(low), pctOut: pct(out) }
  }, [scopedRepuestos])

  // KPIs de catálogo (cobertura): con/sin SAP, tipos distintos, valor referencial
  const catalogStats = useMemo(() => {
    let conSAP = 0
    let valor = 0
    const tipos = new Set<string>()
    for (const r of scopedRepuestos) {
      if (r.codigoSAP) conSAP++
      tipos.add(tipoLabelOf(r.tipo))
      valor += (r.costoCompra ?? r.valorUnitario ?? 0) * (r.stockActual || 0)
    }
    const total = scopedRepuestos.length
    return {
      conSAP,
      sinSAP: total - conSAP,
      pctSAP: total > 0 ? Math.round((conSAP / total) * 100) : 0,
      tipos: tipos.size,
      valor,
    }
  }, [scopedRepuestos])

  // Opciones del filtro "Equipo" (nombres distintos del área)
  const equipoOptions = useMemo(() => {
    const s = new Set<string>()
    for (const r of areaRepuestos) { const n = r.equipos[0]?.machineName; if (n) s.add(n) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [areaRepuestos])

  // Opciones del filtro "Tipo" presentes en el alcance, ordenadas por frecuencia (con conteo)
  const tipoOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of scopedRepuestos) {
      const t = tipoLabelOf(r.tipo)
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
  }, [scopedRepuestos])

  // Opciones para el selector del modal de solicitud (repuestos del área con SAP)
  const solicitarOptions = useMemo<RepuestoLite[]>(
    () => areaRepuestos.map((r) => ({ codigoSAP: r.codigoSAP, textoBreve: r.textoBreve })),
    [areaRepuestos],
  )

  // Filtrado (buscar + stock + tipo + fav) sobre el alcance ya reducido por equipo.
  const filteredRep = useMemo(() => {
    let res = scopedRepuestos
    if (repFavOnly) res = res.filter((r) => favKeys.has(r.rowKey))
    if (listFilter !== 'all') {
      const l = favLists.find((x) => x.name === listFilter)
      const ids = new Set(l?.repuestoIds ?? [])
      res = res.filter((r) => ids.has(r.rowKey))
    }
    if (repStockFilter !== 'all') res = res.filter((r) => r.stockStatus === repStockFilter)
    if (repTipoFilter !== 'all') res = res.filter((r) => tipoLabelOf(r.tipo) === repTipoFilter)
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
  }, [scopedRepuestos, repFavOnly, favKeys, listFilter, favLists, repStockFilter, repTipoFilter, repQuery])

  // Reset de página al cambiar área/filtros
  useEffect(() => { setRepPage(0) }, [selectedAreaId, showingAll, repQuery, repEquipoFilter, repStockFilter, repTipoFilter, repFavOnly, listFilter, repPageSize])

  // Los tipos dependen del área → al cambiar de área el filtro de tipo vuelve a "Todos"
  useEffect(() => { setRepTipoFilter('all') }, [selectedAreaId, showingAll])

  // Ordenamiento de columnas (3-clics: asc → desc → off), como "Por equipo".
  const [repSortColumn, setRepSortColumn] = useState<SortCol | null>(null)
  const [repSortDir, setRepSortDir] = useState<'asc' | 'desc'>('asc')
  const toggleSort = useCallback((col: SortCol) => {
    if (repSortColumn === col) {
      if (repSortDir === 'asc') setRepSortDir('desc')
      else { setRepSortColumn(null); setRepSortDir('asc') }
    } else {
      setRepSortColumn(col); setRepSortDir('asc')
    }
  }, [repSortColumn, repSortDir])

  // Encabezado ordenable (función, no componente anidado, para no romper lint).
  const renderSortTh = (col: SortCol, label: string, className?: string) => (
    <th
      key={col}
      className={['cursor-pointer select-none px-3 py-2 font-semibold transition-colors hover:text-foreground', className].filter(Boolean).join(' ')}
      onClick={() => toggleSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {repSortColumn === col
          ? (repSortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5 text-primary" /> : <ChevronDown className="h-3.5 w-3.5 text-primary" />)
          : <ChevronDown className="h-3.5 w-3.5 opacity-20" />}
      </span>
    </th>
  )

  const sortedRep = useMemo(() => {
    if (!repSortColumn) return filteredRep
    const dir = repSortDir === 'asc' ? 1 : -1
    const val = (r: AreaRepuestoRow): string | number => {
      switch (repSortColumn) {
        case 'codigoSAP': return r.codigoSAP || ''
        case 'textoBreve': return r.textoBreve || r.alias || ''
        case 'equipo': return r.equipos[0]?.machineName || ''
        case 'stock': return r.bodegaId ? r.stockActual : -1
        case 'tipo': return tipoLabelOf(r.tipo)
      }
    }
    return [...filteredRep].sort((a, b) => {
      const va = val(a), vb = val(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'es') * dir
    })
  }, [filteredRep, repSortColumn, repSortDir])

  const totalPages = Math.max(1, Math.ceil(sortedRep.length / repPageSize))
  const page = Math.min(repPage, totalPages - 1)
  const pagedRep = useMemo(
    () => sortedRep.slice(page * repPageSize, page * repPageSize + repPageSize),
    [sortedRep, page, repPageSize],
  )

  // Recordar preferencias del hub por usuario (área-independientes): tamaño de
  // página, filtro de stock, solo-favoritos y ordenamiento.
  const prefsKey = useMemo(() => `repuestos-hub-prefs:${user?.id ?? 'anon'}`, [user?.id])
  const prefsHydrated = useRef(false)
  useEffect(() => {
    prefsHydrated.current = false
    try {
      const raw = localStorage.getItem(prefsKey)
      if (raw) {
        const p = JSON.parse(raw) as { pageSize?: number; stockFilter?: string; favOnly?: boolean; sortColumn?: SortCol | null; sortDir?: 'asc' | 'desc' }
        if (typeof p.pageSize === 'number' && PAGE_SIZES.includes(p.pageSize)) setRepPageSize(p.pageSize)
        if (p.stockFilter) setRepStockFilter(p.stockFilter as StockFilter)
        if (typeof p.favOnly === 'boolean') setRepFavOnly(p.favOnly)
        if (p.sortColumn !== undefined) setRepSortColumn(p.sortColumn)
        if (p.sortDir === 'asc' || p.sortDir === 'desc') setRepSortDir(p.sortDir)
      }
    } catch { /* noop */ }
    prefsHydrated.current = true
  }, [prefsKey])
  useEffect(() => {
    if (!prefsHydrated.current) return
    try {
      localStorage.setItem(prefsKey, JSON.stringify({
        pageSize: repPageSize, stockFilter: repStockFilter, favOnly: repFavOnly, sortColumn: repSortColumn, sortDir: repSortDir,
      }))
    } catch { /* noop */ }
  }, [prefsKey, repPageSize, repStockFilter, repFavOnly, repSortColumn, repSortDir])

  const selectedRep = useMemo(
    () => areaRepuestos.find((r) => r.rowKey === selectedRowKey) ?? null,
    [areaRepuestos, selectedRowKey],
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

  // ══════════════════════════════════════════════════════════════════
  //  Acciones por repuesto (Wave 1) — resolver el doc subyacente desde
  //  la fila AGREGADA. Una fila puede mapear a >1 doc (mismo SAP en
  //  varios equipos). La fuente real son los `allRepuestos` de useGlobalSearch.
  // ══════════════════════════════════════════════════════════════════

  // Set de machineIds reales → distingue colección `machines/` vs `hierarchy/`.
  const machineIdSet = useMemo(() => new Set(machines.map((m) => m.id)), [machines])
  const colPathOf = useCallback(
    (mId: string) => (machineIdSet.has(mId) ? `machines/${mId}/repuestos` : `hierarchy/${mId}/repuestos`),
    [machineIdSet],
  )

  // Resuelve los docs Repuesto subyacentes a una fila (mismo criterio de clave que useBodega).
  const resolveSources = useCallback(
    (row: AreaRepuestoRow): GlobalSearchResult[] => {
      const sap = (row.codigoSAP || '').trim()
      if (sap) return allRepuestos.filter((r) => (r.repuesto.codigoSAP || '').trim() === sap)
      const fab = (row.codigoFabricante || '').trim()
      if (fab) {
        return allRepuestos.filter(
          (r) => !(r.repuesto.codigoSAP || '').trim() && (r.repuesto.codigoFabricante || '').trim() === fab,
        )
      }
      return allRepuestos.filter(
        (r) =>
          !(r.repuesto.codigoSAP || '').trim() &&
          !(r.repuesto.codigoFabricante || '').trim() &&
          r.repuesto.textoBreve === row.textoBreve &&
          row.equipos.some((e) => e.machineId === r.machineId),
      )
    },
    [allRepuestos],
  )

  // Máquinas (equipos) del área seleccionada — destino para "+ Repuesto".
  const areaMachines = useMemo(() => {
    if (showingAll) return machines
    if (!selectedAreaId) return []
    return machines.filter((m) => machineInArea(m.id, selectedAreaId))
  }, [machines, showingAll, selectedAreaId, machineInArea])

  // Refrescar catálogo tras una mutación (invalida cache de módulo + recarga).
  const refreshCatalog = useCallback(async () => {
    invalidateGlobalRepuestosCache()
    await loadAll()
  }, [loadAll])

  // Disparar una acción sobre el repuesto seleccionado; pide elegir equipo si hay >1.
  const startAction = useCallback(
    (kind: RepAction) => {
      if (!selectedRep) return
      const sources = resolveSources(selectedRep)
      if (sources.length === 0) {
        toast({ variant: 'destructive', title: 'No se encontró el repuesto base', description: 'Recarga la página e intenta de nuevo.' })
        return
      }
      if (sources.length === 1 && sources[0]) setActionTarget({ kind, source: sources[0] })
      else setEquipoPicker({ kind, sources })
    },
    [selectedRep, resolveSources, toast],
  )

  // Renombrar (textoBreve): aplica a TODOS los equipos que comparten identidad.
  const handleRenameRep = useCallback(
    async (newName: string) => {
      if (!selectedRep) return
      const sources = resolveSources(selectedRep)
      for (const s of sources) {
        await crudUpdate(colPathOf(s.machineId), s.repuesto.id, { textoBreve: newName }, s.repuesto)
      }
      await refreshCatalog()
    },
    [selectedRep, resolveSources, crudUpdate, colPathOf, refreshCatalog],
  )

  // Editar (form completo) → solo el equipo elegido.
  const handleEditSubmit = useCallback(
    async (payload: RepuestoFormData) => {
      if (!actionTarget) return
      setSavingRep(true)
      try {
        const { source } = actionTarget
        await crudUpdate(colPathOf(source.machineId), source.repuesto.id, { ...payload }, source.repuesto)
        toast({ title: 'Repuesto actualizado', variant: 'success' })
        setActionTarget(null)
        await refreshCatalog()
      } catch (err) {
        toast({ variant: 'destructive', title: 'Error al guardar', description: err instanceof Error ? err.message : '' })
      } finally {
        setSavingRep(false)
      }
    },
    [actionTarget, crudUpdate, colPathOf, refreshCatalog, toast],
  )

  const handleSaveSpecs = useCallback(
    async (repuestoId: string, specs: TechnicalSpecs, _gallery: MachineImage[]) => {
      if (!actionTarget) return
      await crudUpdate(colPathOf(actionTarget.source.machineId), repuestoId, { technicalSpecs: specs }, actionTarget.source.repuesto)
      toast({ title: 'Ficha técnica actualizada', variant: 'success' })
      await refreshCatalog()
    },
    [actionTarget, crudUpdate, colPathOf, refreshCatalog, toast],
  )

  const handleSaveGallery = useCallback(
    async (repuestoId: string, gallery: MachineImage[]) => {
      if (!actionTarget) return
      await crudUpdate(colPathOf(actionTarget.source.machineId), repuestoId, { gallery }, actionTarget.source.repuesto)
      toast({ title: 'Galería actualizada', variant: 'success' })
      await refreshCatalog()
    },
    [actionTarget, crudUpdate, colPathOf, refreshCatalog, toast],
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!actionTarget || actionTarget.kind !== 'delete') return
    setSavingRep(true)
    try {
      const { source } = actionTarget
      await crudDelete(colPathOf(source.machineId), source.repuesto.id)
      toast({ title: 'Repuesto movido a la papelera', variant: 'success' })
      setActionTarget(null)
      setSelectedRowKey(null)
      await refreshCatalog()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Error al eliminar', description: err instanceof Error ? err.message : '' })
    } finally {
      setSavingRep(false)
    }
  }, [actionTarget, crudDelete, colPathOf, refreshCatalog, toast])

  // "+ Repuesto": elige equipo destino del área (o directo si hay uno solo).
  const startCreate = useCallback(() => {
    if (areaMachines.length === 0) {
      toast({ variant: 'destructive', title: 'Selecciona un área con equipos', description: 'El repuesto se crea asociado a un equipo del área.' })
      return
    }
    if (areaMachines.length === 1 && areaMachines[0]) {
      setCreateTargetMachine(areaMachines[0])
      setCreateOpen(true)
    } else {
      setCreatePicker(true)
    }
  }, [areaMachines, toast])

  const handleCreateSubmit = useCallback(
    async (payload: RepuestoFormData) => {
      if (!createTargetMachine) return
      setSavingRep(true)
      try {
        await crudCreate(`machines/${createTargetMachine.id}/repuestos`, payload)
        toast({ title: 'Repuesto creado', variant: 'success' })
        setCreateOpen(false)
        await refreshCatalog()
      } catch (err) {
        toast({ variant: 'destructive', title: 'Error al crear', description: err instanceof Error ? err.message : '' })
      } finally {
        setSavingRep(false)
      }
    },
    [createTargetMachine, crudCreate, refreshCatalog, toast],
  )

  // Datos del repuesto/equipo objetivo de la acción en curso.
  const actionRep = actionTarget?.source.repuesto ?? null
  const actionMachineId = actionTarget?.source.machineId
  const actionMachine = useMemo(
    () => (actionMachineId ? machines.find((m) => m.id === actionMachineId) ?? null : null),
    [actionMachineId, machines],
  )

  // ── Importar Excel: elige equipo destino del área (o directo si hay uno) ──
  const startImport = useCallback(() => {
    if (areaMachines.length === 0) {
      toast({ variant: 'destructive', title: 'Selecciona un área con equipos', description: 'La importación carga repuestos en un equipo del área.' })
      return
    }
    if (areaMachines.length === 1 && areaMachines[0]) {
      setImportTargetMachine(areaMachines[0])
      setImportOpen(true)
    } else {
      setImportPicker(true)
    }
  }, [areaMachines, toast])

  // Reubicación masiva: elige equipo ORIGEN del área (o directo si hay uno)
  const startBulkRelocate = useCallback(() => {
    if (areaMachines.length === 0) {
      toast({ variant: 'destructive', title: 'Selecciona un área con equipos', description: 'La reubicación masiva mueve repuestos de un equipo del área a otro.' })
      return
    }
    if (areaMachines.length === 1 && areaMachines[0]) {
      setBulkSourceMachine(areaMachines[0])
      setBulkOpen(true)
    } else {
      setBulkPicker(true)
    }
  }, [areaMachines, toast])

  const handleImportSuccess = useCallback(async (message: string) => {
    toast({ title: 'Importación exitosa', description: message, variant: 'success' })
    setImportOpen(false)
    await refreshCatalog()
  }, [toast, refreshCatalog])

  const handleImportError = useCallback((message: string) => {
    toast({ variant: 'destructive', title: 'Error al importar', description: message })
  }, [toast])

  // ── Exportar: docs Repuesto del área (resueltos desde allRepuestos) ──
  // keyOfDoc replica la clave del merge de useBodega → para mapear doc ↔ fila visible.
  const keyOfDoc = useCallback((rep: { codigoSAP?: string; codigoFabricante?: string; id: string }, machineId: string) => {
    const sap = (rep.codigoSAP || '').trim()
    if (sap) return sap
    const fab = (rep.codigoFabricante || '').trim()
    return fab ? `fab:${fab}` : `id:${machineId}:${rep.id}`
  }, [])
  const areaDocs = useMemo(
    () => allRepuestos.filter((r) => showingAll || (!!selectedAreaId && machineInArea(r.machineId, selectedAreaId))),
    [allRepuestos, showingAll, selectedAreaId, machineInArea],
  )
  const exportRepuestos = useMemo(() => areaDocs.map((r) => r.repuesto), [areaDocs])
  const exportFiltered = useMemo(() => {
    const visibleKeys = new Set(filteredRep.map((row) => row.rowKey))
    return areaDocs.filter((r) => visibleKeys.has(keyOfDoc(r.repuesto, r.machineId))).map((r) => r.repuesto)
  }, [areaDocs, filteredRep, keyOfDoc])

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
    // Seleccionar el área (no un equipo) limpia el filtro de equipo → muestra todo el área.
    setRepEquipoFilter('all')
    setSelectedEquipKey(null)
    setSelectedRowKey(null)
    setSelectedAssetId(null)
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
    setRepEquipoFilter('all')
    setSelectedEquipKey(null)
  }, [])

  // ══════════════════════════════════════════════════════════════════
  //  Admin de estructura de equipos del área (rescate de "Por equipo").
  //  Gestiona NODOS de la colección `hierarchy` (equipos SAP del árbol),
  //  entidad distinta de los PlantAssets (motores/bombas) de "Ver equipos
  //  del área". Reusa EquipmentCard (rename/código/sub-equipo internos) +
  //  useEquipmentForArea. selectedAreaId ya es el id del nodo hierarchy.
  // ══════════════════════════════════════════════════════════════════
  const [showEquipAdmin, setShowEquipAdmin] = useState(false)
  const [equipRefreshKey, setEquipRefreshKey] = useState(0)
  const { equipment: areaEquipment, loading: equipmentLoading } = useEquipmentForArea(
    showEquipAdmin ? selectedAreaId : null,
    equipRefreshKey,
  )

  // Conteo de repuestos por máquina vinculada (badge "N rep." de EquipmentCard)
  const repCountByMachine = useMemo(() => {
    const m: Record<string, number> = {}
    for (const it of bodegaItems) for (const eq of it.equipos) m[eq.machineId] = (m[eq.machineId] ?? 0) + 1
    return m
  }, [bodegaItems])

  const [showHiddenEq, setShowHiddenEq] = useState(false)
  const hiddenEqCount = useMemo(() => areaEquipment.filter((e) => e.oculto).length, [areaEquipment])
  const visibleEquipment = useMemo(
    () => (showHiddenEq ? areaEquipment : areaEquipment.filter((e) => !e.oculto)),
    [areaEquipment, showHiddenEq],
  )

  // Agregar equipo (inline) + reordenar
  const [eqReorderMode, setEqReorderMode] = useState(false)
  const [addingEquipment, setAddingEquipment] = useState(false)
  const [newEqName, setNewEqName] = useState('')
  const [newEqCode, setNewEqCode] = useState('')
  const [savingNewEq, setSavingNewEq] = useState(false)
  const newEqInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (addingEquipment) newEqInputRef.current?.focus() }, [addingEquipment])

  const refreshEquip = useCallback(() => {
    invalidateEquipmentCache(selectedAreaId ?? undefined)
    setEquipRefreshKey((k) => k + 1)
  }, [selectedAreaId])

  const handleAddEquipmentToArea = useCallback(async () => {
    const name = newEqName.trim()
    if (!name || !selectedAreaId) return
    const selNode = findNode(selectedAreaId)
    setSavingNewEq(true)
    try {
      const nextLevel = selNode ? (selNode.nivel as number) + 1 : 5
      await addDoc(collection(db, 'hierarchy'), {
        nombre: name.toUpperCase(),
        codigo: newEqCode.trim(),
        nivel: nextLevel,
        parentId: selectedAreaId,
        path: getNodePath(selectedAreaId).map((n) => n.id),
        orden: areaEquipment.length,
        activo: true,
        creadoPor: 'admin',
        creadoEn: Timestamp.now(),
        actualizadoEn: Timestamp.now(),
      })
      refreshEquip()
    } catch (err) {
      logger.error('Error al agregar equipo', err instanceof Error ? err : new Error(String(err)))
    } finally {
      setSavingNewEq(false); setAddingEquipment(false); setNewEqName(''); setNewEqCode('')
    }
  }, [newEqName, newEqCode, selectedAreaId, findNode, getNodePath, areaEquipment.length, refreshEquip])

  const handleToggleEquipHidden = useCallback(async (equipmentId: string, hidden: boolean) => {
    try {
      await updateDoc(doc(db, 'hierarchy', equipmentId), { oculto: hidden, actualizadoEn: Timestamp.now() })
      refreshEquip()
    } catch (err) {
      logger.error('Error toggling hidden', err instanceof Error ? err : new Error(String(err)))
    }
  }, [refreshEquip])

  const handleMoveEquipment = useCallback(async (equipmentId: string, direction: 'up' | 'down') => {
    const idx = areaEquipment.findIndex((e) => e.id === equipmentId)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= areaEquipment.length) return
    const eqA = areaEquipment[idx]!, eqB = areaEquipment[swapIdx]!
    try {
      await Promise.all([
        updateDoc(doc(db, 'hierarchy', eqA.id), { orden: swapIdx, actualizadoEn: Timestamp.now() }),
        updateDoc(doc(db, 'hierarchy', eqB.id), { orden: idx, actualizadoEn: Timestamp.now() }),
      ])
      refreshEquip()
    } catch (err) {
      logger.error('Error reordering equipment', err instanceof Error ? err : new Error(String(err)))
    }
  }, [areaEquipment, refreshEquip])

  // Eliminar equipo (con clave admin → papelera)
  const [eqDeleteTarget, setEqDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [eqDeleteClave, setEqDeleteClave] = useState('')
  const [eqDeleteError, setEqDeleteError] = useState('')
  const [eqDeleting, setEqDeleting] = useState(false)
  const handleDeleteEquipment = useCallback((equipmentId: string, name: string) => {
    setEqDeleteTarget({ id: equipmentId, name }); setEqDeleteClave(''); setEqDeleteError('')
  }, [])
  const confirmEquipDelete = useCallback(async () => {
    if (!eqDeleteTarget || !eqDeleteClave.trim()) return
    setEqDeleting(true); setEqDeleteError('')
    try {
      const correctPwd = await getHmiTooltipPwd()
      if (eqDeleteClave.trim() !== correctPwd) { setEqDeleteError('Clave incorrecta'); setEqDeleting(false); return }
      const docRef = doc(db, 'hierarchy', eqDeleteTarget.id)
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        const data = snap.data()
        await moveToTrash({
          originalCollection: 'hierarchy',
          originalId: eqDeleteTarget.id,
          documentLabel: eqDeleteTarget.name,
          data: data as Record<string, unknown>,
          userId: user?.id || '',
          userName: `${user?.nombre || ''} ${user?.apellido || ''}`.trim(),
          metadata: { parentId: (data.parentId as string) || '' },
        })
      }
      await deleteDoc(docRef)
      refreshEquip()
      setEqDeleteTarget(null)
    } catch (err) {
      logger.error('Error deleting equipment', err instanceof Error ? err : new Error(String(err)))
      setEqDeleteError('Error al eliminar')
    }
    setEqDeleting(false)
  }, [eqDeleteTarget, eqDeleteClave, user, refreshEquip])

  // G7: equipos MANUALES (colección `machines`) asignados al área seleccionada.
  // Distinto de los nodos hierarchy (equipos SAP). Rename + archivar inline.
  const { machines: manualMachines, updateMachine: updateManualMachine, archiveMachine: archiveManualMachine } = useMachines()
  const manualMachinesInArea = useMemo(
    () => manualMachines.filter((m) => m.activa && m.hierarchyNodeId === selectedAreaId),
    [manualMachines, selectedAreaId],
  )
  const handleRenameManualMachine = useCallback(
    async (id: string, name: string) => { await updateManualMachine(id, { nombre: name }) },
    [updateManualMachine],
  )
  const handleArchiveManualMachine = useCallback(
    async (m: Machine) => { if (!confirm(`¿Archivar "${m.nombre}" de equipos manuales?`)) return; await archiveManualMachine(m.id) },
    [archiveManualMachine],
  )

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId],
  )

  const title = showingAll ? 'Todas las áreas' : (selectedNode?.nombre ?? 'Selecciona un área')

  // Herramientas admin de catálogo — compartidas entre toolbar desktop y overflow móvil.
  const adminTools = isAdmin
    ? [
        { key: 'manage', icon: Settings2, label: 'Gestionar equipos', onClick: () => setMachineManagerOpen(true) },
        { key: 'import', icon: Upload, label: 'Importar Excel', onClick: startImport },
        { key: 'export', icon: Download, label: 'Exportar reporte', onClick: () => setExportOpen(true) },
        { key: 'dup', icon: GitMerge, label: 'Escáner de duplicados', onClick: () => setDuplicatesOpen(true) },
        { key: 'audit', icon: History, label: 'Historial de cambios', onClick: () => setAuditLogOpen(true) },
        { key: 'trash', icon: Trash2, label: 'Papelera', onClick: () => setTrashOpen(true), badge: trashCount },
      ]
    : []

  const equipFavTotal = equipFavLists.reduce((n, l) => n + l.machineIds.length, 0)

  return (
    <div className="relative flex h-full bg-background">
      <AreaSidebar
        selectedAreaId={selectedAreaId}
        onSelectArea={handleSelectArea}
        assetCountByNode={assetCountByNode}
        repCountByNode={repCountByNode}
        favoriteAreaIds={favoriteAreaIds}
        onToggleAreaFav={toggleAreaFav}
        favoritesOnly={areaFavOnly}
        onToggleFavoritesOnly={() => setAreaFavOnly((v) => !v)}
        openNodes={openNodes}
        onToggleNode={handleToggleNode}
        onShowAll={handleShowAll}
        showingAll={showingAll}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        onSelectEquipment={(_node, leaf) => handleFavEquipClick(leaf.linkedMachineId || leaf.id)}
        selectedEquipKey={selectedEquipKey}
        equipFavKeys={equipFavKeys}
        onToggleEquipFav={(leaf) => handleEquipStar(leaf.linkedMachineId || leaf.id, undefined, leaf.alias || leaf.nombre)}
      />

      {/* Edge-tab para reabrir el sidebar contraído (solo desktop) */}
      {sidebarCollapsed && (
        <button
          type="button"
          onClick={toggleSidebarCollapse}
          className="absolute left-0 top-1/2 z-20 hidden h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-border bg-card/80 shadow-md backdrop-blur-sm transition-all duration-200 hover:w-8 hover:bg-muted sm:flex"
          title="Expandir panel de áreas"
          aria-label="Expandir áreas"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header del módulo: búsqueda global + acciones */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
          <button
            onClick={() => setSidebarMobileOpen(true)}
            className="shrink-0 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
            aria-label="Abrir áreas"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative min-w-[160px] max-w-md flex-1">
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
            <ClipboardList className="h-4 w-4" /> <span className="hidden sm:inline">Solicitudes</span>
            {pendientesCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 tabular-nums">{pendientesCount}</Badge>
            )}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => openSolicitar(null)}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Solicitar repuesto</span><span className="sm:hidden">Solicitar</span>
          </Button>
          {/* Herramientas admin: toolbar en desktop (≥sm) */}
          {isAdmin && (
            <div className="hidden items-center gap-1 border-l border-border pl-2 sm:flex">
              {adminTools.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.key} onClick={t.onClick} title={t.label} className="relative rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Icon className="h-4 w-4" />
                    {t.badge ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white tabular-nums">{t.badge}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
          {/* Herramientas admin: overflow en móvil (<sm) */}
          {isAdmin && (
            <div className="relative sm:hidden">
              <button onClick={() => setAdminMenuOpen((v) => !v)} title="Herramientas admin" aria-label="Herramientas admin" className="relative rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <MoreVertical className="h-5 w-5" />
                {trashCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white tabular-nums">{trashCount}</span>
                )}
              </button>
              {adminMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)} />
                  <div className="absolute left-0 z-50 mt-1 w-56 max-w-[calc(100vw-1.5rem)] rounded-lg border border-border bg-card p-1 shadow-xl">
                    {adminTools.map((t) => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.key}
                          onClick={() => { t.onClick(); setAdminMenuOpen(false) }}
                          className="flex w-full items-center gap-2.5 rounded px-2.5 py-2.5 text-left text-sm text-foreground hover:bg-muted/50"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">{t.label}</span>
                          {t.badge ? (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white tabular-nums">{t.badge}</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Favoritos de equipos (listas con nombre) — colapsada por defecto + gestionable por admin (G2) */}
          {(equipFavLists.length > 0 || isAdmin) && (
            <div className="mb-5 rounded-xl border border-border bg-card/40 p-3">
              <button
                onClick={() => setFavBarOpen((v) => !v)}
                className="flex w-full items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> Favoritos de equipos
                {equipFavLists.length > 0 && <span className="tabular-nums text-muted-foreground/60">({equipFavTotal})</span>}
                <ChevronDown className={['ml-auto h-3.5 w-3.5 transition-transform', favBarOpen ? '' : '-rotate-90'].join(' ')} />
              </button>
              {favBarOpen && (equipFavLists.length === 0 ? (
                <p className="mt-2 pl-5 text-[11px] text-muted-foreground/70">Marca equipos con ⭐ en «Estructura de equipos del área (admin)» para crear listas.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {equipFavLists.map((list) => {
                    const closed = favBarClosed[list.name]
                    return (
                      <div key={list.name}>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setFavBarClosed((p) => ({ ...p, [list.name]: !p[list.name] }))}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground"
                          >
                            <ChevronDown className={['h-3.5 w-3.5 transition-transform', closed ? '-rotate-90' : ''].join(' ')} />
                            {isAdmin ? (
                              <InlineEditName value={list.name} onSave={async (n) => { renameEquipList(list.name, n) }} canEdit textClassName="text-[11px] font-semibold text-foreground" />
                            ) : (
                              <span>{list.name}</span>
                            )}
                            <span className="tabular-nums text-muted-foreground/60">({list.machineIds.length})</span>
                          </button>
                          {isAdmin && (
                            <button onClick={() => deleteEquipList(list.name)} title="Eliminar lista" className="rounded p-0.5 text-muted-foreground/40 hover:text-red-400">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {!closed && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5 pl-5">
                            {list.machineIds.map((id, idx) => (
                              <span key={id} className="group inline-flex items-center overflow-hidden rounded-full border border-border bg-background">
                                <button
                                  onClick={() => handleFavEquipClick(id)}
                                  className="px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-primary/10 hover:text-primary"
                                >
                                  {list.machineNames?.[id] || equipNameMap.get(id) || id}
                                </button>
                                {isAdmin && (
                                  <span className="inline-flex items-center pr-1 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:inline-flex">
                                    <button onClick={() => moveEquipInList(list.name, idx, 'up')} disabled={idx === 0} title="Subir" className="px-0.5 text-muted-foreground/50 hover:text-primary disabled:opacity-20"><ChevronUp className="h-3 w-3" /></button>
                                    <button onClick={() => moveEquipInList(list.name, idx, 'down')} disabled={idx === list.machineIds.length - 1} title="Bajar" className="px-0.5 text-muted-foreground/50 hover:text-primary disabled:opacity-20"><ChevronDown className="h-3 w-3" /></button>
                                    <button onClick={() => removeEquipFromList(list.name, id)} title="Quitar de la lista" className="px-0.5 text-muted-foreground/50 hover:text-red-400"><X className="h-3 w-3" /></button>
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}

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
              {repEquipoFilter !== 'all' && (
                <button
                  onClick={() => { setRepEquipoFilter('all'); setSelectedEquipKey(null) }}
                  className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20"
                  title="Quitar filtro de equipo — ver todos los repuestos del área"
                >
                  <Cog className="h-3 w-3 shrink-0" /> <span className="truncate">{repEquipoFilter}</span> <X className="h-3 w-3 shrink-0 opacity-70" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isAdmin && (selectedAreaId || showingAll) && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={startCreate} title="Agregar repuesto a un equipo del área">
                  <Plus className="h-4 w-4" /> Repuesto
                </Button>
              )}
              {isAdmin && (selectedAreaId || showingAll) && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={startBulkRelocate} title="Reubicar varios repuestos de un equipo a otro">
                  <ArrowRightLeft className="h-4 w-4" /> Reubicar lote
                </Button>
              )}
            </div>
          </div>

          {/* KPIs */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard value={repuestosBusy ? '…' : stockKpis.total} label="Repuestos totales" accent="text-primary" bar="border-l-primary" hint={repuestosBusy ? undefined : `${stockKpis.configurados} con stock`} />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.ok} label="Stock disponible" accent="text-emerald-500" hint={repuestosBusy ? undefined : `${stockKpis.pctOk}%`} bar="border-l-emerald-500" />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.low} label="Stock bajo" accent="text-amber-500" hint={repuestosBusy ? undefined : `${stockKpis.pctLow}%`} bar="border-l-amber-500" />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.out} label="Sin stock" accent="text-red-500" hint={repuestosBusy ? undefined : `${stockKpis.pctOut}%`} bar="border-l-red-500" />
          </div>

          {/* KPIs de catálogo (cobertura) */}
          {!repuestosBusy && stockKpis.total > 0 && (
            <div className="mb-6 -mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span><b className="text-foreground tabular-nums">{catalogStats.conSAP}</b> con SAP <span className="opacity-60">({catalogStats.pctSAP}%)</span></span>
              <span className="opacity-40">·</span>
              <span><b className="text-foreground tabular-nums">{catalogStats.sinSAP}</b> sin SAP</span>
              <span className="opacity-40">·</span>
              <span><b className="text-foreground tabular-nums">{catalogStats.tipos}</b> tipos distintos</span>
              {catalogStats.valor > 0 && (
                <>
                  <span className="opacity-40">·</span>
                  <span>valor inventario <b className="text-foreground tabular-nums">${catalogStats.valor.toLocaleString('es-CL')}</b></span>
                </>
              )}
            </div>
          )}

          {/* Motores/Bombas del área — se muestran automáticamente cuando el área/equipo seleccionado tiene M/B */}
          {filteredAssets.length > 0 && (
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
                      <th className="hidden px-3 py-2 font-semibold md:table-cell">Modelo</th>
                      <th className="hidden px-3 py-2 font-semibold md:table-cell">SAP</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredAssets.map((a) => {
                      const thumb = thumbOf(a)
                      return (
                        <tr
                          key={a.id}
                          onClick={() => { setSelectedAssetId(a.id); setSelectedRowKey(null) }}
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
                          <td className="px-3 py-2 font-medium text-foreground">
                            {a.equipo || '-'}
                            {/* En móvil, modelo + SAP van como subtítulo (columnas ocultas) */}
                            {(a.modeloTipo || a.codigoSAP) && (
                              <div className="mt-0.5 font-mono text-[10px] font-normal text-muted-foreground md:hidden">
                                {[a.modeloTipo, a.codigoSAP].filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Badge variant={a.tipo === 'motor' ? 'default' : 'secondary'}>
                              {a.tipo === 'motor' ? 'Motor' : 'Bomba'}
                            </Badge>
                          </td>
                          <td className="hidden px-3 py-2 font-mono text-xs text-foreground md:table-cell">{a.modeloTipo || '-'}</td>
                          <td className="hidden px-3 py-2 font-mono text-xs md:table-cell">{a.codigoSAP || <span className="text-muted-foreground">-</span>}</td>
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

          {/* Estructura de equipos del área (admin) — nodos hierarchy, distinto de PlantAssets */}
          {isAdmin && selectedAreaId && (
            <section className="mb-6">
              <button
                onClick={() => setShowEquipAdmin((s) => !s)}
                className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"
              >
                <Wrench className="h-4 w-4 text-amber-500" />
                Estructura de equipos del área (admin)
                <ChevronDown className={['h-4 w-4 text-muted-foreground transition-transform', showEquipAdmin ? '' : '-rotate-90'].join(' ')} />
              </button>

              {showEquipAdmin && (
                <div className="overflow-hidden rounded-lg border border-border">
                  {/* Toolbar: conteo + ver ocultos + reordenar + agregar */}
                  <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">{visibleEquipment.length} equipos</span>
                    {hiddenEqCount > 0 && (
                      <button
                        onClick={() => setShowHiddenEq((v) => !v)}
                        className={['flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors', showHiddenEq ? 'bg-amber-500/15 text-amber-500' : 'bg-muted/60 text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground'].join(' ')}
                        title={showHiddenEq ? 'Ocultar equipos ocultos' : `Ver ${hiddenEqCount} oculto(s)`}
                      >
                        {showHiddenEq ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {hiddenEqCount}
                      </button>
                    )}
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        onClick={() => setEqReorderMode((v) => !v)}
                        className={['flex h-7 w-7 items-center justify-center rounded transition-colors', eqReorderMode ? 'bg-primary/20 text-primary' : 'text-muted-foreground/60 hover:bg-primary/20 hover:text-primary'].join(' ')}
                        title={eqReorderMode ? 'Salir de reordenar' : 'Reordenar equipos'}
                      >
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setAddingEquipment(true)}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-primary/20 hover:text-primary"
                        title="Agregar equipo"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Formulario inline agregar equipo */}
                  {addingEquipment && (
                    <div className="flex items-center gap-1.5 border-b border-primary/20 bg-primary/5 px-3 py-2">
                      <Plus className="h-3.5 w-3.5 shrink-0 text-primary/50" />
                      <input
                        ref={newEqInputRef}
                        value={newEqName}
                        onChange={(e) => setNewEqName(e.target.value.toUpperCase())}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddEquipmentToArea(); if (e.key === 'Escape') setAddingEquipment(false) }}
                        placeholder="Nombre del equipo"
                        className="h-7 min-w-0 flex-1 rounded border border-primary/40 bg-background px-1.5 text-[11px] uppercase text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <input
                        value={newEqCode}
                        onChange={(e) => setNewEqCode(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddEquipmentToArea(); if (e.key === 'Escape') setAddingEquipment(false) }}
                        placeholder="Código (opc.)"
                        className="h-7 w-24 rounded border border-border bg-background px-1.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button onClick={handleAddEquipmentToArea} disabled={savingNewEq || !newEqName.trim()} className="flex h-7 w-7 items-center justify-center rounded bg-primary/20 text-primary transition-colors hover:bg-primary/30 disabled:opacity-40">
                        {savingNewEq ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                      </button>
                      <button onClick={() => setAddingEquipment(false)} className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/50">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {/* Lista de equipos SAP del área */}
                  {equipmentLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10">
                      <Loader2 className="h-5 w-5 animate-spin text-primary/50" />
                      <span className="text-xs text-muted-foreground">Cargando equipos…</span>
                    </div>
                  ) : visibleEquipment.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
                      <Package className="h-7 w-7 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground">Esta área no tiene equipos SAP. Usa «+» para agregar.</p>
                    </div>
                  ) : (
                    <div>
                      {visibleEquipment.map((eq, idx) => (
                        <EquipmentCard
                          key={eq.id}
                          equipment={eq}
                          isActive={photoEquip?.id === eq.id}
                          onClick={(e) => setPhotoEquip({ id: e.id, name: e.alias || e.nombre })}
                          repuestosCounts={repCountByMachine}
                          isAdmin={isAdmin}
                          onAliasUpdated={refreshEquip}
                          onChildAdded={refreshEquip}
                          reorderMode={eqReorderMode}
                          isFirst={idx === 0}
                          isLast={idx === visibleEquipment.length - 1}
                          onMoveUp={() => handleMoveEquipment(eq.id, 'up')}
                          onMoveDown={() => handleMoveEquipment(eq.id, 'down')}
                          onToggleHidden={handleToggleEquipHidden}
                          onDeleteEquipment={handleDeleteEquipment}
                          isFavoriteMachine={isEquipFav(eq.linkedMachineId || eq.id)}
                          isFavoriteFn={(id) => isEquipFav(id)}
                          onToggleFavoriteMachine={handleEquipStar}
                        />
                      ))}
                    </div>
                  )}

                  {/* G7: equipos manuales (colección machines) asignados a esta área */}
                  {manualMachinesInArea.length > 0 && (
                    <div className="border-t border-border/40">
                      <div className="bg-muted/10 px-3 py-1.5">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Equipos manuales ({manualMachinesInArea.length})</span>
                      </div>
                      {manualMachinesInArea.map((m) => (
                        <div key={m.id} className="group flex items-center gap-2.5 border-b border-border/20 px-3 py-[7px] last:border-b-0 hover:bg-muted/25">
                          <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ backgroundColor: m.color || '#3b82f6' }} />
                          <div className="min-w-0 flex-1">
                            <InlineEditName
                              value={m.nombre}
                              onSave={(name) => handleRenameManualMachine(m.id, name)}
                              canEdit
                              className="w-full"
                              textClassName="block truncate text-[11.5px] font-medium leading-snug text-foreground"
                            />
                            {[m.marca, m.modelo].filter(Boolean).length > 0 && (
                              <span className="mt-px block truncate text-[9.5px] leading-tight text-muted-foreground/70">{[m.marca, m.modelo].filter(Boolean).join(' · ')}</span>
                            )}
                          </div>
                          <button
                            onClick={() => handleArchiveManualMachine(m)}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 transition-all hover:bg-amber-500/10 hover:text-amber-500 [@media(hover:hover)]:hidden [@media(hover:hover)]:group-hover:flex"
                            title="Archivar equipo manual"
                          >
                            <Archive className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
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
              {/* Selects: 2-up en móvil (grid), fila única en ≥sm (sm:contents disuelve el grid) */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
              <Select value={repEquipoFilter} onValueChange={(v) => { setRepEquipoFilter(v); setSelectedEquipKey(null) }}>
                <SelectTrigger className="w-full sm:w-[190px]"><SelectValue placeholder="Todos los equipos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los equipos</SelectItem>
                  {equipoOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={repTipoFilter} onValueChange={setRepTipoFilter}>
                <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {tipoOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.value} ({t.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={repStockFilter} onValueChange={(v) => setRepStockFilter(v as StockFilter)}>
                <SelectTrigger className="w-full sm:w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Stock: Todos</SelectItem>
                  <SelectItem value="ok">Disponible</SelectItem>
                  <SelectItem value="low">Bajo</SelectItem>
                  <SelectItem value="out">Sin stock</SelectItem>
                  <SelectItem value="unset">Sin config.</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <Button
                variant={repFavOnly ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setRepFavOnly((v) => !v)}
                title="Mostrar solo repuestos favoritos"
              >
                <Star className={['h-4 w-4', repFavOnly ? 'fill-current' : ''].join(' ')} /> Favoritos
                {favKeys.size > 0 && <span className="tabular-nums opacity-70">({favKeys.size})</span>}
              </Button>
              {favLists.length > 0 && (
                <Select value={listFilter} onValueChange={setListFilter}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Lista" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las listas</SelectItem>
                    {favLists.map((l) => <SelectItem key={l.name} value={l.name}>{l.name} ({l.repuestoIds.length})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>

            {repuestosBusy ? (
              <div className="overflow-hidden rounded-lg border border-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0">
                    <div className="h-3 w-20 shrink-0 animate-pulse rounded bg-muted" />
                    <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
                    <div className="hidden h-3 w-24 animate-pulse rounded bg-muted sm:block" />
                    <div className="h-3 w-12 shrink-0 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
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
                        {renderSortTh('codigoSAP', 'SAP', 'hidden md:table-cell')}
                        {renderSortTh('textoBreve', 'Repuesto')}
                        {renderSortTh('equipo', 'Equipo', 'hidden md:table-cell')}
                        {renderSortTh('stock', 'Stock')}
                        {renderSortTh('tipo', 'Tipo', 'hidden md:table-cell')}
                        <th className="w-8 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedRep.map((r) => {
                        const meta = STOCK_META[r.stockStatus]
                        const equipo = r.equipos[0]?.machineName ?? '-'
                        const extra = r.equipos.length > 1 ? ` +${r.equipos.length - 1}` : ''
                        const isSel = selectedRowKey === r.rowKey
                        return (
                          <tr
                            key={r.rowKey}
                            onClick={() => { setSelectedRowKey(r.rowKey); setSelectedAssetId(null) }}
                            className={[
                              'cursor-pointer transition-colors',
                              isSel ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/40',
                            ].join(' ')}
                          >
                            <td className="hidden px-3 py-2 font-mono text-xs md:table-cell">{r.codigoSAP || '-'}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-foreground">{r.textoBreve || r.alias || '(sin nombre)'}</div>
                              {/* En móvil, SAP + equipo + tipo van como subtítulo (columnas ocultas) */}
                              <div className="mt-0.5 text-[10px] text-muted-foreground md:hidden">
                                {r.codigoSAP && <span className="font-mono text-muted-foreground/80">{r.codigoSAP} · </span>}
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
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFav(r.rowKey) }}
                                  className={['rounded p-0.5 transition', favKeys.has(r.rowKey) ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400'].join(' ')}
                                  title={favKeys.has(r.rowKey) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                  aria-label="Favorito"
                                >
                                  <Star className={['h-4 w-4', favKeys.has(r.rowKey) ? 'fill-current' : ''].join(' ')} />
                                </button>
                                <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                              </div>
                            </td>
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
          onClose={() => setSelectedRowKey(null)}
          loadMovimientos={loadMovimientos}
          onSaveLocation={handleSaveLocation}
          onSolicitar={(r) => openSolicitar({ codigoSAP: r.codigoSAP, textoBreve: r.textoBreve })}
          isAdmin={isAdmin}
          onRename={isAdmin ? handleRenameRep : undefined}
          onEditRepuesto={isAdmin ? () => startAction('edit') : undefined}
          onDeleteRepuesto={isAdmin ? () => startAction('delete') : undefined}
          onRelocate={isAdmin ? () => startAction('relocate') : undefined}
          onSpecs={() => startAction('specs')}
          onPhotos={() => startAction('photos')}
          onGallery={() => startAction('gallery')}
          onManual={() => startAction('manual')}
          onManualSearch={() => startAction('manualSearch')}
          isFavorite={favKeys.has(selectedRep.rowKey)}
          onToggleFavorite={() => toggleFav(selectedRep.rowKey)}
          onAddToList={() => setAddToListRowKey(selectedRep.rowKey)}
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

      {/* Herramientas admin de catálogo (rescatadas de "Por equipo") */}
      {isAdmin && (
        <>
          <DuplicatesModal open={duplicatesOpen} onOpenChange={setDuplicatesOpen} machines={machines} onDone={() => { invalidateGlobalRepuestosCache(); loadAll() }} />
          <AuditLogPanel open={auditLogOpen} onOpenChange={setAuditLogOpen} />
          <TrashPanel open={trashOpen} onOpenChange={setTrashOpen} />
          {/* G4: gestor de máquinas manuales (CRUD + asignar área) */}
          <Dialog open={machineManagerOpen} onOpenChange={setMachineManagerOpen}>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">Gestionar equipos</DialogTitle>
                <DialogDescription>Crear, editar, archivar o eliminar máquinas manuales y asignarles área.</DialogDescription>
              </DialogHeader>
              <MachineManager onCreated={() => { invalidateGlobalRepuestosCache(); loadAll() }} />
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* ── Acciones por repuesto (Wave 1) ── */}

      {/* Selector de equipo cuando un repuesto vive en >1 equipo */}
      <Dialog open={!!equipoPicker} onOpenChange={(o) => !o && setEquipoPicker(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">¿Sobre qué equipo?</DialogTitle>
            <DialogDescription>Este repuesto está registrado en varios equipos. Elige sobre cuál aplicar la acción.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {equipoPicker?.sources.map((s) => (
              <button
                key={`${s.machineId}:${s.repuesto.id}`}
                onClick={() => { setActionTarget({ kind: equipoPicker.kind, source: s }); setEquipoPicker(null) }}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-muted/40 hover:border-primary/40"
              >
                <Cog className="h-4 w-4 shrink-0 text-cyan-500" />
                <span className="truncate">{s.machineName}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Selector de equipo destino para "+ Repuesto" */}
      <Dialog open={createPicker} onOpenChange={(o) => !o && setCreatePicker(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">¿A qué equipo?</DialogTitle>
            <DialogDescription>El nuevo repuesto se asociará al equipo seleccionado del área.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {areaMachines.map((m) => (
              <button
                key={m.id}
                onClick={() => { setCreateTargetMachine(m); setCreatePicker(false); setCreateOpen(true) }}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-muted/40 hover:border-primary/40"
              >
                <Cog className="h-4 w-4 shrink-0 text-cyan-500" />
                <span className="truncate">{m.nombre || m.id}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Selector de equipo destino para "Importar Excel" */}
      <Dialog open={importPicker} onOpenChange={(o) => !o && setImportPicker(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">¿A qué equipo importar?</DialogTitle>
            <DialogDescription>Los repuestos del Excel se cargarán en el equipo seleccionado del área.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {areaMachines.map((m) => (
              <button
                key={m.id}
                onClick={() => { setImportTargetMachine(m); setImportPicker(false); setImportOpen(true) }}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-muted/40 hover:border-primary/40"
              >
                <Cog className="h-4 w-4 shrink-0 text-cyan-500" />
                <span className="truncate">{m.nombre || m.id}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Selector de equipo ORIGEN para "Reubicar lote" (G3) */}
      <Dialog open={bulkPicker} onOpenChange={(o) => !o && setBulkPicker(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">¿Desde qué equipo?</DialogTitle>
            <DialogDescription>Elige el equipo de origen; luego seleccionas qué repuestos mover y a qué equipo destino.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {areaMachines.map((m) => (
              <button
                key={m.id}
                onClick={() => { setBulkSourceMachine(m); setBulkPicker(false); setBulkOpen(true) }}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-muted/40 hover:border-primary/40"
              >
                <Cog className="h-4 w-4 shrink-0 text-cyan-500" />
                <span className="truncate">{m.nombre || m.id}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reubicación masiva (mueve repuestos de bulkSourceMachine a otro equipo) */}
      {bulkSourceMachine && (
        <BulkRelocateModal
          open={bulkOpen}
          onOpenChange={(o) => { setBulkOpen(o); if (!o) setBulkSourceMachine(null) }}
          repuestos={bulkSourceRepuestos}
          currentMachine={bulkSourceMachine}
          machines={machines}
          onBulkRelocate={bulkRelocateRepuestos}
          onSuccess={() => { setBulkOpen(false); setBulkSourceMachine(null); invalidateGlobalRepuestosCache(); loadAll() }}
        />
      )}

      {/* Importar Excel (carga en machines/{importTargetMachine}/repuestos) */}
      <ImportRepuestosModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={handleImportSuccess}
        onError={handleImportError}
        machineName={importTargetMachine?.nombre ?? ''}
        importCatalogoDesdeExcel={importCatalogoDesdeExcel}
      />

      {/* Exportar reporte (docs del área; respeta filtros visibles) */}
      <ExportReportModal
        isOpen={exportOpen}
        onClose={() => setExportOpen(false)}
        repuestos={exportRepuestos}
        filteredRepuestos={exportFiltered}
        categories={[]}
        machineName={showingAll ? 'Todas las áreas' : (selectedNode?.nombre ?? 'Área')}
      />

      {/* Gestor de listas de favoritos con nombre (para el repuesto objetivo) */}
      {addToListRowKey && ((rk: string) => {
        const row = areaRepuestos.find((r) => r.rowKey === rk)
        return (
          <Dialog open onOpenChange={(o) => { if (!o) { setAddToListRowKey(null); setNewListName('') } }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-base">Agregar a lista</DialogTitle>
                <DialogDescription className="truncate">{row?.textoBreve || row?.codigoSAP || 'Repuesto'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                {favLists.length === 0 && <p className="text-xs text-muted-foreground">Aún no tienes listas. Crea una abajo.</p>}
                {favLists.map((l) => {
                  const inList = l.repuestoIds.includes(rk)
                  return (
                    <div
                      key={l.name}
                      className={[
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition',
                        inList ? 'border-amber-400/40 bg-amber-400/10 text-amber-500' : 'border-border bg-card text-foreground',
                      ].join(' ')}
                    >
                      <button onClick={() => toggleInList(l.name, rk)} className="flex flex-1 items-center gap-2 text-left">
                        <Star className={['h-3.5 w-3.5 shrink-0', inList ? 'fill-current' : 'text-muted-foreground/40'].join(' ')} />
                        <span className="flex-1 truncate">{l.name}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{l.repuestoIds.length}</span>
                        {inList && <span className="text-[10px]">En lista</span>}
                      </button>
                      <button
                        onClick={() => deleteList(l.name)}
                        className="rounded p-0.5 text-muted-foreground/50 hover:text-destructive"
                        title="Eliminar lista"
                        aria-label="Eliminar lista"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
              <form
                onSubmit={(e) => { e.preventDefault(); if (!newListName.trim()) return; createListWith(newListName, rk); setNewListName('') }}
                className="mt-2 flex gap-2"
              >
                <Input value={newListName} onChange={(e) => setNewListName(e.target.value)} placeholder="Nueva lista…" className="h-8 text-xs" />
                <Button type="submit" size="sm" disabled={!newListName.trim()} className="h-8">Crear</Button>
              </form>
            </DialogContent>
          </Dialog>
        )
      })(addToListRowKey)}

      {/* Crear repuesto */}
      <RepuestoFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        machineName={createTargetMachine?.nombre ?? ''}
        onSubmit={handleCreateSubmit}
        loading={savingRep}
      />

      {/* Editar repuesto */}
      <RepuestoFormModal
        open={actionTarget?.kind === 'edit'}
        onClose={() => setActionTarget(null)}
        mode="edit"
        machineName={actionMachine?.nombre ?? actionTarget?.source.machineName ?? ''}
        initialData={actionTarget?.kind === 'edit' ? actionRep : undefined}
        onSubmit={handleEditSubmit}
        loading={savingRep}
      />

      {/* Ficha técnica */}
      {actionTarget?.kind === 'specs' && actionRep && (
        <TechnicalSpecsModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          repuesto={actionRep}
          machineId={actionMachineId}
          onSave={handleSaveSpecs}
          readOnly={!isAdmin}
        />
      )}

      {/* Galería */}
      {actionTarget?.kind === 'gallery' && actionRep && (
        <RepuestoGalleryModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          repuesto={actionRep}
          machineId={actionMachineId}
          onSave={handleSaveGallery}
          readOnly={!isAdmin}
        />
      )}

      {/* Fotos (solo lectura) */}
      {actionTarget?.kind === 'photos' && actionRep && (
        <RepuestoPhotosModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          fotosReales={actionRep.fotosReales || []}
          imagenesManual={actionRep.imagenesManual || []}
          repuestoName={actionRep.textoBreve || actionRep.codigoSAP || 'Repuesto'}
        />
      )}

      {/* Vínculos al manual */}
      {actionTarget?.kind === 'manual' && actionRep && (
        <RepuestoManualModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          repuesto={actionRep}
        />
      )}

      {/* Buscar código de fabricante dentro del PDF del manual de la máquina */}
      {actionTarget?.kind === 'manualSearch' && actionRep && actionMachine && (
        <ManualSearchModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          machine={actionMachine}
          repuesto={actionRep}
          initialVinculo={actionRep.vinculosManual?.find((v) => v.machineId === actionMachineId) ?? actionRep.vinculosManual?.[0]}
          isAdmin={isAdmin}
        />
      )}

      {/* Reubicar */}
      {actionTarget?.kind === 'relocate' && actionRep && actionMachine && (
        <RelocateRepuestoModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          repuesto={actionRep}
          currentMachine={actionMachine}
          machines={machines}
          onRelocate={relocateRepuesto}
          onSuccess={() => {
            setActionTarget(null)
            toast({ title: 'Repuesto reubicado', description: 'El repuesto fue movido a la nueva máquina.' })
            invalidateGlobalRepuestosCache(); loadAll()
          }}
        />
      )}

      {/* Confirmar eliminación */}
      <Dialog open={actionTarget?.kind === 'delete'} onOpenChange={(o) => !o && setActionTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Eliminar repuesto</DialogTitle>
            <DialogDescription>
              Se moverá a la papelera (recuperable). {actionRep ? `"${actionRep.textoBreve || actionRep.codigoSAP}"` : ''}
              {actionMachine ? ` — equipo ${actionMachine.nombre}` : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionTarget(null)} disabled={savingRep}>Cancelar</Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={savingRep}>
              {savingRep ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminación de equipo (estructura hierarchy) con clave admin */}
      {eqDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEqDeleteTarget(null)}>
          <div className="w-96 rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-bold text-foreground">Eliminar equipo</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              ¿Eliminar <strong className="text-foreground">{eqDeleteTarget.name}</strong> permanentemente? Se moverá a la papelera. Ingresa la clave de edición para confirmar.
            </p>
            <input
              type="password"
              value={eqDeleteClave}
              onChange={(e) => { setEqDeleteClave(e.target.value); setEqDeleteError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmEquipDelete() }}
              placeholder="Clave de edición…"
              className="mb-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              autoFocus
            />
            {eqDeleteError && <p className="mb-2 text-xs text-red-400">{eqDeleteError}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEqDeleteTarget(null)} className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground">Cancelar</button>
              <button onClick={confirmEquipDelete} disabled={eqDeleting || !eqDeleteClave.trim()} className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50">
                {eqDeleting ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* G2: selector de lista para favoritos de EQUIPOS (clic en la estrella de una tarjeta) */}
      <Dialog open={!!favEquipPicker} onOpenChange={(o) => { if (!o) { setFavEquipPicker(null); setNewEquipListName('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Agregar a lista de equipos</DialogTitle>
            <DialogDescription className="truncate">{favEquipPicker?.displayName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            {equipFavLists.length === 0 && <p className="text-xs text-muted-foreground">Aún no tienes listas. Crea una abajo.</p>}
            {equipFavLists.map((l) => (
              <button
                key={l.name}
                onClick={() => favEquipPicker && addEquipToList(l.name, favEquipPicker.machineId, favEquipPicker.displayName)}
                className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-muted/40 hover:border-primary/40"
              >
                <Star className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="flex-1 truncate">{l.name}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{l.machineIds.length}</span>
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); if (favEquipPicker && newEquipListName.trim()) addEquipToList(newEquipListName, favEquipPicker.machineId, favEquipPicker.displayName) }}
            className="mt-2 flex gap-2"
          >
            <Input value={newEquipListName} onChange={(e) => setNewEquipListName(e.target.value)} placeholder="Nueva lista…" className="h-8 text-xs" />
            <Button type="submit" size="sm" disabled={!newEquipListName.trim()} className="h-8">Crear</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* G1+G5: fotos y manuales del equipo SAP (clic en una tarjeta de la sección admin) */}
      <Dialog open={!!photoEquip} onOpenChange={(o) => !o && setPhotoEquip(null)}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Equipo · {photoEquip?.name}</DialogTitle>
            <DialogDescription className="truncate">Fotos y manuales del equipo.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            {photoEquip && <EquipmentHeaderPhoto equipmentId={photoEquip.id} />}
            <p className="text-xs text-muted-foreground">Toca la miniatura para ampliar (zoom/paneo) o la cámara para subir una foto del equipo desde el celular.</p>
          </div>
          {/* G5: manuales PDF a nivel equipo (nodo hierarchy) */}
          {photoEquip && (
            <div className="mt-2 border-t border-border pt-3">
              <MachineManualPanel storageId={photoEquip.id} displayName={photoEquip.name} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
