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
import { cn } from '@/lib/utils'
import { DEFAULT_P0_CRITICAL_PCT, P0_LINE_MIN_PIECES } from '@/services/grader/graderP0Thresholds'
import { coma1, horaDelEje, milesPunto, type AlertaGrader } from '@/services/grader/espejo/alertasGrader'
import { RETRASO_REFERENCIA_FUENTE, movil } from '@/services/grader/espejo/graderVivo'
import type { DuenoPerdida } from '@/services/shoplogix/monitorEventos'
import { RELLENO_DUENO } from './ejeTurno'
import { PIEZAS_PARA_DECIR_SIN_GATE0, armarGraderVivo, type DatosGraderVivo, type EntradaGraderVivo } from './graderVivoDatos'

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

function Tarjeta({ titulo, sub, children, className }: { titulo?: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-card bg-card p-4', className)}>
      {titulo && <h3 className="text-headline font-semibold">{titulo}</h3>}
      {sub && <p className="text-footnote text-muted-foreground">{sub}</p>}
      {children}
    </section>
  )
}

function Alertas({ d, ultimaHora }: { d: Datos; ultimaHora: string | null }) {
  const a = d.alertas
  return (
    <Tarjeta titulo={a.length > 0 ? 'Pide atención' : 'Sin alertas'}>
      <ul className="mt-1 space-y-2" aria-label="Alertas del grader">
        {a.map((x: AlertaGrader) => (
          <li
            key={x.regla}
            data-regla={x.regla}
            className={cn('flex gap-2.5 rounded-[14px] px-3 py-2.5', x.nivel === 'mal' ? 'bg-ink-crit/[0.10]' : 'bg-ink-warn/[0.10]')}
          >
            <span aria-hidden className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.nivel === 'mal' ? 'bg-ink-crit' : 'bg-ink-warn')} />
            <div className="min-w-0">
              <p className={cn('text-subhead font-semibold tabular-nums', x.nivel === 'mal' ? 'text-ink-crit' : 'text-ink-warn')}>{x.titulo}</p>
              <p className="text-footnote text-muted-foreground">{x.detalle}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-footnote text-muted-foreground tabular-nums">
        {ultimaHora ? `Última pieza leída ${ultimaHora}. ` : ''}Las alertas se miden hasta la última pieza leída, no hasta la hora del reloj.
      </p>
    </Tarjeta>
  )
}

function Cifra({ k, v, s, chico }: { k: string; v: string; s: string; chico?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-footnote text-muted-foreground">{k}</p>
      <p className={cn('font-semibold tabular-nums', chico ? 'text-title3 leading-[34px]' : 'text-title1')}>{v}</p>
      <p className="text-footnote text-muted-foreground tabular-nums">{s}</p>
    </div>
  )
}

function Cifras({ d }: { d: Datos }) {
  const s = d.salida
  const parcial = s && s.minutos < 60 ? `últimos ${s.minutos} min, llevado a la hora` : 'última hora · Gate 1 en adelante'
  const t = d.totales
  const lote = d.serie.lote
  return (
    <Tarjeta>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 lg:grid-cols-4">
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

const GRADER = 'rgb(var(--brand))'
const BAADER = 'rgb(142 142 147 / 0.8)'

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
    ? `Grader corrido ${L} min, el retraso medido en este turno (r ${(d.retraso.r ?? 0).toFixed(2).replace('.', ',')}).`
    : `Grader corrido ${L} min, ${RETRASO_REFERENCIA_FUENTE}: el turno aún no alcanza para medirlo.`
  return (
    <Tarjeta titulo="Piezas por minuto" sub={sub}>
      <div ref={ref} className="mt-2 w-full">
        {w > 0 && <CurvaSvg d={d} w={w} h={h} />}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-footnote text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[3px] w-3.5 rounded-full" style={{ background: GRADER }} />Grader</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[3px] w-3.5 rounded-full" style={{ background: BAADER }} />3 Baader 142</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3.5 rounded-[3px] opacity-40" style={{ background: RELLENO_DUENO.mantencion }} />Detención Mantención</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3.5 rounded-[3px] opacity-40" style={{ background: RELLENO_DUENO.externo }} />Otras detenciones</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3.5 rounded-[3px] opacity-40" style={{ background: RELLENO_DUENO.programado }} />Programada</span>
      </div>
    </Tarjeta>
  )
}

function CurvaSvg({ d, w, h }: { d: Datos; w: number; h: number }) {
  const ml = 30
  const mr = 8
  const mt = 10
  const mb = 22
  const W = Math.max(10, w - ml - mr)
  const H = h - mt - mb
  const n = d.n
  const L = d.retraso.min
  const g = movil(d.serie.pz.slice(0, d.serie.hastaMin), 3)
  const b = d.baader ? movil(d.baader.slice(0, Math.min(d.baader.length, n)), 3) : []
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
      s += `${s ? 'L' : 'M'}${x(m).toFixed(1)} ${y(vals[i] ?? 0).toFixed(1)}`
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
      {bandas(d.paradas).map((p, i) => (
        <rect
          key={i}
          x={x(p.desde)}
          y={mt}
          width={Math.max(1, x(p.hasta) - x(p.desde))}
          height={H}
          fill={RELLENO_DUENO[p.dueno]}
          opacity={p.dueno === 'programado' ? 0.22 : 0.3}
        />
      ))}
      {rayas.map((v) => (
        <g key={v}>
          <line x1={ml} x2={w - mr} y1={y(v)} y2={y(v)} stroke="currentColor" className="text-border" strokeWidth={1} />
          <text x={ml - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-caption tabular-nums">{v}</text>
        </g>
      ))}
      {marcas.map((m) => (
        <text key={m} x={x(m)} y={h - 6} textAnchor="middle" className="fill-muted-foreground text-caption tabular-nums">{horaDelEje(d.serie.t0Ms, m)}</text>
      ))}
      {b.length > 0 && <path d={traza(b, 0)} fill="none" stroke={BAADER} strokeWidth={1.5} />}
      <path d={traza(g, L)} fill="none" stroke={GRADER} strokeWidth={2} data-serie="grader" />
      {ultima > 0 && ultima < n && (
        <line x1={x(ultima)} x2={x(ultima)} y1={mt} y2={mt + H} stroke="currentColor" className="text-muted-foreground" strokeDasharray="2 3" />
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
    <Tarjeta titulo="P0 cada 15 min" sub={`Raya en ${coma1(umbral)} % · gris: menos de ${P0_LINE_MIN_PIECES} piezas en el tramo`}>
      <div ref={ref} className="mt-2 w-full">
        {d.totales.p0 === null ? (
          <p className="py-6 text-center text-footnote text-muted-foreground">
            {d.totales.piezas >= PIEZAS_PARA_DECIR_SIN_GATE0 ? 'P0 llega con Puerta 0: este informe no trae piezas de Gate 0.' : 'Sin rechazos todavía.'}
          </p>
        ) : w > 0 && (
          <svg width={w} height={h} role="img" aria-label="P0 por tramo de 15 minutos" className="block">
            {[0, Math.round(tope / 2), tope].map((v) => (
              <text key={v} x={ml - 6} y={y(v) + 4} textAnchor="end" className="fill-muted-foreground text-caption tabular-nums">{v}</text>
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
                  className={t.pocaMasa ? 'fill-muted-foreground/30' : alto ? 'fill-ink-crit' : 'fill-primary/55'}
                >
                  <title>{`${t.rotulo}: ${coma1(t.pct)} % (${milesPunto(t.g0)} de ${milesPunto(t.total)})`}</title>
                </rect>
              )
            })}
            <line x1={ml} x2={w - mr} y1={y(umbral)} y2={y(umbral)} stroke="currentColor" className="text-ink-crit" strokeDasharray="4 3" />
            {ts.map((t, i) => (i % 4 === 0 ? (
              <text key={`h${t.desde}`} x={ml + i * bw} y={h - 4} className="fill-muted-foreground text-caption tabular-nums">{horaDelEje(d.serie.t0Ms, t.desde)}</text>
            ) : null))}
          </svg>
        )}
      </div>
    </Tarjeta>
  )
}

function Reparto({ filas }: { filas: Array<{ clave: string; pct: number }> }) {
  return (
    <div className="space-y-1">
      {filas.map((f) => (
        <div key={f.clave} className="grid grid-cols-[76px_1fr_52px] items-center gap-2 text-footnote">
          <span className="truncate">{f.clave}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted-foreground/15">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${f.pct}%` }} />
          </span>
          <span className="text-right tabular-nums">{coma1(f.pct)} %</span>
        </div>
      ))}
    </div>
  )
}

function CalibreCalidad({ d }: { d: Datos }) {
  const r = d.reparto
  return (
    <Tarjeta titulo="Calibre y calidad" sub="Salida del turno, sin Gate 0 ni piezas sin peso">
      {r.calibre.length === 0 ? (
        <p className="py-6 text-center text-footnote text-muted-foreground">Sin piezas con peso todavía.</p>
      ) : (
        <>
          <div className="mt-2"><Reparto filas={r.calibre} /></div>
          <div className="mt-3"><Reparto filas={r.calidad} /></div>
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
    <Tarjeta titulo="Línea manual por hora" sub="Piezas del grader menos piezas de las Baader de la misma hora">
      {!d.baader ? (
        <p className="py-6 text-center text-footnote text-muted-foreground">Sin la serie por minuto de Shoplogix no se puede restar.</p>
      ) : filas.length === 0 ? (
        <p className="py-6 text-center text-footnote text-muted-foreground">Se calcula al cerrar la primera hora completa.</p>
      ) : (
        <div className="mt-2 space-y-1">
          {filas.map((f) => (
            <div key={f.hora} data-hora={f.hora} className="grid grid-cols-[52px_1fr_60px] items-center gap-2 text-footnote">
              <span className="tabular-nums">{f.hora}</span>
              <span className="relative h-2">
                <span aria-hidden className="absolute inset-y-[-3px] left-1/2 w-px bg-border" />
                <span
                  className={cn('absolute inset-y-0 rounded-full', f.diferencia >= 0 ? 'left-1/2 bg-primary' : 'right-1/2 bg-muted-foreground/60')}
                  style={{ width: `${(Math.abs(f.diferencia) / tope) * 50}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{f.diferencia > 0 ? '+' : f.diferencia < 0 ? '−' : ''}{milesPunto(Math.abs(f.diferencia))}</span>
            </div>
          ))}
          <p className="pt-1 text-footnote text-muted-foreground tabular-nums">
            {filas.length} {filas.length === 1 ? 'hora' : 'horas'}: {total > 0 ? '+' : total < 0 ? '−' : ''}{milesPunto(Math.abs(total))} piezas. La hora en curso entra al cerrar.
          </p>
        </div>
      )}
    </Tarjeta>
  )
}

/** La pestaña en vivo. `null` mientras no haya piezas del espejo en el turno: la tarjeta del espejo explica por qué. */
export function GraderVivo(props: EntradaGraderVivo) {
  const { cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso } = props
  const d = useMemo(
    () => armarGraderVivo({ cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso }),
    [cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso],
  )
  if (d.serie.hastaMin === 0) return null
  const ultimaHora = d.serie.ultimaTs ? d.serie.ultimaTs.slice(11, 16) : null
  return (
    <div className="v2-vars space-y-3" data-testid="grader-vivo">
      <div className="grid gap-3 lg:grid-cols-[2fr_3fr]">
        <Alertas d={d} ultimaHora={ultimaHora} />
        <Cifras d={d} />
      </div>
      <Curva d={d} />
      <div className="grid gap-3 lg:grid-cols-3">
        <P0Barras d={d} />
        <CalibreCalidad d={d} />
        <LineaManual d={d} />
      </div>
    </div>
  )
}
