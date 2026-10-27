/**
 * Duelo de equipos en el monitor v2: la tarjeta exprés de «El turno» y la pestaña «Duelo».
 *
 * Plan: ARIA_MANTENIMIENTO_PLANTA/docs/PLAN_DUELO_EQUIPOS.md. Toda la lógica vive en `duelo.ts` (pura y probada);
 * acá solo se dibuja. Se compone con los primitivos de la piel (`Tarjeta`, `ListGroup`, `Pill`) y los tokens
 * `--v2-*` que ya existen: ningún color ni token nuevo. Los operadores no tienen nombre en ninguna parte: la
 * alimentación se compara por puesto (Ev 1, Ev 2, Ev 3, B200).
 */
import { useState, type ReactNode } from 'react'
import { Flag, Trophy, Wrench } from 'lucide-react'
import { Button, ListCell, ListGroup, Pill, SegmentedControl } from '@/components/piel'
import type { PillTone } from '@/components/piel/Pill'
import { dec1 } from '@/utils/formatoNumeros'
import { Tarjeta } from './AmpliarV2'
import { CarreraDueloV2 } from './CarreraDueloV2'
import { fijarEquipoDelTurno, guardarNombresDuelo } from './dueloConfig'
import {
  EQUIPOS, nombreCorto, nombreEquipo, otroEquipo,
  type CicloDuelo, type DatosDuelo, type EquipoId, type KpiMarcador, type Marcador, type NombresEquipos, type Resultado,
} from './duelo'

// ── Formato ──────────────────────────────────────────────────────────────────

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const firmado = (n: number, f: (x: number) => string = int) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`
const fechaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`
const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)

const valorKpi = (v: number | null, unidad: string, decimales: number) =>
  v == null ? 'sin dato' : `${decimales > 0 ? dec1(v) : int(v)} ${unidad}`

export interface DueloUiProps {
  datos: DatosDuelo | null
  nombres: NombresEquipos
  /** «carros» (Baader 142) o «silletas» (Baader 200): el rótulo de la alimentación. */
  unidad: 'carros' | 'silletas' | null
  /** Hora de planta de la primera pieza de hoy (ms wall-clock). */
  inicioMs: number | null
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

function Cifras({ izq, der }: { izq: { nombre: string; valor: string; unidad?: string }; der: { nombre: string; valor: string; unidad?: string } | null }) {
  const col = (c: { nombre: string; valor: string; unidad?: string }) => (
    <div className="min-w-0">
      <div className="truncate text-[13px] text-muted-foreground">{c.nombre}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="v2-cifra-chica tabular-nums font-semibold leading-none tracking-tight text-foreground">{c.valor}</span>
        {c.unidad && <span className="text-[15px] text-muted-foreground">{c.unidad}</span>}
      </div>
    </div>
  )
  return <div className="mt-3 grid grid-cols-2 gap-3">{col(izq)}{der && col(der)}</div>
}

const tonoDe = (r: Resultado): PillTone => (r === 'a' ? 'info' : r === 'pendiente' ? 'warning' : 'neutral')

function textoGanador(r: Resultado, a: string, b: string): string {
  switch (r) {
    case 'a': return `Punto ${a}`
    case 'b': return `Punto ${b}`
    case 'empate': return 'Empate'
    case 'pendiente': return 'Al cierre'
    default: return 'Sin dato'
  }
}

// ── Bloques ──────────────────────────────────────────────────────────────────

function BloqueCarrera({ d, nombres, inicioMs, plano }: { d: DatosDuelo; nombres: NombresEquipos; inicioMs: number | null; plano: boolean }) {
  const c = d.carrera
  const a = nombreCorto(d.hoy.equipo, nombres)
  const b = d.rival ? nombreCorto(d.rival.equipo, nombres) : null
  const sub = c ? `Hora ${c.hora} del turno · ${d.hoy.cerrado ? 'cerrado' : 'en vivo'}` : 'Todavía no hay piezas'
  return (
    <Seccion titulo="Carrera" sub={sub} plano={plano} icono={<Flag className="h-3.5 w-3.5" />}>
      {c ? (
        <>
          <Cifras
            izq={{ nombre: a, valor: int(c.hoyPz), unidad: 'pz' }}
            der={c.fantasmaPz != null && b ? { nombre: `${b} a la misma hora`, valor: int(c.fantasmaPz), unidad: 'pz' } : null}
          />
          {c.diferencia != null ? (
            <div className="mt-3">
              <Pill tone={c.diferencia >= 0 ? 'ok' : 'warning'} className="tabular-nums">
                {c.diferencia === 0 ? 'Parejos' : `${a} ${c.diferencia > 0 ? 'va adelante' : 'va atrás'} por ${int(Math.abs(c.diferencia))} pz`}
              </Pill>
            </div>
          ) : (
            <Nota>{d.rival ? `Todavía no hay la curva del turno de ${b} para comparar a esta hora.` : 'Todavía no hay un turno rival del mismo horario para comparar.'}</Nota>
          )}
          <CarreraDueloV2
            hoy={{ etiqueta: `${a} hoy`, curva: c.hoy }}
            rival={c.fantasma && d.rival && b ? { etiqueta: `${b} ${fechaCorta(d.rival.dateKey)}`, curva: c.fantasma } : null}
            banda={c.banda}
            inicioMs={inicioMs}
            alto={plano ? 240 : undefined}
            ariaLabel={`Piezas acumuladas de ${a} contra el último turno de ${b ?? 'su rival'} en el mismo horario`}
          />
          <Nota>El fantasma es el último turno del rival en este mismo horario. La banda es el promedio y el rango de sus últimos turnos.</Nota>
        </>
      ) : (
        <Nota>La carrera aparece con la primera pieza del turno.</Nota>
      )}
    </Seccion>
  )
}

function BloqueDiaNoche({ d, nombres, inicioMs, plano }: { d: DatosDuelo; nombres: NombresEquipos; inicioMs: number | null; plano: boolean }) {
  const dn = d.diaNoche
  const c = d.carrera
  if (!dn || !c) {
    return (
      <Seccion titulo="Día contra noche" sub="Dato, sin puntos" plano={plano}>
        <Nota>Todavía no hay un turno cerrado del otro horario para comparar.</Nota>
      </Seccion>
    )
  }
  const hoyNom = nombreCorto(d.hoy.equipo, nombres)
  const rivNom = nombreCorto(dn.equipo, nombres)
  const lado = (noche: boolean) => (noche ? 'noche' : 'día')
  return (
    <Seccion titulo="Día contra noche" sub={`${lado(d.hoy.esNoche)} de hoy contra la ${lado(dn.esNoche)} del ${fechaCorta(dn.dateKey)} · sin puntos`} plano={plano}>
      <Cifras
        izq={{ nombre: `${hoyNom} · ${lado(d.hoy.esNoche)}`, valor: int(dn.hoyPz), unidad: 'pz' }}
        der={dn.rivalPz != null ? { nombre: `${rivNom} · ${lado(dn.esNoche)}`, valor: int(dn.rivalPz), unidad: 'pz' } : null}
      />
      {dn.diferencia != null && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Pill tone="neutral" className="tabular-nums">Hora {c.hora} del turno · {firmado(dn.diferencia)} pz</Pill>
          <span className="text-[13px] tabular-nums text-muted-foreground">el otro turno cerró con {int(dn.total)} pz</span>
        </div>
      )}
      <CarreraDueloV2
        hoy={{ etiqueta: `${lado(d.hoy.esNoche)} de hoy`, curva: c.hoy }}
        rival={{ etiqueta: `${lado(dn.esNoche)} ${fechaCorta(dn.dateKey)}`, curva: dn.curva }}
        inicioMs={inicioMs}
        alto={plano ? 200 : undefined}
        ariaLabel={`Piezas acumuladas del turno de ${lado(d.hoy.esNoche)} de hoy contra el último turno de ${lado(dn.esNoche)}`}
      />
      {dn.mismoEquipo && <Nota>Los dos turnos los hizo el mismo equipo: el cambio de semana cae entre ellos.</Nota>}
    </Seccion>
  )
}

function FilasKpi({ k, a, b }: { k: KpiMarcador; a: string; b: string }) {
  return (
    <ListCell
      title={k.rotulo}
      subtitle={k.filas.map((f) => `${f.rotulo}: ${a} ${valorKpi(f.a, f.unidad, f.decimales)} · ${b} ${valorKpi(f.b, f.unidad, f.decimales)}`).join('  |  ')}
      trailing={<Pill tone={tonoDe(k.ganador)}>{textoGanador(k.ganador, a, b)}</Pill>}
    />
  )
}

function BloqueMarcador({ d, nombres, plano }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean }) {
  const m: Marcador | null = d.marcador
  const a = nombreCorto(d.hoy.equipo, nombres)
  const b = d.rival ? nombreCorto(d.rival.equipo, nombres) : null
  if (!m || !d.rival || !b) {
    return (
      <Seccion titulo="Marcador del turno" sub="Contra el último turno del rival en este horario" plano={plano} icono={<Trophy className="h-3.5 w-3.5" />}>
        <Nota>Todavía no hay un turno del rival en el mismo horario con los datos del duelo.</Nota>
      </Seccion>
    )
  }
  const sub = `${a} contra ${b} del ${fechaCorta(d.rival.dateKey)}${d.hoy.cerrado ? '' : ' · provisorio'}`
  return (
    <Seccion titulo="Marcador del turno" sub={sub} plano={plano} icono={<Trophy className="h-3.5 w-3.5" />}>
      {m.sinDuelo ? (
        <>
          <div className="mt-3"><Pill tone="neutral">Sin duelo</Pill></div>
          <Nota>{m.motivo}. No suma ni quita puntos a nadie.</Nota>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-3 tabular-nums">
            <span className="v2-cifra-chica font-semibold leading-none text-foreground">{m.puntosA} – {m.puntosB}</span>
            <span className="text-[15px] text-muted-foreground">{a} contra {b}</span>
          </div>
          <div className="mt-2 text-[13px] text-muted-foreground">
            {m.ganador === 'pendiente' ? 'El turno sigue en curso: los puntos se confirman al cierre.' : m.ganador === 'empate' ? 'Turno empatado.' : `Gana el turno ${m.ganador === 'a' ? a : b}.`}
          </div>
          <div className="mt-3">
            <ListGroup>
              {m.kpis.map((k) => <FilasKpi key={k.id} k={k} a={a} b={b} />)}
            </ListGroup>
          </div>
          <Nota>Un punto por KPI y uno por puesto de alimentación. Las fallas técnicas no restan: sus piezas se suman al equipo.</Nota>
        </>
      )}
      {d.hoy.fallasN > 0 && <Nota>Las {d.hoy.fallasN} {d.hoy.fallasN === 1 ? 'falla técnica' : 'fallas técnicas'} de {a} ({horas(d.hoy.fallaMin)}) se descuentan del tiempo comparable.</Nota>}
    </Seccion>
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
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, (c.puntos[e] / max) * 100)}%`, background: e === hoy ? 'var(--v2-acento)' : 'var(--v2-secundaria)' }} />
            </div>
            <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">{c.ganados[e]} de {c.jugados[e]} {c.jugados[e] === 1 ? 'turno ganado' : 'turnos ganados'}</div>
          </li>
        ))}
      </ul>
    </li>
  )
}

function BloqueCiclo({ d, nombres, plano }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean }) {
  const hay = (c: CicloDuelo) => c.jugados.rebolledo + c.jugados.cardenas > 0
  return (
    <Seccion titulo="Marcador del ciclo" sub="Dos semanas: cada equipo hace día y noche" plano={plano} icono={<Trophy className="h-3.5 w-3.5" />}>
      {hay(d.ciclo) || hay(d.cicloPrevio) ? (
        <ul className="mt-4 space-y-5">
          <FilaCiclo c={d.ciclo} nombres={nombres} hoy={d.hoy.equipo} />
          {hay(d.cicloPrevio) && <FilaCiclo c={d.cicloPrevio} nombres={nombres} hoy={d.hoy.equipo} />}
        </ul>
      ) : (
        <Nota>Todavía no hay turnos cerrados con duelo en este ciclo.</Nota>
      )}
      <Nota>Los puntos de cada turno cerrado van al equipo que lo hizo. El turno de hoy se suma cuando cierra.</Nota>
    </Seccion>
  )
}

function BloqueRecords({ d, nombres, plano }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean }) {
  const rachaTxt = (n: number) => `${n} ${n === 1 ? 'turno' : 'turnos'}`
  return (
    <Seccion titulo="Récords y rachas" sub="De los últimos turnos publicados de la línea" plano={plano}>
      {d.records.length > 0 ? (
        <div className="mt-3">
          <ListGroup title="Récords">
            {d.records.map((r) => (
              <ListCell
                key={r.id}
                title={r.rotulo}
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

function BloqueCosto({ d, nombres, plano }: { d: DatosDuelo; nombres: NombresEquipos; plano: boolean }) {
  return (
    <Seccion titulo="Costo de Mantención" sub="Lo que las fallas técnicas le quitaron a cada equipo en este ciclo" plano={plano} icono={<Wrench className="h-3.5 w-3.5" />}>
      <div className="mt-3">
        <ListGroup>
          {EQUIPOS.map((e) => {
            const c = d.costo[e]
            return (
              <ListCell
                key={e}
                title={nombreCorto(e, nombres)}
                subtitle={c.turnos === 0
                  ? 'sin turnos en el ciclo'
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

function BloqueAlimentacion({ d, nombres, unidad, plano }: { d: DatosDuelo; nombres: NombresEquipos; unidad: 'carros' | 'silletas' | null; plano: boolean }) {
  const m = d.marcador
  const a = nombreCorto(d.hoy.equipo, nombres)
  const b = d.rival ? nombreCorto(d.rival.equipo, nombres) : null
  const cosa = unidad ?? 'posiciones'
  return (
    <Seccion titulo="Alimentación por puesto" sub={`${cosa} con pieza sobre el tiempo andando`} plano={plano}>
      {m && !m.sinDuelo && m.puestos.length > 0 && b ? (
        <ul className="mt-4 space-y-4">
          {m.puestos.map((p) => (
            <li key={p.clave} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="min-w-0 truncate text-foreground">{p.etiqueta}</span>
                <Pill tone={tonoDe(p.ganador)}>{textoGanador(p.ganador, a, b)}</Pill>
              </div>
              {([[a, p.a, 'var(--v2-acento)'], [b, p.b, 'var(--v2-secundaria)']] as const).map(([nom, v, color]) => (
                <div key={nom} className="mt-1.5 flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-[13px] text-muted-foreground">{nom}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted-foreground/[0.12]">
                    {v != null && <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, v))}%`, background: color }} />}
                  </div>
                  <span className="w-12 shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">{v != null ? `${int(v)} %` : 'sin dato'}</span>
                </div>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <Nota>{m?.sinDuelo ? 'Este turno quedó sin duelo.' : 'Todavía no hay un turno rival con el llenado por puesto.'}</Nota>
      )}
      <Nota>Piezas del puesto ÷ (esperado de Shoplogix × minutos andando). Un punto por puesto ganado; los puestos se comparan sin nombres de operadores.</Nota>
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
      <BloqueDiaNoche d={datos} nombres={nombres} inicioMs={inicioMs} plano />
      <BloqueMarcador d={datos} nombres={nombres} plano />
      <BloqueCiclo d={datos} nombres={nombres} plano />
      <BloqueRecords d={datos} nombres={nombres} plano />
      <BloqueCosto d={datos} nombres={nombres} plano />
      <BloqueAlimentacion d={datos} nombres={nombres} unidad={unidad} plano />
    </div>
  )
}

/** Quién hizo este turno, el aviso de corrección y el estado de los datos. */
function AvisoDuelo({ d, nombres }: { d: DatosDuelo; nombres: NombresEquipos }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone="info">Turno de {nombreCorto(d.hoy.equipo, nombres)}</Pill>
      {d.corregido && <Pill tone="warning">Equipo corregido a mano</Pill>}
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
      <Tarjeta icono={<Trophy className="h-3.5 w-3.5" />} titulo="Duelo" sub="día contra noche" className={className}>
        <p className="mt-3 text-[13px] text-muted-foreground">Aparece cuando el turno trae su hora de inicio planificada.</p>
      </Tarjeta>
    )
  }
  const c = datos.carrera
  const a = nombreCorto(datos.hoy.equipo, nombres)
  const b = datos.rival ? nombreCorto(datos.rival.equipo, nombres) : null
  const m = datos.marcador
  const sub = c ? `Hora ${c.hora} del turno${b ? ` · ${a} contra ${b}` : ''}` : 'el turno todavía no parte'
  return (
    <Tarjeta
      icono={<Trophy className="h-3.5 w-3.5" />}
      titulo="Duelo"
      sub={sub}
      className={className}
      ampliado={<CuerpoDuelo datos={datos} nombres={nombres} unidad={unidad} inicioMs={inicioMs} />}
      subAmpliado="carrera, marcador, ciclo, récords, costo de Mantención y alimentación"
    >
      {c && c.fantasmaPz != null && b ? (
        <>
          <Cifras
            izq={{ nombre: a, valor: int(c.hoyPz), unidad: 'pz' }}
            der={{ nombre: b, valor: int(c.fantasmaPz), unidad: 'pz' }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Pill tone={(c.diferencia ?? 0) >= 0 ? 'ok' : 'warning'} className="tabular-nums">
              {c.diferencia === 0 ? 'Parejos' : `${firmado(c.diferencia ?? 0)} pz`}
            </Pill>
            {m && !m.sinDuelo && <span className="text-[13px] tabular-nums text-muted-foreground">marcador {m.puntosA} – {m.puntosB}{datos.hoy.cerrado ? '' : ' provisorio'}</span>}
            {m?.sinDuelo && <span className="text-[13px] text-muted-foreground">sin duelo en este turno</span>}
          </div>
          <CarreraDueloV2
            mini
            hoy={{ etiqueta: a, curva: c.hoy }}
            rival={c.fantasma ? { etiqueta: b, curva: c.fantasma } : null}
            ariaLabel={`Piezas acumuladas de ${a} contra ${b} a la misma hora del turno`}
          />
        </>
      ) : c ? (
        <>
          <Cifras izq={{ nombre: a, valor: int(c.hoyPz), unidad: 'pz' }} der={null} />
          <p className="mt-3 text-[13px] leading-snug text-muted-foreground">
            {datos.diaNoche?.rivalPz != null
              ? `El último turno del otro horario llevaba ${int(datos.diaNoche.rivalPz)} pz a esta hora.`
              : 'Todavía no hay un turno rival del mismo horario con curva para comparar.'}
          </p>
        </>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">La carrera parte con la primera pieza del turno.</p>
      )}
    </Tarjeta>
  )
}

// ── Pestaña «Duelo» ──────────────────────────────────────────────────────────

/** Edición de nombres y del equipo de este turno: solo con sesión de supervisor o admin. */
function EditorDuelo({ token, d, nombres, nombresGuardados }: { token: string; d: DatosDuelo; nombres: NombresEquipos; nombresGuardados: NombresEquipos }) {
  const [borrador, setBorrador] = useState<NombresEquipos>({ rebolledo: nombresGuardados.rebolledo ?? '', cardenas: nombresGuardados.cardenas ?? '' })
  const [estado, setEstado] = useState<'quieto' | 'guardando' | 'guardado' | 'error'>('quieto')
  const sinCambios = EQUIPOS.every((e) => (borrador[e] ?? '').trim() === (nombresGuardados[e] ?? '').trim())
  const campo = 'tap-44 w-full rounded-ctl bg-muted-foreground/[0.12] px-3 py-2 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
  const guardar = async () => {
    setEstado('guardando')
    try { await guardarNombresDuelo(token, borrador); setEstado('guardado') } catch { setEstado('error') }
  }
  const [errorEquipo, setErrorEquipo] = useState(false)
  const elegir = async (v: 'auto' | EquipoId) => {
    setErrorEquipo(false)
    try { await fijarEquipoDelTurno(token, d.hoy.shiftDocId, v === 'auto' ? null : v) } catch { setErrorEquipo(true) }
  }
  return (
    <Tarjeta titulo="Equipos del duelo" sub="solo con sesión de supervisor">
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
        <p className="mt-0.5 text-[13px] text-muted-foreground">Corrige la rotación si un feriado o un cambio de turno la rompió.</p>
        <SegmentedControl
          className="mt-3"
          ariaLabel="Equipo que hizo este turno"
          value={d.corregido ? d.hoy.equipo : 'auto'}
          onChange={(v) => { void elegir(v) }}
          segments={[
            { value: 'auto', label: 'Automático' },
            { value: 'rebolledo', label: nombreCorto('rebolledo', nombres) },
            { value: 'cardenas', label: nombreCorto('cardenas', nombres) },
          ]}
        />
        {errorEquipo && <p className="mt-2 text-[13px] text-ink-crit">No se pudo guardar la corrección.</p>}
      </div>
    </Tarjeta>
  )
}

export function PestanaDueloV2({ datos, nombres, unidad, inicioMs, token, puedeEditar, nombresGuardados }: DueloUiProps & {
  token: string | undefined
  puedeEditar: boolean
  nombresGuardados: NombresEquipos
}) {
  if (!datos) {
    return (
      <Tarjeta icono={<Trophy className="h-3.5 w-3.5" />} titulo="Duelo de equipos" sub="día contra noche">
        <p className="mt-3 text-[15px] text-muted-foreground">El duelo aparece cuando el turno trae su hora de inicio planificada.</p>
      </Tarjeta>
    )
  }
  return (
    <div className="monitor-v2 flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
        <AvisoDuelo d={datos} nombres={nombres} />
        <BloqueCarrera d={datos} nombres={nombres} inicioMs={inicioMs} plano={false} />
        <BloqueDiaNoche d={datos} nombres={nombres} inicioMs={inicioMs} plano={false} />
        <BloqueMarcador d={datos} nombres={nombres} plano={false} />
        <BloqueAlimentacion d={datos} nombres={nombres} unidad={unidad} plano={false} />
      </div>
      <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
        <BloqueCiclo d={datos} nombres={nombres} plano={false} />
        <BloqueRecords d={datos} nombres={nombres} plano={false} />
        <BloqueCosto d={datos} nombres={nombres} plano={false} />
        {puedeEditar && token && <EditorDuelo token={token} d={datos} nombres={nombres} nombresGuardados={nombresGuardados} />}
      </div>
    </div>
  )
}
