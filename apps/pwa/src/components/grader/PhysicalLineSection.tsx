/**
 * PhysicalLineSection — configuración física de la línea Grader (base de planta).
 * Self-contained: carga, edita y guarda physicalConfig desde Firestore.
 * Montado dentro de GlobalSettingsModal como tab "Línea física".
 *
 * Separación: estos parámetros cambian solo en mantenciones/recalibraciones.
 * Las velocidades operacionales RPM mid-turno viven en ShiftConfigPanel (por turno).
 */
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui'
import { Save, Loader2 } from 'lucide-react'
import { getModuleRanges, saveModulePhysicalConfig } from '@/services/grader/graderModuleConfig.service'
import { DEFAULT_PHYSICAL_CONFIG } from '@/services/grader/graderAnalytics'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/store/authStore'
import type { GraderPhysicalConfig } from '@/services/grader/types'
import type { GraderBeltId } from '@/services/grader/graderBeltHelpers'
import { CintasTab } from './tabs/gatesConfig/CintasTab'
import { DistanciasTab } from './tabs/gatesConfig/DistanciasTab'
import { DanfossTab } from './tabs/gatesConfig/DanfossTab'
import { NeumaticaTab } from './tabs/gatesConfig/NeumaticaTab'
import { VerificacionTab } from './tabs/gatesConfig/VerificacionTab'
import { TachMeasurementModal } from './modals/TachMeasurementModal'
import { SlowMoMeasurementModal } from './modals/SlowMoMeasurementModal'

type SubTab = 'cintas' | 'distancias' | 'danfoss' | 'neumatica' | 'verificacion'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'cintas',       label: 'Cintas' },
  { id: 'distancias',   label: 'Distancias' },
  { id: 'danfoss',      label: 'Danfoss' },
  { id: 'neumatica',    label: 'Neumática' },
  { id: 'verificacion', label: 'Verificación' },
]

interface Props {
  plantLineId?: string
}

export function PhysicalLineSection({ plantLineId }: Props = {}) {
  const { toast } = useToast()
  const user = useAuthStore(s => s.user)
  const [physicalConfig, setPhysicalConfig] = useState<GraderPhysicalConfig>(DEFAULT_PHYSICAL_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [subTab, setSubTab] = useState<SubTab>('cintas')
  const [tachModalBelt, setTachModalBelt] = useState<GraderBeltId | null>(null)
  const [slowMoModalGate, setSlowMoModalGate] = useState<number | null>(null)

  useEffect(() => {
    setLoading(true)
    getModuleRanges(plantLineId)
      .then(cfg => { if (cfg?.physicalConfig) setPhysicalConfig(cfg.physicalConfig) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [plantLineId])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await saveModulePhysicalConfig({
        physicalConfig,
        updatedBy: user?.id ?? 'unknown',
        plantLineId,
      })
      toast({ title: 'Config física guardada' })
    } catch {
      toast({ title: 'Error al guardar', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }, [physicalConfig, user, toast, plantLineId])

  const updateBeltLength = useCallback((beltId: string, lengthMeters: number) => {
    setPhysicalConfig(p => ({
      ...p,
      belts: p.belts.map(b => b.beltId === beltId ? { ...b, lengthMeters } : b),
    }))
  }, [])

  const updateBeltSpeed = useCallback((beltId: string, speedMps: number) => {
    setPhysicalConfig(p => ({
      ...p,
      belts: p.belts.map(b => b.beltId === beltId ? { ...b, speedMps } : b),
    }))
  }, [])

  const updateFlipperDistance = useCallback((gateNumber: number, distanceMeters: number) => {
    setPhysicalConfig(p => ({
      ...p,
      flipperPositions: p.flipperPositions.map(fp =>
        fp.gateNumber === gateNumber ? { ...fp, distanceFromSensorMeters: distanceMeters } : fp,
      ),
    }))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Cargando configuración física…
      </div>
    )
  }

  const tachBelt = tachModalBelt ? physicalConfig.belts.find(b => b.beltId === tachModalBelt) : null

  return (
    <div className="space-y-3">
      {/* Sub-tab nav + botón guardar */}
      <div className="flex items-center gap-1 flex-wrap border-b pb-2">
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              subTab === t.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving}
          className="ml-auto h-7 text-xs gap-1"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Guardar
        </Button>
      </div>

      {/* Contenido del sub-tab */}
      <div className="overflow-y-auto max-h-[420px] pr-1">
        {subTab === 'cintas' && (
          <CintasTab
            physicalConfig={physicalConfig}
            updateBeltLength={updateBeltLength}
            updateBeltSpeed={updateBeltSpeed}
            setTachModalBelt={setTachModalBelt}
          />
        )}
        {subTab === 'distancias' && (
          <DistanciasTab
            physicalConfig={physicalConfig}
            setPhysicalConfig={setPhysicalConfig}
            updateFlipperDistance={updateFlipperDistance}
            setSlowMoModalGate={setSlowMoModalGate}
          />
        )}
        {subTab === 'danfoss' && (
          <DanfossTab
            physicalConfig={physicalConfig}
            setPhysicalConfig={setPhysicalConfig}
          />
        )}
        {subTab === 'neumatica' && (
          <NeumaticaTab
            physicalConfig={physicalConfig}
            setPhysicalConfig={setPhysicalConfig}
          />
        )}
        {subTab === 'verificacion' && (
          <VerificacionTab
            physicalConfig={physicalConfig}
            setPhysicalConfig={setPhysicalConfig}
          />
        )}
      </div>

      {/* Modal tachómetro SKF */}
      {tachModalBelt && tachBelt && (
        <TachMeasurementModal
          open
          onOpenChange={(open) => { if (!open) setTachModalBelt(null) }}
          beltId={tachModalBelt}
          currentSpeedMps={tachBelt.speedMps}
          effectiveMpsPerRpm={tachBelt.vfd?.effectiveMpsPerRpm}
          applyPatchBuilder={(beltMps, measuredAt) => ({
            belts: physicalConfig.belts.map(b =>
              b.beltId === tachModalBelt
                ? {
                    ...b,
                    speedMps: beltMps,
                    calibrationStatus: 'verified' as const,
                    vfd: b.vfd ? { ...b.vfd, measuredBeltMps: beltMps, measuredAt } : b.vfd,
                  }
                : b,
            ),
          })}
          onApply={(patch) => {
            if (patch.belts) {
              setPhysicalConfig(p => ({
                ...p,
                belts: p.belts.map(b => {
                  const pb = (patch.belts ?? []).find(x => x.beltId === b.beltId)
                  return pb ? { ...b, ...pb } : b
                }),
              }))
            }
            setTachModalBelt(null)
          }}
        />
      )}

      {/* Modal slow-mo distancias */}
      {slowMoModalGate !== null && (
        <SlowMoMeasurementModal
          open
          onOpenChange={(open) => { if (!open) setSlowMoModalGate(null) }}
          gateNumber={slowMoModalGate}
          currentResetSec={physicalConfig.flipperMechanicalResetS}
          onApply={(seconds) => {
            setPhysicalConfig(p => ({ ...p, flipperMechanicalResetS: seconds }))
            setSlowMoModalGate(null)
          }}
        />
      )}
    </div>
  )
}
