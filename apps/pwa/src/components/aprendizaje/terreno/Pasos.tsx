/**
 * Pasos del ajuste, numerados, con el aviso «solo anual» arriba (antes de que alguien
 * suelte los pernos que no debe). Las medidas del texto van destacadas.
 */
import { AlertTriangle } from 'lucide-react'
import type { Advertencia, Paso } from '@/data/baader200Terreno'
import { ListGroup } from '@/components/piel'
import { cn } from '@/lib/utils'
import { ANCLAS } from '@/utils/aprendizaje/terreno'
import { ConPuntos, FuenteLink, PosLink, TextoConCifras, type AbrirFuente, type VerPos } from './enlaces'

const TITULO_AVISO: Record<Advertencia['tipo'], string> = {
  soloAnual: 'Solo en la mantención anual',
  seguridad: 'Seguridad',
  atencion: 'Atención',
}

export function Pasos({ pasos, advertencias, onVerPos, onFuente }: {
  pasos: Paso[]
  advertencias: Advertencia[]
  onVerPos: VerPos
  onFuente: AbrirFuente
}) {
  if (!pasos.length && !advertencias.length) return null
  return (
    <ListGroup title="Pasos">
      {advertencias.map((a, i) => (
        <div key={i} className="grid grid-cols-[24px_minmax(0,1fr)] gap-2.5 px-4 py-3.5">
          <AlertTriangle aria-hidden className="size-[22px] text-ink-warn" />
          <div className="text-subhead leading-snug">
            <strong className="block text-headline">
              {a.pos?.length ? `Pos. ${a.pos.join('·')}: ` : ''}{TITULO_AVISO[a.tipo].toLowerCase()}
            </strong>
            {a.texto}
            <div className="mt-1.5">
              <FuenteLink fuente={a.fuente} onAbrir={onFuente} />
            </div>
          </div>
        </div>
      ))}
      <ol>
        {pasos.map((p, i) => (
          <li
            key={i}
            id={ANCLAS.paso(i)}
            className={cn(
              "relative grid scroll-mt-4 grid-cols-[28px_minmax(0,1fr)] gap-2.5 px-4 py-3 before:absolute before:right-0 before:top-0 before:h-px before:bg-border before:content-['']",
              // El aviso va arriba del paso 1: la línea lo separa, insetada desde el borde.
              i === 0 ? (advertencias.length ? 'before:left-4' : 'before:hidden') : 'before:left-[54px]',
            )}
          >
            <span aria-hidden className="pt-px text-subhead font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-body leading-snug">
                <TextoConCifras texto={p.texto} />
              </p>
              <p className="mt-1.5 text-footnote text-muted-foreground">
                <ConPuntos
                  items={[
                    p.pos?.length ? <PosLink key="p" pos={p.pos} onVer={onVerPos} /> : null,
                    <FuenteLink key="f" fuente={p.fuente} onAbrir={onFuente} />,
                  ]}
                />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </ListGroup>
  )
}
