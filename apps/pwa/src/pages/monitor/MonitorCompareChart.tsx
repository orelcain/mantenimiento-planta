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

import { useMemo, useState } from 'react'
import { piecesAt, type CompareResult, type PacePoint } from '@/services/shoplogix/monitorCompare'
import type { ConePoint } from '@/services/shoplogix/monitorForecast'
import { COLOR_HOY, COLOR_CUOTA, COLOR_REF, FILL_ARRIBA, FILL_ABAJO } from './monitorColors'
import { useZoomGesto, type Ventana } from './useZoomGesto'

const nf = new Intl.NumberFormat('es-CL')
const fmtInt = (n: number) => nf.format(Math.round(n || 0))
/**
 * El minuto de turno, en hora de reloj.
 *
 * ⚠ El eje sigue midiendo MINUTOS DESDE EL ARRANQUE —es la única base que hace
 * comparables dos días— pero la etiqueta ya no dice «h+6», que no le sirve a
 * nadie parado en planta. Se rotula con el reloj del turno VISTO; los otros
 * días quedan alineados por hora de turno, no de reloj. En Filete los 7 turnos
 * medidos arrancaron todos a las 07:40 exactas, así que la diferencia es cero;
 * cuando no lo sea, la nota bajo el eje lo dice.
 */
function horaDesde(t0: string | null | undefined, min: number): string | null {
  if (!t0) return null
  const ms = Date.parse(t0)
  if (Number.isNaN(ms)) return null
  return new Date(ms + min * 60_000).toISOString().slice(11, 16)
}

/** Miles del eje: "5k" o "2,5k" — sin decimal cuando es entero. */
const fmtDec1 = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('es-CL', { maximumFractionDigits: 1 })

/** Coordenadas internas del SVG. */
const W = 100
const H = 100
const ALTO_CHICO = 'h-32'
const ALTO_GRANDE = 'h-56'

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

export function MonitorCompareChart({ cmp, cerrado, claveSel, onSel, cone, ventana, onVentana, t0 }: {
  cmp: CompareResult
  cerrado: boolean
  /**
   * ISO del primer tramo con dato del turno VISTO: convierte los minutos del
   * eje en hora de reloj. Sin él, el eje vuelve a «h+N».
   */
  t0?: string | null
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
  /** Ventana visible compartida con el gráfico de velocidad (minutos de turno). */
  ventana?: Ventana | null
  onVentana?: (v: Ventana | null) => void
}) {
  const [alto, setAlto] = useState(false)

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
  const refColor = claveSel === 'cuota' ? COLOR_CUOTA : COLOR_REF

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

  /*
   * Zoom por gesto, con la ventana COMPARTIDA con el gráfico de velocidad: los
   * dos miran el mismo turno por el mismo eje, así que acercarse en uno lleva
   * al otro al mismo tramo. Reemplaza a los botones 1×/2×/4× y a su recentrado
   * a mano en el "ahora" — con gesto, el punto que se mira queda quieto solo.
   * ⚠ Va DESPUÉS de `maxMin` (lo necesita) y ANTES del early return: los hooks
   * no pueden quedar detrás de un `return`.
   */
  const g = useZoomGesto({ dominioMin: maxMin, ventana, onVentana })
  const zoom = g.zoom

  if (!hoy || cmp.currentMinute == null) return null

  /*
   * ── La escala vertical, en marcas REDONDAS ──────────────────────────────
   *
   * Antes el eje mostraba el máximo y su mitad —"5.011" y "2.506" el 14-08— y
   * las guías caían en el 25/50/75% de ese máximo: números que nadie usa para
   * leer un acumulado, y que cambian de turno en turno. Ahora la escala se
   * redondea hacia arriba a un múltiplo "lindo" y las guías caen en esas mismas
   * marcas, igual que en el gráfico de velocidad. Así dos turnos distintos se
   * leen contra la misma regla.
   */
  const escalaY = (() => {
    // Cinco intervalos, no cuatro: con la cuota en 5.000 el paso de 4 daba
    // 2.000 y el eje terminaba en 6k —tres marcas y un 17% de alto vacío—;
    // con 5 el paso es 1.000 y el tope cae justo en la cuota.
    const objetivo = maxPz / 5
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(objetivo, 1))))
    const paso = [1, 2, 2.5, 5, 10].map((m) => mag * m).find((p) => p >= objetivo) ?? mag * 10
    return { paso, tope: Math.ceil(maxPz / paso) * paso }
  })()
  const marcasY: number[] = []
  for (let v = 0; v <= escalaY.tope + 0.001; v += escalaY.paso) marcasY.push(v)

  /** Fracción 0-1 del ancho/alto: sirve para el SVG y para las etiquetas HTML. */
  const fx = (m: number) => m / maxMin
  const fy = (p: number) => 1 - p / escalaY.tope

  const x = (m: number) => fx(m) * W
  const y = (p: number) => fy(p) * H

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

  /* Marcas cada hora de TURNO, rotuladas con el reloj del turno visto. */
  const marcas: number[] = []
  const cadaHora = zoom >= 2 ? 60 : 120
  for (let m = cadaHora; m <= maxMin; m += cadaHora) marcas.push(m)

  const chip = (activo: boolean) =>
    `flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
      activo
        ? 'border-transparent bg-primary/[0.13] font-semibold text-brand-ink'
        : 'border-border text-muted-foreground hover:bg-muted'
    }`

  return (
    <div>
      {/* Contra quién: UNA referencia a la vez. Cambiarla es re-preguntar.
          El rótulo importa: sin él son siete chips sueltos y hay que deducir
          qué hacen. Y es el ÚNICO selector — la tabla "ver los N días uno por
          uno" hacía lo mismo con otra interfaz. */}
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        Comparar contra
      </div>
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

      {/* Qué mide el eje. El gráfico dibuja ACUMULADO y a más de uno le pasó
          leerlo como piezas por hora: sin la unidad, dos curvas que suben no
          dicen de qué. */}
      <div className="mb-0.5 text-[9px] uppercase tracking-wide text-muted-foreground/70">
        piezas acumuladas
      </div>

      <div className="flex gap-1">
        {/* La escala vertical queda FUERA del área con scroll: adentro se iría
            con el paneo justo cuando uno mira un tramo de cerca. */}
        <div className={`relative w-7 shrink-0 ${alto ? ALTO_GRANDE : ALTO_CHICO} transition-[height] duration-200`}>
          {/* Miles abreviados: "5k" entra en 28 px, "5.000" no — y el eje se
              lee de reojo, no se suma de memoria. El valor exacto está en la
              línea de arriba del bloque y en el tooltip. */}
          {marcasY.map((v) => (
            <span key={v}
              className="absolute right-0 -translate-y-1/2 text-[9px] tabular-nums text-muted-foreground"
              style={{ top: `${fy(v) * 100}%` }}>
              {v === 0 ? '0' : v >= 1000 ? `${fmtDec1(v / 1000)}k` : fmtInt(v)}
            </span>
          ))}
        </div>

        <div
          {...g.props}
          className={`min-w-0 flex-1 overflow-x-auto ${g.acercado ? 'cursor-grab active:cursor-grabbing' : ''}`}
          style={{ touchAction: g.acercado ? 'pan-x' : 'auto' }}
        >
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

              {/* Las guías caen en las MISMAS marcas del eje: si no, la línea
                  de referencia y el número que la nombra no coinciden. */}
              {marcasY.filter((v) => v > 0 && v < escalaY.tope).map((v) => (
                <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)}
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
                    style={{ fill: COLOR_HOY }}
                    opacity="0.16"
                  />
                  <path
                    d={cone.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.minutes).toFixed(2)},${y(p.mid).toFixed(2)}`).join(' ')}
                    fill="none" style={{ stroke: COLOR_HOY }} strokeWidth="1.4" strokeDasharray="4 3"
                    opacity="0.8" vectorEffect="non-scaling-stroke"
                  />
                </>
              )}

              {/* La brecha pintada: rojo = hoy abajo, verde = hoy arriba. Es lo
                  primero que se lee, por eso va antes que las curvas. */}
              {brecha.map((s, i) => (
                <path key={i} d={areaBrecha(s)}
                  style={{ fill: s.arriba ? FILL_ARRIBA : FILL_ABAJO }} />
              ))}

              {/* La referencia: punteada si es la cuota (una meta, no un hecho). */}
              {refCurve && (
                <path d={path(refCurve)} fill="none" style={{ stroke: refColor }}
                  strokeWidth={claveSel === 'cuota' ? 1.6 : 1.8}
                  strokeDasharray={claveSel === 'cuota' ? '5 4' : undefined}
                  opacity="0.95" vectorEffect="non-scaling-stroke" />
              )}

              {/* Hoy, encima y más gruesa: es la protagonista. */}
              <path d={path(hoy.curve)} fill="none" style={{ stroke: COLOR_HOY }} strokeWidth="2.4"
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
                  background: COLOR_HOY,
                }}
              />
            )}
            </div>

            {/* Eje de horas: HTML, dentro del área escalada para viajar con el
                paneo sin deformarse como un <text> del SVG. */}
            <div className="relative h-4">
              {/* El origen. Con el eje ya rotulado en hora de reloj, la palabra
                  «arranque» sobraba: la hora dice lo mismo y además CUÁL es.
                  Sin `t0` vuelve a la palabra, que sigue siendo lo único
                  cierto. Anclado al borde: centrada, media quedaría fuera. */}
              <span className="absolute left-0 top-0 whitespace-nowrap text-[9px] tabular-nums text-muted-foreground">
                {horaDesde(t0, 0) ?? 'arranque'}
              </span>
              {marcas.map((m) => (
                <span key={m}
                  className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums text-muted-foreground"
                  style={{ left: `${fx(m) * 100}%` }}>
                  {horaDesde(t0, m) ?? `h+${m / 60}`}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="h-1.5 w-4 rounded-full" style={{ background: COLOR_HOY }} />
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
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_HOY, opacity: 0.3 }} />
            dónde terminaron los turnos anteriores
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm" style={{ background: FILL_ABAJO }} />
          vas abajo
        </span>
        <span className="flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm" style={{ background: FILL_ARRIBA }} />
          vas arriba
        </span>
        <span className="ml-auto flex items-center gap-1">
          {g.acercado ? (
            <button type="button" onClick={g.verTodo}
              className="rounded-full border border-border px-2 py-0.5 hover:bg-muted">
              ver todo · {zoom.toFixed(1).replace('.', ',')}×
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground/60">pellizcá o rodá para acercar</span>
          )}
          <button type="button" onClick={() => setAlto((v) => !v)}
            className="rounded-full border border-border px-2 py-0.5 hover:bg-muted">
            {alto ? 'achicar' : 'agrandar'}
          </button>
        </span>
      </div>
    </div>
  )
}
