/**
 * Una sola línea con todos los tiempos del turno.
 *
 * Reemplaza cuatro cosas que decían lo mismo de formas distintas y repartidas
 * por la pantalla: el banner "Turno de madrugada…", el rango del encabezado de
 * la tarjeta, los "131 min" sueltos y el horario programado como chip aparte.
 *
 * El problema no era que faltara información, era que sobraba: seis medidas de
 * tiempo sin decir contra qué se medía cada una, y dos de ellas midiendo casi
 * lo mismo con números distintos (131 min vs 2 h 9 min). Acá van juntas, cada
 * una con su etiqueta, en el orden en que se entienden:
 *
 *   Programado → Produjo → cuánto tarde arrancó → cuánto tiempo activo
 *
 * El arranque tardío es dato nuevo: en el turno del 31-jul fueron 3 h 49 min
 * que no aparecían en ninguna parte, y explican mejor un turno flojo que
 * cualquier análisis de paros.
 */

import { Clock, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtTime, fmtDurationMin, parseWallClockMs } from '@/services/grader/graderTimeFormat'

/** Desde cuántos minutos de atraso vale la pena nombrarlo. */
const ATRASO_NOTABLE_MIN = 15

export interface TurnoTiemposLineProps {
  /** Horario programado del turno (Shoplogix). */
  programadoStart?: string | null
  programadoEnd?: string | null
  /** Primera y última pieza registradas por el Grader. */
  produjoStart?: string | null
  produjoEnd?: string | null
  /** Minutos con actividad real (no el span, que incluye los paros). */
  minutosActivos?: number | null
}

export function TurnoTiemposLine({
  programadoStart, programadoEnd, produjoStart, produjoEnd, minutosActivos,
}: TurnoTiemposLineProps) {
  const progIni = parseWallClockMs(programadoStart)
  const progFin = parseWallClockMs(programadoEnd)
  const prodIni = parseWallClockMs(produjoStart)
  const prodFin = parseWallClockMs(produjoEnd)

  const hayProgramado = Number.isFinite(progIni) && Number.isFinite(progFin)
  const hayProduccion = Number.isFinite(prodIni) && Number.isFinite(prodFin)
  if (!hayProgramado && !hayProduccion) return null

  // Atraso de arranque: cuánto pasó entre la hora programada y la primera pieza.
  const atrasoMin = hayProgramado && hayProduccion
    ? Math.round((prodIni - progIni) / 60_000)
    : null
  const atrasoNotable = atrasoMin != null && atrasoMin >= ATRASO_NOTABLE_MIN

  // ¿La producción terminó en otro día que el turno? (turno que cruza medianoche)
  const cruzaDia = hayProduccion
    && new Date(prodIni).toISOString().slice(0, 10) !== new Date(progIni).toISOString().slice(0, 10)

  return (
    <div className="mt-2 mx-1 px-3 py-1.5 rounded-md border border-border bg-card
                    flex items-center gap-x-4 gap-y-1 flex-wrap text-[11px]">
      <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />

      {hayProgramado && (
        <span>
          <span className="text-muted-foreground">Programado </span>
          <b className="tabular-nums">{fmtTime(new Date(progIni))}–{fmtTime(new Date(progFin))}</b>
        </span>
      )}

      {hayProduccion && (
        <span>
          <span className="text-muted-foreground">Produjo </span>
          <b className="tabular-nums">{fmtTime(new Date(prodIni))}–{fmtTime(new Date(prodFin))}</b>
          {cruzaDia && (
            <span
              className="text-muted-foreground cursor-help"
              title="El turno pertenece al día en que arrancó, aunque su producción haya ocurrido de madrugada del día siguiente."
            > (madrugada)</span>
          )}
        </span>
      )}

      {atrasoNotable && (
        <span
          className={cn('flex items-center gap-1 text-amber-600 dark:text-amber-400 cursor-help')}
          title="Tiempo entre la hora programada de inicio y la primera pieza registrada. No es un paro de máquina: es turno que nunca arrancó."
        >
          <AlertTriangle className="w-3 h-3 shrink-0" />
          arrancó <b className="tabular-nums">{fmtDurationMin(atrasoMin!)}</b> tarde
        </span>
      )}

      {minutosActivos != null && minutosActivos > 0 && (
        <span
          className="ml-auto text-muted-foreground cursor-help tabular-nums"
          title="Minutos con al menos un registro del Grader. Excluye los paros, así que es menor que el rango de producción."
        >
          {fmtDurationMin(minutosActivos)} activos
        </span>
      )}
    </div>
  )
}
