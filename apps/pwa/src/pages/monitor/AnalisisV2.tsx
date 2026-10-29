/**
 * Pestaña «Análisis» del monitor v2 glass (mockup v7 aprobado el 28-10-2026, spec en `docs/SPEC_ANALISIS_PR.md`).
 *
 * Dos bloques: «Este turno» (T1 hora por hora · T2 detenciones de hoy) y «Lo que se repite» (T3 qué se repite ·
 * T4 peso de Mantención · T5 de quién fue lo perdido). Cada tarjeta responde UNA pregunta: pregunta · cifra y estado ·
 * referencia y desvío · respuesta en una frase · gráfico · «Ver detalle». Filas y barras abren el mismo detalle
 * (`PanelDetalle`: panel en PC, hoja en celular), que abre con la misma pregunta + respuesta y la evidencia numerada.
 *
 * Tarjeta plana (borde 1 px, radio 10, sin blur): el vidrio queda solo en el fondo y la cabecera. Color solo con
 * significado: normal gris · anormal coral · Mantención ámbar · Externo gris azulado · sin imputar rayado.
 *
 * Cada rótulo y cada cifra de respuesta llevan un globo (`Dato`) que dice qué mide y cómo se calcula, con el valor
 * concreto: hover/foco en PC, toque en celular. El monitor es de solo lectura: acá se MUESTRA lo sin imputar, no se imputa.
 *
 * Solo datos que existen: las fallas de equipos traen hora (`eventos`); las detenciones sin imputar no, y no se inventan.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'
import type { HourlyRow } from '@/services/shoplogix/monitorHourly'
import { Globo } from './AmpliarV2'
import { DetalleSemanaV2 } from './DetalleSemanaV2'
import { PanelDetalle, dec, firmado, hhmm, horas, int, semanaCorta, type MonitorV2AnalisisProps } from './MonitorV2'
import { DUENO_UI } from './duenoUi'
import { detencionesPorHora, metaAEstaHora, paretoAcumulado, type CausaHoy, type DetencionesHora, type EventoHoy, type MantHoy, type PerdidaHoy } from './analisisV2Datos'
import { lunesDe, type SemanaReparto } from './repartoSemanal'
import type { FallaRepetidaMonitor } from '@/services/shoplogix/publicShiftMonitor.service'
import './analisisV2.css'

export interface AnalisisV2Props extends MonitorV2AnalisisProps {
  /** Minutos de LÍNEA perdidos hoy por dueño (los mismos de «Tiempo perdido» de El turno). */
  perdidas: PerdidaHoy[]
  /** Causas de hoy con dueño, de mayor a menor. */
  causas: CausaHoy[]
  /** Fallas de equipos de hoy, con hora de inicio y fin. */
  eventos: EventoHoy[]
  /** Respuesta de Mantención: minutos por falla hoy contra los turnos previos. null si Shoplogix no la publicó. */
  mant: MantHoy | null
  /** Turno cerrado: la última hora ya no «está en curso». */
  cerrado: boolean
  /** Micro detención (min de máquina) por hora de producción, si el backend la publicó. */
  microPorHora?: number[] | null
  /** Reincidencia de las fallas de equipos (cron diario); null/ausente sin la tarjeta. */
  fallaRepetida?: FallaRepetidaMonitor | null
}

/** Meta de reincidencia propuesta en el plan (28-10-2026): menos de 3 de cada 10 fallas vuelven. */
const META_REINCIDENCIA = 0.3
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «ago» (o «ago 2025» si el año no es el de referencia): «oct 26» se leía como el 26 de octubre. */
const nombreMes = (ym: string, anio?: string, largo = false) => {
  const m = MESES[Number(ym.slice(5, 7)) - 1] ?? ym.slice(5, 7)
  const txt = largo ? m : m.slice(0, 3)
  return anio && ym.slice(0, 4) !== anio ? `${txt} ${ym.slice(0, 4)}` : txt
}
const pct0 = (x: number) => `${Math.round(x * 100)} %`
/** Contra la meta con el % REDONDEADO que se muestra: 30,3 % se lee «30» y no puede decir «sobre». */
const tonoMeta = (tasa: number): 'ok' | 'neutro' | 'mal' => {
  const r = Math.round(tasa * 100), meta = Math.round(META_REINCIDENCIA * 100)
  return r < meta ? 'ok' : r === meta ? 'neutro' : 'mal'
}

type Clave = 'hora' | 'det' | 'rep' | 'peso' | 'quien' | 'falla'
type Marca = 'mant' | 'ext' | 'si' | 'mal' | 'prog'

const marcaDe = (d: DuenoPerdida): Marca => (d === 'mantencion' ? 'mant' : d === 'externo' ? 'ext' : d === 'sin-imputar' ? 'si' : 'prog')
const ordinal = (n: number) => `${n}.ª`
const mmTxt = (min: number) => `${int(min)} min`
/** «1 h 17» + unidad «min» para la cifra grande; menos de una hora, solo los minutos. */
function kpiMin(min: number): { valor: string; unidad: string } {
  const r = Math.round(min)
  return r >= 60 ? { valor: `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`, unidad: 'min' } : { valor: String(r), unidad: 'min' }
}
const adelanteAtras = (dif: number) => (dif === 0 ? 'justo en la meta' : `${int(Math.abs(dif))} ${dif > 0 ? 'adelante' : 'atrás'}`)

// ── Globo que explica un dato ────────────────────────────────────────────────

/**
 * Rótulo subrayado con puntos que explica un dato: hover y foco en PC, toque en celular (cierra al tocar fuera o con
 * Escape). El globo sale a `body` y se acota a la pantalla, así que no lo recorta ninguna tarjeta ni lo tapa el panel.
 */
function Dato({ texto, children }: { texto: ReactNode; children: ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const tipo = useRef('mouse')
  const id = useId()

  useLayoutEffect(() => {
    if (!abierto) { setPos(null); return }
    const b = btn.current?.getBoundingClientRect()
    const t = tip.current
    if (!b || !t) return
    const w = t.offsetWidth
    const h = t.offsetHeight
    const left = Math.min(window.innerWidth - 8 - w, Math.max(8, b.left + b.width / 2 - w / 2))
    const arriba = b.top - h - 8
    setPos({ left, top: arriba >= 8 ? arriba : b.bottom + 8 })
  }, [abierto])

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!btn.current?.contains(e.target as Node)) setAbierto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    const cerrar = () => setAbierto(false)
    document.addEventListener('pointerdown', fuera)
    window.addEventListener('keydown', esc)
    window.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('pointerdown', fuera)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [abierto])

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="an-dato"
        aria-describedby={abierto ? id : undefined}
        aria-expanded={abierto}
        onPointerDown={(e) => { tipo.current = e.pointerType }}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setAbierto(true) }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setAbierto(false) }}
        onFocus={(e) => {
          let teclado = false
          try { teclado = e.currentTarget.matches(':focus-visible') } catch { teclado = true }
          if (teclado) setAbierto(true)
        }}
        onBlur={() => setAbierto(false)}
        onClick={(e) => {
          e.stopPropagation()
          /* Mouse: ya abre con el hover. Toque y teclado (detail 0): alterna. */
          if (e.detail === 0 || tipo.current !== 'mouse') setAbierto((a) => !a)
        }}
      >
        {children}
      </button>
      {abierto && createPortal(
        <div ref={tip} id={id} role="tooltip" className="v2-tip an-tip" style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}>
          {texto}
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Piezas de tarjeta ────────────────────────────────────────────────────────

const MarcaDueno = ({ m }: { m: Marca }) => <i className={`an-o an-o-${m}`} aria-hidden />

function Estado({ tono, children }: { tono: 'mal' | 'ok' | 'neutro'; children: ReactNode }) {
  return <span className={`an-st an-st-${tono}`}><i aria-hidden />{children}</span>
}

function Cabeza({ pregunta, kpi, unidad, estado, refer, resp }: { pregunta: string; kpi: ReactNode; unidad?: ReactNode; estado?: ReactNode; refer?: ReactNode; resp?: ReactNode }) {
  return (
    <header className="an-k">
      <h3 className="an-q">{pregunta}</h3>
      <div className="an-k-row">
        <span className="an-v">{kpi}{unidad != null && <small>{unidad}</small>}</span>
        {estado}
      </div>
      {refer != null && <div className="an-ref">{refer}</div>}
      {resp != null && <div className="an-resp">{resp}</div>}
    </header>
  )
}

function Ver({ texto, onClick, etiqueta }: { texto: string; onClick: () => void; etiqueta: string }) {
  return (
    <button type="button" className="an-ver" onClick={onClick} aria-label={`Ver detalle: ${etiqueta}`}>
      <span>Ver detalle <span className="an-ver-s">· {texto}</span></span>
      <span aria-hidden>→</span>
    </button>
  )
}

function Leyenda() {
  return (
    <div className="an-ley" role="list" aria-label="Colores por dueño">
      <span role="listitem"><MarcaDueno m="mant" />Mantención · equipos</span>
      <span role="listitem"><MarcaDueno m="ext" />Externo</span>
      <span role="listitem"><MarcaDueno m="si" />Sin imputar</span>
      <span role="listitem"><MarcaDueno m="mal" />Fuera de lo normal</span>
    </div>
  )
}

function Bloque({ titulo, sub, children }: { titulo: string; sub: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="region" aria-labelledby={id} className="an-bloque">
      <div className="an-bh">
        <div><h2 id={id}>{titulo}</h2><p>{sub}</p></div>
        <Leyenda />
      </div>
      {children}
    </div>
  )
}

/** Escala «bonita» para minutos: ticks cada 5/10/15/30/60/120 con 3–6 divisiones. */
function escalaMin(max: number): { top: number; paso: number } {
  const objetivo = Math.max(1, max) * 1.05
  const paso = [5, 10, 15, 30, 60, 120, 240].find((p) => objetivo / p <= 4) ?? 240
  return { top: Math.ceil(objetivo / paso) * paso, paso }
}
function Escala({ top, paso, unidad }: { top: number; paso: number; unidad: string }) {
  const marcas: number[] = []
  for (let v = 0; v <= top; v += paso) marcas.push(v)
  return (
    <div className="an-sc" aria-hidden>
      {marcas.map((v) => <span key={v} style={{ left: `${(v / top) * 100}%` }}>{v}{v === top ? ` ${unidad}` : ''}</span>)}
    </div>
  )
}

// ── Detalle: pregunta + respuesta, y la evidencia numerada ───────────────────

function Resp({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="an-d-resp">
      <div className="an-d-resp-t">{children}</div>
      {nota && <div className="an-d-nota">{nota}</div>}
    </div>
  )
}
function Sec({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <div className="an-d-sec">
      <h4><span className="an-d-n">{n}</span>{titulo}</h4>
      {children}
    </div>
  )
}
type TipoBarra = Marca | 'neutro' | 'ninguno'
function Ev({ label, sub, valor, frac, tipo, tono }: { label: ReactNode; sub?: ReactNode; valor: ReactNode; frac?: number | null; tipo?: TipoBarra; tono?: 'mal' | 'bien' }) {
  return (
    <div className="an-ev">
      <div className="an-ev-t">
        <div className="an-ev-l"><span>{label}</span>{sub && <small>{sub}</small>}</div>
        <b className={tono ? `an-${tono}` : undefined}>{valor}</b>
      </div>
      {frac != null && tipo && tipo !== 'ninguno' && (
        <div className="an-bt"><i className={`an-s an-s-${tipo}`} style={{ width: `${Math.max(1.5, Math.min(100, frac * 100))}%` }} /></div>
      )}
    </div>
  )
}
const Nota = ({ children }: { children: ReactNode }) => <p className="an-d-nota">{children}</p>

// ── Componente ───────────────────────────────────────────────────────────────

export function AnalisisV2(p: AnalisisV2Props) {
  const [abierta, setAbierta] = useState<Clave | null>(null)
  const [activa, setActiva] = useState<number | null>(null)
  const abrir = (k: Clave) => () => setAbierta(k)
  const { pareto, semanas, horas: filasHora, metaPorHora, perdidas, causas, eventos, mant, cerrado } = p

  // ── T1 · Hora por hora ─────────────────────────────────────────────────────
  const dets = useMemo(() => detencionesPorHora(eventos, filasHora), [eventos, filasHora])
  const cols = useMemo(() => filasHora.map((h: HourlyRow, i) => {
    const curso = h.partial && !cerrado
    const metaH = metaPorHora == null ? null : h.partial ? metaAEstaHora(metaPorHora, h.minutesCovered) : metaPorHora
    const dif = metaH == null ? null : h.pieces - metaH
    return { h, i, curso, metaH, dif, bajo: !curso && dif != null && dif < 0, det: dets[i] as DetencionesHora }
  }), [filasHora, metaPorHora, cerrado, dets])
  const completas = cols.filter((c) => !c.h.partial)
  const bajoMeta = completas.filter((c) => c.bajo)
  const sobreMeta = completas.length - bajoMeta.length
  const peorHora = bajoMeta.reduce<(typeof cols)[number] | null>((a, c) => (!a || (c.dif ?? 0) < (a.dif ?? 0) ? c : a), null)
  const enCurso = cols.find((c) => c.curso) ?? null
  const totalHechas = filasHora.reduce((a, h) => a + h.pieces, 0)

  // ── T2 · Detenciones de hoy ────────────────────────────────────────────────
  const totalPerdido = perdidas.reduce((a, x) => a + x.min, 0)
  const minDe = (d: DuenoPerdida) => perdidas.find((x) => x.dueno === d)?.min ?? 0
  const mantHoy = minDe('mantencion')
  const turnoNormal = pareto && pareto.shifts > 0 ? pareto.totalMin / pareto.shifts : null
  const veces = turnoNormal && turnoNormal > 0 ? totalPerdido / turnoNormal : null
  const leido = filasHora.length ? hhmm(filasHora[filasHora.length - 1]!.to) : null
  const top4 = causas.slice(0, 4)
  const maxCausa = Math.max(1, ...top4.map((c) => c.min))
  const escDet = escalaMin(Math.max(totalPerdido, turnoNormal ?? 0))
  const pctDe = (n: number, t: number) => (t > 0 ? Math.round((n / t) * 100) : 0)

  // ── T3 · Qué se repite ─────────────────────────────────────────────────────
  const filasPareto = useMemo(() => (pareto?.rows ?? []).slice().sort((a, b) => b.minutes - a.minutes), [pareto])
  const acumulado = useMemo(() => paretoAcumulado(filasPareto), [filasPareto])
  const top6 = filasPareto.slice(0, 6)
  const maxMin6 = Math.max(1, ...top6.map((r) => r.minutes))
  const nTurnos = pareto?.shifts ?? 0
  const sumaFilas = filasPareto.reduce((a, r) => a + r.minutes, 0)
  const siempre = (k: number) => nTurnos > 0 && k >= Math.ceil(nTurnos * 0.8)
  const masTiempo = filasPareto[0] ?? null
  const masVuelve = filasPareto.reduce<(typeof filasPareto)[number] | null>((a, r) => (!a || r.shifts > a.shifts || (r.shifts === a.shifts && r.minutes > a.minutes) ? r : a), null)
  const mantPareto = pareto?.porDueno.mantencion ?? 0
  const porTurno = (r: { minutes: number; shifts: number }) => (r.shifts > 0 ? r.minutes / r.shifts : 0)

  // ── T4 · Peso de Mantención ────────────────────────────────────────────────
  const semAct = semanas[semanas.length - 1]
  const semAnt = semanas[semanas.length - 2]
  const esSemanaActual = semAct ? (p.hoy ? semAct.semana === lunesDe(p.hoy) : true) : false
  const totSem = (s?: SemanaReparto) => (s ? s.min.mantencion + s.min.externo + s.min['sin-imputar'] : 0)
  const pctSem = (s?: SemanaReparto) => (s && totSem(s) > 0 ? (s.min.mantencion / totSem(s)) * 100 : null)
  const pAct = pctSem(semAct)
  const pAnt = pctSem(semAnt)
  const pTurnos = pareto && pareto.totalMin > 0 ? (mantPareto / pareto.totalMin) * 100 : null
  const maxPeso = Math.max(10, Math.ceil(Math.max(pAct ?? 0, pAnt ?? 0, pTurnos ?? 0) / 5) * 5)

  // ── T5 · De quién fue ──────────────────────────────────────────────────────
  const shareSi = (s: SemanaReparto) => (totSem(s) > 0 ? (s.min['sin-imputar'] / totSem(s)) * 100 : 0)
  const previasT5 = semanas.slice(0, -1).filter((s) => totSem(s) > 0)
  const shareAct = semAct ? shareSi(semAct) : null
  const maxPrevio = previasT5.length ? Math.max(...previasT5.map(shareSi)) : null
  const minPrevio = previasT5.length ? Math.min(...previasT5.map(shareSi)) : null
  const maxSemana = Math.max(1, ...semanas.map(totSem))

  // ── T6 · ¿Las reparaciones aguantan? ───────────────────────────────────────
  const fr = p.fallaRepetida ?? null
  const mesesFr = (fr?.meses ?? []).slice(-8)
  const mesesSolidos = mesesFr.filter((m) => !m.pocosDatos)
  const mesFr = mesesSolidos[mesesSolidos.length - 1] ?? null
  const mesFrAnt = mesesSolidos[mesesSolidos.length - 2] ?? null
  const anioFr = (mesesFr[mesesFr.length - 1]?.mes ?? '').slice(0, 4)
  const causasFr = (fr?.causas ?? []).filter((c) => c.episodios >= 10).slice().sort((a, b) => b.tasa - a.tasa)
  const peorCausaFr = causasFr[0] ?? null
  const azarFr = (() => {
    const cs = fr?.causas ?? []
    const n = cs.reduce((a, c) => a + c.episodios, 0)
    return n > 0 ? cs.reduce((a, c) => a + c.azar * c.episodios, 0) / n : null
  })()

  const nomSemana = (s: SemanaReparto) => (s === semAct && esSemanaActual ? 'Esta semana' : `Sem. ${semanaCorta(s.semana)}`)

  // ── Textos con valor concreto (sirven a la tarjeta y a su detalle) ─────────
  const textoAcum = (<>El % de cada fila es lo que suman esa causa y las de arriba sobre las {horasTxt(sumaFilas)} perdidas en los últimos {nTurnos} turnos. Sirve para ver cuántas causas explican casi todo: atacar las primeras rinde más.{filasPareto[1] ? <> Ejemplo: «{filasPareto[1].label}» y la de arriba suman el {Math.round(acumulado[1] ?? 0)} %.</> : null}</>)
  const respHora = peorHora
    ? <>La {ordinal(peorHora.h.index)} hora quedó <Dato texto={<>«Atrás» es hechas menos la meta de esa hora: {int(peorHora.h.pieces)} − {int(peorHora.metaH ?? 0)} = {int(peorHora.dif ?? 0)}. «Adelante» es lo contrario: hechas por encima de la meta.</>}>{int(Math.abs(peorHora.dif ?? 0))} atrás</Dato>.</>
    : completas.length > 0 && metaPorHora != null ? 'Ninguna hora completa quedó bajo la meta.' : null

  const detalle = ((): { titulo: string; sub?: string; cuerpo: ReactNode } | null => {
    switch (abierta) {
      case 'hora': {
        const fraseHora = metaPorHora == null
          ? `${int(totalHechas)} piezas hechas en ${filasHora.length} ${filasHora.length === 1 ? 'hora' : 'horas'}. El turno no tiene meta cargada: no hay contra qué comparar cada hora.`
          : `${sobreMeta} de ${completas.length} horas completas sobre la meta.${peorHora ? ` La que más costó fue la ${ordinal(peorHora.h.index)} (${hhmm(peorHora.h.from)}): ${int(peorHora.h.pieces)} hechas, ${adelanteAtras(peorHora.dif ?? 0)}.` : ''}`
        const prom = completas.length ? completas.reduce((a, c) => a + c.h.pieces, 0) / completas.length : null
        return {
          titulo: '¿Cómo vamos hora a hora contra la meta?',
          sub: metaPorHora != null ? `Meta ${int(metaPorHora)} por hora${enCurso ? ` · ${ordinal(enCurso.h.index)} hora en curso (${enCurso.h.minutesCovered} min)` : ''}` : 'Sin meta cargada',
          cuerpo: (
            <div className="an-d">
              <Resp>{fraseHora}</Resp>
              {peorHora && (
                <Sec n={1} titulo="La hora que más costó">
                  <Ev label={`${ordinal(peorHora.h.index)} hora · ${hhmm(peorHora.h.from)}–${hhmm(peorHora.h.to)}`} sub="hechas contra la meta de la hora" valor={`${int(peorHora.h.pieces)} de ${int(peorHora.metaH ?? 0)}`} frac={peorHora.metaH ? peorHora.h.pieces / peorHora.metaH : null} tipo="mal" tono="mal" />
                  <Ev
                    label="Fallas de equipos en esa hora"
                    sub={peorHora.det.fallas > 0 ? [...new Set(peorHora.det.items.map((i) => i.causa ?? 'Falla técnica'))].join(' · ') : 'ninguna registrada en esa hora'}
                    valor={peorHora.det.fallas > 0 ? `${peorHora.det.fallas} · ${mmTxt(peorHora.det.min)} de máquina` : '—'}
                    frac={peorHora.det.fallas > 0 ? Math.min(1, peorHora.det.min / 60) : null}
                    tipo="mant"
                  />
                  <Nota>Las detenciones sin imputar no traen la hora en que ocurrieron, por eso acá solo aparecen las fallas de equipos.</Nota>
                </Sec>
              )}
              <Sec n={peorHora ? 2 : 1} titulo="Cada hora contra la meta">
                <div className="an-tb" role="table" aria-label="Cada hora contra la meta">
                  <div className="an-tb-r an-tb-h" role="row">
                    <span role="columnheader">hora</span><span role="columnheader" className="r">hechas</span><span role="columnheader" className="r">contra la meta</span><span role="columnheader">detenciones de la hora</span>
                  </div>
                  {cols.map((c) => {
                    const micro = p.microPorHora?.[c.i]
                    const partes = [
                      c.det.fallas > 0 ? `${c.det.fallas} ${c.det.fallas === 1 ? 'falla' : 'fallas'} de equipos · ${mmTxt(c.det.min)} de máquina` : null,
                      micro != null && micro > 0 ? `micro detenciones ${mmTxt(micro)} de máquina` : null,
                    ].filter(Boolean)
                    return (
                      <div key={c.h.hourStart} className="an-tb-r" role="row">
                        <span role="cell"><b>{ordinal(c.h.index)} hora</b> {hhmm(c.h.from)}{c.curso ? ' · en curso' : c.h.partial ? ` · ${c.h.minutesCovered} min` : ''}</span>
                        <span role="cell" className="r">{int(c.h.pieces)}</span>
                        <span role="cell" className={`r ${c.dif == null ? '' : c.bajo ? 'an-mal' : 'an-bien'}`}>{c.dif == null ? '—' : adelanteAtras(c.dif)}</span>
                        <span role="cell" className="an-sub">{partes.length ? partes.join(' · ') : '—'}</span>
                      </div>
                    )
                  })}
                </div>
              </Sec>
              {metaPorHora != null && prom != null && (
                <Sec n={peorHora ? 3 : 2} titulo="El ritmo de fondo">
                  <Ev label={`Promedio de las ${completas.length} horas completas`} sub={`meta ${int(metaPorHora)} por hora`} valor={`${int(prom)} · ${adelanteAtras(prom - metaPorHora)}`} frac={prom / Math.max(prom, metaPorHora)} tipo="neutro" />
                  {enCurso && enCurso.metaH != null && (
                    <Ev label={`${ordinal(enCurso.h.index)} hora, en curso`} sub={`meta a esta hora: ${int(enCurso.metaH)}`} valor={`${int(enCurso.h.pieces)} · ${adelanteAtras(enCurso.dif ?? 0)}`} frac={enCurso.h.pieces / Math.max(enCurso.h.pieces, enCurso.metaH)} tipo="neutro" tono={(enCurso.dif ?? 0) >= 0 ? 'bien' : 'mal'} />
                  )}
                </Sec>
              )}
            </div>
          ),
        }
      }
      case 'det': {
        const kp = kpiMin(totalPerdido)
        return {
          titulo: '¿Cuánto se detuvo la línea hoy y de quién fue?',
          sub: `${leido ? `Leído ${leido} · ` : ''}minutos de línea`,
          cuerpo: (
            <div className="an-d">
              <Resp>
                {totalPerdido <= 0
                  ? 'Hoy no hay minutos de línea detenida.'
                  : <><b className={veces != null && veces > 1 ? 'an-mal' : undefined}>{kp.valor} {kp.unidad}</b>{veces != null ? `, ${dec(veces)} ${veces === 1 ? 'vez' : 'veces'} un turno normal` : ''}. De Mantención fueron <b>{horas(mantHoy)} ({pctDe(mantHoy, totalPerdido)} %)</b>{minDe('sin-imputar') > 0 ? `; sin imputar, ${horas(minDe('sin-imputar'))}` : ''}.</>}
              </Resp>
              <Sec n={1} titulo="De quién fue">
                {(['sin-imputar', 'mantencion', 'externo'] as const).map((d) => (
                  <Ev key={d} label={DUENO_UI[d].corto} sub={d === 'sin-imputar' ? 'nadie lo anotó todavía' : d === 'mantencion' ? `${mant?.fallas ?? 0} ${(mant?.fallas ?? 0) === 1 ? 'falla' : 'fallas'} de equipos` : undefined} valor={`${horas(minDe(d))} · ${pctDe(minDe(d), totalPerdido)} %`} frac={totalPerdido > 0 ? minDe(d) / totalPerdido : 0} tipo={marcaDe(d)} />
                ))}
              </Sec>
              <Sec n={2} titulo="Qué la detuvo">
                {causas.length === 0 && <Nota>Sin causas registradas hoy.</Nota>}
                {causas.slice(0, 8).map((c) => (
                  <Ev key={c.causa} label={c.causa} sub={`${DUENO_UI[c.dueno].corto} · ${c.veces} ${c.veces === 1 ? 'vez' : 'veces'}`} valor={horas(c.min)} frac={c.min / Math.max(1, causas[0]?.min ?? 1)} tipo={marcaDe(c.dueno)} />
                ))}
                {causas.length > 8 && <Nota>Y {causas.length - 8} causas más, de menor tiempo.</Nota>}
              </Sec>
              <Sec n={3} titulo="Lo de Mantención: cuánto tardó en responder">
                {mant && mant.mttr != null ? (
                  <>
                    <Ev label={`Hoy · ${mant.fallas} ${mant.fallas === 1 ? 'falla' : 'fallas'}`} sub="minutos por falla" valor={`${dec(mant.mttr)} min`} frac={mant.mttr / Math.max(mant.mttr, mant.mttrPrevio ?? 0)} tipo="neutro" tono={mant.mttrPrevio != null && mant.mttr <= mant.mttrPrevio ? 'bien' : undefined} />
                    {mant.mttrPrevio != null && <Ev label="Turnos previos" sub="minutos por falla" valor={`${dec(mant.mttrPrevio)} min`} frac={mant.mttrPrevio / Math.max(mant.mttr, mant.mttrPrevio)} tipo="neutro" />}
                  </>
                ) : <Nota>{mant ? 'Hoy no hubo fallas de equipos: no hay tiempo de respuesta que medir.' : 'Shoplogix no publicó los datos de Mantención de este turno.'}</Nota>}
              </Sec>
              <Sec n={4} titulo="Cada falla de equipo">
                {eventos.length === 0 && <Nota>Sin fallas de equipos hoy.</Nota>}
                {eventos.map((e, i) => (
                  <Ev key={`${e.desde}-${i}`} label={e.causas.join(' · ') || 'Falla técnica'} sub={`${e.maquina} · ${hhmm(e.desde)}–${hhmm(e.hasta)}`} valor={horas(e.min)} />
                ))}
                {eventos.length > 0 && <Nota>Minutos de máquina: una falla de una máquina de tres cuenta un tercio en los minutos de línea de arriba.</Nota>}
              </Sec>
            </div>
          ),
        }
      }
      case 'rep': {
        const vuelven = filasPareto.slice().sort((a, b) => b.shifts - a.shifts || b.minutes - a.minutes).slice(0, 8)
        const mants = filasPareto.filter((r) => r.dueno === 'mantencion')
        return {
          titulo: '¿Qué causa nos quita más tiempo y cuál vuelve siempre?',
          sub: pareto ? `Últimos ${nTurnos} turnos · ${horas(pareto.totalMin)} perdidas ≈ ${int(pareto.totalPiezas)} pz` : undefined,
          cuerpo: (
            <div className="an-d">
              <Resp>
                {!masTiempo || !masVuelve ? 'Sin historial de turnos para comparar.' : masTiempo === masVuelve
                  ? <><b>{masTiempo.label}</b> quitó más tiempo ({horas(masTiempo.minutes)}) y además volvió en {masTiempo.shifts} de {nTurnos} turnos.</>
                  : <><b>{masTiempo.label}</b> quitó más ({horas(masTiempo.minutes)}, en {masTiempo.shifts} {masTiempo.shifts === 1 ? 'turno' : 'turnos'}). <b className={siempre(masVuelve.shifts) ? 'an-mal' : undefined}>{masVuelve.label}</b> volvió en {masVuelve.shifts} de {nTurnos} turnos, {dec(porTurno(masVuelve))} min cada vez.</>}
              </Resp>
              <Sec n={1} titulo="Lo que más tiempo quitó">
                {filasPareto.slice(0, 10).map((r, i) => (
                  <Ev key={r.label} label={r.label} sub={`${DUENO_UI[r.dueno as DuenoPerdida]?.corto ?? 'Sin imputar'} · acumulado ${Math.round(acumulado[i] ?? 0)} % · ≈${int(r.piezas)} pz`} valor={horas(r.minutes)} frac={r.minutes / Math.max(1, filasPareto[0]?.minutes ?? 1)} tipo={marcaDe((r.dueno as DuenoPerdida) ?? 'sin-imputar')} />
                ))}
                {filasPareto.length >= 2 && <Nota>Las 2 primeras son el {Math.round(acumulado[1] ?? 0)} % de lo perdido{filasPareto.length >= 6 ? `; las 6 juntas, el ${Math.round(acumulado[5] ?? 0)} %` : ''}.</Nota>}
              </Sec>
              <Sec n={2} titulo="Lo que vuelve cada turno">
                {vuelven.map((r) => (
                  <Ev key={r.label} label={r.label} sub={`${dec(porTurno(r))} min por turno`} valor={`${r.shifts} de ${nTurnos}`} frac={nTurnos > 0 ? r.shifts / nTurnos : 0} tipo={siempre(r.shifts) ? 'mal' : marcaDe((r.dueno as DuenoPerdida) ?? 'sin-imputar')} tono={siempre(r.shifts) ? 'mal' : undefined} />
                ))}
              </Sec>
              <Sec n={3} titulo="Lo de Mantención entre las causas">
                {mants.length === 0 ? <Nota>Ninguna causa de equipos aparece entre las de estos turnos.</Nota> : mants.slice(0, 6).map((r) => (
                  <Ev key={r.label} label={r.label} sub={`en ${r.shifts} de ${nTurnos} turnos`} valor={horas(r.minutes)} frac={r.minutes / Math.max(1, mants[0]?.minutes ?? 1)} tipo="mant" />
                ))}
              </Sec>
            </div>
          ),
        }
      }
      case 'falla': {
        if (!fr) return null
        return {
          titulo: '¿Las reparaciones aguantan o la falla vuelve?',
          sub: `Fallas de equipos que vuelven en la misma máquina antes de 8 h de operación${fr.desde ? ` · desde ${fr.desde.slice(8, 10)}-${fr.desde.slice(5, 7)}` : ''}`,
          cuerpo: (
            <div className="an-d">
              <Resp nota="Una falla que vuelve es una reparación que no quedó resuelta. La serie sirve de línea base: una baja cuenta como aporte cuando acompaña un cambio en cómo se repara.">
                {peorCausaFr
                  ? <><b className={tonoMeta(peorCausaFr.tasa) === 'mal' ? 'an-mal' : 'an-bien'}>{peorCausaFr.causa}</b> vuelve {Math.round(peorCausaFr.tasa * 10)} de cada 10 veces ({peorCausaFr.vuelven} de {peorCausaFr.episodios}); desde un momento cualquiera de operación, {pct0(peorCausaFr.azar)}.</>
                  : 'Todavía no hay causas con 10 o más fallas para comparar.'}
              </Resp>
              <Sec n={1} titulo="Por causa, todo el período">
                {fr.causas.slice(0, 10).map((c) => (
                  <Ev key={c.causa} label={c.causa} sub={`${c.vuelven} de ${c.episodios} volvieron · azar ${pct0(c.azar)}${c.episodios < 10 ? ' · pocos datos' : ''}`} valor={pct0(c.tasa)} frac={c.tasa} tipo={c.episodios < 10 ? 'neutro' : tonoMeta(c.tasa) === 'mal' ? 'mal' : 'mant'} tono={c.episodios >= 10 && tonoMeta(c.tasa) === 'mal' ? 'mal' : undefined} />
                ))}
              </Sec>
              <Sec n={2} titulo="Mes a mes, todas las causas">
                {mesesFr.map((m) => (
                  <Ev key={m.mes} label={nombreMes(m.mes, anioFr, true)} sub={`${m.vuelven} de ${m.episodios} fallas${m.pocosDatos ? ' · pocos datos' : ''}`} valor={pct0(m.tasa)} frac={m.tasa} tipo={m.pocosDatos ? 'neutro' : tonoMeta(m.tasa) === 'mal' ? 'mal' : 'mant'} />
                ))}
                <Nota>Meses con menos de 30 fallas van en gris: su porcentaje se mueve mucho con una o dos fallas.</Nota>
              </Sec>
              <Sec n={3} titulo="Cómo se cuenta">
                <Nota>Falla: paro de equipos de 2 min o más (sin «Ajuste mantenimiento» ni trabajos de contratistas). Paros de la misma causa a menos de 12 min son una sola falla. Vuelve: la misma causa aparece en la misma máquina antes de 8 h de operación (se cuentan las horas produciendo, no las de reloj). Azar: cuántas veces aparecería la causa en las 8 h siguientes a un momento cualquiera.</Nota>
              </Sec>
            </div>
          ),
        }
      }
      case 'peso': {
        const causasSem = semAct ? semAct.causas.mantencion : []
        return {
          titulo: '¿Cuánto pesa Mantención en lo perdido y va mejorando?',
          sub: 'Minutos de fallas de equipos ÷ todos los minutos perdidos',
          cuerpo: (
            <div className="an-d">
              <Resp>
                {pAct == null ? 'Aún no hay minutos perdidos en la semana para calcular el peso.' : <><b className={pAnt != null && pAct <= pAnt ? 'an-bien' : 'an-mal'}>{Math.round(pAct)} %</b> {esSemanaActual ? 'esta semana' : 'la última semana'}{pAnt != null ? <>, {pAct < pAnt ? <><b className="an-bien">{Math.round(pAnt - pAct)} pts menos</b> que</> : pAct > pAnt ? <><b className="an-mal">{Math.round(pAct - pAnt)} pts más</b> que</> : 'igual que'} la anterior ({Math.round(pAnt)} %)</> : ''}.</>}
              </Resp>
              <Sec n={1} titulo="La comparación">
                {semAct && pAct != null && <Ev label={esSemanaActual ? 'Esta semana' : `Semana del ${semanaCorta(semAct.semana)}`} sub={`${esSemanaActual ? 'en curso · ' : ''}${semAct.turnos} ${semAct.turnos === 1 ? 'turno' : 'turnos'} · ${horas(semAct.min.mantencion)} de ${int(totSem(semAct))} min`} valor={`${Math.round(pAct)} %`} frac={pAct / maxPeso} tipo="mant" />}
                {semAnt && pAnt != null && <Ev label="Semana anterior" sub={`${semanaCorta(semAnt.semana)} · ${horas(semAnt.min.mantencion)} de ${int(totSem(semAnt))} min`} valor={`${Math.round(pAnt)} %`} frac={pAnt / maxPeso} tipo="mant" />}
                {pareto && pTurnos != null && <Ev label={`Últimos ${nTurnos} turnos`} sub={`referencia · ${horas(mantPareto)} de ${int(pareto.totalMin)} min`} valor={`${Math.round(pTurnos)} %`} frac={pTurnos / maxPeso} tipo="mant" />}
                <Nota>Se comparan porcentajes, no minutos: una semana en curso tiene menos turnos que una completa.</Nota>
              </Sec>
              <Sec n={2} titulo={semAct ? `Qué sumó los ${int(semAct.min.mantencion)} min de ${esSemanaActual ? 'esta semana' : 'la última semana'}` : 'Qué sumó'}>
                {causasSem.length === 0 ? <Nota>Sin fallas de equipos en la semana.</Nota> : causasSem.slice(0, 6).map((c) => (
                  <Ev key={c.causa} label={c.causa} sub={`${c.equipo ?? 'equipos'} · ${c.count} ${c.count === 1 ? 'vez' : 'veces'}`} valor={horas(c.min)} frac={c.min / Math.max(1, causasSem[0]?.min ?? 1)} tipo="mant" />
                ))}
              </Sec>
              <Sec n={3} titulo="Cuánto tarda Mantención en responder">
                {mant && mant.mttr != null ? (
                  <>
                    <Ev label="Hoy" sub="minutos por falla" valor={`${dec(mant.mttr)} min`} frac={mant.mttr / Math.max(mant.mttr, mant.mttrPrevio ?? 0)} tipo="neutro" tono={mant.mttrPrevio != null && mant.mttr <= mant.mttrPrevio ? 'bien' : undefined} />
                    {mant.mttrPrevio != null && <Ev label="Turnos previos" sub="minutos por falla" valor={`${dec(mant.mttrPrevio)} min`} frac={mant.mttrPrevio / Math.max(mant.mttr, mant.mttrPrevio)} tipo="neutro" />}
                  </>
                ) : <Nota>Hoy no hubo fallas de equipos que medir.</Nota>}
              </Sec>
            </div>
          ),
        }
      }
      case 'quien': {
        return {
          titulo: '¿De quién fue lo perdido cada semana?',
          sub: 'Minutos de línea por semana · solo lectura: acá no se imputa',
          cuerpo: (
            <div className="an-d">
              <Resp>
                {!semAct || totSem(semAct) <= 0 ? 'Aún no hay minutos perdidos en la semana.' : <><b className={maxPrevio != null && (shareAct ?? 0) > maxPrevio ? 'an-mal' : undefined}>{int(semAct.min['sin-imputar'])} de {int(totSem(semAct))} min</b> {esSemanaActual ? 'de esta semana' : 'de la última semana'} están sin imputar{minPrevio != null && maxPrevio != null ? <> ({Math.round(shareAct ?? 0)} %; las semanas anteriores, entre {Math.round(minPrevio)} y {Math.round(maxPrevio)} %)</> : ''}.</>}
              </Resp>
              <Sec n={1} titulo="Cada semana, por turno y causa">
                <DetalleSemanaV2 semanas={semanas} hoy={p.hoy} />
              </Sec>
            </div>
          ),
        }
      }
      default: return null
    }
  })()

  // ── Render ─────────────────────────────────────────────────────────────────
  const nCols = Math.max(1, filasHora.length)
  const maxPz = Math.max(1, metaPorHora ?? 0, ...cols.map((c) => c.h.pieces))
  const objetivo = maxPz * 1.18
  const pasoPz = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].find((s) => objetivo / s <= 5) ?? 10000
  const topPz = Math.ceil(objetivo / pasoPz) * pasoPz
  const pz = (v: number) => `${((v / topPz) * 100).toFixed(2)}%` // decimal-tecnico: alto/posición CSS en %, no una cifra que alguien lea
  const rejas: number[] = []
  for (let v = pasoPz; v < topPz; v += pasoPz) rejas.push(v)
  const kdet = kpiMin(totalPerdido)
  const mttrTxt = mant && mant.mttr != null ? mant.mttr : null

  return (
    <div className="monitor-v2 an">
      <Bloque titulo="Este turno" sub={`hoy, desde la primera pieza${leido ? ` · leído ${leido}` : ''}`}>
        <div className="an-g an-g-hoy">
          {/* T1 · Hora por hora */}
          {filasHora.length > 0 && (
            <article className="an-c" aria-label="Hora por hora">
              <Cabeza
                pregunta="¿Cómo vamos hora a hora?"
                kpi={metaPorHora != null && completas.length > 0 ? `${sobreMeta} de ${completas.length}` : int(totalHechas)}
                unidad={metaPorHora != null && completas.length > 0 ? 'horas sobre meta' : 'hechas en el turno'}
                estado={metaPorHora != null && completas.length > 0
                  ? (bajoMeta.length > 0 ? <Estado tono="mal">Bajo meta en {bajoMeta.length} {bajoMeta.length === 1 ? 'hora' : 'horas'}</Estado> : <Estado tono="ok">Todas las horas sobre meta</Estado>)
                  : <Estado tono="neutro">{metaPorHora == null ? 'Sin meta cargada' : 'Aún no hay horas completas'}</Estado>}
                refer={metaPorHora != null ? (
                  <>
                    Meta {int(metaPorHora)} por hora
                    {enCurso && enCurso.metaH != null && enCurso.dif != null && (
                      <> · {ordinal(enCurso.h.index)} hora: {int(enCurso.h.pieces)} de {int(enCurso.metaH)} a <Dato texto={<>Lo que tocaba hacer hasta este minuto de la hora: {int(metaPorHora)} por hora × {enCurso.h.minutesCovered} min ÷ 60 = {int(enCurso.metaH)}. La hora en curso se compara contra esto y no contra la hora completa.</>}>esta hora</Dato> ({adelanteAtras(enCurso.dif)})</>
                    )}
                  </>
                ) : 'El turno no tiene meta cargada: se muestran solo las hechas.'}
                resp={respHora}
              />
              <div className="an-h">
                <div className="an-hp">
                  {rejas.map((v) => (
                    <span key={v}>
                      <i className="an-gl" style={{ bottom: pz(v) }} />
                      {metaPorHora != null && Math.abs(v - metaPorHora) < topPz * 0.07 ? null : <span className="an-yl" style={{ bottom: pz(v) }}>{int(v)}</span>}
                    </span>
                  ))}
                  {metaPorHora != null && <span className="an-yl an-yl-meta" style={{ bottom: pz(metaPorHora) }}>meta<br />{int(metaPorHora)}</span>}
                  <div className="an-hc" style={{ gridTemplateColumns: `repeat(${nCols}, minmax(0, 1fr))` }} onPointerLeave={() => setActiva(null)}>
                    {cols.map((c) => {
                      const refH = c.metaH ?? 0
                      return (
                        <button
                          key={c.h.hourStart}
                          type="button"
                          className={`an-col${c.bajo ? ' an-bajo' : ''}${c.curso ? ' an-cur' : ''}`}
                          aria-label={`${ordinal(c.h.index)} hora, ${hhmm(c.h.from)}: ${int(c.h.pieces)} hechas${c.dif != null ? `, ${adelanteAtras(c.dif)}` : ''}${c.curso ? ', en curso' : ''}. Ver detalle`}
                          onClick={abrir('hora')}
                          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setActiva(c.i) }}
                          onFocus={() => setActiva(c.i)}
                          onBlur={() => setActiva(null)}
                        >
                          <i className="an-b" style={{ height: pz(c.h.pieces) }} />
                          {c.metaH != null && <i className="an-mt" style={{ bottom: pz(refH) }} />}
                          <span className="an-lb" style={{ bottom: `calc(${pz(Math.max(c.h.pieces, refH))} + 5px)` }}>
                            <b>{int(c.h.pieces)}</b>
                            {c.dif != null && <small>{adelanteAtras(c.dif)}</small>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {activa != null && cols[activa] && (
                    <Globo x={((activa + 0.5) / nCols) * 100}>
                      <div className="font-medium text-foreground">{ordinal(cols[activa]!.h.index)} hora · {hhmm(cols[activa]!.h.from)}{cols[activa]!.curso ? ' · en curso' : ''}</div>
                      <div className="text-muted-foreground">{int(cols[activa]!.h.pieces)} hechas{cols[activa]!.metaH != null ? ` · meta ${cols[activa]!.curso ? 'a esta hora ' : ''}${int(cols[activa]!.metaH!)}` : ''}</div>
                      {cols[activa]!.dif != null && <div className="text-muted-foreground">{adelanteAtras(cols[activa]!.dif!)}</div>}
                    </Globo>
                  )}
                </div>
                <div className="an-hx" style={{ gridTemplateColumns: `repeat(${nCols}, minmax(0, 1fr))` }} aria-hidden>
                  {cols.map((c) => (
                    <div key={c.h.hourStart}>
                      <b>{ordinal(c.h.index)}<span className="an-lg"> hora</span></b>
                      <span>{hhmm(c.h.from)}</span>
                      {c.curso && <em>en curso<span className="an-lg"> · {c.h.minutesCovered} min</span></em>}
                      {c.h.partial && !c.curso && <em>{c.h.minutesCovered} min</em>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="an-lgd">
                <span><i className="an-sw an-sw-n" /><Dato texto={<>Piezas que salieron en esa hora, contadas desde la primera pieza del turno (no por hora de reloj). Hoy: {int(totalHechas)} en total.</>}>Hechas</Dato></span>
                {metaPorHora != null && <span><i className="an-sw an-sw-m" />Bajo meta</span>}
                {metaPorHora != null && <span><i className="an-mk" /><Dato texto={<>Lo que pide la meta del turno en una hora: {int(metaPorHora)} piezas. Es la meta del turno ÷ las horas del turno.</>}>Meta de la hora</Dato></span>}
                {enCurso && <span><i className="an-sw an-sw-c" />Hora en curso, contra la meta a esta hora</span>}
                {metaPorHora != null && <span><Dato texto={<>«N adelante» es cuántas piezas por encima de la meta de esa hora se hicieron; «N atrás», cuántas faltaron. Es hechas menos meta.</>}>N adelante / N atrás</Dato></span>}
              </div>
              <Ver texto="cada hora con sus detenciones" onClick={abrir('hora')} etiqueta="hora por hora" />
            </article>
          )}

          {/* T2 · Detenciones de hoy */}
          <article className="an-c" aria-label="Detenciones de hoy">
            <Cabeza
              pregunta="¿Cuánto se detuvo la línea hoy?"
              kpi={kdet.valor}
              unidad={kdet.unidad}
              estado={veces != null && totalPerdido > 0
                ? (veces > 1 ? <Estado tono="mal">{dec(veces)} veces lo normal</Estado> : <Estado tono="ok">Dentro de lo normal</Estado>)
                : undefined}
              refer={turnoNormal != null
                ? <><Dato texto={<>Promedio de minutos de línea detenida en los últimos {nTurnos} turnos ({horas(pareto!.totalMin)} ÷ {nTurnos}).</>}>Turno normal {int(turnoNormal)} min</Dato> · desvío {firmado(totalPerdido - turnoNormal)} min{leido ? ` · leído ${leido}` : ''}</>
                : `Sin historial de turnos para saber qué es lo normal${leido ? ` · leído ${leido}` : ''}`}
              resp={totalPerdido > 0
                ? <>De Mantención: {mmTxt(mantHoy)} ({pctDe(mantHoy, totalPerdido)} %). Sin imputar: {horas(minDe('sin-imputar'))}.</>
                : 'Hoy la línea no registra minutos detenidos.'}
            />
            <div className="an-bl">
              <button type="button" className="an-bl-t" onClick={abrir('det')} aria-label={`Detenciones de hoy por dueño: ${horas(totalPerdido)}. Ver detalle`}>
                {(['mantencion', 'externo', 'sin-imputar'] as const).map((d) => minDe(d) > 0 && <i key={d} className={`an-s an-s-${marcaDe(d)}`} style={{ width: `${(minDe(d) / escDet.top) * 100}%` }} />)}
              </button>
              {turnoNormal != null && (
                <span className="an-ref7" style={{ left: `${Math.min(100, (turnoNormal / escDet.top) * 100)}%` }}>
                  <span className="an-ref7-l"><Dato texto={<>Promedio de minutos de línea detenida en los últimos {nTurnos} turnos ({horas(pareto!.totalMin)} ÷ {nTurnos} = {int(turnoNormal)} min).</>}>normal {int(turnoNormal)}</Dato></span>
                </span>
              )}
              <Escala top={escDet.top} paso={escDet.paso} unidad="min" />
            </div>
            <div className="an-lgd an-own">
              <span><Dato texto={<>Una máquina detenida de tres cuenta un tercio: son minutos de la línea entera, no de cada máquina. Hoy: {horas(totalPerdido)}.</>}>minutos de línea</Dato></span>
              <span><MarcaDueno m="mant" />Mantención <b>{int(mantHoy)}</b></span>
              <span><MarcaDueno m="ext" />Externo <b>{int(minDe('externo'))}</b></span>
              <span><MarcaDueno m="si" />Sin imputar <b>{int(minDe('sin-imputar'))}</b></span>
            </div>
            {top4.length > 0 && (
              <div className="an-ls an-pc">
                {top4.map((c) => (
                  <button key={c.causa} type="button" className="an-row an-row-c" onClick={abrir('det')}>
                    <span className="an-n"><MarcaDueno m={marcaDe(c.dueno)} /><span>{c.causa}</span></span>
                    <span className="an-bt"><i className={`an-s an-s-${marcaDe(c.dueno)}`} style={{ width: `${(c.min / maxCausa) * 100}%` }} /></span>
                    <span className="an-vv">{mmTxt(c.min)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="an-rs">
              <span><Dato texto={<>Minutos promedio desde que falla un equipo hasta que vuelve a andar. Hoy {mttrTxt != null ? `${dec(mttrTxt)} min` : 'sin fallas'}{mant?.mttrPrevio != null ? `, turnos previos ${dec(mant.mttrPrevio)} min` : ''}.</>}>Respuesta de Mantención</Dato></span>
              <span>
                {mttrTxt != null
                  ? <><b>{dec(mttrTxt)} min</b> por falla{mant?.mttrPrevio != null ? <> · antes {dec(mant.mttrPrevio)} ({firmado(mttrTxt - mant.mttrPrevio, (x) => dec(x))})</> : ''}</>
                  : mant ? 'sin fallas de equipos hoy' : 'sin dato de Shoplogix'}
              </span>
            </div>
            <Ver texto="cada detención del turno" onClick={abrir('det')} etiqueta="detenciones de hoy" />
          </article>
        </div>
      </Bloque>

      <Bloque titulo="Lo que se repite" sub={pareto ? `últimos ${nTurnos} turnos y ${semanas.length} ${semanas.length === 1 ? 'semana' : 'semanas'}` : `últimas ${semanas.length} semanas`}>
        <div className="an-g an-g-rep">
          {/* T3 · Qué se repite */}
          <article className="an-c" aria-label="Qué se repite">
            <Cabeza
              pregunta="¿Qué causa nos quita más tiempo y cuál vuelve siempre?"
              kpi={pareto ? dec(pareto.totalMin / 60) : '—'}
              unidad={pareto ? `h perdidas en ${nTurnos} turnos` : 'sin historial'}
              refer={pareto ? (
                <>
                  <Dato texto={<>Piezas que se dejaron de hacer: minutos × ritmo del turno en que ocurrió (estimado). Total: ≈{int(pareto.totalPiezas)} pz.</>}>≈ {int(pareto.totalPiezas)} pz</Dato> · de Mantención {pctDe(mantPareto, pareto.totalMin)} %
                  {filasPareto.length >= 2 && <> · las 2 primeras causas son el {Math.round(acumulado[1] ?? 0)} %</>}
                </>
              ) : undefined}
              resp={masTiempo && masVuelve ? (masTiempo === masVuelve
                ? <>{masTiempo.label} quitó más ({horas(masTiempo.minutes)}) y volvió en {masTiempo.shifts} de {nTurnos} turnos.</>
                : <>{masTiempo.label} quitó más ({horas(masTiempo.minutes)}, en {masTiempo.shifts} {masTiempo.shifts === 1 ? 'turno' : 'turnos'}). {masVuelve.label} volvió en {masVuelve.shifts} de {nTurnos} turnos.</>) : undefined}
            />
            {top6.length > 0 && (
              <>
                <div className="an-ph" aria-hidden>
                  <span>causa</span>
                  <span><Dato texto="Los minutos de línea que quitó la causa en los últimos turnos; la barra se compara con la causa que más quitó.">minutos de línea</Dato></span>
                  <span className="r">tiempo</span>
                  <span className="r"><Dato texto={textoAcum}>acumulado</Dato></span>
                  <span><Dato texto={<>En cuántos de los últimos {nTurnos} turnos apareció esta causa al menos una vez.</>}>turnos</Dato></span>
                </div>
                <div className="an-pl">
                  {top6.map((r, i) => (
                    <button key={r.label} type="button" className="an-row an-row-p" onClick={abrir('rep')}>
                      <span className="an-n">
                        <MarcaDueno m={marcaDe((r.dueno as DuenoPerdida) ?? 'sin-imputar')} />
                        <span className="an-nn"><span title={r.label}>{r.label}</span><small>≈{int(r.piezas)} pz · {dec(porTurno(r))} min por turno</small></span>
                      </span>
                      <span className="an-bt"><i className={`an-s an-s-${marcaDe((r.dueno as DuenoPerdida) ?? 'sin-imputar')}`} style={{ width: `${(r.minutes / maxMin6) * 100}%` }} /></span>
                      <span className="an-vv an-vt">{horas(r.minutes)}</span>
                      <span className="an-vv an-ac"><b>{Math.round(acumulado[i] ?? 0)} %</b><span className="an-lg"> acumulado</span></span>
                      <span className="an-fq">
                        {nTurnos > 0 && nTurnos <= 12 && <span className="an-cs" aria-hidden>{Array.from({ length: nTurnos }, (_, j) => <i key={j} className={j < r.shifts ? `on${siempre(r.shifts) ? ' hot' : ''}` : undefined} />)}</span>}
                        <span className={siempre(r.shifts) ? 'an-mal' : undefined}>{r.shifts}/{nTurnos}</span>
                        {siempre(r.shifts) && <span className="an-sr"> vuelve siempre</span>}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="an-nt">
                  <Dato texto={textoAcum}>acumulado</Dato> ·{' '}
                  <Dato texto={<>En cuántos de los últimos {nTurnos} turnos apareció la causa al menos una vez. En rojo, las que vuelven siempre ({Math.ceil(nTurnos * 0.8)} o más).</>}>turnos</Dato> ·{' '}
                  <Dato texto="Minutos totales ÷ turnos en que apareció: cuánto quita cada vez que aparece.">min por turno</Dato> ·{' '}
                  <Dato texto="Piezas que se dejaron de hacer: minutos × ritmo del turno en que ocurrió (estimado).">≈ pz</Dato>
                </div>
              </>
            )}
            <Ver texto="todas las causas, con piezas y dueño" onClick={abrir('rep')} etiqueta="qué se repite" />
          </article>

          <div className="an-col2">
            {/* T4 · Peso de Mantención */}
            <article className="an-c" aria-label="Peso de Mantención">
              <Cabeza
                pregunta="¿Cuánto pesa Mantención en lo perdido?"
                kpi={pAct != null ? Math.round(pAct) : '—'}
                unidad="%"
                estado={pAct != null && pAnt != null ? (pAct < pAnt ? <Estado tono="ok">Mejor que la semana anterior</Estado> : pAct > pAnt ? <Estado tono="mal">Peor que la semana anterior</Estado> : <Estado tono="neutro">Igual que la semana anterior</Estado>) : undefined}
                refer={
                  pAct != null ? (
                    <>
                      {pAnt != null && <>Semana anterior {Math.round(pAnt)} % · desvío {firmado(Math.round(pAct - pAnt))} pts · </>}
                      <Dato texto={<>Minutos de fallas de equipos ÷ todos los minutos perdidos de ese periodo.{pAct != null && semAct ? ` Esta semana: ${int(semAct.min.mantencion)} de ${int(totSem(semAct))} min = ${Math.round(pAct)} %.` : ''}</>}>% de Mantención</Dato>
                      {pTurnos != null && <> en los últimos {nTurnos} turnos {Math.round(pTurnos)} %</>}
                    </>
                  ) : 'Aún no hay minutos perdidos en la semana.'
                }
              />
              <div className="an-ls">
                {semAct && pAct != null && <FilaPeso etiqueta={esSemanaActual ? 'Esta semana' : 'Última semana'} sub={`${esSemanaActual ? 'en curso · ' : ''}${int(semAct.min.mantencion)} de ${int(totSem(semAct))} min`} pct={pAct} max={maxPeso} fuerte onClick={abrir('peso')} />}
                {semAnt && pAnt != null && <FilaPeso etiqueta="Semana anterior" sub={`${int(semAnt.min.mantencion)} de ${int(totSem(semAnt))} min`} pct={pAnt} max={maxPeso} onClick={abrir('peso')} />}
                {pareto && pTurnos != null && <FilaPeso etiqueta={`Últimos ${nTurnos} turnos`} sub={`${int(mantPareto)} de ${int(pareto.totalMin)} min`} pct={pTurnos} max={maxPeso} onClick={abrir('peso')} />}
              </div>
              {pAct != null && <div className="an-scw"><Escala top={maxPeso} paso={maxPeso <= 10 ? 5 : maxPeso <= 40 ? 10 : 20} unidad="%" /></div>}
              <Ver texto="qué fallas sumaron esos minutos" onClick={abrir('peso')} etiqueta="peso de Mantención" />
            </article>

            {/* T5 · De quién fue lo perdido */}
            <article className="an-c" aria-label="De quién fue lo perdido">
              <Cabeza
                pregunta="¿De quién fue lo perdido cada semana?"
                kpi={semAct ? `${int(semAct.min['sin-imputar'])} de ${int(totSem(semAct))}` : '—'}
                unidad="min sin imputar"
                estado={shareAct != null && maxPrevio != null ? (shareAct > maxPrevio ? <Estado tono="mal">Sin imputar alto</Estado> : <Estado tono="neutro">Sin imputar dentro de lo visto</Estado>) : undefined}
                refer={shareAct != null ? (
                  <>
                    {esSemanaActual ? 'Esta semana' : 'Última semana'} {Math.round(shareAct)} % <Dato texto="Minutos que nadie anotó todavía a qué dueño pertenecen. Es solo lectura: acá se ve, no se imputa.">sin imputar</Dato>
                    {minPrevio != null && maxPrevio != null && <> · semanas anteriores {Math.round(minPrevio)}–{Math.round(maxPrevio)} %</>}
                  </>
                ) : undefined}
              />
              {semanas.length > 0 && (
                <>
                  <div className="an-qh" aria-hidden>
                    <span>semana</span>
                    <span>minutos de línea</span>
                    <span className="r" title="Mantención"><MarcaDueno m="mant" /></span>
                    <span className="r" title="Externo"><MarcaDueno m="ext" /></span>
                    <span className="r" title="Sin imputar"><MarcaDueno m="si" /></span>
                    <span className="r">total</span>
                  </div>
                  <div className="an-ql">
                    {semanas.map((s) => (
                      <button key={s.semana} type="button" className="an-row an-row-q" onClick={abrir('quien')} aria-label={`${nomSemana(s)}: Mantención ${int(s.min.mantencion)}, Externo ${int(s.min.externo)}, sin imputar ${int(s.min['sin-imputar'])}, total ${int(totSem(s))} minutos`}>
                        <span className="an-n"><b>{nomSemana(s)}</b>{s === semAct && esSemanaActual && <small>en curso · {s.turnos} {s.turnos === 1 ? 'turno' : 'turnos'}</small>}</span>
                        <span className="an-bt an-bt-st">
                          {(['mantencion', 'externo', 'sin-imputar'] as const).map((d) => s.min[d] > 0 && <i key={d} className={`an-s an-s-${marcaDe(d)}`} style={{ width: `${(s.min[d] / maxSemana) * 100}%` }} />)}
                        </span>
                        <span className="an-vv">{int(s.min.mantencion)}</span>
                        <span className="an-vv">{int(s.min.externo)}</span>
                        <span className={`an-vv${s === semAct && shareAct != null && maxPrevio != null && shareAct > maxPrevio ? ' an-mal' : ''}`}>{int(s.min['sin-imputar'])}</span>
                        <span className="an-vv an-fu">{int(totSem(s))}</span>
                      </button>
                    ))}
                  </div>
                  <div className="an-nt">minutos de línea por semana; cada barra es el total de la semana</div>
                </>
              )}
              <Ver texto="los minutos de cada semana por causa" onClick={abrir('quien')} etiqueta="de quién fue lo perdido" />
            </article>
          </div>
        </div>

        {/* T6 · ¿Las reparaciones aguantan? — reincidencia mes a mes (cron diario). */}
        {fr && mesesFr.length > 0 && (
          <article className="an-c an-c-fr" aria-label="Fallas que vuelven">
            <Cabeza
              pregunta="¿Las reparaciones aguantan o la falla vuelve?"
              kpi={mesFr ? Math.round(mesFr.tasa * 100) : '—'}
              unidad={mesFr ? `% de las fallas volvió · ${nombreMes(mesFr.mes, anioFr, true)}` : 'sin un mes con datos suficientes'}
              estado={mesFr ? { ok: <Estado tono="ok">Bajo la meta</Estado>, neutro: <Estado tono="neutro">En el límite de la meta</Estado>, mal: <Estado tono="mal">Sobre la meta</Estado> }[tonoMeta(mesFr.tasa)] : undefined}
              refer={mesFr ? (
                <>
                  <Dato texto={<>Fallas de equipos que volvieron en la misma máquina antes de 8 h de operación ÷ fallas del mes. {nombreMes(mesFr.mes, anioFr, true)}: {mesFr.vuelven} de {mesFr.episodios}.</>}>volvió</Dato>
                  {mesFrAnt && <> · {nombreMes(mesFrAnt.mes, anioFr, true)} {pct0(mesFrAnt.tasa)}</>}
                  {' '}· meta bajo {pct0(META_REINCIDENCIA)}
                  {azarFr != null && <> · <Dato texto="Cuántas veces aparecería la misma causa en las 8 h siguientes a un momento cualquiera de operación: la referencia para saber si un porcentaje es alto.">azar ≈ {pct0(azarFr)}</Dato></>}
                </>
              ) : undefined}
              resp={peorCausaFr ? <>{peorCausaFr.causa} vuelve {Math.round(peorCausaFr.tasa * 10)} de cada 10 veces ({peorCausaFr.vuelven} de {peorCausaFr.episodios}).</> : undefined}
            />
            <div className="an-ls">
              {mesesFr.map((m) => (
                <button key={m.mes} type="button" className={`an-row an-row-w${m.pocosDatos ? ' an-fr-poco' : ''}`} onClick={abrir('falla')}>
                  <span className="an-n"><span className="an-nn"><b>{nombreMes(m.mes, anioFr)}</b><small>{m.vuelven} de {m.episodios}{m.pocosDatos ? ' · pocos datos' : ''}</small></span></span>
                  <span className="an-bt an-fr-bt">
                    <i className={`an-s ${m.pocosDatos ? 'an-s-neutro' : tonoMeta(m.tasa) === 'mal' ? 'an-s-mal' : 'an-s-mant'}`} style={{ width: `${Math.max(1.5, m.tasa * 100)}%` }} />
                    <em className="an-fr-meta" style={{ left: `${META_REINCIDENCIA * 100}%` }} aria-hidden />
                  </span>
                  <span className="an-vv">{pct0(m.tasa)}</span>
                </button>
              ))}
            </div>
            <div className="an-nt">barra = % de fallas que volvió en ≤ 8 h de operación · raya = meta {pct0(META_REINCIDENCIA)} · en gris, meses con menos de 30 fallas</div>
            <Ver texto="por causa, contra el azar" onClick={abrir('falla')} etiqueta="fallas que vuelven" />
          </article>
        )}
      </Bloque>

      <PanelDetalle abierto={detalle != null} titulo={detalle?.titulo ?? ''} sub={detalle?.sub} onClose={() => setAbierta(null)}>
        {detalle?.cuerpo}
      </PanelDetalle>
    </div>
  )
}

const horasTxt = (min: number) => (min >= 60 ? `${dec(min / 60)} h` : `${Math.round(min)} min`)

function FilaPeso({ etiqueta, sub, pct, max, fuerte, onClick }: { etiqueta: string; sub: string; pct: number; max: number; fuerte?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="an-row an-row-w" onClick={onClick}>
      <span className="an-n"><span className="an-nn"><b>{etiqueta}</b><small>{sub}</small></span></span>
      <span className="an-bt"><i className="an-s an-s-mant" style={{ width: `${(pct / max) * 100}%` }} /></span>
      <span className={`an-vv${fuerte ? ' an-fu' : ''}`}>{Math.round(pct)} %</span>
    </button>
  )
}
