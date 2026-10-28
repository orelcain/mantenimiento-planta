/**
 * La franja «cinta» de «El turno» (opción A del 28-10, PLAN_EL_TURNO_ORDEN.md): las cinco cifras que se miran de lejos,
 * de lado a lado y SIEMPRE en el mismo orden, en PC y en el celular. Reemplaza al riel de cifras, a «Piezas ahora» y a la
 * fila de cuatro tarjetas de antes.
 *
 *   1. Piezas del turno · cifra viva (reloj de datos), barra con la raya de las que tocaban y UNA nota: «% de la meta» · «tocaban N».
 *   2. Cada Baader · piezas, ritmo del último minuto cerrado contra su esperado y su estado (la palabra solo si no anda).
 *      Con UNA sola Baader (Filete) la celda no va: su palabra pasa a la cifra de Ritmo.
 *   3. Ritmo de la línea · UNA sola vez en toda la vista: último minuto cerrado «de N pz/min» y las referencias en un dl.
 *   4. Contra la meta · «A esta hora» y «Al cierre», y debajo Mantención en dos renglones.
 *   5. Camino a la meta · la barra de tramos y su leyenda en piezas, la celda entera tocable (`TiempoDelTurno v2="celda"`).
 *
 * ≥ 768 px es UNA tarjeta de vidrio con las celdas separadas por aire (sin bordes); debajo, cada celda en su tarjeta.
 * «A esta hora» sale de `aEstaHora` (la misma resta del gráfico y de Camino a la meta). Toda cifra viene de Shoplogix
 * por props que ya existían: aquí solo se ubican y se dicen. La marca «Shoplogix HH:MM» va UNA vez en la barra del
 * monitor (todas las cifras salen de la misma lectura), no en una celda. Lo que se toca lleva el chevron (`FranjaTocable`).
 */
import { Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CapaAmpliada } from './AmpliarV2'
import { aEstaHora, piezasMostradas } from './aEstaHora'
import { useAnchoMin, useCuentaCifra } from './ampliarHooks'
import { CifraViva } from './CifraViva'
import { esperadoPorMinuto, filasBaader, firmado, int, minutosCompletos, minutosVisibles, relojDe, sumaPorMinuto, tonoRitmo, type EstadoBaader, type TonoRitmo } from './ejeTurno'
import { ChevronFranja, RotuloFranja, Tocable } from './FranjaTocable'
import type { EjeDatos } from './GraficoRitmoVivo'
import type { MonitorV2Props } from './MonitorV2'
import { etiquetaMaquina, paradasPorMaquina, segundosCubiertos } from './ritmoVivo'
import type { RelojDeDatos } from './useRelojDeDatos'

const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

/** Las celdas que abren el panel de detalle de siempre (no son botones con marco: el toque es la celda). */
export type ClaveFranja = 'cierre' | 'ritmo' | 'mant'

/* «Mal» con `--rv-mal` (monitorGlass.css, también lo usa el gráfico): un tono que se distingue del ámbar en barras y puntos chicos. */
const MAL = 'var(--rv-mal, var(--v2-mal))'
const COLOR_TONO: Record<TonoRitmo, string> = { bien: 'var(--v2-acento)', atento: 'var(--v2-atento)', mal: MAL, sin: 'var(--v2-gris)' }

// ── Piezas del turno ─────────────────────────────────────────────────────────

/**
 * La cifra grande, la barra con la raya de las que tocaban y UNA nota en un renglón: «64 % de 15.000» a la izquierda y
 * «▮ tocaban 10.667» a la derecha (la marca de 2×10 px es su propia leyenda). El texto cambia solo con el entero y la
 * barra con `scaleX` (transform). Sin meta, solo la cifra. Cerrado, o con la cuota ya en la meta, no hay raya ni parte
 * derecha: «lo que tocaba a esta hora» ya no dice nada.
 */
function PiezasVivas({ reloj, respaldo, meta, cuota, cerrado }: { reloj: RelojDeDatos; respaldo: number; meta: number | null; cuota: number | null; cerrado: boolean }) {
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
  const raya = meta && !cerrado && cuota != null && cuota > 0 && cuota < meta ? cuota : null
  return (
    <>
      <div className="fc-piezas-fila">
        <CifraViva reloj={reloj} respaldo={respaldo} className="fc-cifra-p tabular-nums" />
        <span className="fc-u">pz</span>
      </div>
      {meta ? (
        <>
          <div className="fc-barra" aria-hidden>
            <div className="fc-barra-riel" />
            <div ref={barRef} className="fc-barra-hecho" style={{ transform: `scaleX(${acota(respaldo / meta, 0, 1)})` }} />
            {raya != null && <i className="fc-barra-raya" style={{ left: `calc(${(raya / meta) * 100}% - 1px)` }} />}
          </div>
          <p className="fc-nota fc-nota-piezas tabular-nums">
            <span className="fc-pct"><b ref={pctRef}>{Math.floor((respaldo / meta) * 100)} %</b> de {int(meta)}</span>
            {raya != null && <span className="fc-tocaban"><i className="fc-raya-mini" aria-hidden />tocaban <b>{int(raya)}</b></span>}
          </p>
        </>
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
  /** % de llenado de ese minuto normalizado por los segundos andando: la base del punto y la palabra. */
  llenado: number | null
  /** Segundos que esa Baader anduvo del último minuto cerrado (60 − paradas); null si no se sabe. */
  anduvoS: number | null
}

/** Debajo de esto el minuto no se anduvo entero: se dice cuántos segundos fueron (el número crudo no es de un minuto completo). */
const ANDUVO_COMPLETO_S = 55

/**
 * Una fila por Baader: sus piezas, el último minuto cerrado contra su esperado (la serie por minuto de Shoplogix) y su
 * estado con la MISMA normalización que las filas Ev del gráfico (`filasBaader`: segundos andando, línea en cero = sin
 * dato). Una Baader parada ahora (pulso fresco) manda sobre lo que dijo su último minuto.
 *
 * Las piezas de cada Baader salen del contador vivo cuando suma lo mismo que la cifra grande (`repro.tope.porMaquina` ya
 * trae esa guarda: PSM solo la arma si `totalCycles === contador`); si no, del doc del corte (`m.piezas`). Así la cifra
 * de cada una y la de la línea cuentan del mismo momento.
 */
function filasDeBaader(p: MonitorV2Props, e: EjeDatos | null): FilaBaader[] {
  const vivo = !p.cerrado
  const minuto = e?.minuto ?? null
  if (minuto && minuto.maquinas.length > 0) {
    const n = minutosVisibles(minuto.maquinas, p.cerrado)
    const celdas = n > 0 ? filasBaader(minuto, n, e?.paradasMaquina) : []
    const paradas = e?.paradasMaquina ? paradasPorMaquina(e.paradasMaquina) : null
    const delContador = p.repro?.tope?.porMaquina ?? null
    return minuto.maquinas.map((q) => {
      const m = p.maquinas.find((x) => x.name === q.nombre)
      const k = n - 1
      const hay = k >= 0 && k < q.cycles.length
      const fila = celdas.find((c) => c.id === q.id)
      let estado: EstadoBaader | null = vivo && hay ? fila?.celdas[k]?.estado ?? null : null
      if (vivo && m?.status === 'detenida') estado = 'detenida'
      const ini = Date.parse(minuto.desde) + k * 60_000
      const crudo = delContador?.[q.id]
      return {
        id: q.id, nombre: q.nombre,
        piezas: crudo != null && Number.isFinite(crudo) ? crudo : m?.piezas ?? q.cycles.reduce((a, b) => a + b, 0),
        ritmo: vivo && hay ? q.cycles[k] ?? 0 : null,
        esperado: q.esperado,
        promedio: m?.promedio ?? null,
        estado,
        llenado: vivo && hay ? fila?.llenados[k] ?? null : null,
        anduvoS: vivo && hay && paradas && Number.isFinite(ini) ? 60 - segundosCubiertos(paradas.todas.get(q.id), ini, ini + 60_000) : null,
      }
    })
  }
  return p.maquinas.map((m) => ({
    id: m.name, nombre: m.name, piezas: m.piezas, ritmo: null, esperado: null, promedio: m.promedio,
    estado: vivo && m.status === 'detenida' ? 'detenida' : null,
    llenado: null,
    anduvoS: null,
  }))
}

const PUNTO_ESTADO: Record<EstadoBaader, string> = { andando: 'var(--v2-acento)', lenta: 'var(--v2-atento)', detenida: MAL, parcial: 'var(--v2-gris)', 'sin-dato': 'var(--v2-gris)' }
/** La palabra solo la llevan «lenta» y «detenida»: «parcial» y «sin dato» son puntos grises, sin palabra. */
const TEXTO_ESTADO: Partial<Record<EstadoBaader, string>> = { lenta: 'var(--v2-atento-texto)', detenida: 'var(--v2-mal-texto)' }

/**
 * Las piezas de una Baader siguen al MISMO reloj que la cifra grande de «Piezas del turno»: con la reproducción del último minuto
 * activa cada Baader sube un escalón por pieza (`rep.porMaquina`, cuya suma es la cifra de la línea en cada cuadro), así las
 * tres cuadran con el total en todo instante y no solo cuando la reproducción llegó al contador. Sin reproducción (turno
 * cerrado, sin serie por minuto) vale `respaldo`. El texto se escribe solo cuando cambia el entero.
 */
export function PiezasBaader({ reloj, id, respaldo, className }: { reloj: RelojDeDatos; id: string; respaldo: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const ultimo = useRef(int(respaldo))
  useEffect(() => reloj.alCuadro((c) => {
    const el = ref.current
    if (!el) return
    const t = int(c.rep?.porMaquina.find((m) => m.id === id)?.valor ?? respaldo)
    /* Se compara con lo que HAY en el nodo: React reescribe el texto con `respaldo` cuando éste cambia. */
    if (t !== ultimo.current || el.textContent !== t) { ultimo.current = t; el.textContent = t }
  }), [reloj, id, respaldo])
  return <span ref={ref} className={className}>{int(respaldo)}</span>
}

function CadaBaader({ filas, unidad, cerrado, reloj }: { filas: FilaBaader[]; unidad: 'carros' | 'silletas' | null; cerrado: boolean; reloj: RelojDeDatos }) {
  return (
    <>
      <div className="fc-cab">
        <RotuloFranja>Cada Baader</RotuloFranja>
        <span className="fc-nota fc-nota-der">{cerrado ? `${unidad ?? 'pz'} · promedio andando` : <>{unidad ?? 'pz'} · pz/min<span className="fc-vs-esperado"> vs esperado</span></>}</span>
      </div>
      <ul className="fc-baaders">
        {filas.map((f) => {
          /* El número y la barra son el conteo CRUDO del minuto (el que Shoplogix contó); el punto y la palabra, la base
             normalizada por segundos andando. Si la Baader no anduvo el minuto entero, la nota dice cuántos segundos fueron. */
          const frac = f.ritmo != null && f.esperado != null && f.esperado > 0 ? acota(f.ritmo / f.esperado, 0, 1) : null
          const palabra = f.estado != null && f.estado in TEXTO_ESTADO ? f.estado : null
          const anduvo = !cerrado && f.anduvoS != null && f.anduvoS > 0 && Math.round(f.anduvoS) < ANDUVO_COMPLETO_S ? Math.round(f.anduvoS) : null
          return (
            <li key={f.id} className="fc-baader" title={f.llenado != null ? `${etiquetaMaquina(f.nombre)}: ${f.llenado} % de lo que daba mientras anduvo` : undefined}>
              <span className="fc-baader-nombre"><i style={{ background: f.estado ? PUNTO_ESTADO[f.estado] : 'var(--v2-gris)' }} aria-hidden />{etiquetaMaquina(f.nombre)}</span>
              <PiezasBaader reloj={reloj} id={f.id} respaldo={f.piezas} className="fc-baader-pz tabular-nums" />
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
                {anduvo != null && <div className="fc-baader-nota tabular-nums">anduvo {anduvo} s</div>}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// ── Ritmo de la línea ────────────────────────────────────────────────────────

/**
 * `unica`: con UNA sola Baader (Filete) no hay celda «Cada Baader»; si esa máquina no anda, su palabra («lenta»,
 * «detenida») va aquí, junto a la cifra, con el mismo color que tendría en su fila.
 */
function RitmoLinea({ p, e, unica }: { p: MonitorV2Props; e: EjeDatos | null; unica: EstadoBaader | null }) {
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
  /* La celda SIEMPRE lleva su nota junto al rótulo (cualquier ancho): de qué minuto es la cifra, o que es un promedio. Con el
     promedio, «andando» (su base) va junto a la unidad desde 768 px y junto a la nota en el celular (donde la nota baja de
     renglón): en una celda de PC la nota completa no cabe en el renglón del rótulo. */
  const promedio = !conMinuto && !(!p.cerrado && p.ritmoAhora != null)
  const nota = conMinuto ? `min ${hora}` : promedio ? 'promedio' : 'ahora'
  /* «de 51 pz/min»: lo esperado va en la misma fila de la cifra; la barra fina y su color dicen cuánto se llegó. */
  const unidad = conMinuto && esperado != null && esperado > 0 ? `de ${int(esperado)} pz/min` : 'pz/min'
  const tono = conMinuto ? tonoRitmo(ultimo, esperado) : 'sin'
  const frac = conMinuto && esperado != null && esperado > 0 ? acota((ultimo ?? 0) / esperado, 0, 1) : null
  /* Las referencias, en la MISMA base «andando» (la de la regla del clásico). En vivo: media de 15 min, promedio del turno y
     necesario. Cerrado la cifra grande YA es el promedio del turno: no se repite; se compara con el mejor turno y lo
     normal de la línea (los mismos datos del detalle) si existen, y si no, nada. */
  const refs = (p.cerrado
    ? [
        p.ritmoInfo.mejorCpm != null ? { k: 'mejor turno', v: p.ritmoInfo.mejorCpm } : null,
        p.ritmoInfo.medianaCpm != null ? { k: 'normal', v: p.ritmoInfo.medianaCpm } : null,
      ]
    : [
        p.ritmoMedia15 != null ? { k: '15 min', v: p.ritmoMedia15 } : null,
        p.ritmo != null ? { k: 'turno', v: p.ritmo } : null,
        p.ritmoPedido != null ? { k: 'necesario', v: p.ritmoPedido } : null,
      ]
  ).filter((q): q is { k: string; v: number } => q != null)
  return (
    <>
      <div className="fc-cab">
        <RotuloFranja tocable>Ritmo de la línea</RotuloFranja>
        <span className="fc-nota fc-nota-der">{nota}{promedio && <span className="fc-solo-movil"> andando</span>}</span>
      </div>
      <div className="fc-ritmo-fila">
        <span className="fc-cifra-c tabular-nums">{grande != null ? (conMinuto ? int(grande) : dec(grande)) : '—'}</span>
        <span className="fc-u">{unidad}{promedio && <span className="fc-desde-768"> andando</span>}</span>
        {unica != null && unica in TEXTO_ESTADO && <span className="fc-ritmo-estado" style={{ color: TEXTO_ESTADO[unica] }}>{unica}</span>}
      </div>
      {frac != null && (
        <div className="fc-barra-fina" aria-hidden><div style={{ width: `${frac * 100}%`, background: COLOR_TONO[tono] }} /></div>
      )}
      {refs.length > 0 && (
        <dl className="fc-dl fc-ritmo-refs tabular-nums">
          {refs.map((q) => (
            <div key={q.k}>
              <dt>{q.k}</dt>
              <dd>{dec(q.v)}</dd>
            </div>
          ))}
        </dl>
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
  /* Con 5 cifras («−12.345») la cifra grande no cabe en media celda: se calla la unidad (el CSS lo hace con esta clase). */
  const cifras5 = (v: number) => (Math.abs(Math.round(v)) >= 10_000 ? ' fc-cifra-5' : '')

  const deltaMttr = p.mant?.mttr != null && p.mant.mttrPrevio != null ? p.mant.mttr - p.mant.mttrPrevio : null

  /* La segunda columna: al cierre (en vivo), el resultado (cerrado) o, sin proyección, la meta tal cual. */
  let segunda: ReactNode
  if (conProyeccion) {
    const dif = meta != null ? cierreMostrado - meta : null
    segunda = (
      <Tocable onAbrir={() => abrir('cierre')} etiqueta="Al cierre">
        <RotuloFranja tocable>Al cierre</RotuloFranja>
        {detenida ? (
          <>
            {/* «en pausa» a 20/600 en la caja de la cifra grande: las bases de las dos columnas quedan alineadas. */}
            <div className="fc-cifra-m fc-pausa tabular-nums" style={{ color: 'rgb(var(--muted-foreground))' }}>en pausa</div>
            {/* La causa (la que daba el aviso «Ahora mismo», que la franja calla en todos los anchos) va aquí: un renglón con elipsis. */}
            <div className="fc-nota fc-nota-pausa" title={p.causaParada ? `línea detenida · ${p.causaParada}` : undefined}>línea detenida{p.causaParada ? ` · ${p.causaParada}` : ''}</div>
          </>
        ) : (
          <>
            <div className={`fc-cifra-m tabular-nums${dif != null ? cifras5(dif) : ''}`} style={{ color: dif != null ? color(dif) : undefined }}>
              {dif != null ? firmado(dif) : int(cierreMostrado)} <small>pz</small>
            </div>
            <div className="fc-nota tabular-nums">{dif != null ? `proyección ${int(cierreMostrado)}` : 'a este ritmo'}</div>
          </>
        )}
      </Tocable>
    )
  } else if (p.cerrado && meta != null) {
    const dif = p.piezas - meta
    segunda = (
      <div>
        <div className="fc-rotulo">Resultado del turno</div>
        <div className={`fc-cifra-m tabular-nums${cifras5(dif)}`} style={{ color: color(dif) }}>{firmado(dif)} <small>pz</small></div>
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
      {/* Con UNA sola cifra (turno cerrado, sin cuota o sin meta) ocupa la celda entera: media celda la apretaba y dejaba la otra vacía. */}
      <div className={`fc-meta-grid${aHora == null || segunda == null ? ' fc-meta-uno' : ''}`}>
        {aHora != null && (
          <div>
            <div className="fc-rotulo">A esta hora</div>
            <div className={`fc-cifra-m tabular-nums${cifras5(aHora)}`} style={{ color: color(aHora) }}>{firmado(aHora)} <small>pz</small></div>
            <div className="fc-nota">hechas − tocaban</div>
          </div>
        )}
        {segunda}
      </div>
      {p.mant && (
        <Tocable onAbrir={() => abrir('mant')} etiqueta="Mantención" className="fc-mant">
          <div className="fc-mant-cab">
            <Wrench className="h-4 w-4 shrink-0" style={{ color: 'rgb(var(--brand-ink))' }} aria-hidden />
            <span className="fc-mant-rotulo">Mantención</span>
            <ChevronFranja />
          </div>
          <div className="fc-nota fc-nota-m tabular-nums">
            <b className="fc-mant-n">{p.mant.fallas}</b> {p.mant.fallas === 1 ? 'falla' : 'fallas'}
            {p.mant.fallas > 0 && p.mant.mttr != null
              ? <> · <b>{dec(p.mant.mttr)}</b> min por falla{deltaMttr != null && <span className="fc-vs-previos"> · {deltaMttr <= 0 ? '' : '+'}{dec(deltaMttr).replace('-', '−')} vs previos</span>}</>
              : p.mant.dispPct != null ? <> · disponibilidad <b>{dec(p.mant.dispPct)} %</b></> : null}
          </div>
        </Tocable>
      )}
    </>
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
  /* Con UNA sola Baader (Filete) la celda «Cada Baader» repetía las piezas y el ritmo de sus vecinas: no va, y la palabra de
     esa máquina («lenta», «detenida») pasa a la cifra de Ritmo. */
  const conBaader = filas.length > 1
  const unica = filas.length === 1 ? filas[0]!.estado : null

  const celdas: Array<{ clave: string; clase: string; nodo: ReactNode }> = [
    {
      clave: 'piezas', clase: 'fc-c-piezas',
      nodo: (
        <div ref={piezasRef}>
          <Tocable onAbrir={() => setAmpliada((a) => !a)} etiqueta="Piezas del turno" abierta={ampliada}>
            <div className="fc-cab">
              <RotuloFranja tocable>Piezas del turno</RotuloFranja>
            </div>
            <PiezasVivas reloj={reloj} respaldo={p.piezas} meta={p.meta && p.meta > 0 ? p.meta : null} cuota={p.cuota?.piezas ?? null} cerrado={p.cerrado} />
          </Tocable>
          <CapaAmpliada abierta={ampliada} onCerrar={() => setAmpliada(false)} origen={piezasRef} titulo="Piezas del turno" sub={p.curva ? 'acumulado del turno contra el ritmo de la meta' : undefined}>
            {ampliadoPiezas}
          </CapaAmpliada>
        </div>
      ),
    },
    ...(conBaader ? [{ clave: 'baader', clase: 'fc-c-baader', nodo: <CadaBaader filas={filas} unidad={e?.unidad ?? null} cerrado={p.cerrado} reloj={reloj} /> }] : []),
    { clave: 'ritmo', clase: 'fc-c-ritmo', nodo: <Tocable onAbrir={() => abrir('ritmo')} etiqueta="Ritmo de la línea"><RitmoLinea p={p} e={e} unica={unica} /></Tocable> },
    { clave: 'meta', clase: 'fc-c-meta', nodo: <ContraLaMeta p={p} e={e} reloj={reloj} abrir={abrir} /> },
    ...(camino != null ? [{ clave: 'camino', clase: 'fc-c-camino v2-camino', nodo: camino }] : []),
  ]
  /* Dos casos distintos dan cuatro celdas (sin Baader o sin Camino): cada uno con su atributo para que la grilla sepa cuál es. */
  const atributos = { 'data-celdas': celdas.length, 'data-sin-baader': conBaader ? undefined : 'true', 'data-sin-camino': camino != null ? undefined : 'true' }

  if (apilada) {
    return (
      <div className="fc fc-apilada" role="group" aria-label="Cifras del turno" {...atributos}>
        {celdas.map((c) => <div key={c.clave} className={`v2-tarjeta rounded-card fc-celda ${c.clase}`}>{c.nodo}</div>)}
      </div>
    )
  }
  return (
    <section className="v2-tarjeta fc rounded-card" aria-label="Cifras del turno" {...atributos}>
      {celdas.map((c) => <div key={c.clave} className={`fc-celda ${c.clase}`}>{c.nodo}</div>)}
    </section>
  )
}
