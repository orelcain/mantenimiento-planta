import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  AlertTriangle,
  Map,
  Wrench,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronDown,
  CalendarClock,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui'
import { useAuthStore, useIsAdmin } from '@/store'
import { signOut } from '@/services/auth'
import { cn } from '@/lib/utils'
import { HelpButton, HelpModal, WelcomeModal } from '@/components/help'
import { APP_VERSION } from '@/constants/version'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Incidencias', href: '/incidents', icon: AlertTriangle },
  { name: 'Preventivo', href: '/preventive', icon: CalendarClock },
  { name: 'Mapa', href: '/map', icon: Map },
  { name: 'Equipos', href: '/equipment', icon: Wrench },
]

const adminNavigation = [
  { name: 'Configuración', href: '/settings', icon: Settings },
]

export function MainLayout() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const isAdmin = useIsAdmin()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    logout()
    navigate('/login')
  }

  const userInitials = user
    ? `${user.nombre.charAt(0)}${user.apellido.charAt(0)}`.toUpperCase()
    : 'U'

  const allNavigation = isAdmin
    ? [...navigation, ...adminNavigation]
    : navigation

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
            <div className="text-xs text-muted-foreground text-center py-1.5 px-2 bg-muted/50 rounded">
              v{APP_VERSION}
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
                  <p className="text-sm font-medium">
                    {user?.nombre} {user?.apellido}
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
            <div className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded">
              v{APP_VERSION}
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

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Help System Modals */}
      <HelpModal />
      <WelcomeModal />
    </div>
  )
}
