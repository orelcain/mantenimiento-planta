import { ArrowLeft, Anchor } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button } from '@/components/ui'
import { PlataformaPontonInteractiveExperience } from '@/components/visor3d/interactive/PlataformaPontonInteractiveExperience'

export function Visor3DInteractivePlataformaPontonPage() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Anchor className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Plataforma Pontón Acopio</h1>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Propuesta diseño
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Propuesta de plataforma para acceso a las retenciones de bombas de succión.
            Animación interactiva: apertura de puerta corrediza y subida/bajada de ductos Ø110 con izaje.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/visor-3d">
              <ArrowLeft className="h-4 w-4" />
              Volver al visor
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <PlataformaPontonInteractiveExperience
          modelName="Plataforma Pontón Acopio"
          className="h-[calc(100vh-12rem)] min-h-[740px]"
        />
      </div>
    </div>
  )
}
