/**
 * «Si falla»: el diagnóstico del manual de planta convertido en lista de chequeo, con el
 * valor de referencia a la derecha. Se revisa en el orden del manual.
 */
import type { Diagnostico } from '@/data/baader200Terreno'
import { ListGroup } from '@/components/piel'
import { FuenteLink, type AbrirFuente } from './enlaces'

export function SiFalla({ diagnostico, onFuente }: { diagnostico: Diagnostico[]; onFuente: AbrirFuente }) {
  if (!diagnostico.length) return null
  return (
    <ListGroup title="Si falla">
      {diagnostico.map((d, i) => (
        <div
          key={i}
          className="relative px-4 py-4 before:absolute before:left-4 before:right-0 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden"
        >
          <h3 className="text-headline">{d.falla}</h3>
          <p className="mt-0.5 text-footnote text-muted-foreground">
            Revisar en este orden · <FuenteLink fuente={d.fuente} onAbrir={onFuente} />
          </p>
          <ol className="mt-2">
            {d.chequeos.map((c, j) => (
              <li key={j} className="flex items-baseline justify-between gap-3 border-t border-border py-2 text-subhead leading-snug">
                <span className="min-w-0">{c.texto}</span>
                {c.valor && (
                  <b className="shrink-0 whitespace-nowrap font-semibold tabular-nums">
                    {c.valor}{c.unidad ? ` ${c.unidad}` : ''}
                  </b>
                )}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </ListGroup>
  )
}
