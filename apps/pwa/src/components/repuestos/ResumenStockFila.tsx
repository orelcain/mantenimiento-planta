import { cn } from '@/lib/utils'
import { formatoValorCompacto, type ResumenStock } from '@/utils/repuestos/resumenStock'

export type EstadoResumenStock = 'ok' | 'low' | 'out' | 'comunSinStock' | null

const PUNTO = { ok: 'bg-fill-ok', low: 'bg-fill-warning', out: 'bg-fill-critical' } as const

const TEXTO = 'text-[length:calc(14px*var(--escala-texto,1))]'

/**
 * Una fila compacta con el resumen de stock de lo que se ve. Los estados son chips: tocar uno
 * filtra por él, tocar el activo lo quita. En teléfono se desliza en horizontal, sin envolver.
 */
export function ResumenStockFila({ resumen, activo, onElegir, cargando }: {
  resumen: Pick<ResumenStock, 'total' | 'ok' | 'low' | 'out' | 'comunSinStock' | 'valor'>
  activo: EstadoResumenStock
  onElegir: (estado: Exclude<EstadoResumenStock, null>) => void
  cargando?: boolean
}) {
  const chips: Array<{ clave: Exclude<EstadoResumenStock, null>; n: number; palabra: string; punto?: string; critico?: boolean }> = [
    { clave: 'ok', n: resumen.ok, palabra: resumen.ok === 1 ? 'disponible' : 'disponibles', punto: PUNTO.ok },
    { clave: 'low', n: resumen.low, palabra: 'bajo', punto: PUNTO.low },
    { clave: 'out', n: resumen.out, palabra: 'sin stock', punto: PUNTO.out },
    { clave: 'comunSinStock', n: resumen.comunSinStock, palabra: resumen.comunSinStock === 1 ? 'común sin stock' : 'comunes sin stock', critico: true },
  ]
  const valor = formatoValorCompacto(resumen.valor)

  return (
    <div
      role="group"
      aria-label="Resumen de stock"
      className={cn('-mx-4 mb-3 flex min-h-[44px] items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0', TEXTO)}
    >
      <span className="shrink-0 whitespace-nowrap text-foreground">
        <span className="font-medium tabular-nums">{cargando ? '…' : resumen.total.toLocaleString('es-CL')}</span>
        <span className="font-normal"> {resumen.total === 1 ? 'repuesto' : 'repuestos'}</span>
      </span>
      {!cargando && chips.map((c) => {
        const esActivo = activo === c.clave
        if (c.n === 0 && !esActivo) return null
        return (
          <button
            key={c.clave}
            type="button"
            aria-pressed={esActivo}
            onClick={() => onElegir(c.clave)}
            className="group inline-flex min-h-[44px] shrink-0 items-center"
          >
            <span
              className={cn(
                'inline-flex min-h-[32px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 transition-colors',
                esActivo
                  ? 'bg-primary text-primary-foreground'
                  : cn('bg-card group-hover:bg-muted', c.critico ? 'text-ink-crit' : 'text-foreground'),
              )}
            >
              {c.punto && <span aria-hidden className={cn('size-2 shrink-0 rounded-full', c.punto)} />}
              <span className="font-medium tabular-nums">{c.n.toLocaleString('es-CL')}</span>
              <span className="font-normal">{c.palabra}</span>
            </span>
          </button>
        )
      })}
      {!cargando && valor && (
        <span className="shrink-0 whitespace-nowrap text-footnote font-normal text-muted-foreground">valor {valor}</span>
      )}
    </div>
  )
}
