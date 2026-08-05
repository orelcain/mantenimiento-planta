/**
 * Avisos sobre la ventana del turno: datos de arranque que faltan, y arranque
 * anticipado real.
 *
 * Son DOS cosas distintas y por eso se ven distinto:
 *
 * - **Faltan datos** (ámbar, con ícono): el turno arrancó antes del borde de la
 *   ventana de consulta del sync, así que de esos minutos no hay ciclos. El
 *   total del turno está incompleto y una parte quedó sumada al día anterior.
 *   Es un problema de datos, y hay que decirlo — dibujar el turno desde las
 *   08:00 en silencio afirma algo falso.
 * - **Arranque anticipado** (neutro): produjo antes de lo declarado en
 *   Shoplogix y el sync sí lo captó. No falta nada; es información operacional.
 *
 * Está fuera de la página para poder verificarlo sin sesión: la vista de turno
 * vive detrás de login.
 */
import { AlertTriangle } from 'lucide-react'
import { formatGapMinutes } from '@/services/grader/graderShiftWindow'
import { cn } from '@/lib/utils'

/** "07:15" — los timestamps del sync son wall-clock-as-UTC. */
function hhmm(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return '—'
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export interface TurnoVentanaAvisoProps {
  /** Minutos de arranque sin datos. 0 = no se muestra el aviso. */
  missingHeadMin: number
  /** Minutos que arrancó antes de lo declarado. 0 = no se muestra. */
  earlyStartMin: number
  /** Inicio real del turno según Shoplogix. */
  realStart?: Date | null
  /** Desde cuándo hay datos de verdad. */
  dataStart?: Date | null
  className?: string
}

export function TurnoVentanaAviso({
  missingHeadMin, earlyStartMin, realStart, dataStart, className,
}: TurnoVentanaAvisoProps) {
  if (missingHeadMin <= 0 && earlyStartMin <= 0) return null

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {missingHeadMin > 0 && (
        <div
          className="rounded-md border px-3 py-2 text-xs flex items-start gap-2"
          style={{ borderColor: 'var(--lc-warn)' }}
          data-testid="aviso-arranque-sin-datos"
        >
          <AlertTriangle
            className="w-3.5 h-3.5 mt-0.5 shrink-0"
            style={{ color: 'var(--lc-warn)' }}
            aria-hidden
          />
          <span className="text-foreground/90">
            <b>Faltan los primeros {formatGapMinutes(missingHeadMin)} del turno.</b>{' '}
            Shoplogix lo declara desde las <span className="font-mono">{hhmm(realStart)}</span>,
            pero la sincronización solo entrega desde las{' '}
            <span className="font-mono">{hhmm(dataStart)}</span>. Los ciclos de ese tramo
            quedaron atribuidos al día anterior, así que el total de este turno está incompleto.
          </span>
        </div>
      )}

      {earlyStartMin > 0 && (
        <div
          className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground"
          data-testid="aviso-arranque-anticipado"
        >
          ⏱ El turno arrancó{' '}
          <b className="text-foreground">{formatGapMinutes(earlyStartMin)}</b>{' '}
          antes de su horario declarado en Shoplogix. Esa producción está incluida.
        </div>
      )}
    </div>
  )
}
