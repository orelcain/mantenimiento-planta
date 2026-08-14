/**
 * monitorDiagnostico.ts — dónde se gana en ESTA línea.
 *
 * El total de un turno es, siempre, tiempo andando × velocidad. Lo que no es
 * igual en todas las líneas es cuál de los dos manda, y eso cambia dónde
 * conviene que Mantención ponga el esfuerzo.
 *
 * Medido el 13-ago-2026 sobre 34 turnos reales:
 *   Filete (1 Baader 200) — el tiempo andando casi no varía entre turnos (7%)
 *   y la velocidad sí (13%): el total lo explica la velocidad.
 *   Yal (3 Baader 142) — al revés: lo que decide es cuánto tiempo estuvieron
 *   andando las máquinas; con tres, lo que una pierde las otras lo compensan.
 *
 * ⚠ Por qué DISPERSIÓN y no correlación: con seis turnos de muestra un
 * coeficiente de correlación es puro ruido —necesitaría |r| > 0,81 solo para
 * ser significativo al 5%— y encima invita a leer causalidad donde solo hay
 * asociación. "En los últimos 6 turnos lo que más varió fue X" es una
 * afirmación descriptiva, verificable turno por turno, y alcanza para decidir
 * dónde mirar.
 */

export interface TurnoDiagnostico {
  totalPieces: number
  /** Minutos que la LÍNEA estuvo produciendo (timeBreakdown.producingMin). */
  producingMin: number
  /** Micro-detenciones del turno, si la línea las registra. */
  microCount: number | null
}

export interface DiagnosticoLinea {
  /** Qué factor varía más entre turnos — donde está el terreno a ganar. */
  factor: 'velocidad' | 'tiempo' | 'parejo'
  /** Dispersión de cada factor entre turnos, en % (coeficiente de variación). */
  cvVelocidad: number
  cvTiempo: number
  samples: number
  /**
   * Los dos extremos del historial con sus piezas. Se muestran los hechos —
   * "el turno con menos micro-detenciones hizo N piezas y el que más, M"— y
   * no una relación causal que estos datos no pueden probar.
   */
  micro: {
    hoy: number | null
    menos: { count: number; pieces: number }
    mas: { count: number; pieces: number }
    /**
     * ⚠ Solo cuando en ESTOS turnos más micro-detenciones fue de la mano de
     * MENOS piezas. Visto en Filete el 13-08 con los 6 turnos recientes: el
     * turno con menos (43) produjo 3.618 y el que más (63) produjo 4.364 — al
     * revés de lo esperado. Enseñar ese pareo sin comprobar el sentido induce
     * a leer "más micro-detenciones es mejor", que es peor que no decir nada.
     * Cuando esto es false, la UI muestra solo el rango.
     */
    relacionInversa: boolean
  } | null
}

/** Sin esto no hay dispersión que valga la pena mirar. */
const MIN_SAMPLES = 4

/**
 * Cuánto tiene que dominar un factor para nombrarlo. Por debajo de esto los
 * dos pesan parecido y decir "manda la velocidad" sería inventar una
 * conclusión: en Filete la diferencia es 13% contra 7% (1,7×).
 */
const DOMINANCIA = 1.3

const media = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length

/**
 * Correlación de Pearson. Se usa SOLO para decidir si vale mostrar el pareo de
 * micro-detenciones con piezas — nunca para afirmar una causa ni para
 * enseñarle el número a nadie: con esta muestra no significaría gran cosa.
 */
function correlacion(a: number[], b: number[]): number {
  if (a.length < 3) return 0
  const ma = media(a), mb = media(b)
  const num = a.reduce((s, _, i) => s + (a[i]! - ma) * (b[i]! - mb), 0)
  const da = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0))
  const db = Math.sqrt(b.reduce((s, x) => s + (x - mb) ** 2, 0))
  return da > 0 && db > 0 ? num / (da * db) : 0
}

/** Coeficiente de variación en %: cuánto varía algo respecto de su promedio. */
function cv(valores: number[]): number | null {
  if (valores.length < 2) return null
  const m = media(valores)
  if (m <= 0) return null
  const varianza = media(valores.map((v) => (v - m) ** 2))
  return (Math.sqrt(varianza) / m) * 100
}

export function buildDiagnostico(args: {
  history: TurnoDiagnostico[]
  /** Micro-detenciones del turno en curso, para contrastarlas con el historial. */
  microHoy?: number | null
}): DiagnosticoLinea | null {
  const utiles = args.history.filter((t) => t.totalPieces > 0 && t.producingMin > 0)
  if (utiles.length < MIN_SAMPLES) return null

  const velocidades = utiles.map((t) => t.totalPieces / t.producingMin)
  const tiempos = utiles.map((t) => t.producingMin)
  const cvV = cv(velocidades)
  const cvT = cv(tiempos)
  if (cvV == null || cvT == null) return null

  const factor: DiagnosticoLinea['factor'] =
    cvV >= cvT * DOMINANCIA ? 'velocidad'
    : cvT >= cvV * DOMINANCIA ? 'tiempo'
    : 'parejo'

  /*
   * Micro-detenciones: los dos extremos con lo que produjeron. No se calcula
   * ninguna correlación — con esta muestra no se sostendría — pero los dos
   * turnos extremos son un hecho que cualquiera puede ir a revisar.
   */
  const conMicro = utiles.filter((t): t is TurnoDiagnostico & { microCount: number } =>
    t.microCount != null && t.microCount > 0)
  let micro: DiagnosticoLinea['micro'] = null
  if (conMicro.length >= MIN_SAMPLES) {
    const orden = [...conMicro].sort((a, b) => a.microCount - b.microCount)
    const menos = orden[0]!
    const mas = orden[orden.length - 1]!
    // Si todos los turnos tuvieron prácticamente las mismas, no hay nada que
    // contar: mostrar dos extremos idénticos sugiere un contraste inexistente.
    if (mas.microCount >= menos.microCount * 1.25) {
      micro = {
        hoy: args.microHoy ?? null,
        menos: { count: menos.microCount, pieces: menos.totalPieces },
        mas: { count: mas.microCount, pieces: mas.totalPieces },
        relacionInversa: correlacion(
          conMicro.map((t) => t.microCount),
          conMicro.map((t) => t.totalPieces),
        ) <= -0.6,
      }
    }
  }

  return {
    factor,
    cvVelocidad: Math.round(cvV * 10) / 10,
    cvTiempo: Math.round(cvT * 10) / 10,
    samples: utiles.length,
    micro,
  }
}
