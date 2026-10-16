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
import { Search, ChevronRight, ChevronLeft, ChevronDown, ChevronUp, Cog, ImageOff, Plus, ClipboardList, Menu, History, Trash2, Star, Download, X, MoreVertical, Copy, Check, Boxes, Wrench, Settings2, MapPin, Shapes, Image as ImageIcon, MoreHorizontal, MessageCircle } from 'lucide-react'
import { isCommonPartSap, machinesForCommonSap } from '@/data/commonPartsByMachine'
import { esComun, esDespiece, contarCon } from '@/hooks/repuestos/filtrosDeRepuestos'
import { quitarEquipoDeRepuesto } from '@/hooks/repuestos/quitarEquipo'
import { esCodigoSapValido } from '@/utils/repuestos/exportBomSAP'
import { findMachineBySlug, LEARNING_MACHINES, isCourseMachine } from '@/data/learningMachines'
import { Badge, Button, Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui'
import { AreaSidebar } from '@/components/repuestos/AreaSidebar'
import { RepuestoDetailPanel } from '@/components/repuestos/RepuestoDetailPanel'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import { SolicitarRepuestoModal, type RepuestoLite } from '@/components/repuestos/SolicitarRepuestoModal'
import { SolicitarVariosSheet } from '@/components/repuestos/SolicitarVariosSheet'
import type { PiezaSolicitable } from '@/utils/repuestos/solicitudMultiple'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'

/** Lo que el formulario de solicitud muestra de bodega. Sin `bodegaId` el stock no se conoce. */
function stockDeSolicitud(r: { bodegaId?: string | null; stockActual: number; unidad?: string; ubicacionBodega?: string }): StockDeSolicitud {
  return { configurado: !!r.bodegaId, stockActual: r.stockActual, unidad: r.unidad, ubicacionBodega: r.ubicacionBodega }
}
import { SolicitudesPanel } from '@/components/repuestos/SolicitudesPanel'
import { esAlta, useSolicitudes, type AltaCodigo, type NuevaSolicitud, type OrigenSap, type SolicitudEstado } from '@/hooks/repuestos/useSolicitudes'
import { useAuthStore, useIsAdmin } from '@/store/authStore'
import { AuditLogPanel } from '@/components/repuestos/AuditLogPanel'
import { TrashPanel } from '@/components/repuestos/TrashPanel'
import { getTrashCount } from '@/services/auditLog'
import { buscarDestinoDeFusion, buscarRepuestoPorSap } from '@/services/repuestos/asignarSapMaestro'
import { useHierarchyAreaTree, type AreaTreeNode } from '@/hooks/useHierarchyAreaTree'
import { useGlobalSearch, invalidateGlobalRepuestosCache, type GlobalSearchResult } from '@/hooks/repuestos/useGlobalSearch'
import { useGlobalEquipmentSearch, getGlobalEquipmentCache } from '@/hooks/useGlobalEquipmentSearch'
import { Link, useNavigate } from 'react-router-dom'
import { dibujoDe, leerVueltaDelDibujo, maquinaDeDespiece, recordarVueltaDelDibujo, useFigurasDespiece } from './enlacesPieza'
import { rutaExpedienteEquipo } from '@/services/equipos/enlaceExpediente'
import { useBodega } from '@/hooks/repuestos/useBodega'
import { useAreaRepuestos, type StockStatus, type AreaRepuestoRow } from '@/hooks/repuestos/useAreaRepuestos'
import { useHierarchyPaths } from '@/hooks/repuestos/useHierarchyPaths'
import { equipoParaMostrar, plantaCorta, agruparDondeSeUsa } from '@/hooks/repuestos/dondeSeUsa'
import { facetasDeEquipo, filtraPorFaceta, grupoEnFaceta, type Faceta } from '@/utils/repuestos/facetasEquipo'
import { marcasDeFavorito, type MarcasFavorito } from '@/utils/repuestos/favoritosUnificado'
import { ChipsEquipo } from '@/components/repuestos/ChipsEquipo'
import { DondeSeUsaPills } from '@/components/repuestos/DondeSeUsaPills'
import { FiltrosRepuestosSheet, type OpcionFiltro } from '@/components/repuestos/FiltrosRepuestosSheet'
import { areaContenedora, conteosConfiables } from '@/hooks/repuestos/alcanceDeAreas'
import { apodosCambiaron, apodosDesdeTexto } from '@/hooks/repuestos/apodosDeRepuesto'
import { useManualesDeEquipos } from '@/hooks/repuestos/useManualesDeEquipos'
import { getRepuestoFavListsGlobal, saveRepuestoFavListsGlobal, getUserPreferences, saveFavoriteLists, type RepuestoFavList, type FavList } from '@/services/userPreferences'
import { useRepuestoCrud } from '@/hooks/repuestos/useRepuestoCrud'
import { useToast } from '@/hooks/useToast'
import { RepuestoFormModal } from '@/components/repuestos/RepuestoForm'
import { TechnicalSpecsModal } from '@/components/repuestos/TechnicalSpecsModal'
import { RepuestoPhotosModal } from '@/components/repuestos/RepuestoPhotosModal'
import { RepuestoManualModal } from '@/components/repuestos/RepuestoManualModal'
import { ExportReportModal, type SapEquipoContext } from '@/components/repuestos/ExportReportModal'
import { normalizeForSearch, haystackMatchesAll, deriveCentro } from '@/utils/repuestos'
import type { EquipoSap } from '@/utils/repuestos/exportBomSAP'
import { fotosParaEquipos } from '@/hooks/repuestos/documentacionDeRepuesto'
import { CLASE_LABEL, type Machine, type Repuesto, type RepuestoFormData, type TechnicalSpecs, type MachineImage } from '@/types/repuestos'
import { AREA_TACTIL_COMPACTA, AREA_TACTIL_EN_TARJETA } from '@/lib/areaTactil'
import { useRepuestoFavoritos } from '@/hooks/repuestos/useRepuestoFavoritos'
import { formatNombreSAP } from '@/utils/repuestos/formatNombreSAP'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import { indicePorSap, nombreVisiblePorSap, tituloOCodigo } from '@/utils/repuestos/nombrePorSap'
import { cn } from '@/lib/utils'
import { ResumenStockFila, type EstadoResumenStock } from '@/components/repuestos/ResumenStockFila'
import { resumenStock } from '@/utils/repuestos/resumenStock'
import { hayAlgoQueExportar } from '@/utils/repuestos/alcanceDeExportacion'
import { Button as PButton, CellIcon, ListCell, ListGroup, SegmentedControl, Sheet as PSheet } from '@/components/piel'
import { GaleriaRepuestos } from '@/components/repuestos/GaleriaRepuestos'
import { RepuestosEntrada, type AreaFila, type ListaFavoritos, type RecienteVisible } from '@/components/repuestos/RepuestosEntrada'
import { EditarFavoritosSheet } from '@/components/repuestos/EditarFavoritosSheet'
import { FotosHoverCard } from '@/components/repuestos/FotosHoverCard'
import {
  leerRecientesRepuestos, limpiarRecientesRepuestos, registrarRecienteEquipo, registrarRecienteRepuesto,
  type RecienteRepuesto,
} from '@/utils/repuestos/recientesRepuestos'
import { abrirAria, ocultarBurbujaChat } from '@/lib/pantallaCompletaMovil'

// Fase 4 normalización (2026-06): el hub lee/escribe la colección plana `repuestos`
// (equipos:[nodeIds]). Quedan para Fase 5: reubicar/importar/duplicados/manuales de
// equipo (eran machine-bound) reimplementados sobre el modelo plano.
type RepAction = 'edit' | 'specs' | 'photos' | 'manual' | 'delete'
type SortCol = 'codigoSAP' | 'codigoFabricante' | 'textoBreve' | 'equipo' | 'stock' | 'tipo'

type StockFilter = 'all' | StockStatus
const PAGE_SIZES = [8, 25, 50]

const STORAGE_KEY = 'repuestos-nav-node' // compartido con EquipmentNavigator
/** Mismo corte que el resto del módulo: bajo `sm` (640 px) es teléfono; desde ahí aparece el árbol fijo. */
const CORTE_TELEFONO = '(max-width: 639px)'
const esTelefono = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(CORTE_TELEFONO).matches

/** Etiqueta de tipo de repuesto (texto libre del catálogo); vacío → "Sin clasificar". */
const tipoLabelOf = (tipo?: string): string => (tipo || '').trim() || 'Sin clasificar'

const STOCK_META: Record<StockStatus, { label: string; dot: string; text: string }> = {
  ok: { label: 'Disponible', dot: 'bg-fill-ok', text: 'text-ink-ok' },
  low: { label: 'Bajo', dot: 'bg-fill-warning', text: 'text-ink-warn' },
  out: { label: 'Sin stock', dot: 'bg-fill-critical', text: 'text-ink-crit' },
  unset: { label: 'Sin config', dot: 'bg-muted-foreground/40', text: 'text-muted-foreground' },
}

/** Chip de la barra: 36 px visibles dentro de una zona táctil de 44. Activo = relleno de acento. */
function ChipBarra({ activo, className, children, ...rest }: { activo: boolean; className?: string; children: React.ReactNode } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>) {
  return (
    <button type="button" aria-pressed={activo} {...rest} className={cn('group inline-flex min-h-[44px] shrink-0 items-center disabled:opacity-40', className)}>
      <span
        className={cn(
          'inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 text-[length:calc(14px*var(--escala-texto,1))] font-medium transition-colors',
          activo ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground group-hover:bg-muted',
        )}
      >
        {children}
      </span>
    </button>
  )
}

/**
 * Fotos de una fila: las de bodega (reales del físico) primero, luego las del catálogo.
 * Con un equipo en foco, las capturas de manual de OTRA máquina se ocultan (una pieza
 * estándar tiene un dibujo del manual de la 142 y otro del de la 200: ver `fotosParaEquipos`).
 */
function fotosDeFila(
  r: { fotos?: string[]; fotosCatalogo?: string[]; equiposDeFoto?: Record<string, string[]> },
  equiposEnFoco?: readonly string[] | null,
): string[] {
  return [...(r.fotos ?? []), ...fotosParaEquipos(r.fotosCatalogo ?? [], r.equiposDeFoto, equiposEnFoco)].filter(Boolean)
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
  /** Abrir el panel de Solicitudes al entrar (enlace `?solicitudes=1` del aviso de Telegram). */
  abrirSolicitudes?: boolean
  onSolicitudesAbiertas?: () => void
}

export function RepuestosAreaHub({ initialQuery, onQueryConsumed, pendingCreate, onPendingCreateConsumed, abrirSolicitudes, onSolicitudesAbiertas }: RepuestosAreaHubProps = {}) {
  const { areaTree, findNode, getNodePath, expandNode, nodeNameMap } = useHierarchyAreaTree()

  // El catálogo (colección plana `repuestos`) referencia nodos de hierarchy por id;
  // el equipment cache aporta nombre/alias/path de cada nodo-equipo.
  const { loading: eqLoading } = useGlobalEquipmentSearch('', 999)
  const { isUnder, plantaDe, loading: pathsLoading } = useHierarchyPaths()
  // Unidades que tiene cada familia en cada planta (KNURO en Chonchi: N1, N2, N3), para que
  // «Dónde se usa» diga «todas» en vez de listar las tres.
  const totalUnidades = useMemo(() => {
    const todos = (getGlobalEquipmentCache() || []).filter((e) => !e.oculto && e.nombre).map((e) => ({ machineId: e.id, machineName: e.nombre }))
    const m = new Map<string, number>()
    for (const g of agruparDondeSeUsa(todos, plantaDe)) m.set(`${(g.planta ?? '').toUpperCase()}|${g.familia.toUpperCase()}`, g.unidades.length)
    return (familia: string, planta: string | undefined) => m.get(`${(planta ?? '').toUpperCase()}|${familia.toUpperCase()}`)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantaDe, eqLoading, pathsLoading])

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

  // nodeId de equipo → parentId. 456 de 648 equipos cuelgan de OTRO equipo: sin esto, elegir un
  // subequipo guardaba al equipo padre como «área» (ver alcanceDeAreas).
  const padreDeEquipo = useMemo(() => {
    const m = new Map<string, string | null>()
    for (const e of (getGlobalEquipmentCache() || [])) m.set(e.id, e.parentId ?? null)
    return m
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

  const { allRepuestos, loadAll, loadArea, loaded: repuestosLoaded, loading: repuestosLoading, catalogoCompleto, areasCargadas } = useGlobalSearch(machines)
  // allItems = TODOS los repuestos del área (con y sin SAP); el stock se engancha si hay SAP.
  const { allItems: bodegaItems, loading: bodegaLoading, loadMovimientos, saveStock, registrarSalidaDeSolicitud, overlayDeSap, registrarConteoRapido } = useBodega(allRepuestos)
  // SAP -> repuesto del catálogo cargado: resuelve el nombre común de lo que solo guarda `textoBreve`.
  const indiceNombresPorSap = useMemo(() => indicePorSap(bodegaItems), [bodegaItems])

  // membership repuesto(machineId) → área: vía equipment cache, con fallback a ancestría directa
  const machineInArea = useCallback(
    (machineId: string, areaId: string) => machineAreas.get(machineId)?.has(areaId) ?? isUnder(machineId, areaId),
    [machineAreas, isUnder],
  )

  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(() => {
    // En el teléfono se entra por «Buscador primero» (recientes, favoritos, áreas): no se restaura el
    // último área, que escondía la entrada para siempre. El área guardada sigue valiendo en PC.
    if (esTelefono()) return null
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
    // Un id guardado que es un EQUIPO (lo dejaba el buscador de la barra) se corrige a su área
    // antes de consultar: si no, se bajaban los ~2.000 docs de una Baader con «Selecciona un área».
    const area = areaContenedora(selectedAreaId, padreDeEquipo)
    if (selectedAreaId && area !== selectedAreaId) {
      setSelectedAreaId(area)
      return
    }
    if (showingAll || !selectedAreaId) {
      loadAll()
    } else {
      loadArea(selectedAreaId)
    }
  }, [machines, showingAll, selectedAreaId, loadAll, loadArea, padreDeEquipo])
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

  // Si venimos de «atrás» desde el dibujo, reponer búsqueda y panel (se consume una vez).
  const [vueltaDelDibujo] = useState(() => leerVueltaDelDibujo())

  // Filtros + paginación de la tabla de repuestos
  const [repQuery, setRepQuery] = useState(() => vueltaDelDibujo?.q ?? '')
  // Al empezar a buscar, llevar la lista a la vista: el aterrizaje del área
  // deja al usuario scrolleado en el dashboard y los resultados aparecían
  // "abajo", fuera de pantalla (se notaba sobre todo en móvil).
  const listSectionRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!repQuery.trim()) return
    listSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [repQuery])
  // Faceta de equipo (chips sobre los resultados): reemplaza al desplegable «Todos los equipos».
  const [facetaEquipo, setFacetaEquipo] = useState<Faceta | null>(null)
  // «Bajo o sin stock»: chip de la barra (atajo de lo más pedido en planta).
  // «común sin stock» de la fila de resumen: solo vale junto con stock = 'out' (ver comunSinStockActivo).
  const [repComunSinStock, setRepComunSinStock] = useState(false)
  const [filtrosOpen, setFiltrosOpen] = useState(false)
  // Móvil: KPIs y filtros arrancan colapsados — entre el usuario y la primera
  // fila de repuestos había ~2 pantallas de dashboard. En desktop no aplica.
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
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(() => vueltaDelDibujo?.rowKey ?? null)


  // Lightbox de fotos desde la miniatura de la fila (sin pasar por el detalle)
  const [rowLightbox, setRowLightbox] = useState<{ photos: string[]; index: number } | null>(null)
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
  const { solicitudes, loading: solicitudesLoading, pendientesCount, crearSolicitud, avanzarEstado, registrarAltaCreada, rechazarAlta } = useSolicitudes()
  const [solicitarOpen, setSolicitarOpen] = useState(false)
  const [solicitarRepuesto, setSolicitarRepuesto] = useState<RepuestoLite | null>(null)
  // «Solicitar repuestos» de la máquina enfocada: varios de una vez.
  const [solicitarVariosOpen, setSolicitarVariosOpen] = useState(false)
  const [solicitudesOpen, setSolicitudesOpen] = useState(false)
  useEffect(() => {
    if (!abrirSolicitudes) return
    setSolicitudesOpen(true)
    onSolicitudesAbiertas?.()
  }, [abrirSolicitudes, onSolicitudesAbiertas])

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
  // configurado ahí). Si no hay bodega para el SAP, no se inventa un registro (evita el latente
  // rechazo de firestore.rules por ubicacionBodega vacía) — avanza el estado y LO DICE.
  // Se decide sobre la bodega (entera en memoria), no sobre las filas del catálogo cargado:
  // el catálogo va por área y una solicitud de otra área se entregaba sin descontar nada.
  const handleAvanzarSolicitud = useCallback(
    async (id: string, next: SolicitudEstado) => {
      // Las altas de código tienen su propio ciclo (registrar SAP / rechazar): nunca avanzan ni descuentan stock.
      const pedida = solicitudes.find((s) => s.id === id)
      if (pedida && esAlta(pedida)) return
      if (next === 'entregada' && user) {
        const sol = pedida
        if (sol) {
          try {
            const plan = await registrarSalidaDeSolicitud(
              sol.codigoSAP,
              sol.cantidad,
              `Entrega solicitud · ${sol.solicitadoPorNombre || 'usuario'}`,
              user.id,
              user.nombre,
            )
            const nombre = nombreVisiblePorSap(indiceNombresPorSap, sol.codigoSAP, sol.textoBreve).titulo
            if (plan.accion === 'sin-bodega') {
              toast({ title: 'Entregada sin descontar stock', description: `${nombre} no tiene registro en bodega.` })
            } else if (plan.faltante > 0) {
              toast({
                title: 'Stock descontado, pero no alcanzaba',
                description: `Bodega registraba ${plan.stockAntes} y se entregaron ${sol.cantidad}: quedó en 0. Conviene contar ${nombre}.`,
                variant: 'destructive',
              })
            } else {
              toast({ title: 'Stock descontado', description: `-${sol.cantidad} ${nombre} · quedan ${plan.stockDespues}`, variant: 'success' })
            }
          } catch {
            toast({ title: 'No se pudo descontar el stock', description: 'La solicitud sigue pendiente de entrega — reintenta.', variant: 'destructive' })
            return // no avanzar a "entregada" si el descuento de stock falló
          }
        }
      }
      await avanzarEstado(id, next, user?.id ?? '', user?.nombre ?? '')
    },
    [solicitudes, user, registrarSalidaDeSolicitud, avanzarEstado, toast, indiceNombresPorSap],
  )
  // Alta de código (ficha A3C): bodega registra el SAP que creó, o rechaza con motivo. El panel pinta los
  // bloques y valida; acá se escribe en el maestro (asigna / completa / crea `repuestos/{SAP}`) y en la solicitud.
  const handleRegistrarSapAlta = useCallback(
    async (alta: AltaCodigo, sap: string, origen: OrigenSap) => {
      if (!user) throw new Error('Hay que iniciar sesión.')
      try {
        await registrarAltaCreada(alta, sap, origen, user.id, user.nombre)
      } catch (e) {
        toast({
          variant: 'destructive',
          title: 'No se pudo registrar el SAP',
          // Los errores de negocio (SAP de otro repuesto, alta ya cerrada por otro operador) traen su texto.
          description: e instanceof Error && e.name === 'ErrorAltaSap' ? e.message : 'La alta sigue pendiente: reintenta.',
        })
        throw e
      }
      invalidateGlobalRepuestosCache()
      toast({ title: 'Alta registrada', description: `${alta.codigoFabricante} ahora es SAP ${sap}.`, variant: 'success' })
    },
    [user, registrarAltaCreada, toast],
  )
  const handleRechazarAlta = useCallback(
    async (alta: AltaCodigo, motivo: string) => {
      if (!user) throw new Error('Hay que iniciar sesión.')
      try {
        await rechazarAlta(alta.id, motivo, user.id, user.nombre)
      } catch (e) {
        toast({ variant: 'destructive', title: 'No se pudo rechazar', description: 'Reintenta en un momento.' })
        throw e
      }
      toast({ title: 'Alta rechazada', description: `${alta.codigoFabricante}: quien la pidió verá el motivo.` })
    },
    [user, rechazarAlta, toast],
  )
  // Registrar o rechazar un alta es de bodega: técnico, supervisor o admin (igual que firestore.rules).
  const puedeResolverAltas = user?.rol === 'tecnico' || user?.rol === 'supervisor' || user?.rol === 'admin'
  const buscarSapEnMaestro = useCallback(async (sap: string) => {
    const r = await buscarRepuestoPorSap(sap)
    return r ? { nombre: r.textoBreve || r.codigoFabricante || 'Repuesto', codigoFabricante: r.codigoFabricante || '' } : null
  }, [])
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
  // Los favoritos salen del hook compartido: la misma lista que usan el expediente y Bodega.
  const { favKeys, toggleFav } = useRepuestoFavoritos(user?.id)
  const [repFavOnly, setRepFavOnly] = useState(false)
  // Móvil: «Con fotos» — la tira de miniaturas solo existe en filas con foto (4 % de las filas).
  const [repConFotos, setRepConFotos] = useState(false)
  // Vista «Lista» (tabla de siempre) o «Galería» (fotos + avance). Se recuerda por navegador.
  const [vistaRep, setVistaRep] = useState<'lista' | 'galeria'>(() => {
    try { return localStorage.getItem('repuestos.vista') === 'galeria' ? 'galeria' : 'lista' } catch { return 'lista' }
  })
  const cambiarVistaRep = useCallback((v: 'lista' | 'galeria') => {
    setVistaRep(v)
    try { localStorage.setItem('repuestos.vista', v) } catch { /* sin almacenamiento: no se recuerda */ }
  }, [])
  // Repuesto cuya cámara se tocó en la galería: se abre su flujo de fotos cuando ya es el seleccionado.
  const [fotoPendienteKey, setFotoPendienteKey] = useState<string | null>(null)
  // Picker "marcar como común de [máquina]" (abierto desde el panel de detalle).
  const [comunPickerOpen, setComunPickerOpen] = useState(false)
  const [comunQuery, setComunQuery] = useState('')

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
  const [favCargando, setFavCargando] = useState(true)
  useEffect(() => {
    if (!user?.id) { setFavCargando(false); return }
    getUserPreferences(user.id).then((p) => setEquipFavLists(p.favoriteLists || [])).catch(() => {}).finally(() => setFavCargando(false))
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
  // Hoja de edición de favoritos de equipos. La estrella del árbol NUNCA quita: si el equipo ya es
  // favorito avisa, y si no lo es abre la hoja con ese equipo preseleccionado. Quitar solo se hace
  // desde la hoja, y pide la clave al guardar.
  const [editarFav, setEditarFav] = useState<{ equipo?: { id: string; nombre: string } } | null>(null)
  const handleEquipStar = useCallback((machineId: string, _e: unknown, displayName?: string) => {
    if (isEquipFav(machineId)) {
      toast({ title: 'Ya está en favoritos', description: 'Para quitarlo, usa «Editar» en Favoritos de equipos.' })
    } else {
      setEditarFav({ equipo: { id: machineId, nombre: displayName || machineId } })
    }
  }, [isEquipFav, toast])
  const guardarEquipFav = useCallback(async (next: FavList[]) => {
    persistEquipLists(next)
  }, [persistEquipLists])

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

  // ── Entrada del teléfono: recientes, menú ⋯ y búsqueda ──
  const [recientes, setRecientes] = useState<RecienteRepuesto[]>(() => leerRecientesRepuestos())
  // El nombre guardado en «Recientes» es solo respaldo: se resuelve contra el catálogo ya cargado para
  // que un nombre común agregado después aparezca. `oficial` = nombre SAP bajo el nombre común.
  const recientesVisibles = useMemo<RecienteVisible[]>(() => {
    if (!recientes.some((r) => r.tipo === 'repuesto')) return recientes
    const porSap = new Map<string, (typeof bodegaItems)[number]>()
    for (const it of bodegaItems) {
      const sap = it.codigoSAP?.trim()
      if (sap && !porSap.has(sap)) porSap.set(sap, it)
    }
    return recientes.map((r) => {
      const it = r.tipo === 'repuesto' ? porSap.get(r.id) : undefined
      if (!it) return r
      const v = nombreVisible(it)
      return { ...r, nombre: v.titulo, oficial: v.oficial, resuelto: true }
    })
  }, [recientes, bodegaItems])
  const [menuMasOpen, setMenuMasOpen] = useState(false)
  /** `showingAll` lo levantó el buscador (no el usuario): al borrar el texto se devuelve. */
  const autoTodasRef = useRef(false)
  // La burbuja de ARIA tapaba estrellas y filas en todo Repuestos: en el teléfono se esconde
  // (ARIA queda en el menú ⋯ y como última fila de una búsqueda).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(CORTE_TELEFONO)
    let baja: (() => void) | null = null
    const sync = () => {
      if (mq.matches && !baja) baja = ocultarBurbujaChat()
      else if (!mq.matches && baja) { baja(); baja = null }
    }
    sync()
    mq.addEventListener('change', sync)
    return () => { mq.removeEventListener('change', sync); baja?.() }
  }, [])

  // Clic en chip de equipo → ir a su área + filtrar la tabla a ese equipo + revelar equipos.
  const handleFavEquipClick = useCallback((favKey: string, displayName?: string, areaIdHint?: string | null) => {
    const eq = getGlobalEquipmentCache() || []
    const e = eq.find((x) => (x.linkedMachineId || x.id) === favKey) || eq.find((x) => x.id === favKey)
    // areaIdHint: el área que el sidebar ya conoce (no depende del cache). Si no
    // viene (chips de favoritos), se deriva del cache de equipos.
    const areaId = areaContenedora(areaIdHint || e?.parentId || (e?.path && e.path.length ? e.path[e.path.length - 1] : null), padreDeEquipo)
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
    // El equipo enfocado manda sobre la faceta (ver scopedRepuestos).
    setFacetaEquipo(null)
    // Clave = id del NODO del equipo (para resaltarlo en el sidebar).
    setSelectedEquipKey(e?.id ?? favKey)
    // Identidad del equipo en el modelo plano = nodeId (clave de r.equipos[].machineId).
    // favKey puede ser un linkedMachineId legacy (favoritos viejos) → traducir al nodo.
    setSelectedEquipMachineId(e?.id ?? favKey)
    const nombreEquipo = displayName || (e as { alias?: string } | undefined)?.alias || e?.nombre || (m ? m.nombre : favKey)
    setSelectedEquipName(nombreEquipo)
    setSelectedRowKey(null)
    setSidebarMobileOpen(false)
    registrarRecienteEquipo(e?.id ?? favKey, nombreEquipo)
    setRecientes(leerRecientesRepuestos())
  }, [machines, getNodePath, padreDeEquipo])
  useEffect(() => {
    if (isAdmin) getTrashCount().then(setTrashCount).catch(() => {})
  }, [isAdmin, trashOpen])

  const openSolicitar = useCallback((rep: RepuestoLite | null) => {
    setSolicitarRepuesto(rep)
    setSolicitarOpen(true)
  }, [])

  const handleCrearVarias = useCallback(async (lineas: NuevaSolicitud[]) => {
    for (const l of lineas) await crearSolicitud(l, user?.id ?? 'anon', user?.nombre ?? 'Anónimo')
    setSolicitarVariosOpen(false)
    const unidades = lineas.reduce((a, l) => a + l.cantidad, 0)
    toast({
      title: `${lineas.length} ${lineas.length === 1 ? 'solicitud creada' : 'solicitudes creadas'}`,
      description: `${unidades} unidades para ${selectedEquipName}. Quedan en «Solicitudes» y se avisa al grupo de Mantención en Telegram.`,
      variant: 'success',
    })
  }, [crearSolicitud, user, toast, selectedEquipName])

  const handleCrearSolicitud = useCallback(
    async (data: Parameters<typeof crearSolicitud>[0]) => {
      await crearSolicitud(data, user?.id ?? 'anon', user?.nombre ?? 'Anónimo')
      // Antes el formulario solo se cerraba: nada decía que la solicitud había salido ni dónde verla.
      toast({
        title: 'Solicitud creada',
        description: `${nombreVisiblePorSap(indiceNombresPorSap, data.codigoSAP, data.textoBreve).titulo} ×${data.cantidad}. Queda en «Solicitudes» y se avisa al grupo de Mantención en Telegram.`,
        variant: 'success',
      })
    },
    [crearSolicitud, user, toast, indiceNombresPorSap],
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
  const repCountTodos = useMemo(() => {
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
  // Solo los nodos cuyos repuestos están TODOS en memoria: el hub carga el área guardada, no el
  // catálogo, y contar las demás con eso daba «PLANTA CHONCHI · 1961» siendo 4.409.
  const repCountByNode = useMemo(
    () => conteosConfiables(repCountTodos, catalogoCompleto, areasCargadas, isUnder),
    [repCountTodos, catalogoCompleto, areasCargadas, isUnder],
  )

  const selectedNode = useMemo(
    () => (selectedAreaId ? findNode(selectedAreaId) : null),
    [selectedAreaId, findNode],
  )

  // Identidad SAP del equipo que se está viendo, para exportar su lista de materiales (IB01).
  // El centro sale del ÁRBOL, nunca del nombre: los equipos se llaman igual en las dos plantas.
  const sapEquipo = useMemo((): SapEquipoContext | undefined => {
    if (!selectedEquipMachineId) return undefined
    const eq = (getGlobalEquipmentCache() || []).find((e) => e.id === selectedEquipMachineId)
    if (!eq?.codigo) return undefined
    const ancestros = (eq.path || []).map((id) => nodeNameMap.get(id) || '').filter(Boolean)
    return {
      codigo: eq.codigo,
      nombre: eq.alias || eq.nombre || selectedEquipName || eq.codigo,
      centro: deriveCentro(ancestros),
    }
    // eqLoading: el cache de equipos no es reactivo, sin esto el primer render se queda
    // con el cache vacio y la pestana SAP no aparece hasta reabrir el modal.
  }, [selectedEquipMachineId, selectedEquipName, nodeNameMap, eqLoading])


  // Equipos del alcance visible (area elegida, o toda la planta), para exportar sus BOM de una
  // pasada. Solo los que tienen codigo SAP: un nodo sin codigo no es un equipo cargable en SAP.
  const sapEquipos = useMemo((): EquipoSap[] => {
    const cache = getGlobalEquipmentCache() || []
    return cache
      .filter((e) => !e.oculto && !!e.codigo)
      .filter((e) => showingAll || !selectedAreaId || (e.path || []).includes(selectedAreaId))
      .map((e) => ({
        id: e.id,
        codigo: e.codigo,
        nombre: e.alias || e.nombre || e.codigo,
        centro: deriveCentro((e.path || []).map((id) => nodeNameMap.get(id) || '').filter(Boolean)),
      }))
    // Idem: sin eqLoading la primera apertura del modal ofrece 0 equipos.
  }, [showingAll, selectedAreaId, nodeNameMap, eqLoading])

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
    return areaRepuestos
  }, [areaRepuestos, selectedEquipKey, selectedEquipMachineId])

  // Piezas de la máquina enfocada, como las ve «Solicitar repuestos»: comunes, stock y BOM.
  const piezasDeLaMaquina = useMemo<PiezaSolicitable[]>(() => scopedRepuestos.map((r) => ({
    clave: r.rowKey, codigoSAP: r.codigoSAP, textoBreve: r.textoBreve, nombresComunes: r.nombresComunes, codigoFabricante: r.codigoFabricante || undefined,
    comun: esComun(r), cantidadPorMaquina: r.cantidadPorMaquina, stock: stockDeSolicitud(r),
  })), [scopedRepuestos])


  // Qué equipo nombra la columna «Equipo» cuando hay foco o faceta (ver equipoParaMostrar).
  const equipoEnFaceta = useCallback(
    (e: { machineId: string; machineName: string }, f: Faceta) =>
      agruparDondeSeUsa([e], plantaDe).some((g) => grupoEnFaceta(g, f)),
    [plantaDe],
  )

  /**
   * Tipos que ya existen, para sugerirlos al editar/crear un material.
   *
   * Sale de `areaRepuestos` y NO de `scopedRepuestos`: las sugerencias no deben encogerse
   * porque el usuario tenga un equipo enfocado. `tipo` es texto libre (66 valores en uso y la
   * lista no está cerrada), así que esto alimenta un <datalist> — sugiere, no obliga.
   */
  const tiposConocidos = useMemo(() => {
    const s = new Set<string>()
    for (const r of areaRepuestos) { const t = (r.tipo || '').trim(); if (t) s.add(t) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [areaRepuestos])

  // Opciones para el selector del modal de solicitud (repuestos del área con SAP)
  const solicitarOptions = useMemo<RepuestoLite[]>(
    () => areaRepuestos.map((r) => ({ codigoSAP: r.codigoSAP, textoBreve: r.textoBreve, nombresComunes: r.nombresComunes, stock: stockDeSolicitud(r) })),
    [areaRepuestos],
  )

  // ── Filtrado ──────────────────────────────────────────────────────────────────────────
  // Orden: alcance (máquina del árbol) → búsqueda y filtros → foco SAP → [chips de equipo] →
  // faceta → favoritos. Los chips de equipo se derivan de lo que queda ANTES de la faceta, para
  // que sus conteos sean los de lo que se está mirando y no los del catálogo.
  const nombreDeSlug = useCallback((slug: string) => findMachineBySlug(slug)?.name ?? slug, [])

  // Multi-término con AND sobre el haystack unido: permite "máquina + pieza"
  // ("baader casquillo", "gea sello") — el flujo natural del usuario en planta.
  const coincideBusqueda = useMemo<Set<string> | null>(() => {
    const terms = normalizeForSearch(repQuery).split(/\s+/).filter(Boolean)
    if (!terms.length) return null
    const ok = new Set<string>()
    for (const r of scopedRepuestos) {
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
      if (haystackMatchesAll(hay, terms)) ok.add(r.rowKey)
    }
    return ok
  }, [scopedRepuestos, repQuery])

  const idsDeLista = useMemo(() => {
    if (listFilter === 'all') return null
    return new Set(favLists.find((x) => x.name === listFilter)?.repuestoIds ?? [])
  }, [listFilter, favLists])

  const comunSinStockActivo = repComunSinStock && repStockFilter === 'out'

  /** Filtros de la hoja y de la barra, salvo el que se omite (para contar sus opciones). */
  const pasaFiltros = useCallback((r: AreaRepuestoRow, omitir?: 'clase' | 'tipo' | 'stock' | 'lista'): boolean => {
    if (repConFotos && fotosDeFila(r).length === 0) return false
    if (omitir !== 'lista' && idsDeLista && !idsDeLista.has(r.rowKey)) return false
    if (omitir !== 'stock' && repStockFilter !== 'all' && r.stockStatus !== repStockFilter) return false
    if (omitir !== 'stock' && comunSinStockActivo && !esComun(r)) return false
    if (omitir !== 'clase' && repClaseFilter !== 'all' && (r.clase || 'repuesto') !== repClaseFilter) return false
    if (omitir !== 'tipo' && repTipoFilter !== 'all' && tipoLabelOf(r.tipo) !== repTipoFilter) return false
    return true
  }, [repConFotos, idsDeLista, repStockFilter, comunSinStockActivo, repClaseFilter, repTipoFilter])

  // Los equipos que definen el alcance de un repuesto: la máquina del árbol o la faceta de equipo.
  const equiposDelAlcance = useCallback((r: AreaRepuestoRow, f: Faceta | null) => {
    if (selectedEquipKey && selectedEquipMachineId) return r.equipos.filter((e) => e.machineId === selectedEquipMachineId)
    if (f) return r.equipos.filter((e) => equipoEnFaceta(e, f))
    return null
  }, [selectedEquipKey, selectedEquipMachineId, equipoEnFaceta])

  /** Marcas de la fila dentro del alcance: común del equipo y/o mía. */
  const marcasDe = useCallback(
    (r: AreaRepuestoRow, f: Faceta | null): MarcasFavorito => marcasDeFavorito(r, favKeys, equiposDelAlcance(r, f), nombreDeSlug),
    [favKeys, equiposDelAlcance, nombreDeSlug],
  )
  /** «★ Favoritos» activo: comunes del alcance ∪ mis estrellas del alcance, sin repetir. */
  const aplicaFavoritos = useCallback(
    (rows: AreaRepuestoRow[], f: Faceta | null) => {
      if (!repFavOnly) return rows
      return rows.filter((r) => { const m = marcasDe(r, f); return m.comun || m.mia })
    },
    [repFavOnly, marcasDe],
  )

  const baseSinFav = useMemo(
    () => scopedRepuestos.filter((r) => (!coincideBusqueda || coincideBusqueda.has(r.rowKey)) && pasaFiltros(r)),
    [scopedRepuestos, coincideBusqueda, pasaFiltros],
  )
  // Foco SAP: oculta el despiece sin código SAP (default). El conteo de lo oculto
  // alimenta el interruptor "ver despiece".
  const baseSap = useMemo(
    () => (repSoloSap ? baseSinFav.filter((r) => !esDespiece(r)) : baseSinFav),
    [baseSinFav, repSoloSap],
  )
  // Resultados sin la faceta de equipo: de acá salen los chips. Con una máquina elegida no hay chips
  // (la máquina ya es el filtro).
  const filasParaChips = useMemo(() => aplicaFavoritos(baseSap, null), [aplicaFavoritos, baseSap])
  const facetaEfectiva = useMemo<Faceta | null>(() => {
    if (!facetaEquipo || selectedEquipKey) return null
    const f = facetasDeEquipo(filasParaChips, plantaDe)
    return f.nivel === facetaEquipo.nivel && f.opciones.some((o) => o.clave === facetaEquipo.clave) ? facetaEquipo : null
  }, [facetaEquipo, selectedEquipKey, filasParaChips, plantaDe])

  const filteredBase = useMemo(() => {
    const enFaceta = facetaEfectiva ? baseSinFav.filter((r) => filtraPorFaceta(r, facetaEfectiva, plantaDe)) : baseSinFav
    return aplicaFavoritos(enFaceta, facetaEfectiva)
  }, [baseSinFav, facetaEfectiva, plantaDe, aplicaFavoritos])
  const filteredRep = useMemo(
    () => (repSoloSap ? filteredBase.filter((r) => !esDespiece(r)) : filteredBase),
    [filteredBase, repSoloSap],
  )
  const despieceOcultos = useMemo(
    () => (repSoloSap ? contarCon(filteredBase, esDespiece) : 0),
    [filteredBase, repSoloSap],
  )

  // Cuántas piezas tiene el chip «★ Favoritos»: comunes del alcance + mías del alcance, sin repetir.
  // El alcance es la máquina del árbol o la faceta de equipo activa (sin ellas, todo el área).
  // Sobre lo que deja la búsqueda y los filtros: el número del chip es lo que verá al tocarlo.
  const favoritosEnScope = useMemo(() => {
    const base = repSoloSap ? baseSinFav.filter((r) => !esDespiece(r)) : baseSinFav
    const filas = facetaEfectiva ? base.filter((r) => filtraPorFaceta(r, facetaEfectiva, plantaDe)) : base
    return contarCon(filas, (r) => { const m = marcasDe(r, facetaEfectiva); return m.comun || m.mia })
  }, [baseSinFav, repSoloSap, facetaEfectiva, plantaDe, marcasDe])

  // Resumen de la fila de stock: lo que se ve con TODOS los filtros menos el de stock (así tocar un
  // estado no deja a los demás en cero). Mismo orden que filteredRep: búsqueda/filtros → SAP → faceta → favoritos.
  const resumenVisible = useMemo(() => {
    const sinStock = scopedRepuestos.filter((r) => (!coincideBusqueda || coincideBusqueda.has(r.rowKey)) && pasaFiltros(r, 'stock'))
    const conSap = repSoloSap ? sinStock.filter((r) => !esDespiece(r)) : sinStock
    const enFaceta = facetaEfectiva ? conSap.filter((r) => filtraPorFaceta(r, facetaEfectiva, plantaDe)) : conSap
    return resumenStock(aplicaFavoritos(enFaceta, facetaEfectiva), esComun)
  }, [scopedRepuestos, coincideBusqueda, pasaFiltros, repSoloSap, facetaEfectiva, plantaDe, aplicaFavoritos])
  const estadoResumenActivo: EstadoResumenStock = comunSinStockActivo ? 'comunSinStock'
    : repStockFilter === 'ok' || repStockFilter === 'low' || repStockFilter === 'out' ? repStockFilter : null
  /** Tocar un estado lo fija; tocar el activo lo quita. «Común sin stock» = sin stock + solo comunes. */
  const elegirEstadoResumen = (e: Exclude<EstadoResumenStock, null>) => {
    if (estadoResumenActivo === e) { setRepStockFilter('all'); setRepComunSinStock(false); return }
    setRepStockFilter(e === 'comunSinStock' ? 'out' : e)
    setRepComunSinStock(e === 'comunSinStock')
  }

  // Qué equipo nombra la columna «Equipo» cuando hay foco o faceta (ver equipoParaMostrar).
  const preferirEquipo = useMemo(() => {
    if (selectedEquipMachineId) return (e: { machineId: string }) => e.machineId === selectedEquipMachineId
    if (facetaEfectiva) return (e: { machineId: string; machineName: string }) => equipoEnFaceta(e, facetaEfectiva)
    return undefined
  }, [selectedEquipMachineId, facetaEfectiva, equipoEnFaceta])
  // Equipo(s) en foco para elegir qué capturas de manual se ven (null = todas).
  const equiposEnFoco = useMemo<string[] | null>(() => {
    if (selectedEquipMachineId) return [selectedEquipMachineId]
    if (facetaEfectiva) {
      const ids = new Set<string>()
      for (const r of areaRepuestos) for (const e of r.equipos) if (e.machineId && equipoEnFaceta(e, facetaEfectiva)) ids.add(e.machineId)
      return ids.size ? [...ids] : null
    }
    return null
  }, [selectedEquipMachineId, facetaEfectiva, areaRepuestos, equipoEnFaceta])

  // Con «★ Favoritos» activo: qué es cada fila (común / mía) y de qué equipo hablan las cabeceras.
  const marcasFav = useMemo(() => {
    const m = new Map<string, MarcasFavorito>()
    if (!repFavOnly) return m
    for (const r of filteredRep) m.set(r.rowKey, marcasDe(r, facetaEfectiva))
    return m
  }, [repFavOnly, filteredRep, marcasDe, facetaEfectiva])
  const etiquetaAlcance = useMemo(() => {
    if (selectedEquipKey) return formatNombreSAP(selectedEquipName).nombre || selectedEquipName || ''
    if (facetaEfectiva) return facetasDeEquipo(filasParaChips, plantaDe).opciones.find((o) => o.clave === facetaEfectiva.clave)?.etiqueta ?? ''
    return ''
  }, [selectedEquipKey, selectedEquipName, facetaEfectiva, filasParaChips, plantaDe])

  // Opciones de la hoja de filtros, contadas con TODOS los demás filtros puestos (solo con la hoja abierta).
  const opcionesHoja = useMemo(() => {
    if (!filtrosOpen) return null
    const filasSin = (omitir: 'clase' | 'tipo' | 'stock' | 'lista') => {
      const base = scopedRepuestos.filter((r) => (!coincideBusqueda || coincideBusqueda.has(r.rowKey)) && pasaFiltros(r, omitir) && (!repSoloSap || !esDespiece(r)))
      return aplicaFavoritos(facetaEfectiva ? base.filter((r) => filtraPorFaceta(r, facetaEfectiva, plantaDe)) : base, facetaEfectiva)
    }
    const contar = <T,>(filas: AreaRepuestoRow[], clave: (r: AreaRepuestoRow) => T): Map<T, number> => {
      const m = new Map<T, number>()
      for (const r of filas) { const k = clave(r); m.set(k, (m.get(k) ?? 0) + 1) }
      return m
    }
    const clases: OpcionFiltro[] = [...contar(filasSin('clase'), (r) => r.clase || 'repuesto').entries()]
      .map(([value, count]) => ({ value, count, label: CLASE_LABEL[value as keyof typeof CLASE_LABEL] ?? value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
    const tipos: OpcionFiltro[] = [...contar(filasSin('tipo'), (r) => tipoLabelOf(r.tipo)).entries()]
      .map(([value, count]) => ({ value, count, label: value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
    const porStock = contar(filasSin('stock'), (r) => r.stockStatus)
    const stocks: OpcionFiltro[] = [
      { value: 'ok', label: 'Disponible', count: porStock.get('ok') ?? 0 },
      { value: 'low', label: 'Bajo', count: porStock.get('low') ?? 0 },
      { value: 'out', label: 'Sin stock', count: porStock.get('out') ?? 0 },
    ]
    const sinLista = filasSin('lista')
    const listas: OpcionFiltro[] = favLists.map((l) => ({
      value: l.name, label: l.name,
      count: sinLista.filter((r) => l.repuestoIds.includes(r.rowKey)).length,
    }))
    // Despiece sin SAP que habría con los demás filtros (el interruptor lo suma o lo quita).
    const despiece = aplicaFavoritos(
      scopedRepuestos.filter((r) => esDespiece(r) && (!coincideBusqueda || coincideBusqueda.has(r.rowKey)) && pasaFiltros(r)
        && (!facetaEfectiva || filtraPorFaceta(r, facetaEfectiva, plantaDe))),
      facetaEfectiva,
    ).length
    return { clases, tipos, stocks, listas, despiece }
  }, [filtrosOpen, scopedRepuestos, coincideBusqueda, pasaFiltros, repSoloSap, aplicaFavoritos, facetaEfectiva, plantaDe, favLists])

  // Filtros de la HOJA activos (los de la barra —favoritos, bajo stock— se ven en la barra).
  // `repSoloSap` cuenta cuando se apaga: true es el default.
  const filtrosActivos =
    (repClaseFilter !== 'all' ? 1 : 0) +
    (repTipoFilter !== 'all' ? 1 : 0) +
    (repStockFilter !== 'all' ? 1 : 0) +
    (comunSinStockActivo ? 1 : 0) +
    (!repSoloSap ? 1 : 0) +
    (listFilter !== 'all' ? 1 : 0)
  const limpiarFiltrosHoja = () => {
    setRepClaseFilter('all'); setRepTipoFilter('all'); setRepStockFilter('all'); setRepComunSinStock(false); setRepSoloSap(true); setListFilter('all')
  }

  // Reset de página al cambiar área/filtros
  useEffect(() => { setRepPage(0) }, [selectedAreaId, showingAll, repQuery, facetaEfectiva, repStockFilter, repComunSinStock, repClaseFilter, repTipoFilter, repSoloSap, repFavOnly, repConFotos, listFilter, repPageSize])
  // La faceta de equipo es de ESTA búsqueda: al cambiar de área o de texto, se reinicia.
  useEffect(() => { setFacetaEquipo(null) }, [selectedAreaId, showingAll, repQuery])

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
      className={['cursor-pointer select-none px-3 py-2 text-nota font-medium transition-colors hover:text-foreground', className].filter(Boolean).join(' ')}
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

  const ordenadaRep = useMemo(() => {
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
        if (haystackMatchesAll(nombre, terms)) return 2
        return 3
      }
      return tierFirst([...filteredRep].sort((a, b) => {
        const d = score(a) - score(b)
        return d !== 0 ? d : a.textoBreve.localeCompare(b.textoBreve, 'es')
      }))
    }
    const dir = repSortDir === 'asc' ? 1 : -1
    // «Repuesto» se ordena por lo que se ve (nombre común o nombre SAP formateado). Se calcula una vez por fila.
    const tituloPorFila = new Map<AreaRepuestoRow, string>()
    const tituloDe = (r: AreaRepuestoRow): string => {
      let t = tituloPorFila.get(r)
      if (t === undefined) { t = nombreVisible(r).titulo; tituloPorFila.set(r, t) }
      return t
    }
    const val = (r: AreaRepuestoRow): string | number => {
      switch (repSortColumn) {
        case 'codigoSAP': return r.codigoSAP || ''
        case 'codigoFabricante': return r.codigoFabricante || ''
        case 'textoBreve': return tituloDe(r)
        case 'equipo': return equipoParaMostrar(r.equipos).nombre
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
  // «★ Favoritos» activo: las comunes del equipo primero (incluye las que además son mías), luego solo las mías.
  const sortedRep = useMemo(() => {
    if (!repFavOnly) return ordenadaRep
    const comunes: AreaRepuestoRow[] = []
    const resto: AreaRepuestoRow[] = []
    for (const r of ordenadaRep) (marcasFav.get(r.rowKey)?.comun ? comunes : resto).push(r)
    return [...comunes, ...resto]
  }, [ordenadaRep, repFavOnly, marcasFav])

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

  // Código de fabricante → figura del despiece (BAADER 142 y 200), para el acceso al dibujo.
  const figurasDespiece = useFigurasDespiece()
  const navigate = useNavigate()
  const irAlDibujo = useCallback((ruta: string, rowKey: string) => {
    recordarVueltaDelDibujo({ q: repQuery, rowKey })
    navigate(ruta)
  }, [navigate, repQuery])
  const selectedRep = useMemo(
    () => areaRepuestos.find((r) => r.rowKey === selectedRowKey) ?? null,
    [areaRepuestos, selectedRowKey],
  )
  // Al abrir el detalle de un repuesto con SAP, queda en «Recientes» de la entrada.
  const repAbierto = selectedRep?.codigoSAP?.trim() ?? ''
  const repAbiertoNombre = selectedRep ? nombreVisible(selectedRep).titulo : ''
  useEffect(() => {
    if (!repAbierto) return
    registrarRecienteRepuesto(repAbierto, repAbiertoNombre || repAbierto)
    setRecientes(leerRecientesRepuestos())
  }, [repAbierto, repAbiertoNombre])

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

  // Cámara de la galería «Sin foto»: selecciona la fila y, ya seleccionada, abre el flujo de fotos.
  useEffect(() => {
    if (fotoPendienteKey && selectedRep?.rowKey === fotoPendienteKey) {
      setFotoPendienteKey(null)
      startAction('photos')
    }
  }, [fotoPendienteKey, selectedRep, startAction])
  const fotosDeGaleria = useCallback((r: AreaRepuestoRow) => fotosDeFila(r, equiposEnFoco), [equiposEnFoco])
  const nombreDeGaleria = useCallback((r: AreaRepuestoRow) => nombreVisible(r), [])

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
      // Abrir y cerrar el editor sin cambiar nada no escribe, no audita, no recarga ~7.700 docs y
      // no dice «guardados» (ver apodosDeRepuesto). Lo usan la tabla y el panel del repuesto.
      if (!apodosCambiaron(row.nombresComunes, arr)) return
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
      await persistApodos(row, apodosDesdeTexto(editApodosVal))
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
      if (!esCodigoSapValido(sap)) {
        toast({ variant: 'destructive', title: 'Código SAP inválido', description: 'Debe ser numérico de 6 o más dígitos.' })
        return
      }
      const src = resolveSources(selectedRep)[0]
      if (!src) { toast({ variant: 'destructive', title: 'No se encontró la pieza base' }); return }
      setAsignarSapSaving(true)
      try {
        const despiece = src.repuesto
        const target = buscarDestinoDeFusion(sap, despiece.id, allRepuestos.map((r) => r.repuesto))
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

  // Quitar un equipo de la asignación N:M. Va por crudUpdate: recalcula areaIds y deja
  // historial y auditoría (el «Quitar del equipo» del expediente no hace ninguna de las dos).
  // Se aplica a TODOS los docs del SAP que tengan ese equipo: si queda en uno, el panel lo
  // seguiría mostrando.
  const handleQuitarEquipo = useCallback(
    async (nodeId: string) => {
      if (!selectedRep) return
      const node = (getGlobalEquipmentCache() || []).find((e) => e.id === nodeId)
      const nombre = node?.nombre || selectedRep.equipos.find((e) => e.machineId === nodeId)?.machineName || ''
      const cambios = resolveSources(selectedRep)
        .map((s) => ({ rep: s.repuesto, patch: quitarEquipoDeRepuesto(s.repuesto, { nodeId, codigo: node?.codigo, nombre }) }))
        .filter((c) => c.patch)
      if (!cambios.length) { toast({ title: 'Ese equipo ya no estaba asignado' }); return }
      try {
        for (const { rep, patch } of cambios) await crudUpdate('repuestos', rep.id, patch!, rep)
        toast({ title: 'Equipo quitado', description: nombre, variant: 'success' })
        await refreshCatalog()
      } catch (e) {
        toast({ variant: 'destructive', title: 'No se pudo quitar el equipo', description: e instanceof Error ? e.message : '' })
        throw e
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
    type Dup = { id: string; textoBreve: string; codigoSAP: string; nombresComunes?: string[] }
    const bySap = new Map<string, Dup>()
    const byName = new Map<string, Dup>()
    for (const r of allRepuestos) {
      const sap = (r.repuesto.codigoSAP || '').trim()
      const entry = { id: r.repuesto.id, textoBreve: r.repuesto.textoBreve, codigoSAP: sap, nombresComunes: r.repuesto.nombresComunes }
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
    autoTodasRef.current = false
    setSelectedAreaId(node.id)
    setShowingAll(false)
    // Seleccionar el área (no un equipo) limpia el filtro de equipo → muestra todo el área.
    setFacetaEquipo(null)
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
    autoTodasRef.current = false
    setShowingAll(true)
    setSelectedAreaId(null)
    setFacetaEquipo(null)
    setSelectedEquipKey(null)
    setSelectedEquipMachineId(null)
    setSelectedEquipName('')
  }, [])

  // Quita la máquina elegida en el árbol (la marca «en <máquina>» del buscador y «Volver a…»).
  const quitarFocoMaquina = useCallback(() => {
    setFacetaEquipo(null)
    setSelectedEquipKey(null)
    setSelectedEquipMachineId(null)
    setSelectedEquipName('')
  }, [])


  // Si hay un equipo seleccionado, el título es el equipo (no el área); el área baja al breadcrumb.
  const title = selectedEquipKey
    ? (selectedEquipName || 'Equipo')
    : (showingAll ? 'Todas las áreas' : (selectedNode ? (formatNombreSAP(selectedNode.nombre).nombre || selectedNode.nombre) : 'Selecciona un área'))

  // Marca «en BAADER 142 N2 · Chonchi» junto al buscador: dice que la búsqueda está acotada a una máquina.
  const nombreMaquinaFoco = formatNombreSAP(selectedEquipName).nombre || selectedEquipName
  const plantaMaquinaFoco = selectedEquipMachineId ? plantaCorta(plantaDe(selectedEquipMachineId)) : ''
  const marcaMaquina = selectedEquipKey && nombreMaquinaFoco ? (
    <button
      type="button"
      onClick={quitarFocoMaquina}
      aria-label={`Quitar el filtro de máquina: ${nombreMaquinaFoco}`}
      className="inline-flex min-h-[44px] max-w-full shrink-0 items-center"
    >
      <span className="inline-flex min-h-[36px] max-w-full items-center gap-1.5 rounded-full bg-primary/[0.13] pl-3.5 pr-2.5 text-subhead font-medium text-brand-ink">
        <span className="truncate">en {nombreMaquinaFoco}{plantaMaquinaFoco ? ` · ${plantaMaquinaFoco}` : ''}</span>
        <X className="size-4 shrink-0" aria-hidden />
      </span>
    </button>
  ) : null

  // Línea que NOMBRA lo activo: «41 en Chonchi · Clase: Repuesto · Bajo o sin stock».
  const lineaResultados = (() => {
    const donde = selectedEquipKey && nombreMaquinaFoco
      ? nombreMaquinaFoco
      : etiquetaAlcance || (showingAll ? 'todas las áreas' : (formatNombreSAP(selectedNode?.nombre).nombre || selectedNode?.nombre || 'el área'))
    const partes = [
      `${filteredRep.length.toLocaleString('es-CL')} ${filteredRep.length === 1 ? 'repuesto' : 'repuestos'} en ${donde}`,
      repQuery.trim() ? `«${repQuery.trim()}»` : '',
      repClaseFilter !== 'all' ? `Clase: ${CLASE_LABEL[repClaseFilter as keyof typeof CLASE_LABEL] ?? repClaseFilter}` : '',
      repTipoFilter !== 'all' ? `Tipo: ${repTipoFilter}` : '',
      repStockFilter !== 'all' ? `Stock: ${({ ok: 'Disponible', low: 'Bajo', out: 'Sin stock', unset: 'Sin config.' } as Record<string, string>)[repStockFilter] ?? repStockFilter}` : '',
      comunSinStockActivo ? 'Solo comunes' : '',
      repFavOnly ? 'Favoritos' : '',
      repConFotos ? 'Con fotos' : '',
      listFilter !== 'all' ? `Lista: ${listFilter}` : '',
      !repSoloSap ? 'Con despiece sin SAP' : '',
    ]
    return partes.filter(Boolean).join(' · ')
  })()

  // Herramientas admin de catálogo — compartidas entre toolbar desktop y overflow móvil.
  // (Fase 4) Importar / duplicados / gestor de máquinas quedaron fuera: eran
  // machine-bound; se reimplementan sobre la colección plana en Fase 5.
  // Sin área, equipo ni búsqueda no hay nada que exportar: el teléfono lo dice en vez de abrir el
  // Centro de Reportes vacío («0 ítems»). La barra del PC no cambia.
  const puedeExportar = hayAlgoQueExportar({ areaId: selectedAreaId, mostrandoTodo: showingAll, equipoKey: selectedEquipKey, busqueda: repQuery })
  const adminTools: Array<{ key: string; icon: typeof Download; label: string; onClick: () => void; badge?: number; deshabilitada?: boolean; motivo?: string }> = isAdmin
    ? [
        { key: 'export', icon: Download, label: 'Exportar reporte', onClick: () => setExportOpen(true), deshabilitada: !puedeExportar, motivo: 'Elige un equipo o un área primero' },
        { key: 'audit', icon: History, label: 'Historial de cambios', onClick: () => setAuditLogOpen(true) },
        { key: 'trash', icon: Trash2, label: 'Papelera', onClick: () => setTrashOpen(true), badge: trashCount },
      ]
    : []

  const equipFavTotal = equipFavLists.reduce((n, l) => n + l.machineIds.length, 0)

  // ── Entrada del teléfono ──
  // Sin área, equipo ni búsqueda: en vez de «Selecciona un área» y ceros, las tres listas.
  const entradaMovil = !selectedAreaId && !showingAll && !selectedEquipKey && !repQuery.trim()
  const listasFavoritos: ListaFavoritos[] = equipFavLists.map((l) => ({
    nombre: l.name,
    items: l.machineIds.map((id) => ({ id, nombre: l.machineNames?.[id] || equipNameMap.get(id) || id })),
  }))
  const areasEntrada: AreaFila[] = ((areaTree.length === 1 && areaTree[0]!.children.length > 0) ? areaTree[0]!.children : areaTree)
    .map((n) => ({
      id: n.id,
      nombre: n.nombre,
      equipos: (function c(x: AreaTreeNode): number { let t = x.equipmentCount; x.children.forEach((y) => { t += c(y) }); return t })(n),
    }))
  const buscarMovil = (v: string) => {
    setRepQuery(v)
    // Misma regla que en PC: al teclear se miran todas las áreas. Al borrar, se devuelve.
    if (v.trim() && !showingAll) { setShowingAll(true); autoTodasRef.current = true }
    else if (!v.trim() && autoTodasRef.current) { setShowingAll(false); autoTodasRef.current = false }
  }
  const volverAEntrada = () => {
    autoTodasRef.current = false
    setRepQuery('')
    setShowingAll(false)
    setSelectedAreaId(null)
    setFacetaEquipo(null)
    setSelectedEquipKey(null)
    setSelectedEquipMachineId(null)
    setSelectedEquipName('')
    setSelectedRowKey(null)
    // Filtros que ya no se ven desde la entrada: si quedaran puestos, un SAP reciente podría dar cero resultados.
    setRepStockFilter('all'); setRepClaseFilter('all'); setRepFavOnly(false); setRepComunSinStock(false)
    setRepConFotos(false); setListFilter('all'); setRepSoloSap(true)
  }
  const abrirRecienteEntrada = (r: RecienteRepuesto) => {
    if (r.tipo === 'equipo') { handleFavEquipClick(r.id, r.nombre); return }
    // Un repuesto reciente puede ser de cualquier área: se busca por su SAP en todas.
    setRepQuery(r.id)
    setShowingAll(true)
    autoTodasRef.current = true
  }
  const abrirAreaEntrada = (id: string) => {
    setOpenNodes((prev) => {
      const next = { ...prev }
      getNodePath(id).forEach((n) => { next[n.id] = true })
      return next
    })
    expandNode(id)
    setSidebarMobileOpen(true)
  }
  const celdaMenu = 'min-h-[52px]'

  return (
    <div className="tipo-ingenieria relative flex h-full bg-background">
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
          className="absolute left-0 top-1/2 z-20 hidden h-14 w-6 -translate-y-1/2 items-center justify-center rounded-r-ctl border border-l-0 border-border bg-card/80 shadow-md backdrop-blur-sm transition-all duration-200 hover:w-8 hover:bg-muted sm:flex"
          title="Expandir panel de áreas"
          aria-label="Expandir áreas"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {/* Columna principal */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header del módulo: búsqueda global + acciones */}
        {/* gap/min-w reducidos en móvil: la fila completa (menú+buscador+acciones+⋮)
            debe caber en 375px — si no, el "⋮" salta a una segunda fila entera. */}
        {/* Teléfono: el buscador ocupa la fila; al lado solo Solicitudes y ⋯ (el resto vive en el menú). */}
        <div className="flex items-center gap-2 px-4 py-2.5 sm:hidden">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              enterKeyHint="search"
              value={repQuery}
              onChange={(e) => buscarMovil(e.target.value)}
              placeholder="SAP, repuesto o equipo"
              aria-label="Buscar repuestos"
              className="h-[44px] w-full rounded-[22px] border-0 bg-muted pl-10 pr-11 text-body placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-search-cancel-button]:appearance-none"
            />
            {repQuery && (
              <button
                type="button"
                onClick={() => buscarMovil('')}
                aria-label="Borrar búsqueda"
                className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-full text-muted-foreground"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSolicitudesOpen(true)}
            aria-label={pendientesCount > 0 ? `Solicitudes, ${pendientesCount} pendientes` : 'Solicitudes'}
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-brand-ink hover:bg-muted"
          >
            <ClipboardList className="size-5" aria-hidden />
            {pendientesCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ink-crit/[0.15] px-1 text-caption font-semibold text-ink-crit tabular-nums">{pendientesCount}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setMenuMasOpen(true)}
            aria-label="Más acciones"
            className="relative flex size-11 shrink-0 items-center justify-center rounded-full text-brand-ink hover:bg-muted"
          >
            <MoreHorizontal className="size-5" aria-hidden />
            {isAdmin && trashCount > 0 && (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-ink-crit" aria-hidden />
            )}
          </button>
        </div>
        {marcaMaquina && <div className="flex px-4 pb-1 sm:hidden">{marcaMaquina}</div>}
        <PSheet open={menuMasOpen} onClose={() => setMenuMasOpen(false)} title="Más acciones">
          <ListGroup>
            {!selectedEquipKey && (
              <ListCell
                leading={<CellIcon tone="neutral"><Plus aria-hidden /></CellIcon>}
                title="Solicitar un repuesto"
                onClick={() => { setMenuMasOpen(false); openSolicitar(null) }}
                className={celdaMenu}
              />
            )}
            <ListCell
              leading={<CellIcon tone="neutral"><MessageCircle aria-hidden /></CellIcon>}
              title="Preguntar a ARIA"
              onClick={() => { setMenuMasOpen(false); abrirAria(repQuery.trim() || undefined) }}
              className={celdaMenu}
            />
            {adminTools.map((t) => {
              const Icon = t.icon
              return (
                <ListCell
                  key={t.key}
                  leading={<CellIcon tone="neutral"><Icon aria-hidden /></CellIcon>}
                  title={t.label}
                  subtitle={t.deshabilitada ? t.motivo : undefined}
                  value={t.badge ? t.badge : undefined}
                  onClick={t.deshabilitada ? undefined : () => { setMenuMasOpen(false); t.onClick() }}
                  aria-disabled={t.deshabilitada || undefined}
                  className={cn(celdaMenu, t.deshabilitada && 'opacity-50')}
                />
              )
            })}
          </ListGroup>
        </PSheet>
        <div className="hidden flex-wrap items-center gap-1.5 border-b border-border px-2.5 py-2.5 sm:flex sm:gap-2 sm:px-4">
          <button
            onClick={() => setSidebarMobileOpen(true)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:hidden"
            aria-label="Abrir áreas"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative min-w-[96px] max-w-md flex-1 sm:min-w-[160px]">
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
              className="h-11 pl-9 text-subhead font-normal"
            />
          </div>
          {marcaMaquina}
          <Button variant="outline" size="sm" className="h-11 w-11 justify-center gap-1.5 px-0 sm:w-auto sm:px-3" onClick={() => setSolicitudesOpen(true)}>
            <ClipboardList className="h-4 w-4" /> <span className="hidden sm:inline">Solicitudes</span>
            {pendientesCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 tabular-nums">{pendientesCount}</Badge>
            )}
          </Button>
          {selectedEquipKey ? (
            <Button size="sm" className="h-11 gap-1.5" onClick={() => setSolicitarVariosOpen(true)} title={`Solicitar uno o varios repuestos de ${selectedEquipName}`}>
              <ClipboardList className="h-4 w-4" /> <span className="hidden sm:inline">Solicitar repuestos</span><span className="sm:hidden">Solicitar</span>
            </Button>
          ) : (
            <Button size="sm" className="h-11 gap-1.5" onClick={() => openSolicitar(null)}>
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Solicitar repuesto</span><span className="sm:hidden">Solicitar</span>
            </Button>
          )}
          {/* Herramientas admin: toolbar en desktop (≥sm) */}
          {isAdmin && (
            <div className="hidden items-center gap-1 border-l border-border pl-2 sm:flex">
              {adminTools.map((t) => {
                const Icon = t.icon
                return (
                  <button key={t.key} onClick={t.onClick} title={t.label} className="relative rounded-ctl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    <Icon className="h-4 w-4" />
                    {t.badge ? (
                      <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fill-critical/[0.15] px-1 text-caption font-bold text-ink-crit tabular-nums">{t.badge}</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
          {/* Herramientas admin: overflow en móvil (<sm) */}
          {isAdmin && (
            <div className="relative sm:hidden">
              <button onClick={() => setAdminMenuOpen((v) => !v)} title="Herramientas admin" aria-label="Herramientas admin" className="relative flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <MoreVertical className="h-5 w-5" />
                {trashCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-fill-critical/[0.15] px-1 text-caption font-bold text-ink-crit tabular-nums">{trashCount}</span>
                )}
              </button>
              {adminMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setAdminMenuOpen(false)} />
                  <div className="absolute left-0 z-50 mt-1 w-56 max-w-[calc(100vw-1.5rem)] rounded-card border border-border bg-card p-1 shadow-xl">
                    {adminTools.map((t) => {
                      const Icon = t.icon
                      return (
                        <button
                          key={t.key}
                          onClick={() => { t.onClick(); setAdminMenuOpen(false) }}
                          disabled={t.deshabilitada}
                          title={t.deshabilitada ? t.motivo : undefined}
                          className="flex w-full items-center gap-2.5 rounded-ctl px-2.5 py-2.5 text-left text-sm text-foreground hover:bg-muted/50 disabled:pointer-events-none disabled:opacity-50"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="flex-1">{t.label}</span>
                          {t.badge ? (
                            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-fill-critical/[0.15] px-1 text-caption font-bold text-ink-crit tabular-nums">{t.badge}</span>
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
          {/* Teléfono: entrada por listas, o «‹ Repuestos» para volver a ella desde un área, equipo o búsqueda. */}
          {entradaMovil ? (
            <div className="sm:hidden">
              <RepuestosEntrada
                recientes={recientesVisibles}
                onAbrirReciente={abrirRecienteEntrada}
                onLimpiarRecientes={() => { limpiarRecientesRepuestos(); setRecientes([]) }}
                listasFavoritos={listasFavoritos}
                favoritosCargando={favCargando}
                onAbrirEquipo={(id, nombre) => handleFavEquipClick(id, nombre)}
                onEditarFavoritos={isAdmin ? () => setEditarFav({}) : undefined}
                onBuscarTodo={buscarMovil}
                areas={areasEntrada}
                onAbrirArea={abrirAreaEntrada}
              />
            </div>
          ) : (
            <div className="-mt-2 mb-1 sm:hidden">
              <PButton variant="plain" className="-ml-3 gap-1 pl-2 pr-4" onClick={volverAEntrada}>
                <ChevronLeft aria-hidden /> Repuestos
              </PButton>
            </div>
          )}
          {/* Lo de abajo es la vista de siempre: en PC no cambia; en el teléfono se oculta mientras manda la entrada. */}
          <div className={entradaMovil ? 'hidden sm:contents' : 'contents'}>
          {/* Favoritos de equipos (listas con nombre) — colapsada por defecto, SOLO LECTURA; se edita desde la hoja (admin). */}
          {(equipFavLists.length > 0 || isAdmin) && (
            <div className="mb-5 rounded-card border border-border bg-muted p-3 max-sm:hidden">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setFavBarOpen((v) => !v)}
                  className="flex min-h-[44px] flex-1 items-center gap-1.5 text-caption font-bold tracking-wider text-muted-foreground"
                >
                  <Star className="h-3.5 w-3.5 fill-current text-muted-foreground" /> Favoritos de equipos
                  {equipFavLists.length > 0 && <span className="tabular-nums text-muted-foreground/60">({equipFavTotal})</span>}
                  <ChevronDown className={['ml-auto h-3.5 w-3.5 transition-transform', favBarOpen ? '' : '-rotate-90'].join(' ')} />
                </button>
                {isAdmin && (
                  <PButton variant="plain" onClick={() => setEditarFav({})}>Editar</PButton>
                )}
              </div>
              {favBarOpen && (equipFavLists.length === 0 ? (
                <p className="mt-2 pl-5 text-caption text-muted-foreground">Marca equipos con la estrella en «Estructura de equipos del área (admin)» o con «Editar» para crear listas.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {equipFavLists.map((list) => {
                    const closed = favBarClosed[list.name]
                    return (
                      <div key={list.name}>
                        <button
                          onClick={() => setFavBarClosed((p) => ({ ...p, [list.name]: !p[list.name] }))}
                          className="flex min-h-[44px] items-center gap-1.5 text-caption font-semibold text-foreground"
                        >
                          <ChevronDown className={['h-3.5 w-3.5 transition-transform', closed ? '-rotate-90' : ''].join(' ')} />
                          <span>{list.name}</span>
                          <span className="tabular-nums text-muted-foreground/60">({list.machineIds.length})</span>
                        </button>
                        {!closed && (
                          <div className="flex flex-wrap gap-1.5 pl-5">
                            {list.machineIds.map((id) => {
                              const planta = plantaCorta(plantaDe(id))
                              return (
                                <button
                                  key={id}
                                  onClick={() => handleFavEquipClick(id, list.machineNames?.[id] || equipNameMap.get(id))}
                                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-caption font-medium text-foreground transition hover:bg-primary/10 hover:text-brand-ink"
                                >
                                  {list.machineNames?.[id] || equipNameMap.get(id) || id}
                                  {planta && <span className="font-normal text-muted-foreground">· {planta}</span>}
                                </button>
                              )
                            })}
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
                <>
                  {/* Teléfono: la ruta abre el árbol de áreas (reemplaza al botón de menú). */}
                  <button
                    type="button"
                    onClick={() => setSidebarMobileOpen(true)}
                    aria-label="Abrir áreas"
                    className="mb-0.5 flex min-h-[44px] max-w-full items-center text-left text-caption text-muted-foreground sm:hidden"
                  >
                    <span className="truncate">{(selectedEquipKey ? breadcrumb : breadcrumb.slice(0, -1)).join(' › ')}</span>
                  </button>
                  <div className="mb-0.5 hidden truncate text-caption text-muted-foreground sm:block">
                    {(selectedEquipKey ? breadcrumb : breadcrumb.slice(0, -1)).join(' › ')}
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                {selectedEquipKey && <Cog className="h-5 w-5 shrink-0 text-cat-7-ink" />}
                <h1 className="truncate text-title2 font-medium tracking-[-0.005em] text-foreground">{title}</h1>
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
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={quitarFocoMaquina}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-caption font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground max-sm:min-h-[44px] max-sm:px-4"
                    title="Volver a ver todos los repuestos del área"
                  >
                    <ChevronLeft className="h-3 w-3 shrink-0" /> Volver a <span className="truncate font-semibold">{selectedNode?.nombre ?? 'el área'}</span>
                  </button>
                  {/*
                    La lista de materiales del equipo, sus manuales y su ficha viven en el
                    expediente (Centro Técnico Documental), que está en otro grupo del menú.
                    Sin esto había que cambiar de módulo y volver a buscar el equipo a mano.
                    Ver services/equipos/enlaceExpediente.ts.
                  */}
                  {selectedEquipMachineId && (
                    <Link
                      to={rutaExpedienteEquipo(selectedEquipMachineId)}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-caption font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground max-sm:min-h-[44px] max-sm:border-transparent max-sm:bg-primary/[0.13] max-sm:px-4 max-sm:text-brand-ink"
                      title="Abrir el expediente de este equipo: lista de materiales, manuales y ficha"
                    >
                      <ClipboardList className="h-3 w-3 shrink-0" /> Ver expediente
                    </Link>
                  )}
                </div>
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

          {/* Teléfono, con un equipo abierto: «Solicitar repuestos» es el único botón relleno de la vista. */}
          {selectedEquipKey && (
            <div className="-mt-1 mb-4 sm:hidden">
              <PButton variant="filled" size="block" onClick={() => setSolicitarVariosOpen(true)}>
                <ClipboardList aria-hidden /> Solicitar repuestos
              </PButton>
            </div>
          )}

          {/* Resumen de stock de lo que se ve (sigue búsqueda, área, faceta y filtros, salvo el propio de stock). */}
          <ResumenStockFila
            resumen={resumenVisible}
            activo={estadoResumenActivo}
            onElegir={elegirEstadoResumen}
            cargando={repuestosBusy}
          />


          {/* (Fase 4 normalización) La sección "Motores y bombas del área" se eliminó:
              los motores/bombas físicos ahora son repuestos de la colección plana y
              aparecen en la tabla de abajo con su marca/modelo/foto. */}

          {/* Tabla de repuestos del área (catálogo + bodega).
              scroll-mt compensa la barra sticky al hacer scrollIntoView. */}
          <section ref={listSectionRef} className="scroll-mt-44 sm:scroll-mt-28">
            {/* Filtros (la búsqueda vive en la barra superior — global, sticky).
                En móvil colapsados tras el botón "Filtros" del strip de KPIs. */}
            {/* Barra: favoritos · bajo stock · filtros (hoja) · vista. Clase/Tipo/Stock/SAP/listas viven en la hoja. */}
            <div className="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <div className="-mx-4 flex min-w-0 items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                <ChipBarra
                  activo={repFavOnly}
                  disabled={favoritosEnScope === 0 && !repFavOnly}
                  onClick={() => setRepFavOnly((v) => !v)}
                  title={favoritosEnScope === 0
                    ? 'No hay favoritos en este alcance. Los comunes de la máquina los marca un administrador; tus estrellas se marcan en cada fila.'
                    : 'Comunes de la máquina (lista compartida) y tus estrellas (personales), sin repetir.'}
                >
                  <Star className={['size-4', repFavOnly ? 'fill-current' : ''].join(' ')} aria-hidden /> Favoritos
                  {(favoritosEnScope > 0 || repFavOnly) && <span className="text-footnote font-normal tabular-nums opacity-80">{favoritosEnScope}</span>}
                </ChipBarra>
                <ChipBarra activo={repConFotos} onClick={() => setRepConFotos((v) => !v)} className={repConFotos ? '' : 'md:hidden'}>
                  <ImageIcon className="size-4" aria-hidden /> Con fotos
                </ChipBarra>
                <ChipBarra activo={false} onClick={() => setFiltrosOpen(true)} aria-haspopup="dialog">
                  <Settings2 className="size-4" aria-hidden /> Filtros
                  {filtrosActivos > 0 && (
                    <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-footnote font-medium tabular-nums text-primary-foreground">{filtrosActivos}</span>
                  )}
                </ChipBarra>
              </div>
              <SegmentedControl<'lista' | 'galeria'>
                ariaLabel="Vista de repuestos"
                value={vistaRep}
                onChange={cambiarVistaRep}
                className="sm:w-[220px] sm:shrink-0"
                segments={[{ value: 'lista', label: 'Lista' }, { value: 'galeria', label: 'Galería' }]}
              />
            </div>

            {!repuestosBusy && (
              <>
                <ChipsEquipo rows={filasParaChips} plantaDe={plantaDe} faceta={facetaEfectiva} onChange={setFacetaEquipo} />
                <p className="mb-2 px-1 text-footnote text-muted-foreground" aria-live="polite">{lineaResultados}</p>
              </>
            )}

            {repuestosBusy ? (
              <div className="overflow-hidden rounded-card border border-border">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border px-3 py-3 last:border-0">
                    <div className="h-3 w-20 shrink-0 animate-pulse rounded-ctl bg-muted" />
                    <div className="h-3 flex-1 animate-pulse rounded-ctl bg-muted" />
                    <div className="hidden h-3 w-24 animate-pulse rounded-ctl bg-muted sm:block" />
                    <div className="h-3 w-12 shrink-0 animate-pulse rounded-ctl bg-muted" />
                  </div>
                ))}
              </div>
            ) : filteredRep.length === 0 ? (
              <div className="rounded-card border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                {!selectedAreaId && !showingAll ? (
                  <>
                    <p>Selecciona un área.</p>
                    <button
                      type="button"
                      onClick={() => setSidebarMobileOpen(true)}
                      className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full bg-muted px-5 text-subhead font-medium text-foreground sm:hidden"
                    >
                      Ver áreas
                    </button>
                  </>
                ) : areaRepuestos.length === 0 ? (
                  'Esta área no tiene repuestos con código SAP.'
                ) : (
                  'Sin resultados para los filtros aplicados.'
                )}
              </div>
            ) : vistaRep === 'galeria' ? (
              <GaleriaRepuestos
                rows={filteredRep}
                fotosDe={fotosDeGaleria}
                nombreDe={nombreDeGaleria}
                stockMeta={STOCK_META}
                onAbrirFicha={(r) => setSelectedRowKey(r.rowKey)}
                onAbrirFoto={(r, i) => setRowLightbox({ photos: fotosDeFila(r, equiposEnFoco), index: i })}
                onAgregarFoto={(r) => { setSelectedRowKey(r.rowKey); setFotoPendienteKey(r.rowKey) }}
              />
            ) : (
              <div className="overflow-hidden rounded-card border border-border">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted text-left text-muted-foreground">
                      {/* En móvil solo Repuesto + favorito: la foto (96% sin foto)
                          y la columna Stock desbordaban el ancho — el stock va
                          como chip bajo el título (ver celda Repuesto). */}
                      <tr>
                        <th className="hidden w-12 px-2 py-2 md:table-cell" aria-label="Foto" />
                        {renderSortTh('codigoSAP', 'SAP', 'hidden md:table-cell')}
                        {renderSortTh('codigoFabricante', 'Cód. Fabricante', 'hidden md:table-cell')}
                        {renderSortTh('textoBreve', 'Repuesto')}
                        {/* Solo administración: el título ya es el primer nombre común; aquí van los demás y «+ agregar». */}
                        {isAdmin && <th className="hidden px-3 py-2 text-nota font-medium lg:table-cell">Otros nombres</th>}
                        {renderSortTh('equipo', 'Equipo', 'hidden md:table-cell')}
                        {renderSortTh('stock', 'Stock', 'hidden md:table-cell')}
                        {renderSortTh('tipo', 'Tipo', 'hidden md:table-cell')}
                        <th className="hidden w-16 px-2 py-2 text-center text-nota font-medium md:table-cell">Dibujo</th>
                        <th className="w-8 px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {pagedRep.map((r, idx) => {
                        const meta = STOCK_META[r.stockStatus]
                        // El equipo del filtro/foco primero; el marcador «Sin equipo» de un doc duplicado no cuenta.
                        const { nombre: equipo } = equipoParaMostrar(r.equipos, preferirEquipo)
                        const dibujo = dibujoDe(figurasDespiece, r.codigoFabricante, maquinaDeDespiece(equipo))
                        const isSel = selectedRowKey === r.rowKey
                        const nv = nombreVisible(r)
                        // Fotos: las de bodega (reales del físico) primero, luego las del catálogo
                        const fotos = fotosDeFila(r, equiposEnFoco)
                        // Divisor de tier: primera fila sin SAP (despiece) tras las con-SAP.
                        const showDespieceDivider = !r.codigoSAP && (idx === 0 || !!pagedRep[idx - 1]?.codigoSAP)
                        // «★ Favoritos» activo: dos secciones, comunes del equipo y mis estrellas.
                        const marcas = repFavOnly ? marcasFav.get(r.rowKey) : undefined
                        const seccionFav = marcas ? (marcas.comun ? 'comun' : 'mia') : null
                        const prevMarcas = repFavOnly && idx > 0 ? marcasFav.get(pagedRep[idx - 1]!.rowKey) : undefined
                        const prevSeccion = prevMarcas ? (prevMarcas.comun ? 'comun' : 'mia') : null
                        const showFavHeader = seccionFav !== null && seccionFav !== prevSeccion
                        return (
                          <Fragment key={r.rowKey}>
                          {showFavHeader && (
                            <tr className="bg-muted">
                              <td colSpan={10} className="px-3 py-2 text-subhead font-medium text-foreground">
                                {seccionFav === 'comun' ? (etiquetaAlcance ? `Comunes de ${etiquetaAlcance}` : 'Comunes') : 'Mis estrellas'}
                              </td>
                            </tr>
                          )}
                          {showDespieceDivider && (
                            <tr className="bg-muted">
                              <td colSpan={10} className="px-3 py-1.5 text-nota font-medium text-muted-foreground">
                                Piezas de despiece · sin código SAP
                              </td>
                            </tr>
                          )}
                          <tr
                            onClick={() => setSelectedRowKey(r.rowKey)}
                            className={[
                              'cursor-pointer transition-colors',
                              isSel ? 'bg-primary/10 ring-1 ring-inset ring-primary/40' : 'hover:bg-muted',
                            ].join(' ')}
                          >
                            <td className="hidden px-2 py-1.5 md:table-cell">
                              {fotos.length > 0 && fotos[0] ? (
                                <FotosHoverCard fotos={fotos} nombre={r.textoBreve} codigo={r.codigoSAP} onAbrir={(i) => setRowLightbox({ photos: fotos, index: i })}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRowLightbox({ photos: fotos, index: 0 }) }}
                                  className="group relative block h-9 w-9 overflow-hidden rounded-ctl ring-1 ring-border transition hover:ring-primary/60"
                                  title="Ver fotos"
                                  aria-label="Ver fotos del repuesto"
                                >
                                  <img src={fotos[0]} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110" />
                                  {fotos.length > 1 && (
                                    <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-0.5 text-nota font-medium text-white">+{fotos.length - 1}</span>
                                  )}
                                </button>
                                </FotosHoverCard>
                              ) : (
                                <div className="flex h-9 w-9 items-center justify-center rounded-ctl border border-dashed border-border" title="Sin foto">
                                  <ImageOff className="h-3.5 w-3.5 text-muted-foreground/30" />
                                </div>
                              )}
                            </td>
                            <td className="hidden px-3 py-2 font-mono text-footnote font-normal tabular-nums md:table-cell">
                              {r.codigoSAP ? (
                                <span className="inline-flex items-center gap-1">
                                  {r.codigoSAP}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copySapFromRow(r.rowKey, r.codigoSAP) }}
                                    className="rounded-ctl p-0.5 text-muted-foreground/40 transition hover:text-primary"
                                    title="Copiar SAP"
                                    aria-label="Copiar código SAP"
                                  >
                                    {copiedSapKey === r.rowKey ? <Check className="h-3.5 w-3.5 text-ink-ok" /> : <Copy className="h-3.5 w-3.5" />}
                                  </button>
                                </span>
                              ) : '-'}
                            </td>
                            <td className="hidden px-3 py-2 font-mono text-footnote font-normal tabular-nums md:table-cell">
                              {r.codigoFabricante
                                ? <span className="text-muted-foreground">{r.codigoFabricante}</span>
                                : <span className="text-muted-foreground/30">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {r.clase && (
                                  <span
                                    className={[
                                      'shrink-0 rounded-ctl bg-muted px-1.5 py-0.5 text-nota font-medium text-muted-foreground',
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
                                {nv.etiquetas.map((et) => (
                                  <span key={et} className="shrink-0 rounded-ctl bg-muted px-1.5 py-0.5 text-nota font-medium text-muted-foreground">{et}</span>
                                ))}
                                <span className="line-clamp-2 min-w-0 text-subhead font-normal text-foreground">{nv.titulo}</span>
                                {marcas && (
                                  <span className="inline-flex shrink-0 items-center gap-1">
                                    {marcas.comun && (
                                      <span className="inline-flex items-center rounded-full bg-ink-ok/[0.15] px-2 py-0.5 text-nota font-medium text-ink-ok">Común</span>
                                    )}
                                    {marcas.mia && (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-nota font-medium text-muted-foreground">
                                        <Star className="size-3 fill-current text-ink-warn" aria-hidden /> Mía
                                      </span>
                                    )}
                                  </span>
                                )}
                                {!marcas && (isCommonPartSap(r.codigoSAP) || (r.comunEn?.length ?? 0) > 0) && (
                                  <span
                                    className="inline-flex shrink-0 items-center gap-0.5 rounded-ctl bg-ink-ok/[0.15] px-1.5 py-0.5 text-nota font-medium text-ink-ok"
                                    title={`Repuesto común / más usado de: ${[...new Set([...machinesForCommonSap(r.codigoSAP), ...(r.comunEn ?? [])])].map((s) => findMachineBySlug(s)?.name ?? s).join(', ')}`}
                                  >
                                    <Wrench className="h-3 w-3" /> común
                                  </span>
                                )}
                              </div>
                              {nv.oficial && (
                                <span className="block max-w-[18rem] truncate text-footnote text-muted-foreground md:max-w-[300px] md:text-caption" title={nv.oficial}>
                                  {nv.oficial}
                                </span>
                              )}
                              {/* En móvil, stock + ubicación como chip propio (la columna
                                  Stock está oculta: desbordaba el ancho y quedaba cortada) */}
                              <div className="mt-1 flex items-center gap-1.5 text-caption md:hidden">
                                <span className={['h-2 w-2 shrink-0 rounded-full', meta.dot].join(' ')} />
                                <span className="tabular-nums font-normal">{r.stockStatus === 'unset' ? '—' : r.stockActual}</span>
                                <span className={meta.text}>{meta.label}</span>
                                {r.ubicacionBodega && (
                                  <span className="text-muted-foreground">· <MapPin className="inline h-3 w-3" /> {r.ubicacionBodega}</span>
                                )}
                              </div>
                              {/* SAP + equipo + tipo como subtítulo (columnas ocultas) */}
                              <div className="mt-0.5 text-caption text-muted-foreground md:hidden">
                                {r.codigoSAP && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copySapFromRow(r.rowKey, r.codigoSAP) }}
                                    /* 15 px de alto. Sube a 32, no a 44: este botón vive DENTRO
                                       de la tarjeta y llevarlo a 44 se comería casi la mitad —
                                       el tap de «abrir la ficha» pasaría a ser «copiar». El
                                       botón bueno de copiar está en el panel. */
                                    className={`${AREA_TACTIL_EN_TARJETA} inline-flex items-center gap-0.5 font-mono text-muted-foreground active:text-primary`}
                                    aria-label="Copiar código SAP"
                                  >
                                    {r.codigoSAP}
                                    {copiedSapKey === r.rowKey ? <Check className="h-3 w-3 text-ink-ok" /> : <Copy className="h-3 w-3 opacity-50" />}
                                    <span> · </span>
                                  </button>
                                )}
                                {tipoLabelOf(r.tipo)}
                                {r.codigoFabricante && <span> · <span className="font-mono text-muted-foreground">Fab {r.codigoFabricante}</span></span>}
                                {dibujo && (
                                  <button type="button" onClick={(e) => { e.stopPropagation(); irAlDibujo(dibujo.ruta, r.rowKey) }}
                                          className={`${AREA_TACTIL_EN_TARJETA} ml-1.5 inline-flex items-center gap-1 rounded-ctl bg-primary/10 px-1.5 text-primary`}
                                          aria-label={`Ver ${r.codigoFabricante} en el dibujo`}>
                                    <Shapes className="h-3 w-3" /> Dibujo
                                  </button>
                                )}
                              </div>
                              <DondeSeUsaPills equipos={r.equipos} plantaDe={plantaDe} enFocoId={selectedEquipMachineId} faceta={facetaEfectiva} totalUnidades={totalUnidades} className="mt-1.5 md:hidden" />
                              {/* Móvil: tira de hasta 3 miniaturas SOLO si la fila tiene fotos (el 96 %
                                  no tiene: sin cajón vacío). Cada una abre el visor en ESA foto. */}
                              {fotos.length > 0 && (
                                <div className="mt-2.5 grid grid-cols-3 gap-2 md:hidden">
                                  {fotos.slice(0, 3).map((src, i) => (
                                    <button
                                      key={src}
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setRowLightbox({ photos: fotos, index: i }) }}
                                      className="relative aspect-[16/10] overflow-hidden rounded-ctl ring-1 ring-inset ring-border"
                                      aria-label={`Ver foto ${i + 1} de ${fotos.length} de ${r.textoBreve || 'el repuesto'}`}
                                    >
                                      <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                                      {i === 2 && fotos.length > 3 && (
                                        <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-subhead font-medium text-white">+{fotos.length - 3}</span>
                                      )}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                            {isAdmin && (
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
                                  placeholder="nombres comunes, separados por coma (el primero se muestra como título)"
                                  aria-label="Nombres comunes"
                                  className="w-full rounded-ctl border border-primary/50 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    // El editor recibe la LISTA COMPLETA: si se mostraran solo los «otros», guardar borraría el título.
                                    setEditApodosVal((r.nombresComunes ?? []).join(', '))
                                    setEditApodosKey(r.rowKey)
                                  }}
                                  className="block w-full max-w-[220px] truncate text-left text-muted-foreground transition hover:text-foreground"
                                  title={(r.nombresComunes ?? []).join(', ') || 'Agregar nombre común'}
                                >
                                  {nv.otros.length
                                    ? nv.otros.join(', ')
                                    : <span className="italic text-muted-foreground/40">{nv.esComun ? '+ otro nombre' : '+ nombre común'}</span>}
                                </button>
                              )}
                            </td>
                            )}
                            <td className="hidden px-3 py-2 md:table-cell">
                              <DondeSeUsaPills equipos={r.equipos} plantaDe={plantaDe} enFocoId={selectedEquipMachineId} faceta={facetaEfectiva} totalUnidades={totalUnidades} />
                            </td>
                            <td className="hidden px-3 py-2 md:table-cell">
                              <div className="flex items-center gap-1.5 text-footnote font-normal">
                                <span className={['h-2 w-2 rounded-full', meta.dot].join(' ')} />
                                <span className="tabular-nums font-normal">{r.stockStatus === 'unset' ? '—' : r.stockActual}</span>
                                <span className={meta.text}>{meta.label}</span>
                              </div>
                            </td>
                            <td className="hidden px-3 py-2 md:table-cell">
                              <span className="inline-block rounded-ctl bg-muted px-1.5 py-0.5 text-caption text-muted-foreground">{tipoLabelOf(r.tipo)}</span>
                            </td>
                            <td className="hidden px-2 py-2 text-center md:table-cell">
                              {dibujo ? (
                                <button type="button" onClick={(e) => { e.stopPropagation(); irAlDibujo(dibujo.ruta, r.rowKey) }}
                                        className={[AREA_TACTIL_COMPACTA, 'inline-flex items-center justify-center rounded-ctl text-primary hover:bg-primary/10'].join(' ')}
                                        title={`Ver en el dibujo · fig. ${dibujo.fig}`} aria-label={`Ver ${r.codigoFabricante} en el dibujo`}>
                                  <Shapes className="h-4 w-4" />
                                </button>
                              ) : <span className="text-muted-foreground/40">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFav(r.rowKey) }}
                                /* Era 20×20. Holgura medida a su alrededor: 104 arriba, 32
                                   abajo, 47 a cada lado — el área de 44 crece sin tocar la
                                   fila vecina (marcar el favorito de otra pieza sin querer
                                   ya pasó una vez). */
                                className={[AREA_TACTIL_COMPACTA, 'rounded-ctl transition', favKeys.has(r.rowKey) ? 'text-ink-warn' : 'text-muted-foreground/30 hover:text-ink-warn'].join(' ')}
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
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  {/* Lo que el filtro está dejando fuera, DONDE se lee el total.
                      El aviso vivía dentro del botón "Solo con SAP", que en el
                      teléfono queda plegado tras "Filtros": el área de PLANTA
                      CHONCHI decía "758 repuestos" con 3.649 piezas de despiece
                      ocultas, y el badge del árbol —a la vista— decía 4.407. */}
                  <span className="tabular-nums">
                    Mostrando {page * repPageSize + 1} a {Math.min((page + 1) * repPageSize, filteredRep.length)} de {filteredRep.length} repuestos
                    {repSoloSap && despieceOcultos > 0 && (
                      <button
                        onClick={() => setRepSoloSap(false)}
                        className="ml-1.5 underline decoration-dotted underline-offset-2 hover:text-foreground"
                        title="Ver también las piezas de despiece sin código SAP"
                      >
                        · {despieceOcultos.toLocaleString('es-CL')} de despiece ocultas
                      </button>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setRepPage((p) => Math.max(0, p - 1))}
                      disabled={page <= 0}
                      className="flex h-7 w-7 items-center justify-center rounded-ctl border border-border disabled:opacity-40 hover:bg-muted"
                      aria-label="Anterior"
                    ><ChevronLeft className="h-4 w-4" /></button>
                    <span className="tabular-nums">{page + 1} / {totalPages}</span>
                    <button
                      onClick={() => setRepPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                      className="flex h-7 w-7 items-center justify-center rounded-ctl border border-border disabled:opacity-40 hover:bg-muted"
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

          {/* Teléfono: sin la burbuja, ARIA queda como última fila de una búsqueda. */}
          {repQuery.trim() && (
            <div className="mt-4 sm:hidden">
              <ListGroup>
                <ListCell
                  leading={<CellIcon tone="neutral"><MessageCircle aria-hidden /></CellIcon>}
                  title={<span className="text-primary">Preguntar a ARIA por «{repQuery.trim()}»</span>}
                  onClick={() => abrirAria(repQuery.trim())}
                  className={celdaMenu}
                />
              </ListGroup>
            </div>
          )}
          </div>
        </div>
      </div>

      <FiltrosRepuestosSheet
        open={filtrosOpen}
        onClose={() => setFiltrosOpen(false)}
        clases={opcionesHoja?.clases ?? []}
        clase={repClaseFilter}
        onClase={setRepClaseFilter}
        tipos={opcionesHoja?.tipos ?? []}
        tipo={repTipoFilter}
        onTipo={setRepTipoFilter}
        stocks={opcionesHoja?.stocks ?? []}
        stock={repStockFilter}
        onStock={(v) => { setRepStockFilter(v as StockFilter); setRepComunSinStock(false) }}
        despieceSinSap={opcionesHoja?.despiece ?? 0}
        incluirSinSap={!repSoloSap}
        onIncluirSinSap={(v) => setRepSoloSap(!v)}
        listas={opcionesHoja?.listas ?? []}
        lista={listFilter}
        onLista={setListFilter}
        activos={filtrosActivos}
        onLimpiar={limpiarFiltrosHoja}
        total={filteredRep.length}
      />

      {/* Panel lateral de detalle del repuesto (columna fija, no modal) */}
      {selectedRep && (
        <RepuestoDetailPanel
          item={selectedRep}
          plantaDe={plantaDe}
          equiposEnFoco={equiposEnFoco}
          areaName={showingAll ? 'Todas las áreas' : (formatNombreSAP(selectedNode?.nombre).nombre || selectedNode?.nombre || '')}
          volverA={formatNombreSAP(selectedEquipName).nombre || selectedEquipName || undefined}
          onClose={() => setSelectedRowKey(null)}
          loadMovimientos={loadMovimientos}
          onSaveLocation={handleSaveLocation}
          onSolicitar={(r) => openSolicitar({ codigoSAP: r.codigoSAP, textoBreve: r.textoBreve, nombresComunes: r.nombresComunes, stock: stockDeSolicitud(r) })}
          onAssignSap={!selectedRep.codigoSAP ? () => { setAsignarSapValue(''); setAsignarSapOpen(true) } : undefined}
          onAssignEquipo={() => { setAsignarEquipoQuery(''); setAsignarEquipoOpen(true) }}
          onRemoveEquipo={isAdmin ? handleQuitarEquipo : undefined}
          isAdmin={isAdmin}
          onRename={isAdmin ? handleRenameRep : undefined}
          onEditRepuesto={isAdmin ? () => startAction('edit') : undefined}
          onDeleteRepuesto={isAdmin ? () => startAction('delete') : undefined}
          onSpecs={() => startAction('specs')}
          onPhotos={() => startAction('photos')}
          onManual={() => startAction('manual')}
          dibujo={(() => {
            const d = dibujoDe(figurasDespiece, selectedRep.codigoFabricante, maquinaDeDespiece(equipoParaMostrar(selectedRep.equipos, preferirEquipo).nombre))
            return d ? { fig: d.fig, abrir: () => irAlDibujo(d.ruta, selectedRep.rowKey) } : null
          })()}
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
      <SolicitarVariosSheet
        open={solicitarVariosOpen}
        onClose={() => setSolicitarVariosOpen(false)}
        maquina={selectedEquipName}
        piezas={piezasDeLaMaquina}
        onSubmit={handleCrearVarias}
      />
      <SolicitudesPanel
        open={solicitudesOpen}
        onOpenChange={setSolicitudesOpen}
        solicitudes={solicitudes}
        loading={solicitudesLoading}
        onAvanzar={handleAvanzarSolicitud}
        onRegistrarSap={puedeResolverAltas ? handleRegistrarSapAlta : undefined}
        onRechazarAlta={puedeResolverAltas ? handleRechazarAlta : undefined}
        buscarSap={buscarSapEnMaestro}
        nombreDe={(sap, texto) => nombreVisiblePorSap(indiceNombresPorSap, sap, texto)}
        stockDe={(sap) => {
          const o = overlayDeSap(sap)
          return o ? { configurado: true, stockActual: o.stockActual, unidad: o.unidad, ubicacionBodega: o.ubicacionBodega } : { configurado: false }
        }}
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
                className="flex w-full items-center gap-2 rounded-card border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground transition hover:bg-muted hover:border-primary/40"
              >
                <Cog className="h-4 w-4 shrink-0 text-cat-7-ink" />
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
            className="flex w-full items-center gap-2 rounded-card border border-transparent bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10"
          >
            <Boxes className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-foreground">Material transversal</span>
              <span className="text-caption text-muted-foreground">Insumo, herramienta, químico… sin equipo</span>
            </span>
          </button>

          <div className="px-1 pt-1 text-caption font-semibold tracking-wider text-muted-foreground">O asociar a equipos</div>
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
                  return haystackMatchesAll(hay, terms)
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
                    className={['flex w-full items-center gap-2 rounded-card border px-3 py-2 text-left text-sm transition', checked ? 'border-transparent bg-primary/10' : 'border-border bg-card hover:bg-muted hover:border-transparent'].join(' ')}
                  >
                    <span className={['flex h-4 w-4 shrink-0 items-center justify-center rounded-ctl border', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'].join(' ')}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <Cog className="h-4 w-4 shrink-0 text-cat-7-ink" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">{g.label}</span>
                    {g.nodeIds.length > 1
                      ? <span className="shrink-0 text-caption text-muted-foreground">· {g.nodeIds.length} equipos</span>
                      : g.codigos[0] && <span className="shrink-0 font-mono text-caption text-muted-foreground">{g.codigos[0]}</span>}
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
              <Button type="submit" size="sm" disabled={asignarSapSaving || !esCodigoSapValido(asignarSapValue)}>
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
                .filter((e) => !e.oculto && !already.has(e.id) && (!q || normalizeForSearch(`${e.nombre} ${e.alias ?? ''} ${e.codigo ?? ''}`).includes(q)))
                .slice(0, 50)
              if (!cands.length) return <p className="px-1 py-2 text-xs text-muted-foreground">Sin equipos que coincidan.</p>
              return cands.map((e) => (
                <button
                  key={e.id}
                  disabled={asignarEquipoSaving}
                  onClick={() => handleAsignarEquipo(e)}
                  className="flex w-full items-center gap-2 rounded-card border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted hover:border-primary/40 disabled:opacity-50"
                >
                  <Cog className="h-4 w-4 shrink-0 text-cat-7-ink" />
                  <span className="min-w-0 flex-1 truncate">{e.alias || e.nombre}</span>
                  {e.codigo && <span className="shrink-0 font-mono text-caption text-muted-foreground">{e.codigo}</span>}
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
            <DialogDescription>Elige la máquina para la que este repuesto es común / más usado. Aparecerá en su lista del Centro de aprendizaje y con el badge «común» acá.</DialogDescription>
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
                  className="flex w-full items-center gap-2 rounded-card border border-border bg-card px-3 py-2 text-left text-sm transition hover:bg-muted hover:border-primary/40"
                >
                  <Wrench className="h-4 w-4 shrink-0 text-ink-ok" />
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
        machineName={showingAll ? 'Todas las áreas' : (selectedNode?.nombre ?? 'Área')}
        sapEquipo={sapEquipo}
        sapEquipos={sapEquipos}
        favKeys={favKeys}
      />

      {/* Gestor de listas de favoritos con nombre (para el repuesto objetivo) */}
      {addToListRowKey && ((rk: string) => {
        const row = areaRepuestos.find((r) => r.rowKey === rk)
        return (
          <Dialog open onOpenChange={(o) => { if (!o) { setAddToListRowKey(null); setNewListName('') } }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-base">Agregar a lista</DialogTitle>
                <DialogDescription className="truncate">{row ? tituloOCodigo(row) : 'Repuesto'}</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                {favLists.length === 0 && <p className="text-xs text-muted-foreground">Aún no tienes listas. Crea una abajo.</p>}
                {favLists.map((l) => {
                  const inList = l.repuestoIds.includes(rk)
                  return (
                    <div
                      key={l.name}
                      className={[
                        'flex items-center gap-2 rounded-card border px-3 py-2 text-xs font-medium transition',
                        inList ? 'border-transparent bg-fill-warning/[0.15] text-ink-warn' : 'border-border bg-card text-foreground',
                      ].join(' ')}
                    >
                      <button onClick={() => toggleInList(l.name, rk)} className="flex flex-1 items-center gap-2 text-left">
                        <Star className={['h-3.5 w-3.5 shrink-0', inList ? 'fill-current' : 'text-muted-foreground/40'].join(' ')} />
                        <span className="flex-1 truncate">{l.name}</span>
                        <span className="text-caption text-muted-foreground tabular-nums">{l.repuestoIds.length}</span>
                        {inList && <span className="text-caption">En lista</span>}
                      </button>
                      <button
                        onClick={() => deleteList(l.name)}
                        className="rounded-ctl p-0.5 text-muted-foreground/50 hover:text-destructive"
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
        tiposConocidos={tiposConocidos}
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
        tiposConocidos={tiposConocidos}
        onSubmit={handleEditSubmit}
        loading={savingRep}
      />

      {/* Ficha técnica */}
      {actionTarget?.kind === 'specs' && actionRep && (
        <TechnicalSpecsModal
          open
          onOpenChange={(o) => !o && setActionTarget(null)}
          repuesto={actionRep}
          machineName={actionMachine?.nombre ?? actionTarget?.source.machineName ?? ''}
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
          repuestoName={tituloOCodigo(actionRep)}
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
              Se moverá a la papelera (recuperable). {actionRep ? `"${tituloOCodigo(actionRep)}"` : ''}
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


      {/* Edición de favoritos de equipos: borrador + clave al guardar eliminaciones */}
      <EditarFavoritosSheet
        open={!!editarFav}
        onOpenChange={(o) => { if (!o) setEditarFav(null) }}
        listas={equipFavLists}
        nombreDe={(id) => equipNameMap.get(id) || id}
        plantaDe={plantaDe}
        onGuardar={guardarEquipFav}
        equipoInicial={editarFav?.equipo}
      />

      {/* Lightbox de fotos abierto desde la miniatura de una fila */}
      {rowLightbox && <ImageLightbox photos={rowLightbox.photos} initialIndex={rowLightbox.index} onClose={() => setRowLightbox(null)} />}

    </div>
  )
}
