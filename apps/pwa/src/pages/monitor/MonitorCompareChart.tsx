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

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { diffCurve, type CompareResult, type PacePoint } from '@/services/shoplogix/monitorCompare'
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
  /*
   * Dos modos. El de DIFERENCIA es el que viene primero porque responde la
   * pregunta sin que haya que interpretar nada: la línea de cero es "empatados",
   * arriba vas mejor, abajo vas peor, y donde BAJA es donde perdiste terreno.
   * Con el acumulado hay que comparar alturas de dos curvas paralelas, y con
   * seis días encima eso ya no se lee.
   */
  const [modo, setModo] = useState<"dif" | "acum">("dif")
  /*
   * La cuota se puede apagar. Su diferencia es mucho más grande que la de los
   * días entre sí (en Yal, −5.820 contra ±300), así que manda la escala y
   * aplasta contra el cero justamente la comparación que uno vino a mirar.
   */
  const [verCuota, setVerCuota] = useState(true)
  const [alto, setAlto] = useState(false)
  /*
   * Zoom horizontal con paneo. Un turno de 8 h en 320 px deja cada tramo de 5
   * min en menos de 4 px: la forma general se ve, pero el tramo donde se abrió
   * la brecha no se puede mirar de cerca. Ampliando el ancho dentro de un
   * contenedor con scroll, se hace zoom y se desliza.
   */
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Fracción del turno a dejar centrada después de cambiar el zoom. */
  const focoRef = useRef<number | null>(null)
  /** Dónde cae el minuto actual en el eje, para no perderlo de vista. */
  const ahoraRef = useRef(0)

  /*
   * Ampliar dejaba la vista clavada al principio del turno: uno tocaba "4x" y
   * lo que quería mirar —dónde va la línea AHORA— quedaba fuera de pantalla,
   * así que el zoom parecía no hacer nada.
   *
   * Se conserva lo que se estaba mirando, PERO si a la nueva escala el minuto
   * actual queda fuera del área visible se recentra en él. Sin esa segunda
   * parte, ampliar en cadena 1x → 2x → 4x terminaba dejando el punto afuera:
   * el salto de 1x no alcanza a centrarlo (el scroll se topa con el final del
   * eje) y el de 4x hereda ese centro, ya corrido.
   */
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || focoRef.current == null) return
    const visible = el.clientWidth
    let x = focoRef.current * el.scrollWidth - visible / 2
    const xAhora = ahoraRef.current * el.scrollWidth
    if (xAhora < x || xAhora > x + visible) x = xAhora - visible / 2
    el.scrollLeft = Math.max(0, Math.min(x, el.scrollWidth - visible))
    focoRef.current = null
  }, [zoom])

  const dibujados = useMemo(
    () => cmp.days.filter((d) => d.esHoy || visibles.has(d.dateKey)),
    [cmp.days, visibles],
  )

  /**
   * En modo diferencia, una curva por cada día visible (y por la cuota): cuánto
   * le lleva HOY de ventaja a cada uno, tramo a tramo.
   */
  const difs = useMemo(() => {
    const hoy = cmp.days.find((d) => d.esHoy)
    if (!hoy) return []
    const out = dibujados
      .filter((d) => !d.esHoy)
      .map((d) => ({
        clave: d.dateKey + d.label,
        label: d.label,
        color: COLORES[cmp.days.indexOf(d) % COLORES.length]!,
        curve: diffCurve(hoy.curve, d.curve),
      }))
    if (cmp.optimal && verCuota) {
      out.push({
        clave: "cuota", label: "cuota", color: COLOR_META,
        curve: diffCurve(hoy.curve, cmp.optimal),
      })
    }
    return out.filter((x) => x.curve.length > 0)
  }, [cmp, dibujados, verCuota])

  const { maxMin, maxPz, minPz } = useMemo(() => {
    const mm = Math.max(cmp.maxMinutes, cmp.optimal?.[cmp.optimal.length - 1]?.minutes ?? 0, 60)
    if (modo === "acum") {
      const mp = Math.max(
        ...dibujados.map((d) => d.totalPieces),
        cmp.optimal?.[cmp.optimal.length - 1]?.pieces ?? 0,
        1,
      )
      return { maxMin: mm, maxPz: mp, minPz: 0 }
    }
    // El cero tiene que quedar visible SIEMPRE: es la referencia del modo.
    const vals = difs.flatMap((d) => d.curve.map((p) => p.pieces))
    const arriba = Math.max(0, ...vals)
    const abajo = Math.min(0, ...vals)
    const margen = Math.max(1, (arriba - abajo) * 0.08)
    return { maxMin: mm, maxPz: arriba + margen, minPz: abajo - margen }
  }, [cmp, dibujados, difs, modo])

  if (cmp.days.length === 0 || cmp.currentMinute == null) return null

  /** Fracción 0-1 del ancho/alto: sirve para el SVG y para las etiquetas HTML. */
  const fx = (m: number) => m / maxMin
  const fy = (p: number) => 1 - (p - minPz) / Math.max(1, maxPz - minPz)

  const x = (m: number) => fx(m) * W
  const y = (p: number) => fy(p) * H
  ahoraRef.current = fx(cmp.currentMinute)
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
          {(modo === "acum" ? [maxPz, maxPz / 2] : [maxPz, 0, minPz]).map((v) => (
            <span
              key={v}
              className={`absolute right-0 -translate-y-1/2 text-[9px] tabular-nums ${
                modo === "dif" && v === 0 ? "text-foreground/70" : "text-muted-foreground"
              }`}
              style={{ top: `${fy(v) * 100}%` }}
            >
              {modo === "dif" && v > 0 ? `+${fmtInt(v)}` : fmtInt(v)}
            </span>
          ))}
        </div>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <div
            className="relative"
            style={{ width: `${zoom * 100}%`, minWidth: '100%' }}
            data-zoom={zoom}
          >
            <div className={`relative ${alto ? ALTO_GRANDE : ALTO_CHICO} transition-[height] duration-200`}>
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
                <line key={f} x1={0} x2={W} y1={y(minPz + (maxPz - minPz) * f)}
                  y2={y(minPz + (maxPz - minPz) * f)}
                  stroke="currentColor" strokeWidth="0.25" strokeDasharray="1.5 1.5"
                  className="text-border" vectorEffect="non-scaling-stroke" />
              ))}

              {/* El cero: la línea contra la que se lee todo el modo diferencia. */}
              {modo === "dif" && (
                <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="currentColor"
                  strokeWidth="1" className="text-foreground/45" vectorEffect="non-scaling-stroke" />
              )}

              {marcas.map((m) => (
                <line key={m} x1={x(m)} x2={x(m)} y1={0} y2={H} stroke="currentColor"
                  strokeWidth="0.25" strokeDasharray="1.5 2" className="text-border"
                  vectorEffect="non-scaling-stroke" />
              ))}

              {modo === "acum" ? (
                <>
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
                </>
              ) : (
                difs.map((d) => (
                  <path key={d.clave} d={path(d.curve)} fill="none" stroke={d.color}
                    strokeWidth={d.clave === "cuota" ? 1.6 : 2}
                    strokeDasharray={d.clave === "cuota" ? "5 4" : undefined}
                    vectorEffect="non-scaling-stroke" />
                ))
              )}

            </svg>

            {/*
              * Dónde va el turno ahora. Va en HTML y no como <circle>: el SVG
              * se estira horizontalmente con el zoom y un círculo adentro sale
              * ovalado — a 4x medía 28 x 3 px, una raya.
              */}
            {modo === "acum" && hoy?.atCurrentMinute != null && (
              <span
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
                style={{
                  left: `${fx(cmp.currentMinute) * 100}%`,
                  top: `${fy(hoy.atCurrentMinute) * 100}%`,
                  background: COLORES[0],
                }}
              />
            )}
            </div>

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
        {modo === "dif" ? (
          <>
            <span>línea arriba del cero = hoy va mejor</span>
            {cmp.optimal && (
              <button
                type="button"
                onClick={() => setVerCuota((v) => !v)}
                aria-pressed={verCuota}
                className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
                  verCuota ? 'border-amber-500/50' : 'border-border opacity-60'
                }`}
              >
                <i className="h-1.5 w-4 rounded-full" style={{ background: COLOR_META }} />
                cuota
              </button>
            )}
          </>
        ) : (
          cmp.optimal && (
            <span className="flex items-center gap-1.5">
              <i className="h-1.5 w-4 rounded-full" style={{ background: COLOR_META }} />
              Para la cuota
            </span>
          )
        )}
        {cmp.breaks.length > 0 && (
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/25" />
            paradas de convenio
          </span>
        )}
        {zoom > 1 && <span>deslizá el gráfico &#8594;</span>}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setModo((v) => (v === "dif" ? "acum" : "dif"))}
            className="rounded-full border border-border px-2 py-0.5 hover:bg-muted"
          >
            {modo === "dif" ? "ver acumulado" : "ver diferencia"}
          </button>
          {[1, 2, 4].map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => {
                const el = scrollRef.current
                focoRef.current = zoom === 1 || !el
                  ? fx(cmp.currentMinute!)
                  : (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth
                setZoom(z)
              }}
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
