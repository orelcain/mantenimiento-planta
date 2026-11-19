import { useEffect, useRef } from 'react'
import { Search, X } from 'lucide-react'

const ETIQUETA = 'Buscar en bodega: nombre, SAP, fabricante o ubicación'

interface Props {
  valor: string
  onCambio: (valor: string) => void
  esPC: boolean
  /** Apaga el atajo «/» (p. ej. con una pieza abierta). */
  atajoActivo?: boolean
}

export function BuscadorBodega({ valor, onCambio, esPC, atajoActivo = true }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  // Atajo «/» en PC: enfoca la búsqueda salvo que el foco ya esté en un campo o haya un diálogo abierto.
  useEffect(() => {
    if (!esPC || !atajoActivo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      const activo = document.activeElement as HTMLElement | null
      if (activo?.matches?.('input, textarea, select, [contenteditable]')) return
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return
      e.preventDefault()
      ref.current?.focus()
      ref.current?.select()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [esPC, atajoActivo])

  const borrar = () => {
    onCambio('')
    ref.current?.focus()
  }

  const input = (
    <input
      ref={ref}
      type="search"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && valor) {
          e.preventDefault()
          borrar()
        }
      }}
      placeholder={esPC ? undefined : 'Buscar en bodega'}
      aria-label={ETIQUETA}
      aria-keyshortcuts={esPC ? '/' : undefined}
      className="min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
    />
  )

  if (esPC) {
    return (
      <div className="flex h-[48px] items-center gap-3 rounded-[22px] border border-border bg-card pl-4 pr-2.5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] focus-within:ring-2 focus-within:ring-primary/40 dark:shadow-none">
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="relative flex h-full min-w-0 flex-1 items-center">
          {!valor && (
            <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center truncate text-body text-muted-foreground">
              <b className="font-semibold text-foreground">Buscar en bodega</b>: nombre, SAP, fabricante o ubicación
            </span>
          )}
          {input}
        </div>
        {valor ? (
          <button
            type="button"
            onClick={borrar}
            aria-label="Borrar búsqueda"
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : (
          <kbd className="shrink-0 rounded-[6px] border border-border px-1.5 text-footnote font-semibold text-muted-foreground">
            /
          </kbd>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-[44px] items-center gap-2 rounded-full bg-muted px-3.5">
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      {input}
      {valor && (
        <button
          type="button"
          onClick={borrar}
          aria-label="Borrar búsqueda"
          className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  )
}
