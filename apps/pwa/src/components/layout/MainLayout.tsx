import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  AlertTriangle,
  Map,
  Wrench,
  Settings,
  Package,
  Menu,
  X,
  LogOut,
  ChevronDown,
  CalendarClock,
  FolderTree,
  RefreshCw,
  Camera,
  Activity,
  Cpu,
  MapPin,
  FileText,
  Route,
  Mail,
  Box,
} from 'lucide-react'
import { Avatar, AvatarFallback, Button } from '@/components/ui'
import { useAuthStore, useIsAdmin, useAppStore } from '@/store'
import { getZones } from '@/services/zones'
import { getEquipments } from '@/services/equipment'
import { subscribeToIncidents } from '@/services/incidents'
import { signOut } from '@/services/auth'
import { cn } from '@/lib/utils'
import { HelpButton, HelpModal, WelcomeModal } from '@/components/help'
import { APP_VERSION } from '@/constants/version'
import { useAppVersion } from '@/hooks/useAppVersion'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Incidencias', href: '/incidents', icon: AlertTriangle },
  { name: 'Evidencias', href: '/photo-evidence', icon: Camera },
  { name: 'Inspecciones', href: '/inspections', icon: Route },
  { name: 'Preventivo', href: '/preventive', icon: CalendarClock },
  { name: 'Predictivo', href: '/predictive', icon: Activity },
  { name: 'Sensores', href: '/sensors', icon: Cpu },
  { name: 'Visor de Mapas', href: '/map', icon: Map },
  { name: 'Equipos', href: '/equipment', icon: Wrench },
  { name: 'Repuestos', href: '/repuestos', icon: Package },
  { name: 'Visor 3D', href: '/visor-3d', icon: Box },
  { name: 'Configuración', href: '/settings', icon: Settings },
]

const adminNavigation = [
  { name: 'Jerarquías', href: '/hierarchy', icon: FolderTree },
  { name: 'Mapas', href: '/admin/maps', icon: MapPin },
  { name: 'ETT', href: '/admin/ett', icon: FileText },
]

export function MainLayout() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const isAdmin = useIsAdmin()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const { hasUpdate, newVersion, reload } = useAppVersion()
  const { setZones, setEquipment, setIncidents } = useAppStore()

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

  const allNavigation = isAdmin
    ? [...navigation, ...adminNavigation]
    : navigation

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
        console.warn('Init load error:', error)
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
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 border-b">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wrench className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold">Mantenimiento</span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 hover:bg-muted rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {allNavigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* Version label */}
          <div className="px-4 pb-2">
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-1.5 px-2 bg-muted/50 rounded">
              <span>v{APP_VERSION}</span>
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
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted transition-colors"
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
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" title="Cuenta Google" />
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
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border rounded-lg shadow-lg overflow-hidden">
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

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex items-center h-16 px-4 bg-background/80 backdrop-blur border-b">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 hover:bg-muted rounded-lg"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1" />

          {/* Desktop user menu */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Version badge */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded">
              <span>v{APP_VERSION}</span>
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

        {/* Offline banner */}
        {!isOnline && (
          <div className="mx-4 mt-4 lg:mx-6 bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <span className="font-medium block">Sin conexion a internet</span>
              <span className="text-sm opacity-80">
                Puedes navegar datos en cache. Los cambios se sincronizaran al reconectar.
              </span>
            </div>
          </div>
        )}

        {/* Banner de actualización disponible */}
        {hasUpdate && (
          <div className="mx-4 mt-4 lg:mx-6 bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 px-4 py-3 rounded-lg flex items-center justify-between">
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
        <main className="p-3 lg:p-6 w-full max-w-[100vw] overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      {/* Help System Modals */}
      <HelpModal />
      <WelcomeModal />
    </div>
  )
}
