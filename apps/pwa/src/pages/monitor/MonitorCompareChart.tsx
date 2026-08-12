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
 * SVG puro: el bundle público no carga librerías de gráficos. Las ETIQUETAS,
 * en cambio, son HTML: el SVG se estira horizontalmente con el zoom
 * (`preserveAspectRatio="none"`) y un `<text>` adentro se deforma con él.
 */

import { useMemo, useState } from 'react'
import type { CompareResult, PacePoint } from '@/services/shoplogix/monitorCompare'
import { COLORES, COLOR_META } from './monitorColors'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

/** Coordenadas internas del SVG. Alto en px del área de dibujo. */
const W = 100
const H = 100
const ALTO_CHICO = 'h-32'
const ALTO_GRANDE = 'h-56'

export function MonitorCompareChart({ cmp, visibles }: {
  cmp: CompareResult
  /** dateKeys que se dibujan. Hoy siempre entra. */
  visibles: Set<string>
}) {
  const [alto, setAlto] = useState(false)
  /*
   * Zoom horizontal con paneo. Un turno de 8 h en 320 px deja cada tramo de 5
   * min en menos de 4 px: la forma general se ve, pero el tramo donde se abrió
   * la brecha no se puede mirar de cerca. Ampliando el ancho dentro de un
   * contenedor con scroll, se hace zoom y se desliza.
   */
  const [zoom, setZoom] = useState(1)

  const dibujados = useMemo(
    () => cmp.days.filter((d) => d.esHoy || visibles.has(d.dateKey)),
    [cmp.days, visibles],
  )

  const { maxMin, maxPz } = useMemo(() => {
    const mm = Math.max(cmp.maxMinutes, cmp.optimal?.[cmp.optimal.length - 1]?.minutes ?? 0, 60)
    const mp = Math.max(
      ...dibujados.map((d) => d.totalPieces),
      cmp.optimal?.[cmp.optimal.length - 1]?.pieces ?? 0,
      1,
    )
    return { maxMin: mm, maxPz: mp }
  }, [cmp, dibujados])

  if (cmp.days.length === 0 || cmp.currentMinute == null) return null

  /** Fracción 0-1 del ancho/alto: sirve para el SVG y para las etiquetas HTML. */
  const fx = (m: number) => m / maxMin
  const fy = (p: number) => 1 - p / maxPz

  const x = (m: number) => fx(m) * W
  const y = (p: number) => fy(p) * H
  const hoy = cmp.days.find((d) => d.esHoy)

  const path = (curve: PacePoint[]) =>
    curve.length === 0
      ? ''
      : curve
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minutes).toFixed(2)},${y(p.pieces).toFixed(2)}`)
          .join(' ')

  /* Marcas cada hora de TURNO: h+1, h+2… Es el eje que se puede comparar. */
  const marcas: number[] = []
  const cadaHora = zoom >= 2 ? 60 : 120
  for (let m = cadaHora; m <= maxMin; m += cadaHora) marcas.push(m)

  const lineas = [0.25, 0.5, 0.75, 1]

  return (
    <div>
      <div className="flex gap-1">
        {/*
          * La escala vertical queda FUERA del área con scroll: adentro se iría
          * con el paneo y dejaría las curvas sin referencia justo cuando uno
          * está mirando un tramo de cerca.
          */}
        <div className={`relative w-7 shrink-0 ${alto ? ALTO_GRANDE : ALTO_CHICO} transition-[height] duration-200`}>
          {[maxPz, maxPz / 2].map((v) => (
            <span
              key={v}
              className="absolute right-0 -translate-y-1/2 text-[9px] tabular-nums text-muted-foreground"
              style={{ top: `${fy(v) * 100}%` }}
            >
              {fmtInt(v)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div
            className="relative"
            style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
            data-zoom={zoom}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className={`w-full ${alto ? ALTO_GRANDE : ALTO_CHICO} transition-[height] duration-200`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Piezas acumuladas por minuto de turno, hoy contra días anteriores"
            >
              {/*
                * Las paradas de convenio, pintadas de fondo. Sin ellas la meseta
                * de la curva objetivo parece un error del gráfico; con ellas se
                * lee "acá la línea está parada por convenio: no se produce, y la
                * meta tampoco sube".
                */}
              {cmp.breaks.map((b) => (
                <rect
                  key={`${b.fromMin}-${b.toMin}`}
                  x={x(b.fromMin)}
                  y={0}
                  width={Math.max(0.3, x(b.toMin) - x(b.fromMin))}
                  height={H}
                  className="fill-muted-foreground/15"
                />
              ))}

              {lineas.map((f) => (
                <line key={f} x1={0} x2={W} y1={y(maxPz * f)} y2={y(maxPz * f)}
                  stroke="currentColor" strokeWidth="0.25" strokeDasharray="1.5 1.5"
                  className="text-border" vectorEffect="non-scaling-stroke" />
              ))}

              {marcas.map((m) => (
                <line key={m} x1={x(m)} x2={x(m)} y1={0} y2={H} stroke="currentColor"
                  strokeWidth="0.25" strokeDasharray="1.5 2" className="text-border"
                  vectorEffect="non-scaling-stroke" />
              ))}

              {/* la cuota, punteada: la referencia contra la que se mide todo */}
              {cmp.optimal && (
                <path d={path(cmp.optimal)} fill="none" stroke={COLOR_META} strokeWidth="1.5"
                  strokeDasharray="5 4" opacity="0.9" vectorEffect="non-scaling-stroke" />
              )}

              {/* días anteriores primero: hoy va encima y más grueso */}
              {[...dibujados].reverse().map((d) => {
                const i = cmp.days.indexOf(d)
                return (
                  <path key={d.dateKey} d={path(d.curve)} fill="none"
                    stroke={COLORES[i % COLORES.length]} strokeWidth={d.esHoy ? 2.4 : 1.4}
                    opacity={d.esHoy ? 1 : 0.8} vectorEffect="non-scaling-stroke" />
                )
              })}

              {/* dónde va el turno ahora */}
              {hoy?.atCurrentMinute != null && (
                <circle cx={x(cmp.currentMinute)} cy={y(hoy.atCurrentMinute)} r="1.2"
                  fill={COLORES[0]} vectorEffect="non-scaling-stroke" />
              )}
            </svg>

            {/* Eje de horas: HTML, dentro del área escalada para que viaje con
                el paneo, pero sin deformarse como lo haría un <text> del SVG. */}
            <div className="relative h-4">
              {marcas.map((m) => (
                <span
                  key={m}
                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums text-muted-foreground"
                  style={{ left: `${fx(m) * 100}%` }}
                >
                  h+{m / 60}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        {cmp.optimal && (
          <span className="flex items-center gap-1.5">
            <i className="h-1.5 w-4 rounded-full" style={{ background: COLOR_META }} />
            Para la cuota
          </span>
        )}
        {cmp.breaks.length > 0 && (
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/25" />
            paradas de convenio
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {[1, 2, 4].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoom(z)}
              aria-pressed={zoom === z}
              className={`rounded-full border px-1.5 py-0.5 tabular-nums ${
                zoom === z
                  ? 'border-sky-500/50 bg-sky-500/20 text-sky-800 dark:text-sky-200'
                  : 'border-border hover:bg-muted'
              }`}
            >
              {z}×
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAlto((v) => !v)}
            className="rounded-full border border-border px-2 py-0.5 hover:bg-muted"
          >
            {alto ? 'achicar' : 'agrandar'}
          </button>
        </span>
      </div>
    </div>
  )
}
