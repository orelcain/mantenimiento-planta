/**
 * La franja «cinta» de «El turno» (opción A del 28-10, PLAN_EL_TURNO_ORDEN.md): las cinco cifras que se miran de lejos,
 * de lado a lado y SIEMPRE en el mismo orden, en PC y en el celular. Reemplaza al riel de cifras, a «Piezas ahora» y a la
 * fila de cuatro tarjetas de antes.
 *
 *   1. Piezas del turno · cifra viva (reloj de datos), barra con la raya de las que tocaban y UNA nota: «% de la meta» · «tocaban N».
 *   2. Ritmo · la A3 «sub-tarjeta» (`RitmoBaaders`): la Línea y cada Baader en una mini tabla (piezas, último minuto contra su
 *      esperado, aporte al promedio y cómo se compara consigo misma). UNA sola vez en toda la vista.
 *      Con UNA sola Baader (Filete) la tabla no va: queda la celda de una cifra (`RitmoLinea`) con su palabra si no anda.
 *   3. Contra la meta · «A esta hora» y «Al cierre», y debajo Mantención en dos renglones.
 *   4. Camino a la meta · la barra de tramos y su leyenda en piezas, la celda entera tocable (`TiempoDelTurno v2="celda"`).
 *
 * ≥ 768 px es UNA tarjeta de vidrio con las celdas separadas por aire (sin bordes); debajo, cada celda en su tarjeta.
 * «A esta hora» sale de `aEstaHora` (la misma resta del gráfico y de Camino a la meta). Toda cifra viene de Shoplogix
 * por props que ya existían: aquí solo se ubican y se dicen. La marca «Shoplogix HH:MM» va UNA vez en la barra del
 * monitor (todas las cifras salen de la misma lectura), no en una celda. Lo que se toca lleva el chevron (`FranjaTocable`).
 */
import { useCifrasVivas } from './useCifrasVivas'
import { Wrench } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CapaAmpliada } from './AmpliarV2'
import { aEstaHora, piezasMostradas } from './aEstaHora'
import { useAnchoMin, useCuentaCifra } from './ampliarHooks'
import { CifraViva } from './CifraViva'
import { FloteMas } from './FloteMas'
import { esperadoPorMinuto, int, minutosCompletos, partesAdelanteAtras, relojDe, sumaPorMinuto, tonoRitmo, type EstadoBaader, type TonoRitmo } from './ejeTurno'
import { ChevronFranja, RotuloFranja, Tocable } from './FranjaTocable'
import type { EjeDatos } from './GraficoRitmoVivo'
import type { MonitorV2Props } from './MonitorV2'
import { filasDeBaader, TEXTO_ESTADO } from './baadersMinuto'
import { PiezasBaader, RitmoBaaders } from './RitmoBaaders'
import type { RelojDeDatos } from './useRelojDeDatos'

/* `PiezasBaader` vive con la tarjeta Ritmo; se re-exporta aquí porque es la pieza que la franja ha dicho siempre. */
export { PiezasBaader }

const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

/**
 * La cifra grande de «A esta hora» y del resultado cerrado: el número SIN signo y la palabra («adelante», «atrás») en el hueco de
 * la unidad (glosario único del monitor, 28-10). Con 0 es «al día», a tamaño de cifra y sin unidad. El color es el de siempre (lo
 * pone quien llama). Con 5 cifras (`fc-cifra-5`) o en una celda angosta la palabra baja bajo el número: sin el signo no se puede callar.
 */
function CifraAdelanteAtras({ n, cinco, color }: { n: number; cinco: string; color: string }) {
  const { cifra, palabra } = partesAdelanteAtras(n)
  return (
    <div className={`fc-cifra-m fc-cifra-dif tabular-nums${cinco}`} style={{ color }}>
      {cifra ? <>{cifra} <small>{palabra}</small></> : palabra}
    </div>
  )
}

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
  /* PR B: la cuota del MISMO instante que la cifra (avanza segundo a segundo con la reproducción del minuto). */
  const cuotaViva = useCifrasVivas()?.cuota ?? cuota
  const raya = meta && !cerrado && cuotaViva != null && cuotaViva > 0 && cuotaViva < meta ? cuotaViva : null
  return (
    <>
      <div className="fc-piezas-fila">
        <CifraViva reloj={reloj} respaldo={respaldo} className="fc-cifra-p tabular-nums" />
        <span className="fc-u">pz</span>
        <FloteMas reloj={reloj} />
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
            {raya != null && <span className="fc-tocaban"><i className="fc-raya-mini" aria-hidden />meta<span className="fc-hora-larga"> a esta hora</span> <b>{int(raya)}</b></span>}
          </p>
        </>
      ) : null}
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
        <RotuloFranja tocable>Ritmo</RotuloFranja>
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
  const cierreTween = useCuentaCifra(p.proyeccion ?? 0)
  const meta = p.meta != null && p.meta > 0 ? p.meta : null
  const detenida = !p.cerrado && (reloj.detenida || (e?.detenidaEstado ?? false))
  /* PR B: hechas y cuota del mismo instante del reloj (pieza a pieza); sin reloj de vista, la resta en reposo de siempre. */
  const vivas = useCifrasVivas()
  /* «Al cierre» es UNA cifra en toda la pantalla (franja, ampliado, gráfico): la proyección de siempre, `p.proyeccion` = piezas del
     contador + ritmo × minutos productivos que quedan. NO se arma con las hechas del cuadro: la reproducción va 2-4 min atrás del
     contador y esas piezas ya se hicieron, así que `hechas + resto` quedaría bajo en lo que falta reproducir. Cambia con cada lectura
     nueva, no con cada pieza reproducida. */
  const cierreMostrado = cierreTween
  const aHora = p.cerrado ? null : (vivas?.aHora ?? aEstaHora(piezasMostradas(p.repro, p.piezas), p.cuota?.piezas, p.meta))
  const conProyeccion = !p.cerrado && p.proyeccion != null
  const color = (v: number) => (v < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))')
  /* La palabra («adelante», «atrás») ocupa el hueco de la unidad y, sin el signo, no se puede callar: cuando no cabe junto al número
     baja bajo él. El CSS decide según el ancho y estas clases: `fc-cifra-d4` (4 o más cifras: «1.234») y `fc-cifra-5` (5: «12.345»). */
  const cifras5 = (v: number) => { const a = Math.abs(Math.round(v)); return a >= 10_000 ? ' fc-cifra-5 fc-cifra-d4' : a >= 1_000 ? ' fc-cifra-d4' : '' }

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
            {/* Con la banda de parada a la vista (ya dice la causa) la nota dice solo «línea detenida». Sin banda, la causa (la que daba el
                aviso «Ahora mismo», que la franja calla) va en un segundo renglón que puede bajar de línea: nunca se corta con «…». */}
            <div className="fc-nota fc-nota-pausa">línea detenida</div>
            {!p.conBanda && p.causaParada && <div className="fc-nota fc-nota-causa">{p.causaParada}</div>}
          </>
        ) : (
          <>
            {dif != null
              ? <CifraAdelanteAtras n={dif} cinco={cifras5(dif)} color={color(dif)} />
              : <div className="fc-cifra-m tabular-nums">{int(cierreMostrado)} <small>pz</small></div>}
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
        <CifraAdelanteAtras n={dif} cinco={cifras5(dif)} color={color(dif)} />
        <div className="fc-nota tabular-nums">{int(p.piezas)} hechas · meta{'\u00a0'}{int(meta)}</div>
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
            <CifraAdelanteAtras n={aHora} cinco={cifras5(aHora)} color={color(aHora)} />
            <div className="fc-nota">hechas − meta</div>
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
  /* Con UNA sola Baader (Filete) la tabla repetiría la cifra de la línea: queda la celda de una cifra y la palabra de esa
     máquina («lenta», «detenida») va junto a ella. */
  const conBaader = filas.length > 1
  const unica = filas.length === 1 ? filas[0]!.estado : null

  const piezasCelda = {
    clave: 'piezas', clase: 'fc-c-piezas',
    nodo: (
      <div ref={piezasRef}>
        <Tocable onAbrir={() => setAmpliada((a) => !a)} etiqueta="Piezas del turno" abierta={ampliada}>
          <div className="fc-cab">
            <RotuloFranja tocable>Piezas del turno</RotuloFranja>
          </div>
          <PiezasVivas reloj={reloj} respaldo={p.piezas} meta={p.meta && p.meta > 0 ? p.meta : null} cuota={p.cuota?.piezas ?? null} cerrado={p.cerrado} />
        </Tocable>
        <CapaAmpliada abierta={ampliada} onCerrar={() => setAmpliada(false)} origen={piezasRef} titulo="Piezas del turno" sub={p.curva ? 'hechas del turno contra el ritmo de la meta' : undefined}>
          {ampliadoPiezas}
        </CapaAmpliada>
      </div>
    ),
  }
  /* La A3: con varias Baader la celda Ritmo es la mini tabla (Línea + cada Baader); con una sola, la celda de una cifra. */
  const ritmoCelda = {
    clave: 'ritmo', clase: 'fc-c-ritmo',
    nodo: (
      <Tocable onAbrir={() => abrir('ritmo')} etiqueta="Ritmo">
        {conBaader ? <RitmoBaaders p={p} e={e} reloj={reloj} filas={filas} /> : <RitmoLinea p={p} e={e} unica={unica} />}
      </Tocable>
    ),
  }
  const metaCelda = { clave: 'meta', clase: 'fc-c-meta', nodo: <ContraLaMeta p={p} e={e} reloj={reloj} abrir={abrir} /> }
  const caminoCelda = camino != null ? [{ clave: 'camino', clase: 'fc-c-camino v2-camino', nodo: camino }] : []
  /* El orden de lectura es el de la pantalla: en el celular con varias Baader, Piezas · Meta y luego Ritmo a todo el ancho
     (la tabla necesita el ancho); con una sola, Piezas · Ritmo y la Meta debajo. */
  const celdas: Array<{ clave: string; clase: string; nodo: ReactNode }> = apilada && conBaader
    ? [piezasCelda, metaCelda, ritmoCelda, ...caminoCelda]
    : [piezasCelda, ritmoCelda, metaCelda, ...caminoCelda]
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
