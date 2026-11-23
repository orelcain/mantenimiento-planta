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
import { BellRing, Filter, Hand, Layers, Package, SplitSquareHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { coma1, horaDelEje, milesPunto, type AlertaGrader } from '@/services/grader/espejo/alertasGrader'
import { Tarjeta } from './TarjetaVivo'
import { CuantoLlevamos } from './CuantoLlevamos'
import { HayQueHacerAlgo } from './HayQueHacerAlgo'
import { GraficoVivo } from './GraficoVivo'
import { cuentaDelTurno } from './cuantoLlevamosDatos'
import { armarGraderVivo, type DatosGraderVivo, type EntradaGraderVivo } from './graderVivoDatos'
import { SeteoGates, PescaPorPrograma } from './SeteoGatesVivo'
import { desgloseP0 } from '@/services/grader/espejo/motivoP0'

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
  const leidas = filas.filter((f) => f.diferencia !== null)
  const tope = Math.max(1, ...leidas.map((f) => Math.abs(f.diferencia ?? 0)))
  const total = leidas.reduce((a, f) => a + (f.diferencia ?? 0), 0)
  const sinLectura = filas.length - leidas.length
  return (
    <Tarjeta titulo="Línea manual por hora" sub="Piezas del grader menos piezas de las Baader de la misma hora" icono={<Hand className={IC} />}>
      {!d.baader ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin la serie por minuto de Shoplogix no se puede restar.</p>
      ) : filas.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Se calcula al cerrar la primera hora completa.</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {filas.map((f) => f.diferencia === null ? (
            <div key={f.hora} data-hora={f.hora} data-sin-lectura className="grid grid-cols-[48px_1fr_56px] items-center gap-2.5 text-[13px] leading-[18px]">
              <span className="tabular-nums text-foreground/80">{f.hora}</span>
              <span className="h-2.5 rounded-full border border-dashed border-border" aria-hidden />
              <span className="text-right text-[12px] text-muted-foreground">sin lectura</span>
            </div>
          ) : (
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
            {leidas.length} {leidas.length === 1 ? 'hora' : 'horas'}: {total > 0 ? '+' : total < 0 ? '−' : ''}{milesPunto(Math.abs(total))} piezas.{sinLectura > 0 ? ` ${sinLectura === 1 ? 'Una hora queda' : `${sinLectura} horas quedan`} fuera: el espejo no la leyó entera.` : ''} La hora en curso entra al cerrar.
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

/** Etapa 2: por qué va a P0, por dueño (Mantención / seteo y pesca). Exacto con Puerta 0; si no, estimado. */
function CausasP0({ d, p }: { d: Datos; p: Pesca }) {
  const r = p.p0Dueno
  const tot = Math.max(1, r.pz)
  const t = d.totales
  const ultHora = d.p0.filter((x) => x.completo).slice(-4)
  const hTot = ultHora.reduce((s, x) => s + x.total, 0)
  const hG0 = ultHora.reduce((s, x) => s + x.g0, 0)
  const sub = `${milesPunto(r.pz)} pz${t.p0 !== null ? ` · ${coma1(t.p0)} % del turno` : ''}${hTot > 0 ? ` · última hora ${coma1((hG0 / hTot) * 100)} %` : ''}`
  const desglose = desgloseP0(r)
  const pctExacto = r.pctExacto === null ? 0 : r.pctExacto
  // En mixto, cuántas piezas traen su motivo. Sin Puerta 0, fotocélula y puerta no se separan (23-11).
  const fuente = r.exactitud === 'exacto'
    ? 'motivo de Matrix (Puerta 0)'
    : r.exactitud === 'mixto'
      ? `motivo de Matrix en el ${Math.round(pctExacto)} % de las piezas · resto estimado`
      : 'estimado sin Puerta 0 · fotocélula y puerta no se separan'
  const linea = (k: string, n: number) => (n > 0 ? <p key={k} className="pl-[22px] text-[12px] leading-[16px] text-muted-foreground tabular-nums">{k === 'No leído por fotocélula' ? 'Fotocélula' : k} {milesPunto(n)}</p> : null)
  return (
    <Tarjeta titulo="Por qué va a P0" sub={sub} icono={<Filter className={IC} />}>
      {r.pz === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin piezas en Gate 0 todavía.</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          <FilaBarra rotulo="Mantención" n={r.mantencion.pz} pct={(r.mantencion.pz / tot) * 100} tono="var(--v2-mant)" detalle={`${milesPunto(Math.round(r.mantencion.kg))} kg`} />
          {desglose.mantencion.map((x) => linea(x.rotulo, x.pz))}
          <FilaBarra rotulo="Seteo y pesca" n={r.seteo.pz} pct={(r.seteo.pz / tot) * 100} tono="var(--v2-ext)" detalle={`${milesPunto(Math.round(r.seteo.kg))} kg`} />
          {desglose.seteo.map((x) => linea(x.rotulo, x.pz))}
          {r.sinReparto.pz > 0 && <FilaBarra rotulo="Sin reparto" n={r.sinReparto.pz} pct={(r.sinReparto.pz / tot) * 100} tono="var(--v2-gris)" detalle="Sin peso: no se puede repartir." />}
          <p className="pt-1 text-[12px] leading-[16px] text-muted-foreground">Fuente: {fuente}.</p>
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
      <p className="mb-1.5 text-[12px] leading-[16px] text-muted-foreground">Este turno (primera fila) y los 6 anteriores (cierre)</p>
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
export function GraderVivo(props: EntradaGraderVivo & { publico?: boolean }) {
  const { publico = false, cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, resumenes, turnoActualId, gate0Exacto } = props
  const d = useMemo(
    () => armarGraderVivo({ cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, resumenes, turnoActualId, gate0Exacto }),
    [cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, resumenes, turnoActualId, gate0Exacto],
  )
  // Sin piezas del turno: solo las alertas (el lector caído antes del cambio de turno tiene que verse).
  if (d.serie.hastaMin === 0) {
    return d.alertas.length > 0 ? <div className="v2-vars" data-testid="grader-vivo"><Alertas d={d} ultimaHora={null} /></div> : null
  }
  const ultimaHora = d.serie.ultimaTs ? d.serie.ultimaTs.slice(11, 16) : null
  return (
    <div className="v2-vars space-y-3" data-testid="grader-vivo">
      <div className="grid gap-3 lg:grid-cols-3">
        <Alertas d={d} ultimaHora={ultimaHora} />
        <CuantoLlevamos c={cuentaDelTurno(d.serie, d.baader, d.retraso.min, d.sinLectura)} sub={`desde las ${horaDelEje(d.serie.t0Ms, 0)}`} />
        {d.pesca && <HayQueHacerAlgo h={d.pesca.hacer} />}
      </div>
      <GraficoVivo d={d} />
      {d.pesca?.seteo && (
        <>
          <SeteoGates s={d.pesca.seteo} />
          <PescaPorPrograma s={d.pesca.seteo} publico={publico} />
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
      <div className="grid gap-3 lg:grid-cols-2">
        <CalibreCalidad d={d} />
        <LineaManual d={d} />
      </div>
    </div>
  )
}
