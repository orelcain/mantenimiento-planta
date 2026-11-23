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
import { BellRing, Layers, Scale, SplitSquareHorizontal } from 'lucide-react'
import { coma1, horaDelEje, milesPunto, type AlertaGrader } from '@/services/grader/espejo/alertasGrader'
import { Tarjeta } from './TarjetaVivo'
import { CuantoLlevamos } from './CuantoLlevamos'
import { HayQueHacerAlgo } from './HayQueHacerAlgo'
import { GraficoVivo } from './GraficoVivo'
import { HojasP0, PorQueP0, type HojaP0 } from './PorQueP0'
import { HojaLote, LotesDelTurno } from './LotesDelTurno'
import { LineaManual } from './LineaManual'
import { indiceLote } from './lotesTurnoDatos'
import type { Accion } from './hayQueHacerDatos'
import { cuentaDelTurno } from './cuantoLlevamosDatos'
import { armarGraderVivo, type DatosGraderVivo, type EntradaGraderVivo } from './graderVivoDatos'
import { SeteoGates, PescaPorPrograma } from './SeteoGatesVivo'

type Datos = DatosGraderVivo

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

type Pesca = NonNullable<Datos['pesca']>

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
    <Tarjeta titulo="Peso" sub="Última hora contra el turno, cada 250 g" icono={<Scale className={IC} />}>
      <div ref={ref} className="mt-3 w-full">
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
    </Tarjeta>
  )
}

/** La pestaña en vivo. `null` mientras no haya piezas del espejo en el turno: la tarjeta del espejo explica por qué. */
export function GraderVivo(props: EntradaGraderVivo & { publico?: boolean }) {
  const { publico = false, cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, gate0Exacto, baaderCada5 } = props
  const d = useMemo(
    () => armarGraderVivo({ cubetas, inicioMs, finMs, baader, baaderCada5, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, gate0Exacto }),
    [cubetas, inicioMs, finMs, baader, baaderCada5, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, gate0Exacto],
  )
  const [hoja, setHoja] = useState<HojaP0>(null)
  const [loteAbierto, setLoteAbierto] = useState<number | null>(null)
  // Sin piezas del turno: solo las alertas (el lector caído antes del cambio de turno tiene que verse).
  if (d.serie.hastaMin === 0) {
    return d.alertas.length > 0 ? <div className="v2-vars" data-testid="grader-vivo"><Alertas d={d} ultimaHora={null} /></div> : null
  }
  const ultimaHora = d.serie.ultimaTs ? d.serie.ultimaTs.slice(11, 16) : null
  const abrirAccion = (a: Accion) => {
    if (a.destino.tipo === 'tramo') setHoja({ tipo: 'tramo', desdeMin: Math.max(0, Math.floor((a.destino.desdeMs - d.serie.t0Ms) / 60_000)) })
    else if (a.destino.tipo === 'combo') setHoja({ tipo: 'combo', calibres: a.destino.calibres, calidad: a.destino.calidad })
    else if (a.destino.tipo === 'lote') setLoteAbierto(indiceLote(d.lotes, a.destino.lote))
  }
  return (
    <div className="v2-vars space-y-3" data-testid="grader-vivo">
      <div className="grid gap-3 lg:grid-cols-3">
        <Alertas d={d} ultimaHora={ultimaHora} />
        <CuantoLlevamos c={cuentaDelTurno(d.serie, d.baader, d.retraso.min, d.sinLectura)} sub={`desde las ${horaDelEje(d.serie.t0Ms, 0)}`} />
        {d.pesca && <HayQueHacerAlgo h={d.pesca.hacer} onAbrir={abrirAccion} />}
      </div>
      <GraficoVivo d={d} onAbrirLote={setLoteAbierto} onAbrirTramo={d.pesca ? (m) => setHoja({ tipo: 'tramo', desdeMin: m }) : undefined} onAbrirMinuto={d.pesca ? (m) => setHoja({ tipo: 'minuto', min: m }) : undefined} />
      {d.pesca?.seteo && (
        <>
          <SeteoGates s={d.pesca.seteo} />
          <PescaPorPrograma s={d.pesca.seteo} publico={publico} />
        </>
      )}
      {d.pesca && (
        <>
          <div className="grid items-start gap-3 lg:grid-cols-2">
            <PorQueP0 a={d.pesca.arbol} piezasTurno={d.totales.piezas} hasta={ultimaHora ?? ''} onAbrir={(k) => setHoja({ tipo: 'fila', clave: k })} />
            <div className="grid gap-3">
              <LotesDelTurno filas={d.lotes} t0Ms={d.serie.t0Ms} hastaMin={d.serie.hastaMin} onAbrir={setLoteAbierto} />
              <LineaManual d={d} enCurso={turnoEnCurso} />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <ZonaCompartida p={d.pesca} />
            <HistPeso p={d.pesca} />
          </div>
          <HojaLote filas={d.lotes} k={loteAbierto} t0Ms={d.serie.t0Ms} onCerrar={() => setLoteAbierto(null)} />
          <HojasP0
            hoja={hoja}
            onCerrar={() => setHoja(null)}
            a={d.pesca.arbol}
            t0Ms={d.serie.t0Ms}
            hastaMin={d.serie.hastaMin}
            piezas={d.pesca.piezas}
            porPieza={d.pesca.p0Dueno.porPieza}
            sinLectura={d.sinLectura}
            g0={d.serie.g0}
            hasta={ultimaHora ?? ''}
          />
        </>
      )}
      {/* Con piezas, la Línea manual ya vive junto al árbol: Calibre y calidad va a todo el ancho (no queda sola en 2 columnas). */}
      {d.pesca ? (
        <CalibreCalidad d={d} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <CalibreCalidad d={d} />
          <LineaManual d={d} enCurso={turnoEnCurso} />
        </div>
      )}
    </div>
  )
}
