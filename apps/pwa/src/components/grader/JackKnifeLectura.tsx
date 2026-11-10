/**
 * JackKnifeLectura — Jack-Knife en la piel Apple (modo lectura).
 *
 * Filete y alineación, sin tarjetas: controles en una fila como texto subrayado,
 * la línea de identidad, el titular que dice qué pasó, el gráfico con «Atacar
 * ahora» a la derecha (PC) y la tabla «Todas las causas». El detalle plegable
 * («Ver detalle») lo arma la tarjeta y se muestra debajo de esto.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useEsPC } from '@/hooks/useEsPC'
import { FilasLectura, LECTURA_CUERPO, LECTURA_ENLACE, LECTURA_NOTA, LECTURA_TITULO, SeccionLectura } from '@/components/piel/Lectura'
import { Sheet } from '@/components/piel'
import { dec, dec1 } from '@/utils/formatoNumeros'
import type { CalculoJK, ModoCmpJK, PuntoJK, TurnoJK, VentanaJK } from '@/services/shoplogix/jackKnife'
import { ACCION_CUADRANTE, SIN_IMPUTAR, agruparComentarios, comentariosDe, nivelPrioridad, sentidoCambio } from '@/services/shoplogix/jackKnife'
import type { ResumenCausaJK } from '@/services/acr/acrHistorial'
import {
  TITULO_CUADRANTE,
  bajadaLectura,
  causasAtacar,
  identidadLectura,
  tablaLectura,
  titularLectura,
  type FilaLecturaJK,
  type TramoLectura,
} from '@/services/shoplogix/jackKnifeLectura'
import { JackKnifeGrafico } from './JackKnifeGrafico'
import { AtacarAhoraLectura } from './JackKnifeListas'

const PERIODOS: { value: VentanaJK | 'libre'; label: string }[] = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: 'todo', label: 'Todo' },
]
const COMPARACIONES: { value: ModoCmpJK; label: string }[] = [
  { value: 'ant', label: 'Período anterior' },
  { value: 'mes', label: 'Mes pasado' },
  { value: 'mano', label: 'Elegir a mano' },
  { value: 'no', label: 'Sin comparar' },
]

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/** Estilo de control como texto: el elegido va en negrita y subrayado. */
const ESTILO_OPCION = 'min-h-11 border-b-2 pb-0.5 text-footnote lg:min-h-8'

/** Ancho medido del gráfico: el viewBox mide lo mismo que se pinta, y el texto sale a 13 px reales. */
function useAncho(inicial: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [ancho, setAncho] = useState(inicial)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medido = Math.round(el.getBoundingClientRect().width)
    if (medido > 0) setAncho(medido)
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e?.contentRect.width ?? 0)
      if (w > 0) setAncho(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, ancho }
}

function Opciones<T extends string>({ nombre, valor, opciones, onCambio }: {
  nombre: string
  valor: T | null
  opciones: readonly { value: T; label: string }[]
  onCambio: (v: T) => void
}) {
  return (
    <div role="group" aria-label={nombre} className="flex flex-wrap gap-x-5 gap-y-1">
      {opciones.map((o) => {
        const on = valor === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onCambio(o.value)}
            className={cn(ESTILO_OPCION, on ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground')}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const fechaDia = (ms: number) => {
  const d = new Date(ms)
  return `${d.getDate()}-${MES_CORTO[d.getMonth()]}`
}

/**
 * Detalle de una causa elegida (cuerpo sin encabezado): nota, tabla Antes/Ahora,
 * acción del cuadrante y los comentarios más repetidos. Lo arma la lectura para el
 * PC (columna derecha) y para el celular (hoja). Mismos datos que la tarjeta.
 */
function CuerpoDetalleCausa({ punto, calc, turnos, antes, nAhoraT, nAntesT, onVerTodos, onAnalizar }: {
  punto: PuntoJK
  calc: CalculoJK
  turnos: TurnoJK[]
  /** Punto de la causa en el período de comparación; null si no tuvo eventos ahí. */
  antes: PuntoJK | null
  nAhoraT: number
  nAntesT: number
  onVerTodos?: () => void
  onAnalizar?: (causa: string) => void
}) {
  const esSin = punto.k === SIN_IMPUTAR
  const comentarios = esSin ? [] : comentariosDe(turnos, calc.desde, calc.hasta, punto.k, Infinity)
  const grupos = agruparComentarios(comentarios).slice(0, 5)
  const cuadrante = punto.q === 'cro'
    ? (nivelPrioridad(punto, calc.un, calc.um) === 3 ? 'Crónica A' : 'Crónica B')
    : TITULO_CUADRANTE[punto.q]
  const cambios = [
    { rotulo: 'Eventos', antes: antes && nAntesT ? (antes.ev / nAntesT) * 10 : null, ahora: nAhoraT ? (punto.ev / nAhoraT) * 10 : 0, fmt: (x: number) => dec1(x) },
    { rotulo: 'Reparación, min', antes: antes ? antes.mttr : null, ahora: punto.mttr, fmt: (x: number) => dec1(x) },
    { rotulo: 'Detenido, min', antes: antes && nAntesT ? (antes.min / nAntesT) * 10 : null, ahora: nAhoraT ? (punto.min / nAhoraT) * 10 : 0, fmt: (x: number) => dec(x, 0) },
  ]
  return (
    <>
      <p className={cn(LECTURA_NOTA, 'mt-0.5')}>
        {`${cuadrante}. ${punto.ev} ${plural(punto.ev, 'evento', 'eventos')}, ${esSin ? 'duración media' : 'MTTR'} ${dec1(punto.mttr)} min, ${dec1(punto.min / 60)} h en total.`}
      </p>
      <table className={cn('mt-2 w-full border-collapse tabular-nums', LECTURA_CUERPO)}>
        <thead>
          <tr className={LECTURA_NOTA}>
            <th scope="col" className="pb-1 text-left font-normal">Cada 10 turnos</th>
            {antes && <th scope="col" className="pb-1 text-right font-normal">Antes</th>}
            <th scope="col" className="pb-1 text-right font-normal">Ahora</th>
          </tr>
        </thead>
        <tbody>
          {cambios.map((c) => {
            const empeoro = c.antes !== null && sentidoCambio(c.antes, c.ahora) === 'peor'
            return (
              <tr key={c.rotulo} className="border-t border-border">
                <th scope="row" className="py-2 pr-3 text-left font-normal">{c.rotulo}</th>
                {antes && <td className="py-2 text-right">{c.antes !== null ? c.fmt(c.antes) : ''}</td>}
                <td className={cn('py-2 text-right', empeoro && 'text-ink-crit')}>{c.fmt(c.ahora)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className={cn(LECTURA_CUERPO, 'mt-3')}>
        {esSin
          ? 'Sin causa anotada: pedir la imputación al supervisor del turno; hasta entonces no se sabe si es de Mantención.'
          : ACCION_CUADRANTE[punto.q]}
      </p>
      {!esSin && comentarios.length > 0 && (
        <>
          <p className={cn(LECTURA_NOTA, 'mt-3.5')}>{`Lo que anotaron, ${comentarios.length} ${plural(comentarios.length, 'comentario', 'comentarios')}`}</p>
          <FilasLectura
            className="mt-1"
            filas={grupos.map((g) => ({
              rotulo: g.texto,
              valor: (
                <>
                  <span className="font-semibold">{`×${g.n}`}</span> <span className={LECTURA_NOTA}>{fechaDia(g.ultimoMs)}</span>
                </>
              ),
            }))}
          />
        </>
      )}
      {(onAnalizar && !esSin || (onVerTodos && comentarios.length > 0)) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
          {onAnalizar && !esSin && (
            <button type="button" className="min-h-11 rounded-ctl border border-border px-3 text-brand-ink lg:min-h-0 lg:py-1" onClick={() => onAnalizar(punto.k)}>
              Analizar causa raíz
            </button>
          )}
          {onVerTodos && comentarios.length > 0 && (
            <button type="button" className={LECTURA_ENLACE} onClick={onVerTodos}>
              {`Ver los ${comentarios.length}`}
            </button>
          )}
        </div>
      )}
    </>
  )
}

export interface JackKnifeLecturaProps {
  calc: CalculoJK
  turnos: TurnoJK[]
  filas: FilaLecturaJK[]
  /** Tramo de la ventana y de la comparación; null si no hay turnos o no hay comparación. */
  ahora: TramoLectura | null
  antes: TramoLectura | null
  /** Minutos de detención de Mantención por turno, ahora y antes (null sin comparación). */
  minAhora: number
  minAntes: number | null
  fantasmas: PuntoJK[]
  sel: string | null
  elegirCausa: (k: string) => void
  /** Quita la causa elegida: «Cerrar» y cerrar la hoja del celular. */
  onCerrarCausa?: () => void
  /** «Ver los N»: abre «Ver detalle» con la causa elegida. */
  onVerDetalle?: (causa: string) => void
  /** Puntos de la causa en el período de comparación (null sin comparación). */
  antesPts?: readonly PuntoJK[] | null
  anillos?: ReadonlySet<string>
  analisis?: ReadonlyMap<string, ResumenCausaJK>
  onAnalizar?: (causa: string) => void
  preset: VentanaJK | 'libre'
  onPreset: (v: VentanaJK | 'libre') => void
  modoCmp: ModoCmpJK
  onModo: (m: ModoCmpJK) => void
  mesActivo: boolean
  onMes: () => void
  hayPrevia: boolean
  limitesBase: boolean
  onLimites: (v: boolean) => void
  /** Umbrales del período base (true) o recalculados con la ventana (false). */
  umbralesDelBase: boolean
  /** Turnos que no tienen causa cerrada en el período de comparación. */
  desaparecieron: number
  exportable: boolean
  exportando: boolean
  onExportar: (formato: 'pdf' | 'png') => void
}

export function JackKnifeLectura(p: JackKnifeLecturaProps) {
  const { calc } = p
  const esPC = useEsPC()
  /** Celular: la hoja del detalle se oculta al pedir «Ver los N» (la vista pasa a «Ver detalle»). */
  const [hojaOculta, setHojaOculta] = useState(false)
  /** Solo con causa elegida; si la causa ya no está en el cálculo, no hay detalle. */
  const punto = p.sel ? calc.pts.find((x) => x.k === p.sel) ?? null : null
  const antesDeLaCausa = punto && p.antesPts ? p.antesPts.find((x) => x.k === punto.k) ?? null : null
  const elegir = (k: string) => { setHojaOculta(false); p.elegirCausa(k) }
  const verTodos = (k: string) => { setHojaOculta(true); p.onVerDetalle?.(k) }
  const { ref: graficoRef, ancho } = useAncho(640)
  const enAtacar = useMemo(() => new Set(causasAtacar(calc).map((x) => x.k)), [calc])
  const tabla = useMemo(
    () => tablaLectura(p.filas, { cobertura: calc.cob, desaparecieron: p.desaparecieron }),
    [p.filas, calc.cob, p.desaparecieron],
  )
  const bajada = useMemo(() => (p.filas.length ? bajadaLectura(p.filas) : ''), [p.filas])
  const nAgudasCronicas = calc.pts.filter((x) => x.q === 'amb').length
  const resumenCuadrantes = `${nAgudasCronicas} ${plural(nAgudasCronicas, 'causa', 'causas')}. ${
    nAgudasCronicas === 0 ? 'Ninguna cae en agudas y crónicas' : `${nAgudasCronicas === 1 ? 'Cae' : 'Caen'} en agudas y crónicas`
  }. Umbrales ${p.umbralesDelBase ? 'del período base' : 'recalculados con cada ventana'}: ${dec1(calc.un)} eventos y ${dec1(calc.um)} min de MTTR.`
  const colsPC = esPC ? 'grid-cols-[minmax(0,7fr)_minmax(0,5fr)] items-start' : ''
  /* PC: si la causa se eligió desde la tabla (más abajo), el detalle queda fuera de
     la vista; se lleva la vista a él solo cuando no se ve. */
  const gridRef = useRef<HTMLDivElement>(null)
  const causaPC = esPC && punto ? punto.k : null
  useEffect(() => {
    if (!causaPC) return
    const el = gridRef.current?.querySelector<HTMLElement>('[data-testid="jk-detalle"]')
    if (!el || typeof el.scrollIntoView !== 'function') return
    const top = el.getBoundingClientRect().top
    if (top >= 0 && top <= window.innerHeight * 0.6) return
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'start', behavior: reducido ? 'auto' : 'smooth' })
  }, [causaPC])

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <Opciones nombre="Período" valor={p.preset} opciones={PERIODOS} onCambio={p.onPreset} />
        <button
          type="button"
          aria-pressed={p.mesActivo}
          onClick={p.onMes}
          className={cn(ESTILO_OPCION, p.mesActivo ? 'border-foreground font-semibold text-foreground' : 'border-transparent text-muted-foreground')}
        >
          Mes
        </button>
        <Opciones nombre="Comparar con" valor={p.modoCmp} opciones={COMPARACIONES} onCambio={p.onModo} />
        <details className="relative ml-auto">
          <summary className="min-h-11 cursor-pointer list-none rounded-ctl border border-border px-3 py-2 text-footnote text-brand-ink lg:min-h-0">
            Exportar para reunión
          </summary>
          <div className="absolute right-0 z-10 mt-1 flex gap-2 rounded-ctl border border-border bg-card p-2">
            <button type="button" disabled={p.exportando || !p.exportable} onClick={() => p.onExportar('pdf')} className="min-h-11 px-3 text-footnote text-brand-ink disabled:opacity-40 lg:min-h-0">PDF</button>
            <button type="button" disabled={p.exportando || !p.exportable} onClick={() => p.onExportar('png')} className="min-h-11 px-3 text-footnote text-brand-ink disabled:opacity-40 lg:min-h-0">PNG</button>
          </div>
        </details>
      </div>

      <div>
        {p.ahora ? (
          <>
            <p className={LECTURA_NOTA}>{identidadLectura(p.ahora, p.antes)}</p>
            <h1 className={cn(LECTURA_TITULO, 'mt-1.5')}>{titularLectura(p.minAhora, p.minAntes)}</h1>
            {bajada && <p className={cn(LECTURA_CUERPO, 'mt-2')}>{bajada}</p>}
          </>
        ) : (
          <p className={LECTURA_NOTA}>Sin turnos con resumen en este período.</p>
        )}
        {p.hayPrevia && (
          <label className={cn('mt-2 flex min-h-11 items-center gap-2', LECTURA_NOTA)}>
            <input type="checkbox" checked={p.limitesBase} onChange={(e) => p.onLimites(e.target.checked)} />
            Límites del período base
          </label>
        )}
      </div>

      <div ref={gridRef} className={cn('grid gap-x-12 gap-y-6', colsPC)}>
        <SeccionLectura titulo="Dónde está cada causa" testId="jk-grafico">
          <div ref={graficoRef} className="min-w-0">
            <JackKnifeGrafico
              calc={calc}
              ancho={ancho}
              sel={p.sel}
              fantasmas={p.fantasmas}
              elegirCausa={elegir}
              anillos={p.anillos}
              lectura
              enAtacar={enAtacar}
            />
          </div>
          <p className={cn(LECTURA_NOTA, 'mt-1')}>Horizontal: eventos del período. Vertical: MTTR en minutos. La línea gris une con el período anterior.</p>
          <p className={cn(LECTURA_NOTA, 'mt-2')}>{resumenCuadrantes}</p>
        </SeccionLectura>
        {esPC && punto ? (
          <SeccionLectura
            titulo={punto.k}
            extra={<button type="button" className={LECTURA_ENLACE} onClick={() => p.onCerrarCausa?.()}>Cerrar</button>}
            className="border-t-2 border-brand-ink scroll-mt-20"
            testId="jk-detalle"
          >
            <CuerpoDetalleCausa
              punto={punto}
              calc={calc}
              turnos={p.turnos}
              antes={antesDeLaCausa}
              nAhoraT={p.ahora?.turnos ?? 0}
              nAntesT={p.antes?.turnos ?? 0}
              onVerTodos={() => verTodos(punto.k)}
              onAnalizar={p.onAnalizar}
            />
          </SeccionLectura>
        ) : (
          <AtacarAhoraLectura
            calc={calc}
            turnos={p.turnos}
            elegirCausa={elegir}
            analisis={p.analisis}
            onAnalizar={p.onAnalizar}
          />
        )}
        {!esPC && punto && (
          <Sheet
            open={!hojaOculta}
            onClose={() => p.onCerrarCausa?.()}
            title={punto.k}
            headerAction={<button type="button" className={LECTURA_ENLACE} onClick={() => p.onCerrarCausa?.()}>Cerrar</button>}
            surface="grouped"
          >
            <CuerpoDetalleCausa
              punto={punto}
              calc={calc}
              turnos={p.turnos}
              antes={antesDeLaCausa}
              nAhoraT={p.ahora?.turnos ?? 0}
              nAntesT={p.antes?.turnos ?? 0}
              onVerTodos={() => verTodos(punto.k)}
              onAnalizar={p.onAnalizar}
            />
          </Sheet>
        )}
      </div>

      <SeccionLectura titulo="Todas las causas" testId="jk-tabla">
        <table className={cn('w-full border-collapse tabular-nums', LECTURA_CUERPO)}>
          <thead>
            <tr className={LECTURA_NOTA}>
              <th scope="col" className="pb-1.5 pr-3 text-left font-normal">Causa</th>
              <th scope="col" className="pb-1.5 text-right font-normal">Eventos</th>
              {esPC && <th scope="col" className="pb-1.5 text-right font-normal">MTTR, min</th>}
              <th scope="col" className="pb-1.5 text-right font-normal">Horas</th>
              {esPC && <th scope="col" className="pb-1.5 pl-6 text-right font-normal">Frente al anterior</th>}
            </tr>
          </thead>
          <tbody>
            {tabla.grupos.map((g) => (
              <Fragment key={g.q}>
                <tr className="border-t border-border">
                  <th scope="rowgroup" className="pb-1 pt-3 text-left font-semibold">{g.titulo}</th>
                  <td className="pb-1 pt-3 text-right font-semibold">{g.ev}</td>
                  {esPC && <td className="pb-1 pt-3" />}
                  <td className="pb-1 pt-3 text-right font-semibold">{g.horas}</td>
                  {esPC && <td className="pb-1 pt-3" />}
                </tr>
                {g.filas.map((f) => {
                  const on = p.sel === f.causa
                  return (
                    <tr key={f.causa} className={cn('border-t border-border', on && 'bg-muted')}>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => elegir(f.causa)}
                          className={cn('min-h-11 text-left hover:underline lg:min-h-0', on ? 'font-semibold text-foreground' : 'text-foreground')}
                        >
                          {f.causa}
                        </button>
                      </td>
                      <td className="py-2 text-right">{f.ev}</td>
                      {esPC && <td className="py-2 text-right">{dec1(f.mttr)}</td>}
                      <td className="py-2 text-right">{f.horas}</td>
                      {esPC && (
                        <td className={cn('py-2 pl-6 text-right', f.frente === 'empeoró' ? 'text-ink-crit' : 'text-muted-foreground')}>{f.frente}</td>
                      )}
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            <tr className="border-t-[1.5px] border-foreground font-semibold">
              <th scope="row" className="pt-2 text-left font-semibold">Mantención</th>
              <td className="pt-2 text-right">{tabla.ev}</td>
              {esPC && <td className="pt-2" />}
              <td className="pt-2 text-right">{tabla.horas}</td>
              {esPC && <td className="pt-2" />}
            </tr>
          </tbody>
        </table>
        {tabla.nota && <p className={cn(LECTURA_NOTA, 'mt-2')}>{tabla.nota}</p>}
      </SeccionLectura>
    </div>
  )
}
