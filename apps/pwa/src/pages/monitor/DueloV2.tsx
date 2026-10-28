/**
 * Duelo de equipos en el monitor v2: la tarjeta exprés de «El turno» y la pestaña «Duelo».
 *
 * Plan: ARIA_MANTENIMIENTO_PLANTA/docs/PLAN_DUELO_EQUIPOS.md. Toda la lógica vive en `duelo.ts` (pura y probada);
 * acá solo se dibuja. Se compone con los primitivos de la piel (`Tarjeta`, `ListGroup`, `Pill`) y los tokens
 * `--v2-*`. La unidad del duelo es la JORNADA (fecha de producción): la noche contra el día de la misma fecha, y cada
 * equipo conserva SIEMPRE su color. Los operadores no tienen nombre en ninguna parte: la alimentación se compara por
 * puesto (Ev 1, Ev 2, Ev 3, B200).
 */
import { useState, type ReactNode } from 'react'
import { Flag, Trophy, Wrench } from 'lucide-react'
import { Button, ListCell, ListGroup, Pill, SegmentedControl } from '@/components/piel'
import { useAnchoMin } from './ampliarHooks'
import { Tarjeta } from './AmpliarV2'
import { CarreraDueloV2 } from './CarreraDueloV2'
import { DueloPC, type DueloPCExtra } from './DueloPC'
import { SelectorLinea, type LineasMonitor } from './SelectorLinea'
import { fijarEquipoDelTurno, guardarNombresDuelo } from './dueloConfig'
import {
  COLOR_EQUIPO, COLOR_EQUIPO_TEXTO, EQUIPOS, etiquetaHora, fechaCorreccion, nombreCorto, nombreEquipo, otroEquipo, relojDeMinuto, rotuloFantasma, rotuloTurno, textoCorreContraEstaCurva,
  type CicloDuelo, type DatosDuelo, type EquipoId, type NombresEquipos,
} from './duelo'
import { dec1 } from '@/utils/formatoNumeros'
import { KpiAKpiV2, PeriodoDueloV2, ResumenCompactoV2, PuestosVsV2, RitmoHoraV2, TendenciaSemanalV2, type LadoDuelo } from './GraficosDueloV2'

// ── Formato ──────────────────────────────────────────────────────────────────

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const firmado = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${int(Math.abs(n))}`
const fechaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`
const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)
const relojUtc = (ms: number) => new Date(ms).toISOString().slice(11, 16)

export interface DueloUiProps {
  datos: DatosDuelo | null
  nombres: NombresEquipos
  /** «carros» (Baader 142) o «silletas» (Baader 200): el rótulo de la alimentación. */
  unidad: 'carros' | 'silletas' | null
  /** Hora de planta de la primera pieza de hoy (ms wall-clock). */
  inicioMs: number | null
}

/** Los dos lados del duelo con su nombre corto: A = el turno que se mira, B = su rival. */
function lados(d: DatosDuelo, nombres: NombresEquipos): { a: LadoDuelo; b: LadoDuelo } {
  const rivalId = d.rival?.equipo ?? otroEquipo(d.hoy.equipo)
  return {
    a: { id: d.hoy.equipo, nombre: nombreCorto(d.hoy.equipo, nombres) },
    b: { id: rivalId, nombre: nombreCorto(rivalId, nombres) },
  }
}

// ── Piezas sueltas ───────────────────────────────────────────────────────────

/** Una sección: tarjeta propia en la pestaña, encabezado simple dentro del ampliado. */
function Seccion({ titulo, sub, plano, icono, children, className }: { titulo: string; sub?: string; plano: boolean; icono?: ReactNode; children: ReactNode; className?: string }) {
  if (plano) {
    return (
      <section className="min-w-0">
        <h4 className="text-[17px] font-semibold leading-tight text-foreground">{titulo}</h4>
        {sub && <p className="mt-0.5 text-[13px] text-muted-foreground">{sub}</p>}
        {children}
      </section>
    )
  }
  return <Tarjeta icono={icono} titulo={titulo} sub={sub} className={className}>{children}</Tarjeta>
}

const Nota = ({ children }: { children: ReactNode }) => <p className="mt-3 text-[13px] leading-snug text-muted-foreground">{children}</p>

function Cifras({ izq, der }: { izq: { nombre: string; valor: string; unidad?: string; color: string }; der: { nombre: string; valor: string; unidad?: string; color: string } | null }) {
  /* El nombre puede bajar a un 2.º renglón («Cárdenas a la misma hora» a 375 px) en vez de cortarse con «…»: cada columna es un subgrid de
     dos filas (nombre · cifra) y la fila del nombre mide lo del más alto, así las dos cifras quedan en la misma base. */
  const col = (c: { nombre: string; valor: string; unidad?: string; color: string }) => (
    <div className="row-span-2 grid min-w-0 [grid-template-rows:subgrid]">
      <div className="flex items-start gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
        <i className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
        <span className="min-w-0">{c.nombre}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="v2-cifra-chica tabular-nums font-semibold leading-none tracking-tight text-foreground">{c.valor}</span>
        {c.unidad && <span className="text-[15px] text-muted-foreground">{c.unidad}</span>}
      </div>
    </div>
  )
  return <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">{col(izq)}{der && col(der)}</div>
}

// ── Bloques ──────────────────────────────────────────────────────────────────

function BloqueCarrera({ d, nombres, inicioMs, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; inicioMs: number | null; plano: boolean; className?: string }) {
  const c = d.carrera
  const { a, b } = lados(d, nombres)
  const fan = c?.fantasmaInfo ?? null
  const colorA = COLOR_EQUIPO[a.id]
  const sub = c ? `${etiquetaHora(c.hora)} de producción · ${d.hoy.cerrado ? 'cerrado' : 'en vivo'}` : 'Todavía no hay piezas'
  const lider = c?.diferencia != null && c.diferencia !== 0 ? (c.diferencia > 0 ? a : b) : null
  /* La noche abre la jornada y corre sola; el día sin noche también. */
  const abre = d.abreJornada && !d.hoy.cerrado
  const jornada = fechaCorta(d.hoy.jornada)
  const corre = abre ? 'abre' : d.esperando ? 'espera' : 'compite'
  return (
    <Seccion titulo="Carrera" sub={sub} plano={plano} className={className} icono={<Flag className="h-3.5 w-3.5" />}>
      {c ? (
        <>
          <div className="mt-3 text-[13px] text-muted-foreground">
            {corre === 'abre' ? `${a.nombre} abre la jornada ${jornada}` : corre === 'espera' ? `${a.nombre} cerró la jornada ${jornada} con` : `${rotuloTurno(a.nombre, d.hoy)} · hechas`}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span className="v2-cifra-chica tabular-nums font-semibold leading-none tracking-tight text-foreground">{int(c.hoyPz)} pz</span>
            {c.diferencia != null && corre === 'compite' && (
              c.diferencia === 0
                ? <span className="text-[17px] font-semibold text-muted-foreground">Parejos con {b.nombre}</span>
                : <span className="text-[22px] font-semibold leading-none tabular-nums" style={{ color: COLOR_EQUIPO_TEXTO[lider!.id] }}>
                    {c.diferencia > 0 ? `${int(c.diferencia)} adelante de ${b.nombre}` : `${int(-c.diferencia)} atrás de ${b.nombre}`}
                  </span>
            )}
            {lider && <span className="sr-only">{lider.nombre} va adelante</span>}
          </div>
          {corre === 'abre' ? (
            <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
              {textoCorreContraEstaCurva(b.nombre, d.hoy.jornada, d.inicioDia)}. Mientras la noche corre no compite con nadie ni suma puntos.
            </p>
          ) : corre === 'espera' ? (
            <p className="mt-2 text-[13px] leading-snug text-muted-foreground">Esperando a {b.nombre}: la jornada suma puntos cuando cierre su turno de día.</p>
          ) : c.fantasmaPz != null && fan ? (
            <p className="mt-2 text-[13px] leading-snug tabular-nums text-muted-foreground">
              A la misma hora de producción ({horas(c.minuto)}), {rotuloFantasma(fan, b.nombre)}: {int(c.fantasmaPz)} pz hechas
              {fan.total != null ? `; ese turno cerró con ${int(fan.total)} pz` : ''}.
            </p>
          ) : d.rival ? (
            <Nota>Todavía no hay una curva de {b.nombre} del otro horario para comparar a esta hora{d.hoy.cerrado ? '' : ': aparece cuando el monitor la publique'}.</Nota>
          ) : (
            <Nota>Esta jornada no tiene turno de noche: {a.nombre} corre solo, contra su propia referencia en gris.</Nota>
          )}
          <CarreraDueloV2
            hoy={{
              nombre: a.nombre, rotulo: rotuloTurno(a.nombre, d.hoy), color: colorA, colorTexto: COLOR_EQUIPO_TEXTO[a.id], curva: c.hoy, eventos: c.eventosHoy,
              reloj: inicioMs != null ? (m) => relojUtc(inicioMs + m * 60_000) : undefined,
            }}
            rival={fan ? {
              nombre: b.nombre, rotulo: rotuloFantasma(fan, b.nombre), color: COLOR_EQUIPO[fan.equipo], colorTexto: COLOR_EQUIPO_TEXTO[fan.equipo], curva: fan.curva, eventos: fan.eventos,
              reloj: fan.inicioMin != null ? (m) => relojDeMinuto(fan.inicioMin! + m) : undefined,
            } : null}
            banda={c.banda}
            bandaRotulo={c.banda
              ? c.bandaPropia
                ? `${a.nombre} · su promedio de ${d.hoy.esNoche ? 'noche' : 'día'} (${c.banda.turnos} ${c.banda.turnos === 1 ? 'turno' : 'turnos'})`
                : `${b.nombre} · promedio y rango de sus últimos ${c.banda.turnos} turnos de ${d.hoy.esNoche ? 'noche' : 'día'}`
              : undefined}
            conMediaDeBanda={fan?.tipo !== 'promedio'}
            alto={plano ? 240 : undefined}
            ariaLabel={`Piezas hechas por hora de producción de ${a.nombre} contra ${b.nombre}`}
          />
          {d.semanaAnterior && (
            <Nota>
              Mismo horario de la semana anterior, sin puntos: {rotuloFantasma(d.semanaAnterior.fantasma, b.nombre)}
              {d.semanaAnterior.pzAHora != null && d.semanaAnterior.diferencia != null
                ? `, ${int(d.semanaAnterior.pzAHora)} pz hechas a esta hora (${a.nombre} ${firmado(d.semanaAnterior.diferencia)} pz).`
                : '.'}
            </Nota>
          )}
        </>
      ) : (
        <Nota>La carrera aparece con la primera pieza del turno.</Nota>
      )}
    </Seccion>
  )
}

function BloqueRitmo({ d, nombres, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean; className?: string }) {
  const { a, b } = lados(d, nombres)
  const horasRitmo = d.carrera?.ritmoHoras ?? []
  return (
    <Seccion titulo="Ritmo hora a hora" sub="pz/min de cada hora de producción, con las detenciones adentro" plano={plano} className={className}>
      {horasRitmo.length > 0 && d.carrera?.fantasma ? (
        <RitmoHoraV2 horas={horasRitmo} a={a} b={b} nombreRival={b.nombre} />
      ) : d.abreJornada && !d.hoy.cerrado ? (
        <Nota>La noche abre la jornada y no compite con nadie: el ritmo hora a hora se compara cuando juegue el día.</Nota>
      ) : (
        <Nota>Todavía no hay horas de producción de los dos equipos para comparar.</Nota>
      )}
      <Nota>Piezas entre el inicio y el final de cada hora, contadas desde la primera pieza de cada turno. La hora en curso va más tenue.</Nota>
    </Seccion>
  )
}

function BloqueMarcador({ d, nombres, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean; className?: string }) {
  const m = d.marcador
  const puntaje = d.puntaje
  const { a, b } = lados(d, nombres)
  if (!m || !d.rival) {
    return (
      <Seccion titulo="Marcador de la jornada" sub="La noche contra el día de la misma fecha de producción" plano={plano} className={className} icono={<Trophy className="h-3.5 w-3.5" />}>
        <Nota>
          {d.abreJornada && !d.hoy.cerrado
            ? `La noche abre la jornada y no compite con nadie mientras corre. Los puntos se asignan cuando cierran la noche y el día; ${b.nombre} juega el día del ${fechaCorta(d.hoy.jornada)}.`
            : d.esperando
              ? `La noche ya cerró y espera a ${b.nombre}: la jornada suma puntos cuando cierre su turno de día.`
              : 'Esta jornada no tiene turno de noche, o su rival todavía no trae los datos del duelo: no hay con quién comparar ni puntos que asignar.'}
        </Nota>
        <div className="duelo-pc-solo"><ResumenCompactoV2 duelos={d.duelos} hoyKey={d.hoyKey} rachas={d.rachas} nombreDe={(e) => nombreCorto(e, nombres)} /></div>
      </Seccion>
    )
  }
  const sub = `${rotuloTurno(a.nombre, d.hoy)} contra ${rotuloTurno(b.nombre, d.rival)}${d.hoy.cerrado ? '' : ' · en juego'}`
  return (
    <Seccion titulo="Marcador de la jornada" sub={sub} plano={plano} className={className} icono={<Trophy className="h-3.5 w-3.5" />}>
      {m.sinDuelo ? (
        <>
          <div className="mt-3"><Pill tone="neutral">Sin duelo</Pill></div>
          <Nota>{m.motivo}. No suma ni quita puntos a nadie.</Nota>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
            <span className="v2-cifra-chica font-semibold leading-none text-foreground">{puntaje?.firmes.a ?? m.puntosA} – {puntaje?.firmes.b ?? m.puntosB}</span>
            {puntaje && puntaje.enJuego > 0 && <span className="text-[13px] text-muted-foreground">{puntaje.enJuego} en juego</span>}
            <span className="text-[15px] text-muted-foreground">
              <span style={{ color: COLOR_EQUIPO_TEXTO[a.id] }}>{a.nombre}</span> contra <span style={{ color: COLOR_EQUIPO_TEXTO[b.id] }}>{b.nombre}</span>
            </span>
          </div>
          <div className="mt-2 text-[13px] text-muted-foreground">
            {m.ganador === 'pendiente' ? 'El turno sigue en curso: los puntos se confirman al cierre, cuando los dos turnos de la jornada hayan cerrado.' : m.ganador === 'empate' ? 'Jornada empatada.' : `Gana la jornada ${m.ganador === 'a' ? a.nombre : b.nombre}.`}
          </div>
          <div className="duelo-pc-oculto">
            <KpiAKpiV2 filas={d.kpiAKpi} a={a} b={b} />
            <Nota>{NOTA_PUNTOS}</Nota>
          </div>
        </>
      )}
      {d.hoy.fallasN > 0 && <Nota>Las {d.hoy.fallasN} {d.hoy.fallasN === 1 ? 'falla técnica' : 'fallas técnicas'} de {a.nombre} ({horas(d.hoy.fallaMin)}) se descuentan del tiempo comparable.</Nota>}
      <div className="duelo-pc-solo"><ResumenCompactoV2 duelos={d.duelos} hoyKey={d.hoyKey} rachas={d.rachas} nombreDe={(e) => nombreCorto(e, nombres)} /></div>
    </Seccion>
  )
}

const NOTA_PUNTOS = 'Un punto por KPI y uno por puesto de alimentación; arranque y cierre valen un solo punto (gana quien gana los dos). Las fallas técnicas no restan: sus piezas se suman al equipo. En «menos es mejor» gana la barra más corta.'

/** KPI a KPI como tarjeta propia: solo en la pestaña a ancho de PC (en celular va dentro del marcador de la jornada). */
function BloqueKpiPC({ d, nombres, className }: { d: DatosDuelo; nombres: NombresEquipos; className?: string }) {
  const { a, b } = lados(d, nombres)
  const hay = d.marcador && !d.marcador.sinDuelo && d.rival && d.kpiAKpi.length > 0
  return (
    <Tarjeta titulo="KPI a KPI" sub="cada equipo empuja la barra hacia su lado" className={`duelo-pc-solo ${className ?? ''}`}>
      {hay ? <><KpiAKpiV2 filas={d.kpiAKpi} a={a} b={b} /><Nota>{NOTA_PUNTOS}</Nota></> : <Nota>Se compara cuando cierran los dos turnos de la jornada.</Nota>}
    </Tarjeta>
  )
}

function FilaCiclo({ c, nombres, hoy }: { c: CicloDuelo; nombres: NombresEquipos; hoy: EquipoId }) {
  const max = Math.max(1, c.puntos.rebolledo, c.puntos.cardenas)
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="tabular-nums">{fechaCorta(c.inicio)} al {fechaCorta(c.fin)}</span>
        <span>{c.vigente ? 'ciclo en curso' : 'ciclo anterior'}</span>
      </div>
      <ul className="mt-2 space-y-3">
        {[hoy, otroEquipo(hoy)].map((e) => (
          <li key={e} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-[15px]">
              <span className="min-w-0 truncate text-foreground">{nombreCorto(e, nombres)}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">{c.puntos[e]} pt</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted-foreground/[0.12]">
              <div className="duelo-barra-x h-full rounded-full" style={{ width: `${Math.max(2, (c.puntos[e] / max) * 100)}%`, background: COLOR_EQUIPO[e] }} />
            </div>
            <div className="mt-1 text-[13px] tabular-nums text-muted-foreground">{c.ganados[e]} de {c.jugados[e]} {c.jugados[e] === 1 ? 'turno ganado' : 'turnos ganados'}</div>
          </li>
        ))}
      </ul>
    </li>
  )
}

function BloqueCiclo({ d, nombres, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean; className?: string }) {
  const hay = (c: CicloDuelo) => c.jugados.rebolledo + c.jugados.cardenas > 0
  return (
    <Seccion titulo="Marcador del ciclo" sub="Dos semanas: cada equipo hace día y noche" plano={plano} className={className} icono={<Trophy className="h-3.5 w-3.5" />}>
      {hay(d.ciclo) || hay(d.cicloPrevio) ? (
        <ul className="mt-4 space-y-5">
          <FilaCiclo c={d.ciclo} nombres={nombres} hoy={d.hoy.equipo} />
          {hay(d.cicloPrevio) && <FilaCiclo c={d.cicloPrevio} nombres={nombres} hoy={d.hoy.equipo} />}
        </ul>
      ) : (
        <Nota>Todavía no hay jornadas cerradas con duelo en este ciclo.</Nota>
      )}
      <Nota>Cada jornada es un partido: los puntos de cada turno van al equipo que lo hizo. El turno de hoy se suma cuando cierra y su rival de la jornada ya cerró.</Nota>
    </Seccion>
  )
}

function BloquePeriodo({ d, nombres, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean; className?: string }) {
  return (
    <Seccion titulo="Quién gana la semana y el mes" sub="Puntos de las jornadas cerradas, por fecha de producción" plano={plano} className={className} icono={<Trophy className="h-3.5 w-3.5" />}>
      <PeriodoDueloV2 duelos={d.duelos} hoyKey={d.hoyKey} nombreDe={(e) => nombreCorto(e, nombres)} />
      <Nota>Cuenta los turnos que el monitor tiene publicados; un mes con pocos días publicados puede estar incompleto. La semana va de lunes a domingo; el mes, calendario completo.</Nota>
    </Seccion>
  )
}

function BloqueTendencia({ d, nombres, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean; className?: string }) {
  const { a, b } = lados(d, nombres)
  return (
    <Seccion titulo="Tendencia semanal" sub="Piezas por turno de cada equipo" plano={plano} className={className}>
      {d.tendencia.length >= 2 ? (
        <TendenciaSemanalV2 semanas={d.tendencia} a={a} b={b} />
      ) : (
        <Nota>Hacen falta turnos cerrados de al menos dos semanas para dibujar la tendencia.</Nota>
      )}
    </Seccion>
  )
}

function BloqueRecords({ d, nombres, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean; className?: string }) {
  const rachaTxt = (n: number) => `${n} ${n === 1 ? 'turno' : 'turnos'}`
  return (
    <Seccion titulo="Récords y rachas" sub="De los últimos turnos publicados de la línea" plano={plano} className={className}>
      {d.records.length > 0 ? (
        <div className="mt-3">
          <ListGroup title="Récords">
            {d.records.map((r) => (
              <ListCell
                key={r.id}
                title={<span className="whitespace-normal">{r.rotulo}</span>}
                subtitle={`${nombreCorto(r.equipo, nombres)} · ${fechaCorta(r.dateKey)}`}
                value={`${r.decimales > 0 ? dec1(r.valor) : int(r.valor)} ${r.unidad}`}
              />
            ))}
          </ListGroup>
        </div>
      ) : (
        <Nota>Todavía no hay turnos con datos suficientes para armar récords.</Nota>
      )}
      <div className="mt-3">
        <ListGroup title="Racha de turnos ganados">
          {EQUIPOS.map((e) => (
            <ListCell key={e} title={nombreCorto(e, nombres)} subtitle={`mejor racha: ${rachaTxt(d.rachas[e].mejor)}`} value={rachaTxt(d.rachas[e].actual)} />
          ))}
        </ListGroup>
      </div>
    </Seccion>
  )
}

function BloqueCosto({ d, nombres, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean; className?: string }) {
  return (
    <Seccion titulo="Costo de Mantención" sub={`Lo que las fallas técnicas le quitaron a cada equipo en el ${d.costo.etiqueta}`} plano={plano} className={className} icono={<Wrench className="h-3.5 w-3.5" />}>
      <div className="mt-3">
        <ListGroup>
          {EQUIPOS.map((e) => {
            const c = d.costo.equipos[e]
            return (
              <ListCell
                key={e}
                title={nombreCorto(e, nombres)}
                subtitle={c.turnos === 0
                  ? `sin turnos en el ${d.costo.periodo === 'ciclo' ? 'ciclo' : 'período'}`
                  : c.fallasN === 0
                    ? `${c.turnos} ${c.turnos === 1 ? 'turno' : 'turnos'} sin fallas técnicas`
                    : `${c.fallasN} ${c.fallasN === 1 ? 'falla' : 'fallas'} · ${horas(c.fallaMin)}${c.minPorFalla != null ? ` · ${dec1(c.minPorFalla)} min por falla` : ''}`}
                value={`${int(c.piezasPerdidas)} pz`}
                valueSub="que quitó la falla"
              />
            )
          })}
        </ListGroup>
      </div>
      <Nota>Piezas = minutos de falla técnica × ritmo andando del propio turno. Es un cálculo del equipo, no un conteo del sensor. No restan puntos: se suman al total del equipo en la carrera.</Nota>
    </Seccion>
  )
}

function BloqueAlimentacion({ d, nombres, unidad, plano, className }: { d: DatosDuelo; nombres: NombresEquipos; unidad: 'carros' | 'silletas' | null; plano: boolean; className?: string }) {
  const m = d.marcador
  const { a, b } = lados(d, nombres)
  const cosa = unidad ?? 'posiciones'
  return (
    <Seccion titulo="Alimentación por puesto" sub={`${cosa} con pieza sobre el tiempo andando`} plano={plano} className={className}>
      {m && !m.sinDuelo && m.puestos.length > 0 && d.rival ? (
        <PuestosVsV2 puestos={m.puestos} a={a} b={b} />
      ) : (
        <Nota>{m?.sinDuelo ? 'Este turno quedó sin duelo.' : 'Se compara cuando cierran los dos turnos de la jornada.'}</Nota>
      )}
      <Nota>Piezas del puesto ÷ (esperado de Shoplogix × minutos andando), de 0 a 100 %. Un punto por puesto ganado; los puestos se comparan sin nombres de operadores.</Nota>
    </Seccion>
  )
}

// ── Cuerpo completo (ampliado de la tarjeta) ─────────────────────────────────

/** Todo el duelo en una columna: es el ampliado de la tarjeta exprés. */
export function CuerpoDuelo({ datos, nombres, unidad, inicioMs }: DueloUiProps) {
  if (!datos) return <p className="text-[15px] text-muted-foreground">El duelo aparece cuando el turno trae su hora de inicio planificada.</p>
  return (
    <div className="space-y-6">
      <AvisoDuelo d={datos} nombres={nombres} />
      <BloqueCarrera d={datos} nombres={nombres} inicioMs={inicioMs} plano />
      <BloqueRitmo d={datos} nombres={nombres} plano />
      <BloqueMarcador d={datos} nombres={nombres} plano />
      <BloqueAlimentacion d={datos} nombres={nombres} unidad={unidad} plano />
      <BloquePeriodo d={datos} nombres={nombres} plano />
      <BloqueCiclo d={datos} nombres={nombres} plano />
      <BloqueTendencia d={datos} nombres={nombres} plano />
      <BloqueRecords d={datos} nombres={nombres} plano />
      <BloqueCosto d={datos} nombres={nombres} plano />
    </div>
  )
}

/** Quién hizo este turno, el aviso de corrección (con quién y cuándo) y el estado de los datos. */
function AvisoDuelo({ d, nombres }: { d: DatosDuelo; nombres: NombresEquipos }) {
  const cuando = fechaCorreccion(d.correccion?.at)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone="info">Turno de {nombreCorto(d.hoy.equipo, nombres)}</Pill>
      {d.corregido && <Pill tone="warning" className="tabular-nums">{cuando ? `Corregido a mano · ${cuando}` : 'Corregido a mano'}</Pill>}
      {d.listos.con < d.listos.de && (
        <span className="text-[13px] tabular-nums text-muted-foreground">
          Reuniendo el historial: {d.listos.con} de {d.listos.de} turnos listos para el duelo
        </span>
      )}
    </div>
  )
}

// ── Tarjeta exprés de «El turno» ─────────────────────────────────────────────

export function TarjetaDueloV2({ datos, nombres, unidad, inicioMs, className }: DueloUiProps & { className?: string }) {
  if (!datos) {
    return (
      <Tarjeta icono={<Trophy className="h-3.5 w-3.5" />} titulo="Duelo" sub="noche contra día" className={className}>
        <p className="mt-3 text-[13px] text-muted-foreground">Aparece cuando el turno trae su hora de inicio planificada.</p>
      </Tarjeta>
    )
  }
  const c = datos.carrera
  const { a, b } = lados(datos, nombres)
  const fan = c?.fantasmaInfo ?? null
  const m = datos.marcador
  const sola = datos.abreJornada && (!datos.hoy.cerrado || datos.esperando != null)
  const jornada = fechaCorta(datos.hoy.jornada)
  const sub = c
    ? sola ? `${etiquetaHora(c.hora)} de producción · ${a.nombre} ${datos.hoy.cerrado ? 'cerró' : 'abre'} la jornada` : `${etiquetaHora(c.hora)} de producción · ${a.nombre} contra ${b.nombre}`
    : 'el turno todavía no parte'
  const lider = c?.diferencia != null && c.diferencia !== 0 ? (c.diferencia > 0 ? a : b) : null
  return (
    <Tarjeta
      icono={<Trophy className="h-3.5 w-3.5" />}
      titulo="Duelo"
      sub={sub}
      className={className}
      ampliado={<CuerpoDuelo datos={datos} nombres={nombres} unidad={unidad} inicioMs={inicioMs} />}
      subAmpliado="carrera, ritmo, marcador, semana y mes, ciclo, tendencia, récords y costo de Mantención"
    >
      {c && sola ? (
        <>
          <Cifras izq={{ nombre: `${a.nombre} ${datos.hoy.cerrado ? 'cerró' : 'abre'} la jornada ${jornada}`, valor: int(c.hoyPz), unidad: 'pz', color: COLOR_EQUIPO[a.id] }} der={null} />
          <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
            {datos.hoy.cerrado ? `Esperando a ${b.nombre}: juega el turno día del ${jornada}.` : `${textoCorreContraEstaCurva(b.nombre, datos.hoy.jornada, datos.inicioDia)}.`}
          </p>
          <CarreraDueloV2
            mini
            hoy={{ nombre: a.nombre, color: COLOR_EQUIPO[a.id], colorTexto: COLOR_EQUIPO_TEXTO[a.id], curva: c.hoy }}
            banda={c.banda}
            ariaLabel={`Piezas hechas de ${a.nombre} en la noche que abre la jornada ${jornada}`}
          />
        </>
      ) : c && c.fantasmaPz != null && fan ? (
        <>
          <Cifras
            izq={{ nombre: rotuloTurno(a.nombre, datos.hoy), valor: int(c.hoyPz), unidad: 'pz', color: COLOR_EQUIPO[a.id] }}
            der={{ nombre: `${b.nombre} a la misma hora`, valor: int(c.fantasmaPz), unidad: 'pz', color: COLOR_EQUIPO[b.id] }}
          />
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {lider ? (
              <span className="text-[17px] font-semibold tabular-nums" style={{ color: COLOR_EQUIPO_TEXTO[lider.id] }}>{lider.nombre} {int(Math.abs(c.diferencia ?? 0))} adelante</span>
            ) : (
              <span className="text-[15px] text-muted-foreground">Parejos</span>
            )}
            {m && !m.sinDuelo && <span className="text-[13px] tabular-nums text-muted-foreground">marcador {datos.puntaje?.firmes.a ?? m.puntosA} – {datos.puntaje?.firmes.b ?? m.puntosB}{datos.puntaje && datos.puntaje.enJuego > 0 ? ` · ${datos.puntaje.enJuego} en juego` : ''}</span>}
            {m?.sinDuelo && <span className="text-[13px] text-muted-foreground">sin duelo en este turno</span>}
          </div>
          <CarreraDueloV2
            mini
            hoy={{ nombre: a.nombre, color: COLOR_EQUIPO[a.id], colorTexto: COLOR_EQUIPO_TEXTO[a.id], curva: c.hoy }}
            rival={{ nombre: b.nombre, color: COLOR_EQUIPO[fan.equipo], curva: fan.curva }}
            ariaLabel={`Piezas hechas de ${a.nombre} contra ${b.nombre} a la misma hora de producción`}
          />
        </>
      ) : c ? (
        <>
          <Cifras izq={{ nombre: rotuloTurno(a.nombre, datos.hoy), valor: int(c.hoyPz), unidad: 'pz', color: COLOR_EQUIPO[a.id] }} der={null} />
          <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
            {datos.rival ? `Todavía no hay una curva de ${b.nombre} del otro horario para comparar.` : 'Esta jornada no tiene turno de noche: corre solo, contra su referencia.'}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">La carrera parte con la primera pieza del turno.</p>
      )}
    </Tarjeta>
  )
}

// ── Pestaña «Duelo» ──────────────────────────────────────────────────────────

type Eleccion = 'auto' | EquipoId

/**
 * Edición de nombres y del equipo de este turno: solo con sesión de supervisor o admin. El selector del equipo NO
 * escribe al tocarlo: pide confirmación («¿Asignar este turno a X?»), porque un toque accidental dejaba turnos
 * «corregidos a mano» sin que nadie lo hubiera querido.
 */
function EditorDuelo({ token, d, nombres, nombresGuardados, className }: { token: string; d: DatosDuelo; nombres: NombresEquipos; nombresGuardados: NombresEquipos; className?: string }) {
  const [borrador, setBorrador] = useState<NombresEquipos>({ rebolledo: nombresGuardados.rebolledo ?? '', cardenas: nombresGuardados.cardenas ?? '' })
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado' | 'error'>('quieto')
  const sinCambios = EQUIPOS.every((e) => (borrador[e] ?? '').trim() === (nombresGuardados[e] ?? '').trim())
  const campo = 'tap-44 w-full rounded-ctl bg-muted-foreground/[0.12] px-3 py-2 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  const guardar = async () => {
    setEstado('guardando')
    try { await guardarNombresDuelo(token, borrador); setEstado('guardado') } catch { setEstado('error') }
  }
  const actual: Eleccion = d.corregido ? d.hoy.equipo : 'auto'
  const [pendiente, setPendiente] = useState<Eleccion | null>(null)
  const [escribiendo, setEscribiendo] = useState(false)
  const [errorEquipo, setErrorEquipo] = useState(false)
  const confirmar = async () => {
    if (!pendiente) return
    setEscribiendo(true)
    setErrorEquipo(false)
    try {
      await fijarEquipoDelTurno(token, d.hoy.shiftDocId, pendiente === 'auto' ? null : pendiente)
      setPendiente(null)
    } catch { setErrorEquipo(true) }
    setEscribiendo(false)
  }
  const textoPendiente = pendiente === 'auto'
    ? '¿Volver este turno a la rotación automática?'
    : pendiente ? `¿Asignar este turno a ${nombreCorto(pendiente, nombres)}?` : ''
  return (
    <Tarjeta titulo="Equipos del duelo" sub="solo con sesión de supervisor" className={className}>
      <div className="mt-3 space-y-3">
        {EQUIPOS.map((e, i) => (
          <label key={e} className="block">
            <span className="text-[13px] text-muted-foreground">Supervisor del grupo {i + 1}</span>
            <input
              className={`${campo} mt-1`}
              value={borrador[e] ?? ''}
              maxLength={60}
              placeholder={nombreEquipo(e, nombres)}
              onChange={(ev) => { setBorrador((b) => ({ ...b, [e]: ev.target.value })); setEstado('quieto') }}
              autoComplete="off"
            />
          </label>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button size="md" variant="tinted" onClick={guardar} disabled={sinCambios || estado === 'guardando'}>Guardar nombres</Button>
          {estado === 'guardado' && <span className="text-[13px] text-muted-foreground">Guardado</span>}
          {estado === 'error' && <span className="text-[13px] text-ink-crit">No se pudo guardar. Revisa la sesión e intenta de nuevo.</span>}
        </div>
        <p className="text-[13px] leading-snug text-muted-foreground">Nombre y apellido. En pantalla se usa el apellido. Vacío vuelve a «Grupo 1» y «Grupo 2» (Eviscerado trae a sus supervisores de fábrica).</p>
      </div>
      <div className="mt-5">
        <div className="text-[15px] font-medium text-foreground">Equipo de este turno</div>
        <p className="mt-0.5 text-[13px] text-muted-foreground">Corrige la rotación si un feriado o un cambio de turno la rompió. Pide confirmación antes de guardar.</p>
        <SegmentedControl
          className="mt-3"
          ariaLabel="Equipo que hizo este turno"
          value={pendiente ?? actual}
          onChange={(v) => { setErrorEquipo(false); setPendiente(v === actual ? null : v) }}
          segments={[
            { value: 'auto', label: 'Automático' },
            { value: 'rebolledo', label: nombreCorto('rebolledo', nombres) },
            { value: 'cardenas', label: nombreCorto('cardenas', nombres) },
          ]}
        />
        {pendiente && (
          <div className="mt-3 rounded-ctl bg-muted-foreground/[0.08] p-3" role="alertdialog" aria-label="Confirmar el equipo del turno">
            <p className="text-[15px] text-foreground">{textoPendiente}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="md" variant="filled" onClick={() => { void confirmar() }} disabled={escribiendo}>Guardar</Button>
              <Button size="md" variant="plain" onClick={() => { setPendiente(null); setErrorEquipo(false) }} disabled={escribiendo}>Cancelar</Button>
            </div>
          </div>
        )}
        {errorEquipo && <p className="mt-2 text-[13px] text-ink-crit">No se pudo guardar la corrección.</p>}
      </div>
    </Tarjeta>
  )
}

/** Antes vivía acá; es el mismo tipo del selector compartido. */
export type LineasDuelo = LineasMonitor

export function PestanaDueloV2({ datos, nombres, unidad, inicioMs, token, puedeEditar, nombresGuardados, lineas, pc }: DueloUiProps & {
  token: string | undefined
  puedeEditar: boolean
  nombresGuardados: NombresEquipos
  lineas?: LineasDuelo | null
  /** Lo que el Duelo en PC necesita además de `datos`; sin él (o con menos de 1280 px) se arma la pestaña de siempre. */
  pc?: DueloPCExtra | null
}) {
  const anchoPc = useAnchoMin(1280)
  if (datos && pc && anchoPc) {
    /* Opción B «Eje» (5b): una sola pantalla sin scroll. Arriba, y solo si hace falta, una fila fina con el selector de
       línea (sin sesión) y los avisos; el editor de supervisores queda debajo del pliegue. */
    const hayAviso = datos.corregido || datos.listos.con < datos.listos.de
    const hayHermanas = !!lineas && lineas.hermanas.length > 0
    return (
      <div className="monitor-v2">
        <DueloPC
          datos={datos}
          nombres={nombres}
          unidad={unidad}
          inicioMs={inicioMs}
          extra={pc}
          superior={hayHermanas || hayAviso ? (
            <>
              {hayHermanas && <SelectorLinea lineas={lineas!} className="dpc-linea" />}
              {hayAviso && <div className="ml-auto"><AvisoDuelo d={datos} nombres={nombres} /></div>}
            </>
          ) : null}
        />
        {puedeEditar && token && (
          <div className="mt-4 max-w-[560px]">
            <EditorDuelo token={token} d={datos} nombres={nombres} nombresGuardados={nombresGuardados} />
          </div>
        )}
      </div>
    )
  }
  if (!datos) {
    return (
      <div className="monitor-v2 flex flex-col gap-3">
        {lineas && lineas.hermanas.length > 0 && <SelectorLinea lineas={lineas} />}
        <Tarjeta icono={<Trophy className="h-3.5 w-3.5" />} titulo="Duelo de equipos" sub="noche contra día">
          <p className="mt-3 text-[15px] text-muted-foreground">El duelo aparece cuando el turno trae su hora de inicio planificada.</p>
        </Tarjeta>
      </div>
    )
  }
  /* A ancho de PC (≥ 1280 px) las dos columnas se deshacen (`xl:contents`) y todas las piezas caen en una grilla de 12:
     carrera 8 + marcador 4; KPI a KPI 6 + ritmo 6; alimentación, tendencia y récords 4 cada uno; costo, semana y mes,
     ciclo y editor cierran. En celular y hasta lg el orden sigue siendo el de siempre. */
  return (
    <div className="monitor-v2 duelo-pc flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-4 xl:grid-cols-12">
      {lineas && lineas.hermanas.length > 0 && (
        <SelectorLinea lineas={lineas} className="lg:col-span-2 xl:order-first xl:col-span-12" />
      )}
      <div className="flex min-w-0 flex-col gap-3 lg:gap-4 xl:contents">
        <div className="xl:order-1 xl:col-span-12"><AvisoDuelo d={datos} nombres={nombres} /></div>
        <BloqueCarrera d={datos} nombres={nombres} inicioMs={inicioMs} plano={false} className="xl:order-2 xl:col-span-8" />
        <BloqueRitmo d={datos} nombres={nombres} plano={false} className="xl:order-5 xl:col-span-6" />
        <BloqueMarcador d={datos} nombres={nombres} plano={false} className="xl:order-3 xl:col-span-4" />
        <BloqueAlimentacion d={datos} nombres={nombres} unidad={unidad} plano={false} className="xl:order-6 xl:col-span-4" />
      </div>
      <BloqueKpiPC d={datos} nombres={nombres} className="xl:order-4 xl:col-span-6" />
      <div className="flex min-w-0 flex-col gap-3 lg:gap-4 xl:contents">
        <BloquePeriodo d={datos} nombres={nombres} plano={false} className="xl:order-10 xl:col-span-4" />
        <BloqueCiclo d={datos} nombres={nombres} plano={false} className="xl:order-11 xl:col-span-4" />
        <BloqueTendencia d={datos} nombres={nombres} plano={false} className="xl:order-7 xl:col-span-4" />
        <BloqueRecords d={datos} nombres={nombres} plano={false} className="xl:order-8 xl:col-span-4" />
        <BloqueCosto d={datos} nombres={nombres} plano={false} className="xl:order-9 xl:col-span-4" />
        {puedeEditar && token && <EditorDuelo token={token} d={datos} nombres={nombres} nombresGuardados={nombresGuardados} className="xl:order-12 xl:col-span-4" />}
      </div>
    </div>
  )
}
