import { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useSearchParams } from 'react-router-dom'
import { onAuthChange, getUserById, signOut as signOutService } from '@/services/auth'
import { useAuthStore, usePermissionsStore, startSessionWatchdog } from '@/store'
import { logger } from '@/lib/logger'
import { LoadingScreen } from '@/components/ui'
import { MainLayout } from '@/components/layout'
import { RequireReAuth } from '@/components/auth/RequireReAuth'
import { HelpProvider } from '@/components/help'
import { initializeHierarchySystem, isHierarchyInitialized } from '@/services/hierarchyInit'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { isChunkLoadError, recoverFromChunkError } from '@/utils/chunkRecovery'

// Helper para recargar chunks automáticamente en caso de error de versión (deploy nuevo).
// La estrategia escalonada (reload → limpiar caches + cache-buster) y el contador
// anti-bucle viven en @/utils/chunkRecovery, compartidos con el ErrorBoundary.
const lazyWithReload = (fn: () => Promise<any>) =>
  lazy(() =>
    fn().catch((error) => {
      if (isChunkLoadError(error) && recoverFromChunkError()) {
        return new Promise(() => {}) // Promesa perpetua mientras recarga
      }
      throw error
    })
  )

// Code Splitting con autorecarga (todas las páginas, incluida Login: es la
// primera que pide un usuario deslogueado justo después de un deploy)
const LoginPage = lazyWithReload(() => import('@/pages/LoginPage').then((mod) => ({ default: mod.LoginPage })))
/** Banco de pruebas de la Matriz de turnos — solo montado en dev (ver Routes). */
const MatrizTurnosDevPage = lazyWithReload(() => import('@/pages/dev/MatrizTurnosDevPage'))
/** Banco de pruebas del resumen ejecutivo — solo montado en dev (ver Routes). */
const ResumenTurnoDevPage = lazyWithReload(() => import('@/pages/dev/ResumenTurnoDevPage'))
const ResumenPeriodoDevPage = lazyWithReload(() => import('@/pages/dev/ResumenPeriodoDevPage'))
const DashboardPage = lazyWithReload(() => import('@/pages/DashboardPage').then((mod) => ({ default: mod.DashboardPage })))
import { HomeRedirect } from '@/components/HomeRedirect'
const IncidentsPage = lazyWithReload(() => import('@/pages/IncidentsPage').then((mod) => ({ default: mod.IncidentsPage })))
const EquipmentPage = lazyWithReload(() => import('@/pages/EquipmentPage').then((mod) => ({ default: mod.EquipmentPage })))
const CentroTecnicoDocumentalPage = lazyWithReload(() => import('@/pages/CentroTecnicoDocumentalPage').then((mod) => ({ default: mod.CentroTecnicoDocumentalPage })))
const PredictivePage = lazyWithReload(() => import('@/pages/PredictivePage').then((mod) => ({ default: mod.PredictivePage })))
const RepuestosPage = lazyWithReload(() => import('@/pages/repuestos/RepuestosPage').then((mod) => ({ default: mod.RepuestosPage })))
const MapPage = lazyWithReload(() =>
  import('@/pages/MapPage').then((mod: any) => ({ default: mod?.MapPage ?? mod?.default }))
)
const MapaPlantaPage = lazyWithReload(() =>
  import('@/pages/MapaPlantaPage').then((mod) => ({ default: mod.MapaPlantaPage }))
)
const MapViewPage = lazyWithReload(() =>
  import('@/pages/MapViewPage').then((mod: any) => ({ default: mod?.MapViewPage ?? mod?.default }))
)
const PreventivePage = lazyWithReload(() => import('@/pages/PreventivePage').then((mod) => ({ default: mod.PreventivePage })))
const SettingsPage = lazyWithReload(() => import('@/pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage })))
const HierarchyPage = lazyWithReload(() => import('@/pages/HierarchyPage').then((mod) => ({ default: mod.HierarchyPage })))
const PhotoEvidencePage = lazyWithReload(() => import('@/pages/PhotoEvidencePage').then((mod) => ({ default: mod.PhotoEvidencePage })))
const PublicEquipmentView = lazyWithReload(() => import('@/pages/PublicEquipmentView').then((mod) => ({ default: mod.PublicEquipmentView })))
const GraderPublicTokenPage = lazyWithReload(() => import('@/pages/GraderPublicTokenPage').then((mod) => ({ default: mod.GraderPublicTokenPage })))
const SensorsPage = lazyWithReload(() => import('@/pages/SensorsPage').then((mod) => ({ default: mod.SensorsPage })))
const SensorsMonitorPage = lazyWithReload(() => import('@/pages/SensorsMonitorPage').then((mod) => ({ default: mod.SensorsMonitorPage })))
const MapsAdminPage = lazyWithReload(() => import('@/pages/admin/MapsAdminPage').then((mod) => ({ default: mod.MapsAdminPage })))
const SidebarEditorPage = lazyWithReload(() => import('@/pages/SidebarEditorPage').then((mod) => ({ default: mod.SidebarEditorPage })))
const DevModulesPage = lazyWithReload(() => import('@/pages/admin/DevModulesPage').then((mod) => ({ default: mod.DevModulesPage })))
const DefaultRoutePage = lazyWithReload(() => import('@/pages/admin/DefaultRoutePage').then((mod) => ({ default: mod.DefaultRoutePage })))
const InspectionsPage = lazyWithReload(() => import('@/pages/InspectionsPage').then((mod) => ({ default: mod.InspectionsPage })))
const ETTPage = lazyWithReload(() => import('@/pages/admin/ETTPage').then((mod) => ({ default: mod.ETTPage })))
const PermissionsPage = lazyWithReload(() => import('@/pages/admin/PermissionsPage').then((mod) => ({ default: mod.PermissionsPage })))
const ShoplogixCredentialsPage = lazyWithReload(() => import('@/pages/admin/ShoplogixCredentialsPage').then((mod) => ({ default: mod.ShoplogixCredentialsPage })))
const AdminPanelPage = lazyWithReload(() => import('@/pages/admin/AdminPanelPage').then((mod) => ({ default: mod.AdminPanelPage })))
const MachineCapacityPage = lazyWithReload(() => import('@/pages/admin/MachineCapacityPage').then((mod) => ({ default: mod.MachineCapacityPage })))
const ShoplogixNotificationsConfigPage = lazyWithReload(() => import('@/pages/admin/ShoplogixNotificationsConfigPage').then((mod) => ({ default: mod.ShoplogixNotificationsConfigPage })))
const TelegramSyncPage = lazyWithReload(() => import('@/pages/admin/TelegramSyncPage').then((mod) => ({ default: mod.TelegramSyncPage })))
const PowerBIExportPage = lazyWithReload(() => import('@/pages/admin/PowerBIExportPage').then((mod) => ({ default: mod.PowerBIExportPage })))
const Visor3DListPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DListPage').then((mod) => ({ default: mod.Visor3DListPage })))
const Visor3DViewerPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DViewerPage').then((mod) => ({ default: mod.Visor3DViewerPage })))
const Visor3DPublicPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DPublicPage').then((mod) => ({ default: mod.Visor3DPublicPage })))
const CatalogoPublicPage = lazyWithReload(() => import('@/pages/CatalogoPublicPage').then((mod) => ({ default: mod.CatalogoPublicPage })))
const HmiKnuroPublicPage = lazyWithReload(() => import('@/pages/HmiKnuroPublicPage').then((mod) => ({ default: mod.HmiKnuroPublicPage })))
const HmiBombeoS2PublicPage = lazyWithReload(() => import('@/pages/HmiBombeoS2PublicPage').then((mod) => ({ default: mod.HmiBombeoS2PublicPage })))
const Visor3DInteractiveToboganPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DInteractiveToboganPage').then((mod) => ({ default: mod.Visor3DInteractiveToboganPage })))
// Vitrina de la NUEVA PIEL (docs/NUEVA_PIEL_APPLE_HIG.md). Página de desarrollo:
// sin datos, sin sidebar y fuera del menú — existe para ver los primitivos con
// contenido real y comparar piel/tema durante la migración.
const PielShowcasePage = lazyWithReload(() => import('@/pages/dev/PielShowcasePage'))
// Pantalla PILOTO: Análisis de Turno con la piel nueva y datos reales. Convive
// con AnalisisGraderTurnoPage (producción, intacta) para poder compararlas.
const TurnoPilotoPage = lazyWithReload(() => import('@/pages/dev/TurnoPilotoPage'))
// Vitrina del módulo Grader ya barrido: monta componentes REALES del módulo con
// datos sintéticos, para poder mirarlo sin sesión ni datos de planta.
const GraderPielPage = lazyWithReload(() => import('@/pages/dev/GraderPielPage'))
// Vitrina de la pantalla REAL de Incidencias ya rediseñada (componente de
// producción, store sembrado con datos sintéticos).
const IncidenciasPielPage = lazyWithReload(() => import('@/pages/dev/IncidenciasPielPage'))
const Visor3DInteractiveBaader142Page = lazyWithReload(() => import('@/pages/Visor3D/Visor3DInteractiveBaader142Page').then((mod) => ({ default: mod.Visor3DInteractiveBaader142Page })))
const Visor3DInteractivePlataformaPontonPage = lazyWithReload(() => import('@/pages/Visor3D/Visor3DInteractivePlataformaPontonPage').then((mod) => ({ default: mod.Visor3DInteractivePlataformaPontonPage })))
const AnalisisGraderTurnoPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderTurnoPage').then((mod) => ({ default: mod.AnalisisGraderTurnoPage })))
const GraderQuickChangePage = lazyWithReload(() => import('@/pages/AnalisisGrader/GraderQuickChangePage').then((mod) => ({ default: mod.GraderQuickChangePage })))
const AnalisisGraderWizardPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderWizardPage').then((mod) => ({ default: mod.AnalisisGraderWizardPage })))
const AnalisisGraderPeriodoPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderPeriodoPage').then((mod) => ({ default: mod.AnalisisGraderPeriodoPage })))
const AnalisisGraderConfigPage = lazyWithReload(() => import('@/pages/AnalisisGrader/AnalisisGraderConfigPage').then((mod) => ({ default: mod.AnalisisGraderConfigPage })))

// Redirect legacy `/analisis-grader/detalle?date=X&shift=Y` → `/analisis-grader/turno/:id`
// Conservado para no romper links externos existentes tras la eliminación de DetallePage (2.118.0).
function AnalisisGraderDetalleRedirect() {
  const [searchParams] = useSearchParams()
  const dateKey = searchParams.get('date')
  const shiftId = searchParams.get('shift')
  if (dateKey && shiftId) {
    return <Navigate to={`/analisis-grader/turno/${dateKey}__${encodeURIComponent(shiftId)}`} replace />
  }
  return <Navigate to="/analisis-grader" replace />
}
const GanttModulePage = lazyWithReload(() => import('@/pages/gantt/GanttModulePage').then((mod) => ({ default: mod.GanttModulePage })))
const AriaActionsPage = lazyWithReload(() => import('@/pages/AriaActionsPage').then((mod) => ({ default: mod.AriaActionsPage })))
const ClimaPortPage = lazyWithReload(() => import('@/pages/ClimaPortPage').then((mod) => ({ default: mod.ClimaPortPage })))
const PlanosAguasPage = lazyWithReload(() => import('@/pages/PlanosAguasPage').then((mod) => ({ default: mod.PlanosAguasPage })))
const CalendarioMantencionPage = lazyWithReload(() => import('@/pages/CalendarioMantencionPage').then((mod) => ({ default: mod.CalendarioMantencionPage })))
const HmiKnuroPage = lazyWithReload(() => import('@/pages/HmiKnuroPage').then((mod) => ({ default: mod.HmiKnuroPage })))
const HmiGraderPage = lazyWithReload(() => import('@/pages/HmiGraderPage').then((mod) => ({ default: mod.HmiGraderPage })))
const Baader200LearningPublicPage = lazyWithReload(() => import('@/pages/Baader200LearningPublicPage').then((mod) => ({ default: mod.Baader200LearningPublicPage })))
const Baader200LearningPage = lazyWithReload(() => import('@/pages/Baader200LearningPage').then((mod) => ({ default: mod.Baader200LearningPage })))
const LearningHubPage = lazyWithReload(() => import('@/pages/LearningHubPage').then((mod) => ({ default: mod.LearningHubPage })))
const PlanosElectricosPage = lazyWithReload(() => import('@/pages/PlanosElectricosPage').then((mod) => ({ default: mod.PlanosElectricosPage })))
const VariadoresPage = lazyWithReload(() => import('@/pages/VariadoresPage').then((mod) => ({ default: mod.VariadoresPage })))
const Perilla5Page = lazyWithReload(() => import('@/pages/Perilla5Page').then((mod) => ({ default: mod.Perilla5Page })))
const MachineLearningPage = lazyWithReload(() => import('@/pages/MachineLearningPage').then((mod) => ({ default: mod.MachineLearningPage })))
const LearningAdminPage = lazyWithReload(() => import('@/pages/LearningAdminPage').then((mod) => ({ default: mod.LearningAdminPage })))
const LearningAdminMachinePage = lazyWithReload(() => import('@/pages/LearningAdminMachinePage').then((mod) => ({ default: mod.LearningAdminMachinePage })))

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

/**
 * Layout adaptativo: renderiza MainLayout (con sidebar) si el usuario esta
 * autenticado, o un Outlet directo si no lo esta. Permite que una misma ruta
 * publica muestre el sidebar cuando el tecnico esta logueado.
 */
function PublicOrPrivateLayout() {
  const { isAuthenticated, isLoading } = useAuthStore()
  if (isLoading) return <LoadingScreen />
  if (isAuthenticated) return <MainLayout />
  return <Outlet />
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore()
  const [searchParams] = useSearchParams()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isAuthenticated) {
    // Si hay un redirect query param (ej. desde QR), ir ahí en vez de /
    // Solo permitir rutas internas (empiezan con /) y no URLs externas
    const raw = searchParams.get('redirect') || '/'
    const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
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

  // Watchdog de sesión: expira por inactividad real con la pestaña abierta
  // (antes solo se chequeaba al recargar) y refresca lastActivity con la
  // interacción del usuario. Ver startSessionWatchdog en authStore.
  useEffect(() => startSessionWatchdog(), [])

  return (
    <HelpProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Toaster />
          <ErrorBoundary>
            <Suspense fallback={<LoadingScreen />}>
            <Routes>
              {/* Banco de pruebas de la Matriz de turnos — SOLO en dev.
                  Vite elimina la rama entera del bundle de producción. */}
              {import.meta.env.DEV && (
                <Route
                  path="/dev/resumen-turno"
                  element={
                    <Suspense fallback={<LoadingScreen />}>
                      <ResumenTurnoDevPage />
                    </Suspense>
                  }
                />
              )}
              {import.meta.env.DEV && (
                <Route
                  path="/dev/resumen-periodo"
                  element={
                    <Suspense fallback={<LoadingScreen />}>
                      <ResumenPeriodoDevPage />
                    </Suspense>
                  }
                />
              )}
              {import.meta.env.DEV && (
                <Route
                  path="/dev/matriz-turnos"
                  element={
                    <Suspense fallback={<LoadingScreen />}>
                      <MatrizTurnosDevPage />
                    </Suspense>
                  }
                />
              )}
              {/* Public routes */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* Vitrina de la nueva piel — solo desarrollo, no enlazada en el menú */}
          <Route
            path="/dev/piel"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <PielShowcasePage />
              </Suspense>
            }
          />

          <Route
            path="/dev/turno-piloto"
            // Sin PrivateRoute a propósito: quien no tenga sesión ve el estado
            // vacío (Firestore es quien protege los datos, con sus reglas — el
            // guard de ruta era solo UX). Así el piloto se puede revisar con
            // ?fixture=1 sin credenciales, que es lo que bloqueó dos veces la
            // verificación visual de la piel.
            element={
                <Suspense fallback={<LoadingScreen />}>
                  <TurnoPilotoPage />
                </Suspense>
            }
          />

          <Route
            path="/dev/incidencias-piel"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <IncidenciasPielPage />
              </Suspense>
            }
          />

          <Route
            path="/dev/grader-piel"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <GraderPielPage />
              </Suspense>
            }
          />

          {/* Public 3D viewer (requires auth but no sidebar) */}
          <Route
            path="/v/interactive/tobogan"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DInteractiveToboganPage />
              </Suspense>
            }
          />
          <Route
            path="/v/interactive/baader-142"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DInteractiveBaader142Page />
              </Suspense>
            }
          />
          <Route
            path="/v/interactive/plataforma-ponton"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DInteractivePlataformaPontonPage />
              </Suspense>
            }
          />
          <Route
            path="/v/:modelId"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DPublicPage />
              </Suspense>
            }
          />

          {/* Buscador público de códigos de fabricante (link/QR para bodega) */}
          <Route
            path="/catalogo"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <CatalogoPublicPage />
              </Suspense>
            }
          />

          {/* Public HMI learning mode (no auth required) */}
          <Route
            path="/hmi/learn/:presetId"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <HmiKnuroPublicPage />
              </Suspense>
            }
          />
          <Route
            path="/hmi/learn"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <HmiKnuroPublicPage />
              </Suspense>
            }
          />

          {/* Learning Hub — Centro de Aprendizaje (publico, con sidebar si el usuario esta autenticado) */}
          <Route element={<PublicOrPrivateLayout />}>
            <Route
              path="/aprendizaje"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <LearningHubPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/maquina/:slug"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <MachineLearningPage />
                </Suspense>
              }
            />
            {/* La vista inmersiva del Baader 200 (iframe con tema propio) se unificó
                en la ficha estándar para no tener 2 formatos distintos en el Centro.
                El share standalone por QR (/baader-200/learn) se conserva aparte. */}
            <Route path="/aprendizaje/baader-200/:sectionId" element={<Navigate to="/aprendizaje/maquina/baader-200" replace />} />
            <Route path="/aprendizaje/baader-200" element={<Navigate to="/aprendizaje/maquina/baader-200" replace />} />
            <Route
              path="/aprendizaje/hmi-knuro/:presetId"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <HmiKnuroPublicPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/hmi-knuro"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <HmiKnuroPublicPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/hmi-grader"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <HmiGraderPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/hmi-bombeo-s2"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <HmiBombeoS2PublicPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/planos"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <PlanosElectricosPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/planos/:slug"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <PlanosElectricosPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/variadores"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <VariadoresPage />
                </Suspense>
              }
            />
            <Route
              path="/aprendizaje/perilla-5"
              element={
                <Suspense fallback={<LoadingScreen />}>
                  <Perilla5Page />
                </Suspense>
              }
            />
          </Route>

          {/* Legacy redirects — keep old URLs working */}
          {/* El Grader paso a usar el expediente generico de maquina. Ambos redirects
              viven fuera del bloque protegido: el destino es publico, igual que el
              resto del Centro de Aprendizaje. */}
          <Route path="/aprendizaje/grader-manual" element={<Navigate to="/aprendizaje/maquina/grader" replace />} />
          <Route path="/analisis-grader/ayuda" element={<Navigate to="/aprendizaje/maquina/grader" replace />} />
          <Route path="/baader-200/learn/:sectionId" element={
            <Suspense fallback={<LoadingScreen />}><Baader200LearningPublicPage /></Suspense>
          } />
          <Route path="/baader-200/learn" element={
            <Suspense fallback={<LoadingScreen />}><Baader200LearningPublicPage /></Suspense>
          } />

          {/* Public grader shift view — token-based, no auth required */}
          <Route
            path="/view/:token"
            element={
              <Suspense fallback={<LoadingScreen />}>
                <GraderPublicTokenPage />
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
            <Route index element={<HomeRedirect />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="incidents" element={<IncidentsPage />} />
            {/* Visor Planta 3D — reemplaza al editor de terreno como vista principal */}
            <Route path="map" element={
              <Suspense fallback={<LoadingScreen />}>
                <MapaPlantaPage />
              </Suspense>
            } />
            {/* Redirigir la ruta antigua /map/planta al nuevo /map */}
            <Route path="map/planta" element={<Navigate to="/map" replace />} />
            <Route path="map/view" element={
              <Suspense fallback={<LoadingScreen />}>
                <MapViewPage />
              </Suspense>
            } />
            <Route path="inspections" element={
              <Suspense fallback={<LoadingScreen />}>
                <InspectionsPage />
              </Suspense>
            } />
            <Route path="equipment" element={<EquipmentPage />} />
            <Route path="centro-tecnico-documental" element={
              <Suspense fallback={<LoadingScreen />}>
                <CentroTecnicoDocumentalPage />
              </Suspense>
            } />
            <Route path="repuestos" element={<RepuestosPage />} />
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
            {/* Hub admin — el único punto de entrada visible. Todas las sub-rutas
                están envueltas en RequireReAuth para pedir credenciales aún con
                sesión activa, evitando cambios accidentales. */}
            <Route path="admin" element={
              <AdminRoute>
                <RequireReAuth reason="para acceder al panel de administración">
                  <Suspense fallback={<LoadingScreen />}>
                    <AdminPanelPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="admin/maps" element={
              <AdminRoute>
                <RequireReAuth reason="antes de modificar mapas y planos">
                  <Suspense fallback={<LoadingScreen />}>
                    <MapsAdminPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            {/* Editor de terreno DEM — solo admins */}
            <Route path="admin/mapa-terreno" element={
              <AdminRoute>
                <RequireReAuth reason="antes de modificar el modelo de terreno">
                  <Suspense fallback={<LoadingScreen />}>
                    <MapPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="admin/permissions" element={
              <AdminRoute>
                <RequireReAuth reason="antes de modificar permisos de usuarios">
                  <Suspense fallback={<LoadingScreen />}>
                    <PermissionsPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="admin/shoplogix-credentials" element={
              <AdminRoute>
                <RequireReAuth reason="antes de gestionar credenciales Shoplogix">
                  <Suspense fallback={<LoadingScreen />}>
                    <ShoplogixCredentialsPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="admin/ett" element={
              <AdminRoute>
                <RequireReAuth reason="antes de modificar configuración ETT">
                  <Suspense fallback={<LoadingScreen />}>
                    <ETTPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="admin/sidebar" element={
              <AdminRoute>
                <RequireReAuth reason="antes de modificar el sidebar">
                  <Suspense fallback={<LoadingScreen />}>
                    <SidebarEditorPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="admin/dev-modules" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <DevModulesPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="admin/default-route" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <DefaultRoutePage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="admin/sync-telegram" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <TelegramSyncPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="admin/powerbi-export" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <PowerBIExportPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="admin/machine-capacity" element={
              <AdminRoute>
                <RequireReAuth reason="antes de configurar la velocidad nameplate de las Baaders">
                  <Suspense fallback={<LoadingScreen />}>
                    <MachineCapacityPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="admin/notifications-shoplogix" element={
              <AdminRoute>
                <RequireReAuth reason="antes de configurar notificaciones Shoplogix">
                  <Suspense fallback={<LoadingScreen />}>
                    <ShoplogixNotificationsConfigPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="aprendizaje/admin" element={
              <AdminRoute>
                <RequireReAuth reason="para administrar el Centro de Aprendizaje">
                  <Suspense fallback={<LoadingScreen />}>
                    <LearningAdminPage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="aprendizaje/admin/:slug" element={
              <AdminRoute>
                <RequireReAuth reason="para administrar el Centro de Aprendizaje">
                  <Suspense fallback={<LoadingScreen />}>
                    <LearningAdminMachinePage />
                  </Suspense>
                </RequireReAuth>
              </AdminRoute>
            } />
            <Route path="visor-3d" element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DListPage />
              </Suspense>
            } />
            <Route path="visor-3d/interactividad/tobogan" element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DInteractiveToboganPage />
              </Suspense>
            } />
            <Route path="visor-3d/interactividad/sopladoras-baader-142" element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DInteractiveBaader142Page />
              </Suspense>
            } />
            <Route path="visor-3d/interactividad/plataforma-ponton" element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DInteractivePlataformaPontonPage />
              </Suspense>
            } />
            <Route path="visor-3d/:modelId" element={
              <Suspense fallback={<LoadingScreen />}>
                <Visor3DViewerPage />
              </Suspense>
            } />
            {/* Home del módulo = Wizard (upload + calendar + KPIs + config). */}
            <Route path="analisis-grader" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderWizardPage />
              </Suspense>
            } />
            {/* Alias legacy: /wizard también lleva al home */}
            <Route path="analisis-grader/wizard" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderWizardPage />
              </Suspense>
            } />
            <Route path="analisis-grader/turno/:shiftId" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderTurnoPage />
              </Suspense>
            } />
            {/* Config GLOBAL del Grader (línea física, umbrales, rangos):
                aplica a todos los turnos → ruta propia, solo admin. */}
            <Route path="analisis-grader/config" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderConfigPage />
              </Suspense>
            } />
            <Route path="analisis-grader/quick-change" element={
              <Suspense fallback={<LoadingScreen />}>
                <GraderQuickChangePage />
              </Suspense>
            } />
            <Route path="analisis-grader/detalle" element={<AnalisisGraderDetalleRedirect />} />
            <Route path="analisis-grader/periodo" element={
              <Suspense fallback={<LoadingScreen />}>
                <AnalisisGraderPeriodoPage />
              </Suspense>
            } />
            <Route path="gantt" element={
              <Suspense fallback={<LoadingScreen />}>
                <GanttModulePage />
              </Suspense>
            } />
            <Route path="calendario-mantencion" element={
              <Suspense fallback={<LoadingScreen />}>
                <CalendarioMantencionPage />
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
            <Route path="planos-aguas" element={
              <Suspense fallback={<LoadingScreen />}>
                <PlanosAguasPage />
              </Suspense>
            } />
            <Route path="hmi-knuro" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <HmiKnuroPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="hmi-grader" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <HmiGraderPage />
                </Suspense>
              </AdminRoute>
            } />
            <Route path="baader-200" element={
              <AdminRoute>
                <Suspense fallback={<LoadingScreen />}>
                  <Baader200LearningPage />
                </Suspense>
              </AdminRoute>
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
  )
}
