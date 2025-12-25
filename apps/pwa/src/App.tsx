import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { onAuthChange, getUserById } from '@/services/auth'
import { useAuthStore } from '@/store'
import { logger } from '@/lib/logger'
import { LoadingScreen } from '@/components/ui'
import { MainLayout } from '@/components/layout'
import { HelpProvider } from '@/components/help'
import {
  LoginPage,
  DashboardPage,
  IncidentsPage,
  EquipmentPage,
} from '@/pages'

// Code Splitting: Lazy load para páginas pesadas o menos usadas
const MapPage = lazy(() => import('@/pages/MapPage').then((mod) => ({ default: mod.MapPage })))
const PreventivePage = lazy(() => import('@/pages/PreventivePage').then((mod) => ({ default: mod.PreventivePage })))
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage })))

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

export function App() {
  const { setUser, setLoading } = useAuthStore()

  // Escuchar cambios en la autenticación
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const user = await getUserById(firebaseUser.uid)
          setUser(user)
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
      <BrowserRouter basename="/mantenimiento-planta">
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
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </HelpProvider>
  )
}
