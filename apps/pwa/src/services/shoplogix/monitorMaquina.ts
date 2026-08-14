/**
 * monitorMaquina.ts — qué puede dar la máquina, y cuánto de eso se está usando.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 *
 * Sin un tope físico, el ritmo requerido crece sin límite a medida que se acaba
 * el turno: el 14-08 a las 15:25 la pantalla pedía 186 pz/min a una línea que
 * nunca pasó de 16,6. Un número así no es una meta, y peor: **se lee como que
 * el problema es la velocidad de la máquina**, cuando no lo es.
 *
 * ── El modelo (Baader 200 de Filete) ────────────────────────────────────────
 *
 * La Baader 200 lleva **silletas** que pasan a una velocidad fija: el máximo
 * funcional son 22 pz/min y normalmente se opera por debajo. El operador pone
 * una pieza por silleta, pero no siempre: cansancio, un salmón que hay que
 * sacar, o atochamiento aguas abajo (decorado, pimponeo). Entonces
 *
 *     ritmo real = velocidad de la máquina × llenado de silletas
 *
 * y esas dos mitades tienen dueños distintos. La velocidad es configuración;
 * el llenado es abastecimiento y atochamiento. Medido sobre 614 tramos de 5 min
 * de los últimos 7 turnos de Filete: el máximo observado fue **16,6 pz/min**
 * (92% de 18) y **ningún tramo llegó al 90% de llenado** — el llenado mediano
 * andando ronda el 60%. La máquina no es el límite.
 *
 * ⚠ Esto es de la **Baader 200**. Las Baader 142 son otras máquinas, con otro
 * mecanismo: no tienen entrada acá y el bloque no se muestra para ellas.
 *
 * ⚠⚠ El set point NO viaja en los datos de Shoplogix (manda piezas y estados,
 * no la velocidad configurada). Vive acá hasta que exista config por línea, y
 * por eso **la pantalla siempre lo dice**: "silletas al 64% · máquina a 18
 * pz/min". Si alguien en planta ve que el set point no es ese, el número está a
 * la vista para desmentirlo — un supuesto escondido sería mucho peor.
 */

export interface MaquinaSpec {
  /** Cómo se llama en la pantalla lo que se llena. */
  unidad: 'silletas'
  /** Cuántas hay, para poder nombrarlo ("5 silletas"). */
  cantidad: number
  /** Velocidad a la que se opera normalmente, en pz/min. */
  setCpm: number
  /** Máximo funcional de la máquina, en pz/min. Nada por encima existe. */
  maxCpm: number
}

/**
 * Por MODELO de máquina, no por planta: la misma Baader 200 en otra línea se
 * comporta igual, y una Baader 142 no tiene nada que ver con esto.
 */
const SPECS: Record<string, MaquinaSpec> = {
  'baader 200': { unidad: 'silletas', cantidad: 5, setCpm: 18, maxCpm: 22 },
}

/** La spec del modelo, o null si de esa máquina no sabemos el mecanismo. */
export function specDeMaquina(model: string | null | undefined): MaquinaSpec | null {
  if (!model) return null
  return SPECS[model.trim().toLowerCase()] ?? null
}

export interface LlenadoSilletas {
  spec: MaquinaSpec
  /** Fracción de silletas con pieza mientras la máquina anduvo (0-1). */
  actual: number
  /**
   * Fracción que haría falta de acá al cierre para llegar a la meta. null si no
   * hay meta o no queda tiempo productivo.
   */
  necesaria: number | null
  /**
   * true cuando lo que falta NO cabe ni llenando todas las silletas: ahí el
   * problema dejó de ser el llenado y hay que decir que no da el tiempo.
   */
  imposible: boolean
  /** Piezas que la máquina habría dado en ese mismo tiempo con todo lleno. */
  potencial: number | null
}

/**
 * El llenado de silletas: lo que separa "la línea va lenta" de "la línea va a
 * su velocidad y le faltan pescados".
 *
 * `cpmAndando` es piezas por minuto de UPTIME, no de reloj: sobre el reloj se
 * mezclarían las paradas con el llenado, que es justo la confusión a evitar.
 */
export function llenadoDeSilletas(args: {
  model: string | null | undefined
  cpmAndando: number | null | undefined
  /** Minutos que la máquina estuvo produciendo. */
  producingMin?: number | null
  /** Piezas que faltan para la meta. */
  remainingPieces?: number | null
  /** Minutos de producción que quedan (ya sin las paradas de convenio). */
  workMin?: number | null
}): LlenadoSilletas | null {
  const spec = specDeMaquina(args.model)
  if (!spec || !args.cpmAndando || args.cpmAndando <= 0) return null

  const actual = args.cpmAndando / spec.setCpm
  const faltan = args.remainingPieces ?? 0
  const quedan = args.workMin ?? 0
  const necesaria = faltan > 0 && quedan > 0 ? faltan / (quedan * spec.setCpm) : null

  return {
    spec,
    actual,
    necesaria,
    // Contra el MÁXIMO funcional, no contra el set point: subir la velocidad es
    // una decisión posible, llenar más del 100% de las silletas no.
    imposible: necesaria != null && faltan / (quedan * spec.maxCpm) > 1,
    potencial: args.producingMin && args.producingMin > 0
      ? Math.round(args.producingMin * spec.setCpm)
      : null,
  }
}

/** "64 de cada 100" — se lee mejor que "0,64" o que un porcentaje suelto. */
export function comoDeCada100(fraccion: number): number {
  return Math.round(Math.max(0, fraccion) * 100)
}
