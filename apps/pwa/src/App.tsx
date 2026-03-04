import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { onAuthChange, getUserById, signOut as signOutService } from '@/services/auth'
import { useAuthStore, usePermissionsStore } from '@/store'
import { logger } from '@/lib/logger'
import { LoadingScreen } from '@/components/ui'
import { MainLayout } from '@/components/layout'
import { HelpProvider } from '@/components/help'
import { MachineProvider } from '@/contexts/MachineContext'
import { initializeHierarchySystem, isHierarchyInitialized } from '@/services/hierarchyInit'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

// Todas las páginas con lazy loading para reducir bundle inicial
const LoginPage = lazy(() => import('@/pages/LoginPage').then((mod) => ({ default: mod.LoginPage })))

// Helper para recargar chunks automáticamente en caso de error de versión (deploy nuevo)
const lazyWithReload = (fn: () => Promise<any>) =>
  lazy(() =>
    fn().catch((error) => {
      // Verificar errores comunes de carga de módulos/chunks
      const isChunkLoadError = 
        error.name === 'TypeError' && 
        (error.message?.includes('Failed to fetch dynamically imported module') ||
         error.message?.includes('Importing a module script failed') ||
         error.message?.includes('check the network connection'))

      if (isChunkLoadError) {
        // Guardar flag para evitar bucles infinitos de recarga
        const storageKey = 'chunk_load_error_reload'
        const reloaded = sessionStorage.getItem(storageKey)
        
        if (!reloaded) {
          console.log('Recargando página por actualización de versión (Chunk Load Error)...')
          sessionStorage.setItem(storageKey, 'true')
          window.location.reload()
          return new Promise(() => {}) // Promesa perpetua mientras recarga
        } else {
          // Si ya recargamos y sigue fallando, limpiar flag y dejar que explote (o mostrar error)
          sessionStorage.removeItem(storageKey)
        }
      }
      throw error
    })
  )

// Code Splitting con autorecarga
const DashboardPage = lazyWithReload(() => import('@/pages/DashboardPage').then((mod) => ({ default: mod.DashboardPage })))
const IncidentsPage = lazyWithReload(() => import('@/pages/IncidentsPage').then((mod) => ({ default: mod.IncidentsPage })))
const EquipmentPage = lazyWithReload(() => import('@/pages/EquipmentPage').then((mod) => ({ default: mod.EquipmentPage })))
const PredictivePage = lazyWithReload(() => import('@/pages/PredictivePage').then((mod) => ({ default: mod.PredictivePage })))
const RepuestosDashboard = lazyWithReload(() => import('@/pages/repuestos/Dashboard').then((mod) => ({ default: mod.RepuestosDashboard })))
const MapPage = lazyWithReload(() => import('@/pages/MapPage').then((mod) => ({ default: mod.MapPage })))
const PreventivePage = lazyWithReload(() => import('@/pages/PreventivePage').then((mod) => ({ default: mod.PreventivePage })))
const SettingsPage = lazyWithReload(() => import('@/pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage })))
const HierarchyPage = lazyWithReload(() => import('@/pages/HierarchyPage').then((mod) => ({ default: mod.HierarchyPage })))
const PhotoEvidencePage = lazyWithReload(() => import('@/pages/PhotoEvidencePage').then((mod) => ({ default: mod.PhotoEvidencePage })))
const PublicEquipmentView = lazyWithReload(() => import('@/pages/PublicEquipmentView').then((mod) => ({ default: mod.PublicEquipmentView })))
const SensorsPage = lazyWithReload(() => import('@/pages/SensorsPage').then((mod) => ({ default: mod.SensorsPage })))
const SensorsMonitorPage = lazyWithReload(() => import('@/pages/SensorsMonitorPage').then((mod) => ({ default: mod.SensorsMonitorPage })))
const MapsAdminPage = lazyWithReload(() => import('@/pages/admin/MapsAdminPage').then((mod) => ({ default: mod.MapsAdminPage })))
const InspectionsPage = lazyWithReload(() => import('@/pages/InspectionsPage').then((mod) => ({ default: mod.InspectionsPage })))
const ETTPage = lazyWithReload(() => import('@/pages/admin/ETTPage').then((mod) => ({ default: mod.ETTPage })))
const PermissionsPage = lazyWithReload(() => import('@/pages/admin/PermissionsPage').then((mod) => ({ default: mod.PermissionsPage })))
const Visor3DListPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DListPage').then((mod) => ({ default: mod.Visor3DListPage })))
const Visor3DViewerPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DViewerPage').then((mod) => ({ default: mod.Visor3DViewerPage })))
const Visor3DPublicPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DPublicPage').then((mod) => ({ default: mod.Visor3DPublicPage })))
const AnalisisGraderWizardPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderWizardPage').then((mod) => ({ default: mod.AnalisisGraderWizardPage })))
const AnalisisGraderSessionPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderSessionPage').then((mod) => ({ default: mod.AnalisisGraderSessionPage })))
const AnalisisGraderSessionsListPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderSessionsListPage').then((mod) => ({ default: mod.AnalisisGraderSessionsListPage })))
const AnalisisGraderCalendarPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderCalendarPage').then((mod) => ({ default: mod.AnalisisGraderCalendarPage })))
const GanttModulePage = lazyWithReload(() => import('@/pages/gantt/GanttModulePage').then((mod) => ({ default: mod.GanttModulePage })))
const AriaActionsPage = lazyWithReload(() => import('@/pages/AriaActionsPage').then((mod) => ({ default: mod.AriaActionsPage })))
const ClimaPortPage = lazyWithReload(() => import('@/pages/ClimaPortPage').then((mod) => ({ default: mod.ClimaPortPage })))
const CalendarioMantencionPage = lazyWithReload(() => import('@/pages/CalendarioMantencionPage').then((mod) => ({ default: mod.CalendarioMantencionPage })))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const [searchParams] = useSearchParams()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isAuthenticated) {
    // Si hay un redirect query param (ej. desde QR), ir ahí en vez de /
    const redirectTo = searchParams.get('redirect') || '/'
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!user || user.rol !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export function App() {
  const { setUser, setLoading } = useAuthStore()
  const { loadPermissions, clearPermissions } = usePermissionsStore()

  // Escuchar cambios en la autenticación
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const user = await getUserById(firebaseUser.uid)
          if (!user) {
            logger.warn('Usuario Auth sin perfil en Firestore; cerrando sesión', { uid: firebaseUser.uid })
            await signOutService()
            setUser(null)
            clearPermissions()
            return
          }

          if (!user.activo) {
            logger.warn('Usuario desactivado; cerrando sesión', { uid: firebaseUser.uid })
            await signOutService()
            setUser(null)
            clearPermissions()
            return
          }

          setUser(user)
          
          // Cargar permisos dinámicos del usuario
          await loadPermissions(user)
          
          // Inicializar jerarquía automáticamente si es admin y no está inicializada
          if (user && user.rol === 'admin') {
            const initialized = await isHierarchyInitialized()
            if (!initialized) {
              logger.info('Auto-inicializando jerarquía para admin', { userId: user.id })
              await initializeHierarchySystem(user.id)
              logger.info('Jerarquía inicializada exitosamente')
            }
          }
        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error('Error fetching user')
          logger.error('Error fetching user', err)
          setUser(null)
          clearPermissions()
        }
      } else {
        setUser(null)
        clearPermissions()
      }
    })

    return () => unsubscribe()
  }, [setUser, setLoading, loadPermissions, clearPermissions])

  return (
    <MachineProvider>
      <HelpProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Toaster />
          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
            <Routes>
              {/* Public routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* Public 3D viewer (requires auth but no sidebar) */}
          <Route
            path="/v/:modelId"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DPublicPage />
              </Suspense>
            }
          />

          {/* Public equipment view (no auth required) */}
          <Route
            path="/public/equipment/:id"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <PublicEquipmentView />
              </Suspense>
            }
          />
          <Route
            path="/public/equipment"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <PublicEquipmentView />
              </Suspense>
            }
          />

          {/* Private routes */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            <Route path="map" element={
              <Suspense fallback={<LoadingScreen />}>
                <MapPage />
              </Suspense>
            } />
            <Route path="inspections" element={
              <Suspense fallback={<LoadingScreen />}>
                <InspectionsPage />
              </Suspense>
            } />
            <Route path="equipment" element={<EquipmentPage />} />
            <Route path="repuestos" element={<RepuestosDashboard />} />
            <Route path="predictive" element={<PredictivePage />} />
            <Route path="sensors" element={
              <Suspense fallback={<LoadingScreen />}>
                <SensorsPage />
              </Suspense>
            } />
            <Route path="sensors/monitor" element={
              <Suspense fallback={<LoadingScreen />}>
                <SensorsMonitorPage />
              </Suspense>
            } />
            <Route path="preventive" element={
              <Suspense fallback={<LoadingScreen />}>
                <PreventivePage />
              </Suspense>
            } />
            <Route path="settings" element={
              <Suspense fallback={<LoadingScreen />}>
                <SettingsPage />
              </Suspense>
            } />
            <Route path="hierarchy" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <HierarchyPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="photo-evidence" element={
              <Suspense fallback={<LoadingScreen />}>
                <PhotoEvidencePage />
              </Suspense>
            } />
            <Route path="admin/maps" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <MapsAdminPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="admin/permissions" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <PermissionsPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="admin/ett" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <ETTPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="visor-3d" element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DListPage />
              </Suspense>
            } />
            <Route path="visor-3d/:modelId" element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DViewerPage />
              </Suspense>
            } />
            <Route path="analisis-grader" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderWizardPage />
              </Suspense>
            } />
            <Route path="analisis-grader/sesiones" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderSessionsListPage />
              </Suspense>
            } />
            <Route path="analisis-grader/calendario" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderCalendarPage />
              </Suspense>
            } />
            <Route path="analisis-grader/sesion/:sessionId" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderSessionPage />
              </Suspense>
            } />
            <Route path="gantt" element={
              <Suspense fallback={<LoadingScreen />}>
                <GanttModulePage />
              </Suspense>
            } />
            <Route path="aria-actions" element={
              <Suspense fallback={<LoadingScreen />}>
                <AriaActionsPage />
              </Suspense>
            } />
            <Route path="clima-puerto" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <ClimaPortPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="calendario-mantencion" element={
              <Suspense fallback={<LoadingScreen />}>
                <CalendarioMantencionPage />
              </Suspense>
            } />
            <Route path="gantt/dashboard" element={<Navigate to="/gantt?tab=ejecutivo" replace />} />
            <Route path="gantt/mobile" element={<Navigate to="/gantt?tab=movil" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </HelpProvider>
    </MachineProvider>
  )
}
