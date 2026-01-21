import { useState, useMemo } from 'react'
import { Package, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, LoadingScreen, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { MotorasBombasTable } from '@/components/repuestos/MotorasBombasTable'
import { MapasViewer } from '@/components/repuestos/MapasViewer'
import { AssetDetailModal } from '@/components/repuestos/AssetDetailModal'
import { usePlantAssets } from '@/hooks/repuestos/usePlantAssets'
import { usePlantMaps } from '@/hooks/repuestos/usePlantMaps'
import type { PlantAsset } from '@/types/repuestos'

export function CatalogoBases() {
  const { assets, loading: assetsLoading, error: assetsError, addMarker, deleteMarker } = usePlantAssets()
  const { maps, loading: mapsLoading, error: mapsError } = usePlantMaps()
  const { toast } = useToast()

  const [selectedAsset, setSelectedAsset] = useState<PlantAsset | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)

  // Agrupar assets por tipo
  const stats = useMemo(() => {
    return {
      total: assets.length,
      motores: assets.filter((a: PlantAsset) => a.tipo === 'motor').length,
      bombas: assets.filter((a: PlantAsset) => a.tipo === 'bomba').length,
      conImagenes: assets.filter((a: PlantAsset) => (a.imagenes?.length ?? 0) > 0).length,
      conMarcadores: assets.filter((a: PlantAsset) => (a.marcadores?.length ?? 0) > 0).length,
    }
  }, [assets])

  const handleAssetSelect = (asset: PlantAsset) => {
    setSelectedAsset(asset)
    setShowDetailModal(true)
  }

  const handleCreateMarker = async (assetId: string, mapId: string, x: number, y: number, label?: string) => {
    try {
      const asset = assets.find(a => a.id === assetId)
      if (!asset) throw new Error('Asset no encontrado')
      
      await addMarker(asset, { mapId, x, y, label })
      toast({
        title: 'Marcador creado',
        description: `Marcador agregado para ${asset.equipo}`,
        variant: 'success',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al crear marcador'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
      throw err
    }
  }

  const handleDeleteMarker = async (assetId: string, markerId: string) => {
    try {
      const asset = assets.find(a => a.id === assetId)
      if (!asset) throw new Error('Asset no encontrado')
      
      await deleteMarker(asset, markerId)
      toast({
        title: 'Marcador eliminado',
        description: 'El marcador ha sido eliminado exitosamente',
        variant: 'success',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al eliminar marcador'
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      })
      throw err
    }
  }

  if (assetsLoading || mapsLoading) {
    return <LoadingScreen />
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Catálogo de Bases</h1>
        <p className="text-muted-foreground">
          Motores, bombas y componentes de la planta. Visualiza ubicaciones en mapas interactivos.
        </p>
      </div>

      {/* Errores */}
      {(assetsError || mapsError) && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {assetsError || mapsError}
        </div>
      )}

      {/* Estadísticas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.motores}</div>
              <p className="text-xs text-muted-foreground">Motores</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-500">{stats.bombas}</div>
              <p className="text-xs text-muted-foreground">Bombas</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{stats.conImagenes}</div>
              <p className="text-xs text-muted-foreground">Con imágenes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-500">{stats.conMarcadores}</div>
              <p className="text-xs text-muted-foreground">En mapas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contenido principal */}
      <Tabs defaultValue="tabla" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="tabla">
            <Package className="h-4 w-4 mr-2" />
            Tabla de Bases
          </TabsTrigger>
          <TabsTrigger value="mapas">
            <Package className="h-4 w-4 mr-2" />
            Mapas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tabla" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Motores y Bombas</CardTitle>
              <CardDescription>
                Catálogo completo de equipos rotatorios de la planta. Busca por equipo, área, marca o código.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MotorasBombasTable
                assets={assets}
                loading={assetsLoading}
                onSelect={handleAssetSelect}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visualización en Mapas</CardTitle>
              <CardDescription>
                Ubica los motores y bombas en los mapas de la planta. Haz clic en los marcadores para ver detalles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {maps.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay mapas disponibles</p>
                </div>
              ) : (
                <MapasViewer
                  maps={maps}
                  assets={assets}
                  loading={mapsLoading}
                  selectedAssetId={selectedAsset?.id || null}
                  onMarkerClick={(marker) => {
                    const asset = assets.find((a: PlantAsset) =>
                      a.marcadores?.some((m: any) => m.id === marker.id)
                    )
                    if (asset) {
                      setSelectedAsset(asset)
                      setShowDetailModal(true)
                    }
                  }}
                  onCreateMarker={handleCreateMarker}
                  onDeleteMarker={handleDeleteMarker}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de detalles */}
      <AssetDetailModal
        asset={selectedAsset}
        open={showDetailModal}
        onOpenChange={setShowDetailModal}
      />
    </div>
  )
}
