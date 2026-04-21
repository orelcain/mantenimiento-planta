/**
 * Botón rápido para registrar un cambio de gate dentro de un turno.
 *
 * Diseñado para que el supervisor (admin) pueda registrar lo que control
 * de producción acaba de cambiar por radio en menos de 10 segundos:
 *
 *   1. Click "Cambiar gate"
 *   2. Selecciona gate # + nuevo calibre + calidad (+ producto/conservación opc)
 *   3. Guardar → crea un GateConfigSnapshot con timestamp = now() y
 *      changedBy = usuario actual.
 *
 * El snapshot luego es usado por:
 *   - ShiftTimelineView para marcar verticalmente el momento del cambio.
 *   - classifyPiece (cliente) para clasificar piezas posteriores con la
 *     nueva config de gates.
 *   - Análisis segmentado IA (Fase C, futuro) para comparar P0% antes/después.
 *
 * Solo visible para usuarios con rol admin.
 */

import { useEffect, useRef, useState } from 'react'
import { Settings2, Save, Loader2, AlertCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button, Input, Label } from '@/components/ui'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useAuthStore, useIsAdmin } from '@/store'
import { useToast } from '@/hooks/useToast'
import { saveConfigSnapshot, getLatestSnapshot } from '@/services/grader/graderConfigSnapshot.service'
import { CALIBRE_WEIGHT_RANGES } from '@/services/grader/graderAnalytics'
import type { GateAssignment, GraderQuality, GraderConservation, GraderProduct } from '@/services/grader/types'

const QUALITIES: GraderQuality[] = ['Premium', 'Grado', 'Industrial', 'D']
const CONSERVATIONS: GraderConservation[] = ['CONGELADO', 'FRESCO', 'OTRO']
const PRODUCTS: GraderProduct[] = ['HG', 'DESTINO FILETE', 'OTRO']

interface QuickGateChangeButtonProps {
  /** ID del turno: `${dateKey}__${shiftId}` */
  shiftDocId: string
  /** Tamaño del botón. compact = botón chico para tarjeta de turno */
  variant?: 'default' | 'compact'
  className?: string
  /** Callback tras guardar exitosamente (para refrescar lista de cambios) */
  onSaved?: () => void
  /** Valores iniciales para pre-rellenar desde una sugerencia externa */
  initialGate?: number
  initialCalibre?: string
  initialQuality?: string
  initialReason?: string
  /** Etiqueta personalizada del botón disparador */
  triggerLabel?: string
  /** Si false, el botón queda deshabilitado (ej. turno ya cerrado) */
  allowEdit?: boolean
}

export function QuickGateChangeButton({
  shiftDocId,
  variant = 'default',
  className,
  onSaved,
  initialGate,
  initialCalibre,
  initialQuality,
  initialReason,
  triggerLabel,
  allowEdit = true,
}: QuickGateChangeButtonProps) {
  const isAdmin = useIsAdmin()
  const user = useAuthStore(s => s.user)
  const { toast } = useToast()

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [latestGates, setLatestGates] = useState<GateAssignment[] | null>(null)
  const [noChangeWarning, setNoChangeWarning] = useState(false)

  const [gateNumber, setGateNumber] = useState(initialGate ?? 1)
  const [calibre, setCalibre] = useState<string>(initialCalibre ?? CALIBRE_WEIGHT_RANGES[0]?.calibre ?? '4-6 lb')
  const [quality, setQuality] = useState<GraderQuality>((initialQuality as GraderQuality) ?? 'Premium')
  const [conservation, setConservation] = useState<GraderConservation | ''>('')
  const [product, setProduct] = useState<GraderProduct | ''>('')
  const [active, setActive] = useState(true)
  const [reason, setReason] = useState(initialReason ?? '')

  // Indica que el próximo disparo del auto-fill (cuando llegan latestGates)
  // no debe sobreescribir los valores que vinieron de una sugerencia externa.
  const skipNextAutoFill = useRef(false)

  // Al abrir: aplicar valores iniciales si vienen de una sugerencia
  useEffect(() => {
    if (!open) return
    setNoChangeWarning(false)
    getLatestSnapshot(shiftDocId)
      .then(snap => setLatestGates(snap?.gates ?? null))
      .catch(() => setLatestGates(null))

    if (initialGate !== undefined) {
      setGateNumber(initialGate)
      skipNextAutoFill.current = true  // no sobreescribir con config actual del gate
    }
    if (initialCalibre) setCalibre(initialCalibre)
    if (initialQuality) setQuality(initialQuality as GraderQuality)
    if (initialReason !== undefined) setReason(initialReason)
  }, [open, shiftDocId, initialGate, initialCalibre, initialQuality, initialReason])

  // Limpiar warning si el user toca cualquier campo
  useEffect(() => { setNoChangeWarning(false) }, [gateNumber, calibre, quality, conservation, product, active])

  // Auto-fill con valores actuales del gate cuando cambia la selección.
  // Se omite la primera vez si venimos de una sugerencia (skipNextAutoFill).
  useEffect(() => {
    if (!latestGates) return
    if (skipNextAutoFill.current) {
      skipNextAutoFill.current = false
      return
    }
    const current = latestGates.find(g => g.gateNumber === gateNumber)
    if (!current) return
    setCalibre(current.assignedCalibre)
    setQuality(current.assignedQuality)
    setConservation(current.assignedConservation ?? '')
    setProduct(current.assignedProduct ?? '')
    setActive(current.active)
  }, [gateNumber, latestGates])

  if (!isAdmin) return null

  async function handleSubmit() {
    if (!user) return
    setLoading(true)
    try {
      // Construir snapshot completo: usar last snapshot como base, o 12 gates default
      const baseGates: GateAssignment[] = latestGates ?? Array.from({ length: 12 }, (_, i) => ({
        gateNumber: i + 1,
        assignedCalibre: '4-6 lb',
        assignedQuality: 'Premium' as GraderQuality,
        active: false,
      }))

      const newGates: GateAssignment[] = baseGates.map(g => g.gateNumber === gateNumber ? {
        gateNumber,
        assignedCalibre: calibre,
        assignedQuality: quality,
        ...(conservation ? { assignedConservation: conservation as GraderConservation } : {}),
        ...(product ? { assignedProduct: product as GraderProduct } : {}),
        active,
      } : g)

      const userName = `${user.nombre}${user.apellido ? ' ' + user.apellido : ''}`.trim() || user.email
      const saved = await saveConfigSnapshot(
        shiftDocId,
        newGates,
        { uid: user.id, name: userName },
        reason.trim() || undefined,
      )

      if (saved === null) {
        // No cerrar el dialog — mostrar warning inline para que el user
        // entienda que tiene que cambiar al menos un valor.
        setNoChangeWarning(true)
      } else {
        toast({
          title: 'Cambio registrado',
          description: `Gate ${gateNumber} → ${calibre} · ${quality}${active ? '' : ' (desactivada)'}`,
        })
        onSaved?.()
        setOpen(false)
        setReason('')
      }
    } catch (err) {
      toast({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'No se pudo registrar el cambio',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button
        size={variant === 'compact' ? 'sm' : 'default'}
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={!allowEdit}
        className={className}
        title={!allowEdit ? 'Solo se pueden registrar cambios en un turno en vivo' : undefined}
      >
        <Settings2 className={variant === 'compact' ? 'w-3 h-3 mr-1' : 'w-4 h-4 mr-1.5'} />
        {triggerLabel ?? (variant === 'compact' ? 'Cambiar gate' : 'Registrar cambio de gate')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar cambio de gate</DialogTitle>
            <DialogDescription>
              Quedará marcado en el timeline del turno con tu nombre y el momento exacto.
              Las próximas piezas que entren se clasificarán con esta configuración.
            </DialogDescription>
          </DialogHeader>

          {noChangeWarning && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-300">Configuración idéntica al último snapshot</p>
                <p className="text-amber-200/80 mt-0.5">
                  Cambiá al menos un valor (calibre, calidad, conservación, producto o estado activa)
                  para registrar un nuevo cambio. El motivo solo no cuenta como cambio.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Gate # (1-12)</Label>
              <Select value={String(gateNumber)} onValueChange={(v) => setGateNumber(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
                    <SelectItem key={n} value={String(n)}>Gate {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Calibre asignado</Label>
              <Select value={calibre} onValueChange={setCalibre}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CALIBRE_WEIGHT_RANGES.map(r => (
                    <SelectItem key={r.calibre} value={r.calibre}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Calidad asignada</Label>
              <Select value={quality} onValueChange={(v) => setQuality(v as GraderQuality)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUALITIES.map(q => (
                    <SelectItem key={q} value={q}>{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Conservación</Label>
                <Select
                  value={conservation || '__none__'}
                  onValueChange={(v) => setConservation(v === '__none__' ? '' : (v as GraderConservation))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sin definir —</SelectItem>
                    {CONSERVATIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Producto</Label>
                <Select
                  value={product || '__none__'}
                  onValueChange={(v) => setProduct(v === '__none__' ? '' : (v as GraderProduct))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— sin definir —</SelectItem>
                    {PRODUCTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id={`active-check-${shiftDocId}`}
                checked={active}
                onChange={e => setActive(e.target.checked)}
                className="w-4 h-4 cursor-pointer accent-primary"
              />
              <Label htmlFor={`active-check-${shiftDocId}`} className="text-xs cursor-pointer">
                Gate activa (recibe piezas)
              </Label>
            </div>

            <div>
              <Label className="text-xs">Motivo (opcional)</Label>
              <Input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="ej. control producción cambió por exceso de Premium"
                className="text-xs"
                maxLength={120}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading
                ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                : <Save className="w-4 h-4 mr-1.5" />}
              Guardar cambio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
