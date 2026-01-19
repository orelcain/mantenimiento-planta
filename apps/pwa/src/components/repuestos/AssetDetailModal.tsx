import { useState } from 'react'
import { X, Download, Copy, MapPin, Zap, Droplet, Volume2 } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Card, CardContent } from '@/components/ui'
import type { PlantAsset } from '@/types/repuestos'

interface AssetDetailModalProps {
  asset: PlantAsset | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AssetDetailModal({ asset, open, onOpenChange }: AssetDetailModalProps) {
  if (!asset) return null

  const getAssetIcon = () => {
    return asset.tipo === 'motor' ? <Zap className="h-5 w-5" /> : <Droplet className="h-5 w-5" />
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              {getAssetIcon()}
              <div>
                <DialogTitle>{asset.equipo}</DialogTitle>
                <p className="text-sm text-muted-foreground">{asset.area || '-'}</p>
              </div>
            </div>
            <Badge variant={asset.tipo === 'motor' ? 'default' : 'secondary'}>
              {asset.tipo === 'motor' ? 'Motor' : 'Bomba'}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Datos técnicos básicos */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Código SAP</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                      {asset.codigoSAP || '-'}
                    </code>
                    {asset.codigoSAP && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(asset.codigoSAP)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Marca</label>
                  <p className="text-sm font-medium mt-1">{asset.marca || '-'}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Modelo/Tipo</label>
                  <p className="text-sm font-medium mt-1">{asset.modeloTipo || '-'}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Potencia</label>
                  <p className="text-sm font-medium mt-1">{asset.potencia || '-'}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Voltaje</label>
                  <p className="text-sm font-medium mt-1">{asset.voltaje || '-'}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Corriente</label>
                  <p className="text-sm font-medium mt-1">{asset.corriente || '-'}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Eje</label>
                  <p className="text-sm font-medium mt-1">{asset.eje || '-'}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Acople</label>
                  <p className="text-sm font-medium mt-1">{asset.acople || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Datos específicos de bomba */}
          {asset.tipo === 'bomba' && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Droplet className="h-4 w-4" />
                  Especificaciones de Bomba
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Caudal (m³/h)</label>
                    <p className="text-sm font-medium mt-1">{asset.caudalM3h || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Altura (m)</label>
                    <p className="text-sm font-medium mt-1">{asset.alturaM || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Relación Reducción</label>
                    <p className="text-sm font-medium mt-1">{asset.relacionReduccion || '-'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Altura Base (mm)</label>
                    <p className="text-sm font-medium mt-1">{asset.alturaBaseCentroEjeMm || '-'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ubicación */}
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Ubicación Técnica
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Área</label>
                  <p className="font-medium mt-1">{asset.area || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Subárea</label>
                  <p className="font-medium mt-1">{asset.subarea || '-'}</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Componente</label>
                  <p className="font-medium mt-1">{asset.componente || '-'}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observaciones */}
          {asset.observaciones && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-2">Observaciones</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.observaciones}</p>
              </CardContent>
            </Card>
          )}

          {/* Referencias/Documentos */}
          {asset.referencias && asset.referencias.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4">Referencias Técnicas</h4>
                <div className="space-y-2">
                  {asset.referencias.map((ref) => (
                    <a
                      key={ref.id}
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 hover:bg-muted rounded text-sm text-primary hover:underline"
                    >
                      <Download className="h-4 w-4" />
                      {ref.titulo}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Imágenes */}
          {asset.imagenes && asset.imagenes.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4">Imágenes</h4>
                <div className="grid grid-cols-2 gap-3">
                  {asset.imagenes
                    .sort((a, b) => (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0))
                    .map((img) => (
                      <div key={img.id} className="relative group rounded-lg overflow-hidden">
                        <img
                          src={img.url}
                          alt={img.descripcion}
                          className="w-full h-32 object-cover"
                        />
                        {img.esPrincipal && (
                          <Badge className="absolute top-1 right-1">Principal</Badge>
                        )}
                        {img.descripcion && (
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                            <p className="text-white text-xs line-clamp-2">
                              {img.descripcion}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Marcadores en mapas */}
          {asset.marcadores && asset.marcadores.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Ubicación en Mapas
                </h4>
                <div className="space-y-2">
                  {asset.marcadores.map((marker) => (
                    <div
                      key={marker.id}
                      className="flex items-center gap-2 p-2 bg-muted rounded text-sm"
                    >
                      <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      <span className="flex-1">
                        <span className="font-medium">Mapa: {marker.mapId}</span>
                        {marker.label && <span className="text-muted-foreground"> - {marker.label}</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({Math.round(marker.x * 100)}%, {Math.round(marker.y * 100)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Botones de acción */}
        <div className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
