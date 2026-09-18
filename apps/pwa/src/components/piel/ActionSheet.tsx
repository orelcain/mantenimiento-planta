import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * ActionSheet — confirmar una acción que puede perder trabajo, al estilo iOS.
 *
 * Se usa donde NO corresponde una alerta: la alerta interrumpe y se reserva
 * para lo grave (HIG «Alerts»: *"avoid displaying alerts for common, undoable
 * actions"*). Para «vas a descartar lo que escribiste» Apple pide justamente
 * esto (HIG «Sheets»: *"If people have unsaved changes in the sheet when they
 * begin swiping to dismiss it, use an action sheet to let them confirm"*).
 *
 * Reglas del HIG «Action sheets» que están aquí:
 *  - La acción destructiva va ARRIBA y en rojo: *"place these buttons at the
 *    top of the action sheet"*. Así el pulgar no la encuentra por accidente al
 *    ir a «Cancelar», que queda abajo y separada.
 *  - Sin íconos, botones de ancho completo, orden fijo.
 *
 * Va sobre otro `Sheet` (el editor): por eso un `z` mayor y el Escape se
 * intercepta en fase de CAPTURA — si no, el mismo Escape cerraría también la
 * hoja de abajo y se perdería lo que se quería confirmar.
 */
export interface ActionSheetProps {
  open: boolean
  /** Qué está por pasar, en una frase. */
  title: React.ReactNode
  description?: React.ReactNode
  /** Rótulo de la acción destructiva (va arriba, en rojo). */
  confirmLabel: string
  onConfirm: () => void
  /** Rótulo de la salida segura. Por defecto «Cancelar». */
  cancelLabel?: string
  onCancel: () => void
}

export function ActionSheet({ open, title, description, confirmLabel, onConfirm, cancelLabel = 'Cancelar', onCancel }: ActionSheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  const onCancelRef = React.useRef(onCancel)
  onCancelRef.current = onCancel

  React.useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Captura + stopPropagation: el Escape muere aquí y no llega al Sheet de abajo.
      e.stopPropagation()
      onCancelRef.current()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null

  const boton =
    'flex min-h-[52px] w-full items-center justify-center rounded-[22px] px-5 text-body font-semibold ' +
    'transition-[transform,background-color] duration-150 active:scale-[.97] motion-reduce:transition-none ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center p-3">
      <div className="absolute inset-0 bg-black/35 piel-fade-in motion-reduce:animate-none" onClick={onCancel} aria-hidden />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex w-full max-w-[30rem] flex-col gap-2 outline-none',
          'piel-sheet-in motion-reduce:animate-none',
        )}
      >
        <div className="rounded-[26px] bg-card p-4 text-center">
          <p className="text-subhead font-semibold">{title}</p>
          {description && <p className="pt-1 text-footnote text-muted-foreground">{description}</p>}
          <button type="button" onClick={onConfirm} className={cn(boton, 'mt-3 bg-ink-crit/[0.12] text-ink-crit hover:bg-ink-crit/[0.18]')}>
            {confirmLabel}
          </button>
        </div>
        <button type="button" onClick={onCancel} className={cn(boton, 'bg-card text-primary hover:bg-accent')}>
          {cancelLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
