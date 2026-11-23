/**
 * «Por qué va a P0» (mockup v4, versión 5): el árbol que cuadra y las hojas que abren sus filas, los tramos del
 * gráfico y sus minutos. Las cuentas viven en `porQueP0Datos.ts`.
 */
import { useMemo, useState } from 'react'
import { ChevronRight, Filter } from 'lucide-react'
import { Sheet } from '@/components/piel'
import { cn } from '@/lib/utils'
import { coma1, horaDelEje, milesPunto } from '@/services/grader/espejo/alertasGrader'
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import type { PiezaP0 } from '@/services/grader/espejo/motivoP0'
import { Tarjeta } from './TarjetaVivo'
import { piezasDeCombo, rotuloCalibres } from './hayQueHacerDatos'
import { detalleMinuto, resumenFila, type ArbolP0, type ClaveFila, type FilaArbol } from './porQueP0Datos'

const IC = 'h-3.5 w-3.5'
const pzDe = (f: FilaArbol) => (f.piezas ? f.piezas.reduce((s, x) => s + x.cantidad, 0) : 0)
const tono = (f: FilaArbol) => (f.dueno === 'mantencion' ? 'var(--v2-mant)' : f.dueno === 'seteo' ? 'var(--v2-ext)' : 'var(--v2-gris)')

/** Qué hoja está abierta. */
export type HojaP0 = { tipo: 'fila'; clave: ClaveFila } | { tipo: 'combo'; calibres: string[]; calidad: string } | { tipo: 'tramo'; desdeMin: number } | { tipo: 'minuto'; min: number } | null

function Chip({ tono: t, children }: { tono: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold leading-4 tabular-nums" style={{ background: 'var(--v2-reja)' }}>
      <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: t }} />
      {children}
    </span>
  )
}

/** Barra horizontal: rótulo, barra y cifra. */
export function Barra({ rotulo, n, pct, color, title, nota, sub }: { rotulo: string; n: string; pct: number; color: string; title?: string; nota?: string; sub?: boolean }) {
  return (
    <>
      <span className={cn('min-w-0 text-[13px] leading-[18px]', sub ? 'pl-4 text-muted-foreground' : 'truncate font-medium text-foreground')} title={title}>
        {rotulo}
        {nota && <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">{nota}</span>}
      </span>
      <span className="h-2.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color, opacity: sub ? 0.7 : 1 }} />
      </span>
      <span className="text-right text-[13px] leading-[18px] tabular-nums">{n}</span>
    </>
  )
}

export function PorQueP0({ a, piezasTurno, hasta, onAbrir }: { a: ArbolP0; piezasTurno: number; hasta: string; onAbrir: (k: ClaveFila) => void }) {
  const tot = Math.max(1, a.total)
  // Dos decimales, como el mockup («0,46 %»): sobre las piezas del turno el P0 de cada dueño es chico.
  const pct = (n: number) => (piezasTurno > 0 ? ((n / piezasTurno) * 100).toFixed(2).replace('.', ',') : '—') // decimal-tecnico: ya pasa a coma
  const sub = `${a.exacto ? 'Puerta 0' : 'Estimado'} hasta ${hasta} · ${milesPunto(a.total)} pz${piezasTurno > 0 ? ` · ${coma1((a.total / piezasTurno) * 100)} %` : ''} · toca una fila`
  return (
    <Tarjeta titulo="Por qué va a P0" sub={sub} icono={<Filter className={IC} />}>
      {a.total === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Sin piezas en Gate 0 todavía.</p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="flex flex-wrap gap-2">
            <Chip tono="var(--v2-mant)">Mantención {milesPunto(a.mant)} · {pct(a.mant)} %</Chip>
            <Chip tono="var(--v2-ext)">Seteo {milesPunto(a.seteo)} · {pct(a.seteo)} %</Chip>
            {!a.exacto && <span className="self-center text-[12px] text-muted-foreground">estimado</span>}
          </p>
          <ul className="space-y-0.5" data-testid="arbol-p0">
            {a.filas.map((f) => {
              const n = pzDe(f)
              return (
                <li key={f.clave}>
                  <button
                    type="button"
                    data-fila={f.clave}
                    onClick={() => onAbrir(f.clave)}
                    className={cn(
                      'tap-44 grid w-full grid-cols-[minmax(0,1fr)_minmax(40px,24%)_36px_14px] items-center gap-2 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--v2-acento)_10%,transparent)]',
                      f.nivel === 1 && 'ml-3 w-[calc(100%-12px)] border-l border-border/60',
                      f.piezas !== null && n === 0 && 'opacity-60',
                    )}
                  >
                    <Barra rotulo={f.corto ?? f.rotulo} title={f.rotulo} nota={f.nota} n={f.piezas === null ? '—' : milesPunto(n)} pct={(n / tot) * 100} color={tono(f)} sub={f.nivel === 1} />
                    <ChevronRight aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </li>
              )
            })}
          </ul>
          <details className="text-[12px] leading-[16px] text-muted-foreground">
            <summary className="cursor-pointer select-none">Fuente</summary>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {a.exacto ? (
                <>
                  <li>Puerta 0 de Matrix cruzada con el espejo por hora y peso ({milesPunto(a.total - a.sinLectura)} de {milesPunto(a.total)}).{a.sinLectura > 0 ? ` Las ${milesPunto(a.sinLectura)} restantes cayeron donde el espejo no leyó.` : ''}</li>
                  <li>Los hijos suman el padre. Calibre por peso contra el seteo leído de las piezas. «Sin explicación»: tenía gate según el seteo, o cayó donde no hay lectura.</li>
                  <li>Conservación y producto: Matrix marca toda pieza de P0 como CONGELADO · DESTINO FILETE; no se pueden cruzar.</li>
                </>
              ) : (
                <li>Sin Puerta 0: el motivo sale del seteo leído de las piezas. Fotocélula y puerta no se separan (las dos tenían gate).</li>
              )}
            </ul>
          </details>
        </div>
      )}
    </Tarjeta>
  )
}

export function Seccion({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="rounded-[14px] bg-card p-4">
      <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-foreground">{titulo}{extra}</h4>
      {children}
    </section>
  )
}

function HojaFila({ f, hasta }: { f: FilaArbol; hasta: string }) {
  if (f.piezas === null) return <p className="text-[13px] text-muted-foreground">Matrix marca toda pieza de P0 como CONGELADO · DESTINO FILETE: no hay con qué cruzar la conservación ni el producto.</p>
  if (f.piezas.length === 0) return <p className="text-[13px] text-muted-foreground">Ninguna pieza hasta las {hasta}.</p>
  const r = resumenFila(f.piezas)
  const mxG = Math.max(1, ...r.porGate.map((x) => x.n))
  const mxH = Math.max(1, ...r.porHora.map((x) => x.n))
  const lista = [...f.piezas].sort((x, y) => x.ts.localeCompare(y.ts))
  return (
    <div className="space-y-3">
      <Seccion titulo="Gate que le tocaba">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(48px,35%)_40px] items-center gap-x-2 gap-y-1.5">
          {r.porGate.map((x) => <Barra key={x.gate} rotulo={x.gate} n={milesPunto(x.n)} pct={(x.n / mxG) * 100} color={tono(f)} />)}
        </div>
      </Seccion>
      <Seccion titulo="Por hora">
        <div className="flex h-[88px] items-end gap-1">
          {r.porHora.map((x) => (
            <div key={x.hora} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="text-[12px] tabular-nums text-foreground">{x.n}</span>
              <span className="w-full rounded-t-[3px]" style={{ height: `${(x.n / mxH) * 48}px`, background: tono(f) }} />
              <span className="text-[12px] tabular-nums text-muted-foreground">{x.hora}</span>
            </div>
          ))}
        </div>
      </Seccion>
      <Seccion titulo="Piezas">
        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full text-[13px] leading-[18px]">
            <thead className="sticky top-0 bg-card text-left text-[12px] text-muted-foreground">
              <tr><th className="py-1 font-medium">Minuto</th><th className="py-1 font-medium">Peso</th><th className="py-1 font-medium">Calidad</th><th className="py-1 font-medium">Gate</th></tr>
            </thead>
            <tbody>
              {lista.map((p, i) => (
                <tr key={`${p.ts}-${i}`} className="border-t border-border/40">
                  <td className="py-1 pr-2 tabular-nums">{p.ts.slice(11, 16)}</td>
                  <td className="py-1 pr-2 tabular-nums whitespace-nowrap">{p.kg === null ? '—' : `${p.kg.toFixed(2).replace('.', ',')} kg`}</td>{/* decimal-tecnico: ya pasa a coma */}
                  <td className="py-1">{p.calidad}</td>
                  <td className="py-1">{p.gate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Seccion>
    </div>
  )
}

type FiltroMotivo = '' | 'foto' | 'fdl' | 'puerta' | 'tooclose'
const MOTIVOS: Record<Exclude<FiltroMotivo, ''>, string[]> = {
  foto: ['No leído por fotocélula', 'Fotocélula o puerta'],
  fdl: ['Fuera de límites', 'Sin gate de calibre', 'Sin gate de calidad'],
  puerta: ['Puerta no preparada'],
  tooclose: ['Too close or too long'],
}

function DetalleMin({ m, gate }: { m: ReturnType<typeof detalleMinuto>; gate: string }) {
  const mx = Math.max(1, ...m.porGate)
  const p0 = [...m.mant, ...m.seteo].reduce((s, x) => s + x.n, 0)
  const grupo = (titulo: string, t: string, filas: Array<{ rotulo: string; n: number }>) => (
    <div className="space-y-1.5">
      <p className="flex items-center justify-between text-[13px]"><Chip tono={t}>{titulo}</Chip><b className="tabular-nums">{filas.reduce((s, x) => s + x.n, 0)}</b></p>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(48px,35%)_40px] items-center gap-x-2 gap-y-1">
        {filas.map((x) => <Barra key={x.rotulo} rotulo={x.rotulo} n={String(x.n)} pct={p0 ? (x.n / p0) * 100 : 0} color={t} sub />)}
      </div>
    </div>
  )
  return (
    <div className="space-y-3">
      {m.leidas > 0 && (
        <Seccion titulo="A qué gate fueron">
          <div className="flex h-[96px] items-end gap-1" role="img" aria-label="Piezas por gate en el minuto">
            {m.porGate.map((v, g) => (
              <div key={g} className={cn('flex flex-1 flex-col items-center gap-0.5', gate !== '' && Number(gate) !== g && 'opacity-30')}>
                <span className="text-[12px] tabular-nums text-foreground">{v || ''}</span>
                <span className="w-full rounded-t-[3px]" style={{ height: `${Math.max(v ? 2 : 0, (v / mx) * 56)}px`, background: g === 0 ? 'var(--v2-mal)' : 'var(--v2-acento)' }} />
                <span className="text-[12px] tabular-nums text-muted-foreground">{g === 0 ? 'P0' : g}</span>
              </div>
            ))}
          </div>
        </Seccion>
      )}
      <Seccion titulo="Por qué cayeron a P0" extra={m.estimado ? <span className="text-[12px] font-normal text-muted-foreground">estimado</span> : undefined}>
        {p0 === 0 ? <p className="text-[13px] text-muted-foreground">Ninguna pieza a P0 en este minuto.</p> : (
          <div className="space-y-3">
            {m.mant.length > 0 && grupo('Mantención', 'var(--v2-mant)', m.mant)}
            {m.seteo.length > 0 && grupo('Seteo (Control de Producción)', 'var(--v2-ext)', m.seteo)}
          </div>
        )}
      </Seccion>
    </div>
  )
}

function HojaTramo({ desdeMin, t0Ms, hastaMin, piezas, porPieza, sinLectura }: { desdeMin: number; t0Ms: number; hastaMin: number; piezas: readonly PiezaEspejo[]; porPieza: readonly PiezaP0[]; sinLectura: readonly boolean[] }) {
  const [gate, setGate] = useState('')
  const [motivo, setMotivo] = useState<FiltroMotivo>('')
  const mins = useMemo(() => {
    const out: number[] = []
    for (let m = desdeMin; m < Math.min(hastaMin, desdeMin + 15); m++) out.push(m)
    return out
  }, [desdeMin, hastaMin])
  const det = useMemo(() => mins.map((m) => detalleMinuto(piezas, porPieza, new Date(t0Ms + m * 60_000).toISOString())), [mins, piezas, porPieza, t0Ms])
  const cuenta = (i: number) => {
    const d = det[i]!
    if (gate !== '') return d.porGate[Number(gate)] ?? 0
    const todos = [...d.mant, ...d.seteo]
    if (motivo) return todos.filter((x) => MOTIVOS[motivo].includes(x.rotulo)).reduce((s, x) => s + x.n, 0)
    return todos.reduce((s, x) => s + x.n, 0)
  }
  const mayor = det.reduce((b, _, i) => (cuenta(i) > cuenta(b) ? i : b), 0)
  const [sel, setSel] = useState<number | null>(null)
  const i = sel ?? mayor
  const hueco = mins.some((m) => sinLectura[m])
  const SELECT = 'tap-44 mt-1 h-10 w-full rounded-[10px] border border-border/60 bg-background px-2 text-[13px] text-foreground'
  return (
    <div className="space-y-3">
      {hueco && <p className="text-[13px] text-muted-foreground">Tramo con minutos sin lectura del espejo.</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[12px] text-muted-foreground">Gate
          <select className={SELECT} value={gate} onChange={(e) => { setGate(e.target.value); setMotivo(''); setSel(null) }}>
            <option value="">Todas</option>
            {Array.from({ length: 13 }, (_, g) => <option key={g} value={String(g)}>{g ? `Gate ${g}` : 'P0'}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-muted-foreground">Motivo
          <select className={SELECT} value={motivo} onChange={(e) => { setMotivo(e.target.value as FiltroMotivo); setGate(''); setSel(null) }}>
            <option value="">Todos</option>
            <option value="foto">Fotocélula</option>
            <option value="fdl">Fuera de límites</option>
            <option value="puerta">Puerta no preparada</option>
            <option value="tooclose">Too close</option>
          </select>
        </label>
      </div>
      <div role="group" aria-label="Minutos del tramo" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {mins.map((m, k) => {
          const n = cuenta(k)
          return (
            <button key={m} type="button" aria-pressed={k === i} onClick={() => setSel(k)}
              className={cn('tap-44 h-9 shrink-0 rounded-full px-3 text-[13px] tabular-nums', k === i ? 'bg-foreground text-background' : 'bg-muted text-foreground')}>
              {horaDelEje(t0Ms, m)}{n ? ` · ${n}` : ''}
            </button>
          )
        })}
      </div>
      {det[i] && <DetalleMin m={det[i]!} gate={gate} />}
    </div>
  )
}

/** Las hojas de «Por qué va a P0» y del gráfico. */
export function HojasP0({ hoja, onCerrar, a, t0Ms, hastaMin, piezas, porPieza, sinLectura, g0, hasta }: {
  hoja: HojaP0
  onCerrar: () => void
  a: ArbolP0
  t0Ms: number
  hastaMin: number
  piezas: readonly PiezaEspejo[]
  porPieza: readonly PiezaP0[]
  sinLectura: readonly boolean[]
  g0: readonly number[]
  hasta: string
}) {
  let titulo = ''
  let desc = ''
  let cuerpo: React.ReactNode = null
  if (hoja?.tipo === 'fila') {
    const f = a.filas.find((x) => x.clave === hoja.clave)
    if (f) {
      titulo = f.rotulo
      const r = f.piezas ? resumenFila(f.piezas) : null
      desc = f.piezas === null ? 'Sin dato' : `${milesPunto(pzDe(f))} pz · ${milesPunto(Math.round(r!.kg))} kg · hasta ${hasta}`
      cuerpo = <HojaFila f={f} hasta={hasta} />
    }
  } else if (hoja?.tipo === 'combo') {
    const piezasC = piezasDeCombo(porPieza, hoja.calibres, hoja.calidad)
    const rot = `${rotuloCalibres(hoja.calibres)} ${hoja.calidad}`
    const f: FilaArbol = { clave: 'calibre', rotulo: `Agregar gate ${rot}`, nivel: 0, dueno: 'seteo', piezas: piezasC }
    const r = resumenFila(piezasC)
    titulo = f.rotulo
    desc = `${milesPunto(pzDe(f))} pz · ${milesPunto(Math.round(r.kg))} kg a P0 · hasta ${hasta}`
    cuerpo = (
      <div className="space-y-3">
        <p className="text-[13px] leading-[18px] text-muted-foreground">Hoy ninguna gate recibe {rot}: estas piezas pasaron de largo por Gate 0. Con una gate programada para {rot} dejarían de ir a P0.</p>
        <HojaFila f={f} hasta={hasta} />
      </div>
    )
  } else if (hoja?.tipo === 'tramo') {
    let tot = 0
    let p0 = 0
    for (let m = hoja.desdeMin; m < hoja.desdeMin + 15; m++) { p0 += g0[m] ?? 0 }
    for (const p of piezas) {
      const k = Math.floor((Date.parse(p.ts) - t0Ms) / 60_000)
      if (k >= hoja.desdeMin && k < hoja.desdeMin + 15) tot += p.cantidad
    }
    titulo = `${horaDelEje(t0Ms, hoja.desdeMin)} a ${horaDelEje(t0Ms, Math.min(hastaMin, hoja.desdeMin + 15))}`
    desc = `${milesPunto(tot)} piezas · ${milesPunto(p0)} a P0`
    cuerpo = <HojaTramo key={hoja.desdeMin} desdeMin={hoja.desdeMin} t0Ms={t0Ms} hastaMin={hastaMin} piezas={piezas} porPieza={porPieza} sinLectura={sinLectura} />
  } else if (hoja?.tipo === 'minuto') {
    const m = detalleMinuto(piezas, porPieza, new Date(t0Ms + hoja.min * 60_000).toISOString())
    const p0 = [...m.mant, ...m.seteo].reduce((s, x) => s + x.n, 0)
    titulo = horaDelEje(t0Ms, hoja.min)
    desc = sinLectura[hoja.min] ? 'Sin lectura del espejo en este minuto' : `${milesPunto(m.leidas)} piezas leídas · ${p0} a P0${m.lote ? ` · lote ${m.lote}` : ''}`
    cuerpo = <DetalleMin m={m} gate="" />
  }
  return (
    <Sheet open={hoja !== null && cuerpo !== null} onClose={onCerrar} title={titulo} description={desc} surface="grouped">
      <div className="v2-vars space-y-3 pb-4">{cuerpo}</div>
    </Sheet>
  )
}
