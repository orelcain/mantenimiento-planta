import { useMemo, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'

const TOBOGAN_APP_URL = 'https://orelcain.github.io/tobogan-app/'

interface ToboganInteractiveExperienceProps {
  modelName: string
  className?: string
}

export function ToboganInteractiveExperience({
  modelName,
  className,
}: ToboganInteractiveExperienceProps) {
  const [reloadKey, setReloadKey] = useState(0)

  const iframeTitle = useMemo(
    () => `Interactividad Tobogan - ${modelName}`,
    [modelName],
  )

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex flex-col gap-3 border-b bg-card/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Interactividad Tobogan</h2>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Piloto
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Experiencia especifica del equipo cargada en una pestana separada, sin alterar el visor 3D base.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setReloadKey((currentKey) => currentKey + 1)}
          >
            <RefreshCw className="h-4 w-4" />
            Recargar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <a href={TOBOGAN_APP_URL} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" />
              Abrir externo
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-black/5 p-2 sm:p-3">
        <div className="h-full overflow-hidden rounded-lg border bg-background shadow-sm">
          <iframe
            key={reloadKey}
            title={iframeTitle}
            src={TOBOGAN_APP_URL}
            className="h-full min-h-[420px] w-full border-0"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="fullscreen"
          />
        </div>
      </div>
    </div>
  )
}