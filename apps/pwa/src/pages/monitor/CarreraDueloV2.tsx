/**
 * Gráfico de la carrera del Duelo: el turno de hoy contra el «fantasma» (el último turno del rival en el mismo
 * horario, o el último del otro horario) y, opcional, la banda del promedio del rival.
 *
 * Mismo lenguaje que la curva de «Piezas ahora»: sistema 0–100 estirado al alto, trazo que no escala, puntos en
 * HTML, cursor con globo. El eje X es el tiempo de turno desde la primera pieza (las dos curvas parten del mismo
 * origen); el eje Y arranca en 0. Colores solo de los tokens `--v2-*`: hoy = acento, rival = gris, banda = gris tenue.
 */
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { PacePoint } from '@/services/shoplogix/monitorCompare'
import { Globo } from './AmpliarV2'
import { piezasAlMinuto, type BandaRival } from './duelo'

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const firmado = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`
const relojDe = (ms: number) => new Date(ms).toISOString().slice(11, 16)

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

export interface CarreraDueloProps {
  /** Quién corre hoy y su curva (desde la primera pieza). */
  hoy: { etiqueta: string; curva: readonly PacePoint[] }
  /** El fantasma: la curva completa de un turno cerrado. */
  rival?: { etiqueta: string; curva: readonly PacePoint[] } | null
  banda?: BandaRival | null
  /** Hora de planta de la primera pieza de hoy (ms wall-clock): el eje y el globo hablan en reloj. */
  inicioMs?: number | null
  /** Alto fijo en px; sin él, 190 en celular y 260 en PC. */
  alto?: number
  /** Versión de la tarjeta exprés: sin ejes, sin leyenda, sin cursor. */
  mini?: boolean
  ariaLabel: string
}

export function CarreraDueloV2({ hoy, rival, banda, inicioMs, alto, mini, ariaLabel }: CarreraDueloProps) {
  const [m, setM] = useState<number | null>(null)
  const ultHoy = hoy.curva[hoy.curva.length - 1]
  const maxMin = Math.max(
    1,
    ultHoy?.minutes ?? 0,
    rival?.curva[rival.curva.length - 1]?.minutes ?? 0,
    banda?.media[banda.media.length - 1]?.minutes ?? 0,
  )
  const techo = Math.max(
    1,
    ...hoy.curva.map((p) => p.pieces),
    ...(rival?.curva.map((p) => p.pieces) ?? []),
    ...(banda?.max.map((p) => p.pieces) ?? []),
  )
  const max = techo * 1.06
  const X = (min: number) => (min / maxMin) * 100
  const Y = (v: number) => 100 - (v / max) * 100
  const pts = (ps: readonly PacePoint[]) => [[0, Y(0)] as [number, number], ...ps.map((p) => [X(p.minutes), Y(p.pieces)] as [number, number])]
  const marcas = Array.from({ length: Math.floor(maxMin / 120) + 1 }, (_, i) => i * 120)
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

  return (
    <div className={mini ? 'mt-3' : 'mt-4'}>
      <div
        className={`relative touch-pan-y select-none ${alto || mini ? '' : 'h-[190px] lg:h-[260px]'}`}
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
          {bandaPath && <path d={bandaPath} fill="var(--v2-tenue)" fillOpacity={0.16} stroke="none" />}
          {banda && banda.media.length > 1 && (
            <path d={suave(pts(banda.media))} fill="none" stroke="var(--v2-tenue)" strokeWidth={1.5} strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          )}
          {rival && rival.curva.length > 1 && (
            <path d={suave(pts(rival.curva))} fill="none" stroke="var(--v2-secundaria)" strokeWidth={mini ? 2 : 2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          {hoy.curva.length > 1 && (
            <path d={suave(pts(hoy.curva))} fill="none" stroke="var(--v2-acento)" strokeWidth={mini ? 2.5 : 3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {ultHoy && m == null && (
          <span className="pointer-events-none absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${X(ultHoy.minutes)}%`, top: `${Y(ultHoy.pieces)}%`, background: 'var(--v2-acento)' }} />
        )}
        {!mini && m != null && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px" style={{ left: `${X(m)}%`, background: 'var(--v2-tenue)' }} />
            {punto(vRival, 'var(--v2-secundaria)', 4)}
            {punto(vHoy, 'var(--v2-acento)', 5)}
            <Globo x={X(m)}>
              <div className="font-medium tabular-nums text-foreground">
                {inicioMs != null ? relojDe(inicioMs + m * 60_000) : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`}
              </div>
              {vHoy != null && <div className="tabular-nums"><span style={{ color: 'var(--v2-acento)' }}>●</span> {hoy.etiqueta} {int(vHoy)} pz</div>}
              {vRival != null && rival && <div className="tabular-nums text-muted-foreground">● {rival.etiqueta} {int(vRival)} pz{vHoy != null ? ` (${firmado(vHoy - vRival)})` : ''}</div>}
            </Globo>
          </>
        )}
        {!mini && (
          <span className="pointer-events-none absolute left-0 top-0 -translate-y-full text-[11px] tabular-nums text-muted-foreground">{int(techo)} pz</span>
        )}
      </div>
      {!mini && (
        <>
          <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-muted-foreground">
            {marcas.map((mm) => (
              <span key={mm} className={`absolute ${mm === 0 ? '' : '-translate-x-1/2'}`} style={{ left: `${X(mm)}%` }}>
                {inicioMs != null ? relojDe(inicioMs + mm * 60_000) : `${mm / 60} h`}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="h-[3px] w-4 rounded-full" style={{ background: 'var(--v2-acento)' }} />{hoy.etiqueta}</span>
            {rival && <span className="inline-flex items-center gap-1.5"><i className="h-[3px] w-4 rounded-full" style={{ background: 'var(--v2-secundaria)' }} />{rival.etiqueta}</span>}
            {banda && <span className="inline-flex items-center gap-1.5"><i className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: 'var(--v2-tenue)' }} />Promedio del rival ({banda.turnos} turnos)</span>}
          </div>
        </>
      )}
    </div>
  )
}
