import { Sparkles } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'

interface InteractiveExperienceUnavailableProps {
  modelName: string
  modelId?: string
  className?: string
}

export function InteractiveExperienceUnavailable({
  modelName,
  modelId,
  className,
}: InteractiveExperienceUnavailableProps) {
  return (
    <div className={cn('flex h-full flex-col bg-card', className)}>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Interactividad</h2>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
            Proximamente
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Esta pestana ya esta habilitada en el visor. El siguiente paso es conectar una experiencia especifica para este modelo.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-2xl rounded-2xl border bg-background/90 p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-semibold">Experiencia aun no configurada</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            El modelo actual ya puede convivir con una capa interactiva separada, pero todavia no tiene una experiencia asignada en el registro.
          </p>
          <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-left text-sm">
            <p><span className="font-medium">Modelo:</span> {modelName}</p>
            {modelId ? <p className="mt-1"><span className="font-medium">ID:</span> {modelId}</p> : null}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            El tobogan ya usa esta estructura. Los siguientes equipos se conectan aqui sin tocar el visor 3D base.
          </p>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" disabled>
              Registro pendiente para este modelo
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}