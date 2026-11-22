/**
 * Grader en vivo (etapa E-A, diseño A «Relato» aprobado por Orel el 21-11): lo que pide atención, cuatro cifras,
 * la curva de piezas por minuto del grader sobre la de las 3 Baader y el detalle (P0 cada 15 min, calibre y
 * calidad, línea manual por hora).
 *
 * Todo sale de las cubetas por minuto del espejo (`useEspejoGrader().cubetas`) y de la serie por minuto de
 * Shoplogix que el monitor ya tiene: aquí no se recorren piezas ni se abre otra suscripción. Las cuentas viven en
 * `services/grader/espejo/` (puras, con tests); este archivo solo arma y dibuja.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, BellRing, Filter, Gauge, Hand, Layers, Package, ShieldAlert, SplitSquareHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_P0_CRITICAL_PCT, P0_LINE_MIN_PIECES } from '@/services/grader/graderP0Thresholds'
import { coma1, horaDelEje, milesPunto, type AlertaGrader } from '@/services/grader/espejo/alertasGrader'
import { RETRASO_REFERENCIA_FUENTE, movil } from '@/services/grader/espejo/graderVivo'
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'
import { Tarjeta } from './TarjetaVivo'
import { RELLENO_DUENO } from './ejeTurno'
import { PIEZAS_PARA_DECIR_SIN_GATE0, armarGraderVivo, type DatosGraderVivo, type EntradaGraderVivo } from './graderVivoDatos'
import { SeteoGates, PescaPorPrograma } from './SeteoGatesVivo'

type Datos = DatosGraderVivo

/** Lote «720260739» → «720.260.739», como lo muestra Matrix. */
function loteLegible(l: string): string {
  return /^\d+$/.test(l) ? milesPunto(Number(l)) : l
}

function useAncho<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setW(Math.round(el.getBoundingClientRect().width))
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

const IC = "h-3.5 w-3.5"


function Alertas({ d, ultimaHora }: { d: Datos; ultimaHora: string | null }) {
  const a = d.alertas
  return (
    <Tarjeta titulo={a.length > 0 ? 'Pide atención' : 'Sin alertas'} icono={<BellRing className={IC} />}>
      <ul className="mt-3 space-y-2" aria-label="Alertas del grader">
        {a.map((x: AlertaGrader, i) => (
          <li
            key={`${x.regla}-${i}`}
            data-regla={x.regla}
            className="v2-subtarjeta flex gap-2.5 rounded-card px-3 py-2.5"
          >
            <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: x.nivel === 'mal' ? 'var(--v2-mal)' : 'var(--v2-atento)' }} />
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight tabular-nums" style={{ color: x.nivel === 'mal' ? 'var(--v2-mal-texto)' : 'var(--v2-atento-texto)' }}>{x.titulo}</p>
              <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{x.detalle}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
        {ultimaHora ? `Última pieza leída ${ultimaHora}. ` : ''}Las alertas se miden hasta la última pieza leída, no hasta la hora del reloj.
      </p>
    </Tarjeta>
  )
}

function Cifra({ k, v, s, chico }: { k: string; v: string; s: string; chico?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] leading-[18px] text-muted-foreground">{k}</p>
      <p className={cn('mt-1 font-semibold tracking-tight tabular-nums text-foreground', chico ? 'text-[20px] leading-[32px] lg:leading-[38px]' : 'text-[28px] leading-[32px] lg:text-[32px] lg:leading-[38px]')}>{v}</p>
      <p className="mt-0.5 text-[12px] leading-[16px] text-muted-foreground tabular-nums">{s}</p>
    </div>
  )
}

function Cifras({ d }: { d: Datos }) {
  const s = d.salida
  const parcial = s && s.minutos < 60 ? `últimos ${s.minutos} min, llevado a la hora` : 'última hora · Gate 1 en adelante'
  const t = d.totales
  const lote = d.serie.lote
  return (
    <Tarjeta titulo="El grader ahora" icono={<Gauge className={IC} />}>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        <Cifra k="Piezas/h de salida" v={s ? milesPunto(s.piezasH) : '—'} s={parcial} />
        <Cifra k="kg/h de salida" v={s ? milesPunto(s.kgH) : '—'} s={s?.pesoMedio ? `peso medio ${coma1(s.pesoMedio)} kg` : 'sin pesos'} />
        {t.p0 !== null ? (
          <Cifra k="P0 del turno" v={`${coma1(t.p0)} %`} s={`${milesPunto(t.g0)} de ${milesPunto(t.piezas)} piezas`} />
        ) : (
          <Cifra
            k="P0 del turno"
            v="—"
            s={t.piezas >= PIEZAS_PARA_DECIR_SIN_GATE0 ? 'P0 llega con Puerta 0' : 'sin rechazos todavía'}
          />
        )}
        <Cifra
          k="Lote en curso"
          v={lote ? loteLegible(lote.lote) : '—'}
          s={lote ? `desde las ${horaDelEje(d.serie.t0Ms, lote.desdeMin)} · ${milesPunto(lote.piezas)} piezas` : 'sin lote'}
          chico
        />
      </div>
    </Tarjeta>
  )
}

/* Los trazos del Ritmo en vivo: el grader en el acento (2,5 px), las Baader como la curva de referencia (gris 1,5 px). */
const GRADER = 'var(--v2-acento)'
const BAADER = 'rgb(var(--muted-foreground) / 0.65)'

/** Une las detenciones por dueño para no apilar transparencias (tres Baader paradas = una banda). */
function bandas(paradas: Datos['paradas']): Array<{ desde: number; hasta: number; dueno: DuenoPerdida }> {
  const por = new Map<DuenoPerdida, Array<[number, number]>>()
  for (const p of paradas) {
    const l = por.get(p.dueno) ?? []
    l.push([p.desde, p.hasta])
    por.set(p.dueno, l)
  }
  const out: Array<{ desde: number; hasta: number; dueno: DuenoPerdida }> = []
  for (const [dueno, iv] of por) {
    iv.sort((a, b) => a[0] - b[0])
    let cur: [number, number] | null = null
    for (const x of iv) {
      if (cur && x[0] <= cur[1]) cur[1] = Math.max(cur[1], x[1])
      else { if (cur) out.push({ desde: cur[0], hasta: cur[1], dueno }); cur = [x[0], x[1]] }
    }
    if (cur) out.push({ desde: cur[0], hasta: cur[1], dueno })
  }
  return out
}

function Curva({ d }: { d: Datos }) {
  const [ref, w] = useAncho<HTMLDivElement>()
  const h = w >= 600 ? 240 : 180
  const L = d.retraso.min
  const sub = d.retraso.medido
    ? `Grader corrido ${L} min, el retraso medido en este turno (r ${(d.retraso.r ?? 0).toFixed(2).replace('.', ',')}).` // decimal-tecnico: ya pasa a coma
    : `Grader corrido ${L} min, ${RETRASO_REFERENCIA_FUENTE}: el turno aún no alcanza para medirlo.`
  return (
    <Tarjeta titulo="Piezas por minuto" sub={sub} icono={<Activity className={IC} />}>
      <div ref={ref} className="mt-3 w-full">
        {w > 0 && <CurvaSvg d={d} w={w} h={h} />}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] leading-[18px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[3px] w-4 rounded-full" style={{ background: GRADER }} />Grader</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[2px] w-4 rounded-full" style={{ background: BAADER }} />3 Baader 142</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3.5" style={{ background: `color-mix(in srgb, ${RELLENO_DUENO.mantencion} 22%, transparent)`, borderTop: `2px solid ${RELLENO_DUENO.mantencion}` }} />Detención Mantención</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3.5" style={{ background: `color-mix(in srgb, ${RELLENO_DUENO.externo} 22%, transparent)`, borderTop: `2px solid ${RELLENO_DUENO.externo}` }} />Otras detenciones</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3.5 border border-dashed" style={{ borderColor: 'var(--v2-gris)' }} />Programada</span>
      </div>
    </Tarjeta>
  )
}

function CurvaSvg({ d, w, h }: { d: Datos; w: number; h: number }) {
  const ml = 30
  const mr = 8
  const mt = 12
  const mb = 22
  const W = Math.max(10, w - ml - mr)
  const H = h - mt - mb
  const n = d.n
  const L = d.retraso.min
  const g = movil(d.serie.pz.slice(0, d.serie.hastaMin), 3)
  // Las Baader se dibujan desde que empieza su serie (antes van en NaN: sin cobertura).
  const b0 = d.baader ? Math.max(0, d.baader.findIndex((v) => Number.isFinite(v))) : 0
  const b = d.baader ? movil(d.baader.slice(b0, Math.min(d.baader.length, n)), 3) : []
  let tope = 10
  for (const v of g) tope = Math.max(tope, v)
  for (const v of b) tope = Math.max(tope, v)
  const paso = tope > 60 ? 20 : 10
  const max = Math.ceil(tope / paso) * paso
  const x = (m: number) => ml + (W * Math.max(0, Math.min(n, m))) / n
  const y = (v: number) => mt + H - (H * Math.min(v, max)) / max
  const traza = (vals: number[], corre: number) => {
    let s = ''
    for (let i = 0; i < vals.length; i++) {
      const m = i - corre
      if (m < 0 || m > n) continue
      s += `${s ? 'L' : 'M'}${x(m).toFixed(1)} ${y(vals[i] ?? 0).toFixed(1)}` // decimal-tecnico: ruta SVG, el punto es obligatorio
    }
    return s
  }
  const cada = W / n >= 1.6 ? 60 : 120
  const minDia = Math.floor(d.serie.t0Ms / 60_000)
  const primera = (60 - (((minDia % 60) + 60) % 60)) % 60
  const marcas: number[] = []
  for (let m = primera; m <= n; m += cada) marcas.push(m)
  const rayas: number[] = []
  for (let v = 0; v <= max; v += paso) rayas.push(v)
  const ultima = d.serie.hastaMin - L
  return (
    <svg width={w} height={h} role="img" aria-label="Piezas por minuto del grader y de las Baader" className="block">
      {rayas.map((v) => (
        <g key={v}>
          <line x1={ml} x2={w - mr} y1={y(v)} y2={y(v)} stroke="var(--v2-reja)" strokeWidth={1} />
          <text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground tabular-nums">{v}</text>
        </g>
      ))}
      {/* Detenciones como las bandas del Ritmo en vivo: velo del tono con su borde arriba; la programada, solo contorno punteado. */}
      {bandas(d.paradas).map((p, i) => {
        const bx = x(p.desde)
        const bw = Math.max(1, x(p.hasta) - x(p.desde))
        if (p.dueno === 'programado') {
          return <rect key={i} x={bx} y={mt} width={bw} height={H} rx={2} fill="none" stroke="var(--v2-gris)" strokeDasharray="3 3" />
        }
        const tono = RELLENO_DUENO[p.dueno]
        return (
          <g key={i}>
            <rect x={bx} y={mt} width={bw} height={H} fill={tono} fillOpacity={0.14} />
            <line x1={bx} x2={bx + bw} y1={mt} y2={mt} stroke={tono} strokeOpacity={0.7} strokeWidth={2} />
          </g>
        )
      })}
      {marcas.map((m) => (
        <text key={m} x={x(m)} y={h - 6} textAnchor="middle" fontSize={12} className="fill-muted-foreground tabular-nums">{horaDelEje(d.serie.t0Ms, m)}</text>
      ))}
      {b.length > 0 && <path d={traza(b, -b0)} fill="none" stroke={BAADER} strokeWidth={1.5} strokeLinejoin="round" />}
      <path d={traza(g, L)} fill="none" stroke={GRADER} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" data-serie="grader" />
      {ultima > 0 && ultima < n && (
        <>
          <line x1={x(ultima)} x2={x(ultima)} y1={mt} y2={mt + H} stroke="rgb(var(--foreground) / 0.35)" strokeWidth={1} />
          <circle cx={x(ultima)} cy={y(g[g.length - 1] ?? 0)} r={4.5} fill={GRADER} stroke="rgb(var(--background))" strokeWidth={2} />
        </>
      )}
    </svg>
  )
}

function P0Barras({ d }: { d: Datos }) {
  const [ref, w] = useAncho<HTMLDivElement>()
  const ts = d.p0
  const h = 130
  const ml = 26
  const mr = 8
  const mt = 8
  const mb = 20
  const W = Math.max(10, w - ml - mr)
  const H = h - mt - mb
  let tope = 6
  for (const t of ts) if (t.pct !== null && !t.pocaMasa) tope = Math.max(tope, Math.ceil(t.pct))
  const y = (v: number) => mt + H - (H * Math.min(v, tope)) / tope
  const bw = ts.length > 0 ? W / Math.max(ts.length, 8) : W
  const umbral = DEFAULT_P0_CRITICAL_PCT
  return (
    <Tarjeta titulo="P0 cada 15 min" sub={`Raya en ${coma1(umbral)} % · gris: menos de ${P0_LINE_MIN_PIECES} piezas en el tramo`} icono={<ShieldAlert className={IC} />}>
      <div ref={ref} className="mt-3 w-full">
        {d.totales.p0 === null ? (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {d.totales.piezas >= PIEZAS_PARA_DECIR_SIN_GATE0 ? 'P0 llega con Puerta 0: este informe no trae piezas de Gate 0.' : 'Sin rechazos todavía.'}
          </p>
        ) : w > 0 && (
          <svg width={w} height={h} role="img" aria-label="P0 por tramo de 15 minutos" className="block">
            {[0, Math.round(tope / 2), tope].map((v) => (
              <g key={v}>
                <line x1={ml} x2={w - mr} y1={y(v)} y2={y(v)} stroke="var(--v2-reja)" strokeWidth={1} />
                <text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground tabular-nums">{v}</text>
              </g>
            ))}
            {ts.map((t, i) => {
              if (t.pct === null) return null
              const alto = !t.pocaMasa && t.pct - umbral > 1e-9 /* la misma comparación de la regla */
              return (
                <rect
                  key={t.desde}
                  x={ml + i * bw + 1}
                  y={y(t.pct)}
                  width={Math.max(1, bw - 2)}
                  height={mt + H - y(t.pct)}
                  rx={2}
                  data-tramo={t.rotulo}
                  fill={t.pocaMasa ? 'var(--v2-prog)' : alto ? 'var(--v2-mal)' : 'var(--v2-acento)'}
                  fillOpacity={t.pocaMasa || alto ? 1 : 0.5}
                >
                  <title>{`${t.rotulo}: ${coma1(t.pct)} % (${milesPunto(t.g0)} de ${milesPunto(t.total)})`}</title>
                </rect>
              )
            })}
            <line x1={ml} x2={w - mr} y1={y(umbral)} y2={y(umbral)} stroke="var(--v2-mal)" strokeWidth={1} strokeDasharray="2 4" />
            {ts.map((t, i) => (i % 4 === 0 ? (
              <text key={`h${t.desde}`} x={ml + i * bw} y={h - 4} fontSize={12} className="fill-muted-foreground tabular-nums">{horaDelEje(d.serie.t0Ms, t.desde)}</text>
            ) : null))}
          </svg>
        )}
      </div>
    </Tarjeta>
  )
}

/** Las barras de la cascada «Dónde se fueron las piezas»: 2,5 de alto sobre `bg-muted`, la cifra a la derecha. */
function Reparto({ titulo, filas }: { titulo: string; filas: Array<{ clave: string; pct: number }> }) {
  return (
    <div>
      <p className="mb-1.5 text-[12px] leading-[16px] text-muted-foreground">{titulo}</p>
      <div className="space-y-1.5">
        {filas.map((f) => (
          <div key={f.clave} className="grid grid-cols-[72px_1fr_52px] items-center gap-2.5 text-[13px] leading-[18px]">
            <span className="truncate text-foreground/80">{f.clave}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${f.pct}%`, background: 'var(--v2-acento)' }} />
            </span>
            <span className="text-right font-semibold tabular-nums text-foreground">{coma1(f.pct)} %</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalibreCalidad({ d }: { d: Datos }) {
  const r = d.reparto
  return (
    <Tarjeta titulo="Calibre y calidad" sub="Salida del turno, sin Gate 0 ni piezas sin peso" icono={<Layers className={IC} />}>
      {r.calibre.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin piezas con peso todavía.</p>
      ) : (
        <>
          <div className="mt-3"><Reparto titulo="Calibre" filas={r.calibre} /></div>
          <div className="mt-4"><Reparto titulo="Calidad" filas={r.calidad} /></div>
        </>
      )}
    </Tarjeta>
  )
}

function LineaManual({ d }: { d: Datos }) {
  const filas = d.manual
  const tope = Math.max(1, ...filas.map((f) => Math.abs(f.diferencia)))
  const total = filas.reduce((a, f) => a + f.diferencia, 0)
  return (
    <Tarjeta titulo="Línea manual por hora" sub="Piezas del grader menos piezas de las Baader de la misma hora" icono={<Hand className={IC} />}>
      {!d.baader ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin la serie por minuto de Shoplogix no se puede restar.</p>
      ) : filas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Se calcula al cerrar la primera hora completa.</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {filas.map((f) => (
            <div key={f.hora} data-hora={f.hora} className="grid grid-cols-[48px_1fr_56px] items-center gap-2.5 text-[13px] leading-[18px]">
              <span className="tabular-nums text-foreground/80">{f.hora}</span>
              <span className="relative h-2.5 rounded-full bg-muted">
                <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-foreground/25" />
                <span
                  className={cn('absolute inset-y-0 rounded-full', f.diferencia >= 0 ? 'left-1/2' : 'right-1/2')}
                  style={{ width: `${(Math.abs(f.diferencia) / tope) * 50}%`, background: f.diferencia >= 0 ? 'var(--v2-acento)' : 'var(--v2-gris)' }}
                />
              </span>
              <span className="text-right font-semibold tabular-nums text-foreground">{f.diferencia > 0 ? '+' : f.diferencia < 0 ? '−' : ''}{milesPunto(Math.abs(f.diferencia))}</span>
            </div>
          ))}
          <p className="pt-1.5 text-[12px] leading-[16px] text-muted-foreground tabular-nums">
            {filas.length} {filas.length === 1 ? 'hora' : 'horas'}: {total > 0 ? '+' : total < 0 ? '−' : ''}{milesPunto(Math.abs(total))} piezas. La hora en curso entra al cerrar.
          </p>
        </div>
      )}
    </Tarjeta>
  )
}

type Pesca = NonNullable<Datos['pesca']>

/** Una fila de barra horizontal: rótulo, barra 2,5 sobre `bg-muted`, cifra a la derecha y una línea de detalle. */
function FilaBarra({ rotulo, n, pct, tono, detalle }: { rotulo: string; n: number; pct: number; tono: string; detalle?: string }) {
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,150px)_1fr_44px] items-center gap-2.5 text-[13px] leading-[18px]">
        <span className="truncate font-medium text-foreground">{rotulo}</span>
        <span className="h-2.5 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tono }} />
        </span>
        <span className="text-right font-semibold tabular-nums text-foreground">{milesPunto(n)}</span>
      </div>
      {detalle && <p className="mt-0.5 text-[12px] leading-[16px] text-muted-foreground tabular-nums">{detalle}</p>}
    </div>
  )
}

const lista = (r: Record<string, number>, max = 3) =>
  Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, max).map(([k, v]) => `${k.replace(/ lb/g, '')} ${milesPunto(v)}`).join(' · ')

/** Etapa 2: por qué va a P0, con el seteo inferido de las piezas. */
function CausasP0({ d, p }: { d: Datos; p: Pesca }) {
  const c = p.causas
  const tot = Math.max(1, c.total)
  const t = d.totales
  const ultHora = d.p0.filter((x) => x.completo).slice(-4)
  const hTot = ultHora.reduce((s, x) => s + x.total, 0)
  const hG0 = ultHora.reduce((s, x) => s + x.g0, 0)
  const sub = `${milesPunto(c.total)} pz${t.p0 !== null ? ` · ${coma1(t.p0)} % del turno` : ''}${hTot > 0 ? ` · última hora ${coma1((hG0 / hTot) * 100)} %` : ''}`
  const peso = [c.pesoSinGate['12-UP lb'] ? `${milesPunto(c.pesoSinGate['12-UP lb'])} sobre 5,5 kg sin gate 12-UP` : '', lista(Object.fromEntries(Object.entries(c.pesoSinGate).filter(([k]) => k !== '12-UP lb'))), c.pesoBajo ? `${milesPunto(c.pesoBajo)} bajo 0,9 kg` : ''].filter(Boolean).join(' · ')
  return (
    <Tarjeta titulo="Por qué va a P0" sub={sub} icono={<Filter className={IC} />}>
      {c.total === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin piezas en Gate 0 todavía.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          <FilaBarra rotulo="Sin gate para su peso" n={c.causas['sin-gate-peso']} pct={(c.causas['sin-gate-peso'] / tot) * 100} tono="var(--v2-mal)" detalle={peso || undefined} />
          <FilaBarra rotulo="Calidad sin gate" n={c.causas['calidad-sin-gate']} pct={(c.causas['calidad-sin-gate'] / tot) * 100} tono="var(--v2-atento)" detalle={lista(c.calidadSinGate) ? `${lista(c.calidadSinGate)}: ninguna gate tiene esa combinación.` : undefined} />
          <FilaBarra rotulo="Calidad D" n={c.causas['calidad-d']} pct={(c.causas['calidad-d'] / tot) * 100} tono="var(--v2-gris)" detalle="No hay gate D: van a P0 por diseño." />
          <FilaBarra rotulo="Tenía gate" n={c.causas['tenia-gate']} pct={(c.causas['tenia-gate'] / tot) * 100} tono="var(--v2-acento)" detalle="Causa física (fotocélula, fuera de límites, puerta no preparada): el detalle llega con Puerta 0." />
          <p className="pt-1 text-[12px] leading-[16px] text-muted-foreground">
            Con el seteo leído de las piezas de cada gate, por el peso y la calidad de cada pieza de Gate 0.{c.sinPeso > 0 ? ` ${milesPunto(c.sinPeso)} sin peso.` : ''}
          </p>
        </div>
      )}
    </Tarjeta>
  )
}

const TONO_810 = 'rgb(var(--muted-foreground) / 0.65)'

/** Etapa 1: zona compartida 4,59–4,99 kg y dónde cae el peso en cada gate (dato, sin aviso). */
function ZonaCompartida({ p }: { p: Pesca }) {
  const z = p.zonaHora
  const a = z.lados.find((l) => l.calibre === '8-10 lb')
  const b = z.lados.find((l) => l.calibre === '10-12 lb')
  const tono = (cal: string) => (cal === '8-10 lb' ? TONO_810 : 'var(--v2-acento)')
  return (
    <Tarjeta titulo="Zona compartida 4,59–4,99 kg" sub={`Premium, última hora (${p.hora.desde}–${p.hora.hasta}) · ${milesPunto(z.piezas)} pz`} icono={<SplitSquareHorizontal className={IC} />}>
      {z.piezas === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin piezas Premium en esa zona en la última hora.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex h-6 overflow-hidden rounded-[10px] text-[12px] font-semibold tabular-nums" role="img" aria-label={z.lados.map((l) => `${milesPunto(l.piezas)} a ${l.calibre}`).join(', ')}>
            {z.lados.map((l) => (
              <div key={l.calibre} className="flex items-center whitespace-nowrap px-2 text-white" style={{ flex: l.piezas, background: tono(l.calibre) }}>
                {l.calibre.replace(' lb', '')} · {milesPunto(l.piezas)}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-[16px] text-muted-foreground">
            {z.lados.map((l) => (
              <span key={l.calibre} className="inline-flex items-center gap-1.5">
                <i aria-hidden className="h-[3px] w-3 rounded-full" style={{ background: tono(l.calibre) }} />
                {l.calibre} · {l.destino} (G{l.gates.join(', G')})
              </span>
            ))}
          </div>
          {a && b && z.pct810 !== null && (
            <p className="text-[13px] leading-[18px] text-foreground/80 tabular-nums">
              Esta hora el {Math.round(z.pct810)} % de la zona fue a 8-10{p.zonaTurno.pct810 !== null ? `; en el turno, el ${Math.round(p.zonaTurno.pct810)} %` : ''}. La pieza va según el producto de cada gate, no por la balanza.
            </p>
          )}
          <BordesGate p={p} />
        </div>
      )}
    </Tarjeta>
  )
}

function BordesGate({ p }: { p: Pesca }) {
  const filas = p.bordes.filter((b) => b.bajo !== null)
  if (filas.length === 0) return null
  return (
    <div className="overflow-x-auto">
      <p className="mb-1.5 text-[12px] leading-[16px] text-muted-foreground">Peso en el borde del rango de cada gate (10 % de cada extremo del rango observado)</p>
      <table className="w-full text-[13px] leading-[18px] tabular-nums">
        <thead>
          <tr className="text-left text-[12px] text-muted-foreground">
            <th className="py-1 pr-2 font-normal">Gate</th>
            <th className="py-1 pr-2 font-normal">Programa</th>
            <th className="py-1 pr-2 text-right font-normal">pz</th>
            <th className="py-1 pr-2 text-right font-normal">Bajo</th>
            <th className="py-1 text-right font-normal">Alto</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((b) => (
            <tr key={b.gate} className="border-t border-border/60" data-gate={b.gate}>
              <td className="py-1 pr-2">G{b.gate}</td>
              <td className="py-1 pr-2 text-foreground/80"><span className="whitespace-nowrap">{b.programa.replace(' lb', '')}</span> <span className="text-muted-foreground">{b.destino.split(' · ')[1] ?? ''}</span></td>
              <td className="py-1 pr-2 text-right">{milesPunto(b.piezas)}</td>
              <td className="py-1 pr-2 text-right">{Math.round(b.bajo ?? 0)} %</td>
              <td className="py-1 text-right">{Math.round(b.alto ?? 0)} %</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Etapa 5: lote en curso, peso de la última hora contra el turno y los últimos 6 turnos. */
function LoteYPesca({ p }: { p: Pesca }) {
  const l = p.lote
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v)} %`)
  const kg = (v: number | null) => (v === null ? '—' : `${coma1(v)} kg`)
  return (
    <Tarjeta titulo={l ? `Lote ${loteLegible(l.lote)}` : 'Lote en curso'} sub={l ? `desde las ${l.desdeTs.slice(11, 16)} · ${milesPunto(l.piezas)} piezas` : undefined} icono={<Package className={IC} />}>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {l && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Cifra chico k="Calibre dominante" v={l.perfil.calibreDominante?.calibre.replace(' lb', '') ?? '—'} s={pct(l.perfil.calibreDominante?.pct)} />
              <Cifra chico k="10-12 lb" v={pct(l.perfil.calibrePct['10-12 lb'] ?? 0)} s={l.anterior ? `antes ${pct(l.anterior.perfil.calibrePct['10-12 lb'] ?? 0)}` : 'primer lote'} />
              <Cifra chico k="Premium" v={l.perfil.premiumPct === null ? '—' : `${coma1(l.perfil.premiumPct)} %`} s={l.anterior?.perfil.premiumPct != null ? `antes ${coma1(l.anterior.perfil.premiumPct)} %` : ''} />
              <Cifra chico k="Peso medio" v={kg(l.perfil.pesoMedioKg)} s={l.anterior ? `antes ${kg(l.anterior.perfil.pesoMedioKg)}` : ''} />
            </div>
          )}
          <HistPeso p={p} />
        </div>
        <TurnosAnteriores filas={p.filas} />
      </div>
    </Tarjeta>
  )
}

function HistPeso({ p }: { p: Pesca }) {
  const [ref, w] = useAncho<HTMLDivElement>()
  const h = 150
  const ml = 30
  const mb = 20
  const mt = 6
  const W = Math.max(10, w - ml - 6)
  const H = h - mt - mb
  const a = p.histHora.pct
  const b = p.histTurno.pct
  const tope = Math.max(10, Math.ceil(Math.max(...a, ...b) / 10) * 10)
  const bw = W / a.length
  const y = (v: number) => mt + H - (H * v) / tope
  return (
    <div>
      <p className="mb-1.5 text-[12px] leading-[16px] text-muted-foreground">Peso, última hora contra el turno (cada 250 g)</p>
      <div ref={ref} className="w-full">
        {w > 0 && (
          <svg width={w} height={h} role="img" aria-label="Distribución de peso cada 250 g" className="block">
            {[0, tope / 2, tope].map((v) => (
              <g key={v}>
                <line x1={ml} x2={w - 6} y1={y(v)} y2={y(v)} stroke="var(--v2-reja)" />
                <text x={ml - 6} y={y(v) + 4} textAnchor="end" fontSize={12} className="fill-muted-foreground tabular-nums">{v}</text>
              </g>
            ))}
            {a.map((v, i) => <rect key={i} x={ml + i * bw + 1} y={y(v)} width={Math.max(1, bw - 2)} height={mt + H - y(v)} rx={2} fill="var(--v2-acento)" fillOpacity={0.7} />)}
            <path d={b.map((v, i) => `${i ? 'L' : 'M'}${(ml + i * bw + bw / 2).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')} fill="none" stroke={TONO_810} strokeWidth={2} /* decimal-tecnico: ruta SVG */ />
            {[0, 4, 8, 12, 16, 20].map((i) => (
              <text key={i} x={ml + i * bw} y={h - 5} fontSize={12} className="fill-muted-foreground tabular-nums">{1 + i * 0.25}</text>
            ))}
          </svg>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-[16px] text-muted-foreground tabular-nums">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3 rounded-[3px]" style={{ background: 'var(--v2-acento)', opacity: 0.7 }} />Última hora · media {p.histHora.mediaKg === null ? '—' : `${coma1(p.histHora.mediaKg)} kg`}</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[2px] w-4 rounded-full" style={{ background: TONO_810 }} />Turno · media {p.histTurno.mediaKg === null ? '—' : `${coma1(p.histTurno.mediaKg)} kg`}</span>
      </div>
    </div>
  )
}

function TurnosAnteriores({ filas }: { filas: Pesca['filas'] }) {
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)} %`)
  return (
    <div className="overflow-x-auto">
      <p className="mb-1.5 text-[12px] leading-[16px] text-muted-foreground">Contra los últimos 6 turnos (cierre)</p>
      <table className="w-full text-[13px] leading-[18px] tabular-nums">
        <thead>
          <tr className="text-[12px] text-muted-foreground">
            <th className="py-1 pr-2 text-left font-normal">Turno</th>
            <th className="py-1 pr-2 text-right font-normal">pz/h</th>
            <th className="py-1 pr-2 text-right font-normal">P0</th>
            <th className="py-1 pr-2 text-right font-normal">kg</th>
            <th className="py-1 pr-2 text-right font-normal">6-8</th>
            <th className="py-1 pr-2 text-right font-normal">8-10</th>
            <th className="py-1 text-right font-normal">10-12</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={f.rotulo} className={cn('border-t border-border/60', i === 0 && 'font-semibold text-foreground')}>
              <td className="whitespace-nowrap py-1 pr-2">{f.rotulo}</td>
              <td className="py-1 pr-2 text-right">{f.pzH === null ? '—' : milesPunto(f.pzH)}</td>
              <td className="py-1 pr-2 text-right">{f.p0Pct === null ? '—' : `${coma1(f.p0Pct)} %`}</td>
              <td className="py-1 pr-2 text-right">{f.pesoMedioKg === null ? '—' : coma1(f.pesoMedioKg)}</td>
              <td className="py-1 pr-2 text-right">{pct(f.c68)}</td>
              <td className="py-1 pr-2 text-right">{pct(f.c810)}</td>
              <td className="py-1 text-right">{pct(f.c1012)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filas.length === 1 && <p className="mt-1.5 text-[12px] text-muted-foreground">Sin resúmenes de cierre de los días anteriores.</p>}
    </div>
  )
}

/** La pestaña en vivo. `null` mientras no haya piezas del espejo en el turno: la tarjeta del espejo explica por qué. */
export function GraderVivo(props: EntradaGraderVivo) {
  const { cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, resumenes, turnoActualId } = props
  const d = useMemo(
    () => armarGraderVivo({ cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, resumenes, turnoActualId }),
    [cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, resumenes, turnoActualId],
  )
  // Sin piezas del turno: solo las alertas (el lector caído antes del cambio de turno tiene que verse).
  if (d.serie.hastaMin === 0) {
    return d.alertas.length > 0 ? <div className="v2-vars" data-testid="grader-vivo"><Alertas d={d} ultimaHora={null} /></div> : null
  }
  const ultimaHora = d.serie.ultimaTs ? d.serie.ultimaTs.slice(11, 16) : null
  return (
    <div className="v2-vars space-y-3" data-testid="grader-vivo">
      <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
        <Alertas d={d} ultimaHora={ultimaHora} />
        <Cifras d={d} />
      </div>
      <Curva d={d} />
      {d.pesca?.seteo && (
        <>
          <SeteoGates s={d.pesca.seteo} />
          <PescaPorPrograma s={d.pesca.seteo} />
        </>
      )}
      {d.pesca && (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <CausasP0 d={d} p={d.pesca} />
            <ZonaCompartida p={d.pesca} />
          </div>
          <LoteYPesca p={d.pesca} />
        </>
      )}
      <div className="grid gap-3 lg:grid-cols-3">
        <P0Barras d={d} />
        <CalibreCalidad d={d} />
        <LineaManual d={d} />
      </div>
    </div>
  )
}
