/**
 * UNA sola definición de «A esta hora» para toda la vista «El turno» (franja, gráfico y su globo, Camino a la meta y su
 * ampliado): lo que se muestra menos lo que tocaba a esta hora. Antes cada bloque restaba contra una base distinta
 * (contador vivo, punta del reloj) y la misma vista decía −953, −977 y −979. Puro, sin React: se prueba aparte.
 */
import { minutosCerrados, totalEnReposo, type EntradaRep, type Tope } from './reproduccionMinuto'

/**
 * Las piezas que la vista muestra «en reposo»: con la reproducción del último minuto activa, la suma de los minutos
 * cerrados topada por el contador vivo (`totalEnReposo`); si no, el contador vivo (`contador`, que también es el techo).
 */
export function piezasMostradas(repro: { entrada: EntradaRep | null; tope: Tope | null } | null | undefined, contador: number): number {
  return totalEnReposo(repro?.entrada, repro?.tope) ?? contador
}

/**
 * «A esta hora» = piezas mostradas − las que tocaban según la cuota. Negativo: va atrás; cero o más: al día. Sin cuota
 * (o en cero, el turno recién parte) no hay resta honesta: null. La cuota se topa a la meta, como la ve Camino a la meta.
 */
export function aEstaHora(mostradas: number, cuota: number | null | undefined, meta?: number | null): number | null {
  if (cuota == null || !Number.isFinite(cuota) || cuota <= 0) return null
  const vara = meta != null && meta > 0 ? Math.min(cuota, meta) : cuota
  return Math.round(mostradas) - Math.round(vara)
}

/**
 * La HORA DE LOS DATOS (T, reloj de planta wall-as-UTC): el instante al que corresponden las piezas mostradas. Con la
 * reproducción activa, el fin del último minuto cerrado (`desdeMs + minutos cerrados`), que es lo que suma
 * `totalEnReposo`; si no, el corte del contador. La cuota se evalúa en ESTA T, nunca en el fin del tramo de 5 min en
 * curso ni en el reloj del navegador: restar piezas de una hora contra la cuota de otra es justo el diente de sierra que
 * esto cierra. null si no se sabe.
 */
export function horaDeLosDatos(repro: { entrada: EntradaRep | null } | null | undefined, corteWallMs: number | null | undefined): number | null {
  const e = repro?.entrada
  if (e) {
    const n = minutosCerrados(e)
    if (n >= 1) return e.desdeMs + n * 60_000
  }
  return corteWallMs != null && Number.isFinite(corteWallMs) ? corteWallMs : null
}

/** Minutos de T desde la primera pieza del turno (el origen de la curva y de la cuota). null si falta alguno o T es anterior. */
export function minutoDeDatos(tMs: number | null | undefined, primeraPiezaMs: number | null | undefined): number | null {
  if (tMs == null || primeraPiezaMs == null || !Number.isFinite(tMs) || !Number.isFinite(primeraPiezaMs)) return null
  const m = (tMs - primeraPiezaMs) / 60_000
  return m > 0 ? m : null
}

/**
 * Desde dónde arrancan las barras de minuto: el inicio del turno, o la primera pieza si la línea produjo antes
 * (decisión de Orel, 28-10: esas piezas cuentan en «hechas», como en el contador de Shoplogix y en la curva).
 */
export function barrasDesdeMs(inicioTurnoMs: number, primeraPiezaMs: number | null | undefined): number {
  return primeraPiezaMs != null && Number.isFinite(primeraPiezaMs) && primeraPiezaMs < inicioTurnoMs ? primeraPiezaMs : inicioTurnoMs
}
