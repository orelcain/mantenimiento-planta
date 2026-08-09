import { Card, CardContent, CardHeader, CardTitle, Button, Badge, Input, Label } from '@/components/ui'
import { InfoTooltip } from '@/components/ui/InfoTooltip'
import { Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BELT_FLOW_ORDER, getBeltLabel, GRADING_BELT_DEFAULT_MPS, Z_BELT_DEFAULT_MPS } from '@/services/grader/graderBeltHelpers'
import type { GraderBeltId } from '@/services/grader/graderBeltHelpers'
import type { GraderPhysicalConfig } from '@/services/grader/types'
import { CalibBadge } from './GatesConfigShared'

interface CintasTabProps {
  physicalConfig: GraderPhysicalConfig
  updateBeltLength: (beltId: string, lengthMeters: number) => void
  updateBeltSpeed: (beltId: string, speedMps: number) => void
  setTachModalBelt: (beltId: GraderBeltId | null) => void
}

export function CintasTab({ physicalConfig, updateBeltLength, updateBeltSpeed, setTachModalBelt }: CintasTabProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-sm font-medium">Cintas transportadoras</p>
          <p className="text-xs text-muted-foreground">
            Flujo: Pockets ❶ → <span className="font-mono">Z-Belt</span> ❷ → <span className="font-mono">Accel 1</span> → <span className="font-mono">Accel 2</span>
            <span className="text-primary font-medium"> [fotocélula]</span> → <span className="font-mono font-semibold">Grading ❹</span>
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Medir con tach SKF para calibrar
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {BELT_FLOW_ORDER.map((beltId, idx) => {
          const belt = physicalConfig.belts.find((b) => b.beltId === beltId)
          if (!belt) return null
          const transitSec = belt.speedMps > 0 ? belt.lengthMeters / belt.speedMps : 0

          // Ratio vs cinta anterior en el flujo (excepto zBelt que es la primera)
          const prevBeltId = BELT_FLOW_ORDER[idx - 1]
          const prevBelt = prevBeltId ? physicalConfig.belts.find((b) => b.beltId === prevBeltId) : undefined
          const ratio = prevBelt && prevBelt.speedMps > 0 ? belt.speedMps / prevBelt.speedMps : null

          // Responsabilidad por cinta
          const responsibility: Record<GraderBeltId, { icon: string; role: string; accent: string }> = {
            zeta:   { icon: '❷', role: 'Elevadora',    accent: 'bg-primary/[0.15] border-primary/[0.25]' },
            accel1: { icon: '❸', role: 'Aceleración 1', accent: 'bg-amber-500/[0.15] border-amber-500/[0.25]' },
            accel2: { icon: '❸', role: 'Aceleración 2 [Detection Eye]', accent: 'bg-amber-500/[0.15] border-amber-500/[0.25]' },
            main:   { icon: '❹', role: 'Clasificadora principal',  accent: 'bg-primary/5 border-primary/40' },
          }
          const resp = responsibility[beltId]

          return (
            <Card key={beltId} className={cn('border', resp.accent)}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-xs opacity-70">{resp.icon}</span>
                    {getBeltLabel(beltId)}
                    {beltId === 'main' && (
                      <Badge className="text-[10px] bg-primary/10 text-primary border-primary/30">Principal</Badge>
                    )}
                  </CardTitle>
                  <CalibBadge status={belt.calibrationStatus} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{resp.role}</p>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {/* Largo + velocidad en grid 2-col */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-[10px] text-muted-foreground">Largo (m)</Label>
                      <InfoTooltip
                        title="Largo útil de la cinta"
                        text="Distancia lineal de la superficie superior, de polea a polea. NO el perímetro completo del lazo."
                        formula="Tránsito (s) = Largo ÷ Velocidad"
                        example="3 m ÷ 0.39 m/s = 7.7s de tránsito"
                        iconSize={10}
                        position="bottom"
                      />
                    </div>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={belt.lengthMeters}
                      onChange={(e) => updateBeltLength(belt.beltId, Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-1 mb-1">
                      <Label className="text-[10px] text-muted-foreground">Velocidad (m/s)</Label>
                      <InfoTooltip
                        title="Velocidad base calibrada"
                        text="Velocidad de la superficie medida con tachómetro SKF. Es el parámetro de planta — no el setpoint operacional del turno."
                        example="Para registrar cambios durante un turno usá 'Ajusté RPM' en el panel del turno en vivo"
                        iconSize={10}
                        position="bottom"
                      />
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={belt.speedMps}
                      onChange={(e) => updateBeltSpeed(belt.beltId, Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Métricas derivadas */}
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                  <span className="font-mono">Tránsito {transitSec.toFixed(1)}s</span>
                  {belt.widthMeters && (
                    <span className="font-mono">Ancho {(belt.widthMeters * 1000).toFixed(0)}mm</span>
                  )}
                  {belt.z2Units && (
                    <span className="font-mono">Z2 {belt.z2Units}u</span>
                  )}
                  {ratio !== null && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px]',
                        ratio >= 2 ? 'border-green-500/[0.25] text-green-600' :
                        ratio >= 1.2 ? 'border-amber-500/[0.25] text-amber-600' :
                        'border-red-500/[0.25] text-red-600',
                      )}
                    >
                      ×{ratio.toFixed(2)} vs {getBeltLabel(prevBeltId!)}
                    </Badge>
                  )}
                </div>

                {/* Medición tach SKF */}
                <div className="flex items-center justify-between gap-2 border-t pt-1.5">
                  {belt.vfd?.measuredAt ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Medido {new Date(belt.vfd.measuredAt).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}
                      {belt.vfd.measuredBeltMps && (
                        <span className="font-mono ml-1">{belt.vfd.measuredBeltMps.toFixed(3)} m/s</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">Sin medición tach</span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => setTachModalBelt(beltId)}
                  >
                    <Gauge className="w-3 h-3 mr-1" /> SKF
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        <span className="text-amber-600 font-medium">⚠ Estimado</span> = derivado de unidades Z2 × factor k.
        Defaults operativos: grading {GRADING_BELT_DEFAULT_MPS} m/s · Z-belt {Z_BELT_DEFAULT_MPS} m/s.
        Para verificar en planta usa el <strong>tachómetro SKF</strong> en cada cinta y registra la medición (FASE 5).
      </p>
    </div>
  )
}
