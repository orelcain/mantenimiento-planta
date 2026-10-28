/**
 * «Duelo» en PC (≥ 1280 px) · opción B «Eje» (mockup del 28-10, PLAN_DUELO_EQUIPOS.md, 5b).
 *
 * Responde de una mirada en este orden: quién va ganando (riel de la derecha), dónde se ganó o perdió (la carrera y
 * los carriles por hora, KPI a KPI), por qué (paradas por dueño y micro por Baader) y la tendencia (semana a semana,
 * jornadas del mes). Una rama aparte por ancho: el celular y el PC angosto siguen con las tarjetas de siempre.
 *
 * Reglas del lienzo: Cárdenas SIEMPRE arriba y Rebolledo abajo en cada carril, el color de cada equipo es fijo, y el
 * color nunca va solo (nombre y total al final de cada curva, el nombre del equipo en cada carril, ganador nombrado en
 * la tabla). Mantención lleva trama además del ámbar.
 *
 * Claridad: nada de siglas sueltas. Cada rótulo dice qué mide y en qué unidad; cada cifra va pegada a su equipo y a su
 * unidad (sin saltos de línea que la partan); y cada rótulo, barra, parada, celda y fila tiene un globo de ayuda
 * (`GloboDuelo`: mouse, foco de teclado o toque) que explica qué es, cómo se cuenta y de quién es.
 *
 * Sin huecos: nada tiene alto fijo chico dentro de una tarjeta. Los gráficos son SVG del tamaño de su caja
 * (ResizeObserver), las listas reparten su alto con `repeat(n, minmax(0, 1fr))` y la tabla de jornadas calcula
 * cuántas filas caben. La fila de abajo tiene las dos tarjetas del mismo alto por construcción de la grilla.
 *
 * Movimiento («reloj de datos», DESIGN.md §8): con el turno en curso, la cifra y la punta de la curva avanzan en
 * línea recta entre dos lecturas REALES (`useRelojDeDatos`); lo que se mueve entre lecturas es un `transform`. El
 * resto del lienzo se redibuja una vez por lectura. Con `prefers-reduced-motion` salta a cada lectura.
 *
 * Toda la lógica de datos vive en `dueloDatosPC.ts` (probada); acá solo se ubica y se dibuja.
 */
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { duenoDe } from '@/services/shoplogix/monitorEventos'
import type { PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import { useTamano } from './ampliarHooks'
import { CifraViva } from './CifraViva'
import { TRAMA_MANT, escalaY } from './ejeTurno'
import type { Lectura } from './relojDeDatos'
import { useRelojDeDatos, type CuadroReloj, type RelojDeDatos } from './useRelojDeDatos'
import { useGloboDuelo } from './GloboDuelo'
import {
  TIPS_LEYENDA, dec, int, tipFilaJornada, tipFilaKpi, tipHora, tipMicro, tipMicroTotal, tipParada, tipParadasTotal, tipSost, tipsCarriles,
  type DuenoParada, type LadoHora,
} from './dueloTextos'
import {
  COLOR_EQUIPO, COLOR_EQUIPO_TEXTO, nombreCorto, piezasAlMinuto, textoCorreContraEstaCurva,
  type BandaRival, type DatosDuelo, type EquipoId, type NombresEquipos,
} from './duelo'
import {
  construirLados, construirPorQue, esperadoDeLinea, filasJornadas, filasRiel, filasSinRival, horasGanadas, maxMinutosEje,
  periodosRiel, puntajeRiel, semanasPC, escalaSemanas, sinProgramadas,
  type CausasLado, type DuenoPQ, type FilaRiel, type LadoEje, type PeriodoPQ, type SerieMinuto,
} from './dueloDatosPC'
import { etiquetaMaquina } from './ritmoVivo'

// ── Lo que la página le pasa ─────────────────────────────────────────────────

export interface DueloPCExtra {
  /** El turno que se mira. */
  live: PublicMonitorLive
  stats: readonly ShiftStat[]
  /** Serie minuto a minuto del turno que se mira (pulso o archivo). */
  serieHoy: SerieMinuto | null
  /** Series archivadas de los últimos turnos (el rival). */
  series: ReadonlyArray<SerieMinuto & { shiftDocId: string }> | null
  /** El contador de Shoplogix y las últimas lecturas: alimentan el reloj de datos del turno en curso. */
  lectura: Lectura | null
  semilla: number[]
}

export interface DueloPCProps {
  datos: DatosDuelo
  nombres: NombresEquipos
  unidad: 'carros' | 'silletas' | null
  /** Hora de planta (ms wall-as-UTC) de la primera pieza del turno que se mira. */
  inicioMs: number | null
  extra: DueloPCExtra
  /** Fila fina de arriba (selector de línea y avisos); sin nada, no hay fila. */
  superior?: ReactNode
}

// ── Utilidades ───────────────────────────────────────────────────────────────

const firmado = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`
const firmado1 = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${dec(Math.abs(n))}`
const r1 = (n: number) => Math.round(n * 10) / 10
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const fechaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`
const relojUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const EQ: readonly EquipoId[] = ['cardenas', 'rebolledo']

/** Pantalla chica del PC: el 1366 × 768 de las notebooks. Misma vara que usa «El turno» en PC. */
function useCompactoPC() {
  const q = '(max-width: 1599px), (max-height: 899px)'
  const [c, setC] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const f = () => setC(m.matches)
    f()
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return c
}

const FONDO_DUENO: Record<DuenoPQ, string> = {
  mic: 'var(--v2-gris)', sin: 'var(--v2-gris)', mant: TRAMA_MANT, ext: 'var(--v2-ext)', prog: 'transparent',
}

function Leyenda({ trazo, color, rotulo, tip }: { trazo: 'linea' | 'cuadro' | 'contorno' | 'banda'; color: string; rotulo: string; tip?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" {...(tip ? { 'data-tip': tip, tabIndex: 0 } : {})}>
      {trazo === 'linea' && <i className="h-[3px] w-3.5 rounded-full" style={{ background: color }} />}
      {trazo === 'cuadro' && <i className="h-[9px] w-[9px] rounded-[3px]" style={{ background: color }} />}
      {trazo === 'banda' && <i className="h-[9px] w-3.5 rounded-[3px]" style={{ background: color }} />}
      {trazo === 'contorno' && <i className="h-[9px] w-[9px] rounded-[3px] border border-dashed" style={{ borderColor: color }} />}
      {rotulo}
    </span>
  )
}

// ── El lienzo «Eje» ──────────────────────────────────────────────────────────

const GEO = {
  normal: { rit: 92, dif: 30, sost: 9, par: 13, mic: 18, eje: 20, g: 9, pl: 158, pr: 146 },
  compacto: { rit: 62, dif: 27, sost: 7, par: 10, mic: 14, eje: 16, g: 6, pl: 136, pr: 118 },
} as const

interface PuntoVivo { min: number; v: number }

interface ModeloEje {
  w: number
  h: number
  compacto: boolean
  L: (typeof GEO)['normal'] | (typeof GEO)['compacto']
  x0: number
  x1: number
  cH: number
  ejeMax: number
  yMax: number
  paso: number
  lados: Record<EquipoId, LadoEje | null>
  hoyEq: EquipoId
  esp: number | null
  banda: BandaRival | null
  gan: ReturnType<typeof horasGanadas>
  /** El turno en curso: su cabeza animada. */
  vivo: { eq: EquipoId; previa: PuntoVivo | null; ultima: PuntoVivo; reloj: string } | null
  textoRival: string | null
  hoyEnCurso: boolean
  /** «noche» o «día»: de qué horario es el promedio propio de la banda. */
  horarioBanda: string
  /** Nombre corto de cada equipo (para rótulos y globos). */
  nom: Record<EquipoId, string>
}

const LANES = (L: ModeloEje['L']) => L.g + L.rit + L.dif + L.g + (2 * L.sost + 3) + L.g + (2 * L.par + 3) + L.g + (2 * L.mic + 3) + L.eje

/** Pone la cabeza del turno en curso entre la lectura anterior y la última (el reloj de datos). */
const EjeSvg = memo(function EjeSvg({ m, reloj, uid, cursor }: { m: ModeloEje; reloj: RelojDeDatos; uid: string; cursor: number | null }) {
  const { w, h, L, x0, x1, cH, ejeMax, yMax, paso, lados, compacto, nom } = m
  const tips = tipsCarriles({ a: nom.cardenas, b: nom.rebolledo }, m.esp)
  /* Un grupo con globo: se enfoca con Tab, se explica con mouse o toque y lleva <title> de respaldo. */
  const tg = (key: string | number, tip: string, kids: ReactNode) => (
    <g key={key} data-tip={tip} tabIndex={0}>
      <title>{tip}</title>
      {kids}
    </g>
  )
  const ladoHora = (e: EquipoId, hh: number): LadoHora | null => {
    const l = lados[e]
    if (!l) return null
    const q = l.horas[hh]
    return { nombre: l.nombre, v: q?.v ?? null, parcial: Boolean(q?.parcial && l.enCurso) }
  }
  const x = (min: number) => x0 + (min / ejeMax) * (x1 - x0)
  const y = (v: number) => cH - 6 - (v / yMax) * (cH - 10)
  const geo = useRef({ x, y })
  geo.current = { x, y }
  const clipRef = useRef<SVGRectElement>(null)
  const puntaRef = useRef<SVGGElement>(null)
  const vivo = m.vivo

  const aplicar = (c: CuadroReloj) => {
    if (!vivo) return
    const g = geo.current
    const u = vivo.ultima
    const p = vivo.previa
    const f = c.frac
    const min = p ? p.min + (u.min - p.min) * f : u.min
    const v = c.valor != null && p ? c.valor : u.v
    const hx = g.x(min), hy = g.y(v)
    const ox = g.x((p ?? u).min), oy = g.y((p ?? u).v)
    clipRef.current?.setAttribute('transform', `translate(${r1(hx)} 0)`)
    puntaRef.current?.setAttribute('transform', `translate(${r1(hx - ox)} ${r1(hy - oy)})`)
  }
  /* Sin dependencias a propósito: se vuelve a suscribir en cada render para leer el modelo vigente. */
  useLayoutEffect(() => reloj.alCuadro(aplicar))

  const ends = EQ.map((e) => lados[e]).filter((l): l is LadoEje => l != null)
  const idTrama = `${uid}trama`
  const idClip = `${uid}clip`
  const ticksY: number[] = []
  for (let v = 0; v <= yMax; v += paso) ticksY.push(v)
  const nHoras = Math.floor(ejeMax / 60)
  const colW = x(60) - x(0)
  const fs = compacto ? 11 : 12

  // Curva de un lado: la del turno en curso lleva la cabeza (prefijo hasta la lectura anterior + recta real).
  const puntosCurva = (l: LadoEje): string => {
    let pts = l.curva.map((p) => ({ min: p.minutes, v: p.pieces }))
    if (vivo && vivo.eq === l.eq) {
      const corte = vivo.previa ? vivo.previa.min : vivo.ultima.min
      pts = pts.filter((p) => p.min < corte)
      if (vivo.previa) pts.push(vivo.previa)
      pts.push(vivo.ultima)
    }
    return [{ min: 0, v: 0 }, ...pts].map((p) => `${r1(x(p.min))},${r1(y(p.v))}`).join(' ')
  }

  // Franja entre las dos curvas, del color de quien va adelante, hasta donde ambas existen.
  const franja = (() => {
    const a = lados.cardenas, b = lados.rebolledo
    if (!a || !b) return []
    const hasta = Math.min(vivo ? vivo.ultima.min : a.finMin, b.enCurso && vivo ? vivo.ultima.min : b.finMin, a.enCurso ? (vivo?.ultima.min ?? a.finMin) : a.finMin)
    const out: Array<{ eq: EquipoId; pts: string }> = []
    let corr: { eq: EquipoId; up: string[]; dn: string[] } | null = null
    const cierra = () => { if (corr) { out.push({ eq: corr.eq, pts: [...corr.up, ...corr.dn.reverse()].join(' ') }); corr = null } }
    for (let mm = 0; mm < hasta; mm += 3) {
      const m2 = Math.min(hasta, mm + 3)
      const pa = piezasAlMinuto(a.curva, mm) ?? 0, pb = piezasAlMinuto(b.curva, mm) ?? 0
      const pa2 = piezasAlMinuto(a.curva, m2) ?? 0, pb2 = piezasAlMinuto(b.curva, m2) ?? 0
      const eq: EquipoId = pa + pa2 >= pb + pb2 ? 'cardenas' : 'rebolledo'
      if (corr && corr.eq !== eq) cierra()
      if (!corr) corr = { eq, up: [], dn: [] }
      corr.up.push(`${r1(x(mm))},${r1(y(Math.max(pa, pb)))}`, `${r1(x(m2))},${r1(y(Math.max(pa2, pb2)))}`)
      corr.dn.push(`${r1(x(mm))},${r1(y(Math.min(pa, pb)))}`, `${r1(x(m2))},${r1(y(Math.min(pa2, pb2)))}`)
    }
    cierra()
    return out
  })()

  // Etiquetas al final de cada curva (separadas si chocan).
  const etiquetas = (() => {
    const e = ends.map((l) => ({ l, yy: y(l.total), lx: l.enCurso && vivo ? x(vivo.ultima.min) + 14 : x1 + 8 }))
    if (e.length === 2 && Math.abs(e[0]!.yy - e[1]!.yy) < 34) {
      const [arriba, abajo] = e[0]!.yy <= e[1]!.yy ? [e[0]!, e[1]!] : [e[1]!, e[0]!]
      abajo.yy = arriba.yy + 34
    }
    return e
  })()

  // ── Carriles ───────────────────────────────────────────────────────────────
  let yy = cH + L.g
  const yRit = yy
  const rMax = Math.max(10, Math.ceil(Math.max(m.esp ?? 0, ...ends.flatMap((l) => l.horas.map((q) => q.v ?? 0))) * 1.15 / 10) * 10)
  const ry = (v: number) => yRit + L.rit - (v / rMax) * L.rit
  yy += L.rit
  const yDif = yy
  yy += L.dif + L.g
  const ySost = yy
  yy += 2 * L.sost + 3 + L.g
  const yPar = yy
  yy += 2 * L.par + 3 + L.g
  const yMic = yy
  const bw = Math.min(compacto ? 20 : 30, colW * 0.26)
  const rotuloCarril = (y0: number, alto: number, a: string, b: string | undefined, tip: string) => tg(`rot${a}`, tip, (
    <>
      <rect x={0} y={r1(y0 - 2)} width={x0 - 4} height={alto + 4} fill="transparent" />
      <text x={x0 - 10} y={r1(y0 + alto / 2 + (b ? -2 : 4))} textAnchor="end" fontSize={fs} fontWeight={600} className="fill-foreground">{a}</text>
      {b && <text x={x0 - 10} y={r1(y0 + alto / 2 + 12)} textAnchor="end" fontSize={11} className="fill-muted-foreground">{b}</text>}
    </>
  ))
  const colEq = (e: EquipoId) => ({ fill: COLOR_EQUIPO_TEXTO[e] })

  // Un carril con una fila por equipo: la fila vacía es un contorno punteado (el equipo que aún no juega).
  const FilaVacia = ({ y0, alto }: { y0: number; alto: number }) => (
    <rect x={x0} y={y0} width={x1 - x0} height={alto} rx={3} fill="none" stroke="var(--v2-reja)" strokeDasharray="3 3" />
  )

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 block overflow-visible">
      <defs>
        <pattern id={idTrama} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--v2-mant)" opacity="0.35" />
          <rect width="2.4" height="5" fill="var(--v2-mant)" />
        </pattern>
        <clipPath id={idClip}>
          <rect ref={clipRef} x={-w} y={0} width={w} height={h} transform={`translate(${vivo ? r1(x(vivo.ultima.min)) : w} 0)`} />
        </clipPath>
      </defs>

      {/* Rejilla de horas: cruza todo el lienzo; el rótulo de cada hora va abajo */}
      {Array.from({ length: nHoras + 1 }, (_, i) => (
        <g key={i}>
          <line x1={r1(x(i * 60))} x2={r1(x(i * 60))} y1={0} y2={h - L.eje + 2} stroke="var(--v2-reja)" />
          {i < nHoras && <text x={r1(x(i * 60 + 30))} y={h - 4} textAnchor="middle" fontSize={fs} className="fill-muted-foreground">{i + 1}.ª hora</text>}
        </g>
      ))}
      {ticksY.map((v) => (
        <g key={v}>
          <line x1={x0} x2={x1} y1={r1(y(v))} y2={r1(y(v))} stroke="var(--v2-reja)" />
          <text x={x0 - 8} y={r1(y(v) + 4)} textAnchor="end" fontSize={11} className="fill-muted-foreground tabular-nums">{v ? int(v) : '0'}{v === yMax ? ' piezas' : ''}</text>
        </g>
      ))}

      {/* La referencia propia (la noche que abre la jornada): su rango y su promedio */}
      {m.banda && (() => {
        const b = m.banda
        const up = b.max.map((p) => `${r1(x(p.minutes))},${r1(y(p.pieces))}`).join(' ')
        const dn = [...b.min].reverse().map((p) => `${r1(x(p.minutes))},${r1(y(p.pieces))}`).join(' ')
        const ult = b.media[b.media.length - 1]
        return (
          <g>
            <polygon points={`${up} ${dn}`} fill="var(--v2-relleno)" />
            <polyline points={b.media.map((p) => `${r1(x(p.minutes))},${r1(y(p.pieces))}`).join(' ')} fill="none" stroke="var(--v2-gris)" strokeWidth={1.5} strokeDasharray="4 4" />
            {ult && tg('banda', `Promedio de ${m.horarioBanda}: la línea punteada es su promedio en turnos anteriores del mismo horario y la franja gris es su rango, del mínimo al máximo. Termina en ${int(ult.pieces)} piezas.`, (
              <>
                <text x={r1(x1 + 8)} y={r1(y(ult.pieces) + 4)} fontSize={fs} className="fill-muted-foreground">{`promedio de ${m.horarioBanda}`}</text>
                <text x={r1(x1 + 8)} y={r1(y(ult.pieces) + 19)} fontSize={fs} fontWeight={600} className="fill-foreground tabular-nums">{int(ult.pieces)} piezas</text>
              </>
            ))}
          </g>
        )
      })()}

      {/* Franja entre las curvas */}
      {franja.map((f, i) => <polygon key={i} points={f.pts} fill={COLOR_EQUIPO[f.eq]} opacity={0.16} />)}

      {/* Curvas. La del turno en curso se revela con el clip que avanza con el reloj de datos. */}
      {ends.map((l) => {
        const enVivo = vivo?.eq === l.eq
        return (
          <polyline
            key={l.eq} points={puntosCurva(l)} fill="none" stroke={COLOR_EQUIPO[l.eq]} strokeWidth={!enVivo && m.hoyEnCurso ? 2 : 3}
            strokeLinejoin="round" strokeLinecap="round" opacity={!enVivo && m.hoyEnCurso ? 0.8 : 1} clipPath={enVivo ? `url(#${idClip})` : undefined}
          />
        )
      })}
      {vivo && (
        <g ref={puntaRef} transform="translate(0 0)">
          <circle cx={r1(x((vivo.previa ?? vivo.ultima).min))} cy={r1(y((vivo.previa ?? vivo.ultima).v))} r={9} fill={COLOR_EQUIPO[vivo.eq]} opacity={0.22} />
          <circle cx={r1(x((vivo.previa ?? vivo.ultima).min))} cy={r1(y((vivo.previa ?? vivo.ultima).v))} r={4.5} fill={COLOR_EQUIPO[vivo.eq]} stroke="rgb(var(--background))" strokeWidth={2} />
        </g>
      )}
      {etiquetas.map(({ l, yy: ey, lx }) => tg(l.eq, `${l.rotulo} · ${int(l.total)} piezas hechas${l.enCurso ? ' hasta ahora' : ' al cierre del turno'}`, (
        <>
          <text x={r1(lx)} y={r1(ey)} fontSize={compacto ? 12 : 13} fontWeight={600} {...colEq(l.eq)}>{l.nombre}</text>
          <text x={r1(lx)} y={r1(ey + 16)} fontSize={compacto ? 12 : 13} fontWeight={600} className="fill-foreground tabular-nums">{int(l.total)} piezas</text>
        </>
      )))}

      {/* Carril 1 · ritmo hora a hora: dos barras por hora, Cárdenas a la izquierda */}
      {rotuloCarril(yRit, L.rit, 'Ritmo por hora', compacto ? 'piezas por min' : 'piezas por minuto', tips.ritmo)}
      {m.esp != null && (
        <g>
          <line x1={x0} x2={x1} y1={r1(ry(m.esp))} y2={r1(ry(m.esp))} stroke="var(--v2-gris)" strokeDasharray="4 4" />
          {tg('esp', `Ritmo esperado de la línea: ${dec(m.esp)} piezas por minuto (suma de lo esperado de cada máquina).`, (
            <text x={x1 + 8} y={r1(ry(m.esp) + 4)} fontSize={11} className="fill-muted-foreground tabular-nums">esperado {dec(m.esp)} pz/min</text>
          ))}
          <line x1={x0} x2={x1} y1={r1(ry(m.esp * 0.9))} y2={r1(ry(m.esp * 0.9))} stroke="var(--v2-gris)" strokeDasharray="1 3" />
          {tg('esp90', `El 90 % de lo esperado: ${dec(m.esp * 0.9)} piezas por minuto. Un minuto a ese ritmo o más cuenta como minuto a buen ritmo.`, (
            <text x={x1 + 8} y={r1(ry(m.esp * 0.9) + 12)} fontSize={11} className="fill-muted-foreground tabular-nums">90 % · {dec(m.esp * 0.9)} pz/min</text>
          ))}
        </g>
      )}
      <line x1={x0} x2={x1} y1={yRit + L.rit} y2={yRit + L.rit} stroke="var(--v2-gris)" opacity={0.5} />
      {Array.from({ length: nHoras }, (_, hh) => {
        const cx = x(hh * 60 + 30)
        const la = ladoHora('cardenas', hh), lb = ladoHora('rebolledo', hh)
        if (la?.v == null && lb?.v == null) return null
        return tg(`rit${hh}`, tipHora(hh + 1, la, lb), (
          <>
            <rect x={r1(x(hh * 60))} y={yRit} width={r1(colW)} height={L.rit} fill="transparent" />
            {EQ.map((e, i) => {
              const l = lados[e]
              const q = l?.horas[hh]
              if (!l || !q || q.v == null) return null
              const bx = cx + (i ? 1 : -1) * (bw / 2 + 1) - bw / 2
              const top = ry(q.v)
              const parcial = q.parcial && l.enCurso
              return (
                <path
                  key={e}
                  d={`M${r1(bx)},${r1(yRit + L.rit)} V${r1(top + 4)} q0,-4 4,-4 h${r1(bw - 8)} q4,0 4,4 V${r1(yRit + L.rit)} Z`}
                  fill={COLOR_EQUIPO[e]} opacity={parcial ? 0.45 : 1}
                />
              )
            })}
          </>
        ))
      })}
      {m.textoRival && (
        <text x={r1(x(Math.min(ejeMax - 60, (Math.floor((ends[0]?.finMin ?? 0) / 60) + 1) * 60)) + 8)} y={r1(yRit + L.rit / 2)} fontSize={fs} className="fill-muted-foreground">{m.textoRival}</text>
      )}

      {/* Carril 2 · quién ganó cada hora */}
      {rotuloCarril(yDif, L.dif, compacto ? 'Ganó cada hora' : 'Quién ganó cada hora', undefined, tips.gano)}
      {m.gan.horas.map((q, hh) => {
        if (!q) return null
        const cx = r1(x(hh * 60 + 30))
        return tg(`gan${hh}`, tipHora(hh + 1, ladoHora('cardenas', hh), ladoHora('rebolledo', hh)), (
          <>
            <rect x={r1(x(hh * 60))} y={yDif} width={r1(colW)} height={L.dif} fill="transparent" />
            {q.ganador === 'empate'
              ? <text x={cx} y={r1(yDif + L.dif / 2 + 4)} textAnchor="middle" fontSize={fs} fontWeight={600} className="fill-muted-foreground">empate</text>
              : (
                <g opacity={q.cuenta ? 1 : 0.6}>
                  <text x={cx} y={r1(yDif + L.dif / 2 - 2)} textAnchor="middle" fontSize={fs} fontWeight={600} {...colEq(q.ganador)}>{nom[q.ganador]}</text>
                  <text x={cx} y={r1(yDif + L.dif / 2 + 11)} textAnchor="middle" fontSize={11} className="fill-foreground tabular-nums">{firmado1(q.dif)} pz/min</text>
                </g>
              )}
          </>
        ))
      })}
      {lados.cardenas && lados.rebolledo && tg('gt', `Horas ganadas: ${nom.cardenas} ${m.gan.cardenas}, ${nom.rebolledo} ${m.gan.rebolledo}. No cuentan los empates ni la hora que aún corre.`, (
        <>
          <text x={x1 + 8} y={r1(yDif + L.dif / 2 - 2)} fontSize={11} className="fill-muted-foreground tabular-nums"><tspan {...colEq('cardenas')} fontWeight={700}>{nom.cardenas}</tspan> {m.gan.cardenas} {m.gan.cardenas === 1 ? 'hora' : 'horas'}</text>
          <text x={x1 + 8} y={r1(yDif + L.dif / 2 + 11)} fontSize={11} className="fill-muted-foreground tabular-nums"><tspan {...colEq('rebolledo')} fontWeight={700}>{nom.rebolledo}</tspan> {m.gan.rebolledo} {m.gan.rebolledo === 1 ? 'hora' : 'horas'}</text>
        </>
      ))}

      {/* Carril 3 · minutos sostenidos a ≥ 90 % del esperado */}
      {rotuloCarril(ySost, 2 * L.sost + 3, compacto ? 'Buen ritmo' : 'Minutos a buen ritmo', compacto ? '≥ 90 % esperado' : '≥ 90 % de lo esperado', tips.sost)}
      {EQ.map((e, i) => {
        const l = lados[e]
        const y0 = ySost + i * (L.sost + 3)
        if (!l) return <FilaVacia key={e} y0={y0} alto={L.sost} />
        const runs: Array<[number, number]> = []
        for (const mm of l.sost?.minutos ?? []) {
          const u = runs[runs.length - 1]
          if (u && mm === u[1]) u[1] = mm + 1
          else runs.push([mm, mm + 1])
        }
        const fin = l.enCurso && vivo ? vivo.ultima.min : l.finMin
        return tg(`sost${e}`, tipSost(l.nombre, l.v90, m.esp), (
          <>
            <rect x={x0} y={y0} width={Math.max(0, r1(x(fin) - x0))} height={L.sost} rx={2} fill="var(--v2-relleno)" opacity={0.6} />
            {runs.map(([a, b]) => <rect key={a} x={r1(x(a))} y={y0} width={Math.max(1.2, r1(x(b) - x(a)))} height={L.sost} fill={COLOR_EQUIPO[e]} />)}
            <text x={x1 + 8} y={r1(y0 + L.sost - 1)} fontSize={11} className="fill-muted-foreground tabular-nums">
              <tspan {...colEq(e)} fontWeight={700}>{l.nombre}</tspan> {l.v90 != null ? `${int(l.v90)} min` : 'sin dato'}
            </text>
          </>
        ))
      })}

      {/* Carril 4 · paradas de 5 min o más, por dueño */}
      {rotuloCarril(yPar, 2 * L.par + 3, compacto ? 'Detenciones ≥ 5 min' : 'Detenciones de 5 min o más', undefined, tips.paradas)}
      {EQ.map((e, i) => {
        const l = lados[e]
        const y0 = yPar + i * (L.par + 3)
        if (!l) return <FilaVacia key={e} y0={y0} alto={L.par} />
        const fin = l.enCurso && vivo ? vivo.ultima.min : l.finMin
        const reales = l.eventos.filter((q) => !q.programada)
        const minParadas = reales.reduce((a, q) => a + (q.hasta - q.desde), 0)
        const orden = [...l.eventos].sort((p, q) => p.desde - q.desde)
        return (
          <g key={e}>
            <line x1={x0} x2={r1(x(fin))} y1={y0 + L.par / 2} y2={y0 + L.par / 2} stroke="var(--v2-reja)" />
            {orden.map((q, k) => {
              const a = x(q.desde)
              const ww = Math.max(2, x(Math.min(q.hasta, ejeMax)) - a)
              const dd = duenoDe(q.causa).dueno
              const dueno: DuenoParada = q.programada || dd === 'programado' ? 'prog' : dd
              /* La causa va al lado de la parada si hay lugar hasta la siguiente; si se recorta, el globo la trae entera. */
              const libre = (orden[k + 1] ? x(orden[k + 1]!.desde) : x1) - (a + ww) - 8
              const maxCh = Math.floor(libre / 5.6)
              const rotulo = maxCh >= 7 ? (q.corta.length > maxCh ? `${q.corta.slice(0, maxCh - 1)}…` : q.corta) : ''
              return tg(`par${e}${k}`, tipParada({ nombre: l.nombre, desdeMin: q.desde, causa: q.causa, min: q.hasta - q.desde, dueno }), (
                <>
                  {dueno === 'prog'
                    ? <rect x={r1(a + 0.75)} y={y0 + 0.75} width={r1(ww - 1.5)} height={L.par - 1.5} rx={3} fill="none" stroke="var(--v2-gris)" strokeDasharray="3 2" />
                    : (
                      <rect
                        x={r1(a)} y={y0} width={r1(ww)} height={L.par} rx={3}
                        fill={dueno === 'mantencion' ? `url(#${idTrama})` : dueno === 'externo' ? 'var(--v2-ext)' : 'var(--v2-gris)'}
                        {...(dueno === 'mantencion' ? { stroke: 'var(--v2-mant)', strokeWidth: 1 } : {})}
                      />
                    )}
                  {rotulo && <text x={r1(a + ww + 4)} y={y0 + L.par - 2} fontSize={11} className="fill-muted-foreground">{rotulo}</text>}
                </>
              ))
            })}
            {tg(`part${e}`, tipParadasTotal(l.nombre, reales.length, minParadas), (
              <text x={x1 + 8} y={r1(y0 + L.par - 1)} fontSize={11} className="fill-muted-foreground tabular-nums">
                <tspan {...colEq(e)} fontWeight={700}>{l.nombre}</tspan> {int(minParadas)} min
              </text>
            ))}
          </g>
        )
      })}

      {/* Carril 5 · micro detención por hora: más oscuro = más minutos */}
      {rotuloCarril(yMic, 2 * L.mic + 3, compacto ? 'Micro detención' : 'Micro detenciones', compacto ? 'minutos por hora' : 'minutos perdidos por hora', tips.micro)}
      {(() => {
        const mMax = Math.max(10, Math.ceil(Math.max(0, ...ends.flatMap((l) => l.micro.h ?? []))))
        return EQ.map((e, i) => {
          const l = lados[e]
          const y0 = yMic + i * (L.mic + 3)
          if (!l) return <FilaVacia key={e} y0={y0} alto={L.mic} />
          const hs = l.micro.h
          return (
            <g key={e}>
              {!hs && tg('sinmic', tipMicroTotal(l.nombre, null), <rect x={x0} y={y0} width={Math.max(0, r1(x(l.finMin) - x0))} height={L.mic} rx={3} fill="none" stroke="var(--v2-reja)" strokeDasharray="3 3" />)}
              {hs?.map((v, hh) => {
                const a = hh * 60
                const b = Math.min(l.enCurso && vivo ? vivo.ultima.min : l.finMin, a + 60)
                if (b <= a) return null
                const op = acota(v / mMax, 0.07, 1)
                const ancho = x(b) - x(a) - 2
                return tg(`mic${hh}`, tipMicro(l.nombre, hh + 1, v, l.enCurso && b < a + 60), (
                  <>
                    <rect x={r1(x(a) + 1)} y={y0} width={r1(ancho)} height={L.mic} rx={3} fill={COLOR_EQUIPO[e]} opacity={r1(op)} />
                    {ancho > 28 && <text x={r1((x(a) + x(b)) / 2)} y={y0 + L.mic / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} className={op > 0.55 ? 'fill-white' : 'fill-foreground'}>{ancho > 54 ? `${dec(v)} min` : dec(v)}</text>}
                  </>
                ))
              })}
              {tg('mict', tipMicroTotal(l.nombre, l.micro.total), (
                <text x={x1 + 8} y={r1(y0 + L.mic - 3)} fontSize={11} className="fill-muted-foreground tabular-nums">
                  <tspan {...colEq(e)} fontWeight={700}>{l.nombre}</tspan> {l.micro.total != null ? `${dec(l.micro.total)} min` : 'sin dato'}
                </text>
              ))}
            </g>
          )
        })
      })()}

      {/* «Ahora» del turno en curso: una sola raya que cruza todo el lienzo */}
      {vivo && (
        <g>
          <line x1={r1(x(vivo.ultima.min))} x2={r1(x(vivo.ultima.min))} y1={0} y2={h - L.eje + 2} stroke="rgb(var(--foreground) / 0.5)" strokeWidth={1.5} />
          <text x={r1(x(vivo.ultima.min) + 6)} y={cH - 8} fontSize={fs} fontWeight={600} className="fill-foreground tabular-nums">ahora {vivo.reloj}</text>
        </g>
      )}
      {cursor != null && <line x1={r1(x(cursor))} x2={r1(x(cursor))} y1={0} y2={h - L.eje + 2} stroke="var(--v2-tenue)" />}
    </svg>
  )
})

/**
 * Encabezado de la carrera: cada equipo en su propia fila, con su nombre, su turno y su cifra en la misma línea
 * («Rebolledo · día 27/10 · 13.541 pz»), y la ventaja en una línea aparte. La cifra nunca queda suelta.
 */
function CifrasLienzo({ d, lados, reloj, hoyEq, nombres, banda, ultimoMin }: {
  d: DatosDuelo
  lados: Record<EquipoId, LadoEje | null>
  reloj: RelojDeDatos
  hoyEq: EquipoId
  nombres: NombresEquipos
  banda: ModeloEje['banda']
  ultimoMin: number
}) {
  const hoy = lados[hoyEq]
  const rival = lados[d.rival?.equipo ?? (hoyEq === 'cardenas' ? 'rebolledo' : 'cardenas')]
  if (!hoy) return null
  const enCurso = !d.hoy.cerrado
  const jornada = fechaCorta(d.hoy.jornada)
  const hora = Math.floor(ultimoMin / 60) + 1
  const chip = (eq: EquipoId | 'n', t: string) => <div className="dpc-ventaja"><span className="dpc-chip" data-eq={eq}>{t}</span></div>
  /* «Rebolledo · día 27/10» -> el turno es lo que sigue al nombre. */
  const turno = (l: LadoEje) => l.rotulo.startsWith(l.nombre) ? l.rotulo.slice(l.nombre.length).replace(/^\s*·\s*/, '') : l.rotulo
  const fila = (eq: EquipoId, nombre: string, desc: string, valor: ReactNode) => (
    <div className="dpc-eqr" key={`${eq}${desc}`}>
      <span className="dpc-eqn" style={{ color: COLOR_EQUIPO_TEXTO[eq] }}>{nombre}</span>
      <span className="dpc-eqd">· {desc}</span>
      <span className="dpc-eqv" style={{ color: COLOR_EQUIPO_TEXTO[eq] }}>{valor}<span className="dpc-u">pz</span></span>
    </div>
  )
  if (rival && !enCurso) {
    const dif = hoy.total - rival.total
    const lider = dif === 0 ? null : dif > 0 ? hoy : rival
    return (
      <>
        <div className="dpc-eqs">
          {fila(hoy.eq, hoy.nombre, turno(hoy), int(hoy.total))}
          {fila(rival.eq, rival.nombre, turno(rival), int(rival.total))}
        </div>
        {lider ? chip(lider.eq, `${lider.nombre} ganó la carrera por ${int(Math.abs(dif))} pz`) : chip('n', 'Carrera pareja')}
      </>
    )
  }
  if (rival && enCurso) {
    const aHoraRival = piezasAlMinuto(rival.curva, ultimoMin) ?? 0
    const dif = d.carrera?.hoyPz != null ? d.carrera.hoyPz - aHoraRival : 0
    const lider = dif === 0 ? null : dif > 0 ? hoy : rival
    return (
      <>
        <div className="dpc-eqs">
          {fila(hoy.eq, hoy.nombre, `en vivo, ${hora}.ª hora`, <CifraViva reloj={reloj} respaldo={hoy.total} />)}
          {fila(rival.eq, rival.nombre, `a la misma hora, ${turno(rival)}`, int(aHoraRival))}
        </div>
        {lider ? chip(lider.eq, `${lider.nombre} va ganando por ${int(Math.abs(dif))} pz · ${hora}.ª hora`) : chip('n', `Parejos · ${hora}.ª hora`)}
      </>
    )
  }
  // Corre solo: la noche que abre la jornada, o un turno sin rival de su jornada.
  const ult = banda?.media[banda.media.length - 1]
  const prom = banda && ult ? piezasAlMinuto(banda.media, Math.min(ultimoMin, ult.minutes)) : null
  return (
    <>
      <div className="dpc-eqs">
        {fila(hoy.eq, hoy.nombre, d.abreJornada ? `${enCurso ? 'abre' : 'cerró'} la jornada ${jornada}` : turno(hoy), enCurso ? <CifraViva reloj={reloj} respaldo={hoy.total} /> : int(hoy.total))}
        {prom != null && fila(hoy.eq, nombreCorto(hoyEq, nombres), `promedio de ${d.hoy.esNoche ? 'noche' : 'día'} a esta hora`, int(prom))}
      </div>
      {chip('n', enCurso ? 'sin rival · no suma puntos mientras corre' : 'esperando al otro turno de la jornada')}
    </>
  )
}

function Lienzo({ p, d, lados, reloj, compacto }: { p: DueloPCProps; d: DatosDuelo; lados: Record<EquipoId, LadoEje | null>; reloj: RelojDeDatos; compacto: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [ref, { w, h }] = useTamano()
  const [cursor, setCursor] = useState<number | null>(null)
  const { extra, nombres, inicioMs } = p
  const hoyEq = d.hoy.equipo
  const enCurso = !d.hoy.cerrado

  const modelo = useMemo<ModeloEje | null>(() => {
    if (w < 300 || h < 260) return null
    const L = compacto ? GEO.compacto : GEO.normal
    const ends = EQ.map((e) => lados[e])
    const banda = d.carrera && d.carrera.bandaPropia && !ends.some((l) => l && !l.esHoy) ? d.carrera.banda : null
    const previsto = (() => {
      const fin = Date.parse(extra.live.plannedEnd ?? extra.live.scheduledEnd ?? '')
      return inicioMs != null && Number.isFinite(fin) && fin > inicioMs ? (fin - inicioMs) / 60_000 : null
    })()
    const ejeMax = maxMinutosEje(ends, previsto)
    const bandaMax = banda ? Math.max(...banda.max.map((q) => q.pieces)) : 0
    const { max: yMax, paso } = escalaY(Math.max(1, bandaMax, ...ends.map((l) => l?.total ?? 0)))
    const x0 = L.pl
    const x1 = w - L.pr
    const cH = Math.max(80, h - LANES(L))
    // La cabeza del turno en curso: la lectura anterior y la última del reloj de datos, en minutos de producción.
    let vivo: ModeloEje['vivo'] = null
    const hoyLado = lados[hoyEq]
    if (enCurso && hoyLado && inicioMs != null) {
      const c = reloj.cuadro()
      const ult = c.ultima
      const ultimaMin = acota(ult?.atMs != null ? (ult.atMs - inicioMs) / 60_000 : hoyLado.finMin, 0, ejeMax)
      const ultima: PuntoVivo = { min: ultimaMin, v: ult?.valor ?? hoyLado.total }
      const pr = c.previa
      const previaMin = pr?.atMs != null ? acota((pr.atMs - inicioMs) / 60_000, 0, ejeMax) : null
      const previa: PuntoVivo | null = pr && previaMin != null && previaMin < ultima.min ? { min: previaMin, v: pr.valor } : null
      vivo = { eq: hoyEq, previa, ultima, reloj: relojUtc(inicioMs + ultimaMin * 60_000) }
    }
    const rivalFalta = !ends.some((l) => l && !l.esHoy)
    return {
      w, h, compacto, L, x0, x1, cH, ejeMax, yMax, paso, lados, hoyEq,
      esp: esperadoDeLinea(extra.serieHoy, extra.live),
      banda, gan: horasGanadas(lados.cardenas, lados.rebolledo), vivo, hoyEnCurso: enCurso,
      horarioBanda: d.hoy.esNoche ? 'noche' : 'día', nom: { cardenas: nombreCorto('cardenas', nombres), rebolledo: nombreCorto('rebolledo', nombres) },
      textoRival: rivalFalta && d.carrera ? `${textoCorreContraEstaCurva(nombreCorto(hoyEq === 'cardenas' ? 'rebolledo' : 'cardenas', nombres), d.hoy.jornada, d.inicioDia)}.` : null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se rehace con cada lectura (`reloj.version`) y con los datos del duelo
  }, [w, h, compacto, lados, d, extra.live, extra.serieHoy, inicioMs, reloj.version, enCurso, hoyEq, nombres])

  const info = (() => {
    if (!modelo || cursor == null) return null
    const m = modelo
    const filas = EQ.map((e) => {
      const l = m.lados[e]
      const tope = l ? (l.enCurso && m.vivo ? m.vivo.ultima.min : l.finMin) : 0
      return l && cursor <= tope ? { l, pz: piezasAlMinuto(l.curva, cursor) ?? 0 } : null
    })
    const [a, b] = filas
    return { filas, dif: a && b ? a.pz - b.pz : null }
  })()
  const px = modelo && cursor != null ? modelo.x0 + (cursor / modelo.ejeMax) * (modelo.x1 - modelo.x0) : 0
  const mover = (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (!modelo || ev.pointerType !== 'mouse') return
    /* Sobre una barra, parada o rótulo manda su globo: la regla vertical de la hora se aparta. */
    if (ev.target instanceof Element && ev.target.closest('[data-tip]')) { setCursor(null); return }
    const r = ev.currentTarget.getBoundingClientRect()
    const min = ((ev.clientX - r.left - modelo.x0) / (modelo.x1 - modelo.x0)) * modelo.ejeMax
    setCursor(min >= 0 && min <= modelo.ejeMax ? min : null)
  }

  const hora = (modelo?.vivo ? Math.floor(modelo.vivo.ultima.min / 60) + 1 : d.carrera?.hora) ?? 1
  const jornada = fechaCorta(d.hoy.jornada)
  const sub = d.hoy.cerrado
    ? d.esperando ? `${nombreCorto(hoyEq, nombres)} cerró la noche · el día juega después` : 'cerrada · horas contadas desde la primera pieza de cada turno'
    : d.abreJornada ? `en vivo · ${hora}.ª hora · la noche abre la jornada sin rival`
      : d.rival ? `en vivo · ${hora}.ª hora de producción · contra ${nombreCorto(d.rival.equipo, nombres)}, ya cerrada` : `en vivo · ${hora}.ª hora · sin turno de noche`
  const resumen = `Carrera de la jornada ${jornada}: ${EQ.map((e) => lados[e]).filter((l): l is LadoEje => l != null).map((l) => `${l.nombre} ${int(l.total)} pz`).join(', ')}. Debajo, para cada equipo: el ritmo por hora, quién ganó cada hora, los minutos a buen ritmo, las detenciones de 5 minutos o más y los minutos perdidos en micro detenciones por hora.`
  const ultimoMin = modelo?.vivo?.ultima.min ?? d.carrera?.minuto ?? 0

  return (
    <section className="v2-tarjeta rounded-card dpc-card dpc-eje" aria-label={`Carrera de la jornada ${jornada}`}>
      <div className="dpc-hd">
        <h3>Carrera · jornada {jornada}</h3>
        <span className="dpc-sub">{sub}</span>
        <div className="dpc-lg">
          <span className="whitespace-nowrap" style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}><Leyenda trazo="linea" color={COLOR_EQUIPO.cardenas} rotulo={nombreCorto('cardenas', nombres)} /></span>
          {lados.rebolledo || !modelo?.banda
            ? <span className="whitespace-nowrap" style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}><Leyenda trazo="linea" color={COLOR_EQUIPO.rebolledo} rotulo={nombreCorto('rebolledo', nombres)} /></span>
            : <Leyenda trazo="banda" color="var(--v2-relleno)" rotulo="su rango de noche" tip="Su rango de noche: la franja va del mínimo al máximo de sus turnos anteriores del mismo horario." />}
          <Leyenda trazo="cuadro" color={TRAMA_MANT} rotulo="Mantención" tip={TIPS_LEYENDA.mantencion} />
          <Leyenda trazo="cuadro" color="var(--v2-ext)" rotulo="Externo" tip={TIPS_LEYENDA.externo} />
          <Leyenda trazo="cuadro" color="var(--v2-gris)" rotulo="Sin imputar" tip={TIPS_LEYENDA.sinImputar} />
          <span className="dpc-x13"><Leyenda trazo="contorno" color="var(--v2-gris)" rotulo="Programada" tip={TIPS_LEYENDA.programada} /></span>
        </div>
      </div>
      <div ref={ref} className="dpc-ch" role="group" aria-label={resumen} onPointerMove={mover} onPointerLeave={() => setCursor(null)}>
        {modelo && <EjeSvg m={modelo} reloj={reloj} uid={uid} cursor={cursor} />}
        {!lados.cardenas && !lados.rebolledo && <p className="dpc-fn" style={{ position: 'absolute', left: 14, top: 8 }}>La carrera aparece con la primera pieza del turno.</p>}
        {modelo && (
          <div className="dpc-ov" style={{ left: modelo.x0 + 14 }}>
            <CifrasLienzo d={d} lados={lados} reloj={reloj} hoyEq={hoyEq} nombres={nombres} banda={modelo.banda} ultimoMin={ultimoMin} />
          </div>
        )}
        {modelo && info && (
          <div className="dpc-tip v2-tip" style={{ left: acota(px + 14, 0, Math.max(0, modelo.w - 210)), top: 40 }}>
            <div className="dpc-cap">{Math.floor((cursor ?? 0) / 60) + 1}.ª hora · minuto {Math.round(cursor ?? 0)} de producción</div>
            {info.filas.map((f) => f && (
              <div key={f.l.eq} className="dpc-tip-k"><span style={{ color: COLOR_EQUIPO_TEXTO[f.l.eq] }}>{f.l.nombre}</span><b className="tabular-nums">{int(f.pz)} pz</b></div>
            ))}
            {info.dif != null && info.dif !== 0 && <div className="dpc-tip-k"><span>ventaja de <span style={{ color: COLOR_EQUIPO_TEXTO[info.dif > 0 ? 'cardenas' : 'rebolledo'] }}>{nombreCorto(info.dif > 0 ? 'cardenas' : 'rebolledo', nombres)}</span></span><b className="tabular-nums">{int(Math.abs(info.dif))} pz</b></div>}
          </div>
        )}
      </div>
    </section>
  )
}

// ── Por qué ──────────────────────────────────────────────────────────────────

const FILAS_PQ: Array<{ k: DuenoPQ; rotulo: string; sub: string }> = [
  { k: 'mic', rotulo: 'Micro detención', sub: 'operación · detenciones cortas' },
  { k: 'sin', rotulo: 'Sin imputar', sub: 'nadie anotó la causa' },
  { k: 'mant', rotulo: 'Mantención · equipos', sub: 'falla técnica, no resta puntos' },
  { k: 'ext', rotulo: 'Externo', sub: 'materia prima, rechazo, servicios' },
  { k: 'prog', rotulo: 'Programadas', sub: 'colación y reunión de inicio' },
]

/** Dos o tres causas que más pesan en un dueño, sin cifras, para el pie de la barra. */
const causasTexto = (c: CausasLado | null, k: DuenoPQ): string =>
  k === 'mic' || k === 'prog' || !c ? '' : c.det[k].slice(0, 2).map((x) => x.n.toLowerCase()).join(' · ')

function PorQue({ d, nombres, extra, compacto, lados }: { d: DatosDuelo; nombres: NombresEquipos; extra: DueloPCExtra; compacto: boolean; lados: Record<EquipoId, LadoEje | null> }) {
  const [periodo, setPeriodo] = useState<PeriodoPQ>('jornada')
  const pq = useMemo(() => construirPorQue({ d, live: extra.live, stats: extra.stats, periodo }), [d, extra.live, extra.stats, periodo])
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const enCurso = !d.hoy.cerrado
  const c = pq.causas
  const ambos = c.cardenas != null && c.rebolledo != null
  const orden = [...FILAS_PQ.slice(0, 4)].sort((a, b) => (c.cardenas?.min[b.k] ?? 0) + (c.rebolledo?.min[b.k] ?? 0) - (c.cardenas?.min[a.k] ?? 0) - (c.rebolledo?.min[a.k] ?? 0))
  const filas = [...orden, FILAS_PQ[4]!]
  const mx = Math.max(1, ...filas.flatMap((f) => EQ.map((e) => c[e]?.min[f.k] ?? 0)))
const sub = `minutos de línea detenida, sin contar programadas${periodo !== 'jornada' ? ' · turnos cerrados' : ''}${periodo === 'jornada' && enCurso ? ' · hasta ahora' : ''}`
  const alcance = periodo === 'jornada' ? 'en la jornada' : periodo === 'semana' ? 'en la semana' : 'en el mes'
  const totalLado = (e: EquipoId) => (c[e] && c[e]!.sinDato < c[e]!.turnos ? ` · ${int(sinProgramadas(c[e]))} min` : '')
  const sinDatoN = EQ.reduce((a, e) => a + (c[e]?.sinDato ?? 0), 0)
  const turnosN = EQ.reduce((a, e) => a + (c[e]?.turnos ?? 0), 0)

  const lado = (e: EquipoId, f: { k: DuenoPQ; rotulo: string; sub: string }, izq: boolean) => {
    const k = f.k
    const x = c[e]
    if (!x) return <div className="dpc-bar"><span className="dpc-cap">{periodo === 'jornada' ? 'por jugar' : 'sin turnos'}</span></div>
    if (x.sinDato >= x.turnos) return <div className="dpc-bar" data-tip="El turno aún no trae sus minutos de línea: el monitor los publica al rearmarlo, así que no se puede repartir por causa." tabIndex={0}><span className="dpc-cap">sin dato</span></div>
    const v = x.min[k]
    const txt = compacto ? '' : causasTexto(x, k)
    const det = x.det[k].slice(0, 4).map((q) => `${q.n.toLowerCase()} ${int(q.min)} min`).join(' · ')
    const tip = `${nom(e)} · ${f.rotulo} (${f.sub}): ${int(v)} min de línea detenida ${alcance}.${det ? ` Causas: ${det}.` : ''}`
    return (
      <div className={`dpc-bar ${izq ? 'dpc-izq' : ''}`} data-tip={tip} tabIndex={0}>
        <i
          style={{
            width: `${Math.min(46, (v / mx) * 46)}%`,
            ...(k === 'mic' ? { background: COLOR_EQUIPO[e], opacity: 0.55 } : { background: FONDO_DUENO[k] }),
            ...(k === 'prog' ? { outline: '1.5px dashed var(--v2-gris)', outlineOffset: '-1.5px' } : {}),
          }}
        />
        <b className="tabular-nums">{int(v)} min</b>
        {txt && <span className={`dpc-cap dpc-trunca ${izq ? 'dpc-der' : ''}`}>{txt}</span>}
      </div>
    )
  }

  // Micro por Baader: una fila por máquina; con una sola, una fila por equipo con su total.
  const maquinas = [...new Set(EQ.flatMap((e) => (pq.micro[e] ?? []).map((q) => etiquetaMaquina(q.n))))]
  const micro = (e: EquipoId, m: string) => (pq.micro[e] ?? []).filter((q) => etiquetaMaquina(q.n) === m).reduce((a, q) => a + q.min, 0)
  const mb = Math.max(0.1, ...maquinas.flatMap((m) => EQ.map((e) => micro(e, m))))
  const masMicro = (e: EquipoId) => {
    const lista = maquinas.map((m) => [m, micro(e, m)] as const).sort((a, b) => b[1] - a[1])
    return pq.micro[e] && lista[0] ? lista[0][0] : null
  }
  const unaMaquina = maquinas.length === 1
  const pzMant = pq.piezasMant

  return (
    <section className="v2-tarjeta rounded-card dpc-card dpc-porque" aria-label="Por qué se perdió tiempo">
      <div className="dpc-hd">
        <h3>Por qué se perdió tiempo</h3>
        <span className="dpc-sub">{sub}</span>
        <div className="dpc-seg" role="group" aria-label="Periodo">
          {(['jornada', 'semana', 'mes'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={periodo === k} className="tap-44" onClick={() => setPeriodo(k)}>{k}</button>
          ))}
        </div>
      </div>
      <div className="dpc-pq">
        <div className="dpc-bf" style={{ gridTemplateRows: `auto repeat(${filas.length + (periodo === 'jornada' && ambos && !enCurso ? 1 : 0)}, minmax(0, 1fr))` }}>
          <div className="dpc-row dpc-row-h">
            <span style={{ textAlign: 'right', color: COLOR_EQUIPO_TEXTO.cardenas }} data-tip={`${nom('cardenas')}: minutos de línea detenida sin contar las programadas, ${alcance}.`} tabIndex={0}><b>{nom('cardenas')}</b>{totalLado('cardenas')}</span>
            <span style={{ textAlign: 'center' }}>causa y dueño</span>
            <span style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }} data-tip={`${nom('rebolledo')}: minutos de línea detenida sin contar las programadas, ${alcance}.`} tabIndex={0}><b>{nom('rebolledo')}</b>{totalLado('rebolledo')}</span>
          </div>
          {filas.map((f) => (
            <div key={f.k} className="dpc-row">
              <div>{lado('cardenas', f, true)}</div>
              <div className="dpc-lab">{f.rotulo}{!compacto && <span className="dpc-cap">{f.sub}</span>}</div>
              <div>{lado('rebolledo', f, false)}</div>
            </div>
          ))}
          {periodo === 'jornada' && ambos && !enCurso && (
            <div className="dpc-row">
              <span className="dpc-cap" style={{ gridColumn: '1 / 4', textAlign: 'center' }}>
                {pzMant.cardenas || pzMant.rebolledo
                  ? <>Mantención le quitó <b className="text-foreground">{int(pzMant.cardenas ?? 0)} pz</b> a {nom('cardenas')} y <b className="text-foreground">{int(pzMant.rebolledo ?? 0)} pz</b> a {nom('rebolledo')}. Se suman a su carrera.</>
                  : 'Mantención no le quitó piezas a ningún equipo en esta jornada.'}
              </span>
            </div>
          )}
        </div>
        <div className="dpc-mb" style={{ gridTemplateRows: `auto ${!unaMaquina && maquinas.length > 0 ? 'auto ' : ''}repeat(${Math.max(1, unaMaquina ? 2 : maquinas.length)}, minmax(0, 1fr)) auto` }}>
          <div className="dpc-hd" style={{ paddingBottom: 2 }}>
            <h3 style={{ fontSize: 15 }}>{unaMaquina ? `Micro detención de ${maquinas[0]}` : 'Micro detención por Baader'}</h3>
            <span className="dpc-sub">minutos por máquina</span>
          </div>
          {!unaMaquina && maquinas.length > 0 && (
            <div className="dpc-cap" style={{ marginTop: -2 }}>
              barra de arriba <b style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{nom('cardenas')}</b> · de abajo <b style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{nom('rebolledo')}</b>
            </div>
          )}
          {maquinas.length === 0 && <span className="dpc-cap">sin dato de micro en este periodo</span>}
          {unaMaquina
            ? EQ.map((e) => (
                <div key={e} className="dpc-mrow" data-tip={pq.micro[e] ? `${nom(e)} · ${maquinas[0]} · ${dec(micro(e, maquinas[0]!))} min perdidos en micro detenciones ${alcance}` : `${nom(e)} · sin dato de micro detenciones`} tabIndex={0}>
                  <span style={{ color: COLOR_EQUIPO_TEXTO[e], fontWeight: 700 }}>{nom(e)}</span>
                  <div className="dpc-two"><i style={{ width: `${(micro(e, maquinas[0]!) / mb) * 100}%`, background: COLOR_EQUIPO[e] }} /></div>
                  <div className="dpc-vv"><span style={{ color: COLOR_EQUIPO_TEXTO[e] }}>{pq.micro[e] ? `${dec(micro(e, maquinas[0]!))} min` : '—'}</span></div>
                </div>
              ))
            : maquinas.map((m) => (
                <div key={m} className="dpc-mrow" data-tip={`${m} · minutos perdidos en micro detenciones ${alcance}: ${nom('cardenas')} ${pq.micro.cardenas ? dec(micro('cardenas', m)) : 'sin dato'} · ${nom('rebolledo')} ${pq.micro.rebolledo ? dec(micro('rebolledo', m)) : 'sin dato'}`} tabIndex={0}>
                  <span>{m}</span>
                  <div className="dpc-two">
                    <i style={{ width: `${(micro('cardenas', m) / mb) * 100}%`, background: COLOR_EQUIPO.cardenas }} />
                    {pq.micro.rebolledo ? <i style={{ width: `${(micro('rebolledo', m) / mb) * 100}%`, background: COLOR_EQUIPO.rebolledo }} /> : <i style={{ width: '100%', background: 'none', outline: '1px dashed var(--v2-reja)' }} />}
                  </div>
                  <div className="dpc-vv">
                    <span style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{pq.micro.cardenas ? `${dec(micro('cardenas', m))} min` : '—'}</span>
                    <span style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{pq.micro.rebolledo ? `${dec(micro('rebolledo', m))} min` : '—'}</span>
                  </div>
                </div>
              ))}
          <div className="dpc-cap">
            {unaMaquina
              ? (lados.cardenas?.micro.h || lados.rebolledo?.micro.h ? 'la hora a hora está en el carril «Micro detenciones» de la carrera' : ' ')
              : ambos
                ? <>Más micro detención: <b style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{nom('cardenas')} en {masMicro('cardenas') ?? '—'}</b> · <b style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{nom('rebolledo')} en {masMicro('rebolledo') ?? '—'}</b></>
                : 'el otro equipo aún no juega'}
            {sinDatoN > 0 ? (compacto ? ` · ${sinDatoN} de ${turnosN} sin dato` : ` · ${sinDatoN} de ${turnosN} turnos sin minutos de línea: no suman`) : ''}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Semana a semana ──────────────────────────────────────────────────────────

function SemanaASemana({ d, compacto, nombres }: { d: DatosDuelo; compacto: boolean; nombres: NombresEquipos }) {
  const [ref, { w, h }] = useTamano()
  const semanas = useMemo(() => semanasPC(d), [d])
  const { lo, hi } = useMemo(() => escalaSemanas(semanas), [semanas])
  const g = (() => {
    if (w < 150 || h < 100 || semanas.length < 2) return null
    const pl = compacto ? 50 : 52, pr = compacto ? 66 : 84, pb = compacto ? 36 : 56, pt = 8
    const n = semanas.length
    const x = (i: number) => pl + (i + 0.5) * ((w - pl - pr) / n)
    const y = (v: number) => pt + ((hi - v) / (hi - lo)) * (h - pt - pb)
    const ticks: number[] = []
    for (let v = lo; v <= hi; v += 1000) ticks.push(v)
    const sparse = ticks.length > 6 ? ticks.filter((_, i) => i % 2 === 0) : ticks
    const ultimoDe = (e: EquipoId): number | null => {
      const q = [...semanas].reverse().find((s) => s[e] != null)
      return q?.[e] ? y(q[e]!.prom) : null
    }
    return (
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 block overflow-visible">
        {sparse.map((v) => (
          <g key={v}>
            <line x1={pl} x2={w - pr} y1={r1(y(v))} y2={r1(y(v))} stroke="var(--v2-reja)" />
            <text x={pl - 6} y={r1(y(v) + 4)} textAnchor="end" fontSize={11} className="fill-muted-foreground tabular-nums">{int(v / 1000)} mil</text>
          </g>
        ))}
        {EQ.map((e) => {
          const pts = semanas.map((s, i) => ({ i, p: s[e] })).filter((q): q is { i: number; p: NonNullable<typeof q.p> } => q.p != null)
          const ultimo = pts[pts.length - 1]
          /* Nombre y cifra al final de la línea; si las dos terminan cerca, el equipo de arriba escribe hacia arriba y
             el de abajo hacia abajo, para que los rótulos no se pisen. */
          const otro = ultimoDe(e === 'cardenas' ? 'rebolledo' : 'cardenas')
          const cerca = ultimo && otro != null && Math.abs(y(ultimo.p.prom) - y(otro)) < 40
          const arriba = ultimo != null && (otro == null || y(ultimo.p.prom) <= y(otro))
          const yy = ultimo ? y(ultimo.p.prom) : 0
          const yNombre = cerca ? (arriba ? yy - 18 : yy + 17) : yy + (arriba ? -2 : 12)
          const yCifra = cerca ? (arriba ? yy - 4 : yy + 31) : yy + (arriba ? 12 : 26)
          return (
            <g key={e}>
              <polyline points={pts.map((q) => `${r1(x(q.i))},${r1(y(q.p.prom))}`).join(' ')} fill="none" stroke={COLOR_EQUIPO[e]} strokeWidth={2} />
              {pts.map((q) => (
                <circle
                  key={q.i} cx={r1(x(q.i))} cy={r1(y(q.p.prom))} r={5} stroke={COLOR_EQUIPO[e]} strokeWidth={2}
                  fill={q.p.horario === 'noche' ? 'rgb(var(--card))' : COLOR_EQUIPO[e]} strokeDasharray={q.p.horario === 'mixto' ? '2 2' : undefined}
                  data-tip={`${nombreCorto(e, nombres)} · ${semanas[q.i]!.etiqueta} · promedio de ${int(q.p.prom)} piezas por turno (turnos de ${q.p.horario === 'noche' ? 'noche, punto hueco' : q.p.horario === 'dia' ? 'día, punto lleno' : 'día y de noche, punto con borde cortado'})`}
                  tabIndex={0}
                >
                  <title>{`${nombreCorto(e, nombres)} · ${semanas[q.i]!.etiqueta} · promedio de ${int(q.p.prom)} piezas por turno`}</title>
                </circle>
              ))}
              {ultimo && (
                <>
                  <text x={r1(x(ultimo.i) + 12)} y={r1(yNombre)} fontSize={12} fontWeight={600} fill={COLOR_EQUIPO_TEXTO[e]}>{nombreCorto(e, nombres)}</text>
                  <text x={r1(x(ultimo.i) + 12)} y={r1(yCifra)} fontSize={12} className="fill-foreground tabular-nums">{int(ultimo.p.prom)} piezas</text>
                </>
              )}
            </g>
          )
        })}
        {semanas.map((s, i) => {
          const a = s.cardenas?.prom, b = s.rebolledo?.prom
          const dif = a != null && b != null ? a - b : null
          const top = a != null && b != null ? Math.min(y(a), y(b)) : 0
          const bot = a != null && b != null ? Math.max(y(a), y(b)) : 0
          return (
            <g key={s.lunes} data-tip={`Semana ${s.etiqueta}: jornadas ganadas ${nombreCorto('cardenas', nombres)} ${s.jc}, ${nombreCorto('rebolledo', nombres)} ${s.jr}${dif != null ? ` · ventaja en piezas por turno: ${nombreCorto(dif >= 0 ? 'cardenas' : 'rebolledo', nombres)} ${firmado(Math.abs(dif))}` : ''} · cada punto de la curva es el promedio de piezas por turno de esa semana`} tabIndex={0}>
              <rect x={r1(x(i) - (w - pl - pr) / n / 2)} y={h - pb} width={r1((w - pl - pr) / n)} height={pb} fill="transparent" />
              {dif != null && bot - top > 14 && <line x1={r1(x(i))} x2={r1(x(i))} y1={r1(top + 7)} y2={r1(bot - 7)} stroke={COLOR_EQUIPO[dif >= 0 ? 'cardenas' : 'rebolledo']} strokeWidth={2} opacity={0.35} />}
              <text x={r1(x(i))} y={h - pb + 16} textAnchor="middle" fontSize={11} className="fill-muted-foreground">{compacto ? s.etiqueta.slice(0, s.etiqueta.indexOf(' ')) : s.etiqueta}</text>
              <text x={r1(x(i))} y={h - pb + 31} textAnchor="middle" fontSize={compacto ? 11 : 12} className="fill-foreground tabular-nums">
                <tspan fill={COLOR_EQUIPO_TEXTO.cardenas} fontWeight={700}>{s.jc}</tspan> – <tspan fill={COLOR_EQUIPO_TEXTO.rebolledo} fontWeight={700}>{s.jr}</tspan>{' jornadas'}
              </text>
              {!compacto && dif != null && <text x={r1(x(i))} y={h - pb + 45} textAnchor="middle" fontSize={11} className="fill-muted-foreground tabular-nums">{nombreCorto(dif >= 0 ? 'cardenas' : 'rebolledo', nombres)} {firmado(Math.abs(dif))} pz</text>}
            </g>
          )
        })}
        {!compacto && <text x={pl} y={h - 2} fontSize={11} className="fill-muted-foreground">{`punto lleno: turnos de día · hueco: de noche · jornadas ganadas ${nombreCorto('cardenas', nombres)} – ${nombreCorto('rebolledo', nombres)} · el eje parte en ${int(lo / 1000)} mil piezas`}</text>}
      </svg>
    )
  })()
  return (
    <section className="v2-tarjeta rounded-card dpc-card dpc-semana" aria-label="Semana a semana">
      <div className="dpc-hd">
        <h3>Semana a semana</h3>
        <span className="dpc-sub">promedio de piezas por turno y jornadas ganadas</span>
      </div>
      <div ref={ref} className="dpc-ch" style={{ marginTop: 4 }} role="group" aria-label={`Promedio de piezas por turno de cada equipo en las últimas ${semanas.length} semanas`}>
        {g ?? <p className="dpc-fn" style={{ position: 'absolute', inset: 0 }}>{semanas.length < 2 ? 'Hacen falta turnos cerrados de al menos dos semanas para dibujar la tendencia.' : ''}</p>}
      </div>
    </section>
  )
}

// ── El riel: marcador, KPI a KPI y jornadas del mes ──────────────────────────

const chipGan = (f: FilaRiel, compacto: boolean, enCurso: boolean, nom: (e: EquipoId) => string) => {
  if (f.gan === 'c' || f.gan === 'r') {
    const eq: EquipoId = f.gan === 'c' ? 'cardenas' : 'rebolledo'
    return <span className="dpc-chip" data-eq={eq}>{enCurso ? 'va ' : 'punto: '}{nom(eq)}</span>
  }
  /* Donde no hay nada que decir, nada. */
  if (compacto && f.gan === 'sin') return null
  const t = f.gan === 'empate' ? 'empate' : f.gan === 'pend' ? 'se define al cierre' : f.gan === 'info' ? 'no da punto' : 'sin punto'
  return <span className="dpc-chip" data-eq="n">{t}</span>
}

const UNIDAD_FILA: Record<string, string> = { pz: 'pz', 'pz/min': 'pz/min', 'min/h': 'min por hora', min: 'min', '%': '%' }

function valorFila(f: FilaRiel, lado: 'c' | 'r'): ReactNode {
  const txt = lado === 'c' ? f.cTxt : f.rTxt
  if (txt != null) return txt
  const v = lado === 'c' ? f.c : f.r
  if (v == null) return <span className="text-muted-foreground">—</span>
  const u = UNIDAD_FILA[f.unidad]
  return <>{f.dec ? dec(v, f.dec) : int(v)}{u && <span className="dpc-un">{u}</span>}</>
}

function Riel({ d, nombres, lados, unidad, compacto }: { d: DatosDuelo; nombres: NombresEquipos; lados: Record<EquipoId, LadoEje | null>; unidad: 'carros' | 'silletas' | null; compacto: boolean }) {
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const enCurso = !d.hoy.cerrado
  const soloHoy = !d.rival || !d.marcador
  const jornada = fechaCorta(d.hoy.jornada)
  const filas = useMemo(() => {
    if (!soloHoy) return filasRiel({ d, lados, compacto, unidad })
    const b = d.carrera?.banda
    const ref = b && d.carrera ? piezasAlMinuto(b.media, Math.min(d.carrera.minuto, b.media[b.media.length - 1]?.minutes ?? 0)) : null
    return filasSinRival(d, lados, ref)
  }, [d, lados, compacto, unidad, soloHoy])
  const puntaje = useMemo(() => puntajeRiel(d, filas), [d, filas])
  const per = useMemo(() => periodosRiel(d), [d])
  const jornadas = useMemo(() => filasJornadas(d), [d])
  const m = d.marcador
  const lider = puntaje && puntaje.c !== puntaje.r ? (puntaje.c > puntaje.r ? 'cardenas' : 'rebolledo') : null
  const rachaEq = d.rachas.cardenas.actual >= d.rachas.rebolledo.actual ? 'cardenas' : 'rebolledo'
  const racha = d.rachas[rachaEq].actual
  const difPz = lados.cardenas && lados.rebolledo ? lados.cardenas.total - lados.rebolledo.total : null

  const periodoFila = (p: typeof per.semana) => {
    const t = p.jc + p.jr
    const tip = `${p.etiqueta}: jornadas ganadas ${nom('cardenas')} ${p.jc}, ${nom('rebolledo')} ${p.jr}. Puntos: ${nom('cardenas')} ${p.pc}, ${nom('rebolledo')} ${p.pr}. Una jornada la gana quien suma más puntos entre su turno de noche y el de día.`
    return (
      <>
        <span data-tip={tip} tabIndex={0}>{p.etiqueta}</span>
        <div className="dpc-split" data-tip={tip} tabIndex={0}><i style={{ width: `${(p.jc / (t || 1)) * 100}%`, background: COLOR_EQUIPO.cardenas }} /><i style={{ width: `${(p.jr / (t || 1)) * 100}%`, background: COLOR_EQUIPO.rebolledo }} /></div>
        <span className="tabular-nums dpc-ph" data-tip={tip} tabIndex={0}><b style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{p.jc}</b> – <b style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{p.jr}</b></span>
        <span className="tabular-nums dpc-ph text-muted-foreground" data-tip={tip} tabIndex={0}>{p.pc} – {p.pr}</span>
      </>
    )
  }

  // Cuántas filas de jornadas caben: se mide la caja y se reparte su alto en partes iguales.
  const [refH, { h: altoHist }] = useTamano()
  const filaH = compacto ? 21 : 24
  const n = Math.max(1, Math.floor(altoHist / filaH))
  const visibles = jornadas.slice(0, n)
  const resto = jornadas.length - visibles.length
  const rec = d.records
  const recNoche = rec.find((r) => r.id === 'piezas-noche')
  const recDia = rec.find((r) => r.id === 'piezas-dia')
  const recTxt = [recNoche && `noche ${nom(recNoche.equipo)} ${int(recNoche.valor)} pz (${fechaCorta(recNoche.dateKey)})`, recDia && `día ${nom(recDia.equipo)} ${int(recDia.valor)} pz (${fechaCorta(recDia.dateKey)})`].filter(Boolean).join(' · ')
  const pzEq = (x: { eq: EquipoId; pz: number } | null) => x
    ? <span><i className="dpc-q" style={{ background: COLOR_EQUIPO[x.eq] }} /><span className="tabular-nums">{int(x.pz)}</span></span>
    : <span className="text-muted-foreground">por jugar</span>

  return (
    <section className="v2-tarjeta rounded-card dpc-card dpc-riel" aria-label="Marcador e indicadores de la jornada">
      <section className="dpc-sec">
        <div className="dpc-hd">
          <h3>Jornada {jornada}</h3>
          <span className="dpc-sub">
            {m?.sinDuelo ? 'sin duelo' : soloHoy ? (d.abreJornada && enCurso ? 'se abre · sin puntos hasta que cierren los dos' : d.esperando ? 'espera al otro turno' : 'sin rival de turno') : enCurso ? 'en juego · provisional, los puntos se asignan al cierre' : 'cerrada · un punto por KPI y por puesto'}
          </span>
        </div>
        {m?.sinDuelo ? (
          <p className="dpc-fn" style={{ marginTop: 6 }}>{m.motivo}. No suma ni quita puntos a nadie.</p>
        ) : puntaje ? (
          <div className="dpc-score" style={{ opacity: puntaje.provisional ? 0.75 : 1 }} data-tip={`Puntos de la jornada ${jornada}: ${nom('cardenas')} ${puntaje.c}, ${nom('rebolledo')} ${puntaje.r}. Cada indicador ganado da un punto, y cada puesto de alimentación ganado otro. Los puntos de las dos jornadas del periodo se ven abajo.`} tabIndex={0}>
            <div className="dpc-sc"><span className="dpc-cap" style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{compacto ? nom('cardenas') : `${nom('cardenas')} · puntos`}</span><b style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{puntaje.c}</b></div>
            <span className="dpc-vs">–</span>
            <div className="dpc-sc"><span className="dpc-cap" style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{compacto ? nom('rebolledo') : `${nom('rebolledo')} · puntos`}</span><b style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{puntaje.r}</b></div>
            <span className="dpc-fn">
              {puntaje.provisional
                ? <>{puntaje.pendientes} {puntaje.pendientes === 1 ? 'punto se juega' : 'puntos se juegan'}<br />en el cierre del turno</>
                : lider ? <>Gana <b style={{ color: COLOR_EQUIPO_TEXTO[lider] }}>{nom(lider)}</b><br />{difPz != null ? `${firmado(lider === 'cardenas' ? difPz : -difPz)} pz en la carrera` : ''}</> : 'Jornada empatada'}
            </span>
          </div>
        ) : (
          <div className="dpc-score">
            <b style={{ color: COLOR_EQUIPO_TEXTO[d.hoy.equipo] }}>{int(d.hoy.piezas)}</b>
            <span className="dpc-fn">pz de {nom(d.hoy.equipo)} {d.hoy.esNoche ? 'en la noche' : 'en el día'}.<br />{d.hoy.esNoche ? `${nom(d.hoy.equipo === 'cardenas' ? 'rebolledo' : 'cardenas')} juega el día${d.inicioDia ? ` desde las ${d.inicioDia}` : ''}.` : 'Sin turno de noche en esta jornada.'}</span>
          </div>
        )}
        <div className="dpc-per">
          <span className="dpc-cap" style={{ gridColumn: '1 / 3' }} data-tip="Siempre en este orden: primero Cárdenas, después Rebolledo." tabIndex={0}><b style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{nom('cardenas')}</b> – <b style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{nom('rebolledo')}</b></span><span className="dpc-cap dpc-ph" data-tip="Jornadas ganadas: una jornada es el turno de noche más el de día; la gana quien suma más puntos." tabIndex={0}>Jornadas ganadas</span><span className="dpc-cap dpc-ph" data-tip="Puntos: uno por cada indicador ganado y uno por cada puesto de alimentación ganado." tabIndex={0}>Puntos</span>
          {periodoFila(per.semana)}
          {periodoFila(per.mes)}
        </div>
        <p className="dpc-fn" style={{ marginTop: 6 }}>
          {racha > 0
            ? <>Racha: <b style={{ color: COLOR_EQUIPO_TEXTO[rachaEq] }}>{nom(rachaEq)} · {racha} {racha === 1 ? 'turno ganado' : 'turnos ganados'}</b> seguidos · </>
            : 'Sin racha en curso · '}
          mejor racha publicada <b style={{ color: COLOR_EQUIPO_TEXTO.cardenas }}>{nom('cardenas')} {d.rachas.cardenas.mejor}</b> · <b style={{ color: COLOR_EQUIPO_TEXTO.rebolledo }}>{nom('rebolledo')} {d.rachas.rebolledo.mejor}</b>
        </p>
      </section>

      <section className="dpc-sec">
        <div className="dpc-hd">
          <h3>Indicadores de la jornada</h3>
          <span className="dpc-sub">{soloHoy ? `${nom(d.hoy.equipo)} contra su promedio` : 'quién gana cada punto'}</span>
        </div>
        <div className="dpc-kp dpc-cap" style={{ marginTop: 6, fontWeight: 600 }}>
          <span className="dpc-v" style={{ color: COLOR_EQUIPO_TEXTO[soloHoy ? d.hoy.equipo : 'cardenas'] }}>{soloHoy ? nom(d.hoy.equipo) : nom('cardenas')}</span>
          <span />
          <span className="dpc-v dpc-v2" style={{ color: soloHoy ? undefined : COLOR_EQUIPO_TEXTO.rebolledo }}>{soloHoy ? 'su promedio' : nom('rebolledo')}</span>
        </div>
        {filas.length === 0 && <p className="dpc-fn" style={{ marginTop: 8 }}>{m?.sinDuelo ? 'Este turno quedó sin duelo: no hay puntos que comparar.' : 'Se compara cuando cierran los dos turnos de la jornada.'}</p>}
        <div className="dpc-kps">
          {filas.map((f) => {
            const num = f.c != null && f.r != null && !soloHoy
            const mx = num ? Math.max(f.c!, f.r!) || 1 : 1
            return (
              <div key={f.id} className="dpc-kp" data-tip={tipFilaKpi(f, { enCurso, unidad, soloHoy, etiquetaPuesto: f.puesto })} tabIndex={0}>
                <span className="dpc-kl"><b>{f.rotulo}</b>{!compacto && f.sub && <span className="dpc-cap">{f.sub}</span>}</span>
                <span className="dpc-pt">{chipGan(f, compacto, enCurso, nom)}</span>
                <span className="dpc-v tabular-nums">{valorFila(f, 'c')}</span>
                <div className="dpc-bb">
                  {num ? (
                    <>
                      <i className="dpc-l" style={{ width: `${(f.c! / mx) * 100}%` }} />
                      <i className="dpc-rr" style={{ width: `${(f.r! / mx) * 100}%` }} />
                    </>
                  ) : <><i /><i /></>}
                </div>
                <span className="dpc-v dpc-v2 tabular-nums">{valorFila(f, 'r')}</span>
              </div>
            )
          })}
        </div>
      </section>

      <section className="dpc-sec dpc-hist">
        <div className="dpc-hd">
          <h3>Jornadas de {per.mes.etiqueta.toLowerCase()}</h3>
          <span className="dpc-sub">jornadas ganadas: {nom('cardenas')} {per.mes.jc} – {per.mes.jr} {nom('rebolledo')}</span>
        </div>
        <div className="dpc-ht dpc-ht-h">
          <span data-tip="Jornada: el turno de noche más el de día que se comparan entre sí." tabIndex={0}>{compacto ? 'Fecha' : 'Jornada'}</span>
          <span data-tip="Piezas del turno de noche. El punto de color es el equipo que lo jugó; al pasar el mouse por la fila se nombra." tabIndex={0}>{compacto ? 'Noche' : 'Noche (pz)'}</span>
          <span data-tip="Piezas del turno de día. El punto de color es el equipo que lo jugó; al pasar el mouse por la fila se nombra." tabIndex={0}>{compacto ? 'Día' : 'Día (pz)'}</span>
          <span data-tip="Quién ganó la jornada y con cuántos puntos (el mayor primero)." tabIndex={0}>{compacto ? 'Ganó' : 'Ganó (puntos)'}</span>
          <span className="dpc-d" data-tip="Ventaja en piezas del ganador sobre el perdedor. Si es negativa, ganó por puntos con menos piezas." tabIndex={0}>Ventaja</span>
        </div>
        <div ref={refH} className="dpc-hist-cuerpo" style={{ gridTemplateRows: `repeat(${Math.max(1, visibles.length)}, minmax(0, 1fr))` }}>
          {visibles.map((f) => (
            <div key={f.jornada} className={`dpc-ht ${f.vivo ? 'dpc-vivo' : ''}`} data-tip={tipFilaJornada(f, { cardenas: nom('cardenas'), rebolledo: nom('rebolledo') })} tabIndex={0}>
              <span className="tabular-nums">{fechaCorta(f.jornada)}</span>
              {pzEq(f.noche)}
              {pzEq(f.dia)}
              {f.vivo
                ? <span className="text-muted-foreground" style={{ fontWeight: 400 }}>{f.vivo}</span>
                : <span>{f.ganador && f.ganador !== 'empate' ? <b style={{ color: COLOR_EQUIPO_TEXTO[f.ganador] }}>{nom(f.ganador)}</b> : 'empate'} {f.puntos && !compacto && <span className="tabular-nums text-muted-foreground">{Math.max(f.puntos.c, f.puntos.r)}–{Math.min(f.puntos.c, f.puntos.r)}</span>}</span>}
              <span className={`dpc-d tabular-nums ${f.dif != null && f.dif < 0 ? 'text-muted-foreground' : ''}`}>{f.dif != null ? <>{firmado(f.dif)}<span className="dpc-un">pz</span></> : '—'}</span>
            </div>
          ))}
        </div>
        <div className="dpc-cap" style={{ paddingTop: 4 }}>
          {resto > 0 ? `y ${resto} ${resto === 1 ? 'jornada más' : 'jornadas más'} del mes · ` : ''}{recTxt ? `Récords publicados: ${recTxt}` : ''}
        </div>
      </section>
    </section>
  )
}

// ── La vista ─────────────────────────────────────────────────────────────────

export function DueloPC(p: DueloPCProps) {
  const { datos: d, extra } = p
  const compacto = useCompactoPC()
  const reloj = useRelojDeDatos(!d.hoy.cerrado ? extra.lectura : null, extra.semilla)
  const lados = useMemo(
    () => construirLados({ d, nombres: p.nombres, live: extra.live, stats: extra.stats, serieHoy: extra.serieHoy, series: extra.series }),
    [d, p.nombres, extra.live, extra.stats, extra.serieHoy, extra.series],
  )
  const { manejadores, globo } = useGloboDuelo()
  return (
    <div className="duelo-pcb" data-c={compacto ? '1' : undefined} {...manejadores}>
      {p.superior && <div className="dpc-top">{p.superior}</div>}
      <div className="dpc-grid">
        <Lienzo p={p} d={d} lados={lados} reloj={reloj} compacto={compacto} />
        <PorQue d={d} nombres={p.nombres} extra={extra} compacto={compacto} lados={lados} />
        <SemanaASemana d={d} compacto={compacto} nombres={p.nombres} />
        <Riel d={d} nombres={p.nombres} lados={lados} unidad={p.unidad} compacto={compacto} />
      </div>
      {globo}
    </div>
  )
}
