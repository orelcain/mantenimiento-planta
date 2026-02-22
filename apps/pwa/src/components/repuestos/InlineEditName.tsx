import { useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Check, Loader2 } from 'lucide-react'

interface InlineEditNameProps {
  value: string
  onSave: (newValue: string) => Promise<void>
  canEdit: boolean
  /** Extra classes on the outer wrapper */
  className?: string
  /** Extra classes on the text span */
  textClassName?: string
  /** Extra classes on the input in edit mode */
  inputClassName?: string
  /** Placeholder when empty */
  placeholder?: string
}

/**
 * InlineEditName — muestra texto con un lápiz sutil al hacer hover (solo admin).
 * Al hacer clic en el lápiz o doble-clic en el texto, abre inline-input.
 * Enter / blur → guarda.  Escape → cancela.
 */
export function InlineEditName({
  value,
  onSave,
  canEdit,
  className = '',
  textClassName = '',
  inputClassName = '',
  placeholder = '',
}: InlineEditNameProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync external value changes
  useEffect(() => { setDraft(value) }, [value])

  // Auto-focus + select when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = useCallback((e: React.MouseEvent) => {
    if (!canEdit) return
    e.stopPropagation()
    e.preventDefault()
    setDraft(value)
    setEditing(true)
  }, [canEdit, value])

  const cancel = useCallback(() => {
    setEditing(false)
    setDraft(value)
  }, [value])

  const save = useCallback(async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      cancel()
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
    } catch (err) {
      console.error('InlineEditName save error:', err)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, onSave, cancel])

  /* ── Edit mode ── */
  if (editing) {
    return (
      <span
        className={`inline-flex items-center gap-1 ${className}`}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); save() }
            if (e.key === 'Escape') { e.preventDefault(); cancel() }
            e.stopPropagation()
          }}
          onBlur={save}
          onClick={e => e.stopPropagation()}
          disabled={saving}
          className={`
            bg-transparent border-b border-primary outline-none
            text-inherit font-inherit min-w-[40px]
            ${saving ? 'opacity-50' : ''}
            ${inputClassName}
          `}
          style={{ width: `${Math.max(4, draft.length + 1)}ch` }}
        />
        {saving ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
        ) : (
          <Check
            onClick={e => { e.stopPropagation(); save() }}
            className="h-3 w-3 text-primary cursor-pointer shrink-0 hover:scale-110 transition-transform"
          />
        )}
      </span>
    )
  }

  /* ── Display mode ── */
  return (
    <span className={`group/iename inline-flex items-center gap-0.5 ${className}`}>
      <span
        className={textClassName}
        onDoubleClick={startEdit}
        title={canEdit ? 'Doble-clic para editar' : undefined}
      >
        {value || placeholder}
      </span>
      {canEdit && (
        <Pencil
          onClick={startEdit}
          className="h-[0.7em] w-[0.7em] text-muted-foreground/0 group-hover/iename:text-muted-foreground/60 cursor-pointer transition-colors shrink-0 hover:!text-primary"
        />
      )}
    </span>
  )
}
