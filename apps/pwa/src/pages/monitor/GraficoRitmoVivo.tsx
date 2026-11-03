/**
 * «Ritmo en vivo» · el gráfico unido de «El turno» (opción A «cinta» del 28-10; antes «El turno en un solo eje»).
 *
 * UN lienzo a todo el ancho, también en el celular: arriba el acumulado con su proyección, el ritmo de la meta y la
 * curva COMPLETA del turno anterior; debajo el ritmo por minuto de la línea, una fila por Baader y las paradas por
 * dueño, todo sobre las mismas horas y con una sola raya de «ahora». Sin riel: las cifras viven en la franja de arriba.
 *
 * Zoom horizontal («Turno | 1 h | 15 min», Ctrl + rueda, pellizco, arrastre) con `useZoomGesto`: el contenido se
 * ensancha dentro de un contenedor con scroll y los rótulos (izquierda y derecha) quedan fijos a los lados. El globo
 * sale con el mouse y también con un toque. «Ampliar» abre el detalle que le pase la página (selector Línea/Ev, el
 * turno minuto a minuto, llenado por Baader y «Último minuto, pieza a pieza»: ver `RitmoVivoAmpliado`).
 *
 * Movimiento («reloj de datos», DESIGN.md §8): la punta de la curva y la proyección avanzan en línea recta entre dos
 * lecturas REALES de Shoplogix (`useRelojDeDatos`). La geometría se dibuja una vez por lectura; lo que se mueve entre
 * lecturas es un `transform`. La barra nueva entra con `scaleY` y la proyección con `opacity`.
 *
 * Micro detenciones por Baader (02-11): cada fila Ev lleva la curva fina de sus piezas por minuto contra su esperado
 * (línea punteada) y, sobre ella, una marca ▼ por cada micro que llega con hora, con el color de su CAUSA PROBABLE
 * (`microCausa.ts`). Un carril «Micro» debajo de las detenciones las junta; al tocar o pasar sobre una marca, su globo
 * dice qué pasó alrededor y por qué se marcó así. «Probable, no imputada»: se confirma en terreno.
 *
 * El minuto por dentro (02-11, zoom): desde `EXACTO_PX_MIN` (12 px por minuto: «1 h» en 1920 da 26) cada parada se dibuja al segundo en la fila de su Baader (detención =
 * bloque de tinta con un velo sobre la fila, micro = muesca gris, programada = marco punteado), la cinta pinta solo los segundos andados y el globo del minuto es
 * `GloboMinuto`; desde `DETALLE_PX_MIN` (48: «15 min» en 1920 da 103) se agregan el escalón del ritmo andando, los rótulos de cada parada y las marcas cada 15 s.
 * La micro se dibuja una sola vez por carril (su fila y el carril «Micro») y nunca en «Detenciones», que cuenta solo detenciones. Los segundos salen de
 * `paradasDetalle` (inicio bajado al segundo) y las cifras del globo de `minutoPorDentro.ts`; no hay producción por segundo: lo repartido va rotulado «calculado».
 *
 * Todo sale de las funciones de datos que ya existen (`ritmoVivo`, `monitorEventos`…): este archivo solo ubica y dibuja.
 */
import { Info, Maximize2, X } from 'lucide-react'
import { memo, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref, type RefObject, type TouchEvent as ReactTouchEvent } from 'react'
import { DUENO_META, duenoDe } from '@/services/shoplogix/monitorEventos'
import { CapaAmpliada } from './AmpliarV2'
import { useAbrirPorClave, useTamano } from './ampliarHooks'
import { aEstaHora, horaDelCuadro, piezasMostradas } from './aEstaHora'
import { useCifrasVivas, VistaVivaCtx, type CifrasVivas } from './useCifrasVivas'
import {
  COLOR_TONO, DETALLE_PX_MIN, EXACTO_PX_MIN, OPACIDAD_FILA, RELLENO_DUENO, TRAMA_MANT, acumulado, anchoRotuloAhora, anclaRotuloAhora, andandoDelMinuto, andandoSegundos, brechaALaIzquierda, cifraTurnoAnterior, cubetasDeLinea,
  disenar, dominioVisible, duracionExacta, episodiosParada, escalaAcumulado, esParadaMicro, ritmoAndando, tramosDelMinuto, relojConSegundos,
  adelanteAtras, escalaVentana, esperadoPorMinuto, filasBaader, finDelEje, horasMin, int, marcasEje, minutosConParada, minutosCompletos, minutosPorCubeta,
  microBajoPuntero, minutosVisibles, paradasEn, pctAndando, proyeccion, rayasY, recortarCurva, relojDe, separarRotulos, sumaPorMinuto, tamanoGrafico, tonoDeCubeta,
  tonoRitmo, trazoHastaLectura, valorEnCurva, ventanaDe, zoomActivo, zoomMaxPara,
  type AnclaRotulo, type CeldaBaader, type Diseno, type ParadaEje, type ParadasMaquina, type Punto, type Tramo, type TonoRitmo, type Zoom,
} from './ejeTurno'
import { calibracionDe, type CalibracionPlanta } from './causasCalibracion'
import { CAUSAS_MICRO, COLOR_CAUSA, clasificarMicros, estadoDeForma, motivoLegible, numerosPorCelda, type CausaMicro, type MicroClasificada } from './microCausa'
import { ResumenCausasMicro } from './ResumenCausas'
import { ARIA_GLOBO, TXT_GLOBO, TXT_RESUMEN, detalleForma, lineaCausa, resumenAccesibleMicro, textoObservacion, tituloGlobo } from './textosCausas'
import { GLOBO_SOBRE_FILA, ubicarGloboPc } from './globoPosicion'
import { GloboMinuto, MARCAS_15S } from './GloboMinuto'
import { lecturaDelMinuto, type BaaderMinuto } from './minutoPorDentro'
import { etiquetaMaquina, paradasDetalle, type ParadaDetalle } from './ritmoVivo'
import type { CuadroReloj, RelojDeDatos } from './useRelojDeDatos'
import { useZoomGesto, type Ventana } from './useZoomGesto'
import { FranjaRango } from './FranjaRango'
import type { MinutoTurno, MonitorV2Props } from './MonitorV2'

// ── Datos que la página le pasa ──────────────────────────────────────────────

export interface EjeDatos {
  /** Inicio del eje (inicio del turno), ms wall-as-UTC. */
  iniMs: number
  /** Fin previsto del turno, ms wall-as-UTC. */
  finMs: number
  /** Fin REAL del turno cerrado (`live.effectiveEnd`, la misma hora de la cabecera). null/ausente: se usa el previsto. */
  finRealMs?: number | null
  /** Minuto a minuto por máquina (las mismas barras de «Ritmo en vivo»). null: solo curva. */
  minuto: MinutoTurno | null
  /** La primera pieza (ms): base de `curva.hoy`, de la curva de la meta y de las paradas. */
  primeraPiezaMs: number | null
  /** La línea se ve detenida por el estado que ya existe (máquinas detenidas / `currentReason`). */
  detenidaEstado: boolean
  paradas: ParadaEje[]
  /** Último % de llenado de cada máquina y su unidad (carros / silletas). */
  llenado: Array<{ id: string; ultimo: number | null }> | null
  unidad: 'carros' | 'silletas' | null
  /**
   * Las paradas POR MÁQUINA del turno (`live.stopEvents`, `stopReasons`, `stopMachines`) y las máquinas detenidas
   * ahora: con ellas las filas Ev se normalizan como el llenado de «Ritmo en vivo» (segundos andando). Sin ellas, se
   * supone andando todo el minuto.
   */
  paradasMaquina?: ParadasMaquina | null
  /**
   * El ritmo «mientras anduvo» de cada Baader (`ritmoPorMaquina`, `cpm`: piezas ÷ minutos andando): el MISMO número que ya
   * muestra el monitor, para no decir dos cifras distintas. Se une por nombre. Sin él, la fila no dice «anduvo a».
   */
  ritmoAnduvo?: Array<{ nombre: string; cpm: number }> | null
  /** Todas las micro del turno (`live.mantencion.porMaquina[].microN`): el «de M» del carril «Micro». Ausente: se omite. */
  microTotal?: number | null
  /** La planta del doc (`plantSlug`: chonchi, yal, filete): de ella salen los parámetros y la calibración de las causas de las micro. Ausente o sin calibración: no se estima la causa probable. */
  planta?: string | null
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
/** Una barra o celda como trazo de path (un solo nodo por tono en vez de cientos de rects). */
const rect = (x: number, y: number, w: number, h: number) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${-r1(w)}z`

const ORDEN_DUENO: Record<ParadaEje['dueno'], number> = { programado: 0, 'sin-imputar': 1, externo: 2, mantencion: 3 }
const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
/** «09:31:13»: la hora de la micro con segundos (wall-as-UTC, como `relojDe`). */
const horaConSegundos = (ms: number) => new Date(ms).toISOString().slice(11, 19)

// ── El modelo (una vez por lectura) ──────────────────────────────────────────

interface Modelo {
  w: number
  d: Diseno
  iniMs: number
  totalMin: number
  /** Dominio Y del acumulado: «Turno» 0…yMax; con zoom, el de lo que se ve en la ventana (`escalaVentana`). */
  yMin: number
  yMax: number
  rejilla: number
  /** La ventana visible (null = todo el turno): los rótulos de hora cercanos al borde se anclan o se omiten. */
  vent: Ventana | null
  n: number
  offsetMin: number
  suma: number[]
  /** Minutos que TODAS las Baader ya entregaron: de ahí en adelante el minuto es parcial. */
  completos: number
  esperadoMin: Array<number | null>
  esperadoLinea: number | null
  /** Tope de la escala de las barras por minuto (pz/min). */
  topBarra: number
  maquinas: Array<{ id: string; nombre: string; esperado: number | null; cycles: number[]; celdas: CeldaBaader[]; llenados: Array<number | null>; pct: number | null; ultimoLlenado: number | null; anduvo: number | null }>
  /**
   * El minuto por dentro: las paradas de cada Baader al segundo (`paradasDetalle`) y, por Baader y por minuto de la serie, lo que ocupan
   * (`tramos`), los segundos que anduvo y su ritmo mientras anduvo. null sin paradas por máquina (doc anterior) o sin serie.
   */
  detalle: { paradas: Map<string, ParadaDetalle[]>; minutos: MinutoBaader[][] } | null
  /** Las micro con hora que ya pasaron, con su causa posible (`clasificarMicros`). Vacío sin detenciones por máquina. */
  micros: MicroClasificada[]
  /** Hay carril «Micro»: el doc dice de qué Baader fue cada parada. */
  conMicro: boolean
  /** Todas las micro del turno (también las de 0 s, que no llegan con hora). null: no se sabe. */
  microTotal: number | null
  trazo: Punto[]
  previa: Punto | null
  ultima: Punto
  proy: ReturnType<typeof proyeccion>
  detenida: boolean
  meta: number | null
  objetivo: Punto[]
  previoPts: Punto[]
  previoLabel: string | null
  /** UNA cifra del turno anterior (leyenda y hoja «Piezas del turno»): a esta hora en vivo, al cierre con el turno cerrado. */
  previoCifra: { piezas: number; modo: 'al-cierre' | 'a-esta-hora' } | null
  /** La punta está en el fin REAL del turno cerrado: el rótulo dice «04:50 fin». */
  finReal: boolean
  cuota: { piezas: number; hora: string | null } | null
  /** «A esta hora» de la vista (`aEstaHora`): la misma cifra de la franja y de Camino a la meta. null con el turno cerrado o sin cuota. */
  aHora: number | null
  /** PR B: la cuota en la hora de planta de cada cuadro (`VistaVivaCtx`). Con ella la brecha sigue a la punta. */
  cuotaEn: ((tMs: number) => number | null) | null
  paradas: ParadaEje[]
  /** El minuto que corre es la última barra: crece cuadro a cuadro con las piezas que ya cayeron (`f0`: cuánto lleva al armar el modelo). null si no hay cola. */
  enCurso: { f0: number } | null
  cerrado: boolean
  unidad: 'carros' | 'silletas' | null
}

/** Una Baader en un minuto de la serie: sus tramos de parada, los segundos que anduvo y su ritmo mientras anduvo (null = sin dato). */
interface MinutoBaader { tramos: Tramo[]; andandoS: number; ritmo: number | null }

/** Lo que ocupa cada parada en cada minuto de la serie, por Baader. El tono sigue saliendo de `filasBaader`; aquí solo se ubican los segundos. */
function detalleDeMinutos(maquinas: Modelo['maquinas'], desde: string, n: number, pm: ParadasMaquina): NonNullable<Modelo['detalle']> {
  const paradas = paradasDetalle({ stopEvents: pm.stopEvents, stopReasons: pm.stopReasons, stopMachines: pm.stopMachines, enCurso: pm.enCurso ?? [] })
  const t0 = Date.parse(desde)
  const minutos = maquinas.map((q) => Array.from({ length: n }, (_, k): MinutoBaader => {
    const tramos = tramosDelMinuto(paradas.get(q.id), t0 + k * 60_000)
    const andandoS = andandoSegundos(tramos)
    const piezas = q.cycles[k]
    return { tramos, andandoS, ritmo: piezas == null ? null : ritmoAndando(piezas, andandoS, q.llenados[k]) }
  }))
  return { paradas, minutos }
}

/** Lo que dice el globo del minuto `k` de la serie (índice), armado desde el modelo: ver `minutoPorDentro.ts`. */
function lecturaDeMinuto(m: Modelo, k: number) {
  const det = m.detalle!
  const baaders: BaaderMinuto[] = m.maquinas.map((q, i) => {
    const mb = det.minutos[i]![k]!
    return { id: q.id, nombre: etiquetaMaquina(q.nombre), esperado: q.esperado, piezas: k < q.cycles.length ? q.cycles[k]! : null, tono: q.celdas[k]?.tono ?? 'sin', tramos: mb.tramos, andandoS: mb.andandoS, ritmo: mb.ritmo }
  })
  return lecturaDelMinuto({ iniMs: m.iniMs + (m.offsetMin + k) * 60_000, baaders, micros: m.micros })
}

/**
 * Cómo se dice el «ritmo andando» (el escalón del gráfico, la leyenda y la columna del globo): es una división, no una medida. Shoplogix cuenta piezas
 * por minuto y no hay producción por segundo; las piezas de un minuto pudieron caer de otro (Chonchi 02-11: 82 de 789 minutos de Baader pasan de 100 %
 * de su velocidad seteada, el máximo es 141 %). Por eso va rotulado «calculado».
 */
const RITMO_ANDANDO_CALCULADO = 'Ritmo andando, calculado: piezas del minuto ÷ segundos andando'

/** Ancho estimado de un rótulo de 11 px en peso 600 (no se mide con canvas: en jsdom no hay, y el cálculo tiene que ser el mismo en todas partes). */
const anchoRotulo11 = (t: string) => t.length * 6

const yAcum = (m: Modelo, v: number) => m.d.acum.y0 + (1 - (v - m.yMin) / (m.yMax - m.yMin)) * m.d.acum.h
const maxV = (ps: Punto[]) => ps.reduce((a, q) => Math.max(a, q.v), 0)
const enBanda = (m: Modelo, v: number) => v >= m.yMin - 1e-6 && v <= m.yMax + 1e-6
/** 6 px de aire a la derecha del contenido: el punto final (radio 4,5) no se corta. El mismo factor va en `minDe` y `CursorSvg`. */
const AIRE_DER = 6
const pxPorMinuto = (W: number, totalMin: number) => Math.max(0.0001, (W - AIRE_DER) / totalMin)

// ── El SVG ───────────────────────────────────────────────────────────────────

interface Geo { x: (min: number) => number; y: (v: number) => number }

/** El halo de los rótulos que van sobre el lienzo: el color de la tarjeta, no el del fondo de la página. */
const HALO: CSSProperties = { paintOrder: 'stroke', stroke: 'rgb(var(--card))', strokeWidth: 4, strokeLinejoin: 'round' }

/** El fondo del lienzo donde terminan las rayas («ahora», minuto tocado): el carril «Micro» si lo hay; si no, las detenciones. */
const fondoLienzo = (d: Diseno) => (d.micro ? d.micro.y0 + d.micro.h : d.paradas.y0 + d.paradas.h)

/** El SVG se rehace una vez por lectura; entre lecturas solo se mueven `clip`, `punta` y `proy` por transform. */
const LienzoSvg = memo(function LienzoSvg({ m, W, reloj, uid }: { m: Modelo; W: number; reloj: RelojDeDatos; uid: string }) {
  const { d, totalMin, ultima, previa } = m
  const chico = d.tam === 'chico'
  const pxMin = pxPorMinuto(W, totalMin)
  const x = (min: number) => min * pxMin
  const y = (v: number) => yAcum(m, v)
  /* El minuto por dentro: desde `EXACTO_PX_MIN` cada parada se dibuja con su largo exacto (bloques en vez de celdas de 1 min); desde `DETALLE_PX_MIN`
     caben además los rótulos, el escalón del ritmo y las marcas cada 15 s. Sin paradas por máquina (doc anterior) queda todo como siempre. */
  const det = m.detalle
  const exacto = det != null && pxMin >= EXACTO_PX_MIN
  const conDetalle = exacto && pxMin >= DETALLE_PX_MIN
  const geo = useRef<Geo>({ x, y })
  geo.current = { x, y }
  const clipRef = useRef<SVGRectElement>(null)
  const puntaRef = useRef<SVGGElement>(null)
  const proyRef = useRef<SVGLineElement>(null)
  const brechaRef = useRef<SVGGElement>(null)
  const brechaLineaRef = useRef<SVGLineElement>(null)
  const brechaTextoRef = useRef<SVGTextElement>(null)
  const barraRef = useRef<SVGRectElement>(null)

  /* Entre lecturas: la punta y el clip van de la lectura anterior a la última; la proyección parte de la punta. */
  const aplicar = (c: CuadroReloj) => {
    const g = geo.current
    const u = m.ultima
    const p = m.previa
    const min = p ? p.min + (u.min - p.min) * c.frac : u.min
    const v = c.valor != null && p ? c.valor : u.v
    const hx = g.x(min), hy = g.y(v)
    const ox = g.x((p ?? u).min), oy = g.y((p ?? u).v)
    clipRef.current?.setAttribute('transform', `translate(${r1(hx)} 0)`)
    puntaRef.current?.setAttribute('transform', `translate(${r1(hx - ox)} ${r1(hy - oy)})`)
    /* El extremo «al cierre» no se mueve con la reproducción: es la proyección de siempre (`p.proyeccion`), el mismo número de la franja
       y del ampliado; solo el arranque de la línea sigue a la punta. */
    if (proyRef.current && m.proy) {
      const ex = g.x(m.proy.hasta.min), ey = g.y(m.proy.hasta.v)
      proyRef.current.setAttribute('transform', `matrix(${r1(ex - hx)} ${r1(ey - hy)} 0 1 ${r1(hx)} ${r1(hy)})`)
    }
    /* La barra del minuto que corre crece con las piezas que ya cayeron (transform, sin layout). */
    if (barraRef.current && m.enCurso && c.rep) {
      const span = c.rep.totalFinal - c.rep.totalPiso
      const f = span > 0 ? Math.min(1, Math.max(0, (c.rep.total - c.rep.totalPiso) / span)) : 1
      barraRef.current.style.transform = `scaleY(${f.toFixed(4)})`
    }
    /* PR B: «A esta hora» junto a la punta, con las piezas y la cuota del MISMO instante (la cifra de la franja). */
    if (m.cuotaEn && !m.cerrado && brechaRef.current && brechaLineaRef.current && brechaTextoRef.current) {
      const t = horaDelCuadro(c)
      const cuota = t != null ? m.cuotaEn(t) : null
      const gap = aEstaHora(v, cuota, m.meta)
      if (cuota != null && gap != null) {
        brechaRef.current.setAttribute('transform', `translate(${r1(hx - g.x(u.min))} 0)`)
        brechaLineaRef.current.setAttribute('y1', String(r1(g.y(v))))
        brechaLineaRef.current.setAttribute('y2', String(r1(g.y(cuota))))
        brechaLineaRef.current.setAttribute('stroke', gap < 0 ? 'var(--v2-mal)' : 'var(--v2-bien)')
        /* Se mueve lo que se movió el medio de la brecha desde el reposo: así respeta la separación con «al cierre» (celular). */
        const y0 = Number(brechaTextoRef.current.dataset.y0), mid0 = Number(brechaTextoRef.current.dataset.mid0)
        brechaTextoRef.current.setAttribute('y', String(r1(y0 + (g.y(v) + g.y(cuota)) / 2 - mid0)))
        brechaTextoRef.current.style.fill = gap < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))'
        const txt = adelanteAtras(gap)
        if (brechaTextoRef.current.textContent !== txt) brechaTextoRef.current.textContent = txt
      }
    }
  }
  /* Sin dependencias a propósito: se vuelve a suscribir en cada render para leer el modelo vigente. */
  useLayoutEffect(() => reloj.alCuadro(aplicar))

  const puntos = (ps: Punto[]) => ps.map((q) => `${r1(x(q.min))},${r1(y(q.v))}`).join(' ')
  const ticksY = rayasY(m.yMin, m.yMax, m.rejilla)

  // Horas del eje X: múltiplos de reloj del paso; el paso se adapta al zoom; las marcas que chocan con el rótulo del «ahora» se omiten.
  const fs = chico ? 11 : 12
  const horaAhora = relojDe(m.iniMs + ultima.min * 60_000)
  const xAhora = x(ultima.min)
  /* El lienzo VISIBLE: con zoom es la ventana del scroller, no el lienzo entero. Los rótulos se anclan y se acotan a ella (con el
     turno cerrado el fin real puede quedar unos minutos después de la ventana, que termina 15 % delante del último dato). */
  const visIni = m.vent ? m.vent.desdeMin * pxMin : 0
  const visDer = m.vent ? m.vent.hastaMin * pxMin : W
  const visAncho = visDer - visIni
  const anchoRot = anchoRotuloAhora(fs)
  const { ancla: anclaAhora, x: xRotAhora } = anclaRotuloAhora({ xAhora, visIni, visDer, anchoRotulo: anchoRot })
  /* El texto de una hora mide 26 px a 11 px de letra y 29 a 12 px: es lo que `marcasEje` necesita para no pisar dos marcas. */
  const marcaPx = chico ? 27 : 30
  const marcas = marcasEje({
    totalMin, pxPorMin: pxMin, minPx: chico ? 64 : 100, ahoraMin: xRotAhora / pxMin, ahoraPx: chico ? 84 : 64,
    iniMs: m.iniMs, ahoraAncla: anclaAhora, ahoraRotuloPx: anchoRot, marcaPx,
  })
  /* Una hora a menos de 16 px del borde visible (el del lienzo o el de la ventana) se ancla hacia adentro: centrada se cortaría
     («…8:00»). Con zoom, fuera de la ventana se omite. */
  const anclaMarca = (t: number): AnclaRotulo | null => {
    const natural: AnclaRotulo = t <= 0 ? 'start' : t >= totalMin ? 'end' : 'middle'
    const xv = x(t) - visIni
    if (m.vent && (xv < 0 || xv > visAncho)) return null
    if (xv < 16) return 'start'
    if (visAncho - xv < 16) return 'end'
    return natural
  }

  // Barras por minuto de la línea: un trazo por tono; la barra NUEVA va aparte para animarla. Un minuto en cero no se dibuja.
  // Con menos de 2 px por minuto (celular en «Turno») se agrupan en cubetas de ≥ 3 px; un minuto parcial va atenuado.
  const barras = d.barras
  const cub = minutosPorCubeta(pxMin)
  const yb = (v: number) => (barras ? barras.y0 + barras.h - (v / m.topBarra) * barras.h : 0)
  const porTono: Record<TonoRitmo, string> = { bien: '', atento: '', mal: '', sin: '' }
  const parcialTono: Record<TonoRitmo, string> = { bien: '', atento: '', mal: '', sin: '' }
  const nuevas: Array<{ x: number; y: number; h: number; w: number; tono: TonoRitmo; parcial: boolean }> = []
  if (barras) {
    if (cub === 1) {
      const bw = Math.max(0.7, pxMin * 0.72)
      m.suma.forEach((v, k) => {
        const mm = m.offsetMin + k
        if (mm >= totalMin || v <= 0) return
        const tono = tonoRitmo(v, m.esperadoMin[k] ?? null)
        const bx = x(mm) + (pxMin - bw) / 2
        const by = yb(v)
        const bh = barras.y0 + barras.h - by
        const parcial = k >= m.completos
        if (m.enCurso && k === m.suma.length - 1) { nuevas.push({ x: bx, y: by, h: bh, w: bw, tono, parcial }); return }
        ;(parcial ? parcialTono : porTono)[tono] += rect(bx, by, bw, bh)
      })
    } else {
      for (const cb of cubetasDeLinea(m.suma, m.esperadoMin, cub, m.completos)) {
        const mm = m.offsetMin + cb.k0
        if (mm >= totalMin || cb.prom <= 0) continue
        const ancho = cb.len * pxMin
        const bw = Math.max(0.7, ancho * 0.72)
        const by = yb(cb.prom)
        ;(cb.parcial ? parcialTono : porTono)[tonoRitmo(cb.prom, cb.esperado)] += rect(x(mm) + (ancho - bw) / 2, by, bw, barras.y0 + barras.h - by)
      }
    }
  }

  // Filas Ev: tramos seguidos del mismo tono se unen en un solo rectángulo (con cubetas, el peor tono de cada una).
  const filas = m.maquinas.map((q, i) => {
    const c = d.carriles[i]
    const tramos = { bien: '', atento: '', mal: '' }
    if (!c) return { q, c, tramos }
    if (exacto && det) {
      /* La cinta pinta SOLO los segundos andados de cada minuto, con el tono de ese minuto (el de su celda): una parada es un hueco, con 1 px de
         aire del color de la tarjeta junto a ella. Los tramos andados que se tocan y son del mismo tono se unen (sin rayitas entre minutos). */
      const cur: { seg: { tono: 'bien' | 'atento' | 'mal'; a: number; b: number } | null } = { seg: null }
      const cierra = () => { if (cur.seg) tramos[cur.seg.tono] += rect(cur.seg.a, c.y0 + c.h - d.tira, cur.seg.b - cur.seg.a, d.tira); cur.seg = null }
      for (let k = 0; k < m.n; k++) {
        const mm = m.offsetMin + k
        if (mm >= totalMin) break
        const tono = q.celdas[k]?.tono ?? 'sin'
        if (tono === 'sin') { cierra(); continue }
        for (const [a, b] of andandoDelMinuto(det.minutos[i]![k]!.tramos)) {
          const x0 = x(mm + a / 60) + (a > 0 ? 1 : 0)
          const x1 = x(mm + b / 60) - (b < 60 ? 1 : 0)
          if (x1 - x0 <= 0.5) continue
          if (cur.seg && cur.seg.tono === tono && Math.abs(cur.seg.b - x0) < 0.01) cur.seg.b = x1
          else { cierra(); cur.seg = { tono, a: x0, b: x1 } }
        }
      }
      cierra()
      return { q, c, tramos }
    }
    const tonos: Array<{ k0: number; tono: TonoRitmo }> = []
    for (let k0 = 0; k0 < m.n; k0 += cub) {
      const celdas = Array.from({ length: Math.min(cub, m.n - k0) }, (_, j) => (m.offsetMin + k0 + j < totalMin ? (q.celdas[k0 + j]?.tono ?? 'sin') : 'sin'))
      tonos.push({ k0, tono: cub === 1 ? celdas[0]! : tonoDeCubeta(celdas) })
    }
    let ini = -1
    let tono: TonoRitmo = 'sin'
    const cierra = (kFin: number) => {
      if (tono === 'sin' || ini < 0) return
      const a = x(m.offsetMin + ini), b = x(Math.min(totalMin, m.offsetMin + kFin))
      if (b > a) tramos[tono] += rect(a, c.y0 + c.h - d.tira, b - a, d.tira)
    }
    for (let j = 0; j <= tonos.length; j++) {
      const tk = j < tonos.length ? tonos[j]!.tono : 'sin'
      const kj = j < tonos.length ? tonos[j]!.k0 : m.n
      if (tk !== tono) { cierra(kj); tono = tk; ini = kj }
    }
    return { q, c, tramos }
  })

  /* Curva fina de piezas por minuto de cada Baader contra SU esperado (la línea punteada es el 100 %; arriba de 110 % se recorta).
     Con cubetas (celular en «Turno») cada punto es el promedio de la cubeta. Sin esperado no hay vara: no se dibuja. */
  const curvas = m.maquinas.map((q, i) => {
    const c = d.carriles[i]
    if (!c || q.esperado == null || !(q.esperado > 0)) return null
    const arriba = c.y0 + 4
    const abajo = c.y0 + c.h - d.tira - 2
    const yv = (v: number) => abajo - Math.min(1.1, v / q.esperado!) * (abajo - arriba)
    if (conDetalle && det) {
      /* El escalón: el ritmo MIENTRAS ANDUVO de cada minuto (piezas ÷ segundos andando) contra el esperado, solo sobre los tramos andados. Las piezas
         son por minuto, no por segundo: la altura es plana en todo el tramo andado del minuto y es CALCULADA (`RITMO_ANDANDO_CALCULADO`). Un minuto
         sin dato corta el trazo. */
      let esc = ''
      let prevX = Number.NEGATIVE_INFINITY
      for (let k = 0; k < m.n; k++) {
        const mm = m.offsetMin + k
        if (mm >= totalMin) break
        const mb = det.minutos[i]![k]!
        if (mb.ritmo == null) { prevX = Number.NEGATIVE_INFINITY; continue }
        const yy = r1(yv(mb.ritmo))
        for (const [a, b] of andandoDelMinuto(mb.tramos)) {
          const x0 = x(mm + a / 60)
          const x1 = x(mm + b / 60)
          esc += Math.abs(prevX - x0) < 0.6 ? `V${yy}H${r1(x1)}` : `M${r1(x0)} ${yy}H${r1(x1)}`
          prevX = x1
        }
      }
      return { arriba, puntos: '', escalon: esc }
    }
    const pts: string[] = []
    for (let k0 = 0; k0 < m.n; k0 += cub) {
      const ks = Array.from({ length: Math.min(cub, m.n - k0) }, (_, j) => k0 + j).filter((k) => k < q.cycles.length)
      if (ks.length === 0 || m.offsetMin + k0 >= totalMin) continue
      const prom = ks.reduce((a, k) => a + (q.cycles[k] ?? 0), 0) / ks.length
      pts.push(`${r1(x(m.offsetMin + k0 + ks.length / 2))},${r1(yv(prom))}`)
    }
    return { arriba, puntos: pts.join(' '), escalon: '' }
  })
  /* Las micro con hora, en su minuto exacto: una ▼ sobre la fila de su Baader y una marca en el carril «Micro», del color de su causa. */
  const grande = d.tam === 'grande'
  const tw = grande ? 10 : 8
  const th = grande ? 8 : 7
  /* Con el zoom, el inicio se baja al segundo (`paradasDetalle`): la ▼, la muesca de la fila y la del carril quedan en el mismo punto. */
  const xMicro = (q: MicroClasificada) => x(((exacto ? Math.floor(q.inicioMs / 1000) * 1000 : q.inicioMs) - m.iniMs) / 60_000)
  const triangulos: Record<CausaMicro, string> = { arranque: '', linea: '', paro: '', sin: '' }
  const barritas: Record<CausaMicro, string> = { arranque: '', linea: '', paro: '', sin: '' }
  const rayasLinea = new Set<number>()
  for (const q of m.micros) {
    const c = d.carriles[q.fila]
    const mx = xMicro(q)
    if (c) triangulos[q.causa] += `M${r1(mx - tw / 2)} ${r1(c.y0)}h${tw}l${-tw / 2} ${th}z`
    if (d.micro && !exacto) barritas[q.causa] += rect(mx - 2, d.micro.y0 + 2, 4, d.micro.h - 4)
    /* La raya punteada marca «casi a la vez»: solo la forma «a la vez» (en cadena y detención previa no son simultáneas). */
    if (q.modo === 'a_la_vez') rayasLinea.add(r1(mx))
  }
  const carrilTop = d.carriles[0]?.y0 ?? 0
  const carrilFondo = d.carriles.length > 0 ? d.carriles[d.carriles.length - 1]!.y0 + d.carriles[d.carriles.length - 1]!.h : 0

  /* Las paradas en la fila de su Baader, al segundo (desde `EXACTO_PX_MIN`): 4 paths en total, uno por forma. La detención es un bloque de tinta a
     todo el alto de la cinta con un velo sobre la fila; la micro, una muesca gris de la mitad de la cinta pegada arriba (nunca en la fila
     «Detenciones»); la programada, un marco punteado de toda la fila. Con detalle, cada una lleva su rótulo si cabe (se prueba el largo y, si no, el corto). */
  let paraVelo = ''
  let paraDetenida = ''
  let paraMicro = ''
  let paraProgramada = ''
  const rotulos: Array<{ x: number; y: number; t: string; extra: string | null }> = []
  const microsExactas = exacto ? [...m.micros].sort((p, q) => q.duracionS - p.duracionS) : []
  if (exacto && det) {
    m.maquinas.forEach((q, i) => {
      const c = d.carriles[i]
      if (!c) return
      const tapeY = c.y0 + c.h - d.tira
      for (const p of det.paradas.get(q.id) ?? []) {
        const a = (p.iniMs - m.iniMs) / 60_000
        const b = p.abierta ? ultima.min : (p.finMs - m.iniMs) / 60_000
        if (b <= 0 || a >= totalMin || b <= a) continue
        const x0 = x(Math.max(0, a))
        const wv = x(Math.min(totalMin, b)) - x0
        if (wv <= 0) continue
        if (p.tipo === 'detencion') {
          paraVelo += rect(x0, c.y0, wv, c.h - d.tira)
          paraDetenida += rect(x0, tapeY, wv, d.tira)
        } else if (p.tipo === 'programada') paraProgramada += rect(x0 + 0.5, c.y0 + 0.5, Math.max(1, wv - 1), c.h - 1)
        else paraMicro += rect(x0, tapeY, Math.max(2, wv), d.tira - 4)
        if (!conDetalle) continue
        const cabe = (t: string) => anchoRotulo11(t) + 6 <= wv
        const dur = p.abierta ? '' : duracionExacta(p.durS)
        let t: string | undefined
        let extra: string | null = null
        if (p.tipo === 'micro') t = [`micro ${dur}`, dur].find(cabe)
        else if (p.tipo === 'detencion') {
          if (p.abierta) t = ['Detención en curso'].find(cabe)
          else {
            t = [`Detención ${dur}`, dur].find(cabe)
            if (t?.startsWith('Detención') && duenoDe(p.razon ?? '').dueno === 'sin-imputar' && cabe(`${t} · falta dueño`)) extra = 'falta dueño'
          }
        } else {
          const motivo = motivoLegible(p.razon) ?? 'Detención programada'
          t = [`${motivo} · programada · hasta ${relojConSegundos(p.finMs)}`, `${motivo} · programada`].find(cabe)
        }
        if (t) rotulos.push({ x: x0 + 3, y: tapeY - 5, t, extra })
      }
    })
  }

  // Paradas: las programadas debajo, Mantención arriba de todo. La micro no va en esta fila (tiene su carril «Micro» y su ▼): solo detenciones y programadas.
  const ordenParadas = [...m.paradas.filter((q) => q.desdeMin < totalMin && q.hastaMin > 0 && !(m.conMicro && esParadaMicro(q)))].sort((a, b) => ORDEN_DUENO[a.dueno] - ORDEN_DUENO[b.dueno])
  const finProy = m.proy?.hasta
  const gap = m.aHora
  const textoBrecha = gap != null ? adelanteAtras(gap) : ''
  /* El rótulo de «a esta hora» va a la derecha de la punta; si no cabe en lo que se VE (con zoom la ventana termina poco después
     de la punta), pasa a su izquierda. Texto de 12 px/600: ~7,4 px por carácter. */
  const anchoBrecha = textoBrecha.length * 7.4
  const brechaIzq = brechaALaIzquierda(xAhora, anchoBrecha, visDer)
  const baseY = fondoLienzo(d)
  const idTrama = `${uid}trama`
  const idClip = `${uid}clip`
  const idBanda = `${uid}banda`
  const ryMeta = m.meta != null ? y(m.meta) : 0
  const metaAbajo = ryMeta - 18 < 0
  const topBanda = d.acum.y0
  const pisoBanda = d.acum.y0 + d.acum.h
  const ryProyTxt = finProy ? acota(y(finProy.v), topBanda + 14, pisoBanda - 12) : 0
  /* En el celular «a esta hora» y «al cierre» comparten el borde derecho: si se cruzan, la brecha baja (o el cierre sube). */
  const textoCierre = chico && finProy ? (m.detenida ? 'detenida · proyección en pausa' : `al cierre ${int(finProy.v)}`) : null
  let yBrechaTxt = m.cuota && gap != null ? (y(ultima.v) + y(m.cuota.piezas)) / 2 + 4 : 0
  let yCierreTxt = ryProyTxt - 8
  if (textoCierre && m.cuota && gap != null) {
    const wB = anchoBrecha, wC = textoCierre.length * 7.2
    const b0 = brechaIzq ? xAhora - 20 - wB : xAhora + 20
    const b1 = b0 + wB
    const c0 = W - AIRE_DER - 4 - wC
    if (b0 < W - AIRE_DER - 4 && b1 + 6 > c0) ({ yBrecha: yBrechaTxt, yCierre: yCierreTxt } = separarRotulos(yBrechaTxt, yCierreTxt, pisoBanda - 2))
  }

  return (
    <svg width={W} height={d.alto} viewBox={`0 0 ${W} ${d.alto}`} className="absolute left-0 top-0 block" aria-hidden>
      <defs>
        <pattern id={idTrama} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--v2-mant)" />
          <rect width="2.4" height="6" fill="rgb(0 0 0 / 0.42)" />
        </pattern>
        <clipPath id={idClip}>
          <rect ref={clipRef} x={-W} y={0} width={W} height={d.alto} transform={`translate(${r1(x(ultima.min))} 0)`} />
        </clipPath>
        {/* La banda del acumulado: con zoom lo que se sale del dominio Y se recorta, no invade las barras de abajo. */}
        <clipPath id={idBanda}>
          <rect x={0} y={topBanda - 6} width={W} height={d.acum.h + 12} />
        </clipPath>
      </defs>

      {/* Rejilla del acumulado, base de las barras y carriles de las filas */}
      {[...new Set([m.yMin, ...ticksY])].map((v) => <line key={v} x1={0} x2={W} y1={r1(y(v))} y2={r1(y(v))} stroke="var(--v2-reja)" />)}
      {barras && <line x1={0} x2={W} y1={r1(barras.y0 + barras.h)} y2={r1(barras.y0 + barras.h)} stroke="var(--v2-reja)" />}
      {d.carriles.map((c, i) => <rect key={i} x={0} y={c.y0} width={W} height={c.h} rx={3} fill="rgb(142 142 147 / 0.08)" />)}
      <rect x={0} y={d.paradas.y0} width={W} height={d.paradas.h} rx={3} fill="rgb(142 142 147 / 0.08)" />
      {/* Con detalle, una raya fina en cada minuto sobre las filas y los carriles: se cuenta a ojo y se ubica una parada en su minuto. */}
      {conDetalle && d.carriles.length > 0 && <path d={Array.from({ length: Math.max(0, Math.ceil(totalMin) - 1) }, (_, j) => `M${r1(x(j + 1))} ${carrilTop}V${baseY}`).join('')} fill="none" stroke="var(--rv-minuto)" />}

      <g clipPath={`url(#${idBanda})`}>
        {/* El turno anterior equivalente: su curva COMPLETA, visible (3,4:1 en claro, 4,1:1 en oscuro), sólida y fina */}
        {m.previoPts.length > 1 && (
          <polyline points={puntos(m.previoPts)} fill="none" stroke="rgb(var(--muted-foreground))" strokeOpacity={0.65} strokeWidth={1.5} strokeLinejoin="round" />
        )}

        {/* Meta del turno (tenue) y ritmo de la meta (punteado 5-4: se distingue del turno anterior por el trazo, no solo por el tono) */}
        {m.meta != null && enBanda(m, m.meta) && (
          <g>
            <line x1={0} x2={W} y1={r1(ryMeta)} y2={r1(ryMeta)} stroke="var(--v2-tenue)" strokeWidth={1} strokeDasharray="2 4" />
            <text x={6} y={r1(metaAbajo ? ryMeta + 14 : ryMeta - 6)} fontSize={12} className="fill-muted-foreground tabular-nums">meta {int(m.meta)}</text>
          </g>
        )}
        {m.objetivo.length > 1 && (
          <polyline points={puntos(m.objetivo)} fill="none" stroke="rgb(var(--muted-foreground))" strokeOpacity={0.8} strokeWidth={1.5} strokeDasharray="5 4" />
        )}

        {/* Hoy: área y trazo, revelados por el clip que avanza con el reloj de datos */}
        <g clipPath={`url(#${idClip})`}>
          <polygon points={`${r1(x(0))},${r1(y(m.yMin))} ${puntos(m.trazo)} ${r1(x(ultima.min))},${r1(y(m.yMin))}`} fill="var(--v2-acento)" fillOpacity={0.12} />
          <polyline points={puntos(m.trazo)} fill="none" stroke="var(--v2-acento)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {/* Proyección punteada de la punta hasta «al cierre». Detenida: plana y más apagada. */}
        {m.proy && finProy && (
          <g key={`${ultima.min}-${ultima.v}`} className="eje-aparece" opacity={m.detenida ? 0.45 : 1}>
            <line
              ref={proyRef}
              x1={0} y1={0} x2={1} y2={0}
              vectorEffect="non-scaling-stroke"
              stroke="var(--v2-acento)" strokeWidth={2} strokeDasharray="1.5 4" strokeLinecap="round"
              transform={`matrix(${r1(x(finProy.min) - x(ultima.min))} ${r1(y(finProy.v) - y(ultima.v))} 0 1 ${r1(x(ultima.min))} ${r1(y(ultima.v))})`}
            />
            {/* En el celular no hay columna derecha: el cierre se rotula dentro, pegado al borde. */}
            {textoCierre && (
              <text
                x={r1(W - AIRE_DER - 4)} y={r1(yCierreTxt)} textAnchor="end" fontSize={12} fontWeight={600} className="tabular-nums"
                style={{ fill: m.detenida ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))', ...HALO }}
              >
                {textoCierre}
              </text>
            )}
          </g>
        )}

        {/* A esta hora: la brecha contra lo que tocaba, junto a la punta (la MISMA cifra de la franja y de Camino a la meta) */}
        {m.cuota && gap != null && (
          <g ref={brechaRef} className="eje-aparece" key={`brecha-${ultima.v}`}>
            <line ref={brechaLineaRef} x1={r1(xAhora + (brechaIzq ? -14 : 14))} x2={r1(xAhora + (brechaIzq ? -14 : 14))} y1={r1(y(ultima.v))} y2={r1(y(m.cuota.piezas))} stroke={gap < 0 ? 'var(--v2-mal)' : 'var(--v2-bien)'} strokeWidth={1.5} />
            <text
              ref={brechaTextoRef}
              data-y0={yBrechaTxt} data-mid0={(y(ultima.v) + y(m.cuota.piezas)) / 2}
              x={r1(xAhora + (brechaIzq ? -20 : 20))} y={r1(yBrechaTxt)}
              textAnchor={brechaIzq ? 'end' : 'start'} fontSize={12} fontWeight={600} className="tabular-nums"
              style={{ fill: gap < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))', ...HALO }}
            >
              {textoBrecha}
            </text>
          </g>
        )}
      </g>

      {/* Barras por minuto de la línea */}
      {barras && m.esperadoLinea != null && (
        <line x1={0} x2={W} y1={r1(yb(m.esperadoLinea))} y2={r1(yb(m.esperadoLinea))} stroke="var(--v2-tenue)" strokeWidth={1} strokeDasharray="3 3" />
      )}
      {(['bien', 'atento', 'mal', 'sin'] as const).map((t) => porTono[t] && <path key={t} d={porTono[t]} fill={COLOR_TONO[t]} />)}
      {(['bien', 'atento', 'mal', 'sin'] as const).map((t) => parcialTono[t] && <path key={`p-${t}`} d={parcialTono[t]} fill={COLOR_TONO[t]} fillOpacity={0.45} />)}
      {nuevas.map((q) => (
        <rect
          key={`n-${m.suma.length}`} ref={barraRef} x={r1(q.x)} y={r1(q.y)} width={r1(q.w)} height={r1(q.h)} fill={COLOR_TONO[q.tono]} fillOpacity={q.parcial ? 0.45 : undefined}
          style={{ transformBox: 'fill-box', transformOrigin: '50% 100%', transform: `scaleY(${(m.enCurso?.f0 ?? 1).toFixed(4)})` }}
        />
      ))}

      {/* Una fila por Baader: andando casi no se nota; lenta o detenida con la línea andando toma color */}
      {filas.map(({ q, c, tramos }) => c && (
        <g key={q.id}>
          {(['bien', 'atento', 'mal'] as const).map((t) => tramos[t] && <path key={t} d={tramos[t]} fill={COLOR_TONO[t]} fillOpacity={OPACIDAD_FILA[t]} />)}
        </g>
      ))}

      {/* Piezas por minuto de cada Baader: la curva fina, y el esperado de esa Baader como línea punteada tenue */}
      {curvas.map((cv, i) => cv && (
        <g key={m.maquinas[i]!.id}>
          <line x1={0} x2={W} y1={r1(cv.arriba)} y2={r1(cv.arriba)} stroke="var(--v2-tenue)" strokeWidth={1} strokeDasharray="3 4" />
          {cv.puntos.includes(' ') && <polyline points={cv.puntos} fill="none" stroke="rgb(var(--foreground))" strokeOpacity={0.85} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />}
          {cv.escalon && <path d={cv.escalon} fill="none" stroke="var(--rv-escalon)" strokeWidth={1.6}><title>{RITMO_ANDANDO_CALCULADO}</title></path>}
        </g>
      ))}

      {/* Las paradas en la fila de su Baader, al segundo: velo, detención, micro y programada (un path por forma) y sus rótulos */}
      {paraVelo && <path d={paraVelo} fill="var(--rv-velo)" />}
      {paraDetenida && <path d={paraDetenida} fill="var(--rv-detenida)" />}
      {paraMicro && <path d={paraMicro} fill="var(--rv-micro)" />}
      {paraProgramada && <path d={paraProgramada} fill="none" stroke="var(--v2-gris)" strokeDasharray="3 3" />}
      {rotulos.map((r, i) => (
        <text key={i} x={r1(r.x)} y={r1(r.y)} fontSize={11} fontWeight={600} className="tabular-nums" style={{ fill: 'rgb(var(--muted-foreground))' }}>
          {r.t}
          {r.extra && <tspan style={{ fill: 'var(--v2-atento-texto)' }}> · {r.extra}</tspan>}
        </text>
      ))}

      {/* Línea común: una raya punteada que cruza las filas de las Baader en el instante de una micro simultánea */}
      {[...rayasLinea].map((rx) => <line key={rx} x1={rx} x2={rx} y1={carrilTop - 2} y2={carrilFondo} stroke="rgb(var(--foreground))" strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray="3 3" />)}

      {/* Paradas por dueño. Mantención lleva trama además del ámbar: el 50–75 % de arriba no lleva. */}
      {ordenParadas.map((q, i) => {
        const x0 = x(Math.max(0, q.desdeMin))
        const ww = Math.max(3, x(Math.min(totalMin, q.hastaMin)) - x0)
        const ry = d.paradas.y0 + 2
        const hh = d.paradas.h - 4
        if (q.dueno === 'programado') return <rect key={i} x={r1(x0)} y={ry} width={r1(ww)} height={hh} rx={2} fill="none" stroke="var(--v2-gris)" strokeDasharray="3 3" />
        if (q.dueno === 'mantencion') return <rect key={i} x={r1(x0)} y={ry} width={r1(ww)} height={hh} rx={2} fill={`url(#${idTrama})`} stroke="var(--v2-mant)" strokeWidth={1.5} />
        return <rect key={i} x={r1(x0)} y={ry} width={r1(ww)} height={hh} rx={2} fill={RELLENO_DUENO[q.dueno]} />
      })}

      {/* Micro con hora: ▼ sobre la fila de su Baader y una marca en el carril «Micro», del color de su causa posible (halo del color de la tarjeta) */}
      {d.micro && <rect x={0} y={d.micro.y0} width={W} height={d.micro.h} rx={3} fill="var(--v2-relleno)" />}
      {/* Con el zoom, cada micro del carril mide lo que dura (mínimo 3 px): la más larga primero y la corta encima, con un trazo de 1 px del color de la tarjeta para que se vean las dos. */}
      {d.micro && microsExactas.map((q) => (
        <rect key={q.id} x={r1(xMicro(q))} y={d.micro!.y0 + 3} width={r1(Math.max(3, (q.duracionS / 60) * pxMin))} height={d.micro!.h - 6} rx={2} fill={COLOR_CAUSA[q.causa]} stroke="rgb(var(--card))" strokeWidth={1} />
      ))}
      {CAUSAS_MICRO.map((k) => (
        <g key={k} fill={COLOR_CAUSA[k]}>
          {triangulos[k] && <path d={triangulos[k]} style={{ paintOrder: 'stroke', stroke: 'rgb(var(--card))', strokeWidth: 2, strokeLinejoin: 'round' }} />}
          {barritas[k] && <path d={barritas[k]} />}
        </g>
      ))}

      {/* «Ahora» (o el fin del turno cerrado): una sola raya que cruza todo el lienzo, y su punta (que se traslada con el reloj) */}
      <line x1={r1(xAhora)} x2={r1(xAhora)} y1={d.acum.y0} y2={baseY} stroke="rgb(var(--foreground) / 0.35)" strokeWidth={1} />
      <g clipPath={`url(#${idBanda})`}>
        <g ref={puntaRef} transform="translate(0 0)">
          <circle cx={r1(x((previa ?? ultima).min))} cy={r1(y((previa ?? ultima).v))} r={4.5} fill="var(--v2-acento)" stroke="rgb(var(--background))" strokeWidth={2} />
        </g>
      </g>

      {/* Eje X compartido. Con detalle, marcas cada 15 s sobre la fila de horas: el minuto de 6 px y las de 15, 30 y 45 s de 4 px. */}
      {conDetalle && <path d={Array.from({ length: Math.ceil(totalMin) }, (_, j) => `M${r1(x(j))} ${d.ejeX - 7}v6${MARCAS_15S.map((s) => `M${r1(x(j + s / 60))} ${d.ejeX - 5}v4`).join('')}`).join('')} fill="none" stroke="var(--v2-tenue)" />}
      {marcas.map((t) => {
        const ancla = anclaMarca(t)
        return ancla && <text key={t} x={r1(x(t))} y={d.ejeX + 12} textAnchor={ancla} fontSize={fs} className="fill-muted-foreground tabular-nums">{relojDe(m.iniMs + t * 60_000)}</text>
      })}
      <text x={r1(xRotAhora)} y={d.ejeX + 12} textAnchor={anclaAhora} fontSize={fs} fontWeight={600} className="fill-foreground tabular-nums">{horaAhora} {m.finReal ? 'fin' : 'ahora'}</text>
    </svg>
  )
})

/** La raya del minuto tocado y su punto sobre la curva (aparte del SVG grande: se redibuja con cada movimiento). */
function CursorSvg({ m, W, info }: { m: Modelo; W: number; info: LecturaGlobo }) {
  const px = pxPorMinuto(W, m.totalMin)
  const xm = info.xMin * px
  const baseY = fondoLienzo(m.d)
  /* El minuto señalado con el zoom: una banda desde las barras hasta el carril «Micro» y, con detalle, las guías de :15 :30 :45 con su rótulo
     (arriba de las filas, entre ellas y las barras: abajo chocaban con la hora siguiente). Va aquí y no en el lienzo para que el lienzo no se
     redibuje al mover el cursor. */
  const exacto = m.detalle != null && px >= EXACTO_PX_MIN
  const guias = exacto && px >= DETALLE_PX_MIN
  const x0 = Math.floor(info.xMin) * px
  const top = m.d.carriles[0]?.y0 ?? m.d.paradas.y0
  return (
    <svg width={W} height={m.d.alto} viewBox={`0 0 ${W} ${m.d.alto}`} className="pointer-events-none absolute left-0 top-0 block" aria-hidden>
      {exacto && <rect x={r1(x0)} y={(m.d.barras?.y0 ?? top) - 4} width={r1(px)} height={r1(baseY - (m.d.barras?.y0 ?? top) + 4)} fill="var(--rv-foco)" />}
      {guias && MARCAS_15S.map((s) => <line key={s} x1={r1(x0 + (px * s) / 60)} x2={r1(x0 + (px * s) / 60)} y1={top} y2={baseY} stroke="var(--rv-guia)" />)}
      {guias && MARCAS_15S.map((s) => <text key={`t${s}`} x={r1(x0 + (px * s) / 60)} y={top - 2} textAnchor="middle" fontSize={10} fontWeight={600} className="fill-muted-foreground tabular-nums" style={HALO}>:{s}</text>)}
      {/* Con el zoom la banda y las guías reemplazan a la raya del medio (que taparía la guía de :30). */}
      {!exacto && <line x1={r1(xm)} x2={r1(xm)} y1={m.d.acum.y0} y2={baseY} stroke="rgb(var(--foreground))" strokeWidth={1.5} />}
      {info.acum != null && enBanda(m, info.acum) && <circle cx={r1(xm)} cy={r1(yAcum(m, info.acum))} r={4.5} fill="rgb(var(--foreground))" stroke="rgb(var(--background))" strokeWidth={2} />}
    </svg>
  )
}

// ── Rótulos fijos a los lados ────────────────────────────────────────────────

/** Eje Y del acumulado, «pz/min» y los nombres de cada fila: no se mueven con el zoom. */
function RotulosIzq({ m }: { m: Modelo }) {
  const { d } = m
  const chico = d.tam === 'chico'
  const fs = d.tam === 'grande' ? 12 : 11
  const ticks = rayasY(m.yMin, m.yMax, m.rejilla)
  /* Con zoom la rejilla cambia de valores (13.400, 13.800…): se dicen enteros; en «Turno» del celular, «2 mil». */
  const rotuloY = (v: number) => (chico && m.vent == null ? (v === 0 ? '0' : `${v / 1000} mil`) : int(v))
  /* Con zoom el piso (`yMin`) no es una raya redonda: su valor se rotula abajo, salvo que quede pegado a la primera raya. */
  const pisoRotulado = m.yMin > 0 && !ticks.includes(m.yMin) && (ticks[0] ?? Infinity) - m.yMin >= m.rejilla * 0.3
  const xr = d.pl - 8
  return (
    <svg width={d.pl} height={d.alto} className="block shrink-0 overflow-visible" aria-hidden>
      {ticks.map((v) => <text key={v} x={xr} y={r1(yAcum(m, v) + 4)} textAnchor="end" fontSize={fs} className="fill-muted-foreground tabular-nums">{rotuloY(v)}</text>)}
      {pisoRotulado && <text x={xr} y={r1(yAcum(m, m.yMin) + 4)} textAnchor="end" fontSize={fs} className="fill-muted-foreground tabular-nums">{int(m.yMin)}</text>}
      {d.barras && !chico && <text x={xr} y={r1(d.barras.y0 + d.barras.h / 2 + 4)} textAnchor="end" fontSize={fs} className="fill-muted-foreground">pz/min</text>}
      {/* En el celular «esperado N» vive acá, en la columna fija: dentro del lienzo se iba con el zoom. */}
      {d.barras && chico && (
        <g className="fill-muted-foreground tabular-nums">
          <text x={xr} y={r1(d.barras.y0 + 12)} textAnchor="end" fontSize={fs}>pz/min</text>
          {m.esperadoLinea != null && <text x={xr} y={r1(d.barras.y0 + 26)} textAnchor="end" fontSize={fs}>esperado</text>}
          {m.esperadoLinea != null && <text x={xr} y={r1(d.barras.y0 + 39)} textAnchor="end" fontSize={fs} fontWeight={600}>{int(m.esperadoLinea)}</text>}
        </g>
      )}
      {m.maquinas.map((q, i) => {
        const c = d.carriles[i]
        return c ? <text key={q.id} x={xr} y={r1(c.y0 + c.h / 2 + 4)} textAnchor="end" fontSize={fs} className="fill-foreground">{etiquetaMaquina(q.nombre)}</text> : null
      })}
      <text x={xr} y={r1(d.paradas.y0 + d.paradas.h / 2 + 4)} textAnchor="end" fontSize={fs} className="fill-foreground">Detenciones</text>
      {d.micro && <text x={xr} y={r1(d.micro.y0 + d.micro.h / 2 + 4)} textAnchor="end" fontSize={fs} className="fill-foreground">Micro</text>}
    </svg>
  )
}

/** Cierre proyectado, esperado de la línea, llenado de cada Baader y paradas (PC; en el celular no hay columna). */
function RotulosDer({ m }: { m: Modelo }) {
  const { d } = m
  const xr = 8
  /* Las dos líneas nuevas de cada fila miden hasta 20 caracteres: en la columna de 120 px (1366) van a 11 px, el piso. */
  const fsDer = d.tam === 'grande' ? 12 : 11
  /* Paradas = tiempo de RELOJ con alguna parada (unión de intervalos, sin programadas) y episodios fusionados: tres Baader
     paradas a la vez cuentan una vez (la suma por máquina daba casi 5 h en un turno de 7 h 20 min). */
  const lim = { min: 0, max: m.totalMin }
  /* La columna cuenta DETENCIONES: la micro tiene su carril («N con hora · de M»). Sin carril «Micro» (doc anterior) las micro siguen en la fila y se cuentan. El tiempo
     «con alguna Baader detenida» incluye la micro: Shoplogix la suma al tiempo detenido. */
  const nParadas = episodiosParada(m.conMicro ? m.paradas.filter((q) => !esParadaMicro(q)) : m.paradas, lim)
  const minParadas = minutosConParada(m.paradas, lim)
  const fin = m.proy?.hasta ?? null
  const vFin = fin ? fin.v : m.cerrado ? m.ultima.v : null
  const yFin = vFin != null ? Math.max(d.acum.y0 + 8, Math.min(yAcum(m, vFin), d.acum.y0 + d.acum.h - 28)) : 0
  const vsMeta = vFin != null && m.meta != null && !m.detenida ? vFin - m.meta : null
  return (
    <svg width={d.pr} height={d.alto} className="block shrink-0 overflow-visible" aria-hidden>
      {vFin != null && (m.detenida ? (
        <g>
          <text x={xr} y={r1(yFin - 6)} fontSize={12} fontWeight={600} style={{ fill: 'var(--v2-mal-texto)' }}>detenida</text>
          <text x={xr} y={r1(yFin + 10)} fontSize={12} className="fill-muted-foreground">proyección en pausa</text>
        </g>
      ) : (
        <g className="tabular-nums">
          <text x={xr} y={r1(yFin - 6)} fontSize={12} className="fill-muted-foreground">{m.cerrado ? 'cierre' : 'al cierre'}</text>
          <text x={xr} y={r1(yFin + 10)} fontSize={12} fontWeight={600} style={{ fill: 'rgb(var(--brand-ink))' }}>{int(vFin)} pz</text>
          {vsMeta != null && <text x={xr} y={r1(yFin + 26)} fontSize={12} style={{ fill: vsMeta < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))' }}>{/* Sin «de la meta»: la columna mide 104 px (128 en pantallas grandes) y «532 adelante de la meta» pide 127; el rótulo de arriba («al cierre») ya dice contra qué es. */}{Math.round(vsMeta) === 0 ? 'en la meta' : adelanteAtras(vsMeta)}</text>}
        </g>
      ))}
      {d.barras && m.esperadoLinea != null && (
        <text x={xr} y={r1(d.barras.y0 + d.barras.h - (m.esperadoLinea / m.topBarra) * d.barras.h + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">esperado {int(m.esperadoLinea)}</text>
      )}
      {m.maquinas.map((q, i) => {
        const c = d.carriles[i]
        if (!c) return null
        /* «anduvo a X pz/min · esperado N»: el ritmo «mientras anduvo» que ya usa el monitor (`ritmoPorMaquina`), contra el esperado de esa Baader. */
        if (q.anduvo != null) {
          return (
            <g key={q.id} className="fill-muted-foreground tabular-nums" fontSize={fsDer}>
              <text x={xr} y={r1(c.y0 + c.h / 2 - 2)}>anduvo a {dec(q.anduvo)} pz/min</text>
              {q.esperado != null && <text x={xr} y={r1(c.y0 + c.h / 2 + 12)}>esperado {int(q.esperado)}</text>}
            </g>
          )
        }
        const t = q.ultimoLlenado != null && m.unidad ? `${q.ultimoLlenado} % ${m.unidad}` : q.pct != null ? `${q.pct} % a ritmo` : ''
        return t ? <text key={q.id} x={xr} y={r1(c.y0 + c.h / 2 + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">{t}</text> : null
      })}
      <text x={xr} y={r1(d.paradas.y0 + d.paradas.h / 2 + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">
        {nParadas > 0 ? `${nParadas} ${nParadas === 1 ? 'detención' : 'detenciones'}` : 'sin detenciones'}
      </text>
      {d.micro && (
        <text x={xr} y={r1(d.micro.y0 + d.micro.h / 2 + 4)} fontSize={fsDer} className="fill-muted-foreground tabular-nums">
          {m.micros.length} con hora{m.microTotal != null ? ` · de ${int(m.microTotal)}` : ''}
        </text>
      )}
      {minParadas > 0 && <text x={xr} y={r1(d.ejeX + 12)} fontSize={12} fontWeight={600} className="fill-foreground tabular-nums">{horasMin(minParadas)}</text>}
      {/* Mide el reloj con ALGUNA Baader detenida, no la línea entera (Análisis cuenta la línea completa: otra cifra, otra medida). */}
      {minParadas > 0 && <text x={xr} y={r1(d.ejeX + 25)} fontSize={11} className="fill-muted-foreground">alguna Baader detenida</text>}
    </svg>
  )
}

// ── Lo que dice el globo ─────────────────────────────────────────────────────

interface LecturaGlobo {
  /** Minuto tocado (entero) + 0,5: la raya cae al medio de su barra. */
  xMin: number
  hora: string
  rango: string
  acum: number | null
  futuro: boolean
  tocaban: number | null
  /** El minuto en curso de un turno en vivo: su meta es «a esta hora»; la de un minuto pasado, «a esa hora». */
  ahora: boolean
  /** Hechas − meta a esa hora. El minuto en curso usa «A esta hora» de la vista; los demás, la resta de sus dos valores. */
  dif: number | null
  linea: number | null
  esperadoLinea: number | null
  baaders: Array<{ id: string; nombre: string; v: number; esperado: number | null; celda: CeldaBaader }>
  /** La parada MÁS LARGA de las que cubren el minuto (su tramo y su dueño); null si no hay ninguna. */
  parada: ParadaEje | null
  /** Quiénes están parados en ese minuto: «Ev 1 · Ev 2 · Ev 3», «Las 3 Baader» si son todas, o «Parada de línea». */
  paradaQuienes: string | null
  /** «01:11 → 02:08 · 57 min» de esa parada. */
  paradaTxt: string | null
  /** «parcial · falta Ev 2»: el minuto en curso al que alguna Baader aún no entregó su dato. */
  parcial: string | null
}

/**
 * Todo del modelo ya armado. El minuto en curso usa EXACTAMENTE la punta y la cuota que ven la franja y Camino a la
 * meta (una sola definición de «a esta hora»); los demás, el trazo, la curva de la meta y la serie por minuto.
 */
function leer(m: Modelo, min: number, vivas?: CifrasVivas | null): LecturaGlobo {
  const k0 = Math.floor(min)
  const kMid = k0 + 0.5
  const enAhora = k0 === Math.floor(m.ultima.min)
  const futuro = !enAhora && kMid > m.ultima.min
  /* El minuto en curso, con las cifras del MISMO instante que la franja (PR B); sin ellas, las de reposo. */
  const vivo = enAhora && vivas && vivas.aHora != null && !m.cerrado ? vivas : null
  const acum = vivo ? vivo.hechas : enAhora ? m.ultima.v : futuro ? (m.proy ? valorEnCurva([m.proy.desde, m.proy.hasta], kMid) : null) : valorEnCurva(m.trazo, kMid)
  const tocaban = vivo ? vivo.cuota : enAhora && m.cuota && !m.cerrado ? m.cuota.piezas : valorEnCurva(m.objetivo, kMid)
  const dif = vivo ? vivo.aHora : enAhora && m.aHora != null ? m.aHora : acum != null && tocaban != null && !futuro ? acum - tocaban : null
  const k = k0 - m.offsetMin
  const enSerie = k >= 0 && k < m.n
  const paradas = paradasEn(m.paradas, kMid)
  const parada = paradas[0] ?? null
  /* El nombre de cada máquina parada es el que ya usa su fila (`etiquetaMaquina` sobre el nombre del gráfico). */
  const nombres: string[] = []
  for (const q of paradas) {
    const crudo = (q.maquinaId ? m.maquinas.find((x) => x.id === q.maquinaId)?.nombre : null) ?? q.maquina
    if (crudo) { const e = etiquetaMaquina(crudo); if (!nombres.includes(e)) nombres.push(e) }
  }
  const quienes = !parada ? null : nombres.length === 0 ? 'Detención de línea' : m.maquinas.length > 1 && nombres.length >= m.maquinas.length ? `Las ${m.maquinas.length} Baader` : nombres.join(' · ')
  const faltan = enSerie ? m.maquinas.filter((q) => k >= q.cycles.length).map((q) => etiquetaMaquina(q.nombre)) : []
  return {
    xMin: kMid,
    hora: relojDe(m.iniMs + k0 * 60_000),
    rango: `${relojDe(m.iniMs + k0 * 60_000)}–${relojDe(m.iniMs + (k0 + 1) * 60_000)}`,
    acum,
    futuro,
    tocaban,
    ahora: enAhora && !m.cerrado,
    dif,
    linea: enSerie ? m.suma[k]! : null,
    esperadoLinea: enSerie ? m.esperadoMin[k] ?? null : null,
    baaders: enSerie
      ? m.maquinas.filter((q) => k < q.cycles.length).map((q) => ({ id: q.id, nombre: etiquetaMaquina(q.nombre), v: q.cycles[k] ?? 0, esperado: q.esperado, celda: q.celdas[k]! }))
      : [],
    parada,
    paradaQuienes: quienes,
    paradaTxt: parada ? `${relojDe(m.iniMs + parada.desdeMin * 60_000)} → ${relojDe(m.iniMs + parada.hastaMin * 60_000)} · ${horasMin(parada.hastaMin - parada.desdeMin)}` : null,
    parcial: enSerie && k >= m.completos && faltan.length > 0 ? `parcial · falta ${faltan.join(' · ')}` : null,
  }
}

/**
 * El globo del minuto. En PC y tabletas flota junto al cursor (280 px). En el celular (`compacto`) no flota: va anclado a
 * la tarjeta, sobre el bloque título/leyenda/segmentado, para que el lienzo y la raya del minuto queden a la vista;
 * renglones de 12/16 px (con 13/18 el caso más cargado, una parada con tres Baader en estados distintos, llegaba a 8 renglones y
 * 170 px: su borde tapaba el inicio de la raya) y un ✕ de 44 px de área táctil.
 */
function Globo({ info, style, compacto, onCerrar }: { info: LecturaGlobo; style?: CSSProperties; compacto?: boolean; onCerrar?: () => void }) {
  const dif = info.dif
  const p = info.parada
  const colorDif = { color: dif != null && dif < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))' }
  const estadoDe = (q: LecturaGlobo['baaders'][number]) => (q.celda.estado === 'sin-dato' ? 'sin dato' : q.celda.estado)
  /* Compacto: «● Ev 1 andando ● Ev 2 andando…» en un renglón que salta; las cifras por Baader quedan en el globo de PC. */
  const baaders = info.baaders.map((q) => (
    <li key={q.id} className={compacto ? 'inline-flex items-center gap-1.5 text-foreground' : 'flex items-center gap-2 text-foreground'}>
      <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_TONO[q.celda.tono] }} aria-hidden />
      {q.nombre}
      <span className="tabular-nums text-muted-foreground">{compacto ? estadoDe(q) : `${q.esperado != null ? `${int(q.v)} de ${int(q.esperado)} · ` : `${int(q.v)} pz · `}${estadoDe(q)}`}</span>
    </li>
  ))
  const duenoFila = p && (
    <div className="flex items-center gap-1.5 text-[12px] text-foreground">
      <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.dueno === 'mantencion' ? TRAMA_MANT : RELLENO_DUENO[p.dueno] }} aria-hidden />
      <span>{DUENO_META[p.dueno].label}</span>
      {p.dueno === 'sin-imputar'
        ? <span className="font-semibold" style={{ color: 'var(--v2-atento-texto)' }}>· falta dueño</span>
        : <span className="min-w-0 truncate text-muted-foreground">· {p.causa}</span>}
    </div>
  )

  /* Con una parada en el minuto y todas las Baader en «detenida» o «sin dato», la lista repite lo que ya dice la fila de la parada
     («Las 3 Baader»): en el celular se omite. Con ella el globo llegaba a 9 renglones y su borde tapaba el inicio de la raya del minuto. */
  const listaRedundante = p != null && info.baaders.every((q) => q.celda.estado === 'detenida' || q.celda.estado === 'sin-dato')

  if (compacto) {
    return (
      <div className="v2-tip absolute inset-x-[12px] top-[12px] z-[2] box-border rounded-[22px] py-2.5 pl-4 pr-[52px] text-[12px] leading-4" role="group" aria-label="Lectura del minuto">
        {/* `tap-44` fija `position: relative`: el ✕ va en un contenedor absoluto, no él mismo. */}
        <span className="absolute right-[8px] top-[8px]">
          <button type="button" onClick={onCerrar} aria-label="Cerrar la lectura del minuto" className="tap-44 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: 'var(--v2-bien)' }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
        <div className="tabular-nums"><b className="font-semibold text-foreground">{info.hora}</b> <span className="text-muted-foreground">minuto {info.rango}</span></div>
        {info.acum != null && (
          <div className="tabular-nums text-muted-foreground">
            {info.futuro ? 'Proyección' : 'Hechas'} <b className="font-semibold text-foreground">{int(info.acum)} pz</b>
            {info.tocaban != null && <> · meta a {info.ahora ? 'esta' : 'esa'} hora <span className="text-foreground">{int(info.tocaban)}</span>{dif != null && <span className="ml-1" style={colorDif}>({adelanteAtras(dif)})</span>}</>}
          </div>
        )}
        {info.linea != null && (
          <div className="tabular-nums text-muted-foreground">
            Ritmo de la línea <b className="font-semibold text-foreground">{int(info.linea)}</b>{info.esperadoLinea != null ? ` de ${int(info.esperadoLinea)}` : ''} pz/min
            {info.parcial && <span className="ml-1 font-semibold" style={{ color: 'var(--v2-atento-texto)' }}>· {info.parcial}</span>}
          </div>
        )}
        {baaders.length > 0 && !listaRedundante && <ul className="flex flex-wrap gap-x-3 gap-y-0">{baaders}</ul>}
        {p && (
          <div className="mt-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate font-semibold text-foreground">{info.paradaQuienes}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{info.paradaTxt}</span>
            </div>
            {duenoFila}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="v2-tip pointer-events-none absolute z-10 box-border w-[280px] rounded-[22px] px-4 py-3.5" style={style} role="tooltip">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[17px] font-semibold tabular-nums text-foreground">{info.hora}</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">minuto {info.rango}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_auto] justify-between gap-x-4 gap-y-1 text-[13px] tabular-nums">
        {info.acum != null && (
          <>
            <dt className="text-muted-foreground">{info.futuro ? 'Proyección' : 'Hechas'}</dt>
            <dd className="text-right font-semibold text-foreground">{int(info.acum)} pz</dd>
          </>
        )}
        {info.tocaban != null && (
          <>
            <dt className="text-muted-foreground">{info.ahora ? 'Meta a esta hora' : 'Meta a esa hora'}</dt>
            <dd className="text-right text-foreground">
              {int(info.tocaban)}
              {dif != null && <span className="ml-1" style={colorDif}>({adelanteAtras(dif)})</span>}
            </dd>
          </>
        )}
        {info.linea != null && (
          <>
            <dt className="text-muted-foreground">Ritmo de la línea</dt>
            <dd className="text-right text-foreground"><b className="font-semibold">{int(info.linea)}</b>{info.esperadoLinea != null ? ` de ${int(info.esperadoLinea)}` : ''} pz/min</dd>
          </>
        )}
      </dl>
      {info.parcial && <p className="mt-1 text-[12px] font-semibold" style={{ color: 'var(--v2-atento-texto)' }}>{info.parcial}</p>}
      {baaders.length > 0 && <ul className="mt-3 grid gap-1 text-[13px]">{baaders}</ul>}
      {p && (
        <div className="mt-3 rounded-[10px] px-3 py-2.5" style={{ background: 'rgb(142 142 147 / 0.08)' }}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate font-semibold text-foreground">{info.paradaQuienes}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{info.paradaTxt}</span>
          </div>
          <div className="mt-1.5">{duenoFila}</div>
        </div>
      )}
    </div>
  )
}

// ── El globo de una micro ────────────────────────────────────────────────────

/** Ancho del globo en PC (dos columnas) y aire mínimo a cada lado dentro del gráfico. Con menos de `GLOBO_PC_MIN_W` de gráfico va en una columna, bajo él. */
const GLOBO_PC_ANCHO = 640
const GLOBO_PC_AIRE = 8
const GLOBO_PC_MIN_W = 720

/** Trae un globo del celular a la vista, lo mínimo, sin dejarlo bajo el encabezado fijo de la página (`.v2-cabecera`, sticky z-20: `scroll-margin-top`). */
function traerALaVista(el: HTMLElement) {
  const bajoLaBarra = Math.max(0, ...Array.from(document.querySelectorAll('.v2-cabecera')).map((b) => b.getBoundingClientRect().bottom))
  el.style.scrollMarginTop = `${bajoLaBarra + GLOBO_PC_AIRE}px`
  const reducido = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  el.scrollIntoView?.({ block: 'nearest', behavior: reducido ? 'auto' : 'smooth' })
}

/** La marca ▼ de una micro (con `hueco`, ▽ sin relleno: «ya estaba parando») en el color de su causa. `data-glifo` es el carácter equivalente para quien exporte el texto. */
function MarcaMicro({ color, hueco, rotulo }: { color: string; hueco?: boolean; rotulo?: string }) {
  return (
    <svg className="tri" width={8} height={7} viewBox="0 0 8 7" role={rotulo ? 'img' : undefined} aria-label={rotulo} aria-hidden={rotulo ? undefined : true} data-glifo={hueco ? '▽' : '▼'}>
      {hueco
        ? <path d="M.9 .75h6.2L4 6.2z" fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" />
        : <path d="M0 0h8L4 7z" fill={color} />}
    </svg>
  )
}

/** ✕ regla que se evaluó y no se cumplió. */
function MarcaRegla() {
  return <span className="xc" role="img" aria-label="No se cumplió" data-glifo="✕"><X className="ico" aria-hidden /></span>
}

/**
 * Qué pasó alrededor de una micro y qué causa POSIBLE tiene (`microCausa.ts`). Siempre «posible, no imputada»: son reglas de contexto, no un
 * diagnóstico. Por defecto se ven tres piezas: el encabezado en una línea, UNA línea de causa armada con los datos (con su ① si una celda de la tabla la
 * prueba) y la tabla por Baader (piezas por minuto de los minutos k−2 a k+1), donde ese mismo número aparece en la celda que lo prueba. «Ver detalle»
 * parte cerrado y abre la forma con su duración, si la causa está en observación, la leyenda de ▽, las reglas que no aplicaron y el pie. Los textos
 * viven en `textosCausas.ts`. En PC flota (640 px, dos columnas) justo sobre las filas, al lado de la marca; en el celular (`compacto`) va en una columna
 * en el flujo de la tarjeta, justo bajo el gráfico (empuja lo de abajo en vez de taparlo; no arriba de la tarjeta: con el dedo en las marcas, ese borde
 * queda fuera de pantalla), con un ✕ de 44 px.
 * `fijo` (PC): el globo recibe el mouse (un clic en la marca lo deja así) para poder abrir «Ver detalle»; si no, flota sin frenar el puntero.
 * Toda cifra sale de `q`: aquí solo se ubica y se dibuja. Lo que es inferencia (la detención pudo empezar antes) se dice «pudo».
 */
export function GloboMicro({ q, style, compacto, onCerrar, refGlobo, cal, fijo, alCambiarAlto, onSalir }: { q: MicroClasificada; style?: CSSProperties; compacto?: boolean; onCerrar?: () => void; refGlobo?: Ref<HTMLDivElement>; cal?: (CalibracionPlanta & { nombre: string }) | null; fijo?: boolean; alCambiarAlto?: () => void; onSalir?: (ev: ReactPointerEvent<HTMLDivElement>) => void }) {
  const nom = etiquetaMaquina(q.nombre)
  const numeros = numerosPorCelda(q)
  const { tabla } = q
  const [abierto, setAbierto] = useState(false)
  const idDetalle = useId()
  /* Al abrir o cerrar «Ver detalle» el globo cambia de alto: el de PC se vuelve a ubicar. */
  useLayoutEffect(() => { alCambiarAlto?.() }, [abierto, alCambiarAlto])
  const t = tituloGlobo(nom, q.duracionS, horaConSegundos(q.inicioMs))
  const linea = lineaCausa(q.evidencia)
  const enObservacion = estadoDeForma(cal ?? null, q.forma) === 'en observación'
  const forma = detalleForma(q.evidencia, { fila: q.fila, nombre: nom, durS: q.duracionS })
  const encabezado = (
    <header className="gm-cab">
      <div className="gm-tit tabular-nums">{t.principal} <span className="mu">{t.sinAnotar}</span> · {t.hora}</div>
    </header>
  )
  const causa = (
    <p className="gm-causa4" aria-label="Causa posible">
      <i className="sw" style={{ background: COLOR_CAUSA[q.causa] }} aria-hidden />
      <span>
        {linea.prefijo && <span className="mu">{linea.prefijo} </span>}
        <b>{linea.nombre}</b> · {linea.detalle}
        {q.celdas.length > 0 && <> <b className="ref" role="img" aria-label="razón 1">1</b></>}
        {enObservacion && <> <span className="pill">{TXT_RESUMEN.enObservacion}</span></>}
      </span>
    </p>
  )
  const datos = (
    <div className="gm-datos">
      <table className="gm-tabla">
        <thead>
          <tr>
            <th scope="col" className="c0">pz/min</th>
            {tabla.horas.map((h, i) => <th key={h} scope="col" className={i === 2 ? 'cm' : undefined}>{h}</th>)}
            <th scope="col" className="esp">Esperado</th>
          </tr>
        </thead>
        <tbody>
          {tabla.filas.map((f, j) => (
            <tr key={f.id} className={f.ella ? 'ella' : undefined}>
              <th scope="row">{f.nombre}</th>
              {f.piezas.map((v, i) => {
                const refs = numeros.get(`${j}:${i - 2}`) ?? []
                return (
                  <td key={i} className={[i === 2 ? 'cm' : '', refs.length > 0 ? 'conref' : ''].filter(Boolean).join(' ') || undefined}>
                    <span className="cel">
                      {refs.map((n) => <b key={n} className="ref" role="img" aria-label={`razón ${n}`}>{n}</b>)}
                      {i === 2 && f.microEnK && <MarcaMicro color={COLOR_CAUSA[f.microEnK]} rotulo="micro" />}
                      {/* ▽: la detención pudo empezar en este minuto. Si la Baader no tiene una micro en k (la suya fue una detención), toma el color de la causa del globo. */}
                      {i === 1 && f.inicioPrevio && <MarcaMicro color={COLOR_CAUSA[f.microEnK ?? q.causa]} hueco rotulo={TXT_GLOBO.ariaInicio} />}
                      <span className="v">{v == null ? '—' : int(v)}</span>
                    </span>
                  </td>
                )
              })}
              <td className="esp">{f.esperado == null ? '—' : int(f.esperado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  /* «Ver detalle»: un botón nativo (clic, toque, Enter y espacio) con 44 px de toque; parte cerrado. */
  const detalle = (
    <div className="gm-det">
      <button type="button" className="gm-ver" aria-expanded={abierto} aria-controls={idDetalle} onClick={() => setAbierto((a) => !a)}>
        <span>{TXT_GLOBO.verDetalle}</span>
        <svg className="chev" width={9} height={9} viewBox="0 0 9 9" aria-hidden><path d="M1.5 3l3 3 3-3" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {abierto && (
        <div id={idDetalle} className="gm-dc">
          {forma && <p>{forma}</p>}
          {enObservacion && cal && <p>{textoObservacion(cal.nombre, cal.fecha)}</p>}
          {tabla.leyendaInicio && (
            <p className="gm-ley-tri"><MarcaMicro color={COLOR_CAUSA[q.causa]} hueco /><span>{tabla.leyendaInicio}</span></p>
          )}
          {q.descartadas.length > 0 && (
            <ul className="gm-desc" aria-label={TXT_GLOBO.ariaReglas}>
              {q.descartadas.map((d) => (
                <li key={d.regla}>
                  <MarcaRegla />
                  <span className="tabular-nums"><b>{d.titulo}</b> {d.texto}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="gm-pie">{q.causa === 'sin' ? TXT_GLOBO.pieSin : TXT_GLOBO.pieGeneral}</p>
        </div>
      )}
    </div>
  )
  if (compacto) {
    return (
      <div className="v2-tip gm movil" role="group" aria-label={ARIA_GLOBO}>
        <span className="absolute right-[8px] top-[8px]">
          <button type="button" onClick={onCerrar} aria-label={TXT_GLOBO.cerrar} className="tap-44 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: 'var(--v2-bien)' }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
        {encabezado}
        {causa}
        {datos}
        {detalle}
      </div>
    )
  }
  return (
    <div ref={refGlobo} className={`v2-tip gm pc2 absolute z-10 ${fijo ? '' : 'pointer-events-none'}`} data-globo-minuto={fijo ? '' : undefined} onPointerLeave={fijo ? onSalir : undefined} style={style} role={fijo ? 'group' : 'tooltip'} aria-label={ARIA_GLOBO}>
      {encabezado}
      <div className="gm-cols">
        {causa}
        {datos}
      </div>
      {detalle}
    </div>
  )
}

/**
 * El globo de PC ubicado sobre la primera fila Ev (`ubicarGloboPc`): lo mide ya dibujado y, si arriba no cabe sin quedar bajo el encabezado
 * fijo de la página, lo baja lo justo (y, si así pasa sobre la primera fila Ev, lo corre a un lado de la marca para no taparla). Antes de medir
 * (y en el primer cuadro) va anclado por abajo y centrado, como siempre; la medida se hace antes de pintar, así que no se ve el salto. Se vuelve
 * a medir al cambiar de micro, al hacer scroll y al cambiar el tamaño de la ventana.
 */
function GloboMicroPc({ q, marcaX, anchoGrafico, filaTop, alto, lienzo, cal, fijo, onSalir }: { q: MicroClasificada; marcaX: number; anchoGrafico: number; filaTop: number; alto: number; lienzo: RefObject<HTMLDivElement | null>; cal: (CalibracionPlanta & { nombre: string }) | null; fijo: boolean; onSalir: (ev: ReactPointerEvent<HTMLDivElement>) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [sitio, setSitio] = useState<{ top: number; left: number } | null>(null)
  /* Centrado sobre la marca y acotado al gráfico: left = clamp(x − 320, 8, ancho − 648). Es la posición de siempre y la de antes de medir. */
  const izqMin = GLOBO_PC_AIRE
  const derMax = anchoGrafico - GLOBO_PC_AIRE
  const centrado = acota(marcaX - GLOBO_PC_ANCHO / 2, izqMin, derMax - GLOBO_PC_ANCHO)
  const ubicar = useCallback(() => {
    const globo = ref.current
    const base = lienzo.current
    if (!globo || !base) return
    /* La barra fija de PC (`.v2-barra-pc`, sticky z-20) queda encima de las tarjetas: el globo arranca debajo de ella. */
    const barra = document.querySelector('.v2-barra-pc')?.getBoundingClientRect()
    const u = ubicarGloboPc({
      lienzoTop: base.getBoundingClientRect().top,
      filaTop,
      alto: globo.offsetHeight,
      minTop: (barra && barra.height > 0 ? barra.bottom : 0) + GLOBO_PC_AIRE,
      marcaX,
      ancho: GLOBO_PC_ANCHO,
      izqMin,
      derMax,
    })
    setSitio((a) => (a && a.top === u.top && a.left === u.left ? a : { top: u.top, left: u.left }))
  }, [filaTop, lienzo, marcaX, izqMin, derMax])
  useLayoutEffect(() => { ubicar() }, [ubicar, q.id])
  useEffect(() => {
    window.addEventListener('scroll', ubicar, true)
    window.addEventListener('resize', ubicar)
    return () => { window.removeEventListener('scroll', ubicar, true); window.removeEventListener('resize', ubicar) }
  }, [ubicar])
  return <GloboMicro q={q} refGlobo={ref} cal={cal} fijo={fijo} onSalir={onSalir} alCambiarAlto={ubicar} style={sitio == null ? { left: centrado, bottom: alto - filaTop + GLOBO_SOBRE_FILA } : { left: sitio.left, top: sitio.top }} />
}

/**
 * El globo del minuto por dentro en PC: flota sobre las filas (el borde de abajo 8 px sobre la primera fila Ev, como `GloboMicro`) y, si no cabe
 * (1366 × 768: hay 226 px de aire y el globo mide más), arranca arriba del gráfico. Va a la izquierda del minuto si hay lugar y a la derecha si no.
 * No frena el mouse (sigue al minuto bajo el puntero y se corre al acercarse): para llegar a sus filas de micro, un clic en el gráfico lo deja
 * FIJO (`fijo`) y entonces recibe el mouse. Siempre cabe en la pantalla: si su borde de abajo pasa de la ventana, sube lo que falte.
 */
function GloboMinutoPc({ m, lectura, xv0, px, resumen, parcial, microAbierta, fijo, onMicroHover, onMicroClick, onSalir }: {
  m: Modelo
  lectura: ReturnType<typeof lecturaDelMinuto>
  xv0: number
  px: number
  resumen: { acum: number | null; futuro: boolean; tocaban: number | null; ahora: boolean; dif: number | null } | null
  parcial: string | null
  microAbierta: string | null
  fijo: boolean
  onMicroHover: (id: string | null) => void
  onMicroClick: (id: string) => void
  /** Fijo y el mouse salió del globo hacia fuera del gráfico: se cierra. */
  onSalir: (ev: ReactPointerEvent<HTMLDivElement>) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [sitio, setSitio] = useState<{ top: number; left: number } | null>(null)
  /* Se mide en cada minuto nuevo (el globo cambia de alto con lo que dice: `lectura` es nueva en cada dibujo) y solo se actualiza si el sitio cambió. */
  const { d } = m
  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    const gw = g.offsetWidth
    const gh = g.offsetHeight
    let top = Math.max(d.pt + 2, (d.carriles[0]?.y0 ?? d.paradas.y0) - 8 - gh)
    /* Que el globo quepa en la PANTALLA, no solo en el gráfico: en 1366 × 768 el de abajo se salía 34 px y se perdía el párrafo del tiempo oculto de la micro.
       Si su borde de abajo pasa de la ventana, sube lo que falte; sin pasar bajo el encabezado fijo de la página ni sobre el borde de arriba de la ventana. */
    const lienzo = g.offsetParent?.getBoundingClientRect()
    if (gh > 0 && lienzo && typeof window !== 'undefined' && window.innerHeight > 0) {
      const bajoLaBarra = Math.max(0, ...Array.from(document.querySelectorAll('.v2-cabecera')).map((b) => b.getBoundingClientRect().bottom))
      const tope = bajoLaBarra + GLOBO_PC_AIRE - lienzo.top
      const maxTop = window.innerHeight - GLOBO_PC_AIRE - lienzo.top - gh
      top = Math.max(Math.min(top, maxTop), tope)
    }
    const izq = xv0 - gw - 16
    const left = d.pl + (izq >= 0 ? izq : Math.max(0, Math.min(d.plotW - gw, xv0 + px + 16)))
    setSitio((a) => (a && a.top === top && a.left === left ? a : { top, left }))
  }, [d, lectura, xv0, px])
  return (
    <GloboMinuto
      refGlobo={ref} lectura={lectura} tam={m.d.tam} resumen={resumen} parcial={parcial} microAbierta={microAbierta} fijo={fijo} onMicroHover={onMicroHover} onMicroClick={onMicroClick} onPointerLeave={onSalir}
      style={sitio ? { left: sitio.left, top: sitio.top } : { left: 0, top: 0, visibility: 'hidden' }}
    />
  )
}

/** La micro elegida: su raya (a lo alto de las filas y los carriles) y un aro en cada una de sus marcas. */
function MarcaMicroSvg({ m, W, q }: { m: Modelo; W: number; q: MicroClasificada }) {
  const { d } = m
  const mx = ((q.inicioMs - m.iniMs) / 60_000) * pxPorMinuto(W, m.totalMin)
  const c = d.carriles[q.fila]
  const th = d.tam === 'grande' ? 8 : 7
  const fondo = fondoLienzo(d)
  return (
    <svg width={W} height={d.alto} viewBox={`0 0 ${W} ${d.alto}`} className="pointer-events-none absolute left-0 top-0 block" aria-hidden>
      <line x1={r1(mx)} x2={r1(mx)} y1={d.carriles[0]?.y0 ?? d.paradas.y0} y2={fondo} stroke="rgb(var(--foreground))" strokeWidth={1.5} />
      {c && <circle cx={r1(mx)} cy={r1(c.y0 + th / 2)} r={8} fill="none" stroke="rgb(var(--foreground))" strokeWidth={1.5} />}
      {d.micro && <rect x={r1(mx - 5)} y={d.micro.y0} width={10} height={d.micro.h} rx={3} fill="none" stroke="rgb(var(--foreground))" strokeWidth={1.5} />}
    </svg>
  )
}

// ── Leyenda de 4 y su globo ⓘ ────────────────────────────────────────────────

/** La muestra de cada trazo: IGUAL al que se dibuja (grosor, trazo y opacidad), para que la leyenda no mienta. */
function Muestra({ trazo, color, opacidad, rotulo }: { trazo: 'hoy' | 'meta' | 'proy' | 'previo' | 'curva'; color: string; opacidad?: number; rotulo: ReactNode }) {
  const d = { hoy: { w: 2.5, da: undefined, cap: 'round' }, meta: { w: 1.5, da: '5 4', cap: 'butt' }, proy: { w: 2, da: '1.5 3', cap: 'round' }, previo: { w: 1.5, da: undefined, cap: 'butt' }, curva: { w: 1.4, da: undefined, cap: 'round' } }[trazo]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width={18} height={8} aria-hidden><path d="M1 4H17" fill="none" stroke={color} strokeWidth={d.w} strokeDasharray={d.da} strokeLinecap={d.cap as 'round' | 'butt'} opacity={opacidad} /></svg>
      {rotulo}
    </span>
  )
}

/**
 * Los estados de color y los dueños de las detenciones, más «Cómo usarlo» (se abre con un toque o Enter; la ayuda de las causas de las micro es otro ⓘ,
 * el del resumen bajo el carril «Micro»). El globo no se sale de
 * la pantalla: a 16 px de los bordes y de ancho min(270 px, ancho − 32 px). Tocar fuera y Escape lo cierran.
 */
function InfoLeyenda({ ayuda }: { ayuda: string }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState({ izq: 0, ancho: 270 })
  const id = useId()
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!abierto) return
    const fuera = (ev: PointerEvent) => { if (!ref.current?.contains(ev.target as Node)) setAbierto(false) }
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])
  /* Al abrir se mide el botón y se corre el globo hacia adentro (antes de pintar): sin esto, a 375 se salía y la página ganaba scroll horizontal. */
  useLayoutEffect(() => {
    if (!abierto) return
    const b = ref.current?.getBoundingClientRect()
    if (!b) return
    const vw = document.documentElement.clientWidth || window.innerWidth
    const ancho = Math.max(0, Math.min(270, vw - 32))
    let izq = 0
    if (b.left + ancho > vw - 16) izq = vw - 16 - ancho - b.left
    if (b.left + izq < 16) izq = 16 - b.left
    setPos((a) => (a.izq === izq && a.ancho === ancho ? a : { izq, ancho }))
  }, [abierto])
  const cuadro = (fondo: string, borde?: boolean) => <i className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={borde ? { border: '1px dashed var(--v2-gris)' } : { background: fondo }} aria-hidden />
  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        aria-controls={abierto ? id : undefined}
        aria-label="Qué significan los colores"
        className="tap-44 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--v2-bien)' }}
      >
        <Info className="h-4 w-4" aria-hidden />
      </button>
      {abierto && (
        <div id={id} role="tooltip" className="v2-tip absolute top-full z-20 mt-2 box-border rounded-[22px] px-4 py-3.5 text-[13px] leading-snug text-foreground" style={{ left: pos.izq, width: pos.ancho }}>
          <div className="font-semibold">Barras y filas Ev</div>
          <ul className="mt-1.5 grid gap-1 text-muted-foreground">
            <li className="flex items-center gap-2">{cuadro('var(--v2-bien)')}75 % o más del esperado</li>
            <li className="flex items-center gap-2">{cuadro('var(--v2-atento)')}entre 50 y 75 %</li>
            <li className="flex items-center gap-2">{cuadro('var(--rv-mal)')}menos de 50 %</li>
          </ul>
          <div className="mt-3 font-semibold">Detenciones, por dueño</div>
          <ul className="mt-1.5 grid gap-1 text-muted-foreground">
            <li className="flex items-center gap-2">{cuadro(TRAMA_MANT)}Mantención</li>
            <li className="flex items-center gap-2">{cuadro('var(--v2-ext)')}Externo</li>
            <li className="flex items-center gap-2">{cuadro('var(--v2-gris)')}Sin imputar</li>
            <li className="flex items-center gap-2">{cuadro('', true)}Programada</li>
          </ul>
          <div className="mt-3 font-semibold">Cómo usarlo</div>
          <p className="mt-1.5 text-muted-foreground">{ayuda}</p>
        </div>
      )}
    </span>
  )
}

// ── El gráfico ───────────────────────────────────────────────────────────────

const SEGMENTOS: Array<[Zoom, string]> = [['turno', 'Turno'], ['1h', '1 h'], ['15m', '15 min']]

/** Cuánto dura la pista de la rueda sin Ctrl. */
export const PISTA_RUEDA_MS = 1600

const AYUDA_PC = 'Pasa el cursor sobre un minuto para verlo, o sobre una marca ▼ para ver la causa posible de esa micro. Ctrl + rueda o pellizco para acercar, arrastra para recorrer. Doble clic vuelve al turno.'
const AYUDA_TACTIL = 'Toca un minuto o una marca ▼ · pellizca para acercar · arrastra para recorrer'

/** Puntero táctil (`pointer: coarse`): ahí la ayuda es «Toca un minuto…»; en PC vive en el ⓘ como «Cómo usarlo». */
function useTactil(): boolean {
  const consulta = () => (typeof window !== 'undefined' ? window.matchMedia?.('(pointer: coarse)') : undefined)
  const [tactil, setTactil] = useState(() => !!consulta()?.matches)
  useEffect(() => {
    const mq = consulta()
    if (!mq) return
    const f = () => setTactil(mq.matches)
    mq.addEventListener?.('change', f)
    return () => mq.removeEventListener?.('change', f)
  }, [])
  return tactil
}

/**
 * El gráfico unido «Ritmo en vivo». Sin `ampliado` no hay botón «Ampliar». `abrirCon` abre el ampliado cuando CAMBIA
 * (el «ver ›» de una parada en Camino a la meta). Estado detenido: dos lecturas sin piezas o el estado que ya existe.
 */
export function GraficoRitmoVivo({ p, e, reloj, ampliado, abrirCon }: {
  p: MonitorV2Props
  e: EjeDatos
  /** El reloj de datos del monitor (el mismo de la cifra grande). */
  reloj: RelojDeDatos
  /** El detalle de «Ampliar» (`RitmoVivoAmpliado`). */
  ampliado?: ReactNode
  abrirCon?: string | null
}) {
  const detenida = !p.cerrado && (reloj.detenida || e.detenidaEstado)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const tarjetaRef = useRef<HTMLElement>(null)
  const [medidor, { w }] = useTamano()
  const [ampliada, setAmpliada] = useState(false)
  const tactil = useTactil()
  useAbrirPorClave(abrirCon, () => setAmpliada(true))
  /* «A esta hora»: una sola definición para toda la vista (franja, este rótulo, el globo y Camino a la meta). */
  const mostradas = piezasMostradas(p.repro, p.piezas)
  const aHora = p.cerrado ? null : aEstaHora(mostradas, p.cuota?.piezas, p.meta)
  /* PR B: la cuota en la hora de cada cuadro y las cifras del instante (globo del minuto en curso). */
  const cuotaEn = useContext(VistaVivaCtx)?.cuotaEn ?? null
  const vivas = useCifrasVivas()
  /* Turno cerrado: el fin REAL (el de la cabecera) y el eje hasta lo que alcance, sin encogerse (un corte anticipado no lo acorta). */
  const finReal = p.cerrado && e.finRealMs != null && Number.isFinite(e.finRealMs) ? e.finRealMs : null
  const ultimoDatoMs = useMemo(() => {
    if (!p.cerrado || !e.minuto) return null
    const n = minutosVisibles(e.minuto.maquinas, true)
    return n > 0 ? Date.parse(e.minuto.desde) + n * 60_000 : null
  }, [p.cerrado, e.minuto])
  const totalMin = (finDelEje({ finMs: e.finMs, cerrado: p.cerrado, finRealMs: finReal, ultimoDatoMs }) - e.iniMs) / 60_000

  /* La ventana de zoom vive ANTES del modelo: con zoom, la escala Y es la de lo que se ve. */
  const [ventana, setVentana] = useState<Ventana | null>(null)
  /** El atajo que sigue al presente mientras nadie recorra el gráfico a mano. */
  const [sigue, setSigue] = useState<Zoom>('turno')

  const modeloBase = useMemo<Modelo | null>(() => {
    if (w < 200 || !(totalMin > 0)) return null
    const cuadro = reloj.cuadro()
    /* Con la cola de reproducción, las barras llegan solo hasta el minuto que corre (el reloj único): los minutos que ya llegaron
       pero aún no se reproducen esperan en la cola. El que corre es la última barra y crece con las piezas del cuadro. */
    const nCola = e.minuto && cuadro.rep && !p.cerrado && cuadro.ultima?.atMs != null ? Math.round((cuadro.ultima.atMs - Date.parse(e.minuto.desde)) / 60_000) : 0
    const minuto = e.minuto && nCola >= 1
      ? { ...e.minuto, maquinas: e.minuto.maquinas.map((q) => (q.cycles.length > nCola ? { ...q, cycles: q.cycles.slice(0, nCola) } : q)) }
      : e.minuto
    const n = minuto ? minutosVisibles(minuto.maquinas, p.cerrado) : 0
    const conSerie = minuto != null && n > 0
    const offsetMin = minuto ? Math.round((Date.parse(minuto.desde) - e.iniMs) / 60_000) : 0
    const suma = conSerie ? sumaPorMinuto(minuto.maquinas, n) : []
    const ult = cuadro.ultima
    const min0 = finReal != null ? (finReal - e.iniMs) / 60_000 : ult?.atMs != null ? (ult.atMs - e.iniMs) / 60_000 : conSerie ? offsetMin + n : 0
    const ultima: Punto = { min: acota(min0, 0, totalMin), v: ult?.valor ?? p.piezas }
    const pr = cuadro.previa
    const previaMin = pr?.atMs != null ? acota((pr.atMs - e.iniMs) / 60_000, 0, totalMin) : null
    const previa: Punto | null = pr && previaMin != null && previaMin < ultima.min ? { min: previaMin, v: pr.valor } : null

    let acum: number[]
    if (conSerie) {
      acum = [...Array(Math.max(0, offsetMin)).fill(0) as number[], ...acumulado(suma)]
    } else if (p.curva) {
      const base = e.primeraPiezaMs != null ? (e.primeraPiezaMs - e.iniMs) / 60_000 : 0
      const hoy = [{ min: 0, v: 0 }, ...p.curva.hoy.map((q) => ({ min: q.minutes + base, v: q.pieces }))]
      acum = Array.from({ length: Math.ceil(ultima.min) + 1 }, (_, i) => valorEnCurva(hoy, i) ?? 0)
    } else {
      acum = [0]
    }
    const trazo = trazoHastaLectura(acum, previa, ultima)

    // El eje siempre es el turno completo: la proyección llega a «al cierre».
    const cierre = p.cerrado ? null : p.proyeccion
    const proy = p.cerrado ? null : proyeccion({ punta: ultima, finEje: totalMin, totalMin, cierre, detenida })

    // Ritmo de la meta y turno anterior: desde la primera pieza de hoy (el mismo desplazamiento para los dos).
    const base = e.primeraPiezaMs != null ? (e.primeraPiezaMs - e.iniMs) / 60_000 : 0
    const aPuntos = (c: Array<{ minutes: number; pieces: number }>): Punto[] => [{ min: 0, v: 0 }, ...c.map((q) => ({ min: q.minutes + base, v: q.pieces }))]
    const objetivo = p.curva?.objetivo && p.curva.objetivo.length > 0 ? recortarCurva(aPuntos(p.curva.objetivo), totalMin) : []
    const previoPts = p.curva?.previo && p.curva.previo.curve.length > 0 ? recortarCurva(aPuntos(p.curva.previo.curve), totalMin) : []
    /* UNA cifra del turno anterior, la misma de la hoja «Piezas del turno»: a esta hora (en vivo) o su total (cerrado). */
    const previoCifra = previoPts.length > 1 ? cifraTurnoAnterior({ curva: p.curva?.previo?.curve, cerrado: p.cerrado, ultimaMin: ultima.min, baseMin: base }) : null

    // Escala Y: lo mayor de lo que se dibuja (meta, proyección, hoy, ritmo de la meta, turno anterior hasta el fin del eje).
    const tope = Math.max(p.meta ?? 0, proy?.hasta.v ?? 0, ultima.v, maxV(objetivo), maxV(previoPts))
    const { max: yMax, rejilla } = escalaAcumulado(tope)

    const filas = conSerie ? filasBaader({ desde: minuto.desde, maquinas: minuto.maquinas }, n, e.paradasMaquina) : []
    const maquinas = conSerie
      ? minuto.maquinas.map((q) => {
        const celdas = filas.find((f) => f.id === q.id)?.celdas ?? []
        const llenados = filas.find((f) => f.id === q.id)?.llenados ?? []
        const anduvo = e.ritmoAnduvo?.find((r) => r.nombre.trim() === q.nombre.trim())?.cpm
        return { id: q.id, nombre: q.nombre, esperado: q.esperado, cycles: q.cycles, celdas, llenados, pct: pctAndando(celdas), ultimoLlenado: e.llenado?.find((l) => l.id === q.id)?.ultimo ?? null, anduvo: anduvo != null && Number.isFinite(anduvo) ? anduvo : null }
      })
      : []
    /* Micro con hora: solo si el doc dice de qué Baader fue cada parada. Las que ya pasaron (no las del minuto que aún no llega). */
    const pm = e.paradasMaquina
    const separaMicro = !!pm && (pm.stopMachines?.length ?? 0) > 0 && (pm.stopEvents ?? []).every((x) => x.m != null && pm.stopMachines?.[x.m] != null)
    const conMicro = conSerie && separaMicro
    const micros = conMicro && e.minuto
      ? clasificarMicros({ serie: e.minuto, stopEvents: pm?.stopEvents, stopReasons: pm?.stopReasons, stopMachines: pm?.stopMachines, inicioTurnoMs: e.iniMs, planta: e.planta })
        .filter((q) => { const mn = (q.inicioMs - e.iniMs) / 60_000; return mn >= 0 && mn < totalMin && mn <= ultima.min })
      : []
    const esperadoLinea = conSerie && minuto.maquinas.every((q) => q.esperado != null) ? minuto.maquinas.reduce((a, q) => a + (q.esperado ?? 0), 0) : null
    const d = disenar(w, tamanoGrafico(w), maquinas.length, conSerie, conMicro)
    const detalle = conMicro && minuto && pm ? detalleDeMinutos(maquinas, minuto.desde, n, pm) : null
    let enCurso: Modelo['enCurso'] = null
    if (conSerie && nCola >= 1 && cuadro.rep && cuadro.rep.animando) {
      const span = cuadro.rep.totalFinal - cuadro.rep.totalPiso
      enCurso = { f0: span > 0 ? Math.min(1, Math.max(0, (cuadro.rep.total - cuadro.rep.totalPiso) / span)) : 1 }
    }
    return {
      w, d, iniMs: e.iniMs, totalMin, yMin: 0, yMax, rejilla, vent: null, n, offsetMin, suma, completos: conSerie ? minutosCompletos(minuto.maquinas) : 0,
      esperadoMin: conSerie ? esperadoPorMinuto(minuto.maquinas, n) : [], esperadoLinea, topBarra: Math.ceil((Math.max(esperadoLinea ?? 0, ...suma, 10) * 1.15) / 10) * 10, maquinas, trazo, previa, ultima, proy, detenida,
      meta: p.meta, objetivo, previoPts, previoLabel: p.curva?.previo?.label ?? null, previoCifra, finReal: finReal != null, cuota: p.cuota ?? null, aHora, cuotaEn, paradas: e.paradas,
      enCurso, cerrado: p.cerrado, unidad: e.unidad, micros, conMicro, microTotal: e.microTotal ?? null, detalle,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se rehace con cada lectura (`reloj.version`) y con los datos del turno
  }, [w, e, totalMin, finReal, p.piezas, p.proyeccion, p.meta, p.cuota, p.curva, p.cerrado, detenida, aHora, cuotaEn, reloj.version])

  /* Con zoom, el dominio Y es el de los datos visibles en la ventana (hoy, ritmo de la meta, turno anterior, proyección);
     se recalcula cuando el hook publica la ventana (al frenar el paneo), no en cada píxel. En «Turno», igual que siempre. */
  const modelo = useMemo<Modelo | null>(() => {
    if (!modeloBase || !ventana) return modeloBase
    const vis = dominioVisible([modeloBase.trazo, modeloBase.objetivo, modeloBase.previoPts, modeloBase.proy ? [modeloBase.proy.desde, modeloBase.proy.hasta] : []], ventana.desdeMin, ventana.hastaMin)
    if (!vis) return { ...modeloBase, vent: ventana }
    const esc = escalaVentana(vis.min, vis.max)
    return { ...modeloBase, vent: ventana, yMin: esc.yMin, yMax: esc.yMax, rejilla: esc.rejilla }
  }, [modeloBase, ventana])

  // ── Zoom: atajos «Turno | 1 h | 15 min» y gestos, sobre la misma ventana ──
  /* El «ahora» de los atajos: con el turno cerrado, el último minuto con dato (no el fin previsto). */
  const ahoraMin = modeloBase ? (modeloBase.cerrado && modeloBase.n > 0 ? Math.min(modeloBase.ultima.min, modeloBase.offsetMin + modeloBase.n) : modeloBase.ultima.min) : 0
  const alVentana = (v: Ventana | null) => {
    setVentana(v)
    const z = zoomActivo(v)
    if (z == null || z === 'turno') { setSigue('turno'); return }
    const esperada = ventanaDe(z, ahoraMin, totalMin)
    setSigue(esperada && v && Math.abs(esperada.hastaMin - v.hastaMin) <= 2 ? z : 'turno')
  }
  /* La rueda SIN Ctrl no se secuestra: la página sigue su scroll y aquí solo sale la pista «Ctrl + rueda o pellizca para acercar» (1,6 s). */
  const [pistaRueda, setPistaRueda] = useState(false)
  const pistaTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mostrarPista = useCallback(() => {
    setPistaRueda(true)
    if (pistaTimer.current) clearTimeout(pistaTimer.current)
    pistaTimer.current = setTimeout(() => setPistaRueda(false), PISTA_RUEDA_MS)
  }, [])
  useEffect(() => () => { if (pistaTimer.current) clearTimeout(pistaTimer.current) }, [])
  const zg = useZoomGesto({ dominioMin: Math.max(1, totalMin), ventana, onVentana: alVentana, zoomMax: zoomMaxPara(totalMin), onRuedaSinModificador: mostrarPista })
  /* Con un atajo activo la ventana avanza con el presente (cada lectura nueva); recorrida a mano, se queda donde la dejaron. */
  useEffect(() => {
    if (sigue === 'turno' || !modeloBase) return
    setVentana(ventanaDe(sigue, ahoraMin, totalMin))
  }, [sigue, ahoraMin, totalMin, modeloBase])
  const elegir = (z: Zoom) => {
    if (z === 'turno') { zg.verTodo(); return }
    setSigue(z)
    setVentana(ventanaDe(z, ahoraMin, totalMin))
  }
  const activo = zoomActivo(ventana)

  // ── Globo: con el mouse al pasar, con el dedo al tocar o arrastrar (tocar fuera lo cierra) ──
  const [cursor, setCursor] = useState<{ min: number; xv: number } | null>(null)
  /** La micro elegida (con el cursor encima o con un toque) y dónde estaba el puntero en la ventana: el globo de la micro reemplaza al del minuto. */
  const [microSel, setMicroSel] = useState<{ id: string; xv: number } | null>(null)
  /** PC con el zoom del minuto por dentro: un clic deja el globo del minuto quieto y el mouse puede llegar a sus filas de micro (si no, el globo seguía al puntero y se corría al acercarse). */
  const [fijo, setFijo] = useState(false)
  /** PC: un clic con el mouse sobre la marca deja FIJO el globo de la micro y recibe el mouse (para abrir «Ver detalle»); otro clic en el gráfico lo suelta. */
  const [microFija, setMicroFija] = useState(false)
  const tipoRef = useRef('mouse')
  /* Tras un toque, WebKit inventa eventos de mouse: al desplazar la página para traer el globo a la vista, un `pointerleave` de tipo
     'mouse' lo cerraba a los ~0,3 s (medido el 02-11 en WebKit con toque, 375 px). Si lo último en el gráfico fue un dedo, el mouse no
     abre ni cierra globos; un clic con el mouse lo devuelve. */
  const esMouse = (ev: { pointerType: string }) => ev.pointerType === 'mouse' && tipoRef.current === 'mouse'
  /** Dedo: dónde empezó el gesto y si ya es un arrastre horizontal (recorrer minutos); tras uno, el «click» final no abre ni cierra nada. */
  const dedoRef = useRef<{ x: number; y: number; arrastra: boolean } | null>(null)
  const { ref: scrollRef, onPointerDown: zDown, onPointerMove: zMove, onPointerLeave: zLeave, ...zResto } = zg.props
  const W = modelo ? Math.round(modelo.d.plotW * zg.zoom) : 0
  const minDe = (ev: { clientX: number }) => {
    const el = scrollRef.current
    if (!el || !modelo || W <= 0) return null
    const r = el.getBoundingClientRect()
    const xv = ev.clientX - r.left
    const min = (xv + el.scrollLeft) / pxPorMinuto(W, modelo.totalMin)
    return min >= 0 && min <= modelo.totalMin ? { min, xv } : null
  }
  /** La micro cuya marca está bajo el puntero (`microBajoPuntero`: 44 × 44 px con el dedo), con la x del puntero en la ventana. */
  const microEn = (ev: { clientX: number; clientY: number }, toque: boolean) => {
    const el = scrollRef.current
    if (!el || !modelo || W <= 0 || modelo.micros.length === 0) return null
    const r = el.getBoundingClientRect()
    const xv = ev.clientX - r.left
    const id = microBajoPuntero({ micros: modelo.micros, d: modelo.d, iniMs: modelo.iniMs, pxMin: pxPorMinuto(W, modelo.totalMin), x: xv + el.scrollLeft, y: ev.clientY - r.top, toque })
    return id ? { id, xv } : null
  }
  const mismoMinuto = (a: { min: number } | null, b: { min: number } | null) => !!a && !!b && Math.floor(a.min) === Math.floor(b.min)
  const mover = (ev: ReactPointerEvent<HTMLDivElement>) => {
    zMove(ev)
    if (ev.pointerType === 'touch') {
      /* Sin zoom, arrastrar el dedo en horizontal recorre los minutos (el globo sigue al dedo); en vertical manda la página. */
      const d0 = dedoRef.current
      if (zg.acercado || !d0 || ev.buttons === 0) return
      if (!d0.arrastra) {
        const dx = Math.abs(ev.clientX - d0.x), dy = Math.abs(ev.clientY - d0.y)
        if (dx < 8 || dx <= dy) return
        d0.arrastra = true
        setMicroSel(null)
      }
      const nuevo = minDe(ev)
      if (nuevo) setCursor((a) => (mismoMinuto(a, nuevo) ? a : nuevo))
      return
    }
    if (!esMouse(ev)) return
    /* Con el globo fijo el puntero puede recorrer el gráfico sin mover ni cerrar nada. */
    if (fijo || microFija) return
    /* Sobre una marca de micro sale su globo; en el resto de la fila, el del minuto. */
    const sobre = ev.buttons === 0 ? microEn(ev, false) : null
    setMicroSel((a) => (a?.id === sobre?.id ? a : sobre))
    const nuevo = ev.buttons === 0 && !sobre ? minDe(ev) : null
    setCursor((a) => (mismoMinuto(a, nuevo) ? a : nuevo))
  }
  const tocar = (ev: { clientX: number; clientY: number }) => {
    if (tipoRef.current === 'mouse') {
      /* Un clic con el mouse deja fijo el globo del minuto (y otro lo suelta). Solo con el zoom donde el globo trae las filas de micro. */
      if (microSel) { setMicroFija((a) => !a); return }
      if (cursor && modelo?.detalle && pxPorMinuto(W, modelo.totalMin) >= EXACTO_PX_MIN) setFijo((a) => !a)
      return
    }
    if (dedoRef.current?.arrastra) { dedoRef.current = null; return }
    /* Un toque sobre una marca abre (o cierra) el globo de esa micro; en cualquier otra parte, el del minuto. */
    const sobre = microEn(ev, true)
    if (sobre) {
      setMicroSel((a) => (a?.id === sobre.id ? null : sobre))
      setCursor(null)
      return
    }
    setMicroSel(null)
    const nuevo = minDe(ev)
    setCursor((a) => (nuevo && mismoMinuto(a, nuevo) ? null : nuevo))
  }
  /* Los toques en el gráfico no llegan a la página: su deslizar de 60 px cambia de turno y este es el gesto de recorrer minutos. */
  const frenaToque = (ev: ReactTouchEvent) => ev.stopPropagation()
  const hayGlobo = cursor !== null || microSel !== null
  useEffect(() => {
    if (!hayGlobo) { setFijo(false); return }
    const fuera = (ev: PointerEvent) => {
      const t = ev.target as Element | null
      if (!medidor.current?.contains(t as Node) && !t?.closest?.('[data-globo-minuto]')) { setCursor(null); setMicroSel(null); setFijo(false) }
    }
    /* Escape lo cierra, como cualquier globo (con el teclado no hay otra forma de quitarlo). */
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setCursor(null); setMicroSel(null); setFijo(false) } }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [hayGlobo, medidor])

  /* Sin micro elegida no hay globo que dejar fijo. */
  useEffect(() => { if (microSel == null) setMicroFija(false) }, [microSel])
  const cal = useMemo(() => calibracionDe(e.planta), [e.planta])
  const info = modelo && cursor ? leer(modelo, cursor.min, vivas) : null
  const globoIzq = modelo && cursor ? modelo.d.pl + cursor.xv + 14 : 0
  const globoX = modelo ? (globoIzq + 280 > modelo.w ? Math.max(0, globoIzq - 28 - 280) : globoIzq) : 0
  /* El minuto por dentro: con el zoom que deja ver cada parada al segundo (`EXACTO_PX_MIN`) el globo del minuto es otro (`GloboMinuto`): el minuto en 60 s,
     Baader por Baader. Solo en un minuto que la serie tiene y que ya pasó; en el resto (y con menos zoom) sigue el globo de siempre. */
  const pxMinAct = modelo ? pxPorMinuto(W, modelo.totalMin) : 0
  const kMinuto = modelo && info ? Math.floor(cursor!.min) - modelo.offsetMin : -1
  const lectura = modelo?.detalle && info && !info.futuro && pxMinAct >= EXACTO_PX_MIN && kMinuto >= 0 && kMinuto < modelo.n ? lecturaDeMinuto(modelo, kMinuto) : null
  const resumenMinuto = info ? { acum: info.acum, futuro: info.futuro, tocaban: info.tocaban, ahora: info.ahora, dif: info.dif } : null
  /* El mouse encima de una fila de micro del globo abre su globo (como sobre la marca); al salir, se cierra. Un toque o un clic en la fila lo abre y lo cierra. */
  const abrirMicroDeGlobo = (id: string | null) => {
    if (id == null) { setMicroSel(null); return }
    const q = modelo?.micros.find((x) => x.id === id)
    if (!q || !modelo) return
    const xv = ((q.inicioMs - modelo.iniMs) / 60_000) * pxMinAct - (scrollRef.current?.scrollLeft ?? 0)
    setMicroSel((a) => (a?.id === id ? a : { id, xv }))
  }
  const alternarMicroDeGlobo = (id: string) => {
    const q = modelo?.micros.find((x) => x.id === id)
    if (!q || !modelo) return
    const xv = ((q.inicioMs - modelo.iniMs) / 60_000) * pxMinAct - (scrollRef.current?.scrollLeft ?? 0)
    setMicroSel((a) => (a?.id === id ? null : { id, xv }))
  }
  /* Fijo, el mouse puede ir del globo al gráfico y volver; si sale hacia cualquier otra parte (o hacia el globo de la micro), todo se cierra como siempre. */
  const salirDelGlobo = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!fijo || ev.pointerType !== 'mouse') return
    const a = ev.relatedTarget as Element | null
    if (a && (scrollRef.current?.contains(a) || a.closest?.('[data-globo-minuto]'))) return
    setCursor(null); setMicroSel(null); setFijo(false)
  }
  /* El globo de la micro, fijo: si el mouse sale hacia cualquier otra parte (que no sea el gráfico ni otro globo), todo se cierra como siempre. */
  const salirDelGloboMicro = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!microFija || ev.pointerType !== 'mouse') return
    const a = ev.relatedTarget as Element | null
    if (a && (scrollRef.current?.contains(a) || a.closest?.('[data-globo-minuto]'))) return
    setCursor(null); setMicroSel(null); setFijo(false)
  }
  const microInfo = modelo && microSel ? modelo.micros.find((q) => q.id === microSel.id) ?? null : null

  // ── Lo que se ve alrededor ──
  const tam = modelo ? modelo.d.tam : tamanoGrafico(w)
  const chico = tam === 'chico'
  /* Con menos de 720 px de gráfico el globo de dos columnas no cabe: va como en el celular, bajo el gráfico. */
  const globoCompacto = chico || (modelo != null && modelo.w < GLOBO_PC_MIN_W)
  /* El globo de una columna se abre bajo el gráfico, que en el celular puede quedar bajo el pliegue de la pantalla: al abrirlo se trae a la vista (lo mínimo). */
  const globoMovilRef = useRef<HTMLDivElement>(null)
  const idMicro = microSel?.id ?? null
  useEffect(() => {
    const el = globoMovilRef.current
    if (idMicro == null || !globoCompacto || !el) return
    traerALaVista(el)
  }, [idMicro, globoCompacto])
  /* El globo del minuto del celular se ancla arriba de la tarjeta, y quien mira el gráfico tiene ese borde fuera de la pantalla o bajo el
     encabezado fijo. Medido el 02-11 a 375 px: con el gráfico a 20 px del encabezado el globo quedaba entero fuera, y a 120 px se le perdían
     la hora y el ✕ (ya pasaba en main con el globo de siempre). Al abrir cada minuto se trae a la vista, lo mínimo, como el de la micro. */
  const globoMinutoMovilRef = useRef<HTMLDivElement>(null)
  const minutoMovil = chico && cursor ? Math.floor(cursor.min) : null
  useEffect(() => {
    const el = globoMinutoMovilRef.current?.firstElementChild
    if (minutoMovil == null || !(el instanceof HTMLElement)) return
    traerALaVista(el)
  }, [minutoMovil])
  const sub = p.cerrado && finReal != null
    ? `${relojDe(e.iniMs)} → ${relojDe(finReal)} · terminado`
    : `${relojDe(e.iniMs)} → ${relojDe(e.finMs)}`
  const resumen = `Hechas del turno: ${int(mostradas)}${p.meta ? ` de ${int(p.meta)}` : ''}${p.proyeccion != null && !p.cerrado ? `, al cierre ${int(p.proyeccion)}` : ''}. Debajo, el ritmo por minuto, cada Baader y las detenciones en las mismas horas.${modelo && modelo.micros.length > 0 ? resumenAccesibleMicro(modelo.micros.length) : ''}`
  const hayProy = modelo?.proy != null
  const titulo = (
    <div className="min-w-0">
      <h3 className="text-[17px] font-semibold leading-[22px] text-foreground">Ritmo en vivo</h3>
      <p className="text-[13px] leading-[18px] text-muted-foreground">{sub}</p>
    </div>
  )
  /* El minuto por dentro: con ese zoom la leyenda dice las formas nuevas (micro, detención, programada) y, con detalle, el escalón en vez de la curva. */
  const exactoUI = modelo?.detalle != null && pxMinAct >= EXACTO_PX_MIN
  const conEscalon = exactoUI && pxMinAct >= DETALLE_PX_MIN
  const pc = modelo?.previoCifra
  /* «Hoy N atrás» sale de las MISMAS hechas de la cifra grande (cuadro vivo o, sin él, las mostradas), no de la serie al minuto:
     8.812 − 7.891 son 921, no 887. */
  const hechasHoy = vivas?.hechas ?? mostradas
  const difHoy = pc && modelo ? hechasHoy - pc.piezas : null
  /* Fuera del celular la leyenda ocupa el espacio entre el título y los botones y se parte en DOS líneas ahí mismo. Con
     `ml-auto` pedía su propia fila y empujaba los botones a una tercera: medido el 02-11 en 1366 × 768, la cabecera pasaba
     de 40 a 107 px. */
  const leyenda = (
    <div className={`flex flex-wrap items-center gap-x-[14px] gap-y-1.5 text-[12px] leading-4 text-muted-foreground ${chico ? '' : 'min-w-0 flex-1 justify-end'}`}>
      <Muestra trazo="hoy" color="var(--v2-acento)" rotulo={p.cerrado ? 'este turno' : 'hoy'} />
      {modelo && modelo.objetivo.length > 1 && <Muestra trazo="meta" color="rgb(var(--muted-foreground))" opacidad={0.8} rotulo="ritmo de la meta" />}
      {hayProy && <Muestra trazo="proy" color="var(--v2-acento)" rotulo="proyección" />}
      {modelo && pc && modelo.previoLabel && (
        <Muestra
          trazo="previo" color="rgb(var(--muted-foreground))" opacidad={0.65}
          rotulo={(
            <>
              {`${modelo.previoLabel} · ${int(pc.piezas)}${chico ? '' : pc.modo === 'al-cierre' ? ' al cierre' : ' hechas a esta hora'}`}
              {difHoy != null && <span className="font-semibold" style={{ color: difHoy < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))' }}>{` · ${p.cerrado ? 'este turno' : 'hoy'} ${adelanteAtras(difHoy)}`}</span>}
            </>
          )}
        />
      )}
      {modelo && modelo.maquinas.some((q) => q.esperado != null) && (conEscalon
        ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><svg width={18} height={10} aria-hidden><path d="M0 7H8V2H18" fill="none" stroke="var(--rv-escalon)" strokeWidth={1.6} /></svg>ritmo andando de cada Baader (calculado: piezas del minuto ÷ segundos andando)</span>
        : <Muestra trazo="curva" color="rgb(var(--foreground))" opacidad={0.85} rotulo="piezas por minuto de cada Baader" />)}
      {exactoUI && (
        <>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><svg width={14} height={9} aria-hidden><rect width={14} height={5} fill="var(--rv-micro)" /><rect y={5} width={14} height={4} fill="rgb(142 142 147 / 0.12)" /></svg>micro</span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><svg width={14} height={9} aria-hidden><rect width={14} height={9} fill="var(--rv-detenida)" /></svg>detención</span>
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap"><svg width={14} height={10} aria-hidden><rect x={0.5} y={0.5} width={13} height={9} rx={2} fill="none" stroke="var(--v2-gris)" strokeDasharray="3 3" /></svg>programada</span>
        </>
      )}
      {modelo && modelo.micros.length > 0 && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <svg width={10} height={8} aria-hidden><path d="M0 0h10l-5 8z" fill="rgb(var(--muted-foreground))" /></svg>
          {TXT_RESUMEN.marcaEnBaader}
        </span>
      )}
      {modelo && modelo.micros.some((q) => q.modo === 'a_la_vez') && (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <svg width={4} height={12} aria-hidden><path d="M2 0V12" stroke="rgb(var(--foreground))" strokeOpacity={0.6} strokeWidth={1.2} strokeDasharray="3 3" fill="none" /></svg>
          {TXT_RESUMEN.marcaALaVez}
        </span>
      )}
      <InfoLeyenda ayuda={tactil ? AYUDA_TACTIL : AYUDA_PC} />
    </div>
  )
  /* Bajo el gráfico: el resumen de las causas de las micro (cifra, barra, leyenda y chips). Las de 0 s no llegan con hora: solo se sabe cuántas son. */
  const resumenMicro = modelo && modelo.conMicro ? (
    <div className="rv-mc" data-tam={tam}>
      {chico && modelo.maquinas.some((q) => q.anduvo != null) && (
        <p className="rv-mc-anduvo tabular-nums">
          Anduvo a{' '}
          {modelo.maquinas.filter((q) => q.anduvo != null).map((q, i) => (
            <span key={q.id}>{i > 0 && ' · '}{etiquetaMaquina(q.nombre)} <b>{dec(q.anduvo!)}</b>{q.esperado != null ? ` de ${int(q.esperado)}` : ''}</span>
          ))}
          {' '}pz/min
        </p>
      )}
      {modelo.micros.length > 0 && <ResumenCausasMicro micros={modelo.micros} planta={e.planta} cal={cal} microTotal={modelo.microTotal} nBaader={modelo.maquinas.length} />}
    </div>
  ) : null
  /* Segmentado de 32 px fijos en todos los anchos (botones de 26 + p-[3px]); `tap-44` conserva el área táctil de 44. */
  const segmentado = (
    <div className="inline-flex shrink-0 rounded-full p-[3px]" style={{ background: 'var(--v2-relleno)' }} role="group" aria-label="Cuánto del turno se ve">
      {SEGMENTOS.map(([z, rotulo]) => {
        const on = activo === z
        return (
          <button
            key={z}
            type="button"
            onClick={() => elegir(z)}
            aria-pressed={on}
            className={`tap-44 h-[26px] min-w-[44px] rounded-full px-[12px] text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 ${on ? 'font-semibold' : 'text-foreground'}`}
            style={{ outlineColor: 'var(--v2-bien)', ...(on ? { background: 'rgb(var(--foreground))', color: 'rgb(var(--background))' } : null) }}
          >
            {rotulo}
          </button>
        )
      })}
    </div>
  )
  const botonAmpliar = ampliado != null && (
    <button type="button" onClick={() => setAmpliada((a) => !a)} aria-expanded={ampliada} aria-haspopup="dialog" aria-label="Ampliar Ritmo en vivo" className="v2-amp tap-44 v2-amp-compacta">
      <Maximize2 className="h-3.5 w-3.5" aria-hidden />
      <span>Ampliar</span>
    </button>
  )

  return (
    <section
      ref={tarjetaRef}
      className="v2-tarjeta rv-grafico relative min-w-0 rounded-card"
      style={{ padding: tam === 'grande' ? 24 : tam === 'medio' ? '16px 20px' : 16 }}
      aria-label="Ritmo en vivo"
    >
      {chico ? (
        <div className="grid gap-2.5">
          <div className="flex items-start justify-between gap-3">{titulo}{botonAmpliar}</div>
          {leyenda}
          <div className="justify-self-start">{segmentado}</div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">{titulo}{leyenda}{segmentado}{botonAmpliar}</div>
      )}

      <div ref={medidor} className="relative" style={{ marginTop: chico ? 12 : 10 }}>
        <div className="flex" style={modelo ? { height: modelo.d.alto } : undefined} role="img" aria-label={resumen}>
          {modelo && <RotulosIzq m={modelo} />}
          {/* Siempre montado: el hook engancha sus gestos (rueda, pellizco) una sola vez, al montar. */}
          <div
            ref={scrollRef}
            {...zResto}
            onPointerDown={(ev) => { tipoRef.current = ev.pointerType; dedoRef.current = ev.pointerType === 'touch' ? { x: ev.clientX, y: ev.clientY, arrastra: false } : null; zDown(ev) }}
            onPointerMove={mover}
            onPointerLeave={(ev) => { zLeave(); if (esMouse(ev) && !(ev.relatedTarget as Element | null)?.closest?.('[data-globo-minuto]')) { setCursor(null); setMicroSel(null); setFijo(false) } }}
            onTouchStart={frenaToque}
            onTouchEnd={frenaToque}
            onClick={tocar}
            onScroll={() => { setCursor(null); setMicroSel(null); setFijo(false) }}
            className="v2-minuto-scroll relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
            style={{ touchAction: zg.acercado ? 'pan-x pan-y' : 'pan-y', scrollbarWidth: 'none', height: modelo?.d.alto }}
          >
            {modelo && (
              <div className="relative" style={{ width: W, height: modelo.d.alto }}>
                <LienzoSvg m={modelo} W={W} reloj={reloj} uid={uid} />
                {info && <CursorSvg m={modelo} W={W} info={info} />}
                {microInfo && <MarcaMicroSvg m={modelo} W={W} q={microInfo} />}
              </div>
            )}
          </div>
          {modelo && (modelo.d.pr > 4 ? <RotulosDer m={modelo} /> : <div className="shrink-0" style={{ width: modelo.d.pr }} aria-hidden />)}
        </div>
        {modelo && info && !chico && !lectura && <Globo info={info} style={{ left: globoX, top: modelo.d.pt + 18 }} />}
        {modelo && info && !chico && lectura && (
          <GloboMinutoPc m={modelo} lectura={lectura} xv0={Math.floor(cursor!.min) * pxMinAct - (scrollRef.current?.scrollLeft ?? 0)} px={pxMinAct} resumen={resumenMinuto} parcial={info.parcial} microAbierta={microSel?.id ?? null} fijo={fijo} onMicroHover={abrirMicroDeGlobo} onMicroClick={alternarMicroDeGlobo} onSalir={salirDelGlobo} />
        )}
        {/* Su borde de abajo queda 10 px sobre la primera fila Ev (pegado a la marca, sin tapar las filas) y, si así quedara bajo el encabezado fijo, se baja lo justo. */}
        {modelo && microInfo && microSel && !globoCompacto && <GloboMicroPc q={microInfo} marcaX={modelo.d.pl + microSel.xv} anchoGrafico={modelo.w} filaTop={modelo.d.carriles[0]?.y0 ?? modelo.d.paradas.y0} alto={modelo.d.alto} lienzo={medidor} cal={cal} fijo={microFija} onSalir={salirDelGloboMicro} />}
        <div className="rv-pista-rueda" data-ver={pistaRueda ? 'true' : 'false'} aria-hidden>Ctrl + rueda o pellizca para acercar</div>
      </div>
      {/* En el celular (y en un gráfico de menos de 720 px) el globo va en una columna EN EL FLUJO, justo bajo el gráfico: empuja lo de abajo en vez de taparlo
          y queda dentro de la tarjeta. Al abrirlo se trae a la vista (`scrollIntoView`). */}
      {modelo && microInfo && globoCompacto && (
        <div ref={globoMovilRef} data-globo-minuto="" className="relative z-[3]" style={{ marginTop: 8 }}>
          <GloboMicro q={microInfo} compacto onCerrar={() => setMicroSel(null)} cal={cal} />
        </div>
      )}
      {/* La franja de rango (spec §6): la ventana compartida del gráfico con sus dos asas; moverla acerca o aleja. */}
      {modeloBase && (
        <div className="rv-rango-caja">
          <FranjaRango totalMin={totalMin} ventana={ventana} onVentana={alVentana} puntos={modeloBase.trazo} yMax={modeloBase.yMax} />
        </div>
      )}
      {resumenMicro}
      {tactil && <p className="mt-2 text-[12px] leading-4 text-muted-foreground">{AYUDA_TACTIL}</p>}
      {/* En el celular el globo no flota sobre el lienzo: se ancla a la tarjeta, arriba, y la raya del minuto queda a la vista. */}
      {modelo && info && chico && (
        <div ref={globoMinutoMovilRef} data-globo-minuto="">
          {lectura
            ? <GloboMinuto lectura={lectura} tam={tam} compacto parcial={info.parcial} microAbierta={microSel?.id ?? null} onMicroClick={alternarMicroDeGlobo} onCerrar={() => setCursor(null)} />
            : <Globo info={info} compacto onCerrar={() => setCursor(null)} />}
        </div>
      )}

      {ampliado != null && (
        <CapaAmpliada abierta={ampliada} onCerrar={() => setAmpliada(false)} origen={tarjetaRef} titulo="Ritmo en vivo" sub={sub}>
          {ampliado}
        </CapaAmpliada>
      )}
    </section>
  )
}
