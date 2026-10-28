/**
 * «El turno» en PC (≥ 1280 px) · opción B «Eje del turno» (mockup del 27-10, PLAN_DUELO_EQUIPOS.md, Fase 5).
 *
 * Una rama aparte por ancho: el celular y el PC angosto siguen con las tarjetas de siempre. Aquí el TIEMPO es el
 * eje: un lienzo grande junta, sobre las mismas horas, el acumulado con su proyección, el ritmo por minuto, cada
 * Baader y las paradas por dueño, con una sola raya de «ahora». A la derecha, un riel de cifras.
 *
 * Movimiento («reloj de datos», DESIGN.md §8): la cifra de piezas y la punta de la curva avanzan en línea recta
 * entre dos lecturas REALES de Shoplogix (`useRelojDeDatos`). La geometría se dibuja una vez por lectura; lo que
 * se mueve entre lecturas es un `transform` (clip y punta de la curva, arranque de la proyección) y el texto de
 * la cifra. La barra nueva entra con `scaleY` y la proyección con `opacity` (400 ms, curva de la piel).
 *
 * Todo sale de las funciones de datos que ya existen (`ritmoVivo`, `monitorEventos`, `contadorCrudo`…): este
 * archivo solo ubica y dibuja. Lo que no está en B (Ritmo en vivo con su desglose, Camino a la meta completo,
 * Duelo, Fallas de equipos…) sigue debajo del pliegue, en las tarjetas de siempre.
 */
import { Maximize2 } from 'lucide-react'
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { Pill } from '@/components/piel'
import { CapaAmpliada } from './AmpliarV2'
import { useMovimientoReducido, useTamano } from './ampliarHooks'
import { etiquetaMaquina } from './ritmoVivo'
import {
  acumulado, disenar, escalaY, finDelEje, minutosVisibles, paradaEn, pasoMarcas, pctARitmo, proyeccion, sumaPorMinuto,
  tonoRitmo, trazoHastaLectura, valorEnCurva, type Diseno, type ParadaEje, type Punto, type TonoRitmo,
} from './ejeTurno'
import type { CuadroReloj, RelojDeDatos } from './useRelojDeDatos'
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
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
const firmado = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`
const r1 = (n: number) => Math.round(n * 10) / 10
const relojDe = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const horasMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

const COLOR_TONO: Record<TonoRitmo, string> = {
  bien: 'var(--v2-bien)',
  atento: 'var(--v2-atento)',
  mal: 'var(--v2-mal)',
  sin: 'var(--v2-relleno)',
}
const RELLENO_DUENO = { mantencion: 'var(--v2-mant)', externo: 'var(--v2-ext)', 'sin-imputar': 'var(--v2-gris)', programado: 'var(--v2-prog)' } as const
/** La trama de Mantención en HTML (swatches): rayas oscuras sobre el ámbar, para no depender solo del color. */
const TRAMA_MANT = 'repeating-linear-gradient(135deg, rgb(0 0 0 / 0.4) 0 2px, transparent 2px 5px), var(--v2-mant)'

// ── La cifra que cuenta con las lecturas ─────────────────────────────────────

/**
 * Un número que sigue al reloj de datos: escribe el texto solo cuando cambia el entero (con `tabular-nums`, para
 * que no baile). Sin lectura, o sin reloj de por medio, muestra `respaldo`.
 */
export function CifraViva({ reloj, respaldo, className }: { reloj: RelojDeDatos; respaldo: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const ultimo = useRef(int(respaldo))
  useEffect(() => reloj.alCuadro((c) => {
    const el = ref.current
    if (!el) return
    const t = int(c.valor ?? respaldo)
    if (t !== ultimo.current) { ultimo.current = t; el.textContent = t }
  }), [reloj, respaldo])
  return <span ref={ref} className={className}>{int(respaldo)}</span>
}

/**
 * La fila de la cifra grande con «N % de la meta» y la barra de avance: el texto cambia solo con el entero y la
 * barra con `scaleX` (transform). Sin meta, solo la cifra.
 */
function PiezasVivas({ reloj, respaldo, meta, cuota }: { reloj: RelojDeDatos; respaldo: number; meta: number | null; cuota: number | null }) {
  const pctRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const ultimo = useRef('')
  useEffect(() => {
    if (!meta) return
    return reloj.alCuadro((c) => {
      const v = c.valor ?? respaldo
      if (barRef.current) barRef.current.style.transform = `scaleX(${acota(v / meta, 0, 1)})`
      const t = `${Math.floor((v / meta) * 100)} %`
      if (pctRef.current && t !== ultimo.current) { ultimo.current = t; pctRef.current.textContent = t }
    })
  }, [reloj, respaldo, meta])
  return (
    <>
      <div className="mt-1 flex items-baseline gap-2.5">
        <CifraViva reloj={reloj} respaldo={respaldo} className="eje-big tabular-nums" />
        <span className="eje-u">pz</span>
        {meta ? <span className="eje-fn ml-auto"><b ref={pctRef} className="font-semibold tabular-nums text-foreground">{Math.floor((respaldo / meta) * 100)} %</b> de {int(meta)}</span> : null}
      </div>
      {meta ? (
        <div className="eje-pista" aria-hidden>
          <div ref={barRef} className="eje-pista-llena" style={{ transform: `scaleX(${acota(respaldo / meta, 0, 1)})` }} />
          {cuota != null && cuota > 0 && <i className="eje-pista-marca" style={{ left: `${acota(cuota / meta, 0, 1) * 100}%` }} />}
        </div>
      ) : null}
    </>
  )
}

// ── El lienzo ────────────────────────────────────────────────────────────────

interface Modelo {
  w: number
  h: number
  compacto: boolean
  d: Diseno
  iniMs: number
  totalMin: number
  end: number
  yMax: number
  paso: number
  n: number
  offsetMin: number
  suma: number[]
  esperadoLinea: number | null
  maquinas: Array<{ id: string; nombre: string; esperado: number | null; cycles: number[]; pct: number | null; ultimoLlenado: number | null }>
  trazo: Punto[]
  previa: Punto | null
  ultima: Punto
  proy: ReturnType<typeof proyeccion>
  detenida: boolean
  cierre: number | null
  meta: number | null
  objetivo: Punto[]
  cuota: { piezas: number; hora: string | null } | null
  previo: { label: string; v: number } | null
  paradas: ParadaEje[]
  barraNueva: boolean
  cerrado: boolean
  unidad: 'carros' | 'silletas' | null
}

interface Geo { x: (m: number) => number; y: (v: number) => number }

/** El SVG se rehace una vez por lectura; entre lecturas solo se mueven `clip`, `punta` y `proy` por transform. */
const EjeSvg = memo(function EjeSvg({ m, reloj, uid }: { m: Modelo; reloj: RelojDeDatos; uid: string }) {
  const { d, end, yMax, paso, ultima, previa } = m
  const W = d.plotW
  const x = (min: number) => d.pl + (min / end) * W
  const y = (v: number) => d.curva.y0 + (1 - v / yMax) * d.curva.h
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
    const f = c.frac
    const min = p ? p.min + (u.min - p.min) * f : u.min
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

  const marcas: number[] = []
  const pm = pasoMarcas(end)
  for (let t = 0; t <= end; t += pm) marcas.push(t)
  const ticksY: number[] = []
  for (let v = 0; v <= yMax; v += paso) ticksY.push(v)

  // Barras por minuto: un trazo por tono (4 nodos, no 450); la barra NUEVA va aparte para animarla.
  const bw = Math.max(1.2, W / end - 1)
  const maxBarra = Math.max(m.esperadoLinea ?? 0, ...m.suma, 10) * 1.15
  const topBarra = Math.ceil(maxBarra / 10) * 10
  const yb = (v: number) => d.barras.y0 + d.barras.h - (v / topBarra) * d.barras.h
  const porTono: Record<TonoRitmo, string> = { bien: '', atento: '', mal: '', sin: '' }
  const nuevas: Array<{ x: number; y: number; h: number; tono: TonoRitmo }> = []
  m.suma.forEach((v, k) => {
    const mm = m.offsetMin + k
    if (mm >= end) return
    const tono = tonoRitmo(v, m.esperadoLinea)
    const px = r1(x(mm + 0.5) - bw / 2)
    const py = r1(yb(Math.max(v, 0.6)))
    const ph = r1(d.barras.y0 + d.barras.h - py)
    if (m.barraNueva && k === m.suma.length - 1) { nuevas.push({ x: px, y: py, h: ph, tono }); return }
    porTono[tono] += `M${px} ${py}h${r1(bw)}v${ph}h${-r1(bw)}z`
  })

  const carrilW = Math.max(1, W / end - 0.8)
  const rejas = ticksY.map((v) => r1(y(v)))

  // Paradas: las programadas debajo, Mantención arriba de todo.
  const ordenParadas = [...m.paradas.filter((p) => p.desdeMin < end)].sort((a, b) => ORDEN_DUENO[a.dueno] - ORDEN_DUENO[b.dueno])
  const hayParadas = ordenParadas.length > 0
  const minParadas = m.paradas.filter((p) => p.dueno !== 'programado').reduce((a, p) => a + (p.hastaMin - p.desdeMin), 0)
  const nParadas = m.paradas.filter((p) => p.dueno !== 'programado').length
  const finProy = m.proy?.hasta
  const py = finProy ? y(finProy.v) : 0
  const gap = m.cuota ? ultima.v - m.cuota.piezas : null
  const compacto = m.compacto
  const idTrama = `${uid}trama`
  const idClip = `${uid}clip`

  return (
    <svg width={m.w} height={m.h} viewBox={`0 0 ${m.w} ${m.h}`} className="absolute inset-0 block overflow-visible" aria-hidden>
      <defs>
        <pattern id={idTrama} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="var(--v2-mant)" />
          <rect width="2.4" height="6" fill="rgb(0 0 0 / 0.42)" />
        </pattern>
        <clipPath id={idClip}>
          <rect ref={clipRef} x={-m.w} y={0} width={m.w} height={m.h} transform={`translate(${r1(x(ultima.min))} 0)`} />
        </clipPath>
        <linearGradient id={`${uid}area`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--v2-acento)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--v2-acento)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Rejilla y eje Y del acumulado */}
      {ticksY.map((v, i) => (
        <g key={v}>
          <line x1={d.pl} x2={d.pl + W} y1={rejas[i]} y2={rejas[i]} stroke="var(--v2-reja)" />
          <text x={d.pl - 8} y={r1(y(v) + 4)} textAnchor="end" fontSize={12} className="fill-muted-foreground tabular-nums">{int(v)}</text>
        </g>
      ))}
      {m.meta != null && m.meta <= yMax && (
        <g>
          <line x1={d.pl} x2={d.pl + W} y1={r1(y(m.meta))} y2={r1(y(m.meta))} stroke="var(--v2-gris)" strokeDasharray="2 4" />
          <text x={d.pl + 6} y={r1(y(m.meta) - 6)} fontSize={12} fontWeight={600} className="fill-foreground tabular-nums">meta {int(m.meta)}</text>
        </g>
      )}
      {m.meta != null && m.meta > yMax && (
        <text x={d.pl + 6} y={d.pt + 12} fontSize={12} fontWeight={600} className="fill-foreground tabular-nums">meta {int(m.meta)} al cierre, más arriba ↑</text>
      )}
      {/* Eje X compartido por todo el lienzo */}
      {marcas.map((t) => (
        <g key={t}>
          <line x1={r1(x(t))} x2={r1(x(t))} y1={d.pt} y2={d.ejeX - 12} stroke="var(--v2-reja)" />
          <text x={r1(x(t))} y={d.ejeX} textAnchor="middle" fontSize={12} className="fill-muted-foreground tabular-nums">{relojDe(m.iniMs + t * 60_000)}</text>
        </g>
      ))}
      {end >= m.totalMin && !marcas.includes(m.totalMin) && (
        <text x={r1(x(m.totalMin))} y={d.ejeX} textAnchor="middle" fontSize={12} className="fill-muted-foreground tabular-nums">{relojDe(m.iniMs + m.totalMin * 60_000)}</text>
      )}

      {/* Ritmo de la meta y el turno de comparación a esta hora */}
      {m.objetivo.length > 1 && (
        <polyline points={m.objetivo.map((p) => `${r1(x(p.min))},${r1(y(p.v))}`).join(' ')} fill="none" stroke="var(--v2-tenue)" strokeWidth={1.5} strokeDasharray="6 5" />
      )}
      {m.previo && (
        <g>
          <circle cx={r1(x(ultima.min))} cy={r1(y(m.previo.v))} r={4} fill="none" stroke="var(--v2-secundaria)" strokeWidth={1.5} />
          <text x={r1(x(ultima.min) + 8)} y={r1(y(m.previo.v) + 16)} fontSize={12} className="fill-muted-foreground tabular-nums">{m.previo.label}: {int(m.previo.v)}</text>
        </g>
      )}

      {/* Hoy: área y trazo, revelados por el clip que avanza con el reloj de datos */}
      <g clipPath={`url(#${idClip})`}>
        <polygon points={`${r1(x(0))},${r1(y(0))} ${m.trazo.map((p) => `${r1(x(p.min))},${r1(y(p.v))}`).join(' ')} ${r1(x(ultima.min))},${r1(y(0))}`} fill={`url(#${uid}area)`} />
        <polyline points={m.trazo.map((p) => `${r1(x(p.min))},${r1(y(p.v))}`).join(' ')} fill="none" stroke="var(--v2-acento)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      </g>

      {/* Proyección punteada, tenue: de la punta al final del eje. Detenida: plana y más apagada. */}
      {m.proy && finProy && (
        <g key={`${ultima.min}-${ultima.v}`} className="eje-aparece" opacity={m.detenida ? 0.45 : 1}>
          <line
            ref={proyRef}
            x1={0} y1={0} x2={1} y2={0}
            vectorEffect="non-scaling-stroke"
            stroke="var(--v2-acento)" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="3 5"
            transform={`matrix(${r1(x(finProy.min) - x(ultima.min))} ${r1(py - y(ultima.v))} 0 1 ${r1(x(ultima.min))} ${r1(y(ultima.v))})`}
          />
          <circle cx={r1(x(finProy.min))} cy={r1(py)} r={4} fill="rgb(var(--background))" stroke="var(--v2-acento)" strokeWidth={1.5} />
          {m.detenida ? (
            <>
              <text x={r1(x(finProy.min) + 8)} y={r1(py - 8)} fontSize={12} style={{ fill: 'var(--v2-mal-texto)' }}>detenida</text>
              <text x={r1(x(finProy.min) + 8)} y={r1(py + 8)} fontSize={12} fontWeight={600} className="fill-foreground">proyección en pausa</text>
            </>
          ) : (
            <>
              <text x={r1(x(finProy.min) + 8)} y={r1(py - 8)} fontSize={12} className="fill-muted-foreground tabular-nums">{m.proy.alCierre ? 'al cierre' : `a las ${relojDe(m.iniMs + end * 60_000)}`}</text>
              <text x={r1(x(finProy.min) + 8)} y={r1(py + 8)} fontSize={12} fontWeight={600} className="fill-foreground tabular-nums">{int(finProy.v)} pz</text>
              {!m.proy.alCierre && m.cierre != null && (
                <text x={r1(x(finProy.min) + 8)} y={r1(py + 24)} fontSize={12} className="fill-muted-foreground tabular-nums">al cierre {int(m.cierre)} →</text>
              )}
            </>
          )}
        </g>
      )}

      {/* Brecha contra el ritmo de la meta, a esta hora */}
      {m.cuota && gap != null && !m.cerrado && (
        <g className="eje-aparece" key={`brecha-${ultima.v}`}>
          <line x1={r1(x(ultima.min) + 14)} x2={r1(x(ultima.min) + 14)} y1={r1(y(ultima.v))} y2={r1(y(m.cuota.piezas))} stroke={gap < 0 ? 'var(--v2-mal)' : 'var(--v2-bien)'} strokeWidth={1.5} />
          <text x={r1(x(ultima.min) + 20)} y={r1((y(ultima.v) + y(m.cuota.piezas)) / 2 + 4)} fontSize={12} fontWeight={600} className="tabular-nums" style={{ fill: gap < 0 ? 'var(--v2-mal-texto)' : 'var(--v2-bien)' }}>
            {firmado(gap)} vs ritmo de la meta
          </text>
        </g>
      )}

      {/* Punta de la curva: parte en la lectura anterior y se traslada hasta la última */}
      <g ref={puntaRef} transform="translate(0 0)">
        <circle cx={r1(x((previa ?? ultima).min))} cy={r1(y((previa ?? ultima).v))} r={10} fill="var(--v2-acento)" fillOpacity={0.22} />
        <circle cx={r1(x((previa ?? ultima).min))} cy={r1(y((previa ?? ultima).v))} r={4.5} fill="var(--v2-acento)" stroke="rgb(var(--background))" strokeWidth={2} />
      </g>

      {/* Barras por minuto de la línea */}
      <text x={d.pl - 8} y={r1(d.barras.y0 + 10)} textAnchor="end" fontSize={12} className="fill-muted-foreground">pz/min</text>
      <text x={d.pl - 8} y={r1(d.barras.y0 + d.barras.h)} textAnchor="end" fontSize={12} className="fill-muted-foreground tabular-nums">0</text>
      {m.esperadoLinea != null && (
        <g>
          <line x1={d.pl} x2={d.pl + W} y1={r1(yb(m.esperadoLinea))} y2={r1(yb(m.esperadoLinea))} stroke="var(--v2-tenue)" strokeDasharray="2 3" />
          <text x={d.pl + W + 8} y={r1(yb(m.esperadoLinea) + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">esperado {int(m.esperadoLinea)}</text>
        </g>
      )}
      <text x={d.pl + W + 8} y={r1(d.barras.y0 + d.barras.h - 2)} fontSize={12} className="fill-muted-foreground">línea · por minuto</text>
      {(['bien', 'atento', 'mal', 'sin'] as const).map((t) => porTono[t] && <path key={t} d={porTono[t]} fill={COLOR_TONO[t]} />)}
      {nuevas.map((q) => (
        <rect key={`n-${m.suma.length}`} className="eje-barra-nueva" x={q.x} y={q.y} width={r1(bw)} height={q.h} fill={COLOR_TONO[q.tono]} />
      ))}

      {/* Una franja por Baader: color minuto a minuto, % a ritmo al final */}
      {m.maquinas.map((q, i) => {
        const c = d.carriles[i]
        if (!c) return null
        const tonos: Record<TonoRitmo, string> = { bien: '', atento: '', mal: '', sin: '' }
        q.cycles.slice(0, m.n).forEach((v, k) => {
          const mm = m.offsetMin + k
          if (mm >= end) return
          tonos[tonoRitmo(v, q.esperado)] += `M${r1(x(mm) + 0.3)} ${r1(c.y0)}h${r1(carrilW)}v${c.h}h${-r1(carrilW)}z`
        })
        const cola = !compacto && q.ultimoLlenado != null && m.unidad ? ` · ${q.ultimoLlenado} % ${m.unidad}` : ''
        return (
          <g key={q.id}>
            <text x={d.pl - 8} y={r1(c.y0 + c.h / 2 + 4)} textAnchor="end" fontSize={12} className="fill-foreground">{etiquetaMaquina(q.nombre)}</text>
            <rect x={d.pl} y={c.y0} width={W} height={c.h} rx={compacto ? 4 : 6} fill="rgb(142 142 147 / 0.06)" />
            {(['bien', 'atento', 'mal'] as const).map((t) => tonos[t] && <path key={t} d={tonos[t]} fill={COLOR_TONO[t]} fillOpacity={0.9} />)}
            <text x={d.pl + W + 8} y={r1(c.y0 + c.h / 2 + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">{q.pct != null ? `${q.pct} % a ritmo` : 'sin esperado'}{cola}</text>
          </g>
        )
      })}

      {/* Paradas por dueño. Mantención lleva trama además del ámbar: el 50–75 % de arriba no lleva. */}
      <g>
        <text x={d.pl - 8} y={r1(d.paradas.y0 + d.paradas.h / 2 + 4)} textAnchor="end" fontSize={12} className="fill-foreground">paradas</text>
        <rect x={d.pl} y={d.paradas.y0} width={W} height={d.paradas.h} rx={compacto ? 5 : 8} fill="rgb(142 142 147 / 0.06)" />
        {ordenParadas.map((p, i) => {
          const x0 = x(Math.max(0, p.desdeMin))
          const ww = Math.max(3, x(Math.min(end, p.hastaMin)) - x0)
          const ry = d.paradas.y0 + 4
          const hh = d.paradas.h - 8
          if (p.dueno === 'programado') return <rect key={i} x={r1(x0)} y={ry} width={r1(ww)} height={hh} rx={3} fill="none" stroke="var(--v2-gris)" strokeDasharray="3 3" />
          if (p.dueno === 'mantencion') return <rect key={i} x={r1(x0)} y={ry} width={r1(ww)} height={hh} rx={3} fill={`url(#${idTrama})`} stroke="var(--v2-mant)" strokeWidth={1.5} />
          return <rect key={i} x={r1(x0)} y={ry} width={r1(ww)} height={hh} rx={3} fill={RELLENO_DUENO[p.dueno]} />
        })}
        <text x={d.pl + W + 8} y={r1(d.paradas.y0 + d.paradas.h / 2 + 4)} fontSize={12} className="fill-muted-foreground tabular-nums">
          {hayParadas || nParadas > 0 ? `${nParadas} ${nParadas === 1 ? 'parada' : 'paradas'} · ${horasMin(minParadas)}` : 'sin paradas'}
        </text>
      </g>

      {/* «Ahora»: una sola raya que cruza todo el lienzo */}
      <line x1={r1(x(ultima.min))} x2={r1(x(ultima.min))} y1={d.pt} y2={d.ejeX - 12} stroke="rgb(var(--foreground) / 0.22)" strokeDasharray="1 3" />
    </svg>
  )
})

const ORDEN_DUENO: Record<ParadaEje['dueno'], number> = { programado: 0, 'sin-imputar': 1, externo: 2, mantencion: 3 }

function Lienzo({ p, e, reloj, detenida }: { p: MonitorV2Props; e: EjeDatos; reloj: RelojDeDatos; detenida: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [ref, { w, h }] = useTamano()
  const [cursor, setCursor] = useState<number | null>(null)
  const nPrev = useRef<number | null>(null)

  const modelo = useMemo<Modelo | null>(() => {
    if (w < 200 || h < 200) return null
    const cuadro = reloj.cuadro()
    const totalMin = (e.finMs - e.iniMs) / 60_000
    if (!(totalMin > 0)) return null
    const minuto = e.minuto
    const n = minuto ? minutosVisibles(minuto.maquinas, p.cerrado) : 0
    const offsetMin = minuto ? Math.round((Date.parse(minuto.desde) - e.iniMs) / 60_000) : 0
    const suma = minuto ? sumaPorMinuto(minuto.maquinas, n) : []
    const ult = cuadro.ultima
    const min0 = ult?.atMs != null ? (ult.atMs - e.iniMs) / 60_000 : minuto ? offsetMin + n : 0
    const ultima: Punto = { min: acota(min0, 0, totalMin), v: ult?.valor ?? p.piezas }
    const pr = cuadro.previa
    const previaMin = pr?.atMs != null ? acota((pr.atMs - e.iniMs) / 60_000, 0, totalMin) : null
    const previa: Punto | null = pr && previaMin != null && previaMin < ultima.min ? { min: previaMin, v: pr.valor } : null

    let acum: number[]
    if (minuto && n > 0) {
      acum = [...Array(Math.max(0, offsetMin)).fill(0) as number[], ...acumulado(suma)]
    } else if (p.curva) {
      const base = e.primeraPiezaMs != null ? (e.primeraPiezaMs - e.iniMs) / 60_000 : 0
      const hoy = [{ min: 0, v: 0 }, ...p.curva.hoy.map((q) => ({ min: q.minutes + base, v: q.pieces }))]
      acum = Array.from({ length: Math.ceil(ultima.min) + 1 }, (_, i) => valorEnCurva(hoy, i) ?? 0)
    } else {
      acum = [0]
    }
    const trazo = trazoHastaLectura(acum, previa, ultima)

    const end = p.cerrado ? totalMin : finDelEje(ultima.min, totalMin)
    const cierre = p.cerrado ? null : p.proyeccion
    const proy = p.cerrado ? null : proyeccion({ punta: ultima, finEje: end, totalMin, cierre, detenida })

    const baseObj = e.primeraPiezaMs != null ? (e.primeraPiezaMs - e.iniMs) / 60_000 : 0
    const objFull: Punto[] = p.curva?.objetivo ? [{ min: 0, v: 0 }, ...p.curva.objetivo.map((q) => ({ min: q.minutes + baseObj, v: q.pieces }))] : []
    const objetivo: Punto[] = []
    if (objFull.length > 1) {
      for (let t = 0; t < end; t += 5) { const v = valorEnCurva(objFull, t); if (v != null) objetivo.push({ min: t, v }) }
      const vf = valorEnCurva(objFull, end); if (vf != null) objetivo.push({ min: end, v: vf })
    }

    const previoCurva = p.curva?.previo
    const vPrev = previoCurva ? valorEnCurva(previoCurva.curve.map((q) => ({ min: q.minutes + baseObj, v: q.pieces })), ultima.min) : null
    const previo = previoCurva && vPrev != null ? { label: previoCurva.label, v: vPrev } : null

    const tope = Math.max(objetivo[objetivo.length - 1]?.v ?? 0, proy?.hasta.v ?? 0, ultima.v, vPrev ?? 0, end >= totalMin ? (p.meta ?? 0) : 0)
    const { max: yMax, paso } = escalaY(tope)

    const maqs = (minuto?.maquinas ?? []).map((q) => ({
      id: q.id,
      nombre: q.nombre,
      esperado: q.esperado,
      cycles: q.cycles,
      pct: pctARitmo(q.cycles.slice(0, n), q.esperado),
      ultimoLlenado: e.llenado?.find((l) => l.id === q.id)?.ultimo ?? null,
    }))
    const esperadoLinea = minuto && minuto.maquinas.length > 0 && minuto.maquinas.every((q) => q.esperado != null) ? minuto.maquinas.reduce((a, q) => a + (q.esperado ?? 0), 0) : null
    const compacto = w < 1000 || h < 700
    const d = disenar(w, h, maqs.length, compacto)
    const barraNueva = nPrev.current != null && n > nPrev.current
    return {
      w, h, compacto, d, iniMs: e.iniMs, totalMin, end, yMax, paso, n, offsetMin, suma, esperadoLinea, maquinas: maqs, trazo, previa, ultima, proy,
      detenida, cierre, meta: p.meta, objetivo, cuota: p.cuota ?? null, previo, paradas: e.paradas, barraNueva, cerrado: p.cerrado, unidad: e.unidad,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se rehace con cada lectura (`reloj.version`) y con los datos del turno
  }, [w, h, e, p.piezas, p.proyeccion, p.meta, p.cuota, p.curva, p.cerrado, detenida, reloj.version])
  useEffect(() => { nPrev.current = modelo?.n ?? nPrev.current })

  // Globo con el detalle del minuto bajo el mouse
  const leer = (min: number) => {
    if (!modelo) return null
    const m = modelo
    const k = Math.floor(min - m.offsetMin)
    const enSerie = k >= 0 && k < m.n
    const acum = min <= m.ultima.min ? valorEnCurva(m.trazo, min) : m.proy ? valorEnCurva([m.proy.desde, m.proy.hasta], min) : null
    return {
      hora: relojDe(m.iniMs + min * 60_000),
      acum,
      futuro: min > m.ultima.min,
      linea: enSerie ? m.suma[k]! : null,
      maquinas: enSerie ? m.maquinas.map((q) => ({ nombre: etiquetaMaquina(q.nombre), v: q.cycles[k] ?? 0, esperado: q.esperado })) : [],
      parada: paradaEn(m.paradas, min),
    }
  }
  const mover = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!modelo || ev.pointerType !== 'mouse') return
    const r = ev.currentTarget.getBoundingClientRect()
    const min = ((ev.clientX - r.left - modelo.d.pl) / modelo.d.plotW) * modelo.end
    setCursor(min >= 0 && min <= modelo.end ? min : null)
  }
  const info = cursor != null ? leer(cursor) : null
  const cursorX = modelo && cursor != null ? modelo.d.pl + (cursor / modelo.end) * modelo.d.plotW : 0

  const resumen = `Piezas acumuladas del turno: ${int(p.piezas)}${p.meta ? ` de ${int(p.meta)}` : ''}${p.proyeccion != null && !p.cerrado ? `, al cierre ${int(p.proyeccion)}` : ''}. Debajo, el ritmo por minuto, cada Baader y las paradas en las mismas horas.`

  return (
    <section className="v2-tarjeta eje-lienzo flex min-h-0 min-w-0 flex-col rounded-card p-5" aria-label="El turno en un solo eje">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-[17px] font-semibold leading-[22px] text-foreground">El turno en un solo eje</h3>
        <span className="eje-sub text-[13px] leading-[18px] text-muted-foreground">{relojDe(e.iniMs)} → {relojDe(e.finMs)} · acumulado, ritmo por minuto, cada Baader y paradas comparten el mismo tiempo</span>
        <div className="ml-auto flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] leading-4 text-muted-foreground">
          <Leyenda trazo="linea" color="var(--v2-bien)" rotulo="hoy" />
          <Leyenda trazo="rayas" color="var(--v2-tenue)" rotulo="ritmo de la meta" />
          <Leyenda trazo="puntos" color="var(--v2-bien)" rotulo="proyección" />
          <Leyenda trazo="cuadro" color="var(--v2-bien)" rotulo="≥ 75 %" />
          <Leyenda trazo="cuadro" color="var(--v2-atento)" rotulo="50–75" />
          <Leyenda trazo="cuadro" color="var(--v2-mal)" rotulo="< 50 del esperado" />
          <Leyenda trazo="cuadro" color={TRAMA_MANT} rotulo="Mantención" />
          <Leyenda trazo="cuadro" color="var(--v2-ext)" rotulo="Externo" />
          <Leyenda trazo="cuadro" color="var(--v2-gris)" rotulo="Sin imputar" />
          <Leyenda trazo="contorno" color="var(--v2-gris)" rotulo="Programada" />
        </div>
      </div>
      <div ref={ref} className="relative mt-2 min-h-0 flex-1" role="img" aria-label={resumen} onPointerMove={mover} onPointerLeave={() => setCursor(null)}>
        {modelo && <EjeSvg m={modelo} reloj={reloj} uid={uid} />}
        {modelo && info && (
          <>
            <span className="pointer-events-none absolute w-px" style={{ left: cursorX, top: modelo.d.pt, height: modelo.d.ejeX - 12 - modelo.d.pt, background: 'var(--v2-tenue)' }} />
            <div
              className="v2-tip pointer-events-none absolute z-10 whitespace-nowrap rounded-ctl px-3 py-2 text-[13px] leading-snug"
              style={{ left: acota(cursorX + 14, 0, Math.max(0, modelo.w - 250)), top: modelo.d.pt + 6 }}
            >
              <div className="font-medium tabular-nums text-foreground">{info.hora}</div>
              {info.acum != null && <div className="tabular-nums text-foreground">{info.futuro ? 'proyección ' : 'acumulado '}<b className="font-semibold">{int(info.acum)} pz</b></div>}
              {info.linea != null && <div className="tabular-nums text-muted-foreground">línea {int(info.linea)} pz/min{modelo.esperadoLinea != null ? ` de ${int(modelo.esperadoLinea)}` : ''}</div>}
              {info.maquinas.map((q) => (
                <div key={q.nombre} className="tabular-nums text-muted-foreground">{q.nombre} {int(q.v)}{q.esperado != null ? ` de ${int(q.esperado)}` : ''}</div>
              ))}
              {info.parada && (
                <div className="tabular-nums text-foreground">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-[2px] align-middle" style={{ background: info.parada.dueno === 'mantencion' ? TRAMA_MANT : RELLENO_DUENO[info.parada.dueno] }} />
                  {info.parada.causa} · {horasMin(info.parada.hastaMin - info.parada.desdeMin)}{info.parada.maquina ? ` · ${info.parada.maquina}` : ''}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function Leyenda({ trazo, color, rotulo }: { trazo: 'linea' | 'rayas' | 'puntos' | 'cuadro' | 'contorno'; color: string; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {trazo === 'linea' && <i className="h-[3px] w-3.5 rounded-full" style={{ background: color }} />}
      {trazo === 'rayas' && <i className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: color }} />}
      {trazo === 'puntos' && <i className="h-0 w-3.5 border-t-2 border-dotted" style={{ borderColor: color }} />}
      {trazo === 'cuadro' && <i className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />}
      {trazo === 'contorno' && <i className="h-[9px] w-[9px] rounded-[3px] border border-dashed" style={{ borderColor: color }} />}
      {rotulo}
    </span>
  )
}

// ── El riel de cifras ────────────────────────────────────────────────────────

function Tocable({ onAbrir, etiqueta, className, children }: { onAbrir: () => void; etiqueta: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${etiqueta}: ver detalle`}
      className={`eje-tocable ${className ?? ''}`}
      onClick={onAbrir}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onAbrir() } }}
    >
      {children}
    </div>
  )
}

function Riel({ p, reloj, detenida, ampliadoPiezas, cierreMostrado, abrir, e }: {
  p: MonitorV2Props
  reloj: RelojDeDatos
  detenida: boolean
  ampliadoPiezas: ReactNode
  cierreMostrado: number
  abrir: (k: 'cierre' | 'ritmo' | 'mant' | 'perdido') => void
  e: EjeDatos
}) {
  const heroRef = useRef<HTMLElement>(null)
  const [ampliada, setAmpliada] = useState(false)
  const reducido = useMovimientoReducido()
  const conProyeccion = !p.cerrado && p.proyeccion != null
  const cierreVsMeta = p.proyeccion != null && p.meta ? p.proyeccion - p.meta : null
  const metaVsHecho = p.meta != null ? p.piezas - p.meta : null
  const deltaMttr = p.mant?.mttr != null && p.mant.mttrPrevio != null ? p.mant.mttr - p.mant.mttrPrevio : null

  // Ritmo de la línea: la media reciente en grande y, sobre una escala, cómo se compara con el turno, lo necesario y el mejor turno.
  const ritmoGrande = p.ritmoInfo.recienteCpm ?? p.ritmoAhora ?? p.ritmo
  const ritmoSub = p.ritmoInfo.recienteCpm != null ? `media ${Math.round(p.ritmoInfo.recienteMin ?? 15)} min` : p.ritmoAhora != null ? 'ahora' : 'promedio andando'
  const minuto = e.minuto
  const nMin = minuto ? minutosVisibles(minuto.maquinas, p.cerrado) : 0
  const ultimoMin = minuto && nMin > 0 ? sumaPorMinuto(minuto.maquinas, nMin)[nMin - 1]! : null
  const esperadoLinea = minuto && minuto.maquinas.length > 0 && minuto.maquinas.every((q) => q.esperado != null) ? minuto.maquinas.reduce((a, q) => a + (q.esperado ?? 0), 0) : null
  const marcas = [
    { k: 'turno', v: p.ritmo },
    { k: 'necesario', v: p.ritmoNecesario },
    { k: 'mejor turno', v: p.ritmoInfo.mejorCpm },
  ].filter((q): q is { k: string; v: number } => q.v != null)
  const escalaRitmo = Math.max(ritmoGrande ?? 0, esperadoLinea ?? 0, ...marcas.map((q) => q.v), 1) * 1.08

  // Camino a la meta (resumen): lo que tocaba a esta hora contra lo hecho. El desglose por causa vive en su tarjeta, bajo el pliegue.
  const topeCamino = Math.max(p.cuota?.piezas ?? 0, p.piezas, 1)
  const totalPerdido = p.perdidas.reduce((a, q) => a + q.min, 0)
  const maxPerdido = Math.max(1, ...p.perdidas.map((q) => q.min))
  const irAlDesglose = () => document.querySelector('.v2-camino')?.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' })

  return (
    <section className="v2-tarjeta eje-riel flex min-h-0 min-w-0 flex-col rounded-card p-5" aria-label="Cifras del turno">
      <section ref={heroRef} className="eje-sec" aria-label={p.cerrado ? 'Piezas del turno' : 'Piezas ahora'}>
        <div className="flex items-baseline gap-2.5">
          <h3 className="eje-h3">{p.cerrado ? 'Piezas del turno' : 'Piezas ahora'}</h3>
          <span className="eje-sub text-[13px] leading-[18px] text-muted-foreground">{p.corteHora ? `Shoplogix ${p.corteHora}` : 'contador Shoplogix'}</span>
          <button type="button" onClick={() => setAmpliada((a) => !a)} aria-expanded={ampliada} aria-haspopup="dialog" aria-label="Ampliar Piezas ahora" className="v2-amp v2-amp-compacta tap-44 ml-auto">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            <span>Ampliar</span>
          </button>
        </div>
        <PiezasVivas reloj={reloj} respaldo={p.piezas} meta={p.meta && p.meta > 0 ? p.meta : null} cuota={p.cuota?.piezas ?? null} />
        {p.cuota && p.meta != null && <p className="eje-cap eje-x13 mt-1.5">raya blanca: las {int(p.cuota.piezas)} que tocaban{p.cuota.hora ? ` a las ${p.cuota.hora}` : ' a esta hora'}</p>}
        <CapaAmpliada abierta={ampliada} onCerrar={() => setAmpliada(false)} origen={heroRef} titulo={p.cerrado ? 'Piezas del turno' : 'Piezas ahora'} sub={p.curva ? 'acumulado del turno contra el ritmo de la meta' : undefined}>
          {ampliadoPiezas}
        </CapaAmpliada>
      </section>

      <div className="eje-par">
        <Tocable onAbrir={() => abrir('cierre')} etiqueta={conProyeccion ? 'Al cierre' : 'Meta del turno'} className="eje-sec">
          <h3 className="eje-h3">{conProyeccion ? 'Al cierre' : 'Meta del turno'}</h3>
          {conProyeccion ? (
            detenida
              ? <div className="mt-1"><span className="eje-mid tabular-nums">en pausa</span></div>
              : <div className="mt-1"><span className="eje-mid tabular-nums">{int(cierreMostrado)}</span></div>
          ) : (
            <div className="mt-1"><span className="eje-mid tabular-nums">{p.meta != null ? int(p.meta) : '—'}</span><span className="eje-u">pz</span></div>
          )}
          {conProyeccion && detenida && <Pill tone="neutral" className="mt-1 tabular-nums">línea detenida</Pill>}
          {conProyeccion && !detenida && cierreVsMeta != null && <Pill tone={cierreVsMeta >= 0 ? 'ok' : 'critical'} className="mt-1 tabular-nums">{firmado(cierreVsMeta)} vs meta</Pill>}
          {!conProyeccion && metaVsHecho != null && <Pill tone={metaVsHecho >= 0 ? 'ok' : 'critical'} className="mt-1 tabular-nums">{firmado(metaVsHecho)} vs meta</Pill>}
        </Tocable>
        <Tocable onAbrir={() => abrir('mant')} etiqueta="Mantención" className="eje-sec">
          <h3 className="eje-h3">Mantención</h3>
          <div className="mt-1"><span className="eje-mid tabular-nums">{p.mant ? p.mant.fallas : '—'}</span><span className="eje-u">{p.mant?.fallas === 1 ? 'falla' : 'fallas'}</span></div>
          <p className="eje-fn">
            {p.mant?.fallas && p.mant.mttr != null
              ? <>{dec(p.mant.mttr)} min por falla{deltaMttr != null && <span className="eje-x13"> · {deltaMttr <= 0 ? '' : '+'}{dec(deltaMttr).replace('-', '−')} vs previos</span>}</>
              : p.mant?.dispPct != null
                ? <>disponibilidad <b className="tabular-nums text-foreground">{dec(p.mant.dispPct)} %</b>{p.mant.mttrPrevio != null && <span className="eje-x13"> · previos {dec(p.mant.mttrPrevio)} min por falla</span>}</>
                : 'sin fallas de equipos'}
          </p>
        </Tocable>
      </div>

      <Tocable onAbrir={() => abrir('ritmo')} etiqueta="Ritmo de la línea" className="eje-sec">
        <div className="flex items-baseline gap-2.5">
          <h3 className="eje-h3">Ritmo de la línea</h3>
          <span className="eje-sub text-[13px] leading-[18px] text-muted-foreground">{ritmoSub}</span>
          {ultimoMin != null && esperadoLinea != null && <span className="eje-cap ml-auto whitespace-nowrap">último minuto <b className="tabular-nums text-foreground">{int(ultimoMin)}</b> de {int(esperadoLinea)}</span>}
        </div>
        <div className="mt-1 flex items-baseline gap-2.5"><span className="eje-mid tabular-nums">{ritmoGrande != null ? dec(ritmoGrande) : '—'}</span><span className="eje-u">pz/min</span></div>
        {ritmoGrande != null && (
          <div className="eje-escala" aria-hidden>
            <div className="eje-pista-llena" style={{ transform: `scaleX(${acota(ritmoGrande / escalaRitmo, 0, 1)})` }} />
            {marcas.map((q) => <i key={q.k} className="eje-escala-marca" style={{ left: `${acota(q.v / escalaRitmo, 0, 1) * 100}%` }} />)}
          </div>
        )}
        {marcas.length > 0 && <p className="eje-cap mt-1.5 tabular-nums">{marcas.map((q) => `${q.k} ${dec(q.v)}`).join(' · ')}</p>}
      </Tocable>

      <section className="eje-sec eje-camino" aria-label="Camino a la meta">
        <div className="flex items-baseline gap-2.5">
          <h3 className="eje-h3">Camino a la meta</h3>
          {p.meta != null && !p.cerrado && <span className="eje-sub text-[13px] leading-[18px] text-muted-foreground">por jugar {int(Math.max(0, p.meta - (p.cuota?.piezas ?? p.piezas)))} pz</span>}
        </div>
        <div className="mt-1.5 grid gap-1.5">
          {p.cuota && (
            <FilaCamino rotulo={`Tocaban${p.cuota.hora ? ` a las ${p.cuota.hora}` : ''}`} valor={p.cuota.piezas} tope={topeCamino} color="var(--v2-prog)" />
          )}
          <FilaCamino rotulo="Hechas" valor={p.piezas} tope={topeCamino} color="var(--v2-bien)" extra={p.cuota ? (p.piezas - p.cuota.piezas === 0 ? 'al día' : `${firmado(p.piezas - p.cuota.piezas)} pz`) : undefined} />
        </div>
        <button type="button" onClick={irAlDesglose} className="eje-enlace eje-x13">paradas y ritmo, pieza por pieza ↓</button>
      </section>

      <Tocable onAbrir={() => abrir('perdido')} etiqueta="Tiempo perdido" className="eje-sec">
        <div className="flex items-baseline gap-2.5">
          <h3 className="eje-h3">Tiempo perdido</h3>
          <span className="eje-sub text-[13px] leading-[18px] text-muted-foreground">min de línea, por dueño</span>
          <span className="ml-auto text-[17px] font-semibold tabular-nums text-foreground">{horasMin(totalPerdido)}</span>
        </div>
        <ul className="mt-2 grid gap-1.5">
          {p.perdidas.map((q) => (
            <li key={q.dueno} className="eje-fila-dueno">
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground">
                <i className="h-[9px] w-[9px] shrink-0 rounded-[3px]" style={{ background: q.dueno === 'mantencion' ? TRAMA_MANT : RELLENO_DUENO[q.dueno] }} />
                <span className="truncate">{NOMBRE_DUENO[q.dueno]}</span>
              </span>
              <span className="eje-barrita"><i style={{ width: `${q.min > 0 ? Math.max(3, (q.min / maxPerdido) * 100) : 0}%`, background: q.dueno === 'mantencion' ? TRAMA_MANT : RELLENO_DUENO[q.dueno] }} /></span>
              <b className="text-[13px] font-semibold tabular-nums text-foreground">{horasMin(q.min)}</b>
            </li>
          ))}
        </ul>
      </Tocable>
    </section>
  )
}

const NOMBRE_DUENO: Record<string, string> = { mantencion: 'Mantención', externo: 'Externo', 'sin-imputar': 'Sin imputar', programado: 'Programado' }

function FilaCamino({ rotulo, valor, tope, color, extra }: { rotulo: string; valor: number; tope: number; color: string; extra?: string }) {
  return (
    <div className="eje-fila-camino">
      <span className="truncate text-[13px] text-foreground">{rotulo}</span>
      <span className="eje-barrita"><i style={{ width: `${acota(valor / tope, 0, 1) * 100}%`, background: color }} /></span>
      <b className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-foreground">{int(valor)} pz{extra && <span className="ml-1.5 font-normal text-muted-foreground">{extra}</span>}</b>
    </div>
  )
}

// ── La vista ─────────────────────────────────────────────────────────────────

export function EjeTurnoPC({ p, reloj, ampliadoPiezas, cierreMostrado, abrir, banda }: {
  p: MonitorV2Props
  /** El reloj de datos del monitor: lo comparte con la cifra grande del celular. */
  reloj: RelojDeDatos
  ampliadoPiezas: ReactNode
  cierreMostrado: number
  abrir: (k: 'cierre' | 'ritmo' | 'mant' | 'perdido') => void
  banda: ReactNode
}) {
  const e = p.eje!
  /* Detenida: dos lecturas seguidas sin piezas, o el estado «detenida» que ya existe. Cerrado el turno, no aplica. */
  const detenida = !p.cerrado && (reloj.detenida || e.detenidaEstado)
  return (
    <div className="eje-pc">
      {banda}
      <div className="eje-vista">
        <Lienzo p={p} e={e} reloj={reloj} detenida={detenida} />
        <Riel p={p} reloj={reloj} detenida={detenida} ampliadoPiezas={ampliadoPiezas} cierreMostrado={cierreMostrado} abrir={abrir} e={e} />
      </div>
    </div>
  )
}
