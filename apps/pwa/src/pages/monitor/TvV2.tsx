/**
 * Modo TV del monitor v2 (`?pantalla=1`): una pantalla fija de 1920×1080, sin scroll, sin hover ni globos (nadie toca la TV),
 * escalada al viewport para que entre también en una TV chica (1366×768). Variante A del mockup `tv_v2.html`: arriba las
 * piezas hechas contra la meta a esta hora, a la derecha el ritmo y Mantención, abajo la franja del Duelo (marcador con
 * puntos firmes + «N en juego» y la carrera con la ventaja a la misma hora, en horas de producción).
 *
 * Una sola cifra de piezas: el contador directo de Shoplogix con la hora de su lectura. Las cifras vienen de la página
 * (las mismas que recibe `MonitorV2`) y del Duelo (`DatosDuelo`); acá solo se dibuja. Las cuentas están en `tvV2Datos.ts`.
 */
import { useEffect, useState } from 'react'
import { nombreCorto, piezasAlMinuto, type DatosDuelo, type EquipoId, type NombresEquipos } from './duelo'
import {
  bandasHoraTv, difMeta, escalaTv, int, marcadorTv, mantTv, maxEjeTv, mayorVentaja, pctDe, sinMarcadorTexto, tituloCarreraTv,
  tramosVentaja, trazoCurva, type EstadoTv,
} from './tvV2Datos'
import './tvV2.css'

const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })

export interface TvRitmo {
  rotulo: string
  valor: number | null
  unidad: string
  secRotulo: string
  sec: number | null
  chips: Array<{ nombre: string; valor: string; baja?: boolean }>
}

export interface TvV2Props {
  /** «Eviscerado» / «Filete · Baader 200 · Línea 1». */
  linea: string
  /** «P. Principal · Turno 2 · 07:15 → 15:00». */
  turno: string
  estado: EstadoTv
  /** Hora de planta HH:MM; null = no se muestra. */
  reloj: string | null
  /** El contador directo de Shoplogix y la hora de su lectura (HH:MM). */
  piezas: number
  lectura: string | null
  metaAhora: number | null
  metaTurno: number | null
  ritmo: TvRitmo
  /** Mantención cuando no hay Duelo (sin rival): las fallas del turno que se mira. */
  mantTurno?: { fallas: number; fallaMin: number; mttr: number | null } | null
  duelo: DatosDuelo | null
  nombres?: NombresEquipos | null
  /** Minutos previstos del turno (para el largo del eje). */
  previstoMin?: number | null
}

const COL: Record<EquipoId, string> = { cardenas: 'var(--v2-eq-cardenas)', rebolledo: 'var(--v2-eq-rebolledo)' }
const CLS: Record<EquipoId, string> = { cardenas: 'tv-c', rebolledo: 'tv-r' }
const CLS_SVG: Record<EquipoId, string> = { cardenas: 'tc', rebolledo: 'tr' }

export function TvV2(p: TvV2Props) {
  const [vp, setVp] = useState(() => ({ w: typeof window === 'undefined' ? 1920 : window.innerWidth, h: typeof window === 'undefined' ? 1080 : window.innerHeight }))
  useEffect(() => {
    const f = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  const k = escalaTv(vp.w, vp.h)
  const dx = (vp.w - 1920 * k) / 2
  const dy = (vp.h - 1080 * k) / 2

  const dif = difMeta(p.piezas, p.metaAhora)
  const marc = marcadorTv(p.duelo, p.nombres)
  const m = mantTv(p.duelo, p.nombres)
  const mant = m ?? (p.mantTurno ? { periodo: 'este turno', fallas: p.mantTurno.fallas, fallaMin: p.mantTurno.fallaMin, mttr: p.mantTurno.mttr, piezasPerdidas: null as number | null, porEquipo: [] as Array<{ equipo: EquipoId; nombre: string; fallas: number }> } : null)
  const jornada = p.duelo ? `${p.duelo.hoyKey.slice(8, 10)}/${p.duelo.hoyKey.slice(5, 7)}` : null
  const titulo = tituloCarreraTv(p.duelo, p.nombres)

  return (
    <div className="tvv2" data-testid="tv-v2">
      <div className="tvv2-lienzo" style={{ transform: `translate(${dx}px, ${dy}px) scale(${k})` }}>
        <header className="tv-barra">
          <span className="tv-linea">{p.linea}</span>
          <span className="tv-turno">{p.turno}</span>
          <span className="tv-estado" data-det={p.estado.detenida ? '1' : '0'}>{p.estado.texto}</span>
          {p.reloj && <span className="tv-reloj">{p.reloj}</span>}
        </header>

        <div className="tv-cuerpo">
          <div className="tv-arriba">
            <section className="tv-tarjeta tv-hero" aria-label="Piezas hechas">
              <span className="tv-rot">Piezas hechas</span>
              <div className="tv-cifra" data-testid="tv-piezas">{int(p.piezas)}</div>
              <span className="tv-lect">{p.lectura ? `contador de Shoplogix · leído a las ${p.lectura}` : 'contador de Shoplogix'}</span>
              {(p.metaAhora != null || p.metaTurno != null) && (
                <>
                  <div className="tv-metas">
                    <div><span className="tv-rot">Meta a esta hora</span><div className="tv-v">{p.metaAhora != null ? int(p.metaAhora) : '—'}</div></div>
                    <div><span className="tv-rot">Meta del turno</span><div className="tv-v">{p.metaTurno != null ? int(p.metaTurno) : '—'}</div></div>
                    {dif && (
                      <div className="tv-dif" data-ad={dif.adelante ? '1' : '0'} data-testid="tv-dif">
                        <span className="tv-tri" aria-hidden />{int(dif.n)}<small>{dif.adelante ? 'adelante' : 'atrás'}</small>
                      </div>
                    )}
                  </div>
                  {p.metaTurno != null && (
                    <>
                      <div className="tv-barra-meta" role="img" aria-label="Avance hacia la meta del turno">
                        <i style={{ width: `${pctDe(p.piezas, p.metaTurno)}%` }} />
                        {p.metaAhora != null && <b style={{ left: `${pctDe(p.metaAhora, p.metaTurno)}%` }} />}
                      </div>
                      <div className="tv-barra-meta-lab"><span>0</span><span>marca: meta a esta hora</span><span>{int(p.metaTurno)}</span></div>
                    </>
                  )}
                </>
              )}
            </section>

            <div className="tv-derecha">
              <section className="tv-tarjeta tv-mini" aria-label="Ritmo">
                <span className="tv-rot">{p.ritmo.rotulo}</span>
                <div className="tv-fila">
                  <span className="tv-big">{p.ritmo.valor != null ? dec(p.ritmo.valor) : '—'}</span>
                  <span className="tv-u">{p.ritmo.unidad}</span>
                  {p.ritmo.sec != null && (
                    <>
                      <span className="tv-rot2" style={{ marginLeft: 'auto' }}>{p.ritmo.secRotulo}</span>
                      <span className="tv-sec">{dec(p.ritmo.sec)}</span>
                    </>
                  )}
                </div>
                <div className="tv-chips">
                  {p.ritmo.chips.map((c) => <span key={c.nombre} data-baja={c.baja ? '1' : '0'}>{c.nombre}<b>{c.valor}</b></span>)}
                </div>
              </section>

              <section className="tv-tarjeta tv-mini tv-mant" aria-label="Mantención">
                <span className="tv-rot">Mantención · {mant?.periodo ?? 'hoy'}</span>
                {mant ? (
                  <>
                    <div className="tv-fila">
                      <span className="tv-big">{mant.fallas}</span>
                      <span className="tv-u">{mant.fallas === 1 ? 'falla técnica' : 'fallas técnicas'}</span>
                      {mant.mttr != null ? (
                        <>
                          <span className="tv-rot2" style={{ marginLeft: 'auto' }}>MTTR</span>
                          <span className="tv-sec">{dec(mant.mttr)}</span><span className="tv-u">min</span>
                        </>
                      ) : mant.fallas > 0 && 'lineaMin' in mant && mant.lineaMin != null && (
                        <>
                          <span className="tv-rot2" style={{ marginLeft: 'auto' }}>línea detenida</span>
                          <span className="tv-sec">{dec(mant.lineaMin)}</span><span className="tv-u">min</span>
                        </>
                      )}
                    </div>
                    <div className="tv-chips">
                      {mant.porEquipo.map((e) => <span key={e.equipo} className={CLS[e.equipo]}>{e.nombre}<b>{e.fallas}</b></span>)}
                      {mant.piezasPerdidas != null && mant.piezasPerdidas > 0 && <span>quitaron<b>{int(mant.piezasPerdidas)} pz</b></span>}
                      {mant.fallas === 0 && <span>sin fallas técnicas</span>}
                    </div>
                  </>
                ) : (
                  <span className="tv-rot2">Sin datos de Mantención todavía.</span>
                )}
              </section>
            </div>
          </div>

          <section className="tv-tarjeta tv-duelo" aria-label="Duelo">
            <div className="tv-duelo-izq">
              <span className="tv-rot">Duelo{jornada ? ` · jornada ${jornada}` : ''}</span>
              {marc ? (
                <div className="tv-marcador" data-testid="tv-marcador">
                  <div className="tv-marc">
                    <div className="tv-eq"><span className={CLS[marc.lados[0].equipo]}>{marc.lados[0].nombre}</span><b className={CLS[marc.lados[0].equipo]}>{marc.lados[0].firmes}</b></div>
                    <span className="tv-gu">–</span>
                    <div className="tv-eq"><span className={CLS[marc.lados[1].equipo]}>{marc.lados[1].nombre}</span><b className={CLS[marc.lados[1].equipo]}>{marc.lados[1].firmes}</b></div>
                  </div>
                  {marc.enJuego > 0 && (
                    <div className="tv-enjuego">{marc.enJuego} en juego<small>al cierre: {marc.alCierre}</small></div>
                  )}
                </div>
              ) : (
                <div className="tv-sin">{sinMarcadorTexto(p.duelo)}</div>
              )}
            </div>
            <div className="tv-duelo-der">
              <div className="tv-tit">
                {titulo
                  ? (<><span className={CLS[titulo.sujeto]}>{titulo.nombreSujeto}</span> {titulo.verbo} <span className={CLS[titulo.rival]}>{titulo.nombreRival}</span> <em>a la misma hora</em></>)
                  : <em>{p.duelo?.carrera ? 'Carrera en curso' : ' '}</em>}
              </div>
              <div className="tv-carrera">
                {p.duelo?.carrera && <CarreraTv d={p.duelo} nombres={p.nombres} previstoMin={p.previstoMin ?? null} />}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/** La carrera: dos curvas de piezas hechas en horas de producción y, debajo, la franja de ventaja a la misma hora. Solo 2 rótulos clave. */
const W = 1020
const H = 190
function CarreraTv({ d, nombres, previstoMin }: { d: DatosDuelo; nombres?: NombresEquipos | null; previstoMin: number | null }) {
  const c = d.carrera!
  const eqHoy = d.hoy.equipo
  const eqRiv = c.rivalEquipo
  const fan = c.fantasma && c.fantasma.length > 1 ? c.fantasma : null
  const maxMin = maxEjeTv([c.hoy, fan], previstoMin)
  const ahora = c.minuto
  const x0 = 6
  const x1 = W - 214
  const yBandaTop = H - 28 - 40
  const yBandaBase = yBandaTop + 40
  const y0 = 8
  const y1 = yBandaTop - 14
  const maxPz = Math.max(c.hoyPz, fan ? Math.max(...fan.map((q) => q.pieces)) : 0, 1) * 1.06
  const X = (m: number) => x0 + (m / maxMin) * (x1 - x0)
  const Y = (v: number) => y1 - (v / maxPz) * (y1 - y0)
  const bandas = bandasHoraTv(maxMin)
  const nom = (e: EquipoId) => nombreCorto(e, nombres)

  /* El relleno entre las dos curvas hasta «ahora», muestreado cada 3 min en el MISMO minuto de producción. */
  let area = ''
  if (fan) {
    const hoyS: string[] = []
    const rivS: string[] = []
    for (let mi = 0; mi <= ahora; mi += 3) {
      hoyS.push(`${X(mi).toFixed(1)} ${Y(piezasAlMinuto(c.hoy, mi) ?? 0).toFixed(1)}`) // decimal-tecnico: coordenada SVG
      rivS.push(`${X(mi).toFixed(1)} ${Y(piezasAlMinuto(fan, mi) ?? 0).toFixed(1)}`) // decimal-tecnico: coordenada SVG
    }
    area = `M${hoyS.join('L')}L${rivS.reverse().join('L')}Z`
  }

  const yHoy = Y(c.hoyPz)
  const yRiv = c.fantasmaPz != null ? Y(c.fantasmaPz) : null
  const xa = X(ahora)

  /* Los nombres a la derecha, sin pisarse. */
  const lx = x1 + 22
  const items: Array<{ eq: EquipoId; y: number; pz: number }> = [{ eq: eqHoy, y: yHoy, pz: c.hoyPz }]
  if (yRiv != null && c.fantasmaPz != null) items.push({ eq: eqRiv, y: yRiv, pz: c.fantasmaPz })
  items.sort((a, b) => a.y - b.y)
  const tops = items.map((it) => Math.max(y0 + 26, Math.min(y1 - 36, it.y)))
  if (tops.length === 2 && tops[1]! - tops[0]! < 74) { tops[0] = Math.max(y0 + 26, tops[1]! - 74); tops[1] = Math.max(tops[1]!, tops[0] + 74) }

  const serie = c.ventaja
  const maxV = Math.max(1, ...serie.map((q) => q.ventaja))
  const VX = (m: number) => X(m)
  const VY = (v: number) => yBandaBase - (v / maxV) * 34
  const tramos = tramosVentaja(serie)
  const top = mayorVentaja(serie)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Carrera de piezas hechas del Duelo, en horas de producción">
      {bandas.map((b, i) => (
        <g key={b.hora}>
          {i > 0 && <line x1={X(b.desde)} x2={X(b.desde)} y1={y0} y2={yBandaBase} style={{ stroke: 'var(--tv-reja)' }} strokeWidth={2} />}
          <text x={X(Math.min(b.centro, maxMin))} y={H - 3} textAnchor="middle" className="t2" fontSize={22}>{b.rotulo}</text>
        </g>
      ))}
      <line x1={x0} x2={x1} y1={y1} y2={y1} style={{ stroke: 'var(--tv-line)' }} strokeWidth={2} />
      <line x1={x0} x2={x1} y1={yBandaBase} y2={yBandaBase} style={{ stroke: 'var(--tv-line)' }} strokeWidth={2} />
      {area && <path d={area} style={{ fill: 'var(--tv-fg2)', opacity: 0.22 }} />}
      {tramos.filter((t) => t.lider && t.puntos.length > 1).map((t, i) => (
        <path key={i} d={`M${VX(t.puntos[0]!.minuto).toFixed(1)} ${yBandaBase}${t.puntos.map((q) => `L${VX(q.minuto).toFixed(1)} ${VY(q.ventaja).toFixed(1)}`).join('')}L${VX(t.puntos[t.puntos.length - 1]!.minuto).toFixed(1)} ${yBandaBase}Z` /* decimal-tecnico: coordenada SVG */}
          style={{ fill: COL[t.lider!], opacity: 0.85 }} />
      ))}
      {fan && <path d={trazoCurva(fan, maxMin, X, Y)} fill="none" style={{ stroke: COL[eqRiv] }} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />}
      <path d={trazoCurva(c.hoy, ahora, X, Y)} fill="none" style={{ stroke: COL[eqHoy] }} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      <line x1={xa} x2={xa} y1={y0} y2={yBandaBase} style={{ stroke: 'var(--tv-fg2)' }} strokeWidth={2.5} />
      {yRiv != null && <circle cx={xa} cy={yRiv} r={9} style={{ fill: COL[eqRiv], stroke: 'var(--tv-card)' }} strokeWidth={3} />}
      <circle cx={xa} cy={yHoy} r={12} style={{ fill: COL[eqHoy], stroke: 'var(--tv-card)' }} strokeWidth={3} />
      {items.map((it, i) => (
        <g key={it.eq}>
          <text x={lx} y={tops[i]} className={CLS_SVG[it.eq]} fontSize={28} fontWeight={700}>{nom(it.eq)}</text>
          <text x={lx} y={tops[i]! + 34} className="t1" fontSize={34} fontWeight={700}>{int(it.pz)}</text>
        </g>
      ))}
      <text x={xa - 14} y={y1 - 8} textAnchor="end" className="t2 tv-halo" fontSize={24} fontWeight={600}>ahora</text>
      {top && top.ventaja > 0 && (
        <text x={Math.max(x0 + 150, Math.min(x1 - 150, VX(top.minuto)))} y={yBandaTop + 22} textAnchor="middle" className="t1 tv-halo" fontSize={24} fontWeight={600}>
          mayor ventaja {int(top.ventaja)}
        </text>
      )}
    </svg>
  )
}
