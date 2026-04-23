/**
 * Diálogo para anotar y ajustar manualmente una pausa del Timeline.
 *
 * Flujo:
 *   1. Admin clickea una banda de pausa en `ShiftTimelineView`.
 *   2. Se abre este diálogo con: info de la pausa + grid de tags + ajuste de rango.
 *   3a. Admin selecciona tag → "Guardar" dispara `updatePauseAnnotation`.
 *   3b. Admin ajusta inicio/fin con botones ±1/±5 min → "Guardar rango" dispara
 *       `updatePauseRange`. Ambas acciones son independientes.
 *   4. Callback `onSaved` refresca las pausas en el parent.
 *
 * **Convención de timestamps**: los ISO strings de las pausas llevan sufijo `Z`
 * pero representan hora local de la planta (no UTC real). Para mostrar y editar
 * siempre usamos getUTCHours/Minutes — igual que `fmtTime` en ShiftTimelineView.
 */
import { useEffect, useState, useCallback } from 'react'
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
import { Loader2, Clock, History, ChevronDown } from 'lucide-react'
import type { Pause, PauseHistoryEntry } from '@/services/grader/types'
import { updatePauseAnnotation, updatePauseRange, loadPauseHistory } from '@/services/grader/graderDailySummary.service'
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

/** Muestra HH:MM de un ISO usando UTC (= hora local planta). */
function fmtHHMM(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Ajusta un ISO string ±deltaMin manteniendo la convención Z-planta. */
function shiftMinutes(iso: string, deltaMin: number): string {
  const d = new Date(iso)
  d.setUTCMinutes(d.getUTCMinutes() + deltaMin)
  return d.toISOString()
}

/** Duración legible: "X h Y min" o "X min". */
function fmtDuration(sec: number): string {
  const totalMin = Math.round(sec / 60)
  if (totalMin < 60) return `${totalMin} min`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return m > 0 ? `${h} h ${m} min` : `${h} h`
}

/** Formatea un ISO a "dd/MM HH:MM" en UTC-planta. */
function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mn = String(d.getUTCMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${mn}`
}

const ACTION_LABEL: Record<PauseHistoryEntry['action'], string> = {
  tag: 'Tag asignado',
  clear_tag: 'Tag eliminado',
  range: 'Rango ajustado',
}

/** Fila del historial de cambios de una pausa. */
function HistoryRow({ entry }: { entry: PauseHistoryEntry }) {
  const label = ACTION_LABEL[entry.action]
  const detail = (() => {
    if (entry.action === 'tag') {
      const parts: string[] = []
      if (entry.diff.tag) {
        const old = entry.diff.tag.old ? `«${entry.diff.tag.old}»` : '–'
        parts.push(`${old} → «${entry.diff.tag.new ?? '–'}»`)
      }
      if (entry.diff.note?.new) parts.push(`nota: "${entry.diff.note.new}"`)
      return parts.join(', ')
    }
    if (entry.action === 'clear_tag') {
      return entry.diff.tag?.old ? `«${entry.diff.tag.old}» eliminado` : 'tag eliminado'
    }
    if (entry.action === 'range') {
      const s = entry.diff.startAt ? `${fmtHHMM(entry.diff.startAt.old)} → ${fmtHHMM(entry.diff.startAt.new)}` : ''
      const e = entry.diff.endAt ? `${fmtHHMM(entry.diff.endAt.old)} → ${fmtHHMM(entry.diff.endAt.new)}` : ''
      return [s, e].filter(Boolean).join(' | fin: ')
    }
    return ''
  })()

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-muted-foreground shrink-0 tabular-nums">{fmtDateTime(entry.changedAt)}</span>
      <div className="min-w-0">
        <span className="font-medium text-foreground">{label}</span>
        {detail && <span className="text-muted-foreground"> · {detail}</span>}
        <span className="text-muted-foreground/60 ml-1">({entry.changedBy.split('@')[0] ?? entry.changedBy})</span>
      </div>
    </div>
  )
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

  // — Tag / nota —
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // — Ajuste de rango —
  const [editedStart, setEditedStart] = useState('')
  const [editedEnd, setEditedEnd] = useState('')
  const [savingRange, setSavingRange] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)
  const [rangeSaved, setRangeSaved] = useState(false)

  // — M13: Historial de cambios —
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<PauseHistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Duración calculada desde los valores editados
  const editedDurationSec = editedStart && editedEnd
    ? Math.round((Date.parse(editedEnd) - Date.parse(editedStart)) / 1000)
    : 0
  const rangeChanged = pause
    ? editedStart !== pause.startAt || editedEnd !== pause.endAt
    : false

  // Inicializar estado cuando cambia la pausa abierta.
  useEffect(() => {
    if (!pause) return
    setSelectedTagId(pause.tag ?? pause.autoTag ?? null)
    setNote(pause.note ?? '')
    setError(null)
    setEditedStart(pause.startAt)
    setEditedEnd(pause.endAt)
    setRangeError(null)
    setRangeSaved(false)
    setHistoryOpen(false)
    setHistoryEntries([])
  }, [pause])

  // M13 — Carga lazy del historial al abrir el acordeón.
  useEffect(() => {
    if (!historyOpen || !pause || !summaryId) return
    setHistoryLoading(true)
    loadPauseHistory(summaryId, pause.id)
      .then(setHistoryEntries)
      .catch(() => setHistoryEntries([]))
      .finally(() => setHistoryLoading(false))
  }, [historyOpen, pause, summaryId])

  const adjustStart = useCallback((deltaMin: number) => {
    setEditedStart(prev => shiftMinutes(prev, deltaMin))
    setRangeSaved(false)
    setRangeError(null)
  }, [])

  const adjustEnd = useCallback((deltaMin: number) => {
    setEditedEnd(prev => shiftMinutes(prev, deltaMin))
    setRangeSaved(false)
    setRangeError(null)
  }, [])

  // M5 — Atajos de teclado (antes del guard para cumplir rules-of-hooks)
  // · 1-9 : selecciona tag por posición en la lista
  // · ← / →  : ajusta inicio −1/+1 min   (Shift = ±5 min)
  // · ↑ / ↓  : ajusta fin   −1/+1 min   (Shift = ±5 min)
  useEffect(() => {
    if (!open || !pause) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      // 1-9: elegir tag (sin Ctrl/Meta para no pisar atajos del OS)
      if (!e.ctrlKey && !e.metaKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const tag = tags[parseInt(e.key) - 1]
        if (tag) setSelectedTagId(tag.id)
        return
      }
      if (saving || savingRange) return
      // Flechas: ← → = inicio, ↑ ↓ = fin; Shift multiplica por 5
      const delta = e.shiftKey ? 5 : 1
      if      (e.key === 'ArrowLeft')  { e.preventDefault(); adjustStart(-delta) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); adjustStart(delta) }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); adjustEnd(-delta) }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); adjustEnd(delta) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, pause, saving, savingRange, tags, adjustStart, adjustEnd])

  if (!pause) return null

  const isAutoTag = !pause.tag && !!pause.autoTag
  const tierLabel = { pausa: 'Pausa', larga: 'Pausa larga', parada: 'Parada' }[pause.tier]

  // — Handlers —
  const handleSaveTag = async () => {
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

  const handleSaveRange = async () => {
    setRangeError(null)
    if (editedDurationSec < 60) {
      setRangeError('La pausa debe durar al menos 1 minuto')
      return
    }
    setSavingRange(true)
    try {
      await updatePauseRange(summaryId, pause.id, {
        startAt: editedStart,
        endAt: editedEnd,
        adjustedBy: adminUid,
      })
      setRangeSaved(true)
      onSaved?.()
    } catch (err) {
      setRangeError(err instanceof Error ? err.message : 'Error al guardar rango')
    } finally {
      setSavingRange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Clasificar pausa</DialogTitle>
          <DialogDescription asChild>
            <div>
              <span className="font-medium text-foreground">{tierLabel}</span>
              <span className="text-muted-foreground"> · {fmtHHMM(pause.startAt)} – {fmtHHMM(pause.endAt)} · </span>
              <span className="font-medium text-foreground">{fmtDuration(pause.durationSec)}</span>
              {isAutoTag && (
                <span className="block text-xs text-amber-400 mt-1">
                  Tag sugerido por el sistema — confírmalo o cámbialo
                </span>
              )}
              {/* M4: chip trazabilidad rango ajustado */}
              {pause.adjustedBy && (
                <span className="inline-flex items-center gap-1 text-xs text-sky-400 mt-1">
                  ✏ Rango ajustado por <span className="font-medium">{pause.adjustedBy}</span>
                </span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 py-1 min-h-0">

          {/* ── Sección: Tag ── */}
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
                    style={isSelected ? { borderColor: tag.color, backgroundColor: tag.bandFill } : undefined}
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

          {/* ── Nota ── */}
          <div className="space-y-2">
            <Label htmlFor="pause-note">Nota (opcional)</Label>
            <Textarea
              id="pause-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Detalle del evento, causa, responsable…"
              rows={2}
              disabled={saving}
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* ── Sección: Ajustar rango ── */}
          <div className="border border-border/40 rounded-md p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Ajustar rango detectado
            </div>

            {/* Inicio */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Inicio</p>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-semibold w-12 text-center tabular-nums">
                  {fmtHHMM(editedStart)}
                </span>
                {([[-5, '−5'], [-1, '−1'], [1, '+1'], [5, '+5']] as const).map(([delta, label]) => (
                  <Button
                    key={delta}
                    size="sm"
                    variant="outline"
                    className="h-7 w-9 text-xs p-0 font-mono"
                    onClick={() => adjustStart(delta)}
                    disabled={saving || savingRange}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Fin */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Fin</p>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-sm font-semibold w-12 text-center tabular-nums">
                  {fmtHHMM(editedEnd)}
                </span>
                {([[-5, '−5'], [-1, '−1'], [1, '+1'], [5, '+5']] as const).map(([delta, label]) => (
                  <Button
                    key={delta}
                    size="sm"
                    variant="outline"
                    className="h-7 w-9 text-xs p-0 font-mono"
                    onClick={() => adjustEnd(delta)}
                    disabled={saving || savingRange}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Duración live */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Duración: <span className={cn('font-medium', editedDurationSec < 60 ? 'text-red-400' : 'text-foreground')}>
                  {editedDurationSec > 0 ? fmtDuration(editedDurationSec) : '—'}
                </span>
              </span>
              {rangeChanged && !rangeSaved && (
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs gap-1"
                  onClick={handleSaveRange}
                  disabled={savingRange || editedDurationSec < 60}
                >
                  {savingRange
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : null}
                  Guardar rango
                </Button>
              )}
              {rangeSaved && (
                <span className="text-xs text-emerald-400">✓ Rango guardado</span>
              )}
            </div>

            {rangeError && <p className="text-xs text-red-400">{rangeError}</p>}
          </div>

          {/* ── M13: Historial de cambios ── */}
          <div className="border border-border/40 rounded-md overflow-hidden">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              <span className="flex-1 text-left">Historial de cambios</span>
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', historyOpen && 'rotate-180')} />
            </button>
            {historyOpen && (
              <div className="border-t border-border/40 px-3 py-2 space-y-2 max-h-48 overflow-y-auto">
                {historyLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Cargando…
                  </div>
                ) : historyEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">Sin cambios registrados aún.</p>
                ) : (
                  historyEntries.map((entry, idx) => (
                    <HistoryRow key={idx} entry={entry} />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border/40 sm:justify-between">
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
              onClick={handleSaveTag}
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
