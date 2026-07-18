/**
 * Visor3DListPage - Página de listado de modelos 3D
 * 
 * - Muestra todos los modelos 3D subidos
 * - Admin: puede subir nuevos modelos, eliminar existentes
 * - Todos: pueden abrir, copiar link, ver QR
 */

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Upload,
  Search,
  Trash2,
  ExternalLink,
  Copy,
  QrCode,
  FileBox,
  AlertCircle,
  X,
  Check,
  Waves,
  Sparkles,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Button,
  Input,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui'
import { useIsAdmin, useAuthStore } from '@/store'
import { subscribeToModels3D, deleteModel3D } from '@/services/models3d'
import { useModels3DStore } from '@/store/models3dStore'
import { formatDate } from '@/lib/utils'
import { ModelUploader } from '@/components/visor3d/ModelUploader'
import { STANDALONE_INTERACTIVE_EXPERIENCES, getModelsWithInteractiveExperience } from '@/components/visor3d/interactive/experienceRegistry'
import type { Model3D } from '@/types/models3d'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Visor3DListPage() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const user = useAuthStore((s) => s.user)
  const { models, isLoading, error, searchQuery, setModels, setError, setSearchQuery } =
    useModels3DStore()

  const [showUpload, setShowUpload] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [qrModel, setQrModel] = useState<Model3D | null>(null)
  const [copied, setCopied] = useState(false)

  // Suscripción en tiempo real
  useEffect(() => {
    const unsub = subscribeToModels3D(
      (list) => setModels(list),
      (err) => setError(`Error de permisos: ${err.message}. Verifique que las reglas de Firestore estén desplegadas.`)
    )
    return () => unsub()
  }, [setModels, setError])

  // Filtrar por búsqueda
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models
    const q = searchQuery.toLowerCase()
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.originalFileName.toLowerCase().includes(q) ||
        m.format.toLowerCase().includes(q)
    )
  }, [models, searchQuery])

  // Eliminar modelo
  const handleDelete = useCallback(async (model: Model3D) => {
    if (!confirm(`¿Eliminar el modelo "${model.name}"? Esta acción es irreversible.`)) return
    setDeleting(model.id)
    try {
      await deleteModel3D(model.id)
    } catch (err) {
      setError(`Error al eliminar: ${(err as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }, [setError])

  // Copiar link
  const handleCopyLink = useCallback(async (modelId: string) => {
    const url = `${window.location.origin}/mantenimiento-planta/visor-3d/${modelId}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [])

  // Generar URL del modelo
  const getModelUrl = (modelId: string) =>
    `${window.location.origin}/mantenimiento-planta/v/${modelId}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Box className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Visor 3D</h1>
            <p className="text-sm text-muted-foreground">
              Modelos tridimensionales de equipos y componentes
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowUpload(true)} className="gap-2">
            <Upload className="h-4 w-4" />
            Subir modelo
          </Button>
        )}
      </div>

      {/* Upload dialog (admin) */}
      {isAdmin && (
        <Dialog open={showUpload} onOpenChange={setShowUpload}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Subir modelo 3D</DialogTitle>
            </DialogHeader>
            <ModelUploader
              userId={user?.id || ''}
              onSuccess={() => setShowUpload(false)}
              onCancel={() => setShowUpload(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* QR Dialog */}
      <Dialog open={!!qrModel} onOpenChange={() => setQrModel(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">{qrModel?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG
                value={qrModel ? getModelUrl(qrModel.id) : ''}
                size={200}
                level="M"
                includeMargin
              />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all px-4">
              {qrModel ? getModelUrl(qrModel.id) : ''}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => qrModel && handleCopyLink(qrModel.id)}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copiado' : 'Copiar link'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="models" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <TabsList className="h-auto bg-muted/70">
            <TabsTrigger value="models">Modelos 3D</TabsTrigger>
            <TabsTrigger value="interactive">Interactividad</TabsTrigger>
          </TabsList>
          <p className="hidden text-sm text-muted-foreground md:block">
            El inventario de modelos y las experiencias interactivas ahora viven separados en el modulo base.
          </p>
        </div>

        <TabsContent value="models" className="space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar modelos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader className="pb-3">
                    <div className="h-5 bg-muted rounded w-2/3" />
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-4 bg-muted rounded w-1/2" />
                      <div className="h-4 bg-muted rounded w-1/3" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredModels.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileBox className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium mb-1">
                  {searchQuery ? 'Sin resultados' : 'No hay modelos 3D'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery
                    ? `No se encontraron modelos para "${searchQuery}"`
                    : 'Sube el primer modelo 3D para comenzar'}
                </p>
                {isAdmin && !searchQuery && (
                  <Button onClick={() => setShowUpload(true)} className="gap-2">
                    <Upload className="h-4 w-4" />
                    Subir modelo
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Models grid */}
          {!isLoading && filteredModels.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredModels.map((model) => (
                <Card
                  key={model.id}
                  className="group hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/visor-3d/${model.id}`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base line-clamp-1 flex items-center gap-2">
                        <Box className="h-4 w-4 text-primary flex-shrink-0" />
                        {model.name}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        {getModelsWithInteractiveExperience([model]).length > 0 && (
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            Interactivo
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs uppercase flex-shrink-0">
                          {model.format}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{model.originalFileName}</span>
                        <span>{formatFileSize(model.sizeBytes)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(model.createdAt)}
                      </div>

                      <div
                        className="flex items-center gap-1 pt-2 border-t"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => navigate(`/visor-3d/${model.id}`)}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Abrir
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => handleCopyLink(model.id)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Link
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1.5 text-xs"
                          onClick={() => setQrModel(model)}
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          QR
                        </Button>
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-destructive hover:text-destructive ml-auto"
                            disabled={deleting === model.id}
                            onClick={() => handleDelete(model)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {deleting === model.id ? '...' : 'Eliminar'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="interactive" className="space-y-6">
          <Card className="border-primary/25 bg-gradient-to-br from-primary/10 via-background to-background">
            <CardContent className="flex flex-col gap-2 py-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Catalogo de interactividad</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Aqui viven todas las experiencias interactivas del modulo. Algunas son independientes del inventario 3D y otras se conectan a modelos especificos.
              </p>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Waves className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Experiencias base</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {STANDALONE_INTERACTIVE_EXPERIENCES.map((experience) => (
                <Card key={experience.id} className="border-primary/20">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-base">{experience.label}</CardTitle>
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {experience.sourceLabel}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">{experience.description}</p>
                    {experience.id === 'sopladorasBaader142' && (
                      <div className="grid gap-2 text-xs text-muted-foreground">
                        <div className="rounded-lg border bg-muted px-3 py-2">
                          Define el estado operativo de cada sopladora.
                        </div>
                        <div className="rounded-lg border bg-muted px-3 py-2">
                          Cambia el contexto entre produccion, lavado y mantencion.
                        </div>
                        <div className="rounded-lg border bg-muted px-3 py-2">
                          Prepara la logica que despues se conectara a hotspots y puntos criticos del modelo.
                        </div>
                      </div>
                    )}
                    <Button className="gap-2" onClick={() => navigate(experience.route)}>
                      <ExternalLink className="h-4 w-4" />
                      {experience.id === 'sopladorasBaader142' ? 'Abrir base operativa' : 'Abrir interactividad'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* SketchUp note */}
      <Card className="border-blue-500/30 bg-blue-500/15">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <FileBox className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-400">
                Nota sobre archivos SketchUp (.skp)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Los archivos .skp no pueden cargarse directamente en el navegador. Exporte su modelo
                desde SketchUp a formato <strong>.glb</strong> o <strong>.gltf</strong> antes de
                subirlo. <br />
                En SketchUp: <em>Archivo → Exportar → Modelo 3D → Formato: glTF (*.gltf / *.glb)</em>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
