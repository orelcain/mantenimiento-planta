/**
 * «Dónde se fueron las piezas» del tablero v2 («Más del turno»): la cascada a la meta de Shoplogix con la perilla y su «Ver detalle»
 * (causa, Baader y hora). Textos y layout del prototipo aprobado (`__banco_perilla__/mainTablero.tsx`, opción A: pestañas).
 * Las cifras salen de `cascadaPerilla.ts` y su detalle de `cascadaMetaDetalle.ts`: aquí solo se dibujan y se elige la vista.
 */
import { useState, type ReactNode } from 'react'
import { ChevronDown, Filter } from 'lucide-react'
import { Tarjeta } from './AmpliarV2'
import { BotonInfo } from './GlobosFranja'
import { Pill } from '@/components/piel/Pill'
import { SegmentedControl, type Segment } from '@/components/piel/SegmentedControl'
import { vaciasEtiqueta, type Contenedor } from './cascadaTurno'
import type { BaaderCascada, CascadaPorMeta, PiezasVista } from './cascadaPerilla'
import { etiquetaVista, type DetalleCascadaMeta, type DetalleVistaMeta, type HoraMeta, type RenglonMeta } from './cascadaMetaDetalle'

/* Colores = dueño, como todo el tablero v2: ámbar Mantención y operación, pizarra aguas arriba, gris claro producción (perilla).
   Solo tokens `--v2-*`: ningún hex nuevo. */
const C = { mant: 'var(--v2-mant)', aguas: 'var(--v2-ext)', prod: 'var(--v2-prog)', base: 'var(--v2-secundaria)', hizo: 'var(--v2-acento)' }

const int = (n: number) => Math.round(Math.abs(n)).toLocaleString('es-CL')
const pts = (x: number) => x.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const horasTxt = (min: number) => {
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  return h ? `${h} h ${m} min` : `${m} min`
}

/** Minutos de una causa o una Baader: una detención de segundos no dice «0 min» si costó piezas. */
const minTxt = (min: number | undefined, pz: number) => (Math.round(min ?? 0) === 0 && pz > 0 ? 'menos de 1 min' : `${Math.round(min ?? 0)} min`)

type Fila = 'det' | 'micro' | 'vac'
type Pestana = 'causa' | 'baader' | 'hora'
type Parte = { n: number; color: string; op?: number }

function Cifra({ valor, unidad }: { valor: string; unidad: string }) {
  return (
    <div className="mt-3 flex items-baseline gap-1.5">
      <span className="v2-cifra-chica tabular-nums font-semibold leading-none tracking-tight text-foreground">{valor}</span>
      <span className="text-[15px] text-muted-foreground">{unidad}</span>
    </div>
  )
}

/** Un tramo de la cascada: desde → hasta, sobre «podía hacer a la meta» (`tope`). */
function Barra({ desde, hasta, tope, partes }: { desde: number; hasta: number; tope: number; partes: Parte[] }) {
  const izq = tope > 0 ? (desde / tope) * 100 : 0
  const ancho = tope > 0 ? Math.max(0.8, ((hasta - desde) / tope) * 100) : 0
  return (
    <div className="relative mt-1.5 h-3 rounded-full bg-muted-foreground/[0.08]">
      <div className="absolute inset-y-0 flex gap-px overflow-hidden rounded-full" style={{ left: `${izq}%`, width: `${ancho}%` }}>
        {partes.filter((p) => p.n > 0).map((p, i) => <i key={i} className="block h-full" style={{ flex: p.n, background: p.color, opacity: p.op ?? 1 }} />)}
      </div>
    </div>
  )
}

interface FilaDetalle {
  clave: string
  nombre: string
  pz: number
  sub: string
  partes: Parte[]
}

/** Renglones del detalle: nombre, barra (partida por dueño si trae partes) y «−pz», con su línea de dueño y porcentaje. */
function Renglones({ filas, total }: { filas: FilaDetalle[]; total: number }) {
  const max = Math.max(1, ...filas.map((f) => f.pz))
  return (
    <ul className="mt-3 space-y-2.5">
      {filas.map((f) => (
        <li key={f.clave} className="min-w-0">
          <div className="grid grid-cols-[minmax(0,7.5rem)_1fr_auto] sm:grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-2 text-[13px]">
            <span className="line-clamp-2 break-words text-foreground first-letter:uppercase">{f.nombre}</span>
            <div className="flex h-2 overflow-hidden rounded-full" style={{ width: `${Math.max(3, (f.pz / max) * 100)}%` }}>
              {f.partes.filter((p) => p.n > 0).map((p, i) => <i key={i} className="block h-full" style={{ flex: p.n, background: p.color, opacity: p.op ?? 1 }} />)}
            </div>
            <span className="tabular-nums text-foreground">−{int(f.pz)} pz</span>
          </div>
          <div className="mt-0.5 text-[12px] tabular-nums text-muted-foreground sm:pl-[11.5rem]">{f.sub} · {total > 0 ? Math.round((f.pz / total) * 100) : 0} %</div>
        </li>
      ))}
    </ul>
  )
}

/** Columnas por hora (la altura, sobre la hora más cargada). Si la hora trae partes por dueño, la columna va partida. */
function Horas({ horas, color }: { horas: HoraMeta[]; color: string }) {
  const max = Math.max(1, ...horas.map((h) => h.piezas))
  const peor = horas.reduce((a, h) => (h.piezas > a.piezas ? h : a), horas[0]!)
  const parciales = horas.filter((h) => h.parcialMin)
  return (
    <>
      <div className="mt-3 grid h-24 items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${horas.length}, minmax(0, 1fr))` }}>
        {horas.map((h) => {
          const partes: Parte[] = h.partes
            ? [{ n: h.partes.mantOp ?? 0, color: C.mant }, { n: h.partes.aguas ?? 0, color: C.aguas }]
            : [{ n: 1, color }]
          return (
            <div key={h.hora} className="flex h-full min-w-0 flex-col items-stretch justify-end gap-1">
              <span className="text-center text-[12px] tabular-nums text-foreground">{h.piezas ? `−${int(h.piezas)}` : '0'}</span>
              <div className="flex flex-col overflow-hidden rounded-t-[6px] rounded-b-[2px]" style={{ height: `${(h.piezas / max) * 56}px`, minHeight: h.piezas ? 3 : 0 }}>
                {partes.filter((p) => p.n > 0).map((p, i) => <i key={i} className="block w-full" style={{ flex: p.n, background: p.color }} />)}
              </div>
              <span className="text-center text-[12px] tabular-nums text-muted-foreground">{h.hora}{h.parcialMin ? '*' : ''}</span>
            </div>
          )
        })}
      </div>
      {horas.length > 0 && peor.piezas > 0 && (
        <p className="mt-2 text-[12px] tabular-nums text-muted-foreground">
          La hora más cara: {peor.hora} h, −{int(peor.piezas)} pz.
          {parciales.length > 0 && ` * ${parciales.length > 1 ? 'Horas incompletas' : 'Hora incompleta'}: ${parciales.map((h) => `${h.hora} h (${h.parcialMin} min)`).join(' y ')}.`}
        </p>
      )}
    </>
  )
}

/** La nota de vacíos: con una sola Baader, la máquina; con silletas, la silleta (así lo pide el encargo). */
function notaVacios(unica: boolean, contenedor: Contenedor): string {
  const pasa = contenedor === 'carro' ? 'el carro pasó' : 'la silleta pasó'
  if (unica) return `La máquina andaba y ${contenedor === 'carro' ? 'el carro pasó vacío' : 'la silleta pasó vacía'}: lo que faltó para llegar a la perilla. No es tiempo detenido.`
  return `La Baader andaba y ${pasa} sin pieza: lo que faltó para llegar a la perilla. No es tiempo detenido.`
}

/** El detalle de una fila: pestañas (Causa si es detenciones; Baader si hay más de una que cuenta; Hora) y su cuerpo. */
function DetalleFila({ fila, d, v, unica, contenedor }: { fila: Fila; d: DetalleVistaMeta; v: PiezasVista; unica: boolean; contenedor: Contenedor }) {
  const baaders = fila === 'det' ? d.detenciones.baader : fila === 'micro' ? d.micro.baader : d.vacios.baader
  const horas = fila === 'det' ? d.detenciones.hora : fila === 'micro' ? d.micro.hora : d.vacios.hora
  const pestanas = [
    ...(fila === 'det' ? [['causa', 'Causa'] as const] : []),
    ...(baaders ? [['baader', 'Baader'] as const] : []),
    ['hora', 'Hora'] as const,
  ]
  const [vista, setVista] = useState<Pestana>(pestanas[0]![0])
  const total = fila === 'det' ? v.detenciones.piezas : fila === 'micro' ? v.micro.piezas : v.vacios
  const color = fila === 'vac' ? C.aguas : C.mant

  const causa = (
    <Renglones
      total={total}
      filas={d.detenciones.causa.map((c: RenglonMeta) => ({
        clave: c.clave,
        nombre: c.nombre,
        pz: c.piezas,
        sub: `${c.dueno === 'aguas' ? 'Aguas arriba' : 'Mantención y operación'} · ${minTxt(c.min, c.piezas)}`,
        partes: [{ n: c.piezas, color: c.dueno === 'aguas' ? C.aguas : C.mant }],
      }))}
    />
  )
  const porBaader = (
    <Renglones
      total={total}
      filas={(baaders ?? []).map((b: RenglonMeta) => {
        if (fila === 'vac') return { clave: b.clave, nombre: b.nombre, pz: b.piezas, sub: b.vara != null ? `perilla ${b.vara} pz/min` : 'sin perilla', partes: [{ n: 1, color: C.aguas, op: 0.5 }] }
        if (fila === 'micro') return { clave: b.clave, nombre: b.nombre, pz: b.piezas, sub: `${minTxt(b.min, b.piezas)} · ${b.veces ?? 0} veces`, partes: [{ n: 1, color: C.mant, op: 0.55 }] }
        return {
          clave: b.clave,
          nombre: b.nombre,
          pz: b.piezas,
          sub: `${minTxt(b.min, b.piezas)} · ${b.veces ?? 0} veces`,
          partes: [{ n: b.partes?.mantOp ?? 0, color: C.mant }, { n: b.partes?.aguas ?? 0, color: C.aguas }],
        }
      })}
    />
  )
  const cuerpo = (p: Pestana) => (p === 'causa' ? causa : p === 'baader' ? porBaader : <Horas horas={horas} color={color} />)

  const nota = fila === 'micro'
    ? `Shoplogix las anota como «Microdetención», sin causa: se sabe ${unica ? 'la máquina' : 'la Baader'}, la hora y cuánto duran.`
    : fila === 'vac' ? notaVacios(unica, contenedor) : `Cada vista reparte las ${int(total)} piezas de la fila: suman lo mismo.`

  return (
    <div className="mt-3" onClick={(e) => e.stopPropagation()}>
      {pestanas.length > 1 && (
        <div className="grid gap-0.5 rounded-[10px] bg-muted-foreground/[0.12] p-0.5" style={{ gridTemplateColumns: `repeat(${pestanas.length}, minmax(0,1fr))` }} role="tablist">
          {pestanas.map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={vista === id}
              onClick={() => setVista(id)}
              className={`tap-44 rounded-[10px] py-1.5 text-[13px] ${vista === id ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      )}
      {cuerpo(vista)}
      <p className="mt-3 text-[12px] leading-snug text-muted-foreground">{nota}</p>
    </div>
  )
}

/** La perilla de una Baader: «17 en vez de 18 · por el Knuro», «igual a su meta» o «sin perilla anotada». */
function perillaDe(b: BaaderCascada): string {
  if (!b.conPerilla) return 'sin perilla anotada'
  if (b.vara != null && b.vara !== b.meta) return `${b.vara} en vez de ${b.meta}${b.motivo ? ` · ${b.motivo}` : ''}`
  return 'igual a su meta'
}

export function CascadaMetaV2({ cascada, detalle, contenedor }: { cascada: CascadaPorMeta; detalle: DetalleCascadaMeta; contenedor: Contenedor }) {
  const [k, setK] = useState<string>('linea')
  const [abierta, setAbierta] = useState<Fila | null>(null)
  const [info, setInfo] = useState(false)

  /* Con una sola Baader no hay línea que elegir: el selector no sale y la vista es la de la máquina. */
  const unica = cascada.baaders.length === 1
  const sel: BaaderCascada | null = unica ? (cascada.baaders[0] ?? null) : (cascada.baaders.find((b) => b.id === k) ?? null)
  const esLinea = sel == null
  const v: PiezasVista = sel ?? cascada.linea
  const d: DetalleVistaMeta = sel ? detalle.porBaader[sel.id]! : detalle.linea
  /* La línea cuenta solo las Baader con meta usable. Una sin meta no entra: se nombra en un aviso, no en los escalones. */
  const cuentan = cascada.baaders.filter((b) => !b.sinMeta)
  const sinMeta = cascada.baaders.filter((b) => b.sinMeta)
  const avisoSinMeta = (nombre: string) => `${etiquetaVista(nombre)} sin meta de Shoplogix en este turno: no entra en la cuenta`
  const segmentos: Segment<string>[] = [
    { value: 'linea', label: 'Línea' },
    ...cascada.baaders.map((b) => ({ value: b.id, label: etiquetaVista(b.nombre) })),
  ]

  const vacias = vaciasEtiqueta(contenedor).toLowerCase()
  const metas = sel ? `${sel.meta}` : cuentan.map((b) => b.meta).join(' + ')
  const perillaTxt = sel
    ? perillaDe(sel)
    : cuentan.filter((b) => b.perilla > 0).map((b) => `${etiquetaVista(b.nombre)}: ${b.vara ?? b.meta} en vez de ${b.meta}${b.motivo ? ` (${b.motivo})` : ''}`).join(' · ') || 'ninguna más lenta que su meta'

  const det = v.detenciones
  const detMant = det.piezas - det.aguas
  const microMant = v.micro.piezas - v.micro.aguas
  const partesTxt = (mant: number, aguas: number) => [mant > 0 ? `${int(mant)} Mantención y operación` : null, aguas > 0 ? `${int(aguas)} aguas arriba` : null].filter(Boolean).join(', ')
  const sumaDe = esLinea && cuentan.length > 1 ? `, suma de las ${cuentan.length} Baader` : ''
  const filas: Array<{ clave: string; et: string; pz: number; resta: boolean; info?: string; partes: Parte[]; abre?: Fila; sub?: boolean }> = [
    { clave: 'podia', et: 'Podía hacer a la meta', pz: v.podia, resta: false, info: `meta ${metas} pz/min · ${horasTxt(v.minProduccion)} de producción`, partes: [{ n: 1, color: C.base }] },
    { clave: 'perilla', et: 'Perilla más lenta que la meta', pz: v.perilla, resta: true, info: `${perillaTxt} · producción`, partes: [{ n: 1, color: C.prod }] },
    { clave: 'con', et: 'Podía hacer con la perilla', pz: v.podiaConPerilla, resta: false, partes: [{ n: 1, color: C.base }], sub: true },
    {
      clave: 'det',
      et: 'Detenciones',
      pz: det.piezas,
      resta: true,
      info: [`${minTxt(det.min, det.piezas)}${sumaDe}`, `${det.veces} veces`, partesTxt(detMant, det.aguas)].filter(Boolean).join(' · '),
      abre: 'det',
      partes: [{ n: detMant, color: C.mant }, { n: det.aguas, color: C.aguas }],
    },
    {
      clave: 'micro',
      et: 'Microdetenciones',
      pz: v.micro.piezas,
      resta: true,
      info: `${minTxt(v.micro.min, v.micro.piezas)} · ${v.micro.veces} veces · ${v.micro.aguas > 0 ? partesTxt(microMant, v.micro.aguas) : 'Mantención y operación'}`,
      abre: 'micro',
      partes: [{ n: 1, color: C.mant, op: 0.55 }],
    },
    { clave: 'vac', et: vaciasEtiqueta(contenedor), pz: v.vacios, resta: true, info: 'andando, sin pieza · aguas arriba', abre: 'vac', partes: [{ n: 1, color: C.aguas, op: 0.5 }] },
    { clave: 'hizo', et: 'Hizo', pz: v.hizo, resta: false, partes: [{ n: 1, color: C.hizo }] },
  ]
  /* Cada tramo se resta de lo que quedaba de «podía hacer a la meta»; «podía con la perilla» vuelve a ser la base. */
  let resto = v.podia
  const tramos = filas.map((f) => {
    if (!f.resta) {
      if (f.clave === 'con') resto = f.pz
      return { f, desde: 0, hasta: f.pz }
    }
    const hasta = resto
    resto -= f.pz
    return { f, desde: resto, hasta }
  })

  const quien = [
    { k: 'Mantención y operación', n: v.duenos.mantOp, color: C.mant },
    { k: 'Aguas arriba', n: v.duenos.aguas, color: C.aguas },
    { k: 'Producción (perilla)', n: v.duenos.produccion, color: C.prod },
  ].filter((x) => x.n > 0)
  const pct = v.podia > 0 ? Math.round((v.hizo / v.podia) * 100) : 0
  const r = v.rendimiento
  const verRendimiento = r.expMeta > 0 && r.ptsFalta > 0

  const sinMetaSel = sel?.sinMeta === true
  const sub = sinMetaSel ? 'a la meta de Shoplogix' : `a la meta de Shoplogix · ${horasTxt(v.minProduccion)} de producción`

  return (
    <Tarjeta icono={<Filter className="h-[18px] w-[18px]" />} titulo="Dónde se fueron las piezas" sub={sub}>
      {!sinMetaSel && (
        <>
          <Cifra valor={int(v.perdido)} unidad="pz bajo la meta" />
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Pill tone="info" className="tabular-nums">hizo {int(v.hizo)} de {int(v.podia)}</Pill>
            <span className="text-[13px] tabular-nums text-muted-foreground">{pct} de cada 100 piezas de la meta</span>
          </div>
        </>
      )}

      {!unica && (
        <div className="mt-4" onClick={(e) => e.stopPropagation()}>
          <SegmentedControl value={k} onChange={(x) => { setK(x); setAbierta(null) }} ariaLabel="Ver por Baader" segments={segmentos} />
        </div>
      )}

      {sinMetaSel ? (
        <p className="mt-3 text-[13px] text-foreground/80">{avisoSinMeta(sel!.nombre)}</p>
      ) : (
        <>
          {v.perdido > 0 && (
            <div className="v2-subtarjeta mt-4 rounded-[14px] p-3">
              <div className="text-[13px] tabular-nums text-muted-foreground">Quién responde de las {int(v.perdido)}</div>
              <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">{quien.map((x) => <i key={x.k} className="block h-full" style={{ flex: x.n, background: x.color }} />)}</div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums text-foreground">
                {quien.map((x) => <span key={x.k} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.color }} />{x.k} {int(x.n)}</span>)}
              </div>
            </div>
          )}

          <ul className="mt-4 space-y-1">
            {tramos.map(({ f, desde, hasta }) => {
              const ab = f.abre != null && abierta === f.abre
              const cabeza: ReactNode = (
                <>
                  <div className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
                      {f.abre && <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${ab ? '' : '-rotate-90'}`} aria-hidden />}
                      <span className={`truncate ${f.resta ? '' : 'font-medium'}`}>{f.et}</span>
                    </span>
                    <span className={`shrink-0 tabular-nums ${f.resta ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{f.resta && f.pz > 0 ? `−${int(f.pz)}` : int(f.pz)} pz</span>
                  </div>
                  <Barra desde={desde} hasta={hasta} tope={v.podia} partes={f.partes} />
                  {f.info && !ab && <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">{f.info}</div>}
                </>
              )
              return (
                <li key={f.clave} className={`-mx-2.5 rounded-[14px] px-2.5 py-2 ${ab ? 'v2-subtarjeta' : ''}`}>
                  {f.abre ? (
                    <button
                      type="button"
                      className="block w-full text-left"
                      aria-expanded={ab}
                      onClick={(e) => { e.stopPropagation(); setAbierta((a) => (a === f.abre ? null : f.abre!)) }}
                    >
                      {cabeza}
                    </button>
                  ) : cabeza}
                  {ab && <DetalleFila key={`${k}-${f.abre}`} fila={f.abre!} d={d} v={v} unica={unica} contenedor={contenedor} />}
                </li>
              )
            })}
          </ul>
          {!abierta && <p className="mt-2 text-[12px] text-muted-foreground">{unica ? 'Toca una pérdida para ver causa y hora.' : 'Toca una pérdida para ver causa, Baader y hora.'}</p>}

          <p className="mt-3 text-[13px] tabular-nums text-muted-foreground">
            Cuadre: {int(v.podia)} − {int(v.perilla)} − {int(det.piezas)} − {int(v.micro.piezas)} − {int(v.vacios)} = <b className="font-semibold text-foreground">{int(v.hizo)}</b>
          </p>

          {verRendimiento && (
            <>
              <p className="mt-1 text-[13px] tabular-nums text-muted-foreground">
                Al rendimiento le faltan <b className="font-semibold text-foreground">{pts(r.ptsFalta)} pts</b>
                {r.ptsPerilla < 0.05
                  ? `, por ${vacias}`
                  : <>: {pts(r.ptsPerilla)} de la perilla y {pts(r.ptsFaltoPerilla)} de {vacias}</>}{' '}
                <BotonInfo etiqueta="Cómo se calcula" abierto={info} alCambiar={setInfo} />
              </p>
              {info && (
                <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
                  El rendimiento cuenta solo los minutos andando. Las detenciones y las micro le restan a la disponibilidad; por eso lo que faltó para llegar a la perilla son los {vacias}.
                </p>
              )}
            </>
          )}

          {esLinea && sinMeta.map((b) => (
            <p key={b.id} className="mt-2 text-[12px] text-muted-foreground">{avisoSinMeta(b.nombre)}</p>
          ))}
        </>
      )}
    </Tarjeta>
  )
}
