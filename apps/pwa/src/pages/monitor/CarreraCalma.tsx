/**
 * La carrera del Duelo «calmo» (mockup v6 variante A, aprobado el 28-10). Un solo SVG con dos pisos y el MISMO eje X:
 *
 *  1. Arriba, las piezas hechas de cada equipo: curvas suaves y monótonas, con la banda entre ellas del color de quien va
 *     adelante y la proyección punteada al cierre.
 *  2. Abajo, «Ventaja a la misma hora» (el gusano): del color del líder, con las detenciones de 5 min o más como pines
 *     dentro de la franja (la falla técnica va rayada en el color de Mantención).
 *
 * El eje X va en HORAS DE PRODUCCIÓN (1.ª h, 2.ª h…), nunca en reloj. La colación es la única banda de alto completo.
 * Rótulos fijos: 3 como máximo (ahora y mayor ventaja, cruce de 5.000 / 10.000 hechas, falla más larga); el resto va en el
 * globo con regla vertical (mouse) o con un toque (celular). Todas las cifras salen de `duelo.ts` y `dueloCalma.ts`.
 */
import { useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { useTamano } from './ampliarHooks'
import { nombreCorto, piezasALaMismaHora, type DatosDuelo, type DetencionPin, type EquipoId, type NombresEquipos } from './duelo'
import { horasGanadas, type LadoEje } from './dueloDatosPC'
import {
  EQ_ORDEN, colacionDe, hitosDeCarrera, marcasDePiezas, milTexto, partirTexto, rotuloHora, textoMinutoProduccion, tramosDeRelleno, trazoSuave,
} from './dueloCalma'
import { dec, int } from './dueloTextos'

const COLOR: Record<EquipoId, string> = { cardenas: 'var(--v2-eq-cardenas)', rebolledo: 'var(--v2-eq-rebolledo)' }
const CLASE_T: Record<EquipoId, string> = { cardenas: 'dc-tc', rebolledo: 'dc-tr' }
const relojUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16)

export interface CarreraCalmaProps {
  d: DatosDuelo
  lados: Record<EquipoId, LadoEje | null>
  nombres: NombresEquipos
  /** Hora de planta (ms wall-as-UTC) de la primera pieza del turno que se mira, para la hora de reloj del globo. */
  inicioMs: number | null
  /** Ancho de celular: rótulos abreviados y eje corto. */
  cel: boolean
}

interface LadoCurva {
  eq: EquipoId
  curva: LadoEje['curva']
  /** Minuto donde termina el trazo REAL (su turno cerró o es «ahora»). */
  fin: number
  /** Minuto donde termina lo que se dibuja (con la proyección, si el turno sigue). */
  xFin: number
  /** Hechas donde termina lo que se dibuja. */
  yFin: number
  enCurso: boolean
  proyectado: boolean
}

export function CarreraCalma({ d, lados, nombres, inicioMs, cel }: CarreraCalmaProps) {
  const [ref, { w, h }] = useTamano()
  const [hov, setHov] = useState<number | null>(null)
  const c = d.carrera
  const nom = (e: EquipoId) => nombreCorto(e, nombres)

  const m = useMemo(() => {
    if (!c) return null
    const AH = c.minuto
    const curvas = {} as Record<EquipoId, LadoCurva | null>
    for (const eq of EQ_ORDEN) {
      const l = lados[eq]
      if (!l || l.curva.length < 2) { curvas[eq] = null; continue }
      const py = c.proyeccion[eq]
      const viva = l.enCurso && py && py.proyeccion != null && py.minutosQueQuedan != null && py.minutosQueQuedan > 0
      curvas[eq] = {
        eq, curva: l.curva, fin: l.enCurso ? AH : l.finMin, enCurso: l.enCurso, proyectado: !!viva,
        xFin: viva ? AH + py!.minutosQueQuedan! : l.finMin,
        yFin: viva ? py!.proyeccion! : l.total,
      }
    }
    const presentes = EQ_ORDEN.filter((e) => curvas[e])
    const dosLados = presentes.length === 2
    const maxFin = Math.max(480, ...presentes.map((e) => curvas[e]!.xFin))
    const xMax = Math.min(720, Math.ceil(maxFin / 60) * 60)
    const maxPz = Math.max(1000, ...presentes.map((e) => Math.max(curvas[e]!.yFin, curvas[e]!.curva[curvas[e]!.curva.length - 1]!.pieces)))
    const curvasPlano = { cardenas: lados.cardenas?.curva ?? [], rebolledo: lados.rebolledo?.curva ?? [] }
    const tramos = dosLados ? tramosDeRelleno(curvasPlano, AH, 2) : []
    const hitos = dosLados ? hitosDeCarrera(c, curvasPlano, AH) : null
    const colacion = colacionDe(lados)
    const ganadas = horasGanadas(lados.cardenas, lados.rebolledo).horas
    return { AH, curvas, presentes, dosLados, xMax, maxPz, tramos, hitos, colacion, ganadas }
  }, [c, lados])

  if (!c || !m || w < 120 || h < 120) {
    return <div ref={ref} className="dc-lienzo" aria-hidden={!c}>{!c && <p className="dc-vacio">La carrera aparece cuando el turno trae su primera pieza.</p>}</div>
  }

  // ── Geometría ──
  const fs = cel ? 12 : 13
  const sm = 11.5
  const x0 = cel ? 40 : 58
  const x1 = w - (cel ? 12 : 154)
  const yTop = 8
  const eje = fs + 10
  const yEje = h - eje
  const hayFranja = m.dosLados
  const cH = hayFranja ? (yEje - yTop) * (cel ? 0.5 : 0.54) : yEje - yTop - 6
  const c0 = yTop
  const c1 = yTop + cH
  const w0 = c1 + fs + 16
  const w1 = yEje - 2
  const X = (min: number) => x0 + (min / m.xMax) * (x1 - x0)
  const minDeX = (px: number) => Math.max(0, Math.min(m.AH, Math.round(((px - x0) / (x1 - x0)) * m.xMax)))
  const marcas = marcasDePiezas(m.maxPz)
  const topPz = Math.max(m.maxPz, marcas.marcas[marcas.marcas.length - 1] ?? 0) * 1.03
  const Y = (v: number) => c1 - (v / topPz) * (c1 - c0 - 4)

  const ventajaMax = Math.max(50, ...c.ventaja.map((v) => v.ventaja))
  const tickV = [50, 100, 200, 250, 500, 1000, 2000, 5000].find((t) => t >= ventajaMax * 0.6) ?? 5000
  const gMax = Math.max(ventajaMax, tickV) * 1.35
  const zero = (w0 + w1) / 2
  const YW = (v: number) => zero - (v / gMax) * ((w1 - w0) / 2 - 3)
  const firmada = (min: number) => (piezasALaMismaHora(lados.cardenas?.curva ?? [], min) ?? 0) - (piezasALaMismaHora(lados.rebolledo?.curva ?? [], min) ?? 0)

  // Pines de las detenciones (solo dentro de la franja, sin las programadas: la colación es la banda)
  const pinesDe = (eq: EquipoId): DetencionPin[] => (c.detenciones[eq] ?? []).filter((p) => !p.programada && p.desdeMin <= m.xMax)
  const filaPin: Record<EquipoId, number> = { cardenas: w0 + fs + 14, rebolledo: w1 - fs - 12 }

  // Trazos
  const muestras = (curva: LadoEje['curva'], hasta: number, paso: number) => {
    const out: Array<[number, number]> = []
    for (let min = 0; min < hasta; min += paso) out.push([X(min), Y(piezasALaMismaHora(curva, min) ?? 0)])
    out.push([X(hasta), Y(piezasALaMismaHora(curva, hasta) ?? 0)])
    return out
  }
  const relleno = m.tramos.map((t) => {
    const arriba = t.puntos.map((p) => `${p.m === t.puntos[0]!.m ? 'M' : 'L'}${X(p.m).toFixed(1)} ${Y(p.c).toFixed(1)}`).join('')
    const abajo = [...t.puntos].reverse().map((p) => `L${X(p.m).toFixed(1)} ${Y(p.r).toFixed(1)}`).join('')
    return { lider: t.lider, d: `${arriba}${abajo}Z` }
  })

  // Rótulos de fin de curva (PC): se separan si chocan
  const finales = !cel
    ? m.presentes.map((eq) => {
        const cv = m.curvas[eq]!
        return { eq, y: Y(cv.yFin), l1: nom(eq), l2: cv.proyectado ? `≈ ${int(cv.yFin)} a ${dec(c.proyeccion[eq]?.ritmoActual ?? 0)} pz/min` : `${int(cv.yFin)}, cerró` }
      }).sort((a, b) => a.y - b.y)
    : []
  const sep = 2 * sm + 6
  for (let i = 1; i < finales.length; i++) if (finales[i]!.y - finales[i - 1]!.y < sep) finales[i]!.y = finales[i - 1]!.y + sep

  // Ahora
  const xAhora = X(m.AH)
  const ahoraVent = c.ventaja[c.ventaja.length - 1]
  const hitos = m.hitos
  const mayor = hitos?.mayor && ahoraVent && hitos.mayor.min !== ahoraVent.minuto ? hitos.mayor : null

  // ── Globo con regla vertical ──
  const alMover = (ev: ReactPointerEvent<SVGRectElement>) => {
    const svg = ev.currentTarget.ownerSVGElement
    if (!svg) return
    const r = svg.getBoundingClientRect()
    setHov(minDeX(ev.clientX - r.left))
  }
  const globo = hov != null ? armarGlobo(hov) : null

  function armarGlobo(min: number): ReactNode {
    const hora = Math.floor(min / 60) + 1
    const filas: ReactNode[] = []
    const reloj = inicioMs != null ? ` · reloj ${relojUtc(inicioMs + min * 60_000)}` : ''
    for (const eq of m!.presentes) {
      const cv = m!.curvas[eq]!
      const hechas = piezasALaMismaHora(cv.curva, Math.min(min, cv.fin)) ?? 0
      const l = lados[eq]!
      const ritmo = l.horas[hora - 1]?.v
      const stop = (c!.detenciones[eq] ?? []).find((p) => !p.programada && min >= p.desdeMin && min <= p.hastaMin)
      const micro = l.micro.h?.[hora - 1]
      filas.push(
        <div key={eq} className="dc-gl-fila">
          <b className={CLASE_T[eq]}>{nom(eq)}</b> {int(hechas)} hechas{ritmo != null ? ` · ${dec(ritmo)} pz/min en la hora` : ''}
          {stop && <div className="dc-gl-sub">Detenida {int(stop.duracionMin)} min · {stop.causa}{stop.fallaTecnica ? ' · falla técnica' : ''}</div>}
          {!stop && micro != null && micro > 0 && <div className="dc-gl-sub">Micro detención en la hora: {dec(micro)} min</div>}
        </div>,
      )
    }
    const dif = m!.dosLados ? firmada(min) : null
    const colac = m!.colacion && min >= m!.colacion.desde && min <= m!.colacion.hasta
    return (
      <>
        <div className="dc-gl-tit">{rotuloHora(hora)} · {textoMinutoProduccion(min)} de producción{reloj}</div>
        {filas}
        {dif != null && <div className="dc-gl-fila"><b className={dif === 0 ? '' : CLASE_T[dif > 0 ? 'cardenas' : 'rebolledo']}>{dif === 0 ? 'Parejos' : `${nom(dif > 0 ? 'cardenas' : 'rebolledo')} ${int(Math.abs(dif))} adelante`}</b> a la misma hora</div>}
        {colac && <div className="dc-gl-sub">Colación (programada)</div>}
      </>
    )
  }

  // Posición del globo: a la derecha de la regla; si no cabe, a la izquierda.
  const xHov = hov != null ? X(hov) : 0
  const globoDerecha = xHov < w * 0.58

  const rotuloCurva = (eq: EquipoId) => {
    const cv = m.curvas[eq]!
    return `${nom(eq)}: ${int(cv.proyectado ? piezasALaMismaHora(cv.curva, cv.fin) ?? 0 : cv.yFin)} hechas${cv.proyectado ? `, proyecta ${int(cv.yFin)} al cierre` : ''}`
  }
  const resumen = `Carrera de piezas hechas por hora de producción. ${m.presentes.map(rotuloCurva).join('. ')}.${ahoraVent?.lider ? ` ${nom(ahoraVent.lider)} ${int(ahoraVent.ventaja)} adelante a la misma hora.` : ''}`

  return (
    <div ref={ref} className="dc-lienzo">
      <svg className="dc-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={resumen}>
        <defs>
          <pattern id="dc-raya" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" className="dc-pat-fondo" />
            <rect width="2.4" height="5" fill="var(--v2-mant)" />
          </pattern>
        </defs>

        {/* Rejilla por hora y colación (la única banda de alto completo) */}
        {Array.from({ length: Math.floor(m.xMax / 60) + 1 }, (_, i) => <line key={i} x1={X(i * 60)} x2={X(i * 60)} y1={c0} y2={w1} className="dc-reja" />)}
        {m.colacion && (
          <>
            <rect x={X(m.colacion.desde)} y={c0} width={Math.max(2, X(m.colacion.hasta) - X(m.colacion.desde))} height={w1 - c0} className="dc-colacion" />
            <text x={X((m.colacion.desde + m.colacion.hasta) / 2)} y={c1 - 6} textAnchor="middle" className="dc-t3" fontSize={sm}>colación</text>
          </>
        )}

        {/* Eje: hora de producción, en el color de quien la ganó */}
        {Array.from({ length: Math.floor(m.xMax / 60) }, (_, i) => {
          const g = m.ganadas[i]?.cuenta ? m.ganadas[i]!.ganador : null
          return (
            <text key={i} x={X(i * 60 + 30)} y={yEje + fs + 3} textAnchor="middle" className={g && g !== 'empate' ? CLASE_T[g] : 'dc-t3'} fontSize={sm} fontWeight={g && g !== 'empate' ? 700 : 400}>
              {rotuloHora(i + 1, cel)}
            </text>
          )
        })}
        {!cel && m.dosLados && (
          <>
            <text x={x1 + 8} y={yEje + fs + 3} className="dc-t3" fontSize={sm}>color = quién ganó</text>
            <text x={x1 + 8} y={yEje + fs + 3 + sm + 1} className="dc-t3" fontSize={sm}>el ritmo de la hora</text>
          </>
        )}

        {/* Piso 1 · piezas hechas */}
        {marcas.marcas.map((v) => (
          <g key={v}>
            <line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} className="dc-reja" />
            <text x={x0 - 6} y={Y(v) + 4} textAnchor="end" className="dc-t3" fontSize={sm}>{cel ? milTexto(v) : int(v)}</text>
          </g>
        ))}
        <line x1={x0} x2={x1} y1={c1} y2={c1} className="dc-base" />

        {!m.dosLados && c.banda && c.banda.min.length > 1 && (
          <>
            <path
              d={`${c.banda.max.map((p, i) => `${i ? 'L' : 'M'}${X(p.minutes).toFixed(1)} ${Y(p.pieces).toFixed(1)}`).join('')}${[...c.banda.min].reverse().map((p) => `L${X(p.minutes).toFixed(1)} ${Y(p.pieces).toFixed(1)}`).join('')}Z`}
              className="dc-banda"
            />
            <path d={c.banda.media.map((p, i) => `${i ? 'L' : 'M'}${X(p.minutes).toFixed(1)} ${Y(p.pieces).toFixed(1)}`).join('')} className="dc-media" />
          </>
        )}

        {relleno.map((r, i) => <path key={i} d={r.d} fill={COLOR[r.lider]} opacity={0.2} />)}

        {m.presentes.map((eq) => {
          const cv = m.curvas[eq]!
          return (
            <g key={eq}>
              {(cv.proyectado || cv.xFin > m.AH) && (
                <path
                  d={cv.proyectado
                    ? `M${X(m.AH).toFixed(1)} ${Y(piezasALaMismaHora(cv.curva, cv.fin) ?? 0).toFixed(1)}L${X(cv.xFin).toFixed(1)} ${Y(cv.yFin).toFixed(1)}`
                    : trazoSuave(Array.from({ length: Math.ceil((cv.fin - m.AH) / 4) + 1 }, (_, i) => { const mm = Math.min(cv.fin, m.AH + i * 4); return [X(mm), Y(piezasALaMismaHora(cv.curva, mm) ?? 0)] as [number, number] }))}
                  fill="none" stroke={COLOR[eq]} strokeWidth={1.6} strokeDasharray="4 4" opacity={0.75}
                />
              )}
              <path d={trazoSuave(muestras(cv.curva, Math.min(cv.fin, m.AH), 3))} fill="none" stroke={COLOR[eq]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={X(Math.min(cv.fin, m.AH))} cy={Y(piezasALaMismaHora(cv.curva, Math.min(cv.fin, m.AH)) ?? 0)} r={4.5} fill={COLOR[eq]} className="dc-punto" />
            </g>
          )
        })}

        {/* Rótulos al final de cada curva (PC): el color nunca va solo */}
        {finales.map((f) => (
          <g key={f.eq}>
            <text x={x1 + 8} y={f.y - 2} className={CLASE_T[f.eq]} fontSize={fs - 0.5} fontWeight={700}>{f.l1}</text>
            <text x={x1 + 8} y={f.y - 2 + sm + 2} className="dc-t2" fontSize={sm}>{f.l2}</text>
          </g>
        ))}

        {/* Rótulo 2 · cruce de 5.000 / 10.000 hechas (en celular, abreviado) */}
        {hitos?.cruce && (() => {
          const k = hitos.cruce
          const yy = Y(k.umbral)
          const segundo: EquipoId = k.primero === 'cardenas' ? 'rebolledo' : 'cardenas'
          const texto = cel ? `${milTexto(k.umbral)} · ${nom(segundo)} +${k.difMin} min` : `${int(k.umbral)} hechas · ${nom(segundo)} llega ${k.difMin} min después`
          const aDerecha = X(k.minPrimero) - x0 < texto.length * (sm * 0.55) + 12
          return (
            <g>
              <line x1={X(k.minPrimero)} x2={X(k.minSegundo)} y1={yy} y2={yy} className="dc-guia" />
              <circle cx={X(k.minPrimero)} cy={yy} r={3.2} className="dc-aro" stroke={COLOR[k.primero]} />
              <circle cx={X(k.minSegundo)} cy={yy} r={3.2} className="dc-aro" stroke={COLOR[segundo]} />
              <text x={aDerecha ? Math.min(X(k.minSegundo) + 8, x1 - texto.length * sm * 0.55) : X(k.minPrimero) - 8} y={yy - 7} textAnchor={aDerecha ? 'start' : 'end'} className="dc-t2 dc-halo" fontSize={sm + 0.5}>{texto}</text>
            </g>
          )
        })()}

        {/* Piso 2 · ventaja a la misma hora (el gusano) */}
        {hayFranja && (
          <>
            <text x={x0} y={w0 - 5} className="dc-t1" fontSize={fs} fontWeight={700}>Ventaja a la misma hora</text>
            {[tickV, -tickV].map((v) => (
              <g key={v}>
                <line x1={x0} x2={x1} y1={YW(v)} y2={YW(v)} className="dc-reja" />
                <text x={x0 - 6} y={YW(v) + 4} textAnchor="end" className="dc-t3" fontSize={sm}>{v > 0 ? '+' : '−'}{cel && tickV >= 1000 ? milTexto(tickV) : int(tickV)}</text>
              </g>
            ))}
            {m.tramos.map((t, i) => {
              const pts = t.puntos.map((p) => [X(p.m), YW(p.c - p.r)] as [number, number])
              const area = `M${pts[0]![0].toFixed(1)} ${zero}${pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}L${pts[pts.length - 1]![0].toFixed(1)} ${zero}Z`
              return (
                <g key={i}>
                  <path d={area} fill={COLOR[t.lider]} opacity={0.3} />
                  <path d={pts.map((p, j) => `${j ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')} fill="none" stroke={COLOR[t.lider]} strokeWidth={2} strokeLinejoin="round" />
                </g>
              )
            })}
            <line x1={x0} x2={x1} y1={zero} y2={zero} className="dc-cero" />
            {m.presentes.every((e) => m.curvas[e]!.proyectado || !m.curvas[e]!.enCurso) && m.curvas.cardenas && m.curvas.rebolledo && m.xMax > m.AH && (
              <path
                d={`M${xAhora.toFixed(1)} ${YW(firmada(m.AH)).toFixed(1)}L${X(Math.max(m.curvas.cardenas.xFin, m.curvas.rebolledo.xFin)).toFixed(1)} ${YW(m.curvas.cardenas.yFin - m.curvas.rebolledo.yFin).toFixed(1)}`}
                fill="none" className="dc-proy" strokeWidth={1.5} strokeDasharray="4 4"
              />
            )}
            <text x={x0 + 4} y={w0 + fs - 1} className="dc-tc" fontSize={sm} fontWeight={700}>▲ {nom('cardenas')} adelante</text>
            <text x={x0 + 4} y={w1 - 4} className="dc-tr" fontSize={sm} fontWeight={700}>▼ {nom('rebolledo')} adelante</text>

            {/* Detenciones de 5 min o más: pines dentro de la franja, unidos al gusano */}
            {EQ_ORDEN.map((eq) => pinesDe(eq).map((p, i, arr) => {
              const xp = X(p.desdeMin)
              const yp = filaPin[eq]
              const yg = YW(firmada(Math.min(p.desdeMin, m.AH)))
              const conTexto = !cel && !(arr[i + 1] && X(arr[i + 1]!.desdeMin) - xp < 30)
              return (
                <g key={`${eq}-${i}`}>
                  <line x1={xp} x2={xp} y1={yp} y2={yg} stroke={COLOR[eq]} strokeWidth={1} strokeDasharray="1.5 2.5" opacity={0.8} />
                  <circle cx={xp} cy={yp} r={5} fill={p.fallaTecnica ? 'url(#dc-raya)' : 'var(--dc-card)'} stroke={p.fallaTecnica ? 'var(--v2-mant)' : COLOR[eq]} strokeWidth={1.8}>
                    <title>{`${nom(eq)} · ${textoMinutoProduccion(p.desdeMin)} de producción · detenida ${int(p.duracionMin)} min · ${p.causa}${p.fallaTecnica ? ' · falla técnica' : ''}`}</title>
                  </circle>
                  {conTexto && <text x={xp + 8} y={yp + 4} className={CLASE_T[eq]} fontSize={sm}>{int(p.duracionMin)}</text>}
                </g>
              )
            }))}
            {!cel && (
              <>
                {['○ detención', '≥ 5 min, en min', 'rayado: falla', 'técnica (Mantención)'].map((t, i) => (
                  <text key={t} x={x1 + 8} y={filaPin.cardenas + 4 + i * (sm + 1)} className="dc-t3" fontSize={sm}>{t}</text>
                ))}
              </>
            )}

            {/* Rótulo 1 · ahora y mayor ventaja */}
            {ahoraVent && (
              <g>
                <circle cx={xAhora} cy={YW(firmada(m.AH))} r={5} fill={ahoraVent.lider ? COLOR[ahoraVent.lider] : 'var(--v2-gris)'} className="dc-punto" />
                {cel
                  ? <text x={x1} y={w0 + fs - 1} textAnchor="end" className={`${ahoraVent.lider ? CLASE_T[ahoraVent.lider] : 'dc-t2'} dc-halo`} fontSize={fs + 1} fontWeight={700}>{ahoraVent.lider ? `${int(ahoraVent.ventaja)} adelante` : 'parejos'}</text>
                  : (
                    <>
                      <text x={xAhora + 10} y={YW(firmada(m.AH)) - 7} className={`${ahoraVent.lider ? CLASE_T[ahoraVent.lider] : 'dc-t2'} dc-halo`} fontSize={fs + 1} fontWeight={700}>{ahoraVent.lider ? `${int(ahoraVent.ventaja)} adelante` : 'parejos'}</text>
                      <text x={xAhora + 10} y={YW(firmada(m.AH)) + sm + 5} className="dc-t2 dc-halo" fontSize={sm}>ahora · {textoMinutoProduccion(m.AH)}</text>
                    </>
                  )}
              </g>
            )}
            {mayor && !cel && (
              <g>
                <circle cx={X(mayor.min)} cy={YW(firmada(mayor.min))} r={3.5} className="dc-aro" stroke={COLOR[mayor.lider]} />
                <text x={X(mayor.min)} y={YW(firmada(mayor.min)) + (mayor.lider === 'cardenas' ? sm + 12 : -10)} textAnchor="middle" className={`${CLASE_T[mayor.lider]} dc-halo`} fontSize={sm}>mayor: {int(mayor.ventaja)} · {rotuloHora(Math.floor(mayor.min / 60) + 1)}</text>
              </g>
            )}
          </>
        )}

        {/* Rótulo 3 · la falla más larga (PC); la causa completa, partida en líneas: nunca con «…» */}
        {hitos?.falla && hayFranja && (() => {
          const f = hitos.falla
          const xp = X(f.pin.desdeMin)
          const yp = filaPin[f.equipo]
          const lado = xp > x1 - (cel ? 70 : 220) ? 'end' : 'start'
          const lineas = cel ? [`${int(f.pin.duracionMin)} min${f.pin.fallaTecnica ? ' · falla' : ''}`] : [`${f.pin.fallaTecnica ? 'falla más larga' : 'detención más larga'}: ${int(f.pin.duracionMin)} min`, ...partirTexto(f.pin.causa, 34)]
          const y0 = f.equipo === 'cardenas' ? yp + sm + 9 : yp - 8 - (lineas.length - 1) * (sm + 2)
          return (
            <text x={lado === 'end' ? xp - 9 : xp + 9} y={y0} textAnchor={lado} className={`${CLASE_T[f.equipo]} dc-halo`} fontSize={sm}>
              {lineas.map((t, i) => <tspan key={i} x={lado === 'end' ? xp - 9 : xp + 9} dy={i === 0 ? 0 : sm + 2}>{t}</tspan>)}
            </text>
          )
        })()}

        {/* Ahora */}
        <line x1={xAhora} x2={xAhora} y1={c0} y2={w1} className="dc-ahora" />

        {/* Regla del globo y captura */}
        {hov != null && (
          <g pointerEvents="none">
            <line x1={xHov} x2={xHov} y1={c0} y2={w1} className="dc-regla" />
            {m.presentes.map((eq) => <circle key={eq} cx={xHov} cy={Y(piezasALaMismaHora(m.curvas[eq]!.curva, Math.min(hov, m.curvas[eq]!.fin)) ?? 0)} r={4.5} fill={COLOR[eq]} className="dc-punto" />)}
            {hayFranja && <circle cx={xHov} cy={YW(firmada(hov))} r={4} className="dc-punto-fg" />}
          </g>
        )}
        <rect
          x={x0} y={c0} width={Math.max(0, x1 - x0)} height={w1 - c0} fill="transparent" style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
          onPointerMove={(ev) => { if (ev.pointerType !== 'touch') alMover(ev) }}
          onPointerDown={alMover}
          onPointerLeave={(ev) => { if (ev.pointerType !== 'touch') setHov(null) }}
        />
      </svg>
      {globo && (
        <div
          className="dc-globo-regla v2-tip"
          style={{ top: c0 + 6, ...(globoDerecha ? { left: xHov + 14 } : { right: w - xHov + 14 }) }}
          role="status"
        >
          {globo}
        </div>
      )}
    </div>
  )
}
