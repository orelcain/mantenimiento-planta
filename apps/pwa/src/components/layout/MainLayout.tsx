import { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Suspense } from 'react'
import {
  LayoutDashboard,
  AlertTriangle,
  Building2,
  Wrench,
  Package,
  Menu,
  X,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  RefreshCw,
  Camera,
  Sun,
  Moon,
  Activity,
  Cpu,
  Mail,
  Box,
  BarChart3,
  Bot,
  CloudSun,
  Droplets,
  BookOpen,
  GraduationCap,
  Shield,
  FolderArchive,
} from 'lucide-react'
import { Avatar, AvatarFallback, Button } from '@/components/ui'
import { useAuthStore, useIsAdmin, useAppStore, usePermissionsStore } from '@/store'
import { useSyncStore } from '@/store/syncStore'
import { getZones } from '@/services/zones'
import { getEquipments } from '@/services/equipment'
import { subscribeToIncidents } from '@/services/incidents'
import { signOut } from '@/services/auth'
import { cn } from '@/lib/utils'
import { HelpButton, HelpModal, WelcomeModal } from '@/components/help'
import { APP_VERSION } from '@/constants/version'
import { formatBuildLabel, formatBuildDateShort, formatUpdatedLabel } from '@/constants/buildInfo'
import { useAppVersion } from '@/hooks/useAppVersion'
import { useToast } from '@/hooks/useToast'
import { initUploadQueue } from '@/services/offlineUploadQueue'
import { useUploadQueueStore } from '@/store/uploadQueueStore'
import { saveUserPermissionsOverride, getUserPermissionsOverride } from '@/services/permissions'
import { loadSidebarConfig } from '@/services/sidebarConfig'
import { useTheme } from '@/hooks/useTheme'
import { useDevModulesVisibility } from '@/hooks/useDevModulesVisibility'

import type { AppModule } from '@/types/permissions'
import { ChatBot } from '@/components/chat/ChatBot'
import { logger } from '@/lib/logger'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  module?: AppModule
  /**
   * Cuando true, el item NO aparece en el sidebar a menos que el admin lo
   * habilite explícitamente desde `/admin/dev-modules` (per-dispositivo,
   * localStorage). Sirve para mantener limpio el menú mientras hay módulos
   * a medio terminar sin necesidad de borrar la ruta del repo.
   */
  inDevelopment?: boolean
}
interface NavGroup { id: string; label: string; items: NavItem[]; defaultOpen?: boolean; adminOnly?: boolean }

const navGroups: NavGroup[] = [
  {
    id: 'principal', label: 'Principal', defaultOpen: true,
    items: [
      { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard', inDevelopment: true },
      { name: 'Incidencias', href: '/incidents', icon: AlertTriangle, module: 'incidencias', inDevelopment: true },
      { name: 'Evidencias', href: '/photo-evidence', icon: Camera, module: 'fotoevidencia', inDevelopment: true },
    ],
  },
  {
    id: 'planificacion', label: 'Planificación',
    items: [
      { name: 'Preventivo', href: '/preventive', icon: CalendarClock, module: 'preventivo', inDevelopment: true },
      { name: 'Predictivo', href: '/predictive', icon: Activity, inDevelopment: true },
      { name: 'Planificador Gantt', href: '/gantt', icon: CalendarClock, module: 'gantt', inDevelopment: true },
      { name: 'Calendario Mantención', href: '/calendario-mantencion', icon: CalendarClock, module: 'calendarioMantencion' },
    ],
  },
  {
    id: 'equipamiento', label: 'Equipamiento',
    items: [
      { name: 'Equipos', href: '/equipment', icon: Wrench, module: 'equipos', inDevelopment: true },
      { name: 'Repuestos', href: '/repuestos', icon: Package, module: 'repuestos' },
      { name: 'Sensores', href: '/sensors', icon: Cpu, module: 'sensores', inDevelopment: true },
      { name: 'Panel Sensores', href: '/sensors/monitor', icon: Activity, module: 'sensores', inDevelopment: true },
    ],
  },
  {
    id: 'herramientas', label: 'Herramientas',
    items: [
      { name: 'Visor Planta 3D', href: '/map', icon: Building2, module: 'mapa' },
      { name: 'Visor 3D', href: '/visor-3d', icon: Box },
      { name: 'Análisis de Turno', href: '/analisis-grader', icon: BarChart3, module: 'analisisGrader' },
      { name: 'Clima Puerto', href: '/clima-puerto', icon: CloudSun, module: 'climaPuerto' as AppModule },
      { name: 'Planos de Aguas', href: '/planos-aguas', icon: Droplets, inDevelopment: true },
      { name: 'HMI Knuro', href: '/hmi-knuro', icon: Cpu },
      { name: 'Baader 200', href: '/baader-200', icon: BookOpen },
    ],
  },
  {
    id: 'aprendizaje', label: 'Aprendizaje',
    items: [
      { name: 'Centro de Aprendizaje', href: '/aprendizaje', icon: GraduationCap },
      { name: 'Centro Técnico Documental', href: '/centro-tecnico-documental', icon: FolderArchive },
    ],
  },
  {
    id: 'admin', label: 'Administración', adminOnly: true,
    items: [
      // Sidebar minimalista: el grupo 'Administración' es un único punto de
      // entrada al hub `/admin`. Allí están agrupados Configuración,
      // Jerarquías, Mapas, ETT, Visores (Clima/HMI/Baader), Permisos,
      // Credenciales Shoplogix, etc., con re-confirmación de identidad
      // sobre las opciones sensibles.
      { name: 'Panel Admin', href: '/admin', icon: Shield },
    ],
  },
]

/**
 * Hrefs que NUNCA pueden ocultarse desde `/admin/dev-modules`. Salvaguarda
 * anti-bloqueo: `/admin` es la única vía de vuelta al toggle, así que si se
 * pudiera ocultar el admin quedaría sin forma de revertir.
 */
const LOCKED_HREFS = new Set<string>(['/admin'])

export interface NavItemMeta {
  name: string
  href: string
  /** Etiqueta del grupo al que pertenece (para seccionar la página admin). */
  group: string
  inDevelopment: boolean
  /** Si true, no puede ocultarse (ver {@link LOCKED_HREFS}). */
  locked: boolean
}

/**
 * Catálogo plano de TODOS los items del sidebar con su metadata, derivado de
 * `navGroups`. Lo consume `/admin/dev-modules` para listar y togglear cualquier
 * módulo (en desarrollo o de producción) y el bottom-nav para respetar la misma
 * visibilidad.
 */
export const ALL_NAV_ITEMS: ReadonlyArray<NavItemMeta> = navGroups.flatMap((g) =>
  g.items.map((it) => ({
    name: it.name,
    href: it.href,
    group: g.label,
    inDevelopment: it.inDevelopment === true,
    locked: LOCKED_HREFS.has(it.href),
  })),
)

export function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const isAdmin = useIsAdmin()
  /* Para soporte: "¿qué versión tienes?" se responde con esto sin ocupar la
     línea con un número que el usuario no puede interpretar. */
  const versionTooltip = `v${APP_VERSION} · ${formatBuildLabel()}`
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarPeekOpen, setSidebarPeekOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1')
  const [ganttFocusMode, setGanttFocusMode] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showSyncPanel, setShowSyncPanel] = useState(false)
  const [syncFilter, setSyncFilter] = useState('all')
  const pendingWrites = useSyncStore((state) => state.pendingWrites)
  const pendingByContext = useSyncStore((state) => state.pendingByContext)
  const pendingEntries = useSyncStore((state) => state.pendingEntries)
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt)
  const lastSyncError = useSyncStore((state) => state.lastSyncError)
  const setSyncError = useSyncStore((state) => state.setSyncError)
  const setLastSyncAt = useSyncStore((state) => state.setLastSyncAt)
  const uploadItems = useUploadQueueStore((state) => state.items)
  const { toast } = useToast()
  const prevPendingRef = useRef(pendingWrites)
  const { hasUpdate, newVersion, reload } = useAppVersion()
  const { setZones, setEquipment, setIncidents } = useAppStore()
  const isGanttRoute = location.pathname.startsWith('/gantt')
  const isClimaRoute = location.pathname.startsWith('/clima-puerto')
  const isHmiKnuroRoute = location.pathname.startsWith('/hmi-knuro')
  const isBaader200Route = location.pathname.startsWith('/baader-200')
  const isPlanosAguasRoute = location.pathname.startsWith('/planos-aguas')
  const isAprendizajeRoute = location.pathname.startsWith('/aprendizaje')
  const isMapRoute = location.pathname.startsWith('/map')
  // Repuestos: lente área-first con 3 paneles (sidebar/lista/detalle) que scrollean
  // independientes → necesita contenedor de altura acotada + overflow-hidden (como Clima/HMI).
  const isRepuestosRoute = location.pathname.startsWith('/repuestos')
  const shouldHideDesktopSidebar =
    sidebarCollapsed || (isGanttRoute && ganttFocusMode && !sidebarPeekOpen)

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar_collapsed', next ? '1' : '0')
      return next
    })
  }

  const handleSignOut = async () => {
    await signOut()
    logout()
    navigate('/login')
  }

  const userInitials = user
    ? (user.rol === 'admin' ? 'AD' : `${user.nombre.charAt(0)}${user.apellido.charAt(0)}`.toUpperCase())
    : 'U'

  const displayName = user
    ? (user.rol === 'admin' ? 'Admin' : `${user.nombre} ${user.apellido}`)
    : ''

  const pendingSummary = Object.entries(pendingByContext)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key}: ${count}`)
    .join(', ')
  const lastSyncLabel = lastSyncAt ? new Date(lastSyncAt).toLocaleString('es-CL') : null
  const syncModules = Array.from(new Set(pendingEntries.map((entry) => entry.context.split(':')[0]))).sort()
  const filteredEntries = syncFilter === 'all'
    ? pendingEntries
    : pendingEntries.filter((entry) => entry.context.startsWith(`${syncFilter}:`))
  const syncPendingCount = filteredEntries.filter((entry) => entry.status === 'pending').length
  const syncErrorCount = filteredEntries.filter((entry) => entry.status === 'error' || entry.status === 'conflict').length
  const syncDoneCount = filteredEntries.filter((entry) => entry.status === 'synced').length
  const syncTotalCount = filteredEntries.length
  const syncProcessedCount = syncDoneCount + syncErrorCount
  const syncProgress = syncTotalCount > 0
    ? Math.min(100, Math.round((syncProcessedCount / syncTotalCount) * 100))
    : 0

  const exportSyncEntries = (format: 'json' | 'csv') => {
    if (pendingEntries.length === 0) return
    const rows = pendingEntries.map((entry) => ({
      id: entry.id,
      context: entry.context,
      status: entry.status,
      createdAt: new Date(entry.createdAt).toISOString(),
      error: entry.error ?? '',
    }))
    let content = ''
    let mime = ''
    if (format === 'json') {
      content = JSON.stringify(rows, null, 2)
      mime = 'application/json'
    } else {
      const header = 'id,context,status,createdAt,error'
      const csvRows = rows.map((r) => {
        const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
        return [r.id, r.context, r.status, r.createdAt, r.error].map(esc).join(',')
      })
      content = [header, ...csvRows].join('\n')
      mime = 'text/csv'
    }
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    a.href = url
    a.download = `sync-log-${ts}.${format}`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('gantt_focus_mode')
    if (saved === '1') {
      setGanttFocusMode(true)
    }
  }, [])

  useEffect(() => {
    if (!isGanttRoute) {
      setSidebarPeekOpen(false)
    }
  }, [isGanttRoute])

  useEffect(() => {
    initUploadQueue()
  }, [])

  useEffect(() => {
    if (!lastSyncError) return
    // Solo loguear en consola, sin toast emergente para no molestar al usuario
    logger.warn('[sync] ' + String(lastSyncError))
    setSyncError(null)
  }, [lastSyncError, setSyncError])

  useEffect(() => {
    const prev = prevPendingRef.current
    if (prev > 0 && pendingWrites === 0 && isOnline) {
      setLastSyncAt(Date.now())
    }
    prevPendingRef.current = pendingWrites
  }, [pendingWrites, isOnline, setLastSyncAt])

  const { canSee } = usePermissionsStore()

  // Handler: admin self-enable ARIA
  const handleEnableAria = async () => {
    if (!user) return
    try {
      const existing = await getUserPermissionsOverride(user.id)
      const currentPerms = existing?.permisos ?? {}
      await saveUserPermissionsOverride(
        user.id,
        {
          activo: true,
          permisos: { ...currentPerms, aria: { visible: true, actions: ['ver'] } },
          notas: 'ARIA habilitado por el propio admin',
        },
        user.id,
      )
      // Actualizar permisos en el store inmediatamente (sin esperar listener)
      const currentStorePerms = usePermissionsStore.getState().permisos
      usePermissionsStore.setState({
        permisos: { ...currentStorePerms, aria: { visible: true, actions: ['ver'] as import('@/types/permissions').ModuleAction[] } },
        tieneOverride: true,
      })
      toast({ title: 'ARIA Activado', description: 'El asistente ARIA está ahora disponible', variant: 'default' })
    } catch {
      toast({ title: 'Error', description: 'No se pudo activar ARIA', variant: 'destructive' })
    }
  }

  const { isDark, toggleTheme } = useTheme()

  // Orden dinámico del sidebar (cargado desde Firestore una vez)
  const [sidebarOrder, setSidebarOrder] = useState<{ groupOrder: string[]; itemOrders: Record<string, string[]> } | null>(null)
  useEffect(() => {
    loadSidebarConfig().then(config => {
      if (!config) return
      setSidebarOrder({
        groupOrder: config.groupOrder,
        itemOrders: Object.fromEntries(config.groups.map(g => [g.id, g.itemOrder])),
      })
    })
  }, [])

  // Filter groups by admin status and module permissions
  const orderedNavGroups = sidebarOrder
    ? [
        ...sidebarOrder.groupOrder
          .map(gid => navGroups.find(g => g.id === gid))
          .filter((g): g is NonNullable<typeof g> => Boolean(g))
          .map(g => {
            const itemOrder = sidebarOrder.itemOrders[g.id]
            if (!itemOrder) return g
            const ordered = itemOrder
              .map(href => g.items.find(i => i.href === href))
              .filter((i): i is NonNullable<typeof i> => Boolean(i))
            const rest = g.items.filter(i => !itemOrder.includes(i.href))
            return { ...g, items: [...ordered, ...rest] }
          }),
        // Grupos que no están en el config guardado (nuevos)
        ...navGroups.filter(g => !sidebarOrder.groupOrder.includes(g.id)),
      ]
    : navGroups

  const { isVisible: isModuleVisible } = useDevModulesVisibility()

  const visibleGroups = orderedNavGroups
    .filter(g => !g.adminOnly || isAdmin)
    .map(g => ({
      ...g,
      items: g.items.filter(item => {
        if (item.module && !canSee(item.module)) return false
        // Visibilidad por-dispositivo (toggle en `/admin/dev-modules`):
        // dev oculto por default, producción visible por default. `/admin` queda
        // siempre visible — es la vía de vuelta al toggle (anti-bloqueo).
        if (LOCKED_HREFS.has(item.href)) return true
        if (!isModuleVisible(item.href, !item.inDevelopment)) return false
        return true
      }),
    }))
    .filter(g => g.items.length > 0)

  // Flat list for compatibility (currentPageName, etc.)
  const allNavigation = visibleGroups.flatMap(g => g.items)

  // Collapsible group state (persisted in localStorage)
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('sidebar-groups')
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    // Default: all open initially
    return Object.fromEntries(navGroups.map(g => [g.id, g.defaultOpen ?? true]))
  })
  const toggleGroup = (id: string) => {
    setGroupOpen(prev => {
      const next = { ...prev, [id]: !prev[id] }
      localStorage.setItem('sidebar-groups', JSON.stringify(next))
      return next
    })
  }
  // Auto-expand group containing active route
  useEffect(() => {
    const activeGroup = visibleGroups.find(g =>
      g.items.some(item => item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href))
    )
    if (activeGroup && !groupOpen[activeGroup.id]) {
      setGroupOpen(prev => {
        const next = { ...prev, [activeGroup.id]: true }
        localStorage.setItem('sidebar-groups', JSON.stringify(next))
        return next
      })
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Barra inferior con destinos FIJOS (Constitución §18, §20, §61).
   *
   * Antes las pestañas eran CONTEXTUALES: cambiaban según el módulo en el que
   * estuvieras. Eso rompe el modelo mental — en iOS una tab bar es un mapa
   * estable de la app: siempre los mismos destinos, siempre en el mismo orden.
   * Si cambian bajo el dedo, deja de ser navegación y pasa a ser una barra de
   * acciones. La §18 lo pide explícito: "extremadamente predecible".
   *
   * Cinco es el máximo de la §20, y el quinto es "Más", que abre el cajón con
   * el resto de módulos. Incidencias entra sí o sí por la §55: la información
   * crítica no se esconde detrás de menús.
   */
  type BottomNavItem = { name: string; href: string; icon: React.ElementType; module?: AppModule }
  const fixedTabs: BottomNavItem[] = [
    { name: 'Inicio',      href: '/',           icon: LayoutDashboard, module: 'dashboard' },
    { name: 'Incidencias', href: '/incidents',  icon: AlertTriangle,   module: 'incidencias' },
    { name: 'Equipos',     href: '/equipment',  icon: Wrench,          module: 'equipos' },
    { name: 'Repuestos',   href: '/repuestos',  icon: Package,         module: 'repuestos' },
  ]
  const bottomNavItems = [...fixedTabs]
    .filter(item => !item.module || canSee(item.module))
    // Respetar la misma visibilidad que el sidebar: si el href está oculto
    // (dev no activado o producción ocultada), sacarlo también del bottom nav.
    .filter(item => {
      if (LOCKED_HREFS.has(item.href)) return true
      const meta = ALL_NAV_ITEMS.find(m => m.href === item.href)
      const defaultVisible = meta ? !meta.inDevelopment : true
      return isModuleVisible(item.href, defaultVisible)
    })

  const currentPageName = allNavigation.find(item =>
    item.href === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.href)
  )?.name ?? ''

  const readOnlyPrefixes = ['/settings', '/admin', '/hierarchy']
  const isReadOnly = !isOnline && readOnlyPrefixes.some((p) => location.pathname.startsWith(p))

  // Carga inicial de datos para el Dashboard (incidencias, equipos, zonas)
  useEffect(() => {
    let unsubscribe: undefined | (() => void)
    async function init() {
      try {
        const [zonesData, equipmentData] = await Promise.all([
          getZones(),
          getEquipments(),
        ])
        setZones(zonesData)
        setEquipment(equipmentData)
      } catch (error) {
        // Silenciar errores de carga inicial para no bloquear UI
        logger.warn('Init load error')
      }
      unsubscribe = subscribeToIncidents((list) => setIncidents(list))
    }
    if (user?.id) {
      init()
    }
    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [user?.id, setZones, setEquipment, setIncidents])

  return (
    <div className="min-h-screen bg-background flex">
      {/* Skip to content - accesibilidad */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-ctl">
        Ir al contenido principal
      </a>

      {/* ══════ DESKTOP SIDEBAR (static flex item, in document flow) ══════
          El sticky vive en el WRAPPER outer (no en el inner) y se ancla al
          flex parent `<div className="min-h-screen bg-background flex">`,
          que crece con el documento. Así el sidebar queda fijo en top:0
          mientras el main hace scroll. El inner es solo un contenedor de
          ancho fijo (w-64) para que el contenido no se reflowee durante
          la animación de colapsado del wrapper. */}
      <div
        className={cn(
          'hidden lg:flex flex-col flex-shrink-0 bg-[var(--sidebar-surface)] border-r transition-[width] duration-200 overflow-hidden h-screen sticky top-0',
          shouldHideDesktopSidebar ? 'w-0' : 'w-64'
        )}
      >
        <div className="w-64 flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-card">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold">Mantenimiento</span>
            </div>
            <button
              onClick={toggleSidebarCollapse}
              className="p-1.5 hover:bg-muted rounded-ctl transition-colors"
              aria-label="Contraer menú"
              title="Contraer menú"
            >
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Navigation — grouped */}
          <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-0.5">
            {visibleGroups.map((group) => {
              const isOpen = groupOpen[group.id] ?? group.defaultOpen ?? false
              return (
                <div key={group.id}>
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex items-center justify-between w-full px-2 py-1.5 text-caption font-semibold tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors rounded-ctl"
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', isOpen && 'rotate-180')} />
                  </button>
                  <div className={cn('overflow-hidden transition-all duration-200', isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0')}>
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        to={item.href}
                        onClick={() => { setSidebarOpen(false); setSidebarPeekOpen(false) }}
                        className={({ isActive }) =>
                          cn(
                            // Píldora INSETADA (mx-1), no fila a sangre: es lo
                            // que separa una barra lateral de macOS de una lista
                            // de links. El ícono acompaña al texto en el acento.
                            'mx-1 flex items-center gap-2.5 rounded-ctl px-2.5 py-2 text-sm font-medium transition-colors',
                            '[&_svg]:size-[18px]',
                            isActive
                              ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-foreground)]'
                              : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground'
                          )
                        }
                      >
                        <item.icon className="h-5 w-5" />
                        {item.name}
                      </NavLink>
                    ))}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* El sello dice CUÁNDO se actualizó, no qué número de versión: es la
              pregunta que se hace quien mira, y la única que el dato responde
              con verdad (ver constants/buildInfo.ts). Versión y SHA en el
              tooltip, para soporte. */}
          <div className="px-4 pb-2">
            <div
              className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1.5 px-2 bg-muted/50 rounded-ctl"
              title={versionTooltip}
            >
              <span className="tabular-nums">{formatUpdatedLabel()}</span>
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={reload}
                  title="Forzar actualización"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* User section */}
          <div className="p-4 border-t">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-3 w-full p-2 rounded-card hover:bg-muted transition-colors"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium">
                      {displayName}
                    </p>
                    {user?.authProvider === 'google' && (
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-label="Cuenta Google" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {user?.email}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {user?.rol}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform',
                    userMenuOpen && 'rotate-180'
                  )}
                />
              </button>

              {/* User dropdown */}
              {userMenuOpen && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border rounded-card shadow-lg overflow-hidden">
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ══════ MOBILE SIDEBAR (fixed overlay, only on small screens) ══════ */}
      {sidebarOpen && (
        <div className="lg:hidden">
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="navigation"
            aria-label="Menú principal"
            className="fixed inset-y-0 left-0 z-50 w-64 bg-[var(--sidebar-surface)]"
          >
            <div className="flex flex-col h-full">
              {/* Logo */}
              <div className="flex items-center justify-between h-16 px-4 border-b">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 rounded-card">
                    <Wrench className="h-5 w-5 text-primary" />
                  </div>
                  <span className="font-semibold">Mantenimiento</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={toggleTheme}
                    title={isDark ? 'Cambiar a vista clara' : 'Cambiar a vista oscura'}
                    className="p-1.5 rounded-card text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  </button>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 hover:bg-muted rounded-ctl"
                    aria-label="Cerrar menú"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Navigation — grouped (mobile) */}
              <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-0.5">
                {visibleGroups.map((group) => {
                  const isOpen = groupOpen[group.id] ?? group.defaultOpen ?? false
                  return (
                    <div key={group.id}>
                      <button
                        onClick={() => toggleGroup(group.id)}
                        className="flex items-center justify-between w-full px-2 py-1.5 text-caption font-semibold tracking-wider text-muted-foreground/60 hover:text-muted-foreground transition-colors rounded-ctl"
                      >
                        <span>{group.label}</span>
                        <ChevronDown className={cn('h-3 w-3 transition-transform duration-200', isOpen && 'rotate-180')} />
                      </button>
                      <div className={cn('overflow-hidden transition-all duration-200', isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0')}>
                        {group.items.map((item) => (
                          <NavLink
                            key={item.href}
                            to={item.href}
                            onClick={() => { setSidebarOpen(false); setSidebarPeekOpen(false) }}
                            className={({ isActive }) =>
                              cn(
                                // Mismo tratamiento que la barra de escritorio.
                                'mx-1 flex items-center gap-2.5 rounded-ctl px-2.5 py-2 text-sm font-medium transition-colors',
                                '[&_svg]:size-[18px]',
                                isActive
                                  ? 'bg-[var(--sidebar-active)] text-[var(--sidebar-active-foreground)]'
                                  : 'text-muted-foreground hover:bg-muted-foreground/10 hover:text-foreground'
                              )
                            }
                          >
                            <item.icon className="h-5 w-5" />
                            {item.name}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </nav>

              {/* Version label (mobile) — el toggle de tema vive en la cabecera del drawer */}
              <div className="px-4 pb-2 flex items-center gap-2">
                <div
                  className="flex-1 flex items-center justify-center gap-2 text-xs text-muted-foreground py-1.5 px-2 bg-muted/50 rounded-ctl"
                  title={versionTooltip}
                >
                  <span className="tabular-nums">{formatUpdatedLabel()}</span>
                </div>
              </div>

              {/* User section */}
              <div className="p-4 border-t">
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-3 w-full p-2 rounded-card hover:bg-muted transition-colors"
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium">{displayName}</p>
                        {user?.authProvider === 'google' && (
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-label="Cuenta Google" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">{user?.rol}</p>
                    </div>
                    <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', userMenuOpen && 'rotate-180')} />
                  </button>

                  {userMenuOpen && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border rounded-card shadow-lg overflow-hidden">
                      <button
                        onClick={handleSignOut}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                      >
                        <LogOut className="h-4 w-4" />
                        Cerrar sesión
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Gantt peek hover zone (desktop, when focus mode hides sidebar) */}
      {isGanttRoute && ganttFocusMode && !sidebarCollapsed && (
        <button
          type="button"
          className="hidden lg:block fixed left-0 top-24 z-40 h-[calc(100vh-6rem)] w-2 bg-transparent hover:bg-primary/10"
          onMouseEnter={() => setSidebarPeekOpen(true)}
          aria-label="Mostrar menú lateral"
          title="Mostrar menú lateral"
        />
      )}

      {/* Sidebar expand edge tab (desktop, when collapsed) */}
      {shouldHideDesktopSidebar && (
        <button
          type="button"
          className="hidden lg:flex fixed left-0 top-1/2 -translate-y-1/2 z-40 items-center justify-center w-6 h-14 bg-card/80 backdrop-blur-sm border border-l-0 rounded-r-lg shadow-md hover:bg-muted hover:w-8 transition-all duration-200 group"
          onClick={toggleSidebarCollapse}
          aria-label="Expandir menú lateral"
          title="Expandir menú lateral"
        >
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      )}

      {/* ══════ MAIN CONTENT AREA ══════ */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="hidden lg:flex sticky top-0 z-30 items-center h-14 px-4 bg-background/80 backdrop-blur border-b">
          {/* Mobile: title centrado + hamburgesa para rutas secundarias */}
          <div className="flex-1 flex items-center lg:hidden">
            {currentPageName && (
              <span className="text-sm font-semibold truncate">{currentPageName}</span>
            )}
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -mr-2 hover:bg-muted rounded-card text-muted-foreground"
            aria-label="Abrir menú completo"
            aria-expanded={sidebarOpen}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="hidden lg:flex flex-1" />

          {isGanttRoute && (
            <Button
              size="sm"
              variant={ganttFocusMode ? 'default' : 'outline'}
              className="mr-2"
              onClick={() => {
                const next = !ganttFocusMode
                setGanttFocusMode(next)
                setSidebarPeekOpen(false)
                setSidebarOpen(false)
                localStorage.setItem('gantt_focus_mode', next ? '1' : '0')
              }}
            >
              {ganttFocusMode ? 'Salir enfoque' : 'Modo enfoque'}
            </Button>
          )}

          {/* Desktop user menu */}
          <div className="hidden lg:flex items-center gap-3">
            {(pendingWrites > 0 || lastSyncLabel) && (
              <button
                className="flex items-center gap-2 text-xs text-ink-warn px-2 py-1 bg-amber-500/[0.15] rounded-ctl hover:bg-amber-500/[0.15] transition-colors"
                title={pendingSummary || lastSyncLabel || undefined}
                onClick={() => setShowSyncPanel((prev) => !prev)}
              >
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>{pendingWrites} pendiente{pendingWrites > 1 ? 's' : ''}</span>
              </button>
            )}
            {/* Colapsado: solo cabe la fecha. El resto, en el tooltip. */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded-ctl">
              <span className="tabular-nums" title={versionTooltip}>{formatBuildDateShort()}</span>
              {isAdmin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={reload}
                  title="Forzar actualización"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <button
              onClick={toggleTheme}
              title={isDark ? 'Cambiar a vista clara' : 'Cambiar a vista oscura'}
              className="p-1.5 rounded-card transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <HelpButton />
            <span className="text-sm text-muted-foreground">
              {user?.nombre} {user?.apellido}
            </span>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {userInitials}
              </AvatarFallback>
            </Avatar>
          </div>
        </header>

        {/* Syncing banner (mobile) */}
        {isOnline && pendingWrites > 0 && (
          <div className="mx-4 mt-4 lg:mx-6 lg:hidden bg-amber-500/[0.15] border border-amber-500/[0.25] text-ink-warn px-4 py-2 rounded-card flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Sincronizando...</span>
            </div>
            <button
              className="text-xs font-medium underline"
              onClick={() => setShowSyncPanel((prev) => !prev)}
            >
              {pendingWrites} pendiente{pendingWrites > 1 ? 's' : ''}
            </button>
          </div>
        )}

        {/* Offline banner */}
        {!isOnline && (
          <div className="mx-4 mt-4 lg:mx-6 bg-amber-500/[0.15] border border-amber-500/[0.25] text-ink-warn px-4 py-3 rounded-card flex items-center justify-between gap-3">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <span className="font-medium block">Sin conexion a internet</span>
              <span className="text-sm opacity-80">
                Puedes navegar datos en cache. Los cambios se sincronizaran al reconectar.
              </span>
              {pendingSummary && (
                <span className="text-xs opacity-80 block mt-1">
                  Pendientes: {pendingSummary}
                </span>
              )}
            </div>
            {pendingWrites > 0 && (
              <div className="ml-auto text-xs font-medium bg-amber-500/[0.15] text-ink-warn px-2 py-1 rounded-ctl">
                {pendingWrites} pendiente{pendingWrites > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {showSyncPanel && (pendingEntries.length > 0 || uploadItems.length > 0 || lastSyncLabel) && (
          <div className="mx-4 mt-4 lg:mx-6 bg-card border rounded-card shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Sincronizacion</h3>
                {lastSyncLabel && (
                  <p className="text-xs text-muted-foreground">Ultimo sync: {lastSyncLabel}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">
                  <span className="sr-only">Filtro</span>
                  <select
                    className="text-xs bg-transparent border rounded-ctl px-2 py-1"
                    value={syncFilter}
                    onChange={(e) => setSyncFilter(e.target.value)}
                  >
                    <option value="all">Todos</option>
                    {syncModules.map((module) => (
                      <option key={module} value={module}>{module}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => exportSyncEntries('json')}
                >
                  Exportar JSON
                </button>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => exportSyncEntries('csv')}
                >
                  Exportar CSV
                </button>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowSyncPanel(false)}
                >
                  Cerrar
                </button>
              </div>
            </div>

            {syncTotalCount > 0 && (
              <div className="mt-3 rounded-ctl border p-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">
                    Progreso: {syncProcessedCount}/{syncTotalCount} ({syncProgress}%)
                  </span>
                  <span className="text-muted-foreground">
                    Pendientes: {syncPendingCount} · Errores: {syncErrorCount}
                  </span>
                </div>
                <div className="h-2 w-full rounded-ctl bg-muted overflow-hidden">
                  <div
                    className="h-2 bg-primary transition-all"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {filteredEntries.slice(0, 10).map((entry) => (
                <div key={entry.id} className="flex items-start justify-between text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{entry.context}</div>
                    <div className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleTimeString()}
                      {entry.refPath ? ` · ${entry.refPath}` : ''}
                    </div>
                    {entry.payload && (
                      <div className="text-muted-foreground mt-1 truncate">
                        {entry.payload}
                      </div>
                    )}
                    {entry.error && (
                      <div className="text-destructive mt-1">{entry.error}</div>
                    )}
                    {entry.status === 'conflict' && (
                      <div className="text-amber-700 mt-1">Conflicto detectado</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {(entry.status === 'error' || entry.status === 'conflict') && entry.retryable && entry.retry && (
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => entry.retry?.()}
                      >
                        Reintentar
                      </button>
                    )}
                    <span
                      className={
                        entry.status === 'synced'
                          ? 'text-emerald-600'
                          : entry.status === 'error'
                            ? 'text-destructive'
                            : entry.status === 'conflict'
                              ? 'text-amber-700'
                              : 'text-amber-600'
                      }
                    >
                      {entry.status === 'synced'
                        ? 'Sincronizado'
                        : entry.status === 'error'
                          ? 'Error'
                          : entry.status === 'conflict'
                            ? 'Conflicto'
                            : 'Pendiente'}
                    </span>
                  </div>
                </div>
              ))}
              {filteredEntries.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay operaciones para este filtro.</p>
              )}
            </div>

            {uploadItems.length > 0 && (
              <div className="mt-4 border-t pt-3">
                <h4 className="text-xs font-medium">Uploads pendientes</h4>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                  {uploadItems.slice(0, 10).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {item.fileName}
                        </div>
                        <div className="text-muted-foreground">
                          {item.type} · {Math.round(item.size / 1024)} KB
                        </div>
                        {item.error && (
                          <div className="text-destructive mt-1">{item.error}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{item.progress}%</span>
                        <span
                          className={
                            item.status === 'done'
                              ? 'text-emerald-600'
                              : item.status === 'error'
                                ? 'text-destructive'
                                : 'text-amber-600'
                          }
                        >
                          {item.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Banner de actualización disponible */}
        {hasUpdate && (
          <div className="mx-4 mt-4 lg:mx-6 bg-primary/[0.15] border border-primary/[0.25] text-ink-info px-4 py-3 rounded-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <RefreshCw className="h-5 w-5" />
              <div>
                <span className="font-medium block">
                  Nueva versión disponible: {newVersion}
                </span>
                <span className="text-sm opacity-80">
                  Recarga la página para obtener la última versión
                </span>
              </div>
            </div>
            <Button 
              onClick={reload} 
              variant="default" 
              size="sm" 
              className="gap-2 ml-4 transition-all hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
            >
              <RefreshCw className="h-4 w-4 animate-spin-slow" />
              Recargar
            </Button>
          </div>
        )}

        {/* Page content */}
        <main
          id="main-content"
          className={`${
            isClimaRoute || isHmiKnuroRoute || isBaader200Route || isMapRoute || isPlanosAguasRoute || isRepuestosRoute
              ? 'h-[calc(100vh-3.5rem-4rem)] lg:h-[calc(100vh-3.5rem)] p-0 overflow-hidden'
              : isAprendizajeRoute
              ? 'p-0 w-full max-w-[100vw] overflow-x-hidden pb-16 lg:pb-0'
              : location.pathname === '/'
              ? 'p-0 w-full max-w-[100vw] overflow-x-hidden'
              : 'p-3 lg:p-6 w-full max-w-[100vw] overflow-x-hidden pb-20 [@media(max-height:500px)]:pb-12 lg:pb-6'
          } ${
            isReadOnly ? 'pointer-events-none opacity-70' : ''
          }`}
        >
          <Suspense
            /*
             * Remonta al cambiar de PÁGINA, no en cualquier navegación.
             *
             * El key existe desde f2712b8a para que al saltar entre dos rutas
             * lazy no quede el contenido de la anterior colgado mientras carga
             * la nueva. `location.key`, sin embargo, cambia en TODA navegación
             * — también en una que solo toca el query string. Y varias páginas
             * usan la URL como estado de UI (`IncidentsPage` con sus 5 filtros,
             * `GanttPlannerPage`, el detalle de turno): ahí cada filtro tocado
             * remontaba la página entera y repetía todas las lecturas de
             * Firestore.
             *
             * `location.pathname` conserva el arreglo original (cambiar de
             * ruta sí remonta) y deja de castigar el cambio de query.
             */
            key={location.pathname}
            fallback={
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>

        {isReadOnly && (
          <div className="fixed inset-0 z-40 flex items-start justify-center pt-24 pointer-events-none">
            <div className="pointer-events-auto bg-amber-500/[0.15] text-amber-950 px-4 py-3 rounded-card shadow-lg border border-amber-500/[0.25] max-w-md">
              <div className="font-medium">Modo solo lectura</div>
              <div className="text-sm opacity-90">
                Estas en una seccion critica sin conexion. Conectate para editar o vuelve al inicio.
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  className="text-xs px-2 py-1 rounded-ctl bg-white/70 hover:bg-white"
                  onClick={() => navigate('/')}
                >
                  Ir al inicio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help System Modals */}
      <HelpModal />
      <WelcomeModal />

      {/* Chatbot flotante — controlado por permisos */}
      {canSee('aria') && <ChatBot />}

      {/* Botón para que admin active ARIA si no está habilitado */}
      {!canSee('aria') && isAdmin && (
        <button
          onClick={handleEnableAria}
          className="fixed right-6 z-50 flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3 text-white shadow-lg hover:from-blue-700 hover:to-purple-700 transition-all hover:scale-105 bottom-24 lg:bottom-6"
          title="Activar ARIA Asistente"
        >
          <Bot className="h-5 w-5" />
          <span className="text-sm font-medium">Activar ARIA</span>
        </button>
      )}

      {/* ══════ MOBILE BOTTOM NAV BAR ══════ */}
      {/* Oculto en home (/) — el home mobile tiene su propio botón de menú arriba */}
      <nav
        className={cn(
          // §36: la translucidez es para el CROMO de navegación — este es su
          // sitio. §38: separador de 1 px casi invisible, no un borde marcado.
          'lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card/80 backdrop-blur-xl border-t border-border/40',
          location.pathname === '/' && 'hidden',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Navegación principal"
      >
        <div className="flex items-stretch h-16 [@media(max-height:500px)]:h-10">
          {bottomNavItems.map(item => {
            const isActive = item.href === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.href)
            return (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  // §16: 44px mínimo de área táctil (uso con guantes).
                  'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-11 text-caption font-medium transition-colors active:scale-[0.97] relative',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
                aria-label={item.name}
              >
                {/* La barrita superior era un patrón de Material Design. En iOS
                    el estado activo se comunica con el COLOR del ícono y del
                    texto, y con más peso de trazo — nada más (§17). */}
                <item.icon className={cn('h-[22px] w-[22px] [@media(max-height:500px)]:h-4 [@media(max-height:500px)]:w-4', isActive && 'stroke-[2.4px]')} />
                <span className="[@media(max-height:500px)]:hidden">{item.name}</span>
              </NavLink>
            )
          })}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-11 text-caption font-medium text-muted-foreground transition-colors active:scale-[0.97]"
            aria-label="Más opciones"
          >
            <Menu className="h-[22px] w-[22px] [@media(max-height:500px)]:h-4 [@media(max-height:500px)]:w-4" />
            <span className="[@media(max-height:500px)]:hidden">Más</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
