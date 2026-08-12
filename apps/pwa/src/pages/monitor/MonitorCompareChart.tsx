/**
 * Comparación fina: hoy contra los turnos anteriores y contra la cuota, tramo a
 * tramo de 5 minutos.
 *
 * La pregunta que viene a habilitar es la de Orel: *"¿por qué hoy vamos más
 * lento que ayer a la misma hora... qué pasó que nos atrasó?"*. Con barras por
 * día eso no se puede ver — hace falta la curva completa, porque el atraso se
 * produce en un tramo concreto y se arrastra el resto del turno.
 *
 * ⚠ El eje es MINUTOS DESDE EL ARRANQUE, no hora de reloj. Los turnos empiezan
 * 07:45, 07:48, 08:00: por hora de reloj la primera "hora" de un día son 15
 * minutos y la de otro 60, y la comparación se rompe justo en el tramo que más
 * se mira. Es además como cuenta Shoplogix.
 *
 * SVG puro: el bundle público no carga librerías de gráficos.
 */

import { useMemo, useState } from 'react'
import type { CompareResult, PacePoint } from '@/services/shoplogix/monitorCompare'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

/** Hoy primero. El gris queda para los días viejos, que son contexto. */
const COLORES = ['#38bdf8', '#a78bfa', '#94a3b8', '#f472b6']
const COLOR_META = '#f59e0b'

const W = 320
const H = 132
const PAD_L = 30
const PAD_B = 16

function path(curve: PacePoint[], maxMin: number, maxPz: number): string {
  if (curve.length === 0) return ''
  const x = (m: number) => PAD_L + (m / Math.max(maxMin, 1)) * (W - PAD_L - 4)
  const y = (p: number) => H - PAD_B - (p / Math.max(maxPz, 1)) * (H - PAD_B - 6)
  return curve.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minutes).toFixed(1)},${y(p.pieces).toFixed(1)}`).join(' ')
}

export function MonitorCompareChart({ cmp }: { cmp: CompareResult }) {
  const [zoom, setZoom] = useState(false)

  const { maxMin, maxPz } = useMemo(() => {
    const mm = Math.max(cmp.maxMinutes, cmp.optimal?.[cmp.optimal.length - 1]?.minutes ?? 0, 60)
    const mp = Math.max(
      ...cmp.days.map((d) => d.totalPieces),
      cmp.optimal?.[cmp.optimal.length - 1]?.pieces ?? 0,
      1,
    )
    return { maxMin: mm, maxPz: mp }
  }, [cmp])

  if (cmp.days.length === 0 || cmp.currentMinute == null) return null

  const x = (m: number) => PAD_L + (m / maxMin) * (W - PAD_L - 4)
  const y = (p: number) => H - PAD_B - (p / maxPz) * (H - PAD_B - 6)
  const hoy = cmp.days.find((d) => d.esHoy)

  /* Marcas cada hora de TURNO: h+1, h+2… Es el eje que se puede comparar. */
  const marcas: number[] = []
  for (let m = 60; m <= maxMin; m += 60) marcas.push(m)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={`w-full ${zoom ? 'h-64' : 'h-36'} transition-[height] duration-200`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Piezas acumuladas por minuto de turno, hoy contra días anteriores"
      >
        {/* grilla horizontal */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD_L} x2={W - 4} y1={y(maxPz * f)} y2={y(maxPz * f)}
            stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 3" className="text-border" />
        ))}
        <text x="0" y={y(maxPz) + 3} className="fill-current text-muted-foreground" style={{ fontSize: 7 }}>
          {fmtInt(maxPz)}
        </text>
        <text x="0" y={y(maxPz / 2) + 3} className="fill-current text-muted-foreground" style={{ fontSize: 7 }}>
          {fmtInt(maxPz / 2)}
        </text>

        {/* marcas horarias del turno */}
        {marcas.map((m) => (
          <g key={m}>
            <line x1={x(m)} x2={x(m)} y1={6} y2={H - PAD_B} stroke="currentColor" strokeWidth="0.5"
              strokeDasharray="2 4" className="text-border" />
            <text x={x(m)} y={H - 5} textAnchor="middle" className="fill-current text-muted-foreground"
              style={{ fontSize: 7 }}>
              h+{m / 60}
            </text>
          </g>
        ))}

        {/* la cuota, punteada: la referencia contra la que se mide todo */}
        {cmp.optimal && (
          <path d={path(cmp.optimal, maxMin, maxPz)} fill="none" stroke={COLOR_META}
            strokeWidth="1.5" strokeDasharray="4 3" opacity="0.85" />
        )}

        {/* días anteriores primero: hoy va encima y más grueso */}
        {[...cmp.days].reverse().map((d) => {
          const i = cmp.days.indexOf(d)
          return (
            <path key={d.dateKey} d={path(d.curve, maxMin, maxPz)} fill="none"
              stroke={COLORES[i % COLORES.length]} strokeWidth={d.esHoy ? 2.4 : 1.4}
              opacity={d.esHoy ? 1 : 0.75} />
          )
        })}

        {/* dónde va el turno ahora */}
        {hoy?.atCurrentMinute != null && (
          <circle cx={x(cmp.currentMinute)} cy={y(hoy.atCurrentMinute)} r="3" fill={COLORES[0]} />
        )}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {cmp.days.map((d, i) => (
          <span key={d.dateKey} className="flex items-center gap-1.5">
            <i className="h-1.5 w-4 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
            {d.label}
          </span>
        ))}
        {cmp.optimal && (
          <span className="flex items-center gap-1.5">
            <i className="h-1.5 w-4 rounded-full" style={{ background: COLOR_META }} />
            Para la cuota
          </span>
        )}
        <button
          type="button"
          onClick={() => setZoom((v) => !v)}
          className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] hover:bg-muted"
        >
          {zoom ? 'achicar' : 'agrandar'}
        </button>
      </div>
    </div>
  )
}
