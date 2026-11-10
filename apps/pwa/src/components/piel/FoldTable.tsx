/**
 * FoldTable — tabla «bordered» con filas que se pliegan.
 *
 * Forma (informe Apple, dirección A): marco fino de 1 px, encabezado con banda
 * tenue, filetes horizontales, ningún borde vertical y una fila de cierre con
 * filete de 2 px en tinta. Sin cajas dentro de cajas: la tabla ES la caja.
 *
 * `lectura`: la forma del modo lectura (ver `Lectura.tsx`). Sin marco ni banda:
 * solo filetes, cuerpo de lectura y rótulos de 13 px. La primera columna pega al
 * borde izquierdo; las demás, a la derecha con 12 px de aire.
 *
 * Plegado: una fila con `detail` se abre al tocarla. El botón real va en la
 * primera celda (teclado: Enter/Espacio), con `aria-expanded` y `aria-controls`.
 * El detalle NO se desmonta al cerrarse: queda con `hidden`, como Disclosure.
 *
 * Sin `detail` la fila es estática (p. ej. «Por qué se detuvo»).
 */
import { Fragment, useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { LECTURA_CUERPO, LECTURA_NOTA } from './Lectura'

export interface FoldTableColumn {
  id: string
  label: string
  align?: 'left' | 'right'
  /** Solo en PC (lg): en el celular la columna no se dibuja. */
  soloPC?: boolean
}

export interface FoldTableRow {
  id: string
  cells: ReactNode[]
  /** Contenido que se abre al tocar la fila. Sin él, la fila es estática. */
  detail?: ReactNode
  /** Peso 600 en toda la fila (p. ej. la fila de Mantención). */
  destacada?: boolean
  /** Tinta crítica en toda la fila (la máquina que más pierde). */
  critica?: boolean
}

export interface FoldTableProps {
  /** Nombre accesible de la tabla (no se muestra). */
  caption: string
  columns: readonly FoldTableColumn[]
  rows: readonly FoldTableRow[]
  /** Fila de cierre: filete de 2 px en tinta encima. */
  cierre?: FoldTableRow
  /** Texto de 13 px debajo del marco. */
  nota?: ReactNode
  /** Forma del modo lectura: sin marco ni banda, solo filetes. */
  lectura?: boolean
  className?: string
}

export function FoldTable({ caption, columns, rows, cierre, nota, lectura = false, className }: FoldTableProps) {
  const base = useId()
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(() => new Set())
  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const alinear = (i: number) => (columns[i]?.align === 'right' ? 'text-right' : 'text-left')
  const soloPC = (i: number) => (columns[i]?.soloPC ? 'hidden lg:table-cell' : '')
  const celda = (i: number) => (lectura
    ? cn('py-[11px] lg:py-[9px] pl-2.5 lg:pl-3 first:pl-0 align-baseline', i > 0 && 'whitespace-nowrap')
    : 'px-2.5 py-2 align-middle')

  return (
    <div className={cn(lectura ? 'space-y-0' : 'space-y-2', className)}>
      <div className={lectura ? '' : 'overflow-hidden rounded-ctl border border-border'}>
        <table className={cn('w-full border-collapse tabular-nums', lectura ? LECTURA_CUERPO : 'text-subhead')}>
          <caption className="sr-only">{caption}</caption>
          <thead className={lectura ? '' : 'bg-muted/50 text-footnote text-muted-foreground'}>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn(
                    lectura
                      ? cn(LECTURA_NOTA, 'py-1.5 pl-2.5 lg:pl-3 first:pl-0 font-normal whitespace-nowrap')
                      : 'border-b border-border px-2.5 py-2 font-normal',
                    alinear(i),
                    soloPC(i),
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const abierta = abiertas.has(r.id)
              const plegable = r.detail !== undefined
              const idDetalle = `${base}-${r.id}-detalle`
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={plegable ? () => alternar(r.id) : undefined}
                    className={cn(
                      lectura ? 'border-t border-border' : 'h-11 border-b border-border',
                      plegable && 'cursor-pointer',
                      r.critica && 'text-ink-crit',
                    )}
                  >
                    {r.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={cn(celda(i), alinear(i), soloPC(i), r.destacada && 'font-semibold')}
                      >
                        {i === 0 && plegable ? (
                          <button
                            type="button"
                            aria-expanded={abierta}
                            aria-controls={idDetalle}
                            className="block w-full rounded-ctl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            {cell}
                          </button>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                  {plegable && (
                    <tr id={idDetalle} hidden={!abierta} className={lectura ? '' : 'border-b border-border'}>
                      <td colSpan={columns.length} className={cn(lectura ? 'pb-3 pt-0' : 'px-2.5 pb-3 pt-1', 'text-footnote text-muted-foreground')}>
                        {r.detail}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {cierre && (
              <tr className={lectura ? 'border-t-[1.5px] border-foreground font-semibold' : 'h-11 border-t-2 border-foreground'}>
                {cierre.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn(celda(i), alinear(i), soloPC(i), cierre.destacada && 'font-semibold')}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {nota && <div className={lectura ? cn(LECTURA_NOTA, 'mt-2') : 'text-footnote text-muted-foreground'}>{nota}</div>}
    </div>
  )
}
