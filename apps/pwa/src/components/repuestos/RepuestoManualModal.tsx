import { useMemo } from 'react'
import { FileText, Link } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
} from '@/components/ui'

interface RepuestoManualModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuesto: Repuesto
}

export function RepuestoManualModal({
  open,
  onOpenChange,
  repuesto,
}: RepuestoManualModalProps) {
  const manuales = useMemo(() => repuesto.vinculosManual || [], [repuesto])

  const handleOpenLink = (url: string) => {
    window.open(url, '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manual y Documentación</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {manuales.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No hay manuales o documentación disponible.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {manuales.map((manual, idx) => (
                <Card key={idx} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium flex items-center gap-2">
                        <Link className="h-4 w-4 text-primary" />
                        {manual.nombre || `Documento ${idx + 1}`}
                      </h4>
                      {manual.descripcion && (
                        <p className="text-sm text-muted-foreground">{manual.descripcion}</p>
                      )}
                      {manual.url && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {manual.url}
                        </p>
                      )}
                    </div>
                    {manual.url && (
                      <Button
                        onClick={() => handleOpenLink(manual.url!)}
                        size="sm"
                        className="ml-4"
                      >
                        Abrir
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
