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
import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from 'react'
import { Search, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Cog, ImageOff, Plus, ClipboardList, Menu, History, Trash2, Star, Download, X, MoreVertical, Copy, Check, Package, PackageCheck, PackageMinus, PackageX, GripVertical, Boxes, Wrench, Settings2 } from 'lucide-react'
import { isCommonPartSap, machinesForCommonSap } from '@/data/commonPartsByMachine'
import { findMachineBySlug, LEARNING_MACHINES, isCourseMachine } from '@/data/learningMachines'
import { Badge, Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui'
import { AreaSidebar } from '@/components/repuestos/AreaSidebar'
import { RepuestoDetailPanel } from '@/components/repuestos/RepuestoDetailPanel'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { SolicitarRepuestoModal, type RepuestoLite } from '@/components/repuestos/SolicitarRepuestoModal'
import { SolicitudesPanel } from '@/components/repuestos/SolicitudesPanel'
import { useSolicitudes, type SolicitudEstado } from '@/hooks/repuestos/useSolicitudes'
import { useAuthStore, useIsAdmin } from '@/store/authStore'
import { AuditLogPanel } from '@/components/repuestos/AuditLogPanel'
import { TrashPanel } from '@/components/repuestos/TrashPanel'
import { getTrashCount } from '@/services/auditLog'
import { useHierarchyAreaTree, type AreaTreeNode } from '@/hooks/useHierarchyAreaTree'
import { useGlobalSearch, invalidateGlobalRepuestosCache, type GlobalSearchResult } from '@/hooks/repuestos/useGlobalSearch'
import { useGlobalEquipmentSearch, getGlobalEquipmentCache } from '@/hooks/useGlobalEquipmentSearch'
import { useBodega } from '@/hooks/repuestos/useBodega'
import { useAreaRepuestos, type StockStatus, type AreaRepuestoRow } from '@/hooks/repuestos/useAreaRepuestos'
import { useHierarchyPaths } from '@/hooks/repuestos/useHierarchyPaths'
import { useManualesDeEquipos } from '@/hooks/repuestos/useManualesDeEquipos'
import { getRepuestoFavs, saveRepuestoFavs, getRepuestoFavListsGlobal, saveRepuestoFavListsGlobal, getUserPreferences, saveFavoriteLists, type RepuestoFavList, type FavList } from '@/services/userPreferences'
import { useRepuestoCrud } from '@/hooks/repuestos/useRepuestoCrud'
import { useToast } from '@/hooks/useToast'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { TechnicalSpecsModal } from '@/components/repuestos/TechnicalSpecsModal'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { ExportReportModal } from '@/components/repuestos/ExportReportModal'
import { normalizeForSearch } from '@/utils/repuestos'
import { InlineEditName } from '@/components/repuestos/InlineEditName'
import { CLASE_LABEL, type MaterialClase, type Machine, type Repuesto, type RepuestoFormData, type TechnicalSpecs, type MachineImage } from '@/types/repuestos'

// Fase 4 normalización (2026-06): el hub lee/escribe la colección plana `repuestos`
// (equipos:[nodeIds]). Quedan para Fase 5: reubicar/importar/duplicados/manuales de
// equipo (eran machine-bound) reimplementados sobre el modelo plano.
type RepAction = 'edit' | 'specs' | 'photos' | 'manual' | 'delete'
type SortCol = 'codigoSAP' | 'codigoFabricante' | 'textoBreve' | 'equipo' | 'stock' | 'tipo'

type StockFilter = 'all' | StockStatus
const PAGE_SIZES = [8, 25, 50]

const STORAGE_KEY = 'repuestos-nav-node' // compartido con EquipmentNavigator

/** Etiqueta de tipo de repuesto (texto libre del catálogo); vacío → "Sin clasificar". */
const tipoLabelOf = (tipo?: string): string => (tipo || '').trim() || 'Sin clasificar'

const STOCK_META: Record<StockStatus, { label: string; dot: string; text: string }> = {
  ok: { label: 'Disponible', dot: 'bg-emerald-500', text: 'text-emerald-500' },
  low: { label: 'Bajo', dot: 'bg-amber-500', text: 'text-amber-500' },
  out: { label: 'Sin stock', dot: 'bg-red-500', text: 'text-red-500' },
  unset: { label: 'Sin config', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
}

type KpiTone = 'primary' | 'emerald' | 'amber' | 'red'

const KPI_TONE: Record<KpiTone, { text: string; chip: string; ring: string; glow: string }> = {
  primary: { text: 'text-primary',      chip: 'bg-primary/10',      ring: 'ring-primary/20',      glow: 'from-primary/[0.07]' },
  emerald: { text: 'text-emerald-500',  chip: 'bg-emerald-500/10',  ring: 'ring-emerald-500/20',  glow: 'from-emerald-500/[0.07]' },
  amber:   { text: 'text-amber-500',    chip: 'bg-amber-500/10',    ring: 'ring-amber-500/20',    glow: 'from-amber-500/[0.07]' },
  red:     { text: 'text-red-500',      chip: 'bg-red-500/10',      ring: 'ring-red-500/20',      glow: 'from-red-500/[0.07]' },
}

function KpiCard({ value, label, hint, icon: Icon, tone }: {
  value: string | number; label: string; hint?: string; icon: typeof Package; tone: KpiTone
}) {
  const t = KPI_TONE[tone]
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/15 sm:p-4">
      {/* tinte sutil de estado */}
      <div className={['pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent', t.glow].join(' ')} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={['text-2xl font-bold leading-none tracking-tight tabular-nums sm:text-[27px]', t.text].join(' ')}>{value}</div>
          <div className="mt-1.5 truncate text-[11px] font-medium text-muted-foreground sm:text-xs">{label}</div>
        </div>
        <div className={['flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', t.chip, t.ring].join(' ')}>
          <Icon className={['h-[18px] w-[18px]', t.text].join(' ')} strokeWidth={2.25} />
        </div>
      </div>
      {hint && <div className="relative mt-2.5 text-[10px] font-medium text-muted-foreground/70">{hint}</div>}
    </div>
  )
}

/** Prellenado de creación al llegar desde la pestaña Códigos fabricante. */
export interface PendingCreateRepuesto {
  codigoFabricante: string
  textoBreve: string
  descripcion: string
  equipoNodeIds: string[]
  equipoCodigos: string[]
  equipoNombre: string
}

interface RepuestosAreaHubProps {
  /** Query inicial (al saltar desde "Buscar similar" de otras vistas). */
  initialQuery?: string
  onQueryConsumed?: () => void
  /** Abrir el form de crear repuesto prellenado (desde Códigos fabricante). */
  pendingCreate?: PendingCreateRepuesto | null
  onPendingCreateConsumed?: () => void
}

export function RepuestosAreaHub({ initialQuery, onQueryConsumed, pendingCreate, onPendingCreateConsumed }: RepuestosAreaHubProps = {}) {
  const { areaTree, findNode, getNodePath, expandNode } = useHierarchyAreaTree()

  // El catálogo (colección plana `repuestos`) referencia nodos de hierarchy por id;
  // el equipment cache aporta nombre/alias/path de cada nodo-equipo.
  const { loading: eqLoading } = useGlobalEquipmentSearch('', 999)
  const { isUnder, loading: pathsLoading } = useHierarchyPaths()

  // "machines" = nodos-equipo de hierarchy (modelo plano: r.equipos[] = nodeIds).
  // machineAreas: nodeId → Set(ancestros) para pertenencia a áreas (cada nodo trae path).
  const { machines, machineAreas } = useMemo(() => {
    const eq = getGlobalEquipmentCache() || []
    const machinesMap = new Map<string, Machine>()
    const areas = new Map<string, Set<string>>()
    for (const e of eq) {
      if (e.oculto) continue
      machinesMap.set(e.id, {
        id: e.id, nombre: e.alias || e.nombre || e.id, marca: '', modelo: '',
        activa: true, color: '#6b7280', orden: 0, createdAt: new Date(),
      } as Machine)
      let set = areas.get(e.id)
      if (!set) { set = new Set<string>(); areas.set(e.id, set) }
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

  // Equipos agrupados por MODELO: quita el sufijo de línea " N1/N2/N3" del nombre.
  // Todas las instancias del mismo modelo comparten repuestos (N:M), así el picker
  // de "+ Repuesto" muestra una sola fila "KNURO · 6 equipos" en vez de las 6 hojas,
  // y al elegirla asocia el material a TODAS las instancias.
  const equipoModelGroups = useMemo(() => {
    const stripInstance = (s: string) => s.replace(/\s+[Nn][°º]?\s*\d+\s*$/, '').trim()
    const groups = new Map<string, { key: string; label: string; nodeIds: string[]; codigos: string[] }>()
    for (const e of (getGlobalEquipmentCache() || [])) {
      if (e.oculto) continue
      const display = e.alias || e.nombre || e.id
      const labelBase = stripInstance(display) || display
      const key = normalizeForSearch(labelBase)
      let g = groups.get(key)
      if (!g) { g = { key, label: labelBase, nodeIds: [], codigos: [] }; groups.set(key, g) }
      g.nodeIds.push(e.id)
      if (e.codigo) g.codigos.push(e.codigo)
    }
    return [...groups.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eqLoading])

  const { allRepuestos, loadAll, loadArea, loaded: repuestosLoaded, loading: repuestosLoading } = useGlobalSearch(machines)
  // allItems = TODOS los repuestos del área (con y sin SAP); el stock se engancha si hay SAP.
  const { allItems: bodegaItems, loading: bodegaLoading, loadMovimientos, saveStock, registrarMovimiento, registrarConteoRapido } = useBodega(allRepuestos)

  // membership repuesto(machineId) → área: vía equipment cache, con fallback a ancestría directa
  const machineInArea = useCallback(
    (machineId: string, areaId: string) => machineAreas.get(machineId)?.has(areaId) ?? isUnder(machineId, areaId),
    [machineAreas, isUnder],
  )

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(() => {
    try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
  })
  const [showingAll, setShowingAll] = useState(false)

  // Carga de datos: si el usuario mira un área puntual, traer SOLO esa área
  // (query por `areaIds`) en vez del maestro completo (~7.700 docs) — el
  // aterrizaje típico del módulo. "Todas las áreas" o sin área elegida aún
  // (primera visita, sin preferencia guardada) siguen usando el catálogo
  // completo, que además deja tibio el caché para cualquier área futura.
  useEffect(() => {
    if (!machines.length) return
    if (showingAll || !selectedAreaId) {
      loadAll()
    } else {
      loadArea(selectedAreaId)
    }
  }, [machines, showingAll, selectedAreaId, loadAll, loadArea])
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>(() => {
    try { const s = localStorage.getItem('repuestos-open-nodes'); return s ? (JSON.parse(s) as Record<string, boolean>) : {} } catch { return {} }
  })
  // Recordar la posición del árbol entre recargas (solo las ramas abiertas).
  useEffect(() => {
    try {
      const open = Object.fromEntries(Object.entries(openNodes).filter(([, v]) => v))
      localStorage.setItem('repuestos-open-nodes', JSON.stringify(open))
    } catch { /* noop */ }
  }, [openNodes])
  // Contraer todo el árbol de un golpe.
  const collapseAllNodes = useCallback(() => setOpenNodes({}), [])
  // Equipo seleccionado desde el sidebar / chips de favoritos (clave = linkedMachineId || nodeId) para resaltarlo.
  const [selectedEquipKey, setSelectedEquipKey] = useState<string | null>(null)
  // Nombre del equipo seleccionado, para mostrarlo como título (en vez del área).
  const [selectedEquipName, setSelectedEquipName] = useState<string>('')
  // machineId/nodeId del equipo enfocado → acotar repuestos por IDENTIDAD (no por nombre).
  const [selectedEquipMachineId, setSelectedEquipMachineId] = useState<string | null>(null)

  // Filtros + paginación de la tabla de repuestos
  const [repQuery, setRepQuery] = useState('')
  // Al empezar a buscar, llevar la lista a la vista: el aterrizaje del área
  // deja al usuario scrolleado en el dashboard y los resultados aparecían
  // "abajo", fuera de pantalla (se notaba sobre todo en móvil).
  const listSectionRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!repQuery.trim()) return
    listSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [repQuery])
  const [repEquipoFilter, setRepEquipoFilter] = useState<string>('all')
  // Móvil: KPIs y filtros arrancan colapsados — entre el usuario y la primera
  // fila de repuestos había ~2 pantallas de dashboard. En desktop no aplica.
  const [mobileExtrasOpen, setMobileExtrasOpen] = useState(false)
  const [repStockFilter, setRepStockFilter] = useState<StockFilter>('all')
  const [repTipoFilter, setRepTipoFilter] = useState<string>('all')
  const [repClaseFilter, setRepClaseFilter] = useState<string>('all')
  // Foco SAP: por defecto solo se muestran los materiales con código SAP (los
  // ordenables / que se usan en el sistema). El despiece sin SAP (capa de
  // referencia) queda detrás de este interruptor.
  const [repSoloSap, setRepSoloSap] = useState(true)
  const [repPage, setRepPage] = useState(0)
  const [repPageSize, setRepPageSize] = useState(25)

  // Repuesto seleccionado → panel lateral de detalle
  // Selección por rowKey estable (NO codigoSAP: vacío en repuestos sin SAP → colisiona).
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)


  // Lightbox de fotos desde la miniatura de la fila (sin pasar por el detalle)
  const [rowLightbox, setRowLightbox] = useState<string[] | null>(null)
  // rowKey cuyo SAP se acaba de copiar (feedback ✓ en la fila)
  const [copiedSapKey, setCopiedSapKey] = useState<string | null>(null)
  const copySapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copySapFromRow = useCallback((rowKey: string, sap: string) => {
    if (!sap) return
    navigator.clipboard?.writeText(sap).then(() => {
      setCopiedSapKey(rowKey)
      if (copySapTimer.current) clearTimeout(copySapTimer.current)
      copySapTimer.current = setTimeout(() => setCopiedSapKey(null), 1500)
    }).catch(() => {})
  }, [])
  useEffect(() => () => { if (copySapTimer.current) clearTimeout(copySapTimer.current) }, [])

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
  const [auditLogOpen, setAuditLogOpen] = useState(false)
  const [trashOpen, setTrashOpen] = useState(false)
  const [trashCount, setTrashCount] = useState(0)
  const [adminMenuOpen, setAdminMenuOpen] = useState(false) // overflow herramientas admin (móvil)

  // ── Acciones por repuesto (Wave 1: rescate de "Por equipo") ──
  const { toast } = useToast()
  const { createRepuesto: crudCreate, updateRepuesto: crudUpdate, deleteRepuesto: crudDelete } = useRepuestoCrud()

  // Avanzar solicitud a "entregada" → descuenta stock real de bodega (si el SAP ya está
  // configurado ahí). Sin esto, "Entregar" era solo una etiqueta que no tocaba el inventario.
  // Si no hay bodega configurada para el SAP, no se inventa un registro (evita el latente
  // rechazo de firestore.rules por ubicacionBodega vacía) — solo avanza el estado igual.
  const handleAvanzarSolicitud = useCallback(
    async (id: string, next: SolicitudEstado) => {
      if (next === 'entregada' && user) {
        const sol = solicitudes.find((s) => s.id === id)
        const item = sol ? bodegaItems.find((b) => b.codigoSAP === sol.codigoSAP) : undefined
        if (sol && item?.bodegaId) {
          try {
            await registrarMovimiento(
              item,
              { tipo: 'salida', cantidad: sol.cantidad, motivo: `Entrega solicitud · ${sol.solicitadoPorNombre || 'usuario'}` },
              user.id,
              user.nombre,
            )
            toast({ title: 'Stock descontado', description: `-${sol.cantidad} ${item.textoBreve || item.codigoSAP}`, variant: 'success' })
          } catch {
            toast({ title: 'No se pudo descontar el stock', description: 'La solicitud sigue pendiente de entrega — reintenta.', variant: 'destructive' })
            return // no avanzar a "entregada" si el descuento de stock falló
          }
        }
      }
      await avanzarEstado(id, next)
    },
    [solicitudes, bodegaItems, user, registrarMovimiento, avanzarEstado, toast],
  )
  const [actionTarget, setActionTarget] = useState<{ kind: RepAction; source: GlobalSearchResult } | null>(null)
  const [equipoPicker, setEquipoPicker] = useState<{ kind: RepAction; sources: GlobalSearchResult[] } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  /** Equipos destino del nuevo repuesto (N:M): nodeIds + códigos + etiqueta legible. */
  const [createTargetEquipos, setCreateTargetEquipos] = useState<{ nodeIds: string[]; codigos: string[]; label: string } | null>(null)
  const [createPicker, setCreatePicker] = useState(false)
  /** El "+ Repuesto" en curso es un material transversal (sin equipo): insumo/herramienta. */
  const [createTransversal, setCreateTransversal] = useState(false)
  /** Búsqueda del equipo destino en el picker de "+ Repuesto" (sobre toda la planta). */
  const [createEquipoQuery, setCreateEquipoQuery] = useState('')
  /** Modelos de equipo seleccionados en el picker (claves de equipoModelGroups) — multi N:M. */
  const [createEquipoSel, setCreateEquipoSel] = useState<Set<string>>(new Set())
  /** Datos prellenados del form de crear (al venir desde Códigos fabricante). */
  const [createInitial, setCreateInitial] = useState<Repuesto | null>(null)
  const [savingRep, setSavingRep] = useState(false)
  // Asignar SAP a una pieza de despiece (sin SAP → ordenable). Fase 6.
  const [asignarSapOpen, setAsignarSapOpen] = useState(false)
  const [asignarSapValue, setAsignarSapValue] = useState('')
  const [asignarSapSaving, setAsignarSapSaving] = useState(false)
  // Asignar/añadir un equipo donde se usa el material (N:M). Fase 6.
  const [asignarEquipoOpen, setAsignarEquipoOpen] = useState(false)
  const [asignarEquipoQuery, setAsignarEquipoQuery] = useState('')
  const [asignarEquipoSaving, setAsignarEquipoSaving] = useState(false)

  // ── Exportar (Wave 3) ──
  const [exportOpen, setExportOpen] = useState(false)

  // ── Favoritos de repuestos (globales por usuario, keyed por rowKey) ──
  const [favKeys, setFavKeys] = useState<Set<string>>(new Set())
  const [repFavOnly, setRepFavOnly] = useState(false)
  // Filtro "Comunes": repuestos de la lista curada COMPARTIDA (commonPartsByMachine
  // estática + marca `comunEn` del doc), la misma que se ve en la pestaña "Repuestos
  // comunes" del Aprendizaje. Distinto de los favoritos (personales por usuario).
  const [repComunOnly, setRepComunOnly] = useState(false)
  // Picker "marcar como común de [máquina]" (abierto desde el panel de detalle).
  const [comunPickerOpen, setComunPickerOpen] = useState(false)
  const [comunQuery, setComunQuery] = useState('')
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
  // Reordenar por drag-and-drop: mueve el item de `from` a la posición `to`.
  const reorderEquipInList = useCallback((listName: string, from: number, to: number) => {
    if (from === to) return
    persistEquipLists(equipFavLists.map((l) => {
      if (l.name !== listName) return l
      if (from < 0 || from >= l.machineIds.length || to < 0 || to >= l.machineIds.length) return l
      const ids = [...l.machineIds]
      const [moved] = ids.splice(from, 1)
      ids.splice(to, 0, moved!)
      return { ...l, machineIds: ids }
    }))
  }, [equipFavLists, persistEquipLists])
  const [dragFav, setDragFav] = useState<{ list: string; idx: number } | null>(null)

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
  const handleFavEquipClick = useCallback((favKey: string, displayName?: string, areaIdHint?: string | null) => {
    const eq = getGlobalEquipmentCache() || []
    const e = eq.find((x) => (x.linkedMachineId || x.id) === favKey) || eq.find((x) => x.id === favKey)
    // areaIdHint: el área que el sidebar ya conoce (no depende del cache). Si no
    // viene (chips de favoritos), se deriva del cache de equipos.
    const areaId = areaIdHint || e?.parentId || (e?.path && e.path.length ? e.path[e.path.length - 1] : null)
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
    const m = machines.find((x) => x.id === (e?.id ?? favKey))
    setRepEquipoFilter(m ? m.nombre : 'all')
    // Clave = id del NODO del equipo (para resaltarlo en el sidebar).
    setSelectedEquipKey(e?.id ?? favKey)
    // Identidad del equipo en el modelo plano = nodeId (clave de r.equipos[].machineId).
    // favKey puede ser un linkedMachineId legacy (favoritos viejos) → traducir al nodo.
    setSelectedEquipMachineId(e?.id ?? favKey)
    setSelectedEquipName(displayName || (e as { alias?: string } | undefined)?.alias || e?.nombre || (m ? m.nombre : favKey))
    setSelectedRowKey(null)
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

  // (Fase 4 normalización) La sección "Motores y bombas" desapareció: los motores/
  // bombas físicos del levantamiento ahora son REPUESTOS de la colección plana
  // (con marca/modelo/foto) y aparecen en la tabla como cualquier otro repuesto.

  // "Buscar similar" desde otras vistas → cargar query en la búsqueda global del hub
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) {
      setRepQuery(initialQuery)
      setShowingAll(true)
      onQueryConsumed?.()
    }
  }, [initialQuery, onQueryConsumed])

  // "Agregar a repuestos" desde Códigos fabricante → abrir el form de crear prellenado.
  // Con equipo conocido (GEA/Baader) va directo al form; sin equipo (Marel) pasa
  // primero por el picker para que el usuario confirme el equipo.
  useEffect(() => {
    if (!pendingCreate) return
    setCreateInitial({
      codigoFabricante: pendingCreate.codigoFabricante,
      textoBreve: pendingCreate.textoBreve,
      descripcion: pendingCreate.descripcion,
      clase: 'repuesto',
    } as Repuesto)
    setCreateTransversal(false)
    if (pendingCreate.equipoNodeIds.length > 0) {
      setCreateTargetEquipos({
        nodeIds: pendingCreate.equipoNodeIds,
        codigos: pendingCreate.equipoCodigos,
        label: pendingCreate.equipoNombre || 'Equipo',
      })
      setCreateOpen(true)
    } else {
      // Marel: sin mapeo fijo → el usuario elige el equipo en el picker.
      setCreateTargetEquipos(null)
      setCreateEquipoSel(new Set())
      setCreateEquipoQuery('')
      setCreatePicker(true)
    }
    onPendingCreateConsumed?.()
  }, [pendingCreate, onPendingCreateConsumed])

  // Repuestos del área (catálogo + bodega) y KPIs de stock derivados
  const areaRepuestos = useAreaRepuestos(bodegaItems, { showingAll, selectedAreaId, machineInArea })

  // Repuestos en el alcance actual: si hay un equipo seleccionado (filtro de equipo
  // activo), todo el panel (KPIs, cobertura, tipos, tabla) se reduce a ese equipo.
  const scopedRepuestos = useMemo(() => {
    // Equipo enfocado (clic en sidebar/favoritos): acotar por IDENTIDAD del equipo
    // (machineId/nodeId), no por nombre. Si el equipo no tiene repuestos propios →
    // lista vacía (NUNCA los del área). Evita que un equipo sin máquina vinculada
    // herede los repuestos del área (p.ej. BOTE TRASLADOS mostrando la bomba de BOMBA AGUA MAR).
    if (selectedEquipKey) {
      return areaRepuestos.filter((r) => r.equipos.some((e) => e.machineId === selectedEquipMachineId))
    }
    if (repEquipoFilter === 'all') return areaRepuestos
    return areaRepuestos.filter((r) => r.equipos.some((e) => e.machineName === repEquipoFilter))
  }, [areaRepuestos, selectedEquipKey, selectedEquipMachineId, repEquipoFilter])

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
    const claseCount = new Map<MaterialClase, number>()
    for (const r of scopedRepuestos) {
      if (r.codigoSAP) conSAP++
      tipos.add(tipoLabelOf(r.tipo))
      valor += (r.costoCompra ?? r.valorUnitario ?? 0) * (r.stockActual || 0)
      if (r.clase) claseCount.set(r.clase, (claseCount.get(r.clase) ?? 0) + 1)
    }
    const total = scopedRepuestos.length
    // Desglose por clase, ordenado por frecuencia (para la línea de composición del header)
    const clases = [...claseCount.entries()]
      .map(([clase, count]) => ({ clase, count }))
      .sort((a, b) => b.count - a.count)
    return {
      conSAP,
      sinSAP: total - conSAP,
      pctSAP: total > 0 ? Math.round((conSAP / total) * 100) : 0,
      tipos: tipos.size,
      valor,
      clases,
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

  // Opciones del filtro "Clase" (repuesto/insumo/herramienta/…) con conteo.
  const claseOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of scopedRepuestos) {
      const c = r.clase || 'repuesto'
      counts.set(c, (counts.get(c) ?? 0) + 1)
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
  // NOTA: NO incluye el foco SAP — eso se aplica después, para poder contar el
  // despiece oculto y mostrarlo en el interruptor.
  const filteredBase = useMemo(() => {
    let res = scopedRepuestos
    if (repFavOnly) res = res.filter((r) => favKeys.has(r.rowKey))
    if (repComunOnly) res = res.filter((r) => isCommonPartSap(r.codigoSAP) || (r.comunEn?.length ?? 0) > 0)
    if (listFilter !== 'all') {
      const l = favLists.find((x) => x.name === listFilter)
      const ids = new Set(l?.repuestoIds ?? [])
      res = res.filter((r) => ids.has(r.rowKey))
    }
    if (repStockFilter !== 'all') res = res.filter((r) => r.stockStatus === repStockFilter)
    if (repClaseFilter !== 'all') res = res.filter((r) => (r.clase || 'repuesto') === repClaseFilter)
    if (repTipoFilter !== 'all') res = res.filter((r) => tipoLabelOf(r.tipo) === repTipoFilter)
    // Multi-término con AND sobre el haystack unido: permite "máquina + pieza"
    // ("baader casquillo", "gea sello") — el flujo natural del usuario en planta.
    const terms = normalizeForSearch(repQuery).split(/\s+/).filter(Boolean)
    if (terms.length) {
      res = res.filter((r) => {
        const hay = normalizeForSearch(
          [
            r.codigoSAP,
            r.textoBreve,
            r.codigoFabricante,
            r.alias ?? '',
            (r.nombresComunes ?? []).join(' '),
            r.marca ?? '',
            r.modeloTipo ?? '',
            r.descripcion ?? '',
            tipoLabelOf(r.tipo),
            ...r.equipos.map((e) => e.machineName),
          ].join(' '),
        )
        return terms.every((t) => hay.includes(t))
      })
    }
    return res
  }, [scopedRepuestos, repFavOnly, repComunOnly, favKeys, listFilter, favLists, repStockFilter, repClaseFilter, repTipoFilter, repQuery])

  // Cuántos comunes hay en el alcance actual (lista estática por SAP + marca comunEn).
  const comunesEnScope = useMemo(
    () => scopedRepuestos.reduce((n, r) => n + (isCommonPartSap(r.codigoSAP) || (r.comunEn?.length ?? 0) > 0 ? 1 : 0), 0),
    [scopedRepuestos],
  )

  // Foco SAP: oculta el despiece sin código SAP (default). El conteo de lo oculto
  // alimenta el interruptor "ver despiece".
  const filteredRep = useMemo(
    () => (repSoloSap ? filteredBase.filter((r) => !!r.codigoSAP) : filteredBase),
    [filteredBase, repSoloSap],
  )
  const despieceOcultos = useMemo(
    () => (repSoloSap ? filteredBase.reduce((n, r) => n + (r.codigoSAP ? 0 : 1), 0) : 0),
    [filteredBase, repSoloSap],
  )

  // Filtros NO-default activos — badge del botón "Filtros" en móvil (los
  // filtros arrancan colapsados; sin el conteo, un filtro activo escondido
  // haría "desaparecer" repuestos sin explicación). `repSoloSap` no cuenta:
  // true ES el default.
  const filtrosActivos =
    (repEquipoFilter !== 'all' ? 1 : 0) +
    (repClaseFilter !== 'all' ? 1 : 0) +
    (repTipoFilter !== 'all' ? 1 : 0) +
    (repStockFilter !== 'all' ? 1 : 0) +
    (!repSoloSap ? 1 : 0) +
    (repFavOnly ? 1 : 0) +
    (repComunOnly ? 1 : 0) +
    (listFilter !== 'all' ? 1 : 0)

  // Reset de página al cambiar área/filtros
  useEffect(() => { setRepPage(0) }, [selectedAreaId, showingAll, repQuery, repEquipoFilter, repStockFilter, repClaseFilter, repTipoFilter, repSoloSap, repFavOnly, repComunOnly, listFilter, repPageSize])

  // Si la búsqueda/filtros dejan fuera al repuesto seleccionado, cerrar el panel
  // de detalle: evita que quede "pegado" mostrando un repuesto que ya no está
  // en los resultados (p.ej. buscar otra pieza con el panel abierto).
  useEffect(() => {
    if (selectedRowKey && !filteredRep.some((r) => r.rowKey === selectedRowKey)) {
      setSelectedRowKey(null)
    }
  }, [filteredRep, selectedRowKey])

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
    // Tiering SAP-first (modelo unificado): los materiales con código SAP
    // (ordenables, en bodega) van primero; las piezas de despiece sin SAP, después.
    // Partición estable → conserva el orden interno (relevancia/alfabético).
    const tierFirst = (arr: AreaRepuestoRow[]): AreaRepuestoRow[] => {
      const con: AreaRepuestoRow[] = [], sin: AreaRepuestoRow[] = []
      for (const r of arr) (r.codigoSAP ? con : sin).push(r)
      return sin.length ? [...con, ...sin] : con
    }
    // Sin sort manual de columna pero CON búsqueda activa → ordenar por relevancia:
    // SAP exacto > SAP empieza-con > nombre contiene todos los términos > resto.
    // Así el match directo de un código nunca queda enterrado en la paginación.
    if (!repSortColumn) {
      const q = normalizeForSearch(repQuery)
      const terms = q.split(/\s+/).filter(Boolean)
      if (!terms.length) return tierFirst(filteredRep)
      const score = (r: AreaRepuestoRow): number => {
        const sap = normalizeForSearch(r.codigoSAP)
        if (sap && sap === q) return 0
        if (sap && sap.startsWith(q)) return 1
        const nombre = normalizeForSearch(`${r.textoBreve} ${r.alias ?? ''} ${(r.nombresComunes ?? []).join(' ')}`)
        if (terms.every((t) => nombre.includes(t))) return 2
        return 3
      }
      return tierFirst([...filteredRep].sort((a, b) => {
        const d = score(a) - score(b)
        return d !== 0 ? d : a.textoBreve.localeCompare(b.textoBreve, 'es')
      }))
    }
    const dir = repSortDir === 'asc' ? 1 : -1
    const val = (r: AreaRepuestoRow): string | number => {
      switch (repSortColumn) {
        case 'codigoSAP': return r.codigoSAP || ''
        case 'codigoFabricante': return r.codigoFabricante || ''
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
  }, [filteredRep, repSortColumn, repSortDir, repQuery])

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

  /**
   * Conteo físico desde la ficha del repuesto (reemplaza a la pestaña Bodega).
   * Fija el stock a lo contado (0 = "no había") y lo deja trazado; con eso el
   * filtro "Sin stock" / "Bajo" de esta misma pestaña pasa a ser confiable.
   */
  const handleContar = useCallback(
    async (contado: number) => {
      if (!selectedRep) return
      const sap = selectedRep.codigoSAP?.trim()
      if (!sap) {
        toast({ variant: 'destructive', title: 'Sin código SAP', description: 'El stock se guarda por SAP: asígnale uno antes de contarlo.' })
        return
      }
      const base = bodegaItems.find((b) => b.codigoSAP === sap) ?? selectedRep
      const nombre = [user?.nombre, user?.apellido].filter(Boolean).join(' ') || user?.email || 'Sin nombre'
      try {
        await registrarConteoRapido(base, contado, user?.id ?? '', nombre)
        toast({ title: contado === 0 ? 'Conteo guardado: no había stock' : `Conteo guardado: ${contado}`, variant: 'success' })
      } catch (err) {
        toast({ variant: 'destructive', title: 'No se pudo guardar el conteo', description: err instanceof Error ? err.message : '' })
      }
    },
    [selectedRep, bodegaItems, registrarConteoRapido, user, toast],
  )

  // ══════════════════════════════════════════════════════════════════
  //  Acciones por repuesto (Wave 1) — resolver el doc subyacente desde
  //  la fila AGREGADA. Una fila puede mapear a >1 doc (mismo SAP en
  //  varios equipos). La fuente real son los `allRepuestos` de useGlobalSearch.
  // ══════════════════════════════════════════════════════════════════

  // Modelo plano: todos los repuestos viven en la colección top-level `repuestos`.
  const colPathOf = useCallback((_mId: string) => 'repuestos', [])

  // Resuelve los docs Repuesto subyacentes a una fila (mismo criterio de clave que
  // useBodega). En el modelo plano un doc aparece una vez por equipo → dedup por id
  // (las acciones se aplican UNA vez al doc, no por equipo).
  const resolveSources = useCallback(
    (row: AreaRepuestoRow): GlobalSearchResult[] => {
      const dedupById = (arr: GlobalSearchResult[]): GlobalSearchResult[] => {
        const seen = new Set<string>()
        return arr.filter((r) => (seen.has(r.repuesto.id) ? false : (seen.add(r.repuesto.id), true)))
      }
      const sap = (row.codigoSAP || '').trim()
      if (sap) return dedupById(allRepuestos.filter((r) => (r.repuesto.codigoSAP || '').trim() === sap))
      const fab = (row.codigoFabricante || '').trim()
      if (fab) {
        return dedupById(allRepuestos.filter(
          (r) => !(r.repuesto.codigoSAP || '').trim() && (r.repuesto.codigoFabricante || '').trim() === fab,
        ))
      }
      return dedupById(allRepuestos.filter(
        (r) =>
          !(r.repuesto.codigoSAP || '').trim() &&
          !(r.repuesto.codigoFabricante || '').trim() &&
          r.repuesto.textoBreve === row.textoBreve &&
          row.equipos.some((e) => e.machineId === r.machineId),
      ))
    },
    [allRepuestos],
  )

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

  // ── Nombres comunes (apodos): edición inline en la tabla (lg+) y desde el
  // panel de detalle (único camino en móvil, donde la columna no existe) ──
  const [editApodosKey, setEditApodosKey] = useState<string | null>(null)
  const [editApodosVal, setEditApodosVal] = useState('')
  const [savingApodos, setSavingApodos] = useState(false)
  const persistApodos = useCallback(
    async (row: AreaRepuestoRow, arr: string[]) => {
      setSavingApodos(true)
      try {
        const sources = resolveSources(row)
        for (const s of sources) {
          await crudUpdate(colPathOf(s.machineId), s.repuesto.id, { nombresComunes: arr }, s.repuesto)
        }
        await refreshCatalog()
        toast({ title: 'Nombres comunes guardados' })
      } catch {
        toast({ variant: 'destructive', title: 'No se pudo guardar', description: 'Reintenta en un momento.' })
      } finally {
        setSavingApodos(false)
      }
    },
    [resolveSources, crudUpdate, colPathOf, refreshCatalog, toast],
  )
  const saveApodos = useCallback(
    async (row: AreaRepuestoRow) => {
      await persistApodos(row, editApodosVal.split(',').map((s) => s.trim()).filter(Boolean))
      setEditApodosKey(null)
    },
    [editApodosVal, persistApodos],
  )

  // Asignar código SAP a una pieza de despiece (sin SAP). Si el SAP ya existe en
  // el maestro → fusiona (une equipos) y borra el despiece; si no, lo vuelve
  // ordenable seteando codigoSAP/tieneSap en el mismo doc.
  const handleAsignarSap = useCallback(
    async (sapRaw: string) => {
      if (!selectedRep) return
      const sap = sapRaw.trim()
      if (!/^\d{6,}$/.test(sap)) {
        toast({ variant: 'destructive', title: 'Código SAP inválido', description: 'Debe ser numérico de 6 o más dígitos.' })
        return
      }
      const src = resolveSources(selectedRep)[0]
      if (!src) { toast({ variant: 'destructive', title: 'No se encontró la pieza base' }); return }
      setAsignarSapSaving(true)
      try {
        const despiece = src.repuesto
        const target = allRepuestos.find((r) => (r.repuesto.codigoSAP || '').trim() === sap && r.repuesto.id !== despiece.id)?.repuesto
        if (target) {
          const equipos = [...new Set([...(target.equipos || []), ...(despiece.equipos || [])])]
          const equiposCodigos = [...new Set([...(target.equiposCodigos || []), ...(despiece.equiposCodigos || [])])]
          await crudUpdate('repuestos', target.id, { equipos, equiposCodigos }, target)
          await crudDelete('repuestos', despiece.id)
          toast({ title: 'Fusionado con material existente', description: `Ahora SAP ${sap} · ${equipos.length} equipos.`, variant: 'success' })
        } else {
          await crudUpdate('repuestos', despiece.id, { codigoSAP: sap, tieneSap: true }, despiece)
          toast({ title: 'Código SAP asignado', description: `${sap} — ya es ordenable.`, variant: 'success' })
        }
        setAsignarSapOpen(false)
        setSelectedRowKey(null)
        await refreshCatalog()
      } catch (e) {
        toast({ variant: 'destructive', title: 'No se pudo asignar el SAP', description: e instanceof Error ? e.message : '' })
      } finally {
        setAsignarSapSaving(false)
      }
    },
    [selectedRep, resolveSources, allRepuestos, crudUpdate, crudDelete, refreshCatalog, toast],
  )

  // Asignar/añadir un equipo (nodo de jerarquía) donde se usa el material (N:M).
  const handleAsignarEquipo = useCallback(
    async (node: { id: string; nombre: string; alias?: string; codigo?: string }) => {
      if (!selectedRep) return
      const src = resolveSources(selectedRep)[0]
      if (!src) { toast({ variant: 'destructive', title: 'No se encontró la pieza base' }); return }
      const rep = src.repuesto
      if ((rep.equipos || []).includes(node.id)) { toast({ title: 'Ya está asignado a ese equipo' }); return }
      setAsignarEquipoSaving(true)
      try {
        const equipos = [...(rep.equipos || []), node.id]
        const equiposCodigos = [...(rep.equiposCodigos || []), (node.codigo || '').trim() || `s/c:${node.nombre}`]
        await crudUpdate('repuestos', rep.id, { equipos, equiposCodigos }, rep)
        toast({ title: 'Equipo asignado', description: node.alias || node.nombre, variant: 'success' })
        setAsignarEquipoOpen(false)
        await refreshCatalog()
      } catch (e) {
        toast({ variant: 'destructive', title: 'No se pudo asignar el equipo', description: e instanceof Error ? e.message : '' })
      } finally {
        setAsignarEquipoSaving(false)
      }
    },
    [selectedRep, resolveSources, crudUpdate, refreshCatalog, toast],
  )

  // Marcar / desmarcar el repuesto como "común" de una máquina (lista compartida).
  // Escribe `comunEn` en el/los doc(s) del SAP (con auditoría vía crudUpdate).
  const handleToggleComun = useCallback(
    async (slug: string) => {
      if (!selectedRep) return
      const sources = resolveSources(selectedRep)
      if (!sources.length) { toast({ variant: 'destructive', title: 'No se encontró la pieza base' }); return }
      const machineName = findMachineBySlug(slug)?.name ?? slug
      const wasComun = sources.some((s) => (s.repuesto.comunEn || []).includes(slug))
      try {
        for (const s of sources) {
          const cur = s.repuesto.comunEn || []
          const next = cur.includes(slug) ? cur.filter((x) => x !== slug) : [...cur, slug]
          await crudUpdate('repuestos', s.repuesto.id, { comunEn: next }, s.repuesto)
        }
        toast({
          title: wasComun ? 'Quitado de comunes' : 'Marcado como común',
          description: machineName,
          variant: 'success',
        })
        await refreshCatalog()
      } catch (e) {
        toast({ variant: 'destructive', title: 'No se pudo actualizar', description: e instanceof Error ? e.message : '' })
      }
    },
    [selectedRep, resolveSources, crudUpdate, refreshCatalog, toast],
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

  // Guardar fotos reales actualizadas (desde RepuestoPhotosModal editable)
  const handleSaveFotosReales = useCallback(
    async (fotos: import('@/types/repuestos').ImagenRepuesto[]) => {
      if (!actionTarget) return
      const { source } = actionTarget
      await crudUpdate(colPathOf(source.machineId), source.repuesto.id, { fotosReales: fotos }, source.repuesto)
      toast({ title: 'Fotos actualizadas', variant: 'success' })
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

  // Índice para detectar duplicados al crear (por SAP exacto o nombre normalizado).
  const dupIndex = useMemo(() => {
    const bySap = new Map<string, { id: string; textoBreve: string; codigoSAP: string }>()
    const byName = new Map<string, { id: string; textoBreve: string; codigoSAP: string }>()
    for (const r of allRepuestos) {
      const sap = (r.repuesto.codigoSAP || '').trim()
      const entry = { id: r.repuesto.id, textoBreve: r.repuesto.textoBreve, codigoSAP: sap }
      if (sap && !bySap.has(sap)) bySap.set(sap, entry)
      const nm = normalizeForSearch(r.repuesto.textoBreve)
      if (nm && !byName.has(nm)) byName.set(nm, entry)
    }
    return { bySap, byName }
  }, [allRepuestos])

  const checkDuplicate = useCallback(({ codigoSAP, textoBreve }: { codigoSAP: string; textoBreve: string }) => {
    const sap = codigoSAP.trim()
    if (sap && dupIndex.bySap.has(sap)) return dupIndex.bySap.get(sap)!
    const nm = normalizeForSearch(textoBreve)
    if (nm.length >= 4 && dupIndex.byName.has(nm)) return dupIndex.byName.get(nm)!
    return null
  }, [dupIndex])

  // "+ Repuesto": si estás filtrando un EQUIPO puntual (ej. GRADER), asocia el nuevo
  // repuesto automáticamente a ese modelo y salta el picker. Si no, abre el picker
  // (material transversal o buscar el equipo destino en toda la planta).
  const startCreate = useCallback(() => {
    setCreateInitial(null)  // "+ Repuesto" normal: nunca hereda el prellenado del catálogo
    if (selectedEquipMachineId) {
      const group = equipoModelGroups.find((g) => g.nodeIds.includes(selectedEquipMachineId))
      if (group) {
        setCreateTransversal(false)
        setCreateTargetEquipos({ nodeIds: group.nodeIds, codigos: group.codigos, label: group.label })
        setCreateOpen(true)
        return
      }
    }
    setCreateEquipoQuery('')
    setCreateEquipoSel(new Set())
    setCreatePicker(true)
  }, [selectedEquipMachineId, equipoModelGroups])

  const handleCreateSubmit = useCallback(
    async (payload: RepuestoFormData) => {
      setSavingRep(true)
      try {
        const tieneSap = !!payload.codigoSAP?.trim()
        const equipos = createTargetEquipos?.nodeIds ?? []
        if (createTransversal || equipos.length === 0) {
          // Material transversal (insumo/herramienta/…): no pertenece a ningún equipo.
          await crudCreate('repuestos', payload, {
            equipos: [],
            equiposCodigos: [],
            parentRepuestoId: null,
            clase: payload.clase || 'insumo',
            tieneSap,
            origen: { tipo: 'manual' },
          })
          toast({ title: 'Material transversal creado', variant: 'success' })
        } else {
          // Modelo plano N:M: el repuesto nace asociado a TODAS las instancias del/los modelo(s).
          await crudCreate('repuestos', payload, {
            equipos,
            equiposCodigos: createTargetEquipos?.codigos ?? [],
            parentRepuestoId: null,
            clase: payload.clase || 'repuesto',
            tieneSap,
            origen: { tipo: 'manual' },
          })
          toast({ title: equipos.length > 1 ? `Repuesto creado (${equipos.length} equipos)` : 'Repuesto creado', variant: 'success' })
        }
        // Stock + ubicación de bodega (vive en `bodega` por SAP), si se ingresó algo.
        const sap = payload.codigoSAP?.trim()
        if (sap && ((payload.stockInicial ?? 0) > 0 || (payload.stockMinimo ?? 0) > 0 || (payload.ubicacionBodega ?? '').trim())) {
          try {
            await saveStock(sap, {
              stockActual: payload.stockInicial ?? 0,
              stockMinimo: payload.stockMinimo ?? 0,
              ubicacionBodega: (payload.ubicacionBodega ?? '').trim(),
              unidad: 'pzas',
            })
          } catch (e) {
            toast({ variant: 'destructive', title: 'Material creado, pero el stock no se guardó', description: e instanceof Error ? e.message : 'Cárgalo luego en Bodega.' })
          }
        }
        setCreateOpen(false)
        setCreateTransversal(false)
        setCreateTargetEquipos(null)
        setCreateEquipoSel(new Set())
        await refreshCatalog()
      } catch (err) {
        toast({ variant: 'destructive', title: 'Error al crear', description: err instanceof Error ? err.message : '' })
      } finally {
        setSavingRep(false)
      }
    },
    [createTargetEquipos, createTransversal, crudCreate, saveStock, refreshCatalog, toast],
  )

  // Datos del repuesto/equipo objetivo de la acción en curso.
  const actionRep = actionTarget?.source.repuesto ?? null
  // Manuales heredados de los equipos del repuesto — fallback del modal "Manual".
  const { manuales: manualesHeredadosModal } = useManualesDeEquipos(
    actionTarget?.kind === 'manual' ? actionRep?.equipos ?? [] : [],
  )
  const actionMachineId = actionTarget?.source.machineId
  const actionMachine = useMemo(
    () => (actionMachineId ? machines.find((m) => m.id === actionMachineId) ?? null : null),
    [actionMachineId, machines],
  )

  // ── Exportar: docs Repuesto del área (resueltos desde allRepuestos) ──
  // keyOfDoc replica la clave del merge de useBodega → para mapear doc ↔ fila visible.
  const keyOfDoc = useCallback((rep: { codigoSAP?: string; codigoFabricante?: string; id: string }) => {
    const sap = (rep.codigoSAP || '').trim()
    if (sap) return sap
    const fab = (rep.codigoFabricante || '').trim()
    return fab ? `fab:${fab}` : `id:${rep.id}`
  }, [])
  const areaDocs = useMemo(
    () => allRepuestos.filter((r) => showingAll || (!!selectedAreaId && machineInArea(r.machineId, selectedAreaId))),
    [allRepuestos, showingAll, selectedAreaId, machineInArea],
  )
  const exportRepuestos = useMemo(() => areaDocs.map((r) => r.repuesto), [areaDocs])
  const exportFiltered = useMemo(() => {
    const visibleKeys = new Set(filteredRep.map((row) => row.rowKey))
    return areaDocs.filter((r) => visibleKeys.has(keyOfDoc(r.repuesto))).map((r) => r.repuesto)
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
    setSelectedEquipMachineId(null)
    setSelectedEquipName('')
    setSelectedRowKey(null)
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
    setSelectedEquipMachineId(null)
    setSelectedEquipName('')
  }, [])


  // Si hay un equipo seleccionado, el título es el equipo (no el área); el área baja al breadcrumb.
  const title = selectedEquipKey
    ? (selectedEquipName || 'Equipo')
    : (showingAll ? 'Todas las áreas' : (selectedNode?.nombre ?? 'Selecciona un área'))

  // Herramientas admin de catálogo — compartidas entre toolbar desktop y overflow móvil.
  // (Fase 4) Importar / duplicados / gestor de máquinas quedaron fuera: eran
  // machine-bound; se reimplementan sobre la colección plana en Fase 5.
  const adminTools = isAdmin
    ? [
        { key: 'export', icon: Download, label: 'Exportar reporte', onClick: () => setExportOpen(true) },
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
        assetCountByNode={{}}
        repCountByNode={repCountByNode}
        favoriteAreaIds={favoriteAreaIds}
        onToggleAreaFav={toggleAreaFav}
        favoritesOnly={areaFavOnly}
        onToggleFavoritesOnly={() => setAreaFavOnly((v) => !v)}
        openNodes={openNodes}
        onToggleNode={handleToggleNode}
        onCollapseAll={collapseAllNodes}
        onShowAll={handleShowAll}
        showingAll={showingAll}
        mobileOpen={sidebarMobileOpen}
        onMobileClose={() => setSidebarMobileOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        onSelectEquipment={(node, leaf) => handleFavEquipClick(leaf.linkedMachineId || leaf.id, leaf.alias || leaf.nombre, node.id)}
        onSelectEquipmentGlobal={(eq) => handleFavEquipClick(eq.id, eq.alias || eq.nombre, eq.parentId)}
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
                            {list.machineIds.map((id, idx) => {
                              const dragging = dragFav?.list === list.name && dragFav.idx === idx
                              return (
                              <span
                                key={id}
                                draggable={isAdmin}
                                onDragStart={(e) => { if (!isAdmin) return; e.dataTransfer.setData('text/plain', JSON.stringify({ list: list.name, idx })); e.dataTransfer.effectAllowed = 'move'; setDragFav({ list: list.name, idx }) }}
                                onDragOver={(e) => { if (dragFav?.list === list.name) e.preventDefault() }}
                                onDrop={(e) => {
                                  e.preventDefault()
                                  let from = dragFav?.list === list.name ? dragFav.idx : -1
                                  try { const d = JSON.parse(e.dataTransfer.getData('text/plain')); if (d && d.list === list.name) from = d.idx } catch { /* noop */ }
                                  if (from >= 0) reorderEquipInList(list.name, from, idx)
                                  setDragFav(null)
                                }}
                                onDragEnd={() => setDragFav(null)}
                                className={[
                                  'group inline-flex items-center overflow-hidden rounded-full border border-border bg-background transition',
                                  isAdmin ? 'cursor-grab active:cursor-grabbing' : '',
                                  dragging ? 'opacity-40 ring-1 ring-primary' : '',
                                ].join(' ')}
                                title={isAdmin ? 'Arrastra para reordenar' : undefined}
                              >
                                {isAdmin && (
                                  <GripVertical className="ml-1 h-3 w-3 shrink-0 text-muted-foreground/30 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100" />
                                )}
                                <button
                                  onClick={() => handleFavEquipClick(id, list.machineNames?.[id] || equipNameMap.get(id))}
                                  className="px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-primary/10 hover:text-primary"
                                >
                                  {list.machineNames?.[id] || equipNameMap.get(id) || id}
                                </button>
                                {isAdmin && (
                                  <button onClick={() => removeEquipFromList(list.name, id)} title="Quitar de la lista" className="pl-0.5 pr-1.5 text-muted-foreground/40 transition hover:text-red-400 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"><X className="h-3 w-3" /></button>
                                )}
                              </span>
                            )})}
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
              {/* Breadcrumb: con equipo seleccionado incluye el área; si no, la deja para el título. */}
              {(selectedEquipKey ? breadcrumb.length > 0 : breadcrumb.length > 1) && (
                <div className="mb-0.5 truncate text-[11px] text-muted-foreground">
                  {(selectedEquipKey ? breadcrumb : breadcrumb.slice(0, -1)).join(' › ')}
                </div>
              )}
              <div className="flex items-center gap-2">
                {selectedEquipKey && <Cog className="h-5 w-5 shrink-0 text-cyan-500" />}
                <h1 className="truncate text-xl font-bold text-foreground">{title}</h1>
                {selectedNode && !repQuery.trim() && !selectedEquipKey && (
                  <Badge variant="secondary" className="tabular-nums">{eqCount} equipos</Badge>
                )}
                {repQuery.trim() && (
                  <Badge variant="secondary" className="gap-1">
                    <Search className="h-3 w-3" /> «{repQuery.trim()}»
                  </Badge>
                )}
              </div>
              {selectedEquipKey ? (
                <button
                  onClick={() => { setRepEquipoFilter('all'); setSelectedEquipKey(null); setSelectedEquipMachineId(null); setSelectedEquipName('') }}
                  className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  title="Volver a ver todos los repuestos del área"
                >
                  <ChevronLeft className="h-3 w-3 shrink-0" /> Volver a <span className="truncate font-semibold">{selectedNode?.nombre ?? 'el área'}</span>
                </button>
              ) : repEquipoFilter !== 'all' ? (
                <button
                  onClick={() => { setRepEquipoFilter('all'); setSelectedEquipName('') }}
                  className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/20"
                  title="Quitar filtro de equipo — ver todos los repuestos del área"
                >
                  <Cog className="h-3 w-3 shrink-0" /> <span className="truncate">{repEquipoFilter}</span> <X className="h-3 w-3 shrink-0 opacity-70" />
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isAdmin && (selectedAreaId || showingAll) && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={startCreate} title="Agregar repuesto a un equipo del área">
                  <Plus className="h-4 w-4" /> Repuesto
                </Button>
              )}
            </div>
          </div>

          {/* KPIs — en móvil el grid de 4 cards + stats empujaba la lista ~2
              pantallas abajo: se reemplaza por un strip de una línea (mismos
              datos, chequeables de un vistazo) y las cards quedan tras el
              toggle "KPIs y filtros". Desktop: sin cambios. */}
          <div className="mb-3 flex items-center justify-between gap-2 sm:hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /><b>{repuestosBusy ? '…' : stockKpis.ok}</b></span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /><b>{repuestosBusy ? '…' : stockKpis.low}</b></span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /><b>{repuestosBusy ? '…' : stockKpis.out}</b></span>
              <span className="text-muted-foreground"><b className="text-foreground">{repuestosBusy ? '…' : catalogStats.conSAP}</b> con SAP</span>
            </div>
            <Button
              variant={mobileExtrasOpen ? 'default' : 'outline'}
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => setMobileExtrasOpen((v) => !v)}
            >
              <Settings2 className="h-4 w-4" /> Filtros
              {filtrosActivos > 0 && <span className="tabular-nums opacity-80">({filtrosActivos})</span>}
            </Button>
          </div>

          <div className={[mobileExtrasOpen ? 'grid' : 'hidden', 'mb-6 grid-cols-2 gap-3 sm:grid sm:grid-cols-4'].join(' ')}>
            <KpiCard value={repuestosBusy ? '…' : catalogStats.conSAP} label="Repuestos con SAP" icon={Package} tone="primary" hint={repuestosBusy ? undefined : `+${catalogStats.sinSAP} despiece sin SAP`} />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.ok} label="Stock disponible" icon={PackageCheck} tone="emerald" hint={repuestosBusy ? undefined : `${stockKpis.pctOk}% del stock`} />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.low} label="Stock bajo" icon={PackageMinus} tone="amber" hint={repuestosBusy ? undefined : `${stockKpis.pctLow}% del stock`} />
            <KpiCard value={repuestosBusy ? '…' : stockKpis.out} label="Sin stock" icon={PackageX} tone="red" hint={repuestosBusy ? undefined : `${stockKpis.pctOut}% del stock`} />
          </div>

          {/* KPIs de catálogo (cobertura) */}
          {!repuestosBusy && stockKpis.total > 0 && (
            <div className={[mobileExtrasOpen ? 'flex' : 'hidden', 'mb-6 -mt-2 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground sm:flex'].join(' ')}>
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

          {/* (Fase 4 normalización) La sección "Motores y bombas del área" se eliminó:
              los motores/bombas físicos ahora son repuestos de la colección plana y
              aparecen en la tabla de abajo con su marca/modelo/foto. */}

          {/* Tabla de repuestos del área (catálogo + bodega).
              scroll-mt compensa la barra sticky al hacer scrollIntoView. */}
          <section ref={listSectionRef} className="scroll-mt-44 sm:scroll-mt-28">
            {/* Filtros (la búsqueda vive en la barra superior — global, sticky).
                En móvil colapsados tras el botón "Filtros" del strip de KPIs. */}
            <div className={[mobileExtrasOpen ? 'flex' : 'hidden', 'mb-3 flex-wrap items-center gap-2 sm:flex'].join(' ')}>
              {/* Selects: 2-up en móvil (grid), fila única en ≥sm (sm:contents disuelve el grid) */}
              <div className="grid grid-cols-2 gap-2 sm:contents">
              <Select value={repEquipoFilter} onValueChange={(v) => { setRepEquipoFilter(v); setSelectedEquipKey(null); setSelectedEquipMachineId(null); setSelectedEquipName('') }}>
                <SelectTrigger className="w-full sm:w-[190px]"><SelectValue placeholder="Todos los equipos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los equipos</SelectItem>
                  {equipoOptions.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={repClaseFilter} onValueChange={setRepClaseFilter}>
                <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="Todas las clases" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las clases</SelectItem>
                  {claseOptions.map((c) => <SelectItem key={c.value} value={c.value}>{CLASE_LABEL[c.value as keyof typeof CLASE_LABEL] ?? c.value} ({c.count})</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={repTipoFilter} onValueChange={setRepTipoFilter}>
                <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="Todos los tipos" /></SelectTrigger>
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
                variant={repSoloSap ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setRepSoloSap((v) => !v)}
                title={repSoloSap
                  ? 'Mostrando solo materiales con código SAP (los ordenables). Clic para incluir las piezas de despiece sin SAP.'
                  : 'Incluyendo piezas de despiece sin SAP. Clic para enfocar solo en los que tienen SAP.'}
              >
                Solo con SAP
                {repSoloSap && despieceOcultos > 0 && <span className="tabular-nums opacity-70">+{despieceOcultos} despiece</span>}
              </Button>
              <Button
                variant={repFavOnly ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5"
                onClick={() => setRepFavOnly((v) => !v)}
                title="Mis favoritos: atajos personales tuyos (cada usuario tiene los suyos). Distinto de «Comunes», que es la lista compartida de la máquina."
              >
                <Star className={['h-4 w-4', repFavOnly ? 'fill-current' : ''].join(' ')} /> Mis favoritos
                {favKeys.size > 0 && <span className="tabular-nums opacity-70">({favKeys.size})</span>}
              </Button>
              {comunesEnScope > 0 && (
                <Button
                  variant={repComunOnly ? 'default' : 'outline'}
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setRepComunOnly((v) => !v)}
                  title="Mostrar solo los repuestos comunes / más usados de la máquina (lista curada compartida, la misma del Centro de Aprendizaje)"
                >
                  <Wrench className="h-4 w-4" /> Comunes
                  <span className="tabular-nums opacity-70">({comunesEnScope})</span>
                </Button>
              )}
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
                      {/* En móvil solo Repuesto + favorito: la foto (96% sin foto)
                          y la columna Stock desbordaban el ancho — el stock va
                          como chip bajo el título (ver celda Repuesto). */}
                      <tr>
                        <th className="hidden w-12 px-2 py-2 md:table-cell" aria-label="Foto" />
                        {renderSortTh('codigoSAP', 'SAP', 'hidden md:table-cell')}
                        {renderSortTh('codigoFabricante', 'Cód. Fabricante', 'hidden md:table-cell')}
                        {renderSortTh('textoBreve', 'Repuesto')}
                        <th className="hidden px-3 py-2 font-semibold lg:table-cell">Nombre común</th>
                        {renderSortTh('equipo', 'Equipo', 'hidden md:table-cell')}
                        {renderSortTh('stock', 'Stock', 'hidden md:table-cell')}
                        {renderSortTh('tipo', 'Tipo', 'hidden md:table-cell')}
                        <th className="w-8 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedRep.map((r, idx) => {
                        const meta = STOCK_META[r.stockStatus]
                        // Transversal = material sin nodo-equipo real (insumo/herramienta del maestro).
                        const esTransversal = !r.equipos.some((e) => e.machineId)
                        const equipo = esTransversal ? 'Transversal' : (r.equipos[0]?.machineName ?? '-')
                        const extra = !esTransversal && r.equipos.length > 1 ? ` +${r.equipos.length - 1}` : ''
                        const isSel = selectedRowKey === r.rowKey
                        // Fotos: las de bodega (reales del físico) primero, luego las del catálogo
                        const fotos = [...(r.fotos ?? []), ...(r.fotosCatalogo ?? [])]
                        // Divisor de tier: primera fila sin SAP (despiece) tras las con-SAP.
                        const showDespieceDivider = !r.codigoSAP && (idx === 0 || !!pagedRep[idx - 1]?.codigoSAP)
                        return (
                          <Fragment key={r.rowKey}>
                          {showDespieceDivider && (
                            <tr className="bg-muted/30">
                              <td colSpan={9} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                Piezas de despiece · sin código SAP
                              </td>
                            </tr>
                          )}
                          <tr
                            onClick={() => setSelectedRowKey(r.rowKey)}
                            className={[
                              'cursor-pointer transition-colors',
                              isSel ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted/40',
                            ].join(' ')}
                          >
                            <td className="hidden px-2 py-1.5 md:table-cell">
                              {fotos.length > 0 && fotos[0] ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRowLightbox(fotos) }}
                                  className="group relative block h-9 w-9 overflow-hidden rounded-md ring-1 ring-border transition hover:ring-primary/60"
                                  title="Ver fotos"
                                  aria-label="Ver fotos del repuesto"
                                >
                                  <img src={fotos[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110" />
                                  {fotos.length > 1 && (
                                    <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-0.5 text-[8px] font-bold text-white">+{fotos.length - 1}</span>
                                  )}
                                </button>
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-border" title="Sin foto">
                                  <ImageOff className="h-3.5 w-3.5 text-muted-foreground/30" />
                                </div>
                              )}
                            </td>
                            <td className="hidden px-3 py-2 font-mono text-xs md:table-cell">
                              {r.codigoSAP ? (
                                <span className="inline-flex items-center gap-1">
                                  {r.codigoSAP}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copySapFromRow(r.rowKey, r.codigoSAP) }}
                                    className="rounded p-0.5 text-muted-foreground/40 transition hover:text-primary"
                                    title="Copiar SAP"
                                    aria-label="Copiar código SAP"
                                  >
                                    {copiedSapKey === r.rowKey ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                </span>
                              ) : '-'}
                            </td>
                            <td className="hidden px-3 py-2 font-mono text-xs md:table-cell">
                              {r.codigoFabricante
                                ? <span className="text-muted-foreground">{r.codigoFabricante}</span>
                                : <span className="text-muted-foreground/30">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {r.clase && (
                                  <span
                                    className={[
                                      'shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground',
                                      // "Repuesto" es la clase del ~75% de las filas: en
                                      // móvil es ruido puro — solo se muestran las
                                      // distintas (insumo/herramienta/químico…).
                                      r.clase === 'repuesto' ? 'hidden md:inline-block' : '',
                                    ].join(' ')}
                                    title="Clase de material"
                                  >
                                    {CLASE_LABEL[r.clase]}
                                  </span>
                                )}
                                <span className="font-medium text-foreground">{r.textoBreve || r.alias || '(sin nombre)'}</span>
                                {(isCommonPartSap(r.codigoSAP) || (r.comunEn?.length ?? 0) > 0) && (
                                  <span
                                    className="inline-flex shrink-0 items-center gap-0.5 rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400"
                                    title={`Repuesto común / más usado de: ${[...new Set([...machinesForCommonSap(r.codigoSAP), ...(r.comunEn ?? [])])].map((s) => findMachineBySlug(s)?.name ?? s).join(', ')}`}
                                  >
                                    <Wrench className="h-3 w-3" /> común
                                  </span>
                                )}
                              </div>
                              {/* En móvil, stock + ubicación como chip propio (la columna
                                  Stock está oculta: desbordaba el ancho y quedaba cortada) */}
                              <div className="mt-1 flex items-center gap-1.5 text-[11px] md:hidden">
                                <span className={['h-2 w-2 shrink-0 rounded-full', meta.dot].join(' ')} />
                                <span className="tabular-nums font-semibold">{r.stockStatus === 'unset' ? '—' : r.stockActual}</span>
                                <span className={meta.text}>{meta.label}</span>
                                {r.ubicacionBodega && (
                                  <span className="text-muted-foreground">· 📍 {r.ubicacionBodega}</span>
                                )}
                              </div>
                              {/* SAP + equipo + tipo como subtítulo (columnas ocultas) */}
                              <div className="mt-0.5 text-[10px] text-muted-foreground md:hidden">
                                {r.codigoSAP && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copySapFromRow(r.rowKey, r.codigoSAP) }}
                                    className="inline-flex items-center gap-0.5 font-mono text-muted-foreground/80 active:text-primary"
                                    aria-label="Copiar código SAP"
                                  >
                                    {r.codigoSAP}
                                    {copiedSapKey === r.rowKey ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 opacity-50" />}
                                    <span> · </span>
                                  </button>
                                )}
                                {equipo}{extra} · {tipoLabelOf(r.tipo)}
                                {r.codigoFabricante && <span> · <span className="font-mono text-muted-foreground/80">Fab {r.codigoFabricante}</span></span>}
                              </div>
                            </td>
                            <td className="hidden px-3 py-2 text-xs lg:table-cell" onClick={(e) => e.stopPropagation()}>
                              {editApodosKey === r.rowKey ? (
                                <input
                                  autoFocus
                                  value={editApodosVal}
                                  onChange={(e) => setEditApodosVal(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveApodos(r)
                                    else if (e.key === 'Escape') setEditApodosKey(null)
                                  }}
                                  onBlur={() => saveApodos(r)}
                                  disabled={savingApodos}
                                  placeholder="apodos, separados por coma"
                                  className="w-full rounded border border-primary/50 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!isAdmin) return
                                    setEditApodosVal((r.nombresComunes ?? []).join(', '))
                                    setEditApodosKey(r.rowKey)
                                  }}
                                  className="block w-full max-w-[220px] truncate text-left text-muted-foreground transition hover:text-foreground"
                                  title={isAdmin ? 'Editar nombres comunes' : ((r.nombresComunes ?? []).join(', '))}
                                >
                                  {(r.nombresComunes && r.nombresComunes.length)
                                    ? r.nombresComunes.join(', ')
                                    : (isAdmin ? <span className="italic text-muted-foreground/40">+ agregar apodos</span> : '—')}
                                </button>
                              )}
                            </td>
                            <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{equipo}<span className="text-muted-foreground/60">{extra}</span></td>
                            <td className="hidden px-3 py-2 md:table-cell">
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
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFav(r.rowKey) }}
                                className={['rounded p-0.5 transition', favKeys.has(r.rowKey) ? 'text-amber-400' : 'text-muted-foreground/30 hover:text-amber-400'].join(' ')}
                                title={favKeys.has(r.rowKey) ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                aria-label="Favorito"
                              >
                                <Star className={['h-4 w-4', favKeys.has(r.rowKey) ? 'fill-current' : ''].join(' ')} />
                              </button>
                            </td>
                          </tr>
                          </Fragment>
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

            {/* Panel "Insumos que coinciden" ELIMINADO (Fase 6): los insumos
                ahora viven en el maestro `repuestos` y aparecen en la tabla
                principal con su badge de clase. Evita resultados duplicados. */}
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
          onAssignSap={!selectedRep.codigoSAP ? () => { setAsignarSapValue(''); setAsignarSapOpen(true) } : undefined}
          onAssignEquipo={() => { setAsignarEquipoQuery(''); setAsignarEquipoOpen(true) }}
          isAdmin={isAdmin}
          onRename={isAdmin ? handleRenameRep : undefined}
          onEditRepuesto={isAdmin ? () => startAction('edit') : undefined}
          onDeleteRepuesto={isAdmin ? () => startAction('delete') : undefined}
          onSpecs={() => startAction('specs')}
          onPhotos={() => startAction('photos')}
          onManual={() => startAction('manual')}
          isFavorite={favKeys.has(selectedRep.rowKey)}
          onToggleFavorite={() => toggleFav(selectedRep.rowKey)}
          onAddToList={() => setAddToListRowKey(selectedRep.rowKey)}
          onSaveApodos={isAdmin ? (arr) => persistApodos(selectedRep, arr) : undefined}
          onContar={handleContar}
          comunEn={selectedRep.comunEn}
          onMarkComun={isAdmin ? () => { setComunQuery(''); setComunPickerOpen(true) } : undefined}
          onRemoveComun={isAdmin ? (slug) => handleToggleComun(slug) : undefined}
        />
      )}

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
        onAvanzar={handleAvanzarSolicitud}
      />

      {/* Herramientas admin de catálogo */}
      {isAdmin && (
        <>
          <AuditLogPanel open={auditLogOpen} onOpenChange={setAuditLogOpen} />
          <TrashPanel open={trashOpen} onOpenChange={setTrashOpen} />
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

      {/* Selector de destino para "+ Repuesto": material transversal o uno/varios MODELOS de equipo */}
      <Dialog open={createPicker} onOpenChange={(o) => { if (!o) { setCreatePicker(false); setCreateEquipoQuery(''); setCreateEquipoSel(new Set()) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">¿Qué vas a crear?</DialogTitle>
            <DialogDescription>Un material transversal (insumo, herramienta…) o un repuesto asociado a uno o varios equipos. Marca los modelos y pulsa Continuar.</DialogDescription>
          </DialogHeader>

          <button
            onClick={() => { setCreateTransversal(true); setCreateTargetEquipos(null); setCreateEquipoSel(new Set()); setCreatePicker(false); setCreateEquipoQuery(''); setCreateOpen(true) }}
            className="flex w-full items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10"
          >
            <Boxes className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">Material transversal</span>
              <span className="text-[11px] text-muted-foreground">Insumo, herramienta, químico… sin equipo</span>
            </span>
          </button>

          <div className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">O asociar a equipos</div>
          <Input
            value={createEquipoQuery}
            onChange={(e) => setCreateEquipoQuery(e.target.value)}
            placeholder="Buscar equipo en toda la planta…"
            autoFocus
          />
          <div className="mt-1 max-h-[38vh] space-y-1 overflow-y-auto">
            {(() => {
              // Match por tokens (AND) sobre MODELOS agrupados: "bomba nh3" → "BOMBA FLUJO NH3".
              const terms = normalizeForSearch(createEquipoQuery).split(/\s+/).filter(Boolean)
              let groups = equipoModelGroups
              if (terms.length) {
                groups = groups.filter((g) => {
                  const hay = normalizeForSearch(`${g.label} ${g.codigos.join(' ')}`)
                  return terms.every((t) => hay.includes(t))
                })
              } else if (selectedAreaId && !showingAll) {
                groups = groups.filter((g) => g.nodeIds.some((id) => machineInArea(id, selectedAreaId)))
              } else {
                groups = []
              }
              groups = groups.slice(0, 50)
              if (!groups.length) {
                return (
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                    {terms.length ? 'Sin equipos que coincidan.' : 'Escribe el nombre o código del equipo…'}
                  </p>
                )
              }
              return groups.map((g) => {
                const checked = createEquipoSel.has(g.key)
                return (
                  <button
                    key={g.key}
                    onClick={() => setCreateEquipoSel((prev) => { const n = new Set(prev); if (checked) n.delete(g.key); else n.add(g.key); return n })}
                    className={['flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition', checked ? 'border-primary/50 bg-primary/10' : 'border-border bg-card hover:bg-muted/40 hover:border-primary/40'].join(' ')}
                  >
                    <span className={['flex h-4 w-4 shrink-0 items-center justify-center rounded border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'].join(' ')}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <Cog className="h-4 w-4 shrink-0 text-cyan-500" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{g.label}</span>
                    {g.nodeIds.length > 1
                      ? <span className="shrink-0 text-[10px] text-muted-foreground">· {g.nodeIds.length} equipos</span>
                      : g.codigos[0] && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{g.codigos[0]}</span>}
                  </button>
                )
              })
            })()}
          </div>

          {createEquipoSel.size > 0 && (() => {
            const sel = equipoModelGroups.filter((g) => createEquipoSel.has(g.key))
            const nodeIds = sel.flatMap((g) => g.nodeIds)
            const codigos = sel.flatMap((g) => g.codigos)
            const label = sel.length === 1 ? (sel[0]?.label ?? '') : `${sel.length} modelos`
            return (
              <Button
                className="mt-1 w-full"
                onClick={() => {
                  setCreateTransversal(false)
                  setCreateTargetEquipos({ nodeIds, codigos, label })
                  setCreatePicker(false); setCreateEquipoQuery(''); setCreateEquipoSel(new Set())
                  setCreateOpen(true)
                }}
              >
                Continuar · {nodeIds.length} equipo{nodeIds.length === 1 ? '' : 's'}
              </Button>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Asignar código SAP a una pieza de despiece (sin SAP → ordenable) */}
      <Dialog open={asignarSapOpen} onOpenChange={(o) => !o && setAsignarSapOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Asignar código SAP</DialogTitle>
            <DialogDescription>
              Esta pieza de despiece no tiene SAP. Asígnale su código para volverla ordenable. Si el SAP ya existe en el catálogo, se fusiona con ese material (se unen sus equipos).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleAsignarSap(asignarSapValue) }} className="space-y-3">
            <Input
              value={asignarSapValue}
              onChange={(e) => setAsignarSapValue(e.target.value.replace(/\D/g, ''))}
              placeholder="Código SAP (ej. 3300128967)"
              inputMode="numeric"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAsignarSapOpen(false)} disabled={asignarSapSaving}>Cancelar</Button>
              <Button type="submit" size="sm" disabled={asignarSapSaving || !/^\d{6,}$/.test(asignarSapValue.trim())}>
                {asignarSapSaving ? 'Asignando…' : 'Asignar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Asignar/añadir equipo (nodo de jerarquía) donde se usa el material — N:M */}
      <Dialog open={asignarEquipoOpen} onOpenChange={(o) => !o && setAsignarEquipoOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Asignar a un equipo</DialogTitle>
            <DialogDescription>Elige el equipo de la planta donde se usa este material. Puedes agregar varios (un material sirve a N equipos).</DialogDescription>
          </DialogHeader>
          <Input value={asignarEquipoQuery} onChange={(e) => setAsignarEquipoQuery(e.target.value)} placeholder="Buscar equipo…" autoFocus />
          <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
            {(() => {
              const already = new Set((selectedRep?.equipos || []).map((e) => e.machineId))
              const q = normalizeForSearch(asignarEquipoQuery)
              const cands = (getGlobalEquipmentCache() || [])
                .filter((e) => !already.has(e.id) && (!q || normalizeForSearch(`${e.nombre} ${e.alias ?? ''} ${e.codigo ?? ''}`).includes(q)))
                .slice(0, 50)
              if (!cands.length) return <p className="px-1 py-2 text-xs text-muted-foreground">Sin equipos que coincidan.</p>
              return cands.map((e) => (
                <button
                  key={e.id}
                  disabled={asignarEquipoSaving}
                  onClick={() => handleAsignarEquipo(e)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted/40 hover:border-primary/40 disabled:opacity-50"
                >
                  <Cog className="h-4 w-4 shrink-0 text-cyan-500" />
                  <span className="min-w-0 flex-1 truncate">{e.alias || e.nombre}</span>
                  {e.codigo && <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{e.codigo}</span>}
                </button>
              ))
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Marcar como común de [máquina] — lista compartida (badge en tabla + pestaña de Aprendizaje) */}
      <Dialog open={comunPickerOpen} onOpenChange={(o) => !o && setComunPickerOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Marcar como común de…</DialogTitle>
            <DialogDescription>Elegí la máquina para la que este repuesto es común / más usado. Aparecerá en su lista del Centro de Aprendizaje y con el badge «común» acá.</DialogDescription>
          </DialogHeader>
          <Input value={comunQuery} onChange={(e) => setComunQuery(e.target.value)} placeholder="Buscar máquina…" autoFocus />
          <div className="mt-2 max-h-[50vh] space-y-1 overflow-y-auto">
            {(() => {
              // Excluir las máquinas que YA tiene: marcadas a mano (comunEn) + sembradas
              // en la lista base (machinesForCommonSap por SAP). Así no re-ofrece marcar
              // algo que ya es común de esa máquina.
              const already = new Set([
                ...(selectedRep?.comunEn || []),
                ...machinesForCommonSap(selectedRep?.codigoSAP || ''),
              ])
              const q = normalizeForSearch(comunQuery)
              const cands = LEARNING_MACHINES
                .filter((m) => !isCourseMachine(m))
                .filter((m) => !already.has(m.slug) && (!q || normalizeForSearch(m.name).includes(q)))
              if (!cands.length) return <p className="px-1 py-2 text-xs text-muted-foreground">Sin máquinas que coincidan.</p>
              return cands.map((m) => (
                <button
                  key={m.slug}
                  onClick={() => { handleToggleComun(m.slug); setComunPickerOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted/40 hover:border-primary/40"
                >
                  <Wrench className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                </button>
              ))
            })()}
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Crear repuesto / material transversal */}
      <RepuestoFormModal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateTransversal(false); setCreateInitial(null) }}
        mode="create"
        initialData={createInitial}
        machineName={createTransversal || !createTargetEquipos ? '' : `${createTargetEquipos.label}${createTargetEquipos.nodeIds.length > 1 ? ` · ${createTargetEquipos.nodeIds.length} equipos` : ''}`}
        transversal={createTransversal}
        defaultClase={createTransversal ? 'insumo' : 'repuesto'}
        onCheckDuplicate={checkDuplicate}
        onChangeTarget={() => { setCreateOpen(false); setCreateEquipoQuery(''); setCreateEquipoSel(new Set()); setCreatePicker(true) }}
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

      {/* Fotos (lectura para todos; editable para admin) — unifica lo que antes
          eran dos botones: "Fotos" (fotosReales + imágenes de manual, editable) y
          "Galería" (campo `gallery`, ahora sección solo-lectura dentro de este modal). */}
      {actionTarget?.kind === 'photos' && actionRep && (
        <RepuestoPhotosModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          fotosReales={actionRep.fotosReales || []}
          imagenesManual={actionRep.imagenesManual || []}
          gallery={actionRep.gallery || []}
          repuestoName={actionRep.textoBreve || actionRep.codigoSAP || 'Repuesto'}
          isAdmin={isAdmin}
          machineId={actionMachineId}
          repuestoId={actionRep.id}
          machineName={actionTarget.source.machineName}
          codigoSAP={actionRep.codigoSAP}
          onSaveFotos={isAdmin ? handleSaveFotosReales : undefined}
        />
      )}

      {/* Vínculos al manual */}
      {actionTarget?.kind === 'manual' && actionRep && (
        <RepuestoManualModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          repuesto={actionRep}
          manualesHeredados={manualesHeredadosModal}
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

      {/* Lightbox de fotos abierto desde la miniatura de una fila */}
      {rowLightbox && <ImageLightbox photos={rowLightbox} onClose={() => setRowLightbox(null)} />}

    </div>
  )
}
