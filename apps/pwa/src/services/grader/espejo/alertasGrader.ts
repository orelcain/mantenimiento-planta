/**
 * Reglas de alerta del grader en vivo (etapa E-A), lógica PURA y sin imports.
 *
 * La pestaña Grader del monitor las pinta; en E-B la función `espejoGraderIngesta` las
 * evalúa para Telegram. Por eso este archivo no toca Firebase, React ni el DOM y no
 * importa nada: se puede empaquetar a `functions/lib/*.cjs` con esbuild, igual que
 * `dueloNucleo.ts` (`scripts/build-duelo-nucleo.mjs`).
 *
 * Entrada: series por MINUTO desde `t0Ms` (wall-clock-as-UTC, la convención de Shoplogix
 * y del espejo: la hora de planta es la del ISO). El índice `m` es el minuto
 * [t0 + m, t0 + m + 1). Las Baader van en el MISMO eje, sin correr: la regla aplica el
 * retraso Baader → grader.
 *
 * Horizonte: todo se evalúa hasta `hastaMin` (la última pieza leída por el lector, no
 * el reloj). El lector envía cada 5 min: contra el reloj, «5 min sin piezas» saltaría en
 * cada ciclo de lectura.
 */

/** Umbrales de las reglas (las del plan aprobado el 21-11). */
export interface UmbralesAlertas {
  /** Minutos seguidos sin piezas en el grader con las Baader contando. */
  quietoMin: number
  /** P0 % sobre el que un tramo de 15 min alerta (mismo default que `DEFAULT_P0_CRITICAL_PCT`). */
  p0CriticoPct: number
  /** Piezas mínimas del tramo de 15 min para creerle al P0 % (`P0_LINE_MIN_PIECES`). */
  p0MinPiezas: number
  /** Minutos sin latido del lector, con turno en curso. */
  latidoMin: number
  /** Banda del peso medio de la última hora frente al resto del turno (fracción: 0,15 = ± 15 %). */
  pesoBanda: number
  /** Piezas con peso mínimas en la última hora y en el resto del turno para comparar peso y calibre. */
  pesoMinPiezas: number
  /** Ventaja mínima (puntos %) del calibre nuevo sobre el dominante del turno para llamarlo «salto». */
  calibreVentajaPp: number
}

export const UMBRALES_ALERTAS: UmbralesAlertas = {
  quietoMin: 5,
  p0CriticoPct: 3.5,
  p0MinPiezas: 50,
  latidoMin: 20,
  pesoBanda: 0.15,
  pesoMinPiezas: 200,
  calibreVentajaPp: 5,
}

/** Lo que el grader clasificó en cada minuto (todas las gates salvo donde se dice). */
export interface MinutosGrader {
  /** Piezas de TODAS las gates (incluida la 0). */
  pz: number[]
  /** Piezas de Gate 0. */
  g0: number[]
  /** kg de salida: gates 1 en adelante, solo filas con peso > 0. */
  kgSalida: number[]
  /** Piezas de salida con peso > 0 (el divisor del peso medio). */
  pzPeso: number[]
  /** Piezas de salida por calibre (sin Gate 0). `undefined` = minuto sin salida. */
  calibre: Array<Record<string, number> | undefined>
}

export interface EntradaAlertas {
  /** Minuto 0 del eje (ms, wall-clock-as-UTC). */
  t0Ms: number
  grader: MinutosGrader
  /** Piezas por minuto de las Baader sumadas, en el mismo eje; `null` sin dato de Shoplogix. */
  baader: number[] | null
  /** Retraso Baader → grader en minutos (lo que tarda una pieza en llegar al grader). */
  retrasoMin: number
  /** Minutos del eje con dato del grader: la última pieza leída cae en `hastaMin - 1`. */
  hastaMin: number
  /** Minutos desde el último latido del lector; `null` si nunca latió. */
  minutosSinLatido: number | null
  turnoEnCurso: boolean
  umbrales?: Partial<UmbralesAlertas>
}

export type ReglaAlerta = 'grader-quieto' | 'p0-alto' | 'lector-caido' | 'peso-fuera' | 'calibre-salto'

export interface AlertaGrader {
  regla: ReglaAlerta
  /** `mal` pide actuar ya; `atento`, mirar. */
  nivel: 'mal' | 'atento'
  /** Minuto del eje donde empezó (para ordenar y para el enfriamiento de E-B). */
  desdeMin: number
  titulo: string
  detalle: string
}

// ── Formato (sin `toLocaleString`: el backend no garantiza la zona ni el idioma) ──

/** «HH:MM» del minuto `m` del eje. */
export function horaDelEje(t0Ms: number, m: number): string {
  return new Date(t0Ms + m * 60_000).toISOString().slice(11, 16)
}

/** Un decimal con coma: 3.849 → «3,8». */
export function coma1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',')
}

/** Entero con punto de miles: 1234 → «1.234». */
export function milesPunto(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

const suma = (a: readonly number[], desde: number, hasta: number): number => {
  let s = 0
  for (let i = Math.max(0, desde); i < Math.min(a.length, hasta); i++) s += a[i] ?? 0
  return s
}

/** Calibres sumados en [desde, hasta). */
export function sumarCalibres(c: MinutosGrader['calibre'], desde: number, hasta: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (let i = Math.max(0, desde); i < Math.min(c.length, hasta); i++) {
    const r = c[i]
    if (!r) continue
    for (const k in r) out[k] = (out[k] ?? 0) + (r[k] ?? 0)
  }
  return out
}

/** El calibre con más piezas y su participación (0-100); `null` sin piezas. Empate: orden alfabético. */
export function dominante(r: Record<string, number>): { calibre: string; pct: number; n: number } | null {
  let total = 0
  let mejor: string | null = null
  for (const k of Object.keys(r).sort()) {
    const v = r[k] ?? 0
    total += v
    if (mejor === null || v > (r[mejor] ?? 0)) mejor = k
  }
  if (mejor === null || total <= 0) return null
  return { calibre: mejor, pct: ((r[mejor] ?? 0) / total) * 100, n: total }
}

// ── Reglas ──────────────────────────────────────────────────────────────────

/** Regla 1: el grader lleva ≥ N min sin piezas mientras las Baader (corridas por el retraso) cuentan en CADA minuto. */
export function reglaGraderQuieto(e: EntradaAlertas, u: UmbralesAlertas): AlertaGrader | null {
  if (!e.baader) return null
  const L = Math.max(0, Math.round(e.retrasoMin))
  // Una Baader solo cuenta con minuto cerrado: el horizonte es el menor de los dos.
  const hasta = Math.min(e.hastaMin, e.baader.length + L)
  if (hasta < u.quietoMin) return null
  const baaderEn = (m: number) => (m - L >= 0 ? e.baader![m - L] ?? 0 : 0)
  const quieto = (m: number) => (e.grader.pz[m] ?? 0) === 0 && baaderEn(m) > 0
  for (let m = hasta - u.quietoMin; m < hasta; m++) if (!quieto(m)) return null
  let desde = hasta - u.quietoMin
  while (desde > 0 && quieto(desde - 1)) desde--
  const min = hasta - desde
  const baader = suma(e.baader, desde - L, hasta - L)
  return {
    regla: 'grader-quieto',
    nivel: 'mal',
    desdeMin: desde,
    titulo: `Grader sin piezas ${min} min con las Baader andando`,
    detalle: `Desde las ${horaDelEje(e.t0Ms, desde)}: las Baader entregaron ${milesPunto(baader)} piezas y al grader no llegó ninguna.`,
  }
}

/**
 * Tramos de 15 min alineados al cuarto de hora del reloj de planta (07:15, 07:30…), recortados a [0, hasta).
 * `completo` = el tramo terminó antes de `hasta`.
 */
export function tramos15(t0Ms: number, hasta: number): Array<{ desde: number; hasta: number; completo: boolean }> {
  const out: Array<{ desde: number; hasta: number; completo: boolean }> = []
  if (hasta <= 0) return out
  const minDia = Math.floor(t0Ms / 60_000)
  // Primer borde de cuarto de hora en o después del minuto 0.
  const resto = ((minDia % 15) + 15) % 15
  let a = 0
  let b = resto === 0 ? 15 : 15 - resto
  while (a < hasta) {
    out.push({ desde: a, hasta: Math.min(b, hasta), completo: b <= hasta })
    a = b
    b += 15
  }
  return out
}

/** Regla 2: el último tramo de 15 min COMPLETO tiene P0 % sobre el umbral, con masa suficiente. */
export function reglaP0Alto(e: EntradaAlertas, u: UmbralesAlertas): AlertaGrader | null {
  const ts = tramos15(e.t0Ms, e.hastaMin).filter((t) => t.completo && t.hasta - t.desde === 15)
  const t = ts[ts.length - 1]
  if (!t) return null
  const total = suma(e.grader.pz, t.desde, t.hasta)
  const g0 = suma(e.grader.g0, t.desde, t.hasta)
  if (total < u.p0MinPiezas) return null
  const pct = (g0 / total) * 100
  // 7 / 200 · 100 da 3,5000000000000004 en coma flotante: «justo 3,5 %» no es «sobre 3,5 %».
  if (!(pct - u.p0CriticoPct > 1e-9)) return null
  return {
    regla: 'p0-alto',
    nivel: 'mal',
    desdeMin: t.desde,
    titulo: `P0 ${coma1(pct)} % de ${horaDelEje(e.t0Ms, t.desde)} a ${horaDelEje(e.t0Ms, t.hasta)}`,
    detalle: `Sobre ${coma1(u.p0CriticoPct)} % los 15 min completos: ${milesPunto(g0)} de ${milesPunto(total)} piezas a Gate 0.`,
  }
}

/** Regla 3: el lector del PC de planta no avisa hace ≥ 20 min con el turno en curso. */
export function reglaLectorCaido(e: EntradaAlertas, u: UmbralesAlertas): AlertaGrader | null {
  if (!e.turnoEnCurso || e.minutosSinLatido === null || e.minutosSinLatido < u.latidoMin) return null
  const ult = e.hastaMin > 0 ? ` La última pieza leída es de las ${horaDelEje(e.t0Ms, e.hastaMin - 1)}.` : ''
  return {
    regla: 'lector-caido',
    nivel: 'mal',
    desdeMin: Math.max(0, e.hastaMin),
    titulo: `Lector sin aviso hace ${Math.floor(e.minutosSinLatido)} min`,
    detalle: `El PC de planta dejó de enviar: Matrix cerrado, PC apagado o lector detenido.${ult}`,
  }
}

/**
 * Regla 4: la última hora (hasta la última pieza leída) frente al RESTO del turno. Peso medio fuera de la banda, o
 * calibre dominante distinto con una ventaja clara (si no, un empate 40/39 % saltaría a cada rato).
 */
export function reglasPesoYCalibre(e: EntradaAlertas, u: UmbralesAlertas): AlertaGrader[] {
  const h = e.hastaMin
  const ini = h - 60
  if (ini <= 0) return []
  const out: AlertaGrader[] = []
  const kgH = suma(e.grader.kgSalida, ini, h)
  const nH = suma(e.grader.pzPeso, ini, h)
  const kgT = suma(e.grader.kgSalida, 0, ini)
  const nT = suma(e.grader.pzPeso, 0, ini)
  if (nH >= u.pesoMinPiezas && nT >= u.pesoMinPiezas) {
    const pH = kgH / nH
    const pT = kgT / nT
    const d = pH / pT - 1
    if (Math.abs(d) > u.pesoBanda) {
      out.push({
        regla: 'peso-fuera',
        nivel: 'atento',
        desdeMin: ini,
        titulo: `Peso medio de la última hora ${coma1(pH)} kg (${d > 0 ? '+' : '−'}${Math.round(Math.abs(d) * 100)} %)`,
        detalle: `Fuera de ± ${Math.round(u.pesoBanda * 100)} % del resto del turno (${coma1(pT)} kg). Cambió la pesca o se corrió la balanza.`,
      })
    }
  }
  const cH = sumarCalibres(e.grader.calibre, ini, h)
  const cT = sumarCalibres(e.grader.calibre, 0, ini)
  const dH = dominante(cH)
  const dT = dominante(cT)
  if (dH && dT && dH.n >= u.pesoMinPiezas && dT.n >= u.pesoMinPiezas && dH.calibre !== dT.calibre) {
    const viejoEnHora = ((cH[dT.calibre] ?? 0) / dH.n) * 100
    if (dH.pct - viejoEnHora >= u.calibreVentajaPp) {
      out.push({
        regla: 'calibre-salto',
        nivel: 'atento',
        desdeMin: ini,
        titulo: `Calibre dominante pasó a ${dH.calibre}`,
        detalle: `En la última hora ${dH.calibre} es el ${Math.round(dH.pct)} % de la salida; en el resto del turno mandaba ${dT.calibre} (${Math.round(dT.pct)} %).`,
      })
    }
  }
  return out
}

/** Todas las reglas, las de nivel `mal` primero y luego por minuto de inicio. */
export function evaluarAlertas(e: EntradaAlertas): AlertaGrader[] {
  const u: UmbralesAlertas = { ...UMBRALES_ALERTAS, ...e.umbrales }
  const out: AlertaGrader[] = []
  const lector = reglaLectorCaido(e, u)
  if (lector) out.push(lector)
  const quieto = reglaGraderQuieto(e, u)
  if (quieto) out.push(quieto)
  const p0 = reglaP0Alto(e, u)
  if (p0) out.push(p0)
  out.push(...reglasPesoYCalibre(e, u))
  const peso = { mal: 0, atento: 1 }
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel] || a.desdeMin - b.desdeMin)
}
