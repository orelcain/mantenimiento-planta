import type { Dispatch, SetStateAction } from 'react'
import { Button, Badge, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import { cn } from '@/lib/utils'
import { computeBeltSpeedFromVfd } from '@/services/grader/graderAnalytics'
import type { GraderPhysicalConfig } from '@/services/grader/types'
import { CalibBadge } from './GatesConfigShared'

interface VerificacionTabProps {
  physicalConfig: GraderPhysicalConfig
  setPhysicalConfig: Dispatch<SetStateAction<GraderPhysicalConfig>>
}

export function VerificacionTab({ physicalConfig, setPhysicalConfig }: VerificacionTabProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-3">
        Cada cinta tiene 4 fuentes posibles. Ingresar mediciones directas (tachómetro) para verificar.
        Diferencia &gt;5% entre fuentes indica drift o error de calibración.
        Seleccionar la fuente más confiable como "verdad" para los cálculos.
      </p>
      {/* Factor k configurable */}
      <div className="flex items-center gap-3 mb-4 p-2.5 rounded-ctl bg-muted border border-border">
        <label className="text-xs text-muted-foreground whitespace-nowrap">
          Factor k (unidades Z2 → m/s)
        </label>
        <input
          type="number"
          step="0.000001"
          min="0.0001"
          max="0.01"
          value={physicalConfig.kFactor ?? 0.000786}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v > 0) {
              setPhysicalConfig((p) => ({ ...p, kFactor: v }))
            }
          }}
          className="w-28 h-7 rounded-ctl border border-input bg-background px-2 text-xs font-mono text-right"
        />
        <span className="text-[10px] text-muted-foreground">
          Default: 0.000786 · Ajustar hasta que Z2 coincida con tachómetro
        </span>
        {(physicalConfig.kFactor ?? 0.000786) !== 0.000786 && (
          <button
            type="button"
            onClick={() => setPhysicalConfig((p) => { const { kFactor: _, ...rest } = p; return rest as typeof p })}
            className="ml-auto text-[10px] text-muted-foreground hover:text-foreground underline"
          >
            Restaurar default
          </button>
        )}
      </div>
      <div className="space-y-4">
        {physicalConfig.belts.map((belt) => {
          const k = physicalConfig.kFactor ?? 0.000786
          const z2Units = belt.z2Units
          const speedFromZ2 = z2Units ? z2Units * k : null
          const speedFromVfd = belt.vfd ? computeBeltSpeedFromVfd(belt.vfd) : null
          const speedFromTachShaft = (belt.vfd?.measuredShaftRpm && belt.vfd?.effectiveMpsPerRpm)
            ? belt.vfd.measuredShaftRpm * belt.vfd.effectiveMpsPerRpm : null
          const speedFromTachLinear = belt.vfd?.measuredBeltMps ?? null
          const truthSource = belt.vfd?.truthSource ?? 'z2'

          // Detectar discrepancias > 5%
          const allSpeeds = [speedFromZ2, speedFromVfd, speedFromTachShaft, speedFromTachLinear]
            .filter((s): s is number => s !== null)
          const maxSpeed = Math.max(...allSpeeds)
          const minSpeed = Math.min(...allSpeeds)
          const discrepancyPct = allSpeeds.length >= 2 ? ((maxSpeed - minSpeed) / minSpeed) * 100 : 0
          const hasDiscrepancy = discrepancyPct > 5

          const applyTruth = (source: typeof truthSource, mps: number | null) => {
            if (!mps) return
            setPhysicalConfig((p) => ({
              ...p,
              belts: p.belts.map((b) => b.beltId === belt.beltId
                ? { ...b, speedMps: Math.round(mps * 1000) / 1000, calibrationStatus: (source === 'tachShaft' || source === 'tachLinear') ? 'verified' as const : 'estimated' as const,
                    vfd: b.vfd ? { ...b.vfd, truthSource: source } : b.vfd }
                : b),
            }))
          }

          return (
            <div key={belt.beltId} className={cn('rounded-card border p-3 text-xs', hasDiscrepancy && 'border-amber-400 bg-amber-500/[0.15]')}>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-medium text-sm">{belt.label}</span>
                {belt.vfd?.label && (
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px]">VFD: {belt.vfd.label}</Badge>
                    <Select
                      value={belt.vfd.assignedBeltId ?? belt.beltId}
                      onValueChange={(v) => setPhysicalConfig((p) => ({
                        ...p,
                        belts: p.belts.map((b) => b.beltId === belt.beltId
                          ? { ...b, vfd: b.vfd ? { ...b.vfd, assignedBeltId: v as 'zeta' | 'accel1' | 'accel2' | 'main' } : b.vfd }
                          : b),
                      }))}>
                      <SelectTrigger className="h-5 text-[10px] w-36 px-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="zeta">Z-Belt (elevadora)</SelectItem>
                        <SelectItem value="accel1">Accel Belt 1</SelectItem>
                        <SelectItem value="accel2">Accel Belt 2</SelectItem>
                        <SelectItem value="main">Grading Belt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {hasDiscrepancy && <Badge className="text-[10px] bg-amber-500/[0.15] text-ink-warn">⚠ Discrepancia {discrepancyPct.toFixed(0)}%</Badge>}
                <span className="ml-auto font-mono font-semibold">{belt.speedMps.toFixed(3)} m/s actual</span>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1 px-2 text-left font-normal">Fuente</th>
                    <th className="py-1 px-2 text-left font-normal">Entrada</th>
                    <th className="py-1 px-2 text-right font-normal">Vel. (m/s)</th>
                    <th className="py-1 px-2 text-right font-normal">Estado</th>
                    <th className="py-1 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {/* Fuente 1: Z2 units */}
                  <tr className={cn('border-b', truthSource === 'z2' && 'bg-green-500/[0.15]')}>
                    <td className="py-1 px-2">Z2 controller</td>
                    <td className="py-1 px-2 font-mono">{z2Units ?? '—'} units × {k.toFixed(6)}</td>
                    <td className="py-1 px-2 text-right font-mono">{speedFromZ2?.toFixed(3) ?? '—'}</td>
                    <td className="py-1 px-2 text-right"><CalibBadge status="estimated" /></td>
                    <td className="py-1 px-2 text-right">
                      <Button size="sm" variant={truthSource === 'z2' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                        onClick={() => applyTruth('z2', speedFromZ2)}>
                        {truthSource === 'z2' ? '✓ Activo' : 'Usar'}
                      </Button>
                    </td>
                  </tr>
                  {/* Fuente 2: VFD RPM */}
                  <tr className={cn('border-b', truthSource === 'vfd' && 'bg-green-500/[0.15]')}>
                    <td className="py-1 px-2">VFD Danfoss</td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1">
                        <Input type="number" step="10" min="0" max="3000"
                          value={belt.vfd?.vfdCurrentRpm ?? ''}
                          placeholder="RPM"
                          onChange={(e) => setPhysicalConfig((p) => ({
                            ...p,
                            belts: p.belts.map((b) => b.beltId === belt.beltId
                              ? { ...b, vfd: b.vfd ? { ...b.vfd, vfdCurrentRpm: e.target.value ? Number(e.target.value) : undefined } : b.vfd }
                              : b),
                          }))}
                          className="h-6 text-[10px] w-20 font-mono" />
                        <span className="text-muted-foreground">RPM</span>
                      </div>
                    </td>
                    <td className="py-1 px-2 text-right font-mono">{speedFromVfd?.toFixed(3) ?? '—'}</td>
                    <td className="py-1 px-2 text-right"><CalibBadge status={belt.vfd?.effectiveStatus} /></td>
                    <td className="py-1 px-2 text-right">
                      <Button size="sm" variant={truthSource === 'vfd' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                        disabled={speedFromVfd === null}
                        onClick={() => applyTruth('vfd', speedFromVfd)}>
                        {truthSource === 'vfd' ? '✓ Activo' : 'Usar'}
                      </Button>
                    </td>
                  </tr>
                  {/* Fuente 3: Tachómetro en eje */}
                  <tr className={cn('border-b', truthSource === 'tachShaft' && 'bg-green-500/[0.15]')}>
                    <td className="py-1 px-2">Tacómetro eje</td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1">
                        <Input type="number" step="1" min="0"
                          value={belt.vfd?.measuredShaftRpm ?? ''}
                          placeholder="RPM eje"
                          onChange={(e) => setPhysicalConfig((p) => ({
                            ...p,
                            belts: p.belts.map((b) => b.beltId === belt.beltId
                              ? { ...b, vfd: b.vfd ? { ...b.vfd, measuredShaftRpm: e.target.value ? Number(e.target.value) : undefined } : b.vfd }
                              : b),
                          }))}
                          className="h-6 text-[10px] w-20 font-mono" />
                        <span className="text-muted-foreground">RPM</span>
                      </div>
                    </td>
                    <td className="py-1 px-2 text-right font-mono">{speedFromTachShaft?.toFixed(3) ?? '—'}</td>
                    <td className="py-1 px-2 text-right"><CalibBadge status={belt.vfd?.measuredShaftRpm ? 'verified' : 'unknown'} /></td>
                    <td className="py-1 px-2 text-right">
                      <Button size="sm" variant={truthSource === 'tachShaft' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                        disabled={speedFromTachShaft === null}
                        onClick={() => applyTruth('tachShaft', speedFromTachShaft)}>
                        {truthSource === 'tachShaft' ? '✓ Activo' : 'Usar'}
                      </Button>
                    </td>
                  </tr>
                  {/* Fuente 4: Tachómetro lineal directo */}
                  <tr className={cn(truthSource === 'tachLinear' && 'bg-green-500/[0.15]')}>
                    <td className="py-1 px-2">Tacómetro lineal</td>
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1">
                        <Input type="number" step="0.01" min="0" max="3"
                          value={belt.vfd?.measuredBeltMps ?? ''}
                          placeholder="m/s"
                          onChange={(e) => setPhysicalConfig((p) => ({
                            ...p,
                            belts: p.belts.map((b) => b.beltId === belt.beltId
                              ? { ...b, vfd: b.vfd ? { ...b.vfd, measuredBeltMps: e.target.value ? Number(e.target.value) : undefined } : b.vfd }
                              : b),
                          }))}
                          className="h-6 text-[10px] w-20 font-mono" />
                        <span className="text-muted-foreground">m/s</span>
                      </div>
                    </td>
                    <td className="py-1 px-2 text-right font-mono">{speedFromTachLinear?.toFixed(3) ?? '—'}</td>
                    <td className="py-1 px-2 text-right"><CalibBadge status={belt.vfd?.measuredBeltMps ? 'verified' : 'unknown'} /></td>
                    <td className="py-1 px-2 text-right">
                      <Button size="sm" variant={truthSource === 'tachLinear' ? 'default' : 'outline'} className="h-6 text-[10px] px-2"
                        disabled={speedFromTachLinear === null}
                        onClick={() => applyTruth('tachLinear', speedFromTachLinear)}>
                        {truthSource === 'tachLinear' ? '✓ Activo' : 'Usar'}
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              {/* Cuando hay tacómetro y VFD: derivar el factor effectiveMpsPerRpm */}
              {belt.vfd?.measuredBeltMps && belt.vfd?.vfdCurrentRpm && (
                <div className="mt-2 p-2 rounded-ctl bg-green-500/[0.15] border border-green-500/[0.25]">
                  <span className="text-xs text-ink-ok font-medium">
                    Factor calibrado: {(belt.vfd.measuredBeltMps / belt.vfd.vfdCurrentRpm).toFixed(6)} m/(s·RPM)
                  </span>
                  <Button size="sm" variant="outline" className="ml-2 h-6 text-[10px] px-2 text-green-700 border-green-400"
                    onClick={() => setPhysicalConfig((p) => ({
                      ...p,
                      belts: p.belts.map((b) => b.beltId === belt.beltId
                        ? { ...b, vfd: b.vfd && b.vfd.measuredBeltMps && b.vfd.vfdCurrentRpm
                            ? { ...b.vfd, effectiveMpsPerRpm: b.vfd.measuredBeltMps / b.vfd.vfdCurrentRpm, effectiveStatus: 'verified' as const }
                            : b.vfd }
                        : b),
                    }))}>
                    Guardar factor ✓
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
