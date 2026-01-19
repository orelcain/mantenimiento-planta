import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { onAuthChange, getUserById, signOut as signOutService } from '@/services/auth'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'
import { LoadingScreen } from '@/components/ui'
import { MainLayout } from '@/components/layout'
import { HelpProvider } from '@/components/help'
import { initializeHierarchySystem, isHierarchyInitialized } from '@/services/hierarchyInit'
import { Toaster } from '@/components/ui/toaster'
import {
  LoginPage,
  DashboardPage,
  IncidentsPage,
  EquipmentPage,
  PredictivePage,
  RepuestosDashboard,
  CatalogoBases,
} from '@/pages'

// Code Splitting: Lazy load para páginas pesadas o menos usadas
const MapPage = lazy(() => import('@/pages/MapPage').then((mod) => ({ default: mod.MapPage })))
const PreventivePage = lazy(() => import('@/pages/PreventivePage').then((mod) => ({ default: mod.PreventivePage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage })))
const HierarchyPage = lazy(() => import('@/pages/HierarchyPage').then((mod) => ({ default: mod.HierarchyPage })))
const PhotoEvidencePage = lazy(() => import('@/pages/PhotoEvidencePage').then((mod) => ({ default: mod.PhotoEvidencePage })))
const PublicEquipmentView = lazy(() => import('@/pages/PublicEquipmentView').then((mod) => ({ default: mod.PublicEquipmentView })))
const SensorsPage = lazy(() => import('@/pages/SensorsPage').then((mod) => ({ default: mod.SensorsPage })))

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

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
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
            return
          }

          if (!user.activo) {
            logger.warn('Usuario desactivado; cerrando sesión', { uid: firebaseUser.uid })
            await signOutService()
            setUser(null)
            return
          }

          setUser(user)
          
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
        }
      } else {
        setUser(null)
      }
    })

    return () => unsubscribe()
  }, [setUser, setLoading])

  return (
    <HelpProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Toaster />
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
            <Route path="equipment" element={<EquipmentPage />} />
            <Route path="repuestos" element={<RepuestosDashboard />} />
            <Route path="repuestos/bases" element={<CatalogoBases />} />
            <Route path="predictive" element={<PredictivePage />} />
            <Route path="sensors" element={
              <Suspense fallback={<LoadingScreen />}>
                <SensorsPage />
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
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </HelpProvider>
  )
}
