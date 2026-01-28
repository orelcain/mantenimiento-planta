/**
 * Página de Administración de Mapas
 * Solo accesible para administradores
 * 
 * Permite:
 * - Crear ubicaciones
 * - Subir mapas (versiones)
 * - Ver historial de versiones
 */

import { useState, useEffect, useRef } from 'react'
import {
  Map,
  Plus,
  Upload,
  Trash2,
  Edit2,
  Image as ImageIcon,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store'
import { useToast } from '@/hooks/useToast'
import {
  getMapLocations,
  createMapLocation,
  updateMapLocation,
  deleteMapLocation,
  getMapVersionsByLocation,
  uploadMapVersion,
  deleteMapVersion,
} from '@/services/maps'
import type { MapLocation, MapVersion } from '@/types/maps'
import { cn } from '@/lib/utils'

export function MapsAdminPage() {
  const user = useAuthStore((s) => s.user)
  const { toast } = useToast()

  const [locations, setLocations] = useState<MapLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedLocation, setExpandedLocation] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, MapVersion[]>>({})
  const [loadingVersions, setLoadingVersions] = useState<string | null>(null)

  // Modals
  const [showCreateLocation, setShowCreateLocation] = useState(false)
  const [editingLocation, setEditingLocation] = useState<MapLocation | null>(null)
  const [uploadingTo, setUploadingTo] = useState<MapLocation | null>(null)
  const [previewVersion, setPreviewVersion] = useState<MapVersion | null>(null)

  // Forms
  const [locationName, setLocationName] = useState('')
  const [locationDesc, setLocationDesc] = useState('')
  const [mapDesc, setMapDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)

  useEffect(() => {
    loadLocations()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadLocations = async () => {
    setLoading(true)
    try {
      const locs = await getMapLocations()
      setLocations(locs)
    } catch (_e) {
      toast({ title: 'Error', description: 'No se pudieron cargar las ubicaciones', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const loadVersions = async (locationId: string) => {
    if (versions[locationId]) return // Ya cargadas

    setLoadingVersions(locationId)
    try {
      const vers = await getMapVersionsByLocation(locationId)
      setVersions((prev) => ({ ...prev, [locationId]: vers }))
    } catch (_e) {
      toast({ title: 'Error', description: 'No se pudieron cargar las versiones', variant: 'destructive' })
    } finally {
      setLoadingVersions(null)
    }
  }

  const handleExpandLocation = (locationId: string) => {
    if (expandedLocation === locationId) {
      setExpandedLocation(null)
    } else {
      setExpandedLocation(locationId)
      loadVersions(locationId)
    }
  }

  // Crear ubicación
  const handleCreateLocation = async () => {
    if (!locationName.trim() || !user) return

    setSaving(true)
    try {
      const newLoc = await createMapLocation(
        { nombre: locationName.trim(), descripcion: locationDesc.trim() || undefined },
        user.id
      )
      setLocations((prev) => [...prev, newLoc])
      setShowCreateLocation(false)
      setLocationName('')
      setLocationDesc('')
      toast({ title: 'Ubicación creada', description: `"${newLoc.nombre}" ha sido creada`, variant: 'success' })
    } catch (_e) {
      toast({ title: 'Error', description: 'No se pudo crear la ubicación', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Editar ubicación
  const handleEditLocation = async () => {
    if (!editingLocation || !locationName.trim()) return

    setSaving(true)
    try {
      await updateMapLocation(editingLocation.id, {
        nombre: locationName.trim(),
        descripcion: locationDesc.trim() || undefined,
      })
      setLocations((prev) =>
        prev.map((l) =>
          l.id === editingLocation.id
            ? { ...l, nombre: locationName.trim(), descripcion: locationDesc.trim() }
            : l
        )
      )
      setEditingLocation(null)
      setLocationName('')
      setLocationDesc('')
      toast({ title: 'Ubicación actualizada', variant: 'success' })
    } catch (_e) {
      toast({ title: 'Error', description: 'No se pudo actualizar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Eliminar ubicación
  const handleDeleteLocation = async (location: MapLocation) => {
    if (!confirm(`¿Eliminar "${location.nombre}"? Los mapas asociados también se eliminarán.`)) return

    try {
      await deleteMapLocation(location.id)
      setLocations((prev) => prev.filter((l) => l.id !== location.id))
      toast({ title: 'Ubicación eliminada', variant: 'success' })
    } catch (_e) {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' })
    }
  }

  // Seleccionar archivo
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({ title: 'Error', description: 'Solo se permiten imágenes', variant: 'destructive' })
      return
    }

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => setFilePreview(reader.result as string)
    reader.readAsDataURL(file)
  }

  // Subir mapa
  const handleUploadMap = async () => {
    if (!uploadingTo || !selectedFile || !user) return

    setSaving(true)
    try {
      const newVersion = await uploadMapVersion(
        uploadingTo.id,
        selectedFile,
        user.id,
        mapDesc.trim() || undefined
      )

      // Actualizar cache de versiones
      setVersions((prev) => ({
        ...prev,
        [uploadingTo.id]: [newVersion, ...(prev[uploadingTo.id] || [])],
      }))

      setUploadingTo(null)
      setSelectedFile(null)
      setFilePreview(null)
      setMapDesc('')
      toast({
        title: 'Mapa subido',
        description: `Versión ${newVersion.version} creada para "${uploadingTo.nombre}"`,
        variant: 'success',
      })
    } catch (_e) {
      toast({ title: 'Error', description: 'No se pudo subir el mapa', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Eliminar versión
  const handleDeleteVersion = async (version: MapVersion, _locationName: string) => {
    if (!confirm(`¿Eliminar la versión ${version.version} del mapa? Los marcadores asociados quedarán huérfanos.`)) return

    try {
      await deleteMapVersion(version.id)
      setVersions((prev) => ({
        ...prev,
        [version.locationId]: (prev[version.locationId] || []).filter((v) => v.id !== version.id),
      }))
      toast({ title: 'Versión eliminada', variant: 'success' })
    } catch (_e) {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' })
    }
  }

  if (user?.rol !== 'admin') {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium">Acceso restringido</h2>
        <p className="text-muted-foreground">Solo los administradores pueden gestionar mapas</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Map className="h-6 w-6" />
            Gestión de Mapas
          </h1>
          <p className="text-muted-foreground">Administra ubicaciones y mapas de planta</p>
        </div>
        <Button onClick={() => setShowCreateLocation(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nueva Ubicación
        </Button>
      </div>

      {/* Lista de ubicaciones */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : locations.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Map className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No hay ubicaciones</h3>
            <p className="text-muted-foreground mb-4">
              Crea una ubicación para comenzar a subir mapas
            </p>
            <Button onClick={() => setShowCreateLocation(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Crear primera ubicación
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {locations.map((location) => {
            const isExpanded = expandedLocation === location.id
            const locationVersions = versions[location.id] || []
            const isLoadingVersions = loadingVersions === location.id

            return (
              <Card key={location.id}>
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleExpandLocation(location.id)}
                      className="flex items-center gap-2 text-left flex-1"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-base">{location.nombre}</CardTitle>
                        {location.descripcion && (
                          <p className="text-sm text-muted-foreground font-normal">
                            {location.descripcion}
                          </p>
                        )}
                      </div>
                    </button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setUploadingTo(location)}
                        title="Subir nuevo mapa"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingLocation(location)
                          setLocationName(location.nombre)
                          setLocationDesc(location.descripcion || '')
                        }}
                        title="Editar ubicación"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteLocation(location)}
                        title="Eliminar ubicación"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4">
                    {isLoadingVersions ? (
                      <div className="flex items-center gap-2 text-muted-foreground py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando versiones...
                      </div>
                    ) : locationVersions.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No hay mapas cargados</p>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => setUploadingTo(location)}
                        >
                          Subir primer mapa
                        </Button>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {locationVersions.map((version) => (
                          <div
                            key={version.id}
                            className="border rounded-lg overflow-hidden group"
                          >
                            <button
                              onClick={() => setPreviewVersion(version)}
                              className="w-full aspect-video bg-muted relative"
                            >
                              <img
                                src={version.imageUrl}
                                alt={`Versión ${version.version}`}
                                className="w-full h-full object-contain"
                              />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-white text-sm">Ver mapa</span>
                              </div>
                            </button>
                            <div className="p-2 flex items-center justify-between bg-muted/30">
                              <div className="text-xs">
                                <span className="font-medium">v{version.version}</span>
                                <span className="text-muted-foreground ml-2">
                                  {version.width}x{version.height}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {version.createdAt.toLocaleDateString()}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteVersion(version, location.nombre)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal: Crear ubicación */}
      <Dialog open={showCreateLocation} onOpenChange={setShowCreateLocation}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Ubicación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="loc-name">Nombre *</Label>
              <Input
                id="loc-name"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Ej: Planta Principal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loc-desc">Descripción (opcional)</Label>
              <Input
                id="loc-desc"
                value={locationDesc}
                onChange={(e) => setLocationDesc(e.target.value)}
                placeholder="Descripción breve"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreateLocation(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateLocation} disabled={!locationName.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Editar ubicación */}
      <Dialog open={!!editingLocation} onOpenChange={(open) => !open && setEditingLocation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Ubicación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-loc-name">Nombre *</Label>
              <Input
                id="edit-loc-name"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="Ej: Planta Principal"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-loc-desc">Descripción (opcional)</Label>
              <Input
                id="edit-loc-desc"
                value={locationDesc}
                onChange={(e) => setLocationDesc(e.target.value)}
                placeholder="Descripción breve"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingLocation(null)}>
              Cancelar
            </Button>
            <Button onClick={handleEditLocation} disabled={!locationName.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Subir mapa */}
      <Dialog open={!!uploadingTo} onOpenChange={(open) => {
        if (!open) {
          setUploadingTo(null)
          setSelectedFile(null)
          setFilePreview(null)
          setMapDesc('')
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Subir Mapa - {uploadingTo?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
                'hover:border-primary hover:bg-primary/5',
                filePreview && 'border-primary bg-primary/5'
              )}
            >
              {filePreview ? (
                <img src={filePreview} alt="Preview" className="max-h-48 mx-auto rounded" />
              ) : (
                <>
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click para seleccionar imagen del mapa
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PNG, JPG o WebP. Se optimizará automáticamente.
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="space-y-2">
              <Label htmlFor="map-desc">Descripción de esta versión (opcional)</Label>
              <Input
                id="map-desc"
                value={mapDesc}
                onChange={(e) => setMapDesc(e.target.value)}
                placeholder="Ej: Actualización enero 2026"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadingTo(null)}>
              Cancelar
            </Button>
            <Button onClick={handleUploadMap} disabled={!selectedFile || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Subir Mapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Preview de mapa */}
      <Dialog open={!!previewVersion} onOpenChange={(open) => !open && setPreviewVersion(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Mapa v{previewVersion?.version}
              {previewVersion?.descripcion && ` - ${previewVersion.descripcion}`}
            </DialogTitle>
          </DialogHeader>
          {previewVersion && (
            <div className="max-h-[70vh] overflow-auto">
              <img
                src={previewVersion.imageUrl}
                alt={`Versión ${previewVersion.version}`}
                className="w-full"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
