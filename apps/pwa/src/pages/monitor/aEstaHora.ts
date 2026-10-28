/**
 * UNA sola definición de «A esta hora» para toda la vista «El turno» (franja, gráfico y su globo, Camino a la meta y su
 * ampliado): lo que se muestra menos lo que tocaba a esta hora. Antes cada bloque restaba contra una base distinta
 * (contador vivo, punta del reloj) y la misma vista decía −953, −977 y −979. Puro, sin React: se prueba aparte.
 */
import { totalEnReposo, type EntradaRep, type Tope } from './reproduccionMinuto'

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
