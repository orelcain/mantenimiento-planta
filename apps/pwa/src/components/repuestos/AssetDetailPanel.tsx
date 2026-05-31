/**
 * AssetDetailPanel — Panel lateral derecho de detalle de un motor/bomba (pulido).
 *
 * Mismo paradigma de columna fija que RepuestoDetailPanel (NO modal flotante).
 * Vista de lectura; el botón "Editar" abre el AssetDetailModal completo
 * (edición de campos + subir fotos desde el celular).
 */
import { useState, useCallback } from 'react'
import { X, Copy, Check, ImageOff, Pencil, Zap } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { PlantAsset } from '@/types/repuestos'

interface AssetDetailPanelProps {
  asset: PlantAsset | null
  areaName: string
  onClose: () => void
  onEdit: () => void
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right text-[13px] font-medium text-foreground">{value || '-'}</span>
    </div>
  )
}

export function AssetDetailPanel({ asset, areaName, onClose, onEdit }: AssetDetailPanelProps) {
  const [copied, setCopied] = useState(false)
  const [lightbox, setLightbox] = useState<string[] | null>(null)

  const copySap = useCallback(() => {
    const sap = asset?.codigoSAP
    if (!sap) return
    navigator.clipboard?.writeText(sap).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }, [asset?.codigoSAP])

  if (!asset) return null

  const photos = (asset.imagenes ?? [])
    .slice()
    .sort((a, b) => (b.esPrincipal ? 1 : 0) - (a.esPrincipal ? 1 : 0) || (a.orden ?? 0) - (b.orden ?? 0))
    .map((i) => i.url)
    .filter(Boolean)
  const photo = photos[0]

  return (
    <aside className="flex h-full w-[340px] shrink-0 flex-col border-l border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Detalle del equipo</span>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Cerrar">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-3 flex justify-center">
          {photo ? (
            <button onClick={() => setLightbox(photos)} className="overflow-hidden rounded-lg border border-border transition hover:ring-2 hover:ring-primary">
              <img src={photo} alt={asset.equipo} className="h-32 w-full max-w-[280px] object-cover" />
            </button>
          ) : (
            <div className="flex h-28 w-full max-w-[280px] items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground/50">
              <ImageOff className="h-7 w-7" />
            </div>
          )}
        </div>

        <div className="mb-2 flex items-center gap-2">
          <Badge variant={asset.tipo === 'motor' ? 'default' : 'secondary'}>
            <Zap className="mr-1 h-3 w-3" />{asset.tipo === 'motor' ? 'Motor' : 'Bomba'}
          </Badge>
        </div>
        <h2 className="text-base font-bold leading-tight text-foreground">{asset.equipo || '(sin nombre)'}</h2>
        {asset.codigoSAP && (
          <div className="mb-3 mt-1 flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">SAP</span>
            <span className="font-mono text-sm text-foreground">{asset.codigoSAP}</span>
            <button onClick={copySap} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Copiar SAP">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}

        <div className="divide-y divide-border/60 border-y border-border/60">
          <Field label="Área" value={areaName} />
          <Field label="Marca" value={asset.marca} />
          <Field label="Modelo/Tipo" value={asset.modeloTipo} />
          {asset.descripcionSAP && <Field label="Descripción SAP" value={asset.descripcionSAP} />}
          {asset.potencia && <Field label="Potencia" value={asset.potencia} />}
          {asset.voltaje && <Field label="Voltaje" value={asset.voltaje} />}
          {asset.corriente && <Field label="Corriente" value={asset.corriente} />}
          {asset.caudalM3h && <Field label="Caudal (m³/h)" value={asset.caudalM3h} />}
        </div>

        {asset.observaciones && (
          <div className="mt-3">
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Observaciones</div>
            <p className="whitespace-pre-line text-[12px] leading-relaxed text-foreground/90">{asset.observaciones}</p>
          </div>
        )}

        <Button variant="outline" size="sm" className="mt-4 w-full gap-1.5" onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Editar / subir fotos
        </Button>
      </div>

      {lightbox && <ImageLightbox photos={lightbox} onClose={() => setLightbox(null)} />}
    </aside>
  )
}
