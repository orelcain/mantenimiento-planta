/**
 * El globo del minuto por dentro: el minuto en 60 segundos, Baader por Baader, con cada parada al segundo (se usa desde `EXACTO_PX_MIN`).
 *
 * Todo lo que dice sale de `lecturaDelMinuto` (`minutoPorDentro.ts`): aquí solo se ordena y se dibuja. Lo que es calculado se dice
 * calculado (el reparto de lo que faltó usa el esperado por segundo detenido: no hay producción medida por segundo) y lo que es estimado,
 * estimado (los ~20 s que cada micro esconde). En PC flota sobre las filas; en el celular (`compacto`) va anclado arriba de la tarjeta.
 * Una fila de micro se puede abrir (toque, Enter, o el mouse encima con el globo fijo por un clic): sale su `GloboMicro`, con la causa probable y la tabla.
 */
import { X } from 'lucide-react'
import type { CSSProperties, ReactElement, Ref } from 'react'
import { COLOR_TONO, OPACIDAD_FILA, adelanteAtras, andandoDelMinuto, int } from './ejeTurno'
import { COLOR_CAUSA, OCULTO_S, ROTULO_CAUSA } from './microCausa'
import { duracionDeParada, type DetencionDelMinuto, type FilaMinuto, type LecturaMinuto, type MicroDelMinuto, type ProgramadaDelMinuto } from './minutoPorDentro'

const dec = (n: number, d = 1) => n.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })
/** 16 → «16», 8,5 → «8,5»: una cifra en piezas con a lo más un decimal (ya viene redondeada). */
const pz = (n: number) => (Number.isInteger(n) ? int(n) : dec(n))

/** El ancho del dibujo de 60 s de cada Baader: 192 px en PC, 170 en 1366 y 132 en el celular. */
const ANCHO_BARRA = { grande: 192, medio: 170, chico: 132 } as const

/** Las marcas de 15, 30 y 45 s de la barra y de las guías del gráfico. */
export const MARCAS_15S = [15, 30, 45] as const

/** La barra de 0 a 60 s de una Baader: lo andado con el tono de su minuto, cada parada con su forma y la ▼ de cada micro con el color de su causa. */
function BarraMinuto({ fila, w, micros, iniMs }: { fila: FilaMinuto; w: number; micros: MicroDelMinuto[]; iniMs: number }) {
  const X0 = (s: number) => (s / 60) * w
  return (
    <svg width={w} height={22} viewBox={`0 0 ${w} 22`} aria-hidden>
      <rect x={0} y={8} width={w} height={12} rx={3} fill="rgb(142 142 147 / 0.10)" />
      {fila.tono !== 'sin' && andandoDelMinuto(fila.tramos).map(([a, b], i) => {
        const i0 = a > 0 ? 1 : 0
        const i1 = b < 60 ? 1 : 0
        return <rect key={i} x={X0(a) + i0} y={8} width={Math.max(0, X0(b) - X0(a) - i0 - i1)} height={12} fill={COLOR_TONO[fila.tono]} fillOpacity={fila.tono === 'sin' ? 1 : OPACIDAD_FILA[fila.tono]} />
      })}
      {fila.tramos.map((t, i) => {
        const x = X0(t.desdeS)
        const ancho = Math.max(2, X0(t.hastaS) - X0(t.desdeS))
        if (t.tipo === 'micro') return <rect key={i} x={x} y={8} width={ancho} height={7} fill="var(--rv-micro)" />
        if (t.tipo === 'detencion') return <rect key={i} x={x} y={8} width={ancho} height={12} fill="var(--rv-detenida)" />
        return <rect key={i} x={x + 0.5} y={8.5} width={Math.max(1, ancho - 1)} height={11} rx={2} fill="none" stroke="var(--v2-gris)" strokeDasharray="3 3" />
      })}
      {fila.tramos.filter((t) => t.tipo === 'micro' && t.parada.iniMs >= iniMs).map((t, i) => (
        <path key={`m${i}`} d={`M${X0(t.desdeS) - 5} 0h10l-5 7z`} fill={COLOR_CAUSA[micros.find((m) => m.baaderId === fila.id && m.inicioMs === t.parada.iniMs)?.causa ?? 'sin']} style={{ paintOrder: 'stroke', stroke: 'rgb(var(--card))', strokeWidth: 2 }} />
      ))}
      {MARCAS_15S.map((q) => <line key={q} x1={X0(q)} x2={X0(q)} y1={6} y2={22} stroke="var(--rv-guia)" />)}
    </svg>
  )
}

/** «Ev 1», «Ev 1 y Ev 2», «Ev 1, Ev 2 y Ev 3». */
const lista = (nombres: string[]) => (nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`)

const Triangulo =({ color }: { color: string }) => <svg className="tri" viewBox="0 0 10 8" aria-hidden><path d="M0 0h10l-5 8z" fill={color} /></svg>

interface Props {
  lectura: LecturaMinuto
  tam: 'grande' | 'medio' | 'chico'
  compacto?: boolean
  /** Hechas y meta a esa hora (la lectura que ya daba el globo de siempre): no se pierde al acercarse. */
  resumen?: { acum: number | null; futuro: boolean; tocaban: number | null; ahora: boolean; dif: number | null } | null
  /** «parcial · falta Ev 2»: el minuto en curso al que alguna Baader aún no entregó su dato. */
  parcial?: string | null
  /** La micro abierta ahora (su fila queda marcada). */
  microAbierta?: string | null
  /** Mouse encima de una fila de micro (null al salir) y toque o clic en ella. */
  onMicroHover?: (id: string | null) => void
  onMicroClick?: (id: string) => void
  onCerrar?: () => void
  /**
   * PC: el globo quedó fijo con un clic en el gráfico. Con el mouse el globo sigue al minuto bajo el puntero, así que sus filas de micro no se
   * alcanzaban (el globo se movía al acercarse). Fijo deja de seguir y recibe el mouse: ahí se abre la causa de cada micro.
   */
  fijo?: boolean
  style?: CSSProperties
  refGlobo?: Ref<HTMLDivElement>
  onPointerLeave?: (ev: React.PointerEvent<HTMLDivElement>) => void
}

export function GloboMinuto({ lectura, tam, compacto, resumen, parcial, microAbierta, onMicroHover, onMicroClick, onCerrar, fijo, style, refGlobo, onPointerLeave }: Props) {
  const L = lectura
  const w = compacto ? ANCHO_BARRA.chico : ANCHO_BARRA[tam]
  const F = L.faltaron
  const hay = F != null && L.piezas != null && L.esperadoBruto != null

  /* La línea: lo contado contra lo esperado. Con algo programado, el esperado es el de los segundos que NO fueron programados (el de
     20 pz/min menos la colación): se dice con el que se calcula, para que «de 20» y «faltaron 2,3» no parezcan un error. */
  const progTxt = (() => {
    if (!F || !L.programado) return null
    const sin = L.programado.motivo ? L.programado.motivo.toLowerCase() : 'lo programado'
    return L.programado.s != null ? `esperado ${pz(F.esperado)} pz (${60 - L.programado.s} s sin ${sin})` : `esperado ${pz(F.esperado)} pz (sin ${sin})`
  })()
  const faltoAlgo = F != null && F.faltaron > 0.04
  /* Con algo programado se quita el «de 20 pz/min»: 20 − 8 son 12 y lo que faltó (2,3) sale del esperado descontado, que es el que se dice. */
  const linea = hay ? (
    <div className="rv-gm-lin tabular-nums">
      Línea <b>{int(L.piezas!)}</b>{progTxt ? ' pz' : <> de {int(L.esperadoBruto!)} pz/min</>}
      {progTxt && <span className="text-muted-foreground"> · {progTxt}</span>}
      {faltoAlgo ? <> · faltaron <b>{pz(F!.faltaron)}</b> pz</> : <span className="text-muted-foreground"> · no faltó nada</span>}
    </div>
  ) : (
    <div className="rv-gm-lin text-muted-foreground">La línea no tiene el dato completo de este minuto</div>
  )

  /* Lo que faltó, en tres partes que suman lo que faltó (cada una con un decimal, en piezas). Un «por ritmo» negativo no se muestra como número
     negativo: el resto del minuto contó MÁS de lo esperado, y eso se dice con su unidad, sin afirmar cómo anduvo (las piezas son por minuto: pudieron
     caer de otro). Si la línea contó 0 y ninguna Baader tiene ritmo medible, el resto no se le carga al ritmo: queda «sin explicar» (Filete 11:23). */
  const rotuloRitmo = ROTULO_CAUSA.ritmo.toLowerCase()
  const perd = hay && faltoAlgo && F ? (
    <div className="rv-gm-perd tabular-nums">
      {F.detencion > 0.04 && <span><i style={{ background: 'var(--rv-detenida)' }} aria-hidden />{pz(F.detencion)} pz por detención</span>}
      {F.micro > 0.04 && <span><i style={{ background: 'var(--rv-micro)' }} aria-hidden />{pz(F.micro)} pz por micro</span>}
      {F.ritmo > 0.04 && <span><i style={{ background: 'var(--v2-relleno)', boxShadow: 'inset 0 0 0 1px var(--v2-tenue)' }} aria-hidden />{pz(F.ritmo)} pz {L.restoSinExplicar ? 'sin explicar (la línea contó 0)' : `por ${rotuloRitmo}`}</span>}
      {F.ritmo < -0.04 && <span>el resto del minuto contó {pz(-F.ritmo)} pz más de lo esperado</span>}
      {(F.detencion > 0.04 || F.micro > 0.04) && (
        <span className="sub">{compacto ? 'Reparto calculado con lo esperado por segundo detenido.' : 'Reparto calculado con lo esperado por segundo detenido: Shoplogix no mide piezas por segundo.'}</span>
      )}
    </div>
  ) : null

  const filaRit = (f: FilaMinuto) => {
    if (f.estado === 'detenida') return <span className="mut">detenida</span>
    if (f.estado === 'poco') return <span className="mut">— poco tiempo andando</span>
    if (f.estado === 'sin-dato') return <span className="mut">sin dato</span>
    return (
      <span className="rit">
        <i style={{ background: COLOR_TONO[f.tono], opacity: f.tono === 'bien' ? 0.6 : 1 }} aria-hidden />
        <b>{pz(Math.round(f.ritmo! * 10) / 10)}</b>{f.esperado != null ? <>&nbsp;de {pz(f.esperado)}</> : null}{!compacto && f.pct != null ? ` · ${f.pct}\u00a0%` : ''}
      </span>
    )
  }
  const tabla = (
    <div className="rv-gm-tabla" style={{ gridTemplateColumns: compacto ? `max-content ${w}px auto` : `max-content ${w}px 22px 54px auto` }}>
      {!compacto && (
        <div className="rv-gm-fila">
          <span className="enc" />
          <span className="enc" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 1px' }} aria-hidden><span>:00</span><span>:15</span><span>:30</span><span>:45</span><span>:60</span></span>
          <span className="enc num">pz</span>
          <span className="enc num">andando</span>
          <span className="enc">ritmo andando (calculado)</span>
        </div>
      )}
      {L.filas.map((f) => (
        <div key={f.id} className="rv-gm-fila">
          <span className="bq">{f.nombre}</span>
          <BarraMinuto fila={f} w={w} micros={L.micros} iniMs={L.iniMs} />
          {compacto
            ? <span className="mut">{f.estado === 'ritmo' ? filaRit(f) : f.estado === 'detenida' ? 'detenida' : `${f.piezas ?? '—'} pz en ${duracionDeParada({ durS: f.andandoS })}`}</span>
            : <>
              <span className="num">{f.piezas ?? '—'}</span>
              <span className="num">{duracionDeParada({ durS: f.andandoS })}</span>
              {filaRit(f)}
            </>}
        </div>
      ))}
    </div>
  )

  const quien = (p: { baader: string }) => <b>{p.baader}</b>
  const filaDetencion = (p: DetencionDelMinuto, i: number) => (
    <div key={`d${i}`} className="rv-gm-ev">
      <i className="sw" style={{ background: 'var(--rv-detenida)' }} aria-hidden />
      <span>
        {quien(p)} {p.abierta ? <>desde {p.desde} · parada en curso, todavía sin clasificar</> : <>{p.desde} → {p.hasta} · <b>{duracionDeParada(p)}</b> · {p.dueno === 'sin-imputar' ? <>Sin imputar <span className="falta">· falta dueño</span></> : <>{p.duenoTxt}{p.motivo ? ` · ${p.motivo}` : ''}</>}</>}
      </span>
    </div>
  )
  const filaProgramada = (p: ProgramadaDelMinuto, i: number) => (
    <div key={`p${i}`} className="rv-gm-ev">
      <i className="sw" style={{ border: '1px dashed var(--v2-gris)' }} aria-hidden />
      <span>{quien(p)} {p.motivo} {p.desde} → {p.hasta} · <b>{duracionDeParada(p)}</b> · programada, no se recupera</span>
    </div>
  )
  const filaMicro = (p: MicroDelMinuto, i: number, extra?: string) => {
    const causa = p.causa ? ROTULO_CAUSA[p.causa] : null
    const contenido = (
      <>
        <Triangulo color={COLOR_CAUSA[p.causa ?? 'sin']} />
        <span>{quien(p)}{extra} {p.desde} → {p.hasta} · <b>{duracionDeParada(p)}</b>{causa ? ` · ${causa}` : ''}</span>
      </>
    )
    if (!p.microId) return <div key={`m${i}`} className="rv-gm-ev">{contenido}</div>
    const id = p.microId
    return (
      <button
        key={`m${i}`}
        type="button"
        className={`rv-gm-ev${compacto ? ' tap-44' : ''}`}
        aria-expanded={microAbierta === id}
        aria-label={`Ver la causa probable de la micro de ${p.baader} de las ${p.desde}`}
        onPointerEnter={(ev) => { if (ev.pointerType === 'mouse') onMicroHover?.(id) }}
        onPointerLeave={(ev) => { if (ev.pointerType === 'mouse') onMicroHover?.(null) }}
        /* Con el mouse ya se abrió al pasar por encima: el clic no lo cierra. Un toque o el teclado (Enter) lo abren y lo cierran. */
        onClick={(ev) => { if ((ev.nativeEvent as PointerEvent).pointerType !== 'mouse') onMicroClick?.(id) }}
      >
        {contenido}
      </button>
    )
  }

  /* Celular: una línea por parada y las micro iguales (mismo inicio, duración y causa) se agrupan: «Ev 1 y Ev 2 15:13:00 · 15 s micro · línea común». */
  const eventosCompactos = (() => {
    const out: ReactElement[] = []
    L.detenciones.forEach((p, i) => out.push(
      <div key={`d${i}`} className="rv-gm-ev">
        <i className="sw" style={{ background: 'var(--rv-detenida)' }} aria-hidden />
        <span>{quien(p)} {p.desde} · <b>{p.abierta ? 'en curso' : duracionDeParada(p)}</b> detención{p.abierta ? ' · todavía sin clasificar' : p.dueno === 'sin-imputar' ? <> <span className="falta">· falta dueño</span></> : `${p.duenoTxt ? ` · ${p.duenoTxt}` : ''}`}</span>
      </div>,
    ))
    L.programadas.forEach((p, i) => out.push(
      <div key={`p${i}`} className="rv-gm-ev">
        <i className="sw" style={{ border: '1px dashed var(--v2-gris)' }} aria-hidden />
        <span>{quien(p)} {p.motivo} {p.desde} → {p.hasta} · <b>{duracionDeParada(p)}</b> · programada</span>
      </div>,
    ))
    const grupos: Array<{ p: MicroDelMinuto; nombres: string[] }> = []
    for (const p of L.micros) {
      const g = grupos.find((x) => x.p.inicioMs === p.inicioMs && x.p.durS === p.durS && x.p.causa === p.causa)
      if (g) g.nombres.push(p.baader)
      else grupos.push({ p, nombres: [p.baader] })
    }
    grupos.forEach(({ p, nombres }, i) => {
      const causa = p.causa ? ` · ${ROTULO_CAUSA[p.causa].toLowerCase()}` : ''
      const contenido = (
        <>
          <Triangulo color={COLOR_CAUSA[p.causa ?? 'sin']} />
          <span><b>{lista(nombres)}</b> {p.desde} · <b>{duracionDeParada(p)}</b> micro{causa}</span>
        </>
      )
      if (!p.microId) { out.push(<div key={`m${i}`} className="rv-gm-ev">{contenido}</div>); return }
      const id = p.microId
      out.push(
        <button key={`m${i}`} type="button" className="rv-gm-ev tap-44" aria-expanded={microAbierta === id} aria-label={`Ver la causa probable de la micro de ${lista(nombres)} de las ${p.desde}`} onClick={() => onMicroClick?.(id)}>
          {contenido}
        </button>,
      )
    })
    return out
  })()

  const sinParadas = L.detenciones.length === 0 && L.programadas.length === 0 && L.micros.length === 0
  const secciones = compacto ? (
    <div className="rv-gm-sec">{sinParadas ? <span className="text-muted-foreground">Sin paradas en este minuto</span> : eventosCompactos}</div>
  ) : (
    <>
      {L.detenciones.length > 0 && <div className="rv-gm-sec"><h4>Detención · se imputa</h4>{L.detenciones.map(filaDetencion)}</div>}
      {L.programadas.length > 0 && <div className="rv-gm-sec"><h4>Programada</h4>{L.programadas.map(filaProgramada)}</div>}
      {L.micros.length > 0 && <div className="rv-gm-sec"><h4>Micro · no se imputa: causa probable, se confirma en terreno</h4>{L.micros.map((p, i) => filaMicro(p, i))}</div>}
      {sinParadas && <div className="rv-gm-sec"><h4>Sin paradas en este minuto</h4></div>}
    </>
  )

  /* Lo que Shoplogix no anota de cada micro (~20 s, estimado del estudio de las micro: de 17 a 23 s) se cuenta como andando, y no se sabe si
     cayó en este minuto o en uno anterior: se dice así, sin afirmar nada del ritmo. */
  /* Shoplogix anota la micro con 15 a 30 s de atraso (`ATRASO_ANOTA`): el tiempo oculto va ANTES del inicio anotado. Una micro que empezó en un
     minuto anterior no esconde tiempo en este; solo las que empiezan en este minuto pueden haberlo escondido aquí o en uno anterior. */
  const ocultaAqui = L.micros.some((p) => p.inicioMs >= L.iniMs)
  /* El ritmo andando es piezas del minuto ÷ segundos andando: sale de una división, no de una medida por segundo. Si pasa de 100 % de su velocidad, parte
     de las piezas pudo caer de otro minuto (o en los segundos ocultos de una micro): se dice. Caso real: Chonchi 10:03, Ev 3 a 141 %. */
  const sobreSuVelocidad = L.filas.filter((f) => f.estado === 'ritmo' && f.pct != null && f.pct > 100).map((f) => f.nombre)
  const hayRitmo = L.filas.some((f) => f.estado === 'ritmo')
  const hayMicroAbrible = !compacto && !!onMicroHover && L.micros.some((p) => p.microId)
  const notas = (
    <>
      {L.mismoSegundo && <p className="rv-gm-nota">{L.mismoSegundo}.</p>}
      {hayRitmo && (
        <p className="rv-gm-nota">
          Ritmo andando, calculado: piezas del minuto ÷ segundos andando.
          {sobreSuVelocidad.length > 0 && ` ${lista(sobreSuVelocidad)} ${sobreSuVelocidad.length === 1 ? 'pasa' : 'pasan'} de su velocidad: parte de las piezas pudo caer de otro minuto.`}
        </p>
      )}
      {ocultaAqui && (compacto
        ? <p className="rv-gm-nota">Cada micro esconde unos {OCULTO_S} s (estimado, de 17 a 23 s) que cuentan como andando; pueden caer en este minuto o en uno anterior.</p>
        : <p className="rv-gm-nota">Cada micro esconde unos {OCULTO_S} s más que Shoplogix no anota (estimado, de 17 a 23 s) y cuenta como andando: pudieron caer en este minuto o en uno anterior.</p>)}
      {hayMicroAbrible && (
        <p className="rv-gm-nota">{fijo ? 'Globo fijo: pasa el mouse por una micro para ver su causa probable. Otro clic en el gráfico lo suelta.' : 'Haz clic en el gráfico para dejar este globo fijo y abrir la causa probable de cada micro.'}</p>
      )}
    </>
  )

  const cabecera = (
    <div className="rv-gm-cab tabular-nums" style={compacto ? { justifyContent: 'flex-start', gap: 8 } : undefined}>
      <b>{L.hora}</b>
      <span>{compacto ? L.rango : `minuto ${L.rango}`}</span>
    </div>
  )
  const hechas = resumen && resumen.acum != null && (
    <div className="rv-gm-hechas tabular-nums">
      {resumen.futuro ? 'Proyección' : 'Hechas'} <b className="font-semibold text-foreground">{int(resumen.acum)} pz</b>
      {resumen.tocaban != null && <> · meta a {resumen.ahora ? 'esta' : 'esa'} hora {int(resumen.tocaban)}{resumen.dif != null && <span style={{ color: resumen.dif < 0 ? 'var(--v2-mal-texto)' : 'rgb(var(--brand-ink))' }}> ({adelanteAtras(resumen.dif)})</span>}</>}
    </div>
  )
  const avisoParcial = parcial ? <div className="rv-gm-hechas font-semibold" style={{ color: 'var(--v2-atento-texto)' }}>{parcial}</div> : null

  if (compacto) {
    return (
      <div ref={refGlobo} className="v2-tip rv-gm compacto absolute inset-x-[10px] top-[10px] z-[2]" role="group" aria-label="Lectura del minuto por dentro" style={style}>
        <span className="absolute right-[8px] top-[8px]">
          <button type="button" onClick={onCerrar} aria-label="Cerrar la lectura del minuto" className="tap-44 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2" style={{ outlineColor: 'var(--v2-bien)' }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </span>
        {cabecera}
        {linea}
        {perd}
        {avisoParcial}
        {tabla}
        {secciones}
        {notas}
      </div>
    )
  }
  return (
    <div ref={refGlobo} data-globo-minuto="" data-tam={tam} data-fijo={fijo ? 'true' : undefined} className="v2-tip rv-gm absolute z-10" role="tooltip" aria-label="El minuto por dentro" style={style} onPointerLeave={onPointerLeave}>
      {cabecera}
      {linea}
      {hechas}
      {avisoParcial}
      {perd}
      {tabla}
      {secciones}
      {notas}
    </div>
  )
}
