/**
 * InsumoDetailModal — Ficha completa de insumo
 *
 * Muestra info del catálogo SAP + stock real + ubicaciones.
 * Permite editar campos editables: stockMinimo, observaciones, status.
 */

import { useState, useCallback, useEffect } from 'react'
import { X, Package, MapPin, Warehouse, Hash, Tag, ClipboardList, Save } from 'lucide-react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { Dialog, DialogContent, Badge, Button, Input, Textarea, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui'
import {
  type Insumo, type InsumoStatus,
  INSUMO_FAMILIA_LABEL, INSUMO_STATUS_LABEL,
} from '@/types/insumos'
import { logger } from '@/lib/logger'
import { useAuthStore } from '@/store/authStore'

interface Props {
  insumo: Insumo
  open: boolean
  onClose: () => void
  onUpdated?: (updated: Partial<Insumo>) => void
}

export function InsumoDetailModal({ insumo, open, onClose, onUpdated }: Props) {
  const { user } = useAuthStore()
  const isEditor = user?.rol === 'admin' || user?.rol === 'supervisor'

  const [stockMinimo, setStockMinimo] = useState<string>(insumo.stockMinimo?.toString() ?? '')
  const [observaciones, setObservaciones] = useState<string>(insumo.observaciones ?? '')
  const [status, setStatus] = useState<InsumoStatus>(insumo.status)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    setStockMinimo(insumo.stockMinimo?.toString() ?? '')
    setObservaciones(insumo.observaciones ?? '')
    setStatus(insumo.status)
    setDirty(false)
  }, [insumo])

  const markDirty = useCallback(() => setDirty(true), [])

  const handleSave = useCallback(async () => {
    if (!isEditor || !dirty || saving) return
    setSaving(true)
    try {
      const minN = stockMinimo.trim() === '' ? null : Number(stockMinimo)
      const patch: Partial<Insumo> = {
        stockMinimo: Number.isFinite(minN as number) ? (minN as number) : null,
        observaciones: observaciones.trim() || null,
        status,
        updatedAt: serverTimestamp() as never,
      }
      await updateDoc(doc(db, 'insumos', insumo.id), patch)
      onUpdated?.(patch)
      setDirty(false)
    } catch (e) {
      logger.error('insumo.update.error', e as Error)
    } finally {
      setSaving(false)
    }
  }, [isEditor, dirty, saving, stockMinimo, observaciones, status, insumo.id, onUpdated])

  const stockBajoMin =
    insumo.stockFisico != null &&
    insumo.stockMinimo != null &&
    insumo.stockFisico < insumo.stockMinimo

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-border">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
              <code className="text-sm font-mono font-semibold text-primary">{insumo.codigoSAP}</code>
              <Badge variant={status === 'activo' ? 'default' : status === 'obsoleto' ? 'destructive' : 'secondary'}>
                {INSUMO_STATUS_LABEL[status]}
              </Badge>
              {insumo.existeEnRepuestos && (
                <Badge variant="outline" className="text-xs">también en Repuestos</Badge>
              )}
              {stockBajoMin && (
                <Badge variant="destructive" className="text-xs">Bajo mínimo</Badge>
              )}
            </div>
            <h2 className="text-lg font-semibold mt-2 leading-tight">{insumo.textoBreve}</h2>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center shrink-0"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Info read-only — origen Excel */}
        <div className="grid grid-cols-2 gap-3 py-3 text-sm">
          <Field icon={<Tag className="h-3.5 w-3.5" />} label="Familia" value={INSUMO_FAMILIA_LABEL[insumo.familia]} />
          <Field icon={<Tag className="h-3.5 w-3.5" />} label="Sub-familia" value={insumo.subFamilia ?? '—'} />
          <Field icon={<MapPin className="h-3.5 w-3.5" />} label="Ubicación catálogo" value={insumo.ubicacion ?? '—'} mono />
          <Field icon={<Warehouse className="h-3.5 w-3.5" />} label="Ubicación física" value={insumo.ubicacionFisica ?? '—'} />
          <Field icon={<Package className="h-3.5 w-3.5" />} label="Almacén" value={insumo.almacen ?? '—'} mono />
          <Field icon={<Package className="h-3.5 w-3.5" />} label="Unidad" value={insumo.unidadMedida ?? '—'} mono />
        </div>

        {/* Stock */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Warehouse className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Stock</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Stock físico (Excel)</label>
              <div className="text-lg font-semibold mt-1">
                {insumo.stockFisico != null ? insumo.stockFisico : <span className="text-muted-foreground text-sm">sin registro</span>}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Stock mínimo</label>
              <Input
                type="number"
                min={0}
                step="any"
                value={stockMinimo}
                onChange={(e) => { setStockMinimo(e.target.value); markDirty() }}
                disabled={!isEditor}
                placeholder="—"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Status (editable) */}
        {isEditor && (
          <div className="border-t border-border pt-3">
            <label className="text-xs text-muted-foreground mb-1 block">Estado</label>
            <Select value={status} onValueChange={(v) => { setStatus(v as InsumoStatus); markDirty() }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="activo">Activo</SelectItem>
                <SelectItem value="obsoleto">Obsoleto</SelectItem>
                <SelectItem value="trasladar">Trasladar</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Observaciones */}
        <div className="border-t border-border pt-3">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Observaciones</h3>
          </div>
          <Textarea
            value={observaciones}
            onChange={(e) => { setObservaciones(e.target.value); markDirty() }}
            disabled={!isEditor}
            rows={3}
            placeholder={isEditor ? 'Notas, alternativas, equivalentes…' : 'Sin observaciones'}
          />
        </div>

        {/* Footer */}
        {isEditor && (
          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cerrar</Button>
            <Button onClick={handleSave} disabled={!dirty || saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="text-muted-foreground mt-1 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-sm truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
      </div>
    </div>
  )
}
