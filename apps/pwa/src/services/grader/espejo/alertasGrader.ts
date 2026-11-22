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
  /** Atasco: piezas acumuladas entre las Baader y el grader en la ventana que lo dispara. */
  atascoPz: number
  /** Atasco: minutos de la ventana que se suma. */
  atascoVentanaMin: number
  /** Atasco: promedio mínimo de las Baader (corridas) en la ventana, pz/min. */
  atascoBaaderPzMin: number
  /** Atasco: minutos sin avisar después de un arranque de las Baader. */
  atascoArranqueMin: number
  /** Atasco: minutos de la razón grader/Baader («la hora anterior»), que terminan donde empieza la ventana. */
  atascoRazonMin: number
  /** Atasco: piezas de las Baader mínimas en la hora anterior para creerle a la razón (si no, razón 1). */
  atascoRazonMinPiezas: number
  /** Atasco: minutos que el aviso sigue a la vista después del último minuto sobre el umbral. */
  atascoVigenteMin: number
}

export const UMBRALES_ALERTAS: UmbralesAlertas = {
  quietoMin: 5,
  p0CriticoPct: 3.5,
  p0MinPiezas: 50,
  latidoMin: 20,
  pesoBanda: 0.15,
  pesoMinPiezas: 200,
  calibreVentajaPp: 5,
  atascoPz: 80,
  atascoVentanaMin: 10,
  atascoBaaderPzMin: 20,
  atascoArranqueMin: 15,
  atascoRazonMin: 60,
  atascoRazonMinPiezas: 500,
  atascoVigenteMin: 15,
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
  /**
   * Minutos del eje que el lector leyó ENTEROS: la última lectura completa (sin tramo pendiente) fue en el minuto
   * `leidoHastaMin`, así que [0, leidoHastaMin) está cerrado aunque no traiga piezas. Sin este dato se usa
   * `hastaMin - 1` (el minuto de la última pieza puede seguir abierto). Nunca el reloj: el lector envía cada 5 min.
   */
  leidoHastaMin?: number | null
  /** Minutos desde el último latido del lector; `null` si nunca latió. */
  minutosSinLatido: number | null
  turnoEnCurso: boolean
  umbrales?: Partial<UmbralesAlertas>
}

export type ReglaAlerta = 'grader-quieto' | 'sin-datos-grader' | 'p0-alto' | 'lector-caido' | 'peso-fuera' | 'calibre-salto' | 'atasco' | 'lote-cambio' | 'escalon' | 'gate-cambio'

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
  return (Math.round(n * 10) / 10).toFixed(1).replace('.', ',') // decimal-tecnico: sin imports (va a functions), ya pasa a coma
}

/** Entero con punto de miles: 1234 → «1.234». */
export function milesPunto(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** Minutos cerrados: los leídos enteros, o hasta la última pieza sin contar su minuto (puede seguir abierto). */
export function minutosCerrados(e: Pick<EntradaAlertas, 'hastaMin' | 'leidoHastaMin'>): number {
  const l = e.leidoHastaMin
  return l !== null && l !== undefined && Number.isFinite(l) ? Math.max(0, Math.floor(l)) : Math.max(0, e.hastaMin - 1)
}

const suma = (a: readonly number[], desde: number, hasta: number): number => {
  let s = 0
  for (let i = Math.max(0, desde); i < Math.min(a.length, hasta); i++) {
    const v = a[i] ?? 0
    if (Number.isFinite(v)) s += v // minuto sin cobertura (NaN) no suma
  }
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

/**
 * Regla 1: el grader lleva ≥ N min sin piezas mientras las Baader (corridas por el retraso) cuentan en CADA minuto.
 * Si el grader no tiene NINGUNA pieza en lo leído, avisa «sin datos del grader» en vez de «sin piezas».
 */
export function reglaGraderQuieto(e: EntradaAlertas, u: UmbralesAlertas): AlertaGrader | null {
  if (!e.baader) return null
  const L = Math.max(0, Math.round(e.retrasoMin))
  // Hasta lo leído entero (con minutos vacíos: un grader detenido no deja piezas) y, de las Baader, solo minutos cerrados.
  const hasta = Math.min(minutosCerrados(e), e.baader.length + L)
  if (hasta < u.quietoMin) return null
  // Ninguna pieza del grader en todo lo leído, con las Baader entregando: el espejo no trae el turno (Matrix no
  // entregó sus piezas o el lector no lo leyó, como el 18-11 T1 y el 21-11 T2). No es un grader detenido.
  if (suma(e.grader.pz, 0, hasta) === 0) {
    const baaderTotal = suma(e.baader, -L, hasta - L)
    if (baaderTotal <= 0) return null
    return {
      regla: 'sin-datos-grader',
      nivel: 'atento',
      desdeMin: 0,
      titulo: 'Sin datos del grader en este turno',
      detalle: `Las Baader entregaron ${milesPunto(baaderTotal)} piezas y el espejo no trae ninguna del grader: el lector no leyó este turno o Matrix no entregó sus piezas. No es una detención del grader.`,
    }
  }
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
  const ts = tramos15(e.t0Ms, minutosCerrados(e)).filter((t) => t.completo && t.hasta - t.desde === 15)
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
  const h = minutosCerrados(e)
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
    // 3,4 / 4 − 1 da −0,15000000000000002: justo en el borde no es «fuera».
    if (Math.abs(d) - u.pesoBanda > 1e-9) {
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

/** Un minuto evaluado por la regla de atasco. */
export interface MinutoAtasco {
  /** Minuto del eje (el último de la ventana). */
  m: number
  /** Piezas acumuladas en la ventana: Baader corridas × razón − grader. */
  acumulado: number
  /** Piezas de las Baader corridas y del grader en la ventana. */
  baader: number
  grader: number
  /** Razón grader/Baader de la hora anterior a la ventana (1 sin masa). */
  razon: number
  /** Cumple todo: umbral, Baader andando y fuera de un arranque. */
  dispara: boolean
}

/**
 * Regla 5 (aprobada el 21-11): se acumulan piezas entre las Baader y el grader (clasificado manual, corte de cabeza
 * o el propio grader). Los atascos reales duran 3-5 min: «grader quieto ≥ 5 min» no los ve.
 *
 * Por minuto `i`, en la ventana de 10 min que termina en `i`: acumulado = Baader corridas por el retraso × razón −
 * grader. La razón es grader/Baader de los 60 min anteriores a la ventana, porque el grader cuenta 1,4-15 % más que
 * las Baader y el tránsito absoluto se desvía. Exige las Baader andando (promedio de la ventana ≥ 20 pz/min: la
 * serie real por minuto trae bajones de 1-2 min que un mínimo por minuto confundiría con una parada) y descarta los
 * 15 min siguientes a un arranque, cuando las Baader parten antes que el grader. Un arranque es el minuto en que el
 * promedio de 5 min de las Baader corridas pasa de bajo 20 a 20 o más (el inicio del turno cuenta: antes no hay
 * dato). Un minuto de las Baader sin dato (`NaN`) no cumple.
 */
export function minutosAtasco(e: EntradaAlertas, u: UmbralesAlertas, desde: number, hasta: number): MinutoAtasco[] {
  const b = e.baader
  if (!b) return []
  const L = Math.max(0, Math.round(e.retrasoMin))
  const bs = (j: number): number => {
    const v = j - L >= 0 ? b[j - L] : undefined
    return v !== undefined && Number.isFinite(v) ? v : NaN
  }
  const media5 = (fin: number): number => {
    let s = 0
    for (let j = fin - 5; j < fin; j++) {
      const v = bs(j)
      if (Number.isFinite(v)) s += v
    }
    return s / 5
  }
  const V = u.atascoVentanaMin
  const out: MinutoAtasco[] = []
  for (let i = Math.max(0, desde); i < hasta; i++) {
    const ini = i - V + 1
    if (ini < 0) continue
    let sb = 0
    let sg = 0
    let completa = true
    for (let j = ini; j <= i; j++) {
      const v = bs(j)
      if (!Number.isFinite(v)) { completa = false; break }
      sb += v
      sg += e.grader.pz[j] ?? 0
    }
    if (!completa) continue
    let rb = 0
    let rg = 0
    for (let j = Math.max(0, ini - u.atascoRazonMin); j < ini; j++) {
      const v = bs(j)
      if (!Number.isFinite(v)) continue
      rb += v
      rg += e.grader.pz[j] ?? 0
    }
    const razon = rb >= u.atascoRazonMinPiezas ? rg / rb : 1
    const acumulado = sb * razon - sg
    let arranque = false
    for (let x = i; x > i - u.atascoArranqueMin && x >= 0; x--) {
      if (media5(x + 1) >= u.atascoBaaderPzMin && media5(x) < u.atascoBaaderPzMin) { arranque = true; break }
    }
    const dispara = acumulado >= u.atascoPz && sb / V >= u.atascoBaaderPzMin && !arranque
    out.push({ m: i, acumulado, baader: sb, grader: sg, razon, dispara })
  }
  return out
}

/** La regla 5 en vivo: el último episodio de atasco de los últimos 15 min (sigue a la vista aunque ya drenó). */
export function reglaAtasco(e: EntradaAlertas, u: UmbralesAlertas): AlertaGrader | null {
  if (!e.baader) return null
  const L = Math.max(0, Math.round(e.retrasoMin))
  // Hasta lo leído entero del grader y lo que alcanza la serie de las Baader corrida.
  const hasta = Math.min(minutosCerrados(e), e.baader.length + L)
  const desde = hasta - u.atascoVigenteMin
  // Se evalúa desde antes para poder seguir el episodio hacia atrás hasta su inicio.
  const ms = minutosAtasco(e, u, desde - 30, hasta)
  let k = ms.length - 1
  while (k >= 0 && !(ms[k]!.dispara && ms[k]!.m >= desde)) k--
  if (k < 0) return null
  const ultimo = ms[k]!
  // El episodio: minutos seguidos que disparan, hacia atrás desde el último.
  let j = k
  while (j > 0 && ms[j - 1]!.dispara && ms[j - 1]!.m === ms[j]!.m - 1) j--
  const inicio = ms[j]!
  let pico = inicio
  for (let x = j; x <= k; x++) if (ms[x]!.acumulado > pico.acumulado) pico = ms[x]!
  const activo = ultimo.m === hasta - 1
  const aprox = Math.round(pico.acumulado / 10) * 10
  const hora = horaDelEje(e.t0Ms, pico.m)
  // Las Baader se muestran ya llevadas a la cuenta del grader, para que la resta se pueda hacer de cabeza.
  const corregidas = Math.abs(pico.razon - 1) > 0.005 ? ' (llevadas a la cuenta del grader con la hora anterior)' : ''
  return {
    regla: 'atasco',
    nivel: 'atento',
    desdeMin: inicio.m,
    titulo: `${hora} · ~${milesPunto(aprox)} piezas acumuladas entre las Baader y el grader`,
    detalle:
      `En los ${u.atascoVentanaMin} min hasta las ${hora} las Baader entregaron ${milesPunto(pico.baader * pico.razon)} piezas${corregidas} y al grader llegaron ${milesPunto(pico.grader)}. ` +
      (activo ? 'Sigue acumulándose. ' : `Dejó de crecer a las ${horaDelEje(e.t0Ms, ultimo.m + 1)}. `) +
      'Puede ser el clasificado manual, el corte de cabeza o el grader.',
  }
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
  // Con el grader quieto ≥ 5 min ese aviso ya dice lo mismo, más fuerte.
  const atasco = quieto ? null : reglaAtasco(e, u)
  if (atasco) out.push(atasco)
  out.push(...reglasPesoYCalibre(e, u))
  const peso = { mal: 0, atento: 1 }
  return out.sort((a, b) => peso[a.nivel] - peso[b.nivel] || a.desdeMin - b.desdeMin)
}
