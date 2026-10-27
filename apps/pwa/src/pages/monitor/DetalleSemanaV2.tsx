/**
 * Detalle de UNA semana de «De quién fue la pérdida» (monitor v2, pestaña
 * Análisis). Mezcla de las dos opciones del mockup, como pidió Orel (27-10):
 *
 *  · Base «Informe de semana»: tira para elegir semana, resumen (Mantención
 *    contra la semana anterior, por turno) y pestañas Turnos · Causas · Equipos,
 *    más la tendencia al pie.
 *  · Turnos = la GRILLA día × turno de la opción «Matriz» (mapa de calor suave
 *    con los minutos de Mantención); tocar una celda abre ESE turno.
 *  · Causas = la tabla limpia de «Matriz» (semana · anterior · Δ); tocar una
 *    causa despliega las paradas en que ocurrió, con hora de inicio y de fin.
 *
 * Color = dueño (naranja Mantención · equipos, celeste Externo, gris Sin
 * imputar), siempre con el mismo punto de 8 px; la categoría del árbol de
 * imputación va en texto secundario al lado — sutil y en el mismo lugar en
 * todas las pestañas.
 *
 * ⚠ Cifras: todo en minutos de LÍNEA (ver `repartoSemanal`). Las horas de las
 * paradas solo existen en turnos rearmados desde el 27-10-2026; antes dice
 * «sin dato», no se reconstruyen a ojo.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { dec1 } from '@/utils/formatoNumeros'
import { DUENO_UI } from './duenoUi'
import { numeroDeTurno } from './aporteHistorico'
import { DUENOS_REPARTO, lunesDe, type CausaReparto, type DuenoReparto, type ParadaReparto, type SemanaReparto, type TurnoReparto } from './repartoSemanal'

// ── Formato ──────────────────────────────────────────────────────────────────

const int = (n: number) => Math.round(n).toLocaleString('es-CL')
const horas = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} min` : `${Math.round(min)} min`)
const semanaCorta = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
const diaDe = (k: string) => new Date(`${k}T12:00:00Z`).getUTCDay()
const diaCorto = (k: string) => `${DIAS[diaDe(k)]} ${Number(k.slice(8, 10))}`
/** Variación porcentual; null si no hay base. */
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)

const RELLENO: Record<DuenoReparto, string> = {
  mantencion: 'var(--v2-mant)',
  externo: 'var(--v2-ext)',
  'sin-imputar': 'var(--v2-gris)',
}

/** Hoy en hora de planta (Chile), para saber cuál semana sigue abierta. */
function hoyPlanta(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** Rótulo corto del turno para la grilla: Día, Noche, T1… */
function etiquetaTurno(shiftId: string): { clave: string; corto: string; orden: number } {
  const k = numeroDeTurno(shiftId) ?? shiftId
  const mapa: Record<string, [string, number]> = {
    'turno dia': ['Día', 0], 'turno manana': ['Mañana', 0], 'turno tarde': ['Tarde', 1], 'turno noche': ['Noche', 2],
  }
  const m = mapa[k]
  if (m) return { clave: k, corto: m[0], orden: m[1] }
  const n = /^turno (\d+)$/.exec(k)
  if (n) return { clave: k, corto: `T${n[1]}`, orden: 10 + Number(n[1]) }
  return { clave: k, corto: shiftId.slice(0, 6), orden: 99 }
}

const totalMin = (s: { min: Record<DuenoReparto, number> }) => DUENOS_REPARTO.reduce((a, d) => a + s.min[d], 0)

// ── Piezas chicas ────────────────────────────────────────────────────────────

const Punto = ({ dueno }: { dueno: DuenoReparto }) => (
  <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: RELLENO[dueno] }} aria-hidden />
)

function Bloque({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[26px] bg-card px-4 py-3.5 ${className}`}>{children}</div>
}

function Titulo({ children }: { children: ReactNode }) {
  return <h3 className="mx-1 mb-1.5 mt-5 text-[15px] font-semibold text-muted-foreground">{children}</h3>
}

/** ▼/▲ con el tono que corresponde a QUIÉN es la pérdida. */
function Delta({ v, dueno, sufijo = '', neutro = false, decimal = false }: { v: number | null; dueno?: DuenoReparto; sufijo?: string; neutro?: boolean; decimal?: boolean }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted-foreground">—</span>
  const r = decimal ? Math.round(v * 10) / 10 : Math.round(v)
  if (r === 0) return <span className="text-muted-foreground">igual{sufijo}</span>
  const color = neutro || !dueno || dueno === 'externo'
    ? undefined
    : dueno === 'mantencion'
      ? (r < 0 ? 'var(--v2-bien)' : 'var(--v2-mal-texto)')
      : (r > 0 ? 'var(--v2-atento-texto)' : undefined)
  return (
    <span className={`whitespace-nowrap ${color ? 'font-medium' : 'text-muted-foreground'}`} style={color ? { color } : undefined}>
      {r < 0 ? '▼' : '▲'} {decimal ? dec1(Math.abs(r)) : int(Math.abs(r))}{sufijo}
    </span>
  )
}

/** Barra fina apilada por dueño (los tres suman el total perdido). */
function BarraDuenos({ min }: { min: Record<DuenoReparto, number> }) {
  const t = totalMin({ min })
  if (!(t > 0)) return null
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: 'var(--v2-reja)' }} aria-hidden>
      {DUENOS_REPARTO.map((d) => min[d] > 0 && (
        <i key={d} className="block h-full" style={{ width: `${(min[d] / t) * 100}%`, background: RELLENO[d] }} />
      ))}
    </div>
  )
}

/** Equipo y categoría del árbol, en texto secundario: igual en todas las pestañas. */
function marcaDe(c: Pick<CausaReparto, 'causa' | 'dueno' | 'categoria' | 'equipo'>): string | null {
  /* El equipo solo si la causa no lo nombra ya («Baader 200/CUCHILLERIA»). */
  const plano = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
  const equipo = c.equipo && !plano(c.causa).includes(plano(c.equipo)) ? c.equipo : null
  return [equipo, c.categoria ?? (c.dueno === 'sin-imputar' ? 'Sin clasificar' : null)].filter(Boolean).join(' · ') || null
}

/** «N veces · ≈pz · equipo · categoría». */
const pieDeCausa = (c: CausaReparto) => [`${c.count} ${c.count === 1 ? 'vez' : 'veces'}`, `≈${int(c.pz)} pz`, marcaDe(c)].filter(Boolean).join(' · ')

function Leyenda() {
  return (
    <div className="mx-1 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      {DUENOS_REPARTO.map((d) => (
        <span key={d} className="inline-flex items-center gap-1.5"><Punto dueno={d} />{DUENO_UI[d].corto}</span>
      ))}
      <span>En gris: equipo y categoría de imputación</span>
    </div>
  )
}

function Segmentado<T extends string>({ valor, opciones, onCambio, etiqueta }: {
  valor: T; opciones: Array<{ v: T; label: string }>; onCambio: (v: T) => void; etiqueta: string
}) {
  return (
    <div role="tablist" aria-label={etiqueta} className="mt-5 grid rounded-full p-0.5" style={{ gridTemplateColumns: `repeat(${opciones.length}, 1fr)`, background: 'var(--v2-reja)' }}>
      {opciones.map((o) => (
        <button
          key={o.v} type="button" role="tab" aria-selected={valor === o.v} onClick={() => onCambio(o.v)}
          className={`min-h-[44px] rounded-full text-[15px] transition-colors ${valor === o.v ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Tira de semanas ──────────────────────────────────────────────────────────

function Tira({ semanas, sel, enCurso, onSel }: { semanas: SemanaReparto[]; sel: number; enCurso: string | null; onSel: (i: number) => void }) {
  const porTurno = (s: SemanaReparto, d: DuenoReparto) => (s.turnos > 0 ? s.min[d] / s.turnos : 0)
  const max = Math.max(1, ...semanas.map((s) => DUENOS_REPARTO.reduce((a, d) => a + porTurno(s, d), 0)))
  return (
    <div role="group" aria-label="Elegir semana" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${semanas.length}, minmax(0, 1fr))` }}>
      {semanas.map((s, i) => (
        <button
          key={s.semana} type="button" aria-pressed={i === sel} onClick={() => onSel(i)}
          aria-label={`Semana del ${semanaCorta(s.semana)}${s.semana === enCurso ? ', en curso' : ''}`}
          className={`flex min-h-[44px] flex-col items-center gap-1 rounded-[14px] px-1 pb-1 pt-1.5 ${i === sel ? 'bg-card' : ''}`}
          style={i === sel ? { outline: '1.5px solid var(--v2-acento)' } : undefined}
        >
          <span className="flex h-14 w-5 flex-col-reverse overflow-hidden rounded-[6px]" style={{ background: 'var(--v2-reja)' }} aria-hidden>
            {DUENOS_REPARTO.map((d) => <i key={d} className="block" style={{ height: `${(porTurno(s, d) / max) * 100}%`, background: RELLENO[d] }} />)}
          </span>
          <span className={`text-[12px] tabular-nums ${i === sel ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
            {semanaCorta(s.semana)}{s.semana === enCurso ? ' ·' : ''}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Variación por turno contra la semana anterior. En % solo cuando la base es
 * de verdad (≥ 3 min por turno): «▲ 844 %» sobre 0,3 min asusta y no dice
 * nada; ahí va la diferencia en minutos por turno.
 */
function VarTurno({ a, b, dueno, largo = false }: { a: number; b: number; dueno: DuenoReparto; largo?: boolean }) {
  return b >= 3
    ? <Delta v={pct(a, b)} dueno={dueno} sufijo={largo ? ' % por turno' : ' %'} />
    : <Delta v={a - b} dueno={dueno} decimal sufijo={largo ? ' min por turno' : ' min/t'} />
}

// ── Resumen ──────────────────────────────────────────────────────────────────

function Resumen({ s, ant, enCurso }: { s: SemanaReparto; ant: SemanaReparto | null; enCurso: boolean }) {
  const pt = (x: SemanaReparto, d: DuenoReparto) => (x.turnos > 0 ? x.min[d] / x.turnos : 0)
  const comparable = !enCurso && ant != null && ant.turnos > 0
  const otra = (d: 'externo' | 'sin-imputar') => (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground"><Punto dueno={d} />{d === 'externo' ? 'Externo' : 'Sin imputar'}</div>
      <div className="text-[15px] font-semibold tabular-nums">{horas(s.min[d])}</div>
      {comparable && <div className="text-[13px] tabular-nums"><VarTurno a={pt(s, d)} b={pt(ant, d)} dueno={d} /></div>}
    </div>
  )
  const pzTurno = (x: SemanaReparto) => (x.turnos > 0 ? x.piezas / x.turnos : 0)
  return (
    <Bloque className="mt-3">
      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Punto dueno="mantencion" />Mantención · equipos{enCurso ? ' · semana en curso' : ''}
      </div>
      <div className="text-[28px] font-bold leading-tight tabular-nums">{horas(s.min.mantencion)}</div>
      <div className="text-[13px] tabular-nums text-muted-foreground">
        {dec1(pt(s, 'mantencion'))} min por turno · ≈{int(s.pz.mantencion)} pz · {s.turnos} {s.turnos === 1 ? 'turno' : 'turnos'}
      </div>
      <div className="mt-0.5 text-[15px] tabular-nums">
        {enCurso
          ? <span className="text-muted-foreground">Semana en curso: sin comparación hasta cerrar</span>
          : comparable
            ? <><VarTurno a={pt(s, 'mantencion')} b={pt(ant, 'mantencion')} dueno="mantencion" largo /> <span className="text-muted-foreground">vs semana del {semanaCorta(ant.semana)}</span></>
            : <span className="text-muted-foreground">Sin semana anterior para comparar</span>}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 border-t pt-3" style={{ borderColor: 'var(--v2-reja)' }}>
        {otra('externo')}
        {otra('sin-imputar')}
        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">Producción</div>
          <div className="text-[15px] font-semibold tabular-nums">{int(s.piezas)} pz</div>
          {comparable && <div className="text-[13px] tabular-nums"><Delta v={pct(pzTurno(s), pzTurno(ant))} neutro sufijo=" %" /></div>}
        </div>
      </div>
      {comparable && <p className="mt-2 text-[12px] text-muted-foreground">Variaciones por turno, para comparar parejo semanas con distinta cantidad de turnos. Con menos de 3 min por turno se muestra la diferencia en minutos (min/t).</p>}
    </Bloque>
  )
}

// ── Detalle de un turno (celda de la grilla) ─────────────────────────────────

function FilaParada({ p, contexto }: { p: ParadaReparto; contexto?: string }) {
  return (
    <li className="flex items-baseline gap-2 py-1.5 text-[13px] tabular-nums">
      <Punto dueno={p.dueno} />
      <span className="shrink-0 font-medium text-foreground">{p.inicio}–{p.fin}</span>
      <span className="shrink-0 text-muted-foreground">{horas(p.seg / 60)}</span>
      <span className="min-w-0 truncate text-muted-foreground" title={[contexto, p.causa, p.maquinas.join(', ')].filter(Boolean).join(' · ')}>
        {[contexto, p.maquinas.join(', ')].filter(Boolean).join(' · ') || ' '}
      </span>
    </li>
  )
}

function DetalleTurno({ turnos }: { turnos: TurnoReparto[] }) {
  return (
    <>
      {turnos.map((t) => {
        const tot = totalMin(t)
        return (
          <Bloque key={t.shiftDocId} className="mt-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[15px] font-semibold">{diaCorto(t.dateKey)} · {etiquetaTurno(t.shiftId).corto}</span>
              <span className="text-[13px] tabular-nums text-muted-foreground">{int(t.piezas)} pz</span>
            </div>
            <div className="mt-2"><BarraDuenos min={t.min} /></div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[13px] tabular-nums text-muted-foreground">
              {DUENOS_REPARTO.map((d) => <span key={d} className="inline-flex items-center gap-1.5"><Punto dueno={d} />{horas(t.min[d])}</span>)}
              <span>de {horas(tot)}</span>
            </div>
            {t.causas.length > 0 ? (
              <ul className="mt-2 divide-y" style={{ borderColor: 'var(--v2-reja)' }}>
                {t.causas.map((c) => (
                  <li key={c.causa} className="py-2" style={{ borderColor: 'var(--v2-reja)' }}>
                    <div className="flex items-baseline gap-2">
                      <Punto dueno={c.dueno} />
                      <span className="min-w-0 flex-1 text-[15px]">{c.causa}</span>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums">{horas(c.min)}</span>
                    </div>
                    <div className="ml-4 text-[13px] tabular-nums text-muted-foreground">
                      {pieDeCausa(c)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[13px] text-muted-foreground">Sin pérdidas recuperables registradas.</p>}
            <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--v2-reja)' }}>
              <div className="text-[13px] font-medium text-muted-foreground">Paradas en el reloj</div>
              {t.paradas == null
                ? <p className="text-[13px] text-muted-foreground">Sin dato: las horas se registran en los turnos desde el 27-10.</p>
                : t.paradas.length === 0
                  ? <p className="text-[13px] text-muted-foreground">Sin paradas recuperables.</p>
                  : <ul>{t.paradas.map((p, i) => <FilaParada key={i} p={p} contexto={p.causa} />)}</ul>}
            </div>
          </Bloque>
        )
      })}
    </>
  )
}

// ── Pestaña Turnos: grilla día × turno ───────────────────────────────────────

function PestanaTurnos({ s }: { s: SemanaReparto }) {
  const [celda, setCelda] = useState<string | null>(null)
  const filas = useMemo(() => {
    const m = new Map<string, { corto: string; orden: number }>()
    for (const t of s.detalle) { const e = etiquetaTurno(t.shiftId); m.set(e.clave, { corto: e.corto, orden: e.orden }) }
    return [...m.entries()].sort((a, b) => a[1].orden - b[1].orden)
  }, [s])
  /* Lunes a sábado siempre; el domingo solo si se trabajó. */
  const dias = useMemo(() => {
    const base = [1, 2, 3, 4, 5, 6]
    return s.detalle.some((t) => diaDe(t.dateKey) === 0) ? [...base, 0] : base
  }, [s])
  const fechaDe = (dia: number) => {
    const d = new Date(`${s.semana}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + ((dia + 6) % 7))
    return d.toISOString().slice(0, 10)
  }
  const turnosEn = (clave: string, dia: number) => s.detalle.filter((t) => etiquetaTurno(t.shiftId).clave === clave && t.dateKey === fechaDe(dia))
  const max = Math.max(1, ...s.detalle.map((t) => t.min.mantencion))
  const sel = celda ? s.detalle.filter((t) => `${etiquetaTurno(t.shiftId).clave}|${t.dateKey}` === celda) : []

  // La fila que concentra más Mantención, si hay más de una fila.
  const concentra = (() => {
    if (filas.length < 2 || !(s.min.mantencion > 0)) return null
    const porFila = filas.map(([k, f]) => ({ f, min: s.detalle.filter((t) => etiquetaTurno(t.shiftId).clave === k).reduce((a, t) => a + t.min.mantencion, 0) }))
    const top = porFila.reduce((a, b) => (b.min > a.min ? b : a))
    const share = top.min / s.min.mantencion
    return share >= 0.55 ? `${top.f.corto === 'Día' ? 'Los días' : top.f.corto === 'Noche' ? 'Las noches' : `El turno ${top.f.corto}`} ${top.f.corto === 'Día' || top.f.corto === 'Noche' ? 'concentran' : 'concentra'} ${horas(top.min)} de ${horas(s.min.mantencion)} (${Math.round(share * 100)} %).` : null
  })()

  return (
    <>
      <Bloque className="mt-3 px-3">
        <div className="mb-1 flex items-center gap-1.5 text-[13px] text-muted-foreground"><Punto dueno="mantencion" />Mantención · equipos, min de línea por turno</div>
        <div className="grid gap-1" style={{ gridTemplateColumns: `40px repeat(${dias.length}, minmax(0, 1fr))` }}>
          <span />
          {dias.map((d) => <span key={d} className="text-center text-[12px] text-muted-foreground">{DIAS[d]}</span>)}
          {filas.map(([clave, f]) => (
            <FilaGrilla key={clave} etiqueta={f.corto}>
              {dias.map((d) => {
                const ts = turnosEn(clave, d)
                const k = `${clave}|${fechaDe(d)}`
                if (ts.length === 0) {
                  return <span key={d} className="flex h-[46px] items-center justify-center rounded-[10px] border border-dashed text-[12px] text-muted-foreground" style={{ borderColor: 'var(--v2-reja)' }} aria-label={`${DIAS[d]} ${f.corto}: sin turno`}>—</span>
                }
                const v = ts.reduce((a, t) => a + t.min.mantencion, 0)
                const k01 = v / max
                const activo = celda === k
                return (
                  <button
                    key={d} type="button" aria-pressed={activo} onClick={() => setCelda(activo ? null : k)}
                    aria-label={`${DIAS[d]} ${f.corto}: ${horas(v)} de Mantención`}
                    className="flex h-[46px] min-w-0 flex-col items-center justify-center rounded-[10px] text-[13px] font-semibold leading-tight tabular-nums text-foreground"
                    style={{
                      background: `color-mix(in srgb, var(--v2-mant) ${Math.round(6 + k01 * 40)}%, transparent)`,
                      outline: activo ? '2px solid var(--v2-acento)' : undefined, outlineOffset: activo ? 1 : undefined,
                    }}
                  >
                    {int(v)}
                  </button>
                )
              })}
            </FilaGrilla>
          ))}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">
          {concentra ?? 'Más color, más minutos de Mantención.'} Toca un turno para ver su detalle.
        </p>
      </Bloque>
      {sel.length > 0 && <DetalleTurno turnos={sel} />}
    </>
  )
}

function FilaGrilla({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <>
      <span className="self-center text-[12px] text-muted-foreground">{etiqueta}</span>
      {children}
    </>
  )
}

// ── Pestaña Causas: tabla semana · anterior · Δ ──────────────────────────────

function PestanaCausas({ s, ant }: { s: SemanaReparto; ant: SemanaReparto | null }) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const antDe = (causa: string, d: DuenoReparto) => ant?.causas[d].find((c) => c.causa === causa) ?? null
  const sinHoras = s.detalle.filter((t) => t.paradas == null).length
  const cols = 'grid grid-cols-[minmax(0,1fr)_40px_40px_48px] items-baseline gap-x-1.5'
  return (
    <Bloque className="mt-3">
      <div className={`${cols} pb-1.5 text-[12px] font-semibold text-muted-foreground`}>
        <span>Causa · min de línea</span>
        <span className="text-right">{semanaCorta(s.semana)}</span>
        <span className="text-right">{ant ? semanaCorta(ant.semana) : 'ant.'}</span>
        <span className="text-right">Δ</span>
      </div>
      {DUENOS_REPARTO.map((d) => s.causas[d].length > 0 && (
        <div key={d}>
          <div className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"><Punto dueno={d} />{DUENO_UI[d].corto} · {horas(s.min[d])}</div>
          {s.causas[d].map((c) => {
            const a = antDe(c.causa, d)
            const abiertaEsta = abierta === c.causa
            const paradas = s.detalle.flatMap((t) => (t.paradas ?? []).filter((p) => p.causa === c.causa).map((p) => ({ p, t })))
            return (
              <div key={c.causa} className="border-t" style={{ borderColor: 'var(--v2-reja)' }}>
                <button type="button" aria-expanded={abiertaEsta} onClick={() => setAbierta(abiertaEsta ? null : c.causa)} className={`${cols} min-h-[44px] w-full py-2 text-left`}>
                  <span className="flex min-w-0 items-baseline gap-1.5 text-[15px]"><Punto dueno={d} /><span className="min-w-0 break-words">{c.causa}</span></span>
                  <span className="text-right text-[15px] font-semibold tabular-nums">{int(c.min)}</span>
                  <span className="text-right text-[15px] tabular-nums text-muted-foreground">{a ? int(a.min) : ant ? '0' : '—'}</span>
                  <span className="text-right text-[13px] tabular-nums">{ant ? <Delta v={c.min - (a?.min ?? 0)} dueno={d} /> : <span className="text-muted-foreground">—</span>}</span>
                  <span className="col-span-4 ml-3.5 text-[12px] tabular-nums text-muted-foreground">{pieDeCausa(c)}</span>
                </button>
                {abiertaEsta && (
                  <div className="mb-2 ml-3.5 rounded-[14px] px-3 py-2" style={{ background: 'var(--v2-reja)' }}>
                    <div className="text-[13px] font-medium text-muted-foreground">Paradas en que ocurrió</div>
                    {paradas.length > 0
                      ? <ul>{paradas.map(({ p, t }, i) => <FilaParada key={i} p={p} contexto={`${diaCorto(t.dateKey)} · ${etiquetaTurno(t.shiftId).corto}`} />)}</ul>
                      : <p className="text-[13px] text-muted-foreground">Sin dato de horas para esta causa en la semana.</p>}
                    {sinHoras > 0 && paradas.length > 0 && (
                      <p className="text-[12px] text-muted-foreground">{sinHoras} {sinHoras === 1 ? 'turno' : 'turnos'} de la semana sin dato de horas (anteriores al 27-10).</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
      {DUENOS_REPARTO.every((d) => s.causas[d].length === 0) && <p className="text-[13px] text-muted-foreground">Sin pérdidas recuperables registradas.</p>}
    </Bloque>
  )
}

// ── Pestaña Equipos ──────────────────────────────────────────────────────────

/** Minutos de Mantención por equipo en una semana. */
function porEquipo(s: SemanaReparto): Map<string, { min: number; pz: number; count: number; causas: CausaReparto[] }> {
  const m = new Map<string, { min: number; pz: number; count: number; causas: CausaReparto[] }>()
  for (const c of s.causas.mantencion) {
    const k = c.equipo ?? c.causa
    const e = m.get(k) ?? { min: 0, pz: 0, count: 0, causas: [] }
    e.min += c.min; e.pz += c.pz; e.count += c.count; e.causas.push(c)
    m.set(k, e)
  }
  return m
}

/**
 * El desglose de un equipo en sus componentes: «Cuchilleria ventral 71 ·
 * rascador 11». Sin el prefijo del equipo (ya está en el título) y juntando
 * las variantes de texto que caen en lo mismo («Equipo Auxiliar / GEA» y
 * «Equipo Auxiliar/GEA»). Si queda una sola parte igual al equipo, nada.
 */
function subcausas(causas: CausaReparto[], equipo: string): string[] {
  const m = new Map<string, number>()
  for (const c of causas) {
    const corto = (c.causa.split('/').pop() ?? c.causa).trim().toLocaleLowerCase('es-CL')
    m.set(corto, (m.get(corto) ?? 0) + c.min)
  }
  const partes = [...m.entries()].sort((a, b) => b[1] - a[1])
  if (partes.length === 1 && partes[0]![0] === equipo.toLocaleLowerCase('es-CL')) return []
  return partes.map(([n, v], i) => `${i === 0 ? n.charAt(0).toLocaleUpperCase('es-CL') + n.slice(1) : n} ${int(v)}`)
}

function Chispa({ serie, sel }: { serie: number[]; sel: number }) {
  const W = 72, H = 24
  const mx = Math.max(1, ...serie) * 1.1
  const x = (i: number) => (serie.length > 1 ? 4 + (i * (W - 8)) / (serie.length - 1) : W / 2)
  const y = (v: number) => H - 3 - ((H - 6) * v) / mx
  const sube = sel > 0 && serie[sel]! > serie[sel - 1]!
  const color = sube ? 'var(--v2-mal)' : 'var(--v2-bien)'
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden className="shrink-0">
      <polyline points={serie.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={x(sel)} cy={y(serie[sel] ?? 0)} r={3} fill={color} />
    </svg>
  )
}

function PestanaEquipos({ semanas, sel }: { semanas: SemanaReparto[]; sel: number }) {
  const s = semanas[sel]!
  const ant = sel > 0 ? semanas[sel - 1]! : null
  const mapas = useMemo(() => semanas.map(porEquipo), [semanas])
  const actual = mapas[sel]!
  const filas = [...actual.entries()].sort((a, b) => b[1].min - a[1].min)

  /* Paradas de Mantención por máquina (solo turnos con dato): dice CUÁL
     Baader para. Se cuentan paradas, no minutos: el minuto de máquina no es
     el de línea y mezclarlos rompería que las cifras cuadren. */
  const porMaquina = new Map<string, number>()
  let conDato = 0
  for (const t of s.detalle) {
    if (!t.paradas) continue
    conDato++
    for (const p of t.paradas) if (p.dueno === 'mantencion') for (const n of p.maquinas) porMaquina.set(n, (porMaquina.get(n) ?? 0) + 1)
  }
  const maquinas = [...porMaquina.entries()].sort((a, b) => b[1] - a[1])

  return (
    <>
      <Bloque className="mt-3">
        {filas.length === 0 && <p className="text-[13px] text-muted-foreground">Sin paradas de Mantención esta semana.</p>}
        <ul className="divide-y" style={{ borderColor: 'var(--v2-reja)' }}>
          {filas.map(([k, e]) => {
            const prev = ant ? mapas[sel - 1]!.get(k)?.min ?? 0 : null
            return (
              <li key={k} className="py-2.5" style={{ borderColor: 'var(--v2-reja)' }}>
                <div className="flex items-baseline gap-2">
                  <Punto dueno="mantencion" />
                  <span className="min-w-0 flex-1 text-[15px] font-semibold">{k}</span>
                  <span className="shrink-0 text-right text-[15px] font-semibold tabular-nums">{horas(e.min)}</span>
                </div>
                <div className="ml-4 mt-0.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 text-[13px] tabular-nums text-muted-foreground">
                    {e.count} {e.count === 1 ? 'parada' : 'paradas'} · ≈{int(e.pz)} pz
                    {prev != null && <> · <Delta v={e.min - prev} dueno="mantencion" sufijo=" min" /></>}
                  </span>
                  <Chispa serie={mapas.map((m) => m.get(k)?.min ?? 0)} sel={sel} />
                </div>
                {(() => {
                  const partes = subcausas(e.causas, k)
                  return partes.length > 0 && <div className="ml-4 text-[13px] tabular-nums text-muted-foreground">{partes.join(' · ')}</div>
                })()}
              </li>
            )
          })}
        </ul>
        {filas.length > 0 && <p className="mt-2 text-[12px] text-muted-foreground">Minutos de línea. La curva: el mismo equipo semana a semana.</p>}
      </Bloque>
      {maquinas.length > 1 && (
        <>
          <Titulo>Paradas de Mantención por máquina</Titulo>
          <Bloque>
            <ul className="divide-y" style={{ borderColor: 'var(--v2-reja)' }}>
              {maquinas.map(([n, c]) => (
                <li key={n} className="flex items-baseline justify-between py-2 text-[15px]" style={{ borderColor: 'var(--v2-reja)' }}>
                  <span>{n}</span><span className="font-semibold tabular-nums">{c} {c === 1 ? 'parada' : 'paradas'}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[12px] text-muted-foreground">En {conDato} de {s.turnos} turnos con dato de máquina. Una parada que tomó dos máquinas cuenta en ambas.</p>
          </Bloque>
        </>
      )}
    </>
  )
}

// ── Tendencia ────────────────────────────────────────────────────────────────

function Tendencia({ semanas, sel, enCurso }: { semanas: SemanaReparto[]; sel: number; enCurso: string | null }) {
  if (semanas.length < 2) return null
  const v = semanas.map((s) => (s.turnos > 0 ? s.min.mantencion / s.turnos : 0))
  const W = 320, H = 100, x0 = 26, x1 = W - 14, y0 = 18, y1 = H - 22
  const mx = Math.max(10, ...v) * 1.15
  const X = (i: number) => x0 + ((x1 - x0) * i) / (v.length - 1)
  const Y = (y: number) => y1 - ((y1 - y0) * y) / mx
  const ultimaAbierta = semanas[semanas.length - 1]!.semana === enCurso
  const cerradas = ultimaAbierta ? v.length - 1 : v.length
  const pts = v.map((y, i) => `${X(i)},${Y(y)}`)
  const guias = [0, Math.round(mx / 2)]
  return (
    <>
      <Titulo>Tendencia · Mantención, min por turno</Titulo>
      <Bloque className="px-3">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Minutos de Mantención por turno: ${v.map((y, i) => `semana ${semanaCorta(semanas[i]!.semana)} ${dec1(y)}`).join('; ')}`}>
          {guias.map((g) => (
            <g key={g}>
              <line x1={x0} x2={x1} y1={Y(g)} y2={Y(g)} stroke="var(--v2-reja)" strokeWidth={1} />
              <text x={0} y={Y(g) + 4} className="fill-muted-foreground" fontSize={11}>{g}</text>
            </g>
          ))}
          {cerradas >= 2 && <polyline points={pts.slice(0, cerradas).join(' ')} fill="none" stroke="var(--v2-acento)" strokeWidth={2.5} strokeLinejoin="round" />}
          {ultimaAbierta && <polyline points={pts.slice(-2).join(' ')} fill="none" stroke="var(--v2-acento)" strokeWidth={2} strokeDasharray="4 4" />}
          {v.map((y, i) => (
            <g key={i}>
              <circle cx={X(i)} cy={Y(y)} r={i === sel ? 5 : 3.5} fill={i === sel ? 'var(--v2-acento)' : 'rgb(var(--card))'} stroke="var(--v2-acento)" strokeWidth={2} />
              <text x={X(i)} y={H - 4} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>{semanaCorta(semanas[i]!.semana)}</text>
              <text x={X(i)} y={Y(y) - 9} textAnchor="middle" className="fill-foreground" fontSize={11} fontWeight={600}>{dec1(y)}</text>
            </g>
          ))}
        </svg>
        <p className="text-[12px] text-muted-foreground">
          {ultimaAbierta ? 'La punteada es la semana en curso, todavía incompleta.' : 'Semanas cerradas.'} Eje en min de línea por turno, desde 0.
        </p>
      </Bloque>
    </>
  )
}

// ── Hoja completa ────────────────────────────────────────────────────────────

type Pestana = 'turnos' | 'causas' | 'equipos'

export function DetalleSemanaV2({ semanas, hoy }: { semanas: SemanaReparto[]; hoy?: string | null }) {
  const enCurso = lunesDe(hoy ?? hoyPlanta())
  const enCursoKey = semanas.some((s) => s.semana === enCurso) ? enCurso : null
  /* Por defecto la última semana CERRADA: la en curso no se compara todavía. */
  const porDefecto = semanas.length > 1 && semanas[semanas.length - 1]!.semana === enCursoKey ? semanas.length - 2 : semanas.length - 1
  const [sel, setSel] = useState(porDefecto)
  const [pestana, setPestana] = useState<Pestana>('turnos')
  if (semanas.length === 0) return <p className="mx-1 text-[15px] text-muted-foreground">Todavía no hay turnos con desglose de pérdidas.</p>
  const i = Math.min(Math.max(0, sel), semanas.length - 1)
  const s = semanas[i]!
  const ant = i > 0 ? semanas[i - 1]! : null
  const abierta = s.semana === enCursoKey
  return (
    <div className="px-1">
      <div className="mx-1 mb-2">
        <div className="text-[17px] font-semibold">Semana del {semanaCorta(s.semana)}</div>
        <div className="text-[13px] tabular-nums text-muted-foreground">{s.turnos} {s.turnos === 1 ? 'turno' : 'turnos'} · {int(s.piezas)} pz{abierta ? ' · sin el turno en curso' : ''}</div>
      </div>
      <Tira semanas={semanas} sel={i} enCurso={enCursoKey} onSel={setSel} />
      <Resumen s={s} ant={ant} enCurso={abierta} />
      <Segmentado
        etiqueta="Ver la semana por" valor={pestana} onCambio={setPestana}
        opciones={[{ v: 'turnos', label: 'Turnos' }, { v: 'causas', label: 'Causas' }, { v: 'equipos', label: 'Equipos' }]}
      />
      <Leyenda />
      {pestana === 'turnos' && <PestanaTurnos key={s.semana} s={s} />}
      {pestana === 'causas' && <PestanaCausas key={s.semana} s={s} ant={ant} />}
      {pestana === 'equipos' && <PestanaEquipos semanas={semanas} sel={i} />}
      <Tendencia semanas={semanas} sel={i} enCurso={enCursoKey} />
    </div>
  )
}
