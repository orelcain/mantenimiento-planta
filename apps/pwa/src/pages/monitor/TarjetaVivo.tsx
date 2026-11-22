/** La tarjeta de vidrio del Grader en vivo (`v2-tarjeta`): la comparten `GraderVivo` y `SeteoGatesVivo`. */
import { cn } from '@/lib/utils'
import { Icono } from './AmpliarV2'

/** La tarjeta de vidrio del monitor v2 (`v2-tarjeta`, como `Tarjeta` de AmpliarV2): ícono en su círculo, título 15/500, sub 13. */
export function Tarjeta({ titulo, sub, icono, children, className }: { titulo?: string; sub?: string; icono?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('v2-tarjeta min-w-0 rounded-card p-4 lg:p-5', className)}>
      {titulo && (
        <div className="flex min-w-0 items-center gap-2">
          {icono && <Icono>{icono}</Icono>}
          <div className="min-w-0">
            <h3 className="text-[15px] font-medium leading-tight text-foreground">{titulo}</h3>
            {sub && <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{sub}</p>}
          </div>
        </div>
      )}
      {children}
    </section>
  )
}
