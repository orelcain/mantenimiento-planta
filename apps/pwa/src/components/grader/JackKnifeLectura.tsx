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
import { LECTURA_CUERPO, LECTURA_NOTA, LECTURA_TITULO, SeccionLectura } from '@/components/piel/Lectura'
import { dec1 } from '@/utils/formatoNumeros'
import type { CalculoJK, ModoCmpJK, PuntoJK, TurnoJK, VentanaJK } from '@/services/shoplogix/jackKnife'
import type { ResumenCausaJK } from '@/services/acr/acrHistorial'
import {
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

      <div className={cn('grid gap-x-12 gap-y-6', colsPC)}>
        <SeccionLectura titulo="Dónde está cada causa" testId="jk-grafico">
          <div ref={graficoRef} className="min-w-0">
            <JackKnifeGrafico
              calc={calc}
              ancho={ancho}
              sel={p.sel}
              fantasmas={p.fantasmas}
              elegirCausa={p.elegirCausa}
              anillos={p.anillos}
              lectura
              enAtacar={enAtacar}
            />
          </div>
          <p className={cn(LECTURA_NOTA, 'mt-1')}>Horizontal: eventos del período. Vertical: MTTR en minutos. La línea gris une con el período anterior.</p>
          <p className={cn(LECTURA_NOTA, 'mt-2')}>{resumenCuadrantes}</p>
        </SeccionLectura>
        <AtacarAhoraLectura
          calc={calc}
          turnos={p.turnos}
          elegirCausa={p.elegirCausa}
          analisis={p.analisis}
          onAnalizar={p.onAnalizar}
        />
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
                    <tr key={f.causa} className="border-t border-border">
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => p.elegirCausa(f.causa)}
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
