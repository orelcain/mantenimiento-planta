/**
 * DesglosePiezas — «Ver desglose» de la franja «El turno completo» (A2-2a): de qué estuvo hecho el turno de una Baader (o de la línea)
 * contra su vara. Una fila por entero de piezas (de «vara + 1 o más» a 0), agrupadas en las zonas a ritmo, bajo, marcha parcial y
 * detenida; cada barra partida en «sin detención» (color de la zona) y «con detención registrada» (gris).
 *
 * Solo pinta: los minutos, las zonas y los % salen de `desgloseDe` (desglose.ts). Aquí se reparte tiempo en min o en h, se nombran
 * las causas (taxonomía de Shoplogix, `matchImputacion`) y se agrupan por tipo (`ParadaDetalle.tipo`). Nunca dice «fallas».
 *
 * La línea sale con sus zonas y su barra (la suma de sus Baaders); el detalle de su detención sigue al de la Baader con más segundos
 * detenidos en cada minuto (`detencionLinea`).
 */
import { useState, type ReactNode } from 'react'
import { repartirPorMayorResto, type BloqueZona, type Desglose, type ZonaDesglose } from './desglose'
import { normalizar, type ParadaDetalle, type TipoParada } from './ritmoVivo'
import { alTeclearGlobo, nombreCausa, sufijoRitmo, tiempoTexto, useGlobo, type Unidad } from './desgloseVista'
import type { VaraUmbral } from './perilla'
import { esProgramada, tipoParaDesglose } from './cascadaPerilla'

const CLAVE_UNIDAD = 'monitor.desglose.unidad'
/** Columnas: piezas · barra · tiempo · «% del turno». Desde 640 px la barra es de 300 px (PC). */
const PLANTILLA = 'grid grid-cols-[74px_minmax(0,1fr)_44px_52px] gap-x-2 sm:grid-cols-[116px_300px_48px_60px]'
const COLOR_ZONA: Record<ZonaDesglose, string> = { ritmo: 'var(--v2-bien)', bajo: 'var(--v2-atento)', parcial: 'var(--v2-mal)', detenida: 'var(--v2-mal)' }
const FONDO_ZONA: Partial<Record<ZonaDesglose, string>> = {
  ritmo: 'color-mix(in srgb, var(--v2-bien) 9%, transparent)',
  parcial: 'color-mix(in srgb, var(--v2-mal) 8%, transparent)',
  detenida: 'rgb(142 142 147 / 0.14)',
}
const GRIS_DETENIDO = 'var(--v2-causa-sin)'
const ORDEN_TIPO: TipoParada[] = ['programada', 'micro', 'detencion']
const NOMBRE_TIPO: Record<TipoParada, string> = { programada: 'programadas', micro: 'micro', detencion: 'otras detenciones' }
function etiquetaZona(zona: ZonaDesglose, d: Desglose, vara: VaraUmbral, linea: boolean): string {
  if (zona === 'ritmo') return `a ritmo · ${d.umbral} o más ${sufijoRitmo(vara, linea)}`
  if (zona === 'bajo') return `bajo · ${d.bajo} a ${d.umbral - 1}`
  if (zona === 'parcial') return `marcha parcial · ${d.bajo - 1} o menos`
  return 'detenida · 0 piezas'
}

/** Rango de una zona en la línea (su globo): «37 o más», «25 a 36», «1 a 24», «0». */
function rangoZona(zona: ZonaDesglose, d: Desglose): string {
  if (zona === 'ritmo') return `${d.umbral} o más`
  if (zona === 'bajo') return `${d.bajo} a ${d.umbral - 1}`
  if (zona === 'parcial') return d.bajo - 1 > 1 ? `1 a ${d.bajo - 1}` : `${d.bajo - 1}`
  return '0'
}

/** Una fila (un entero, o una zona en la línea) ya sumada, con su zona. */
interface Fila {
  clave: string
  /** Piezas del entero; null en la fila de la línea (que es la zona entera). */
  v: number | null
  mas: boolean
  zona: ZonaDesglose
  sin: number
  con: number
  n: number
  pct: number
  razones: Record<string, number>
}

interface Causa { razon: string; nombre: string; n: number; tipo: TipoParada }

function filasDe(z: BloqueZona, linea: boolean): Fila[] {
  if (!linea) {
    return z.filas.map((f) => ({ clave: `v:${f.v}`, v: f.v, mas: f.mas, zona: f.zona, sin: f.sin, con: f.con, n: f.n, pct: f.pct, razones: f.razones }))
  }
  /* La línea no tiene filas propias: su zona es la suma de las filas de la zona (las mismas del desglose, sin recalcular). */
  const razones: Record<string, number> = {}
  let sin = 0
  let con = 0
  for (const f of z.filas) {
    sin += f.sin
    con += f.con
    for (const [r, c] of Object.entries(f.razones)) razones[r] = (razones[r] ?? 0) + c
  }
  return [{ clave: `z:${z.zona}`, v: null, mas: false, zona: z.zona, sin, con, n: z.n, pct: z.pct, razones }]
}

/* ── Piezas de la fila ── */

function Barra({ f, max, color, alto = 'h-3.5' }: { f: Fila; max: number; color: string; alto?: string }) {
  return (
    <span className={`flex w-full min-w-0 items-stretch ${alto}`} style={{ gap: 2 }}>
      {f.sin > 0 && <span className="block h-full rounded-r-[4px]" style={{ width: `${(f.sin / max) * 100}%`, minWidth: 2, background: color }} />}
      {f.con > 0 && <span className="block h-full rounded-r-[4px]" style={{ width: `${(f.con / max) * 100}%`, minWidth: 2, background: GRIS_DETENIDO }} />}
    </span>
  )
}

/** Una fila de la tabla: se abre con un toque o con el puntero encima (PC). El globo lo pinta quien la contiene. */
function FilaTabla({ clave, abierto, alCambiar, lab, barra, tiempo, pct }: {
  clave: string
  abierto: boolean
  alCambiar: (v: boolean) => void
  lab: ReactNode
  barra: ReactNode
  /** Sin tiempo ni % (la línea): su cabecera de zona ya los muestra. */
  tiempo?: string
  pct?: number
}) {
  const interaccion = useGlobo(abierto, alCambiar)
  return (
    <div
      role="button"
      tabIndex={0}
      data-fila={clave}
      {...interaccion}
      onKeyDown={(e) => alTeclearGlobo(e, abierto, alCambiar)}
      className={`tap-44 relative ${PLANTILLA} min-h-[24px] items-center py-0.5 text-[13px] leading-[18px] tabular-nums`}
    >
      {lab}
      {barra}
      {tiempo != null && <span className="text-right text-foreground">{tiempo}</span>}
      {pct != null && <span className="text-right text-muted-foreground">{pct} %</span>}
    </div>
  )
}

/** El globo de una fila: el total, lo que no tuvo detención y las causas con más minutos (tres, y «otras» con el resto). */
function GloboFila({ titulo, f, causas }: { titulo: string; f: Fila; causas: Causa[] }) {
  const top = [...causas].sort((a, b) => b.n - a.n)
  const tres = top.slice(0, 3).map((c) => `${c.nombre} ${c.n}`)
  const otras = top.slice(3).reduce((a, c) => a + c.n, 0)
  const topTexto = tres.join(', ') + (otras ? `, otras ${otras}` : '')
  return (
    <div className="v2-tip mx-2 my-1.5 rounded-card px-3 py-2 text-[13px] leading-snug text-muted-foreground tabular-nums">
      <b className="font-semibold text-foreground">{`${titulo} · ${f.n} min`}</b>
      {f.sin > 0 && ` · ${f.sin} sin detención`}
      {f.con > 0 && ` · ${f.con === f.n ? 'todos' : f.con} con detención registrada: ${topTexto}`}
    </div>
  )
}

/* ── El componente ── */

export interface DesglosePiezasProps {
  /** El nombre de la Baader, o «línea». */
  nombre: string
  linea: boolean
  /** Minutos del turno (los mismos que el frente). */
  n: number
  desglose: Desglose
  /** La vara vigente al final del turno (la del último minuto, la que usa el desglose). */
  vara: VaraUmbral
  /** Detenciones de la Baader (de la línea, las de todas sus Baaders): de ahí salen los nombres y los tipos. */
  paradas: ParadaDetalle[]
  /** La vara cambió durante el turno: el desglose usa la vigente. */
  cambio: boolean
  onCerrar: () => void
}

function leerUnidad(): Unidad {
  try {
    return globalThis.localStorage?.getItem(CLAVE_UNIDAD) === 'h' ? 'h' : 'min'
  } catch {
    return 'min'
  }
}

export function DesglosePiezas({ nombre, linea, n, desglose: d, vara, paradas, cambio, onCerrar }: DesglosePiezasProps) {
  const [unidad, setUnidad] = useState<Unidad>(leerUnidad)
  const [detalle, setDetalle] = useState(false)
  const [globo, setGlobo] = useState<string | null>(null)
  const u = unidad
  const elegirUnidad = (x: Unidad) => {
    setUnidad(x)
    try {
      globalThis.localStorage?.setItem(CLAVE_UNIDAD, x)
    } catch {
      /* Sin almacenamiento (modo privado): la unidad vale solo esta vez. */
    }
  }

  const tipoDe = new Map<string, TipoParada>()
  for (const p of paradas) if (p.razon != null && !tipoDe.has(p.razon)) tipoDe.set(p.razon, tipoParaDesglose(p))
  const causasDe = (f: Fila): Causa[] => Object.entries(f.razones).map(([razon, c]) => ({
    razon, nombre: nombreCausa(razon), n: c, tipo: tipoDe.get(razon) ?? 'detencion',
  }))

  const zonasVisibles = d.zonas.filter((z) => z.n > 0 || z.zona === 'detenida')
  const todas = d.zonas.flatMap((z) => filasDe(z, linea))
  const max = Math.max(1, ...todas.map((f) => f.n))
  const nRitmo = d.zonas[0]?.n ?? 0
  /* Todas las programadas (colación, reunión, ejercicio…), no solo la colación: su tiempo no es de nadie y se descuenta del turno.
     Mismo conjunto que la cascada (`esProgramada`): la limpieza de ducto NO es programada aunque el legado la marque así. */
  const nProg = linea ? 0 : todas.reduce((a, f) => a + Object.entries(f.razones).reduce((s, [r, c]) => s + (esProgramada(r) ? c : 0), 0), 0)
  const pctTotal = d.zonas.reduce((a, z) => a + z.pct, 0)
  const bajoSin = d.bajoSinDetencion
  const marcha = d.marchaInicial

  const varaTexto = linea
    ? `vara ${vara.cpm} pz/min`
    : vara.fuente === 'perilla'
      ? `perilla ${vara.cpm} pz/min`
      : `sin perilla · meta Shoplogix ${vara.cpm} pz/min`
  const subtitulo = `${u === 'h' ? `${tiempoTexto(n, 'h')} del turno` : `${n} minutos del turno`} · ${varaTexto}`

  /* La causa de la detención en la fila (o en la zona de la línea): nombres y su tipo. Lo muestra «Ver detalle». */
  const detalleDetenida = (f: Fila): ReactNode => {
    const causas = causasDe(f)
    if (!causas.length) return null
    const tot = (t: TipoParada) => causas.filter((c) => c.tipo === t).reduce((a, c) => a + c.n, 0)
    const col = causas.filter((c) => normalizar(c.razon) === 'colacion').reduce((a, c) => a + c.n, 0)
    const todasPartes: Array<[number, string]> = [
      [col, 'colación'],
      [tot('programada') - col, 'otras programadas'],
      [tot('micro'), 'micro'],
      [tot('detencion'), 'otras detenciones'],
    ]
    const partes = todasPartes.filter(([x]) => x > 0)
    const resumen = partes.map(([x, t], i) => `${t} ${tiempoTexto(x, u)}${i === 0 && u !== 'h' ? ' min' : ''}`).join(' · ')
    const lista = ORDEN_TIPO.flatMap((t) => causas.filter((c) => c.tipo === t).sort((a, b) => b.n - a.n))
    const pcts = repartirPorMayorResto(lista.map((c) => c.n), f.pct)
    return (
      <>
        <div className={`${PLANTILLA} items-center text-[12px] leading-4 text-muted-foreground tabular-nums`}>
          <span className="col-span-full px-2 pb-1 pt-1">
            {resumen}
            <button
              type="button"
              aria-expanded={detalle}
              onClick={() => setDetalle((x) => !x)}
              className="tap-44 ml-1.5 inline-flex h-7 items-center text-[12px] font-semibold text-brand-ink"
            >
              {detalle ? 'Ocultar detalle' : 'Ver detalle'}
              <span aria-hidden="true">{detalle ? ' ▴' : ' ▾'}</span>
            </button>
          </span>
        </div>
        {detalle && (
          <div className="pb-2">
            {ORDEN_TIPO.map((t) => {
              const idx = lista.map((c, i) => (c.tipo === t ? i : -1)).filter((i) => i >= 0)
              if (!idx.length) return null
              return (
                <div key={t}>
                  <p className="px-2 pb-0.5 pt-1.5 text-[12px] font-semibold leading-4 text-muted-foreground">{NOMBRE_TIPO[t]}</p>
                  {idx.map((i) => {
                    const c = lista[i]!
                    return (
                      <div key={c.razon} className={`${PLANTILLA} items-center py-0.5 pl-4 text-[13px] tabular-nums`}>
                        <span className="col-span-2 flex min-w-0 items-center gap-1.5">
                          <span className="line-clamp-2 w-[104px] shrink-0 text-[12px] leading-[15px] text-foreground">{c.nombre}</span>
                          <span className="flex h-2.5 min-w-0 flex-1 items-stretch">
                            <span className="block h-full rounded-r-[4px]" style={{ width: `${(c.n / max) * 100}%`, minWidth: 2, background: GRIS_DETENIDO }} />
                          </span>
                        </span>
                        <span className="text-right text-foreground">{tiempoTexto(c.n, u)}</span>
                        <span className="text-right text-muted-foreground">{pcts[i] ?? 0} %</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }

  return (
    <div role="region" aria-label={`Desglose de la ${nombre}`} className="v2-subtarjeta mb-3 rounded-card px-4 pb-3 pt-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold leading-tight text-foreground">{`Desglose de la ${nombre}`}</p>
        <button type="button" onClick={onCerrar} className="tap-44 inline-flex h-[44px] items-center text-[15px] font-semibold text-brand-ink">
          Cerrar
        </button>
      </div>
      {/* El selector min | h va en la línea del subtítulo: en la cabecera de columnas pisaba «piezas por minuto» en celulares angostos. */}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 text-[13px] leading-snug tabular-nums text-muted-foreground">{subtitulo}</p>
        <span role="group" aria-label="Unidad del tiempo" className="ml-auto inline-grid grid-flow-col gap-0.5 rounded-full p-0.5" style={{ background: 'rgb(142 142 147 / 0.14)' }}>
          {(['min', 'h'] as const).map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={u === x}
              onClick={() => elegirUnidad(x)}
              className={`tap-44 h-[24px] min-w-[34px] rounded-full px-2 text-[12px] font-semibold leading-4 ${u === x ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {x}
            </button>
          ))}
        </span>
      </div>
      {cambio && (
        <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
          {`La perilla cambió durante el turno: el desglose usa la vigente (${vara.cpm}).`}
        </p>
      )}

      {/* Cabecera de columnas: piezas · unidad · % del turno. El selector min | h cambia las cifras de tiempo, no los %. */}
      <div className={`${PLANTILLA} mt-2.5 items-end pb-1`}>
        <span className="pl-2 pb-1.5 text-[12px] leading-[15px] text-muted-foreground">piezas por minuto</span>
        <span />
        <span className="pb-1.5 text-right text-[12px] leading-[15px] text-muted-foreground">{u === 'h' ? 'horas' : 'min'}</span>
        <span className="pb-1.5 text-right text-[12px] leading-[15px] text-muted-foreground">% del <br />turno</span>
      </div>

      {zonasVisibles.map((z) => {
        const filas = filasDe(z, linea)
        const sinCaption = z.zona === 'detenida' && !linea
        const umbralRaya = z.zona === 'ritmo'
        return (
          <div key={z.zona} data-zona={z.zona}>
            <div className="mt-1.5 rounded-card" style={{ background: FONDO_ZONA[z.zona] }}>
              {!sinCaption && (
                <div className={`${PLANTILLA} items-center`}>
                  <span className={`${linea ? 'col-span-2' : 'col-span-full'} flex h-6 items-center gap-1.5 px-2 text-[12px] font-semibold leading-[15px] text-muted-foreground`}>
                    <span className="block h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR_ZONA[z.zona] }} />
                    {etiquetaZona(z.zona, d, vara, linea)}
                  </span>
                  {linea && (
                    <>
                      <span className="text-right text-[13px] font-semibold tabular-nums text-foreground">{tiempoTexto(z.n, u)}</span>
                      <span className="text-right text-[13px] font-semibold tabular-nums text-foreground">{z.pct} %</span>
                    </>
                  )}
                </div>
              )}
              {filas.map((f) => {
                const clave = f.clave
                const abierto = globo === clave
                const alCambiar = (v: boolean) => setGlobo(v ? clave : null)
                const color = COLOR_ZONA[f.zona]
                const titulo = linea ? rangoZona(f.zona, d) : `${f.v} por minuto`
                const esLaVara = !linea && f.v != null && vara.cpm != null && f.v === Math.round(vara.cpm)
                const lab = linea ? null : (
                  <span className="flex items-baseline gap-1 whitespace-nowrap pl-2">
                    <b className="font-semibold text-foreground">{f.zona === 'detenida' ? '0' : f.v}</b>
                    {f.mas && <span className="text-[12px] text-muted-foreground">o más</span>}
                    {f.zona === 'detenida' && <span className="text-[12px] text-muted-foreground">detenida</span>}
                    {esLaVara && <span className="text-[12px] text-muted-foreground">{vara.fuente === 'perilla' ? 'perilla' : 'meta'}</span>}
                  </span>
                )
                const barra = (
                  <span className={linea ? 'col-span-2 px-2' : 'min-w-0'}>
                    <Barra f={f} max={max} color={color} />
                  </span>
                )
                /* En la línea, la fila es la barra bajo la cabecera de la zona: el tiempo y el % ya están en esa cabecera. */
                return (
                  <div key={clave}>
                    <FilaTabla
                      clave={clave}
                      abierto={abierto}
                      alCambiar={alCambiar}
                      lab={lab}
                      barra={barra}
                      tiempo={linea ? undefined : tiempoTexto(f.n, u)}
                      pct={linea ? undefined : f.pct}
                    />
                    {abierto && (
                      <GloboFila titulo={titulo} f={f} causas={causasDe(f)} />
                    )}
                    {f.zona === 'detenida' && detalleDetenida(f)}
                  </div>
                )
              })}
            </div>
            {umbralRaya && <div aria-hidden="true" className="mx-2 mb-2" style={{ borderBottom: '1px solid var(--v2-gris)' }} />}
          </div>
        )
      })}

      <div className={`${PLANTILLA} mt-2 items-center border-t border-border pt-1.5 text-[13px] tabular-nums`}>
        <span className="col-span-2 pl-2 font-semibold text-foreground">Total del turno</span>
        <span className="text-right font-semibold text-foreground">{tiempoTexto(n, u)}</span>
        <span className="text-right font-semibold text-foreground">{pctTotal} %</span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] leading-4 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="block h-2.5 w-3.5 rounded-r-[3px]" style={{ background: 'linear-gradient(to right, var(--v2-bien) 0 33%, var(--v2-atento) 33% 66%, var(--v2-mal) 66%)' }} />
          sin detención
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="block h-2.5 w-3.5 rounded-r-[3px]" style={{ background: GRIS_DETENIDO }} />
          con detención registrada
        </span>
      </div>

      {linea
        ? <p className="mt-2.5 text-[13px] leading-[18px] text-muted-foreground">Un minuto de la línea cuenta con detención si alguna de sus Baader tuvo una.</p>
        : (
          <>
            {nProg > 0 && n - nProg > 0 && (
              <p className="mt-2.5 text-[13px] leading-[18px] tabular-nums text-muted-foreground">
                {'Sin la detención programada: a ritmo '}
                <b className="font-semibold text-foreground">{`${tiempoTexto(nRitmo, u)} de ${tiempoTexto(n - nProg, u)}${u === 'h' ? '' : ' min'}`}</b>
                {` (${Math.round((nRitmo / (n - nProg)) * 100)} %).`}
              </p>
            )}
            <p className="mt-2.5 text-[13px] leading-[18px] tabular-nums text-muted-foreground">
              {`Bajo ${d.umbral} sin detención: `}
              <b className="font-semibold text-foreground">{`${marcha} min de marcha inicial`}</b>
              {' y '}
              <b className="font-semibold text-foreground">{`${bajoSin - marcha} de falta de pescado`}</b>
              {'.'}
            </p>
          </>
        )}
    </div>
  )
}
