/**
 * «Duelo» con calma (28-10, mockup `duelo_pc_calmo.html` v6 variante A): PC y celular con la MISMA información, por
 * revelado progresivo.
 *
 *  · A primera vista: el marcador (quién va ganando con los puntos FIRMES, qué falta por resolver y cómo va la carrera),
 *    la carrera v6 y una fila por cada indicador que da punto, con su ganador y una frase que explica la ventaja.
 *  · A un toque, por tema: Hora a hora (con el mapa de calor de micro detención por Baader), Por qué se perdió tiempo,
 *    Semana y mes, y Mantención. Panel lateral en PC y hoja desde abajo en celular.
 *
 * Un solo componente: el ancho del contenedor decide la distribución (`data-modo`). Sin duplicados: la ventaja vive solo
 * en el marcador y en la franja de la carrera; el mes aparece una sola vez (en «Semana y mes»); «jornadas», no «turnos».
 * Toda la lógica vive en `duelo.ts`, `dueloDatosPC.ts` y `dueloCalma.ts` (probadas); aquí solo se ubica y se pinta.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import type { PublicMonitorLive, ShiftStat } from '@/services/shoplogix/publicShiftMonitor.service'
import { useTamano } from './ampliarHooks'
import { CarreraCalma } from './CarreraCalma'
import { DetalleDuelo } from './DetalleDuelo'
import { COLOR_EQUIPO, COLOR_EQUIPO_TEXTO, nombreCorto, type DatosDuelo, type EquipoId, type NombresEquipos } from './duelo'
import { construirLados, microDelEquipo, type SerieMinuto } from './dueloDatosPC'
import { EQ_ORDEN, TEMAS, equipoDeLado, filasDePuntos, fraseDeVentaja, modeloMarcador, tendenciaDeVentaja, type FilaPunto, type Lado, type ModeloMarcador, type TemaDuelo } from './dueloCalma'
import { dec, int, textoFraseEmpate } from './dueloTextos'
import { useGloboDuelo } from './GloboDuelo'
import type { Lectura } from './relojDeDatos'
import './duelo.css'

// ── Lo que la página le pasa ─────────────────────────────────────────────────

export interface DueloPCExtra {
  /** El turno que se mira. */
  live: PublicMonitorLive
  stats: readonly ShiftStat[]
  /** Serie minuto a minuto del turno que se mira (pulso o archivo). */
  serieHoy: SerieMinuto | null
  /** Series archivadas de los últimos turnos (el rival). */
  series: ReadonlyArray<SerieMinuto & { shiftDocId: string }> | null
  /** El contador de Shoplogix y las últimas lecturas (el Duelo calmo no mueve cifras entre lecturas: se redibuja por lectura). */
  lectura: Lectura | null
  semilla: number[]
}

export interface DueloPCProps {
  datos: DatosDuelo
  nombres: NombresEquipos
  unidad: 'carros' | 'silletas' | null
  /** Hora de planta (ms wall-as-UTC) de la primera pieza del turno que se mira. */
  inicioMs: number | null
  extra: DueloPCExtra
  /** Fila fina de arriba (selector de línea y avisos); sin nada, no hay fila. */
  superior?: ReactNode
}

const fechaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`
const colT = (e: EquipoId) => ({ color: COLOR_EQUIPO_TEXTO[e] })

export function DueloCalmo(p: DueloPCProps) {
  const { datos: d, extra, nombres } = p
  const [ref, { w }] = useTamano()
  const [tema, setTema] = useState<TemaDuelo | null>(null)
  const disparador = useRef<HTMLElement | null>(null)
  const { manejadores, globo } = useGloboDuelo()
  const modo = w >= 1000 ? 'pc' : w >= 640 ? 'medio' : 'cel'
  const nom = (e: EquipoId) => nombreCorto(e, nombres)

  const lados = useMemo(
    () => construirLados({ d, nombres, live: extra.live, stats: extra.stats, serieHoy: extra.serieHoy, series: extra.series }),
    [d, nombres, extra.live, extra.stats, extra.serieHoy, extra.series],
  )
  const marcador = useMemo(() => modeloMarcador(d), [d])
  const minuto = d.carrera?.minuto ?? 0
  const filas = useMemo(() => {
    if (!d.rival || !d.marcador || d.marcador.sinDuelo) return []
    const micro = { cardenas: { totalTurno: null as number | null, nMaquinas: 0 }, rebolledo: { totalTurno: null as number | null, nMaquinas: 0 } }
    for (const e of EQ_ORDEN) {
      const l = lados[e]
      if (l) { const m = microDelEquipo(l.micro, minuto); micro[e] = { totalTurno: m.totalTurno, nMaquinas: m.nMaquinas } }
    }
    return filasDePuntos({ d, nombres, micro })
  }, [d, nombres, lados, minuto])
  const frase = useMemo(() => fraseDeVentaja(filas, nombres), [filas, nombres])
  const tendencia = useMemo(() => (d.carrera ? tendenciaDeVentaja(d.carrera.ventaja) : null), [d.carrera])

  const abrir = useCallback((t: TemaDuelo, el: HTMLElement | null) => { disparador.current = el; setTema(t) }, [])
  const cerrar = useCallback(() => { setTema(null); disparador.current?.focus() }, [])

  const c = d.carrera
  const subCarrera = c
    ? `${EQ_ORDEN.map((e) => lados[e]?.rotulo).filter(Boolean).join(' contra ')}${d.hoy.cerrado ? '' : ` · en vivo, ${c.hora}.ª hora de producción`}`
    : ''
  const fe = c?.fraseEmpate
  const fallasHoy = d.costoHoy.equipos.cardenas.fallasN + d.costoHoy.equipos.rebolledo.fallasN

  return (
    <div ref={ref} className="dc" data-modo={modo} {...manejadores}>
      {p.superior && <div className="dc-top">{p.superior}</div>}
      <div className="dc-grid">
        <MarcadorDuelo d={d} nombres={nombres} m={marcador} tendencia={tendencia} />

        <section className="v2-tarjeta rounded-card dc-card dc-car" aria-label={`Carrera de la jornada ${fechaCorta(d.hoy.jornada)}`}>
          <header className="dc-hd">
            <h2>Carrera</h2>
            <p className="dc-sub">{subCarrera || 'piezas hechas por hora de producción'}</p>
          </header>
          <ul className="dc-leyenda" aria-label="Equipos">
            {EQ_ORDEN.filter((e) => lados[e]).map((e) => (
              <li key={e}><i style={{ background: COLOR_EQUIPO[e] }} />{nom(e)}</li>
            ))}
            <li className="dc-ley-eje">eje en horas de producción</li>
          </ul>
          {fe && (
            <p className="dc-empate">
              {textoFraseEmpate(fe, { equipo: nom(fe.equipo), rival: nom(fe.rival) })}{' '}
              <span className="dc-info" tabIndex={0} role="img" aria-label="Cómo se calcula"
                data-tip={`Cuenta: (${int(fe.metaPz)} − ${int(fe.hechas)}) ÷ ${int(fe.minutosQueQuedan)} min = ${dec(fe.necesitaPzMin)} pz/min. Se compara con el ritmo de los últimos 30 min y con el techo de la línea (lo máximo que rinden sus máquinas).`}>
                <Info size={15} aria-hidden="true" />
              </span>
            </p>
          )}
          <CarreraCalma d={d} lados={lados} nombres={nombres} inicioMs={p.inicioMs} cel={modo === 'cel'} />
        </section>

        <section className="v2-tarjeta rounded-card dc-card dc-pq" aria-label="Por qué">
          <h2>Por qué</h2>
          {filas.length > 0 ? (
            <>
              {frase && <p className="dc-frase">{frase}</p>}
              <FilasPuntos filas={filas} nombres={nombres} />
            </>
          ) : (
            <p className="dc-nota">{textoSinRival(d, nom)}</p>
          )}
        </section>

        <nav className="dc-temas" aria-label="Detalle por tema">
          {TEMAS.map((t) => (
            <button key={t.id} type="button" className="dc-tema" onClick={(ev) => abrir(t.id, ev.currentTarget)}>
              {t.titulo}
              {t.id === 'mantencion' && fallasHoy > 0 && <small>{fallasHoy} {fallasHoy === 1 ? 'falla' : 'fallas'} hoy</small>}
            </button>
          ))}
        </nav>
      </div>

      {tema && <DetalleDuelo d={d} nombres={nombres} extra={extra} lados={lados} marcador={marcador} modo={modo} tema={tema} onTema={setTema} onCerrar={cerrar} />}
      {globo}
    </div>
  )
}

function textoSinRival(d: DatosDuelo, nom: (e: EquipoId) => string): string {
  const otro = nom(d.hoy.equipo === 'cardenas' ? 'rebolledo' : 'cardenas')
  if (d.marcador?.sinDuelo) return `${d.marcador.motivo}. No suma ni quita puntos a nadie.`
  if (d.abreJornada && !d.hoy.cerrado) return `La noche abre la jornada y no compite con nadie mientras corre. Los puntos se asignan cuando cierran la noche y el día; ${otro} juega el día${d.inicioDia ? ` desde las ${d.inicioDia}` : ''}.`
  if (d.esperando) return `La noche ya cerró y espera a ${otro}: la jornada suma puntos cuando cierre su turno de día.`
  return 'Esta jornada no tiene turno de noche, o su rival todavía no trae los datos del duelo: no hay con quién comparar ni puntos que asignar.'
}

// ── Marcador: quién gana, qué falta, cómo va la carrera ──────────────────────

function MarcadorDuelo({ d, nombres, m, tendencia }: { d: DatosDuelo; nombres: NombresEquipos; m: ModeloMarcador; tendencia: ReturnType<typeof tendenciaDeVentaja> }) {
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const jornada = fechaCorta(d.hoy.jornada)
  if (!m.conPuntaje) {
    return (
      <section className="v2-tarjeta rounded-card dc-card dc-marc" aria-label="Marcador de la jornada">
        <p className="dc-eyebrow">Jornada {jornada}</p>
        <p className="dc-solo"><b style={colT(d.hoy.equipo)}>{int(d.hoy.piezas)}</b> <span>hechas por {nom(d.hoy.equipo)} {d.hoy.esNoche ? 'en la noche' : 'en el día'}</span></p>
        <p className="dc-nota">{textoSinRival(d, nom)}</p>
      </section>
    )
  }
  const quien = m.lider ? nom(equipoDeLado(m.lider)) : null
  const eyebrow = m.cerrada
    ? quien ? <><b style={colT(equipoDeLado(m.lider!))}>{quien}</b> ganó la jornada</> : 'Jornada empatada'
    : quien ? <><b style={colT(equipoDeLado(m.lider!))}>{quien}</b> va ganando</> : 'Van parejos'
  return (
    <section className="v2-tarjeta rounded-card dc-card dc-marc" aria-label="Marcador de la jornada">
      <p className="dc-eyebrow">Jornada {jornada} · {eyebrow}</p>
      <div className="dc-score" role="group" aria-label={`${nom('cardenas')} ${m.c}, ${nom('rebolledo')} ${m.r}, ${m.cerrada ? 'puntos finales' : 'puntos firmes'}`}>
        <div className="dc-eqp"><span className="dc-nm" style={colT('cardenas')}>{nom('cardenas')}</span><b style={colT('cardenas')}>{m.c}</b></div>
        <span className="dc-gu" aria-hidden="true">–</span>
        <div className="dc-eqp"><span className="dc-nm" style={colT('rebolledo')}>{nom('rebolledo')}</span><b style={colT('rebolledo')}>{m.r}</b></div>
        <span className="dc-firm">{m.cerrada ? <>puntos<br />finales</> : <>puntos<br />firmes</>}</span>
      </div>
      {tendencia && (
        <p className="dc-trend">
          {tendencia.lider
            ? (
              <>
                <b style={colT(tendencia.lider)}>{int(tendencia.ventaja)} adelante</b> a la misma hora
                {tendencia.pasoAdelante && <> · <span data-sube="1">▲ pasó adelante: hace una hora iba {int(tendencia.pasoAdelante.atrasPz)} atrás</span></>}
                {tendencia.cambio != null && tendencia.cambio !== 0 && <> · <span data-sube={tendencia.cambio > 0 ? '1' : '0'}>{tendencia.cambio > 0 ? '▲ la ventaja crece' : '▼ la ventaja se achica'}: {tendencia.cambio > 0 ? '+' : '−'}{int(Math.abs(tendencia.cambio))} en la última hora</span></>}
              </>
            )
            : 'Parejos a la misma hora'}
        </p>
      )}
      {m.enJuego > 0 && (
        <div className="dc-enj">
          <p className="dc-enj-t"><span className="dc-chip">{m.enJuego} en juego</span> se definen al cierre · hoy va adelante</p>
          <ul>
            {m.detalle.map((x) => (
              <li key={`${x.indicador}${x.rotulo}`}>
                <span>{x.rotulo}</span>
                <b style={x.adelante ? colT(equipoDeLado(x.adelante)) : undefined}>{x.adelante ? nom(equipoDeLado(x.adelante)) : 'parejos'}</b>
                {x.valores && (
                  <small className="dc-num">
                    <span style={colT('cardenas')}>{dec(x.valores.c, x.valores.dec)}</span> · <span style={colT('rebolledo')}>{dec(x.valores.r, x.valores.dec)}</span> {x.valores.unidad}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ── Una fila por cada indicador que da punto ─────────────────────────────────

function FilasPuntos({ filas, nombres }: { filas: FilaPunto[]; nombres: NombresEquipos }) {
  const nom = (e: EquipoId) => nombreCorto(e, nombres)
  const celda = (f: FilaPunto, l: Lado) => {
    const v = l === 'c' ? f.c : f.r
    const gana = f.gana === l
    return (
      <span className="dc-v dc-num" data-gana={gana ? '1' : undefined}>
        <b>{gana && <i className="dc-pt" aria-hidden="true" style={{ background: COLOR_EQUIPO[equipoDeLado(l)] }} />}{v != null ? dec(v, f.dec) : '—'}</b>
        {gana && <span className="dc-sr"> gana el punto</span>}
        {f.id === 'micro' && (l === 'c' ? f.totalC : f.totalR) != null && <small>{dec((l === 'c' ? f.totalC : f.totalR)!)} min en el turno</small>}
      </span>
    )
  }
  return (
    <div className="dc-filas" role="table" aria-label="Indicadores que dan punto">
      <div className="dc-fila dc-fila-h" role="row">
        <span role="columnheader">gana el punto</span>
        <span role="columnheader" style={colT('cardenas')}>{nom('cardenas')}</span>
        <span role="columnheader" style={colT('rebolledo')}>{nom('rebolledo')}</span>
      </div>
      {filas.map((f) => (
        <div key={f.id} className="dc-fila" role="row">
          <span className="dc-fn" role="rowheader" tabIndex={0} data-tip={f.formula}>{f.rotulo}<small>{f.sub}</small></span>
          {celda(f, 'c')}
          {celda(f, 'r')}
          <p className="dc-fr">{f.frase}</p>
        </div>
      ))}
    </div>
  )
}
