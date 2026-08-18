/**
 * El ritmo de la línea: UNA sola fuente para el número y para la curva.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 *
 * Orel, mirando el monitor con la línea andando: «el ritmo de pz/min no varía
 * mucho el número pero sí veo que baja el gráfico… es raro». No era un error de
 * cálculo: el número grande era el promedio ACUMULADO del turno —con inercia,
 * casi inmóvil pasada la primera hora— y la curva de abajo era la media móvil,
 * que sí se mueve. Dos parientes lejanos presentados como si fueran lo mismo.
 *
 * La media móvil se calculaba DENTRO del componente del gráfico, así que la
 * tarjeta de ritmo no tenía forma de decir el mismo número aunque quisiera.
 * Acá vive una vez y la usan los dos: el número que se lee arriba es,
 * literalmente, el último punto de la línea que se dibuja abajo.
 */

/** Un tramo de la serie del monitor. */
export interface TramoSerie {
  t?: string | null
  pieces?: number | null
}

/** Minutos que dura cada tramo de la serie. */
export const PASO_MIN = 5
/** Tramos que entran en la media: 3 × 5 min = la «media de 15 min» rotulada. */
export const VENTANA_TRAMOS = 3

/**
 * La media móvil, en PIEZAS por tramo (la unidad del gráfico de barras).
 *
 * ⚠ Se corta la cola de tramos en CERO del final: cuando la línea deja de
 * producir, la serie sigue trayendo tramos vacíos y la media los promedia, así
 * que la curva termina cayendo al suelo y el turno parece desplomarse cuando en
 * realidad terminó. Los ceros del MEDIO se conservan: esos sí son información
 * (la colación, una falla).
 */
export function mediaMovil(series: readonly TramoSerie[] | null | undefined): number[] {
  if (!series || series.length === 0) return []
  let fin = series.length
  while (fin > 0 && (series[fin - 1]!.pieces || 0) === 0) fin--
  return series.slice(0, fin).map((_, i, arr) => {
    const w = arr.slice(Math.max(0, i - VENTANA_TRAMOS + 1), i + 1)
    return w.reduce((a, p) => a + (p.pieces || 0), 0) / w.length
  })
}

/**
 * El ritmo de AHORA en pz/min: el último punto de la media móvil.
 *
 * Es la cifra protagonista del monitor. `null` cuando la línea todavía no
 * produjo nada — y ese null es información: no hay ritmo que mostrar, no es un
 * cero que invite a leer «va lentísima».
 */
export function ritmoAhoraCpm(series: readonly TramoSerie[] | null | undefined): number | null {
  const media = mediaMovil(series)
  if (media.length === 0) return null
  return media[media.length - 1]! / PASO_MIN
}

/**
 * El ritmo de ahora ANDANDO: solo los minutos en que la línea produjo.
 *
 * ⚠⚠ Por qué existe: la regla compara contra el SET POINT de la máquina, que
 * es una velocidad andando (18 pz/min es lo que da cuando corre, no un promedio
 * con paradas). Si el relleno de la barra fuera de reloj y el techo andando,
 * la barra subestimaría siempre y la comparación no significaría nada. Peor: la
 * marca del promedio del turno TAMBIÉN es andando, así que en la misma barra
 * convivían dos denominadores — el error que este bloque vino a terminar.
 *
 * Los minutos andando se cuentan por tramo: un tramo con piezas cuenta sus 5
 * minutos, uno vacío no cuenta ninguno. Es una aproximación —dentro de un tramo
 * puede haber habido un paro corto— pero es la misma con la que se dibuja la
 * curva, así que número y gráfico siguen contando lo mismo.
 */
export function ritmoAhoraAndando(series: readonly TramoSerie[] | null | undefined): number | null {
  if (!series || series.length === 0) return null
  const conDatos = mediaMovil(series).length      // corta la cola de ceros igual que la curva
  if (conDatos === 0) return null
  const ventana = series.slice(Math.max(0, conDatos - VENTANA_TRAMOS), conDatos)
  const piezas = ventana.reduce((a, p) => a + (p.pieces ?? 0), 0)
  const tramosAndando = ventana.filter((p) => (p.pieces ?? 0) > 0).length
  if (tramosAndando === 0) return 0               // la línea estuvo parada toda la ventana
  return piezas / (tramosAndando * PASO_MIN)
}

/** Cómo se lee un ritmo contra el techo de la máquina. */
export type EstadoRitmo = 'ok' | 'lento' | 'parada'

/**
 * El estado según qué fracción del set point se está alcanzando.
 *
 * Los cortes (80 % / 50 %) vienen del mockup. Se nombra SIEMPRE con palabra
 * además de color: en planta hay pantallas quemadas por el sol y gente que no
 * distingue rojo de verde.
 */
export function estadoRitmo(cpm: number | null, setCpm: number | null | undefined): EstadoRitmo {
  if (cpm == null || !setCpm || setCpm <= 0) return 'ok'
  const frac = cpm / setCpm
  if (frac < 0.5) return 'parada'
  if (frac < 0.8) return 'lento'
  return 'ok'
}

/** Qué fracción de la regla ocupa un ritmo (0..1), con el techo como final. */
export function fraccionDeRegla(cpm: number | null, setCpm: number | null | undefined): number {
  if (cpm == null || cpm <= 0) return 0
  /*
   * Sin set point conocido la regla no tiene escala: se usa el propio ritmo
   * como tope para que la barra no quede vacía ni mienta sobre el techo.
   */
  if (!setCpm || setCpm <= 0) return 1
  return Math.max(0, Math.min(1, cpm / setCpm))
}

/**
 * El ritmo ANDANDO que hay que sostener para llegar a la meta.
 *
 * ── Por qué hay que convertirlo ────────────────────────────────────────────
 *
 * `computePaceToTarget` calcula el requerido sobre el tiempo de RELOJ que
 * queda (descontando las colaciones previstas): «pide 14 pz/min». Pero la
 * línea no produce todos esos minutos — para y arranca. Si el turno viene
 * produciendo el 80 % del tiempo disponible, sostener 14 de reloj exige ir a
 * 17,5 **cuando corre**.
 *
 * Sin esa conversión, la marca del objetivo y el relleno del ritmo actual
 * estarían en bases distintas y compararlos no significaría nada — el mismo
 * error que la barra ya tuvo una vez.
 *
 * ⚠ Se usa el uptime REAL del turno en curso, no un supuesto: es lo que hace
 * que el número sea realista. Un turno que viene parando la mitad del tiempo
 * necesita el doble de velocidad, y eso es exactamente lo que hay que mostrar.
 *
 * @param requeridoReloj  pz/min sobre el tiempo de reloj útil que queda.
 * @param producingMin    minutos que la línea produjo en el turno.
 * @param disponibleMin   minutos disponibles hasta ahora (ventana − convenio).
 */
export function pedidoAndando(
  requeridoReloj: number | null | undefined,
  producingMin: number | null | undefined,
  disponibleMin: number | null | undefined,
): number | null {
  if (!requeridoReloj || requeridoReloj <= 0) return null
  if (!producingMin || !disponibleMin || disponibleMin <= 0) return requeridoReloj
  const frac = producingMin / disponibleMin
  /* Con muy poco turno corrido la fracción es ruido (un arranque tardío da
     20 % y dispararía el pedido a 5×). Bajo 15 min producidos se muestra el
     requerido de reloj tal cual, que ya es una referencia honesta. */
  if (producingMin < 15 || frac <= 0.05) return requeridoReloj
  return requeridoReloj / Math.min(1, frac)
}
