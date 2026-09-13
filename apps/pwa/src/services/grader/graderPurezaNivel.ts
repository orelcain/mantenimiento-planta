/**
 * Umbrales y lectura de la pureza por puerta (ver graderGateMix.ts).
 * Módulo puro, separado del componente para poder testearlo y para no romper
 * el fast-refresh del archivo de la tarjeta.
 *
 * ≥95 pura · 85–95 en atención · <85 mezclada. El 85 es el mismo 15 % de mezcla
 * con el que GraderGatesLector ya avisa en el dashboard de la carga.
 */
export const PUREZA_OK_PCT = 95
export const PUREZA_WARN_PCT = 85

export type NivelPureza = 'ok' | 'warn' | 'crit' | 'none'

export function nivelDePureza(pct: number | null | undefined): NivelPureza {
  if (pct == null) return 'none'
  if (pct >= PUREZA_OK_PCT) return 'ok'
  if (pct >= PUREZA_WARN_PCT) return 'warn'
  return 'crit'
}

/**
 * Primer bloque desde el que la puerta queda por debajo del umbral crítico y
 * no se recupera: de ahí en adelante, al menos la mitad de los bloques con
 * piezas siguen bajo 85. Un bloque malo aislado en medio de un turno bueno no
 * cuenta como caída (un promedio lo arrastraría). null si nunca cae.
 */
export function bloqueDeCaida(purity: ReadonlyArray<number | null>): number | null {
  for (let i = 0; i < purity.length; i++) {
    const v = purity[i]
    if (v == null || v >= PUREZA_WARN_PCT) continue
    const resto = purity.slice(i).filter((x): x is number => x != null)
    const bajos = resto.filter((x) => x < PUREZA_WARN_PCT).length
    if (bajos * 2 >= resto.length) return i
  }
  return null
}

/** Promedio de los bloques con dato antes de `hasta` (exclusivo); null si no hay. */
function promedioHasta(purity: ReadonlyArray<number | null>, hasta: number): number | null {
  const previos = purity.slice(0, hasta).filter((x): x is number => x != null)
  if (previos.length === 0) return null
  return previos.reduce((s, x) => s + x, 0) / previos.length
}

export { promedioHasta }

/**
 * Qué puerta abre sola la tarjeta al entrar a Gates.
 *
 * El detalle de una puerta mide **1.288 px a 375 px — el 39 % de la pestaña**,
 * así que desplegarlo tiene que ganárselo. Hasta el 10-09 abría también cuando
 * la única novedad era una puerta con «seteo distinto», que es un aviso de
 * configuración y no un problema de proceso: el turno entero arrancaba
 * desplegado para contar algo que la grilla ya marca.
 *
 * Ahora abre **solo con mezcla real** (una puerta bajo el umbral). Decisión de
 * Orel, 10-09.
 *
 * @param puertas pureza de cada puerta ya resuelta (null = sin dato).
 * @param conSeteoDistinto puertas cuyo seteo no coincide con la máquina: no
 *   cuentan como mezcladas, son otra cosa.
 */
export function puertaQueAbreSola(
  puertas: ReadonlyArray<{ gate: number; pct: number | null }>,
  conSeteoDistinto: ReadonlySet<number> = new Set(),
): number | null {
  const juzgables = puertas.filter(
    (p): p is { gate: number; pct: number } => p.pct != null && !conSeteoDistinto.has(p.gate),
  )
  if (juzgables.length === 0) return null
  const peor = juzgables.reduce((a, b) => (b.pct < a.pct ? b : a))
  return nivelDePureza(peor.pct) === 'ok' ? null : peor.gate
}
