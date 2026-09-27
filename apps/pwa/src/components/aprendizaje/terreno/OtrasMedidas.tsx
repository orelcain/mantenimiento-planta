/**
 * «Otras medidas»: columna de valores de 112 px alineada a la derecha, para que el ojo
 * baje por los números sin leer los nombres. Las de «solo anual» llevan el ícono de aviso.
 */
import { AlertTriangle } from 'lucide-react'
import type { Medida } from '@/data/baader200Terreno'
import { ListGroup } from '@/components/piel'
import { ANCLAS } from '@/utils/aprendizaje/terreno'
import { ConPuntos, FuenteLink, PosLink, type AbrirFuente, type VerPos } from './enlaces'

export function OtrasMedidas({ medidas, onVerPos, onFuente }: {
  medidas: Medida[]
  onVerPos: VerPos
  onFuente: AbrirFuente
}) {
  if (!medidas.length) return null
  return (
    <ListGroup title="Otras medidas">
      <ul>
        {medidas.map(m => {
          return (
            <li
              key={m.clave}
              id={ANCLAS.medida(m.clave)}
              className="relative grid min-h-[52px] scroll-mt-4 grid-cols-[112px_minmax(0,1fr)] items-center gap-3 px-4 py-2.5 before:absolute before:left-[140px] before:right-0 before:top-0 before:h-px before:bg-border before:content-[''] first:before:hidden"
            >
              <div className="text-right text-title3 font-semibold leading-tight tabular-nums">
                {m.valores.join(' / ')}
                <span className="text-subhead font-normal text-muted-foreground"> {m.unidad}</span>
              </div>
              <div className="min-w-0">
                <div className="text-subhead leading-snug">
                  {m.soloAnual && (
                    <AlertTriangle aria-label="Solo en mantención anual" className="mr-1 inline size-4 -translate-y-px text-ink-warn" />
                  )}
                  {m.nombre}
                </div>
                <div className="mt-0.5 text-footnote leading-snug text-muted-foreground">
                  <ConPuntos
                    items={[
                      m.pos?.length ? <PosLink key="p" pos={m.pos} onVer={onVerPos} /> : null,
                      m.soloAnual ? 'Solo en mantención anual' : null,
                      m.con ? `Con ${m.con}` : null,
                      <FuenteLink key="f" fuente={m.fuente} onAbrir={onFuente} />,
                    ]}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </ListGroup>
  )
}
