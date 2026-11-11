/**
 * desglose.ts — de qué estuvo hecho el turno de una Baader (o de la línea) contra su vara: cuántos minutos hizo cada entero de piezas,
 * con y sin detención, agrupados en las zonas «a ritmo», «bajo», «parcial» y «detenida». Lo pinta la franja «El turno completo» y lo abre
 * «Ver desglose».
 *
 * Funciones puras, sin React. El umbral y las bandas salen de perilla.ts (`umbralEntero`, `bandasEnteras`), así que el desglose dice lo
 * mismo que la raya y el tono de cada minuto. Las detenciones entran como `ParadaDetalle` (ritmoVivo.ts, `paradasDetalle`), con la misma
 * regla del segundo.
 */
import { bandasEnteras, MODO_UMBRAL_POR_OMISION, umbralARitmo, umbralEntero, type VaraUmbral } from './perilla'
import type { ParadaDetalle } from './ritmoVivo'

/**
 * Minutos de marcha inicial: el arranque del turno (los primeros) y los que siguen a una detención. Un minuto bajo el umbral y sin
 * detención dentro de esa ventana es arranque, no falla de ritmo.
 */
export const MARCHA_INICIAL_MIN = 2

/** Las cuatro zonas del desglose, de la más alta a la más baja. */
export type ZonaDesglose = 'ritmo' | 'bajo' | 'parcial' | 'detenida'
const ZONAS: ZonaDesglose[] = ['ritmo', 'bajo', 'parcial', 'detenida']

/** Una fila: los minutos en que la Baader hizo `v` piezas (o `v` o más, en la fila «tope o más»). */
export interface FilaDesglose {
  v: number
  /** Fila «tope o más»: todo minuto con `tope` piezas o más. */
  mas: boolean
  zona: ZonaDesglose
  sin: number
  con: number
  /** `sin + con`. */
  n: number
  /** Parte del turno, sobre 100. Las filas de una zona suman el `pct` de esa zona. */
  pct: number
  /** Minutos con detención por motivo. Un minuto con detención sin motivo (la que sigue en curso) no entra aquí. */
  razones: Record<string, number>
}

/** Una zona: sus minutos, su parte del turno y sus filas (vacías en la línea, `porZona`). */
export interface BloqueZona {
  zona: ZonaDesglose
  n: number
  pct: number
  filas: FilaDesglose[]
}

/** El desglose de un turno. */
export interface Desglose {
  /** Umbral «a ritmo» entero de la vara (`umbralEntero`): lo que la franja escribe bajo «minutos a ritmo». */
  umbral: number
  /** Primer entero «bajo» (`bandasEnteras`): de aquí a `umbral − 1` es bajo; debajo, muy bajo. */
  bajo: number
  /** Las cuatro zonas, siempre, en el orden de `ZonaDesglose`. */
  zonas: BloqueZona[]
  /** Minutos bajo el umbral (0 < piezas < umbral) sin detención. */
  bajoSinDetencion: number
  /** De esos, los de marcha inicial (ver `MARCHA_INICIAL_MIN`). */
  marchaInicial: number
}

/**
 * Reparte `total` entre `pesos` en enteros que suman `total`: cada peso recibe su parte entera y el resto va a los de mayor fracción
 * (a igualdad, el primero). Sin nada que repartir (todos los pesos en cero) da ceros.
 */
export function repartirPorMayorResto(pesos: number[], total: number): number[] {
  const suma = pesos.reduce((a, p) => a + p, 0)
  if (!(suma > 0)) return pesos.map(() => 0)
  const exactos = pesos.map((p) => (p * total) / suma)
  const enteros = exactos.map((x) => Math.floor(x))
  const sobran = total - enteros.reduce((a, x) => a + x, 0)
  const porFraccion = exactos.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f || a.i - b.i)
  for (const { i } of porFraccion.slice(0, sobran)) enteros[i]! += 1
  return enteros
}

/**
 * Qué tiene cada minuto `k` (desde `t0`, el inicio del minuto 0) de detención en UNA Baader, con la misma regla del segundo que
 * `paradasDetalle`. `con[k]`: algún segundo del minuto cae en una detención registrada (micro, programada u otra). `razon[k]`: el motivo de la
 * detención que cubre más segundos de ese minuto (a igualdad, la primera); null si no hay ninguna, o si es la que sigue en curso (no trae
 * motivo).
 */
export function detencionesPorMinuto(
  detenciones: ParadaDetalle[] | undefined,
  t0: number,
  n: number,
): { con: boolean[]; razon: Array<string | null> } {
  const con: boolean[] = []
  const razon: Array<string | null> = []
  for (let k = 0; k < n; k++) {
    const ini = t0 + k * 60_000
    const fin = ini + 60_000
    let mejorMs = 0
    let motivo: string | null = null
    for (const p of detenciones ?? []) {
      const ms = Math.min(p.finMs, fin) - Math.max(p.iniMs, ini)
      if (ms > mejorMs) {
        mejorMs = ms
        motivo = p.razon
      }
    }
    con.push(mejorMs > 0)
    razon.push(mejorMs > 0 ? motivo : null)
  }
  return { con, razon }
}

/** Marcha inicial: el arranque del turno, o una detención en los `MARCHA_INICIAL_MIN` minutos anteriores. */
function enArranque(k: number, con: boolean[]): boolean {
  if (k < MARCHA_INICIAL_MIN) return true
  for (let d = 1; d <= MARCHA_INICIAL_MIN; d++) if (con[k - d] === true) return true
  return false
}

/**
 * El desglose de `n` minutos de una Baader (o de la línea) contra su `vara`: `cycles[k]` son las piezas del minuto k; `con[k]` y
 * `razon[k]` salen de `detencionesPorMinuto`. Null si la vara no sirve (sin cifra o con cifra cero).
 *
 * Zona de cada minuto por su entero: ritmo (≥ `umbral`), bajo (≥ `bajo`), parcial (> 0) y detenida (0). Filas de `tope` a 0, donde `tope`
 * es el umbral óptimo + 1 (la fila «tope o más»). Con `porZona` (la línea) las zonas van sin filas.
 *
 * Porcentajes: el «a ritmo» del turno es `round(n_ritmo / n × 100)`, la cifra del frente. Las otras tres zonas reparten el resto
 * (100 − ese) por minutos; las filas de cada zona reparten el % de su zona. Así todo suma 100, y el «a ritmo» que se ve no se mueve por
 * el redondeo.
 *
 * Solo se miran los primeros `n` minutos.
 */
export function desgloseDe(args: {
  cycles: number[]
  n: number
  vara: VaraUmbral
  con: boolean[]
  razon: Array<string | null>
  porZona?: boolean
}): Desglose | null {
  const { cycles, n, vara, con, razon, porZona = false } = args
  const umbral = umbralEntero(vara)
  const bandas = bandasEnteras(vara)
  if (umbral == null || bandas == null || vara.cpm == null) return null
  const tope = umbralARitmo(vara.cpm, 'optimo') + 1
  const { bajo } = bandas
  const zonaDe = (v: number): ZonaDesglose => (v >= umbral ? 'ritmo' : v >= bajo ? 'bajo' : v > 0 ? 'parcial' : 'detenida')

  const celdas = new Map<number, { sin: number; con: number; razones: Record<string, number> }>()
  for (let v = 0; v <= tope; v++) celdas.set(v, { sin: 0, con: 0, razones: {} })
  const minutosPorZona: Record<ZonaDesglose, number> = { ritmo: 0, bajo: 0, parcial: 0, detenida: 0 }
  let bajoSinDetencion = 0
  let marchaInicial = 0
  for (let k = 0; k < n; k++) {
    const c = cycles[k]
    const v = c != null && Number.isFinite(c) ? Math.min(tope, Math.max(0, Math.floor(c))) : 0
    const conDetencion = con[k] === true
    const celda = celdas.get(v)!
    if (conDetencion) {
      celda.con++
      const motivo = razon[k]
      if (motivo != null) celda.razones[motivo] = (celda.razones[motivo] ?? 0) + 1
    } else {
      celda.sin++
    }
    minutosPorZona[zonaDe(v)]++
    if (v > 0 && v < umbral && !conDetencion) {
      bajoSinDetencion++
      if (enArranque(k, con)) marchaInicial++
    }
  }

  const pctRitmo = n > 0 ? Math.round((minutosPorZona.ritmo / n) * 100) : 0
  const resto = repartirPorMayorResto([minutosPorZona.bajo, minutosPorZona.parcial, minutosPorZona.detenida], 100 - pctRitmo)
  const pctZona: Record<ZonaDesglose, number> = { ritmo: pctRitmo, bajo: resto[0] ?? 0, parcial: resto[1] ?? 0, detenida: resto[2] ?? 0 }

  const zonas: BloqueZona[] = ZONAS.map((zona) => {
    const vs = Array.from({ length: tope + 1 }, (_, i) => tope - i).filter((v) => zonaDe(v) === zona)
    const pctFilas = repartirPorMayorResto(vs.map((v) => celdas.get(v)!.sin + celdas.get(v)!.con), pctZona[zona])
    const filas: FilaDesglose[] = porZona ? [] : vs.map((v, i) => {
      const c = celdas.get(v)!
      return { v, mas: v === tope, zona, sin: c.sin, con: c.con, n: c.sin + c.con, pct: pctFilas[i] ?? 0, razones: c.razones }
    })
    return { zona, n: minutosPorZona[zona], pct: pctZona[zona], filas }
  })

  return { umbral, bajo, zonas, bajoSinDetencion, marchaInicial }
}

/**
 * El desglose de la LÍNEA: piezas de cada minuto sumadas entre sus Baaders, detención si alguna la tuvo, y solo por zona (`porZona`: sin
 * filas, porque una línea no tiene un motivo único). `varaLinea` es la vara de la línea: con perilla, `partes` es el número de Baaders y
 * su umbral calibrado es la suma de los de cada una.
 */
export function desgloseLineaDe(maquinas: Array<{ cycles: number[]; con: boolean[] }>, n: number, varaLinea: VaraUmbral): Desglose | null {
  const cycles = Array.from({ length: n }, (_, k) => maquinas.reduce((a, m) => a + (m.cycles[k] ?? 0), 0))
  const con = Array.from({ length: n }, (_, k) => maquinas.some((m) => m.con[k] === true))
  return desgloseDe({ cycles, n, vara: varaLinea, con, razon: Array.from({ length: n }, () => null), porZona: true })
}

/** Dos varas son la misma si tienen el mismo valor, la misma fuente, el mismo modo y las mismas partes (por omisión, calibrado y 1). */
function iguales(a: VaraUmbral, b: VaraUmbral): boolean {
  return a.cpm === b.cpm && a.fuente === b.fuente && (a.modo ?? MODO_UMBRAL_POR_OMISION) === (b.modo ?? MODO_UMBRAL_POR_OMISION) && (a.partes ?? 1) === (b.partes ?? 1)
}

/**
 * ¿Cambió la vara durante el turno? Quien llama pasa la vara de cada minuto; el desglose usa la del último, así que esto avisa si la vara
 * del último minuto no es la de todos (una anotación de perilla a mitad de turno). Sin minutos, no hubo cambio.
 */
export function varaCambio(varaK: VaraUmbral[]): boolean {
  if (varaK.length === 0) return false
  const ultima = varaK[varaK.length - 1]!
  return varaK.some((v) => !iguales(v, ultima))
}
