import { useMemo } from 'react'
import { BookOpen, ExternalLink, FileText, Link } from 'lucide-react'
import type { Repuesto } from '@/types/repuestos'
import type { ManualHeredado } from '@/hooks/repuestos/useManualesDeEquipos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
  Card,
  CardContent,
} from '@/components/ui'

interface RepuestoManualModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuesto: Repuesto
  /** Manuales heredados de los equipos donde se usa — fallback cuando el repuesto no tiene vínculos propios. */
  manualesHeredados?: ManualHeredado[]
}

export function RepuestoManualModal({
  open,
  onOpenChange,
  repuesto,
  manualesHeredados = [],
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
          {manuales.length === 0 && manualesHeredados.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No hay manuales o documentación disponible.</p>
              </CardContent>
            </Card>
          ) : manuales.length === 0 ? null : (
            <div className="space-y-2">
              {manuales.map((manual, idx) => (
                <Card key={idx} className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium flex items-center gap-2">
                        <Link className="h-4 w-4 text-primary" />
                        {manual.descripcion || `Documento ${idx + 1}`}
                      </h4>
                      {manual.descripcion && (
                        <p className="text-sm text-muted-foreground">{manual.descripcion}</p>
                      )}
                      {manual.manualUrl && (
                        <p className="text-xs text-muted-foreground truncate mt-1">
                          {manual.manualUrl}
                        </p>
                      )}
                    </div>
                    {manual.manualUrl && (
                      <Button
                        onClick={() => handleOpenLink(manual.manualUrl!)}
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

          {/* Manuales heredados de los equipos donde se usa (mismos que la sección
              "Manuales del equipo" del panel — el botón Manual ya no dice "no hay"
              cuando el equipo sí tiene documentación). */}
          {manualesHeredados.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" /> Manuales del equipo ({manualesHeredados.length})
              </p>
              <div className="space-y-2">
                {manualesHeredados.map((m) => (
                  <Card key={m.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate font-medium" title={m.titulo}>{m.titulo}</h4>
                        {m.machineOrigen && <p className="text-xs text-muted-foreground">de {m.machineOrigen}</p>}
                      </div>
                      {m.url && (
                        <Button onClick={() => handleOpenLink(m.url)} size="sm" variant="outline" className="shrink-0 gap-1.5">
                          <ExternalLink className="h-3.5 w-3.5" /> Abrir
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
