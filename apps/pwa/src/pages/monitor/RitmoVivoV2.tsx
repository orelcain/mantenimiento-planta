/**
 * Lo que vive detrás de «Ritmo en vivo» en «El turno»: el detalle de «Ampliar» del gráfico y la banda de parada en curso.
 * La tarjeta exprés de 15 min que había acá la reemplazó el gráfico unido (`GraficoRitmoVivo`, opción A «cinta» del 28-10).
 *
 * AMPLIADO (botón «Ampliar» del gráfico): el selector Línea · Ev 1 · Ev 2 · Ev 3 (la suma o UNA Baader contra SU esperado,
 * `serieMinuto.maquinas[].esperado`), el último minuto cerrado con su tendencia en palabras, la tira grande de 15 min con
 * su globo, el TURNO COMPLETO minuto a minuto (`MinutoTurnoV2`: línea y franjas por Baader, zoom, la parada marcada con
 * «ver ›» de Camino a la meta), una franja de llenado por Baader (small multiples, mismo eje, cursor vertical común, globo
 * con hora, % de llenado y cada micro detención con su duración REAL, `stopEvents[].s`), las señales sobrias que no
 * afirman causas y «Último minuto, pieza a pieza» (`ReglasMinuto`). Sin pulso en vivo (turno cerrado o de otro día) queda
 * solo el turno.
 *
 * NO repite la barra de meta ni el promedio del turno: eso vive en la franja. La lógica está en `ritmoVivo.ts`; todo es
 * dato de Shoplogix ya publicado, nada se inventa.
 */
import { MoveRight, Timer, TrendingDown, TrendingUp, Pause } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { motivoEnEspanol } from '@/services/shoplogix/shoplogixColors'
import { Globo } from './AmpliarV2'
import { useCuentaCifra } from './ampliarHooks'
import { MinutoTurnoV2, type EventoMarcado, type MinutoTurno } from './MonitorV2'
import { ReglasMinuto } from './ReglasMinuto'
import {
  MICRO_MAX_MEDIDO_S,
  SEL_LINEA,
  cronometro,
  etiquetaMaquina,
  paradaEnCurso,
  vistaDeSerie,
  type LineaLlenado,
  type MaquinaVivo,
  type ParadaVivo,
  type RitmoVivo,
  type Senal,
  type Tono,
  type VistaSerie,
} from './ritmoVivo'

const r1 = (x: number) => Math.round(x * 10) / 10
const COLOR: Record<Tono, string> = { bien: 'var(--v2-bien)', atento: 'var(--v2-atento)', mal: 'var(--v2-mal)' }
const TEXTO_TONO: Record<Tono, string> = { bien: 'var(--v2-bien)', atento: 'var(--v2-atento-texto)', mal: 'var(--v2-mal-texto)' }
const DOT: Record<Senal['tono'], string> = { atento: 'var(--v2-atento)', mal: 'var(--v2-mal)', neutra: 'var(--v2-gris)' }
const hhmmss = (ms: number) => new Date(ms).toISOString().slice(11, 19)
const pct = (frac: number): Tono => (frac >= 0.75 ? 'bien' : frac >= 0.5 ? 'atento' : 'mal')

/** Ancho real del contenedor: el SVG se dibuja a tamaño de pantalla, no escalado. */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setAncho(el.clientWidth))
    ro.observe(el)
    setAncho(el.clientWidth)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho] as const
}

/** Mide su ancho y se lo pasa a quien dibuja. */
function Medido({ children, className = 'w-full' }: { children: (ancho: number) => ReactNode; className?: string }) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  return <div ref={ref} className={className}>{ancho > 0 && children(ancho)}</div>
}

/** Reloj de pared de la pantalla (cronómetro y «en vivo»), en la misma base que las horas del doc. */
function useReloj() {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return t - new Date(t).getTimezoneOffset() * 60_000
}

/** «La línea · detención»: el mismo rótulo en la tarjeta (celular) y en la banda de estado (PC). */
function rotuloParada(p: ParadaVivo): string {
  return `${p.quien} · ${p.clase === 'micro' ? 'micro detención' : p.clase === 'programada' ? 'parada programada' : 'detención'}`
}

/** «desde 13:06:21 · Shoplogix la clasifica como detención.»: lo que acompaña al cronómetro. */
function detalleParada(p: ParadaVivo): string {
  return `desde ${hhmmss(p.desdeMs)}${
    p.clase === 'micro' ? ` · Shoplogix la clasifica como micro detención. En estos datos las micro duran hasta ${MICRO_MAX_MEDIDO_S} s.` : ''
  }${p.clase === 'detencion' ? ' · Shoplogix la clasifica como detención.' : ''}${
    p.clase === 'programada' && p.causa ? ` · ${motivoEnEspanol(p.causa)}` : ''
  }`
}

/** El aviso que pide acción (o dice la causa anotada); null si no hay nada que avisar. */
function avisoParada(p: ParadaVivo): string | null {
  if (p.faltaCausa) return 'Ya es detención: hay que anotar la causa.'
  if (p.causa && p.clase !== 'programada') return `Causa anotada: ${motivoEnEspanol(p.causa)}.`
  return null
}

// ── Selector Línea · Ev 1 · Ev 2 · Ev 3 ──────────────────────────────────────

function Selector({ opciones, valor, onCambio }: { opciones: Array<{ id: string; etiqueta: string }>; valor: string; onCambio: (id: string) => void }) {
  const ix = Math.max(0, opciones.findIndex((o) => o.id === valor))
  const botones = useRef<Array<HTMLButtonElement | null>>([])
  const teclas = (e: ReactKeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const k = (ix + d + opciones.length) % opciones.length
    onCambio(opciones[k]!.id)
    botones.current[k]?.focus()
  }
  return (
    <div className="v2-seg" role="tablist" aria-label="Ver la línea o una Baader" style={{ gridTemplateColumns: `repeat(${opciones.length}, minmax(0, 1fr))` }} onKeyDown={teclas}>
      <i className="v2-seg-ind" aria-hidden style={{ width: `calc((100% - 6px) / ${opciones.length})`, transform: `translateX(${ix * 100}%)` }} />
      {opciones.map((o, k) => (
        <button
          key={o.id}
          ref={(el) => { botones.current[k] = el }}
          type="button"
          role="tab"
          aria-selected={o.id === valor}
          tabIndex={o.id === valor ? 0 : -1}
          onClick={() => onCambio(o.id)}
          className="tap-44"
        >
          {o.etiqueta}
        </button>
      ))}
    </div>
  )
}

// ── La tira de 15 barras ─────────────────────────────────────────────────────

function Tira({ v, horaCurso, cursoColor, ancho, alto = 128 }: { v: VistaSerie; horaCurso: string; cursoColor: string; ancho: number; alto?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  const H = alto
  const top = 20
  const bot = H - 22
  const slot = ancho / 15
  const bw = Math.min(slot - 4, 30)
  const cur = v.curso ?? 0
  const max = Math.max(v.esperado * 1.15, ...v.minutos.map((m) => m.piezas), cur)
  const y = (n: number) => bot - (n / max) * (bot - top)
  const yEsp = y(v.esperado)
  const cx = 14 * slot + (slot - bw) / 2
  const yc = Math.min(y(cur), bot - 1)
  const mitad = v.minutos[Math.floor((v.minutos.length - 1) / 2)]
  const indice = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(14, Math.floor(((e.clientX - rc.left) / rc.width) * 15)))
  }
  const m = sel != null && sel < 14 ? v.minutos[sel] : null
  return (
    <div className="relative" onPointerLeave={(e) => { if (e.pointerType === 'mouse') setSel(null) }}>
      {sel != null && (
        <Globo x={((sel + 0.5) / 15) * 100}>
          {m ? (
            <>
              <div className="font-medium tabular-nums text-foreground">{m.hora} · {v.nombre}</div>
              <div className="tabular-nums" style={{ color: TEXTO_TONO[m.tono] }}><b>{m.piezas} pz</b> <span className="text-muted-foreground">· {Math.round((m.piezas / v.esperado) * 100)} % de {v.esperado}</span></div>
            </>
          ) : (
            <>
              <div className="font-medium tabular-nums text-foreground">{horaCurso} · en curso</div>
              <div className="tabular-nums text-muted-foreground">{v.curso != null ? `${v.curso} pz hasta ahora` : 'sin dato todavía'}</div>
            </>
          )}
        </Globo>
      )}
      <svg
        width={ancho} height={H} viewBox={`0 0 ${ancho} ${H}`} role="img" aria-label={`Piezas por minuto de ${v.nombre}, últimos ${v.minutos.length + 1} minutos`} className="block"
        onPointerMove={(e) => { if (e.pointerType === 'mouse') setSel(indice(e)) }}
        onClick={(e) => { const k = indice(e as unknown as ReactPointerEvent<SVGSVGElement>); setSel((a) => (a === k ? null : k)) }}
      >
        {v.minutos.map((mm, i) => {
          const yy = Math.min(y(mm.piezas), bot - 2)
          return <rect key={mm.hora} x={r1(i * slot + (slot - bw) / 2)} y={r1(yy)} width={r1(bw)} height={r1(bot - yy)} rx={3} opacity={sel != null && sel !== i ? 0.45 : 1} style={{ fill: COLOR[mm.tono], transition: 'opacity 120ms' }} />
        })}
        <rect x={r1(cx)} y={r1(yEsp)} width={r1(bw)} height={r1(bot - yEsp)} rx={3} fill="none" strokeWidth={1} strokeDasharray="3 3" style={{ stroke: cursoColor }} />
        {v.curso != null && <rect x={r1(cx)} y={r1(yc)} width={r1(bw)} height={r1(bot - yc)} rx={3} style={{ fill: `color-mix(in srgb, ${cursoColor} 50%, transparent)` }} />}
        <text x={r1(cx + bw / 2)} y={r1((v.curso != null ? Math.min(yc, yEsp) : yEsp) - 5)} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-foreground tabular-nums">{v.curso != null ? v.curso : '—'}</text>
        <line x1={0} x2={ancho} y1={r1(yEsp)} y2={r1(yEsp)} strokeWidth={1} strokeDasharray="4 3" style={{ stroke: 'var(--v2-tenue)' }} />
        <text x={0} y={r1(yEsp - 5)} fontSize={11} className="fill-muted-foreground">{v.esperado} esperado</text>
        <line x1={0} x2={ancho} y1={bot} y2={bot} strokeWidth={1} style={{ stroke: 'var(--v2-reja)' }} />
        <text x={0} y={H - 5} fontSize={11} className="fill-muted-foreground tabular-nums">{v.minutos[0]!.hora}</text>
        {mitad && <text x={r1(Math.floor((v.minutos.length - 1) / 2) * slot + slot / 2)} y={H - 5} fontSize={11} textAnchor="middle" className="fill-muted-foreground tabular-nums">{mitad.hora}</text>}
        <text x={ancho} y={H - 5} fontSize={11} fontWeight={600} textAnchor="end" className="fill-foreground tabular-nums">{horaCurso} en curso</text>
      </svg>
    </div>
  )
}

// ── Llenado por máquina ──────────────────────────────────────────────────────

const ultimo = (l: LineaLlenado) => [...l.fills].reverse().find((x): x is number => x != null)
/** Franjas por Baader: small multiples con el mismo eje, cursor vertical común y globo con la micro y su duración real. */
function Franjas({ r, ancho, sel }: { r: RitmoVivo; ancho: number; sel: string }) {
  const [idx, setIdx] = useState<number | null>(null)
  const lineas = r.lineas
  const n = lineas[0]?.fills.length ?? 0
  if (!n) return null
  const lc = ancho < 500 ? 64 : 88
  const pw = ancho - lc - 8
  const slot = pw / n
  const rh = ancho < 500 ? 52 : 60
  const gp = 12
  const tot = lineas.length * rh + (lineas.length - 1) * gp
  const x = (i: number) => lc + (i + 0.5) * slot
  const todos = lineas.flatMap((l) => l.fills).filter((q): q is number => q != null)
  /* Eje 40–100 %; si algún minuto cae bajo 40 el piso baja de a 10 para que ninguno quede fuera de la franja. */
  const lo = Math.max(0, Math.min(40, Math.floor((Math.min(...todos, 100) - 5) / 10) * 10))
  const Y = (q: number, y0: number) => y0 + 3 + (1 - (Math.max(lo, Math.min(100, q)) - lo) / (100 - lo)) * (rh - 12)
  const paso = [1, 2, 3, 5].find((p) => slot * p >= 46) ?? 5
  const indice = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rc = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rc.left) / rc.width) * ancho
    return Math.max(0, Math.min(n - 1, Math.floor((px - lc) / slot)))
  }
  const tip = idx != null ? { px: x(idx), hora: r.minutos[idx]?.hora ?? '' } : null
  return (
    <div className="relative" onPointerLeave={(e) => { if (e.pointerType === 'mouse') setIdx(null) }}>
      {tip && idx != null && (
        <div className="v2-tip pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-ctl px-3 py-2 text-[13px] leading-snug" style={{ left: Math.max(0, tip.px + 14 + 200 > ancho ? tip.px - 14 - 210 : tip.px + 14) }}>
          <div className="font-semibold tabular-nums text-foreground">{tip.hora}</div>
          {lineas.map((l) => {
            const f = l.fills[idx]
            const ms = l.microsDetalle.filter((q) => q.i === idx)
            return (
              <div key={l.id} className="tabular-nums" style={{ opacity: sel !== SEL_LINEA && sel !== l.id ? 0.55 : 1 }}>
                <span className="text-muted-foreground">{etiquetaMaquina(l.nombre)} · </span>
                {f != null ? <b style={{ color: TEXTO_TONO[pct(f / 100)] }}>{f} %</b> : <span className="text-muted-foreground">sin dato</span>}
                {ms.map((q) => <span key={q.inicioMs} className="rv-micro-txt"> <i className="rv-micro-marca" aria-hidden />micro {cronometro(q.duracionS)}</span>)}
              </div>
            )
          })}
        </div>
      )}
      <svg
        width={ancho} height={tot + 26} viewBox={`0 0 ${ancho} ${tot + 26}`} role="img" aria-label="Llenado por minuto de cada máquina, una franja por Baader" className="block touch-pan-y"
        onPointerMove={(e) => { if (e.pointerType === 'mouse') setIdx(indice(e)) }}
        onClick={(e) => { const k = indice(e as unknown as ReactPointerEvent<SVGSVGElement>); setIdx((a) => (a === k ? null : k)) }}
      >
        {lineas.map((l, k) => {
          const y0 = k * (rh + gp)
          const atenuada = sel !== SEL_LINEA && sel !== l.id
          const u = ultimo(l)
          /* Como en el mockup: cada franja toma el tono de SU último llenado (≥75 % bien, 50–75 atento, <50 mal). */
          const tonoU = u != null ? pct(u / 100) : null
          const color = tonoU ? COLOR[tonoU] : 'var(--v2-gris)'
          /* Los minutos sin dato cortan el trazo: no se une lo que no se midió. */
          const tramos: Array<Array<[number, number]>> = [[]]
          l.fills.forEach((q, i) => {
            if (q == null) { if (tramos[tramos.length - 1]!.length) tramos.push([]) } else tramos[tramos.length - 1]!.push([x(i), Y(q, y0)])
          })
          return (
            <g key={l.id} opacity={atenuada ? 0.4 : 1} style={{ transition: 'opacity 200ms' }}>
              <rect x={lc} y={y0} width={pw} height={rh} rx={8} style={{ fill: 'var(--v2-reja)' }} opacity={0.6} />
              {lo < 75 && <line x1={lc} x2={lc + pw} y1={r1(Y(75, y0))} y2={r1(Y(75, y0))} strokeWidth={1} strokeDasharray="3 4" style={{ stroke: 'var(--v2-tenue)' }} />}
              {tramos.filter((t) => t.length > 1).map((t, q) => (
                <g key={q}>
                  <path d={`M${r1(t[0]![0])},${y0 + rh - 3} ${t.map(([px, py]) => `L${r1(px)},${r1(py)}`).join(' ')} L${r1(t[t.length - 1]![0])},${y0 + rh - 3} Z`} opacity={0.14} style={{ fill: color }} />
                  <polyline points={t.map(([px, py]) => `${r1(px)},${r1(py)}`).join(' ')} fill="none" strokeWidth={l.baja ? 2.4 : 1.8} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
                </g>
              ))}
              {tramos.filter((t) => t.length === 1).map((t, q) => <circle key={`p${q}`} cx={r1(t[0]![0])} cy={r1(t[0]![1])} r={2.5} style={{ fill: color }} />)}
              {l.microsDetalle.map((q) => {
                const px = lc + ((q.inicioMs - r.inicioTiraMs) / 60_000) * slot
                return <rect key={q.inicioMs} x={r1(Math.max(lc, px))} y={y0 + rh - 8} width={r1(Math.max(4, (q.duracionS / 60) * slot))} height={6} rx={2} style={{ fill: 'var(--v2-ext)' }}><title>{`micro detención de ${cronometro(q.duracionS)}`}</title></rect>
              })}
              {u != null && <circle cx={r1(x(l.fills.reduce<number>((a, q, i) => (q != null ? i : a), -1)))} cy={r1(Y(u, y0))} r={3.5} style={{ fill: color }} />}
              <text x={0} y={y0 + 22} fontSize={13} fontWeight={600} className="fill-foreground">{etiquetaMaquina(l.nombre)}</text>
              <text x={0} y={y0 + 42} fontSize={13} fontWeight={700} className="tabular-nums" style={{ fill: tonoU ? TEXTO_TONO[tonoU] : undefined }}>{u != null ? `${u} %` : '—'}</text>
            </g>
          )
        })}
        {Array.from({ length: n }, (_, i) => (
          <line key={i} x1={r1(x(i))} x2={r1(x(i))} y1={tot + 3} y2={tot + (i % paso === 0 ? 9 : 6)} strokeWidth={1} style={{ stroke: 'var(--v2-tenue)' }} />
        ))}
        {Array.from({ length: n }, (_, i) => i).filter((i) => i % paso === 0).map((i) => (
          <text key={i} x={r1(x(i))} y={tot + 22} textAnchor="middle" fontSize={11} className="fill-muted-foreground tabular-nums">{r.minutos[i]?.hora}</text>
        ))}
        {ancho >= 500 && <text x={0} y={tot + 22} fontSize={11} className="fill-muted-foreground">eje {lo}–100 %</text>}
        {idx != null && <line x1={r1(x(idx))} x2={r1(x(idx))} y1={0} y2={tot} strokeWidth={1} opacity={0.55} style={{ stroke: 'rgb(var(--foreground))' }} />}
      </svg>
    </div>
  )
}

/** El «último minuto» y la tendencia de lo que se está viendo (la línea o una Baader). */
function UltimoMinuto({ v, promedio }: { v: VistaSerie; promedio?: number | null }) {
  const t = v.tendencia
  const mostrado = useCuentaCifra(v.ahora)
  const tendColor = t?.dir === 'detenida' ? 'var(--v2-mal-texto)' : t?.dir === 'bajando' && t.hasta / v.esperado < 0.75
    ? (t.hasta / v.esperado < 0.5 ? 'var(--v2-mal-texto)' : 'var(--v2-atento-texto)')
    : undefined
  return (
    <div className="rv-a flex items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] text-muted-foreground">Último minuto · {v.nombre}</span>
        <span className="flex items-baseline gap-1.5"><span className="rv-cifra tabular-nums font-bold leading-none text-foreground">{mostrado}</span><span className="text-[15px] text-muted-foreground">pz/min</span></span>
        <span className="text-[13px] tabular-nums text-muted-foreground">{v.ahoraPct} % de {v.esperado}</span>
        {promedio != null && <span className="text-[13px] tabular-nums text-muted-foreground">promedio del turno <b className="font-semibold text-foreground">{promedio.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b> pz/min</span>}
      </div>
      {t && (
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          <span className="inline-flex items-center gap-1.5 text-[20px] font-semibold leading-tight text-foreground" style={tendColor ? { color: tendColor } : undefined}>
            {t.dir === 'detenida' ? <Pause className="h-[18px] w-[18px]" aria-hidden /> : t.dir === 'bajando' ? <TrendingDown className="h-[18px] w-[18px]" aria-hidden /> : t.dir === 'subiendo' ? <TrendingUp className="h-[18px] w-[18px]" aria-hidden /> : <MoveRight className="h-[18px] w-[18px]" aria-hidden />}
            {t.dir === 'detenida' ? 'Detenida' : t.dir === 'bajando' ? 'Bajando' : t.dir === 'subiendo' ? 'Subiendo' : 'Estable'}
          </span>
          <span className="text-[13px] tabular-nums text-muted-foreground">
            {t.dir === 'detenida' ? `sin piezas hace ${t.ceros} min` : `${t.desde} → ${t.hasta} en ${t.n} min`}
          </span>
        </div>
      )}
    </div>
  )
}

const LEYENDA: Array<[Tono, string]> = [['bien', '≥75 %'], ['atento', '50–75'], ['mal', '<50 del esperado']]

/** Las opciones del selector: la línea y cada Baader (de la tira en vivo o, sin ella, del turno completo). */
const opcionesDe = (r: RitmoVivo | null, turno: MinutoTurno | null) =>
  [{ id: SEL_LINEA, etiqueta: 'Línea' }, ...(r ? r.porMaquina : turno?.maquinas ?? []).map((m) => ({ id: m.id, etiqueta: etiquetaMaquina(m.nombre) }))]

/** Lo elegido: la serie de la línea o de una Baader; una elección que ya no existe (otra línea, otro turno) vuelve a la línea. */
function seleccionDe(r: RitmoVivo | null, turno: MinutoTurno | null, sel: string) {
  const v = r ? vistaDeSerie(r, sel) : null
  const selId = v ? v.sel : turno?.maquinas.some((m) => m.id === sel) ? sel : SEL_LINEA
  return { v, selId }
}

/** El color de la barra del minuto en curso: el de la parada (detención = coral, micro = celeste) o el acento si marcha. */
const colorCurso = (parada: ParadaVivo | null) => (parada?.clase === 'detencion' ? 'var(--v2-mal)' : parada?.clase === 'micro' ? 'var(--v2-ext)' : 'var(--v2-bien)')

/** Los tres tonos de las barras: ≥75 %, 50–75 y <50 del esperado. */
function LeyendaTonos() {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
      {LEYENDA.map(([k, txt]) => (
        <span key={k} className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: COLOR[k] }} />{txt}</span>
      ))}
    </span>
  )
}

export interface RitmoVivoAmpliadoProps {
  /** Los últimos 15 min; null sin pulso en vivo (turno cerrado o de otro día): queda solo el turno completo. */
  r: RitmoVivo | null
  /** El turno completo minuto a minuto (ciclos de Shoplogix por máquina). */
  turno: MinutoTurno | null
  cerrado: boolean
  /** La parada elegida con «ver ›» en Camino a la meta: el turno completo se acerca a ella. */
  marca: EventoMarcado | null
  onQuitarMarca: () => void
  /** Promedio del turno (pz/min) de la línea (`linea`) y de cada máquina (por id), el de «aporte al promedio». */
  promedios?: Record<string, number | null>
  /** Máquinas con su estado vivo y si el turno ya terminó: de ahí sale el color del minuto en curso. */
  maquinas?: MaquinaVivo[]
  turnoTerminado?: boolean
  /** Con «Último minuto, pieza a pieza» (`ReglasMinuto`) bajo el último minuto: va una sola vez en toda la vista. */
  conReglas?: boolean
  /** La Baader elegida, si la comparte quien lo abre. Sin ella, el ampliado lleva su propia elección. */
  sel?: string
  onSel?: (id: string) => void
}

/**
 * El detalle de «Ritmo en vivo»: selector Línea/Ev, último minuto con la tira de 15 min, el turno completo minuto a
 * minuto (`MinutoTurnoV2`), el llenado por Baader, las señales y, con `conReglas`, «Último minuto, pieza a pieza».
 * Lo abre el gráfico unido de «El turno» (`GraficoRitmoVivo`).
 */
export function RitmoVivoAmpliado({ r, turno, cerrado, marca, onQuitarMarca, promedios, maquinas, turnoTerminado, conReglas, sel: selProp, onSel }: RitmoVivoAmpliadoProps) {
  const [selLocal, setSelLocal] = useState(SEL_LINEA)
  const sel = selProp ?? selLocal
  const { v, selId } = seleccionDe(r, turno, sel)
  /* Elegida una Baader, el turno completo muestra solo esa; con «Línea», la suma y cada una. */
  const turnoVista = useMemo(
    () => (turno && selId !== SEL_LINEA ? { ...turno, maquinas: turno.maquinas.filter((m) => m.id === selId) } : turno),
    [turno, selId],
  )
  const cursoColor = colorCurso(turnoTerminado ? null : paradaEnCurso(maquinas ?? []))
  const multi = (r ? r.porMaquina.length : turno?.maquinas.length ?? 0) > 1
  const cosa = r?.unidad ? `${r.unidad[0]!.toUpperCase()}${r.unidad.slice(1)} con pieza` : 'Llenado'
  const hayMicros = !!r && r.lineas.some((l) => l.microsDetalle.length > 0)
  /* Con la máquina parada casi todo el tramo no hay trazo que dibujar: se dice en una línea. */
  const medible = !!r && r.lineas.some((l) => l.fills.filter((q) => q != null).length >= 2)
  const selector = multi ? <Selector opciones={opcionesDe(r, turno)} valor={selId} onCambio={onSel ?? setSelLocal} /> : null

  const senales = r && (
    <ul className="flex flex-col gap-2">
      {r.senales.map((s) => (
        <li key={s.texto} className="flex items-start gap-2.5">
          <i className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[s.tono] }} aria-hidden />
          <span className="text-[15px] leading-snug text-foreground">{s.texto}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="rv-amp space-y-5">
      {selector}
      {r && v && (
        <div className="rv-amp-top">
          <div className="flex min-w-0 flex-col gap-2">
            <UltimoMinuto v={v} promedio={promedios?.[v.sel] ?? null} />
            <LeyendaTonos />
          </div>
          <Medido className="min-w-0">{(w) => <Tira v={v} horaCurso={r.horaCurso} cursoColor={cursoColor} ancho={w} alto={132} />}</Medido>
        </div>
      )}
      {conReglas && <ReglasMinuto />}
      {turnoVista && (
        <div className={r ? 'rv-l' : ''}>
          <h4 className="text-[15px] font-semibold leading-tight text-foreground">El turno completo, minuto a minuto</h4>
          <p className="text-[13px] text-muted-foreground">piezas contadas por Shoplogix desde el inicio del turno{selId !== SEL_LINEA ? ' · solo la Baader elegida' : ''} · el mismo eje de tiempo que las franjas de abajo</p>
          <MinutoTurnoV2 d={turnoVista} cerrado={cerrado} marca={marca} onQuitarMarca={onQuitarMarca} />
        </div>
      )}
      {r && r.lineas.length > 0 && (
        <div className="rv-l">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h4 className="text-[15px] font-semibold leading-tight text-foreground">{cosa}{multi ? ', por máquina' : ''} · últimos 15 minutos</h4>
              <p className="text-[13px] text-muted-foreground">% de {r.unidad ?? 'llenado'} en cada minuto · una franja por Baader, mismo eje · guía en 75 %</p>
            </div>
            {hayMicros && <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground"><i className="rv-micro-marca" aria-hidden />micro detención (ancho = duración)</span>}
          </div>
          {medible
            ? <div className="mt-3"><Medido>{(w) => <Franjas r={r} ancho={w} sel={selId} />}</Medido></div>
            : <p className="mt-2 text-[15px] leading-snug text-muted-foreground">Sin minutos con la máquina andando para medir el llenado.</p>}
        </div>
      )}
      {r && senales && (
        <div className="rv-g">
          <span className="text-[13px] text-muted-foreground">Señales</span>
          <div className="mt-1.5">{senales}</div>
        </div>
      )}
      {r && (
        <p className="text-[12px] leading-snug text-muted-foreground">
          Llenado de cada minuto: piezas ÷ lo que la máquina daba andando a su esperado; los minutos con menos de 30 s andando no tienen dato.
          Cada micro detención muestra su inicio y su duración tal como los publica Shoplogix.
        </p>
      )}
    </div>
  )
}

// ── La banda de estado de PC ─────────────────────────────────────────────────

/**
 * La parada en curso como UNA banda arriba de «El turno», en PC (pegada bajo la cabecera) y en celular (en el flujo).
 * Misma fuente (`paradaEnCurso`) y mismo `cronometro` que el resto del monitor. Con la banda, el aviso «Ahora mismo» de la
 * página calla la parada (CSS `:has(.rv-banda)`). Sin parada no dibuja nada.
 */
export function BandaParadaV2({ maquinas, turnoTerminado }: { maquinas: MaquinaVivo[]; turnoTerminado?: boolean }) {
  const ahoraWall = useReloj()
  const parada = turnoTerminado ? null : paradaEnCurso(maquinas)
  if (!parada) return null
  const aviso = avisoParada(parada)
  return (
    <div className="rv-banda" data-clase={parada.clase} role="status" aria-label="Parada en curso">
      <Timer className="h-5 w-5 shrink-0 rv-banda-icono" aria-hidden />
      <span className="rv-banda-rotulo shrink-0 text-[16px] font-semibold">{rotuloParada(parada)}</span>
      <span className="rv-banda-crono tabular-nums" aria-label="Tiempo parada">{cronometro((ahoraWall - parada.desdeMs) / 1000)}</span>
      <span className="rv-banda-detalle min-w-0 flex-1 truncate text-[13px]" title={detalleParada(parada)}>{detalleParada(parada)}</span>
      {aviso && <span className="shrink-0 text-[14px] font-semibold text-foreground">{aviso}</span>}
    </div>
  )
}
