/**
 * Gráficos comparadores del Duelo (fase 2): KPI a KPI, ritmo hora a hora, alimentación por puesto, tendencia semanal y
 * marcador por semana y por mes. Mismo lenguaje que `MinutoTurnoV2` y `RitmoVivoV2`: SVG/HTML a mano (sin librería),
 * sistema 0–100 estirado, puntos en HTML, lectura al tocar, colores solo con tokens `--v2-*`.
 *
 * Cada equipo lleva SIEMPRE su color (`COLOR_EQUIPO`); el ganador de una barra va a opacidad plena y el otro más tenue.
 * Las barras arrancan en cero. Las líneas de la tendencia sí tienen eje recortado, y lo rotulan.
 */
import { useState, type ReactNode } from 'react'
import { SegmentedControl } from '@/components/piel'
import { dec1 } from '@/utils/formatoNumeros'
import {
  COLOR_EQUIPO, COLOR_EQUIPO_TEXTO, EQUIPOS, marcadorDePeriodo, periodosDisponibles,
  type EquipoId, type FilaVs, type HoraRitmo, type PeriodoTipo, type PuestoMarcador, type PuntoSemana, type Resultado,
  type TurnoDuelo,
} from './duelo'

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const fechaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`

const valorKpi = (v: number | null, unidad: string, decimales: number) =>
  v == null ? 'sin dato' : `${decimales > 0 ? dec1(v) : int(v)} ${unidad}`

export interface LadoDuelo {
  id: EquipoId
  nombre: string
}

const Punto = ({ id }: { id: EquipoId }) => (
  <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_EQUIPO[id] }} aria-hidden="true" />
)

/** Quién se llevó la fila: el punto del color del equipo y su nombre; si no hay ganador, el estado en texto. */
function Ganador({ r, a, b }: { r: Resultado; a: LadoDuelo; b: LadoDuelo }) {
  if (r === 'a' || r === 'b') {
    const l = r === 'a' ? a : b
    return <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-foreground"><Punto id={l.id} />Punto {l.nombre}</span>
  }
  const texto = r === 'empate' ? 'Empate' : r === 'pendiente' ? 'Al cierre' : 'Sin dato'
  return <span className="shrink-0 text-[13px] text-muted-foreground">{texto}</span>
}

/** Una mitad de la fila: el valor y su barra, que crece desde el centro hacia afuera. */
function Mitad({ lado, texto, frac, opaca, id, retraso }: { lado: 'izq' | 'der'; texto: string; frac: number; opaca: boolean; id: EquipoId; retraso: number }) {
  const izq = lado === 'izq'
  return (
    <div className={`min-w-0 ${izq ? 'text-right' : 'text-left'}`}>
      <div className="truncate text-[13px] tabular-nums text-foreground">{texto}</div>
      <div className={`mt-1 flex h-2.5 overflow-hidden rounded-full bg-muted-foreground/[0.12] ${izq ? 'justify-end' : 'justify-start'}`}>
        {frac > 0 && (
          <div
            className="duelo-barra-x h-full rounded-full"
            style={{ width: `${Math.max(3, frac * 100)}%`, background: COLOR_EQUIPO[id], opacity: opaca ? 1 : 0.42, ['--origen' as string]: izq ? 'right' : 'left', animationDelay: `${retraso}ms` }}
          />
        )}
      </div>
    </div>
  )
}

/** Una barra que crece desde el centro hacia afuera; el equipo que no gana la fila va más tenue. */
function BarraCentro({ lado, frac, opaca, id, retraso }: { lado: 'izq' | 'der'; frac: number; opaca: boolean; id: EquipoId; retraso: number }) {
  const izq = lado === 'izq'
  return (
    <div className={`flex h-2.5 min-w-0 overflow-hidden rounded-full bg-muted-foreground/[0.12] ${izq ? 'justify-end' : 'justify-start'}`}>
      {frac > 0 && (
        <div
          className="duelo-barra-x h-full rounded-full"
          style={{ width: `${Math.max(3, frac * 100)}%`, background: COLOR_EQUIPO[id], opacity: opaca ? 1 : 0.42, ['--origen' as string]: izq ? 'right' : 'left', animationDelay: `${retraso}ms` }}
        />
      )}
    </div>
  )
}

/**
 * Una fila enfrentada. En celular y en el ampliado: rótulo y ganador arriba, cada valor sobre su barra. En la pestaña a
 * ancho de PC (`.duelo-pc`, desde 1280 px) se cambia por una sola línea: rótulo, cifra pegada a su barra, las dos barras
 * desde el centro, la otra cifra y el ganador al final. `ancho` fija la columna del rótulo según el gráfico.
 */
function FilaEnfrentada({ rotulo, nota, a, b, textoA, textoB, fa, fb, ganador, k, ancho }: {
  rotulo: string; nota?: string; a: LadoDuelo; b: LadoDuelo; textoA: string; textoB: string; fa: number; fb: number; ganador: Resultado; k: number
  ancho: 'kpi' | 'puesto'
}) {
  const sinGanador = ganador !== 'a' && ganador !== 'b'
  const opacaA = sinGanador || ganador === 'a'
  const opacaB = sinGanador || ganador === 'b'
  const columnas = ancho === 'kpi'
    ? 'grid-cols-[minmax(0,11rem)_4.5rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_minmax(0,9rem)]'
    : 'grid-cols-[2.5rem_3rem_minmax(0,1fr)_minmax(0,1fr)_3rem_minmax(0,6rem)]'
  return (
    <li className="min-w-0">
      <div className="fila-vs-m">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-[15px] text-foreground">{rotulo}{nota && <span className="text-[13px] text-muted-foreground"> · {nota}</span>}</span>
          <Ganador r={ganador} a={a} b={b} />
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Mitad lado="izq" texto={textoA} frac={fa} opaca={opacaA} id={a.id} retraso={k * 40} />
          <Mitad lado="der" texto={textoB} frac={fb} opaca={opacaB} id={b.id} retraso={k * 40} />
        </div>
      </div>
      <div className={`fila-vs-pc items-center gap-x-2 py-1.5 ${columnas}`}>
        <span className="min-w-0 text-[15px] leading-tight text-foreground">{rotulo}{nota && <span className="block text-[13px] text-muted-foreground">{nota}</span>}</span>
        <span className="text-right text-[13px] tabular-nums text-foreground">{textoA}</span>
        <BarraCentro lado="izq" frac={fa} opaca={opacaA} id={a.id} retraso={k * 40} />
        <BarraCentro lado="der" frac={fb} opaca={opacaB} id={b.id} retraso={k * 40} />
        <span className="text-left text-[13px] tabular-nums text-foreground">{textoB}</span>
        <span className="justify-self-end"><Ganador r={ganador} a={a} b={b} /></span>
      </div>
    </li>
  )
}

/** Encabezado con los dos equipos y sus colores, para que las barras no necesiten leyenda aparte. */
function Cabecera({ a, b, centro }: { a: LadoDuelo; b: LadoDuelo; centro?: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[15px] font-medium text-foreground">
        <span className="inline-flex items-center gap-1.5"><Punto id={a.id} />{a.nombre}</span>
        <span className="inline-flex items-center gap-1.5">{b.nombre}<Punto id={b.id} /></span>
      </div>
      {centro && <div className="mt-0.5 text-[13px] font-normal tabular-nums text-muted-foreground">{centro}</div>}
    </div>
  )
}

// ── KPI a KPI ────────────────────────────────────────────────────────────────

export function KpiAKpiV2({ filas, a, b }: { filas: FilaVs[]; a: LadoDuelo; b: LadoDuelo }) {
  return (
    <div className="mt-4">
      <Cabecera a={a} b={b} />
      <ul className="mt-3 max-w-[760px] space-y-4 xl:space-y-0">
        {filas.map((f, i) => (
          <FilaEnfrentada
            key={`${f.kpi}${f.rotulo}`}
            k={i}
            rotulo={f.rotulo}
            nota={f.mejor === 'menor' ? 'menos es mejor' : undefined}
            a={a}
            b={b}
            ancho="kpi"
            textoA={valorKpi(f.a, f.unidad, f.decimales)}
            textoB={valorKpi(f.b, f.unidad, f.decimales)}
            fa={f.fa}
            fb={f.fb}
            ganador={f.ganador}
          />
        ))}
      </ul>
    </div>
  )
}

// ── Alimentación por puesto ──────────────────────────────────────────────────

/** Llenado 0–100 %: la barra mide el porcentaje tal cual (el 100 % es el borde). */
export function PuestosVsV2({ puestos, a, b }: { puestos: PuestoMarcador[]; a: LadoDuelo; b: LadoDuelo }) {
  const ganaA = puestos.filter((p) => p.ganador === 'a').length
  const ganaB = puestos.filter((p) => p.ganador === 'b').length
  const pct = (v: number | null) => (v == null ? 'sin dato' : `${int(v)} %`)
  return (
    <div className="mt-4">
      <Cabecera a={a} b={b} centro={`Puestos ganados: ${a.nombre} ${ganaA} – ${ganaB} ${b.nombre}`} />
      <ul className="mt-3 max-w-[520px] space-y-4 xl:space-y-0">
        {puestos.map((p, i) => (
          <FilaEnfrentada
            key={p.clave}
            k={i}
            rotulo={p.etiqueta}
            ancho="puesto"
            a={a}
            b={b}
            textoA={pct(p.a)}
            textoB={pct(p.b)}
            fa={p.a != null ? Math.min(1, p.a / 100) : 0}
            fb={p.b != null ? Math.min(1, p.b / 100) : 0}
            ganador={p.ganador}
          />
        ))}
      </ul>
    </div>
  )
}

// ── Ritmo hora a hora ────────────────────────────────────────────────────────

export function RitmoHoraV2({ horas, a, b, nombreRival }: { horas: HoraRitmo[]; a: LadoDuelo; b: LadoDuelo; nombreRival: string }) {
  const [sel, setSel] = useState<number | null>(null)
  const max = Math.max(1, ...horas.flatMap((h) => [h.a ?? 0, h.b ?? 0])) * 1.1
  const completas = horas.filter((h) => h.a != null && h.b != null && !h.parcialA && !h.parcialB)
  const ganaA = completas.filter((h) => Math.round(h.a! * 10) > Math.round(h.b! * 10)).length
  const ganaB = completas.filter((h) => Math.round(h.b! * 10) > Math.round(h.a! * 10)).length
  const elegida = horas.find((h) => h.hora === sel) ?? null
  const num = (v: number | null) => (v == null ? 'sin dato' : `${dec1(v)} pz/min`)
  return (
    <div className="mt-4">
      <Cabecera a={a} b={b} centro={completas.length > 0 ? `Horas completas ganadas: ${a.nombre} ${ganaA} – ${ganaB} ${b.nombre}` : undefined} />
      <div className="relative mt-5 overflow-x-auto" role="group" aria-label={`Ritmo de cada hora de producción: ${a.nombre} contra ${nombreRival}`}>
        <div className="relative flex h-[150px] min-w-full items-end gap-1" style={{ minWidth: `${horas.length * 34}px` }}>
          {[0.5, 1].map((f) => (
            <span key={f} className="pointer-events-none absolute inset-x-0 border-t" style={{ bottom: `${(f * 100) / 1.1}%`, borderColor: 'var(--v2-reja)' }} />
          ))}
          <span className="pointer-events-none absolute left-0 top-0 -translate-y-full text-[11px] tabular-nums text-muted-foreground">eje: hasta {dec1(max / 1.1)} pz/min</span>
          {horas.map((h, i) => (
            <button
              key={h.hora}
              type="button"
              onClick={() => setSel(sel === h.hora ? null : h.hora)}
              aria-pressed={sel === h.hora}
              aria-label={`${h.hora}ª hora: ${a.nombre} ${num(h.a)}, ${b.nombre} ${num(h.b)}`}
              className={`relative flex h-full min-w-0 flex-1 items-end justify-center gap-[3px] rounded-ctl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sel === h.hora ? 'bg-muted-foreground/[0.12]' : ''}`}
            >
              {([[h.a, h.parcialA, a.id], [h.b, h.parcialB, b.id]] as const).map(([v, parcial, id], j) => (
                v != null && (
                  <span
                    key={j}
                    className="duelo-barra-y w-[40%] max-w-[16px] rounded-t-[5px]"
                    style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: COLOR_EQUIPO[id], opacity: parcial ? 0.5 : 1, animationDelay: `${i * 30}ms` }}
                  />
                )
              ))}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1 text-[11px] tabular-nums text-muted-foreground" style={{ minWidth: `${horas.length * 34}px` }}>
          {horas.map((h) => <span key={h.hora} className="min-w-0 flex-1 text-center">{h.hora}ª</span>)}
        </div>
      </div>
      <p className="mt-2 min-h-[2.5rem] text-[13px] leading-snug tabular-nums text-muted-foreground" aria-live="polite">
        {elegida ? (
          <>
            <span className="font-medium text-foreground">{elegida.hora}ª hora</span> · {a.nombre} {num(elegida.a)}{elegida.parcialA ? ' (en curso)' : ''} · {b.nombre} {num(elegida.b)}{elegida.parcialB ? ' (no completó la hora)' : ''}
          </>
        ) : 'Toca una hora para ver los dos ritmos.'}
      </p>
    </div>
  )
}

// ── Tendencia semanal ────────────────────────────────────────────────────────

export function TendenciaSemanalV2({ semanas, a, b }: { semanas: PuntoSemana[]; a: LadoDuelo; b: LadoDuelo }) {
  const [sel, setSel] = useState<number | null>(null)
  const valores = semanas.flatMap((s) => EQUIPOS.map((e) => s.equipos[e]?.prom).filter((v): v is number => v != null))
  const lo = Math.min(...valores)
  const hi = Math.max(...valores)
  const margen = Math.max(1, (hi - lo) * 0.12)
  const piso = Math.max(0, lo - margen)
  const techo = hi + margen
  const n = semanas.length
  const X = (i: number) => ((i + 0.5) / n) * 100
  const Y = (v: number) => 100 - ((v - piso) / (techo - piso)) * 100
  const trazo = (e: EquipoId) => {
    let d = ''
    let abierto = false
    semanas.forEach((s, i) => {
      const v = s.equipos[e]?.prom
      if (v == null) { abierto = false; return }
      d += `${abierto ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)} ` // decimal-tecnico: coordenadas SVG
      abierto = true
    })
    return d.trim()
  }
  const lado = (e: EquipoId) => (e === a.id ? a : b)
  const elegida = sel != null ? semanas[sel] : null
  const horario = (h: 'dia' | 'noche' | 'mixto') => (h === 'dia' ? 'día' : h === 'noche' ? 'noche' : 'día y noche')
  return (
    <div className="mt-4">
      <Cabecera a={a} b={b} />
      <div className="relative mt-5 h-[170px]" role="img" aria-label={`Piezas por turno de ${a.nombre} y de ${b.nombre}, semana a semana`}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={100} y1={f * 100} y2={f * 100} stroke="var(--v2-reja)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {EQUIPOS.map((e) => (
            <path key={e} d={trazo(e)} fill="none" stroke={COLOR_EQUIPO[e]} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={e === 'rebolledo' ? '7 5' : undefined} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        <span className="pointer-events-none absolute left-0 top-0 -translate-y-full text-[11px] tabular-nums text-muted-foreground">eje: hasta {int(techo)} pz por turno</span>
        <span className="pointer-events-none absolute bottom-0 left-0 translate-y-full pt-5 text-[11px] tabular-nums text-muted-foreground">el eje parte en {int(piso)}</span>
        {semanas.map((s, i) => (
          <button
            key={s.lunes}
            type="button"
            onClick={() => setSel(sel === i ? null : i)}
            aria-pressed={sel === i}
            aria-label={`Semana del ${fechaCorta(s.lunes)}`}
            className={`absolute inset-y-0 -translate-x-1/2 rounded-ctl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${sel === i ? 'bg-muted-foreground/[0.12]' : ''}`}
            style={{ left: `${X(i)}%`, width: `${100 / n}%` }}
          >
            <span className="sr-only">Semana del {fechaCorta(s.lunes)}</span>
          </button>
        ))}
        {semanas.flatMap((s, i) => EQUIPOS.map((e) => {
          const p = s.equipos[e]
          if (!p) return null
          const hueco = p.horario === 'noche'
          return (
            <span
              key={`${s.lunes}${e}`}
              className="pointer-events-none absolute h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${X(i)}%`, top: `${Y(p.prom)}%`, background: hueco ? 'rgb(var(--card))' : COLOR_EQUIPO[e], border: `2px solid ${COLOR_EQUIPO[e]}` }}
            />
          )
        }))}
      </div>
      <div className="relative mt-7 flex text-[11px] tabular-nums text-muted-foreground">
        {semanas.map((s) => <span key={s.lunes} className="min-w-0 flex-1 text-center">{fechaCorta(s.lunes)}</span>)}
      </div>
      <p className="mt-2 min-h-[2.5rem] text-[13px] leading-snug tabular-nums text-muted-foreground" aria-live="polite">
        {elegida ? (
          <>
            <span className="font-medium text-foreground">Semana del {fechaCorta(elegida.lunes)}</span>
            {EQUIPOS.map((e) => {
              const p = elegida.equipos[e]
              return <span key={e}> · {lado(e).nombre} {p ? `${int(p.prom)} pz por turno (${p.turnos} ${p.turnos === 1 ? 'turno' : 'turnos'}, ${horario(p.horario)})` : 'sin turnos cerrados'}</span>
            })}
          </>
        ) : 'Toca una semana para ver los dos promedios.'}
      </p>
      <p className="text-[13px] leading-snug text-muted-foreground">Punto lleno: turnos de día. Punto hueco: turnos de noche. Cada semana un equipo hace el día y el otro la noche, por eso las líneas se cruzan.</p>
    </div>
  )
}

// ── Marcador por semana y por mes ────────────────────────────────────────────

export function PeriodoDueloV2({ duelos, hoyKey, nombreDe }: { duelos: TurnoDuelo[]; hoyKey: string; nombreDe: (e: EquipoId) => string }) {
  const [tipo, setTipo] = useState<PeriodoTipo>('semana')
  const [elegida, setElegida] = useState<string | null>(null)
  const claves = periodosDisponibles(duelos, hoyKey, tipo)
  const clave = elegida && claves.includes(elegida) ? elegida : claves[0]!
  const mp = marcadorDePeriodo(duelos, tipo, clave, hoyKey)
  const orden: EquipoId[] = mp.ganador === 'cardenas' ? ['cardenas', 'rebolledo'] : ['rebolledo', 'cardenas']
  const lider = mp.ganador && mp.ganador !== 'empate' ? mp.ganador : null
  const titulo = mp.ganador == null
    ? `${mp.etiqueta}: todavía sin turnos con duelo cerrado`
    : mp.ganador === 'empate'
      ? `${mp.etiqueta}: empate ${mp.puntos.rebolledo} – ${mp.puntos.cardenas}`
      : `${mp.etiqueta}: ${nombreDe(mp.ganador)} ${mp.puntos[mp.ganador]} – ${mp.puntos[mp.ganador === 'rebolledo' ? 'cardenas' : 'rebolledo']}`
  const etiquetaOpcion = (c: string) => {
    const m = marcadorDePeriodo([], tipo, c, hoyKey)
    return tipo === 'semana' ? `${m.etiqueta} · ${fechaCorta(m.inicio)} al ${fechaCorta(m.fin)}${m.vigente ? ' (actual)' : ''}` : `${m.etiqueta}${m.vigente ? ' (actual)' : ''}`
  }
  return (
    <div className="mt-4">
      <SegmentedControl
        ariaLabel="Período del marcador"
        value={tipo}
        onChange={(v) => { setTipo(v); setElegida(null) }}
        segments={[{ value: 'semana', label: 'Semana' }, { value: 'mes', label: 'Mes' }]}
      />
      <label className="mt-3 block">
        <span className="text-[13px] text-muted-foreground">{tipo === 'semana' ? 'Semana' : 'Mes calendario'}</span>
        <select
          className="tap-44 mt-1 w-full rounded-ctl bg-muted-foreground/[0.12] px-3 py-2 text-[15px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          value={clave}
          onChange={(e) => setElegida(e.target.value)}
        >
          {claves.map((c) => <option key={c} value={c}>{etiquetaOpcion(c)}</option>)}
        </select>
      </label>
      <div className="mt-4 text-[17px] font-semibold tabular-nums text-foreground" style={lider ? { color: COLOR_EQUIPO_TEXTO[lider] } : undefined}>{titulo}</div>
      <div className="mt-0.5 text-[13px] text-muted-foreground">{mp.vigente ? 'En curso: se actualiza al cerrar cada turno' : `Del ${fechaCorta(mp.inicio)} al ${fechaCorta(mp.fin)}`}</div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {orden.map((e) => (
          <div key={e} className="min-w-0 rounded-ctl bg-muted-foreground/[0.08] p-3">
            <div className="flex items-center gap-1.5 text-[15px] text-foreground"><Punto id={e} /><span className="truncate">{nombreDe(e)}</span></div>
            <div className="mt-1 flex items-baseline gap-1.5 tabular-nums">
              <span className="v2-cifra-chica font-semibold leading-none text-foreground">{mp.puntos[e]}</span>
              <span className="text-[13px] text-muted-foreground">pt</span>
            </div>
            <dl className="mt-2 space-y-0.5 text-[13px] tabular-nums text-muted-foreground">
              <div className="flex justify-between gap-2"><dt>Ganados</dt><dd className="text-foreground">{mp.ganados[e]}</dd></div>
              <div className="flex justify-between gap-2"><dt>Empatados</dt><dd className="text-foreground">{mp.empatados[e]}</dd></div>
              <div className="flex justify-between gap-2"><dt>Perdidos</dt><dd className="text-foreground">{mp.perdidos[e]}</dd></div>
              <div className="flex justify-between gap-2"><dt>Piezas por turno</dt><dd className="text-foreground">{mp.piezasProm[e] != null ? int(mp.piezasProm[e]!) : 'sin turnos'}</dd></div>
              <div className="flex justify-between gap-2"><dt>Turnos cerrados</dt><dd className="text-foreground">{mp.turnos[e]}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Resumen compacto para la columna del marcador en PC ──────────────────────

/** Semana y mes actuales y la racha, en tres líneas: lo que el marcador de la jornada lleva al lado en PC. */
export function ResumenCompactoV2({ duelos, hoyKey, rachas, nombreDe }: {
  duelos: TurnoDuelo[]
  hoyKey: string
  rachas: Record<EquipoId, { actual: number; mejor: number }>
  nombreDe: (e: EquipoId) => string
}) {
  const filas = (['semana', 'mes'] as const).map((tipo) => marcadorDePeriodo(duelos, tipo, periodosDisponibles(duelos, hoyKey, tipo)[0]!, hoyKey))
  const quien = (e: EquipoId, pt: number) => (
    <span style={{ color: COLOR_EQUIPO_TEXTO[e] }}>{nombreDe(e)} {pt}</span>
  )
  const lider = EQUIPOS.reduce<EquipoId | null>((m, e) => (rachas[e].actual > (m ? rachas[m].actual : 0) ? e : m), null)
  return (
    <div className="mt-4 text-[14px]">
      {filas.map((mp) => {
        const [x, y]: EquipoId[] = mp.puntos.cardenas >= mp.puntos.rebolledo ? ['cardenas', 'rebolledo'] : ['rebolledo', 'cardenas']
        return (
          <div key={mp.tipo} className="flex items-baseline justify-between gap-3 border-t py-2" style={{ borderColor: 'var(--v2-reja)' }}>
            <span className="text-foreground">{mp.etiqueta}{mp.vigente ? ' (actual)' : ''}</span>
            {mp.ganador == null
              ? <span className="text-muted-foreground">sin jornadas cerradas</span>
              : <span className="tabular-nums">{quien(x!, mp.puntos[x!])} – {quien(y!, mp.puntos[y!])}</span>}
          </div>
        )
      })}
      <div className="flex items-baseline justify-between gap-3 border-t py-2" style={{ borderColor: 'var(--v2-reja)' }}>
        <span className="text-foreground">Racha</span>
        {lider
          ? <span className="tabular-nums" style={{ color: COLOR_EQUIPO_TEXTO[lider] }}>{nombreDe(lider)} {rachas[lider].actual} {rachas[lider].actual === 1 ? 'jornada' : 'jornadas'}</span>
          : <span className="text-muted-foreground">sin racha en curso</span>}
      </div>
    </div>
  )
}
