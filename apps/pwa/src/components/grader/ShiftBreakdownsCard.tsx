/**
 * Card compacta con los breakdowns del turno: lotes, calidad, producto,
 * conservación. Se alimenta de los campos poblados por el script
 * reclassify-from-excel (columnas del Excel PP).
 *
 * Si ninguno de los campos está poblado, el componente no renderiza nada
 * (backwards compat con summaries antiguos).
 */

import { Card, CardContent, Badge } from '@/components/ui'
import { Package, Award, Boxes, Snowflake } from 'lucide-react'

interface Props {
  lotsInShift?: Array<{ lot: string; pieces: number; pct: number }>
  calidadBreakdown?: Record<string, number>
  productoBreakdown?: Record<string, number>
  conservacionBreakdown?: Record<string, number>
}

function formatPct(pieces: number, total: number): string {
  if (total <= 0) return '0%'
  return `${((pieces / total) * 100).toFixed(1)}%`
}

function sortedEntries(m?: Record<string, number>): Array<[string, number]> {
  if (!m) return []
  return Object.entries(m).sort((a, b) => b[1] - a[1])
}

function totalOf(entries: Array<[string, number]>): number {
  return entries.reduce((s, [, n]) => s + n, 0)
}

export function ShiftBreakdownsCard({
  lotsInShift,
  calidadBreakdown,
  productoBreakdown,
  conservacionBreakdown,
}: Props) {
  const lots = lotsInShift ?? []
  const calidadEntries = sortedEntries(calidadBreakdown)
  const productoEntries = sortedEntries(productoBreakdown)
  const conservacionEntries = sortedEntries(conservacionBreakdown)

  const hasAny =
    lots.length > 0 ||
    calidadEntries.length > 0 ||
    productoEntries.length > 0 ||
    conservacionEntries.length > 0

  if (!hasAny) return null

  const calidadTotal = totalOf(calidadEntries)
  const productoTotal = totalOf(productoEntries)
  const conservacionTotal = totalOf(conservacionEntries)

  return (
    <Card>
      <CardContent className="py-3 px-4 space-y-4">
        <div className="text-sm font-medium text-muted-foreground">
          Composición del turno (según Excel)
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Lotes */}
          {lots.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-violet-400">
                <Package className="w-3.5 h-3.5" />
                Lotes ({lots.length})
              </div>
              <div className="space-y-1">
                {lots.slice(0, 5).map(l => (
                  <div key={l.lot} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-muted-foreground truncate" title={l.lot}>
                      {l.lot}
                    </span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {l.pct.toFixed(1)}%
                    </Badge>
                  </div>
                ))}
                {lots.length > 5 && (
                  <div className="text-[10px] text-muted-foreground">
                    +{lots.length - 5} más
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Calidad */}
          {calidadEntries.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <Award className="w-3.5 h-3.5" />
                Calidad
              </div>
              <div className="space-y-1">
                {calidadEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground truncate" title={k}>{k}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {formatPct(v, calidadTotal)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Producto */}
          {productoEntries.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400">
                <Boxes className="w-3.5 h-3.5" />
                Producto
              </div>
              <div className="space-y-1">
                {productoEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground truncate" title={k}>{k}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {formatPct(v, productoTotal)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conservación */}
          {conservacionEntries.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-400">
                <Snowflake className="w-3.5 h-3.5" />
                Conservación
              </div>
              <div className="space-y-1">
                {conservacionEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground truncate" title={k}>{k}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {formatPct(v, conservacionTotal)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
