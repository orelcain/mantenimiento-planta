/**
 * Botón "Cambiar gate" + su modal.
 *
 * Reemplaza a `QuickGateChangeButton`, que mantenía un SEGUNDO formulario para
 * escribir exactamente el mismo snapshot que `GateChangeModal`. Los dos se
 * fueron desincronizando: el que se borró leía los calibres de una constante
 * hardcodeada, mientras el modal los lee de la config real del módulo
 * (`getModuleRanges`). Un solo formulario, un solo comportamiento.
 *
 * Solo admin: registrar un cambio de gate reescribe cómo se clasifican las
 * piezas posteriores del turno.
 */

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useIsAdmin } from '@/store'
import { GateChangeModal } from './modals/GateChangeModal'
import type { GateConfigSnapshot } from '@/services/grader/graderConfigSnapshot.service'

interface Props {
  /** ID del turno: `${dateKey}__${shiftId}` */
  shiftDocId: string
  /** Snapshots ya cargados; si no vienen, el modal carga el último solo. */
  configSnapshots?: GateConfigSnapshot[]
  onSaved?: () => void
  /** compact = botón chico para header de tarjeta */
  variant?: 'default' | 'compact'
  className?: string
  triggerLabel?: string
  /** Si false, el botón queda deshabilitado (ej. turno ya cerrado) */
  allowEdit?: boolean
  plantLineId?: string
  /** Pre-relleno al abrir (ej. desde una sugerencia de swap de calibres). */
  initialGate?: number
  initialCalibre?: string
  initialQuality?: string
  initialReason?: string
}

export function GateChangeTrigger({
  shiftDocId,
  configSnapshots,
  onSaved,
  variant = 'default',
  className,
  triggerLabel,
  allowEdit = true,
  plantLineId,
  initialGate,
  initialCalibre,
  initialQuality,
  initialReason,
}: Props) {
  const isAdmin = useIsAdmin()
  const [open, setOpen] = useState(false)

  if (!isAdmin) return null

  const compact = variant === 'compact'

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!allowEdit}
        title={allowEdit ? 'Registrar un cambio de gate' : 'El turno ya está cerrado'}
        className={cn(compact && 'h-7 text-xs px-2', 'gap-1.5', className)}
      >
        <Settings2 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
        {triggerLabel ?? 'Cambiar gate'}
      </Button>

      <GateChangeModal
        open={open}
        onOpenChange={setOpen}
        shiftDocId={shiftDocId}
        configSnapshots={configSnapshots}
        onSaved={() => { setOpen(false); onSaved?.() }}
        plantLineId={plantLineId}
        initialGate={initialGate}
        initialCalibre={initialCalibre}
        initialQuality={initialQuality}
        initialReason={initialReason}
      />
    </>
  )
}
