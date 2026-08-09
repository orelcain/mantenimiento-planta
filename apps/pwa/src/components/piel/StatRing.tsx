import { cn } from '@/lib/utils'

/**
 * Anillo de progreso — el KPI protagonista de una pantalla (docs §7: "un
 * protagonista por pantalla"). Uso: OEE del turno, cumplimiento, disponibilidad.
 *
 * Por qué un anillo y no otro número más: en una grilla de 5 tarjetas iguales
 * nada destaca y el ojo no sabe dónde empezar. El anillo fija el punto de
 * entrada de la pantalla en un solo elemento.
 *
 * Se dibuja con SVG (no canvas) para que herede el color del tema por
 * `currentColor`/tokens y escale sin pixelarse.
 */
export interface StatRingProps {
  /** 0..1. `null` = sin dato: el anillo queda vacío y muestra "—". */
  value: number | null
  label?: string
  /** Diámetro en px. */
  size?: number
  className?: string
  /** Texto central. Por defecto, el valor en porcentaje. */
  children?: React.ReactNode
}

export function StatRing({ value, label, size = 132, className, children }: StatRingProps) {
  const stroke = Math.max(8, Math.round(size * 0.085))
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value))

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        {value != null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className="stroke-primary transition-[stroke-dasharray] duration-[1100ms] motion-reduce:transition-none"
            style={{ strokeDasharray: `${circumference * pct} ${circumference}` }}
          />
        )}
      </svg>
      {/* El texto ESCALA con el diámetro: con tamaño fijo, un anillo chico (82px)
          se encimaba con su etiqueta. Detectado al usarlo en la pantalla piloto. */}
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {children ?? (
          <span
            className="font-bold tabular-nums tracking-[-0.03em]"
            style={{ fontSize: Math.round(size * 0.2) }}
          >
            {value == null
              ? '—'
              : // Con poco espacio, sin decimal: "93%" cabe donde "93.3%" no.
                `${(value * 100).toFixed(size < 100 ? 0 : 1)}%`}
          </span>
        )}
        {label && (
          <span
            className="mt-1 font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            style={{ fontSize: Math.max(9, Math.round(size * 0.075)) }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  )
}
