/**
 * La franja «cinta» de «El turno» (opción A del 28-10, PLAN_EL_TURNO_ORDEN.md): las cinco cifras que se miran de lejos,
 * de lado a lado y SIEMPRE en el mismo orden, en PC y en el celular. Reemplaza al riel de cifras, a «Piezas ahora» y a la
 * fila de cuatro tarjetas de antes.
 *
 *   1. Piezas del turno · cifra viva (reloj de datos), % de la meta y la raya de las que tocaban a esta hora.
 *   2. Cada Baader · piezas, ritmo del último minuto cerrado contra su esperado y su estado (la palabra solo si no anda).
 *   3. Ritmo de la línea · UNA sola vez en toda la vista: último minuto cerrado contra el esperado y las medias.
 *   4. Contra la meta · «A esta hora» y «Al cierre», y debajo Mantención.
 *   5. Camino a la meta · la barra de tramos y su «Ampliar» (`TiempoDelTurno v2="celda"`).
 *
 * ≥ 768 px es UNA tarjeta de vidrio con las celdas separadas por aire (sin bordes); debajo, cada celda en su tarjeta.
 * «A esta hora» sale de `aEstaHora` (la misma resta del gráfico y de Camino a la meta). Toda cifra viene de Shoplogix
 * por props que ya existían: aquí solo se ubican y se dicen.
 */
import { Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { CapaAmpliada } from './AmpliarV2'
import { aEstaHora, piezasMostradas } from './aEstaHora'
import { useAnchoMin, useCuentaCifra } from './ampliarHooks'
import { CifraViva } from './CifraViva'
import { esperadoPorMinuto, filasBaader, firmado, int, minutosCompletos, minutosVisibles, relojDe, sumaPorMinuto, tonoRitmo, type EstadoBaader, type TonoRitmo } from './ejeTurno'
import type { EjeDatos } from './GraficoRitmoVivo'
import type { MonitorV2Props } from './MonitorV2'
import { etiquetaMaquina } from './ritmoVivo'
import type { RelojDeDatos } from './useRelojDeDatos'

const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

/** Las celdas que abren el panel de detalle de siempre (no son botones con marco: el toque es la celda). */
export type ClaveFranja = 'cierre' | 'ritmo' | 'mant'

const COLOR_TONO: Record<TonoRitmo, string> = { bien: 'var(--v2-acento)', atento: 'var(--v2-atento)', mal: 'var(--v2-mal)', sin: 'var(--v2-gris)' }

// ── Piezas del turno ─────────────────────────────────────────────────────────

/**
 * La cifra grande con «N % de la meta» y la barra con la raya de las que tocaban: el texto cambia solo con el entero y
 * la barra con `scaleX` (transform). Sin meta, solo la cifra.
 */
function PiezasVivas({ reloj, respaldo, meta, cuota }: { reloj: RelojDeDatos; respaldo: number; meta: number | null; cuota: number | null }) {
  const pctRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const ultimo = useRef('')
  useEffect(() => {
    if (!meta) return
    return reloj.alCuadro((c) => {
      const v = c.valor ?? respaldo
      if (barRef.current) barRef.current.style.transform = `scaleX(${acota(v / meta, 0, 1)})`
      const t = `${Math.floor((v / meta) * 100)} %`
      if (pctRef.current && (t !== ultimo.current || pctRef.current.textContent !== t)) { ultimo.current = t; pctRef.current.textContent = t }
    })
  }, [reloj, respaldo, meta])
  return (
    <>
      <div className="fc-piezas-fila">
        <CifraViva reloj={reloj} respaldo={respaldo} className="fc-cifra-p tabular-nums" />
        <span className="fc-u">pz</span>
        {meta ? <span className="fc-pct"><b ref={pctRef} className="tabular-nums">{Math.floor((respaldo / meta) * 100)} %</b> de {int(meta)}</span> : null}
      </div>
      {meta ? (
        <div className="fc-barra" aria-hidden>
          <div className="fc-barra-riel" />
          <div ref={barRef} className="fc-barra-hecho" style={{ transform: `scaleX(${acota(respaldo / meta, 0, 1)})` }} />
          {cuota != null && cuota > 0 && <i className="fc-barra-raya" style={{ left: `calc(${acota(cuota / meta, 0, 1) * 100}% - 1px)` }} />}
        </div>
      ) : null}
    </>
  )
}

// ── Cada Baader ──────────────────────────────────────────────────────────────

interface FilaBaader {
  id: string
  nombre: string
  piezas: number
  /** Piezas del último minuto cerrado y lo que daba esa Baader a su esperado. */
  ritmo: number | null
  esperado: number | null
  /** Con el turno cerrado no hay «último minuto» que importe: se dice su promedio andando. */
  promedio: number | null
  /** null = sin dato (no se acusa a la Baader de lo que no se sabe). */
  estado: EstadoBaader | null
  /** % de llenado de ese minuto normalizado por los segundos andando: la base del punto, la palabra y la barra. */
  llenado: number | null
}

/**
 * Una fila por Baader: piezas de hoy (`m.piezas`), el último minuto cerrado contra su esperado (la serie por minuto de
 * Shoplogix) y su estado con la MISMA normalización que las filas Ev del gráfico (`filasBaader`: segundos andando, línea en
 * cero = sin dato). Una Baader parada ahora (pulso fresco) manda sobre lo que dijo su último minuto.
 */
function filasDeBaader(p: MonitorV2Props, e: EjeDatos | null): FilaBaader[] {
  const vivo = !p.cerrado
  const minuto = e?.minuto ?? null
  if (minuto && minuto.maquinas.length > 0) {
    const n = minutosVisibles(minuto.maquinas, p.cerrado)
    const celdas = n > 0 ? filasBaader(minuto, n, e?.paradasMaquina) : []
    return minuto.maquinas.map((q) => {
      const m = p.maquinas.find((x) => x.name === q.nombre)
      const k = n - 1
      const hay = k >= 0 && k < q.cycles.length
      const fila = celdas.find((c) => c.id === q.id)
      let estado: EstadoBaader | null = vivo && hay ? fila?.celdas[k]?.estado ?? null : null
      if (vivo && m?.status === 'detenida') estado = 'detenida'
      return {
        id: q.id, nombre: q.nombre,
        piezas: m?.piezas ?? q.cycles.reduce((a, b) => a + b, 0),
        ritmo: vivo && hay ? q.cycles[k] ?? 0 : null,
        esperado: q.esperado,
        promedio: m?.promedio ?? null,
        estado,
        llenado: vivo && hay ? fila?.llenados[k] ?? null : null,
      }
    })
  }
  return p.maquinas.map((m) => ({
    id: m.name, nombre: m.name, piezas: m.piezas, ritmo: null, esperado: null, promedio: m.promedio,
    estado: vivo && m.status === 'detenida' ? 'detenida' : null,
    llenado: null,
  }))
}

const PUNTO_ESTADO: Record<EstadoBaader, string> = { andando: 'var(--v2-acento)', lenta: 'var(--v2-atento)', detenida: 'var(--v2-mal)', parcial: 'var(--v2-gris)', 'sin-dato': 'var(--v2-gris)' }
/** La palabra solo la llevan «lenta» y «detenida»: «parcial» y «sin dato» son puntos grises, sin palabra. */
const TEXTO_ESTADO: Partial<Record<EstadoBaader, string>> = { lenta: 'var(--v2-atento-texto)', detenida: 'var(--v2-mal-texto)' }

function CadaBaader({ filas, unidad, cerrado }: { filas: FilaBaader[]; unidad: 'carros' | 'silletas' | null; cerrado: boolean }) {
  return (
    <>
      <div className="fc-cab">
        <span className="fc-rotulo">Cada Baader</span>
        <span className="fc-nota fc-nota-der">{cerrado ? `${unidad ?? 'pz'} · promedio andando` : `${unidad ?? 'pz'} · pz/min vs esperado`}</span>
      </div>
      <ul className="fc-baaders">
        {filas.map((f) => {
          /* La barra va en la MISMA base que el punto y la palabra (el llenado normalizado por segundos andando); sin él, el cociente crudo. */
          const frac = f.llenado != null ? acota(f.llenado / 100, 0, 1) : f.ritmo != null && f.esperado != null && f.esperado > 0 ? acota(f.ritmo / f.esperado, 0, 1) : null
          const palabra = f.estado != null && f.estado in TEXTO_ESTADO ? f.estado : null
          return (
            <li key={f.id} className="fc-baader" title={f.llenado != null ? `${etiquetaMaquina(f.nombre)}: ${f.llenado} % de lo que daba mientras anduvo` : undefined}>
              <span className="fc-baader-nombre"><i style={{ background: f.estado ? PUNTO_ESTADO[f.estado] : 'var(--v2-gris)' }} aria-hidden />{etiquetaMaquina(f.nombre)}</span>
              <span className="fc-baader-pz tabular-nums">{int(f.piezas)}</span>
              <div className="fc-baader-ritmo">
                <div className="fc-baader-linea tabular-nums">
                  <span>
                    {cerrado
                      ? (f.promedio != null ? <><b>{dec(f.promedio)}</b> pz/min</> : null)
                      : f.ritmo != null ? <><b>{int(f.ritmo)}</b>{f.esperado != null ? ` de ${int(f.esperado)}` : ''}<span className="fc-pzmin"> pz/min</span></> : null}
                  </span>
                  {palabra && <span className="fc-baader-estado" style={{ color: TEXTO_ESTADO[palabra] ?? 'rgb(var(--muted-foreground))' }}>{palabra}</span>}
                </div>
                {frac != null && (
                  <div className="fc-baader-pista" aria-hidden>
                    <div style={{ width: `${frac * 100}%`, background: f.estado ? PUNTO_ESTADO[f.estado] : 'var(--v2-acento)' }} />
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// ── Ritmo de la línea ────────────────────────────────────────────────────────

function RitmoLinea({ p, e }: { p: MonitorV2Props; e: EjeDatos | null }) {
  const minuto = e?.minuto ?? null
  /* La cifra es de la LÍNEA: vale el último minuto que todas las Baader ya entregaron, no el de la serie más larga
     (con un minuto a medias la suma sería la de una Baader sola contra su esperado). */
  const n = minuto ? minutosCompletos(minuto.maquinas) : 0
  const conMinuto = minuto != null && n > 0 && !p.cerrado
  const ultimo = conMinuto ? sumaPorMinuto(minuto.maquinas, n)[n - 1] ?? 0 : null
  const esperado = conMinuto ? esperadoPorMinuto(minuto.maquinas, n)[n - 1] ?? null : null
  const hora = conMinuto ? relojDe(Date.parse(minuto.desde) + (n - 1) * 60_000) : null
  /* Sin serie por minuto (o con el turno cerrado) la cifra es la que ya había: el «ahora» del pulso o el promedio andando. */
  const grande = conMinuto ? ultimo : (p.cerrado ? p.ritmo : p.ritmoAhora ?? p.ritmo)
  const sub = conMinuto
    ? esperado != null && esperado > 0 ? `de ${int(esperado)} esperado · ${Math.round(((ultimo ?? 0) / esperado) * 100)} %` : 'último minuto cerrado'
    : p.cerrado ? 'promedio del turno, andando' : p.ritmoAhora != null ? 'ahora' : 'promedio andando'
  const tono = conMinuto ? tonoRitmo(ultimo, esperado) : 'sin'
  const frac = conMinuto && esperado != null && esperado > 0 ? acota((ultimo ?? 0) / esperado, 0, 1) : null
  /* Las tres varas en la MISMA base «andando» (la de la regla del clásico): media de 15 min, promedio del turno, necesario. */
  const varas = [
    !p.cerrado && p.ritmoMedia15 != null ? { k: 'media 15 min', v: p.ritmoMedia15 } : null,
    p.ritmo != null ? { k: 'promedio turno', v: p.ritmo } : null,
    !p.cerrado && p.ritmoPedido != null ? { k: 'necesario', v: p.ritmoPedido } : null,
  ].filter((q): q is { k: string; v: number } => q != null)
  return (
    <>
      <div className="fc-cab">
        <span className="fc-rotulo">Ritmo de la línea</span>
        {hora && <span className="fc-nota fc-nota-der">último minuto {hora}</span>}
      </div>
      <div className="fc-ritmo-fila">
        <span className="fc-cifra-c tabular-nums">{grande != null ? (conMinuto ? int(grande) : dec(grande)) : '—'}</span>
        <span className="fc-u">pz/min</span>
      </div>
      {frac != null && (
        <div className="fc-barra-fina" aria-hidden><div style={{ width: `${frac * 100}%`, background: COLOR_TONO[tono] }} /></div>
      )}
      <p className="fc-nota fc-nota-b">{sub}</p>
      {varas.length > 0 && (
        <p className="fc-nota fc-nota-b tabular-nums">
          {varas.map((q, i) => <span key={q.k}>{i > 0 ? ' · ' : ''}{q.k} <b>{dec(q.v)}</b></span>)}
        </p>
      )}
    </>
  )
}

// ── Contra la meta + Mantención ──────────────────────────────────────────────

function ContraLaMeta({ p, e, reloj, abrir }: { p: MonitorV2Props; e: EjeDatos | null; reloj: RelojDeDatos; abrir: (k: ClaveFranja) => void }) {
  const cierreMostrado = useCuentaCifra(p.proyeccion ?? 0)
  const meta = p.meta != null && p.meta > 0 ? p.meta : null
  const detenida = !p.cerrado && (reloj.detenida || (e?.detenidaEstado ?? false))
  const aHora = p.cerrado ? null : aEstaHora(piezasMostradas(p.repro, p.piezas), p.cuota?.piezas, p.meta)
  const conProyeccion = !p.cerrado && p.proyeccion != null
  const color = (v: number) => (v < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))')

  const deltaMttr = p.mant?.mttr != null && p.mant.mttrPrevio != null ? p.mant.mttr - p.mant.mttrPrevio : null

  /* La segunda columna: al cierre (en vivo), el resultado (cerrado) o, sin proyección, la meta tal cual. */
  let segunda: ReactNode
  if (conProyeccion) {
    const dif = meta != null ? cierreMostrado - meta : null
    segunda = (
      <Tocable onAbrir={() => abrir('cierre')} etiqueta="Al cierre">
        <div className="fc-rotulo">Al cierre</div>
        {detenida ? (
          <>
            <div className="fc-cifra-m tabular-nums" style={{ color: 'rgb(var(--muted-foreground))' }}>en pausa</div>
            <div className="fc-nota">línea detenida</div>
          </>
        ) : (
          <>
            <div className="fc-cifra-m tabular-nums" style={{ color: dif != null ? color(dif) : undefined }}>
              {dif != null ? firmado(dif) : int(cierreMostrado)} <small>pz</small>
            </div>
            <div className="fc-nota tabular-nums">{dif != null ? `proyección ${int(cierreMostrado)} − meta` : 'a este ritmo'}</div>
          </>
        )}
      </Tocable>
    )
  } else if (p.cerrado && meta != null) {
    const dif = p.piezas - meta
    segunda = (
      <div>
        <div className="fc-rotulo">Resultado del turno</div>
        <div className="fc-cifra-m tabular-nums" style={{ color: color(dif) }}>{firmado(dif)} <small>pz</small></div>
        <div className="fc-nota tabular-nums">{int(p.piezas)} − meta {int(meta)}</div>
      </div>
    )
  } else if (meta != null) {
    segunda = (
      <div>
        <div className="fc-rotulo">Meta del turno</div>
        <div className="fc-cifra-m tabular-nums">{int(meta)} <small>pz</small></div>
      </div>
    )
  } else {
    segunda = null
  }

  return (
    <>
      <div className="fc-meta-grid">
        {aHora != null && (
          <div>
            <div className="fc-rotulo">A esta hora</div>
            <div className="fc-cifra-m tabular-nums" style={{ color: color(aHora) }}>{firmado(aHora)} <small>pz</small></div>
            <div className="fc-nota">hechas − las que tocaban</div>
          </div>
        )}
        {segunda}
      </div>
      {p.mant && (
        <Tocable onAbrir={() => abrir('mant')} etiqueta="Mantención" className="fc-mant">
          <Wrench className="h-4 w-4 shrink-0" style={{ color: 'rgb(var(--brand-ink))' }} aria-hidden />
          <span className="fc-mant-rotulo">Mantención</span>
          <span className="fc-nota fc-nota-m tabular-nums">
            <b>{p.mant.fallas}</b> {p.mant.fallas === 1 ? 'falla' : 'fallas'}
            {p.mant.fallas > 0 && p.mant.mttr != null
              ? <> · <b>{dec(p.mant.mttr)}</b> min por falla{deltaMttr != null && <span className="fc-vs-previos"> · {deltaMttr <= 0 ? '' : '+'}{dec(deltaMttr).replace('-', '−')} vs previos</span>}</>
              : p.mant.dispPct != null ? <> · disponibilidad <b>{dec(p.mant.dispPct)} %</b></> : null}
          </span>
        </Tocable>
      )}
    </>
  )
}

/** Una zona que se toca para ver su detalle: sin marco ni ícono, como los de siempre (rol de botón y teclado). */
function Tocable({ onAbrir, etiqueta, className, children }: { onAbrir: () => void; etiqueta: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${etiqueta}: ver detalle`}
      className={`fc-tocable ${className ?? ''}`}
      onClick={onAbrir}
      onKeyDown={(ev: ReactKeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onAbrir() } }}
    >
      {children}
    </div>
  )
}

// ── La franja ────────────────────────────────────────────────────────────────

export function FranjaCinta({ p, reloj, ampliadoPiezas, abrir, camino }: {
  p: MonitorV2Props
  /** El reloj de datos del monitor (con la reproducción activa, la reproducción): la cifra de piezas lo sigue. */
  reloj: RelojDeDatos
  /** El detalle de «Piezas del turno» (curva contra otros días, hora a hora): se abre tocando la celda. */
  ampliadoPiezas: ReactNode
  abrir: (k: ClaveFranja) => void
  /** Camino a la meta ya armado como celda (`TiempoDelTurno v2="celda"`); sin él, la franja queda en cuatro celdas. */
  camino?: ReactNode
}) {
  const e = p.eje ?? null
  /* Debajo de 768 px cada celda es su propia tarjeta; desde ahí, una sola con las celdas separadas por aire. */
  const apilada = !useAnchoMin(768)
  const [ampliada, setAmpliada] = useState(false)
  const piezasRef = useRef<HTMLDivElement>(null)
  const filas = filasDeBaader(p, e)

  const celdas: Array<{ clave: string; clase: string; nodo: ReactNode }> = [
    {
      clave: 'piezas', clase: 'fc-c-piezas',
      nodo: (
        <div ref={piezasRef}>
          <Tocable onAbrir={() => setAmpliada((a) => !a)} etiqueta="Piezas del turno">
            <div className="fc-cab">
              <span className="fc-rotulo">Piezas del turno</span>
              <span className="fc-nota fc-nota-der">{p.corteHora ? `Shoplogix ${p.corteHora}` : 'contador Shoplogix'}</span>
            </div>
            <PiezasVivas reloj={reloj} respaldo={p.piezas} meta={p.meta && p.meta > 0 ? p.meta : null} cuota={p.cuota?.piezas ?? null} />
            {p.cuota && p.meta != null && p.meta > 0 && <p className="fc-nota fc-nota-b tabular-nums">la raya: <b>{int(p.cuota.piezas)}</b> que tocaban a esta hora</p>}
          </Tocable>
          <CapaAmpliada abierta={ampliada} onCerrar={() => setAmpliada(false)} origen={piezasRef} titulo="Piezas del turno" sub={p.curva ? 'acumulado del turno contra el ritmo de la meta' : undefined}>
            {ampliadoPiezas}
          </CapaAmpliada>
        </div>
      ),
    },
    { clave: 'baader', clase: 'fc-c-baader', nodo: <CadaBaader filas={filas} unidad={e?.unidad ?? null} cerrado={p.cerrado} /> },
    { clave: 'ritmo', clase: 'fc-c-ritmo', nodo: <Tocable onAbrir={() => abrir('ritmo')} etiqueta="Ritmo de la línea"><RitmoLinea p={p} e={e} /></Tocable> },
    { clave: 'meta', clase: 'fc-c-meta', nodo: <ContraLaMeta p={p} e={e} reloj={reloj} abrir={abrir} /> },
    ...(camino != null ? [{ clave: 'camino', clase: 'fc-c-camino v2-camino', nodo: camino }] : []),
  ]

  if (apilada) {
    return (
      <div className="fc fc-apilada" role="group" aria-label="Cifras del turno" data-celdas={celdas.length}>
        {celdas.map((c) => <div key={c.clave} className={`v2-tarjeta rounded-card fc-celda ${c.clase}`}>{c.nodo}</div>)}
      </div>
    )
  }
  return (
    <section className="v2-tarjeta fc rounded-card" aria-label="Cifras del turno" data-celdas={celdas.length}>
      {celdas.map((c) => <div key={c.clave} className={`fc-celda ${c.clase}`}>{c.nodo}</div>)}
    </section>
  )
}
