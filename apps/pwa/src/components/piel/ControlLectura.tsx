/**
 * Controles del modo lectura global (ver `lib/modoLectura.ts`).
 *
 * - `ControlLectura`: fila «Modo lectura» con interruptor, debajo de Día · Noche · Auto
 *   en el menú de usuario. 48 px de alto, como el selector de intensidad.
 * - `BotonLectura`: ícono al lado del Sol/Luna del encabezado, para alternarlo de un toque.
 *
 * La capa solo actúa con la piel Apple: con la piel antigua (`?skin=default`) no se muestran.
 */
import { BookOpen } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useModoLectura } from '@/hooks/useModoLectura'
import { usePielApple } from '@/hooks/usePielApple'
import { cn } from '@/lib/utils'

export function ControlLectura() {
  const apple = usePielApple()
  const { lectura, setModoLectura } = useModoLectura()
  if (!apple) return null
  return (
    <label className="flex h-12 cursor-pointer items-center justify-between gap-3 border-b border-border px-4 text-footnote">
      <span className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        Modo lectura
      </span>
      <Switch checked={lectura} onCheckedChange={setModoLectura} aria-label="Modo lectura" />
    </label>
  )
}

export function BotonLectura({ className, iconClassName = 'h-4 w-4' }: { className?: string; iconClassName?: string }) {
  const apple = usePielApple()
  const { lectura, alternar } = useModoLectura()
  if (!apple) return null
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={lectura}
      title={lectura ? 'Salir del modo lectura' : 'Modo lectura'}
      aria-label="Modo lectura"
      className={cn(
        'rounded-card p-1.5 transition-colors hover:bg-muted',
        lectura ? 'text-brand-ink' : 'text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      <BookOpen className={iconClassName} />
    </button>
  )
}
