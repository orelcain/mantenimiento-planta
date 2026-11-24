/**
 * «Piezas por minuto» de Grader en vivo (mockup v4, versión 5 aprobada por Orel el 23-11): las cuentas del gráfico
 * ECharts, puras y aparte del componente para probarlas sin canvas.
 *
 * El eje x es el MINUTO DEL GRADER desde el inicio del turno: la curva del grader, el P0, los minutos sin lectura y
 * los lotes caen donde los leyó el espejo. Las Baader se corren `retraso` minutos hacia adelante (lo que tarda una
 * pieza en llegar al grader), igual que sus detenciones.
 *
 * Horas: Shoplogix y el espejo guardan la hora de planta como si fuera UTC → `useUTC` y `getUTC*` siempre.
 */
import type { EChartsOption } from 'echarts'
import { DEFAULT_P0_CRITICAL_PCT, P0_LINE_MIN_PIECES } from '@/services/grader/graderP0Thresholds'
import { coma1, horaDelEje, milesPunto } from '@/services/grader/espejo/alertasGrader'
import type { PiezaP0 } from '@/services/grader/espejo/motivoP0'
import type { DatosGraderVivo } from './graderVivoDatos'
import { tramosManual } from './lineaManualDatos'
import { franjaLotes, loteCorto, loteDelMinuto, rotuloFranja, type FranjaLote } from './lotesTurnoDatos'

/** Lo más que se acerca el zoom: 5 minutos a la vista. */
export const ZOOM_MIN_MIN = 5
/** Marcas de hora con rótulo en el eje, como máximo. */
export const MAX_MARCAS = 8
/** Con MÁS de estos minutos a la vista, el P0 va en barras de 15 min en %; si no, por minuto en piezas. */
export const P0_15_SOBRE_MIN = 60
/** A menos de este ancho (px), la banda sin lectura va sin rótulo. */
export const ROTULO_HUECO_MIN_PX = 70
/** A menos de este ancho (px), el corchete de una detención va sin la palabra «detenida». */
export const ROTULO_DETENIDA_MIN_PX = 56
/** Ancho mínimo por marca rotulada («04:30» a 12 px). */
const PX_POR_MARCA = 36
/** Pasos posibles del eje, en minutos. */
const PASOS = [1, 2, 5, 10, 15, 30, 60, 120] as const

export type ModoP0 = '15' | 'min'
export type FiltroDueno = '' | 'mant' | 'seteo'
export interface Ventana { a: number; b: number }

export function modoP0(v: Ventana): ModoP0 {
  return v.b - v.a > P0_15_SOBRE_MIN ? '15' : 'min'
}

/** Ventana dentro de [0, hasta] y de al menos `ZOOM_MIN_MIN` minutos (o todo, si el turno es más corto). */
export function limitarVentana(v: Ventana, hasta: number): Ventana {
  const tope = Math.max(1, hasta)
  const len = Math.max(Math.min(ZOOM_MIN_MIN, tope), Math.min(tope, v.b - v.a))
  let a = Math.round(v.a)
  if (a < 0) a = 0
  let b = a + len
  if (b > tope) { b = tope; a = tope - len }
  return { a: Math.round(a), b: Math.round(b) }
}

/**
 * Zoom anclado: `factor` < 1 acerca, > 1 aleja, y el minuto que está en la fracción `frac` (0–1) del ancho útil
 * se queda bajo el dedo o el cursor. `desplazMin` mueve la ventana (arrastre). Puro: lo prueban los gestos.
 */
export function zoomAncla(v: Ventana, factor: number, frac: number, hasta: number, desplazMin = 0): Ventana {
  const f = Math.min(1, Math.max(0, frac))
  const largo = v.b - v.a
  const ancla = v.a + largo * f
  const nuevo = Math.max(1, largo * factor)
  return limitarVentana({ a: ancla - nuevo * f + desplazMin, b: ancla + nuevo * (1 - f) + desplazMin }, hasta)
}

/**
 * La ventana al llegar dato nuevo: si estaba pegada al final, avanza con él (mismo largo); si no, se queda donde
 * la dejó la persona.
 */
export function seguirVentana(v: Ventana, hastaAntes: number, hastaAhora: number): Ventana {
  if (v.b >= hastaAntes && hastaAhora > hastaAntes) return limitarVentana({ a: v.a + (hastaAhora - hastaAntes), b: hastaAhora }, hastaAhora)
  return limitarVentana(v, hastaAhora)
}

/** Ventana con que abre: en el celular la última hora; en pantalla ancha, todo el turno. */
export function ventanaInicial(hasta: number, angosta: boolean): Ventana {
  return limitarVentana(angosta ? { a: hasta - 60, b: hasta } : { a: 0, b: hasta }, hasta)
}

/**
 * Paso del eje: el más fino que deja como mucho `MAX_MARCAS` horas redondas a la vista (y una cada 36 px). La raya
 * menor va entre marcas cuando cabe. `minDia0` = minuto del reloj del inicio del turno (las marcas caen en horas
 * redondas del reloj, no del turno: el turno parte 21:15).
 */
export function pasoEje(minDia0: number, v: Ventana, anchoPx: number): { paso: number; menor: number } {
  const len = v.b - v.a
  const maxT = Math.max(3, Math.min(MAX_MARCAS, Math.floor(anchoPx / PX_POR_MARCA)))
  const base = len <= 10 ? 1 : len <= 30 ? 5 : len <= 60 ? 10 : len <= 120 ? 15 : len <= 240 ? 30 : 60
  let paso: number = base
  for (const p of PASOS) {
    if (p < base) continue
    paso = p
    if (Math.floor((minDia0 + v.b) / p) - Math.ceil((minDia0 + v.a) / p) + 1 <= maxT) break
  }
  const menor = paso >= 60 ? 15 : paso >= 15 ? 5 : paso >= 5 ? 1 : 0
  return { paso, menor }
}

/** Minutos del eje (desde el inicio del turno) que caen en múltiplos de `paso` del reloj, dentro de la ventana. */
export function marcasEje(minDia0: number, v: Ventana, paso: number): number[] {
  if (paso <= 0) return []
  const out: number[] = []
  for (let m = Math.ceil((minDia0 + v.a) / paso) * paso - minDia0; m <= v.b; m += paso) out.push(m)
  return out
}

/** Una barra de P0: tramo [x0, x1) en minutos; alto en piezas (modo minuto) o en % (modo 15). */
export interface BarraP0 {
  x0: number
  x1: number
  mant: number
  seteo: number
  /** Tramo de 15 min sin lectura del espejo o con menos de `P0_LINE_MIN_PIECES` piezas: va gris, sin alto. */
  gris: boolean
  /** Rótulo del tooltip. */
  rotulo: string
}

/** Piezas a P0 de Mantención por minuto del grader (sale de `porPieza`); el resto del minuto es Seteo. */
function mantPorMin(porPieza: readonly PiezaP0[] | null, t0Ms: number): Map<number, number> | null {
  if (!porPieza) return null
  const m = new Map<number, number>()
  for (const p of porPieza) {
    if (p.dueno !== 'mantencion') continue
    const k = Math.floor((Date.parse(p.ts) - t0Ms) / 60_000)
    m.set(k, (m.get(k) ?? 0) + p.cantidad)
  }
  return m
}

/**
 * Las barras de P0. La altura total sale SIEMPRE de `serie.g0` (la misma fuente que la alerta «P0 alto»); el reparto
 * por dueño va adentro: Mantención según `porPieza`, el resto a Seteo (nunca bajo 0). Sin `porPieza`, todo va en
 * `seteo` y el componente lo pinta sin dueño.
 */
export function barrasP0(d: Pick<DatosGraderVivo, 'serie' | 'p0' | 'sinLectura'>, porPieza: readonly PiezaP0[] | null, modo: ModoP0): BarraP0[] {
  const mant = mantPorMin(porPieza, d.serie.t0Ms)
  const out: BarraP0[] = []
  if (modo === 'min') {
    for (let m = 0; m < d.serie.hastaMin; m++) {
      const g0 = d.serie.g0[m] ?? 0
      if (g0 <= 0) continue
      const mt = Math.min(g0, mant?.get(m) ?? 0)
      out.push({ x0: m, x1: m + 1, mant: mt, seteo: g0 - mt, gris: false, rotulo: horaDelEje(d.serie.t0Ms, m) })
    }
    return out
  }
  for (const t of d.p0) {
    let hueco = false
    let mt = 0
    for (let m = t.desde; m < t.hasta; m++) {
      if (d.sinLectura[m]) hueco = true
      mt += mant?.get(m) ?? 0
    }
    const gris = hueco || t.pocaMasa || t.total <= 0
    mt = Math.min(t.g0, mt)
    out.push({
      x0: t.desde,
      x1: t.hasta,
      mant: gris ? 0 : (mt / t.total) * 100,
      seteo: gris ? 0 : ((t.g0 - mt) / t.total) * 100,
      gris,
      rotulo: hueco
        ? `${t.rotulo}: sin lectura`
        : t.pocaMasa || t.total <= 0
          ? `${t.rotulo}: menos de ${P0_LINE_MIN_PIECES} piezas`
          : `${t.rotulo}: ${coma1(t.pct ?? 0)} % (${milesPunto(t.g0)} de ${milesPunto(t.total)})${porPieza ? ` · Mantención ${milesPunto(Math.round(mt))}, seteo ${milesPunto(Math.round(t.g0 - mt))}` : ''}`,
    })
  }
  return out
}

/** Tramos seguidos sin lectura del espejo: [desde, hasta) en minutos del grader. */
export function huecos(sinLectura: readonly boolean[], hasta: number): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let ini = -1
  for (let m = 0; m <= hasta; m++) {
    const h = m < hasta && !!sinLectura[m]
    if (h && ini < 0) ini = m
    if (!h && ini >= 0) { out.push([ini, m]); ini = -1 }
  }
  return out
}

/**
 * Detenciones de las Baader (también las programadas: colación, ejercicio) corridas al eje del grader y unidas: tres
 * Baader paradas = un corchete neutro «detenida», como en el mockup v4.
 */
export function detenciones(paradas: DatosGraderVivo['paradas'], retraso: number, hasta: number): Array<[number, number]> {
  const iv = paradas
    .map((p) => [p.desde + retraso, Math.min(hasta, p.hasta + retraso)] as [number, number])
    .filter((x) => x[1] > x[0])
    .sort((x, y) => x[0] - y[0])
  const out: Array<[number, number]> = []
  for (const x of iv) {
    const u = out[out.length - 1]
    if (u && x[0] <= u[1]) u[1] = Math.max(u[1], x[1])
    else out.push([x[0], x[1]])
  }
  return out
}

/** Colores ya resueltos (canvas no entiende `var(--…)`). */
export interface TemaGrafico {
  acento: string
  gris: string
  mant: string
  ext: string
  reja: string
  mal: string
  texto: string
  textoSuave: string
  fondo: string
}

export interface DatosGrafico {
  t0Ms: number
  hasta: number
  retraso: number
  /** Piezas del grader por minuto; `null` en minutos sin lectura (la línea se corta). */
  grader: Array<number | null>
  /** Baader en el eje del grader (corridas `retraso`); `null` sin cobertura. */
  baader: Array<number | null> | null
  huecos: Array<[number, number]>
  detenciones: Array<[number, number]>
  porPieza: readonly PiezaP0[] | null
  /** Piezas a Gate 0 por minuto (para el tooltip). */
  g0: readonly number[]
  /** Piezas de Mantención por minuto (para el tooltip); `null` sin reparto por dueño. */
  mantMin: Map<number, number> | null
  barras: Record<ModoP0, BarraP0[]>
  /** Sin ninguna pieza de Gate 0 en el turno: el panel de P0 lo dice en vez de dibujar 0. */
  sinP0: boolean
  /** Franja de lotes sobre el panel de arriba (tocar abre la ficha del lote). */
  lotes: FranjaLote[]
  /** Tramos de entrada manual estimada [desde, hasta, ≈pz] (franja «Manual (estimado)»); `[]` sin ellos. */
  manual: Array<[number, number, number]>
  /** Las Baader vienen cada 5 min (respaldo de Shoplogix), no por minuto. */
  baader5: boolean
}

/** Grader por minuto (`null` sin lectura) y Baader corridas `retraso` al eje del grader (`null` sin cobertura). */
export function seriesEje(d: Pick<DatosGraderVivo, 'serie' | 'retraso' | 'sinLectura' | 'baader'>): { grader: Array<number | null>; baader: Array<number | null> | null } {
  const hasta = d.serie.hastaMin
  const L = d.retraso.min
  const grader: Array<number | null> = []
  for (let m = 0; m < hasta; m++) grader.push(d.sinLectura[m] ? null : (d.serie.pz[m] ?? 0))
  let baader: Array<number | null> | null = null
  if (d.baader) {
    baader = []
    for (let m = 0; m < hasta; m++) {
      const v = d.baader[m - L]
      baader.push(v !== undefined && Number.isFinite(v) ? v : null)
    }
  }
  return { grader, baader }
}

export function datosGrafico(d: DatosGraderVivo): DatosGrafico {
  const hasta = d.serie.hastaMin
  const L = d.retraso.min
  const porPieza = d.pesca?.p0Dueno.porPieza ?? null
  const { grader, baader } = seriesEje(d)
  return {
    t0Ms: d.serie.t0Ms,
    hasta,
    retraso: L,
    grader,
    baader,
    huecos: huecos(d.sinLectura, hasta),
    detenciones: detenciones(d.paradas, L, hasta),
    porPieza,
    g0: d.serie.g0,
    mantMin: mantPorMin(porPieza, d.serie.t0Ms),
    barras: { '15': barrasP0(d, porPieza, '15'), min: barrasP0(d, porPieza, 'min') },
    sinP0: d.totales.p0 === null,
    lotes: franjaLotes(d.lotes),
    manual: tramosManual(grader, baader),
    baader5: d.baader5,
  }
}

/** «2 h 05 min» / «45 min». */
export function largoVentana(len: number): string {
  if (len < 60) return `${len} min`
  const h = Math.floor(len / 60)
  const r = len % 60
  return `${h} h${r ? ` ${String(r).padStart(2, '0')} min` : ''}`
}

/** Franjas sobre el panel de arriba (px desde el borde del gráfico): lotes y, debajo, la entrada manual estimada. */
export const FRANJA = { loteY: 2, loteAlto: 16, manualY: 22, manualAlto: 6 } as const

/** `rgb(r, g, b)` → `rgba(r, g, b, a)` (el canvas no entiende `color-mix`); otro formato pasa igual. */
export function conAlfa(color: string, a: number): string {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(color)
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})` : color
}

/** Alto (px) de cada panel y márgenes: los usa la opción y el componente (para medir el ancho útil). */
export const GEOM = { izq: 34, der: 10, arriba: 34, alto1Angosto: 130, alto1: 160, hueco: 34, alto2: 70, slider: 26 } as const

/**
 * La opción de ECharts. `anchoPx` = ancho del gráfico (para el paso del eje y el rótulo de los huecos). Se rearma al
 * cambiar ventana, filtro, tema o ancho; la ventana entra en el dataZoom, así nunca se pierde el zoom.
 */
export function opcionGrafico(g: DatosGrafico, v: Ventana, filtro: FiltroDueno, tema: TemaGrafico, anchoPx: number): EChartsOption {
  const angosto = anchoPx < 480
  const h1 = angosto ? GEOM.alto1Angosto : GEOM.alto1
  const top2 = GEOM.arriba + h1 + GEOM.hueco
  const util = Math.max(1, anchoPx - GEOM.izq - GEOM.der)
  const pxMin = util / Math.max(1, v.b - v.a)
  const minDia0 = Math.floor(g.t0Ms / 60_000)
  const { paso, menor } = pasoEje(minDia0, v, util)
  const marcas = marcasEje(minDia0, v, paso)
  // Rayas menores entre marcas (sin rótulo) cuando quedan a 4 px o más.
  const menores = menor > 0 && (util / Math.max(1, v.b - v.a)) * menor >= 4 ? marcasEje(minDia0, v, menor).filter((m) => !marcas.includes(m)) : []
  const modo = modoP0(v)
  const barras = g.barras[modo]
  let topeP0 = 7
  if (modo === 'min') {
    let mx = 0
    for (const b of barras) if (b.x1 > v.a && b.x0 < v.b) mx = Math.max(mx, b.mant + b.seteo)
    topeP0 = Math.max(5, Math.ceil(mx / 5) * 5)
  }
  let mx1 = 10
  for (let m = Math.max(0, v.a); m < Math.min(g.hasta, v.b); m++) {
    mx1 = Math.max(mx1, g.grader[m] ?? 0, g.baader?.[m] ?? 0)
  }
  const tope1 = Math.ceil(mx1 / 10) * 10
  const hm = (m: number) => horaDelEje(g.t0Ms, m)
  const conDueno = g.porPieza !== null
  const opMant = filtro === 'seteo' ? 0.22 : 1
  const opSeteo = filtro === 'mant' ? 0.22 : 1
  const eje = (gi: number, conRotulo: boolean) => ({
    type: 'value' as const,
    gridIndex: gi,
    // El eje abarca TODO el turno; la ventana la fija el dataZoom. Así el minimapa (slider) muestra el turno entero
    // y resalta la ventana actual (antes el eje era la ventana y el minimapa solo mostraba lo ya visible).
    min: 0,
    max: Math.max(1, g.hasta),
    axisLine: { show: false },
    splitLine: { show: false },
    axisTick: { show: conRotulo, customValues: marcas, length: 6, lineStyle: { color: tema.textoSuave } },
    minorTick: { show: false },
    axisLabel: conRotulo
      ? { customValues: marcas, formatter: (x: number) => hm(x), color: tema.textoSuave, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', hideOverlap: true }
      : { show: false },
    // `snap`: la raya cae al centro del minuto (las curvas van en m + 0,5) y el tooltip, la barra tocada y el rótulo
    // del eje dicen el mismo minuto (Orel, video 23-11: la raya iba al borde y el tooltip decía 21:52 sobre 21:51).
    axisPointer: {
      show: true,
      snap: true,
      label: conRotulo
        ? { show: true, formatter: (p: { value: number }) => hm(Math.floor(p.value)), backgroundColor: tema.texto, color: tema.fondo, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', padding: [2, 6], borderRadius: 6 }
        : { show: false },
      lineStyle: { color: tema.texto, opacity: 0.35 },
    },
  })
  const yEje = (gi: number, max: number, pct: boolean) => ({
    type: 'value' as const,
    gridIndex: gi,
    min: 0,
    max,
    interval: gi === 0 ? max / 2 : max,
    axisLabel: { color: tema.textoSuave, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', formatter: (x: number) => (pct ? `${coma1(x).replace(',0', '')} %` : String(x)) },
    splitLine: { lineStyle: { color: tema.reja } },
    axisLine: { show: false },
    axisTick: { show: false },
  })
  const bandaHueco = (conRotulo: boolean) => g.huecos.map(([a, b]) => {
    const ancho = (Math.min(b, v.b) - Math.max(a, v.a)) * pxMin
    return [
      {
        xAxis: a,
        itemStyle: { color: tema.reja, borderColor: tema.gris, borderType: 'dashed' as const, borderWidth: 1 },
        label: conRotulo && ancho >= ROTULO_HUECO_MIN_PX
          ? { show: true, position: 'insideTopLeft' as const, offset: [2, 4], color: tema.textoSuave, fontSize: 12, formatter: ancho > 120 ? 'sin lectura del espejo' : 'sin lectura' }
          : { show: false },
      },
      { xAxis: b },
    ]
  })
  // Minutos con barra en la ventana: el resto ni se manda a dibujar.
  const visibles = barras.filter((b) => b.x1 > v.a && b.x0 < v.b)
  return {
    useUTC: true,
    animation: false,
    textStyle: { fontFamily: 'IBM Plex Sans, system-ui, sans-serif' },
    grid: [
      { left: GEOM.izq, right: GEOM.der, top: GEOM.arriba, height: h1 },
      { left: GEOM.izq, right: GEOM.der, top: top2, height: GEOM.alto2 },
    ],
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    xAxis: [
      eje(0, false),
      eje(1, true),
      { ...eje(1, false), position: 'bottom' as const, axisPointer: { show: false }, axisTick: { show: true, customValues: menores, length: 3, lineStyle: { color: tema.gris } } },
    ],
    yAxis: [yEje(0, tope1, false), yEje(1, topeP0, modo === '15')],
    dataZoom: [
      { id: 'dz-inside', type: 'inside', xAxisIndex: [0, 1, 2], filterMode: 'none', startValue: v.a, endValue: v.b, minValueSpan: ZOOM_MIN_MIN, disabled: true }, // los gestos (rueda, pellizco, arrastre) los maneja GraficoVivo: el inside de ECharts no respondía
      {
        id: 'dz-slider',
        type: 'slider',
        xAxisIndex: [0, 1, 2],
        filterMode: 'none',
        startValue: v.a,
        endValue: v.b,
        minValueSpan: ZOOM_MIN_MIN,
        bottom: 4,
        height: GEOM.slider,
        left: GEOM.izq,
        right: GEOM.der,
        showDetail: false,
        brushSelect: false,
        borderColor: tema.reja,
        backgroundColor: tema.reja,
        fillerColor: conAlfa(tema.acento, 0.18),
        handleStyle: { color: tema.acento, borderColor: tema.acento },
        moveHandleStyle: { color: tema.acento, opacity: 0.5 },
        dataBackground: { lineStyle: { color: tema.acento, opacity: 0.6, width: 1 }, areaStyle: { opacity: 0 } },
        selectedDataBackground: { lineStyle: { color: tema.acento, opacity: 0.9, width: 1 }, areaStyle: { opacity: 0 } },
      },
    ],
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: tema.fondo,
      borderColor: tema.reja,
      textStyle: { color: tema.texto, fontSize: 13 },
      formatter: (ps: unknown) => {
        const lista = Array.isArray(ps) ? ps : [ps]
        const x = Number((lista[0] as { axisValue?: number } | undefined)?.axisValue ?? NaN)
        return Number.isFinite(x) ? textoMinuto(g, Math.floor(x)) : ''
      },
    },
    series: [
      {
        id: 'baader',
        name: 'Baader',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: tema.gris, width: 1.5 },
        itemStyle: { color: tema.gris },
        data: (g.baader ?? []).map((y, m) => [m + 0.5, y]),
        markArea: { silent: true, data: bandaHueco(true) as never },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: tema.gris, type: 'solid', width: 1 },
          // Corchete sobre el panel; la palabra solo si cabe (los ejercicios de 2 min van sin rótulo).
          data: g.detenciones.map(([a, b]) => {
            const ancho = (Math.min(b, v.b) - Math.max(a, v.a)) * pxMin
            return [
              { coord: [a, tope1], label: ancho >= ROTULO_DETENIDA_MIN_PX ? { show: true, position: 'insideEndTop', formatter: 'detenida', color: tema.textoSuave, fontSize: 12 } : { show: false } },
              { coord: [b, tope1] },
            ]
          }) as never,
        },
      },
      {
        id: 'grader',
        name: 'Grader',
        type: 'line',
        xAxisIndex: 0,
        yAxisIndex: 0,
        showSymbol: false,
        connectNulls: false,
        z: 3,
        lineStyle: { color: tema.acento, width: 2 },
        itemStyle: { color: tema.acento },
        data: g.grader.map((y, m) => [m + 0.5, y]),
      },
      {
        id: 'lotes',
        name: 'Lotes',
        type: 'custom',
        xAxisIndex: 0,
        yAxisIndex: 0,
        clip: false,
        silent: false,
        cursor: 'pointer',
        tooltip: { show: false },
        data: g.lotes.filter((f) => f.x1 > v.a && f.x0 < v.b).map((f) => [f.x0, f.x1, f.k]),
        encode: { x: [0, 1] },
        renderItem: (_params: unknown, api: unknown) => {
          const a = api as { value: (i: number) => number; coord: (p: [number, number]) => [number, number] }
          // Sobre el panel de arriba (y fijo en px), recortada a la ventana.
          const x0 = Math.max(a.value(0), v.a)
          const x1 = Math.min(a.value(1), v.b)
          const k = a.value(2)
          const f = g.lotes.find((x) => x.k === k)
          const px0 = a.coord([x0, 0])[0]
          const px1 = a.coord([x1, 0])[0]
          const w = Math.max(2, px1 - px0 - 1)
          const par = k % 2 === 1
          const txt = f ? rotuloFranja(f, w) : ''
          const hijos: unknown[] = [{ type: 'rect', shape: { x: px0, y: FRANJA.loteY, width: w, height: FRANJA.loteAlto, r: 4 }, style: { fill: tema.acento, opacity: par ? 1 : 0.45 } }]
          if (txt) hijos.push({ type: 'text', style: { x: px0 + 6, y: FRANJA.loteY + FRANJA.loteAlto / 2, text: txt, verticalAlign: 'middle', fill: par ? tema.fondo : tema.texto, font: '600 12px IBM Plex Sans, sans-serif' }, silent: true })
          return { type: 'group', children: hijos }
        },
      } as never,
      {
        id: 'manual',
        name: 'Manual (estimado)',
        type: 'custom',
        xAxisIndex: 0,
        yAxisIndex: 0,
        clip: false,
        silent: true,
        tooltip: { show: false },
        data: g.manual.filter(([a, b]) => b > v.a && a < v.b).map(([a, b, pz]) => [a, b, pz]),
        encode: { x: [0, 1] },
        renderItem: (_params: unknown, api: unknown) => {
          const a = api as { value: (i: number) => number; coord: (p: [number, number]) => [number, number] }
          const px0 = a.coord([Math.max(a.value(0), v.a), 0])[0]
          const px1 = a.coord([Math.min(a.value(1), v.b), 0])[0]
          return { type: 'rect', shape: { x: px0, y: FRANJA.manualY, width: Math.max(2, px1 - px0), height: FRANJA.manualAlto, r: 2 }, style: { fill: tema.acento, opacity: 0.7 } }
        },
      } as never,
      {
        id: 'p0',
        name: modo === '15' ? 'P0 cada 15 min (%)' : 'P0 por minuto (piezas)',
        type: 'custom',
        xAxisIndex: 1,
        yAxisIndex: 1,
        clip: false,
        data: visibles.map((b) => [b.x0, b.x1, b.mant, b.seteo, b.gris ? 1 : 0]),
        encode: { x: [0, 1], y: [2, 3] },
        renderItem: (_params: unknown, api: unknown) => {
          const a = api as { value: (i: number) => number; coord: (p: [number, number]) => [number, number] }
          // Sin `clip` (la cifra va sobre el tope), así que la barra se recorta a la ventana a mano.
          const x0 = Math.max(a.value(0), v.a)
          const x1 = Math.min(a.value(1), v.b)
          // Tope del panel: la barra no pasa de él y la cifra va encima (como en el mockup).
          const st = Math.min(a.value(3), topeP0)
          const mt = Math.min(a.value(2), topeP0 - st)
          const real = a.value(2) + a.value(3)
          const gris = a.value(4) === 1
          const [px0, y0] = a.coord([x0, 0])
          const [px1] = a.coord([x1, 0])
          const ancho = Math.max(1, px1 - px0 - (modo === '15' ? 2 : 1))
          const x = px0 + (modo === '15' ? 1 : 0.5)
          if (gris) {
            return { type: 'rect', shape: { x, y: y0 - 4, width: ancho, height: 4, r: 2 }, style: { fill: 'none', stroke: tema.gris, lineDash: [2, 2] } }
          }
          const ySet = a.coord([x0, st])[1]
          const yTot = a.coord([x0, st + mt])[1]
          const hijos: unknown[] = []
          if (st > 0) hijos.push({ type: 'rect', shape: { x, y: ySet, width: ancho, height: y0 - ySet, r: Math.min(2, ancho / 2) }, style: { fill: conDueno ? tema.ext : tema.acento, opacity: conDueno ? opSeteo : 0.6 } })
          if (mt > 0) {
            const base = st > 0 ? ySet - 1.5 : y0
            hijos.push({ type: 'rect', shape: { x, y: yTot, width: ancho, height: Math.max(1.5, base - yTot), r: Math.min(2, ancho / 2) }, style: { fill: tema.mant, opacity: opMant } })
          }
          if (modo === '15' && real > DEFAULT_P0_CRITICAL_PCT) {
            hijos.push({ type: 'text', style: { x: x + ancho / 2, y: yTot - 2, text: `${coma1(real)} %`, align: 'center', verticalAlign: 'bottom', fill: tema.texto, font: '600 12px IBM Plex Mono, monospace' } })
          }
          return { type: 'group', children: hijos }
        },
        markLine: modo === '15'
          ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: tema.mal, type: [2, 4], width: 1 }, data: [{ yAxis: DEFAULT_P0_CRITICAL_PCT }] }
          : undefined,
        markArea: { silent: true, data: bandaHueco(false) as never },
      } as never,
    ],
    graphic: [
      {
        type: 'text',
        left: GEOM.izq + 4,
        top: top2 - 20,
        style: { text: g.sinP0 ? 'P0: sin piezas de Gate 0' : modo === '15' ? 'P0 cada 15 min (%)' : 'P0 por minuto (piezas)', fill: tema.textoSuave, font: '12px IBM Plex Sans, sans-serif' },
      },
    ],
  } as EChartsOption
}

/** El texto del minuto (tooltip y lectura en el celular). */
export function textoMinuto(g: DatosGrafico, m: number): string {
  if (m < 0 || m >= g.hasta) return ''
  const gr = g.grader[m]
  const bd = g.baader?.[m]
  const total = g.g0[m] ?? 0
  const mant = Math.min(total, g.mantMin?.get(m) ?? 0)
  const lote = loteDelMinuto(g.lotes, m)
  const avisos: string[] = []
  if (gr === null) avisos.push('sin lectura')
  if (g.detenciones.some(([a, b]) => m >= a && m < b)) avisos.push('detenida')
  if (g.manual.some(([a, b]) => m >= a && m < b)) avisos.push('entrada manual (est.)')
  const fila = (k: string, val: string) => `<div style="display:flex;justify-content:space-between;gap:16px"><span>${k}</span><span style="font-family:IBM Plex Mono,monospace">${val}</span></div>`
  return `<b style="font-family:IBM Plex Mono,monospace">${horaDelEje(g.t0Ms, m)}</b>`
    + fila('Grader', gr === null || gr === undefined ? '—' : String(gr))
    + fila('Baader', bd === null || bd === undefined ? '—' : String(Math.round(bd)))
    + fila('P0', total > 0 && g.mantMin ? `${total} · ${mant} Mant. · ${total - mant} seteo` : String(total))
    + (lote ? fila('Lote', loteCorto(lote.lote)) : '')
    + (avisos.length ? `<p style="margin:4px 0 0;opacity:.75">${avisos.join(' · ')}</p>` : '')
}
