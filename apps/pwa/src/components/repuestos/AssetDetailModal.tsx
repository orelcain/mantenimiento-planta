import { useEffect, useRef, useState } from 'react'
import { Download, Copy, MapPin, Zap, Droplet, Pencil, Save, Upload, Star, Trash2, Loader2 } from 'lucide-react'
import {
  Button, Dialog, DialogContent, DialogHeader, DialogTitle, Badge, Card, CardContent,
  Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/services/firebase'
import { processImageForUpload } from '@/utils/images/processImage'
import { validateImageFile } from '@/utils/repuestos/imageUtils'
import { useToast } from '@/hooks/useToast'
import type { PlantAsset, PlantAssetImagen } from '@/types/repuestos'

interface AssetDetailModalProps {
  asset: PlantAsset | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si se proveen, el modal habilita el modo edición. */
  onUpdate?: (id: string, patch: Partial<Omit<PlantAsset, 'id' | 'createdAt'>>) => Promise<void>
  onAddImage?: (asset: PlantAsset, img: Omit<PlantAssetImagen, 'id' | 'createdAt'>) => Promise<unknown>
  onDeleteImage?: (asset: PlantAsset, imgId: string) => Promise<void>
}

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, '_')
const newId = () =>
  (globalThis as any).crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function AssetDetailModal({ asset, open, onOpenChange, onUpdate, onAddImage, onDeleteImage }: AssetDetailModalProps) {
  const { toast } = useToast()
  const editable = Boolean(onUpdate)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState<Partial<PlantAsset>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reiniciar formulario y salir de edición al cambiar de asset o abrir/cerrar
  useEffect(() => {
    if (asset) setForm({ ...asset })
    setEditing(false)
  }, [asset?.id, open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!asset) return null

  const setField = (key: keyof PlantAsset, value: string) => setForm((f) => ({ ...f, [key]: value }))
  const fieldVal = (key: keyof PlantAsset) => String((form as any)[key] ?? '')

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  // ── Guardar campos ──
  const handleSave = async () => {
    if (!onUpdate) return
    setSaving(true)
    try {
      const keys: (keyof PlantAsset)[] = [
        'tipo', 'equipo', 'area', 'subarea', 'componente', 'marca', 'modeloTipo',
        'codigoSAP', 'descripcionSAP', 'potencia', 'voltaje', 'corriente', 'eje',
        'relacionReduccion', 'acople', 'observaciones', 'caudalM3h', 'alturaM', 'alturaBaseCentroEjeMm',
      ]
      const patch: Record<string, unknown> = {}
      keys.forEach((k) => { patch[k] = (form as any)[k] ?? '' })
      await onUpdate(asset.id, patch as any)
      toast({ title: 'Cambios guardados', description: asset.equipo, variant: 'success' })
      setEditing(false)
    } catch (e) {
      toast({ title: 'Error al guardar', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // ── Subir foto(s) ──
  const handleFiles = async (files: FileList | null) => {
    if (!files || !onAddImage) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const valid = validateImageFile(file, 25)
        if (valid !== true) {
          toast({ title: 'Archivo inválido', description: valid, variant: 'destructive' })
          continue
        }
        const processed = await processImageForUpload(file, { maxWidth: 1920, maxHeight: 1920, targetBytes: 450 * 1024 })
        const fid = newId()
        const path = `plantAssets/${asset.id}/imagenes/${fid}-${safeName(processed.file.name)}`
        const sref = storageRef(storage, path)
        await uploadBytes(sref, processed.file)
        const url = await getDownloadURL(sref)
        const isFirst = (asset.imagenes?.length ?? 0) === 0
        await onAddImage(asset, { url, descripcion: '', orden: asset.imagenes?.length ?? 0, esPrincipal: isFirst })
      }
      toast({ title: 'Foto agregada', variant: 'success' })
    } catch (e) {
      toast({ title: 'Error al subir la foto', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteImage = async (imgId: string) => {
    if (!onDeleteImage) return
    if (!window.confirm('¿Eliminar esta foto del equipo?')) return
    try {
      await onDeleteImage(asset, imgId)
      toast({ title: 'Foto eliminada', variant: 'success' })
    } catch (e) {
      toast({ title: 'Error al eliminar', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const handleSetPrincipal = async (imgId: string) => {
    if (!onUpdate) return
    const imagenes = (asset.imagenes ?? []).map((i) => ({ ...i, esPrincipal: i.id === imgId }))
    try {
      await onUpdate(asset.id, { imagenes } as any)
      toast({ title: 'Imagen principal actualizada', variant: 'success' })
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : '', variant: 'destructive' })
    }
  }

  const getAssetIcon = () => (asset.tipo === 'motor' ? <Zap className="h-5 w-5" /> : <Droplet className="h-5 w-5" />)

  /**
   * Campo: muestra valor en lectura, Input/Textarea en edición.
   * Es una FUNCIÓN (no un componente) para no remontar los inputs en cada
   * render — si fuera <Field/> el input perdería el foco a cada tecla.
   */
  const renderField = (opts: {
    label: string; k: keyof PlantAsset; full?: boolean; textarea?: boolean; mono?: boolean; placeholder?: string
  }) => {
    const { label, k, full = false, textarea = false, mono = false, placeholder } = opts
    return (
      <div className={full ? 'col-span-2' : ''}>
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        {editing ? (
          textarea ? (
            <Textarea value={fieldVal(k)} onChange={(e) => setField(k, e.target.value)} className="mt-1" rows={3} placeholder={placeholder} />
          ) : (
            <Input value={fieldVal(k)} onChange={(e) => setField(k, e.target.value)} className="mt-1 h-8" placeholder={placeholder} />
          )
        ) : (
          <p className={`text-sm font-medium mt-1 ${mono ? 'font-mono' : ''}`}>{String((asset as any)[k] || '-')}</p>
        )}
      </div>
    )
  }

  const images = (asset.imagenes ?? []).slice().sort((a, b) => (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0))

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
            <div className="flex items-center gap-2">
              <Badge variant={asset.tipo === 'motor' ? 'default' : 'secondary'}>
                {asset.tipo === 'motor' ? 'Motor' : 'Bomba'}
              </Badge>
              {editable && !editing && (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Datos técnicos básicos */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Tipo (solo editable) */}
                {editing && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Tipo</label>
                    <Select value={fieldVal('tipo') || 'motor'} onValueChange={(v) => setField('tipo', v)}>
                      <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="motor">Motor</SelectItem>
                        <SelectItem value="bomba">Bomba</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {editing && renderField({ label: 'Equipo', k: 'equipo' })}

                {/* Código SAP */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Código SAP</label>
                  {editing ? (
                    <Input value={fieldVal('codigoSAP')} onChange={(e) => setField('codigoSAP', e.target.value)} className="mt-1 h-8 font-mono" placeholder="33001240XX" />
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">{asset.codigoSAP || '-'}</code>
                      {asset.codigoSAP && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => copyToClipboard(asset.codigoSAP)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {renderField({ label: 'Marca', k: 'marca', placeholder: 'Ej. Sumitomo, WEG…' })}
                {renderField({ label: 'Descripción SAP', k: 'descripcionSAP', full: true, placeholder: 'Descripción de la etiqueta SAP' })}
                {renderField({ label: 'Modelo/Tipo', k: 'modeloTipo', mono: true, placeholder: 'Ej. RNYM08-1320B-30' })}
                {renderField({ label: 'Potencia', k: 'potencia', placeholder: 'Ej. 1.5 kW' })}
                {renderField({ label: 'Voltaje', k: 'voltaje', placeholder: 'Ej. 380 V' })}
                {renderField({ label: 'Corriente', k: 'corriente', placeholder: 'Ej. 3.2 A' })}
                {renderField({ label: 'Eje', k: 'eje', placeholder: 'Ej. 30mm' })}
                {renderField({ label: 'Acople', k: 'acople' })}
              </div>
            </CardContent>
          </Card>

          {/* Datos específicos de bomba */}
          {(asset.tipo === 'bomba' || (editing && fieldVal('tipo') === 'bomba')) && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Droplet className="h-4 w-4" /> Especificaciones de Bomba
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  {renderField({ label: 'Caudal (m³/h)', k: 'caudalM3h' })}
                  {renderField({ label: 'Altura (m)', k: 'alturaM' })}
                  {renderField({ label: 'Relación Reducción', k: 'relacionReduccion' })}
                  {renderField({ label: 'Altura Base (mm)', k: 'alturaBaseCentroEjeMm' })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ubicación */}
          <Card>
            <CardContent className="pt-6">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Ubicación Técnica
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {renderField({ label: 'Área', k: 'area' })}
                {renderField({ label: 'Subárea', k: 'subarea' })}
                {renderField({ label: 'Componente', k: 'componente' })}
              </div>
            </CardContent>
          </Card>

          {/* Observaciones */}
          {(asset.observaciones || editing) && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-2">Observaciones</h4>
                {editing ? (
                  <Textarea value={fieldVal('observaciones')} onChange={(e) => setField('observaciones', e.target.value)} rows={3} />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{asset.observaciones}</p>
                )}
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
                    <a key={ref.id} href={ref.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2 hover:bg-muted rounded text-sm text-primary hover:underline">
                      <Download className="h-4 w-4" />
                      {ref.titulo}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Imágenes */}
          {(images.length > 0 || (editable && editing)) && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium">Imágenes</h4>
                  {editable && editing && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={(e) => handleFiles(e.target.files)}
                      />
                      <Button variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {uploading ? 'Subiendo…' : 'Subir foto'}
                      </Button>
                    </>
                  )}
                </div>
                {images.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin fotos. Usa “Subir foto” para agregar (puedes tomarla con la cámara del celular).</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {images.map((img) => (
                      <div key={img.id} className="relative group rounded-lg overflow-hidden border border-border">
                        <img src={img.url} alt={img.descripcion} className="w-full h-32 object-cover" />
                        {img.esPrincipal && <Badge className="absolute top-1 right-1">Principal</Badge>}
                        {editing && (
                          <div className="absolute bottom-1 left-1 flex gap-1">
                            {!img.esPrincipal && (
                              <button
                                type="button"
                                onClick={() => handleSetPrincipal(img.id)}
                                title="Marcar como principal"
                                className="rounded bg-black/70 p-1.5 text-white hover:bg-black/90"
                              >
                                <Star className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteImage(img.id)}
                              title="Eliminar foto"
                              className="rounded bg-black/70 p-1.5 text-white hover:bg-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Marcadores en mapas */}
          {asset.marcadores && asset.marcadores.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Ubicación en Mapas
                </h4>
                <div className="space-y-2">
                  {asset.marcadores.map((marker) => (
                    <div key={marker.id} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
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
          {editing ? (
            <>
              <Button variant="outline" onClick={() => { setForm({ ...asset }); setEditing(false) }} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
