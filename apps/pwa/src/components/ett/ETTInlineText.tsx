/**
 * ETTInlineText — Campo de texto editable inline
 *
 * Se muestra como texto normal con fondo amarillo suave para indicar
 * "esto es editable". Al hacer click se convierte en un input/textarea
 * del tamaño del contenido. Al perder foco vuelve a modo lectura.
 *
 * Diseñado para replicar el documento Word final visualmente:
 * el usuario ve el documento como saldrá impreso, y los slots variables
 * están resaltados en amarillo para saber qué puede modificar.
 */

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export interface ETTInlineTextProps {
  /** Valor actual del campo */
  value: string
  /** Callback al confirmar edición */
  onChange: (newValue: string) => void
  /** Placeholder cuando está vacío */
  placeholder?: string
  /** Si true, permite múltiples líneas (textarea) */
  multiline?: boolean
  /** Estilo del texto renderizado */
  className?: string
  /** Si true, campo de solo lectura (sin highlight amarillo) */
  readOnly?: boolean
  /** Si true, texto en negrita */
  bold?: boolean
}

export function ETTInlineText({
  value,
  onChange,
  placeholder = '[haz click para editar]',
  multiline = false,
  className,
  readOnly = false,
  bold = false,
}: ETTInlineTextProps) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    setLocalValue(value)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select?.()
    }
  }, [editing])

  const commitChange = () => {
    setEditing(false)
    if (localValue !== value) {
      onChange(localValue)
    }
  }

  const cancelEdit = () => {
    setEditing(false)
    setLocalValue(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline && !e.shiftKey) {
      e.preventDefault()
      commitChange()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  if (readOnly) {
    return (
      <span className={cn('text-gray-800', bold && 'font-semibold', className)}>
        {value || <span className="text-gray-400 italic">{placeholder}</span>}
      </span>
    )
  }

  if (editing) {
    const Tag = multiline ? 'textarea' : 'input'
    return (
      <Tag
        ref={inputRef as React.RefObject<HTMLInputElement & HTMLTextAreaElement>}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commitChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={cn(
          'w-full bg-yellow-50 border border-yellow-300 rounded-ctl px-2 py-1',
          'focus:outline-none focus:ring-2 focus:ring-yellow-400',
          'text-gray-900 font-sans text-sm',
          multiline && 'min-h-[60px] resize-y',
          bold && 'font-semibold',
          className,
        )}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        'inline-block bg-yellow-50 hover:bg-yellow-100 border border-yellow-200',
        'rounded-ctl px-1.5 py-0.5 cursor-text transition-colors',
        'text-gray-900',
        bold && 'font-semibold',
        !value && 'text-gray-400 italic',
        className,
      )}
      title="Click para editar"
    >
      {value || placeholder}
    </span>
  )
}
