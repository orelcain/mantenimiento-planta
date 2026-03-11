import { useMemo, useState } from 'react'
import { AirVent, Gauge, Settings2, Workflow } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { cn } from '@/lib/utils'

type OperatingMode = 'produccion' | 'lavado' | 'mantencion'
type BlowerStatus = 'operativa' | 'revision' | 'detenida'
type BlowerId = 'S1' | 'S2' | 'S3' | 'S4'

interface BlowerState {
  id: BlowerId
  label: string
  zone: string
  flow: string
  status: BlowerStatus
}

interface SopladorasBaader142InteractiveExperienceProps {
  modelName: string
  className?: string
}

const STATUS_ORDER: BlowerStatus[] = ['operativa', 'revision', 'detenida']

const STATUS_STYLES: Record<BlowerStatus, string> = {
  operativa: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  revision: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  detenida: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
}

const MODE_COPY: Record<OperatingMode, { title: string; summary: string; checklist: string[] }> = {
  produccion: {
    title: 'Produccion activa',
    summary: 'Prioriza continuidad de soplado, balance de flujo y respuesta rapida ante una unidad degradada.',
    checklist: [
      'Confirmar sopladora lider y respaldo inmediato.',
      'Verificar consistencia de flujo entre las cuatro unidades.',
      'Registrar vibracion, ruido o caida de caudal por linea.',
    ],
  },
  lavado: {
    title: 'Lavado y limpieza',
    summary: 'Se reduce la carga operativa para intervenir sectores sin comprometer toda la linea.',
    checklist: [
      'Aislar la unidad intervenida antes de abrir resguardos.',
      'Bajar consigna de las unidades contiguas si comparten circuito.',
      'Reiniciar secuencia en escalonado una vez cerrada la limpieza.',
    ],
  },
  mantencion: {
    title: 'Mantencion controlada',
    summary: 'Se usa como base para planificar bloqueo, reemplazo y retorno seguro de cada sopladora.',
    checklist: [
      'Definir unidad fuera de servicio y respaldo temporal.',
      'Marcar punto de inspeccion mecanica y electrica.',
      'Validar retorno a operacion con prueba de caudal.',
    ],
  },
}

const INITIAL_BLOWERS: BlowerState[] = [
  { id: 'S1', label: 'Sopladora 1', zone: 'Cabecera norte', flow: '92%', status: 'operativa' },
  { id: 'S2', label: 'Sopladora 2', zone: 'Cabecera centro', flow: '89%', status: 'operativa' },
  { id: 'S3', label: 'Sopladora 3', zone: 'Cabecera sur', flow: '76%', status: 'revision' },
  { id: 'S4', label: 'Sopladora 4', zone: 'Respaldo de linea', flow: '0%', status: 'detenida' },
]

function nextStatus(currentStatus: BlowerStatus): BlowerStatus {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus)
  return STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length]!
}

export function SopladorasBaader142InteractiveExperience({
  modelName,
  className,
}: SopladorasBaader142InteractiveExperienceProps) {
  const [mode, setMode] = useState<OperatingMode>('produccion')
  const [selectedBlowerId, setSelectedBlowerId] = useState<BlowerId>('S1')
  const [blowers, setBlowers] = useState<BlowerState[]>(INITIAL_BLOWERS)

  const selectedBlower = useMemo(
    () => blowers.find((blower) => blower.id === selectedBlowerId) ?? blowers[0]!,
    [blowers, selectedBlowerId],
  )

  const activeSummary = MODE_COPY[mode]

  function handleCycleStatus(blowerId: BlowerId) {
    setBlowers((currentBlowers) =>
      currentBlowers.map((blower) =>
        blower.id === blowerId
          ? { ...blower, status: nextStatus(blower.status) }
          : blower,
      ),
    )
  }

  return (
    <div className={cn('flex h-full flex-col bg-card', className)}>
      <div className="border-b px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <AirVent className="h-5 w-5 text-primary" />
              <h2 className="text-sm font-semibold">Interactividad Sopladoras Baader 142</h2>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                Base operativa
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta base sirve para definir la logica operacional de {modelName} antes de bajarla al modelo 3D: modo activo, estado por sopladora y foco de inspeccion.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: 'produccion', label: 'Produccion' },
              { id: 'lavado', label: 'Lavado' },
              { id: 'mantencion', label: 'Mantencion' },
            ] as const).map((option) => (
              <Button
                key={option.id}
                variant={mode === option.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMode(option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid flex-1 gap-4 p-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Workflow className="h-4 w-4 text-primary" />
                Estado por sopladora
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {blowers.map((blower) => (
                <button
                  key={blower.id}
                  type="button"
                  onClick={() => setSelectedBlowerId(blower.id)}
                  className={cn(
                    'rounded-xl border p-4 text-left transition-colors',
                    selectedBlowerId === blower.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/30 hover:bg-muted/30',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{blower.label}</p>
                      <p className="text-xs text-muted-foreground">{blower.zone}</p>
                    </div>
                    <Badge className={cn('border text-[10px] uppercase tracking-wide', STATUS_STYLES[blower.status])}>
                      {blower.status}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Caudal estimado</p>
                      <p className="text-lg font-semibold">{blower.flow}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCycleStatus(blower.id)
                      }}
                    >
                      Cambiar estado
                    </Button>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-primary" />
                Secuencia operativa sugerida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{activeSummary.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{activeSummary.summary}</p>
              </div>
              <div className="grid gap-2">
                {activeSummary.checklist.map((item) => (
                  <div key={item} className="rounded-lg border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="h-4 w-4 text-primary" />
                Punto enfocado
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-sm font-semibold">{selectedBlower.label}</p>
                <p className="text-sm text-muted-foreground">{selectedBlower.zone}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Estado actual</p>
                <p className="mt-1 text-lg font-semibold capitalize">{selectedBlower.status}</p>
                <p className="mt-3 text-[11px] uppercase tracking-wide text-muted-foreground">Caudal</p>
                <p className="mt-1 text-lg font-semibold">{selectedBlower.flow}</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Inspeccion sugerida:</p>
                <p className="rounded-lg border bg-background px-3 py-2">
                  Revisar continuidad de aire, fijaciones, vibracion y respuesta del circuito asociado a {selectedBlower.label.toLowerCase()}.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Utilidad actual de esta base</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Permite validar el criterio operativo antes de meter complejidad visual en el modelo.</p>
              <p>Sirve para acordar estados, secuencias y respuesta esperada por cada sopladora con operacion y mantencion.</p>
              <p>Tambien deja lista la estructura para enlazar despues hotspots, alarmas y reglas reales del equipo.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Siguiente iteracion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Lo siguiente es conectar comportamiento real: arranque, paro, dependencias entre sopladoras y puntos criticos del modelo.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}