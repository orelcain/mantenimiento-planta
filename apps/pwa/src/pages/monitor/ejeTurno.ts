/**
 * Geometría y datos puros del «Eje del turno» (monitor en PC, opción B del 27-10).
 *
 * Sin React ni DOM: el componente (`EjeTurnoPC.tsx`) solo dibuja lo que sale de acá y los tests prueban las
 * reglas que no se pueden romper (eje creciente, proyección, línea detenida, carriles sin pisarse).
 *
 * Unidad de tiempo del eje: MINUTOS desde el inicio del turno (`iniMs`, wall-as-UTC como el resto del monitor).
 */
import type { DuenoPerdida, GrupoDelTurno } from '@/services/shoplogix/monitorEventos'

// ── Eje que crece ────────────────────────────────────────────────────────────

/** Mínimo de minutos que se asoman por delante del «ahora». */
export const MIN_ADELANTE = 90
/** O la mitad de lo transcurrido, lo que sea mayor. */
export const FRAC_ADELANTE = 0.5

/** El eje crece de a pasos de 15 min, no minuto a minuto: si no, cada lectura corre todo el dibujo unos píxeles. */
export const PASO_EJE_MIN = 15

/**
 * Hasta dónde llega el eje: «ahora» + 90 min o + la mitad de lo transcurrido (lo mayor), redondeado hacia arriba
 * a múltiplos de 15 min y topado en el fin del turno. Al principio el turno se ve de cerca; con 7,5 h de turno,
 * desde los 300 min ya cabe entero.
 */
export function finDelEje(ahoraMin: number, totalMin: number): number {
  const adelante = Math.max(MIN_ADELANTE, ahoraMin * FRAC_ADELANTE)
  const fin = Math.ceil((ahoraMin + adelante) / PASO_EJE_MIN) * PASO_EJE_MIN
  return Math.max(1, Math.min(totalMin, fin))
}

/** Separación de las marcas de hora: cada 30 min en un eje corto, cada hora en uno largo. */
export const pasoMarcas = (finMin: number) => (finMin <= 200 ? 30 : 60)

/** Escala Y «redonda» por encima del tope: 1.000 hasta 4.000, 2.000 hasta 10.000, 5.000 después. */
export function escalaY(tope: number): { paso: number; max: number } {
  const t = Math.max(1, tope * 1.1)
  const paso = t <= 4000 ? 1000 : t <= 10000 ? 2000 : 5000
  return { paso, max: Math.ceil(t / paso) * paso }
}

// ── Curva ────────────────────────────────────────────────────────────────────

export interface Punto { min: number; v: number }

/** Acumulado por minuto: `a[i]` = piezas hasta el inicio del minuto `i` (a[0] = 0). */
export function acumulado(porMinuto: number[]): number[] {
  const a = [0]
  for (const v of porMinuto) a.push(a[a.length - 1]! + v)
  return a
}

/**
 * El trazo sólido: los minutos cerrados hasta antes de la lectura anterior, y de ahí la recta real
 * anterior → última. Nunca baja (el acumulado no retrocede) ni pasa de la lectura anterior antes de tiempo.
 */
export function trazoHastaLectura(acum: number[], previa: Punto | null, ultima: Punto): Punto[] {
  const corte = previa ? previa.min : ultima.min
  const tope = previa ? previa.v : ultima.v
  const out: Punto[] = []
  for (let i = 0; i < acum.length; i++) {
    if (i >= corte) break
    out.push({ min: i, v: Math.min(acum[i]!, tope) })
  }
  if (previa) out.push(previa)
  out.push(ultima)
  return out
}

/** Valor de una curva (puntos ordenados por minuto) en el minuto `m`, interpolado; null fuera de su rango. */
export function valorEnCurva(ps: Punto[], m: number): number | null {
  if (ps.length === 0) return null
  if (m < ps[0]!.min) return null
  if (m > ps[ps.length - 1]!.min) return null
  for (let i = 0; i < ps.length - 1; i++) {
    const a = ps[i]!, b = ps[i + 1]!
    if (m >= a.min && m <= b.min) return b.min === a.min ? b.v : a.v + ((m - a.min) / (b.min - a.min)) * (b.v - a.v)
  }
  return ps[ps.length - 1]!.v
}

// ── Proyección ───────────────────────────────────────────────────────────────

export interface Proyeccion {
  desde: Punto
  /** Dónde termina en el eje que se ve (puede ser antes del cierre si el turno no se ve entero). */
  hasta: Punto
  /** Línea detenida: horizontal, al valor actual. */
  aplanada: boolean
  /** El eje llega al fin del turno: la punta ES la cifra «Al cierre». */
  alCierre: boolean
}

/**
 * La proyección punteada desde la punta hasta el final del eje. UNA sola fuente para el valor final:
 * `cierre` es la misma cifra de «Al cierre». Detenida, se aplana en horizontal (proyección en pausa).
 * Sin cierre calculado no hay proyección (null): jamás se inventa una pendiente.
 */
export function proyeccion(args: { punta: Punto; finEje: number; totalMin: number; cierre: number | null; detenida: boolean }): Proyeccion | null {
  const { punta, finEje, totalMin, cierre, detenida } = args
  if (finEje <= punta.min) return null
  const alCierre = finEje >= totalMin
  if (detenida) {
    return { desde: punta, hasta: { min: finEje, v: punta.v }, aplanada: true, alCierre }
  }
  if (cierre == null || totalMin <= punta.min) return null
  const v = alCierre ? cierre : punta.v + ((cierre - punta.v) * (finEje - punta.min)) / (totalMin - punta.min)
  return { desde: punta, hasta: { min: finEje, v: Math.max(punta.v, v) }, aplanada: false, alCierre }
}

// ── Minuto a minuto y carriles ───────────────────────────────────────────────

export type TonoRitmo = 'bien' | 'atento' | 'mal' | 'sin'

/** Los cortes de Shoplogix: ≥75 % del esperado bien, 50–75 atento, <50 mal. Sin esperado, solo si hubo piezas. */
export function tonoRitmo(v: number | null | undefined, esperado: number | null): TonoRitmo {
  if (v == null) return 'sin'
  if (esperado == null || esperado <= 0) return v > 0 ? 'bien' : 'sin'
  const r = v / esperado
  return r >= 0.75 ? 'bien' : r >= 0.5 ? 'atento' : 'mal'
}

/** % de los minutos que anduvieron a ritmo (≥75 % del esperado); null sin esperado ni minutos. */
export function pctARitmo(ciclos: Array<number | null | undefined>, esperado: number | null): number | null {
  const datos = ciclos.filter((c): c is number => c != null)
  if (esperado == null || esperado <= 0 || datos.length === 0) return null
  return Math.round((datos.filter((c) => tonoRitmo(c, esperado) === 'bien').length / datos.length) * 100)
}

/** Suma por minuto de varias máquinas (la línea). Solo hasta `n` minutos. */
export function sumaPorMinuto(maquinas: Array<{ cycles: number[] }>, n: number): number[] {
  return Array.from({ length: n }, (_, k) => maquinas.reduce((a, m) => a + (m.cycles[k] ?? 0), 0))
}

/** Minutos que se dibujan: los de la serie más corta; cerrado, sin la cola en cero (el turno ya terminó). */
export function minutosVisibles(maquinas: Array<{ cycles: number[] }>, cerrado: boolean): number {
  let n = maquinas.length ? Math.min(...maquinas.map((m) => m.cycles.length)) : 0
  if (cerrado) {
    const suma = sumaPorMinuto(maquinas, n)
    while (n > 2 && suma[n - 1] === 0) n--
  }
  return n
}

// ── Paradas con dueño ────────────────────────────────────────────────────────

export interface ParadaEje {
  desdeMin: number
  hastaMin: number
  dueno: DuenoPerdida
  causa: string
  maquina: string | null
}

/**
 * Las paradas de `agruparEventos`, ubicadas en el eje del turno. Sus `desdeMin/hastaMin` cuentan desde el primer
 * dato (`t0Ms`); acá se pasan a minutos desde el inicio del turno (`iniMs`). Las que no se pueden ubicar se omiten.
 */
export function paradasEnEje(grupos: GrupoDelTurno[] | null | undefined, t0Ms: number | null, iniMs: number): ParadaEje[] {
  if (!grupos || t0Ms == null || !Number.isFinite(t0Ms)) return []
  const out: ParadaEje[] = []
  for (const g of grupos) {
    for (const c of g.causas) {
      for (const p of c.paradas) {
        if (p.desdeMin == null || p.hastaMin == null) continue
        out.push({
          desdeMin: (t0Ms + p.desdeMin * 60_000 - iniMs) / 60_000,
          hastaMin: (t0Ms + p.hastaMin * 60_000 - iniMs) / 60_000,
          dueno: g.dueno,
          causa: c.reason,
          maquina: p.maquina ?? null,
        })
      }
    }
  }
  return out.sort((a, b) => a.desdeMin - b.desdeMin)
}

/** La parada que cubre el minuto `m` (la más larga si hay varias), o null. */
export function paradaEn(paradas: ParadaEje[], m: number): ParadaEje | null {
  let mejor: ParadaEje | null = null
  for (const p of paradas) {
    if (m >= p.desdeMin && m < Math.max(p.hastaMin, p.desdeMin + 1)) {
      if (!mejor || p.hastaMin - p.desdeMin > mejor.hastaMin - mejor.desdeMin) mejor = p
    }
  }
  return mejor
}

// ── Diseño vertical ──────────────────────────────────────────────────────────

export interface Diseno {
  pl: number
  pr: number
  plotW: number
  pt: number
  curva: { y0: number; h: number }
  barras: { y0: number; h: number }
  carriles: Array<{ y0: number; h: number }>
  paradas: { y0: number; h: number }
  ejeX: number
}

/** Cuánto debe medir el lienzo, como mínimo, para que la curva tenga cuerpo. */
export const CURVA_MIN = 120

/**
 * Reparte el alto del lienzo: curva (lo que sobra) · barras por minuto (15 %) · un carril por máquina · paradas · eje X.
 * En pantalla compacta (1366×768) los carriles bajan de 26 a 18 px y el margen de etiquetas de 170 a 150.
 */
export function disenar(w: number, h: number, nMaquinas: number, compacto: boolean): Diseno {
  const pl = 58
  const pr = compacto ? 150 : 170
  const pt = 10
  const pb = 28
  const gap = 14
  const eq = compacto ? 18 : 26
  const par = compacto ? 18 : 26
  const barrasH = Math.round(h * (compacto ? 0.13 : 0.15))
  const lanesTot = barrasH + gap + nMaquinas * (eq + 5) + gap + par + 8
  const curvaH = Math.max(CURVA_MIN, h - pt - pb - lanesTot)
  let y = pt + curvaH + gap
  const barras = { y0: y, h: barrasH }
  y += barrasH + gap
  const carriles = Array.from({ length: nMaquinas }, (_, i) => ({ y0: y + i * (eq + 5), h: eq }))
  y += nMaquinas * (eq + 5) + gap - 5
  const paradas = { y0: y, h: par }
  const ejeX = y + par + 16
  return { pl, pr, plotW: Math.max(40, w - pl - pr), pt, curva: { y0: pt, h: curvaH }, barras, carriles, paradas, ejeX }
}
