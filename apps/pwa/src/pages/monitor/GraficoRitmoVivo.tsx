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
 * Todo sale de las funciones de datos que ya existen (`ritmoVivo`, `monitorEventos`…): este archivo solo ubica y dibuja.
 */
import { Info, Maximize2, X } from 'lucide-react'
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type TouchEvent as ReactTouchEvent } from 'react'
import { DUENO_META } from '@/services/shoplogix/monitorEventos'
import { CapaAmpliada } from './AmpliarV2'
import { useAbrirPorClave, useTamano } from './ampliarHooks'
import { aEstaHora, piezasMostradas } from './aEstaHora'
import {
  RELLENO_DUENO, TRAMA_MANT, acumulado, anchoRotuloAhora, anclaRotuloAhora, brechaALaIzquierda, cifraTurnoAnterior, cubetasDeLinea, disenar, dominioVisible, episodiosParada, escalaAcumulado,
  adelanteAtras, escalaVentana, esperadoPorMinuto, filasBaader, finDelEje, horasMin, int, marcasEje, minutosConParada, minutosCompletos, minutosPorCubeta,
  minutosVisibles, paradasEn, pctAndando, proyeccion, rayasY, recortarCurva, relojDe, separarRotulos, sumaPorMinuto, tamanoGrafico, tonoDeCubeta,
  tonoRitmo, trazoHastaLectura, valorEnCurva, ventanaDe, zoomActivo, zoomMaxPara,
  type AnclaRotulo, type CeldaBaader, type Diseno, type ParadaEje, type ParadasMaquina, type Punto, type TonoRitmo, type Zoom,
} from './ejeTurno'
import { etiquetaMaquina } from './ritmoVivo'
import type { CuadroReloj, RelojDeDatos } from './useRelojDeDatos'
import { useZoomGesto, type Ventana } from './useZoomGesto'
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
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const r1 = (n: number) => Math.round(n * 10) / 10
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
/** Una barra o celda como trazo de path (un solo nodo por tono en vez de cientos de rects). */
const rect = (x: number, y: number, w: number, h: number) => `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${-r1(w)}z`

const COLOR_TONO: Record<TonoRitmo, string> = {
  bien: 'var(--v2-bien)',
  atento: 'var(--v2-atento)',
  /* `--rv-mal` (monitorGlass.css): un tono más profundo que el coral de la franja, para distinguirlo del ámbar en barras de 1–2 px. */
  mal: 'var(--rv-mal)',
  sin: 'var(--v2-gris)',
}
/** Las filas Ev: andando apenas se nota (acento 38 %), lo que se atrasa o se detiene toma color (85 %). */
const OPACIDAD_FILA: Record<'bien' | 'atento' | 'mal', number> = { bien: 0.38, atento: 0.85, mal: 0.85 }
const ORDEN_DUENO: Record<ParadaEje['dueno'], number> = { programado: 0, 'sin-imputar': 1, externo: 2, mantencion: 3 }

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
  maquinas: Array<{ id: string; nombre: string; esperado: number | null; cycles: number[]; celdas: CeldaBaader[]; pct: number | null; ultimoLlenado: number | null }>
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
  paradas: ParadaEje[]
  barraNueva: boolean
  cerrado: boolean
  unidad: 'carros' | 'silletas' | null
}

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

/** El SVG se rehace una vez por lectura; entre lecturas solo se mueven `clip`, `punta` y `proy` por transform. */
const LienzoSvg = memo(function LienzoSvg({ m, W, reloj, uid }: { m: Modelo; W: number; reloj: RelojDeDatos; uid: string }) {
  const { d, totalMin, ultima, previa } = m
  const chico = d.tam === 'chico'
  const pxMin = pxPorMinuto(W, totalMin)
  const x = (min: number) => min * pxMin
  const y = (v: number) => yAcum(m, v)
  const geo = useRef<Geo>({ x, y })
  geo.current = { x, y }
  const clipRef = useRef<SVGRectElement>(null)
  const puntaRef = useRef<SVGGElement>(null)
  const proyRef = useRef<SVGLineElement>(null)

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
    if (proyRef.current && m.proy) {
      const ex = g.x(m.proy.hasta.min), ey = g.y(m.proy.hasta.v)
      proyRef.current.setAttribute('transform', `matrix(${r1(ex - hx)} ${r1(ey - hy)} 0 1 ${r1(hx)} ${r1(hy)})`)
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
        if (m.barraNueva && k === m.suma.length - 1) { nuevas.push({ x: bx, y: by, h: bh, w: bw, tono, parcial }); return }
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
      if (b > a) tramos[tono] += rect(a, c.y0, b - a, c.h)
    }
    for (let j = 0; j <= tonos.length; j++) {
      const tk = j < tonos.length ? tonos[j]!.tono : 'sin'
      const kj = j < tonos.length ? tonos[j]!.k0 : m.n
      if (tk !== tono) { cierra(kj); tono = tk; ini = kj }
    }
    return { q, c, tramos }
  })

  // Paradas: las programadas debajo, Mantención arriba de todo.
  const ordenParadas = [...m.paradas.filter((q) => q.desdeMin < totalMin && q.hastaMin > 0)].sort((a, b) => ORDEN_DUENO[a.dueno] - ORDEN_DUENO[b.dueno])
  const finProy = m.proy?.hasta
  const gap = m.aHora
  const textoBrecha = gap != null ? adelanteAtras(gap) : ''
  /* El rótulo de «a esta hora» va a la derecha de la punta; si no cabe en lo que se VE (con zoom la ventana termina poco después
     de la punta), pasa a su izquierda. Texto de 12 px/600: ~7,4 px por carácter. */
  const anchoBrecha = textoBrecha.length * 7.4
  const brechaIzq = brechaALaIzquierda(xAhora, anchoBrecha, visDer)
  const baseY = d.paradas.y0 + d.paradas.h
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
          <g className="eje-aparece" key={`brecha-${ultima.v}`}>
            <line x1={r1(xAhora + (brechaIzq ? -14 : 14))} x2={r1(xAhora + (brechaIzq ? -14 : 14))} y1={r1(y(ultima.v))} y2={r1(y(m.cuota.piezas))} stroke={gap < 0 ? 'var(--v2-mal)' : 'var(--v2-bien)'} strokeWidth={1.5} />
            <text
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
        <rect key={`n-${m.suma.length}`} className="eje-barra-nueva" x={r1(q.x)} y={r1(q.y)} width={r1(q.w)} height={r1(q.h)} fill={COLOR_TONO[q.tono]} fillOpacity={q.parcial ? 0.45 : undefined} />
      ))}

      {/* Una fila por Baader: andando casi no se nota; lenta o detenida con la línea andando toma color */}
      {filas.map(({ q, c, tramos }) => c && (
        <g key={q.id}>
          {(['bien', 'atento', 'mal'] as const).map((t) => tramos[t] && <path key={t} d={tramos[t]} fill={COLOR_TONO[t]} fillOpacity={OPACIDAD_FILA[t]} />)}
        </g>
      ))}

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

      {/* «Ahora» (o el fin del turno cerrado): una sola raya que cruza todo el lienzo, y su punta (que se traslada con el reloj) */}
      <line x1={r1(xAhora)} x2={r1(xAhora)} y1={d.acum.y0} y2={baseY} stroke="rgb(var(--foreground) / 0.35)" strokeWidth={1} />
      <g clipPath={`url(#${idBanda})`}>
        <g ref={puntaRef} transform="translate(0 0)">
          <circle cx={r1(x((previa ?? ultima).min))} cy={r1(y((previa ?? ultima).v))} r={4.5} fill="var(--v2-acento)" stroke="rgb(var(--background))" strokeWidth={2} />
        </g>
      </g>

      {/* Eje X compartido */}
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
  const baseY = m.d.paradas.y0 + m.d.paradas.h
  return (
    <svg width={W} height={m.d.alto} viewBox={`0 0 ${W} ${m.d.alto}`} className="pointer-events-none absolute left-0 top-0 block" aria-hidden>
      <line x1={r1(xm)} x2={r1(xm)} y1={m.d.acum.y0} y2={baseY} stroke="rgb(var(--foreground))" strokeWidth={1.5} />
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
    </svg>
  )
}

/** Cierre proyectado, esperado de la línea, llenado de cada Baader y paradas (PC; en el celular no hay columna). */
function RotulosDer({ m }: { m: Modelo }) {
  const { d } = m
  const xr = 8
  /* Paradas = tiempo de RELOJ con alguna parada (unión de intervalos, sin programadas) y episodios fusionados: tres Baader
     paradas a la vez cuentan una vez (la suma por máquina daba casi 5 h en un turno de 7 h 20 min). */
  const lim = { min: 0, max: m.totalMin }
  const nParadas = episodiosParada(m.paradas, lim)
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
        const t = q.ultimoLlenado != null && m.unidad ? `${q.ultimoLlenado} % ${m.unidad}` : q.pct != null ? `${q.pct} % a ritmo` : ''
        return t ? <text key={q.id} x={xr} y={r1(c.y0 + c.h / 2 + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">{t}</text> : null
      })}
      <text x={xr} y={r1(d.paradas.y0 + d.paradas.h / 2 + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">
        {nParadas > 0 ? `${nParadas} ${nParadas === 1 ? 'detención' : 'detenciones'}` : 'sin detenciones'}
      </text>
      {nParadas > 0 && <text x={xr} y={r1(d.ejeX + 12)} fontSize={12} fontWeight={600} className="fill-foreground tabular-nums">{horasMin(minParadas)}</text>}
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
function leer(m: Modelo, min: number): LecturaGlobo {
  const k0 = Math.floor(min)
  const kMid = k0 + 0.5
  const enAhora = k0 === Math.floor(m.ultima.min)
  const futuro = !enAhora && kMid > m.ultima.min
  const acum = enAhora ? m.ultima.v : futuro ? (m.proy ? valorEnCurva([m.proy.desde, m.proy.hasta], kMid) : null) : valorEnCurva(m.trazo, kMid)
  const tocaban = enAhora && m.cuota && !m.cerrado ? m.cuota.piezas : valorEnCurva(m.objetivo, kMid)
  const dif = enAhora && m.aHora != null ? m.aHora : acum != null && tocaban != null && !futuro ? acum - tocaban : null
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

// ── Leyenda de 4 y su globo ⓘ ────────────────────────────────────────────────

/** La muestra de cada trazo: IGUAL al que se dibuja (grosor, trazo y opacidad), para que la leyenda no mienta. */
function Muestra({ trazo, color, opacidad, rotulo }: { trazo: 'hoy' | 'meta' | 'proy' | 'previo'; color: string; opacidad?: number; rotulo: ReactNode }) {
  const d = { hoy: { w: 2.5, da: undefined, cap: 'round' }, meta: { w: 1.5, da: '5 4', cap: 'butt' }, proy: { w: 2, da: '1.5 3', cap: 'round' }, previo: { w: 1.5, da: undefined, cap: 'butt' } }[trazo]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width={18} height={8} aria-hidden><path d="M1 4H17" fill="none" stroke={color} strokeWidth={d.w} strokeDasharray={d.da} strokeLinecap={d.cap as 'round' | 'butt'} opacity={opacidad} /></svg>
      {rotulo}
    </span>
  )
}

/**
 * Los estados de color y los dueños de las paradas, más «Cómo usarlo» (se abre con un toque o Enter). El globo no se sale de
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

const AYUDA_PC = 'Pasa el cursor sobre un minuto para verlo. Ctrl + rueda o pellizco para acercar, arrastra para recorrer. Doble clic vuelve al turno.'
const AYUDA_TACTIL = 'Toca un minuto · pellizca para acercar · arrastra para recorrer'

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
  const nPrev = useRef<number | null>(null)
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
    const minuto = e.minuto
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
        return { id: q.id, nombre: q.nombre, esperado: q.esperado, cycles: q.cycles, celdas, pct: pctAndando(celdas), ultimoLlenado: e.llenado?.find((l) => l.id === q.id)?.ultimo ?? null }
      })
      : []
    const esperadoLinea = conSerie && minuto.maquinas.every((q) => q.esperado != null) ? minuto.maquinas.reduce((a, q) => a + (q.esperado ?? 0), 0) : null
    const d = disenar(w, tamanoGrafico(w), maquinas.length, conSerie)
    const barraNueva = nPrev.current != null && n > nPrev.current
    return {
      w, d, iniMs: e.iniMs, totalMin, yMin: 0, yMax, rejilla, vent: null, n, offsetMin, suma, completos: conSerie ? minutosCompletos(minuto.maquinas) : 0,
      esperadoMin: conSerie ? esperadoPorMinuto(minuto.maquinas, n) : [], esperadoLinea, topBarra: Math.ceil((Math.max(esperadoLinea ?? 0, ...suma, 10) * 1.15) / 10) * 10, maquinas, trazo, previa, ultima, proy, detenida,
      meta: p.meta, objetivo, previoPts, previoLabel: p.curva?.previo?.label ?? null, previoCifra, finReal: finReal != null, cuota: p.cuota ?? null, aHora, paradas: e.paradas,
      barraNueva, cerrado: p.cerrado, unidad: e.unidad,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se rehace con cada lectura (`reloj.version`) y con los datos del turno
  }, [w, e, totalMin, finReal, p.piezas, p.proyeccion, p.meta, p.cuota, p.curva, p.cerrado, detenida, aHora, reloj.version])
  useEffect(() => { nPrev.current = modeloBase?.n ?? nPrev.current })

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
  const zg = useZoomGesto({ dominioMin: Math.max(1, totalMin), ventana, onVentana: alVentana, zoomMax: zoomMaxPara(totalMin) })
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
  const tipoRef = useRef('mouse')
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
      }
      const nuevo = minDe(ev)
      if (nuevo) setCursor((a) => (mismoMinuto(a, nuevo) ? a : nuevo))
      return
    }
    if (ev.pointerType !== 'mouse') return
    const nuevo = ev.buttons === 0 ? minDe(ev) : null
    setCursor((a) => (mismoMinuto(a, nuevo) ? a : nuevo))
  }
  const tocar = (ev: { clientX: number }) => {
    if (tipoRef.current === 'mouse') return
    if (dedoRef.current?.arrastra) { dedoRef.current = null; return }
    const nuevo = minDe(ev)
    setCursor((a) => (nuevo && mismoMinuto(a, nuevo) ? null : nuevo))
  }
  /* Los toques en el gráfico no llegan a la página: su deslizar de 60 px cambia de turno y este es el gesto de recorrer minutos. */
  const frenaToque = (ev: ReactTouchEvent) => ev.stopPropagation()
  const hayGlobo = cursor !== null
  useEffect(() => {
    if (!hayGlobo) return
    const fuera = (ev: PointerEvent) => {
      const t = ev.target as Element | null
      if (!medidor.current?.contains(t as Node) && !t?.closest?.('[data-globo-minuto]')) setCursor(null)
    }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [hayGlobo, medidor])

  const info = modelo && cursor ? leer(modelo, cursor.min) : null
  const globoIzq = modelo && cursor ? modelo.d.pl + cursor.xv + 14 : 0
  const globoX = modelo ? (globoIzq + 280 > modelo.w ? Math.max(0, globoIzq - 28 - 280) : globoIzq) : 0

  // ── Lo que se ve alrededor ──
  const tam = modelo ? modelo.d.tam : tamanoGrafico(w)
  const chico = tam === 'chico'
  const sub = p.cerrado && finReal != null
    ? `${relojDe(e.iniMs)} → ${relojDe(finReal)} · terminado`
    : `${relojDe(e.iniMs)} → ${relojDe(e.finMs)}`
  const resumen = `Hechas del turno: ${int(mostradas)}${p.meta ? ` de ${int(p.meta)}` : ''}${p.proyeccion != null && !p.cerrado ? `, al cierre ${int(p.proyeccion)}` : ''}. Debajo, el ritmo por minuto, cada Baader y las detenciones en las mismas horas.`
  const hayProy = modelo?.proy != null
  const titulo = (
    <div className="min-w-0">
      <h3 className="text-[17px] font-semibold leading-[22px] text-foreground">Ritmo en vivo</h3>
      <p className="text-[13px] leading-[18px] text-muted-foreground">{sub}</p>
    </div>
  )
  const pc = modelo?.previoCifra
  const difHoy = pc && modelo ? modelo.ultima.v - pc.piezas : null
  const leyenda = (
    <div className={`flex flex-wrap items-center gap-x-[14px] gap-y-1.5 text-[12px] leading-4 text-muted-foreground ${chico ? '' : 'ml-auto'}`}>
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
      <InfoLeyenda ayuda={tactil ? AYUDA_TACTIL : AYUDA_PC} />
    </div>
  )
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
            onPointerLeave={(ev) => { zLeave(); if (ev.pointerType === 'mouse') setCursor(null) }}
            onTouchStart={frenaToque}
            onTouchEnd={frenaToque}
            onClick={tocar}
            onScroll={() => setCursor(null)}
            className="v2-minuto-scroll relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
            style={{ touchAction: zg.acercado ? 'pan-x pan-y' : 'pan-y', scrollbarWidth: 'none', height: modelo?.d.alto }}
          >
            {modelo && (
              <div className="relative" style={{ width: W, height: modelo.d.alto }}>
                <LienzoSvg m={modelo} W={W} reloj={reloj} uid={uid} />
                {info && <CursorSvg m={modelo} W={W} info={info} />}
              </div>
            )}
          </div>
          {modelo && (modelo.d.pr > 4 ? <RotulosDer m={modelo} /> : <div className="shrink-0" style={{ width: modelo.d.pr }} aria-hidden />)}
        </div>
        {modelo && info && !chico && <Globo info={info} style={{ left: globoX, top: modelo.d.pt + 18 }} />}
      </div>
      {tactil && <p className="mt-2 text-[12px] leading-4 text-muted-foreground">{AYUDA_TACTIL}</p>}
      {/* En el celular el globo no flota sobre el lienzo: se ancla a la tarjeta, arriba, y la raya del minuto queda a la vista. */}
      {modelo && info && chico && <div data-globo-minuto=""><Globo info={info} compacto onCerrar={() => setCursor(null)} /></div>}

      {ampliado != null && (
        <CapaAmpliada abierta={ampliada} onCerrar={() => setAmpliada(false)} origen={tarjetaRef} titulo="Ritmo en vivo" sub={sub}>
          {ampliado}
        </CapaAmpliada>
      )}
    </section>
  )
}
