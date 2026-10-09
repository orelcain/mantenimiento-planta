import { Cpu } from 'lucide-react'

/**
 * ContextoHojaAria — franja bajo el encabezado de ARIA cuando el chat se abre como HOJA desde una
 * herramienta del Centro de aprendizaje («HMI Knuro · N1 · pantalla Principal»). Dice dónde cree
 * ARIA que está el usuario; la consulta precargada queda escrita en el campo, sin enviarse.
 */
export function ContextoHojaAria({ contexto }: { contexto: string }) {
  return (
    <div className="shrink-0 border-b border-border px-4 py-2" data-testid="contexto-hoja-aria">
      <span className="inline-flex min-h-[32px] max-w-full items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-footnote text-muted-foreground">
        <Cpu className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{contexto}</span>
      </span>
    </div>
  )
}
