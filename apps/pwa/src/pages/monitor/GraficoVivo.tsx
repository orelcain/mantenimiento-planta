/**
 * «Piezas por minuto» de Grader en vivo (mockup v4, versión 5): grader y Baader por minuto arriba, P0 por dueño
 * abajo, con zoom. Las cuentas viven en `graficoVivoDatos.ts`; aquí van los controles, el tema y ECharts.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type ReactEChartsCore from 'echarts-for-react'
import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { horaDelEje } from '@/services/grader/espejo/alertasGrader'
import { RETRASO_REFERENCIA_FUENTE } from '@/services/grader/espejo/graderVivo'
import { Tarjeta } from './TarjetaVivo'
import {
  GEOM,
  datosGrafico,
  largoVentana,
  limitarVentana,
  modoP0,
  opcionGrafico,
  seguirVentana,
  ventanaInicial,
  type FiltroDueno,
  type TemaGrafico,
  type Ventana,
} from './graficoVivoDatos'
import { PIEZAS_PARA_DECIR_SIN_GATE0, type DatosGraderVivo } from './graderVivoDatos'

const IC = 'h-3.5 w-3.5'

/** Tokens del contenedor (dentro de `.v2-vars`) resueltos a `rgb()`: el canvas no entiende `var(--…)`. */
function leerTema(el: HTMLElement): TemaGrafico {
  const sonda = document.createElement('span')
  sonda.style.display = 'none'
  el.appendChild(sonda)
  const color = (css: string) => {
    sonda.style.color = ''
    sonda.style.color = css
    return getComputedStyle(sonda).color || '#888'
  }
  const t: TemaGrafico = {
    acento: color('var(--v2-acento)'),
    gris: color('var(--v2-gris)'),
    mant: color('var(--v2-mant)'),
    ext: color('var(--v2-ext)'),
    reja: color('var(--v2-reja)'),
    mal: color('var(--v2-mal)'),
    texto: color('rgb(var(--foreground))'),
    textoSuave: color('rgb(var(--muted-foreground))'),
    fondo: color('rgb(var(--card))'),
  }
  sonda.remove()
  return t
}

function useTemaYAncho(): [React.RefObject<HTMLDivElement>, TemaGrafico | null, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [tema, setTema] = useState<TemaGrafico | null>(null)
  const [ancho, setAncho] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setAncho(Math.round(el.getBoundingClientRect().width))
    medir()
    setTema(leerTema(el))
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null
    ro?.observe(el)
    // Claro ↔ oscuro: la clase `dark` del documento cambia los tokens.
    const mo = new MutationObserver(() => setTema(leerTema(el)))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-glass'] })
    return () => { ro?.disconnect(); mo.disconnect() }
  }, [])
  return [ref, tema, ancho]
}

const BOTON = 'tap-44 h-9 min-w-[44px] rounded-full border border-border/60 px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Segmento({ valor, onCambio }: { valor: FiltroDueno; onCambio: (f: FiltroDueno) => void }) {
  const op: Array<[FiltroDueno, string]> = [['', 'Todo'], ['mant', 'Mantención'], ['seteo', 'Seteo']]
  return (
    <div role="group" aria-label="Resaltar P0 de" className="inline-grid grid-flow-col gap-0.5 rounded-full p-0.5" style={{ background: 'var(--v2-reja)' }}>
      {op.map(([k, r]) => (
        <button
          key={k || 'todo'}
          type="button"
          aria-pressed={valor === k}
          onClick={() => onCambio(k)}
          className={cn('tap-44 h-8 rounded-full px-3 text-[13px] font-semibold', valor === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

export function GraficoVivo({ d, onAbrirTramo, onAbrirMinuto }: { d: DatosGraderVivo; onAbrirTramo?: (desdeMin: number) => void; onAbrirMinuto?: (min: number) => void }) {
  const g = useMemo(() => datosGrafico(d), [d])
  const [ref, tema, ancho] = useTemaYAncho()
  const [filtro, setFiltro] = useState<FiltroDueno>('')
  const [ventana, setVentana] = useState<Ventana | null>(null)
  const hastaAntes = useRef(g.hasta)
  const chart = useRef<ReactEChartsCore>(null)

  // Primera ventana cuando ya se sabe el ancho; después, si estaba pegada al final, sigue al dato.
  useEffect(() => {
    if (ancho <= 0) return
    setVentana((v) => (v ? seguirVentana(v, hastaAntes.current, g.hasta) : ventanaInicial(g.hasta, ancho < 480)))
    hastaAntes.current = g.hasta
  }, [g.hasta, ancho])

  const v = ventana ?? ventanaInicial(g.hasta, ancho < 480)
  const opcion = useMemo(() => (tema && ancho > 0 ? opcionGrafico(g, v, filtro, tema, ancho) : null), [g, v.a, v.b, filtro, tema, ancho]) // eslint-disable-line react-hooks/exhaustive-deps

  const fijar = useCallback((nv: Ventana) => setVentana(limitarVentana(nv, g.hasta)), [g.hasta])
  const zoom = (f: number) => {
    const c = (v.a + v.b) / 2
    const len = (v.b - v.a) * f
    fijar({ a: c - len / 2, b: c + len / 2 })
  }
  const onZoom = useCallback(() => {
    const inst = chart.current?.getEchartsInstance()
    const dz = (inst?.getOption() as { dataZoom?: Array<{ startValue?: number; endValue?: number }> } | undefined)?.dataZoom?.[0]
    if (dz && dz.startValue != null && dz.endValue != null) fijar({ a: dz.startValue, b: dz.endValue })
  }, [fijar])
  const onClic = useCallback((p: { seriesId?: string; value?: number[] }) => {
    if (p.seriesId !== 'p0' || !p.value) return
    const x0 = p.value[0]!
    if (p.value[1]! - x0 > 1) onAbrirTramo?.(x0)
    else onAbrirMinuto?.(x0)
  }, [onAbrirTramo, onAbrirMinuto])

  const angosto = ancho > 0 && ancho < 480
  const alto = GEOM.arriba + (angosto ? GEOM.alto1Angosto : GEOM.alto1) + GEOM.hueco + GEOM.alto2 + 24 + GEOM.slider + 8
  const sub = d.retraso.medido
    ? `Baader corridas ${g.retraso} min: lo que tarda una pieza en llegar al grader, medido en este turno (las curvas coinciden ${(d.retraso.r ?? 0) >= 0.8 ? 'bien' : 'a medias'}).`
    : `Baader corridas ${g.retraso} min: lo que tarda una pieza en llegar al grader, según la ${RETRASO_REFERENCIA_FUENTE}.`
  const conDueno = g.porPieza !== null

  return (
    <Tarjeta titulo="Piezas por minuto" sub={sub} icono={<Activity className={IC} />}>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {conDueno && <Segmento valor={filtro} onCambio={setFiltro} />}
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={BOTON} aria-label="Alejar" onClick={() => zoom(1.6)}>−</button>
          <button type="button" className={BOTON} aria-label="Acercar" onClick={() => zoom(0.6)}>+</button>
          <button type="button" className={BOTON} onClick={() => fijar({ a: g.hasta - 60, b: g.hasta })}>Última hora</button>
          <button type="button" className={BOTON} onClick={() => fijar({ a: 0, b: g.hasta })}>Todo el turno</button>
        </div>
      </div>
      <p className="mt-2 text-[13px] leading-[18px] text-muted-foreground tabular-nums" aria-live="polite" data-testid="rango-grafico">
        {horaDelEje(g.t0Ms, v.a)}–{horaDelEje(g.t0Ms, v.b)} · {largoVentana(v.b - v.a)} · {modoP0(v) === '15' ? 'P0 cada 15 min' : 'P0 por minuto'}
      </p>
      <div ref={ref} className="mt-1 w-full" style={{ height: alto }}>
        {opcion && (
          <ReactECharts
            ref={chart}
            option={opcion}
            notMerge
            lazyUpdate
            style={{ height: alto, width: '100%' }}
            opts={{ renderer: 'canvas' }}
            onEvents={{ datazoom: onZoom, click: onClic }}
          />
        )}
      </div>
      {g.sinP0 && (
        <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
          {d.totales.piezas >= PIEZAS_PARA_DECIR_SIN_GATE0 ? 'P0 llega con Puerta 0: este informe no trae piezas de Gate 0.' : 'Sin rechazos todavía.'}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] leading-[18px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[3px] w-4 rounded-full" style={{ background: 'var(--v2-acento)' }} />Grader</span>
        <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-[2px] w-4 rounded-full" style={{ background: 'var(--v2-gris)' }} />Baader</span>
        {conDueno ? (
          <>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--v2-mant)' }} />P0 Mantención</span>
            <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-2.5 rounded-[2px]" style={{ background: 'var(--v2-ext)' }} />P0 Seteo</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-2.5 rounded-[2px] opacity-60" style={{ background: 'var(--v2-acento)' }} />P0</span>
        )}
        {g.huecos.length > 0 && <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2.5 w-3.5 border border-dashed" style={{ background: 'var(--v2-reja)', borderColor: 'var(--v2-gris)' }} />Sin lectura</span>}
      </div>
      <details className="mt-2 text-[13px] leading-[18px] text-muted-foreground">
        <summary className="cursor-pointer select-none">Cómo se usa</summary>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Rueda para acercar y arrastrar para mover; la barra de abajo recorre el turno. En el celular, la barra y los botones.</li>
          <li>«Todo · Mantención · Seteo» resalta el P0 de ese dueño y atenúa el resto.</li>
          <li>Con más de 60 min a la vista, el P0 va en barras de 15 min en % con la raya de 3,5 % (la alerta «P0 alto»). Al acercar, barras por minuto en piezas.</li>
          <li>Tramos grises: sin lectura del espejo o menos de 50 piezas. En el celular arranca en la última hora.</li>
        </ul>
      </details>
    </Tarjeta>
  )
}
