import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { getHistorial } from '@/services/repuestos'
import type { Repuesto } from '@/types/repuestos'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Spinner,
  Card,
  CardContent,
} from '@/components/ui'

interface HistorialCambio {
  id: string
  repuestoId: string
  campo: string
  valorAnterior: string | number | null
  valorNuevo: string | number | null
  fecha: Date
}

interface RepuestoHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repuesto: Repuesto
  machineId?: string
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

const getFieldLabel = (campo: string): string => {
  const labels: Record<string, string> = {
    codigoSAP: 'Código SAP',
    codigoBaader: 'Código Baader',
    textoBreve: 'Texto breve',
    descripcion: 'Descripción',
    valorUnitario: 'Valor unitario',
    cantidadSolicitada: 'Cantidad solicitada',
    cantidadStockBodega: 'Stock bodega',
    tags: 'Tags/Inventario',
    vinculosManual: 'Manuales',
    imagenesManual: 'Imágenes',
    fotosReales: 'Fotos reales',
    creacion: 'Creación',
  }
  return labels[campo] || campo
}

export function RepuestoHistoryModal({
  open,
  onOpenChange,
  repuesto,
  machineId,
}: RepuestoHistoryModalProps) {
  const [historial, setHistorial] = useState<HistorialCambio[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !machineId) return

    const loadHistorial = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await getHistorial(repuesto.id, machineId)
        setHistorial(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar historial')
      } finally {
        setLoading(false)
      }
    }

    loadHistorial()
  }, [open, repuesto.id, machineId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de cambios - {repuesto.textoBreve}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Spinner className="mr-2" />
              <span className="text-muted-foreground">Cargando historial...</span>
            </div>
          )}

          {error && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          )}

          {!loading && historial.length === 0 && !error && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No hay cambios registrados.</p>
              </CardContent>
            </Card>
          )}

          {!loading && historial.length > 0 && (
            <div className="space-y-3">
              {historial.map((cambio, idx) => (
                <Card key={cambio.id || idx} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="font-semibold text-sm">{getFieldLabel(cambio.campo)}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <Clock className="h-3 w-3" />
                          {new Date(cambio.fecha).toLocaleString('es-CL')}
                        </div>
                      </div>
                    </div>

                    {cambio.campo !== 'creacion' && (
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-1">Anterior</p>
                          <pre className="bg-muted/50 p-2 rounded text-xs whitespace-pre-wrap break-words font-mono">
                            {formatValue(cambio.valorAnterior)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">Nuevo</p>
                          <pre className="bg-primary/10 p-2 rounded text-xs whitespace-pre-wrap break-words font-mono text-primary">
                            {formatValue(cambio.valorNuevo)}
                          </pre>
                        </div>
                      </div>
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
