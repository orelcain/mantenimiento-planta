/**
 * Gráfico de la carrera del Duelo: el turno de hoy contra el «fantasma» (el último turno del equipo rival en el mismo
 * horario, o su promedio si ese turno no trae curva) y, opcional, la banda gris del promedio y el rango del rival.
 *
 * Mismo lenguaje que la curva de «Piezas ahora»: sistema 0–100 estirado al alto, trazo que no escala, puntos en
 * HTML, cursor con globo. El eje X es el tiempo de turno desde la primera pieza (las dos curvas parten del mismo
 * origen); el eje Y arranca en 0. Cada línea lleva el color FIJO de su equipo (`COLOR_EQUIPO`), su nombre y su total
 * al final; la franja entre las dos toma el color de quien va adelante; el globo muestra a los dos y la diferencia.
 */
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PacePoint } from '@/services/shoplogix/monitorCompare'
import { Globo } from './AmpliarV2'
import { bandasDeHoras, etiquetaHora, franjasEntre, horaTranscurrida, piezasAlMinuto, type BandaRival, type EventoTurno } from './duelo'

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const minutosTxt = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)

/** Curva suave (Catmull-Rom → Bézier), la misma de las curvas del turno. */
function suave(ps: Array<[number, number]>): string {
  if (ps.length < 2) return ''
  let d = `M${ps[0]![0].toFixed(2)},${ps[0]![1].toFixed(2)}` // decimal-tecnico: coordenadas SVG
  for (let i = 0; i < ps.length - 1; i++) {
    const p0 = ps[Math.max(0, i - 1)]!, p1 = ps[i]!, p2 = ps[i + 1]!, p3 = ps[Math.min(ps.length - 1, i + 2)]!
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0]!.toFixed(2)},${c1[1]!.toFixed(2)} ${c2[0]!.toFixed(2)},${c2[1]!.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}` // decimal-tecnico: coordenadas SVG
  }
  return d
}

export interface SerieCarrera {
  /** Quién es, para el final de la línea y el globo («Cárdenas»). */
  nombre: string
  /** Lo que dice la leyenda («Rebolledo · sáb 17/10»); sin él, el nombre. */
  rotulo?: string
  /** Color fijo del equipo (`COLOR_EQUIPO`) para trazos y marcas. */
  color: string
  /** Variante del mismo color para TEXTO (`COLOR_EQUIPO_TEXTO`, contraste ≥ 4,5:1); sin ella se usa `color`. */
  colorTexto?: string
  curva: readonly PacePoint[]
  /** Paradas de 5 min o más, en el eje de horas de producción de esta serie. */
  eventos?: readonly EventoTurno[]
  /** Hora de reloj de planta a los `min` minutos de producción; null si no se sabe. */
  reloj?: (min: number) => string | null
}

export interface CarreraDueloProps {
  /** Quién corre hoy y su curva (desde la primera pieza). */
  hoy: SerieCarrera
  /** El fantasma: la curva completa de un turno cerrado (o el promedio del rival). */
  rival?: SerieCarrera | null
  banda?: BandaRival | null
  /** Rótulo de la banda en la leyenda («Rebolledo · promedio y rango de 4 turnos»). */
  bandaRotulo?: string
  /** Dibuja la línea del promedio de la banda (no cuando el fantasma ya ES el promedio). */
  conMediaDeBanda?: boolean
  /** Alto fijo en px; sin él, 190 en celular y 260 en PC. */
  alto?: number
  /** Versión de la tarjeta exprés: sin ejes, sin leyenda, sin cursor. */
  mini?: boolean
  ariaLabel: string
}

export function CarreraDueloV2({ hoy, rival, banda, bandaRotulo, conMediaDeBanda = true, alto, mini, ariaLabel }: CarreraDueloProps) {
  const [m, setM] = useState<number | null>(null)
  const ultHoy = hoy.curva[hoy.curva.length - 1]
  const ultRival = rival?.curva[rival.curva.length - 1]
  const maxMin = Math.max(1, ultHoy?.minutes ?? 0, ultRival?.minutes ?? 0, banda?.media[banda.media.length - 1]?.minutes ?? 0)
  const techo = Math.max(
    1,
    ...hoy.curva.map((p) => p.pieces),
    ...(rival?.curva.map((p) => p.pieces) ?? []),
    ...(banda?.max.map((p) => p.pieces) ?? []),
  )
  /* Con los rótulos al final de las líneas hace falta aire arriba. */
  const max = techo * (mini ? 1.06 : 1.16)
  const X = (min: number) => (min / maxMin) * 100
  const Y = (v: number) => 100 - (v / max) * 100
  const pts = (ps: readonly PacePoint[]) => [[0, Y(0)] as [number, number], ...ps.map((p) => [X(p.minutes), Y(p.pieces)] as [number, number])]
  const horasEje = bandasDeHoras(maxMin)
  const mover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setM(Math.max(0, Math.min(maxMin, ((e.clientX - r.left) / r.width) * maxMin)))
  }
  const vHoy = m != null ? (m <= (ultHoy?.minutes ?? 0) ? piezasAlMinuto(hoy.curva, m) : null) : null
  const vRival = m != null && rival ? piezasAlMinuto(rival.curva, m) : null
  const punto = (v: number | null, color: string, r: number) => v != null && m != null && (
    <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[rgb(var(--card))]" style={{ left: `${X(m)}%`, top: `${Y(v)}%`, width: r * 2, height: r * 2, background: color }} />
  )
  const bandaPath = banda && banda.min.length > 1
    ? `${suave([[0, Y(0)], ...banda.max.map((p) => [X(p.minutes), Y(p.pieces)] as [number, number])])} L${[...banda.min].reverse().map((p) => `${X(p.minutes).toFixed(2)},${Y(p.pieces).toFixed(2)}`).join(' L')} L0,${Y(0).toFixed(2)} Z` // decimal-tecnico: coordenadas SVG
    : null

  /* La franja entre las dos curvas, hasta donde las dos existen: el color es el de quien va adelante. */
  const hasta = rival && ultHoy ? Math.min(ultHoy.minutes, ultRival?.minutes ?? 0) : 0
  const franjas = rival ? franjasEntre(hoy.curva, rival.curva, hasta) : []
  const poligono = (ps: Array<{ m: number; a: number; b: number }>) =>
    `${ps.map((p) => `${X(p.m).toFixed(2)},${Y(p.a).toFixed(2)}`).join(' ')} ${[...ps].reverse().map((p) => `${X(p.m).toFixed(2)},${Y(p.b).toFixed(2)}`).join(' ')}` // decimal-tecnico: coordenadas SVG

  /* Final de cada línea: nombre y total. El que va arriba se rotula encima de su punto; el de abajo, debajo. */
  const finHoy = ultHoy ? { x: X(ultHoy.minutes), y: Y(ultHoy.pieces), v: ultHoy.pieces } : null
  const finRival = rival && ultRival ? { x: X(ultRival.minutes), y: Y(ultRival.pieces), v: ultRival.pieces } : null
  const rotuloFin = (serie: SerieCarrera, fin: { x: number; y: number; v: number }, arriba: boolean) => {
    const aLaIzquierda = fin.x < 38
    return (
      <span
        key={serie.nombre + fin.v}
        className="pointer-events-none absolute whitespace-nowrap rounded-ctl px-1 py-0.5 text-[13px] font-semibold leading-none tabular-nums"
        style={{
          background: 'rgb(var(--card) / 0.88)',
          top: `${fin.y}%`,
          ...(aLaIzquierda ? { left: `calc(${fin.x}% + 10px)` } : { right: `calc(${100 - fin.x}% + 4px)` }),
          transform: aLaIzquierda ? 'translateY(-50%)' : `translateY(${arriba ? 'calc(-100% - 7px)' : '9px'})`,
          color: serie.colorTexto ?? serie.color,
        }}
      >
        {serie.nombre} {int(fin.v)} pz
      </span>
    )
  }
  const hoyArriba = !finRival || (finHoy?.v ?? 0) >= finRival.v

  const carril = (serie: SerieCarrera) => (
    <div className="relative h-1.5" aria-hidden="true">
      {(serie.eventos ?? []).map((ev, i) => (
        <span
          key={i}
          className="absolute top-0 h-full rounded-full"
          style={{ left: `${X(ev.desde)}%`, width: `max(3px, ${(Math.min(ev.hasta, maxMin) - ev.desde) / maxMin * 100}%)`, background: serie.color, opacity: ev.programada ? 0.4 : 0.95 }}
        />
      ))}
    </div>
  )
  const eventosEn = (serie: SerieCarrera, min: number) => (serie.eventos ?? []).filter((ev) => min >= ev.desde && min <= ev.hasta)
  const hayParadas = (hoy.eventos?.length ?? 0) + (rival?.eventos?.length ?? 0) > 0
  const relojHoy = m != null ? hoy.reloj?.(m) ?? null : null
  const relojRival = m != null ? rival?.reloj?.(m) ?? null : null
  const carrilHoy = !mini && (hoy.eventos?.length ?? 0) > 0

  return (
    <div className="mt-3">
      {carrilHoy && <div className="mb-6">{carril(hoy)}</div>}
      <div
        className={`relative touch-pan-y select-none ${alto || mini ? '' : 'h-[190px] lg:h-[260px] xl:h-[300px]'} ${!mini && !carrilHoy ? 'mt-3' : ''}`}
        style={alto ? { height: alto } : mini ? { height: 56 } : undefined}
        onPointerMove={mini ? undefined : mover}
        onPointerDown={mini ? undefined : (e) => { e.stopPropagation(); mover(e) }}
        onClick={(e) => e.stopPropagation()}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setM(null) }}
        role="img"
        aria-label={ariaLabel}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {!mini && [0.25, 0.5, 0.75, 1].map((f) => (
            <line key={f} x1={0} x2={100} y1={Y(techo * f)} y2={Y(techo * f)} stroke="var(--v2-reja)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {!mini && horasEje.slice(1).map((h) => (
            <line key={`h${h.n}`} x1={X(h.desde)} x2={X(h.desde)} y1={0} y2={100} stroke="var(--v2-reja)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {bandaPath && <path d={bandaPath} fill="var(--v2-tenue)" fillOpacity={0.16} stroke="none" />}
          {banda && conMediaDeBanda && banda.media.length > 1 && (
            <path d={suave(pts(banda.media))} fill="none" stroke="var(--v2-tenue)" strokeWidth={1.5} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          )}
          {franjas.map((t, i) => (
            <polygon key={i} points={poligono(t.puntos)} fill={t.adelante === 'a' ? hoy.color : rival!.color} fillOpacity={0.2} stroke="none" />
          ))}
          {rival && rival.curva.length > 1 && (
            <path d={suave(pts(rival.curva))} fill="none" stroke={rival.color} strokeWidth={mini ? 2 : 2.5} strokeLinecap="round" strokeDasharray="7 5" vectorEffect="non-scaling-stroke" />
          )}
          {hoy.curva.length > 1 && (
            <path d={suave(pts(hoy.curva))} fill="none" stroke={hoy.color} strokeWidth={mini ? 2.5 : 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {ultHoy && m == null && (
          <span className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${X(ultHoy.minutes)}%`, top: `${Y(ultHoy.pieces)}%`, background: hoy.color }} />
        )}
        {/* A la misma hora: donde estaba el fantasma cuando hoy llegó hasta acá. */}
        {!mini && rival && ultHoy && m == null && ultHoy.minutes < (ultRival?.minutes ?? 0) - 1 && (() => {
          const v = piezasAlMinuto(rival.curva, ultHoy.minutes)
          return v != null ? <span className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${X(ultHoy.minutes)}%`, top: `${Y(v)}%`, background: rival.color, opacity: 0.7 }} /> : null
        })()}
        {!mini && m == null && finHoy && rotuloFin(hoy, finHoy, hoyArriba)}
        {!mini && m == null && finRival && rival && rotuloFin(rival, finRival, !hoyArriba)}
        {!mini && m != null && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px" style={{ left: `${X(m)}%`, background: 'var(--v2-tenue)' }} />
            {punto(vRival, rival?.color ?? 'var(--v2-tenue)', 4)}
            {punto(vHoy, hoy.color, 5)}
            <Globo x={X(m)}>
              <div className="font-medium tabular-nums text-foreground">
                {etiquetaHora(horaTranscurrida(m))} <span className="font-normal text-muted-foreground">· {minutosTxt(m)} de producción</span>
              </div>
              {vHoy != null && (
                <div className="tabular-nums text-foreground"><span style={{ color: hoy.color }}>●</span> {hoy.nombre} {int(vHoy)} pz{relojHoy && <span className="text-muted-foreground"> · a las {relojHoy}</span>}</div>
              )}
              {vRival != null && rival && (
                <div className="tabular-nums text-foreground"><span style={{ color: rival.color }}>●</span> {rival.nombre} {int(vRival)} pz{relojRival && <span className="text-muted-foreground"> · a las {relojRival}</span>}</div>
              )}
              {vHoy != null && vRival != null && rival && (
                vHoy === vRival
                  ? <div className="tabular-nums text-muted-foreground">Parejos</div>
                  : <div className="font-medium tabular-nums" style={{ color: vHoy > vRival ? (hoy.colorTexto ?? hoy.color) : (rival.colorTexto ?? rival.color) }}>{vHoy > vRival ? hoy.nombre : rival.nombre} +{int(Math.abs(vHoy - vRival))} pz</div>
              )}
              {[hoy, rival].flatMap((serie) => (serie ? eventosEn(serie, m).map((ev) => (
                <div key={`${serie.nombre}${ev.desde}${ev.causa}`} className="tabular-nums text-muted-foreground"><span style={{ color: serie.color }}>▪</span> {serie.nombre} · {ev.corta} ({minutosTxt(ev.hasta - ev.desde)})</div>
              )) : []))}
            </Globo>
          </>
        )}
        {!mini && (
          <span className="pointer-events-none absolute left-0 top-0 -translate-y-full text-[11px] tabular-nums text-muted-foreground">eje: hasta {int(techo)} pz acumuladas</span>
        )}
      </div>
      {!mini && rival && rival.eventos && rival.eventos.length > 0 && <div className="mt-2">{carril(rival)}</div>}
      {!mini && (
        <>
          <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-muted-foreground">
            {horasEje.filter((h) => h.hasta - h.desde >= 20).map((h) => (
              <span key={h.n} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${X((h.desde + h.hasta) / 2)}%` }}>
                <span className="lg:hidden">{h.n}ª</span><span className="hidden lg:inline">{etiquetaHora(h.n)}</span>
              </span>
            ))}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Horas de producción: se cuentan desde la primera pieza de cada turno, igual para los dos equipos.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="h-[3px] w-4 rounded-full" style={{ background: hoy.color }} />{hoy.rotulo ?? hoy.nombre}</span>
            {rival && <span className="inline-flex items-center gap-1.5"><i className="h-0 w-4 border-t-[3px] border-dashed" style={{ borderColor: rival.color }} />{rival.rotulo ?? rival.nombre}</span>}
            {banda && <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 rounded-[3px]" style={{ background: 'var(--v2-tenue)', opacity: 0.35 }} />{bandaRotulo ?? `Promedio y rango del rival (${banda.turnos} turnos)`}</span>}
            {hayParadas && <span className="inline-flex items-center gap-1.5"><i className="h-1.5 w-4 rounded-full" style={{ background: 'var(--v2-tenue)' }} />Paradas de 5 min o más en alguna máquina (las programadas, más suaves)</span>}
          </div>
        </>
      )}
    </div>
  )
}
