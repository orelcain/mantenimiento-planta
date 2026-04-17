import type { Dispatch, SetStateAction } from 'react'
import { Badge, Button, Input } from '@/components/ui'
import { Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getGradingBelt, GRADING_BELT_DEFAULT_MPS } from '@/services/grader/graderBeltHelpers'
import type { GraderPhysicalConfig } from '@/services/grader/types'

interface DistanciasTabProps {
  physicalConfig: GraderPhysicalConfig
  setPhysicalConfig: Dispatch<SetStateAction<GraderPhysicalConfig>>
  updateFlipperDistance: (gateNumber: number, distanceMeters: number) => void
  setSlowMoModalGate: (gate: number | null) => void
}

export function DistanciasTab({ physicalConfig, setPhysicalConfig, updateFlipperDistance, setSlowMoModalGate }: DistanciasTabProps) {
  const mainBelt = getGradingBelt(physicalConfig)
  const speedMps = mainBelt?.speedMps ?? GRADING_BELT_DEFAULT_MPS
  const z2Vals = physicalConfig.z2ProgrammedDistancesMm ?? []
  const physPositions = physicalConfig.flipperPositions.slice().sort((a, b) => a.gateNumber - b.gateNumber)

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="text-sm font-medium">Distancias de flippers</p>
          <p className="text-xs text-muted-foreground">
            Distancia física desde fotocélula (m) y valor Z2 programado (mm) por gate.
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Δ negativo = Z2 dispara antes (normal)
        </Badge>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }, (_, i) => {
          const gateNum = i + 1
          const fp = physPositions.find((p) => p.gateNumber === gateNum)
          const physDist = fp?.distanceFromSensorMeters ?? 0
          const z2Val = z2Vals[i] ?? null
          const physTimeSec = speedMps > 0 ? physDist / speedMps : 0
          const z2TimeSec = z2Val != null && speedMps > 0 ? z2Val / 1000 / speedMps : null
          const deltaMm = z2Val != null ? z2Val - physDist * 1000 : null
          const isCritical = physTimeSec < 0.8
          const isWarning = physTimeSec >= 0.8 && physTimeSec < 1.2
          return (
            <div
              key={gateNum}
              className={cn(
                'rounded-lg border bg-slate-900/40 p-3 space-y-2',
                isCritical ? 'border-red-500/50 bg-red-500/5' : 'border-slate-700/60',
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Gate {gateNum}</span>
                <div className="flex items-center gap-1">
                  {isCritical && <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Crítico</Badge>}
                  {isWarning && <Badge className="text-[9px] px-1 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Ajustado</Badge>}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setSlowMoModalGate(gateNum)}
                    title="Medir con slow-mo 240fps"
                  >
                    <Camera className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Físico */}
              <div className="space-y-0.5">
                <p className="text-[10px] text-sky-400 font-medium">Físico</p>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={physDist}
                    onChange={(e) => fp && updateFlipperDistance(gateNum, Number(e.target.value))}
                    className="h-6 text-xs font-mono px-1.5 py-0 w-20"
                  />
                  <span className="text-[10px] text-muted-foreground">m</span>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground">
                  {physTimeSec.toFixed(2)} s reacción
                </p>
              </div>

              {/* Z2 */}
              <div className="space-y-0.5 border-t border-slate-700/40 pt-1.5">
                <p className="text-[10px] text-violet-400 font-medium">Z2 programado</p>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="25"
                    min="100"
                    value={z2Val ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const newVals = [...(physicalConfig.z2ProgrammedDistancesMm ?? Array(12).fill(null))]
                      newVals[i] = e.target.value ? Number(e.target.value) : 0
                      setPhysicalConfig((p) => ({ ...p, z2ProgrammedDistancesMm: newVals as number[] }))
                    }}
                    className="h-6 text-xs font-mono px-1.5 py-0 w-20"
                  />
                  <span className="text-[10px] text-muted-foreground">mm</span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-mono text-muted-foreground">
                    {z2TimeSec != null ? `${z2TimeSec.toFixed(2)} s` : '—'}
                  </p>
                  {deltaMm != null && (
                    <p className={cn('text-[10px] font-mono', deltaMm < 0 ? 'text-amber-500' : 'text-muted-foreground')}>
                      {deltaMm > 0 ? '+' : ''}{deltaMm.toFixed(0)} mm
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
