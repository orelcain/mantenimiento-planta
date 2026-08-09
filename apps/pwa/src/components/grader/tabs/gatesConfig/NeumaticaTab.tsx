import type { Dispatch, SetStateAction } from 'react'
import { Input, Label } from '@/components/ui'
import { InfoTooltip } from '@/components/ui'
import { cn } from '@/lib/utils'
import { DEFAULT_PNEUMATIC_CONFIG, computeLinePressureDrop, computeLineChargeTime, computeCylinderStrokeTime } from '@/services/grader/graderGateTiming'
import type { GraderPhysicalConfig, PneumaticConfig } from '@/services/grader/types'
import { getTooltipProps } from '@/services/grader/graderTooltips'
import { CalibBadge } from './GatesConfigShared'

/** Default para inicializar pneumaticConfig cuando no existe */
const DEFAULT_PNEUMATIC_INIT: PneumaticConfig = { ...DEFAULT_PNEUMATIC_CONFIG }

interface NeumaticaTabProps {
  physicalConfig: GraderPhysicalConfig
  setPhysicalConfig: Dispatch<SetStateAction<GraderPhysicalConfig>>
}

export function NeumaticaTab({ physicalConfig, setPhysicalConfig }: NeumaticaTabProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Parámetros del sistema neumático para calcular el tiempo de respuesta real de cada flipper.
        Sin estos datos se usa un valor plano de {(physicalConfig.flipperResetTimeSec ?? 0.45).toFixed(2)}s para todos los gates.
      </p>

      {/* Parámetros del sistema (grid 2×3) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs">Presión FRL (bar)</Label>
            <InfoTooltip {...getTooltipProps('pneum.supplyPressure')} iconSize={11} />
            <CalibBadge status={physicalConfig.pneumaticConfig?.supplyPressureBar ? 'verified' : 'estimated'} />
          </div>
          <Input type="number" step="0.5" min="2" max="10"
            value={physicalConfig.pneumaticConfig?.supplyPressureBar ?? 6.0}
            onChange={(e) => setPhysicalConfig((p) => ({
              ...p,
              pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), supplyPressureBar: Number(e.target.value) },
            }))}
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs">Solenoide (ms)</Label>
            <InfoTooltip {...getTooltipProps('pneum.valveSwitch')} iconSize={11} />
            <CalibBadge status={physicalConfig.pneumaticConfig?.valveSwitchTimeSec ? 'verified' : 'estimated'} />
          </div>
          <Input type="number" step="5" min="5" max="100"
            value={Math.round((physicalConfig.pneumaticConfig?.valveSwitchTimeSec ?? 0.035) * 1000)}
            onChange={(e) => setPhysicalConfig((p) => ({
              ...p,
              pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), valveSwitchTimeSec: Number(e.target.value) / 1000 },
            }))}
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs">Tubo ID (mm)</Label>
            <InfoTooltip {...getTooltipProps('pneum.tubeDiameter')} iconSize={11} />
            <CalibBadge status={physicalConfig.pneumaticConfig?.tubeInnerDiameterMm ? 'verified' : 'estimated'} />
          </div>
          <Input type="number" step="0.5" min="2" max="12"
            value={physicalConfig.pneumaticConfig?.tubeInnerDiameterMm ?? 4}
            onChange={(e) => setPhysicalConfig((p) => ({
              ...p,
              pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), tubeInnerDiameterMm: Number(e.target.value) },
            }))}
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs">Bore cilindro (mm)</Label>
            <InfoTooltip {...getTooltipProps('pneum.cylinderBore')} iconSize={11} />
          </div>
          <Input type="number" step="1" min="10" max="100"
            value={physicalConfig.pneumaticConfig?.cylinderBoreMm ?? 32}
            onChange={(e) => setPhysicalConfig((p) => ({
              ...p,
              pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), cylinderBoreMm: Number(e.target.value) },
            }))}
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs">Carrera (mm)</Label>
            <InfoTooltip {...getTooltipProps('pneum.cylinderStrokeMm')} iconSize={11} />
          </div>
          <Input type="number" step="5" min="10" max="200"
            value={physicalConfig.pneumaticConfig?.cylinderStrokeMm ?? 50}
            onChange={(e) => setPhysicalConfig((p) => ({
              ...p,
              pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), cylinderStrokeMm: Number(e.target.value) },
            }))}
            className="mt-1 font-mono"
          />
        </div>
        <div>
          <div className="flex items-center gap-1">
            <Label className="text-xs">Cv válvula</Label>
            <InfoTooltip {...getTooltipProps('pneum.valveCv')} iconSize={11} />
          </div>
          <Input type="number" step="0.1" min="0.1" max="3"
            value={physicalConfig.pneumaticConfig?.valveCv ?? 0.7}
            onChange={(e) => setPhysicalConfig((p) => ({
              ...p,
              pneumaticConfig: { ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT), valveCv: Number(e.target.value) },
            }))}
            className="mt-1 font-mono"
          />
        </div>
      </div>

      {/* Longitudes de línea por gate */}
      <p className="text-xs font-medium mb-2 flex items-center gap-1">
        Largo de línea neumática por gate
        <InfoTooltip {...getTooltipProps('pneum.lineLengthM')} iconSize={11} />
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1 px-2 w-14">Gate</th>
              <th className="py-1 px-2">Línea (m)</th>
              <th className="py-1 px-2 text-right text-muted-foreground text-xs">t_respuesta</th>
              <th className="py-1 px-2 text-right text-muted-foreground text-xs">P_eff (bar)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((gateNum) => {
              const pneumCfg = physicalConfig.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT
              const lineLen = pneumCfg.gateLineLengthsM[gateNum] ?? (1.5 + gateNum * 1.5)
              // Quick preview calculation
              const pDrop = computeLinePressureDrop(lineLen, pneumCfg.tubeInnerDiameterMm, pneumCfg.supplyPressureBar)
              const pEff = Math.max(pneumCfg.supplyPressureBar - pDrop, 1.0)
              const tLine = computeLineChargeTime(lineLen, pneumCfg.tubeInnerDiameterMm, pneumCfg.supplyPressureBar, pneumCfg.valveCv)
              const tCyl = computeCylinderStrokeTime(pneumCfg.cylinderBoreMm, pneumCfg.cylinderStrokeMm, pEff, pneumCfg.valveCv, pneumCfg.cylinderEfficiency ?? 0.85)
              const tTotal = pneumCfg.valveSwitchTimeSec + tLine + tCyl
              return (
                <tr key={gateNum} className="border-b hover:bg-muted/30">
                  <td className="py-1 px-2 text-center">
                    <span className="inline-flex items-center rounded-ctl border px-1 py-0.5 text-xs">{gateNum}</span>
                  </td>
                  <td className="py-1 px-2">
                    <Input type="number" step="0.5" min="0.5" max="30"
                      value={pneumCfg.gateLineLengthsM[gateNum] ?? (1.5 + gateNum * 1.5)}
                      onChange={(e) => {
                        const val = Number(e.target.value)
                        setPhysicalConfig((p) => ({
                          ...p,
                          pneumaticConfig: {
                            ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT),
                            gateLineLengthsM: {
                              ...(p.pneumaticConfig ?? DEFAULT_PNEUMATIC_INIT).gateLineLengthsM,
                              [gateNum]: val,
                            },
                          },
                        }))
                      }}
                      className="h-7 font-mono text-xs"
                    />
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-muted-foreground font-mono text-xs">
                    {(tTotal * 1000).toFixed(0)}ms
                  </td>
                  <td className={cn('py-1 px-2 text-right tabular-nums font-mono text-xs',
                    pEff >= 5 ? 'text-ink-ok' : pEff >= 3 ? 'text-ink-warn' : 'text-ink-crit',
                  )}>
                    {pEff.toFixed(1)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 italic">
        Medir largo de tubo real desde manifold (bloque de electroválvulas) siguiendo el recorrido del tubo hasta cada flipper.
        Default: estimación lineal (1.5m base + 1.5m × gate).
      </p>
    </div>
  )
}
