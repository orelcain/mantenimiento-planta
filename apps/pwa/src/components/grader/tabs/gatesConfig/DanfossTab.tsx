import type { Dispatch, SetStateAction } from 'react'
import { Button, Input } from '@/components/ui'
import { computeZetaBeltSpeedMps, estimateZetaThroughput } from '@/services/grader/graderAnalytics'
import type { GraderPhysicalConfig } from '@/services/grader/types'
import { CalibBadge } from './GatesConfigShared'

interface DanfossTabProps {
  physicalConfig: GraderPhysicalConfig
  setPhysicalConfig: Dispatch<SetStateAction<GraderPhysicalConfig>>
}

export function DanfossTab({ physicalConfig, setPhysicalConfig }: DanfossTabProps) {
  if (!physicalConfig.zetaDrive) return null

  const drive = physicalConfig.zetaDrive
  const computed = computeZetaBeltSpeedMps(drive)
  const throughput = estimateZetaThroughput(computed ?? 0, physicalConfig.avgFishSpacingOnZetaBeltM)

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Calcula velocidad real desde el setpoint RPM del variador.
        Formula: v = (RPM / {drive.gearRatio} / 60) × π × (sprocket_mm / 1000)
      </p>
      <div className="space-y-3">
        {/* Datos fijos del motor */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-muted/30 rounded p-2">
            <p className="text-muted-foreground">Motor</p>
            <p className="font-mono font-medium">{drive.motorKw} kW · {drive.motorNominalRpm} RPM</p>
            <CalibBadge status="verified" />
          </div>
          <div className="bg-muted/30 rounded p-2">
            <p className="text-muted-foreground">Reducción</p>
            <p className="font-mono font-medium">i = {drive.gearRatio}:1</p>
            <CalibBadge status="verified" />
          </div>
          <div className="bg-muted/30 rounded p-2">
            <p className="text-muted-foreground">Rango VFD</p>
            <p className="font-mono font-medium">{drive.vfdMinRpm}–{drive.vfdMaxRpm} RPM</p>
            <CalibBadge status="estimated" />
          </div>
        </div>
        {/* Campos a ingresar */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs w-44 shrink-0">
              Diámetro sprocket (mm)
              <span className="block text-muted-foreground">MEDIR con calibre en polea motriz</span>
            </label>
            <Input
              type="number" step="1" min="50" max="300"
              value={drive.sprocketDiameterMm ?? ''}
              placeholder="~120 (derivado teórico)"
              onChange={(e) => setPhysicalConfig((p) => ({
                ...p,
                zetaDrive: { ...(p.zetaDrive ?? drive), sprocketDiameterMm: e.target.value ? Number(e.target.value) : undefined },
              }))}
              className="h-8 text-xs w-32 font-mono"
            />
            <CalibBadge status={drive.sprocketDiameterMm ? 'verified' : 'unknown'} />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs w-44 shrink-0">
              Setpoint variador (RPM)
              <span className="block text-muted-foreground">Leer del display Danfoss al inicio turno</span>
            </label>
            <Input
              type="number" step="10"
              min={drive.vfdMinRpm ?? 1000} max={drive.vfdMaxRpm ?? 2000}
              value={drive.vfdCurrentRpm ?? ''}
              placeholder={`ref: ${drive.motorNominalRpm}`}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : undefined
                setPhysicalConfig((p) => ({
                  ...p,
                  zetaDrive: { ...(p.zetaDrive ?? drive), vfdCurrentRpm: v },
                }))
              }}
              className="h-8 text-xs w-32 font-mono"
            />
            <span className="text-xs text-muted-foreground">rango {drive.vfdMinRpm}–{drive.vfdMaxRpm} RPM</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs w-44 shrink-0">
              Espaciado peces en Z-Belt (m)
              <span className="block text-muted-foreground">MEDIR: distancia centro a centro</span>
            </label>
            <Input
              type="number" step="0.05" min="0.1"
              value={physicalConfig.avgFishSpacingOnZetaBeltM ?? ''}
              placeholder="ej: 1.0"
              onChange={(e) => setPhysicalConfig((p) => ({
                ...p,
                avgFishSpacingOnZetaBeltM: e.target.value ? Number(e.target.value) : undefined,
              }))}
              className="h-8 text-xs w-32 font-mono"
            />
            <CalibBadge status={physicalConfig.avgFishSpacingOnZetaBeltM ? 'verified' : 'unknown'} />
          </div>
        </div>
        {/* Resultado calculado */}
        {computed !== null ? (
          <div className="bg-primary/5 border border-primary/20 rounded p-3 text-sm space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-muted-foreground">@ {drive.vfdCurrentRpm ?? drive.motorNominalRpm} RPM →</span>
              <span className="font-mono font-semibold text-primary">{computed.toFixed(3)} m/s</span>
              {throughput !== null && (
                <span className="text-xs text-muted-foreground">· ~{throughput.toFixed(0)} pz/min</span>
              )}
            </div>
            <Button
              size="sm" variant="outline" className="text-xs h-7"
              onClick={() => setPhysicalConfig((p) => ({
                ...p,
                belts: p.belts.map((b) =>
                  b.beltId === 'zeta' ? { ...b, speedMps: Math.round(computed * 1000) / 1000, calibrationStatus: 'verified' as const } : b,
                ),
              }))}
            >
              Aplicar como velocidad Z-Belt ✓
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Ingresa el diámetro del sprocket para calcular velocidad desde RPM.
          </p>
        )}
      </div>
    </div>
  )
}
