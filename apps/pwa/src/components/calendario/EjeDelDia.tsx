import { cn } from '@/lib/utils'
import { HORAS_EJE, SLOTS_POR_DIA, TURNOS, esCorteDeTurno } from '@/services/ruedaVentanas'

/**
 * El eje de 24 h que comparten las tres vistas de franja.
 *
 * Estaba duplicado en cada una, y eso ya había hecho que se desalinearan entre
 * sí. Además, la rejilla iba cada 3 h, así que los cortes de turno (08:00 y
 * 16:00) no caían en ninguna marca: la franja no dejaba ver a qué turno le tocaba
 * cada ventana, que es la primera pregunta al repartir el trabajo.
 */

/** Ancho de la columna de etiquetas, para que todas las filas cuadren. */
export const ANCHO_ETIQUETA = 'w-28 sm:w-36'
/** Ancho de la columna de cifras de la derecha. */
export const ANCHO_CIFRA = 'w-24 sm:w-32'

export function RejillaHoras() {
  return (
    <div className="pointer-events-none absolute inset-0 flex">
      {HORAS_EJE.map((h) => (
        <div
          key={h}
          className={cn(
            'h-full flex-1 first:border-l-0',
            // El corte de turno se ve más que una hora cualquiera.
            esCorteDeTurno(h) ? 'border-l border-border' : 'border-l border-border/40',
          )}
        />
      ))}
    </div>
  )
}

export function EjeHoras({
  anchoEtiqueta = ANCHO_ETIQUETA,
  anchoCifra = ANCHO_CIFRA,
}: {
  anchoEtiqueta?: string
  anchoCifra?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn('shrink-0', anchoEtiqueta)} />
      <div className="flex min-w-0 flex-1">
        {HORAS_EJE.map((h) => (
          <span
            key={h}
            className={cn(
              'flex-1 font-mono text-caption tabular-nums',
              esCorteDeTurno(h) ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
      <span className={cn('shrink-0', anchoCifra)} />
    </div>
  )
}

/**
 * Banda de turnos sobre el eje. Responde «¿a qué turno le toca esta ventana?»
 * sin obligar a contar horas — sobre todo en la madrugada, que es donde caen casi
 * todas las ventanas y donde es fácil equivocarse de turno.
 */
export function BandaTurnos({
  anchoEtiqueta = ANCHO_ETIQUETA,
  anchoCifra = ANCHO_CIFRA,
}: {
  anchoEtiqueta?: string
  anchoCifra?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'shrink-0 text-caption text-muted-foreground',
          anchoEtiqueta,
        )}
      >
        Turnos
      </span>
      <div className="flex min-w-0 flex-1 gap-px">
        {TURNOS.map((t) => (
          <span
            key={t.etiqueta}
            className="flex items-center justify-center rounded-[3px] bg-muted/60 py-0.5 font-mono text-caption tabular-nums text-muted-foreground"
            style={{ width: `${((t.fin - t.inicio) * 100) / SLOTS_POR_DIA}%` }}
          >
            {t.etiqueta}
          </span>
        ))}
      </div>
      <span className={cn('shrink-0', anchoCifra)} />
    </div>
  )
}
