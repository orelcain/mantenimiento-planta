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
import { Info, Maximize2 } from 'lucide-react'
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { DUENO_META } from '@/services/shoplogix/monitorEventos'
import { CapaAmpliada } from './AmpliarV2'
import { useAbrirPorClave, useTamano } from './ampliarHooks'
import { aEstaHora, piezasMostradas } from './aEstaHora'
import {
  RELLENO_DUENO, TRAMA_MANT, acumulado, disenar, escalaAcumulado, esperadoPorMinuto, filasBaader, firmado, horasMin, int, marcasEje,
  minutosVisibles, paradaEn, pctAndando, proyeccion, recortarCurva, relojDe, sumaPorMinuto, tamanoGrafico, tonoRitmo, trazoHastaLectura,
  valorEnCurva, ventanaDe, zoomActivo, zoomMaxPara,
  type CeldaBaader, type Diseno, type ParadaEje, type ParadasMaquina, type Punto, type TonoRitmo, type Zoom,
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
  mal: 'var(--v2-mal)',
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
  yMax: number
  rejilla: number
  n: number
  offsetMin: number
  suma: number[]
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
  vPrev: number | null
  cuota: { piezas: number; hora: string | null } | null
  /** «A esta hora» de la vista (`aEstaHora`): la misma cifra de la franja y de Camino a la meta. null con el turno cerrado o sin cuota. */
  aHora: number | null
  paradas: ParadaEje[]
  barraNueva: boolean
  cerrado: boolean
  unidad: 'carros' | 'silletas' | null
}

const yAcum = (m: Modelo, v: number) => m.d.acum.y0 + (1 - v / m.yMax) * m.d.acum.h
const maxV = (ps: Punto[]) => ps.reduce((a, q) => Math.max(a, q.v), 0)

// ── El SVG ───────────────────────────────────────────────────────────────────

interface Geo { x: (min: number) => number; y: (v: number) => number }

/** El SVG se rehace una vez por lectura; entre lecturas solo se mueven `clip`, `punta` y `proy` por transform. */
const LienzoSvg = memo(function LienzoSvg({ m, W, reloj, uid }: { m: Modelo; W: number; reloj: RelojDeDatos; uid: string }) {
  const { d, totalMin, ultima, previa } = m
  const chico = d.tam === 'chico'
  const pxMin = W / totalMin
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
  const ticksY: number[] = []
  for (let v = 0; v <= m.yMax; v += m.rejilla) ticksY.push(v)

  // Horas del eje X: el paso se adapta al zoom; la marca pegada al «ahora» se omite (ahí va su rótulo).
  const marcas = marcasEje({ totalMin, pxPorMin: pxMin, minPx: chico ? 64 : 100, ahoraMin: ultima.min, ahoraPx: chico ? 84 : 64 })
  const horaAhora = relojDe(m.iniMs + ultima.min * 60_000)
  const xAhora = x(ultima.min)
  const anclaAhora = xAhora > W - 48 ? 'end' : xAhora < 48 ? 'start' : 'middle'

  // Barras por minuto de la línea: un trazo por tono; la barra NUEVA va aparte para animarla. Un minuto en cero no se dibuja.
  const barras = d.barras
  const bw = Math.max(0.7, pxMin * 0.72)
  const yb = (v: number) => (barras ? barras.y0 + barras.h - (v / m.topBarra) * barras.h : 0)
  const porTono: Record<TonoRitmo, string> = { bien: '', atento: '', mal: '', sin: '' }
  const nuevas: Array<{ x: number; y: number; h: number; tono: TonoRitmo }> = []
  if (barras) {
    m.suma.forEach((v, k) => {
      const mm = m.offsetMin + k
      if (mm >= totalMin || v <= 0) return
      const tono = tonoRitmo(v, m.esperadoMin[k] ?? null)
      const bx = x(mm) + (pxMin - bw) / 2
      const by = yb(v)
      const bh = barras.y0 + barras.h - by
      if (m.barraNueva && k === m.suma.length - 1) { nuevas.push({ x: bx, y: by, h: bh, tono }); return }
      porTono[tono] += rect(bx, by, bw, bh)
    })
  }

  // Filas Ev: tramos seguidos del mismo tono se unen en un solo rectángulo.
  const filas = m.maquinas.map((q, i) => {
    const c = d.carriles[i]
    const tramos = { bien: '', atento: '', mal: '' }
    if (!c) return { q, c, tramos }
    let ini = -1
    let tono: TonoRitmo = 'sin'
    const cierra = (kFin: number) => {
      if (tono === 'sin' || ini < 0) return
      const a = x(m.offsetMin + ini), b = x(Math.min(totalMin, m.offsetMin + kFin))
      if (b > a) tramos[tono] += rect(a, c.y0, b - a, c.h)
    }
    for (let k = 0; k <= m.n; k++) {
      const tk = k < m.n && m.offsetMin + k < totalMin ? (q.celdas[k]?.tono ?? 'sin') : 'sin'
      if (tk !== tono) { cierra(k); tono = tk; ini = k }
    }
    return { q, c, tramos }
  })

  // Paradas: las programadas debajo, Mantención arriba de todo.
  const ordenParadas = [...m.paradas.filter((q) => q.desdeMin < totalMin && q.hastaMin > 0)].sort((a, b) => ORDEN_DUENO[a.dueno] - ORDEN_DUENO[b.dueno])
  const finProy = m.proy?.hasta
  const gap = m.aHora
  const brechaIzq = xAhora + 20 + 110 > W
  const baseY = d.paradas.y0 + d.paradas.h
  const idTrama = `${uid}trama`
  const idClip = `${uid}clip`
  const ryMeta = m.meta != null ? y(m.meta) : 0
  const metaAbajo = ryMeta - 18 < 0
  const ryProyTxt = finProy ? Math.min(y(finProy.v), d.acum.y0 + d.acum.h - 12) : 0

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
      </defs>

      {/* Rejilla del acumulado, base de las barras y carriles de las filas */}
      {ticksY.map((v) => <line key={v} x1={0} x2={W} y1={r1(y(v))} y2={r1(y(v))} stroke="var(--v2-reja)" />)}
      {barras && <line x1={0} x2={W} y1={r1(barras.y0 + barras.h)} y2={r1(barras.y0 + barras.h)} stroke="var(--v2-reja)" />}
      {d.carriles.map((c, i) => <rect key={i} x={0} y={c.y0} width={W} height={c.h} rx={3} fill="rgb(142 142 147 / 0.08)" />)}
      <rect x={0} y={d.paradas.y0} width={W} height={d.paradas.h} rx={3} fill="rgb(142 142 147 / 0.08)" />

      {/* El turno anterior equivalente: su curva COMPLETA, en gris tenue */}
      {m.previoPts.length > 1 && (
        <polyline points={puntos(m.previoPts)} fill="none" stroke="var(--v2-gris)" strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin="round" />
      )}

      {/* Meta del turno (tenue) y ritmo de la meta (secundario) */}
      {m.meta != null && (
        <g>
          <line x1={0} x2={W} y1={r1(ryMeta)} y2={r1(ryMeta)} stroke="var(--v2-tenue)" strokeWidth={1} strokeDasharray="2 4" />
          <text x={6} y={r1(metaAbajo ? ryMeta + 14 : ryMeta - 6)} fontSize={12} className="fill-muted-foreground tabular-nums">meta {int(m.meta)}</text>
        </g>
      )}
      {m.objetivo.length > 1 && (
        <polyline points={puntos(m.objetivo)} fill="none" stroke="rgb(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 4" />
      )}

      {/* Hoy: área y trazo, revelados por el clip que avanza con el reloj de datos */}
      <g clipPath={`url(#${idClip})`}>
        <polygon points={`${r1(x(0))},${r1(y(0))} ${puntos(m.trazo)} ${r1(x(ultima.min))},${r1(y(0))}`} fill="var(--v2-acento)" fillOpacity={0.12} />
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
          {chico && (
            m.detenida ? (
              <text x={r1(W - 4)} y={r1(ryProyTxt - 8)} textAnchor="end" fontSize={12} fontWeight={600} style={{ fill: 'var(--v2-mal-texto)' }}>detenida · proyección en pausa</text>
            ) : (
              <text x={r1(W - 4)} y={r1(ryProyTxt - 8)} textAnchor="end" fontSize={12} fontWeight={600} className="tabular-nums" style={{ fill: 'rgb(var(--brand-ink))' }}>al cierre {int(finProy.v)}</text>
            )
          )}
        </g>
      )}

      {/* A esta hora: la brecha contra lo que tocaba, junto a la punta (la MISMA cifra de la franja y de Camino a la meta) */}
      {m.cuota && gap != null && (
        <g className="eje-aparece" key={`brecha-${ultima.v}`}>
          <line x1={r1(xAhora + (brechaIzq ? -14 : 14))} x2={r1(xAhora + (brechaIzq ? -14 : 14))} y1={r1(y(ultima.v))} y2={r1(y(m.cuota.piezas))} stroke={gap < 0 ? 'var(--v2-mal)' : 'var(--v2-bien)'} strokeWidth={1.5} />
          <text
            x={r1(xAhora + (brechaIzq ? -20 : 20))} y={r1((y(ultima.v) + y(m.cuota.piezas)) / 2 + 4)}
            textAnchor={brechaIzq ? 'end' : 'start'} fontSize={12} fontWeight={600} className="tabular-nums"
            style={{ fill: gap < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))', paintOrder: 'stroke', stroke: 'rgb(var(--background))', strokeWidth: 4, strokeLinejoin: 'round' }}
          >
            a esta hora {firmado(gap)}
          </text>
        </g>
      )}

      {/* Barras por minuto de la línea */}
      {barras && m.esperadoLinea != null && (
        <line x1={0} x2={W} y1={r1(yb(m.esperadoLinea))} y2={r1(yb(m.esperadoLinea))} stroke="var(--v2-tenue)" strokeWidth={1} strokeDasharray="3 3" />
      )}
      {barras && chico && m.esperadoLinea != null && (
        <text x={4} y={r1(yb(m.esperadoLinea) - 5)} fontSize={11} className="fill-muted-foreground tabular-nums">esperado {int(m.esperadoLinea)}</text>
      )}
      {(['bien', 'atento', 'mal', 'sin'] as const).map((t) => porTono[t] && <path key={t} d={porTono[t]} fill={COLOR_TONO[t]} />)}
      {nuevas.map((q) => (
        <rect key={`n-${m.suma.length}`} className="eje-barra-nueva" x={r1(q.x)} y={r1(q.y)} width={r1(bw)} height={r1(q.h)} fill={COLOR_TONO[q.tono]} />
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

      {/* «Ahora»: una sola raya que cruza todo el lienzo, y su punta (que se traslada con el reloj) */}
      <line x1={r1(xAhora)} x2={r1(xAhora)} y1={d.acum.y0} y2={baseY} stroke="rgb(var(--foreground) / 0.35)" strokeWidth={1} />
      <g ref={puntaRef} transform="translate(0 0)">
        <circle cx={r1(x((previa ?? ultima).min))} cy={r1(y((previa ?? ultima).v))} r={4.5} fill="var(--v2-acento)" stroke="rgb(var(--background))" strokeWidth={2} />
      </g>

      {/* Eje X compartido */}
      {marcas.map((t) => (
        <text key={t} x={r1(x(t))} y={d.ejeX + 12} textAnchor={t === 0 ? 'start' : t >= totalMin ? 'end' : 'middle'} fontSize={chico ? 11 : 12} className="fill-muted-foreground tabular-nums">{relojDe(m.iniMs + t * 60_000)}</text>
      ))}
      <text x={r1(xAhora)} y={d.ejeX + 12} textAnchor={anclaAhora} fontSize={chico ? 11 : 12} fontWeight={600} className="fill-foreground tabular-nums">{horaAhora} ahora</text>
    </svg>
  )
})

/** La raya del minuto tocado y su punto sobre la curva (aparte del SVG grande: se redibuja con cada movimiento). */
function CursorSvg({ m, W, info }: { m: Modelo; W: number; info: LecturaGlobo }) {
  const px = W / m.totalMin
  const xm = info.xMin * px
  const baseY = m.d.paradas.y0 + m.d.paradas.h
  return (
    <svg width={W} height={m.d.alto} viewBox={`0 0 ${W} ${m.d.alto}`} className="pointer-events-none absolute left-0 top-0 block" aria-hidden>
      <line x1={r1(xm)} x2={r1(xm)} y1={m.d.acum.y0} y2={baseY} stroke="rgb(var(--foreground))" strokeWidth={1.5} />
      {info.acum != null && <circle cx={r1(xm)} cy={r1(yAcum(m, info.acum))} r={4.5} fill="rgb(var(--foreground))" stroke="rgb(var(--background))" strokeWidth={2} />}
    </svg>
  )
}

// ── Rótulos fijos a los lados ────────────────────────────────────────────────

/** Eje Y del acumulado, «pz/min» y los nombres de cada fila: no se mueven con el zoom. */
function RotulosIzq({ m }: { m: Modelo }) {
  const { d } = m
  const chico = d.tam === 'chico'
  const fs = d.tam === 'grande' ? 12 : 11
  const ticks: number[] = []
  for (let v = 0; v <= m.yMax; v += m.rejilla) ticks.push(v)
  const rotuloY = (v: number) => (chico ? (v === 0 ? '0' : `${v / 1000} mil`) : int(v))
  const xr = d.pl - 8
  return (
    <svg width={d.pl} height={d.alto} className="block shrink-0 overflow-visible" aria-hidden>
      {ticks.map((v) => <text key={v} x={xr} y={r1(yAcum(m, v) + 4)} textAnchor="end" fontSize={fs} className="fill-muted-foreground tabular-nums">{rotuloY(v)}</text>)}
      {d.barras && <text x={xr} y={r1(d.barras.y0 + d.barras.h / 2 + 4)} textAnchor="end" fontSize={fs} className="fill-muted-foreground">pz/min</text>}
      {m.maquinas.map((q, i) => {
        const c = d.carriles[i]
        return c ? <text key={q.id} x={xr} y={r1(c.y0 + c.h / 2 + 4)} textAnchor="end" fontSize={fs} className="fill-foreground">{etiquetaMaquina(q.nombre)}</text> : null
      })}
      <text x={xr} y={r1(d.paradas.y0 + d.paradas.h / 2 + 4)} textAnchor="end" fontSize={fs} className="fill-foreground">Paradas</text>
    </svg>
  )
}

/** Cierre proyectado, esperado de la línea, llenado de cada Baader y total de paradas (PC; en el celular no hay columna). */
function RotulosDer({ m }: { m: Modelo }) {
  const { d } = m
  const xr = 8
  const cabe = (t: string, corto: string) => (t.length * 6.4 <= d.pr - xr ? t : corto)
  const minParadas = m.paradas.filter((q) => q.dueno !== 'programado').reduce((a, q) => a + (q.hastaMin - q.desdeMin), 0)
  const nParadas = m.paradas.filter((q) => q.dueno !== 'programado').length
  const fin = m.proy?.hasta ?? null
  const vFin = fin ? fin.v : m.cerrado ? m.ultima.v : null
  const yFin = vFin != null ? Math.min(yAcum(m, vFin), d.acum.y0 + d.acum.h - 28) : 0
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
          {vsMeta != null && <text x={xr} y={r1(yFin + 26)} fontSize={12} style={{ fill: vsMeta < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))' }}>{firmado(vsMeta)} vs meta</text>}
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
        {nParadas > 0
          ? cabe(`${nParadas} ${nParadas === 1 ? 'parada' : 'paradas'} · ${horasMin(minParadas)}`, `${nParadas} · ${horasMin(minParadas)}`)
          : 'sin paradas'}
      </text>
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
  /** Acumulado − tocaban. El minuto en curso usa «A esta hora» de la vista; los demás, la resta de sus dos valores. */
  dif: number | null
  linea: number | null
  esperadoLinea: number | null
  baaders: Array<{ id: string; nombre: string; v: number; esperado: number | null; celda: CeldaBaader }>
  parada: ParadaEje | null
  /** «01:11 → 02:08 · 57 min» de esa parada. */
  paradaTxt: string | null
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
  const parada = paradaEn(m.paradas, kMid)
  return {
    xMin: kMid,
    hora: relojDe(m.iniMs + k0 * 60_000),
    rango: `${relojDe(m.iniMs + k0 * 60_000)}–${relojDe(m.iniMs + (k0 + 1) * 60_000)}`,
    acum,
    futuro,
    tocaban,
    dif,
    linea: enSerie ? m.suma[k]! : null,
    esperadoLinea: enSerie ? m.esperadoMin[k] ?? null : null,
    baaders: enSerie
      ? m.maquinas.filter((q) => k < q.cycles.length).map((q) => ({ id: q.id, nombre: etiquetaMaquina(q.nombre), v: q.cycles[k] ?? 0, esperado: q.esperado, celda: q.celdas[k]! }))
      : [],
    parada,
    paradaTxt: parada ? `${relojDe(m.iniMs + parada.desdeMin * 60_000)} → ${relojDe(m.iniMs + parada.hastaMin * 60_000)} · ${horasMin(parada.hastaMin - parada.desdeMin)}` : null,
  }
}

function Globo({ info, style }: { info: LecturaGlobo; style: CSSProperties }) {
  const dif = info.dif
  const p = info.parada
  return (
    <div className="v2-tip pointer-events-none absolute z-10 box-border w-[280px] rounded-[22px] px-4 py-3.5" style={style} role="tooltip">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[17px] font-semibold tabular-nums text-foreground">{info.hora}</span>
        <span className="text-[12px] tabular-nums text-muted-foreground">minuto {info.rango}</span>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_auto] justify-between gap-x-4 gap-y-1 text-[13px] tabular-nums">
        {info.acum != null && (
          <>
            <dt className="text-muted-foreground">{info.futuro ? 'Proyección' : 'Acumulado'}</dt>
            <dd className="text-right font-semibold text-foreground">{int(info.acum)} pz</dd>
          </>
        )}
        {info.tocaban != null && (
          <>
            <dt className="text-muted-foreground">Tocaban</dt>
            <dd className="text-right text-foreground">
              {int(info.tocaban)}
              {dif != null && <span className="ml-1" style={{ color: dif < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))' }}>({firmado(dif)})</span>}
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
      {info.baaders.length > 0 && (
        <ul className="mt-3 grid gap-1 text-[13px]">
          {info.baaders.map((q) => (
            <li key={q.id} className="flex items-center gap-2 text-foreground">
              <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_TONO[q.celda.tono] }} aria-hidden />
              {q.nombre}
              <span className="tabular-nums text-muted-foreground">{q.esperado != null ? `${int(q.v)} de ${int(q.esperado)} · ` : `${int(q.v)} pz · `}{q.celda.estado === 'sin-dato' ? 'sin dato' : q.celda.estado}</span>
            </li>
          ))}
        </ul>
      )}
      {p && (
        <div className="mt-3 rounded-[10px] px-3 py-2.5" style={{ background: 'rgb(142 142 147 / 0.08)' }}>
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="min-w-0 truncate font-semibold text-foreground">{p.maquina ?? 'Parada de línea'}</span>
            <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{info.paradaTxt}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-foreground">
            <i className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.dueno === 'mantencion' ? TRAMA_MANT : RELLENO_DUENO[p.dueno] }} aria-hidden />
            <span>{DUENO_META[p.dueno].label}</span>
            {p.dueno === 'sin-imputar'
              ? <span className="font-semibold" style={{ color: 'var(--v2-atento-texto)' }}>· falta dueño</span>
              : <span className="min-w-0 truncate text-muted-foreground">· {p.causa}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Leyenda de 4 y su globo ⓘ ────────────────────────────────────────────────

function Muestra({ trazo, color, opacidad, rotulo }: { trazo: 'hoy' | 'meta' | 'proy' | 'previo'; color: string; opacidad?: number; rotulo: string }) {
  const d = { hoy: { w: 2.5, da: undefined, cap: 'round' }, meta: { w: 1.5, da: '4 3', cap: 'butt' }, proy: { w: 2, da: '1.5 3', cap: 'round' }, previo: { w: 2, da: undefined, cap: 'butt' } }[trazo]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <svg width={18} height={8} aria-hidden><path d="M1 4H17" fill="none" stroke={color} strokeWidth={d.w} strokeDasharray={d.da} strokeLinecap={d.cap as 'round' | 'butt'} opacity={opacidad} /></svg>
      {rotulo}
    </span>
  )
}

/** Los estados de color y los dueños de las paradas: lo que la leyenda de 4 no repite (se abre con un toque o Enter). */
function InfoLeyenda() {
  const [abierto, setAbierto] = useState(false)
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
        <div id={id} role="tooltip" className="v2-tip absolute left-0 top-full z-20 mt-2 box-border w-[270px] max-w-[calc(100vw-48px)] rounded-[22px] px-4 py-3.5 text-[13px] leading-snug text-foreground">
          <div className="font-semibold">Barras y filas Ev</div>
          <ul className="mt-1.5 grid gap-1 text-muted-foreground">
            <li className="flex items-center gap-2">{cuadro('var(--v2-bien)')}75 % o más del esperado</li>
            <li className="flex items-center gap-2">{cuadro('var(--v2-atento)')}entre 50 y 75 %</li>
            <li className="flex items-center gap-2">{cuadro('var(--v2-mal)')}menos de 50 %</li>
          </ul>
          <div className="mt-3 font-semibold">Paradas, por dueño</div>
          <ul className="mt-1.5 grid gap-1 text-muted-foreground">
            <li className="flex items-center gap-2">{cuadro(TRAMA_MANT)}Mantención</li>
            <li className="flex items-center gap-2">{cuadro('var(--v2-ext)')}Externo</li>
            <li className="flex items-center gap-2">{cuadro('var(--v2-gris)')}Sin imputar</li>
            <li className="flex items-center gap-2">{cuadro('', true)}Programada</li>
          </ul>
        </div>
      )}
    </span>
  )
}

// ── El gráfico ───────────────────────────────────────────────────────────────

const SEGMENTOS: Array<[Zoom, string]> = [['turno', 'Turno'], ['1h', '1 h'], ['15m', '15 min']]

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
  useAbrirPorClave(abrirCon, () => setAmpliada(true))
  /* «A esta hora»: una sola definición para toda la vista (franja, este rótulo, el globo y Camino a la meta). */
  const mostradas = piezasMostradas(p.repro, p.piezas)
  const aHora = p.cerrado ? null : aEstaHora(mostradas, p.cuota?.piezas, p.meta)
  const nPrev = useRef<number | null>(null)
  const totalMin = (e.finMs - e.iniMs) / 60_000

  const modelo = useMemo<Modelo | null>(() => {
    if (w < 200 || !(totalMin > 0)) return null
    const cuadro = reloj.cuadro()
    const minuto = e.minuto
    const n = minuto ? minutosVisibles(minuto.maquinas, p.cerrado) : 0
    const conSerie = minuto != null && n > 0
    const offsetMin = minuto ? Math.round((Date.parse(minuto.desde) - e.iniMs) / 60_000) : 0
    const suma = conSerie ? sumaPorMinuto(minuto.maquinas, n) : []
    const ult = cuadro.ultima
    const min0 = ult?.atMs != null ? (ult.atMs - e.iniMs) / 60_000 : conSerie ? offsetMin + n : 0
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
    const vPrev = previoPts.length > 1 ? valorEnCurva(previoPts, ultima.min) : null

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
      w, d, iniMs: e.iniMs, totalMin, yMax, rejilla, n, offsetMin, suma,
      esperadoMin: conSerie ? esperadoPorMinuto(minuto.maquinas, n) : [], esperadoLinea, topBarra: Math.ceil((Math.max(esperadoLinea ?? 0, ...suma, 10) * 1.15) / 10) * 10, maquinas, trazo, previa, ultima, proy, detenida,
      meta: p.meta, objetivo, previoPts, previoLabel: p.curva?.previo?.label ?? null, vPrev, cuota: p.cuota ?? null, aHora, paradas: e.paradas,
      barraNueva, cerrado: p.cerrado, unidad: e.unidad,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se rehace con cada lectura (`reloj.version`) y con los datos del turno
  }, [w, e, totalMin, p.piezas, p.proyeccion, p.meta, p.cuota, p.curva, p.cerrado, detenida, aHora, reloj.version])
  useEffect(() => { nPrev.current = modelo?.n ?? nPrev.current })

  // ── Zoom: atajos «Turno | 1 h | 15 min» y gestos, sobre la misma ventana ──
  const [ventana, setVentana] = useState<Ventana | null>(null)
  /** El atajo que sigue al presente mientras nadie recorra el gráfico a mano. */
  const [sigue, setSigue] = useState<Zoom>('turno')
  const ahoraMin = modelo?.ultima.min ?? 0
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
    if (sigue === 'turno' || !modelo) return
    setVentana(ventanaDe(sigue, ahoraMin, totalMin))
  }, [sigue, ahoraMin, totalMin, modelo])
  const elegir = (z: Zoom) => {
    if (z === 'turno') { zg.verTodo(); return }
    setSigue(z)
    setVentana(ventanaDe(z, ahoraMin, totalMin))
  }
  const activo = zoomActivo(ventana)

  // ── Globo: con el mouse al pasar, con el dedo al tocar (tocar fuera lo cierra) ──
  const [cursor, setCursor] = useState<{ min: number; xv: number } | null>(null)
  const tipoRef = useRef('mouse')
  const { ref: scrollRef, onPointerDown: zDown, onPointerMove: zMove, onPointerLeave: zLeave, ...zResto } = zg.props
  const W = modelo ? Math.round(modelo.d.plotW * zg.zoom) : 0
  const minDe = (ev: { clientX: number }) => {
    const el = scrollRef.current
    if (!el || !modelo || W <= 0) return null
    const r = el.getBoundingClientRect()
    const xv = ev.clientX - r.left
    const min = ((xv + el.scrollLeft) / W) * modelo.totalMin
    return min >= 0 && min <= modelo.totalMin ? { min, xv } : null
  }
  const mover = (ev: ReactPointerEvent<HTMLDivElement>) => {
    zMove(ev)
    if (ev.pointerType !== 'mouse') return
    const nuevo = ev.buttons === 0 ? minDe(ev) : null
    setCursor((a) => (a && nuevo && Math.floor(a.min) === Math.floor(nuevo.min) ? a : nuevo))
  }
  const tocar = (ev: { clientX: number }) => {
    if (tipoRef.current === 'mouse') return
    const nuevo = minDe(ev)
    setCursor((a) => (nuevo && a && Math.floor(a.min) === Math.floor(nuevo.min) ? null : nuevo))
  }
  const hayGlobo = cursor !== null
  useEffect(() => {
    if (!hayGlobo) return
    const fuera = (ev: PointerEvent) => { if (!medidor.current?.contains(ev.target as Node)) setCursor(null) }
    document.addEventListener('pointerdown', fuera)
    return () => document.removeEventListener('pointerdown', fuera)
  }, [hayGlobo, medidor])

  const info = modelo && cursor ? leer(modelo, cursor.min) : null
  const globoIzq = modelo && cursor ? modelo.d.pl + cursor.xv + 14 : 0
  const globoX = modelo ? (globoIzq + 280 > modelo.w ? Math.max(0, globoIzq - 28 - 280) : globoIzq) : 0

  // ── Lo que se ve alrededor ──
  const tam = modelo ? modelo.d.tam : tamanoGrafico(w)
  const chico = tam === 'chico'
  const sub = `${relojDe(e.iniMs)} → ${relojDe(e.finMs)}${p.corteHora ? ` · leído de Shoplogix ${p.corteHora}` : ''}`
  const resumen = `Piezas acumuladas del turno: ${int(mostradas)}${p.meta ? ` de ${int(p.meta)}` : ''}${p.proyeccion != null && !p.cerrado ? `, al cierre ${int(p.proyeccion)}` : ''}. Debajo, el ritmo por minuto, cada Baader y las paradas en las mismas horas.`
  const hayProy = modelo?.proy != null
  const titulo = (
    <div className="min-w-0">
      <h3 className="text-[17px] font-semibold leading-[22px] text-foreground">Ritmo en vivo</h3>
      <p className="text-[13px] leading-[18px] text-muted-foreground">{sub}</p>
    </div>
  )
  const leyenda = (
    <div className={`flex flex-wrap items-center gap-x-[14px] gap-y-1.5 text-[12px] leading-4 text-muted-foreground ${chico ? '' : 'ml-auto'}`}>
      <Muestra trazo="hoy" color="var(--v2-acento)" rotulo="hoy" />
      {modelo && modelo.objetivo.length > 1 && <Muestra trazo="meta" color="rgb(var(--muted-foreground))" rotulo="ritmo de la meta" />}
      {hayProy && <Muestra trazo="proy" color="var(--v2-acento)" rotulo="proyección" />}
      {modelo && modelo.vPrev != null && modelo.previoLabel && (
        <Muestra trazo="previo" color="var(--v2-gris)" opacidad={0.6} rotulo={`${modelo.previoLabel} · ${int(modelo.vPrev)} ${p.cerrado ? 'al mismo minuto' : 'a esta hora'}`} />
      )}
      <InfoLeyenda />
    </div>
  )
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
            className={`tap-44 h-8 rounded-full px-3.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 ${on ? 'font-semibold' : 'text-foreground'}`}
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
      className="v2-tarjeta rv-grafico min-w-0 rounded-card"
      style={{ padding: tam === 'grande' ? 24 : tam === 'medio' ? 20 : 16 }}
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

      <div ref={medidor} className="relative" style={{ marginTop: chico ? 12 : 14 }}>
        <div className="flex" style={modelo ? { height: modelo.d.alto } : undefined} role="img" aria-label={resumen}>
          {modelo && <RotulosIzq m={modelo} />}
          {/* Siempre montado: el hook engancha sus gestos (rueda, pellizco) una sola vez, al montar. */}
          <div
            ref={scrollRef}
            {...zResto}
            onPointerDown={(ev) => { tipoRef.current = ev.pointerType; zDown(ev) }}
            onPointerMove={mover}
            onPointerLeave={(ev) => { zLeave(); if (ev.pointerType === 'mouse') setCursor(null) }}
            onClick={tocar}
            onScroll={() => setCursor(null)}
            className="v2-minuto-scroll relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
            style={{ touchAction: 'pan-x pan-y', scrollbarWidth: 'none', height: modelo?.d.alto }}
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
        {modelo && info && <Globo info={info} style={{ left: globoX, top: modelo.d.pt + 18 }} />}
      </div>
      <p className="mt-2 text-[12px] leading-4 text-muted-foreground">
        {chico
          ? 'Toca un minuto para verlo · pellizca para acercar'
          : 'Pasa el cursor o toca un minuto para verlo · Ctrl + rueda o pellizco para acercar, arrastra para recorrer · doble clic vuelve al turno'}
      </p>

      {ampliado != null && (
        <CapaAmpliada abierta={ampliada} onCerrar={() => setAmpliada(false)} origen={tarjetaRef} titulo="Ritmo en vivo" sub={sub}>
          {ampliado}
        </CapaAmpliada>
      )}
    </section>
  )
}
