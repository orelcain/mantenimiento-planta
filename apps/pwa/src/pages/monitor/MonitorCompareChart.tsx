/**
 * Comparación del turno contra UNA referencia a la vez: la carrera de a dos.
 *
 * v3 (13-ago). La v2 dibujaba hasta 6 curvas de DIFERENCIA contra el cero y la
 * cuota entraba como un delta que "cae" aunque el turno vaya bien — Orel volvió
 * a tropezar con eso con el aviso puesto: si necesita manual, está mal elegido.
 * Precedente que respalda el cambio: los gráficos de desviación sirven cuando lo
 * único que importa es arriba/abajo de UNA referencia; para audiencia general,
 * serie principal resaltada y el resto fuera (Flourish, CDC/COVE).
 *
 * Acá las dos curvas SUBEN — hoy, y la referencia elegida por chip (cuota o un
 * día anterior) — y la brecha entre ambas va pintada: rojo donde hoy va abajo,
 * verde donde va arriba. La cuota vuelve a ser lo que es: una línea que sube y
 * se aplana en las paradas de convenio. "¿Y contra todos a la vez?" lo responde
 * la tabla "ver los N días uno por uno", que sigue existiendo.
 *
 * ⚠ El eje es MINUTOS DESDE EL ARRANQUE, no hora de reloj (como cuenta
 * Shoplogix; los turnos no arrancan a la misma hora).
 *
 * SVG puro: el bundle público no carga librerías de gráficos. Las ETIQUETAS son
 * HTML: el SVG se estira horizontalmente con el zoom (`preserveAspectRatio=
 * "none"`) y un `<text>` o un `<circle>` adentro se deforman con él.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { piecesAt, type CompareResult, type PacePoint } from '@/services/shoplogix/monitorCompare'
import type { ConePoint } from '@/services/shoplogix/monitorForecast'
import { COLORES, COLOR_META } from './monitorColors'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))

/** Coordenadas internas del SVG. */
const W = 100
const H = 100
const ALTO_CHICO = 'h-32'
const ALTO_GRANDE = 'h-56'

/** La referencia gris neutra para "un día anterior": la principal es hoy. */
const COLOR_DIA_REF = '#64748b'

/**
 * Tramos continuos de ventaja/desventaja entre hoy y la referencia, con el
 * punto de cruce interpolado — sin él, el sombreado cambia de color un tramo
 * tarde y en el cruce se ve un triángulo del color equivocado.
 *
 * Solo hasta donde AMBAS curvas tienen dato: más allá del "ahora" hoy no
 * existe, y más allá del final de un día corto ese día no llegó.
 */
function tramosDeBrecha(hoy: PacePoint[], ref: PacePoint[]): Array<{
  arriba: boolean
  hoy: PacePoint[]
  ref: PacePoint[]
}> {
  if (hoy.length === 0 || ref.length === 0) return []
  const hasta = Math.min(hoy[hoy.length - 1]!.minutes, ref[ref.length - 1]!.minutes)
  const minutos = [...new Set([...hoy, ...ref].map((p) => p.minutes))]
    .filter((m) => m <= hasta)
    .sort((a, b) => a - b)
  if (minutos.length < 2) return []

  const pares = minutos.map((m) => ({
    m,
    h: piecesAt(hoy, m) ?? 0,
    r: piecesAt(ref, m) ?? 0,
  }))

  const out: Array<{ arriba: boolean; hoy: PacePoint[]; ref: PacePoint[] }> = []
  let actual: { arriba: boolean; hoy: PacePoint[]; ref: PacePoint[] } | null = null
  for (let i = 0; i < pares.length; i++) {
    const p = pares[i]!
    const arriba = p.h >= p.r
    if (!actual || actual.arriba !== arriba) {
      // Punto de cruce entre el par anterior y este, interpolado linealmente.
      if (actual && i > 0) {
        const a = pares[i - 1]!
        const da = a.h - a.r
        const db = p.h - p.r
        const t = da === db ? 0 : da / (da - db)
        const mc = a.m + (p.m - a.m) * t
        const vc = a.h + (p.h - a.h) * t
        actual.hoy.push({ minutes: mc, pieces: vc })
        actual.ref.push({ minutes: mc, pieces: vc })
        out.push(actual)
        actual = { arriba, hoy: [{ minutes: mc, pieces: vc }], ref: [{ minutes: mc, pieces: vc }] }
      } else {
        if (actual) out.push(actual)
        actual = { arriba, hoy: [], ref: [] }
      }
    }
    actual.hoy.push({ minutes: p.m, pieces: p.h })
    actual.ref.push({ minutes: p.m, pieces: p.r })
  }
  if (actual) out.push(actual)
  return out.filter((s) => s.hoy.length >= 2)
}

export function MonitorCompareChart({ cmp, cerrado, claveSel, onSel, cone }: {
  cmp: CompareResult
  cerrado: boolean
  /*
   * Adónde llegaría el turno según los anteriores, de acá al cierre. Se dibuja
   * como una banda que nace en la punta de la curva de hoy: si la línea de la
   * cuota queda por encima de todo el cono, que no entra se ve sin leer un
   * número. Ausente con el turno cerrado o sin muestra suficiente.
   */
  cone?: ConePoint[] | null
  /*
   * Qué referencia se compara: 'cuota' o el dateKey+label de un día anterior.
   * El estado vive en el PADRE porque el bloque de la brecha usa la MISMA
   * referencia: si el gráfico compara contra la cuota y la brecha contra
   * "lun 10", son dos verdades a 20 px de distancia.
   */
  claveSel: string | null
  onSel: (clave: string) => void
}) {
  const [alto, setAlto] = useState(false)
  const [zoom, setZoom] = useState(1)
  const scrollRef = useRef<HTMLDivElement>(null)
  /** Fracción del turno a dejar centrada después de cambiar el zoom. */
  const focoRef = useRef<number | null>(null)
  /** Dónde cae el minuto actual en el eje, para no perderlo de vista. */
  const ahoraRef = useRef(0)

  /*
   * Conserva lo que se estaba mirando al cambiar el zoom, PERO si el minuto
   * actual queda fuera del área visible se recentra en él (ampliar en cadena
   * 1x → 2x → 4x heredaba un centro corrido y dejaba el "ahora" afuera).
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

  const hoy = cmp.days.find((d) => d.esHoy)
  const anteriores = useMemo(() => cmp.days.filter((d) => !d.esHoy), [cmp.days])

  /** El día que más llevaba a esta misma altura: su chip dice "mejor". */
  const mejorKey = useMemo(() => {
    let best: { k: string; v: number } | null = null
    for (const d of anteriores) {
      if (d.atCurrentMinute == null) continue
      if (!best || d.atCurrentMinute > best.v) best = { k: d.dateKey + d.label, v: d.atCurrentMinute }
    }
    return best?.k ?? null
  }, [anteriores])

  const diaSel = anteriores.find((d) => d.dateKey + d.label === claveSel) ?? null
  const refCurve: PacePoint[] | null = claveSel === 'cuota' ? cmp.optimal : diaSel?.curve ?? null
  const refColor = claveSel === 'cuota' ? COLOR_META : COLOR_DIA_REF

  const brecha = useMemo(
    () => (hoy && refCurve ? tramosDeBrecha(hoy.curve, refCurve) : []),
    [hoy, refCurve],
  )

  const { maxMin, maxPz } = useMemo(() => {
    const finCono = cone?.[cone.length - 1]
    // El eje tiene que dar para el cono entero, o su parte alta queda cortada.
    const mm = Math.max(
      cmp.maxMinutes,
      cmp.optimal?.[cmp.optimal.length - 1]?.minutes ?? 0,
      finCono?.minutes ?? 0,
      60,
    )
    const mp = Math.max(
      hoy?.totalPieces ?? 0,
      refCurve?.[refCurve.length - 1]?.pieces ?? 0,
      finCono?.high ?? 0,
      1,
    )
    return { maxMin: mm, maxPz: mp }
  }, [cmp, hoy, refCurve, cone])

  if (!hoy || cmp.currentMinute == null) return null

  /** Fracción 0-1 del ancho/alto: sirve para el SVG y para las etiquetas HTML. */
  const fx = (m: number) => m / maxMin
  const fy = (p: number) => 1 - p / maxPz

  const x = (m: number) => fx(m) * W
  const y = (p: number) => fy(p) * H
  ahoraRef.current = fx(cmp.currentMinute)

  const path = (curve: PacePoint[]) =>
    curve.length === 0
      ? ''
      : curve
          .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minutes).toFixed(2)},${y(p.pieces).toFixed(2)}`)
          .join(' ')

  const areaBrecha = (s: { hoy: PacePoint[]; ref: PacePoint[] }) =>
    `${path(s.hoy)} ${[...s.ref].reverse()
      .map((p) => `L${x(p.minutes).toFixed(2)},${y(p.pieces).toFixed(2)}`)
      .join(' ')} Z`

  /* Marcas cada hora de TURNO: h+1, h+2… Es el eje que se puede comparar. */
  const marcas: number[] = []
  const cadaHora = zoom >= 2 ? 60 : 120
  for (let m = cadaHora; m <= maxMin; m += cadaHora) marcas.push(m)

  const chip = (activo: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
      activo
        ? 'border-amber-500/50 bg-amber-500/10 font-semibold text-amber-800 dark:text-amber-200'
        : 'border-border text-muted-foreground hover:bg-muted'
    }`

  return (
    <div>
      {/* Contra quién: UNA referencia a la vez. Cambiarla es re-preguntar. */}
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
        {cmp.optimal && (
          <button type="button" onClick={() => onSel('cuota')} aria-pressed={claveSel === 'cuota'}
            className={chip(claveSel === 'cuota')}>
            cuota{cmp.targetPieces ? ` ${fmtInt(cmp.targetPieces)}` : ''}
          </button>
        )}
        {anteriores.map((d) => {
          const k = d.dateKey + d.label
          return (
            <button key={k} type="button" onClick={() => onSel(k)} aria-pressed={claveSel === k}
              className={chip(claveSel === k)}>
              {d.label}
              {mejorKey === k && <span className="opacity-70">· mejor</span>}
            </button>
          )
        })}
      </div>

      <div className="flex gap-1">
        {/* La escala vertical queda FUERA del área con scroll: adentro se iría
            con el paneo justo cuando uno mira un tramo de cerca. */}
        <div className={`relative w-7 shrink-0 ${alto ? ALTO_GRANDE : ALTO_CHICO} transition-[height] duration-200`}>
          {[maxPz, maxPz / 2].map((v) => (
            <span key={v}
              className="absolute right-0 -translate-y-1/2 text-[9px] tabular-nums text-muted-foreground"
              style={{ top: `${fy(v) * 100}%` }}>
              {fmtInt(v)}
            </span>
          ))}
        </div>

        <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ width: `${zoom * 100}%`, minWidth: '100%' }} data-zoom={zoom}>
            <div className={`relative ${alto ? ALTO_GRANDE : ALTO_CHICO} transition-[height] duration-200`}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className={`w-full ${alto ? ALTO_GRANDE : ALTO_CHICO} transition-[height] duration-200`}
              preserveAspectRatio="none"
              role="img"
              aria-label="Piezas acumuladas por minuto de turno, hoy contra la referencia elegida"
            >
              {/* Las paradas de convenio, de fondo: sin ellas la meseta de la
                  cuota parece un error del gráfico. */}
              {cmp.breaks.map((b) => (
                <rect key={`${b.fromMin}-${b.toMin}`} x={x(b.fromMin)} y={0}
                  width={Math.max(0.3, x(b.toMin) - x(b.fromMin))} height={H}
                  className="fill-muted-foreground/15" />
              ))}

              {[0.25, 0.5, 0.75].map((f) => (
                <line key={f} x1={0} x2={W} y1={H * f} y2={H * f}
                  stroke="currentColor" strokeWidth="0.25" strokeDasharray="1.5 1.5"
                  className="text-border" vectorEffect="non-scaling-stroke" />
              ))}

              {marcas.map((m) => (
                <line key={m} x1={x(m)} x2={x(m)} y1={0} y2={H} stroke="currentColor"
                  strokeWidth="0.25" strokeDasharray="1.5 2" className="text-border"
                  vectorEffect="non-scaling-stroke" />
              ))}

              {/* El cono de proyección, detrás de todo: es contexto, no dato
                  medido. Va antes que la brecha para no taparla. */}
              {cone && cone.length >= 2 && (
                <>
                  <path
                    d={`${cone.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minutes).toFixed(2)},${y(p.high).toFixed(2)}`).join(' ')} ${[...cone].reverse().map((p) => `L${x(p.minutes).toFixed(2)},${y(p.low).toFixed(2)}`).join(' ')} Z`}
                    fill={COLORES[0]}
                    opacity="0.16"
                  />
                  <path
                    d={cone.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minutes).toFixed(2)},${y(p.mid).toFixed(2)}`).join(' ')}
                    fill="none" stroke={COLORES[0]} strokeWidth="1.4" strokeDasharray="4 3"
                    opacity="0.8" vectorEffect="non-scaling-stroke"
                  />
                </>
              )}

              {/* La brecha pintada: rojo = hoy abajo, verde = hoy arriba. Es lo
                  primero que se lee, por eso va antes que las curvas. */}
              {brecha.map((s, i) => (
                <path key={i} d={areaBrecha(s)}
                  fill={s.arriba ? 'rgb(5 150 105 / 0.16)' : 'rgb(239 68 68 / 0.16)'} />
              ))}

              {/* La referencia: punteada si es la cuota (una meta, no un hecho). */}
              {refCurve && (
                <path d={path(refCurve)} fill="none" stroke={refColor}
                  strokeWidth={claveSel === 'cuota' ? 1.6 : 1.8}
                  strokeDasharray={claveSel === 'cuota' ? '5 4' : undefined}
                  opacity="0.95" vectorEffect="non-scaling-stroke" />
              )}

              {/* Hoy, encima y más gruesa: es la protagonista. */}
              <path d={path(hoy.curve)} fill="none" stroke={COLORES[0]} strokeWidth="2.4"
                vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Dónde va el turno ahora. HTML y no <circle>: el SVG se estira con
                el zoom y un círculo adentro sale ovalado. Con el turno cerrado
                no aporta (quedaría clavado en la última esquina). */}
            {!cerrado && hoy.atCurrentMinute != null && (
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

            {/* Eje de horas: HTML, dentro del área escalada para viajar con el
                paneo sin deformarse como un <text> del SVG. */}
            <div className="relative h-4">
              {marcas.map((m) => (
                <span key={m}
                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums text-muted-foreground"
                  style={{ left: `${fx(m) * 100}%` }}>
                  h+{m / 60}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="h-1.5 w-4 rounded-full" style={{ background: COLORES[0] }} />
          hoy
        </span>
        {refCurve && (
          <span className="flex items-center gap-1.5">
            <i className="h-1.5 w-4 rounded-full" style={{ background: refColor }} />
            {claveSel === 'cuota' ? 'cuota (se aplana en las paradas de convenio)' : diaSel?.label}
          </span>
        )}
        {cone && cone.length >= 2 && (
          <span className="flex items-center gap-1.5">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORES[0], opacity: 0.3 }} />
            dónde terminaron los turnos anteriores
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgb(239 68 68 / 0.3)' }} />
          vas abajo
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm" style={{ background: 'rgb(5 150 105 / 0.3)' }} />
          vas arriba
        </span>
        {zoom > 1 && <span>deslizá el gráfico &#8594;</span>}
        <span className="ml-auto flex items-center gap-1">
          {[1, 2, 4].map((z) => (
            <button key={z} type="button"
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
              }`}>
              {z}×
            </button>
          ))}
          <button type="button" onClick={() => setAlto((v) => !v)}
            className="rounded-full border border-border px-2 py-0.5 hover:bg-muted">
            {alto ? 'achicar' : 'agrandar'}
          </button>
        </span>
      </div>
    </div>
  )
}
