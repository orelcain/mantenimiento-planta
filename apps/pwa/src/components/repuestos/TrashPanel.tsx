/**
 * TrashPanel — Papelera restaurable
 *
 * Modal Dialog que muestra los items eliminados en los últimos 30 días.
 * Permite restaurar (con clave de edición) o eliminar permanentemente.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Trash2,
  RotateCcw,
  X,
  Clock,
  Loader2,
  AlertTriangle,
  Package,
  Layers,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button, Input } from '@/components/ui'
import { getTrashItems, restoreFromTrash, permanentDeleteFromTrash } from '@/services/auditLog'
import { getHmiTooltipPwd } from '@/services/hmiKnuro'
import { useToast } from '@/hooks/useToast'
import { useAuthStore } from '@/store/authStore'
import type { TrashItem } from '@/types/audit'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatRelativeDate(date: Date): string {
  const now = Date.now()
  const diff = now - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `hace ${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours}h`
  const days = Math.floor(hours / 24)
  return `hace ${days}d`
}

function daysUntilExpiry(expiresAt: Date): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000))
}

function collectionIcon(col: string) {
  if (col === 'hierarchy') return Layers
  return Package
}

function collectionLabel(col: string): string {
  if (col === 'hierarchy') return 'Equipo'
  if (col.includes('/repuestos')) return 'Repuesto'
  return col
}

export function TrashPanel({ open, onOpenChange }: Props) {
  const { toast } = useToast()
  const user = useAuthStore(s => s.user)
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<TrashItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TrashItem | null>(null)
  const [clave, setClave] = useState('')
  const [claveError, setClaveError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadItems = useCallback(async () => {
    setLoading(true)
    const data = await getTrashItems({ limit: 100 })
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (open) loadItems()
  }, [open, loadItems])

  // ── Restaurar ──
  const handleRestore = useCallback(async () => {
    if (!restoreTarget || !clave.trim()) return
    setBusy(true)
    setClaveError('')
    try {
      const correctPwd = await getHmiTooltipPwd()
      if (clave.trim() !== correctPwd) {
        setClaveError('Clave incorrecta')
        setBusy(false)
        return
      }

      const result = await restoreFromTrash(
        restoreTarget.id,
        user?.id || '',
        `${user?.nombre || ''} ${user?.apellido || ''}`.trim(),
      )

      if (result.success) {
        toast({ title: 'Restaurado', description: `"${restoreTarget.documentLabel}" ha sido restaurado.`, variant: 'success' })
        setItems(prev => prev.filter(i => i.id !== restoreTarget.id))
      } else {
        toast({ title: 'Error', description: result.error || 'No se pudo restaurar.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Error al restaurar.', variant: 'destructive' })
    }
    setBusy(false)
    setRestoreTarget(null)
    setClave('')
  }, [restoreTarget, clave, user, toast])

  // ── Eliminar permanente ──
  const handlePermanentDelete = useCallback(async () => {
    if (!deleteTarget || !clave.trim()) return
    setBusy(true)
    setClaveError('')
    try {
      const correctPwd = await getHmiTooltipPwd()
      if (clave.trim() !== correctPwd) {
        setClaveError('Clave incorrecta')
        setBusy(false)
        return
      }

      const ok = await permanentDeleteFromTrash(deleteTarget.id)
      if (ok) {
        toast({ title: 'Eliminado', description: 'Se eliminó permanentemente.', variant: 'success' })
        setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      } else {
        toast({ title: 'Error', description: 'No se pudo eliminar.', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Error al eliminar.', variant: 'destructive' })
    }
    setBusy(false)
    setDeleteTarget(null)
    setClave('')
  }, [deleteTarget, clave, toast])

  const activeAction = restoreTarget || deleteTarget

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trash2 className="h-4 w-4" />
            Papelera
            {items.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({items.length} item{items.length !== 1 ? 's' : ''})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ── Lista ── */}
        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-2 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              La papelera está vacía
            </div>
          ) : (
            items.map(item => {
              const Icon = collectionIcon(item.originalCollection)
              const days = daysUntilExpiry(item.expiresAt)
              return (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-card border border-border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.documentLabel}</p>
                    <div className="flex items-center gap-2 text-caption text-muted-foreground mt-0.5">
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-ctl bg-muted text-caption font-medium">
                        {collectionLabel(item.originalCollection)}
                      </span>
                      <span>{item.deletedByName}</span>
                      <span>{formatRelativeDate(item.deletedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1 text-caption mt-1">
                      <Clock className="h-3 w-3" />
                      <span className={days <= 5 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                        {days === 0 ? 'Expira hoy' : `${days} días restantes`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setRestoreTarget(item); setDeleteTarget(null); setClave(''); setClaveError('') }}
                      className="p-1.5 rounded-ctl hover:bg-primary/10 text-primary transition-colors"
                      title="Restaurar"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => { setDeleteTarget(item); setRestoreTarget(null); setClave(''); setClaveError('') }}
                      className="p-1.5 rounded-ctl hover:bg-destructive/10 text-destructive transition-colors"
                      title="Eliminar permanente"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* ── Confirmación con clave ── */}
        {activeAction && (
          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              {restoreTarget ? (
                <>
                  <RotateCcw className="h-4 w-4 text-primary" />
                  <span>Restaurar <strong className="font-medium">{activeAction.documentLabel}</strong></span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span>Eliminar permanentemente <strong className="font-medium">{activeAction.documentLabel}</strong></span>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="Clave de edición"
                value={clave}
                onChange={e => { setClave(e.target.value); setClaveError('') }}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (restoreTarget) handleRestore()
                    else handlePermanentDelete()
                  }
                }}
                className="flex-1 h-8 text-xs"
              />
              <Button
                size="sm"
                variant={restoreTarget ? 'default' : 'destructive'}
                disabled={busy || !clave.trim()}
                onClick={restoreTarget ? handleRestore : handlePermanentDelete}
                className="h-8 text-xs"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : restoreTarget ? 'Restaurar' : 'Eliminar'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setRestoreTarget(null); setDeleteTarget(null); setClave(''); setClaveError('') }}
                className="h-8 text-xs"
              >
                Cancelar
              </Button>
            </div>
            {claveError && <p className="text-xs text-destructive">{claveError}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
