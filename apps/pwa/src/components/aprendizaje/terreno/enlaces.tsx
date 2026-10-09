/**
 * Piezas chicas compartidas por la referencia de terreno: el enlace a la página del
 * manual, el enlace a una posición del dibujo y el texto con las cifras destacadas.
 *
 * Los dos enlaces son texto en línea pero con 48 px de área táctil: el margen negativo
 * vertical compensa la altura para que la línea no crezca (se usan con guantes).
 */
import { Fragment, type ReactNode } from 'react'
import { FileText } from 'lucide-react'
import { FUENTES, type Fuente } from '@/data/baader200Terreno'
import { cn } from '@/lib/utils'
import { etiquetaFuente, partirCifras, posTexto } from '@/utils/aprendizaje/terreno'

export type AbrirFuente = (fuente: Fuente) => void
export type VerPos = (pos: string[]) => void

const ENLACE =
  'inline-flex min-h-[48px] min-w-[48px] -my-[15px] items-center justify-center gap-1 rounded-ctl align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'

export function FuenteLink({ fuente, onAbrir, etiqueta, className }: {
  fuente: Fuente
  onAbrir: AbrirFuente
  /** Texto alternativo; por defecto «Manual V4 · pág. 10». */
  etiqueta?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(fuente)}
      className={cn(ENLACE, 'text-footnote text-muted-foreground hover:text-foreground', className)}
      aria-label={`Abrir ${FUENTES[fuente.id].titulo}, página ${fuente.pagina}`}
    >
      <FileText aria-hidden className="size-[13px] shrink-0" />
      <span>{etiqueta ?? etiquetaFuente(fuente)}</span>
    </button>
  )
}

export function PosLink({ pos, onVer, className }: { pos: string[]; onVer: VerPos; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onVer(pos)}
      className={cn(ENLACE, 'text-primary hover:opacity-70', className)}
      aria-label={`Ver posición ${pos.join(' y ')} en el dibujo`}
    >
      {pos.some(p => p.includes('.')) ? posTexto(pos) : `pos. ${posTexto(pos)}`}
    </button>
  )
}

/** Texto del manual con las medidas en semibold tabular. */
export function TextoConCifras({ texto }: { texto: string }) {
  return (
    <>
      {partirCifras(texto).map((t, i) =>
        t.cifra ? (
          <b key={i} className="font-semibold tabular-nums">{t.texto}</b>
        ) : (
          <Fragment key={i}>{t.texto}</Fragment>
        ),
      )}
    </>
  )
}

/** Elementos de una línea secundaria separados por « · » (se omiten los vacíos). */
export function ConPuntos({ items }: { items: ReactNode[] }) {
  const visibles = items.filter(it => it !== null && it !== undefined && it !== false && it !== '')
  return (
    <>
      {visibles.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden> · </span>}
          {it}
        </Fragment>
      ))}
    </>
  )
}
