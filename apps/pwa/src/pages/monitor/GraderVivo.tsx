/**
 * Grader en vivo (etapa E-A, diseño A «Relato» aprobado por Orel el 21-11): lo que pide atención, cuatro cifras,
 * la curva de piezas por minuto del grader sobre la de las 3 Baader y el detalle (P0 cada 15 min, calibre y
 * calidad, línea manual por hora).
 *
 * Todo sale de las cubetas por minuto del espejo (`useEspejoGrader().cubetas`) y de la serie por minuto de
 * Shoplogix que el monitor ya tiene: aquí no se recorren piezas ni se abre otra suscripción. Las cuentas viven en
 * `services/grader/espejo/` (puras, con tests); este archivo solo arma y dibuja.
 */
import { useMemo, useState } from 'react'
import { BellRing, ChevronRight, Layers } from 'lucide-react'
import { coma1, horaDelEje, type AlertaGrader } from '@/services/grader/espejo/alertasGrader'
import { Tarjeta } from './TarjetaVivo'
import { CuantoLlevamos } from './CuantoLlevamos'
import { HayQueHacerAlgo } from './HayQueHacerAlgo'
import { GraficoVivo } from './GraficoVivo'
import { HojasP0, PorQueP0, type HojaP0 } from './PorQueP0'
import { HojaLote, LotesDelTurno } from './LotesDelTurno'
import { LineaManual } from './LineaManual'
import { indiceLote } from './lotesTurnoDatos'
import type { Accion } from './hayQueHacerDatos'
import { cuentaDelTurno, extraDelTurno } from './cuantoLlevamosDatos'
import { DEFAULT_P0_CRITICAL_PCT } from '@/services/grader/graderP0Thresholds'
import { armarGraderVivo, type DatosGraderVivo, type EntradaGraderVivo } from './graderVivoDatos'
import { SeteoGates } from './SeteoGatesVivo'
import { SalidaPorCalibre } from './SalidaPorCalibre'
import { CampanaPesoVivo } from './CampanaPesoVivo'
import { efectoDeCambios } from '@/services/grader/espejo/historialGatesVivo'

type Datos = DatosGraderVivo

const IC = "h-3.5 w-3.5"

/** «34 min», «2 h 05 min». */
const duracion = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`)


/** Con `onAbrirTramo`, la alerta de P0 se toca y abre el detalle de su tramo (qué piezas y por qué). */
function Alertas({ d, ultimaHora, onAbrirTramo }: { d: Datos; ultimaHora: string | null; onAbrirTramo?: (desdeMin: number) => void }) {
  const a = d.alertas
  // Último tramo de 15 min cerrado con piezas suficientes: el mismo que mira la alerta «P0 alto».
  const ultimoP0 = d.totales.p0 === null ? null : [...d.p0].reverse().find((t) => t.completo && !t.pocaMasa && t.pct !== null) ?? null
  return (
    <Tarjeta titulo={a.length > 0 ? 'Pide atención' : 'Sin alertas'} icono={<BellRing className={IC} />}>
      <ul className="mt-3 space-y-2" aria-label="Alertas del grader">
        {a.map((x: AlertaGrader, i) => {
          const abrir = x.regla === 'p0-alto' && onAbrirTramo ? () => onAbrirTramo(x.desdeMin) : undefined
          const cuerpo = (
            <>
              <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: x.nivel === 'mal' ? 'var(--v2-mal)' : 'var(--v2-atento)' }} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight tabular-nums" style={{ color: x.nivel === 'mal' ? 'var(--v2-mal-texto)' : 'var(--v2-atento-texto)' }}>{x.titulo}</p>
                <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">{x.detalle}</p>
              </div>
              {abrir && <ChevronRight aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </>
          )
          return (
            <li key={`${x.regla}-${i}`} data-regla={x.regla} data-nivel={x.nivel}>
              {abrir ? (
                <button type="button" onClick={abrir} className="v2-subtarjeta flex min-h-[44px] w-full gap-2.5 rounded-card px-3 py-2.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--v2-acento)_10%,transparent)]">
                  {cuerpo}
                </button>
              ) : (
                <div className="v2-subtarjeta flex gap-2.5 rounded-card px-3 py-2.5">{cuerpo}</div>
              )}
            </li>
          )
        })}
      </ul>
      {a.length === 0 && (
        <div className="mt-3 space-y-1.5 text-[13px] leading-[18px]" data-testid="alertas-vigila">
          {ultimoP0 && <p className="flex items-baseline justify-between gap-3"><span className="text-muted-foreground">P0 en 15 min ({ultimoP0.rotulo})</span><b className="tabular-nums text-foreground">{coma1(ultimoP0.pct!)} % <small className="font-normal text-muted-foreground">de {coma1(DEFAULT_P0_CRITICAL_PCT)} %</small></b></p>}
          <p className="text-muted-foreground">Sin cambio en la última hora: peso y calibre, gates, lote y fotocélula. Si algo se mueve, aparece aquí.</p>
        </div>
      )}
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

/** La pestaña en vivo. `null` mientras no haya piezas del espejo en el turno: la tarjeta del espejo explica por qué. */
export function GraderVivo(props: EntradaGraderVivo & { publico?: boolean }) {
  const { publico = false, cubetas, inicioMs, finMs, baader, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, gate0Exacto, baaderCada5 } = props
  const d = useMemo(
    () => armarGraderVivo({ cubetas, inicioMs, finMs, baader, baaderCada5, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, gate0Exacto }),
    [cubetas, inicioMs, finMs, baader, baaderCada5, paradas, minutosSinLatido, turnoEnCurso, leidoHastaMs, piezas, gate0Exacto],
  )
  const efectos = useMemo(
    () => (d.pesca?.seteo ? efectoDeCambios(d.pesca.piezas, d.pesca.seteo, Date.parse(d.pesca.seteo.referenciaTs)) : []),
    [d.pesca],
  )
  const [hoja, setHoja] = useState<HojaP0>(null)
  // Al abrir una gate desde la hoja de un minuto o de un tramo, cerrar la gate vuelve a esa hoja.
  const [hojaPrevia, setHojaPrevia] = useState<HojaP0>(null)
  const abrirGate = (g: number) => { setHojaPrevia(hoja?.tipo === 'gate' ? hojaPrevia : hoja); setHoja({ tipo: 'gate', gate: g }) }
  const cerrarHoja = () => { setHoja(hoja?.tipo === 'gate' ? hojaPrevia : null); setHojaPrevia(null) }
  const [loteAbierto, setLoteAbierto] = useState<number | null>(null)
  // Sin piezas del turno: solo las alertas (el lector caído antes del cambio de turno tiene que verse).
  if (d.serie.hastaMin === 0) {
    return d.alertas.length > 0 ? <div className="v2-vars" data-testid="grader-vivo"><Alertas d={d} ultimaHora={null} /></div> : null
  }
  const ultimaHora = d.serie.ultimaTs ? d.serie.ultimaTs.slice(11, 16) : null
  const extra = extraDelTurno(d.serie.pz, d.serie.hastaMin, d.n, turnoEnCurso, d.totales.g0)
  const abrirAccion = (a: Accion) => {
    if (a.destino.tipo === 'tramo') setHoja({ tipo: 'tramo', desdeMin: Math.max(0, Math.floor((a.destino.desdeMs - d.serie.t0Ms) / 60_000)) })
    else if (a.destino.tipo === 'combo') setHoja({ tipo: 'combo', calibres: a.destino.calibres, calidad: a.destino.calidad })
    else if (a.destino.tipo === 'lote') setLoteAbierto(indiceLote(d.lotes, a.destino.lote))
  }
  return (
    <div className="v2-vars space-y-3" data-testid="grader-vivo">
      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Alertas d={d} ultimaHora={ultimaHora} onAbrirTramo={d.pesca ? (m) => setHoja({ tipo: 'tramo', desdeMin: m }) : undefined} />
        <CuantoLlevamos c={cuentaDelTurno(d.serie, d.baader, d.retraso.min, d.sinLectura)} sub={`desde las ${horaDelEje(d.serie.t0Ms, 0)} · grader ${duracion(extra.minTurno)}, ${duracion(extra.minActivos)} con producción`} extra={extra} />
        {d.pesca && <HayQueHacerAlgo h={d.pesca.hacer} onAbrir={abrirAccion} />}
      </div>
      <GraficoVivo d={d} onAbrirLote={setLoteAbierto} onAbrirTramo={d.pesca ? (m) => setHoja({ tipo: 'tramo', desdeMin: m }) : undefined} onAbrirMinuto={d.pesca ? (m) => setHoja({ tipo: 'minuto', min: m }) : undefined} />
      {d.pesca?.seteo && (
        <>
          <SeteoGates s={d.pesca.seteo} efectos={efectos} onAbrirGate={abrirGate} />
          <SalidaPorCalibre s={d.pesca.seteo} publico={publico} />
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
          <CampanaPesoVivo piezas={d.pesca.piezas} seteo={d.pesca.seteo} zonaTurno={d.pesca.zonaTurno} zonaHora={d.pesca.zonaHora} hasta={d.pesca.hora.hasta} desdeHora={d.pesca.hora.desde} />
          <HojaLote filas={d.lotes} k={loteAbierto} t0Ms={d.serie.t0Ms} onCerrar={() => setLoteAbierto(null)} />
          <HojasP0
            hoja={hoja}
            onCerrar={cerrarHoja}
            seteo={d.pesca.seteo}
            bordes={d.pesca.bordes}
            onAbrirGate={abrirGate}
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
      {/* Con piezas, la Línea manual ya vive junto al árbol y la salida por calibre va en su tarjeta; sin piezas queda el reparto de las cubetas. */}
      {d.pesca ? null : (
        <div className="grid gap-3 lg:grid-cols-2">
          <CalibreCalidad d={d} />
          <LineaManual d={d} enCurso={turnoEnCurso} />
        </div>
      )}
    </div>
  )
}
