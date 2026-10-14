/**
 * Hoja con las secciones del manual agrupadas por zona de la máquina: el salto largo.
 * El uso normal frente a la máquina es anterior/siguiente; esto es para ir a otra zona.
 * `ListaSecciones` se reutiliza en el buscador cuando no hay texto.
 */
import { Check } from 'lucide-react'
import { INDICE_TERRENO, SECCIONES_TERRENO } from '@/data/baader200Terreno'
import { Sheet } from '@/components/piel'
import { cn } from '@/lib/utils'
import { agruparPorZona } from '@/utils/aprendizaje/terreno'

const DISPONIBLES = new Set(SECCIONES_TERRENO.map(s => s.id))

export function ListaSecciones({ actualId, onElegir }: { actualId?: string; onElegir: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {agruparPorZona(INDICE_TERRENO).map(z => (
        <section key={z.zona}>
          <h3 className="px-4 pb-1 pt-3.5 text-footnote text-muted-foreground">{z.zona}</h3>
          <div className="overflow-hidden rounded-card bg-card shadow-[0_1px_4px_rgba(0,0,0,0.05)] dark:shadow-none">
            {z.entradas.map(e => {
              const disponible = !!e.id && DISPONIBLES.has(e.id)
              const actual = !!e.id && e.id === actualId
              return (
                <button
                  key={e.numero}
                  type="button"
                  disabled={!disponible}
                  aria-current={actual ? 'page' : undefined}
                  onClick={() => e.id && onElegir(e.id)}
                  className={cn(
                    'relative grid min-h-[52px] w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-4 text-left text-body',
                    "before:absolute before:left-[60px] before:right-0 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden",
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                    disponible ? 'hover:bg-accent' : 'cursor-default text-muted-foreground',
                    actual && 'font-semibold text-primary',
                  )}
                >
                  <span className="text-subhead font-normal text-muted-foreground tabular-nums">{e.numero}</span>
                  <span className="min-w-0 truncate">{e.titulo}</span>
                  {actual ? (
                    <Check aria-hidden className="size-4" />
                  ) : !disponible ? (
                    <span className="text-footnote">Pendiente</span>
                  ) : (
                    <span />
                  )}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

export function HojaSecciones({ abierta, onCerrar, actualId, onElegir }: {
  abierta: boolean
  onCerrar: () => void
  actualId?: string
  onElegir: (id: string) => void
}) {
  return (
    <Sheet
      open={abierta}
      onClose={onCerrar}
      title="Secciones"
      description="Manual de ajustes BAADER 200, por zona de la máquina."
    >
      {/* El Sheet no limita su alto: con 13 secciones pasa la pantalla del teléfono. */}
      <div className="-mx-6 max-h-[65dvh] overflow-y-auto bg-background px-2 pb-2">
        <ListaSecciones actualId={actualId} onElegir={id => { onCerrar(); onElegir(id) }} />
      </div>
    </Sheet>
  )
}
