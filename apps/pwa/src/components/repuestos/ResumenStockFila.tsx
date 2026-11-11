import { cn } from '@/lib/utils'
import { formatoValorCompacto, type ResumenStock } from '@/utils/repuestos/resumenStock'

export type EstadoResumenStock = 'ok' | 'low' | 'out' | 'comunSinStock' | null

const PUNTO = { ok: 'bg-fill-ok', low: 'bg-fill-warning', out: 'bg-fill-critical' } as const

// Cifra 22 px y etiqueta 13 px: las cifras se distinguen de los botones y chips (14 px) sin volver
// a las tarjetas grandes de antes.
const CIFRA = 'text-[length:calc(22px*var(--escala-texto,1))] font-medium leading-none tabular-nums'
const ETIQUETA = 'text-[length:calc(13px*var(--escala-texto,1))] font-normal leading-none'
const BLOQUE = 'flex min-h-[56px] shrink-0 flex-col justify-center gap-1.5 whitespace-nowrap rounded-ctl border px-3.5'

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
      className="-mx-4 mb-3 flex items-stretch gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <div className={cn(BLOQUE, 'border-transparent pl-0 pr-2')}>
        <span className={cn(CIFRA, 'text-foreground')}>{cargando ? '…' : resumen.total.toLocaleString('es-CL')}</span>
        <span className={cn(ETIQUETA, 'text-muted-foreground')}>{resumen.total === 1 ? 'repuesto' : 'repuestos'}</span>
      </div>
      {!cargando && chips.map((c) => {
        const esActivo = activo === c.clave
        if (c.n === 0 && !esActivo) return null
        return (
          <button
            key={c.clave}
            type="button"
            aria-pressed={esActivo}
            onClick={() => onElegir(c.clave)}
            className={cn(
              BLOQUE,
              'items-start text-left transition-colors',
              esActivo ? 'border-primary bg-primary/15' : 'border-border bg-card hover:bg-muted',
            )}
          >
            <span className={cn(CIFRA, c.critico ? 'text-ink-crit' : 'text-foreground')}>{c.n.toLocaleString('es-CL')}</span>
            <span className={cn(ETIQUETA, 'inline-flex items-center gap-1.5', c.critico ? 'text-ink-crit' : 'text-muted-foreground')}>
              {c.punto && <span aria-hidden className={cn('size-2 shrink-0 rounded-full', c.punto)} />}
              {c.palabra}
            </span>
          </button>
        )
      })}
      {!cargando && valor && (
        <div className={cn(BLOQUE, 'border-transparent')}>
          <span className={cn(CIFRA, 'text-foreground')}>{valor}</span>
          <span className={cn(ETIQUETA, 'text-muted-foreground')}>valor en bodega</span>
        </div>
      )}
    </div>
  )
}
