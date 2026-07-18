/**
 * BeltRpmModal — registro de velocidades Danfoss mid-turno.
 *
 * El supervisor ingresa el RPM actual del display de cada variador.
 * La app calcula m/s usando effectiveMpsPerRpm calibrado en Config Física.
 * Guarda un snapshot en beltSpeedHistory del turno (no modifica physicalConfig).
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui'
import { Loader2, AlertTriangle, ArrowRight, Gauge } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/hooks/useToast'
import { getModuleRanges } from '@/services/grader/graderModuleConfig.service'
import { saveShiftBeltSpeeds } from '@/services/grader/graderShifts.service'
import type { GraderPhysicalConfig } from '@/services/grader/types'
import type { GraderShiftDoc } from '@/services/grader/graderShifts.service'

type BeltId = 'zeta' | 'accel1' | 'accel2'

const BELT_LABELS: Record<BeltId, string> = {
  zeta: 'Z-Belt (elevadora)',
  accel1: 'Accel 1',
  accel2: 'Accel 2',
}

const BELT_ORDER: BeltId[] = ['zeta', 'accel1', 'accel2']

/** Calcula m/s desde RPM usando effectiveMpsPerRpm del VFD */
function rpmToMps(
  beltId: BeltId,
  rpm: number,
  physicalConfig: GraderPhysicalConfig | null,
): number | null {
  if (!physicalConfig || rpm <= 0) return null
  const belt = physicalConfig.belts.find(b => b.beltId === beltId)

  // Factor VFD calibrado (preferido)
  const k = belt?.vfd?.effectiveMpsPerRpm
  if (k && k > 0) return rpm * k

  // Fallback Z-belt: fórmula física con zetaDrive
  if (beltId === 'zeta' && physicalConfig.zetaDrive) {
    const { gearRatio, sprocketDiameterMm } = physicalConfig.zetaDrive
    if (gearRatio > 0 && sprocketDiameterMm && sprocketDiameterMm > 0) {
      return (rpm / gearRatio / 60) * Math.PI * (sprocketDiameterMm / 1000)
    }
  }
  return null
}

function isCalibrated(beltId: BeltId, physicalConfig: GraderPhysicalConfig | null): boolean {
  if (!physicalConfig) return false
  const belt = physicalConfig.belts.find(b => b.beltId === beltId)
  if (belt?.vfd?.effectiveMpsPerRpm) return true
  if (beltId === 'zeta') {
    const z = physicalConfig.zetaDrive
    return !!(z?.gearRatio && z.sprocketDiameterMm)
  }
  return false
}

interface BeltRpmModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  shiftDocId: string
  shiftDoc: GraderShiftDoc | null
  plantLineId?: string
}

export function BeltRpmModal({
  open,
  onOpenChange,
  shiftDocId,
  shiftDoc,
  plantLineId,
}: BeltRpmModalProps) {
  const user = useAuthStore(s => s.user)
  const { toast } = useToast()

  const [physicalConfig, setPhysicalConfig] = useState<GraderPhysicalConfig | null>(null)
  const [rpms, setRpms] = useState<Partial<Record<BeltId, string>>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Pre-rellenar desde último registro del turno o desde physicalConfig
  useEffect(() => {
    if (!open) return
    getModuleRanges(plantLineId)
      .then(cfg => {
        if (!cfg?.physicalConfig) return
        setPhysicalConfig(cfg.physicalConfig)

        // Pre-rellenar: última entrada beltSpeedHistory → si no, vfd.vfdCurrentRpm
        const history = shiftDoc?.beltSpeedHistory ?? []
        const lastEntry = history.length > 0 ? history[history.length - 1] : undefined
        const initial: Partial<Record<BeltId, string>> = {}
        for (const beltId of BELT_ORDER) {
          const fromHistory = lastEntry?.belts.find((b: { beltId: string }) => b.beltId === beltId)?.rpm
          if (fromHistory) {
            initial[beltId] = String(fromHistory)
            continue
          }
          const belt = cfg.physicalConfig.belts.find(b => b.beltId === beltId)
          const vfdRpm = belt?.vfd?.vfdCurrentRpm
          if (vfdRpm) initial[beltId] = String(vfdRpm)
          else if (beltId === 'zeta' && cfg.physicalConfig.zetaDrive?.vfdCurrentRpm) {
            initial[beltId] = String(cfg.physicalConfig.zetaDrive.vfdCurrentRpm)
          }
        }
        setRpms(initial)
      })
      .catch(() => {})
  }, [open, shiftDoc, plantLineId])

  function handleClose() {
    setNote('')
    onOpenChange(false)
  }

  const rows = useMemo(() => BELT_ORDER.map(beltId => {
    const rpmStr = rpms[beltId] ?? ''
    const rpm = parseFloat(rpmStr)
    const mps = isNaN(rpm) ? null : rpmToMps(beltId, rpm, physicalConfig)
    const calibrated = isCalibrated(beltId, physicalConfig)
    const belt = physicalConfig?.belts.find(b => b.beltId === beltId)
    const min = belt?.vfd?.vfdMinRpm
    const max = belt?.vfd?.vfdMaxRpm
    const currentSpeedMps = belt?.speedMps

    return { beltId, rpmStr, rpm, mps, calibrated, min, max, currentSpeedMps }
  }), [rpms, physicalConfig])

  const hasAnyRpm = rows.some(r => r.rpm > 0)

  async function handleSave() {
    if (!user || !hasAnyRpm) return
    setSaving(true)
    try {
      const userName = `${user.nombre ?? ''} ${user.apellido ?? ''}`.trim() || user.email
      const belts = rows
        .filter(r => r.rpm > 0 && r.mps !== null)
        .map(r => ({
          beltId: r.beltId,
          rpm: r.rpm,
          calculatedMps: r.mps!,
        }))

      await saveShiftBeltSpeeds(shiftDocId, {
        by: user.id,
        byName: userName,
        belts,
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      toast({
        title: 'Velocidades registradas',
        description: belts.map(b => `${BELT_LABELS[b.beltId as BeltId]}: ${b.rpm} RPM (${b.calculatedMps.toFixed(3)} m/s)`).join(' · '),
      })
      handleClose()
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Gauge className="w-4 h-4 text-muted-foreground" />
            Velocidades Danfoss
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1 text-[11px] text-muted-foreground mb-1">
          Ingresá el RPM que muestra el display de cada variador.
        </div>

        <div className="space-y-3">
          {rows.map(({ beltId, rpmStr, mps, calibrated, min, max, currentSpeedMps }) => (
            <div key={beltId} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">{BELT_LABELS[beltId]}</span>
                {!calibrated && (
                  <span className="flex items-center gap-1 text-[10px] text-amber-400">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Sin factor calibrado
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* RPM input */}
                <div className="flex-1 relative">
                  <input
                    type="number"
                    value={rpmStr}
                    onChange={e => setRpms(prev => ({ ...prev, [beltId]: e.target.value }))}
                    placeholder={min ? `${min}–${max ?? '?'}` : 'RPM'}
                    min={0}
                    max={max ?? 9999}
                    className={cn(
                      'w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
                      'placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring',
                      'tabular-nums',
                    )}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                    RPM
                  </span>
                </div>

                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

                {/* m/s calculado */}
                <div className={cn(
                  'w-24 text-right text-sm tabular-nums rounded-md px-2.5 py-2 border',
                  mps !== null
                    ? 'border-border bg-muted text-foreground'
                    : 'border-border/30 bg-transparent text-muted-foreground/30',
                )}>
                  {mps !== null ? `${mps.toFixed(3)} m/s` : '— m/s'}
                </div>
              </div>

              {/* Referencia: velocidad base calibrada */}
              {currentSpeedMps !== undefined && (
                <p className="text-[10px] text-muted-foreground/50 pl-0.5">
                  Base calibrada: {currentSpeedMps.toFixed(3)} m/s
                  {min && max ? ` · Rango VFD: ${min}–${max} RPM` : ''}
                </p>
              )}

              {!calibrated && (
                <p className="text-[10px] text-amber-400/70 pl-0.5">
                  Calibrá effectiveMpsPerRpm en Config Física → Cintas
                </p>
              )}
            </div>
          ))}

          {/* Nota opcional */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Motivo / nota (opcional)</p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="ej. Bajé velocidad por lote pequeño…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={handleClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!hasAnyRpm || saving}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
            Registrar velocidades
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
