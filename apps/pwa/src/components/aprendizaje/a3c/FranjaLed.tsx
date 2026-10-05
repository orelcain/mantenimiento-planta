/**
 * «Qué LED prende»: siempre a la vista al elegir un elemento. El número del LED va grande
 * y mono; «Ver» salta a la tarjeta con ese LED encendido.
 */
import { Button } from '@/components/piel'
import { cn } from '@/lib/utils'
import type { LineaLed } from '@/utils/aprendizaje/a3c'

export function FranjaLed({ linea, onVer, className }: { linea: LineaLed; onVer?: () => void; className?: string }) {
  return (
    <div
      className={cn('flex min-h-[60px] items-center gap-3 rounded-card bg-card py-2 pl-4 pr-2', className)}
      data-testid="franja-led"
    >
      <span
        aria-hidden
        className={cn('a3c-foco', !linea.color && 'a3c-apagado', linea.color === 'g' && 'a3c-verde')}
      />
      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="font-mono text-title3 font-semibold leading-tight tabular-nums">{linea.grande}</p>
        <p className="text-footnote leading-snug text-muted-foreground">{linea.texto}</p>
      </div>
      {linea.encendible && onVer && (
        <Button variant="tinted" onClick={onVer} aria-label={`Ver ${linea.grande} en la tarjeta`}>
          Ver
        </Button>
      )}
    </div>
  )
}
