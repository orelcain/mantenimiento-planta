/**
 * Diálogo para anotar manualmente una pausa del Timeline (Fase 3).
 *
 * Flujo:
 *   1. Admin clickea una banda de pausa en `ShiftTimelineView`.
 *   2. Se abre este diálogo con: info de la pausa (read-only) + grid de
 *      tags + textarea para nota.
 *   3. Admin selecciona tag → "Guardar" dispara `updatePauseAnnotation`.
 *   4. Callback `onSaved` refresca las pausas en el parent.
 *
 * Un tag previo ya aplicado viene pre-seleccionado. Botón "Quitar tag" lo
 * limpia (sin borrar la pausa — vuelve a estado "sin clasificar").
 */
import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  Button,
  Textarea,
  Label,
} from '@/components/ui'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { Pause } from '@/services/grader/types'
import { updatePauseAnnotation } from '@/services/grader/graderDailySummary.service'
import { usePauseTags } from '@/hooks/usePauseTags'

interface PauseAnnotationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pause: Pause | null
  summaryId: string
  /** UID del admin que anota (se persiste en `annotatedBy`). */
  adminUid: string
  /** Callback después de guardar exitosamente — el parent debería refrescar pauses. */
  onSaved?: () => void
}

function formatHHMM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export function PauseAnnotationDialog({
  open,
  onOpenChange,
  pause,
  summaryId,
  adminUid,
  onSaved,
}: PauseAnnotationDialogProps) {
  const { tags } = usePauseTags()
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Inicializar estado cuando cambia la pausa abierta.
  useEffect(() => {
    if (!pause) return
    setSelectedTagId(pause.tag ?? pause.autoTag ?? null)
    setNote(pause.note ?? '')
    setError(null)
  }, [pause])

  if (!pause) return null

  const durationMin = Math.round(pause.durationSec / 60)
  const isAutoTag = !pause.tag && !!pause.autoTag

  const handleSave = async () => {
    if (!selectedTagId) return
    setSaving(true)
    setError(null)
    try {
      await updatePauseAnnotation(summaryId, pause.id, {
        tagId: selectedTagId,
        note,
        annotatedBy: adminUid,
      })
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleClearTag = async () => {
    setSaving(true)
    setError(null)
    try {
      await updatePauseAnnotation(summaryId, pause.id, {
        tagId: null,
        annotatedBy: adminUid,
      })
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const tierLabel = {
    pausa: 'Pausa',
    larga: 'Pausa larga',
    parada: 'Parada',
  }[pause.tier]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clasificar pausa</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{tierLabel}</span>
            <span className="text-muted-foreground"> · {formatHHMM(pause.startAt)} – {formatHHMM(pause.endAt)} · </span>
            <span className="font-medium text-foreground">{durationMin} min</span>
            {isAutoTag && (
              <span className="block text-xs text-amber-400 mt-1">
                Tag sugerido por el sistema — confírmalo o cámbialo
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {tags.map((tag) => {
                const isSelected = selectedTagId === tag.id
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => setSelectedTagId(tag.id)}
                    disabled={saving}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-md border text-sm text-left transition-colors',
                      'hover:bg-muted/40',
                      isSelected ? 'border-2' : 'border',
                      isSelected ? '' : 'border-border/60',
                    )}
                    style={
                      isSelected
                        ? { borderColor: tag.color, backgroundColor: tag.bandFill }
                        : undefined
                    }
                  >
                    <span className="text-lg leading-none">{tag.emoji}</span>
                    <span className={cn('flex-1', isSelected && 'font-medium')} style={isSelected ? { color: tag.color } : undefined}>
                      {tag.label}
                    </span>
                    {isSelected && (
                      <span className="text-xs font-medium" style={{ color: tag.color }}>✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pause-note">Nota (opcional)</Label>
            <Textarea
              id="pause-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detalle del evento, causa, responsable…"
              rows={3}
              disabled={saving}
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {pause.tag && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearTag}
                disabled={saving}
                className="text-muted-foreground hover:text-red-400"
              >
                Quitar tag
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !selectedTagId}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

