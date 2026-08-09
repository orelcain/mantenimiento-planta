/**
 * ConfirmUploadDialog — Confirmación de destino antes de subir fotos a un repuesto.
 *
 * Muestra la(s) imagen(es) seleccionada(s) junto al destino (repuesto + máquina +
 * SAP) para que el usuario verifique que no está mezclando fotos entre repuestos
 * (caso real: foto de una válvula neumática guardada en un amortiguador).
 */
import { Camera, Cog, Loader2, Package } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
} from '@/components/ui'

interface ConfirmUploadDialogProps {
  open: boolean
  /** Object URLs locales de las imágenes seleccionadas (aún no subidas). */
  previews: string[]
  repuestoName: string
  machineName?: string
  codigoSAP?: string
  uploading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmUploadDialog({
  open,
  previews,
  repuestoName,
  machineName,
  codigoSAP,
  uploading,
  onConfirm,
  onCancel,
}: ConfirmUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !uploading) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">¿La foto corresponde a este repuesto?</DialogTitle>
          <DialogDescription>
            Verifica el destino antes de subir — una foto en el repuesto equivocado
            confunde a quien busca la pieza.
          </DialogDescription>
        </DialogHeader>

        {/* Previews de lo que se va a subir */}
        <div className={['grid gap-2', previews.length === 1 ? 'grid-cols-1' : 'grid-cols-3'].join(' ')}>
          {previews.slice(0, 6).map((src, i) => (
            <div
              key={src}
              className={[
                'overflow-hidden rounded-card border border-border bg-muted',
                previews.length === 1 ? 'mx-auto max-h-44 w-auto' : 'aspect-square',
              ].join(' ')}
            >
              <img src={src} alt={`Imagen ${i + 1} a subir`} className="h-full w-full object-contain" />
            </div>
          ))}
          {previews.length > 6 && (
            <div className="flex aspect-square items-center justify-center rounded-card border border-dashed border-border text-xs text-muted-foreground">
              +{previews.length - 6} más
            </div>
          )}
        </div>

        {/* Destino */}
        <div className="rounded-card border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Package className="h-4 w-4 shrink-0 text-primary" />
            <span className="truncate">{repuestoName}</span>
          </div>
          {machineName && (
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Cog className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{machineName}</span>
            </div>
          )}
          {codigoSAP && (
            <div className="mt-1 font-mono text-xs text-muted-foreground">SAP: {codigoSAP}</div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={onCancel} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            {uploading ? 'Subiendo…' : 'Sí, subir aquí'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
