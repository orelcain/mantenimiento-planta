import type { PublicMonitorLive } from '../../services/shoplogix/publicShiftMonitor.service'

/**
 * La hora extra del turno, tal como la contó Shoplogix: los rangos fuera del horario (`outsideRanges`) que el backend ya
 * atribuyó a ESTE turno. No inventa horario ni piezas: solo las separa para que se vean (19-11-2026, opción A).
 *
 * Por qué existe: desde planta llegó «el monitor corta justo a las 05:00» cuando no cortaba. Medido del 01-09 al 18-11 en
 * Chonchi, ninguna cola de hora extra se perdió (0 de 136 turnos); lo que faltaba era decirlo en pantalla.
 *
 * - `despues`: la cola después del fin programado (la hora extra propiamente tal), con su primera y última hora.
 * - `antes`: el arranque anticipado. Se informa aparte; no es hora extra al final.
 * - `enHorario`: el total mostrado menos TODO lo de afuera (antes + después), igual que el desglose del clásico.
 */
export interface HoraExtra {
  despues: { piezas: number; desde: string; hasta: string } | null
  antes: number
  enHorario: number
}

export function horaExtraDelTurno(
  live: Pick<PublicMonitorLive, 'outsideRanges'>,
  total: number,
): HoraExtra | null {
  const rangos = live.outsideRanges ?? []
  let antes = 0
  let piezas = 0
  let desde: string | null = null
  let hasta: string | null = null
  for (const r of rangos) {
    const n = Math.max(0, r.pieces || 0)
    if (n === 0) continue
    if (r.kind === 'antes') { antes += n; continue }
    piezas += n
    if (!desde || r.from < desde) desde = r.from
    if (!hasta || r.to > hasta) hasta = r.to
  }
  if (piezas === 0 && antes === 0) return null
  /* Las horas son las de los tramos con piezas, no las del horario: si la cola arrancó 15:40 se dice 15:40. */
  return {
    despues: piezas > 0 && desde && hasta ? { piezas, desde, hasta } : null,
    antes,
    enHorario: Math.max(0, total - piezas - antes),
  }
}
