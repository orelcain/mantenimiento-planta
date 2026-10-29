/**
 * La tarjeta «Ritmo» de la franja (A3 «sub-tarjeta», 28-10): «Cada Baader» + «Ritmo de la línea» + el aporte de cada una al
 * promedio, en UNA mini tabla con la Línea como primera fila. Reemplaza a la celda «Cada Baader» y a la tarjeta «Cada máquina»
 * de bajo el gráfico. Y su detalle (`RitmoDetalle`), que absorbe lo que el panel «Ritmo de la línea» decía y el control del pulso.
 *
 *   «Ritmo ›»        «Último minuto 10:12»           «Promedio del turno»
 *                    carros con pieza                aporte   vs último   vs prom. 5
 *   Línea            50 de 51 pz/min                 38,5     ▲ 1,0       ▲ 0,7
 *                    15 min 41,3 · necesario 39,8
 *   ● Ev 1  2.246 pz 19 de 19 ━━━━━━━━   │           13,5     ▼ 0,7       — 0,2
 *
 * Cada fila es un subgrid de la tabla (columnas por NOMBRE de línea: `nom pz min sep ap vu v5`), así el encabezado y sus
 * números comparten columna y alineación. Lo que cambia con el ancho se decide con container queries del propio contenedor
 * (`.rb-caja`): bajo 470 px sin la columna de piezas; bajo 360 px (celular) la Línea ocupa dos columnas y sus referencias van en
 * una fila propia. Toda cifra viene de Shoplogix por props que ya existían; aquí solo se ubican y se dicen.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { RotuloFranja } from './FranjaTocable'
import { esperadoPorMinuto, int, minutosCompletos, relojDe, sumaPorMinuto } from './ejeTurno'
import type { EjeDatos } from './GraficoRitmoVivo'
import type { MonitorV2Props } from './MonitorV2'
import { comparacion, type DatosAporte, type FilaAporte } from './aporteBaaders'
import { ANDUVO_COMPLETO_S, MAL, PUNTO_ESTADO, TEXTO_ESTADO, type FilaBaader } from './baadersMinuto'
import { etiquetaMaquina, normalizar, vaciosTurnoDe } from './ritmoVivo'
import type { RelojDeDatos } from './useRelojDeDatos'

const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
const acota = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

/**
 * Las piezas de una Baader siguen al MISMO reloj que la cifra grande de «Piezas del turno»: con la reproducción del último minuto
 * activa cada Baader sube un escalón por pieza (`rep.porMaquina`, cuya suma es la cifra de la línea en cada cuadro), así las
 * tres cuadran con el total en todo instante y no solo cuando la reproducción llegó al contador. Sin reproducción (turno
 * cerrado, sin serie por minuto) vale `respaldo`. El texto se escribe solo cuando cambia el entero.
 */
export function PiezasBaader({ reloj, id, respaldo, className }: { reloj: RelojDeDatos; id: string; respaldo: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  /* Ni un frame con el contador vivo: el primer pintado ya es lo que dice el reloj (como `CifraViva`). */
  const [inicial] = useState(() => int(reloj.cuadro().rep?.porMaquina.find((m) => m.id === id)?.valor ?? respaldo))
  const ultimo = useRef(inicial)
  useEffect(() => reloj.alCuadro((c) => {
    const el = ref.current
    if (!el) return
    const t = int(c.rep?.porMaquina.find((m) => m.id === id)?.valor ?? respaldo)
    /* Se compara con lo que HAY en el nodo, no solo con lo último escrito. */
    if (t !== ultimo.current || el.textContent !== t) { ultimo.current = t; el.textContent = t }
  }), [reloj, id, respaldo])
  return <span ref={ref} className={className}>{inicial}</span>
}

/** La fila de aporte de una Baader (por nombre, sin importar tildes ni mayúsculas); null si no hay. */
const aporteDe = (ap: DatosAporte | null, nombre: string): FilaAporte | null => {
  if (!ap) return null
  const k = normalizar(nombre)
  return ap.filas.find((f) => normalizar(f.nombre) === k) ?? null
}

/** Una comparación sin cápsula: ▲ en el acento, ▼ en el rojo de texto, «— 0,2» en raya. `null` = sin referencia: un punto. */
function Delta({ d, linea }: { d: number | null | undefined; linea?: boolean }) {
  const c = comparacion(d)
  if (!c) return <span className={`rb-d rb-d-vacio${linea ? ' rb-d-l' : ''}`} aria-label="sin referencia">·</span>
  return <span className={`rb-d rb-d-${c.clase}${linea ? ' rb-d-l' : ''}`}>{c.texto}</span>
}

const Sep = () => <span className="rb-sep" aria-hidden />

// ── La tarjeta de la franja ──────────────────────────────────────────────────

export function RitmoBaaders({ p, e, reloj, filas }: { p: MonitorV2Props; e: EjeDatos | null; reloj: RelojDeDatos; filas: FilaBaader[] }) {
  const ap = p.aporte ?? null
  const minuto = e?.minuto ?? null
  /* La cifra es de la LÍNEA: vale el último minuto que todas las Baader ya entregaron, no el de la serie más larga. */
  const n = minuto ? minutosCompletos(minuto.maquinas) : 0
  const conMinuto = minuto != null && n > 0 && !p.cerrado
  const ultimo = conMinuto ? sumaPorMinuto(minuto.maquinas, n)[n - 1] ?? 0 : null
  const esperado = conMinuto ? esperadoPorMinuto(minuto.maquinas, n)[n - 1] ?? null : null
  const hora = conMinuto ? relojDe(Date.parse(minuto.desde) + (n - 1) * 60_000) : null
  const unidad = e?.unidad ?? null

  /* Qué columnas de comparación hay: dos, una («vs último» sola con 1 turno de muestra) o «vs turnos previos» antes de los 45 min. */
  const previos = ap?.antesDeRodar === true
  const conU = ap != null && (ap.conUltimo || previos)
  const conP = ap != null && ap.conProm
  const vs = previos ? 'previos' : conU && conP ? 'ambos' : conU ? 'ultimo' : 'ninguno'

  const palabra = (f: FilaBaader) => (f.estado != null && f.estado in TEXTO_ESTADO ? f.estado : null)
  const anduvoDe = (f: FilaBaader) => (!p.cerrado && f.anduvoS != null && f.anduvoS > 0 && Math.round(f.anduvoS) < ANDUVO_COMPLETO_S ? Math.round(f.anduvoS) : null)
  /* Si alguna fila lleva palabra (o la nota «anduvo N s»), TODAS reservan su hueco: las pistas empiezan y terminan igual. */
  const conHueco = conMinuto && filas.some((f) => palabra(f) != null || anduvoDe(f) != null)
  const huecoAncho = conMinuto && filas.some((f) => anduvoDe(f) != null)

  const lineaAporte = ap?.linea.aporte ?? p.ritmo
  /* Referencias de la línea, en la misma base «andando». Cerrado: lo mejor y lo normal si existen (los mismos datos del detalle). */
  const refs = (p.cerrado
    ? [
        p.ritmoInfo.mejorCpm != null ? { k: 'mejor turno', v: p.ritmoInfo.mejorCpm } : null,
        p.ritmoInfo.medianaCpm != null ? { k: 'normal', v: p.ritmoInfo.medianaCpm } : null,
      ]
    : [
        p.ritmoMedia15 != null ? { k: '15 min', v: p.ritmoMedia15 } : null,
        p.ritmoPedido != null ? { k: 'necesario', v: p.ritmoPedido } : null,
      ]
  ).filter((q): q is { k: string; v: number } => q != null)

  /* En el celular el encabezado baja a dos renglones («vs / último») por el ancho de su columna (`.rb-h-d`), sin salto forzado. */
  const vsCab = (k: 'u' | 'p') => (k === 'u'
    ? (previos ? <><span>vs turnos</span> <span>previos</span></> : <><span>vs</span> <span>último</span></>)
    : <><span>vs</span> <span>prom. {ap?.turnosProm}</span></>)

  return (
    <div className="rb-caja" style={huecoAncho ? ({ '--rb-hueco': '70px' } as CSSProperties) : undefined}>
      <div className="rb" data-modo={conMinuto ? 'minuto' : 'promedio'} data-vs={vs}>
        {/* Grupos: «Ritmo ›» · «Último minuto» + hora · «Promedio del turno». */}
        <div className="rb-f rb-f-grupos">
          <span className="rb-rot"><RotuloFranja tocable>Ritmo</RotuloFranja></span>
          {conMinuto && <span className="rb-g rb-g-min">Último minuto <span className="rb-g-hora">{hora}</span></span>}
          <span className="rb-g rb-g-prom">Promedio del turno</span>
          {conMinuto && <Sep />}
        </div>
        {/* Encabezados de columna: cada uno en la columna de sus números y con su misma alineación. */}
        <div className="rb-f rb-f-cols">
          <span className="rb-h rb-h-min" data-col="min">{conMinuto ? (unidad ? `${unidad} con pieza` : 'pz del minuto') : 'aporte al promedio'}</span>
          {conMinuto && <span className="rb-h rb-h-ap" data-col="ap">aporte</span>}
          {conU && <span className="rb-h rb-h-d" data-col="vu">{vsCab('u')}</span>}
          {conP && <span className="rb-h rb-h-d" data-col="v5">{vsCab('p')}</span>}
          {conMinuto && <Sep />}
        </div>

        {/* La Línea: su rótulo en la MISMA línea base que la cifra grande (la fila alinea por línea base). */}
        <div className="rb-f rb-f-linea">
          <span className="rb-n rb-n-linea" data-col="nom">Línea</span>
          <span className="rb-linea-fig" data-col="min">
            {conMinuto
              ? <><span className="rb-big">{int(ultimo ?? 0)}</span><span className="rb-big-u">{esperado != null && esperado > 0 ? `de ${int(esperado)} pz/min` : 'pz/min'}</span></>
              : <><span className="rb-big">{lineaAporte != null ? dec(lineaAporte) : '—'}</span><span className="rb-big-u">pz/min andando</span></>}
          </span>
          {conMinuto && <Sep />}
          {conMinuto && <span className="rb-ap-l" data-col="ap">{lineaAporte != null ? dec(lineaAporte) : '—'}</span>}
          {conU && (previos
            ? <span className="rb-nota rb-nota-previos" data-col="vu">desde los 45 min<br />produciendo</span>
            : <span className="rb-vs" data-col="vu"><Delta d={ap?.linea.vsUltimo} linea /></span>)}
          {conP && <span className="rb-vs" data-col="v5"><Delta d={ap?.linea.vsProm} linea /></span>}
          {refs.length > 0 && (
            <span className="rb-refs">
              {refs.map((q) => <span key={q.k} className="rb-ref">{q.k}<b>{dec(q.v)}</b></span>)}
            </span>
          )}
        </div>
        <div className="rb-f rb-f-hsep" aria-hidden>
          <i className="rb-hsep" />
          {conMinuto && <Sep />}
        </div>

        {filas.map((f) => {
          const a = aporteDe(ap, f.nombre)
          const pal = palabra(f)
          const anduvo = anduvoDe(f)
          const frac = f.ritmo != null && f.esperado != null && f.esperado > 0 ? acota(f.ritmo / f.esperado, 0, 1) : null
          const color = f.estado ? PUNTO_ESTADO[f.estado] : 'var(--v2-gris)'
          const detenida = f.estado === 'detenida'
          return (
            <div key={f.id} className="rb-f rb-f-ev" data-baader={f.id} title={f.llenado != null ? `${etiquetaMaquina(f.nombre)}: ${f.llenado} % de lo que daba mientras anduvo` : undefined}>
              <span className="rb-n" data-col="nom"><i className="rb-punto" style={{ background: color }} aria-hidden />{etiquetaMaquina(f.nombre)}</span>
              <span className="rb-pzc" data-col="pz"><PiezasBaader reloj={reloj} id={f.id} respaldo={f.piezas} className="rb-pz tabular-nums" /><span className="rb-pz-u"> pz</span></span>
              {conMinuto ? (
                <span className="rb-min" data-col="min">
                  <span className="rb-min-t"><b style={detenida ? { color: 'var(--v2-mal-texto)' } : undefined}>{f.ritmo != null ? int(f.ritmo) : '—'}</b>{f.esperado != null ? ` de ${int(f.esperado)}` : ''}</span>
                  <span className="rb-pista" aria-hidden>{frac != null && <span style={{ width: `${frac * 100}%`, background: color }} />}</span>
                  {conHueco && (
                    <span className={`rb-est${pal || anduvo != null ? '' : ' rb-est-vacio'}`} style={pal ? { color: TEXTO_ESTADO[pal] } : undefined}>
                      {pal ?? (anduvo != null ? <span className="rb-anduvo">anduvo {anduvo} s</span> : null)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="rb-min rb-min-prom" data-col="min"><span className="rb-ap">{a?.aporte != null ? dec(a.aporte) : f.promedio != null ? dec(f.promedio) : '—'}</span><span className="rb-u">pz/min</span></span>
              )}
              {conMinuto && <Sep />}
              {conMinuto && <span className="rb-ap r" data-col="ap">{a?.aporte != null ? dec(a.aporte) : '—'}</span>}
              {conU && (previos ? <span data-col="vu" /> : <span className="rb-vs" data-col="vu"><Delta d={a?.vsUltimo} /></span>)}
              {conP && <span className="rb-vs" data-col="v5"><Delta d={a?.vsProm} /></span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── El detalle ───────────────────────────────────────────────────────────────

/** Una barrita de 56×3 con el % del turno andando: ≥ 75 bien, ≥ 50 atento, < 50 mal (los cortes de siempre de la tabla). */
function BarraAndando({ pct }: { pct: number | null }) {
  const color = pct == null ? 'var(--v2-gris)' : pct >= 75 ? 'var(--v2-bien)' : pct >= 50 ? 'var(--v2-atento)' : MAL
  return <span className="rb-and" aria-hidden><span style={{ width: `${pct == null ? 0 : acota(pct, 2, 100)}%`, background: color }} /></span>
}

/**
 * El panel «Ritmo»: la tabla completa (Línea primero, con «ahora»), por Baader el % del turno andando, el control del pulso
 * tal cual, y los carros del turno por Baader (ESTIMACIÓN: velocidad seteada × tiempo andando). Las «Referencias de la línea» son
 * una lista agrupada que arma MonitorV2 (`referencias`), con sus mismas filas de siempre.
 */
export function RitmoDetalle({ p, reloj, filas, referencias }: { p: MonitorV2Props; reloj: RelojDeDatos; filas: FilaBaader[]; referencias: ReactNode }) {
  const ap = p.aporte ?? null
  const e = p.eje ?? null
  const minuto = e?.minuto ?? null
  const n = minuto ? minutosCompletos(minuto.maquinas) : 0
  const conMinuto = minuto != null && n > 0 && !p.cerrado
  const ultimo = conMinuto ? sumaPorMinuto(minuto.maquinas, n)[n - 1] ?? 0 : null
  const esperado = conMinuto ? esperadoPorMinuto(minuto.maquinas, n)[n - 1] ?? null : null
  const unidad = e?.unidad ?? null
  const varias = filas.length > 1
  const previos = ap?.antesDeRodar === true
  const conU = ap != null && (ap.conUltimo || previos)
  const conP = ap != null && ap.conProm
  const conAhora = ap?.ahoraModo != null
  const lineaAporte = ap?.linea.aporte ?? p.ritmo

  const palabra = (f: FilaBaader) => (f.estado != null && f.estado in TEXTO_ESTADO ? f.estado : null)
  const cab = (t: ReactNode, col: string) => <span className="rb-h rb-h-d" data-col={col}>{t}</span>
  const pastilla = (d: number | null | undefined, linea?: boolean) => {
    const c = comparacion(d)
    return c ? <span className={`rb-pil rb-pil-${c.clase}${linea ? ' rb-pil-l' : ''}`}>{c.texto}</span> : <span className="rb-d rb-d-vacio" aria-label="sin referencia">·</span>
  }

  const vacios = minuto && n > 0 ? vaciosTurnoDe(minuto, n, e?.paradasMaquina) : null
  const conVacios = vacios != null && vacios.maquinas.length > 0 && vacios.linea.pasaron > 0
  const Unidad = unidad ? unidad[0]!.toUpperCase() + unidad.slice(1) : 'Carros'
  const unidadSing = unidad ?? 'carros'

  return (
    <div className="rb-det" data-vs={previos ? 'previos' : conU && conP ? 'ambos' : conU ? 'ultimo' : 'ninguno'} data-ahora={conAhora ? 'si' : 'no'} data-minuto={conMinuto ? 'si' : 'no'}>
      <div className="rb-dt">
        <div className="rb-f rb-f-cols">
          <span className="rb-h" data-col="nom" />
          {varias && <span className="rb-h rb-h-der" data-col="pz">piezas</span>}
          <span className="rb-h" data-col="min">{conMinuto ? (unidad ? `${unidad} con pieza` : 'pz del minuto') : 'aporte al promedio'}</span>
          {conAhora && cab(ap?.ahoraModo === 'media15' ? 'media 15 min' : 'ahora', 'ahora')}
          {conMinuto && cab('aporte', 'ap')}
          {conU && cab(previos ? 'vs turnos previos' : 'vs último', 'vu')}
          {conP && cab(`vs prom. ${ap?.turnosProm}`, 'v5')}
        </div>
        <div className="rb-f rb-f-linea-d">
          <span className="rb-n rb-n-linea rb-n-d" data-col="nom">{varias ? 'Línea' : etiquetaMaquina(filas[0]?.nombre ?? 'Línea')}</span>
          {varias && <span data-col="pz" />}
          <span className="rb-min" data-col="min">
            {conMinuto
              ? <><span className="rb-det-l">{int(ultimo ?? 0)}</span><span className="rb-u">{esperado != null && esperado > 0 ? `de ${int(esperado)}` : ''}</span></>
              : <><span className="rb-det-l">{lineaAporte != null ? dec(lineaAporte) : '—'}</span><span className="rb-u">pz/min andando</span></>}
          </span>
          {conAhora && <span className="rb-det-v r" data-col="ahora">{ap?.linea.ahora != null ? dec(ap.linea.ahora) : '—'}</span>}
          {conMinuto && <span className="rb-det-l r" data-col="ap">{lineaAporte != null ? dec(lineaAporte) : '—'}</span>}
          {conU && (previos ? <span className="rb-nota r" data-col="vu">desde los 45 min<br />produciendo</span> : <span className="rb-vs" data-col="vu">{pastilla(ap?.linea.vsUltimo, true)}</span>)}
          {conP && <span className="rb-vs" data-col="v5">{pastilla(ap?.linea.vsProm, true)}</span>}
        </div>
        {!varias && filas[0] && (() => {
          const a = aporteDe(ap, filas[0]!.nombre)
          return <div className="rb-sub"><BarraAndando pct={a?.uptimePct ?? null} />{a?.uptimePct != null && <span>andando <b>{Math.round(a.uptimePct)} %</b> del turno, a <b>{dec(a.cpm)}</b> pz/min</span>}</div>
        })()}
        {varias && filas.map((f) => {
          const a = aporteDe(ap, f.nombre)
          const pal = palabra(f)
          const detenida = f.estado === 'detenida'
          const color = f.estado ? PUNTO_ESTADO[f.estado] : 'var(--v2-gris)'
          return (
            <div key={f.id} className="rb-bloque">
              <div className="rb-f rb-f-ev-d">
                <span className="rb-n" data-col="nom"><i className="rb-punto" style={{ background: color }} aria-hidden />{etiquetaMaquina(f.nombre)}</span>
                <span className="rb-det-v r" data-col="pz"><PiezasBaader reloj={reloj} id={f.id} respaldo={f.piezas} /></span>
                {conMinuto ? (
                  <span className="rb-min" data-col="min">
                    <span className="rb-min-t"><b style={detenida ? { color: 'var(--v2-mal-texto)' } : undefined}>{f.ritmo != null ? int(f.ritmo) : '—'}</b>{f.esperado != null ? ` de ${int(f.esperado)}` : ''}</span>
                    {pal && <span className="rb-est rb-est-d" style={{ color: TEXTO_ESTADO[pal] }}>{pal}</span>}
                  </span>
                ) : (
                  <span className="rb-min" data-col="min"><span className="rb-ap">{a?.aporte != null ? dec(a.aporte) : f.promedio != null ? dec(f.promedio) : '—'}</span><span className="rb-u">pz/min</span></span>
                )}
                {conAhora && <span className="rb-det-v r" data-col="ahora">{a?.ahora != null ? dec(a.ahora) : '—'}</span>}
                {conMinuto && <span className="rb-det-v r" data-col="ap">{a?.aporte != null ? dec(a.aporte) : '—'}</span>}
                {conU && (previos ? <span data-col="vu" /> : <span className="rb-vs" data-col="vu">{pastilla(a?.vsUltimo)}</span>)}
                {conP && <span className="rb-vs" data-col="v5">{pastilla(a?.vsProm)}</span>}
              </div>
              {a?.uptimePct != null && (
                <div className="rb-sub">
                  <BarraAndando pct={a.uptimePct} />
                  <span><span className="rb-solo-hoja"><b>{int(f.piezas)}</b> piezas · </span>andando <b>{Math.round(a.uptimePct)} %</b> del turno, a <b>{dec(a.cpm)}</b> pz/min</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* El control del pulso, tal cual (el mismo que queda bajo el gráfico). */}
      {p.ritmoPulso}

      {conVacios && vacios && (
        <section className="rb-vac" aria-label={`${Unidad} del turno, por Baader`}>
          <h3 className="rb-tit">{Unidad} del turno, por Baader</h3>
          <p className="rb-est-nota">Estimación según la velocidad seteada y el tiempo andando · {vacios.minutos} min con dato</p>
          <div className="rb-carros">
            <div className="rb-cf rb-cf-cab">
              <span className="rb-h" />
              <span className="rb-h rb-h-der">pasaron</span>
              <span className="rb-h rb-h-der">con pieza</span>
              <span className="rb-h rb-h-der">vacíos</span>
              <span className="rb-h rb-h-der">% con pieza</span>
            </div>
            {varias && (
              <div className="rb-cf rb-cf-linea">
                <span className="rb-n rb-n-linea rb-n-d">Línea</span>
                <span className="rb-cv r ln">{int(vacios.linea.pasaron)}</span>
                <span className="rb-cv r ln">{int(vacios.linea.conPieza)}</span>
                <span className="rb-cv r ln">{int(vacios.linea.vacios)}</span>
                <span className="rb-cv r ln">{vacios.linea.pct != null ? `${dec(vacios.linea.pct)} %` : '—'}</span>
              </div>
            )}
            {vacios.maquinas.map((v) => {
              const f = filas.find((x) => x.id === v.id)
              const color = f?.estado ? PUNTO_ESTADO[f.estado] : 'var(--v2-gris)'
              return (
                <div key={v.id} className="rb-cf">
                  <span className="rb-n"><i className="rb-punto" style={{ background: color }} aria-hidden />{etiquetaMaquina(v.nombre)}</span>
                  <span className="rb-cv r">{int(v.pasaron)}</span>
                  <span className="rb-cv r">{int(v.conPieza)}</span>
                  <span className="rb-cv r">{int(v.vacios)}</span>
                  <span className="rb-cv r">{v.pct != null ? `${dec(v.pct)} %` : '—'}</span>
                </div>
              )
            })}
          </div>
          <p className="rb-pie">Los vacíos son {unidadSing} que llegaron sin pescado: es pescado que no llegó a la Baader, no una falla de la máquina.
            {varias && vacios.linea.pasaron - vacios.linea.conPieza !== vacios.linea.vacios && (
              <> La Línea suma los vacíos de cada Baader: una que contó más de lo que su velocidad seteada permite no compensa a las otras.</>
            )}
          </p>
        </section>
      )}

      {referencias}
    </div>
  )
}
