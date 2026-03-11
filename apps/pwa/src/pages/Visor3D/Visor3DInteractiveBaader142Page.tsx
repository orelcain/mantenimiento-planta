import { useEffect, useState } from 'react'
import { ArrowLeft, AirVent, Box, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button } from '@/components/ui'
import { SopladorasBaader142InteractiveExperience } from '@/components/visor3d/interactive/SopladorasBaader142InteractiveExperience'
import { subscribeToModels3D } from '@/services/models3d'
import { getInteractiveExperienceForModel } from '@/components/visor3d/interactive/experienceRegistry'
import type { Model3D, Model3DFormat } from '@/types/models3d'

export function Visor3DInteractiveBaader142Page() {
  const [modelUrl, setModelUrl] = useState<string | undefined>()
  const [modelFormat, setModelFormat] = useState<Model3DFormat | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = subscribeToModels3D((models: Model3D[]) => {
      const match = models.find(
        (m) => getInteractiveExperienceForModel(m)?.id === 'sopladorasBaader142',
      )
      if (match) {
        setModelUrl(match.downloadURL)
        setModelFormat(match.format)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <AirVent className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">Interactividad Sopladoras Baader 142</h1>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              Base operativa
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Esta ruta sirve para definir estados, secuencias e inspecciones del conjunto de sopladoras antes de conectarlo a puntos interactivos del modelo 3D.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link to="/visor-3d">
              <ArrowLeft className="h-4 w-4" />
              Volver al visor
            </Link>
          </Button>
          {modelUrl && (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link to="/visor-3d">
                <Box className="h-4 w-4" />
                Ver modelo asociado
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {loading ? (
          <div className="flex h-[calc(100vh-15rem)] min-h-[620px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <SopladorasBaader142InteractiveExperience
            modelName="Sopladoras Baader 142"
            modelUrl={modelUrl}
            modelFormat={modelFormat}
            className="h-[calc(100vh-15rem)] min-h-[620px]"
          />
        )}
      </div>
    </div>
  )
}