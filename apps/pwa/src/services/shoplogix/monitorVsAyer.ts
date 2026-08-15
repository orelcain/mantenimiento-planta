/**
 * monitorVsAyer.ts — por qué este turno cerró distinto que el anterior, y cómo
 * quedó contra los récords de la línea.
 *
 * ── Por qué la comparación NO es en pz/min de reloj ─────────────────────────
 *
 * Lo cazó Orel el 14-08: la tarjeta decía 9,7 pz/min «promedio del turno» igual
 * que el día anterior, cuando en realidad ese día la línea fue la más rápida de
 * los últimos turnos y produjo 788 pz menos SOLO porque anduvo 85 min menos. El
 * promedio de reloj mezcla velocidad con disponibilidad: cuando baja no se sabe
 * si la línea fue lenta o estuvo parada, así que no enseña nada.
 *
 * La descomposición separa las dos cosas y reparte la diferencia de piezas
 * entre sus causas. La identidad es exacta:
 *
 *   piezas = min andando × ritmo andando
 *   Δpiezas = ritmo₀·Δandando + Δritmo·andando₁
 *   Δandando = Δventana − Δconvenio − Δparadas − Δotros
 *
 * con ritmo₀ el del turno ANTERIOR (lo nuevo se valoriza a la vara vieja, lo
 * que cambió de ritmo se valoriza sobre el turno nuevo). `Δotros` —huecos de
 * sensor— va al residuo, VISIBLE: si un día pasa del umbral, el bloque dice
 * «los datos están incompletos» en vez de repartir piezas que no explica.
 *
 * ── Por qué los récords son POR COMPONENTE y no «el mejor turno» ────────────
 *
 * El mejor turno por piezas de Filete (4.915 el 10-08) era simplemente el más
 * largo: 8 h 35 de ventana. Compararse contra él diría «faltaron 110 min de
 * turno», que no lo controla nadie en la línea. Los récords que enseñan son los
 * de lo que el turno SÍ controla —ritmo, paradas, % produciendo— y cada uno ya
 * se logró una vez en esta misma línea: son metas demostradas, no inventadas.
 */

/** Resumen mínimo de un turno para comparar. */
export interface TurnoResumen {
  dateKey: string
  total: number
  producingMin: number
  windowMin?: number | null
  plannedMin?: number | null
  recoverableMin?: number | null
}

export interface TerminoVsAyer {
  clave: 'duracion' | 'convenio' | 'paradas' | 'ritmo' | 'residuo'
  piezas: number
  /** El dato que lo explica, ya en la unidad de la causa. */
  hoy: number
  ayer: number
}

export interface VsAyerResult {
  ayer: { dateKey: string; total: number }
  diff: number
  terminos: TerminoVsAyer[]
  /** true si el residuo pasa del umbral: los datos no alcanzan para repartir. */
  datosIncompletos: boolean
  ritmoHoy: number
  ritmoAyer: number
}

/** Fracción de la diferencia que el residuo puede comerse sin invalidar todo. */
const MAX_RESIDUO = 0.35

function valido(t: TurnoResumen): t is Required<TurnoResumen> & TurnoResumen {
  return (
    t.total > 0 && t.producingMin >= 60 &&
    t.windowMin != null && t.windowMin > 0 &&
    t.plannedMin != null && t.recoverableMin != null
  )
}

/**
 * La diferencia contra el último turno comparable, repartida entre sus causas.
 *
 * `previos` viene en cualquier orden; se toma el MÁS RECIENTE con datos
 * completos. Turnos rotos (los 12 de 23 que Firestore trae sin piezas o sin
 * desglose) no comparan: mejor ningún bloque que uno contra un turno fantasma.
 */
export function vsAyer(hoy: TurnoResumen, previos: TurnoResumen[]): VsAyerResult | null {
  if (!valido(hoy)) return null
  const ayer = [...previos]
    .filter(valido)
    .filter((p) => p.dateKey < hoy.dateKey)
    .sort((a, b) => b.dateKey.localeCompare(a.dateKey))[0]
  if (!ayer) return null

  const r0 = ayer.total / ayer.producingMin
  const r1 = hoy.total / hoy.producingMin
  const diff = hoy.total - ayer.total

  const dVentana = (hoy.windowMin ?? 0) - (ayer.windowMin ?? 0)
  const dConvenio = (hoy.plannedMin ?? 0) - (ayer.plannedMin ?? 0)
  const dParadas = (hoy.recoverableMin ?? 0) - (ayer.recoverableMin ?? 0)

  const duracion = dVentana * r0
  const convenio = -dConvenio * r0
  const paradas = -dParadas * r0
  const ritmo = (r1 - r0) * hoy.producingMin
  const residuo = diff - (duracion + convenio + paradas + ritmo)

  return {
    ayer: { dateKey: ayer.dateKey, total: ayer.total },
    diff,
    terminos: [
      { clave: 'duracion', piezas: duracion, hoy: hoy.windowMin!, ayer: ayer.windowMin! },
      { clave: 'convenio', piezas: convenio, hoy: hoy.plannedMin!, ayer: ayer.plannedMin! },
      { clave: 'paradas', piezas: paradas, hoy: hoy.recoverableMin!, ayer: ayer.recoverableMin! },
      { clave: 'ritmo', piezas: ritmo, hoy: r1, ayer: r0 },
      { clave: 'residuo', piezas: residuo, hoy: 0, ayer: 0 },
    ],
    datosIncompletos: Math.abs(residuo) > Math.max(Math.abs(diff), 100) * MAX_RESIDUO,
    ritmoHoy: r1,
    ritmoAyer: r0,
  }
}

export interface RecordComponente {
  clave: 'ritmo' | 'paradas' | 'pctAndando'
  hoy: number
  /** El mejor valor SIN contar hoy, y de qué día es. */
  record: number
  recordDe: string
  /** Hoy superó (o igualó) la vara vieja. */
  esNuevo: boolean
  /** Solo en paradas: lo que vale la brecha al ritmo de hoy, en piezas. */
  brechaPiezas?: number
}

export interface RecordsResult {
  muestras: number
  componentes: RecordComponente[]
}

/**
 * Los récords de lo que el turno controla, contra los turnos anteriores.
 *
 * ⚠ «Mejor» aquí es POR COMPONENTE: el récord de ritmo puede ser de un día y
 * el de paradas de otro. Se necesitan al menos 3 turnos válidos para hablar de
 * récord — contra uno solo, todo es récord.
 */
export function recordsDeLinea(hoy: TurnoResumen, previos: TurnoResumen[]): RecordsResult | null {
  if (!valido(hoy)) return null
  const base = previos.filter(valido).filter((p) => p.dateKey < hoy.dateKey)
  if (base.length < 3) return null

  const ritmoDe = (t: TurnoResumen) => t.total / t.producingMin
  const pctDe = (t: TurnoResumen) => (t.producingMin / t.windowMin!) * 100

  const mejorRitmo = [...base].sort((a, b) => ritmoDe(b) - ritmoDe(a))[0]!
  const mejorParadas = [...base].sort((a, b) => a.recoverableMin! - b.recoverableMin!)[0]!
  const mejorPct = [...base].sort((a, b) => pctDe(b) - pctDe(a))[0]!

  const ritmoHoy = ritmoDe(hoy)
  const brechaParadas = Math.max(0, hoy.recoverableMin! - mejorParadas.recoverableMin!)

  return {
    muestras: base.length + 1,
    componentes: [
      {
        clave: 'ritmo',
        hoy: ritmoHoy,
        record: ritmoDe(mejorRitmo),
        recordDe: mejorRitmo.dateKey,
        esNuevo: ritmoHoy >= ritmoDe(mejorRitmo),
      },
      {
        clave: 'paradas',
        hoy: hoy.recoverableMin!,
        record: mejorParadas.recoverableMin!,
        recordDe: mejorParadas.dateKey,
        esNuevo: hoy.recoverableMin! <= mejorParadas.recoverableMin!,
        // La brecha en piezas solo acá: convertir también el % andando sería
        // contar dos veces las mismas paradas.
        brechaPiezas: brechaParadas * ritmoHoy,
      },
      {
        clave: 'pctAndando',
        hoy: pctDe(hoy),
        record: pctDe(mejorPct),
        recordDe: mejorPct.dateKey,
        esNuevo: pctDe(hoy) >= pctDe(mejorPct),
      },
    ],
  }
}

/** «jue 14» a partir de un dateKey — el nombre corto con que se cita un turno. */
export function nombreDeDia(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  return `${dias[d.getUTCDay()]} ${d.getUTCDate()}`
}

export interface BandaNormal {
  /** Rango normal del ritmo andando (pz/min), de los turnos válidos anteriores. */
  ritmo: { min: number; max: number }
  /** Rango normal de piezas al cierre. */
  cierres: { min: number; max: number }
  /** Los turnos en orden cronológico, con su día: cada punto del sparkline
      tiene identidad («x13 · 12,5»), no es solo forma. */
  turnos: Array<{ dateKey: string; ritmo: number }>
  muestras: number
}

/**
 * El rango de variación normal de la línea, para leer el turno de hoy de un
 * vistazo: dentro de la banda = martes cualquiera; fuera = noticia.
 *
 * ⚠ Se fija A PRIORI: solo turnos ANTERIORES válidos, nunca el de hoy — una
 * banda que se recalcula con el dato del día siempre termina justificando el
 * número que salió (guía numero-contexto). Y con menos de 5 turnos no hay
 * banda: mejor una tarjeta sin contexto que un «rango normal» de 3 datos.
 */
export function bandaNormal(hoy: TurnoResumen, previos: TurnoResumen[]): BandaNormal | null {
  const base = previos
    .filter(valido)
    .filter((p) => p.dateKey < hoy.dateKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  if (base.length < 5) return null
  const ritmos = base.map((t) => t.total / t.producingMin)
  const cierres = base.map((t) => t.total)
  return {
    ritmo: { min: Math.min(...ritmos), max: Math.max(...ritmos) },
    cierres: { min: Math.min(...cierres), max: Math.max(...cierres) },
    turnos: base.map((t) => ({ dateKey: t.dateKey, ritmo: t.total / t.producingMin })),
    muestras: base.length,
  }
}

/**
 * La racha con que llega el turno de hoy: pasos consecutivos en la MISMA
 * dirección contando hacia atrás desde hoy. «Viene subiendo 3 turnos» es la
 * historia que el sparkline dibuja pero nadie lee sola.
 *
 * ⚠ Sale del dato, no se adorna: pasos de menos de 0,15 pz/min no cortan ni
 * suman racha (ruido de redondeo), y con menos de 2 pasos no hay racha que
 * contar. La semana real de Filete (04→14 ago) NO fue una suba limpia — tuvo
 * un bache el vie 8 — así que la frase honesta del 14 era «viene aflojando
 * 2 turnos (13,2 → 11,6)», no «subió toda la semana».
 */
export function rachaDeRitmos(valores: number[]): { dir: 1 | -1; n: number; desde: number } | null {
  const RUIDO = 0.15
  if (valores.length < 3) return null
  let dir: 1 | -1 | 0 = 0
  let n = 0
  for (let i = valores.length - 1; i > 0; i--) {
    const paso = valores[i]! - valores[i - 1]!
    if (Math.abs(paso) < RUIDO) break
    const d: 1 | -1 = paso > 0 ? 1 : -1
    if (dir === 0) dir = d
    else if (d !== dir) break
    n++
    if (n >= valores.length - 1) break
  }
  if (dir === 0 || n < 2) return null
  return { dir, n, desde: valores[valores.length - 1 - n]! }
}
