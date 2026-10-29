/**
 * «Hora a hora» de Piezas del turno en la hora del cuadro del reloj único (spec §2: total = Σ en CUALQUIER cuadro).
 *
 * Las filas de siempre salen de la serie de 5 min (otro corte, otra cadencia que la reproducción por minuto). Armar la fila en curso
 * como «hechas − Σ de las filas anteriores» sobre ESAS filas rompe el reloj único en el cambio de hora: con la serie ya en la hora
 * 22:00 y el cuadro en 21:58, la fila 21:00 muestra la hora completa (piezas que el cuadro aún no reproduce) y la de 22:00 queda en 0;
 * con la serie atrás y el cuadro en 22:03, la fila 21:00 se come las piezas de las 22:0x.
 *
 * Acá la hora en curso la decide el INSTANTE REPRODUCIDO: las filas anteriores a esa hora vienen de la serie, la de esa hora es lo que
 * falta para llegar a las hechas del cuadro, y las horas posteriores no se muestran (el cuadro todavía no llegó). Así las horas suman
 * siempre las hechas, para la línea y para cada Baader.
 */
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'

const HORA_MS = 60 * 60_000
const MIN_MS = 60_000

export interface MaquinaHoras { nombre: string; piezas: number[] }

export interface HorasEnCuadro {
  filas: HourlyRow[]
  porMaquina: MaquinaHoras[]
}

export function horasEnCuadro(e: {
  filas: HourlyRow[]
  porMaquina: MaquinaHoras[]
  /** Las hechas del cuadro (línea). */
  hechas: number
  /** Lo que lleva cada Baader en el mismo cuadro (suman `hechas`); null sin cola. */
  hechasPorMaquina: Array<{ nombre: string; valor: number }> | null
  /** El instante del cuadro, en el mismo marco horario que `filas[].hourStart`. null: sin instante no hay hora que decidir. */
  tMs: number | null
}): HorasEnCuadro {
  const { filas, porMaquina, tMs } = e
  if (filas.length === 0 || tMs == null || !Number.isFinite(tMs)) return { filas, porMaquina }
  const t0 = Date.parse(filas[0]!.hourStart)
  if (!Number.isFinite(t0)) return { filas, porMaquina }

  /* La hora del cuadro; si el cuadro va más allá de lo que cubre la serie, la fila que falta se arma al final. */
  const k = Math.min(filas.length, Math.max(0, Math.floor((tMs - t0) / HORA_MS)))
  /* Las horas que el cuadro ya pasó están cerradas aunque la serie de 5 min todavía no les haya llegado el último tramo: no son «en curso». */
  const previas = filas.slice(0, k).map((h) => (h.partial
    ? { ...h, partial: false, to: new Date(Date.parse(h.from) + HORA_MS).toISOString(), minutesCovered: 60, piecesPerHour: h.pieces }
    : h))
  const suma = (xs: number[]) => xs.reduce((a, x) => a + x, 0)
  const resto = (total: number, antes: number[]) => Math.max(0, Math.round(total) - suma(antes))

  const desde = t0 + k * HORA_MS
  const hasta = Math.min(desde + HORA_MS, Math.max(desde + MIN_MS, Math.floor(tMs / MIN_MS) * MIN_MS))
  const minutos = (hasta - desde) / MIN_MS
  const pieces = resto(e.hechas, previas.map((h) => h.pieces))
  const enCurso: HourlyRow = {
    hourStart: new Date(desde).toISOString(),
    index: k + 1,
    from: new Date(desde).toISOString(),
    to: new Date(hasta).toISOString(),
    pieces,
    minutesCovered: minutos,
    piecesPerHour: minutos > 0 ? Math.round((pieces / minutos) * 60) : 0,
    partial: true,
  }

  const maquinas = porMaquina.map((m) => {
    const h = e.hechasPorMaquina?.find((x) => x.nombre === m.nombre)?.valor
    const antes = m.piezas.slice(0, k)
    /* Sin lo que dice esa Baader en el cuadro, la hora en curso queda con lo que trae la serie. */
    return { ...m, piezas: [...antes, h != null ? resto(h, antes) : (m.piezas[k] ?? 0)] }
  })
  return { filas: [...previas, enCurso], porMaquina: maquinas }
}
