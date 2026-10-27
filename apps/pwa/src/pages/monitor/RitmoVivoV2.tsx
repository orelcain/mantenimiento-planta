/**
 * «Ritmo en vivo · 15 min» del monitor v2 (opción A del mockup del 27-10).
 *
 * Una sola pregunta: ¿cómo viene el ritmo AHORA y hacia dónde va? De arriba abajo:
 *  1. la parada en curso con su cronómetro (si la hay), clasificada por Shoplogix;
 *  2. el último minuto cerrado y la tendencia en palabras;
 *  3. la tira de 15 barras (14 cerradas + el minuto en curso llenándose);
 *  4. el llenado por máquina, en gris salvo la que baja;
 *  5. señales sobrias, sin afirmar causas.
 *
 * NO repite la barra de meta ni el promedio del turno: eso ya vive en «Ritmo de
 * la línea». La lógica está en `ritmoVivo.ts`.
 */
import { Gauge, MoveRight, Timer, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { motivoEnEspanol } from '@/services/shoplogix/shoplogixColors'
import {
  MICRO_MAX_MEDIDO_S,
  cronometro,
  paradaEnCurso,
  type LineaLlenado,
  type MaquinaVivo,
  type RitmoVivo,
  type Senal,
  type Tono,
} from './ritmoVivo'

const r1 = (x: number) => Math.round(x * 10) / 10
const COLOR: Record<Tono, string> = { bien: 'var(--v2-bien)', atento: 'var(--v2-atento)', mal: 'var(--v2-mal)' }
const TEXTO_TONO: Record<'atento' | 'mal', string> = { atento: 'var(--v2-atento-texto)', mal: 'var(--v2-mal-texto)' }
const DOT: Record<Senal['tono'], string> = { atento: 'var(--v2-atento)', mal: 'var(--v2-mal)', neutra: 'var(--v2-gris)' }
const hhmmss = (ms: number) => new Date(ms).toISOString().slice(11, 19)

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

/** Reloj de pared de la pantalla (cronómetro y «en vivo»), en la misma base que las horas del doc. */
function useReloj() {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return t - new Date(t).getTimezoneOffset() * 60_000
}

function irAlMinutoAMinuto() {
  const el = document.getElementById('grafico-turno')
  if (!el) return
  const quieto = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' })
}

// ── La tira de 15 barras ─────────────────────────────────────────────────────

function Tira({ r, cursoColor, ancho }: { r: RitmoVivo; cursoColor: string; ancho: number }) {
  const H = 128
  const top = 20
  const bot = H - 22
  const slot = ancho / 15
  const bw = Math.min(slot - 4, 30)
  const cur = r.curso ?? 0
  const max = Math.max(r.esperadoLinea * 1.15, ...r.minutos.map((m) => m.piezas), cur)
  const y = (v: number) => bot - (v / max) * (bot - top)
  const yEsp = y(r.esperadoLinea)
  const cx = 14 * slot + (slot - bw) / 2
  const yc = Math.min(y(cur), bot - 1)
  const mitad = r.minutos[Math.floor((r.minutos.length - 1) / 2)]
  return (
    <svg width={ancho} height={H} viewBox={`0 0 ${ancho} ${H}`} role="img" aria-label={`Piezas por minuto, últimos ${r.minutos.length + 1} minutos`} className="block">
      {r.minutos.map((m, i) => {
        const yy = Math.min(y(m.piezas), bot - 2)
        return <rect key={m.hora} x={r1(i * slot + (slot - bw) / 2)} y={r1(yy)} width={r1(bw)} height={r1(bot - yy)} rx={3} style={{ fill: COLOR[m.tono] }}><title>{`${m.hora} · ${m.piezas} pz`}</title></rect>
      })}
      <rect x={r1(cx)} y={r1(yEsp)} width={r1(bw)} height={r1(bot - yEsp)} rx={3} fill="none" strokeWidth={1} strokeDasharray="3 3" style={{ stroke: cursoColor }} />
      {r.curso != null && <rect x={r1(cx)} y={r1(yc)} width={r1(bw)} height={r1(bot - yc)} rx={3} style={{ fill: `color-mix(in srgb, ${cursoColor} 50%, transparent)` }} />}
      <text x={r1(cx + bw / 2)} y={r1((r.curso != null ? Math.min(yc, yEsp) : yEsp) - 5)} textAnchor="middle" fontSize={11} fontWeight={600} className="fill-foreground tabular-nums">{r.curso != null ? r.curso : '—'}</text>
      <line x1={0} x2={ancho} y1={r1(yEsp)} y2={r1(yEsp)} strokeWidth={1} strokeDasharray="4 3" style={{ stroke: 'var(--v2-tenue)' }} />
      <text x={0} y={r1(yEsp - 5)} fontSize={11} className="fill-muted-foreground">{r.esperadoLinea} esperado</text>
      <line x1={0} x2={ancho} y1={bot} y2={bot} strokeWidth={1} style={{ stroke: 'var(--v2-reja)' }} />
      <text x={0} y={H - 5} fontSize={11} className="fill-muted-foreground tabular-nums">{r.minutos[0]!.hora}</text>
      {mitad && <text x={r1(Math.floor((r.minutos.length - 1) / 2) * slot + slot / 2)} y={H - 5} fontSize={11} textAnchor="middle" className="fill-muted-foreground tabular-nums">{mitad.hora}</text>}
      <text x={ancho} y={H - 5} fontSize={11} fontWeight={600} textAnchor="end" className="fill-foreground tabular-nums">{r.horaCurso} en curso</text>
    </svg>
  )
}

// ── Llenado por máquina ──────────────────────────────────────────────────────

/** «Evisceradora 2» → «2»: la etiqueta corta de la línea, para que quepa al final del trazo. */
function corto(nombre: string): string {
  const t = nombre.split(/[\s·\-_/]+/).filter(Boolean)
  return (t[t.length - 1] ?? nombre).slice(0, 8)
}

function Llenado({ lineas, ancho, multi }: { lineas: LineaLlenado[]; ancho: number; multi: boolean }) {
  const H = 104
  const L = 28
  const R = multi ? 64 : 46
  const top = 8
  const bot = H - 6
  const pw = Math.max(40, ancho - L - R)
  const n = lineas[0]?.fills.length ?? 0
  const todos = lineas.flatMap((l) => l.fills).filter((v): v is number => v != null)
  const lo = Math.max(0, Math.min(50, Math.floor((Math.min(...todos, 100) - 5) / 10) * 10))
  const y = (v: number) => bot - ((Math.max(lo, Math.min(100, v)) - lo) / (100 - lo)) * (bot - top)
  const x = (i: number) => L + (n > 1 ? (i * pw) / (n - 1) : 0)
  const rejas = [100, 75, 50, 25].filter((v) => v >= lo)
  /* Las etiquetas del final no se pisan: se separan 13 px de arriba hacia abajo. */
  const fin: Array<{ l: LineaLlenado; ult: number | undefined; ly: number | null }> = lineas.map((l) => {
    const ult = [...l.fills].reverse().find((v): v is number => v != null)
    return { l, ult, ly: ult != null ? y(ult) + 4 : null }
  })
  /* Si la línea dejó de producir, los últimos minutos no tienen llenado: se marca el tramo y cada etiqueta
     va pegada al final de SU trazo, no flotando en el borde derecho lejos de lo que nombra. */
  const ultIdx = Math.max(-1, ...lineas.map((l) => l.fills.reduce<number>((a, v, i) => (v != null ? i : a), -1)))
  const sinDatoFinal = ultIdx >= 0 && ultIdx < n - 1
  const xEtiqueta = sinDatoFinal ? x(ultIdx) + 8 : L + pw + 8
  const orden = fin.filter((f) => f.ly != null).sort((a, b) => a.ly! - b.ly!)
  for (let i = 1; i < orden.length; i++) if (orden[i]!.ly! - orden[i - 1]!.ly! < 13) orden[i]!.ly = orden[i - 1]!.ly! + 13
  return (
    <svg width={ancho} height={H} viewBox={`0 0 ${ancho} ${H}`} role="img" aria-label="Llenado por máquina, por minuto" className="block">
      {rejas.map((v) => (
        <g key={v}>
          <line x1={L} x2={L + pw} y1={r1(y(v))} y2={r1(y(v))} strokeWidth={1} style={{ stroke: 'var(--v2-reja)' }} />
          <text x={0} y={r1(y(v) + 4)} fontSize={11} className="fill-muted-foreground tabular-nums">{v}</text>
        </g>
      ))}
      {sinDatoFinal && (
        <g>
          <rect x={r1(x(ultIdx) + (multi ? 52 : 40))} y={top} width={Math.max(0, r1(L + pw - x(ultIdx) - (multi ? 52 : 40)))} height={bot - top} rx={6} style={{ fill: 'rgb(142 142 147 / 0.10)' }} />
          {L + pw - x(ultIdx) > 120 && (
            <text x={r1((x(ultIdx) + (multi ? 52 : 40) + L + pw) / 2)} y={r1((top + bot) / 2 + 4)} fontSize={11} textAnchor="middle" className="fill-muted-foreground">sin llenado: no anduvo</text>
          )}
        </g>
      )}
      {lineas.map((l) => {
        const color = l.tono ? COLOR[l.tono] : 'var(--v2-gris)'
        /* Los minutos sin dato cortan el trazo: no se une lo que no se midió. */
        const tramos: string[][] = [[]]
        l.fills.forEach((v, i) => {
          if (v == null) { if (tramos[tramos.length - 1]!.length) tramos.push([]) } else tramos[tramos.length - 1]!.push(`${r1(x(i))},${r1(y(v))}`)
        })
        return (
          <g key={l.id}>
            {tramos.filter((t) => t.length > 1).map((t, k) => (
              <polyline key={k} points={t.join(' ')} fill="none" strokeWidth={l.baja ? 2.4 : 1.6} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: color }} />
            ))}
            {/* Un minuto suelto con dato no tiene con qué unirse: va como punto, no desaparece. */}
            {tramos.filter((t) => t.length === 1).map((t, k) => {
              const [cx, cy] = t[0]!.split(',')
              return <circle key={`p${k}`} cx={cx} cy={cy} r={2} style={{ fill: color }} />
            })}
            {l.micros.map((i) => l.fills[i] != null && (
              <circle key={i} cx={r1(x(i))} cy={r1(y(l.fills[i]!))} r={3.5} strokeWidth={2} className="fill-card" style={{ stroke: 'var(--v2-ext)' }} />
            ))}
          </g>
        )
      })}
      {fin.map(({ l, ult, ly }) => ult != null && ly != null && (
        <text key={l.id} x={r1(xEtiqueta)} y={r1(ly)} fontSize={11} fontWeight={l.baja ? 600 : 400} className={`tabular-nums ${l.baja ? '' : 'fill-muted-foreground'}`} style={l.baja && l.tono ? { fill: TEXTO_TONO[l.tono === 'mal' ? 'mal' : 'atento'] } : undefined}>
          {multi ? `${corto(l.nombre)}  ` : ''}{ult} %
        </text>
      ))}
    </svg>
  )
}

// ── La tarjeta ───────────────────────────────────────────────────────────────

export interface RitmoVivoV2Props {
  r: RitmoVivo
  maquinas: MaquinaVivo[]
}

export function RitmoVivoV2({ r, maquinas }: RitmoVivoV2Props) {
  const ahoraWall = useReloj()
  const [refTira, anchoTira] = useAncho<HTMLDivElement>()
  const [refLlen, anchoLlen] = useAncho<HTMLDivElement>()
  const parada = paradaEnCurso(maquinas)
  const claseVivo = parada ? parada.clase : 'marcha'
  const cursoColor = parada?.clase === 'detencion' ? 'var(--v2-mal)' : parada?.clase === 'micro' ? 'var(--v2-ext)' : 'var(--v2-bien)'
  const t = r.tendencia
  const multi = r.lineas.length > 1
  const cosa = r.unidad ? `${r.unidad[0]!.toUpperCase()}${r.unidad.slice(1)} con pieza` : 'Llenado'
  const tendColor = t?.dir === 'bajando' && t.hasta / r.esperadoLinea < 0.75
    ? (t.hasta / r.esperadoLinea < 0.5 ? 'var(--v2-mal-texto)' : 'var(--v2-atento-texto)')
    : undefined
  const hayMicros = r.lineas.some((l) => l.micros.length > 0)
  /* Con la máquina parada casi todo el tramo no hay trazo que dibujar: se dice en una línea. */
  const medible = r.lineas.some((l) => l.fills.filter((v) => v != null).length >= 2)

  return (
    <section className="v2-tarjeta rv min-w-0 rounded-card p-4 lg:p-5" aria-label="Ritmo en vivo, últimos 15 minutos" data-parada={claseVivo}>
      <div className="rv-grid">
        <div className="rv-h flex items-center gap-2.5">
          <span className="v2-icono inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"><Gauge className="h-[18px] w-[18px]" aria-hidden /></span>
          <h3 className="min-w-0 flex-1 text-[17px] font-semibold leading-snug text-foreground">Ritmo en vivo</h3>
          <span className="rv-vivo inline-flex items-center gap-1.5 text-[13px] tabular-nums text-muted-foreground">
            <i className="rv-punto" aria-hidden /><span className="sr-only">en vivo </span>{hhmmss(ahoraWall)}
          </span>
        </div>

        {parada && (
          <div className="rv-p">
            <div className="rv-parada rounded-card" data-clase={parada.clase} role="status">
              <div className="flex items-center gap-2.5">
                <Timer className="h-5 w-5 shrink-0 rv-parada-icono" aria-hidden />
                <span className="min-w-0 flex-1 text-[15px] font-semibold leading-tight rv-parada-texto">
                  {parada.quien} · {parada.clase === 'micro' ? 'micro detención' : parada.clase === 'programada' ? 'parada programada' : 'detención'}
                </span>
                <span className="rv-crono tabular-nums rv-parada-texto" aria-label="Tiempo parada">{cronometro((ahoraWall - parada.desdeMs) / 1000)}</span>
              </div>
              {parada.faltaCausa && <p className="mt-1.5 text-[15px] font-semibold leading-tight text-foreground">Ya es detención: hay que anotar la causa.</p>}
              {parada.causa && parada.clase !== 'programada' && <p className="mt-1.5 text-[15px] font-semibold leading-tight text-foreground">Causa anotada: {motivoEnEspanol(parada.causa)}.</p>}
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                desde {hhmmss(parada.desdeMs)}
                {parada.clase === 'micro' && ` · Shoplogix la clasifica como micro detención. En estos datos las micro duran hasta ${MICRO_MAX_MEDIDO_S} s.`}
                {parada.clase === 'detencion' && ' · Shoplogix la clasifica como detención.'}
                {parada.clase === 'programada' && parada.causa && ` · ${motivoEnEspanol(parada.causa)}`}
              </p>
            </div>
          </div>
        )}

        <div className="rv-a flex items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] text-muted-foreground">Último minuto</span>
            <span className="flex items-baseline gap-1.5"><span className="rv-cifra tabular-nums font-bold leading-none text-foreground">{r.ahora}</span><span className="text-[15px] text-muted-foreground">pz/min</span></span>
            <span className="text-[13px] tabular-nums text-muted-foreground">{r.ahoraPct} % de {r.esperadoLinea}</span>
          </div>
          {t && (
            <div className="flex flex-col items-end gap-0.5 text-right">
              <span className="inline-flex items-center gap-1.5 text-[20px] font-semibold leading-tight text-foreground" style={tendColor ? { color: tendColor } : undefined}>
                {t.dir === 'bajando' ? <TrendingDown className="h-[18px] w-[18px]" aria-hidden /> : t.dir === 'subiendo' ? <TrendingUp className="h-[18px] w-[18px]" aria-hidden /> : <MoveRight className="h-[18px] w-[18px]" aria-hidden />}
                {t.dir === 'bajando' ? 'Bajando' : t.dir === 'subiendo' ? 'Subiendo' : 'Estable'}
              </span>
              <span className="text-[13px] tabular-nums text-muted-foreground">{t.desde} → {t.hasta} en {t.n} min</span>
            </div>
          )}
        </div>

        <div className="rv-s">
          <button type="button" onClick={irAlMinutoAMinuto} aria-label="Ver el turno minuto a minuto" className="rv-tira tap-44 block w-full text-left">
            <div ref={refTira} className="w-full">{anchoTira > 0 && <Tira r={r} cursoColor={cursoColor} ancho={anchoTira} />}</div>
            <span className="mt-2 flex items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted-foreground">
                {([['bien', '≥75 %'], ['atento', '50–75'], ['mal', '<50 del esperado']] as const).map(([k, txt]) => (
                  <span key={k} className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-[2px]" style={{ background: COLOR[k] }} />{txt}</span>
                ))}
              </span>
              <span className="rv-ver inline-flex shrink-0 items-center text-[15px] font-semibold">Turno ›</span>
            </span>
          </button>
        </div>

        {r.lineas.length > 0 && (
          <div className="rv-l">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h4 className="text-[15px] font-semibold leading-tight text-foreground">{cosa}{multi ? ', por máquina' : ''}</h4>
              <span className="text-[13px] text-muted-foreground">% por minuto</span>
            </div>
            {medible
              ? <div ref={refLlen} className="w-full">{anchoLlen > 0 && <Llenado lineas={r.lineas} ancho={anchoLlen} multi={multi} />}</div>
              : <p className="text-[15px] leading-snug text-muted-foreground">Sin minutos con la máquina andando para medir el llenado.</p>}
            <div className="mt-1 flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
              <span>{medible ? r.minutos[0]!.hora : ''}</span>
              {hayMicros && <span className="inline-flex items-center gap-1.5"><i className="rv-micro" aria-hidden />micro detención de esa máquina</span>}
              <span>{medible ? r.minutos[r.minutos.length - 1]!.hora : ''}</span>
            </div>
          </div>
        )}

        <div className="rv-g">
          <span className="text-[13px] text-muted-foreground">Señales</span>
          <ul className="mt-1.5 flex flex-col gap-2">
            {r.senales.map((s) => (
              <li key={s.texto} className="flex items-start gap-2.5">
                <i className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: DOT[s.tono] }} aria-hidden />
                <span className="text-[15px] leading-snug text-foreground">{s.texto}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
