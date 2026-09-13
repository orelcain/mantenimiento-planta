/**
 * El ritmo de cada máquina de la línea: el de verdad, el de cuando anda.
 *
 * POR QUÉ EXISTE
 * --------------
 * Orel pidió «el ritmo de cada Baader». Lo que se mostraba era otra cosa:
 * `piecesPerHour` que publica el backend divide las piezas de la máquina por la
 * VENTANA DEL TURNO, no por el tiempo que esa máquina estuvo andando
 * (`mHours = windowHours` para las tres, en `publicMonitor.js`). Turno 2 del
 * 26-08, medido:
 *
 *     máquina   en pantalla   uptime        ANDANDO
 *     Ev 1          9,0       62,1%          14,5
 *     Ev 2         12,2       81,6%          15,0
 *     Ev 3         11,3       77,2%          14,7
 *
 * Y ahí está lo que la vara vieja escondía: **las tres andan casi al mismo
 * ritmo**. La Ev 1 no es un 35% más lenta que la Ev 2 — corre igual, pero
 * estuvo parada 20 puntos más de tiempo. Para Mantención esas son dos acciones
 * distintas: una es mirar la velocidad, la otra es buscar por qué se detiene.
 *
 * Por eso cada máquina va con SU uptime al lado: sin él, dos máquinas con el
 * mismo ritmo andando y rendimientos muy distintos se ven iguales.
 *
 * ⚠ La SUMA de estos ritmos NO es el ritmo de la línea: las máquinas no andan
 * en los mismos minutos. En ese turno sumaban 44,2 mientras la línea iba a
 * 34,9. Lo que dan las tres juntas es el ritmo de línea, que se muestra aparte.
 */

export interface MaquinaDelMonitor {
  name?: string | null
  piecesPerHour?: number | null
  pieces?: number | null
  status?: string | null
  /** % del turno que la máquina estuvo andando. Lo publica el backend. */
  uptimePct?: number | null
}

export interface RitmoDeMaquina {
  nombre: string
  /** Piezas por minuto MIENTRAS ANDA. */
  cpm: number
  piezas: number
  detenida: boolean
  /** % del turno andando, si se conoce: explica la diferencia de rendimiento. */
  uptimePct: number | null
  /**
   * Cuánto pone esta máquina en la media de 15 min de la LÍNEA (mismo
   * denominador que el número de arriba: las tres SUMAN esa media). Lo anexa
   * la página con `repartoAhoraAndando`; null si el doc aún no trae la serie
   * por máquina.
   */
  ahoraCpm?: number | null
  /**
   * Aporte al promedio del turno: piezas ÷ minutos produciendo de la LÍNEA.
   * Por construcción las tres suman el promedio de línea — a diferencia de
   * `cpm`, que va sobre los minutos propios y no suma (44,2 vs 34,9).
   */
  aporteCpm?: number | null
  /**
   * El AHORA de esta máquina: el pulso del contador vivo, misma ventana que
   * el de línea (por construcción las tres SUMAN el «Ahora» grande — pedido
   * de Orel, 27-08). null cuando el contador no publica el desglose.
   */
  pulsoCpm?: number | null
}

export interface RitmosPorMaquina {
  maquinas: RitmoDeMaquina[]
  /** Promedio de los ritmos andando: cómo viene una máquina típica. */
  promedio: number
  /** true si todas rinden parecido: entonces el problema no es la velocidad. */
  parejas: boolean
}

/** Debajo de esta dispersión, las máquinas «andan igual». */
const DISPERSION_PAREJA = 0.12

export function ritmoPorMaquina(
  machines: readonly MaquinaDelMonitor[] | null | undefined,
  /** Minutos de la ventana del turno: el denominador con que se publicó `piecesPerHour`. */
  ventanaMin?: number | null,
): RitmosPorMaquina | null {
  // OJO: `Number(null)` es 0 y pasaría el `isFinite` — filtrar por `!= null`.
  const utiles = (machines ?? []).filter(
    (m) => m?.piecesPerHour != null && Number.isFinite(Number(m.piecesPerHour)),
  )
  if (utiles.length === 0) return null

  const maquinas: RitmoDeMaquina[] = utiles.map((m, i) => {
    const piezas = Number(m.pieces ?? 0)
    const pct = m.uptimePct != null && Number.isFinite(Number(m.uptimePct))
      ? Number(m.uptimePct)
      : null
    /*
     * Andando = piezas / (ventana x uptime). Sin ventana o sin uptime se cae a
     * `piecesPerHour`, que es el ritmo sobre el turno completo: peor, pero es
     * lo que hay y nunca inventa un número más alto del que se puede sostener.
     */
    const minAndando = ventanaMin != null && ventanaMin > 0 && pct != null && pct > 0
      ? (ventanaMin * pct) / 100
      : null
    const cpm = minAndando != null && minAndando > 0 && piezas > 0
      ? piezas / minAndando
      : Number(m.piecesPerHour) / 60
    return {
      nombre: (m.name ?? '').trim() || `Máquina ${i + 1}`,
      cpm,
      piezas,
      detenida: (m.status ?? '').toLowerCase() !== 'produciendo',
      uptimePct: pct,
    }
  })

  const promedio = maquinas.reduce((a, m) => a + m.cpm, 0) / maquinas.length
  const ritmos = maquinas.map((m) => m.cpm)
  const parejas = promedio > 0
    && (Math.max(...ritmos) - Math.min(...ritmos)) / promedio <= DISPERSION_PAREJA

  return { maquinas, promedio, parejas }
}

/**
 * Nombre corto para que las tres entren en una línea a 375 px:
 * "Evisceradora 2" → "Ev 2".
 */
export function nombreCorto(nombre: string): string {
  const m = /^(\D+?)\s*(\d+)$/.exec(nombre.trim())
  if (!m) return nombre.length > 10 ? `${nombre.slice(0, 9)}…` : nombre
  const palabra = m[1]!.trim()
  return `${palabra.slice(0, 2)} ${m[2]}`
}
