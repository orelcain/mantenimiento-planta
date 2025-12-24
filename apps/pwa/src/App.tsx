import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { onAuthChange, getUserById } from '@/services/auth'
import { useAuthStore } from '@/store'
import { LoadingScreen } from '@/components/ui'
import { MainLayout } from '@/components/layout'
import {
  LoginPage,
  DashboardPage,
  IncidentsPage,
  MapPage,
  EquipmentPage,
  SettingsPage,
  PreventivePage,
} from '@/pages'

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
        } catch (error) {
          console.error('Error fetching user:', error)
          setUser(null)
        }
      } else {
        setUser(null)
      }
    })

    return () => unsubscribe()
  }, [setUser, setLoading])

  // Get base path from Vite config
  const basename = import.meta.env.BASE_URL

  return (
    <BrowserRouter basename={basename}>
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
          <Route path="map" element={<MapPage />} />
          <Route path="equipment" element={<EquipmentPage />} />
          <Route path="preventive" element={<PreventivePage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
