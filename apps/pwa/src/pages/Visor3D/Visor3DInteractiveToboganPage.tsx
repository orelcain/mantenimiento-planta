import { ArrowLeft, ExternalLink, Waves } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button, Badge } from '@/components/ui'
import { ToboganInteractiveExperience } from '@/components/visor3d/interactive/ToboganInteractiveExperience'
import { ShareInteractiveButton } from '@/components/visor3d/ShareInteractiveButton'

export function Visor3DInteractiveToboganPage() {
  const shareUrl = `${window.location.origin}/mantenimiento-planta/v/interactive/tobogan`

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Interactividad Tobogan</h1>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Demo activa
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Esta experiencia se abre directamente desde la repo del tobogan y no requiere que el modelo 3D exista cargado en Firestore.
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
            <a href="https://orelcain.github.io/tobogan-app/" target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir fuente
            </a>
          </Button>
          <ShareInteractiveButton
            url={shareUrl}
            title="Interactividad Tobogan Decomiso"
            description="Demo interactiva del tobogan de decomiso."
          />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <ToboganInteractiveExperience modelName="Tobogan Decomiso" className="h-[calc(100vh-15rem)] min-h-[620px]" />
      </div>
    </div>
  )
}