/**
 * Visor3DPublicPage - Vista pública aislada para acceso directo por QR
 *
 * - Sin sidebar ni navegación a otras partes de la app
 * - Requiere autenticación (redirige a login con redirect)
 * - Solo muestra el visor 3D del modelo específico
 * - Controles mínimos: orbit, zoom, fullscreen, cotas (solo ver)
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Maximize,
  Minimize,
  RotateCcw,
  Ruler,
  AlertCircle,
  Box,
  Loader2,
  LogOut,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Badge,
} from '@/components/ui'
import { useAuthStore } from '@/store'
import { getModel3DById } from '@/services/models3d'
import { subscribeToDimensions } from '@/services/dimensions'
import { subscribeToMaterialOverrides } from '@/services/materials3d'
import { signOut } from '@/services/auth'
import { Viewer3D } from '@/components/visor3d/Viewer3D'
import { DimensionsTool } from '@/components/visor3d/DimensionsTool'
import type { Model3D, MaterialOverride, Dimension3D } from '@/types/models3d'

export function Visor3DPublicPage() {
  const { modelId } = useParams<{ modelId: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore()

  const [model, setModel] = useState<Model3D | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<Dimension3D[]>([])
  const [showDimensions, setShowDimensions] = useState(true)
  const [materialOverrides, setMaterialOverrides] = useState<MaterialOverride[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate(`/login?redirect=/v/${modelId}`, { replace: true })
    }
  }, [authLoading, isAuthenticated, modelId, navigate])

  // Cargar modelo
  useEffect(() => {
    if (!modelId || !isAuthenticated) return
    setLoading(true)
    setError(null)
    getModel3DById(modelId)
      .then((m) => {
        if (!m) setError('Modelo no encontrado')
        else setModel(m)
      })
      .catch((err) => setError(`Error: ${(err as Error).message}`))
      .finally(() => setLoading(false))
  }, [modelId, isAuthenticated])

  // Suscribirse a cotas
  useEffect(() => {
    if (!modelId || !isAuthenticated) return
    const unsub = subscribeToDimensions(modelId, setDimensions)
    return () => unsub()
  }, [modelId, isAuthenticated])

  // Suscribirse a material overrides
  useEffect(() => {
    if (!modelId || !isAuthenticated) return
    const unsub = subscribeToMaterialOverrides(modelId, setMaterialOverrides)
    return () => unsub()
  }, [modelId, isAuthenticated])

  // Fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Logout
  const handleLogout = useCallback(async () => {
    await signOut()
    navigate(`/login?redirect=/v/${modelId}`, { replace: true })
  }, [modelId, navigate])

  // Still loading auth
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Not authenticated (redirect already triggered)
  if (!isAuthenticated) return null

  // Loading model
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando modelo 3D...</p>
        </div>
      </div>
    )
  }

  // Error
  if (error || !model) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-lg font-medium">Error</h2>
            <p className="text-sm text-muted-foreground text-center">
              {error || 'Modelo no encontrado'}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="h-screen w-screen flex flex-col bg-background overflow-hidden"
    >
      {/* Minimal header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-card shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-sm font-bold truncate">{model.name}</h1>
          <Badge variant="outline" className="text-[10px] uppercase shrink-0">
            {model.format}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant={showDimensions ? 'default' : 'outline'}
            size="sm"
            className="gap-1 h-7 text-xs"
            onClick={() => setShowDimensions(!showDimensions)}
          >
            <Ruler className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cotas ({dimensions.length})</span>
            <span className="sm:hidden">{dimensions.length}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setResetKey((k) => k + 1)}
            title="Reset vista"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground"
            onClick={handleLogout}
            title="Cerrar sesión"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 relative">
        <Viewer3D
          url={model.downloadURL}
          format={model.format}
          resetKey={resetKey}
          materialOverrides={materialOverrides}
        >
          {showDimensions && <DimensionsTool dimensions={dimensions} />}
        </Viewer3D>
      </div>
    </div>
  )
}
