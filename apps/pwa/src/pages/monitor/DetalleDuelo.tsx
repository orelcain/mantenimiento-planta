/**
 * El detalle del Duelo «calmo»: a un toque, por tema, sin sacar al usuario de la pantalla. Panel lateral en PC y hoja
 * desde abajo en celular (el mismo componente, el CSS decide). Cuatro temas: Hora a hora, Por qué se perdió tiempo,
 * Semana y mes, y Mantención. Nada de esto se calcula aquí: sale de `dueloDatosPC.ts`, `duelo.ts` y `dueloCalma.ts`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { COLOR_EQUIPO, COLOR_EQUIPO_TEXTO, nombreCorto, type CostoEquipo, type DatosDuelo, type EquipoId, type NombresEquipos, type PeriodoCosto } from './duelo'
import {
  construirPorQue, filasJornadas, horasGanadas, periodosRiel, semanasPC, sinProgramadas, type CausasLado, type DuenoPQ, type LadoEje,
} from './dueloDatosPC'
import { microDelEquipo } from './dueloDatosPC'
import { EQ_ORDEN, TEMAS, intensidadCelda, patronDeMicro, type ModeloMarcador, type TemaDuelo } from './dueloCalma'
import { dec, duracion, int } from './dueloTextos'
import type { DueloPCExtra } from './DueloCalmo'

const firmado = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`
const fechaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`
const colEq = (e: EquipoId) => ({ color: COLOR_EQUIPO_TEXTO[e] })

interface Props {
  d: DatosDuelo
  nombres: NombresEquipos
  extra: DueloPCExtra
  lados: Record<EquipoId, LadoEje | null>
  marcador: ModeloMarcador
  /** El modo del Duelo (pc, medio o cel): el panel es lateral o es una hoja desde abajo. */
  modo: string
  tema: TemaDuelo
  onTema: (t: TemaDuelo) => void
  onCerrar: () => void
}

export function DetalleDuelo({ d, nombres, extra, lados, marcador, modo, tema, onTema, onCerrar }: Props) {
  const cerrar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cerrar.current?.focus()
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = antes }
  }, [onCerrar])
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const titulo = TEMAS.find((t) => t.id === tema)!.titulo
  /* Va en un portal sobre el <body>: dentro de la página el panel quedaría bajo la barra fija (el contenedor de la página
     crea su propio apilamiento). `v2-vars` le trae los tokens del v2, como a los demás paneles de detalle. */
  return createPortal(
    <div className="v2-vars dc-portal" data-modo={modo}>
      <div className="dc-velo" onClick={onCerrar} aria-hidden="true" />
      <aside className="dc-panel" role="dialog" aria-modal="true" aria-label={`Detalle: ${titulo}`}>
        <header className="dc-ph">
          <h2>{titulo}</h2>
          <button ref={cerrar} type="button" className="dc-x" onClick={onCerrar} aria-label="Cerrar el detalle"><X aria-hidden="true" size={20} /></button>
          {marcador.conPuntaje && (
            <p className="dc-mini">
              <b style={colEq('cardenas')}>{nom('cardenas')} {marcador.c}</b> – <b style={colEq('rebolledo')}>{marcador.r} {nom('rebolledo')}</b>
              {marcador.enJuego > 0 && ` · ${marcador.enJuego} en juego`}
            </p>
          )}
        </header>
        <div className="dc-ptabs" role="tablist" aria-label="Tema del detalle">
          {TEMAS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === tema} className="dc-ptab" onClick={() => onTema(t.id)}>{t.titulo}</button>
          ))}
        </div>
        <div className="dc-pcuerpo" role="tabpanel">
          {tema === 'hora' && <HoraAHora d={d} nombres={nombres} lados={lados} />}
          {tema === 'porque' && <PorQueSePerdio d={d} nombres={nombres} extra={extra} />}
          {tema === 'semana' && <SemanaYMes d={d} nombres={nombres} />}
          {tema === 'mantencion' && <Mantencion d={d} nombres={nombres} />}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

// ── Hora a hora + mapa de calor ──────────────────────────────────────────────

function HoraAHora({ d, nombres, lados }: { d: DatosDuelo; nombres: NombresEquipos; lados: Record<EquipoId, LadoEje | null> }) {
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const g = useMemo(() => horasGanadas(lados.cardenas, lados.rebolledo), [lados])
  const n = Math.max(lados.cardenas?.horas.length ?? 0, lados.rebolledo?.horas.length ?? 0)
  const minuto = d.carrera?.minuto ?? 0
  const micro = useMemo(() => EQ_ORDEN.map((e) => ({ e, m: lados[e] ? microDelEquipo(lados[e]!.micro, minuto) : null })), [lados, minuto])
  const maxComun = Math.max(0, ...micro.flatMap((x) => x.m?.matriz.maquinas.flatMap((q) => q.celdas) ?? []))
  const patron = patronDeMicro(lados.cardenas?.micro.h ?? null, lados.rebolledo?.micro.h ?? null)
  return (
    <>
      <section className="dc-sec">
        <h3>Ritmo hora a hora</h3>
        <p className="dc-nota">piezas por minuto en cada hora de producción · gana el que saca más</p>
        {n === 0 ? <p className="dc-nota">Todavía no hay horas completas para comparar.</p> : (
          <div className="dc-tabla dc-t-hora" role="table" aria-label="Ritmo por hora de producción">
            <div className="dc-tr-h" role="row"><span role="columnheader">Hora</span><span role="columnheader" style={colEq('cardenas')}>{nom('cardenas')}</span><span role="columnheader" style={colEq('rebolledo')}>{nom('rebolledo')}</span><span role="columnheader">Gana</span></div>
            {Array.from({ length: n }, (_, i) => {
              const a = lados.cardenas?.horas[i]
              const b = lados.rebolledo?.horas[i]
              const gh = g.horas[i]
              return (
                <div key={i} className="dc-tr-f" role="row">
                  <span role="cell">{i + 1}.ª h</span>
                  <span role="cell" className="dc-num">{a?.v != null ? dec(a.v) : '—'}{a?.parcial ? ' *' : ''}</span>
                  <span role="cell" className="dc-num">{b?.v != null ? dec(b.v) : '—'}{b?.parcial ? ' *' : ''}</span>
                  <span role="cell" style={gh && gh.ganador !== 'empate' ? colEq(gh.ganador) : undefined}>{gh ? (gh.ganador === 'empate' ? 'parejos' : `${nom(gh.ganador)} +${dec(gh.dif)}`) : '—'}</span>
                </div>
              )
            })}
          </div>
        )}
        <p className="dc-nota">* hora a medias. Horas ganadas: {nom('cardenas')} {g.cardenas} · {nom('rebolledo')} {g.rebolledo}.</p>
      </section>

      <section className="dc-sec">
        <h3>Micro detención por Baader</h3>
        <p className="dc-nota">minutos en cada hora de producción · la misma escala para los dos equipos</p>
        {micro.map(({ e, m }) => (
          <div key={e} className="dc-heat">
            <h4 style={colEq(e)}>{nom(e)}</h4>
            {!m || !m.matriz.maquinas.length ? <p className="dc-nota">Sin dato de micro detención en este turno.</p> : m.matriz.conCeldas ? (
              <>
                <div className="dc-hm" style={{ gridTemplateColumns: `minmax(56px, 76px) repeat(${m.matriz.horas}, minmax(0, 1fr)) minmax(44px, 60px)` }} role="table" aria-label={`Micro detención de ${nom(e)} por Baader y hora`}>
                  <span />
                  {Array.from({ length: m.matriz.horas }, (_, i) => <span key={i} className="dc-hm-h">{i + 1}.ª</span>)}
                  <span className="dc-hm-h">total</span>
                  {m.matriz.maquinas.map((q) => {
                    const peor = m.matriz.maquinas.length > 1 && m.matriz.baaderPeor?.n === q.n
                    return (
                      <div key={q.n} className="dc-hm-f" role="row">
                        <span className="dc-hm-n" data-peor={peor ? '1' : undefined}>{q.n}</span>
                        {Array.from({ length: m.matriz.horas }, (_, i) => {
                          const v = q.celdas[i] ?? 0
                          const esPeor = m.matriz.celdaPeor?.n === q.n && m.matriz.celdaPeor.hora === i + 1
                          return (
                            <span key={i} className="dc-hm-c" role="cell" data-peor={esPeor ? '1' : undefined} style={{ background: `color-mix(in srgb, ${COLOR_EQUIPO[e]} ${Math.round(intensidadCelda(v, maxComun) * 75)}%, transparent)` }} title={`${q.n} · ${i + 1}.ª hora: ${dec(v)} min`}>
                              {v > 0 ? dec(v) : '·'}
                            </span>
                          )
                        })}
                        <span className="dc-hm-t" role="cell" data-peor={peor ? '1' : undefined}>{dec(q.total)}</span>
                      </div>
                    )
                  })}
                  {m.matriz.totalPorHora && (
                    <div className="dc-hm-f dc-hm-suma" role="row">
                      <span className="dc-hm-n">suma</span>
                      {Array.from({ length: m.matriz.horas }, (_, i) => <span key={i} className="dc-hm-c" role="cell">{m.matriz.totalPorHora![i] != null ? dec(m.matriz.totalPorHora![i]!) : '·'}</span>)}
                      <span className="dc-hm-t" role="cell">{m.matriz.totalTurno != null ? dec(m.matriz.totalTurno) : '—'}</span>
                    </div>
                  )}
                </div>
                {m.matriz.maquinas.length > 1 && m.matriz.baaderPeor && <p className="dc-nota">Peor: <b>{m.matriz.baaderPeor.n}</b> con {dec(m.matriz.baaderPeor.min)} min{m.matriz.celdaPeor ? `; la hora más alta fue la ${m.matriz.celdaPeor.hora}.ª, en ${m.matriz.celdaPeor.n} (${dec(m.matriz.celdaPeor.min)} min)` : ''}.</p>}
              </>
            ) : (
              <>
                <ul className="dc-lista-b">
                  {m.matriz.maquinas.map((q) => {
                    const peor = m.matriz.maquinas.length > 1 && m.matriz.baaderPeor?.n === q.n
                    const top = Math.max(...m.matriz.maquinas.map((x) => x.total), 1)
                    return (
                      <li key={q.n}>
                        <span className="dc-hm-n" data-peor={peor ? '1' : undefined}>{q.n}{peor ? ' · la peor' : ''}</span>
                        <i className="dc-barra"><i style={{ width: `${(q.total / top) * 100}%`, background: COLOR_EQUIPO[e] }} /></i>
                        <span className="dc-num">{dec(q.total)} min</span>
                      </li>
                    )
                  })}
                </ul>
                <p className="dc-nota">Falta el dato por hora: el sistema todavía no publica los minutos de cada Baader hora por hora, solo el total del turno.</p>
              </>
            )}
          </div>
        ))}
        {patron && (
          <p className="dc-nota dc-patron">
            {patron.enAmbos.length > 0 && <>Las horas {patron.enAmbos.map((h) => `${h}.ª`).join(', ')} suben en los dos equipos: <b>patrón de la operación</b>. </>}
            {patron.soloC.length > 0 && <>Solo en {nom('cardenas')}: {patron.soloC.map((h) => `${h}.ª`).join(', ')} (<b>patrón del turno</b>). </>}
            {patron.soloR.length > 0 && <>Solo en {nom('rebolledo')}: {patron.soloR.map((h) => `${h}.ª`).join(', ')} (<b>patrón del turno</b>). </>}
            {patron.enAmbos.length + patron.soloC.length + patron.soloR.length === 0 && 'Ninguna hora sube más de lo normal en ninguno de los dos equipos.'}
          </p>
        )}
      </section>
    </>
  )
}

// ── Por qué se perdió tiempo ─────────────────────────────────────────────────

const FILAS_PQ: Array<{ k: DuenoPQ; rotulo: string; sub: string }> = [
  { k: 'mic', rotulo: 'Micro detención', sub: 'operación · detenciones cortas' },
  { k: 'sin', rotulo: 'Sin imputar', sub: 'nadie anotó la causa' },
  { k: 'mant', rotulo: 'Mantención · equipos', sub: 'falla técnica, no resta puntos' },
  { k: 'ext', rotulo: 'Externo', sub: 'materia prima, rechazo, servicios' },
  { k: 'prog', rotulo: 'Programadas', sub: 'colación y reunión de inicio' },
]
const causasTexto = (c: CausasLado | null, k: DuenoPQ): string =>
  k === 'mic' || k === 'prog' || !c ? '' : c.det[k].slice(0, 2).map((x) => x.n.toLowerCase()).join(' · ')

function PorQueSePerdio({ d, nombres, extra }: { d: DatosDuelo; nombres: NombresEquipos; extra: DueloPCExtra }) {
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const pq = useMemo(() => construirPorQue({ d, live: extra.live, stats: extra.stats, periodo: 'jornada' }), [d, extra.live, extra.stats])
  const c = pq.causas
  const top = Math.max(1, ...FILAS_PQ.flatMap((f) => EQ_ORDEN.map((e) => c[e]?.min[f.k] ?? 0)))
  return (
    <section className="dc-sec">
      <h3>Minutos de línea detenida, por quién</h3>
      <p className="dc-nota">{pq.corte ? `Se cuenta ${pq.corte.etiqueta}; es el mismo corte de las detenciones de la carrera.` : 'Se cuenta el turno completo.'}</p>
      {!c.cardenas && !c.rebolledo ? <p className="dc-nota">Todavía no hay causas para repartir.</p> : (
        <ul className="dc-pqlista">
          {FILAS_PQ.map((f) => (
            <li key={f.k}>
              <div className="dc-pq-t"><b>{f.rotulo}</b><span>{f.sub}</span></div>
              {EQ_ORDEN.map((e) => {
                const v = c[e]?.min[f.k] ?? null
                return (
                  <div key={e} className="dc-pq-b">
                    <span style={colEq(e)}>{nom(e)}</span>
                    <i className="dc-barra"><i style={{ width: `${v ? Math.max(1.5, (v / top) * 100) : 0}%`, background: f.k === 'mant' ? 'var(--v2-mant)' : COLOR_EQUIPO[e], opacity: f.k === 'prog' ? 0.45 : 1 }} /></i>
                    <span className="dc-num">{v != null ? `${int(v)} min` : 'sin dato'}</span>
                  </div>
                )
              })}
              {(causasTexto(c.cardenas, f.k) || causasTexto(c.rebolledo, f.k)) && (
                <p className="dc-pq-c">{[c.cardenas && causasTexto(c.cardenas, f.k) && `${nom('cardenas')}: ${causasTexto(c.cardenas, f.k)}`, c.rebolledo && causasTexto(c.rebolledo, f.k) && `${nom('rebolledo')}: ${causasTexto(c.rebolledo, f.k)}`].filter(Boolean).join(' · ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="dc-nota">Sin programadas: {nom('cardenas')} {int(sinProgramadas(c.cardenas))} min · {nom('rebolledo')} {int(sinProgramadas(c.rebolledo))} min. Las fallas técnicas no restan puntos: sus piezas se suman a la carrera de cada equipo.</p>
    </section>
  )
}

// ── Semana y mes ─────────────────────────────────────────────────────────────

function SemanaYMes({ d, nombres }: { d: DatosDuelo; nombres: NombresEquipos }) {
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const per = useMemo(() => periodosRiel(d), [d])
  const jornadas = useMemo(() => filasJornadas(d), [d])
  const semanas = useMemo(() => semanasPC(d, 4), [d])
  const rachaEq: EquipoId = d.rachas.cardenas.actual >= d.rachas.rebolledo.actual ? 'cardenas' : 'rebolledo'
  const racha = d.rachas[rachaEq].actual
  const fila = (p: typeof per.semana) => {
    const t = p.jc + p.jr
    return (
      <div key={p.etiqueta} className="dc-per">
        <span>{p.etiqueta}</span>
        <i className="dc-split"><i style={{ width: `${(p.jc / (t || 1)) * 100}%`, background: COLOR_EQUIPO.cardenas }} /><i style={{ width: `${(p.jr / (t || 1)) * 100}%`, background: COLOR_EQUIPO.rebolledo }} /></i>
        <span className="dc-num"><b style={colEq('cardenas')}>{p.jc}</b> – <b style={colEq('rebolledo')}>{p.jr}</b> jornadas</span>
        <span className="dc-num dc-mut">{p.pc} – {p.pr} puntos</span>
      </div>
    )
  }
  return (
    <>
      <section className="dc-sec">
        <h3>Jornadas ganadas</h3>
        <p className="dc-nota"><b style={colEq('cardenas')}>{nom('cardenas')}</b> – <b style={colEq('rebolledo')}>{nom('rebolledo')}</b> · una jornada la gana quien suma más puntos entre su turno y el de su rival</p>
        {fila(per.semana)}
        {fila(per.mes)}
        <p className="dc-nota">
          {racha > 0 ? <>Racha: <b style={colEq(rachaEq)}>{nom(rachaEq)}, {racha} {racha === 1 ? 'jornada seguida' : 'jornadas seguidas'}</b> · </> : 'Sin racha en curso · '}
          mejor racha: <b style={colEq('cardenas')}>{nom('cardenas')} {d.rachas.cardenas.mejor}</b> · <b style={colEq('rebolledo')}>{nom('rebolledo')} {d.rachas.rebolledo.mejor}</b>
        </p>
      </section>

      <section className="dc-sec">
        <h3>Jornadas del mes</h3>
        <p className="dc-nota">la más nueva primero · «+» = el ganador también hizo más piezas; «−» = ganó por puntos con menos piezas</p>
        <div className="dc-tabla dc-t-jor" role="table" aria-label="Jornadas del mes">
          <div className="dc-tr-h" role="row"><span role="columnheader">Jornada</span><span role="columnheader">Noche</span><span role="columnheader">Día</span><span role="columnheader">Puntos</span><span role="columnheader">Gana</span></div>
          {jornadas.map((j) => (
            <div key={j.jornada} className="dc-tr-f" role="row">
              <span role="cell">{fechaCorta(j.jornada)}</span>
              {[j.noche, j.dia].map((x, i) => (
                <span key={i} role="cell" className="dc-num">{x ? <><i className="dc-q" style={{ background: COLOR_EQUIPO[x.eq] }} />{int(x.pz)}</> : <span className="dc-mut">por jugar</span>}</span>
              ))}
              <span role="cell" className="dc-num">{j.puntos ? `${j.puntos.c} – ${j.puntos.r}` : '—'}</span>
              <span role="cell">{j.vivo ? <span className="dc-mut">{j.vivo}</span> : j.ganador === 'empate' ? 'empate' : j.ganador ? <b style={colEq(j.ganador)}>{nom(j.ganador)} {j.dif != null ? firmado(j.dif) : ''}</b> : '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dc-sec">
        <h3>Semana a semana</h3>
        <p className="dc-nota">piezas por turno, promedio de cada equipo</p>
        <div className="dc-tabla dc-t-sem" role="table" aria-label="Piezas por turno, semana a semana">
          <div className="dc-tr-h" role="row"><span role="columnheader">Semana</span><span role="columnheader" style={colEq('cardenas')}>{nom('cardenas')}</span><span role="columnheader" style={colEq('rebolledo')}>{nom('rebolledo')}</span><span role="columnheader">Jornadas</span></div>
          {semanas.map((s) => (
            <div key={s.lunes} className="dc-tr-f" role="row">
              <span role="cell">{s.etiqueta}{s.vigente ? ' · en curso' : ''}</span>
              <span role="cell" className="dc-num">{s.cardenas ? int(s.cardenas.prom) : '—'}</span>
              <span role="cell" className="dc-num">{s.rebolledo ? int(s.rebolledo.prom) : '—'}</span>
              <span role="cell" className="dc-num">{s.jc} – {s.jr}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

// ── Costo de Mantención ──────────────────────────────────────────────────────

function Mantencion({ d, nombres }: { d: DatosDuelo; nombres: NombresEquipos }) {
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const [periodo, setPeriodo] = useState<PeriodoCosto>('hoy')
  const costo = periodo === 'hoy' ? d.costoHoy : d.costo
  const bloque = (e: EquipoId, c: CostoEquipo): ReactNode => (
    <div key={e} className="dc-mant-eq">
      <h4 style={colEq(e)}>{nom(e)}</h4>
      <p className="dc-mant-big"><b>{c.fallasN}</b> <span>{c.fallasN === 1 ? 'falla técnica' : 'fallas técnicas'}</span></p>
      <dl>
        <dt>Minutos de línea detenida</dt><dd>{int(c.fallaMin)} min</dd>
        <dt>Minutos por falla</dt><dd>{c.minPorFalla != null ? `${dec(c.minPorFalla)} min` : 'sin fallas'}</dd>
        <dt>Piezas que quitó la falla</dt><dd>{int(c.piezasPerdidas)} pz</dd>
      </dl>
    </div>
  )
  return (
    <section className="dc-sec">
      <h3>Costo de Mantención</h3>
      <div className="dc-seg" role="group" aria-label="Período del costo">
        <button type="button" aria-pressed={periodo === 'hoy'} onClick={() => setPeriodo('hoy')}>Hoy</button>
        <button type="button" aria-pressed={periodo === 'ciclo'} onClick={() => setPeriodo('ciclo')}>Ciclo</button>
      </div>
      <p className="dc-nota">fallas técnicas en la {costo.etiqueta}{periodo === 'hoy' ? (d.hoy.cerrado ? '' : ', hasta ahora') : ' (dos semanas)'}</p>
      <div className="dc-mant">{EQ_ORDEN.map((e) => bloque(e, costo.equipos[e]))}</div>
      <p className="dc-nota">Las fallas técnicas no restan puntos: las piezas que quitaron se suman a la carrera del equipo.</p>
      <p className="dc-nota">{duracion(costo.equipos.cardenas.fallaMin + costo.equipos.rebolledo.fallaMin)} de línea detenida por fallas técnicas entre los dos equipos.</p>
    </section>
  )
}
