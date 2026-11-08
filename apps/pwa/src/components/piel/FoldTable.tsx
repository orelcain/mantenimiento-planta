/**
 * FoldTable — tabla «bordered» con filas que se pliegan.
 *
 * Forma (informe Apple, dirección A): marco fino de 1 px, encabezado con banda
 * tenue, filetes horizontales, ningún borde vertical y una fila de cierre con
 * filete de 2 px en tinta. Sin cajas dentro de cajas: la tabla ES la caja.
 *
 * Plegado: una fila con `detail` se abre al tocarla. El botón real va en la
 * primera celda (teclado: Enter/Espacio), con `aria-expanded` y `aria-controls`.
 * El detalle NO se desmonta al cerrarse: queda con `hidden`, como Disclosure.
 *
 * Sin `detail` la fila es estática (p. ej. «Por qué se detuvo»).
 */
import { Fragment, useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FoldTableColumn {
  id: string
  label: string
  align?: 'left' | 'right'
}

export interface FoldTableRow {
  id: string
  cells: ReactNode[]
  /** Contenido que se abre al tocar la fila. Sin él, la fila es estática. */
  detail?: ReactNode
  /** Peso 600 en toda la fila (p. ej. la fila de Mantención). */
  destacada?: boolean
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
  className?: string
}

export function FoldTable({ caption, columns, rows, cierre, nota, className }: FoldTableProps) {
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

  return (
    <div className={cn('space-y-2', className)}>
      <div className="overflow-hidden rounded-ctl border border-border">
        <table className="w-full border-collapse text-subhead tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/50 text-footnote text-muted-foreground">
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn('border-b border-border px-2.5 py-2 font-normal', alinear(i))}
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
                    className={cn('h-11 border-b border-border', plegable && 'cursor-pointer')}
                  >
                    {r.cells.map((cell, i) => (
                      <td
                        key={i}
                        className={cn('px-2.5 py-2 align-middle', alinear(i), r.destacada && 'font-semibold')}
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
                    <tr id={idDetalle} hidden={!abierta} className="border-b border-border">
                      <td colSpan={columns.length} className="px-2.5 pb-3 pt-1 text-footnote text-muted-foreground">
                        {r.detail}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {cierre && (
              <tr className="h-11 border-t-2 border-foreground">
                {cierre.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={cn('px-2.5 py-2 align-middle', alinear(i), cierre.destacada && 'font-semibold')}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {nota && <div className="text-footnote text-muted-foreground">{nota}</div>}
    </div>
  )
}
