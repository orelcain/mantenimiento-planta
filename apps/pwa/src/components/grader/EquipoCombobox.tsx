/**
 * EquipoCombobox — selector de equipo con BUSCADOR (para áreas con muchos equipos,
 * ej. Acopio ~55). Filtra por nombre/código/alias a medida que se escribe.
 * Recibe `options` ya aplanadas (la opción "Área general" se pasa como una más).
 */
import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ComboOption {
  id: string
  label: string
}

/** Valor que representa "a nivel de área" (sin equipo específico). */
export const AREA_LEVEL = '__area__'

interface EquipoComboboxProps {
  options: ComboOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  className?: string
}

export function EquipoCombobox({ options, value, onChange, placeholder, className }: EquipoComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedLabel = options.find((o) => o.id === value)?.label ?? ''

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  const close = () => { setOpen(false); setQuery('') }

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={open ? query : selectedLabel}
          placeholder={placeholder || 'Buscar equipo…'}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setOpen(true); setQuery(e.target.value) }}
          onBlur={() => { blurTimer.current = setTimeout(close, 150) }}
          className="w-full pl-8 pr-8 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      </div>
      {open && (
        <ul className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg py-1">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">Sin coincidencias</li>
          ) : (
            filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  // onMouseDown (no onClick) para seleccionar antes de que el onBlur del input cierre.
                  onMouseDown={(e) => { e.preventDefault(); onChange(o.id); close() }}
                  className={cn(
                    'w-full text-left px-3 py-1.5 text-xs hover:bg-muted/60 flex items-center gap-2',
                    o.id === value && 'text-primary font-medium',
                  )}
                >
                  {o.id === value
                    ? <Check className="h-3 w-3 shrink-0" />
                    : <span className="w-3 shrink-0" />}
                  <span className="break-words">{o.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
