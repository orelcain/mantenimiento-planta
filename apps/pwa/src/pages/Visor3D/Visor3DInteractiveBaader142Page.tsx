import { ArrowLeft, Bot, Box } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button } from '@/components/ui'
import { InteractiveExperienceUnavailable } from '@/components/visor3d/interactive/InteractiveExperienceUnavailable'

export function Visor3DInteractiveBaader142Page() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Interactividad Baader 142</h1>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              En preparacion
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Esta ruta ya deja reservado el espacio para la experiencia de Nueva ubicacion de soplaroras baader 142 y queda conectada con el modulo Visor 3D.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/visor-3d">
              <ArrowLeft className="h-4 w-4" />
              Volver al visor
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/visor-3d">
              <Box className="h-4 w-4" />
              Ver modelo asociado
            </Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <InteractiveExperienceUnavailable
          modelName="Nueva ubicacion de soplaroras baader 142"
          className="h-[calc(100vh-15rem)] min-h-[620px]"
          title="Interactividad Baader 142"
          badgeLabel="En preparacion"
          description="La estructura ya esta lista para enchufar la simulacion de la Baader 142 sin tocar el visor 3D base. Falta implementar la logica especifica del equipo."
          footerNote="Cuando definamos el comportamiento operativo de la Baader 142, esta misma vista alojara esa experiencia y tambien aparecera dentro del modelo asociado."
        />
      </div>
    </div>
  )
}