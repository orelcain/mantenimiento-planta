/**
 * InterventionEditDialog — editar una intervención ya registrada:
 * fecha/hora, tipo de mantención, condición, equipo del área (con buscador),
 * texto, y trazabilidad SAP (aviso + orden de trabajo). Borrar = admin.
 */
import { useEffect, useState } from 'react'
import { Loader2, Trash2, Save, AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Textarea, Badge,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { EquipoCombobox, AREA_LEVEL, type ComboOption } from './EquipoCombobox'
import { updateMaintenanceLogEntry, deleteMaintenanceLogEntry } from '@/services/maintenanceLog'
import type { MaintenanceLogEntry } from '@/types'

type Tipo = 'correctivo' | 'preventivo' | 'predictivo' | 'inspeccion'
type Sev = 'verde' | 'amarillo' | 'rojo'

const TIPOS: { id: Tipo; label: string }[] = [
  { id: 'correctivo', label: 'Correctivo' },
  { id: 'preventivo', label: 'Preventivo' },
  { id: 'predictivo', label: 'Predictivo' },
  { id: 'inspeccion', label: 'Inspección' },
]
const SEVS: { id: Sev; label: string; dot: string; active: string }[] = [
  { id: 'verde', label: 'Cond. 1', dot: 'bg-emerald-500', active: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
  { id: 'amarillo', label: 'Cond. 2', dot: 'bg-amber-500', active: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
  { id: 'rojo', label: 'Cond. 3', dot: 'bg-red-500', active: 'border-red-500/50 bg-red-500/10 text-red-300' },
]

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
function fromLocalInput(s: string): Date {
  const d = new Date(s)
  return isNaN(d.getTime()) ? new Date() : d
}

interface InterventionEditDialogProps {
  entry: MaintenanceLogEntry | null
  plantLineId: string
  equipoOptions: ComboOption[] // incluye la opción "Área general" (id = AREA_LEVEL)
  isAdmin: boolean
  onClose: () => void
  onSaved: () => void
}

export function InterventionEditDialog({
  entry, plantLineId, equipoOptions, isAdmin, onClose, onSaved,
}: InterventionEditDialogProps) {
  const [fecha, setFecha] = useState('')
  const [tipo, setTipo] = useState<Tipo>('correctivo')
  const [severidad, setSeveridad] = useState<Sev>('amarillo')
  const [equipoId, setEquipoId] = useState<string>(AREA_LEVEL)
  const [hallazgo, setHallazgo] = useState('')
  const [sapAviso, setSapAviso] = useState('')
  const [sapOrden, setSapOrden] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reinicializar al abrir/cambiar de entrada.
  useEffect(() => {
    if (!entry) return
    setFecha(toLocalInput(entry.fecha))
    setTipo((['correctivo', 'preventivo', 'predictivo', 'inspeccion'].includes(entry.tipo) ? entry.tipo : 'correctivo') as Tipo)
    setSeveridad(entry.severidad)
    setEquipoId(entry.equipmentId && !entry.equipmentId.startsWith('area:') ? entry.equipmentId : AREA_LEVEL)
    setHallazgo(entry.hallazgo)
    setSapAviso(entry.sapAviso ?? '')
    setSapOrden(entry.sapOrden ?? '')
    setError(null)
  }, [entry])

  const handleSave = async () => {
    if (!entry) return
    if (hallazgo.trim().length < 3) { setError('El detalle no puede quedar vacío.'); return }
    setSaving(true)
    setError(null)
    try {
      const isEquip = equipoId !== AREA_LEVEL
      await updateMaintenanceLogEntry(entry.id, {
        fecha: fromLocalInput(fecha),
        tipo,
        severidad,
        hallazgo: hallazgo.trim(),
        equipmentId: isEquip ? equipoId : `area:${entry.plantLineId || plantLineId}`,
        hierarchyNodeId: isEquip ? equipoId : '',
        sapAviso: sapAviso.trim(),
        sapOrden: sapOrden.trim(),
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!entry || !isAdmin) return
    if (!window.confirm('¿Eliminar esta intervención? No se puede deshacer.')) return
    setDeleting(true)
    try {
      await deleteMaintenanceLogEntry(entry.id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Editar intervención</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Fecha y hora */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Fecha y hora</label>
            <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="text-sm bg-background/60" />
          </div>

          {/* Equipo */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Equipo</label>
            <EquipoCombobox options={equipoOptions} value={equipoId} onChange={setEquipoId} placeholder="Área general / buscar equipo…" />
          </div>

          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Tipo de mantención</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {TIPOS.map((t) => (
                <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                  className={cn('px-2 py-2 rounded-md border text-xs font-medium transition-colors',
                    tipo === t.id ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border bg-background/40 text-muted-foreground hover:bg-muted/40')}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Condición */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">Condición</label>
            <div className="grid grid-cols-3 gap-1.5">
              {SEVS.map((s) => (
                <button key={s.id} type="button" onClick={() => setSeveridad(s.id)}
                  className={cn('flex items-center justify-center gap-1.5 px-2 py-2 rounded-md border text-xs font-medium transition-colors',
                    severidad === s.id ? s.active : 'border-border bg-background/40 text-muted-foreground hover:bg-muted/40')}>
                  <span className={cn('h-2 w-2 rounded-full', s.dot)} />{s.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Estado en que queda u observás el equipo (vale para cualquier tipo · NFPA 70B Cap. 9):
              {' '}🟢 <b>1</b> como nuevo ·{' '}🟡 <b>2</b> con desvíos, requiere seguimiento ·{' '}🔴 <b>3</b> acción correctiva inmediata / fuera de servicio.
            </p>
          </div>

          {/* Detalle */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Detalle</label>
            <Textarea value={hallazgo} onChange={(e) => setHallazgo(e.target.value)} rows={3} className="text-sm bg-background/60 resize-none" />
          </div>

          {/* SAP */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">N° Aviso SAP</label>
              <Input value={sapAviso} onChange={(e) => setSapAviso(e.target.value)} placeholder="ej. 10012345" className="text-sm bg-background/60" inputMode="numeric" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">N° Orden (OT) SAP</label>
              <Input value={sapOrden} onChange={(e) => setSapOrden(e.target.value)} placeholder="ej. 40098765" className="text-sm bg-background/60" inputMode="numeric" />
            </div>
          </div>
          {!sapOrden.trim() && (
            <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">
              SAP pendiente · falta crear la OT
            </Badge>
          )}

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md px-2.5 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {isAdmin ? (
            <Button type="button" variant="ghost" onClick={handleDelete} disabled={deleting || saving}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1.5" />}
              Eliminar
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || deleting}>Cancelar</Button>
            <Button type="button" onClick={handleSave} disabled={saving || deleting} className="bg-primary hover:bg-primary/90">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Guardando…</> : <><Save className="h-4 w-4 mr-1.5" />Guardar</>}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
